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
const textParse = require("./textParse");
const { geocode, VAROS_RO } = require("./geocode");
const { TIPUS_MEZOK } = require("./listing");
const Telepulesek = require("../../public/js/core/telepulesek");

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

    const nm = v.nm || i.nm;
    const ar = i.ar;

    if (ar > 0 && nm > 0 && (v.nm || ures(i.arnm))) v.arnm = ar / nm;

    // ---- 2) Kerület (lakás, üzlet, iroda)
    if (mezok.kerulet && ures(i.kerulet) && i.varos) {

        const kerulet =
            await quality.keruletKeres(i.varos, i.forras_kerulet, extra.utca, i.cim) ||
            await quality.keruletSzovegbol(i.varos, szoveg);

        if (kerulet) v.kerulet = kerulet;

    }

    // ---- 3) Település (ház, telek)
    if (mezok.telepules && ures(i.telepules)) {

        const varosRo = VAROS_RO[i.varos] || i.varos || "";

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

        const hely = await helyKeres({ ...i, ...v }, szoveg, extra);

        if (hely) {
            v.x = hely.x;
            v.y = hely.y;
            v.hely_pontossag = hely.szint;
        } else if (i.hely_pontossag !== "nincs") {
            v.hely_pontossag = "nincs";
        }

    } else if (!i.hely_pontossag) {
        v.hely_pontossag = "pontos";
    }

    return v;

}

// Közelítő hely: utca a szövegből -> település -> kerület / forrás szerinti környék
async function helyKeres(d, szoveg, extra = {}) {

    const probak = [];

    textParse.helyTippek(szoveg).forEach(t => probak.push({ szoveg: t.szoveg, varos: d.varos, szint: t.szint }));

    if (extra.utca) probak.unshift({ szoveg: extra.utca, varos: d.varos, szint: "utca" });

    if (d.telepules) {
        const t = Telepulesek.keres(d.telepules);
        probak.push({ szoveg: t ? t.ro : d.telepules, varos: null, megye: MEGYE[d.varos], szint: "kozelito" });
    }

    if (d.kerulet) {
        const r = await db.query("SELECT nev_ro FROM keruletek WHERE varos = $1 AND nev = $2", [d.varos, d.kerulet]);
        const ro = r.rows[0] && r.rows[0].nev_ro;
        if (ro) probak.push({ szoveg: ro, varos: d.varos, szint: "kozelito" });
        probak.push({ szoveg: d.kerulet, varos: d.varos, szint: "kozelito" });
    }

    if (d.forras_kerulet) probak.push({ szoveg: d.forras_kerulet, varos: d.varos, szint: "kozelito" });

    for (const p of probak.slice(0, 4)) {

        const h = await geocode(p.szoveg, p.varos, p.megye);

        if (h && helyJo(h, d.varos, !!d.telepules)) {
            // Az utcanév csak akkor "utca" pontosságú, ha a térkép is utcát talált
            return { x: h.x, y: h.y, szint: p.szint === "utca" && h.szint === "utca" ? "utca" : "kozelito" };
        }

    }

    return null;

}

// A városok megyéje (a település-kereséshez) és közepe (a józan-ész ellenőrzéshez)
const MEGYE = {
    Sepsiszentgyorgy: "Covasna", Kezdivasarhely: "Covasna", Kovaszna: "Covasna", Baroth: "Covasna",
    Csikszereda: "Harghita", Szekelyudvarhely: "Harghita", Gyergyoszentmiklos: "Harghita",
    Brasso: "Brașov", Marosvasarhely: "Mureș", Kolozsvar: "Cluj"
};

const KOZEP = {
    Sepsiszentgyorgy: [25.79, 45.865], Kezdivasarhely: [26.13, 46.0], Csikszereda: [25.80, 46.36],
    Brasso: [25.59, 45.65], Marosvasarhely: [24.56, 46.54], Kolozsvar: [23.60, 46.77]
};

// Ne tegyük a hirdetést egy azonos nevű utcára egy másik városban
function helyJo(h, varos, telepules) {
    const k = KOZEP[varos];
    if (!k) return true;
    const km = Math.hypot((h.x - k[0]) * 77, (h.y - k[1]) * 111);
    return km <= (telepules ? 40 : 12);
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
        if (!opts.mind) felt.push("auto_javitva IS NULL");

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
                    kepDb: (i.kep_db || 0) + (Array.isArray(i.kulso_kepek) ? i.kulso_kepek.length : 0)
                });

                v.hianyzo = JSON.stringify(q.hianyzo);
                v.problemak = JSON.stringify(q.problemak);
                v.ellenorzott = q.ellenorzott;

                const kulcsok = Object.keys(v);
                const sets = kulcsok.map((k, idx) => `${k} = $${idx + 1}${["hianyzo", "problemak"].includes(k) ? "::jsonb" : ""}`);
                const params = kulcsok.map(k => v[k]);
                params.push(i.id);

                await db.query(
                    `UPDATE ingatlanok SET ${sets.join(", ")}, auto_javitva = NOW() WHERE id = $${params.length}`,
                    params
                );

                const mit = kulcsok.filter(k => !["hianyzo", "problemak", "ellenorzott", "arnm"].includes(k));

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

        await beallitas("autofix_v1", new Date().toISOString());

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
        if (await beallitas("autofix_v1")) return;
        console.log("Automatikus javítás indul a meglévő hirdetéseken...");
        const j = indit({ mind: false });   // ha a Render közben leállna, a következő indulás folytatja
        await j.promise;
        console.log(`Automatikus javítás kész: ${j.javitott} hirdetés javítva, ellenőrizendő ${j.elotte} -> ${j.utana}.`);
    } catch (e) {
        console.error("Automatikus javítás hiba:", e.message);
    }

}

module.exports = { javaslat, helyKeres, indit, allapot, indulaskor, beallitas };
