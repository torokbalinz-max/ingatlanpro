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
const efactura = require("../services/efactura");
const rendeles = require("../services/rendeles");
const pu = require("../services/penzugy");
const mail = require("../services/mail");
const { hiba, csakBelepve, csakAdmin } = require("../lib/http");
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
        if (p.belso) return res.redirect(302, `/api/sajat-csomag/szamlak/${p.belso}/nyomtat${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`);
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
            szamlazo: await szamlazo.allapot(),
            webhook_cim: mail.oldalCim(req) + "/api/fizetes/stripe/webhook"
        });
    } catch (err) { hiba(res, err); }
});

// A Stripe kulcs megadása az adminban (csak az admin – a csapattag nem)
router.post("/api/admin/fizetes/stripe-kulcs", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, ...(await fizetes.kulcsBeallit((req.body || {}).kulcs)) }); }
    catch (err) {
        if (err && err.kod === "key_rejected") return res.status(400).json({ error: "key_rejected", message: err.reszlet });
        hiba(res, err);
    }
});

router.delete("/api/admin/fizetes/stripe-kulcs", csakAdmin, async (req, res) => {
    try { await fizetes.kulcsTorol(); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// A fizetési értesítés (webhook) bekapcsolása a Stripe-ban egy kattintással
router.post("/api/admin/fizetes/stripe-webhook", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, ...(await fizetes.webhookBeallit(mail.oldalCim(req))) }); }
    catch (err) {
        if (err && err.kod === "payment_provider_error") return res.status(502).json({ error: "payment_provider_error", message: err.reszlet });
        hiba(res, err);
    }
});

router.get("/api/admin/fizetes/lista", csapat.csakResz("penzugy"), async (req, res) => {
    try { res.json(await fizetes.adminLista()); } catch (err) { hiba(res, err); }
});

// Hivatalos számla kiállítása (újrapróbálás, vagy átutalásos fizetés után)
router.post("/api/admin/penzugy/szamlak/:id/hivatalos", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        if (!(await szamlazo.melyik())) return res.status(400).json({ error: "no_invoicer" });
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
        if (p.belso) return res.redirect(302, `/api/admin/penzugy/szamlak/${p.belso}/nyomtat${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`);
        if (p.link) return res.redirect(302, p.link);
        res.set("Content-Type", "application/pdf");
        res.send(p.pdf);
    } catch (err) { hiba(res, err); }
});

// e-Factura XML (a saját számlából) – az ANAF SPV-be feltölthető.
// Megnyitva „kódnak” látszik – ez így helyes, az ANAF ezt a gépi fájlt kéri.
async function efSzamla(req, res) {
    const s = await pu.szamla(Number(req.params.id) || 0);
    if (!s) { res.status(404).json({ error: "not_found" }); return null; }
    const h = await efactura.hianyok(s);
    if (h.length) {
        res.status(400).json({ error: "efactura_missing", hianyzik: h, hianyzik_szoveg: h.map(k => efactura.HIANY_SZOVEG[k] || k) });
        return null;
    }
    return s;
}

router.get("/api/admin/penzugy/szamlak/:id/efactura.xml", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        const s = await efSzamla(req, res);
        if (!s) return;
        const nev = String(s.sorszam).replace(/[^\w.-]/g, "_") + ".xml";
        res.set("Content-Type", "application/xml; charset=utf-8");
        res.set("Cache-Control", "private, no-store");
        res.set("Content-Disposition", `${req.query.megnez ? "inline" : "attachment"}; filename="${nev}"`);
        res.send(await efactura.xml(s));
    } catch (err) { hiba(res, err); }
});

// Ellenőrzés az ANAF-nál (ugyanazok a szabályok, mint a feltöltéskor)
router.post("/api/admin/penzugy/szamlak/:id/efactura/ellenoriz", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        const s = await efSzamla(req, res);
        if (!s) return;
        try {
            const v = await efactura.ellenoriz(s);
            await require("../db/database").query(
                "UPDATE penzugy_szamlak SET efactura_ellenorizve = NOW(), efactura_ok = $2 WHERE id = $1", [s.id, v.stare === "ok"]).catch(() => { });
            res.json(v);
        } catch (e) {
            res.status(502).json({ error: "anaf_unavailable", hibak: ["Az ANAF ellenőrzője most nem érhető el – próbáld pár perc múlva."] });
        }
    } catch (err) { hiba(res, err); }
});

// Az ANAF által készített PDF (olvasható alak) az XML-ből
router.get("/api/admin/penzugy/szamlak/:id/efactura.pdf", csapat.csakResz("penzugy"), async (req, res) => {
    try {
        const s = await efSzamla(req, res);
        if (!s) return;
        let v;
        try { v = await efactura.pdf(s); }
        catch (e) { return res.status(502).send("Az ANAF most nem érhető el – próbáld pár perc múlva. / ANAF indisponibil."); }
        if (!v.pdf) {
            res.status(400).set("Content-Type", "text/plain; charset=utf-8");
            return res.send("Az ANAF nem készített PDF-et:\n\n" + (v.hibak || []).join("\n"));
        }
        res.set("Content-Type", "application/pdf");
        res.set("Cache-Control", "private, no-store");
        res.set("Content-Disposition", `inline; filename="${String(s.sorszam).replace(/[^\w.-]/g, "_")}-anaf.pdf"`);
        res.send(v.pdf);
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
