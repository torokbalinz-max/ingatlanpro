// ============================================================
//  Admin → Pénzügyek: díjcsomagok, ügyfelek, előfizetések,
//  díjbekérők / számlák, kiadások, áttekintés, export, beállítások
//  (a munka: services/penzugy.js)
// ============================================================

const express = require("express");
const pu = require("../services/penzugy");
const oldalAdatok = require("../services/oldalAdatok");
const mail = require("../services/mail");
const { hiba, csakAdmin, csakBelepve } = require("../lib/http");
const csapat = require("../services/csapat");

const router = express.Router();

const id = req => {
    const n = Number(req.params.id);
    return Number.isInteger(n) && n > 0 ? n : null;
};

// ===================== ÁTTEKINTÉS, BEÁLLÍTÁSOK =====================

router.get("/api/admin/penzugy/attekintes", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await pu.attekintes()); } catch (err) { hiba(res, err); }
});

router.get("/api/admin/penzugy/beallitas", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        res.json({
            beallitas: await pu.beallitas(),
            uzemelteto: await oldalAdatok.olvas(),
            email: mail.elerheto(),
            listak: {
                kategoriak: pu.KATEGORIAK, idoszakok: pu.IDOSZAKOK, penznemek: pu.PENZNEMEK, fizetesiModok: pu.FIZETESI_MODOK,
                kiadasKategoriak: pu.KIADAS_KATEGORIAK, ugyfelTipusok: pu.UGYFEL_TIPUSOK, elofizetesStatuszok: pu.ELOFIZETES_STATUSZOK
            }
        });
    } catch (err) { hiba(res, err); }
});

router.put("/api/admin/penzugy/beallitas", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json({ siker: true, beallitas: await pu.beallitasMent(req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/arfolyam", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        const a = await pu.bnrArfolyam();
        res.json({ siker: true, ...a, beallitas: await pu.beallitasMent({ eur_arfolyam: a.eur, arfolyam_datum: a.datum }) });
    } catch (err) {
        res.status(502).json({ error: "bnr_unavailable", message: err.message });
    }
});

router.get("/api/admin/penzugy/korlat-elonezet", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await pu.korlatElonezet()); } catch (err) { hiba(res, err); }
});

// ===================== DÍJCSOMAGOK =====================

router.get("/api/admin/penzugy/csomagok", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await pu.csomagok()); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/csomagok", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json({ siker: true, id: await pu.csomagMent(null, req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/penzugy/csomagok/:id", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json({ siker: true, id: await pu.csomagMent(id(req), req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/penzugy/csomagok/:id", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json({ siker: true, ...(await pu.csomagTorol(id(req))) }); } catch (err) { hiba(res, err); }
});

// ===================== ÜGYFELEK =====================

router.get("/api/admin/penzugy/ugyfelek", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await pu.ugyfelek()); } catch (err) { hiba(res, err); }
});

