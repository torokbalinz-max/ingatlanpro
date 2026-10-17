// ============================================================
//  Csapat: munkatársak és jogosultságaik
//
//  Egy fiókkal nem lehet mindent irányítani, ezért az admin a saját
//  fiókjukkal belépő munkatársaknak (fotós, bemutató, régiós kezelő,
//  értékesítő, asszisztens) részeket ad ki az admin felületből –
//  Admin → Csapat és jogosultságok. A munkatárs ugyanazt az admin
//  felületet látja, csak a neki kiadott részekkel, és azokon belül
//  ugyanazt tudja, mint az admin.
//
//  Egy munkatársnak több „hozzáférése” lehet, mindegyik:
//     jogok:    az értékesítés részei (hatókörrel szűkíthetők):
//               megbizas     megbízások kezelése – mint az admin (vevők,
//                            ajánlatok, szerződés, díj, iratok, hozzárendelés)
//               megbizas_lat megbízások megtekintése (csak olvasás)
//               megtekintes  megtekintési naptár: idősávok, foglalások, lezárás
//               hirdetes     hirdetések szerkesztése (+ fotók)
//               kepek        fotók feltöltése, törlése, sorrendje
//             városra is szűkíthető (a többi csak „mindenre”):
//               ellenorzes   hirdetések ellenőrzése, állapot, hely-ellenőrzés,
//                            nem elérhetők, bejelentések (városra adva csak
//                            azokban a városokban; a duplikátumok és a tömeges
//                            műveletek csak az egész oldalra)
//             az admin felület többi része (csak „mindenre” hatókörrel):
//               beolvasas    beolvasás linkről, figyelt oldalak, karbantartás
//               helyek       városok, kerületek, város és környéke, hely-ellenőrzés
//               irodak       ingatlanirodák jóváhagyása
//               reklam       reklámfelületek
//               penzugy      pénzügyek (számlák, előfizetések, rendelések...)
//               statisztika  látogatottság
//               beallitasok  állapotok listája, webhely adatai, megbízás-beállítások
//     hatókör:  mind | varos (+ típus, pl. Sepsiszentgyörgy lakásai)
//               | megbizas (egy megbízás és a hirdetése) | ingatlan (egy hirdetés)
//     lejárat:  (nem kötelező) eddig érvényes
//
//  A Csapat és jogosultságok rész mindig csak az adminé (különben egy
//  munkatárs magának is adhatna jogot).
//
//  Ezen felül a megbízáshoz rendelt munkatárs (felelős / fotós / bemutató)
//  magától megkapja az ahhoz a megbízáshoz tartozó jogokat.
// ============================================================

const db = require("../db/database");

// Az értékesítés részei (hatókörrel)
const HATOKOROS = ["megbizas", "megbizas_lat", "megtekintes", "hirdetes", "kepek"];
// Az admin felület többi része (csak az egész oldalra)
const GLOBALIS = ["ellenorzes", "beolvasas", "helyek", "irodak", "reklam", "penzugy", "statisztika", "beallitasok"];
const JOGOK = [...HATOKOROS, ...GLOBALIS];
// Az admin felület részei, amelyek városra is kiadhatók (a szerver a listákat
// és a műveleteket a városokra szűri)
const VAROSI = ["ellenorzes"];
const HATOKOROK = ["mind", "varos", "megbizas", "ingatlan"];
const SZEREPEK = ["ertekesito", "bemutato", "fotos", "regios", "asszisztens", "egyeni"];
const TIPUSOK = ["lakas", "haz", "telek", "kereskedelmi", "iroda"];

// Szerep → javasolt jogok (az adminban egy kattintással)
const SZEREP_JOGOK = {
    fotos: ["kepek"],
    bemutato: ["megtekintes"],
    regios: ["hirdetes", "kepek", "megbizas_lat", "megtekintes"],
    ertekesito: ["megbizas"],
    asszisztens: ["ellenorzes", "beolvasas"],
    egyeni: []
};

// Melyik jog mit foglal magában
const MAGABAN = {
    megbizas: ["megbizas_lat", "megtekintes", "hirdetes", "kepek"],
    hirdetes: ["kepek"],
    // A hirdetések ellenőrzése: bármelyik hirdetést szerkesztheti (mint az admin)
    ellenorzes: ["hirdetes", "kepek"]
};

