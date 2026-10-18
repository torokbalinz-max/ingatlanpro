// ============================================================
//  Csomagok megrendelése (Csomagok és árak oldal) és a felhasználó
//  saját csomagjai, díjbekérői (Fiókom → Csomagom és számláim)
//
//  A rendelés menete:
//   1. a felhasználó kiválaszt egy csomagot, megadja a számlázási adatait
//   2. ügyfél (magánszemély / PFA / cég – vagy az irodája) + ha ismétlődő
//      a csomag: FÜGGŐ előfizetés + díjbekérő az első időszakra
//   3. átutal (a díjbekérőn az IBAN és a közlemény = a díjbekérő száma)
//   4. az admin a díjbekérőt kifizetettnek jelöli → az előfizetés aktív,
//      a csomag jogai élnek (penzugy.rendelesSzinkron)
//
//  Az admin a Pénzügyek → Rendelések részen látja, ki mit rendelt,
//  mennyi folyt be csomagonként, magánszemélyektől / irodáktól.
// ============================================================

const db = require("../db/database");
const pu = require("./penzugy");

const RENDELES_STATUSZOK = ["fizetesre_var", "aktiv", "teljesitve", "lemondva", "torolve"];

function hibaKod(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

const sz = (v, max) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ===================== NYILVÁNOS ÁRLISTA =====================

function nyilvanosCsomag(c) {
    return {
        id: c.id, kod: c.kod, nev: c.nev, nev_ro: c.nev_ro, nev_en: c.nev_en,
        kategoria: c.kategoria, ar: Number(c.ar), penznem: c.penznem, idoszak: c.idoszak,
        leiras: c.leiras, leiras_ro: c.leiras_ro, leiras_en: c.leiras_en,
        elonyok: c.elonyok, elonyok_ro: c.elonyok_ro, elonyok_en: c.elonyok_en,
        celcsoport: c.celcsoport || "mindenki", kiemelt: !!c.kiemelt, jogosultsag: c.jogosultsag || {}, sorrend: c.sorrend
    };
}

async function arlista() {
    await pu.kesz();
    const b = await pu.beallitas();
    const r = await db.query(`
        SELECT * FROM penzugy_csomagok
        WHERE aktiv AND COALESCE(nyilvanos, true)
        ORDER BY sorrend, ar, id`);
    return {
        csomagok: r.rows.map(nyilvanosCsomag),
        ingyenes: { maganszemely: b.ingyenes_hirdetes, iroda: b.iroda_ingyenes_hirdetes, korlatok_be: !!b.korlatok_be },
        afa_fizeto: !!b.afa_fizeto,
        afa_kulcs: b.afa_kulcs,
        fizetesi_hatarido: b.fizetesi_hatarido
    };
}

// ===================== JOGOSULTSÁG (kié az ügyfél) =====================

// Az irodák, amelyeket a felhasználó vezet (ezek nevében rendelhet)
async function vezetettIrodak(userId) {
    const r = await db.query(`
        SELECT i.id, i.nev, i.statusz, i.cui, i.reg_com, COALESCE(i.hivatalos_cim, i.cim) AS cim, i.email, i.telefon, i.hivatalos_nev
        FROM irodak i JOIN iroda_tagok t ON t.iroda_id = i.id
        WHERE t.user_id = $1 AND t.szerep = 'vezeto' AND COALESCE(t.statusz, 'aktiv') = 'aktiv'
          AND COALESCE(i.statusz, 'fuggo') <> 'elutasitva'
        ORDER BY i.nev`, [userId]);
    return r.rows;
}

// A felhasználó ügyfél-azonosítói: a sajátja + az általa vezetett irodáké
async function ugyfelIdk(userId) {
    const r = await db.query(`
        SELECT id FROM penzugy_ugyfelek
        WHERE user_id = $1
           OR iroda_id IN (SELECT t.iroda_id FROM iroda_tagok t WHERE t.user_id = $1 AND t.szerep = 'vezeto' AND COALESCE(t.statusz, 'aktiv') = 'aktiv')`, [userId]);
    return r.rows.map(x => x.id);
}

// ===================== RENDELÉS =====================

async function ugyfelKeres(userId, irodaId, sz) {

    const r = irodaId
        ? await db.query("SELECT * FROM penzugy_ugyfelek WHERE iroda_id = $1 ORDER BY id LIMIT 1", [irodaId])
        : await db.query("SELECT * FROM penzugy_ugyfelek WHERE user_id = $1 AND iroda_id IS NULL ORDER BY id LIMIT 1", [userId]);

    const adat = {
        tipus: sz.tipus,
        nev: sz.nev,
        cui: sz.cui,
        reg_com: sz.reg_com,
        cim: sz.cim,
        email: sz.email,
        telefon: sz.telefon,
        // az e-Facturához külön: település, megye, ország, ÁFA-alany-e
        varos: sz.varos,
        megye: sz.megye,
        orszag: sz.orszag,
        afa_alany: sz.afa_alany,
        user_id: irodaId ? null : userId,
        iroda_id: irodaId || null
    };

    if (r.rowCount) {
        const u = r.rows[0];
        // a korábban megadott CNP megmarad, ha most nem írta be újra (nem küldjük vissza a böngészőnek)
        if (adat.tipus === "maganszemely" && !adat.cui && u.tipus === "maganszemely" && u.cui) adat.cui = u.cui;
        // A számlázási adatok frissítése (a már kiállított bizonylatokon a régi marad)
        await pu.ugyfelMent(u.id, { ...adat, user_id: u.user_id || adat.user_id, jegyzet: u.jegyzet });
        return u.id;
    }

    return pu.ugyfelMent(null, { ...adat, jegyzet: "A weboldalon rendelt (Csomagok és árak)." });

}

// A CNP ellenőrző száma (a magánszemély személyi száma – nem kötelező megadni)
function cnpErvenyes(cnp) {
    if (!/^[1-9]\d{12}$/.test(cnp)) return false;
    const k = "279146358279";
    let s = 0;
    for (let i = 0; i < 12; i++) s += Number(cnp[i]) * Number(k[i]);
    const e = s % 11 === 10 ? 1 : s % 11;
    return e === Number(cnp[12]);
}

// A számlázási adatok: mindaz, ami a hivatalos számlához és az ANAF e-Facturához kell
//   (Legea 227/2015 art. 319; CIUS-RO: a vevő utcája, települése, megyéje, országa külön)
function szamlazasTisztit(b) {
    const efactura = require("./efactura");
    const tipus = pu.UGYFEL_TIPUSOK.includes(b.tipus) ? b.tipus : "maganszemely";
    const orszag = /^[A-Za-z]{2}$/.test(String(b.orszag || "").trim()) ? String(b.orszag).trim().toUpperCase() : "RO";
    const d = {
        tipus,
        nev: sz(b.nev, 200),
        cui: (sz(b.cui, 20) || "").toUpperCase().replace(/^RO/, "").replace(/\s/g, "") || null,
        reg_com: sz(b.reg_com, 40),
        cim: sz(b.cim, 400),
        varos: sz(b.varos, 80),
        megye: orszag === "RO" ? (efactura.megyeKod(b.megye) || null) : null,
        orszag,
        afa_alany: tipus !== "maganszemely" && !!b.afa_alany,
        email: (sz(b.email, 160) || "").toLowerCase() || null,
        telefon: sz(b.telefon, 40)
    };
    if (!d.nev) throw hibaKod("missing_name");
    if (!d.cim || d.cim.length < 3) throw hibaKod("missing_address");
    if (!d.varos) throw hibaKod("missing_city");
    if (orszag === "RO" && !d.megye) throw hibaKod("missing_county");
    // Bukarestben a település a kerület (Sector 1–6) – az ANAF így kéri
    if (d.megye === "RO-B") {
        const m = `${d.varos} ${d.cim}`.match(/sector(?:ul)?\s*([1-6])\b/i);
        if (!m) throw hibaKod("bad_sector");
        d.varos = "Sector " + m[1];
    }
    if (!d.email || !EMAIL_RE.test(d.email)) throw hibaKod("bad_email");
    if (tipus === "maganszemely") {
        // magánszemély: a CNP nem kötelező (nélküle az ANAF-nak 13 db 0 megy)
        const cnp = String(b.cnp || "").replace(/\s/g, "");
        if (cnp && !cnpErvenyes(cnp)) throw hibaKod("bad_cnp");
        d.cui = cnp || null;
        d.reg_com = null;
    } else {
        if (!/^\d{2,10}$/.test(d.cui || "")) throw hibaKod("bad_cui");
        if (orszag === "RO" && !require("./anaf").cuiErvenyes(d.cui)) throw hibaKod("bad_cui");
    }
    return d;
}

// user: req.user; b: { csomag_id, iroda_id, ingatlan_id, mennyiseg, szamlazas: {...}, megjegyzes, elfogad }
async function rendel(user, b) {

    if (!user) throw hibaKod("login_required");
    if (!b || !b.elfogad) throw hibaKod("must_accept");

    await pu.kesz();

    const cr = await db.query("SELECT * FROM penzugy_csomagok WHERE id = $1 AND aktiv AND COALESCE(nyilvanos, true)", [Number(b.csomag_id) || 0]);
    const csomag = cr.rows[0];
    if (!csomag) throw hibaKod("package_not_found");

    // Kinek: iroda nevében (csak a vezetője rendelhet), vagy magának
    let irodaId = Number(b.iroda_id) || null;
    if (csomag.celcsoport === "iroda" && !irodaId) throw hibaKod("agency_required");
    if (csomag.celcsoport === "maganszemely") irodaId = null;
    if (irodaId) {
        const ir = await vezetettIrodak(user.id);
        if (!ir.some(i => i.id === irodaId)) throw hibaKod("not_manager");
    }

    const szamlazas = szamlazasTisztit(b.szamlazas || {});

    // Hirdetés kiemeléséhez: a saját (vagy az irodája) hirdetése
    let ingatlanId = Number(b.ingatlan_id) || null;
    let ingatlanCim = null;
    if (ingatlanId) {
        const ir = await db.query(`
            SELECT id, cim, tipus FROM ingatlanok
            WHERE id = $1 AND (owner_id = $2 OR iroda_id IN (SELECT iroda_id FROM iroda_tagok WHERE user_id = $2 AND COALESCE(statusz, 'aktiv') = 'aktiv'))`,
            [ingatlanId, user.id]);
        if (!ir.rowCount) throw hibaKod("listing_not_found");
        ingatlanCim = ir.rows[0].cim;
    }

    const mennyiseg = Math.min(20, Math.max(1, Math.round(Number(b.mennyiseg) || 1)));

    // Ugyanarra a csomagra már van fizetésre váró rendelése → azt adjuk vissza
    const fugg = await db.query(`
        SELECT id FROM penzugy_rendelesek
        WHERE user_id = $1 AND csomag_id = $2 AND COALESCE(iroda_id, 0) = COALESCE($3::int, 0) AND statusz = 'fizetesre_var'
          AND COALESCE(ingatlan_id, 0) = COALESCE($4::int, 0)
        ORDER BY id DESC LIMIT 1`, [user.id, csomag.id, irodaId, ingatlanId]);
    if (fugg.rowCount) {
        const e = hibaKod("already_pending");
        e.rendeles_id = fugg.rows[0].id;
        throw e;
    }

    const ugyfelId = await ugyfelKeres(user.id, irodaId, szamlazas);

    // Ismétlődő csomagból egyszerre egy aktív előfizetés
    if (csomag.idoszak !== "egyszeri") {
        const van = await db.query(`
            SELECT id FROM penzugy_elofizetesek
            WHERE ugyfel_id = $1 AND csomag_id = $2 AND statusz = 'aktiv' AND (vege IS NULL OR vege >= $3::date)`,
            [ugyfelId, csomag.id, pu.ma()]);
        if (van.rowCount) throw hibaKod("already_active");
    }

    const be = await pu.beallitas();
    const ma = pu.ma();
    const nev = csomag.nev;
    let elofizetesId = null;
    let tol = null;
    let ig = null;

    if (csomag.idoszak !== "egyszeri") {
        const honap = pu.HONAP[csomag.idoszak] || 1;
        tol = ma;
        ig = pu.napHozzaad(pu.honapHozzaad(ma, honap), -1);
        elofizetesId = await pu.elofizetesMent(null, {
            ugyfel_id: ugyfelId,
            csomag_id: csomag.id,
            megnevezes: nev,
            ar: Number(csomag.ar),
            penznem: csomag.penznem,
            idoszak: csomag.idoszak,
            mennyiseg,
            kezdet: ma,
            kovetkezo: pu.honapHozzaad(ma, honap),
            statusz: "fuggo",
            jegyzet: "A weboldalon rendelve – a díjbekérő befizetése után aktív."
        });
    }

    const tetelNev = `${nev}${tol ? ` (${tol} – ${ig})` : ""}${ingatlanId ? ` – #${ingatlanId}${ingatlanCim ? " " + String(ingatlanCim).slice(0, 60) : ""}` : ""}`;

    const szamlaId = await pu.szamlaMent(null, {
        tipus: "dijbekero",
        ugyfel_id: ugyfelId,
        elofizetes_id: elofizetesId,
        kiallitva: ma,
        esedekes: pu.napHozzaad(ma, be.fizetesi_hatarido || 14),
        idoszak_tol: tol,
        idoszak_ig: ig,
        penznem: csomag.penznem,
        megjegyzes: sz(b.megjegyzes, 600),
        tetelek: [{ megnevezes: tetelNev, csomag_id: csomag.id, mennyiseg, egysegar: Number(csomag.ar) }]
    });

    const szamla = await pu.szamla(szamlaId);

    const r = await db.query(`
        INSERT INTO penzugy_rendelesek (user_id, iroda_id, csomag_id, ugyfel_id, elofizetes_id, szamla_id, ingatlan_id, celcsoport,
               megnevezes, ar, penznem, idoszak, statusz, megjegyzes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'fizetesre_var',$13) RETURNING id`,
        [user.id, irodaId, csomag.id, ugyfelId, elofizetesId, szamlaId, ingatlanId, irodaId ? "iroda" : "maganszemely",
         nev, szamla.brutto, csomag.penznem, csomag.idoszak, sz(b.megjegyzes, 600)]);

    // Ingyenes csomag (0 Ft): azonnal teljesül
    if (Number(szamla.brutto) === 0) {
        await pu.szamlaAllapotValt(szamlaId, { statusz: "fizetve", fizetesi_mod: "egyeb" });
    }

    return { id: r.rows[0].id, szamla: await pu.szamla(szamlaId), fizetes: await fizetesiAdatok() };

}

// Az átutaláshoz szükséges adatok (a díjbekérőn és a rendelés után)
async function fizetesiAdatok() {
    const b = await pu.beallitas();
    const u = await require("./oldalAdatok").nyilvanos();
    // online: kártyás fizetés elérhető (Stripe – services/fizetes.js)
    const online = await require("./fizetes").allapot().then(a => a.elerheto).catch(() => false);
    return {
        iban: b.iban || "", bank: b.bank || "", kedvezmenyezett: b.kedvezmenyezett || u.nev || "IngatlanPro", email: u.email || "", online,
        revolut: b.revolut_link || ""
    };
}

// ===================== A FELHASZNÁLÓ SAJÁT ADATAI =====================

async function sajat(user) {

    const ids = await ugyfelIdk(user.id);
    const b = await pu.beallitas();
    const jog = await pu.jogosultsag(user.id);
    const irodak = await vezetettIrodak(user.id);

    const hasz = await db.query(`
        SELECT COUNT(*)::int AS n FROM ingatlanok WHERE owner_id = $1 AND iroda_id IS NULL AND statusz IN ('aktiv', 'fuggo')`, [user.id]);

    const irodaHasznalat = [];
    for (const i of irodak) {
        const j = await pu.irodaJogosultsag(i.id);
        const n = await db.query("SELECT COUNT(*)::int AS n FROM ingatlanok WHERE iroda_id = $1 AND statusz IN ('aktiv', 'fuggo')", [i.id]);
        irodaHasznalat.push({ id: i.id, nev: i.nev, statusz: i.statusz, limit: j.hirdetes_limit, db: n.rows[0].n, csomagok: j.csomagok, reklammentes: j.reklammentes, pro_statisztika: j.pro_statisztika, profil_kiemeles: j.profil_kiemeles || 0 });
    }

    let elofizetesek = [];
    let szamlak = [];
    if (ids.length) {
        const e = await db.query(`
            SELECT e.id, e.megnevezes, e.ar, e.penznem, e.idoszak, e.mennyiseg, e.kezdet, e.kovetkezo, e.vege, e.statusz, e.csomag_id,
                   u.nev AS ugyfel_nev, u.iroda_id, c.nev_ro, c.nev_en, c.nev AS csomag_nev,
                   (SELECT MAX(s.idoszak_ig) FROM penzugy_szamlak s WHERE s.elofizetes_id = e.id AND s.statusz = 'fizetve') AS fizetve_ig
            FROM penzugy_elofizetesek e
            JOIN penzugy_ugyfelek u ON u.id = e.ugyfel_id
            LEFT JOIN penzugy_csomagok c ON c.id = e.csomag_id
            WHERE e.ugyfel_id = ANY($1::int[]) AND e.statusz <> 'lemondva'
            ORDER BY e.statusz, e.id DESC`, [ids]);
        elofizetesek = e.rows.map(x => { pu.szamosit(x, ["ar"]); x.fizetve_ig = pu.pgDatum(x.fizetve_ig); return x; });

        const s = await db.query(`
            SELECT s.id, s.sorszam, s.tipus, s.kiallitva, s.esedekes, s.fizetve, s.statusz, s.brutto, s.penznem, s.kulso_szam,
                   (s.kulso_szam IS NOT NULL AND s.hivatalos_link IS NOT NULL) AS hivatalos,
                   (SELECT string_agg(t.megnevezes, ' | ' ORDER BY t.sorrend) FROM penzugy_tetelek t WHERE t.szamla_id = s.id) AS tetelek
            FROM penzugy_szamlak s
            WHERE s.ugyfel_id = ANY($1::int[]) AND s.statusz <> 'piszkozat'
              -- vásárlásonként egy sor: a kifizetett díjbekérő helyett a számla; a sztornózott díjbekérő nem kell
              AND NOT (s.tipus = 'dijbekero' AND (s.statusz = 'sztorno'
                       OR EXISTS (SELECT 1 FROM penzugy_szamlak x WHERE x.dijbekero_id = s.id AND x.statusz <> 'sztorno')))
            ORDER BY s.kiallitva DESC, s.id DESC LIMIT 200`, [ids]);
        const mn = pu.ma();
        szamlak = s.rows.map(x => { pu.szamosit(x, ["brutto"]); x.allapot = pu.szamlaAllapot(x, mn); return x; });
    }

    const rend = await db.query(`
        SELECT r.id, r.megnevezes, r.ar, r.penznem, r.idoszak, r.statusz, r.created_at, r.szamla_id, r.iroda_id, r.ingatlan_id,
               s.sorszam, s.esedekes, c.nev_ro, c.nev_en, c.nev AS csomag_nev, i.nev AS iroda_nev
        FROM penzugy_rendelesek r
        LEFT JOIN penzugy_szamlak s ON s.id = r.szamla_id
        LEFT JOIN penzugy_csomagok c ON c.id = r.csomag_id
        LEFT JOIN irodak i ON i.id = r.iroda_id
        WHERE r.user_id = $1
        ORDER BY r.id DESC LIMIT 100`, [user.id]);

    return {
        jog,
        hasznalat: { db: hasz.rows[0].n, limit: jog ? jog.hirdetes_limit : b.ingyenes_hirdetes, korlatok_be: !!b.korlatok_be },
        irodak: irodaHasznalat,
        elofizetesek,
        rendelesek: rend.rows.map(x => { pu.szamosit(x, ["ar"]); x.esedekes = pu.pgDatum(x.esedekes); return x; }),
        szamlak,
        fizetes: await fizetesiAdatok(),
        // A rendelési űrlap kitöltéséhez: a legutóbbi számlázási adatok
        szamlazas: await utolsoSzamlazas(user),
        vezetettIrodak: irodak.map(i => ({ id: i.id, nev: i.nev, statusz: i.statusz, cui: i.cui, reg_com: i.reg_com, cim: i.cim, email: i.email, telefon: i.telefon, hivatalos_nev: i.hivatalos_nev }))
    };

}

async function utolsoSzamlazas(user) {
    const r = await db.query(`SELECT tipus, nev, cui, reg_com, cim, varos, megye, COALESCE(orszag, 'RO') AS orszag, COALESCE(afa_alany, false) AS afa_alany,
                                     email, telefon FROM penzugy_ugyfelek WHERE user_id = $1 AND iroda_id IS NULL ORDER BY id LIMIT 1`, [user.id]);
    if (r.rowCount) {
        const x = r.rows[0];
        // a CNP-t nem küldjük vissza teljes egészében (csak hogy meg van-e adva)
        if (x.tipus === "maganszemely" && x.cui) { x.cnp_van = true; x.cui = ""; }
        return x;
    }
    const u = await db.query("SELECT nev, email, telefon FROM users WHERE id = $1", [user.id]);
    const x = u.rows[0] || {};
    return { tipus: "maganszemely", nev: x.nev || "", email: x.email || "", telefon: x.telefon || "", cim: "", varos: "", megye: "", orszag: "RO", cui: "", reg_com: "" };
}

// Egy bizonylat – csak ha a felhasználóé (vagy az általa vezetett irodáé)
async function sajatSzamla(user, szamlaId) {
    const ids = await ugyfelIdk(user.id);
    const s = await pu.szamla(Number(szamlaId) || 0);
    if (!s || !ids.includes(s.ugyfel_id) || s.statusz === "piszkozat") return null;
    return s;
}

// Lemondás: a függő (még nem fizetett) azonnal megszűnik; az aktív a
// kifizetett időszak végéig él, utána nem készül új díjbekérő
async function lemond(user, elofizetesId) {
    const ids = await ugyfelIdk(user.id);
    const r = await db.query("SELECT * FROM penzugy_elofizetesek WHERE id = $1", [Number(elofizetesId) || 0]);
    const e = r.rows[0];
    if (!e || !ids.includes(e.ugyfel_id)) throw hibaKod("not_found");

    if (e.statusz === "fuggo") {
        const nyitott = await db.query("SELECT id FROM penzugy_szamlak WHERE elofizetes_id = $1 AND statusz = 'kiallitva'", [e.id]);
        await db.query("UPDATE penzugy_rendelesek SET statusz = 'lemondva', updated_at = NOW() WHERE elofizetes_id = $1 AND statusz = 'fizetesre_var'", [e.id]);
        for (const s of nyitott.rows) await pu.szamlaAllapotValt(s.id, { statusz: "sztorno" });
        await db.query("UPDATE penzugy_elofizetesek SET statusz = 'lemondva', vege = COALESCE(vege, $2::date), updated_at = NOW() WHERE id = $1", [e.id, pu.ma()]);
        return { lemondva: true, vege: pu.ma() };
    }

    if (e.statusz !== "aktiv") throw hibaKod("not_active");

    const f = await db.query("SELECT MAX(idoszak_ig) AS ig FROM penzugy_szamlak WHERE elofizetes_id = $1 AND statusz = 'fizetve'", [e.id]);
    const ig = pu.pgDatum(f.rows[0].ig);
    const vege = ig && ig > pu.ma() ? ig : pu.ma();

    // A még ki nem fizetett, későbbi időszakra szóló díjbekérők sztornó
    const kesobbi = await db.query("SELECT id FROM penzugy_szamlak WHERE elofizetes_id = $1 AND statusz = 'kiallitva' AND (idoszak_tol IS NULL OR idoszak_tol > $2::date)", [e.id, vege]);
    for (const s of kesobbi.rows) await pu.szamlaAllapotValt(s.id, { statusz: "sztorno" });

    await db.query(`
        UPDATE penzugy_elofizetesek SET vege = $2::date, jegyzet = TRIM(COALESCE(jegyzet, '') || E'\\n' || $3), updated_at = NOW()
        WHERE id = $1`, [e.id, vege, `A felhasználó lemondta (${pu.ma()}); érvényes eddig: ${vege}.`]);
    return { lemondva: true, vege };
}

// Fizetésre váró rendelés visszavonása
async function visszavon(user, rendelesId) {
    const r = await db.query("SELECT * FROM penzugy_rendelesek WHERE id = $1 AND user_id = $2", [Number(rendelesId) || 0, user.id]);
    const x = r.rows[0];
    if (!x) throw hibaKod("not_found");
    if (x.statusz !== "fizetesre_var") throw hibaKod("not_pending");
    await db.query("UPDATE penzugy_rendelesek SET statusz = 'lemondva', updated_at = NOW() WHERE id = $1", [x.id]);
    if (x.szamla_id) await pu.szamlaAllapotValt(x.szamla_id, { statusz: "sztorno" });
    if (x.elofizetes_id) {
        await db.query("UPDATE penzugy_elofizetesek SET statusz = 'lemondva', vege = COALESCE(vege, $2::date), updated_at = NOW() WHERE id = $1 AND statusz = 'fuggo'", [x.elofizetes_id, pu.ma()]);
    }
    return { visszavonva: true };
}

// ===================== ADMIN: RENDELÉSEK, ELADÁSOK CSOMAGONKÉNT =====================

async function adminLista(f = {}) {

    const b = await pu.beallitas();
    const felt = [];
    const p = [];
    // Alapból csak a kifizetett rendelések látszanak (a fizetésre várók nem teendők:
    // kártyás fizetésnél magától teljesülnek, a ki nem fizetettek maguktól megszűnnek)
    const st = f.statusz || "fizetett";
    if (st === "fizetett") felt.push(`r.statusz IN ('aktiv', 'teljesitve', 'lemondva')`);
    else if (RENDELES_STATUSZOK.includes(st)) { p.push(st); felt.push(`r.statusz = $${p.length}`); }
    if (f.celcsoport === "iroda" || f.celcsoport === "maganszemely") { p.push(f.celcsoport); felt.push(`r.celcsoport = $${p.length}`); }
    if (Number(f.csomag_id)) { p.push(Number(f.csomag_id)); felt.push(`r.csomag_id = $${p.length}`); }

    const lista = await db.query(`
        SELECT r.*, s.sorszam, s.esedekes, s.statusz AS szamla_statusz, s.brutto AS szamla_brutto, s.fizetve AS szamla_fizetve,
               u.nev AS ugyfel_nev, u.tipus AS ugyfel_tipus, u.email AS ugyfel_email,
               COALESCE(f.nev, f.felhasznalonev, f.email) AS fiok_nev, f.email AS fiok_email,
               i.nev AS iroda_nev, c.nev AS csomag_nev, c.kategoria,
               sz.id AS szamla2_id, sz.sorszam AS szamla2_sorszam
        FROM penzugy_rendelesek r
        LEFT JOIN LATERAL (SELECT x.id, x.sorszam FROM penzugy_szamlak x WHERE x.dijbekero_id = r.szamla_id AND x.tipus = 'szamla' AND x.statusz <> 'sztorno' ORDER BY x.id LIMIT 1) sz ON true
        LEFT JOIN penzugy_szamlak s ON s.id = r.szamla_id
        LEFT JOIN penzugy_ugyfelek u ON u.id = r.ugyfel_id
        LEFT JOIN users f ON f.id = r.user_id
        LEFT JOIN irodak i ON i.id = r.iroda_id
        LEFT JOIN penzugy_csomagok c ON c.id = r.csomag_id
        ${felt.length ? "WHERE " + felt.join(" AND ") : ""}
        ORDER BY r.created_at DESC, r.id DESC LIMIT 500`, p);

    const mn = pu.ma();
    const sorok = lista.rows.map(x => {
        pu.szamosit(x, ["ar", "szamla_brutto"]);
        x.esedekes = pu.pgDatum(x.esedekes);
        x.szamla_fizetve = pu.pgDatum(x.szamla_fizetve);
        x.lejart = x.statusz === "fizetesre_var" && x.esedekes && x.esedekes < mn;
        return x;
    });

    // Csomagonként: rendelések, fizetett, aktív előfizetők (bárhonnan – az admin
    // által felvett előfizetések is), bevétel (fizetett tételek, RON-ban), idén
    const evEleje = mn.slice(0, 5) + "01-01";
    const cs = await db.query(`
        SELECT c.id, c.nev, c.nev_ro, c.nev_en, c.kategoria, c.celcsoport, c.ar, c.penznem, c.idoszak, c.aktiv, c.nyilvanos,
               (SELECT COUNT(*) FROM penzugy_rendelesek r WHERE r.csomag_id = c.id AND r.statusz IN ('aktiv', 'teljesitve', 'lemondva'))::int AS rendelesek,
               (SELECT COUNT(*) FROM penzugy_rendelesek r WHERE r.csomag_id = c.id AND r.statusz IN ('aktiv', 'teljesitve'))::int AS fizetett,
               (SELECT COUNT(*) FROM penzugy_rendelesek r WHERE r.csomag_id = c.id AND r.statusz = 'fizetesre_var')::int AS fizetesre_var,
               (SELECT COUNT(*) FROM penzugy_rendelesek r WHERE r.csomag_id = c.id AND r.celcsoport = 'iroda' AND r.statusz IN ('aktiv', 'teljesitve', 'lemondva'))::int AS irodak,
               (SELECT COUNT(*) FROM penzugy_rendelesek r WHERE r.csomag_id = c.id AND r.celcsoport = 'maganszemely' AND r.statusz IN ('aktiv', 'teljesitve', 'lemondva'))::int AS maganszemelyek,
               (SELECT COUNT(*) FROM penzugy_elofizetesek e WHERE e.csomag_id = c.id AND e.statusz = 'aktiv' AND (e.vege IS NULL OR e.vege >= $1::date))::int AS aktiv_elofizetok
        FROM penzugy_csomagok c ORDER BY c.aktiv DESC, c.sorrend, c.id`, [mn]);

    const bev = await db.query(`
        SELECT t.csomag_id, s.penznem, SUM(t.brutto) AS ossz,
               SUM(t.brutto) FILTER (WHERE s.fizetve >= $1::date) AS iden
        FROM penzugy_tetelek t JOIN penzugy_szamlak s ON s.id = t.szamla_id
        WHERE s.statusz = 'fizetve' AND t.csomag_id IS NOT NULL
          -- egy vásárlás egyszer: a díjbekérő csak, ha nem lett belőle számla
          AND (s.tipus = 'szamla' OR NOT EXISTS (SELECT 1 FROM penzugy_szamlak x WHERE x.dijbekero_id = s.id AND x.statusz <> 'sztorno'))
        GROUP BY 1, 2`, [evEleje]);

    const ron = (v, pn) => pu.kerek(pn === "EUR" ? Number(v || 0) * (b.eur_arfolyam || 5) : Number(v || 0));
    const bevetel = {};
    bev.rows.forEach(x => {
        const o = bevetel[x.csomag_id] || (bevetel[x.csomag_id] = { ossz: 0, iden: 0 });
        o.ossz = pu.kerek(o.ossz + ron(x.ossz, x.penznem));
        o.iden = pu.kerek(o.iden + ron(x.iden, x.penznem));
    });

    const csomagok = cs.rows.map(c => ({
        ...c,
        ar: Number(c.ar),
        bevetel_ossz: (bevetel[c.id] || {}).ossz || 0,
        bevetel_iden: (bevetel[c.id] || {}).iden || 0
    }));

    // Havi rendelések (12 hónap)
    const ho12 = pu.honapHozzaad(mn.slice(0, 8) + "01", -11);
    const havi = await db.query(`
        SELECT to_char(created_at, 'YYYY-MM') AS ho, celcsoport, COUNT(*)::int AS db,
               COUNT(*) FILTER (WHERE statusz IN ('aktiv', 'teljesitve'))::int AS fizetett
        FROM penzugy_rendelesek WHERE created_at >= $1::date GROUP BY 1, 2`, [ho12]);
    const honapok = [];
    for (let i = 0; i < 12; i++) honapok.push(pu.honapHozzaad(ho12, i).slice(0, 7));
    const haviMap = Object.fromEntries(honapok.map(h => [h, { ho: h, maganszemely: 0, iroda: 0, fizetett: 0 }]));
    havi.rows.forEach(x => {
        const h = haviMap[x.ho];
        if (!h) return;
        h[x.celcsoport === "iroda" ? "iroda" : "maganszemely"] += x.db;
        h.fizetett += x.fizetett;
    });

    const osszes = sorok.length;
    return {
        rendelesek: sorok,
        csomagok,
        havi: honapok.map(h => haviMap[h]),
        osszesites: {
            osszes,
            fizetesre_var: sorok.filter(x => x.statusz === "fizetesre_var").length,
            lejart: sorok.filter(x => x.lejart).length,
            aktiv_elofizetok: csomagok.reduce((s, c) => s + c.aktiv_elofizetok, 0),
            bevetel_iden: pu.kerek(csomagok.reduce((s, c) => s + c.bevetel_iden, 0)),
            vevok: new Set(sorok.filter(x => ["aktiv", "teljesitve"].includes(x.statusz)).map(x => x.ugyfel_id)).size
        }
    };

}

module.exports = {
    RENDELES_STATUSZOK,
    arlista, rendel, sajat, sajatSzamla, lemond, visszavon, adminLista, vezetettIrodak, fizetesiAdatok
};
