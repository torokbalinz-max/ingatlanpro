// ============================================================
//  Tesztkörnyezet (Admin → Beállítások → Tesztelés)
//
//  Egy gombnyomással 15 tesztfiók (iroda vezetők, ügynökök, magán eladó,
//  vevők, munkatárs…) két tesztirodával, hirdetésekkel és CRM-adatokkal.
//  Az admin bármelyikbe „belép” (e-mail és regisztráció nélkül), és egy
//  sávból vált a fiókok között, vagy vissza az adminba.
//
//  Elszigetelés:
//   - users.teszt / irodak.teszt / ingatlanok.teszt jelzők. A teszthirdetéseket
//     és -irodákat csak az admin és a tesztfiókok látják (a nyilvános listákból
//     kimaradnak). Amit egy tesztfiók hoz létre (hirdetés, iroda), azt egy
//     adatbázis-trigger automatikusan tesztnek jelöli.
//   - Az e-mail címek @teszt.invalid végűek – a levelező ezekre nem küld.
//   - Tesztfiókkal nem lehet rendelni / fizetni (nem keletkezik valódi számla).
//   - A tesztirodák csomag nélkül is aktívak.
//   - „Tesztadatok törlése”: minden teszt-hirdetés, -iroda és -fiók törlődik
//     (a kapcsolódó adatok a külső kulcsokkal együtt).
// ============================================================

const crypto = require("crypto");
const db = require("../db/database");
const acc = require("./accounts");
const { ASZF_VERZIO } = require("../lib/jogi");

const DOMAIN = "teszt.invalid";
const VISSZA_SUTI = "ipteszt_admin";
const JELSZO_KULCS = "teszt_jelszo";

// A 15 fiók: kulcs, név, szerep-leírás (a sávon és az admin listán), mit próbáljon ki
const FIOKOK = [
    { k: "vezeto_a", nev: "Alfa Vezető", csop: "iroda", leiras: "tdRole_vezeto_a" },
    { k: "ugynok_a1", nev: "Alfa Ügynök Anna", csop: "iroda", leiras: "tdRole_ugynok_a1" },
    { k: "ugynok_a2", nev: "Alfa Ügynök Balázs", csop: "iroda", leiras: "tdRole_ugynok_a2" },
    { k: "vezeto_b", nev: "Béta Vezető", csop: "iroda", leiras: "tdRole_vezeto_b" },
    { k: "ugynok_b1", nev: "Béta Ügynök Csilla", csop: "iroda", leiras: "tdRole_ugynok_b1" },
    { k: "iroda_uj", nev: "Új Iroda Jelentkező", csop: "iroda", leiras: "tdRole_iroda_uj" },
    { k: "magan", nev: "Magán Eladó Dénes", csop: "elado", leiras: "tdRole_magan" },
    { k: "megbizo", nev: "Megbízó Eladó Erika", csop: "elado", leiras: "tdRole_megbizo" },
    { k: "vevo1", nev: "Vevő Ferenc", csop: "vevo", leiras: "tdRole_vevo1" },
    { k: "vevo2", nev: "Vevő Gizella", csop: "vevo", leiras: "tdRole_vevo2" },
    { k: "vevo3", nev: "Vevő Henrik", csop: "vevo", leiras: "tdRole_vevo3" },
    { k: "vevo4", nev: "Vevő Ilona", csop: "vevo", leiras: "tdRole_vevo4" },
    { k: "vevo5", nev: "Vevő János", csop: "vevo", leiras: "tdRole_vevo5" },
    { k: "vevo6", nev: "Vevő Katalin", csop: "vevo", leiras: "tdRole_vevo6" },
    { k: "munkatars", nev: "Munkatárs Lili", csop: "csapat", leiras: "tdRole_munkatars" }
];

function hibaKod(kod, status = 400) {
    const e = new Error(kod);
    e.kod = kod;
    e.status = status;
    return e;
}

// ---------- Jogok ----------

// Látja-e a teszt-adatokat (admin, vagy maga is tesztfiók)
function lat(req) {
    return !!(req && (req.valodiSzerep === "admin" || (req.user && req.user.teszt)));
}

