// ============================================================
//  Időzített futtatás (pl. cron-job.org) – saját kulccsal, jelszó nélkül
// ============================================================

const express = require("express");
const importer = require("../services/importer");
const { safeEqual } = require("../middleware/auth");

const router = express.Router();

router.post("/api/cron/run", async (req, res) => {

    const kulcs = process.env.CRON_KEY;

    if (!kulcs || !safeEqual(req.query.key || "", kulcs)) {
        return res.status(403).json({ error: "forbidden" });
    }

    // Azonnal válaszolunk, a munka a háttérben fut
    res.json({ elindult: true });

    // 1) figyelt találati listák (új hirdetések), 2) meglévők elérhetősége
    importer.figyeltFuttat()
        .then(() => importer.figyelesIndit({ limit: 150 }).promise)
        .catch(err => console.error("Cron hiba:", err));

});

module.exports = router;
