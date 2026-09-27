// ============================================================
//  Adatbázis séma – EGY helyen az összes tábla.
//  A db/database.js induláskor, a scripts/migrate.js és a
//  scripts/import-backup.js a saját futásakor használja.
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
        "problemak JSONB",                       // gyanús adatok (pl. irreális €/m²)
        "ellenorzott BOOLEAN DEFAULT true",      // beleszámít-e a statisztikába / becslésbe
        "jovahagyva BOOLEAN DEFAULT false",      // az admin kézzel jóváhagyta
        "forras_szoveg TEXT",                    // a forrásoldal lényeges szövege (ellenőrzéshez)
        "forras_kerulet TEXT",                   // a forrásoldal szerinti környék neve
        "utolso_ellenorzes TIMESTAMP",           // mikor néztük meg utoljára a forrásoldalt
        "evszam INTEGER",                        // építés éve
        "telepules TEXT",                        // háznál / teleknél: melyik település (ha nem a városban)
        "telek_jelleg TEXT",                     // teleknél: belterulet | kulterulet
        "hely_sugar INTEGER",                    // közelítő helynél a kör sugara méterben
        "auto_javitva TIMESTAMP",                // mikor futott rá az automatikus javítás
        "auto_javitva_v INTEGER",                // az automatikus javítás melyik változata futott rá
        "hely_forras TEXT",                      // honnan jön a hely: forras | szoveg | telepules | kerulet | kezi
        "hely_kezi BOOLEAN DEFAULT false",       // ember tette le a térképen – az automatika nem mozgatja
        "hely_eredeti JSONB",                    // a forrásoldal (rossz) helye, ha áttettük
        "kep_hash_v INTEGER",                    // a képek ujjlenyomata elkészült-e
        "iroda_id INTEGER",                      // ingatlanirodás hirdetésnél az iroda
        "ugynok_id INTEGER",                     // az irodán belül a felelős ügynök
        "iroda_ref TEXT",                        // az iroda saját hivatkozási száma
        "iroda_mappa TEXT",                      // az iroda saját rendszerezése (mappa / címke)
        "iroda_megjegyzes TEXT",                 // belső megjegyzés (csak az iroda látja)
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
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ingatlanok_iroda ON ingatlanok (iroda_id)`);

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

    // Fiókok (e-mail + jelszó, vagy Google). A régi ADMIN_USER / APP_USER
    // belépés is ide kerül egy sorral (felhasznalonev), első belépéskor.
    const userOszlopok = [
        "felhasznalonev TEXT",
        "jelszo_hash TEXT",
        "telefon TEXT",
        "ertesites_email BOOLEAN DEFAULT true",
        "utolso_belepes TIMESTAMP",
        "tiltva BOOLEAN DEFAULT false"
    ];

    for (const o of userOszlopok) {
        await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${o}`);
    }

    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_felhasznalonev ON users (LOWER(felhasznalonev))`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (LOWER(email))`);

    // Bejelentkezések (a böngésző sütijében csak egy véletlen azonosító van,
    // itt annak a hash-e)
    await db.query(`
        CREATE TABLE IF NOT EXISTS munkamenetek (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            lejar TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // Elfelejtett jelszó: egyszer használható, 1 óráig érvényes link
    await db.query(`
        CREATE TABLE IF NOT EXISTS jelszo_tokenek (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            lejar TIMESTAMP NOT NULL
        )
    `);

    // Kedvencek
    await db.query(`
        CREATE TABLE IF NOT EXISTS favorites (
            id SERIAL PRIMARY KEY,
            property_id INTEGER UNIQUE
        )
    `);

    // Felhasználónként külön kedvencek. A régi (közös) kedvencek az adminé lesznek.
    await db.query(`ALTER TABLE favorites ADD COLUMN IF NOT EXISTS user_id INTEGER`);
    await db.query(`ALTER TABLE favorites ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
    await db.query(`ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_property_id_key`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_prop ON favorites (user_id, property_id)`);

    // Mentett keresések (a kereső szűrői JSON-ban)
    await db.query(`
        CREATE TABLE IF NOT EXISTS mentett_keresesek (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            nev TEXT,
            szurok JSONB NOT NULL,
            ertesites BOOLEAN DEFAULT true,
            utolso_megtekintes TIMESTAMP DEFAULT NOW(),
            utolso_ertesites TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // Keresési igények: a vevő leírja, mit keres – az eladók válaszolhatnak
    await db.query(`
        CREATE TABLE IF NOT EXISTS igenyek (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            ugylet TEXT DEFAULT 'elado',
            tipus TEXT DEFAULT 'lakas',
            varos TEXT,
            keruletek JSONB,
            telepules TEXT,
            min_ar DOUBLE PRECISION,
            max_ar DOUBLE PRECISION,
            min_nm DOUBLE PRECISION,
            max_nm DOUBLE PRECISION,
            min_szoba INTEGER,
            max_szoba INTEGER,
            cim TEXT,
            leiras TEXT,
            statusz TEXT DEFAULT 'aktiv',
            lejar TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`ALTER TABLE igenyek ADD COLUMN IF NOT EXISTS utolso_ertesites TIMESTAMP`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_igenyek_varos ON igenyek (varos, statusz)`);

    // Üzenetek: válasz egy igényre, vagy kérdés egy hirdetésről
    await db.query(`
        CREATE TABLE IF NOT EXISTS uzenetek (
            id SERIAL PRIMARY KEY,
            felado_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            cimzett_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            igeny_id INTEGER REFERENCES igenyek(id) ON DELETE SET NULL,
            ingatlan_id INTEGER REFERENCES ingatlanok(id) ON DELETE SET NULL,
            ajanlott_ingatlan_id INTEGER REFERENCES ingatlanok(id) ON DELETE SET NULL,
            szoveg TEXT NOT NULL,
            olvasva BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_uzenetek_cimzett ON uzenetek (cimzett_id, olvasva)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_uzenetek_felado ON uzenetek (felado_id)`);

    // Duplikátumok: az admin szerint NEM ugyanaz (ne kérdezzük újra)
    await db.query(`
        CREATE TABLE IF NOT EXISTS dup_kizart (
            a INTEGER NOT NULL,
            b INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (a, b)
        )
    `);

    // A hirdetések képeinek "ujjlenyomata" (a duplikátumok felismeréséhez)
    await db.query(`
        CREATE TABLE IF NOT EXISTS kep_hashek (
            ingatlan_id INTEGER REFERENCES ingatlanok(id) ON DELETE CASCADE,
            forras TEXT NOT NULL,
            hash TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (ingatlan_id, forras)
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

    // A város román neve, megyéje és közepe (a helymeghatározás ezzel
    // ellenőrzi, hogy a hirdetés tényleg a városban / mellette van-e)
    await db.query(`ALTER TABLE varosok ADD COLUMN IF NOT EXISTS nev_ro TEXT`);
    await db.query(`ALTER TABLE varosok ADD COLUMN IF NOT EXISTS megye TEXT`);
    await db.query(`ALTER TABLE varosok ADD COLUMN IF NOT EXISTS x DOUBLE PRECISION`);
    await db.query(`ALTER TABLE varosok ADD COLUMN IF NOT EXISTS y DOUBLE PRECISION`);
    await db.query(`ALTER TABLE varosok ADD COLUMN IF NOT EXISTS sugar_km DOUBLE PRECISION`);

    // Más oldalak környék-nevei, amelyek ehhez a kerülethez tartoznak (vesszővel)
    await db.query(`ALTER TABLE keruletek ADD COLUMN IF NOT EXISTS aliasok TEXT`);

    // A kerület román neve (a "nev" a magyar). Angolul és románul a román
    // név látszik, magyarul a magyar.
    await db.query(`ALTER TABLE keruletek ADD COLUMN IF NOT EXISTS nev_ro TEXT`);

    // A kerület határa a térképen (az admin rajzolja): [[hosszúság, szélesség], ...]
    // Ebből dől el, melyik kerületben van egy pontos helyű hirdetés.
    await db.query(`ALTER TABLE keruletek ADD COLUMN IF NOT EXISTS hatar JSONB`);

    // ===================== INGATLANIRODÁK =====================

    // Az iroda (cég) adatai – egy felhasználó hozza létre, ő a vezetője
    await db.query(`
        CREATE TABLE IF NOT EXISTS irodak (
            id SERIAL PRIMARY KEY,
            nev TEXT NOT NULL,
            leiras TEXT,
            telefon TEXT,
            email TEXT,
            weboldal TEXT,
            cim TEXT,
            varos TEXT,
            ellenorzott BOOLEAN DEFAULT false,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // Kik kezelhetik az iroda hirdetéseit (vezeto: mindent, tag: hirdetéseket)
    await db.query(`
        CREATE TABLE IF NOT EXISTS iroda_tagok (
            iroda_id INTEGER REFERENCES irodak(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            szerep TEXT DEFAULT 'tag',
            created_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (iroda_id, user_id)
        )
    `);

    // Az iroda ügynökei (kapcsolattartók a hirdetéseken). Nem kell fiók hozzá;
    // ha van (user_id), az érdeklődők üzenete neki megy.
    await db.query(`
        CREATE TABLE IF NOT EXISTS iroda_ugynokok (
            id SERIAL PRIMARY KEY,
            iroda_id INTEGER REFERENCES irodak(id) ON DELETE CASCADE,
            nev TEXT NOT NULL,
            telefon TEXT,
            email TEXT,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            aktiv BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_iroda_ugynokok ON iroda_ugynokok (iroda_id)`);

    // Egyszerű beállítások / jelzők (pl. lefutott-e már az automatikus javítás)
    await db.query(`
        CREATE TABLE IF NOT EXISTS beallitasok (
            kulcs TEXT PRIMARY KEY,
            ertek TEXT,
            updated_at TIMESTAMP DEFAULT NOW()
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

// Kezdő kerületlista: [magyar név, román név, más oldalakon használt nevek]
const ALAP_KERULETEK = {
    Sepsiszentgyorgy: [
        ["Központ", "Centru", "Central, Centrală, Centrala, Centrul, Városközpont, Centrum"],
        ["Félközpont", "Semicentral", "Semicentrală, Semicentrala, Semi-central, Semi central"],
        ["Csíki negyed", "Cartierul Ciucului", "Ciucului, Ciuc, Cartierul Ciuc, Cartier Ciuc, Csíki lakótelep, Csiki"],
        ["Simeria", "Simeria", "Semeria, Cartierul Simeria, Simeria lakótelep"],
        ["Lenin", "Lenin", "Lenin lakótelep, Cartierul Lenin"],
        ["Állomás negyed", "Gării", "Garii, Gara, Zona Gării, Zona Garii, Állomás, Vasútállomás"],
        ["Kós Károly", "Kós Károly", "Kos Karoly, Kós Károly lakótelep, Cartierul Kós Károly"],
        ["Őrkő", "Őrkő", "Orko, Örkő, Orkő"],
        ["Szépmező", "Câmpul Frumos", "Campul Frumos"],
        ["Kórház környéke", "Spitalului", "Spital, Zona Spitalului, Kórház"]
    ]
};

// [mi nevünk, román név, megye, hosszúság, szélesség, a város sugara km-ben]
const VAROS_ADAT = [
    ["Sepsiszentgyorgy", "Sfântu Gheorghe", "Covasna", 25.787, 45.866, 6],
    ["Kezdivasarhely", "Târgu Secuiesc", "Covasna", 26.139, 46.004, 4],
    ["Kovaszna", "Covasna", "Covasna", 26.187, 45.848, 5],
    ["Baroth", "Baraolt", "Covasna", 25.600, 46.075, 4],
    ["Csikszereda", "Miercurea Ciuc", "Harghita", 25.805, 46.358, 7],
    ["Szekelyudvarhely", "Odorheiu Secuiesc", "Harghita", 25.297, 46.306, 5],
    ["Gyergyoszentmiklos", "Gheorgheni", "Harghita", 25.600, 46.724, 5],
    ["Brasso", "Brașov", "Brașov", 25.589, 45.652, 12],
    ["Marosvasarhely", "Târgu Mureș", "Mureș", 24.557, 46.542, 9],
    ["Kolozsvar", "Cluj-Napoca", "Cluj", 23.600, 46.770, 12],
    ["Deva", "Deva", "Hunedoara", 22.905, 45.883, 6]
];

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

    // A városok román neve, megyéje, közepe és mérete (km) – csak ahol még üres.
    // Új városnál ezt az első helymeghatározás magától kitölti (Admin → Városok).
    for (const [nev, ro, megye, x, y, sugar] of VAROS_ADAT) {
        await db.query(
            `UPDATE varosok SET nev_ro = COALESCE(nev_ro, $2), megye = COALESCE(megye, $3),
                    x = COALESCE(x, $4), y = COALESCE(y, $5), sugar_km = COALESCE(sugar_km, $6)
             WHERE nev = $1`,
            [nev, ro, megye, x, y, sugar]
        );
    }

    // Sepsiszentgyörgy kerületei magyar és román névvel – csak ha a városnak
    // még egy kerülete sincs. Az Admin → Városok, kerületek oldalon bármi
    // átírható, törölhető, bővíthető.
    const van = await db.query("SELECT 1 FROM keruletek WHERE varos = 'Sepsiszentgyorgy' LIMIT 1");

    if (!van.rowCount) {

        for (const [nev, nevRo, aliasok] of ALAP_KERULETEK.Sepsiszentgyorgy) {
            await db.query(
                `INSERT INTO keruletek (varos, nev, nev_ro, aliasok) VALUES ('Sepsiszentgyorgy', $1, $2, $3)
                 ON CONFLICT (varos, nev) DO NOTHING`,
                [nev, nevRo, aliasok]
            );
        }

    }

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
    "irodak",
    "iroda_tagok",
    "iroda_ugynokok",
    "varosok",
    "keruletek",
    "ingatlanok",
    "ingatlan_kepek",
    "figyelt_oldalak",
    "favorites",
    "mentett_keresesek",
    "igenyek",
    "uzenetek",
    "market_snapshots",
    "market_snapshot_groups"
];

module.exports = { createSchema, seedDefaults, TABLES, VAROS_ADAT };
