// ============================================================
//  Üzenetek (bejelentkezve)
//
//  Egy beszélgetés = két felhasználó + a téma (egy keresési igény
//  vagy egy hirdetés). Az e-mail címek nem látszanak egymásnak.
// ============================================================

const express = require("express");
const db = require("../db/database");
const notify = require("../services/notify");
const { hiba, csakBelepve } = require("../lib/http");

const router = express.Router();

// A beszélgetéseim: a legutolsó üzenettel és az olvasatlanok számával
router.get("/api/uzenetek", csakBelepve, async (req, res) => {

    try {

        const r = await db.query(`
            WITH sajat AS (
                SELECT m.*,
                       CASE WHEN m.felado_id = $1 THEN m.cimzett_id ELSE m.felado_id END AS masik_id
                FROM uzenetek m
                WHERE m.felado_id = $1 OR m.cimzett_id = $1
            ),
            utolso AS (
                SELECT DISTINCT ON (masik_id, COALESCE(igeny_id, 0), COALESCE(ingatlan_id, 0)) *
                FROM sajat
                ORDER BY masik_id, COALESCE(igeny_id, 0), COALESCE(ingatlan_id, 0), created_at DESC
            )
            SELECT u.id, u.masik_id, u.igeny_id, u.ingatlan_id, u.szoveg, u.created_at, u.felado_id,
                   COALESCE(x.nev, x.felhasznalonev) AS masik_nev,
                   g.cim AS igeny_cim, g.tipus AS igeny_tipus, g.varos AS igeny_varos, g.user_id AS igeny_user,
                   i.cim AS ingatlan_cim, i.tipus AS ingatlan_tipus, i.varos AS ingatlan_varos,
                   (SELECT COUNT(*) FROM sajat s
                     WHERE s.masik_id = u.masik_id AND COALESCE(s.igeny_id, 0) = COALESCE(u.igeny_id, 0)
                       AND COALESCE(s.ingatlan_id, 0) = COALESCE(u.ingatlan_id, 0)
                       AND s.cimzett_id = $1 AND NOT s.olvasva)::int AS olvasatlan
            FROM utolso u
            LEFT JOIN users x ON x.id = u.masik_id
            LEFT JOIN igenyek g ON g.id = u.igeny_id
            LEFT JOIN ingatlanok i ON i.id = u.ingatlan_id
            ORDER BY u.created_at DESC
        `, [req.user.id]);

        res.json(r.rows);

    } catch (err) {
        hiba(res, err);
    }

});

function temaFeltetel(q, p) {
    const felt = [];
    const igeny = Number(q.igeny) || null;
    const ingatlan = Number(q.ingatlan) || null;
    p.push(igeny); felt.push(`COALESCE(m.igeny_id, 0) = COALESCE($${p.length}::int, 0)`);
    p.push(ingatlan); felt.push(`COALESCE(m.ingatlan_id, 0) = COALESCE($${p.length}::int, 0)`);
    return felt;
}

// Egy beszélgetés üzenetei (és olvasottnak jelölés)
router.get("/api/uzenetek/beszelgetes", csakBelepve, async (req, res) => {

    try {

        const masik = Number(req.query.masik);
        if (!masik) return res.status(400).json({ error: "bad_request" });

        const p = [req.user.id, masik];
        const felt = temaFeltetel(req.query, p);

        const r = await db.query(`
            SELECT m.id, m.felado_id, m.cimzett_id, m.szoveg, m.created_at, m.olvasva, m.igeny_id, m.ingatlan_id,
                   m.ajanlott_ingatlan_id,
                   a.cim AS ajanlott_cim, a.ar AS ajanlott_ar, a.nm AS ajanlott_nm, a.tipus AS ajanlott_tipus, a.ugylet AS ajanlott_ugylet
            FROM uzenetek m
            LEFT JOIN ingatlanok a ON a.id = m.ajanlott_ingatlan_id
            WHERE ((m.felado_id = $1 AND m.cimzett_id = $2) OR (m.felado_id = $2 AND m.cimzett_id = $1))
              AND ${felt.join(" AND ")}
            ORDER BY m.created_at
        `, p);

        await db.query(`
            UPDATE uzenetek m SET olvasva = true
            WHERE m.cimzett_id = $1 AND m.felado_id = $2 AND NOT m.olvasva AND ${felt.join(" AND ")}
        `, p);

        const u = await db.query("SELECT id, COALESCE(nev, felhasznalonev) AS nev FROM users WHERE id = $1", [masik]);

        res.json({ masik: u.rows[0] || { id: masik, nev: "?" }, uzenetek: r.rows });

    } catch (err) {
        hiba(res, err);
    }

});

// Válasz egy meglévő beszélgetésben
router.post("/api/uzenetek", csakBelepve, async (req, res) => {

    try {

        const masik = Number(req.body.masik);
        const szoveg = String(req.body.szoveg || "").trim().slice(0, 3000);

        if (!masik || masik === req.user.id) return res.status(400).json({ error: "bad_request" });
        if (szoveg.length < 1) return res.status(400).json({ error: "empty_message" });

        const p = [req.user.id, masik];
        const felt = temaFeltetel({ igeny: req.body.igeny_id, ingatlan: req.body.ingatlan_id }, p);

        // Csak meglévő beszélgetésben (az első üzenet az igénynél / a hirdetésnél indul)
        const van = await db.query(`
            SELECT 1 FROM uzenetek m
            WHERE ((m.felado_id = $1 AND m.cimzett_id = $2) OR (m.felado_id = $2 AND m.cimzett_id = $1))
              AND ${felt.join(" AND ")} LIMIT 1`, p);

        if (!van.rowCount) return res.status(400).json({ error: "no_conversation" });

        const m = await db.query(`
            INSERT INTO uzenetek (felado_id, cimzett_id, igeny_id, ingatlan_id, szoveg)
            VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.user.id, masik, Number(req.body.igeny_id) || null, Number(req.body.ingatlan_id) || null, szoveg]
        );

        notify.ujUzenet({ cimzettId: masik, feladoNev: req.user.nev || req.user.felhasznalonev || "Valaki", szoveg, req }).catch(() => { });

        res.json(m.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

// Kérdés a hirdetőtől (csak az oldalon feltöltött, fiókhoz tartozó hirdetéseknél)
router.post("/api/ingatlanok/:id/uzenet", csakBelepve, async (req, res) => {

    try {

        const r = await db.query("SELECT id, owner_id, cim FROM ingatlanok WHERE id = $1", [req.params.id]);
        const i = r.rows[0];

        if (!i || !i.owner_id) return res.status(400).json({ error: "no_owner" });
        if (i.owner_id === req.user.id) return res.status(400).json({ error: "own_listing" });

        const szoveg = String(req.body.szoveg || "").trim().slice(0, 3000);
        if (szoveg.length < 2) return res.status(400).json({ error: "empty_message" });

        const m = await db.query(`
            INSERT INTO uzenetek (felado_id, cimzett_id, ingatlan_id, szoveg) VALUES ($1, $2, $3, $4) RETURNING *`,
            [req.user.id, i.owner_id, i.id, szoveg]
        );

        notify.ujUzenet({
            cimzettId: i.owner_id,
            feladoNev: req.user.nev || req.user.felhasznalonev || "Valaki",
            szoveg,
            tema: i.cim || `#${i.id} hirdetés`,
            req
        }).catch(() => { });

        res.json(m.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
