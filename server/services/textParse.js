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

const MERTEK = "(?:mpu\\b|mp|m²|m2|m\\.p\\.|metri\\s*p[aă]tra[tț]i|nm|n\\.m\\.|n[eé]gyzetm[eé]ter|sqm|ari|a\\b|ar\\b|ha\\b|hectare?|hectar|hekt[aá]r)";

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

        // Közvetlenül utána álló címke ("120 mp utili", "400 m² telek") – ez erősebb,
        // mint egy távolabbi előtte álló ("52 m² hasznos alapterület, 400 m² telek")
        const utanaTelek = /^\s*(?:de\s+)?(?:teren|telek|telket|curte|gr[aă]din|kert)/i.test(utana);
        const utanaHasznos = /^\s*(?:util|utili|hasznos|lak[oó]ter)/i.test(utana) || /^mpu/i.test(egyseg);

        if (!fold && utanaTelek) { telek = true; hasznos = false; }
        else if (!fold && utanaHasznos) { hasznos = true; telek = false; }
        else if (!telek && !hasznos && /^\s*(?:construit|be[eé]p[ií]tett)/i.test(utana)) hasznos = true;

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

    // "2+1 szobás", "2 + 1 félszobás" (a fél szoba is szoba)
    const plusz = s.match(/\b(\d)\s*\+\s*(\d)\s*(?:fel)?\s*-?\s*szob/);
    if (plusz) {
        const n = Number(plusz[1]) + Number(plusz[2]);
        if (n >= 1 && n <= 20) return n;
    }

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

// Az emelet és (ha kiderül) az épület emeleteinek száma: "2/4", "0/4", "3".
// Felismeri: "Etaj 2/4", "et. 2/4", "etajul 3 (din 4)", "parter din 4", "P/4",
// "bloc P+4", "ultimul etaj", "mansardă", "3. emeleti", "2/4 emeleten",
// "a 4 emeletes tömb 2. emeletén", "földszinti".
function emeletSzovegbol(t) {

    const s = ekezetNelkul(t).toLowerCase();

    const emSzam = e => /^(p|parter)$/.test(e) ? 0 : /^(d|demisol|subsol)$/.test(e) ? -1 : /^(m|mansarda)$/.test(e) ? "M" : Number(e);

    let emelet = null, ossz = null;

    // Az épület emeleteinek száma: "P+4", "P+4+M", "4 etaje", "4 emeletes"
    {
        const p = s.match(/\b(?:p|parter)\s*\+\s*(\d{1,2})(\s*\+\s*(?:m|mansarda|e|etaj retras))?\b/);
        const etaje = s.match(/\b(?:bloc|imobil|cladire)\w*\s+(?:cu\s+)?(\d{1,2})\s+etaje\b/) || s.match(/\b(\d{1,2})\s+etaje\b/);
        const emeletes = s.match(/\b(\d{1,2})\s*-?\s*emeletes\b/);
        if (p) ossz = Number(p[1]) + (p[2] ? 1 : 0);
        else if (etaje) ossz = Number(etaje[1]);
        else if (emeletes) ossz = Number(emeletes[1]);
    }

    // "Etaj 2/4", "et. 2/4", "etajul 3 (din 4)", "Etaj: Parter / 4", "etaj 3 din 4"
    let m = s.match(/\b(?:etaj(?:ul)?|et\.?)\s*:?\s*(parter|p|demisol|mansarda|\d{1,2})\s*(?:\/|\(\s*din|din)\s*(\d{1,2})\b/);

    // "parter din 4", "P/4", "parter/4"
    if (!m) m = s.match(/\b(parter|p)\s*(?:\/|din)\s*(\d{1,2})\b/);

    // "ultimul etaj (4/4)", "etaj intermediar 2/4"
    if (!m) m = s.match(/\betaj\w*[^0-9.,;]{0,18}\(?\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\)?/);

    // "2/4 emeleten", "2/4 etaj"
    if (!m) m = s.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:-?\s*(?:emelet|etaj))/);

    if (m) {
        const e = emSzam(m[1]);
        const o = Number(m[2]);
        emelet = e === "M" ? o : e;
        ossz = o;
    }

    if (emelet === null) {
        const e = s.match(/\bla\s+etajul\s+(\d{1,2})\b/) || s.match(/\betaj(?:ul)?\s*:?\s*(\d{1,2})\b/) || s.match(/\b(\d{1,2})\.\s*emelet\w*/);
        if (e) emelet = Number(e[1]);
        else if (/\b(la|situat\w* la)\s+parter\b|\betaj\s*:?\s*parter\b|\bparter\b(?!\s*\+)|\bf[oö]ldszint\w*|\bground floor\b/.test(s)) emelet = 0;
        else if (/\bultimul etaj\b|\blegfels[oő] emelet\w*|\btop floor\b/.test(s) && ossz !== null) emelet = ossz;
        else if (/\bmansard[aă]\b|\btet[oö]t[eé]r\w*/.test(s) && ossz !== null) emelet = ossz;
    }

    if (emelet === null || isNaN(emelet) || emelet > 40 || emelet < -1) return null;
    if (ossz !== null && (isNaN(ossz) || ossz > 40 || ossz < Math.max(emelet, 0))) ossz = null;

    return ossz !== null ? `${emelet}/${ossz}` : String(emelet);

}

