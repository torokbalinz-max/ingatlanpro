// ============================================================
//  CRM végpontok – /api/crm/:ter/...
//   ter = az iroda id-je (az iroda saját, zárt CRM-je), 0 = az oldal CRM-je (admin)
//  A jogosultságot a services/crm.js kontextus() dönti el minden kérésnél.
// ============================================================

const express = require("express");
const crm = require("../services/crm");
const { hiba } = require("../lib/http");

const router = express.Router();

// A hibakódos hibákat (e.kod) a kliens a saját szövegével mutatja
function valasz(res, err) {
    if (err && err.kod) return res.status(err.status || 400).json({ error: err.kod, ...(err.extra || {}) });
    hiba(res, err);
}

// Egy végpont: kontextus + a művelet
const vp = fn => async (req, res) => {
    try {
        const ctx = await crm.kontextus(req, req.params.ter);
        res.json(await fn(ctx, req));
    } catch (err) { valasz(res, err); }
};

const B = "/api/crm/:ter";

router.get(`${B}/attekintes`, vp(ctx => crm.attekintes(ctx)));
router.get(`${B}/tagok`, vp(async ctx => ({ tagok: await crm.tagok(ctx), en: ctx.userId, vezeto: ctx.vezeto })));

router.get(`${B}/ugyfelek`, vp((ctx, req) => crm.ugyfelLista(ctx, req.query)));
router.post(`${B}/ugyfelek`, vp((ctx, req) => crm.ugyfelMent(ctx, null, req.body || {})));
router.get(`${B}/ugyfelek/:id`, vp((ctx, req) => crm.ugyfel(ctx, req.params.id)));
router.put(`${B}/ugyfelek/:id`, vp((ctx, req) => crm.ugyfelMent(ctx, req.params.id, req.body || {})));
router.patch(`${B}/ugyfelek/:id`, vp((ctx, req) => crm.ugyfelValt(ctx, req.params.id, req.body || {})));
router.delete(`${B}/ugyfelek/:id`, vp((ctx, req) => crm.ugyfelTorol(ctx, req.params.id)));

router.post(`${B}/ugyfelek/:id/tevekenyseg`, vp((ctx, req) => crm.tevekenyseg(ctx, req.params.id, req.body || {})));
router.delete(`${B}/ugyfelek/:id/tevekenyseg/:tid`, vp((ctx, req) => crm.tevekenysegTorol(ctx, req.params.id, req.params.tid)));
router.post(`${B}/ugyfelek/:id/ingatlan`, vp((ctx, req) => crm.ingatlanKapcsol(ctx, req.params.id, req.body || {})));
router.delete(`${B}/ugyfelek/:id/ingatlan/:iid`, vp((ctx, req) => crm.ingatlanLevesz(ctx, req.params.id, req.params.iid)));

router.get(`${B}/ingatlan-kereso`, vp((ctx, req) => crm.ingatlanKeres(ctx, req.query.q)));

router.get(`${B}/feladatok`, vp((ctx, req) => crm.feladatLista(ctx, req.query)));
router.post(`${B}/feladatok`, vp((ctx, req) => crm.feladatMent(ctx, null, req.body || {})));
router.put(`${B}/feladatok/:id`, vp((ctx, req) => crm.feladatMent(ctx, req.params.id, req.body || {})));
router.post(`${B}/feladatok/:id/kesz`, vp((ctx, req) => crm.feladatKesz(ctx, req.params.id, (req.body || {}).kesz !== false, (req.body || {}).jegyzet)));
router.delete(`${B}/feladatok/:id`, vp((ctx, req) => crm.feladatTorol(ctx, req.params.id)));

router.get(`${B}/beerkezo`, vp(ctx => crm.beerkezo(ctx)));
router.post(`${B}/beerkezo/felvesz`, vp((ctx, req) => crm.beerkezoFelvesz(ctx, req.body || {})));
router.post(`${B}/beerkezo/elvet`, vp((ctx, req) => crm.beerkezoElvet(ctx, req.body || {})));

router.get(`${B}/megtekintesek`, vp((ctx, req) => crm.megtLista(ctx, req.query)));
router.post(`${B}/megtekintesek`, vp((ctx, req) => crm.megtMent(ctx, null, req.body || {})));
router.put(`${B}/megtekintesek/:id`, vp((ctx, req) => crm.megtMent(ctx, req.params.id, req.body || {})));
router.post(`${B}/megtekintesek/:id/eredmeny`, vp((ctx, req) => crm.megtEredmeny(ctx, req.params.id, req.body || {})));
router.delete(`${B}/megtekintesek/:id`, vp((ctx, req) => crm.megtTorol(ctx, req.params.id)));

router.get(`${B}/ingatlanok`, vp((ctx, req) => crm.ingatlanLista(ctx, req.query)));
router.get(`${B}/ingatlanok/:id`, vp((ctx, req) => crm.ingatlanReszlet(ctx, req.params.id)));

router.get(`${B}/csapat`, vp(ctx => crm.csapat(ctx)));

