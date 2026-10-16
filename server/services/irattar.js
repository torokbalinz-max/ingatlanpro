// ============================================================
//  Irattár – a cég iratai rendezetten, egy helyen
//
//  Két rész:
//    szamla     Számlák és pénzügyi iratok
//    szerzodes  Szerződések
//
//  Minden részben kategóriák (KATEGORIAK). A lista kétféle tételt mutat:
//    - feltöltött irat (irattar tábla, a fájl az adatbázisban)
//    - amit az app maga készített / tart nyilván – ezeket nem kell feltölteni:
//        kimenő számlák és díjbekérők  (penzugy_szamlak)
//        kiadások, amikhez még nincs irat csatolva (penzugy_kiadasok) – egy
//          kattintással csatolható hozzájuk a bejövő számla
//        megbízási szerződések  (megbizasok – az online / személyesen aláírtak)
//
//  A szerződéseknél: kezdet, lejárat, felmondási idő – a lejárók külön
//  látszanak (30 napon belül), és a Ma oldalon is.
// ============================================================

const crypto = require("crypto");
const db = require("../db/database");
const pu = require("./penzugy");

function hibaKod(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

const RESZEK = ["szamla", "szerzodes"];

// auto: az app maga tölti (nem csak feltöltés)
const KATEGORIAK = {
    szamla: [
        { kod: "kimeno", icon: "fa-solid fa-file-export", auto: true },
        { kod: "dijbekero", icon: "fa-solid fa-file-invoice", auto: true, csakAuto: true },
        { kod: "bejovo", icon: "fa-solid fa-file-import", auto: true },
        { kod: "nyugta", icon: "fa-solid fa-receipt" },
        { kod: "bankkivonat", icon: "fa-solid fa-building-columns" },
        { kod: "ado", icon: "fa-solid fa-landmark" },
        { kod: "egyeb", icon: "fa-solid fa-folder" }
    ],
    szerzodes: [
        { kod: "megbizasi", icon: "fa-solid fa-file-signature", auto: true },
        { kod: "ugyfel", icon: "fa-solid fa-user-tie" },
        { kod: "partner", icon: "fa-solid fa-handshake" },
        { kod: "szolgaltato", icon: "fa-solid fa-plug" },
        { kod: "berleti", icon: "fa-solid fa-key" },
        { kod: "munkatars", icon: "fa-solid fa-people-group" },
        { kod: "ceg", icon: "fa-solid fa-building" },
        { kod: "egyeb", icon: "fa-solid fa-folder" }
    ]
};

const STATUSZOK = ["aktiv", "lejart", "megszunt", "archiv"];

// Engedett fájltípusok (max. 15 MB)
const MIME = {
    "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/gif": "gif",
    "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.oasis.opendocument.text": "odt", "application/vnd.oasis.opendocument.spreadsheet": "ods",
    "text/plain": "txt", "text/csv": "csv", "application/xml": "xml", "text/xml": "xml"
};
const MAX_MERET = 15 * 1024 * 1024;

const sz = (v, max) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
};
const datum = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "").slice(0, 10)) ? String(v).slice(0, 10) : null);
const szam = v => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

function katOk(resz, kat) {
    return (KATEGORIAK[resz] || []).some(k => k.kod === kat && !k.csakAuto);
}

const MEZOK = `i.id, i.resz, i.kategoria, i.cim, i.partner, i.szam, i.datum, i.osszeg, i.penznem, i.kezdet, i.lejar, i.felmondas_nap,
    i.statusz, i.megjegyzes, i.cimkek, i.fajl_nev, i.fajl_mime, i.fajl_meret, i.szamla_id, i.kiadas_id, i.megbizas_id,
    i.created_at, i.updated_at, COALESCE(u.nev, u.felhasznalonev) AS feltoltotte_nev`;

function sor(x) {
    return {
        ...x,
        forras: "feltoltott",
        datum: pu.pgDatum(x.datum), kezdet: pu.pgDatum(x.kezdet), lejar: pu.pgDatum(x.lejar),
        osszeg: x.osszeg === null ? null : Number(x.osszeg),
        van_fajl: !!x.fajl_nev
    };
}

// ===================== LISTA =====================

