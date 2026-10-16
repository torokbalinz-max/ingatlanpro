// ============================================================
//  Kiemelések (promóciók)
//
//  Egy kiemelt hirdetés a találati lista elején áll, „Kiemelt” jelöléssel,
//  és a kezdőlapon is megjelenik. Honnan jöhet:
//    rendeles  megvett kiemelés (Csomagok és árak: kategória = kiemelés);
//              a hossza a csomag „kiemeles_nap” joga (alapból 7 nap).
//              Ha a rendeléskor nem választott hirdetést, „kredit” marad,
//              amit később bármelyik hirdetésére felhasználhat.
//    keret     az előfizetés havi kerete (jogosultság: kiemeles = N / hó);
//              a hossza a Pénzügyek beállításaiban (kiemeles_nap)
//    admin     az admin adta kézzel (Admin → Pénzügy → Kiemelések)
//
//  Ha a hirdetés már kiemelt, az új kiemelés a mostani végéhez adódik.
// ============================================================

const db = require("../db/database");
const pu = require("./penzugy");

function hibaKod(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

const NAP_MS = 24 * 3600 * 1000;

// A hirdetés aktív kiemelésének vége (vagy null)
async function aktivVege(ingatlanId) {
    const r = await db.query(`
        SELECT MAX(vege) AS vege FROM ingatlan_kiemelesek
        WHERE ingatlan_id = $1 AND statusz = 'aktiv' AND vege > NOW()`, [ingatlanId]);
    return r.rows[0].vege || null;
}

// Új kiemelés (a meglévő végéhez fűzve). -> { id, kezdet, vege }
async function hozzaad({ ingatlan_id, nap, forras = "admin", rendeles_id = null, user_id = null, iroda_id = null, megjegyzes = null }) {
    const napok = Math.max(1, Math.min(365, Math.round(Number(nap) || 7)));
    const i = await db.query("SELECT id, statusz FROM ingatlanok WHERE id = $1", [Number(ingatlan_id) || 0]);
    if (!i.rowCount) throw hibaKod("listing_not_found");
    const eddig = await aktivVege(i.rows[0].id);
    const kezdet = eddig && new Date(eddig) > new Date() ? new Date(eddig) : new Date();
    const vege = new Date(kezdet.getTime() + napok * NAP_MS);
    const r = await db.query(`
        INSERT INTO ingatlan_kiemelesek (ingatlan_id, kezdet, vege, forras, rendeles_id, user_id, iroda_id, megjegyzes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, kezdet, vege`,
        [i.rows[0].id, kezdet, vege, forras, rendeles_id, user_id, iroda_id, megjegyzes]);
    return r.rows[0];
}

// ===================== A FELHASZNÁLÓ KIEMELÉSEI =====================

// A hirdetés a felhasználóé (vagy az irodájáé, ahol tag)?
async function sajatHirdetes(user, ingatlanId) {
    const r = await db.query(`
        SELECT i.id, i.cim, i.tipus, i.statusz, i.owner_id, i.iroda_id
        FROM ingatlanok i
        WHERE i.id = $1 AND (i.owner_id = $2 OR i.iroda_id IN (
            SELECT iroda_id FROM iroda_tagok WHERE user_id = $2 AND COALESCE(statusz, 'aktiv') = 'aktiv'))`,
        [Number(ingatlanId) || 0, user.id]);
    return r.rows[0] || null;
}

// A hónap első napja (helyi idő szerint, a kerethez)
function honapEleje() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

// A keret: az előfizetés havi kiemelései (a felhasználóé vagy az irodáé) –
// mennyi járt ebben a hónapban, mennyit használt el
async function keret(user, irodaId) {
    const j = irodaId ? await pu.irodaJogosultsag(irodaId) : await pu.jogosultsag(user.id);
    const osszes = (j && j.kiemeles) || 0;
    const r = irodaId
        ? await db.query(`SELECT COUNT(*)::int AS n FROM ingatlan_kiemelesek WHERE forras = 'keret' AND iroda_id = $1 AND created_at >= $2`, [irodaId, honapEleje()])
        : await db.query(`SELECT COUNT(*)::int AS n FROM ingatlan_kiemelesek WHERE forras = 'keret' AND user_id = $1 AND iroda_id IS NULL AND created_at >= $2`, [user.id, honapEleje()]);
    const felhasznalt = r.rows[0].n;
    return { osszes, felhasznalt, maradt: Math.max(0, osszes - felhasznalt) };
}

// Megvett, de még hirdetéshez nem kötött kiemelések (kredit)
async function kreditek(user) {
    const r = await db.query(`
        SELECT r.id, r.megnevezes, c.jogosultsag,
               (SELECT SUM(t.mennyiseg) FROM penzugy_tetelek t WHERE t.szamla_id = r.szamla_id AND t.csomag_id = r.csomag_id) AS db
        FROM penzugy_rendelesek r
        JOIN penzugy_csomagok c ON c.id = r.csomag_id
        WHERE r.user_id = $1 AND c.kategoria = 'kiemeles' AND r.statusz IN ('teljesitve', 'aktiv') AND r.ingatlan_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM ingatlan_kiemelesek k WHERE k.rendeles_id = r.id)
        ORDER BY r.id`, [user.id]);
    return r.rows.map(x => ({ rendeles_id: x.id, megnevezes: x.megnevezes, nap: ((x.jogosultsag && x.jogosultsag.kiemeles_nap) || 7) * Math.max(1, Math.round(Number(x.db) || 1)) }));
}

// A kiemelés ablakhoz: hol tart, mit használhat fel, mit vehet
async function sajatAllapot(user, ingatlanId) {
    const h = await sajatHirdetes(user, ingatlanId);
    if (!h) throw hibaKod("listing_not_found");
    const be = await pu.beallitas();
    const [vege, k, kr, termekek, elozmeny] = await Promise.all([
        aktivVege(h.id),
        keret(user, h.iroda_id),
        kreditek(user),
        db.query(`SELECT id, kod, nev, nev_ro, nev_en, ar, penznem, jogosultsag, leiras, leiras_ro, leiras_en, kategoria, celcsoport, idoszak
                  FROM penzugy_csomagok WHERE aktiv AND COALESCE(nyilvanos, true) AND kategoria = 'kiemeles' ORDER BY sorrend, ar, id`),
        db.query(`SELECT kezdet, vege, forras FROM ingatlan_kiemelesek WHERE ingatlan_id = $1 AND statusz = 'aktiv' ORDER BY kezdet DESC LIMIT 10`, [h.id])
    ]);
    return {
        hirdetes: { id: h.id, cim: h.cim, tipus: h.tipus, statusz: h.statusz, iroda_id: h.iroda_id },
        kiemelt_ig: vege,
        keret: { ...k, nap: be.kiemeles_nap || 7 },
        kreditek: kr,
        termekek: termekek.rows.map(c => ({ ...c, ar: Number(c.ar), nap: (c.jogosultsag && c.jogosultsag.kiemeles_nap) || 7 })),
        elozmeny: elozmeny.rows
    };
}

// Felhasználás: előbb a megvett kredit, aztán a havi keret
async function sajatFelhasznal(user, ingatlanId, mibol) {
    const h = await sajatHirdetes(user, ingatlanId);
    if (!h) throw hibaKod("listing_not_found");
    if (!["aktiv", "fuggo"].includes(h.statusz)) throw hibaKod("listing_not_active");
    const be = await pu.beallitas();

    if (mibol !== "keret") {
        const kr = await kreditek(user);
        if (kr.length) {
            const k = kr[0];
            // a rendelés ehhez a hirdetéshez kötve (a díjbekérőn is látszik)
            await db.query("UPDATE penzugy_rendelesek SET ingatlan_id = $2, updated_at = NOW() WHERE id = $1 AND ingatlan_id IS NULL", [k.rendeles_id, h.id]);
            return hozzaad({ ingatlan_id: h.id, nap: k.nap, forras: "rendeles", rendeles_id: k.rendeles_id, user_id: user.id, iroda_id: h.iroda_id });
        }
        if (mibol === "kredit") throw hibaKod("no_credit");
    }

    const k = await keret(user, h.iroda_id);
    if (k.maradt <= 0) throw hibaKod("no_credit");
    return hozzaad({ ingatlan_id: h.id, nap: be.kiemeles_nap || 7, forras: "keret", user_id: user.id, iroda_id: h.iroda_id });
}

// ===================== RENDELÉS → KIEMELÉS =====================
// Amikor egy kiemelés-rendelés díjbekérője kifizetett lesz (kártyával vagy
// az admin jelölte), a választott hirdetés azonnal kiemelt.

pu.rendelesFigyelo(async x => {
    if (!["aktiv", "teljesitve"].includes(x.statusz) || x.elozo !== "fizetesre_var" || !x.ingatlan_id || !x.csomag_id) return;
    const c = await db.query("SELECT kategoria, jogosultsag FROM penzugy_csomagok WHERE id = $1", [x.csomag_id]);
    if (!c.rowCount || c.rows[0].kategoria !== "kiemeles") return;
    const van = await db.query("SELECT 1 FROM ingatlan_kiemelesek WHERE rendeles_id = $1", [x.id]);
    if (van.rowCount) return;
    const j = c.rows[0].jogosultsag || {};
    const m = x.szamla_id ? await db.query("SELECT SUM(mennyiseg) AS n FROM penzugy_tetelek WHERE szamla_id = $1 AND csomag_id = $2", [x.szamla_id, x.csomag_id]) : null;
    const db2 = Math.max(1, Math.round(Number(m && m.rows[0].n) || 1));
    await hozzaad({ ingatlan_id: x.ingatlan_id, nap: (j.kiemeles_nap || 7) * db2, forras: "rendeles", rendeles_id: x.id, user_id: x.user_id, iroda_id: x.iroda_id });
});

// ===================== ADMIN =====================

async function adminLista() {
    const r = await db.query(`
        SELECT k.*, i.cim, i.tipus, i.varos, i.statusz AS hirdetes_statusz, i.ar,
               COALESCE(u.nev, u.felhasznalonev, u.email) AS user_nev, ir.nev AS iroda_nev, r.megnevezes AS rendeles_nev,
               (k.vege > NOW() AND k.kezdet <= NOW() AND k.statusz = 'aktiv') AS fut,
               (k.kezdet > NOW() AND k.statusz = 'aktiv') AS kesobb
        FROM ingatlan_kiemelesek k
        LEFT JOIN ingatlanok i ON i.id = k.ingatlan_id
        LEFT JOIN users u ON u.id = k.user_id
        LEFT JOIN irodak ir ON ir.id = k.iroda_id
        LEFT JOIN penzugy_rendelesek r ON r.id = k.rendeles_id
        WHERE k.vege > NOW() - INTERVAL '60 days'
        ORDER BY (k.vege > NOW() AND k.statusz = 'aktiv') DESC, k.vege DESC
        LIMIT 500`);
    const most = r.rows.filter(x => x.fut);
    return {
        lista: r.rows,
        osszeg: {
            fut: most.length,
            kesobb: r.rows.filter(x => x.kesobb).length,
            rendeles: most.filter(x => x.forras === "rendeles").length,
            keret: most.filter(x => x.forras === "keret").length,
            admin: most.filter(x => x.forras === "admin").length
        }
    };
}

async function adminLeallit(id) {
    const r = await db.query(`UPDATE ingatlan_kiemelesek SET statusz = 'leallitva', vege = LEAST(vege, NOW()) WHERE id = $1 AND statusz = 'aktiv' RETURNING id`, [Number(id) || 0]);
    if (!r.rowCount) throw hibaKod("not_found");
}

module.exports = { aktivVege, hozzaad, sajatAllapot, sajatFelhasznal, keret, kreditek, adminLista, adminLeallit };
