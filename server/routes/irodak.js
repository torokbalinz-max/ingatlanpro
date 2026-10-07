// ============================================================
//  Ingatlanirodák
//
//  Egy iroda (cég) a saját hirdetéseit egy helyen kezeli:
//   - tagok: kik léphetnek be és kezelhetik a hirdetéseket
//       vezeto: mindent (adatok, tagok, ügynökök, hirdetések)
//       tag:    a hirdetéseket (feladás, szerkesztés, rendszerezés)
//     A vezető meghívja a kollégát (e-mail cím alapján), aki a saját
//     fiókjában fogadja el – addig nem kezelhet semmit, és a neve, telefonja
//     sem jelenik meg az irodánál.
//   - ügynökök: a hirdetéseken megjelenő kapcsolattartók (nem kell
//     fiók hozzájuk; ha van, az érdeklődők üzenete nekik megy)
//   - hirdetések rendszerezése: saját hivatkozási szám, mappa / címke,
//     belső megjegyzés, ügynök, archiválás (nem látszik, de megmarad)
//
//  Ellenőrzés (a kitalált irodák ellen):
//   - irodát csak a cég adószámával (CUI) lehet regisztrálni; a szám
//     ellenőrző jegyét megnézzük, és az ANAF nyilvános adatbázisából
//     lekérjük a cég hivatalos nevét, címét, fő tevékenységét, és hogy
//     aktív-e (services/anaf.js). Nem létező / törölt cég nem regisztrálhat.
//   - az új iroda "jóváhagyásra vár": az admin az ANAF-adatok mellett
//     egy kattintással jóváhagyja vagy elutasítja (Admin → Ingatlanirodák)
//   - csak a jóváhagyott iroda látszik nyilvánosan: az irodák listájában
//     (#irodak), az adatlapján (#irodak/<id>) és a hirdetéseken
//   - ha a jóváhagyott iroda a nevét vagy az adószámát módosítja,
//     újra jóváhagyásra vár
// ============================================================

const express = require("express");
const db = require("../db/database");
const anaf = require("../services/anaf");
const mail = require("../services/mail");
const oldalAdatok = require("../services/oldalAdatok");
const { parseKepek } = require("../services/listing");
const { hiba, csakAdmin, csakBelepve } = require("../lib/http");
const { LISTA_MEZOK } = require("../lib/sql");

const router = express.Router();

const MAX_IRODA = 3;           // egy felhasználó legfeljebb ennyi irodát hozhat létre
const STATUSZOK = ["fuggo", "jovahagyva", "elutasitva", "felfuggesztve"];

const szoveg = (v, max) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s.slice(0, max) : null;
};

// Weboldal: csak http(s), és legyen benne pont (domain)
const weboldal = v => {
    const s = szoveg(v, 300);
    if (!s) return null;
    try {
        const u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s);
        if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
        return u.toString();
    } catch (e) {
        return null;
    }
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Az iroda oszlopai a logó (kép) nélkül
const IRODA_MEZOK = `i.id, i.nev, i.leiras, i.telefon, i.email, i.weboldal, i.cim, i.varos, i.ellenorzott, i.created_at, i.updated_at,
    i.cui, i.reg_com, i.hivatalos_nev, i.hivatalos_cim, i.caen, i.anaf_ido, i.dontes_ok, i.dontes_ido, i.statusz,
    (i.logo IS NOT NULL) AS van_logo`;

// A felhasználó szerepe az irodában: { tag, vezeto } – az admin mindent.
// Csak az elfogadott tagság számít (a meghívott még nem kezelhet semmit).
async function jog(req, irodaId) {

    if (req.szerep === "admin") return { tag: true, vezeto: true, admin: true };
    if (!req.user) return { tag: false, vezeto: false };

    const r = await db.query(
        "SELECT szerep FROM iroda_tagok WHERE iroda_id = $1 AND user_id = $2 AND COALESCE(statusz, 'aktiv') = 'aktiv'",
        [irodaId, req.user.id]
    );

    if (!r.rowCount) return { tag: false, vezeto: false };

    return { tag: true, vezeto: r.rows[0].szerep === "vezeto" };

}

// A felhasználó irodái (a /api/me is ezt adja vissza)
async function sajatIrodak(userId) {
    if (!userId) return [];
    const r = await db.query(`
        SELECT i.id, i.nev, t.szerep, i.statusz, (i.logo IS NOT NULL) AS van_logo
        FROM iroda_tagok t JOIN irodak i ON i.id = t.iroda_id
        WHERE t.user_id = $1 AND COALESCE(t.statusz, 'aktiv') = 'aktiv' ORDER BY i.nev`, [userId]);
    return r.rows;
}

// A felhasználó függő meghívásai (a /api/me is ezt adja vissza)
async function meghivasok(userId) {
    if (!userId) return [];
    const r = await db.query(`
        SELECT i.id, i.nev, t.szerep, i.statusz, i.varos, COALESCE(u.nev, u.felhasznalonev) AS meghivta_nev, t.created_at
        FROM iroda_tagok t JOIN irodak i ON i.id = t.iroda_id
        LEFT JOIN users u ON u.id = t.meghivta
        WHERE t.user_id = $1 AND t.statusz = 'meghivott' ORDER BY t.created_at DESC`, [userId]);
    return r.rows;
}

