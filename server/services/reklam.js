// ============================================================
//  Reklámfelületek (Admin → Reklámfelületek)
//
//  - Beállítások: ki-be kapcsolás (minden reklámhely), helyenként külön is;
//    üres helyen látszik-e a "Bérelhető reklámfelület" helyőrző; az
//    érdeklődő hirdetők e-mail címe (üresen: a webhely e-mail címe).
//  - Hirdetések: a hirdető, a kép (+ telefonra szánt kisebb kép), hova visz a
//    kattintás, mely helyeken és mettől meddig jelenik meg, súly (ha egy
//    helyen több hirdetés van, ennyiszer gyakrabban jön), saját jegyzet / ár.
//  - Statisztika: megjelenés (amikor a hirdetés legalább félig látszott) és
//    kattintás, naponta és helyenként – süti és személyes adat nélkül.
//
//  - Árlista és rend: helyenként havi ár, hány hirdető lehet egyszerre
//    (1 = kizárólagos), és több hirdetőnél hogyan váltakozzanak (oldal-
//    betöltésenként, vagy néhány másodpercenként a helyen belül). Ebből jön
//    a foglaltság (ne lehessen egy helyet túladni) és a javasolt havi díj.
//
//  A reklámhelyek (hol vannak az oldalon, mekkorák) a weboldalon:
//  public/js/core/ads.js – itt csak a kulcsuk és a formájuk kell.
// ============================================================

const db = require("../db/database");

const KULCS = "reklam";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// A reklámhelyek és a formájuk (a kép arányához)
const HELYEK = {
    home_top: "billboard",
    home: "billboard",
    list_top: "csik",
    feed: "negyzet",
    feed_wide: "billboard",
    sidebar: "allo",
    map: "csik",
    listing_side: "negyzet",
    listing: "leaderboard",
    valuation_side: "negyzet",
    valuation: "leaderboard",
    market_top: "csik",
    market: "leaderboard",
    agencies: "negyzet",
    requests: "csik"
};

const MAX_KEP = 3 * 1024 * 1024;
const KEP_TIPUSOK = ["image/jpeg", "image/png", "image/webp", "image/gif"];

let cache = null;
let aktivCache = null;
const CACHE_MS = 60 * 1000;

const alap = () => ({ mutat: true, email: "", helyorzo: true, helyek: {}, penznem: "RON", arak_mutat: false, auto_ajanlat: false });

// Egy hely beállításai az alapértékekkel: aktív, helyőrző, havi ár, egyszerre
// hány hirdető (1 = kizárólagos), váltás (0 = oldalbetöltésenként, különben mp)
const MAX_HIRDETO = 6;
const VALTASOK = [0, 6, 10, 15, 30];
function helyBeall(b, k) {
    const h = (b && b.helyek && b.helyek[k]) || {};
    const ar = Number(h.ar);
    return {
        aktiv: h.aktiv !== false,
        helyorzo: h.helyorzo !== false,
        ar: isFinite(ar) && ar > 0 ? Math.round(ar * 100) / 100 : null,
        max: Math.max(1, Math.min(MAX_HIRDETO, parseInt(h.max, 10) || 1)),
        valtas: VALTASOK.includes(Number(h.valtas)) ? Number(h.valtas) : 0
    };
}

// ---------- Beállítások ----------

async function olvas() {

    if (cache && Date.now() - cache.ido < CACHE_MS) return cache.adat;

    let adat = alap();

    try {
        const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = $1", [KULCS]);
        if (r.rows[0] && r.rows[0].ertek) adat = { ...adat, ...JSON.parse(r.rows[0].ertek) };
    } catch (e) {
        /* első indulás / hibás érték: az alapértékek maradnak */
    }

    if (!adat.helyek || typeof adat.helyek !== "object") adat.helyek = {};

    cache = { ido: Date.now(), adat };
    return adat;

}

