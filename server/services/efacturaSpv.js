// ============================================================
//  e-Factura: automatikus beküldés az ANAF-hoz (RO e-Factura, SPV)
//
//  A szabály (2026):
//    - Minden kiállított számlát – cégnek, PFA-nak (B2B) ÉS magánszemélynek
//      (B2C) is – fel kell tölteni az ANAF e-Factura rendszerébe, a
//      kiállítástól számított 5 MUNKANAPON belül (OUG 120/2021, OUG 89/2025).
//    - Magánszemélynél CNP nélkül a vevő azonosítója 13 db 0 (efactura.js).
//    - A hivatalos (eredeti) számla az ANAF által elfogadott XML; az ANAF
//      digitális aláírásával együtt (a letöltött ZIP) kell megőrizni 5 évig.
//    - Az ANAF a válaszokat 60 napig tartja – ezért mentjük le magunknak.
//
//  Hogyan működik:
//    1) Kapcsolat (egyszer): az ANAF-nál regisztrált alkalmazás (client_id,
//       client_secret – Admin → Pénzügy → e-Factura, vagy ANAF_CLIENT_ID /
//       ANAF_CLIENT_SECRET a szerveren), majd „Csatlakozás” – a böngésző az
//       ANAF-hoz visz, ott a minősített tanúsítvánnyal (USB token) belépsz,
//       és visszajössz. A tokent az app magától frissíti (90 / 365 nap).
//    2) Feltöltés: upload (B2B) / uploadb2c (magánszemély) → index_incarcare
//    3) Állapot: stareMesaj → ok / nok / in prelucrare → id_descarcare
//    4) Letöltés: descarcare → ZIP (a számla XML + az ANAF aláírása) – az
//       Irattárban a számla mellett.
//    5) Beérkező számlák (amiket mások állítottak ki nekünk): listaMesaje-
//       Factura → letöltés → Irattár / Bejövő számlák (ha be van kapcsolva).
//
//  Időzítés: 30 percenként (server.js) és a cron-hívásnál (routes/cron.js).
//  Az automatikus feltöltés alapból KI – Admin → Pénzügy → e-Factura.
// ============================================================

const crypto = require("crypto");
const db = require("../db/database");
const pu = require("./penzugy");
const efactura = require("./efactura");
const oldalAdatok = require("./oldalAdatok");
const munkanap = require("../lib/munkanap");
const zip = require("../lib/zip");

const OAUTH = "https://logincert.anaf.ro/anaf-oauth2/v1";
const API = mod => `https://api.anaf.ro/${mod === "test" ? "test" : "prod"}/FCTEL/rest`;
const KULCS = "efactura_spv";
const HATARIDO_NAP = 5;

function hibaKod(kod, reszlet) {
    const e = new Error(reszlet || kod);
    e.kod = kod;
    if (reszlet) e.reszlet = reszlet;
    return e;
}

// ---------- tárolt adatok (a böngészőbe soha nem mennek ki) ----------

let tarolt = {};
let toltve = 0;

async function tolt(friss) {
    if (!friss && Date.now() - toltve < 20 * 1000) return tarolt;
    try {
        const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = $1", [KULCS]);
        tarolt = r.rows[0] && r.rows[0].ertek ? JSON.parse(r.rows[0].ertek) : {};
    } catch (e) { tarolt = {}; }
    toltve = Date.now();
    return tarolt;
}

async function ment(uj) {
    await tolt(true);
    tarolt = { ...tarolt, ...uj };
    await db.query(
        `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`,
        [KULCS, JSON.stringify(tarolt)]);
    toltve = Date.now();
}

const envId = () => (process.env.ANAF_CLIENT_ID || "").trim();
const envTitok = () => (process.env.ANAF_CLIENT_SECRET || "").trim();
const clientId = () => envId() || (tarolt.client_id || "").trim();
const clientTitok = () => envTitok() || (tarolt.client_secret || "").trim();

function redirectUri(alapCim) {
    if (process.env.ANAF_REDIRECT_URI) return process.env.ANAF_REDIRECT_URI.trim();
    return (alapCim || "").replace(/\/+$/, "") + "/api/admin/efactura/callback";
}

const adoszam = s => String(s || "").toUpperCase().replace(/\s/g, "").replace(/^RO/, "");

async function eladoCif() {
    const u = await oldalAdatok.nyilvanos();
    return adoszam(u.adoszam);
}

// ---------- határidő ----------

function hatarido(s) {
    return s && s.kiallitva ? munkanap.hozzaad(pu.pgDatum(s.kiallitva), HATARIDO_NAP) : null;
}

