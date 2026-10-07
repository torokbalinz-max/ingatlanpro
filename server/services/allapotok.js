// ============================================================
//  Állapotok (felújítandó, jó, újépítésű...) – az admin kezeli
//
//  Az állapotok listája az adatbázisban van (allapotok tábla), így
//  új állapotot kód nélkül, az admin felületen lehet felvenni
//  (Admin → Állapotok). Ez a modul:
//   - gyorstárban tartja a listát (induláskor és minden admin-
//     módosítás után újratölti),
//   - egységesíti a régi / eltérő írásmódokat ("jó*", "új", "Lux"),
//   - megmondja a címkét, a színt, a szintet és az értékbecslő arányát,
//   - felismeri az állapotot a hirdetés szövegéből (román, magyar,
//     angol kifejezések + az admin saját kulcsszavai).
// ============================================================

const db = require("../db/database");
const { ALAP_ALLAPOTOK } = require("../lib/allapotAlap");

// Amíg az adatbázisból nem töltöttük be: a kezdő lista
let lista = ALAP_ALLAPOTOK.map(a => ({ ...a, kulcsszavak: "", aktiv: true, beepitett: true }));
let betoltes = null;

function sor(r) {
    return {
        kulcs: r.kulcs,
        nev_hu: r.nev_hu,
        nev_ro: r.nev_ro || null,
        nev_en: r.nev_en || null,
        szin: r.szin || "#6b7280",
        szint: r.szint === null || r.szint === undefined ? null : Number(r.szint),
        szorzo: r.szorzo === null || r.szorzo === undefined ? null : Number(r.szorzo),
        kulcsszavak: r.kulcsszavak || "",
        sorrend: Number(r.sorrend) || 0,
        aktiv: r.aktiv !== false,
        beepitett: !!r.beepitett
    };
}

async function betolt() {
    try {
        await db.ready;
        const r = await db.query("SELECT * FROM allapotok ORDER BY sorrend, kulcs");
        if (r.rowCount) lista = r.rows.map(sor);
    } catch (e) {
        console.error("Állapotok betöltése:", e.message);
    }
    return lista;
}

// Az első híváskor betöltjük (a szerver indulásakor a server.js hívja)
function kesz() {
    if (!betoltes) betoltes = betolt();
    return betoltes;
}

function frissit() {
    betoltes = betolt();
    return betoltes;
}

const osszes = () => lista.slice();
const aktivak = () => lista.filter(a => a.aktiv);
const kulcsok = (csakAktiv = true) => (csakAktiv ? aktivak() : lista).map(a => a.kulcs);

// ---------- egységesítés ----------

