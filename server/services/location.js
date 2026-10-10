// ============================================================
//  Hely-ellenőrzés és helymeghatározás
//
//  A hirdetők gyakran rossz helyet adnak meg (a pont a városon kívül, a
//  város közepén – sok oldal ezt teszi, ha a hirdető nem jelölt helyet –,
//  az iroda helyén, vagy egyszerűen a város másik végén), a hasonló nevű
//  falvak pedig könnyen rossz megyébe kerülnek. Ezért:
//
//   1) Minden városnak van közepe és mérete (varosok tábla). Ami ennél
//      messzebb van, az gyanús.
//   2) A címben / leírásban említett utcát (házszámmal is) a városon belül
//      megkeressük – az utca ÖSSZES szakaszát, így tudjuk, milyen messze van
//      tőle a pont. Ha a pont 350 m-nél messzebb van az utcától, az utca
//      nyer: közel lévő pontot az utcára igazítunk, a messzit az utca közepére
//      (ha a szöveg kerületet is mond, az utcának arra a részére) tesszük.
//   3) A szöveg szerinti kerület ("zona Gării", "cartierul Simeria", a cím, a
//      forrásoldal kerület-mezője): ha legalább két jel ugyanazt a kerületet
//      mondja, és a forrásoldal pontja minden említett kerülettől messze
//      (700 m+) van, a pont a kerület közepére kerül (közelítő helyként).
//   4) Falut (Uzon, Kökös...) csak a város ~45 km-es körzetében keresünk,
//      és a legközelebbi azonos nevűt vesszük.
//   5) Ha semmi nem jó: kerület / környék szerinti közelítő hely, végül
//      "nincs megadva pontos hely". A forrás eredeti pontja megmarad
//      (hely_eredeti), az admin látja és visszateheti (Admin → Hely-ellenőrzés).
//
//  Amit ember tett le a térképen (hely_kezi), azt nem mozgatjuk.
// ============================================================

const db = require("../db/database");
const geo = require("./geocode");
const textParse = require("./textParse");
const districts = require("./districts");
const helySzoveg = require("./helySzoveg");
const Telepulesek = require("../../public/js/core/telepulesek");

const KORNYEK_KM = 45;          // a falvakat a város ennyi km-es körzetében keressük
const FALU_SUGAR_KM = 4;        // egy falu "mérete"
const UTCA_TUR_M = 350;         // ennyire lehet a pont a leírásban említett utcától
const UTCA_KOZEL_M = 800;       // ennél közelebbi pontot az utca legközelebbi pontjára igazítunk
const KERULET_TAV_M = 700;      // a szöveg szerinti kerülettől ennyire messze lévő pont gyanús
const UTCA_KERULETBEN_M = 300;  // az utca melyik része esik a kerületbe (ennyire a határtól)

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

    // "<város> és környéke": a falvakat az anyaváros körül keressük
    // (a saját neve – pl. "Sepsiszentgyörgy és környéke" – nem található a térképen)
    if (!(v.x && v.y)) {
        const k = await require("./kornyek").helyAdat(varos).catch(() => null);
        if (k && k.x && k.y) return { ...v, ...k, kornyek: true };
    }

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

// ---------- a város kerületei (nevek + határok) ----------

async function keruletAdatok(varos) {
    if (!varos) return [];
    try {
        return await districts.varosKeruletei(varos);
    } catch (e) {
        return [];
    }
}

// A pont távolsága egy kerület határától, méterben (0 = benne van)
function keruletTav(k, x, y) {
    if (!k || !Array.isArray(k.hatar) || k.hatar.length < 3) return null;
    return districts.bennVan(x, y, k.hatar) ? 0 : districts.szeltav(x, y, k.hatar);
}

// Van-e kerülete a hirdetés típusának (lakás, üzlet, iroda)
function keruletesTipus(tipus) {
    const { TIPUS_MEZOK } = require("./listing");
    return !!(TIPUS_MEZOK[tipus || "lakas"] || TIPUS_MEZOK.lakas).kerulet;
}

