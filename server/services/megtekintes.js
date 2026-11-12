// ============================================================
//  Megtekintés-kérés, „hívom” jelzés, ajánlattételi engedély
//
//  A gond, amit megold: a vevő felhívja az ingatlanost, aki nem tudja, melyik
//  lakásról van szó, és telefonálás közben nehéz időpontot egyeztetni.
//
//  1. Megtekintés-kérés: a hirdetésen a vevő 1–3 időpontot javasol (+ üzenet).
//     - irodai hirdetés: a hirdetés ügynöke (ha van fiókja), különben az iroda
//       vezetője kapja; a CRM „Kérések” oldalán egy kattintással elfogadja az egyik
//       időpontot (az ütközést jelezzük), másikat javasol, vagy elutasítja.
//       Elfogadáskor: a vevő az iroda ügyfele lesz (vagy a meglévő ügyfélhez kerül),
//       a megtekintés bekerül a CRM-naptárba, a vevő értesítést kap.
//     - magánhirdetés: a tulajdonos a Fiókom → Megtekintések oldalon válaszol.
//     - más oldalon látott ingatlan (link): a vevő kiválasztja a regisztrált irodát,
//       a kérés a linkkel együtt az irodához megy (ugyanígy kezelik).
//     A vevő lemondhatja; a javasolt másik időpontot elfogadhatja. Naptárba
//     (.ics) letölthető.
//  2. „Hívom” jelzés: ha a belépett érdeklődő a hirdetésen a telefonszámra koppint,
//     az ügynök a CRM-ben látja, ki hívhatja és melyik hirdetés miatt (72 óráig).
//     A hirdetésen a hivatkozási kód (IP-123) is látszik; a CRM gyorskeresője a
//     telefonszám vagy a kód alapján azonnal megmutatja a hirdetést és az ügyfelet.
//  3. Ajánlatot csak az tehet, aki már kapcsolatban van a hirdetővel:
//     elfogadott megtekintés, a hirdető válaszolt az üzenetére, már ügyfele az
//     irodának ehhez a hirdetéshez, vagy a hirdető meghívta (engedély).
// ============================================================

const db = require("../db/database");

const NAPI_KORLAT = 10;
const NYITOTT = ["uj", "javasolt"];

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

// Helyi idő (Bukarest) "YYYY-MM-DDTHH:MM" → ellenőrzött szöveg, vagy null
function idoTisztit(v) {
    const m = String(v || "").match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return null;
    const hh = Number(m[2]), mm = Number(m[3]);
    if (hh > 23 || mm > 59) return null;
    return `${m[1]}T${m[2]}:${m[3]}`;
}

async function ertesit(userId, adat, link) {
    if (!userId) return;
    await db.query(
        "INSERT INTO ertesitesek (user_id, tipus, adat, link, oldalon, email_kell) VALUES ($1, 'megtekintes', $2::jsonb, $3, true, false)",
        [userId, JSON.stringify(adat || {}), link || null]).catch(e => console.error("Megtekintés értesítés:", e.message));
}

// Az iroda vezetői (aktívak)
async function vezetok(irodaId) {
    const r = await db.query("SELECT user_id FROM iroda_tagok WHERE iroda_id = $1 AND szerep = 'vezeto' AND COALESCE(statusz,'aktiv') = 'aktiv'", [irodaId]);
    return r.rows.map(x => x.user_id);
}

// A hirdetés ügynökének fiókja (ha van és az iroda tagja)
async function ugynokUser(h) {
    if (!h || !h.ugynok_id) return null;
    const r = await db.query(`
        SELECT a.user_id FROM iroda_ugynokok a JOIN iroda_tagok t ON t.user_id = a.user_id AND t.iroda_id = a.iroda_id
        WHERE a.id = $1 AND a.aktiv AND a.user_id IS NOT NULL`, [h.ugynok_id]);
    return r.rows[0] ? r.rows[0].user_id : null;
}

// Kinek szól egy hirdetés: { irodaId, felelosId, cimzettId }
async function cimzett(h) {
    if (h.iroda_id) {
        const ir = (await db.query("SELECT id, statusz FROM irodak WHERE id = $1", [h.iroda_id])).rows[0];
        if (ir && ir.statusz === "jovahagyva") return { irodaId: ir.id, felelosId: await ugynokUser(h), cimzettId: null };
    }
    if (h.owner_id) {
        const o = (await db.query("SELECT szerep FROM users WHERE id = $1", [h.owner_id])).rows[0];
        // az admin feltöltései (beolvasottak) nem magánhirdetések
        if (o && o.szerep !== "admin") return { irodaId: null, felelosId: null, cimzettId: h.owner_id };
    }
    return null;
}