// Egy számla e-Factura állapota a listákhoz:
//   kell      (kell-e egyáltalán: kiállított számla, nem díjbekérő / piszkozat)
//   allapot   null | feldolgozas | ok | nok | hiba | kezi
//   hatarido  YYYY-MM-DD, hatra (munkanap; negatív = lejárt)
function szamlaInfo(s, ma) {
    const kell = s.tipus === "szamla" && s.statusz !== "piszkozat";
    const h = kell ? hatarido(s) : null;
    const kesz = ["ok", "kezi"].includes(s.efactura_allapot);
    return {
        kell,
        allapot: s.efactura_allapot || null,
        index: s.efactura_index || null,
        letoltes: s.efactura_letoltes || null,
        kuldve: s.efactura_kuldve || null,
        hiba: s.efactura_hiba || null,
        b2c: s.efactura_b2c === null || s.efactura_b2c === undefined ? null : !!s.efactura_b2c,
        hatarido: h,
        hatra: kell && !kesz && h ? munkanap.hatraVan(h, ma || pu.ma()) : null,
        zip: !!s.efactura_zip_van
    };
}

// ---------- OAuth ----------

async function allapot(alapCim) {
    await tolt();
    const be = await pu.beallitas();
    const sz = await szamlalok().catch(() => ({}));
    return {
        kulcs_forras: envId() ? "szerver" : tarolt.client_id ? "admin" : null,
        client_id_vege: clientId() ? clientId().slice(-4) : null,
        van_titok: !!clientTitok(),
        kapcsolva: !!tarolt.refresh_token,
        kapcsolva_at: tarolt.kapcsolva_at || null,
        token_lejar: tarolt.lejar ? new Date(tarolt.lejar).toISOString() : null,
        frissites_lejar: tarolt.refresh_lejar ? new Date(tarolt.refresh_lejar).toISOString() : null,
        mod: be.efactura_mod === "test" ? "test" : "prod",
        auto: !!be.efactura_auto,
        kezdet: be.efactura_kezdet || null,
        bejovo: be.efactura_bejovo !== false,
        bejovo_kiadas: be.efactura_bejovo_kiadas !== false,
        redirect_uri: redirectUri(alapCim),
        cif: await eladoCif(),
        utolso_futas: tarolt.utolso_futas || null,
        utolso_hiba: tarolt.utolso_hiba || null,
        bejovo_utolso: tarolt.bejovo_utolso || null,
        szamok: sz
    };
}

async function kulcsMent({ client_id, client_secret } = {}) {
    const id = String(client_id || "").trim();
    const t = String(client_secret || "").trim();
    if (!/^[A-Za-z0-9._-]{8,200}$/.test(id)) throw hibaKod("bad_client_id");
    if (t && !/^[A-Za-z0-9._~+\/=-]{8,300}$/.test(t)) throw hibaKod("bad_client_secret");
    await tolt(true);
    const uj = { client_id: id };
    if (t) uj.client_secret = t;
    // más alkalmazás: a régi tokenek nem jók hozzá
    if (tarolt.client_id && tarolt.client_id !== id) Object.assign(uj, { access_token: null, refresh_token: null, lejar: null, refresh_lejar: null });
    await ment(uj);
    return { client_id_vege: id.slice(-4) };
}

async function kulcsTorol() {
    await ment({ client_id: null, client_secret: null, access_token: null, refresh_token: null, lejar: null, refresh_lejar: null, kapcsolva_at: null });
}

async function lecsatol() {
    await ment({ access_token: null, refresh_token: null, lejar: null, refresh_lejar: null, kapcsolva_at: null });
}

// A „Csatlakozás” gomb: az ANAF belépő oldala (a tanúsítvánnyal)
async function authUrl(alapCim) {
    await tolt(true);
    if (!clientId() || !clientTitok()) throw hibaKod("efactura_no_app");
    const state = crypto.randomBytes(18).toString("hex");
    await ment({ state, state_ido: Date.now(), state_redirect: redirectUri(alapCim) });
    const p = new URLSearchParams({
        response_type: "code", client_id: clientId(), redirect_uri: redirectUri(alapCim), token_content_type: "jwt", state
    });
    return `${OAUTH}/authorize?${p.toString()}`;
}

async function tokenKeres(parameterek) {
    const body = new URLSearchParams({ ...parameterek, token_content_type: "jwt" });
    const res = await fetch(`${OAUTH}/token`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Basic " + Buffer.from(`${clientId()}:${clientTitok()}`).toString("base64")
        },
        body,
        signal: AbortSignal.timeout(30000)
    });
    const szoveg = await res.text();
    let j = {};
    try { j = JSON.parse(szoveg); } catch (e) { /* nem JSON */ }
    if (!res.ok || !j.access_token) throw hibaKod("efactura_token", (j.error_description || j.error || szoveg || ("HTTP " + res.status)).slice(0, 300));
    return j;
}

