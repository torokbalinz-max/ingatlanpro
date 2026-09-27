// ============================================================
//  Duplikált hirdetések keresése, összevonása
//
//  1) Biztos: ugyanaz a link többször -> egy gombbal törölhető.
//  2) Ugyanaz az ingatlan más oldalon (más link): pontszám a
//     fotók (ujjlenyomat), az ár, a terület, a szobák, az emelet és
//     a hely alapján. Két csoport:
//       - "nagyon valószínű": egyező fotók és nincs ellentmondás
//         -> egy kattintással mind összevonható
//       - "lehetséges": csak az adatok hasonlók -> képekkel egymás
//         mellett, gyors döntés (billentyűk)
//  A "nem ugyanaz" döntést megjegyezzük (dup_kizart), nem kérdezzük újra.
// ============================================================

const db = require("../db/database");
const { normLink } = require("./listing");
const imagehash = require("./imagehash");
const { km } = require("./geocode");

function emeletSzam(e) {
    const n = parseInt(String(e || "").split("/")[0], 10);
    return isNaN(n) ? null : n;
}

function osszSzint(e) {
    const n = parseInt(String(e || "").split("/")[1], 10);
    return isNaN(n) ? null : n;
}

const kulonbseg = (a, b) => (a > 0 && b > 0) ? Math.abs(a - b) / Math.max(a, b) : null;

// Mennyire teljes egy hirdetés (a megtartandó javaslathoz)
function teljesseg(i) {
    return ["ar", "nm", "szobak", "emelet", "allapot", "kerulet", "cim", "leiras", "evszam", "telek_nm", "x"]
        .filter(k => i[k] !== null && i[k] !== undefined && i[k] !== "").length +
        (i.kep_db || 0) * 2 + Math.min((i.kulso_kepek || []).length, 10) * 0.5 +
        (i.kedvenc_db > 0 ? 50 : 0) + (i.owner_id ? 30 : 0) + (i.jovahagyva ? 5 : 0);
}

// Két hirdetés összevetése -> null (nem ugyanaz) vagy { pont, eros, okok, kepPar }
function osszevet(a, b, hashA, hashB, gyakori) {

    // Ellentmondások: ha ezek eltérnek, biztosan nem ugyanaz
    if (a.szobak > 0 && b.szobak > 0 && a.szobak !== b.szobak) return null;

    const ea = emeletSzam(a.emelet), eb = emeletSzam(b.emelet);
    const emeletEgyezik = ea !== null && eb !== null && ea === eb;
    if (ea !== null && eb !== null && ea !== eb) return null;

    // Az épület szintjeinek száma ("3/4" vs "3/10") is eltérhet
    const oa = osszSzint(a.emelet), ob = osszSzint(b.emelet);
    if (oa !== null && ob !== null && oa !== ob) return null;

    const nmK = kulonbseg(a.nm, b.nm);
    if (nmK !== null && nmK > 0.12) return null;

    const arK = kulonbseg(a.ar, b.ar);
    if (arK !== null && arK > 0.25) return null;

    // Fotók
    let kepDb = 0;
    const kepPar = [];
    const hasznaltB = new Set();

    for (const ha of hashA) {
        if (gyakori.has(ha.hash)) continue;
        for (const hb of hashB) {
            if (hasznaltB.has(hb.forras) || gyakori.has(hb.hash)) continue;
            if (imagehash.tavolsag(ha.hash, hb.hash) <= imagehash.EGYEZES_BIT) {
                kepDb++;
                kepPar.push([ha.forras, hb.forras]);
                hasznaltB.add(hb.forras);
                break;
            }
        }
    }

    // Hely (ha mindkettőnek pontos helye van)
    let tav = null;
    if (a.x && b.x && ["pontos", "utca"].includes(a.hely_pontossag || "pontos") && ["pontos", "utca"].includes(b.hely_pontossag || "pontos")) {
        tav = km(a.x, a.y, b.x, b.y);
    }

    let pont = 0;
    const okok = [];

    if (kepDb >= 2) { pont += 60; okok.push({ k: "kep", n: kepDb }); }
    else if (kepDb === 1) { pont += 35; okok.push({ k: "kep", n: 1 }); }

    if (arK !== null && arK <= 0.02) { pont += 20; okok.push({ k: "ar_egyezik" }); }
    else if (arK !== null && arK <= 0.08) { pont += 10; okok.push({ k: "ar_kozel", p: Math.round(arK * 100) }); }

    if (nmK !== null && nmK <= 0.02) { pont += 20; okok.push({ k: "nm_egyezik" }); }
    else if (nmK !== null && nmK <= 0.06) { pont += 8; okok.push({ k: "nm_kozel" }); }

    if (a.szobak > 0 && a.szobak === b.szobak) { pont += 6; okok.push({ k: "szoba" }); }
    if (emeletEgyezik) { pont += 8; okok.push({ k: "emelet" }); }
    if (a.kerulet && a.kerulet === b.kerulet) { pont += 4; okok.push({ k: "kerulet" }); }

    if (tav !== null) {
        if (tav <= 0.15) { pont += 12; okok.push({ k: "hely", m: Math.round(tav * 1000) }); }
        // Két pontos hely több mint 1 km-re: fotó nélkül nem lehet ugyanaz
        else if (tav > 1 && kepDb === 0) return null;
    }

    // Erős (nagyon valószínű): egyező fotók, vagy az ár + terület + szoba/emelet is egyezik
    const adatEros = arK !== null && arK <= 0.02 && nmK !== null && nmK <= 0.02 && (a.szobak > 0 || emeletEgyezik);
    // (fotó nélkül csak akkor, ha a térképen is ugyanott van – a panellakások nagyon hasonlók)
    const eros = kepDb >= 2 ||
        (kepDb === 1 && (arK === null || arK <= 0.1) && (nmK === null || nmK <= 0.05)) ||
        (adatEros && emeletEgyezik && tav !== null && tav <= 0.15);

    // Fotó nélkül (a panellakások nagyon hasonlók!) csak ha az ár és a terület
    // is szinte ugyanaz, és van még egyező adat
    if (kepDb === 0) {
        if (!(arK !== null && arK <= 0.04 && nmK !== null && nmK <= 0.03)) return null;
        if (pont < 50) return null;
    }

    // Legalább ennyi kell, hogy egyáltalán mutassuk
    if (pont < 40) return null;

    return { pont: Math.min(100, pont), eros, okok, kepPar };

}

