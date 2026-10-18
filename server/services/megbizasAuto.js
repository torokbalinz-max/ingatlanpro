// ============================================================
//  Megbízások – időzített automatizmusok (15 percenként fut)
//
//   1. Emlékeztető az eladónak, ha egy neki továbbított ajánlatra
//      X órája nem válaszolt (Beállítások: auto_elado_emlekezteto).
//   2. Megtekintés előtt 24 órával: emlékeztető a vevőnek, az eladónak
//      és a bemutatónak; 2 órával előtte még egyszer a vevőnek és a
//      bemutatónak.
//   3. Megtekintés után: ha a bemutató 3 óra múlva sem zárta le
//      (megtörtént / elmaradt), emlékeztető neki. (A vevő „hogy
//      tetszett – tegyél ajánlatot” levele a lezáráskor megy ki.)
//   4. Lejárt ajánlatok: az érvényességi idő után „lejárt”, a vevő és a
//      csapat értesítést kap.
//   5. A kapuk: ha egy megbízásnál teljesül a feltétel, továbblép
//      (pl. a régi adatoknál, vagy ha valami kívülről változott).
//
//  Mindegyik csak egyszer megy ki (emlekeztetve, emlekeztetve2,
//  visszajelzes_kerve). E-mail nélkül is lefut (a jelölések miatt),
//  a levél csak kimarad.
// ============================================================

const db = require("../db/database");
const mb = require("./megbizas");
const level = require("./megbizasLevel");

let fut = false;

