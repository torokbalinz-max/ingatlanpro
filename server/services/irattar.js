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
const zip = require("../lib/zip");

// Megőrzési idő: 5 év a pénzügyi év lezárását követő év július 1-jétől
// (Legea contabilității 82/1991 art. 25, Legea 36/2023 után; OMFP 2634/2015
// pct. 37¹ – az e-Factura XML-re is). Pl. egy 2026-os irat 2032. július 1-ig.
function megorzesIg(d) {
    const ev = Number(String(d || "").slice(0, 4));
    return ev > 1900 ? `${ev + 6}-07-01` : null;
}

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
    "text/plain": "txt", "text/csv": "csv", "application/xml": "xml", "text/xml": "xml",
    // az SPV-ből letöltött e-Factura (a számla XML + az ANAF aláírása)
    "application/zip": "zip", "application/x-zip-compressed": "zip"
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

// Az e-Factura állapot a listához (a határidővel) – services/efacturaSpv.js
function efInfo(x) {
    return require("./efacturaSpv").szamlaInfo(x);
}

function katOk(resz, kat) {
    return (KATEGORIAK[resz] || []).some(k => k.kod === kat && !k.csakAuto);
}

const MEZOK = `i.id, i.resz, i.kategoria, i.cim, i.partner, i.szam, i.datum, i.osszeg, i.penznem, i.kezdet, i.lejar, i.felmondas_nap,
    i.statusz, i.megjegyzes, i.cimkek, i.fajl_nev, i.fajl_mime, i.fajl_meret, i.szamla_id, i.kiadas_id, i.megbizas_id,
    i.created_at, i.updated_at, i.anaf_id, COALESCE(u.nev, u.felhasznalonev) AS feltoltotte_nev`;

