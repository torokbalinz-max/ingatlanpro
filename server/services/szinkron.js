// ============================================================
//  Szinkron a gépre: az Irattár iratai magától a helyi mappába
//
//  A gépen futó kis program (eszkozok/iratok-szinkron.js – óránként, a
//  Windows Feladatütemezőből) lekéri az iratok listáját, és ami új vagy
//  változott, letölti a „Dokumentumok\IngatlanPro iratok” mappába,
//  ugyanabba a rendbe, mint a „Könyvelőnek” csomag:
//    <év>\<év-hó>\Facturi_emise\  IP-2026-0001.html / .xml / _ANAF.zip
//    <év>\<év-hó>\Facturi_primite\ ... Bonuri\ Extrase_bancare\ Fiscal\ Altele\
//    <év>\<év-hó>\01_Registru_incasari_plati.csv
//    Szerzodesek\  megbízási, reklám és feltöltött szerződések
//  Helyben semmit nem töröl.
//
//  Belépés: saját kulccsal (Admin → Irattár → Szinkron a gépre). A kulcs
//  csak egyszer látszik; az adatbázisban csak a lenyomata (SHA-256) van.
// ============================================================

const crypto = require("crypto");
const db = require("../db/database");
const pu = require("./penzugy");

const KULCS = "irattar_szinkron";
const MAPPA = { bejovo: "Facturi_primite", nyugta: "Bonuri", bankkivonat: "Extrase_bancare", ado: "Fiscal", egyeb: "Altele" };

function hibaKod(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

const fajlNev = s => String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 110) || "document";
const hash = s => crypto.createHash("sha256").update(String(s)).digest("hex");

async function beallitas() {
    const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = $1", [KULCS]).catch(() => ({ rows: [] }));
    return r.rows[0] && r.rows[0].ertek ? JSON.parse(r.rows[0].ertek) : {};
}

async function ment(b) {
    await db.query(
        `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`, [KULCS, JSON.stringify(b)]);
}

async function allapot() {
    const b = await beallitas();
    return { van_kulcs: !!b.hash, letrehozva: b.letrehozva || null, utolso: b.utolso || null, utolso_db: b.utolso_db || 0 };
}

// Új kulcs (a régi érvényét veszti) – csak most látszik
async function ujKulcs() {
    const t = "ips_" + crypto.randomBytes(24).toString("base64url");
    await ment({ hash: hash(t), letrehozva: new Date().toISOString() });
    return t;
}

async function visszavon() {
    await ment({});
}

async function ellenoriz(fejlec) {
    const t = String(fejlec || "").replace(/^Bearer\s+/i, "").trim();
    if (!t) return false;
    const b = await beallitas();
    if (!b.hash) return false;
    const a = Buffer.from(hash(t)), c = Buffer.from(b.hash);
    return a.length === c.length && crypto.timingSafeEqual(a, c);
}

const honapMappa = d => { const s = pu.pgDatum(d) || pu.ma(); return `${s.slice(0, 4)}/${s.slice(0, 7)}`; };
const ver = d => d ? String(new Date(d).getTime()) : "0";

// ---------- a lista ----------

