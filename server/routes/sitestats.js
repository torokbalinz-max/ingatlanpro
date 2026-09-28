// ============================================================
//  Látogatottsági statisztika (saját, sütik nélkül) + admin kimutatás
//
//   POST /api/stat/pv          a weboldal jelzi, hogy egy oldalt megnéztek
//   GET  /api/admin/oldalstat  admin: látogatók, fiókok, forgalmas órák,
//                              adatbázis telítettsége
//
//  Adatvédelem (lásd Adatvédelmi tájékoztató):
//   - nincs süti, nincs IP-cím az adatbázisban;
//   - a látogató azonosítója = hash(napi titkos só + IP + böngésző), a só
//     naponta cserélődik és a régi törlődik, így másnap ugyanaz a látogató
//     már nem ismerhető fel („napi egyedi látogató”);
//   - az admin saját megtekintései és a robotok nem számítanak;
//   - a „Ne kövess” (DNT) / Global Privacy Control jelzést tiszteletben tartjuk;
//   - a sorok 400 nap után törlődnek.
// ============================================================

const express = require("express");
const crypto = require("crypto");
const db = require("../db/database");
const acc = require("../services/accounts");
const { hiba, csakAdmin } = require("../lib/http");

const router = express.Router();

const TZ = "Europe/Bucharest";

// A weboldal oldalai (minden más "egyeb")
const OLDALAK = ["home", "properties", "map", "market", "new", "favorites", "valuation", "igenyek",
    "fiok", "iroda", "irodak", "listing", "jogi"];

const ROBOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http/i;

const ip = req => req.ip || (req.socket && req.socket.remoteAddress) || "?";

// ---------- napi só ----------

let so = null;      // { nap: "2026-09-28", ertek: "..." }

function maiNap() {
    return new Date().toLocaleDateString("en-CA", { timeZone: TZ });   // ÉÉÉÉ-HH-NN
}

async function napiSo() {

    const nap = maiNap();

    if (so && so.nap === nap) return so.ertek;

    // Több szerver / újraindulás esetén is ugyanaz a só egész nap
    const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = 'stat_so'");
    let t = null;
    try { t = r.rowCount ? JSON.parse(r.rows[0].ertek) : null; } catch (e) { t = null; }

    if (!t || t.nap !== nap) {
        // Új nap: új só, a régi felülíródik (törlődik)
        t = { nap, ertek: crypto.randomBytes(32).toString("hex") };
        await db.query(
            `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ('stat_so', $1, NOW())
             ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`,
            [JSON.stringify(t)]
        );
    }

    so = t;
    return t.ertek;

}

function eszkoz(ua) {
    if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(ua)) return "tablet";
    if (/mobi|iphone|ipod|android|windows phone/i.test(ua)) return "mobil";
    return "asztali";
}

// ---------- oldalmegtekintés ----------