// ---------- keresések a város körül ----------

// Utcanév egységesítése: "Kós Károly utca" -> "Kós Károly", "Str. Gării" -> "Strada Gării"
function utcaNev(s) {
    let t = String(s || "").trim().replace(/[.,;]+$/, "");
    t = t.replace(/\s+(utca|út|útja|tér)$/i, "");
    t = t.replace(/^(str\.?|strada)\s+/i, "Strada ");
    return t;
}

// Egy (szövegből kinyert vagy beírt) utca a kereséshez: típus, név, házszám
function utcaObjektum(utca) {
    if (!utca) return null;
    if (typeof utca === "object") return utca;
    const s = String(utca).trim();
    if (s.length < 3) return null;
    const talalt = helySzoveg.utcak(s, "cim")[0];
    if (talalt) return talalt;
    // Típus nélkül ("Kós Károly 12", "Viitorului"): az egész egy utcanév, a végén házszám lehet
    const m = s.match(/^(.*?)(?:,?\s+(?:nr\.?\s*)?(\d{1,4}[A-Za-z]?))?$/);
    const alap = (m && m[1] ? m[1] : s).replace(/[.,;]+$/, "").trim();
    if (alap.length < 3) return null;
    return { nev: alap, tipus: "Strada", alap, hazszam: m && m[2] ? m[2] : null, hol: "kereso", kozeli: false, tipusNelkul: true };
}

