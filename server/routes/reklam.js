// ============================================================
//  Reklámfelületek
//   Admin:     beállítások, hirdetések (feltöltés, módosítás, törlés), statisztika
//   Weboldal:  a hirdetés képe, kattintás (számolás + továbbküldés),
//              megjelenések (sütik és személyes adat nélkül)
// ============================================================

const express = require("express");
const reklam = require("../services/reklam");
const acc = require("../services/accounts");
const { hiba, csakAdmin } = require("../lib/http");
const csapat = require("../services/csapat");

const router = express.Router();

const hibaKod = (res, err) => {
    if (err && err.kod) return res.status(400).json({ error: err.kod });
    hiba(res, err);
};

// ---------- Admin: beállítások ----------

router.get("/api/admin/reklam", csapat.csakResz("reklam"), async (req, res) => {
    try {
        res.json({ adat: await reklam.olvas(), helyek: reklam.HELYEK });
    } catch (err) {
        hiba(res, err);
    }
});

router.put("/api/admin/reklam", csapat.csakResz("reklam"), async (req, res) => {
    try {
        res.json({ siker: true, adat: await reklam.ment(req.body || {}) });
    } catch (err) {
        hibaKod(res, err);
    }
});

// ---------- Admin: hirdetések ----------

router.get("/api/admin/reklamok", csapat.csakResz("reklam"), async (req, res) => {
    try {
        const napok = Math.min(Math.max(parseInt(req.query.napok, 10) || 30, 1), 365);
        const [lista, ossz, lejaro] = await Promise.all([reklam.lista(napok), reklam.osszesites(napok), reklam.lejarok(7)]);
        res.json({ hirdetesek: lista, osszesites: ossz, lejarok: lejaro, napok, helyek: reklam.HELYEK, beallitas: await reklam.olvas() });
    } catch (err) {
        hiba(res, err);
    }
});

router.post("/api/admin/reklamok", csapat.csakResz("reklam"), async (req, res) => {
    try {
        res.json({ siker: true, hirdetes: await reklam.letrehoz(req.body || {}) });
    } catch (err) {
        hibaKod(res, err);
    }
});

router.put("/api/admin/reklamok/:id", csapat.csakResz("reklam"), async (req, res) => {
    try {
        const h = await reklam.modosit(Number(req.params.id), req.body || {});
        if (!h) return res.status(404).json({ error: "not_found" });
        res.json({ siker: true, hirdetes: h });
    } catch (err) {
        hibaKod(res, err);
    }
});

router.delete("/api/admin/reklamok/:id", csapat.csakResz("reklam"), async (req, res) => {
    try {
        await reklam.torol(Number(req.params.id));
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }
});

// ---------- Számlázás, szerződés (services/reklamSzamla.js) ----------

const rsz = require("../services/reklamSzamla");
const dok = require("../services/dokumentum");
const mail = require("../services/mail");

router.get("/api/admin/reklamok/:id/szamlazas", csapat.csakResz("reklam"), async (req, res) => {
    try { res.json(await rsz.allapot(Number(req.params.id))); } catch (err) { hibaKod(res, err); }
});

router.post("/api/admin/reklamok/:id/szerzodes-kuld", csapat.csakResz("reklam"), async (req, res) => {
    try { res.json({ siker: true, ...(await rsz.kuld(Number(req.params.id), mail.oldalCim(req))) }); }
    catch (err) {
        if (err && err.kod === "ad_billing_missing") return res.status(400).json({ error: err.kod, hianyzik: String(err.reszlet || "").split(",") });
        hibaKod(res, err);
    }
});

// A szerződés az adminnak (nyomtatható)
router.get("/api/admin/reklamok/:id/szerzodes", csapat.csakResz("reklam"), async (req, res) => {
    try {
        const r = await rsz.reklamAdat(Number(req.params.id));
        if (!r || !r.szerzodes_szam) return res.status(404).send("Nincs szerződés");
        res.set("Content-Type", "text/html; charset=utf-8");
        res.set("Content-Security-Policy", dok.CSP);
        res.set("Cache-Control", "private, no-store");
        res.send(await rsz.html(r, { ford: dok.fordKer(req.query, "hu"), ui: dok.uiKer(req.query, "hu"), vissza: "/#admin/reklam" }));
    } catch (err) { hiba(res, err); }
});

// A hirdető oldala: a szerződés + elfogadás (belépés nélkül, a titkos linkkel)
router.get("/reklam-szerzodes/:token", async (req, res) => {
    try {
        const r = await rsz.tokennel(req.params.token);
        if (!r) return res.status(404).send("Contract inexistent / Nincs ilyen szerződés");
        res.set("Content-Type", "text/html; charset=utf-8");
        res.set("Content-Security-Policy", dok.CSP);
        res.set("Cache-Control", "private, no-store");
        res.set("X-Robots-Tag", "noindex");
        res.send(await rsz.html(r, { ford: dok.fordKer(req.query, ""), ui: dok.uiKer(req.query, "ro"), elfogadhato: true, token: req.params.token }));
    } catch (err) { hiba(res, err); }
});

router.post("/reklam-szerzodes/:token/elfogad", async (req, res) => {
    try {
        const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
        await rsz.elfogad(req.params.token, ip);
        res.json({ siker: true });
    } catch (err) { hibaKod(res, err); }
});

router.get("/api/admin/reklamok/:id/stat", csapat.csakResz("reklam"), async (req, res) => {
    try {
        res.json({ napi: await reklam.napiStat(Number(req.params.id), 60) });
    } catch (err) {
        hiba(res, err);
    }
});

// ---------- Weboldal ----------

// A hirdetés képe (az URL-ben a változat, így sokáig gyorstárazható)
router.get("/api/reklam/:id/kep", async (req, res) => {
    try {
        const k = await reklam.kep(Number(req.params.id), req.query.m === "1");
        if (!k) return res.status(404).end();
        res.set("Content-Type", k.mime || "image/jpeg");
        res.set("Cache-Control", req.query.v ? "public, max-age=2592000, immutable" : "public, max-age=3600");
        res.set("Content-Security-Policy", "default-src 'none'");
        res.send(k.adat);
    } catch (err) {
        res.status(500).end();
    }
});

// Kattintás: számolás, aztán tovább a hirdető oldalára
router.get("/api/reklam/:id/klikk", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.redirect(302, "/");
        // Az admin saját kattintásai és a gyors ismétlések (frissítés, dupla katt) nem számítanak
        const ip = String(req.ip || "");
        const ismetles = acc.korlat(`rklikk:${id}:${ip}`, 1, 30 * 1000);
        const cel = await reklam.kattintas(id, String(req.query.hely || ""), req.valodiSzerep !== "admin" && !ismetles);
        res.set("Cache-Control", "no-store");
        res.redirect(302, cel || "/");
    } catch (err) {
        res.redirect(302, "/");
    }
});

// Megjelenések: { lista: [{ id, hely }] } – amit a látogató legalább félig látott
router.post("/api/reklam/megjelenes", async (req, res) => {
    try {
        if (req.valodiSzerep === "admin") return res.json({ ok: true });
        // Egy címről percenként legfeljebb 30 küldés (a hibás / rosszindulatú ismétlések ellen)
        if (acc.korlat("rmegj:" + String(req.ip || ""), 30, 60 * 1000)) return res.json({ ok: true });
        const lista = req.body && Array.isArray(req.body.lista) ? req.body.lista : [];
        await reklam.megjelenesek(lista);
        res.json({ ok: true });
    } catch (err) {
        res.json({ ok: false });
    }
});

module.exports = router;
