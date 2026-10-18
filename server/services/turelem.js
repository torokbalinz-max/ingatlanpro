// ============================================================
//  Lejárt csomag: türelmi idő a hirdetéseknek
//
//  Ha valakinek a csomagja lejár (nem fizette ki a megújítást, vagy lemondta),
//  és emiatt több aktív hirdetése van, mint amennyi a csomag nélkül járna
//  (Pénzügy → Beállítások → ingyenes hirdetések), a hirdetései NEM tűnnek el
//  azonnal – egy ingatlan általában nem kel el egy hónap alatt:
//
//    1. a lejáratkor e-mailt kap: X napig (alap: 30) minden hirdetése fent
//       marad, de újat nem tölthet fel; ha addig megújítja, minden marad
//    2. a türelmi idő vége előtt (alap: 7 nappal) emlékeztető
//    3. a türelmi idő végén a keret feletti hirdetések archiválódnak
//       (a legújabbak maradnak fent, a régebbiek kerülnek archívumba – nem
//       vesznek el), és erről is e-mailt kap
//    4. ha később újra előfizet, az így archivált hirdetései maguktól
//       visszakerülnek (amennyit az új csomag enged)
//
//  A csomag lejárta előtt (alap: 7 nappal) is kap értesítőt: a megújításkor
//  a díjbekérős levélben (penzugy.megujitasRendeles), lemondott csomagnál
//  innen.
//
//  Beállítás: Admin → Pénzügy → Beállítások → Korlátok (lejarat_turelem_nap,
//  lejarat_figyelmeztet_nap). Csak akkor fut, ha a korlátok be vannak kapcsolva.
//  Naponta fut (penzugy.napi).
// ============================================================

const db = require("../db/database");
const pu = require("./penzugy");

