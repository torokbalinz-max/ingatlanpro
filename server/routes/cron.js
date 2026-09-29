// ============================================================
//  Időzített futtatás (pl. cron-job.org) – saját kulccsal, jelszó nélkül
// ============================================================

const express = require("express");
const importer = require("../services/importer");
const imagehash = require("../services/imagehash");
const notify = require("../services/notify");
const { safeEqual } = require("../middleware/auth");

const router = express.Router();

router.post("/api/cron/run", async (req, res) => {

    const kulcs = process.env.CRON_KEY;

    if (!kulcs || !safeEqual(req.query.key || "", kulcs)) {
        return res.status(403).json({ error: "forbidden" });
    }

    // Azonnal válaszolunk, a munka a háttérben fut
    res.json({ elindult: true });

    // 1) figyelt találati listák (új hirdetések), 2) meglévők elérhetősége,
    // 3) az új hirdetések képeinek ujjlenyomata (duplikátumokhoz),
    // 4) e-mail értesítők (mentett keresések, vevői igények) – naponta egyszer
    importer.figyeltFuttat()
        .then(() => importer.figyelesIndit({ limit: 150 }).promise)
        .then(() => { const j = imagehash.indit(300); return j && j.promise; })
        .then(() => napiErtesito(req))
        .then(() => require("./statistics").havontaMent())
        .catch(err => console.error("Cron hiba:", err));

});

// Az értesítők naponta legfeljebb egyszer mennek ki (a cron gyakrabban is futhat)
async function napiErtesito(req) {
    const autofix = require("../services/autofix");
    const utolso = await autofix.beallitas("ertesito_utolso");
    if (utolso && Date.now() - new Date(utolso).getTime() < 20 * 3600 * 1000) return;
    await autofix.beallitas("ertesito_utolso", new Date().toISOString());
    const e = await notify.napiOsszesito({ req });
    console.log(`Értesítők: ${e.keresesek} mentett keresés, ${e.igenyek} igény, ${e.levelek} levél.`);
}

module.exports = router;
