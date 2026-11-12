// ============================================================
//  Vételi ajánlatok az appon keresztül
//
//  Ki kinek tehet ajánlatot:
//   1. Az appra feltöltött hirdetésre:
//      - irodai hirdetés → az irodának: az iroda CRM-jébe kerül (Ajánlatok),
//        a vevő ügyfélként (vagy a meglévő ügyfélhez), az ingatlan „ajánlatot
//        tett” állapotba; értesítést kap a vezető és a hirdetés ügynöke
//      - magánhirdetés (fiókkal feltöltve) → a tulajdonosnak (Fiókom → Ajánlatok)
//      - beolvasott (más oldalról átvett) hirdetésre nem lehet: nincs kinek
//        továbbítani – ott a forrásoldalon kell jelentkezni
//   2. Más oldalon látott ingatlanra: a vevő bemásolja a linket.
//      - ha a link egy appon lévő hirdetésé, annak a hirdetőjéhez megy (1.)
//      - különben kiválasztja a regisztrált irodát, amelyik hirdeti; az iroda
//        CRM-jébe kerül „külső hirdetés” jelöléssel, a linkkel és a vevő által
//        megadott adatokkal; az iroda hozzárendelheti a saját hirdetéséhez
//        (vagy feltöltheti az appra)
//      - ha az iroda nincs regisztrálva, nem tárolunk semmit (nincs, aki
//        megkapja) – a vevő meghívhatja az irodát
//
//  Az ajánlat nem kötelező érvényű szándéknyilatkozat (az ingatlan adásvétele
//  közjegyzői szerződéssel jön létre). Az iroda / tulajdonos válaszolhat:
//  elfogadja, elutasítja, vagy ellenajánlatot tesz; a vevő az ellenajánlatot
//  elfogadhatja, az ajánlatát visszavonhatja. Értesítés: csak az oldalon
//  (csengő) – külön e-mailt nem küldünk.
// ============================================================

const db = require("../db/database");
const { normLink } = require("./listing");

const STATUSZOK = ["uj", "megnezve", "elfogadva", "elutasitva", "ellenajanlat", "visszavonva"];
const FINANSZ = ["keszpenz", "hitel", "vegyes"];
const NAPI_KORLAT = 10;

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

// Értesítés az oldalon (csengő); e-mail nem megy
async function ertesit(userId, adat, link) {
    if (!userId) return;
    await db.query(
        "INSERT INTO ertesitesek (user_id, tipus, adat, link, oldalon, email_kell) VALUES ($1, 'ajanlat', $2::jsonb, $3, true, false)",
        [userId, JSON.stringify(adat || {}), link || null]).catch(e => console.error("Ajánlat értesítés:", e.message));
}

// Az appon lévő hirdetés a link alapján (fő link vagy további linkek)
async function hirdetesLinkbol(link) {
    const n = normLink(link);
    if (!n) return null;
    let ut = "";
    try { ut = new URL(link).pathname.replace(/\/+$/, "").split("/").filter(Boolean).pop() || ""; } catch (e) { return null; }
    if (ut.length < 4) return null;
    const r = await db.query(`
        SELECT id, link, tovabbi_linkek, iroda_id, owner_id, cim, ar, tipus, ugylet, statusz FROM ingatlanok
        WHERE statusz <> 'torolve' AND (link ILIKE $1 OR tovabbi_linkek::text ILIKE $1) LIMIT 30`, [`%${ut}%`]);
    return r.rows.find(i => normLink(i.link) === n || (Array.isArray(i.tovabbi_linkek) && i.tovabbi_linkek.some(l => normLink(l) === n))) || null;
}

// A regisztrált (jóváhagyott, aktív) irodák listája a választóhoz
async function irodak(q) {
    const p = [];
    let felt = "i.statusz = 'jovahagyva'";
    if (q) { p.push(`%${String(q).toLowerCase()}%`); felt += ` AND (LOWER(i.nev) LIKE $1 OR LOWER(COALESCE(i.hivatalos_nev,'')) LIKE $1)`; }
    const b = await require("./penzugy").beallitas();
    if (b.iroda_csomag_kell) felt += ` AND EXISTS (SELECT 1 FROM penzugy_elofizetesek e JOIN penzugy_ugyfelek u ON u.id = e.ugyfel_id
        WHERE u.iroda_id = i.id AND e.statusz = 'aktiv' AND e.kezdet <= CURRENT_DATE AND (e.vege IS NULL OR e.vege >= CURRENT_DATE))`;
    const r = await db.query(`SELECT i.id, i.nev, i.varos, (i.logo IS NOT NULL) AS van_logo FROM irodak i WHERE ${felt} ORDER BY i.nev LIMIT 40`, p);
    return r.rows;
}