//  Utca keresése a városban (vagy egy faluban)
//   utca: szöveg ("Strada Viitorului 12") vagy a helySzoveg.utcak() egy eleme
//   opts.telepules: a falu (román név) – ilyenkor a faluban keresünk
//  -> { x, y, szint: "pontos" | "utca", nev, vonalak, hosszKm } vagy null
async function utcaKeres(varos, utca, opts = {}) {

    const u = utcaObjektum(utca);
    if (!u) return null;

    let kozep, sugarKm, varosRo, megye;

    if (opts.telepules) {
        const f = await telepulesKeres(varos, opts.telepules);
        if (!f) return null;
        const tt = Telepulesek.keres(opts.telepules);
        kozep = [f.x, f.y];
        sugarKm = FALU_SUGAR_KM;
        varosRo = tt ? tt.ro : opts.telepules;
        megye = f.megye || null;
    } else {
        const v = await varosAdat(varos);
        if (!v || v.kornyek) return null;
        kozep = [v.x, v.y];
        sugarKm = (v.sugar_km || 6) + 2;
        varosRo = v.nev_ro;
        megye = v.megye || null;
    }

    // Névváltozatok: a megadott alak, más típussal (a térképen gyakran "Strada" az,
    // amit a hirdetés "Aleea"-nak / "Bulevardul"-nak ír), magyarul írt névnél a román is
    const nevek = helySzoveg.keresoNevek(u);
    const alap = u.alap || u.nev;
    ["Strada", "Aleea", "Bulevardul"].forEach(t => { if (t !== u.tipus) nevek.push(`${t} ${alap}`); });
    if (u.tipusNelkul) nevek.unshift(`Strada ${alap}`);

    const r = await geo.utca([...new Set(nevek)].slice(0, 3), { varosRo, megye, kozep, sugarKm, hazszam: u.hazszam || null, alap });

    if (!r || !(r.vonalak.length || r.haz)) return null;

    const p = r.haz || r.kozep;

    return {
        x: p.x, y: p.y,
        szint: r.haz ? "pontos" : "utca",
        nev: r.nev || u.nev,
        hazszam: r.haz ? u.hazszam : null,
        vonalak: r.vonalak,
        haz: r.haz,
        hosszKm: r.hosszKm,
        kozepPont: r.kozep
    };

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

// Az utca melyik pontja legyen a hely:
//  - ha a szöveg kerületet is mond, és az utca átmegy rajta: az utca kerületbeli részének közepe
//  - ha az utca (azonos név) több, egymástól távoli helyen is van: a kerülethez / a városközéphez közelebbi
//  - különben az utca közepe
function utcaHelye(r, kerulet, varosKozep) {

    if (r.haz) return { x: r.haz.x, y: r.haz.y, szint: "pontos" };

    let vonalak = r.vonalak;
    const csop = geo.csoportok(vonalak);

    if (csop.length > 1) {
        const tav = g => kerulet && kerulet.hatar
            ? Math.min(...g.flat().map(p => keruletTav(kerulet, p[0], p[1])))
            : (varosKozep ? Math.min(...g.flat().map(p => geo.km(varosKozep[0], varosKozep[1], p[0], p[1]))) : 0);
        vonalak = csop.sort((a, b) => tav(a) - tav(b))[0];
    }

    if (kerulet && Array.isArray(kerulet.hatar) && kerulet.hatar.length >= 3) {
        const bent = vonalak.filter(v => v.some(p => keruletTav(kerulet, p[0], p[1]) <= UTCA_KERULETBEN_M));
        if (bent.length) {
            // A kerületbe eső szakaszok pontjai; ha egy szakasz kilóg, csak a bent lévő pontjai
            const pontok = bent.map(v => v.filter(p => keruletTav(kerulet, p[0], p[1]) <= UTCA_KERULETBEN_M)).filter(v => v.length);
            const k = geo.vonalKozep(pontok.length ? pontok : bent);
            if (k) return { x: k.x, y: k.y, szint: "utca", keruletben: true };
        }
    }

    const k = geo.vonalKozep(vonalak) || r.kozepPont || { x: r.x, y: r.y };
    return { x: k.x, y: k.y, szint: "utca" };

}

// A hirdetés szövegrészei (a cím erősebb, mint a leírás)
function reszek(d, szoveg) {
    const van = d && (d.cim || d.leiras || d.forras_szoveg);
    return van
        ? { cim: d.cim || "", leiras: d.leiras || "", forras_szoveg: d.forras_szoveg || "" }
        : { cim: "", leiras: szoveg || "", forras_szoveg: "" };
}

// A hirdetés utcái (a forrásoldal külön utca-mezője előre)
function hirdetesUtcai(d, szoveg, extra = {}) {
    const lista = helySzoveg.hirdetesUtcai(reszek(d, szoveg), 4);
    const kulso = extra.utca ? utcaObjektum(extra.utca) : null;
    if (kulso) {
        const k = helySzoveg.utcaKulcs(kulso.alap || kulso.nev);
        const masik = lista.filter(u => helySzoveg.utcaKulcs(u.alap) !== k);
        return [{ ...kulso, hol: "forras_mezo", kozeli: false }, ...masik];
    }
    return lista;
}

// Szabad szöveges keresés a térképi keresőmezőhöz: utca (házszámmal), kerület,
// falu, város – vagy bármi a város körül; ha a környéken nincs, az országban
//  -> [{ x, y, nev, szint, telepules, tavolKm, sugar, vonalak }]
async function szabadKeres(varos, szoveg) {

    const q = String(szoveg || "").trim().replace(/\s+/g, " ");
    if (q.length < 3) return [];

    const v = await varosAdat(varos);
    const ki = [];
    const tav = (x, y) => v ? Math.round(geo.km(v.x, v.y, x, y) * 10) / 10 : null;
    const kQ = helySzoveg.kulcs(q);

    // A beírtban egy falu vagy város neve is lehet ("Kós Károly 5, Uzon", "Brassó")
    const reszLista = q.split(",").map(s => s.trim()).filter(Boolean);
    let telepules = null;
    let utcaResz = q;

    if (reszLista.length > 1) {
        const utolso = reszLista[reszLista.length - 1];
        const tt = Telepulesek.keres(utolso);
        if (tt) { telepules = tt.ro; utcaResz = reszLista.slice(0, -1).join(", "); }
        else if (v && [v.nev, v.nev_ro].filter(Boolean).some(n => helySzoveg.kulcs(n) === helySzoveg.kulcs(utolso))) utcaResz = reszLista.slice(0, -1).join(", ");
    }

    // 1) A város kerületei (magyar / román név, más nevek)
    if (v && !v.kornyek) {
        const ker = await keruletAdatok(varos);
        const lista = helySzoveg.keruletLista(ker);
        const t = lista.find(k => k.kulcs === kQ) || (kQ.length >= 4 ? lista.find(k => k.kulcs.startsWith(kQ)) : null);
        if (t) {
            const k = ker.find(x => x.nev === t.nev);
            const c = k && k.hatar ? districts.kozep(k.hatar) : await keruletKozep(varos, t.nev);
            if (c) ki.push({ x: c.x, y: c.y, nev: t.nev, szint: "kerulet", sugar: k && k.hatar ? districts.sugar(k.hatar, c) : 600, tavolKm: tav(c.x, c.y) });
        }
    }

    // 2) Település (falu) vagy egy másik ismert város
    const tt = Telepulesek.keres(q);
    if (tt && !ki.length) {
        const f = await telepulesKeres(varos, tt.ro);
        if (f) ki.push({ x: f.x, y: f.y, nev: tt.hu && tt.hu !== tt.ro ? `${tt.ro} (${tt.hu})` : tt.ro, szint: "telepules", sugar: 1500, tavolKm: tav(f.x, f.y) });
    }

    const vs = await varosok();
    for (const c of vs.values()) {
        if (!c.x || !c.y || c.nev === varos) continue;
        if ([c.nev, c.nev_ro].filter(Boolean).some(n => helySzoveg.kulcs(n) === kQ)) {
            ki.push({ x: c.x, y: c.y, nev: c.nev_ro || c.nev, szint: "varos", sugar: 2500, tavolKm: tav(c.x, c.y) });
        }
    }

    // 3) Utca (házszámmal): a városban, vagy a megadott faluban
    if (!ki.some(k => k.szint === "telepules" || k.szint === "varos") || telepules) {
        const u = await utcaKeres(varos, utcaResz, telepules ? { telepules } : {});
        if (u) {
            const egyszerusit = vonal => vonal.filter((p, i) => i === 0 || i === vonal.length - 1 || i % 2 === 0);
            ki.unshift({
                x: u.x, y: u.y,
                nev: u.nev + (u.hazszam ? " " + u.hazszam : ""),
                szint: u.szint === "pontos" ? "haz" : "utca",
                telepules: telepules || null,
                tavolKm: tav(u.x, u.y),
                vonalak: (u.vonalak || []).slice(0, 40).map(egyszerusit)
            });
        }
    }

    // 4) Bármi a város körül (környék, intézmény, bolt...)
    if (ki.length < 5) {
        const lista = v
            ? await geo.keresLista(q, { kozep: [v.x, v.y], sugarKm: KORNYEK_KM, megye: v.megye })
            : await geo.keresLista(q, {});
        lista.slice(0, 6).forEach(t => {
            if (ki.some(k => geo.km(k.x, k.y, t.x, t.y) < 0.15)) return;
            ki.push({ x: t.x, y: t.y, nev: t.nev, szint: t.szint === "utca" ? "utca" : "hely", telepules: t.telepules, tavolKm: tav(t.x, t.y) });
        });
    }

    // 5) Ha a környéken semmi: az egész országban (pl. egy másik város) – jelezzük, hogy messze van
    if (!ki.length && v) {
        const lista = await geo.keresLista(q, {});
        lista.slice(0, 5).forEach(t => ki.push({ x: t.x, y: t.y, nev: t.nev, szint: t.szint === "utca" ? "utca" : "hely", telepules: t.telepules, tavolKm: tav(t.x, t.y), tavol: true }));
    }

    return ki.slice(0, 8);

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

// Az első talált (közvetlenül említett) utca a hirdetésből
async function elsoUtca(d, utcakLista, opts = {}) {
    for (const u of utcakLista.filter(x => !x.kozeli).slice(0, opts.max || 3)) {
        const r = await utcaKeres(d.varos, u, d.telepules ? { telepules: d.telepules } : {});
        if (r) return { u, r };
    }
    return null;
}

// A leírásból és a forrás adataiból a legjobb hely
//  d: a hirdetés (varos, telepules, kerulet, forras_kerulet, tipus, cim, leiras, forras_szoveg)
//  -> { x, y, szint, sugar, forras, nev, kerulet? } vagy null
async function helyKeres(d, szoveg, extra = {}) {

    if (!d.varos) return null;

    const v = await varosAdat(d.varos);
    const r = reszek(d, szoveg);
    const egeszSzoveg = [r.cim, r.leiras, r.forras_szoveg].filter(Boolean).join("\n") || szoveg || "";

    // A szöveg szerinti kerület (lakás, üzlet, iroda)
    const ker = keruletesTipus(d.tipus) && !(v && v.kornyek) ? await keruletAdatok(d.varos) : [];
    const allitott = ker.length ? helySzoveg.allitottKerulet({ ...r, forras_kerulet: d.forras_kerulet }, ker) : null;
    const keruletNev = allitott ? allitott.kerulet : (d.kerulet || null);
    const kerulet = ker.find(k => k.nev === keruletNev) || null;

    // 1) Utca a forrásból / a címből / a leírásból (a faluban a falu utcája; a
    //    környék-városban falu nélkül nem tudjuk, melyik település utcája)
    const utcakLista = hirdetesUtcai(d, szoveg, extra);

    if (!(v && v.kornyek && !d.telepules)) {

        const t = await elsoUtca(d, utcakLista);

        if (t) {
            const p = utcaHelye(t.r, kerulet, v ? [v.x, v.y] : null);
            return { x: p.x, y: p.y, szint: p.szint, sugar: 300, forras: "szoveg", nev: t.r.nev + (p.szint === "pontos" && t.u.hazszam ? " " + t.u.hazszam : ""), utca: true };
        }

    }

    // 2) Falu
    if (d.telepules) {
        const t = await telepulesKeres(d.varos, d.telepules);
        if (t) return { x: t.x, y: t.y, szint: "kozelito", sugar: 1500, forras: "telepules", nev: d.telepules };
    }

    // 3) Kerület: a megrajzolt határ közepe – ez pontosabb, mint a névre keresés
    //    (a "Centru" típusú nevekre a kereső a város közepét adja)
    if (keruletNev) {
        const h = await districts.keruletKozep(d.varos, keruletNev);
        if (h) return { x: h.x, y: h.y, szint: "kozelito", sugar: h.sugar, forras: "kerulet", nev: keruletNev, kerulet: keruletNev };
    }

    // A kerület román és magyar neve, a forrás szerinti környék, "zona X" a leírásból
    const kornyekek = [];

    if (keruletNev) {
        const k = ker.find(x => x.nev === keruletNev);
        if (k && k.nev_ro) kornyekek.push(k.nev_ro);
        else {
            const q = await db.query("SELECT nev_ro FROM keruletek WHERE varos = $1 AND nev = $2", [d.varos, keruletNev]);
            if (q.rows[0] && q.rows[0].nev_ro) kornyekek.push(q.rows[0].nev_ro);
        }
        kornyekek.push(keruletNev);
    }

    if (d.forras_kerulet) kornyekek.push(d.forras_kerulet);
    const tippek = textParse.helyTippek(egeszSzoveg);
    tippek.filter(t => t.szint === "kozelito" && !t.nevezetes).forEach(t => kornyekek.push(t.szoveg));

    for (const k of [...new Set(kornyekek)].slice(0, 3)) {
        const t = await kornyekKeres(d.varos, k);
        if (t && v && geo.km(v.x, v.y, t.x, t.y) > 0.2) {
            return { x: t.x, y: t.y, szint: "kozelito", sugar: 600, forras: "kerulet", nev: k };
        }
        // A kerület közepe a már jó helyű hirdetésekből
        if (keruletNev && k === keruletNev) {
            const c = await keruletKozep(d.varos, keruletNev);
            if (c) return { x: c.x, y: c.y, szint: "kozelito", sugar: 600, forras: "kerulet", nev: k, kerulet: keruletNev };
        }
    }

    // 4) Csak viszonyításként említett utca ("aproape de strada X", "la 2 minute de...")
    if (!(v && v.kornyek && !d.telepules)) {
        for (const u of utcakLista.filter(x => x.kozeli).slice(0, 2)) {
            const t = await utcaKeres(d.varos, u, d.telepules ? { telepules: d.telepules } : {});
            if (t) {
                const p = utcaHelye(t, kerulet, v ? [v.x, v.y] : null);
                return { x: p.x, y: p.y, szint: "kozelito", sugar: 450, forras: "szoveg", nev: t.nev };
            }
        }
    }

    // 5) Nevezetes hely a közelben ("lângă Kaufland", "a kórház mellett") – csak a
    //    városban, és csak ha ott egyértelmű (egy Kaufland van, nem több)
    if (!d.telepules && !(v && v.kornyek)) {
        for (const t of tippek.filter(x => x.nevezetes).slice(0, 2)) {
            const h = await nevezetesKeres(d.varos, t.szoveg);
            if (h) return { x: h.x, y: h.y, szint: "kozelito", sugar: 700, forras: "szoveg", nev: t.szoveg };
        }
    }

    return null;

}

// Nevezetes hely a város területén – ha több is van (pl. két Kaufland), nem
// tudjuk, melyikről van szó, ezért nem használjuk
async function nevezetesKeres(varos, nev) {
    const v = await varosAdat(varos);
    if (!v) return null;
    const lista = await geo.keresLista(nev, { kozep: [v.x, v.y], sugarKm: v.sugar_km + 1, varosRo: v.nev_ro, fajta: "kornyek" });
    if (!lista.length) return null;
    if (lista.length > 1 && geo.km(lista[0].x, lista[0].y, lista[1].x, lista[1].y) > 0.7) return null;
    return lista[0];
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

// Az "alapértelmezett" pont: legalább 4 másik hirdetés (a forrásoldal pontjával)
// pontosan ugyanitt van, és a pont a város közepén (600 m-en belül) van. Az
// áthelyezett hirdetések eredeti pontja is számít (különben a javítás közben fogyna).
async function alapertelmezettPont(i, v) {
    if (!v || geo.km(v.x, v.y, Number(i.x), Number(i.y)) > 0.6) return false;
    try {
        const r = await db.query(`
            SELECT COUNT(*)::int AS n FROM ingatlanok
            WHERE varos = $1 AND id <> $2 AND statusz IN ('aktiv', 'fuggo', 'nem_elerheto')
              AND (
                (abs(x - $3) < 0.00012 AND abs(y - $4) < 0.00009
                 AND COALESCE(hely_forras, 'forras') = 'forras' AND COALESCE(hely_pontossag, 'pontos') IN ('pontos', 'utca', 'kozelito'))
                OR (hely_eredeti IS NOT NULL AND abs((hely_eredeti->>'x')::float - $3) < 0.00012 AND abs((hely_eredeti->>'y')::float - $4) < 0.00009)
              )
        `, [i.varos, i.id || 0, Number(i.x), Number(i.y)]);
        return r.rows[0].n >= 4;
    } catch (e) {
        return false;
    }
}

//  A meglévő hely ellenőrzése (forrásoldal / korábbi automatika pontja).
//  -> üres objektum (rendben), vagy a módosítandó mezők:
//     x, y, hely_pontossag, hely_sugar, hely_forras, hely_eredeti, hely_ok (+ kerulet)
//  hely_ok: varostol_tavol | falutol_tavol | utca_eltero | kerulet_eltero | pontosabb
async function ellenoriz(i, szoveg, extra = {}) {

    if (!(i.x && i.y) || i.hely_kezi || !i.varos) return {};

    // Amit ember tett le (hirdetésfeladáskor a térképen), azt nem mozgatjuk
    if (i.hely_forras === "kezi") return {};

    const v = await varosAdat(i.varos);
    if (!v) return {};

    const x = Number(i.x), y = Number(i.y);
    const pontossag = i.hely_pontossag || "pontos";
    const r = reszek(i, szoveg);

    const falu = i.telepules ? await telepulesKeres(i.varos, i.telepules) : null;
    const tavol = await helyTavol(i, falu);

    let ok = tavol ? (tavol.hova === "telepules" ? "falutol_tavol" : "varostol_tavol") : null;
    let uj = null;
    let km = tavol ? tavol.km : null;

    // A szöveg szerinti kerület (lakás, üzlet, iroda; a megrajzolt határokkal)
    const ker = keruletesTipus(i.tipus) && !v.kornyek ? await keruletAdatok(i.varos) : [];
    const vanHatar = ker.some(k => Array.isArray(k.hatar) && k.hatar.length >= 3);
    const allitott = ker.length ? helySzoveg.allitottKerulet({ ...r, forras_kerulet: i.forras_kerulet }, ker) : null;
    const allitottK = allitott ? ker.find(k => k.nev === allitott.kerulet) : null;

    // ---- 1) Utca a szövegben: messze van tőle a pont?
    let utcaTalalt = false;

    if (!ok && !(v.kornyek && !i.telepules)) {

        const utcakLista = hirdetesUtcai(i, szoveg, extra).filter(u => !u.kozeli).slice(0, 2);
        const talalt = [];

        for (const u of utcakLista) {
            const t = await utcaKeres(i.varos, u, i.telepules ? { telepules: i.telepules } : {});
            if (t) talalt.push({ u, t });
        }

        if (talalt.length) {

            utcaTalalt = true;

            const tur = pontossag === "kozelito" ? Math.max(UTCA_TUR_M, (Number(i.hely_sugar) || 500) + 150) : UTCA_TUR_M;
            const tavok = talalt.map(({ t }) => Math.min(geo.utcaTav(x, y, t.vonalak), t.haz ? geo.km(x, y, t.haz.x, t.haz.y) * 1000 : Infinity));
            const dmin = Math.min(...tavok);
            const legjobb = talalt[tavok.indexOf(dmin)];

            if (dmin <= tur) {

                // A pont az említett utcán van. Ha csak a kerület / falu közepén volt
                // (közelítő hely, a korábbi automatikától), most már az utcán lehet
                if (pontossag === "kozelito" && ["kerulet", "telepules"].includes(i.hely_forras)) {
                    const p = utcaHelye(legjobb.t, allitottK, [v.x, v.y]);
                    ok = "pontosabb";
                    uj = { x: p.x, y: p.y, szint: p.szint, sugar: null, forras: "szoveg", nev: legjobb.t.nev };
                } else {
                    return {};
                }

            } else {

                ok = "utca_eltero";
                km = Math.round(dmin / 100) / 10;

                // Közel van (pl. a hirdető pár háznyival odébb jelölt): az utca legközelebbi
                // pontjára; messze (pl. a város közepén): az utca közepére / kerületbeli részére
                const elso = talalt[0];
                if (dmin <= UTCA_KOZEL_M && !legjobb.t.haz) {
                    const p = geo.utcaPont(x, y, legjobb.t.vonalak);
                    uj = { x: p.x, y: p.y, szint: "utca", sugar: null, forras: "szoveg", nev: legjobb.t.nev };
                } else {
                    const p = utcaHelye(elso.t, allitottK, [v.x, v.y]);
                    uj = { x: p.x, y: p.y, szint: p.szint, sugar: null, forras: "szoveg", nev: elso.t.nev };
                }

            }

        }

    }

    // A forrásoldal "alapértelmezett" pontja: sok hirdetés pontosan ugyanott, a város
    // közepén (pl. ha a hirdető nem jelölt helyet, az oldal a város közepét adja meg)
    const forrasPont = ["pontos", "utca"].includes(pontossag) && (!i.hely_forras || i.hely_forras === "forras");
    const alapPont = forrasPont && !ok && !utcaTalalt ? await alapertelmezettPont(i, v) : false;

    // ---- 2) Kerület: a forrásoldal pontja minden említett kerülettől messze van,
    //         és legalább két jel ugyanazt a kerületet mondja (az alapértelmezett
    //         pontnál elég egy jel, ha a pont nincs a kerületben)
    if (!ok && !utcaTalalt && vanHatar && forrasPont) {

        const jelek = helySzoveg.keruletJelek({ ...r, forras_kerulet: i.forras_kerulet }, ker);
        const emlitett = [...new Set(jelek.map(j => j.kerulet))].map(n => ker.find(k => k.nev === n)).filter(Boolean);
        const merheto = emlitett.filter(k => Array.isArray(k.hatar) && k.hatar.length >= 3);

        // Ha valamelyik említett kerülethez nincs határ, nem tudjuk, hogy ott van-e – marad
        if (merheto.length && merheto.length === emlitett.length) {

            const tavok = merheto.map(k => keruletTav(k, x, y));
            const legkozelebb = Math.min(...tavok);

            if (legkozelebb >= KERULET_TAV_M || (alapPont && legkozelebb > 0)) {

                // A cél: amit legalább két jel mond (cím + forrás, leírás + forrás, cím + leírás);
                // az alapértelmezett pontnál a legerősebb jel is elég
                const szamlalo = new Map();
                jelek.forEach(j => {
                    if (!szamlalo.has(j.kerulet)) szamlalo.set(j.kerulet, new Set());
                    szamlalo.get(j.kerulet).add(j.honnan);
                });
                let cel = [...szamlalo.entries()].filter(([, h]) => h.size >= 2).map(([n]) => n);
                if (!cel.length && alapPont && allitott && merheto.some(k => k.nev === allitott.kerulet)) cel = [allitott.kerulet];

                if (cel.length === 1) {
                    const h = await districts.keruletKozep(i.varos, cel[0]);
                    if (h) {
                        ok = "kerulet_eltero";
                        km = Math.round(legkozelebb / 100) / 10;
                        uj = { x: h.x, y: h.y, szint: "kozelito", sugar: h.sugar, forras: "kerulet", nev: cel[0], kerulet: cel[0] };
                    }
                }

            }

        }

    }

    // ---- 3) Az alapértelmezett pont, és semmi nem mondja meg, hol van: nem állítjuk,
    //         hogy pontos – közelítő hely lesz ugyanott (a térképen kör)
    if (!ok && alapPont) {
        ok = "alappont";
        uj = { x, y, szint: "kozelito", sugar: 700, forras: "forras" };
    }

    if (!ok) return {};

    // Jobb hely: az utca / a kerület (ha az volt az ok), különben a szöveg / falu / kerület alapján
    if (!uj) uj = await helyKeres({ ...i, x: null, y: null }, szoveg, extra);

    // A falunál a forrás "falutól távol" pontja helyett a falu
    if (!uj && falu) uj = { x: falu.x, y: falu.y, szint: "kozelito", sugar: 1500, forras: "telepules" };

    const eredeti = { x: i.x, y: i.y, pontossag: i.hely_pontossag || "pontos", ok, km };
    if (uj && uj.nev) eredeti.nev = uj.nev;

    if (uj) {
        const ki = {
            x: uj.x, y: uj.y,
            hely_pontossag: uj.szint,
            hely_sugar: uj.szint === "kozelito" ? uj.sugar : null,
            hely_forras: uj.forras,
            hely_eredeti: eredeti,
            hely_ok: ok
        };
        if (uj.kerulet && ker.some(k => k.nev === uj.kerulet)) {
            ki.kerulet = uj.kerulet;
            // A korábbi kerület is megmarad (az admin visszateheti)
            if (uj.kerulet !== i.kerulet) eredeti.kerulet = i.kerulet || "";
        }
        return ki;
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

module.exports = {
    varosAdat, varosok, cacheUrit, helyTavol, helyKeres, ellenoriz, utcaKeres, telepulesKeres, szabadKeres, utcaNev,
    utcaObjektum, utcaHelye, keruletAdatok, UTCA_TUR_M, KERULET_TAV_M
};
