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

        // Meglévő táblához hozzáadjuk a város / kerület mezőket,
        // ha még nem léteznének (régi adatbázisoknál).

        await pool.query(`
            ALTER TABLE ingatlanok
            ADD COLUMN IF NOT EXISTS varos TEXT
        `);

        await pool.query(`
            ALTER TABLE ingatlanok
            ADD COLUMN IF NOT EXISTS kerulet TEXT
        `);

        // Kedvencek

        await pool.query(`
        CREATE TABLE IF NOT EXISTS favorites (
            id SERIAL PRIMARY KEY,
            property_id INTEGER UNIQUE
        )
        `);

        // Városok (kódolás nélkül bővíthető lista)

        await pool.query(`
        CREATE TABLE IF NOT EXISTS varosok (
            id SERIAL PRIMARY KEY,
            nev TEXT UNIQUE
        )
        `);

        // Alap városok feltöltése, ha még üres a tábla
        // (ugyanazok, amik eddig a navigációs sávban voltak).

        await pool.query(`
            INSERT INTO varosok (nev)
            VALUES
                ('Sepsiszentgyorgy'),
                ('Kezdivasarhely'),
                ('Csikszereda'),
                ('Brasso'),
                ('Marosvasarhely')
            ON CONFLICT (nev) DO NOTHING
        `);

        // Kerületek / városrészek (városhoz kötve)

        await pool.query(`
        CREATE TABLE IF NOT EXISTS keruletek (
            id SERIAL PRIMARY KEY,
            varos TEXT,
            nev TEXT,
            UNIQUE(varos, nev)
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