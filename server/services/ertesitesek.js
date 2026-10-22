// ============================================================
//  Értesítések (Fiókom → Értesítések)
//
//  Mire szólunk:
//   kereses          új hirdetés illik egy mentett kereséshez
//   igeny            új hirdetés illik a vevői igényhez (Keresek)
//   kedvenc_ar       megváltozott egy kedvenc ingatlan ára
//   kedvenc_statusz  egy kedvenc már nem elérhető / újra elérhető
//   uzenet           új üzenet (csak e-mail – az üzenetek a saját lapjukon vannak)
//
//  Hol: az oldalon (a csengő a fejlécben + a lista a fiókban) és/vagy
//  e-mailben – azonnal, naponta egy összesítőben (reggel 8 után), hetente,
//  vagy sehogy. A felhasználó típusonként állítja (users.ertesites_beall);
//  a „minden e-mail ki” kapcsoló a régi users.ertesites_email.
//
//  Az ár- és állapotváltozásokat az adatbázis maga naplózza (trigger a
//  hirdetes_valtozasok táblába – db/schema.js), így minden módosítás látszik:
//  kézi szerkesztés, a forrásoldalról frissítés, tömeges módosítás.
//
//  Futás: 15 percenként a szerveren (és a cron-hívásnál is). A levelekben
//  egy kattintásos leiratkozás van (aláírt link, belépés nélkül).
// ============================================================

const crypto = require("crypto");
const db = require("../db/database");
const mail = require("./mail");
const matching = require("./matching");
const { normLink } = require("./listing");

const TIPUSOK = ["kereses", "igeny", "kedvenc_ar", "kedvenc_statusz", "uzenet"];
const GYAKORISAG = ["azonnal", "napi", "heti", "ki"];

const ALAP = {
    kereses: { oldal: true, email: "napi" },
    igeny: { oldal: true, email: "napi" },
    kedvenc_ar: { oldal: true, email: "azonnal", csak_csokkenes: false },
    kedvenc_statusz: { oldal: true, email: "napi" },
    uzenet: { email: "azonnal" }
};

const NYELVEK = ["hu", "ro", "en"];
const MEGTART_NAP = 90;            // ennyi napig maradnak meg az értesítések

// ---------- beállítások ----------

function beallitasBol(u) {
    const sajat = (u && u.ertesites_beall && typeof u.ertesites_beall === "object") ? u.ertesites_beall : {};
    const ki = {};
    TIPUSOK.forEach(t => {
        const a = ALAP[t], s = sajat[t] || {};
        ki[t] = { ...a };
        if ("oldal" in a) ki[t].oldal = "oldal" in s ? s.oldal !== false : a.oldal;
        ki[t].email = GYAKORISAG.includes(s.email) ? s.email : a.email;
        if (t === "uzenet" && !["azonnal", "ki"].includes(ki[t].email)) ki[t].email = "azonnal";
        if ("csak_csokkenes" in a) ki[t].csak_csokkenes = "csak_csokkenes" in s ? !!s.csak_csokkenes : a.csak_csokkenes;
    });
    return ki;
}

async function beallitas(userId) {
    const r = await db.query("SELECT email, nyelv, ertesites_beall, ertesites_email FROM users WHERE id = $1", [userId]);
    const u = r.rows[0] || {};
    return {
        tipusok: beallitasBol(u),
        email_mind: u.ertesites_email !== false,
        email: u.email || null,
        nyelv: NYELVEK.includes(u.nyelv) ? u.nyelv : "hu"
    };
}

