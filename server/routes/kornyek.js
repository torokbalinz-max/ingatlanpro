// ============================================================
//  Admin → Város és környéke
//  A falvakban lévő hirdetések rendezése a "<város> és környéke"
//  városba (services/kornyek.js)
// ============================================================

const express = require("express");
const kornyek = require("../services/kornyek");
const { hiba, csakAdmin } = require("../lib/http");

const router = express.Router();

const idLista = v => (Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 2000);

// A város (anyaváros) a kérésből – ha a környék-város jött, az anyavárosa
async function anyavaros(nev) {
    const n = String(nev || "").trim();
    if (!n) return null;
    return (await kornyek.anyaVarosa(n)) || n;
}

router.get("/api/admin/kornyek", csakAdmin, async (req, res) => {

    try {

        await kornyek.osszekapcsol();

        const lista = await kornyek.varosLista(true);
        const varosok = lista.filter(v => !v.anyavaros).map(v => ({
            nev: v.nev,
            kornyek: (lista.find(k => k.anyavaros === v.nev) || {}).nev || null
        }));

        // Alapból az első város, amelyiknek van környéke
        const kert = await anyavaros(req.query.varos);
        const base = kert && varosok.some(v => v.nev === kert) ? kert : ((varosok.find(v => v.kornyek) || varosok[0] || {}).nev || null);

        if (!base) return res.json({ varosok, adat: null });

        res.json({ varosok, adat: await kornyek.attekintes(base) });

    } catch (err) {
        hiba(res, err);
    }

});

// Automatikus rendezés most (a rossz települések javítása + a biztos esetek áthelyezése)
router.post("/api/admin/kornyek/futtat", csakAdmin, async (req, res) => {
    try {
        const base = await anyavaros(req.body.varos);
        const e = await kornyek.rendez({ varos: base || undefined });
        delete e.reszletek;
        res.json({ siker: true, ...e });
    } catch (err) {
        hiba(res, err);
    }
});

// Kézi áthelyezés: cel = "kornyek" (a faluba) | "varos" (vissza a városba)
router.post("/api/admin/kornyek/athelyez", csakAdmin, async (req, res) => {
    try {
        const base = await anyavaros(req.body.varos);
        const ids = idLista(req.body.ids);
        const cel = req.body.cel === "varos" ? "varos" : "kornyek";
        if (!base || !ids.length) return res.status(400).json({ error: "bad_request" });
        res.json({ siker: true, ...(await kornyek.athelyez(ids, base, cel, req.body.telepules)) });
    } catch (err) {
        hiba(res, err);
    }
});

// "Marad a városban": a javaslat többé nem jelenik meg
router.post("/api/admin/kornyek/marad", csakAdmin, async (req, res) => {
    try {
        const ids = idLista(req.body.ids);
        if (!ids.length) return res.status(400).json({ error: "bad_request" });
        res.json({ siker: true, ...(await kornyek.marad(ids)) });
    } catch (err) {
        hiba(res, err);
    }
});

// A település (falu) beállítása több hirdetésre
router.post("/api/admin/kornyek/telepules", csakAdmin, async (req, res) => {
    try {
        const ids = idLista(req.body.ids);
        if (!ids.length) return res.status(400).json({ error: "bad_request" });
        res.json({ siker: true, ...(await kornyek.telepulesBeallit(ids, req.body.telepules)) });
    } catch (err) {
        hiba(res, err);
    }
});

module.exports = router;
