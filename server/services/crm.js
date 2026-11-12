// ============================================================
//  CRM – ügyfelek, tevékenységek, feladatok, beérkező érdeklődések
//
//  Térségek (ter): minden irodának külön, zárt CRM-je van (ter = az iroda
//  id-je); az oldal saját értékesítésének CRM-je ter = 0 (iroda_id NULL,
//  csak az admin). Egy iroda soha nem látja a másikét.
//
//  Ki mit lát egy irodán belül:
//   - a vezető (és az admin): mindent, és ő osztja ki / adja át az ügyfeleket
//   - a tag (ügynök): csak a saját ügyfeleit (felelős = ő) és a saját feladatait;
//     a beérkező érdeklődések közül a neki címzetteket
//
//  Ügyfél: név, elérhetőség, szerepek (vevő / eladó / bérlő / bérbeadó),
//  állapot (új → kapcsolatban → aktív → tárgyalás → nyert / elvesztett /
//  inaktív), forrás, címkék, keresési igény (a saját ingatlanok közül az
//  illeszkedőket mutatja), jegyzet, kapcsolódó ingatlanok, idővonal.
//
//  Beérkező: a térség hirdetéseire jött üzenetek, küldőnként csoportosítva –
//  egy kattintással ügyfél lesz belőle (vagy a meglévő ügyfélhez kerül).
// ============================================================

const db = require("../db/database");

const ALLAPOTOK = ["uj", "kapcsolat", "aktiv", "targyalas", "nyert", "elvesztett", "inaktiv"];
const NYITOTT = ["uj", "kapcsolat", "aktiv", "targyalas"];
const SZEREPEK = ["vevo", "elado", "berlo", "berbeado"];
const FORRASOK = ["hirdetes", "telefon", "ajanlas", "weboldal", "kozosseg", "szemelyes", "egyeb"];
const TEV_TIPUSOK = ["jegyzet", "hivas", "email", "uzenet", "talalkozo", "megtekintes", "ajanlat", "rendszer"];
const KAPCS_ALLAPOT = ["uj", "kuldve", "megtekintes", "ajanlat", "elvetve"];

function hibaKod(kod, status = 400) {
    const e = new Error(kod);
    e.kod = kod;
    e.status = status;
    return e;
}

const sz = (v, max = 300) => {
    if (v === undefined || v === null) return null;
    const t = String(v).trim();
    return t ? t.slice(0, max) : null;
};
const szam = v => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v))) ? null : Number(v);

// ---------- Jogosultság ----------
// ctx: { ter, irodaId (null = az oldalé), userId, vezeto, admin }
async function kontextus(req, terParam) {
    const ter = Number(terParam) || 0;
    if (!req.user && req.szerep !== "admin") throw hibaKod("login_required", 401);
    const userId = req.user ? req.user.id : null;
    if (ter === 0) {
        if (req.szerep !== "admin") throw hibaKod("forbidden", 403);
        return { ter: 0, irodaId: null, userId, vezeto: true, admin: true };
    }
    const j = await require("../routes/irodak").jog(req, ter);
    if (!j.tag) throw hibaKod("not_member", 403);
    // Csomaghoz kötött iroda: amíg nincs kifizetve, a CRM zárva
    if (!j.admin) {
        const ia = await require("./penzugy").irodaAktiv(ter).catch(() => ({ aktiv: true }));
        if (!ia.aktiv) throw hibaKod("agency_inactive", 402);
    }
    return { ter, irodaId: ter, userId, vezeto: !!j.vezeto, admin: !!j.admin };
}

// A térség szűrője az SQL-ben (alias.iroda_id)
function terSql(ctx, alias, p) {
    if (ctx.irodaId === null) return `${alias}.iroda_id IS NULL`;
    p.push(ctx.irodaId);
    return `${alias}.iroda_id = $${p.length}`;
}

// A tag csak a saját ügyfeleit látja
function lathatoSql(ctx, alias, p) {
    if (ctx.vezeto) return "TRUE";
    p.push(ctx.userId);
    return `${alias}.felelos_id = $${p.length}`;
}

async function ugyfelJog(ctx, id) {
    const p = [Number(id) || 0];
    const r = await db.query(`SELECT * FROM crm_ugyfelek u WHERE u.id = $1 AND ${terSql(ctx, "u", p)} AND ${lathatoSql(ctx, "u", p)}`, p);
    if (!r.rowCount) throw hibaKod("not_found", 404);
    return r.rows[0];
}

// Kik lehetnek felelősök (az iroda aktív tagjai; az oldalnál az adminok)
async function tagok(ctx) {
    if (ctx.irodaId === null) {
        const r = await db.query(`SELECT id, COALESCE(nev, felhasznalonev, email) AS nev FROM users WHERE szerep = 'admin' ORDER BY nev`).catch(() => ({ rows: [] }));
        return r.rows;
    }
    const r = await db.query(`
        SELECT u.id, COALESCE(u.nev, u.felhasznalonev, u.email) AS nev, t.szerep
        FROM iroda_tagok t JOIN users u ON u.id = t.user_id
        WHERE t.iroda_id = $1 AND COALESCE(t.statusz, 'aktiv') = 'aktiv' ORDER BY nev`, [ctx.irodaId]);
    return r.rows;
}

async function felelosOk(ctx, felelosId) {
    if (!felelosId) return null;
    if (!ctx.vezeto) return ctx.userId;              // a tag csak magának
    const t = await tagok(ctx);
    if (!t.some(x => x.id === Number(felelosId))) throw hibaKod("bad_owner");
    return Number(felelosId);
}

// ---------- Ügyfél adatainak tisztítása ----------
function igenyTisztit(i) {
    if (!i || typeof i !== "object") return null;
    const o = {
        ugylet: ["elado", "kiado"].includes(i.ugylet) ? i.ugylet : null,
        tipus: sz(i.tipus, 30),
        varos: sz(i.varos, 80),
        kerulet: sz(i.kerulet, 80),
        ar_min: szam(i.ar_min),
        ar_max: szam(i.ar_max),
        szoba_min: szam(i.szoba_min),
        nm_min: szam(i.nm_min),
        megjegyzes: sz(i.megjegyzes, 500)
    };
    return Object.values(o).some(v => v !== null) ? o : null;
}

function lista(v, ervenyes) {
    const a = Array.isArray(v) ? v : [];
    return [...new Set(a.map(x => String(x).trim()).filter(x => x && (!ervenyes || ervenyes.includes(x))))].slice(0, 12);
}

function cimkeLista(v) {
    const a = Array.isArray(v) ? v : String(v || "").split(",");
    return [...new Set(a.map(x => String(x).trim().slice(0, 30)).filter(Boolean))].slice(0, 12);
}

// ---------- Tevékenység (idővonal) ----------
async function naploz(ugyfelId, userId, tipus, szoveg, ingatlanId = null, kapcsolat = false) {
    await db.query(`INSERT INTO crm_tevekenysegek (ugyfel_id, user_id, tipus, szoveg, ingatlan_id) VALUES ($1,$2,$3,$4,$5)`,
        [ugyfelId, userId, tipus, sz(szoveg, 4000), ingatlanId]);
    if (kapcsolat) await db.query("UPDATE crm_ugyfelek SET utolso_kapcsolat = NOW(), updated_at = NOW() WHERE id = $1", [ugyfelId]);
    else await db.query("UPDATE crm_ugyfelek SET updated_at = NOW() WHERE id = $1", [ugyfelId]);
}

// ===================== ÁTTEKINTÉS =====================