// Előnézet a vevőnek: kinek menne az ajánlat (a link vagy a hirdetés alapján)
async function cimzettInfo({ ingatlan_id, link }) {
    let h = null;
    if (ingatlan_id) h = (await db.query("SELECT id, iroda_id, owner_id, cim, ar, tipus, ugylet, statusz, link FROM ingatlanok WHERE id = $1", [Number(ingatlan_id) || 0])).rows[0] || null;
    else if (link) h = await hirdetesLinkbol(link);
    if (!h) return { hirdetes: null };
    let iroda = null;
    if (h.iroda_id) iroda = (await db.query("SELECT id, nev, statusz FROM irodak WHERE id = $1", [h.iroda_id])).rows[0] || null;
    return {
        hirdetes: { id: h.id, cim: h.cim, ar: h.ar, tipus: h.tipus, statusz: h.statusz },
        iroda: iroda && iroda.statusz === "jovahagyva" ? { id: iroda.id, nev: iroda.nev } : null,
        magan: !iroda && !!h.owner_id,
        ajanlhato: !!((iroda && iroda.statusz === "jovahagyva") || h.owner_id)
    };
}

// A vevő ügyfélként az iroda CRM-jében (meglévő: fiók vagy e-mail alapján)
async function crmUgyfel(irodaId, vevo, ingatlan, felelosId) {
    const r = await db.query(`
        SELECT id FROM crm_ugyfelek WHERE iroda_id = $1 AND (user_id = $2 OR ($3::text IS NOT NULL AND LOWER(email) = LOWER($3))) ORDER BY id LIMIT 1`,
        [irodaId, vevo.id, vevo.email || null]);
    if (r.rows[0]) return r.rows[0].id;
    const u = await db.query(`
        INSERT INTO crm_ugyfelek (iroda_id, felelos_id, user_id, nev, telefon, email, szerepek, allapot, forras, igeny, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'targyalas','hirdetes',$8::jsonb,NULL) RETURNING id`,
        [irodaId, felelosId || null, vevo.id, vevo.nev || vevo.email || "Vevő", vevo.telefon || null, vevo.email || null,
         JSON.stringify([ingatlan && ingatlan.ugylet === "kiado" ? "berlo" : "vevo"]),
         JSON.stringify(ingatlan ? { ugylet: ingatlan.ugylet || null, tipus: ingatlan.tipus || null, varos: ingatlan.varos || null } : null)]);
    await db.query("INSERT INTO crm_tevekenysegek (ugyfel_id, tipus, szoveg) VALUES ($1, 'rendszer', 'letrehozva_ajanlatbol')", [u.rows[0].id]);
    return u.rows[0].id;
}

// ===================== AJÁNLAT TÉTELE =====================

