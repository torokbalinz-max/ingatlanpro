// ============================================================
//  Pénzügyek (Admin → Pénzügyek)
//
//  A weboldal bevételei és kiadásai rendszerezve:
//
//   Díjcsomagok   árlista: mit lehet megvenni és mit ad (jogosultság):
//                 iroda-előfizetés, extra hirdetések, reklámmentes oldal,
//                 részletes statisztika, kiemelés, reklámfelület, egyéb
//   Ügyfelek      magánszemély / cég (adószám, cím), kapcsolható egy
//                 fiókhoz vagy egy ingatlanirodához
//   Előfizetések  ki, melyik csomag, mennyiért, mettől; a következő
//                 díjbekérő dátuma (havi / negyedéves / éves)
//   Díjbekérők    tételes díjbekérő (proforma) / rögzített számla; fizetve,
//   és számlák    lejárt, sztornó. A sorszám évente újraindul (IP-2026-0001).
//   Kiadások      tárhely, domain, könyvelő, marketing...
//
//  FONTOS: Romániában a hivatalos számlát az e-Factura rendszeren kell
//  beküldeni (ANAF SPV). Ez a modul díjbekérőt (factură proformă) készít és
//  nyilvántart; a hivatalos számla számát (pl. SmartBill / Oblio / e-Factura)
//  a "Hivatalos számla száma" mezőbe lehet beírni.
//
//  Jogosultságok: az aktív előfizetések csomagjai adják (jogosultsag()).
//  A hirdetésszám-korlát csak akkor él, ha a beállításokban bekapcsolod
//  ("Díjak érvényesítése") – addig minden úgy működik, mint eddig.
// ============================================================

const db = require("../db/database");
const crypto = require("crypto");

// kozvetites: az „Eladjuk helyetted” megbízások sikerdíja, díjas szolgáltatásai
const KATEGORIAK = ["iroda_elofizetes", "extra_hirdetes", "reklammentes", "pro_statisztika", "kiemeles", "reklamfelulet", "kozvetites", "egyeb"];
const IDOSZAKOK = ["egyszeri", "havi", "negyedeves", "eves"];
const HONAP = { havi: 1, negyedeves: 3, eves: 12 };
const PENZNEMEK = ["RON", "EUR"];
const SZAMLA_TIPUSOK = ["dijbekero", "szamla"];
const SZAMLA_STATUSZOK = ["piszkozat", "kiallitva", "fizetve", "sztorno"];
const FIZETESI_MODOK = ["atutalas", "kartya", "keszpenz", "online", "egyeb"];
const KIADAS_KATEGORIAK = ["tarhely", "domain", "szoftver", "marketing", "konyveles", "adok", "bank", "egyeb"];
const UGYFEL_TIPUSOK = ["maganszemely", "pfa", "ceg"];
// fuggo: megrendelve, de még nincs kifizetve (a befizetéskor lesz aktív)
const ELOFIZETES_STATUSZOK = ["aktiv", "fuggo", "szunetel", "lemondva"];
const CELCSOPORTOK = ["maganszemely", "iroda", "mindenki"];

const BEALLITAS_KULCS = "penzugy";

// ===================== SEGÉDEK =====================

const kerek = v => Math.round((Number(v) || 0) * 100) / 100;

