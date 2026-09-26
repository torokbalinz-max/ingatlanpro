// ============================================================
//  Közelítő hely meghatározása szövegből (OpenStreetMap Nominatim)
//  Szabály: legfeljebb 1 kérés másodpercenként, saját User-Agent.
// ============================================================

let utolsoKeres = 0;
const cache = new Map();

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Az adatbázisban ékezet nélkül tárolt városnevek román megfelelője
const VAROS_RO = {
    Sepsiszentgyorgy: "Sfântu Gheorghe",
    Kezdivasarhely: "Târgu Secuiesc",
    Csikszereda: "Miercurea Ciuc",
    Brasso: "Brașov",
    Marosvasarhely: "Târgu Mureș"
};

// varos: a mi városnevünk (ékezet nélkül); megye: ha város helyett egy
// környékbeli településen keresünk (pl. "Ozun, Covasna")
async function geocode(szoveg, varos, megye) {

    const varosRo = VAROS_RO[varos] || varos || "";
    const q = [szoveg, varosRo, megye, "Romania"].filter(Boolean).join(", ");

    if (cache.has(q)) return cache.get(q);

    const varj = 1100 - (Date.now() - utolsoKeres);
    if (varj > 0) await sleep(varj);
    utolsoKeres = Date.now();

    try {

        const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ro&q=" + encodeURIComponent(q);

        const res = await fetch(url, {
            headers: { "User-Agent": "IngatlanPro/1.0 (real estate listing organizer)" },
            signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) return null;

        const lista = await res.json();

        // Utca / épület szintű találat pontosabb, mint egy városrész vagy a város közepe
        const t = lista[0];
        const eredmeny = t
            ? {
                x: Number(t.lon),
                y: Number(t.lat),
                szint: (t.class === "highway" || t.class === "building" || t.type === "house") ? "utca" : "kozelito"
            }
            : null;

        cache.set(q, eredmeny);

        return eredmeny;

    } catch (e) {

        return null;

    }

}

// Visszafelé: koordinátából a környék nevei (városrész, lakótelep, utca)
async function forditott(x, y) {

    const k = `r:${Number(y).toFixed(4)},${Number(x).toFixed(4)}`;
    if (cache.has(k)) return cache.get(k);

    const varj = 1100 - (Date.now() - utolsoKeres);
    if (varj > 0) await sleep(varj);
    utolsoKeres = Date.now();

    try {

        const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&addressdetails=1&accept-language=ro&lat=${y}&lon=${x}`;

        const res = await fetch(url, {
            headers: { "User-Agent": "IngatlanPro/1.0 (real estate listing organizer)" },
            signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) return null;

        const v = await res.json();
        const a = v.address || {};

        const eredmeny = {
            nevek: [a.neighbourhood, a.quarter, a.suburb, a.residential, a.city_district, a.hamlet].filter(Boolean),
            utca: a.road || null,
            telepules: a.village || a.town || a.city || null
        };

        cache.set(k, eredmeny);

        return eredmeny;

    } catch (e) {

        return null;

    }

}

module.exports = { geocode, forditott, VAROS_RO };