let kesz = false;
async function tablak() {
    if (kesz) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS csomag_turelem (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            iroda_id INTEGER REFERENCES irodak(id) ON DELETE CASCADE,
            kezdet DATE NOT NULL,
            vege DATE NOT NULL,
            keret INTEGER,
            db INTEGER,
            ertesitve_kezdet TIMESTAMP,
            ertesitve_figyelmeztet TIMESTAMP,
            lezarva TIMESTAMP,
            eredmeny TEXT,
            archivalt INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW()
        )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_csomag_turelem_nyitott ON csomag_turelem (user_id, iroda_id) WHERE lezarva IS NULL`);
    await db.query(`ALTER TABLE ingatlanok ADD COLUMN IF NOT EXISTS csomag_archivalva TIMESTAMP`);
    await db.query(`ALTER TABLE penzugy_elofizetesek ADD COLUMN IF NOT EXISTS lejarat_ertesitve TIMESTAMP`);
    kesz = true;
}

// ---------- kinek írunk ----------

async function cimzettek(userId, irodaId) {
    if (userId) {
        const r = await db.query("SELECT email, COALESCE(nev, felhasznalonev) AS nev FROM users WHERE id = $1", [userId]);
        return r.rows.filter(x => x.email);
    }
    const r = await db.query(`
        SELECT DISTINCT u.email, COALESCE(u.nev, u.felhasznalonev) AS nev FROM iroda_tagok t JOIN users u ON u.id = t.user_id
        WHERE t.iroda_id = $1 AND t.szerep = 'vezeto' AND COALESCE(t.statusz, 'aktiv') = 'aktiv' AND u.email IS NOT NULL`, [irodaId]);
    if (r.rowCount) return r.rows;
    const i = await db.query("SELECT email, nev FROM irodak WHERE id = $1 AND email IS NOT NULL", [irodaId]);
    return i.rows;
}

async function level(userId, irodaId, { cim, sorok, gomb, link }) {
    const mail = require("./mail");
    if (!mail.elerheto()) return false;
    const lista = await cimzettek(userId, irodaId);
    let ok = false;
    for (const c of lista) {
        const t = mail.sablon({ cim, sorok: [`Kedves ${c.nev || "Felhasználó"}! / Bună ziua!`, ...sorok], gomb, link: link || mail.oldalCim() + "/#fiok/csomag" });
        if (await mail.kuld({ to: c.email, subject: cim, html: t.html, text: t.text })) ok = true;
    }
    return ok;
}

const fmt = d => { const [y, m, n] = String(d).slice(0, 10).split("-"); return `${n}.${m}.${y}`; };

// ---------- aki most a keret felett van ----------

async function tullepok(b) {
    const ki = [];
    // magánszemélyek (az iroda nélküli hirdetéseik)
    const m = await db.query(`
        SELECT i.owner_id AS user_id, COUNT(*)::int AS db
        FROM ingatlanok i JOIN users u ON u.id = i.owner_id
        WHERE i.iroda_id IS NULL AND i.statusz IN ('aktiv', 'fuggo') AND COALESCE(u.szerep, 'user') <> 'admin'
        GROUP BY i.owner_id HAVING COUNT(*) > $1`, [b.ingyenes_hirdetes || 0]);
    for (const x of m.rows) {
        const j = await pu.jogosultsag(x.user_id);
        const keret = j ? j.hirdetes_limit : b.ingyenes_hirdetes;
        if (keret !== null && x.db > keret) ki.push({ user_id: x.user_id, iroda_id: null, db: x.db, keret });
    }
    // irodák
    const i = await db.query(`
        SELECT iroda_id, COUNT(*)::int AS db FROM ingatlanok
        WHERE iroda_id IS NOT NULL AND statusz IN ('aktiv', 'fuggo')
        GROUP BY iroda_id HAVING COUNT(*) > $1`, [b.iroda_ingyenes_hirdetes || 0]);
    for (const x of i.rows) {
        const j = await pu.irodaJogosultsag(x.iroda_id);
        const keret = j.hirdetes_limit;
        if (keret !== null && x.db > keret) ki.push({ user_id: null, iroda_id: x.iroda_id, db: x.db, keret });
    }
    return ki;
}

const kulcs = x => (x.user_id ? "u" + x.user_id : "i" + x.iroda_id);

// ---------- a keret feletti hirdetések archiválása (a legújabbak maradnak) ----------

async function archival(x, keret) {
    const r = x.user_id
        ? await db.query(`SELECT id FROM ingatlanok WHERE owner_id = $1 AND iroda_id IS NULL AND statusz IN ('aktiv', 'fuggo')
                          ORDER BY created_at DESC NULLS LAST, id DESC OFFSET $2`, [x.user_id, Math.max(0, keret)])
        : await db.query(`SELECT id FROM ingatlanok WHERE iroda_id = $1 AND statusz IN ('aktiv', 'fuggo')
                          ORDER BY created_at DESC NULLS LAST, id DESC OFFSET $2`, [x.iroda_id, Math.max(0, keret)]);
    const ids = r.rows.map(y => y.id);
    if (ids.length) {
        await db.query(`UPDATE ingatlanok SET statusz = 'archiv', csomag_archivalva = NOW(), updated_at = NOW() WHERE id = ANY($1::int[])`, [ids]);
    }
    return ids.length;
}

// ---------- napi futás ----------

async function futtat() {
    try {
        await tablak();
        const b = await pu.beallitas();
        await lejaratElott(b).catch(e => console.error("Csomag lejárat előtti értesítő:", e.message));
        if (!b.korlatok_be) return;

        const nap = Math.max(0, Number(b.lejarat_turelem_nap ?? 30));
        const figy = Math.max(0, Number(b.lejarat_figyelmeztet_nap ?? 7));
        const ma = pu.ma();

        const most = await tullepok(b);
        const mostMap = new Map(most.map(x => [kulcs(x), x]));

        const ny = await db.query("SELECT * FROM csomag_turelem WHERE lezarva IS NULL");
        const nyitott = new Map(ny.rows.map(x => [kulcs(x), x]));

        // 1) rendeződött (megújította, vagy maga levette a hirdetéseit) → lezárjuk
        for (const [k, t] of nyitott) {
            if (!mostMap.has(k)) {
                await db.query("UPDATE csomag_turelem SET lezarva = NOW(), eredmeny = 'rendezve' WHERE id = $1", [t.id]);
                nyitott.delete(k);
            }
        }

        for (const [k, x] of mostMap) {
            const t = nyitott.get(k);

            // 2) új túllépés → türelmi idő indul (0 nap: rögtön archiválunk)
            if (!t) {
                const vege = pu.napHozzaad(ma, nap);
                const r = await db.query(`
                    INSERT INTO csomag_turelem (user_id, iroda_id, kezdet, vege, keret, db) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
                    [x.user_id, x.iroda_id, ma, vege, x.keret, x.db]);
                if (nap > 0) {
                    const ok = await level(x.user_id, x.iroda_id, {
                        cim: "A csomagod lejárt – a hirdetéseid még fent vannak / Pachetul a expirat",
                        sorok: [
                            `A csomagod lejárt. Most ${x.db} aktív hirdetésed van, a csomag nélkül ${x.keret} járna.`,
                            `Nem töröljük őket azonnal: ${fmt(vege)}-ig mind fent marad, de addig új hirdetést nem tölthetsz fel.`,
                            `Ha addig megújítod (vagy másik csomagot veszel), minden marad. Ha nem, ${fmt(vege)} után a ${x.keret} legújabb marad fent, a többi archívumba kerül (nem vész el – újra előfizetve visszajönnek).`,
                            `Pachetul tău a expirat. Ai ${x.db} anunțuri active, fără pachet ai dreptul la ${x.keret}. Până la ${fmt(vege)} toate rămân online, dar nu poți adăuga anunțuri noi. Dacă nu reînnoiești, după ${fmt(vege)} rămân online cele mai noi ${x.keret}, restul se arhivează.`
                        ],
                        gomb: "Csomag megújítása / Reînnoiește"
                    }).catch(() => false);
                    if (ok) await db.query("UPDATE csomag_turelem SET ertesitve_kezdet = NOW() WHERE id = $1", [r.rows[0].id]);
                    continue;
                }
                nyitott.set(k, r.rows[0]);
            }

            const tt = nyitott.get(k);
            const vege = pu.pgDatum(tt.vege);

            // 3) türelmi idő vége előtt: emlékeztető (egyszer)
            if (vege > ma && !tt.ertesitve_figyelmeztet && pu.napHozzaad(ma, figy) >= vege) {
                const ok = await level(x.user_id, x.iroda_id, {
                    cim: `Emlékeztető: ${fmt(vege)} után archiváljuk a hirdetéseid egy részét / Reamintire`,
                    sorok: [
                        `A csomagod lejárt, és ${x.db} aktív hirdetésedből csak ${x.keret} maradhat fent csomag nélkül.`,
                        `${fmt(vege)} után a ${x.keret} legújabb marad fent, a többi (${x.db - x.keret} db) archívumba kerül.`,
                        "Ha szeretnéd, hogy mind fent maradjon, újítsd meg a csomagod most. Azt is megteheted, hogy te magad archiválod azokat, amelyekre már nincs szükség – így te döntöd el, melyik maradjon.",
                        `După ${fmt(vege)} rămân online doar cele mai noi ${x.keret} anunțuri, restul (${x.db - x.keret}) se arhivează. Reînnoiește pachetul ca să rămână toate online.`
                    ],
                    gomb: "Csomag megújítása / Reînnoiește"
                }).catch(() => false);
                if (ok || !require("./mail").elerheto()) await db.query("UPDATE csomag_turelem SET ertesitve_figyelmeztet = NOW() WHERE id = $1", [tt.id]);
                continue;
            }

            // 4) lejárt a türelmi idő → archiválás
            if (vege <= ma) {
                const n = await archival(x, x.keret);
                await db.query("UPDATE csomag_turelem SET lezarva = NOW(), eredmeny = 'archivalva', archivalt = $2 WHERE id = $1", [tt.id, n]);
                if (n) {
                    console.log(`Csomag türelmi idő lejárt (${k}): ${n} hirdetés archiválva.`);
                    await level(x.user_id, x.iroda_id, {
                        cim: `${n} hirdetésed archívumba került / ${n} anunțuri arhivate`,
                        sorok: [
                            `A csomagod lejárt, a türelmi idő is véget ért, ezért ${n} hirdetésed archívumba került (a ${x.keret} legújabb fent maradt).`,
                            "Nem vesztek el: ha újra előfizetsz, maguktól visszakerülnek az oldalra (amennyit az új csomag enged).",
                            `Pachetul a expirat și perioada de grație s-a încheiat: ${n} anunțuri au fost arhivate (cele mai noi ${x.keret} au rămas online). La reabonare revin automat.`
                        ],
                        gomb: "Csomagok / Pachete",
                        link: require("./mail").oldalCim() + "/#csomagok"
                    }).catch(() => false);
                }
            }
        }
    } catch (e) {
        console.error("Csomag türelmi idő:", e.message);
    }
}

