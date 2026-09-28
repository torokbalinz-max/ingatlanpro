// ============================================================
//  Ingatlan értékbecslő
//
//  A megadott paraméterekhez a MEGLÉVŐ adatbázisból keresi ki
//  a leginkább hasonló ingatlanokat (ugyanabban a városban),
//  és ezek €/m² árából számol becsült árat és ár-sávot.
// ============================================================

const db = require("../db/database");

// Állapotok egységesítése (az adatokban vannak pl. "jó*",
// "részbenfel" jellegű értékek is)
// (fél lépések: a "közepes" a felújítandó és a részben felújított között van,
// így a régi értékek távolsága nem változik)
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
          AND statusz = 'aktiv' AND ellenorzott
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

    // A leghasonlóbb 12 ingatlan (ezeket mutatjuk, és ebből számoljuk a megbízhatóságot)
    const rendezett = pool
        .map(i => ({ ...i, d: tavolsag(cel, i) }))
        .sort((a, b) => a.d - b.d);

    const hasonlok = rendezett.slice(0, 12);

    // ---------- Becslés, folytonosan ----------
    // Korábban a 12 leghasonlóbb egyszerű súlyozott átlaga volt: 1 m²
    // különbségnél kicserélődhetett egy hirdetés, és a becslés ugrott.
    // Most:
    //  1) minden hasonló ingatlan árát átszámoljuk a keresett méretre
    //     (a nagyobb lakás €/m² ára kisebb – bérletnél ez erősebb),
    //  2) a súly a távolsággal folyamatosan csökken, és a 16. leghasonlóbb
    //     távolságánál nullára fut ki – így egy hirdetés be- vagy kiesése
    //     nem okoz ugrást,
    //  3) a kilógó árak (a többitől nagyon eltérők) kisebb súlyt kapnak.

    const K = 16;
    const hatar = rendezett[Math.min(K, rendezett.length) - 1].d + 0.25;
    const kitevo = (params.ugylet || "elado") === "kiado" ? 0.6 : 0.85;

    const jeloltek = rendezett
        .filter(i => i.d < hatar)
        .map(i => ({
            ...i,
            // az ár átszámítva a keresett méretre
            igazitott: i.ar * Math.pow(nm / i.nm, kitevo),
            // széles, sima súlygörbe: egyetlen pont nem uralhatja a becslést
            w: (1 / (1 + Math.pow(i.d / 0.4, 2))) * (1 - i.d / hatar)
        }));

    const sulyozottAtlag = lista => {
        const s = lista.reduce((t, i) => t + i.w, 0);
        return s ? lista.reduce((t, i) => t + i.w * i.igazitott, 0) / s : 0;
    };

    // Kilógók visszasúlyozása az első átlaghoz képest (kétszer)
    let becsult = sulyozottAtlag(jeloltek);
    for (let kor = 0; kor < 2; kor++) {
        const ujra = jeloltek.map(i => {
            const elteres = (i.igazitott / becsult - 1) / 0.25;
            return { ...i, w: i.w / (1 + elteres * elteres) };
        });
        becsult = sulyozottAtlag(ujra);
        if (kor === 1) jeloltek.splice(0, jeloltek.length, ...ujra);
    }

    // Súlyozott percentilis (interpolálva) az ár-sávhoz
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

    const becsultArNm = becsult / nm;
    const alsoArNm = Math.min(sulyozottPercentilis(jeloltek, 0.25), becsult) / nm;
    const felsoArNm = Math.max(sulyozottPercentilis(jeloltek, 0.75), becsult) / nm;

    const atlagTav = atlag(hasonlok.map(i => i.d));
    const keruletEgyezes = cel.kerulet
        ? hasonlok.filter(i => i.kerulet === cel.kerulet).length
        : null;

    let megbizhatosag = "low";
    if (hasonlok.length >= 8 && atlagTav < 1.2) megbizhatosag = "medium";
    if (hasonlok.length >= 10 && atlagTav < 0.8 && (keruletEgyezes === null || keruletEgyezes >= 3)) {
        megbizhatosag = "high";
    }

    // Kerekítés az összeg nagyságához igazítva. Korábban mindig 100 €-ra
    // kerekített: bérleti díjnál ez 343 € -> 300 €, 350 € -> 400 € ugrást
    // okozott 1 m² különbségre.
    const lepes = x => x < 2000 ? 5 : (x < 20000 ? 50 : 100);
    const kerekit = x => Math.round(x / lepes(x)) * lepes(x);

    // Kis €/m² értéknél (bérlet: pl. 7,4 €/m²) egy tizedes
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
        comparables: hasonlok.map(i => ({
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
            similarity: Math.round(100 / (1 + i.d))
        }))
    };

}

module.exports = { becsles };
