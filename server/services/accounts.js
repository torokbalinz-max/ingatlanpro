// ============================================================
//  Fiókok: jelszó, bejelentkezés (munkamenet), Google, jelszó-visszaállítás
//
//  A böngésző egy "ipsid" sütit kap (véletlen, 32 bájt). Az adatbázisban
//  csak ennek a hash-e van, így egy adatbázis-mentésből nem lehet belépni.
//
//  A régi .env belépések (ADMIN_USER / ADMIN_PASSWORD, APP_USER /
//  APP_PASSWORD) továbbra is működnek: az első belépéskor kapnak egy
//  fiókot (felhasznalonev), a kedvenceik, hirdetéseik ahhoz tartoznak.
// ============================================================

const crypto = require("crypto");
const db = require("../db/database");

const SUTI = "ipsid";
const NAPOK = 60;                         // ennyi napig marad bejelentkezve
const LEJAR_MS = NAPOK * 24 * 3600 * 1000;

// ---------- jelszó ----------

function hashJelszo(jelszo) {
    const so = crypto.randomBytes(16);
    const h = crypto.scryptSync(String(jelszo), so, 64);
    return `scrypt$${so.toString("hex")}$${h.toString("hex")}`;
}

function jelszoJo(jelszo, tarolt) {
    if (!tarolt || !tarolt.startsWith("scrypt$")) return false;
    const [, soHex, hHex] = tarolt.split("$");
    const h = crypto.scryptSync(String(jelszo), Buffer.from(soHex, "hex"), 64);
    const t = Buffer.from(hHex, "hex");
    return t.length === h.length && crypto.timingSafeEqual(h, t);
}

