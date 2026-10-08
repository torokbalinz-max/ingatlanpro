// ============================================================
//  Reklámfelületek (Admin → Webhely adatai → Reklámfelületek)
//
//  Egyelőre csak helyőrzők ("Bérelhető reklámfelület") – a helyük
//  (méret, oldal) a weboldalon van (public/js/core/ads.js). Itt
//  kapcsolható ki az összes, és itt adható meg, melyik e-mail címre
//  jelentkezzenek az érdeklődő hirdetők (üresen: a webhely e-mail címe).
// ============================================================

const db = require("../db/database");

const KULCS = "reklam";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

let cache = null;
const CACHE_MS = 60 * 1000;

const alap = () => ({ mutat: true, email: "" });

async function olvas() {

    if (cache && Date.now() - cache.ido < CACHE_MS) return cache.adat;

    let adat = alap();

    try {
        const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = $1", [KULCS]);
        if (r.rows[0] && r.rows[0].ertek) adat = { ...adat, ...JSON.parse(r.rows[0].ertek) };
    } catch (e) {
        /* első indulás / hibás érték: az alapértékek maradnak */
    }

    cache = { ido: Date.now(), adat };
    return adat;

}

async function ment(b) {

    const email = String((b && b.email) || "").trim().toLowerCase().slice(0, 160);

    if (email && !EMAIL_RE.test(email)) {
        const e = new Error("bad_email");
        e.kod = "bad_email";
        throw e;
    }

    const adat = { mutat: !(b && b.mutat === false), email };

    await db.query(
        `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`,
        [KULCS, JSON.stringify(adat)]
    );

    cache = null;
    return adat;

}

module.exports = { olvas, ment };
