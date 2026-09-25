// ============================================================
//  Visszatöltés a helyi mentésből (data/ingatlanok-backup.json)
//  a Neon adatbázisba.  A mentés a data/ingatlan.db (SQLite,
//  2026. július 18.) tartalma: 318 ingatlan.
//
//  Használat:   npm run import-backup
//  Felülírás:   npm run import-backup -- --force
// ============================================================

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { createSchema, seedDefaults } = require("./server/schema");

const FORCE = process.argv.includes("--force");
const FILE = path.join(__dirname, "data", "ingatlanok-backup.json");
const url = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
    console.error("❌ Hiányzik a DATABASE_URL a .env fájlból.");
    process.exit(1);
}

if (!fs.existsSync(FILE)) {
    console.error("❌ Nem található: " + FILE);
    process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(FILE, "utf8"));
const db = new Pool({ connectionString: url, ssl: process.env.PGSSL === "off" ? false : { rejectUnauthorized: false } });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connectWithRetry() {

    console.log("🔌 Neon: " + new URL(url).host);

    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            await db.query("SELECT 1");
            console.log("   ✅ kapcsolódva.");
            return;
        } catch (err) {
            console.log(`   ⚠️  ${attempt}. próbálkozás sikertelen: ${err.message}`);
            if (attempt === 4) throw new Error("A Neon adatbázishoz nem sikerült kapcsolódni.");
            await sleep(5000);
        }
    }

}

async function main() {

    console.log(`📄 Mentés beolvasva: ${rows.length} ingatlan.`);

    await connectWithRetry();

    await createSchema(db);
    console.log("✅ Táblák rendben.");

    const existing = (await db.query("SELECT COUNT(*)::int AS n FROM ingatlanok")).rows[0].n;

    if (existing > 0 && !FORCE) {
        console.error(`\n❌ A Neonban már van ${existing} ingatlan.`);
        console.error("   Felülíráshoz:  npm run import-backup -- --force");
        process.exit(1);
    }

    const client = await db.connect();

    try {

        await client.query("BEGIN");

        await client.query("TRUNCATE ingatlanok, favorites RESTART IDENTITY");

        for (const i of rows) {
            await client.query(
                `INSERT INTO ingatlanok
                 (id, link, ar, nm, arnm, szobak, emelet, allapot, eladva, x, y, varos, kerulet)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [i.id, i.link, i.ar, i.nm, i.arnm, i.szobak, i.emelet, i.allapot,
                 i.eladva, i.x, i.y, "Sepsiszentgyorgy", null]
            );
        }

        await client.query(`
            SELECT setval(pg_get_serial_sequence('ingatlanok', 'id'),
                          (SELECT MAX(id) FROM ingatlanok))
        `);

        await client.query("COMMIT");

    } catch (err) {

        await client.query("ROLLBACK");
        throw err;

    } finally {

        client.release();

    }

    await seedDefaults(db);

    const n = (await db.query("SELECT COUNT(*)::int AS n FROM ingatlanok")).rows[0].n;

    console.log(n === rows.length
        ? `\n🎉 Kész! ${n} ingatlan betöltve a Neonba.`
        : `\n⚠️  Eltérés: a mentésben ${rows.length}, a Neonban ${n} ingatlan van.`);

}

main()
    .catch(err => {
        console.error("\n❌ Hiba, a Neon adatbázis nem változott:\n", err.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