const irodaMezok = b => ({
    nev: szoveg(b.nev, 120),
    leiras: szoveg(b.leiras, 3000),
    telefon: szoveg(b.telefon, 40),
    email: szoveg(b.email, 160),
    weboldal: weboldal(b.weboldal),
    cim: szoveg(b.cim, 200),
    varos: szoveg(b.varos, 100),
    reg_com: szoveg(b.reg_com, 40)
});

function hibaKod(kod, extra = {}) {
    const e = new Error(kod);
    e.kod = kod;
    Object.assign(e, extra);
    return e;
}

// Az adószám ellenőrzése + ANAF-lekérdezés.
//  -> { cui, anaf: {...} | null, anafHiba: "..." | null }
//  Nem létező, inaktív vagy törölt cégnél hibát dob.
async function cuiEllenoriz(nyers, kihagyIrodaId) {

    const cui = anaf.cuiTisztit(nyers);
    if (!cui) throw hibaKod("missing_cui");
    if (!anaf.cuiErvenyes(cui)) throw hibaKod("cui_checksum");

    // Egy adószámmal csak egy iroda (az elutasítottak nem számítanak)
    const van = await db.query(
        "SELECT id FROM irodak WHERE cui = $1 AND statusz <> 'elutasitva' AND id <> COALESCE($2::int, 0)",
        [cui, kihagyIrodaId || null]
    );
    if (van.rowCount) throw hibaKod("cui_taken");

    let adat = null, anafHiba = null;

    try {
        const v = await anaf.lekerdez(cui);
        if (!v.talalt) throw hibaKod("cui_not_found");
        adat = v.adat;
        if (adat.torolve) throw hibaKod("cui_deleted");
        if (adat.inaktiv) throw hibaKod("cui_inactive");
    } catch (e) {
        if (e.kod) throw e;
        // Az ANAF nem érhető el: az iroda létrejöhet, az admin később újra lekérdezi
        anafHiba = e.message;
    }

    return { cui, anaf: adat, anafHiba };

}

// Levél az adminnak, ha új iroda vár jóváhagyásra (ha van e-mail beállítva)
async function adminErtesit(iroda, req) {
    try {
        if (!mail.elerheto()) return;
        const to = await oldalAdatok.adminEmail();
        if (!to) return;
        const { html, text } = mail.sablon({
            cim: `Új ingatlaniroda vár jóváhagyásra: ${iroda.nev}`,
            sorok: [
                `Adószám: ${iroda.cui || "–"}${iroda.hivatalos_nev ? ` (ANAF: ${iroda.hivatalos_nev})` : ""}`,
                iroda.anaf_hiba ? "Az ANAF nem volt elérhető – az admin felületen újra lekérdezheted." : "",
                "A jóváhagyás az admin felületen: Admin → Ingatlanirodák."
            ].filter(Boolean),
            gomb: "Megnyitás",
            link: `${mail.oldalCim(req)}/#admin`
        });
        await mail.kuld({ to, subject: `IngatlanPro – új iroda: ${iroda.nev}`, html, text });
    } catch (e) {
        console.error("Iroda értesítő:", e.message);
    }
}

// Levél az iroda vezetőinek a döntésről
async function dontesErtesit(irodaId, statusz, ok, req) {
    try {
        if (!mail.elerheto()) return;
        const r = await db.query(`
            SELECT i.nev, u.email, u.ertesites_email FROM irodak i
            JOIN iroda_tagok t ON t.iroda_id = i.id AND t.szerep = 'vezeto' AND COALESCE(t.statusz, 'aktiv') = 'aktiv'
            JOIN users u ON u.id = t.user_id
            WHERE i.id = $1 AND u.email IS NOT NULL`, [irodaId]);
        const cim = {
            jovahagyva: "Az irodádat jóváhagytuk",
            elutasitva: "Az irodád regisztrációját elutasítottuk",
            felfuggesztve: "Az irodádat felfüggesztettük"
        }[statusz];
        if (!cim) return;
        for (const u of r.rows) {
            const { html, text } = mail.sablon({
                cim: `${cim}: ${u.nev}`,
                sorok: [
                    statusz === "jovahagyva" ? "Az iroda mostantól megjelenik az Ingatlanirodák listájában, és a hirdetéseiteken is látszik az iroda neve és elérhetősége." : "",
                    ok ? `Indoklás: ${ok}` : "",
                    statusz !== "jovahagyva" ? "Kérdés esetén válaszolj erre a levélre, vagy írj nekünk az Impresszumban megadott címre." : ""
                ].filter(Boolean),
                gomb: "Az iroda megnyitása",
                link: `${mail.oldalCim(req)}/#iroda/${irodaId}`
            });
            await mail.kuld({ to: u.email, subject: `IngatlanPro – ${cim}`, html, text });
        }
    } catch (e) {
        console.error("Iroda döntés értesítő:", e.message);
    }
}

// Az iroda nyilvános mezői (a belső ANAF-nyersadat nélkül)
function nyilvanosIroda(ir) {
    const { anaf_adat, logo, logo_mime, created_by, anaf_hiba, ...x } = ir;
    return { ...x, van_logo: !!(logo || ir.van_logo) };
}