async function attekintes(ctx) {
    const p = [];
    const t = terSql(ctx, "u", p);
    const l = lathatoSql(ctx, "u", p);
    const db1 = await db.query(`
        SELECT u.allapot, COUNT(*)::int AS n FROM crm_ugyfelek u WHERE ${t} AND ${l} GROUP BY u.allapot`, p);
    const allapotok = Object.fromEntries(ALLAPOTOK.map(a => [a, 0]));
    db1.rows.forEach(r => { allapotok[r.allapot] = r.n; });

    // Feladatok: késésben, ma, a következő 7 nap
    const fp = [];
    const ft = terSql(ctx, "f", fp);
    let fl = "TRUE";
    if (!ctx.vezeto) { fp.push(ctx.userId); fl = `f.felelos_id = $${fp.length}`; }
    const fel = await db.query(`
        SELECT f.*, to_char(f.hatarido, 'YYYY-MM-DD"T"HH24:MI') AS hatarido, u.nev AS ugyfel_nev, COALESCE(us.nev, us.felhasznalonev) AS felelos_nev
        FROM crm_feladatok f
        LEFT JOIN crm_ugyfelek u ON u.id = f.ugyfel_id
        LEFT JOIN users us ON us.id = f.felelos_id
        WHERE ${ft} AND ${fl} AND f.kesz IS NULL AND f.hatarido IS NOT NULL AND f.hatarido < CURRENT_DATE + INTERVAL '8 days'
        ORDER BY f.hatarido LIMIT 60`, fp);

    // Akikkel régóta nem volt kapcsolat (nyitott, 14 napja)
    const hp = [];
    const ht = terSql(ctx, "u", hp);
    const hl = lathatoSql(ctx, "u", hp);
    const hidegek = await db.query(`
        SELECT u.id, u.nev, u.allapot, u.utolso_kapcsolat, u.created_at
        FROM crm_ugyfelek u
        WHERE ${ht} AND ${hl} AND u.allapot = ANY($${hp.length + 1})
          AND COALESCE(u.utolso_kapcsolat, u.created_at) < NOW() - INTERVAL '14 days'
          AND NOT EXISTS (SELECT 1 FROM crm_feladatok f WHERE f.ugyfel_id = u.id AND f.kesz IS NULL)
        ORDER BY COALESCE(u.utolso_kapcsolat, u.created_at) LIMIT 8`, [...hp, NYITOTT]);

    // Legutóbbi tevékenységek
    const tp = [];
    const tt = terSql(ctx, "u", tp);
    const tl = lathatoSql(ctx, "u", tp);
    const tev = await db.query(`
        SELECT t.id, t.tipus, t.szoveg, t.created_at, u.id AS ugyfel_id, u.nev AS ugyfel_nev, COALESCE(us.nev, us.felhasznalonev) AS user_nev
        FROM crm_tevekenysegek t JOIN crm_ugyfelek u ON u.id = t.ugyfel_id
        LEFT JOIN users us ON us.id = t.user_id
        WHERE ${tt} AND ${tl} ORDER BY t.id DESC LIMIT 12`, tp);

    const beerkezett = await beerkezo(ctx, { csakSzam: true });

    const mp = [];
    const mt = terSql(ctx, "m", mp);
    let ml = "TRUE";
    if (!ctx.vezeto) { mp.push(ctx.userId); ml = `m.felelos_id = $${mp.length}`; }
    const megt = await db.query(`${MEGT_SELECT}
        WHERE ${mt} AND ${ml} AND m.statusz = 'tervezett' AND m.kezdet >= (NOW() AT TIME ZONE 'Europe/Bucharest') - INTERVAL '3 hours'
        ORDER BY m.kezdet LIMIT 10`, mp);
    // Lezáratlan: elmúlt, de még „tervezett” – rögzíteni kell az eredményt
    const lezaratlan = await db.query(`${MEGT_SELECT}
        WHERE ${mt} AND ${ml} AND m.statusz = 'tervezett' AND m.kezdet < (NOW() AT TIME ZONE 'Europe/Bucharest') - INTERVAL '3 hours'
        ORDER BY m.kezdet DESC LIMIT 10`, mp);

    const ujAjanlat = ctx.irodaId !== null ? await require("./ajanlat").nyitottDb(ctx) : 0;

    // Megtekintés-kérések (új) és „hívom” jelzések (72 óra) – services/megtekintes.js
    const mk = require("./megtekintes");
    const ujKeres = ctx.irodaId !== null ? await mk.irodaNyitottDb(ctx).catch(() => 0) : 0;
    const hivasDb = ctx.irodaId !== null ? (await mk.hivasok(ctx).catch(() => [])).length : 0;

    return {
        uj_ajanlat: ujAjanlat,
        uj_keres: ujKeres,
        hivas_jelzes: hivasDb,
        megtekintesek: megt.rows,
        lezaratlan: lezaratlan.rows,
        allapotok,
        nyitott: NYITOTT.reduce((s, a) => s + allapotok[a], 0),
        feladatok: fel.rows,
        hidegek: hidegek.rows,
        tevekenysegek: tev.rows,
        beerkezett
    };
}

// ===================== ÜGYFELEK =====================

async function ugyfelLista(ctx, q = {}) {
    const p = [];
    const felt = [terSql(ctx, "u", p), lathatoSql(ctx, "u", p)];
    if (q.q) {
        p.push(`%${String(q.q).trim().toLowerCase()}%`);
        felt.push(`(LOWER(u.nev) LIKE $${p.length} OR LOWER(COALESCE(u.email,'')) LIKE $${p.length} OR REGEXP_REPLACE(COALESCE(u.telefon,''), '[^0-9+]', '', 'g') LIKE REGEXP_REPLACE($${p.length}, '[^0-9+%]', '', 'g') OR LOWER(COALESCE(u.jegyzet,'')) LIKE $${p.length})`);
    }
    // A gyors szűrők darabszáma (a kereső és a jogosultság szerint)
    const NYIT = `u.allapot = ANY(ARRAY['uj','kapcsolat','aktiv','targyalas'])`;
    const fk = await db.query(`
        SELECT COUNT(*) FILTER (WHERE ${NYIT} AND NOT EXISTS (SELECT 1 FROM crm_feladatok f WHERE f.ugyfel_id = u.id AND f.kesz IS NULL)
                 AND NOT EXISTS (SELECT 1 FROM crm_megtekintesek m WHERE m.ugyfel_id = u.id AND m.statusz = 'tervezett' AND m.kezdet >= (NOW() AT TIME ZONE 'Europe/Bucharest') - INTERVAL '3 hours'))::int AS lepes,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM crm_feladatok f WHERE f.ugyfel_id = u.id AND f.kesz IS NULL AND f.hatarido < (NOW() AT TIME ZONE 'Europe/Bucharest')))::int AS kesik,
               COUNT(*) FILTER (WHERE ${NYIT} AND COALESCE(u.utolso_kapcsolat, u.created_at) < NOW() - INTERVAL '14 days')::int AS hideg
        FROM crm_ugyfelek u WHERE ${felt.join(" AND ")}`, p);
    // Gyors szűrők (a lista fölötti gombok): teendő nélküli, késő feladatú, rég nem keresett
    if (q.fokusz === "lepes") felt.push(`u.allapot = ANY(ARRAY['uj','kapcsolat','aktiv','targyalas'])
        AND NOT EXISTS (SELECT 1 FROM crm_feladatok f WHERE f.ugyfel_id = u.id AND f.kesz IS NULL)
        AND NOT EXISTS (SELECT 1 FROM crm_megtekintesek m WHERE m.ugyfel_id = u.id AND m.statusz = 'tervezett' AND m.kezdet >= (NOW() AT TIME ZONE 'Europe/Bucharest') - INTERVAL '3 hours')`);
    else if (q.fokusz === "kesik") felt.push(`EXISTS (SELECT 1 FROM crm_feladatok f WHERE f.ugyfel_id = u.id AND f.kesz IS NULL AND f.hatarido < (NOW() AT TIME ZONE 'Europe/Bucharest'))`);
    else if (q.fokusz === "hideg") felt.push(`u.allapot = ANY(ARRAY['uj','kapcsolat','aktiv','targyalas']) AND COALESCE(u.utolso_kapcsolat, u.created_at) < NOW() - INTERVAL '14 days'`);
    if (SZEREPEK.includes(q.szerep)) { p.push(JSON.stringify([q.szerep])); felt.push(`u.szerepek @> $${p.length}::jsonb`); }
    if (q.felelos === "nincs") felt.push("u.felelos_id IS NULL");
    else if (szam(q.felelos)) { p.push(Number(q.felelos)); felt.push(`u.felelos_id = $${p.length}`); }
    if (q.cimke) { p.push(JSON.stringify([String(q.cimke)])); felt.push(`u.cimkek @> $${p.length}::jsonb`); }
    // Fázisonkénti darabszám (a fázis-fülekhez) – minden szűrővel, kivéve magát a fázist
    const szamok = await db.query(`SELECT u.allapot, COUNT(*)::int AS n FROM crm_ugyfelek u WHERE ${felt.join(" AND ")} GROUP BY 1`, p);
    if (q.allapot === "nyitott") { p.push(NYITOTT); felt.push(`u.allapot = ANY($${p.length})`); }
    else if (q.allapot === "lezart") felt.push(`u.allapot IN ('elvesztett', 'inaktiv')`);
    else if (ALLAPOTOK.includes(q.allapot)) { p.push(q.allapot); felt.push(`u.allapot = $${p.length}`); }

    const rend = {
        friss: "u.updated_at DESC",
        nev: "LOWER(u.nev)",
        kapcsolat: "COALESCE(u.utolso_kapcsolat, u.created_at) ASC",
        uj: "u.created_at DESC"
    }[q.rend] || "u.updated_at DESC";

    const r = await db.query(`
        SELECT u.id, u.nev, u.telefon, u.email, u.szerepek, u.allapot, u.forras, u.cimkek, u.igeny,
               u.felelos_id, COALESCE(us.nev, us.felhasznalonev) AS felelos_nev,
               u.utolso_kapcsolat, u.created_at, u.updated_at,
               (SELECT to_char(MIN(f.hatarido), 'YYYY-MM-DD"T"HH24:MI') FROM crm_feladatok f WHERE f.ugyfel_id = u.id AND f.kesz IS NULL) AS kov_feladat,
               (SELECT f.cim FROM crm_feladatok f WHERE f.ugyfel_id = u.id AND f.kesz IS NULL ORDER BY f.hatarido NULLS LAST LIMIT 1) AS kov_feladat_cim,
               (SELECT to_char(m.kezdet, 'YYYY-MM-DD"T"HH24:MI') FROM crm_megtekintesek m WHERE m.ugyfel_id = u.id AND m.statusz = 'tervezett'
                  AND m.kezdet >= (NOW() AT TIME ZONE 'Europe/Bucharest') - INTERVAL '3 hours' ORDER BY m.kezdet LIMIT 1) AS kov_megt,
               (SELECT COALESCE(i.cim, m.hely) FROM crm_megtekintesek m LEFT JOIN ingatlanok i ON i.id = m.ingatlan_id WHERE m.ugyfel_id = u.id AND m.statusz = 'tervezett'
                  AND m.kezdet >= (NOW() AT TIME ZONE 'Europe/Bucharest') - INTERVAL '3 hours' ORDER BY m.kezdet LIMIT 1) AS kov_megt_cim,
               (SELECT i.cim FROM crm_ugyfel_ingatlan k JOIN ingatlanok i ON i.id = k.ingatlan_id WHERE k.ugyfel_id = u.id ORDER BY (k.szerep = 'tulajdonos') DESC, k.created_at DESC LIMIT 1) AS elso_ingatlan,
               (SELECT COUNT(*)::int FROM crm_ugyfel_ingatlan k WHERE k.ugyfel_id = u.id) AS ingatlan_db
        FROM crm_ugyfelek u LEFT JOIN users us ON us.id = u.felelos_id
        WHERE ${felt.join(" AND ")}
        ORDER BY ${rend} LIMIT 500`, p);

    // a térség címkéi (a szűrőhöz)
    const cp = [];
    const c = await db.query(`SELECT DISTINCT jsonb_array_elements_text(u.cimkek) AS c FROM crm_ugyfelek u WHERE ${terSql(ctx, "u", cp)} AND ${lathatoSql(ctx, "u", cp)} ORDER BY 1 LIMIT 60`, cp);

    return { ugyfelek: r.rows, cimkek: c.rows.map(x => x.c), fazisok: Object.fromEntries(szamok.rows.map(x => [x.allapot, x.n])), fokusz: fk.rows[0] };
}

