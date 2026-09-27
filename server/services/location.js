// ============================================================
//  Hely-ellenőrzés
//
//  A hirdetők gyakran rossz helyet adnak meg (a pont a városon
//  kívül, egy másik városban, vagy az iroda helyén van), a hasonló
//  nevű falvak pedig könnyen rossz megyébe kerülnek. Ezért:
//
//   1) Minden városnak van közepe és mérete (varosok tábla). Ami
//      ennél messzebb van, az gyanús.
//   2) Ha a leírásban utca szerepel, azt a városon belül megkeressük.
//      Ha a forrás pontja messze van ettől az utcától, az utca nyer.
//   3) Falut (Uzon, Kökös...) csak a város ~45 km-es körzetében
//      keresünk, és a legközelebbi azonos nevűt vesszük.
//   4) Ha semmi nem jó: kerület / környék szerinti közelítő hely,
//      végül "nincs megadva pontos hely". A forrás eredeti pontja
//      megmarad (hely_eredeti), az admin látja és visszateheti.
//
//  Amit ember tett le a térképen (hely_kezi), azt nem mozgatjuk.
// ============================================================

const db = require("../db/database");
const geo = require("./geocode");
const textParse = require("./textParse");
const districts = require("./districts");
const Telepulesek = require("../../public/js/core/telepulesek");

const KORNYEK_KM = 45;          // a falvakat a város ennyi km-es körzetében keressük
const UTCA_TURES_KM = 2;        // ennyire lehet a pont a leírás szerinti utcától
const FALU_SUGAR_KM = 4;        // egy falu "mérete"

// ---------- városok adatai ----------

let varosCache = { ido: 0, adat: new Map() };

async function varosok() {

    if (Date.now() - varosCache.ido < 5 * 60 * 1000 && varosCache.adat.size) return varosCache.adat;

    const r = await db.query("SELECT id, nev, nev_ro, megye, x, y, sugar_km FROM varosok");
    const m = new Map();
    r.rows.forEach(v => m.set(v.nev, v));

    varosCache = { ido: Date.now(), adat: m };

    return m;

}

function cacheUrit() {
    varosCache = { ido: 0, adat: new Map() };
}

// A város adatai; ha még nincs közepe, megkeressük és elmentjük
async function varosAdat(varos) {

    if (!varos) return null;

    const m = await varosok();
    let v = m.get(varos);

    if (!v) return null;

    if (!(v.x && v.y)) {

        const nev = v.nev_ro || geo.VAROS_RO[varos] || varos;
        const t = await geo.keres(nev, { megye: v.megye, fajta: "telepules" });

        if (t) {
            await db.query(
                "UPDATE varosok SET x = $1, y = $2, megye = COALESCE(megye, $3), nev_ro = COALESCE(nev_ro, $4), sugar_km = COALESCE(sugar_km, 6) WHERE id = $5",
                [t.x, t.y, t.megye, nev, v.id]
            );
            v = { ...v, x: t.x, y: t.y, megye: v.megye || t.megye, nev_ro: v.nev_ro || nev, sugar_km: v.sugar_km || 6 };
            m.set(varos, v);
        }

    }

    return v.x && v.y ? { ...v, nev_ro: v.nev_ro || geo.VAROS_RO[varos] || varos, sugar_km: v.sugar_km || 6 } : null;

}

// ---------- keresések a város körül ----------

// Utcanév egységesítése: "Kós Károly utca" -> "Kós Károly", "Str. Gării" -> "Strada Gării"
function utcaNev(s) {
    let t = String(s || "").trim().replace(/[.,;]+$/, "");
    t = t.replace(/\s+(utca|út|útja|tér)$/i, "");
    t = t.replace(/^(str\.?|strada)\s+/i, "Strada ");
    return t;
}

async function utcaKeres(varos, utca) {
    const v = await varosAdat(varos);
    if (!v) return null;
    const nev = utcaNev(utca);
    const t = await geo.keres(nev, { kozep: [v.x, v.y], sugarKm: v.sugar_km + 2, varosRo: v.nev_ro, fajta: "utca" });
    if (!t) return null;
    // Az utcakeresés néha csak a várost adja vissza – az nem utca
    if (t.szint !== "utca" && geo.km(v.x, v.y, t.x, t.y) < 0.3) return null;
    return t;
}

