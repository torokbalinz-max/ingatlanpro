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
