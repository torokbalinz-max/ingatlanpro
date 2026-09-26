// ============================================================
//  Adatminőség: hiányzó és gyanús adatok felismerése
//
//  ellenorzott = az admin jóváhagyta, VAGY nincs se hiányzó,
//                se gyanús adat. Csak az ellenőrzött hirdetések
//                számítanak bele a statisztikába és a becslésbe.
// ============================================================

const db = require("../db/database");
const { hianyzoMezok, TIPUS_MEZOK } = require("./listing");

function emeletSzamok(e) {
    const [a, b] = String(e || "").split("/").map(x => parseInt(x, 10));
    return { emelet: isNaN(a) ? null : a, ossz: isNaN(b) ? null : b };
}

// Az ellenőrzött hirdetések medián €/m²-e (városra, típusra, ügyletre)
async function median(varos, tipus, ugylet) {

    const r = await db.query(`
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY arnm) AS m, COUNT(*)::int AS n
        FROM ingatlanok
        WHERE varos = $1 AND COALESCE(tipus,'lakas') = $2 AND COALESCE(ugylet,'elado') = $3
          AND ar > 0 AND nm > 0 AND statusz = 'aktiv' AND ellenorzott
    `, [varos, tipus || "lakas", ugylet || "elado"]);

    return r.rows[0].n >= 5 ? Number(r.rows[0].m) : null;

}

const KOTELEZO_IMPORT = ["ar", "nm", "varos", "szobak"];

function problemak(d, ctx = {}) {

    const p = [];
    const f = TIPUS_MEZOK[d.tipus] || TIPUS_MEZOK.lakas;

    if (d.ar > 0 && d.nm > 0 && ctx.medianArNm) {
        const arany = (d.ar / d.nm) / ctx.medianArNm;
        if (arany < 0.55) p.push("arnm_alacsony");
        if (arany > 1.8) p.push("arnm_magas");
    }

    if (d.tipus === "lakas" && d.nm > 0 && d.szobak > 0) {
        const perSzoba = d.nm / d.szobak;
        if (perSzoba < 10 || perSzoba > 65) p.push("nm_szoba");
    }

    if (d.tipus === "lakas" && d.nm > 400) p.push("nm_nagy");

    if (f.emelet) {
        const { emelet, ossz } = emeletSzamok(d.emelet);
        if (emelet !== null && ossz !== null && emelet > ossz) p.push("emelet_hibas");
    }

    if (d.ugylet !== "kiado" && d.ar > 0 && d.ar < 5000) p.push("ar_alacsony");
    if (d.ugylet === "kiado" && d.ar > 0 && d.ar > 20000) p.push("ar_magas_berlet");

    // A közelítő / hiányzó hely és az ismeretlen kerület NEM probléma:
    // a hirdetésen jelöljük ("közelítő hely", "nincs megadva pontos hely"),
    // a kerületeket pedig az Admin → Városok, kerületek oldalon lehet párosítani.

    return p;

}

async function ertekel(d, opts = {}) {

    const vannakKeruletek = opts.vannakKeruletek !== undefined
        ? opts.vannakKeruletek
        : (await db.query("SELECT 1 FROM keruletek WHERE varos = $1 LIMIT 1", [d.varos])).rowCount > 0;

    const medianArNm = opts.medianArNm !== undefined ? opts.medianArNm : await median(d.varos, d.tipus, d.ugylet);

    const hianyzo = hianyzoMezok(d, { mod: opts.mod || "import", vannakKeruletek, kepDb: opts.kepDb });
    const prob = problemak(d, { medianArNm, vannakKeruletek });

    // Beolvasott hirdetésnél csak az alapadatok hiánya miatt kell kézzel
    // ellenőrizni (ár, alapterület, város, lakásnál szobák). Az egyéb hiányzó
    // adat (emelet, állapot, telek mérete...) látszik, de nem akasztja meg.
    const mod = opts.mod || "import";
    const blokkolo = mod === "import"
        ? hianyzo.filter(m => KOTELEZO_IMPORT.includes(m) && !(m === "szobak" && d.tipus !== "lakas"))
        : hianyzo;

    return {
        hianyzo,
        problemak: prob,
        ellenorzott: !!opts.jovahagyva || (blokkolo.length === 0 && prob.length === 0)
    };

}

