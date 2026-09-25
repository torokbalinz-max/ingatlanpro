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
//  Figyelés (admin gomb vagy napi időzítés):
//   - a meglévő hirdetések forrásoldalát újra megnézzük
//   - ha eladták / törölték: "nem elérhető" lesz (eltűnik a
//     nyilvános oldalról, az admin felületen jelenik meg)
//   - hiányzó adatokat, képeket pótolja
// ============================================================

const db = require("./database");
const { scrape, fetchPage, extractListingLinks, extractSearchItems, isListingUrl, pageUrl } = require("./scraper");
const { geocode } = require("./geocode");
const { normalize, normLink } = require("./listing");
const quality = require("./quality");

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
    if (d.imoId) k.push("imo:" + d.imoId);
    return [...new Set(k)];
}

async function meglevoLinkek() {

    const r = await db.query("SELECT id, link, ar, statusz, tovabbi_linkek FROM ingatlanok");
    const m = new Map();

    r.rows.forEach(i => {
        [i.link, ...(i.tovabbi_linkek || [])].forEach(l => {
            linkKulcsok(l).forEach(k => { if (!m.has(k)) m.set(k, i); });
        });
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

// Egy beolvasott hirdetés adatainak előkészítése mentéshez
async function elokeszit(d, alap) {

    const kerulet = await quality.keruletKeres(alap.varos, d.kerulet, d.utca, d.cim);

    const adat = normalize({
        ...d,
        tipus: d.tipus || alap.tipus,
        ugylet: d.ugylet || alap.ugylet,
        varos: alap.varos,
        kerulet
    });

    adat.forras_kerulet = d.kerulet || null;
    adat.forras_szoveg = d.forrasSzoveg || null;
    adat.evszam = d.evszam || null;

    // Pontos hely híján közelítő hely az utcából / környékből
    if (!(adat.x && adat.y)) {

        const hely = await geocode(d.cimSzoveg || d.kerulet || kerulet || "", alap.varos);

        if (hely) {
            adat.x = hely.x;
            adat.y = hely.y;
            adat.hely_pontossag = hely.szint;
        }

    }

    return adat;

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

    const adat = await elokeszit(d, alap);
    const q = await quality.ertekel(adat);

    const r = await db.query(`
        INSERT INTO ingatlanok
        (link, ar, nm, arnm, szobak, emelet, allapot, eladva, x, y, varos, kerulet,
         tipus, ugylet, cim, leiras, telek_nm, statusz, forras_tipus, hely_pontossag,
         kulso_kepek, hianyzo, problemak, ellenorzott, forras_szoveg, forras_kerulet, evszam,
         tovabbi_linkek, utolso_ellenorzes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11,$12,$13,$14,$15,$16,'aktiv','import',$17,
                $18::jsonb,$19::jsonb,$20::jsonb,$21,$22,$23,$24,$25::jsonb,NOW())
        RETURNING id
    `, [
        d.link, adat.ar, adat.nm, adat.arnm, adat.szobak, adat.emelet, adat.allapot,
        adat.x, adat.y, adat.varos, adat.kerulet, adat.tipus, adat.ugylet,
        adat.cim, adat.leiras, adat.telek_nm, adat.hely_pontossag,
        JSON.stringify(d.kulso_kepek || []), JSON.stringify(q.hianyzo), JSON.stringify(q.problemak),
        q.ellenorzott, adat.forras_szoveg, adat.forras_kerulet, adat.evszam,
        JSON.stringify(d.tovabbi_linkek || [])
    ]);

    const uj = { id: r.rows[0].id, link: d.link, ar: adat.ar };
    kulcsok.forEach(k => meglevo.set(k, uj));

    job.uj++;
    naplo(job, { url: d.link, eredmeny: "uj", id: uj.id, hianyzo: q.hianyzo, problemak: q.problemak });

}

// Egy találati lista összes oldala.
// Imoradar24-en a listában minden adat benne van ("elemek"),
// máshol csak a hirdetések linkjeit gyűjtjük ("linkek").
// "teljes": a lista végéig eljutottunk (nem a korlát állított meg).
async function listaOldalak(url, job, maxOldal = MAX_OLDAL) {

    const elemek = new Map();
    const linkek = new Set();
    let teljes = false;

    for (let oldal = 1; oldal <= maxOldal; oldal++) {

        const u = oldal === 1 ? url : pageUrl(url, oldal);

        let p;

        try {
            p = await fetchPage(u);
        } catch (e) {
            naplo(job, { url: u, eredmeny: "hiba", uzenet: e.message });
            break;
        }

        if (p.status >= 400) {
            naplo(job, { url: u, eredmeny: "hiba", uzenet: tiltasUzenet(u, p.status) });
            break;
        }

        const elotte = elemek.size + linkek.size;

        const talalt = extractSearchItems(p.html);

        if (talalt.length) {
            talalt.forEach(d => { if (!elemek.has(normLink(d.link))) elemek.set(normLink(d.link), d); });
        } else {
            extractListingLinks(p.html, p.finalUrl || u).forEach(l => linkek.add(l));
        }

        const ujDb = elemek.size + linkek.size - elotte;

        naplo(job, { url: u, eredmeny: "lista", db: talalt.length || ujDb });

        // Nincs új hirdetés ezen az oldalon: vége a listának
        if (ujDb === 0) { teljes = true; break; }

        if (elemek.size + linkek.size >= MAX_HIRDETES) break;

        await sleep(KESLELTETES);

    }

    return { elemek: [...elemek.values()], linkek: [...linkek], teljes };

}

function tiltasUzenet(url, status) {
    if (status === 403 && /imobiliare\.ro/i.test(url)) {
        return "HTTP 403 – az imobiliare.ro letiltja a szervert. Használd ugyanennek a keresésnek az Imoradar24-es linkjét (ott minden imobiliare hirdetés benne van).";
    }
    return `HTTP ${status}`;
}

// Egy teljesen végigolvasott találati listából hiányzó imobiliare-hirdetések:
// ezeket eladták / levették → "nem elérhető" (az admin visszaállíthatja)
async function hianyzokJelol(latottKulcsok, alap, job, elemDb) {

    if (!alap.varos || !alap.tipus || !alap.ugylet || elemDb < 10) return;

    const r = await db.query(`
        SELECT id, link, tovabbi_linkek FROM ingatlanok
        WHERE statusz = 'aktiv' AND varos = $1
          AND COALESCE(tipus, 'lakas') = $2 AND COALESCE(ugylet, 'elado') = $3
          AND link ILIKE '%imobiliare.ro/%oferta/%'
    `, [alap.varos, alap.tipus, alap.ugylet]);

    const hianyzik = r.rows.filter(i =>
        ![i.link, ...(i.tovabbi_linkek || [])].some(l => linkKulcsok(l).some(k => latottKulcsok.has(k)))
    );

    if (!hianyzik.length) return;

    // Biztonsági fék: ha szinte minden eltűnne, valószínűleg a lista hibás
    if (r.rows.length >= 10 && hianyzik.length > r.rows.length * 0.9) {
        naplo(job, { eredmeny: "hiba", uzenet: `Túl sok hiányzó hirdetés (${hianyzik.length}/${r.rows.length}) – nem jelöltem őket, ellenőrizd a keresési linket.` });
        return;
    }

    for (const i of hianyzik) {
        await nemElerhetoJelol(i.id, job, i.link, "nincs_a_listaban");
    }

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
            const l = await listaOldalak(u, job, opts.maxOldal);

            l.elemek.forEach(d => feladatok.push({ url: d.link, alap: la, kesz: d }));
            l.linkek.forEach(x => feladatok.push({ url: x, alap: la }));

            if (l.teljes && l.elemek.length) listak.push({ alap: la, elemek: l.elemek });

        }

        const lattam = new Set();
        const egyedi = feladatok.filter(f => {
            const k = normLink(f.url);
            if (lattam.has(k)) return false;
            lattam.add(k);
            return true;
        }).slice(0, MAX_HIRDETES);

        job.osszes += egyedi.length;
        job.allapot = "fut";

        for (const f of egyedi) {

            try {
                if (f.kesz && opts.csakMeglevo && !keresMeglevo(meglevo, elemKulcsok(f.kesz))) {
                    job.kihagyott++;
                } else {
                    await egyHirdetes(f.url, f.alap, job, meglevo, f.kesz);
                }
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
            await hianyzokJelol(kulcsok, l.alap, job, l.elemek.length);
        }

        job.allapot = "kesz";

    } catch (e) {

        job.allapot = "hiba";
        naplo(job, { eredmeny: "hiba", uzenet: e.message });

    }

    job.vege = new Date().toISOString();

    return job;

}

function indit(urls, alap) {
    const job = ujJob("import");
    job.promise = futtat(job, urls, alap);
    return job;
}

// ---------- meglévő hirdetések figyelése ----------

async function nemElerhetoJelol(id, job, url, ok) {

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
            await varosSzinkron([{ varos: i.varos, tipus: i.tipus || "lakas", ugylet: i.ugylet || "elado" }], job, { csakMeglevo: true });
            await db.query("UPDATE ingatlanok SET utolso_ellenorzes = NOW() WHERE id = $1", [i.id]);
            if (job.frissitett + job.kihagyott + job.nemElerheto === volt) throw new Error(tiltasUzenet(i.link, 403));
            return;
        }
        throw e;
    }

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

    if (d.ar && Math.abs((i.ar || 0) - d.ar) >= 1) { potol.ar = d.ar; valtozas.push("ar"); }
    if (ures(i.nm) && d.nm) potol.nm = d.nm;
    if (ures(i.szobak) && d.szobak) potol.szobak = d.szobak;
    if (ures(i.emelet) && d.emelet) potol.emelet = d.emelet;
    if (ures(i.allapot) && d.allapot) potol.allapot = d.allapot;
    if (ures(i.cim) && d.cim) potol.cim = d.cim;
    if (ures(i.leiras) && d.leiras) potol.leiras = d.leiras;
    if (ures(i.telek_nm) && d.telek_nm) potol.telek_nm = d.telek_nm;
    if (ures(i.evszam) && d.evszam) potol.evszam = d.evszam;
    if (d.forrasSzoveg && (ures(i.forras_szoveg) || !(d.forrasok && d.forrasok.osszes === "kereses"))) potol.forras_szoveg = d.forrasSzoveg;
    if (d.kerulet) potol.forras_kerulet = d.kerulet;
    // Képek: ha eddig nem volt, vagy most több van
    const regiKepek = Array.isArray(i.kulso_kepek) ? i.kulso_kepek : [];
    if (d.kulso_kepek && d.kulso_kepek.length && (!regiKepek.length || d.kulso_kepek.length >= regiKepek.length)) {
        potol.kulso_kepek = JSON.stringify(d.kulso_kepek);
        if (!regiKepek.length) valtozas.push("kepek");
    }

    // A forrás további linkjei (ugyanaz a hirdetés több oldalon)
    const tovabbi = [...new Set([...(i.tovabbi_linkek || []), ...(d.tovabbi_linkek || []), d.link]
        .filter(l => l && normLink(l) !== normLink(i.link)))];
    if (tovabbi.length !== (i.tovabbi_linkek || []).length) potol.tovabbi_linkek = JSON.stringify(tovabbi);

    if (ures(i.kerulet) && d.kerulet) {
        const k = await quality.keruletKeres(i.varos, d.kerulet, d.utca, d.cim);
        if (k) potol.kerulet = k;
    }

    if (!(i.x && i.y)) {
        const hely = await geocode(d.cimSzoveg || d.kerulet || i.kerulet || "", i.varos);
        if (hely) {
            potol.x = hely.x;
            potol.y = hely.y;
            potol.hely_pontossag = hely.szint;
        }
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
    const sets = kulcsok.map((k, idx) => `${k} = $${idx + 1}${["kulso_kepek", "hianyzo", "problemak", "tovabbi_linkek"].includes(k) ? "::jsonb" : ""}`);

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

        await futtat(job, [url], { varos: c.varos, tipus: c.tipus, ugylet: c.ugylet }, { maxOldal: 20, ...opts });

        job.allapot = "fut";
        job.vege = null;

    }

}