// ---------- lemondott csomag: értesítő a lejárat előtt ----------
// (a megújuló csomagnál a megújítási díjbekérő levele szól előre)
async function lejaratElott(b) {
    const figy = Math.max(1, Number(b.lejarat_figyelmeztet_nap ?? 7));
    const nap = Math.max(0, Number(b.lejarat_turelem_nap ?? 30));
    const ma = pu.ma();
    const r = await db.query(`
        SELECT e.id, e.megnevezes, e.vege, u.user_id, u.iroda_id, c.jogosultsag
        FROM penzugy_elofizetesek e
        JOIN penzugy_ugyfelek u ON u.id = e.ugyfel_id
        LEFT JOIN penzugy_csomagok c ON c.id = e.csomag_id
        WHERE e.statusz = 'aktiv' AND e.vege IS NOT NULL AND e.vege >= $1::date AND e.vege <= $2::date
          AND e.lejarat_ertesitve IS NULL AND e.reklam_id IS NULL
          AND EXISTS (SELECT 1 FROM penzugy_rendelesek r WHERE r.elofizetes_id = e.id)`, [ma, pu.napHozzaad(ma, figy)]);
    for (const e of r.rows) {
        const j = e.jogosultsag || {};
        const hirdetes = b.korlatok_be && (j.hirdetes_limit !== undefined || j.hirdetes_plusz || j.korlatlan_hirdetes);
        const vege = pu.pgDatum(e.vege);
        const ok = await level(e.user_id, e.iroda_id, {
            cim: `A csomagod ${fmt(vege)}-én lejár / Pachetul expiră`,
            sorok: [
                `A(z) „${e.megnevezes}” csomagod ${fmt(vege)}-én lejár (lemondtad, ezért nem újul meg magától).`,
                hirdetes ? `Ha nem hosszabbítod meg, a lejárat után még ${nap} napig minden hirdetésed fent marad (új hirdetést addig nem tölthetsz fel), utána a csomag nélküli keret feletti hirdetések archiválódnak.` : "",
                "Ha szeretnéd tovább használni, a Csomagok oldalon egy kattintással újra megrendelheted.",
                `Pachetul „${e.megnevezes}” expiră la ${fmt(vege)}.${hirdetes ? ` După expirare, anunțurile rămân online încă ${nap} zile, apoi cele peste limita gratuită se arhivează.` : ""}`
            ].filter(Boolean),
            gomb: "Csomagok / Pachete",
            link: require("./mail").oldalCim() + "/#csomagok"
        }).catch(() => false);
        if (ok || !require("./mail").elerheto()) await db.query("UPDATE penzugy_elofizetesek SET lejarat_ertesitve = NOW() WHERE id = $1", [e.id]);
    }
}