// Az admin (vagy egy tesztfiókba belépett admin) kezelheti-e a teszt-fiókokat
async function adminE(req) {
    if (req.valodiSzerep === "admin") return true;
    if (!(req.user && req.user.teszt)) return false;
    if (acc.fejlesztoiKeres(req)) return true;
    const t = acc.sutiOlvas(req)[VISSZA_SUTI];
    if (!t) return false;
    const u = await acc.munkamenetUser(t).catch(() => null);
    return !!(u && u.szerep === "admin");
}

// ---------- Állapot ----------

async function jelszo() {
    const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = $1", [JELSZO_KULCS]);
    return r.rows[0] ? r.rows[0].ertek : null;
}

async function fiokLista() {
    const r = await db.query(`
        SELECT u.id, u.nev, u.email, u.felhasznalonev, u.teszt_kulcs,
               (SELECT json_agg(json_build_object('id', i.id, 'nev', i.nev, 'szerep', t.szerep))
                  FROM iroda_tagok t JOIN irodak i ON i.id = t.iroda_id WHERE t.user_id = u.id) AS irodak
        FROM users u WHERE u.teszt ORDER BY u.id`);
    return r.rows.map(u => {
        const f = FIOKOK.find(x => x.k === u.teszt_kulcs) || {};
        return { ...u, csop: f.csop || "egyeb", leiras: f.leiras || null, irodak: u.irodak || [] };
    });
}

async function allapot() {
    const fiokok = await fiokLista();
    const n = async sql => (await db.query(sql)).rows[0].n;
    return {
        van: fiokok.length > 0,
        fiokok,
        jelszo: fiokok.length ? await jelszo() : null,
        db: {
            irodak: await n("SELECT COUNT(*)::int AS n FROM irodak WHERE teszt"),
            hirdetesek: await n("SELECT COUNT(*)::int AS n FROM ingatlanok WHERE teszt AND statusz <> 'torolve'"),
            crm: await n("SELECT COUNT(*)::int AS n FROM crm_ugyfelek c JOIN irodak i ON i.id = c.iroda_id WHERE i.teszt")
        }
    };
}

// ---------- Létrehozás ----------

