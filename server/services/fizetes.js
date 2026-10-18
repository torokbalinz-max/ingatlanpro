// ============================================================
//  Online fizetés bankkártyával – Stripe Checkout
//
//  Miért így biztonságos:
//   - a kártyaadatot a Stripe saját, biztonságos oldala kéri be (3-D Secure
//     ellenőrzéssel); hozzánk soha nem jut el kártyaszám
//   - az összeget mindig a szerver veszi a díjbekérőből (a böngésző nem
//     küldhet más összeget), és csak a saját díjbekérőjét fizetheti ki bárki
//   - a fizetés sikerét csak a Stripe aláírt értesítése (webhook) vagy a
//     Stripe-tól közvetlenül lekérdezett állapot igazolja – a visszatérő
//     böngészőnek nem hiszünk
//
//  A menet:
//   1. „Fizetés kártyával” → POST /api/fizetes/szamla/:id → a Stripe oldala
//   2. a vevő fizet → a Stripe visszaküldi az oldalra (#fiok/csomag?fizetes=...)
//   3. a Stripe értesít (webhook: checkout.session.completed) → a díjbekérő
//      kifizetett (kártya) → a rendelés teljesül, a csomag / kiemelés él
//      (penzugy.rendelesSzinkron), és elkészül a hivatalos számla (szamlazo.js)
//
//  Beállítás (a szerver környezeti változói – a Renderen: Environment):
//    STRIPE_SECRET_KEY       sk_test_... (próba) vagy sk_live_... (éles)
//    STRIPE_WEBHOOK_SECRET   whsec_... (a Stripe-ban a webhook végpontnál)
//    A webhook címe:  https://<oldal>/api/fizetes/stripe/webhook
//    események:       checkout.session.completed,
//                     checkout.session.async_payment_succeeded,
//                     checkout.session.expired
//  Próbához Stripe nélkül (csak a saját gépen!): FIZETES_DEMO=1
// ============================================================

const crypto = require("crypto");
const db = require("../db/database");
const pu = require("./penzugy");

// (a STRIPE_API_BASE csak a helyi tesztekhez: egy ál-Stripe szerverre mutat)
const STRIPE = (process.env.STRIPE_API_BASE || "https://api.stripe.com").replace(/\/+$/, "") + "/v1";

function hibaKod(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

// ---------- A kulcsok ----------
// Két helyről jöhetnek: a szerver környezeti változóiból (STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET – ez az erősebb), vagy az adminban megadva
// (Admin → Pénzügy → Online fizetés). Az admin által megadott kulcsok külön
// beállításban vannak (stripe_kulcsok), a böngészőbe soha nem kerülnek vissza.

const KULCS_BEALLITAS = "stripe_kulcsok";
let tarolt = { sk: "", wh: "", wh_id: "" };
let toltve = 0;

async function kulcsokTolt(friss) {
    if (!friss && Date.now() - toltve < 30 * 1000) return;
    try {
        const r = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = $1", [KULCS_BEALLITAS]);
        tarolt = { sk: "", wh: "", wh_id: "", ...(r.rows[0] && r.rows[0].ertek ? JSON.parse(r.rows[0].ertek) : {}) };
    } catch (e) { /* első indulás */ }
    toltve = Date.now();
}

async function kulcsokMent(uj) {
    await kulcsokTolt(true);
    tarolt = { ...tarolt, ...uj };
    await db.query(
        `INSERT INTO beallitasok (kulcs, ertek, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (kulcs) DO UPDATE SET ertek = EXCLUDED.ertek, updated_at = NOW()`,
        [KULCS_BEALLITAS, JSON.stringify(tarolt)]);
    toltve = Date.now();
}

const envKulcs = () => (process.env.STRIPE_SECRET_KEY || "").trim();
const stripeKulcs = () => envKulcs() || (tarolt.sk || "").trim();
const webhookKulcs = () => (process.env.STRIPE_WEBHOOK_SECRET || "").trim() || (tarolt.wh || "").trim();
const KULCS_MINTA = /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/;

// A Stripe be van állítva? / demó mód (csak ha nincs Stripe)
function stripeBe() { return KULCS_MINTA.test(stripeKulcs()); }
function demoBe() { return !stripeBe() && process.env.FIZETES_DEMO === "1"; }

async function allapot() {
    await kulcsokTolt();
    const be = await pu.beallitas();
    const szolgaltato = stripeBe() ? "stripe" : demoBe() ? "demo" : null;
    const k = stripeKulcs();
    return {
        elerheto: !!szolgaltato && be.online_fizetes !== false,
        bekapcsolva: be.online_fizetes !== false,
        szolgaltato,
        mod: stripeBe() ? (/_live_/.test(k) ? "eles" : "teszt") : demoBe() ? "demo" : null,
        webhook: !!webhookKulcs(),
        // honnan jön a kulcs, és a vége (a kulcs maga soha nem megy ki)
        kulcs_forras: envKulcs() ? "szerver" : tarolt.sk ? "admin" : null,
        kulcs_vege: k ? k.slice(-4) : null,
        webhook_forras: (process.env.STRIPE_WEBHOOK_SECRET || "").trim() ? "szerver" : tarolt.wh ? "admin" : null
    };
}

// ---------- Stripe API (űrlap-kódolású kérések) ----------

function urlap(obj, elotag = "", ki = []) {
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined || v === null) continue;
        const kulcs = elotag ? `${elotag}[${k}]` : k;
        if (typeof v === "object" && !Array.isArray(v)) urlap(v, kulcs, ki);
        else if (Array.isArray(v)) v.forEach((x, i) => (typeof x === "object" ? urlap(x, `${kulcs}[${i}]`, ki) : ki.push([`${kulcs}[${i}]`, String(x)])));
        else ki.push([kulcs, String(v)]);
    }
    return ki;
}

