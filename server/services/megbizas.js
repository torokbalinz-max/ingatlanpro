// ============================================================
//  Eladjuk helyetted – megbízásos értékesítés
//
//  Egy megbízás = egy szál, hét szakasz. A szakaszok között „kapu” van:
//  amíg a feltétel nem teljesül, a megbízás nem lép tovább; ha teljesül,
//  magától továbblép (elorelep). Minden megbízásnál mindig egy „következő
//  lépés” látszik, egy felelőssel (kovetkezo).
//
//    1 uj          Igénylés      → kapu: megvolt az első hívás
//    2 egyeztetes  Egyeztetés    → kapu: az eladó jóváhagyta a csomagot és az árat
//                                  (ekkor a szerződés magától kimegy aláírásra)
//    3 szerzodes   Szerződés     → kapu: aláírva (online kóddal + ellenjegyezve,
//                                  vagy személyesen + szkennelt példány)
//    4 fotozas     Előkészítés   → kapu: a kért tartalmak (fotó, alaprajz, videó,
//                                  drón) készek + a hirdetés kész + az eladó jóváhagyta
//    5 hirdetes    Hirdetés és megtekintések (időpontfoglalás a naptárból)
//                                → kapu: ajánlat érkezett
//    6 targyalas   Ajánlatok     → kapu: mindkét fél elfogadott egy ajánlatot
//    7 adasvetel   Adásvétel     → előszerződés, iratok, közjegyző → eladva
//    (eladva | lezarva | elutasitva)
//
//  Vevők: érdeklődő → időpontja van → megnézte → ajánlatot tett → vevő.
//  Ajánlatot (alapból) csak az tehet, aki megnézte az ingatlant (vagy az
//  admin engedte), és csak finanszírozási adatokkal.
//
//  A megtekintési naptár: a megbízáshoz idősávok (napok, órák, egy
//  megtekintés hossza, szünet); a vevő a hirdetésen szabad időpontot foglal.
//
//  Automatizmusok (services/megbizasAuto.js): emlékeztetők, lejárt ajánlatok,
//  a kapuk ellenőrzése, megtekintés utáni levél.
//
//  FONTOS: a szerződés tervezet – romániai ügyvéddel ellenőriztetendő.
// ============================================================

const crypto = require("crypto");
const db = require("../db/database");
const csapat = require("./csapat");
const szerzodes = require("./megbizasSzerzodes");

const STATUSZOK = ["uj", "egyeztetes", "szerzodes", "fotozas", "hirdetes", "targyalas", "adasvetel", "eladva", "lezarva", "elutasitva"];
const SZAKASZOK = ["uj", "egyeztetes", "szerzodes", "fotozas", "hirdetes", "targyalas", "adasvetel"];
const AKTIV = SZAKASZOK;
// Ezekben a szakaszokban foglalhat időpontot és tehet ajánlatot a vevő
const VEVOI = ["hirdetes", "targyalas"];
// Ezekben látszik a vevőnek a megbízásos kártya (az adásvételnél: „foglalt”)
const LATHATO = ["hirdetes", "targyalas", "adasvetel"];
const ERDEKLODO_STATUSZOK = ["uj", "kapcsolat", "megtekintes", "ajanlat", "vevo", "elutasitva"];
const MEGTEKINTES_STATUSZOK = ["kert", "egyeztetve", "megtortent", "elmaradt", "lemondva"];
const AJANLAT_STATUSZOK = ["uj", "tovabbitva", "ellenajanlat", "elfogadva", "elutasitva", "visszavonva", "lejart"];
const NYITOTT_AJANLAT = ["uj", "tovabbitva", "ellenajanlat"];
const SZERZODES_ALLAPOTOK = ["tervezet", "elkuldve", "elfogadva", "alairva"];
const TIPUSOK = ["lakas", "haz", "telek", "kereskedelmi", "iroda"];
const FINANSZIROZAS = ["keszpenz", "hitel", "vegyes", "egyeb"];
const HITEL_ALLAPOT = ["elozetes", "folyamatban", "nincs"];
// Az előkészítés feladatai (a választott szolgáltatások közül)
const ELOKESZITO = ["foto", "alaprajz", "video", "dron"];
// A fájlok
const FAJL_TIPUSOK = ["irat", "szerzodes_alairt", "hitel_igazolas", "egyeb"];
const FAJL_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const KULCS = "megbizas";
const TZ = "Europe/Bucharest";

function hibaKod(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

const sz = (v, max) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
};

const szam = v => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TEL_RE = /^[+()\d\s./-]{6,40}$/;

function ma() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function datum(v) {
    if (!v) return null;
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function pgDatum(v) {
    if (!v) return null;
    if (v instanceof Date) {
        const p = n => String(n).padStart(2, "0");
        return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    return String(v).slice(0, 10);
}

function idopontOlvas(v) {
    if (!v) return null;
    const t = new Date(v);
    return isNaN(t) ? null : t;
}

// A megbízás lejárata: aláírás (vagy online elfogadás) + időtartam
function lejarat(m) {
    const kezd = pgDatum(m.alairva) || (m.szerzodes_elfogadva ? pgDatum(new Date(m.szerzodes_elfogadva)) : null);
    if (!kezd) return null;
    const d = new Date(kezd + "T12:00:00");
    d.setMonth(d.getMonth() + (Number(m.idotartam_honap) || 6));
    return pgDatum(d);
}

// ===================== IDŐ (Bukarest) =====================

// A Bukaresti idő eltérése az UTC-től (perc) egy adott pillanatban
function tzEltolas(ms) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
        timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    const utc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((utc - ms) / 60000);
}

// Helyi (bukaresti) nap + óra:perc → pillanat
function helyiIdo(nap, ora) {
    const [y, mo, d] = nap.split("-").map(Number);
    const [h, mi] = ora.split(":").map(Number);
    const kozelito = Date.UTC(y, mo - 1, d, h, mi);
    let ms = kozelito - tzEltolas(kozelito) * 60000;
    ms = kozelito - tzEltolas(ms) * 60000;
    return new Date(ms);
}

function helyiNap(t) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(t);
}

function napHozzaad(nap, n) {
    const [y, mo, d] = nap.split("-").map(Number);
    const t = new Date(Date.UTC(y, mo - 1, d + n));
    return t.toISOString().slice(0, 10);
}

// A hét napja: 1 = hétfő ... 7 = vasárnap
function hetNapja(nap) {
    const [y, mo, d] = nap.split("-").map(Number);
    const w = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    return w === 0 ? 7 : w;
}

function percbe(ora) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(ora || ""));
    if (!m) return null;
    const p = Number(m[1]) * 60 + Number(m[2]);
    return p >= 0 && p <= 24 * 60 ? p : null;
}

function orara(perc) {
    return `${String(Math.floor(perc / 60)).padStart(2, "0")}:${String(perc % 60).padStart(2, "0")}`;
}

// ===================== BEÁLLÍTÁSOK (díjak, opciók, automatizmusok) =====================

const ALAP_OPCIOK = [
    { kod: "foto", ikon: "fa-solid fa-camera", ar: 0, alap: true,
      nev: { hu: "Profi fotózás", ro: "Fotografii profesionale", en: "Professional photos" },
      leiras: { hu: "20–30 világos, nagylátószögű fénykép – a hirdetés legfontosabb része.", ro: "20–30 de fotografii luminoase, cu unghi larg – cea mai importantă parte a anunțului.", en: "20–30 bright, wide-angle photos – the most important part of the listing." } },
    { kod: "hirdetes", ikon: "fa-solid fa-bullhorn", ar: 0, alap: true,
      nev: { hu: "Hirdetés és kiemelés", ro: "Anunț și promovare", en: "Listing and promotion" },
      leiras: { hu: "Mi írjuk meg és tesszük fel a hirdetést, kiemelve az IngatlanPro-n.", ro: "Noi scriem și publicăm anunțul, promovat pe IngatlanPro.", en: "We write and publish the listing, featured on IngatlanPro." } },
    { kod: "vevok", ikon: "fa-solid fa-user-check", ar: 0, alap: true,
      nev: { hu: "Érdeklődők szűrése, ajánlatok kezelése", ro: "Filtrarea celor interesați, gestionarea ofertelor", en: "Buyer screening and offers" },
      leiras: { hu: "Mi válaszolunk, előszűrjük a vevőket (költségkeret, szándék), továbbítjuk az ajánlatokat.", ro: "Noi răspundem, filtrăm cumpărătorii (buget, intenție) și transmitem ofertele.", en: "We answer, pre-screen buyers (budget, intent) and pass on offers." } },
    { kod: "alaprajz", ikon: "fa-solid fa-ruler-combined", ar: 150, penznem: "RON", alap: false,
      nev: { hu: "Alaprajz", ro: "Plan al locuinței", en: "Floor plan" },
      leiras: { hu: "Méretezett alaprajz a hirdetéshez.", ro: "Plan cotat pentru anunț.", en: "A measured floor plan for the listing." } },
    { kod: "video", ikon: "fa-solid fa-video", ar: 250, penznem: "RON", alap: false,
      nev: { hu: "Videós bemutató / virtuális séta", ro: "Prezentare video / tur virtual", en: "Video tour" },
      leiras: { hu: "Rövid videó a közösségi médiához és a hirdetéshez.", ro: "Video scurt pentru rețelele sociale și anunț.", en: "A short video for social media and the listing." } },
    { kod: "dron", ikon: "fa-solid fa-helicopter", ar: 200, penznem: "RON", alap: false,
      nev: { hu: "Drónfotók", ro: "Fotografii cu drona", en: "Drone photos" },
      leiras: { hu: "Háznál, teleknél: a környék és a telek felülről.", ro: "Pentru case și terenuri: zona și terenul de sus.", en: "For houses and plots: the area and plot from above." } },
    { kod: "kampany", ikon: "fa-solid fa-rectangle-ad", ar: 300, penznem: "RON", alap: false,
      nev: { hu: "Közösségi média kampány", ro: "Campanie pe rețelele sociale", en: "Social media campaign" },
      leiras: { hu: "Fizetett hirdetés a Facebookon / Instagramon a környékbeli vevőknek.", ro: "Reclamă plătită pe Facebook / Instagram pentru cumpărătorii din zonă.", en: "Paid Facebook / Instagram ads targeting local buyers." } },
    { kod: "portalok", ikon: "fa-solid fa-globe", ar: 0, alap: false,
      nev: { hu: "Megjelenés más portálokon is", ro: "Publicare și pe alte portaluri", en: "Also on other portals" },
      leiras: { hu: "A hirdetést más ingatlanportálokra is feltesszük.", ro: "Publicăm anunțul și pe alte portaluri imobiliare.", en: "We also publish the listing on other property portals." } },
    { kod: "bemutatas", ikon: "fa-solid fa-door-open", ar: 0, alap: false,
      nev: { hu: "Megtekintések: mi mutatjuk be", ro: "Vizionări: le facem noi", en: "Viewings: we show it" },
      leiras: { hu: "Ha nem érsz rá: időpontot egyeztetünk, és mi mutatjuk be az ingatlant.", ro: "Dacă nu ai timp: programăm vizionările și le facem noi.", en: "If you're busy: we schedule viewings and show the property." } },
    { kod: "jogi", ikon: "fa-solid fa-file-signature", ar: 0, alap: false,
      nev: { hu: "Iratok, közjegyző előkészítése", ro: "Acte, pregătirea notarului", en: "Documents and notary" },
      leiras: { hu: "Telekkönyv-kivonat, energetikai tanúsítvány, közjegyzői időpont egyeztetése.", ro: "Extras CF, certificat energetic, programare la notar.", en: "Land registry extract, energy certificate, notary appointment." } },
    { kod: "ertekbecsles", ikon: "fa-solid fa-calculator", ar: 0, alap: true,
      nev: { hu: "Árstratégia, értékbecslés", ro: "Strategie de preț, evaluare", en: "Pricing strategy and valuation" },
      leiras: { hu: "A piaci adatok alapján javaslunk árat (és tárgyalási sávot).", ro: "Propunem un preț (și o marjă de negociere) pe baza datelor de piață.", en: "We suggest a price (and negotiation range) from market data." } }
];

// Az eladáshoz szükséges iratok (az eladó ebből látja, mit kérünk még tőle)
const IRATOK = [
    { kod: "szemelyi", nev: { hu: "Személyi igazolvány (minden tulajdonosé)", ro: "Carte de identitate (toți proprietarii)", en: "ID card (all owners)" } },
    { kod: "tulajdon", nev: { hu: "Tulajdonjogot igazoló okirat (adásvételi, öröklési...)", ro: "Act de proprietate (contract, certificat de moștenitor...)", en: "Title deed (sale contract, inheritance...)" } },
    { kod: "cf", nev: { hu: "Telekkönyvi kivonat (extras CF)", ro: "Extras de carte funciară", en: "Land registry extract (CF)" } },
    { kod: "kataszter", nev: { hu: "Kataszteri dokumentáció, alaprajz", ro: "Documentație cadastrală, releveu", en: "Cadastral documentation, floor plan" } },
    { kod: "energetikai", nev: { hu: "Energetikai tanúsítvány", ro: "Certificat de performanță energetică", en: "Energy performance certificate" } },
    { kod: "tarsashaz", nev: { hu: "Társasházi igazolás (nincs tartozás)", ro: "Adeverință de la asociația de proprietari", en: "Owners' association certificate" }, csak: ["lakas", "iroda", "kereskedelmi"] },
    { kod: "adoigazolas", nev: { hu: "Adóigazolás (certificat fiscal)", ro: "Certificat fiscal", en: "Tax certificate" } }
];

function iratLista(tipus) {
    return IRATOK.filter(x => !x.csak || x.csak.includes(tipus));
}

// A megtekintési naptár alapja (új megbízásnál ebből indul; Beállítások)
const ALAP_NAPTAR = {
    aktiv: true,
    savok: [{ napok: [1, 3, 5], tol: "16:30", ig: "19:00" }, { napok: [6], tol: "10:00", ig: "13:00" }],
    hossz: 30,          // egy megtekintés (perc)
    szunet: 10,         // két megtekintés között (perc)
    elore_ora: 12,      // legkorábban ennyi órával előtte foglalható
    lemondas_ora: 3,    // eddig mondható le a hirdetésen
    napok_elore: 21,    // ennyi napra előre látszanak az időpontok
    mod: "egyeni",      // egyeni = 1 vevő / időpont; nyitott = nyitott nap, több vevő egy sávban
    kapacitas: 6,       // nyitott napon ennyi vevő / időpont
    kivetelek: []       // napok, amikor nincs megtekintés (ÉÉÉÉ-HH-NN)
};

function alapBeallitas() {
    return {
        beallitas_verzio: 3,
        aktiv: true,
        jutalek: 2,                 // sikerdíj % (nem kizárólagos megbízás)
        jutalek_kizarolagos: 1.5,   // kizárólagos megbízásnál
        minimum_dij: 1000,          // legalább ennyi (a pénznemben)
        penznem: "EUR",
        idotartam_honap: 6,
        terulet: "Sepsiszentgyörgy és környéke",
        terulet_ro: "Sfântu Gheorghe și împrejurimi",
        terulet_en: "Sfântu Gheorghe and surroundings",
        szerzodes_megjegyzes: "",
        // Ajánlatok: jovahagyas = az admin engedi tovább az eladónak (és az
        // ellenajánlatot a vevőnek); azonnal = egyből látják
        ajanlat_mod: "jovahagyas",
        // Ki tehet ajánlatot: megtekintes_utan = aki megnézte (vagy az admin engedte);
        // kapcsolat_utan = aki már foglalt / kérdezett; barki
        ajanlat_feltetel: "megtekintes_utan",
        ajanlat_ervenyes_ora: 72,       // az ajánlat alapból ennyi óráig érvényes
        // Automatizmusok
        auto_visszaigazolas: true,      // a vevő és az eladó visszaigazoló levelet kap
        auto_elado_emlekezteto: 48,     // ennyi óra után emlékeztető az eladónak (0 = ki)
        auto_megtekintes_emlekezteto: true,  // előtte 24 és 2 órával: vevő, eladó, bemutató
        auto_visszajelzes: true,        // megtekintés után: „hogy tetszett, tegyél ajánlatot”
        auto_eladaskor_lezar: true,     // elfogadott ajánlatnál a többi ajánlat / megtekintés lezárása
        auto_ellenjegyzes: false,       // az online aláírt szerződést magától ellenjegyezzük
        auto_dijbekero: true,           // eladáskor a díjbekérő magától elkészül (Pénzügyek)
        naptar: ALAP_NAPTAR,
        opciok: ALAP_OPCIOK
    };
}

let cache = null;

async function beallitas() {
    if (cache && Date.now() - cache.ido < 60 * 1000) return cache.adat;
    let adat = alapBeallitas();
    try {
        const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = $1", [KULCS]);
        if (r.rows[0] && r.rows[0].ertek) {
            const mentett = JSON.parse(r.rows[0].ertek);
            // A régi beállítás: az ajánlat mostantól alapból csak megtekintés után
            if (!mentett.beallitas_verzio || mentett.beallitas_verzio < 3) {
                if (mentett.ajanlat_feltetel === "kapcsolat_utan") delete mentett.ajanlat_feltetel;
                mentett.beallitas_verzio = 3;
            }
            adat = { ...adat, ...mentett };
            adat.naptar = naptarTisztit({ ...ALAP_NAPTAR, ...(mentett.naptar || {}) });
        }
    } catch (e) { /* első indulás */ }
    cache = { ido: Date.now(), adat };
    return adat;
}

function opcioTisztit(o) {
    const nyelvek = x => ({ hu: sz(x && x.hu, 200) || "", ro: sz(x && x.ro, 200) || "", en: sz(x && x.en, 200) || "" });
    const leiras = x => ({ hu: sz(x && x.hu, 600) || "", ro: sz(x && x.ro, 600) || "", en: sz(x && x.en, 600) || "" });
    const kod = (sz(o.kod, 40) || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!kod) return null;
    return {
        kod,
        ikon: /^fa-(solid|regular|brands) fa-[a-z0-9-]+$/.test(o.ikon || "") ? o.ikon : "fa-solid fa-circle-check",
        ar: Math.max(0, szam(o.ar) || 0),
        penznem: o.penznem === "EUR" ? "EUR" : "RON",
        alap: !!o.alap,
        aktiv: o.aktiv !== false,
        nev: nyelvek(o.nev),
        leiras: leiras(o.leiras)
    };
}