// ---------- Építés éve ----------

function evszamSzovegbol(t) {

    const s = ekezetNelkul(t).toLowerCase();
    const EV = "(1[89]\\d{2}|20[0-3]\\d)";

    const minta = [
        new RegExp(`\\ban(?:ul)?\\s*(?:de\\s*)?constr\\w*\\.?\\s*:?\\s*${EV}`),                       // An construcție: 1985, anul construcției: 1972
        new RegExp(`\\bconstruit[aă]?\\s+(?:in\\s+)?(?:anul\\s+)?${EV}`),                                // construit în 2008
        new RegExp(`\\b(?:bloc|imobil|cladire|casa|vila|constructie)\\w*\\s+(?:din|construit\\w*\\s+in)\\s+(?:anul\\s+)?${EV}`), // bloc din 1978
        new RegExp(`(?:epites|epult|epitett)[^0-9]{0,15}${EV}`),                                            // épült 1975-ben, építés éve: 1980
        new RegExp(`${EV}\\s*-?\\s*(?:as|es|os|ban|ben)\\s+(?:epitesu|epult|epitett)`),                    // 1980-as építésű, 1975-ben épült
        new RegExp(`\\b(?:built|year built|construction year)\\s*(?:in|:)?\\s*${EV}`)                      // built in 2005
    ];

    for (const re of minta) {
        const m = s.match(re);
        if (m) {
            const ev = Number(m[1]);
            if (ev >= 1850 && ev <= new Date().getFullYear() + 3) return ev;
        }
    }

    return null;

}

// ---------- Hely-tippek a szövegből ----------

// Utca / környék nevek a helymeghatározáshoz ("str. Kós Károly", "zona Ciucului",
// "Gábor Áron utca", "Csíki negyed")
const UTCA_TIPUS = [
    [/^(?:str(?:ada)?\.?)$/i, "Strada"],
    [/^(?:b-?dul\.?|bulevardul|bd\.?)$/i, "Bulevardul"],
    [/^aleea$/i, "Aleea"],
    [/^calea$/i, "Calea"],
    [/^pia[tț]a$/i, "Piața"]
];

// Általános szavak, amik nem utcanevek ("strada principală", "zona centrală" a fűtésnél...)
const NEM_NEV = /^(principal[aă]?|lini[sș]tit[aă]?|lini[sș]tii|lini[sș]tita|asfaltat[aă]?|intens[aă]?|circulat[aă]?|pietruit[aă]?|nou[aă]?|rezidential[aă]?|termic[aă]?|proprie|de gaz|foarte|buna|bun[aă]|centrala termica)$/i;