const KERES_SELECT = `
    SELECT k.*, to_char(k.valasztott, 'YYYY-MM-DD"T"HH24:MI') AS valasztott, to_char(k.javasolt, 'YYYY-MM-DD"T"HH24:MI') AS javasolt,
           i.cim AS ingatlan_cim, i.ar AS ingatlan_ar, i.tipus AS ingatlan_tipus, i.ugylet AS ingatlan_ugylet, i.varos AS ingatlan_varos, i.kulso_kepek,
           ir.nev AS iroda_nev, COALESCE(fu.nev, fu.felhasznalonev) AS felelos_nev, COALESCE(cu.nev, cu.felhasznalonev) AS cimzett_nev
    FROM megtekintes_keresek k
    LEFT JOIN ingatlanok i ON i.id = k.ingatlan_id
    LEFT JOIN irodak ir ON ir.id = k.iroda_id
    LEFT JOIN users fu ON fu.id = k.felelos_id
    LEFT JOIN users cu ON cu.id = k.cimzett_id`;

// ===================== AJÁNLATTÉTELI JOG =====================

// Tehet-e ajánlatot a felhasználó erre a hirdetésre (h: ingatlanok sor)
async function ajanlatJog(userId, h) {
    if (!userId || !h) return { jog: false };
    const r = await db.query(`
        SELECT
          EXISTS (SELECT 1 FROM ajanlat_engedelyek WHERE ingatlan_id = $2 AND user_id = $1) AS engedely,
          EXISTS (SELECT 1 FROM megtekintes_keresek WHERE ingatlan_id = $2 AND user_id = $1 AND statusz = 'elfogadva') AS megtekintes,
          EXISTS (SELECT 1 FROM uzenetek WHERE ingatlan_id = $2 AND cimzett_id = $1 AND felado_id <> $1) AS valasz,
          ($3::int IS NOT NULL AND EXISTS (SELECT 1 FROM crm_ugyfelek c JOIN crm_ugyfel_ingatlan k ON k.ugyfel_id = c.id
                    WHERE c.iroda_id = $3 AND c.user_id = $1 AND k.ingatlan_id = $2)) AS ugyfel`,
        [userId, h.id, h.iroda_id || null]);
    const x = r.rows[0];
    return { jog: !!(x.engedely || x.megtekintes || x.valasz || x.ugyfel), ok: x };
}

// A hirdetés oldalához: mit tehet a vevő (megtekintést kérhet-e, ajánlatot tehet-e, van-e nyitott kérése)
async function hirdetesAllapot(user, ingatlanId) {
    const h = (await db.query("SELECT id, iroda_id, owner_id, ugynok_id, statusz, eladva FROM ingatlanok WHERE id = $1", [Number(ingatlanId) || 0])).rows[0];
    if (!h) throw hibaKod("not_found", 404);
    const c = await cimzett(h);
    const out = { kerheto: !!c && h.statusz === "aktiv" && !h.eladva, irodai: !!(c && c.irodaId), ajanlat: false, keres: null, sajat: false };
    if (!user) return out;
    if (h.owner_id === user.id) { out.sajat = true; out.kerheto = false; return out; }
    if (h.iroda_id && (await db.query("SELECT 1 FROM iroda_tagok WHERE iroda_id = $1 AND user_id = $2", [h.iroda_id, user.id])).rowCount) {
        out.sajat = true; out.kerheto = false; return out;
    }
    out.ajanlat = c ? (await ajanlatJog(user.id, h)).jog : false;
    const k = await db.query(`${KERES_SELECT} WHERE k.ingatlan_id = $1 AND k.user_id = $2 ORDER BY k.id DESC LIMIT 1`, [h.id, user.id]);
    out.keres = k.rows[0] || null;
    return out;
}

// ===================== KÉRÉS (a vevő) =====================