async function beallitasMent(b) {
    const a = { ...(await beallitas()) };
    const n = (v, min, max, alap) => { const x = szam(v); return x === null ? alap : Math.min(max, Math.max(min, x)); };
    a.beallitas_verzio = 3;
    if ("aktiv" in b) a.aktiv = !!b.aktiv;
    if ("jutalek" in b) a.jutalek = n(b.jutalek, 0, 20, 2);
    if ("jutalek_kizarolagos" in b) a.jutalek_kizarolagos = n(b.jutalek_kizarolagos, 0, 20, 1.5);
    if ("minimum_dij" in b) a.minimum_dij = n(b.minimum_dij, 0, 1000000, 0);
    if ("penznem" in b) a.penznem = b.penznem === "RON" ? "RON" : "EUR";
    if ("idotartam_honap" in b) a.idotartam_honap = Math.round(n(b.idotartam_honap, 1, 36, 6));
    ["terulet", "terulet_ro", "terulet_en"].forEach(k => { if (k in b) a[k] = sz(b[k], 200) || ""; });
    if ("szerzodes_megjegyzes" in b) a.szerzodes_megjegyzes = sz(b.szerzodes_megjegyzes, 4000) || "";
    if ("ajanlat_mod" in b) a.ajanlat_mod = b.ajanlat_mod === "azonnal" ? "azonnal" : "jovahagyas";
    if ("ajanlat_feltetel" in b) a.ajanlat_feltetel = ["barki", "kapcsolat_utan"].includes(b.ajanlat_feltetel) ? b.ajanlat_feltetel : "megtekintes_utan";
    if ("ajanlat_ervenyes_ora" in b) a.ajanlat_ervenyes_ora = Math.round(n(b.ajanlat_ervenyes_ora, 12, 720, 72));
    if ("auto_visszaigazolas" in b) a.auto_visszaigazolas = !!b.auto_visszaigazolas;
    if ("auto_elado_emlekezteto" in b) a.auto_elado_emlekezteto = Math.round(n(b.auto_elado_emlekezteto, 0, 720, 48));
    if ("auto_megtekintes_emlekezteto" in b) a.auto_megtekintes_emlekezteto = !!b.auto_megtekintes_emlekezteto;
    if ("auto_visszajelzes" in b) a.auto_visszajelzes = !!b.auto_visszajelzes;
    if ("auto_eladaskor_lezar" in b) a.auto_eladaskor_lezar = !!b.auto_eladaskor_lezar;
    if ("auto_ellenjegyzes" in b) a.auto_ellenjegyzes = !!b.auto_ellenjegyzes;
    if ("auto_dijbekero" in b) a.auto_dijbekero = !!b.auto_dijbekero;
    if (b.naptar && typeof b.naptar === "object") a.naptar = naptarTisztit({ ...ALAP_NAPTAR, ...b.naptar });
    if (Array.isArray(b.opciok)) {
        const lista = b.opciok.slice(0, 40).map(opcioTisztit).filter(Boolean);
        const kodok = new Set();
        a.opciok = lista.filter(o => !kodok.has(o.kod) && kodok.add(o.kod));
    }
    await db.query(
        `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`,
        [KULCS, JSON.stringify(a)]);
    cache = null;
    return a;
}

// A nyilvános oldalnak (Eladjuk helyetted)
async function ajanlat() {
    const b = await beallitas();
    return {
        aktiv: b.aktiv, jutalek: b.jutalek, jutalek_kizarolagos: b.jutalek_kizarolagos, minimum_dij: b.minimum_dij,
        penznem: b.penznem, idotartam_honap: b.idotartam_honap, terulet: b.terulet, terulet_ro: b.terulet_ro, terulet_en: b.terulet_en,
        opciok: b.opciok.filter(o => o.aktiv !== false)
    };
}

function ajanlatMod(m, be) {
    return m.ajanlat_mod === "azonnal" || m.ajanlat_mod === "jovahagyas" ? m.ajanlat_mod : (be.ajanlat_mod || "jovahagyas");
}

// ===================== MEGTEKINTÉSI NAPTÁR =====================

function naptarTisztit(b) {
    const n = (v, min, max, alap) => { const x = szam(v); return x === null ? alap : Math.round(Math.min(max, Math.max(min, x))); };
    const savok = (Array.isArray(b.savok) ? b.savok : []).slice(0, 20).map(s => {
        const tol = percbe(s && s.tol);
        const ig = percbe(s && s.ig);
        const napok = [...new Set((Array.isArray(s && s.napok) ? s.napok : []).map(Number))].filter(x => x >= 1 && x <= 7).sort();
        if (tol === null || ig === null || ig <= tol || !napok.length) return null;
        return { napok, tol: orara(tol), ig: orara(ig) };
    }).filter(Boolean);
    return {
        aktiv: b.aktiv !== false,
        savok,
        hossz: n(b.hossz, 10, 240, 30),
        szunet: n(b.szunet, 0, 120, 10),
        elore_ora: n(b.elore_ora, 0, 168, 12),
        lemondas_ora: n(b.lemondas_ora, 0, 72, 3),
        napok_elore: n(b.napok_elore, 3, 90, 21),
        mod: b.mod === "nyitott" ? "nyitott" : "egyeni",
        kapacitas: n(b.kapacitas, 1, 50, 6),
        kivetelek: [...new Set((Array.isArray(b.kivetelek) ? b.kivetelek : []).map(datum).filter(Boolean))].slice(0, 120)
    };
}

// A megbízás naptára (ha még nincs saját, a beállítások szerinti alap – kikapcsolva)
function naptarAdat(m, be) {
    if (m.naptar && typeof m.naptar === "object") return naptarTisztit({ ...ALAP_NAPTAR, ...m.naptar });
    return { ...naptarTisztit({ ...ALAP_NAPTAR, ...(be.naptar || {}) }), aktiv: false, alap: true };
}

// Az idősávokból az időpontok (foglaltság nélkül)
//   -> [{ idopont: Date, nap: "ÉÉÉÉ-HH-NN", ora: "HH:MM" }]
function idopontokGeneral(n, { tol = null, napok = null } = {}) {
    const lista = [];
    const kezdo = tol || ma();
    const db2 = napok || n.napok_elore;
    const kivetel = new Set(n.kivetelek || []);
    for (let i = 0; i < db2; i++) {
        const nap = napHozzaad(kezdo, i);
        if (kivetel.has(nap)) continue;
        const hn = hetNapja(nap);
        for (const s of n.savok) {
            if (!s.napok.includes(hn)) continue;
            const veg = percbe(s.ig);
            for (let p = percbe(s.tol); p + n.hossz <= veg; p += n.hossz + n.szunet) {
                const ora = orara(p);
                lista.push({ idopont: helyiIdo(nap, ora), nap, ora });
            }
        }
    }
    return lista.sort((a, b) => a.idopont - b.idopont);
}

// A szabad időpontok egy megbízáshoz (a vevőnek és az asztalnak)
//   -> [{ idopont, nap, ora, foglalt, kapacitas, szabad }]
async function szabadIdopontok(m, be, { tol = null, napok = null, mind = false } = {}) {
    const n = naptarAdat(m, be);
    if (!n.aktiv && !mind) return [];
    const lista = idopontokGeneral(n, { tol, napok });
    if (!lista.length) return [];
    const kap = n.mod === "nyitott" ? n.kapacitas : 1;
    const elso = lista[0].idopont;
    const utolso = new Date(lista[lista.length - 1].idopont.getTime() + n.hossz * 60000);
    const r = await db.query(`
        SELECT idopont FROM megbizas_megtekintesek
        WHERE megbizas_id = $1 AND statusz IN ('egyeztetve', 'megtortent') AND idopont >= $2 AND idopont < $3`,
        [m.id, elso, utolso]);
    const foglalasok = r.rows.map(x => new Date(x.idopont).getTime());
    const hatar = Date.now() + n.elore_ora * 3600000;
    return lista.map(x => {
        const k = x.idopont.getTime();
        const foglalt = foglalasok.filter(f => f >= k && f < k + n.hossz * 60000).length;
        return {
            idopont: x.idopont.toISOString(), nap: x.nap, ora: x.ora, foglalt, kapacitas: kap,
            szabad: k >= hatar ? Math.max(0, kap - foglalt) : 0, mult: k < hatar
        };
    });
}

// ===================== NAPLÓ, ÜZENETEK =====================

async function naploIr(megbizasId, tipus, szoveg, lathato, userId) {
    await db.query(`INSERT INTO megbizas_naplo (megbizas_id, tipus, szoveg, lathato_eladonak, created_by) VALUES ($1,$2,$3,$4,$5)`,
        [megbizasId, tipus, szoveg, !!lathato, userId || null]);
}