// A megbízáshoz rendelt munkatárs jogai (arra az egy megbízásra)
const HOZZARENDELT = {
    felelos_id: ["megbizas", "megbizas_lat", "megtekintes", "hirdetes", "kepek"],
    fotos_id: ["kepek", "megbizas_lat"],
    bemutato_id: ["megtekintes"]
};

function hibaKod(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

function ma() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
}

function kiterjeszt(jogok) {
    const s = new Set(jogok);
    jogok.forEach(j => (MAGABAN[j] || []).forEach(x => s.add(x)));
    return s;
}

// ===================== A BEJELENTKEZETT FELHASZNÁLÓ JOGAI =====================

// A kérés munkatárs-adatai (kérésenként egyszer kérdezzük le)
//  -> { admin, tag: {id, szerep, ...} | null, hozzaferesek: [...], megbizasok: [{id, mint: [...]}] }
async function kontextus(req) {

    if (req._csapat) return req._csapat;

    const k = { admin: req.szerep === "admin", tag: null, hozzaferesek: [], hozzarendelt: [] };

    if (!k.admin && req.user) {
        try {
            const t = await db.query("SELECT * FROM csapat_tagok WHERE user_id = $1 AND aktiv", [req.user.id]);
            if (t.rowCount) {
                k.tag = t.rows[0];
                const j = await db.query(
                    "SELECT * FROM csapat_jogok WHERE tag_id = $1 AND (lejar IS NULL OR lejar >= $2::date) ORDER BY id",
                    [k.tag.id, ma()]);
                k.hozzaferesek = j.rows.map(x => ({ ...x, jogok: kiterjeszt(Array.isArray(x.jogok) ? x.jogok : []) }));
            }
            // A megbízáshoz rendelés aktív tagság nélkül nem ad jogot
            if (k.tag) {
                const m = await db.query(
                    `SELECT id, ingatlan_id, felelos_id, fotos_id, bemutato_id FROM megbizasok
                     WHERE (felelos_id = $1 OR fotos_id = $1 OR bemutato_id = $1) AND statusz NOT IN ('lezarva', 'elutasitva')`,
                    [req.user.id]);
                k.hozzarendelt = m.rows.map(r => {
                    const jogok = new Set();
                    Object.entries(HOZZARENDELT).forEach(([oszlop, js]) => { if (r[oszlop] === req.user.id) js.forEach(x => jogok.add(x)); });
                    return { megbizas_id: r.id, ingatlan_id: r.ingatlan_id, jogok };
                });
            }
        } catch (e) {
            // A táblák még nem léteznek (első indulás) – nincs jog
        }
    }

    req._csapat = k;
    return k;

}

// Szabad-e: jog egy objektumon
//   obj: { varos, tipus, ingatlan_id, megbizas_id }
function szabad(k, jog, obj = {}) {

    if (k.admin) return true;
    if (!k.tag) return false;

    for (const h of k.hozzaferesek) {
        if (!h.jogok.has(jog)) continue;
        if (h.hatokor === "mind") return true;
        if (h.hatokor === "varos" && h.varos && obj.varos === h.varos && (!h.tipus || obj.tipus === h.tipus)) return true;
        if (h.hatokor === "megbizas" && h.megbizas_id && obj.megbizas_id === h.megbizas_id) return true;
        if (h.hatokor === "ingatlan" && h.ingatlan_id && obj.ingatlan_id === h.ingatlan_id) return true;
    }

    for (const h of k.hozzarendelt) {
        if (!h.jogok.has(jog)) continue;
        if (obj.megbizas_id && obj.megbizas_id === h.megbizas_id) return true;
        if (obj.ingatlan_id && h.ingatlan_id && obj.ingatlan_id === h.ingatlan_id) return true;
    }

    return false;

}

// Van-e egyáltalán ilyen joga (valamire) – a menühöz, oldalakhoz
function vanJoga(k, jog) {
    if (k.admin) return true;
    if (!k.tag) return false;
    return k.hozzaferesek.some(h => h.jogok.has(jog)) || k.hozzarendelt.some(h => h.jogok.has(jog));
}

