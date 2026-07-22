const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initDatabase() {

    try {

        // Ingatlanok

        await pool.query(`
        CREATE TABLE IF NOT EXISTS ingatlanok (
            id SERIAL PRIMARY KEY,
            link TEXT,
            ar DOUBLE PRECISION,
            nm DOUBLE PRECISION,
            arnm DOUBLE PRECISION,
            szobak INTEGER,
            emelet TEXT,
            allapot TEXT,
            eladva BOOLEAN,
            x DOUBLE PRECISION,
            y DOUBLE PRECISION
        )
        `);

        // Kedvencek

        await pool.query(`
        CREATE TABLE IF NOT EXISTS favorites (
            id SERIAL PRIMARY KEY,
            property_id INTEGER UNIQUE
        )
        `);

        console.log("PostgreSQL adatbázis csatlakoztatva.");

    }
    catch (err) {

        console.error(err);

    }

}

initDatabase();

module.exports = pool;