async function lista({ resz = "szamla", kategoria = "", ev = "", q = "" } = {}) {

    if (!RESZEK.includes(resz)) throw hibaKod("bad_section");
    const evSzam = /^\d{4}$/.test(String(ev)) ? Number(ev) : null;
    const keres = String(q || "").trim().slice(0, 80);
    const minta = "%" + keres.replace(/[%_\\]/g, m => "\\" + m) + "%";
    const out = [];

    // ---- feltöltött iratok ----
    const p = [resz];
    let w = "i.resz = $1";
    if (kategoria) { p.push(kategoria); w += ` AND i.kategoria = $${p.length}`; }
    if (evSzam) { p.push(evSzam); w += ` AND EXTRACT(YEAR FROM COALESCE(i.datum, i.created_at)) = $${p.length}`; }
    if (keres) {
        p.push(minta);
        w += ` AND (i.cim ILIKE $${p.length} OR COALESCE(i.partner,'') ILIKE $${p.length} OR COALESCE(i.szam,'') ILIKE $${p.length}
                   OR COALESCE(i.megjegyzes,'') ILIKE $${p.length} OR COALESCE(i.cimkek,'') ILIKE $${p.length} OR COALESCE(i.fajl_nev,'') ILIKE $${p.length})`;
    }
    const r = await db.query(`SELECT ${MEZOK} FROM irattar i LEFT JOIN users u ON u.id = i.feltoltotte WHERE ${w} ORDER BY i.datum DESC NULLS LAST, i.id DESC LIMIT 1000`, p);
    out.push(...r.rows.map(sor));

    // ---- amit az app tart nyilván ----
    const keresOk = (...mezok) => !keres || mezok.some(m => String(m || "").toLowerCase().includes(keres.toLowerCase()));
    const evOk = d => !evSzam || String(pu.pgDatum(d) || "").startsWith(String(evSzam));

    if (resz === "szamla" && (!kategoria || kategoria === "kimeno" || kategoria === "dijbekero")) {
        const tipusok = !kategoria ? ["szamla", "dijbekero"] : [kategoria === "kimeno" ? "szamla" : "dijbekero"];
        const s = await db.query(`
            SELECT s.id, s.sorszam, s.tipus, s.kiallitva, s.statusz, s.brutto, s.penznem, s.kulso_szam, s.dijbekero_id, s.fizetesi_mod,
                   COALESCE(s.vevo->>'nev', u.nev) AS partner,
                   (SELECT string_agg(t.megnevezes, ' | ' ORDER BY t.sorrend) FROM penzugy_tetelek t WHERE t.szamla_id = s.id) AS tetelek
            FROM penzugy_szamlak s LEFT JOIN penzugy_ugyfelek u ON u.id = s.ugyfel_id
            WHERE s.tipus = ANY($1::text[]) AND s.statusz <> 'piszkozat'
            ORDER BY s.kiallitva DESC, s.id DESC LIMIT 1000`, [tipusok]);
        s.rows.filter(x => evOk(x.kiallitva) && keresOk(x.sorszam, x.partner, x.tetelek, x.kulso_szam)).forEach(x => out.push({
            id: "sz-" + x.id, forras: "app", resz: "szamla", kategoria: x.tipus === "szamla" ? "kimeno" : "dijbekero",
            cim: x.sorszam, partner: x.partner, szam: x.sorszam, datum: pu.pgDatum(x.kiallitva), osszeg: Number(x.brutto), penznem: x.penznem,
            statusz: x.statusz, megjegyzes: x.tetelek, szamla_id: x.id, kulso_szam: x.kulso_szam, fizetesi_mod: x.fizetesi_mod,
            van_fajl: true, efactura: x.tipus === "szamla"
        }));
    }

    if (resz === "szamla" && (!kategoria || kategoria === "bejovo")) {
        // kiadások, amikhez még nincs irat csatolva
        const k = await db.query(`
            SELECT k.* FROM penzugy_kiadasok k
            WHERE NOT EXISTS (SELECT 1 FROM irattar i WHERE i.kiadas_id = k.id)
            ORDER BY k.datum DESC, k.id DESC LIMIT 1000`);
        k.rows.filter(x => evOk(x.datum) && keresOk(x.leiras, x.szallito, x.szamlaszam)).forEach(x => out.push({
            id: "kd-" + x.id, forras: "kiadas", resz: "szamla", kategoria: "bejovo",
            cim: x.leiras, partner: x.szallito, szam: x.szamlaszam, datum: pu.pgDatum(x.datum), osszeg: Number(x.osszeg), penznem: x.penznem,
            statusz: "nincs_irat", kiadas_id: x.id, kiadas_kategoria: x.kategoria, van_fajl: false
        }));
    }

    if (resz === "szerzodes" && (!kategoria || kategoria === "megbizasi")) {
        const m = await db.query(`
            SELECT m.id, m.szerzodes_szam, m.nev, m.cim, m.varos, m.statusz, m.szerzodes_allapot, m.szerzodes_mod,
                   m.alairva, m.szerzodes_elfogadva, m.szerzodes_datum, m.eladva
            FROM megbizasok m
            WHERE m.szerzodes_allapot IN ('elfogadva', 'alairva') OR m.alairva IS NOT NULL
            ORDER BY COALESCE(m.alairva, m.szerzodes_elfogadva::date, m.szerzodes_datum) DESC NULLS LAST, m.id DESC LIMIT 1000`);
        m.rows.forEach(x => {
            const d = pu.pgDatum(x.alairva || x.szerzodes_elfogadva || x.szerzodes_datum);
            if (!evOk(d) || !keresOk(x.szerzodes_szam, x.nev, x.cim, x.varos)) return;
            out.push({
                id: "mb-" + x.id, forras: "app", resz: "szerzodes", kategoria: "megbizasi",
                cim: x.szerzodes_szam || ("#" + x.id), partner: x.nev, szam: x.szerzodes_szam, datum: d,
                statusz: x.eladva || ["eladva", "lezarva", "lemondva"].includes(x.statusz) ? "megszunt" : (x.szerzodes_allapot === "alairva" ? "aktiv" : "elfogadva"),
                megjegyzes: [x.cim, x.varos].filter(Boolean).join(", "), megbizas_id: x.id, van_fajl: true
            });
        });
    }

    out.sort((a, b) => String(b.datum || "").localeCompare(String(a.datum || "")));
    return out;
}