async function tesz(user, b) {
    if (!user) throw hibaKod("login_required", 401);
    const osszeg = Number(b.osszeg);
    if (!Number.isFinite(osszeg) || osszeg <= 0 || osszeg > 1e9) throw hibaKod("bad_amount");
    if (!b.hozzajarul) throw hibaKod("consent_required");

    const napi = await db.query("SELECT COUNT(*)::int AS n FROM ajanlatok WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'", [user.id]);
    if (napi.rows[0].n >= NAPI_KORLAT) throw hibaKod("too_many", 429);

    const v = (await db.query("SELECT id, email, telefon, COALESCE(nev, felhasznalonev) AS nev FROM users WHERE id = $1", [user.id])).rows[0];
    const vevo = { id: v.id, nev: sz(b.nev, 120) || v.nev, telefon: sz(b.telefon, 40) || v.telefon, email: v.email };
    if (!vevo.telefon && !vevo.email) throw hibaKod("contact_required");

    // Melyik hirdetés / iroda
    let h = null;
    const link = sz(b.kulso_link, 600);
    if (b.ingatlan_id) h = (await db.query("SELECT * FROM ingatlanok WHERE id = $1 AND statusz <> 'torolve'", [Number(b.ingatlan_id) || 0])).rows[0] || null;
    else if (link) {
        if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(link)) throw hibaKod("bad_link");
        const talalt = await hirdetesLinkbol(link);
        if (talalt) h = (await db.query("SELECT * FROM ingatlanok WHERE id = $1", [talalt.id])).rows[0];
    } else throw hibaKod("listing_required");

    let irodaId = null, cimzettId = null, kulso = null;
    if (h) {
        if (h.owner_id === user.id) throw hibaKod("own_listing");
        if (h.iroda_id) {
            const ir = (await db.query("SELECT id, statusz FROM irodak WHERE id = $1", [h.iroda_id])).rows[0];
            if (ir && ir.statusz === "jovahagyva") irodaId = ir.id;
            const tag = await db.query("SELECT 1 FROM iroda_tagok WHERE iroda_id = $1 AND user_id = $2", [h.iroda_id, user.id]);
            if (tag.rowCount) throw hibaKod("own_listing");
        }
        if (!irodaId && h.owner_id) cimzettId = h.owner_id;
        if (!irodaId && !cimzettId) {
            // beolvasott hirdetés: ha a vevő megnevez egy regisztrált irodát, annak megy külsőként
            if (!b.iroda_id) throw hibaKod("not_offerable");
        }
    }
    if (!irodaId && !cimzettId) {
        const ir = (await db.query("SELECT id FROM irodak WHERE id = $1 AND statusz = 'jovahagyva'", [Number(b.iroda_id) || 0])).rows[0];
        if (!ir) throw hibaKod("agency_required");
        const elerheto = (await irodak()).some(x => x.id === ir.id);
        if (!elerheto) throw hibaKod("agency_required");
        irodaId = ir.id;
        kulso = {
            cim: sz(b.kulso_cim, 200) || (h && h.cim) || null,
            ar: Number(b.kulso_ar) || (h && h.ar) || null,
            tipus: sz(b.kulso_tipus, 30) || (h && h.tipus) || null,
            megjegyzes: sz(b.kulso_megjegyzes, 500)
        };
        if (!link && !h) throw hibaKod("listing_required");
    }

    // Ugyanarra már van nyitott ajánlata: az újat nem engedjük (módosítás helyett vonja vissza)
    const nyitott = await db.query(`
        SELECT id FROM ajanlatok WHERE user_id = $1 AND statusz IN ('uj','megnezve','ellenajanlat')
          AND ((ingatlan_id IS NOT NULL AND ingatlan_id = $2) OR ($3::text IS NOT NULL AND kulso_link = $3))`,
        [user.id, h && !kulso ? h.id : (h ? h.id : null), link]);
    if (nyitott.rowCount) throw hibaKod("already_open", 409);

    const penznem = ["EUR", "RON"].includes(b.penznem) ? b.penznem : "EUR";
    const ervenyes = /^\d{4}-\d{2}-\d{2}$/.test(String(b.ervenyes || "")) ? b.ervenyes : null;

    // CRM: a vevő az iroda ügyfele lesz; felelős: a hirdetés ügynöke (ha van fiókja)
    let crmId = null;
    if (irodaId) {
        let felelos = null;
        if (h && h.ugynok_id) {
            const ag = (await db.query("SELECT user_id FROM iroda_ugynokok WHERE id = $1", [h.ugynok_id])).rows[0];
            felelos = ag && ag.user_id ? ag.user_id : null;
        }
        crmId = await crmUgyfel(irodaId, vevo, h, felelos);
    }

    const r = await db.query(`
        INSERT INTO ajanlatok (ingatlan_id, iroda_id, cimzett_id, user_id, nev, telefon, email, osszeg, penznem, finanszirozas, hitel_elobiralat,
                               birtokba, ervenyes, uzenet, kulso_link, kulso_adat, crm_ugyfel_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17) RETURNING *`,
        [h ? h.id : null, irodaId, cimzettId, user.id, vevo.nev, vevo.telefon, vevo.email, osszeg, penznem,
         FINANSZ.includes(b.finanszirozas) ? b.finanszirozas : null, !!b.hitel_elobiralat, sz(b.birtokba, 80), ervenyes,
         sz(b.uzenet, 2000), link, kulso ? JSON.stringify(kulso) : null, crmId]);
    const a = r.rows[0];

    const cimSzoveg = (h && h.cim) || (kulso && kulso.cim) || link || "";
    if (crmId) {
        await db.query("INSERT INTO crm_tevekenysegek (ugyfel_id, tipus, szoveg, ingatlan_id) VALUES ($1, 'ajanlat', $2, $3)",
            [crmId, `${osszeg.toLocaleString("ro-RO")} ${penznem}${b.uzenet ? " – " + String(b.uzenet).slice(0, 500) : ""}${kulso ? ` [${link}]` : ""}`, h ? h.id : null]);
        await db.query("UPDATE crm_ugyfelek SET utolso_kapcsolat = NOW(), updated_at = NOW(), allapot = CASE WHEN allapot IN ('uj','kapcsolat','aktiv') THEN 'targyalas' ELSE allapot END WHERE id = $1", [crmId]);
        if (h) await db.query(`
            INSERT INTO crm_ugyfel_ingatlan (ugyfel_id, ingatlan_id, szerep, allapot) VALUES ($1,$2,'erdeklodik','ajanlat')
            ON CONFLICT (ugyfel_id, ingatlan_id) DO UPDATE SET allapot = 'ajanlat'`, [crmId, h.id]);
    }

    // Értesítés: az iroda vezetői + a hirdetés ügynöke; magánhirdetésnél a tulajdonos
    const adat = { osszeg, penznem, cim: cimSzoveg, ajanlat_id: a.id };
    if (irodaId) {
        const kik = await db.query(`
            SELECT DISTINCT user_id FROM (
                SELECT user_id FROM iroda_tagok WHERE iroda_id = $1 AND szerep = 'vezeto' AND COALESCE(statusz,'aktiv') = 'aktiv'
                UNION SELECT c.felelos_id FROM crm_ugyfelek c WHERE c.id = $2 AND c.felelos_id IS NOT NULL
            ) x`, [irodaId, crmId]);
        for (const k of kik.rows) await ertesit(k.user_id, adat, `#iroda/${irodaId}:crm`);
    } else if (cimzettId) {
        await ertesit(cimzettId, adat, "#fiok/ajanlatok");
    }
    return publikus(a);
}

