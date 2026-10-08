// ============================================================
//  Város és környéke
//
//  A falvakban (pl. Uzon, Kilyén, Árkos) lévő házak, telkek és más
//  hirdetések nem a városba valók, hanem a "<város> és környéke"
//  városba (pl. "Sepsiszentgyörgy és környéke"). Ez a modul:
//
//   - felismeri, melyik város kinek a környéke (varosok.anyavaros;
//     a "... és környéke" nevű várost magától hozzárendeli),
//   - kijavítja a rosszul felismert településeket (pl. a "Sfantu
//     Gheorghe (Covasna)" – itt a Covasna a MEGYE, nem Kovászna város),
//   - eldönti, hogy egy hirdetés a városban vagy a környékén van
//     (település, a hirdetés szövege, a hely távolsága alapján),
//   - automatikusan áthelyezi a biztosan környékbelieket (induláskor,
//     minden beolvasás után és új / módosított hirdetésnél),
//   - a bizonytalanokat javaslatként adja az adminnak
//     (Admin → Város és környéke), ahol egy kattintással rendezhetők.
//
//  Amit az admin kézzel döntött el (varos_kezi), azt az automatika
//  nem mozgatja.
// ============================================================

const db = require("../db/database");
const Telepulesek = require("../../public/js/core/telepulesek");
const textParse = require("./textParse");
const geo = require("./geocode");

// Az alapvárosok magyar neve (az adatbázisban ékezet nélkül vannak)
const MAGYAR_NEV = {
    Sepsiszentgyorgy: "Sepsiszentgyörgy", Kezdivasarhely: "Kézdivásárhely", Kovaszna: "Kovászna",
    Baroth: "Barót", Csikszereda: "Csíkszereda", Szekelyudvarhely: "Székelyudvarhely",
    Gyergyoszentmiklos: "Gyergyószentmiklós", Brasso: "Brassó", Marosvasarhely: "Marosvásárhely",
    Kolozsvar: "Kolozsvár", Deva: "Déva"
};

// A város más írásmódjai a hirdetésekben (nem települések!)
const ROVID_NEVEK = {
    Sepsiszentgyorgy: ["Sf. Gheorghe", "Sf.Gheorghe", "Sf Gheorghe", "Sfantu Gheorghe", "Sf.Gh.", "Szentgyörgy"],
    Kezdivasarhely: ["Tg. Secuiesc", "Tg Secuiesc", "Targu Secuiesc"],
    Csikszereda: ["M. Ciuc", "Miercurea-Ciuc"],
    Marosvasarhely: ["Tg. Mures", "Tg Mures", "Targu Mures"],
    Kolozsvar: ["Cluj"]
};

// A városon belüli helynevek, amiket a hirdetések néha "településnek" írnak
const VAROSI_HELYEK = {
    Sepsiszentgyorgy: ["Salomer", "Szalomer", "Őrkő", "Örkő", "Orko", "Lunca Oltului", "Olt-part", "Simeria Veche",
        "Dealul Bunica", "Dealul Partizanilor", "Kilyéni út", "Garii", "Gării", "Ciucului"]
};

const KORNYEK_NEV = /(?:^|[^a-z])(?:kornyek\w*|imprejurimi\w*|surrounding\w*|area|zona metropolitana|metropolitan\w*)(?:[^a-z]|$)/;

const kulcs = s => Telepulesek.kulcs(s);

// ---------- városok ----------

let cache = { ido: 0, lista: [] };

async function varosLista(friss) {
    if (!friss && cache.lista.length && Date.now() - cache.ido < 60 * 1000) return cache.lista;
    const r = await db.query("SELECT id, nev, nev_ro, megye, x, y, sugar_km, anyavaros FROM varosok ORDER BY nev");
    cache = { ido: Date.now(), lista: r.rows };
    return r.rows;
}

function cacheUrit() {
    cache = { ido: 0, lista: [] };
}

// Ez a város egy másik város környéke? -> az anyaváros neve, vagy null
async function anyaVarosa(varos) {
    if (!varos) return null;
    const v = (await varosLista()).find(x => x.nev === varos);
    return v && v.anyavaros ? v.anyavaros : null;
}

async function isKornyek(varos) {
    return !!(await anyaVarosa(varos));
}