// ===================== ÖSSZESÍTÉS =====================

async function osszesites(resz) {

    if (!RESZEK.includes(resz)) throw hibaKod("bad_section");
    const kat = {};
    const r = await db.query("SELECT kategoria, COUNT(*)::int AS n FROM irattar WHERE resz = $1 GROUP BY kategoria", [resz]);
    r.rows.forEach(x => { kat[x.kategoria] = x.n; });

    const out = { kategoriak: kat, evek: [] };

    if (resz === "szamla") {
        const s = await db.query("SELECT tipus, COUNT(*)::int AS n FROM penzugy_szamlak WHERE statusz <> 'piszkozat' GROUP BY tipus");
        s.rows.forEach(x => {
            const k = x.tipus === "szamla" ? "kimeno" : "dijbekero";
            kat[k] = (kat[k] || 0) + x.n;
        });
        const k = await db.query("SELECT COUNT(*)::int AS n FROM penzugy_kiadasok k WHERE NOT EXISTS (SELECT 1 FROM irattar i WHERE i.kiadas_id = k.id)");
        out.kiadas_irat_nelkul = k.rows[0].n;
        kat.bejovo = (kat.bejovo || 0) + k.rows[0].n;
        const ev = await db.query(`
            SELECT DISTINCT ev FROM (
                SELECT EXTRACT(YEAR FROM COALESCE(datum, created_at))::int AS ev FROM irattar WHERE resz = 'szamla'
                UNION SELECT EXTRACT(YEAR FROM kiallitva)::int FROM penzugy_szamlak WHERE kiallitva IS NOT NULL
                UNION SELECT EXTRACT(YEAR FROM datum)::int FROM penzugy_kiadasok WHERE datum IS NOT NULL) x
            WHERE ev IS NOT NULL ORDER BY ev DESC`);
        out.evek = ev.rows.map(x => x.ev);
    } else {
        const m = await db.query("SELECT COUNT(*)::int AS n FROM megbizasok WHERE szerzodes_allapot IN ('elfogadva', 'alairva') OR alairva IS NOT NULL");
        kat.megbizasi = (kat.megbizasi || 0) + m.rows[0].n;
        const l = await db.query(`
            SELECT COUNT(*) FILTER (WHERE lejar >= CURRENT_DATE AND lejar <= CURRENT_DATE + 30)::int AS lejaro,
                   COUNT(*) FILTER (WHERE lejar < CURRENT_DATE)::int AS lejart
            FROM irattar WHERE resz = 'szerzodes' AND statusz = 'aktiv'`);
        out.lejaro = l.rows[0].lejaro;
        out.lejart = l.rows[0].lejart;
        const ev = await db.query(`
            SELECT DISTINCT ev FROM (
                SELECT EXTRACT(YEAR FROM COALESCE(datum, created_at))::int AS ev FROM irattar WHERE resz = 'szerzodes'
                UNION SELECT EXTRACT(YEAR FROM COALESCE(alairva, szerzodes_elfogadva::date, szerzodes_datum))::int FROM megbizasok
                      WHERE szerzodes_allapot IN ('elfogadva', 'alairva') OR alairva IS NOT NULL) x
            WHERE ev IS NOT NULL ORDER BY ev DESC`);
        out.evek = ev.rows.map(x => x.ev);
    }
    out.osszes = Object.values(kat).reduce((a, b) => a + b, 0);
    return out;

}

