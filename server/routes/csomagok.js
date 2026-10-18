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
        // Rendeléskor NEM megy e-mail (se a vevőnek díjbekérő, se neked):
        // a díjbekérő nem kötelező, a fizetési adatok a képernyőn és a
        // Fiókom → Csomagom és számláim oldalon látszanak. E-mail csak akkor
        // megy, ha a pénz tényleg megérkezett (lent: rendelesFigyelo).
        res.json({ siker: true, ...v });
    } catch (err) {
        if (err && err.kod === "already_pending") return res.status(409).json({ error: "already_pending", rendeles_id: err.rendeles_id });
        hiba(res, err);
    }
});

// Amikor a díjbekérő kifizetett lett (kártyával, vagy te jelölted kifizetettnek):
//  - a vevő e-mailt kap, hogy a csomag él (a számla külön levélben megy – szamlazo.js)
//  - te (admin) e-mailt kapsz, ha kártyával fizetett (az átutalást te jelölöd,
//    arról nem kell levél)
//  - próba (Stripe teszt / demó) fizetésnél a levelekben ott a „TESZT” jelölés
pu.rendelesFigyelo(async x => {
    if (!mail.elerheto() || !["aktiv", "teljesitve"].includes(x.statusz) || x.elozo !== "fizetesre_var") return;

    const s = x.szamla_id ? await pu.szamla(x.szamla_id) : null;
    if (s && Number(s.brutto) === 0) return;            // ingyenes csomag: nincs mit jelezni
    const teszt = s ? await require("../services/fizetes").tesztFizetes(s.id).catch(() => false) : false;
    const tesztJel = teszt ? "[TESZT – nem valódi fizetés] " : "";

    // A vevő
    if (x.user_id) {
        const r = await db.query("SELECT email FROM users WHERE id = $1", [x.user_id]);
        const f = r.rows[0];
        if (f && f.email) {
            const t = mail.sablon({
                cim: tesztJel + "A befizetésed megérkezett – a csomagod aktív",
                sorok: [
                    `${x.megnevezes || "A csomag"}: köszönjük a befizetést, a csomag mostantól él.`,
                    "Plata a fost primită – pachetul este activ.",
                    teszt ? "Ez egy próbafizetés volt (nem terheltünk kártyát) – számla nem készül róla." : ""
                ].filter(Boolean),
                gomb: "Csomagom és számláim",
                link: mail.oldalCim() + "/#fiok/csomag"
            });
            await mail.kuld({ to: f.email, subject: tesztJel + "A csomagod aktív / Pachetul este activ", html: t.html, text: t.text });
        }
    }

    // Te (admin) – csak kártyás fizetésnél (az átutalást te magad jelölöd kifizetettnek)
    if (s && s.fizetesi_mod === "kartya") {
        const u = await oldalAdatok.nyilvanos();
        if (u.email) {
            const t = mail.sablon({
                cim: tesztJel + "Fizetett rendelés az IngatlanPro-n",
                sorok: [
                    `${(s.vevo && s.vevo.nev) || "Valaki"} kifizette: ${(s.tetelek || []).map(t => t.megnevezes).join(", ")}`,
                    `${s.brutto} ${s.penznem} · kártyával · ${s.sorszam}`,
                    teszt ? "Próbafizetés (Stripe teszt mód) – valódi pénz nem érkezett, számla nem készült." : "A csomag aktív, a számla magától elkészült és elment a vevőnek."
                ],
                gomb: "Rendelések",
                link: mail.oldalCim() + "/#admin/rendelesek",
                lablec: "Admin értesítés."
            });
            await mail.kuld({ to: u.email, subject: `${tesztJel}Fizetett rendelés: ${s.sorszam}`, html: t.html, text: t.text });
        }
    }
});

// ===================== FIÓKOM → CSOMAGOM ÉS SZÁMLÁIM =====================

router.get("/api/sajat-csomag/attekintes", csakBelepve, async (req, res) => {
    try { res.json(await rendeles.sajat(req.user)); } catch (err) { hiba(res, err); }
});

router.get("/api/sajat-csomag/szamlak/:id/nyomtat", csakBelepve, async (req, res) => {
    try {
        const s = await rendeles.sajatSzamla(req.user, req.params.id);
        if (!s) return res.status(404).send("Nincs ilyen bizonylat / Document inexistent");
        const dok = require("../services/dokumentum");
        const ford = dok.fordKer(req.query, (await pu.beallitas()).bizonylat_forditas);
        res.set("Content-Type", "text/html; charset=utf-8");
        res.set("Content-Security-Policy", dok.CSP);
        res.set("Cache-Control", "private, no-store");
        res.send(await bizonylatHtml(s, { nyomtat: true, ford, ui: dok.uiKer(req.query, ford), vissza: "/#fiok/csomag" }));
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
