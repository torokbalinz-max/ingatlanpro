// ============================================================
//  Figyelt oldalak = a város forrásai (Admin → Város → Források)
//
//  A régi "Beolvasás" (linkek bemásolása) és "Figyelt oldalak" helyett
//  városonként egy lista: típusonként (eladó lakás, kiadó lakás, ház,
//  telek, üzlethelyiség, iroda) azok az oldalak, ahonnan beolvasunk:
//
//    olx         az OLX nyilvános listája (közvetlenül)
//    storia      a Storia listája (közvetlenül – ha a szervert letiltja,
//                a Storia hirdetései az Imoradar24-ről jönnek)
//    imoradar24  az Imoradar24 listája: az imobiliare.ro, Publi24, Homezz…
//                hirdetései (és amit közvetlenül nem sikerült olvasni)
//    egyeb       saját link (pl. egy kerület listája) – az admin adja hozzá
//
//  Az olx / storia / imoradar24 sorok magától jönnek létre (auto), a linkjük
//  a város nevéből készül, és szerkeszthető. Futtatáskor megnézzük, él-e még
//  a link: ha a forrásoldal megváltoztatta (404, máshová irányít), megpróbáljuk
//  megkeresni az újat (a város nevének változataival), és ha megvan, kicseréljük;
//  ha nem, a sor "link_hiba" állapotot kap – kézzel javítható.
//
//  Futtatás: egy sor, egy város összes sora, vagy minden város (napi időzítés is).
//  Sorrend: előbb a közvetlen oldalak, utána az Imoradar24 és a saját linkek –
//  így az Imoradar24-ről csak az jön, ami közvetlenül nem volt meg.
// ============================================================

const db = require("../db/database");
const importer = require("./importer");
const kozvetlen = require("./kozvetlen");
const forrasHely = require("./forrasHely");
const forrasSorrend = require("./forrasSorrend");
const { fetchPage, extractSearchItems } = require("./scraper");

// A típus + ügylet csoportok (a lista sorrendje)
const CSOPORTOK = [
    { tipus: "lakas", ugylet: "elado" }, { tipus: "lakas", ugylet: "kiado" },
    { tipus: "haz", ugylet: "elado" }, { tipus: "haz", ugylet: "kiado" },
    { tipus: "telek", ugylet: "elado" },
    { tipus: "kereskedelmi", ugylet: "elado" }, { tipus: "kereskedelmi", ugylet: "kiado" },
    { tipus: "iroda", ugylet: "elado" }, { tipus: "iroda", ugylet: "kiado" }
];
const AUTO_FORRASOK = ["olx", "storia", "imoradar24"];
const FORRAS_REND = { olx: 0, storia: 1, imoradar24: 2, egyeb: 3 };

let futo = null;      // a futó (várost / mindent) beolvasó feladat

function forrasLinkbol(url) {
    const s = String(url || "").toLowerCase();
    if (s.includes("olx.ro")) return "olx";
    if (s.includes("storia.ro")) return "storia";
    if (s.includes("imoradar24.ro")) return "imoradar24";
    return "egyeb";
}

async function varosAdat(varos) {
    const r = await db.query("SELECT nev, nev_ro, megye, anyavaros FROM varosok WHERE nev = $1", [varos]);
    return r.rows[0] || null;
}

// A város alapértelmezett linkje egy forráshoz
async function alapLink(forras, varos, tipus, ugylet) {
    const h = await importer.forrasHelyAdat(varos);
    if (forras === "olx") return kozvetlen.olxWebUrl(forrasHely.slug(h.varosRo), tipus, ugylet);
    if (forras === "storia") return forrasHely.storiaListaUrl({ megye: h.megye, varosRo: h.varosRo, tipus, ugylet });
    if (forras === "imoradar24") return importer.imoradarLink(varos, tipus, ugylet);
    return null;
}

