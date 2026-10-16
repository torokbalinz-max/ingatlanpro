// ============================================================
//  Hivatalos számla – külső számlázóval (SmartBill vagy Oblio)
//
//  A mi díjbekérőnk (proforma) nem adóügyi számla. Fizetés után a hivatalos
//  számlát a könyvelő által is használt romániai számlázó állítja ki – az
//  küldi be az ANAF e-Factura rendszerébe is. Mi csak átadjuk a vevőt és a
//  tételeket, és elmentjük a számla számát (kulso_szam) és a PDF elérését.
//
//  Beállítás (a szerver környezeti változói):
//    SZAMLAZO=smartbill    SMARTBILL_EMAIL, SMARTBILL_TOKEN, SMARTBILL_CIF, SMARTBILL_SERIA
//    SZAMLAZO=oblio        OBLIO_EMAIL, OBLIO_SECRET, OBLIO_CIF, OBLIO_SERIA
//  Ha nincs beállítva, semmi nem történik (az admin kézzel írja be a számla
//  számát, ahogy eddig).
// ============================================================

const db = require("../db/database");
const pu = require("./penzugy");

function hibaKod(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

const env = k => String(process.env[k] || "").trim();

function melyik() {
    const s = env("SZAMLAZO").toLowerCase();
    if (s === "smartbill" && env("SMARTBILL_EMAIL") && env("SMARTBILL_TOKEN") && env("SMARTBILL_CIF") && env("SMARTBILL_SERIA")) return "smartbill";
    if (s === "oblio" && env("OBLIO_EMAIL") && env("OBLIO_SECRET") && env("OBLIO_CIF") && env("OBLIO_SERIA")) return "oblio";
    return null;
}

function allapot() {
    const s = env("SZAMLAZO").toLowerCase();
    return { szamlazo: melyik(), beallitva: s || null, hianyos: !!s && !melyik() };
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

// ===================== KIÁLLÍTÁS =====================

// Egy kifizetett díjbekérőhöz a hivatalos számla. Ha már van, nem készít újat.
async function kiallit(szamlaId, { fizetesiMod } = {}) {
    const sz = melyik();
    if (!sz) return { kihagyva: true };
    const s = await pu.szamla(Number(szamlaId) || 0);
    if (!s) throw hibaKod("not_found");
    if (s.statusz !== "fizetve") throw hibaKod("not_paid");
    if (s.kulso_szam && s.hivatalos_szamlazo) return { szam: s.kulso_szam, mar_volt: true };

    // ugyanarra ne fusson két kiállítás egyszerre
    const zar = await db.query(
        `UPDATE penzugy_szamlak SET hivatalos_szamlazo = $2, hivatalos_hiba = NULL, hivatalos_at = NOW()
         WHERE id = $1 AND (hivatalos_szamlazo IS NULL OR hivatalos_hiba IS NOT NULL) RETURNING id`, [s.id, sz]);
    if (!zar.rowCount) return { folyamatban: true };

    const be = await pu.beallitas();
    try {
        const e = sz === "smartbill" ? await smartbill(s, be, fizetesiMod || s.fizetesi_mod) : await oblio(s, be, fizetesiMod || s.fizetesi_mod);
        await db.query(
            `UPDATE penzugy_szamlak SET kulso_szam = $2, hivatalos_link = $3, hivatalos_hiba = NULL, hivatalos_at = NOW(),
                    megjegyzes = TRIM(COALESCE(megjegyzes, '') || E'\\n' || $4), updated_at = NOW() WHERE id = $1`,
            [s.id, e.szam, e.link || `${e.seria}|${e.szamjegy}`, `Hivatalos számla: ${e.szam} (${sz}).`]);
        return { szam: e.szam };
    } catch (err) {
        await db.query("UPDATE penzugy_szamlak SET hivatalos_hiba = $2, updated_at = NOW() WHERE id = $1", [s.id, String(err.message).slice(0, 500)]);
        throw err;
    }
}

// A hivatalos számla PDF-je: Oblio → link; SmartBill → letöltjük és továbbadjuk
async function pdf(s) {
    if (!s || !s.kulso_szam || !s.hivatalos_link) return null;
    if (/^https?:\/\//.test(s.hivatalos_link)) return { link: s.hivatalos_link };
    if (s.hivatalos_szamlazo === "smartbill" && melyik() === "smartbill") {
        const [seria, szam] = s.hivatalos_link.split("|");
        return { pdf: await smartbillPdf(seria, szam), nev: `${s.kulso_szam}.pdf` };
    }
    return null;
}

module.exports = { allapot, kiallit, pdf, melyik };