// Egy hirdetésen (az ingatlanok sorából)
async function hirdetesJog(req, ingatlanId, jog) {
    const k = await kontextus(req);
    if (k.admin) return true;
    if (!k.tag) return false;
    const r = await db.query("SELECT id, varos, tipus, megbizas_id FROM ingatlanok WHERE id = $1", [Number(ingatlanId) || 0]);
    const i = r.rows[0];
    if (!i) return false;
    return szabad(k, jog, { varos: i.varos, tipus: i.tipus, ingatlan_id: i.id, megbizas_id: i.megbizas_id });
}

// Egy megbízáson
async function megbizasJog(req, megbizasId, jog) {
    const k = await kontextus(req);
    if (k.admin) return true;
    if (!k.tag) return false;
    const r = await db.query("SELECT id, varos, tipus, ingatlan_id FROM megbizasok WHERE id = $1", [Number(megbizasId) || 0]);
    const m = r.rows[0];
    if (!m) return false;
    return szabad(k, jog, { varos: m.varos, tipus: m.tipus, megbizas_id: m.id, ingatlan_id: m.ingatlan_id });
}

// SQL-feltétel: mely sorok tartoznak a jog hatókörébe
//   alias: a tábla neve a lekérdezésben; mezok: melyik oszlop mi
//   -> { sql, params } (a params a kapott tömbhöz fűzve, $-számozás onnan)
function hatokorSql(k, jog, params, { varos = "varos", tipus = "tipus", megbizas = "megbizas_id", ingatlan = "id" } = {}) {

    if (k.admin) return "TRUE";
    if (!k.tag) return "FALSE";

    const ag = [];
    const p = v => { params.push(v); return "$" + params.length; };

    for (const h of k.hozzaferesek) {
        if (!h.jogok.has(jog)) continue;
        if (h.hatokor === "mind") return "TRUE";
        if (h.hatokor === "varos" && h.varos) ag.push(h.tipus ? `(${varos} = ${p(h.varos)} AND ${tipus} = ${p(h.tipus)})` : `${varos} = ${p(h.varos)}`);
        if (h.hatokor === "megbizas" && h.megbizas_id && megbizas) ag.push(`${megbizas} = ${p(h.megbizas_id)}`);
        if (h.hatokor === "ingatlan" && h.ingatlan_id && ingatlan) ag.push(`${ingatlan} = ${p(h.ingatlan_id)}`);
    }

    for (const h of k.hozzarendelt) {
        if (!h.jogok.has(jog)) continue;
        if (megbizas) ag.push(`${megbizas} = ${p(h.megbizas_id)}`);
        if (h.ingatlan_id && ingatlan) ag.push(`${ingatlan} = ${p(h.ingatlan_id)}`);
    }

    return ag.length ? `(${ag.join(" OR ")})` : "FALSE";

}

// Az admin felület egy része az egész oldalra (pl. pénzügyek)
function globalis(k, jog) {
    if (k.admin) return true;
    if (!k.tag) return false;
    return k.hozzaferesek.some(h => h.hatokor === "mind" && h.jogok.has(jog));
}

// Az admin felület részei, amelyeket lát (a menühöz)
function reszek(k) {
    if (k.admin) return [...JOGOK];
    return JOGOK.filter(j => latja(k, j));
}

// Látja-e a részt (a városra adható részeket városi hozzáféréssel is)
function latja(k, j) {
    return (GLOBALIS.includes(j) && !VAROSI.includes(j)) ? globalis(k, j) : vanJoga(k, j);
}

// A városra adható részek SQL-feltétele (ingatlanok sora, alias pl. "i.")
//   -> "TRUE" (admin / egész oldal) vagy a városok feltétele
function reszSql(k, jog, params, alias = "") {
    if (k.admin || globalis(k, jog)) return "TRUE";
    return hatokorSql(k, jog, params, { varos: alias + "varos", tipus: alias + "tipus", megbizas: alias + "megbizas_id", ingatlan: alias + "id" });
}

