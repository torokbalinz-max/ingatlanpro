// ============================================================
//  Megtekintési idősávok – az érdeklődő egy kattintással foglal
//
//  Az ingatlanos (vagy a magán hirdető) megadja, a hét mely napjain, mettől
//  meddig fogad megtekintést (pl. hétfő 16:00–19:00, szombat 10:00–13:00), milyen
//  hosszú egy megtekintés, és mennyivel előre lehet foglalni. A hirdetés oldalán az
//  érdeklődő csak a SZABAD időpontokat látja, és rákattint az egyikre.
//
//  Ami már foglalt, magától kiesik: ha az ingatlanosnak arra az időre BÁRMELYIK
//  ingatlanánál van megtekintése, találkozója vagy más naptárbejegyzése, az az
//  időpont senkinek nem kínálható fel (egy ember egyszerre egy helyen lehet).
//
//  Azonnali visszaigazolás (alapból be): a foglalás rögtön bekerül a naptárba, az
//  érdeklődő ügyfél lesz, mindketten értesítést kapnak. Kikapcsolva a foglalás
//  kérésként érkezik (Beérkező), és az ingatlanos egy kattintással hagyja jóvá.
//
//  Az idők helyi (bukaresti) idők, "YYYY-MM-DDTHH:MM" alakban – ugyanúgy, mint a
//  megtekintés-kéréseknél (services/megtekintes.js).
// ============================================================

const db = require("../db/database");
const mk = require("./megtekintes");

const ALAP = { hossz_perc: 30, szunet_perc: 0, elore_nap: 14, min_ora: 3, azonnali: true, aktiv: true };
const HOSSZAK = [15, 20, 30, 45, 60, 90];

const hibaKod = mk.hibaKod;
const perc = s => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/); return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hhmm = p => `${String(Math.floor(p / 60)).padStart(2, "0")}:${String(p % 60).padStart(2, "0")}`;
const hatar = (v, min, max, alap) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : alap; };

// ---------- Beállítás (a saját idősávok) ----------

async function olvas(userId) {
    const b = (await db.query("SELECT hossz_perc, szunet_perc, elore_nap, min_ora, azonnali, aktiv FROM megtekintes_idobeall WHERE user_id = $1", [userId])).rows[0];
    const s = await db.query("SELECT nap, kezd, veg FROM megtekintes_idosavok WHERE user_id = $1 ORDER BY nap, kezd", [userId]);
    // hirdet-e egyáltalán (saját aktív hirdetés, vagy egy iroda tagja) – különben nincs mit beállítania
    const h = await db.query(`SELECT (EXISTS (SELECT 1 FROM ingatlanok WHERE owner_id = $1 AND statusz = 'aktiv')
                                   OR EXISTS (SELECT 1 FROM iroda_tagok WHERE user_id = $1)) AS h`, [userId]);
    return { beall: { ...ALAP, ...(b || {}) }, savok: s.rows, van: s.rowCount > 0, hirdeto: !!h.rows[0].h };
}

