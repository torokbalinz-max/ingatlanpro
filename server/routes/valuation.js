// ============================================================
//  Értékbecslő
// ============================================================

const express = require("express");
const { becsles, teszt, helySzorzok } = require("../services/valuation");
const { hiba, csakAdmin, csakBelepve } = require("../lib/http");

const router = express.Router();

// Becslés – csak bejelentkezve (mint a hirdetésfeladás); a weboldal a belépő
// ablakot hozza fel, és belépés után magától lefuttatja
router.get("/api/valuation", csakBelepve, async (req, res) => {

    try {

        const eredmeny = await becsles(req.query);

        if (eredmeny.error) return res.status(400).json(eredmeny);

        res.json(eredmeny);

    } catch (err) {
        hiba(res, err);
    }

});

// Pontosság-mérés a valós adatokon (admin): a régi és az új módszer hibája
router.get("/api/admin/ertekbecslo-teszt", csakAdmin, async (req, res) => {
    try {
        res.json(await teszt(String(req.query.varos || ""), String(req.query.tipus || "lakas"), String(req.query.ugylet || "elado")));
    } catch (err) {
        hiba(res, err);
    }
});

// A kerületek (települések) szorzója az értékbecslő modellje szerint (admin):
// ugyanaz az ingatlan itt mennyivel drágább / olcsóbb a város tipikus helyénél
router.get("/api/admin/ertekbecslo-helyek", csakAdmin, async (req, res) => {
    try {
        res.json(await helySzorzok(String(req.query.varos || ""), String(req.query.tipus || "lakas"), String(req.query.ugylet || "elado")));
    } catch (err) {
        hiba(res, err);
    }
});

module.exports = router;
