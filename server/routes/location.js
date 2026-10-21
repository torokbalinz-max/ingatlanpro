// ============================================================
//  Helykeresés a térképes űrlapokhoz (hirdetésfeladás, ellenőrzés)
//  + Admin → Hirdetések → Hely-ellenőrzés: amit az automatika áthelyezett,
//    és a pontos hely nélküli hirdetések (gyors helymegadás)
// ============================================================

const express = require("express");
const db = require("../db/database");
const location = require("../services/location");
const { hiba, csakBelepve, csakAdmin } = require("../lib/http");
const csapat = require("../services/csapat");

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

// Ki dolgozhat a hely-ellenőrzésben: a helyek joga (az egész oldalra), vagy a
// hirdetések ellenőrzése – ez városra is kiadható, akkor csak azokban a városokban.
const helyJog = csapat.csakResz("helyek", "ellenorzes");

async function helySql(req, params, alias = "i.") {
    const k = await csapat.kontextus(req);
    if (k.admin || csapat.globalis(k, "helyek")) return "TRUE";
    return csapat.reszSql(k, "ellenorzes", params, alias);
}

// A :id (vagy a "mind" esetén a body.ids) hirdetései a hatókörben vannak-e
async function helyIdJog(req, res, next) {
    try {
        if (req.szerep === "admin") return next();
        const ids = req.params.id === "mind" && Array.isArray(req.body && req.body.ids)
            ? req.body.ids.map(Number).filter(Boolean) : [Number(req.params.id)].filter(Boolean);
        if (!ids.length) return res.status(400).json({ error: "bad_request" });
        const params = [ids];
        const hol = await helySql(req, params, "");
        if (hol === "TRUE") return next();
        const r = await db.query(`SELECT COUNT(*)::int AS n FROM ingatlanok WHERE id = ANY($1::int[]) AND ${hol}`, params);
        if (r.rows[0].n === new Set(ids).size) return next();
        res.status(403).json({ error: "not_in_scope" });
    } catch (err) {
        next(err);
    }
}

const HELY_MEZOK = `i.id, i.cim, i.varos, i.kerulet, i.telepules, i.tipus, i.ugylet, i.ar, i.nm, i.szobak, i.x, i.y,
                   i.hely_pontossag, i.hely_sugar, i.hely_forras, i.hely_eredeti, i.statusz, i.forras_kerulet, i.link,
                   (SELECT k.id FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id ORDER BY k.sorrend, k.id LIMIT 1) AS kep_id,
                   (i.kulso_kepek->>0) AS kulso_kep`;

// Az automatika által áthelyezett, még el nem döntött hirdetések
const ATHELYEZETT = `i.hely_eredeti IS NOT NULL AND i.hely_eredeti->>'ok' IS NOT NULL
              AND COALESCE((i.hely_eredeti->>'elfogadva')::boolean, false) = false
              AND NOT COALESCE(i.hely_kezi, false)
              AND i.statusz IN ('aktiv', 'fuggo')`;

// Nincs pontos helye (nincs pont, vagy csak közelítő), és ember még nem döntött róla
const PONTATLAN = `i.statusz IN ('aktiv', 'fuggo') AND NOT COALESCE(i.hely_kezi, false)
              AND (i.x IS NULL OR i.y IS NULL OR COALESCE(i.hely_pontossag, 'nincs') IN ('kozelito', 'nincs'))
              AND NOT (i.hely_eredeti IS NOT NULL AND i.hely_eredeti->>'ok' IS NOT NULL
                       AND COALESCE((i.hely_eredeti->>'elfogadva')::boolean, false) = false)`;

// Semmilyen hely: se pont, se kerület, se település – a statisztikából kimarad,
// amíg legalább a kerülete meg nincs (services/quality.js)
const SEMMI = `((i.x IS NULL OR i.y IS NULL OR COALESCE(i.hely_pontossag, 'nincs') = 'nincs')
              AND NULLIF(i.kerulet, '') IS NULL AND NULLIF(i.telepules, '') IS NULL)`;

