// ============================================================
//  Automatikus javítás
//
//  A hirdetés szövegéből (cím, leírás, forrásszöveg) kitölti,
//  ami hiányzik – így sokkal kevesebbet kell kézzel ellenőrizni:
//   - alapterület (teleknél a telek mérete), telek mérete, szobák,
//     emelet, építés éve
//   - kerület (lakás, üzlet, iroda) – magyar / román név, aliasok
//   - település (ház, telek) – ha nem a városban, hanem mellette
//   - hely: pontos, ha van; ha nincs, közelítő (utca / környék /
//     település alapján); ha semmi, "nincs megadva pontos hely"
//
//  Csak üres mezőt tölt ki – amit az admin beírt, azt nem írja felül.
//  Az új beolvasások is ezen mennek át (importer.js), a meglévőkre
//  pedig az Admin → Áttekintés "Automatikus javítás" gombja futtatja
//  (és telepítés után egyszer magától is lefut).
// ============================================================

const db = require("../db/database");
const quality = require("./quality");
const districts = require("./districts");
const textParse = require("./textParse");
const { VAROS_RO } = require("./geocode");
const location = require("./location");
const { TIPUS_MEZOK } = require("./listing");
const Telepulesek = require("../../public/js/core/telepulesek");

// Ha a javítás szabályai bővülnek, a szám emelésével a következő
// induláskor minden hirdetésen újra lefut (2: ár, belterület/külterület, kerület a helyből;
// 3: hely-ellenőrzés – a forrásoldal rossz pontjai, hasonló nevű falvak)
const VERZIO = 3;

const ures = v => v === null || v === undefined || v === "" || (typeof v === "number" && !(v > 0));