async function lista() {
    const out = [];

    // kiállított számlák (nem piszkozat): nyomtatható alak, XML, az ANAF-példány
    const sz = await db.query(`
        SELECT s.id, s.sorszam, s.kiallitva, s.updated_at, v.created_at AS zip_at
        FROM penzugy_szamlak s LEFT JOIN efactura_valaszok v ON v.szamla_id = s.id
        WHERE s.tipus = 'szamla' AND s.statusz <> 'piszkozat' ORDER BY s.kiallitva, s.id`);
    sz.rows.forEach(s => {
        const alap = `${honapMappa(s.kiallitva)}/Facturi_emise/${fajlNev(s.sorszam)}`;
        out.push({ kulcs: `szh-${s.id}`, ut: `${alap}.html`, ver: ver(s.updated_at) });
        out.push({ kulcs: `szx-${s.id}`, ut: `${alap}.xml`, ver: ver(s.updated_at) });
        if (s.zip_at) out.push({ kulcs: `szz-${s.id}`, ut: `${alap}_ANAF.zip`, ver: ver(s.zip_at) });
    });

    // feltöltött / letöltött iratok (fájllal)
    const ir = await db.query(`
        SELECT id, resz, kategoria, cim, partner, szam, datum, fajl_nev, updated_at FROM irattar
        WHERE fajl IS NOT NULL ORDER BY datum, id`);
    ir.rows.forEach(x => {
        const ext = (String(x.fajl_nev || "").match(/\.[A-Za-z0-9]{1,5}$/) || [""])[0];
        const d = pu.pgDatum(x.datum) || "";
        if (x.resz === "szerzodes") {
            out.push({ kulcs: `ir-${x.id}`, ut: `Szerzodesek/${fajlNev(`${d} ${x.partner || ""} ${x.cim || ""}`)} [${x.id}]${ext}`, ver: ver(x.updated_at) });
        } else {
            out.push({ kulcs: `ir-${x.id}`, ut: `${honapMappa(x.datum)}/${MAPPA[x.kategoria] || "Altele"}/${fajlNev(`${d} ${x.szam || x.cim || ""}`)} [${x.id}]${ext}`, ver: ver(x.updated_at) });
        }
    });

    // reklám szerződések
    const rk = await db.query(`
        SELECT r.id, r.szerzodes_szam, r.szerzodes_kuldve, r.szerzodes_elfogadva, u.nev AS ugyfel
        FROM reklamok r LEFT JOIN penzugy_ugyfelek u ON u.id = r.ugyfel_id WHERE r.szerzodes_szam IS NOT NULL`).catch(() => ({ rows: [] }));
    rk.rows.forEach(r => out.push({
        kulcs: `rk-${r.id}`, ut: `Szerzodesek/${fajlNev(`${r.szerzodes_szam} Reclama ${r.ugyfel || ""}`)}.html`,
        ver: ver(r.szerzodes_elfogadva || r.szerzodes_kuldve)
    }));

    // megbízási szerződések (online elfogadott / aláírt)
    const mb = await db.query(`
        SELECT id, szerzodes_szam, nev, updated_at FROM megbizasok
        WHERE szerzodes_allapot IN ('elfogadva', 'alairva') OR alairva IS NOT NULL`).catch(() => ({ rows: [] }));
    mb.rows.forEach(m => out.push({
        kulcs: `mb-${m.id}`, ut: `Szerzodesek/${fajlNev(`${m.szerzodes_szam || "Mandat-" + m.id} ${m.nev || ""}`)}.html`, ver: ver(m.updated_at)
    }));

    // a bevétel–kiadás napló minden hónapra, amiben volt mozgás
    const ho = await db.query(`
        SELECT to_char(d, 'YYYY-MM') AS ho, MAX(u) AS u FROM (
            SELECT fizetve AS d, updated_at AS u FROM penzugy_szamlak WHERE tipus = 'szamla' AND fizetve IS NOT NULL
            UNION ALL SELECT datum, updated_at FROM penzugy_kiadasok) x
        WHERE d IS NOT NULL GROUP BY 1 ORDER BY 1`);
    ho.rows.forEach(h => out.push({ kulcs: `reg-${h.ho}`, ut: `${h.ho.slice(0, 4)}/${h.ho}/01_Registru_incasari_plati.csv`, ver: ver(h.u) }));

    const b = await beallitas();
    await ment({ ...b, utolso: new Date().toISOString(), utolso_db: out.length }).catch(() => { });
    return out;
}

// ---------- egy fájl ----------

async function fajl(kulcs) {
    const m = String(kulcs || "").match(/^(szh|szx|szz|ir|rk|mb)-(\d+)$|^reg-(\d{4})-(\d{2})$/);
    if (!m) throw hibaKod("not_found");
    if (m[3]) {
        const irattar = require("./irattar");
        return { adat: Buffer.from(await irattar.registruCsv(Number(m[3]), Number(m[4])), "utf8"), mime: "text/csv; charset=utf-8" };
    }
    const id = Number(m[2]);
    if (m[1] === "szh" || m[1] === "szx") {
        const s = await pu.szamla(id);
        if (!s || s.tipus !== "szamla") throw hibaKod("not_found");
        if (m[1] === "szh") {
            const html = await require("../routes/penzugy").bizonylatHtml(s, { nyomtat: false });
            return { adat: Buffer.from(html, "utf8"), mime: "text/html; charset=utf-8" };
        }
        const efactura = require("./efactura");
        if ((await efactura.hianyok(s)).length) throw hibaKod("efactura_missing");
        return { adat: Buffer.from(await efactura.xml(s), "utf8"), mime: "application/xml" };
    }
    if (m[1] === "szz") {
        const r = await db.query("SELECT zip FROM efactura_valaszok WHERE szamla_id = $1", [id]);
        if (!r.rows[0] || !r.rows[0].zip) throw hibaKod("not_found");
        return { adat: r.rows[0].zip, mime: "application/zip" };
    }
    if (m[1] === "ir") {
        const r = await db.query("SELECT fajl, fajl_mime FROM irattar WHERE id = $1", [id]);
        if (!r.rows[0] || !r.rows[0].fajl) throw hibaKod("not_found");
        return { adat: r.rows[0].fajl, mime: r.rows[0].fajl_mime || "application/octet-stream" };
    }
    if (m[1] === "rk") {
        const rsz = require("./reklamSzamla");
        const r = await rsz.reklamAdat(id);
        if (!r || !r.szerzodes_szam) throw hibaKod("not_found");
        return { adat: Buffer.from(await rsz.html(r, { ford: "hu", ui: "hu" }), "utf8"), mime: "text/html; charset=utf-8" };
    }
    if (m[1] === "mb") {
        const mbs = require("./megbizas");
        const sz = require("./megbizasSzerzodes");
        const r = await db.query("SELECT * FROM megbizasok WHERE id = $1", [id]);
        if (!r.rows[0]) throw hibaKod("not_found");
        const be = await mbs.beallitas();
        const dij = await mbs.dijSzamol(r.rows[0]);
        return { adat: Buffer.from(await sz.html(r.rows[0], be, dij, { ford: "hu", ui: "hu" }), "utf8"), mime: "text/html; charset=utf-8" };
    }
    throw hibaKod("not_found");
}

module.exports = { allapot, ujKulcs, visszavon, ellenoriz, lista, fajl };