// irany: 'be' (az ügyfél írta) | 'ki' (mi)
async function uzenetIr(megbizasId, erdeklodoId, irany, userId, szoveg) {
    const s = sz(szoveg, 4000);
    if (!s) throw hibaKod("missing_text");
    const r = await db.query(
        `INSERT INTO megbizas_uzenetek (megbizas_id, erdeklodo_id, irany, user_id, szoveg) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
        [megbizasId, erdeklodoId || null, irany === "be" ? "be" : "ki", userId || null, s]);
    await db.query("UPDATE megbizasok SET updated_at = NOW() WHERE id = $1", [megbizasId]);
    return r.rows[0];
}

async function szal(megbizasId, erdeklodoId) {
    const r = await db.query(`
        SELECT z.id, z.irany, z.szoveg, z.olvasva, z.created_at, COALESCE(u.nev, u.felhasznalonev) AS szerzo
        FROM megbizas_uzenetek z LEFT JOIN users u ON u.id = z.user_id
        WHERE z.megbizas_id = $1 AND ${erdeklodoId ? "z.erdeklodo_id = $2" : "z.erdeklodo_id IS NULL"}
        ORDER BY z.created_at, z.id`, erdeklodoId ? [megbizasId, erdeklodoId] : [megbizasId]);
    return r.rows;
}

// Olvasottnak jelölés: a csapat a beérkezőket, az ügyfél a nekünk írtakat
async function olvasott(megbizasId, erdeklodoId, ki) {
    const irany = ki === "csapat" ? "be" : "ki";
    await db.query(
        `UPDATE megbizas_uzenetek SET olvasva = true WHERE megbizas_id = $1 AND irany = $2 AND NOT olvasva AND ${erdeklodoId ? "erdeklodo_id = $3" : "erdeklodo_id IS NULL"}`,
        erdeklodoId ? [megbizasId, irany, erdeklodoId] : [megbizasId, irany]);
}

// ===================== FÁJLOK (iratok, aláírt szerződés, hitel-igazolás) =====================

// data URL → { mime, adat } (PDF vagy kép, legfeljebb 8 MB)
function fajlOlvas(dataUrl) {
    const m = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(String(dataUrl || ""));
    if (!m) throw hibaKod("bad_file");
    const mime = m[1].toLowerCase();
    if (!FAJL_MIME.includes(mime)) throw hibaKod("bad_file_type");
    const adat = Buffer.from(m[2], "base64");
    if (!adat.length) throw hibaKod("bad_file");
    if (adat.length > 8 * 1024 * 1024) throw hibaKod("file_too_large");
    return { mime, adat };
}

async function fajlMent(megbizasId, b, userId, { erdeklodoId = null, lathato = true } = {}) {
    const f = fajlOlvas(b.fajl);
    const tipus = FAJL_TIPUSOK.includes(b.tipus) ? b.tipus : "irat";
    const kod = sz(b.kod, 40);
    const nev = (sz(b.nev, 160) || `${tipus}${kod ? "-" + kod : ""}`).replace(/[\\/:*?"<>|]+/g, "_");
    const db2 = await db.query("SELECT COUNT(*)::int AS n FROM megbizas_fajlok WHERE megbizas_id = $1", [megbizasId]);
    if (db2.rows[0].n >= 80) throw hibaKod("too_many_files");
    const r = await db.query(`
        INSERT INTO megbizas_fajlok (megbizas_id, tipus, kod, nev, mime, meret, adat, lathato_eladonak, feltoltotte, erdeklodo_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [megbizasId, tipus, kod, nev, f.mime, f.adat.length, f.adat, !!lathato, userId || null, erdeklodoId]);
    return { id: r.rows[0].id, tipus, kod, nev, mime: f.mime, meret: f.adat.length };
}

async function fajlLista(megbizasId, { eladonak = false } = {}) {
    const r = await db.query(`
        SELECT f.id, f.tipus, f.kod, f.nev, f.mime, f.meret, f.lathato_eladonak, f.created_at, f.erdeklodo_id,
               COALESCE(u.nev, u.felhasznalonev) AS feltolto
        FROM megbizas_fajlok f LEFT JOIN users u ON u.id = f.feltoltotte
        WHERE f.megbizas_id = $1 ${eladonak ? "AND f.lathato_eladonak" : ""}
        ORDER BY f.created_at DESC, f.id DESC`, [megbizasId]);
    return r.rows;
}

// Letöltés: az eladó (ha neki is látható), a csapat (megbizas_lat), a vevő a saját igazolását
async function fajlLetolt(req, fid) {
    const r = await db.query(`
        SELECT f.*, m.user_id AS elado_id, e.user_id AS vevo_id
        FROM megbizas_fajlok f JOIN megbizasok m ON m.id = f.megbizas_id
        LEFT JOIN megbizas_erdeklodok e ON e.id = f.erdeklodo_id
        WHERE f.id = $1`, [Number(fid) || 0]);
    const f = r.rows[0];
    if (!f || !req.user) return null;
    if (await csapat.megbizasJog(req, f.megbizas_id, "megbizas_lat")) return f;
    if (f.elado_id === req.user.id && f.lathato_eladonak) return f;
    if (f.vevo_id && f.vevo_id === req.user.id) return f;
    return null;
}


// ===================== SZAKASZOK, KAPUK, KÖVETKEZŐ LÉPÉS =====================

// A választott szolgáltatásokból az előkészítés feladatai, és ami még hiányzik
function elokeszitoFeladatok(m) {
    const opc = Array.isArray(m.opciok) ? m.opciok : [];
    const f = m.feladatok || {};
    return ELOKESZITO.filter(k => opc.includes(k)).map(k => ({ kod: k, kesz: !!(f[k] && f[k].kesz), datum: f[k] && f[k].datum, ki: f[k] && f[k].ki }));
}

function iratHiany(m) {
    const ir = m.iratok || {};
    return iratLista(m.tipus).filter(x => !(ir[x.kod] && ir[x.kod].megvan)).length;
}

const ora = d => d ? (Date.now() - new Date(d).getTime()) / 3600000 : 0;

// A megbízás következő lépése (a lista sorából, a számlálókkal):
//   { kod, ki: admin|felelos|fotos|bemutato|elado|vevo|null, ful, szint: magas|kozepes|info, n?, datum?, ora? }
function kovetkezo(m) {
    const k = (kod, ki, ful, szint, extra = {}) => ({ kod, ki, ful, szint, ...extra });
    const sza = m.szerzodes_allapot || "tervezet";
    switch (m.statusz) {
        case "uj":
            if (!m.felelos_id) return k("felelos_kell", "admin", "csomag", "magas");
            return k("elso_hivas", "felelos", "csomag", ora(m.created_at) > 24 ? "magas" : "kozepes", { ora: Math.floor(ora(m.created_at)) });
        case "egyeztetes":
            if (!m.csomag_kuldve) return k("csomag_kuld", "felelos", "csomag", "kozepes");
            return k("csomag_var", "elado", "csomag", ora(m.csomag_kuldve) > 72 ? "kozepes" : "info", { datum: m.csomag_kuldve });
        case "szerzodes":
            if (sza === "tervezet") return k("szerzodes_kuld", "felelos", "szerzodes", "kozepes");
            if (sza === "elfogadva") return k("ellenjegyzes", "felelos", "szerzodes", "magas");
            if (m.szerzodes_mod === "szemelyes") return k("szemelyes_alairas", "felelos", "szerzodes", "kozepes");
            return k("szerzodes_var", "elado", "szerzodes", ora(m.szerzodes_elkuldve) > 72 ? "kozepes" : "info", { datum: m.szerzodes_elkuldve });
        case "fotozas": {
            const hiany = elokeszitoFeladatok(m).filter(x => !x.kesz);
            if (hiany.length) return k("feladat", "fotos", "csomag", "kozepes", { n: hiany.length, datum: m.fotozas_idopont });
            if (!m.ingatlan_id) return k("hirdetes_keszit", "felelos", "csomag", "kozepes");
            if (!m.hirdetes_kuldve) return k("hirdetes_kuld", "felelos", "csomag", "kozepes");
            return k("hirdetes_var", "elado", "csomag", ora(m.hirdetes_kuldve) > 48 ? "kozepes" : "info", { datum: m.hirdetes_kuldve });
        }
        case "hirdetes":
            if (!m.naptar || m.naptar.aktiv === false) return k("naptar_beallit", "felelos", "megtekintesek", "magas");
            if (m.megtekintes_lezarando) return k("megtekintes_lezar", "bemutato", "megtekintesek", "kozepes", { n: m.megtekintes_lezarando });
            if (m.varolista_db) return k("varolista", "bemutato", "megtekintesek", "kozepes", { n: m.varolista_db });
            return k("vevokre_var", null, "vevok", "info");
        case "targyalas":
            if (m.ajanlat_uj) return k("ajanlat_jovahagy", "felelos", "vevok", "magas", { n: m.ajanlat_uj });
            if (m.ellen_tovabbitando) return k("ellen_tovabbit", "felelos", "vevok", "magas", { n: m.ellen_tovabbitando });
            if (m.ajanlat_tovabbitva) return k("elado_valasz", "elado", "vevok", m.elado_var ? "magas" : "info", { n: m.ajanlat_tovabbitva });
            if (m.ellen_vevonel) return k("vevo_valasz", "vevo", "vevok", "info", { n: m.ellen_vevonel });
            return k("ajanlatra_var", null, "vevok", "info");
        case "adasvetel":
            if (!m.eloszerzodes_datum) return k("eloszerzodes", "felelos", "szerzodes", "kozepes");
            if (iratHiany(m)) return k("iratok", "elado", "szerzodes", "kozepes", { n: iratHiany(m) });
            if (!m.kozjegyzo_idopont) return k("kozjegyzo_idopont", "felelos", "szerzodes", "kozepes");
            return k("kozjegyzo_alairas", "felelos", "szerzodes", new Date(m.kozjegyzo_idopont) < Date.now() ? "magas" : "info", { datum: m.kozjegyzo_idopont });
        case "eladva":
            if (!m.dijbekero_id) return k("dijbekero", "felelos", "szerzodes", "magas");
            return k("kesz", null, "szerzodes", "info");
        default:
            return k("lezart", null, "uzenetek", "info");
    }
}

// Teendők egy megbízáshoz: a következő lépés + a mellette futó dolgok
//   { kod, szint, ful, ki, n?, datum? }
function teendok(m) {
    const t = [];
    const add = (x) => { if (x && !t.some(y => y.kod === x.kod)) t.push({ ...x, megbizas_id: m.id }); };
    const kov = kovetkezo(m);
    if (!AKTIV.includes(m.statusz)) {
        if (kov.kod === "dijbekero") add(kov);
        return t;
    }
    if (m.olvasatlan) add({ kod: "olvasatlan", szint: "magas", ful: "uzenetek", ki: "felelos", n: m.olvasatlan });
    if (kov.kod !== "vevokre_var" && kov.kod !== "ajanlatra_var") add(kov);
    // A párhuzamos ügyek (más szakaszban is előfordulhatnak)
    if (m.ajanlat_uj) add({ kod: "ajanlat_jovahagy", szint: "magas", ful: "vevok", ki: "felelos", n: m.ajanlat_uj });
    if (m.ellen_tovabbitando) add({ kod: "ellen_tovabbit", szint: "magas", ful: "vevok", ki: "felelos", n: m.ellen_tovabbitando });
    if (m.elado_var) add({ kod: "elado_valasz", szint: "magas", ful: "vevok", ki: "elado", n: m.elado_var });
    if (m.megtekintes_lezarando) add({ kod: "megtekintes_lezar", szint: "kozepes", ful: "megtekintesek", ki: "bemutato", n: m.megtekintes_lezarando });
    if (m.varolista_db && VEVOI.includes(m.statusz)) add({ kod: "varolista", szint: "kozepes", ful: "megtekintesek", ki: "bemutato", n: m.varolista_db });
    if (["szerzodes", "fotozas", "hirdetes", "targyalas"].includes(m.statusz) && iratHiany(m)) add({ kod: "iratok", szint: "info", ful: "szerzodes", ki: "elado", n: iratHiany(m) });
    if (m.irat_uj) add({ kod: "irat_ellenoriz", szint: "kozepes", ful: "szerzodes", ki: "felelos", n: m.irat_uj });
    const lej = lejarat(m);
    if (lej) {
        const nap = Math.round((new Date(lej + "T12:00:00") - new Date(ma() + "T12:00:00")) / 86400000);
        if (nap < 0) add({ kod: "lejart", szint: "magas", ful: "szerzodes", ki: "felelos", datum: lej });
        else if (nap <= 14) add({ kod: "lejar", szint: "kozepes", ful: "szerzodes", ki: "felelos", datum: lej, nap });
    }
    return t;
}

const SZINT_SORREND = { magas: 0, kozepes: 1, info: 2 };

// A lista mezői + számlálók a teendőkhöz
const LISTA_SQL = `
    SELECT m.*, COALESCE(u.nev, u.felhasznalonev, u.email) AS fiok_nev,
           i.cim AS hirdetes_cim, i.statusz AS hirdetes_statusz,
           COALESCE(fe.nev, fe.felhasznalonev) AS felelos_nev,
           COALESCE(fo.nev, fo.felhasznalonev) AS fotos_nev,
           COALESCE(bm.nev, bm.felhasznalonev) AS bemutato_nev,
           (SELECT COUNT(*) FROM megbizas_erdeklodok e WHERE e.megbizas_id = m.id)::int AS erdeklodok,
           (SELECT COUNT(*) FROM megbizas_megtekintesek t WHERE t.megbizas_id = m.id AND t.statusz = 'kert')::int AS megtekintes_kert,
           (SELECT COUNT(*) FROM megbizas_megtekintesek t WHERE t.megbizas_id = m.id AND t.statusz = 'kert')::int AS varolista_db,
           (SELECT COUNT(*) FROM megbizas_megtekintesek t WHERE t.megbizas_id = m.id AND t.statusz = 'megtortent')::int AS megtortent_db,
           (SELECT COUNT(*) FROM megbizas_megtekintesek t WHERE t.megbizas_id = m.id AND t.statusz = 'egyeztetve' AND t.idopont >= NOW())::int AS foglalas_db,
           (SELECT COUNT(*) FROM megbizas_megtekintesek t WHERE t.megbizas_id = m.id AND t.statusz = 'egyeztetve' AND t.idopont < NOW() - INTERVAL '1 hour')::int AS megtekintes_lezarando,
           (SELECT MIN(t.idopont) FROM megbizas_megtekintesek t WHERE t.megbizas_id = m.id AND t.statusz = 'egyeztetve' AND t.idopont >= NOW() - INTERVAL '1 hour') AS kovetkezo_megtekintes,
           (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz = 'uj')::int AS ajanlat_uj,
           (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz = 'tovabbitva')::int AS ajanlat_tovabbitva,
           (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz = 'ellenajanlat' AND NOT COALESCE(a.ellen_vevonek, false))::int AS ellen_tovabbitando,
           (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz = 'ellenajanlat' AND COALESCE(a.ellen_vevonek, false))::int AS ellen_vevonel,
           (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz = 'tovabbitva' AND a.tovabbitva_at < NOW() - INTERVAL '48 hours')::int AS elado_var,
           (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz = 'elfogadva')::int AS ajanlat_elfogadva,
           (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz IN ('uj', 'tovabbitva', 'ellenajanlat'))::int AS ajanlat_nyitott,
           (SELECT MAX(COALESCE(a.vegso_osszeg, a.osszeg)) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz NOT IN ('visszavonva', 'elutasitva', 'lejart')) AS legjobb_ajanlat,
           (SELECT COUNT(*) FROM megbizas_uzenetek z WHERE z.megbizas_id = m.id AND z.irany = 'be' AND NOT z.olvasva)::int AS olvasatlan,
           (SELECT COUNT(*) FROM megbizas_fajlok f WHERE f.megbizas_id = m.id AND f.tipus = 'irat' AND f.kod IS NOT NULL
                AND NOT COALESCE((m.iratok -> f.kod ->> 'megvan')::boolean, false))::int AS irat_uj,
           (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = m.ingatlan_id)::int AS kep_db,
           (SELECT k.id FROM ingatlan_kepek k WHERE k.ingatlan_id = m.ingatlan_id ORDER BY k.sorrend, k.id LIMIT 1) AS elso_kep
    FROM megbizasok m
    LEFT JOIN users u ON u.id = m.user_id
    LEFT JOIN ingatlanok i ON i.id = m.ingatlan_id
    LEFT JOIN users fe ON fe.id = m.felelos_id
    LEFT JOIN users fo ON fo.id = m.fotos_id
    LEFT JOIN users bm ON bm.id = m.bemutato_id`;

function listaSor(m) {
    return {
        ...m,
        szerzodes_datum: pgDatum(m.szerzodes_datum), alairva: pgDatum(m.alairva), eladva: pgDatum(m.eladva), lejar: lejarat(m),
        eloszerzodes_datum: pgDatum(m.eloszerzodes_datum), kulcsatadas: pgDatum(m.kulcsatadas),
        szerzodes_allapot: m.szerzodes_allapot || "tervezet",
        jutalek: m.jutalek === null ? null : Number(m.jutalek), fix_dij: m.fix_dij === null ? null : Number(m.fix_dij),
        legjobb_ajanlat: m.legjobb_ajanlat === null ? null : Number(m.legjobb_ajanlat),
        szerzodes_kod_hash: undefined
    };
}

async function sorBetolt(id) {
    const r = await db.query(`${LISTA_SQL} WHERE m.id = $1`, [Number(id) || 0]);
    return r.rows[0] || null;
}

// A hirdetés nyilvános / előnézet állapota a szakasz szerint
async function hirdetesAllapot(m) {
    if (!m.ingatlan_id) return;
    const kint = ["hirdetes", "targyalas", "adasvetel", "eladva"].includes(m.statusz);
    if (kint) {
        await db.query("UPDATE ingatlanok SET statusz = 'aktiv', updated_at = NOW() WHERE id = $1 AND statusz = 'elonezet'", [m.ingatlan_id]);
    } else if (["uj", "egyeztetes", "szerzodes", "fotozas"].includes(m.statusz)) {
        await db.query("UPDATE ingatlanok SET statusz = 'elonezet', updated_at = NOW() WHERE id = $1 AND statusz = 'aktiv'", [m.ingatlan_id]);
    }
}

// Szakaszváltás (naplóval). Visszaadja az új állapotot.
async function szakaszValt(m, uj, userId) {
    await db.query("UPDATE megbizasok SET statusz = $2, statusz_valtva = NOW(), updated_at = NOW() WHERE id = $1", [m.id, uj]);
    await naploIr(m.id, "statusz", uj, true, userId);
    m.statusz = uj;
    return uj;
}

// Az adásvétel kezdete: az elfogadott ajánlat; a többi ajánlat és a jövőbeli
// megtekintések lezárása (ha a beállítás így szól) – az értesítést a hívó küldi
async function adasvetelKezd(m, be, userId) {
    const el = await db.query(`SELECT * FROM megbizas_ajanlatok WHERE megbizas_id = $1 AND statusz = 'elfogadva' ORDER BY updated_at DESC LIMIT 1`, [m.id]);
    const a = el.rows[0];
    if (a) {
        await db.query(`UPDATE megbizasok SET adasvetel_ajanlat_id = $2, eladasi_ar = COALESCE(eladasi_ar, $3),
                            foglalo = COALESCE(foglalo, $4), updated_at = NOW() WHERE id = $1`,
            [m.id, a.id, Number(a.vegso_osszeg || a.osszeg), a.foglalo]);
        await db.query("UPDATE megbizas_erdeklodok SET statusz = 'vevo', updated_at = NOW() WHERE id = $1", [a.erdeklodo_id]);
    }
    if (!be.auto_eladaskor_lezar) return { ajanlatok: [], megtekintesek: [] };
    const aj = await db.query(`UPDATE megbizas_ajanlatok a SET statusz = 'elutasitva', vevo_valasz = COALESCE(vevo_valasz, 'az eladó másik ajánlatot fogadott el'), updated_at = NOW()
                               FROM megbizas_erdeklodok e WHERE e.id = a.erdeklodo_id AND a.megbizas_id = $1 AND a.statusz IN ('uj', 'tovabbitva', 'ellenajanlat')
                               RETURNING a.id, e.nev, e.email`, [m.id]);
    const mt = await db.query(`UPDATE megbizas_megtekintesek t SET statusz = 'lemondva', updated_at = NOW()
                               FROM megbizas_erdeklodok e WHERE e.id = t.erdeklodo_id AND t.megbizas_id = $1 AND t.statusz IN ('kert', 'egyeztetve')
                                 AND (t.idopont IS NULL OR t.idopont > NOW())
                               RETURNING t.id, e.nev, e.email`, [m.id]);
    if (aj.rowCount || mt.rowCount) {
        await naploIr(m.id, "jegyzet", `Elfogadott ajánlat: ${aj.rowCount} másik ajánlat lezárva, ${mt.rowCount} megtekintés lemondva (a vevők értesítést kaptak).`, false, userId);
    }
    return { ajanlatok: aj.rows, megtekintesek: mt.rows };
}

// A kapuk ellenőrzése: amíg a feltétel teljesül, a megbízás magától továbblép.
//  -> { lepesek: [új állapotok], lezart: {ajanlatok, megtekintesek} | null }
async function elorelep(megbizasId, userId = null) {
    const ered = { lepesek: [], lezart: null };
    const be = await beallitas();
    for (let kor = 0; kor < 8; kor++) {
        const m = await sorBetolt(megbizasId);
        if (!m) break;
        const sza = m.szerzodes_allapot || "tervezet";
        let uj = null;
        if (m.statusz === "uj" && m.elso_kapcsolat) uj = "egyeztetes";
        else if (m.statusz === "egyeztetes" && (m.csomag_jovahagyva || sza !== "tervezet")) uj = "szerzodes";
        else if (m.statusz === "szerzodes" && sza === "alairva") uj = "fotozas";
        else if (m.statusz === "fotozas" && m.ingatlan_id && m.hirdetes_jovahagyva && !elokeszitoFeladatok(m).some(x => !x.kesz)) uj = "hirdetes";
        else if (m.statusz === "hirdetes" && m.ajanlat_nyitott + m.ajanlat_elfogadva > 0) uj = "targyalas";
        else if (m.statusz === "targyalas" && m.ajanlat_elfogadva > 0) uj = "adasvetel";
        if (!uj) break;

        await szakaszValt(m, uj, userId);
        ered.lepesek.push(uj);

        if (uj === "szerzodes" && sza === "tervezet") {
            // A jóváhagyott csomaggal a szerződés magától kimegy aláírásra
            await db.query(`UPDATE megbizasok SET szerzodes_allapot = 'elkuldve', szerzodes_elkuldve = NOW(),
                                szerzodes_datum = COALESCE(szerzodes_datum, CURRENT_DATE), updated_at = NOW() WHERE id = $1`, [m.id]);
            await naploIr(m.id, "szerzodes", "A szerződés elkészült, és aláírásra vár.", true, userId);
        }
        if (uj === "hirdetes") {
            await db.query("UPDATE megbizasok SET hirdetve = COALESCE(hirdetve, NOW()) WHERE id = $1", [m.id]);
            // A naptár: ha még nincs saját, az alap idősávokkal bekapcsolva
            if (!m.naptar) await db.query("UPDATE megbizasok SET naptar = $2::jsonb WHERE id = $1", [m.id, JSON.stringify({ ...naptarTisztit({ ...ALAP_NAPTAR, ...(be.naptar || {}) }), aktiv: true })]);
        }
        if (uj === "adasvetel") ered.lezart = await adasvetelKezd(m, be, userId);
        await hirdetesAllapot({ ...m, statusz: uj });
    }
    return ered;
}

// ===================== MEGBÍZÁS LEADÁSA (a tulajdonos) =====================

async function kovetkezoSzam(client) {
    const ev = ma().slice(0, 4);
    const minta = `MB-${ev}-`;
    await client.query("SELECT pg_advisory_xact_lock(hashtext('megbizas_sorszam'))");
    const r = await client.query(`
        SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(szerzodes_szam FROM $2::int), '\\D', '', 'g'), '')::int), 0) AS n
        FROM megbizasok WHERE szerzodes_szam LIKE $1`, [minta + "%", minta.length + 1]);
    return minta + String(Number(r.rows[0].n) + 1).padStart(4, "0");
}

async function letrehoz(user, b) {

    if (!user) throw hibaKod("login_required");
    if (!b || !b.elfogad) throw hibaKod("must_accept");

    const be = await beallitas();
    if (!be.aktiv) throw hibaKod("service_off");

    const opcioKodok = new Set(be.opciok.filter(o => o.aktiv !== false).map(o => o.kod));
    const valasztott = Array.isArray(b.opciok) ? [...new Set(b.opciok.map(String))].filter(k => opcioKodok.has(k)) : [];
    // Az alapszolgáltatások mindig benne vannak
    be.opciok.filter(o => o.alap && o.aktiv !== false).forEach(o => { if (!valasztott.includes(o.kod)) valasztott.push(o.kod); });

    const d = {
        ugylet: b.ugylet === "kiado" ? "kiado" : "elado",
        tipus: TIPUSOK.includes(b.tipus) ? b.tipus : "lakas",
        varos: sz(b.varos, 80),
        telepules: sz(b.telepules, 120),
        cim: sz(b.cim, 300),
        nm: szam(b.nm),
        szobak: szam(b.szobak) ? Math.round(szam(b.szobak)) : null,
        kert_ar: szam(b.kert_ar),
        leiras: sz(b.leiras, 4000),
        nev: sz(b.nev, 160),
        email: (sz(b.email, 160) || "").toLowerCase() || null,
        telefon: sz(b.telefon, 40),
        elerhetoseg: sz(b.elerhetoseg, 300),
        kizarolagos: !!b.kizarolagos
    };

    if (!d.nev) throw hibaKod("missing_name");
    if (!d.telefon && !d.email) throw hibaKod("missing_contact");
    if (d.email && !EMAIL_RE.test(d.email)) throw hibaKod("bad_email");
    if (!d.varos && !d.cim) throw hibaKod("missing_place");
    if (d.nm !== null && (d.nm <= 0 || d.nm > 100000)) throw hibaKod("bad_area");

    // Egy felhasználónak egyszerre legfeljebb 5 nyitott (még nem szerződött) megbízása
    const nyit = await db.query("SELECT COUNT(*)::int AS n FROM megbizasok WHERE user_id = $1 AND statusz IN ('uj', 'egyeztetes')", [user.id]);
    if (nyit.rows[0].n >= 5) throw hibaKod("too_many");

    // A felelős: ha a városra van értékesítő a csapatban, ő kapja (különben üres = admin)
    let felelos = null;
    try {
        const f = await db.query(`
            SELECT t.user_id FROM csapat_tagok t JOIN csapat_jogok j ON j.tag_id = t.id
            WHERE t.aktiv AND j.jogok ? 'megbizas'
              AND (j.hatokor = 'mind' OR (j.hatokor = 'varos' AND j.varos = $1 AND (j.tipus IS NULL OR j.tipus = $2)))
              AND (j.lejar IS NULL OR j.lejar >= CURRENT_DATE)
            ORDER BY (t.szerep = 'ertekesito') DESC, (j.hatokor = 'varos') DESC,
                     (SELECT COUNT(*) FROM megbizasok x WHERE x.felelos_id = t.user_id AND x.statusz IN ('uj', 'egyeztetes', 'szerzodes', 'fotozas', 'hirdetes', 'targyalas', 'adasvetel')),
                     t.id
            LIMIT 1`, [d.varos, d.tipus]);
        felelos = f.rows[0] ? f.rows[0].user_id : null;
    } catch (e) { /* nincs csapat */ }

    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const szamSz = await kovetkezoSzam(client);
        const r = await client.query(`
            INSERT INTO megbizasok (user_id, statusz, ugylet, tipus, varos, telepules, cim, nm, szobak, kert_ar, leiras, nev, email, telefon,
                   elerhetoseg, opciok, jutalek, penznem, kizarolagos, idotartam_honap, szerzodes_szam, felelos_id, statusz_valtva)
            VALUES ($1,'uj',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20,$21,NOW()) RETURNING id`,
            [user.id, d.ugylet, d.tipus, d.varos, d.telepules, d.cim, d.nm, d.szobak, d.kert_ar, d.leiras, d.nev, d.email, d.telefon,
             d.elerhetoseg, JSON.stringify(valasztott), d.kizarolagos ? be.jutalek_kizarolagos : be.jutalek, be.penznem, d.kizarolagos,
             be.idotartam_honap, szamSz, felelos]);
        const id = r.rows[0].id;
        await client.query(`INSERT INTO megbizas_naplo (megbizas_id, tipus, szoveg, lathato_eladonak, created_by) VALUES ($1, 'statusz', $2, true, $3)`,
            [id, "uj", user.id]);
        await client.query("COMMIT");
        return { id, szam: szamSz, felelos_id: felelos };
    } catch (e) {
        await client.query("ROLLBACK").catch(() => { });
        throw e;
    } finally {
        client.release();
    }
}


// ===================== AZ ELADÓ („Ingatlanom eladása”, #eladas) =====================

// Amire az eladónak válaszolnia / tennie kell (a menü jelvényéhez is)
function eladoTeendok(m, ajanlatok = [], iratok = null) {
    const t = [];
    const sza = m.szerzodes_allapot || "tervezet";
    if (m.statusz === "egyeztetes" && m.csomag_kuldve && !m.csomag_jovahagyva) t.push({ kod: "csomag", ful: "csomag" });
    if (sza === "elkuldve" && m.szerzodes_mod !== "szemelyes" && ["egyeztetes", "szerzodes"].includes(m.statusz)) t.push({ kod: "szerzodes", ful: "szerzodes" });
    if (m.statusz === "fotozas" && m.hirdetes_kuldve && !m.hirdetes_jovahagyva) t.push({ kod: "hirdetes", ful: "csomag" });
    ajanlatok.filter(a => a.statusz === "tovabbitva").forEach(a => t.push({ kod: "ajanlat", ful: "ajanlatok", id: a.id, ervenyes_ig: a.ervenyes_ig }));
    const hiany = iratok ? iratok.filter(x => x.allapot === "hiany").length : 0;
    if (hiany && ["szerzodes", "fotozas", "hirdetes", "targyalas", "adasvetel"].includes(m.statusz)) t.push({ kod: "iratok", ful: "szerzodes", n: hiany });
    return t;
}

// Az iratok állapota az eladónak: hiany | feltoltve | ellenorizve | mi_intezzuk
function iratAllapotok(m, fajlok) {
    const ir = m.iratok || {};
    const jogi = (Array.isArray(m.opciok) ? m.opciok : []).includes("jogi");
    const MI = ["cf", "adoigazolas"];
    return iratLista(m.tipus).map(x => {
        const f = fajlok.filter(y => y.tipus === "irat" && y.kod === x.kod);
        const megvan = !!(ir[x.kod] && ir[x.kod].megvan);
        const allapot = megvan ? "ellenorizve" : f.length ? "feltoltve" : jogi && MI.includes(x.kod) ? "mi_intezzuk" : "hiany";
        return { kod: x.kod, nev: x.nev, allapot, megj: ir[x.kod] && ir[x.kod].megj, fajlok: f.map(y => ({ id: y.id, nev: y.nev, mime: y.mime, created_at: y.created_at })) };
    });
}

