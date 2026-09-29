// ============================================================
//  Ingatlan értékbecslő
//
//  Két módszer együtt:
//
//  1) Összehasonlító (a korábbi módszer, javítva): a leghasonlóbb
//     hirdetések €/m² ára – DE minden hasonló hirdetés árát átszámoljuk a
//     keresett ingatlanra (méret, állapot, kerület, emelet különbsége
//     szerinti arányokkal), ahogy egy ingatlanértékelő is teszi.
//
//  2) Árarány-modell (hedonikus): az egész város adataiból megtanuljuk,
//     mennyivel ér többet / kevesebbet pl. egy jó állapotú lakás a
//     felújítandónál, egy földszinti a többinél, egy kerület a város
//     átlagánál, és hogyan változik a €/m² a mérettel. Ahol kevés az adat
//     (pl. kevés hirdetés egy kerületben), ott a józan piaci arányok felé
//     húzzuk (előzetes arányok) – így nem ugrik el egy-két hirdetés miatt.
//
//  A végső becslés a kettő súlyozott keveréke: ha sok nagyon hasonló
//  hirdetés van, az összehasonlító dominál (ott eddig is pontos volt);
//  ha kevés, a modell egyre nagyobb súlyt kap.
//
//  A /api/admin/ertekbecslo-teszt a valós adatokon méri a pontosságot
//  (minden hirdetést a többi alapján becsül meg, és összeveti a régi
//  módszerrel) – így ellenőrizhető, hogy a becslő pontosabb lett.
// ============================================================

const db = require("../db/database");

// ---------- Állapot, emelet ----------

// Fél lépések: a "közepes" a felújítandó és a részben felújított között van
const ALLAPOT_RANG = {
    "felújítandó": 0,
    "közepes": 0.5,
    "átlagos": 0.5,
    "részbenfel": 1,
    "részben felújított": 1,
    "jó": 2,
    "újszerű": 3,
    "új": 3,
    "luxus": 4
};

function allapotRang(a) {
    const kulcs = String(a || "").toLowerCase().replace(/\*/g, "").trim();
    return ALLAPOT_RANG[kulcs] !== undefined ? ALLAPOT_RANG[kulcs] : null;
}

// Egységes állapot-kulcs a modellhez
function allapotKulcs(a) {
    const r = allapotRang(a);
    if (r === null) return null;
    return { 0: "felujitando", 0.5: "kozepes", 1: "reszben", 2: "jo", 3: "ujszeru", 4: "luxus" }[r];
}

function emeletSzam(e) {
    const n = parseInt(String(e || "").split("/")[0], 10);
    return isNaN(n) ? null : n;
}

function emeletOssz(e) {
    const n = parseInt(String(e || "").split("/")[1], 10);
    return isNaN(n) ? null : n;
}

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function atlag(list) {
    return list.length ? list.reduce((s, x) => s + x, 0) / list.length : 0;
}

function median(list) {
    if (!list.length) return 0;
    const s = [...list].sort((a, b) => a - b);
    return percentile(s, 0.5);
}

// Két ingatlan "távolsága": minél kisebb, annál hasonlóbb
function tavolsag(cel, i) {

    let d = 0;

    // Alapterület: 20% eltérés = 0.4
    d += Math.abs(cel.nm - i.nm) / cel.nm * 2;

    if (cel.szobak) {
        d += Math.abs(cel.szobak - (i.szobak || 0)) * 0.5;
    }

    if (cel.kerulet) {
        d += (i.kerulet || "") === cel.kerulet ? 0 : 1;
    }

    if (cel.allapotRang !== null) {
        const r = allapotRang(i.allapot);
        d += r === null ? 0.5 : Math.abs(cel.allapotRang - r) * 0.6;
    }

    if (cel.emelet !== null) {
        const e = emeletSzam(i.emelet);
        if (e === null) d += 0.2;
        else d += Math.min(Math.abs(cel.emelet - e), 3) * 0.1;
    }

    return d;

}

// ---------- Adatok ----------

async function adatok(varos, tipus, ugylet) {
    const r = await db.query(`
        SELECT id, link, ar, nm, szobak, emelet, allapot, kerulet, eladva, telepules, telek_jelleg, telek_nm, evszam
        FROM ingatlanok
        WHERE varos = $1 AND ar > 0 AND nm > 0
          AND statusz = 'aktiv' AND ellenorzott
          AND COALESCE(tipus, 'lakas') = $2
          AND COALESCE(ugylet, 'elado') = $3
    `, [varos, tipus || "lakas", ugylet || "elado"]);
    return r.rows;
}

