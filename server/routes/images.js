// ============================================================
//  Képek: feltöltött fotók + más oldalak képeinek továbbítása
// ============================================================

const express = require("express");
const db = require("../db/database");
const { hiba } = require("../lib/http");
const { biztonsagosFetch } = require("../lib/biztonsagosFetch");
const acc = require("../services/accounts");

const router = express.Router();

router.get("/api/kepek/:id", async (req, res) => {

    try {

        const r = await db.query(`
            SELECT k.mime, k.adat, i.id AS ingatlan_id, i.statusz, i.owner_id, i.megbizas_id
            FROM ingatlan_kepek k LEFT JOIN ingatlanok i ON i.id = k.ingatlan_id
            WHERE k.id = $1`, [req.params.id]);

        if (!r.rowCount) return res.status(404).end();

        // A nem nyilvános hirdetés (bejelentés miatt eltávolított, vagy még csak
        // előnézet) fotói csak annak, aki a hirdetést is láthatja
        const k = r.rows[0];
        if (["tiltott", "elonezet"].includes(k.statusz) && req.szerep !== "admin" && !(req.user && req.user.id === k.owner_id)) {
            const elado = k.megbizas_id && req.user
                ? (await db.query("SELECT 1 FROM megbizasok WHERE id = $1 AND user_id = $2", [k.megbizas_id, req.user.id])).rowCount : 0;
            const csapat = require("../services/csapat");
            if (!elado && !(await csapat.hirdetesJog(req, k.ingatlan_id, "kepek"))
                && !(k.megbizas_id && await csapat.megbizasJog(req, k.megbizas_id, "megbizas_lat"))) {
                return res.status(404).end();
            }
        }

        // Csak képtípus mehet ki (a régi, ellenőrzés előtti feltöltéseknél is)
        res.set("Content-Type", /^image\/(jpeg|png|webp|gif)$/.test(k.mime) ? k.mime : "application/octet-stream");
        res.set("X-Content-Type-Options", "nosniff");
        res.set("Cache-Control", "private, max-age=31536000, immutable");
        res.send(r.rows[0].adat);

    } catch (err) {
        hiba(res, err);
    }

});

// Más oldalak képeinek továbbítása (így a forrásoldal nem tilthatja le,
// és nem kell a böngészőnek közvetlenül oda fordulnia). Kis memóriás
// gyorstárral, hogy ugyanazt a képet ne kérjük le újra és újra.
// Csak nyilvános internetes cím kérhető le (a belső hálózat tiltott).
const kepCache = new Map();
let kepCacheMeret = 0;

// Csak olyan külső kép kérhető le, amely egy hirdetéshez tartozik – vagy
// bejelentkezve (hirdetésfeladás linkről: a képek még nincsenek elmentve).
// Így a szerver nem használható ismeretlen oldalak „névtelenítő” proxijaként.
const ismertKepek = new Map();      // url -> { ok, ido }

async function ismertKep(u) {
    const c = ismertKepek.get(u);
    if (c && Date.now() - c.ido < 10 * 60 * 1000) return c.ok;
    const r = await db.query("SELECT 1 FROM ingatlanok WHERE kulso_kepek @> $1::jsonb LIMIT 1", [JSON.stringify([u])]);
    const ok = r.rowCount > 0;
    if (ismertKepek.size > 20000) ismertKepek.clear();
    ismertKepek.set(u, { ok, ido: Date.now() });
    return ok;
}
const KEP_CACHE_MAX = 60 * 1024 * 1024;
const KEP_MAX = 8 * 1024 * 1024;

router.get("/api/img", async (req, res) => {

    try {

        const u = String(req.query.u || "");

        if (!/^https?:\/\//i.test(u) || u.length > 2000) return res.status(400).end();

        const cached = kepCache.get(u);

        if (cached) {
            res.set("Content-Type", cached.type);
            res.set("Cache-Control", "private, max-age=604800");
            res.set("X-Content-Type-Options", "nosniff");
            return res.send(cached.buf);
        }

        if (!req.user && !(await ismertKep(u))) return res.status(404).end();

        // Új (gyorstárban nem lévő) képek letöltése: IP-címenként percenként legfeljebb 240
        if (req.valodiSzerep !== "admin" && acc.korlat("img:" + String(req.ip || ""), 240, 60 * 1000)) return res.status(429).end();

        const host = new URL(u).hostname;

        const valasz = await biztonsagosFetch(u, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
                "Referer": "https://" + host.split(".").slice(-2).join(".") + "/",
                "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"
            },
            signal: AbortSignal.timeout(15000)
        });

        const type = valasz.headers.get("content-type") || "";

        // Csak valódi kép (SVG nem: abban szkript is lehetne)
        if (!valasz.ok || !type.startsWith("image/") || /svg/i.test(type)) return res.status(404).end();

        if (Number(valasz.headers.get("content-length")) > KEP_MAX) return res.status(413).end();

        const buf = Buffer.from(await valasz.arrayBuffer());

        if (buf.length > KEP_MAX) return res.status(413).end();

        kepCache.set(u, { type, buf });
        kepCacheMeret += buf.length;

        while (kepCacheMeret > KEP_CACHE_MAX && kepCache.size) {
            const [k, v] = kepCache.entries().next().value;
            kepCache.delete(k);
            kepCacheMeret -= v.buf.length;
        }

        res.set("Content-Type", type);
        res.set("Cache-Control", "private, max-age=604800");
        res.set("X-Content-Type-Options", "nosniff");
        res.send(buf);

    } catch (err) {

        res.status(err.code === "blocked_url" ? 400 : 502).end();

    }

});

module.exports = router;