async function ment(b) {

    const regi = await olvas();
    const email = b && "email" in b ? String(b.email || "").trim().toLowerCase().slice(0, 160) : regi.email;

    if (email && !EMAIL_RE.test(email)) {
        const e = new Error("bad_email");
        e.kod = "bad_email";
        throw e;
    }

    // Helyenként: aktív-e, üresen látszik-e a helyőrző, havi ár, hány hirdető, váltás
    //  (ami nem jön a kérésben, marad a régi)
    const helyek = {};
    Object.keys(HELYEK).forEach(k => {
        const uj = b && b.helyek && typeof b.helyek === "object" && b.helyek[k] ? b.helyek[k] : null;
        helyek[k] = helyBeall({ helyek: { [k]: { ...((regi.helyek || {})[k] || {}), ...(uj || {}) } } }, k);
    });

    const adat = {
        mutat: b && "mutat" in b ? b.mutat !== false : regi.mutat !== false,
        helyorzo: b && "helyorzo" in b ? b.helyorzo !== false : regi.helyorzo !== false,
        email,
        helyek,
        penznem: b && ["RON", "EUR"].includes(b.penznem) ? b.penznem : (["RON", "EUR"].includes(regi.penznem) ? regi.penznem : "RON"),
        // az árak a weboldal bérlési űrlapján is látszanak
        arak_mutat: b && "arak_mutat" in b ? !!b.arak_mutat : !!regi.arak_mutat,
        // új bérlési kérésre magától ajánlat (ügyfél + díjbekérő + fizetési link), ha minden adat megvan
        auto_ajanlat: b && "auto_ajanlat" in b ? !!b.auto_ajanlat : !!regi.auto_ajanlat
    };

    await db.query(
        `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`,
        [KULCS, JSON.stringify(adat)]
    );

    cache = null;
    return adat;

}

// ---------- Képek ----------

//  data URL -> { buf, mime, w, h } (ellenőrizve), null (nincs kép), vagy hiba
async function kepAdat(dataUrl) {

    if (!dataUrl) return null;

    const m = String(dataUrl).match(/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!m) throw kodHiba("bad_image");

    const mime = m[1].toLowerCase().replace("image/jpg", "image/jpeg");
    if (!KEP_TIPUSOK.includes(mime)) throw kodHiba("bad_image_type");

    const buf = Buffer.from(m[2].replace(/\s/g, ""), "base64");
    if (!buf.length) throw kodHiba("bad_image");
    if (buf.length > MAX_KEP) throw kodHiba("image_too_big");

    // A fájl eleje is egyezzen a típussal (ne lehessen pl. HTML-t képnek álcázni)
    const fej = buf.subarray(0, 12);
    const jo = (mime === "image/jpeg" && fej[0] === 0xff && fej[1] === 0xd8)
        || (mime === "image/png" && fej[0] === 0x89 && fej[1] === 0x50)
        || (mime === "image/gif" && fej.toString("ascii", 0, 3) === "GIF")
        || (mime === "image/webp" && fej.toString("ascii", 0, 4) === "RIFF" && fej.toString("ascii", 8, 12) === "WEBP");
    if (!jo) throw kodHiba("bad_image");

    let w = null, h = null;
    try {
        const meta = await require("sharp")(buf, { animated: true }).metadata();
        w = meta.width || null;
        h = meta.pageHeight || meta.height || null;
    } catch (e) { /* a méret nélkül is jó */ }

    return { buf, mime, w, h };

}