// ===================== IRODÁK LISTÁJA (nyilvános) =====================

// Csak a jóváhagyott irodák: név, város, elérhetőség, aktív hirdetések száma
// típusonként. Szűrés: varos, q (név), rendez: hirdetes | nev | uj
router.get("/api/irodak", async (req, res) => {

    try {

        const felt = ["i.statusz = 'jovahagyva'"];
        const p = [];

        if (req.query.varos) {
            p.push(String(req.query.varos));
            felt.push(`(i.varos = $${p.length} OR EXISTS (SELECT 1 FROM ingatlanok x WHERE x.iroda_id = i.id AND x.statusz = 'aktiv' AND x.varos = $${p.length}))`);
        }

        if (req.query.q) {
            p.push("%" + String(req.query.q).trim().slice(0, 60) + "%");
            felt.push(`(i.nev ILIKE $${p.length} OR i.hivatalos_nev ILIKE $${p.length})`);
        }

        const rend = { nev: "i.nev", uj: "COALESCE(i.dontes_ido, i.created_at) DESC" }[req.query.rendez] || "aktiv_db DESC, i.nev";

        const r = await db.query(`
            SELECT i.id, i.nev, i.varos, i.cim, i.telefon, i.email, i.weboldal, LEFT(i.leiras, 300) AS leiras,
                   i.cui, i.hivatalos_nev, i.created_at, i.dontes_ido, (i.logo IS NOT NULL) AS van_logo,
                   (SELECT COUNT(*)::int FROM ingatlanok x WHERE x.iroda_id = i.id AND x.statusz = 'aktiv') AS aktiv_db,
                   (SELECT COUNT(*)::int FROM iroda_ugynokok u WHERE u.iroda_id = i.id AND u.aktiv) AS ugynok_db,
                   (SELECT COALESCE(json_object_agg(t.tipus, t.n), '{}'::json) FROM (
                        SELECT COALESCE(x.tipus, 'lakas') AS tipus, COUNT(*)::int AS n FROM ingatlanok x
                        WHERE x.iroda_id = i.id AND x.statusz = 'aktiv' GROUP BY 1) t) AS tipusok,
                   (SELECT COALESCE(json_agg(DISTINCT x.varos), '[]'::json) FROM ingatlanok x
                        WHERE x.iroda_id = i.id AND x.statusz = 'aktiv' AND x.varos IS NOT NULL) AS varosok
            FROM irodak i
            WHERE ${felt.join(" AND ")}
            ORDER BY ${rend}
            LIMIT 300`, p);

        res.json(r.rows);

    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/irodak/sajat", csakBelepve, async (req, res) => {
    try {
        res.json(await sajatIrodak(req.user.id));
    } catch (err) {
        hiba(res, err);
    }
});

// A függő meghívásaim
router.get("/api/irodak/meghivasok", csakBelepve, async (req, res) => {
    try {
        res.json(await meghivasok(req.user.id));
    } catch (err) {
        hiba(res, err);
    }
});

// ===================== IRODA LÉTREHOZÁSA =====================

router.post("/api/irodak", csakBelepve, async (req, res) => {

    let client;

    try {

        const b = req.body || {};
        const d = irodaMezok(b);
        const admin = req.szerep === "admin";

        if (!d.nev || d.nev.length < 2) return res.status(400).json({ error: "missing_name" });
        if (b.weboldal && !d.weboldal) return res.status(400).json({ error: "bad_website" });
        if (d.email && !EMAIL_RE.test(d.email)) return res.status(400).json({ error: "bad_email" });

        const db_ = await db.query("SELECT COUNT(*)::int AS n FROM irodak WHERE created_by = $1 AND statusz <> 'elutasitva'", [req.user.id]);
        if (db_.rows[0].n >= MAX_IRODA && !admin) return res.status(400).json({ error: "too_many_agencies" });

        // Adószám: kötelező (az admin kivétel, pl. egy partnernek hoz létre irodát)
        let ell = { cui: null, anaf: null, anafHiba: null };
        if (b.cui || !admin) ell = await cuiEllenoriz(b.cui);

        const a = ell.anaf;
        const statusz = admin ? "jovahagyva" : "fuggo";

        client = await db.connect();
        await client.query("BEGIN");

        const r = await client.query(
            `INSERT INTO irodak (nev, leiras, telefon, email, weboldal, cim, varos, created_by,
                                 cui, reg_com, hivatalos_nev, hivatalos_cim, caen, anaf_adat, anaf_ido, anaf_hiba,
                                 statusz, ellenorzott, dontes_ido)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19) RETURNING *`,
            [d.nev, d.leiras, d.telefon, d.email, d.weboldal, d.cim || (a && a.cim) || null, d.varos, req.user.id,
             ell.cui, d.reg_com || (a && a.regCom) || null, a ? a.nev : null, a ? a.cim : null, a ? a.caen : null,
             a ? JSON.stringify(a) : null, a ? new Date().toISOString() : null, ell.anafHiba,
             statusz, statusz === "jovahagyva", statusz === "jovahagyva" ? new Date().toISOString() : null]
        );

        const iroda = r.rows[0];

        await client.query("INSERT INTO iroda_tagok (iroda_id, user_id, szerep, statusz) VALUES ($1, $2, 'vezeto', 'aktiv')", [iroda.id, req.user.id]);

        // A létrehozó rögtön ügynök is (a saját elérhetőségével)
        await client.query(
            "INSERT INTO iroda_ugynokok (iroda_id, nev, telefon, email, user_id) VALUES ($1, $2, $3, $4, $5)",
            [iroda.id, req.user.nev || req.user.felhasznalonev || d.nev, req.user.telefon || d.telefon, req.user.email || d.email, req.user.id]
        );

        await client.query("COMMIT");

        if (statusz === "fuggo") adminErtesit(iroda, req);

        res.json(nyilvanosIroda(iroda));

    } catch (err) {
        if (client) await client.query("ROLLBACK").catch(() => { });
        if (err.code === "23505") return res.status(400).json({ error: "cui_taken" });
        hiba(res, err);
    } finally {
        if (client) client.release();
    }

});

// ===================== ADATLAP =====================

// Nyilvános adatlap: az iroda, az ügynökei és az aktív hirdetései.
// A nem jóváhagyott irodát csak a tagjai és az admin látják.
router.get("/api/irodak/:id", async (req, res) => {

    try {

        const r = await db.query(`SELECT ${IRODA_MEZOK} FROM irodak i WHERE i.id = $1`, [req.params.id]);
        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const iroda = r.rows[0];
        const j = await jog(req, iroda.id);

        if (iroda.statusz !== "jovahagyva" && !j.tag) return res.status(404).json({ error: "not_found" });

        const ugynokok = await db.query(
            `SELECT a.id, a.nev, a.telefon, a.email, a.aktiv, a.user_id IS NOT NULL AS van_fiok ${j.tag ? ", a.user_id" : ""},
                    (SELECT COUNT(*)::int FROM ingatlanok x WHERE x.ugynok_id = a.id AND x.statusz = 'aktiv') AS aktiv_db
             FROM iroda_ugynokok a
             WHERE a.iroda_id = $1 ${j.tag ? "" : "AND a.aktiv"} ORDER BY a.nev`, [iroda.id]);

        const hirdetesek = await db.query(
            `SELECT ${LISTA_MEZOK} FROM ingatlanok i WHERE i.iroda_id = $1 AND i.statusz = 'aktiv' ORDER BY i.created_at DESC`,
            [iroda.id]);

        const ki = nyilvanosIroda(iroda);

        // A belső ellenőrzési adatok csak a tagoknak / az adminnak
        if (!j.tag) {
            delete ki.dontes_ok;
        }

        res.json({
            ...ki,
            ugynokok: ugynokok.rows,
            hirdetesek: hirdetesek.rows,
            jog: j
        });

    } catch (err) {
        hiba(res, err);
    }

});

// Logó (kép)
router.get("/api/irodak/:id/logo", async (req, res) => {
    try {
        const r = await db.query("SELECT logo, logo_mime, statusz FROM irodak WHERE id = $1", [req.params.id]);
        if (!r.rowCount || !r.rows[0].logo) return res.status(404).end();
        res.set("Content-Type", r.rows[0].logo_mime || "image/png");
        res.set("Cache-Control", "public, max-age=3600");
        res.send(r.rows[0].logo);
    } catch (err) {
        res.status(500).end();
    }
});

router.put("/api/irodak/:id/logo", csakBelepve, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!(await jog(req, id)).vezeto) return res.status(403).json({ error: "not_manager" });
        if (req.body.kep === null) {
            await db.query("UPDATE irodak SET logo = NULL, logo_mime = NULL, updated_at = NOW() WHERE id = $1", [id]);
            return res.json({ siker: true });
        }
        const [k] = parseKepek([req.body.kep]);
        if (!k || k.adat.length > 600 * 1024) return res.status(400).json({ error: "bad_image" });
        await db.query("UPDATE irodak SET logo = $1, logo_mime = $2, updated_at = NOW() WHERE id = $3", [k.adat, k.mime, id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }
});