router.get("/api/admin/penzugy/ugyfel-javaslat", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await pu.ugyfelJavaslat(req.query.q)); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/ugyfelek", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json({ siker: true, id: await pu.ugyfelMent(null, req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/penzugy/ugyfelek/:id", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json({ siker: true, id: await pu.ugyfelMent(id(req), req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/penzugy/ugyfelek/:id", csapat.csakResz("penzugy"), async (req, res) => {
    try { await pu.ugyfelTorol(id(req)); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// ===================== ELŐFIZETÉSEK =====================

router.get("/api/admin/penzugy/elofizetesek", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await pu.elofizetesek()); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/elofizetesek", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json({ siker: true, id: await pu.elofizetesMent(null, req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/penzugy/elofizetesek/:id", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json({ siker: true, id: await pu.elofizetesMent(id(req), req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/penzugy/elofizetesek/:id", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json({ siker: true, ...(await pu.elofizetesTorol(id(req))) }); } catch (err) { hiba(res, err); }
});

// Az esedékes előfizetések díjbekérőinek elkészítése
router.post("/api/admin/penzugy/esedekes-dijbekerok", csapat.csakResz("penzugy"), async (req, res) => {
    try { const ids = await pu.esedekesDijbekerok(); res.json({ siker: true, db: ids.length, ids }); } catch (err) { hiba(res, err); }
});

// ===================== DÍJBEKÉRŐK / SZÁMLÁK =====================

router.get("/api/admin/penzugy/szamlak", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await pu.szamlak({ tol: req.query.tol, ig: req.query.ig, ugyfel_id: req.query.ugyfel })); } catch (err) { hiba(res, err); }
});

router.get("/api/admin/penzugy/szamlak/:id", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        const s = await pu.szamla(id(req));
        if (!s) return res.status(404).json({ error: "not_found" });
        res.json(s);
    } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/szamlak", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json({ siker: true, id: await pu.szamlaMent(null, req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/penzugy/szamlak/:id", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json({ siker: true, id: await pu.szamlaMent(id(req), req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/szamlak/:id/allapot", csapat.csakResz("penzugy"), async (req, res) => {
    try { await pu.szamlaAllapotValt(id(req), req.body || {}); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/penzugy/szamlak/:id", csapat.csakResz("penzugy"), async (req, res) => {
    try { await pu.szamlaTorol(id(req)); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// A bizonylat PDF-ben (letöltés)
router.get("/api/admin/penzugy/szamlak/:id/pdf", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        const s = await pu.szamla(id(req));
        if (!s) return res.status(404).send("Nincs ilyen bizonylat");
        const p = await bizonylatPdf(s, {});
        res.set("Content-Type", "application/pdf");
        res.set("Content-Disposition", `${req.query.letolt ? "attachment" : "inline"}; filename="${p.nev}"`);
        res.set("Cache-Control", "private, no-store");
        res.send(p.tartalom);
    } catch (err) { hiba(res, err); }
});

// Nyomtatható díjbekérő (új lapon nyílik; a böngészőből PDF-be menthető)
router.get("/api/admin/penzugy/szamlak/:id/nyomtat", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        const s = await pu.szamla(id(req));
        if (!s) return res.status(404).send("Nincs ilyen bizonylat");
        const ford = dok.fordKer(req.query, (await pu.beallitas()).bizonylat_forditas);
        const html = await bizonylatHtml(s, { nyomtat: true, ford, ui: dok.uiKer(req.query, "hu"), vissza: "/#admin/szamlak", admin: true });
        res.set("Content-Type", "text/html; charset=utf-8");
        res.set("Content-Security-Policy", dok.CSP);
        res.set("Cache-Control", "private, no-store");
        res.send(html);
    } catch (err) { hiba(res, err); }
});

// Díjbekérő küldése e-mailben a vevőnek
router.post("/api/admin/penzugy/szamlak/:id/email", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        if (!mail.elerheto()) return res.status(400).json({ error: "mail_not_configured" });
        const s = await pu.szamla(id(req));
        if (!s) return res.status(404).json({ error: "not_found" });
        const to = String((req.body && req.body.email) || (s.vevo && s.vevo.email) || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return res.status(400).json({ error: "bad_email" });
        const u = await oldalAdatok.nyilvanos();
        const level = await require("../services/szamlazo").szamlaLevel(s, { pdf: true });
        const ok = await mail.kuld({ to, ...level, replyTo: u.email || undefined });
        if (!ok) return res.status(502).json({ error: "mail_failed" });
        await require("../db/database").query("UPDATE penzugy_szamlak SET emailezve = NOW() WHERE id = $1", [s.id]);
        res.json({ siker: true, to });
    } catch (err) { hiba(res, err); }
});

// ===================== KIADÁSOK =====================

router.get("/api/admin/penzugy/kiadasok", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await pu.kiadasok({ tol: req.query.tol, ig: req.query.ig })); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/kiadasok", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json({ siker: true, id: await pu.kiadasMent(null, req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/penzugy/kiadasok/:id", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json({ siker: true, id: await pu.kiadasMent(id(req), req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/penzugy/kiadasok/:id", csapat.csakResz("penzugy"), async (req, res) => {
    try { await pu.kiadasTorol(id(req)); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// ===================== EXPORT (könyvelőnek, CSV / Excel) =====================

router.get("/api/admin/penzugy/export/:mit", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        const f = { tol: req.query.tol, ig: req.query.ig };
        const mit = req.params.mit === "kiadasok" ? "kiadasok" : "szamlak";
        const tartalom = mit === "kiadasok" ? await pu.exportKiadasok(f) : await pu.exportSzamlak(f);
        const nev = `ingatlanpro-${mit}-${(f.tol || "").slice(0, 10) || "osszes"}${f.ig ? "_" + String(f.ig).slice(0, 10) : ""}.csv`.replace(/[^\w.-]/g, "");
        res.set("Content-Type", "text/csv; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="${nev}"`);
        res.send(tartalom);
    } catch (err) { hiba(res, err); }
});

// ===================== A FELHASZNÁLÓ SAJÁT CSOMAGJA =====================

router.get("/api/sajat-csomag", csakBelepve, async (req, res) => {
    try { res.json(await pu.jogosultsag(req.user.id)); } catch (err) { hiba(res, err); }
});

// ===================== A BIZONYLAT HTML-JE =====================
// A sablon: services/bizonylat.js (román hivatalos szöveg, kérésre HU / EN fordítással)

const bizonylat = require("../services/bizonylat");
const dok = require("../services/dokumentum");
const db = require("../db/database");

// Az eszközsáv üzenetei (XML / ANAF gombok) a kezelő nyelvén
const XML_UZENET = {
    hu: { hianyzik: "Az e-Factura XML-hez hiányzó adatok", halozat: "Hálózati hiba – próbáld újra.", ellenoriz: "Ellenőrzés az ANAF-nál…", ok: "✓ Az ANAF szerint az XML hibátlan – feltölthető az SPV-be.", nok: "✗ Az ANAF hibát talált:" },
    ro: { hianyzik: "Date lipsă pentru XML-ul e-Factura", halozat: "Eroare de rețea – încearcă din nou.", ellenoriz: "Validare la ANAF…", ok: "✓ ANAF: XML-ul este valid – poate fi încărcat în SPV.", nok: "✗ ANAF a găsit erori:" },
    en: { hianyzik: "Missing data for the e-Factura XML", halozat: "Network error – try again.", ellenoriz: "Validating with ANAF…", ok: "✓ ANAF says the XML is valid – ready to upload to SPV.", nok: "✗ ANAF found errors:" }
};

// s: a bizonylat; o: { nyomtat, ford, ui, vissza, admin }
// A bizonylathoz tartozó adatok (üzemeltető, beállítások, hivatkozott iratok, logó)
async function bizonylatAdat(s, o = {}) {
    const u = await oldalAdatok.nyilvanos();
    const b = await pu.beallitas();
    const ford = o.ford === undefined ? (b.bizonylat_forditas || "") : o.ford;
    const egy = async id => id ? (await db.query("SELECT id, sorszam, kiallitva FROM penzugy_szamlak WHERE id = $1", [id])).rows[0] || null : null;
    const eredeti = await egy(s.sztorno_eredeti_id);
    const sztornoja = s.tipus === "szamla" ? (await db.query("SELECT id, sorszam, kiallitva FROM penzugy_szamlak WHERE sztorno_eredeti_id = $1 ORDER BY id LIMIT 1", [s.id]).catch(() => ({ rows: [] }))).rows[0] || null : null;
    const dijbekero = s.tipus === "szamla" ? await egy(s.dijbekero_id) : null;
    const logo = await require("../services/logo").olvas().catch(() => null);
    return {
        u, b, ford, logo,
        eredeti: eredeti && { ...eredeti, kiallitva: pu.pgDatum(eredeti.kiallitva) },
        sztornoja: sztornoja && { ...sztornoja, kiallitva: pu.pgDatum(sztornoja.kiallitva) },
        dijbekero
    };
}

async function bizonylatHtml(s, o = {}) {
    const a = await bizonylatAdat(s, o);
    const ui = o.ui || "hu";
    return bizonylat.html(s, a.u, a.b, {
        ford: a.ford, ui, nyomtat: !!o.nyomtat, vissza: o.vissza || "/", admin: !!o.admin,
        eredeti: a.eredeti, sztornoja: a.sztornoja, dijbekero: a.dijbekero,
        logoData: a.logo ? "data:image/png;base64," + a.logo.png.toString("base64") : null,
        uiSzovegek: XML_UZENET[ui] || XML_UZENET.hu
    });
}

// A bizonylat PDF-ben (e-mail csatolmány, letöltés) → { nev, tartalom: Buffer }
async function bizonylatPdf(s, o = {}) {
    const a = await bizonylatAdat(s, o);
    const tartalom = await require("../services/szamlaPdf").pdf(s, a.u, a.b, {
        ford: a.ford, logo: a.logo ? a.logo.png : null,
        eredeti: a.eredeti, sztornoja: a.sztornoja, dijbekero: a.dijbekero
    });
    const elo = s.tipus === "szamla" ? (Number(s.brutto) < 0 || s.sztorno_eredeti_id ? "Factura-stornare" : "Factura") : "Proforma";
    return { nev: `${elo}-${String(s.sorszam || s.id).replace(/[^\w.-]/g, "_")}.pdf`, tartalom };
}

router.bizonylatHtml = bizonylatHtml;
router.bizonylatPdf = bizonylatPdf;

module.exports = router;