// A város "... és környéke" városa (ha van)
async function kornyekVarosa(varos) {
    if (!varos) return null;
    const k = (await varosLista()).find(x => x.anyavaros === varos);
    return k ? k.nev : null;
}

function magyarNev(varos) {
    return MAGYAR_NEV[varos] || varos;
}

// A város összes neve (a falu-felismerés ezeket nem tekinti településnek)
function varosNevei(v) {
    if (!v) return [];
    return [v.nev, magyarNev(v.nev), v.nev_ro, geo.VAROS_RO[v.nev], ...(ROVID_NEVEK[v.nev] || [])].filter(Boolean);
}

// Egy város összes neve a mi kulcsa alapján (a szövegből való falu-felismeréshez)
async function varosNevek(varos) {
    const v = (await varosLista()).find(x => x.nev === varos);
    return varosNevei(v || { nev: varos });
}

// A "... és környéke" nevű városokat magától az anyavárosukhoz kötjük
async function osszekapcsol() {

    const lista = await varosLista(true);
    let db0 = 0;

    for (const v of lista) {

        // Már be van állítva (üres szöveg: az admin szerint önálló város)
        if (v.anyavaros !== null && v.anyavaros !== undefined) continue;

        const n = kulcs(v.nev);
        if (!KORNYEK_NEV.test(n)) continue;

        // A leghosszabb illeszkedő városnév nyer ("Sepsiszentgyörgy és környéke" -> Sepsiszentgyorgy)
        const anya = lista
            .filter(x => x.nev !== v.nev && !x.anyavaros)
            .map(x => ({ x, nevek: varosNevei(x).map(kulcs).filter(k => k.length >= 4) }))
            .map(o => ({ ...o, hossz: Math.max(0, ...o.nevek.filter(k => n.includes(k)).map(k => k.length)) }))
            .filter(o => o.hossz > 0)
            .sort((a, b) => b.hossz - a.hossz)[0];

        if (!anya) continue;

        await db.query("UPDATE varosok SET anyavaros = $1 WHERE id = $2 AND anyavaros IS NULL", [anya.x.nev, v.id]);
        db0++;

    }

    if (db0) cacheUrit();
    return db0;

}

// Új környék-város egy városhoz ("Sepsiszentgyörgy és környéke")
async function letrehoz(varos) {

    const lista = await varosLista(true);
    const v = lista.find(x => x.nev === varos);
    if (!v) return null;

    const van = lista.find(x => x.anyavaros === varos);
    if (van) return van;

    const nev = `${magyarNev(v.nev)} és környéke`;
    const ro = v.nev_ro || geo.VAROS_RO[v.nev] || null;
    const nevRo = ro ? `${ro} și împrejurimi` : null;

    const r = await db.query(
        `INSERT INTO varosok (nev, nev_ro, megye, anyavaros) VALUES ($1, $2, $3, $4)
         ON CONFLICT (nev) DO UPDATE SET anyavaros = CASE WHEN COALESCE(varosok.anyavaros, '') = '' THEN EXCLUDED.anyavaros ELSE varosok.anyavaros END
         RETURNING id, nev, nev_ro, megye, x, y, sugar_km, anyavaros`,
        [nev, nevRo, v.megye, v.nev]
    );

    cacheUrit();
    return r.rows[0];

}

// Egy város (környék-város) helyadatai a helymeghatározáshoz: ha nincs saját
// közepe, az anyavárosé, nagyobb sugárral
async function helyAdat(varos) {
    const lista = await varosLista();
    const v = lista.find(x => x.nev === varos);
    if (!v || !v.anyavaros) return null;
    const a = lista.find(x => x.nev === v.anyavaros);
    if (!a) return null;
    return {
        ...v,
        x: v.x || a.x, y: v.y || a.y,
        megye: v.megye || a.megye,
        nev_ro: a.nev_ro || geo.VAROS_RO[a.nev] || a.nev,
        sugar_km: Math.max(Number(v.sugar_km) || 0, 30),
        anya: a
    };
}

// ---------- egy hirdetés: városban vagy a környéken? ----------

