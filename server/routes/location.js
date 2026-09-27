// ============================================================
//  Helykeresés a térképes űrlapokhoz (hirdetésfeladás, ellenőrzés)
// ============================================================

const express = require("express");
const location = require("../services/location");
const { hiba, csakBelepve } = require("../lib/http");

const router = express.Router();

// A város közepe és mérete (a térkép ide ugrik városváltáskor)
router.get("/api/hely/varos", async (req, res) => {
    try {
        const v = await location.varosAdat(String(req.query.varos || ""));
        res.json(v ? { x: v.x, y: v.y, sugar_km: v.sugar_km, nev_ro: v.nev_ro, megye: v.megye } : null);
    } catch (err) {
        hiba(res, err);
    }
});

// Keresőmező: utca, környék vagy falu a város körül
router.get("/api/hely/kereses", csakBelepve, async (req, res) => {
    try {
        const q = String(req.query.q || "").trim().slice(0, 120);
        if (q.length < 3) return res.json([]);
        const lista = await location.szabadKeres(String(req.query.varos || ""), q);
        res.json(lista.map(t => ({ x: t.x, y: t.y, nev: t.nev, szint: t.szint, telepules: t.telepules })));
    } catch (err) {
        hiba(res, err);
    }
});

// Hely a hirdetés szövegéből (cím, leírás, település, kerület)
router.post("/api/hely/szovegbol", csakBelepve, async (req, res) => {
    try {
        const b = req.body || {};
        const d = {
            varos: String(b.varos || ""),
            tipus: b.tipus || "lakas",
            telepules: b.telepules || null,
            kerulet: b.kerulet || null,
            forras_kerulet: b.forras_kerulet || null
        };
        const szoveg = [b.cim, b.leiras].filter(Boolean).join("\n");
        const h = await location.helyKeres(d, szoveg, { utca: b.utca || null });
        res.json(h || null);
    } catch (err) {
        hiba(res, err);
    }
});

// Messze van-e a pont a várostól / a falutól (figyelmeztetés az űrlapon)
router.post("/api/hely/ellenoriz", async (req, res) => {
    try {
        const b = req.body || {};
        const t = await location.helyTavol({
            varos: b.varos, x: Number(b.x), y: Number(b.y), tipus: b.tipus || "lakas", telepules: b.telepules || null
        });
        res.json({ tavol: t || false });
    } catch (err) {
        hiba(res, err);
    }
});

module.exports = router;
