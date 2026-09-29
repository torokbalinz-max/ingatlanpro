// ============================================================
//  Értékbecslő
// ============================================================

const express = require("express");
const { becsles, teszt } = require("../services/valuation");
const { hiba, csakAdmin } = require("../lib/http");

const router = express.Router();

router.get("/api/valuation", async (req, res) => {

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

module.exports = router;