async function beallitasMent(userId, b) {
    const regi = await beallitas(userId);
    const uj = {};
    TIPUSOK.forEach(t => {
        const be = (b && b.tipusok && b.tipusok[t]) || {};
        uj[t] = { ...regi.tipusok[t] };
        if ("oldal" in ALAP[t] && "oldal" in be) uj[t].oldal = !!be.oldal;
        if (GYAKORISAG.includes(be.email)) uj[t].email = (t === "uzenet" && !["azonnal", "ki"].includes(be.email)) ? "azonnal" : be.email;
        if ("csak_csokkenes" in ALAP[t] && "csak_csokkenes" in be) uj[t].csak_csokkenes = !!be.csak_csokkenes;
    });
    const emailMind = b && "email_mind" in b ? !!b.email_mind : regi.email_mind;
    const nyelv = b && NYELVEK.includes(b.nyelv) ? b.nyelv : regi.nyelv;
    await db.query("UPDATE users SET ertesites_beall = $2::jsonb, ertesites_email = $3, nyelv = $4 WHERE id = $1",
        [userId, JSON.stringify(uj), emailMind, nyelv]);
    // a ki nem küldött levelek, amelyek típusa közben kikapcsolt: már nem mennek
    const kiTipus = TIPUSOK.filter(t => !emailMind || uj[t].email === "ki");
    if (kiTipus.length) {
        await db.query("UPDATE ertesitesek SET email_kell = false WHERE user_id = $1 AND emailezve IS NULL AND tipus = ANY($2::text[])", [userId, kiTipus]);
    }
    try { require("./accounts").cacheUrit(); } catch (e) { /* */ }
    return beallitas(userId);
}

async function nyelvMent(userId, nyelv) {
    if (!NYELVEK.includes(nyelv)) return;
    await db.query("UPDATE users SET nyelv = $2 WHERE id = $1 AND nyelv IS DISTINCT FROM $2", [userId, nyelv]);
}

// ---------- az értesítések (oldalon) ----------

async function lista(userId, { limit = 60, elotte = null } = {}) {
    const r = await db.query(`
        SELECT id, tipus, adat, link, olvasva, created_at FROM ertesitesek
        WHERE user_id = $1 AND oldalon ${elotte ? "AND id < $3" : ""}
        ORDER BY id DESC LIMIT $2`, elotte ? [userId, limit, elotte] : [userId, limit]);
    return r.rows;
}

async function olvasatlanDb(userId) {
    const r = await db.query("SELECT COUNT(*)::int AS n FROM ertesitesek WHERE user_id = $1 AND oldalon AND olvasva IS NULL", [userId]);
    return r.rows[0].n;
}

async function olvasva(userId, ids) {
    if (ids === "mind") {
        await db.query("UPDATE ertesitesek SET olvasva = NOW() WHERE user_id = $1 AND olvasva IS NULL", [userId]);
    } else {
        const l = (Array.isArray(ids) ? ids : []).map(Number).filter(Boolean).slice(0, 500);
        if (l.length) await db.query("UPDATE ertesitesek SET olvasva = NOW() WHERE user_id = $1 AND id = ANY($2::int[]) AND olvasva IS NULL", [userId, l]);
    }
    return olvasatlanDb(userId);
}

async function torol(userId, id) {
    if (id === "mind") await db.query("DELETE FROM ertesitesek WHERE user_id = $1", [userId]);
    else await db.query("DELETE FROM ertesitesek WHERE user_id = $1 AND id = $2", [userId, Number(id) || 0]);
    return olvasatlanDb(userId);
}

// Új értesítés – a beállítás szerint az oldalra és/vagy e-mailbe
async function letrehoz(u, tipus, adat, link) {
    const pref = beallitasBol(u)[tipus];
    if (!pref) return false;
    const oldalon = pref.oldal !== false && tipus !== "uzenet";
    const emailKell = !!u.email && u.ertesites_email !== false && pref.email !== "ki";
    if (!oldalon && !emailKell) return false;
    await db.query(
        "INSERT INTO ertesitesek (user_id, tipus, adat, link, oldalon, email_kell) VALUES ($1, $2, $3::jsonb, $4, $5, $6)",
        [u.id, tipus, JSON.stringify(adat || {}), link || null, oldalon, emailKell]);
    return true;
}

// ---------- a hirdetések rövid adatai (a listához és a levélhez) ----------

