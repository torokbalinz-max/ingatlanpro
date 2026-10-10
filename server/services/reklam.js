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

const alap = () => ({ mutat: true, email: "", helyorzo: true, helyek: {} });

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

    // Helyenként: aktív-e, és üresen látszik-e a helyőrző
    const helyek = { ...regi.helyek };
    if (b && b.helyek && typeof b.helyek === "object") {
        Object.keys(b.helyek).forEach(k => {
            if (!HELYEK[k]) return;
            const h = b.helyek[k] || {};
            helyek[k] = { aktiv: h.aktiv !== false, helyorzo: h.helyorzo !== false };
        });
    }

    const adat = {
        mutat: b && "mutat" in b ? b.mutat !== false : regi.mutat !== false,
        helyorzo: b && "helyorzo" in b ? b.helyorzo !== false : regi.helyorzo !== false,
        email,
        helyek
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
    r.megjelenes, r.kattintas, r.created_at, r.updated_at,
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
        megjegyzes: sz(b.megjegyzes, 2000)
    };

}

async function letrehoz(b) {

    const d = tisztit(b || {});
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

    aktivCache = null;
    return egy(r.rows[0].id);

}

//  b.kep: új kép (data URL), vagy hiányzik (marad a régi)
//  b.kep_mobil: új telefonos kép; b.kep_mobil_torol = true: a telefonos kép törlése
async function modosit(id, b) {

    const regi = await egy(id);
    if (!regi) return null;

    const d = tisztit({ ...regi, ...(b || {}) });
    const kep = b && b.kep ? await kepAdat(b.kep) : null;
    const mobil = b && b.kep_mobil ? await kepAdat(b.kep_mobil) : null;

    await db.query(`
        UPDATE reklamok SET nev=$1, hirdeto=$2, kapcsolat=$3, cel_url=$4, alt=$5, helyek=$6::jsonb, kezdet=$7, vege=$8,
            aktiv=$9, suly=$10, ar=$11, megjegyzes=$12, updated_at=NOW()
        WHERE id=$13
    `, [d.nev, d.hirdeto, d.kapcsolat, d.cel_url, d.alt, JSON.stringify(d.helyek), d.kezdet, d.vege, d.aktiv, d.suly, d.ar, d.megjegyzes, id]);

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
    HELYEK, olvas, ment, lista, egy, letrehoz, modosit, torol, kep, aktivak,
    megjelenesek, kattintas, napiStat, osszesites, lejarok
};
