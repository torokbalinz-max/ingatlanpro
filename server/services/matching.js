// ============================================================
//  Illeszkedés: melyik hirdetés felel meg egy mentett keresésnek
//  vagy egy vevő keresési igényének
//
//  A mentett keresés szűrői ugyanazok, mint a kereső oldalon
//  (public/js/listings/filterManager.js – read()).
// ============================================================

const db = require("../db/database");

const szam = v => (v === null || v === undefined || v === "" || isNaN(Number(v))) ? null : Number(v);

// Ugyanúgy, mint a böngészőben (public/js/core/utils.js)
function emeletSzam(e) {
    const n = parseInt(String(e || "").split("/")[0], 10);
    return isNaN(n) ? null : n;
}

function normAllapot(a) {
    const v = String(a || "").toLowerCase().replace(/\*/g, "").trim();
    if (!v) return "";
    if (v === "új" || v === "uj" || v.startsWith("újsz") || v.startsWith("ujsz")) return "újszerű";
    if (v.startsWith("részben") || v.startsWith("reszben")) return "részbenfel";
    if (v.startsWith("felúj") || v.startsWith("feluj")) return "felújítandó";
    if (v === "jó" || v === "jo") return "jó";
    if (v.startsWith("lux")) return "luxus";
    return v;
}

// Mentett keresés szűrői -> illik-e a hirdetés
function keresesIllik(i, f) {

    if (!f) return false;

    if (f.varos && i.varos !== f.varos) return false;
    if ((i.tipus || "lakas") !== (f.tipus || "lakas")) return false;
    if ((i.ugylet || "elado") !== (f.ugylet || "elado")) return false;

    const rng = (v, min, max) => {
        if (szam(min) !== null && !(v >= szam(min))) return false;
        if (szam(max) !== null && !(v <= szam(max))) return false;
        return true;
    };

    if (!rng(i.ar, f.minAr, f.maxAr)) return false;
    if (!rng(i.nm, f.minNm, f.maxNm)) return false;
    if (!rng(i.szobak || 0, f.minSzoba, f.maxSzoba)) return false;

    if (szam(f.minEmelet) !== null || szam(f.maxEmelet) !== null) {
        const e = emeletSzam(i.emelet);
        if (e === null || !rng(e, f.minEmelet, f.maxEmelet)) return false;
    }

    if (f.jelleg && i.telek_jelleg !== f.jelleg) return false;
    if (f.allapot && normAllapot(i.allapot) !== f.allapot) return false;
    if (f.kerulet && (i.kerulet || "") !== f.kerulet) return false;

    if (f.telepules === "_varos" && i.telepules) return false;
    if (f.telepules && f.telepules !== "_varos" && (i.telepules || "") !== f.telepules) return false;

    if (f.hely) {
        const h = i.hely_pontossag || (i.x && i.y ? "pontos" : "nincs");
        if (h !== f.hely && !(f.hely === "pontos" && h === "utca")) return false;
    }

    if (f.onlyPhotos && !(i.kep_db > 0 || (Array.isArray(i.kulso_kepek) && i.kulso_kepek.length))) return false;

    return true;

}

// Vevői igény -> illik-e a hirdetés
function igenyIllik(i, g) {

    if (g.varos && i.varos !== g.varos) return false;
    if ((i.tipus || "lakas") !== (g.tipus || "lakas")) return false;
    if ((i.ugylet || "elado") !== (g.ugylet || "elado")) return false;

    const ker = Array.isArray(g.keruletek) ? g.keruletek.filter(Boolean) : [];
    if (ker.length && !ker.includes(i.kerulet || "")) return false;

    if (g.telepules === "_varos" && i.telepules) return false;
    if (g.telepules && g.telepules !== "_varos" && (i.telepules || "") !== g.telepules) return false;

    // Az ár 10%-kal lehet a határ fölött (az eladók alkudnak)
    if (szam(g.max_ar) !== null && !(i.ar > 0 && i.ar <= g.max_ar * 1.1)) return false;
    if (szam(g.min_ar) !== null && !(i.ar >= g.min_ar)) return false;
    if (szam(g.min_nm) !== null && !(i.nm >= g.min_nm)) return false;
    if (szam(g.max_nm) !== null && !(i.nm <= g.max_nm)) return false;
    if (szam(g.min_szoba) !== null && !((i.szobak || 0) >= g.min_szoba)) return false;
    if (szam(g.max_szoba) !== null && !((i.szobak || 0) <= g.max_szoba)) return false;

    return true;

}

const MEZOK = `i.id, i.varos, i.tipus, i.ugylet, i.ar, i.nm, i.szobak, i.emelet, i.allapot, i.kerulet,
               i.telepules, i.telek_jelleg, i.kulso_kepek, i.cim, i.created_at, i.link, i.hely_pontossag, i.x, i.y,
               (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id)::int AS kep_db,
               (SELECT k.id FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id ORDER BY k.sorrend, k.id LIMIT 1) AS kep_id`;

// Aktív hirdetések egy városban (opcionálisan egy időpont után felvettek)
async function aktivHirdetesek(varos, tipus, ugylet, utana) {

    const felt = ["i.statusz = 'aktiv'"];
    const p = [];

    if (varos) { p.push(varos); felt.push(`i.varos = $${p.length}`); }
    if (tipus) { p.push(tipus); felt.push(`COALESCE(i.tipus, 'lakas') = $${p.length}`); }
    if (ugylet) { p.push(ugylet); felt.push(`COALESCE(i.ugylet, 'elado') = $${p.length}`); }
    if (utana) { p.push(utana); felt.push(`i.created_at > $${p.length}`); }

    const r = await db.query(`SELECT ${MEZOK} FROM ingatlanok i WHERE ${felt.join(" AND ")} ORDER BY i.created_at DESC`, p);

    return r.rows;

}

module.exports = { keresesIllik, igenyIllik, aktivHirdetesek, emeletSzam, normAllapot };