// A város auto sorai (ha még nincsenek): a régi figyelt oldalak (Imoradar24 linkek) az
// imoradar24 sorrá válnak (a linkjük marad), a többi régi link saját ("egyeb") sor lesz
async function biztosit(varos) {
    const va = await varosAdat(varos);
    if (!va || va.anyavaros) return;

    // a régi (forrás nélküli) sorok besorolása
    const regi = await db.query("SELECT id, url, tipus, ugylet FROM figyelt_oldalak WHERE varos = $1 AND forras IS NULL", [varos]);
    for (const r of regi.rows) {
        const f = forrasLinkbol(r.url);
        const vanAuto = f !== "egyeb" && (await db.query("SELECT 1 FROM figyelt_oldalak WHERE varos = $1 AND tipus = $2 AND ugylet = $3 AND forras = $4 AND auto",
            [varos, r.tipus || "lakas", r.ugylet || "elado", f])).rowCount;
        await db.query("UPDATE figyelt_oldalak SET forras = $2, auto = $3, tipus = COALESCE(tipus, 'lakas'), ugylet = COALESCE(ugylet, 'elado') WHERE id = $1",
            [r.id, f, f !== "egyeb" && !vanAuto]);
    }

    for (const c of CSOPORTOK) {
        for (const f of AUTO_FORRASOK) {
            const van = await db.query("SELECT 1 FROM figyelt_oldalak WHERE varos = $1 AND tipus = $2 AND ugylet = $3 AND forras = $4 AND auto", [varos, c.tipus, c.ugylet, f]);
            if (van.rowCount) continue;
            const url = await alapLink(f, varos, c.tipus, c.ugylet);
            if (!url) continue;
            await db.query(`INSERT INTO figyelt_oldalak (url, varos, tipus, ugylet, forras, auto, aktiv) VALUES ($1, $2, $3, $4, $5, true, true)`,
                [url, varos, c.tipus, c.ugylet, f]).catch(e => console.error("Forráslista:", e.message));
        }
    }
}

async function lista(varos) {
    await biztosit(varos);
    const r = await db.query(`SELECT * FROM figyelt_oldalak WHERE varos = $1 ORDER BY id`, [varos]);
    const sorok = r.rows.sort((a, b) =>
        CSOPORTOK.findIndex(c => c.tipus === a.tipus && c.ugylet === a.ugylet) - CSOPORTOK.findIndex(c => c.tipus === b.tipus && c.ugylet === b.ugylet) ||
        (FORRAS_REND[a.forras] ?? 9) - (FORRAS_REND[b.forras] ?? 9) || a.id - b.id);
    return sorok;
}

// ---------- Link-ellenőrzés és -javítás ----------

// Egy Imoradar24 / egyéb lista él-e: 200, ugyanott maradt, és van benne hirdetés (Imoradar24)
async function listaEl(url) {
    try {
        const p = await fetchPage(url);
        if (p.status >= 400) return { ok: false, status: p.status };
        const mashova = p.finalUrl && new URL(p.finalUrl).pathname.replace(/\/+$/, "") !== new URL(url).pathname.replace(/\/+$/, "");
        const db = /imoradar24\.ro/i.test(url) ? extractSearchItems(p.html).length : null;
        return { ok: !mashova && (db === null || db > 0), status: p.status, vegso: p.finalUrl, db, mashova };
    } catch (e) {
        return { ok: false, status: 0, hiba: e.message };
    }
}

// Az Imoradar24 lista lehetséges címei a város nevéből (ha a régi már nem él)
async function imoradarJeloltek(varos, tipus, ugylet) {
    const h = await importer.forrasHelyAdat(varos);
    const kat = importer.IMORADAR_TIPUS[tipus];
    if (!kat) return [];
    const resz = `${kat}-de-${ugylet === "kiado" ? "inchiriat" : "vanzare"}`;
    const v = forrasHely.slug(h.varosRo), m = forrasHely.slug(h.megye || "");
    const helyek = [importer.IMORADAR_VAROS[varos], m && `judetul-${m}/${v}`, v, m && `judetul-${m}/municipiul-${v}`, m && `${m}/${v}`].filter(Boolean);
    return [...new Set(helyek)].map(x => `https://www.imoradar24.ro/${resz}/${x}`);
}

