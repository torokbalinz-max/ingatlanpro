// ============================================================
//  Tömeges beolvasás más hirdetési oldalakról (csak admin)
//
//  Bemenet: hirdetés-linkek VAGY találati lista linkek.
//  - Találati listánál kigyűjtjük róla a hirdetéseket.
//  - A már meglévő hirdetéseket kihagyjuk (ha változott az ár, frissítjük).
//  - Az újak "függő" (jóváhagyásra váró) állapotba kerülnek,
//    a hiányzó adatok megjelölésével.
// ============================================================

const db = require("./database");
const { scrape, fetchHtml, extractListingLinks, isListingUrl } = require("./scraper");
const { geocode } = require("./geocode");
const { normalize, hianyzoMezok, normLink } = require("./listing");

const jobs = new Map();
let jobSzamlalo = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));

const MAX_PER_LISTA = 40;
const KESLELTETES = 1500;   // ms két kérés között – kíméljük a forrásoldalt

async function meglevoLinkek() {

    const r = await db.query("SELECT id, link, ar, tovabbi_linkek FROM ingatlanok");
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

async function keruletekVarosban(varos) {
    const r = await db.query("SELECT nev FROM keruletek WHERE varos = $1", [varos]);
    return r.rows.map(x => x.nev);
}

// A beolvasott szövegben előforduló kerületnév megkeresése
function keruletFelismer(szoveg, keruletek) {

    const t = String(szoveg || "").toLowerCase();

    return keruletek.find(k => k && t.includes(k.toLowerCase())) || null;

}

async function egyHirdetes(url, alap, job, meglevo, keruletek) {

    const k = normLink(url);
    const van = meglevo.get(k);

    const d = await scrape(url);

    if (van) {

        // Már megvan: csak az árváltozást jegyezzük fel
        if (d.ar && van.ar && Math.abs(d.ar - van.ar) >= 1) {
            await db.query(
                "UPDATE ingatlanok SET ar = $1, arnm = CASE WHEN nm > 0 THEN $1 / nm ELSE arnm END, updated_at = NOW() WHERE id = $2",
                [d.ar, van.id]
            );
            job.frissitett++;
            job.naplo.push({ url, eredmeny: "ar_frissitve", id: van.id, regi: van.ar, uj: d.ar });
        } else {
            job.kihagyott++;
            job.naplo.push({ url, eredmeny: "mar_megvan", id: van.id });
        }

        return;

    }

    const adat = normalize({
        ...d,
        tipus: d.tipus || alap.tipus,
        ugylet: d.ugylet || alap.ugylet,
        varos: alap.varos,
        kerulet: keruletFelismer(`${d.cim} ${d.cimSzoveg} ${d.leiras}`, keruletek)
    });

    // Ha nincs pontos hely, közelítő helyet keresünk a címből / kerületből
    if (!(adat.x && adat.y)) {

        const hely = await geocode(d.cimSzoveg || adat.kerulet || "", alap.varos);

        if (hely) {
            adat.x = hely.x;
            adat.y = hely.y;
            adat.hely_pontossag = "kozelito";
        }

    }

    const hianyzo = hianyzoMezok(adat, { mod: "import", vannakKeruletek: keruletek.length > 0 });

    const r = await db.query(`
        INSERT INTO ingatlanok
        (link, ar, nm, arnm, szobak, emelet, allapot, eladva, x, y, varos, kerulet,
         tipus, ugylet, cim, leiras, telek_nm, statusz, forras_tipus, hely_pontossag,
         kulso_kepek, hianyzo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11,$12,$13,$14,$15,$16,'fuggo','import',$17,$18::jsonb,$19::jsonb)
        RETURNING id
    `, [
        url, adat.ar, adat.nm, adat.arnm, adat.szobak, adat.emelet, adat.allapot,
        adat.x, adat.y, adat.varos, adat.kerulet, adat.tipus, adat.ugylet,
        adat.cim, adat.leiras, adat.telek_nm, adat.hely_pontossag,
        JSON.stringify(d.kulso_kepek || []), JSON.stringify(hianyzo)
    ]);

    meglevo.set(k, { id: r.rows[0].id, link: url, ar: adat.ar });

    job.uj++;
    job.naplo.push({ url, eredmeny: "uj", id: r.rows[0].id, hianyzo });

}

async function futtat(job, urls, alap) {

    try {

        const meglevo = await meglevoLinkek();
        const keruletek = await keruletekVarosban(alap.varos);

        // 1) Linkek összegyűjtése (a találati listákat kibontjuk)
        const hirdetesek = [];

        for (const u of urls) {

            if (isListingUrl(u)) {
                hirdetesek.push(u);
                continue;
            }

            try {
                const html = await fetchHtml(u);
                const linkek = extractListingLinks(html, u).slice(0, MAX_PER_LISTA);
                job.naplo.push({ url: u, eredmeny: "lista", db: linkek.length });
                hirdetesek.push(...linkek);
            } catch (e) {
                job.hibak++;
                job.naplo.push({ url: u, eredmeny: "hiba", uzenet: e.message });
            }

            await sleep(KESLELTETES);

        }

        const egyedi = [...new Set(hirdetesek)];

        job.osszes = egyedi.length;
        job.allapot = "fut";

        // 2) Hirdetések egyenként
        for (const url of egyedi) {

            try {
                await egyHirdetes(url, alap, job, meglevo, keruletek);
            } catch (e) {
                job.hibak++;
                job.naplo.push({ url, eredmeny: "hiba", uzenet: e.message });
            }

            job.kesz++;

            await sleep(KESLELTETES);

        }

        job.allapot = "kesz";

    } catch (e) {

        job.allapot = "hiba";
        job.naplo.push({ eredmeny: "hiba", uzenet: e.message });

    }

    job.vege = new Date().toISOString();

    return job;

}

// Új beolvasás indítása – azonnal visszatér, a munka a háttérben fut
function indit(urls, alap) {

    const id = ++jobSzamlalo;

    const job = {
        id,
        allapot: "indul",
        osszes: 0,
        kesz: 0,
        uj: 0,
        frissitett: 0,
        kihagyott: 0,
        hibak: 0,
        naplo: [],
        kezdes: new Date().toISOString(),
        vege: null
    };

    jobs.set(id, job);

    // Régi feladatok takarítása
    if (jobs.size > 20) {
        jobs.delete([...jobs.keys()][0]);
    }

    job.promise = futtat(job, urls, alap);

    return job;

}

function allapot(id) {
    const j = jobs.get(Number(id));
    if (!j) return null;
    const { promise, ...rest } = j;
    return rest;
}

// Figyelt oldalak futtatása (admin gomb vagy időzített hívás)
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

module.exports = { indit, allapot, figyeltFuttat };