// Van-e már ilyen ügyfél (e-mail vagy telefon alapján) – figyelmeztetéshez
async function hasonlo(ctx, { email, telefon }, kiveve = 0) {
    const p = [];
    const t = terSql(ctx, "u", p);
    const f = [];
    if (email) { p.push(String(email).trim().toLowerCase()); f.push(`LOWER(u.email) = $${p.length}`); }
    const tel = String(telefon || "").replace(/[^0-9]/g, "").slice(-9);
    if (tel.length >= 7) { p.push("%" + tel); f.push(`REGEXP_REPLACE(COALESCE(u.telefon,''), '[^0-9]', '', 'g') LIKE $${p.length}`); }
    if (!f.length) return null;
    p.push(kiveve);
    const r = await db.query(`SELECT u.id, u.nev, u.felelos_id FROM crm_ugyfelek u WHERE ${t} AND (${f.join(" OR ")}) AND u.id <> $${p.length} LIMIT 1`, p);
    return r.rows[0] || null;
}

async function ugyfelMent(ctx, id, b) {
    const nev = sz(b.nev, 160);
    if (!nev) throw hibaKod("name_required");
    const mezo = {
        nev,
        telefon: sz(b.telefon, 40),
        email: sz(b.email, 160),
        szerepek: JSON.stringify(lista(b.szerepek, SZEREPEK)),
        allapot: ALLAPOTOK.includes(b.allapot) ? b.allapot : "uj",
        forras: FORRASOK.includes(b.forras) ? b.forras : (sz(b.forras, 40) || null),
        cimkek: JSON.stringify(cimkeLista(b.cimkek)),
        igeny: JSON.stringify(igenyTisztit(b.igeny)),
        jegyzet: sz(b.jegyzet, 4000),
        telefon2: sz(b.telefon2, 40),
        cim: sz(b.cim, 200),
        kapcsolat_mod: ["telefon", "email", "whatsapp", "sms", "barmely"].includes(b.kapcsolat_mod) ? b.kapcsolat_mod : null,
        hozzajarulas: !!b.hozzajarulas
    };
    if (mezo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mezo.email)) throw hibaKod("bad_email");

    if (!id) {
        const masik = !b.mindenkepp ? await hasonlo(ctx, mezo) : null;
        if (masik) { const e = hibaKod("duplicate", 409); e.extra = { masik }; throw e; }
        const felelos = b.felelos_id !== undefined && b.felelos_id !== "" ? await felelosOk(ctx, b.felelos_id) : ctx.userId;
        const r = await db.query(`
            INSERT INTO crm_ugyfelek (iroda_id, felelos_id, user_id, nev, telefon, email, szerepek, allapot, forras, cimkek, igeny, jegyzet, created_by,
                                      telefon2, cim, kapcsolat_mod, hozzajarulas)
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16, CASE WHEN $17::boolean THEN NOW() END) RETURNING id`,
            [ctx.irodaId, felelos, szam(b.user_id), mezo.nev, mezo.telefon, mezo.email, mezo.szerepek, mezo.allapot, mezo.forras, mezo.cimkek, mezo.igeny, mezo.jegyzet, ctx.userId,
             mezo.telefon2, mezo.cim, mezo.kapcsolat_mod, mezo.hozzajarulas]);
        await naploz(r.rows[0].id, ctx.userId, "rendszer", "letrehozva");
        return ugyfel(ctx, r.rows[0].id);
    }

    const regi = await ugyfelJog(ctx, id);
    let felelos = regi.felelos_id;
    if (b.felelos_id !== undefined && ctx.vezeto) felelos = b.felelos_id === "" || b.felelos_id === null ? null : await felelosOk(ctx, b.felelos_id);
    await db.query(`
        UPDATE crm_ugyfelek SET nev=$2, telefon=$3, email=$4, szerepek=$5::jsonb, allapot=$6, forras=$7, cimkek=$8::jsonb, igeny=$9::jsonb,
               jegyzet=$10, felelos_id=$11, telefon2=$12, cim=$13, kapcsolat_mod=$14,
               hozzajarulas = CASE WHEN $15::boolean THEN COALESCE(hozzajarulas, NOW()) END, updated_at=NOW() WHERE id=$1`,
        [regi.id, mezo.nev, mezo.telefon, mezo.email, mezo.szerepek, mezo.allapot, mezo.forras, mezo.cimkek, mezo.igeny, mezo.jegyzet, felelos,
         mezo.telefon2, mezo.cim, mezo.kapcsolat_mod, mezo.hozzajarulas]);
    if (regi.allapot !== mezo.allapot) await naploz(regi.id, ctx.userId, "rendszer", `allapot:${regi.allapot}>${mezo.allapot}`);
    if (regi.felelos_id !== felelos) await naploz(regi.id, ctx.userId, "rendszer", `felelos:${felelos || ""}`);
    return ugyfel(ctx, regi.id);
}

// Gyors módosítás: állapot vagy felelős
async function ugyfelValt(ctx, id, b) {
    const regi = await ugyfelJog(ctx, id);
    if (b.allapot !== undefined) {
        if (!ALLAPOTOK.includes(b.allapot)) throw hibaKod("bad_status");
        if (b.allapot !== regi.allapot) {
            await db.query("UPDATE crm_ugyfelek SET allapot = $2, updated_at = NOW() WHERE id = $1", [regi.id, b.allapot]);
            await naploz(regi.id, ctx.userId, "rendszer", `allapot:${regi.allapot}>${b.allapot}`);
        }
    }
    if (b.felelos_id !== undefined) {
        if (!ctx.vezeto) throw hibaKod("forbidden", 403);
        const f = b.felelos_id === "" || b.felelos_id === null ? null : await felelosOk(ctx, b.felelos_id);
        if (f !== regi.felelos_id) {
            await db.query("UPDATE crm_ugyfelek SET felelos_id = $2, updated_at = NOW() WHERE id = $1", [regi.id, f]);
            // a nyitott feladatai is átkerülnek
            await db.query("UPDATE crm_feladatok SET felelos_id = $2 WHERE ugyfel_id = $1 AND kesz IS NULL AND (felelos_id IS NULL OR felelos_id = $3)", [regi.id, f, regi.felelos_id]);
            await naploz(regi.id, ctx.userId, "rendszer", `felelos:${f || ""}`);
        }
    }
    return { ok: true };
}