function kodHiba(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

// ---------- Hirdetések ----------

const NAP = "(NOW() AT TIME ZONE 'Europe/Bucharest')::date";

function allapotSql() {
    return `CASE
        WHEN NOT r.aktiv THEN 'ki'
        WHEN r.kep IS NULL THEN 'kep_nelkul'
        WHEN r.kezdet IS NOT NULL AND r.kezdet > ${NAP} THEN 'utemezett'
        WHEN r.vege IS NOT NULL AND r.vege < ${NAP} THEN 'lejart'
        ELSE 'fut' END`;
}

const MEZOK = `r.id, r.nev, r.hirdeto, r.kapcsolat, r.cel_url, r.alt, r.kep_mime, r.kep_w, r.kep_h,
    (r.kep_mobil IS NOT NULL) AS van_mobil, r.kep_mobil_w, r.kep_mobil_h,
    r.helyek, r.kezdet::text AS kezdet, r.vege::text AS vege, r.aktiv, r.suly, r.ar, r.megjegyzes,
    r.megjelenes, r.kattintas, r.created_at, r.updated_at, r.anyag_feltoltve,
    r.ugyfel_id, r.penznem, r.szamlazas, r.fizetes_utan, COALESCE(r.szerzodes_kell, true) AS szerzodes_kell, r.szerzodes_szam, r.szerzodes_kuldve, r.szerzodes_elfogadva,
    (SELECT u.nev FROM penzugy_ugyfelek u WHERE u.id = r.ugyfel_id) AS ugyfel_nev,
    EXISTS (SELECT 1 FROM penzugy_szamlak s WHERE s.reklam_id = r.id AND s.tipus = 'dijbekero' AND s.statusz = 'fizetve') AS fizetve_van,
    EXISTS (SELECT 1 FROM penzugy_szamlak s WHERE s.reklam_id = r.id AND s.tipus = 'dijbekero' AND s.statusz IN ('kiallitva', 'piszkozat')) AS fizetesre_var,
    EXTRACT(EPOCH FROM r.updated_at)::bigint AS v`;

async function lista(napok = 30) {

    const r = await db.query(`
        SELECT ${MEZOK}, ${allapotSql()} AS allapot,
            COALESCE((SELECT SUM(s.megjelenes) FROM reklam_stat s WHERE s.reklam_id = r.id AND s.nap > ${NAP} - $1::int), 0)::int AS megj_idoszak,
            COALESCE((SELECT SUM(s.kattintas) FROM reklam_stat s WHERE s.reklam_id = r.id AND s.nap > ${NAP} - $1::int), 0)::int AS katt_idoszak
        FROM reklamok r
        ORDER BY (${allapotSql()} = 'fut') DESC, r.vege NULLS LAST, r.id DESC
    `, [napok]);

    return r.rows;

}

async function egy(id) {
    const r = await db.query(`SELECT ${MEZOK}, ${allapotSql()} AS allapot FROM reklamok r WHERE r.id = $1`, [id]);
    return r.rows[0] || null;
}

// A bejövő adatok ellenőrzése (kép nélkül)
function tisztit(b) {

    const sz = (v, max) => (v === null || v === undefined || String(v).trim() === "") ? null : String(v).trim().slice(0, max);
    const datum = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null;

    const nev = sz(b.nev, 120);
    if (!nev) throw kodHiba("name_required");

    let cel = sz(b.cel_url, 500);
    if (cel && !/^https?:\/\//i.test(cel)) cel = "https://" + cel;
    if (cel) {
        try {
            const u = new URL(cel);
            if (!/^https?:$/.test(u.protocol)) throw new Error();
            cel = u.toString();
        } catch (e) {
            throw kodHiba("bad_url");
        }
    }

    const helyek = Array.isArray(b.helyek) ? [...new Set(b.helyek.filter(h => HELYEK[h]))] : [];
    const kezdet = datum(b.kezdet), vege = datum(b.vege);
    if (kezdet && vege && vege < kezdet) throw kodHiba("bad_dates");

    const suly = Math.max(1, Math.min(10, parseInt(b.suly, 10) || 1));
    const ar = b.ar === "" || b.ar === null || b.ar === undefined ? null : Number(b.ar);

    return {
        nev,
        hirdeto: sz(b.hirdeto, 120),
        kapcsolat: sz(b.kapcsolat, 300),
        cel_url: cel,
        alt: sz(b.alt, 200),
        helyek,
        kezdet, vege,
        aktiv: b.aktiv !== false,
        suly,
        ar: isFinite(ar) ? ar : null,
        megjegyzes: sz(b.megjegyzes, 2000),
        // számlázás (services/reklamSzamla.js)
        ugyfel_id: Number(b.ugyfel_id) || null,
        penznem: ["RON", "EUR"].includes(b.penznem) ? b.penznem : "RON",
        // a teljes időszak egy díjbekérőn (havi automatikus számlázás nincs)
        szamlazas: "egyben",
        fizetes_utan: !!b.fizetes_utan,
        szerzodes_kell: b.szerzodes_kell !== false
    };

}

async function letrehoz(b) {

    const d = tisztit(b || {});
    // ár nélkül: az árlista szerint (a választott helyek havi díjának összege)
    if (d.ar === null) d.ar = await arlistaAr(d.helyek);
    const kep = await kepAdat(b.kep);
    const mobil = await kepAdat(b.kep_mobil);

    const r = await db.query(`
        INSERT INTO reklamok (nev, hirdeto, kapcsolat, cel_url, alt, helyek, kezdet, vege, aktiv, suly, ar, megjegyzes,
                              kep, kep_mime, kep_w, kep_h, kep_mobil, kep_mobil_mime, kep_mobil_w, kep_mobil_h)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING id
    `, [d.nev, d.hirdeto, d.kapcsolat, d.cel_url, d.alt, JSON.stringify(d.helyek), d.kezdet, d.vege, d.aktiv, d.suly, d.ar, d.megjegyzes,
        kep ? kep.buf : null, kep ? kep.mime : null, kep ? kep.w : null, kep ? kep.h : null,
        mobil ? mobil.buf : null, mobil ? mobil.mime : null, mobil ? mobil.w : null, mobil ? mobil.h : null]);

    await szamlazasMent(r.rows[0].id, d);
    aktivCache = null;
    return egy(r.rows[0].id);

}

//  b.kep: új kép (data URL), vagy hiányzik (marad a régi)
//  b.kep_mobil: új telefonos kép; b.kep_mobil_torol = true: a telefonos kép törlése
async function modosit(id, b) {

    const regi = await egy(id);
    if (!regi) return null;

    const d = tisztit({ ...regi, ...(b || {}) });
    if (d.ar === null) d.ar = await arlistaAr(d.helyek);
    const kep = b && b.kep ? await kepAdat(b.kep) : null;
    const mobil = b && b.kep_mobil ? await kepAdat(b.kep_mobil) : null;

    await db.query(`
        UPDATE reklamok SET nev=$1, hirdeto=$2, kapcsolat=$3, cel_url=$4, alt=$5, helyek=$6::jsonb, kezdet=$7, vege=$8,
            aktiv=$9, suly=$10, ar=$11, megjegyzes=$12, updated_at=NOW()
        WHERE id=$13
    `, [d.nev, d.hirdeto, d.kapcsolat, d.cel_url, d.alt, JSON.stringify(d.helyek), d.kezdet, d.vege, d.aktiv, d.suly, d.ar, d.megjegyzes, id]);
    await szamlazasMent(id, d);

    if (kep) {
        await db.query("UPDATE reklamok SET kep=$1, kep_mime=$2, kep_w=$3, kep_h=$4, updated_at=NOW() WHERE id=$5", [kep.buf, kep.mime, kep.w, kep.h, id]);
    }

    if (mobil) {
        await db.query("UPDATE reklamok SET kep_mobil=$1, kep_mobil_mime=$2, kep_mobil_w=$3, kep_mobil_h=$4, updated_at=NOW() WHERE id=$5", [mobil.buf, mobil.mime, mobil.w, mobil.h, id]);
    } else if (b && b.kep_mobil_torol) {
        await db.query("UPDATE reklamok SET kep_mobil=NULL, kep_mobil_mime=NULL, kep_mobil_w=NULL, kep_mobil_h=NULL, updated_at=NOW() WHERE id=$1", [id]);
    }

    aktivCache = null;
    return egy(id);

}

async function szamlazasMent(id, d) {
    await db.query("UPDATE reklamok SET ugyfel_id = $2, penznem = $3, szamlazas = $4, fizetes_utan = $5, szerzodes_kell = $6 WHERE id = $1",
        [id, d.ugyfel_id, d.penznem, d.szamlazas, d.fizetes_utan, d.szerzodes_kell]);
}

async function torol(id) {
    await db.query("DELETE FROM reklamok WHERE id = $1", [id]);
    aktivCache = null;
}

async function kep(id, mobil) {
    const r = await db.query(
        mobil ? "SELECT kep_mobil AS adat, kep_mobil_mime AS mime FROM reklamok WHERE id = $1"
              : "SELECT kep AS adat, kep_mime AS mime FROM reklamok WHERE id = $1",
        [id]);
    return r.rows[0] && r.rows[0].adat ? r.rows[0] : null;
}

// A ma futó hirdetések (a weboldalnak, /api/config) – kép nélkül, csak a címükkel
async function aktivak() {

    if (aktivCache && Date.now() - aktivCache.ido < CACHE_MS) return aktivCache.adat;

    let adat = [];

    try {
        const r = await db.query(`
            SELECT r.id, r.hirdeto, r.alt, r.helyek, r.suly, r.kep_w, r.kep_h, (r.kep_mobil IS NOT NULL) AS van_mobil,
                   (r.cel_url IS NOT NULL) AS van_cel, EXTRACT(EPOCH FROM r.updated_at)::bigint AS v
            FROM reklamok r
            WHERE r.aktiv AND r.kep IS NOT NULL
              AND (r.kezdet IS NULL OR r.kezdet <= ${NAP})
              AND (r.vege IS NULL OR r.vege >= ${NAP})
              AND jsonb_array_length(COALESCE(r.helyek, '[]'::jsonb)) > 0
              -- „csak a befizetés után”: a mai napra kifizetett díjbekérő kell
              AND (NOT COALESCE(r.fizetes_utan, false) OR EXISTS (
                    SELECT 1 FROM penzugy_szamlak s WHERE s.reklam_id = r.id AND s.tipus = 'dijbekero' AND s.statusz = 'fizetve'
                      AND (s.idoszak_tol IS NULL OR s.idoszak_tol <= ${NAP}) AND (s.idoszak_ig IS NULL OR s.idoszak_ig >= ${NAP})))
        `);
        adat = r.rows.map(x => ({
            id: x.id,
            hirdeto: x.hirdeto || "",
            alt: x.alt || x.hirdeto || "",
            helyek: Array.isArray(x.helyek) ? x.helyek : [],
            suly: x.suly || 1,
            w: x.kep_w, h: x.kep_h,
            kep: `/api/reklam/${x.id}/kep?v=${x.v}`,
            kepMobil: x.van_mobil ? `/api/reklam/${x.id}/kep?m=1&v=${x.v}` : null,
            link: x.van_cel
        }));
    } catch (e) {
        adat = [];
    }

    aktivCache = { ido: Date.now(), adat };
    return adat;

}

// ---------- Árlista, foglaltság ----------

// A weboldalnak (/api/config): helyenként aktív, helyőrző, váltás – az ár csak
// akkor, ha az árak nyilvánosak
async function publikus() {
    const b = await olvas();
    const helyek = {};
    Object.keys(HELYEK).forEach(k => {
        const h = helyBeall(b, k);
        helyek[k] = { aktiv: h.aktiv, helyorzo: h.helyorzo, valtas: h.valtas, ...(b.arak_mutat && h.ar ? { ar: h.ar } : {}) };
    });
    return { mutat: b.mutat !== false, helyorzo: b.helyorzo !== false, email: b.email || "", helyek, penznem: b.penznem || "RON", arak_mutat: !!b.arak_mutat };
}

// A választott helyek havi díja az árlista szerint (null, ha valamelyiknek nincs ára)
async function arlistaAr(helyek) {
    const b = await olvas();
    const lista = (Array.isArray(helyek) ? helyek : []).filter(k => HELYEK[k]);
    if (!lista.length) return null;
    let ossz = 0;
    for (const k of lista) {
        const h = helyBeall(b, k);
        if (!h.ar) return null;
        ossz += h.ar;
    }
    return Math.round(ossz * 100) / 100;
}

// Foglaltság egy időszakra: helyenként hány hirdetés fut / van lefoglalva.
//  Foglal: a bekapcsolt hirdetés, ami belelóg az időszakba, és vagy nem vár
//  fizetésre, vagy már kifizették, vagy 14 napon belül ment ki az ajánlat.
//  -> { hely: { db, max, szabad, hirdetok: [név] } }
async function foglaltsag(kezdet, vege, kizarId) {
    const b = await olvas();
    const datum = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null;
    const tol = datum(kezdet) || new Date().toISOString().slice(0, 10);
    const ig = datum(vege) || tol;
    const r = await db.query(`
        SELECT r.id, r.helyek, COALESCE(r.hirdeto, r.nev) AS nev
        FROM reklamok r
        WHERE r.aktiv AND r.id <> $3
          AND (r.kezdet IS NULL OR r.kezdet <= $2::date)
          AND (r.vege IS NULL OR r.vege >= $1::date)
          AND (NOT COALESCE(r.fizetes_utan, false)
               OR EXISTS (SELECT 1 FROM penzugy_szamlak s WHERE s.reklam_id = r.id AND s.tipus = 'dijbekero' AND s.statusz = 'fizetve')
               OR r.szerzodes_kuldve > NOW() - INTERVAL '14 days')
    `, [tol, ig, Number(kizarId) || 0]);
    const ki = {};
    Object.keys(HELYEK).forEach(k => {
        const h = helyBeall(b, k);
        const rajta = r.rows.filter(x => Array.isArray(x.helyek) && x.helyek.includes(k));
        ki[k] = { db: rajta.length, max: h.max, szabad: h.aktiv && rajta.length < h.max, aktiv: h.aktiv, hirdetok: rajta.map(x => x.nev) };
    });
    return ki;
}

// A hirdető tölti fel az anyagot (a fizetési oldalon, a titkos linkkel):
//  kép (+ telefonos kép), hova vigyen, alt szöveg. A hirdetés ettől kezdve
//  magától megjelenik (ha nem vár fizetésre, vagy már kifizették).
async function anyagMent(id, b) {
    const regi = await egy(id);
    if (!regi) throw kodHiba("not_found");
    const kep = b && b.kep ? await kepAdat(b.kep) : null;
    const mobil = b && b.kep_mobil ? await kepAdat(b.kep_mobil) : null;
    if (!kep && !regi.kep_mime) throw kodHiba("image_required");
    let cel = b && "cel_url" in b ? String(b.cel_url || "").trim().slice(0, 500) : regi.cel_url;
    if (cel && !/^https?:\/\//i.test(cel)) cel = "https://" + cel;
    if (cel) {
        try { const u = new URL(cel); if (!/^https?:$/.test(u.protocol)) throw new Error(); cel = u.toString(); }
        catch (e) { throw kodHiba("bad_url"); }
    }
    const alt = b && "alt" in b ? (String(b.alt || "").trim().slice(0, 200) || null) : regi.alt;
    await db.query("UPDATE reklamok SET cel_url = $2, alt = $3, anyag_feltoltve = NOW(), updated_at = NOW() WHERE id = $1", [id, cel || null, alt]);
    if (kep) await db.query("UPDATE reklamok SET kep=$1, kep_mime=$2, kep_w=$3, kep_h=$4 WHERE id=$5", [kep.buf, kep.mime, kep.w, kep.h, id]);
    if (mobil) await db.query("UPDATE reklamok SET kep_mobil=$1, kep_mobil_mime=$2, kep_mobil_w=$3, kep_mobil_h=$4 WHERE id=$5", [mobil.buf, mobil.mime, mobil.w, mobil.h, id]);
    aktivCache = null;
    return egy(id);
}

// ---------- Statisztika ----------

async function noveles(id, hely, mezo, db_ = 1) {
    if (!["megjelenes", "kattintas"].includes(mezo)) return;
    const h = HELYEK[hely] ? hely : "";
    await db.query(
        `INSERT INTO reklam_stat (reklam_id, nap, hely, ${mezo}) VALUES ($1, ${NAP}, $2, $3)
         ON CONFLICT (reklam_id, nap, hely) DO UPDATE SET ${mezo} = reklam_stat.${mezo} + EXCLUDED.${mezo}`,
        [id, h, db_]);
    await db.query(`UPDATE reklamok SET ${mezo} = ${mezo} + $2 WHERE id = $1`, [id, db_]);
}

//  lista: [{ id, hely }] – egy oldalmegtekintés látható hirdetései
async function megjelenesek(lista) {
    const aktiv = new Set((await aktivak()).map(a => a.id));
    const osszes = new Map();
    (Array.isArray(lista) ? lista : []).slice(0, 40).forEach(x => {
        const id = Number(x && x.id);
        if (!aktiv.has(id)) return;
        const k = id + "|" + (HELYEK[x.hely] ? x.hely : "");
        osszes.set(k, (osszes.get(k) || 0) + 1);
    });
    for (const [k, n] of osszes) {
        const [id, hely] = k.split("|");
        await noveles(Number(id), hely, "megjelenes", Math.min(n, 3));
    }
    return osszes.size;
}

// Kattintás: számolunk, és visszaadjuk, hova kell továbbküldeni
async function kattintas(id, hely, szamol = true) {
    const r = await db.query("SELECT cel_url FROM reklamok WHERE id = $1", [id]);
    const cel = r.rows[0] && r.rows[0].cel_url;
    if (cel && szamol) await noveles(id, hely, "kattintas");
    return cel || null;
}

// Napi bontás (az admin részletes nézetéhez)
async function napiStat(id, napok = 60) {
    const r = await db.query(`
        SELECT nap::text AS nap, hely, megjelenes, kattintas FROM reklam_stat
        WHERE reklam_id = $1 AND nap > ${NAP} - $2::int ORDER BY nap
    `, [id, napok]);
    return r.rows;
}

// Az összes hirdetés együtt (a fejléc számaihoz)
async function osszesites(napok = 30) {
    const r = await db.query(`
        SELECT COALESCE(SUM(megjelenes), 0)::int AS megjelenes, COALESCE(SUM(kattintas), 0)::int AS kattintas
        FROM reklam_stat WHERE nap > ${NAP} - $1::int
    `, [napok]);
    return r.rows[0];
}

// A hamarosan lejáró hirdetések (az admin teendőihez)
async function lejarok(napok = 7) {
    const r = await db.query(`
        SELECT id, nev, vege::text AS vege FROM reklamok
        WHERE aktiv AND vege IS NOT NULL AND vege >= ${NAP} AND vege <= ${NAP} + $1::int
        ORDER BY vege
    `, [napok]);
    return r.rows;
}

module.exports = {
    HELYEK, olvas, ment, lista, egy, letrehoz, modosit, torol, kep, aktivak, cacheUrit: () => { aktivCache = null; },
    megjelenesek, kattintas, napiStat, osszesites, lejarok,
    helyBeall, publikus, arlistaAr, foglaltsag, anyagMent, MAX_HIRDETO, VALTASOK
};