// Kézi helymegadás után az adatminőség újraszámolása (a hely nélküli hirdetés így
// visszakerül a statisztikába, ha most már van kerülete / helye)
async function minosegFrissit(id) {
    const quality = require("../services/quality");
    const r = await db.query(`SELECT i.*, (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id)::int AS kep_db FROM ingatlanok i WHERE i.id = $1`, [id]);
    const i = r.rows[0];
    if (!i) return;
    const q = await quality.ertekel(i, {
        mod: i.forras_tipus === "import" ? "import" : (i.link ? "link" : "kezi"),
        jovahagyva: i.jovahagyva,
        kepDb: (i.kep_db || 0) + (Array.isArray(i.kulso_kepek) ? i.kulso_kepek.length : 0)
    });
    await db.query("UPDATE ingatlanok SET hianyzo = $1::jsonb, problemak = $2::jsonb, ellenorzott = $3 WHERE id = $4",
        [JSON.stringify(q.hianyzo), JSON.stringify(q.problemak), q.ellenorzott, id]);
}

router.get("/api/admin/hely-athelyezett", helyJog, async (req, res) => {
    try {
        const params = [];
        const hol = await helySql(req, params);
        const r = await db.query(`
            SELECT ${HELY_MEZOK}
            FROM ingatlanok i
            WHERE ${ATHELYEZETT} AND ${hol}
            ORDER BY i.varos, i.updated_at DESC NULLS LAST
            LIMIT 1000
        `, params);
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }
});

// Pontos hely nélküli hirdetések – a gyors helymegadáshoz
//   ?mod=nincs (egyáltalán nincs a térképen) | kozelito (csak közelítő) | mind
//   ?varos=…  -> { lista: [...], szamok: { nincs, kozelito, varosok: {város: db} } }
router.get("/api/admin/hely-pontatlan", helyJog, async (req, res) => {
    try {
        const mod = ["semmi", "nincs", "kozelito", "mind"].includes(req.query.mod) ? req.query.mod : "mind";
        const params = [];
        const hol = await helySql(req, params);
        const alap = `${PONTATLAN} AND ${hol}`;

        const sz = await db.query(`
            SELECT i.varos,
                   COUNT(*) FILTER (WHERE i.x IS NULL OR i.y IS NULL OR COALESCE(i.hely_pontossag, 'nincs') = 'nincs')::int AS nincs,
                   COUNT(*) FILTER (WHERE i.x IS NOT NULL AND i.y IS NOT NULL AND i.hely_pontossag = 'kozelito')::int AS kozelito,
                   COUNT(*) FILTER (WHERE ${SEMMI})::int AS semmi
            FROM ingatlanok i WHERE ${alap} GROUP BY i.varos`, params);

        const varosok = {};
        let nincs = 0, kozelito = 0, semmi = 0;
        sz.rows.forEach(x => { varosok[x.varos || ""] = { nincs: x.nincs, kozelito: x.kozelito, semmi: x.semmi }; nincs += x.nincs; kozelito += x.kozelito; semmi += x.semmi; });
        const szamok = { nincs, kozelito, semmi, osszes: nincs + kozelito, varosok };

        // Csak a számok (a fül váltójához)
        if (req.query.csak === "szam") return res.json({ lista: [], szamok });

        const lp = [...params];
        const felt = [alap];
        if (mod === "nincs") felt.push("(i.x IS NULL OR i.y IS NULL OR COALESCE(i.hely_pontossag, 'nincs') = 'nincs')");
        if (mod === "kozelito") felt.push("(i.x IS NOT NULL AND i.y IS NOT NULL AND i.hely_pontossag = 'kozelito')");
        if (mod === "semmi") felt.push(SEMMI);
        if (req.query.varos) { lp.push(String(req.query.varos)); felt.push(`i.varos = $${lp.length}`); }

        const r = await db.query(`
            SELECT ${HELY_MEZOK}, LEFT(COALESCE(NULLIF(i.leiras, ''), i.forras_szoveg, ''), 1500) AS leiras
            FROM ingatlanok i
            WHERE ${felt.join(" AND ")}
            ORDER BY (i.x IS NULL OR i.y IS NULL) DESC, (i.megbizas_id IS NOT NULL) DESC,
                     COALESCE(i.hely_sugar, 0) DESC, i.id DESC
            LIMIT 400
        `, lp);

        res.json({ lista: r.rows, szamok });
    } catch (err) {
        hiba(res, err);
    }
});