// Az anyaváros adatai a döntéshez (kerületnevek, belső helynevek, közép, sugár)
async function kontextus(base) {

    const lista = await varosLista();
    const v = lista.find(x => x.nev === base);
    if (!v) return null;

    const k = await db.query("SELECT nev, nev_ro, aliasok FROM keruletek WHERE varos = $1", [base]);

    const belso = new Set([
        ...varosNevei(v),
        ...(VAROSI_HELYEK[base] || []),
        ...k.rows.flatMap(x => [x.nev, x.nev_ro, ...String(x.aliasok || "").split(",")])
    ].map(kulcs).filter(Boolean));

    const kozep = v.x && v.y ? { x: Number(v.x), y: Number(v.y) } : null;
    const sugar = Number(v.sugar_km) || 6;

    return {
        base, v, belso, kozep, sugar,
        kornyek: (lista.find(x => x.anyavaros === base) || {}).nev || null,
        varosRo: v.nev_ro || geo.VAROS_RO[base] || base,
        nevek: varosNevei(v)
    };

}

function ismertFalu(nev) {
    const t = Telepulesek.keres(nev);
    return t ? t.ro : null;
}

// A szövegből (cím, forrás szerinti környék = erős; leírás = gyenge) felismert falu
function szovegbol(i, ctx) {
    return textParse.telepulesKeres(
        ctx.varosRo,
        [i.cim, i.forras_kerulet].filter(Boolean),
        [i.leiras, i.forras_szoveg].filter(Boolean).map(s => String(s).slice(0, 4000)),
        { varos: ctx.base, varosNevek: ctx.nevek }
    );
}

// A kézzel (űrlapon) beírt települést elhisszük; a beolvasott / szövegből
// felismertet ellenőrizzük
const kezi = i => !!i.forras_tipus && i.forras_tipus !== "import";

//  A "település" mező javítása. -> undefined (marad), null (törlendő: a városban van),
//  vagy az új (román) településnév.
//   - a város saját neve, kerülete, belső helyneve -> a városban van
//   - "Covasna": szinte mindig a megye ("Sfantu Gheorghe (Covasna)") – csak akkor
//     marad, ha a szöveg is egyértelműen Kovászna városra utal
//   - köznapi szó ("frumoasă" = szép): csak ha a szöveg is alátámasztja
//   - ismeretlen írásmód ("Sugas bai", "Kovászna, zágon"): a felismert falu neve
//  sz: a szövegből felismert falu (ha már kiszámoltuk)
function telepulesJavitas(i, ctx, sz) {

    const t = i.telepules ? String(i.telepules).trim() : "";
    if (!t) return undefined;

    const k = kulcs(t);

    if (ctx.belso.has(k)) return null;

    const ismert = ismertFalu(t);

    if (ismert && Telepulesek.koznev(ismert) && !kezi(i)) {
        // Covasna / Frumoasa / Reci...: csak akkor marad, ha a szöveg is ezt mondja
        const szoveg = sz !== undefined ? sz : szovegbol(i, ctx);
        if (szoveg === ismert) return ismert === t ? undefined : ismert;
        return szoveg || null;
    }

    if (ismert) return ismert === t ? undefined : ismert;

    // Ismeretlen név: ha benne van egy ismert falu neve, az lesz
    const benne = textParse.telepulesKeres(ctx.varosRo, [t], [], { varos: ctx.base, varosNevek: ctx.nevek });
    if (benne) return benne;

    return undefined;

}

const PONTOS = ["pontos", "utca"];

function km(x1, y1, x2, y2) {
    return geo.km(Number(x1), Number(y1), Number(x2), Number(y2));
}

