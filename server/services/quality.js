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

    if (d.hely_pontossag === "kozelito") p.push("hely_kozelito");

    if (d.forras_kerulet && !d.kerulet && ctx.vannakKeruletek) p.push("kerulet_ismeretlen");

    return p;

}

async function ertekel(d, opts = {}) {

    const vannakKeruletek = opts.vannakKeruletek !== undefined
        ? opts.vannakKeruletek
        : (await db.query("SELECT 1 FROM keruletek WHERE varos = $1 LIMIT 1", [d.varos])).rowCount > 0;

    const medianArNm = opts.medianArNm !== undefined ? opts.medianArNm : await median(d.varos, d.tipus, d.ugylet);

    const hianyzo = hianyzoMezok(d, { mod: opts.mod || "import", vannakKeruletek, kepDb: opts.kepDb });
    const prob = problemak(d, { medianArNm, vannakKeruletek });

    return {
        hianyzo,
        problemak: prob,
        ellenorzott: !!opts.jovahagyva || (hianyzo.length === 0 && prob.length === 0)
    };

}

// Kerület felismerése a forrásoldal környék-nevéből (név vagy alias alapján)
function ekezetNelkul(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

async function keruletKeres(varos, ...szovegek) {

    const r = await db.query("SELECT nev, aliasok FROM keruletek WHERE varos = $1", [varos]);

    const lista = r.rows.map(k => ({
        nev: k.nev,
        kulcsok: [k.nev, ...String(k.aliasok || "").split(",")].map(ekezetNelkul).filter(x => x.length >= 3)
    }));

    for (const sz of szovegek) {

        const t = ekezetNelkul(sz);
        if (!t) continue;

        // Pontos egyezés előnyben
        const pontos = lista.find(k => k.kulcsok.includes(t));
        if (pontos) return pontos.nev;

        const resz = lista.find(k => k.kulcsok.some(x => new RegExp(`(^|[^a-z])${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(t)));
        if (resz) return resz.nev;

    }

    return null;

}

// Ha az admin egy ismeretlen forrás-környéket kerülethez rendel, megjegyezzük
async function aliasHozzaad(varos, kerulet, alias) {

    if (!varos || !kerulet || !alias) return;

    const r = await db.query("SELECT aliasok FROM keruletek WHERE varos = $1 AND nev = $2", [varos, kerulet]);

    if (!r.rowCount) return;

    const lista = String(r.rows[0].aliasok || "").split(",").map(x => x.trim()).filter(Boolean);

    if (lista.map(ekezetNelkul).includes(ekezetNelkul(alias)) || ekezetNelkul(alias) === ekezetNelkul(kerulet)) return;

    lista.push(alias.trim());

    await db.query("UPDATE keruletek SET aliasok = $1 WHERE varos = $2 AND nev = $3", [lista.join(", "), varos, kerulet]);

}

module.exports = { ertekel, problemak, median, keruletKeres, aliasHozzaad, ekezetNelkul };
