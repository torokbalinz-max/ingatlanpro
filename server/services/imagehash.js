// ============================================================
//  Képek "ujjlenyomata" (dHash) a duplikátumok felismeréséhez
//
//  Ugyanazt a lakást több oldalon ugyanazokkal a fotókkal hirdetik.
//  A képet 9×8-as szürke képpé kicsinyítjük, és a szomszédos pontok
//  világosságát hasonlítjuk – ez 64 bit. Két kép akkor egyezik, ha
//  legfeljebb néhány bitben tér el (átméretezés, újratömörítés,
//  kis vízjel ezt nem rontja el).
//
//  Hirdetésenként az első 5 képet nézzük. A háttérben fut
//  (Admin → Duplikátumok, és a napi időzítés).
// ============================================================

const db = require("../db/database");

let sharp = null;
try { sharp = require("sharp"); } catch (e) { console.warn("A 'sharp' csomag hiányzik – a képes duplikátum-keresés ki van kapcsolva (npm install)."); }

const KEP_V = 1;               // ha a módszer változik, emeljük -> újraszámol
const KEP_DB = 5;              // hirdetésenként ennyi kép
const EGYEZES_BIT = 8;         // ennyi eltérő bitig ugyanaz a kép

const sleep = ms => new Promise(r => setTimeout(r, ms));

function elerheto() {
    return !!sharp;
}

async function dhash(buf) {
    const { data } = await sharp(buf, { failOn: "none" })
        .rotate()
        .resize(9, 8, { fit: "fill" })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
    let bitek = "";
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            bitek += data[y * 9 + x] < data[y * 9 + x + 1] ? "1" : "0";
        }
    }
    return BigInt("0b" + bitek).toString(16).padStart(16, "0");
}

// Eltérő bitek száma két hash között
function tavolsag(a, b) {
    let x = BigInt("0x" + a) ^ BigInt("0x" + b);
    let n = 0;
    while (x) { n += Number(x & 1n); x >>= 1n; }
    return n;
}

// Egyszínű / üres kép (pl. "nincs kép" helyettesítő) – nem használható
function hasznalhato(h) {
    let x = BigInt("0x" + h), n = 0;
    while (x) { n += Number(x & 1n); x >>= 1n; }
    return n >= 6 && n <= 58;
}

async function letolt(url) {
    const host = new URL(url).hostname;
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
            "Referer": "https://" + host.split(".").slice(-2).join(".") + "/",
            "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"
        },
        signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 10 * 1024 * 1024) throw new Error("too_big");
    return buf;
}

// Egy hirdetés képeinek feldolgozása
async function hirdetes(i) {

    const kepek = [];

    const sajat = await db.query("SELECT id FROM ingatlan_kepek WHERE ingatlan_id = $1 ORDER BY sorrend, id LIMIT $2", [i.id, KEP_DB]);
    sajat.rows.forEach(k => kepek.push({ forras: "db:" + k.id, dbId: k.id }));

    (Array.isArray(i.kulso_kepek) ? i.kulso_kepek : []).slice(0, KEP_DB - kepek.length)
        .filter(u => /^https:\/\//i.test(u))
        .forEach(u => kepek.push({ forras: u }));

    let kesz = 0;

    for (const k of kepek) {

        try {

            let buf;

            if (k.dbId) {
                const r = await db.query("SELECT adat FROM ingatlan_kepek WHERE id = $1", [k.dbId]);
                buf = r.rows[0] && r.rows[0].adat;
            } else {
                buf = await letolt(k.forras);
                await sleep(250);
            }

            if (!buf) continue;

            const h = await dhash(buf);

            await db.query(
                `INSERT INTO kep_hashek (ingatlan_id, forras, hash) VALUES ($1, $2, $3)
                 ON CONFLICT (ingatlan_id, forras) DO UPDATE SET hash = EXCLUDED.hash, created_at = NOW()`,
                [i.id, k.forras.slice(0, 1000), h]
            );

            kesz++;

        } catch (e) {
            // egy hibás kép nem akasztja meg a többit
        }

    }

    await db.query("UPDATE ingatlanok SET kep_hash_v = $1 WHERE id = $2", [KEP_V, i.id]);

    return kesz;

}

// ---------- háttérfeladat ----------

let fut = null;

function allapot() {
    if (!fut) return null;
    const { promise, ...rest } = fut;
    return rest;
}

async function hianyzoSzam() {
    const r = await db.query(`
        SELECT COUNT(*)::int AS n FROM ingatlanok i
        WHERE i.statusz IN ('aktiv', 'fuggo') AND COALESCE(i.kep_hash_v, 0) < $1
          AND (jsonb_array_length(COALESCE(i.kulso_kepek, '[]'::jsonb)) > 0
               OR EXISTS (SELECT 1 FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id))`, [KEP_V]);
    return r.rows[0].n;
}

async function futtat(job, limit) {

    try {

        const r = await db.query(`
            SELECT i.id, i.kulso_kepek FROM ingatlanok i
            WHERE i.statusz IN ('aktiv', 'fuggo') AND COALESCE(i.kep_hash_v, 0) < $1
            ORDER BY i.id DESC LIMIT $2`, [KEP_V, limit]);

        job.osszes = r.rows.length;
        job.allapot = "fut";

        // Egyszerre 3 hirdetés (különböző oldalakról jönnek a képek)
        const sor = [...r.rows];
        const dolgozo = async () => {
            while (sor.length) {
                const i = sor.shift();
                try { job.kepek += await hirdetes(i); } catch (e) { job.hibak++; }
                job.kesz++;
            }
        };

        await Promise.all([dolgozo(), dolgozo(), dolgozo()]);

        job.allapot = "kesz";

    } catch (e) {
        job.allapot = "hiba";
        job.uzenet = e.message;
    }

    job.vege = new Date().toISOString();

    return job;

}

function indit(limit = 400) {

    if (!elerheto()) return null;
    if (fut && fut.allapot === "fut") return fut;

    fut = { allapot: "indul", osszes: 0, kesz: 0, kepek: 0, hibak: 0, kezdes: new Date().toISOString(), vege: null };
    fut.promise = futtat(fut, limit);

    return fut;

}

module.exports = { elerheto, dhash, tavolsag, hasznalhato, hirdetes, indit, allapot, hianyzoSzam, EGYEZES_BIT, KEP_V };