async function telepulesKeres(varos, telepules) {
    const v = await varosAdat(varos);
    const tt = Telepulesek.keres(telepules);
    const nev = tt ? tt.ro : telepules;
    if (!v) return geo.keres(nev, { fajta: "telepules" });
    return geo.keres(nev, { kozep: [v.x, v.y], sugarKm: KORNYEK_KM, megye: v.megye, fajta: "telepules" });
}

async function kornyekKeres(varos, nev) {
    const v = await varosAdat(varos);
    if (!v) return null;
    return geo.keres(nev, { kozep: [v.x, v.y], sugarKm: v.sugar_km + 1, varosRo: v.nev_ro, fajta: "kornyek" });
}

// Szabad szöveges keresés a térképi keresőmezőhöz: utca, környék vagy falu
async function szabadKeres(varos, szoveg) {

    const v = await varosAdat(varos);
    if (!v) return geo.keresLista(szoveg, {});

    const utca = await geo.keresLista(utcaNev(szoveg), { kozep: [v.x, v.y], sugarKm: v.sugar_km + 2, varosRo: v.nev_ro, fajta: "utca" });
    if (utca.length) return utca.slice(0, 5);

    return (await geo.keresLista(szoveg, { kozep: [v.x, v.y], sugarKm: KORNYEK_KM, megye: v.megye })).slice(0, 5);

}

// ---------- ellenőrzés ----------

// Messze van-e a pont attól, ahol lennie kellene?
//  -> false (rendben), vagy { km, hova } (ennyire van a várostól / falutól)
async function helyTavol(d, falu) {

    if (!(d.x && d.y) || !d.varos) return false;

    const v = await varosAdat(d.varos);
    if (!v) return false;

    const varosKm = geo.km(v.x, v.y, d.x, d.y);

    // Faluban van: a falutól mérünk
    if (d.telepules) {
        const f = falu !== undefined ? falu : await telepulesKeres(d.varos, d.telepules);
        if (f) {
            const faluKm = geo.km(f.x, f.y, d.x, d.y);
            return faluKm > FALU_SUGAR_KM ? { km: Math.round(faluKm * 10) / 10, hova: "telepules" } : false;
        }
    }

    // Ház, telek lehet a városon kívül is (a környékén)
    const kulso = ["haz", "telek"].includes(d.tipus || "lakas");
    const hatar = kulso ? KORNYEK_KM : v.sugar_km + 2;

    return varosKm > hatar ? { km: Math.round(varosKm * 10) / 10, hova: "varos" } : false;

}

// A leírásból és a forrás adataiból a legjobb hely
//  d: a hirdetés (varos, telepules, kerulet, forras_kerulet, tipus)
//  -> { x, y, szint, sugar, forras } vagy null
async function helyKeres(d, szoveg, extra = {}) {

    if (!d.varos) return null;

    const v = await varosAdat(d.varos);

    // 1) Utca a forrásból / a leírásból (csak ha nem faluban van)
    if (!d.telepules) {

        const utcak = [];
        if (extra.utca) utcak.push(extra.utca);
        textParse.helyTippek(szoveg).filter(t => t.szint === "utca").forEach(t => utcak.push(t.szoveg));

        for (const u of [...new Set(utcak)].slice(0, 3)) {
            const t = await utcaKeres(d.varos, u);
            if (t) return { x: t.x, y: t.y, szint: t.szint === "utca" ? "utca" : "kozelito", sugar: 300, forras: "szoveg", nev: u };
        }

    }

    // 2) Falu
    if (d.telepules) {
        const t = await telepulesKeres(d.varos, d.telepules);
        if (t) return { x: t.x, y: t.y, szint: "kozelito", sugar: 1500, forras: "telepules", nev: d.telepules };
    }

    // 3) Kerület (román és magyar név), a forrás szerinti környék, "zona X" a leírásból
    const kornyekek = [];

    if (d.kerulet) {
        const r = await db.query("SELECT nev_ro FROM keruletek WHERE varos = $1 AND nev = $2", [d.varos, d.kerulet]);
        if (r.rows[0] && r.rows[0].nev_ro) kornyekek.push(r.rows[0].nev_ro);
        kornyekek.push(d.kerulet);
    }

    if (d.forras_kerulet) kornyekek.push(d.forras_kerulet);
    textParse.helyTippek(szoveg).filter(t => t.szint === "kozelito").forEach(t => kornyekek.push(t.szoveg));

    // A megrajzolt kerülethatár közepe – ez pontosabb, mint a névre keresés
    // (a "Centru" típusú nevekre a kereső a város közepét adja)
    if (d.kerulet) {
        const h = await districts.keruletKozep(d.varos, d.kerulet);
        if (h) return { x: h.x, y: h.y, szint: "kozelito", sugar: h.sugar, forras: "kerulet", nev: d.kerulet };
    }

    for (const k of [...new Set(kornyekek)].slice(0, 3)) {
        const t = await kornyekKeres(d.varos, k);
        if (t && v && geo.km(v.x, v.y, t.x, t.y) > 0.2) {
            return { x: t.x, y: t.y, szint: "kozelito", sugar: 600, forras: "kerulet", nev: k };
        }
        // A kerület közepe a már jó helyű hirdetésekből
        if (d.kerulet && k === d.kerulet) {
            const c = await keruletKozep(d.varos, d.kerulet);
            if (c) return { x: c.x, y: c.y, szint: "kozelito", sugar: 600, forras: "kerulet", nev: k };
        }
    }

    return null;

}