function minta(i) {
    const kulso = Array.isArray(i.kulso_kepek) ? i.kulso_kepek : [];
    return {
        id: i.id, cim: i.cim || null, varos: i.varos || null, kerulet: i.kerulet || null, tipus: i.tipus || "lakas", ugylet: i.ugylet || "elado",
        ar: i.ar !== null && i.ar !== undefined ? Number(i.ar) : null, nm: i.nm ? Number(i.nm) : null, szobak: i.szobak || null,
        kep: i.kep_id ? "db:" + i.kep_id : (kulso[0] || null)
    };
}

// Mint a keresőben: ugyanaz a link csak egyszer számít
function linkSzerintEgyszer(lista) {
    const latott = new Set();
    return lista.filter(i => {
        const k = normLink(i.link);
        if (!k) return true;
        if (latott.has(k)) return false;
        latott.add(k);
        return true;
    });
}

// ---------- 1) mentett keresések ----------

async function keresesek(most) {
    let db_ = 0;
    const k = await db.query(`
        SELECT k.id, k.nev, k.szurok, k.utolso_ertesites, u.id AS user_id, u.email, u.ertesites_beall, u.ertesites_email
        FROM mentett_keresesek k JOIN users u ON u.id = k.user_id
        WHERE k.ertesites AND NOT COALESCE(u.tiltva, false)`);
    const cache = new Map();
    for (const s of k.rows) {
        const f = s.szurok || {};
        const tipus = f.tipus || "lakas", ugylet = f.ugylet || "elado";
        const utana = s.utolso_ertesites || most;
        const kulcs = `${f.varos}|${tipus}|${ugylet}|${new Date(utana).toISOString()}`;
        if (!cache.has(kulcs)) cache.set(kulcs, await matching.aktivHirdetesek(f.varos, tipus, ugylet, utana));
        let uj = cache.get(kulcs).filter(i => new Date(i.created_at) <= new Date(most) && matching.keresesIllik(i, f));
        if (f.hideDup !== false) uj = linkSzerintEgyszer(uj);
        await db.query("UPDATE mentett_keresesek SET utolso_ertesites = $2 WHERE id = $1", [s.id, most]);
        if (!uj.length) continue;
        const u = { id: s.user_id, email: s.email, ertesites_beall: s.ertesites_beall, ertesites_email: s.ertesites_email };
        if (await letrehoz(u, "kereses", { kereses_id: s.id, nev: s.nev || null, db: uj.length, hirdetesek: uj.slice(0, 6).map(minta) }, "#fiok/keresesek")) db_++;
    }
    return db_;
}

// ---------- 2) vevői igények ----------

async function igenyek(most) {
    let db_ = 0;
    const g = await db.query(`
        SELECT g.*, u.email, u.ertesites_beall, u.ertesites_email
        FROM igenyek g JOIN users u ON u.id = g.user_id
        WHERE g.statusz = 'aktiv' AND (g.lejar IS NULL OR g.lejar > NOW()) AND NOT COALESCE(u.tiltva, false)`);
    const cache = new Map();
    for (const ig of g.rows) {
        const utana = ig.utolso_ertesites || ig.created_at;
        const kulcs = `${ig.varos}|${ig.tipus}|${ig.ugylet}|${new Date(utana).toISOString()}`;
        if (!cache.has(kulcs)) cache.set(kulcs, await matching.aktivHirdetesek(ig.varos, ig.tipus, ig.ugylet, utana));
        const uj = cache.get(kulcs).filter(i => new Date(i.created_at) <= new Date(most) && matching.igenyIllik(i, ig));
        await db.query("UPDATE igenyek SET utolso_ertesites = $2 WHERE id = $1", [ig.id, most]);
        if (!uj.length) continue;
        const u = { id: ig.user_id, email: ig.email, ertesites_beall: ig.ertesites_beall, ertesites_email: ig.ertesites_email };
        if (await letrehoz(u, "igeny", { igeny_id: ig.id, cim: ig.cim || null, db: uj.length, hirdetesek: uj.slice(0, 6).map(minta) }, `#igenyek/${ig.id}`)) db_++;
    }
    return db_;
}

// ---------- 3) a kedvencek ár- és állapotváltozásai ----------

const NEM_ELERHETO = ["nem_elerheto", "archiv", "tiltott"];