router.post("/api/stat/pv", async (req, res) => {

    // Mindig gyors, üres válasz – a böngészőnek nem kell várnia
    res.status(204).end();

    try {

        const ua = String(req.headers["user-agent"] || "");

        if (!ua || ROBOT.test(ua)) return;
        if (req.headers.dnt === "1" || req.headers["sec-gpc"] === "1") return;
        if (req.valodiSzerep === "admin") return;
        if (acc.korlat("pv:" + ip(req), 600, 60 * 60 * 1000)) return;

        const b = req.body || {};
        const oldal = OLDALAK.includes(b.oldal) ? b.oldal : "egyeb";
        const ingatlanId = oldal === "listing" && Number(b.id) > 0 ? Math.floor(Number(b.id)) : null;
        const nyelv = ["hu", "ro", "en"].includes(b.nyelv) ? b.nyelv : null;

        // Honnan jött: csak a külső oldal domainje
        let forras = null;
        try {
            if (b.ref) {
                const h = new URL(String(b.ref)).hostname.replace(/^www\./, "").toLowerCase();
                if (h && h !== String(req.hostname || "").replace(/^www\./, "").toLowerCase()) forras = h.slice(0, 100);
            }
        } catch (e) { forras = null; }

        const latogato = crypto.createHash("sha256")
            .update(await napiSo() + "|" + ip(req) + "|" + ua)
            .digest("hex").slice(0, 16);

        await db.query(
            `INSERT INTO latogatasok (latogato, oldal, ingatlan_id, eszkoz, nyelv, forras, bejelentkezve)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [latogato, oldal, ingatlanId, eszkoz(ua), nyelv, forras, !!req.user]
        );

        // 400 napnál régebbi sorok törlése (időnként)
        if (Math.random() < 0.005) {
            db.query("DELETE FROM latogatasok WHERE ido < NOW() - INTERVAL '400 days'").catch(() => { });
        }

    } catch (err) {
        console.error("Statisztika hiba:", err.message);
    }

});

// ---------- admin kimutatás ----------

router.get("/api/admin/oldalstat", csakAdmin, async (req, res) => {

    try {

        const napok = Math.min(365, Math.max(1, Number(req.query.napok) || 30));
        const q = async (sql, p = []) => (await db.query(sql, p)).rows;

        // A helyi (bukaresti) nap kezdete, a napok száma visszafelé
        const tol = `(date_trunc('day', NOW() AT TIME ZONE '${TZ}') - ($1::int - 1) * INTERVAL '1 day') AT TIME ZONE '${TZ}'`;
        // A users / ingatlanok created_at időzóna nélküli (UTC)
        const helyi = col => `((${col}) AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}'`;

        const [
            osszesites, napi, orak, hetnapok, oldalak, eszkozok, nyelvek, forrasok, hirdetesek,
            fiokok, ujFiokok, ujHirdetesek, egyeb, dbMeret, tablak
        ] = await Promise.all([

            q(`SELECT
                   COUNT(*) FILTER (WHERE ido >= date_trunc('day', NOW() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')::int AS ma_pv,
                   COUNT(DISTINCT latogato) FILTER (WHERE ido >= date_trunc('day', NOW() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')::int AS ma_latogato,
                   COUNT(DISTINCT latogato) FILTER (WHERE ido >= NOW() - INTERVAL '5 minutes')::int AS online,
                   COUNT(*) FILTER (WHERE ido >= ${tol})::int AS idoszak_pv
               FROM latogatasok WHERE ido >= LEAST(${tol}, NOW() - INTERVAL '1 day')`, [napok]),

            q(`SELECT to_char(d.nap, 'YYYY-MM-DD') AS nap,
                      COALESCE(x.latogatok, 0)::int AS latogatok, COALESCE(x.pv, 0)::int AS pv
               FROM generate_series(date_trunc('day', NOW() AT TIME ZONE '${TZ}') - ($1::int - 1) * INTERVAL '1 day',
                                    date_trunc('day', NOW() AT TIME ZONE '${TZ}'), INTERVAL '1 day') AS d(nap)
               LEFT JOIN (
                   SELECT date_trunc('day', ido AT TIME ZONE '${TZ}') AS nap,
                          COUNT(DISTINCT latogato) AS latogatok, COUNT(*) AS pv
                   FROM latogatasok WHERE ido >= ${tol} GROUP BY 1
               ) x ON x.nap = d.nap
               ORDER BY d.nap`, [napok]),

            q(`SELECT EXTRACT(HOUR FROM ido AT TIME ZONE '${TZ}')::int AS ora, COUNT(*)::int AS pv
               FROM latogatasok WHERE ido >= ${tol} GROUP BY 1 ORDER BY 1`, [napok]),

            q(`SELECT EXTRACT(ISODOW FROM ido AT TIME ZONE '${TZ}')::int AS nap, COUNT(*)::int AS pv
               FROM latogatasok WHERE ido >= ${tol} GROUP BY 1 ORDER BY 1`, [napok]),

            q(`SELECT oldal AS kulcs, COUNT(*)::int AS n FROM latogatasok WHERE ido >= ${tol}
               GROUP BY 1 ORDER BY 2 DESC LIMIT 15`, [napok]),

            q(`SELECT COALESCE(eszkoz, '?') AS kulcs, COUNT(DISTINCT (latogato, date_trunc('day', ido)))::int AS n
               FROM latogatasok WHERE ido >= ${tol} GROUP BY 1 ORDER BY 2 DESC`, [napok]),

            q(`SELECT COALESCE(nyelv, '?') AS kulcs, COUNT(DISTINCT (latogato, date_trunc('day', ido)))::int AS n
               FROM latogatasok WHERE ido >= ${tol} GROUP BY 1 ORDER BY 2 DESC`, [napok]),

            q(`SELECT COALESCE(forras, '') AS kulcs, COUNT(DISTINCT (latogato, date_trunc('day', ido)))::int AS n
               FROM latogatasok WHERE ido >= ${tol} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, [napok]),

            q(`SELECT l.ingatlan_id AS id, i.cim, i.varos, COUNT(*)::int AS n,
                      COUNT(DISTINCT (l.latogato, date_trunc('day', l.ido)))::int AS latogatok
               FROM latogatasok l LEFT JOIN ingatlanok i ON i.id = l.ingatlan_id
               WHERE l.ido >= ${tol} AND l.ingatlan_id IS NOT NULL
               GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 10`, [napok]),

            q(`SELECT COUNT(*)::int AS osszes,
                      COUNT(*) FILTER (WHERE google_id IS NOT NULL)::int AS google,
                      COUNT(*) FILTER (WHERE jelszo_hash IS NOT NULL)::int AS jelszavas,
                      COUNT(*) FILTER (WHERE ${helyi("created_at")} >= ${tol})::int AS uj,
                      COUNT(*) FILTER (WHERE utolso_belepes >= NOW() AT TIME ZONE 'UTC' - INTERVAL '30 days')::int AS aktiv30,
                      COUNT(*) FILTER (WHERE szerep = 'admin')::int AS admin,
                      COUNT(*) FILTER (WHERE tiltva)::int AS tiltott
               FROM users WHERE felhasznalonev IS NULL OR email IS NOT NULL`, [napok]),

            q(`SELECT to_char(d.nap, 'YYYY-MM-DD') AS nap, COALESCE(x.n, 0)::int AS n
               FROM generate_series(date_trunc('day', NOW() AT TIME ZONE '${TZ}') - ($1::int - 1) * INTERVAL '1 day',
                                    date_trunc('day', NOW() AT TIME ZONE '${TZ}'), INTERVAL '1 day') AS d(nap)
               LEFT JOIN (
                   SELECT date_trunc('day', ${helyi("created_at")}) AS nap, COUNT(*) AS n
                   FROM users WHERE ${helyi("created_at")} >= ${tol} GROUP BY 1
               ) x ON x.nap = d.nap
               ORDER BY d.nap`, [napok]),

            q(`SELECT COUNT(*) FILTER (WHERE owner_id IS NOT NULL AND COALESCE(forras_tipus, 'kezi') <> 'import')::int AS felhasznaloi,
                      COUNT(*) FILTER (WHERE owner_id IS NOT NULL AND COALESCE(forras_tipus, 'kezi') <> 'import'
                                         AND ${helyi("created_at")} >= ${tol})::int AS uj_felhasznaloi,
                      COUNT(*) FILTER (WHERE forras_tipus = 'import' AND ${helyi("created_at")} >= ${tol})::int AS uj_import
               FROM ingatlanok`, [napok]),

            q(`SELECT
                   (SELECT COUNT(*) FROM uzenetek WHERE ${helyi("created_at")} >= ${tol})::int AS uzenetek,
                   (SELECT COUNT(*) FROM igenyek WHERE ${helyi("created_at")} >= ${tol})::int AS igenyek,
                   (SELECT COUNT(*) FROM mentett_keresesek WHERE ${helyi("created_at")} >= ${tol})::int AS keresesek,
                   (SELECT COUNT(*) FROM favorites WHERE ${helyi("created_at")} >= ${tol})::int AS kedvencek,
                   (SELECT COUNT(*) FROM irodak)::int AS irodak,
                   (SELECT COUNT(*) FROM bejelentesek WHERE statusz IN ('uj', 'folyamatban'))::int AS nyitott_bejelentes`, [napok]),

            q(`SELECT pg_database_size(current_database())::bigint AS bajt`),

            q(`SELECT c.relname AS tabla, pg_total_relation_size(c.oid)::bigint AS bajt
               FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relkind = 'r' AND n.nspname = 'public'
               ORDER BY 2 DESC LIMIT 8`)

        ]);

        const limitMb = Number(process.env.DB_LIMIT_MB) || 512;

        res.json({
            napok,
            osszesites: osszesites[0] || {},
            napi, orak, hetnapok, oldalak, eszkozok, nyelvek, forrasok, hirdetesek,
            fiokok: { ...(fiokok[0] || {}), napi: ujFiokok },
            hirdetesStat: ujHirdetesek[0] || {},
            aktivitas: egyeb[0] || {},
            adatbazis: {
                bajt: Number(dbMeret[0] ? dbMeret[0].bajt : 0),
                limit: limitMb * 1024 * 1024,
                tablak: tablak.map(t => ({ tabla: t.tabla, bajt: Number(t.bajt) }))
            }
        });

    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
