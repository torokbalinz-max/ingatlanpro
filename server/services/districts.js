// ============================================================
//  Kerülethatárok
//
//  Az admin a térképen megrajzolja a kerületek határát (sokszög).
//  Ebből:
//   - egy pontos helyű hirdetésről megmondjuk, melyik kerületben van
//   - a csak kerülettel ismert (közelítő helyű) hirdetés a kerület
//     közepére kerül, a kör a kerület méretéhez igazodik
//
//  A határ formája: [[hosszúság (x), szélesség (y)], ...] – legalább 3 pont.
// ============================================================

const db = require("../db/database");

let cache = { ido: 0, adat: new Map() };      // varos -> [{ nev, nev_ro, hatar }]

function cacheUrit() {
    cache = { ido: 0, adat: new Map() };
}

// Egy határ ellenőrzése / tisztítása (a kérésből jön)
function tisztaHatar(h) {

    if (!Array.isArray(h)) return null;

    const pontok = h
        .map(p => Array.isArray(p) ? [Number(p[0]), Number(p[1])] : null)
        .filter(p => p && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)
        .map(p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6])
        .slice(0, 400);

    return pontok.length >= 3 ? pontok : null;

}

async function varosKeruletei(varos) {

    if (!varos) return [];

    if (Date.now() - cache.ido > 5 * 60 * 1000) cacheUrit();

    if (!cache.adat.has(varos)) {
        const r = await db.query("SELECT nev, nev_ro, hatar FROM keruletek WHERE varos = $1", [varos]);
        cache.adat.set(varos, r.rows.map(k => ({ ...k, hatar: tisztaHatar(k.hatar) })));
        cache.ido = cache.ido || Date.now();
    }

    return cache.adat.get(varos);

}

// Pont a sokszögben (sugárkövetés)
function bennVan(x, y, hatar) {

    let benn = false;

    for (let i = 0, j = hatar.length - 1; i < hatar.length; j = i++) {
        const [xi, yi] = hatar[i];
        const [xj, yj] = hatar[j];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) benn = !benn;
    }

    return benn;

}

// A sokszög területe szerinti közepe (ha kifelé esne, a pontok átlaga)
function kozep(hatar) {

    let a = 0, cx = 0, cy = 0;

    for (let i = 0, j = hatar.length - 1; i < hatar.length; j = i++) {
        const [x0, y0] = hatar[j];
        const [x1, y1] = hatar[i];
        const f = x0 * y1 - x1 * y0;
        a += f;
        cx += (x0 + x1) * f;
        cy += (y0 + y1) * f;
    }

    if (Math.abs(a) < 1e-12) {
        const n = hatar.length;
        return { x: hatar.reduce((s, p) => s + p[0], 0) / n, y: hatar.reduce((s, p) => s + p[1], 0) / n };
    }

    const k = { x: cx / (3 * a), y: cy / (3 * a) };

    if (bennVan(k.x, k.y, hatar)) return k;

    const n = hatar.length;
    return { x: hatar.reduce((s, p) => s + p[0], 0) / n, y: hatar.reduce((s, p) => s + p[1], 0) / n };

}

const km = (x1, y1, x2, y2) => Math.hypot((x1 - x2) * 111.32 * Math.cos(y1 * Math.PI / 180), (y1 - y2) * 110.57);

// A kör sugara (m), ami nagyjából lefedi a kerületet – nem túl nagy, hogy
// ne takarja el a térképet
function sugar(hatar, k) {
    const c = k || kozep(hatar);
    const d = hatar.map(p => km(c.x, c.y, p[0], p[1]));
    d.sort((a, b) => a - b);
    const tipikus = d[Math.floor(d.length * 0.6)] || d[d.length - 1] || 0.5;
    return Math.max(200, Math.min(1500, Math.round(tipikus * 1000 / 50) * 50));
}

// Melyik kerületben van a pont? -> kerület neve, vagy null
async function keruletPontbol(varos, x, y) {

    if (!varos || !(x && y)) return null;

    const lista = (await varosKeruletei(varos)).filter(k => k.hatar);

    const talalt = lista.filter(k => bennVan(x, y, k.hatar));

    if (!talalt.length) return null;

    // Egymásba lógó határoknál a kisebbik (a pontosabb) nyer
    if (talalt.length > 1) {
        const terulet = h => Math.abs(h.reduce((s, p, i) => {
            const q = h[(i + 1) % h.length];
            return s + p[0] * q[1] - q[0] * p[1];
        }, 0));
        talalt.sort((a, b) => terulet(a.hatar) - terulet(b.hatar));
    }

    return talalt[0].nev;

}

// Van-e a városnak megrajzolt kerülethatára
async function vanHatar(varos) {
    return (await varosKeruletei(varos)).some(k => k.hatar);
}

// A kerület közepe és a kör mérete (a közelítő helyhez) -> { x, y, sugar } vagy null
async function keruletKozep(varos, kerulet) {

    if (!varos || !kerulet) return null;

    const k = (await varosKeruletei(varos)).find(x => x.nev === kerulet && x.hatar);

    if (!k) return null;

    const c = kozep(k.hatar);

    return { x: c.x, y: c.y, sugar: sugar(k.hatar, c) };

}

module.exports = { tisztaHatar, bennVan, kozep, sugar, keruletPontbol, keruletKozep, vanHatar, varosKeruletei, cacheUrit };
