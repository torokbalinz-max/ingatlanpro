// ============================================================
//  Ingatlanirodák
//
//  Egy iroda (cég) a saját hirdetéseit egy helyen kezeli:
//   - tagok: kik léphetnek be és kezelhetik a hirdetéseket
//       vezeto: mindent (adatok, tagok, ügynökök, hirdetések)
//       tag:    a hirdetéseket (feladás, szerkesztés, rendszerezés)
//   - ügynökök: a hirdetéseken megjelenő kapcsolattartók (nem kell
//     fiók hozzájuk; ha van, az érdeklődők üzenete nekik megy)
//   - hirdetések rendszerezése: saját hivatkozási szám, mappa / címke,
//     belső megjegyzés, ügynök, archiválás (nem látszik, de megmarad)
//
//  A látogató a hirdetésen látja az iroda nevét, elérhetőségét és az
//  ügynököt; az iroda nyilvános oldalán (#irodak/<id>) az összes aktív
//  hirdetését.
// ============================================================

const express = require("express");
const db = require("../db/database");
const { hiba, csakAdmin, csakBelepve } = require("../lib/http");
const { LISTA_MEZOK } = require("../lib/sql");

const router = express.Router();

const MAX_IRODA = 3;           // egy felhasználó legfeljebb ennyi irodát hozhat létre

const szoveg = (v, max) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s.slice(0, max) : null;
};

const weboldal = v => {
    const s = szoveg(v, 300);
    if (!s) return null;
    return /^https?:\/\//i.test(s) ? s : "https://" + s;
};

// A felhasználó szerepe az irodában: { tag, vezeto } – az admin mindent
async function jog(req, irodaId) {

    if (req.szerep === "admin") return { tag: true, vezeto: true };
    if (!req.user) return { tag: false, vezeto: false };

    const r = await db.query("SELECT szerep FROM iroda_tagok WHERE iroda_id = $1 AND user_id = $2", [irodaId, req.user.id]);

    if (!r.rowCount) return { tag: false, vezeto: false };

    return { tag: true, vezeto: r.rows[0].szerep === "vezeto" };

}

// A felhasználó irodái (a /api/me is ezt adja vissza)
async function sajatIrodak(userId) {
    if (!userId) return [];
    const r = await db.query(`
        SELECT i.id, i.nev, t.szerep FROM iroda_tagok t JOIN irodak i ON i.id = t.iroda_id
        WHERE t.user_id = $1 ORDER BY i.nev`, [userId]);
    return r.rows;
}

const irodaMezok = b => ({
    nev: szoveg(b.nev, 120),
    leiras: szoveg(b.leiras, 3000),
    telefon: szoveg(b.telefon, 40),
    email: szoveg(b.email, 160),
    weboldal: weboldal(b.weboldal),
    cim: szoveg(b.cim, 200),
    varos: szoveg(b.varos, 100)
});

// ===================== IRODA =====================

// Irodák listája (admin: mindegyik; mindenki más: csak a nevek, számokkal)
router.get("/api/irodak", async (req, res) => {
    try {
        const r = await db.query(`
            SELECT i.id, i.nev, i.varos, i.ellenorzott, i.created_at,
                   (SELECT COUNT(*)::int FROM ingatlanok x WHERE x.iroda_id = i.id AND x.statusz = 'aktiv') AS aktiv_db
            FROM irodak i ORDER BY i.nev`);
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }
});

router.get("/api/irodak/sajat", csakBelepve, async (req, res) => {
    try {
        res.json(await sajatIrodak(req.user.id));
    } catch (err) {
        hiba(res, err);
    }
});

