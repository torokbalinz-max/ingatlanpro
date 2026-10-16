// ============================================================
//  Online fizetés (Stripe), hivatalos számla, kiemelések
//  (a munka: services/fizetes.js, services/szamlazo.js, services/kiemeles.js)
//
//  A Stripe webhookja (stripeWebhook) a belépés és a JSON-olvasó ELŐTT van
//  bekötve a server.js-ben, mert az aláírást a nyers kéréstörzsön kell
//  ellenőrizni, és a Stripe nem jelentkezik be.
// ============================================================

const express = require("express");
const fizetes = require("../services/fizetes");
const szamlazo = require("../services/szamlazo");
const kiemeles = require("../services/kiemeles");
const rendeles = require("../services/rendeles");
const pu = require("../services/penzugy");
const mail = require("../services/mail");
const { hiba, csakBelepve } = require("../lib/http");
const csapat = require("../services/csapat");

const router = express.Router();

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ===================== STRIPE WEBHOOK (nyers törzs) =====================

const stripeWebhook = express.Router();
stripeWebhook.post("/api/fizetes/stripe/webhook", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
    try {
        const nyers = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
        await fizetes.webhook(nyers, req.headers["stripe-signature"]);
        res.json({ received: true });
    } catch (err) {
        if (err && err.kod === "bad_signature") return res.status(400).json({ error: "bad_signature" });
        console.error("Stripe webhook:", err.message);
        // 500 → a Stripe később újra próbálja
        res.status(500).json({ error: "server_error" });
    }
});

// ===================== FIZETÉS =====================

router.get("/api/fizetes/allapot", async (req, res) => {
    try {
        const a = await fizetes.allapot();
        res.json({ elerheto: a.elerheto, mod: a.mod });
    } catch (err) { hiba(res, err); }
});

// Fizetés indítása a saját díjbekérőre → { url } (oda kell átirányítani)
router.post("/api/fizetes/szamla/:id", csakBelepve, async (req, res) => {
    try {
        const v = await fizetes.inditas(req.user, req.params.id, {
            alapCim: mail.oldalCim(req),
            nyelv: String((req.body && req.body.nyelv) || "").slice(0, 2)
        });
        res.json(v);
    } catch (err) {
        if (err && err.kod === "payment_provider_error") {
            console.error("Stripe:", err.reszlet);
            return res.status(502).json({ error: "payment_provider_error" });
        }
        if (err && err.kod === "too_many") return res.status(429).json({ error: "too_many" });
        if (err && err.kod === "not_found") return res.status(404).json({ error: "not_found" });
        hiba(res, err);
    }
});

// Visszatérés után: mi lett a fizetéssel?
router.get("/api/fizetes/ellenoriz/:munkamenet", csakBelepve, async (req, res) => {
    try { res.json(await fizetes.ellenoriz(req.user, req.params.munkamenet)); }
    catch (err) {
        if (err && err.kod === "not_found") return res.status(404).json({ error: "not_found" });
        hiba(res, err);
    }
});

// ---------- Demó fizetőoldal (csak FIZETES_DEMO=1, Stripe nélkül) ----------