async function tokenMent(j) {
    const most = Date.now();
    await ment({
        access_token: j.access_token,
        refresh_token: j.refresh_token || tarolt.refresh_token,
        lejar: most + (Number(j.expires_in) || 90 * 86400) * 1000,
        // a frissítő token 365 napig él (az ANAF nem mindig küldi a lejáratát)
        refresh_lejar: j.refresh_token ? most + 365 * 86400 * 1000 : tarolt.refresh_lejar,
        utolso_hiba: null
    });
}

async function callback(code, state) {
    await tolt(true);
    if (!state || !tarolt.state || state !== tarolt.state || Date.now() - (tarolt.state_ido || 0) > 30 * 60 * 1000) throw hibaKod("efactura_bad_state");
    const redirect = tarolt.state_redirect;
    await ment({ state: null, state_ido: null });
    const j = await tokenKeres({ grant_type: "authorization_code", code: String(code || ""), redirect_uri: redirect, client_id: clientId() });
    await tokenMent(j);
    await ment({ kapcsolva_at: new Date().toISOString() });
}

// Érvényes hozzáférési token (szükség esetén frissítve – 7 nappal a lejárat előtt)
async function token() {
    await tolt();
    if (!tarolt.refresh_token && !tarolt.access_token) throw hibaKod("efactura_not_connected");
    if (tarolt.access_token && tarolt.lejar && tarolt.lejar - Date.now() > 7 * 86400 * 1000) return tarolt.access_token;
    if (!tarolt.refresh_token) throw hibaKod("efactura_not_connected");
    try {
        const j = await tokenKeres({ grant_type: "refresh_token", refresh_token: tarolt.refresh_token, client_id: clientId() });
        await tokenMent(j);
        return j.access_token;
    } catch (e) {
        // ha még él a régi, azzal megy tovább
        if (tarolt.access_token && tarolt.lejar > Date.now()) return tarolt.access_token;
        await ment({ utolso_hiba: "token: " + (e.reszlet || e.message) });
        throw hibaKod("efactura_not_connected", e.reszlet || e.message);
    }
}

// ---------- ANAF API ----------

async function api(ut, { method = "GET", body = null, valasz = "text" } = {}) {
    const be = await pu.beallitas();
    const t = await token();
    const res = await fetch(`${API(be.efactura_mod)}/${ut}`, {
        method,
        headers: { Authorization: "Bearer " + t, ...(body ? { "Content-Type": "text/plain" } : {}) },
        body,
        signal: AbortSignal.timeout(60000)
    });
    if (res.status === 401 || res.status === 403) {
        await ment({ utolso_hiba: "ANAF HTTP " + res.status });
        throw hibaKod("efactura_not_connected", "ANAF HTTP " + res.status);
    }
    if (valasz === "buffer") {
        const buf = Buffer.from(await res.arrayBuffer());
        return { ok: res.ok, status: res.status, buf, tipus: res.headers.get("content-type") || "" };
    }
    return { ok: res.ok, status: res.status, szoveg: await res.text() };
}

// XML-attribútum vagy JSON-mező kiolvasása a válaszból
function attr(szoveg, nev) {
    const m = String(szoveg || "").match(new RegExp(`${nev}\\s*=\\s*"([^"]*)"`, "i"));
    if (m) return m[1];
    try { const j = JSON.parse(szoveg); if (j && j[nev] !== undefined) return String(j[nev]); } catch (e) { /* nem JSON */ }
    return null;
}

function hibak(szoveg) {
    const s = String(szoveg || "");
    const out = [];
    s.replace(/errorMessage\s*=\s*"([^"]*)"/gi, (m, h) => { out.push(h); return m; });
    try {
        const j = JSON.parse(s);
        (j.Errors || j.errors || []).forEach(e => out.push(e.errorMessage || e.message || JSON.stringify(e)));
        if (j.eroare) out.push(j.eroare);
    } catch (e) { /* nem JSON */ }
    if (!out.length && /<Error|<eroare/i.test(s)) out.push(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500));
    return out;
}

// Magánszemély (CNP / adószám nélkül) → B2C feltöltés
function b2cE(s) {
    const v = s.vevo || {};
    const cui = adoszam(v.cui);
    return !cui || /^\d{13}$/.test(cui) && v.tipus === "maganszemely";
}

// ---------- egy számla beküldése ----------