// A Ma oldalhoz: lejáró / lejárt szerződések, irat nélküli kiadások
async function teendok() {
    try {
        const r = await db.query(`
            SELECT COUNT(*) FILTER (WHERE lejar >= CURRENT_DATE AND lejar <= CURRENT_DATE + 30)::int AS lejaro,
                   COUNT(*) FILTER (WHERE lejar < CURRENT_DATE)::int AS lejart
            FROM irattar WHERE resz = 'szerzodes' AND statusz = 'aktiv'`);
        return r.rows[0];
    } catch (e) {
        return { lejaro: 0, lejart: 0 };
    }
}

// ===================== FELTÖLTÉS, MÓDOSÍTÁS =====================

function fajlBe(b) {
    if (!b.fajl_adat) return null;
    const mime = String(b.fajl_mime || "").toLowerCase();
    if (!MIME[mime]) throw hibaKod("bad_file_type");
    const nyers = String(b.fajl_adat).replace(/^data:[^;]+;base64,/, "");
    const adat = Buffer.from(nyers, "base64");
    if (!adat.length) throw hibaKod("empty_file");
    if (adat.length > MAX_MERET) throw hibaKod("file_too_large");
    // PDF-nél és képnél a fájl eleje is egyezzen a típussal
    const fej = adat.subarray(0, 12);
    if (mime === "application/pdf" && fej.toString("latin1", 0, 5) !== "%PDF-") throw hibaKod("bad_file_type");
    if (mime === "image/png" && fej.toString("hex", 0, 4) !== "89504e47") throw hibaKod("bad_file_type");
    if (mime === "image/jpeg" && fej.toString("hex", 0, 3) !== "ffd8ff") throw hibaKod("bad_file_type");
    const nev = (sz(b.fajl_nev, 160) || ("irat." + MIME[mime])).replace(/[\\/\0]/g, "_");
    return { nev, mime, meret: adat.length, adat, hash: crypto.createHash("sha256").update(adat).digest("hex") };
}

function mezok(b, regi) {
    const resz = RESZEK.includes(b.resz) ? b.resz : (regi ? regi.resz : "szamla");
    const kategoria = b.kategoria && katOk(resz, b.kategoria) ? b.kategoria : (regi && regi.resz === resz ? regi.kategoria : null);
    if (!kategoria) throw hibaKod("bad_category");
    const v = (k, f) => (k in b ? f(b[k]) : (regi ? regi[k] : null));
    return {
        resz, kategoria,
        cim: sz(b.cim, 200) || (regi && regi.cim) || sz(b.fajl_nev, 200),
        partner: v("partner", x => sz(x, 200)),
        szam: v("szam", x => sz(x, 80)),
        datum: v("datum", datum),
        osszeg: v("osszeg", szam),
        penznem: ["RON", "EUR", "HUF", "USD"].includes(b.penznem) ? b.penznem : (regi ? regi.penznem : "RON"),
        kezdet: v("kezdet", datum),
        lejar: v("lejar", datum),
        felmondas_nap: v("felmondas_nap", x => { const n = Math.round(Number(x)); return Number.isFinite(n) && n > 0 ? Math.min(n, 3650) : null; }),
        statusz: STATUSZOK.includes(b.statusz) ? b.statusz : (regi ? regi.statusz : "aktiv"),
        megjegyzes: v("megjegyzes", x => sz(x, 2000)),
        cimkek: v("cimkek", x => sz(x, 300)),
        kiadas_id: v("kiadas_id", x => Number(x) || null),
        szamla_id: v("szamla_id", x => Number(x) || null),
        megbizas_id: v("megbizas_id", x => Number(x) || null)
    };
}

