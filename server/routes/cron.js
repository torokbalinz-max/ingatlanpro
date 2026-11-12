// ============================================================
//  Időzített futtatás (pl. cron-job.org) – saját kulccsal, jelszó nélkül
// ============================================================

const express = require("express");
const importer = require("../services/importer");
const imagehash = require("../services/imagehash");
const { safeEqual } = require("../middleware/auth");

const router = express.Router();

router.post("/api/cron/run", async (req, res) => {

    const kulcs = process.env.CRON_KEY;

    if (!kulcs || !safeEqual(req.query.key || "", kulcs)) {
        return res.status(403).json({ error: "forbidden" });
    }

    // Azonnal válaszolunk, a munka a háttérben fut
    res.json({ elindult: true });

    // 1) minden város forrásai (OLX, Storia közvetlenül, majd az Imoradar24 / saját linkek:
    //    új hirdetések, frissítés, a levettek le), 2) meglévők elérhetősége,
    // 3) az új hirdetések képeinek ujjlenyomata (duplikátumokhoz),
    // 4) értesítések (mentett keresések, vevői igények, kedvencek ára) – a
    //    felhasználó beállítása szerint azonnal / naponta / hetente (services/ertesitesek.js)
    // A városok forrásai (OLX, Storia közvetlenül, utána az Imoradar24 és a saját linkek) –
    // Admin → Város → Források; a régi figyelt oldalak ezek közé kerültek
    require("../services/forrasLista").futtat({ mind: true }).promise
        .then(() => importer.figyelesIndit({ limit: 150 }).promise)
        .then(() => { const j = imagehash.indit(400); return j && j.promise; })
        .then(() => require("../services/duplicates").autoOsszevon().catch(e => console.error("Duplikátumok:", e.message)))
        // ha egy ingatlan több oldalon is fent van: a fő link az admin sorrendje szerint
        .then(() => require("../services/forrasSorrend").alkalmaz().catch(e => console.error("Forrás-sorrend:", e.message)))
        .then(() => require("../services/ertesitesek").futtat({ req }))
        .then(() => require("./statistics").havontaMent())
        .then(() => require("../services/megbizasAuto").futtat())
        .then(() => require("../services/efacturaSpv").futtat())
        .catch(err => console.error("Cron hiba:", err));

});

module.exports = router;
