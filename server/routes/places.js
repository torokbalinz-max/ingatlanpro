// ============================================================
//  Városok, kerületek
// ============================================================

const express = require("express");
const db = require("../db/database");
const { hiba, csakAdmin } = require("../lib/http");

const router = express.Router();

router.get("/api/varosok", async (req, res) => {

    try {
        const result = await db.query("SELECT id, nev FROM varosok ORDER BY nev");
        res.json(result.rows);
    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/varosok", csakAdmin, async (req, res) => {

    try {

        const nev = (req.body.nev || "").trim();

        if (!nev) return res.status(400).json({ error: "Hiányzó városnév" });

        const result = await db.query(
            `INSERT INTO varosok (nev) VALUES ($1)
             ON CONFLICT (nev) DO UPDATE SET nev=EXCLUDED.nev
             RETURNING id, nev`,
            [nev]
        );

        res.json(result.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/keruletek", async (req, res) => {

    try {

        const varos = req.query.varos;

        const result = varos
            ? await db.query("SELECT id, varos, nev, aliasok FROM keruletek WHERE varos=$1 ORDER BY nev", [varos])
            : await db.query("SELECT id, varos, nev, aliasok FROM keruletek ORDER BY varos, nev");

        res.json(result.rows);

    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/keruletek", csakAdmin, async (req, res) => {

    try {

        const varos = (req.body.varos || "").trim();
        const nev = (req.body.nev || "").trim();

        if (!varos || !nev) return res.status(400).json({ error: "Hiányzó város vagy kerület név" });

        const result = await db.query(
            `INSERT INTO keruletek (varos, nev) VALUES ($1,$2)
             ON CONFLICT (varos, nev) DO UPDATE SET nev=EXCLUDED.nev
             RETURNING id, varos, nev`,
            [varos, nev]
        );

        res.json(result.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

router.put("/api/keruletek/:id", csakAdmin, async (req, res) => {

    try {

        const aliasok = String(req.body.aliasok || "").split(",").map(x => x.trim()).filter(Boolean).join(", ");

        await db.query("UPDATE keruletek SET aliasok = $1 WHERE id = $2", [aliasok || null, req.params.id]);

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