async function letrehoz() {

    const mar = await db.query("SELECT COUNT(*)::int AS n FROM users WHERE teszt");
    if (mar.rows[0].n) throw hibaKod("test_exists", 409);

    const jsz = crypto.randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 8) + "7";
    const hash = acc.hashJelszo(jsz);

    // A város: amelyikben a legtöbb aktív hirdetés van (különben az első)
    const v = (await db.query(`
        SELECT v.nev, v.x, v.y FROM varosok v
        ORDER BY (SELECT COUNT(*) FROM ingatlanok i WHERE i.varos = v.nev AND i.statusz = 'aktiv') DESC, v.nev LIMIT 1`)).rows[0]
        || { nev: "Sepsiszentgyorgy", x: 25.787, y: 45.866 };

    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query("INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (kulcs) DO UPDATE SET ertek = $2, updated_at = NOW()", [JELSZO_KULCS, jsz]);

        const U = {};
        for (let n = 0; n < FIOKOK.length; n++) {
            const f = FIOKOK[n];
            const sz = String(n + 1).padStart(2, "0");
            const r = await client.query(`
                INSERT INTO users (email, nev, felhasznalonev, jelszo_hash, telefon, szerep, teszt, teszt_kulcs,
                                   ertesites_email, aszf_elfogadva, aszf_verzio, nyelv)
                VALUES ($1, $2, $3, $4, $5, 'user', true, $6, false, NOW(), $7, 'hu') RETURNING id`,
                [`teszt${sz}@${DOMAIN}`, f.nev, `teszt${sz}`, hash, `07400000${sz}`, f.k, ASZF_VERZIO]);
            U[f.k] = r.rows[0].id;
        }

        // Két jóváhagyott tesztiroda
        const iroda = async (nev, vezeto, betu) => (await client.query(`
            INSERT INTO irodak (nev, leiras, telefon, email, varos, cim, ellenorzott, statusz, created_by, teszt, hivatalos_nev)
            VALUES ($1, $2, $3, $4, $5, $6, true, 'jovahagyva', $7, true, $8) RETURNING id`,
            [nev, "Tesztiroda – csak próbához.", "07400001" + betu, `iroda-${betu}@${DOMAIN}`, v.nev, "Str. Teszt " + betu, vezeto, nev + " SRL"])).rows[0].id;
        const A = await iroda("Alfa Ingatlan (teszt)", U.vezeto_a, "10");
        const B = await iroda("Béta Ingatlan (teszt)", U.vezeto_b, "20");

        const tag = (ir, u, szerep) => client.query("INSERT INTO iroda_tagok (iroda_id, user_id, szerep) VALUES ($1, $2, $3)", [ir, u, szerep]);
        await tag(A, U.vezeto_a, "vezeto"); await tag(A, U.ugynok_a1, "tag"); await tag(A, U.ugynok_a2, "tag");
        await tag(B, U.vezeto_b, "vezeto"); await tag(B, U.ugynok_b1, "tag");

        const ugynok = async (ir, u, nev, tel) => (await client.query(
            "INSERT INTO iroda_ugynokok (iroda_id, nev, telefon, email, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            [ir, nev, tel, null, u])).rows[0].id;
        const gA0 = await ugynok(A, U.vezeto_a, "Alfa Vezető", "0740000001");
        const gA1 = await ugynok(A, U.ugynok_a1, "Alfa Ügynök Anna", "0740000002");
        const gA2 = await ugynok(A, U.ugynok_a2, "Alfa Ügynök Balázs", "0740000003");
        const gB1 = await ugynok(B, U.ugynok_b1, "Béta Ügynök Csilla", "0740000005");
        // Fiók nélküli ügynök (csak kapcsolattartó) – a hirdetésére jövő ügyfél a vezetőhöz kerül
        const gB0 = await ugynok(B, null, "Béta Külsős Dávid", "0740000099");

        // Hirdetések (a város közepe körül)
        const H = {};
        const hird = async (kulcs, d) => {
            const dx = (Math.random() - 0.5) * 0.03, dy = (Math.random() - 0.5) * 0.02;
            const r = await client.query(`
                INSERT INTO ingatlanok (cim, leiras, ar, nm, arnm, szobak, emelet, tipus, ugylet, varos, x, y, statusz, forras_tipus,
                                        ellenorzott, hely_pontossag, owner_id, iroda_id, ugynok_id, teszt, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'aktiv', 'kezi', true, 'pontos', $13, $14, $15, true, NOW(), NOW())
                RETURNING id`,
                [d.cim, "Teszthirdetés – nem valódi ingatlan.", d.ar, d.nm, Math.round(d.ar / d.nm), d.szobak || null, d.emelet || null,
                 d.tipus || "lakas", d.ugylet || "elado", v.nev, (Number(v.x) || 25.787) + dx, (Number(v.y) || 45.866) + dy,
                 d.owner || null, d.iroda || null, d.ugynok || null]);
            H[kulcs] = r.rows[0].id;
        };
        await hird("a1", { cim: "TESZT – 2 szobás lakás, Központ", ar: 72000, nm: 54, szobak: 2, emelet: "3", owner: U.ugynok_a1, iroda: A, ugynok: gA1 });
        await hird("a2", { cim: "TESZT – 3 szobás lakás erkéllyel", ar: 98000, nm: 76, szobak: 3, emelet: "1", owner: U.ugynok_a1, iroda: A, ugynok: gA1 });
        await hird("a3", { cim: "TESZT – Családi ház kerttel", ar: 165000, nm: 140, szobak: 5, tipus: "haz", owner: U.ugynok_a2, iroda: A, ugynok: gA2 });
        await hird("a4", { cim: "TESZT – Garzon kiadó", ar: 300, nm: 32, szobak: 1, ugylet: "kiado", owner: U.vezeto_a, iroda: A, ugynok: gA0 });
        await hird("b1", { cim: "TESZT – Építési telek", ar: 45000, nm: 800, tipus: "telek", owner: U.ugynok_b1, iroda: B, ugynok: gB1 });
        await hird("b2", { cim: "TESZT – 2 szobás felújított lakás", ar: 69000, nm: 50, szobak: 2, emelet: "4", owner: U.vezeto_b, iroda: B, ugynok: gB0 });
        await hird("m1", { cim: "TESZT – Magán: 3 szobás lakás", ar: 89000, nm: 68, szobak: 3, emelet: "2", owner: U.magan });

        // CRM (Alfa): ügyfelek ügynökönként, egy gazdátlan, megtekintés, feladat
        const ugyfel = async (ir, felelos, nev, szerepek, allapotKod, forras, letreh) => (await client.query(`
            INSERT INTO crm_ugyfelek (iroda_id, felelos_id, nev, telefon, email, szerepek, allapot, forras, created_by, hozzajarulas)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, NOW()) RETURNING id`,
            [ir, felelos, nev, "07411" + String(Math.floor(Math.random() * 1e5)).padStart(5, "0"), null, JSON.stringify(szerepek), allapotKod, forras, letreh])).rows[0].id;
        const c1 = await ugyfel(A, U.ugynok_a1, "Kiss Márta (tulaj, teszt)", ["elado"], "aktiv", "ajanlas", U.ugynok_a1);
        const c2 = await ugyfel(A, U.ugynok_a1, "Nagy Péter (teszt)", ["vevo"], "aktiv", "telefon", U.ugynok_a1);
        const c3 = await ugyfel(A, U.ugynok_a2, "Szabó Ildikó (teszt)", ["vevo"], "kapcsolat", "weboldal", U.ugynok_a2);
        await ugyfel(A, null, "Kovács Gábor – gazdátlan (teszt)", ["vevo"], "uj", "telefon", U.vezeto_a);
        await ugyfel(B, U.ugynok_b1, "Béta ügyfél Teréz (teszt)", ["vevo"], "kapcsolat", "telefon", U.ugynok_b1);

        await client.query("INSERT INTO crm_ugyfel_ingatlan (ugyfel_id, ingatlan_id, szerep, allapot) VALUES ($1, $2, 'tulajdonos', 'uj'), ($3, $2, 'erdeklodik', 'megtekintes'), ($4, $5, 'erdeklodik', 'uj')",
            [c1, H.a1, c2, c3, H.a3]);
        await client.query(`INSERT INTO crm_megtekintesek (iroda_id, ugyfel_id, ingatlan_id, felelos_id, kezdet, hossz_perc, hely, created_by)
            VALUES ($1, $2, $3, $4, date_trunc('hour', NOW() AT TIME ZONE 'Europe/Bucharest') + INTERVAL '1 day 2 hours', 30, 'A helyszínen', $4)`,
            [A, c2, H.a1, U.ugynok_a1]);
        await client.query(`INSERT INTO crm_feladatok (iroda_id, ugyfel_id, felelos_id, cim, hatarido, created_by)
            VALUES ($1, $2, $3, 'Visszahívni: hitelkeret?', (NOW() AT TIME ZONE 'Europe/Bucharest') + INTERVAL '4 hours', $4),
                   ($1, $5, $6, 'Iratok bekérése a tulajtól', (NOW() AT TIME ZONE 'Europe/Bucharest') - INTERVAL '1 day', $4)`,
            [A, c3, U.ugynok_a2, U.vezeto_a, c1, U.ugynok_a1]);

        // Beérkező érdeklődés: Vevő Ferenc írt Anna hirdetésére (a CRM beérkező listájában jelenik meg)
        await client.query("INSERT INTO uzenetek (felado_id, cimzett_id, ingatlan_id, szoveg) VALUES ($1, $2, $3, $4), ($1, $5, $6, $7)",
            [U.vevo1, U.ugynok_a1, H.a1, "Jó napot! Érdekel a lakás, hétvégén megnézhetném? (teszt)",
             U.magan, H.m1, "Szia, alkuképes az ár? (teszt)"]);

        await client.query("COMMIT");

        // Ajánlat a valódi folyamaton át (értesítés, CRM-kapcsolás is): Vevő Gizella Anna lakására
        try {
            await require("./ajanlat").tesz({ id: U.vevo2 }, { ingatlan_id: H.a1, osszeg: 66000, penznem: "EUR", finanszirozas: "hitel",
                hitel_elobiralat: true, uzenet: "Hitelből venném, előbírálatom van. (teszt)", hozzajarul: true });
        } catch (e) { console.warn("Teszt ajánlat:", e.message); }

        return { ok: true, jelszo: jsz };

    } catch (e) {
        await client.query("ROLLBACK").catch(() => { });
        throw e;
    } finally {
        client.release();
    }
}

