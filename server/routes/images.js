// ============================================================
//  Képek: feltöltött fotók + más oldalak képeinek továbbítása
// ============================================================

const express = require("express");
const db = require("../db/database");
const { hiba } = require("../lib/http");

const router = express.Router();

router.get("/api/kepek/:id", async (req, res) => {

    try {

        const r = await db.query("SELECT mime, adat FROM ingatlan_kepek WHERE id = $1", [req.params.id]);

        if (!r.rowCount) return res.status(404).end();

        res.set("Content-Type", r.rows[0].mime);
        res.set("Cache-Control", "private, max-age=31536000, immutable");
        res.send(r.rows[0].adat);

    } catch (err) {
        hiba(res, err);
    }

});

// Más oldalak képeinek továbbítása (így a forrásoldal nem tilthatja le,
// és nem kell a böngészőnek közvetlenül oda fordulnia). Kis memóriás
// gyorstárral, hogy ugyanazt a képet ne kérjük le újra és újra.
const kepCache = new Map();
let kepCacheMeret = 0;
const KEP_CACHE_MAX = 60 * 1024 * 1024;

router.get("/api/img", async (req, res) => {

    try {

        const u = String(req.query.u || "");

        if (!/^https:\/\//i.test(u) || u.length > 2000) return res.status(400).end();

        const host = new URL(u).hostname;

        if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return res.status(400).end();

        const cached = kepCache.get(u);

        if (cached) {
            res.set("Content-Type", cached.type);
            res.set("Cache-Control", "private, max-age=604800");
            return res.send(cached.buf);
        }

        const valasz = await fetch(u, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
                "Referer": "https://" + host.split(".").slice(-2).join(".") + "/",
                "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"
            },
            signal: AbortSignal.timeout(15000)
        });

        const type = valasz.headers.get("content-type") || "";

        if (!valasz.ok || !type.startsWith("image/")) return res.status(404).end();

        const buf = Buffer.from(await valasz.arrayBuffer());

        if (buf.length > 8 * 1024 * 1024) return res.status(413).end();

        kepCache.set(u, { type, buf });
        kepCacheMeret += buf.length;

        while (kepCacheMeret > KEP_CACHE_MAX && kepCache.size) {
            const [k, v] = kepCache.entries().next().value;
            kepCache.delete(k);
            kepCacheMeret -= v.buf.length;
        }

        res.set("Content-Type", type);
        res.set("Cache-Control", "private, max-age=604800");
        res.send(buf);

    } catch (err) {

        res.status(502).end();

    }

});

module.exports = router;