// ---- Iratok (ügyfelenként) ----
const iratok = require("../services/crmIratok");
const ajanlat = require("../services/ajanlat");
const U = `${B}/ugyfelek/:id`;
const uvp = fn => vp(async (ctx, req) => { const u = await crm.ugyfelJog(ctx, req.params.id); return fn(u, ctx, req); });

router.get(`${U}/iratok`, uvp(u => iratok.lista(u.id)));
router.post(`${U}/iratok/sablon`, uvp((u, ctx, req) => iratok.sablonbol(u.id, req.body || {})));
router.post(`${U}/iratok`, uvp((u, ctx, req) => iratok.hozzaad(u.id, req.body || {})));
router.put(`${U}/iratok/:iid`, uvp((u, ctx, req) => iratok.modosit(u.id, req.params.iid, req.body || {})));
router.delete(`${U}/iratok/:iid`, uvp((u, ctx, req) => iratok.torol(u.id, req.params.iid)));
router.post(`${U}/iratok/:iid/fajl`, uvp((u, ctx, req) => iratok.fajlFeltolt(u.id, req.params.iid, req.body || {}, "iroda", ctx.userId)));
router.delete(`${U}/fajl/:fid`, uvp((u, ctx, req) => iratok.fajlTorol(u.id, req.params.fid)));
router.post(`${U}/portal`, uvp((u, ctx, req) => iratok.portalAllit(u.id, (req.body || {}).mit)));
router.get(`${U}/fajl/:fid`, async (req, res) => {
    try {
        const ctx = await crm.kontextus(req, req.params.ter);
        const u = await crm.ugyfelJog(ctx, req.params.id);
        fajlKuld(res, await iratok.fajl(u.id, req.params.fid));
    } catch (err) { valasz(res, err); }
});

// ---- Ajánlatok (az iroda CRM-jében) ----
router.get(`${B}/ajanlatok`, vp((ctx, req) => ctx.irodaId === null ? [] : ajanlat.irodaLista(ctx, req.query)));
router.post(`${B}/ajanlatok/:id/valasz`, vp((ctx, req) => ajanlat.irodaValasz(ctx, req.params.id, req.body || {})));
router.post(`${B}/ajanlatok/:id/kapcsol`, vp((ctx, req) => ajanlat.irodaKapcsol(ctx, req.params.id, (req.body || {}).ingatlan_id)));

router.get(`${B}/export.csv`, async (req, res) => {
    try {
        const ctx = await crm.kontextus(req, req.params.ter);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="ugyfelek-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send(await crm.csv(ctx));
    } catch (err) { valasz(res, err); }
});

// Fájl kiküldése: csak a megengedett típusok; a böngésző ne futtasson benne semmit
function fajlKuld(res, f) {
    res.setHeader("Content-Type", f.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    // a képek elszigetelve; a PDF-et a böngésző saját nézője nyitja (sandbox mellett nem jelenne meg)
    if (f.mime !== "application/pdf") res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(f.nev || "irat")}`);
    res.send(f.adat);
}

// ===================== ÜGYFÉLPORTÁL (belépés nélkül, titkos linkkel) =====================
const P = "/api/crm-portal/:token";
const pvp = fn => async (req, res) => {
    try { res.json(await fn(req)); } catch (err) { valasz(res, err); }
};
router.get(P, pvp(req => iratok.portal(req.params.token)));
router.post(`${P}/irat/:iid`, pvp(req => iratok.portalFeltolt(req.params.token, req.params.iid, req.body || {})));
router.delete(`${P}/fajl/:fid`, pvp(async req => { const u = await iratok.portalUgyfel(req.params.token); return iratok.fajlTorol(u.id, req.params.fid, true); }));
router.get(`${P}/fajl/:fid`, async (req, res) => {
    try {
        const u = await iratok.portalUgyfel(req.params.token);
        fajlKuld(res, await iratok.fajl(u.id, req.params.fid));
    } catch (err) { valasz(res, err); }
});

// ===================== VÉTELI AJÁNLATOK (vevő, magánhirdető) =====================
const belepve = (req) => { if (!req.user) { const e = new Error("login_required"); e.kod = "login_required"; e.status = 401; throw e; } return req.user; };
router.post("/api/ajanlatok", pvp(req => ajanlat.tesz(belepve(req), req.body || {})));
router.get("/api/ajanlatok/sajat", pvp(req => ajanlat.sajat(belepve(req))));
router.get("/api/ajanlatok/beerkezett", pvp(req => ajanlat.beerkezett(belepve(req))));
router.post("/api/ajanlatok/:id/visszavon", pvp(req => ajanlat.vevoValt(belepve(req), req.params.id, "visszavon")));
router.post("/api/ajanlatok/:id/ellen-elfogad", pvp(req => ajanlat.vevoValt(belepve(req), req.params.id, "ellen_elfogad")));
router.post("/api/ajanlatok/:id/valasz", pvp(req => ajanlat.maganValasz(belepve(req), req.params.id, req.body || {})));

module.exports = router;