async function keres() {

    const r = await db.query(`
        SELECT i.id, i.link, i.ar, i.nm, i.szobak, i.emelet, i.allapot, i.varos, i.kerulet, i.telepules,
               i.tipus, i.ugylet, i.cim, i.created_at, i.tovabbi_linkek, i.kulso_kepek, i.x, i.y, i.hely_pontossag,
               i.statusz, i.owner_id, i.jovahagyva, i.leiras IS NOT NULL AS leiras, i.evszam, i.telek_nm,
               (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id)::int AS kep_db,
               (SELECT k.id FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id ORDER BY k.sorrend, k.id LIMIT 1) AS kep_id,
               (SELECT COUNT(*) FROM favorites f WHERE f.property_id = i.id)::int AS kedvenc_db
        FROM ingatlanok i
        ORDER BY i.id
    `);

    const rows = r.rows;
    rows.forEach(i => { i.kedvenc = i.kedvenc_db > 0; });

    // 1) Biztos duplikátum: ugyanaz a link
    const linkCsoport = new Map();

    rows.forEach(i => {
        const k = normLink(i.link);
        if (!k) return;
        if (!linkCsoport.has(k)) linkCsoport.set(k, []);
        linkCsoport.get(k).push(i);
    });

    const biztos = [...linkCsoport.values()].filter(g => g.length > 1);

    const biztosFelesleges = new Set();
    biztos.forEach(g => g.slice(1).forEach(i => biztosFelesleges.add(i.id)));

    // 2) Ugyanaz az ingatlan más linkkel
    const hashR = await db.query("SELECT ingatlan_id, forras, hash FROM kep_hashek WHERE hash IS NOT NULL");
    const hashek = new Map();
    const hashHirdetes = new Map();       // hash -> hány különböző hirdetésben

    hashR.rows.forEach(h => {
        if (!imagehash.hasznalhato(h.hash)) return;
        if (!hashek.has(h.ingatlan_id)) hashek.set(h.ingatlan_id, []);
        hashek.get(h.ingatlan_id).push(h);
        if (!hashHirdetes.has(h.hash)) hashHirdetes.set(h.hash, new Set());
        hashHirdetes.get(h.hash).add(h.ingatlan_id);
    });

    // Ami 4-nél több hirdetésben is szerepel (logó, "nincs kép", iroda fotója) – nem számít
    const gyakori = new Set([...hashHirdetes.entries()].filter(([, s]) => s.size > 4).map(([h]) => h));

    const kizartR = await db.query("SELECT a, b FROM dup_kizart");
    const kizart = new Set(kizartR.rows.map(k => `${k.a}-${k.b}`));

    const jeloltek = rows.filter(i => !biztosFelesleges.has(i.id) && ["aktiv", "fuggo"].includes(i.statusz));

    // Városonként, típusonként, ügyletenként párosítunk
    const csoport = new Map();
    jeloltek.forEach(i => {
        const k = `${i.varos}|${i.tipus || "lakas"}|${i.ugylet || "elado"}`;
        if (!csoport.has(k)) csoport.set(k, []);
        csoport.get(k).push(i);
    });

    const parok = [];

    for (const lista of csoport.values()) {

        for (let x = 0; x < lista.length; x++) {
            for (let y = x + 1; y < lista.length; y++) {

                const a = lista[x], b = lista[y];

                if (kizart.has(`${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`)) continue;

                // Már össze vannak kötve (az egyik linkje a másik "további linkje")
                const la = new Set([a.link, ...(a.tovabbi_linkek || [])].map(normLink).filter(Boolean));
                if ([b.link, ...(b.tovabbi_linkek || [])].map(normLink).some(l => l && la.has(l))) continue;

                const v = osszevet(a, b, hashek.get(a.id) || [], hashek.get(b.id) || [], gyakori);

                if (v) parok.push({ a: a.id, b: b.id, ...v });

            }
        }

    }

    // Csoportok: csak az erős párok láncolódnak (ha A=B és B=C, akkor egy csoport);
    // a gyengébb párok külön, kettesével jelennek meg
    const szulo = new Map();
    const gyoker = id => { while (szulo.get(id) !== id) { szulo.set(id, szulo.get(szulo.get(id))); id = szulo.get(id); } return id; };

    parok.filter(p => p.eros).forEach(p => {
        [p.a, p.b].forEach(id => { if (!szulo.has(id)) szulo.set(id, id); });
        szulo.set(gyoker(p.a), gyoker(p.b));
    });

    const byId = new Map(rows.map(i => [i.id, i]));
    const csoportok = new Map();

    parok.forEach(p => {
        const ga = szulo.has(p.a) ? gyoker(p.a) : null;
        const gb = szulo.has(p.b) ? gyoker(p.b) : null;
        let kulcs;
        if (p.eros) kulcs = "e" + ga;
        else if (ga !== null && ga === gb) kulcs = "e" + ga;               // már egy erős csoportban vannak
        else kulcs = `p${Math.min(p.a, p.b)}-${Math.max(p.a, p.b)}`;
        if (!csoportok.has(kulcs)) csoportok.set(kulcs, { ids: new Set(), parok: [] });
        const c = csoportok.get(kulcs);
        c.ids.add(p.a); c.ids.add(p.b);
        c.parok.push(p);
    });

    const valoszinu = [...csoportok.values()].map(c => {

        const tagok = [...c.ids].map(id => byId.get(id)).sort((a, b) => a.id - b.id);

        // Egyező fotók hirdetésenként (kiemeléshez)
        const egyezo = {};
        c.parok.forEach(p => p.kepPar.forEach(([fa, fb]) => {
            (egyezo[p.a] = egyezo[p.a] || new Set()).add(fa);
            (egyezo[p.b] = egyezo[p.b] || new Set()).add(fb);
        }));

        const legjobb = c.parok.reduce((m, p) => p.pont > m.pont ? p : m, c.parok[0]);
        const javasolt = [...tagok].sort((a, b) => teljesseg(b) - teljesseg(a) || a.id - b.id)[0].id;

        // Csak akkor "nagyon valószínű" a csoport, ha minden tag erős párral kapcsolódik
        const erosTag = new Set();
        c.parok.filter(p => p.eros).forEach(p => { erosTag.add(p.a); erosTag.add(p.b); });
        const eros = tagok.every(t => erosTag.has(t.id));

        return {
            kulcs: tagok.map(t => t.id).join("-"),
            eros,
            pont: legjobb.pont,
            okok: legjobb.okok,
            javasolt,
            tagok: tagok.map(t => ({
                id: t.id, link: t.link, ar: t.ar, nm: t.nm, szobak: t.szobak, emelet: t.emelet, allapot: t.allapot,
                varos: t.varos, kerulet: t.kerulet, telepules: t.telepules, tipus: t.tipus, ugylet: t.ugylet,
                cim: t.cim, created_at: t.created_at, kep_db: t.kep_db, kep_id: t.kep_id, kedvenc: t.kedvenc,
                owner_id: t.owner_id, tovabbi_linkek: t.tovabbi_linkek,
                kepek: [
                    ...(t.kep_id ? ["db:" + t.kep_id] : []),
                    ...(t.kulso_kepek || []).slice(0, 5)
                ].slice(0, 5),
                egyezoKepek: [...(egyezo[t.id] || [])]
            }))
        };

    }).sort((a, b) => (b.eros - a.eros) || (b.pont - a.pont));

    // Hibás / hiányos alapadatok (pl. elcsúszott Excel-oszlopok)
    const hibas = rows.filter(i =>
        !(i.ar > 0) || !(i.nm > 0) ||
        (i.ugylet !== "kiado" && i.ar < 3000) ||
        (i.link && !normLink(i.link))
    ).map(i => ({ id: i.id, ar: i.ar, nm: i.nm, link: i.link }));

    const kepHianyzik = await imagehash.hianyzoSzam();

    return {
        hibas,
        biztos: biztos.map(g => ({ megtart: g[0].id, tagok: g.map(i => ({ id: i.id, link: i.link })) })),
        biztosFelesleges: biztosFelesleges.size,
        valoszinu,
        kepek: { elerheto: imagehash.elerheto(), hianyzik: kepHianyzik, fut: imagehash.allapot() }
    };

}

