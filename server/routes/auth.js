// ============================================================
//  Fiók: regisztráció, belépés, kilépés, profil, jelszó
// ============================================================

const express = require("express");
const db = require("../db/database");
const acc = require("../services/accounts");
const mail = require("../services/mail");
const { nyilvanosMod } = require("../middleware/auth");
const { hiba, csakBelepve } = require("../lib/http");
const { ASZF_VERZIO } = require("../lib/jogi");

const router = express.Router();

// Mit tud a belépő ablak (Google gomb, meghívókód, e-mail)
router.get("/api/config", (req, res) => {
    res.json({
        nyilvanos: nyilvanosMod(),
        googleClientId: process.env.GOOGLE_CLIENT_ID || null,
        meghivoKell: !!process.env.MEGHIVO_KOD,
        regisztracio: !/^(0|false|nem|no)$/i.test(String(process.env.REGISZTRACIO || "")),
        email: mail.elerheto(),
        fejleszto: acc.fejlesztoiMod(),
        // A jogi oldalakhoz: mely külső szolgáltatások vannak bekapcsolva
        jogi: {
            mail: process.env.BREVO_API_KEY ? "brevo" : (process.env.RESEND_API_KEY ? "resend" : null),
            google: !!process.env.GOOGLE_CLIENT_ID,
            ai: !!process.env.ANTHROPIC_API_KEY
        },
        // Hibakereséshez: ha induláskor egy táblát nem sikerült létrehozni
        dbHibak: (db.schemaHibak || []).map(h => h.slice(0, 200))
    });
});

router.get("/api/me", async (req, res) => {

    try {

        let olvasatlan = 0;
        let irodak = [];

        if (req.user) {
            const r = await db.query("SELECT COUNT(*)::int AS n FROM uzenetek WHERE cimzett_id = $1 AND NOT olvasva", [req.user.id]);
            olvasatlan = r.rows[0].n;
            irodak = await require("./irodak").sajatIrodak(req.user.id).catch(() => []);
        }

        res.json({
            bejelentkezve: !!req.user,
            user: acc.nyilvanos(req.user),
            szerep: req.szerep,
            // Az admin éppen a felhasználói nézetet próbálja
            adminNezet: req.valodiSzerep === "admin" && req.szerep !== "admin",
            felhasznalo: req.felhasznalo,
            nyilvanos: nyilvanosMod(),
            olvasatlan,
            irodak,
            // Az ÁSZF (új változatát) még nem fogadta el -> a weboldal megkérdezi
            aszfKell: !!(req.user && req.valodiSzerep !== "admin" && req.user.aszf_verzio !== ASZF_VERZIO)
        });

    } catch (err) {
        hiba(res, err);
    }

});

const ip = req => req.ip || req.socket.remoteAddress || "?";

