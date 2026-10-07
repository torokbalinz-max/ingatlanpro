// ============================================================
//  Admin beállítások: a webhely / üzemeltető adatai (a jogi oldalakhoz),
//  cégadatok lekérése az ANAF-tól adószám alapján
// ============================================================

const express = require("express");
const oldalAdatok = require("../services/oldalAdatok");
const anaf = require("../services/anaf");
const acc = require("../services/accounts");
const { hiba, csakAdmin, csakBelepve } = require("../lib/http");

const router = express.Router();

router.get("/api/admin/oldal-adatok", csakAdmin, async (req, res) => {
    try {
        res.json({ adat: await oldalAdatok.olvas(), adminEmail: await oldalAdatok.adminEmail() });
    } catch (err) {
        hiba(res, err);
    }
});

router.put("/api/admin/oldal-adatok", csakAdmin, async (req, res) => {
    try {
        res.json({ siker: true, adat: await oldalAdatok.ment(req.body || {}) });
    } catch (err) {
        hiba(res, err);
    }
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