// Útvonal-védelem: a :id hirdetésre (vagy a body.ids mindegyikére) van-e joga
function csakHirdetesen(jog, { mezo = "id", lista = null } = {}) {
    return async (req, res, next) => {
        try {
            if (req.szerep === "admin") return next();
            if (!req.user) return res.status(401).json({ error: "login_required" });
            const k = await kontextus(req);
            if (globalis(k, jog)) return next();
            let ids = [];
            if (lista && Array.isArray(req.body && req.body[lista])) ids = req.body[lista].map(Number).filter(Boolean);
            const egy = Number(req.params[mezo]);
            if (egy) ids.push(egy);
            if (!ids.length) return res.status(403).json({ error: "admin_only" });
            const params = [ids];
            const hol = reszSql(k, jog, params);
            const r = await db.query(`SELECT COUNT(*)::int AS n FROM ingatlanok WHERE id = ANY($1::int[]) AND ${hol}`, params);
            if (r.rows[0].n === new Set(ids).size) return next();
            res.status(403).json({ error: "not_in_scope" });
        } catch (err) {
            next(err);
        }
    };
}

// Útvonal-védelem: csak az egész oldalra kapott jog (pl. tömeges műveletek)
function csakGlobalis(...kodok) {
    return async (req, res, next) => {
        try {
            if (req.szerep === "admin") return next();
            if (!req.user) return res.status(401).json({ error: "login_required" });
            const k = await kontextus(req);
            if (kodok.some(kod => globalis(k, kod))) return next();
            res.status(403).json({ error: "admin_only" });
        } catch (err) {
            next(err);
        }
    };
}

// Útvonal-védelem: az admin, vagy aki a felsorolt részek valamelyikét
// megkapta az egész oldalra (a hatókörös részeket a hívó ellenőrzi)
function csakResz(...kodok) {
    return async (req, res, next) => {
        try {
            if (req.szerep === "admin") return next();
            if (!req.user) return res.status(401).json({ error: "login_required" });
            const k = await kontextus(req);
            if (kodok.some(kod => latja(k, kod))) return next();
            res.status(403).json({ error: "admin_only" });
        } catch (err) {
            next(err);
        }
    };
}

// Van-e bármilyen admin-része (az admin felület látszik-e neki)
async function panel(req) {
    if (req.szerep === "admin") return true;
    const k = await kontextus(req);
    return reszek(k).length > 0;
}

// Útvonal-védelem: bárki, akinek van része az admin felületből
async function csakPanel(req, res, next) {
    try {
        if (req.szerep === "admin") return next();
        if (!req.user) return res.status(401).json({ error: "login_required" });
        if (await panel(req)) return next();
        res.status(403).json({ error: "admin_only" });
    } catch (err) {
        next(err);
    }
}

// A /api/me-hez: mit tud a munkatárs (a menü, az admin felület részei)
async function osszegzes(req) {
    const k = await kontextus(req);
    if (!k.tag) return null;
    const jogok = {};
    JOGOK.forEach(j => { jogok[j] = latja(k, j); });
    // Az egész oldalra kapott városra adható részek (pl. duplikátumok, tömeges műveletek)
    VAROSI.forEach(j => { jogok[j + "_mind"] = globalis(k, j); });
    return {
        szerep: k.tag.szerep,
        jogok,
        reszek: reszek(k),
        hozzaferesek: k.hozzaferesek.map(h => ({
            id: h.id, jogok: [...h.jogok], hatokor: h.hatokor, varos: h.varos, tipus: h.tipus,
            megbizas_id: h.megbizas_id, ingatlan_id: h.ingatlan_id, lejar: h.lejar
        })),
        hozzarendelt: k.hozzarendelt.map(h => ({ megbizas_id: h.megbizas_id, ingatlan_id: h.ingatlan_id, jogok: [...h.jogok] }))
    };
}

// ===================== ADMIN: A CSAPAT KEZELÉSE =====================