// Duplikált hirdetések (ugyanaz a link többször) csak egyszer; a becsült
// ingatlan saját magát (és a duplikált példányait) ne vegye hasonlónak
function tisztitPool(rows, kihagy) {

    const lattLinkek = new Set();

    if (kihagy) {
        const sajat = rows.find(i => i.id === kihagy);
        const sajatLink = sajat ? (sajat.link || "").split("?")[0].trim() : "";
        if (sajatLink) lattLinkek.add(sajatLink);
    }

    return rows
        .filter(i => i.id !== kihagy)
        .filter(i => {
            const link = (i.link || "").split("?")[0].trim();
            if (!link) return true;
            if (lattLinkek.has(link)) return false;
            lattLinkek.add(link);
            return true;
        })
        .map(i => ({ ...i, ar: Number(i.ar), nm: Number(i.nm), arNm: Number(i.ar) / Number(i.nm) }));

}

function celAdat(params) {
    const e = params.emelet !== undefined && params.emelet !== null && params.emelet !== "" ? Number(params.emelet) : null;
    return {
        nm: Number(params.nm),
        szobak: Number(params.szobak) || null,
        kerulet: String(params.kerulet || "").trim() || null,
        telepules: params.telepules !== undefined ? String(params.telepules || "").trim() : null,
        allapot: params.allapot || null,
        allapotRang: params.allapot ? allapotRang(params.allapot) : null,
        emelet: e !== null && !isNaN(e) ? e : null,
        emeletOssz: Number(params.emeletOssz) || null,
        telek_nm: Number(params.telek_nm) || null,
        jelleg: params.jelleg || null
    };
}

// ============================================================
//  Árarány-modell (súlyozott, robusztus, előzetes arányok felé húzott
//  log-lineáris regresszió):  log(€/m²) = alap + Σ tényező
// ============================================================

// Józan piaci arányok (ha kevés az adat, ezek felé húzunk).
// Az értékek szorzók a "jó" állapotú, közbülső emeleti, városátlag
// fekvésű lakáshoz képest.
const ELOZETES = {
    allapot: { felujitando: 0.80, kozepes: 0.89, reszben: 0.94, jo: 1.00, ujszeru: 1.10, luxus: 1.22 },
    foldszint: 0.95,
    legfelso: 0.96,
    // a €/m² a mérettel csökken: eladónál nm^-0.15, bérletnél nm^-0.4
    meret: { elado: -0.15, kiado: -0.4 },
    kulterulet: 0.45
};

// Mennyire ragaszkodunk az előzetes arányhoz (nagyobb = erősebben)
// – nagyjából "ennyi hirdetésnyi" bizonyíték kell, hogy elmozduljon tőle
const ERO = { allapot: 4, emelet: 6, meret: 25, kerulet: 3, telepules: 3, jelleg: 4, telek: 15, szoba: 8 };

