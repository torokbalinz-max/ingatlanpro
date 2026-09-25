require("dotenv").config({ quiet: true });

const { Pool } = require("pg");
const { createSchema, seedDefaults } = require("./schema");

if (!process.env.DATABASE_URL) {
    console.error("❌ Hiányzik a DATABASE_URL környezeti változó!");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
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

    try {

        await createSchema(pool);
        await seedDefaults(pool);

        console.log("PostgreSQL adatbázis csatlakoztatva, táblák rendben.");

    } catch (err) {

        console.error("Adatbázis inicializálási hiba:", err);

    }

}

pool.ready = initDatabase();

module.exports = pool;
