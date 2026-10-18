// ============================================================
//  Admin → Irattár (számlák és szerződések) – services/irattar.js
//  Jog: a pénzügyek része (csapat.csakResz("penzugy"))
// ============================================================

const express = require("express");
const irattar = require("../services/irattar");
const { hiba } = require("../lib/http");
const csapat = require("../services/csapat");

const router = express.Router();
const jog = csapat.csakResz("penzugy");

const szuro = q => ({ resz: String(q.resz || "szamla"), kategoria: String(q.kategoria || ""), ev: String(q.ev || ""), q: String(q.q || "") });

router.get("/api/admin/irattar", jog, async (req, res) => {
    try {
        const f = szuro(req.query);
        const [lista, osszeg] = await Promise.all([irattar.lista(f), irattar.osszesites(f.resz)]);
        res.json({ lista, osszeg, kategoriak: irattar.KATEGORIAK[f.resz], tipusok: Object.keys(irattar.MIME) });
    } catch (err) { hiba(res, err); }
});

router.get("/api/admin/irattar/export.csv", jog, async (req, res) => {
    try {
        const f = szuro(req.query);
        res.set("Content-Type", "text/csv; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="irattar-${f.resz}${f.ev ? "-" + f.ev.replace(/\D/g, "") : ""}.csv"`);
        res.send(await irattar.csv(f));
    } catch (err) { hiba(res, err); }
});

// ---------- Szinkron a gépre (services/szinkron.js) ----------
const szinkron = require("../services/szinkron");
const { csakAdmin } = require("../lib/http");

router.get("/api/admin/irattar/szinkron", jog, async (req, res) => {
    try { res.json(await szinkron.allapot()); } catch (err) { hiba(res, err); }
});

// Új kulcs a gépnek (csak az admin) – csak most látszik
router.post("/api/admin/irattar/szinkron/kulcs", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, kulcs: await szinkron.ujKulcs(), cim: require("../services/mail").oldalCim(req) }); } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/irattar/szinkron/kulcs", csakAdmin, async (req, res) => {
    try { await szinkron.visszavon(); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// A gépen futó program hívja – a kulccsal (nem kell hozzá belépés)
async function szinkronJog(req, res, next) {
    try {
        if (await szinkron.ellenoriz(req.headers.authorization)) return next();
        res.status(401).json({ error: "bad_key" });
    } catch (err) { hiba(res, err); }
}

router.get("/szinkron/lista", szinkronJog, async (req, res) => {
    try { res.set("Cache-Control", "no-store"); res.json({ fajlok: await szinkron.lista() }); } catch (err) { hiba(res, err); }
});

router.get("/szinkron/fajl", szinkronJog, async (req, res) => {
    try {
        const f = await szinkron.fajl(String(req.query.kulcs || ""));
        res.set("Content-Type", f.mime);
        res.set("Cache-Control", "no-store");
        res.send(f.adat);
    } catch (err) {
        if (err && err.kod) return res.status(404).json({ error: err.kod });
        hiba(res, err);
    }
});

// A bevétel–kiadás napló (Registrul-jurnal de încasări și plăți) – évre vagy hónapra
router.get("/api/admin/irattar/registru.csv", jog, async (req, res) => {
    try {
        const p = irattar.idoszak(req.query.ev, req.query.honap);
        res.set("Content-Type", "text/csv; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="registru-incasari-plati-${p.nev}.csv"`);
        res.send(await irattar.registruCsv(p.ev, p.honap));
    } catch (err) { hiba(res, err); }
});

// Csomag a könyvelőnek: egy hónap / év minden pénzügyi irata egy ZIP-ben
router.get("/api/admin/irattar/csomag.zip", jog, async (req, res) => {
    try {
        const c = await irattar.csomag(req.query.ev, req.query.honap);
        res.set("Content-Type", "application/zip");
        res.set("Content-Disposition", `attachment; filename="${c.nev}"`);
        res.set("Cache-Control", "private, no-store");
        res.send(c.adat);
    } catch (err) { hiba(res, err); }
});

router.get("/api/admin/irattar/:id", jog, async (req, res) => {
    try {
        const x = await irattar.egy(req.params.id);
        if (!x) return res.status(404).json({ error: "not_found" });
        res.json(x);
    } catch (err) { hiba(res, err); }
});

// A fájl: PDF és kép a böngészőben nyílik, a többi letöltődik
router.get("/api/admin/irattar/:id/fajl", jog, async (req, res) => {
    try {
        const f = await irattar.fajl(req.params.id);
        if (!f) return res.status(404).send("Not found");
        const nyit = !req.query.letolt && /^(application\/pdf|image\/(jpeg|png|webp|gif))$/.test(f.mime);
        const nev = String(f.nev || "irat").replace(/[^\w.\- ]/g, "_");
        res.set("Content-Type", f.mime || "application/octet-stream");
        res.set("Content-Disposition", `${nyit ? "inline" : "attachment"}; filename="${nev}"; filename*=UTF-8''${encodeURIComponent(f.nev || "irat")}`);
        res.set("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
        res.set("Cache-Control", "private, no-store");
        res.send(f.adat);
    } catch (err) { hiba(res, err); }
});

router.post("/api/admin/irattar", jog, async (req, res) => {
    try { res.json({ siker: true, ...(await irattar.feltolt(req.user, req.body || {})) }); }
    catch (err) { hiba(res, err); }
});

router.put("/api/admin/irattar/:id", jog, async (req, res) => {
    try { res.json({ siker: true, ...(await irattar.modosit(req.params.id, req.body || {})) }); }
    catch (err) { hiba(res, err); }
});

router.delete("/api/admin/irattar/:id", jog, async (req, res) => {
    try { await irattar.torol(req.params.id); res.json({ siker: true }); }
    catch (err) { hiba(res, err); }
});

module.exports = router;