// A jellemzők (oszlopok) listája egy adathalmazhoz
function jellemzok(pool, tipus, ugylet) {

    const cols = [];
    const add = (nev, csoport, fn, elozetes, ero) => cols.push({ nev, csoport, fn, elozetes: elozetes || 0, ero });

    // Méret (log, 60 m²-re középre igazítva)
    add("meret", "meret", i => Math.log(i.nm / 60), ELOZETES.meret[ugylet] ?? -0.15, ERO.meret);

    // Állapot ("jó" a viszonyítás; ismeretlen állapot = 0 mindenhol, vagyis "átlagos piaci")
    if (tipus !== "telek") {
        ["felujitando", "kozepes", "reszben", "ujszeru", "luxus"].forEach(k => {
            add("allapot_" + k, "allapot", i => i._allapot === k ? 1 : 0,
                Math.log(ELOZETES.allapot[k]), ERO.allapot);
        });
    }

    // Emelet (lakás, üzlet, iroda)
    if (["lakas", "kereskedelmi", "iroda"].includes(tipus)) {
        add("foldszint", "emelet", i => i._emelet === 0 ? 1 : 0, Math.log(ELOZETES.foldszint), ERO.emelet);
        add("legfelso", "emelet", i => i._legfelso ? 1 : 0, Math.log(ELOZETES.legfelso), ERO.emelet);
    }

    // Szobaszám a mérethez képest (sok kis szoba vs. kevés nagy) – enyhe
    if (["lakas", "haz", "iroda"].includes(tipus)) {
        add("szoba_suruseg", "szoba", i => i.szobak > 0 ? Math.log((i.szobak * 25) / i.nm) : 0, 0, ERO.szoba);
    }

    // Kerület (lakás, üzlet, iroda) – az előzetes: a városátlag (0)
    if (["lakas", "kereskedelmi", "iroda"].includes(tipus)) {
        const keruletek = [...new Set(pool.map(i => i.kerulet).filter(Boolean))];
        keruletek.forEach(k => add("kerulet:" + k, "kerulet", i => i.kerulet === k ? 1 : 0, 0, ERO.kerulet));
    }

    // Település (ház, telek): a városban vagy melyik faluban
    if (["haz", "telek"].includes(tipus)) {
        const telepulesek = [...new Set(pool.map(i => i.telepules).filter(Boolean))];
        telepulesek.forEach(t => add("telepules:" + t, "telepules", i => i.telepules === t ? 1 : 0, Math.log(0.8), ERO.telepules));
    }

    // Telek: külterület olcsóbb
    if (tipus === "telek") {
        add("kulterulet", "jelleg", i => i.telek_jelleg === "kulterulet" ? 1 : 0, Math.log(ELOZETES.kulterulet), ERO.jelleg);
    }

    // Ház: a telek mérete a házhoz képest
    if (tipus === "haz") {
        add("telek_arany", "telek", i => i.telek_nm > 0 ? Math.log(Math.min(Math.max(i.telek_nm / i.nm, 0.5), 30) / 4) : 0, 0.05, ERO.telek);
    }

    return cols;

}

// Az ingatlan előkészítése a modellhez
function elokeszit(i) {
    const e = emeletSzam(i.emelet);
    const o = emeletOssz(i.emelet);
    return {
        ...i,
        _allapot: allapotKulcs(i.allapot),
        _emelet: e,
        _legfelso: e !== null && o !== null && o >= 3 && e >= o
    };
}

// Lineáris egyenletrendszer (Gauss-elimináció részleges főelem-kiválasztással)
function megold(A, b) {
    const n = b.length;
    const M = A.map((sor, i) => [...sor, b[i]]);
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        if (Math.abs(M[p][c]) < 1e-12) continue;
        [M[c], M[p]] = [M[p], M[c]];
        for (let r = 0; r < n; r++) {
            if (r === c) continue;
            const f = M[r][c] / M[c][c];
            if (!f) continue;
            for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
        }
    }
    return M.map((sor, i) => Math.abs(sor[i]) < 1e-12 ? 0 : sor[n] / sor[i]);
}

// A modell illesztése -> { beta, cols, sigma, n } vagy null
function modellIllesztes(pool, tipus, ugylet) {

    if (pool.length < 5) return null;

    const adat = pool.map(elokeszit);
    const cols = jellemzok(adat, tipus, ugylet);
    const p = cols.length + 1;          // + alap (tengelymetszet)

    const X = adat.map(i => [1, ...cols.map(c => c.fn(i))]);
    const y = adat.map(i => Math.log(i.arNm));

    // Az alap kiindulása: a medián €/m² (log)
    const prior = [median(y), ...cols.map(c => c.elozetes)];
    const ero = [1e-6, ...cols.map(c => c.ero)];

    let w = adat.map(() => 1);
    let beta = prior.slice();

    // Robusztus illesztés (Huber): a nagyon kilógó hirdetések kisebb súlyt kapnak
    for (let kor = 0; kor < 4; kor++) {

        const A = Array.from({ length: p }, () => new Array(p).fill(0));
        const b = new Array(p).fill(0);

        for (let n = 0; n < X.length; n++) {
            const xn = X[n], wn = w[n];
            for (let r = 0; r < p; r++) {
                if (!xn[r]) continue;
                b[r] += wn * xn[r] * y[n];
                for (let c = 0; c < p; c++) if (xn[c]) A[r][c] += wn * xn[r] * xn[c];
            }
        }

        for (let r = 0; r < p; r++) {
            A[r][r] += ero[r];
            b[r] += ero[r] * prior[r];
        }

        beta = megold(A, b);

        const maradek = X.map((xn, n) => y[n] - xn.reduce((s, v, k) => s + v * beta[k], 0));
        const mad = median(maradek.map(Math.abs)) * 1.4826 || 0.1;
        const c = 1.345 * mad;
        w = maradek.map(r => Math.abs(r) <= c ? 1 : c / Math.abs(r));

    }

    const maradek = X.map((xn, n) => y[n] - xn.reduce((s, v, k) => s + v * beta[k], 0));
    const sigma = Math.max(0.05, median(maradek.map(Math.abs)) * 1.4826);

    // Oszlop-átlagok: ismeretlen tulajdonságnál a "tipikus" hirdetés értéke
    const atlagok = cols.map((c, k) => atlag(X.map(xn => xn[k + 1])));

    return { beta, cols, sigma, n: pool.length, atlagok };

}

