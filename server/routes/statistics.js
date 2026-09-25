// ============================================================
//  Piaci statisztika: pillanatképek mentése, előzmények, trend
// ============================================================

const express = require("express");
const db = require("../db/database");
const { hiba, csakAdmin } = require("../lib/http");

const router = express.Router();

// Piaci állapot mentése: város + típus + ügylet szerint
router.post("/api/statistics/save", csakAdmin, async (req, res) => {

    try {

        const varos = (req.body && req.body.varos ? String(req.body.varos) : "").trim() || null;
        const tipus = req.body && req.body.tipus ? String(req.body.tipus) : "lakas";
        const ugylet = req.body && req.body.ugylet ? String(req.body.ugylet) : "elado";

        const felt = ["ar > 0", "nm > 0", "statusz = 'aktiv'", "ellenorzott", "tipus = $1", "ugylet = $2"];
        const params = [tipus, ugylet];

        if (varos) {
            params.push(varos);
            felt.push(`varos = $${params.length}`);
        }

        const where = "WHERE " + felt.join(" AND ");

        const stat = await db.query(`
            SELECT
                COUNT(*) AS property_count,
                AVG(ar) AS avg_price,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ar) AS median_price,
                AVG(nm) AS avg_nm,
                AVG(arnm) AS avg_price_nm,
                MIN(arnm) AS min_price_nm,
                MAX(arnm) AS max_price_nm
            FROM ingatlanok
            ${where}
        `, params);

        const s = stat.rows[0];

        const snapshot = await db.query(`
            INSERT INTO market_snapshots
            (varos, tipus, ugylet, property_count, avg_price, median_price, avg_nm, avg_price_nm, min_price_nm, max_price_nm)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING id
        `, [varos, tipus, ugylet, s.property_count, s.avg_price, s.median_price, s.avg_nm, s.avg_price_nm, s.min_price_nm, s.max_price_nm]);

        const snapshotId = snapshot.rows[0].id;

        const F = "COALESCE(NULLIF(TRIM(split_part(emelet,'/',1)),''),'0')";
        const floorExpr = `
            CASE
                WHEN ${F} !~ '^-?[0-9]+$' THEN 'Ismeretlen'
                WHEN ${F}::int <= 0 THEN 'Földszint'
                WHEN ${F}::int = 1 THEN '1. emelet'
                WHEN ${F}::int = 2 THEN '2. emelet'
                WHEN ${F}::int = 3 THEN '3. emelet'
                ELSE '4+ emelet'
            END`;

        const groups = {
            allapot: "COALESCE(NULLIF(allapot,''), 'Ismeretlen')",
            szobak: "COALESCE(szobak, 0)::text",
            emelet: floorExpr,
            kerulet: "COALESCE(NULLIF(kerulet,''), 'Nincs megadva')"
        };

        for (const [category, expr] of Object.entries(groups)) {

            const rows = await db.query(`
                SELECT ${expr} AS value, COUNT(*) AS property_count, AVG(ar) AS avg_price, AVG(arnm) AS avg_price_nm
                FROM ingatlanok
                ${where}
                GROUP BY 1
                ORDER BY 1
            `, params);

            for (const g of rows.rows) {
                await db.query(`
                    INSERT INTO market_snapshot_groups
                    (snapshot_id, category, value, property_count, avg_price, avg_price_nm)
                    VALUES ($1,$2,$3,$4,$5,$6)
                `, [snapshotId, category, g.value, g.property_count, g.avg_price, g.avg_price_nm]);
            }

        }

        res.json({ success: true, id: snapshotId });

    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/statistics", async (req, res) => {

    try {
        const result = await db.query("SELECT * FROM market_snapshots ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/statistics/trend", async (req, res) => {

    try {
        const result = await db.query(`
            SELECT id, created_at, property_count, avg_price, avg_price_nm, avg_nm, varos, tipus, ugylet
            FROM market_snapshots
            ORDER BY created_at ASC
        `);
        res.json(result.rows);
    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/statistics/:id", async (req, res) => {

    try {

        const snapshot = await db.query("SELECT * FROM market_snapshots WHERE id=$1", [req.params.id]);
        const groups = await db.query("SELECT * FROM market_snapshot_groups WHERE snapshot_id=$1", [req.params.id]);

        res.json({ snapshot: snapshot.rows[0], groups: groups.rows });

    } catch (err) {
        hiba(res, err);
    }

});

router.delete("/api/statistics/:id", csakAdmin, async (req, res) => {

    try {

        await db.query("DELETE FROM market_snapshot_groups WHERE snapshot_id=$1", [req.params.id]);
        await db.query("DELETE FROM market_snapshots WHERE id=$1", [req.params.id]);

        res.json({ success: true });

    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