// A teljes heti rend cseréje: { savok: [{ nap: 1..7 (1 = hétfő), kezd: "16:00", veg: "19:00" }], hossz_perc, ... }
async function ment(userId, b) {
    const savok = [];
    for (const x of (Array.isArray(b.savok) ? b.savok : []).slice(0, 60)) {
        const nap = Number(x.nap), k = perc(x.kezd), v = perc(x.veg);
        if (!(nap >= 1 && nap <= 7) || k === null || v === null) continue;
        if (v <= k) throw hibaKod("slot_bad_range");
        savok.push({ nap, k, v });
    }
    // napon belül az átfedő sávok összeolvasztva
    savok.sort((a, c) => a.nap - c.nap || a.k - c.k);
    const tiszta = [];
    for (const s of savok) {
        const u = tiszta[tiszta.length - 1];
        if (u && u.nap === s.nap && s.k <= u.v) u.v = Math.max(u.v, s.v);
        else tiszta.push({ ...s });
    }
    const be = {
        hossz_perc: HOSSZAK.includes(Number(b.hossz_perc)) ? Number(b.hossz_perc) : ALAP.hossz_perc,
        szunet_perc: hatar(b.szunet_perc, 0, 120, ALAP.szunet_perc),
        elore_nap: hatar(b.elore_nap, 1, 60, ALAP.elore_nap),
        min_ora: hatar(b.min_ora, 0, 72, ALAP.min_ora),
        azonnali: b.azonnali !== false,
        aktiv: b.aktiv !== false
    };
    const c = await db.connect();
    try {
        await c.query("BEGIN");
        await c.query(`
            INSERT INTO megtekintes_idobeall (user_id, hossz_perc, szunet_perc, elore_nap, min_ora, azonnali, aktiv, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
            ON CONFLICT (user_id) DO UPDATE SET hossz_perc = EXCLUDED.hossz_perc, szunet_perc = EXCLUDED.szunet_perc, elore_nap = EXCLUDED.elore_nap,
                min_ora = EXCLUDED.min_ora, azonnali = EXCLUDED.azonnali, aktiv = EXCLUDED.aktiv, updated_at = NOW()`,
            [userId, be.hossz_perc, be.szunet_perc, be.elore_nap, be.min_ora, be.azonnali, be.aktiv]);
        await c.query("DELETE FROM megtekintes_idosavok WHERE user_id = $1", [userId]);
        for (const s of tiszta) await c.query("INSERT INTO megtekintes_idosavok (user_id, nap, kezd, veg) VALUES ($1,$2,$3,$4)", [userId, s.nap, hhmm(s.k), hhmm(s.v)]);
        await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => { }); throw e; } finally { c.release(); }
    return olvas(userId);
}

// ---------- Szabad időpontok ----------

// Kihez tartozik a hirdetés megtekintése: az ügynök (ha van fiókja), különben az iroda
// vezetője; magánhirdetésnél a tulajdonos
async function gazda(h) {
    const c = await mk.cimzett(h);
    if (!c) return null;
    if (c.irodaId) return { c, userId: c.felelosId || (await mk.vezetok(c.irodaId))[0] || null };
    return { c, userId: c.cimzettId };
}

// Mikor foglalt (helyi idő, percben a nap elejétől, naponként): a CRM-naptár minden
// tervezett bejegyzése (bármelyik ingatlan, találkozó is) + az elfogadott magán megtekintések
async function foglaltak(userId, tol, ig) {
    const r = await db.query(`
        SELECT to_char(kezdet, 'YYYY-MM-DD') AS d, EXTRACT(HOUR FROM kezdet)::int * 60 + EXTRACT(MINUTE FROM kezdet)::int AS k, COALESCE(hossz_perc, 30) AS h
        FROM crm_megtekintesek WHERE felelos_id = $1 AND COALESCE(statusz, 'tervezett') = 'tervezett' AND kezdet >= $2::date AND kezdet < $3::date + 1
        UNION ALL
        SELECT to_char(valasztott, 'YYYY-MM-DD'), EXTRACT(HOUR FROM valasztott)::int * 60 + EXTRACT(MINUTE FROM valasztott)::int, 30
        FROM megtekintes_keresek WHERE cimzett_id = $1 AND statusz = 'elfogadva' AND valasztott >= $2::date AND valasztott < $3::date + 1`,
        [userId, tol, ig]);
    const m = {};
    r.rows.forEach(x => { (m[x.d] = m[x.d] || []).push([Number(x.k), Number(x.k) + Number(x.h)]); });
    return m;
}