//  A hirdetés a városban van, vagy a környékén?
//   -> { kint: true | false | null (bizonytalan – javaslat), telepules, ok, km }
//   ok: telepules | szoveg | hely | hely_kozel | ismeretlen_telepules
function besorolas(i, ctx, sz) {

    if (sz === undefined) sz = szovegbol(i, ctx);
    const javitott = telepulesJavitas(i, ctx, sz);
    const telepules = javitott === undefined ? (i.telepules || null) : javitott;
    const tavolsag = ctx.kozep && i.x && i.y ? Math.round(km(ctx.kozep.x, ctx.kozep.y, i.x, i.y) * 10) / 10 : null;

    // 1) Ismert falu a "település" mezőben
    if (telepules && ismertFalu(telepules)) return { kint: true, telepules: ismertFalu(telepules), ok: "telepules", km: tavolsag };

    // 2) A cím / a forrásoldal környék-neve / a leírás egy falut említ
    if (sz) return { kint: true, telepules: sz, ok: "szoveg", km: tavolsag };

    // 3) Ismeretlen településnév (nem a város és nem kerület): az admin döntsön
    if (telepules) return { kint: null, telepules, ok: "ismeretlen_telepules", km: tavolsag };

    // 4) A hely távolsága a város közepétől. Lakásnál, üzletnél nagyobb a
    //    tűréshatár (egy rosszul letett pont miatt ne kerüljön falura).
    if (tavolsag !== null) {
        const pontos = PONTOS.includes(i.hely_pontossag || "pontos") && !["kerulet", "telepules"].includes(i.hely_forras);
        const forrasbol = i.hely_pontossag === "kozelito" && i.hely_forras === "forras";
        const kulso = ["haz", "telek"].includes(i.tipus || "lakas");
        const hatar = kulso ? ctx.sugar : ctx.sugar + 2;
        if (pontos && tavolsag > hatar) return { kint: true, telepules: null, ok: "hely", km: tavolsag };
        if (forrasbol && tavolsag > ctx.sugar * 2) return { kint: true, telepules: null, ok: "hely", km: tavolsag };
        if (pontos && tavolsag > ctx.sugar * 0.55) return { kint: null, telepules: null, ok: "hely_kozel", km: tavolsag };
    }

    return { kint: false, telepules: telepules || null, ok: null, km: tavolsag };

}

// ---------- adatbázis-műveletek ----------

const MEZOK = `i.id, i.varos, i.tipus, i.ugylet, i.cim, i.leiras, i.forras_szoveg, i.forras_kerulet, i.telepules, i.kerulet,
               i.x, i.y, i.hely_pontossag, i.hely_forras, i.hely_kezi, i.varos_kezi, i.varos_ok, i.varos_eredeti,
               i.statusz, i.forras_tipus, i.ar, i.nm, i.link, i.kulso_kepek,
               (SELECT k.id FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id ORDER BY k.sorrend, k.id LIMIT 1) AS kep_id`;

const ELO_STATUSZ = "i.statusz IN ('aktiv', 'fuggo', 'nem_elerheto')";

// A helyét újra kell számolni (a régi pont a rossz településből / a város egy
// kerületéből jött) – a háttérben, a helymeghatározással
const helySor = new Set();
let helyFut = false;

function helyUjra(id) {
    helySor.add(id);
    if (!helyFut) setTimeout(helyFeldolgoz, 3000).unref?.();
}

async function helyFeldolgoz() {

    if (helyFut) return;
    helyFut = true;

    try {
        const location = require("./location");
        while (helySor.size) {
            const id = helySor.values().next().value;
            helySor.delete(id);
            const r = await db.query("SELECT * FROM ingatlanok WHERE id = $1", [id]);
            const i = r.rows[0];
            if (!i || i.hely_kezi) continue;
            const szoveg = [i.cim, i.leiras, i.forras_szoveg].filter(Boolean).join("\n");
            let h = null;
            try { h = await location.helyKeres({ ...i, x: null, y: null }, szoveg); } catch (e) { h = null; }
            if (h) {
                await db.query(
                    "UPDATE ingatlanok SET x = $1, y = $2, hely_pontossag = $3, hely_sugar = $4, hely_forras = $5, updated_at = NOW() WHERE id = $6",
                    [h.x, h.y, h.szint, h.szint === "kozelito" ? h.sugar : null, h.forras, id]
                );
            } else {
                await db.query(
                    "UPDATE ingatlanok SET x = NULL, y = NULL, hely_pontossag = 'nincs', hely_sugar = NULL, hely_forras = NULL, updated_at = NOW() WHERE id = $1",
                    [id]
                );
            }
        }
    } catch (e) {
        console.error("Környék – hely újraszámolása:", e.message);
    } finally {
        helyFut = false;
    }

}

