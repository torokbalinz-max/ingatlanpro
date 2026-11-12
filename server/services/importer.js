// ============================================================
//  Beolvasás más hirdetési oldalakról + a meglévők figyelése
//
//  Beolvasás (admin):
//   - hirdetés-linkek VAGY találati listák (lapozással, ?page=2, 3...)
//   - az új hirdetések azonnal megjelennek (mint az Imoradar24-en),
//     de ha hiányos vagy gyanús az adatuk, "ellenőrizendő" jelölést
//     kapnak, és a statisztika / becslés nem számol velük
//   - a már meglévőknél az árat frissítjük
//
//  Közvetlen beolvasás (OLX, Storia – services/kozvetlen.js): a város
//   teljes listája a forrásoldal saját listájából, a hirdetések pontos
//   linkjével; az Imoradar24-ről ilyenkor csak a többi oldal (imobiliare.ro,
//   Publi24...) hirdetései jönnek
//
//  Figyelés (admin gomb vagy napi időzítés):
//   - a meglévő hirdetések forrásoldalát újra megnézzük
//   - ha eladták / törölték: "nem elérhető" lesz (eltűnik a
//     nyilvános oldalról, az admin felületen jelenik meg)
//   - hiányzó adatokat, képeket pótolja
// ============================================================

const db = require("../db/database");
const { scrape, fetchPage, extractListingLinks, extractSearchItems, isListingUrl, pageUrl } = require("./scraper");
const { normalize, normLink } = require("./listing");
const quality = require("./quality");
const autofix = require("./autofix");
const kornyek = require("./kornyek");
const forrasHely = require("./forrasHely");
const location = require("./location");
const kozvetlen = require("./kozvetlen");
const forrasSorrend = require("./forrasSorrend");

const jobs = new Map();
let jobSzamlalo = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));

const MAX_OLDAL = 12;          // találati listánként ennyi oldalt lapozunk
const MAX_HIRDETES = 400;      // egy beolvasásban legfeljebb ennyi hirdetés
const KESLELTETES = +(process.env.IMPORT_DELAY || 1200);      // ms két kérés között – kíméljük a forrásoldalt

// ---------- feladat-nyilvántartás ----------

function ujJob(tipus) {

    const id = ++jobSzamlalo;

    const job = {
        id,
        tipus,
        allapot: "indul",
        osszes: 0,
        kesz: 0,
        uj: 0,
        frissitett: 0,
        kihagyott: 0,
        nemElerheto: 0,
        hibak: 0,
        letiltva: 0,      // a forrásoldal letiltott (403 / 429): most kihagyva, legközelebb újra
        naplo: [],
        kezdes: new Date().toISOString(),
        vege: null
    };

    jobs.set(id, job);

    if (jobs.size > 20) jobs.delete([...jobs.keys()][0]);

    return job;

}

function naplo(job, bejegyzes) {
    job.naplo.push(bejegyzes);
    if (job.naplo.length > 600) job.naplo.shift();
}

function allapot(id) {
    const j = jobs.get(Number(id));
    if (!j) return null;
    const { promise, ...rest } = j;
    return rest;
}

// ---------- közös ----------