// A kedvencek, képek, üzenetek átmentése a megtartott hirdetésre, majd törlés
async function athelyezEsTorol(client, megtart, torlendo) {

    if (!torlendo.length) return;

    await client.query(`
        INSERT INTO favorites (user_id, property_id)
        SELECT DISTINCT user_id, $1::int FROM favorites WHERE property_id = ANY($2::int[]) AND user_id IS NOT NULL
        ON CONFLICT (user_id, property_id) DO NOTHING
    `, [megtart, torlendo]);

    await client.query("DELETE FROM favorites WHERE property_id = ANY($1::int[])", [torlendo]);

    await client.query(
        "UPDATE ingatlan_kepek SET ingatlan_id = $1 WHERE ingatlan_id = ANY($2::int[])",
        [megtart, torlendo]
    );

    await client.query("UPDATE uzenetek SET ingatlan_id = $1 WHERE ingatlan_id = ANY($2::int[])", [megtart, torlendo]);
    await client.query("UPDATE uzenetek SET ajanlott_ingatlan_id = $1 WHERE ajanlott_ingatlan_id = ANY($2::int[])", [megtart, torlendo]);

    await client.query("DELETE FROM ingatlanok WHERE id = ANY($1::int[])", [torlendo]);

}

// Minden biztos duplikátum törlése (a legrégebbi marad meg)
async function biztosTorlese() {

    const { biztos } = await keres();

    const client = await db.connect();
    let torolt = 0;

    try {

        await client.query("BEGIN");

        for (const g of biztos) {
            const torlendo = g.tagok.slice(1).map(i => i.id);
            await athelyezEsTorol(client, g.megtart, torlendo);
            torolt += torlendo.length;
        }

        await client.query("COMMIT");

    } catch (e) {

        await client.query("ROLLBACK");
        throw e;

    } finally {

        client.release();

    }

    return { torolt };

}