async function ugyfelTorol(ctx, id) {
    if (!ctx.vezeto) throw hibaKod("forbidden", 403);
    const u = await ugyfelJog(ctx, id);
    await db.query("DELETE FROM crm_ugyfelek WHERE id = $1", [u.id]);
    return { torolve: true };
}

async function ugyfel(ctx, id) {
    const u = await ugyfelJog(ctx, id);
    const fel = u.felelos_id ? (await db.query("SELECT COALESCE(nev, felhasznalonev) AS nev FROM users WHERE id = $1", [u.felelos_id])).rows[0] : null;
    const tev = await db.query(`
        SELECT t.*, COALESCE(us.nev, us.felhasznalonev) AS user_nev, i.cim AS ingatlan_cim
        FROM crm_tevekenysegek t LEFT JOIN users us ON us.id = t.user_id LEFT JOIN ingatlanok i ON i.id = t.ingatlan_id
        WHERE t.ugyfel_id = $1 ORDER BY t.created_at DESC, t.id DESC LIMIT 300`, [u.id]);
    const feladatok = await db.query(`
        SELECT f.*, to_char(f.hatarido, 'YYYY-MM-DD"T"HH24:MI') AS hatarido, COALESCE(us.nev, us.felhasznalonev) AS felelos_nev FROM crm_feladatok f LEFT JOIN users us ON us.id = f.felelos_id
        WHERE f.ugyfel_id = $1 ORDER BY (f.kesz IS NOT NULL), f.hatarido NULLS LAST, f.id DESC LIMIT 100`, [u.id]);
    const ingatlanok = await db.query(`
        SELECT k.szerep, k.allapot AS kapcs_allapot, k.created_at AS kapcs_ido, i.id, i.cim, i.ar, i.nm, i.szobak, i.tipus, i.ugylet, i.varos, i.kerulet, i.statusz, i.eladva, i.kulso_kepek, i.iroda_id
        FROM crm_ugyfel_ingatlan k JOIN ingatlanok i ON i.id = k.ingatlan_id
        WHERE k.ugyfel_id = $1 ORDER BY k.created_at DESC`, [u.id]);
    const megt = await db.query(`${MEGT_SELECT} WHERE m.ugyfel_id = $1 ORDER BY m.kezdet DESC LIMIT 100`, [u.id]);
    const iratok = await require("./crmIratok").lista(u.id);
    const ajanlatok = await db.query(`
        SELECT a.id, a.osszeg, a.penznem, a.statusz, a.ellen_osszeg, a.created_at, a.ingatlan_id, a.kulso_link, i.cim AS ingatlan_cim
        FROM ajanlatok a LEFT JOIN ingatlanok i ON i.id = a.ingatlan_id WHERE a.crm_ugyfel_id = $1 ORDER BY a.id DESC LIMIT 50`, [u.id]);
    return {
        ...u,
        iratok,
        ajanlatok: ajanlatok.rows.map(x => ({ ...x, osszeg: Number(x.osszeg), ellen_osszeg: x.ellen_osszeg === null ? null : Number(x.ellen_osszeg) })),
        megtekintesek: megt.rows,
        felelos_nev: fel ? fel.nev : null,
        tevekenysegek: tev.rows,
        feladatok: feladatok.rows,
        ingatlanok: ingatlanok.rows,
        illeszkedo: u.igeny ? await illeszkedo(ctx, u) : []
    };
}

// A keresési igényhez illeszkedő ingatlanok: az iroda saját aktív hirdetései
// (az oldal CRM-jében az összes aktív hirdetés). A már kapcsolt ingatlanok nélkül.
async function illeszkedo(ctx, u) {
    const i = u.igeny || {};
    const p = [u.id];
    const felt = ["i.statusz = 'aktiv'", "COALESCE(i.eladva, false) = false",
        "NOT EXISTS (SELECT 1 FROM crm_ugyfel_ingatlan k WHERE k.ugyfel_id = $1 AND k.ingatlan_id = i.id)"];
    if (ctx.irodaId !== null) { p.push(ctx.irodaId); felt.push(`i.iroda_id = $${p.length}`); }
    if (i.ugylet) { p.push(i.ugylet); felt.push(`i.ugylet = $${p.length}`); }
    if (i.tipus) { p.push(i.tipus); felt.push(`i.tipus = $${p.length}`); }
    if (i.varos) { p.push(i.varos.toLowerCase()); felt.push(`LOWER(i.varos) = $${p.length}`); }
    if (i.kerulet) { p.push(`%${i.kerulet.toLowerCase()}%`); felt.push(`LOWER(COALESCE(i.kerulet,'')) LIKE $${p.length}`); }
    if (i.ar_min) { p.push(i.ar_min); felt.push(`i.ar >= $${p.length}`); }
    if (i.ar_max) { p.push(i.ar_max); felt.push(`i.ar <= $${p.length}`); }
    if (i.szoba_min) { p.push(i.szoba_min); felt.push(`COALESCE(i.szobak, 0) >= $${p.length}`); }
    if (i.nm_min) { p.push(i.nm_min); felt.push(`COALESCE(i.nm, 0) >= $${p.length}`); }
    if (p.length < 2 + (ctx.irodaId !== null ? 1 : 0)) return [];      // üres igény: nincs mit keresni
    felt.push(sajatHirdetesSql(ctx, "i", p));
    const r = await db.query(`
        SELECT i.id, i.cim, i.ar, i.nm, i.szobak, i.tipus, i.ugylet, i.varos, i.kerulet, i.kulso_kepek, i.created_at
        FROM ingatlanok i WHERE ${felt.join(" AND ")} ORDER BY i.created_at DESC LIMIT 12`, p);
    return r.rows;
}

async function tevekenyseg(ctx, id, b) {
    const u = await ugyfelJog(ctx, id);
    const tipus = TEV_TIPUSOK.includes(b.tipus) && b.tipus !== "rendszer" ? b.tipus : "jegyzet";
    const szoveg = sz(b.szoveg, 4000);
    if (!szoveg) throw hibaKod("text_required");
    const ingatlanId = szam(b.ingatlan_id);
    // kapcsolatfelvételnek számít minden, ami nem belső jegyzet
    await naploz(u.id, ctx.userId, tipus, szoveg, ingatlanId, tipus !== "jegyzet");
    // az új ügyfél az első kapcsolattal „kapcsolatban” lesz
    if (tipus !== "jegyzet" && u.allapot === "uj") {
        await db.query("UPDATE crm_ugyfelek SET allapot = 'kapcsolat' WHERE id = $1", [u.id]);
        await naploz(u.id, ctx.userId, "rendszer", "allapot:uj>kapcsolat");
    }
    return { ok: true };
}

async function tevekenysegTorol(ctx, id, tid) {
    const u = await ugyfelJog(ctx, id);
    const p = [Number(tid) || 0, u.id];
    let felt = "id = $1 AND ugyfel_id = $2 AND tipus <> 'rendszer'";
    if (!ctx.vezeto) { p.push(ctx.userId); felt += ` AND user_id = $3`; }
    const r = await db.query(`DELETE FROM crm_tevekenysegek WHERE ${felt}`, p);
    if (!r.rowCount) throw hibaKod("not_found", 404);
    return { torolve: true };
}

// ---------- Kapcsolódó ingatlanok ----------

// Az ügynök (nem vezető) csak a saját hirdetéseit látja: a rá bízottakat és amit ő töltött fel
function sajatHirdetesSql(ctx, alias, p) {
    if (ctx.vezeto || ctx.irodaId === null) return "TRUE";
    p.push(ctx.userId);
    return `(${alias}.owner_id = $${p.length} OR ${alias}.ugynok_id IN (SELECT a.id FROM iroda_ugynokok a WHERE a.user_id = $${p.length}))`;
}

async function ingatlanJog(ctx, ingatlanId) {
    const r = await db.query("SELECT id, iroda_id, cim FROM ingatlanok WHERE id = $1", [Number(ingatlanId) || 0]);
    const i = r.rows[0];
    if (!i) throw hibaKod("listing_not_found", 404);
    // az iroda CRM-jében bármely hirdetés kapcsolható (a vevő más hirdetést is nézhet),
    // de a saját hirdetései a lényeg – ezt a kereső mutatja előre
    return i;
}