// „Így marad”: a mostani (közelítő) hely rendben van, nem lehet pontosítani –
// kikerül a listából, az automatika többé nem mozgatja
router.post("/api/admin/hely-pontatlan/:id/marad", helyJog, helyIdJog, async (req, res) => {
    try {
        const ids = req.params.id === "mind" && Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [Number(req.params.id)];
        const r = await db.query("UPDATE ingatlanok SET hely_kezi = true, updated_at = NOW() WHERE id = ANY($1::int[])", [ids]);
        res.json({ siker: true, db: r.rowCount });
    } catch (err) {
        hiba(res, err);
    }
});

// Rendben van az új hely (eltűnik a listából, de az eredeti adat megmarad)
router.post("/api/admin/hely-athelyezett/:id/elfogad", helyJog, helyIdJog, async (req, res) => {
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
router.post("/api/admin/hely-athelyezett/:id/vissza", helyJog, helyIdJog, async (req, res) => {
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

// Kézi hely: ha sem az automatika új pontja, sem az eredeti nem jó, az admin
// itt helyben (a hirdetés megnyitása nélkül) megadja a helyes pontot.
// Kézi döntés: az automatika többé nem mozgatja (hely_kezi).
//  body: { x, y, hely_pontossag: pontos|utca|kozelito|nincs, hely_sugar, kerulet? }
//  kerulet: ha meg van adva (üres szöveg = nincs kerület), az kerül be;
//           ha nincs a kérésben, pontos helynél a kerülethatárok döntenek.
router.post("/api/admin/hely-athelyezett/:id/kezi", helyJog, helyIdJog, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const b = req.body || {};

        const r = await db.query("SELECT id, varos, tipus FROM ingatlanok WHERE id = $1", [id]);
        if (!r.rowCount) return res.status(404).json({ error: "not_found" });
        const t = r.rows[0];

        let x = Number(b.x), y = Number(b.y);
        let pontossag = ["pontos", "utca", "kozelito", "nincs"].includes(b.hely_pontossag) ? b.hely_pontossag : "pontos";
        const vanPont = Number.isFinite(x) && Number.isFinite(y) && x !== 0 && y !== 0 && pontossag !== "nincs";

        if (vanPont && (x < -180 || x > 180 || y < -90 || y > 90)) return res.status(400).json({ error: "bad_point" });
        if (!vanPont) { x = null; y = null; pontossag = "nincs"; }

        const sugar = pontossag === "kozelito" ? Math.min(20000, Math.max(50, Math.round(Number(b.hely_sugar) || 500))) : null;

        await db.query(`
            UPDATE ingatlanok SET x = $1, y = $2, hely_pontossag = $3, hely_sugar = $4,
                   hely_kezi = true, hely_forras = 'kezi', hely_eredeti = NULL, updated_at = NOW()
            WHERE id = $5
        `, [x, y, pontossag, sugar, id]);

        // Kerület (csak ahol a típusnál van kerület, és a város nem "<város> és környéke")
        let kerulet;
        try {
            const { TIPUS_MEZOK } = require("../services/listing");
            const vanKerulet = (TIPUS_MEZOK[t.tipus || "lakas"] || TIPUS_MEZOK.lakas).kerulet
                && !(await require("../services/kornyek").isKornyek(t.varos).catch(() => false));
            if (vanKerulet) {
                if (typeof b.kerulet === "string") {
                    kerulet = b.kerulet.trim().slice(0, 120) || null;
                } else if (vanPont && ["pontos", "utca"].includes(pontossag)) {
                    kerulet = await require("../services/districts").keruletPontbol(t.varos, x, y) || undefined;
                }
                if (kerulet !== undefined) await db.query("UPDATE ingatlanok SET kerulet = $1 WHERE id = $2", [kerulet, id]);
            }
        } catch (er) { /* nem kritikus */ }

        await minosegFrissit(id).catch(e => console.error("Minőség frissítése:", e.message));

        res.json({ siker: true, x, y, hely_pontossag: pontossag, hely_sugar: sugar, kerulet: kerulet === undefined ? null : kerulet });
    } catch (err) {
        hiba(res, err);
    }
});

module.exports = router;