function publikus(a) {
    if (!a) return a;
    return { ...a, osszeg: Number(a.osszeg), ellen_osszeg: a.ellen_osszeg === null ? null : Number(a.ellen_osszeg) };
}

const LISTA_SELECT = `
    SELECT a.*, i.cim AS ingatlan_cim, i.ar AS ingatlan_ar, i.tipus AS ingatlan_tipus, i.ugylet AS ingatlan_ugylet, i.kulso_kepek, i.statusz AS ingatlan_statusz,
           ir.nev AS iroda_nev
    FROM ajanlatok a LEFT JOIN ingatlanok i ON i.id = a.ingatlan_id LEFT JOIN irodak ir ON ir.id = a.iroda_id`;

// ===================== A VEVŐ: SAJÁT AJÁNLATAI =====================

async function sajat(user) {
    const r = await db.query(`${LISTA_SELECT} WHERE a.user_id = $1 ORDER BY a.id DESC LIMIT 200`, [user.id]);
    return r.rows.map(publikus);
}

async function vevoValt(user, id, mit) {
    const a = (await db.query("SELECT * FROM ajanlatok WHERE id = $1 AND user_id = $2", [Number(id) || 0, user.id])).rows[0];
    if (!a) throw hibaKod("not_found", 404);
    if (mit === "visszavon") {
        if (!["uj", "megnezve", "ellenajanlat"].includes(a.statusz)) throw hibaKod("not_open");
        await db.query("UPDATE ajanlatok SET statusz = 'visszavonva', updated_at = NOW() WHERE id = $1", [a.id]);
        if (a.crm_ugyfel_id) await db.query("INSERT INTO crm_tevekenysegek (ugyfel_id, tipus, szoveg, ingatlan_id) VALUES ($1,'rendszer','ajanlat_visszavonva',$2)", [a.crm_ugyfel_id, a.ingatlan_id]);
    } else if (mit === "ellen_elfogad") {
        if (a.statusz !== "ellenajanlat") throw hibaKod("no_counter");
        await db.query("UPDATE ajanlatok SET statusz = 'elfogadva', osszeg = ellen_osszeg, updated_at = NOW() WHERE id = $1", [a.id]);
        if (a.crm_ugyfel_id) await db.query("INSERT INTO crm_tevekenysegek (ugyfel_id, tipus, szoveg, ingatlan_id) VALUES ($1,'ajanlat',$2,$3)",
            [a.crm_ugyfel_id, `✓ ${Number(a.ellen_osszeg).toLocaleString("ro-RO")} ${a.penznem}`, a.ingatlan_id]);
        if (a.crm_ugyfel_id) await db.query("UPDATE crm_ugyfelek SET allapot = 'nyert', updated_at = NOW() WHERE id = $1 AND allapot <> 'nyert'", [a.crm_ugyfel_id]);
    } else throw hibaKod("bad_action");
    // a másik fél értesítése
    const adat = { ajanlat_id: a.id, esemeny: mit, osszeg: Number(mit === "ellen_elfogad" ? a.ellen_osszeg : a.osszeg), penznem: a.penznem };
    if (a.iroda_id) {
        const kik = await db.query(`SELECT user_id FROM iroda_tagok WHERE iroda_id = $1 AND szerep = 'vezeto'
                                    UNION SELECT felelos_id FROM crm_ugyfelek WHERE id = $2 AND felelos_id IS NOT NULL`, [a.iroda_id, a.crm_ugyfel_id]);
        for (const k of kik.rows) await ertesit(k.user_id, adat, `#iroda/${a.iroda_id}:crm`);
    } else if (a.cimzett_id) await ertesit(a.cimzett_id, adat, "#fiok/ajanlatok");
    return { ok: true };
}