async function kerTesz(user, b) {
    if (!user) throw hibaKod("login_required", 401);
    if (!b.hozzajarul) throw hibaKod("consent_required");
    const napi = await db.query("SELECT COUNT(*)::int AS n FROM megtekintes_keresek WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'", [user.id]);
    if (napi.rows[0].n >= NAPI_KORLAT) throw hibaKod("too_many", 429);

    // Időpontok: 1–3, a jövőben (legalább 1 óra múlva), legfeljebb 60 napra
    const most = (await db.query(`SELECT to_char((NOW() AT TIME ZONE 'Europe/Bucharest') + INTERVAL '1 hour', 'YYYY-MM-DD"T"HH24:MI') AS a,
                                         to_char((NOW() AT TIME ZONE 'Europe/Bucharest') + INTERVAL '60 days', 'YYYY-MM-DD"T"HH24:MI') AS b`)).rows[0];
    const idok = [...new Set((Array.isArray(b.idopontok) ? b.idopontok : []).map(idoTisztit).filter(Boolean))]
        .filter(t => t >= most.a && t <= most.b).sort().slice(0, 3);
    if (!idok.length) throw hibaKod("time_required");

    const v = (await db.query("SELECT id, email, telefon, COALESCE(nev, felhasznalonev) AS nev FROM users WHERE id = $1", [user.id])).rows[0];
    const nev = sz(b.nev, 120) || v.nev;
    const telefon = sz(b.telefon, 40) || v.telefon;
    if (!telefon) throw hibaKod("phone_required");

    let h = null, c = null, kulso = null, link = null;
    if (b.ingatlan_id) {
        h = (await db.query("SELECT * FROM ingatlanok WHERE id = $1 AND statusz = 'aktiv'", [Number(b.ingatlan_id) || 0])).rows[0];
        if (!h) throw hibaKod("listing_not_found", 404);
        if (h.owner_id === user.id) throw hibaKod("own_listing");
        c = await cimzett(h);
        if (c && c.irodaId && (await db.query("SELECT 1 FROM iroda_tagok WHERE iroda_id = $1 AND user_id = $2", [c.irodaId, user.id])).rowCount) throw hibaKod("own_listing");
    }
    if (!c) {
        // Más oldalon látott (vagy beolvasott) hirdetés: a vevő által választott regisztrált iroda kapja
        link = sz(b.kulso_link, 600) || (h && h.link) || null;
        if (!link || !/^https?:\/\/[^\s]+\.[^\s]+/.test(link)) throw hibaKod("listing_required");
        const irodaId = Number(b.iroda_id) || 0;
        const elerheto = (await require("./ajanlat").irodak(null, true)).some(x => x.id === irodaId);
        if (!elerheto) throw hibaKod("agency_required");
        c = { irodaId, felelosId: null, cimzettId: null };
        kulso = { cim: sz(b.kulso_cim, 200) || (h && h.cim) || null, ar: Number(b.kulso_ar) || (h && h.ar) || null };
    }

    // Már van nyitott kérése ugyanerre
    const nyitott = await db.query(`
        SELECT id FROM megtekintes_keresek WHERE user_id = $1 AND statusz = ANY($4::text[])
          AND ((ingatlan_id IS NOT NULL AND ingatlan_id = $2) OR ($3::text IS NOT NULL AND kulso_link = $3))`,
        [user.id, link ? null : h.id, link, NYITOTT]);
    if (nyitott.rowCount) throw hibaKod("already_open", 409);

    const r = await db.query(`
        INSERT INTO megtekintes_keresek (ingatlan_id, iroda_id, cimzett_id, felelos_id, user_id, nev, telefon, email, idopontok, uzenet, kulso_link, kulso_adat)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb) RETURNING *`,
        [h ? h.id : null, c.irodaId, c.cimzettId, c.felelosId, user.id, nev, telefon, v.email, JSON.stringify(idok),
         sz(b.uzenet, 1500), link, kulso ? JSON.stringify(kulso) : null]);
    const k = r.rows[0];

    const adat = { esemeny: "uj", nev, cim: (h && h.cim) || (kulso && kulso.cim) || link, keres_id: k.id, ido: idok[0] };
    if (c.irodaId) {
        const kik = new Set(await vezetok(c.irodaId));
        if (c.felelosId) kik.add(c.felelosId);
        for (const u of kik) await ertesit(u, adat, `#iroda/${c.irodaId}:crm`);
    } else {
        await ertesit(c.cimzettId, adat, "#fiok/megtekintesek");
    }
    return { id: k.id };
}

async function sajat(user) {
    const r = await db.query(`${KERES_SELECT} WHERE k.user_id = $1 ORDER BY k.id DESC LIMIT 100`, [user.id]);
    // ajánlatot tehet-e már (elfogadott kérés / engedély)
    const eng = await db.query("SELECT ingatlan_id, keres_id FROM ajanlat_engedelyek WHERE user_id = $1", [user.id]);
    return r.rows.map(k => ({
        ...k,
        ajanlat: k.statusz === "elfogadva" || eng.rows.some(e => (k.ingatlan_id && e.ingatlan_id === k.ingatlan_id) || e.keres_id === k.id)
    }));
}

// A vevő: lemondja, vagy a hirdető által javasolt időpontot elfogadja / elutasítja
async function vevoValt(user, id, mit) {
    const k = (await db.query("SELECT * FROM megtekintes_keresek WHERE id = $1 AND user_id = $2", [Number(id) || 0, user.id])).rows[0];
    if (!k) throw hibaKod("not_found", 404);
    if (mit === "lemond") {
        if (!["uj", "javasolt", "elfogadva"].includes(k.statusz)) throw hibaKod("bad_state");
        await db.query("UPDATE megtekintes_keresek SET statusz = 'lemondva', updated_at = NOW() WHERE id = $1", [k.id]);
        if (k.crm_megt_id) await db.query("UPDATE crm_megtekintesek SET statusz = 'lemondva', visszajelzes = COALESCE(visszajelzes, $2) WHERE id = $1 AND statusz = 'tervezett'", [k.crm_megt_id, "A vevő lemondta (app)"]);
        if (k.crm_ugyfel_id) await db.query("INSERT INTO crm_tevekenysegek (ugyfel_id, tipus, szoveg, ingatlan_id) VALUES ($1, 'rendszer', 'mk_lemondva', $2)", [k.crm_ugyfel_id, k.ingatlan_id]);
        await valaszErtesit(k, "lemondva", true);
        return { ok: true };
    }
    if (k.statusz !== "javasolt") throw hibaKod("bad_state");
    if (mit === "javaslat_elfogad") {
        await elfogad(k, k.javasolt_raw || null, null, { rendszer: true });
        return { ok: true };
    }
    if (mit === "javaslat_elutasit") {
        await db.query("UPDATE megtekintes_keresek SET statusz = 'lemondva', updated_at = NOW() WHERE id = $1", [k.id]);
        await valaszErtesit(k, "javaslat_elutasitva", true);
        return { ok: true };
    }
    throw hibaKod("bad_request");
}