function datum(v) {
    if (!v) return null;
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function pgDatum(v) {
    if (!v) return null;
    if (v instanceof Date) {
        const p = n => String(n).padStart(2, "0");
        return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    return String(v).slice(0, 10);
}

async function lista() {
    const t = await db.query(`
        SELECT t.*, u.email, COALESCE(u.nev, u.felhasznalonev) AS nev, u.telefon, u.utolso_belepes,
               (SELECT COUNT(*) FROM megbizasok m WHERE (m.felelos_id = t.user_id OR m.fotos_id = t.user_id OR m.bemutato_id = t.user_id)
                    AND m.statusz NOT IN ('eladva', 'lezarva', 'elutasitva'))::int AS megbizas_db
        FROM csapat_tagok t JOIN users u ON u.id = t.user_id
        ORDER BY t.aktiv DESC, COALESCE(u.nev, u.felhasznalonev, u.email)`);
    const ids = t.rows.map(x => x.id);
    const j = ids.length ? await db.query(`
        SELECT j.*, m.szerzodes_szam, m.nev AS megbizas_nev, i.cim AS ingatlan_cim, i.varos AS ingatlan_varos
        FROM csapat_jogok j
        LEFT JOIN megbizasok m ON m.id = j.megbizas_id
        LEFT JOIN ingatlanok i ON i.id = j.ingatlan_id
        WHERE j.tag_id = ANY($1::int[]) ORDER BY j.id`, [ids]) : { rows: [] };
    return t.rows.map(x => ({
        ...x,
        hozzaferesek: j.rows.filter(h => h.tag_id === x.id).map(h => ({ ...h, lejar: pgDatum(h.lejar) }))
    }));
}

// Felhasználó keresése (név / e-mail) a hozzáadáshoz
async function felhasznaloKeres(q) {
    const s = String(q || "").trim();
    if (s.length < 2) return [];
    const r = await db.query(`
        SELECT u.id, COALESCE(u.nev, u.felhasznalonev) AS nev, u.email, u.szerep,
               EXISTS (SELECT 1 FROM csapat_tagok t WHERE t.user_id = u.id) AS tag
        FROM users u
        WHERE (u.email ILIKE $1 OR u.nev ILIKE $1 OR u.felhasznalonev ILIKE $1) AND NOT COALESCE(u.tiltva, false)
        ORDER BY u.nev NULLS LAST LIMIT 15`, ["%" + s.replace(/[%_]/g, "") + "%"]);
    return r.rows;
}

async function hozzaad(b, adminId) {
    let userId = Number(b.user_id) || null;
    if (!userId && b.email) {
        const r = await db.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [String(b.email).trim()]);
        userId = r.rows[0] && r.rows[0].id;
    }
    if (!userId) throw hibaKod("user_not_found");
    const u = await db.query("SELECT id, szerep FROM users WHERE id = $1", [userId]);
    if (!u.rowCount) throw hibaKod("user_not_found");
    if (u.rows[0].szerep === "admin") throw hibaKod("already_admin");
    const letezo = await db.query("SELECT id FROM csapat_tagok WHERE user_id = $1", [userId]);
    if (letezo.rowCount) throw hibaKod("already_member");
    const szerep = SZEREPEK.includes(b.szerep) ? b.szerep : "egyeni";
    const r = await db.query(
        "INSERT INTO csapat_tagok (user_id, szerep, megjegyzes, created_by) VALUES ($1,$2,$3,$4) RETURNING id",
        [userId, szerep, String(b.megjegyzes || "").trim().slice(0, 1000) || null, adminId || null]);
    const id = r.rows[0].id;
    // Ha megadták az első hozzáférést (pl. város), azt is
    if (Array.isArray(b.hozzaferesek)) await hozzaferesekMent(id, b.hozzaferesek);
    return { id, user_id: userId };
}

function hozzaferesTisztit(h) {
    const hatokor = HATOKOROK.includes(h.hatokor) ? h.hatokor : "varos";
    // Az admin felület többi része csak az egész oldalra adható (az ellenőrzés városra is)
    const jogok = [...new Set((Array.isArray(h.jogok) ? h.jogok : []).map(String))]
        .filter(j => hatokor === "mind" ? JOGOK.includes(j)
            : (HATOKOROS.includes(j) || (hatokor === "varos" && VAROSI.includes(j))));
    if (!jogok.length) return null;
    const d = {
        jogok, hatokor,
        varos: hatokor === "varos" ? (String(h.varos || "").trim().slice(0, 80) || null) : null,
        tipus: hatokor === "varos" && TIPUSOK.includes(h.tipus) ? h.tipus : null,
        megbizas_id: hatokor === "megbizas" ? (Number(h.megbizas_id) || null) : null,
        ingatlan_id: hatokor === "ingatlan" ? (Number(h.ingatlan_id) || null) : null,
        lejar: datum(h.lejar)
    };
    if (hatokor === "varos" && !d.varos) return null;
    if (hatokor === "megbizas" && !d.megbizas_id) return null;
    if (hatokor === "ingatlan" && !d.ingatlan_id) return null;
    return d;
}

// A hozzáférések cseréje (az admin az egész listát küldi)
async function hozzaferesekMent(tagId, lista) {
    const tiszta = (Array.isArray(lista) ? lista : []).slice(0, 50).map(hozzaferesTisztit).filter(Boolean);
    // A hivatkozott megbízás / hirdetés létezik-e
    for (const h of tiszta) {
        if (h.megbizas_id && !(await db.query("SELECT 1 FROM megbizasok WHERE id = $1", [h.megbizas_id])).rowCount) throw hibaKod("mandate_not_found");
        if (h.ingatlan_id && !(await db.query("SELECT 1 FROM ingatlanok WHERE id = $1", [h.ingatlan_id])).rowCount) throw hibaKod("listing_not_found");
    }
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query("DELETE FROM csapat_jogok WHERE tag_id = $1", [tagId]);
        for (const h of tiszta) {
            await client.query(
                `INSERT INTO csapat_jogok (tag_id, jogok, hatokor, varos, tipus, megbizas_id, ingatlan_id, lejar)
                 VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8)`,
                [tagId, JSON.stringify(h.jogok), h.hatokor, h.varos, h.tipus, h.megbizas_id, h.ingatlan_id, h.lejar]);
        }
        await client.query("COMMIT");
    } catch (e) {
        await client.query("ROLLBACK").catch(() => { });
        throw e;
    } finally {
        client.release();
    }
}

