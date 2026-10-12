// ============================================================
//  Megbízások – időzített automatizmusok (óránként fut)
//
//   1. Emlékeztető az eladónak, ha egy neki továbbított ajánlatra
//      X órája nem válaszolt (Beállítások: auto_elado_emlekezteto).
//   2. Megtekintés előtt (24 órán belül): emlékeztető a vevőnek, az
//      eladónak és a bemutatónak.
//   3. Megtekintés után (3 óra múlva): „Hogy tetszett? Kérdezz vagy
//      tegyél ajánlatot” levél a vevőnek.
//
//  Mindegyik csak egyszer megy ki (emlekeztetve / visszajelzes_kerve).
//  E-mail nélkül is lefut (a jelölések miatt), a levél csak kimarad.
// ============================================================

const db = require("../db/database");
const mb = require("./megbizas");
const level = require("./megbizasLevel");

let fut = false;

async function futtat() {

    if (fut) return null;
    fut = true;
    const ered = { elado: 0, elotte: 0, utana: 0 };

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
                RETURNING a.osszeg, a.penznem, m.*`, [String(ora)]);
            for (const x of r.rows) {
                level.eladonak(null, x, `Emlékeztető: ajánlat vár a válaszodra / Reamintire: o ofertă așteaptă răspunsul tău (${x.szerzodes_szam})`, [
                    `Vételi ajánlat: ${level.penz(x.osszeg, x.penznem)} – ${level.hely(x)}`,
                    "A fiókodban egy kattintással elfogadhatod, elutasíthatod, vagy ellenajánlatot tehetsz.",
                    "În cont poți accepta, refuza sau face o contraofertă cu un singur clic."
                ]);
                ered.elado++;
            }
        }

        // 2) Megtekintés előtt
        if (be.auto_megtekintes_emlekezteto) {
            const r = await db.query(`
                UPDATE megbizas_megtekintesek t SET emlekeztetve = NOW()
                FROM megbizasok m
                WHERE m.id = t.megbizas_id AND t.statusz = 'egyeztetve' AND t.emlekeztetve IS NULL
                  AND t.idopont BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
                  AND m.statusz NOT IN ('eladva', 'lezarva', 'elutasitva')
                RETURNING t.idopont, t.erdeklodo_id, COALESCE(t.bemutato_id, m.bemutato_id) AS bemutato, m.*`);
            for (const x of r.rows) {
                const ido = level.idoSzoveg(x.idopont);
                const e = x.erdeklodo_id ? (await db.query("SELECT nev, email FROM megbizas_erdeklodok WHERE id = $1", [x.erdeklodo_id])).rows[0] : null;
                level.vevonek(null, x, e, `Emlékeztető: megtekintés ${ido} / Reamintire: vizionare ${ido}`, [
                    `Holnap (24 órán belül) várunk: ${level.hely(x)} – ${ido}.`,
                    "Ha mégsem érsz rá, a hirdetés oldalán lemondhatod, vagy írj nekünk.",
                    `Te așteptăm (în 24 de ore): ${level.hely(x)} – ${ido}. Dacă nu poți ajunge, anulează pe pagina anunțului sau scrie-ne.`
                ]);
                level.eladonak(null, x, `Megtekintés: ${ido} / Vizionare: ${ido}`, [
                    `Egy érdeklődő megnézi az ingatlant: ${ido}.`,
                    `Un cumpărător interesat vine la vizionare: ${ido}.`
                ]);
                if (x.bemutato) level.munkatarsnak(null, x.bemutato, `Bemutatás: ${ido} – ${level.hely(x)}`, [
                    `Megtekintés: ${ido}`, `Cím: ${level.hely(x)}`,
                    e ? `Vevő: ${e.nev || "–"}` : ""
                ], "/#munka/megtekintesek");
                ered.elotte++;
            }
        }

        // 3) Megtekintés után: visszajelzés, ajánlat
        if (be.auto_visszajelzes) {
            const r = await db.query(`
                UPDATE megbizas_megtekintesek t SET visszajelzes_kerve = NOW()
                FROM megbizasok m
                WHERE m.id = t.megbizas_id AND t.statusz IN ('egyeztetve', 'megtortent') AND t.visszajelzes_kerve IS NULL
                  AND t.idopont BETWEEN NOW() - INTERVAL '7 days' AND NOW() - INTERVAL '3 hours'
                  AND m.statusz IN ('hirdetes', 'targyalas', 'fotozas', 'szerzodes')
                RETURNING t.erdeklodo_id, m.*`);
            for (const x of r.rows) {
                const e = x.erdeklodo_id ? (await db.query("SELECT nev, email FROM megbizas_erdeklodok WHERE id = $1", [x.erdeklodo_id])).rows[0] : null;
                level.vevonek(null, x, e, "Hogy tetszett az ingatlan? / Cum ți s-a părut proprietatea?", [
                    `Köszönjük, hogy megnézted: ${level.hely(x)}.`,
                    "Ha kérdésed van, írj nekünk a hirdetés oldalán – ha tetszett, ott tehetsz vételi ajánlatot is.",
                    "Mulțumim că ai venit la vizionare. Dacă ai întrebări, scrie-ne pe pagina anunțului – tot acolo poți face și o ofertă."
                ]);
                ered.utana++;
            }
        }

    } catch (e) {
        console.error("Megbízás automatizmus:", e.message);
    } finally {
        fut = false;
    }

    if (ered.elado || ered.elotte || ered.utana) console.log(`Megbízások: ${ered.elado} eladói emlékeztető, ${ered.elotte} megtekintés előtti, ${ered.utana} utáni levél.`);
    return ered;

}

module.exports = { futtat };
