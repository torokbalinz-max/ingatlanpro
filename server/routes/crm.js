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

router.get(`${B}/export.csv`, async (req, res) => {
    try {
        const ctx = await crm.kontextus(req, req.params.ter);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="ugyfelek-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send(await crm.csv(ctx));
    } catch (err) { valasz(res, err); }
});

module.exports = router;
