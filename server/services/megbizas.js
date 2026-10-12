// ============================================================
//  Eladjuk helyetted – megbízásos értékesítés
//
//  A tulajdonos az „Eladjuk helyetted” oldalon kiválasztja, mit kér,
//  megadja az ingatlan alapadatait és az elérhetőségét. Utána:
//    uj → egyeztetes → szerzodes → fotozas → hirdetes → targyalas
//       → eladva | lezarva | elutasitva
//
//  Egy megbízás „értékesítési asztala” (Admin → Megbízások, és a jogosult
//  munkatársaknak a Munkaterületen):
//    áttekintés + teendők, ingatlan és hirdetés, vevők (érdeklődők a
//    megtekintéseikkel és ajánlataikkal), megtekintések, ajánlatok,
//    üzenetek (az eladóval és a vevőkkel), szerződés és díj (iratok),
//    napló.
//
//  Ajánlatok: a vevő ajánlatot tesz → (jóváhagyás után, vagy ha az
//  „azonnal” mód be van kapcsolva, egyből) az eladó látja → elfogad /
//  elutasít / ellenajánlat → az ellenajánlat (ugyanígy jóváhagyással vagy
//  azonnal) a vevőhöz kerül → a vevő elfogadhatja vagy új ajánlatot tesz.
//  Az ajánlat-mód globálisan (Beállítások) és megbízásonként is állítható.
//
//  Automatizmusok (services/megbizasAuto.js): visszaigazolások, értesítések,
//  emlékeztető az eladónak (ha nem válaszol), megtekintés előtti emlékeztető,
//  megtekintés utáni „hogy tetszett / tegyél ajánlatot” levél, eladáskor a
//  többi ajánlat és megtekintés lezárása.
//
//  FONTOS: a szerződés csak tervezet – romániai ügyvéddel ellenőriztetendő.
// ============================================================

const db = require("../db/database");
const csapat = require("./csapat");

const STATUSZOK = ["uj", "egyeztetes", "szerzodes", "fotozas", "hirdetes", "targyalas", "eladva", "lezarva", "elutasitva"];
const AKTIV = ["uj", "egyeztetes", "szerzodes", "fotozas", "hirdetes", "targyalas"];
const ERDEKLODO_STATUSZOK = ["uj", "kapcsolat", "megtekintes", "ajanlat", "vevo", "elutasitva"];
const MEGTEKINTES_STATUSZOK = ["kert", "egyeztetve", "megtortent", "elmaradt", "lemondva"];
const AJANLAT_STATUSZOK = ["uj", "tovabbitva", "ellenajanlat", "elfogadva", "elutasitva", "visszavonva"];
const NYITOTT_AJANLAT = ["uj", "tovabbitva", "ellenajanlat"];
const SZERZODES_ALLAPOTOK = ["tervezet", "elkuldve", "elfogadva", "alairva"];
const TIPUSOK = ["lakas", "haz", "telek", "kereskedelmi", "iroda"];
const KULCS = "megbizas";

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

function ma() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
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