function helyTippek(t) {

    const s = String(t || "").replace(/\s+/g, " ");
    const tippek = [];

    const B = "[A-ZĂÂÎȘȚŞŢÁÉÍÓÖŐÚÜŰ0-9][\\wăâîșțşţáéíóöőúüűĂÂÎȘȚÁÉÍÓÖŐÚÜŰ'-]*\\.?";
    const NEV = `(${B}(?:[ ](?:(?:cel|de|lui|din|la)[ ])?${B}){0,3})`;

    // A név vége: "nr. 12", "bl. 4", mondatvég
    const tisztit = n => String(n || "")
        .split(/\.\s/)[0]
        .replace(/\s+(?:nr|num[aă]r|bl|sc|ap|et|etaj|in|în|si|și|cu|langa|lângă|aproape)\b.*$/i, "")
        .replace(/[.,;:]+$/, "")
        .trim();

    for (const m of s.matchAll(new RegExp("(?<![\\wăâîșțáéíóöőúüű])(str(?:ada)?\\.?|b-?dul\\.?|bulevardul|bd\\.|aleea|calea|pia[tț]a) " + NEV, "gi"))) {
        const nev = tisztit(m[2]);
        if (!nev || NEM_NEV.test(nev)) continue;
        const tipus = (UTCA_TIPUS.find(([re]) => re.test(m[1])) || [null, "Strada"])[1];
        tippek.push({ szoveg: `${tipus} ${nev}`, szint: "utca" });
    }

    for (const m of s.matchAll(new RegExp(NEV + " (?:utca|út|útja|tér)(?![\\wáéíóöőúüű])", "g"))) {
        const nev = tisztit(m[1]);
        if (nev) tippek.push({ szoveg: nev + " utca", szint: "utca" });
    }

    // Magyar rövidítés: "Gábor Áron u. 12"
    for (const m of s.matchAll(new RegExp(NEV + " u\\.(?=\\s*\\d|\\s*,|\\s*$|\\s+sz)", "g"))) {
        const nev = tisztit(m[1]);
        if (nev) tippek.push({ szoveg: nev + " utca", szint: "utca" });
    }

    for (const m of s.matchAll(new RegExp("(?<![\\wăâîșțáéíóöőúüű])(?:zona|zon[aă]|cartier(?:ul)?) " + NEV, "gi"))) {
        const nev = tisztit(m[1]);
        if (nev && !NEM_NEV.test(nev)) tippek.push({ szoveg: nev, szint: "kozelito" });
    }

    for (const m of s.matchAll(new RegExp(NEV + " (?:negyed|lakótelep|lakótelepen|városrész|negyedben)(?![\\wáéíóöőúüű])", "g"))) {
        const nev = tisztit(m[1]);
        if (nev) tippek.push({ szoveg: nev, szint: "kozelito" });
    }

    // Nevezetes helyek a közelben ("lângă Kaufland", "a kórház mellett") – csak
    // közelítő helynek jók, és csak ha a városban egyértelmű (location.js)
    tippek.push(...nevezetesHelyek(s));

    const lattam = new Set();
    return tippek.filter(x => {
        const k = x.szoveg.toLowerCase();
        if (lattam.has(k) || x.szoveg.replace(/^(Strada|Bulevardul|Aleea|Calea|Piața) /, "").length < 3) return false;
        lattam.add(k);
        return true;
    }).slice(0, 5);

}

// ---------- Nevezetes helyek ----------