async function stripe(modszer, ut, adat, idempotencia, kulcs) {
    const fej = { Authorization: "Bearer " + (kulcs || stripeKulcs()) };
    let body;
    if (adat) {
        fej["Content-Type"] = "application/x-www-form-urlencoded";
        body = new URLSearchParams(urlap(adat)).toString();
    }
    if (idempotencia) fej["Idempotency-Key"] = idempotencia;
    const res = await fetch(STRIPE + ut, { method: modszer, headers: fej, body, signal: AbortSignal.timeout(20000) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
        const e = hibaKod("payment_provider_error");
        e.reszlet = (j.error && j.error.message) || ("HTTP " + res.status);
        throw e;
    }
    return j;
}

// A díjbekérő tételeiből a Stripe-on látszó megnevezés
function megnevezes(s) {
    const t = (s.tetelek || []).map(x => x.megnevezes).join(", ");
    return `${s.sorszam} – ${t}`.slice(0, 250);
}

const centbe = v => Math.round(Number(v) * 100);

// ===================== INDÍTÁS =====================

// A felhasználó a saját, kiállított díjbekérőjét fizeti → { url }
// Belépés nélkül (pl. a reklám fizetési linkje): o.szamla – a már ellenőrzött
// díjbekérő – és o.visszaUt – ahova a fizetés után visszatér
async function inditas(user, szamlaId, { alapCim, nyelv, szamla, visszaUt } = {}) {

    const all = await allapot();
    if (!all.elerheto) throw hibaKod("payment_off");

    const s = szamla || (user ? await require("./rendeles").sajatSzamla(user, szamlaId) : null);
    if (!s) throw hibaKod("not_found");
    if (s.statusz === "fizetve") throw hibaKod("already_paid");
    if (s.statusz !== "kiallitva" || s.tipus !== "dijbekero") throw hibaKod("not_payable");
    if (!(Number(s.brutto) > 0)) throw hibaKod("not_payable");

    // Visszaélés ellen: óránként legfeljebb 20 indítás felhasználónként
    const n = user
        ? await db.query("SELECT COUNT(*)::int AS n FROM online_fizetesek WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'", [user.id])
        : await db.query("SELECT COUNT(*)::int AS n FROM online_fizetesek WHERE szamla_id = $1 AND created_at > NOW() - INTERVAL '1 hour'", [s.id]);
    if (n.rows[0].n >= 20) throw hibaKod("too_many");

    const f = await db.query(
        `INSERT INTO online_fizetesek (szamla_id, user_id, szolgaltato, osszeg, penznem) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [s.id, user ? user.id : null, all.szolgaltato, s.brutto, s.penznem]);
    const fid = f.rows[0].id;

    const vissza = (alapCim || "").replace(/\/+$/, "");

    if (all.szolgaltato === "demo") {
        const munkamenet = "demo_" + crypto.randomBytes(12).toString("hex");
        await db.query("UPDATE online_fizetesek SET munkamenet = $2 WHERE id = $1", [fid, munkamenet]);
        return { url: `${vissza}/api/fizetes/demo/${munkamenet}`, munkamenet };
    }

    const nyelvek = { hu: "hu", ro: "ro", en: "en" };
    const ses = await stripe("POST", "/checkout/sessions", {
        mode: "payment",
        success_url: visszaUt ? `${vissza}${visszaUt}?fizetes={CHECKOUT_SESSION_ID}` : `${vissza}/?fizetes={CHECKOUT_SESSION_ID}#fiok/csomag`,
        cancel_url: visszaUt ? `${vissza}${visszaUt}?fizetes=megszakitva` : `${vissza}/?fizetes=megszakitva#fiok/csomag`,
        client_reference_id: String(s.id),
        customer_email: (s.vevo && s.vevo.email) || (user && user.email) || undefined,
        locale: nyelvek[nyelv] || "auto",
        line_items: [{
            quantity: 1,
            price_data: {
                currency: String(s.penznem || "RON").toLowerCase(),
                unit_amount: centbe(s.brutto),
                product_data: { name: megnevezes(s) }
            }
        }],
        metadata: { szamla_id: String(s.id), fizetes_id: String(fid), sorszam: s.sorszam },
        payment_intent_data: { metadata: { szamla_id: String(s.id), sorszam: s.sorszam }, description: megnevezes(s) }
    }, `ip-szamla-${s.id}-${fid}`);

    await db.query("UPDATE online_fizetesek SET munkamenet = $2, updated_at = NOW() WHERE id = $1", [fid, ses.id]);
    return { url: ses.url, munkamenet: ses.id };

}