// A megbízás lejárata: aláírás (vagy online elfogadás) + időtartam
function lejarat(m) {
    const kezd = pgDatum(m.alairva) || (m.szerzodes_elfogadva ? pgDatum(new Date(m.szerzodes_elfogadva)) : null);
    if (!kezd) return null;
    const d = new Date(kezd + "T12:00:00");
    d.setMonth(d.getMonth() + (Number(m.idotartam_honap) || 6));
    return pgDatum(d);
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

function alapBeallitas() {
    return {
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
        // Ki tehet ajánlatot: kapcsolat_utan = aki már kért megtekintést / kérdezett; barki
        ajanlat_feltetel: "kapcsolat_utan",
        // Automatizmusok
        auto_visszaigazolas: true,      // a vevő és az eladó visszaigazoló levelet kap
        auto_elado_emlekezteto: 48,     // ennyi óra után emlékeztető az eladónak (0 = ki)
        auto_megtekintes_emlekezteto: true,  // egy nappal előtte mindenkinek
        auto_visszajelzes: true,        // megtekintés után: „hogy tetszett, tegyél ajánlatot”
        auto_eladaskor_lezar: true,     // eladáskor a többi ajánlat / megtekintés lezárása, értesítés
        opciok: ALAP_OPCIOK
    };
}

let cache = null;

async function beallitas() {
    if (cache && Date.now() - cache.ido < 60 * 1000) return cache.adat;
    let adat = alapBeallitas();
    try {
        const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = $1", [KULCS]);
        if (r.rows[0] && r.rows[0].ertek) adat = { ...adat, ...JSON.parse(r.rows[0].ertek) };
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
    if ("aktiv" in b) a.aktiv = !!b.aktiv;
    if ("jutalek" in b) a.jutalek = n(b.jutalek, 0, 20, 2);
    if ("jutalek_kizarolagos" in b) a.jutalek_kizarolagos = n(b.jutalek_kizarolagos, 0, 20, 1.5);
    if ("minimum_dij" in b) a.minimum_dij = n(b.minimum_dij, 0, 1000000, 0);
    if ("penznem" in b) a.penznem = b.penznem === "RON" ? "RON" : "EUR";
    if ("idotartam_honap" in b) a.idotartam_honap = Math.round(n(b.idotartam_honap, 1, 36, 6));
    ["terulet", "terulet_ro", "terulet_en"].forEach(k => { if (k in b) a[k] = sz(b[k], 200) || ""; });
    if ("szerzodes_megjegyzes" in b) a.szerzodes_megjegyzes = sz(b.szerzodes_megjegyzes, 4000) || "";
    if ("ajanlat_mod" in b) a.ajanlat_mod = b.ajanlat_mod === "azonnal" ? "azonnal" : "jovahagyas";
    if ("ajanlat_feltetel" in b) a.ajanlat_feltetel = b.ajanlat_feltetel === "barki" ? "barki" : "kapcsolat_utan";
    if ("auto_visszaigazolas" in b) a.auto_visszaigazolas = !!b.auto_visszaigazolas;
    if ("auto_elado_emlekezteto" in b) a.auto_elado_emlekezteto = Math.round(n(b.auto_elado_emlekezteto, 0, 720, 48));
    if ("auto_megtekintes_emlekezteto" in b) a.auto_megtekintes_emlekezteto = !!b.auto_megtekintes_emlekezteto;
    if ("auto_visszajelzes" in b) a.auto_visszajelzes = !!b.auto_visszajelzes;
    if ("auto_eladaskor_lezar" in b) a.auto_eladaskor_lezar = !!b.auto_eladaskor_lezar;
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
            WHERE t.aktiv AND t.szerep = 'ertekesito' AND j.jogok ? 'megbizas'
              AND (j.hatokor = 'mind' OR (j.hatokor = 'varos' AND j.varos = $1 AND (j.tipus IS NULL OR j.tipus = $2)))
              AND (j.lejar IS NULL OR j.lejar >= CURRENT_DATE)
            ORDER BY (j.hatokor = 'varos') DESC, t.id LIMIT 1`, [d.varos, d.tipus]);
        felelos = f.rows[0] ? f.rows[0].user_id : null;
    } catch (e) { /* nincs csapat */ }

    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const szamSz = await kovetkezoSzam(client);
        const r = await client.query(`
            INSERT INTO megbizasok (user_id, statusz, ugylet, tipus, varos, telepules, cim, nm, szobak, kert_ar, leiras, nev, email, telefon,
                   elerhetoseg, opciok, jutalek, penznem, kizarolagos, idotartam_honap, szerzodes_szam, felelos_id)
            VALUES ($1,'uj',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20,$21) RETURNING id`,
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

// ===================== AZ ELADÓ NÉZETE (Fiókom → Megbízásaim) =====================

async function sajatLista(user) {
    const r = await db.query(`
        SELECT m.*, i.cim AS hirdetes_cim, i.statusz AS hirdetes_statusz, i.ar AS hirdetes_ar,
               COALESCE(f.nev, f.felhasznalonev) AS felelos_nev, f.telefon AS felelos_telefon, f.email AS felelos_email
        FROM megbizasok m
        LEFT JOIN ingatlanok i ON i.id = m.ingatlan_id
        LEFT JOIN users f ON f.id = m.felelos_id
        WHERE m.user_id = $1 ORDER BY m.id DESC`, [user.id]);
    const ids = r.rows.map(m => m.id);
    if (!ids.length) return [];
    const [naplo, megt, ajan, erd, uz] = await Promise.all([
        db.query(`SELECT id, megbizas_id, tipus, szoveg, created_at FROM megbizas_naplo WHERE megbizas_id = ANY($1::int[]) AND lathato_eladonak ORDER BY created_at DESC, id DESC`, [ids]),
        db.query(`SELECT id, megbizas_id, idopont, statusz, visszajelzes FROM megbizas_megtekintesek WHERE megbizas_id = ANY($1::int[]) AND statusz IN ('egyeztetve', 'megtortent') ORDER BY idopont DESC NULLS LAST`, [ids]),
        db.query(`SELECT a.id, a.megbizas_id, a.osszeg, a.penznem, a.feltetelek, a.statusz, a.ellenajanlat, a.elado_valasz, a.vegso_osszeg,
                         a.created_at, a.updated_at, a.tovabbitva_at, e.finanszirozas
                  FROM megbizas_ajanlatok a LEFT JOIN megbizas_erdeklodok e ON e.id = a.erdeklodo_id
                  WHERE a.megbizas_id = ANY($1::int[]) AND a.tovabbitva_at IS NOT NULL ORDER BY a.created_at DESC`, [ids]),
        db.query(`SELECT megbizas_id, COUNT(*)::int AS n FROM megbizas_erdeklodok WHERE megbizas_id = ANY($1::int[]) GROUP BY 1`, [ids]),
        db.query(`SELECT z.id, z.megbizas_id, z.irany, z.szoveg, z.olvasva, z.created_at, COALESCE(u.nev, u.felhasznalonev) AS szerzo
                  FROM megbizas_uzenetek z LEFT JOIN users u ON u.id = z.user_id
                  WHERE z.megbizas_id = ANY($1::int[]) AND z.erdeklodo_id IS NULL ORDER BY z.created_at, z.id`, [ids])
    ]);
    const erdDb = Object.fromEntries(erd.rows.map(x => [x.megbizas_id, x.n]));
    return r.rows.map(m => {
        const iratok = m.iratok || {};
        return {
            id: m.id, statusz: m.statusz, ugylet: m.ugylet, tipus: m.tipus, varos: m.varos, telepules: m.telepules, cim: m.cim,
            nm: m.nm, szobak: m.szobak, kert_ar: m.kert_ar, penznem: m.penznem, kizarolagos: m.kizarolagos,
            idotartam_honap: m.idotartam_honap, szerzodes_szam: m.szerzodes_szam, created_at: m.created_at,
            ingatlan_id: m.ingatlan_id, hirdetes_cim: m.hirdetes_cim, hirdetes_statusz: m.hirdetes_statusz, hirdetes_ar: m.hirdetes_ar,
            szerzodes_allapot: m.szerzodes_allapot || "tervezet", szerzodes_elfogadva: m.szerzodes_elfogadva,
            szerzodes_datum: pgDatum(m.szerzodes_datum), alairva: pgDatum(m.alairva), eladva: pgDatum(m.eladva), lejar: lejarat(m),
            eladasi_ar: m.eladasi_ar,
            jutalek: m.jutalek === null ? null : Number(m.jutalek),
            felelos: m.felelos_id ? { nev: m.felelos_nev, telefon: m.felelos_telefon, email: m.felelos_email } : null,
            iratok: iratLista(m.tipus).map(x => ({ kod: x.kod, nev: x.nev, megvan: !!(iratok[x.kod] && iratok[x.kod].megvan) })),
            naplo: naplo.rows.filter(x => x.megbizas_id === m.id),
            megtekintesek: megt.rows.filter(x => x.megbizas_id === m.id),
            ajanlatok: ajan.rows.filter(x => x.megbizas_id === m.id),
            uzenetek: uz.rows.filter(x => x.megbizas_id === m.id),
            olvasatlan: uz.rows.filter(x => x.megbizas_id === m.id && x.irany === "ki" && !x.olvasva).length,
            erdeklodok: erdDb[m.id] || 0
        };
    });
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
    if (statusz === "elfogadva") {
        await db.query("UPDATE megbizas_erdeklodok SET statusz = 'vevo', updated_at = NOW() WHERE id = $1", [a.erdeklodo_id]);
        await db.query(`UPDATE megbizasok SET statusz = 'targyalas', updated_at = NOW() WHERE id = $1 AND statusz IN ('hirdetes', 'fotozas', 'szerzodes')`, [m.id]);
    }
    return { statusz, megbizas: m, ajanlat: a, ellen, ellenVevonek, uzenet, mod };
}

// Az eladó elfogadja a neki elküldött szerződést (online)
async function szerzodesElfogad(user, id, ip) {
    const m = await sajatMegbizas(user, id);
    if (!m) throw hibaKod("not_found");
    if (m.szerzodes_allapot !== "elkuldve") throw hibaKod("not_sent");
    await db.query(`UPDATE megbizasok SET szerzodes_allapot = 'elfogadva', szerzodes_elfogadva = NOW(), szerzodes_elfogadva_ip = $2,
                        szerzodes_datum = COALESCE(szerzodes_datum, CURRENT_DATE),
                        statusz = CASE WHEN statusz IN ('uj', 'egyeztetes') THEN 'szerzodes' ELSE statusz END, updated_at = NOW()
                    WHERE id = $1`, [m.id, sz(ip, 80)]);
    await naploIr(m.id, "szerzodes", "Az eladó online elfogadta a szerződést.", true, user.id);
    if (["uj", "egyeztetes"].includes(m.statusz)) await naploIr(m.id, "statusz", "szerzodes", true, user.id);
    return m;
}

// Visszavonás (amíg nincs szerződés)
async function sajatVisszavon(user, id) {
    const m = await sajatMegbizas(user, id);
    if (!m) throw hibaKod("not_found");
    if (!["uj", "egyeztetes"].includes(m.statusz)) throw hibaKod("not_cancellable");
    await db.query("UPDATE megbizasok SET statusz = 'lezarva', updated_at = NOW() WHERE id = $1", [m.id]);
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

async function hirdetesMegbizas(ingatlanId) {
    const r = await db.query(`
        SELECT m.* FROM megbizasok m
        JOIN ingatlanok i ON i.id = m.ingatlan_id AND i.megbizas_id = m.id
        WHERE m.ingatlan_id = $1 AND m.statusz IN ('hirdetes', 'targyalas', 'fotozas', 'szerzodes')`, [Number(ingatlanId) || 0]);
    return r.rows[0] || null;
}

// A vevőnek mutatott ajánlat-állapot (az ellenajánlatot csak ha már neki szól)
function vevoAjanlat(a) {
    const x = { id: a.id, osszeg: a.osszeg, penznem: a.penznem, feltetelek: a.feltetelek, created_at: a.created_at, vegso_osszeg: a.vegso_osszeg };
    if (a.statusz === "ellenajanlat") {
        if (a.ellen_vevonek) { x.statusz = "ellenajanlat"; x.ellenajanlat = a.ellenajanlat; x.elado_valasz = a.elado_valasz; }
        else x.statusz = "tovabbitva";
    } else {
        x.statusz = a.statusz;
    }
    return x;
}

// Mit lát a vevő: az ő korábbi kérései erre a hirdetésre
async function vevoAllapot(user, ingatlanId) {
    const m = await hirdetesMegbizas(ingatlanId);
    if (!m) return { aktiv: false };
    const be = await beallitas();
    const alap = { aktiv: true, ajanlat_feltetel: be.ajanlat_feltetel || "kapcsolat_utan", penznem: m.penznem || be.penznem };
    if (!user) return alap;
    if (m.user_id === user.id) return { ...alap, sajat: true };
    const e = await db.query("SELECT id, statusz FROM megbizas_erdeklodok WHERE megbizas_id = $1 AND user_id = $2 ORDER BY id LIMIT 1", [m.id, user.id]);
    if (!e.rowCount) return { ...alap, sajat: false, ajanlhat: alap.ajanlat_feltetel === "barki" };
    const eid = e.rows[0].id;
    const [mt, aj, uz] = await Promise.all([
        db.query("SELECT id, idopont, javasolt, statusz FROM megbizas_megtekintesek WHERE erdeklodo_id = $1 ORDER BY id DESC LIMIT 10", [eid]),
        db.query("SELECT * FROM megbizas_ajanlatok WHERE erdeklodo_id = $1 ORDER BY id DESC LIMIT 10", [eid]),
        szal(m.id, eid)
    ]);
    // Az olvasatlan (nekünk írt) üzenetek – megnyitáskor olvasottak
    await olvasott(m.id, eid, "ugyfel");
    return {
        ...alap, sajat: false, ajanlhat: true,
        erdeklodo: e.rows[0], megtekintesek: mt.rows, ajanlatok: aj.rows.map(vevoAjanlat),
        uzenetek: uz.map(z => ({ id: z.id, irany: z.irany, szoveg: z.szoveg, created_at: z.created_at }))
    };
}

async function vevoErdeklodo(m, user, b) {
    const nev = sz(b.nev, 160) || user.nev || null;
    const telefon = sz(b.telefon, 40) || user.telefon || null;
    const email = ((sz(b.email, 160) || user.email || "") + "").toLowerCase() || null;
    if (!nev) throw hibaKod("missing_name");
    if (!telefon && !email) throw hibaKod("missing_contact");
    if (email && !EMAIL_RE.test(email)) throw hibaKod("bad_email");
    const keret = szam(b.koltsegkeret);
    const fin = ["keszpenz", "hitel", "vegyes", "egyeb"].includes(b.finanszirozas) ? b.finanszirozas : null;
    const e = await db.query("SELECT * FROM megbizas_erdeklodok WHERE megbizas_id = $1 AND user_id = $2 ORDER BY id LIMIT 1", [m.id, user.id]);
    if (e.rowCount) {
        await db.query(`UPDATE megbizas_erdeklodok SET nev = $2, telefon = COALESCE($3, telefon), email = COALESCE($4, email),
                        koltsegkeret = COALESCE($5, koltsegkeret), finanszirozas = COALESCE($6, finanszirozas), updated_at = NOW() WHERE id = $1`,
            [e.rows[0].id, nev, telefon, email, keret, fin]);
        return { id: e.rows[0].id, uj: false, nev, email, telefon };
    }
    const r = await db.query(`
        INSERT INTO megbizas_erdeklodok (megbizas_id, user_id, nev, telefon, email, koltsegkeret, finanszirozas, statusz, forras)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'uj','hirdetes') RETURNING id`, [m.id, user.id, nev, telefon, email, keret, fin]);
    return { id: r.rows[0].id, uj: true, nev, email, telefon };
}

// tipus: megtekintes | ajanlat | kerdes
async function vevoKeres(user, ingatlanId, b) {
    if (!user) throw hibaKod("login_required");
    const m = await hirdetesMegbizas(ingatlanId);
    if (!m) throw hibaKod("not_found");
    if (m.user_id === user.id) throw hibaKod("own_listing");
    const be = await beallitas();

    const tipus = ["megtekintes", "ajanlat", "kerdes"].includes(b.tipus) ? b.tipus : "kerdes";

    // Ajánlatot (alapból) csak az tehet, aki már felvette velünk a kapcsolatot
    if (tipus === "ajanlat" && be.ajanlat_feltetel !== "barki") {
        const van = await db.query("SELECT 1 FROM megbizas_erdeklodok WHERE megbizas_id = $1 AND user_id = $2", [m.id, user.id]);
        if (!van.rowCount) throw hibaKod("contact_first");
    }

    // Visszaélés ellen: egy vevő legfeljebb 10 kérése naponta egy hirdetésre
    const napi = await db.query(`
        SELECT (SELECT COUNT(*) FROM megbizas_megtekintesek t JOIN megbizas_erdeklodok e ON e.id = t.erdeklodo_id
                WHERE e.user_id = $1 AND t.megbizas_id = $2 AND t.created_at > NOW() - INTERVAL '1 day')
             + (SELECT COUNT(*) FROM megbizas_ajanlatok a JOIN megbizas_erdeklodok e ON e.id = a.erdeklodo_id
                WHERE e.user_id = $1 AND a.megbizas_id = $2 AND a.created_at > NOW() - INTERVAL '1 day')
             + (SELECT COUNT(*) FROM megbizas_uzenetek z JOIN megbizas_erdeklodok e ON e.id = z.erdeklodo_id
                WHERE e.user_id = $1 AND z.megbizas_id = $2 AND z.irany = 'be' AND z.created_at > NOW() - INTERVAL '1 day') AS n`, [user.id, m.id]);
    if (Number(napi.rows[0].n) >= 15) throw hibaKod("too_many");

    const megjegyzes = sz(b.uzenet, 2000);
    let osszeg = null;
    if (tipus === "ajanlat") {
        osszeg = szam(b.osszeg);
        if (!osszeg || osszeg <= 0) throw hibaKod("bad_amount");
    }

    const erd = await vevoErdeklodo(m, user, b);
    const eid = erd.id;
    const mod = ajanlatMod(m, be);
    let ajanlatId = null;
    let tovabbitva = false;

    if (tipus === "megtekintes") {
        await db.query(`INSERT INTO megbizas_megtekintesek (megbizas_id, erdeklodo_id, javasolt, statusz, bemutato_id) VALUES ($1,$2,$3,'kert',$4)`,
            [m.id, eid, sz(b.javasolt, 300), m.bemutato_id || null]);
        await db.query("UPDATE megbizas_erdeklodok SET statusz = 'megtekintes', updated_at = NOW() WHERE id = $1 AND statusz IN ('uj', 'kapcsolat')", [eid]);
    } else if (tipus === "ajanlat") {
        // A vevő korábbi nyitott ajánlatai helyett ez az új
        await db.query(`UPDATE megbizas_ajanlatok SET statusz = 'visszavonva', updated_at = NOW() WHERE erdeklodo_id = $1 AND statusz IN ('uj', 'tovabbitva', 'ellenajanlat')`, [eid]);
        tovabbitva = mod === "azonnal";
        const penznem = b.penznem === "RON" ? "RON" : b.penznem === "EUR" ? "EUR" : (m.penznem || "EUR");
        const r = await db.query(`INSERT INTO megbizas_ajanlatok (megbizas_id, erdeklodo_id, osszeg, penznem, feltetelek, statusz, tovabbitva_at, ellen_vevonek)
                                  VALUES ($1,$2,$3,$4,$5,$6,$7,false) RETURNING id`,
            [m.id, eid, osszeg, penznem, sz(b.feltetelek, 1000), tovabbitva ? "tovabbitva" : "uj", tovabbitva ? new Date() : null]);
        ajanlatId = r.rows[0].id;
        await db.query("UPDATE megbizas_erdeklodok SET statusz = 'ajanlat', updated_at = NOW() WHERE id = $1 AND statusz IN ('uj', 'kapcsolat', 'megtekintes')", [eid]);
        if (tovabbitva) {
            await naploIr(m.id, "ajanlat", `Vételi ajánlat érkezett: ${osszeg} ${penznem}`, true, null);
            await db.query(`UPDATE megbizasok SET statusz = 'targyalas', updated_at = NOW() WHERE id = $1 AND statusz = 'hirdetes'`, [m.id]);
        }
    }

    // A szöveg (kérdés, megjegyzés) az üzenetek közé kerül – onnan válaszolunk
    if (megjegyzes) await uzenetIr(m.id, eid, "be", user.id, megjegyzes);

    await naploIr(m.id, tipus === "ajanlat" ? "ajanlat" : tipus === "megtekintes" ? "megtekintes" : "erdeklodo",
        `${erd.nev}: ${tipus === "ajanlat" ? `vételi ajánlat ${osszeg} ${b.penznem === "RON" ? "RON" : "EUR"}${tovabbitva ? " (automatikusan az eladónál)" : ""}` : tipus === "megtekintes" ? `megtekintést kér${b.javasolt ? ` (${sz(b.javasolt, 120)})` : ""}` : "kérdés"}`,
        false, user.id);

    return { megbizas: m, megbizas_id: m.id, erdeklodo_id: eid, erdeklodo: erd, tipus, ajanlat_id: ajanlatId, tovabbitva, osszeg };
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
    await db.query("UPDATE megbizas_erdeklodok SET statusz = 'vevo', updated_at = NOW() WHERE id = $1", [a.erdeklodo_id]);
    await db.query(`UPDATE megbizasok SET statusz = 'targyalas', updated_at = NOW() WHERE id = $1 AND statusz IN ('hirdetes', 'fotozas', 'szerzodes')`, [m.id]);
    await naploIr(m.id, "ajanlat", `A vevő elfogadta az ellenajánlatot: ${a.ellenajanlat} ${a.penznem}`, true, user.id);
    return { megbizas: m, ajanlat: a };
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

// A vevő lemondja a megtekintést
async function vevoMegtekintesLemond(user, ingatlanId, tid) {
    const m = await hirdetesMegbizas(ingatlanId);
    if (!m) throw hibaKod("not_found");
    const r = await db.query(`UPDATE megbizas_megtekintesek t SET statusz = 'lemondva', updated_at = NOW()
                              FROM megbizas_erdeklodok e WHERE e.id = t.erdeklodo_id AND t.id = $1 AND t.megbizas_id = $2 AND e.user_id = $3
                                AND t.statusz IN ('kert', 'egyeztetve') RETURNING t.*`, [Number(tid) || 0, m.id, user.id]);
    if (!r.rowCount) throw hibaKod("not_found");
    await naploIr(m.id, "megtekintes", "A vevő lemondta a megtekintést.", r.rows[0].statusz === "egyeztetve", user.id);
    return { megbizas: m, megtekintes: r.rows[0] };
}

// A vevő üzenete (kérdés) – ha még nem érdeklődő, azzá válik
async function vevoUzenet(user, ingatlanId, b) {
    const m = await hirdetesMegbizas(ingatlanId);
    if (!m) throw hibaKod("not_found");
    if (m.user_id === user.id) throw hibaKod("own_listing");
    const erd = await vevoErdeklodo(m, user, b || {});
    await uzenetIr(m.id, erd.id, "be", user.id, b && b.szoveg);
    return { megbizas: m, erdeklodo: erd };
}

// ===================== AZ ÉRTÉKESÍTÉSI ASZTAL (admin / munkatárs) =====================

// A lista mezői + számlálók a teendőkhöz
const LISTA_SQL = `
    SELECT m.*, COALESCE(u.nev, u.felhasznalonev, u.email) AS fiok_nev,
           i.cim AS hirdetes_cim, i.statusz AS hirdetes_statusz,
           COALESCE(fe.nev, fe.felhasznalonev) AS felelos_nev,
           COALESCE(fo.nev, fo.felhasznalonev) AS fotos_nev,
           COALESCE(bm.nev, bm.felhasznalonev) AS bemutato_nev,
           (SELECT COUNT(*) FROM megbizas_erdeklodok e WHERE e.megbizas_id = m.id)::int AS erdeklodok,
           (SELECT COUNT(*) FROM megbizas_megtekintesek t WHERE t.megbizas_id = m.id AND t.statusz = 'kert')::int AS megtekintes_kert,
           (SELECT COUNT(*) FROM megbizas_megtekintesek t WHERE t.megbizas_id = m.id AND t.statusz = 'egyeztetve' AND t.idopont < NOW() - INTERVAL '2 hours')::int AS megtekintes_lezarando,
           (SELECT MIN(t.idopont) FROM megbizas_megtekintesek t WHERE t.megbizas_id = m.id AND t.statusz = 'egyeztetve' AND t.idopont >= NOW() - INTERVAL '2 hours') AS kovetkezo_megtekintes,
           (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz = 'uj')::int AS ajanlat_uj,
           (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz = 'ellenajanlat' AND NOT COALESCE(a.ellen_vevonek, false))::int AS ellen_tovabbitando,
           (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz = 'tovabbitva' AND a.tovabbitva_at < NOW() - INTERVAL '48 hours')::int AS elado_var,
           (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz = 'elfogadva')::int AS ajanlat_elfogadva,
           (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz IN ('uj', 'tovabbitva', 'ellenajanlat'))::int AS ajanlat_nyitott,
           (SELECT MAX(COALESCE(a.vegso_osszeg, a.osszeg)) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz NOT IN ('visszavonva', 'elutasitva')) AS legjobb_ajanlat,
           (SELECT COUNT(*) FROM megbizas_uzenetek z WHERE z.megbizas_id = m.id AND z.irany = 'be' AND NOT z.olvasva)::int AS olvasatlan,
           (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = m.ingatlan_id)::int AS kep_db
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
        szerzodes_allapot: m.szerzodes_allapot || "tervezet",
        jutalek: m.jutalek === null ? null : Number(m.jutalek), fix_dij: m.fix_dij === null ? null : Number(m.fix_dij),
        legjobb_ajanlat: m.legjobb_ajanlat === null ? null : Number(m.legjobb_ajanlat)
    };
}

