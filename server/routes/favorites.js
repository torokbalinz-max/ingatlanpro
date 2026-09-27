// ============================================================
//  Kedvencek – felhasználónként (bejelentkezve)
// ============================================================

const express = require("express");
const db = require("../db/database");
const { hiba, csakBelepve } = require("../lib/http");
const { LISTA_MEZOK } = require("../lib/sql");

const router = express.Router();

router.get("/api/favorites", async (req, res) => {

    try {

        if (!req.user) return res.json([]);

        const result = await db.query(`
            SELECT ${LISTA_MEZOK}
            FROM favorites f
            JOIN ingatlanok i ON i.id = f.property_id
            WHERE f.user_id = $1
            ORDER BY f.created_at DESC NULLS LAST, i.id
        `, [req.user.id]);

        res.json(result.rows);

    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/favorites/ids", async (req, res) => {

    try {
        if (!req.user) return res.json([]);
        const result = await db.query("SELECT property_id FROM favorites WHERE user_id = $1", [req.user.id]);
        res.json(result.rows.map(r => r.property_id));
    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/favorites/:id", csakBelepve, async (req, res) => {

    try {
        await db.query(
            `INSERT INTO favorites (user_id, property_id) VALUES ($1, $2) ON CONFLICT (user_id, property_id) DO NOTHING`,
            [req.user.id, req.params.id]
        );
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }

});

router.delete("/api/favorites/:id", csakBelepve, async (req, res) => {

    try {
        await db.query("DELETE FROM favorites WHERE user_id = $1 AND property_id = $2", [req.user.id, req.params.id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