function safeEqual(a, b) {
    const ha = crypto.createHash("sha256").update(String(a)).digest();
    const hb = crypto.createHash("sha256").update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

const tokenHash = t => crypto.createHash("sha256").update(String(t)).digest("hex");

// ---------- .env fiókok (régi belépés) ----------

function envFiokok() {

    const lista = [];

    if (process.env.ADMIN_PASSWORD) {
        lista.push({ user: process.env.ADMIN_USER || "admin", pass: process.env.ADMIN_PASSWORD, szerep: "admin" });
    }

    if (process.env.APP_PASSWORD) {
        lista.push({
            user: process.env.APP_USER || "user",
            pass: process.env.APP_PASSWORD,
            szerep: process.env.ADMIN_PASSWORD ? "user" : "admin"
        });
    }

    return lista;

}

// Helyi fejlesztés: nincs semmilyen jelszó beállítva -> mindenki admin
function fejlesztoiMod() {
    return envFiokok().length === 0 && !process.env.NYILVANOS;
}

// Kik adminok még (e-mail címek vesszővel), pl. a saját Google fiókod
function adminEmailek() {
    return String(process.env.ADMIN_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
}

// A .env fiókhoz tartozó sor (első belépéskor létrejön)
async function envFiokSor(f) {

    const r = await db.query("SELECT * FROM users WHERE LOWER(felhasznalonev) = LOWER($1)", [f.user]);

    let u = r.rows[0];

    if (!u) {
        const ins = await db.query(
            `INSERT INTO users (felhasznalonev, nev, szerep) VALUES ($1, $2, $3) RETURNING *`,
            [f.user, f.user, f.szerep]
        );
        u = ins.rows[0];
    } else if (u.szerep !== f.szerep && f.szerep === "admin") {
        await db.query("UPDATE users SET szerep = 'admin' WHERE id = $1", [u.id]);
        u.szerep = "admin";
    }

    // A régi, közös kedvencek az első admin fiókhoz kerülnek
    if (u.szerep === "admin") {
        await db.query(`
            UPDATE favorites f SET user_id = $1
            WHERE f.user_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM favorites g WHERE g.user_id = $1 AND g.property_id = f.property_id)
        `, [u.id]);
    }

    return u;

}

// ---------- felhasználók ----------

function nyilvanos(u) {
    if (!u) return null;
    return {
        id: u.id,
        nev: u.nev || u.felhasznalonev || (u.email ? u.email.split("@")[0] : "?"),
        email: u.email || null,
        felhasznalonev: u.felhasznalonev || null,
        telefon: u.telefon || null,
        szerep: u.szerep || "user",
        google: !!u.google_id,
        jelszo: !!u.jelszo_hash,
        ertesites_email: u.ertesites_email !== false,
        created_at: u.created_at
    };
}

async function userById(id) {
    const r = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    return r.rows[0] || null;
}

async function userByEmail(email) {
    const r = await db.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [String(email || "").trim()]);
    return r.rows[0] || null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function regisztral({ email, jelszo, nev, telefon }) {

    email = String(email || "").trim().toLowerCase();
    nev = String(nev || "").trim().slice(0, 80);

    if (!EMAIL_RE.test(email)) throw hibaKod("bad_email");
    if (String(jelszo || "").length < 8) throw hibaKod("weak_password");
    if (await userByEmail(email)) throw hibaKod("email_taken");

    const szerep = adminEmailek().includes(email) ? "admin" : "user";

    const r = await db.query(
        `INSERT INTO users (email, nev, telefon, jelszo_hash, szerep) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [email, nev || email.split("@")[0], String(telefon || "").trim().slice(0, 40) || null, hashJelszo(jelszo), szerep]
    );

    return r.rows[0];

}

// Belépés e-mail címmel vagy (a régi .env fiókoknál) felhasználónévvel
async function belep(azonosito, jelszo) {

    azonosito = String(azonosito || "").trim();

    // 1) .env fiók
    for (const f of envFiokok()) {
        if (safeEqual(azonosito.toLowerCase(), f.user.toLowerCase()) && safeEqual(jelszo, f.pass)) {
            return envFiokSor(f);
        }
    }

    // 2) saját fiók
    const r = await db.query(
        "SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(felhasznalonev) = LOWER($1) LIMIT 1",
        [azonosito]
    );

    const u = r.rows[0];

    if (!u || u.tiltva || !jelszoJo(jelszo, u.jelszo_hash)) return null;

    return u;

}

// Google bejelentkezés: a böngésző által kapott ID tokent a Google-nél ellenőrizzük
async function googleBelep(credential) {

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw hibaKod("google_off");

    const res = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential), {
        signal: AbortSignal.timeout(10000)
    });

    const t = await res.json();

    if (!res.ok || t.aud !== clientId || !t.email || String(t.email_verified) !== "true") {
        throw hibaKod("google_invalid");
    }

    const email = t.email.toLowerCase();

    let r = await db.query("SELECT * FROM users WHERE google_id = $1", [t.sub]);
    let u = r.rows[0];

    if (!u) {
        u = await userByEmail(email);
        if (u) {
            await db.query("UPDATE users SET google_id = $1 WHERE id = $2", [t.sub, u.id]);
        } else {
            const ins = await db.query(
                `INSERT INTO users (email, nev, google_id, szerep) VALUES ($1,$2,$3,$4) RETURNING *`,
                [email, t.name || email.split("@")[0], t.sub, adminEmailek().includes(email) ? "admin" : "user"]
            );
            u = ins.rows[0];
        }
    }

    if (u.tiltva) throw hibaKod("banned");

    return u;

}

// ---------- munkamenet ----------

async function munkamenetNyit(res, u, req) {

    const token = crypto.randomBytes(32).toString("base64url");

    await db.query(
        "INSERT INTO munkamenetek (token_hash, user_id, lejar) VALUES ($1, $2, NOW() + INTERVAL '" + NAPOK + " days')",
        [tokenHash(token), u.id]
    );

    await db.query("UPDATE users SET utolso_belepes = NOW() WHERE id = $1", [u.id]);

    // A lejártak törlése időnként
    if (Math.random() < 0.05) db.query("DELETE FROM munkamenetek WHERE lejar < NOW()").catch(() => { });

    res.cookie(SUTI, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: !!(req && req.secure),
        maxAge: LEJAR_MS,
        path: "/"
    });

}

const cache = new Map();          // token_hash -> { user, ido }

async function munkamenetUser(token) {

    if (!token) return null;

    const h = tokenHash(token);
    const c = cache.get(h);

    if (c && Date.now() - c.ido < 30000) return c.user;

    const r = await db.query(`
        SELECT u.* FROM munkamenetek m JOIN users u ON u.id = m.user_id
        WHERE m.token_hash = $1 AND m.lejar > NOW() AND NOT COALESCE(u.tiltva, false)
    `, [h]);

    const user = r.rows[0] || null;

    cache.set(h, { user, ido: Date.now() });
    if (cache.size > 2000) cache.delete(cache.keys().next().value);

    return user;

}

async function munkamenetZar(req, res) {
    const token = sutiOlvas(req)[SUTI];
    if (token) {
        cache.delete(tokenHash(token));
        await db.query("DELETE FROM munkamenetek WHERE token_hash = $1", [tokenHash(token)]);
    }
    res.clearCookie(SUTI, { path: "/" });
}

function cacheUrit() {
    cache.clear();
}

async function mindenMunkamenetZar(userId) {
    await db.query("DELETE FROM munkamenetek WHERE user_id = $1", [userId]);
    cache.clear();
}

function sutiOlvas(req) {
    const k = {};
    String(req.headers.cookie || "").split(";").forEach(p => {
        const i = p.indexOf("=");
        if (i > 0) {
            try { k[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* hibás süti */ }
        }
    });
    return k;
}

// ---------- jelszó-visszaállítás ----------

async function visszaallitoToken(userId) {
    const token = crypto.randomBytes(32).toString("base64url");
    await db.query("DELETE FROM jelszo_tokenek WHERE user_id = $1 OR lejar < NOW()", [userId]);
    await db.query("INSERT INTO jelszo_tokenek (token_hash, user_id, lejar) VALUES ($1, $2, NOW() + INTERVAL '1 hour')", [tokenHash(token), userId]);
    return token;
}

async function jelszoVisszaallit(token, ujJelszo) {

    if (String(ujJelszo || "").length < 8) throw hibaKod("weak_password");

    const r = await db.query(
        "DELETE FROM jelszo_tokenek WHERE token_hash = $1 AND lejar > NOW() RETURNING user_id",
        [tokenHash(token)]
    );

    if (!r.rowCount) throw hibaKod("bad_token");

    const userId = r.rows[0].user_id;

    await db.query("UPDATE users SET jelszo_hash = $1 WHERE id = $2", [hashJelszo(ujJelszo), userId]);
    await mindenMunkamenetZar(userId);

    return userById(userId);

}

// ---------- belépési kísérletek korlátozása (IP-nként) ----------

const probak = new Map();

// korlat(): számol ÉS ellenőriz; tulSok(): csak ellenőriz; jegyez(): csak számol
function probaLista(kulcs, ablakMs) {
    const most = Date.now();
    const lista = (probak.get(kulcs) || []).filter(t => most - t < ablakMs);
    probak.set(kulcs, lista);
    if (probak.size > 5000) probak.delete(probak.keys().next().value);
    return lista;
}

function korlat(kulcs, max = 10, ablakMs = 15 * 60 * 1000) {
    const lista = probaLista(kulcs, ablakMs);
    lista.push(Date.now());
    return lista.length > max;
}

function tulSok(kulcs, max = 10, ablakMs = 15 * 60 * 1000) {
    return probaLista(kulcs, ablakMs).length >= max;
}

function jegyez(kulcs) {
    probaLista(kulcs, 24 * 3600 * 1000).push(Date.now());
}

function hibaKod(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

module.exports = {
    SUTI, hashJelszo, jelszoJo, safeEqual, envFiokok, envFiokSor, fejlesztoiMod, nyilvanos,
    userById, userByEmail, regisztral, belep, googleBelep, munkamenetNyit, munkamenetUser,
    munkamenetZar, mindenMunkamenetZar, cacheUrit, sutiOlvas, visszaallitoToken, jelszoVisszaallit, korlat, tulSok, jegyez, hibaKod
};
