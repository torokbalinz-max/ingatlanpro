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

// ---------- gyors fotó-összehasonlítás ----------
//  A 64 bites ujjlenyomatot két 32 bites számként tároljuk (a BigInt nagyon lassú volt:
//  több ezer hirdetésnél percekre megfogta az egész szervert).

function bitDb(x) {
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return Math.imul((x + (x >>> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24;
}

const hashTav = (a, b) => bitDb((a.hi ^ b.hi) >>> 0) + bitDb((a.lo ^ b.lo) >>> 0);

// A háttérmunka közben a szerver más kéréseket is kiszolgál (ne fagyjon le az admin)
const levegot = () => new Promise(r => setImmediate(r));

// Két hirdetés összevetése -> null (nem ugyanaz) vagy { pont, eros, okok, kepPar, kepDb }
//  A fotók döntenek: ha legalább 2 különböző fotó egyezik, az adatok eltérése (a
//  forrásoldalon rosszul megadott szobaszám, emelet, terület, más típus) nem zárja ki
//  – ugyanazt a lakást gyakran más adatokkal hirdetik.
//  hashA / hashB: [{ f: kép azonosító, hi, lo }] – a gyakori képek már kiszűrve
function osszevet(a, b, hashA, hashB) {

    // Fotók (a kép közepének ujjlenyomata is ugyanannak a képnek számít)
    const kepPar = [];

    if (hashA.length && hashB.length) {
        const hasznaltA = new Set(), hasznaltB = new Set();
        for (const ha of hashA) {
            if (hasznaltA.has(ha.f)) continue;
            for (const hb of hashB) {
                if (hasznaltB.has(hb.f)) continue;
                if (hashTav(ha, hb) <= imagehash.EGYEZES_BIT) {
                    kepPar.push([ha.f, hb.f]);
                    hasznaltA.add(ha.f);
                    hasznaltB.add(hb.f);
                    break;
                }
            }
        }
    }

    const kepDb = kepPar.length;
    const fotoBiztos = kepDb >= 2;

    // Más típus / ügylet: csak egyező fotókkal lehet ugyanaz (pl. "lakás egy házban")
    if (((a.tipus || "lakas") !== (b.tipus || "lakas") || (a.ugylet || "elado") !== (b.ugylet || "elado")) && !fotoBiztos) return null;
    // Eladó és kiadó ugyanaz a lakás lehet, de az két külön hirdetés
    if ((a.ugylet || "elado") !== (b.ugylet || "elado")) return null;

    // Ellentmondások (egyező fotók nélkül): ha ezek eltérnek, nem ugyanaz
    const ea = a._em, eb = b._em;
    const emeletEgyezik = ea !== null && eb !== null && ea === eb;
    const oa = a._ossz, ob = b._ossz;
    const nmK = kulonbseg(a.nm, b.nm);
    const arK = kulonbseg(a.ar, b.ar);

    if (!fotoBiztos) {
        if (a.szobak > 0 && b.szobak > 0 && a.szobak !== b.szobak) return null;
        if (ea !== null && eb !== null && ea !== eb) return null;
        // Az épület szintjeinek száma ("3/4" vs "3/10") is eltérhet
        if (oa !== null && ob !== null && oa !== ob) return null;
        if (nmK !== null && nmK > 0.12) return null;
        if (arK !== null && arK > 0.25) return null;
    } else {
        // Egyező fotókkal is: nagyon más alapterület (pl. a telek és a ház) vagy ár (pl. bérleti díj) nem ugyanaz
        if (nmK !== null && nmK > 0.45 && kepDb < 4) return null;
        if (arK !== null && arK > 0.6 && kepDb < 4) return null;
    }

    // Hely (ha mindkettőnek pontos helye van)
    let tav = null;
    if (a.x && b.x && ["pontos", "utca"].includes(a.hely_pontossag || "pontos") && ["pontos", "utca"].includes(b.hely_pontossag || "pontos")) {
        tav = km(a.x, a.y, b.x, b.y);
    }

    let pont = 0;
    const okok = [];

    if (kepDb >= 3) { pont += 75; okok.push({ k: "kep", n: kepDb }); }
    else if (kepDb === 2) { pont += 60; okok.push({ k: "kep", n: kepDb }); }
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
    const eros = kepDb >= 3 || (kepDb === 2 && (nmK === null || nmK <= 0.15)) ||
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

    return { pont: Math.min(100, pont), eros, okok, kepPar, kepDb };

}

// Pár kulcsa számként (a kisebb azonosító elöl)
const parKulcs = (a, b) => a < b ? a * 1e7 + b : b * 1e7 + a;

async function szamol() {

    const kezdes = Date.now();

    const r = await db.query(`
        SELECT i.id, i.link, i.ar, i.nm, i.szobak, i.emelet, i.allapot, i.varos, i.kerulet, i.telepules,
               i.tipus, i.ugylet, i.cim, i.created_at, i.tovabbi_linkek, i.kulso_kepek, i.x, i.y, i.hely_pontossag,
               i.statusz, i.owner_id, i.jovahagyva, i.leiras IS NOT NULL AS leiras, i.evszam, i.telek_nm, i.forras_tipus,
               u.hirdeto_nev, u.hirdeto_szerep,
               COALESCE(k.kep_db, 0)::int AS kep_db, k.kep_id,
               COALESCE(f.kedvenc_db, 0)::int AS kedvenc_db
        FROM ingatlanok i
        LEFT JOIN (SELECT id, COALESCE(nev, felhasznalonev, email) AS hirdeto_nev, szerep AS hirdeto_szerep FROM users) u ON u.id = i.owner_id
        LEFT JOIN (SELECT ingatlan_id, COUNT(*) AS kep_db,
                          (ARRAY_AGG(id ORDER BY sorrend, id))[1] AS kep_id
                   FROM ingatlan_kepek GROUP BY ingatlan_id) k ON k.ingatlan_id = i.id
        LEFT JOIN (SELECT property_id, COUNT(*) AS kedvenc_db FROM favorites GROUP BY property_id) f ON f.property_id = i.id
        ORDER BY i.id
    `);

    const rows = r.rows;
    rows.forEach(i => {
        i.kedvenc = i.kedvenc_db > 0;
        i.ar = i.ar === null ? null : Number(i.ar);
        i.nm = i.nm === null ? null : Number(i.nm);
        i._em = emeletSzam(i.emelet);
        i._ossz = osszSzint(i.emelet);
    });

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
    const hashHirdetes = new Map();       // hash -> hány különböző hirdetésben
    const nyers = [];

    for (const h of hashR.rows) {
        const s = String(h.hash || "").padStart(16, "0");
        if (!/^[0-9a-f]{16}$/i.test(s)) continue;
        const hi = parseInt(s.slice(0, 8), 16) >>> 0, lo = parseInt(s.slice(8), 16) >>> 0;
        // Egyszínű / üres kép (pl. "nincs kép" helyettesítő) – nem használható
        const n = bitDb(hi) + bitDb(lo);
        if (n < 6 || n > 58) continue;
        nyers.push({ id: h.ingatlan_id, f: imagehash.kepForras(h.forras), hash: s, hi, lo });
        if (!hashHirdetes.has(s)) hashHirdetes.set(s, new Set());
        hashHirdetes.get(s).add(h.ingatlan_id);
    }

    // Ami 8-nál több hirdetésben is szerepel (logó, "nincs kép", iroda fotója) – nem számít.
    const gyakori = new Set([...hashHirdetes.entries()].filter(([, s]) => s.size > 8).map(([h]) => h));

    const hashek = new Map();             // hirdetés -> [{ f, hi, lo }]
    for (const h of nyers) {
        if (gyakori.has(h.hash)) continue;
        if (!hashek.has(h.id)) hashek.set(h.id, []);
        hashek.get(h.id).push({ f: h.f, hi: h.hi, lo: h.lo });
    }

    const kizartR = await db.query("SELECT a, b FROM dup_kizart");
    const kizart = new Set(kizartR.rows.map(k => parKulcs(Number(k.a), Number(k.b))));

    const jeloltek = rows.filter(i => !biztosFelesleges.has(i.id) && ["aktiv", "fuggo"].includes(i.statusz));
    const jeloltId = new Map(jeloltek.map(i => [i.id, i]));

    // A hirdetések saját linkjei (az "már össze vannak kötve" vizsgálathoz)
    const linkHalmaz = i => {
        if (!i._linkek) i._linkek = new Set([i.link, ...(Array.isArray(i.tovabbi_linkek) ? i.tovabbi_linkek : [])].map(normLink).filter(Boolean));
        return i._linkek;
    };

    const parok = [];
    let lepes = 0;

    const vizsgal = async (a, b) => {
        if (++lepes % 500 === 0) await levegot();
        if (kizart.has(parKulcs(a.id, b.id))) return;
        const v = osszevet(a, b, hashek.get(a.id) || [], hashek.get(b.id) || []);
        if (!v) return;
        // Közös fotó nélkül csak ugyanabban a városban lehet ugyanaz
        if (v.kepDb === 0 && (a.varos || "") !== (b.varos || "")) return;
        // Már össze vannak kötve (az egyik linkje a másik "további linkje")
        const la = linkHalmaz(a);
        for (const l of linkHalmaz(b)) if (la.has(l)) return;
        const [x, y] = a.id < b.id ? [a, b] : [b, a];
        parok.push({ a: x.id, b: y.id, ...v });
    };

    // a) Fotó alapján: minden pár, amelyiknek legalább egy fotója (szinte) egyezik –
    //    bármilyen típussal / várossal. Gyors keresés: az ujjlenyomat 16 bites
    //    szeleteit (8 db, átfedéssel) "vödrökbe" tesszük; ugyanaz a fotó szinte
    //    mindig legalább egy szeletben pontosan egyezik.
    const fotoParok = new Set();
    {
        const vodor = new Map();
        let n = 0;
        for (const [id, lista] of hashek) {
            if (!jeloltId.has(id)) continue;
            if (++n % 500 === 0) await levegot();
            for (const h of lista) {
                const { hi, lo } = h;
                const szeletek = [
                    hi >>> 16, hi & 0xffff, lo >>> 16, lo & 0xffff,
                    (hi >>> 8) & 0xffff, ((hi & 0xff) << 8) | (lo >>> 24), (lo >>> 8) & 0xffff, ((lo & 0xff) << 8) | (hi >>> 24)
                ];
                for (let d = 0; d < 8; d++) {
                    const k = d * 65536 + szeletek[d];
                    let s = vodor.get(k);
                    if (!s) vodor.set(k, s = new Set());
                    s.add(id);
                }
            }
        }
        for (const ids of vodor.values()) {
            if (++n % 5000 === 0) await levegot();
            if (ids.size < 2 || ids.size > 40) continue;
            const l = [...ids];
            for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) fotoParok.add(parKulcs(l[x], l[y]));
        }
    }

    await levegot();

    for (const k of fotoParok) {
        const a = jeloltId.get(Math.floor(k / 1e7)), b = jeloltId.get(k % 1e7);
        if (a && b) await vizsgal(a, b);
    }

    // b) Adatok alapján: ugyanabban a városban, típusban, ügyletben, és a terület
    //    legfeljebb 12 %-kal tér el (fotó nélkül ennél nagyobb eltérés úgysem lehet
    //    ugyanaz). A terület szerint rendezve csak a közeli szomszédokat nézzük –
    //    nem minden párt (az volt a lefagyás oka).
    const csoport = new Map();
    jeloltek.forEach(i => {
        if (!(i.nm > 0)) return;
        const k = `${i.varos}|${i.tipus || "lakas"}|${i.ugylet || "elado"}`;
        if (!csoport.has(k)) csoport.set(k, []);
        csoport.get(k).push(i);
    });

    let kor = 0;
    for (const lista of csoport.values()) {
        lista.sort((a, b) => a.nm - b.nm);
        for (let x = 0; x < lista.length; x++) {
            const a = lista[x];
            const felso = a.nm / 0.88;
            const aKep = hashek.has(a.id);
            for (let y = x + 1; y < lista.length; y++) {
                const b = lista[y];
                if (b.nm > felso) break;
                if (++kor % 20000 === 0) await levegot();
                // gyors előszűrés (ugyanazok a feltételek, mint az összevetésben fotók nélkül)
                if (a.szobak > 0 && b.szobak > 0 && a.szobak !== b.szobak) continue;
                if (a._em !== null && b._em !== null && a._em !== b._em) continue;
                if (a._ossz !== null && b._ossz !== null && a._ossz !== b._ossz) continue;
                const arK = kulonbseg(a.ar, b.ar);
                if (arK !== null && arK > 0.25) continue;
                if (fotoParok.has(parKulcs(a.id, b.id))) continue;     // már megnéztük
                // fotók nélkül csak a szinte azonos ár és terület jöhet szóba
                if (!aKep || !hashek.has(b.id)) {
                    const nmK = kulonbseg(a.nm, b.nm);
                    if (!(arK !== null && arK <= 0.04 && nmK !== null && nmK <= 0.03)) continue;
                }
                await vizsgal(a, b);
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
        // A hirdető saját feltöltése mindig megmarad (az ő adatai és üzenetei)
        const tulajok = [...new Set(tagok.map(t => t.owner_id).filter(Boolean))];
        const sajat = tulajok.length === 1 ? tagok.find(t => t.owner_id === tulajok[0] && t.forras_tipus === "kezi") || tagok.find(t => t.owner_id === tulajok[0]) : null;
        const javasolt = sajat ? sajat.id : [...tagok].sort((a, b) => teljesseg(b) - teljesseg(a) || a.id - b.id)[0].id;

        // Csak akkor "nagyon valószínű" a csoport, ha minden tag erős párral kapcsolódik
        const erosTag = new Set();
        c.parok.filter(p => p.eros).forEach(p => { erosTag.add(p.a); erosTag.add(p.b); });
        const eros = tagok.every(t => erosTag.has(t.id));

        // Magától összevonható: minden tagnak legalább 3 fotója egyezik egy másik taggal,
        // és nincs két különböző hirdető (azt mindig az admin dönti el)
        const fotoTag = new Set();
        c.parok.filter(p => p.kepDb >= 3).forEach(p => { fotoTag.add(p.a); fotoTag.add(p.b); });

        return {
            kulcs: tagok.map(t => t.id).join("-"),
            eros,
            pont: legjobb.pont,
            okok: legjobb.okok,
            javasolt,
            // Fiókkal feltöltött hirdetés + más oldalon lévő példány(ok)
            sajatFeltoltes: !!sajat && tagok.some(t => t.link && !t.owner_id),
            kulonbozoHirdetok: tulajok.length > 1,
            automatikus: eros && tulajok.length <= 1 && tagok.every(t => fotoTag.has(t.id)),
            tagok: tagok.map(t => ({
                id: t.id, link: t.link, ar: t.ar, nm: t.nm, szobak: t.szobak, emelet: t.emelet, allapot: t.allapot,
                varos: t.varos, kerulet: t.kerulet, telepules: t.telepules, tipus: t.tipus, ugylet: t.ugylet,
                cim: t.cim, created_at: t.created_at, kep_db: t.kep_db, kep_id: t.kep_id, kedvenc: t.kedvenc,
                owner_id: t.owner_id, tovabbi_linkek: t.tovabbi_linkek, forras_tipus: t.forras_tipus,
                hirdeto_nev: t.owner_id ? t.hirdeto_nev : null, hirdeto_admin: t.hirdeto_szerep === "admin",
                kepek: [
                    ...(t.kep_id ? ["db:" + t.kep_id] : []),
                    ...(Array.isArray(t.kulso_kepek) ? t.kulso_kepek : []).slice(0, 5)
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

    console.log(`Duplikátum-keresés: ${rows.length} hirdetés, ${lepes} pár megnézve, ${valoszinu.length} csoport – ${((Date.now() - kezdes) / 1000).toFixed(1)} mp`);

    return {
        hibas,
        biztos: biztos.map(g => ({ megtart: g[0].id, tagok: g.map(i => ({ id: i.id, link: i.link })) })),
        biztosFelesleges: biztosFelesleges.size,
        valoszinu
    };

}

// ---------- gyorsítótár ----------
//  Egyszerre csak egy keresés fut (ha többször kattintasz a fülre, ugyanazt várja meg),
//  és az eredményt pár percig megtartjuk. Összevonás / "nem ugyanaz" / új fotók után újraszámol.

const CACHE_MS = 3 * 60 * 1000;
const ADMIN_MAX = 400;          // ennyi csoportot küldünk egyszerre a böngészőnek
let cache = null;               // { ido, kepVege, adat }
let futo = null;

function elavult() {
    cache = null;
}

async function keres(opts = {}) {

    const kepVege = (imagehash.allapot() || {}).vege || null;
    const limit = opts.limit === undefined ? ADMIN_MAX : opts.limit;

    let adat;

    if (!opts.friss && cache && Date.now() - cache.ido < CACHE_MS && cache.kepVege === kepVege) {
        adat = cache.adat;
    } else {
        if (!futo) {
            futo = szamol()
                .then(a => { cache = { ido: Date.now(), kepVege, adat: a }; return a; })
                .finally(() => { futo = null; });
        }
        adat = await futo;
    }

    const kepHianyzik = await imagehash.hianyzoSzam();

    return {
        ...adat,
        valoszinu: Number.isFinite(limit) ? adat.valoszinu.slice(0, limit) : adat.valoszinu,
        valoszinuOsszes: adat.valoszinu.length,
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

    const { biztos } = await keres({ friss: true, limit: Infinity });

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
        elavult();

    }

    return { torolt };

}

// Két (vagy több) hirdetés összevonása: az egyik marad, a többi linkje
// "további linkként" hozzá kerül, a hiányzó adatai kitöltődnek.
async function osszevonKliens(client, megtartId, torlendoIds) {

    const ids = [megtartId, ...torlendoIds].map(Number);

    const r = await client.query("SELECT * FROM ingatlanok WHERE id = ANY($1::int[])", [ids]);

    // Fiókkal feltöltött hirdetés (a hirdető saját feltöltése) mindig megmarad:
    // az ő adatai, elérhetősége, üzenetei élnek tovább, a más oldalon lévő
    // példány linkje „további linkként” kerül hozzá (a hirdetésen: „Más oldalakon
    // is fent van”). Két különböző hirdető hirdetését nem vonjuk össze.
    const tulajok = [...new Set(r.rows.map(i => i.owner_id).filter(Boolean))];
    if (tulajok.length > 1) {
        const e = new Error("different_owners");
        e.kod = "different_owners";
        throw e;
    }
    if (tulajok.length === 1) {
        const sajat = r.rows.find(i => i.owner_id === tulajok[0] && i.forras_tipus === "kezi") || r.rows.find(i => i.owner_id === tulajok[0]);
        if (sajat && sajat.id !== Number(megtartId)) megtartId = sajat.id;
    }

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

    // A megbízás / iroda / ügynök adatai a megtartotthoz (ha neki nincs)
    const iroda = tobbi.find(i => i.iroda_id);
    if (!fo.iroda_id && iroda && (!fo.owner_id || fo.owner_id === iroda.owner_id)) {
        await client.query("UPDATE ingatlanok SET iroda_id = $1, ugynok_id = $2 WHERE id = $3", [iroda.iroda_id, iroda.ugynok_id || null, fo.id]).catch(() => { });
    }
    const mbz = tobbi.find(i => i.megbizas_id);
    if (!fo.megbizas_id && mbz) {
        await client.query("UPDATE ingatlanok SET megbizas_id = $1 WHERE id = $2", [mbz.megbizas_id, fo.id]).catch(() => { });
        await client.query("UPDATE megbizasok SET ingatlan_id = $1 WHERE id = $2", [fo.id, mbz.megbizas_id]).catch(() => { });
    }
    // A rendelések (pl. kiemelés) a megtartott hirdetésre
    await client.query("UPDATE penzugy_rendelesek SET ingatlan_id = $1 WHERE ingatlan_id = ANY($2::int[])", [fo.id, tobbi.map(i => i.id)]).catch(() => { });

    await athelyezEsTorol(client, fo.id, tobbi.map(i => i.id));

    return { megtart: fo.id, torolt: tobbi.length, sajatMarad: !!fo.owner_id };

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
        elavult();
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
    elavult();

    for (let x = 0; x < ids.length; x++) {
        for (let y = x + 1; y < ids.length; y++) {
            await db.query("INSERT INTO dup_kizart (a, b) VALUES ($1, $2) ON CONFLICT DO NOTHING", [Math.min(ids[x], ids[y]), Math.max(ids[x], ids[y])]);
        }
    }

    return { siker: true };

}

// Egy hirdetés kivétele egy csoportból (a többivel nem ugyanaz)
async function kivesz(id, tobbi) {
    elavult();
    for (const t of tobbi.map(Number).filter(n => n && n !== Number(id))) {
        await db.query("INSERT INTO dup_kizart (a, b) VALUES ($1, $2) ON CONFLICT DO NOTHING", [Math.min(id, t), Math.max(id, t)]);
    }
    return { siker: true };
}

// A biztos (legalább 3 egyező fotós) duplikátumok magától összevonva – a beolvasás és
// a napi frissítés után fut, hogy ugyanaz a lakás ne maradjon bent többször
async function autoOsszevon() {
    const { valoszinu } = await keres({ friss: true, limit: Infinity });
    const lista = valoszinu.filter(g => g.automatikus).map(g => ({
        megtart: g.javasolt,
        torlendo: g.tagok.map(t => t.id).filter(id => id !== g.javasolt)
    }));
    if (!lista.length) return { osszevont: 0, torolt: 0, hibak: [] };
    const v = await tomegesOsszevon(lista);
    console.log(`Duplikátumok: ${v.osszevont} csoport magától összevonva (${v.torolt} hirdetés).`);
    return v;
}

module.exports = { keres, autoOsszevon, biztosTorlese, osszevon, tomegesOsszevon, kizar, kivesz, _teszt: { osszevet, hashTav, bitDb } };
