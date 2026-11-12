// ============================================================
//  Forrásoldalak: melyiket olvassuk közvetlenül, és melyik a "fő" oldal
//
//  Ha ugyanaz az ingatlan több hirdetési oldalon is fent van, nálunk
//  egyszer jelenik meg (duplikátum-összevonás), a többi oldal linkje a
//  "további linkek" közé kerül. Hogy kattintásra melyik oldal nyíljon
//  meg, azt az admin sorrendje dönti el (Admin → Hirdetések → Források):
//  az első olyan oldal, ahol a hirdetés fent van.
//
//  Beállítás (beallitasok tábla, kulcs: "forras_beallitas"):
//    kozvetlen: ["olx", "storia"]       – ezeket az oldalakat közvetlenül olvassuk
//                                         (services/kozvetlen.js), nem az Imoradar24-ről
//    sorrend:   ["storia", "olx", ...]  – a fő oldal választásának sorrendje
//
//  A közvetlen beolvasás sikeres futásának ideje is itt van (kulcs:
//  "kozvetlen_kesz"): városonként és oldalanként. Ha egy város OLX / Storia
//  listáját az elmúlt 36 órában sikerült végigolvasni, az Imoradar24 listájából
//  az ezekről az oldalakról származó új hirdetéseket nem vesszük fel (azok már
//  közvetlenül, a pontos linkjükkel bent vannak). Ha a közvetlen olvasás nem
//  sikerült (pl. az oldal letiltja a szervert), marad az Imoradar24.
// ============================================================

const db = require("../db/database");

const KULCS = "forras_beallitas";
const KESZ_KULCS = "kozvetlen_kesz";

const OLDALAK = ["storia", "olx", "imobiliare", "publi24", "homezz", "lajumate", "anuntul", "romimo", "imoradar24"];
const KOZVETLEN_LEHET = ["olx", "storia", "publi24"];
const ALAP = { kozvetlen: ["olx", "storia", "publi24"], sorrend: [...OLDALAK] };
const FRISS_ORA = 36;

let cache = null;
const CACHE_MS = 30 * 1000;

async function olvasKulcs(k) {
    const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = $1", [k]);
    if (!r.rows[0] || !r.rows[0].ertek) return null;
    try { return JSON.parse(r.rows[0].ertek); } catch (e) { return null; }
}

async function irKulcs(k, v) {
    await db.query(
        `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`, [k, JSON.stringify(v)]);
}

function tisztit(b) {
    const kozvetlen = [...new Set((Array.isArray(b && b.kozvetlen) ? b.kozvetlen : ALAP.kozvetlen).map(String))].filter(x => KOZVETLEN_LEHET.includes(x));
    let sorrend = [...new Set((Array.isArray(b && b.sorrend) ? b.sorrend : []).map(String))].filter(x => OLDALAK.includes(x));
    OLDALAK.forEach(x => { if (!sorrend.includes(x)) sorrend.push(x); });
    // a közvetítő (Imoradar24) mindig a végén: csak ha máshol nincs meg a hirdetés
    sorrend = [...sorrend.filter(x => x !== "imoradar24"), "imoradar24"];
    return { kozvetlen, sorrend };
}

async function olvas() {
    if (cache && Date.now() - cache.ido < CACHE_MS) return cache.adat;
    let adat = tisztit(ALAP);
    try {
        const v = await olvasKulcs(KULCS);
        if (v) {
            // a Publi24 közvetlen olvasása később jött: a régi mentésekben alapból bekapcsolva
            if (Array.isArray(v.kozvetlen) && !v.publi24Ismert && !v.kozvetlen.includes("publi24")) v.kozvetlen = [...v.kozvetlen, "publi24"];
            adat = tisztit({ ...ALAP, ...v });
        }
    } catch (e) { /* első indulás */ }
    cache = { ido: Date.now(), adat };
    return adat;
}

async function ment(b) {
    const adat = tisztit({ ...(await olvas()), ...(b || {}) });
    await irKulcs(KULCS, { ...adat, publi24Ismert: true });
    cache = null;
    return adat;
}

// A link oldala ("olx", "storia", "imoradar24"...)
function oldal(link) {
    const s = String(link || "").toLowerCase();
    for (const k of OLDALAK) if (s.includes(k + ".ro")) return k;
    return null;
}

// A legjobb link a sorrend szerint (a közvetlen hirdetés-link előre, a közvetítő a végére)
function legjobb(linkek, sorrend) {
    const sor = sorrend || ALAP.sorrend;
    const hely = l => { const o = oldal(l); const i = o ? sor.indexOf(o) : -1; return i < 0 ? sor.length - 1.5 : i; };
    return [...(linkek || [])].filter(Boolean).sort((a, b) => hely(a) - hely(b))[0] || null;
}