async function sajatLista(user) {
    const r = await db.query(`${LISTA_SQL} WHERE m.user_id = $1 ORDER BY (m.statusz IN ('lezarva', 'elutasitva')), m.id DESC`, [user.id]);
    const ids = r.rows.map(m => m.id);
    if (!ids.length) return [];
    const be = await beallitas();
    const [naplo, megt, ajan, uz, fajl, lat] = await Promise.all([
        db.query(`SELECT id, megbizas_id, tipus, szoveg, created_at FROM megbizas_naplo WHERE megbizas_id = ANY($1::int[]) AND lathato_eladonak ORDER BY created_at DESC, id DESC LIMIT 400`, [ids]),
        db.query(`SELECT t.id, t.megbizas_id, t.idopont, t.statusz, t.visszajelzes, e.sorszam AS vevo_szam
                  FROM megbizas_megtekintesek t LEFT JOIN megbizas_erdeklodok e ON e.id = t.erdeklodo_id
                  WHERE t.megbizas_id = ANY($1::int[]) AND t.statusz IN ('egyeztetve', 'megtortent', 'elmaradt') ORDER BY t.idopont DESC NULLS LAST`, [ids]),
        db.query(`SELECT a.id, a.megbizas_id, a.osszeg, a.penznem, a.feltetelek, a.statusz, a.ellenajanlat, a.elado_valasz, a.vegso_osszeg,
                         a.created_at, a.updated_at, a.tovabbitva_at, a.ervenyes_ig, a.foglalo, a.eloszerzodes_ig, a.kozjegyzo_ig,
                         COALESCE(a.finanszirozas, e.finanszirozas) AS finanszirozas, a.hitel_allapot, a.onero, a.hitel_osszeg,
                         (a.igazolas_id IS NOT NULL) AS igazolas, e.sorszam AS vevo_szam,
                         EXISTS (SELECT 1 FROM megbizas_megtekintesek t WHERE t.erdeklodo_id = a.erdeklodo_id AND t.statusz = 'megtortent') AS megnezte
                  FROM megbizas_ajanlatok a LEFT JOIN megbizas_erdeklodok e ON e.id = a.erdeklodo_id
                  WHERE a.megbizas_id = ANY($1::int[]) AND a.tovabbitva_at IS NOT NULL ORDER BY a.created_at DESC`, [ids]),
        db.query(`SELECT z.id, z.megbizas_id, z.irany, z.szoveg, z.olvasva, z.created_at, COALESCE(u.nev, u.felhasznalonev) AS szerzo
                  FROM megbizas_uzenetek z LEFT JOIN users u ON u.id = z.user_id
                  WHERE z.megbizas_id = ANY($1::int[]) AND z.erdeklodo_id IS NULL ORDER BY z.created_at, z.id`, [ids]),
        db.query(`SELECT id, megbizas_id, tipus, kod, nev, mime, meret, created_at FROM megbizas_fajlok
                  WHERE megbizas_id = ANY($1::int[]) AND lathato_eladonak ORDER BY created_at DESC`, [ids]),
        db.query(`SELECT m.id AS megbizas_id, COUNT(l.*)::int AS n FROM megbizasok m JOIN latogatasok l ON l.ingatlan_id = m.ingatlan_id
                  WHERE m.id = ANY($1::int[]) GROUP BY m.id`, [ids]).catch(() => ({ rows: [] }))
    ]);
    const felelosok = await db.query("SELECT id, telefon, email FROM users WHERE id = ANY($1::int[])", [r.rows.map(m => m.felelos_id).filter(Boolean)]);
    return r.rows.map(m0 => {
        const m = listaSor(m0);
        const fe = felelosok.rows.find(x => x.id === m.felelos_id);
        const fajlok = fajl.rows.filter(x => x.megbizas_id === m.id);
        const ajanlatok = ajan.rows.filter(x => x.megbizas_id === m.id);
        const iratok = iratAllapotok(m, fajlok);
        const opciok = (Array.isArray(m.opciok) ? m.opciok : []).map(k => be.opciok.find(o => o.kod === k)).filter(Boolean)
            .map(o => ({ kod: o.kod, nev: o.nev, ikon: o.ikon, ar: o.ar, penznem: o.penznem }));
        const kov = kovetkezo(m0);
        return {
            id: m.id, statusz: m.statusz, ugylet: m.ugylet, tipus: m.tipus, varos: m.varos, telepules: m.telepules, cim: m.cim,
            nm: m.nm, szobak: m.szobak, kert_ar: m.kert_ar, penznem: m.penznem, kizarolagos: m.kizarolagos,
            idotartam_honap: m.idotartam_honap, szerzodes_szam: m.szerzodes_szam, created_at: m.created_at,
            statusz_valtva: m.statusz_valtva, hirdetve: m.hirdetve,
            ingatlan_id: m.ingatlan_id, hirdetes_statusz: m.hirdetes_statusz, kep_db: m.kep_db,
            szerzodes_allapot: m.szerzodes_allapot, szerzodes_mod: m.szerzodes_mod, szerzodes_elfogadva: m.szerzodes_elfogadva,
            szerzodes_kod_ok: m.szerzodes_kod_ok, ellenjegyezve: m.ellenjegyezve, szerzodes_hash: m.szerzodes_hash,
            szerzodes_datum: m.szerzodes_datum, alairva: m.alairva, eladva: m.eladva, lejar: m.lejar,
            eladasi_ar: m.eladasi_ar, jutalek: m.jutalek, fix_dij: m.fix_dij, minimum_dij: be.minimum_dij,
            csomag_kuldve: m.csomag_kuldve, csomag_jovahagyva: m.csomag_jovahagyva,
            hirdetes_kuldve: m.hirdetes_kuldve, hirdetes_jovahagyva: m.hirdetes_jovahagyva,
            fotozas_idopont: m.fotozas_idopont, feladatok: elokeszitoFeladatok(m),
            eloszerzodes_datum: m.eloszerzodes_datum, foglalo: m.foglalo, kozjegyzo_idopont: m.kozjegyzo_idopont, kozjegyzo: m.kozjegyzo, kulcsatadas: m.kulcsatadas,
            opciok,
            felelos: m.felelos_id ? { nev: m.felelos_nev, telefon: fe && fe.telefon, email: fe && fe.email } : null,
            kovetkezo: { kod: kov.kod, ki: kov.ki, datum: kov.datum || null },
            teendok: eladoTeendok(m, ajanlatok, iratok),
            iratok,
            fajlok: fajlok.filter(x => x.tipus !== "irat"),
            naplo: naplo.rows.filter(x => x.megbizas_id === m.id),
            megtekintesek: megt.rows.filter(x => x.megbizas_id === m.id),
            ajanlatok,
            uzenetek: uz.rows.filter(x => x.megbizas_id === m.id),
            olvasatlan: uz.rows.filter(x => x.megbizas_id === m.id && x.irany === "ki" && !x.olvasva).length,
            stat: {
                latogatas: (lat.rows.find(x => x.megbizas_id === m.id) || {}).n || 0,
                erdeklodok: m.erdeklodok, megtekintes: m.megtortent_db, foglalas: m.foglalas_db,
                ajanlat: ajanlatok.filter(a => a.statusz !== "visszavonva").length
            }
        };
    });
}

// A menü jelvényéhez: hány megbízása van, és hány dolog vár rá
async function eladoOsszegzes(userId) {
    try {
        const r = await db.query(`
            SELECT m.id, m.statusz, m.szerzodes_allapot, m.szerzodes_mod, m.csomag_kuldve, m.csomag_jovahagyva, m.hirdetes_kuldve, m.hirdetes_jovahagyva,
                   (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz = 'tovabbitva')::int AS valaszra,
                   (SELECT COUNT(*) FROM megbizas_uzenetek z WHERE z.megbizas_id = m.id AND z.erdeklodo_id IS NULL AND z.irany = 'ki' AND NOT z.olvasva)::int AS olvasatlan
            FROM megbizasok m WHERE m.user_id = $1`, [userId]);
        if (!r.rowCount) return null;
        const teendo = r.rows.reduce((s, m) => s + eladoTeendok(m).length + m.valaszra + m.olvasatlan, 0);
        return { db: r.rowCount, aktiv: r.rows.filter(m => !["lezarva", "elutasitva"].includes(m.statusz)).length, teendo };
    } catch (e) {
        return null;
    }
}

async function sajatMegbizas(user, id) {
    const r = await db.query("SELECT * FROM megbizasok WHERE id = $1", [Number(id) || 0]);
    const m = r.rows[0];
    if (!m) return null;
    if (user && (m.user_id === user.id)) return m;
    return null;
}

// Az eladó válasza egy neki továbbított ajánlatra
async function eladoValasz(user, megbizasId, ajanlatId, b) {
    const m = await sajatMegbizas(user, megbizasId);
    if (!m) throw hibaKod("not_found");
    const r = await db.query("SELECT * FROM megbizas_ajanlatok WHERE id = $1 AND megbizas_id = $2", [Number(ajanlatId) || 0, m.id]);
    const a = r.rows[0];
    if (!a || a.statusz !== "tovabbitva") throw hibaKod("not_found");
    if (a.ervenyes_ig && new Date(a.ervenyes_ig) < Date.now()) throw hibaKod("offer_expired");
    const be = await beallitas();
    const mod = ajanlatMod(m, be);
    const valasz = b && b.valasz;
    let statusz;
    let ellen = null;
    if (valasz === "elfogad") statusz = "elfogadva";
    else if (valasz === "elutasit") statusz = "elutasitva";
    else if (valasz === "ellen") {
        ellen = szam(b.osszeg);
        if (!ellen || ellen <= 0) throw hibaKod("bad_amount");
        statusz = "ellenajanlat";
    } else throw hibaKod("bad_request");
    const uzenet = sz(b.uzenet, 1000);
    const ellenVevonek = statusz === "ellenajanlat" && mod === "azonnal";
    await db.query(`UPDATE megbizas_ajanlatok SET statusz = $1, ellenajanlat = COALESCE($2, ellenajanlat), elado_valasz = $3,
                        vegso_osszeg = CASE WHEN $1 = 'elfogadva' THEN osszeg ELSE vegso_osszeg END,
                        ellen_vevonek = $5, updated_at = NOW() WHERE id = $4`,
        [statusz, ellen, uzenet, a.id, ellenVevonek]);
    await naploIr(m.id, "ajanlat", `Eladó válasza: ${statusz}${ellen ? ` – ellenajánlat ${ellen} ${a.penznem}` : ""}${uzenet ? ` – „${uzenet}”` : ""}`, true, user.id);
    const lepes = statusz === "elfogadva" ? await elorelep(m.id, user.id) : { lepesek: [], lezart: null };
    return { statusz, megbizas: m, ajanlat: a, ellen, ellenVevonek, uzenet, mod, lepes };
}

// A csomag (szolgáltatások, díj, kért ár) jóváhagyása
async function csomagJovahagy(user, id) {
    const m = await sajatMegbizas(user, id);
    if (!m) throw hibaKod("not_found");
    if (!m.csomag_kuldve || m.csomag_jovahagyva || !["uj", "egyeztetes"].includes(m.statusz)) throw hibaKod("bad_state");
    await db.query("UPDATE megbizasok SET csomag_jovahagyva = NOW(), csomag_jovahagyta = 'elado', elso_kapcsolat = COALESCE(elso_kapcsolat, NOW()), updated_at = NOW() WHERE id = $1", [m.id]);
    await naploIr(m.id, "jegyzet", "Az eladó jóváhagyta a csomagot és az árat.", true, user.id);
    return { megbizas: m, lepes: await elorelep(m.id, user.id) };
}

// A hirdetés előnézetének jóváhagyása
async function hirdetesJovahagy(user, id) {
    const m = await sajatMegbizas(user, id);
    if (!m) throw hibaKod("not_found");
    if (!m.hirdetes_kuldve || m.hirdetes_jovahagyva || m.statusz !== "fotozas") throw hibaKod("bad_state");
    await db.query("UPDATE megbizasok SET hirdetes_jovahagyva = NOW(), updated_at = NOW() WHERE id = $1", [m.id]);
    await naploIr(m.id, "jegyzet", "Az eladó jóváhagyta a hirdetést.", true, user.id);
    return { megbizas: m, lepes: await elorelep(m.id, user.id) };
}

// Online aláírás: egyszeri kód e-mailben (15 percig érvényes)
async function szerzodesKod(user, id) {
    const m = await sajatMegbizas(user, id);
    if (!m) throw hibaKod("not_found");
    if (m.szerzodes_allapot !== "elkuldve") throw hibaKod("not_sent");
    if (m.szerzodes_kod_lejar && new Date(m.szerzodes_kod_lejar).getTime() - 14 * 60000 > Date.now()) throw hibaKod("wait_a_minute");
    const kod = String(crypto.randomInt(100000, 1000000));
    const hash = crypto.createHash("sha256").update(m.id + ":" + kod).digest("hex");
    await db.query("UPDATE megbizasok SET szerzodes_kod_hash = $2, szerzodes_kod_lejar = NOW() + INTERVAL '15 minutes', szerzodes_kod_proba = 0 WHERE id = $1", [m.id, hash]);
    return { megbizas: m, kod, email: user.email || m.email };
}

// Az eladó aláírja a szerződést (online)
//   b: { elfogad, kod, korai_kezdes } – a kód akkor kell, ha az e-mail küldés be van állítva
async function szerzodesElfogad(user, id, b, { ip, ua, kodKell }) {
    const m = await sajatMegbizas(user, id);
    if (!m) throw hibaKod("not_found");
    if (m.szerzodes_allapot !== "elkuldve") throw hibaKod("not_sent");
    if (!b || !b.elfogad) throw hibaKod("must_accept");
    let kodOk = false;
    if (kodKell) {
        if (!m.szerzodes_kod_hash || !m.szerzodes_kod_lejar || new Date(m.szerzodes_kod_lejar) < Date.now()) throw hibaKod("code_expired");
        if ((m.szerzodes_kod_proba || 0) >= 5) throw hibaKod("code_expired");
        const hash = crypto.createHash("sha256").update(m.id + ":" + String(b.kod || "").replace(/\D/g, "")).digest("hex");
        if (hash !== m.szerzodes_kod_hash) {
            await db.query("UPDATE megbizasok SET szerzodes_kod_proba = COALESCE(szerzodes_kod_proba, 0) + 1 WHERE id = $1", [m.id]);
            throw hibaKod("bad_code");
        }
        kodOk = true;
    }
    const be = await beallitas();
    const dij = await dijSzamol(m);
    const hash = szerzodes.ujjlenyomat(await szerzodes.torzs({ ...m, szerzodes_datum: m.szerzodes_datum || ma() }, be, dij));
    await db.query(`UPDATE megbizasok SET szerzodes_allapot = 'elfogadva', szerzodes_elfogadva = NOW(), szerzodes_elfogadva_ip = $2,
                        szerzodes_ua = $3, szerzodes_hash = $4, szerzodes_kod_ok = $5, korai_kezdes = $6, szerzodes_mod = 'online',
                        szerzodes_kod_hash = NULL, szerzodes_datum = COALESCE(szerzodes_datum, CURRENT_DATE),
                        csomag_jovahagyva = COALESCE(csomag_jovahagyva, NOW()), updated_at = NOW()
                    WHERE id = $1`, [m.id, sz(ip, 80), sz(ua, 300), hash, kodOk, !!b.korai_kezdes]);
    await naploIr(m.id, "szerzodes", `Az eladó online aláírta a szerződést${kodOk ? " (e-mailben kapott kóddal)" : ""}.`, true, user.id);
    // Ha a beállítás így szól, magától ellenjegyezzük
    if (be.auto_ellenjegyzes) await ellenjegyez(m.id, null);
    return { megbizas: m, lepes: await elorelep(m.id, user.id), kodOk };
}

// Az eladó inkább személyesen írja alá
async function szerzodesSzemelyes(user, id, b) {
    const m = await sajatMegbizas(user, id);
    if (!m) throw hibaKod("not_found");
    if (m.szerzodes_allapot !== "elkuldve") throw hibaKod("not_sent");
    const javaslat = sz(b && b.javaslat, 300);
    await db.query("UPDATE megbizasok SET szerzodes_mod = 'szemelyes', szemelyes_javaslat = $2, updated_at = NOW() WHERE id = $1", [m.id, javaslat]);
    await naploIr(m.id, "szerzodes", `Az eladó személyesen szeretné aláírni a szerződést${javaslat ? ` – ${javaslat}` : ""}.`, true, user.id);
    return { megbizas: m, javaslat };
}

// Az eladó feltölt egy iratot
async function sajatIrat(user, id, b) {
    const m = await sajatMegbizas(user, id);
    if (!m) throw hibaKod("not_found");
    if (["lezarva", "elutasitva"].includes(m.statusz)) throw hibaKod("closed");
    const kod = iratLista(m.tipus).some(x => x.kod === b.kod) ? b.kod : null;
    const f = await fajlMent(m.id, { ...b, tipus: "irat", kod }, user.id, { lathato: true });
    await naploIr(m.id, "jegyzet", `Az eladó feltöltött egy iratot: ${f.nev}`, true, user.id);
    return { megbizas: m, fajl: f };
}

// Visszavonás (amíg nincs szerződés)
async function sajatVisszavon(user, id) {
    const m = await sajatMegbizas(user, id);
    if (!m) throw hibaKod("not_found");
    if (!["uj", "egyeztetes"].includes(m.statusz)) throw hibaKod("not_cancellable");
    await db.query("UPDATE megbizasok SET statusz = 'lezarva', statusz_valtva = NOW(), updated_at = NOW() WHERE id = $1", [m.id]);
    await naploIr(m.id, "statusz", "lezarva", true, user.id);
    await naploIr(m.id, "jegyzet", "Az eladó visszavonta a megbízást.", true, user.id);
    return m;
}

async function sajatUzenet(user, id, szoveg) {
    const m = await sajatMegbizas(user, id);
    if (!m) throw hibaKod("not_found");
    if (["lezarva", "elutasitva"].includes(m.statusz)) throw hibaKod("closed");
    await uzenetIr(m.id, null, "be", user.id, szoveg);
    return m;
}

async function sajatOlvasott(user, id) {
    const m = await sajatMegbizas(user, id);
    if (!m) throw hibaKod("not_found");
    await olvasott(m.id, null, "ugyfel");
}

// ===================== A VEVŐ (a megbízásos hirdetésen) =====================

async function hirdetesMegbizas(ingatlanId, statuszok = LATHATO) {
    const r = await db.query(`
        SELECT m.* FROM megbizasok m
        JOIN ingatlanok i ON i.id = m.ingatlan_id AND i.megbizas_id = m.id
        WHERE m.ingatlan_id = $1 AND m.statusz = ANY($2::text[])`, [Number(ingatlanId) || 0, statuszok]);
    return r.rows[0] || null;
}

// A vevőnek mutatott ajánlat-állapot (az ellenajánlatot csak ha már neki szól)
function vevoAjanlat(a) {
    const x = {
        id: a.id, osszeg: a.osszeg, penznem: a.penznem, feltetelek: a.feltetelek, created_at: a.created_at, vegso_osszeg: a.vegso_osszeg,
        ervenyes_ig: a.ervenyes_ig, finanszirozas: a.finanszirozas
    };
    if (a.statusz === "ellenajanlat") {
        if (a.ellen_vevonek) { x.statusz = "ellenajanlat"; x.ellenajanlat = a.ellenajanlat; x.elado_valasz = a.elado_valasz; }
        else x.statusz = "tovabbitva";
    } else if (a.statusz === "uj") {
        x.statusz = "tovabbitva";
    } else {
        x.statusz = a.statusz;
    }
    return x;
}

