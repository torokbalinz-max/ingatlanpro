// ============================================================
//  Tesztkörnyezet – API (services/teszt.js)
//
//   GET    /api/admin/teszt              állapot: fiókok, jelszó, darabszámok (admin)
//   POST   /api/admin/teszt              a tesztkörnyezet létrehozása (admin)
//   DELETE /api/admin/teszt              minden tesztadat törlése (admin)
//   GET    /api/teszt/fiokok             a fiókok listája a váltó sávhoz (admin / belépett admin)
//   POST   /api/teszt/belep/:id          belépés egy tesztfiókba (admin / belépett admin)
//   POST   /api/teszt/vissza             vissza az admin fiókba
// ============================================================

const express = require("express");
const teszt = require("../services/teszt");
const { hiba, csakAdmin } = require("../lib/http");

const router = express.Router();

const valasz = (res, err) => {
    if (err && err.kod && err.status) return res.status(err.status).json({ error: err.kod });
    hiba(res, err);
};

// A „valódi” admin (a felhasználói nézetben is)
const valodiAdmin = (req, res, next) => (req.valodiSzerep === "admin" ? next() : csakAdmin(req, res, next));

router.get("/api/admin/teszt", valodiAdmin, async (req, res) => {
    try { res.json(await teszt.allapot()); } catch (e) { valasz(res, e); }
});

router.post("/api/admin/teszt", valodiAdmin, async (req, res) => {
    try { res.json(await teszt.letrehoz()); } catch (e) { valasz(res, e); }
});

router.delete("/api/admin/teszt", valodiAdmin, async (req, res) => {
    try { res.json(await teszt.torol()); } catch (e) { valasz(res, e); }
});

router.get("/api/teszt/fiokok", async (req, res) => {
    try {
        if (!(await teszt.adminE(req))) return res.status(403).json({ error: "admin_only" });
        res.json({ fiokok: await teszt.fiokLista() });
    } catch (e) { valasz(res, e); }
});

router.post("/api/teszt/belep/:id", async (req, res) => {
    try { res.json(await teszt.belep(req, res, req.params.id)); } catch (e) { valasz(res, e); }
});

router.post("/api/teszt/vissza", async (req, res) => {
    try { res.json(await teszt.vissza(req, res)); } catch (e) { valasz(res, e); }
});

module.exports = router;