// Két (vagy több) hirdetés összevonása: az egyik marad, a többi linkje
// "további linkként" hozzá kerül, a hiányzó adatai kitöltődnek.
async function osszevonKliens(client, megtartId, torlendoIds) {

    const ids = [megtartId, ...torlendoIds].map(Number);

    const r = await client.query("SELECT * FROM ingatlanok WHERE id = ANY($1::int[])", [ids]);

    const fo = r.rows.find(i => i.id === Number(megtartId));
    const tobbi = r.rows.filter(i => i.id !== Number(megtartId));

    if (!fo) throw new Error("not_found");
    if (!tobbi.length) return { megtart: fo.id, torolt: 0 };

    const linkek = new Set(fo.tovabbi_linkek || []);

    tobbi.forEach(i => {
        if (i.link && normLink(i.link) !== normLink(fo.link)) linkek.add(i.link);
        (i.tovabbi_linkek || []).forEach(l => { if (normLink(l) !== normLink(fo.link)) linkek.add(l); });
    });

    // Hiányzó mezők pótlása a többiből
    const potol = ["cim", "leiras", "kerulet", "allapot", "emelet", "szobak", "telek_nm", "evszam", "telepules", "telek_jelleg", "forras_szoveg"];
    const uj = {};

    potol.forEach(m => {
        if (fo[m] === null || fo[m] === undefined || fo[m] === "") {
            const forras = tobbi.find(i => i[m] !== null && i[m] !== undefined && i[m] !== "");
            if (forras) uj[m] = forras[m];
        }
    });

    // Hely: ha a megtartottnak nincs, vagy csak közelítő, a pontosabbat vesszük
    const rang = h => ({ pontos: 3, utca: 2, kozelito: 1 }[h] || 0);
    const jobbHely = tobbi.filter(i => i.x && i.y).sort((a, b) => rang(b.hely_pontossag || "pontos") - rang(a.hely_pontossag || "pontos"))[0];
    if (jobbHely && (!(fo.x && fo.y) || rang(jobbHely.hely_pontossag || "pontos") > rang(fo.hely_pontossag || "pontos"))) {
        Object.assign(uj, { x: jobbHely.x, y: jobbHely.y, hely_pontossag: jobbHely.hely_pontossag, hely_sugar: jobbHely.hely_sugar, hely_forras: jobbHely.hely_forras });
    }

    // Képek: ha a megtartottnak kevesebb van
    const fk = Array.isArray(fo.kulso_kepek) ? fo.kulso_kepek : [];
    const tobbKep = tobbi.map(i => i.kulso_kepek || []).sort((a, b) => b.length - a.length)[0] || [];
    if (tobbKep.length > fk.length) uj.kulso_kepek = JSON.stringify(tobbKep);

    const kulcsok = Object.keys(uj);
    const sets = kulcsok.map((m, idx) => `${m} = $${idx + 3}${m === "kulso_kepek" ? "::jsonb" : ""}`);

    await client.query(
        `UPDATE ingatlanok SET tovabbi_linkek = $1::jsonb, updated_at = NOW() ${sets.length ? "," + sets.join(",") : ""} WHERE id = $2`,
        [JSON.stringify([...linkek]), fo.id, ...kulcsok.map(k => uj[k])]
    );

    await athelyezEsTorol(client, fo.id, tobbi.map(i => i.id));

    return { megtart: fo.id, torolt: tobbi.length };

}