// ===================== MÓDOSÍTÁS, TÖRLÉS =====================

router.put("/api/irodak/:id", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        const j = await jog(req, id);
        if (!j.vezeto) return res.status(403).json({ error: "not_manager" });

        const regi = (await db.query("SELECT * FROM irodak WHERE id = $1", [id])).rows[0];
        if (!regi) return res.status(404).json({ error: "not_found" });

        const b = req.body || {};
        const d = irodaMezok(b);
        if (!d.nev || d.nev.length < 2) return res.status(400).json({ error: "missing_name" });
        if (b.weboldal && !d.weboldal) return res.status(400).json({ error: "bad_website" });
        if (d.email && !EMAIL_RE.test(d.email)) return res.status(400).json({ error: "bad_email" });

        // Csak a beküldött mezők változnak
        Object.keys(d).forEach(k => { if (k !== "nev" && b[k] === undefined) delete d[k]; });

        // Új adószám: újra ellenőrizzük
        let anafMezok = {};
        const ujCui = b.cui !== undefined ? anaf.cuiTisztit(b.cui) : regi.cui;
        if (b.cui !== undefined && ujCui !== regi.cui) {
            if (!ujCui && !j.admin) return res.status(400).json({ error: "missing_cui" });
            if (ujCui) {
                const ell = await cuiEllenoriz(ujCui, id);
                const a = ell.anaf;
                anafMezok = {
                    cui: ell.cui, hivatalos_nev: a ? a.nev : null, hivatalos_cim: a ? a.cim : null, caen: a ? a.caen : null,
                    anaf_adat: a ? JSON.stringify(a) : null, anaf_ido: a ? new Date().toISOString() : null, anaf_hiba: ell.anafHiba
                };
            } else {
                anafMezok = { cui: null };
            }
        }

        // A jóváhagyott iroda neve / adószáma nem cserélhető ellenőrzés nélkül
        // (különben egy jóváhagyott iroda "átnevezhetné" magát egy másik cégre)
        let statusz = regi.statusz;
        const lenyeges = d.nev !== regi.nev || ("cui" in anafMezok);
        if (regi.statusz === "jovahagyva" && lenyeges && !j.admin) statusz = "fuggo";

        // Az elutasított iroda a javított adatokkal újra jóváhagyásra kerül
        if (regi.statusz === "elutasitva" && !j.admin) statusz = "fuggo";

        const mezok = { ...d, ...anafMezok, statusz, ellenorzott: statusz === "jovahagyva" };
        const kulcsok = Object.keys(mezok);

        const r = await db.query(
            `UPDATE irodak i SET ${kulcsok.map((k, n) => `${k} = $${n + 2}${k === "anaf_adat" ? "::jsonb" : ""}`).join(", ")}, updated_at = NOW()
             WHERE i.id = $1 RETURNING ${IRODA_MEZOK}`,
            [id, ...kulcsok.map(k => mezok[k])]
        );

        if (statusz === "fuggo" && regi.statusz !== "fuggo") adminErtesit(r.rows[0], req);

        res.json({ ...nyilvanosIroda(r.rows[0]), ujraJovahagyas: statusz !== regi.statusz });

    } catch (err) {
        if (err.code === "23505") return res.status(400).json({ error: "cui_taken" });
        hiba(res, err);
    }

});

