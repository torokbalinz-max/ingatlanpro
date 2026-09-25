// ============================================================
//  Kedvencek
// ============================================================

const express = require("express");
const db = require("../db/database");
const { hiba } = require("../lib/http");
const { LISTA_MEZOK } = require("../lib/sql");

const router = express.Router();

router.get("/api/favorites", async (req, res) => {

    try {

        const result = await db.query(`
            SELECT ${LISTA_MEZOK}
            FROM favorites f
            JOIN ingatlanok i ON i.id = f.property_id
            ORDER BY i.id
        `);

        res.json(result.rows);

    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/favorites/ids", async (req, res) => {

    try {
        const result = await db.query("SELECT property_id FROM favorites");
        res.json(result.rows.map(r => r.property_id));
    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/favorites/:id", async (req, res) => {

    try {
        await db.query(
            `INSERT INTO favorites (property_id) VALUES ($1) ON CONFLICT (property_id) DO NOTHING`,
            [req.params.id]
        );
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }

});

router.delete("/api/favorites/:id", async (req, res) => {

    try {
        await db.query("DELETE FROM favorites WHERE property_id=$1", [req.params.id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