async function ingatlanKapcsol(ctx, id, b) {
    const u = await ugyfelJog(ctx, id);
    const i = await ingatlanJog(ctx, b.ingatlan_id);
    const szerep = ["erdeklodik", "tulajdonos", "berlo"].includes(b.szerep) ? b.szerep : "erdeklodik";
    const allapot = KAPCS_ALLAPOT.includes(b.allapot) ? b.allapot : "uj";
    await db.query(`
        INSERT INTO crm_ugyfel_ingatlan (ugyfel_id, ingatlan_id, szerep, allapot) VALUES ($1,$2,$3,$4)
        ON CONFLICT (ugyfel_id, ingatlan_id) DO UPDATE SET szerep = EXCLUDED.szerep, allapot = EXCLUDED.allapot`,
        [u.id, i.id, szerep, allapot]);
    await naploz(u.id, ctx.userId, "rendszer", `ingatlan:${szerep}:${allapot}`, i.id);
    return { ok: true };
}

async function ingatlanLevesz(ctx, id, ingatlanId) {
    const u = await ugyfelJog(ctx, id);
    await db.query("DELETE FROM crm_ugyfel_ingatlan WHERE ugyfel_id = $1 AND ingatlan_id = $2", [u.id, Number(ingatlanId) || 0]);
    return { ok: true };
}