// Régi végpont (az adatlap admin kapcsolója): jóváhagyás / visszavonás
router.put("/api/irodak/:id/ellenorzott", csakAdmin, async (req, res) => {
    try {
        const statusz = req.body.ellenorzott ? "jovahagyva" : "fuggo";
        await db.query("UPDATE irodak SET ellenorzott = $1, statusz = $2, dontes_ido = NOW() WHERE id = $3", [statusz === "jovahagyva", statusz, req.params.id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }
});

// Iroda törlése: a hirdetések megmaradnak (a feladójuknál), csak az iroda kerül le róluk
router.delete("/api/irodak/:id", csakBelepve, async (req, res) => {

    let client;

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).vezeto) return res.status(403).json({ error: "not_manager" });

        client = await db.connect();
        await client.query("BEGIN");
        await client.query("UPDATE ingatlanok SET iroda_id = NULL, ugynok_id = NULL, iroda_mappa = NULL, iroda_megjegyzes = NULL WHERE iroda_id = $1", [id]);
        await client.query("DELETE FROM irodak WHERE id = $1", [id]);
        await client.query("COMMIT");

        res.json({ siker: true });

    } catch (err) {
        if (client) await client.query("ROLLBACK").catch(() => { });
        hiba(res, err);
    } finally {
        if (client) client.release();
    }

});

// ===================== TAGOK, MEGHÍVÁS =====================

router.get("/api/irodak/:id/tagok", csakBelepve, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!(await jog(req, id)).tag) return res.status(403).json({ error: "not_member" });
        const r = await db.query(`
            SELECT u.id, COALESCE(u.nev, u.felhasznalonev) AS nev, u.email, t.szerep, COALESCE(t.statusz, 'aktiv') AS statusz, t.created_at
            FROM iroda_tagok t JOIN users u ON u.id = t.user_id WHERE t.iroda_id = $1
            ORDER BY (COALESCE(t.statusz, 'aktiv') = 'aktiv') DESC, t.szerep DESC, u.nev`, [id]);
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }
});