function sor(x) {
    return {
        ...x,
        forras: "feltoltott",
        datum: pu.pgDatum(x.datum), kezdet: pu.pgDatum(x.kezdet), lejar: pu.pgDatum(x.lejar),
        osszeg: x.osszeg === null ? null : Number(x.osszeg),
        van_fajl: !!x.fajl_nev,
        efactura_bejovo: !!x.anaf_id,
        megorzes_ig: x.resz === "szamla" ? megorzesIg(pu.pgDatum(x.datum)) : null
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
                   s.efactura_allapot, s.efactura_index, s.efactura_hiba, s.efactura_kuldve, s.efactura_b2c,
                   EXISTS (SELECT 1 FROM efactura_valaszok v WHERE v.szamla_id = s.id) AS efactura_zip_van,
                   COALESCE(s.vevo->>'nev', u.nev) AS partner,
                   (SELECT string_agg(t.megnevezes, ' | ' ORDER BY t.sorrend) FROM penzugy_tetelek t WHERE t.szamla_id = s.id) AS tetelek
            FROM penzugy_szamlak s LEFT JOIN penzugy_ugyfelek u ON u.id = s.ugyfel_id
            WHERE s.tipus = ANY($1::text[]) AND s.statusz <> 'piszkozat'
            ORDER BY s.kiallitva DESC, s.id DESC LIMIT 1000`, [tipusok]);
        s.rows.filter(x => evOk(x.kiallitva) && keresOk(x.sorszam, x.partner, x.tetelek, x.kulso_szam)).forEach(x => out.push({
            id: "sz-" + x.id, forras: "app", resz: "szamla", kategoria: x.tipus === "szamla" ? "kimeno" : "dijbekero",
            cim: x.sorszam, partner: x.partner, szam: x.sorszam, datum: pu.pgDatum(x.kiallitva), osszeg: Number(x.brutto), penznem: x.penznem,
            statusz: x.statusz, megjegyzes: x.tetelek, szamla_id: x.id, kulso_szam: x.kulso_szam, fizetesi_mod: x.fizetesi_mod,
            van_fajl: true, efactura: x.tipus === "szamla",
            ef: x.tipus === "szamla" ? efInfo({ ...x, tipus: x.tipus }) : null,
            // a díjbekérő nem adóügyi bizonylat – nincs megőrzési kötelezettség
            megorzes_ig: x.tipus === "szamla" ? megorzesIg(pu.pgDatum(x.kiallitva)) : null
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
            statusz: "nincs_irat", kiadas_id: x.id, kiadas_kategoria: x.kategoria, van_fajl: false,
            megorzes_ig: megorzesIg(pu.pgDatum(x.datum))
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
    if (MIME[mime] === "zip" && fej.toString("latin1", 0, 2) !== "PK") throw hibaKod("bad_file_type");
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
    const fej = ["Kategória", "Megnevezés", "Partner", "Szám", "Dátum", "Összeg", "Pénznem", "Kezdet", "Lejárat", "Állapot", "e-Factura", "e-Factura index", "Megőrzés eddig", "Megjegyzés", "Fájl"];
    const sorok = l.map(x => [x.kategoria, x.cim, x.partner, x.szam, x.datum, x.osszeg, x.penznem, x.kezdet, x.lejar, x.statusz,
        x.ef ? (x.ef.allapot || "nincs elküldve") : (x.efactura_bejovo ? "beérkezett" : ""), x.ef ? x.ef.index : "", x.megorzes_ig,
        x.megjegyzes, x.fajl_nev || (x.van_fajl ? "app" : "")].map(q).join(";"));
    return "\ufeff" + [fej.map(q).join(";"), ...sorok].join("\r\n");
}

// ===================== REGISTRUL-JURNAL DE ÎNCASĂRI ȘI PLĂȚI =====================
//  A PFA (egyszeres könyvvitel) bevétel–kiadás naplója egy időszakra:
//  befolyt bevételek (a kifizetett számlák a fizetés napján) és a kiadások,
//  készpénz / bank szerint, lejben (devizás számla: a számla árfolyamán).
//  A kiadásoknál a fizetés módja nincs rögzítve – „bancă”-nak vesszük.

function idoszak(ev, honap) {
    const e = /^\d{4}$/.test(String(ev)) ? Number(ev) : new Date().getFullYear();
    const h = /^\d{1,2}$/.test(String(honap || "")) && Number(honap) >= 1 && Number(honap) <= 12 ? Number(honap) : null;
    const tol = h ? `${e}-${String(h).padStart(2, "0")}-01` : `${e}-01-01`;
    const igD = h ? new Date(Date.UTC(e, h, 0)) : new Date(Date.UTC(e, 11, 31));
    return { ev: e, honap: h, tol, ig: igD.toISOString().slice(0, 10), nev: h ? `${e}-${String(h).padStart(2, "0")}` : String(e) };
}

async function registruSorok(ev, honap) {
    const p = idoszak(ev, honap);
    const b = await pu.beallitas();
    const sorok = [];
    const inc = await db.query(`
        SELECT s.id, s.sorszam, s.fizetve, s.brutto, s.penznem, s.arfolyam, s.fizetesi_mod, s.sztorno_eredeti_id,
               COALESCE(s.vevo->>'nev', u.nev) AS partner, e.fizetve AS eredeti_fizetve
        FROM penzugy_szamlak s
        LEFT JOIN penzugy_ugyfelek u ON u.id = s.ugyfel_id
        LEFT JOIN penzugy_szamlak e ON e.id = s.sztorno_eredeti_id
        WHERE s.tipus = 'szamla' AND s.fizetve IS NOT NULL AND s.fizetve BETWEEN $1::date AND $2::date
        ORDER BY s.fizetve, s.id`, [p.tol, p.ig]);
    inc.rows.forEach(s => {
        // a sztornó csak akkor csökkenti a bevételt, ha az eredetit kifizették
        if (s.sztorno_eredeti_id && !s.eredeti_fizetve) return;
        const arf = s.penznem === "RON" ? 1 : (Number(s.arfolyam) || Number(b.eur_arfolyam) || 5);
        const ron = Math.round(Number(s.brutto) * arf * 100) / 100;
        sorok.push({
            datum: pu.pgDatum(s.fizetve), dokumentum: `Factură ${s.sorszam}`,
            felul: `Încasare${s.sztorno_eredeti_id ? " (stornare)" : ""}${s.partner ? " – " + s.partner : ""}${s.penznem !== "RON" ? ` (${s.brutto} ${s.penznem}, curs ${arf})` : ""}`,
            numerar: s.fizetesi_mod === "keszpenz", be: ron, ki: 0
        });
    });
    const kid = await db.query(`SELECT * FROM penzugy_kiadasok WHERE datum BETWEEN $1::date AND $2::date ORDER BY datum, id`, [p.tol, p.ig]);
    kid.rows.forEach(k => {
        const arf = k.penznem === "RON" || !k.penznem ? 1 : (Number(b.eur_arfolyam) || 5);
        sorok.push({
            datum: pu.pgDatum(k.datum), dokumentum: k.szamlaszam ? `Factură ${k.szamlaszam}` : "Document justificativ",
            felul: `Plată – ${k.leiras}${k.szallito ? " (" + k.szallito + ")" : ""}${k.penznem && k.penznem !== "RON" ? ` (${k.osszeg} ${k.penznem})` : ""}`,
            numerar: false, be: 0, ki: Math.round(Number(k.osszeg) * arf * 100) / 100
        });
    });
    sorok.sort((a, b2) => String(a.datum).localeCompare(String(b2.datum)) || (b2.be - a.be));
    return { p, sorok };
}

async function registruCsv(ev, honap) {
    const { p, sorok } = await registruSorok(ev, honap);
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const n = v => (v ? v.toFixed(2).replace(".", ",") : "");
    const fej = ["Nr. crt.", "Data", "Felul și nr. documentului", "Felul operațiunii (explicații)",
        "Încasări numerar", "Încasări bancă", "Plăți numerar", "Plăți bancă"];
    let be = 0, ki = 0;
    const s = sorok.map((x, i) => {
        be += x.be; ki += x.ki;
        return [i + 1, x.datum, x.dokumentum, x.felul,
            x.numerar ? n(x.be) : "", x.numerar ? "" : n(x.be), x.numerar ? n(x.ki) : "", x.numerar ? "" : n(x.ki)].map(q).join(";");
    });
    const osszeg = [q(""), q(""), q(""), q("TOTAL"), q(n(sorok.filter(x => x.numerar).reduce((a, x) => a + x.be, 0))),
        q(n(sorok.filter(x => !x.numerar).reduce((a, x) => a + x.be, 0))), q(n(sorok.filter(x => x.numerar).reduce((a, x) => a + x.ki, 0))),
        q(n(sorok.filter(x => !x.numerar).reduce((a, x) => a + x.ki, 0)))].join(";");
    return "\ufeff" + [
        q(`Registrul-jurnal de încasări și plăți – ${p.nev} (RON)`),
        fej.map(q).join(";"), ...s, osszeg,
        [q(""), q(""), q(""), q("Total încasări – total plăți"), q(n(Math.round((be - ki) * 100) / 100))].join(";"),
        q("Notă: plățile (cheltuielile) sunt trecute la bancă, dacă modul de plată nu este înregistrat. Documentul se verifică de contabil.")
    ].join("\r\n");
}

// ===================== CSOMAG A KÖNYVELŐNEK (ZIP) =====================
//  Egy hónap / év minden pénzügyi irata egy fájlban:
//    00_Osszesito.csv                a lista (minden irat, e-Factura állapot, megőrzés)
//    01_Registru_incasari_plati.csv  a bevétel–kiadás napló
//    Facturi_emise/                  a kiállított számlák: ANAF ZIP (eredeti, aláírt),
//                                    e-Factura XML, nyomtatható HTML
//    Facturi_primite/, Bonuri/, Extrase_bancare/, Fiscal/, Altele/  a feltöltött iratok
//    CITESTE.txt                     magyarázat (románul és magyarul)

const MAPPA = { bejovo: "Facturi_primite", nyugta: "Bonuri", bankkivonat: "Extrase_bancare", ado: "Fiscal", egyeb: "Altele" };
const fajlNev = s => String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "document";

async function csomag(ev, honap) {
    const p = idoszak(ev, honap);
    const efactura = require("./efactura");
    const bizonylatHtml = (...a) => require("../routes/penzugy").bizonylatHtml(...a);
    const fajlok = [];
    const hianyok = [];

    // kiállított számlák
    const sz = await db.query(`
        SELECT s.id FROM penzugy_szamlak s
        WHERE s.tipus = 'szamla' AND s.statusz <> 'piszkozat' AND s.kiallitva BETWEEN $1::date AND $2::date
        ORDER BY s.kiallitva, s.id`, [p.tol, p.ig]);
    for (const { id } of sz.rows) {
        const s = await pu.szamla(id);
        if (!s) continue;
        const alap = `Facturi_emise/${fajlNev(s.sorszam)}`;
        const v = await db.query("SELECT zip FROM efactura_valaszok WHERE szamla_id = $1", [id]);
        if (v.rows[0] && v.rows[0].zip) fajlok.push({ nev: `${alap}_ANAF.zip`, adat: v.rows[0].zip });
        else hianyok.push(`${s.sorszam}: ${s.efactura_allapot === "kezi" ? "feltöltve az SPV-ben (az aláírt ZIP-et onnan töltsd le)" : "nincs ANAF-válasz (még nincs elküldve / elfogadva)"}`);
        try { fajlok.push({ nev: `${alap}.xml`, adat: await efactura.xml(s) }); } catch (e) { /* hiányos adatok */ }
        try { fajlok.push({ nev: `${alap}.html`, adat: await bizonylatHtml(s, { nyomtat: false }) }); } catch (e) { /* nem kritikus */ }
    }

    // feltöltött pénzügyi iratok (fájllal)
    const ir = await db.query(`
        SELECT id, kategoria, cim, szam, datum, fajl_nev, fajl FROM irattar
        WHERE resz = 'szamla' AND fajl IS NOT NULL AND COALESCE(datum, created_at::date) BETWEEN $1::date AND $2::date
        ORDER BY datum, id`, [p.tol, p.ig]);
    ir.rows.forEach(x => {
        const ext = (String(x.fajl_nev || "").match(/\.[A-Za-z0-9]{1,5}$/) || [""])[0];
        const nev = `${pu.pgDatum(x.datum) || ""} ${x.szam || x.cim || ""}`.trim();
        fajlok.push({ nev: `${MAPPA[x.kategoria] || "Altele"}/${fajlNev(nev)}${ext}`, adat: x.fajl });
    });

    // kiadások irat nélkül – figyelmeztetés a könyvelőnek
    const kn = await db.query(`
        SELECT k.datum, k.leiras, k.szallito, k.osszeg, k.penznem FROM penzugy_kiadasok k
        WHERE k.datum BETWEEN $1::date AND $2::date AND NOT EXISTS (SELECT 1 FROM irattar i WHERE i.kiadas_id = k.id)`, [p.tol, p.ig]);
    kn.rows.forEach(k => hianyok.push(`Kiadás irat nélkül / Cheltuială fără document: ${pu.pgDatum(k.datum)} ${k.leiras} ${k.szallito || ""} ${k.osszeg} ${k.penznem}`));

    const osszesito = await lista2(p);
    fajlok.unshift({ nev: "01_Registru_incasari_plati.csv", adat: await registruCsv(p.ev, p.honap) });
    fajlok.unshift({ nev: "00_Osszesito.csv", adat: osszesito });
    fajlok.push({
        nev: "CITESTE.txt", adat: [
            `Documente financiare – perioada ${p.nev} (${p.tol} – ${p.ig})`,
            "",
            "Facturi_emise/  facturile emise: *_ANAF.zip = factura originală (XML) cu semnătura Ministerului Finanțelor,",
            "                *.xml = fișierul e-Factura (UBL / CIUS-RO), *.html = forma tipăribilă",
            "Facturi_primite/  facturile primite (din SPV / încărcate), Bonuri/, Extrase_bancare/, Fiscal/, Altele/",
            "00_Osszesito.csv  lista documentelor; 01_Registru_incasari_plati.csv  registrul-jurnal de încasări și plăți",
            "Termen de păstrare: 5 ani de la 1 iulie a anului următor închiderii exercițiului financiar.",
            "",
            "Magyarul: Facturi_emise = kiállított számlák (az *_ANAF.zip az eredeti, ANAF-aláírással), Facturi_primite = bejövő",
            "számlák, Bonuri = nyugták, Extrase_bancare = bankkivonatok, Fiscal = adóügyi iratok, Altele = egyéb.",
            "",
            hianyok.length ? "Hiányzik / Lipsește:" : "Nincs hiányzó irat / Nu lipsesc documente.",
            ...hianyok.map(h => "  - " + h)
        ].join("\r\n")
    });
    return { nev: `iratok-${p.nev}.zip`, adat: zip.keszit(fajlok), db: fajlok.length, hianyok: hianyok.length };
}

// az összesítő CSV egy időszakra (a lista szűrője évre szól – itt a hónapra is szűkítünk)
async function lista2(p) {
    const l = (await lista({ resz: "szamla", ev: String(p.ev) })).filter(x => !x.datum || (x.datum >= p.tol && x.datum <= p.ig));
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const fej = ["Kategória / Categorie", "Megnevezés / Denumire", "Partner", "Szám / Număr", "Dátum / Data", "Összeg / Suma", "Pénznem / Moneda",
        "Állapot / Stare", "e-Factura", "e-Factura index", "Megőrzés eddig / Păstrare până la", "Fájl / Fișier"];
    const sorok = l.map(x => [x.kategoria, x.cim, x.partner, x.szam, x.datum, x.osszeg, x.penznem, x.statusz,
        x.ef ? (x.ef.allapot || "nincs elküldve") : (x.efactura_bejovo ? "primită" : ""), x.ef ? x.ef.index : "", x.megorzes_ig,
        x.fajl_nev || (x.van_fajl ? "app" : "")].map(q).join(";"));
    return "\ufeff" + [fej.map(q).join(";"), ...sorok].join("\r\n");
}

module.exports = { KATEGORIAK, RESZEK, MIME, lista, osszesites, teendok, feltolt, modosit, torol, fajl, egy, csv, registruCsv, csomag, idoszak, megorzesIg };