// Teendők egy megbízáshoz (a lista sorából): { kod, szint: magas|kozepes|info, ful, n?, datum? }
function teendok(m) {
    const t = [];
    const add = (kod, szint, ful, extra = {}) => t.push({ kod, szint, ful, megbizas_id: m.id, ...extra });
    if (!AKTIV.includes(m.statusz)) {
        if (m.statusz === "eladva" && !m.dijbekero_id) add("dijbekero", "magas", "szerzodes");
        return t;
    }
    const kor = (Date.now() - new Date(m.created_at).getTime()) / 3600000;
    if (m.statusz === "uj") add("uj_megbizas", kor > 24 ? "magas" : "kozepes", "attekintes", { ora: Math.floor(kor) });
    if (m.olvasatlan) add("olvasatlan", "magas", "uzenetek", { n: m.olvasatlan });
    if (m.ajanlat_uj) add("ajanlat_jovahagy", "magas", "ajanlatok", { n: m.ajanlat_uj });
    if (m.ellen_tovabbitando) add("ellen_tovabbit", "magas", "ajanlatok", { n: m.ellen_tovabbitando });
    if (m.ajanlat_elfogadva) add("elfogadott_ajanlat", "magas", "ajanlatok", { n: m.ajanlat_elfogadva });
    if (m.megtekintes_kert) add("megtekintes_idopont", "magas", "megtekintesek", { n: m.megtekintes_kert });
    if (m.megtekintes_lezarando) add("megtekintes_lezar", "kozepes", "megtekintesek", { n: m.megtekintes_lezarando });
    if (m.elado_var) add("elado_valasz", "kozepes", "ajanlatok", { n: m.elado_var });
    const sza = m.szerzodes_allapot || "tervezet";
    if (m.statusz === "egyeztetes" && sza === "tervezet") add("szerzodes_kuld", "kozepes", "szerzodes");
    if (sza === "elkuldve" && m.szerzodes_elkuldve && Date.now() - new Date(m.szerzodes_elkuldve).getTime() > 3 * 86400000) add("szerzodes_var", "info", "szerzodes");
    if (sza === "elfogadva" && !m.alairva) add("alairas", "info", "szerzodes");
    const kintVan = ["fotozas", "hirdetes", "targyalas"].includes(m.statusz);
    if (kintVan && !m.ingatlan_id) add("hirdetes_hianyzik", "kozepes", "ingatlan");
    if (kintVan && m.ingatlan_id && !m.kep_db) add("fotok_hianyoznak", "kozepes", "ingatlan");
    if (["szerzodes", "fotozas", "hirdetes", "targyalas"].includes(m.statusz)) {
        const ir = m.iratok || {};
        const hiany = iratLista(m.tipus).filter(x => !(ir[x.kod] && ir[x.kod].megvan)).length;
        if (hiany) add("iratok", "info", "szerzodes", { n: hiany });
    }
    const lej = lejarat(m);
    if (lej) {
        const nap = Math.round((new Date(lej + "T12:00:00") - new Date(ma() + "T12:00:00")) / 86400000);
        if (nap < 0) add("lejart", "magas", "szerzodes", { datum: lej });
        else if (nap <= 14) add("lejar", "kozepes", "szerzodes", { datum: lej, nap });
    }
    return t;
}