// ===================== A CÍMZETT: VÁLASZ =====================

// Magánhirdető (tulajdonos) beérkezett ajánlatai
async function beerkezett(user) {
    const r = await db.query(`${LISTA_SELECT} WHERE a.cimzett_id = $1 ORDER BY a.id DESC LIMIT 200`, [user.id]);
    return r.rows.map(publikus);
}

// Az iroda ajánlatai (a CRM-ben); a tag csak a saját ügyfeleiét látja
async function irodaLista(ctx, q = {}) {
    const p = [ctx.irodaId];
    const felt = ["a.iroda_id = $1"];
    if (!ctx.vezeto) { p.push(ctx.userId); felt.push(`EXISTS (SELECT 1 FROM crm_ugyfelek c WHERE c.id = a.crm_ugyfel_id AND c.felelos_id = $${p.length})`); }
    if (q.statusz === "nyitott") felt.push("a.statusz IN ('uj','megnezve','ellenajanlat')");
    else if (STATUSZOK.includes(q.statusz)) { p.push(q.statusz); felt.push(`a.statusz = $${p.length}`); }
    const r = await db.query(`${LISTA_SELECT} WHERE ${felt.join(" AND ")} ORDER BY (a.statusz = 'uj') DESC, a.id DESC LIMIT 300`, p);
    return r.rows.map(publikus);
}

async function irodaAjanlatJog(ctx, id) {
    const p = [Number(id) || 0, ctx.irodaId];
    let felt = "a.id = $1 AND a.iroda_id = $2";
    if (!ctx.vezeto) { p.push(ctx.userId); felt += ` AND EXISTS (SELECT 1 FROM crm_ugyfelek c WHERE c.id = a.crm_ugyfel_id AND c.felelos_id = $3)`; }
    const r = await db.query(`SELECT a.* FROM ajanlatok a WHERE ${felt}`, p);
    if (!r.rowCount) throw hibaKod("not_found", 404);
    return r.rows[0];
}