// Tehet-e ajánlatot (a beállítás szerint): megnézte / kapcsolatban van / bárki; vagy az admin engedte
async function ajanlhat(m, be, erd) {
    if (!VEVOI.includes(m.statusz)) return { ok: false, miert: "not_open" };
    const felt = be.ajanlat_feltetel || "megtekintes_utan";
    if (felt === "barki") return { ok: true };
    if (!erd) return { ok: false, miert: felt === "kapcsolat_utan" ? "contact_first" : "view_first" };
    if (erd.ajanlat_engedve) return { ok: true };
    if (felt === "kapcsolat_utan") return { ok: true };
    const t = await db.query("SELECT 1 FROM megbizas_megtekintesek WHERE erdeklodo_id = $1 AND statusz = 'megtortent' LIMIT 1", [erd.id]);
    return t.rowCount ? { ok: true } : { ok: false, miert: "view_first" };
}

// Mit lát a vevő: az ő foglalásai, ajánlatai, üzenetei erre a hirdetésre
async function vevoAllapot(user, ingatlanId) {
    const m = await hirdetesMegbizas(ingatlanId);
    if (!m) return { aktiv: false };
    const be = await beallitas();
    const n = naptarAdat(m, be);
    const alap = {
        aktiv: true, szakasz: m.statusz, foglalt: m.statusz === "adasvetel", penznem: m.penznem || be.penznem,
        ajanlat_feltetel: be.ajanlat_feltetel || "megtekintes_utan", ervenyes_ora: be.ajanlat_ervenyes_ora || 72,
        naptar: { aktiv: n.aktiv && VEVOI.includes(m.statusz), hossz: n.hossz, mod: n.mod, lemondas_ora: n.lemondas_ora }
    };
    if (!user) return { ...alap, ajanlhat: false, miert: "login" };
    if (m.user_id === user.id) return { ...alap, sajat: true };
    const e = await db.query("SELECT * FROM megbizas_erdeklodok WHERE megbizas_id = $1 AND user_id = $2 ORDER BY id LIMIT 1", [m.id, user.id]);
    const erd = e.rows[0] || null;
    const aj = await ajanlhat(m, be, erd);
    if (!erd) return { ...alap, sajat: false, ajanlhat: aj.ok, miert: aj.miert || null };
    const [mt, ajl, uz] = await Promise.all([
        db.query("SELECT id, idopont, javasolt, statusz, varolista FROM megbizas_megtekintesek WHERE erdeklodo_id = $1 ORDER BY id DESC LIMIT 10", [erd.id]),
        db.query("SELECT * FROM megbizas_ajanlatok WHERE erdeklodo_id = $1 ORDER BY id DESC LIMIT 10", [erd.id]),
        szal(m.id, erd.id)
    ]);
    // Az olvasatlan (nekünk írt) üzenetek – megnyitáskor olvasottak
    await olvasott(m.id, erd.id, "ugyfel");
    return {
        ...alap, sajat: false, ajanlhat: aj.ok, miert: aj.miert || null,
        erdeklodo: { id: erd.id, statusz: erd.statusz, nev: erd.nev, telefon: erd.telefon, email: erd.email },
        megtekintesek: mt.rows.map(t => ({ ...t, lemondhato: t.statusz === "kert" || (t.statusz === "egyeztetve" && t.idopont && new Date(t.idopont).getTime() - n.lemondas_ora * 3600000 > Date.now()) })),
        ajanlatok: ajl.rows.map(vevoAjanlat),
        uzenetek: uz.map(z => ({ id: z.id, irany: z.irany, szoveg: z.szoveg, created_at: z.created_at }))
    };
}

// A vevő mint érdeklődő (új vagy meglévő). Telefonszám kell (a bemutató felhívhassa).
async function vevoErdeklodo(m, user, b, { telefonKell = false } = {}) {
    const nev = sz(b.nev, 160) || user.nev || null;
    const telefon = sz(b.telefon, 40) || user.telefon || null;
    const email = ((sz(b.email, 160) || user.email || "") + "").toLowerCase() || null;
    if (!nev) throw hibaKod("missing_name");
    if (telefonKell && !telefon) throw hibaKod("missing_phone");
    if (telefon && !TEL_RE.test(telefon)) throw hibaKod("bad_phone");
    if (!telefon && !email) throw hibaKod("missing_contact");
    if (email && !EMAIL_RE.test(email)) throw hibaKod("bad_email");
    const keret = szam(b.koltsegkeret);
    const fin = FINANSZIROZAS.includes(b.finanszirozas) ? b.finanszirozas : null;
    const e = await db.query("SELECT * FROM megbizas_erdeklodok WHERE megbizas_id = $1 AND user_id = $2 ORDER BY id LIMIT 1", [m.id, user.id]);
    if (e.rowCount) {
        await db.query(`UPDATE megbizas_erdeklodok SET nev = $2, telefon = COALESCE($3, telefon), email = COALESCE($4, email),
                        koltsegkeret = COALESCE($5, koltsegkeret), finanszirozas = COALESCE($6, finanszirozas), updated_at = NOW() WHERE id = $1`,
            [e.rows[0].id, nev, telefon, email, keret, fin]);
        return { ...e.rows[0], id: e.rows[0].id, uj: false, nev, email, telefon: telefon || e.rows[0].telefon };
    }
    const r = await db.query(`
        INSERT INTO megbizas_erdeklodok (megbizas_id, user_id, nev, telefon, email, koltsegkeret, finanszirozas, statusz, forras, sorszam)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'uj','hirdetes',
                (SELECT COALESCE(MAX(sorszam), 0) + 1 FROM megbizas_erdeklodok WHERE megbizas_id = $1)) RETURNING *`,
        [m.id, user.id, nev, telefon, email, keret, fin]);
    return { ...r.rows[0], uj: true };
}

// Visszaélés ellen: egy vevő legfeljebb 15 kérése naponta egy hirdetésre
async function napiKorlat(userId, megbizasId) {
    const napi = await db.query(`
        SELECT (SELECT COUNT(*) FROM megbizas_megtekintesek t JOIN megbizas_erdeklodok e ON e.id = t.erdeklodo_id
                WHERE e.user_id = $1 AND t.megbizas_id = $2 AND t.created_at > NOW() - INTERVAL '1 day')
             + (SELECT COUNT(*) FROM megbizas_ajanlatok a JOIN megbizas_erdeklodok e ON e.id = a.erdeklodo_id
                WHERE e.user_id = $1 AND a.megbizas_id = $2 AND a.created_at > NOW() - INTERVAL '1 day')
             + (SELECT COUNT(*) FROM megbizas_uzenetek z JOIN megbizas_erdeklodok e ON e.id = z.erdeklodo_id
                WHERE e.user_id = $1 AND z.megbizas_id = $2 AND z.irany = 'be' AND z.created_at > NOW() - INTERVAL '1 day') AS n`, [userId, megbizasId]);
    if (Number(napi.rows[0].n) >= 15) throw hibaKod("too_many");
}

// A szabad időpontok a vevőnek: napokra bontva
async function vevoIdopontok(ingatlanId) {
    const m = await hirdetesMegbizas(ingatlanId, VEVOI);
    if (!m) return { aktiv: false, napok: [] };
    const be = await beallitas();
    const n = naptarAdat(m, be);
    if (!n.aktiv) return { aktiv: false, napok: [] };
    const lista = (await szabadIdopontok(m, be)).filter(x => !x.mult);
    const napok = [];
    lista.forEach(x => {
        let d = napok.find(y => y.nap === x.nap);
        if (!d) { d = { nap: x.nap, het: hetNapja(x.nap), idopontok: [] }; napok.push(d); }
        d.idopontok.push({ idopont: x.idopont, ora: x.ora, szabad: x.szabad, kapacitas: x.kapacitas });
    });
    return { aktiv: true, hossz: n.hossz, mod: n.mod, napok };
}

// Időpontfoglalás a naptárból (zárolással: egy időpontot csak annyian foglalhatnak, ahány hely van)
//   b: { idopont, nev, telefon, email, kerdes, adatkezeles, athelyez (régi foglalás id) }
async function vevoFoglal(user, ingatlanId, b) {
    if (!user) throw hibaKod("login_required");
    if (!b || !b.adatkezeles) throw hibaKod("must_accept");
    const m = await hirdetesMegbizas(ingatlanId, VEVOI);
    if (!m) throw hibaKod("not_found");
    if (m.user_id === user.id) throw hibaKod("own_listing");
    await napiKorlat(user.id, m.id);
    const be = await beallitas();
    const n = naptarAdat(m, be);
    if (!n.aktiv) throw hibaKod("calendar_off");
    const kert = idopontOlvas(b.idopont);
    if (!kert) throw hibaKod("bad_time");

    const erd = await vevoErdeklodo(m, user, b, { telefonKell: true });
    const client = await db.connect();
    let tid;
    let regi = null;
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('mb_naptar_' || $1::text))", [m.id]);
        // Egy vevőnek egyszerre egy élő foglalása lehet (áthelyezésnél a régit lemondjuk)
        const elo = await client.query(`SELECT id, idopont FROM megbizas_megtekintesek WHERE erdeklodo_id = $1 AND statusz = 'egyeztetve' AND idopont > NOW()`, [erd.id]);
        if (elo.rowCount) {
            const cel = elo.rows.find(x => x.id === Number(b.athelyez));
            if (!cel) throw hibaKod("already_booked");
            regi = cel;
            await client.query("UPDATE megbizas_megtekintesek SET statusz = 'lemondva', updated_at = NOW() WHERE id = $1", [cel.id]);
        }
        // A kért időpont a szabad időpontok között van-e (a zárolás után számolva)
        const szabad = await szabadIdopontok(m, be);
        const x = szabad.find(s => new Date(s.idopont).getTime() === kert.getTime());
        if (!x || x.szabad < 1) throw hibaKod("slot_taken");
        const r = await client.query(`
            INSERT INTO megbizas_megtekintesek (megbizas_id, erdeklodo_id, idopont, statusz, bemutato_id, forras)
            VALUES ($1, $2, $3, 'egyeztetve', $4, 'naptar') RETURNING id`, [m.id, erd.id, kert, m.bemutato_id || null]);
        tid = r.rows[0].id;
        // A várólistás kérése teljesült
        await client.query("UPDATE megbizas_megtekintesek SET statusz = 'lemondva', updated_at = NOW() WHERE erdeklodo_id = $1 AND statusz = 'kert'", [erd.id]);
        await client.query("UPDATE megbizas_erdeklodok SET statusz = 'megtekintes', updated_at = NOW() WHERE id = $1 AND statusz IN ('uj', 'kapcsolat')", [erd.id]);
        await client.query("COMMIT");
    } catch (e) {
        await client.query("ROLLBACK").catch(() => { });
        throw e;
    } finally {
        client.release();
    }
    const kerdes = sz(b.kerdes, 2000);
    if (kerdes) await uzenetIr(m.id, erd.id, "be", user.id, kerdes);
    await naploIr(m.id, "megtekintes", `${erd.nev}: időpontot foglalt${regi ? " (áthelyezve)" : ""}`, false, user.id);
    return { megbizas: m, erdeklodo: erd, megtekintes_id: tid, idopont: kert, regi, kerdes };
}

// Várólista: egyik időpont sem jó – a vevő megírja, mikor érne rá
async function vevoVarolista(user, ingatlanId, b) {
    if (!user) throw hibaKod("login_required");
    const m = await hirdetesMegbizas(ingatlanId, VEVOI);
    if (!m) throw hibaKod("not_found");
    if (m.user_id === user.id) throw hibaKod("own_listing");
    await napiKorlat(user.id, m.id);
    const erd = await vevoErdeklodo(m, user, b || {}, { telefonKell: true });
    const javasolt = sz(b && b.javasolt, 300);
    await db.query("UPDATE megbizas_megtekintesek SET statusz = 'lemondva', updated_at = NOW() WHERE erdeklodo_id = $1 AND statusz = 'kert'", [erd.id]);
    await db.query(`INSERT INTO megbizas_megtekintesek (megbizas_id, erdeklodo_id, javasolt, statusz, bemutato_id, varolista, forras)
                    VALUES ($1,$2,$3,'kert',$4,true,'varolista')`, [m.id, erd.id, javasolt, m.bemutato_id || null]);
    await db.query("UPDATE megbizas_erdeklodok SET statusz = 'megtekintes', updated_at = NOW() WHERE id = $1 AND statusz IN ('uj', 'kapcsolat')", [erd.id]);
    await naploIr(m.id, "megtekintes", `${erd.nev}: várólistára került${javasolt ? ` (${javasolt})` : ""}`, false, user.id);
    return { megbizas: m, erdeklodo: erd, javasolt };
}

// A várólistán lévők (egy felszabadult időpontnál értesítjük őket)
async function varolistasok(megbizasId) {
    const r = await db.query(`
        SELECT DISTINCT e.id, e.nev, e.email FROM megbizas_megtekintesek t JOIN megbizas_erdeklodok e ON e.id = t.erdeklodo_id
        WHERE t.megbizas_id = $1 AND t.statusz = 'kert' AND e.email IS NOT NULL`, [megbizasId]);
    return r.rows;
}

// Vételi ajánlat finanszírozással
//   b: { osszeg, penznem, finanszirozas, onero, hitel_osszeg, hitel_allapot, bank, foglalo,
//        eloszerzodes_ig, kozjegyzo_ig, ervenyes_ora, feltetelek, szandek, igazolas: dataURL }
async function vevoAjanlatTesz(user, ingatlanId, b) {
    if (!user) throw hibaKod("login_required");
    const m = await hirdetesMegbizas(ingatlanId);
    if (!m) throw hibaKod("not_found");
    if (m.user_id === user.id) throw hibaKod("own_listing");
    const be = await beallitas();
    const e = await db.query("SELECT * FROM megbizas_erdeklodok WHERE megbizas_id = $1 AND user_id = $2 ORDER BY id LIMIT 1", [m.id, user.id]);
    const aj = await ajanlhat(m, be, e.rows[0]);
    if (!aj.ok) throw hibaKod(aj.miert || "forbidden");
    await napiKorlat(user.id, m.id);

    if (!b.szandek) throw hibaKod("must_accept");
    const osszeg = szam(b.osszeg);
    if (!osszeg || osszeg <= 0) throw hibaKod("bad_amount");
    const fin = FINANSZIROZAS.includes(b.finanszirozas) ? b.finanszirozas : null;
    if (!fin) throw hibaKod("missing_financing");
    const hitel = fin === "hitel" || fin === "vegyes";
    const onero = szam(b.onero);
    const hitelOsszeg = szam(b.hitel_osszeg);
    const hitelAllapot = HITEL_ALLAPOT.includes(b.hitel_allapot) ? b.hitel_allapot : null;
    if (hitel && (!hitelAllapot || hitelOsszeg === null || hitelOsszeg <= 0)) throw hibaKod("missing_financing");
    const foglalo = szam(b.foglalo);
    if (foglalo !== null && (foglalo < 0 || foglalo > osszeg)) throw hibaKod("bad_amount");
    const eloIg = datum(b.eloszerzodes_ig);
    const kozIg = datum(b.kozjegyzo_ig);
    if ((eloIg && eloIg < ma()) || (kozIg && kozIg < ma()) || (eloIg && kozIg && kozIg < eloIg)) throw hibaKod("bad_date");
    const ervOra = [24, 48, 72, 120, 168].includes(Number(b.ervenyes_ora)) ? Number(b.ervenyes_ora) : (be.ajanlat_ervenyes_ora || 72);
    const penznem = b.penznem === "RON" ? "RON" : b.penznem === "EUR" ? "EUR" : (m.penznem || "EUR");

    const erd = await vevoErdeklodo(m, user, { ...b, finanszirozas: fin }, { telefonKell: true });
    const mod = ajanlatMod(m, be);
    const tovabbitva = mod === "azonnal";

    let igazolasId = null;
    if (b.igazolas) {
        const f = await fajlMent(m.id, { fajl: b.igazolas, tipus: "hitel_igazolas", nev: sz(b.igazolas_nev, 160) || "hitel-igazolas" }, user.id, { erdeklodoId: erd.id, lathato: false });
        igazolasId = f.id;
    }

    // A vevő korábbi nyitott ajánlatai helyett ez az új (egy vevőnek egy élő ajánlata lehet)
    await db.query(`UPDATE megbizas_ajanlatok SET statusz = 'visszavonva', updated_at = NOW() WHERE erdeklodo_id = $1 AND statusz IN ('uj', 'tovabbitva', 'ellenajanlat')`, [erd.id]);
    const r = await db.query(`
        INSERT INTO megbizas_ajanlatok (megbizas_id, erdeklodo_id, osszeg, penznem, feltetelek, statusz, tovabbitva_at, ellen_vevonek,
               finanszirozas, onero, hitel_osszeg, hitel_allapot, bank, foglalo, eloszerzodes_ig, kozjegyzo_ig, ervenyes_ig, szandek, igazolas_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11,$12,$13,$14,$15, NOW() + ($16::text || ' hours')::interval, true, $17) RETURNING id, ervenyes_ig`,
        [m.id, erd.id, osszeg, penznem, sz(b.feltetelek, 1000), tovabbitva ? "tovabbitva" : "uj", tovabbitva ? new Date() : null,
         fin, onero, hitel ? hitelOsszeg : null, hitel ? hitelAllapot : null, sz(b.bank, 120), foglalo, eloIg, kozIg, String(ervOra), igazolasId]);
    await db.query("UPDATE megbizas_erdeklodok SET statusz = 'ajanlat', updated_at = NOW() WHERE id = $1 AND statusz IN ('uj', 'kapcsolat', 'megtekintes')", [erd.id]);
    const uzenet = sz(b.uzenet, 2000);
    if (uzenet) await uzenetIr(m.id, erd.id, "be", user.id, uzenet);
    await naploIr(m.id, "ajanlat", `${tovabbitva ? "Vételi ajánlat érkezett" : `${erd.nev}: vételi ajánlat`}: ${osszeg} ${penznem}${tovabbitva ? " (automatikusan az eladónál)" : ""}`, tovabbitva, user.id);
    const lepes = await elorelep(m.id, user.id);
    return { megbizas: m, erdeklodo: erd, ajanlat_id: r.rows[0].id, ervenyes_ig: r.rows[0].ervenyes_ig, tovabbitva, osszeg, penznem, finanszirozas: fin, lepes };
}

// A vevő kérdése (üzenet nekünk) – ha még nem érdeklődő, azzá válik
async function vevoUzenet(user, ingatlanId, b) {
    const m = await hirdetesMegbizas(ingatlanId);
    if (!m) throw hibaKod("not_found");
    if (m.user_id === user.id) throw hibaKod("own_listing");
    await napiKorlat(user.id, m.id);
    const erd = await vevoErdeklodo(m, user, b || {});
    await uzenetIr(m.id, erd.id, "be", user.id, b && (b.szoveg || b.uzenet));
    return { megbizas: m, erdeklodo: erd };
}

// A vevő elfogadja az eladó ellenajánlatát
async function vevoEllenElfogad(user, ingatlanId, ajanlatId) {
    const m = await hirdetesMegbizas(ingatlanId);
    if (!m) throw hibaKod("not_found");
    const r = await db.query(`SELECT a.* FROM megbizas_ajanlatok a JOIN megbizas_erdeklodok e ON e.id = a.erdeklodo_id
                              WHERE a.id = $1 AND a.megbizas_id = $2 AND e.user_id = $3`, [Number(ajanlatId) || 0, m.id, user.id]);
    const a = r.rows[0];
    if (!a || a.statusz !== "ellenajanlat" || !a.ellen_vevonek) throw hibaKod("not_found");
    await db.query(`UPDATE megbizas_ajanlatok SET statusz = 'elfogadva', vegso_osszeg = ellenajanlat, vevo_valasz = 'elfogadta az ellenajánlatot', updated_at = NOW() WHERE id = $1`, [a.id]);
    await naploIr(m.id, "ajanlat", `A vevő elfogadta az ellenajánlatot: ${a.ellenajanlat} ${a.penznem}`, true, user.id);
    return { megbizas: m, ajanlat: a, lepes: await elorelep(m.id, user.id) };
}

