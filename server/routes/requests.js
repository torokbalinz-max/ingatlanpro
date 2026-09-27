// ============================================================
//  Keresési igények ("Keresek")
//
//  A vevő leírja, milyen ingatlant keres (típus, város, kerületek,
//  ár, méret, szobák + szabad szöveg). Az eladók / ingatlanosok
//  válaszolhatnak rá üzenetben, és ajánlhatják a saját hirdetésüket.
//  A vevő elérhetősége nem nyilvános – csak az üzenetekben látszik,
//  amit ő maga megír.
// ============================================================

const express = require("express");
const db = require("../db/database");
const matching = require("../services/matching");
const notify = require("../services/notify");
const { TIPUSOK, UGYLETEK } = require("../services/listing");
const { hiba, csakBelepve } = require("../lib/http");

const router = express.Router();

const NAPOK = 90;          // ennyi napig aktív egy igény (meghosszabbítható)
const MAX_AKTIV = 10;      // egy felhasználónak egyszerre ennyi aktív igénye lehet

const szam = v => (v === null || v === undefined || v === "" || isNaN(Number(v))) ? null : Number(v);

function adat(b) {

    const tipus = TIPUSOK.includes(b.tipus) ? b.tipus : "lakas";
    const ugylet = UGYLETEK.includes(b.ugylet) ? b.ugylet : "elado";
    const varos = String(b.varos || "").trim().slice(0, 100);

    if (!varos) throw Object.assign(new Error("no_city"), { kod: "no_city" });

    const leiras = String(b.leiras || "").trim().slice(0, 3000);
    if (leiras.length < 10) throw Object.assign(new Error("short_description"), { kod: "short_description" });

    return {
        tipus, ugylet, varos,
        keruletek: Array.isArray(b.keruletek) ? b.keruletek.map(x => String(x).slice(0, 100)).filter(Boolean).slice(0, 20) : [],
        telepules: String(b.telepules || "").trim().slice(0, 100) || null,
        min_ar: szam(b.min_ar), max_ar: szam(b.max_ar),
        min_nm: szam(b.min_nm), max_nm: szam(b.max_nm),
        min_szoba: szam(b.min_szoba), max_szoba: szam(b.max_szoba),
        cim: String(b.cim || "").trim().slice(0, 120) || null,
        leiras
    };

}

// Keresztnév (a vevő teljes neve nem nyilvános)
const rovidNev = n => String(n || "").trim().split(/\s+/)[0] || "?";

// Nyilvános lista: az aktív igények (szűrhető városra, típusra, ügyletre)
router.get("/api/igenyek", async (req, res) => {

    try {

        const felt = ["g.statusz = 'aktiv'", "(g.lejar IS NULL OR g.lejar > NOW())"];
        const p = [];

        if (req.query.varos) { p.push(req.query.varos); felt.push(`g.varos = $${p.length}`); }
        if (req.query.tipus) { p.push(req.query.tipus); felt.push(`g.tipus = $${p.length}`); }
        if (req.query.ugylet) { p.push(req.query.ugylet); felt.push(`g.ugylet = $${p.length}`); }

        const r = await db.query(`
            SELECT g.id, g.user_id, g.ugylet, g.tipus, g.varos, g.keruletek, g.telepules, g.min_ar, g.max_ar,
                   g.min_nm, g.max_nm, g.min_szoba, g.max_szoba, g.cim, g.leiras, g.created_at, g.lejar,
                   COALESCE(u.nev, u.felhasznalonev) AS nev,
                   (SELECT COUNT(DISTINCT m.felado_id) FROM uzenetek m WHERE m.igeny_id = g.id AND m.felado_id <> g.user_id)::int AS valaszok
            FROM igenyek g JOIN users u ON u.id = g.user_id
            WHERE ${felt.join(" AND ")}
            ORDER BY g.created_at DESC
            LIMIT 300
        `, p);

        const uid = req.user ? req.user.id : null;

        res.json(r.rows.map(g => ({ ...g, nev: rovidNev(g.nev), sajat: g.user_id === uid, user_id: undefined })));

    } catch (err) {
        hiba(res, err);
    }

});

