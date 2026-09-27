require("dotenv").config({ quiet: true });

const { Pool } = require("pg");
const { createSchema, seedDefaults } = require("./schema");

if (!process.env.DATABASE_URL) {
    console.error("❌ Hiányzik a DATABASE_URL környezeti változó!");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Helyi fejlesztéshez SSL nélküli adatbázis: PGSSL=off a .env-ben
    ssl: process.env.PGSSL === "off" ? false : { rejectUnauthorized: false },
    // Neon ingyenes szinten a szerver alvó módba megy,
    // ezért a tétlen kapcsolatokat hamar lezárjuk.
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000
});

// FONTOS: ha a Neon lezár egy tétlen kapcsolatot, e nélkül
// az egész Node szerver leállna ("Unhandled 'error' event").
pool.on("error", err => {
    console.error("PostgreSQL tétlen kapcsolat hiba (nem kritikus):", err.message);
});

async function initDatabase() {

    // Minden utasítás külön: ha egy elhasal, a többi (pl. az új táblák)
    // attól még létrejön. A hibák a naplóba és a pool.schemaHibak-ba kerülnek.
    pool.schemaHibak = [];

    const turelmes = {
        query: async (sql, params) => {
            try {
                return await pool.query(sql, params);
            } catch (err) {
                const rovid = String(sql).replace(/\s+/g, " ").trim().slice(0, 120);
                pool.schemaHibak.push(`${err.message} | ${rovid}`);
                console.error("Adatbázis séma hiba:", err.message, "|", rovid);
                return { rows: [], rowCount: 0 };
            }
        }
    };

    try {

        await createSchema(turelmes);
        await seedDefaults(turelmes);

        console.log(pool.schemaHibak.length
            ? `PostgreSQL csatlakoztatva, ${pool.schemaHibak.length} séma hibával (lásd fent).`
            : "PostgreSQL adatbázis csatlakoztatva, táblák rendben.");

    } catch (err) {

        console.error("Adatbázis inicializálási hiba:", err);

    }

}

pool.ready = initDatabase();

module.exports = pool;
