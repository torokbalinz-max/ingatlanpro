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
// a lejárt csomag türelmi ideje: induláskor feliratkozik a fizetésekre (újra előfizetve visszaállít)
require("../services/turelem");

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
        // Tesztfiókkal (Admin → Tesztelés) nem lehet rendelni – ne keletkezzen valódi számla
        if (req.user.teszt) return res.status(400).json({ error: "test_account" });
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

// Amikor a díjbekérő kifizetett lett (kártyával, vagy te jelölted kifizetettnek).
// Csak a szükséges levelek mennek (OUG 34/2014 – 2011/83/EU irányelv 8. cikk (7)):
//  - a vevő EGY levelet kap: a számlát (PDF), benne a szerződés visszaigazolásával
//    (mit vett, mettől meddig, megújul-e, hogyan mondható le, elállás) – ezt a
//    számlázó küldi (services/szamlazo.js). Külön „a csomagod aktív” levél csak
//    akkor megy, ha számla nem készül tőlünk (próbafizetés, kikapcsolt automatikus
//    számla, vagy külső számlázó, amely maga küldi a számlát) – ilyenkor ez a
//    visszaigazolás.
//  - te (admin) csak akkor kapsz levelet, ha teendőd van (a számlát neked kell
//    kiállítanod, mert az automatikus számla ki van kapcsolva)
pu.rendelesFigyelo(async x => {
    if (!mail.elerheto() || !["aktiv", "teljesitve"].includes(x.statusz) || x.elozo !== "fizetesre_var") return;

    const s = x.szamla_id ? await pu.szamla(x.szamla_id) : null;
    if (s && Number(s.brutto) === 0) return;            // ingyenes csomag: nincs mit jelezni
    const teszt = s ? await require("../services/fizetes").tesztFizetes(s.id).catch(() => false) : false;
    const tesztJel = teszt ? "[TESZT – nem valódi fizetés] " : "";
    const szamlazo = require("../services/szamlazo");
    const melyik = await szamlazo.melyik().catch(() => null);
    const autoSzamla = (await pu.beallitas()).auto_szamla !== false;
    // a saját számlát mi küldjük (a visszaigazolással együtt) → nincs külön levél
    const sajatSzamlaMegy = !teszt && autoSzamla && melyik === "sajat";

    // A vevő – csak ha a számla nem tőlünk megy
    if (x.user_id && !sajatSzamlaMegy) {
        const r = await db.query("SELECT email FROM users WHERE id = $1", [x.user_id]);
        const f = r.rows[0];
        const to = (s && s.vevo && s.vevo.email) || (f && f.email);
        if (to) {
            const rendeles = (await db.query("SELECT * FROM penzugy_rendelesek WHERE id = $1", [x.id])).rows[0] || x;
            const vissza = await szamlazo.visszaigazolasSorok(rendeles, s).catch(() => []);
            const t = mail.sablon({
                cim: tesztJel + "Confirmarea comenzii / A rendelés visszaigazolása",
                sorok: [
                    ...vissza,
                    teszt ? "Plată de test – nu se emite factură. / Próbafizetés – számla nem készül." : !autoSzamla || !melyik ? "Factura vă va fi trimisă în curând. / A számlát hamarosan küldjük." : "Factura vă este trimisă de sistemul de facturare. / A számlát a számlázó rendszer küldi."
                ].filter(Boolean),
                gomb: "Contul meu / Fiókom",
                link: mail.oldalCim() + "/#fiok/csomag"
            });
            await mail.kuld({ to, subject: tesztJel + `Confirmare comandă / Rendelés visszaigazolása – ${(s && s.sorszam) || "#" + x.id}`, html: t.html, text: t.text });
            await db.query("UPDATE penzugy_rendelesek SET visszaigazolva = NOW() WHERE id = $1", [x.id]).catch(() => { });
        }
    }

    // Te (admin): csak ha teendőd van – kártyás fizetés után a számlát neked kell
    // kiállítanod (az átutalást te jelölöd kifizetettnek, arról tudsz)
    if (s && !teszt && (!autoSzamla || !melyik) && ["kartya", "online"].includes(s.fizetesi_mod)) {
        const u = await oldalAdatok.nyilvanos();
        if (u.email) {
            const t = mail.sablon({
                cim: "Fizetett rendelés – állíts ki számlát",
                sorok: [
                    `${(s.vevo && s.vevo.nev) || "Valaki"} kifizette: ${(s.tetelek || []).map(t => t.megnevezes).join(", ")}`,
                    `${s.brutto} ${s.penznem} · kártyával · ${s.sorszam}`,
                    "A csomag aktív. Az automatikus számla ki van kapcsolva – a számlát neked kell kiállítanod (Admin → Pénzügy → Számlák)."
                ],
                gomb: "Számlák",
                link: mail.oldalCim() + "/#admin/szamlak",
                lablec: "Admin értesítés."
            });
            await mail.kuld({ to: u.email, subject: `Állíts ki számlát: ${s.sorszam}`, html: t.html, text: t.text });
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

router.get("/api/sajat-csomag/szamlak/:id/pdf", csakBelepve, async (req, res) => {
    try {
        const s = await rendeles.sajatSzamla(req.user, req.params.id);
        if (!s) return res.status(404).send("Nincs ilyen bizonylat / Document inexistent");
        const p = await require("./penzugy").bizonylatPdf(s, {});
        res.set("Content-Type", "application/pdf");
        res.set("Content-Disposition", `${req.query.letolt ? "attachment" : "inline"}; filename="${p.nev}"`);
        res.set("Cache-Control", "private, no-store");
        res.send(p.tartalom);
    } catch (err) { hiba(res, err); }
});

router.post("/api/sajat-csomag/elofizetes/:id/lemond", csakBelepve, async (req, res) => {
    try { res.json({ siker: true, ...(await rendeles.lemond(req.user, req.params.id)) }); } catch (err) { hiba(res, err); }
});

router.post("/api/sajat-csomag/rendeles/:id/visszavon", csakBelepve, async (req, res) => {
    try { res.json({ siker: true, ...(await rendeles.visszavon(req.user, req.params.id)) }); } catch (err) { hiba(res, err); }
});

// Elállás a szerződéstől (14 nap, fogyasztóknak) – a fiókban két lépésben
// (gomb + megerősítés); azonnal visszaigazoló e-mail megy (services/rendeles.js)
router.post("/api/sajat-csomag/rendeles/:id/elallas", csakBelepve, async (req, res) => {
    try {
        if (!req.body || req.body.megerosit !== true) return res.status(400).json({ error: "confirm_required" });
        res.json({ siker: true, ...(await rendeles.elall(req.user, req.params.id, req.body.indok)) });
    } catch (err) { hiba(res, err); }
});

// ===================== ADMIN =====================

router.get("/api/admin/penzugy/elallasok", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await rendeles.elallasLista()); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/elallasok/:id/rendez", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await rendeles.elallasRendez(req.params.id, req.body || {})); } catch (err) { hiba(res, err); }
});

router.get("/api/admin/penzugy/rendelesek", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        res.json(await rendeles.adminLista({ statusz: req.query.statusz, celcsoport: req.query.celcsoport, csomag_id: req.query.csomag_id }));
    } catch (err) { hiba(res, err); }
});

// Lejárt csomag miatt türelmi időben lévők (Admin → Pénzügy → Rendelések)
router.get("/api/admin/penzugy/turelem", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await require("../services/turelem").adminLista()); } catch (err) { hiba(res, err); }
});

module.exports = router;