// Értesítés a válaszról (a vevőnek), vagy a vevő lépéséről (a hirdetőnek)
async function valaszErtesit(k, esemeny, hirdetonek = false) {
    const h = k.ingatlan_id ? (await db.query("SELECT cim FROM ingatlanok WHERE id = $1", [k.ingatlan_id])).rows[0] : null;
    const ido = (await db.query(`SELECT to_char(valasztott, 'YYYY-MM-DD"T"HH24:MI') AS v, to_char(javasolt, 'YYYY-MM-DD"T"HH24:MI') AS j FROM megtekintes_keresek WHERE id = $1`, [k.id])).rows[0] || {};
    const adat = { esemeny, cim: (h && h.cim) || (k.kulso_adat && k.kulso_adat.cim) || k.kulso_link, keres_id: k.id, ido: ido.v || ido.j || null, nev: k.nev };
    if (!hirdetonek) return ertesit(k.user_id, adat, "#fiok/megtekintesek");
    if (k.iroda_id) {
        const kik = new Set(await vezetok(k.iroda_id));
        if (k.felelos_id) kik.add(k.felelos_id);
        for (const u of kik) await ertesit(u, adat, `#iroda/${k.iroda_id}:crm`);
    } else await ertesit(k.cimzett_id, adat, "#fiok/megtekintesek");
}

// ===================== ELFOGADÁS (közös) =====================

// k: a kérés sora; ido: "YYYY-MM-DDTHH:MM" (null = a javasolt időpont); actorId: aki elfogadta
async function elfogad(k, ido, actorId, { rendszer = false, felelosId = null } = {}) {
    let kezdet = idoTisztit(ido);
    if (!kezdet && rendszer) {
        const j = (await db.query(`SELECT to_char(javasolt, 'YYYY-MM-DD"T"HH24:MI') AS j FROM megtekintes_keresek WHERE id = $1`, [k.id])).rows[0];
        kezdet = j && j.j;
    }
    if (!kezdet) throw hibaKod("time_required");

    let crmUgyfel = k.crm_ugyfel_id, crmMegt = null;
    if (k.iroda_id) {
        const h = k.ingatlan_id ? (await db.query("SELECT * FROM ingatlanok WHERE id = $1", [k.ingatlan_id])).rows[0] : null;
        const felelos = felelosId || k.felelos_id || actorId || (await vezetok(k.iroda_id))[0] || null;
        if (!crmUgyfel) {
            crmUgyfel = await require("./ajanlat").crmUgyfel(k.iroda_id, { id: k.user_id, nev: k.nev, telefon: k.telefon, email: k.email }, h, felelos,
                { allapot: "aktiv", naplo: "letrehozva_megtekintesbol" });
            await db.query("UPDATE crm_ugyfelek SET allapot = CASE WHEN allapot IN ('uj','kapcsolat') THEN 'aktiv' ELSE allapot END, felelos_id = COALESCE(felelos_id, $2), utolso_kapcsolat = NOW(), updated_at = NOW() WHERE id = $1", [crmUgyfel, felelos]);
        }
        const hely = h && h.cim ? String(h.cim).slice(0, 200) : (k.kulso_adat && k.kulso_adat.cim) || null;
        const m = await db.query(`
            INSERT INTO crm_megtekintesek (iroda_id, ugyfel_id, ingatlan_id, felelos_id, kezdet, hossz_perc, hely, megjegyzes, created_by)
            VALUES ($1,$2,$3,$4,$5,30,$6,$7,$8) RETURNING id`,
            [k.iroda_id, crmUgyfel, k.ingatlan_id, felelos, kezdet, hely,
             [k.uzenet, k.kulso_link].filter(Boolean).join("\n").slice(0, 1000) || null, actorId]);
        crmMegt = m.rows[0].id;
        await db.query("INSERT INTO crm_tevekenysegek (ugyfel_id, user_id, tipus, szoveg, ingatlan_id) VALUES ($1, $2, 'rendszer', $3, $4)",
            [crmUgyfel, actorId, `megt_terv:${kezdet}`, k.ingatlan_id]);
        if (k.ingatlan_id) await db.query(`
            INSERT INTO crm_ugyfel_ingatlan (ugyfel_id, ingatlan_id, szerep, allapot) VALUES ($1,$2,'erdeklodik','uj')
            ON CONFLICT (ugyfel_id, ingatlan_id) DO NOTHING`, [crmUgyfel, k.ingatlan_id]);
        if (felelos && !k.felelos_id) await db.query("UPDATE megtekintes_keresek SET felelos_id = $2 WHERE id = $1", [k.id, felelos]);
    }
    await db.query(`UPDATE megtekintes_keresek SET statusz = 'elfogadva', valasztott = $2, crm_ugyfel_id = $3, crm_megt_id = $4, updated_at = NOW() WHERE id = $1`,
        [k.id, kezdet, crmUgyfel, crmMegt]);
    // Az elfogadott megtekintés után ajánlatot is tehet
    await db.query(`INSERT INTO ajanlat_engedelyek (ingatlan_id, keres_id, iroda_id, user_id, adta) VALUES ($1,$2,$3,$4,$5)
                    ON CONFLICT DO NOTHING`, [k.ingatlan_id, k.ingatlan_id ? null : k.id, k.iroda_id, k.user_id, actorId]).catch(() => { });
    await valaszErtesit({ ...k, crm_ugyfel_id: crmUgyfel }, rendszer ? "javaslat_elfogadva" : "elfogadva", rendszer);
    return { ok: true, crm_megt_id: crmMegt, crm_ugyfel_id: crmUgyfel };
}