// Egy kerület "közepe": a pontos helyű hirdetések átlaga
async function keruletKozep(varos, kerulet) {
    const r = await db.query(`
        SELECT AVG(x) AS x, AVG(y) AS y, COUNT(*)::int AS n FROM ingatlanok
        WHERE varos = $1 AND kerulet = $2 AND x IS NOT NULL AND y IS NOT NULL
          AND COALESCE(hely_pontossag, 'pontos') IN ('pontos', 'utca')
          AND COALESCE(hely_forras, 'forras') <> 'kerulet'
    `, [varos, kerulet]);
    const k = r.rows[0];
    return k && k.n >= 3 ? { x: Number(k.x), y: Number(k.y) } : null;
}

//  A meglévő hely ellenőrzése (forrásoldal / régi automatika pontja).
//  -> üres objektum (rendben), vagy a módosítandó mezők:
//     x, y, hely_pontossag, hely_sugar, hely_forras, hely_eredeti, hely_ok
async function ellenoriz(i, szoveg, extra = {}) {

    if (!(i.x && i.y) || i.hely_kezi || !i.varos) return {};

    const v = await varosAdat(i.varos);
    if (!v) return {};

    const falu = i.telepules ? await telepulesKeres(i.varos, i.telepules) : null;
    const tavol = await helyTavol(i, falu);

    let ok = tavol ? (tavol.hova === "telepules" ? "falutol_tavol" : "varostol_tavol") : null;
    let uj = null;

    // Utca a leírásban: messze van tőle a pont?
    if (!ok && !i.telepules && ["pontos", null, undefined, ""].includes(i.hely_pontossag)) {

        const utcak = [];
        if (extra.utca) utcak.push(extra.utca);
        textParse.helyTippek(szoveg).filter(t => t.szint === "utca").forEach(t => utcak.push(t.szoveg));

        for (const u of [...new Set(utcak)].slice(0, 2)) {
            const t = await utcaKeres(i.varos, u);
            if (!t) continue;
            const d = geo.km(t.x, t.y, i.x, i.y);
            if (d <= UTCA_TURES_KM) { ok = null; uj = null; break; }     // egyezik egy említett utcával
            ok = "utca_eltero";
            uj = { x: t.x, y: t.y, szint: t.szint === "utca" ? "utca" : "kozelito", sugar: 300, forras: "szoveg", nev: u };
        }

    }

    if (!ok) return {};

    // Jobb hely: az utca (ha az volt az ok), különben a szöveg / falu / kerület alapján
    if (!uj) uj = await helyKeres({ ...i }, szoveg, extra);

    // A falunál a forrás "falutól távol" pontja helyett a falu
    if (!uj && falu) uj = { x: falu.x, y: falu.y, szint: "kozelito", sugar: 1500, forras: "telepules" };

    const eredeti = { x: i.x, y: i.y, pontossag: i.hely_pontossag || "pontos", ok, km: tavol ? tavol.km : null };

    if (uj) {
        return {
            x: uj.x, y: uj.y,
            hely_pontossag: uj.szint,
            hely_sugar: uj.szint === "kozelito" ? uj.sugar : null,
            hely_forras: uj.forras,
            hely_eredeti: eredeti,
            hely_ok: ok
        };
    }

    return {
        x: null, y: null,
        hely_pontossag: "nincs",
        hely_sugar: null,
        hely_forras: null,
        hely_eredeti: eredeti,
        hely_ok: ok
    };

}

module.exports = { varosAdat, varosok, cacheUrit, helyTavol, helyKeres, ellenoriz, utcaKeres, telepulesKeres, szabadKeres, utcaNev };