// Meghívás e-mail cím alapján (a kollégának előbb regisztrálnia kell).
// A meghívott a saját fiókjában fogadja el (Fiókom / Ingatlaniroda).
router.post("/api/irodak/:id/tagok", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).vezeto) return res.status(403).json({ error: "not_manager" });

        const email = String(req.body.email || "").trim().toLowerCase();
        const szerep = req.body.szerep === "vezeto" ? "vezeto" : "tag";

        if (!email) return res.status(400).json({ error: "user_not_found" });

        const u = await db.query("SELECT id, nev, telefon, email FROM users WHERE LOWER(email) = $1 OR LOWER(felhasznalonev) = $1", [email]);
        if (!u.rowCount) return res.status(404).json({ error: "user_not_found" });

        const user = u.rows[0];

        const van = await db.query("SELECT statusz FROM iroda_tagok WHERE iroda_id = $1 AND user_id = $2", [id, user.id]);

        if (van.rowCount && (van.rows[0].statusz || "aktiv") === "aktiv") {
            // Már tag: csak a szerepe változik
            await db.query("UPDATE iroda_tagok SET szerep = $3 WHERE iroda_id = $1 AND user_id = $2", [id, user.id, szerep]);
            return res.json({ siker: true, mar_tag: true });
        }

        await db.query(
            `INSERT INTO iroda_tagok (iroda_id, user_id, szerep, statusz, meghivta) VALUES ($1, $2, $3, 'meghivott', $4)
             ON CONFLICT (iroda_id, user_id) DO UPDATE SET szerep = EXCLUDED.szerep, statusz = 'meghivott', meghivta = EXCLUDED.meghivta, created_at = NOW()`,
            [id, user.id, szerep, req.user.id]
        );

        // Értesítő levél a meghívottnak (ha van e-mail beállítva)
        if (mail.elerheto() && user.email) {
            const ir = await db.query("SELECT nev FROM irodak WHERE id = $1", [id]);
            const { html, text } = mail.sablon({
                cim: `Meghívás az irodába: ${ir.rows[0] ? ir.rows[0].nev : ""}`,
                sorok: [
                    `${req.user.nev || req.user.felhasznalonev || "Egy kolléga"} meghívott, hogy kezeld az iroda hirdetéseit az IngatlanPro-n.`,
                    "A meghívást a fiókodban fogadhatod el (Ingatlaniroda menüpont). Ha nem ismered a meghívót, hagyd figyelmen kívül."
                ],
                gomb: "Meghívás megnyitása",
                link: `${mail.oldalCim(req)}/#iroda`
            });
            mail.kuld({ to: user.email, subject: "IngatlanPro – meghívás egy ingatlanirodába", html, text }).catch(() => { });
        }

        res.json({ siker: true, meghivva: true });

    } catch (err) {
        hiba(res, err);
    }

});

// A meghívott válasza: { elfogad: true | false }
router.post("/api/irodak/:id/meghivas", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);

        const t = await db.query("SELECT * FROM iroda_tagok WHERE iroda_id = $1 AND user_id = $2 AND statusz = 'meghivott'", [id, req.user.id]);
        if (!t.rowCount) return res.status(404).json({ error: "not_found" });

        if (!req.body.elfogad) {
            await db.query("DELETE FROM iroda_tagok WHERE iroda_id = $1 AND user_id = $2", [id, req.user.id]);
            return res.json({ siker: true, elutasitva: true });
        }

        await db.query("UPDATE iroda_tagok SET statusz = 'aktiv', created_at = NOW() WHERE iroda_id = $1 AND user_id = $2", [id, req.user.id]);

        // Ügynök-kártya a saját elérhetőségével (ha még nincs)
        const van = await db.query("SELECT 1 FROM iroda_ugynokok WHERE iroda_id = $1 AND user_id = $2", [id, req.user.id]);
        if (!van.rowCount) {
            await db.query(
                "INSERT INTO iroda_ugynokok (iroda_id, nev, telefon, email, user_id) VALUES ($1, $2, $3, $4, $5)",
                [id, req.user.nev || req.user.felhasznalonev || req.user.email, req.user.telefon || null, req.user.email || null, req.user.id]
            );
        }

        res.json({ siker: true, elfogadva: true });

    } catch (err) {
        hiba(res, err);
    }

});

router.delete("/api/irodak/:id/tagok/:userId", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        const userId = Number(req.params.userId);
        const j = await jog(req, id);

        // Kilépni magától bárki tud; mást csak a vezető vehet ki
        if (!j.vezeto && !(req.user && req.user.id === userId)) return res.status(403).json({ error: "not_manager" });

        const vezetok = await db.query("SELECT user_id FROM iroda_tagok WHERE iroda_id = $1 AND szerep = 'vezeto' AND COALESCE(statusz, 'aktiv') = 'aktiv'", [id]);
        if (vezetok.rows.length === 1 && vezetok.rows[0].user_id === userId) return res.status(400).json({ error: "last_manager" });

        await db.query("DELETE FROM iroda_tagok WHERE iroda_id = $1 AND user_id = $2", [id, userId]);
        await db.query("UPDATE iroda_ugynokok SET user_id = NULL WHERE iroda_id = $1 AND user_id = $2", [id, userId]);

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== ÜGYNÖKÖK =====================

router.post("/api/irodak/:id/ugynokok", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).vezeto) return res.status(403).json({ error: "not_manager" });

        const nev = szoveg(req.body.nev, 100);
        if (!nev) return res.status(400).json({ error: "missing_name" });

        const r = await db.query(
            "INSERT INTO iroda_ugynokok (iroda_id, nev, telefon, email) VALUES ($1, $2, $3, $4) RETURNING *",
            [id, nev, szoveg(req.body.telefon, 40), szoveg(req.body.email, 160)]
        );

        res.json(r.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

router.put("/api/irodak/:id/ugynokok/:uid", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        const j = await jog(req, id);

        const u = await db.query("SELECT * FROM iroda_ugynokok WHERE id = $1 AND iroda_id = $2", [req.params.uid, id]);
        if (!u.rowCount) return res.status(404).json({ error: "not_found" });

        // A saját ügynök-kártyáját bárki szerkesztheti, a többit a vezető
        const sajat = req.user && u.rows[0].user_id === req.user.id;
        if (!j.vezeto && !(j.tag && sajat)) return res.status(403).json({ error: "not_manager" });

        const nev = szoveg(req.body.nev, 100) || u.rows[0].nev;

        const r = await db.query(
            "UPDATE iroda_ugynokok SET nev = $1, telefon = $2, email = $3, aktiv = $4 WHERE id = $5 RETURNING *",
            [nev, szoveg(req.body.telefon, 40), szoveg(req.body.email, 160), req.body.aktiv !== false, u.rows[0].id]
        );

        res.json(r.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

router.delete("/api/irodak/:id/ugynokok/:uid", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).vezeto) return res.status(403).json({ error: "not_manager" });

        await db.query("UPDATE ingatlanok SET ugynok_id = NULL WHERE iroda_id = $1 AND ugynok_id = $2", [id, req.params.uid]);
        await db.query("DELETE FROM iroda_ugynokok WHERE id = $1 AND iroda_id = $2", [req.params.uid, id]);

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== HIRDETÉSEK KEZELÉSE =====================

// Az iroda összes hirdetése (archivált, jóváhagyásra váró is) a belső adatokkal
router.get("/api/irodak/:id/hirdetesek", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).tag) return res.status(403).json({ error: "not_member" });

        const r = await db.query(`
            SELECT ${LISTA_MEZOK}, i.iroda_mappa, i.iroda_megjegyzes,
                   (SELECT COUNT(*)::int FROM favorites f WHERE f.property_id = i.id) AS kedvenc_db,
                   (SELECT COUNT(*)::int FROM uzenetek m WHERE m.ingatlan_id = i.id) AS uzenet_db
            FROM ingatlanok i WHERE i.iroda_id = $1 ORDER BY i.id DESC`, [id]);

        res.json(r.rows);

    } catch (err) {
        hiba(res, err);
    }

});

