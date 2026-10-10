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
    // (Teszteléshez a NOMINATIM_URL környezeti változóval más szerver is megadható)
    const url = `${process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org"}/${utvonal}?${qs}`;

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

// ---------- Tartós gyorstár (adatbázis) ----------
//  Az utcák vonalát és a házszámokat 30 napig megjegyezzük, így egy újraindítás
//  (Render) vagy az automatikus javítás nem kérdezi le újra ugyanazt.

const TARTOS_NAP = 30;

async function tartosOlvas(k) {
    try {
        const db = require("../db/database");
        const r = await db.query("SELECT adat FROM geo_cache WHERE kulcs = $1 AND ido > NOW() - ($2 || ' days')::interval", [k, String(TARTOS_NAP)]);
        return r.rows[0] ? r.rows[0].adat : undefined;
    } catch (e) {
        return undefined;
    }
}

async function tartosIr(k, adat) {
    try {
        const db = require("../db/database");
        await db.query(
            `INSERT INTO geo_cache (kulcs, adat, ido) VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (kulcs) DO UPDATE SET adat = EXCLUDED.adat, ido = NOW()`,
            [k, JSON.stringify(adat)]
        );
    } catch (e) { /* nem kritikus */ }
}

// ---------- Geometria (méterben) ----------

// Egy pont távolsága egy vonaltól (szakaszok sora), méterben
function vonalTav(x, y, pontok) {
    const kx = 111320 * Math.cos(y * Math.PI / 180), ky = 110570;
    if (!pontok || !pontok.length) return Infinity;
    if (pontok.length === 1) return Math.hypot((pontok[0][0] - x) * kx, (pontok[0][1] - y) * ky);
    let min = Infinity;
    for (let i = 1; i < pontok.length; i++) {
        const ax = (pontok[i - 1][0] - x) * kx, ay = (pontok[i - 1][1] - y) * ky;
        const bx = (pontok[i][0] - x) * kx, by = (pontok[i][1] - y) * ky;
        const dx = bx - ax, dy = by - ay;
        const l = dx * dx + dy * dy;
        let t = l ? -(ax * dx + ay * dy) / l : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if (d < min) min = d;
    }
    return min;
}

// A vonal legközelebbi pontja egy ponthoz -> { x, y, d (méter) }
function vonalPont(x, y, pontok) {
    const kx = 111320 * Math.cos(y * Math.PI / 180), ky = 110570;
    let best = { x: pontok[0][0], y: pontok[0][1], d: Infinity };
    if (pontok.length === 1) return { x: pontok[0][0], y: pontok[0][1], d: Math.hypot((pontok[0][0] - x) * kx, (pontok[0][1] - y) * ky) };
    for (let i = 1; i < pontok.length; i++) {
        const [x0, y0] = pontok[i - 1], [x1, y1] = pontok[i];
        const ax = (x0 - x) * kx, ay = (y0 - y) * ky, dx = (x1 - x0) * kx, dy = (y1 - y0) * ky;
        const l = dx * dx + dy * dy;
        let t = l ? -(ax * dx + ay * dy) / l : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if (d < best.d) best = { x: x0 + t * (x1 - x0), y: y0 + t * (y1 - y0), d };
    }
    return best;
}

// Az utca (több vonal) legközelebbi pontja -> { x, y, d }
function utcaPont(x, y, vonalak) {
    let best = null;
    (vonalak || []).forEach(v => {
        const p = vonalPont(x, y, v);
        if (!best || p.d < best.d) best = p;
    });
    return best;
}

function utcaTav(x, y, vonalak) {
    let min = Infinity;
    (vonalak || []).forEach(v => { min = Math.min(min, vonalTav(x, y, v)); });
    return min;
}

// A vonalak csoportokba (ha ugyanaz a név két, egymástól messze lévő helyen is
// szerepel – pl. a városban és egy hozzá tartozó faluban)
function csoportok(vonalak, kuszobKm = 1.2) {
    const cs = [];
    vonalak.forEach(v => {
        const c = cs.find(g => g.some(w => v.some(p => utcaTav(p[0], p[1], [w]) < kuszobKm * 1000)));
        if (c) c.push(v); else cs.push([v]);
    });
    // Ha két csoport egy harmadik vonallal összeér, összevonjuk
    for (let i = 0; i < cs.length; i++) {
        for (let j = i + 1; j < cs.length; j++) {
            if (cs[i].some(a => cs[j].some(b => a.some(p => vonalTav(p[0], p[1], b) < kuszobKm * 1000)))) {
                cs[i].push(...cs[j]);
                cs.splice(j, 1);
                j = i;
            }
        }
    }
    return cs;
}

// A vonalak "közepe": a hosszuk felénél lévő pont (az utcán van, nem mellette)
function vonalKozep(vonalak) {
    const pontok = vonalak.flat();
    if (!pontok.length) return null;
    const cx = pontok.reduce((s, p) => s + p[0], 0) / pontok.length;
    const cy = pontok.reduce((s, p) => s + p[1], 0) / pontok.length;
    const p = utcaPont(cx, cy, vonalak);
    return p ? { x: p.x, y: p.y } : { x: cx, y: cy };
}