// Egy link azonosító kulcsai: a normalizált link, és az imobiliare.ro
// hirdetésszáma (ugyanaz a hirdetés más címmel / utm-paraméterrel is)
function linkKulcsok(link) {
    const k = [];
    const n = normLink(link);
    if (n) k.push(n);
    const m = String(link || "").match(/imobiliare\.ro\/(?:[a-z]{2}\/)?oferta\/[a-z0-9-]*?-(\d{6,})(?:[/?#]|$)/i);
    if (m) k.push("imo:" + m[1]);
    return k;
}

function elemKulcsok(d) {
    const k = [];
    [d.link, ...(d.tovabbi_linkek || [])].forEach(l => k.push(...linkKulcsok(l)));
    // az Imoradar24 link-extern címei is (a régi hirdetéseinknél ez van a kulso_azon-ban)
    (d.forrasLista || []).forEach(f => { if (f.kozvetito) k.push(...linkKulcsok(f.kozvetito)); if (f.url) k.push(...linkKulcsok(f.url)); });
    if (d.reszletUrl) k.push(...linkKulcsok(d.reszletUrl));
    if (d.imoId) k.push("imo:" + d.imoId);
    // a forrásoldal saját azonosítója (közvetlen beolvasásnál)
    if (forrasHely.olxIdJo(d.olxId)) k.push("olxid:" + d.olxId);
    if (d.storiaId) k.push("storiaid:" + d.storiaId);
    return [...new Set(k)];
}

async function meglevoLinkek() {

    const r = await db.query("SELECT id, link, ar, statusz, tovabbi_linkek, kulso_azon FROM ingatlanok");
    const m = new Map();

    r.rows.forEach(i => {
        [i.link, ...(i.tovabbi_linkek || [])].forEach(l => {
            linkKulcsok(l).forEach(k => { if (!m.has(k)) m.set(k, i); });
        });
        // A közvetítő (Imoradar24) azonosítói: a valódi forrásra cserélt link mellett
        // így a következő beolvasás is felismeri
        (Array.isArray(i.kulso_azon) ? i.kulso_azon : []).forEach(k => { if (!m.has(k)) m.set(k, i); });
    });

    return m;

}

function keresMeglevo(meglevo, kulcsok) {
    for (const k of kulcsok) {
        const v = meglevo.get(k);
        if (v) return v;
    }
    return null;
}

// Egy beolvasott hirdetés adatainak előkészítése mentéshez.
// A hiányzó adatokat (telek mérete, szobák, kerület, település, hely...)
// az automatikus javítás tölti ki a hirdetés szövegéből.
async function elokeszit(d, alap) {

    const adat = normalize({
        ...d,
        tipus: d.tipus || alap.tipus,
        ugylet: d.ugylet || alap.ugylet,
        varos: alap.varos,
        // A beolvasáskor megadott kerület (pl. egy kerület keresési listája)
        kerulet: alap.kerulet || null,
        telepules: null,
        // A forrásoldal saját térképes helye (pontos vagy a hirdetés körzete)
        hely_pontossag: d.forrasHely ? d.forrasHely.hely_pontossag : undefined,
        hely_sugar: d.forrasHely ? d.forrasHely.hely_sugar : undefined
    });

    if (adat.x && adat.y) adat.hely_forras = "forras";

    adat.forras_kerulet = d.kerulet || null;
    adat.forras_szoveg = d.forrasSzoveg || null;
    adat.evszam = d.evszam || null;
    adat.forras_tipus = "import";
    // A forrásoldal szövegéből felismert állapot "bizonytalan" (az admin átnézheti)
    adat.allapot_forras = adat.allapot ? "szoveg" : null;

    Object.assign(adat, await autofix.javaslat(adat, { utca: d.utca, varosForras: d.varosForras }));

    // Faluban van (pl. Uzon)? -> a "<város> és környéke" városba
    await kornyek.helyreTesz(adat, { varosForras: d.varosForras }).catch(() => null);

    return adat;

}

// A város román neve (az OLX kereséshez)
async function varosRo(varos) {
    const va = await location.varosAdat(varos).catch(() => null);
    return (va && va.nev_ro) || require("./geocode").VAROS_RO[varos] || varos;
}

// A valódi forrás kereséséhez: a város román neve és a megye (a Storia listához)
async function forrasHelyAdat(varos) {
    const va = await location.varosAdat(varos).catch(() => null);
    return { varosRo: (va && va.nev_ro) || require("./geocode").VAROS_RO[varos] || varos, megye: (va && va.megye) || null };
}

// A közvetítő azonosítói, amelyek alapján a hirdetést később is felismerjük
function kulsoAzon(d, regi) {
    const k = new Set(Array.isArray(regi) ? regi : []);
    if (d.imoId) k.add("imo:" + d.imoId);
    // Az OLX hirdetés számazonosítója (csak az OLX saját adatából – az Imoradar24
    // "source_listing_id"-je NEM az OLX azonosítója!): ha az OLX oldala letiltja a
    // szervert, az OLX API-jából ezzel még kiderül, fent van-e (forrasHely.olxAllapot)
    if (forrasHely.olxIdJo(d.olxId)) k.add("olxid:" + d.olxId);
    if (d.storiaId) k.add("storiaid:" + d.storiaId);
    // a régi, hibásan (az Imoradar24 azonosítójával) mentett kulcsok ki
    [...k].forEach(x => { const m = /^olxid:(\d+)$/.exec(String(x)); if (m && !forrasHely.olxIdJo(m[1])) k.delete(x); });
    [d.kozvetitoLink, forrasHely.kozvetitoOldal(d.link) ? d.link : null, ...(d.forrasLista || []).map(f => f.kozvetito)].filter(Boolean)
        .forEach(l => linkKulcsok(l).forEach(x => k.add(x)));
    return [...k];
}

// A forrás pontos helye előrébb van-e, mint a mostani (pontos > utca > közelítő > nincs)
const HELY_RANG = { pontos: 3, utca: 2, kozelito: 1, nincs: 0 };
function jobbHely(i, h) {
    if (!h || i.hely_kezi || i.hely_forras === "kezi") return false;
    const most = i.x && i.y ? (HELY_RANG[i.hely_pontossag || "pontos"] || 0) : 0;
    return (HELY_RANG[h.hely_pontossag] || 0) > most;
}

// ---------- beolvasás ----------

async function egyHirdetes(url, alap, job, meglevo, kesz) {

    // "kesz": a találati listából már kiolvasott adatok (nem kell megnyitni a hirdetést)
    const d = kesz || await scrape(url);
    if (!d.link) d.link = url;

    const kulcsok = kesz ? elemKulcsok(d) : linkKulcsok(url);
    const van = keresMeglevo(meglevo, kulcsok);

    if (van) {

        if (d.elerheto === false) {
            await nemElerhetoJelol(van.id, job, url);
            return;
        }

        const r = await db.query("SELECT * FROM ingatlanok WHERE id = $1", [van.id]);
        if (r.rows[0]) await frissitAdatbol(r.rows[0], d, job);

        return;

    }

    if (d.elerheto === false) {
        job.kihagyott++;
        naplo(job, { url, eredmeny: "nem_elerheto" });
        return;
    }

    // Az Imoradar24 listájának olyan hirdetése, amelyik csak közvetlenül beolvasott oldalakon
    // (OLX / Storia) van fent: azt a saját oldaláról már felvettük (vagy a következő közvetlen
    // beolvasás felveszi) – a közvetítőn át nem vesszük fel még egyszer
    if (kesz && job.kihagy && job.kihagy.size && Array.isArray(d.forrasLista) && d.forrasLista.length &&
        d.forrasLista.every(f => f && f.forras && job.kihagy.has(f.forras))) {
        job.kihagyott++;
        naplo(job, { url, eredmeny: "kozvetlenbol", forras: [...new Set(d.forrasLista.map(f => f.forras))].join(", ") });
        return;
    }

    // A valódi forrás (közvetítő helyett) és a forrásoldal pontos helye
    await forrasHely.gazdagit(d, await forrasHelyAdat(alap.varos)).catch(e => console.error("Forrás kiegészítés:", e.message));

    // Ha a valódi forrás már nálunk van (pl. közvetlenül beolvasva), az frissül
    if (d.kozvetitoLink) {
        const mar = keresMeglevo(meglevo, linkKulcsok(d.link));
        if (mar) {
            const r = await db.query("SELECT * FROM ingatlanok WHERE id = $1", [mar.id]);
            if (r.rows[0]) await frissitAdatbol(r.rows[0], d, job);
            kulcsok.forEach(k => meglevo.set(k, mar));
            return;
        }
    }

    const adat = await elokeszit(d, alap);
    const q = await quality.ertekel(adat);

    const r = await db.query(`
        INSERT INTO ingatlanok
        (link, ar, nm, arnm, szobak, emelet, allapot, eladva, x, y, varos, kerulet,
         tipus, ugylet, cim, leiras, telek_nm, statusz, forras_tipus, hely_pontossag,
         kulso_kepek, hianyzo, problemak, ellenorzott, forras_szoveg, forras_kerulet, evszam,
         tovabbi_linkek, telepules, telek_jelleg, hely_sugar, utolso_ellenorzes, auto_javitva, auto_javitva_v,
         hely_forras, hely_eredeti, allapot_forras, varos_ok, varos_eredeti, kulso_azon, kozvetito, forras_nev, forras_kereso)
        VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11,$12,$13,$14,$15,$16,'aktiv','import',$17,
                $18::jsonb,$19::jsonb,$20::jsonb,$21,$22,$23,$24,$25::jsonb,$26,$27,$28,NOW(),NOW(),$29,
                $30,$31::jsonb,$32,$33,$34,$35::jsonb,$36,$37,$38)
        RETURNING id
    `, [
        d.link, adat.ar, adat.nm, adat.arnm, adat.szobak, adat.emelet, adat.allapot,
        adat.x, adat.y, adat.varos, adat.kerulet, adat.tipus, adat.ugylet,
        adat.cim, adat.leiras, adat.telek_nm, adat.hely_pontossag,
        JSON.stringify(d.kulso_kepek || []), JSON.stringify(q.hianyzo), JSON.stringify(q.problemak),
        q.ellenorzott, adat.forras_szoveg, adat.forras_kerulet, adat.evszam,
        JSON.stringify((d.tovabbi_linkek || []).filter(l => !forrasHely.kozvetitoOldal(l))), adat.telepules, adat.telek_jelleg || null, adat.hely_sugar || null,
        autofix.VERZIO, adat.hely_forras || (adat.x && adat.y ? "forras" : null),
        adat.hely_eredeti ? JSON.stringify(adat.hely_eredeti) : null,
        adat.allapot ? (adat.allapot_forras || "szoveg") : null,
        adat.varos_ok || null, adat.varos_eredeti || null,
        JSON.stringify(kulsoAzon(d)), d.kozvetito || null,
        d.forrasKulcs || forrasHely.forrasKulcs(null, d.link) || null, d.kozvetito ? (d.forrasKereso || null) : null
    ]);

    const uj = { id: r.rows[0].id, link: d.link, ar: adat.ar };
    [...kulcsok, ...linkKulcsok(d.link)].forEach(k => meglevo.set(k, uj));

    job.uj++;
    naplo(job, { url: d.link, eredmeny: "uj", id: uj.id, hianyzo: q.hianyzo, problemak: q.problemak });

}

// Egy találati lista összes oldala.
// Imoradar24-en a listában minden adat benne van ("elemek"),
// máshol csak a hirdetések linkjeit gyűjtjük ("linkek").
// "teljes": a lista végéig eljutottunk (nem a korlát állított meg).
async function listaOldalak(url, job, maxOldal = MAX_OLDAL, maxHirdetes = MAX_HIRDETES) {

    const elemek = new Map();
    const linkek = new Set();
    let teljes = false;
    // az első oldal: válaszkód, a tényleges cím (átirányítás), találatok – a link-ellenőrzéshez
    let elso = null;

    for (let oldal = 1; oldal <= maxOldal; oldal++) {

        const u = oldal === 1 ? url : pageUrl(url, oldal);

        let p;

        try {
            p = await fetchPage(u);
        } catch (e) {
            naplo(job, { url: u, eredmeny: "hiba", uzenet: e.message });
            if (oldal === 1) elso = { status: 0, vegso: null, db: 0, hiba: e.message };
            break;
        }

        if (oldal === 1) elso = { status: p.status, vegso: p.finalUrl || u, db: 0 };

        if (p.status >= 400) {
            // A lista vége: az Imoradar24 az utolsó utáni oldalra 404-et ad (élőben ellenőrizve
            // 2026-11-12: Sepsiszentgyörgy, 274 lakás – a 17. oldal már 404). Eddig ezt hibának
            // vettük, a lista így sosem lett "teljes", és a már levett hirdetéseket sosem jelölte.
            if (oldal > 1 && (p.status === 404 || p.status === 410)) { teljes = true; break; }
            naplo(job, { url: u, eredmeny: "hiba", uzenet: tiltasUzenet(u, p.status) });
            break;
        }

        const elotte = elemek.size + linkek.size;

        // Imoradar24: a beágyazott adatcsomag; Storia: a __NEXT_DATA__ találati lista
        let talalt = extractSearchItems(p.html);
        if (!talalt.length && /storia\.ro/i.test(u)) talalt = forrasHely.storiaListabol(p.html);

        if (talalt.length) {
            talalt.forEach(d => { if (!elemek.has(normLink(d.link))) elemek.set(normLink(d.link), d); });
        } else {
            extractListingLinks(p.html, p.finalUrl || u).forEach(l => linkek.add(l));
        }

        const ujDb = elemek.size + linkek.size - elotte;
        if (oldal === 1 && elso) elso.db = ujDb;

        naplo(job, { url: u, eredmeny: "lista", db: talalt.length || ujDb });

        // Nincs új hirdetés ezen az oldalon: vége a listának
        if (ujDb === 0) { teljes = true; break; }

        if (elemek.size + linkek.size >= maxHirdetes) break;

        await sleep(KESLELTETES);

    }

    return { elemek: [...elemek.values()], linkek: [...linkek], teljes, elso };

}

function tiltasUzenet(url, status) {
    if (status === 403 && /imobiliare\.ro/i.test(url)) {
        return "HTTP 403 – az imobiliare.ro letiltja a szervert. Használd ugyanennek a keresésnek az Imoradar24-es linkjét (ott minden imobiliare hirdetés benne van).";
    }
    if ((status === 403 || status === 429) && /storia\.ro/i.test(url)) {
        return `HTTP ${status} – a Storia letiltja a szervert. A Storia hirdetései az Imoradar24 listájából jönnek (ott is benne vannak), ehhez nem kell semmit tenned.`;
    }
    if ((status === 403 || status === 429) && /(olx|imobiliare|publi24)\.ro/i.test(url)) {
        return `HTTP ${status} – a forrásoldal bot-védelme letiltja a szervert. A hirdetés változatlan marad; ezek a hirdetések az Imoradar24 listájából frissülnek.`;
    }
    return `HTTP ${status}`;
}

const tiltasHiba = e => /HTTP (403|429)/.test(String(e && e.message));
const oldalNev = url => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return "?"; } };

// Egy teljesen végigolvasott találati listából hiányzó imobiliare-hirdetések:
// ezeket eladták / levették → "nem elérhető" (az admin visszaállíthatja)
//  Melyik hirdetésekről dönthet a lista:
//   - imobiliare.ro-s és Imoradar24-re mutató hirdetések (ezeket a szerver közvetlenül nem tudja megnézni)
//   - városra indított teljes ellenőrzésnél (opts.teljesVaros) az Imoradar24-ről átvett, de már
//     az eredeti oldalra (OLX / Storia / Publi24...) mutató hirdetések is – kivéve, amelyiket ugyanebben
//     a futásban a saját oldalán fent láttunk (job.kozvetlenOk)
async function hianyzokJelol(latottKulcsok, alap, job, elemek, opts = {}) {

    const elemDb = elemek.length;
    if (!alap.varos || !alap.tipus || !alap.ugylet || !elemDb) return;

    // A városból a "<város> és környéke" városba áthelyezett hirdetések is ennek
    // a városnak a listájában vannak a forrásoldalon
    const r = await db.query(`
        SELECT id, link, tovabbi_linkek, kulso_azon, ar, nm FROM ingatlanok
        WHERE statusz = 'aktiv' AND (varos = $1 OR varos_eredeti = $1)
          AND COALESCE(tipus, 'lakas') = $2 AND COALESCE(ugylet, 'elado') = $3
          AND (link ILIKE '%imobiliare.ro/%oferta/%' OR link ~* 'imoradar24\\.ro/'
               ${opts.teljesVaros ? "OR (forras_tipus = 'import' AND kulso_azon::text ILIKE '%imoradar24.ro/%')" : ""})
    `, [alap.varos, alap.tipus, alap.ugylet]);

    const ok = job.kozvetlenOk || new Set();

    // Óvatosság: ha a listában van ugyanilyen árú és alapterületű hirdetés, nem vesszük
    // levettnek (a közvetítő néha más formájú linket ad ugyanarra a hirdetésre)
    const hasonlo = i => Number(i.ar) > 0 && Number(i.nm) > 0 && elemek.some(d =>
        d.ar > 0 && Math.abs(d.ar - Number(i.ar)) <= Number(i.ar) * 0.005 && d.nm > 0 && Math.abs(d.nm - Number(i.nm)) <= 1);

    const hianyzik = r.rows.filter(i =>
        !ok.has(i.id) &&
        !hasonlo(i) &&
        ![i.link, ...(i.tovabbi_linkek || [])].some(l => linkKulcsok(l).some(k => latottKulcsok.has(k))) &&
        !(Array.isArray(i.kulso_azon) ? i.kulso_azon : []).some(k => latottKulcsok.has(k))
    );

    if (!hianyzik.length) return;

    // Biztonsági fék: ha egyszerre sok tűnne el (vagy a lista kicsi), lehet, hogy a lista
    // hibás (pl. a forrásoldal félúton letiltott, más szűrésű lista) – ilyenkor egyenként
    // megnézzük a hirdetés saját oldalát (az Imoradar24 adatlapját / az OLX, Storia oldalát),
    // és csak azt vesszük le, amelyikről ott is kiderül, hogy már nincs fent.
    // (Korábban ilyenkor egyiket sem jelölte – így a felgyűlt levett hirdetések sosem tűntek el.)
    if (hianyzik.length > Math.max(10, r.rows.length * 0.35) || elemDb < 10) {
        naplo(job, { eredmeny: "egyenkent", uzenet: `${hianyzik.length} hirdetés hiányzik a listából (${r.rows.length}-ból) – egyenként ellenőrzöm őket.` });
        await egyenkentJelol(hianyzik, job);
        return;
    }

    for (const i of hianyzik) {
        await nemElerhetoJelol(i.id, job, i.link, "nincs_a_listaban");
    }

}

// Az Imoradar24 adatlapja egy hirdetéshez (a link maga, vagy a mentett közvetítő-azonosítók közül)
function imoradarAdatlap(i) {
    if (/imoradar24\.ro\/oferta\//i.test(i.link || "")) return i.link;
    const k = (Array.isArray(i.kulso_azon) ? i.kulso_azon : []).find(x => /^imoradar24\.ro\/oferta\//i.test(String(x)));
    return k ? "https://www." + k : null;
}

// Fent van-e még a hirdetés: true | false | null (nem derült ki – pl. letiltás)
//  1. a saját oldala (OLX / Storia – az imobiliare.ro a szervert letiltja)
//  2. az Imoradar24 adatlapja (a levett hirdetés oldala 404 / átirányít / "noindex")
async function megerosit(i) {
    const linkek = [i.link, ...(i.tovabbi_linkek || [])].filter(l => /(olx|storia)\.ro\//i.test(String(l || "")));
    for (const l of linkek) {
        const v = await kozvetlen.fentVan(l);
        if (v === true) return true;
        if (v === false && l === i.link) return false;
        await sleep(KESLELTETES);
    }
    const adatlap = imoradarAdatlap(i);
    if (adatlap) {
        try {
            const d = await scrape(adatlap);
            return d.elerheto !== false;
        } catch (e) {
            return null;
        }
    }
    return null;
}

async function egyenkentJelol(lista, job) {
    let le = 0, fent = 0, nemtud = 0;
    for (const i of lista) {
        const v = await megerosit(i).catch(() => null);
        if (v === false) { await nemElerhetoJelol(i.id, job, i.link, "forras_szerint"); le++; }
        else if (v === true) { fent++; if (job.kozvetlenOk) job.kozvetlenOk.add(i.id); }
        else nemtud++;
        await sleep(KESLELTETES);
    }
    naplo(job, { eredmeny: "egyenkent_kesz", uzenet: `Egyenkénti ellenőrzés: ${le} levéve, ${fent} még fent van, ${nemtud} nem derült ki (marad).` });
}

// A lista típusa / ügylete a linkből, ha nincs megadva
function listaAlap(url, alap) {
    const u = String(url).toLowerCase();
    const tipus = /\/apartamente|garsoniere/.test(u) ? "lakas" : /\/case|vile/.test(u) ? "haz" : /\/teren/.test(u) ? "telek" : /birouri/.test(u) ? "iroda" : /spatii-comerciale/.test(u) ? "kereskedelmi" : null;
    const ugylet = /inchiriat|inchiriere/.test(u) ? "kiado" : /vanzare/.test(u) ? "elado" : null;
    return { ...alap, tipus: tipus || alap.tipus, ugylet: ugylet || alap.ugylet };
}

async function futtat(job, urls, alap, opts = {}) {

    try {

        const meglevo = await meglevoLinkek();

        const feladatok = [];      // { url, alap, kesz }
        const listak = [];         // teljesen végigolvasott listák a hiányzók jelöléséhez

        for (const u of urls) {

            if (isListingUrl(u)) {
                feladatok.push({ url: u, alap });
                continue;
            }

            const la = listaAlap(u, alap);
            const l = await listaOldalak(u, job, opts.maxOldal, opts.maxHirdetes);

            l.elemek.forEach(d => feladatok.push({ url: d.link, alap: la, kesz: d }));
            l.linkek.forEach(x => feladatok.push({ url: x, alap: la }));

            if (l.teljes && l.elemek.length) listak.push({ alap: la, elemek: l.elemek });
            job.listaInfo = job.listaInfo || {};
            job.listaInfo[u] = { ...(l.elso || {}), osszes: l.elemek.length + l.linkek.length, teljes: l.teljes };

        }

        const lattam = new Set();
        let egyedi = feladatok.filter(f => {
            const k = normLink(f.url);
            if (lattam.has(k)) return false;
            lattam.add(k);
            return true;
        });

        // Csak a meglévő hirdetések frissítése (a forrásoldal ellenőrzésénél):
        // a listában lévő, nálunk még nem szereplő hirdetéseket NEM vesszük fel
        // (az a beolvasás dolga), és nem is számoljuk bele a feladatba
        if (opts.csakMeglevo) {
            egyedi = egyedi.filter(f => keresMeglevo(meglevo, f.kesz ? elemKulcsok(f.kesz) : linkKulcsok(f.url)));
        }

        egyedi = egyedi.slice(0, opts.maxHirdetes || MAX_HIRDETES);

        job.osszes += egyedi.length;
        job.allapot = "fut";

        for (const f of egyedi) {

            try {
                await egyHirdetes(f.url, f.alap, job, meglevo, f.kesz);
            } catch (e) {
                job.hibak++;
                naplo(job, { url: f.url, eredmeny: "hiba", uzenet: /HTTP 403/.test(e.message) ? tiltasUzenet(f.url, 403) : e.message });
            }

            job.kesz++;

            // A listából kiolvasott adatnál nem kérünk le semmit – nem kell várni
            if (!f.kesz) await sleep(KESLELTETES);

        }

        for (const l of listak) {
            const kulcsok = new Set();
            l.elemek.forEach(d => elemKulcsok(d).forEach(k => kulcsok.add(k)));
            await hianyzokJelol(kulcsok, l.alap, job, l.elemek, opts);
        }

        if (!opts.utoMunkaNelkul) await utoMunka(job);

        job.allapot = "kesz";

    } catch (e) {

        job.allapot = "hiba";
        naplo(job, { eredmeny: "hiba", uzenet: e.message });

    }

    job.vege = new Date().toISOString();

    return job;

}

// A beolvasás után: a falvak a "<város> és környéke" városba, az új hirdetések fotóinak
// ujjlenyomata, a biztos duplikátumok összevonása (a háttérben), és a fő link a forrás-sorrend szerint
async function utoMunka(job) {
    if (job.uj || job.frissitett) await kornyek.rendez().catch(e => console.error("Környék rendezés:", e.message));
    if (job.uj) {
        Promise.resolve()
            .then(() => { const j = require("./imagehash").indit(400); return j && j.promise; })
            .then(() => require("./duplicates").autoOsszevon())
            .then(() => forrasSorrend.alkalmaz({ varosok: job.varosok || null }))
            .catch(e => console.error("Duplikátumok a beolvasás után:", e.message));
    }
}

// Az Imoradar24 listájából melyik oldalak hirdetéseit ne vegyük fel újként: amelyeket ebben
// a városban az elmúlt 36 órában közvetlenül (a saját oldalukról) végigolvastunk
async function kihagyBeallit(job, varos, tipus, ugylet) {
    job.kihagy = varos ? await forrasSorrend.frissKozvetlen(varos, tipus, ugylet).catch(() => new Set()) : new Set();
    // a "<város> és környéke" város hirdetései az anyaváros listájában vannak
    if (varos && !job.kihagy.size) {
        const anya = await kornyek.anyaVarosa(varos).catch(() => null);
        if (anya && anya !== varos) job.kihagy = await forrasSorrend.frissKozvetlen(anya, tipus, ugylet).catch(() => new Set());
    }
}

function indit(urls, alap) {
    const job = ujJob("import");
    const la = urls.length === 1 && !isListingUrl(urls[0]) ? listaAlap(urls[0], alap || {}) : (alap || {});
    job.promise = kihagyBeallit(job, la.varos, la.tipus, la.ugylet).then(() => futtat(job, urls, alap));
    return job;
}

// ---------- közvetlen beolvasás (OLX, Storia) ----------

// Egy város közvetlen beolvasása: új hirdetések (ha nem csakMeglevo), a meglévők frissítése,
// és a teljes listából hiányzók levétele.
//  opts: { csakMeglevo, forrasok, tipus, ugylet }
async function kozvetlenFuttat(job, varos, opts = {}) {

    const beall = await forrasSorrend.olvas();
    const forrasok = (opts.forrasok || beall.kozvetlen).filter(f => kozvetlen.FORRASOK.includes(f));
    if (!forrasok.length) { naplo(job, { eredmeny: "kozvetlen_ki", uzenet: "A közvetlen beolvasás ki van kapcsolva (Admin → Hirdetések → Források)." }); return; }

    const hely = { ...(await forrasHelyAdat(varos)), ...(opts.hely || {}) };
    const meglevo = await meglevoLinkek();
    job.kozvetlen = job.kozvetlen || {};
    if (!job.kozvetlenOk) job.kozvetlenOk = new Set();

    // A városban még az Imoradar24-re mutató hirdetések: ha a közvetlen listában ugyanaz
    // (ár, alapterület, szobák, emelet, cím) egyértelműen megvan, az kapja meg a pontos linket
    const kozv = (await db.query(`
        SELECT id, ar, nm, szobak, emelet, cim, tipus, ugylet, forras_nev FROM ingatlanok
        WHERE link ~* 'imoradar24\\.ro/' AND statusz IN ('aktiv', 'fuggo') AND (varos = $1 OR varos_eredeti = $1 OR varos IN (SELECT nev FROM varosok WHERE anyavaros = $1))`, [varos])).rows;

    naplo(job, { eredmeny: "lista_szinkron", url: `${forrasok.join(" + ")} – ${varos}` });

    const ered = await kozvetlen.varos(hely, { forrasok, tipus: opts.tipus || null, ugylet: opts.ugylet || null });

    for (const f of forrasok) {

        const e = ered[f] || { elemek: [], csoportok: [] };
        job.kozvetlen[f] = { varos, db: e.elemek.length, hiba: e.hiba || null, tiltva: !!e.tiltva, csoportok: e.csoportok, olxSlug: e.olxSlug || null };

        if (e.hiba) {
            naplo(job, { url: f, eredmeny: e.tiltva ? "letiltva" : "hiba", uzenet: e.tiltva
                ? `${f}: a forrásoldal letiltja a szervert (${e.hiba}) – ezek a hirdetések az Imoradar24 listájából jönnek.`
                : `${f}: ${e.hiba}` });
            continue;
        }

        naplo(job, { url: `${f} – ${varos}`, eredmeny: "lista", db: e.elemek.length });

        let lista = e.elemek;
        const kozvMatch = d => {
            if (!kozv.length || !(d.ar > 0)) return null;
            const jeloltek = kozv.filter(i => (!i.forras_nev || i.forras_nev === f) && (i.tipus || "lakas") === d.tipus && (i.ugylet || "elado") === d.ugylet)
                .map(i => ({ ...i, ar: Number(i.ar), nm: Number(i.nm) || null }));
            const t = forrasHely.legjobbJelolt(d, jeloltek);
            return t ? t.id : null;
        };

        const feladat = [];
        for (const d of lista) {
            let van = keresMeglevo(meglevo, elemKulcsok(d));
            if (!van) { const id = kozvMatch(d); if (id) { van = { id }; elemKulcsok(d).forEach(k => meglevo.set(k, van)); } }
            if (van) feladat.push({ d, id: van.id });
            else if (!opts.csakMeglevo) feladat.push({ d, id: null });
        }

        job.osszes += feladat.length;
        job.allapot = "fut";

        for (const fl of feladat) {
            try {
                if (fl.id) {
                    const r = await db.query("SELECT * FROM ingatlanok WHERE id = $1", [fl.id]);
                    if (r.rows[0]) {
                        job.kozvetlenOk.add(fl.id);
                        await frissitAdatbol(r.rows[0], fl.d, job);
                    }
                } else {
                    await egyHirdetes(fl.d.link, { varos, tipus: fl.d.tipus, ugylet: fl.d.ugylet }, job, meglevo, fl.d);
                }
            } catch (err) {
                job.hibak++;
                naplo(job, { url: fl.d.link, eredmeny: "hiba", uzenet: err.message });
            }
            job.kesz++;
        }

        // A teljes listákból hiányzó (ennek az oldalnak a linkjével bent lévő) hirdetések
        for (const c of e.csoportok) {
            if (c.teljes) await kozvetlenHianyzok(f, varos, c, e.elemek, job);
            else naplo(job, { eredmeny: "nem_teljes", uzenet: `${f} – ${c.tipus} / ${c.ugylet}: a lista nem teljes (${c.kapott || "?"} / ${c.ossz || "?"}), a hiányzókat most nem veszem le.` });
        }

        // sikeres olvasás listánként (az Imoradar24 ezeket az oldalakat ott már nem veszi fel újként)
        if (!e.hiba) for (const c of e.csoportok) await forrasSorrend.keszJelol(f, varos, c.tipus, c.ugylet).catch(() => null);

    }

}

async function kozvetlenHianyzok(forras, varos, c, elemek, job) {

    const host = `${forras}.ro/`;
    const r = await db.query(`
        SELECT id, link, tovabbi_linkek, kulso_azon FROM ingatlanok
        WHERE statusz = 'aktiv' AND forras_tipus = 'import'
          AND (varos = $1 OR varos_eredeti = $1 OR varos IN (SELECT nev FROM varosok WHERE anyavaros = $1))
          AND COALESCE(tipus, 'lakas') = $2 AND COALESCE(ugylet, 'elado') = $3
          AND link ILIKE '%' || $4 || '%'`, [varos, c.tipus, c.ugylet, host]);
    if (!r.rows.length) return;

    const latott = new Set();
    elemek.filter(d => d.tipus === c.tipus && d.ugylet === c.ugylet).forEach(d => elemKulcsok(d).forEach(k => latott.add(k)));
    // a többi csoportban látottak is (pl. egy rosszul besorolt hirdetés) – azt sem vesszük le
    elemek.forEach(d => elemKulcsok(d).forEach(k => latott.add(k)));

    // Csak a fő link számít: ha ennek az oldalnak a hirdetése (a fő link) eltűnt, de a
    // hirdetés más oldalon is fent van, a nemElerhetoJelol a másik oldalra teszi át
    const hianyzik = r.rows.filter(i =>
        !linkKulcsok(i.link).some(k => latott.has(k)) &&
        !(Array.isArray(i.kulso_azon) ? i.kulso_azon : []).some(k => latott.has(k)));

    if (!hianyzik.length) return;

    if (hianyzik.length > Math.max(10, r.rows.length * 0.35)) {
        naplo(job, { eredmeny: "egyenkent", uzenet: `${forras} – ${c.tipus} / ${c.ugylet}: ${hianyzik.length} hirdetés hiányzik a listából (${r.rows.length}-ból) – egyenként ellenőrzöm őket.` });
        await egyenkentJelol(hianyzik, job);
        return;
    }

    for (const i of hianyzik) await nemElerhetoJelol(i.id, job, i.link, "nincs_a_listaban");

}

function kozvetlenIndit(varosok, opts = {}) {
    const job = ujJob("kozvetlen");
    job.varosok = varosok;
    job.promise = (async () => {
        try {
            for (const v of varosok) await kozvetlenFuttat(job, v, opts);
            await utoMunka(job);
            job.allapot = "kesz";
        } catch (e) {
            job.allapot = "hiba";
            naplo(job, { eredmeny: "hiba", uzenet: e.message });
        }
        job.vege = new Date().toISOString();
        return job;
    })();
    return job;
}

// ---------- meglévő hirdetések figyelése ----------

async function nemElerhetoJelol(id, job, url, ok) {

    // Ha a hirdetés más oldalon is fent van (a további linkek között ott egy másik oldal
    // hirdetése), nem vesszük le: a levett link helyett a következő oldal lesz a fő link
    // (a forrás-sorrend szerint), és a következő ellenőrzés elsőként azt nézi meg
    const r = await db.query("SELECT id, link, tovabbi_linkek, kulso_azon FROM ingatlanok WHERE id = $1", [id]).catch(() => ({ rows: [] }));
    const i = r.rows[0];
    if (i) {
        const halott = normLink(url || i.link);
        const tovabbi = (Array.isArray(i.tovabbi_linkek) ? i.tovabbi_linkek : []).filter(Boolean);
        const masik = tovabbi.filter(l => normLink(l) !== halott && forrasHely.kozvetlenHirdetes(l));
        if (halott && halott !== normLink(i.link) && tovabbi.some(l => normLink(l) === halott)) {
            // csak egy mellék-link halt meg: kivesszük, a hirdetés marad
            await db.query("UPDATE ingatlanok SET tovabbi_linkek = $2::jsonb, updated_at = NOW() WHERE id = $1",
                [id, JSON.stringify(tovabbi.filter(l => normLink(l) !== halott))]);
            naplo(job, { url, eredmeny: "mellek_link_ki", id });
            return;
        }
        if (masik.length) {
            const { sorrend } = await forrasSorrend.olvas();
            const uj = forrasSorrend.legjobb(masik, sorrend);
            const azon = new Set(Array.isArray(i.kulso_azon) ? i.kulso_azon : []);
            linkKulcsok(i.link).forEach(k => azon.add(k));
            await db.query(
                `UPDATE ingatlanok SET link = $2, tovabbi_linkek = $3::jsonb, kulso_azon = $4::jsonb, forras_nev = $5,
                        kozvetito = NULL, forras_kereso = NULL, utolso_ellenorzes = NULL, updated_at = NOW() WHERE id = $1`,
                [id, uj, JSON.stringify(tovabbi.filter(l => normLink(l) !== normLink(uj) && normLink(l) !== halott)), JSON.stringify([...azon]), forrasHely.forrasKulcs(null, uj)]);
            job.frissitett++;
            naplo(job, { url, eredmeny: "masik_forras", id, uj });
            return;
        }
    }

    await db.query(
        "UPDATE ingatlanok SET statusz = 'nem_elerheto', utolso_ellenorzes = NOW(), updated_at = NOW() WHERE id = $1 AND statusz <> 'nem_elerheto'",
        [id]
    );

    job.nemElerheto++;
    naplo(job, { url, eredmeny: "nem_elerheto", id, ok: ok || null });

}

// Egy hirdetés frissítése a forrásoldalról: ár, elérhetőség, hiányzó adatok, képek
async function frissitForrasbol(i, job) {

    let d;

    try {
        d = await scrape(i.link);
    } catch (e) {
        // Az imobiliare.ro letiltja a szervert: a város Imoradar24-es listájából frissítünk
        if (/HTTP 403/.test(e.message) && /imobiliare\.ro/i.test(i.link)) {
            const volt = job.frissitett + job.kihagyott + job.nemElerheto;
            const varos = (await kornyek.anyaVarosa(i.varos).catch(() => null)) || i.varos;
            await varosSzinkron([{ varos, tipus: i.tipus || "lakas", ugylet: i.ugylet || "elado" }], job, { csakMeglevo: true });
            await db.query("UPDATE ingatlanok SET utolso_ellenorzes = NOW() WHERE id = $1", [i.id]);
            if (job.frissitett + job.kihagyott + job.nemElerheto === volt) throw new Error(tiltasUzenet(i.link, 403));
            return;
        }
        // Az OLX oldala letiltja a szervert: az OLX API-ja a hirdetés számazonosítójával
        if (tiltasHiba(e) && /olx\.ro/i.test(i.link)) {
            const id = (Array.isArray(i.kulso_azon) ? i.kulso_azon : []).map(k => (/^olxid:(\d+)$/.exec(String(k)) || [])[1]).find(forrasHely.olxIdJo);
            const a = id ? await forrasHely.olxAllapot(id) : null;
            if (a && a.aktiv === false) { await nemElerhetoJelol(i.id, job, i.link, "forras_szerint"); return; }
            if (a && a.aktiv) {
                if (job.kozvetlenOk) job.kozvetlenOk.add(i.id);
                await frissitAdatbol(i, { ...a.adat, link: i.link, elerheto: true, forrasok: {} }, job);
                return;
            }
        }
        throw e;
    }

    // A saját oldalán fent van: a közvetítő listájából hiányzása ezt nem írja felül
    if (d.elerheto !== false && job.kozvetlenOk) job.kozvetlenOk.add(i.id);

    await frissitAdatbol(i, d, job);

}

async function frissitAdatbol(i, d, job) {

    if (d.elerheto === false) {
        await nemElerhetoJelol(i.id, job, i.link);
        return;
    }

    const valtozas = [];

    // Csak üres mezőt töltünk ki – amit az admin beírt, azt nem írjuk felül
    const potol = {};
    const ures = v => v === null || v === undefined || v === "";

    // Ugyanaz az ingatlan több oldalon is fent lehet, kicsit más árral (pl. lejben adva):
    // az árat és a képeket csak a fő link oldaláról vesszük, különben minden beolvasás
    // ide-oda írná (és a kedvencek "árváltozás" értesítője is hamisan szólna)
    const foOldal = !d.kozvetlenForras || forrasHely.kozvetitoOldal(i.link) || normLink(d.link) === normLink(i.link);
    if (foOldal && d.ar && Math.abs((i.ar || 0) - d.ar) >= 1) { potol.ar = d.ar; valtozas.push("ar"); }
    if (ures(i.nm) && d.nm) potol.nm = d.nm;
    if (ures(i.szobak) && d.szobak) potol.szobak = d.szobak;
    if (ures(i.emelet) && d.emelet) potol.emelet = d.emelet;
    if (ures(i.allapot) && d.allapot) { potol.allapot = d.allapot; potol.allapot_forras = "szoveg"; }
    if (ures(i.cim) && d.cim) potol.cim = d.cim;
    if (ures(i.leiras) && d.leiras) potol.leiras = d.leiras;
    if (ures(i.telek_nm) && d.telek_nm) potol.telek_nm = d.telek_nm;
    if (ures(i.evszam) && d.evszam) potol.evszam = d.evszam;
    if (d.forrasSzoveg && (ures(i.forras_szoveg) || !(d.forrasok && d.forrasok.osszes === "kereses"))) potol.forras_szoveg = d.forrasSzoveg;
    if (d.kerulet) potol.forras_kerulet = d.kerulet;
    // Képek: ha eddig nem volt, vagy most több van
    const regiKepek = Array.isArray(i.kulso_kepek) ? i.kulso_kepek : [];
    if (d.kulso_kepek && d.kulso_kepek.length && (!regiKepek.length || (foOldal && d.kulso_kepek.length >= regiKepek.length))) {
        potol.kulso_kepek = JSON.stringify(d.kulso_kepek);
        if (!regiKepek.length) valtozas.push("kepek");
    }

    // A forrás további linkjei (ugyanaz a hirdetés több oldalon)
    // A közvetítő link helyett a valódi forrás (ha eddig nem sikerült, most újra próbáljuk)
    // A forrás most közvetlen linket ad (az Imoradar24 helyett): azonnal arra cseréljük
    if (forrasHely.kozvetitoOldal(i.link) && d.link && !forrasHely.kozvetitoOldal(d.link)) {
        potol.link = d.link;
        potol.kozvetito = null;
        potol.forras_kereso = null;
        const fk = forrasHely.forrasKulcs(null, d.link);
        if (fk) potol.forras_nev = fk;
        valtozas.push("link");
    } else if (forrasHely.kozvetitoOldal(i.link) && forrasHely.kozvetitoLink(d.link)) {
        await forrasHely.gazdagit(d, await forrasHelyAdat(i.varos)).catch(() => null);
        if (d.valodiForras && d.link && !forrasHely.kozvetitoOldal(d.link)) {
            potol.link = d.link;
            potol.kozvetito = null;
            potol.forras_kereso = null;
            valtozas.push("link");
        } else {
            if (forrasHely.kozvetitoLink(i.link) && d.reszletUrl) {
                // A régi "link-extern" link (bejelentkezés nélkül nem visz tovább) helyett az adatlap
                potol.link = d.reszletUrl;
                potol.kozvetito = "imoradar24";
            }
            // a látogató a forrásoldal szűrt keresésére megy (nem az Imoradar24-re)
            if (d.forrasKereso && d.forrasKereso !== i.forras_kereso) potol.forras_kereso = d.forrasKereso;
        }
        if (d.forrasKulcs && d.forrasKulcs !== i.forras_nev) potol.forras_nev = d.forrasKulcs;
        if (ures(i.leiras) && d.leiras) potol.leiras = d.leiras;
    }

    // Még mindig a közvetítőre (Imoradar24) mutat, de a további linkek között ott az eredeti
    // hirdetés: az lesz a fő link (a látogató egyből a hirdetésre megy)
    if (forrasHely.kozvetitoOldal(potol.link || i.link)) {
        const jelolt = [...(d.tovabbi_linkek || []), ...(i.tovabbi_linkek || [])].find(forrasHely.kozvetlenHirdetes);
        if (jelolt) {
            potol.link = jelolt;
            potol.kozvetito = null;
            potol.forras_kereso = null;
            const fk = forrasHely.forrasKulcs(null, jelolt);
            if (fk) potol.forras_nev = fk;
            if (!valtozas.includes("link")) valtozas.push("link");
        }
    }

    const aktLink = potol.link || i.link;
    const tovabbi = [...new Set([...(i.tovabbi_linkek || []), ...(d.tovabbi_linkek || []), d.link]
        .filter(l => l && !forrasHely.kozvetitoOldal(l) && normLink(l) !== normLink(aktLink)))];
    const regiTovabbi = i.tovabbi_linkek || [];
    if (tovabbi.length !== regiTovabbi.length || tovabbi.some((l, n) => l !== regiTovabbi[n])) potol.tovabbi_linkek = JSON.stringify(tovabbi);

    // A közvetítő azonosítói (a következő beolvasás így is felismeri)
    {
        const azon = kulsoAzon(d, i.kulso_azon);
        if (potol.link && forrasHely.kozvetitoOldal(i.link)) linkKulcsok(i.link).forEach(k => { if (!azon.includes(k)) azon.push(k); });
        if (azon.length !== (i.kulso_azon || []).length) potol.kulso_azon = JSON.stringify(azon);
    }

    // A forrásoldal pontos helye – ha pontosabb, mint a mostani (az ember által
    // letett helyhez nem nyúlunk)
    if (d.forrasHely && d.x && d.y && jobbHely(i, d.forrasHely)) {
        potol.x = d.x;
        potol.y = d.y;
        potol.hely_pontossag = d.forrasHely.hely_pontossag;
        potol.hely_sugar = d.forrasHely.hely_sugar;
        potol.hely_forras = "forras";
        valtozas.push("hely");
    }

    // Ami még mindig hiányzik: a szövegből (kerület, település, telek, hely...)
    {
        const alap = { ...i, ...potol, forras_kerulet: potol.forras_kerulet || i.forras_kerulet };
        if (typeof alap.tovabbi_linkek === "string") alap.tovabbi_linkek = JSON.parse(alap.tovabbi_linkek);
        if (typeof alap.kulso_azon === "string") alap.kulso_azon = JSON.parse(alap.kulso_azon);
        if (typeof alap.kulso_kepek === "string") alap.kulso_kepek = d.kulso_kepek;
        const v = await autofix.javaslat(alap, { utca: d.utca, varosForras: d.varosForras });
        Object.keys(v).forEach(k => { if (!(k in potol)) potol[k] = v[k]; });
        if (Object.keys(v).some(k => !["hely_pontossag", "arnm"].includes(k))) valtozas.push("auto");
        potol.auto_javitva = new Date();
        potol.auto_javitva_v = autofix.VERZIO;
        if (potol.hely_eredeti && typeof potol.hely_eredeti === "object") potol.hely_eredeti = JSON.stringify(potol.hely_eredeti);
    }

    const uj = { ...i, ...potol };
    uj.kulso_kepek = potol.kulso_kepek ? d.kulso_kepek : i.kulso_kepek;

    const q = await quality.ertekel(uj, { jovahagyva: i.jovahagyva });

    potol.hianyzo = JSON.stringify(q.hianyzo);
    potol.problemak = JSON.stringify(q.problemak);
    potol.ellenorzott = q.ellenorzott;

    // Ha korábban nem volt elérhető, de most újra fent van
    if (i.statusz === "nem_elerheto") potol.statusz = "aktiv";

    if (uj.ar > 0 && uj.nm > 0) potol.arnm = uj.ar / uj.nm;

    const kulcsok = Object.keys(potol);
    const sets = kulcsok.map((k, idx) => `${k} = $${idx + 1}${["kulso_kepek", "hianyzo", "problemak", "tovabbi_linkek", "hely_eredeti", "kulso_azon"].includes(k) ? "::jsonb" : ""}`);

    const params = kulcsok.map(k => potol[k]);
    params.push(i.id);

    await db.query(
        `UPDATE ingatlanok SET ${sets.join(", ")}, utolso_ellenorzes = NOW(), updated_at = NOW() WHERE id = $${kulcsok.length + 1}`,
        params
    );

    if (i.statusz === "nem_elerheto") {
        job.frissitett++;
        naplo(job, { url: i.link, eredmeny: "ujra_elerheto", id: i.id });
    } else if (valtozas.includes("ar")) {
        job.frissitett++;
        naplo(job, { url: i.link, eredmeny: "ar_frissitve", id: i.id, regi: i.ar, uj: d.ar });
    } else if (valtozas.length) {
        job.frissitett++;
        naplo(job, { url: i.link, eredmeny: "frissitve", id: i.id, mi: valtozas });
    } else {
        job.kihagyott++;
        naplo(job, { url: i.link, eredmeny: "rendben", id: i.id, problemak: q.problemak, hianyzo: q.hianyzo });
    }

}

// ---------- Imoradar24 városi listák (az imobiliare-hirdetések frissítéséhez) ----------

// Imoradar24 városnév a keresési linkhez
const IMORADAR_VAROS = {
    Sepsiszentgyorgy: "judetul-covasna/sfantu-gheorghe",
    Kezdivasarhely: "judetul-covasna/targu-secuiesc",
    Kovaszna: "judetul-covasna/covasna",
    Baroth: "judetul-covasna/baraolt",
    Csikszereda: "judetul-harghita/miercurea-ciuc",
    Szekelyudvarhely: "judetul-harghita/odorheiu-secuiesc",
    Gyergyoszentmiklos: "judetul-harghita/gheorgheni",
    Brasso: "judetul-brasov/brasov",
    Marosvasarhely: "judetul-mures/targu-mures",
    Kolozsvar: "judetul-cluj/cluj-napoca",
    Deva: "deva"
};

const IMORADAR_TIPUS = { lakas: "apartamente", haz: "case", telek: "terenuri", kereskedelmi: "spatii-comerciale", iroda: "birouri" };

function imoradarLink(varos, tipus, ugylet) {
    const kat = IMORADAR_TIPUS[tipus];
    if (!kat || !varos) return null;
    const hely = IMORADAR_VAROS[varos] || quality.ekezetNelkul(varos).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
    return `https://www.imoradar24.ro/${kat}-de-${ugylet === "kiado" ? "inchiriat" : "vanzare"}/${hely}`;
}

async function varosSzinkron(csoportok, job, opts = {}) {

    const lattam = new Set();

    for (const c of csoportok) {

        const url = imoradarLink(c.varos, c.tipus, c.ugylet);
        if (!url || lattam.has(url)) continue;
        lattam.add(url);

        naplo(job, { url, eredmeny: "lista_szinkron" });

        // A lista végéig olvasunk (egy nagyvárosban – pl. Marosvásárhely – több ezer hirdetés
        // van; korábban az első 20 oldal / 400 hirdetés után megállt, így a régebbi
        // hirdetéseinket meg sem találta, és a linkjük sem javult)
        await futtat(job, [url], { varos: c.varos, tipus: c.tipus, ugylet: c.ugylet }, { maxOldal: 300, maxHirdetes: 9000, ...opts });

        job.allapot = "fut";
        job.vege = null;

    }

}

// Egy város és a hozzá tartozó "<város> és környéke" város(ok) neve
async function varosCsoport(varos) {
    const nevek = new Set([].concat(varos || []).map(v => String(v).trim()).filter(Boolean));
    if (!nevek.size) return null;
    const r = await db.query("SELECT nev FROM varosok WHERE anyavaros = ANY($1::text[])", [[...nevek]]).catch(() => ({ rows: [] }));
    r.rows.forEach(x => nevek.add(x.nev));
    return [...nevek];
}

//  opts.ids:      csak ezek a hirdetések
//  opts.varosok:  csak ezekben a városokban (teljes ellenőrzés: minden hirdetésük, a város
//                 Imoradar24-listája a végéig, utána a még hiányzó eredeti linkek keresése)
//  opts.limit:    legfeljebb ennyi hirdetés (városra indítva alapból mind)
async function figyelesFuttat(job, opts) {

    try {

        const felt = ["link IS NOT NULL", "link <> ''", "statusz IN ('aktiv', 'nem_elerheto', 'fuggo')"];
        const params = [];

        if (opts.ids && opts.ids.length) {
            params.push(opts.ids);
            felt.push(`id = ANY($${params.length}::int[])`);
        }

        const teljesVaros = !!(opts.varosok && opts.varosok.length);
        if (teljesVaros) {
            params.push(opts.varosok);
            felt.push(`(varos = ANY($${params.length}::text[]) OR varos_eredeti = ANY($${params.length}::text[]))`);
            job.varosok = opts.varosok;
        }

        // Csak egy forrásoldal hirdetései (pl. --forras imobiliare a gépről indítva)
        if (opts.forras) {
            params.push(String(opts.forras).replace(/[^a-z0-9.-]/gi, ""));
            felt.push(`link ILIKE '%' || $${params.length} || '%'`);
        }

        params.push(opts.limit || (teljesVaros || opts.forras ? 20000 : 100));

        // Amit már tudunk: az Imoradar24-re mutató hirdetés további linkjei között ott az
        // eredeti hirdetés -> az lesz a fő link (így ebben a futásban már azt nézzük meg)
        if (teljesVaros) await forrasHely.ismertLinkElore(opts.varosok).catch(e => console.error("Ismert link előre:", e.message));

        const r = await db.query(`
            SELECT * FROM ingatlanok
            WHERE ${felt.join(" AND ")}
            ORDER BY utolso_ellenorzes NULLS FIRST, id
            LIMIT $${params.length}
        `, params);

        // Csak értelmes linkek (a hibás adatsorokat kihagyjuk)
        let lista = r.rows.filter(i => /^https?:\/\//.test(i.link) && (isListingUrl(i.link) || /imoradar24\.ro\//i.test(i.link) || forrasHely.kozvetlenHirdetes(i.link)));

        // Ebben a futásban a saját oldalukon fent látott hirdetések (a közvetítő listájából
        // hiányzásuk miatt nem jelöljük őket "nem elérhető"-nek)
        job.kozvetlenOk = new Set();

        // 0) Városra indítva: az OLX és a Storia saját listája (egy-két kérés a városra –
        //    a benne lévő hirdetéseink frissülnek, a teljes listából hiányzók lekerülnek);
        //    amit itt fent láttunk, azt alább már nem kell egyenként megnyitni
        if (teljesVaros && !opts.kozvetlenNelkul) {
            const anyak = new Set();
            for (const v of opts.varosok) anyak.add((await kornyek.anyaVarosa(v).catch(() => null)) || v);
            for (const v of anyak) {
                await kozvetlenFuttat(job, v, { csakMeglevo: true }).catch(e => naplo(job, { eredmeny: "hiba", uzenet: "Közvetlen: " + e.message }));
            }
            lista = lista.filter(i => !job.kozvetlenOk.has(i.id));
            // a már levett (közben "nem elérhető"-re jelölt) hirdetésekkel sincs dolgunk
            const most = new Set((await db.query("SELECT id FROM ingatlanok WHERE id = ANY($1::int[]) AND statusz IN ('aktiv','nem_elerheto','fuggo')", [lista.map(i => i.id)])).rows.map(x => x.id));
            lista = lista.filter(i => most.has(i.id));
        }

        // Az imobiliare.ro letiltja a szervert: az ilyen hirdetéseket a város
        // Imoradar24-es listájából frissítjük (ár, képek, adatok), és ami
        // már nincs a listában, azt "nem elérhető"-nek jelöljük
        // (ugyanígy az Imoradar24-re mutató régi hirdetések: a lista forrás-azonosítóiból
        // így megkapják az eredeti OLX / Storia / … linket – services/forrasHely.js)
        // A gépről futtatva (scripts/helyi-ellenorzes.js) az imobiliare.ro sem tilt le:
        // ott az imobiliare-s hirdetéseket is közvetlenül nézzük meg, csak az
        // Imoradar24-re mutatókat a listából
        const listasLink = i => opts.helyi ? /imoradar24\.ro/i.test(i.link) : /imobiliare\.ro|imoradar24\.ro/i.test(i.link);
        const imoradarbol = i => (Array.isArray(i.kulso_azon) ? i.kulso_azon : []).some(k => /imoradar24\.ro\//i.test(String(k)));

        // A város listáját akkor is végigolvassuk, ha a hirdetés már az eredeti oldalra mutat,
        // de az Imoradar24-ről jött (városra indított teljes ellenőrzésnél): ha a forrásoldal
        // letiltja a szervert, a listából derül ki, hogy levették-e
        const listaCsoport = lista.filter(i => listasLink(i) || (teljesVaros && imoradarbol(i)));
        const kozvetlen = lista.filter(i => !listasLink(i));

        job.osszes += kozvetlen.length;
        job.allapot = "fut";

        // 1) Az eredeti oldalukra mutató hirdetések: egyenként a forrásoldalon
        // Ha egy oldal sorban többször letilt (403 / 429), a többi hirdetését most
        // nem próbáljuk (csak terhelnénk, és még jobban letiltana) – a következő
        // ellenőrzés újra megpróbálja őket. A hirdetések addig változatlanok.
        const tiltasSor = new Map();      // oldal -> egymás utáni letiltások
        const letiltott = new Set();
        const TILTAS_HATAR = 3;

        for (const i of kozvetlen) {

            const oldal = oldalNev(i.link);

            if (letiltott.has(oldal)) {
                job.letiltva++;
                job.kesz++;
                continue;
            }

            try {
                await frissitForrasbol(i, job);
                tiltasSor.set(oldal, 0);
            } catch (e) {
                if (tiltasHiba(e)) {
                    // Letiltás: nem a hirdetés hibája – az ellenőrzés idejét nem állítjuk,
                    // így legközelebb elsőként próbálja újra
                    job.letiltva++;
                    const n = (tiltasSor.get(oldal) || 0) + 1;
                    tiltasSor.set(oldal, n);
                    if (n >= TILTAS_HATAR) {
                        letiltott.add(oldal);
                        const marad = kozvetlen.filter(x => oldalNev(x.link) === oldal).length;
                        naplo(job, { url: i.link, eredmeny: "letiltva", uzenet: `${tiltasUzenet(i.link, Number((/HTTP (\d+)/.exec(e.message) || [])[1]) || 403)} (${oldal}: a többi hirdetése – összesen ${marad} – most kimarad${teljesVaros ? ", az Imoradar24-ről jötteket a lista alapján nézzük meg" : ""})` });
                    } else {
                        naplo(job, { url: i.link, eredmeny: "letiltva", uzenet: tiltasUzenet(i.link, Number((/HTTP (\d+)/.exec(e.message) || [])[1]) || 403), id: i.id });
                    }
                } else {
                    job.hibak++;
                    naplo(job, { url: i.link, eredmeny: "hiba", uzenet: e.message, id: i.id });
                    await db.query("UPDATE ingatlanok SET utolso_ellenorzes = NOW() WHERE id = $1", [i.id]);
                }
            }

            job.kesz++;

            await sleep(KESLELTETES);

        }

        // 2) A városok Imoradar24-listái (a végéig): az imobiliare-s és Imoradar24-re mutató
        //    hirdetések frissítése, az eredeti linkjük, és ami már nincs a listában: "nem elérhető"
        if (listaCsoport.length) {

            const csoportok = new Map();
            for (const i of listaCsoport) {
                // A környék-város hirdetései az anyaváros listájában vannak a forrásoldalon
                const varos = (await kornyek.anyaVarosa(i.varos).catch(() => null)) || i.varos_eredeti || i.varos;
                const c = { varos, tipus: i.tipus || "lakas", ugylet: i.ugylet || "elado" };
                csoportok.set(`${c.varos}|${c.tipus}|${c.ugylet}`, c);
            }

            job.allapot = "fut";

            // FONTOS: itt csak a meglévő hirdetéseket frissítjük (ár, képek,
            // elérhetőség) – új hirdetést a város listájából NEM veszünk fel.
            // Az ellenőrzés idejét a frissítés / a "nem elérhető" jelölés állítja be.
            await varosSzinkron([...csoportok.values()], job, { csakMeglevo: true, teljesVaros });

        }

        // 3) (2026-11-12 óta kikapcsolva) Az Imoradar24-ről jött hirdetés az Imoradar24-re
        //    mutat – nem keressük meg más oldalakon (nem kerüljük meg az Imoradar24-et).
        //    Ami közvetlenül is megvan (OLX / Publi24 saját listájából), az úgyis ott van.
        if (false && teljesVaros && !opts.forraslinkNelkul) {
            job.allapot = "fut";
            naplo(job, { eredmeny: "forraslinkek" });
            const e = await forrasHely.javitMind({ limit: 5000, varosok: opts.varosok, csakAdat: true }).catch(x => ({ hiba: x.message }));
            job.forraslinkek = e;
            const meg = await db.query(`SELECT COUNT(*)::int AS n FROM ingatlanok WHERE statusz = 'aktiv' AND link ~* 'imoradar24\\.ro/'
                AND (varos = ANY($1::text[]) OR varos_eredeti = ANY($1::text[]))`, [opts.varosok]).catch(() => ({ rows: [{ n: null }] }));
            job.forrasNelkul = meg.rows[0].n;
        }

        job.allapot = "kesz";

    } catch (e) {

        job.allapot = "hiba";
        naplo(job, { eredmeny: "hiba", uzenet: e.message });

    }

    job.vege = new Date().toISOString();

    return job;

}

function figyelesIndit(opts = {}) {
    const job = ujJob("figyeles");
    job.promise = figyelesFuttat(job, opts);
    return job;
}

// ---------- figyelt találati listák ----------

async function figyeltFuttat(ids, opts = {}) {

    const r = ids
        ? await db.query("SELECT * FROM figyelt_oldalak WHERE id = ANY($1::int[]) ORDER BY id", [ids])
        : await db.query("SELECT * FROM figyelt_oldalak ORDER BY id");

    const eredmenyek = [];

    // A figyelt oldalak városainak közvetlen (OLX, Storia) beolvasása előbb – így az Imoradar24
    // listájából ezeknek az oldalaknak a hirdetései már nem jönnek (közvetítő nélkül vannak bent)
    const varosok = [...new Set(r.rows.map(f => f.varos).filter(Boolean))];
    if (varosok.length && !(opts && opts.kozvetlenNelkul)) {
        const anyak = new Set();
        for (const v of varosok) anyak.add((await kornyek.anyaVarosa(v).catch(() => null)) || v);
        const kj = kozvetlenIndit([...anyak]);
        await kj.promise;
        eredmenyek.push({ kozvetlen: true, jobId: kj.id, osszegzes: `${kj.uj} új, ${kj.frissitett} frissítve, ${kj.nemElerheto} levéve, ${kj.hibak} hiba` });
    }

    for (const f of r.rows) {

        const job = indit([f.url], { varos: f.varos, tipus: f.tipus, ugylet: f.ugylet });

        await job.promise;

        const osszegzes = `${job.uj} új, ${job.frissitett} árváltozás, ${job.kihagyott} már megvolt, ${job.hibak} hiba`;

        await db.query(
            "UPDATE figyelt_oldalak SET utolso_futas = NOW(), utolso_eredmeny = $1 WHERE id = $2",
            [osszegzes, f.id]
        );

        eredmenyek.push({ id: f.id, jobId: job.id, osszegzes });

    }

    return eredmenyek;

}

module.exports = { indit, allapot, figyeltFuttat, figyelesIndit, frissitForrasbol, ujJob, imoradarLink, varosCsoport, kozvetlenIndit,
    kozvetlenFuttat, futtat, kihagyBeallit, utoMunka, naplo, forrasHelyAdat, IMORADAR_VAROS, IMORADAR_TIPUS, _teszt: { linkKulcsok, elemKulcsok, listaAlap, imoradarAdatlap } };
