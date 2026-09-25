// ============================================================
//  Render PostgreSQL  ->  Neon PostgreSQL  migráció
//
//  Használat (a projekt gyökeréből):
//      npm run migrate
//
//  A .env-ben kell:
//      SOURCE_DATABASE_URL = a Render adatbázis EXTERNAL URL-je
//      TARGET_DATABASE_URL = a Neon connection string
//
//  Ha a Neon adatbázisban már van ingatlan, a script leáll.
//  Felülíráshoz:  npm run migrate -- --force
// ============================================================

require("dotenv").config({ quiet: true });

const { Pool } = require("pg");
const { createSchema, TABLES } = require("./server/schema");

const FORCE = process.argv.includes("--force");

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;

if (!sourceUrl || !targetUrl) {
    console.error("❌ Hiányzik a SOURCE_DATABASE_URL vagy a TARGET_DATABASE_URL a .env fájlból.");
    process.exit(1);
}

if (sourceUrl === targetUrl) {
    console.error("❌ A forrás és a cél adatbázis ugyanaz!");
    process.exit(1);
}

const source = new Pool({ connectionString: sourceUrl, ssl: { rejectUnauthorized: false } });
const target = new Pool({ connectionString: targetUrl, ssl: { rejectUnauthorized: false } });

async function tableExists(db, table) {
    const r = await db.query("SELECT to_regclass($1) AS t", ["public." + table]);
    return r.rows[0].t !== null;
}

async function columnsOf(db, table) {
    const r = await db.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table]
    );
    return r.rows.map(x => x.column_name);
}

async function count(db, table) {
    const r = await db.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    return r.rows[0].n;
}

async function main() {

    console.log("🔌 Kapcsolódás...");
    await source.query("SELECT 1");
    await target.query("SELECT 1");
    console.log("✅ Mindkét adatbázis elérhető.\n");

    // 1) Séma létrehozása a célban
    await createSchema(target);
    console.log("✅ Táblák létrehozva a Neon adatbázisban.");

    // 2) Biztonsági ellenőrzés
    const existing = await count(target, "ingatlanok");

    if (existing > 0 && !FORCE) {
        console.error(`\n❌ A Neon adatbázisban már van ${existing} ingatlan.`);
        console.error("   Ha felül akarod írni:  npm run migrate -- --force");
        process.exit(1);
    }

    const client = await target.connect();
    const summary = [];

    try {

        await client.query("BEGIN");

        // 3) Cél táblák kiürítése (fordított sorrendben a kulcsok miatt)
        await client.query(
            `TRUNCATE ${[...TABLES].reverse().join(", ")} RESTART IDENTITY CASCADE`
        );

        // 4) Adatok másolása táblánként
        for (const table of TABLES) {

            if (!(await tableExists(source, table))) {
                console.log(`⏭  ${table}: nincs a forrásban, kihagyva.`);
                summary.push({ table, source: 0 });
                continue;
            }

            const sourceCols = await columnsOf(source, table);
            const targetCols = await columnsOf(target, table);
            const cols = sourceCols.filter(c => targetCols.includes(c));

            const rows = (await source.query(
                `SELECT ${cols.map(c => `"${c}"`).join(", ")} FROM ${table} ORDER BY id`
            )).rows;

            const colList = cols.map(c => `"${c}"`).join(", ");
            const params = cols.map((_, i) => `$${i + 1}`).join(", ");

            for (const row of rows) {
                await client.query(
                    `INSERT INTO ${table} (${colList}) VALUES (${params})`,
                    cols.map(c => row[c])
                );
            }

            // Az id számláló folytatása a legnagyobb id-tól
            await client.query(`
                SELECT setval(
                    pg_get_serial_sequence('${table}', 'id'),
                    COALESCE((SELECT MAX(id) FROM ${table}), 1),
                    (SELECT MAX(id) FROM ${table}) IS NOT NULL
                )
            `);

            console.log(`✅ ${table}: ${rows.length} sor átmásolva.`);
            summary.push({ table, source: rows.length });

        }

        await client.query("COMMIT");

    } catch (err) {

        await client.query("ROLLBACK");
        throw err;

    } finally {

        client.release();

    }

    // 5) Ellenőrzés
    console.log("\n📋 Ellenőrzés (forrás → cél):");

    let ok = true;

    for (const s of summary) {
        const n = await count(target, s.table);
        const match = n === s.source;
        if (!match) ok = false;
        console.log(`   ${match ? "✅" : "❌"} ${s.table.padEnd(24)} ${s.source} → ${n}`);
    }

    console.log(ok
        ? "\n🎉 Migráció kész, minden egyezik!"
        : "\n⚠️  Eltérés van – nézd meg a fenti sorokat!");

}

main()
    .catch(err => {
        console.error("\n❌ Migrációs hiba, a Neon adatbázis nem változott:\n", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await source.end();
        await target.end();
    });