async function valtozasok() {
    const autofix = require("./autofix");
    let kurzor = Number(await autofix.beallitas("ertesites_valtozas_kurzor")) || 0;
    if (!kurzor) {
        // első futás: a régi változásokról nem szólunk
        const m = await db.query("SELECT COALESCE(MAX(id), 0) AS n FROM hirdetes_valtozasok");
        await autofix.beallitas("ertesites_valtozas_kurzor", String(Number(m.rows[0].n) || -1));
        return 0;
    }
    if (kurzor < 0) kurzor = 0;

    const r = await db.query(`
        SELECT v.id, v.ingatlan_id, v.mezo, v.regi, v.uj
        FROM hirdetes_valtozasok v WHERE v.id > $1 ORDER BY v.id LIMIT 3000`, [kurzor]);
    if (!r.rows.length) return 0;

    // hirdetésenként: az első régi és az utolsó új érték
    const hird = new Map();
    for (const v of r.rows) {
        const h = hird.get(v.ingatlan_id) || {};
        if (!h[v.mezo]) h[v.mezo] = { regi: v.regi, uj: v.uj };
        else h[v.mezo].uj = v.uj;
        hird.set(v.ingatlan_id, h);
    }
    const ids = [...hird.keys()];

    const ir = await db.query(`
        SELECT i.id, i.cim, i.varos, i.kerulet, i.tipus, i.ugylet, i.ar, i.nm, i.szobak, i.kulso_kepek, i.statusz,
               (SELECT k.id FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id ORDER BY k.sorrend, k.id LIMIT 1) AS kep_id
        FROM ingatlanok i WHERE i.id = ANY($1::int[])`, [ids]);
    const ingatlan = new Map(ir.rows.map(i => [i.id, i]));

    const fr = await db.query(`
        SELECT f.property_id, u.id, u.email, u.ertesites_beall, u.ertesites_email
        FROM favorites f JOIN users u ON u.id = f.user_id
        WHERE f.property_id = ANY($1::int[]) AND NOT COALESCE(u.tiltva, false)`, [ids]);

    let db_ = 0;
    for (const f of fr.rows) {
        const i = ingatlan.get(f.property_id);
        const h = hird.get(f.property_id);
        if (!i || !h) continue;
        const u = { id: f.id, email: f.email, ertesites_beall: f.ertesites_beall, ertesites_email: f.ertesites_email };

        if (h.ar && i.statusz === "aktiv") {
            const regi = Number(h.ar.regi), uj = Number(h.ar.uj);
            // a fél százaléknál kisebb változás (kerekítés, árfolyam) nem számít
            if (regi > 0 && uj > 0 && Math.abs(uj - regi) / regi >= 0.005) {
                const pref = beallitasBol(u).kedvenc_ar;
                if (!(pref.csak_csokkenes && uj > regi)) {
                    if (await letrehoz(u, "kedvenc_ar", { hirdetes: minta(i), regi, uj, szazalek: Math.round((uj - regi) / regi * 1000) / 10 }, `#listing/${i.id}`)) db_++;
                }
            }
        }
        if (h.statusz && h.statusz.regi !== h.statusz.uj) {
            const ment = h.statusz.regi === "aktiv" && NEM_ELERHETO.includes(h.statusz.uj);
            const jott = NEM_ELERHETO.includes(h.statusz.regi) && h.statusz.uj === "aktiv";
            if (ment || jott) {
                if (await letrehoz(u, "kedvenc_statusz", { hirdetes: minta(i), allapot: ment ? "nem_elerheto" : "ujra" }, `#listing/${i.id}`)) db_++;
            }
        }
    }

    await autofix.beallitas("ertesites_valtozas_kurzor", String(r.rows[r.rows.length - 1].id));
    return db_;
}

// ---------- e-mailek ----------

let titokCache = null;
async function titok() {
    if (titokCache) return titokCache;
    const autofix = require("./autofix");
    let t = await autofix.beallitas("ertesites_titok");
    if (!t) { t = crypto.randomBytes(32).toString("hex"); await autofix.beallitas("ertesites_titok", t); }
    titokCache = t;
    return t;
}