async function osszevon(megtartId, torlendoIds) {

    const client = await db.connect();

    try {
        await client.query("BEGIN");
        const v = await osszevonKliens(client, megtartId, torlendoIds);
        await client.query("COMMIT");
        return v;
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }

}

// Több csoport egyszerre: [{ megtart, torlendo: [...] }]
async function tomegesOsszevon(csoportok) {

    let osszevont = 0, torolt = 0;
    const hibak = [];

    for (const c of csoportok) {
        try {
            const v = await osszevon(Number(c.megtart), (c.torlendo || []).map(Number).filter(n => n && n !== Number(c.megtart)));
            osszevont++;
            torolt += v.torolt;
        } catch (e) {
            hibak.push({ megtart: c.megtart, uzenet: e.message });
        }
    }

    return { osszevont, torolt, hibak };

}

// "Nem ugyanaz" – az összes pár megjegyzése
async function kizar(ids) {

    ids = [...new Set(ids.map(Number).filter(Boolean))];

    for (let x = 0; x < ids.length; x++) {
        for (let y = x + 1; y < ids.length; y++) {
            await db.query("INSERT INTO dup_kizart (a, b) VALUES ($1, $2) ON CONFLICT DO NOTHING", [Math.min(ids[x], ids[y]), Math.max(ids[x], ids[y])]);
        }
    }

    return { siker: true };

}

// Egy hirdetés kivétele egy csoportból (a többivel nem ugyanaz)
async function kivesz(id, tobbi) {
    for (const t of tobbi.map(Number).filter(n => n && n !== Number(id))) {
        await db.query("INSERT INTO dup_kizart (a, b) VALUES ($1, $2) ON CONFLICT DO NOTHING", [Math.min(id, t), Math.max(id, t)]);
    }
    return { siker: true };
}

module.exports = { keres, biztosTorlese, osszevon, tomegesOsszevon, kizar, kivesz, _teszt: { osszevet } };