// [minta (ékezet nélkül), a kereséshez használt név]
const NEVEZETES = [
    ["kaufland", "Kaufland"], ["lidl", "Lidl"], ["penny(?: market)?", "Penny"], ["profi", "Profi"],
    ["carrefour", "Carrefour"], ["auchan", "Auchan"], ["mega image", "Mega Image"], ["billa", "Billa"],
    ["dedeman", "Dedeman"], ["hornbach", "Hornbach"], ["(?:shopping\\s+)?mall(?:ul)?", "Mall"],
    ["spital(?:ul)?(?: judetean| municipal)?", "Spitalul"], ["korhaz(?:at)?", "Spitalul"],
    ["autogara", "Autogara"], ["gara|vasutallomas|allomas", "Gara"],
    ["piata centrala|piata|piac(?:ot)?", "Piața"], ["primaria|polgarmesteri hivatal", "Primăria"],
    ["stadion(?:ul)?", "Stadionul"], ["catedrala", "Catedrala"]
];

function nevezetesHelyek(szoveg) {

    const s = ekezetNelkul(szoveg).toLowerCase();
    const ki = [];

    for (const [minta, nev] of NEVEZETES) {
        const ro = new RegExp(`\\b(?:langa|aproape de|in apropiere(?:a)? de|vis-a-vis de|vizavi de|peste drum de|in spatele|in fata|la (?:\\d+ )?(?:m|metri|minute) de)\\s+(?:${minta})\\b`);
        const hu = new RegExp(`\\b(?:a\\s+|az\\s+)?(?:${minta})\\s+(?:mellett|kozeleben|kozelben|szomszedsagaban|mogott|szemben|elott|kozvetlen kozeleben)\\b`);
        const en = new RegExp(`\\b(?:near|next to|close to|opposite)\\s+(?:the\\s+)?(?:${minta})\\b`);
        if (ro.test(s) || hu.test(s) || en.test(s)) ki.push({ szoveg: nev, szint: "kozelito", nevezetes: true });
    }

    return ki;

}

// ---------- Település (háznál, teleknél: nem a városban, hanem mellette) ----------

// A hirdetési oldalak gyakran "Város (Megye)" formában írják a helyet:
// "Sfantu Gheorghe (Covasna)", "Arcus, Covasna", "Covasna (judet)". A megye
// neve NEM település – különben minden ilyen hirdetés Kovászna városba
// kerülne. Ezeket a felismerés előtt kivesszük a szövegből.
const MEGYE_RO = "(?:covasna|harghita|brasov|mures|cluj|hunedoara|alba|sibiu)";

function megyeNelkul(s) {

    let t = " " + s + " ";

    t = t.replace(new RegExp(`\\(\\s*(?:jud(?:etul|et)?\\.?\\s*)?${MEGYE_RO}\\s*\\)`, "g"), " ");
    t = t.replace(new RegExp(`(?:^|[^a-z])(?:jud(?:etul|et)?\\.?|judet(?:ul)?|county|megye)\\s+${MEGYE_RO}(?=[^a-z]|$)`, "g"), " ");
    t = t.replace(new RegExp(`(?:^|[^a-z])${MEGYE_RO}\\s*\\(?\\s*(?:jud(?:etul|et)?|judet(?:ul)?|county)(?=[^a-z]|$)\\.?\\)?`, "g"), " ");
    t = t.replace(/(?:^|[^a-z])(?:kovaszna|hargita|brasso|maros|kolozs)\s+megye\w*/g, " ");
    // "Arcus, Covasna" / "Sfantu Gheorghe/covasna" / "Belin - Covasna": a megye a hely után
    t = t.replace(new RegExp(`([a-z])\\s*[,/]\\s*${MEGYE_RO}(?=[^a-z]|$)`, "g"), "$1 ");
    t = t.replace(new RegExp(`([a-z])\\s+-\\s+${MEGYE_RO}(?=[^a-z]|$)`, "g"), "$1 ");

    return t;

}

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Helyre utaló szó a név előtt ("în Ozun", "comuna Reci", "satul Bita", "la Arcuș")
const HELY_ELOTAG = "(?:in|la|din|spre|sat(?:ul)?|comuna|com\\.?|localitatea|localitate|loc\\.?|statiunea|orasul|oras)\\s+";