// Tömeges műveletek a kijelölt hirdetéseken
//  muvelet: ugynok | mappa | archival | aktival | eladva | nem_eladva | torles
router.patch("/api/irodak/:id/hirdetesek", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).tag) return res.status(403).json({ error: "not_member" });

        const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
        if (!ids.length) return res.status(400).json({ error: "no_selection" });

        const ertek = req.body.ertek;
        const hol = "WHERE iroda_id = $1 AND id = ANY($2::int[])";
        let r;

        switch (req.body.muvelet) {

            case "ugynok": {
                const uid = ertek ? Number(ertek) : null;
                if (uid) {
                    const van = await db.query("SELECT 1 FROM iroda_ugynokok WHERE id = $1 AND iroda_id = $2", [uid, id]);
                    if (!van.rowCount) return res.status(400).json({ error: "bad_agent" });
                }
                r = await db.query(`UPDATE ingatlanok SET ugynok_id = $3, updated_at = NOW() ${hol}`, [id, ids, uid]);
                break;
            }

            case "mappa":
                r = await db.query(`UPDATE ingatlanok SET iroda_mappa = $3, updated_at = NOW() ${hol}`, [id, ids, szoveg(ertek, 60)]);
                break;

            // Archiválás: nem látszik az oldalon, de megmarad (később újra aktiválható)
            case "archival":
                r = await db.query(`UPDATE ingatlanok SET statusz = 'archiv', updated_at = NOW() ${hol} AND statusz = 'aktiv'`, [id, ids]);
                break;

            case "aktival":
                r = await db.query(`UPDATE ingatlanok SET statusz = 'aktiv', updated_at = NOW() ${hol} AND statusz = 'archiv'`, [id, ids]);
                break;

            case "eladva":
                r = await db.query(`UPDATE ingatlanok SET eladva = true, updated_at = NOW() ${hol}`, [id, ids]);
                break;

            case "nem_eladva":
                r = await db.query(`UPDATE ingatlanok SET eladva = false, updated_at = NOW() ${hol}`, [id, ids]);
                break;

            case "torles":
                await db.query(`DELETE FROM favorites WHERE property_id IN (SELECT id FROM ingatlanok ${hol})`, [id, ids]);
                r = await db.query(`DELETE FROM ingatlanok ${hol}`, [id, ids]);
                break;

            default:
                return res.status(400).json({ error: "bad_action" });

        }

        res.json({ siker: true, db: r.rowCount });

    } catch (err) {
        hiba(res, err);
    }

});