// ---------- újra előfizetett: az archivált hirdetések vissza ----------

async function visszaallit({ user_id, iroda_id }) {
    try {
        await tablak();
        const b = await pu.beallitas();
        let keret, aktiv, lista;
        if (iroda_id) {
            keret = (await pu.irodaJogosultsag(iroda_id)).hirdetes_limit;
            aktiv = (await db.query("SELECT COUNT(*)::int AS n FROM ingatlanok WHERE iroda_id = $1 AND statusz IN ('aktiv', 'fuggo')", [iroda_id])).rows[0].n;
            lista = await db.query("SELECT id FROM ingatlanok WHERE iroda_id = $1 AND statusz = 'archiv' AND csomag_archivalva IS NOT NULL ORDER BY created_at DESC NULLS LAST, id DESC", [iroda_id]);
        } else if (user_id) {
            const j = await pu.jogosultsag(user_id);
            keret = j ? j.hirdetes_limit : b.ingyenes_hirdetes;
            aktiv = (await db.query("SELECT COUNT(*)::int AS n FROM ingatlanok WHERE owner_id = $1 AND iroda_id IS NULL AND statusz IN ('aktiv', 'fuggo')", [user_id])).rows[0].n;
            lista = await db.query("SELECT id FROM ingatlanok WHERE owner_id = $1 AND iroda_id IS NULL AND statusz = 'archiv' AND csomag_archivalva IS NOT NULL ORDER BY created_at DESC NULLS LAST, id DESC", [user_id]);
        } else return 0;
        const hely = keret === null || !b.korlatok_be ? lista.rowCount : Math.max(0, keret - aktiv);
        const ids = lista.rows.slice(0, hely).map(x => x.id);
        if (ids.length) {
            await db.query("UPDATE ingatlanok SET statusz = 'aktiv', csomag_archivalva = NULL, updated_at = NOW() WHERE id = ANY($1::int[])", [ids]);
            console.log(`Csomag: ${ids.length} archivált hirdetés visszaállítva (${iroda_id ? "iroda " + iroda_id : "user " + user_id}).`);
        }
        return ids.length;
    } catch (e) {
        console.error("Hirdetések visszaállítása:", e.message);
        return 0;
    }
}

// Amikor egy csomag kifizetett lett: a lejárat miatt archivált hirdetések vissza
pu.rendelesFigyelo(async x => {
    if (!["aktiv", "teljesitve"].includes(x.statusz) || x.elozo !== "fizetesre_var") return;
    // a jogok frissüljenek (a szinkron után)
    setTimeout(() => visszaallit({ user_id: x.iroda_id ? null : x.user_id, iroda_id: x.iroda_id }).catch(() => { }), 1500);
});

// ---------- admin: kik vannak most türelmi időben ----------

async function adminLista() {
    await tablak();
    const r = await db.query(`
        SELECT t.*, COALESCE(u.nev, u.felhasznalonev, u.email) AS user_nev, u.email AS user_email, i.nev AS iroda_nev
        FROM csomag_turelem t
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN irodak i ON i.id = t.iroda_id
        WHERE t.lezarva IS NULL OR t.lezarva > NOW() - INTERVAL '30 days'
        ORDER BY (t.lezarva IS NULL) DESC, t.vege, t.id DESC LIMIT 200`);
    return r.rows.map(x => ({ ...x, kezdet: pu.pgDatum(x.kezdet), vege: pu.pgDatum(x.vege) }));
}

module.exports = { futtat, visszaallit, adminLista, tablak };