// A vevő visszavonja az ajánlatát
async function vevoAjanlatVisszavon(user, ingatlanId, ajanlatId) {
    const m = await hirdetesMegbizas(ingatlanId);
    if (!m) throw hibaKod("not_found");
    const r = await db.query(`UPDATE megbizas_ajanlatok a SET statusz = 'visszavonva', updated_at = NOW()
                              FROM megbizas_erdeklodok e WHERE e.id = a.erdeklodo_id AND a.id = $1 AND a.megbizas_id = $2 AND e.user_id = $3
                                AND a.statusz IN ('uj', 'tovabbitva', 'ellenajanlat') RETURNING a.*`, [Number(ajanlatId) || 0, m.id, user.id]);
    if (!r.rowCount) throw hibaKod("not_found");
    await naploIr(m.id, "ajanlat", `A vevő visszavonta az ajánlatát (${r.rows[0].osszeg} ${r.rows[0].penznem})`, !!r.rows[0].tovabbitva_at, user.id);
    return { megbizas: m, ajanlat: r.rows[0] };
}

// A vevő lemondja a megtekintést (a lemondási határidőig)
async function vevoMegtekintesLemond(user, ingatlanId, tid) {
    const m = await hirdetesMegbizas(ingatlanId);
    if (!m) throw hibaKod("not_found");
    const be = await beallitas();
    const n = naptarAdat(m, be);
    const r0 = await db.query(`SELECT t.* FROM megbizas_megtekintesek t JOIN megbizas_erdeklodok e ON e.id = t.erdeklodo_id
                               WHERE t.id = $1 AND t.megbizas_id = $2 AND e.user_id = $3 AND t.statusz IN ('kert', 'egyeztetve')`, [Number(tid) || 0, m.id, user.id]);
    const t = r0.rows[0];
    if (!t) throw hibaKod("not_found");
    if (t.statusz === "egyeztetve" && t.idopont && new Date(t.idopont).getTime() - n.lemondas_ora * 3600000 < Date.now()) throw hibaKod("too_late");
    await db.query("UPDATE megbizas_megtekintesek SET statusz = 'lemondva', updated_at = NOW() WHERE id = $1", [t.id]);
    await naploIr(m.id, "megtekintes", "A vevő lemondta a megtekintést.", t.statusz === "egyeztetve", user.id);
    return { megbizas: m, megtekintes: t, varolista: t.statusz === "egyeztetve" ? await varolistasok(m.id) : [] };
}


// ===================== AZ ÉRTÉKESÍTÉSI ASZTAL (admin / munkatárs) =====================

// A megbízások listája – az admin mindet, a munkatárs a hatókörét látja
async function lista(req) {
    const k = await csapat.kontextus(req);
    const params = [];
    const hol = csapat.hatokorSql(k, "megbizas_lat", params, { varos: "m.varos", tipus: "m.tipus", megbizas: "m.id", ingatlan: "m.ingatlan_id" });
    const r = await db.query(`${LISTA_SQL} WHERE ${hol}
        ORDER BY CASE m.statusz WHEN 'uj' THEN 0 WHEN 'egyeztetes' THEN 1 WHEN 'szerzodes' THEN 2 WHEN 'fotozas' THEN 3
                 WHEN 'hirdetes' THEN 4 WHEN 'targyalas' THEN 5 WHEN 'adasvetel' THEN 6 ELSE 9 END, m.updated_at DESC`, params);
    const sorok = r.rows.map(m => ({ ...listaSor(m), kovetkezo: kovetkezo(m) }));
    const tennivalo = r.rows.flatMap(m => teendok(m).map(x => ({
        ...x, szam: m.szerzodes_szam, nev: m.nev || m.fiok_nev, varos: m.varos, tipus: m.tipus, cim: m.cim, telepules: m.telepules,
        felelos_id: m.felelos_id, felelos_nev: m.felelos_nev, fotos_nev: m.fotos_nev, bemutato_nev: m.bemutato_nev
    }))).sort((a, b) => SZINT_SORREND[a.szint] - SZINT_SORREND[b.szint]);
    sorok.forEach(m => { m.teendo_db = tennivalo.filter(x => x.megbizas_id === m.id && x.szint !== "info" && !["elado", "vevo"].includes(x.ki)).length; });

    // Közelgő megtekintések (7 nap)
    const p2 = [];
    const hol2 = csapat.hatokorSql(k, "megbizas_lat", p2, { varos: "m.varos", tipus: "m.tipus", megbizas: "m.id", ingatlan: "m.ingatlan_id" });
    const kozelgo = await db.query(`
        SELECT t.id, t.idopont, t.statusz, t.megbizas_id, m.szerzodes_szam, m.cim, m.telepules, m.varos, m.tipus,
               e.nev AS erdeklodo_nev, e.telefon AS erdeklodo_telefon, COALESCE(b.nev, b.felhasznalonev) AS bemutato_nev
        FROM megbizas_megtekintesek t JOIN megbizasok m ON m.id = t.megbizas_id
        LEFT JOIN megbizas_erdeklodok e ON e.id = t.erdeklodo_id
        LEFT JOIN users b ON b.id = COALESCE(t.bemutato_id, m.bemutato_id)
        WHERE t.statusz = 'egyeztetve' AND t.idopont BETWEEN NOW() - INTERVAL '2 hours' AND NOW() + INTERVAL '7 days' AND ${hol2}
        ORDER BY t.idopont LIMIT 30`, p2);

    return {
        lista: sorok,
        teendok: tennivalo,
        kozelgo: kozelgo.rows,
        statuszok: STATUSZOK,
        szakaszok: SZAKASZOK,
        beallitas: await beallitas(),
        jog: { admin: k.admin, kezel: csapat.vanJoga(k, "megbizas"), en: req.user ? req.user.id : null }
    };
}

async function reszlet(req, id) {
    const k = await csapat.kontextus(req);
    const mid = Number(id) || 0;
    if (!(await csapat.megbizasJog(req, mid, "megbizas_lat"))) return null;
    const m0 = await sorBetolt(mid);
    if (!m0) return null;
    const m = listaSor(m0);
    const be = await beallitas();
    const kezel = await csapat.megbizasJog(req, m.id, "megbizas");
    const fiok = await db.query("SELECT email, telefon FROM users WHERE id = $1", [m.user_id || 0]);
    const [erd, megt, ajan, naplo, hird, uz, uzenetek, valaszthatok, fajlok, lat] = await Promise.all([
        db.query(`SELECT e.*,
                         EXISTS (SELECT 1 FROM megbizas_megtekintesek t WHERE t.erdeklodo_id = e.id AND t.statusz = 'megtortent') AS megnezte
                  FROM megbizas_erdeklodok e WHERE e.megbizas_id = $1 ORDER BY e.id DESC`, [m.id]),
        db.query(`SELECT t.*, e.nev AS erdeklodo_nev, e.telefon AS erdeklodo_telefon, e.email AS erdeklodo_email, e.sorszam AS vevo_szam,
                         COALESCE(b.nev, b.felhasznalonev) AS bemutato_nev
                  FROM megbizas_megtekintesek t LEFT JOIN megbizas_erdeklodok e ON e.id = t.erdeklodo_id
                  LEFT JOIN users b ON b.id = COALESCE(t.bemutato_id, $2)
                  WHERE t.megbizas_id = $1 ORDER BY (t.statusz IN ('kert', 'egyeztetve')) DESC, t.idopont ASC NULLS FIRST, t.id DESC`, [m.id, m.bemutato_id]),
        db.query(`SELECT a.*, e.nev AS erdeklodo_nev, e.sorszam AS vevo_szam, COALESCE(a.finanszirozas, e.finanszirozas) AS finanszirozas, e.koltsegkeret,
                         EXISTS (SELECT 1 FROM megbizas_megtekintesek t WHERE t.erdeklodo_id = a.erdeklodo_id AND t.statusz = 'megtortent') AS megnezte
                  FROM megbizas_ajanlatok a LEFT JOIN megbizas_erdeklodok e ON e.id = a.erdeklodo_id WHERE a.megbizas_id = $1 ORDER BY a.created_at DESC`, [m.id]),
        db.query("SELECT n.*, COALESCE(u.nev, u.felhasznalonev) AS szerzo FROM megbizas_naplo n LEFT JOIN users u ON u.id = n.created_by WHERE n.megbizas_id = $1 ORDER BY n.created_at DESC, n.id DESC LIMIT 300", [m.id]),
        m.ingatlan_id ? db.query("SELECT id, cim, ar, nm, statusz, tipus, varos, ugylet, (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = ingatlanok.id)::int AS kep_db FROM ingatlanok WHERE id = $1", [m.ingatlan_id]) : Promise.resolve({ rows: [] }),
        // A hirdetésről a régi üzenetrendszerben érkezett üzenetek – felvehetők érdeklődőként
        m.ingatlan_id ? db.query(`
            SELECT DISTINCT ON (z.felado_id) z.felado_id, z.szoveg, z.created_at, COALESCE(u.nev, u.felhasznalonev) AS nev, u.email, u.telefon,
                   EXISTS (SELECT 1 FROM megbizas_erdeklodok e WHERE e.megbizas_id = $2 AND e.user_id = z.felado_id) AS felveve
            FROM uzenetek z LEFT JOIN users u ON u.id = z.felado_id
            WHERE z.ingatlan_id = $1 AND z.felado_id IS NOT NULL AND z.felado_id <> COALESCE($3, 0)
            ORDER BY z.felado_id, z.created_at DESC`, [m.ingatlan_id, m.id, m.user_id]).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),
        db.query(`SELECT z.id, z.erdeklodo_id, z.irany, z.szoveg, z.olvasva, z.created_at, COALESCE(u.nev, u.felhasznalonev) AS szerzo
                  FROM megbizas_uzenetek z LEFT JOIN users u ON u.id = z.user_id WHERE z.megbizas_id = $1 ORDER BY z.created_at, z.id`, [m.id]),
        kezel ? csapat.valaszthatok() : Promise.resolve([]),
        fajlLista(m.id),
        m.ingatlan_id ? db.query("SELECT COUNT(*)::int AS n FROM latogatasok WHERE ingatlan_id = $1", [m.ingatlan_id]).catch(() => ({ rows: [{ n: 0 }] })) : Promise.resolve({ rows: [{ n: 0 }] })
    ]);
    const iratok = m.iratok || {};
    const ellenjegyzo = m.ellenjegyezte ? await nev(m.ellenjegyezte) : null;
    return {
        ...m,
        fiok_email: fiok.rows[0] && fiok.rows[0].email, fiok_telefon: fiok.rows[0] && fiok.rows[0].telefon,
        erdeklodok: erd.rows, megtekintesek: megt.rows, ajanlatok: ajan.rows, naplo: naplo.rows,
        hirdetes: hird.rows[0] || null, regi_uzenetek: uz.rows, uzenetek: uzenetek.rows,
        iratok_lista: iratLista(m.tipus).map(x => {
            const f = fajlok.filter(y => y.tipus === "irat" && y.kod === x.kod);
            return { ...x, ...(iratok[x.kod] || {}), megvan: !!(iratok[x.kod] && iratok[x.kod].megvan), fajlok: f };
        }),
        fajlok,
        naptar: naptarAdat(m, be),
        feladatok_lista: elokeszitoFeladatok(m),
        kovetkezo: kovetkezo(m0),
        teendok: teendok(m0),
        mod: ajanlatMod(m, be),
        ajanlat_feltetel: be.ajanlat_feltetel,
        dij: await dijSzamol(m),
        munkatarsak: valaszthatok,
        ellenjegyzo,
        latogatas: lat.rows[0] ? lat.rows[0].n : 0,
        jog: { admin: kezel, kezel, rendszergazda: k.admin, megtekintes: await csapat.megbizasJog(req, m.id, "megtekintes") }
    };
}

// A sikerdíj: az eladási ár (vagy a kért ár) × jutalék %, legalább a minimum, + fix díj + a választott fizetős opciók
async function dijSzamol(m) {
    const be = await beallitas();
    const ar = Number(m.eladasi_ar) || Number(m.kert_ar) || 0;
    const jut = m.jutalek === null || m.jutalek === undefined ? be.jutalek : Number(m.jutalek);
    const siker = Math.max(be.minimum_dij || 0, Math.round(ar * jut) / 100);
    const opciok = (Array.isArray(m.opciok) ? m.opciok : []).map(k => be.opciok.find(o => o.kod === k)).filter(o => o && o.ar > 0);
    return {
        alap: ar, becsult: !m.eladasi_ar, jutalek: jut, siker: ar ? siker : null, penznem: m.penznem || be.penznem,
        fix: Number(m.fix_dij) || 0, minimum: be.minimum_dij || 0,
        opciok: opciok.map(o => ({ kod: o.kod, nev: o.nev, ar: o.ar, penznem: o.penznem }))
    };
}

// Mentés. jog: { admin } – a megbízás kezelője (teljes jog); a csak-olvasó nem ment
async function ment(id, b, userId, jog = { admin: true }) {
    const r = await db.query("SELECT * FROM megbizasok WHERE id = $1", [Number(id) || 0]);
    const m = r.rows[0];
    if (!m) throw hibaKod("not_found");

    const d = {};
    const szoveges = { ugylet: 10, tipus: 20, varos: 80, telepules: 120, cim: 300, leiras: 4000, nev: 160, email: 160, telefon: 40, elerhetoseg: 300, admin_jegyzet: 8000, kozjegyzo: 300 };
    for (const [k, max] of Object.entries(szoveges)) if (k in b) d[k] = sz(b[k], max);
    if ("ugylet" in d) d.ugylet = d.ugylet === "kiado" ? "kiado" : "elado";
    if ("tipus" in d && !TIPUSOK.includes(d.tipus)) d.tipus = m.tipus;
    for (const k of ["nm", "kert_ar", "foglalo"]) if (k in b) d[k] = szam(b[k]);
    if ("szobak" in b) d.szobak = szam(b.szobak) ? Math.round(szam(b.szobak)) : null;
    if ("opciok" in b && Array.isArray(b.opciok)) d.opciok = JSON.stringify([...new Set(b.opciok.map(String))].slice(0, 40));
    for (const k of ["fotozas_idopont", "kozjegyzo_idopont"]) if (k in b) d[k] = idopontOlvas(b[k]);
    for (const k of ["eloszerzodes_datum", "kulcsatadas"]) if (k in b) d[k] = datum(b[k]);

    if (jog.admin) {
        if ("eladasi_ar" in b) d.eladasi_ar = szam(b.eladasi_ar);
        if ("jutalek" in b) d.jutalek = szam(b.jutalek) === null ? null : Math.min(20, Math.max(0, szam(b.jutalek)));
        if ("fix_dij" in b) d.fix_dij = szam(b.fix_dij) === null ? null : Math.max(0, szam(b.fix_dij));
        if ("penznem" in b) d.penznem = b.penznem === "RON" ? "RON" : "EUR";
        if ("kizarolagos" in b) d.kizarolagos = !!b.kizarolagos;
        if ("idotartam_honap" in b) d.idotartam_honap = Math.min(36, Math.max(1, Math.round(szam(b.idotartam_honap) || 6)));
        for (const k of ["szerzodes_datum", "alairva", "eladva"]) if (k in b) d[k] = datum(b[k]);
        if ("ajanlat_mod" in b) d.ajanlat_mod = ["azonnal", "jovahagyas"].includes(b.ajanlat_mod) ? b.ajanlat_mod : null;
        if ("szerzodes_allapot" in b && SZERZODES_ALLAPOTOK.includes(b.szerzodes_allapot)) d.szerzodes_allapot = b.szerzodes_allapot;
        for (const k of ["felelos_id", "fotos_id", "bemutato_id"]) {
            if (!(k in b)) continue;
            const uid = Number(b[k]) || null;
            if (uid && !(await db.query("SELECT 1 FROM csapat_tagok WHERE user_id = $1", [uid])).rowCount) throw hibaKod("not_team_member");
            d[k] = uid;
        }
        if ("iratok" in b && b.iratok && typeof b.iratok === "object") {
            const ir = {};
            for (const x of IRATOK) {
                const v = b.iratok[x.kod];
                if (v) ir[x.kod] = { megvan: !!v.megvan, datum: datum(v.datum), megj: sz(v.megj, 300) };
            }
            d.iratok = JSON.stringify(ir);
        }
        if ("feladatok" in b && b.feladatok && typeof b.feladatok === "object") {
            const f = { ...(m.feladatok || {}) };
            for (const kod of ELOKESZITO) {
                if (!(kod in b.feladatok)) continue;
                const kesz = !!(b.feladatok[kod] && b.feladatok[kod].kesz);
                f[kod] = kesz ? { kesz: true, datum: (f[kod] && f[kod].kesz && f[kod].datum) || ma(), ki: (f[kod] && f[kod].kesz && f[kod].ki) || userId } : { kesz: false };
            }
            d.feladatok = JSON.stringify(f);
        }
    }

    if ("ingatlan_id" in b) {
        const iid = Number(b.ingatlan_id) || null;
        if (iid) {
            const x = await db.query("SELECT id, megbizas_id FROM ingatlanok WHERE id = $1", [iid]);
            if (!x.rowCount) throw hibaKod("listing_not_found");
            if (x.rows[0].megbizas_id && x.rows[0].megbizas_id !== m.id) throw hibaKod("listing_other_mandate");
        }
        d.ingatlan_id = iid;
    }

    // Aláírás dátuma (papíron) → a szerződés hatályos
    if (d.alairva && !m.alairva) {
        d.szerzodes_allapot = "alairva";
        if (!m.ellenjegyezve) { d.ellenjegyezve = new Date(); d.ellenjegyezte = userId; }
        if (!m.szerzodes_mod) d.szerzodes_mod = "szemelyes";
    }

    let ujStatusz = null;
    if ("statusz" in b && STATUSZOK.includes(b.statusz) && b.statusz !== m.statusz) {
        if (!jog.admin) throw hibaKod("admin_only");
        d.statusz = b.statusz;
        d.statusz_valtva = new Date();
        ujStatusz = b.statusz;
        if (b.statusz === "eladva" && !d.eladva && !m.eladva) d.eladva = ma();
        if (b.statusz === "egyeztetes" && !m.elso_kapcsolat) d.elso_kapcsolat = new Date();
        // Eladáskor: az elfogadott ajánlat összege az eladási ár (ha nincs megadva)
        if (b.statusz === "eladva" && !m.eladasi_ar && !d.eladasi_ar) {
            const el = await db.query("SELECT COALESCE(vegso_osszeg, osszeg) AS v FROM megbizas_ajanlatok WHERE megbizas_id = $1 AND statusz = 'elfogadva' ORDER BY updated_at DESC LIMIT 1", [m.id]);
            if (el.rowCount) d.eladasi_ar = Number(el.rows[0].v);
        }
    }

    const kulcsok = Object.keys(d);
    if (kulcsok.length) {
        const set = kulcsok.map((k, i) => `${k} = $${i + 2}${["opciok", "iratok", "feladatok"].includes(k) ? "::jsonb" : ""}`).join(", ");
        await db.query(`UPDATE megbizasok SET ${set}, updated_at = NOW() WHERE id = $1`, [m.id, ...kulcsok.map(k => d[k])]);
    }

    // A hirdetés jelölése (és a régi jelölés levétele)
    if ("ingatlan_id" in d && d.ingatlan_id !== m.ingatlan_id) {
        if (m.ingatlan_id) await db.query("UPDATE ingatlanok SET megbizas_id = NULL, statusz = CASE WHEN statusz = 'elonezet' THEN 'aktiv' ELSE statusz END WHERE id = $1 AND megbizas_id = $2", [m.ingatlan_id, m.id]);
        if (d.ingatlan_id) await db.query("UPDATE ingatlanok SET megbizas_id = $2 WHERE id = $1", [d.ingatlan_id, m.id]);
        await naploIr(m.id, "jegyzet", d.ingatlan_id ? `Hirdetés kapcsolva: #${d.ingatlan_id}` : "Hirdetés leválasztva", false, userId);
    }
    if (ujStatusz) await naploIr(m.id, "statusz", ujStatusz, true, userId);
    for (const k of ["felelos_id", "fotos_id", "bemutato_id"]) {
        if (k in d && d[k] !== m[k]) await naploIr(m.id, "jegyzet", `${{ felelos_id: "Felelős", fotos_id: "Fotós", bemutato_id: "Bemutató" }[k]}: ${d[k] ? await nev(d[k]) : "–"}`, false, userId);
    }
    if ("fotozas_idopont" in d && String(d.fotozas_idopont) !== String(m.fotozas_idopont) && d.fotozas_idopont) {
        await naploIr(m.id, "jegyzet", `Fotózás időpontja: ${d.fotozas_idopont.toLocaleString("hu-HU", { timeZone: TZ })}`, true, userId);
    }
    if ("kozjegyzo_idopont" in d && String(d.kozjegyzo_idopont) !== String(m.kozjegyzo_idopont) && d.kozjegyzo_idopont) {
        await naploIr(m.id, "jegyzet", `Közjegyzői időpont: ${d.kozjegyzo_idopont.toLocaleString("hu-HU", { timeZone: TZ })}${d.kozjegyzo || m.kozjegyzo ? ` – ${d.kozjegyzo || m.kozjegyzo}` : ""}`, true, userId);
    }
    if ("eloszerzodes_datum" in d && d.eloszerzodes_datum && d.eloszerzodes_datum !== pgDatum(m.eloszerzodes_datum)) {
        await naploIr(m.id, "jegyzet", `Előszerződés aláírva: ${d.eloszerzodes_datum}${d.foglalo || m.foglalo ? ` – foglaló ${d.foglalo || m.foglalo} ${m.penznem || "EUR"}` : ""}`, true, userId);
    }

    // A szakasz kézi váltása: a hirdetés láthatósága, adásvétel / eladás következményei
    let lezart = null;
    const most = { ...m, ...d, statusz: d.statusz || m.statusz };
    if (ujStatusz || ("ingatlan_id" in d && d.ingatlan_id !== m.ingatlan_id)) await hirdetesAllapot(most);
    if (ujStatusz === "adasvetel") lezart = await adasvetelKezd(most, await beallitas(), userId);
    if (ujStatusz === "eladva") lezart = await eladvaLezar(m.id, userId);

    // A kapuk: ha a mentés után teljesül a feltétel, továbblép
    const lepes = await elorelep(m.id, userId);

    return {
        id: m.id, ujStatusz: ujStatusz || lepes.lepesek[lepes.lepesek.length - 1] || null, lepesek: lepes.lepesek, elozo: m,
        lezart: lezart || lepes.lezart,
        hozzarendelve: ["felelos_id", "fotos_id", "bemutato_id"].filter(k => k in d && d[k] && d[k] !== m[k]).map(k => ({ szerep: k, user_id: d[k] }))
    };
}