function vonalHossz(vonalak) {
    let m = 0;
    vonalak.forEach(v => { for (let i = 1; i < v.length; i++) m += km(v[i - 1][0], v[i - 1][1], v[i][0], v[i][1]); });
    return m;
}

// ---------- Utca: az összes szakasza ----------
//  Egy utca a térképen sok darabból áll (kereszteződésenként új szakasz). A
//  "dedupe=0" + "polygon_geojson=1" kéréssel mindet megkapjuk, így megmondható,
//  milyen messze van egy pont az utcától (nem csak egy pontjától), és hol van
//  az utca közepe.
//   nevek:      a keresett név változatai (pl. "Strada Kós Károly", "Kós Károly utca")
//   opts.varosRo, opts.megye: a város (vagy falu) román neve és megyéje
//   opts.kozep: [x, y], opts.sugarKm: csak ebben a körben fogadunk el találatot
//   opts.hazszam: ha van, előbb a házszámot keressük (pontos hely)
//  -> { nev, vonalak: [[[x, y], ...], ...], kozep: { x, y }, hosszKm, haz: { x, y } | null } vagy null
async function utca(nevek, opts = {}) {

    const lista = [...new Set((Array.isArray(nevek) ? nevek : [nevek]).map(n => String(n || "").trim()).filter(n => n.length >= 3))];
    if (!lista.length) return null;

    const { varosRo, megye, kozep } = opts;
    const sugarKm = opts.sugarKm || 10;
    const k = "utca2:" + [varosRo || "", lista[0].toLowerCase(), opts.hazszam || ""].join("|");

    const tarolt = await tartosOlvas(k);
    if (tarolt !== undefined) return tarolt && tarolt.nincs ? null : tarolt;

    const kozelben = t => !kozep || km(kozep[0], kozep[1], Number(t.lon), Number(t.lat)) <= sugarKm * 1.05;
    const utcaE = t => t.category === "highway" || t.addresstype === "road" || ["square", "pedestrian"].includes(t.type);

    let eredmeny = null;

    for (const nev of lista.slice(0, 4)) {

        // 1) Házszám (ha van): pontos hely
        let haz = null;
        if (opts.hazszam) {
            const h = await nominatim("search", { street: `${opts.hazszam} ${nev}`, city: varosRo || "", ...(megye ? { county: megye } : {}), country: "Romania", limit: "5" });
            const jo = (h || []).filter(kozelben).find(t => ["house", "building"].includes(t.addresstype) || t.category === "building" || t.type === "house");
            if (jo) haz = { x: Number(jo.lon), y: Number(jo.lat) };
        }

        // 2) Az utca összes szakasza
        const params = {
            street: nev, country: "Romania", limit: "40", dedupe: "0",
            polygon_geojson: "1", polygon_threshold: "0.00002"
        };
        if (varosRo) params.city = varosRo;
        if (megye) params.county = megye;

        let v = (await nominatim("search", params) || []).filter(kozelben).filter(utcaE);

        // A strukturált keresés néha nem talál (pl. a térképen más a típus): az utolsó
        // próbánál szabad szöveggel, a típus nélküli névvel, a város körüli dobozban
        if (!v.length && kozep && nev === lista[Math.min(lista.length, 4) - 1] && opts.alap) {
            const q = { q: `${opts.alap}${varosRo ? ", " + varosRo : ""}`, viewbox: doboz(kozep[0], kozep[1], sugarKm).join(","), bounded: "1", limit: "40", dedupe: "0", polygon_geojson: "1", polygon_threshold: "0.00002" };
            v = (await nominatim("search", q) || []).filter(kozelben).filter(utcaE);
        }

        const vonalak = [];
        v.forEach(t => {
            const g = t.geojson;
            if (!g) { vonalak.push([[Number(t.lon), Number(t.lat)]]); return; }
            if (g.type === "LineString") vonalak.push(g.coordinates);
            else if (g.type === "MultiLineString") g.coordinates.forEach(c => vonalak.push(c));
            else if (g.type === "Polygon") vonalak.push(g.coordinates[0]);
            else if (g.type === "MultiPolygon") g.coordinates.forEach(p => vonalak.push(p[0]));
            else if (g.type === "Point") vonalak.push([g.coordinates]);
        });

        // Kerekítés (kisebb tárolás): ~1 m pontosság
        const kerek = vonalak.map(l => l.map(p => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]));

        if (kerek.length || haz) {
            eredmeny = {
                nev: (v[0] && v[0].name) || nev,
                keresett: nev,
                vonalak: kerek,
                kozep: kerek.length ? vonalKozep(kerek) : haz,
                hosszKm: Math.round(vonalHossz(kerek) * 100) / 100,
                haz
            };
            break;
        }

    }

    await tartosIr(k, eredmeny || { nincs: true });

    return eredmeny;

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

module.exports = {
    geocode, keres, keresLista, forditott, km, doboz, VAROS_RO,
    utca, utcaTav, utcaPont, vonalTav, vonalPont, vonalKozep, csoportok, nominatim, talalat
};
