// ============================================================
//  Jogi funkciók
//
//   POST /api/jogi/aszf              a bejelentkezett felhasználó elfogadja
//                                    az ÁSZF / Adatvédelmi tájékoztató aktuális verzióját
//   GET  /api/jogi/adataim           GDPR 15. és 20. cikk: minden saját adat
//                                    letöltése egy JSON fájlban
//   POST /api/jogi/suti              süti-hozzájárulás naplózása (GDPR 7. cikk (1))
//   POST /api/jogi/bejelentes        jogellenes tartalom bejelentése (EU DSA 16. cikk)
//                                    – belépés nélkül is
//   GET  /api/jogi/bejelentesek      admin: a bejelentések listája
//   PUT  /api/jogi/bejelentesek/:id  admin: döntés + indoklás (DSA 16. (5) és 17. cikk)
// ============================================================

const express = require("express");
const crypto = require("crypto");
const db = require("../db/database");
const acc = require("../services/accounts");
const mail = require("../services/mail");
const { ASZF_VERZIO } = require("../lib/jogi");
const { hiba, csakAdmin, csakBelepve } = require("../lib/http");

const router = express.Router();

const ip = req => req.ip || (req.socket && req.socket.remoteAddress) || "?";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// A bejelentés okai (a weboldal ugyanezeket a kulcsokat használja)
const OKOK = ["csalas", "jogsertes_kep", "szemelyes_adat", "tiltott", "hamis", "diszkriminacio", "egyeb"];

// Döntések: uj -> folyamatban -> eltavolitva (eltávolítva / korlátozva) | elutasitva
const STATUSZOK = ["uj", "folyamatban", "eltavolitva", "elutasitva"];

// ===================== ÁSZF ELFOGADÁSA =====================