// ===================== AZ IRODA (CRM → Kérések) =====================

// A tag csak a neki szólókat (felelős = ő), a vezető mindet
async function irodaKeresJog(ctx, id) {
    const k = (await db.query("SELECT * FROM megtekintes_keresek WHERE id = $1 AND iroda_id = $2", [Number(id) || 0, ctx.irodaId])).rows[0];
    if (!k) throw hibaKod("not_found", 404);
    if (!ctx.vezeto && k.felelos_id !== ctx.userId) throw hibaKod("forbidden", 403);
    return k;
}

async function irodaLista(ctx, q = {}) {
    if (!ctx.irodaId) return { keresek: [], hivasok: [] };
    const p = [ctx.irodaId];
    const felt = ["k.iroda_id = $1"];
    if (!ctx.vezeto) { p.push(ctx.userId); felt.push(`k.felelos_id = $${p.length}`); }
    if (q.statusz === "nyitott" || !q.statusz) felt.push("k.statusz IN ('uj','javasolt')");
    else if (q.statusz !== "mind") { p.push(String(q.statusz)); felt.push(`k.statusz = $${p.length}`); }
    const r = await db.query(`${KERES_SELECT} WHERE ${felt.join(" AND ")} ORDER BY (k.statusz = 'uj') DESC, k.created_at DESC LIMIT 200`, p);

    // Ütközések: a felelős (vagy ha nincs, a lekérdező) tervezett megtekintései a javasolt időpontok körül
    for (const k of r.rows) {
        const kinek = k.felelos_id || ctx.userId;
        k.utkozes = {};
        for (const t of (k.idopontok || [])) {
            const u = await db.query(`
                SELECT to_char(m.kezdet, 'HH24:MI') AS ido, COALESCE(i.cim, m.hely) AS cim FROM crm_megtekintesek m LEFT JOIN ingatlanok i ON i.id = m.ingatlan_id
                WHERE m.felelos_id = $1 AND m.statusz = 'tervezett'
                  AND m.kezdet < $2::timestamp + INTERVAL '45 minutes' AND m.kezdet + (m.hossz_perc || ' minutes')::interval > $2::timestamp - INTERVAL '15 minutes'
                LIMIT 1`, [kinek, t]);
            if (u.rows[0]) k.utkozes[t] = u.rows[0];
        }
    }
    return { keresek: r.rows, hivasok: await hivasok(ctx) };
}

async function irodaValasz(ctx, id, b) {
    const k = await irodaKeresJog(ctx, id);
    if (!NYITOTT.includes(k.statusz)) throw hibaKod("bad_state");
    const valasz = sz(b.valasz, 1000);
    if (valasz) await db.query("UPDATE megtekintes_keresek SET valasz = $2 WHERE id = $1", [k.id, valasz]);
    let felelosId = null;
    if (b.felelos_id && ctx.vezeto) {
        const t = await db.query("SELECT 1 FROM iroda_tagok WHERE iroda_id = $1 AND user_id = $2", [ctx.irodaId, Number(b.felelos_id)]);
        if (t.rowCount) felelosId = Number(b.felelos_id);
    }
    if (b.mit === "elfogad") return elfogad(k, b.idopont, ctx.userId, { felelosId });
    return masikValasz(k, b, valasz);
}