router.post("/api/auth/register", async (req, res) => {

    try {

        if (/^(0|false|nem|no)$/i.test(String(process.env.REGISZTRACIO || ""))) {
            return res.status(403).json({ error: "registration_closed" });
        }

        if (acc.korlat("reg:" + ip(req), 8, 60 * 60 * 1000)) return res.status(429).json({ error: "too_many" });

        if (process.env.MEGHIVO_KOD && !acc.safeEqual(String(req.body.meghivo || "").trim(), process.env.MEGHIVO_KOD)) {
            return res.status(400).json({ error: "bad_invite" });
        }

        const u = await acc.regisztral({ ...(req.body || {}), aszf: req.body && req.body.aszf === true });

        await acc.munkamenetNyit(res, u, req);

        res.json({ siker: true, user: acc.nyilvanos(u) });

    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/auth/login", async (req, res) => {

    try {

        // Csak a hibás próbálkozások számítanak (15 percen belül 10)
        if (acc.tulSok("login:" + ip(req), 10)) return res.status(429).json({ error: "too_many" });

        const u = await acc.belep(req.body.email || req.body.azonosito, req.body.jelszo || "");

        if (!u) {
            acc.jegyez("login:" + ip(req));
            return res.status(400).json({ error: "bad_login" });
        }

        await acc.munkamenetNyit(res, u, req);

        res.json({ siker: true, user: acc.nyilvanos(u) });

    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/auth/google", async (req, res) => {

    try {
        const u = await acc.googleBelep(String(req.body.credential || ""));
        await acc.munkamenetNyit(res, u, req);
        res.json({ siker: true, user: acc.nyilvanos(u) });
    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/auth/logout", async (req, res) => {
    try {
        await acc.munkamenetZar(req, res);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }
});

// Profil módosítása
router.put("/api/auth/profil", csakBelepve, async (req, res) => {

    try {

        const nev = String(req.body.nev ?? req.user.nev ?? "").trim().slice(0, 80) || req.user.nev;
        const telefon = req.body.telefon !== undefined ? (String(req.body.telefon).trim().slice(0, 40) || null) : req.user.telefon;
        const ertesites = req.body.ertesites_email !== undefined ? !!req.body.ertesites_email : req.user.ertesites_email !== false;

        let email = req.user.email;

        if (req.body.email !== undefined && String(req.body.email).trim().toLowerCase() !== String(email || "").toLowerCase()) {
            email = String(req.body.email).trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: "bad_email" });
            const van = await acc.userByEmail(email);
            if (van && van.id !== req.user.id) return res.status(400).json({ error: "email_taken" });
        }

        const r = await db.query(
            "UPDATE users SET nev = $1, telefon = $2, ertesites_email = $3, email = $4 WHERE id = $5 RETURNING *",
            [nev, telefon, ertesites, email, req.user.id]
        );

        acc.cacheUrit();   // a bejelentkezett adatok frissítése

        res.json({ siker: true, user: acc.nyilvanos(r.rows[0]) });

    } catch (err) {
        hiba(res, err);
    }

});

// Jelszó módosítása (Google-fióknál első jelszó beállítása is)
router.post("/api/auth/jelszo", csakBelepve, async (req, res) => {

    try {

        const u = await acc.userById(req.user.id);

        if (u.jelszo_hash && !acc.jelszoJo(req.body.regi || "", u.jelszo_hash)) {
            return res.status(400).json({ error: "bad_password" });
        }

        if (String(req.body.uj || "").length < 8) return res.status(400).json({ error: "weak_password" });

        await db.query("UPDATE users SET jelszo_hash = $1 WHERE id = $2", [acc.hashJelszo(req.body.uj), u.id]);

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// Elfelejtett jelszó: e-mailben egy link (mindig "rendben" a válasz,
// hogy ne lehessen kipróbálni, kinek van fiókja)
router.post("/api/auth/elfelejtett", async (req, res) => {

    try {

        if (!mail.elerheto()) return res.status(400).json({ error: "email_off" });

        if (acc.korlat("forgot:" + ip(req), 5, 60 * 60 * 1000)) return res.status(429).json({ error: "too_many" });

        const u = await acc.userByEmail(req.body.email);

        if (u && !u.tiltva) {

            const token = await acc.visszaallitoToken(u.id);
            const link = `${mail.oldalCim(req)}/#reset/${token}`;

            const { html, text } = mail.sablon({
                cim: "Új jelszó beállítása",
                sorok: [
                    `Szia ${u.nev || ""}!`,
                    "Valaki (remélhetőleg te) új jelszót kért az IngatlanPro fiókodhoz. A link 1 óráig érvényes.",
                    "Ha nem te voltál, nyugodtan hagyd figyelmen kívül ezt a levelet."
                ],
                gomb: "Új jelszó beállítása",
                link
            });

            await mail.kuld({ to: u.email, subject: "IngatlanPro – új jelszó", html, text });

        }

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/auth/uj-jelszo", async (req, res) => {

    try {
        const u = await acc.jelszoVisszaallit(String(req.body.token || ""), req.body.jelszo);
        await acc.munkamenetNyit(res, u, req);
        res.json({ siker: true, user: acc.nyilvanos(u) });
    } catch (err) {
        hiba(res, err);
    }

});

// Fiók törlése (a saját hirdetései, keresései, igényei, üzenetei is törlődnek)
router.delete("/api/auth/fiok", csakBelepve, async (req, res) => {

    const client = await db.connect();

    try {

        const u = await acc.userById(req.user.id);

        if (u.szerep === "admin") return res.status(400).json({ error: "admin_cannot_delete" });

        if (u.jelszo_hash && !acc.jelszoJo(req.body.jelszo || "", u.jelszo_hash)) {
            return res.status(400).json({ error: "bad_password" });
        }

        await client.query("BEGIN");
        await client.query("DELETE FROM favorites WHERE user_id = $1", [u.id]);
        // Az iroda hirdetései az irodánál maradnak (egy másik tag lesz a feladójuk)
        await client.query(`
            UPDATE ingatlanok i SET owner_id = (
                SELECT t.user_id FROM iroda_tagok t WHERE t.iroda_id = i.iroda_id AND t.user_id <> $1
                ORDER BY (t.szerep = 'vezeto') DESC LIMIT 1)
            WHERE i.owner_id = $1 AND i.iroda_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM iroda_tagok t WHERE t.iroda_id = i.iroda_id AND t.user_id <> $1)`, [u.id]);
        await client.query("DELETE FROM favorites WHERE property_id IN (SELECT id FROM ingatlanok WHERE owner_id = $1)", [u.id]);
        await client.query("DELETE FROM ingatlanok WHERE owner_id = $1", [u.id]);
        await client.query("DELETE FROM users WHERE id = $1", [u.id]);
        await client.query("COMMIT");

        await acc.munkamenetZar(req, res);

        res.json({ siker: true });

    } catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        hiba(res, err);
    } finally {
        client.release();
    }

});

module.exports = router;