router.post("/api/jogi/aszf", csakBelepve, async (req, res) => {

    try {

        if (req.body.elfogad !== true) return res.status(400).json({ error: "terms_required" });

        await db.query(
            "UPDATE users SET aszf_elfogadva = NOW(), aszf_verzio = $1 WHERE id = $2",
            [ASZF_VERZIO, req.user.id]
        );

        acc.cacheUrit();

        res.json({ siker: true, verzio: ASZF_VERZIO });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== SAJÁT ADATOK LETÖLTÉSE =====================

router.get("/api/jogi/adataim", csakBelepve, async (req, res) => {

    try {

        const id = req.user.id;
        const q = async (sql, p = [id]) => (await db.query(sql, p).catch(() => ({ rows: [] }))).rows;

        const u = (await q("SELECT * FROM users WHERE id = $1"))[0] || {};

        // A jelszó hash-e és a belső azonosítók nem személyes adat a felhasználó számára
        delete u.jelszo_hash;

        const adatok = {
            leiras: "IngatlanPro – a fiókodhoz tartozó összes adat (GDPR 15. és 20. cikk). / All data linked to your IngatlanPro account.",
            letoltve: new Date().toISOString(),
            fiok: u,
            hirdetesek: await q(`
                SELECT id, link, cim, leiras, tipus, ugylet, ar, nm, szobak, emelet, allapot, telek_nm,
                       varos, kerulet, telepules, x, y, statusz, iroda_id, created_at, updated_at
                FROM ingatlanok WHERE owner_id = $1 ORDER BY id`),
            feltoltott_kepek_szama: (await q(`
                SELECT COUNT(*)::int AS n FROM ingatlan_kepek k JOIN ingatlanok i ON i.id = k.ingatlan_id
                WHERE i.owner_id = $1`))[0],
            kedvencek: await q("SELECT property_id AS ingatlan_id, created_at FROM favorites WHERE user_id = $1 ORDER BY created_at"),
            mentett_keresesek: await q("SELECT id, nev, szurok, ertesites, created_at FROM mentett_keresesek WHERE user_id = $1 ORDER BY id"),
            keresesi_igenyek: await q("SELECT * FROM igenyek WHERE user_id = $1 ORDER BY id"),
            kuldott_uzenetek: await q("SELECT id, cimzett_id, igeny_id, ingatlan_id, ajanlott_ingatlan_id, szoveg, created_at FROM uzenetek WHERE felado_id = $1 ORDER BY id"),
            kapott_uzenetek: await q("SELECT id, felado_id, igeny_id, ingatlan_id, ajanlott_ingatlan_id, szoveg, olvasva, created_at FROM uzenetek WHERE cimzett_id = $1 ORDER BY id"),
            irodai_tagsagok: await q("SELECT * FROM iroda_tagok WHERE user_id = $1"),
            ugynoki_adatok: await q("SELECT * FROM iroda_ugynokok WHERE user_id = $1"),
            bejelentesek: await q("SELECT id, ingatlan_id, url, ok, leiras, statusz, dontes_indok, created_at FROM bejelentesek WHERE user_id = $1 ORDER BY id")
        };

        res.setHeader("Content-Disposition", `attachment; filename="ingatlanpro-adataim-${new Date().toISOString().slice(0, 10)}.json"`);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.send(JSON.stringify(adatok, null, 2));

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== SÜTI-HOZZÁJÁRULÁS NAPLÓ =====================

router.post("/api/jogi/suti", async (req, res) => {

    try {

        if (acc.korlat("suti:" + ip(req), 30, 60 * 60 * 1000)) return res.status(429).json({ error: "too_many" });

        const b = req.body || {};
        const azonosito = /^[\w-]{8,64}$/.test(String(b.azonosito || "")) ? b.azonosito : crypto.randomUUID();

        // Csak a kategóriák igen/nem értéke
        const valasztas = {};
        Object.keys(b.valasztas || {}).slice(0, 10).forEach(k => {
            if (/^\w{1,30}$/.test(k)) valasztas[k] = !!b.valasztas[k];
        });

        await db.query(
            "INSERT INTO suti_hozzajarulasok (azonosito, valasztas, verzio) VALUES ($1, $2, $3)",
            [azonosito, JSON.stringify(valasztas), String(b.verzio || "").slice(0, 20) || null]
        );

        // 3 évnél régebbi bejegyzések törlése (időnként)
        if (Math.random() < 0.02) {
            db.query("DELETE FROM suti_hozzajarulasok WHERE created_at < NOW() - INTERVAL '3 years'").catch(() => { });
            // A lezárt bejelentések 2 év után törlődnek (lásd Adatvédelmi tájékoztató)
            db.query("DELETE FROM bejelentesek WHERE statusz IN ('eltavolitva', 'elutasitva') AND dontes_ido < NOW() - INTERVAL '2 years'").catch(() => { });
        }

        res.json({ siker: true, azonosito });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== TARTALOM BEJELENTÉSE (DSA 16. cikk) =====================

router.post("/api/jogi/bejelentes", async (req, res) => {

    try {

        if (acc.korlat("bejelentes:" + ip(req), 10, 60 * 60 * 1000)) return res.status(429).json({ error: "too_many" });

        const b = req.body || {};

        const ok = String(b.ok || "");
        const leiras = String(b.leiras || "").trim().slice(0, 5000);
        const url = String(b.url || "").trim().slice(0, 1000) || null;
        let ingatlanId = Number(b.ingatlan_id) || null;
        const nev = String(b.nev || (req.user && req.user.nev) || "").trim().slice(0, 120) || null;
        const email = String(b.email || (req.user && req.user.email) || "").trim().toLowerCase().slice(0, 200) || null;

        if (!OKOK.includes(ok)) return res.status(400).json({ error: "bad_reason" });
        if (leiras.length < 10) return res.status(400).json({ error: "missing" });
        if (!ingatlanId && !url) return res.status(400).json({ error: "missing" });
        if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: "bad_email" });
        // DSA 16. cikk (2) d): jóhiszeműségi nyilatkozat
        if (b.johiszem !== true) return res.status(400).json({ error: "good_faith_required" });

        // Az URL-ből kiolvassuk a hirdetés számát (…/#listing/123)
        if (!ingatlanId && url) {
            const m = url.match(/#listing\/(\d+)/);
            if (m) ingatlanId = Number(m[1]);
        }

        if (ingatlanId) {
            const van = await db.query("SELECT 1 FROM ingatlanok WHERE id = $1", [ingatlanId]);
            if (!van.rowCount) ingatlanId = null;
        }

        const r = await db.query(
            `INSERT INTO bejelentesek (ingatlan_id, url, ok, leiras, nev, email, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
            [ingatlanId, url, ok, leiras, nev, email, req.user ? req.user.id : null]
        );

        const szam = r.rows[0].id;
        const oldal = mail.oldalCim(req);

        // Visszaigazolás a bejelentőnek (DSA 16. cikk (4))
        if (email) {
            const { html, text } = mail.sablon({
                cim: `Bejelentés fogadva / Sesizare primită / Report received (#${szam})`,
                sorok: [
                    "Köszönjük, megkaptuk a bejelentésedet. Megvizsgáljuk, és a döntésről e-mailben értesítünk.",
                    "Vă mulțumim, am primit sesizarea. O vom analiza și vă vom anunța decizia prin e-mail.",
                    "Thank you, we have received your report. We will review it and notify you of our decision by e-mail.",
                    `#${szam} – ${ingatlanId ? `${oldal}/#listing/${ingatlanId}` : url}`
                ],
                lablec: "IngatlanPro – tartalom-bejelentés (EU 2022/2065 rendelet, 16. cikk)."
            });
            mail.kuld({ to: email, subject: `IngatlanPro – bejelentés #${szam}`, html, text }).catch(() => { });
        }

        // Értesítés az adminnak
        const adminok = String(process.env.ADMIN_EMAILS || "").split(",").map(x => x.trim()).filter(Boolean);
        if (adminok.length) {
            const { html, text } = mail.sablon({
                cim: `Új tartalom-bejelentés #${szam}`,
                sorok: [
                    `Ok: ${ok}`,
                    `Hirdetés: ${ingatlanId ? `${oldal}/#listing/${ingatlanId}` : url}`,
                    `Bejelentő: ${nev || "-"} <${email || "-"}>`,
                    leiras
                ],
                gomb: "Bejelentések kezelése",
                link: `${oldal}/#jogi/bejelentesek`,
                lablec: "Az EU DSA szerint a bejelentést időben, gondosan és tárgyilagosan kell elbírálni."
            });
            adminok.forEach(to => mail.kuld({ to, subject: `IngatlanPro – új bejelentés #${szam}`, html, text }).catch(() => { }));
        }

        res.json({ siker: true, szam, email: !!email && mail.elerheto() });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== ADMIN: BEJELENTÉSEK =====================

router.get("/api/jogi/bejelentesek", csakAdmin, async (req, res) => {

    try {

        const r = await db.query(`
            SELECT b.*, i.cim AS ingatlan_cim, i.statusz AS ingatlan_statusz, i.owner_id,
                   (SELECT u.email FROM users u WHERE u.id = i.owner_id) AS hirdeto_email
            FROM bejelentesek b
            LEFT JOIN ingatlanok i ON i.id = b.ingatlan_id
            ORDER BY (b.statusz IN ('uj', 'folyamatban')) DESC, b.created_at DESC
            LIMIT 300`);

        res.json(r.rows);

    } catch (err) {
        hiba(res, err);
    }

});

router.put("/api/jogi/bejelentesek/:id", csakAdmin, async (req, res) => {

    try {

        const statusz = String(req.body.statusz || "");
        const indok = String(req.body.indok || "").trim().slice(0, 5000);
        const elrejt = req.body.elrejt === true;

        if (!STATUSZOK.includes(statusz)) return res.status(400).json({ error: "bad_status" });
        if (["eltavolitva", "elutasitva"].includes(statusz) && indok.length < 5) {
            return res.status(400).json({ error: "reason_required" });
        }

        const r = await db.query(
            `UPDATE bejelentesek SET statusz = $1, dontes_indok = $2,
                    dontes_ido = CASE WHEN $1 IN ('eltavolitva', 'elutasitva') THEN NOW() ELSE dontes_ido END
             WHERE id = $3 RETURNING *`,
            [statusz, indok || null, req.params.id]
        );

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const b = r.rows[0];
        const oldal = mail.oldalCim(req);
        let hirdetoErtesitve = false;

        // A hirdetés elrejtése (nem törlés: a hirdető kérheti a felülvizsgálatot)
        if (statusz === "eltavolitva" && elrejt && b.ingatlan_id) {

            await db.query("UPDATE ingatlanok SET statusz = 'tiltott', updated_at = NOW() WHERE id = $1", [b.ingatlan_id]);

            // Indokolás a hirdetőnek (DSA 17. cikk)
            const h = await db.query(`
                SELECT u.email, u.nev, i.cim FROM ingatlanok i JOIN users u ON u.id = i.owner_id
                WHERE i.id = $1`, [b.ingatlan_id]);

            if (h.rowCount && h.rows[0].email) {
                const { html, text } = mail.sablon({
                    cim: "A hirdetésedet eltávolítottuk / Anunțul tău a fost eliminat / Your listing was removed",
                    sorok: [
                        `Hirdetés / Anunț / Listing: #${b.ingatlan_id} ${h.rows[0].cim || ""}`,
                        `Intézkedés: a hirdetés nem jelenik meg az oldalon. / Măsura: anunțul nu mai este afișat. / Action: the listing is no longer shown.`,
                        `Indoklás / Motivare / Reason:\n${indok}`,
                        "A döntés egy bejelentés alapján, emberi felülvizsgálattal született. / Decizie luată în urma unei sesizări, cu verificare umană. / Decision taken following a notice, with human review.",
                        "Ha nem értesz egyet, válaszolj erre a levélre, vagy írj a Kapcsolat oldalon megadott címre – újra megvizsgáljuk. Bírósághoz is fordulhatsz. / Dacă nu ești de acord, răspunde la acest e-mail – vom reanaliza. Te poți adresa și instanței. / If you disagree, reply to this e-mail and we will review it again. You may also go to court."
                    ],
                    gomb: "Feltételek / Termeni / Terms",
                    link: `${oldal}/#jogi/aszf`,
                    lablec: "IngatlanPro – indokolás az EU 2022/2065 rendelet (DSA) 17. cikke szerint."
                });
                hirdetoErtesitve = await mail.kuld({ to: h.rows[0].email, subject: "IngatlanPro – hirdetés eltávolítva", html, text });
            }

        }

        // Döntés a bejelentőnek (DSA 16. cikk (5))
        let bejelentoErtesitve = false;

        if (["eltavolitva", "elutasitva"].includes(statusz) && b.email) {
            const { html, text } = mail.sablon({
                cim: `Döntés a bejelentésedről / Decizie / Decision (#${b.id})`,
                sorok: [
                    statusz === "eltavolitva"
                        ? "A bejelentett tartalmat eltávolítottuk vagy korlátoztuk. / Conținutul a fost eliminat sau restricționat. / The reported content was removed or restricted."
                        : "A bejelentett tartalmat megvizsgáltuk, de nem találtunk okot az eltávolításra. / Nu am găsit motive de eliminare. / We found no grounds for removal.",
                    `Indoklás / Motivare / Reason:\n${indok}`,
                    "Ha nem értesz egyet, válaszolj erre a levélre. / Dacă nu ești de acord, răspunde la acest e-mail. / If you disagree, reply to this e-mail."
                ],
                lablec: "IngatlanPro – EU 2022/2065 rendelet (DSA) 16. cikk (5)."
            });
            bejelentoErtesitve = await mail.kuld({ to: b.email, subject: `IngatlanPro – döntés (#${b.id})`, html, text });
        }

        res.json({ siker: true, bejelentes: b, hirdetoErtesitve, bejelentoErtesitve });

    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