// ===================== FELDOLGOZÁS (webhook / visszatérés) =====================

// Egy kifizetett munkamenet: a díjbekérő kifizetett lesz (csak ha az összeg
// és a pénznem egyezik). Többször is hívható – csak egyszer hat.
async function kifizetve({ munkamenet, szamlaId, osszegCent, penznem, fizetesAzon }) {

    const r = await db.query("SELECT * FROM online_fizetesek WHERE munkamenet = $1", [munkamenet]);
    const f = r.rows[0];
    const sid = Number(szamlaId) || (f && f.szamla_id);
    const s = sid ? await pu.szamla(sid) : null;
    if (!s) return { ok: false, ok_szoveg: "nincs díjbekérő" };

    if (centbe(s.brutto) !== Number(osszegCent) || String(s.penznem).toLowerCase() !== String(penznem).toLowerCase()) {
        await db.query("UPDATE online_fizetesek SET statusz = 'elteres', hiba = $2, updated_at = NOW() WHERE munkamenet = $1",
            [munkamenet, `Összeg-eltérés: ${osszegCent} ${penznem} ≠ ${s.brutto} ${s.penznem}`]);
        console.error("Online fizetés: összeg-eltérés", munkamenet, osszegCent, penznem, s.brutto, s.penznem);
        return { ok: false };
    }

    const elso = await db.query(
        `UPDATE online_fizetesek SET statusz = 'fizetve', fizetes_azon = COALESCE($2, fizetes_azon), fizetve_at = COALESCE(fizetve_at, NOW()), updated_at = NOW()
         WHERE munkamenet = $1 AND statusz <> 'fizetve' RETURNING id`, [munkamenet, fizetesAzon || null]);

    if (s.statusz !== "fizetve") {
        await pu.szamlaAllapotValt(s.id, { statusz: "fizetve", fizetesi_mod: "kartya" });
        await db.query(
            `UPDATE penzugy_szamlak SET megjegyzes = TRIM(COALESCE(megjegyzes, '') || E'\\n' || $2), updated_at = NOW() WHERE id = $1`,
            [s.id, `Online kártyás fizetés${fizetesAzon ? " (" + fizetesAzon + ")" : ""}.`]);
    }

    // A számla magától elkészül (services/szamlazo.js – a „kifizetett” jelzésre)
    return { ok: true, szamla_id: s.id };

}