function hibaKod(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

function sz(v, max) {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
}

function szam(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
}

// "2026-10-10" vagy null (érvénytelen dátum: null)
function datum(v) {
    if (!v) return null;
    const s = String(v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(s + "T00:00:00Z");
    return isNaN(d) ? null : s;
}

// Mai nap (a román időzóna szerint – a szerver UTC-ben fut)
function ma() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
}

function napHozzaad(s, nap) {
    const d = new Date(s + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + nap);
    return d.toISOString().slice(0, 10);
}

// Hónap hozzáadása (jan. 31 + 1 hónap = febr. 28/29)
function honapHozzaad(s, honap) {
    const [y, m, d] = s.split("-").map(Number);
    const cel = new Date(Date.UTC(y, m - 1 + honap, 1));
    const utolso = new Date(Date.UTC(cel.getUTCFullYear(), cel.getUTCMonth() + 1, 0)).getUTCDate();
    cel.setUTCDate(Math.min(d, utolso));
    return cel.toISOString().slice(0, 10);
}

function pgDatum(v) {
    if (!v) return null;
    if (v instanceof Date) {
        // A pg a DATE-et helyi éjfélként adja vissza – a helyi dátum kell
        const p = n => String(n).padStart(2, "0");
        return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    return String(v).slice(0, 10);
}

// A NUMERIC oszlopok szövegként jönnek a pg-től – számmá alakítjuk
function szamosit(sor, mezok) {
    if (!sor) return sor;
    mezok.forEach(k => { if (k in sor && sor[k] !== null) sor[k] = Number(sor[k]); });
    ["kiallitva", "esedekes", "fizetve", "idoszak_tol", "idoszak_ig", "kezdet", "kovetkezo", "vege", "datum", "arfolyam_datum"].forEach(k => {
        if (k in sor) sor[k] = pgDatum(sor[k]);
    });
    return sor;
}

// ===================== BEÁLLÍTÁSOK =====================

function alapBeallitas() {
    return {
        penznem: "RON",
        afa_fizeto: false,          // ÁFA-alany-e a cég (plătitor de TVA)
        afa_kulcs: 21,              // Románia általános ÁFA-kulcsa (2025. augusztustól)
        dijbekero_elotag: "DB",
        szamla_elotag: "IP",
        fizetesi_hatarido: 14,      // nap
        elore_nap: 7,               // ennyi nappal az esedékesség előtt készül el a díjbekérő
        auto_dijbekero: false,      // naponta magától elkészíti az esedékes díjbekérőket
        bank: "",
        iban: "",
        kedvezmenyezett: "",        // a számla tulajdonosa (ha más, mint az üzemeltető neve – pl. magánszámla)
        revolut_link: "",           // revolut.me fizetési link (kártyával is fizethető, a pénz a Revolut-számlára jön)
        szamla_megjegyzes: "",
        eur_arfolyam: 5.0,          // 1 EUR = ? RON (az összesítésekhez)
        arfolyam_datum: null,
        // Díjak érvényesítése (hirdetésszám-korlát). Kikapcsolva: minden a régi.
        korlatok_be: false,
        ingyenes_hirdetes: 2,       // magánszemély ennyi aktív hirdetést tehet fel ingyen
        iroda_ingyenes_hirdetes: 2, // iroda előfizetés nélkül
        turelmi_nap: 10,            // lejárt díjbekérő után ennyi napig még él a csomag
        // Online fizetés (bankkártya – a kulcsok a szerver beállításaiban: STRIPE_SECRET_KEY...)
        online_fizetes: true,       // ha be van állítva a Stripe, a díjbekérő kártyával is fizethető
        // Számla a fizetés után: a kifizetett díjbekérőből magától elkészül a számla –
        // külső számlázóval (SmartBill / Oblio – SZAMLAZO=...), vagy ha az nincs,
        // az app maga állítja ki (saját számla, „IP-<év>-<sorszám>”)
        auto_szamla: true,
        sajat_szamla: true,
        // e-Factura (UBL XML) a saját számlához: az eladó települése és megyéje
        efactura_varos: "",
        efactura_megye: "",
        // e-Factura automatikus beküldés az ANAF-hoz (services/efacturaSpv.js):
        //   efactura_auto    a kiállított számlák maguktól mennek fel (5 munkanap a határidő)
        //   efactura_kezdet  csak az ettől a naptól kiállított számlák (a régiek / próbák nem)
        //   efactura_mod     "prod" (éles) vagy "test" (az ANAF próbarendszere)
        //   efactura_bejovo  a nekünk kiállított számlák letöltése az Irattárba
        efactura_auto: false,
        efactura_kezdet: null,
        efactura_mod: "prod",
        efactura_bejovo: true,
        efactura_bejovo_kiadas: true,   // a beérkező számla a Kiadások közé is felkerül
        // Kiemelés: a csomag havi keretéből egy kiemelés ennyi napig tart
        kiemeles_nap: 7,
        // A nyomtatott számla / díjbekérő: a hivatalos szöveg román; alapból
        // mellé kerülő fordítás ("" = csak román, "hu", "en") – az iraton átváltható
        bizonylat_forditas: "",
        // Nem ÁFA-alanynál a számlán a mentesség jogalapja (üres: az alapszöveg)
        tva_mentes_szoveg: ""
    };
}

let beallitasCache = null;

async function beallitas() {
    if (beallitasCache && Date.now() - beallitasCache.ido < 60 * 1000) return beallitasCache.adat;
    let adat = alapBeallitas();
    try {
        const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = $1", [BEALLITAS_KULCS]);
        if (r.rows[0] && r.rows[0].ertek) adat = { ...adat, ...JSON.parse(r.rows[0].ertek) };
    } catch (e) { /* első indulás */ }
    beallitasCache = { ido: Date.now(), adat };
    return adat;
}

async function beallitasMent(b) {
    const regi = await beallitas();
    const a = { ...regi };
    const n = (v, min, max, alap) => { const x = szam(v); return x === null ? alap : Math.min(max, Math.max(min, x)); };

    if ("penznem" in b) a.penznem = PENZNEMEK.includes(b.penznem) ? b.penznem : "RON";
    if ("afa_fizeto" in b) a.afa_fizeto = !!b.afa_fizeto;
    if ("afa_kulcs" in b) a.afa_kulcs = n(b.afa_kulcs, 0, 50, 21);
    if ("dijbekero_elotag" in b) a.dijbekero_elotag = (sz(b.dijbekero_elotag, 8) || "DB").toUpperCase().replace(/[^A-Z0-9]/g, "") || "DB";
    if ("szamla_elotag" in b) a.szamla_elotag = (sz(b.szamla_elotag, 8) || "IP").toUpperCase().replace(/[^A-Z0-9]/g, "") || "IP";
    if ("fizetesi_hatarido" in b) a.fizetesi_hatarido = Math.round(n(b.fizetesi_hatarido, 0, 120, 14));
    if ("elore_nap" in b) a.elore_nap = Math.round(n(b.elore_nap, 0, 60, 7));
    if ("auto_dijbekero" in b) a.auto_dijbekero = !!b.auto_dijbekero;
    if ("bank" in b) a.bank = sz(b.bank, 120) || "";
    if ("iban" in b) a.iban = (sz(b.iban, 40) || "").toUpperCase().replace(/\s+/g, "");
    if ("kedvezmenyezett" in b) a.kedvezmenyezett = sz(b.kedvezmenyezett, 120) || "";
    if ("revolut_link" in b) {
        // "@nev", "revolut.me/nev" vagy "https://revolut.me/nev" → https://revolut.me/nev
        const r = String(b.revolut_link || "").trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?revolut\.me\//i, "").replace(/^@/, "").replace(/\/+$/, "");
        if (r && !/^[A-Za-z0-9._-]{2,40}$/.test(r)) throw hibaKod("bad_revolut");
        a.revolut_link = r ? "https://revolut.me/" + r : "";
    }
    if ("szamla_megjegyzes" in b) a.szamla_megjegyzes = sz(b.szamla_megjegyzes, 600) || "";
    if ("eur_arfolyam" in b) a.eur_arfolyam = n(b.eur_arfolyam, 0.5, 50, 5);
    if ("arfolyam_datum" in b) a.arfolyam_datum = datum(b.arfolyam_datum);
    if ("korlatok_be" in b) a.korlatok_be = !!b.korlatok_be;
    if ("ingyenes_hirdetes" in b) a.ingyenes_hirdetes = Math.round(n(b.ingyenes_hirdetes, 0, 1000, 2));
    if ("iroda_ingyenes_hirdetes" in b) a.iroda_ingyenes_hirdetes = Math.round(n(b.iroda_ingyenes_hirdetes, 0, 1000, 2));
    if ("turelmi_nap" in b) a.turelmi_nap = Math.round(n(b.turelmi_nap, 0, 90, 10));
    if ("online_fizetes" in b) a.online_fizetes = !!b.online_fizetes;
    if ("auto_szamla" in b) a.auto_szamla = !!b.auto_szamla;
    if ("sajat_szamla" in b) a.sajat_szamla = !!b.sajat_szamla;
    if ("efactura_varos" in b) a.efactura_varos = sz(b.efactura_varos, 80) || "";
    if ("efactura_megye" in b) a.efactura_megye = (sz(b.efactura_megye, 6) || "").toUpperCase().replace(/[^A-Z-]/g, "");
    if ("efactura_auto" in b) a.efactura_auto = !!b.efactura_auto;
    if ("efactura_kezdet" in b) a.efactura_kezdet = datum(b.efactura_kezdet);
    if ("efactura_mod" in b) a.efactura_mod = b.efactura_mod === "test" ? "test" : "prod";
    if ("efactura_bejovo" in b) a.efactura_bejovo = !!b.efactura_bejovo;
    if ("efactura_bejovo_kiadas" in b) a.efactura_bejovo_kiadas = !!b.efactura_bejovo_kiadas;
    if ("kiemeles_nap" in b) a.kiemeles_nap = Math.round(n(b.kiemeles_nap, 1, 90, 7));
    if ("bizonylat_forditas" in b) a.bizonylat_forditas = ["hu", "en"].includes(b.bizonylat_forditas) ? b.bizonylat_forditas : "";
    if ("tva_mentes_szoveg" in b) a.tva_mentes_szoveg = sz(b.tva_mentes_szoveg, 300) || "";

    if (a.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(a.iban)) throw hibaKod("bad_iban");

    await db.query(
        `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`,
        [BEALLITAS_KULCS, JSON.stringify(a)]
    );
    beallitasCache = null;
    return a;
}

// EUR árfolyam a Román Nemzeti Banktól (BNR) – napi referencia-árfolyam
async function bnrArfolyam() {
    const res = await fetch("https://www.bnr.ro/nbrfxrates.xml", { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error("BNR HTTP " + res.status);
    const xml = await res.text();
    const m = xml.match(/<Rate currency="EUR">([\d.]+)<\/Rate>/);
    const d = xml.match(/<Cube date="(\d{4}-\d{2}-\d{2})"/);
    if (!m) throw new Error("BNR: nincs EUR");
    return { eur: Number(m[1]), datum: d ? d[1] : ma() };
}

// Átváltás RON-ra (az összesítésekhez)
function ronban(osszeg, penznem, b) {
    return penznem === "EUR" ? kerek(osszeg * (b.eur_arfolyam || 5)) : kerek(osszeg);
}

// ===================== DÍJCSOMAGOK =====================

// Kezdő árlista – csak javaslat, az adminban átírható / kikapcsolható
const ALAP_CSOMAGOK = [
    { kod: "iroda_alap", nev: "Ingatlaniroda – alap (havi)", nev_ro: "Agenție imobiliară – de bază (lunar)", nev_en: "Real estate agency – basic (monthly)",
      kategoria: "iroda_elofizetes", ar: 99, idoszak: "havi", jogosultsag: { hirdetes_limit: 30, iroda_profil: true },
      leiras: "Irodaprofil, ügynökök, legfeljebb 30 aktív hirdetés.", celcsoport: "iroda" },
    { kod: "iroda_pro", nev: "Ingatlaniroda – pro (havi)", nev_ro: "Agenție imobiliară – pro (lunar)", nev_en: "Real estate agency – pro (monthly)",
      kategoria: "iroda_elofizetes", ar: 199, idoszak: "havi", jogosultsag: { korlatlan_hirdetes: true, iroda_profil: true, pro_statisztika: true, kiemeles: 2 },
      leiras: "Korlátlan hirdetés, részletes statisztika, havi 2 kiemelés.", celcsoport: "iroda", kiemelt: true },
    { kod: "extra_5", nev: "+5 hirdetés (havi)", nev_ro: "+5 anunțuri (lunar)", nev_en: "+5 listings (monthly)",
      kategoria: "extra_hirdetes", ar: 19, idoszak: "havi", jogosultsag: { hirdetes_plusz: 5 },
      leiras: "A 2 ingyenes hirdetésen felül még 5 aktív hirdetés.", celcsoport: "maganszemely" },
    { kod: "reklammentes", nev: "Reklámmentes oldal (havi)", nev_ro: "Fără reclame (lunar)", nev_en: "Ad-free (monthly)",
      kategoria: "reklammentes", ar: 9, idoszak: "havi", jogosultsag: { reklammentes: true },
      leiras: "Belépve nem jelennek meg reklámok.", celcsoport: "mindenki" },
    { kod: "pro_stat", nev: "Részletes statisztikák (havi)", nev_ro: "Statistici detaliate (lunar)", nev_en: "Detailed statistics (monthly)",
      kategoria: "pro_statisztika", ar: 29, idoszak: "havi", jogosultsag: { pro_statisztika: true, reklammentes: true },
      leiras: "Részletes piaci elemzés, ártrendek, exportálás – és reklámmentes.", celcsoport: "mindenki" },
    { kod: "kiemeles_7", nev: "Kiemelt hirdetés (7 nap)", nev_ro: "Anunț promovat (7 zile)", nev_en: "Featured listing (7 days)",
      kategoria: "kiemeles", ar: 15, idoszak: "egyszeri", jogosultsag: { kiemeles: 1 },
      leiras: "A hirdetés 7 napig a találatok elején.", celcsoport: "mindenki" },
    { kod: "reklam_honap", nev: "Reklámfelület (havi)", nev_ro: "Spațiu publicitar (lunar)", nev_en: "Ad space (monthly)",
      kategoria: "reklamfelulet", ar: 250, idoszak: "havi", jogosultsag: {},
      leiras: "Egy reklám a kiválasztott reklámhelyeken egy hónapig.", celcsoport: "iroda", nyilvanos: false }
];

// 8. változat: az árlista (Csomagok és árak oldal) adatai a kezdő csomagokhoz –
// kinek szól, előnyök három nyelven. Csak egyszer fut, utána az adminban szerkeszthető.
const CSOMAG_V2 = {
    iroda_alap: {
        celcsoport: "iroda",
        elonyok: "Ellenőrzött irodaprofil logóval\nÜgynökök a hirdetéseken\nLegfeljebb 30 aktív hirdetés\nÜzenetek az érdeklődőktől",
        elonyok_ro: "Profil de agenție verificat, cu logo\nAgenți pe anunțuri\nPână la 30 de anunțuri active\nMesaje de la cei interesați",
        elonyok_en: "Verified agency profile with logo\nAgents on listings\nUp to 30 active listings\nMessages from interested buyers",
        leiras_ro: "Profil de agenție, agenți, până la 30 de anunțuri active.",
        leiras_en: "Agency profile, agents, up to 30 active listings."
    },
    iroda_pro: {
        celcsoport: "iroda", kiemelt: true,
        elonyok: "Korlátlan aktív hirdetés\nRészletes piaci statisztikák\nHavi 2 kiemelt hirdetés\nReklámmentes felület",
        elonyok_ro: "Anunțuri active nelimitate\nStatistici de piață detaliate\n2 anunțuri promovate pe lună\nFără reclame",
        elonyok_en: "Unlimited active listings\nDetailed market statistics\n2 featured listings a month\nAd-free",
        leiras_ro: "Anunțuri nelimitate, statistici detaliate, 2 promovări pe lună.",
        leiras_en: "Unlimited listings, detailed statistics, 2 featured listings a month."
    },
    extra_5: {
        celcsoport: "maganszemely",
        elonyok: "+5 aktív hirdetés\nBármikor lemondható",
        elonyok_ro: "+5 anunțuri active\nSe poate anula oricând",
        elonyok_en: "+5 active listings\nCancel any time",
        leiras_ro: "Încă 5 anunțuri active peste cele gratuite.",
        leiras_en: "5 more active listings on top of the free ones."
    },
    reklammentes: {
        celcsoport: "mindenki",
        elonyok: "Belépve nincs reklám sehol az oldalon",
        elonyok_ro: "Fără reclame pe site când ești autentificat",
        elonyok_en: "No ads anywhere on the site while logged in",
        leiras_ro: "Fără reclame când ești autentificat.",
        leiras_en: "No ads while logged in."
    },
    pro_stat: {
        celcsoport: "mindenki",
        elonyok: "Részletes piaci elemzés kerületenként\nÁrtrendek, exportálás\nReklámmentes",
        elonyok_ro: "Analiză de piață detaliată pe cartiere\nTendințe de preț, export\nFără reclame",
        elonyok_en: "Detailed market analysis by district\nPrice trends, export\nAd-free",
        leiras_ro: "Analiză de piață detaliată, tendințe, export – și fără reclame.",
        leiras_en: "Detailed market analysis, trends, export – and ad-free."
    },
    kiemeles_7: {
        celcsoport: "mindenki",
        elonyok: "7 napig a találatok elején\nKiemelt keret a kártyán",
        elonyok_ro: "7 zile în fruntea rezultatelor\nCadru evidențiat pe card",
        elonyok_en: "7 days at the top of the results\nHighlighted card",
        leiras_ro: "Anunțul apare 7 zile în fruntea rezultatelor.",
        leiras_en: "The listing stays at the top of the results for 7 days."
    },
    reklam_honap: { celcsoport: "iroda", nyilvanos: false }
};

// Új javasolt csomag magánszemélyeknek (8. változat)
const UJ_CSOMAGOK_V2 = [
    { kod: "magan_plusz", nev: "Magánszemély Plusz (havi)", nev_ro: "Persoană fizică Plus (lunar)", nev_en: "Private Plus (monthly)",
      kategoria: "extra_hirdetes", ar: 29, idoszak: "havi", celcsoport: "maganszemely", kiemelt: true,
      jogosultsag: { hirdetes_limit: 10, kiemeles: 1, reklammentes: true },
      leiras: "Legfeljebb 10 aktív hirdetés, havi 1 kiemelés, reklámmentes.",
      leiras_ro: "Până la 10 anunțuri active, 1 promovare pe lună, fără reclame.",
      leiras_en: "Up to 10 active listings, 1 featured listing a month, ad-free.",
      elonyok: "Legfeljebb 10 aktív hirdetés\nHavi 1 kiemelt hirdetés (7 nap)\nReklámmentes felület\nBármikor lemondható",
      elonyok_ro: "Până la 10 anunțuri active\n1 anunț promovat pe lună (7 zile)\nFără reclame\nSe poate anula oricând",
      elonyok_en: "Up to 10 active listings\n1 featured listing a month (7 days)\nAd-free\nCancel any time",
      sorrend: 1 }
];

async function kesz() {
    await keszV1();
    await keszV2();
}

async function keszV1() {
    try {
        const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = 'penzugy_csomagok_v1'");
        if (r.rowCount) return;
        for (const [i, c] of ALAP_CSOMAGOK.entries()) {
            await db.query(`
                INSERT INTO penzugy_csomagok (kod, nev, nev_ro, nev_en, kategoria, ar, penznem, idoszak, leiras, jogosultsag, sorrend)
                VALUES ($1, $2, $3, $4, $5, $6, 'RON', $7, $8, $9::jsonb, $10)
                ON CONFLICT (kod) DO NOTHING`,
                [c.kod, c.nev, c.nev_ro, c.nev_en, c.kategoria, c.ar, c.idoszak, c.leiras, JSON.stringify(c.jogosultsag), i]);
        }
        await db.query("INSERT INTO beallitasok (kulcs, ertek) VALUES ('penzugy_csomagok_v1', '1') ON CONFLICT (kulcs) DO NOTHING");
    } catch (e) {
        console.error("Pénzügy kezdő csomagok:", e.message);
    }
}

// Az árlista adatai a kezdő csomagokhoz + az új magánszemély-csomag (egyszer)
let v2Kesz = false;
async function keszV2() {
    if (v2Kesz) return;
    try {
        const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = 'penzugy_csomagok_v2'");
        if (r.rowCount) { v2Kesz = true; return; }
        for (const [kod, d] of Object.entries(CSOMAG_V2)) {
            await db.query(`
                UPDATE penzugy_csomagok SET celcsoport = $2, kiemelt = $3, nyilvanos = $4,
                       elonyok = COALESCE(elonyok, $5), elonyok_ro = COALESCE(elonyok_ro, $6), elonyok_en = COALESCE(elonyok_en, $7),
                       leiras_ro = COALESCE(leiras_ro, $8), leiras_en = COALESCE(leiras_en, $9)
                WHERE kod = $1`,
                [kod, d.celcsoport, !!d.kiemelt, d.nyilvanos !== false, d.elonyok || null, d.elonyok_ro || null, d.elonyok_en || null, d.leiras_ro || null, d.leiras_en || null]);
        }
        for (const c of UJ_CSOMAGOK_V2) {
            await db.query(`
                INSERT INTO penzugy_csomagok (kod, nev, nev_ro, nev_en, kategoria, ar, penznem, idoszak, leiras, leiras_ro, leiras_en,
                       elonyok, elonyok_ro, elonyok_en, jogosultsag, sorrend, celcsoport, kiemelt, nyilvanos)
                VALUES ($1,$2,$3,$4,$5,$6,'RON',$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,true)
                ON CONFLICT (kod) DO NOTHING`,
                [c.kod, c.nev, c.nev_ro, c.nev_en, c.kategoria, c.ar, c.idoszak, c.leiras, c.leiras_ro, c.leiras_en,
                 c.elonyok, c.elonyok_ro, c.elonyok_en, JSON.stringify(c.jogosultsag), c.sorrend, c.celcsoport, !!c.kiemelt]);
        }
        await db.query("INSERT INTO beallitasok (kulcs, ertek) VALUES ('penzugy_csomagok_v2', '1') ON CONFLICT (kulcs) DO NOTHING");
        v2Kesz = true;
    } catch (e) {
        console.error("Pénzügy csomagok (v2):", e.message);
    }
}

function jogTisztit(j) {
    j = j && typeof j === "object" ? j : {};
    const out = {};
    const egesz = v => { const n = szam(v); return n === null ? null : Math.max(0, Math.round(n)); };
    if (egesz(j.hirdetes_limit) !== null) out.hirdetes_limit = egesz(j.hirdetes_limit);
    if (egesz(j.hirdetes_plusz)) out.hirdetes_plusz = egesz(j.hirdetes_plusz);
    if (egesz(j.kiemeles)) out.kiemeles = egesz(j.kiemeles);
    // A kiemelés hossza napban (az egyszeri kiemelés terméknél és a havi keretnél)
    if (egesz(j.kiemeles_nap)) out.kiemeles_nap = Math.min(365, egesz(j.kiemeles_nap));
    ["korlatlan_hirdetes", "reklammentes", "pro_statisztika", "iroda_profil"].forEach(k => { if (j[k]) out[k] = true; });
    return out;
}

async function csomagok() {
    const r = await db.query(`
        SELECT c.*,
               (SELECT COUNT(*) FROM penzugy_elofizetesek e WHERE e.csomag_id = c.id AND e.statusz = 'aktiv')::int AS elofizetok,
               (SELECT COUNT(*) FROM penzugy_rendelesek r WHERE r.csomag_id = c.id)::int AS rendelesek,
               (SELECT COUNT(*) FROM penzugy_rendelesek r WHERE r.csomag_id = c.id AND r.statusz = 'fizetesre_var')::int AS fizetesre_var
        FROM penzugy_csomagok c ORDER BY c.aktiv DESC, c.sorrend, c.id`);
    return r.rows.map(c => szamosit(c, ["ar"]));
}

async function csomagMent(id, b) {
    const d = {
        kod: sz(b.kod, 40),
        nev: sz(b.nev, 160),
        nev_ro: sz(b.nev_ro, 160),
        nev_en: sz(b.nev_en, 160),
        kategoria: KATEGORIAK.includes(b.kategoria) ? b.kategoria : "egyeb",
        ar: kerek(Math.max(0, szam(b.ar) || 0)),
        penznem: PENZNEMEK.includes(b.penznem) ? b.penznem : "RON",
        idoszak: IDOSZAKOK.includes(b.idoszak) ? b.idoszak : "havi",
        leiras: sz(b.leiras, 1000),
        jogosultsag: jogTisztit(b.jogosultsag),
        aktiv: b.aktiv !== false,
        sorrend: Math.round(szam(b.sorrend) || 0),
        celcsoport: CELCSOPORTOK.includes(b.celcsoport) ? b.celcsoport : "mindenki",
        nyilvanos: b.nyilvanos !== false,
        kiemelt: !!b.kiemelt,
        leiras_ro: sz(b.leiras_ro, 1000),
        leiras_en: sz(b.leiras_en, 1000),
        elonyok: sz(b.elonyok, 2000),
        elonyok_ro: sz(b.elonyok_ro, 2000),
        elonyok_en: sz(b.elonyok_en, 2000)
    };
    if (!d.nev) throw hibaKod("missing_name");

    const ertekek = [d.kod, d.nev, d.nev_ro, d.nev_en, d.kategoria, d.ar, d.penznem, d.idoszak, d.leiras, JSON.stringify(d.jogosultsag), d.aktiv, d.sorrend,
        d.celcsoport, d.nyilvanos, d.kiemelt, d.leiras_ro, d.leiras_en, d.elonyok, d.elonyok_ro, d.elonyok_en];

    try {
        if (id) {
            const r = await db.query(`
                UPDATE penzugy_csomagok SET kod=$1, nev=$2, nev_ro=$3, nev_en=$4, kategoria=$5, ar=$6, penznem=$7, idoszak=$8,
                       leiras=$9, jogosultsag=$10::jsonb, aktiv=$11, sorrend=$12,
                       celcsoport=$13, nyilvanos=$14, kiemelt=$15, leiras_ro=$16, leiras_en=$17, elonyok=$18, elonyok_ro=$19, elonyok_en=$20,
                       updated_at=NOW()
                WHERE id=$21 RETURNING id`, [...ertekek, id]);
            if (!r.rowCount) throw hibaKod("not_found");
            return r.rows[0].id;
        }
        const r = await db.query(`
            INSERT INTO penzugy_csomagok (kod, nev, nev_ro, nev_en, kategoria, ar, penznem, idoszak, leiras, jogosultsag, aktiv, sorrend,
                   celcsoport, nyilvanos, kiemelt, leiras_ro, leiras_en, elonyok, elonyok_ro, elonyok_en)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`, ertekek);
        return r.rows[0].id;
    } catch (e) {
        if (e.code === "23505") throw hibaKod("duplicate_code");
        throw e;
    }
}

async function csomagTorol(id) {
    // Ha már használták (előfizetés / számlatétel), csak kikapcsoljuk
    const r = await db.query(`
        SELECT (SELECT COUNT(*) FROM penzugy_elofizetesek WHERE csomag_id = $1) + (SELECT COUNT(*) FROM penzugy_tetelek WHERE csomag_id = $1) AS n`, [id]);
    if (Number(r.rows[0].n) > 0) {
        await db.query("UPDATE penzugy_csomagok SET aktiv = false, updated_at = NOW() WHERE id = $1", [id]);
        return { kikapcsolva: true };
    }
    await db.query("DELETE FROM penzugy_csomagok WHERE id = $1", [id]);
    return { torolve: true };
}

// ===================== ÜGYFELEK =====================

async function ugyfelek() {
    const r = await db.query(`
        SELECT u.*,
               COALESCE(f.felhasznalonev, f.email) AS fiok, f.email AS fiok_email,
               i.nev AS iroda_nev,
               (SELECT COUNT(*) FROM penzugy_elofizetesek e WHERE e.ugyfel_id = u.id AND e.statusz = 'aktiv')::int AS aktiv_elofizetes,
               (SELECT COUNT(*) FROM penzugy_szamlak s WHERE s.ugyfel_id = u.id AND s.statusz <> 'sztorno')::int AS szamlak,
               (SELECT COALESCE(SUM(s.brutto), 0) FROM penzugy_szamlak s WHERE s.ugyfel_id = u.id AND s.statusz = 'fizetve' AND s.penznem = 'RON') AS fizetve_ron,
               (SELECT COALESCE(SUM(s.brutto), 0) FROM penzugy_szamlak s WHERE s.ugyfel_id = u.id AND s.statusz = 'fizetve' AND s.penznem = 'EUR') AS fizetve_eur,
               (SELECT COALESCE(SUM(s.brutto), 0) FROM penzugy_szamlak s WHERE s.ugyfel_id = u.id AND s.statusz = 'kiallitva' AND s.penznem = 'RON') AS tartozas_ron,
               (SELECT COALESCE(SUM(s.brutto), 0) FROM penzugy_szamlak s WHERE s.ugyfel_id = u.id AND s.statusz = 'kiallitva' AND s.penznem = 'EUR') AS tartozas_eur
        FROM penzugy_ugyfelek u
        LEFT JOIN users f ON f.id = u.user_id
        LEFT JOIN irodak i ON i.id = u.iroda_id
        ORDER BY LOWER(u.nev)`);
    return r.rows.map(u => szamosit(u, ["fizetve_ron", "fizetve_eur", "tartozas_ron", "tartozas_eur"]));
}

async function ugyfelMent(id, b) {
    const d = {
        tipus: UGYFEL_TIPUSOK.includes(b.tipus) ? b.tipus : "maganszemely",
        nev: sz(b.nev, 200),
        cui: (sz(b.cui, 20) || "").toUpperCase().replace(/^RO/, "").replace(/\s/g, "") || null,
        reg_com: sz(b.reg_com, 40),
        cim: sz(b.cim, 400),
        email: (sz(b.email, 160) || "").toLowerCase() || null,
        telefon: sz(b.telefon, 40),
        user_id: szam(b.user_id) ? Math.round(szam(b.user_id)) : null,
        iroda_id: szam(b.iroda_id) ? Math.round(szam(b.iroda_id)) : null,
        jegyzet: sz(b.jegyzet, 2000),
        // a számlához / e-Facturához: település, megye (RO-CV), ország (RO), ÁFA-alany-e
        varos: sz(b.varos, 80),
        megye: (sz(b.megye, 6) || "").toUpperCase().replace(/[^A-Z-]/g, "") || null,
        orszag: (/^[A-Za-z]{2}$/.test(String(b.orszag || "").trim()) ? String(b.orszag).trim().toUpperCase() : "RO"),
        afa_alany: !!b.afa_alany
    };
    if (!d.nev) throw hibaKod("missing_name");
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) throw hibaKod("bad_email");
    if (d.orszag !== "RO") d.megye = null;

    const ertekek = [d.tipus, d.nev, d.cui, d.reg_com, d.cim, d.email, d.telefon, d.user_id, d.iroda_id, d.jegyzet, d.varos, d.megye, d.orszag, d.afa_alany];
    if (id) {
        const r = await db.query(`
            UPDATE penzugy_ugyfelek SET tipus=$1, nev=$2, cui=$3, reg_com=$4, cim=$5, email=$6, telefon=$7, user_id=$8, iroda_id=$9, jegyzet=$10,
                   varos=$11, megye=$12, orszag=$13, afa_alany=$14, updated_at=NOW()
            WHERE id=$15 RETURNING id`, [...ertekek, id]);
        if (!r.rowCount) throw hibaKod("not_found");
        return r.rows[0].id;
    }
    const r = await db.query(`
        INSERT INTO penzugy_ugyfelek (tipus, nev, cui, reg_com, cim, email, telefon, user_id, iroda_id, jegyzet, varos, megye, orszag, afa_alany)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, ertekek);
    return r.rows[0].id;
}

async function ugyfelTorol(id) {
    const r = await db.query("SELECT COUNT(*)::int AS n FROM penzugy_szamlak WHERE ugyfel_id = $1", [id]);
    if (r.rows[0].n) throw hibaKod("has_invoices");
    await db.query("DELETE FROM penzugy_ugyfelek WHERE id = $1", [id]);
}

// Ügyfél-javaslatok: a regisztrált irodák és fiókok, amelyek még nem ügyfelek
async function ugyfelJavaslat(q) {
    q = String(q || "").trim().slice(0, 60);
    const minta = "%" + q.replace(/[%_\\]/g, "\\$&") + "%";
    const ir = await db.query(`
        SELECT i.id, i.nev, i.cui, i.reg_com, COALESCE(i.hivatalos_cim, i.cim) AS cim, i.email, i.telefon, i.statusz, i.hivatalos_nev,
               (SELECT t.user_id FROM iroda_tagok t WHERE t.iroda_id = i.id AND t.szerep = 'vezeto' LIMIT 1) AS vezeto_id
        FROM irodak i
        WHERE NOT EXISTS (SELECT 1 FROM penzugy_ugyfelek u WHERE u.iroda_id = i.id)
          AND ($1 = '' OR i.nev ILIKE $2 OR COALESCE(i.cui, '') ILIKE $2 OR COALESCE(i.hivatalos_nev, '') ILIKE $2)
        ORDER BY (i.statusz = 'jovahagyva') DESC, i.nev LIMIT 20`, [q, minta]);
    const us = await db.query(`
        SELECT u.id, COALESCE(u.nev, u.felhasznalonev) AS nev, u.email, u.telefon, u.felhasznalonev,
               (SELECT COUNT(*) FROM ingatlanok i WHERE i.owner_id = u.id AND i.statusz IN ('aktiv', 'fuggo'))::int AS hirdetesek
        FROM users u
        WHERE NOT EXISTS (SELECT 1 FROM penzugy_ugyfelek p WHERE p.user_id = u.id)
          AND ($1 = '' OR COALESCE(u.nev, '') ILIKE $2 OR COALESCE(u.email, '') ILIKE $2 OR COALESCE(u.felhasznalonev, '') ILIKE $2)
        ORDER BY hirdetesek DESC, u.id DESC LIMIT 20`, [q, minta]);
    return { irodak: ir.rows, fiokok: us.rows };
}

// ===================== ELŐFIZETÉSEK =====================

async function elofizetesek() {
    const r = await db.query(`
        SELECT e.*, u.nev AS ugyfel_nev, u.tipus AS ugyfel_tipus, u.iroda_id, u.user_id,
               c.nev AS csomag_nev, c.kategoria,
               (SELECT MAX(s.idoszak_ig) FROM penzugy_szamlak s WHERE s.elofizetes_id = e.id AND s.statusz <> 'sztorno') AS szamlazva_ig,
               (SELECT COUNT(*) FROM penzugy_szamlak s WHERE s.elofizetes_id = e.id AND s.statusz = 'kiallitva')::int AS nyitott
        FROM penzugy_elofizetesek e
        LEFT JOIN penzugy_ugyfelek u ON u.id = e.ugyfel_id
        LEFT JOIN penzugy_csomagok c ON c.id = e.csomag_id
        ORDER BY (e.statusz = 'aktiv') DESC, e.kovetkezo NULLS LAST, e.id DESC`);
    return r.rows.map(e => { szamosit(e, ["ar"]); e.szamlazva_ig = pgDatum(e.szamlazva_ig); return e; });
}

async function elofizetesMent(id, b) {
    const csomagId = szam(b.csomag_id) ? Math.round(szam(b.csomag_id)) : null;
    let csomag = null;
    if (csomagId) {
        const r = await db.query("SELECT * FROM penzugy_csomagok WHERE id = $1", [csomagId]);
        csomag = r.rows[0] || null;
    }
    const d = {
        ugyfel_id: szam(b.ugyfel_id) ? Math.round(szam(b.ugyfel_id)) : null,
        csomag_id: csomag ? csomag.id : null,
        megnevezes: sz(b.megnevezes, 200) || (csomag ? csomag.nev : null),
        ar: kerek(Math.max(0, szam(b.ar) ?? (csomag ? Number(csomag.ar) : 0))),
        penznem: PENZNEMEK.includes(b.penznem) ? b.penznem : (csomag ? csomag.penznem : "RON"),
        idoszak: IDOSZAKOK.includes(b.idoszak) && b.idoszak !== "egyszeri" ? b.idoszak : (csomag && csomag.idoszak !== "egyszeri" ? csomag.idoszak : "havi"),
        mennyiseg: Math.max(1, Math.round(szam(b.mennyiseg) || 1)),
        kezdet: datum(b.kezdet) || ma(),
        kovetkezo: datum(b.kovetkezo),
        vege: datum(b.vege),
        statusz: ELOFIZETES_STATUSZOK.includes(b.statusz) ? b.statusz : "aktiv",
        jegyzet: sz(b.jegyzet, 2000)
    };
    if (!d.ugyfel_id) throw hibaKod("missing_customer");
    if (!d.megnevezes) throw hibaKod("missing_name");
    if (!d.kovetkezo) d.kovetkezo = d.kezdet;

    const ertekek = [d.ugyfel_id, d.csomag_id, d.megnevezes, d.ar, d.penznem, d.idoszak, d.mennyiseg, d.kezdet, d.kovetkezo, d.vege, d.statusz, d.jegyzet];
    if (id) {
        const r = await db.query(`
            UPDATE penzugy_elofizetesek SET ugyfel_id=$1, csomag_id=$2, megnevezes=$3, ar=$4, penznem=$5, idoszak=$6, mennyiseg=$7,
                   kezdet=$8, kovetkezo=$9, vege=$10, statusz=$11, jegyzet=$12, updated_at=NOW()
            WHERE id=$13 RETURNING id`, [...ertekek, id]);
        if (!r.rowCount) throw hibaKod("not_found");
        return r.rows[0].id;
    }
    const r = await db.query(`
        INSERT INTO penzugy_elofizetesek (ugyfel_id, csomag_id, megnevezes, ar, penznem, idoszak, mennyiseg, kezdet, kovetkezo, vege, statusz, jegyzet)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, ertekek);
    return r.rows[0].id;
}

async function elofizetesTorol(id) {
    const r = await db.query("SELECT COUNT(*)::int AS n FROM penzugy_szamlak WHERE elofizetes_id = $1 AND statusz <> 'sztorno'", [id]);
    const rr = await db.query("SELECT COUNT(*)::int AS n FROM penzugy_rendelesek WHERE elofizetes_id = $1", [id]);
    if (r.rows[0].n || rr.rows[0].n) {
        await db.query("UPDATE penzugy_elofizetesek SET statusz = 'lemondva', vege = COALESCE(vege, $2::date), updated_at = NOW() WHERE id = $1", [id, ma()]);
        return { lemondva: true };
    }
    await db.query("DELETE FROM penzugy_elofizetesek WHERE id = $1", [id]);
    return { torolve: true };
}

// Esedékes előfizetések: a következő díjbekérő dátuma legfeljebb "elore_nap" napon belül
async function esedekesek(b, csakReklam = false) {
    b = b || await beallitas();
    const hatar = napHozzaad(ma(), b.elore_nap || 0);
    const r = await db.query(`
        SELECT e.*, u.nev AS ugyfel_nev FROM penzugy_elofizetesek e
        JOIN penzugy_ugyfelek u ON u.id = e.ugyfel_id
        WHERE e.statusz = 'aktiv' AND e.kovetkezo IS NOT NULL AND e.kovetkezo <= $1::date
          AND (e.vege IS NULL OR e.kovetkezo <= e.vege)
          ${csakReklam ? "AND e.reklam_id IS NOT NULL" : ""}
        ORDER BY e.kovetkezo`, [hatar]);
    return r.rows.map(e => szamosit(e, ["ar"]));
}

// A díjbekérők elkészítése az esedékes előfizetésekhez. Egy előfizetésnél több
// lejárt időszak is lehet (pl. 3 hónapja nem futott) – mindegyikhez egy.
async function esedekesDijbekerok({ csakReklam = false } = {}) {
    const b = await beallitas();
    const lista = await esedekesek(b, csakReklam);
    const keszult = [];
    const hatar = napHozzaad(ma(), b.elore_nap || 0);

    for (const e of lista) {
        let kov = e.kovetkezo;
        let kor = 0;
        while (kov && kov <= hatar && (!e.vege || kov <= e.vege) && kor < 24) {
            kor++;
            const ig = napHozzaad(honapHozzaad(kov, HONAP[e.idoszak] || 1), -1);
            const id = await szamlaMent(null, {
                tipus: "dijbekero",
                ugyfel_id: e.ugyfel_id,
                elofizetes_id: e.id,
                reklam_id: e.reklam_id || null,
                kiallitva: ma(),
                esedekes: kov > ma() ? kov : napHozzaad(ma(), b.fizetesi_hatarido),
                idoszak_tol: kov,
                idoszak_ig: ig,
                penznem: e.penznem,
                tetelek: [{
                    megnevezes: `${e.megnevezes} (${kov} – ${ig})`,
                    kategoria: e.reklam_id ? "reklamfelulet" : null,
                    csomag_id: e.csomag_id,
                    mennyiseg: e.mennyiseg || 1,
                    egysegar: e.ar
                }]
            });
            keszult.push(id);
            kov = honapHozzaad(kov, HONAP[e.idoszak] || 1);
        }
        await db.query("UPDATE penzugy_elofizetesek SET kovetkezo = $1, updated_at = NOW() WHERE id = $2", [kov, e.id]);
    }
    return keszult;
}

// ===================== DÍJBEKÉRŐK / SZÁMLÁK =====================

function szamlaAllapot(s, maNap) {
    if (s.statusz === "kiallitva" && s.esedekes && s.esedekes < (maNap || ma())) return "lejart";
    return s.statusz;
}

async function szamlak(f = {}) {
    const felt = [];
    const p = [];
    if (f.tol) { p.push(datum(f.tol)); felt.push(`s.kiallitva >= $${p.length}::date`); }
    if (f.ig) { p.push(datum(f.ig)); felt.push(`s.kiallitva <= $${p.length}::date`); }
    if (f.ugyfel_id) { p.push(Number(f.ugyfel_id)); felt.push(`s.ugyfel_id = $${p.length}`); }
    const r = await db.query(`
        SELECT s.*, u.nev AS ugyfel_nev,
               EXISTS (SELECT 1 FROM efactura_valaszok v WHERE v.szamla_id = s.id) AS efactura_zip_van,
               (SELECT json_agg(json_build_object('kategoria', t.kategoria, 'brutto', t.brutto, 'megnevezes', t.megnevezes) ORDER BY t.sorrend, t.id)
                  FROM penzugy_tetelek t WHERE t.szamla_id = s.id) AS tetelek_rovid
        FROM penzugy_szamlak s
        LEFT JOIN penzugy_ugyfelek u ON u.id = s.ugyfel_id
        ${felt.length ? "WHERE " + felt.join(" AND ") : ""}
        ORDER BY s.kiallitva DESC, s.id DESC
        LIMIT 2000`, p);
    const mn = ma();
    const ef = require("./efacturaSpv");
    return r.rows.map(s => {
        szamosit(s, ["netto", "afa", "brutto"]);
        s.allapot = szamlaAllapot(s, mn);
        // e-Factura: kell-e, állapot, határidő (5 munkanap)
        s.ef = ef.szamlaInfo(s, mn);
        s.tetelek_rovid = (s.tetelek_rovid || []).map(t => ({ ...t, brutto: Number(t.brutto) }));
        return s;
    });
}

async function szamla(id) {
    const r = await db.query(`
        SELECT s.*, u.nev AS ugyfel_nev, e.megnevezes AS elofizetes_nev, rk.nev AS reklam_nev,
               EXISTS (SELECT 1 FROM efactura_valaszok v WHERE v.szamla_id = s.id) AS efactura_zip_van
        FROM penzugy_szamlak s
        LEFT JOIN penzugy_ugyfelek u ON u.id = s.ugyfel_id
        LEFT JOIN penzugy_elofizetesek e ON e.id = s.elofizetes_id
        LEFT JOIN reklamok rk ON rk.id = s.reklam_id
        WHERE s.id = $1`, [id]);
    if (!r.rowCount) return null;
    const s = szamosit(r.rows[0], ["netto", "afa", "brutto", "arfolyam"]);
    s.allapot = szamlaAllapot(s);
    s.ef = require("./efacturaSpv").szamlaInfo(s);
    const t = await db.query("SELECT * FROM penzugy_tetelek WHERE szamla_id = $1 ORDER BY sorrend, id", [id]);
    s.tetelek = t.rows.map(x => szamosit(x, ["mennyiseg", "egysegar", "afa_kulcs", "netto", "afa", "brutto"]));
    return s;
}

// A tételek összegei: egységár nettó; ÁFA-alanynál a kulcs szerint
function tetelSzamol(t, b, { negativ = false } = {}) {
    const m0 = kerek(szam(t.mennyiseg) ?? 1);
    // sztornó számlán a mennyiség negatív (az egységár marad pozitív)
    const mennyiseg = negativ && m0 < 0 ? Math.min(-0.01, m0) : Math.max(0.01, Math.abs(m0));
    const egysegar = kerek(szam(t.egysegar) ?? 0);
    const afaKulcs = b.afa_fizeto ? Math.min(50, Math.max(0, szam(t.afa_kulcs) ?? b.afa_kulcs)) : 0;
    const netto = kerek(mennyiseg * egysegar);
    const afa = kerek(netto * afaKulcs / 100);
    return { mennyiseg, egysegar, afa_kulcs: afaKulcs, netto, afa, brutto: kerek(netto + afa) };
}

// Következő sorszám: <előtag>-<év>-<4 jegy>, évente újraindul
async function kovetkezoSorszam(client, tipus, kiallitva, b) {
    const elotag = tipus === "szamla" ? b.szamla_elotag : b.dijbekero_elotag;
    const ev = String(kiallitva).slice(0, 4);
    const minta = `${elotag}-${ev}-`;
    await client.query("SELECT pg_advisory_xact_lock(hashtext('penzugy_sorszam'))");
    const r = await client.query(`
        SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(sorszam FROM $2::int), '\\D', '', 'g'), '')::int), 0) AS n
        FROM penzugy_szamlak WHERE sorszam LIKE $1`, [minta + "%", minta.length + 1]);
    return minta + String(Number(r.rows[0].n) + 1).padStart(4, "0");
}

// A vevő adatai a kiállításkor (később az ügyfél adatai változhatnak – a
// kiállított bizonylaton a régi marad)
async function vevoAdat(ugyfelId, b) {
    if (b && b.vevo && typeof b.vevo === "object" && b.vevo.nev) {
        const v = b.vevo;
        return {
            nev: sz(v.nev, 200), tipus: UGYFEL_TIPUSOK.includes(v.tipus) ? v.tipus : null, cui: sz(v.cui, 20), reg_com: sz(v.reg_com, 40),
            cim: sz(v.cim, 400), varos: sz(v.varos, 80), megye: sz(v.megye, 6), orszag: sz(v.orszag, 2) || "RO", afa: !!v.afa,
            email: sz(v.email, 160), telefon: sz(v.telefon, 40)
        };
    }
    if (!ugyfelId) return {};
    const r = await db.query(`SELECT nev, tipus, cui, reg_com, cim, varos, megye, COALESCE(orszag, 'RO') AS orszag, COALESCE(afa_alany, false) AS afa,
                                      email, telefon FROM penzugy_ugyfelek WHERE id = $1`, [ugyfelId]);
    return r.rows[0] || {};
}

// Kiállított számla (nem piszkozat): a tartalma már nem változhat (Codul fiscal) –
// javítani sztornó számlával és új számlával lehet. Itt csak a fizetés adatai.
function zarolt(s) {
    return !!s && s.tipus === "szamla" && s.statusz !== "piszkozat";
}

async function zaroltMent(regi, b) {
    if (b.statusz === "sztorno" && regi.statusz !== "sztorno") { await sztornoz(regi); return regi.id; }
    const statusz = ["kiallitva", "fizetve"].includes(b.statusz) ? b.statusz : regi.statusz;
    if (regi.statusz === "sztorno" && statusz !== "sztorno") throw hibaKod("invoice_locked");
    await db.query(`
        UPDATE penzugy_szamlak SET statusz = $2,
               fizetve = CASE WHEN $2 = 'fizetve' THEN COALESCE($3::date, fizetve, CURRENT_DATE) ELSE NULL END,
               fizetesi_mod = $4, kulso_szam = $5, reklam_id = $6, updated_at = NOW()
        WHERE id = $1`, [regi.id, regi.statusz === "sztorno" ? "sztorno" : statusz, datum(b.fizetve),
        "fizetesi_mod" in b ? (FIZETESI_MODOK.includes(b.fizetesi_mod) ? b.fizetesi_mod : null) : regi.fizetesi_mod,
        "kulso_szam" in b ? sz(b.kulso_szam, 60) : regi.kulso_szam,
        "reklam_id" in b ? (Number(b.reklam_id) || null) : regi.reklam_id]);
    await rendelesSzinkron(regi.id);
    if (statusz === "fizetve" && regi.statusz !== "fizetve") fizetveJelez(regi.id);
    return regi.id;
}

// Sztornó számla a kiállított számlához: ugyanazok a tételek negatív mennyiséggel,
// hivatkozással az eredetire. Az eredeti „sztornó” állapotú lesz.
async function sztornoz(eredeti) {
    if (!zarolt(eredeti)) throw hibaKod("not_invoice");
    if (eredeti.sztorno_eredeti_id) throw hibaKod("cannot_reverse_reversal");
    const van = await db.query("SELECT id FROM penzugy_szamlak WHERE sztorno_eredeti_id = $1 LIMIT 1", [eredeti.id]);
    let ujId = van.rowCount ? van.rows[0].id : null;
    if (!ujId) {
        ujId = await szamlaMent(null, {
            tipus: "szamla",
            ugyfel_id: eredeti.ugyfel_id,
            vevo: eredeti.vevo && eredeti.vevo.nev ? eredeti.vevo : undefined,
            kiallitva: ma(),
            esedekes: ma(),
            statusz: "fizetve",
            fizetve: ma(),
            penznem: eredeti.penznem,
            fizetesi_mod: eredeti.fizetesi_mod,
            idoszak_tol: eredeti.idoszak_tol,
            idoszak_ig: eredeti.idoszak_ig,
            sztorno_eredeti_id: eredeti.id,
            arfolyam: eredeti.arfolyam,
            arfolyam_datum: eredeti.arfolyam_datum,
            megjegyzes: `Sztornó / Stornare: ${eredeti.sorszam}`,
            tetelek: (eredeti.tetelek || []).map(t => ({
                megnevezes: t.megnevezes, megnevezes_ro: t.megnevezes_ro, megnevezes_en: t.megnevezes_en,
                kategoria: t.kategoria, csomag_id: t.csomag_id,
                mennyiseg: -Math.abs(Number(t.mennyiseg) || 1), egysegar: Math.abs(Number(t.egysegar) || 0), afa_kulcs: t.afa_kulcs
            }))
        });
    }
    await db.query("UPDATE penzugy_szamlak SET statusz = 'sztorno', updated_at = NOW() WHERE id = $1", [eredeti.id]);
    await rendelesSzinkron(eredeti.id);
    return ujId;
}

async function szamlaMent(id, b) {

    const be = await beallitas();
    const regi = id ? await szamla(id) : null;
    if (id && !regi) throw hibaKod("not_found");
    if (zarolt(regi)) return zaroltMent(regi, b);
    const sztornoEredeti = !regi && Number(b.sztorno_eredeti_id) ? Number(b.sztorno_eredeti_id) : null;

    const tipus = SZAMLA_TIPUSOK.includes(b.tipus) ? b.tipus : (regi ? regi.tipus : "dijbekero");
    const kiallitva = datum(b.kiallitva) || (regi ? regi.kiallitva : ma());
    const ugyfelId = szam(b.ugyfel_id) ? Math.round(szam(b.ugyfel_id)) : (regi && !("ugyfel_id" in b) ? regi.ugyfel_id : null);
    const tetelekBe = Array.isArray(b.tetelek) ? b.tetelek.filter(t => t && sz(t.megnevezes, 300)) : null;

    if (!ugyfelId && !(b.vevo && b.vevo.nev)) throw hibaKod("missing_customer");
    if (!regi && (!tetelekBe || !tetelekBe.length)) throw hibaKod("missing_items");

    // A csomagok kategóriája a tételekhez
    const csomagKat = {};
    const csomagNev = {};
    if (tetelekBe) {
        const ids = tetelekBe.map(t => Number(t.csomag_id)).filter(Boolean);
        if (ids.length) {
            const r = await db.query("SELECT id, kategoria, nev, nev_ro, nev_en FROM penzugy_csomagok WHERE id = ANY($1::int[])", [ids]);
            r.rows.forEach(c => { csomagKat[c.id] = c.kategoria; csomagNev[c.id] = c; });
        }
    }

    // A tétel neve románul / angolul: ha nincs megadva, a csomag román / angol nevéből
    // (a csomagnév utáni rész – pl. az időszak – megmarad)
    const forditas = (t, cid, mezo) => {
        const c = cid && csomagNev[cid];
        if (!c || !c[mezo]) return null;
        const m = sz(t.megnevezes, 300) || "";
        const vege = c.nev && m.startsWith(c.nev) ? m.slice(c.nev.length) : "";
        return (c[mezo] + vege).slice(0, 300);
    };

    const tetelek = tetelekBe ? tetelekBe.slice(0, 50).map((t, i) => {
        const cid = Number(t.csomag_id) || null;
        return {
            megnevezes: sz(t.megnevezes, 300),
            megnevezes_ro: sz(t.megnevezes_ro, 300) || forditas(t, cid, "nev_ro"),
            megnevezes_en: sz(t.megnevezes_en, 300) || forditas(t, cid, "nev_en"),
            kategoria: KATEGORIAK.includes(t.kategoria) ? t.kategoria : (cid && csomagKat[cid]) || "egyeb",
            csomag_id: cid && csomagKat[cid] ? cid : null,
            sorrend: i,
            ...tetelSzamol(t, be, { negativ: !!sztornoEredeti })
        };
    }) : null;

    // Végösszeg: az ÁFA kulcsonként a nettó összegből (így egyezik az e-Factura szabályaival)
    const osszesit = lista => {
        const netto = kerek(lista.reduce((a, t) => a + t.netto, 0));
        const csop = {};
        lista.forEach(t => { csop[t.afa_kulcs] = kerek((csop[t.afa_kulcs] || 0) + t.netto); });
        const afa = kerek(Object.entries(csop).reduce((a, [k, alap]) => a + kerek(alap * Number(k) / 100), 0));
        return { netto, afa, brutto: kerek(netto + afa) };
    };
    const osszeg = tetelek ? osszesit(tetelek) : { netto: regi.netto, afa: regi.afa, brutto: regi.brutto };

    const statusz = SZAMLA_STATUSZOK.includes(b.statusz) ? b.statusz : (regi ? regi.statusz : "kiallitva");

    const d = {
        tipus,
        ugyfel_id: ugyfelId,
        // A kifizetett / sztornózott bizonylaton a vevő adatai már nem változnak
        vevo: regi && ["fizetve", "sztorno"].includes(regi.statusz) && regi.ugyfel_id === ugyfelId && !(b.vevo && b.vevo.nev)
            ? regi.vevo : await vevoAdat(ugyfelId, b),
        kiallitva,
        esedekes: datum(b.esedekes) || (regi && !("esedekes" in b) ? regi.esedekes : napHozzaad(kiallitva, be.fizetesi_hatarido)),
        fizetve: statusz === "fizetve" ? (datum(b.fizetve) || (regi && regi.fizetve) || ma()) : null,
        statusz,
        penznem: PENZNEMEK.includes(b.penznem) ? b.penznem : (regi ? regi.penznem : be.penznem),
        fizetesi_mod: FIZETESI_MODOK.includes(b.fizetesi_mod) ? b.fizetesi_mod : (regi && !("fizetesi_mod" in b) ? regi.fizetesi_mod : null),
        kulso_szam: "kulso_szam" in b ? sz(b.kulso_szam, 60) : (regi ? regi.kulso_szam : null),
        elofizetes_id: "elofizetes_id" in b ? (Number(b.elofizetes_id) || null) : (regi ? regi.elofizetes_id : null),
        reklam_id: "reklam_id" in b ? (Number(b.reklam_id) || null) : (regi ? regi.reklam_id : null),
        idoszak_tol: "idoszak_tol" in b ? datum(b.idoszak_tol) : (regi ? regi.idoszak_tol : null),
        idoszak_ig: "idoszak_ig" in b ? datum(b.idoszak_ig) : (regi ? regi.idoszak_ig : null),
        megjegyzes: "megjegyzes" in b ? sz(b.megjegyzes, 2000) : (regi ? regi.megjegyzes : null)
    };

    const client = await db.connect();
    try {
        await client.query("BEGIN");

        let szamlaId = id;
        let sorszam = regi ? regi.sorszam : null;

        // Számla-piszkozat: még nem kap sorszámot (a sorszám folytonos kell legyen,
        // a törölhető piszkozat ne hagyjon lyukat) – a kiállításkor kapja meg
        if (tipus === "szamla" && statusz === "piszkozat") {
            if (!sorszam || !/^TERV-/.test(sorszam)) sorszam = "TERV-" + crypto.randomBytes(4).toString("hex").toUpperCase();
        } else if (!regi || regi.tipus !== tipus || /^TERV-/.test(regi.sorszam || "") || String(regi.kiallitva).slice(0, 4) !== String(kiallitva).slice(0, 4)) {
            // Új sorszám: új bizonylatnál, kiállításkor, vagy ha a típus / az év megváltozott
            sorszam = await kovetkezoSorszam(client, tipus, kiallitva, be);
        }

        const ertekek = [sorszam, d.tipus, d.ugyfel_id, JSON.stringify(d.vevo), d.kiallitva, d.esedekes, d.fizetve, d.statusz, d.penznem,
            osszeg.netto, osszeg.afa, osszeg.brutto, d.fizetesi_mod, d.kulso_szam, d.elofizetes_id, d.reklam_id, d.idoszak_tol, d.idoszak_ig, d.megjegyzes];

        if (regi) {
            await client.query(`
                UPDATE penzugy_szamlak SET sorszam=$1, tipus=$2, ugyfel_id=$3, vevo=$4::jsonb, kiallitva=$5, esedekes=$6, fizetve=$7, statusz=$8,
                       penznem=$9, netto=$10, afa=$11, brutto=$12, fizetesi_mod=$13, kulso_szam=$14, elofizetes_id=$15, reklam_id=$16,
                       idoszak_tol=$17, idoszak_ig=$18, megjegyzes=$19, updated_at=NOW()
                WHERE id=$20`, [...ertekek, id]);
        } else {
            const r = await client.query(`
                INSERT INTO penzugy_szamlak (sorszam, tipus, ugyfel_id, vevo, kiallitva, esedekes, fizetve, statusz, penznem, netto, afa, brutto,
                       fizetesi_mod, kulso_szam, elofizetes_id, reklam_id, idoszak_tol, idoszak_ig, megjegyzes)
                VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`, ertekek);
            szamlaId = r.rows[0].id;
        }

        if (tetelek) {
            await client.query("DELETE FROM penzugy_tetelek WHERE szamla_id = $1", [szamlaId]);
            for (const t of tetelek) {
                await client.query(`
                    INSERT INTO penzugy_tetelek (szamla_id, megnevezes, kategoria, csomag_id, mennyiseg, egysegar, afa_kulcs, netto, afa, brutto, sorrend, megnevezes_ro, megnevezes_en)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                    [szamlaId, t.megnevezes, t.kategoria, t.csomag_id, t.mennyiseg, t.egysegar, t.afa_kulcs, t.netto, t.afa, t.brutto, t.sorrend, t.megnevezes_ro, t.megnevezes_en]);
            }
        }

        // Számlán: az árfolyam a kiállításkor (nem lejes számlán az ÁFA lejben is kell), sztornónál az eredeti
        if (tipus === "szamla") {
            const arf = sztornoEredeti && szam(b.arfolyam) ? szam(b.arfolyam) : (d.penznem !== "RON" ? be.eur_arfolyam : null);
            const arfDat = sztornoEredeti && b.arfolyam_datum ? datum(b.arfolyam_datum) : (d.penznem !== "RON" ? (be.arfolyam_datum || null) : null);
            await client.query(`UPDATE penzugy_szamlak SET arfolyam = COALESCE(arfolyam, $2), arfolyam_datum = COALESCE(arfolyam_datum, $3::date),
                                       sztorno_eredeti_id = COALESCE(sztorno_eredeti_id, $4) WHERE id = $1`, [szamlaId, arf, arfDat, sztornoEredeti]);
        }

        await client.query("COMMIT");
        await rendelesSzinkron(szamlaId);
        if (d.statusz === "fizetve" && (!regi || regi.statusz !== "fizetve")) fizetveJelez(szamlaId);
        return szamlaId;
    } catch (e) {
        await client.query("ROLLBACK").catch(() => { });
        throw e;
    } finally {
        client.release();
    }
}

// Gyors állapotváltás: fizetve / vissza kiállítottra / sztornó
async function szamlaAllapotValt(id, b) {
    const s = await szamla(id);
    if (!s) throw hibaKod("not_found");
    const uj = SZAMLA_STATUSZOK.includes(b.statusz) ? b.statusz : null;
    if (!uj) throw hibaKod("bad_status");
    // Kiállított számla: sztornó számlával vonható vissza; piszkozatból kiállításkor kap sorszámot
    if (zarolt(s)) {
        if (uj === "piszkozat") throw hibaKod("invoice_locked");
        await zaroltMent(s, { ...b, statusz: uj });
        return;
    }
    if (s.tipus === "szamla" && uj !== "piszkozat") {
        await szamlaMent(id, { statusz: uj, fizetve: b.fizetve, ...(b.fizetesi_mod ? { fizetesi_mod: b.fizetesi_mod } : {}), ...(b.kulso_szam ? { kulso_szam: b.kulso_szam } : {}) });
        return;
    }
    await db.query(`
        UPDATE penzugy_szamlak SET statusz = $1,
               fizetve = CASE WHEN $1 = 'fizetve' THEN $2::date ELSE NULL END,
               fizetesi_mod = COALESCE($3, fizetesi_mod),
               kulso_szam = COALESCE($4, kulso_szam),
               updated_at = NOW()
        WHERE id = $5`, [uj, datum(b.fizetve) || ma(), FIZETESI_MODOK.includes(b.fizetesi_mod) ? b.fizetesi_mod : null, sz(b.kulso_szam, 60), id]);
    await rendelesSzinkron(id);
    if (uj === "fizetve" && s.statusz !== "fizetve") fizetveJelez(id);
}

// ===================== RENDELÉSEK ↔ BIZONYLAT =====================
// Ha egy rendelés díjbekérőjét kifizetettnek jelölöd, a rendelés teljesül és
// a függő előfizetés aktív lesz (a csomag jogai élnek). Sztornónál a rendelés
// törlődik, a függő előfizetés lemondva. Visszaállításnál vissza.

const rendelesFigyelok = [];
function rendelesFigyelo(fn) { rendelesFigyelok.push(fn); }

// Ha egy bizonylat kifizetett lett (bármilyen úton: kártya, az admin jelölte,
// szerkesztés) – pl. a számla elkészítéséhez (services/szamlazo.js)
const fizetveFigyelok = [];
function fizetveFigyelo(fn) { fizetveFigyelok.push(fn); }
function fizetveJelez(szamlaId) {
    setImmediate(async () => {
        for (const fn of fizetveFigyelok) {
            try { await fn(szamlaId); } catch (e) { console.error("Fizetés utáni teendő:", e.message); }
        }
    });
}

async function rendelesSzinkron(szamlaId) {
    try {
        const r = await db.query(`
            SELECT r.*, s.statusz AS szamla_statusz FROM penzugy_rendelesek r
            JOIN penzugy_szamlak s ON s.id = r.szamla_id
            WHERE r.szamla_id = $1`, [szamlaId]);
        for (const x of r.rows) {
            let uj = x.statusz;
            if (x.szamla_statusz === "fizetve") uj = x.elofizetes_id ? "aktiv" : "teljesitve";
            else if (x.szamla_statusz === "sztorno") uj = x.statusz === "lemondva" ? "lemondva" : "torolve";
            else if (x.szamla_statusz === "kiallitva") uj = "fizetesre_var";
            if (uj === x.statusz) continue;

            await db.query(`UPDATE penzugy_rendelesek SET statusz = $1, fizetve = CASE WHEN $1 IN ('aktiv', 'teljesitve') THEN COALESCE(fizetve, NOW()) ELSE NULL END, updated_at = NOW() WHERE id = $2`, [uj, x.id]);

            if (x.elofizetes_id) {
                if (uj === "aktiv") {
                    await db.query(`UPDATE penzugy_elofizetesek SET statusz = 'aktiv', updated_at = NOW() WHERE id = $1 AND statusz = 'fuggo'`, [x.elofizetes_id]);
                } else if (uj === "torolve" || uj === "lemondva") {
                    await db.query(`UPDATE penzugy_elofizetesek SET statusz = 'lemondva', vege = COALESCE(vege, $2::date), updated_at = NOW() WHERE id = $1 AND statusz = 'fuggo'`, [x.elofizetes_id, ma()]);
                } else if (uj === "fizetesre_var") {
                    // Ha nincs más kifizetett bizonylata, újra függő
                    await db.query(`
                        UPDATE penzugy_elofizetesek e SET statusz = 'fuggo', updated_at = NOW()
                        WHERE e.id = $1 AND e.statusz = 'aktiv'
                          AND NOT EXISTS (SELECT 1 FROM penzugy_szamlak s WHERE s.elofizetes_id = e.id AND s.statusz = 'fizetve')`, [x.elofizetes_id]);
                }
            }
            for (const fn of rendelesFigyelok) {
                try { await fn({ ...x, statusz: uj, elozo: x.statusz }); } catch (e) { console.error("Rendelés értesítés:", e.message); }
            }
        }
    } catch (e) {
        console.error("Rendelés szinkron:", e.message);
    }
}

async function szamlaTorol(id) {
    const s = await szamla(id);
    if (!s) return;
    // Kiállított bizonylatot nem törlünk (a sorszámnak folytonosnak kell lennie) – sztornó
    if (s.statusz !== "piszkozat") throw hibaKod("only_draft_delete");
    await db.query("DELETE FROM penzugy_szamlak WHERE id = $1", [id]);
}

// ===================== KIADÁSOK =====================

async function kiadasok(f = {}) {
    const felt = [];
    const p = [];
    if (f.tol) { p.push(datum(f.tol)); felt.push(`datum >= $${p.length}::date`); }
    if (f.ig) { p.push(datum(f.ig)); felt.push(`datum <= $${p.length}::date`); }
    const r = await db.query(`SELECT * FROM penzugy_kiadasok ${felt.length ? "WHERE " + felt.join(" AND ") : ""} ORDER BY datum DESC, id DESC LIMIT 2000`, p);
    return r.rows.map(k => szamosit(k, ["osszeg", "afa"]));
}

async function kiadasMent(id, b) {
    const d = {
        datum: datum(b.datum) || ma(),
        kategoria: KIADAS_KATEGORIAK.includes(b.kategoria) ? b.kategoria : "egyeb",
        leiras: sz(b.leiras, 300),
        szallito: sz(b.szallito, 160),
        osszeg: kerek(Math.max(0, szam(b.osszeg) || 0)),
        penznem: PENZNEMEK.includes(b.penznem) ? b.penznem : "RON",
        afa: kerek(Math.max(0, szam(b.afa) || 0)),
        szamlaszam: sz(b.szamlaszam, 60),
        ismetlodo: ["havi", "eves"].includes(b.ismetlodo) ? b.ismetlodo : null,
        jegyzet: sz(b.jegyzet, 1000)
    };
    if (!d.leiras) throw hibaKod("missing_name");
    const ertekek = [d.datum, d.kategoria, d.leiras, d.szallito, d.osszeg, d.penznem, d.afa, d.szamlaszam, d.ismetlodo, d.jegyzet];
    if (id) {
        const r = await db.query(`
            UPDATE penzugy_kiadasok SET datum=$1, kategoria=$2, leiras=$3, szallito=$4, osszeg=$5, penznem=$6, afa=$7, szamlaszam=$8, ismetlodo=$9, jegyzet=$10, updated_at=NOW()
            WHERE id=$11 RETURNING id`, [...ertekek, id]);
        if (!r.rowCount) throw hibaKod("not_found");
        return r.rows[0].id;
    }
    const r = await db.query(`
        INSERT INTO penzugy_kiadasok (datum, kategoria, leiras, szallito, osszeg, penznem, afa, szamlaszam, ismetlodo, jegyzet)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, ertekek);
    return r.rows[0].id;
}

async function kiadasTorol(id) {
    await db.query("DELETE FROM penzugy_kiadasok WHERE id = $1", [id]);
}

// ===================== ÁTTEKINTÉS =====================

async function attekintes() {

    const b = await beallitas();
    const mn = ma();
    const honapEleje = mn.slice(0, 8) + "01";
    const evEleje = mn.slice(0, 5) + "01-01";
    const tizenketto = honapHozzaad(honapEleje, -11);

    const [sz12, ki12, nyitott, elof, kat, reklamok, utolsok] = await Promise.all([
        // Bevétel (fizetve, a fizetés hónapja szerint) és kiállítva, havonta
        db.query(`
            SELECT to_char(COALESCE(fizetve, kiallitva), 'YYYY-MM') AS ho, penznem, statusz,
                   SUM(brutto) AS brutto, SUM(netto) AS netto, COUNT(*)::int AS db
            FROM penzugy_szamlak
            WHERE statusz IN ('fizetve', 'kiallitva') AND COALESCE(fizetve, kiallitva) >= $1::date
            GROUP BY 1, 2, 3`, [tizenketto]),
        db.query(`
            SELECT to_char(datum, 'YYYY-MM') AS ho, penznem, SUM(osszeg) AS osszeg
            FROM penzugy_kiadasok WHERE datum >= $1::date GROUP BY 1, 2`, [tizenketto]),
        db.query(`
            SELECT s.id, s.sorszam, s.esedekes, s.brutto, s.penznem, s.kiallitva, u.nev AS ugyfel_nev, s.vevo
            FROM penzugy_szamlak s LEFT JOIN penzugy_ugyfelek u ON u.id = s.ugyfel_id
            WHERE s.statusz = 'kiallitva' ORDER BY s.esedekes NULLS LAST`),
        db.query(`SELECT ar, penznem, idoszak, mennyiseg FROM penzugy_elofizetesek WHERE statusz = 'aktiv' AND (vege IS NULL OR vege >= $1::date)`, [mn]),
        // Bevétel kategóriánként (idén, fizetve)
        db.query(`
            SELECT t.kategoria, s.penznem, SUM(t.brutto) AS brutto
            FROM penzugy_tetelek t JOIN penzugy_szamlak s ON s.id = t.szamla_id
            WHERE s.statusz = 'fizetve' AND s.fizetve >= $1::date
            GROUP BY 1, 2`, [evEleje]),
        // Reklámok, amelyekhez még nincs díjbekérő / számla
        db.query(`
            SELECT r.id, r.nev, r.hirdeto, r.ar, r.kezdet, r.vege, r.aktiv
            FROM reklamok r
            WHERE COALESCE(r.ar, 0) > 0
              AND NOT EXISTS (SELECT 1 FROM penzugy_szamlak s WHERE s.reklam_id = r.id AND s.statusz <> 'sztorno')
            ORDER BY r.kezdet DESC NULLS LAST, r.id DESC LIMIT 50`).catch(() => ({ rows: [] })),
        db.query(`
            SELECT s.id, s.sorszam, s.tipus, s.kiallitva, s.esedekes, s.statusz, s.brutto, s.penznem, u.nev AS ugyfel_nev, s.vevo
            FROM penzugy_szamlak s LEFT JOIN penzugy_ugyfelek u ON u.id = s.ugyfel_id
            ORDER BY s.created_at DESC LIMIT 8`)
    ]);

    // 12 hónap (RON-ban)
    const honapok = [];
    for (let i = 0; i < 12; i++) honapok.push(honapHozzaad(tizenketto, i).slice(0, 7));
    const havi = Object.fromEntries(honapok.map(h => [h, { ho: h, bevetel: 0, kiallitva: 0, kiadas: 0 }]));
    sz12.rows.forEach(r => {
        const h = havi[r.ho];
        if (!h) return;
        const v = ronban(Number(r.brutto), r.penznem, b);
        if (r.statusz === "fizetve") h.bevetel = kerek(h.bevetel + v);
        h.kiallitva = kerek(h.kiallitva + v);
    });
    ki12.rows.forEach(r => {
        const h = havi[r.ho];
        if (h) h.kiadas = kerek(h.kiadas + ronban(Number(r.osszeg), r.penznem, b));
    });

    const eHo = mn.slice(0, 7);
    const ev = mn.slice(0, 4);
    const evOssz = k => kerek(Object.values(havi).filter(h => h.ho.startsWith(ev)).reduce((s, h) => s + h[k], 0));

    // Kintlévőség, lejárt
    const nyit = nyitott.rows.map(s => szamosit(s, ["brutto"]));
    const lejart = nyit.filter(s => s.esedekes && s.esedekes < mn);

    // Havi ismétlődő bevétel (MRR) az aktív előfizetésekből
    const mrr = kerek(elof.rows.reduce((s, e) => {
        const ho = HONAP[e.idoszak] || 1;
        return s + ronban(Number(e.ar) * (e.mennyiseg || 1) / ho, e.penznem, b);
    }, 0));

    const kategoriak = {};
    kat.rows.forEach(r => { kategoriak[r.kategoria || "egyeb"] = kerek((kategoriak[r.kategoria || "egyeb"] || 0) + ronban(Number(r.brutto), r.penznem, b)); });

    return {
        ma: mn,
        beallitas: b,
        honap: havi[eHo] || { bevetel: 0, kiadas: 0, kiallitva: 0 },
        ev: { bevetel: evOssz("bevetel"), kiadas: evOssz("kiadas") },
        havi: honapok.map(h => havi[h]),
        kintlevoseg: kerek(nyit.reduce((s, x) => s + ronban(x.brutto, x.penznem, b), 0)),
        nyitottDb: nyit.length,
        lejart: lejart.slice(0, 20),
        lejartDb: lejart.length,
        lejartOsszeg: kerek(lejart.reduce((s, x) => s + ronban(x.brutto, x.penznem, b), 0)),
        mrr,
        aktivElofizetes: elof.rowCount,
        kategoriak,
        esedekes: (await esedekesek(b)).length,
        szamlazatlanReklamok: reklamok.rows.map(r => ({ ...r, ar: Number(r.ar), kezdet: pgDatum(r.kezdet), vege: pgDatum(r.vege) })),
        utolsok: utolsok.rows.map(s => { szamosit(s, ["brutto"]); s.allapot = szamlaAllapot(s, mn); return s; })
    };
}

// Számlálók az admin menühöz
async function szamlalok() {
    try {
        const b = await beallitas();
        const r = await db.query(`
            SELECT COUNT(*) FILTER (WHERE statusz = 'kiallitva' AND esedekes < $1::date)::int AS lejart
            FROM penzugy_szamlak`, [ma()]);
        const e = await esedekesek(b);
        const rend = await db.query("SELECT COUNT(*)::int AS n FROM penzugy_rendelesek WHERE statusz = 'fizetesre_var'").catch(() => ({ rows: [{ n: 0 }] }));
        return { penzugy_lejart: r.rows[0].lejart, penzugy_esedekes: e.length, penzugy_rendeles: rend.rows[0].n };
    } catch (e) {
        return { penzugy_lejart: 0, penzugy_esedekes: 0, penzugy_rendeles: 0 };
    }
}

// ===================== JOGOSULTSÁGOK =====================
// Az aktív előfizetések csomagjai. Egy előfizetés akkor él, ha aktív, már
// elkezdődött, nem járt le, és nincs a türelmi időnél régebben lejárt,
// kifizetetlen díjbekérője.

async function aktivJogok(feltetel, param) {
    const b = await beallitas();
    const r = await db.query(`
        SELECT c.jogosultsag, e.mennyiseg
        FROM penzugy_elofizetesek e
        JOIN penzugy_ugyfelek u ON u.id = e.ugyfel_id
        JOIN penzugy_csomagok c ON c.id = e.csomag_id
        WHERE ${feltetel}
          AND e.statusz = 'aktiv' AND e.kezdet <= $3::date AND (e.vege IS NULL OR e.vege >= $3::date)
          AND NOT EXISTS (SELECT 1 FROM penzugy_szamlak s WHERE s.elofizetes_id = e.id AND s.statusz = 'kiallitva'
                          AND s.esedekes < $3::date - $2::int)`, [param, b.turelmi_nap || 0, ma()]);
    return r.rows.map(x => ({ j: x.jogosultsag || {}, db: x.mennyiseg || 1 }));
}

function jogOsszevon(lista, alapLimit) {
    const j = { hirdetes_limit: alapLimit, korlatlan_hirdetes: false, reklammentes: false, pro_statisztika: false, kiemeles: 0, csomagok: lista.length };
    let plusz = 0;
    lista.forEach(({ j: c, db }) => {
        if (c.korlatlan_hirdetes) j.korlatlan_hirdetes = true;
        if (Number.isFinite(Number(c.hirdetes_limit))) j.hirdetes_limit = Math.max(j.hirdetes_limit, Number(c.hirdetes_limit));
        if (c.hirdetes_plusz) plusz += Number(c.hirdetes_plusz) * db;
        if (c.reklammentes) j.reklammentes = true;
        if (c.pro_statisztika) j.pro_statisztika = true;
        if (c.kiemeles) j.kiemeles += Number(c.kiemeles) * db;
    });
    j.hirdetes_limit += plusz;
    if (j.korlatlan_hirdetes) j.hirdetes_limit = null;
    return j;
}

// Egy felhasználó saját jogai (+ ha egy iroda tagja: az iroda reklámmentes /
// statisztika joga is az övé)
async function jogosultsag(userId) {
    if (!userId) return null;
    try {
        const b = await beallitas();
        const sajat = await aktivJogok("u.user_id = $1", userId);
        const iroda = await aktivJogok(`u.iroda_id IN (SELECT t.iroda_id FROM iroda_tagok t WHERE t.user_id = $1 AND COALESCE(t.statusz, 'aktiv') = 'aktiv')`, userId);
        const j = jogOsszevon(sajat, b.ingyenes_hirdetes);
        const ji = jogOsszevon(iroda, b.iroda_ingyenes_hirdetes);
        j.reklammentes = j.reklammentes || ji.reklammentes;
        j.pro_statisztika = j.pro_statisztika || ji.pro_statisztika;
        j.korlatok_be = !!b.korlatok_be;
        return j;
    } catch (e) {
        return null;
    }
}

async function irodaJogosultsag(irodaId) {
    const b = await beallitas();
    return jogOsszevon(await aktivJogok("u.iroda_id = $1", irodaId), b.iroda_ingyenes_hirdetes);
}

// Új hirdetésnél: elérte-e a korlátot? (null = feltöltheti)
//  irodaId: ha az iroda nevében tölti fel, az iroda előfizetése számít
async function hirdetesKorlat(req, irodaId) {
    if (!req.user || req.szerep === "admin") return null;
    const b = await beallitas();
    if (!b.korlatok_be) return null;

    let j, n;
    if (irodaId) {
        j = await irodaJogosultsag(irodaId);
        const r = await db.query("SELECT COUNT(*)::int AS n FROM ingatlanok WHERE iroda_id = $1 AND statusz IN ('aktiv', 'fuggo')", [irodaId]);
        n = r.rows[0].n;
    } else {
        const sajat = await aktivJogok("u.user_id = $1", req.user.id);
        j = jogOsszevon(sajat, b.ingyenes_hirdetes);
        const r = await db.query("SELECT COUNT(*)::int AS n FROM ingatlanok WHERE owner_id = $1 AND iroda_id IS NULL AND statusz IN ('aktiv', 'fuggo')", [req.user.id]);
        n = r.rows[0].n;
    }
    if (j.hirdetes_limit === null || n < j.hirdetes_limit) return null;
    return { limit: j.hirdetes_limit, db: n, iroda: !!irodaId };
}

// A díjak bekapcsolása előtt: kik lépnék túl a korlátot most?
async function korlatElonezet() {
    const b = await beallitas();
    const r = await db.query(`
        SELECT u.id, COALESCE(u.nev, u.felhasznalonev, u.email) AS nev, COUNT(i.id)::int AS db
        FROM ingatlanok i JOIN users u ON u.id = i.owner_id
        WHERE i.iroda_id IS NULL AND i.statusz IN ('aktiv', 'fuggo') AND COALESCE(u.szerep, 'user') <> 'admin'
        GROUP BY u.id HAVING COUNT(i.id) > $1 ORDER BY COUNT(i.id) DESC LIMIT 50`, [b.ingyenes_hirdetes]);
    const ir = await db.query(`
        SELECT i.id, i.nev, COUNT(h.id)::int AS db
        FROM irodak i JOIN ingatlanok h ON h.iroda_id = i.id AND h.statusz IN ('aktiv', 'fuggo')
        GROUP BY i.id HAVING COUNT(h.id) > $1 ORDER BY COUNT(h.id) DESC LIMIT 50`, [b.iroda_ingyenes_hirdetes]);
    const fiokok = [];
    for (const u of r.rows) {
        const j = jogOsszevon(await aktivJogok("u.user_id = $1", u.id), b.ingyenes_hirdetes);
        if (j.hirdetes_limit !== null && u.db > j.hirdetes_limit) fiokok.push({ ...u, limit: j.hirdetes_limit });
    }
    const irodak = [];
    for (const i of ir.rows) {
        const j = await irodaJogosultsag(i.id);
        if (j.hirdetes_limit !== null && i.db > j.hirdetes_limit) irodak.push({ ...i, limit: j.hirdetes_limit });
    }
    return { fiokok, irodak };
}

// ===================== EXPORT (könyvelőnek) =====================

function csv(sorok) {
    const cella = v => {
        if (v === null || v === undefined) return "";
        const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
        return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // BOM + pontosvessző: az Excel (magyar / román beállítással) jól nyitja meg
    return "﻿" + sorok.map(r => r.map(cella).join(";")).join("\r\n");
}

async function exportSzamlak(f) {
    const lista = await szamlak(f);
    const fej = ["Sorszám", "Típus", "Kiállítva", "Esedékes", "Fizetve", "Állapot", "Vevő", "Adószám", "Nettó", "ÁFA", "Bruttó", "Pénznem", "Fizetési mód", "Hivatalos számla", "Tételek"];
    return csv([fej, ...lista.map(s => [
        s.sorszam, s.tipus, s.kiallitva, s.esedekes, s.fizetve, s.allapot, (s.vevo && s.vevo.nev) || s.ugyfel_nev, s.vevo && s.vevo.cui,
        s.netto, s.afa, s.brutto, s.penznem, s.fizetesi_mod, s.kulso_szam,
        (s.tetelek_rovid || []).map(t => t.megnevezes).join(" | ")
    ])]);
}

async function exportKiadasok(f) {
    const lista = await kiadasok(f);
    const fej = ["Dátum", "Kategória", "Leírás", "Szállító", "Összeg", "ÁFA", "Pénznem", "Számlaszám", "Ismétlődő", "Jegyzet"];
    return csv([fej, ...lista.map(k => [k.datum, k.kategoria, k.leiras, k.szallito, k.osszeg, k.afa, k.penznem, k.szamlaszam, k.ismetlodo, k.jegyzet])]);
}

// ===================== NAPI AUTOMATIKA =====================

async function napi() {
    try {
        const b = await beallitas();
        // a bérelt reklámfelületek havi díjbekérői mindig maguktól készülnek (a szerződés szerint)
        if (!b.auto_dijbekero) {
            const r = await esedekesDijbekerok({ csakReklam: true });
            if (r.length) console.log(`Pénzügy: ${r.length} reklám díjbekérő elkészült.`);
            return;
        }
        const k = await esedekesDijbekerok();
        if (k.length) console.log(`Pénzügy: ${k.length} díjbekérő elkészült (esedékes előfizetések).`);
    } catch (e) {
        console.error("Pénzügy napi futás:", e.message);
    }
}

module.exports = {
    KATEGORIAK, IDOSZAKOK, PENZNEMEK, SZAMLA_TIPUSOK, SZAMLA_STATUSZOK, FIZETESI_MODOK, KIADAS_KATEGORIAK, UGYFEL_TIPUSOK, ELOFIZETES_STATUSZOK, CELCSOPORTOK, HONAP,
    kesz, beallitas, beallitasMent, bnrArfolyam,
    csomagok, csomagMent, csomagTorol,
    ugyfelek, ugyfelMent, ugyfelTorol, ugyfelJavaslat,
    elofizetesek, elofizetesMent, elofizetesTorol, esedekesek, esedekesDijbekerok,
    szamlak, szamla, szamlaMent, szamlaAllapotValt, szamlaTorol,
    kiadasok, kiadasMent, kiadasTorol,
    attekintes, szamlalok,
    jogosultsag, irodaJogosultsag, hirdetesKorlat, korlatElonezet,
    exportSzamlak, exportKiadasok, napi,
    rendelesSzinkron, rendelesFigyelo, fizetveFigyelo, sztornoz, zarolt, szamlaAllapot, honapHozzaad, napHozzaad, ma, kerek, pgDatum, szamosit,
    // tesztekhez
    _: { honapHozzaad, napHozzaad, tetelSzamol, jogOsszevon, datum, ma }
};
