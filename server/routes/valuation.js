// ============================================================
//  Értékbecslő
// ============================================================

const express = require("express");
const { becsles } = require("../services/valuation");
const { hiba } = require("../lib/http");

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

module.exports = router;