// Egy hirdetés belső adatai (hivatkozási szám, mappa, megjegyzés, ügynök)
router.put("/api/irodak/:id/hirdetesek/:hid", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).tag) return res.status(403).json({ error: "not_member" });

        const b = req.body || {};
        const uid = b.ugynok_id ? Number(b.ugynok_id) : null;

        if (uid) {
            const van = await db.query("SELECT 1 FROM iroda_ugynokok WHERE id = $1 AND iroda_id = $2", [uid, id]);
            if (!van.rowCount) return res.status(400).json({ error: "bad_agent" });
        }

        const r = await db.query(`
            UPDATE ingatlanok SET iroda_ref = $3, iroda_mappa = $4, iroda_megjegyzes = $5, ugynok_id = $6, updated_at = NOW()
            WHERE iroda_id = $1 AND id = $2`,
            [id, req.params.hid, szoveg(b.iroda_ref, 40), szoveg(b.iroda_mappa, 60), szoveg(b.iroda_megjegyzes, 2000), uid]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// A saját (magánszemélyként feladott) hirdetéseim átvitele az irodához
router.post("/api/irodak/:id/atvetel", csakBelepve, async (req, res) => {

    try {

        const id = Number(req.params.id);
        if (!(await jog(req, id)).tag) return res.status(403).json({ error: "not_member" });

        const ug = await db.query("SELECT id FROM iroda_ugynokok WHERE iroda_id = $1 AND user_id = $2 LIMIT 1", [id, req.user.id]);

        const r = await db.query(
            "UPDATE ingatlanok SET iroda_id = $1, ugynok_id = COALESCE(ugynok_id, $3) WHERE owner_id = $2 AND iroda_id IS NULL",
            [id, req.user.id, ug.rows[0] ? ug.rows[0].id : null]
        );

        res.json({ siker: true, db: r.rowCount });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== ADMIN: JÓVÁHAGYÁS =====================

// Minden iroda az ellenőrzési adatokkal (ANAF), a létrehozóval és a számokkal
router.get("/api/admin/irodak", csakAdmin, async (req, res) => {

    try {

        const r = await db.query(`
            SELECT i.id, i.nev, i.varos, i.cim, i.telefon, i.email, i.weboldal, LEFT(i.leiras, 400) AS leiras,
                   i.cui, i.reg_com, i.hivatalos_nev, i.hivatalos_cim, i.caen, i.anaf_adat, i.anaf_ido, i.anaf_hiba,
                   i.statusz, i.dontes_ok, i.dontes_ido, i.created_at, i.updated_at, (i.logo IS NOT NULL) AS van_logo,
                   COALESCE(u.nev, u.felhasznalonev) AS letrehozo_nev, u.email AS letrehozo_email, u.created_at AS letrehozo_reg,
                   (SELECT COUNT(*)::int FROM ingatlanok x WHERE x.iroda_id = i.id AND x.statusz = 'aktiv') AS aktiv_db,
                   (SELECT COUNT(*)::int FROM ingatlanok x WHERE x.iroda_id = i.id) AS osszes_db,
                   (SELECT COUNT(*)::int FROM iroda_tagok t WHERE t.iroda_id = i.id AND COALESCE(t.statusz, 'aktiv') = 'aktiv') AS tag_db,
                   (SELECT COUNT(*)::int FROM iroda_ugynokok a WHERE a.iroda_id = i.id) AS ugynok_db
            FROM irodak i LEFT JOIN users u ON u.id = i.created_by
            ORDER BY (i.statusz = 'fuggo') DESC, i.created_at DESC`);

        res.json(r.rows);

    } catch (err) {
        hiba(res, err);
    }

});

// Döntés: { statusz: jovahagyva | elutasitva | felfuggesztve | fuggo, ok }
router.post("/api/admin/irodak/:id/dontes", csakAdmin, async (req, res) => {

    try {

        const statusz = String(req.body.statusz || "");
        if (!STATUSZOK.includes(statusz)) return res.status(400).json({ error: "bad_request" });

        const ok = szoveg(req.body.ok, 1000);
        if ((statusz === "elutasitva" || statusz === "felfuggesztve") && !ok) return res.status(400).json({ error: "reason_required" });

        const r = await db.query(
            `UPDATE irodak SET statusz = $1, ellenorzott = $2, dontes_ok = $3, dontes_ido = NOW(), updated_at = NOW()
             WHERE id = $4 RETURNING id`,
            [statusz, statusz === "jovahagyva", ok, req.params.id]
        );

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        dontesErtesit(Number(req.params.id), statusz, ok, req);

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// Az ANAF-adatok újra lekérése (ha korábban nem volt elérhető)
router.post("/api/admin/irodak/:id/anaf", csakAdmin, async (req, res) => {

    try {

        const r = await db.query("SELECT id, cui FROM irodak WHERE id = $1", [req.params.id]);
        if (!r.rowCount) return res.status(404).json({ error: "not_found" });
        if (!r.rows[0].cui) return res.status(400).json({ error: "missing_cui" });

        let v;
        try {
            v = await anaf.lekerdez(r.rows[0].cui);
        } catch (e) {
            await db.query("UPDATE irodak SET anaf_hiba = $1 WHERE id = $2", [e.message, r.rows[0].id]);
            return res.status(502).json({ error: "anaf_unavailable", message: e.message });
        }

        const a = v.talalt ? v.adat : null;

        await db.query(
            `UPDATE irodak SET hivatalos_nev = $1, hivatalos_cim = $2, caen = $3, anaf_adat = $4::jsonb, anaf_ido = NOW(),
                    anaf_hiba = $5, reg_com = COALESCE(reg_com, $6) WHERE id = $7`,
            [a ? a.nev : null, a ? a.cim : null, a ? a.caen : null, JSON.stringify(a || { talalt: false }),
             v.talalt ? null : "ANAF: nincs ilyen adószámú cég", a ? a.regCom : null, r.rows[0].id]
        );

        res.json({ siker: true, ...v });

    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
module.exports.jog = jog;
module.exports.sajatIrodak = sajatIrodak;
module.exports.meghivasok = meghivasok;