// Magyar ragok a falu neve után ("Uzonban", "Illyefalván", "Kilyénben", "Árkoson")
const HU_RAG = "(?:ban|ben|on|en|n|ba|be|ra|re|rol|tol|hoz|hez|nal|nel|i)";

//  Település a szövegből (háznál, teleknél; a "... és környéke" városokban minden típusnál).
//   varosRo:  a hirdetés városának román neve (a város maga nem "település")
//   eros:     cím, forrás szerinti város / környék – ha benne van a név, elhisszük
//   gyenge:   leírás – csak "în X", "sat X", "comuna X" (vagy magyar raggal: "Uzonban") formában
//   opts.varos: a mi városkulcsunk (pl. "Sepsiszentgyorgy") – először a környékbeli falvakat nézzük
//   opts.varosNevek: a város további nevei (magyar név, rövidítés), ezek sem települések
//  -> a település román neve, vagy null
// A nevek mintái egyszer készülnek el (sok hirdetésen fut végig)
const NEV_MINTAK = new Map();

function nevMinta(n) {
    let m = NEV_MINTAK.get(n.k + (n.hu ? "|hu" : ""));
    if (!m) {
        const k = reEsc(n.k);
        m = {
            elotaggal: new RegExp(`(?:^|[^a-z])${HELY_ELOTAG}${k}(?=[^a-z]|$)`),
            raggal: n.hu ? new RegExp(`(?:^|[^a-z])${k}${HU_RAG}(?=[^a-z]|$)`) : null,
            megyevel: new RegExp(`(?:^|[^a-z])${k}\\s*[,(/-]\\s*(?:jud(?:etul|et)?\\.?\\s*)?${MEGYE_RO}(?=[^a-z]|$)`),
            barhol: new RegExp(`(?:^|[^a-z])${k}(?=[^a-z]|$)`),
            koznev: Telepulesek.koznev(n.k)
        };
        NEV_MINTAK.set(n.k + (n.hu ? "|hu" : ""), m);
    }
    return m;
}

function telepulesKeres(varosRo, eros, gyenge, opts = {}) {

    const kizart = new Set([varosRo, ...(opts.varosNevek || [])].map(Telepulesek.kulcs).filter(Boolean));

    const jelolt = lista => lista
        .flatMap(t => [{ t, k: Telepulesek.kulcs(t.ro), hu: false }, { t, k: Telepulesek.kulcs(t.hu), hu: true }])
        .filter(x => x.k && x.k.length >= 3 && !kizart.has(x.k))
        .sort((a, b) => b.k.length - a.k.length);

    // Először a város környékének falvai, utána a többi
    const sajat = opts.varos ? Telepulesek.regio(opts.varos) : [];
    const csoportok = [jelolt(sajat), jelolt(Telepulesek.LISTA.filter(t => !sajat.includes(t)))];

    const illeszt = (szoveg, csakJelolve) => {

        const eredeti = Telepulesek.kulcs(szoveg);
        if (!eredeti) return null;
        const s = megyeNelkul(eredeti);

        for (const nevek of csoportok) {
            for (const n of nevek) {

                // Gyors szűrés: ha a név (ékezet nélkül) elő sem fordul, nem kell a minta
                if (!eredeti.includes(n.k)) continue;

                const m = nevMinta(n);

                // "Reci, Covasna" / "Bodoc (Covasna)": a megyével együtt egyértelmű
                if (m.elotaggal.test(s) || (m.raggal && m.raggal.test(s)) || m.megyevel.test(eredeti)) return n.t.ro;
                if (!csakJelolve && !m.koznev && m.barhol.test(s)) return n.t.ro;

            }
        }

        return null;

    };

    for (const e of eros || []) {
        const x = illeszt(e, false);
        if (x) return x;
    }

    for (const g of gyenge || []) {
        const x = illeszt(g, true);
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