router.get("/api/fizetes/demo/:munkamenet", async (req, res) => {
    try {
        const f = await fizetes.demoAdat(req.params.munkamenet);
        if (!f) return res.status(404).send("Not found");
        const m = esc(f.munkamenet);
        res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html><html lang="hu"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Próbafizetés</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f6fb;margin:0;display:grid;place-items:center;min-height:100vh;padding:16px}
.k{background:#fff;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.08);padding:28px;max-width:420px;width:100%}
.d{background:#fff3cd;border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:18px}
.o{font-size:30px;font-weight:700;margin:6px 0 20px}button,a{display:block;width:100%;padding:12px;border-radius:10px;font-size:16px;text-align:center;box-sizing:border-box}
button{background:#635bff;color:#fff;border:0;cursor:pointer;margin-bottom:10px}a{color:#555;text-decoration:none;border:1px solid #ddd}</style></head>
<body><div class="k"><div class="d">PRÓBA – nem valódi fizetés (FIZETES_DEMO=1). Élesben itt a Stripe biztonságos kártyás oldala jelenik meg.</div>
<div>${esc(f.sorszam)}</div><div class="o">${esc(Number(f.osszeg).toFixed(2))} ${esc(f.penznem)}</div>
<form method="post" action="/api/fizetes/demo/${m}"><button type="submit">Fizetés (próba)</button></form>
<a href="/?fizetes=megszakitva#fiok/csomag">Mégse</a></div></body></html>`);
    } catch (err) { hiba(res, err); }
});

router.post("/api/fizetes/demo/:munkamenet", async (req, res) => {
    try {
        await fizetes.demoFizet(req.params.munkamenet);
        res.redirect(303, `/?fizetes=${encodeURIComponent(req.params.munkamenet)}#fiok/csomag`);
    } catch (err) {
        if (err && err.kod === "not_found") return res.status(404).send("Not found");
        hiba(res, err);
    }
});

// ===================== HIVATALOS SZÁMLA =====================

// A felhasználó a saját hivatalos számláját tölti le
router.get("/api/sajat-csomag/szamlak/:id/hivatalos", csakBelepve, async (req, res) => {
    try {
        const s = await rendeles.sajatSzamla(req.user, req.params.id);
        if (!s) return res.status(404).json({ error: "not_found" });
        const p = await szamlazo.pdf(s);
        if (!p) return res.status(404).json({ error: "not_found" });
        if (p.link) return res.redirect(302, p.link);
        res.set("Content-Type", "application/pdf");
        res.set("Content-Disposition", `inline; filename="${p.nev.replace(/[^\w.-]/g, "_")}"`);
        res.send(p.pdf);
    } catch (err) { hiba(res, err); }
});

// ===================== KIEMELÉS (a felhasználó) =====================

router.get("/api/kiemeles/sajat/:ingatlanId", csakBelepve, async (req, res) => {
    try { res.json(await kiemeles.sajatAllapot(req.user, req.params.ingatlanId)); }
    catch (err) { hiba(res, err); }
});

const felhasznalSzamlalo = new Map();
router.post("/api/kiemeles/sajat/:ingatlanId/felhasznal", csakBelepve, async (req, res) => {
    try {
        const most = Date.now();
        const l = (felhasznalSzamlalo.get(req.user.id) || []).filter(t => most - t < 3600000);
        l.push(most);
        felhasznalSzamlalo.set(req.user.id, l);
        if (l.length > 30) return res.status(429).json({ error: "too_many" });
        const k = await kiemeles.sajatFelhasznal(req.user, req.params.ingatlanId, String((req.body && req.body.mibol) || ""));
        res.json({ siker: true, ...k });
    } catch (err) { hiba(res, err); }
});

// ===================== ADMIN =====================

router.get("/api/admin/fizetes/allapot", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        res.json({
            fizetes: await fizetes.allapot(),
            szamlazo: szamlazo.allapot(),
            webhook_cim: mail.oldalCim(req) + "/api/fizetes/stripe/webhook"
        });
    } catch (err) { hiba(res, err); }
});

router.get("/api/admin/fizetes/lista", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await fizetes.adminLista()); } catch (err) { hiba(res, err); }
});

// Hivatalos számla kiállítása (újrapróbálás, vagy átutalásos fizetés után)
router.post("/api/admin/penzugy/szamlak/:id/hivatalos", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        if (!szamlazo.melyik()) return res.status(400).json({ error: "no_invoicer" });
        res.json(await szamlazo.kiallit(req.params.id));
    } catch (err) {
        if (err && !err.kod) return res.status(502).json({ error: "invoicer_error", message: err.message });
        hiba(res, err);
    }
});

router.get("/api/admin/penzugy/szamlak/:id/hivatalos", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        const s = await pu.szamla(Number(req.params.id) || 0);
        const p = await szamlazo.pdf(s);
        if (!p) return res.status(404).json({ error: "not_found" });
        if (p.link) return res.redirect(302, p.link);
        res.set("Content-Type", "application/pdf");
        res.send(p.pdf);
    } catch (err) { hiba(res, err); }
});

router.get("/api/admin/kiemelesek", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await kiemeles.adminLista()); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/kiemelesek", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        const b = req.body || {};
        const k = await kiemeles.hozzaad({
            ingatlan_id: b.ingatlan_id, nap: b.nap, forras: "admin", user_id: req.user && req.user.id,
            megjegyzes: String(b.megjegyzes || "").slice(0, 300) || null
        });
        res.json({ siker: true, ...k });
    } catch (err) { hiba(res, err); }
});

router.post("/api/admin/kiemelesek/:id/leallit", csapat.csakResz("penzugy"), async (req, res) => {
    try { await kiemeles.adminLeallit(req.params.id); res.json({ siker: true }); }
    catch (err) { hiba(res, err); }
});

module.exports = router;
module.exports.stripeWebhook = stripeWebhook;