async function linkJavit(sor) {
    if (sor.forras === "imoradar24") {
        for (const u of await imoradarJeloltek(sor.varos, sor.tipus, sor.ugylet)) {
            if (u === sor.url) continue;
            const e = await listaEl(u);
            if (e.ok) return u;
        }
    }
    return null;
}

async function sorMent(id, v) {
    const k = Object.keys(v);
    if (!k.length) return;
    await db.query(`UPDATE figyelt_oldalak SET ${k.map((x, i) => `${x} = $${i + 2}`).join(", ")} WHERE id = $1`, [id, ...k.map(x => v[x])]);
}

// ---------- Egy sor futtatása (egy közös feladaton belül) ----------

async function sorFuttat(sor, job) {

    const volt = { uj: job.uj, frissitett: job.frissitett, nemElerheto: job.nemElerheto, hibak: job.hibak };
    const elter = () => `${job.uj - volt.uj} új, ${job.frissitett - volt.frissitett} frissítve, ${job.nemElerheto - volt.nemElerheto} levéve${job.hibak - volt.hibak ? `, ${job.hibak - volt.hibak} hiba` : ""}`;
    const kesz = async (allapot, uzenet, db) => {
        await sorMent(sor.id, { utolso_futas: new Date(), allapot, uzenet: uzenet || null, utolso_db: db === undefined ? null : db, utolso_eredmeny: elter() });
        (job.sorok = job.sorok || []).push({ id: sor.id, forras: sor.forras, tipus: sor.tipus, ugylet: sor.ugylet, allapot, uzenet, db, eredmeny: elter() });
    };

    importer.naplo(job, { eredmeny: "lista_szinkron", url: sor.url });

    // --- közvetlen: OLX / Storia ---
    if (sor.forras === "olx" || sor.forras === "storia") {
        const beall = await forrasSorrend.olvas();
        if (!beall.kozvetlen.includes(sor.forras)) return kesz("kikapcsolva", "A közvetlen beolvasás ki van kapcsolva ennél az oldalnál (Beállítások).");
        const hely = sor.forras === "olx" ? { olxSlug: kozvetlen.olxSlugLinkbol(sor.url) } : { storiaAlap: sor.url };
        job.kozvetlen = {};
        await importer.kozvetlenFuttat(job, sor.varos, { forrasok: [sor.forras], tipus: sor.tipus, ugylet: sor.ugylet, hely });
        const e = job.kozvetlen[sor.forras] || {};
        if (e.tiltva) return kesz("letiltva", sor.forras === "storia"
            ? "A Storia letiltja a szervert – a Storia hirdetései az Imoradar24 listájából jönnek."
            : "Az oldal letiltja a szervert – ezek a hirdetések az Imoradar24 listájából jönnek.", 0);
        if (e.hiba === "olx_city_not_found") return kesz("link_hiba", "Az OLX nem ismeri ezt a várost ezen a néven – másold be a város OLX-es linkjét (pl. …/apartamente-garsoniere-de-vanzare/sfantu-gheorghe/).", 0);
        if (e.hiba) return kesz(/HTTP 404/.test(e.hiba) ? "link_hiba" : "hiba", e.hiba, 0);
        // az OLX-nél a város más néven volt meg (a régi link már nem jó): a linket kicseréljük
        if (sor.forras === "olx" && e.olxSlug && e.olxSlug !== kozvetlen.olxSlugLinkbol(sor.url)) {
            const uj = kozvetlen.olxWebUrl(e.olxSlug, sor.tipus, sor.ugylet);
            await sorMent(sor.id, { regi_url: sor.url, url: uj });
            importer.naplo(job, { eredmeny: "link_csere", url: uj, uzenet: `Az OLX-en a város új néven szerepel – a linket kicseréltem (régi: ${sor.url}).` });
        }
        const teljes = (e.csoportok || []).every(c => c.teljes);
        return kesz("ok", teljes ? null : "A lista nem teljes (túl sok találat) – a hiányzókat most nem vettük le.", e.db || 0);
    }

    // --- Imoradar24 / saját lista ---
    await importer.kihagyBeallit(job, sor.varos, sor.tipus, sor.ugylet);
    job.listaInfo = {};
    await importer.futtat(job, [sor.url], { varos: sor.varos, tipus: sor.tipus, ugylet: sor.ugylet, kerulet: sor.kerulet || null }, { utoMunkaNelkul: true });
    job.allapot = "fut"; job.vege = null;
    const info = job.listaInfo[sor.url] || {};

    const rossz = info.status === 404 || info.status === 410 || (info.vegso && (() => { try { return new URL(info.vegso).pathname.replace(/\/+$/, "") !== new URL(sor.url).pathname.replace(/\/+$/, ""); } catch (e) { return false; } })());
    if (rossz) {
        const uj = await linkJavit(sor);
        if (uj) {
            await sorMent(sor.id, { regi_url: sor.url, url: uj });
            importer.naplo(job, { eredmeny: "link_csere", url: uj, uzenet: `A régi link (${sor.url}) már nem él – kicseréltem.` });
            const s2 = { ...sor, url: uj };
            job.listaInfo = {};
            await importer.futtat(job, [uj], { varos: sor.varos, tipus: sor.tipus, ugylet: sor.ugylet, kerulet: sor.kerulet || null }, { utoMunkaNelkul: true });
            job.allapot = "fut"; job.vege = null;
            const i2 = job.listaInfo[uj] || {};
            return kesz("ok", `Új link (a régi már nem élt): ${uj}`, i2.osszes || 0);
        }
        return kesz("link_hiba", info.status >= 400 ? `A link nem él (HTTP ${info.status}) – az újat nem találtam, írd be kézzel.` : `A link máshová visz (${info.vegso}) – az újat nem találtam, írd be kézzel.`, 0);
    }
    if (info.status === 403 || info.status === 429) return kesz("letiltva", "Az oldal letiltja a szervert.", 0);
    if (info.status === 0 && info.hiba) return kesz("hiba", info.hiba, 0);
    return kesz("ok", info.osszes === 0 ? "A lista üres (most nincs ilyen hirdetés)." : null, info.osszes || 0);

}

