// ============================================================
//  Munkanapok Romániában – az e-Factura határidejéhez
//
//  2026. január 1-jétől a számlát a kiállítástól számított 5 MUNKANAPON
//  belül kell feltölteni (OUG 89/2025). A hétvége és a törvényes
//  munkaszüneti napok nem számítanak (Codul muncii, art. 139):
//    jan. 1–2, jan. 6–7 (Vízkereszt, Szent János), jan. 24,
//    ortodox nagypéntek, húsvét és húsvéthétfő, máj. 1, jún. 1,
//    ortodox pünkösd és pünkösdhétfő, aug. 15, nov. 30, dec. 1, dec. 25–26
// ============================================================

// Ortodox húsvét (Meeus-féle julián számítás + 13 nap → Gergely-naptár; 1900–2099)
function ortodoxHusvet(ev) {
    const a = ev % 4, b = ev % 7, c = ev % 19;
    const d = (19 * c + 15) % 30;
    const e = (2 * a + 4 * b - d + 34) % 7;
    const honap = Math.floor((d + e + 114) / 31);
    const nap = ((d + e + 114) % 31) + 1;
    const dt = new Date(Date.UTC(ev, honap - 1, nap));
    dt.setUTCDate(dt.getUTCDate() + 13);
    return dt;
}

const iso = d => d.toISOString().slice(0, 10);
const cache = {};

function unnepek(ev) {
    if (cache[ev]) return cache[ev];
    const fix = ["01-01", "01-02", "01-06", "01-07", "01-24", "05-01", "06-01", "08-15", "11-30", "12-01", "12-25", "12-26"]
        .map(md => `${ev}-${md}`);
    const h = ortodoxHusvet(ev);
    const eltol = n => { const d = new Date(h); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
    // nagypéntek, húsvét vasárnap, hétfő, pünkösd vasárnap (+49), hétfő (+50)
    const mozgo = [eltol(-2), eltol(0), eltol(1), eltol(49), eltol(50)];
    cache[ev] = new Set([...fix, ...mozgo]);
    return cache[ev];
}

function datumBol(s) {
    const m = String(s || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function munkanap(s) {
    const d = typeof s === "string" ? datumBol(s) : s;
    if (!d) return false;
    const hn = d.getUTCDay();
    if (hn === 0 || hn === 6) return false;
    return !unnepek(d.getUTCFullYear()).has(iso(d));
}

// A kiállítás napja után n munkanap (az n-edik munkanap a határidő napja)
function hozzaad(kezdet, n = 5) {
    const d = datumBol(kezdet);
    if (!d) return null;
    let db = 0;
    while (db < n) {
        d.setUTCDate(d.getUTCDate() + 1);
        if (munkanap(d)) db++;
    }
    return iso(d);
}

// Hány munkanap van még hátra a határidőig (ma = 0 ha ma a határidő; negatív, ha lejárt)
function hatraVan(hatarido, ma) {
    const h = datumBol(hatarido), m = datumBol(ma);
    if (!h || !m) return null;
    if (iso(h) === iso(m)) return 0;
    const elore = h > m;
    const d = new Date(m);
    let db = 0;
    while (iso(d) !== iso(h)) {
        d.setUTCDate(d.getUTCDate() + (elore ? 1 : -1));
        if (munkanap(d)) db += elore ? 1 : -1;
    }
    return db;
}

module.exports = { munkanap, hozzaad, hatraVan, ortodoxHusvet, unnepek };