// Kerület felismerése a forrásoldal környék-nevéből / a címből / a leírásból.
// A kerületnek magyar (nev) és román (nev_ro) neve is van, plusz a más
// oldalakon használt nevek (aliasok) – bármelyikre illeszkedik.
function ekezetNelkul(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const reEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function keruletLista(varos) {

    const r = await db.query("SELECT nev, nev_ro, aliasok FROM keruletek WHERE varos = $1", [varos]);

    // Hosszabb kulcs előbb ("Cartierul Ciucului" előbb, mint "Ciuc")
    return r.rows.flatMap(k =>
        [k.nev, k.nev_ro, ...String(k.aliasok || "").split(",")]
            .map(ekezetNelkul)
            .filter(x => x.length >= 3)
            .map(kulcs => ({ nev: k.nev, kulcs }))
    ).sort((a, b) => b.kulcs.length - a.kulcs.length);

}

// Erős szövegek (forrás szerinti környék, utca, cím): a név bárhol előfordulhat
async function keruletKeres(varos, ...szovegek) {

    if (!varos) return null;

    const lista = await keruletLista(varos);

    for (const sz of szovegek) {

        const t = ekezetNelkul(sz);
        if (!t) continue;

        // Pontos egyezés előnyben
        const pontos = lista.find(k => k.kulcs === t);
        if (pontos) return pontos.nev;

        const resz = lista.find(k => new RegExp(`(^|[^a-z])${reEscape(k.kulcs)}([^a-z]|$)`).test(t));
        if (resz) return resz.nev;

    }

    return null;

}

// Leírásból csak akkor, ha a név "zona X", "cartierul X", "X negyed",
// "X lakótelep" formában szerepel – különben pl. a "centrală" (fűtés)
// tévesen a Központra mutatna
async function keruletSzovegbol(varos, szoveg) {

    if (!varos || !szoveg) return null;

    const lista = await keruletLista(varos);
    const t = ekezetNelkul(szoveg);

    for (const k of lista) {

        const x = reEscape(k.kulcs);

        const re = new RegExp(
            `(?:zona|zone|cartier(?:ul)?|in cartierul|str\\.?|strada)\\s+(?:de\\s+)?${x}([^a-z]|$)` +
            `|(^|[^a-z])${x}\\s*(?:-?i\\s+)?(?:negyed|lakotelep|varosresz|kornyek|zona|cartier)`
        );

        if (re.test(t)) return k.nev;

    }

    return null;

}

// Ha az admin egy ismeretlen forrás-környéket kerülethez rendel, megjegyezzük
async function aliasHozzaad(varos, kerulet, alias) {

    if (!varos || !kerulet || !alias) return;

    const r = await db.query("SELECT aliasok, nev_ro FROM keruletek WHERE varos = $1 AND nev = $2", [varos, kerulet]);

    if (!r.rowCount) return;

    const lista = String(r.rows[0].aliasok || "").split(",").map(x => x.trim()).filter(Boolean);

    const a = ekezetNelkul(alias);
    if (lista.map(ekezetNelkul).includes(a) || a === ekezetNelkul(kerulet) || a === ekezetNelkul(r.rows[0].nev_ro)) return;

    lista.push(alias.trim());

    await db.query("UPDATE keruletek SET aliasok = $1 WHERE varos = $2 AND nev = $3", [lista.join(", "), varos, kerulet]);

}

module.exports = { ertekel, problemak, median, keruletKeres, keruletSzovegbol, aliasHozzaad, ekezetNelkul, KOTELEZO_IMPORT };