//  Automatikus rendezés: a rossz települések javítása, a biztosan
//  környékbeli hirdetések áthelyezése a környék-városba.
//   opts.varos: csak ennek a városnak (anyavárosnak) a hirdetései
//   opts.probaKor: csak kiszámolja, nem ír semmit (a teszthez / előnézethez)
async function rendez(opts = {}) {

    await osszekapcsol();

    const lista = await varosLista(true);
    const parok = lista.filter(k => k.anyavaros && (!opts.varos || k.anyavaros === opts.varos || k.nev === opts.varos));
    const e = { javitottTelepules: 0, athelyezve: 0, visszateve: 0, javaslat: 0, reszletek: [] };
    // A bizonytalan esetek száma városonként (az admin menü számlálójához)
    const javaslatSzam = {};
    parok.forEach(k => { javaslatSzam[k.anyavaros] = 0; });

    for (const k of parok) {

        const ctx = await kontextus(k.anyavaros);
        if (!ctx) continue;

        // 1) Az anyaváros hirdetései
        const r = await db.query(`SELECT ${MEZOK} FROM ingatlanok i WHERE i.varos = $1 AND ${ELO_STATUSZ}`, [ctx.base]);

        for (const i of r.rows) {

            const sz = szovegbol(i, ctx);
            const jav = telepulesJavitas(i, ctx, sz);
            const b = besorolas(i, ctx, sz);

            const regiTelepules = i.telepules || null;
            const ujTelepules = jav === undefined ? regiTelepules : jav;

            // A település mező javítása (csak az automatikusan beolvasott / kitöltött adatnál)
            const javithato = jav !== undefined && (i.forras_tipus === "import" || ctx.belso.has(kulcs(regiTelepules)));

            if (b.kint === true && !i.varos_kezi) {

                const telepules = b.telepules || (javithato ? ujTelepules : regiTelepules);
                e.athelyezve++;
                e.reszletek.push({ id: i.id, mit: "athelyez", telepules, ok: b.ok, km: b.km });

                if (!opts.probaKor) {
                    await db.query(
                        `UPDATE ingatlanok SET varos = $1, kerulet = NULL, telepules = $2, varos_ok = $3, varos_eredeti = $4, updated_at = NOW()
                         WHERE id = $5`,
                        [k.nev, telepules, b.ok, ctx.base, i.id]
                    );
                    // A városi kerület közepére tett közelítő pont, vagy a rossz faluból számolt pont: újra
                    if (!i.hely_kezi && (["kerulet"].includes(i.hely_forras) || (i.hely_forras === "telepules" && telepules !== regiTelepules) || !(i.x && i.y))) helyUjra(i.id);
                }
                continue;

            }

            if (javithato && ujTelepules !== regiTelepules) {
                e.javitottTelepules++;
                e.reszletek.push({ id: i.id, mit: "telepules", regi: regiTelepules, uj: ujTelepules });
                if (!opts.probaKor) {
                    await db.query("UPDATE ingatlanok SET telepules = $1, updated_at = NOW() WHERE id = $2", [ujTelepules, i.id]);
                    if (!i.hely_kezi && i.hely_forras === "telepules") helyUjra(i.id);
                }
            }

            if (b.kint === null && !i.varos_kezi) {
                e.javaslat++;
                javaslatSzam[ctx.base] = (javaslatSzam[ctx.base] || 0) + 1;
            }

        }

        // 2) A környék-város hirdetései: a rossz település javítása, és ha az
        //    automatika tette át, de már nem környékbeli (pl. a "Covasna" a megye
        //    volt), vissza az anyavárosba
        const r2 = await db.query(`SELECT ${MEZOK} FROM ingatlanok i WHERE i.varos = $1 AND ${ELO_STATUSZ}`, [k.nev]);

        for (const i of r2.rows) {

            const sz = szovegbol(i, ctx);
            const jav = telepulesJavitas(i, ctx, sz);
            const regi = i.telepules || null;
            let uj = jav === undefined ? regi : jav;

            // A környék-városban a kerület helyett a település: a régi kerület-név (pl. "Málnás") -> település
            if (!uj && i.kerulet && ismertFalu(i.kerulet)) uj = ismertFalu(i.kerulet);
            if (!uj && sz) uj = sz;

            const b = besorolas({ ...i, telepules: uj }, ctx, sz);

            if (i.varos_eredeti === ctx.base && !i.varos_kezi && b.kint === false) {
                e.visszateve++;
                e.reszletek.push({ id: i.id, mit: "vissza" });
                if (!opts.probaKor) {
                    await db.query(
                        "UPDATE ingatlanok SET varos = $1, telepules = $2, varos_ok = NULL, varos_eredeti = NULL, updated_at = NOW() WHERE id = $3",
                        [ctx.base, uj, i.id]
                    );
                    if (!i.hely_kezi && i.hely_forras === "telepules" && uj !== regi) helyUjra(i.id);
                }
                continue;
            }

            if (uj !== regi) {
                e.javitottTelepules++;
                e.reszletek.push({ id: i.id, mit: "telepules", regi, uj });
                if (!opts.probaKor) {
                    await db.query("UPDATE ingatlanok SET telepules = $1, updated_at = NOW() WHERE id = $2", [uj, i.id]);
                    if (!i.hely_kezi && i.hely_forras === "telepules") helyUjra(i.id);
                }
            }

        }

    }

    if (!opts.probaKor) {
        const regi = await utolsoFutas();
        await db.query(
            `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ('kornyek_utolso', $1, NOW())
             ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`,
            [JSON.stringify({
                ido: new Date().toISOString(), athelyezve: e.athelyezve, visszateve: e.visszateve,
                javitottTelepules: e.javitottTelepules, javaslat: e.javaslat,
                javaslatok: { ...((regi && regi.javaslatok) || {}), ...javaslatSzam }
            })]
        );
        if (e.athelyezve || e.visszateve || e.javitottTelepules) {
            console.log(`Város és környéke: ${e.athelyezve} hirdetés a környékre, ${e.visszateve} vissza a városba, ${e.javitottTelepules} település javítva, ${e.javaslat} javaslat az adminnak.`);
        }
    }

    return e;

}

