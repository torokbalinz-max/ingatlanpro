// ============================================================
//  Ingatlan értékbecslő
//
//  A megadott paraméterekhez a MEGLÉVŐ adatbázisból keresi ki
//  a leginkább hasonló ingatlanokat (ugyanabban a városban),
//  és ezek €/m² árából számol becsült árat és ár-sávot.
// ============================================================

const db = require("./database");

// Állapotok egységesítése (az adatokban vannak pl. "jó*",
// "részbenfel" jellegű értékek is)
const ALLAPOT_RANG = {
    "felújítandó": 0,
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

function emeletSzam(e) {
    const n = parseInt(String(e || "").split("/")[0], 10);
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

async function becsles(params) {

    const varos = String(params.varos || "").trim();
    const nm = Number(params.nm);

    if (!varos || !(nm > 0)) {
        return { error: "missing_params" };
    }

    const cel = {
        nm,
        szobak: Number(params.szobak) || null,
        kerulet: String(params.kerulet || "").trim() || null,
        allapotRang: params.allapot ? allapotRang(params.allapot) : null,
        emelet: params.emelet !== undefined && params.emelet !== "" ? Number(params.emelet) : null
    };

    const result = await db.query(`
        SELECT id, link, ar, nm, szobak, emelet, allapot, kerulet, eladva
        FROM ingatlanok
        WHERE varos = $1 AND ar > 0 AND nm > 0
          AND statusz = 'aktiv'
          AND COALESCE(tipus, 'lakas') = $2
          AND COALESCE(ugylet, 'elado') = $3
    `, [varos, params.tipus || "lakas", params.ugylet || "elado"]);

    // Duplikált hirdetések (ugyanaz a link többször) csak egyszer számítanak
    const lattLinkek = new Set();
    const kihagy = Number(params.exclude) || null;

    // A becsült ingatlan saját magát (és a duplikált példányait) ne vegye hasonlónak
    if (kihagy) {
        const sajat = result.rows.find(i => i.id === kihagy);
        const sajatLink = sajat ? (sajat.link || "").split("?")[0].trim() : "";
        if (sajatLink) lattLinkek.add(sajatLink);
    }

    const pool = result.rows
        .filter(i => i.id !== kihagy)
        .filter(i => {
            const link = (i.link || "").split("?")[0].trim();
            if (!link) return true;
            if (lattLinkek.has(link)) return false;
            lattLinkek.add(link);
            return true;
        })
        .map(i => ({
            ...i,
            arNm: i.ar / i.nm
        }));

    if (pool.length < 3) {
        return { error: "not_enough_data", count: pool.length };
    }

    // Piaci háttér
    const varosArNm = atlag(pool.map(i => i.arNm));
    const keruletPool = cel.kerulet ? pool.filter(i => i.kerulet === cel.kerulet) : [];
    const keruletArNm = keruletPool.length ? atlag(keruletPool.map(i => i.arNm)) : null;

    // A leghasonlóbb 12 ingatlan
    const hasonlok = pool
        .map(i => ({ ...i, d: tavolsag(cel, i) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 12);

    // Szélsőségek kiszűrése (a legolcsóbb és legdrágább €/m² kiesik, ha van elég)
    let szamitott = [...hasonlok].sort((a, b) => a.arNm - b.arNm);
    if (szamitott.length >= 6) {
        szamitott = szamitott.slice(1, -1);
    }

    // Súlyozott átlag: a hasonlóbb ingatlan többet számít
    let sulySum = 0;
    let ertekSum = 0;

    szamitott.forEach(i => {
        const w = 1 / (0.3 + i.d);
        sulySum += w;
        ertekSum += w * i.arNm;
    });

    const becsultArNm = ertekSum / sulySum;

    const arNmLista = szamitott.map(i => i.arNm).sort((a, b) => a - b);
    const alsoArNm = percentile(arNmLista, 0.25);
    const felsoArNm = percentile(arNmLista, 0.75);

    const atlagTav = atlag(hasonlok.map(i => i.d));
    const keruletEgyezes = cel.kerulet
        ? hasonlok.filter(i => i.kerulet === cel.kerulet).length
        : null;

    let megbizhatosag = "low";
    if (hasonlok.length >= 8 && atlagTav < 1.2) megbizhatosag = "medium";
    if (hasonlok.length >= 10 && atlagTav < 0.8 && (keruletEgyezes === null || keruletEgyezes >= 3)) {
        megbizhatosag = "high";
    }

    const kerekit = x => Math.round(x / 100) * 100;

    return {
        estimate: kerekit(becsultArNm * nm),
        arNm: Math.round(becsultArNm),
        low: kerekit(alsoArNm * nm),
        high: kerekit(felsoArNm * nm),
        lowArNm: Math.round(alsoArNm),
        highArNm: Math.round(felsoArNm),
        confidence: megbizhatosag,
        poolCount: pool.length,
        cityAvgArNm: Math.round(varosArNm),
        districtAvgArNm: keruletArNm ? Math.round(keruletArNm) : null,
        districtCount: keruletPool.length,
        districtMatches: keruletEgyezes,
        comparables: hasonlok.map(i => ({
            id: i.id,
            link: i.link,
            ar: i.ar,
            nm: i.nm,
            arNm: Math.round(i.arNm),
            szobak: i.szobak,
            emelet: i.emelet,
            allapot: i.allapot,
            kerulet: i.kerulet,
            eladva: i.eladva,
            similarity: Math.round(100 / (1 + i.d))
        }))
    };

}

module.exports = { becsles };