// ---------- Futtatás: sorok / város / minden ----------

//  opts: { ids, varos, tipus, ugylet, mind }
function futtat(opts = {}) {

    if (futo && futo.allapot !== "kesz" && futo.allapot !== "hiba") return futo;

    const job = importer.ujJob("forrasok");
    job.sorok = [];
    futo = job;

    job.promise = (async () => {
        try {
            const felt = ["aktiv"];
            const p = [];
            if (opts.ids && opts.ids.length) { p.push(opts.ids.map(Number)); felt.push(`id = ANY($${p.length}::int[])`); }
            if (opts.varos) { await biztosit(opts.varos); p.push(opts.varos); felt.push(`varos = $${p.length}`); }
            if (opts.tipus) { p.push(opts.tipus); felt.push(`tipus = $${p.length}`); }
            if (opts.ugylet) { p.push(opts.ugylet); felt.push(`ugylet = $${p.length}`); }
            if (!opts.ids && !opts.varos && opts.mind) {
                // minden város, amelyiknek már vannak forrásai (vagy hirdetései)
                const v = await db.query(`SELECT DISTINCT COALESCE(v.anyavaros, v.nev) AS nev FROM varosok v
                    WHERE EXISTS (SELECT 1 FROM figyelt_oldalak f WHERE f.varos = v.nev) OR EXISTS (SELECT 1 FROM ingatlanok i WHERE i.varos = v.nev AND i.statusz = 'aktiv')`);
                for (const x of v.rows) await biztosit(x.nev);
            }
            const r = await db.query(`SELECT * FROM figyelt_oldalak WHERE ${felt.join(" AND ")}`, p);
            // előbb a közvetlen oldalak, utána az Imoradar24 és a saját linkek
            const sorok = r.rows.sort((a, b) => (FORRAS_REND[a.forras] ?? 9) - (FORRAS_REND[b.forras] ?? 9) || String(a.varos).localeCompare(String(b.varos)) || a.id - b.id);
            job.varosok = [...new Set(sorok.map(s => s.varos))];
            job.osszesSor = sorok.length;
            job.allapot = "fut";
            for (const s of sorok) {
                job.aktSor = s.id;
                try { await sorFuttat(s, job); } catch (e) {
                    job.hibak++;
                    importer.naplo(job, { eredmeny: "hiba", url: s.url, uzenet: e.message });
                    await sorMent(s.id, { utolso_futas: new Date(), allapot: "hiba", uzenet: e.message }).catch(() => null);
                }
            }
            job.aktSor = null;
            await importer.utoMunka(job);
            job.allapot = "kesz";
        } catch (e) {
            job.allapot = "hiba";
            importer.naplo(job, { eredmeny: "hiba", uzenet: e.message });
        }
        job.vege = new Date().toISOString();
        return job;
    })();

    return job;

}