//  Új / módosított hirdetés (még mentés előtt): ha az anyavárosban van, de a
//  települése / szövege / helye szerint a környéken, a környék-városba kerül.
//   d: a normalizált hirdetés (varos, tipus, telepules, cim, leiras, x, y...)
//   -> { athelyezve: bool, ok } – d-t helyben módosítja (varos, kerulet, telepules,
//      varos_ok, varos_eredeti)
async function helyreTesz(d, extra = {}) {

    if (!d || !d.varos) return { athelyezve: false };

    const kv = await kornyekVarosa(d.varos);
    if (!kv) return { athelyezve: false };

    const ctx = await kontextus(d.varos);
    if (!ctx) return { athelyezve: false };

    const b = besorolas({ ...d, forras_kerulet: d.forras_kerulet || extra.varosForras || null }, ctx);

    if (b.kint !== true) {
        // A város saját neve / kerülete "településként": a városban van
        const jav = telepulesJavitas(d, ctx);
        if (jav === null) d.telepules = null;
        return { athelyezve: false };
    }

    d.varos_eredeti = d.varos;
    d.varos = kv;
    d.kerulet = null;
    d.telepules = b.telepules || d.telepules || null;
    d.varos_ok = b.ok;

    return { athelyezve: true, ok: b.ok, varos: kv };

}

// ---------- az admin felülethez ----------

function kartya(i, extra = {}) {
    return {
        id: i.id, varos: i.varos, tipus: i.tipus, ugylet: i.ugylet, cim: i.cim, ar: i.ar, nm: i.nm,
        telepules: i.telepules, kerulet: i.kerulet, x: i.x, y: i.y, hely_pontossag: i.hely_pontossag,
        hely_forras: i.hely_forras, varos_ok: i.varos_ok, varos_eredeti: i.varos_eredeti, varos_kezi: !!i.varos_kezi,
        statusz: i.statusz, link: i.link, kep_id: i.kep_id,
        kulso_kep: Array.isArray(i.kulso_kepek) && i.kulso_kepek.length ? i.kulso_kepek[0] : null,
        ...extra
    };
}

// Az utolsó automatikus rendezés adatai (és a bizonytalan esetek száma városonként)
async function utolsoFutas() {
    try {
        const u = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = 'kornyek_utolso'");
        return u.rows[0] && u.rows[0].ertek ? JSON.parse(u.rows[0].ertek) : null;
    } catch (e) {
        return null;
    }
}

// Az admin menü számlálója: ennyi hirdetésről kell dönteni (marad / a környékre)
async function javaslatDb() {
    const u = await utolsoFutas();
    if (!u) return 0;
    if (u.javaslatok) return Object.values(u.javaslatok).reduce((s, n) => s + (Number(n) || 0), 0);
    return Number(u.javaslat) || 0;
}

