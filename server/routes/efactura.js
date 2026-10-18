// ============================================================
//  Admin → Pénzügy → e-Factura (ANAF) – services/efacturaSpv.js
//
//  A kapcsolat beállítása (alkalmazás-kulcsok, csatlakozás) csak az
//  adminé; a beküldés, állapot, letöltés a pénzügyi jogú csapattagé is.
// ============================================================

const express = require("express");
const spv = require("../services/efacturaSpv");
const pu = require("../services/penzugy");
const mail = require("../services/mail");
const { hiba, csakAdmin } = require("../lib/http");
const csapat = require("../services/csapat");

const router = express.Router();
const jog = csapat.csakResz("penzugy");

// A hibák részletei (az ANAF üzenete) az adminnak hasznosak – visszaküldjük
function spvHiba(res, err) {
    if (err && err.kod && err.reszlet) return res.status(400).json({ error: err.kod, message: err.reszlet });
    hiba(res, err);
}

router.get("/api/admin/efactura/allapot", jog, async (req, res) => {
    try { res.json(await spv.allapot(mail.oldalCim(req))); } catch (err) { hiba(res, err); }
});

// Beállítások (automatikus küldés, kezdőnap, éles / próba, bejövő számlák)
router.put("/api/admin/efactura/beallitas", csakAdmin, async (req, res) => {
    try {
        const b = req.body || {};
        const d = {};
        ["efactura_auto", "efactura_kezdet", "efactura_mod", "efactura_bejovo"].forEach(k => { if (k in b) d[k] = b[k]; });
        await pu.beallitasMent(d);
        res.json({ siker: true, ...(await spv.allapot(mail.oldalCim(req))) });
    } catch (err) { hiba(res, err); }
});

router.post("/api/admin/efactura/kulcs", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, ...(await spv.kulcsMent(req.body || {})) }); } catch (err) { spvHiba(res, err); }
});

router.delete("/api/admin/efactura/kulcs", csakAdmin, async (req, res) => {
    try { await spv.kulcsTorol(); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/efactura/lecsatol", csakAdmin, async (req, res) => {
    try { await spv.lecsatol(); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// Csatlakozás: az ANAF belépő oldalára visz (minősített tanúsítvány kell)
router.get("/api/admin/efactura/csatlakozas", csakAdmin, async (req, res) => {
    try { res.redirect(await spv.authUrl(mail.oldalCim(req))); }
    catch (err) {
        res.redirect("/?anaf=" + encodeURIComponent((err && err.kod) || "error") + "#admin/efactura");
    }
});

// Az ANAF ide küld vissza a belépés után (ezt kell megadni az ANAF-nál „Callback URL”-nek)
router.get("/api/admin/efactura/callback", csakAdmin, async (req, res) => {
    try {
        if (req.query.error) throw Object.assign(new Error(String(req.query.error)), { kod: "efactura_denied" });
        await spv.callback(String(req.query.code || ""), String(req.query.state || ""));
        res.redirect("/?anaf=ok#admin/efactura");
        // rögtön egy futás (állapotok, bejövő számlák)
        spv.futtat({ kezi: true }).catch(() => { });
    } catch (err) {
        console.error("e-Factura csatlakozás:", err.reszlet || err.message);
        res.redirect("/?anaf=" + encodeURIComponent((err && err.kod) || "error") + "#admin/efactura");
    }
});

// Futtatás most (állapotok + automatikus küldés + bejövő számlák)
router.post("/api/admin/efactura/futtat", jog, async (req, res) => {
    try { res.json({ siker: true, ...(await spv.futtat({ kezi: true })) }); } catch (err) { spvHiba(res, err); }
});

router.post("/api/admin/efactura/bejovok", jog, async (req, res) => {
    try { res.json({ siker: true, ...(await spv.bejovok({ napok: 60 })) }); } catch (err) { spvHiba(res, err); }
});

// Egy számla: beküldés, állapot frissítése, kézi jelölés, az ANAF válasza (ZIP)
router.post("/api/admin/penzugy/szamlak/:id/efactura/kuld", jog, async (req, res) => {
    try {
        const k = await spv.kuld(Number(req.params.id) || 0, { kezi: !!(req.body || {}).ujra });
        // az ANAF általában pár percen belül feldolgozza – egy próbálkozás azonnal
        let f = null;
        try { await new Promise(r => setTimeout(r, 4000)); f = await spv.frissit(Number(req.params.id)); } catch (e) { /* később */ }
        res.json({ siker: true, ...k, allapot: f ? f.allapot : "feldolgozas", hiba: f ? f.hiba : null });
    } catch (err) { spvHiba(res, err); }
});

router.post("/api/admin/penzugy/szamlak/:id/efactura/frissit", jog, async (req, res) => {
    try { res.json({ siker: true, ...(await spv.frissit(Number(req.params.id) || 0)) }); } catch (err) { spvHiba(res, err); }
});

router.post("/api/admin/penzugy/szamlak/:id/efactura/kezi", jog, async (req, res) => {
    try { res.json({ siker: true, ...(await spv.keziJelol(Number(req.params.id) || 0, (req.body || {}).index)) }); } catch (err) { spvHiba(res, err); }
});

router.get("/api/admin/penzugy/szamlak/:id/efactura/valasz.zip", jog, async (req, res) => {
    try {
        const v = await spv.valaszZip(Number(req.params.id) || 0);
        if (!v || !v.zip) return res.status(404).send("Not found");
        const nev = `efactura-${String(v.sorszam || req.params.id).replace(/[^\w.-]/g, "_")}.zip`;
        res.set("Content-Type", "application/zip");
        res.set("Content-Disposition", `attachment; filename="${nev}"`);
        res.set("Cache-Control", "private, no-store");
        res.send(v.zip);
    } catch (err) { hiba(res, err); }
});

// Beérkezett e-Factura számla (Irattár) olvasható PDF-ként – az ANAF alakítja át
router.get("/api/admin/irattar/:id/anaf-pdf", jog, async (req, res) => {
    try {
        const v = await spv.irattarPdf(req.params.id);
        if (!v) return res.status(404).send("Not found");
        if (v.pdf) {
            res.set("Content-Type", "application/pdf");
            res.set("Content-Disposition", `inline; filename="factura-${Number(req.params.id) || 0}.pdf"`);
            res.set("Cache-Control", "private, no-store");
            return res.send(v.pdf);
        }
        res.status(502).set("Content-Type", "text/plain; charset=utf-8").send((v.hibak || ["ANAF"]).join("\n"));
    } catch (err) {
        if (err && err.kod === "anaf_unavailable") return res.status(502).set("Content-Type", "text/plain; charset=utf-8").send("Az ANAF most nem érhető el – próbáld később.");
        hiba(res, err);
    }
});

module.exports = router;