async function nev(userId) {
    const r = await db.query("SELECT COALESCE(nev, felhasznalonev, email) AS n FROM users WHERE id = $1", [userId]);
    return r.rows[0] ? r.rows[0].n : "#" + userId;
}

// Új hirdetés a megbízáshoz (a hirdetés feladásakor): előnézet, amíg a megbízás nem tart a hirdetésnél
async function hirdetesKapcsolva(megbizasId, userId) {
    const m = (await db.query("SELECT * FROM megbizasok WHERE id = $1", [megbizasId])).rows[0];
    if (!m) return null;
    await hirdetesAllapot(m);
    const l = await elorelep(megbizasId, userId);
    return l.lepesek[l.lepesek.length - 1] || null;
}

// Eladáskor: a hirdetés „eladva”, a nyitott ajánlatok elutasítva, a jövőbeli megtekintések lemondva
async function eladvaLezar(megbizasId, userId) {
    const be = await beallitas();
    const m = (await db.query("SELECT * FROM megbizasok WHERE id = $1", [megbizasId])).rows[0];
    if (m && m.ingatlan_id) await db.query("UPDATE ingatlanok SET eladva = true, updated_at = NOW() WHERE id = $1", [m.ingatlan_id]).catch(() => { });
    if (!be.auto_eladaskor_lezar) return { ajanlatok: [], megtekintesek: [] };
    const aj = await db.query(`UPDATE megbizas_ajanlatok a SET statusz = 'elutasitva', vevo_valasz = COALESCE(vevo_valasz, 'az ingatlan elkelt'), updated_at = NOW()
                               FROM megbizas_erdeklodok e WHERE e.id = a.erdeklodo_id AND a.megbizas_id = $1 AND a.statusz IN ('uj', 'tovabbitva', 'ellenajanlat')
                               RETURNING a.id, e.nev, e.email`, [megbizasId]);
    const mt = await db.query(`UPDATE megbizas_megtekintesek t SET statusz = 'lemondva', updated_at = NOW()
                               FROM megbizas_erdeklodok e WHERE e.id = t.erdeklodo_id AND t.megbizas_id = $1 AND t.statusz IN ('kert', 'egyeztetve')
                                 AND (t.idopont IS NULL OR t.idopont > NOW())
                               RETURNING t.id, e.nev, e.email`, [megbizasId]);
    if (aj.rowCount || mt.rowCount) {
        await naploIr(megbizasId, "jegyzet", `Eladva: ${aj.rowCount} nyitott ajánlat elutasítva, ${mt.rowCount} megtekintés lemondva (a vevők értesítést kaptak).`, false, userId);
    }
    return { ajanlatok: aj.rows, megtekintesek: mt.rows };
}

// ===================== LÉPÉSEK EGY GOMBBAL (a következő lépés sávjából) =====================

// Ellenjegyzés: az eladó online aláírta → mi is aláírjuk → hatályos
async function ellenjegyez(megbizasId, userId) {
    const r = await db.query(`UPDATE megbizasok SET szerzodes_allapot = 'alairva', ellenjegyezve = NOW(), ellenjegyezte = $2,
                                  alairva = COALESCE(alairva, CURRENT_DATE), updated_at = NOW()
                              WHERE id = $1 AND szerzodes_allapot = 'elfogadva' RETURNING id`, [megbizasId, userId || null]);
    if (!r.rowCount) throw hibaKod("bad_state");
    await naploIr(megbizasId, "szerzodes", "A szerződést ellenjegyeztük – hatályos.", true, userId);
}

//  mit: elso_hivas | csomag_kuld | csomag_ok (az eladó telefonon jóváhagyta) | ellenjegyez |
//       hirdetes_kuld | hirdetes_ok (az eladó telefonon jóváhagyta) | kozjegyzo_kesz
async function lepes(megbizasId, mit, userId) {
    const m = (await db.query("SELECT * FROM megbizasok WHERE id = $1", [Number(megbizasId) || 0])).rows[0];
    if (!m) throw hibaKod("not_found");
    let ertesit = null;     // mit kell az eladónak megírni (a hívó küldi)
    if (mit === "elso_hivas") {
        if (m.statusz !== "uj") throw hibaKod("bad_state");
        await db.query("UPDATE megbizasok SET elso_kapcsolat = COALESCE(elso_kapcsolat, NOW()), updated_at = NOW() WHERE id = $1", [m.id]);
        await naploIr(m.id, "jegyzet", "Első hívás megvolt.", false, userId);
    } else if (mit === "csomag_kuld") {
        if (!["uj", "egyeztetes"].includes(m.statusz)) throw hibaKod("bad_state");
        await db.query("UPDATE megbizasok SET csomag_kuldve = NOW(), csomag_jovahagyva = NULL, elso_kapcsolat = COALESCE(elso_kapcsolat, NOW()), updated_at = NOW() WHERE id = $1", [m.id]);
        await naploIr(m.id, "jegyzet", "A végleges csomagot (szolgáltatások, díj, ár) elküldtük jóváhagyásra.", true, userId);
        ertesit = "csomag";
    } else if (mit === "csomag_ok") {
        if (!["uj", "egyeztetes"].includes(m.statusz)) throw hibaKod("bad_state");
        await db.query("UPDATE megbizasok SET csomag_kuldve = COALESCE(csomag_kuldve, NOW()), csomag_jovahagyva = NOW(), csomag_jovahagyta = 'csapat', elso_kapcsolat = COALESCE(elso_kapcsolat, NOW()), updated_at = NOW() WHERE id = $1", [m.id]);
        await naploIr(m.id, "jegyzet", "Az eladó (telefonon / személyesen) jóváhagyta a csomagot és az árat.", true, userId);
    } else if (mit === "ellenjegyez") {
        await ellenjegyez(m.id, userId);
    } else if (mit === "hirdetes_kuld") {
        if (m.statusz !== "fotozas" || !m.ingatlan_id) throw hibaKod("bad_state");
        await hirdetesAllapot(m);
        await db.query("UPDATE megbizasok SET hirdetes_kuldve = NOW(), hirdetes_jovahagyva = NULL, updated_at = NOW() WHERE id = $1", [m.id]);
        await naploIr(m.id, "jegyzet", "A hirdetés elkészült – elküldtük jóváhagyásra.", true, userId);
        ertesit = "hirdetes";
    } else if (mit === "hirdetes_ok") {
        if (m.statusz !== "fotozas" || !m.ingatlan_id) throw hibaKod("bad_state");
        await db.query("UPDATE megbizasok SET hirdetes_kuldve = COALESCE(hirdetes_kuldve, NOW()), hirdetes_jovahagyva = NOW(), updated_at = NOW() WHERE id = $1", [m.id]);
        await naploIr(m.id, "jegyzet", "Az eladó (telefonon / személyesen) jóváhagyta a hirdetést.", true, userId);
    } else if (mit === "kozjegyzo_kesz") {
        if (m.statusz !== "adasvetel") throw hibaKod("bad_state");
        const v = await ment(m.id, { statusz: "eladva" }, userId, { admin: true });
        return { megbizas: m, ertesit: "eladva", lepes: { lepesek: ["eladva"], lezart: v.lezart } };
    } else throw hibaKod("bad_request");
    return { megbizas: m, ertesit, lepes: await elorelep(m.id, userId) };
}

// Az előkészítés egy feladata kész / nincs kész (a fotós is jelölheti a magáét)
async function feladat(megbizasId, kod, kesz, userId) {
    if (!ELOKESZITO.includes(kod)) throw hibaKod("bad_request");
    const m = (await db.query("SELECT feladatok FROM megbizasok WHERE id = $1", [megbizasId])).rows[0];
    if (!m) throw hibaKod("not_found");
    const f = { ...(m.feladatok || {}) };
    f[kod] = kesz ? { kesz: true, datum: ma(), ki: userId || null } : { kesz: false };
    await db.query("UPDATE megbizasok SET feladatok = $2::jsonb, updated_at = NOW() WHERE id = $1", [megbizasId, JSON.stringify(f)]);
    await naploIr(megbizasId, "jegyzet", `Előkészítés – ${kod}: ${kesz ? "kész" : "nincs kész"}`, !!kesz, userId);
    return elorelep(megbizasId, userId);
}

// Fotók feltöltésekor a „fotó” feladat magától kész (ha kérték és még nincs jelölve)
async function fotokFeltoltve(ingatlanId, userId) {
    const r = await db.query("SELECT id, opciok, feladatok, statusz FROM megbizasok WHERE ingatlan_id = $1", [ingatlanId]);
    const m = r.rows[0];
    if (!m || m.statusz !== "fotozas") return null;
    if (!(Array.isArray(m.opciok) && m.opciok.includes("foto"))) return null;
    if (m.feladatok && m.feladatok.foto && "kesz" in m.feladatok.foto) return null;
    return feladat(m.id, "foto", true, userId);
}

async function naploHozzaad(id, b, userId) {
    const szoveg = sz(b.szoveg, 4000);
    if (!szoveg) throw hibaKod("missing_text");
    await naploIr(Number(id), "jegyzet", szoveg, !!b.lathato_eladonak, userId);
}

// Érdeklődő / megtekintés / ajánlat – szerkesztés az asztalról
async function erdeklodoMent(megbizasId, eid, b) {
    const d = {
        nev: sz(b.nev, 160), telefon: sz(b.telefon, 40), email: (sz(b.email, 160) || "").toLowerCase() || null,
        koltsegkeret: szam(b.koltsegkeret),
        finanszirozas: FINANSZIROZAS.includes(b.finanszirozas) ? b.finanszirozas : null,
        statusz: ERDEKLODO_STATUSZOK.includes(b.statusz) ? b.statusz : "uj",
        megjegyzes: sz(b.megjegyzes, 4000),
        user_id: Number(b.user_id) || null,
        ajanlat_engedve: !!b.ajanlat_engedve
    };
    if (!d.nev) throw hibaKod("missing_name");
    if (d.email && !EMAIL_RE.test(d.email)) throw hibaKod("bad_email");
    if (eid) {
        const r = await db.query(`UPDATE megbizas_erdeklodok SET nev=$1, telefon=$2, email=$3, koltsegkeret=$4, finanszirozas=$5, statusz=$6, megjegyzes=$7,
                                      ajanlat_engedve=$10, updated_at=NOW()
                                  WHERE id=$8 AND megbizas_id=$9 RETURNING id`,
            [d.nev, d.telefon, d.email, d.koltsegkeret, d.finanszirozas, d.statusz, d.megjegyzes, eid, megbizasId, d.ajanlat_engedve]);
        if (!r.rowCount) throw hibaKod("not_found");
        return eid;
    }
    const r = await db.query(`INSERT INTO megbizas_erdeklodok (megbizas_id, user_id, nev, telefon, email, koltsegkeret, finanszirozas, statusz, megjegyzes, forras, ajanlat_engedve, sorszam)
                              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,(SELECT COALESCE(MAX(sorszam), 0) + 1 FROM megbizas_erdeklodok WHERE megbizas_id = $1)) RETURNING id`,
        [megbizasId, d.user_id, d.nev, d.telefon, d.email, d.koltsegkeret, d.finanszirozas, d.statusz, d.megjegyzes, d.user_id ? "uzenet" : "kezi", d.ajanlat_engedve]);
    return r.rows[0].id;
}

async function megtekintesMent(megbizasId, tid, b) {
    const idopont = idopontOlvas(b.idopont);
    const d = {
        erdeklodo_id: Number(b.erdeklodo_id) || null,
        idopont,
        javasolt: sz(b.javasolt, 300),
        statusz: MEGTEKINTES_STATUSZOK.includes(b.statusz) ? b.statusz : (idopont ? "egyeztetve" : "kert"),
        visszajelzes: sz(b.visszajelzes, 2000),
        bemutato_id: Number(b.bemutato_id) || null
    };
    // Időpont megadva, de még „kért” → egyeztetve
    if (d.idopont && d.statusz === "kert") d.statusz = "egyeztetve";
    if (tid) {
        const r = await db.query(`UPDATE megbizas_megtekintesek SET erdeklodo_id=$1, idopont=$2, javasolt=$3, statusz=$4, visszajelzes=$5, bemutato_id=$6,
                                      emlekeztetve = CASE WHEN idopont IS DISTINCT FROM $2 THEN NULL ELSE emlekeztetve END,
                                      emlekeztetve2 = CASE WHEN idopont IS DISTINCT FROM $2 THEN NULL ELSE emlekeztetve2 END,
                                      visszajelzes_kerve = CASE WHEN idopont IS DISTINCT FROM $2 THEN NULL ELSE visszajelzes_kerve END,
                                      varolista = CASE WHEN $4 = 'kert' THEN varolista ELSE false END,
                                      updated_at=NOW()
                                  WHERE id=$7 AND megbizas_id=$8 RETURNING id`,
            [d.erdeklodo_id, d.idopont, d.javasolt, d.statusz, d.visszajelzes, d.bemutato_id, tid, megbizasId]);
        if (!r.rowCount) throw hibaKod("not_found");
        return tid;
    }
    const r = await db.query(`INSERT INTO megbizas_megtekintesek (megbizas_id, erdeklodo_id, idopont, javasolt, statusz, visszajelzes, bemutato_id, forras)
                              VALUES ($1,$2,$3,$4,$5,$6,$7,'kezi') RETURNING id`,
        [megbizasId, d.erdeklodo_id, d.idopont, d.javasolt, d.statusz, d.visszajelzes, d.bemutato_id]);
    if (d.erdeklodo_id) await db.query("UPDATE megbizas_erdeklodok SET statusz = 'megtekintes', updated_at = NOW() WHERE id = $1 AND statusz IN ('uj', 'kapcsolat')", [d.erdeklodo_id]);
    return r.rows[0].id;
}

// A bemutató: megtörtént / elmaradt (+ jegyzet). Visszaadja, kell-e a „hogy tetszett” levél.
async function megtekintesLezar(megbizasId, tid, b, userId) {
    const statusz = ["megtortent", "elmaradt"].includes(b.statusz) ? b.statusz : null;
    if (!statusz) throw hibaKod("bad_request");
    const r = await db.query(`UPDATE megbizas_megtekintesek SET statusz = $1, visszajelzes = COALESCE($2, visszajelzes), lezarta = $5, lezarva_at = NOW(), updated_at = NOW()
                              WHERE id = $3 AND megbizas_id = $4 RETURNING *`, [statusz, sz(b.visszajelzes, 2000), Number(tid) || 0, megbizasId, userId || null]);
    if (!r.rowCount) throw hibaKod("not_found");
    await naploIr(megbizasId, "megtekintes", `Megtekintés: ${statusz}${b.visszajelzes ? ` – „${String(b.visszajelzes).slice(0, 300)}”` : ""}`, statusz === "megtortent", userId);
    return r.rows[0];
}

// Áthelyezés egy másik (szabad) időpontra – az asztalról / naptárból
async function megtekintesAthelyez(megbizasId, tid, idopont, userId) {
    const t = idopontOlvas(idopont);
    if (!t) throw hibaKod("bad_time");
    const r = await db.query(`UPDATE megbizas_megtekintesek SET idopont = $1, statusz = 'egyeztetve', emlekeztetve = NULL, emlekeztetve2 = NULL,
                                  visszajelzes_kerve = NULL, varolista = false, updated_at = NOW()
                              WHERE id = $2 AND megbizas_id = $3 AND statusz IN ('kert', 'egyeztetve') RETURNING *`, [t, Number(tid) || 0, megbizasId]);
    if (!r.rowCount) throw hibaKod("not_found");
    await naploIr(megbizasId, "megtekintes", `Megtekintés áthelyezve: ${t.toLocaleString("hu-HU", { timeZone: TZ })}`, true, userId);
    return r.rows[0];
}

async function megtekintesLemond(megbizasId, tid, userId) {
    const r = await db.query(`UPDATE megbizas_megtekintesek SET statusz = 'lemondva', updated_at = NOW()
                              WHERE id = $1 AND megbizas_id = $2 AND statusz IN ('kert', 'egyeztetve') RETURNING *`, [Number(tid) || 0, megbizasId]);
    if (!r.rowCount) throw hibaKod("not_found");
    await naploIr(megbizasId, "megtekintes", "Megtekintés lemondva (a csapat).", r.rows[0].statusz === "egyeztetve", userId);
    return { megtekintes: r.rows[0], varolista: await varolistasok(megbizasId) };
}