//  Az admin oldal adatai egy anyavároshoz:
//   javaslatok: az anyaváros bizonytalan hirdetései (lehet, hogy a környéken vannak)
//   kornyekben: a környék-város hirdetései (településsel, az áthelyezés okával)
async function attekintes(base) {

    await osszekapcsol();

    const ctx = await kontextus(base);
    if (!ctx) return null;

    const r = await db.query(`SELECT ${MEZOK} FROM ingatlanok i WHERE i.varos = $1 AND ${ELO_STATUSZ} ORDER BY i.id DESC`, [base]);

    const javaslatok = [];
    for (const i of r.rows) {
        if (i.varos_kezi) continue;
        const b = besorolas(i, ctx);
        if (b.kint === null || b.kint === true) javaslatok.push(kartya(i, { javaslat: b }));
    }

    let kornyekben = [];
    if (ctx.kornyek) {
        const r2 = await db.query(`SELECT ${MEZOK} FROM ingatlanok i WHERE i.varos = $1 AND ${ELO_STATUSZ} ORDER BY i.telepules NULLS FIRST, i.id DESC`, [ctx.kornyek]);
        kornyekben = r2.rows.map(i => kartya(i));
    }

    // A bizonytalan esetek száma (az admin menü számlálója) – a mostani állapot szerint
    let utolso = await utolsoFutas();
    if (utolso && (utolso.javaslatok || {})[base] !== javaslatok.length) {
        utolso = { ...utolso, javaslatok: { ...(utolso.javaslatok || {}), [base]: javaslatok.length } };
        await db.query("UPDATE beallitasok SET ertek = $1 WHERE kulcs = 'kornyek_utolso'", [JSON.stringify(utolso)]).catch(() => { });
    }

    return {
        varos: base,
        kornyek: ctx.kornyek,
        kozep: ctx.kozep,
        sugar: ctx.sugar,
        varosDb: r.rowCount,
        javaslatok,
        kornyekben,
        telepulesek: Telepulesek.regio(base),
        utolso
    };

}

//  Kézi áthelyezés (admin): cel = "kornyek" | "varos"; a döntés kézi, az
//  automatika többé nem mozgatja ezeket.
async function athelyez(ids, base, cel, telepules) {

    const kv = await kornyekVarosa(base);
    if (!kv) return { frissitett: 0 };

    const ide = cel === "kornyek" ? kv : base;
    const params = [ide, ids, cel === "kornyek" ? "kezi" : null];

    let sql = `UPDATE ingatlanok SET varos = $1, varos_kezi = true, varos_ok = $3,
                   varos_eredeti = CASE WHEN varos <> $1 THEN varos ELSE varos_eredeti END,
                   kerulet = CASE WHEN varos <> $1 THEN NULL ELSE kerulet END, updated_at = NOW()`;

    if (telepules !== undefined) {
        params.push(telepules ? (ismertFalu(telepules) || String(telepules).trim().slice(0, 100)) : null);
        sql += `, telepules = $${params.length}`;
    }

    const r = await db.query(`${sql} WHERE id = ANY($2::int[]) RETURNING id`, params);

    return { frissitett: r.rowCount, varos: ide };

}

// A "marad a városban" döntés (a javaslat többé nem jelenik meg)
async function marad(ids) {
    const r = await db.query("UPDATE ingatlanok SET varos_kezi = true, updated_at = NOW() WHERE id = ANY($1::int[]) RETURNING id", [ids]);
    return { frissitett: r.rowCount };
}

async function telepulesBeallit(ids, telepules) {
    const t = telepules ? (ismertFalu(telepules) || String(telepules).trim().slice(0, 100)) : null;
    const r = await db.query("UPDATE ingatlanok SET telepules = $1, updated_at = NOW() WHERE id = ANY($2::int[]) RETURNING id, hely_kezi, hely_forras", [t, ids]);
    r.rows.forEach(i => { if (!i.hely_kezi && ["telepules", "kerulet"].includes(i.hely_forras)) helyUjra(i.id); });
    return { frissitett: r.rowCount, telepules: t };
}

// Induláskor: összekapcsolás, majd az automatikus rendezés (a háttérben)
async function indulaskor() {
    try {
        await db.ready;
        await rendez();
    } catch (e) {
        console.error("Város és környéke – automatikus rendezés:", e.message);
    }
}

module.exports = {
    varosLista, cacheUrit, anyaVarosa, isKornyek, kornyekVarosa, osszekapcsol, letrehoz, helyAdat, varosNevek,
    kontextus, besorolas, telepulesJavitas, rendez, helyreTesz, attekintes, athelyez, marad, telepulesBeallit, javaslatDb,
    indulaskor, magyarNev, MAGYAR_NEV
};