// Másik időpont javaslata / elutasítás (iroda és magánszemély közös)
async function masikValasz(k, b, valasz) {
    if (b.mit === "javasol") {
        const ido = idoTisztit(b.idopont);
        if (!ido) throw hibaKod("time_required");
        await db.query("UPDATE megtekintes_keresek SET statusz = 'javasolt', javasolt = $2, updated_at = NOW() WHERE id = $1", [k.id, ido]);
        await valaszErtesit(k, "javasolt");
        return { ok: true };
    }
    if (b.mit === "elutasit") {
        await db.query("UPDATE megtekintes_keresek SET statusz = 'elutasitva', valasz = COALESCE($2, valasz), updated_at = NOW() WHERE id = $1", [k.id, valasz]);
        await valaszErtesit(k, "elutasitva");
        return { ok: true };
    }
    throw hibaKod("bad_request");
}

async function irodaNyitottDb(ctx) {
    if (!ctx.irodaId) return 0;
    const p = [ctx.irodaId];
    let felt = "iroda_id = $1 AND statusz = 'uj'";
    if (!ctx.vezeto) { p.push(ctx.userId); felt += " AND felelos_id = $2"; }
    return (await db.query(`SELECT COUNT(*)::int AS n FROM megtekintes_keresek WHERE ${felt}`, p)).rows[0].n;
}

// ===================== MAGÁNSZEMÉLY (Fiókom → Megtekintések) =====================

async function beerkezett(user) {
    const r = await db.query(`${KERES_SELECT} WHERE k.cimzett_id = $1 ORDER BY (k.statusz = 'uj') DESC, k.id DESC LIMIT 200`, [user.id]);
    return r.rows;
}

async function maganValasz(user, id, b) {
    const k = (await db.query("SELECT * FROM megtekintes_keresek WHERE id = $1 AND cimzett_id = $2", [Number(id) || 0, user.id])).rows[0];
    if (!k) throw hibaKod("not_found", 404);
    if (!NYITOTT.includes(k.statusz)) throw hibaKod("bad_state");
    const valasz = sz(b.valasz, 1000);
    if (valasz) await db.query("UPDATE megtekintes_keresek SET valasz = $2 WHERE id = $1", [k.id, valasz]);
    if (b.mit === "elfogad") return elfogad(k, b.idopont, user.id);
    return masikValasz(k, b, valasz);
}

// ===================== NAPTÁRFÁJL (.ics) =====================

async function ics(user, id) {
    const k = (await db.query(`${KERES_SELECT} WHERE k.id = $1`, [Number(id) || 0])).rows[0];
    if (!k || k.statusz !== "elfogadva" || !k.valasztott) throw hibaKod("not_found", 404);
    let jog = k.user_id === user.id || k.cimzett_id === user.id || k.felelos_id === user.id;
    if (!jog && k.iroda_id) jog = (await db.query("SELECT 1 FROM iroda_tagok WHERE iroda_id = $1 AND user_id = $2", [k.iroda_id, user.id])).rowCount > 0;
    if (!jog) throw hibaKod("not_found", 404);
    const t = k.valasztott.replace(/[-:]/g, "").replace("T", "T") + "00";
    const [d, h] = k.valasztott.split("T");
    const veg = new Date(`${d}T${h}:00Z`); veg.setUTCMinutes(veg.getUTCMinutes() + 30);
    const t2 = veg.toISOString().replace(/[-:]/g, "").slice(0, 15);
    const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
    const cim = k.ingatlan_cim || (k.kulso_adat && k.kulso_adat.cim) || "";
    const kivel = k.iroda_nev ? `${k.iroda_nev}${k.felelos_nev ? " – " + k.felelos_nev : ""}` : (k.cimzett_nev || "");
    return [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IngatlanPro//Megtekintes//HU", "CALSCALE:GREGORIAN",
        "BEGIN:VTIMEZONE", "TZID:Europe/Bucharest",
        "BEGIN:STANDARD", "DTSTART:19701025T040000", "TZOFFSETFROM:+0300", "TZOFFSETTO:+0200", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
        "BEGIN:DAYLIGHT", "DTSTART:19700329T030000", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0300", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
        "END:VTIMEZONE",
        "BEGIN:VEVENT",
        `UID:megtekintes-${k.id}@ingatlanpro`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
        `DTSTART;TZID=Europe/Bucharest:${t.slice(0, 15)}`,
        `DTEND;TZID=Europe/Bucharest:${t2}`,
        `SUMMARY:${esc("Megtekintés / Vizionare: " + (cim || "IP-" + (k.ingatlan_id || k.id)))}`,
        `LOCATION:${esc(cim)}`,
        `DESCRIPTION:${esc([kivel, k.ingatlan_id ? "IP-" + k.ingatlan_id : k.kulso_link, k.nev && k.telefon ? `${k.nev} ${k.telefon}` : ""].filter(Boolean).join("\n"))}`,
        "END:VEVENT", "END:VCALENDAR", ""
    ].join("\r\n");
}

// ===================== „HÍVOM” JELZÉS =====================