// A saját igényeim (a lezártak és lejártak is)
router.get("/api/igenyek/sajat", csakBelepve, async (req, res) => {

    try {

        const r = await db.query(`
            SELECT g.*,
                   (SELECT COUNT(DISTINCT m.felado_id) FROM uzenetek m WHERE m.igeny_id = g.id AND m.felado_id <> g.user_id)::int AS valaszok,
                   (SELECT COUNT(*) FROM uzenetek m WHERE m.igeny_id = g.id AND m.cimzett_id = g.user_id AND NOT m.olvasva)::int AS olvasatlan
            FROM igenyek g WHERE g.user_id = $1 ORDER BY g.created_at DESC
        `, [req.user.id]);

        // Hány hirdetés illik most rá
        for (const g of r.rows) {
            const lista = await matching.aktivHirdetesek(g.varos, g.tipus, g.ugylet);
            g.illeszkedo = lista.filter(i => matching.igenyIllik(i, g)).length;
        }

        res.json(r.rows);

    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/igenyek/:id", async (req, res) => {

    try {

        const r = await db.query(`
            SELECT g.*, COALESCE(u.nev, u.felhasznalonev) AS nev,
                   (SELECT COUNT(DISTINCT m.felado_id) FROM uzenetek m WHERE m.igeny_id = g.id AND m.felado_id <> g.user_id)::int AS valaszok
            FROM igenyek g JOIN users u ON u.id = g.user_id WHERE g.id = $1`, [req.params.id]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const g = r.rows[0];
        const sajat = !!(req.user && req.user.id === g.user_id);

        if (!sajat && g.statusz !== "aktiv" && req.szerep !== "admin") return res.status(404).json({ error: "not_found" });

        // Illeszkedő hirdetések: a vevőnek mind, az eladónak a saját hirdetései közül
        // (ezeket tudja egy kattintással ajánlani)
        let illeszkedo = [];
        let sajatHirdetesek = [];

        if (sajat) {
            illeszkedo = (await matching.aktivHirdetesek(g.varos, g.tipus, g.ugylet)).filter(i => matching.igenyIllik(i, g)).slice(0, 60);
        } else if (req.user) {
            const s = await db.query(`
                SELECT id, cim, ar, nm, szobak, tipus, ugylet, varos, kerulet, telepules FROM ingatlanok
                WHERE owner_id = $1 AND statusz = 'aktiv' ORDER BY id DESC`, [req.user.id]);
            sajatHirdetesek = s.rows.map(i => ({ ...i, illik: matching.igenyIllik(i, g) }));
        }

        res.json({ ...g, nev: sajat ? g.nev : rovidNev(g.nev), sajat, user_id: sajat ? g.user_id : undefined, illeszkedo, sajatHirdetesek });

    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/igenyek", csakBelepve, async (req, res) => {

    try {

        const d = adat(req.body || {});

        const n = await db.query(
            "SELECT COUNT(*)::int AS n FROM igenyek WHERE user_id = $1 AND statusz = 'aktiv' AND (lejar IS NULL OR lejar > NOW())",
            [req.user.id]
        );
        if (n.rows[0].n >= MAX_AKTIV) return res.status(400).json({ error: "too_many_requests" });

        const r = await db.query(`
            INSERT INTO igenyek (user_id, ugylet, tipus, varos, keruletek, telepules, min_ar, max_ar, min_nm, max_nm,
                                 min_szoba, max_szoba, cim, leiras, lejar, utolso_ertesites)
            VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14, NOW() + INTERVAL '${NAPOK} days', NOW())
            RETURNING *`,
            [req.user.id, d.ugylet, d.tipus, d.varos, JSON.stringify(d.keruletek), d.telepules, d.min_ar, d.max_ar,
             d.min_nm, d.max_nm, d.min_szoba, d.max_szoba, d.cim, d.leiras]
        );

        res.json(r.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

// Módosítás / lezárás / meghosszabbítás (a sajátját)
router.put("/api/igenyek/:id", csakBelepve, async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM igenyek WHERE id = $1", [req.params.id]);
        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const g = r.rows[0];
        if (g.user_id !== req.user.id && req.szerep !== "admin") return res.status(403).json({ error: "not_owner" });

        // Csak állapotváltás
        if (req.body.statusz && Object.keys(req.body).length <= 2) {

            const statusz = req.body.statusz === "lezart" ? "lezart" : "aktiv";

            const u = await db.query(`
                UPDATE igenyek SET statusz = $1, updated_at = NOW(),
                       lejar = CASE WHEN $1 = 'aktiv' THEN NOW() + INTERVAL '${NAPOK} days' ELSE lejar END
                WHERE id = $2 RETURNING *`, [statusz, g.id]);

            return res.json(u.rows[0]);

        }

        const d = adat({ ...g, ...req.body });

        const u = await db.query(`
            UPDATE igenyek SET ugylet=$1, tipus=$2, varos=$3, keruletek=$4::jsonb, telepules=$5, min_ar=$6, max_ar=$7,
                   min_nm=$8, max_nm=$9, min_szoba=$10, max_szoba=$11, cim=$12, leiras=$13, updated_at=NOW()
            WHERE id = $14 RETURNING *`,
            [d.ugylet, d.tipus, d.varos, JSON.stringify(d.keruletek), d.telepules, d.min_ar, d.max_ar,
             d.min_nm, d.max_nm, d.min_szoba, d.max_szoba, d.cim, d.leiras, g.id]
        );

        res.json(u.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

router.delete("/api/igenyek/:id", csakBelepve, async (req, res) => {

    try {

        const r = await db.query("SELECT user_id FROM igenyek WHERE id = $1", [req.params.id]);
        if (!r.rowCount) return res.json({ siker: true });
        if (r.rows[0].user_id !== req.user.id && req.szerep !== "admin") return res.status(403).json({ error: "not_owner" });

        await db.query("DELETE FROM igenyek WHERE id = $1", [req.params.id]);

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// Válasz egy igényre (eladó / ingatlanos): üzenet a vevőnek, opcionálisan
// egy saját hirdetés ajánlásával
router.post("/api/igenyek/:id/valasz", csakBelepve, async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM igenyek WHERE id = $1 AND statusz = 'aktiv'", [req.params.id]);
        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const g = r.rows[0];

        if (g.user_id === req.user.id) return res.status(400).json({ error: "own_request" });

        const szoveg = String(req.body.szoveg || "").trim().slice(0, 3000);
        if (szoveg.length < 2) return res.status(400).json({ error: "empty_message" });

        let ajanlott = Number(req.body.ajanlott_ingatlan_id) || null;

        if (ajanlott) {
            const h = await db.query("SELECT id FROM ingatlanok WHERE id = $1 AND statusz = 'aktiv'", [ajanlott]);
            if (!h.rowCount) ajanlott = null;
        }

        const m = await db.query(`
            INSERT INTO uzenetek (felado_id, cimzett_id, igeny_id, ajanlott_ingatlan_id, szoveg)
            VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.user.id, g.user_id, g.id, ajanlott, szoveg]
        );

        notify.ujUzenet({
            cimzettId: g.user_id,
            feladoNev: req.user.nev || req.user.felhasznalonev || "Valaki",
            szoveg,
            tema: g.cim || "keresési igényed",
            req
        }).catch(() => { });

        res.json(m.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