async function feltolt(user, b) {
    const d = mezok(b || {}, null);
    const f = fajlBe(b || {});
    if (!d.cim) throw hibaKod("missing_title");
    if (d.kiadas_id) {
        const k = await db.query("SELECT 1 FROM penzugy_kiadasok WHERE id = $1", [d.kiadas_id]);
        if (!k.rowCount) d.kiadas_id = null;
    }
    let duplikatum = null;
    if (f) {
        const du = await db.query("SELECT id, cim FROM irattar WHERE fajl_hash = $1 LIMIT 1", [f.hash]);
        if (du.rowCount) duplikatum = du.rows[0];
    }
    const r = await db.query(`
        INSERT INTO irattar (resz, kategoria, cim, partner, szam, datum, osszeg, penznem, kezdet, lejar, felmondas_nap, statusz, megjegyzes, cimkek,
                             kiadas_id, szamla_id, megbizas_id, fajl_nev, fajl_mime, fajl_meret, fajl_hash, fajl, feltoltotte)
        VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, CURRENT_DATE),$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING id`,
        [d.resz, d.kategoria, d.cim, d.partner, d.szam, d.datum, d.osszeg, d.penznem, d.kezdet, d.lejar, d.felmondas_nap, d.statusz, d.megjegyzes, d.cimkek,
         d.kiadas_id, d.szamla_id, d.megbizas_id, f && f.nev, f && f.mime, f && f.meret, f && f.hash, f && f.adat, user ? user.id : null]);
    return { id: r.rows[0].id, duplikatum };
}

async function modosit(id, b) {
    const r = await db.query("SELECT * FROM irattar WHERE id = $1", [Number(id) || 0]);
    const regi = r.rows[0];
    if (!regi) throw hibaKod("not_found");
    regi.datum = pu.pgDatum(regi.datum); regi.kezdet = pu.pgDatum(regi.kezdet); regi.lejar = pu.pgDatum(regi.lejar);
    const d = mezok(b || {}, regi);
    const f = fajlBe(b || {});
    await db.query(`
        UPDATE irattar SET resz=$2, kategoria=$3, cim=$4, partner=$5, szam=$6, datum=$7, osszeg=$8, penznem=$9, kezdet=$10, lejar=$11,
               felmondas_nap=$12, statusz=$13, megjegyzes=$14, cimkek=$15, kiadas_id=$16, updated_at=NOW()
        WHERE id = $1`,
        [regi.id, d.resz, d.kategoria, d.cim, d.partner, d.szam, d.datum, d.osszeg, d.penznem, d.kezdet, d.lejar, d.felmondas_nap, d.statusz, d.megjegyzes, d.cimkek, d.kiadas_id]);
    if (f) {
        await db.query("UPDATE irattar SET fajl_nev=$2, fajl_mime=$3, fajl_meret=$4, fajl_hash=$5, fajl=$6, updated_at=NOW() WHERE id=$1",
            [regi.id, f.nev, f.mime, f.meret, f.hash, f.adat]);
    }
    return { id: regi.id };
}

async function torol(id) {
    const r = await db.query("DELETE FROM irattar WHERE id = $1 RETURNING id", [Number(id) || 0]);
    if (!r.rowCount) throw hibaKod("not_found");
}

async function fajl(id) {
    const r = await db.query("SELECT fajl_nev, fajl_mime, fajl FROM irattar WHERE id = $1", [Number(id) || 0]);
    const x = r.rows[0];
    if (!x || !x.fajl) return null;
    return { nev: x.fajl_nev, mime: x.fajl_mime, adat: x.fajl };
}

async function egy(id) {
    const r = await db.query(`SELECT ${MEZOK} FROM irattar i LEFT JOIN users u ON u.id = i.feltoltotte WHERE i.id = $1`, [Number(id) || 0]);
    return r.rows[0] ? sor(r.rows[0]) : null;
}

// ===================== CSV (a könyvelőnek) =====================

async function csv(szuro) {
    const l = await lista(szuro);
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const fej = ["Kategória", "Megnevezés", "Partner", "Szám", "Dátum", "Összeg", "Pénznem", "Kezdet", "Lejárat", "Állapot", "Megjegyzés", "Fájl"];
    const sorok = l.map(x => [x.kategoria, x.cim, x.partner, x.szam, x.datum, x.osszeg, x.penznem, x.kezdet, x.lejar, x.statusz, x.megjegyzes, x.fajl_nev || (x.van_fajl ? "app" : "")].map(q).join(";"));
    return "﻿" + [fej.map(q).join(";"), ...sorok].join("\r\n");
}

module.exports = { KATEGORIAK, RESZEK, MIME, lista, osszesites, teendok, feltolt, modosit, torol, fajl, egy, csv };
