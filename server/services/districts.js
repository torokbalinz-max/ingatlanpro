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
        const r = await db.query("SELECT nev, nev_ro, aliasok, hatar FROM keruletek WHERE varos = $1", [varos]);
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

// ---------- Melyik kerület? ----------
//
// A kézzel rajzolt határok ritkán illeszkednek tökéletesen: két szomszédos
// kerület között maradhat egy vékony rés, vagy egymásba lóghatnak. Ezért:
//  - ha a pont több határon belül van: ha az egyik kerület a másikon belül
//    fekszik (beágyazott), a kisebbik nyer; különben az, amelyiknek a pont
//    „mélyebben” van a belsejében (távolabb a szélétől) – így az átfedő
//    sávokban a közelebbi valódi kerület nyer, nem a kisebbik
//  - ha egyik határon sincs belül, de valamelyik széléhez 80 m-en belül
//    van (rés a határok között), az a kerület
// Ugyanez az algoritmus fut a böngészőben is (public/js/core/districts.js).

const RES_METER = 80;

function terulet(h) {
    return Math.abs(h.reduce((s, p, i) => {
        const q = h[(i + 1) % h.length];
        return s + p[0] * q[1] - q[0] * p[1];
    }, 0));
}

// A pont távolsága a sokszög szélétől, méterben
function szeltav(x, y, hatar) {
    const kx = 111320 * Math.cos(y * Math.PI / 180), ky = 110570;
    let min = Infinity;
    for (let i = 0, j = hatar.length - 1; i < hatar.length; j = i++) {
        const ax = (hatar[j][0] - x) * kx, ay = (hatar[j][1] - y) * ky;
        const bx = (hatar[i][0] - x) * kx, by = (hatar[i][1] - y) * ky;
        const dx = bx - ax, dy = by - ay;
        const l = dx * dx + dy * dy;
        let t = l ? -(ax * dx + ay * dy) / l : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if (d < min) min = d;
    }
    return min;
}

// "a" a "b"-n belül fekszik-e (a csúcsai legalább 90%-a)
function beagyazott(a, b) {
    const benn = a.filter(p => bennVan(p[0], p[1], b)).length;
    return benn >= a.length * 0.9;
}

// lista: [{ nev, hatar }] -> a pont kerülete (objektum) vagy null
function valaszt(lista, x, y) {

    const hatarosak = lista.filter(k => Array.isArray(k.hatar) && k.hatar.length >= 3);
    const talalt = hatarosak.filter(k => bennVan(x, y, k.hatar));

    if (talalt.length === 1) return talalt[0];

    if (talalt.length > 1) {
        const rend = [...talalt].sort((a, b) => terulet(a.hatar) - terulet(b.hatar));
        const kicsi = rend[0];
        if (rend.slice(1).every(k => beagyazott(kicsi.hatar, k.hatar))) return kicsi;
        return rend
            .map(k => ({ k, d: szeltav(x, y, k.hatar) }))
            .sort((a, b) => b.d - a.d)[0].k;
    }

    // Rés a határok között: a legközelebbi, ha elég közel van
    let legjobb = null;
    hatarosak.forEach(k => {
        const d = szeltav(x, y, k.hatar);
        if (d <= RES_METER && (!legjobb || d < legjobb.d)) legjobb = { k, d };
    });

    return legjobb ? legjobb.k : null;

}

// Melyik kerületben van a pont? -> kerület neve, vagy null
async function keruletPontbol(varos, x, y) {

    x = Number(x); y = Number(y);
    if (!varos || !(x && y)) return null;

    const k = valaszt(await varosKeruletei(varos), x, y);

    return k ? k.nev : null;

}