// Hirdetés keresése a kapcsoláshoz: előbb a térség saját hirdetései
async function ingatlanKeres(ctx, q) {
    const p = [];
    const felt = ["i.statusz <> 'torolve'"];
    const t = String(q || "").trim();
    if (/^#?\d+$/.test(t)) { p.push(Number(t.replace("#", ""))); felt.push(`i.id = $${p.length}`); }
    else if (t) { p.push(`%${t.toLowerCase()}%`); felt.push(`(LOWER(COALESCE(i.cim,'')) LIKE $${p.length} OR LOWER(COALESCE(i.kerulet,'')) LIKE $${p.length} OR LOWER(COALESCE(i.iroda_ref,'')) LIKE $${p.length})`); }
    let sajat = "FALSE";
    if (ctx.irodaId !== null) { p.push(ctx.irodaId); sajat = `(i.iroda_id = $${p.length} AND ${sajatHirdetesSql(ctx, "i", p)})`; if (!t) felt.push(sajat); }
    const r = await db.query(`
        SELECT i.id, i.cim, i.ar, i.nm, i.szobak, i.tipus, i.ugylet, i.varos, i.kerulet, i.statusz, (${sajat}) AS sajat
        FROM ingatlanok i WHERE ${felt.join(" AND ")}
        ORDER BY (${sajat}) DESC, (i.statusz = 'aktiv') DESC, i.id DESC LIMIT 20`, p);
    return r.rows;
}

// ===================== FELADATOK =====================

async function feladatLista(ctx, q = {}) {
    const p = [];
    const felt = [terSql(ctx, "f", p)];
    if (!ctx.vezeto) { p.push(ctx.userId); felt.push(`f.felelos_id = $${p.length}`); }
    else if (q.felelos === "en") { p.push(ctx.userId); felt.push(`f.felelos_id = $${p.length}`); }
    else if (szam(q.felelos)) { p.push(Number(q.felelos)); felt.push(`f.felelos_id = $${p.length}`); }
    felt.push(q.kesz ? "f.kesz IS NOT NULL" : "f.kesz IS NULL");
    const r = await db.query(`
        SELECT f.*, to_char(f.hatarido, 'YYYY-MM-DD"T"HH24:MI') AS hatarido, u.nev AS ugyfel_nev, u.telefon AS ugyfel_telefon, COALESCE(us.nev, us.felhasznalonev) AS felelos_nev
        FROM crm_feladatok f LEFT JOIN crm_ugyfelek u ON u.id = f.ugyfel_id LEFT JOIN users us ON us.id = f.felelos_id
        WHERE ${felt.join(" AND ")}
        ORDER BY ${q.kesz ? "f.kesz DESC" : "f.hatarido NULLS LAST, f.fontos DESC, f.id"} LIMIT 300`, p);
    return r.rows;
}

async function feladatJog(ctx, id) {
    const p = [Number(id) || 0];
    let felt = `f.id = $1 AND ${terSql(ctx, "f", p)}`;
    if (!ctx.vezeto) { p.push(ctx.userId); felt += ` AND (f.felelos_id = $${p.length} OR f.created_by = $${p.length})`; }
    const r = await db.query(`SELECT * FROM crm_feladatok f WHERE ${felt}`, p);
    if (!r.rowCount) throw hibaKod("not_found", 404);
    return r.rows[0];
}

async function feladatMent(ctx, id, b) {
    const cim = sz(b.cim, 200);
    if (!cim) throw hibaKod("title_required");
    const hatarido = b.hatarido ? new Date(b.hatarido) : null;
    if (hatarido && isNaN(hatarido)) throw hibaKod("bad_date");
    const hi = hatarido ? String(b.hatarido).slice(0, 16).replace("T", " ") : null;     // helyi idő, ahogy beírta
    let ugyfelId = szam(b.ugyfel_id);
    if (ugyfelId) await ugyfelJog(ctx, ugyfelId);
    const felelos = b.felelos_id ? await felelosOk(ctx, b.felelos_id) : ctx.userId;
    if (!id) {
        const r = await db.query(`
            INSERT INTO crm_feladatok (iroda_id, ugyfel_id, felelos_id, cim, hatarido, fontos, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [ctx.irodaId, ugyfelId, felelos, cim, hi, !!b.fontos, ctx.userId]);
        if (ugyfelId) await naploz(ugyfelId, ctx.userId, "rendszer", `feladat:${cim}`);
        return r.rows[0];
    }
    const f = await feladatJog(ctx, id);
    const r = await db.query(`UPDATE crm_feladatok SET cim=$2, hatarido=$3, fontos=$4, felelos_id=$5, ugyfel_id=$6 WHERE id=$1 RETURNING *`,
        [f.id, cim, hi, !!b.fontos, felelos, ugyfelId]);
    return r.rows[0];
}

async function feladatKesz(ctx, id, kesz = true, jegyzet = null) {
    const f = await feladatJog(ctx, id);
    await db.query("UPDATE crm_feladatok SET kesz = CASE WHEN $2 THEN NOW() END WHERE id = $1", [f.id, !!kesz]);
    if (kesz && f.ugyfel_id) await naploz(f.ugyfel_id, ctx.userId, "rendszer", `kesz:${f.cim}${jegyzet ? " – " + String(jegyzet).slice(0, 500) : ""}`);
    return { ok: true };
}

async function feladatTorol(ctx, id) {
    const f = await feladatJog(ctx, id);
    await db.query("DELETE FROM crm_feladatok WHERE id = $1", [f.id]);
    return { torolve: true };
}

// ===================== BEÉRKEZŐ ÉRDEKLŐDÉSEK =====================
// A térség hirdetéseire jött üzenetek (az irodánál: az iroda hirdetései; az
// oldalnál: az adminnak címzettek), amelyeket még nem dolgoztak fel.
// A tag csak a neki címzetteket látja.

async function beerkezoAlap(ctx) {
    const p = [ctx.ter];
    const felt = ["NOT EXISTS (SELECT 1 FROM crm_feldolgozott d WHERE d.ter = $1 AND d.uzenet_id = m.id)",
        "m.created_at > NOW() - INTERVAL '120 days'"];
    if (ctx.irodaId !== null) {
        p.push(ctx.irodaId);
        felt.push(`i.iroda_id = $${p.length}`);
        // az iroda saját tagjainak üzenetei (válaszok) nem érdeklődések
        felt.push(`m.felado_id NOT IN (SELECT user_id FROM iroda_tagok WHERE iroda_id = $${p.length})`);
        if (!ctx.vezeto) { p.push(ctx.userId); felt.push(`m.cimzett_id = $${p.length}`); }
    } else {
        felt.push("m.cimzett_id IN (SELECT id FROM users WHERE szerep = 'admin')");
        felt.push("m.felado_id NOT IN (SELECT id FROM users WHERE szerep = 'admin')");
    }
    return { p, felt };
}

async function beerkezo(ctx, { csakSzam = false } = {}) {
    const { p, felt } = await beerkezoAlap(ctx);
    const join = ctx.irodaId !== null ? "JOIN ingatlanok i ON i.id = m.ingatlan_id" : "LEFT JOIN ingatlanok i ON i.id = m.ingatlan_id";
    if (csakSzam) {
        const r = await db.query(`SELECT COUNT(DISTINCT m.felado_id)::int AS n FROM uzenetek m ${join} WHERE ${felt.join(" AND ")}`, p).catch(() => ({ rows: [{ n: 0 }] }));
        return r.rows[0].n;
    }
    const r = await db.query(`
        SELECT m.id, m.felado_id, m.cimzett_id, m.ingatlan_id, m.szoveg, m.created_at,
               i.cim AS ingatlan_cim, i.tipus, i.ugylet, i.ar, i.varos,
               COALESCE(f.nev, f.felhasznalonev) AS felado_nev, f.email AS felado_email, f.telefon AS felado_telefon
        FROM uzenetek m ${join} LEFT JOIN users f ON f.id = m.felado_id
        WHERE ${felt.join(" AND ")} ORDER BY m.created_at DESC LIMIT 400`, p);

    // küldőnként csoportosítva; a meglévő ügyfél (fiók vagy e-mail alapján) megjelölve
    const csop = new Map();
    for (const m of r.rows) {
        const k = m.felado_id || "x" + m.id;
        if (!csop.has(k)) csop.set(k, { felado_id: m.felado_id, nev: m.felado_nev, email: m.felado_email, telefon: m.felado_telefon, uzenetek: [], ingatlanok: new Map(), utolso: m.created_at });
        const c = csop.get(k);
        c.uzenetek.push({ id: m.id, szoveg: m.szoveg, created_at: m.created_at, ingatlan_id: m.ingatlan_id, ingatlan_cim: m.ingatlan_cim });
        if (m.ingatlan_id) c.ingatlanok.set(m.ingatlan_id, { id: m.ingatlan_id, cim: m.ingatlan_cim, tipus: m.tipus, ugylet: m.ugylet, ar: m.ar, varos: m.varos });
    }
    const ki = [];
    for (const c of csop.values()) {
        let meglevo = null;
        const mp = [];
        const t = terSql(ctx, "u", mp);
        const f = [];
        if (c.felado_id) { mp.push(c.felado_id); f.push(`u.user_id = $${mp.length}`); }
        if (c.email) { mp.push(c.email.toLowerCase()); f.push(`LOWER(u.email) = $${mp.length}`); }
        if (f.length) {
            const mr = await db.query(`SELECT u.id, u.nev, u.felelos_id FROM crm_ugyfelek u WHERE ${t} AND (${f.join(" OR ")}) LIMIT 1`, mp);
            meglevo = mr.rows[0] || null;
        }
        ki.push({ ...c, ingatlanok: [...c.ingatlanok.values()], meglevo });
    }
    return ki;
}

// Felvétel: új ügyfél (vagy a meglévőhöz), az üzenetek az idővonalra, a hirdetések kapcsolva
async function beerkezoFelvesz(ctx, b) {
    const lista = await beerkezo(ctx);
    const c = lista.find(x => String(x.felado_id) === String(b.felado_id));
    if (!c) throw hibaKod("not_found", 404);

    let ugyfelId = c.meglevo ? c.meglevo.id : null;
    if (ugyfelId) {
        try { await ugyfelJog(ctx, ugyfelId); }
        catch (e) {
            // a tag nem látja (másé): nem kerülhet hozzá – a vezető dönt
            throw hibaKod("belongs_to_other", 409);
        }
    } else {
        const ugylet = c.ingatlanok[0] && c.ingatlanok[0].ugylet;
        const r = await db.query(`
            INSERT INTO crm_ugyfelek (iroda_id, felelos_id, user_id, nev, telefon, email, szerepek, allapot, forras, igeny, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'uj','hirdetes',$8::jsonb,$9) RETURNING id`,
            [ctx.irodaId, b.felelos_id && ctx.vezeto ? await felelosOk(ctx, b.felelos_id) : ctx.userId, c.felado_id,
             c.nev || c.email || "Érdeklődő", c.telefon || null, c.email || null,
             JSON.stringify([ugylet === "kiado" ? "berlo" : "vevo"]),
             JSON.stringify(c.ingatlanok[0] ? igenyTisztit({ ugylet: c.ingatlanok[0].ugylet, tipus: c.ingatlanok[0].tipus, varos: c.ingatlanok[0].varos }) : null),
             ctx.userId]);
        ugyfelId = r.rows[0].id;
        await naploz(ugyfelId, ctx.userId, "rendszer", "letrehozva_uzenetbol");
    }
    // időrendben az idővonalra
    for (const m of [...c.uzenetek].reverse()) {
        await db.query(`INSERT INTO crm_tevekenysegek (ugyfel_id, user_id, tipus, szoveg, ingatlan_id, created_at) VALUES ($1,NULL,'uzenet',$2,$3,$4)`,
            [ugyfelId, m.szoveg, m.ingatlan_id, m.created_at]);
        await db.query("INSERT INTO crm_feldolgozott (ter, uzenet_id, ugyfel_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [ctx.ter, m.id, ugyfelId]);
    }
    for (const i of c.ingatlanok) {
        await db.query(`INSERT INTO crm_ugyfel_ingatlan (ugyfel_id, ingatlan_id, szerep) VALUES ($1,$2,'erdeklodik') ON CONFLICT DO NOTHING`, [ugyfelId, i.id]);
    }
    await db.query("UPDATE crm_ugyfelek SET utolso_kapcsolat = GREATEST(COALESCE(utolso_kapcsolat, 'epoch'), $2), updated_at = NOW() WHERE id = $1", [ugyfelId, c.utolso]);
    // Visszahívás feladat (ha kérte)
    if (b.feladat) {
        await db.query(`INSERT INTO crm_feladatok (iroda_id, ugyfel_id, felelos_id, cim, hatarido, created_by) VALUES ($1,$2,$3,$4, (NOW() AT TIME ZONE 'Europe/Bucharest') + INTERVAL '1 day', $5)`,
            [ctx.irodaId, ugyfelId, ctx.userId, sz(b.feladat, 200), ctx.userId]);
    }
    return { ugyfel_id: ugyfelId, uj: !c.meglevo };
}

async function beerkezoElvet(ctx, b) {
    const lista = await beerkezo(ctx);
    const c = lista.find(x => String(x.felado_id) === String(b.felado_id));
    if (!c) throw hibaKod("not_found", 404);
    for (const m of c.uzenetek) await db.query("INSERT INTO crm_feldolgozott (ter, uzenet_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [ctx.ter, m.id]);
    return { ok: true };
}

// ===================== MEGTEKINTÉSEK =====================
// Ki (ügyfél), melyik ingatlant, mikor, melyik munkatárssal; utána az eredmény
// (megtörtént / elmaradt / lemondva, mennyire érdekli, visszajelzés). A kezdés
// helyi (romániai) idő, ahogy beírták – szövegként adjuk vissza.

const MEGT_STATUSZ = ["tervezett", "megtortent", "elmaradt", "lemondva"];
const ERDEKLODES = ["nagyon", "talan", "nem"];

const MEGT_SELECT = `
    SELECT m.id, m.iroda_id, m.ugyfel_id, m.ingatlan_id, m.felelos_id, m.hossz_perc, m.hely, m.megjegyzes, m.statusz, m.erdeklodes, m.visszajelzes,
           to_char(m.kezdet, 'YYYY-MM-DD"T"HH24:MI') AS kezdet,
           u.nev AS ugyfel_nev, u.telefon AS ugyfel_telefon,
           i.cim AS ingatlan_cim, i.tipus AS ingatlan_tipus, i.ar AS ingatlan_ar, i.kulso_kepek,
           COALESCE(us.nev, us.felhasznalonev) AS felelos_nev
    FROM crm_megtekintesek m
    LEFT JOIN crm_ugyfelek u ON u.id = m.ugyfel_id
    LEFT JOIN ingatlanok i ON i.id = m.ingatlan_id
    LEFT JOIN users us ON us.id = m.felelos_id`;

function idoTisztit(v) {
    const t = String(v || "").trim().replace(" ", "T").slice(0, 16);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) throw hibaKod("bad_date");
    return t.replace("T", " ");
}

async function megtLista(ctx, q = {}) {
    const p = [];
    const felt = [terSql(ctx, "m", p)];
    if (!ctx.vezeto) { p.push(ctx.userId); felt.push(`(m.felelos_id = $${p.length} OR u.felelos_id = $${p.length})`); }
    else if (q.felelos === "en") { p.push(ctx.userId); felt.push(`m.felelos_id = $${p.length}`); }
    else if (szam(q.felelos)) { p.push(Number(q.felelos)); felt.push(`m.felelos_id = $${p.length}`); }
    if (q.tol) { p.push(String(q.tol).slice(0, 10)); felt.push(`m.kezdet >= $${p.length}::date`); }
    if (q.ig) { p.push(String(q.ig).slice(0, 10)); felt.push(`m.kezdet < $${p.length}::date + INTERVAL '1 day'`); }
    if (szam(q.ingatlan)) { p.push(Number(q.ingatlan)); felt.push(`m.ingatlan_id = $${p.length}`); }
    if (MEGT_STATUSZ.includes(q.statusz)) { p.push(q.statusz); felt.push(`m.statusz = $${p.length}`); }
    if (szam(q.id)) { p.push(Number(q.id)); felt.push(`m.id = $${p.length}`); }
    const r = await db.query(`${MEGT_SELECT} WHERE ${felt.join(" AND ")} ORDER BY m.kezdet LIMIT 500`, p);
    return r.rows;
}

async function megtJog(ctx, id) {
    const p = [Number(id) || 0];
    let felt = `m.id = $1 AND ${terSql(ctx, "m", p)}`;
    if (!ctx.vezeto) { p.push(ctx.userId); felt += ` AND (m.felelos_id = $${p.length} OR m.created_by = $${p.length})`; }
    const r = await db.query(`SELECT m.* FROM crm_megtekintesek m WHERE ${felt}`, p);
    if (!r.rowCount) throw hibaKod("not_found", 404);
    return r.rows[0];
}

async function megtMent(ctx, id, b) {
    const ugyfelId = szam(b.ugyfel_id);
    if (!ugyfelId) throw hibaKod("contact_required");
    const u = await ugyfelJog(ctx, ugyfelId);
    const ingatlanId = szam(b.ingatlan_id);
    if (ingatlanId) await ingatlanJog(ctx, ingatlanId);
    const kezdet = idoTisztit(b.kezdet);
    const hossz = Math.min(480, Math.max(10, Number(b.hossz_perc) || 30));
    const felelos = b.felelos_id ? await felelosOk(ctx, b.felelos_id) : (u.felelos_id || ctx.userId);

    // Ütközés: ugyanannak a munkatársnak átfedő megtekintése (figyelmeztetés, nem tiltás)
    const utk = felelos ? await db.query(`
        SELECT m.id, to_char(m.kezdet, 'HH24:MI') AS ido, i.cim FROM crm_megtekintesek m LEFT JOIN ingatlanok i ON i.id = m.ingatlan_id
        WHERE m.felelos_id = $1 AND m.statusz = 'tervezett' AND m.id <> $2
          AND m.kezdet < $3::timestamp + ($4 || ' minutes')::interval AND m.kezdet + (m.hossz_perc || ' minutes')::interval > $3::timestamp
        LIMIT 1`, [felelos, Number(id) || 0, kezdet, String(hossz)]) : { rows: [] };
    if (utk.rows[0] && !b.mindenkepp) { const e = hibaKod("overlap", 409); e.extra = { utkozes: utk.rows[0] }; throw e; }

    let hely = sz(b.hely, 200);
    if (!hely && ingatlanId) {
        const i = (await db.query("SELECT cim FROM ingatlanok WHERE id = $1", [ingatlanId])).rows[0];
        hely = i && i.cim ? String(i.cim).slice(0, 200) : null;
    }

    if (!id) {
        const r = await db.query(`
            INSERT INTO crm_megtekintesek (iroda_id, ugyfel_id, ingatlan_id, felelos_id, kezdet, hossz_perc, hely, megjegyzes, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [ctx.irodaId, u.id, ingatlanId, felelos, kezdet, hossz, hely, sz(b.megjegyzes, 1000), ctx.userId]);
        await naploz(u.id, ctx.userId, "rendszer", `megt_terv:${kezdet}`, ingatlanId);
        if (ingatlanId) {
            await db.query(`INSERT INTO crm_ugyfel_ingatlan (ugyfel_id, ingatlan_id, szerep, allapot) VALUES ($1,$2,'erdeklodik','uj') ON CONFLICT DO NOTHING`, [u.id, ingatlanId]);
        }
        if (["uj", "kapcsolat"].includes(u.allapot)) {
            await db.query("UPDATE crm_ugyfelek SET allapot = 'aktiv' WHERE id = $1", [u.id]);
            await naploz(u.id, ctx.userId, "rendszer", `allapot:${u.allapot}>aktiv`);
        }
        return { id: r.rows[0].id };
    }
    const m = await megtJog(ctx, id);
    await db.query(`UPDATE crm_megtekintesek SET ugyfel_id=$2, ingatlan_id=$3, felelos_id=$4, kezdet=$5, hossz_perc=$6, hely=$7, megjegyzes=$8 WHERE id=$1`,
        [m.id, u.id, ingatlanId, felelos, kezdet, hossz, hely, sz(b.megjegyzes, 1000)]);
    return { id: m.id };
}

// Az eredmény: megtörtént (mennyire érdekli + visszajelzés) / elmaradt / lemondva
async function megtEredmeny(ctx, id, b) {
    const m = await megtJog(ctx, id);
    const statusz = MEGT_STATUSZ.includes(b.statusz) ? b.statusz : "megtortent";
    const erd = statusz === "megtortent" && ERDEKLODES.includes(b.erdeklodes) ? b.erdeklodes : null;
    const vissza = sz(b.visszajelzes, 2000);
    await db.query("UPDATE crm_megtekintesek SET statusz = $2, erdeklodes = $3, visszajelzes = $4 WHERE id = $1", [m.id, statusz, erd, vissza]);
    if (m.ugyfel_id) {
        if (statusz === "megtortent") {
            await naploz(m.ugyfel_id, ctx.userId, "megtekintes", [erd ? `[${erd}]` : "", vissza || ""].filter(Boolean).join(" ") || "–", m.ingatlan_id, true);
            if (m.ingatlan_id) {
                await db.query(`UPDATE crm_ugyfel_ingatlan SET allapot = $3 WHERE ugyfel_id = $1 AND ingatlan_id = $2 AND szerep = 'erdeklodik' AND allapot <> 'ajanlat'`,
                    [m.ugyfel_id, m.ingatlan_id, erd === "nem" ? "elvetve" : "megtekintes"]);
            }
        } else {
            await naploz(m.ugyfel_id, ctx.userId, "rendszer", `megt_${statusz}${vissza ? ":" + vissza : ""}`, m.ingatlan_id);
        }
    }
    return { ok: true };
}

async function megtTorol(ctx, id) {
    const m = await megtJog(ctx, id);
    await db.query("DELETE FROM crm_megtekintesek WHERE id = $1", [m.id]);
    return { torolve: true };
}

// ===================== INGATLANOK (ki az ügyfél melyik ingatlanhoz) =====================
// Az iroda hirdetései az érdeklődőkkel, a tulajdonossal és a megtekintésekkel.
// (Az oldal CRM-jében: a CRM-ben kapcsolt ingatlanok.) Az ügynök csak a saját
// ügyfeleit látja a számokban is.

async function ingatlanLista(ctx, q = {}) {
    const p = [];
    const lp = [];
    // a látható ügyfelek szűrője a belső lekérdezésekhez
    let lathato = "TRUE";
    if (!ctx.vezeto) { p.push(ctx.userId); lathato = `cu.felelos_id = $${p.length}`; }
    const felt = [];
    if (ctx.irodaId !== null) { p.push(ctx.irodaId); felt.push(`i.iroda_id = $${p.length}`); }
    else felt.push(`EXISTS (SELECT 1 FROM crm_ugyfel_ingatlan k JOIN crm_ugyfelek cu ON cu.id = k.ugyfel_id WHERE k.ingatlan_id = i.id AND cu.iroda_id IS NULL)`);
    felt.push(sajatHirdetesSql(ctx, "i", p));
    if (q.statusz === "aktiv") felt.push("i.statusz = 'aktiv' AND COALESCE(i.eladva, false) = false");
    else if (q.statusz === "eladva") felt.push("COALESCE(i.eladva, false) = true");
    else felt.push("i.statusz <> 'torolve'");
    if (q.q) { p.push(`%${String(q.q).toLowerCase()}%`); felt.push(`(LOWER(COALESCE(i.cim,'')) LIKE $${p.length} OR LOWER(COALESCE(i.kerulet,'')) LIKE $${p.length} OR i.id::text = REPLACE($${p.length}, '%', ''))`); }
    if (szam(q.ugynok)) { p.push(Number(q.ugynok)); felt.push(`i.ugynok_id = $${p.length}`); }
    void lp;
    const r = await db.query(`
        SELECT i.id, i.cim, i.ar, i.nm, i.szobak, i.tipus, i.ugylet, i.varos, i.kerulet, i.statusz, i.eladva, i.kulso_kepek, i.ugynok_id,
               ag.nev AS ugynok_nev,
               (SELECT COUNT(*)::int FROM crm_ugyfel_ingatlan k JOIN crm_ugyfelek cu ON cu.id = k.ugyfel_id
                 WHERE k.ingatlan_id = i.id AND k.szerep = 'erdeklodik' AND k.allapot <> 'elvetve' AND ${lathato}) AS erdeklodok,
               (SELECT COUNT(*)::int FROM crm_ugyfel_ingatlan k JOIN crm_ugyfelek cu ON cu.id = k.ugyfel_id
                 WHERE k.ingatlan_id = i.id AND k.allapot = 'ajanlat' AND ${lathato}) AS ajanlatok,
               (SELECT string_agg(cu.nev, ', ') FROM crm_ugyfel_ingatlan k JOIN crm_ugyfelek cu ON cu.id = k.ugyfel_id
                 WHERE k.ingatlan_id = i.id AND k.szerep = 'tulajdonos' AND ${lathato}) AS tulajdonos,
               (SELECT COUNT(*)::int FROM crm_megtekintesek m JOIN crm_ugyfelek cu ON cu.id = m.ugyfel_id
                 WHERE m.ingatlan_id = i.id AND m.statusz = 'megtortent' AND ${lathato}) AS megtekintve,
               (SELECT to_char(MIN(m.kezdet), 'YYYY-MM-DD"T"HH24:MI') FROM crm_megtekintesek m JOIN crm_ugyfelek cu ON cu.id = m.ugyfel_id
                 WHERE m.ingatlan_id = i.id AND m.statusz = 'tervezett' AND m.kezdet >= (NOW() AT TIME ZONE 'Europe/Bucharest') - INTERVAL '3 hours' AND ${lathato}) AS kov_megtekintes
        FROM ingatlanok i LEFT JOIN iroda_ugynokok ag ON ag.id = i.ugynok_id
        WHERE ${felt.join(" AND ")}
        ORDER BY (i.statusz = 'aktiv') DESC, i.updated_at DESC NULLS LAST, i.id DESC LIMIT 400`, p);
    return r.rows;
}

async function ingatlanReszlet(ctx, ingatlanId) {
    const i = (await db.query(`
        SELECT i.id, i.cim, i.ar, i.nm, i.szobak, i.tipus, i.ugylet, i.varos, i.kerulet, i.statusz, i.eladva, i.kulso_kepek, i.iroda_id, i.ugynok_id,
               ag.nev AS ugynok_nev, ag.telefon AS ugynok_telefon
        FROM ingatlanok i LEFT JOIN iroda_ugynokok ag ON ag.id = i.ugynok_id WHERE i.id = $1`, [Number(ingatlanId) || 0])).rows[0];
    if (!i) throw hibaKod("listing_not_found", 404);
    if (ctx.irodaId !== null && i.iroda_id !== ctx.irodaId) throw hibaKod("not_found", 404);
    if (!ctx.vezeto && ctx.irodaId !== null) {
        const sp = [i.id];
        const ok = await db.query(`SELECT 1 FROM ingatlanok x WHERE x.id = $1 AND ${sajatHirdetesSql(ctx, "x", sp)}`, sp);
        if (!ok.rowCount) throw hibaKod("not_found", 404);
    }
    const p = [i.id];
    const t = terSql(ctx, "u", p);
    const l = lathatoSql(ctx, "u", p);
    const ugyfelek = await db.query(`
        SELECT u.id, u.nev, u.telefon, u.email, u.allapot, u.felelos_id, COALESCE(us.nev, us.felhasznalonev) AS felelos_nev,
               k.szerep, k.allapot AS kapcs_allapot, k.created_at AS kapcs_ido,
               (SELECT to_char(MAX(m.kezdet), 'YYYY-MM-DD"T"HH24:MI') FROM crm_megtekintesek m WHERE m.ugyfel_id = u.id AND m.ingatlan_id = $1 AND m.statusz = 'megtortent') AS utolso_megt
        FROM crm_ugyfel_ingatlan k JOIN crm_ugyfelek u ON u.id = k.ugyfel_id LEFT JOIN users us ON us.id = u.felelos_id
        WHERE k.ingatlan_id = $1 AND ${t} AND ${l}
        ORDER BY (k.szerep = 'tulajdonos') DESC, (k.allapot = 'elvetve'), k.created_at DESC`, p);
    const mp = [i.id];
    const mt = terSql(ctx, "m", mp);
    let ml = "TRUE";
    if (!ctx.vezeto) { mp.push(ctx.userId); ml = `(m.felelos_id = $${mp.length} OR u.felelos_id = $${mp.length})`; }
    const megt = await db.query(`${MEGT_SELECT} WHERE m.ingatlan_id = $1 AND ${mt} AND ${ml} ORDER BY m.kezdet DESC LIMIT 100`, mp);
    return { ingatlan: i, ugyfelek: ugyfelek.rows, megtekintesek: megt.rows };
}

// ===================== CSAPAT (a vezetőnek) =====================
// Munkatársanként: ügyfelek állapot szerint, nyitott és késő feladatok,
// e heti megtekintések, nyert ügyek az elmúlt 90 napban.

async function csapat(ctx) {
    if (!ctx.vezeto) throw hibaKod("forbidden", 403);
    const t = await tagok(ctx);
    const p = [];
    const ter = terSql(ctx, "u", p);
    const ugy = await db.query(`
        SELECT u.felelos_id, u.allapot, COUNT(*)::int AS n FROM crm_ugyfelek u WHERE ${ter} GROUP BY 1, 2`, p);
    const fp = [];
    const ft = terSql(ctx, "f", fp);
    const fel = await db.query(`
        SELECT f.felelos_id, COUNT(*)::int AS nyitott,
               COUNT(*) FILTER (WHERE f.hatarido < (NOW() AT TIME ZONE 'Europe/Bucharest'))::int AS kesik
        FROM crm_feladatok f WHERE ${ft} AND f.kesz IS NULL GROUP BY 1`, fp);
    const mp = [];
    const mt = terSql(ctx, "m", mp);
    const megt = await db.query(`
        SELECT m.felelos_id,
               COUNT(*) FILTER (WHERE m.statusz = 'tervezett' AND m.kezdet >= date_trunc('week', NOW() AT TIME ZONE 'Europe/Bucharest') AND m.kezdet < date_trunc('week', NOW() AT TIME ZONE 'Europe/Bucharest') + INTERVAL '7 days')::int AS heti,
               COUNT(*) FILTER (WHERE m.statusz = 'megtortent' AND m.kezdet >= NOW() - INTERVAL '30 days')::int AS megtortent30
        FROM crm_megtekintesek m WHERE ${mt} GROUP BY 1`, mp);
    const np = [];
    const nt = terSql(ctx, "u", np);
    const nyert = await db.query(`
        SELECT u.felelos_id, COUNT(*)::int AS n FROM crm_ugyfelek u
        WHERE ${nt} AND u.allapot = 'nyert' AND u.updated_at >= NOW() - INTERVAL '90 days' GROUP BY 1`, np);

    const sor = id => {
        const a = Object.fromEntries(ALLAPOTOK.map(x => [x, 0]));
        ugy.rows.filter(r => (r.felelos_id || null) === id).forEach(r => { a[r.allapot] = r.n; });
        const f = fel.rows.find(r => (r.felelos_id || null) === id) || {};
        const m = megt.rows.find(r => (r.felelos_id || null) === id) || {};
        const n = nyert.rows.find(r => (r.felelos_id || null) === id) || {};
        return { allapotok: a, nyitott_ugyfel: NYITOTT.reduce((s, k) => s + a[k], 0), feladat: f.nyitott || 0, kesik: f.kesik || 0, heti_megt: m.heti || 0, megtortent30: m.megtortent30 || 0, nyert90: n.n || 0 };
    };
    return {
        tagok: t.map(x => ({ ...x, ...sor(x.id) })),
        nincs: sor(null)
    };
}

// ===================== EXPORT (CSV) =====================
async function csv(ctx) {
    const { ugyfelek } = await ugyfelLista(ctx, {});
    const esc = v => {
        const t = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v);
        return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const fej = ["id", "nev", "telefon", "email", "szerepek", "allapot", "forras", "cimkek", "felelos", "utolso_kapcsolat", "letrehozva"];
    const sorok = ugyfelek.map(u => [u.id, u.nev, u.telefon, u.email, u.szerepek, u.allapot, u.forras, u.cimkek, u.felelos_nev,
        u.utolso_kapcsolat ? new Date(u.utolso_kapcsolat).toISOString().slice(0, 10) : "", new Date(u.created_at).toISOString().slice(0, 10)].map(esc).join(";"));
    return "﻿" + [fej.join(";"), ...sorok].join("\n");
}

module.exports = {
    ALLAPOTOK, NYITOTT, SZEREPEK, FORRASOK, TEV_TIPUSOK, KAPCS_ALLAPOT,
    kontextus, tagok, attekintes, ugyfelJog,
    ugyfelLista, ugyfel, ugyfelMent, ugyfelValt, ugyfelTorol, hasonlo,
    tevekenyseg, tevekenysegTorol, ingatlanKapcsol, ingatlanLevesz, ingatlanKeres,
    feladatLista, feladatMent, feladatKesz, feladatTorol,
    beerkezo, beerkezoFelvesz, beerkezoElvet, csv,
    megtLista, megtMent, megtEredmeny, megtTorol, ingatlanLista, ingatlanReszlet, csapat
};
