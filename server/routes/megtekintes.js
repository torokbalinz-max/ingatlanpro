// ============================================================
//  Megtekintés-kérés, „hívom” jelzés, ajánlattételi engedély – API
//  (services/megtekintes.js)
//
//  Vevő / magánszemély:
//   GET    /api/megtekintes/hirdetes/:id        mit tehet a vevő ezen a hirdetésen
//   POST   /api/megtekintes                     kérés küldése (1–3 időpont)
//   GET    /api/megtekintes/sajat               a saját kérései
//   POST   /api/megtekintes/:id/lemond          lemondás
//   POST   /api/megtekintes/:id/javaslat        { elfogad: true|false } a javasolt időpontra
//   GET    /api/megtekintes/beerkezett          a magánhirdetésére érkezett kérések
//   POST   /api/megtekintes/:id/valasz          { mit: elfogad|javasol|elutasit, idopont, valasz }
//   GET    /api/megtekintes/:id/ics             naptárfájl (elfogadott)
//   POST   /api/ingatlanok/:id/hivas            „hívom” jelzés (telefonszámra koppintott)
//  Iroda (CRM):
//   GET    /api/crm/:ter/keresek                kérések + „hívom” jelzések
//   POST   /api/crm/:ter/keresek/:id/valasz
//   GET    /api/crm/:ter/gyors?q=               gyorskereső (telefonszám / IP-kód)
//   POST   /api/crm/:ter/hivasok/:id/felvesz    a jelzésből ügyfél
//   POST   /api/crm/:ter/hivasok/:id/rejt
//   POST   /api/crm/:ter/ugyfelek/:id/ajanlat-engedely  { ingatlan_id }
// ============================================================

const express = require("express");
const mk = require("../services/megtekintes");
const crm = require("../services/crm");
const { hiba } = require("../lib/http");

const router = express.Router();

function valasz(res, err) {
    if (err && err.kod) return res.status(err.status || 400).json({ error: err.kod });
    hiba(res, err);
}
const belepve = req => { if (!req.user) throw mk.hibaKod("login_required", 401); return req.user; };
const pvp = fn => async (req, res) => { try { res.json(await fn(req)); } catch (e) { valasz(res, e); } };
const vp = fn => async (req, res) => {
    try { res.json(await fn(await crm.kontextus(req, req.params.ter), req)); } catch (e) { valasz(res, e); }
};

router.get("/api/megtekintes/hirdetes/:id", pvp(req => mk.hirdetesAllapot(req.user, req.params.id)));
router.post("/api/megtekintes", pvp(req => mk.kerTesz(belepve(req), req.body || {})));
router.get("/api/megtekintes/sajat", pvp(req => mk.sajat(belepve(req))));
router.get("/api/megtekintes/beerkezett", pvp(req => mk.beerkezett(belepve(req))));
router.post("/api/megtekintes/:id/lemond", pvp(req => mk.vevoValt(belepve(req), req.params.id, "lemond")));
router.post("/api/megtekintes/:id/javaslat", pvp(req => mk.vevoValt(belepve(req), req.params.id, req.body && req.body.elfogad ? "javaslat_elfogad" : "javaslat_elutasit")));
router.post("/api/megtekintes/:id/valasz", pvp(req => mk.maganValasz(belepve(req), req.params.id, req.body || {})));
router.get("/api/megtekintes/:id/ics", async (req, res) => {
    try {
        const t = await mk.ics(belepve(req), req.params.id);
        res.set("Content-Type", "text/calendar; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="megtekintes-${Number(req.params.id) || 0}.ics"`);
        res.set("Cache-Control", "no-store");
        res.send(t);
    } catch (e) { valasz(res, e); }
});
router.post("/api/ingatlanok/:id/hivas", pvp(req => mk.hivasJelez(req.user, req.params.id)));

const B = "/api/crm/:ter";
router.get(`${B}/keresek`, vp((ctx, req) => mk.irodaLista(ctx, req.query)));
router.post(`${B}/keresek/:id/valasz`, vp((ctx, req) => mk.irodaValasz(ctx, req.params.id, req.body || {})));
router.get(`${B}/gyors`, vp((ctx, req) => mk.gyors(ctx, req.query.q)));
router.post(`${B}/hivasok/:id/felvesz`, vp((ctx, req) => mk.hivasFelvesz(ctx, req.params.id)));
router.post(`${B}/hivasok/:id/rejt`, vp((ctx, req) => mk.hivasRejt(ctx, req.params.id)));
router.post(`${B}/ugyfelek/:id/ajanlat-engedely`, vp((ctx, req) => mk.engedelyAd(ctx, req.params.id, (req.body || {}).ingatlan_id)));

module.exports = router;
