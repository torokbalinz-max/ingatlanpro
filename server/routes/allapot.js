// ============================================================
//  Állapotok
//
//  1) Az állapotok listájának kezelése (Admin → Állapotok): új állapot
//     felvétele, átnevezés (magyar / román / angol), szín, sorrend,
//     kulcsszavak a szövegből való felismeréshez, ki- / bekapcsolás.
//     Kódot nem kell írni hozzá.
//
//  2) Állapot gyors beállítása (Admin → Állapot beállítása): az állapotot
//     a hirdetések többsége nem írja le – a fényképekből kell megítélni.
//     Egymás után mutatja a hirdetéseket (nagy képekkel), egy kattintással /
//     billentyűvel (1–9) beállítható, és magától megy a következőre.
//     A szövegből adott javaslatot is mutat.
// ============================================================

const express = require("express");
const db = require("../db/database");
const quality = require("../services/quality");
const allapotok = require("../services/allapotok");
const { TIPUS_MEZOK } = require("../services/listing");
const { hiba, csakAdmin } = require("../lib/http");

const router = express.Router();

// Javaslat a hirdetés szövegéből (román, magyar, angol kifejezések + az
// admin kulcsszavai) és az építési évből -> { ertek, ok } vagy null
function javaslat(i) {
    const szoveg = [i.cim, i.leiras, i.forras_szoveg].filter(Boolean).join(" \n ");
    return allapotok.felismer(szoveg, { evszam: i.evszam });
}

const keruletes = Object.keys(TIPUS_MEZOK).filter(t => TIPUS_MEZOK[t].allapot);

// Bizonytalan: régi becsült ("jó*") vagy automatikusan (a leírásból, az építés
// évéből) kitöltött állapot – érdemes ránézni
const BIZONYTALAN = "(i.allapot LIKE '%*%' OR i.allapot_forras IN ('szoveg', 'ev'))";

// ===================== AZ ÁLLAPOTOK LISTÁJA =====================

// Nyilvános (a weboldal a /api/config-ból is megkapja)
router.get("/api/allapotok", async (req, res) => {
    await allapotok.kesz();
    res.json(allapotok.nyilvanos());
});

// Admin: minden állapot, a kulcsszavakkal és a használat számával
router.get("/api/admin/allapotok", csakAdmin, async (req, res) => {

    try {

        await allapotok.kesz();

        const r = await db.query(`
            SELECT REPLACE(allapot, '*', '') AS a, allapot_forras AS f, COUNT(*)::int AS n
            FROM ingatlanok
            WHERE statusz IN ('aktiv', 'fuggo', 'nem_elerheto', 'archiv') AND COALESCE(TRIM(allapot), '') <> ''
            GROUP BY 1, 2
        `);

        const db_ = {};
        const auto = {};
        const ismeretlen = {};

        r.rows.forEach(x => {
            const k = allapotok.norm(x.a);
            if (allapotok.ervenyes(k)) {
                db_[k] = (db_[k] || 0) + x.n;
                if (x.f === "szoveg" || x.f === "ev") auto[k] = (auto[k] || 0) + x.n;
            } else {
                ismeretlen[x.a] = (ismeretlen[x.a] || 0) + x.n;
            }
        });

        res.json({
            lista: allapotok.osszes().map(a => ({ ...a, db: db_[a.kulcs] || 0, auto: auto[a.kulcs] || 0 })),
            // Régi, szabad szöveges értékek (nem illeszkednek egyik állapotra sem)
            ismeretlen: Object.entries(ismeretlen).map(([nev, n]) => ({ nev, db: n })).sort((a, b) => b.db - a.db)
        });

    } catch (err) {
        hiba(res, err);
    }

});

const SZIN_RE = /^#[0-9a-f]{6}$/i;

