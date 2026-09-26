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
            ? await db.query("SELECT id, varos, nev, nev_ro, aliasok FROM keruletek WHERE varos=$1 ORDER BY nev", [varos])
            : await db.query("SELECT id, varos, nev, nev_ro, aliasok FROM keruletek ORDER BY varos, nev");

        res.json(result.rows);

    } catch (err) {
        hiba(res, err);
    }

});

const tisztaAliasok = v => String(v || "").split(",").map(x => x.trim()).filter(Boolean).join(", ") || null;

// Új kerület: magyar név (nev) + román név (nev_ro) + más oldalak nevei (aliasok).
// Elég az egyik név – ha csak román van, az lesz a magyar is.
router.post("/api/keruletek", csakAdmin, async (req, res) => {

    try {

        const varos = (req.body.varos || "").trim();
        const nevRo = (req.body.nev_ro || "").trim() || null;
        const nev = (req.body.nev || "").trim() || nevRo;

        if (!varos || !nev) return res.status(400).json({ error: "Hiányzó város vagy kerület név" });

        const result = await db.query(
            `INSERT INTO keruletek (varos, nev, nev_ro, aliasok) VALUES ($1,$2,$3,$4)
             ON CONFLICT (varos, nev) DO UPDATE SET
                nev_ro = COALESCE(EXCLUDED.nev_ro, keruletek.nev_ro),
                aliasok = COALESCE(EXCLUDED.aliasok, keruletek.aliasok)
             RETURNING id, varos, nev, nev_ro, aliasok`,
            [varos, nev, nevRo, tisztaAliasok(req.body.aliasok)]
        );

        res.json(result.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

// Kerület módosítása. Ha a magyar név változik, a hirdetéseken is átírjuk.
router.put("/api/keruletek/:id", csakAdmin, async (req, res) => {

    const client = await db.connect();

    try {

        const r = await client.query("SELECT * FROM keruletek WHERE id = $1", [req.params.id]);
        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const regi = r.rows[0];

        const nev = req.body.nev !== undefined ? (String(req.body.nev).trim() || regi.nev) : regi.nev;
        const nevRo = req.body.nev_ro !== undefined ? (String(req.body.nev_ro).trim() || null) : regi.nev_ro;
        const aliasok = req.body.aliasok !== undefined ? tisztaAliasok(req.body.aliasok) : regi.aliasok;

        await client.query("BEGIN");

        await client.query("UPDATE keruletek SET nev = $1, nev_ro = $2, aliasok = $3 WHERE id = $4", [nev, nevRo, aliasok, regi.id]);

        if (nev !== regi.nev) {
            await client.query("UPDATE ingatlanok SET kerulet = $1 WHERE varos = $2 AND kerulet = $3", [nev, regi.varos, regi.nev]);
        }

        await client.query("COMMIT");

        res.json({ siker: true });

    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        if (err.code === "23505") return res.status(400).json({ error: "duplicate" });
        hiba(res, err);
    } finally {
        client.release();
    }

});

// Kerület törlése – a hirdetéseken üres lesz a kerület
router.delete("/api/keruletek/:id", csakAdmin, async (req, res) => {

    try {

        const r = await db.query("DELETE FROM keruletek WHERE id = $1 RETURNING varos, nev", [req.params.id]);

        if (r.rowCount) {
            await db.query("UPDATE ingatlanok SET kerulet = NULL WHERE varos = $1 AND kerulet = $2", [r.rows[0].varos, r.rows[0].nev]);
        }

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
