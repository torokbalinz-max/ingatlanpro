// ============================================================
//  Admin: ellenőrzés, nem elérhető hirdetések, beolvasás, figyelt oldalak, duplikátumok
// ============================================================

const express = require("express");
const db = require("../db/database");
const importer = require("../services/importer");
const duplikatumok = require("../services/duplicates");
const ai = require("../services/ai");
const { hiba, csakAdmin } = require("../lib/http");
const { LISTA_MEZOK } = require("../lib/sql");

const router = express.Router();

// Ellenőrizendő hirdetések: hiányos / gyanús adatok (és a régi "függő" importok)
router.get("/api/admin/review", csakAdmin, async (req, res) => {

    try {
        const r = await db.query(`
            SELECT ${LISTA_MEZOK}, i.forras_szoveg, i.leiras
            FROM ingatlanok i
            WHERE (i.statusz = 'aktiv' AND NOT i.ellenorzott) OR i.statusz = 'fuggo'
            ORDER BY i.id DESC
        `);
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }

});

// Régi név megtartása
router.get("/api/admin/pending", csakAdmin, (req, res) => res.redirect(307, "/api/admin/review"));

// Már nem elérhető (eladott / törölt) hirdetések
router.get("/api/admin/unavailable", csakAdmin, async (req, res) => {

    try {
        const r = await db.query(`SELECT ${LISTA_MEZOK} FROM ingatlanok i WHERE i.statusz = 'nem_elerheto' ORDER BY i.utolso_ellenorzes DESC NULLS LAST`);
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/admin/counts", csakAdmin, async (req, res) => {

    try {
        const r = await db.query(`
            SELECT
                COUNT(*) FILTER (WHERE (statusz = 'aktiv' AND NOT ellenorzott) OR statusz = 'fuggo')::int AS review,
                COUNT(*) FILTER (WHERE statusz = 'nem_elerheto')::int AS unavailable,
                COUNT(*) FILTER (WHERE statusz = 'aktiv')::int AS aktiv,
                COUNT(*) FILTER (WHERE statusz = 'aktiv' AND ellenorzott)::int AS ellenorzott,
                COUNT(*) FILTER (WHERE statusz = 'aktiv' AND forras_tipus = 'kezi')::int AS kezi,
                COUNT(*) FILTER (WHERE statusz = 'aktiv' AND (jsonb_array_length(COALESCE(kulso_kepek, '[]'::jsonb)) > 0
                    OR EXISTS (SELECT 1 FROM ingatlan_kepek k WHERE k.ingatlan_id = ingatlanok.id)))::int AS fotos,
                COUNT(DISTINCT varos) FILTER (WHERE statusz = 'aktiv')::int AS varosok,
                MAX(utolso_ellenorzes) AS utolso_ellenorzes
            FROM ingatlanok
        `);

        const w = await db.query("SELECT COUNT(*)::int AS figyelt, MAX(utolso_futas) AS utolso_futas FROM figyelt_oldalak");

        res.json({ ...r.rows[0], ...w.rows[0], ai: ai.elerheto() });
    } catch (err) {
        hiba(res, err);
    }

});

// Gyors jóváhagyás (az adatok rendben vannak)
router.post("/api/admin/review/:id/approve", csakAdmin, async (req, res) => {

    try {

        const r = await db.query(
            `UPDATE ingatlanok SET jovahagyva = true, ellenorzott = true, statusz = 'aktiv', updated_at = NOW()
             WHERE id = $1 AND ar > 0 AND nm > 0 AND x IS NOT NULL AND y IS NOT NULL
             RETURNING id`,
            [req.params.id]
        );

        if (!r.rowCount) return res.status(400).json({ error: "missing_fields", hianyzo: ["ar", "nm", "hely"] });

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// Nem elérhető hirdetés visszaállítása (ha tévedés volt)
router.post("/api/admin/unavailable/:id/restore", csakAdmin, async (req, res) => {

    try {
        await db.query("UPDATE ingatlanok SET statusz = 'aktiv', updated_at = NOW() WHERE id = $1", [req.params.id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }

});

// Egy hirdetés azonnali újraolvasása a forrásoldalról
router.post("/api/admin/listing/:id/refresh", csakAdmin, async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM ingatlanok WHERE id = $1", [req.params.id]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        if (!r.rows[0].link) return res.status(400).json({ error: "no_link" });

        const job = importer.ujJob("egy");
        await importer.frissitForrasbol(r.rows[0], job);

        res.json({ siker: true, naplo: job.naplo });

    } catch (err) {
        hiba(res, err);
    }

});

// Meglévő hirdetések ellenőrzése a forrásoldalon (háttérben)
router.post("/api/admin/recheck", csakAdmin, (req, res) => {

    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : null;
    const limit = Math.min(Number(req.body.limit) || 100, 500);

    const job = importer.figyelesIndit({ ids, limit });

    res.json({ jobId: job.id });

});

// AI-ellenőrzés (ha be van állítva az ANTHROPIC_API_KEY)
router.post("/api/admin/ai-check/:id", csakAdmin, async (req, res) => {

    try {

        if (!ai.elerheto()) return res.status(400).json({ error: "no_api_key" });

        const r = await db.query("SELECT * FROM ingatlanok WHERE id = $1", [req.params.id]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        res.json(await ai.ellenoriz(r.rows[0]));

    } catch (err) {
        hiba(res, err);
    }

});

// Duplikátumok
router.get("/api/admin/duplicates", csakAdmin, async (req, res) => {

    try {
        res.json(await duplikatumok.keres());
    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/admin/duplicates/clean", csakAdmin, async (req, res) => {

    try {
        res.json(await duplikatumok.biztosTorlese());
    } catch (err) {
        hiba(res, err);
    }

});

// Hibás alapadatú hirdetések törlése (a kijelölt azonosítók)
router.post("/api/admin/invalid/delete", csakAdmin, async (req, res) => {

    try {

        const ids = (req.body.ids || []).map(Number).filter(Boolean);

        if (!ids.length) return res.status(400).json({ error: "bad_request" });

        await db.query("DELETE FROM favorites WHERE property_id = ANY($1::int[])", [ids]);
        const r = await db.query("DELETE FROM ingatlanok WHERE id = ANY($1::int[])", [ids]);

        res.json({ torolt: r.rowCount });

    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/admin/duplicates/merge", csakAdmin, async (req, res) => {

    try {

        const megtart = Number(req.body.megtart);
        const torlendo = (req.body.torlendo || []).map(Number).filter(n => n && n !== megtart);

        if (!megtart || !torlendo.length) return res.status(400).json({ error: "bad_request" });

        res.json(await duplikatumok.osszevon(megtart, torlendo));

    } catch (err) {
        hiba(res, err);
    }

});

// Tömeges beolvasás linkekről
router.post("/api/admin/import", csakAdmin, async (req, res) => {

    try {

        const urls = String(req.body.urls || "")
            .split(/\s+/)
            .map(u => u.trim())
            .filter(u => /^https?:\/\//i.test(u))
            .slice(0, 100);

        if (!urls.length) return res.status(400).json({ error: "no_urls" });

        const varos = String(req.body.varos || "").trim();

        if (!varos) return res.status(400).json({ error: "no_city" });

        const job = importer.indit(urls, {
            varos,
            tipus: req.body.tipus || "lakas",
            ugylet: req.body.ugylet || "elado"
        });

        res.json({ jobId: job.id });

    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/admin/import/:id", csakAdmin, (req, res) => {

    const j = importer.allapot(req.params.id);

    if (!j) return res.status(404).json({ error: "not_found" });

    res.json(j);

});

// Figyelt oldalak
router.get("/api/admin/watch", csakAdmin, async (req, res) => {

    try {
        const r = await db.query("SELECT * FROM figyelt_oldalak ORDER BY id");
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/admin/watch", csakAdmin, async (req, res) => {

    try {

        const url = String(req.body.url || "").trim();
        const varos = String(req.body.varos || "").trim();

        if (!/^https?:\/\//i.test(url) || !varos) return res.status(400).json({ error: "bad_request" });

        const r = await db.query(
            `INSERT INTO figyelt_oldalak (url, nev, varos, tipus, ugylet) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [url, String(req.body.nev || "").trim() || null, varos, req.body.tipus || "lakas", req.body.ugylet || "elado"]
        );

        res.json(r.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

router.delete("/api/admin/watch/:id", csakAdmin, async (req, res) => {

    try {
        await db.query("DELETE FROM figyelt_oldalak WHERE id = $1", [req.params.id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/admin/watch/:id/run", csakAdmin, async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM figyelt_oldalak WHERE id = $1", [req.params.id]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const f = r.rows[0];

        const job = importer.indit([f.url], { varos: f.varos, tipus: f.tipus, ugylet: f.ugylet });

        // A végén az eredményt elmentjük a figyelt oldalhoz
        job.promise.then(j => db.query(
            "UPDATE figyelt_oldalak SET utolso_futas = NOW(), utolso_eredmeny = $1 WHERE id = $2",
            [`${j.uj} új, ${j.frissitett} árváltozás, ${j.kihagyott} már megvolt, ${j.hibak} hiba`, f.id]
        )).catch(err => console.error(err));

        res.json({ jobId: job.id });

    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