async function ajanlatMent(megbizasId, aid, b) {
    const d = {
        erdeklodo_id: Number(b.erdeklodo_id) || null,
        osszeg: szam(b.osszeg),
        penznem: b.penznem === "RON" ? "RON" : "EUR",
        feltetelek: sz(b.feltetelek, 2000),
        statusz: AJANLAT_STATUSZOK.includes(b.statusz) ? b.statusz : "uj",
        ellenajanlat: szam(b.ellenajanlat),
        finanszirozas: FINANSZIROZAS.includes(b.finanszirozas) ? b.finanszirozas : null,
        foglalo: szam(b.foglalo),
        ervenyes_ig: idopontOlvas(b.ervenyes_ig)
    };
    if (!d.osszeg || d.osszeg <= 0) throw hibaKod("bad_amount");
    let id = aid;
    if (aid) {
        const r = await db.query(`UPDATE megbizas_ajanlatok SET erdeklodo_id=$1, osszeg=$2, penznem=$3, feltetelek=$4, statusz=$5, ellenajanlat=$6,
                                      finanszirozas=COALESCE($9, finanszirozas), foglalo=$10, ervenyes_ig=$11,
                                      tovabbitva_at = CASE WHEN $5 IN ('tovabbitva', 'ellenajanlat', 'elfogadva') THEN COALESCE(tovabbitva_at, NOW()) ELSE tovabbitva_at END,
                                      vegso_osszeg = CASE WHEN $5 = 'elfogadva' THEN COALESCE(vegso_osszeg, CASE WHEN ellenajanlat IS NOT NULL AND statusz = 'ellenajanlat' THEN ellenajanlat ELSE $2 END) ELSE vegso_osszeg END,
                                      updated_at=NOW()
                                  WHERE id=$7 AND megbizas_id=$8 RETURNING id`,
            [d.erdeklodo_id, d.osszeg, d.penznem, d.feltetelek, d.statusz, d.ellenajanlat, aid, megbizasId, d.finanszirozas, d.foglalo, d.ervenyes_ig]);
        if (!r.rowCount) throw hibaKod("not_found");
    } else {
        const r = await db.query(`INSERT INTO megbizas_ajanlatok (megbizas_id, erdeklodo_id, osszeg, penznem, feltetelek, statusz, ellenajanlat, ellen_vevonek, tovabbitva_at, vegso_osszeg,
                                         finanszirozas, foglalo, ervenyes_ig)
                                  VALUES ($1,$2,$3,$4,$5,$6,$7, false, CASE WHEN $6 IN ('tovabbitva', 'ellenajanlat', 'elfogadva') THEN NOW() END,
                                          CASE WHEN $6 = 'elfogadva' THEN $3::double precision END, $8, $9, $10) RETURNING id`,
            [megbizasId, d.erdeklodo_id, d.osszeg, d.penznem, d.feltetelek, d.statusz, d.ellenajanlat, d.finanszirozas, d.foglalo, d.ervenyes_ig]);
        id = r.rows[0].id;
        if (d.erdeklodo_id) await db.query("UPDATE megbizas_erdeklodok SET statusz = 'ajanlat', updated_at = NOW() WHERE id = $1 AND statusz IN ('uj', 'kapcsolat', 'megtekintes')", [d.erdeklodo_id]);
    }
    return id;
}

// Ajánlat-műveletek egy gombbal: tovabbit (az eladónak), elutasit, ellen_tovabbit (a vevőnek)
async function ajanlatMuvelet(megbizasId, aid, muvelet, userId) {
    const r = await db.query("SELECT * FROM megbizas_ajanlatok WHERE id = $1 AND megbizas_id = $2", [Number(aid) || 0, megbizasId]);
    const a = r.rows[0];
    if (!a) throw hibaKod("not_found");
    if (muvelet === "tovabbit") {
        if (a.statusz !== "uj") throw hibaKod("bad_state");
        await db.query("UPDATE megbizas_ajanlatok SET statusz = 'tovabbitva', tovabbitva_at = NOW(), updated_at = NOW() WHERE id = $1", [a.id]);
        await naploIr(megbizasId, "ajanlat", `Vételi ajánlat érkezett: ${a.osszeg} ${a.penznem}`, true, userId);
    } else if (muvelet === "elutasit") {
        if (!NYITOTT_AJANLAT.includes(a.statusz)) throw hibaKod("bad_state");
        await db.query("UPDATE megbizas_ajanlatok SET statusz = 'elutasitva', updated_at = NOW() WHERE id = $1", [a.id]);
        await naploIr(megbizasId, "ajanlat", `Ajánlat elutasítva: ${a.osszeg} ${a.penznem}`, !!a.tovabbitva_at, userId);
    } else if (muvelet === "ellen_tovabbit") {
        if (a.statusz !== "ellenajanlat" || a.ellen_vevonek) throw hibaKod("bad_state");
        await db.query("UPDATE megbizas_ajanlatok SET ellen_vevonek = true, updated_at = NOW() WHERE id = $1", [a.id]);
        await naploIr(megbizasId, "ajanlat", `Az eladó ellenajánlata (${a.ellenajanlat} ${a.penznem}) továbbítva a vevőnek`, false, userId);
    } else throw hibaKod("bad_request");
    const lepes = await elorelep(megbizasId, userId);
    return { ...a, lepes };
}

async function szerzodesKuld(megbizasId, userId) {
    const r = await db.query("SELECT * FROM megbizasok WHERE id = $1", [megbizasId]);
    const m = r.rows[0];
    if (!m) throw hibaKod("not_found");
    if (["alairva", "elfogadva"].includes(m.szerzodes_allapot)) throw hibaKod("bad_state");
    await db.query(`UPDATE megbizasok SET szerzodes_allapot = 'elkuldve', szerzodes_elkuldve = NOW(),
                        szerzodes_datum = COALESCE(szerzodes_datum, CURRENT_DATE),
                        elso_kapcsolat = COALESCE(elso_kapcsolat, NOW()), updated_at = NOW() WHERE id = $1`, [m.id]);
    await naploIr(m.id, "szerzodes", "A szerződést elküldtük aláírásra.", true, userId);
    const lepes = await elorelep(m.id, userId);
    return { ...m, lepes };
}

// Fájl feltöltése a csapattól (irat, aláírt szerződés szkennelve, egyéb)
async function csapatFajl(megbizasId, b, userId) {
    const m = (await db.query("SELECT * FROM megbizasok WHERE id = $1", [megbizasId])).rows[0];
    if (!m) throw hibaKod("not_found");
    const tipus = FAJL_TIPUSOK.includes(b.tipus) && b.tipus !== "hitel_igazolas" ? b.tipus : "irat";
    const kod = tipus === "irat" && iratLista(m.tipus).some(x => x.kod === b.kod) ? b.kod : null;
    const f = await fajlMent(m.id, { ...b, tipus, kod }, userId, { lathato: b.lathato_eladonak !== false });
    await naploIr(m.id, "jegyzet", `Fájl feltöltve: ${f.nev}`, b.lathato_eladonak !== false, userId);
    let lepes = { lepesek: [], lezart: null };
    // A személyesen aláírt szerződés szkennelt példánya: a szerződés hatályos
    if (tipus === "szerzodes_alairt" && m.szerzodes_allapot !== "alairva") {
        await db.query(`UPDATE megbizasok SET szerzodes_allapot = 'alairva', szerzodes_mod = COALESCE(szerzodes_mod, 'szemelyes'),
                            alairva = COALESCE(alairva, $2::date), ellenjegyezve = COALESCE(ellenjegyezve, NOW()), ellenjegyezte = COALESCE(ellenjegyezte, $3),
                            szerzodes_datum = COALESCE(szerzodes_datum, $2::date), updated_at = NOW() WHERE id = $1`,
            [m.id, datum(b.alairva) || ma(), userId]);
        await naploIr(m.id, "szerzodes", "A személyesen aláírt szerződés feltöltve – hatályos.", true, userId);
        lepes = await elorelep(m.id, userId);
    }
    return { fajl: f, lepes };
}

async function fajlTorol(megbizasId, fid) {
    await db.query("DELETE FROM megbizas_fajlok WHERE id = $1 AND megbizas_id = $2", [Number(fid) || 0, Number(megbizasId) || 0]);
}

async function naptarMent(megbizasId, b, userId) {
    const n = naptarTisztit({ ...ALAP_NAPTAR, ...(b || {}) });
    await db.query("UPDATE megbizasok SET naptar = $2::jsonb, updated_at = NOW() WHERE id = $1", [megbizasId, JSON.stringify(n)]);
    await naploIr(megbizasId, "jegyzet", `Megtekintési naptár: ${n.aktiv ? `${n.savok.length} idősáv, ${n.hossz} perc` : "kikapcsolva"}`, false, userId);
    return n;
}

async function torol(tabla, megbizasId, id) {
    const T = { erdeklodok: "megbizas_erdeklodok", megtekintesek: "megbizas_megtekintesek", ajanlatok: "megbizas_ajanlatok", naplo: "megbizas_naplo", uzenetek: "megbizas_uzenetek", fajlok: "megbizas_fajlok" }[tabla];
    if (!T) throw hibaKod("bad_request");
    await db.query(`DELETE FROM ${T} WHERE id = $1 AND megbizas_id = $2`, [Number(id) || 0, Number(megbizasId) || 0]);
}

// Az admin menüjének számlálója: a sürgős teendők száma (a hatókörben)
async function szamlalo(req) {
    try {
        let hol = "TRUE";
        const params = [];
        if (req) {
            const k = await csapat.kontextus(req);
            hol = csapat.hatokorSql(k, "megbizas_lat", params, { varos: "m.varos", tipus: "m.tipus", megbizas: "m.id", ingatlan: "m.ingatlan_id" });
        }
        const r = await db.query(`${LISTA_SQL} WHERE m.statusz IN ('uj', 'egyeztetes', 'szerzodes', 'fotozas', 'hirdetes', 'targyalas', 'adasvetel', 'eladva') AND ${hol}`, params);
        return r.rows.reduce((s, m) => s + teendok(m).filter(x => x.szint === "magas" && !["elado", "vevo"].includes(x.ki)).length, 0);
    } catch (e) {
        return 0;
    }
}

// Díjbekérő a sikerdíjról (és a fizetős opciókról) – a Pénzügyekbe kerül
async function dijbekeroKeszit(megbizasId, userId, b = {}) {
    const pu = require("./penzugy");
    const m = (await db.query("SELECT * FROM megbizasok WHERE id = $1", [Number(megbizasId) || 0])).rows[0];
    if (!m) throw hibaKod("not_found");
    const dij = await dijSzamol(m);
    const tetelek = [];
    if (b.siker !== false && dij.siker) {
        tetelek.push({ megnevezes: `Közvetítési sikerdíj / Comision intermediere – ${m.szerzodes_szam}${m.eladasi_ar ? ` (${m.eladasi_ar} ${dij.penznem} × ${dij.jutalek}%)` : ""}`, kategoria: "kozvetites", mennyiseg: 1, egysegar: dij.siker });
    }
    if (dij.fix) tetelek.push({ megnevezes: `Megbízási díj / Taxă mandat – ${m.szerzodes_szam}`, kategoria: "kozvetites", mennyiseg: 1, egysegar: dij.fix });
    if (b.opciok !== false) {
        dij.opciok.forEach(o => tetelek.push({ megnevezes: `${o.nev.hu} / ${o.nev.ro} – ${m.szerzodes_szam}`, kategoria: "kozvetites", mennyiseg: 1, egysegar: o.ar, penznem: o.penznem }));
    }
    if (!tetelek.length) throw hibaKod("missing_items");

    // Egy díjbekérőn egy pénznem: ami eltér, átváltjuk a beállított árfolyammal
    const be = await pu.beallitas();
    const penznem = dij.penznem;
    tetelek.forEach(t => {
        if (t.penznem && t.penznem !== penznem) {
            t.egysegar = penznem === "EUR" ? Math.round(t.egysegar / (be.eur_arfolyam || 5) * 100) / 100 : Math.round(t.egysegar * (be.eur_arfolyam || 5) * 100) / 100;
        }
        delete t.penznem;
    });

    // Ügyfél: az eladó (a fiókjához kötve)
    let ugyfelId = null;
    const u = await db.query("SELECT id FROM penzugy_ugyfelek WHERE user_id = $1 AND iroda_id IS NULL ORDER BY id LIMIT 1", [m.user_id || 0]);
    if (u.rowCount) ugyfelId = u.rows[0].id;
    else {
        ugyfelId = await pu.ugyfelMent(null, {
            tipus: "maganszemely", nev: m.nev || "Eladó", cim: [m.cim, m.telepules, m.varos].filter(Boolean).join(", ") || null,
            email: m.email, telefon: m.telefon, user_id: m.user_id, jegyzet: `Megbízás: ${m.szerzodes_szam}`
        });
    }
    const szamlaId = await pu.szamlaMent(null, {
        tipus: "dijbekero", ugyfel_id: ugyfelId, penznem, tetelek,
        megjegyzes: `Megbízás / Mandat: ${m.szerzodes_szam}`
    });
    await db.query("UPDATE megbizasok SET dijbekero_id = $2, updated_at = NOW() WHERE id = $1", [m.id, szamlaId]);
    await naploIr(m.id, "jegyzet", `Díjbekérő készült (#${szamlaId})`, false, userId);
    return szamlaId;
}

// ===================== MEGTEKINTÉSI NAPTÁR (asztal, bemutató) =====================

// A hatókörömbe tartozó megtekintések és szabad időpontok egy időszakra
//   q: { tol: ÉÉÉÉ-HH-NN, napok, megbizas_id, csak_enyem }
async function naptarNezet(req, q = {}) {
    const k = await csapat.kontextus(req);
    const be = await beallitas();
    const tol = datum(q.tol) || ma();
    const napok = Math.min(31, Math.max(1, Number(q.napok) || 7));
    const ig = napHozzaad(tol, napok);
    const eleje = helyiIdo(tol, "00:00");
    const vege = helyiIdo(ig, "00:00");
    const params = [];
    const hol = csapat.hatokorSql(k, "megtekintes", params, { varos: "m.varos", tipus: "m.tipus", megbizas: "m.id", ingatlan: "m.ingatlan_id" });
    params.push(req.user ? req.user.id : 0);
    const en = "$" + params.length;
    let felt = `(${hol} OR m.bemutato_id = ${en})`;
    if (q.megbizas_id) { params.push(Number(q.megbizas_id) || 0); felt += ` AND m.id = $${params.length}`; }
    if (q.csak_enyem === "1") felt += ` AND m.bemutato_id = ${en}`;

    const mb = await db.query(`
        SELECT m.id, m.szerzodes_szam, m.cim, m.telepules, m.varos, m.tipus, m.statusz, m.naptar, m.bemutato_id, m.ingatlan_id, m.nev AS elado_nev,
               COALESCE(b.nev, b.felhasznalonev) AS bemutato_nev
        FROM megbizasok m LEFT JOIN users b ON b.id = m.bemutato_id
        WHERE m.statusz IN ('hirdetes', 'targyalas', 'adasvetel', 'fotozas') AND ${felt}
        ORDER BY m.varos, m.cim`, params);
    const ids = mb.rows.map(m => m.id);
    const fogl = ids.length ? await db.query(`
        SELECT t.id, t.megbizas_id, t.idopont, t.statusz, t.javasolt, t.visszajelzes, t.varolista, t.forras, t.created_at,
               COALESCE(t.bemutato_id, m.bemutato_id) AS bemutato_id, COALESCE(b.nev, b.felhasznalonev) AS bemutato_nev,
               e.id AS erdeklodo_id, e.nev AS erdeklodo_nev, e.telefon AS erdeklodo_telefon, e.email AS erdeklodo_email, e.sorszam AS vevo_szam
        FROM megbizas_megtekintesek t JOIN megbizasok m ON m.id = t.megbizas_id
        LEFT JOIN megbizas_erdeklodok e ON e.id = t.erdeklodo_id
        LEFT JOIN users b ON b.id = COALESCE(t.bemutato_id, m.bemutato_id)
        WHERE t.megbizas_id = ANY($1::int[]) AND (
              (t.idopont >= $2 AND t.idopont < $3 AND t.statusz IN ('egyeztetve', 'megtortent', 'elmaradt'))
           OR (t.statusz = 'kert')
           OR (t.statusz = 'egyeztetve' AND t.idopont < NOW() - INTERVAL '1 hour'))
        ORDER BY t.idopont NULLS LAST`, [ids, eleje, vege]) : { rows: [] };

    const szabad = [];
    for (const m of mb.rows) {
        if (!VEVOI.includes(m.statusz)) continue;
        const n = naptarAdat(m, be);
        if (!n.aktiv) continue;
        (await szabadIdopontok(m, be, { tol, napok })).forEach(x => {
            if (x.szabad > 0) szabad.push({ megbizas_id: m.id, idopont: x.idopont, szabad: x.szabad, kapacitas: x.kapacitas });
        });
    }
    return {
        tol, napok,
        megbizasok: mb.rows.map(m => ({ ...m, naptar: naptarAdat(m, be) })),
        foglalasok: fogl.rows,
        szabad,
        jog: { kezel: csapat.vanJoga(k, "megtekintes"), admin: k.admin }
    };
}

async function megtekintesJog(req, tid) {
    const r = await db.query(`SELECT t.megbizas_id, COALESCE(t.bemutato_id, m.bemutato_id) AS bemutato FROM megbizas_megtekintesek t
                              JOIN megbizasok m ON m.id = t.megbizas_id WHERE t.id = $1`, [Number(tid) || 0]);
    const t = r.rows[0];
    if (!t) return null;
    const k = await csapat.kontextus(req);
    if (k.tag && req.user && t.bemutato === req.user.id) return t.megbizas_id;
    if (await csapat.megbizasJog(req, t.megbizas_id, "megtekintes")) return t.megbizas_id;
    return null;
}

module.exports = {
    STATUSZOK, SZAKASZOK, AKTIV, VEVOI, ERDEKLODO_STATUSZOK, MEGTEKINTES_STATUSZOK, AJANLAT_STATUSZOK, IRATOK, ELOKESZITO, TZ,
    beallitas, beallitasMent, ajanlat, ajanlatMod, iratLista, lejarat, naptarAdat, naptarTisztit, szabadIdopontok,
    letrehoz, sajatLista, sajatMegbizas, eladoValasz, sajatVisszavon, sajatUzenet, sajatOlvasott, szerzodesElfogad,
    szerzodesKod, szerzodesSzemelyes, sajatIrat, csomagJovahagy, hirdetesJovahagy, eladoOsszegzes,
    hirdetesMegbizas, vevoAllapot, vevoIdopontok, vevoFoglal, vevoVarolista, vevoAjanlatTesz, vevoEllenElfogad, vevoAjanlatVisszavon,
    vevoMegtekintesLemond, vevoUzenet, varolistasok,
    lista, reszlet, ment, naploHozzaad, naploIr, erdeklodoMent, megtekintesMent, megtekintesLezar, megtekintesAthelyez, megtekintesLemond,
    ajanlatMent, ajanlatMuvelet, szerzodesKuld, hirdetesKapcsolva, uzenetIr, olvasott, szal, torol, szamlalo, dijSzamol, dijbekeroKeszit,
    teendok, kovetkezo, elorelep, lepes, feladat, fotokFeltoltve, ellenjegyez, csapatFajl, fajlTorol, fajlLetolt, fajlLista, naptarMent, naptarNezet,
    megtekintesJog, eladvaLezar, sorBetolt,
    pgDatum, helyiIdo, helyiNap
};