async function valaszKozos(a, userId, b) {
    const statusz = ["elfogadva", "elutasitva", "ellenajanlat", "megnezve"].includes(b.statusz) ? b.statusz : null;
    if (!statusz) throw hibaKod("bad_status");
    if (["visszavonva"].includes(a.statusz)) throw hibaKod("withdrawn");
    let ellen = null;
    if (statusz === "ellenajanlat") {
        ellen = Number(b.ellen_osszeg);
        if (!Number.isFinite(ellen) || ellen <= 0) throw hibaKod("bad_amount");
    }
    if (statusz === "megnezve") {
        if (a.statusz === "uj") await db.query("UPDATE ajanlatok SET statusz = 'megnezve', updated_at = NOW() WHERE id = $1", [a.id]);
        return { ok: true };
    }
    await db.query(`UPDATE ajanlatok SET statusz = $2, ellen_osszeg = $3, valasz = $4, valasz_ido = NOW(), updated_at = NOW() WHERE id = $1`,
        [a.id, statusz, ellen, sz(b.valasz, 2000)]);
    if (a.crm_ugyfel_id) {
        await db.query("INSERT INTO crm_tevekenysegek (ugyfel_id, user_id, tipus, szoveg, ingatlan_id) VALUES ($1,$2,'rendszer',$3,$4)",
            [a.crm_ugyfel_id, userId, `ajanlat_${statusz}${ellen ? ":" + ellen + " " + a.penznem : ""}`, a.ingatlan_id]);
        if (statusz === "elfogadva") await db.query("UPDATE crm_ugyfelek SET allapot = 'nyert', updated_at = NOW() WHERE id = $1 AND allapot <> 'nyert'", [a.crm_ugyfel_id]);
    }
    await ertesit(a.user_id, { ajanlat_id: a.id, esemeny: statusz, osszeg: Number(a.osszeg), ellen_osszeg: ellen, penznem: a.penznem }, "#fiok/ajanlatok");
    return { ok: true };
}

async function irodaValasz(ctx, id, b) {
    const a = await irodaAjanlatJog(ctx, id);
    return valaszKozos(a, ctx.userId, b);
}

async function maganValasz(user, id, b) {
    const a = (await db.query("SELECT * FROM ajanlatok WHERE id = $1 AND cimzett_id = $2", [Number(id) || 0, user.id])).rows[0];
    if (!a) throw hibaKod("not_found", 404);
    return valaszKozos(a, user.id, b);
}

// Külső hirdetésre jött ajánlat hozzárendelése az iroda saját hirdetéséhez
async function irodaKapcsol(ctx, id, ingatlanId) {
    const a = await irodaAjanlatJog(ctx, id);
    const h = (await db.query("SELECT id FROM ingatlanok WHERE id = $1 AND iroda_id = $2", [Number(ingatlanId) || 0, ctx.irodaId])).rows[0];
    if (!h) throw hibaKod("listing_not_found", 404);
    await db.query("UPDATE ajanlatok SET ingatlan_id = $2, updated_at = NOW() WHERE id = $1", [a.id, h.id]);
    if (a.crm_ugyfel_id) await db.query(`
        INSERT INTO crm_ugyfel_ingatlan (ugyfel_id, ingatlan_id, szerep, allapot) VALUES ($1,$2,'erdeklodik','ajanlat')
        ON CONFLICT (ugyfel_id, ingatlan_id) DO UPDATE SET allapot = 'ajanlat'`, [a.crm_ugyfel_id, h.id]);
    return { ok: true };
}

async function nyitottDb(ctx) {
    const p = [ctx.irodaId];
    let felt = "a.iroda_id = $1 AND a.statusz = 'uj'";
    if (!ctx.vezeto) { p.push(ctx.userId); felt += ` AND EXISTS (SELECT 1 FROM crm_ugyfelek c WHERE c.id = a.crm_ugyfel_id AND c.felelos_id = $2)`; }
    const r = await db.query(`SELECT COUNT(*)::int AS n FROM ajanlatok a WHERE ${felt}`, p).catch(() => ({ rows: [{ n: 0 }] }));
    return r.rows[0].n;
}

module.exports = {
    STATUSZOK, FINANSZ, tesz, cimzettInfo, irodak, sajat, vevoValt, beerkezett,
    irodaLista, irodaValasz, maganValasz, irodaKapcsol, nyitottDb, hirdetesLinkbol
};
