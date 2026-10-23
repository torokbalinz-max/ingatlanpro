// ============================================================
//  AI asszisztens (csevegő) – services/chatbot.js
//   POST /api/chat  { uzenetek: [{ role, content }], lang, varos }
//     -> { valasz, hirdetesek: [hirdetés adatai a kártyákhoz], kereses }
//  A beszélgetést nem tároljuk.
// ============================================================

const express = require("express");
const db = require("../db/database");
const { hiba } = require("../lib/http");
const { LISTA_MEZOK } = require("../lib/sql");
const chatbot = require("../services/chatbot");
const funkciok = require("../services/funkciok");

const router = express.Router();

async function bekapcsolva() {
    if (!chatbot.elerheto()) return false;
    try { return (await funkciok.olvas()).chatbot !== false; } catch (e) { return true; }
}

router.get("/api/chat/allapot", async (req, res) => {
    res.json({ be: await bekapcsolva() });
});

router.post("/api/chat", async (req, res) => {

    try {

        if (!(await bekapcsolva())) return res.status(503).json({ error: "chat_off" });
        if (!req.user && /^(0|false|nem|no|privat|privát)$/i.test(String(process.env.NYILVANOS || "").trim())) {
            return res.status(401).json({ error: "login_required" });
        }

        const ki = req.user ? "u" + req.user.id : "ip" + String(req.ip || (req.socket && req.socket.remoteAddress) || "?");
        const k = req.valodiSzerep === "admin" ? null : chatbot.korlat(ki);
        if (k) return res.status(429).json({ error: k });

        const b = req.body || {};
        const e = await chatbot.valasz({
            uzenetek: b.uzenetek,
            lang: String(b.lang || "hu").slice(0, 2),
            varos: String(b.varos || "").slice(0, 80),
            belepve: !!req.user
        });

        if (e.hiba) return res.status(400).json({ error: e.hiba });

        // A talált hirdetések adatai a kártyákhoz (ugyanaz, mint a listában)
        let hirdetesek = [];
        if (e.hirdetesek.length) {
            const r = await db.query(`SELECT ${LISTA_MEZOK} FROM ingatlanok i WHERE i.id = ANY($1::int[]) AND i.statusz = 'aktiv'`, [e.hirdetesek]);
            const sorrend = new Map(e.hirdetesek.map((id, n) => [id, n]));
            hirdetesek = r.rows.sort((a, c) => sorrend.get(a.id) - sorrend.get(c.id));
            if (req.szerep !== "admin") hirdetesek.forEach(x => { if (x.forras_tipus === "import") x.cim = null; });
        }

        res.json({ valasz: e.valasz, hirdetesek, kereses: e.kereses });

    } catch (err) {
        if (err && err.status) {
            console.error("AI asszisztens:", err.status, err.message);
            return res.status(502).json({ error: err.status === 429 || err.status === 529 ? "ai_busy" : "ai_error" });
        }
        hiba(res, err);
    }

});

module.exports = router;