async function hivasJelez(user, ingatlanId) {
    if (!user) return { ok: false };
    const h = (await db.query("SELECT id, owner_id, iroda_id FROM ingatlanok WHERE id = $1", [Number(ingatlanId) || 0])).rows[0];
    if (!h || h.owner_id === user.id || !h.iroda_id) return { ok: false };
    // ugyanarra 30 percen belül csak egyszer
    const volt = await db.query("SELECT 1 FROM hivas_jelzesek WHERE ingatlan_id = $1 AND user_id = $2 AND created_at > NOW() - INTERVAL '30 minutes'", [h.id, user.id]);
    if (!volt.rowCount) await db.query("INSERT INTO hivas_jelzesek (ingatlan_id, user_id) VALUES ($1, $2)", [h.id, user.id]);
    return { ok: true };
}

// Az elmúlt 72 óra jelzései az iroda hirdetéseire (a tag csak a saját hirdetéseire)
async function hivasok(ctx) {
    if (!ctx.irodaId) return [];
    const p = [ctx.irodaId];
    let felt = "i.iroda_id = $1 AND NOT h.rejtve AND h.created_at > NOW() - INTERVAL '72 hours'";
    if (!ctx.vezeto) {
        p.push(ctx.userId);
        felt += ` AND (EXISTS (SELECT 1 FROM iroda_ugynokok a WHERE a.id = i.ugynok_id AND a.user_id = $2) OR i.owner_id = $2)`;
    }
    const r = await db.query(`
        SELECT h.id, h.ingatlan_id, h.user_id, h.created_at, i.cim, i.ar, i.tipus,
               COALESCE(u.nev, u.felhasznalonev) AS nev, u.telefon, u.email,
               (SELECT c.id FROM crm_ugyfelek c WHERE c.iroda_id = $1 AND c.user_id = h.user_id ORDER BY c.id LIMIT 1) AS crm_ugyfel_id
        FROM hivas_jelzesek h JOIN ingatlanok i ON i.id = h.ingatlan_id JOIN users u ON u.id = h.user_id
        WHERE ${felt} ORDER BY h.created_at DESC LIMIT 50`, p);
    return r.rows;
}

async function hivasRejt(ctx, id) {
    const r = await db.query(`UPDATE hivas_jelzesek h SET rejtve = true FROM ingatlanok i WHERE h.id = $1 AND i.id = h.ingatlan_id AND i.iroda_id = $2`, [Number(id) || 0, ctx.irodaId]);
    if (!r.rowCount) throw hibaKod("not_found", 404);
    return { ok: true };
}

// A jelzésből CRM-ügyfél (a hirdetéshez kapcsolva, a felelős az, aki felveszi)
async function hivasFelvesz(ctx, id) {
    const h = (await db.query(`
        SELECT h.*, i.iroda_id FROM hivas_jelzesek h JOIN ingatlanok i ON i.id = h.ingatlan_id WHERE h.id = $1 AND i.iroda_id = $2`, [Number(id) || 0, ctx.irodaId])).rows[0];
    if (!h) throw hibaKod("not_found", 404);
    const u = (await db.query("SELECT id, email, telefon, COALESCE(nev, felhasznalonev) AS nev FROM users WHERE id = $1", [h.user_id])).rows[0];
    const ing = (await db.query("SELECT * FROM ingatlanok WHERE id = $1", [h.ingatlan_id])).rows[0];
    const cid = await require("./ajanlat").crmUgyfel(ctx.irodaId, u, ing, ctx.userId, { allapot: "kapcsolat", naplo: "letrehozva_hivasbol", forras: "telefon" });
    await db.query("UPDATE crm_ugyfelek SET utolso_kapcsolat = NOW() WHERE id = $1", [cid]);
    await db.query(`INSERT INTO crm_ugyfel_ingatlan (ugyfel_id, ingatlan_id, szerep, allapot) VALUES ($1,$2,'erdeklodik','uj') ON CONFLICT (ugyfel_id, ingatlan_id) DO NOTHING`, [cid, h.ingatlan_id]);
    await db.query("INSERT INTO crm_tevekenysegek (ugyfel_id, user_id, tipus, szoveg, ingatlan_id) VALUES ($1, $2, 'hivas', $3, $4)", [cid, ctx.userId, "Hívás a hirdetés miatt (IP-" + h.ingatlan_id + ")", h.ingatlan_id]);
    await db.query("UPDATE hivas_jelzesek SET rejtve = true WHERE id = $1", [h.id]);
    return { ugyfel_id: cid };
}

