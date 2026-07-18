const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.query(`
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
`)
.then(() => console.log("PostgreSQL adatbázis csatlakoztatva."))
.catch(console.error);

module.exports = pool;