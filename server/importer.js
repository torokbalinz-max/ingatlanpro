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
const { scrape, fetchPage, extractListingLinks, isListingUrl, pageUrl } = require("./scraper");
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

async function meglevoLinkek() {

    const r = await db.query("SELECT id, link, ar, statusz, tovabbi_linkek FROM ingatlanok");
    const m = new Map();

    r.rows.forEach(i => {
        const k = normLink(i.link);
        if (k) m.set(k, i);
        (i.tovabbi_linkek || []).forEach(l => {
            const k2 = normLink(l);
            if (k2 && !m.has(k2)) m.set(k2, i);
        });
    });

    return m;

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

async function egyHirdetes(url, alap, job, meglevo) {

    const k = normLink(url);
    const van = meglevo.get(k);

    const d = await scrape(url);

    if (van) {

        if (d.elerheto === false) {
            await nemElerhetoJelol(van.id, job, url);
            return;
        }

        if (d.ar && van.ar && Math.abs(d.ar - van.ar) >= 1) {
            await db.query(
                "UPDATE ingatlanok SET ar = $1, arnm = CASE WHEN nm > 0 THEN $1 / nm ELSE arnm END, updated_at = NOW(), utolso_ellenorzes = NOW() WHERE id = $2",
                [d.ar, van.id]
            );
            job.frissitett++;
            naplo(job, { url, eredmeny: "ar_frissitve", id: van.id, regi: van.ar, uj: d.ar });
        } else {
            job.kihagyott++;
            naplo(job, { url, eredmeny: "mar_megvan", id: van.id });
        }

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
         kulso_kepek, hianyzo, problemak, ellenorzott, forras_szoveg, forras_kerulet, evszam, utolso_ellenorzes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11,$12,$13,$14,$15,$16,'aktiv','import',$17,
                $18::jsonb,$19::jsonb,$20::jsonb,$21,$22,$23,$24,NOW())
        RETURNING id
    `, [
        url, adat.ar, adat.nm, adat.arnm, adat.szobak, adat.emelet, adat.allapot,
        adat.x, adat.y, adat.varos, adat.kerulet, adat.tipus, adat.ugylet,
        adat.cim, adat.leiras, adat.telek_nm, adat.hely_pontossag,
        JSON.stringify(d.kulso_kepek || []), JSON.stringify(q.hianyzo), JSON.stringify(q.problemak),
        q.ellenorzott, adat.forras_szoveg, adat.forras_kerulet, adat.evszam
    ]);

    meglevo.set(k, { id: r.rows[0].id, link: url, ar: adat.ar });

    job.uj++;
    naplo(job, { url, eredmeny: "uj", id: r.rows[0].id, hianyzo: q.hianyzo, problemak: q.problemak });

}

// Egy találati lista összes oldalának hirdetés-linkjei
async function listaLinkek(url, job) {

    const osszes = new Set();

    for (let oldal = 1; oldal <= MAX_OLDAL; oldal++) {

        const u = oldal === 1 ? url : pageUrl(url, oldal);

        let p;

        try {
            p = await fetchPage(u);
        } catch (e) {
            naplo(job, { url: u, eredmeny: "hiba", uzenet: e.message });
            break;
        }

        if (p.status >= 400) break;

        const linkek = extractListingLinks(p.html, p.finalUrl || u);
        const elotte = osszes.size;

        linkek.forEach(l => osszes.add(l));

        naplo(job, { url: u, eredmeny: "lista", db: linkek.length });

        // Nincs új hirdetés ezen az oldalon: vége a listának
        if (osszes.size === elotte || linkek.length === 0) break;

        if (osszes.size >= MAX_HIRDETES) break;

        await sleep(KESLELTETES);

    }

    return [...osszes];

}

async function futtat(job, urls, alap) {

    try {

        const meglevo = await meglevoLinkek();

        const hirdetesek = [];

        for (const u of urls) {
            if (isListingUrl(u)) hirdetesek.push(u);
            else hirdetesek.push(...await listaLinkek(u, job));
        }

        const egyedi = [...new Set(hirdetesek)].slice(0, MAX_HIRDETES);

        job.osszes = egyedi.length;
        job.allapot = "fut";

        for (const url of egyedi) {

            try {
                await egyHirdetes(url, alap, job, meglevo);
            } catch (e) {
                job.hibak++;
                naplo(job, { url, eredmeny: "hiba", uzenet: e.message });
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

function indit(urls, alap) {
    const job = ujJob("import");
    job.promise = futtat(job, urls, alap);
    return job;
}

// ---------- meglévő hirdetések figyelése ----------

async function nemElerhetoJelol(id, job, url) {

    await db.query(
        "UPDATE ingatlanok SET statusz = 'nem_elerheto', utolso_ellenorzes = NOW(), updated_at = NOW() WHERE id = $1 AND statusz <> 'nem_elerheto'",
        [id]
    );

    job.nemElerheto++;
    naplo(job, { url, eredmeny: "nem_elerheto", id });

}

// Egy hirdetés frissítése a forrásoldalról: ár, elérhetőség, hiányzó adatok, képek
async function frissitForrasbol(i, job) {

    const d = await scrape(i.link);

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
    if (d.forrasSzoveg) potol.forras_szoveg = d.forrasSzoveg;
    if (d.kerulet) potol.forras_kerulet = d.kerulet;
    if (d.kulso_kepek && d.kulso_kepek.length) potol.kulso_kepek = JSON.stringify(d.kulso_kepek);

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
    const sets = kulcsok.map((k, idx) => `${k} = $${idx + 1}${["kulso_kepek", "hianyzo", "problemak"].includes(k) ? "::jsonb" : ""}`);

    const params = kulcsok.map(k => potol[k]);
    params.push(i.id);

    await db.query(
        `UPDATE ingatlanok SET ${sets.join(", ")}, utolso_ellenorzes = NOW(), updated_at = NOW() WHERE id = $${kulcsok.length + 1}`,
        params
    );

    if (valtozas.length) {
        job.frissitett++;
        naplo(job, { url: i.link, eredmeny: "ar_frissitve", id: i.id, regi: i.ar, uj: d.ar });
    } else {
        job.kihagyott++;
        naplo(job, { url: i.link, eredmeny: "rendben", id: i.id, problemak: q.problemak, hianyzo: q.hianyzo });
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
        const lista = r.rows.filter(i => /^https?:\/\//.test(i.link) && isListingUrl(i.link));

        job.osszes = lista.length;
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

module.exports = { indit, allapot, figyeltFuttat, figyelesIndit, frissitForrasbol, ujJob };
