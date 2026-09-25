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

    // Felvétel ideje + tulajdonos (a 2. verzió felhasználókezeléséhez előkészítve)
    await db.query(`ALTER TABLE ingatlanok ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
    await db.query(`ALTER TABLE ingatlanok ADD COLUMN IF NOT EXISTS owner_id INTEGER`);

    // Hirdetés jellegű adatok
    const ujOszlopok = [
        "tipus TEXT DEFAULT 'lakas'",           // lakas | haz | telek | kereskedelmi | iroda
        "ugylet TEXT DEFAULT 'elado'",          // elado | kiado
        "cim TEXT",                              // hirdetés címe
        "leiras TEXT",                           // hirdetés szövege
        "telek_nm DOUBLE PRECISION",             // háznál a telek mérete
        "statusz TEXT DEFAULT 'aktiv'",          // aktiv | fuggo (importált, jóváhagyásra vár)
        "forras_tipus TEXT DEFAULT 'kezi'",      // kezi | import
        "hely_pontossag TEXT",                   // pontos | kozelito | NULL
        "kulso_kepek JSONB",                     // más oldalról beolvasott képek címei
        "tovabbi_linkek JSONB",                  // ugyanez a hirdetés más oldalakon
        "hianyzo JSONB",                         // hiányzó kötelező mezők listája
        "updated_at TIMESTAMP DEFAULT NOW()"
    ];

    for (const o of ujOszlopok) {
        await db.query(`ALTER TABLE ingatlanok ADD COLUMN IF NOT EXISTS ${o}`);
    }

    await db.query(`UPDATE ingatlanok SET tipus = 'lakas' WHERE tipus IS NULL`);
    await db.query(`UPDATE ingatlanok SET ugylet = 'elado' WHERE ugylet IS NULL`);
    await db.query(`UPDATE ingatlanok SET statusz = 'aktiv' WHERE statusz IS NULL`);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_ingatlanok_varos ON ingatlanok (varos)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ingatlanok_statusz ON ingatlanok (statusz)`);

    // Feltöltött képek (az adatbázisban, mert a Render ingyenes szerverén
    // a fájlok újraindításkor elvesznének)
    await db.query(`
        CREATE TABLE IF NOT EXISTS ingatlan_kepek (
            id SERIAL PRIMARY KEY,
            ingatlan_id INTEGER REFERENCES ingatlanok(id) ON DELETE CASCADE,
            sorrend INTEGER DEFAULT 0,
            mime TEXT,
            adat BYTEA,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_kepek_ingatlan ON ingatlan_kepek (ingatlan_id)`);

    // Figyelt keresések más hirdetési oldalakon (az admin menti el)
    await db.query(`
        CREATE TABLE IF NOT EXISTS figyelt_oldalak (
            id SERIAL PRIMARY KEY,
            url TEXT NOT NULL,
            nev TEXT,
            varos TEXT,
            tipus TEXT DEFAULT 'lakas',
            ugylet TEXT DEFAULT 'elado',
            utolso_futas TIMESTAMP,
            utolso_eredmeny TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // Felhasználók – egyelőre üres, a bejelentkezés a 2. verzióban jön
    // (e-mail vagy Google fiók). Az ingatlanok owner_id mezője ide mutat.
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE,
            nev TEXT,
            google_id TEXT UNIQUE,
            szerep TEXT DEFAULT 'user',
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

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

    // Melyik városra készült a snapshot (NULL = régi, az összes város)
    await db.query(`ALTER TABLE market_snapshots ADD COLUMN IF NOT EXISTS varos TEXT`);
    await db.query(`ALTER TABLE market_snapshots ADD COLUMN IF NOT EXISTS tipus TEXT`);
    await db.query(`ALTER TABLE market_snapshots ADD COLUMN IF NOT EXISTS ugylet TEXT`);

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
    "users",
    "varosok",
    "keruletek",
    "ingatlanok",
    "ingatlan_kepek",
    "figyelt_oldalak",
    "favorites",
    "market_snapshots",
    "market_snapshot_groups"
];

module.exports = { createSchema, seedDefaults, TABLES };
