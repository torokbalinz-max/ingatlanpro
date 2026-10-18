// ============================================================
//  Az üzemeltető (cég) logója – a számlán (PDF és nyomtatható),
//  a számlát kísérő e-mail fejlécében
//
//  Admin → Webhely adatai → Logó: PNG / JPG / WebP feltöltés. Tároláskor
//  PNG-vé alakítjuk, legfeljebb 800×300 képpontra kicsinyítve (átlátszóság
//  megmarad). Ha nincs logó, a cég neve áll a helyén.
// ============================================================

const db = require("../db/database");

const KULCS = "uzemelteto_logo";
const MAX_BYTE = 4 * 1024 * 1024;    // a feltöltött kép legfeljebb 4 MB

let cache = null;

async function olvas() {
    if (cache && Date.now() - cache.ido < 60 * 1000) return cache.adat;
    let adat = null;
    try {
        const r = await db.query("SELECT ertek, updated_at FROM beallitasok WHERE kulcs = $1", [KULCS]);
        if (r.rows[0] && r.rows[0].ertek) {
            const j = JSON.parse(r.rows[0].ertek);
            if (j && j.b64) adat = { png: Buffer.from(j.b64, "base64"), w: j.w, h: j.h, v: j.v || 1 };
        }
    } catch (e) { /* nincs logó */ }
    cache = { ido: Date.now(), adat };
    return adat;
}

// kep: "data:image/png;base64,..." (a böngészőből)
async function ment(kep) {
    const m = String(kep || "").match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) { const e = new Error("bad_image"); e.kod = "bad_image"; throw e; }
    const nyers = Buffer.from(m[2], "base64");
    if (nyers.length > MAX_BYTE) { const e = new Error("too_large"); e.kod = "too_large"; throw e; }
    const sharp = require("sharp");
    const { data, info } = await sharp(nyers).rotate()
        .resize({ width: 800, height: 300, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer({ resolveWithObject: true });
    const v = Date.now();
    await db.query(
        `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`,
        [KULCS, JSON.stringify({ b64: data.toString("base64"), w: info.width, h: info.height, v })]);
    cache = null;
    return { w: info.width, h: info.height, v };
}

async function torol() {
    await db.query("DELETE FROM beallitasok WHERE kulcs = $1", [KULCS]);
    cache = null;
}

// A nyilvános címe (e-mailben a képet csak linkként lehet megjeleníteni)
async function url(alapCim) {
    const l = await olvas();
    if (!l || !alapCim) return null;
    return `${String(alapCim).replace(/\/+$/, "")}/api/oldal/logo.png?v=${l.v}`;
}

module.exports = { olvas, ment, torol, url };
