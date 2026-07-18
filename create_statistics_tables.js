require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function createTables() {

    await pool.query(`
        CREATE TABLE IF NOT EXISTS market_snapshots (

            id SERIAL PRIMARY KEY,

            created_at TIMESTAMP DEFAULT NOW(),

            note TEXT,

            property_count INTEGER,

            avg_price DOUBLE PRECISION,

            median_price DOUBLE PRECISION,

            avg_nm DOUBLE PRECISION,

            avg_price_nm DOUBLE PRECISION,

            min_price_nm DOUBLE PRECISION,

            max_price_nm DOUBLE PRECISION

        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS market_snapshot_groups (

            id SERIAL PRIMARY KEY,

            snapshot_id INTEGER REFERENCES market_snapshots(id) ON DELETE CASCADE,

            category TEXT,

            value TEXT,

            property_count INTEGER,

            avg_price DOUBLE PRECISION,

            avg_price_nm DOUBLE PRECISION

        );
    `);

    console.log("✅ Statisztikai táblák létrehozva.");

    await pool.end();

}

createTables().catch(console.error);