// Egy hirdetés javítása. Visszaadja a módosítandó mezőket (üres objektum = nincs teendő).
//  i:     a hirdetés sora (vagy az importálás előtti adat)
//  extra: a forrásoldalról jött plusz adatok (utca, forrás szerinti város)
async function javaslat(i, extra = {}) {

    const tipus = i.tipus || "lakas";
    const mezok = TIPUS_MEZOK[tipus] || TIPUS_MEZOK.lakas;
    const v = {};

    const szoveg = [i.cim, i.leiras, i.forras_szoveg].filter(Boolean).join("\n");

    // ---- 1) Számok a szövegből
    const k = textParse.kinyer(i);

    if (k.nm && ures(i.nm)) v.nm = k.nm;
    if (k.telek_nm && mezok.telek && ures(i.telek_nm)) v.telek_nm = k.telek_nm;
    if (k.szobak && mezok.szobak && ures(i.szobak)) v.szobak = k.szobak;
    if (k.emelet !== undefined && mezok.emelet && (i.emelet === null || i.emelet === undefined || i.emelet === "")) v.emelet = k.emelet;
    if (k.evszam && ures(i.evszam)) v.evszam = k.evszam;

    // Teleknél: ha csak a "telek mérete" volt kitöltve, az az alapterület
    if (tipus === "telek" && ures(i.nm) && !v.nm && i.telek_nm > 0) v.nm = i.telek_nm;

    // Ár: hiányzó vagy nem hihető (pl. 0,2 €) ár a szövegből; ha ott sincs, üres -> ellenőrzés
    if ("ar" in k && !(i.jovahagyva && i.ar > 0)) v.ar = k.ar;

    // Telek: belterület / külterület
    if (k.telek_jelleg && mezok.jelleg && !i.telek_jelleg) v.telek_jelleg = k.telek_jelleg;

    const nm = v.nm || i.nm;
    const ar = "ar" in v ? v.ar : i.ar;

    if (ar > 0 && nm > 0) {
        if (v.nm || "ar" in v || ures(i.arnm)) v.arnm = ar / nm;
    } else if ("ar" in v) {
        v.arnm = null;
    }

    // ---- 2) Kerület (lakás, üzlet, iroda): a forrás / cím szerinti név,
    //         aztán a hely (térkép), végül a leírás
    let keruletKell = mezok.kerulet && ures(i.kerulet) && i.varos;

    if (keruletKell) {

        const pontosHely = i.x && i.y && ["pontos", "utca"].includes(i.hely_pontossag || "pontos");

        const kerulet =
            (pontosHely ? await districts.keruletPontbol(i.varos, Number(i.x), Number(i.y)) : null) ||
            await quality.keruletKeres(i.varos, i.forras_kerulet, extra.utca, i.cim) ||
            (i.x && i.y && ["pontos", "utca"].includes(i.hely_pontossag || "pontos") ? await quality.keruletHelybol(i.varos, i.x, i.y) : null) ||
            await quality.keruletSzovegbol(i.varos, szoveg);

        if (kerulet) { v.kerulet = kerulet; keruletKell = false; }

    }

    // ---- 3) Település (ház, telek)
    if (mezok.telepules && ures(i.telepules)) {

        const va = await location.varosAdat(i.varos).catch(() => null);
        const varosRo = (va && va.nev_ro) || VAROS_RO[i.varos] || i.varos || "";

        const t = textParse.telepulesKeres(
            varosRo,
            [extra.varosForras, i.forras_kerulet, i.cim].filter(Boolean),
            [i.leiras, i.forras_szoveg].filter(Boolean)
        );

        if (t) v.telepules = t;

    }

    // ---- 4) Hely
    const vanHely = !!(i.x && i.y);

    if (!vanHely) {

        const hely = await location.helyKeres({ ...i, ...v }, szoveg, extra);

        if (hely) {
            v.x = hely.x;
            v.y = hely.y;
            v.hely_pontossag = hely.szint;
            v.hely_sugar = hely.szint === "kozelito" ? hely.sugar : null;
            v.hely_forras = hely.forras;
        } else if (i.hely_pontossag !== "nincs") {
            v.hely_pontossag = "nincs";
        }

    } else {

        // A meglévő pont ellenőrzése: a városban / a faluban van-e, és
        // egyezik-e a leírásban említett utcával. Amit ember tett le, marad.
        const e = await location.ellenoriz({ ...i, ...v }, szoveg, extra);

        if (e.hely_ok) {
            const { hely_ok, ...mezok } = e;
            Object.assign(v, mezok);
        } else if (!i.hely_pontossag) {
            v.hely_pontossag = "pontos";
        } else if (i.hely_pontossag === "kozelito" && !i.hely_sugar) {
            v.hely_sugar = i.telepules || v.telepules ? 1500 : 500;
        }

        if (!e.hely_ok && !i.hely_forras && !i.hely_kezi) v.hely_forras = "forras";

    }

    // Kerület a (most talált) helyből, ha a nevek alapján nem sikerült
    if (keruletKell && v.x && v.y && ["utca", "pontos"].includes(v.hely_pontossag)) {
        const kerulet = await quality.keruletHelybol(i.varos, v.x, v.y);
        if (kerulet) v.kerulet = kerulet;
    }

    return v;

}

// Közelítő hely: utca a szövegből -> település -> kerület / forrás szerinti környék
// (a location.js végzi, a város / falu körüli "dobozban")
async function helyKeres(d, szoveg, extra = {}) {
    return location.helyKeres(d, szoveg, extra);
}

// ---------- Tömeges futtatás ----------

let fut = null;

function allapot() {
    if (!fut) return null;
    const { promise, ...rest } = fut;
    return rest;
}

async function beallitas(kulcs, ertek) {
    if (ertek === undefined) {
        const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = $1", [kulcs]);
        return r.rows[0] ? r.rows[0].ertek : null;
    }
    await db.query(
        `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`,
        [kulcs, ertek]
    );
}

async function reviewSzam() {
    const r = await db.query("SELECT COUNT(*)::int AS n FROM ingatlanok WHERE (statusz = 'aktiv' AND NOT ellenorzott) OR statusz = 'fuggo'");
    return r.rows[0].n;
}