// ---------- Közvetlen beolvasás: mikor sikerült utoljára (városonként, oldalanként) ----------

//  tipus / ugylet: melyik lista (pl. eladó lakások) – a kulcs: "olx|Sepsiszentgyorgy|lakas|elado"
async function keszJelol(forras, varos, tipus, ugylet) {
    const v = (await olvasKulcs(KESZ_KULCS).catch(() => null)) || {};
    v[`${forras}|${varos}|${tipus || "*"}|${ugylet || "*"}`] = new Date().toISOString();
    await irKulcs(KESZ_KULCS, v);
}

async function keszIdok() {
    return (await olvasKulcs(KESZ_KULCS).catch(() => null)) || {};
}

// Mely oldalak ugyanezen listáját (város + típus + ügylet) olvastuk közvetlenül az elmúlt
// 36 órában -> Set("olx", "storia")
async function frissKozvetlen(varos, tipus, ugylet) {
    const b = await olvas();
    const v = await keszIdok();
    const ki = new Set();
    const friss = t => t && Date.now() - new Date(t).getTime() < FRISS_ORA * 3600 * 1000;
    b.kozvetlen.forEach(f => {
        if (friss(v[`${f}|${varos}|${tipus || "*"}|${ugylet || "*"}`])) ki.add(f);
    });
    return ki;
}

// Egy forrás + város legutóbbi sikeres közvetlen olvasása (bármelyik listája) – a kijelzéshez
function utolsoIdo(idok, forras, varos) {
    return Object.entries(idok || {}).filter(([k]) => k.startsWith(`${forras}|${varos}|`) || k === `${forras}|${varos}`)
        .map(([, t]) => t).sort().pop() || null;
}

// ---------- A fő link a sorrend szerint (a meglévő hirdetéseken) ----------

//  opts.ids: csak ezek a hirdetések; opts.varosok: csak ezekben a városokban
//  -> az átírt hirdetések száma
async function alkalmaz(opts = {}) {
    const forrasHely = require("./forrasHely");
    const { normLink } = require("./listing");
    const { linkKulcsok } = require("./importer")._teszt;
    const { sorrend } = await olvas();

    const params = [];
    const felt = ["forras_tipus = 'import'", "owner_id IS NULL", "jsonb_typeof(tovabbi_linkek) = 'array'", "jsonb_array_length(tovabbi_linkek) > 0"];
    if (opts.ids && opts.ids.length) { params.push(opts.ids.map(Number)); felt.push(`id = ANY($${params.length}::int[])`); }
    if (opts.varosok && opts.varosok.length) { params.push(opts.varosok); felt.push(`(varos = ANY($${params.length}::text[]) OR varos_eredeti = ANY($${params.length}::text[]))`); }

    const r = await db.query(`SELECT id, link, tovabbi_linkek, kulso_azon FROM ingatlanok WHERE ${felt.join(" AND ")}`, params);
    let n = 0;
    for (const i of r.rows) {
        const minden = [i.link, ...(i.tovabbi_linkek || [])].filter(Boolean);
        const kozvetlen = minden.filter(forrasHely.kozvetlenHirdetes);
        if (!kozvetlen.length) continue;
        const best = legjobb(kozvetlen, sorrend);
        if (!best || normLink(best) === normLink(i.link)) continue;
        const azon = new Set(Array.isArray(i.kulso_azon) ? i.kulso_azon : []);
        if (forrasHely.kozvetitoOldal(i.link)) linkKulcsok(i.link).forEach(k => azon.add(k));
        const tovabbi = [...new Set(minden.filter(l => normLink(l) !== normLink(best) && !forrasHely.kozvetitoOldal(l)))];
        await db.query(
            `UPDATE ingatlanok SET link = $2, tovabbi_linkek = $3::jsonb, kulso_azon = $4::jsonb, forras_nev = $5,
                    kozvetito = NULL, forras_kereso = NULL, updated_at = NOW() WHERE id = $1`,
            [i.id, best, JSON.stringify(tovabbi), JSON.stringify([...azon]), forrasHely.forrasKulcs(null, best)]
        ).catch(e => console.error("Forrás-sorrend:", e.message));
        n++;
    }
    return n;
}

module.exports = { olvas, ment, legjobb, oldal, alkalmaz, keszJelol, keszIdok, frissKozvetlen, utolsoIdo, OLDALAK, KOZVETLEN_LEHET, FRISS_ORA };