// A cél jellemzői (ismeretlen tulajdonságnál a piaci átlag)
function celJellemzok(m, cel) {

    const i = elokeszit({
        nm: cel.nm,
        szobak: cel.szobak,
        kerulet: cel.kerulet,
        telepules: cel.telepules || null,
        telek_jelleg: cel.jelleg,
        telek_nm: cel.telek_nm,
        allapot: cel.allapot,
        emelet: cel.emelet !== null ? `${cel.emelet}${cel.emeletOssz ? "/" + cel.emeletOssz : ""}` : null
    });

    return m.cols.map((c, k) => {
        if (c.csoport === "allapot" && !i._allapot) return m.atlagok[k];
        if (c.csoport === "emelet" && i._emelet === null) return m.atlagok[k];
        if (c.csoport === "kerulet" && !cel.kerulet) return m.atlagok[k];
        if (c.csoport === "telepules" && cel.telepules === null) return m.atlagok[k];
        if (c.csoport === "szoba" && !cel.szobak) return m.atlagok[k];
        if (c.csoport === "telek" && !cel.telek_nm) return m.atlagok[k];
        if (c.csoport === "jelleg" && !cel.jelleg) return m.atlagok[k];
        return c.fn(i);
    });

}

function hirdetesJellemzok(m, i) {
    const e = elokeszit(i);
    return m.cols.map(c => c.fn(e));
}

const pontszor = (beta, x) => x.reduce((s, v, k) => s + v * beta[k + 1], 0);

// A becslés arányai (mennyit számít a méret, az állapot, a kerület...)
// a város tipikus hirdetéséhez képest -> [{ csoport, szorzo }]
function tenyezok(m, xCel) {
    const csop = {};
    m.cols.forEach((c, k) => {
        const hatas = m.beta[k + 1] * (xCel[k] - m.atlagok[k]);
        csop[c.csoport] = (csop[c.csoport] || 0) + hatas;
    });
    return Object.entries(csop)
        .map(([csoport, h]) => ({ csoport, szorzo: Math.round(Math.exp(h) * 1000) / 1000 }))
        .filter(t => Math.abs(t.szorzo - 1) >= 0.005);
}

// ============================================================
//  A becslés (új módszer)
// ============================================================

// Mennyire "erős" a modell az összehasonlítókkal szemben (ennyi nagyon
// hasonló hirdetéssel ér fel), és a hasonlók árát mennyire igazítjuk a
// modell arányaival (0 = csak a méret szerint, 1 = teljesen).
// Kimérve (minden hirdetést a többi alapján becsülve): ezekkel a becslés
// minden mutatóban pontosabb lett a korábbinál – a kevés adatú csoportokban
// (ritka szobaszám / kerület) a legjobban. Az Admin → Áttekintés
// "Értékbecslő pontossága" gombja a valós adatokon újra kiméri.
const MODELL_SULY = 1;
const ATSZAMITAS = 0.25;