function ekezetNelkul(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Az adatokban előforduló írásmódok -> kulcs ("jó*" -> "jó", "Felújított" -> ...)
//  ismeretlen szövegnél a kisbetűs szöveget adja vissza (régi, szabad szöveges érték)
function norm(a) {

    const v = String(a || "").replace(/\*/g, "").trim().toLowerCase();
    if (!v) return "";

    const pontos = lista.find(x => x.kulcs === v);
    if (pontos) return pontos.kulcs;

    const e = ekezetNelkul(v);

    const nevrol = lista.find(x => [x.kulcs, x.nev_hu, x.nev_ro, x.nev_en].some(n => n && ekezetNelkul(n) === e));
    if (nevrol) return nevrol.kulcs;

    // Régi / rövidített írásmódok
    if (e === "uj" || e.startsWith("ujsz")) return "újszerű";
    if (e.startsWith("ujep") || e.startsWith("uj ep") || e === "new build") return "újépítésű";
    if (e.startsWith("reszben")) return "részbenfel";
    if (e.startsWith("feluj")) return "felújítandó";
    if (e.startsWith("felkesz") || e.startsWith("szerkezetkesz")) return "félkész";
    if (e.startsWith("kozep") || e === "atlagos" || e === "lakhato") return "közepes";
    if (e === "jo") return "jó";
    if (e.startsWith("lux")) return "luxus";

    return v;

}

// Egy beküldött érték (űrlap, import) -> a tárolandó érték:
// ismert állapot kulcsa, vagy (régi adat) a szöveg maga, vagy null
function normalizal(a) {
    const s = String(a ?? "").trim();
    if (!s) return null;
    const k = norm(s);
    if (lista.some(x => x.kulcs === k)) return k;
    return s.slice(0, 40);
}

const adat = a => {
    const k = norm(a);
    return lista.find(x => x.kulcs === k) || null;
};

const ervenyes = k => lista.some(x => x.kulcs === k);

function rang(a) {
    const x = adat(a);
    return x && x.szint !== null ? x.szint : null;
}

function szorzo(a) {
    const x = adat(a);
    return x && x.szorzo > 0 ? x.szorzo : null;
}

function cimke(a, nyelv = "hu") {
    const x = adat(a);
    if (!x) return a ? String(a).replace(/\*/g, "") : "";
    return x["nev_" + nyelv] || x.nev_hu || x.kulcs;
}

// A weboldalnak (/api/config): minden állapot (a kikapcsoltak is, hogy a
// régi hirdetéseken a címke megjelenjen), a kulcsszavak nélkül
function nyilvanos() {
    return lista.map(({ kulcsszavak, beepitett, ...x }) => x);
}

// ---------- felismerés a szövegből ----------

// Kisbetű, ékezet nélkül – karakterenként, hogy a találat helye az
// eredeti szövegben is ugyanott legyen (a kiírt idézethez)
function egyszerusit(s) {
    return Array.from(String(s || "")).map(c => {
        if (c.length > 1) return " ".repeat(c.length);
        const d = c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        return d.length === 1 ? d : (d[0] || " ");
    }).join("");
}

// Beépített kifejezések, ERŐSORRENDBEN: az első egyező szabály dönt.
// (A "nu necesită renovare" előbb van, mint a "necesită renovare";
// a konkrét, ritka kifejezések előbb, mint az általánosak.)
const SZABALYOK = [

    // "nem kell felújítani" -> jó
    ["jó", /\b(?:nu|fara sa)\s+(?:mai\s+)?(?:necesita|are nevoie de|e nevoie de|este nevoie de|trebuie)\s+(?:\w+\s+){0,2}?(?:renovar\w*|investiti\w*|reparati\w*|lucrari\w*|interventi\w*|modernizar\w*)/, { tagadas: false }],
    ["jó", /\bfara (?:alte |nicio |vreo )?(?:investitii|renovari|reparatii)\b/, { tagadas: false }],
    ["jó", /\bnem (?:igenyel|kell|szorul)\w*\s+(?:semmilyen\s+|semmi\s+)?(?:felujitas\w*|befektetes\w*|javitas\w*)/, { tagadas: false }],
    ["jó", /\b(?:doesn'?t|does not|no) need\w*\s+(?:any\s+)?(?:renovation|repairs?|investment)/, { tagadas: false }],

    // Félkész / szerkezetkész (la roșu, la gri, la alb)
    ["félkész", /\b(?:la|stadiul?|stadiu de|in stadiul? de)\s+(?:rosu|gri)\b/],
    ["félkész", /\bla alb\b/],
    ["félkész", /\bnefinisat\w*|\bnefinalizat\w*|\bneterminat\w*|\bfara finisaje\b|\bfinisaje neincepute\b/],
    ["félkész", /\bszerkezetkesz\w*|\bfelkesz\w*|\bbefejezetlen\w*|\bszurke ?szerkezet\w*/],
    ["félkész", /\bunfinished\b|\bshell condition\b/],

    // Részben felújított (előbb, mint a felújítandó: "részben felújított, a fürdő
    // felújításra szorul" – az egészre a "részben felújított" igaz)
    ["részbenfel", /\brenovat\w*\s+(?:doar\s+)?partial\w*|\bpartial\s+renovat\w*|\bsemi[- ]?renovat\w*|\bpartial\s+modernizat\w*|\bmodernizat\w*\s+partial\w*|\brenovari partiale\b/],
    ["részbenfel", /\breszben\s+(?:felujitott\w*|felujitva|modernizalt\w*)|\breszlegesen\s+felujitott\w*/],
    ["részbenfel", /\bpart(?:ial)?ly\s+(?:renovated|refurbished)\b/],

    // Felújítandó
    ["felújítandó", /\bnecesita\s+(?!(?:doar\s+|unele\s+|cateva\s+)?(?:mici|minime|usoare|cateva)\b)(?:o\s+|unele\s+|niste\s+)?(?:\w+\s+){0,2}?(?:renovare|renovari|reparatii|modernizare|refacere|reabilitare|investitii)\b/],
    ["felújítandó", /\bde renovat\b|\bnerenovat\w*|\bin stare de renovare\b|\bpentru renovare\b|\bpotrivit\w* pentru renovare\b|\bde (?:re)?amenajat\b/],
    ["felújítandó", /\bnu (?:este|a fost|au fost) (?:\w+\s+)?renovat\w*/, { tagadas: false }],
    ["felújítandó", /\bstare(?:a)? (?:de )?(?:degradare|degradata)\b|\bstare(?:a)? (?:foarte )?(?:proasta|precara|rea)\b|\bde demolat\b/],
    ["felújítandó", /\bse poate renova\b|\bpoate fi renovat\w* (?:dupa|in functie de|conform)\b/],
    ["felújítandó", /\bfelujitando\b|\bfelujitasra (?:szorul\w*|var\w*)|\bfelujitast igenyel\w*|\bromos\w*|\blelakott\w*|\brossz allapot\w*|\bbontand[oa]\b/],
    ["felújítandó", /\b(?:nem|nincs) felujitva\b|\bnem felujitott\w*/, { tagadas: false }],
    ["felújítandó", /\bneeds?\s+(?:a\s+)?(?:full\s+|complete\s+|total\s+|some\s+)?renovation\b|\brequires renovation\b|\bto renovate\b|\bfixer[- ]upper\b/],

    // Luxus
    ["luxus", /\bde lux\b|\bfinisaje\s+(?:de\s+)?(?:lux|premium|high[- ]end|exclusiviste)\b|\bmateriale\s+(?:de\s+)?(?:lux|premium)\b|\bluxos\w*|\blux\b|\bhigh[- ]end\b/],
    ["luxus", /\bluxus\w*|\bprem?ium kivitel\w*|\bpremium minoseg\w*/],
    ["luxus", /\bluxur(?:y|ious)\b|\bpremium finish\w*/],

    // Újépítésű
    ["újépítésű", /\bbloc(?:ul)?\s+nou\b|\bconstructi[ea]\s+noua\b|\bimobil(?:ul)?\s+nou\b|\bcladire(?:a)?\s+noua\b|\b(?:casa|vila)\s+noua\b(?!\s*renovat)/],
    ["újépítésű", /\bapartament(?:ul)?\s+nou\b(?![\s-]*(?:renovat|amenajat|mobilat))/],
    ["újépítésű", /\b(?:ansamblu|complex|proiect)(?:ul)?\s+rezidential\b|\bdezvoltator\w*|\bdeveloper\b/],
    ["újépítésű", /\btva inclus\w*|\+\s*tva\b|\bplus tva\b/],
    ["újépítésű", /\bpredare\s+(?:in\s+|estimata\s+|la\s+)?(?:\w+\s+)?20[2-3]\d\b|\btermen de predare\b/],
    ["újépítésű", /\b(?:bloc\w*|imobil\w*|constructi\w*|cladir\w*|ansamblu\w*|proiect\w*|casa)\b[^.]{0,30}\bfinaliza\w*\s+(?:in\s+)?(?:\w+\s+)?20[2-3]\d\b/],
    ["újépítésű", /\bin constructie\b|\bnelocuit\w*|\bprima (?:inchiriere|locuire)\b/],
    ["újépítésű", /\buj ?epitesu\w*|\buj epites\w*|\buj lakopark\w*|\buj tarsashaz\w*|\bberuhazo\w*|\bkulcsrakesz\w*|\bmeg nem lakott\b/],
    ["újépítésű", /\bnew[- ]build\w*|\bnewly built\b|\bbrand new\b|\bnew development\b|\boff[- ]plan\b/],

    // Újszerű
    ["újszerű", /\bca (?:si )?no(?:u|ua|i)\b|\baproape no(?:u|ua)\b|\bstare (?:de )?no(?:u|ua)\b|\bstare impecabila\b|\bimpecabil\w*|\bstare perfecta\b|\bperfecta stare\b/],
    ["újszerű", /\bujszeru\w*|\bkifogastalan\w*|\bhibatlan allapot\w*/],
    ["újszerű", /\blike new\b|\bas new\b|\bimmaculate\b|\bmint condition\b/],

    // Közepes (lakható, de régi / átlagos)
    ["közepes", /\bstare(?:a)? (?:medie|satisfacatoare|decenta|initiala|de origine|originala)\b|\bnecesita\s+(?:doar\s+|o\s+|unele\s+|cateva\s+)?(?:igienizare|zugraveli\w*|retusuri|(?:mici|minime|usoare)\s+(?:\w+\s+)?(?:reparatii|investitii|renovari|lucrari|imbunatatiri))\b/],
    ["közepes", /\blocuibil\w*\s+(?:imediat|de indata)\b|\bstare locuibila\b|\b(?:casa|apartament\w*)\s+locuibil\w*|\bse poate locui\b/],
    ["közepes", /\batlagos allapot\w*|\bkozepes allapot\w*|\blakhato\b|\beredeti allapot\w*/],
    ["közepes", /\baverage condition\b|\bhabitable\b|\boriginal condition\b/],

    // Jó (felújított, rendben tartott)
    ["jó", /\brenovat\w*\s+(?:complet|recent|integral|total|in totalitate|de curand|in 20\d\d)\b|\b(?:complet|recent|integral|total|proaspat|nou)\s+renovat\w*/],
    ["jó", /\bstare(?:a)? (?:foarte )?buna\b|\bstare excelenta\b|\b(?:foarte )?bine intretinut\w*|\bgata de (?:mutare|locuit|utilizare)\b|\bfinisaje (?:moderne|de calitate|bune|noi)\b/],
    ["jó", /\brenovat\w*|\bmodernizat\w*|\bintretinut\w*/, { epulet: true }],
    ["jó", /\bfelujitott\w*|\bfelujitva\b|\bjo allapot\w*|\bkarbantartott\w*|\bbekoltozheto\b|\bigenyes\w*|\bmodernizalt\w*/, { epulet: true }],
    ["jó", /\brenovated\b|\brefurbished\b|\bgood condition\b|\bwell[- ]maintained\b|\bmove[- ]in ready\b/, { epulet: true }]

];

// Tagadás a találat előtt ("nu este renovat", "nem felújított")
const TAGADAS = /(?:\bnu\b|\bnem\b|\bnincs\b|\bnot\b|\bfara\b|\bno\b|\bnici\b)[^.,;!?]{0,18}$/;

// Az épületre (nem a lakásra) vonatkozó felújítás: "bloc renovat", "fațada renovată"
const EPULET = /\b(?:bloc\w*|fatad\w*|scar\w*|acoperis\w*|cladir\w*|imobil\w*|termoizol\w*|reabilitat\w*|izolat\w*|lift\w*|tomb\w*|homlokzat\w*|lepcsohaz\w*|teto\w*|epulet\w*)\b[^.,;]{0,22}$/;

function idezet(eredeti, index, hossz) {
    const k = Math.max(0, index - 40);
    const v = Math.min(eredeti.length, index + hossz + 40);
    return (k > 0 ? "…" : "") + eredeti.slice(k, v).replace(/\s+/g, " ").trim() + (v < eredeti.length ? "…" : "");
}

// Az első "jó" találat egy kifejezésre (a tagadott / épületre vonatkozó
// előfordulásokat átugorva)
function talal(t, re, opts = {}) {
    const g = new RegExp(re.source, "g");
    let m;
    while ((m = g.exec(t))) {
        const elotte = t.slice(Math.max(0, m.index - 40), m.index);
        if (opts.tagadas !== false && TAGADAS.test(elotte)) { if (m[0].length === 0) g.lastIndex++; continue; }
        if (opts.epulet && EPULET.test(elotte)) { if (m[0].length === 0) g.lastIndex++; continue; }
        return m;
    }
    return null;
}

// Az admin kulcsszavai -> szabályok (minden állapothoz, a beépítettekhez is)
let kulcsszoCache = { forras: null, szabalyok: [] };

function kulcsszoSzabalyok() {
    const forras = lista.map(a => a.kulcs + ":" + a.kulcsszavak + ":" + a.aktiv).join("|");
    if (kulcsszoCache.forras === forras) return kulcsszoCache.szabalyok;
    const szabalyok = [];
    lista.filter(a => a.aktiv && a.kulcsszavak).forEach(a => {
        String(a.kulcsszavak).split(/[,;\n]+/).map(x => egyszerusit(x).trim()).filter(x => x.length >= 3).forEach(kw => {
            const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
            szabalyok.push([a.kulcs, new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`)]);
        });
    });
    kulcsszoCache = { forras, szabalyok };
    return szabalyok;
}

//  Állapot a hirdetés szövegéből (cím, leírás, jellemzők) és az építés évéből
//   -> { ertek, ok, forras: "szoveg" | "ev" } vagy null
function felismer(szoveg, opts = {}) {

    const eredeti = String(szoveg || "");
    const t = egyszerusit(eredeti);
    const aktiv = new Set(kulcsok(true));

    if (t.trim()) {

        for (const [kulcs, re] of kulcsszoSzabalyok()) {
            if (!aktiv.has(kulcs)) continue;
            const m = talal(t, re);
            if (m) return { ertek: kulcs, ok: idezet(eredeti, m.index, m[0].length), forras: "szoveg" };
        }

        for (const [kulcs, re, o] of SZABALYOK) {
            if (!aktiv.has(kulcs)) continue;
            const m = talal(t, re, o || {});
            if (m) return { ertek: kulcs, ok: idezet(eredeti, m.index, m[0].length), forras: "szoveg" };
        }

    }

    // Az építés évéből (ha a szöveg nem mond semmit)
    const ev = Number(opts.evszam);
    const most = new Date().getFullYear();
    if (ev > 1800 && ev <= most + 3) {
        if (ev >= most - 2 && aktiv.has("újépítésű")) return { ertek: "újépítésű", ok: String(ev), forras: "ev" };
        if (ev >= most - 8 && aktiv.has("újszerű")) return { ertek: "újszerű", ok: String(ev), forras: "ev" };
    }

    return null;

}

module.exports = {
    kesz, frissit, osszes, aktivak, kulcsok, norm, normalizal, adat, ervenyes, rang, szorzo, cimke,
    nyilvanos, felismer, egyszerusit, ekezetNelkul, ALAP_ALLAPOTOK
};