// Pontos (vagy utca szintű) helynél a határ dönti el a kerületet
function pontosSzint(szint) {
    return !szint || szint === "pontos" || szint === "utca";
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

// ---------- A város hirdetéseinek (újra) besorolása ----------
//  1) Pontos / utca szintű helynél a határ dönti el a kerületet
//  2) Közelítő helynél (csak a kerületet tudjuk): a kerület közepére tesszük,
//     a kör a kerület méretéhez igazodik – így nem gyűlik minden a város közepén
//  3) Hely nélküli, de kerülettel ismert hirdetés: közelítő hely a kerületben
//  Amit ember tett le a térképen (hely_kezi), azt nem mozgatjuk – de a
//  kerületét a határ szerint igazítjuk (különben a térkép mást mutatna).
async function besorol(varos) {

    const e = { keruletValtozott: 0, athelyezve: 0, ujHely: 0 };

    if (!varos || !(await vanHatar(varos))) return e;

    const { TIPUS_MEZOK } = require("./listing");
    const keruletes = Object.keys(TIPUS_MEZOK).filter(t => TIPUS_MEZOK[t].kerulet);
    const keruletek = await varosKeruletei(varos);

    const r = await db.query(`
        SELECT id, x, y, kerulet, hely_pontossag, hely_kezi, hely_forras, telepules
        FROM ingatlanok WHERE varos = $1 AND tipus = ANY($2::text[])
    `, [varos, keruletes]);

    for (const i of r.rows) {

        const vanHely = !!(i.x && i.y);
        const szint = i.hely_pontossag || (vanHely ? "pontos" : "nincs");

        if (vanHely && pontosSzint(szint)) {

            const k = valaszt(keruletek, Number(i.x), Number(i.y));

            if (k && k.nev !== i.kerulet) {
                await db.query("UPDATE ingatlanok SET kerulet = $1, updated_at = NOW() WHERE id = $2", [k.nev, i.id]);
                e.keruletValtozott++;
            }

            continue;

        }

        if (!i.kerulet || i.hely_kezi || i.telepules) continue;

        const kozepe = await keruletKozep(varos, i.kerulet);
        if (!kozepe) continue;

        if (vanHely && szint === "kozelito") {

            const sajat = keruletek.find(k => k.nev === i.kerulet);
            const kint = !(sajat && sajat.hatar && bennVan(Number(i.x), Number(i.y), sajat.hatar));
            const mashol = Math.abs(Number(i.x) - kozepe.x) > 1e-6 || Math.abs(Number(i.y) - kozepe.y) > 1e-6;

            if (mashol && (kint || i.hely_forras === "kerulet" || !i.hely_forras)) {
                await db.query(
                    "UPDATE ingatlanok SET x = $1, y = $2, hely_sugar = $3, hely_forras = 'kerulet', updated_at = NOW() WHERE id = $4",
                    [kozepe.x, kozepe.y, kozepe.sugar, i.id]
                );
                e.athelyezve++;
            }

        } else if (!vanHely) {

            await db.query(
                "UPDATE ingatlanok SET x = $1, y = $2, hely_pontossag = 'kozelito', hely_sugar = $3, hely_forras = 'kerulet', updated_at = NOW() WHERE id = $4",
                [kozepe.x, kozepe.y, kozepe.sugar, i.id]
            );
            e.ujHely++;

        }

    }

    return e;

}

// Minden város, ahol van megrajzolt határ (induláskor / automatikus javítás után)
async function besorolMind() {
    const ossz = { keruletValtozott: 0, athelyezve: 0, ujHely: 0 };
    const r = await db.query("SELECT DISTINCT varos FROM keruletek WHERE hatar IS NOT NULL");
    for (const { varos } of r.rows) {
        const e = await besorol(varos);
        Object.keys(ossz).forEach(k => { ossz[k] += e[k]; });
    }
    if (ossz.keruletValtozott || ossz.athelyezve || ossz.ujHely) {
        console.log(`Kerület-besorolás: ${ossz.keruletValtozott} kerület javítva, ${ossz.athelyezve} áthelyezve, ${ossz.ujHely} új közelítő hely.`);
    }
    return ossz;
}

// Ellenőrző lista az adminnak: pontos helyű hirdetések, amelyek kerülete
// nem egyezik a térképpel, vagy egyik határon sincsenek belül
async function ellenorzes(varos) {

    const keruletek = await varosKeruletei(varos);
    if (!keruletek.some(k => k.hatar)) return { vanHatar: false, elteres: [], kivul: [] };

    const { TIPUS_MEZOK } = require("./listing");
    const keruletes = Object.keys(TIPUS_MEZOK).filter(t => TIPUS_MEZOK[t].kerulet);

    const r = await db.query(`
        SELECT id, x, y, kerulet, cim, hely_pontossag, statusz FROM ingatlanok
        WHERE varos = $1 AND tipus = ANY($2::text[]) AND x IS NOT NULL AND y IS NOT NULL
          AND COALESCE(hely_pontossag, 'pontos') IN ('pontos', 'utca') AND statusz IN ('aktiv', 'fuggo')
    `, [varos, keruletes]);

    const elteres = [], kivul = [];

    r.rows.forEach(i => {
        const k = valaszt(keruletek, Number(i.x), Number(i.y));
        if (!k) kivul.push({ id: i.id, cim: i.cim, kerulet: i.kerulet });
        else if (k.nev !== i.kerulet) elteres.push({ id: i.id, cim: i.cim, kerulet: i.kerulet, terkep: k.nev });
    });

    return { vanHatar: true, osszes: r.rowCount, elteres, kivul: kivul.slice(0, 200), kivulDb: kivul.length };

}

module.exports = {
    tisztaHatar, bennVan, kozep, sugar, keruletPontbol, keruletKozep, vanHatar, varosKeruletei, cacheUrit,
    valaszt, szeltav, pontosSzint, besorol, besorolMind, ellenorzes
};