// ===================== GYORSKERESŐ (telefonálás közben) =====================
// q: telefonszám (részlet), „IP-123” / „#123” / „123” hirdetéskód, vagy név
async function gyors(ctx, qv) {
    const q = String(qv || "").trim();
    if (q.length < 2) return { hirdetesek: [], ugyfelek: [], hivasok: [] };
    const crm = require("./crm");
    const out = { hirdetesek: [], ugyfelek: [], hivasok: [] };
    const kod = q.match(/^(?:ip[-\s]?|#)?(\d{1,7})$/i);
    const szamjegy = q.replace(/\D/g, "");

    if (kod && ctx.irodaId) {
        const r = await db.query(`SELECT i.id, i.cim, i.ar, i.tipus, i.varos, i.kerulet, i.statusz, a.nev AS ugynok_nev
            FROM ingatlanok i LEFT JOIN iroda_ugynokok a ON a.id = i.ugynok_id WHERE i.id = $1 AND i.iroda_id = $2`, [Number(kod[1]), ctx.irodaId]);
        out.hirdetesek = r.rows;
    }
    // Ügyfelek: telefonszám (az utolsó számjegyek) vagy név alapján – a látható ügyfelek közül
    const lista = await crm.ugyfelLista(ctx, { q: szamjegy.length >= 4 ? szamjegy : q, allapot: "mind" }).catch(() => ({ ugyfelek: [] }));
    out.ugyfelek = (lista.ugyfelek || []).slice(0, 8);
    if (szamjegy.length >= 4 && !out.ugyfelek.length) {
        // a tárolt szám formázva lehet („0740 123 456”) – számjegyekre bontva is keresünk
        const p = [`%${szamjegy.slice(-9)}%`];
        const ter = ctx.irodaId === null ? "c.iroda_id IS NULL" : (p.push(ctx.irodaId), `c.iroda_id = $${p.length}`);
        let lat = "TRUE";
        if (!ctx.vezeto) { p.push(ctx.userId); lat = `c.felelos_id = $${p.length}`; }
        const r = await db.query(`SELECT c.id, c.nev, c.telefon, c.email, c.allapot FROM crm_ugyfelek c
            WHERE ${ter} AND ${lat} AND (regexp_replace(COALESCE(c.telefon,''), '\\D', '', 'g') LIKE $1 OR regexp_replace(COALESCE(c.telefon2,''), '\\D', '', 'g') LIKE $1) LIMIT 8`, p);
        out.ugyfelek = r.rows;
    }
    // „Hívom” jelzések ezzel a számmal (aki koppintott, és melyik hirdetésre)
    if (szamjegy.length >= 4) {
        const h = await hivasok(ctx);
        out.hivasok = h.filter(x => String(x.telefon || "").replace(/\D/g, "").includes(szamjegy.slice(-9)));
        if (!out.hirdetesek.length && out.hivasok.length) {
            const ids = [...new Set(out.hivasok.map(x => x.ingatlan_id))];
            out.hirdetesek = (await db.query(`SELECT i.id, i.cim, i.ar, i.tipus, i.varos, i.kerulet, i.statusz, a.nev AS ugynok_nev
                FROM ingatlanok i LEFT JOIN iroda_ugynokok a ON a.id = i.ugynok_id WHERE i.id = ANY($1::int[])`, [ids])).rows;
        }
    }
    return out;
}

// ===================== AJÁNLATTÉTELRE MEGHÍVÁS (a CRM-ből) =====================

async function engedelyAd(ctx, ugyfelId, ingatlanId) {
    const crm = require("./crm");
    const u = await crm.ugyfelJog(ctx, ugyfelId);
    if (!u.user_id) throw hibaKod("no_account");
    const h = (await db.query("SELECT id, cim, iroda_id FROM ingatlanok WHERE id = $1", [Number(ingatlanId) || 0])).rows[0];
    if (!h || (ctx.irodaId !== null && h.iroda_id !== ctx.irodaId)) throw hibaKod("listing_not_found", 404);
    await db.query(`INSERT INTO ajanlat_engedelyek (ingatlan_id, iroda_id, user_id, adta) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [h.id, h.iroda_id, u.user_id, ctx.userId]);
    await db.query(`INSERT INTO crm_ugyfel_ingatlan (ugyfel_id, ingatlan_id, szerep, allapot) VALUES ($1,$2,'erdeklodik','uj') ON CONFLICT (ugyfel_id, ingatlan_id) DO NOTHING`, [u.id, h.id]);
    await db.query("INSERT INTO crm_tevekenysegek (ugyfel_id, user_id, tipus, szoveg, ingatlan_id) VALUES ($1, $2, 'rendszer', 'ajanlat_meghivo', $3)", [u.id, ctx.userId, h.id]);
    await ertesit(u.user_id, { esemeny: "ajanlat_meghivo", cim: h.cim, ingatlan_id: h.id }, `#listing/${h.id}`);
    return { ok: true };
}

module.exports = {
    idoTisztit, ajanlatJog, hirdetesAllapot, kerTesz, sajat, vevoValt, elfogad,
    irodaLista, irodaValasz, irodaNyitottDb, beerkezett, maganValasz, ics,
    hivasJelez, hivasok, hivasRejt, hivasFelvesz, gyors, engedelyAd, hibaKod
};