async function ment(id, b) {
    const r = await db.query("SELECT * FROM csapat_tagok WHERE id = $1", [Number(id) || 0]);
    const t = r.rows[0];
    if (!t) throw hibaKod("not_found");
    const szerep = SZEREPEK.includes(b.szerep) ? b.szerep : t.szerep;
    const aktiv = "aktiv" in b ? !!b.aktiv : t.aktiv;
    const megj = "megjegyzes" in b ? (String(b.megjegyzes || "").trim().slice(0, 1000) || null) : t.megjegyzes;
    await db.query("UPDATE csapat_tagok SET szerep = $2, aktiv = $3, megjegyzes = $4, updated_at = NOW() WHERE id = $1", [t.id, szerep, aktiv, megj]);
    if (Array.isArray(b.hozzaferesek)) await hozzaferesekMent(t.id, b.hozzaferesek);
    return t;
}

async function torol(id) {
    const r = await db.query("DELETE FROM csapat_tagok WHERE id = $1 RETURNING user_id", [Number(id) || 0]);
    const uid = r.rows[0] && r.rows[0].user_id;
    // A megbízásokból is kivesszük
    if (uid) {
        for (const o of ["felelos_id", "fotos_id", "bemutato_id"]) {
            await db.query(`UPDATE megbizasok SET ${o} = NULL WHERE ${o} = $1`, [uid]);
        }
    }
}

// A megbízáshoz rendelhető munkatársak (felelős / fotós / bemutató választó)
async function valaszthatok() {
    const r = await db.query(`
        SELECT t.user_id AS id, COALESCE(u.nev, u.felhasznalonev, u.email) AS nev, t.szerep
        FROM csapat_tagok t JOIN users u ON u.id = t.user_id
        WHERE t.aktiv ORDER BY 2`);
    return r.rows;
}

module.exports = {
    JOGOK, HATOKOROS, GLOBALIS, VAROSI, HATOKOROK, SZEREPEK, SZEREP_JOGOK,
    kontextus, szabad, vanJoga, globalis, reszek, reszSql, csakHirdetesen, csakGlobalis, csakResz, csakPanel, panel, hirdetesJog, megbizasJog, hatokorSql, osszegzes,
    lista, felhasznaloKeres, hozzaad, ment, torol, valaszthatok
};