function szamol(pool, params, opts = {}) {

    const cel = celAdat(params);
    const nm = cel.nm;
    const tipus = params.tipus || "lakas";
    const ugylet = params.ugylet || "elado";

    if (pool.length < 3) return { error: "not_enough_data", count: pool.length };

    const m = opts.modell !== undefined ? opts.modell : modellIllesztes(pool, tipus, ugylet);

    const varosArNm = atlag(pool.map(i => i.arNm));
    const keruletPool = cel.kerulet ? pool.filter(i => i.kerulet === cel.kerulet) : [];
    const keruletArNm = keruletPool.length ? atlag(keruletPool.map(i => i.arNm)) : null;

    const rendezett = pool
        .map(i => ({ ...i, d: tavolsag(cel, i) }))
        .sort((a, b) => a.d - b.d);

    const hasonlok = rendezett.slice(0, 12);

    // ---- 1) Összehasonlító: a hasonló hirdetések ára a keresett ingatlanra átszámítva
    const K = 16;
    const hatar = rendezett[Math.min(K, rendezett.length) - 1].d + 0.25;
    const kitevo = ugylet === "kiado" ? 0.6 : 0.85;

    const xCel = m ? celJellemzok(m, cel) : null;
    const celPont = m ? pontszor(m.beta, xCel) : 0;

    const jeloltek = rendezett
        .filter(i => i.d < hatar)
        .map(i => {
            // Arányos átszámítás: a modell szerinti különbség (méret, állapot,
            // kerület, emelet); modell nélkül csak a méret szerint
            // phi: mennyire vesszük át a modell szerinti különbséget (1 = teljesen)
            const phi = opts.phi !== undefined ? opts.phi : ATSZAMITAS;
            const regi = i.ar * Math.pow(nm / i.nm, kitevo);
            const igazitott = m
                ? regi * Math.exp(phi * ((celPont - pontszor(m.beta, hirdetesJellemzok(m, i))) - (kitevo - 1) * Math.log(nm / i.nm)))
                : regi;
            return {
                ...i,
                igazitott,
                w: (1 / (1 + Math.pow(i.d / 0.4, 2))) * (1 - i.d / hatar)
            };
        });

    const sulyozottAtlag = lista => {
        const s = lista.reduce((t, i) => t + i.w, 0);
        return s ? lista.reduce((t, i) => t + i.w * i.igazitott, 0) / s : 0;
    };

    let hasonlo = sulyozottAtlag(jeloltek);
    for (let kor = 0; kor < 2; kor++) {
        const ujra = jeloltek.map(i => {
            const elteres = (i.igazitott / hasonlo - 1) / 0.25;
            return { ...i, w: i.w / (1 + elteres * elteres) };
        });
        hasonlo = sulyozottAtlag(ujra);
        if (kor === 1) jeloltek.splice(0, jeloltek.length, ...ujra);
    }

    // ---- 2) Modell
    const modellBecsles = m ? Math.exp(m.beta[0] + celPont) * nm : null;

    // ---- 3) Keverés: a közeli hasonlók "száma" vs. a modell ereje
    const kozeliSzam = rendezett.slice(0, K).reduce((s, i) => s + 1 / (1 + Math.pow(i.d / 0.5, 2)), 0);
    const modellSuly = m ? (opts.modellSuly !== undefined ? opts.modellSuly : MODELL_SULY) : 0;
    const hasonloArany = kozeliSzam / (kozeliSzam + modellSuly);

    const becsult = m ? Math.exp(hasonloArany * Math.log(hasonlo) + (1 - hasonloArany) * Math.log(modellBecsles)) : hasonlo;

    if (opts.csakSzam) return becsult;

    // ---- Ár-sáv: a hasonlók szórása és a modell bizonytalansága együtt
    const sulyozottPercentilis = (lista, p) => {
        const r = [...lista].sort((a, b) => a.igazitott - b.igazitott);
        const ossz = r.reduce((t, i) => t + i.w, 0);
        if (!ossz) return becsult;
        let kum = 0;
        const pontok = r.map(i => { const k = (kum + i.w / 2) / ossz; kum += i.w; return [k, i.igazitott]; });
        if (p <= pontok[0][0]) return pontok[0][1];
        for (let j = 1; j < pontok.length; j++) {
            if (p <= pontok[j][0]) {
                const [k0, v0] = pontok[j - 1], [k1, v1] = pontok[j];
                return v0 + (v1 - v0) * (p - k0) / (k1 - k0);
            }
        }
        return pontok[pontok.length - 1][1];
    };

    const hAlso = sulyozottPercentilis(jeloltek, 0.25) / hasonlo;
    const hFelso = sulyozottPercentilis(jeloltek, 0.75) / hasonlo;
    const mAlso = m ? Math.exp(-0.674 * m.sigma) : hAlso;
    const mFelso = m ? Math.exp(0.674 * m.sigma) : hFelso;
    const alsoArany = Math.min(hasonloArany * hAlso + (1 - hasonloArany) * mAlso, 0.995);
    const felsoArany = Math.max(hasonloArany * hFelso + (1 - hasonloArany) * mFelso, 1.005);

    const becsultArNm = becsult / nm;
    const alsoArNm = becsultArNm * alsoArany;
    const felsoArNm = becsultArNm * felsoArany;

    const atlagTav = atlag(hasonlok.map(i => i.d));
    const keruletEgyezes = cel.kerulet ? hasonlok.filter(i => i.kerulet === cel.kerulet).length : null;

    // Megbízhatóság: a régi feltételek, de a modell kevés hasonlónál is
    // közepessé teheti, ha elég adatból tanult és a sáv nem túl széles
    let megbizhatosag = "low";
    if (hasonlok.length >= 8 && atlagTav < 1.2) megbizhatosag = "medium";
    if (hasonlok.length >= 10 && atlagTav < 0.8 && (keruletEgyezes === null || keruletEgyezes >= 3)) megbizhatosag = "high";
    if (megbizhatosag === "low" && m && m.n >= 25 && m.sigma < 0.22) megbizhatosag = "medium";

    const lepes = x => x < 2000 ? 5 : (x < 20000 ? 50 : 100);
    const kerekit = x => Math.round(x / lepes(x)) * lepes(x);
    const arNmKerek = x => x < 50 ? Math.round(x * 10) / 10 : Math.round(x);

    return {
        estimate: kerekit(becsultArNm * nm),
        arNm: arNmKerek(becsultArNm),
        low: kerekit(alsoArNm * nm),
        high: kerekit(felsoArNm * nm),
        lowArNm: arNmKerek(alsoArNm),
        highArNm: arNmKerek(felsoArNm),
        confidence: megbizhatosag,
        poolCount: pool.length,
        cityAvgArNm: arNmKerek(varosArNm),
        districtAvgArNm: keruletArNm ? arNmKerek(keruletArNm) : null,
        districtCount: keruletPool.length,
        districtMatches: keruletEgyezes,
        // Hogyan számoltuk
        method: {
            comparableEstimate: kerekit(hasonlo),
            modelEstimate: modellBecsles ? kerekit(modellBecsles) : null,
            comparableWeight: Math.round(hasonloArany * 100),
            modelWeight: m ? Math.round((1 - hasonloArany) * 100) : 0,
            closeCount: Math.round(kozeliSzam * 10) / 10,
            baseArNm: m ? arNmKerek(Math.exp(m.beta[0] + m.cols.reduce((s, c, k) => s + m.beta[k + 1] * m.atlagok[k], 0))) : null,
            factors: m ? tenyezok(m, xCel) : []
        },
        comparables: hasonlok.map(i => {
            const j = jeloltek.find(x => x.id === i.id);
            return {
                id: i.id,
                link: i.link,
                ar: i.ar,
                nm: i.nm,
                arNm: arNmKerek(i.arNm),
                szobak: i.szobak,
                emelet: i.emelet,
                allapot: i.allapot,
                kerulet: i.kerulet,
                eladva: i.eladva,
                adjusted: j ? kerekit(j.igazitott) : null,
                similarity: Math.round(100 / (1 + i.d))
            };
        })
    };

}