async function leiratkozoToken(userId) {
    return crypto.createHmac("sha256", await titok()).update("leiratkozas:" + userId).digest("hex").slice(0, 40);
}

async function leiratkozoEllenoriz(userId, token) {
    const jo = await leiratkozoToken(Number(userId) || 0);
    const t = String(token || "");
    return t.length === jo.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(jo));
}

async function leiratkozik(userId) {
    await db.query("UPDATE users SET ertesites_email = false WHERE id = $1", [userId]);
    await db.query("UPDATE ertesitesek SET email_kell = false WHERE user_id = $1 AND emailezve IS NULL", [userId]);
    try { require("./accounts").cacheUrit(); } catch (e) { /* */ }
}

const SZ = {
    hu: {
        targy1: "IngatlanPro – {cim}", targyN: "IngatlanPro – {n} új értesítés", fej: "Értesítéseid", gomb: "Megnyitás",
        kereses: "{n} új hirdetés: {nev}", keresesNev: "mentett keresés", igeny: "{n} új hirdetés illik az igényedhez", igenyNev: "{nev}",
        arLe: "Csökkent az ára", arFel: "Emelkedett az ára", nemElerheto: "Már nem elérhető", ujra: "Újra elérhető",
        es: "…és még {n}", beall: "Értesítések beállítása", leir: "Leiratkozás minden e-mailről", lablec: "Ezt a levelet az IngatlanPro küldte, mert be van kapcsolva az e-mail értesítés a fiókodban.",
        perHo: "/hó", szoba: "szoba", tipus: { lakas: "Lakás", haz: "Ház", telek: "Telek", kereskedelmi: "Üzlethelyiség", iroda: "Iroda" }
    },
    ro: {
        targy1: "IngatlanPro – {cim}", targyN: "IngatlanPro – {n} notificări noi", fej: "Notificările tale", gomb: "Deschide",
        kereses: "{n} anunțuri noi: {nev}", keresesNev: "căutare salvată", igeny: "{n} anunțuri noi pentru cererea ta", igenyNev: "{nev}",
        arLe: "Prețul a scăzut", arFel: "Prețul a crescut", nemElerheto: "Nu mai este disponibil", ujra: "Din nou disponibil",
        es: "…și încă {n}", beall: "Setări notificări", leir: "Dezabonare de la toate e-mailurile", lablec: "Ai primit acest e-mail de la IngatlanPro deoarece notificările pe e-mail sunt pornite în contul tău.",
        perHo: "/lună", szoba: "camere", tipus: { lakas: "Apartament", haz: "Casă", telek: "Teren", kereskedelmi: "Spațiu comercial", iroda: "Birou" }
    },
    en: {
        targy1: "IngatlanPro – {cim}", targyN: "IngatlanPro – {n} new notifications", fej: "Your notifications", gomb: "Open",
        kereses: "{n} new listings: {nev}", keresesNev: "saved search", igeny: "{n} new listings match your request", igenyNev: "{nev}",
        arLe: "Price dropped", arFel: "Price increased", nemElerheto: "No longer available", ujra: "Available again",
        es: "…and {n} more", beall: "Notification settings", leir: "Unsubscribe from all e-mails", lablec: "You received this e-mail from IngatlanPro because e-mail notifications are on in your account.",
        perHo: "/month", szoba: "rooms", tipus: { lakas: "Apartment", haz: "House", telek: "Plot", kereskedelmi: "Commercial space", iroda: "Office" }
    }
};

const f = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => o[k] ?? "");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = n => (n > 0 ? Math.round(n).toLocaleString("hu-HU").replace(/ /g, " ") + " €" : "–");

function hirdetesCim(h, t) {
    return `${t.tipus[h.tipus] || t.tipus.lakas}${h.cim ? " – " + h.cim : h.kerulet ? " – " + h.kerulet : h.varos ? " – " + h.varos : ""}`;
}

function kepUrl(k, alap) {
    if (!k) return null;
    if (String(k).startsWith("db:")) return `${alap}/api/kepek/${String(k).slice(3)}`;
    return /^https:\/\//i.test(k) ? `${alap}/api/img?u=${encodeURIComponent(k)}` : null;
}

