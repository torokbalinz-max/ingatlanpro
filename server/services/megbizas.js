// ============================================================
//  Eladjuk helyetted – megbízásos értékesítés
//
//  A tulajdonos az „Eladjuk helyetted” oldalon kiválasztja, mit kér
//  (profi fotózás, alaprajz, videó, kiemelt hirdetés, bemutatás, jogi
//  előkészítés...), megadja az ingatlan alapadatait és az elérhetőségét.
//  Utána:
//    uj → egyeztetes → szerzodes (aláírva) → fotozas → hirdetes (kint van)
//       → targyalas (ajánlatok) → eladva | lezarva | elutasitva
//
//  Minden megbízáshoz egy értékesítési felület tartozik (Admin → Megbízások):
//  érdeklődők és státuszuk, megtekintések, vételi ajánlatok (+ ellenajánlat),
//  egyeztetések naplója, szerződés (nyomtatható tervezet), a hirdetés.
//  Az eladó a Fiókom → Megbízásaim részen látja az állapotot, a neki
//  továbbított ajánlatokat (elfogad / elutasít / ellenajánlat), a
//  megtekintéseket. A vevő a hirdetésen kérhet megtekintést / tehet ajánlatot.
//
//  A díjak (sikerdíj %, minimum, opciók ára) az adminban állíthatók
//  (Admin → Megbízások → Beállítások). FONTOS: a szerződés csak tervezet –
//  aláírás előtt romániai ügyvéddel ellenőriztetendő.
// ============================================================

const db = require("../db/database");

const STATUSZOK = ["uj", "egyeztetes", "szerzodes", "fotozas", "hirdetes", "targyalas", "eladva", "lezarva", "elutasitva"];
const ERDEKLODO_STATUSZOK = ["uj", "kapcsolat", "megtekintes", "ajanlat", "vevo", "elutasitva"];
const MEGTEKINTES_STATUSZOK = ["kert", "egyeztetve", "megtortent", "elmaradt", "lemondva"];
const AJANLAT_STATUSZOK = ["uj", "tovabbitva", "ellenajanlat", "elfogadva", "elutasitva", "visszavonva"];
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