async function futtat(job, opts) {

    try {

        job.elotte = await reviewSzam();

        const felt = ["statusz IN ('aktiv', 'fuggo', 'nem_elerheto')"];
        if (!opts.mind) felt.push(`COALESCE(auto_javitva_v, 0) < ${VERZIO}`);

        const r = await db.query(`
            SELECT i.*, (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id)::int AS kep_db
            FROM ingatlanok i WHERE ${felt.join(" AND ")} ORDER BY i.id`);

        job.osszes = r.rows.length;
        job.allapot = "fut";

        const vannakKeruletek = new Map();

        for (const i of r.rows) {

            try {

                const v = await javaslat(i);
                const { kep_db, ...sor } = i;
                const uj = { ...sor, ...v };

                if (!vannakKeruletek.has(i.varos)) {
                    const k = await db.query("SELECT 1 FROM keruletek WHERE varos = $1 LIMIT 1", [i.varos]);
                    vannakKeruletek.set(i.varos, k.rowCount > 0);
                }

                const q = await quality.ertekel(uj, {
                    mod: i.forras_tipus === "import" ? "import" : (i.link ? "link" : "kezi"),
                    jovahagyva: i.jovahagyva,
                    vannakKeruletek: vannakKeruletek.get(i.varos),
                    kepDb: (i.kep_db || 0) + (Array.isArray(i.kulso_kepek) ? i.kulso_kepek.length : 0),
                    helyTavol: uj.hely_kezi && !i.jovahagyva ? await location.helyTavol(uj).catch(() => false) : false
                });

                if (v.hely_eredeti) v.hely_eredeti = JSON.stringify(v.hely_eredeti);

                v.hianyzo = JSON.stringify(q.hianyzo);
                v.problemak = JSON.stringify(q.problemak);
                v.ellenorzott = q.ellenorzott;

                const kulcsok = Object.keys(v);
                const sets = kulcsok.map((k, idx) => `${k} = $${idx + 1}${["hianyzo", "problemak", "hely_eredeti"].includes(k) ? "::jsonb" : ""}`);
                const params = kulcsok.map(k => v[k]);
                params.push(i.id);

                await db.query(
                    `UPDATE ingatlanok SET ${sets.join(", ")}, auto_javitva = NOW(), auto_javitva_v = ${VERZIO} WHERE id = $${params.length}`,
                    params
                );

                const mit = kulcsok.filter(k => !["hianyzo", "problemak", "ellenorzott", "arnm", "hely_forras", "hely_sugar", "y", "hely_pontossag"].includes(k))
                    .map(k => k === "x" ? "hely" : k);

                if (mit.length) {
                    job.javitott++;
                    mit.forEach(m => { job.mezok[m] = (job.mezok[m] || 0) + 1; });
                }

                if (q.ellenorzott && !i.ellenorzott) job.rendbe++;

            } catch (e) {
                job.hibak++;
                job.utolsoHiba = `#${i.id}: ${e.message}`;
            }

            job.kesz++;

        }

        job.utana = await reviewSzam();
        job.allapot = "kesz";

        await beallitas("autofix_v" + VERZIO, new Date().toISOString());

    } catch (e) {

        job.allapot = "hiba";
        job.utolsoHiba = e.message;

    }

    job.vege = new Date().toISOString();

    return job;

}

// opts.mind = true: az összes hirdetésre (nem csak az eddig nem javítottakra)
function indit(opts = {}) {

    if (fut && fut.allapot === "fut") return fut;

    fut = {
        allapot: "indul",
        osszes: 0,
        kesz: 0,
        javitott: 0,
        rendbe: 0,
        hibak: 0,
        mezok: {},
        elotte: null,
        utana: null,
        kezdes: new Date().toISOString(),
        vege: null
    };

    fut.promise = futtat(fut, opts);

    return fut;

}

// Telepítés után egyszer magától lefut (a meglévő hirdetésekre)
async function indulaskor() {

    try {
        await db.ready;
        if (await beallitas("autofix_v" + VERZIO)) return;
        console.log("Automatikus javítás indul a meglévő hirdetéseken...");
        const j = indit({ mind: false });   // ha a Render közben leállna, a következő indulás folytatja
        await j.promise;
        console.log(`Automatikus javítás kész: ${j.javitott} hirdetés javítva, ellenőrizendő ${j.elotte} -> ${j.utana}.`);
    } catch (e) {
        console.error("Automatikus javítás hiba:", e.message);
    }

}

module.exports = { javaslat, helyKeres, indit, allapot, indulaskor, beallitas, VERZIO };