// ---------- Törlés ----------

async function torol() {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const fiokok = (await client.query("SELECT id FROM users WHERE teszt")).rows.map(r => r.id);
        // Az oldal (admin) CRM-jében a tesztfiókokhoz tartozó névjegyek
        if (fiokok.length) await client.query("DELETE FROM crm_ugyfelek WHERE iroda_id IS NULL AND user_id = ANY($1::int[])", [fiokok]);
        const h = await client.query("DELETE FROM ingatlanok WHERE teszt OR owner_id = ANY($1::int[]) OR iroda_id IN (SELECT id FROM irodak WHERE teszt)", [fiokok]);
        const i = await client.query("DELETE FROM irodak WHERE teszt");
        const m = await client.query("DELETE FROM munkamenetek WHERE user_id = ANY($1::int[])", [fiokok]);
        void m;
        const u = await client.query("DELETE FROM users WHERE teszt");
        await client.query("DELETE FROM beallitasok WHERE kulcs = $1", [JELSZO_KULCS]);
        await client.query("COMMIT");
        acc.cacheUrit();
        return { hirdetesek: h.rowCount, irodak: i.rowCount, fiokok: u.rowCount };
    } catch (e) {
        await client.query("ROLLBACK").catch(() => { });
        throw e;
    } finally {
        client.release();
    }
}