async function kuld(id, { kezi = false } = {}) {
    const s = await pu.szamla(id);
    if (!s) throw hibaKod("not_found");
    if (s.tipus !== "szamla") throw hibaKod("efactura_not_invoice");
    if (s.statusz === "piszkozat") throw hibaKod("efactura_draft");
    // elfogadott / feldolgozás alatt lévő számla nem mehet újra (az ANAF duplikátumnak venné);
    // a kézzel feltöltöttnek jelölt csak kifejezett kérésre
    if (["feldolgozas", "ok"].includes(s.efactura_allapot)) throw hibaKod("efactura_already_sent");
    if (s.efactura_allapot === "kezi" && !kezi) throw hibaKod("efactura_already_sent");

    const h = await efactura.hianyok(s);
    if (h.length) {
        const szoveg = h.map(k => efactura.HIANY_SZOVEG[k] || k).join("; ");
        await db.query("UPDATE penzugy_szamlak SET efactura_allapot = 'hiba', efactura_hiba = $2 WHERE id = $1", [s.id, szoveg]);
        throw hibaKod("efactura_missing", szoveg);
    }

    const cif = await eladoCif();
    const b2c = b2cE(s);
    const xml = await efactura.xml(s);
    const r = await api(`${b2c ? "uploadb2c" : "upload"}?standard=UBL&cif=${encodeURIComponent(cif)}`, { method: "POST", body: xml });
    const index = attr(r.szoveg, "index_incarcare");
    const status = attr(r.szoveg, "ExecutionStatus");

    if (!r.ok || !index || (status !== null && status !== "0")) {
        const h2 = hibak(r.szoveg);
        const szoveg = (h2.length ? h2.join("; ") : ("ANAF HTTP " + r.status)).slice(0, 1000);
        await db.query("UPDATE penzugy_szamlak SET efactura_allapot = 'hiba', efactura_hiba = $2, efactura_b2c = $3 WHERE id = $1", [s.id, szoveg, b2c]);
        throw hibaKod("efactura_upload", szoveg);
    }

    await db.query(`UPDATE penzugy_szamlak SET efactura_allapot = 'feldolgozas', efactura_index = $2, efactura_kuldve = NOW(),
                        efactura_hiba = NULL, efactura_letoltes = NULL, efactura_b2c = $3 WHERE id = $1`, [s.id, index, b2c]);
    return { index, b2c };
}

// ---------- állapot + letöltés ----------

async function frissit(id) {
    const r = await db.query("SELECT id, sorszam, efactura_allapot, efactura_index, efactura_letoltes FROM penzugy_szamlak WHERE id = $1", [id]);
    const s = r.rows[0];
    if (!s || !s.efactura_index) throw hibaKod("efactura_not_sent");

    if (!s.efactura_letoltes) {
        const v = await api(`stareMesaj?id_incarcare=${encodeURIComponent(s.efactura_index)}`);
        const stare = (attr(v.szoveg, "stare") || "").toLowerCase();
        const letoltes = attr(v.szoveg, "id_descarcare");
        if (!stare || stare.includes("prelucrare")) return { allapot: "feldolgozas" };
        if (stare === "ok" || stare === "nok") {
            await db.query("UPDATE penzugy_szamlak SET efactura_letoltes = $2, efactura_valasz_at = NOW() WHERE id = $1", [s.id, letoltes]);
            s.efactura_letoltes = letoltes;
            s.efactura_allapot = stare;
            if (!letoltes) {
                await db.query("UPDATE penzugy_szamlak SET efactura_allapot = $2 WHERE id = $1", [s.id, stare]);
                return { allapot: stare };
            }
        } else {
            // „XML cu erori nepreluat de sistem” és társai
            const szoveg = [stare, ...hibak(v.szoveg)].filter(Boolean).join("; ").slice(0, 1000);
            await db.query("UPDATE penzugy_szamlak SET efactura_allapot = 'nok', efactura_hiba = $2, efactura_valasz_at = NOW() WHERE id = $1", [s.id, szoveg]);
            return { allapot: "nok", hiba: szoveg };
        }
    }

    // a válasz ZIP: elfogadásnál a számla + az ANAF aláírása, elutasításnál a hibák
    const d = await api(`descarcare?id=${encodeURIComponent(s.efactura_letoltes)}`, { valasz: "buffer" });
    if (!d.ok || d.buf.subarray(0, 2).toString("latin1") !== "PK") {
        return { allapot: s.efactura_allapot === "nok" ? "nok" : "feldolgozas", hiba: "ANAF: a válasz még nem tölthető le" };
    }
    const fajlok = zip.kibont(d.buf);
    const elutasitva = fajlok.some(f => /eroare|error/i.test(f.nev) || /<Error\b|errorMessage=/i.test(f.adat.toString("utf8").slice(0, 3000)))
        && !fajlok.some(f => /<(\w+:)?Invoice\b/.test(f.adat.toString("utf8").slice(0, 2000)));
    const allapotUj = elutasitva || s.efactura_allapot === "nok" ? "nok" : "ok";
    let hibaSzoveg = null;
    if (allapotUj === "nok") {
        hibaSzoveg = fajlok.map(f => hibak(f.adat.toString("utf8")).join("; ")).filter(Boolean).join("; ").slice(0, 1000) || "ANAF: elutasítva";
    }
    await db.query(`INSERT INTO efactura_valaszok (szamla_id, letoltes_id, zip, allapot) VALUES ($1, $2, $3, $4)
                    ON CONFLICT (szamla_id) DO UPDATE SET letoltes_id = EXCLUDED.letoltes_id, zip = EXCLUDED.zip, allapot = EXCLUDED.allapot, created_at = NOW()`,
        [s.id, s.efactura_letoltes, d.buf, allapotUj]);
    await db.query("UPDATE penzugy_szamlak SET efactura_allapot = $2, efactura_hiba = $3, efactura_valasz_at = NOW() WHERE id = $1", [s.id, allapotUj, hibaSzoveg]);
    return { allapot: allapotUj, hiba: hibaSzoveg };
}