// ============================================================
//  A korábbi módszer (csak az összevetéshez, a tesztben)
// ============================================================

function szamolRegi(pool, params) {

    const cel = celAdat(params);
    const nm = cel.nm;
    if (pool.length < 3) return null;

    const rendezett = pool.map(i => ({ ...i, d: tavolsag(cel, i) })).sort((a, b) => a.d - b.d);
    const K = 16;
    const hatar = rendezett[Math.min(K, rendezett.length) - 1].d + 0.25;
    const kitevo = (params.ugylet || "elado") === "kiado" ? 0.6 : 0.85;

    const jeloltek = rendezett.filter(i => i.d < hatar).map(i => ({
        ...i,
        igazitott: i.ar * Math.pow(nm / i.nm, kitevo),
        w: (1 / (1 + Math.pow(i.d / 0.4, 2))) * (1 - i.d / hatar)
    }));

    const sa = lista => {
        const s = lista.reduce((t, i) => t + i.w, 0);
        return s ? lista.reduce((t, i) => t + i.w * i.igazitott, 0) / s : 0;
    };

    let becsult = sa(jeloltek);
    for (let kor = 0; kor < 2; kor++) {
        const ujra = jeloltek.map(i => {
            const e = (i.igazitott / becsult - 1) / 0.25;
            return { ...i, w: i.w / (1 + e * e) };
        });
        becsult = sa(ujra);
    }

    return becsult;

}