router.post("/api/irodak", csakBelepve, async (req, res) => {

    const client = await db.connect();

    try {

        const d = irodaMezok(req.body || {});
        if (!d.nev || d.nev.length < 2) return res.status(400).json({ error: "missing_name" });

        const db_ = await client.query("SELECT COUNT(*)::int AS n FROM irodak WHERE created_by = $1", [req.user.id]);
        if (db_.rows[0].n >= MAX_IRODA && req.szerep !== "admin") return res.status(400).json({ error: "too_many_agencies" });

        await client.query("BEGIN");

        const r = await client.query(
            `INSERT INTO irodak (nev, leiras, telefon, email, weboldal, cim, varos, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [d.nev, d.leiras, d.telefon, d.email, d.weboldal, d.cim, d.varos, req.user.id]
        );

        const iroda = r.rows[0];

        await client.query("INSERT INTO iroda_tagok (iroda_id, user_id, szerep) VALUES ($1, $2, 'vezeto')", [iroda.id, req.user.id]);

        // A létrehozó rögtön ügynök is (a saját elérhetőségével)
        await client.query(
            "INSERT INTO iroda_ugynokok (iroda_id, nev, telefon, email, user_id) VALUES ($1, $2, $3, $4, $5)",
            [iroda.id, req.user.nev || req.user.felhasznalonev || d.nev, req.user.telefon || d.telefon, req.user.email || d.email, req.user.id]
        );

        await client.query("COMMIT");

        res.json(iroda);

    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        hiba(res, err);
    } finally {
        client.release();
    }

});

// Nyilvános adatlap: az iroda, az ügynökei és az aktív hirdetései
router.get("/api/irodak/:id", async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM irodak WHERE id = $1", [req.params.id]);
        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const iroda = r.rows[0];
        const j = await jog(req, iroda.id);

        const ugynokok = await db.query(
            `SELECT id, nev, telefon, email, aktiv, user_id IS NOT NULL AS van_fiok ${j.tag ? ", user_id" : ""} FROM iroda_ugynokok
             WHERE iroda_id = $1 ${j.tag ? "" : "AND aktiv"} ORDER BY nev`, [iroda.id]);

        const hirdetesek = await db.query(
            `SELECT ${LISTA_MEZOK} FROM ingatlanok i WHERE i.iroda_id = $1 AND i.statusz = 'aktiv' ORDER BY i.created_at DESC`,
            [iroda.id]);

        res.json({
            ...iroda,
            created_by: undefined,
            ugynokok: ugynokok.rows,
            hirdetesek: hirdetesek.rows,
            jog: j
        });

    } catch (err) {
        hiba(res, err);
    }

});

router.put("/api/irodak/:id", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).vezeto) return res.status(403).json({ error: "not_manager" });

        const d = irodaMezok(req.body || {});
        if (!d.nev || d.nev.length < 2) return res.status(400).json({ error: "missing_name" });

        const r = await db.query(
            `UPDATE irodak SET nev=$1, leiras=$2, telefon=$3, email=$4, weboldal=$5, cim=$6, varos=$7, updated_at=NOW()
             WHERE id=$8 RETURNING *`,
            [d.nev, d.leiras, d.telefon, d.email, d.weboldal, d.cim, d.varos, id]
        );

        res.json(r.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

// Az admin megjelölheti ellenőrzöttként (a hirdetéseken jelvény)
router.put("/api/irodak/:id/ellenorzott", csakAdmin, async (req, res) => {
    try {
        await db.query("UPDATE irodak SET ellenorzott = $1 WHERE id = $2", [!!req.body.ellenorzott, req.params.id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }
});

// Iroda törlése: a hirdetések megmaradnak (a feladójuknál), csak az iroda kerül le róluk
router.delete("/api/irodak/:id", csakBelepve, async (req, res) => {

    const client = await db.connect();

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).vezeto) return res.status(403).json({ error: "not_manager" });

        await client.query("BEGIN");
        await client.query("UPDATE ingatlanok SET iroda_id = NULL, ugynok_id = NULL, iroda_mappa = NULL, iroda_megjegyzes = NULL WHERE iroda_id = $1", [id]);
        await client.query("DELETE FROM irodak WHERE id = $1", [id]);
        await client.query("COMMIT");

        res.json({ siker: true });

    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        hiba(res, err);
    } finally {
        client.release();
    }

});

// ===================== TAGOK =====================

router.get("/api/irodak/:id/tagok", csakBelepve, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!(await jog(req, id)).tag) return res.status(403).json({ error: "not_member" });
        const r = await db.query(`
            SELECT u.id, COALESCE(u.nev, u.felhasznalonev) AS nev, u.email, t.szerep, t.created_at
            FROM iroda_tagok t JOIN users u ON u.id = t.user_id WHERE t.iroda_id = $1 ORDER BY t.szerep DESC, u.nev`, [id]);
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }
});

// Tag hozzáadása e-mail cím alapján (a kollégának előbb regisztrálnia kell)
router.post("/api/irodak/:id/tagok", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).vezeto) return res.status(403).json({ error: "not_manager" });

        const email = String(req.body.email || "").trim().toLowerCase();
        const szerep = req.body.szerep === "vezeto" ? "vezeto" : "tag";

        const u = await db.query("SELECT id, nev, telefon, email FROM users WHERE LOWER(email) = $1 OR LOWER(felhasznalonev) = $1", [email]);
        if (!u.rowCount) return res.status(404).json({ error: "user_not_found" });

        const user = u.rows[0];

        await db.query(
            `INSERT INTO iroda_tagok (iroda_id, user_id, szerep) VALUES ($1, $2, $3)
             ON CONFLICT (iroda_id, user_id) DO UPDATE SET szerep = EXCLUDED.szerep`,
            [id, user.id, szerep]
        );

        // Ha még nincs ügynök-kártyája, kap egyet
        const van = await db.query("SELECT 1 FROM iroda_ugynokok WHERE iroda_id = $1 AND user_id = $2", [id, user.id]);
        if (!van.rowCount && req.body.ugynok !== false) {
            await db.query(
                "INSERT INTO iroda_ugynokok (iroda_id, nev, telefon, email, user_id) VALUES ($1, $2, $3, $4, $5)",
                [id, user.nev || email, user.telefon, user.email, user.id]
            );
        }

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

router.delete("/api/irodak/:id/tagok/:userId", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        const userId = Number(req.params.userId);
        const j = await jog(req, id);

        // Kilépni magától bárki tud; mást csak a vezető vehet ki
        if (!j.vezeto && !(req.user && req.user.id === userId)) return res.status(403).json({ error: "not_manager" });

        const vezetok = await db.query("SELECT user_id FROM iroda_tagok WHERE iroda_id = $1 AND szerep = 'vezeto'", [id]);
        if (vezetok.rows.length === 1 && vezetok.rows[0].user_id === userId) return res.status(400).json({ error: "last_manager" });

        await db.query("DELETE FROM iroda_tagok WHERE iroda_id = $1 AND user_id = $2", [id, userId]);
        await db.query("UPDATE iroda_ugynokok SET user_id = NULL WHERE iroda_id = $1 AND user_id = $2", [id, userId]);

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== ÜGYNÖKÖK =====================

router.post("/api/irodak/:id/ugynokok", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).vezeto) return res.status(403).json({ error: "not_manager" });

        const nev = szoveg(req.body.nev, 100);
        if (!nev) return res.status(400).json({ error: "missing_name" });

        const r = await db.query(
            "INSERT INTO iroda_ugynokok (iroda_id, nev, telefon, email) VALUES ($1, $2, $3, $4) RETURNING *",
            [id, nev, szoveg(req.body.telefon, 40), szoveg(req.body.email, 160)]
        );

        res.json(r.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

router.put("/api/irodak/:id/ugynokok/:uid", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        const j = await jog(req, id);

        const u = await db.query("SELECT * FROM iroda_ugynokok WHERE id = $1 AND iroda_id = $2", [req.params.uid, id]);
        if (!u.rowCount) return res.status(404).json({ error: "not_found" });

        // A saját ügynök-kártyáját bárki szerkesztheti, a többit a vezető
        const sajat = req.user && u.rows[0].user_id === req.user.id;
        if (!j.vezeto && !(j.tag && sajat)) return res.status(403).json({ error: "not_manager" });

        const nev = szoveg(req.body.nev, 100) || u.rows[0].nev;

        const r = await db.query(
            "UPDATE iroda_ugynokok SET nev = $1, telefon = $2, email = $3, aktiv = $4 WHERE id = $5 RETURNING *",
            [nev, szoveg(req.body.telefon, 40), szoveg(req.body.email, 160), req.body.aktiv !== false, u.rows[0].id]
        );

        res.json(r.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

router.delete("/api/irodak/:id/ugynokok/:uid", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).vezeto) return res.status(403).json({ error: "not_manager" });

        await db.query("UPDATE ingatlanok SET ugynok_id = NULL WHERE iroda_id = $1 AND ugynok_id = $2", [id, req.params.uid]);
        await db.query("DELETE FROM iroda_ugynokok WHERE id = $1 AND iroda_id = $2", [req.params.uid, id]);

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== HIRDETÉSEK KEZELÉSE =====================

// Az iroda összes hirdetése (archivált, jóváhagyásra váró is) a belső adatokkal
router.get("/api/irodak/:id/hirdetesek", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).tag) return res.status(403).json({ error: "not_member" });

        const r = await db.query(`
            SELECT ${LISTA_MEZOK}, i.iroda_mappa, i.iroda_megjegyzes,
                   (SELECT COUNT(*)::int FROM favorites f WHERE f.property_id = i.id) AS kedvenc_db,
                   (SELECT COUNT(*)::int FROM uzenetek m WHERE m.ingatlan_id = i.id) AS uzenet_db
            FROM ingatlanok i WHERE i.iroda_id = $1 ORDER BY i.id DESC`, [id]);

        res.json(r.rows);

    } catch (err) {
        hiba(res, err);
    }

});

// Tömeges műveletek a kijelölt hirdetéseken
//  muvelet: ugynok | mappa | archival | aktival | eladva | nem_eladva | torles
router.patch("/api/irodak/:id/hirdetesek", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).tag) return res.status(403).json({ error: "not_member" });

        const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
        if (!ids.length) return res.status(400).json({ error: "no_selection" });

        const ertek = req.body.ertek;
        const hol = "WHERE iroda_id = $1 AND id = ANY($2::int[])";
        let r;

        switch (req.body.muvelet) {

            case "ugynok": {
                const uid = ertek ? Number(ertek) : null;
                if (uid) {
                    const van = await db.query("SELECT 1 FROM iroda_ugynokok WHERE id = $1 AND iroda_id = $2", [uid, id]);
                    if (!van.rowCount) return res.status(400).json({ error: "bad_agent" });
                }
                r = await db.query(`UPDATE ingatlanok SET ugynok_id = $3, updated_at = NOW() ${hol}`, [id, ids, uid]);
                break;
            }

            case "mappa":
                r = await db.query(`UPDATE ingatlanok SET iroda_mappa = $3, updated_at = NOW() ${hol}`, [id, ids, szoveg(ertek, 60)]);
                break;

            // Archiválás: nem látszik az oldalon, de megmarad (később újra aktiválható)
            case "archival":
                r = await db.query(`UPDATE ingatlanok SET statusz = 'archiv', updated_at = NOW() ${hol} AND statusz = 'aktiv'`, [id, ids]);
                break;

            case "aktival":
                r = await db.query(`UPDATE ingatlanok SET statusz = 'aktiv', updated_at = NOW() ${hol} AND statusz = 'archiv'`, [id, ids]);
                break;

            case "eladva":
                r = await db.query(`UPDATE ingatlanok SET eladva = true, updated_at = NOW() ${hol}`, [id, ids]);
                break;

            case "nem_eladva":
                r = await db.query(`UPDATE ingatlanok SET eladva = false, updated_at = NOW() ${hol}`, [id, ids]);
                break;

            case "torles":
                await db.query(`DELETE FROM favorites WHERE property_id IN (SELECT id FROM ingatlanok ${hol})`, [id, ids]);
                r = await db.query(`DELETE FROM ingatlanok ${hol}`, [id, ids]);
                break;

            default:
                return res.status(400).json({ error: "bad_action" });

        }

        res.json({ siker: true, db: r.rowCount });

    } catch (err) {
        hiba(res, err);
    }

});

// Egy hirdetés belső adatai (hivatkozási szám, mappa, megjegyzés, ügynök)
router.put("/api/irodak/:id/hirdetesek/:hid", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).tag) return res.status(403).json({ error: "not_member" });

        const b = req.body || {};
        const uid = b.ugynok_id ? Number(b.ugynok_id) : null;

        if (uid) {
            const van = await db.query("SELECT 1 FROM iroda_ugynokok WHERE id = $1 AND iroda_id = $2", [uid, id]);
            if (!van.rowCount) return res.status(400).json({ error: "bad_agent" });
        }

        const r = await db.query(`
            UPDATE ingatlanok SET iroda_ref = $3, iroda_mappa = $4, iroda_megjegyzes = $5, ugynok_id = $6, updated_at = NOW()
            WHERE iroda_id = $1 AND id = $2`,
            [id, req.params.hid, szoveg(b.iroda_ref, 40), szoveg(b.iroda_mappa, 60), szoveg(b.iroda_megjegyzes, 2000), uid]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// A saját (magánszemélyként feladott) hirdetéseim átvitele az irodához
router.post("/api/irodak/:id/atvetel", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).tag) return res.status(403).json({ error: "not_member" });

        const ug = await db.query("SELECT id FROM iroda_ugynokok WHERE iroda_id = $1 AND user_id = $2 LIMIT 1", [id, req.user.id]);

        const r = await db.query(
            "UPDATE ingatlanok SET iroda_id = $1, ugynok_id = COALESCE(ugynok_id, $3) WHERE owner_id = $2 AND iroda_id IS NULL",
            [id, req.user.id, ug.rows[0] ? ug.rows[0].id : null]
        );

        res.json({ siker: true, db: r.rowCount });

    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
module.exports.jog = jog;
module.exports.sajatIrodak = sajatIrodak;