// Kézzel (az SPV-ben) feltöltött számla jelölése – index nélkül is
async function keziJelol(id, index) {
    const r = await db.query(`UPDATE penzugy_szamlak SET efactura_allapot = 'kezi', efactura_index = COALESCE(NULLIF($2, ''), efactura_index),
                                  efactura_kuldve = COALESCE(efactura_kuldve, NOW()), efactura_hiba = NULL
                              WHERE id = $1 AND tipus = 'szamla' RETURNING id`, [id, String(index || "").replace(/\D/g, "").slice(0, 20)]);
    if (!r.rowCount) throw hibaKod("not_found");
    // ha van index és kapcsolat, az ANAF-tól is lekérjük az aláírt példányt
    if (index && tarolt.refresh_token) {
        await db.query("UPDATE penzugy_szamlak SET efactura_allapot = 'feldolgozas' WHERE id = $1", [id]);
        try { return await frissit(id); } catch (e) {
            await db.query("UPDATE penzugy_szamlak SET efactura_allapot = 'kezi' WHERE id = $1", [id]);
        }
    }
    return { allapot: "kezi" };
}

// ---------- a vevő adatainak kiegészítése (az ANAF-hoz hiányzó adatok) ----------
//  Kiállított, de az ANAF-hoz még el nem küldött számlán a vevő adatai
//  kiegészíthetők (pl. település, megye) – a tételek, összegek nem változnak.
//  ugyfelIs: az ügyfél adatainál is (a következő számlákhoz)

async function hianyLista(id) {
    const s = await pu.szamla(id);
    if (!s) throw hibaKod("not_found");
    const h = await efactura.hianyok(s);
    return { hianyok: h.map(k => ({ kod: k, szoveg: efactura.HIANY_SZOVEG[k] || k })), vevo: s.vevo || {}, ugyfel_id: s.ugyfel_id };
}

async function vevoJavit(id, b = {}, { ugyfelIs = false } = {}) {
    const s = await pu.szamla(id);
    if (!s) throw hibaKod("not_found");
    if (["feldolgozas", "ok", "kezi"].includes(s.efactura_allapot)) throw hibaKod("efactura_already_sent");
    const t = (v, n) => { const x = String(v ?? "").trim(); return x ? x.slice(0, n) : null; };
    const tipus = ["maganszemely", "pfa", "ceg"].includes(b.tipus) ? b.tipus : ((s.vevo && s.vevo.tipus) || "maganszemely");
    const orszag = /^[A-Za-z]{2}$/.test(String(b.orszag || "").trim()) ? String(b.orszag).trim().toUpperCase() : "RO";
    const v = {
        ...(s.vevo || {}),
        tipus,
        nev: t(b.nev, 200) || (s.vevo && s.vevo.nev) || s.ugyfel_nev,
        cui: (t(b.cui, 20) || "").toUpperCase().replace(/^RO/, "").replace(/\s/g, "") || null,
        reg_com: tipus === "maganszemely" ? null : t(b.reg_com, 40),
        cim: t(b.cim, 400),
        varos: t(b.varos, 80),
        megye: orszag === "RO" ? (efactura.megyeKod(b.megye) || null) : null,
        orszag,
        afa: tipus !== "maganszemely" && !!b.afa,
        email: t(b.email, 160) || (s.vevo && s.vevo.email) || null,
        telefon: t(b.telefon, 40) || (s.vevo && s.vevo.telefon) || null
    };
    if (!v.nev) throw hibaKod("missing_name");
    if (!v.cim) throw hibaKod("missing_address");
    if (!v.varos) throw hibaKod("missing_city");
    if (orszag === "RO" && !v.megye) throw hibaKod("missing_county");
    if (v.megye === "RO-B") {
        const m = `${v.varos} ${v.cim}`.match(/sector(?:ul)?\s*([1-6])\b/i);
        if (!m) throw hibaKod("bad_sector");
        v.varos = "Sector " + m[1];
    }
    if (tipus !== "maganszemely" && !/^\d{2,10}$/.test(v.cui || "")) throw hibaKod("bad_cui");
    if (tipus === "maganszemely" && v.cui && !/^\d{13}$/.test(v.cui)) throw hibaKod("bad_cnp");

    await db.query(`UPDATE penzugy_szamlak SET vevo = $2::jsonb, efactura_hiba = NULL,
                        efactura_allapot = CASE WHEN efactura_allapot = 'hiba' THEN NULL ELSE efactura_allapot END, updated_at = NOW()
                    WHERE id = $1`, [s.id, JSON.stringify(v)]);
    if (ugyfelIs && s.ugyfel_id) {
        await db.query(`UPDATE penzugy_ugyfelek SET tipus = $2, nev = $3, cui = $4, reg_com = $5, cim = $6, varos = $7, megye = $8, orszag = $9,
                            afa_alany = $10, email = COALESCE($11, email), telefon = COALESCE($12, telefon), updated_at = NOW() WHERE id = $1`,
            [s.ugyfel_id, v.tipus, v.nev, v.cui, v.reg_com, v.cim, v.varos, v.megye, v.orszag, v.afa, v.email, v.telefon]);
    }
    return hianyLista(s.id);
}

