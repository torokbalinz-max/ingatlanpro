// ============================================================
//  Helykeresés a térképes űrlapokhoz (hirdetésfeladás, ellenőrzés)
//  + Admin → Hely-ellenőrzés: amit az automatika áthelyezett
// ============================================================

const express = require("express");
const db = require("../db/database");
const location = require("../services/location");
const { hiba, csakBelepve, csakAdmin } = require("../lib/http");

const router = express.Router();

// A város közepe és mérete (a térkép ide ugrik városváltáskor)
router.get("/api/hely/varos", async (req, res) => {
    try {
        const v = await location.varosAdat(String(req.query.varos || ""));
        res.json(v ? { x: v.x, y: v.y, sugar_km: v.sugar_km, nev_ro: v.nev_ro, megye: v.megye } : null);
    } catch (err) {
        hiba(res, err);
    }
});

// Keresőmező: utca (házszámmal), kerület, falu, város – a város körül
router.get("/api/hely/kereses", csakBelepve, async (req, res) => {
    try {
        const q = String(req.query.q || "").trim().slice(0, 120);
        if (q.length < 3) return res.json([]);
        const lista = await location.szabadKeres(String(req.query.varos || ""), q);
        res.json(lista.map(t => ({
            x: t.x, y: t.y, nev: t.nev, szint: t.szint, telepules: t.telepules || null,
            tavolKm: t.tavolKm, tavol: !!t.tavol, sugar: t.sugar || null, vonalak: t.vonalak || null
        })));
    } catch (err) {
        hiba(res, err);
    }
});

// Hely a hirdetés szövegéből (cím, leírás, település, kerület)
router.post("/api/hely/szovegbol", csakBelepve, async (req, res) => {
    try {
        const b = req.body || {};
        const d = {
            varos: String(b.varos || ""),
            tipus: b.tipus || "lakas",
            telepules: b.telepules || null,
            kerulet: b.kerulet || null,
            forras_kerulet: b.forras_kerulet || null,
            cim: String(b.cim || "").slice(0, 300),
            leiras: String(b.leiras || "").slice(0, 8000),
            forras_szoveg: String(b.forras_szoveg || "").slice(0, 8000)
        };
        const szoveg = [d.cim, d.leiras].filter(Boolean).join("\n");
        const h = await location.helyKeres(d, szoveg, { utca: b.utca || null });
        res.json(h ? { x: h.x, y: h.y, szint: h.szint, sugar: h.sugar || null, forras: h.forras, nev: h.nev || null, kerulet: h.kerulet || null } : null);
    } catch (err) {
        hiba(res, err);
    }
});

// Messze van-e a pont a várostól / a falutól (figyelmeztetés az űrlapon)
router.post("/api/hely/ellenoriz", async (req, res) => {
    try {
        const b = req.body || {};
        const t = await location.helyTavol({
            varos: b.varos, x: Number(b.x), y: Number(b.y), tipus: b.tipus || "lakas", telepules: b.telepules || null
        });
        res.json({ tavol: t || false });
    } catch (err) {
        hiba(res, err);
    }
});

// ===================== ADMIN: HELY-ELLENŐRZÉS =====================
// A hely-ellenőrzés (automatikus javítás, beolvasás) által áthelyezett
// hirdetések: miért (az utca / a kerület máshol van, messze a várostól...),
// honnan hová. Az admin elfogadhatja, vagy visszateheti az eredeti helyére
// (ilyenkor az automatika többé nem mozgatja).

router.get("/api/admin/hely-athelyezett", csakAdmin, async (req, res) => {
    try {
        const r = await db.query(`
            SELECT i.id, i.cim, i.varos, i.kerulet, i.tipus, i.ugylet, i.ar, i.nm, i.x, i.y, i.hely_pontossag, i.hely_sugar,
                   i.hely_forras, i.hely_eredeti, i.statusz, i.forras_kerulet, i.link,
                   (SELECT k.id FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id ORDER BY k.sorrend, k.id LIMIT 1) AS kep_id,
                   (i.kulso_kepek->>0) AS kulso_kep
            FROM ingatlanok i
            WHERE i.hely_eredeti IS NOT NULL AND i.hely_eredeti->>'ok' IS NOT NULL
              AND COALESCE((i.hely_eredeti->>'elfogadva')::boolean, false) = false
              AND NOT COALESCE(i.hely_kezi, false)
              AND i.statusz IN ('aktiv', 'fuggo')
            ORDER BY i.varos, i.updated_at DESC NULLS LAST
            LIMIT 1000
        `);
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }
});

// Rendben van az új hely (eltűnik a listából, de az eredeti adat megmarad)
router.post("/api/admin/hely-athelyezett/:id/elfogad", csakAdmin, async (req, res) => {
    try {
        const ids = req.params.id === "mind" && Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [Number(req.params.id)];
        await db.query(`
            UPDATE ingatlanok SET hely_eredeti = jsonb_set(hely_eredeti, '{elfogadva}', 'true'::jsonb), updated_at = NOW()
            WHERE id = ANY($1::int[]) AND hely_eredeti IS NOT NULL
        `, [ids]);
        res.json({ siker: true, db: ids.length });
    } catch (err) {
        hiba(res, err);
    }
});

// Vissza az eredeti helyre – kézi döntés: az automatika többé nem mozgatja
router.post("/api/admin/hely-athelyezett/:id/vissza", csakAdmin, async (req, res) => {
    try {
        const r = await db.query("SELECT hely_eredeti, varos, tipus FROM ingatlanok WHERE id = $1", [req.params.id]);
        const e = r.rows[0] && r.rows[0].hely_eredeti;
        if (!e || !(e.x && e.y)) return res.status(400).json({ error: "no_original" });

        const pontossag = ["pontos", "utca", "kozelito"].includes(e.pontossag) ? e.pontossag : "pontos";

        await db.query(`
            UPDATE ingatlanok SET x = $1, y = $2, hely_pontossag = $3, hely_sugar = CASE WHEN $3 = 'kozelito' THEN COALESCE(hely_sugar, 500) ELSE NULL END,
                   hely_kezi = true, hely_forras = 'kezi', hely_eredeti = NULL, updated_at = NOW()
            WHERE id = $4
        `, [e.x, e.y, pontossag, req.params.id]);

        // A kerület: ha az automatika átírta, a korábbi; különben a visszatett pont
        // szerint (ahol vannak kerülethatárok)
        try {
            if (typeof e.kerulet === "string") {
                await db.query("UPDATE ingatlanok SET kerulet = $1 WHERE id = $2", [e.kerulet || null, req.params.id]);
            } else {
                const districts = require("../services/districts");
                const { TIPUS_MEZOK } = require("../services/listing");
                const t = r.rows[0];
                if ((TIPUS_MEZOK[t.tipus || "lakas"] || TIPUS_MEZOK.lakas).kerulet && ["pontos", "utca"].includes(pontossag)) {
                    const k = await districts.keruletPontbol(t.varos, Number(e.x), Number(e.y));
                    if (k) await db.query("UPDATE ingatlanok SET kerulet = $1 WHERE id = $2", [k, req.params.id]);
                }
            }
        } catch (er) { /* nem kritikus */ }

        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }
});

module.exports = router;