// ---------- Szerkesztés ----------

async function hozzaad(b) {
    const url = String(b.url || "").trim();
    const varos = String(b.varos || "").trim();
    if (!/^https?:\/\//i.test(url) || !varos) throw Object.assign(new Error("bad_request"), { kod: "bad_request" });
    const tipus = CSOPORTOK.some(c => c.tipus === b.tipus) ? b.tipus : "lakas";
    const ugylet = b.ugylet === "kiado" ? "kiado" : "elado";
    const r = await db.query(`INSERT INTO figyelt_oldalak (url, nev, varos, tipus, ugylet, forras, auto, aktiv, kerulet)
        VALUES ($1, $2, $3, $4, $5, $6, false, true, $7) RETURNING *`,
        [url, String(b.nev || "").trim().slice(0, 120) || null, varos, tipus, ugylet, forrasLinkbol(url), String(b.kerulet || "").trim().slice(0, 100) || null]);
    return r.rows[0];
}

async function modosit(id, b) {
    const v = {};
    if (b.url !== undefined) {
        const url = String(b.url || "").trim();
        if (!/^https?:\/\//i.test(url)) throw Object.assign(new Error("bad_url"), { kod: "bad_url" });
        v.url = url; v.allapot = null; v.uzenet = null;
    }
    if (b.nev !== undefined) v.nev = String(b.nev || "").trim().slice(0, 120) || null;
    if (b.aktiv !== undefined) v.aktiv = !!b.aktiv;
    if (b.kerulet !== undefined) v.kerulet = String(b.kerulet || "").trim().slice(0, 100) || null;
    await sorMent(Number(id), v);
    return (await db.query("SELECT * FROM figyelt_oldalak WHERE id = $1", [Number(id)])).rows[0];
}

// Az auto sor linkje vissza az alapra (a város nevéből)
async function alapra(id) {
    const s = (await db.query("SELECT * FROM figyelt_oldalak WHERE id = $1", [Number(id)])).rows[0];
    if (!s || !s.auto) return s;
    const url = await alapLink(s.forras, s.varos, s.tipus, s.ugylet);
    if (url) await sorMent(s.id, { url, allapot: null, uzenet: null });
    return (await db.query("SELECT * FROM figyelt_oldalak WHERE id = $1", [s.id])).rows[0];
}

async function torol(id) {
    // az auto sor nem törölhető (csak kikapcsolható) – a következő megnyitáskor újra létrejönne
    await db.query("DELETE FROM figyelt_oldalak WHERE id = $1 AND NOT COALESCE(auto, false)", [Number(id)]);
}

function futoJob() {
    return futo && futo.allapot !== "kesz" && futo.allapot !== "hiba" ? futo.id : null;
}

module.exports = { lista, biztosit, futtat, hozzaad, modosit, alapra, torol, futoJob, CSOPORTOK, forrasLinkbol, _teszt: { imoradarJeloltek, listaEl } };