function hirdetesSorHtml(h, t, alap, extra) {
    const kep = kepUrl(h.kep, alap);
    const adatok = [h.nm ? Math.round(h.nm) + " m²" : "", h.szobak ? `${h.szobak} ${t.szoba}` : ""].filter(Boolean).join(" · ");
    return `
    <tr><td style="padding:8px 0;border-top:1px solid #eef1ef">
      <a href="${esc(alap)}/#listing/${h.id}" style="text-decoration:none;color:#1c2321;display:block">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>
          <td style="width:96px;vertical-align:top">${kep ? `<img src="${esc(kep)}" alt="" width="88" height="66" style="width:88px;height:66px;object-fit:cover;border-radius:6px;display:block;border:0">` : `<div style="width:88px;height:66px;background:#eef1ef;border-radius:6px"></div>`}</td>
          <td style="vertical-align:top;font-size:14px;line-height:1.4">
            <b>${esc(hirdetesCim(h, t))}</b><br>
            <span style="color:#1f6f5c;font-weight:bold">${esc(eur(h.ar))}${h.ugylet === "kiado" ? esc(t.perHo) : ""}</span>${adatok ? ` <span style="color:#6b7470">· ${esc(adatok)}</span>` : ""}
            ${extra ? `<br>${extra}` : ""}
          </td>
        </tr></table>
      </a>
    </td></tr>`;
}

// Egy értesítés a levélben: { cim, html, szoveg }
function elemLevelben(e, t, alap) {
    const a = e.adat || {};
    if (e.tipus === "kereses" || e.tipus === "igeny") {
        const cim = e.tipus === "kereses"
            ? f(t.kereses, { n: a.db, nev: a.nev || t.keresesNev })
            : f(t.igeny, { n: a.db }) + (a.cim ? `: ${a.cim}` : "");
        const lista = (a.hirdetesek || []).slice(0, 5);
        return {
            cim,
            html: `<h3 style="font-size:15px;margin:22px 0 4px">${esc(cim)}</h3>
                   <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">${lista.map(h => hirdetesSorHtml(h, t, alap)).join("")}</table>
                   ${a.db > lista.length ? `<p style="margin:6px 0 0;font-size:13px"><a href="${esc(alap)}/${esc(e.link || "#fiok/keresesek")}" style="color:#1f6f5c">${esc(f(t.es, { n: a.db - lista.length }))}</a></p>` : ""}`,
            szoveg: [cim, ...lista.map(h => `• ${hirdetesCim(h, t)} – ${eur(h.ar)}: ${alap}/#listing/${h.id}`)].join("\n")
        };
    }
    if (e.tipus === "kedvenc_ar") {
        const le = a.uj < a.regi;
        const cim = `${le ? t.arLe : t.arFel}: ${hirdetesCim(a.hirdetes || {}, t)}`;
        const extra = `<span style="color:#6b7470;text-decoration:line-through">${esc(eur(a.regi))}</span> → <b style="color:${le ? "#1f7a3d" : "#b4532a"}">${esc(eur(a.uj))}</b> (${a.szazalek > 0 ? "+" : ""}${esc(String(a.szazalek))}%)`;
        return {
            cim,
            html: `<h3 style="font-size:15px;margin:22px 0 4px">${esc(le ? t.arLe : t.arFel)}</h3>
                   <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">${hirdetesSorHtml({ ...(a.hirdetes || {}), ar: a.uj }, t, alap, extra)}</table>`,
            szoveg: `${cim}: ${eur(a.regi)} → ${eur(a.uj)} (${a.szazalek}%) ${alap}/#listing/${(a.hirdetes || {}).id}`
        };
    }
    if (e.tipus === "kedvenc_statusz") {
        const cimke = a.allapot === "ujra" ? t.ujra : t.nemElerheto;
        return {
            cim: `${cimke}: ${hirdetesCim(a.hirdetes || {}, t)}`,
            html: `<h3 style="font-size:15px;margin:22px 0 4px">${esc(cimke)}</h3>
                   <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">${hirdetesSorHtml(a.hirdetes || {}, t, alap)}</table>`,
            szoveg: `${cimke}: ${hirdetesCim(a.hirdetes || {}, t)} ${alap}/#listing/${(a.hirdetes || {}).id}`
        };
    }
    return null;
}

