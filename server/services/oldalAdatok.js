// ============================================================
//  Az oldal üzemeltetőjének adatai (Admin → Webhely adatai)
//
//  Ezek jelennek meg az Impresszumban, a Felhasználási feltételekben,
//  az Adatvédelmi és a Süti-tájékoztatóban és a láblécben. Kódot nem
//  kell módosítani: az admin felületen kitöltöd (cégalapítás után a
//  cégnevet, adószámot is – az ANAF-ból egy gombbal kitölthető), és
//  minden jogi oldal magától átveszi.
//
//  Ha a kapcsolattartó e-mail nincs kitöltve, az admin e-mail címe
//  látszik (az ADMIN_EMAILS első címe, vagy az admin fiók e-mailje).
// ============================================================

const db = require("../db/database");

const KULCS = "uzemelteto";
const TIPUSOK = ["maganszemely", "pfa", "ceg"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

let cache = null;
const CACHE_MS = 60 * 1000;

function ures() {
    return { tipus: "maganszemely", nev: "", cim: "", email: "", telefon: "", cegjegyzekszam: "", adoszam: "" };
}

async function olvas() {

    if (cache && Date.now() - cache.ido < CACHE_MS) return cache.adat;

    let adat = ures();

    try {
        const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = $1", [KULCS]);
        if (r.rows[0] && r.rows[0].ertek) adat = { ...adat, ...JSON.parse(r.rows[0].ertek) };
    } catch (e) {
        /* első indulás / hibás érték: az üres adatok maradnak */
    }

    cache = { ido: Date.now(), adat };
    return adat;

}

// Az admin e-mail címe (ha a kapcsolattartó e-mail nincs külön megadva)
async function adminEmail() {

    const env = String(process.env.ADMIN_EMAILS || "").split(",").map(x => x.trim()).filter(x => EMAIL_RE.test(x));
    if (env.length) return env[0];

    try {
        const r = await db.query(`
            SELECT email FROM users WHERE szerep = 'admin' AND email IS NOT NULL AND email <> ''
            ORDER BY utolso_belepes DESC NULLS LAST, id LIMIT 1`);
        return r.rows[0] ? r.rows[0].email : "";
    } catch (e) {
        return "";
    }

}

// A weboldalnak (/api/config): a kitöltött adatok + az e-mail alapértéke
async function nyilvanos() {
    const a = await olvas();
    const email = a.email || await adminEmail();
    return { ...a, email, emailAlap: !a.email && !!email };
}

function tisztit(b) {

    const sz = (v, max) => String(v ?? "").trim().slice(0, max);

    const a = {
        tipus: TIPUSOK.includes(b.tipus) ? b.tipus : "maganszemely",
        nev: sz(b.nev, 160),
        cim: sz(b.cim, 300),
        email: sz(b.email, 160).toLowerCase(),
        telefon: sz(b.telefon, 40),
        cegjegyzekszam: sz(b.cegjegyzekszam, 40),
        adoszam: sz(b.adoszam, 20).toUpperCase()
    };

    if (a.email && !EMAIL_RE.test(a.email)) {
        const e = new Error("bad_email");
        e.kod = "bad_email";
        throw e;
    }

    return a;

}

async function ment(b) {

    const a = tisztit(b || {});

    await db.query(
        `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`,
        [KULCS, JSON.stringify(a)]
    );

    cache = null;
    return a;

}

module.exports = { olvas, nyilvanos, ment, adminEmail, TIPUSOK };
