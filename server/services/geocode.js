// ============================================================
//  Címkeresés (OpenStreetMap Nominatim)
//  Szabály: legfeljebb 1 kérés másodpercenként, saját User-Agent.
//
//  Fontos: mindig egy "dobozon" belül keresünk (a város körül, vagy
//  a környező falvaknál a város ~45 km-es körzetében), és több
//  találatból a legközelebbit választjuk. Így egy azonos nevű utca
//  vagy falu az ország másik végén nem kerülhet a hirdetésre.
// ============================================================

let utolsoKeres = 0;
const cache = new Map();

const sleep = ms => new Promise(r => setTimeout(r, ms));

const UA = "IngatlanPro/1.1 (real estate listing organizer)";

// Az adatbázisban ékezet nélkül tárolt városnevek román megfelelője
// (ha a varosok táblában nincs nev_ro)
const VAROS_RO = {
    Sepsiszentgyorgy: "Sfântu Gheorghe",
    Kezdivasarhely: "Târgu Secuiesc",
    Kovaszna: "Covasna",
    Baroth: "Baraolt",
    Csikszereda: "Miercurea Ciuc",
    Szekelyudvarhely: "Odorheiu Secuiesc",
    Gyergyoszentmiklos: "Gheorgheni",
    Brasso: "Brașov",
    Marosvasarhely: "Târgu Mureș",
    Kolozsvar: "Cluj-Napoca"
};

// Távolság km-ben (két [hosszúság, szélesség] pont között)
function km(x1, y1, x2, y2) {
    const R = 6371;
    const r = d => d * Math.PI / 180;
    const dLat = r(y2 - y1), dLon = r(x2 - x1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(y1)) * Math.cos(r(y2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

// Doboz egy pont körül (km)
function doboz(x, y, sugarKm) {
    const dy = sugarKm / 111;
    const dx = sugarKm / (111 * Math.cos(y * Math.PI / 180));
    return [x - dx, y + dy, x + dx, y - dy];        // bal, fent, jobb, lent (Nominatim sorrend)
}

async function nominatim(utvonal, params) {

    const qs = new URLSearchParams({ format: "jsonv2", countrycodes: "ro", addressdetails: "1", "accept-language": "ro", ...params });
    const url = `https://nominatim.openstreetmap.org/${utvonal}?${qs}`;

    if (cache.has(url)) return cache.get(url);

    const varj = 1100 - (Date.now() - utolsoKeres);
    if (varj > 0) await sleep(varj);
    utolsoKeres = Date.now();

    try {

        const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });

        if (!res.ok) return null;

        const v = await res.json();

        cache.set(url, v);
        if (cache.size > 3000) cache.delete(cache.keys().next().value);

        return v;

    } catch (e) {
        return null;
    }

}

// Egy találat egységes formára
function talalat(t) {
    const a = t.address || {};
    const utcaSzint = t.category === "highway" || t.category === "building" || t.type === "house" ||
        t.addresstype === "road" || t.addresstype === "house_number" || t.addresstype === "building";
    return {
        x: Number(t.lon),
        y: Number(t.lat),
        szint: utcaSzint ? "utca" : "kozelito",
        nev: t.name || t.display_name,
        tipus: t.addresstype || t.type,
        telepules: a.village || a.town || a.city || a.municipality || null,
        megye: a.county || null
    };
}

//  Keresés.
//   szoveg:  utca / környék / falu neve
//   opts.kozep:   [x, y] – ennek a közelében keresünk
//   opts.sugarKm: a keresési doboz (alap 12 km)
//   opts.varosRo: a város román neve (az utcakereséshez)
//   opts.megye:   megye (a falvakhoz)
//   opts.fajta:   "utca" | "telepules" | "kornyek"
//  -> a legjobb találat (a kozep-hez legközelebbi a dobozban), vagy null
async function keres(szoveg, opts = {}) {

    szoveg = String(szoveg || "").trim();
    if (szoveg.length < 3) return null;

    const lista = await keresLista(szoveg, opts);

    return lista[0] || null;

}

async function keresLista(szoveg, opts = {}) {

    const { kozep, varosRo, megye, fajta } = opts;
    const sugarKm = opts.sugarKm || 12;
    const jeloltek = [];

    const hozzaad = v => (v || []).forEach(t => jeloltek.push(talalat(t)));

    // 1) Utca: strukturált keresés a városban
    if (fajta === "utca" && varosRo) {
        hozzaad(await nominatim("search", { street: szoveg, city: varosRo, country: "Romania", limit: "5" }));
    }

    // 2) Dobozban (a város / környék körül), csak onnan fogadunk el találatot
    if (!jeloltek.length && kozep) {
        const params = { q: szoveg, viewbox: doboz(kozep[0], kozep[1], sugarKm).join(","), bounded: "1", limit: "8" };
        if (fajta === "telepules") params.featureType = "settlement";
        hozzaad(await nominatim("search", params));
    }

    // 3) Doboz nélkül (ha nincs közép) – megyével pontosítva
    if (!jeloltek.length && !kozep) {
        hozzaad(await nominatim("search", { q: [szoveg, varosRo, megye, "Romania"].filter(Boolean).join(", "), limit: "5" }));
    }

    // Csak a dobozon belül, a legközelebbi előre
    let jo = jeloltek.filter(t => isFinite(t.x) && isFinite(t.y));

    if (kozep) {
        jo = jo.map(t => ({ ...t, km: km(kozep[0], kozep[1], t.x, t.y) }))
            .filter(t => t.km <= sugarKm * 1.05)
            .sort((a, b) => a.km - b.km);
    }

    if (megye && fajta === "telepules") {
        const m = ekezetNelkul(megye);
        const megyeben = jo.filter(t => !t.megye || ekezetNelkul(t.megye).includes(m));
        if (megyeben.length) jo = megyeben;
    }

    return jo;

}

function ekezetNelkul(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Régi hívási forma (varos: a mi városnevünk; megye: falu keresésekor)
async function geocode(szoveg, varos, megye) {
    return keres(szoveg, { varosRo: VAROS_RO[varos] || varos, megye, fajta: megye ? "telepules" : "utca" });
}

// Visszafelé: koordinátából a környék nevei (városrész, lakótelep, utca)
async function forditott(x, y) {

    const v = await nominatim("reverse", { lat: String(y), lon: String(x), zoom: "17" });

    if (!v || !v.address) return null;

    const a = v.address;

    return {
        nevek: [a.neighbourhood, a.quarter, a.suburb, a.residential, a.city_district, a.hamlet].filter(Boolean),
        utca: a.road || null,
        telepules: a.village || a.town || a.city || null,
        megye: a.county || null
    };

}

module.exports = { geocode, keres, keresLista, forditott, km, doboz, VAROS_RO };
