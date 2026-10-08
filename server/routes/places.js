// ============================================================
//  Városok, kerületek
// ============================================================

const express = require("express");
const db = require("../db/database");
const { hiba, csakAdmin } = require("../lib/http");
const location = require("../services/location");
const districts = require("../services/districts");
const kornyek = require("../services/kornyek");

const router = express.Router();

// A város hirdetéseinek újra besorolása a kerülethatárok alapján (services/districts.js)
const besorol = varos => districts.besorol(varos);

router.get("/api/varosok", async (req, res) => {

    try {
        // anyavaros: ha ez egy "<város> és környéke" város, melyik város környéke
        // db: az aktív hirdetések száma (a keresőben a környék-város ajánlásához)
        await kornyek.osszekapcsol().catch(() => 0);
        const result = await db.query(`
            SELECT v.id, v.nev, v.nev_ro, v.megye, v.x, v.y, v.sugar_km, v.anyavaros,
                   (SELECT COUNT(*) FROM ingatlanok i WHERE i.varos = v.nev AND i.statusz = 'aktiv')::int AS db
            FROM varosok v ORDER BY v.nev`);
        res.json(result.rows);
    } catch (err) {
        hiba(res, err);
    }

});

// "<város> és környéke" város létrehozása (vagy a meglévő) egy városhoz
router.post("/api/varosok/:id/kornyek", csakAdmin, async (req, res) => {

    try {

        const r = await db.query("SELECT nev FROM varosok WHERE id = $1", [req.params.id]);
        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const k = await kornyek.letrehoz(r.rows[0].nev);
        if (!k) return res.status(400).json({ error: "bad_request" });

        location.cacheUrit();
        kornyek.cacheUrit();

        // A biztosan környékbeli hirdetések áthelyezése (háttérben)
        kornyek.rendez({ varos: r.rows[0].nev }).catch(err => console.error("Környék rendezés:", err.message));

        res.json(k);

    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/varosok", csakAdmin, async (req, res) => {

    try {

        const nev = (req.body.nev || "").trim();

        if (!nev) return res.status(400).json({ error: "Hiányzó városnév" });

        // Román név és megye: ezzel a helymeghatározás biztosan a jó várost
        // találja meg (sok a hasonló nevű település)
        const nevRo = String(req.body.nev_ro || "").trim() || null;
        const megye = String(req.body.megye || "").trim() || null;
        const anyavaros = String(req.body.anyavaros || "").trim() || null;

        const result = await db.query(
            `INSERT INTO varosok (nev, nev_ro, megye, anyavaros) VALUES ($1, $2, $3, $4)
             ON CONFLICT (nev) DO UPDATE SET nev_ro = COALESCE(EXCLUDED.nev_ro, varosok.nev_ro), megye = COALESCE(EXCLUDED.megye, varosok.megye),
                 anyavaros = COALESCE(EXCLUDED.anyavaros, varosok.anyavaros)
             RETURNING id, nev, nev_ro, megye, x, y, sugar_km, anyavaros`,
            [nev, nevRo, megye, anyavaros && anyavaros !== nev ? anyavaros : null]
        );

        location.cacheUrit();
        kornyek.cacheUrit();

        // A város közepét rögtön megkeressük (háttérben)
        location.varosAdat(nev).catch(() => { });

        res.json(result.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

// Város adatai: román név, megye, közép (térképen kattintva), méret km-ben
router.put("/api/varosok/:id", csakAdmin, async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM varosok WHERE id = $1", [req.params.id]);
        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const v = r.rows[0];
        const b = req.body || {};
        const szam = (x, regi) => x === undefined ? regi : (x === null || x === "" ? null : Number(x));

        const uj = {
            nev_ro: b.nev_ro !== undefined ? (String(b.nev_ro).trim() || null) : v.nev_ro,
            megye: b.megye !== undefined ? (String(b.megye).trim() || null) : v.megye,
            x: szam(b.x, v.x),
            y: szam(b.y, v.y),
            sugar_km: szam(b.sugar_km, v.sugar_km),
            // Melyik város környéke. Üres szöveg = az admin szerint önálló város
            // (a "… és környéke" nevű várost se kösse magától senkihez)
            anyavaros: b.anyavaros !== undefined ? (String(b.anyavaros || "").trim()) : v.anyavaros
        };

        if (uj.sugar_km !== null && !(uj.sugar_km >= 1 && uj.sugar_km <= 40)) return res.status(400).json({ error: "bad_radius" });
        if (uj.anyavaros === v.nev) uj.anyavaros = "";

        await db.query(
            "UPDATE varosok SET nev_ro = $1, megye = $2, x = $3, y = $4, sugar_km = $5, anyavaros = $6 WHERE id = $7",
            [uj.nev_ro, uj.megye, uj.x, uj.y, uj.sugar_km, uj.anyavaros, v.id]
        );

        location.cacheUrit();
        kornyek.cacheUrit();

        res.json({ siker: true, ...uj });

    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/keruletek", async (req, res) => {

    try {

        const varos = req.query.varos;

        const result = varos
            ? await db.query("SELECT id, varos, nev, nev_ro, aliasok, hatar FROM keruletek WHERE varos=$1 ORDER BY nev", [varos])
            : await db.query("SELECT id, varos, nev, nev_ro, aliasok, hatar FROM keruletek ORDER BY varos, nev");

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

        districts.cacheUrit();

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

        districts.cacheUrit();

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

        districts.cacheUrit();

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== KERÜLETHATÁROK =====================

// Egy kerület határának mentése (null = törlés). Utána a város hirdetéseit
// újra besoroljuk.
router.put("/api/keruletek/:id/hatar", csakAdmin, async (req, res) => {

    try {

        const hatar = req.body.hatar === null ? null : districts.tisztaHatar(req.body.hatar);

        if (req.body.hatar !== null && !hatar) return res.status(400).json({ error: "bad_polygon" });

        const r = await db.query(
            "UPDATE keruletek SET hatar = $1::jsonb WHERE id = $2 RETURNING varos",
            [hatar ? JSON.stringify(hatar) : null, req.params.id]
        );

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        districts.cacheUrit();

        const eredmeny = await besorol(r.rows[0].varos);

        res.json({ siker: true, ...eredmeny });

    } catch (err) {
        hiba(res, err);
    }

});

// Az összes hirdetés újra besorolása a határok alapján
router.post("/api/keruletek/besorol", csakAdmin, async (req, res) => {
    try {
        districts.cacheUrit();
        res.json({ siker: true, ...(await besorol(String(req.body.varos || ""))) });
    } catch (err) {
        hiba(res, err);
    }
});

// Kerület-ellenőrzés: pontos helyű hirdetések, amelyek kerülete eltér a térképtől
router.get("/api/keruletek/ellenorzes", csakAdmin, async (req, res) => {
    try {
        districts.cacheUrit();
        res.json(await districts.ellenorzes(String(req.query.varos || "")));
    } catch (err) {
        hiba(res, err);
    }
});

module.exports = router;