// ---------- Belépés / váltás / vissza ----------

async function belep(req, res, userId) {
    if (!(await adminE(req))) throw hibaKod("admin_only", 403);
    const u = (await db.query("SELECT * FROM users WHERE id = $1 AND teszt", [Number(userId) || 0])).rows[0];
    if (!u) throw hibaKod("not_found", 404);

    const sutik = acc.sutiOlvas(req);
    const jelenlegi = sutik[acc.SUTI];

    // Az admin saját munkamenetét eltesszük (a „Vissza az adminba” gombhoz) – csak ha
    // most még az admin van bent (tesztfiókból tesztfiókba váltáskor a régi marad)
    if (req.valodiSzerep === "admin" && jelenlegi) {
        res.cookie(VISSZA_SUTI, jelenlegi, { httpOnly: true, sameSite: "lax", secure: !!req.secure, maxAge: 12 * 3600 * 1000, path: "/" });
    }
    // Az előző tesztfiók munkamenete megszűnik (az admin munkamenete nem!)
    if (req.user && req.user.teszt && jelenlegi) {
        await db.query("DELETE FROM munkamenetek WHERE token_hash = $1", [acc.tokenHash(jelenlegi)]);
    }
    acc.cacheUrit();
    await acc.munkamenetNyit(res, u, req);
    return { ok: true, user: acc.nyilvanos(u) };
}

async function vissza(req, res) {
    if (!(req.user && req.user.teszt)) throw hibaKod("not_test_account", 400);
    const sutik = acc.sutiOlvas(req);
    const jelenlegi = sutik[acc.SUTI];
    if (jelenlegi) await db.query("DELETE FROM munkamenetek WHERE token_hash = $1", [acc.tokenHash(jelenlegi)]);
    acc.cacheUrit();

    const adminToken = sutik[VISSZA_SUTI];
    const admin = adminToken ? await acc.munkamenetUser(adminToken).catch(() => null) : null;
    res.clearCookie(VISSZA_SUTI, { path: "/" });
    if (admin && admin.szerep === "admin") {
        res.cookie(acc.SUTI, adminToken, { httpOnly: true, sameSite: "lax", secure: !!req.secure, maxAge: 60 * 24 * 3600 * 1000, path: "/" });
    } else {
        // Helyi fejlesztés (jelszó nélkül): kilépve újra admin; különben ki kell lépni
        res.clearCookie(acc.SUTI, { path: "/" });
    }
    return { ok: true, admin: !!(admin || acc.fejlesztoiKeres(req)) };
}

// A sávhoz (/api/me): ki van bent, és válthat-e
async function sav(req) {
    if (!(req.user && req.user.teszt)) return null;
    const f = FIOKOK.find(x => x.k === req.user.teszt_kulcs) || {};
    return { kulcs: req.user.teszt_kulcs, leiras: f.leiras || null, valthat: await adminE(req) };
}

module.exports = { FIOKOK, DOMAIN, lat, adminE, allapot, fiokLista, letrehoz, torol, belep, vissza, sav, hibaKod };