// ===================== BEÁLLÍTÁSOK (díjak, opciók) =====================

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
    return { ...b, opciok: b.opciok.filter(o => o.aktiv !== false), szerzodes_megjegyzes: undefined };
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

    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const szamSz = await kovetkezoSzam(client);
        const r = await client.query(`
            INSERT INTO megbizasok (user_id, statusz, ugylet, tipus, varos, telepules, cim, nm, szobak, kert_ar, leiras, nev, email, telefon,
                   elerhetoseg, opciok, jutalek, penznem, kizarolagos, idotartam_honap, szerzodes_szam)
            VALUES ($1,'uj',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20) RETURNING id`,
            [user.id, d.ugylet, d.tipus, d.varos, d.telepules, d.cim, d.nm, d.szobak, d.kert_ar, d.leiras, d.nev, d.email, d.telefon,
             d.elerhetoseg, JSON.stringify(valasztott), d.kizarolagos ? be.jutalek_kizarolagos : be.jutalek, be.penznem, d.kizarolagos,
             be.idotartam_honap, szamSz]);
        const id = r.rows[0].id;
        await client.query(`INSERT INTO megbizas_naplo (megbizas_id, tipus, szoveg, lathato_eladonak, created_by) VALUES ($1, 'statusz', $2, true, $3)`,
            [id, "uj", user.id]);
        await client.query("COMMIT");
        return { id, szam: szamSz };
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
        SELECT m.*, i.cim AS hirdetes_cim, i.statusz AS hirdetes_statusz, i.ar AS hirdetes_ar
        FROM megbizasok m LEFT JOIN ingatlanok i ON i.id = m.ingatlan_id
        WHERE m.user_id = $1 ORDER BY m.id DESC`, [user.id]);
    const ids = r.rows.map(m => m.id);
    if (!ids.length) return [];
    const [naplo, megt, ajan, erd] = await Promise.all([
        db.query(`SELECT id, megbizas_id, tipus, szoveg, created_at FROM megbizas_naplo WHERE megbizas_id = ANY($1::int[]) AND lathato_eladonak ORDER BY created_at DESC, id DESC`, [ids]),
        db.query(`SELECT id, megbizas_id, idopont, statusz, visszajelzes FROM megbizas_megtekintesek WHERE megbizas_id = ANY($1::int[]) AND statusz IN ('egyeztetve', 'megtortent') ORDER BY idopont DESC NULLS LAST`, [ids]),
        db.query(`SELECT id, megbizas_id, osszeg, penznem, feltetelek, statusz, ellenajanlat, elado_valasz, created_at, updated_at FROM megbizas_ajanlatok WHERE megbizas_id = ANY($1::int[]) AND statusz IN ('tovabbitva', 'ellenajanlat', 'elfogadva', 'elutasitva') ORDER BY created_at DESC`, [ids]),
        db.query(`SELECT megbizas_id, COUNT(*)::int AS n FROM megbizas_erdeklodok WHERE megbizas_id = ANY($1::int[]) GROUP BY 1`, [ids])
    ]);
    const erdDb = Object.fromEntries(erd.rows.map(x => [x.megbizas_id, x.n]));
    return r.rows.map(m => ({
        ...m,
        szerzodes_datum: pgDatum(m.szerzodes_datum), alairva: pgDatum(m.alairva), eladva: pgDatum(m.eladva),
        jutalek: m.jutalek === null ? null : Number(m.jutalek), fix_dij: m.fix_dij === null ? null : Number(m.fix_dij),
        admin_jegyzet: undefined,
        naplo: naplo.rows.filter(x => x.megbizas_id === m.id),
        megtekintesek: megt.rows.filter(x => x.megbizas_id === m.id),
        ajanlatok: ajan.rows.filter(x => x.megbizas_id === m.id),
        erdeklodok: erdDb[m.id] || 0
    }));
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
    if (!a || !["tovabbitva", "ellenajanlat"].includes(a.statusz)) throw hibaKod("not_found");
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
    await db.query(`UPDATE megbizas_ajanlatok SET statusz = $1, ellenajanlat = COALESCE($2, ellenajanlat), elado_valasz = $3, updated_at = NOW() WHERE id = $4`,
        [statusz, ellen, uzenet, a.id]);
    await naploIr(m.id, "ajanlat", `Eladó válasza: ${statusz}${ellen ? ` – ellenajánlat ${ellen} ${a.penznem}` : ""}${uzenet ? ` – „${uzenet}”` : ""}`, true, user.id);
    if (statusz === "elfogadva" && !["eladva", "lezarva"].includes(m.statusz)) {
        await db.query("UPDATE megbizasok SET statusz = 'targyalas', updated_at = NOW() WHERE id = $1 AND statusz <> 'targyalas'", [m.id]);
    }
    return { statusz, megbizas: m, ajanlat: a };
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

// ===================== A VEVŐ (a megbízásos hirdetésen) =====================

async function hirdetesMegbizas(ingatlanId) {
    const r = await db.query(`
        SELECT m.id, m.statusz, m.user_id FROM megbizasok m
        JOIN ingatlanok i ON i.id = m.ingatlan_id AND i.megbizas_id = m.id
        WHERE m.ingatlan_id = $1 AND m.statusz IN ('hirdetes', 'targyalas', 'fotozas', 'szerzodes')`, [Number(ingatlanId) || 0]);
    return r.rows[0] || null;
}

// Mit lát a vevő: az ő korábbi kérései erre a hirdetésre
async function vevoAllapot(user, ingatlanId) {
    const m = await hirdetesMegbizas(ingatlanId);
    if (!m) return { aktiv: false };
    if (!user) return { aktiv: true };
    const e = await db.query("SELECT id, statusz FROM megbizas_erdeklodok WHERE megbizas_id = $1 AND user_id = $2 ORDER BY id LIMIT 1", [m.id, user.id]);
    if (!e.rowCount) return { aktiv: true, sajat: m.user_id === user.id };
    const eid = e.rows[0].id;
    const [mt, aj] = await Promise.all([
        db.query("SELECT id, idopont, javasolt, statusz FROM megbizas_megtekintesek WHERE erdeklodo_id = $1 ORDER BY id DESC LIMIT 5", [eid]),
        db.query("SELECT id, osszeg, penznem, statusz, ellenajanlat, created_at FROM megbizas_ajanlatok WHERE erdeklodo_id = $1 ORDER BY id DESC LIMIT 5", [eid])
    ]);
    return { aktiv: true, sajat: m.user_id === user.id, erdeklodo: e.rows[0], megtekintesek: mt.rows, ajanlatok: aj.rows };
}

// tipus: megtekintes | ajanlat | kerdes
async function vevoKeres(user, ingatlanId, b) {
    if (!user) throw hibaKod("login_required");
    const m = await hirdetesMegbizas(ingatlanId);
    if (!m) throw hibaKod("not_found");
    if (m.user_id === user.id) throw hibaKod("own_listing");

    const tipus = ["megtekintes", "ajanlat", "kerdes"].includes(b.tipus) ? b.tipus : "kerdes";
    const nev = sz(b.nev, 160);
    const telefon = sz(b.telefon, 40);
    const email = (sz(b.email, 160) || "").toLowerCase() || null;
    if (!nev) throw hibaKod("missing_name");
    if (!telefon && !email) throw hibaKod("missing_contact");
    if (email && !EMAIL_RE.test(email)) throw hibaKod("bad_email");

    // Visszaélés ellen: egy vevő legfeljebb 10 kérése naponta egy hirdetésre
    const napi = await db.query(`
        SELECT (SELECT COUNT(*) FROM megbizas_megtekintesek t JOIN megbizas_erdeklodok e ON e.id = t.erdeklodo_id
                WHERE e.user_id = $1 AND t.megbizas_id = $2 AND t.created_at > NOW() - INTERVAL '1 day')
             + (SELECT COUNT(*) FROM megbizas_ajanlatok a JOIN megbizas_erdeklodok e ON e.id = a.erdeklodo_id
                WHERE e.user_id = $1 AND a.megbizas_id = $2 AND a.created_at > NOW() - INTERVAL '1 day') AS n`, [user.id, m.id]);
    if (Number(napi.rows[0].n) >= 10) throw hibaKod("too_many");

    const megjegyzes = sz(b.uzenet, 2000);
    const keret = szam(b.koltsegkeret);
    const fin = ["keszpenz", "hitel", "vegyes", "egyeb"].includes(b.finanszirozas) ? b.finanszirozas : null;

    let e = await db.query("SELECT * FROM megbizas_erdeklodok WHERE megbizas_id = $1 AND user_id = $2 ORDER BY id LIMIT 1", [m.id, user.id]);
    let eid;
    if (e.rowCount) {
        eid = e.rows[0].id;
        await db.query(`UPDATE megbizas_erdeklodok SET nev = $2, telefon = COALESCE($3, telefon), email = COALESCE($4, email),
                        koltsegkeret = COALESCE($5, koltsegkeret), finanszirozas = COALESCE($6, finanszirozas), updated_at = NOW() WHERE id = $1`,
            [eid, nev, telefon, email, keret, fin]);
    } else {
        const r = await db.query(`
            INSERT INTO megbizas_erdeklodok (megbizas_id, user_id, nev, telefon, email, koltsegkeret, finanszirozas, statusz, megjegyzes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'uj',$8) RETURNING id`, [m.id, user.id, nev, telefon, email, keret, fin, megjegyzes]);
        eid = r.rows[0].id;
    }

    if (tipus === "megtekintes") {
        await db.query(`INSERT INTO megbizas_megtekintesek (megbizas_id, erdeklodo_id, javasolt, statusz) VALUES ($1,$2,$3,'kert')`,
            [m.id, eid, sz(b.javasolt, 300) || megjegyzes]);
        await db.query("UPDATE megbizas_erdeklodok SET statusz = 'megtekintes', updated_at = NOW() WHERE id = $1 AND statusz IN ('uj', 'kapcsolat')", [eid]);
    } else if (tipus === "ajanlat") {
        const osszeg = szam(b.osszeg);
        if (!osszeg || osszeg <= 0) throw hibaKod("bad_amount");
        await db.query(`INSERT INTO megbizas_ajanlatok (megbizas_id, erdeklodo_id, osszeg, penznem, feltetelek, statusz) VALUES ($1,$2,$3,$4,$5,'uj')`,
            [m.id, eid, osszeg, b.penznem === "RON" ? "RON" : "EUR", sz(b.feltetelek, 1000) || megjegyzes]);
        await db.query("UPDATE megbizas_erdeklodok SET statusz = 'ajanlat', updated_at = NOW() WHERE id = $1 AND statusz IN ('uj', 'kapcsolat', 'megtekintes')", [eid]);
    } else if (megjegyzes) {
        await db.query("UPDATE megbizas_erdeklodok SET megjegyzes = TRIM(COALESCE(megjegyzes, '') || E'\\n' || $2), updated_at = NOW() WHERE id = $1", [eid, megjegyzes]);
    }

    await naploIr(m.id, tipus === "ajanlat" ? "ajanlat" : tipus === "megtekintes" ? "megtekintes" : "erdeklodo",
        `${nev}: ${tipus === "ajanlat" ? `vételi ajánlat ${szam(b.osszeg)} ${b.penznem === "RON" ? "RON" : "EUR"}` : tipus === "megtekintes" ? "megtekintést kér" : "kérdés"}${megjegyzes ? ` – „${megjegyzes.slice(0, 200)}”` : ""}`,
        false, user.id);

    return { megbizas_id: m.id, erdeklodo_id: eid, tipus };
}

// ===================== ADMIN =====================

async function naploIr(megbizasId, tipus, szoveg, lathato, userId) {
    await db.query(`INSERT INTO megbizas_naplo (megbizas_id, tipus, szoveg, lathato_eladonak, created_by) VALUES ($1,$2,$3,$4,$5)`,
        [megbizasId, tipus, szoveg, !!lathato, userId || null]);
}

async function adminLista() {
    const r = await db.query(`
        SELECT m.*, COALESCE(u.nev, u.felhasznalonev, u.email) AS fiok_nev,
               i.cim AS hirdetes_cim, i.statusz AS hirdetes_statusz,
               (SELECT COUNT(*) FROM megbizas_erdeklodok e WHERE e.megbizas_id = m.id)::int AS erdeklodok,
               (SELECT COUNT(*) FROM megbizas_megtekintesek t WHERE t.megbizas_id = m.id AND t.statusz = 'kert')::int AS megtekintes_kert,
               (SELECT COUNT(*) FROM megbizas_megtekintesek t WHERE t.megbizas_id = m.id AND t.statusz = 'egyeztetve' AND t.idopont >= NOW() - INTERVAL '2 hours')::int AS megtekintes_kozelgo,
               (SELECT MIN(t.idopont) FROM megbizas_megtekintesek t WHERE t.megbizas_id = m.id AND t.statusz = 'egyeztetve' AND t.idopont >= NOW() - INTERVAL '2 hours') AS kovetkezo_megtekintes,
               (SELECT COUNT(*) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz = 'uj')::int AS ajanlat_uj,
               (SELECT MAX(a.osszeg) FROM megbizas_ajanlatok a WHERE a.megbizas_id = m.id AND a.statusz NOT IN ('visszavonva', 'elutasitva')) AS legjobb_ajanlat
        FROM megbizasok m
        LEFT JOIN users u ON u.id = m.user_id
        LEFT JOIN ingatlanok i ON i.id = m.ingatlan_id
        ORDER BY CASE m.statusz WHEN 'uj' THEN 0 WHEN 'egyeztetes' THEN 1 WHEN 'targyalas' THEN 2 WHEN 'hirdetes' THEN 3
                 WHEN 'fotozas' THEN 4 WHEN 'szerzodes' THEN 5 ELSE 9 END, m.updated_at DESC`);
    const be = await beallitas();
    return {
        lista: r.rows.map(m => ({ ...m, szerzodes_datum: pgDatum(m.szerzodes_datum), alairva: pgDatum(m.alairva), eladva: pgDatum(m.eladva),
            jutalek: m.jutalek === null ? null : Number(m.jutalek), fix_dij: m.fix_dij === null ? null : Number(m.fix_dij),
            legjobb_ajanlat: m.legjobb_ajanlat === null ? null : Number(m.legjobb_ajanlat) })),
        statuszok: STATUSZOK,
        beallitas: be
    };
}

async function adminReszlet(id) {
    const r = await db.query(`
        SELECT m.*, COALESCE(u.nev, u.felhasznalonev, u.email) AS fiok_nev, u.email AS fiok_email, u.telefon AS fiok_telefon
        FROM megbizasok m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = $1`, [Number(id) || 0]);
    const m = r.rows[0];
    if (!m) return null;
    const [erd, megt, ajan, naplo, hird, uz] = await Promise.all([
        db.query("SELECT * FROM megbizas_erdeklodok WHERE megbizas_id = $1 ORDER BY id DESC", [m.id]),
        db.query("SELECT t.*, e.nev AS erdeklodo_nev, e.telefon AS erdeklodo_telefon FROM megbizas_megtekintesek t LEFT JOIN megbizas_erdeklodok e ON e.id = t.erdeklodo_id WHERE t.megbizas_id = $1 ORDER BY t.idopont DESC NULLS FIRST, t.id DESC", [m.id]),
        db.query("SELECT a.*, e.nev AS erdeklodo_nev FROM megbizas_ajanlatok a LEFT JOIN megbizas_erdeklodok e ON e.id = a.erdeklodo_id WHERE a.megbizas_id = $1 ORDER BY a.created_at DESC", [m.id]),
        db.query("SELECT n.*, COALESCE(u.nev, u.felhasznalonev) AS szerzo FROM megbizas_naplo n LEFT JOIN users u ON u.id = n.created_by WHERE n.megbizas_id = $1 ORDER BY n.created_at DESC, n.id DESC LIMIT 300", [m.id]),
        m.ingatlan_id ? db.query("SELECT id, cim, ar, nm, statusz, tipus, varos FROM ingatlanok WHERE id = $1", [m.ingatlan_id]) : Promise.resolve({ rows: [] }),
        // A hirdetésről érkezett üzenetek (Üzenetek) – felvehetők érdeklődőként
        m.ingatlan_id ? db.query(`
            SELECT DISTINCT ON (z.felado_id) z.felado_id, z.szoveg, z.created_at, COALESCE(u.nev, u.felhasznalonev) AS nev, u.email, u.telefon,
                   EXISTS (SELECT 1 FROM megbizas_erdeklodok e WHERE e.megbizas_id = $2 AND e.user_id = z.felado_id) AS felveve
            FROM uzenetek z LEFT JOIN users u ON u.id = z.felado_id
            WHERE z.ingatlan_id = $1 AND z.felado_id IS NOT NULL AND z.felado_id <> COALESCE($3, 0)
            ORDER BY z.felado_id, z.created_at DESC`, [m.ingatlan_id, m.id, m.user_id]).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] })
    ]);
    return {
        ...m,
        szerzodes_datum: pgDatum(m.szerzodes_datum), alairva: pgDatum(m.alairva), eladva: pgDatum(m.eladva),
        jutalek: m.jutalek === null ? null : Number(m.jutalek), fix_dij: m.fix_dij === null ? null : Number(m.fix_dij),
        erdeklodok: erd.rows, megtekintesek: megt.rows, ajanlatok: ajan.rows, naplo: naplo.rows,
        hirdetes: hird.rows[0] || null, uzenetek: uz.rows,
        dij: await dijSzamol(m)
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
        fix: Number(m.fix_dij) || 0,
        opciok: opciok.map(o => ({ kod: o.kod, nev: o.nev, ar: o.ar, penznem: o.penznem }))
    };
}

async function adminMent(id, b, userId) {
    const r = await db.query("SELECT * FROM megbizasok WHERE id = $1", [Number(id) || 0]);
    const m = r.rows[0];
    if (!m) throw hibaKod("not_found");

    const d = {};
    const szoveges = { ugylet: 10, tipus: 20, varos: 80, telepules: 120, cim: 300, leiras: 4000, nev: 160, email: 160, telefon: 40, elerhetoseg: 300, admin_jegyzet: 8000 };
    for (const [k, max] of Object.entries(szoveges)) if (k in b) d[k] = sz(b[k], max);
    if ("ugylet" in d) d.ugylet = d.ugylet === "kiado" ? "kiado" : "elado";
    if ("tipus" in d && !TIPUSOK.includes(d.tipus)) d.tipus = m.tipus;
    for (const k of ["nm", "kert_ar", "eladasi_ar"]) if (k in b) d[k] = szam(b[k]);
    if ("szobak" in b) d.szobak = szam(b.szobak) ? Math.round(szam(b.szobak)) : null;
    if ("jutalek" in b) d.jutalek = szam(b.jutalek) === null ? null : Math.min(20, Math.max(0, szam(b.jutalek)));
    if ("fix_dij" in b) d.fix_dij = szam(b.fix_dij) === null ? null : Math.max(0, szam(b.fix_dij));
    if ("penznem" in b) d.penznem = b.penznem === "RON" ? "RON" : "EUR";
    if ("kizarolagos" in b) d.kizarolagos = !!b.kizarolagos;
    if ("idotartam_honap" in b) d.idotartam_honap = Math.min(36, Math.max(1, Math.round(szam(b.idotartam_honap) || 6)));
    for (const k of ["szerzodes_datum", "alairva", "eladva"]) if (k in b) d[k] = datum(b[k]);
    if ("opciok" in b && Array.isArray(b.opciok)) d.opciok = JSON.stringify([...new Set(b.opciok.map(String))].slice(0, 40));
    if ("ingatlan_id" in b) {
        const iid = Number(b.ingatlan_id) || null;
        if (iid) {
            const x = await db.query("SELECT id FROM ingatlanok WHERE id = $1", [iid]);
            if (!x.rowCount) throw hibaKod("listing_not_found");
        }
        d.ingatlan_id = iid;
    }
    let ujStatusz = null;
    if ("statusz" in b && STATUSZOK.includes(b.statusz) && b.statusz !== m.statusz) {
        d.statusz = b.statusz;
        ujStatusz = b.statusz;
        if (b.statusz === "eladva" && !("eladva" in d) && !m.eladva) d.eladva = ma();
        if (b.statusz === "szerzodes" && !m.alairva && !("alairva" in d)) d.alairva = ma();
    }

    const kulcsok = Object.keys(d);
    if (kulcsok.length) {
        const set = kulcsok.map((k, i) => `${k} = $${i + 2}${k === "opciok" ? "::jsonb" : ""}`).join(", ");
        await db.query(`UPDATE megbizasok SET ${set}, updated_at = NOW() WHERE id = $1`, [m.id, ...kulcsok.map(k => d[k])]);
    }

    // A hirdetés jelölése (és a régi jelölés levétele)
    if ("ingatlan_id" in d && d.ingatlan_id !== m.ingatlan_id) {
        if (m.ingatlan_id) await db.query("UPDATE ingatlanok SET megbizas_id = NULL WHERE id = $1 AND megbizas_id = $2", [m.ingatlan_id, m.id]);
        if (d.ingatlan_id) await db.query("UPDATE ingatlanok SET megbizas_id = $2 WHERE id = $1", [d.ingatlan_id, m.id]);
        await naploIr(m.id, "jegyzet", d.ingatlan_id ? `Hirdetés kapcsolva: #${d.ingatlan_id}` : "Hirdetés leválasztva", false, userId);
    }
    if (ujStatusz) await naploIr(m.id, "statusz", ujStatusz, true, userId);

    return { id: m.id, ujStatusz, elozo: m };
}