async function futtat() {

    if (fut) return null;
    // kikapcsolt értékesítés: nincs automatikus levél / emlékeztető
    try { if (!(await require("./funkciok").ertekesites())) return null; } catch (e) { /* megy tovább */ }
    fut = true;
    const ered = { elado: 0, elotte: 0, elotte2: 0, lezaratlan: 0, lejart: 0, lepes: 0 };

    try {

        const be = await mb.beallitas();

        // 1) Az eladó nem válaszolt
        const ora = Number(be.auto_elado_emlekezteto) || 0;
        if (ora > 0) {
            const r = await db.query(`
                UPDATE megbizas_ajanlatok a SET emlekeztetve = NOW()
                FROM megbizasok m
                WHERE m.id = a.megbizas_id AND a.statusz = 'tovabbitva' AND a.emlekeztetve IS NULL
                  AND a.tovabbitva_at < NOW() - ($1::text || ' hours')::interval
                  AND m.statusz NOT IN ('eladva', 'lezarva', 'elutasitva')
                RETURNING a.osszeg, a.penznem, a.ervenyes_ig, m.*`, [String(ora)]);
            for (const x of r.rows) {
                level.eladonak(null, x, `Emlékeztető: ajánlat vár a válaszodra / Reamintire: o ofertă așteaptă răspunsul tău (${x.szerzodes_szam})`, [
                    `Vételi ajánlat: ${level.penz(x.osszeg, x.penznem)} – ${level.hely(x)}${x.ervenyes_ig ? ` – érvényes: ${level.idoSzoveg(x.ervenyes_ig)}` : ""}`,
                    "Az „Ingatlanom eladása” oldalon egy kattintással elfogadhatod, elutasíthatod, vagy ellenajánlatot tehetsz.",
                    "Pe pagina „Vânzarea proprietății mele” poți accepta, refuza sau face o contraofertă cu un singur clic."
                ]);
                ered.elado++;
            }
        }

        if (be.auto_megtekintes_emlekezteto) {

            // 2a) 24 órával előtte
            const r = await db.query(`
                UPDATE megbizas_megtekintesek t SET emlekeztetve = NOW()
                FROM megbizasok m
                WHERE m.id = t.megbizas_id AND t.statusz = 'egyeztetve' AND t.emlekeztetve IS NULL
                  AND t.idopont BETWEEN NOW() + INTERVAL '3 hours' AND NOW() + INTERVAL '24 hours'
                  AND m.statusz NOT IN ('eladva', 'lezarva', 'elutasitva')
                RETURNING t.idopont, t.erdeklodo_id, COALESCE(t.bemutato_id, m.bemutato_id) AS bemutato, m.*`);
            for (const x of r.rows) {
                const ido = level.idoSzoveg(x.idopont);
                const e = x.erdeklodo_id ? (await db.query("SELECT nev, email, telefon FROM megbizas_erdeklodok WHERE id = $1", [x.erdeklodo_id])).rows[0] : null;
                level.vevonek(null, x, e, `Emlékeztető: megtekintés ${ido} / Reamintire: vizionare ${ido}`, [
                    `Várunk: ${level.hely(x)} – ${ido}.`,
                    "Ha mégsem érsz rá, a hirdetés oldalán lemondhatod, vagy írj nekünk.",
                    `Te așteptăm: ${level.hely(x)} – ${ido}. Dacă nu poți ajunge, anulează pe pagina anunțului sau scrie-ne.`
                ]);
                level.eladonak(null, x, `Megtekintés: ${ido} / Vizionare: ${ido}`, [
                    `Egy érdeklődő megnézi az ingatlant: ${ido}.`,
                    `Un cumpărător interesat vine la vizionare: ${ido}.`
                ]);
                if (x.bemutato) level.munkatarsnak(null, x.bemutato, `Bemutatás: ${ido} – ${level.hely(x)}`, [
                    `Megtekintés: ${ido}`, `Cím: ${level.hely(x)}`,
                    e ? `Vevő: ${e.nev || "–"} ${e.telefon || ""}` : ""
                ], "/#admin/naptar");
                ered.elotte++;
            }

            // 2b) 2 órával előtte (a vevőnek és a bemutatónak)
            const r2 = await db.query(`
                UPDATE megbizas_megtekintesek t SET emlekeztetve2 = NOW()
                FROM megbizasok m
                WHERE m.id = t.megbizas_id AND t.statusz = 'egyeztetve' AND t.emlekeztetve2 IS NULL
                  AND t.idopont BETWEEN NOW() AND NOW() + INTERVAL '2 hours'
                  AND m.statusz NOT IN ('eladva', 'lezarva', 'elutasitva')
                RETURNING t.idopont, t.erdeklodo_id, COALESCE(t.bemutato_id, m.bemutato_id) AS bemutato, m.*`);
            for (const x of r2.rows) {
                const ido = level.idoSzoveg(x.idopont);
                const e = x.erdeklodo_id ? (await db.query("SELECT nev, email, telefon FROM megbizas_erdeklodok WHERE id = $1", [x.erdeklodo_id])).rows[0] : null;
                level.vevonek(null, x, e, `Hamarosan: megtekintés ${ido} / În curând: vizionare ${ido}`, [
                    `Két órán belül várunk: ${level.hely(x)} – ${ido}.`,
                    `Te așteptăm în cel mult două ore: ${level.hely(x)} – ${ido}.`
                ]);
                if (x.bemutato) level.munkatarsnak(null, x.bemutato, `Két órán belül: ${ido} – ${level.hely(x)}`, [
                    `Cím: ${level.hely(x)}`, e ? `Vevő: ${e.nev || "–"} ${e.telefon || ""}` : ""
                ], "/#admin/naptar");
                ered.elotte2++;
            }
        }

        // 3) Lezáratlan megtekintés: a bemutató (vagy a felelős) emlékeztetése
        const r3 = await db.query(`
            UPDATE megbizas_megtekintesek t SET visszajelzes_kerve = NOW()
            FROM megbizasok m
            WHERE m.id = t.megbizas_id AND t.statusz = 'egyeztetve' AND t.visszajelzes_kerve IS NULL
              AND t.idopont BETWEEN NOW() - INTERVAL '7 days' AND NOW() - INTERVAL '3 hours'
              AND m.statusz NOT IN ('eladva', 'lezarva', 'elutasitva')
            RETURNING t.idopont, COALESCE(t.bemutato_id, m.bemutato_id, m.felelos_id) AS kinek, m.*`);
        for (const x of r3.rows) {
            const ido = level.idoSzoveg(x.idopont);
            if (x.kinek) level.munkatarsnak(null, x.kinek, `Lezáratlan megtekintés: ${ido} – ${level.hely(x)}`, [
                "Jelöld a naptárban, hogy megtörtént-e (és írj egy rövid jegyzetet) – a vevő csak ezután tehet ajánlatot."
            ], "/#admin/naptar");
            else level.csapatnak(null, x, `Lezáratlan megtekintés: ${ido}`, ["Jelöld, hogy megtörtént-e."], "megtekintesek");
            ered.lezaratlan++;
        }

        // 4) Lejárt ajánlatok
        const r4 = await db.query(`
            UPDATE megbizas_ajanlatok a SET statusz = 'lejart', updated_at = NOW()
            FROM megbizasok m
            WHERE m.id = a.megbizas_id AND a.statusz IN ('uj', 'tovabbitva') AND a.ervenyes_ig IS NOT NULL AND a.ervenyes_ig < NOW()
            RETURNING a.osszeg, a.penznem, a.erdeklodo_id, a.tovabbitva_at, a.id AS ajanlat_id, m.*`);
        for (const x of r4.rows) {
            await mb.naploIr(x.id, "ajanlat", `Lejárt egy ajánlat: ${x.osszeg} ${x.penznem}`, !!x.tovabbitva_at, null);
            const e = x.erdeklodo_id ? (await db.query("SELECT nev, email FROM megbizas_erdeklodok WHERE id = $1", [x.erdeklodo_id])).rows[0] : null;
            level.vevonek(null, x, e, "Lejárt az ajánlatod / Oferta ta a expirat", [
                `A ${level.penz(x.osszeg, x.penznem)} összegű ajánlatod érvényessége lejárt, az eladó addig nem fogadta el.`,
                "Ha még érdekel, a hirdetés oldalán új ajánlatot tehetsz.",
                "Oferta ta a expirat fără să fie acceptată. Dacă te interesează încă, poți face o ofertă nouă pe pagina anunțului."
            ]);
            level.csapatnak(null, x, `Lejárt ajánlat (${x.szerzodes_szam})`, [`${level.penz(x.osszeg, x.penznem)} – ${e ? e.nev : ""}`], "vevok");
            ered.lejart++;
        }

        // 5) A kapuk: minden aktív megbízás
        const akt = await db.query("SELECT id FROM megbizasok WHERE statusz IN ('uj', 'egyeztetes', 'szerzodes', 'fotozas', 'hirdetes', 'targyalas')");
        for (const x of akt.rows) {
            const l = await mb.elorelep(x.id, null).catch(() => null);
            if (l && (l.lepesek.length || l.lezart)) {
                ered.lepes += l.lepesek.length;
                const m = (await db.query("SELECT * FROM megbizasok WHERE id = $1", [x.id])).rows[0];
                await level.lepesErtesit(null, m, l);
            }
        }

    } catch (e) {
        console.error("Megbízás automatizmus:", e.message);
    } finally {
        fut = false;
    }

    if (Object.values(ered).some(Boolean)) {
        console.log(`Megbízások: ${ered.elado} eladói emlékeztető, ${ered.elotte} + ${ered.elotte2} megtekintés előtti, ${ered.lezaratlan} lezáratlan, ${ered.lejart} lejárt ajánlat, ${ered.lepes} szakaszváltás.`);
    }
    return ered;

}

module.exports = { futtat };