async function valaszZip(id) {
    const r = await db.query("SELECT v.zip, s.sorszam FROM efactura_valaszok v JOIN penzugy_szamlak s ON s.id = v.szamla_id WHERE v.szamla_id = $1", [id]);
    return r.rows[0] || null;
}

// ---------- beérkező számlák (amiket nekünk állítottak ki) ----------

function xmlErtek(xml, ut) {
    // egyszerű kiolvasás: az első <prefix:Tag>…</prefix:Tag> a megadott szülőn belül
    let resz = xml;
    for (const tag of ut.slice(0, -1)) {
        const m = resz.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`));
        if (!m) return null;
        resz = m[1];
    }
    const vegso = ut[ut.length - 1];
    const m = resz.match(new RegExp(`<(?:\\w+:)?${vegso}\\b[^>]*>([^<]*)</(?:\\w+:)?${vegso}>`));
    return m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim() : null;
}

function szamlaXmlBol(fajlok) {
    const f = fajlok.find(x => !/semnatura/i.test(x.nev) && /<(\w+:)?(Invoice|CreditNote)\b/.test(x.adat.toString("utf8").slice(0, 3000)));
    return f ? f.adat.toString("utf8") : null;
}

function bejovoAdat(xml) {
    if (!xml) return {};
    const osszeg = xmlErtek(xml, ["LegalMonetaryTotal", "PayableAmount"]) || xmlErtek(xml, ["LegalMonetaryTotal", "TaxInclusiveAmount"]);
    const penznem = xmlErtek(xml, ["DocumentCurrencyCode"]);
    return {
        szam: xmlErtek(xml, ["ID"]),
        datum: xmlErtek(xml, ["IssueDate"]),
        partner: xmlErtek(xml, ["AccountingSupplierParty", "PartyLegalEntity", "RegistrationName"])
            || xmlErtek(xml, ["AccountingSupplierParty", "PartyName", "Name"]),
        partner_cui: xmlErtek(xml, ["AccountingSupplierParty", "PartyTaxScheme", "CompanyID"])
            || xmlErtek(xml, ["AccountingSupplierParty", "PartyLegalEntity", "CompanyID"]),
        osszeg: osszeg !== null && osszeg !== "" && Number.isFinite(Number(osszeg)) ? Number(osszeg) : null,
        penznem: ["RON", "EUR", "HUF", "USD"].includes(penznem) ? penznem : "RON",
        afa: Number(xmlErtek(xml, ["TaxTotal", "TaxAmount"])) || 0,
        tetel: xmlErtek(xml, ["InvoiceLine", "Item", "Name"])
    };
}

async function bejovok({ napok = 60 } = {}) {
    const cif = await eladoCif();
    if (!cif) throw hibaKod("efactura_missing", "Az üzemeltető adószáma (Webhely adatai)");
    const v = await api(`listaMesajeFactura?zile=${Math.min(60, Math.max(1, napok))}&cif=${encodeURIComponent(cif)}&filtru=P`);
    let j = {};
    try { j = JSON.parse(v.szoveg); } catch (e) { throw hibaKod("anaf_unavailable"); }
    const uzenetek = Array.isArray(j.mesaje) ? j.mesaje : [];
    let uj = 0;
    for (const m of uzenetek) {
        const anafId = String(m.id || "").trim();
        if (!anafId) continue;
        const van = await db.query("SELECT 1 FROM irattar WHERE anaf_id = $1", [anafId]);
        if (van.rowCount) continue;
        const d = await api(`descarcare?id=${encodeURIComponent(anafId)}`, { valasz: "buffer" });
        if (!d.ok || d.buf.subarray(0, 2).toString("latin1") !== "PK") continue;
        const xml = szamlaXmlBol(zip.kibont(d.buf));
        const a = bejovoAdat(xml);
        const datum = /^\d{4}-\d{2}-\d{2}$/.test(a.datum || "") ? a.datum : null;
        const partner = a.partner || (m.cif_emitent ? "CUI " + m.cif_emitent : (String(m.detalii || "").match(/cif_emitent=(\d+)/) || [])[1]);
        // a kiadások közé is felkerül (ellenőrizendő kategóriával) – így a bevétel–kiadás naplóban is benne van
        let kiadasId = null;
        const be = await pu.beallitas();
        if (be.efactura_bejovo_kiadas !== false && a.osszeg !== null) {
            const k = await db.query(`
                INSERT INTO penzugy_kiadasok (datum, kategoria, leiras, szallito, osszeg, penznem, afa, szamlaszam, jegyzet, auto)
                VALUES (COALESCE($1::date, CURRENT_DATE), $2, $3, $4, $5, $6, $7, $8, $9, true) RETURNING id`,
                [datum, kiadasKategoria(`${a.partner || ""} ${a.tetel || ""}`), vagott(a.tetel || a.partner || "Factură primită", 300), vagott(partner, 200),
                 a.osszeg, a.penznem || "RON", a.afa || 0, vagott(a.szam, 80),
                 "Automatikusan, az ANAF-ból beérkezett e-Factura számlából – ellenőrizd a kategóriát."]);
            kiadasId = k.rows[0].id;
        }
        await db.query(`
            INSERT INTO irattar (resz, kategoria, cim, partner, szam, datum, osszeg, penznem, megjegyzes, cimkek,
                                 fajl_nev, fajl_mime, fajl_meret, fajl_hash, fajl, anaf_id, kiadas_id)
            VALUES ('szamla', 'bejovo', $1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6, $7, 'e-Factura', $8, 'application/zip', $9, $10, $11, $12, $13)
            ON CONFLICT DO NOTHING`,
            [vagott(`${a.partner || partner || "Factură"}${a.szam ? " – " + a.szam : ""}`, 200), vagott(partner, 200), vagott(a.szam, 80), datum,
             a.osszeg, a.penznem || "RON", vagott([a.tetel, a.partner_cui ? "CUI " + a.partner_cui : ""].filter(Boolean).join(" · "), 2000),
             `efactura-${anafId}.zip`, d.buf.length, crypto.createHash("sha256").update(d.buf).digest("hex"), d.buf, anafId, kiadasId]);
        uj++;
    }
    await ment({ bejovo_utolso: new Date().toISOString() });
    return { uj, osszes: uzenetek.length };
}

// A beérkező számla kiadás-kategóriája a szállító és a tétel neve alapján (átírható)
function kiadasKategoria(s) {
    const t = String(s || "").toLowerCase();
    if (/g[aă]zduire|hosting|server|render|neon|cloud|vps/.test(t)) return "tarhely";
    if (/domeniu|domain|rotld|\.ro\b/.test(t)) return "domain";
    if (/contabil|expert/.test(t)) return "konyveles";
    if (/publicit|reclam|marketing|google ads|facebook|meta platforms/.test(t)) return "marketing";
    if (/internet|telefon|mobil|digi |orange|vodafone|telekom|energie|electrica|gaz\b|apă|apa nova/.test(t)) return "egyeb";
    if (/licen|software|abonament|subscription|saas|program/.test(t)) return "szoftver";
    if (/banc[aă]|comision|bank|revolut|stripe/.test(t)) return "bank";
    if (/anaf|tax[aă]|impozit|cas\b|cass\b/.test(t)) return "adok";
    return "egyeb";
}

const vagott = (s, n) => (s === null || s === undefined || s === "" ? null : String(s).slice(0, n));

// ---------- számlálók (Ma oldal, menü) ----------

async function szamlalok() {
    const be = await pu.beallitas();
    const r = await db.query(`
        SELECT id, kiallitva, efactura_allapot FROM penzugy_szamlak
        WHERE tipus = 'szamla' AND statusz <> 'piszkozat'
          AND COALESCE(efactura_allapot, '') NOT IN ('ok', 'kezi')
          AND ($1::date IS NULL OR kiallitva >= $1::date)
          AND kiallitva >= CURRENT_DATE - 120`, [be.efactura_kezdet || null]);
    const ma = pu.ma();
    let kuldendo = 0, surgos = 0, elutasitva = 0, feldolgozas = 0;
    r.rows.forEach(s => {
        if (s.efactura_allapot === "feldolgozas") { feldolgozas++; return; }
        if (["nok", "hiba"].includes(s.efactura_allapot)) elutasitva++;
        kuldendo++;
        const h = munkanap.hatraVan(hatarido(s), ma);
        if (h !== null && h <= 1) surgos++;
    });
    return { kuldendo, surgos, elutasitva, feldolgozas };
}

// ---------- az időzített futás ----------

let fut = false;

async function futtat({ kezi = false } = {}) {
    if (fut) return { fut: true };
    fut = true;
    const ki = { feldolgozva: 0, kuldve: 0, hibak: [], bejovo: null };
    try {
        await tolt(true);
        if (!tarolt.refresh_token || !clientId()) return { ...ki, nincs_kapcsolat: true };
        const be = await pu.beallitas();

        // 1) a feldolgozás alatt lévők állapota (az ANAF 60 napig tartja)
        const f = await db.query(`SELECT id FROM penzugy_szamlak WHERE efactura_allapot = 'feldolgozas' AND efactura_kuldve > NOW() - INTERVAL '60 days' ORDER BY id LIMIT 50`);
        for (const x of f.rows) {
            try { await frissit(x.id); ki.feldolgozva++; } catch (e) { ki.hibak.push(`#${x.id}: ${e.reszlet || e.message}`); }
        }

        // 2) automatikus feltöltés: a még el nem küldött, kiállított számlák
        if (be.efactura_auto) {
            const k = await db.query(`
                SELECT id FROM penzugy_szamlak
                WHERE tipus = 'szamla' AND statusz <> 'piszkozat' AND efactura_allapot IS NULL
                  AND ($1::date IS NULL OR kiallitva >= $1::date)
                ORDER BY kiallitva, id LIMIT 30`, [be.efactura_kezdet || null]);
            for (const x of k.rows) {
                try { await kuld(x.id); ki.kuldve++; } catch (e) { ki.hibak.push(`#${x.id}: ${e.reszlet || e.message}`); }
            }
        }

        // 3) beérkező számlák – naponta legfeljebb kétszer (vagy kézi indításra)
        if (be.efactura_bejovo !== false && (kezi || !tarolt.bejovo_utolso || Date.now() - new Date(tarolt.bejovo_utolso).getTime() > 11 * 3600 * 1000)) {
            try { ki.bejovo = await bejovok(); } catch (e) { ki.hibak.push("bejövő: " + (e.reszlet || e.message)); }
        }

        await ment({ utolso_futas: new Date().toISOString(), utolso_hiba: ki.hibak.length ? ki.hibak.slice(0, 3).join(" | ").slice(0, 600) : null });
        if (ki.kuldve || ki.feldolgozva || (ki.bejovo && ki.bejovo.uj)) {
            console.log(`e-Factura: ${ki.kuldve} feltöltve, ${ki.feldolgozva} állapot frissítve, ${ki.bejovo ? ki.bejovo.uj : 0} új bejövő számla.`);
        }
        return ki;
    } catch (e) {
        await ment({ utolso_hiba: (e.reszlet || e.message || "").slice(0, 600) }).catch(() => { });
        console.error("e-Factura futás:", e.message);
        return { ...ki, hiba: e.reszlet || e.message };
    } finally {
        fut = false;
    }
}

// Az ANAF olvasható PDF-e egy beérkezett számla ZIP-jéből (Irattár)
async function irattarPdf(irattarId) {
    const r = await db.query("SELECT fajl FROM irattar WHERE id = $1 AND fajl_mime = 'application/zip'", [Number(irattarId) || 0]);
    if (!r.rows[0] || !r.rows[0].fajl) return null;
    const xml = szamlaXmlBol(zip.kibont(r.rows[0].fajl));
    if (!xml) return { hibak: ["A ZIP-ben nincs számla XML."] };
    return efactura.pdfXmlbol(xml);
}

module.exports = {
    HATARIDO_NAP, hianyLista, vevoJavit, allapot, kulcsMent, kulcsTorol, lecsatol, authUrl, callback, kuld, frissit, keziJelol, valaszZip,
    bejovok, futtat, szamlalok, szamlaInfo, hatarido, irattarPdf, redirectUri,
    _: { attr, hibak, bejovoAdat, szamlaXmlBol, b2cE, kiadasKategoria }
};