// A beküldött mezők ellenőrzése (új állapotnál és módosításnál)
function mezok(b, regi = {}) {

    // Szöveg: a HTML-be nem illő jelek nélkül (a nevek sok helyen megjelennek)
    const sz = (v, max) => v === undefined ? undefined : (String(v ?? "").replace(/[<>"'`\\]/g, "").trim().slice(0, max) || null);
    const szam = (v, min, max) => {
        if (v === undefined) return undefined;
        if (v === null || v === "") return null;
        const n = Number(String(v).replace(",", "."));
        return isFinite(n) && n >= min && n <= max ? Math.round(n * 1000) / 1000 : NaN;
    };

    const m = {
        nev_hu: sz(b.nev_hu, 60),
        nev_ro: sz(b.nev_ro, 60),
        nev_en: sz(b.nev_en, 60),
        szin: b.szin === undefined ? undefined : (SZIN_RE.test(String(b.szin || "")) ? String(b.szin).toLowerCase() : NaN),
        szint: szam(b.szint, -1, 5),
        szorzo: szam(b.szorzo, 0.3, 3),
        kulcsszavak: sz(b.kulcsszavak, 1500),
        aktiv: b.aktiv === undefined ? undefined : !!b.aktiv
    };

    if (m.nev_hu === null || (m.nev_hu === undefined && !regi.nev_hu)) return { hiba: "missing_name" };
    if (Number.isNaN(m.szin)) return { hiba: "bad_color" };
    if (Number.isNaN(m.szint) || Number.isNaN(m.szorzo)) return { hiba: "bad_number" };

    return { m };

}

router.post("/api/admin/allapotok", csakAdmin, async (req, res) => {

    try {

        const { m, hiba: h } = mezok(req.body || {});
        if (h) return res.status(400).json({ error: h });

        // A kulcs a magyar név (kisbetűvel) – később átnevezhető, a kulcs marad
        const kulcs = m.nev_hu.toLowerCase().replace(/\*/g, "").trim().slice(0, 40);

        await allapotok.kesz();

        if (allapotok.ervenyes(kulcs) || allapotok.ervenyes(allapotok.norm(kulcs))) {
            return res.status(400).json({ error: "duplicate" });
        }

        const max = await db.query("SELECT COALESCE(MAX(sorrend), 0) AS m FROM allapotok");

        await db.query(
            `INSERT INTO allapotok (kulcs, nev_hu, nev_ro, nev_en, szin, szint, szorzo, kulcsszavak, sorrend, aktiv, beepitett)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,false)`,
            [kulcs, m.nev_hu, m.nev_ro || null, m.nev_en || null, m.szin || "#64748b",
             m.szint ?? 2, m.szorzo ?? 1, m.kulcsszavak || null, Number(max.rows[0].m) + 10]
        );

        await allapotok.frissit();

        res.json({ siker: true, kulcs });

    } catch (err) {
        hiba(res, err);
    }

});

router.put("/api/admin/allapotok/:kulcs", csakAdmin, async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM allapotok WHERE kulcs = $1", [req.params.kulcs]);
        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const { m, hiba: h } = mezok(req.body || {}, r.rows[0]);
        if (h) return res.status(400).json({ error: h });

        const kulcsok = Object.keys(m).filter(k => m[k] !== undefined);
        if (!kulcsok.length) return res.json({ siker: true });

        await db.query(
            `UPDATE allapotok SET ${kulcsok.map((k, n) => `${k} = $${n + 2}`).join(", ")}, updated_at = NOW() WHERE kulcs = $1`,
            [req.params.kulcs, ...kulcsok.map(k => m[k])]
        );

        await allapotok.frissit();

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// Sorrend: { kulcsok: [...] } – ebben a sorrendben jelennek meg mindenhol
router.post("/api/admin/allapotok-sorrend", csakAdmin, async (req, res) => {

    try {

        const lista = Array.isArray(req.body.kulcsok) ? req.body.kulcsok.map(String) : [];
        if (!lista.length) return res.status(400).json({ error: "bad_request" });

        for (let n = 0; n < lista.length; n++) {
            await db.query("UPDATE allapotok SET sorrend = $1, updated_at = NOW() WHERE kulcs = $2", [(n + 1) * 10, lista[n]]);
        }

        await allapotok.frissit();

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// Törlés (csak a saját felvett állapot; a beépítettet ki lehet kapcsolni).
// Ha hirdetések használják: ?atrak=<másik kulcs> (vagy üres = állapot nélkül)
router.delete("/api/admin/allapotok/:kulcs", csakAdmin, async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM allapotok WHERE kulcs = $1", [req.params.kulcs]);
        if (!r.rowCount) return res.status(404).json({ error: "not_found" });
        if (r.rows[0].beepitett) return res.status(400).json({ error: "builtin" });

        const kulcs = r.rows[0].kulcs;
        const hasznalja = await db.query("SELECT COUNT(*)::int AS n FROM ingatlanok WHERE REPLACE(allapot, '*', '') = $1", [kulcs]);

        if (hasznalja.rows[0].n > 0) {

            if (req.query.atrak === undefined) return res.status(400).json({ error: "in_use", db: hasznalja.rows[0].n });

            const cel = String(req.query.atrak || "");
            if (cel && (!allapotok.ervenyes(cel) || cel === kulcs)) return res.status(400).json({ error: "bad_target" });

            await db.query(
                `UPDATE ingatlanok SET allapot = $1, allapot_forras = CASE WHEN $1::text IS NULL THEN NULL ELSE allapot_forras END, updated_at = NOW()
                 WHERE REPLACE(allapot, '*', '') = $2`,
                [cel || null, kulcs]
            );

        }

        await db.query("DELETE FROM allapotok WHERE kulcs = $1", [kulcs]);
        await allapotok.frissit();

        res.json({ siker: true, athelyezve: hasznalja.rows[0].n });

    } catch (err) {
        hiba(res, err);
    }

});

// Kipróbálás: mit ismerne fel ebből a szövegből?
router.post("/api/admin/allapotok/teszt", csakAdmin, async (req, res) => {
    await allapotok.kesz();
    const szoveg = String(req.body.szoveg || "").slice(0, 5000);
    res.json({ eredmeny: allapotok.felismer(szoveg, { evszam: req.body.evszam }) });
});

// Régi, szabad szöveges érték átsorolása egy állapotba: { regi, uj }
router.post("/api/admin/allapotok/atsorol", csakAdmin, async (req, res) => {
    try {
        await allapotok.kesz();
        const regi = String(req.body.regi || "").trim();
        const uj = String(req.body.uj || "");
        if (!regi || !allapotok.ervenyes(uj)) return res.status(400).json({ error: "bad_request" });
        const r = await db.query(
            "UPDATE ingatlanok SET allapot = $1, updated_at = NOW() WHERE TRIM(REPLACE(allapot, '*', '')) = $2",
            [uj, regi]
        );
        res.json({ siker: true, db: r.rowCount });
    } catch (err) {
        hiba(res, err);
    }
});

// Az állapot nélküli hirdetések kitöltése a leírásukból (és az építés évéből).
// A kitöltöttek "bizonytalan" jelölést kapnak – az Állapot beállítása oldalon
// gyorsan átnézhetők.
router.post("/api/admin/allapotok/kitolt", csakAdmin, async (req, res) => {

    try {

        await allapotok.kesz();

        const r = await db.query(`
            SELECT i.id, i.cim, i.leiras, i.forras_szoveg, i.evszam, i.tipus, i.hianyzo
            FROM ingatlanok i
            WHERE i.statusz IN ('aktiv', 'fuggo') AND i.tipus = ANY($1::text[]) AND COALESCE(TRIM(i.allapot), '') = ''
        `, [keruletes]);

        let kitoltott = 0;
        const mibol = {};

        for (const i of r.rows) {
            const j = javaslat(i);
            if (!j) continue;
            const hianyzo = Array.isArray(i.hianyzo) ? i.hianyzo.filter(m => m !== "allapot") : [];
            await db.query(
                "UPDATE ingatlanok SET allapot = $1, allapot_forras = $2, hianyzo = $3::jsonb, updated_at = NOW() WHERE id = $4",
                [j.ertek, j.forras, JSON.stringify(hianyzo), i.id]
            );
            kitoltott++;
            mibol[j.ertek] = (mibol[j.ertek] || 0) + 1;
        }

        res.json({ siker: true, osszes: r.rowCount, kitoltott, mibol });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== ÁLLAPOT GYORS BEÁLLÍTÁSA =====================

// A beállítandó hirdetések
//  mod: hianyzo (nincs állapot) | bizonytalan (becsült / a szövegből kitöltött) | mind (az összes)
router.get("/api/admin/allapot", csakAdmin, async (req, res) => {

    try {

        await allapotok.kesz();

        const mod = ["hianyzo", "bizonytalan", "mind"].includes(req.query.mod) ? req.query.mod : "hianyzo";
        const felt = ["i.statusz IN ('aktiv', 'fuggo')", "i.tipus = ANY($1::text[])"];
        const params = [req.query.tipus && keruletes.includes(req.query.tipus) ? [req.query.tipus] : keruletes];

        if (req.query.varos) {
            params.push(String(req.query.varos));
            felt.push(`i.varos = $${params.length}`);
        }

        if (mod === "hianyzo") felt.push("COALESCE(TRIM(i.allapot), '') = ''");
        if (mod === "bizonytalan") felt.push(BIZONYTALAN);

        const r = await db.query(`
            SELECT i.id, i.cim, i.ar, i.nm, i.szobak, i.emelet, i.kerulet, i.telepules, i.varos, i.tipus, i.ugylet,
                   i.allapot, i.allapot_forras, i.evszam, i.link, i.kulso_kepek, LEFT(i.leiras, 1500) AS leiras, LEFT(i.forras_szoveg, 3000) AS forras_szoveg,
                   COALESCE((SELECT json_agg(k.id ORDER BY k.sorrend, k.id) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id), '[]'::json) AS kepek
            FROM ingatlanok i
            WHERE ${felt.join(" AND ")}
            ORDER BY i.id DESC
            LIMIT 300
        `, params);

        const db_ = await db.query(`
            SELECT
                COUNT(*) FILTER (WHERE COALESCE(TRIM(allapot), '') = '')::int AS hianyzo,
                COUNT(*) FILTER (WHERE ${BIZONYTALAN})::int AS bizonytalan
            FROM ingatlanok i WHERE i.statusz IN ('aktiv', 'fuggo') AND i.tipus = ANY($1::text[]) ${req.query.varos ? "AND i.varos = $2" : ""}
        `, req.query.varos ? [keruletes, String(req.query.varos)] : [keruletes]);

        res.json({
            szamok: db_.rows[0],
            lista: r.rows.map(i => {
                const { forras_szoveg, ...rest } = i;
                return {
                    ...rest,
                    kulso_kepek: Array.isArray(i.kulso_kepek) ? i.kulso_kepek.slice(0, 12) : [],
                    javaslat: javaslat(i)
                };
            })
        });

    } catch (err) {
        hiba(res, err);
    }

});

// Állapot mentése egy vagy több hirdetésre: { ids: [..], allapot } vagy { valtozasok: [{ id, allapot }] }
router.patch("/api/admin/allapot", csakAdmin, async (req, res) => {

    try {

        await allapotok.kesz();

        let valtozasok = [];

        if (Array.isArray(req.body.valtozasok)) {
            valtozasok = req.body.valtozasok.map(v => ({ id: Number(v.id), allapot: v.allapot }));
        } else if (Array.isArray(req.body.ids)) {
            valtozasok = req.body.ids.map(id => ({ id: Number(id), allapot: req.body.allapot }));
        }

        valtozasok = valtozasok.filter(v => v.id > 0 && (allapotok.ervenyes(v.allapot) || v.allapot === null || v.allapot === ""));

        if (!valtozasok.length) return res.status(400).json({ error: "bad_request" });

        let kesz = 0;

        for (const v of valtozasok.slice(0, 500)) {

            const r = await db.query(
                `SELECT i.*, (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id)::int AS kep_db FROM ingatlanok i WHERE i.id = $1`,
                [v.id]
            );

            if (!r.rowCount) continue;

            const i = r.rows[0];
            const allapot = v.allapot || null;

            // A hiányzó adatok listájából kikerül az állapot. Az "ellenőrzött" jelzés
            // csak javulhat: ha eddig az állapot hiánya miatt nem számított bele a
            // statisztikába, most már beleszámíthat – de egy rendben lévő hirdetés
            // emiatt nem kerül vissza az ellenőrzendők közé.
            let hianyzo = Array.isArray(i.hianyzo) ? i.hianyzo.filter(m => m !== "allapot") : [];
            if (!allapot && TIPUS_MEZOK[i.tipus] && TIPUS_MEZOK[i.tipus].allapot && !hianyzo.includes("allapot")) hianyzo.push("allapot");

            let ellenorzott = !!i.ellenorzott;

            if (!ellenorzott && allapot) {
                const q = await quality.ertekel({ ...i, allapot }, {
                    mod: i.forras_tipus === "import" ? "import" : (i.link ? "link" : "kezi"),
                    jovahagyva: i.jovahagyva,
                    kepDb: (i.kep_db || 0) + (Array.isArray(i.kulso_kepek) ? i.kulso_kepek.length : 0)
                });
                ellenorzott = q.ellenorzott;
                hianyzo = q.hianyzo;
            }

            await db.query(
                `UPDATE ingatlanok SET allapot = $1, allapot_forras = $2, hianyzo = $3::jsonb, ellenorzott = $4, updated_at = NOW() WHERE id = $5`,
                [allapot, allapot ? "kezi" : null, JSON.stringify(hianyzo), ellenorzott, v.id]
            );

            kesz++;

        }

        res.json({ siker: true, kesz });

    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
module.exports.javaslat = javaslat;
