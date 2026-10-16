// ============================================================
//  Csomagok és árak (nyilvános árlista), rendelés, a felhasználó
//  saját csomagjai és díjbekérői; Admin → Pénzügyek → Rendelések
//  (a munka: services/rendeles.js)
// ============================================================

const express = require("express");
const rendeles = require("../services/rendeles");
const pu = require("../services/penzugy");
const mail = require("../services/mail");
const oldalAdatok = require("../services/oldalAdatok");
const db = require("../db/database");
const { hiba, csakAdmin, csakBelepve } = require("../lib/http");
const csapat = require("../services/csapat");

const router = express.Router();

// A bizonylat HTML-je a pénzügyi útvonalakból
const bizonylatHtml = (...a) => require("./penzugy").bizonylatHtml(...a);

// Rendelésenként legfeljebb ennyi / óra / felhasználó (visszaélés ellen)
const rendelesSzamlalo = new Map();
function tulSok(userId) {
    const most = Date.now();
    const lista = (rendelesSzamlalo.get(userId) || []).filter(t => most - t < 60 * 60 * 1000);
    lista.push(most);
    rendelesSzamlalo.set(userId, lista);
    return lista.length > 10;
}

// ===================== NYILVÁNOS =====================

router.get("/api/csomagok", async (req, res) => {
    try { res.json(await rendeles.arlista()); } catch (err) { hiba(res, err); }
});

// ===================== RENDELÉS =====================

router.post("/api/csomagok/rendeles", csakBelepve, async (req, res) => {
    try {
        if (tulSok(req.user.id)) return res.status(429).json({ error: "too_many" });
        const v = await rendeles.rendel(req.user, req.body || {});
        res.json({ siker: true, ...v });
        ertesites(v, req).catch(e => console.error("Rendelés e-mail:", e.message));
    } catch (err) {
        if (err && err.kod === "already_pending") return res.status(409).json({ error: "already_pending", rendeles_id: err.rendeles_id });
        hiba(res, err);
    }
});

// E-mail a vevőnek (a díjbekérő) és az adminnak (új rendelés)
async function ertesites(v, req) {
    if (!mail.elerheto()) return;
    const s = v.szamla;
    const u = await oldalAdatok.nyilvanos();
    const to = s.vevo && s.vevo.email;
    if (to) {
        await mail.kuld({
            to,
            subject: `Díjbekérő / Factură proformă ${s.sorszam}`,
            html: await bizonylatHtml(s, { nyomtat: false }),
            replyTo: u.email || undefined
        });
    }
    if (u.email) {
        const link = mail.oldalCim(req) + "/#admin/rendelesek";
        const t = mail.sablon({
            cim: "Új rendelés az IngatlanPro-n",
            sorok: [
                `${(s.vevo && s.vevo.nev) || "Valaki"} megrendelte: ${(s.tetelek || []).map(x => x.megnevezes).join(", ")}`,
                `Díjbekérő: ${s.sorszam} · ${s.brutto} ${s.penznem}`,
                "A befizetés után jelöld kifizetettnek – a csomag akkor lesz aktív."
            ],
            gomb: "Rendelések",
            link,
            lablec: "Admin értesítés."
        });
        await mail.kuld({ to: u.email, subject: `Új rendelés: ${s.sorszam}`, html: t.html, text: t.text });
    }
}

// Amikor a díjbekérőt kifizetettnek jelölöd: e-mail a vevőnek, hogy a csomag él
pu.rendelesFigyelo(async x => {
    if (!mail.elerheto() || !["aktiv", "teljesitve"].includes(x.statusz) || x.elozo !== "fizetesre_var" || !x.user_id) return;
    const r = await db.query("SELECT email, ertesites_email FROM users WHERE id = $1", [x.user_id]);
    const f = r.rows[0];
    if (!f || !f.email) return;
    const t = mail.sablon({
        cim: "A befizetésed megérkezett – a csomagod aktív",
        sorok: [
            `${x.megnevezes || "A csomag"}: köszönjük a befizetést, a csomag mostantól él.`,
            "Plata a fost primită – pachetul este activ."
        ],
        gomb: "Csomagom és számláim",
        link: mail.oldalCim() + "/#fiok/csomag"
    });
    await mail.kuld({ to: f.email, subject: "A csomagod aktív / Pachetul este activ", html: t.html, text: t.text });
});

// ===================== FIÓKOM → CSOMAGOM ÉS SZÁMLÁIM =====================

router.get("/api/sajat-csomag/attekintes", csakBelepve, async (req, res) => {
    try { res.json(await rendeles.sajat(req.user)); } catch (err) { hiba(res, err); }
});

router.get("/api/sajat-csomag/szamlak/:id/nyomtat", csakBelepve, async (req, res) => {
    try {
        const s = await rendeles.sajatSzamla(req.user, req.params.id);
        if (!s) return res.status(404).send("Nincs ilyen bizonylat / Document inexistent");
        res.set("Content-Type", "text/html; charset=utf-8");
        res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:");
        res.send(await bizonylatHtml(s, { nyomtat: true }));
    } catch (err) { hiba(res, err); }
});

router.post("/api/sajat-csomag/elofizetes/:id/lemond", csakBelepve, async (req, res) => {
    try { res.json({ siker: true, ...(await rendeles.lemond(req.user, req.params.id)) }); } catch (err) { hiba(res, err); }
});

router.post("/api/sajat-csomag/rendeles/:id/visszavon", csakBelepve, async (req, res) => {
    try { res.json({ siker: true, ...(await rendeles.visszavon(req.user, req.params.id)) }); } catch (err) { hiba(res, err); }
});

// ===================== ADMIN =====================

router.get("/api/admin/penzugy/rendelesek", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        res.json(await rendeles.adminLista({ statusz: req.query.statusz, celcsoport: req.query.celcsoport, csomag_id: req.query.csomag_id }));
    } catch (err) { hiba(res, err); }
});

module.exports = router;
