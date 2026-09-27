// ============================================================
//  Városok, kerületek
// ============================================================

const express = require("express");
const db = require("../db/database");
const { hiba, csakAdmin } = require("../lib/http");
const location = require("../services/location");
const districts = require("../services/districts");
const { TIPUS_MEZOK } = require("../services/listing");

const router = express.Router();

router.get("/api/varosok", async (req, res) => {

    try {
        const result = await db.query("SELECT id, nev, nev_ro, megye, x, y, sugar_km FROM varosok ORDER BY nev");
        res.json(result.rows);
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

        const result = await db.query(
            `INSERT INTO varosok (nev, nev_ro, megye) VALUES ($1, $2, $3)
             ON CONFLICT (nev) DO UPDATE SET nev_ro = COALESCE(EXCLUDED.nev_ro, varosok.nev_ro), megye = COALESCE(EXCLUDED.megye, varosok.megye)
             RETURNING id, nev, nev_ro, megye, x, y, sugar_km`,
            [nev, nevRo, megye]
        );

        location.cacheUrit();

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
            sugar_km: szam(b.sugar_km, v.sugar_km)
        };

        if (uj.sugar_km !== null && !(uj.sugar_km >= 1 && uj.sugar_km <= 40)) return res.status(400).json({ error: "bad_radius" });

        await db.query(
            "UPDATE varosok SET nev_ro = $1, megye = $2, x = $3, y = $4, sugar_km = $5 WHERE id = $6",
            [uj.nev_ro, uj.megye, uj.x, uj.y, uj.sugar_km, v.id]
        );

        location.cacheUrit();

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

//  1) Pontos / utca szintű helynél a határ dönti el a kerületet
//  2) Közelítő helynél (csak a kerületet tudjuk): a kerület közepére tesszük,
//     a kör a kerület méretéhez igazodik – így nem gyűlik minden a város közepén
//  3) Hely nélküli, de kerülettel ismert hirdetés: közelítő hely a kerületben
//  Amit ember tett le a térképen (hely_kezi), azt nem mozgatjuk.
async function besorol(varos) {

    const e = { keruletValtozott: 0, athelyezve: 0, ujHely: 0 };

    if (!varos || !(await districts.vanHatar(varos))) return e;

    const keruletes = Object.keys(TIPUS_MEZOK).filter(t => TIPUS_MEZOK[t].kerulet);

    const r = await db.query(`
        SELECT id, x, y, kerulet, hely_pontossag, hely_kezi, hely_forras, telepules
        FROM ingatlanok WHERE varos = $1 AND tipus = ANY($2::text[])
    `, [varos, keruletes]);

    for (const i of r.rows) {

        const vanHely = !!(i.x && i.y);
        const szint = i.hely_pontossag || (vanHely ? "pontos" : "nincs");

        if (vanHely && (szint === "pontos" || szint === "utca")) {

            const k = await districts.keruletPontbol(varos, Number(i.x), Number(i.y));

            if (k && k !== i.kerulet) {
                await db.query("UPDATE ingatlanok SET kerulet = $1, updated_at = NOW() WHERE id = $2", [k, i.id]);
                e.keruletValtozott++;
            }

            continue;

        }

        if (!i.kerulet || i.hely_kezi || i.telepules) continue;

        const kozep = await districts.keruletKozep(varos, i.kerulet);
        if (!kozep) continue;

        if (vanHely && szint === "kozelito") {

            const kint = !districts.bennVan(Number(i.x), Number(i.y),
                (await districts.varosKeruletei(varos)).find(k => k.nev === i.kerulet).hatar);

            const mashol = Math.abs(Number(i.x) - kozep.x) > 1e-6 || Math.abs(Number(i.y) - kozep.y) > 1e-6;

            if (mashol && (kint || i.hely_forras === "kerulet" || !i.hely_forras)) {
                await db.query(
                    "UPDATE ingatlanok SET x = $1, y = $2, hely_sugar = $3, hely_forras = 'kerulet', updated_at = NOW() WHERE id = $4",
                    [kozep.x, kozep.y, kozep.sugar, i.id]
                );
                e.athelyezve++;
            }

        } else if (!vanHely) {

            await db.query(
                "UPDATE ingatlanok SET x = $1, y = $2, hely_pontossag = 'kozelito', hely_sugar = $3, hely_forras = 'kerulet', updated_at = NOW() WHERE id = $4",
                [kozep.x, kozep.y, kozep.sugar, i.id]
            );
            e.ujHely++;

        }

    }

    return e;

}

module.exports = router;