const SZINT_SORREND = { magas: 0, kozepes: 1, info: 2 };

// A megbízások listája – az admin mindet, a munkatárs a hatókörét látja
async function lista(req) {
    const k = await csapat.kontextus(req);
    const params = [];
    const hol = csapat.hatokorSql(k, "megbizas_lat", params, { varos: "m.varos", tipus: "m.tipus", megbizas: "m.id", ingatlan: "m.ingatlan_id" });
    const r = await db.query(`${LISTA_SQL} WHERE ${hol}
        ORDER BY CASE m.statusz WHEN 'uj' THEN 0 WHEN 'egyeztetes' THEN 1 WHEN 'targyalas' THEN 2 WHEN 'hirdetes' THEN 3
                 WHEN 'fotozas' THEN 4 WHEN 'szerzodes' THEN 5 ELSE 9 END, m.updated_at DESC`, params);
    const sorok = r.rows.map(listaSor);
    const tennivalo = sorok.flatMap(m => teendok(m).map(x => ({ ...x, szam: m.szerzodes_szam, nev: m.nev || m.fiok_nev, varos: m.varos, tipus: m.tipus })))
        .sort((a, b) => SZINT_SORREND[a.szint] - SZINT_SORREND[b.szint]);
    sorok.forEach(m => { m.teendo_db = tennivalo.filter(x => x.megbizas_id === m.id && x.szint !== "info").length; });

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
        beallitas: await beallitas(),
        jog: { admin: k.admin, kezel: csapat.vanJoga(k, "megbizas") }
    };
}