async function munkamenetFeldolgoz(ses) {
    if (!ses || !ses.id) return;
    if (ses.payment_status === "paid") {
        return kifizetve({
            munkamenet: ses.id,
            szamlaId: ses.metadata && ses.metadata.szamla_id,
            osszegCent: ses.amount_total,
            penznem: ses.currency,
            fizetesAzon: typeof ses.payment_intent === "string" ? ses.payment_intent : (ses.payment_intent && ses.payment_intent.id)
        });
    }
    if (ses.status === "expired") {
        await db.query("UPDATE online_fizetesek SET statusz = 'lejart', updated_at = NOW() WHERE munkamenet = $1 AND statusz = 'indult'", [ses.id]);
    }
}

// ---------- Webhook: a Stripe aláírásának ellenőrzése ----------

function alairasOk(nyers, fejlec, titok, turesMp = 300) {
    if (!fejlec || !titok) return false;
    const v1 = [];
    let t = null;
    String(fejlec).split(",").forEach(x => {
        const [k, v] = x.split("=");
        if (k === "t") t = v;
        else if (k === "v1") v1.push(v);
    });
    if (!t || !v1.length) return false;
    if (Math.abs(Date.now() / 1000 - Number(t)) > turesMp) return false;
    const vart = crypto.createHmac("sha256", titok).update(`${t}.${nyers}`, "utf8").digest("hex");
    const vb = Buffer.from(vart, "hex");
    return v1.some(s => {
        const b = Buffer.from(String(s), "hex");
        return b.length === vb.length && crypto.timingSafeEqual(b, vb);
    });
}

async function webhook(nyers, fejlec) {
    await kulcsokTolt();
    if (!alairasOk(nyers, fejlec, webhookKulcs())) throw hibaKod("bad_signature");
    const e = JSON.parse(nyers);
    const obj = e.data && e.data.object;
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired"].includes(e.type)) {
        await munkamenetFeldolgoz(obj);
    } else if (e.type === "checkout.session.async_payment_failed" && obj) {
        await db.query("UPDATE online_fizetesek SET statusz = 'sikertelen', updated_at = NOW() WHERE munkamenet = $1 AND statusz = 'indult'", [obj.id]);
    }
    return { ok: true };
}

// ---------- Visszatérés: a böngésző megkérdezi, mi lett ----------
// (ha a webhook még nem jött meg, a Stripe-tól kérdezzük le – az a biztos)

// user helyett { szamlaId }: belépés nélküli fizetés ellenőrzése (csak ahhoz a díjbekérőhöz)
async function ellenoriz(user, munkamenet) {
    await kulcsokTolt();
    const r = user && user.szamlaId
        ? await db.query("SELECT * FROM online_fizetesek WHERE munkamenet = $1 AND szamla_id = $2", [String(munkamenet || ""), user.szamlaId])
        : await db.query("SELECT * FROM online_fizetesek WHERE munkamenet = $1 AND user_id = $2", [String(munkamenet || ""), user.id]);
    const f = r.rows[0];
    if (!f) throw hibaKod("not_found");
    if (f.statusz !== "fizetve" && f.szolgaltato === "stripe" && stripeBe()) {
        try {
            const ses = await stripe("GET", "/checkout/sessions/" + encodeURIComponent(f.munkamenet));
            await munkamenetFeldolgoz(ses);
        } catch (e) { console.error("Fizetés ellenőrzése:", e.reszlet || e.message); }
    }
    const u = (await db.query("SELECT statusz, szamla_id FROM online_fizetesek WHERE id = $1", [f.id])).rows[0];
    const s = await pu.szamla(u.szamla_id);
    return { statusz: u.statusz, szamla: s ? { id: s.id, sorszam: s.sorszam, statusz: s.statusz, brutto: s.brutto, penznem: s.penznem } : null };
}

// ---------- Demó (csak FIZETES_DEMO=1, Stripe nélkül, a saját gépen) ----------

async function demoFizet(munkamenet) {
    if (!demoBe()) throw hibaKod("not_found");
    const r = await db.query("SELECT * FROM online_fizetesek WHERE munkamenet = $1 AND szolgaltato = 'demo'", [String(munkamenet || "")]);
    const f = r.rows[0];
    if (!f) throw hibaKod("not_found");
    return kifizetve({ munkamenet: f.munkamenet, szamlaId: f.szamla_id, osszegCent: centbe(f.osszeg), penznem: f.penznem, fizetesAzon: "demo" });
}

