// ============================================================
//  Piaci statisztika: pillanatképek mentése, előzmények, trend
// ============================================================

const express = require("express");
const db = require("../db/database");
const { hiba, csakAdmin } = require("../lib/http");
const piactrend = require("../services/piactrend");

const router = express.Router();

// Egy piaci állapot (pillanatkép) mentése: város + típus + ügylet
async function pillanatkepMent(varos, tipus, ugylet, note = null) {

    const felt = ["ar > 0", "nm > 0", "statusz = 'aktiv'", "COALESCE(ellenorzott, true)", "tipus = $1", "ugylet = $2"];
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

    if (!Number(s.property_count)) return null;

    // A statisztikához vett hirdetések adatai is elmentődnek (később újraszámolható,
    // letölthető) – személyes adat nélkül, csak az ingatlan adatai
    const adatok = await db.query(`
        SELECT id, ar, nm, ROUND(arnm::numeric, 1) AS arnm, kerulet, telepules, allapot, szobak, emelet, evszam,
               to_char(created_at, 'YYYY-MM-DD') AS feladva
        FROM ingatlanok ${where} ORDER BY id`, params);

    const snapshot = await db.query(`
        INSERT INTO market_snapshots
        (varos, tipus, ugylet, property_count, avg_price, median_price, avg_nm, avg_price_nm, min_price_nm, max_price_nm, note, adatok)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
        RETURNING id
    `, [varos, tipus, ugylet, s.property_count, s.avg_price, s.median_price, s.avg_nm, s.avg_price_nm, s.min_price_nm, s.max_price_nm, note, JSON.stringify(adatok.rows)]);

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
        allapot: "COALESCE(NULLIF(TRIM(REPLACE(allapot, '*', '')), ''), 'Ismeretlen')",
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

    return snapshotId;

}

// Automatikus mentés havonta kétszer (1-jén és 16-án): minden város + típus +
// ügylet párosra, amelyiknek ebben a félhónapban még nincs automatikus mentése.
// Induláskor, a cron-nál és 12 óránként fut – ha a szerver alszik, a következő
// ébredéskor pótolja.
function felhoKezdet(d = new Date()) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() >= 16 ? 16 : 1));
}
let havontaFut = false;

async function havontaMent() {

    if (havontaFut) return 0;
    havontaFut = true;

    try {

        const parok = await db.query(`
            SELECT DISTINCT varos, tipus, ugylet FROM ingatlanok
            WHERE statusz = 'aktiv' AND varos IS NOT NULL AND varos <> '' AND ar > 0 AND nm > 0
        `);

        let db_ = 0;

        for (const p of parok.rows) {

            const van = await db.query(`
                SELECT 1 FROM market_snapshots
                WHERE note = 'auto' AND varos = $1 AND tipus = $2 AND ugylet = $3
                  AND created_at >= $4
                LIMIT 1
            `, [p.varos, p.tipus || "lakas", p.ugylet || "elado", felhoKezdet()]);

            if (van.rowCount) continue;

            if (await pillanatkepMent(p.varos, p.tipus || "lakas", p.ugylet || "elado", "auto")) db_++;

        }

        if (db_) console.log(`Félhavi piaci mentés: ${db_} új pillanatkép.`);
        return db_;

    } catch (err) {
        console.error("Havi piaci mentés hiba:", err.message);
        return 0;
    } finally {
        havontaFut = false;
    }

}

// Kézi mentés (admin)
router.post("/api/statistics/save", csakAdmin, async (req, res) => {

    try {

        const varos = (req.body && req.body.varos ? String(req.body.varos) : "").trim() || null;
        const tipus = req.body && req.body.tipus ? String(req.body.tipus) : "lakas";
        const ugylet = req.body && req.body.ugylet ? String(req.body.ugylet) : "elado";

        const id = await pillanatkepMent(varos, tipus, ugylet, null);

        if (!id) return res.status(400).json({ error: "no_data" });

        res.json({ success: true, id });

    } catch (err) {
        hiba(res, err);
    }

});

// Ártrend a hirdetésekből (bármelyik időszakra, mentés nélkül is)
router.get("/api/statistics/piactrend", async (req, res) => {
    try {
        res.json(await piactrend.trend(req.query));
    } catch (err) {
        hiba(res, err);
    }
});

// Két időszak (pl. április és augusztus) összevetése a hirdetésekből
router.get("/api/statistics/osszevetes", async (req, res) => {
    try {
        const r = await piactrend.osszevet(req.query);
        if (!r) return res.status(400).json({ error: "bad_period" });
        res.json(r);
    } catch (err) {
        hiba(res, err);
    }
});

// A mentések listája (a nagy "adatok" mező nélkül); szűrhető városra, típusra, ügyletre
const LISTA_OSZLOPOK = `id, created_at, varos, tipus, ugylet, property_count, avg_price, median_price, avg_nm,
    avg_price_nm, min_price_nm, max_price_nm, note, COALESCE(jsonb_array_length(adatok), 0) AS adat_db`;

router.get("/api/statistics", async (req, res) => {

    try {
        const felt = [], par = [];
        ["varos", "tipus", "ugylet"].forEach(k => {
            if (req.query[k]) { par.push(String(req.query[k])); felt.push(`${k} = $${par.length}`); }
        });
        const result = await db.query(`SELECT ${LISTA_OSZLOPOK} FROM market_snapshots ${felt.length ? "WHERE " + felt.join(" AND ") : ""} ORDER BY created_at DESC LIMIT 500`, par);
        res.json(result.rows);
    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/statistics/trend", async (req, res) => {

    try {
        const result = await db.query(`
            SELECT id, created_at, property_count, avg_price, median_price, avg_price_nm, avg_nm, varos, tipus, ugylet, note
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

        if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: "not_found" });

        const snapshot = await db.query(`SELECT ${LISTA_OSZLOPOK} FROM market_snapshots WHERE id=$1`, [req.params.id]);
        const groups = await db.query("SELECT * FROM market_snapshot_groups WHERE snapshot_id=$1", [req.params.id]);

        res.json({ snapshot: snapshot.rows[0], groups: groups.rows });

    } catch (err) {
        hiba(res, err);
    }

});

// Egy mentés adatai táblázatként (CSV, Excelben megnyitható) – az adminnak
router.get("/api/statistics/:id/csv", csakAdmin, async (req, res) => {

    try {

        if (!/^\d+$/.test(req.params.id)) return res.status(404).end();
        const r = await db.query("SELECT created_at, varos, tipus, ugylet, adatok FROM market_snapshots WHERE id = $1", [req.params.id]);
        if (!r.rowCount) return res.status(404).end();

        const s = r.rows[0];
        const oszlopok = ["id", "ar", "nm", "arnm", "kerulet", "telepules", "allapot", "szobak", "emelet", "evszam", "feladva"];
        const cella = v => {
            const t = v === null || v === undefined ? "" : String(v);
            return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        };
        const sorok = [oszlopok.join(";"), ...(s.adatok || []).map(a => oszlopok.map(k => cella(a[k])).join(";"))];
        const nap = new Date(s.created_at).toISOString().slice(0, 10);

        res.set("Content-Type", "text/csv; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="piac-${(s.varos || "mind").replace(/[^a-z0-9]+/gi, "-")}-${s.tipus}-${s.ugylet}-${nap}.csv"`);
        res.send("\ufeff" + sorok.join("\r\n"));

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
module.exports.havontaMent = havontaMent;