async function reszlet(req, id) {
    const k = await csapat.kontextus(req);
    const mid = Number(id) || 0;
    if (!(await csapat.megbizasJog(req, mid, "megbizas_lat"))) return null;
    const r = await db.query(`${LISTA_SQL} WHERE m.id = $1`, [mid]);
    const m0 = r.rows[0];
    if (!m0) return null;
    const m = listaSor(m0);
    const fiok = await db.query("SELECT email, telefon FROM users WHERE id = $1", [m.user_id || 0]);
    const [erd, megt, ajan, naplo, hird, uz, uzenetek, valaszthatok] = await Promise.all([
        db.query("SELECT * FROM megbizas_erdeklodok WHERE megbizas_id = $1 ORDER BY id DESC", [m.id]),
        db.query(`SELECT t.*, e.nev AS erdeklodo_nev, e.telefon AS erdeklodo_telefon, e.email AS erdeklodo_email,
                         COALESCE(b.nev, b.felhasznalonev) AS bemutato_nev
                  FROM megbizas_megtekintesek t LEFT JOIN megbizas_erdeklodok e ON e.id = t.erdeklodo_id
                  LEFT JOIN users b ON b.id = COALESCE(t.bemutato_id, $2)
                  WHERE t.megbizas_id = $1 ORDER BY (t.statusz IN ('kert', 'egyeztetve')) DESC, t.idopont ASC NULLS FIRST, t.id DESC`, [m.id, m.bemutato_id]),
        db.query("SELECT a.*, e.nev AS erdeklodo_nev, e.finanszirozas, e.koltsegkeret FROM megbizas_ajanlatok a LEFT JOIN megbizas_erdeklodok e ON e.id = a.erdeklodo_id WHERE a.megbizas_id = $1 ORDER BY a.created_at DESC", [m.id]),
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
        k.admin ? csapat.valaszthatok() : Promise.resolve([])
    ]);
    const iratok = m.iratok || {};
    return {
        ...m,
        fiok_email: fiok.rows[0] && fiok.rows[0].email, fiok_telefon: fiok.rows[0] && fiok.rows[0].telefon,
        erdeklodok: erd.rows, megtekintesek: megt.rows, ajanlatok: ajan.rows, naplo: naplo.rows,
        hirdetes: hird.rows[0] || null, regi_uzenetek: uz.rows, uzenetek: uzenetek.rows,
        iratok_lista: iratLista(m.tipus).map(x => ({ ...x, ...(iratok[x.kod] || {}), megvan: !!(iratok[x.kod] && iratok[x.kod].megvan) })),
        teendok: teendok(m0),
        mod: ajanlatMod(m, await beallitas()),
        dij: await dijSzamol(m),
        munkatarsak: valaszthatok,
        jog: { admin: k.admin, kezel: await csapat.megbizasJog(req, m.id, "megbizas") }
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

// Mentés. jog: { admin } – a munkatárs a díjat, szerződést, hozzárendelést nem módosíthatja
async function ment(id, b, userId, jog = { admin: true }) {
    const r = await db.query("SELECT * FROM megbizasok WHERE id = $1", [Number(id) || 0]);
    const m = r.rows[0];
    if (!m) throw hibaKod("not_found");

    const d = {};
    const szoveges = { ugylet: 10, tipus: 20, varos: 80, telepules: 120, cim: 300, leiras: 4000, nev: 160, email: 160, telefon: 40, elerhetoseg: 300, admin_jegyzet: 8000 };
    for (const [k, max] of Object.entries(szoveges)) if (k in b) d[k] = sz(b[k], max);
    if ("ugylet" in d) d.ugylet = d.ugylet === "kiado" ? "kiado" : "elado";
    if ("tipus" in d && !TIPUSOK.includes(d.tipus)) d.tipus = m.tipus;
    for (const k of ["nm", "kert_ar"]) if (k in b) d[k] = szam(b[k]);
    if ("szobak" in b) d.szobak = szam(b.szobak) ? Math.round(szam(b.szobak)) : null;
    if ("opciok" in b && Array.isArray(b.opciok)) d.opciok = JSON.stringify([...new Set(b.opciok.map(String))].slice(0, 40));

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

    // Aláírás dátuma → a szerződés aláírva
    if (d.alairva && !m.alairva) {
        d.szerzodes_allapot = "alairva";
        if (["uj", "egyeztetes"].includes(m.statusz) && !("statusz" in b)) b.statusz = "szerzodes";
    }

    let ujStatusz = null;
    if ("statusz" in b && STATUSZOK.includes(b.statusz) && b.statusz !== m.statusz) {
        d.statusz = b.statusz;
        ujStatusz = b.statusz;
        if (b.statusz === "eladva" && !d.eladva && !m.eladva) d.eladva = ma();
        if (b.statusz === "szerzodes" && !m.alairva && !d.alairva && m.szerzodes_allapot !== "elfogadva") d.alairva = ma();
        if (d.alairva && !m.alairva) d.szerzodes_allapot = "alairva";
        if (b.statusz === "egyeztetes" && !m.elso_kapcsolat) d.elso_kapcsolat = new Date();
        // Eladáskor: az elfogadott ajánlat összege az eladási ár (ha nincs megadva)
        if (b.statusz === "eladva" && !m.eladasi_ar && !d.eladasi_ar) {
            const el = await db.query("SELECT COALESCE(vegso_osszeg, osszeg) AS v FROM megbizas_ajanlatok WHERE megbizas_id = $1 AND statusz = 'elfogadva' ORDER BY updated_at DESC LIMIT 1", [m.id]);
            if (el.rowCount) d.eladasi_ar = Number(el.rows[0].v);
        }
    }
    if (ujStatusz && !jog.admin && ["eladva", "lezarva", "elutasitva"].includes(ujStatusz)) throw hibaKod("admin_only");

    const kulcsok = Object.keys(d);
    if (kulcsok.length) {
        const set = kulcsok.map((k, i) => `${k} = $${i + 2}${k === "opciok" || k === "iratok" ? "::jsonb" : ""}`).join(", ");
        await db.query(`UPDATE megbizasok SET ${set}, updated_at = NOW() WHERE id = $1`, [m.id, ...kulcsok.map(k => d[k])]);
    }

    // A hirdetés jelölése (és a régi jelölés levétele)
    if ("ingatlan_id" in d && d.ingatlan_id !== m.ingatlan_id) {
        if (m.ingatlan_id) await db.query("UPDATE ingatlanok SET megbizas_id = NULL WHERE id = $1 AND megbizas_id = $2", [m.ingatlan_id, m.id]);
        if (d.ingatlan_id) await db.query("UPDATE ingatlanok SET megbizas_id = $2 WHERE id = $1", [d.ingatlan_id, m.id]);
        await naploIr(m.id, "jegyzet", d.ingatlan_id ? `Hirdetés kapcsolva: #${d.ingatlan_id}` : "Hirdetés leválasztva", false, userId);
        if (d.ingatlan_id && !ujStatusz) ujStatusz = await hirdetesKapcsolva(m.id, userId);
    }
    if (ujStatusz && d.statusz === ujStatusz) await naploIr(m.id, "statusz", ujStatusz, true, userId);
    for (const k of ["felelos_id", "fotos_id", "bemutato_id"]) {
        if (k in d && d[k] !== m[k]) await naploIr(m.id, "jegyzet", `${{ felelos_id: "Felelős", fotos_id: "Fotós", bemutato_id: "Bemutató" }[k]}: ${d[k] ? await nev(d[k]) : "–"}`, false, userId);
    }

    // Eladva: a hirdetés „eladva”, a többi ajánlat és megtekintés lezárása
    let lezart = null;
    if (ujStatusz === "eladva") lezart = await eladvaLezar(m.id, userId);

    return { id: m.id, ujStatusz, elozo: m, lezart, hozzarendelve: ["felelos_id", "fotos_id", "bemutato_id"].filter(k => k in d && d[k] && d[k] !== m[k]).map(k => ({ szerep: k, user_id: d[k] })) };
}

async function nev(userId) {
    const r = await db.query("SELECT COALESCE(nev, felhasznalonev, email) AS n FROM users WHERE id = $1", [userId]);
    return r.rows[0] ? r.rows[0].n : "#" + userId;
}

// A hirdetés elkészült / kapcsolva: ha a szerződés már megvan, a megbízás „hirdetés kint van”
async function hirdetesKapcsolva(megbizasId, userId) {
    const r = await db.query(`UPDATE megbizasok SET statusz = 'hirdetes', updated_at = NOW()
                              WHERE id = $1 AND statusz IN ('szerzodes', 'fotozas') RETURNING id`, [megbizasId]);
    if (r.rowCount) {
        await naploIr(megbizasId, "statusz", "hirdetes", true, userId);
        return "hirdetes";
    }
    return null;
}

// Eladáskor: a nyitott ajánlatok elutasítva, a jövőbeli megtekintések lemondva (értesítés: a hívó)
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
        finanszirozas: ["keszpenz", "hitel", "vegyes", "egyeb"].includes(b.finanszirozas) ? b.finanszirozas : null,
        statusz: ERDEKLODO_STATUSZOK.includes(b.statusz) ? b.statusz : "uj",
        megjegyzes: sz(b.megjegyzes, 4000),
        user_id: Number(b.user_id) || null
    };
    if (!d.nev) throw hibaKod("missing_name");
    if (d.email && !EMAIL_RE.test(d.email)) throw hibaKod("bad_email");
    if (eid) {
        const r = await db.query(`UPDATE megbizas_erdeklodok SET nev=$1, telefon=$2, email=$3, koltsegkeret=$4, finanszirozas=$5, statusz=$6, megjegyzes=$7, updated_at=NOW()
                                  WHERE id=$8 AND megbizas_id=$9 RETURNING id`,
            [d.nev, d.telefon, d.email, d.koltsegkeret, d.finanszirozas, d.statusz, d.megjegyzes, eid, megbizasId]);
        if (!r.rowCount) throw hibaKod("not_found");
        return eid;
    }
    const r = await db.query(`INSERT INTO megbizas_erdeklodok (megbizas_id, user_id, nev, telefon, email, koltsegkeret, finanszirozas, statusz, megjegyzes, forras)
                              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [megbizasId, d.user_id, d.nev, d.telefon, d.email, d.koltsegkeret, d.finanszirozas, d.statusz, d.megjegyzes, d.user_id ? "uzenet" : "kezi"]);
    return r.rows[0].id;
}

async function megtekintesMent(megbizasId, tid, b) {
    let idopont = null;
    if (b.idopont) {
        const t = new Date(b.idopont);
        if (!isNaN(t)) idopont = t;
    }
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
                                      visszajelzes_kerve = CASE WHEN idopont IS DISTINCT FROM $2 THEN NULL ELSE visszajelzes_kerve END,
                                      updated_at=NOW()
                                  WHERE id=$7 AND megbizas_id=$8 RETURNING id`,
            [d.erdeklodo_id, d.idopont, d.javasolt, d.statusz, d.visszajelzes, d.bemutato_id, tid, megbizasId]);
        if (!r.rowCount) throw hibaKod("not_found");
        return tid;
    }
    const r = await db.query(`INSERT INTO megbizas_megtekintesek (megbizas_id, erdeklodo_id, idopont, javasolt, statusz, visszajelzes, bemutato_id)
                              VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [megbizasId, d.erdeklodo_id, d.idopont, d.javasolt, d.statusz, d.visszajelzes, d.bemutato_id]);
    if (d.erdeklodo_id) await db.query("UPDATE megbizas_erdeklodok SET statusz = 'megtekintes', updated_at = NOW() WHERE id = $1 AND statusz IN ('uj', 'kapcsolat')", [d.erdeklodo_id]);
    return r.rows[0].id;
}

// A bemutató (munkatárs) csak az állapotot és a visszajelzést írhatja
async function megtekintesLezar(megbizasId, tid, b) {
    const statusz = ["megtortent", "elmaradt"].includes(b.statusz) ? b.statusz : null;
    if (!statusz) throw hibaKod("bad_request");
    const r = await db.query(`UPDATE megbizas_megtekintesek SET statusz = $1, visszajelzes = COALESCE($2, visszajelzes), updated_at = NOW()
                              WHERE id = $3 AND megbizas_id = $4 RETURNING id`, [statusz, sz(b.visszajelzes, 2000), Number(tid) || 0, megbizasId]);
    if (!r.rowCount) throw hibaKod("not_found");
    return r.rows[0].id;
}

async function ajanlatMent(megbizasId, aid, b) {
    const d = {
        erdeklodo_id: Number(b.erdeklodo_id) || null,
        osszeg: szam(b.osszeg),
        penznem: b.penznem === "RON" ? "RON" : "EUR",
        feltetelek: sz(b.feltetelek, 2000),
        statusz: AJANLAT_STATUSZOK.includes(b.statusz) ? b.statusz : "uj",
        ellenajanlat: szam(b.ellenajanlat)
    };
    if (!d.osszeg || d.osszeg <= 0) throw hibaKod("bad_amount");
    if (aid) {
        const r = await db.query(`UPDATE megbizas_ajanlatok SET erdeklodo_id=$1, osszeg=$2, penznem=$3, feltetelek=$4, statusz=$5, ellenajanlat=$6,
                                      tovabbitva_at = CASE WHEN $5 IN ('tovabbitva', 'ellenajanlat', 'elfogadva') THEN COALESCE(tovabbitva_at, NOW()) ELSE tovabbitva_at END,
                                      vegso_osszeg = CASE WHEN $5 = 'elfogadva' THEN COALESCE(vegso_osszeg, $2) ELSE vegso_osszeg END,
                                      updated_at=NOW()
                                  WHERE id=$7 AND megbizas_id=$8 RETURNING id`,
            [d.erdeklodo_id, d.osszeg, d.penznem, d.feltetelek, d.statusz, d.ellenajanlat, aid, megbizasId]);
        if (!r.rowCount) throw hibaKod("not_found");
        return aid;
    }
    const r = await db.query(`INSERT INTO megbizas_ajanlatok (megbizas_id, erdeklodo_id, osszeg, penznem, feltetelek, statusz, ellenajanlat, ellen_vevonek, tovabbitva_at, vegso_osszeg)
                              VALUES ($1,$2,$3,$4,$5,$6,$7, false, CASE WHEN $6 IN ('tovabbitva', 'ellenajanlat', 'elfogadva') THEN NOW() END,
                                      CASE WHEN $6 = 'elfogadva' THEN $3::double precision END) RETURNING id`,
        [megbizasId, d.erdeklodo_id, d.osszeg, d.penznem, d.feltetelek, d.statusz, d.ellenajanlat]);
    if (d.erdeklodo_id) await db.query("UPDATE megbizas_erdeklodok SET statusz = 'ajanlat', updated_at = NOW() WHERE id = $1 AND statusz IN ('uj', 'kapcsolat', 'megtekintes')", [d.erdeklodo_id]);
    return r.rows[0].id;
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
        await db.query(`UPDATE megbizasok SET statusz = 'targyalas', updated_at = NOW() WHERE id = $1 AND statusz = 'hirdetes'`, [megbizasId]);
    } else if (muvelet === "elutasit") {
        if (!NYITOTT_AJANLAT.includes(a.statusz)) throw hibaKod("bad_state");
        await db.query("UPDATE megbizas_ajanlatok SET statusz = 'elutasitva', updated_at = NOW() WHERE id = $1", [a.id]);
        await naploIr(megbizasId, "ajanlat", `Ajánlat elutasítva: ${a.osszeg} ${a.penznem}`, !!a.tovabbitva_at, userId);
    } else if (muvelet === "ellen_tovabbit") {
        if (a.statusz !== "ellenajanlat" || a.ellen_vevonek) throw hibaKod("bad_state");
        await db.query("UPDATE megbizas_ajanlatok SET ellen_vevonek = true, updated_at = NOW() WHERE id = $1", [a.id]);
        await naploIr(megbizasId, "ajanlat", `Az eladó ellenajánlata (${a.ellenajanlat} ${a.penznem}) továbbítva a vevőnek`, false, userId);
    } else throw hibaKod("bad_request");
    return a;
}

async function szerzodesKuld(megbizasId, userId) {
    const r = await db.query("SELECT * FROM megbizasok WHERE id = $1", [megbizasId]);
    const m = r.rows[0];
    if (!m) throw hibaKod("not_found");
    if (["alairva", "elfogadva"].includes(m.szerzodes_allapot)) throw hibaKod("bad_state");
    await db.query(`UPDATE megbizasok SET szerzodes_allapot = 'elkuldve', szerzodes_elkuldve = NOW(),
                        statusz = CASE WHEN statusz = 'uj' THEN 'egyeztetes' ELSE statusz END,
                        elso_kapcsolat = COALESCE(elso_kapcsolat, NOW()), updated_at = NOW() WHERE id = $1`, [m.id]);
    await naploIr(m.id, "szerzodes", "A szerződést elküldtük elfogadásra.", true, userId);
    if (m.statusz === "uj") await naploIr(m.id, "statusz", "egyeztetes", true, userId);
    return m;
}

async function torol(tabla, megbizasId, id) {
    const T = { erdeklodok: "megbizas_erdeklodok", megtekintesek: "megbizas_megtekintesek", ajanlatok: "megbizas_ajanlatok", naplo: "megbizas_naplo", uzenetek: "megbizas_uzenetek" }[tabla];
    if (!T) throw hibaKod("bad_request");
    await db.query(`DELETE FROM ${T} WHERE id = $1 AND megbizas_id = $2`, [Number(id) || 0, Number(megbizasId) || 0]);
}

// Az admin menüjének számlálója: a sürgős teendők száma
async function szamlalo() {
    try {
        const r = await db.query(`${LISTA_SQL} WHERE m.statusz IN ('uj', 'egyeztetes', 'szerzodes', 'fotozas', 'hirdetes', 'targyalas', 'eladva')`);
        return r.rows.reduce((s, m) => s + teendok(m).filter(x => x.szint === "magas").length, 0);
    } catch (e) {
        return 0;
    }
}

// ===================== MUNKATÁRS: MEGTEKINTÉSEK (bemutató) =====================

async function sajatMegtekintesek(req) {
    const k = await csapat.kontextus(req);
    const params = [];
    const hol = csapat.hatokorSql(k, "megtekintes", params, { varos: "m.varos", tipus: "m.tipus", megbizas: "m.id", ingatlan: "m.ingatlan_id" });
    params.push(req.user ? req.user.id : 0);
    const r = await db.query(`
        SELECT t.id, t.megbizas_id, t.idopont, t.javasolt, t.statusz, t.visszajelzes,
               m.szerzodes_szam, m.tipus, m.cim, m.telepules, m.varos, m.ingatlan_id, m.nev AS elado_nev, m.telefon AS elado_telefon,
               e.nev AS erdeklodo_nev, e.telefon AS erdeklodo_telefon, e.email AS erdeklodo_email,
               (COALESCE(t.bemutato_id, m.bemutato_id) = $${params.length}) AS enyem
        FROM megbizas_megtekintesek t JOIN megbizasok m ON m.id = t.megbizas_id
        LEFT JOIN megbizas_erdeklodok e ON e.id = t.erdeklodo_id
        WHERE (${hol} OR COALESCE(t.bemutato_id, m.bemutato_id) = $${params.length})
          AND (t.statusz IN ('kert', 'egyeztetve') OR t.idopont > NOW() - INTERVAL '14 days')
          AND m.statusz NOT IN ('lezarva', 'elutasitva')
        ORDER BY (t.statusz = 'egyeztetve') DESC, t.idopont ASC NULLS LAST LIMIT 200`, params);
    return r.rows;
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
    STATUSZOK, AKTIV, ERDEKLODO_STATUSZOK, MEGTEKINTES_STATUSZOK, AJANLAT_STATUSZOK, IRATOK,
    beallitas, beallitasMent, ajanlat, ajanlatMod, iratLista, lejarat,
    letrehoz, sajatLista, sajatMegbizas, eladoValasz, sajatVisszavon, sajatUzenet, sajatOlvasott, szerzodesElfogad,
    hirdetesMegbizas, vevoAllapot, vevoKeres, vevoEllenElfogad, vevoAjanlatVisszavon, vevoMegtekintesLemond, vevoUzenet,
    lista, reszlet, ment, naploHozzaad, naploIr, erdeklodoMent, megtekintesMent, megtekintesLezar, ajanlatMent, ajanlatMuvelet,
    szerzodesKuld, hirdetesKapcsolva, uzenetIr, olvasott, szal, torol, szamlalo, dijSzamol, teendok,
    sajatMegtekintesek, megtekintesJog,
    pgDatum
};
