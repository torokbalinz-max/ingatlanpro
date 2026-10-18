// ============================================================
//  Funkciók ki/be kapcsolása (Admin → Webhely adatai → Funkciók)
//
//  ertekesites: az „Eladjuk helyetted” megbízásos értékesítés teljes része –
//    a nyilvános oldal (#eladjuk), az eladó (#eladas) és a vevő
//    (#erdeklodes) oldala, a megtekintés-foglalás / ajánlat a hirdetéseken,
//    az admin „Értékesítés” modulja és az automatikus értesítők.
//    Kikapcsolva semmi nem törlődik – visszakapcsolva minden ott folytatódik.
// ============================================================

const db = require("../db/database");

const KULCS = "funkciok";
const ALAP = { ertekesites: true };

let cache = null;
const CACHE_MS = 30 * 1000;

async function olvas() {
    if (cache && Date.now() - cache.ido < CACHE_MS) return cache.adat;
    let adat = { ...ALAP };
    try {
        const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = $1", [KULCS]);
        if (r.rows[0] && r.rows[0].ertek) adat = { ...adat, ...JSON.parse(r.rows[0].ertek) };
    } catch (e) { /* első indulás: alapértékek */ }
    cache = { ido: Date.now(), adat };
    return adat;
}

async function ment(b) {
    const regi = await olvas();
    const adat = { ...regi };
    Object.keys(ALAP).forEach(k => { if (k in (b || {})) adat[k] = b[k] !== false; });
    await db.query(
        `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`, [KULCS, JSON.stringify(adat)]);
    cache = null;
    return adat;
}

async function ertekesites() {
    return (await olvas()).ertekesites !== false;
}

module.exports = { olvas, ment, ertekesites, ALAP };
