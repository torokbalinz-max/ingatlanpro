// ============================================================
//  Adatbázis séma – EGY helyen az összes tábla.
//  A database.js induláskor, a migrate.js migráláskor használja.
// ============================================================

async function createSchema(db) {

    // Ingatlanok
    await db.query(`
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

    // Régi adatbázisoknál hiányozhatnak
    await db.query(`ALTER TABLE ingatlanok ADD COLUMN IF NOT EXISTS varos TEXT`);
    await db.query(`ALTER TABLE ingatlanok ADD COLUMN IF NOT EXISTS kerulet TEXT`);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_ingatlanok_varos ON ingatlanok (varos)`);

    // Kedvencek
    await db.query(`
        CREATE TABLE IF NOT EXISTS favorites (
            id SERIAL PRIMARY KEY,
            property_id INTEGER UNIQUE
        )
    `);

    // Városok
    await db.query(`
        CREATE TABLE IF NOT EXISTS varosok (
            id SERIAL PRIMARY KEY,
            nev TEXT UNIQUE
        )
    `);

    // Kerületek / városrészek
    await db.query(`
        CREATE TABLE IF NOT EXISTS keruletek (
            id SERIAL PRIMARY KEY,
            varos TEXT,
            nev TEXT,
            UNIQUE(varos, nev)
        )
    `);

    // Piaci snapshotok (korábban a külön create_statistics_tables.js hozta létre)
    await db.query(`
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
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS market_snapshot_groups (
            id SERIAL PRIMARY KEY,
            snapshot_id INTEGER REFERENCES market_snapshots(id) ON DELETE CASCADE,
            category TEXT,
            value TEXT,
            property_count INTEGER,
            avg_price DOUBLE PRECISION,
            avg_price_nm DOUBLE PRECISION
        )
    `);

}

// Alapadatok – csak az éles indulásnál fut, migráláskor NEM
async function seedDefaults(db) {

    await db.query(`
        INSERT INTO varosok (nev)
        VALUES
            ('Sepsiszentgyorgy'),
            ('Kezdivasarhely'),
            ('Csikszereda'),
            ('Brasso'),
            ('Marosvasarhely')
        ON CONFLICT (nev) DO NOTHING
    `);

    // Város nélküli (régi) ingatlanok -> Sepsiszentgyörgy
    await db.query(`
        UPDATE ingatlanok
        SET varos = 'Sepsiszentgyorgy'
        WHERE varos IS NULL OR varos = ''
    `);

}

// Táblák a helyes (függőségi) sorrendben – a migráció is ezt használja
const TABLES = [
    "varosok",
    "keruletek",
    "ingatlanok",
    "favorites",
    "market_snapshots",
    "market_snapshot_groups"
];

module.exports = { createSchema, seedDefaults, TABLES };
