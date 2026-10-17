// ============================================================
//  Számla a kifizetett díjbekérőből
//
//  A díjbekérő (proforma) nem számla. Amikor kifizetett lesz (kártyával,
//  vagy az admin jelölte átutalás / készpénz után), elkészül a számla:
//
//    smartbill / oblio  külső romániai számlázó (az küldi be az ANAF
//                       e-Factura rendszerébe is) – SZAMLAZO=... a szerveren
//    sajat              ha nincs külső számlázó: az app maga állítja ki a
//                       számlát (tipus = 'szamla', IP-<év>-<sorszám>), a
//                       díjbekérő adataival; az e-Factura XML letölthető
//                       (services/efactura.js), és az ANAF SPV-be feltölthető
//
//  A díjbekérőn: kulso_szam = a számla száma, hivatalos_szamlazo = melyik,
//  hivatalos_link = PDF link / "seria|szam" / "belso:<számla id>".
//  Beállítás: Admin → Pénzügy → Számlázás (auto_szamla, sajat_szamla).
// ============================================================

const db = require("../db/database");
const pu = require("./penzugy");

function hibaKod(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

const env = k => String(process.env[k] || "").trim();

// A szerveren beállított külső számlázó (vagy null)
function kulso() {
    const s = env("SZAMLAZO").toLowerCase();
    if (s === "smartbill" && env("SMARTBILL_EMAIL") && env("SMARTBILL_TOKEN") && env("SMARTBILL_CIF") && env("SMARTBILL_SERIA")) return "smartbill";
    if (s === "oblio" && env("OBLIO_EMAIL") && env("OBLIO_SECRET") && env("OBLIO_CIF") && env("OBLIO_SERIA")) return "oblio";
    return null;
}

// Ki állítja ki a számlát: külső számlázó, vagy az app (ha be van kapcsolva)
async function melyik() {
    const k = kulso();
    if (k) return k;
    const be = await pu.beallitas();
    return be.sajat_szamla !== false ? "sajat" : null;
}

async function allapot() {
    const s = env("SZAMLAZO").toLowerCase();
    return { szamlazo: await melyik(), kulso: kulso(), beallitva: s || null, hianyos: !!s && !kulso() };
}

const FIZ = { kartya: "Card", atutalas: "Ordin plata", keszpenz: "Chitanta", online: "Card" };

// ---------- SmartBill ----------

function sbFej() {
    return {
        Authorization: "Basic " + Buffer.from(env("SMARTBILL_EMAIL") + ":" + env("SMARTBILL_TOKEN")).toString("base64"),
        Accept: "application/json"
    };
}

async function smartbill(s, be, fizetesiMod) {
    const v = s.vevo || {};
    const adat = {
        companyVatCode: env("SMARTBILL_CIF"),
        client: {
            name: v.nev || s.ugyfel_nev || "Client",
            vatCode: v.cui || "",
            regCom: v.reg_com || "",
            address: v.cim || "",
            email: v.email || "",
            country: "Romania",
            saveToDb: false
        },
        issueDate: pu.ma(),
        seriesName: env("SMARTBILL_SERIA"),
        isDraft: false,
        currency: s.penznem || "RON",
        language: "RO",
        mentions: `Proforma ${s.sorszam}`,
        products: (s.tetelek || []).map(t => {
            const p = {
                name: String(t.megnevezes).slice(0, 250),
                measuringUnitName: "buc",
                currency: s.penznem || "RON",
                quantity: t.mennyiseg,
                price: t.mennyiseg ? Math.round(t.brutto / t.mennyiseg * 100) / 100 : t.brutto,
                isTaxIncluded: true,
                isService: true,
                saveToDb: false
            };
            if (be.afa_fizeto) { p.taxName = "Normala"; p.taxPercentage = t.afa_kulcs; }
            return p;
        }),
        payment: { value: s.brutto, type: FIZ[fizetesiMod] || "Card", isCash: fizetesiMod === "keszpenz" }
    };
    const res = await fetch("https://ws.smartbill.ro/SBORO/api/invoice", {
        method: "POST",
        headers: { ...sbFej(), "Content-Type": "application/json" },
        body: JSON.stringify(adat),
        signal: AbortSignal.timeout(30000)
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.errorText) throw new Error("SmartBill: " + (j.errorText || j.message || "HTTP " + res.status));
    return { szam: `${j.series}${j.number}`, seria: j.series, szamjegy: j.number, link: null };
}

async function smartbillPdf(seria, szam) {
    const u = `https://ws.smartbill.ro/SBORO/api/invoice/pdf?cif=${encodeURIComponent(env("SMARTBILL_CIF"))}&seriesname=${encodeURIComponent(seria)}&number=${encodeURIComponent(szam)}`;
    const res = await fetch(u, { headers: { ...sbFej(), Accept: "application/octet-stream" }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error("SmartBill PDF: HTTP " + res.status);
    return Buffer.from(await res.arrayBuffer());
}

// ---------- Oblio ----------

let oblioToken = null;

async function oblioFej() {
    if (!oblioToken || oblioToken.lejar < Date.now() + 60000) {
        const res = await fetch("https://www.oblio.eu/api/authorize/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: env("OBLIO_EMAIL"), client_secret: env("OBLIO_SECRET") }).toString(),
            signal: AbortSignal.timeout(20000)
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.access_token) throw new Error("Oblio: belépés sikertelen" + (j.statusMessage ? " – " + j.statusMessage : ""));
        oblioToken = { t: j.access_token, lejar: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
    }
    return { Authorization: "Bearer " + oblioToken.t };
}

async function oblio(s, be, fizetesiMod) {
    const v = s.vevo || {};
    const adat = {
        cif: env("OBLIO_CIF"),
        client: {
            cif: v.cui || "",
            name: v.nev || s.ugyfel_nev || "Client",
            rc: v.reg_com || "",
            address: v.cim || "",
            email: v.email || "",
            country: "Romania",
            save: 0
        },
        issueDate: pu.ma(),
        seriesName: env("OBLIO_SERIA"),
        currency: s.penznem || "RON",
        language: "RO",
        mentions: `Proforma ${s.sorszam}`,
        collect: { type: FIZ[fizetesiMod] || "Card", documentNumber: s.sorszam },
        products: (s.tetelek || []).map(t => ({
            name: String(t.megnevezes).slice(0, 250),
            price: t.mennyiseg ? Math.round(t.brutto / t.mennyiseg * 100) / 100 : t.brutto,
            measuringUnit: "buc",
            currency: s.penznem || "RON",
            vatPercentage: be.afa_fizeto ? t.afa_kulcs : 0,
            vatIncluded: 1,
            quantity: t.mennyiseg,
            productType: "Serviciu",
            save: 0
        }))
    };
    const res = await fetch("https://www.oblio.eu/api/docs/invoice", {
        method: "POST",
        headers: { ...(await oblioFej()), "Content-Type": "application/json" },
        body: JSON.stringify(adat),
        signal: AbortSignal.timeout(30000)
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.data) throw new Error("Oblio: " + (j.statusMessage || "HTTP " + res.status));
    return { szam: `${j.data.seriesName}${j.data.number}`, seria: j.data.seriesName, szamjegy: j.data.number, link: j.data.link || null };
}

// ---------- Saját számla (az app állítja ki) ----------

async function sajat(s, fizetesiMod) {
    // ha már készült ehhez a díjbekérőhöz, azt adjuk vissza
    const van = await db.query("SELECT id, sorszam FROM penzugy_szamlak WHERE dijbekero_id = $1 AND tipus = 'szamla' AND statusz <> 'sztorno' ORDER BY id LIMIT 1", [s.id]);
    if (van.rowCount) return { szam: van.rows[0].sorszam, link: "belso:" + van.rows[0].id };

    const id = await pu.szamlaMent(null, {
        tipus: "szamla",
        ugyfel_id: s.ugyfel_id,
        vevo: s.vevo && s.vevo.nev ? s.vevo : undefined,
        kiallitva: pu.ma(),
        esedekes: pu.ma(),
        fizetve: s.fizetve || pu.ma(),
        statusz: "fizetve",
        penznem: s.penznem,
        fizetesi_mod: fizetesiMod || s.fizetesi_mod || null,
        idoszak_tol: s.idoszak_tol,
        idoszak_ig: s.idoszak_ig,
        megjegyzes: `Díjbekérő / Proforma: ${s.sorszam}`,
        tetelek: (s.tetelek || []).map(t => ({
            megnevezes: t.megnevezes, megnevezes_ro: t.megnevezes_ro, megnevezes_en: t.megnevezes_en, kategoria: t.kategoria, csomag_id: t.csomag_id,
            mennyiseg: t.mennyiseg, egysegar: t.egysegar, afa_kulcs: t.afa_kulcs
        }))
    });
    await db.query("UPDATE penzugy_szamlak SET dijbekero_id = $2 WHERE id = $1", [id, s.id]);
    const uj = await pu.szamla(id);
    return { szam: uj.sorszam, link: "belso:" + id };
}

// ===================== KIÁLLÍTÁS =====================

// Egy kifizetett díjbekérőhöz a számla. Ha már van, nem készít újat.
async function kiallit(szamlaId, { fizetesiMod } = {}) {
    const sz = await melyik();
    if (!sz) return { kihagyva: true };
    const s = await pu.szamla(Number(szamlaId) || 0);
    if (!s) throw hibaKod("not_found");
    if (s.tipus !== "dijbekero") throw hibaKod("not_proforma");
    if (s.statusz !== "fizetve") throw hibaKod("not_paid");
    if (!(Number(s.brutto) > 0)) return { kihagyva: true };
    if (s.kulso_szam && s.hivatalos_szamlazo) return { szam: s.kulso_szam, mar_volt: true };

    // ugyanarra ne fusson két kiállítás egyszerre
    const zar = await db.query(
        `UPDATE penzugy_szamlak SET hivatalos_szamlazo = $2, hivatalos_hiba = NULL, hivatalos_at = NOW()
         WHERE id = $1 AND (hivatalos_szamlazo IS NULL OR hivatalos_hiba IS NOT NULL) RETURNING id`, [s.id, sz]);
    if (!zar.rowCount) return { folyamatban: true };

    const be = await pu.beallitas();
    const mod = fizetesiMod || s.fizetesi_mod;
    try {
        const e = sz === "smartbill" ? await smartbill(s, be, mod)
            : sz === "oblio" ? await oblio(s, be, mod)
            : await sajat(s, mod);
        await db.query(
            `UPDATE penzugy_szamlak SET kulso_szam = $2, hivatalos_link = $3, hivatalos_hiba = NULL, hivatalos_at = NOW(),
                    megjegyzes = TRIM(COALESCE(megjegyzes, '') || E'\n' || $4), updated_at = NOW() WHERE id = $1`,
            [s.id, e.szam, e.link || `${e.seria}|${e.szamjegy}`, `Számla / Factură: ${e.szam}${sz === "sajat" ? "" : " (" + sz + ")"}.`]);
        return { szam: e.szam };
    } catch (err) {
        await db.query("UPDATE penzugy_szamlak SET hivatalos_hiba = $2, updated_at = NOW() WHERE id = $1", [s.id, String(err.message).slice(0, 500)]);
        throw err;
    }
}

// Kifizetett díjbekérő → magától a számla (ha a beállítás kéri)
pu.fizetveFigyelo(async id => {
    const be = await pu.beallitas();
    if (be.auto_szamla === false) return;
    const s = await pu.szamla(id);
    if (!s || s.tipus !== "dijbekero" || s.statusz !== "fizetve" || s.hivatalos_szamlazo) return;
    const v = await kiallit(id, {}).catch(e => { console.error("Számla kiállítása:", e.message); return null; });
    if (v && v.szam && !v.mar_volt) kuldes(id).catch(e => console.error("Számla e-mail:", e.message));
});

// A saját számla e-mailben a vevőnek (a külső számlázók maguk küldik)
async function kuldes(dijbekeroId) {
    const mail = require("./mail");
    if (!mail.elerheto()) return;
    const d = await pu.szamla(dijbekeroId);
    if (!d || d.hivatalos_szamlazo !== "sajat" || !String(d.hivatalos_link || "").startsWith("belso:")) return;
    const s = await pu.szamla(Number(d.hivatalos_link.slice(6)));
    const to = s && s.vevo && s.vevo.email;
    if (!to || s.emailezve) return;
    const html = await require("../routes/penzugy").bizonylatHtml(s, { nyomtat: false });
    await mail.kuld({ to, subject: `Számla / Factură ${s.sorszam}`, html });
    await db.query("UPDATE penzugy_szamlak SET emailezve = NOW() WHERE id = $1", [s.id]);
}

// A számla: Oblio → link; SmartBill → letöltjük és továbbadjuk; saját → a mi bizonylatunk
async function pdf(s) {
    if (!s || !s.kulso_szam || !s.hivatalos_link) return null;
    if (s.hivatalos_link.startsWith("belso:")) return { belso: Number(s.hivatalos_link.slice(6)) || null };
    if (/^https?:\/\//.test(s.hivatalos_link)) return { link: s.hivatalos_link };
    if (s.hivatalos_szamlazo === "smartbill" && kulso() === "smartbill") {
        const [seria, szam] = s.hivatalos_link.split("|");
        return { pdf: await smartbillPdf(seria, szam), nev: `${s.kulso_szam}.pdf` };
    }
    return null;
}

module.exports = { allapot, kiallit, pdf, melyik, kulso };
