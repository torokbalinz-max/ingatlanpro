// ============================================================
//  Admin beállítások: a webhely / üzemeltető adatai (a jogi oldalakhoz),
//  cégadatok lekérése az ANAF-tól adószám alapján
//  (A reklámfelületek beállításai: routes/reklam.js)
// ============================================================

const express = require("express");
const oldalAdatok = require("../services/oldalAdatok");
const anaf = require("../services/anaf");
const acc = require("../services/accounts");
const { hiba, csakAdmin, csakBelepve } = require("../lib/http");
const csapat = require("../services/csapat");

const router = express.Router();

router.get("/api/admin/oldal-adatok", csapat.csakResz("beallitasok"), async (req, res) => {
    try {
        res.json({ adat: await oldalAdatok.olvas(), adminEmail: await oldalAdatok.adminEmail() });
    } catch (err) {
        hiba(res, err);
    }
});

router.put("/api/admin/oldal-adatok", csapat.csakResz("beallitasok"), async (req, res) => {
    try {
        res.json({ siker: true, adat: await oldalAdatok.ment(req.body || {}) });
    } catch (err) {
        hiba(res, err);
    }
});

// ===================== LOGÓ (számla, e-mail) =====================

// Nyilvános: a logó képe (a számla PDF-ben és az e-mail fejlécében)
router.get("/api/oldal/logo.png", async (req, res) => {
    try {
        const l = await require("../services/logo").olvas();
        if (!l) return res.status(404).end();
        res.set("Content-Type", "image/png");
        res.set("Cache-Control", "public, max-age=86400");
        res.send(l.png);
    } catch (err) { hiba(res, err); }
});

router.get("/api/admin/oldal-logo", csapat.csakResz("beallitasok"), async (req, res) => {
    try {
        const l = await require("../services/logo").olvas();
        res.json(l ? { van: true, w: l.w, h: l.h, v: l.v } : { van: false });
    } catch (err) { hiba(res, err); }
});

router.put("/api/admin/oldal-logo", csapat.csakResz("beallitasok"), async (req, res) => {
    try {
        res.json({ siker: true, ...(await require("../services/logo").ment((req.body || {}).kep)) });
    } catch (err) {
        if (err && err.kod) return res.status(400).json({ error: err.kod });
        hiba(res, err);
    }
});

router.delete("/api/admin/oldal-logo", csapat.csakResz("beallitasok"), async (req, res) => {
    try { await require("../services/logo").torol(); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// Funkciók ki/be (pl. az „Eladjuk helyetted” értékesítés)
router.get("/api/admin/funkciok", csapat.csakResz("beallitasok"), async (req, res) => {
    try { res.json(await require("../services/funkciok").olvas()); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/funkciok", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, adat: await require("../services/funkciok").ment(req.body || {}) }); } catch (err) { hiba(res, err); }
});

// Cégadatok adószám (CUI) alapján – az irodaregisztrációhoz és az
// üzemeltető adataihoz. Bejelentkezve; óránként legfeljebb 30 lekérdezés.
router.get("/api/anaf/:cui", csakBelepve, async (req, res) => {

    try {

        const cui = anaf.cuiTisztit(req.params.cui);

        if (!cui) return res.status(400).json({ error: "bad_cui" });
        if (!anaf.cuiErvenyes(cui)) return res.status(400).json({ error: "cui_checksum" });

        if (req.szerep !== "admin" && acc.korlat("anaf:" + req.user.id, 30, 60 * 60 * 1000)) {
            return res.status(429).json({ error: "too_many" });
        }

        try {
            res.json({ cui, ...(await anaf.lekerdez(cui)) });
        } catch (e) {
            res.status(502).json({ error: "anaf_unavailable", message: e.message });
        }

    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
