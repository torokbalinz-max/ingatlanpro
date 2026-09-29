// ============================================================
//  Admin: állapot gyors beállítása
//
//  Az állapotot a hirdetések többsége nem írja le – a fényképekből kell
//  megítélni. Ez a felület egymás után mutatja a hirdetéseket (nagy
//  képekkel), egy kattintással / billentyűvel (1–6) beállítható, és
//  magától megy a következőre. A szövegből adott javaslatot is mutat.
// ============================================================

const express = require("express");
const db = require("../db/database");
const quality = require("../services/quality");
const { ALLAPOTOK, TIPUS_MEZOK } = require("../services/listing");
const { hiba, csakAdmin } = require("../lib/http");

const router = express.Router();

// Javaslat a hirdetés szövegéből (román és magyar kifejezések) + építési év
// -> { ertek, ok } vagy null
function javaslat(i) {

    const t = [i.cim, i.leiras, i.forras_szoveg].filter(Boolean).join(" \n ").toLowerCase();

    const minta = [
        ["felújítandó", /necesit[aă] (?:o )?renovare|de renovat|stare de renovare|necesit[aă] reparat|(?:de|pentru) renovare complet[aă]|felújítandó|felújításra szorul|romos|stare (?:de )?(?:degradare|proast[aă])/],
        ["részbenfel", /renovat par[tț]ial|par[tț]ial renovat|semi[- ]?renovat|r[eé]szben fel[uú]j[ií]tott|par[tț]ial modernizat/],
        ["luxus", /\blux\b|de lux|finisaje (?:de )?lux|premium|luxus/],
        ["újszerű", /bloc nou|construc[tț]ie nou[aă]|imobil nou|dezvoltator|[uú]j [eé]p[ií]t[eé]s[uű]|[uú]jszer[uű]|finalizat 202\d|predare 202\d|la (?:gri|ro[sș]u)\b/],
        ["közepes", /stare medie|stare satisf[aă]c[aă]toare|locuibil[aă]?|[aá]tlagos [aá]llapot|lakhat[oó]/],
        ["jó", /renovat (?:complet|recent|integral|total)|complet renovat|recent renovat|modernizat|foarte bun|bine [iî]ntre[tț]inut|stare bun[aă]|j[oó] [aá]llapot|fel[uú]j[ií]tott/]
    ];

    for (const [ertek, re] of minta) {
        const m = t.match(re);
        if (m) {
            const k = Math.max(0, m.index - 30);
            return { ertek, ok: "…" + t.slice(k, m.index + m[0].length + 30).replace(/\s+/g, " ").trim() + "…" };
        }
    }

    if (Number(i.evszam) >= new Date().getFullYear() - 5) return { ertek: "újszerű", ok: `${i.evszam}` };

    return null;

}

const keruletes = Object.keys(TIPUS_MEZOK).filter(t => TIPUS_MEZOK[t].allapot);

// A beállítandó hirdetések
//  mod: hianyzo (nincs állapot) | bizonytalan (becsült, "*"-os) | mind (az összes)
router.get("/api/admin/allapot", csakAdmin, async (req, res) => {

    try {

        const mod = ["hianyzo", "bizonytalan", "mind"].includes(req.query.mod) ? req.query.mod : "hianyzo";
        const felt = ["i.statusz IN ('aktiv', 'fuggo')", "i.tipus = ANY($1::text[])"];
        const params = [req.query.tipus && keruletes.includes(req.query.tipus) ? [req.query.tipus] : keruletes];

        if (req.query.varos) {
            params.push(String(req.query.varos));
            felt.push(`i.varos = $${params.length}`);
        }

        if (mod === "hianyzo") felt.push("COALESCE(TRIM(i.allapot), '') = ''");
        if (mod === "bizonytalan") felt.push("i.allapot LIKE '%*%'");

        const r = await db.query(`
            SELECT i.id, i.cim, i.ar, i.nm, i.szobak, i.emelet, i.kerulet, i.telepules, i.varos, i.tipus, i.ugylet,
                   i.allapot, i.evszam, i.link, i.kulso_kepek, LEFT(i.leiras, 1500) AS leiras, LEFT(i.forras_szoveg, 3000) AS forras_szoveg,
                   COALESCE((SELECT json_agg(k.id ORDER BY k.sorrend, k.id) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id), '[]'::json) AS kepek
            FROM ingatlanok i
            WHERE ${felt.join(" AND ")}
            ORDER BY i.id DESC
            LIMIT 300
        `, params);

        const db_ = await db.query(`
            SELECT
                COUNT(*) FILTER (WHERE COALESCE(TRIM(allapot), '') = '')::int AS hianyzo,
                COUNT(*) FILTER (WHERE allapot LIKE '%*%')::int AS bizonytalan
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

        let valtozasok = [];

        if (Array.isArray(req.body.valtozasok)) {
            valtozasok = req.body.valtozasok.map(v => ({ id: Number(v.id), allapot: v.allapot }));
        } else if (Array.isArray(req.body.ids)) {
            valtozasok = req.body.ids.map(id => ({ id: Number(id), allapot: req.body.allapot }));
        }

        valtozasok = valtozasok.filter(v => v.id > 0 && (ALLAPOTOK.includes(v.allapot) || v.allapot === null || v.allapot === ""));

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
                `UPDATE ingatlanok SET allapot = $1, hianyzo = $2::jsonb, ellenorzott = $3, updated_at = NOW() WHERE id = $4`,
                [allapot, JSON.stringify(hianyzo), ellenorzott, v.id]
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
