// ============================================================
//  Adatok kinyerése a hirdetés szövegéből (cím + leírás + forrásszöveg)
//
//  Amit a forrásoldal nem adott meg külön mezőben, de a leírásban
//  benne van (pl. telek: "teren intravilan 1.250 mp"), azt innen
//  töltjük ki. Csak az ÜRES mezőket töltjük – amit az admin
//  beírt, azt soha nem írjuk felül.
// ============================================================

const Telepulesek = require("../../public/js/core/telepulesek");

function ekezetNelkul(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// "1.250" / "1 250" / "1250" / "12,5" -> szám
function szamSzovegbol(s) {

    let t = String(s || "").trim().replace(/\s+/g, " ");

    if (!t) return null;

    // Ezres tagolás: 1.250 / 1,250 / 1 250 / 12.500.000
    if (/^\d{1,3}([., ]\d{3})+$/.test(t)) {
        t = t.replace(/[., ]/g, "");
    } else {
        t = t.replace(/\s/g, "").replace(",", ".");
    }

    const n = Number(t);
    return isNaN(n) ? null : n;

}

// ---------- Területek ----------

const MERTEK = "(?:mp|m²|m2|m\\.p\\.|metri\\s*p[aă]tra[tț]i|nm|n\\.m\\.|n[eé]gyzetm[eé]ter|sqm|ari|a\\b|ar\\b|ha\\b|hectare?|hectar|hekt[aá]r)";

const TERULET_RE = new RegExp(
    "(\\d{1,3}(?:[., ]\\d{3})+|\\d+(?:[.,]\\d{1,2})?)\\s*" + MERTEK,
    "gi"
);

const TELEK_KONTEXTUS = /teren|lot\b|parcel|intravilan|extravilan|curte|gr[aă]din|livad|suprafa[tț][aă]\s+(?:total[aă]\s+)?(?:a\s+)?teren|telek|telket|kert|udvar|f[oö]ldter|sz[aá]nt[oó]|beltelek|k[uü]lter[uü]let/i;

const HASZNOS_KONTEXTUS = /util[aă]|utili|construit[aă]|locuibil|desf[aă][sș]urat|amprent|hasznos|lak[oó]ter[uü]let|alapter[uü]let|beépített|beepitett|apartament(?:ul)?\s+(?:are|de|cu)|casa\s+(?:are|de)|locuin[tț][aă]\s+(?:are|de)/i;

// Az összes terület-említés a szövegben, m²-re átváltva, a környezetükkel
function teruletek(szoveg) {

    const t = String(szoveg || "");
    const lista = [];

    for (const m of t.matchAll(TERULET_RE)) {

        const egyseg = m[0].slice(m[1].length).trim().toLowerCase();
        let ertek = szamSzovegbol(m[1]);

        if (!ertek) continue;

        let fold = false;

        if (/^(ha|hectar|hectare|hekt[aá]r)/.test(ekezetNelkul(egyseg))) { ertek *= 10000; fold = true; }
        else if (/^(ari|a|ar)$/.test(egyseg)) {
            // "a" / "ar" csak akkor, ha tényleg ár (pl. "12 ari", "12 a teren")
            if (egyseg !== "ari" && !TELEK_KONTEXTUS.test(t.slice(m.index, m.index + 40))) continue;
            ertek *= 100;
            fold = true;
        }

        const elotte = t.slice(Math.max(0, m.index - 60), m.index);
        const utana = t.slice(m.index + m[0].length, m.index + m[0].length + 25);

        // A legközelebbi címke dönt ("teren 800 mp, casa 120 mp utili")
        const kozeliElotte = elotte.slice(-35);

        // Mindkét címke előfordulhat ("casa 140 mp utili, teren 600 mp"):
        // a számhoz közelebbi számít
        const utolso = re => {
            let poz = -1;
            for (const x of kozeliElotte.matchAll(new RegExp(re.source, "gi"))) poz = x.index;
            return poz;
        };

        const tPoz = utolso(TELEK_KONTEXTUS);
        const hPoz = utolso(HASZNOS_KONTEXTUS);

        let telek = fold || (tPoz >= 0 && tPoz > hPoz);
        let hasznos = !fold && hPoz >= 0 && hPoz > tPoz;

        // Utána álló címke ("120 mp utili", "600 mp teren")
        if (!telek && !hasznos) {
            if (/^\s*(?:de\s+)?(?:teren|telek|curte)/i.test(utana)) telek = true;
            else if (/^\s*(?:util|utili|construit|hasznos|lak[oó]ter)/i.test(utana)) hasznos = true;
        }

        lista.push({
            ertek: Math.round(ertek * 100) / 100,
            telek,
            hasznos,
            index: m.index
        });

    }

    return lista;

}

// ---------- Szobák ----------

const SZAM_SZO = {
    o: 1, un: 1, una: 1, doua: 2, "două": 2, doi: 2, trei: 3, patru: 4, cinci: 5, sase: 6, "șase": 6,
    egy: 1, ket: 2, "két": 2, harom: 3, "három": 3, negy: 4, "négy": 4, ot: 5, "öt": 5, hat: 6
};

function szobakSzovegbol(t) {

    const s = ekezetNelkul(t).toLowerCase();

    let m = s.match(/nr\.?\s*cam(?:ere)?\.?\s*:?\s*(\d{1,2})/)
        || s.match(/\b(\d{1,2})\s*[- ]?\s*camer[ei]\b/)
        || s.match(/\b(\d{1,2})\s*[- ]?\s*szob[aá]s/)
        || s.match(/\b(\d{1,2})\s+szoba\b/);

    if (m) {
        const n = Number(m[1]);
        return n >= 1 && n <= 20 ? n : null;
    }

    m = s.match(/\b(o|una|doua|trei|patru|cinci|sase)\s+camere?\b/) || s.match(/\b(egy|ket|harom|negy|ot|hat)\s*szob[aá]s/);
    if (m) return SZAM_SZO[m[1]] || null;

    if (/garsonier|studio\b|egyszob[aá]s|1 szob[aá]s/.test(s)) return 1;

    return null;

}

// ---------- Emelet ----------

function emeletSzovegbol(t) {

    const s = ekezetNelkul(t).toLowerCase();

    let m = s.match(/etaj(?:ul)?\s*:?\s*(parter|p|demisol|mansarda|\d{1,2})\s*(?:\/|din|din\s+|\s+din\s+)\s*(\d{1,2})/);

    if (m) {
        const e = /^(p|parter)$/.test(m[1]) ? "0" : m[1] === "demisol" ? "-1" : m[1] === "mansarda" ? m[2] : m[1];
        return `${e}/${m[2]}`;
    }

    m = s.match(/\bla\s+etajul\s+(\d{1,2})\b/) || s.match(/\betaj(?:ul)?\s*:?\s*(\d{1,2})\b/) || s.match(/\b(\d{1,2})\.\s*emelet/);
    if (m) return m[1];

    if (/\b(la|situat la|situata la)\s+parter\b|\betaj\s*:?\s*parter\b|f[oö]ldszint/.test(s)) return "0";

    return null;

}

// ---------- Építés éve ----------

function evszamSzovegbol(t) {

    const s = ekezetNelkul(t).toLowerCase();

    const m = s.match(/an(?:ul)?\s*(?:de\s*)?constr(?:uctie|\.)?\s*:?\s*(1[89]\d{2}|20[0-3]\d)/)
        || s.match(/construit[aă]?\s+(?:in|în)\s+(?:anul\s+)?(1[89]\d{2}|20[0-3]\d)/)
        || s.match(/(?:epites|épités|épült|epult)[^0-9]{0,15}(1[89]\d{2}|20[0-3]\d)/);

    return m ? Number(m[1]) : null;

}

// ---------- Hely-tippek a szövegből ----------

// Utca / környék nevek a helymeghatározáshoz ("str. Kós Károly", "zona Ciucului")
function helyTippek(t) {

    const s = String(t || "");
    const tippek = [];

    const B = "[A-ZĂÂÎȘȚŞŢÁÉÍÓÖŐÚÜŰ0-9][\\wăâîșțşţáéíóöőúüűĂÂÎȘȚÁÉÍÓÖŐÚÜŰ.'-]*";
    const NEV = `(${B}(?:[ \\t]+(?:(?:cel|de|lui|din|la)[ \\t]+)?${B}){0,3})`;

    for (const m of s.matchAll(new RegExp("\\b(?:str(?:ada)?\\.?|b-?dul\\.?|bulevardul|bd\\.|aleea|calea|pia[tț]a)[ \\t]+" + NEV, "gi"))) {
        const nev = m[1].replace(/\s+(?:nr|num[aă]r|bl|sc|ap|et)\b.*$/i, "").replace(/[.,]$/, "");
        tippek.push({ szoveg: "Strada " + nev, szint: "utca" });
    }

    for (const m of s.matchAll(new RegExp(NEV + "[ \\t]+(?:utca|út|útja|tér)\\b", "g"))) {
        tippek.push({ szoveg: m[1] + " utca", szint: "utca" });
    }

    for (const m of s.matchAll(new RegExp("\\b(?:zona|zon[aă]|cartier(?:ul)?)[ \\t]+" + NEV, "gi"))) {
        tippek.push({ szoveg: m[1].replace(/[.,]$/, ""), szint: "kozelito" });
    }

    const lattam = new Set();
    return tippek.filter(x => {
        const k = x.szoveg.toLowerCase();
        if (lattam.has(k) || x.szoveg.length < 4) return false;
        lattam.add(k);
        return true;
    }).slice(0, 5);

}

// ---------- Település (háznál, teleknél: nem a városban, hanem mellette) ----------

// erős szövegek: cím, forrás szerinti város / környék – ha benne van a név, elhisszük
// gyenge szöveg: leírás – csak "în X", "sat X", "comuna X" formában
function telepulesKeres(varosRo, eros, gyenge) {

    const varosKulcs = Telepulesek.kulcs(varosRo);
    const nevek = Telepulesek.LISTA
        .flatMap(t => [{ t, k: Telepulesek.kulcs(t.ro) }, { t, k: Telepulesek.kulcs(t.hu) }])
        .filter(x => x.k && x.k !== varosKulcs)
        .sort((a, b) => b.k.length - a.k.length);

    const illeszt = (szoveg, elotag) => {
        const s = Telepulesek.kulcs(szoveg);
        if (!s) return null;
        for (const n of nevek) {
            const re = new RegExp(`(^|[^a-z])${elotag}${n.k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`);
            if (re.test(s)) return n.t.ro;
        }
        return null;
    };

    for (const e of eros) {
        const x = illeszt(e, "");
        if (x) return x;
    }

    for (const g of gyenge) {
        const x = illeszt(g, "(?:in|sat(?:ul)?|comuna|localitatea|loc\\.|com\\.) ");
        if (x) return x;
    }

    return null;

}

// ---------- Ár ----------

// Hihető-e az ár (a hirdetési oldalak listájában néha €/m², ezres
// egység vagy 1 € "ár megegyezés szerint" jön a teljes ár helyett)
function arHiheto(ar, ugylet) {
    if (!(ar > 0)) return false;
    return ugylet === "kiado" ? ar >= 30 && ar <= 50000 : ar >= 1000 && ar <= 20000000;
}

// Az ár a szövegből: "Preț: 85.000 €", "85 000 EUR", "12 €/mp" (x terület),
// "450.000 lei" (/5). Több találatnál a "preț / ár" címkés, különben a
// legnagyobb hihető összeg.
function arSzovegbol(szoveg, nm, ugylet) {

    const t = String(szoveg || "").replace(/\u00a0/g, " ");
    const SZAM = "(\\d{1,3}(?:[.\\s]\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";
    const jeloltek = [];

    // €/m² (csak ha tudjuk a területet)
    for (const m of t.matchAll(new RegExp(SZAM + "\\s*(?:€|eur(?:o)?)\\s*/\\s*(?:mp|m²|m2|nm|metru)", "gi"))) {
        const v = szamSzovegbol(m[1]);
        if (v && nm > 0) jeloltek.push({ ar: Math.round(v * nm), cimkes: /pre[tț]|[aá]r\b/i.test(t.slice(Math.max(0, m.index - 25), m.index)), perNm: true });
    }

    // Teljes ár euróban vagy lejben
    for (const m of t.matchAll(new RegExp("(?:(pre[tț](?:ul)?|[aá]r|price)\\s*:?\\s*)?" + SZAM + "\\s*(€|eur(?:o)?\\b|lei\\b|ron\\b)(?!\\s*/\\s*(?:mp|m²|m2|nm|metru))", "gi"))) {
        let v = szamSzovegbol(m[2]);
        if (!v) continue;
        if (/lei|ron/i.test(m[3])) v = Math.round(v / 5);
        // "85 mii €" / "85k €"
        const elotte = t.slice(Math.max(0, m.index - 25), m.index);
        jeloltek.push({ ar: v, cimkes: !!m[1] || /pre[tț]|[aá]r\b|price/i.test(elotte) });
    }

    const jok = jeloltek.filter(j => arHiheto(j.ar, ugylet));
    if (!jok.length) return null;

    const cimkes = jok.find(j => j.cimkes && !j.perNm) || jok.find(j => j.cimkes);
    if (cimkes) return cimkes.ar;

    return jok.filter(j => !j.perNm).sort((a, b) => b.ar - a.ar)[0]?.ar || jok[0].ar;

}

// ---------- Telek: belterület / külterület ----------

function telekJelleg(szoveg) {
    const s = ekezetNelkul(szoveg).toLowerCase();
    const bel = /intravilan|beltelek|belterulet|in intravilanul/.test(s);
    const kul = /extravilan|kulterulet|teren agricol|arabil|pasune|fanea[tț]|livada|padure/.test(s);
    if (bel && !kul) return "belterulet";
    if (kul && !bel) return "kulterulet";
    if (bel && kul) {
        // mindkettő szerepel (pl. "extravilan, de intravilanizabil"): az első számít
        return s.search(/intravilan|beltelek|belterulet/) < s.search(/extravilan|kulterulet/) ? "belterulet" : "kulterulet";
    }
    return null;
}

// ---------- Összesítés: mit tudunk kitölteni ----------

//  d: a hirdetés (tipus, nm, telek_nm, szobak, emelet, evszam, cim, leiras, forras_szoveg)
//  -> csak a hiányzó mezők javasolt értéke
function kinyer(d) {

    const tipus = d.tipus || "lakas";
    const szoveg = [d.cim, d.leiras, d.forras_szoveg].filter(Boolean).join("\n");
    const javaslat = {};

    if (!szoveg.trim()) return javaslat;

    const ures = v => v === null || v === undefined || v === "" || (typeof v === "number" && !(v > 0));

    const ter = teruletek(szoveg);

    if (tipus === "telek") {

        // Teleknél az alapterület = a telek mérete
        if (ures(d.nm)) {

            const cimkezett = ter.find(x => x.telek && !x.hasznos && x.ertek >= 50 && x.ertek <= 5000000);
            const legnagyobb = ter.filter(x => !x.hasznos && x.ertek >= 100 && x.ertek <= 5000000)
                .sort((a, b) => b.ertek - a.ertek)[0];

            const v = !ures(d.telek_nm) ? { ertek: d.telek_nm } : (cimkezett || legnagyobb);

            if (v) javaslat.nm = v.ertek;

        }

    } else {

        if (ures(d.nm)) {

            const max = tipus === "lakas" ? 400 : tipus === "haz" ? 1500 : 20000;

            const hasznos = ter.find(x => x.hasznos && !x.telek && x.ertek >= 12 && x.ertek <= max);
            const barmi = ter.find(x => !x.telek && x.ertek >= 12 && x.ertek <= max);

            const v = hasznos || barmi;
            if (v) javaslat.nm = v.ertek;

        }

        if (tipus === "haz" && ures(d.telek_nm)) {

            const nm = d.nm || javaslat.nm || 0;
            const telek = ter.find(x => x.telek && !x.hasznos && x.ertek >= 50 && x.ertek !== nm)
                || ter.filter(x => !x.hasznos && x.ertek > Math.max(nm * 1.3, 150)).sort((a, b) => b.ertek - a.ertek)[0];

            if (telek) javaslat.telek_nm = telek.ertek;

        }

        if ((tipus === "lakas" || tipus === "haz" || tipus === "iroda") && ures(d.szobak)) {
            const n = szobakSzovegbol(szoveg);
            if (n) javaslat.szobak = n;
        }

        if ((tipus === "lakas" || tipus === "iroda" || tipus === "kereskedelmi") && (d.emelet === null || d.emelet === undefined || d.emelet === "")) {
            const e = emeletSzovegbol(szoveg);
            if (e !== null) javaslat.emelet = e;
        }

    }

    // Ár: ha hiányzik vagy nem hihető (pl. 0,2 € – a lista €/m²-t vagy ezret adott)
    if (!arHiheto(d.ar, d.ugylet)) {
        const nmAr = d.nm > 0 ? d.nm : javaslat.nm;
        const ar = arSzovegbol(szoveg, nmAr, d.ugylet);
        if (ar) javaslat.ar = ar;
        else if (d.ar > 0) javaslat.ar = null;          // a hibás árat töröljük -> ellenőrzésre kerül
    }

    if (tipus === "telek" && !d.telek_jelleg) {
        const j = telekJelleg(szoveg);
        if (j) javaslat.telek_jelleg = j;
    }

    if (ures(d.evszam) && tipus !== "telek") {
        const ev = evszamSzovegbol(szoveg);
        if (ev) javaslat.evszam = ev;
    }

    return javaslat;

}

module.exports = { kinyer, arSzovegbol, arHiheto, telekJelleg, teruletek, szobakSzovegbol, emeletSzovegbol, evszamSzovegbol, helyTippek, telepulesKeres, szamSzovegbol };
