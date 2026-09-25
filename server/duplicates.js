// ============================================================
//  Duplikált hirdetések keresése, törlése, összevonása
// ============================================================

const db = require("./database");
const { normLink } = require("./listing");

function emeletSzam(e) {
    const n = parseInt(String(e || "").split("/")[0], 10);
    return isNaN(n) ? "" : n;
}

async function keres() {

    const r = await db.query(`
        SELECT i.id, i.link, i.ar, i.nm, i.szobak, i.emelet, i.allapot, i.varos, i.kerulet,
               i.tipus, i.ugylet, i.cim, i.created_at, i.tovabbi_linkek,
               (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id)::int AS kep_db,
               EXISTS (SELECT 1 FROM favorites f WHERE f.property_id = i.id) AS kedvenc
        FROM ingatlanok i
        ORDER BY i.id
    `);

    const rows = r.rows;

    // 1) Biztos duplikátum: ugyanaz a link
    const linkCsoport = new Map();

    rows.forEach(i => {
        const k = normLink(i.link);
        if (!k) return;
        if (!linkCsoport.has(k)) linkCsoport.set(k, []);
        linkCsoport.get(k).push(i);
    });

    const biztos = [...linkCsoport.values()].filter(g => g.length > 1);

    const biztosFelesleges = new Set();
    biztos.forEach(g => g.slice(1).forEach(i => biztosFelesleges.add(i.id)));

    // 2) Valószínű duplikátum: más link (más oldal), de ugyanazok az adatok
    const adatCsoport = new Map();

    rows.filter(i => !biztosFelesleges.has(i.id) && i.ar > 0 && i.nm > 0).forEach(i => {
        const k = [
            i.varos, i.tipus, i.ugylet,
            Math.round(i.ar / 500),
            Math.round(i.nm),
            i.szobak || "",
            emeletSzam(i.emelet)
        ].join("|");
        if (!adatCsoport.has(k)) adatCsoport.set(k, []);
        adatCsoport.get(k).push(i);
    });

    const valoszinu = [...adatCsoport.values()].filter(g => {
        if (g.length < 2) return false;
        // ha minden tagnak ugyanaz a linkje, az már az 1. csoportban van
        return new Set(g.map(i => normLink(i.link) || "id" + i.id)).size > 1;
    });

    // Hibás / hiányos alapadatok (pl. elcsúszott Excel-oszlopok)
    const hibas = rows.filter(i =>
        !(i.ar > 0) || !(i.nm > 0) ||
        (i.ugylet !== "kiado" && i.ar < 3000) ||
        (i.link && !normLink(i.link))
    );

    return {
        hibas,
        biztos: biztos.map(g => ({ megtart: g[0].id, tagok: g })),
        biztosFelesleges: biztosFelesleges.size,
        valoszinu: valoszinu.map(g => ({ tagok: g }))
    };

}

// A kedvencek, képek átmentése a megtartott hirdetésre, majd törlés
async function athelyezEsTorol(client, megtart, torlendo) {

    if (!torlendo.length) return;

    const kedv = await client.query(
        "SELECT 1 FROM favorites WHERE property_id = ANY($1::int[]) LIMIT 1",
        [torlendo]
    );

    if (kedv.rowCount) {
        await client.query(
            "INSERT INTO favorites (property_id) VALUES ($1) ON CONFLICT (property_id) DO NOTHING",
            [megtart]
        );
    }

    await client.query("DELETE FROM favorites WHERE property_id = ANY($1::int[])", [torlendo]);

    await client.query(
        "UPDATE ingatlan_kepek SET ingatlan_id = $1 WHERE ingatlan_id = ANY($2::int[])",
        [megtart, torlendo]
    );

    await client.query("DELETE FROM ingatlanok WHERE id = ANY($1::int[])", [torlendo]);

}

// Minden biztos duplikátum törlése (a legrégebbi marad meg)
async function biztosTorlese() {

    const { biztos } = await keres();

    const client = await db.connect();
    let torolt = 0;

    try {

        await client.query("BEGIN");

        for (const g of biztos) {
            const torlendo = g.tagok.slice(1).map(i => i.id);
            await athelyezEsTorol(client, g.megtart, torlendo);
            torolt += torlendo.length;
        }

        await client.query("COMMIT");

    } catch (e) {

        await client.query("ROLLBACK");
        throw e;

    } finally {

        client.release();

    }

    return { torolt };

}

// Két (vagy több) hirdetés összevonása: az egyik marad, a többi linkje
// "további linkként" hozzá kerül, a hiányzó adatai kitöltődnek.
async function osszevon(megtartId, torlendoIds) {

    const ids = [megtartId, ...torlendoIds].map(Number);

    const client = await db.connect();

    try {

        await client.query("BEGIN");

        const r = await client.query("SELECT * FROM ingatlanok WHERE id = ANY($1::int[])", [ids]);

        const fo = r.rows.find(i => i.id === Number(megtartId));
        const tobbi = r.rows.filter(i => i.id !== Number(megtartId));

        if (!fo) throw new Error("not_found");

        const linkek = new Set(fo.tovabbi_linkek || []);

        tobbi.forEach(i => {
            if (i.link && normLink(i.link) !== normLink(fo.link)) linkek.add(i.link);
            (i.tovabbi_linkek || []).forEach(l => linkek.add(l));
        });

        // Hiányzó mezők pótlása a többiből
        const potol = ["cim", "leiras", "kerulet", "allapot", "emelet", "szobak", "x", "y", "telek_nm", "kulso_kepek"];
        const uj = {};

        potol.forEach(m => {
            if (fo[m] === null || fo[m] === undefined || fo[m] === "") {
                const forras = tobbi.find(i => i[m] !== null && i[m] !== undefined && i[m] !== "");
                if (forras) uj[m] = forras[m];
            }
        });

        const sets = Object.keys(uj).map((m, idx) => `${m} = $${idx + 3}`);

        await client.query(
            `UPDATE ingatlanok SET tovabbi_linkek = $1::jsonb, updated_at = NOW() ${sets.length ? "," + sets.join(",") : ""} WHERE id = $2`,
            [JSON.stringify([...linkek]), fo.id, ...Object.values(uj).map(v => (v && typeof v === "object") ? JSON.stringify(v) : v)]
        );

        await athelyezEsTorol(client, fo.id, tobbi.map(i => i.id));

        await client.query("COMMIT");

        return { megtart: fo.id, torolt: tobbi.length };

    } catch (e) {

        await client.query("ROLLBACK");
        throw e;

    } finally {

        client.release();

    }

}

module.exports = { keres, biztosTorlese, osszevon };