const datumPlusz = (ymd, n) => { const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hetNapja = ymd => { const n = new Date(ymd + "T00:00:00Z").getUTCDay(); return n === 0 ? 7 : n; };

// A felhasználó szabad időpontjai: [{ datum, idok: ["16:00", "16:30", ...] }]
async function szabadIdok(userId) {
    const { beall, savok } = await olvas(userId);
    if (!beall.aktiv || !savok.length) return { napok: [], beall };
    const most = (await db.query(`
        SELECT to_char(NOW() AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM-DD') AS d,
               to_char((NOW() AT TIME ZONE 'Europe/Bucharest') + ($1 || ' hours')::interval, 'YYYY-MM-DD"T"HH24:MI') AS tol`, [String(beall.min_ora)])).rows[0];
    const vege = datumPlusz(most.d, beall.elore_nap);
    const fog = await foglaltak(userId, most.d, vege);
    const lepes = beall.hossz_perc + beall.szunet_perc;
    const napok = [];
    for (let n = 0; n <= beall.elore_nap; n++) {
        const d = datumPlusz(most.d, n);
        const hn = hetNapja(d);
        const idok = [];
        for (const s of savok.filter(x => x.nap === hn)) {
            for (let t = perc(s.kezd); t + beall.hossz_perc <= perc(s.veg); t += lepes) {
                if (`${d}T${hhmm(t)}` < most.tol) continue;
                // ütközik-e bármivel (a szünetet is hagyjuk a foglalt előtt / után)
                const utk = (fog[d] || []).some(([a, b]) => t < b + beall.szunet_perc && a < t + beall.hossz_perc + beall.szunet_perc);
                if (!utk) idok.push(hhmm(t));
            }
        }
        if (idok.length) napok.push({ datum: d, idok });
    }
    return { napok, beall };
}

// A hirdetés oldalához (bárki láthatja – csak időpontok, név nélkül)
async function hirdetesSzabad(ingatlanId) {
    const h = (await db.query("SELECT id, iroda_id, owner_id, ugynok_id, statusz, eladva FROM ingatlanok WHERE id = $1", [Number(ingatlanId) || 0])).rows[0];
    if (!h || h.statusz !== "aktiv" || h.eladva) return { napok: [] };
    const g = await gazda(h);
    if (!g || !g.userId) return { napok: [] };
    const { napok, beall } = await szabadIdok(g.userId);
    return { napok, hossz_perc: beall.hossz_perc, azonnali: beall.azonnali };
}

// ---------- Foglalás (az érdeklődő) ----------

async function foglal(user, b) {
    if (!user) throw hibaKod("login_required", 401);
    const ido = mk.idoTisztit(b.idopont);
    if (!ido) throw hibaKod("time_required");
    const h = (await db.query("SELECT id, iroda_id, owner_id, ugynok_id, statusz, eladva FROM ingatlanok WHERE id = $1", [Number(b.ingatlan_id) || 0])).rows[0];
    if (!h) throw hibaKod("listing_not_found", 404);
    const g = await gazda(h);
    if (!g || !g.userId) throw hibaKod("not_offerable");
    // még szabad-e (közben más is foglalhatott)
    const { napok, beall } = await szabadIdok(g.userId);
    const nap = napok.find(n => n.datum === ido.slice(0, 10));
    if (!nap || !nap.idok.includes(ido.slice(11))) throw hibaKod("slot_taken", 409);

    const { id } = await mk.kerTesz(user, { ...b, idopontok: [ido] });
    if (!beall.azonnali) return { id, statusz: "uj", idopont: ido };

    const k = (await db.query("SELECT * FROM megtekintes_keresek WHERE id = $1", [id])).rows[0];
    await db.query("UPDATE megtekintes_keresek SET valasz = NULL WHERE id = $1", [id]);
    // a naptárban a megtekintés hossza a beállított legyen
    const r = await mk.elfogad(k, ido, g.userId, { felelosId: g.c.irodaId ? g.userId : null });
    if (r && r.crm_megt_id) await db.query("UPDATE crm_megtekintesek SET hossz_perc = $2 WHERE id = $1", [r.crm_megt_id, beall.hossz_perc]);
    return { id, statusz: "elfogadva", idopont: ido };
}

module.exports = { olvas, ment, szabadIdok, hirdetesSzabad, foglal, HOSSZAK, ALAP };