// ============================================================
//  Nyilvános függvények
// ============================================================

async function becsles(params) {

    const varos = String(params.varos || "").trim();
    const nm = Number(params.nm);

    if (!varos || !(nm > 0)) {
        return { error: "missing_params" };
    }

    const rows = await adatok(varos, params.tipus || "lakas", params.ugylet || "elado");
    const pool = tisztitPool(rows, Number(params.exclude) || null);

    if (pool.length < 3) {
        return { error: "not_enough_data", count: pool.length };
    }

    return szamol(pool, params);

}

// Pontosság-mérés a valós adatokon: minden hirdetést a többi alapján
// becslünk meg (a sajátja kimarad), és összevetjük a hirdetési árral.
//  -> hiba-mutatók a régi és az új módszerre, a modell-súly több értékére
async function teszt(varos, tipus = "lakas", ugylet = "elado") {

    const rows = tisztitPool(await adatok(varos, tipus, ugylet), null);

    if (rows.length < 8) return { error: "not_enough_data", count: rows.length };

    const sulyok = [0, 0.5, 1, 2, 4, 1e9];   // 0 = csak összehasonlító, 1e9 = csak modell
    const hibak = { regi: [] };
    sulyok.forEach(s => { hibak["uj_" + s] = []; });
    const csoportHibak = {};    // kevés adatú csoportok (pl. ritka szobaszám, kerület)

    for (const i of rows) {

        const pool = rows.filter(x => x.id !== i.id);
        const params = {
            tipus, ugylet, nm: i.nm, szobak: i.szobak, kerulet: i.kerulet, allapot: i.allapot,
            emelet: emeletSzam(i.emelet), emeletOssz: emeletOssz(i.emelet), telepules: i.telepules || "",
            telek_nm: i.telek_nm, jelleg: i.telek_jelleg
        };

        const regi = szamolRegi(pool, params);
        if (!regi) continue;
        const e = x => Math.abs(x / i.ar - 1) * 100;
        hibak.regi.push(e(regi));

        const m = modellIllesztes(pool, tipus, ugylet);
        sulyok.forEach(s => {
            hibak["uj_" + s].push(e(szamol(pool, params, { modell: m, modellSuly: s, csakSzam: true })));
        });

        // Ritka csoport: a hasonló (azonos kerület + szobaszám) hirdetésekből kevés van
        const hasonloDb = pool.filter(x => x.kerulet === i.kerulet && x.szobak === i.szobak).length;
        const cs = hasonloDb < 4 ? "ritka" : "gyakori";
        if (!csoportHibak[cs]) csoportHibak[cs] = { regi: [], uj: [] };
        csoportHibak[cs].regi.push(e(regi));
        csoportHibak[cs].uj.push(e(szamol(pool, params, { modell: m, csakSzam: true })));

    }

    const osszegez = l => ({
        n: l.length,
        medianHiba: Math.round(median(l) * 10) / 10,
        atlagHiba: Math.round(atlag(l) * 10) / 10,
        tizSzazalekonBelul: Math.round(l.filter(x => x <= 10).length / (l.length || 1) * 100)
    });

    const eredmeny = {};
    Object.entries(hibak).forEach(([k, l]) => { eredmeny[k] = osszegez(l); });
    const csoportok = {};
    Object.entries(csoportHibak).forEach(([k, v]) => { csoportok[k] = { regi: osszegez(v.regi), uj: osszegez(v.uj) }; });

    return { varos, tipus, ugylet, hirdetesek: rows.length, modellSuly: MODELL_SULY, atszamitas: ATSZAMITAS, eredmeny, csoportok };

}

module.exports = { becsles, teszt, _belso: { szamol, szamolRegi, modellIllesztes, tisztitPool, adatok } };