async function demoAdat(munkamenet) {
    if (!demoBe()) return null;
    const r = await db.query(`SELECT f.*, s.sorszam FROM online_fizetesek f JOIN penzugy_szamlak s ON s.id = f.szamla_id WHERE f.munkamenet = $1 AND f.szolgaltato = 'demo'`, [String(munkamenet || "")]);
    return r.rows[0] || null;
}

// ---------- Admin: a kulcs megadása, a webhook bekapcsolása ----------

// A titkos kulcs mentése – előtte kipróbáljuk a Stripe-nál
async function kulcsBeallit(kulcs) {
    if (envKulcs()) throw hibaKod("key_from_server");
    const k = String(kulcs || "").trim();
    if (!KULCS_MINTA.test(k)) throw hibaKod("bad_key");
    let fiok;
    try {
        fiok = await stripe("GET", "/account", null, null, k);
    } catch (e) {
        const h = hibaKod("key_rejected");
        h.reszlet = e.reszlet;
        throw h;
    }
    // új kulcsnál a régi webhook-titok már nem érvényes (más fiók / mód lehet)
    const valt = tarolt.sk && tarolt.sk !== k;
    await kulcsokMent({ sk: k, ...(valt ? { wh: "", wh_id: "" } : {}) });
    return {
        mod: /_live_/.test(k) ? "eles" : "teszt",
        fiok: fiok && (fiok.business_profile && fiok.business_profile.name || fiok.email || fiok.id),
        orszag: fiok && fiok.country,
        fizethet: fiok ? fiok.charges_enabled !== false : null
    };
}

async function kulcsTorol() {
    await kulcsokMent({ sk: "", wh: "", wh_id: "" });
}

// A webhook (fizetési értesítés) létrehozása a Stripe-ban – egy kattintással.
// A régi, ugyanerre a címre mutató végpontot előbb töröljük.
const ESEMENYEK = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired", "checkout.session.async_payment_failed"];

async function webhookBeallit(alapCim) {
    await kulcsokTolt(true);
    if (!stripeBe()) throw hibaKod("no_key");
    if ((process.env.STRIPE_WEBHOOK_SECRET || "").trim()) throw hibaKod("webhook_from_server");
    const url = String(alapCim || "").replace(/\/+$/, "") + "/api/fizetes/stripe/webhook";
    if (!/^https:\/\//.test(url) && !process.env.STRIPE_API_BASE) throw hibaKod("needs_https");
    try {
        const l = await stripe("GET", "/webhook_endpoints?limit=100");
        for (const w of (l.data || []).filter(x => x.url === url)) {
            await stripe("DELETE", "/webhook_endpoints/" + encodeURIComponent(w.id)).catch(() => { });
        }
        const w = await stripe("POST", "/webhook_endpoints", { url, enabled_events: ESEMENYEK, description: "IngatlanPro – fizetések" });
        if (!w.secret) throw new Error("no secret");
        await kulcsokMent({ wh: w.secret, wh_id: w.id });
        return { url, id: w.id };
    } catch (e) {
        if (e.kod) throw e;
        const h = hibaKod("payment_provider_error");
        h.reszlet = e.message;
        throw h;
    }
}

// ---------- Admin: a legutóbbi online fizetések ----------

async function adminLista() {
    const r = await db.query(`
        SELECT f.id, f.szamla_id, f.szolgaltato, f.munkamenet, f.fizetes_azon, f.osszeg, f.penznem, f.statusz, f.hiba, f.created_at, f.fizetve_at,
               s.sorszam, s.kulso_szam, s.hivatalos_hiba, COALESCE(u.nev, u.felhasznalonev, u.email) AS user_nev
        FROM online_fizetesek f
        LEFT JOIN penzugy_szamlak s ON s.id = f.szamla_id
        LEFT JOIN users u ON u.id = f.user_id
        ORDER BY f.id DESC LIMIT 200`);
    return r.rows.map(x => ({ ...x, osszeg: Number(x.osszeg) }));
}

module.exports = { allapot, kulcsBeallit, kulcsTorol, webhookBeallit, inditas, webhook, ellenoriz, demoFizet, demoAdat, adminLista, _: { alairasOk, urlap } };