async function figyelesFuttat(job, opts) {

    try {

        const felt = ["link IS NOT NULL", "link <> ''", "statusz IN ('aktiv', 'nem_elerheto', 'fuggo')"];
        const params = [];

        if (opts.ids && opts.ids.length) {
            params.push(opts.ids);
            felt.push(`id = ANY($${params.length}::int[])`);
        }

        params.push(opts.limit || 100);

        const r = await db.query(`
            SELECT * FROM ingatlanok
            WHERE ${felt.join(" AND ")}
            ORDER BY utolso_ellenorzes NULLS FIRST, id
            LIMIT $${params.length}
        `, params);

        // Csak értelmes linkek (a hibás adatsorokat kihagyjuk)
        let lista = r.rows.filter(i => /^https?:\/\//.test(i.link) && isListingUrl(i.link));

        // Az imobiliare.ro letiltja a szervert: az ilyen hirdetéseket a város
        // Imoradar24-es listájából frissítjük (ár, képek, adatok), és ami
        // már nincs a listában, azt "nem elérhető"-nek jelöljük
        const imo = lista.filter(i => /imobiliare\.ro/i.test(i.link));

        if (imo.length) {

            const csoportok = new Map();
            imo.forEach(i => {
                const c = { varos: i.varos, tipus: i.tipus || "lakas", ugylet: i.ugylet || "elado" };
                csoportok.set(`${c.varos}|${c.tipus}|${c.ugylet}`, c);
            });

            job.allapot = "fut";
            await varosSzinkron([...csoportok.values()], job, { csakMeglevo: !!(opts.ids && opts.ids.length) });

            await db.query("UPDATE ingatlanok SET utolso_ellenorzes = NOW() WHERE id = ANY($1::int[])", [imo.map(i => i.id)]);

            lista = lista.filter(i => !/imobiliare\.ro/i.test(i.link));

        }

        job.osszes += lista.length;
        job.allapot = "fut";

        for (const i of lista) {

            try {
                await frissitForrasbol(i, job);
            } catch (e) {
                job.hibak++;
                naplo(job, { url: i.link, eredmeny: "hiba", uzenet: e.message, id: i.id });
                await db.query("UPDATE ingatlanok SET utolso_ellenorzes = NOW() WHERE id = $1", [i.id]);
            }

            job.kesz++;

            await sleep(KESLELTETES);

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

async function figyeltFuttat(ids) {

    const r = ids
        ? await db.query("SELECT * FROM figyelt_oldalak WHERE id = ANY($1::int[]) ORDER BY id", [ids])
        : await db.query("SELECT * FROM figyelt_oldalak ORDER BY id");

    const eredmenyek = [];

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

module.exports = { indit, allapot, figyeltFuttat, figyelesIndit, frissitForrasbol, ujJob, imoradarLink, _teszt: { linkKulcsok, elemKulcsok, listaAlap } };
