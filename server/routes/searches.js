// ============================================================
//  Mentett keresések (bejelentkezve)
// ============================================================

const express = require("express");
const db = require("../db/database");
const matching = require("../services/matching");
const { normLink } = require("../services/listing");
const { hiba, csakBelepve } = require("../lib/http");

const router = express.Router();

// A kereső szűrőiből csak az ismert mezőket tároljuk
const MEZOK = ["varos", "tipus", "ugylet", "minAr", "maxAr", "minNm", "maxNm", "minSzoba", "maxSzoba",
    "minEmelet", "maxEmelet", "jelleg", "allapot", "kerulet", "telepules", "hely", "hideDup", "onlyPhotos"];

function tisztaSzurok(f) {
    const o = {};
    MEZOK.forEach(k => {
        const v = f ? f[k] : undefined;
        if (v === undefined || v === null || v === "") return;
        o[k] = typeof v === "number" || typeof v === "boolean" ? v : String(v).slice(0, 100);
    });
    if (!o.varos) throw Object.assign(new Error("no_city"), { kod: "no_city" });
    o.tipus = o.tipus || "lakas";
    o.ugylet = o.ugylet || "elado";
    return o;
}

// A mentett keresések, mindegyiknél a legutóbbi megnézés óta érkezett
// új találatok száma
router.get("/api/keresesek", csakBelepve, async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM mentett_keresesek WHERE user_id = $1 ORDER BY created_at DESC", [req.user.id]);

        const cache = new Map();
        const lista = [];

        for (const s of r.rows) {

            const f = s.szurok || {};
            const kulcs = `${f.varos}|${f.tipus}|${f.ugylet}`;

            if (!cache.has(kulcs)) cache.set(kulcs, await matching.aktivHirdetesek(f.varos, f.tipus || "lakas", f.ugylet || "elado"));

            let illo = cache.get(kulcs).filter(i => matching.keresesIllik(i, f));

            // Mint a keresőben: ugyanaz a link csak egyszer számít
            if (f.hideDup !== false) {
                const latott = new Set();
                illo = illo.filter(i => {
                    const k = normLink(i.link);
                    if (!k) return true;
                    if (latott.has(k)) return false;
                    latott.add(k);
                    return true;
                });
            }

            lista.push({
                ...s,
                osszes: illo.length,
                uj: illo.filter(i => new Date(i.created_at) > new Date(s.utolso_megtekintes)).length
            });

        }

        res.json(lista);

    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/keresesek", csakBelepve, async (req, res) => {

    try {

        const szurok = tisztaSzurok(req.body.szurok);
        const nev = String(req.body.nev || "").trim().slice(0, 80) || null;

        const db0 = await db.query("SELECT COUNT(*)::int AS n FROM mentett_keresesek WHERE user_id = $1", [req.user.id]);
        if (db0.rows[0].n >= 30) return res.status(400).json({ error: "too_many_searches" });

        const r = await db.query(
            "INSERT INTO mentett_keresesek (user_id, nev, szurok, ertesites) VALUES ($1, $2, $3::jsonb, $4) RETURNING *",
            [req.user.id, nev, JSON.stringify(szurok), req.body.ertesites !== false]
        );

        res.json(r.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

router.put("/api/keresesek/:id", csakBelepve, async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM mentett_keresesek WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const s = r.rows[0];
        const nev = req.body.nev !== undefined ? (String(req.body.nev).trim().slice(0, 80) || null) : s.nev;
        const ertesites = req.body.ertesites !== undefined ? !!req.body.ertesites : s.ertesites;
        const szurok = req.body.szurok ? tisztaSzurok(req.body.szurok) : s.szurok;

        const u = await db.query(
            "UPDATE mentett_keresesek SET nev = $1, ertesites = $2, szurok = $3::jsonb WHERE id = $4 RETURNING *",
            [nev, ertesites, JSON.stringify(szurok), s.id]
        );

        res.json(u.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

// Megnéztem a találatokat -> az "új" számláló nullázódik
router.post("/api/keresesek/:id/megnez", csakBelepve, async (req, res) => {
    try {
        await db.query("UPDATE mentett_keresesek SET utolso_megtekintes = NOW() WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }
});

router.delete("/api/keresesek/:id", csakBelepve, async (req, res) => {
    try {
        await db.query("DELETE FROM mentett_keresesek WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }
});

module.exports = router;