async function naploHozzaad(id, b, userId) {
    const szoveg = sz(b.szoveg, 4000);
    if (!szoveg) throw hibaKod("missing_text");
    await naploIr(Number(id), "jegyzet", szoveg, !!b.lathato_eladonak, userId);
}

// Érdeklődő / megtekintés / ajánlat – admin szerkesztés
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
    if (eid) {
        const r = await db.query(`UPDATE megbizas_erdeklodok SET nev=$1, telefon=$2, email=$3, koltsegkeret=$4, finanszirozas=$5, statusz=$6, megjegyzes=$7, updated_at=NOW()
                                  WHERE id=$8 AND megbizas_id=$9 RETURNING id`,
            [d.nev, d.telefon, d.email, d.koltsegkeret, d.finanszirozas, d.statusz, d.megjegyzes, eid, megbizasId]);
        if (!r.rowCount) throw hibaKod("not_found");
        return eid;
    }
    const r = await db.query(`INSERT INTO megbizas_erdeklodok (megbizas_id, user_id, nev, telefon, email, koltsegkeret, finanszirozas, statusz, megjegyzes)
                              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [megbizasId, d.user_id, d.nev, d.telefon, d.email, d.koltsegkeret, d.finanszirozas, d.statusz, d.megjegyzes]);
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
        visszajelzes: sz(b.visszajelzes, 2000)
    };
    if (tid) {
        const r = await db.query(`UPDATE megbizas_megtekintesek SET erdeklodo_id=$1, idopont=$2, javasolt=$3, statusz=$4, visszajelzes=$5, updated_at=NOW()
                                  WHERE id=$6 AND megbizas_id=$7 RETURNING id`,
            [d.erdeklodo_id, d.idopont, d.javasolt, d.statusz, d.visszajelzes, tid, megbizasId]);
        if (!r.rowCount) throw hibaKod("not_found");
        return tid;
    }
    const r = await db.query(`INSERT INTO megbizas_megtekintesek (megbizas_id, erdeklodo_id, idopont, javasolt, statusz, visszajelzes)
                              VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [megbizasId, d.erdeklodo_id, d.idopont, d.javasolt, d.statusz, d.visszajelzes]);
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
        const r = await db.query(`UPDATE megbizas_ajanlatok SET erdeklodo_id=$1, osszeg=$2, penznem=$3, feltetelek=$4, statusz=$5, ellenajanlat=$6, updated_at=NOW()
                                  WHERE id=$7 AND megbizas_id=$8 RETURNING id`,
            [d.erdeklodo_id, d.osszeg, d.penznem, d.feltetelek, d.statusz, d.ellenajanlat, aid, megbizasId]);
        if (!r.rowCount) throw hibaKod("not_found");
        return aid;
    }
    const r = await db.query(`INSERT INTO megbizas_ajanlatok (megbizas_id, erdeklodo_id, osszeg, penznem, feltetelek, statusz, ellenajanlat)
                              VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [megbizasId, d.erdeklodo_id, d.osszeg, d.penznem, d.feltetelek, d.statusz, d.ellenajanlat]);
    return r.rows[0].id;
}

async function torol(tabla, megbizasId, id) {
    const T = { erdeklodok: "megbizas_erdeklodok", megtekintesek: "megbizas_megtekintesek", ajanlatok: "megbizas_ajanlatok", naplo: "megbizas_naplo" }[tabla];
    if (!T) throw hibaKod("bad_request");
    await db.query(`DELETE FROM ${T} WHERE id = $1 AND megbizas_id = $2`, [Number(id) || 0, Number(megbizasId) || 0]);
}

async function szamlalo() {
    try {
        const r = await db.query(`
            SELECT (SELECT COUNT(*) FROM megbizasok WHERE statusz = 'uj')::int
                 + (SELECT COUNT(*) FROM megbizas_ajanlatok a JOIN megbizasok m ON m.id = a.megbizas_id WHERE a.statusz = 'uj' AND m.statusz NOT IN ('eladva', 'lezarva', 'elutasitva'))::int
                 + (SELECT COUNT(*) FROM megbizas_megtekintesek t JOIN megbizasok m ON m.id = t.megbizas_id WHERE t.statusz = 'kert' AND m.statusz NOT IN ('eladva', 'lezarva', 'elutasitva'))::int AS n`);
        return r.rows[0].n;
    } catch (e) {
        return 0;
    }
}

module.exports = {
    STATUSZOK, ERDEKLODO_STATUSZOK, MEGTEKINTES_STATUSZOK, AJANLAT_STATUSZOK,
    beallitas, beallitasMent, ajanlat,
    letrehoz, sajatLista, sajatMegbizas, eladoValasz, sajatVisszavon,
    hirdetesMegbizas, vevoAllapot, vevoKeres,
    adminLista, adminReszlet, adminMent, naploHozzaad, erdeklodoMent, megtekintesMent, ajanlatMent, torol, szamlalo, dijSzamol,
    pgDatum
};