async function levelKeszit(u, elemek, alap) {
    const t = SZ[NYELVEK.includes(u.nyelv) ? u.nyelv : "hu"];
    const reszek = elemek.map(e => elemLevelben(e, t, alap)).filter(Boolean);
    if (!reszek.length) return null;
    const token = await leiratkozoToken(u.id);
    const leirLink = `${alap}/ertesitesek/leiratkozas?u=${u.id}&t=${token}&ny=${NYELVEK.includes(u.nyelv) ? u.nyelv : "hu"}`;
    const beallLink = `${alap}/#fiok/ertesitesek`;
    const targy = reszek.length === 1 ? f(t.targy1, { cim: reszek[0].cim }) : f(t.targyN, { n: reszek.length });
    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1c2321">
  <div style="padding:18px 0 6px;font-size:20px;font-weight:bold;color:#1f6f5c">IngatlanPro</div>
  <h2 style="font-size:18px;margin:0 0 4px">${esc(reszek.length === 1 ? reszek[0].cim : t.fej)}</h2>
  ${reszek.map(r => r.html).join("")}
  <p style="margin:26px 0 0"><a href="${esc(beallLink)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(t.beall)}</a></p>
  <p style="font-size:12px;color:#6b7470;margin-top:24px">${esc(t.lablec)}<br><a href="${esc(leirLink)}" style="color:#6b7470">${esc(t.leir)}</a></p>
</div>`;
    const text = [targy, "", ...reszek.map(r => r.szoveg), "", `${t.beall}: ${beallLink}`, `${t.leir}: ${leirLink}`].join("\n\n");
    return { targy, html, text };
}

// Helyi idő (Bukarest): az összesítők reggel 8 után mennek
function helyiOra() {
    try { return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/Bucharest" }).format(new Date())); }
    catch (e) { return new Date().getUTCHours() + 3; }
}

async function emailek(opts = {}) {
    const eredmeny = { levelek: 0, kihagyva: 0 };
    const r = await db.query(`
        SELECT e.id, e.user_id, e.tipus, e.adat, e.link, e.created_at,
               u.email, u.nyelv, u.ertesites_beall, u.ertesites_email, u.utolso_osszesito, u.utolso_heti
        FROM ertesitesek e JOIN users u ON u.id = e.user_id
        WHERE e.email_kell AND e.emailezve IS NULL AND e.created_at > NOW() - INTERVAL '14 days'
        ORDER BY e.user_id, e.id`);
    if (!r.rows.length) return eredmeny;

    const userek = new Map();
    r.rows.forEach(x => { if (!userek.has(x.user_id)) userek.set(x.user_id, []); userek.get(x.user_id).push(x); });

    const alap = mail.oldalCim(opts.req).replace(/\/+$/, "");
    const reggel = helyiOra() >= 8;

    for (const [userId, elemek] of userek) {
        const u = { ...elemek[0], id: userId };
        const pref = beallitasBol(u);
        const kihagy = elemek.filter(e => !u.email || u.ertesites_email === false || !pref[e.tipus] || pref[e.tipus].email === "ki");
        if (kihagy.length) {
            await db.query("UPDATE ertesitesek SET email_kell = false WHERE id = ANY($1::int[])", [kihagy.map(e => e.id)]);
            eredmeny.kihagyva += kihagy.length;
        }
        const marad = elemek.filter(e => !kihagy.includes(e));
        if (!marad.length || !mail.elerheto()) continue;

        const ora = d => d ? (Date.now() - new Date(d).getTime()) / 3600000 : Infinity;
        const napiEsedekes = reggel && ora(u.utolso_osszesito) >= 20;
        const hetiEsedekes = reggel && ora(u.utolso_heti) >= 24 * 6.5;
        const esedekes = marad.filter(e => {
            const g = pref[e.tipus].email;
            return g === "azonnal" || (g === "napi" && napiEsedekes) || (g === "heti" && hetiEsedekes);
        });
        if (!esedekes.length) continue;

        // ha úgyis megy levél, a többi (napi / heti) is vele mehet, ha már esedékes – különben marad
        const level = await levelKeszit(u, esedekes, alap);
        if (!level) {
            await db.query("UPDATE ertesitesek SET email_kell = false WHERE id = ANY($1::int[])", [esedekes.map(e => e.id)]);
            continue;
        }
        const ok = await mail.kuld({ to: u.email, subject: level.targy, html: level.html, text: level.text });
        if (!ok) continue;
        eredmeny.levelek++;
        await db.query("UPDATE ertesitesek SET emailezve = NOW() WHERE id = ANY($1::int[])", [esedekes.map(e => e.id)]);
        if (esedekes.some(e => pref[e.tipus].email === "napi")) await db.query("UPDATE users SET utolso_osszesito = NOW() WHERE id = $1", [userId]);
        if (esedekes.some(e => pref[e.tipus].email === "heti")) await db.query("UPDATE users SET utolso_heti = NOW() WHERE id = $1", [userId]);
    }
    return eredmeny;
}

// ---------- futtatás ----------

let fut = null;
let utolsoFutas = null;

async function futtat(opts = {}) {
    if (fut) return fut;
    fut = (async () => {
        const e = { keresesek: 0, igenyek: 0, kedvencek: 0, levelek: 0 };
        try {
            const most = (await db.query("SELECT NOW()::timestamp AS t")).rows[0].t;
            e.keresesek = await keresesek(most).catch(err => { console.error("Értesítések (keresések):", err.message); return 0; });
            e.igenyek = await igenyek(most).catch(err => { console.error("Értesítések (igények):", err.message); return 0; });
            e.kedvencek = await valtozasok().catch(err => { console.error("Értesítések (kedvencek):", err.message); return 0; });
            const m = await emailek(opts).catch(err => { console.error("Értesítések (levelek):", err.message); return { levelek: 0 }; });
            e.levelek = m.levelek;
            // takarítás
            await db.query(`DELETE FROM ertesitesek WHERE created_at < NOW() - INTERVAL '${MEGTART_NAP} days'`).catch(() => { });
            await db.query(`DELETE FROM hirdetes_valtozasok WHERE created_at < NOW() - INTERVAL '60 days'`).catch(() => { });
            if (e.keresesek || e.igenyek || e.kedvencek || e.levelek) {
                console.log(`Értesítések: ${e.keresesek} keresés, ${e.igenyek} igény, ${e.kedvencek} kedvenc, ${e.levelek} levél.`);
            }
        } catch (err) {
            console.error("Értesítések hiba:", err.message);
        }
        utolsoFutas = new Date();
        return e;
    })().finally(() => { fut = null; });
    return fut;
}

// 15 percenként (az első futás egy perccel az indulás után)
let idozito = null;
function indit() {
    if (idozito || process.env.ERTESITES_KI === "1") return;
    setTimeout(() => futtat().catch(() => { }), 60 * 1000).unref();
    idozito = setInterval(() => futtat().catch(() => { }), 15 * 60 * 1000);
    idozito.unref();
}

// Az új üzenetről szóló levél kell-e (Fiókom → Értesítések → Üzenetek)
function uzenetEmailKell(u) {
    return !!u && u.ertesites_email !== false && beallitasBol(u).uzenet.email !== "ki";
}

module.exports = {
    TIPUSOK, GYAKORISAG, ALAP, beallitas, beallitasMent, beallitasBol, nyelvMent,
    lista, olvasatlanDb, olvasva, torol, letrehoz,
    futtat, indit, emailek, leiratkozoToken, leiratkozoEllenoriz, leiratkozik, uzenetEmailKell,
    utolsoFutas: () => utolsoFutas,
    _teszt: { keresesek, igenyek, valtozasok, levelKeszit, elemLevelben }
};
