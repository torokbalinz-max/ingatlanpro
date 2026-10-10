// ============================================================
//  Adatbázis séma – EGY helyen az összes tábla.
//  A db/database.js induláskor, a scripts/migrate.js és a
//  scripts/import-backup.js a saját futásakor használja.
// ============================================================

const { ALAP_ALLAPOTOK } = require("../lib/allapotAlap");

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
        "allapot_forras TEXT",                   // honnan jön az állapot: kezi | forras | szoveg (a leírásból) | ev (az építés évéből)
        // Város és környéke (services/kornyek.js): a falvakban lévő hirdetések a
        // "<város> és környéke" városba kerülnek
        "varos_kezi BOOLEAN DEFAULT false",      // az admin kézzel döntött a városról – az automatika nem mozgatja
        "varos_ok TEXT",                         // miért került a környékre: telepules | szoveg | hely | kezi
        "varos_eredeti TEXT",                    // az automatikus áthelyezés előtti város
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
        "tiltva BOOLEAN DEFAULT false",
        // Jogi: mikor és melyik ÁSZF / adatvédelmi verziót fogadta el
        "aszf_elfogadva TIMESTAMP",
        "aszf_verzio TEXT"
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

    // "<város> és környéke": melyik város környéke (pl. "Sepsiszentgyörgy és környéke" -> Sepsiszentgyorgy)
    await db.query(`ALTER TABLE varosok ADD COLUMN IF NOT EXISTS anyavaros TEXT`);

    // Más oldalak környék-nevei, amelyek ehhez a kerülethez tartoznak (vesszővel)
    await db.query(`ALTER TABLE keruletek ADD COLUMN IF NOT EXISTS aliasok TEXT`);

    // A kerület román neve (a "nev" a magyar). Angolul és románul a román
    // név látszik, magyarul a magyar.
    await db.query(`ALTER TABLE keruletek ADD COLUMN IF NOT EXISTS nev_ro TEXT`);

    // A kerület határa a térképen (az admin rajzolja): [[hosszúság, szélesség], ...]
    // Ebből dől el, melyik kerületben van egy pontos helyű hirdetés.
    await db.query(`ALTER TABLE keruletek ADD COLUMN IF NOT EXISTS hatar JSONB`);

    // A kerület árszintje (1 = legdrágább ... 5 = legolcsóbb; üres = csak a hirdetések
    // döntenek). Az értékbecslő ezt a sorrendet betartja: ugyanarra a lakásra a jobb
    // árszintű kerületben nem ad kisebb becslést.
    await db.query(`ALTER TABLE keruletek ADD COLUMN IF NOT EXISTS arszint SMALLINT`);

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

    // Az iroda ellenőrzése (a kamu irodák kiszűrésére):
    //  - a cég adószáma (CUI), cégjegyzékszáma; az ANAF nyilvános adatai
    //    (hivatalos név, cím, fő tevékenység, aktív-e) – automatikusan lekérve
    //  - statusz: fuggo (jóváhagyásra vár) | jovahagyva | elutasitva | felfuggesztve
    //    Csak a jóváhagyott iroda látszik nyilvánosan (irodák listája,
    //    adatlap, a hirdetéseken az iroda neve).
    const irodaOszlopok = [
        "cui TEXT",
        "reg_com TEXT",
        "hivatalos_nev TEXT",
        "hivatalos_cim TEXT",
        "caen TEXT",
        "anaf_adat JSONB",
        "anaf_ido TIMESTAMP",
        "anaf_hiba TEXT",
        "dontes_ok TEXT",
        "dontes_ido TIMESTAMP",
        "logo BYTEA",
        "logo_mime TEXT"
    ];

    for (const o of irodaOszlopok) {
        await db.query(`ALTER TABLE irodak ADD COLUMN IF NOT EXISTS ${o}`);
    }

    // A meglévő irodák: ami eddig "ellenőrzött" volt, az jóváhagyott, a többi jóváhagyásra vár
    await db.query(`ALTER TABLE irodak ADD COLUMN IF NOT EXISTS statusz TEXT`);
    await db.query(`UPDATE irodak SET statusz = CASE WHEN ellenorzott THEN 'jovahagyva' ELSE 'fuggo' END WHERE statusz IS NULL`);
    await db.query(`ALTER TABLE irodak ALTER COLUMN statusz SET DEFAULT 'fuggo'`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_irodak_statusz ON irodak (statusz)`);

    // Egy adószámmal csak egy (nem elutasított) iroda lehet
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS irodak_cui_egyedi ON irodak (cui) WHERE cui IS NOT NULL AND statusz <> 'elutasitva'`);

    // Tagság: a vezető meghívja a kollégát, aki a saját fiókjában elfogadja
    // (amíg el nem fogadta, nem kezelheti a hirdetéseket, és a neve sem látszik)
    await db.query(`ALTER TABLE iroda_tagok ADD COLUMN IF NOT EXISTS statusz TEXT DEFAULT 'aktiv'`);
    await db.query(`ALTER TABLE iroda_tagok ADD COLUMN IF NOT EXISTS meghivta INTEGER`);

    // ===================== ÁLLAPOTOK =====================
    // Az ingatlanok állapotai (felújítandó, jó, újépítésű...) – az admin
    // bővítheti, átnevezheti, átrendezheti (Admin → Állapotok).
    // A kulcs kerül az ingatlanok.allapot oszlopba.
    await db.query(`
        CREATE TABLE IF NOT EXISTS allapotok (
            kulcs TEXT PRIMARY KEY,
            nev_hu TEXT NOT NULL,
            nev_ro TEXT,
            nev_en TEXT,
            szin TEXT,
            szint DOUBLE PRECISION,
            szorzo DOUBLE PRECISION,
            kulcsszavak TEXT,
            sorrend INTEGER DEFAULT 0,
            aktiv BOOLEAN DEFAULT true,
            beepitett BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // A beépített állapotok – csak a hiányzók kerülnek be, az admin módosításai megmaradnak
    for (const a of ALAP_ALLAPOTOK) {
        await db.query(
            `INSERT INTO allapotok (kulcs, nev_hu, nev_ro, nev_en, szin, szint, szorzo, sorrend, aktiv, beepitett)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,true) ON CONFLICT (kulcs) DO NOTHING`,
            [a.kulcs, a.nev_hu, a.nev_ro, a.nev_en, a.szin, a.szint, a.szorzo, a.sorrend]
        );
    }

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

    // ---------- Ártrend: árváltozások és piacon töltött idő ----------
    //
    // Minden hirdetésnél megjegyezzük:
    //  - az ár (és alapterület) minden változását (ar_elozmenyek),
    //  - mikor került le a piacról (piacrol_le: nem elérhető, eladva, archivált, törölt).
    // Így bármelyik múltbeli hónapra kiszámolható, milyen hirdetések voltak
    // akkor fent és mennyiért – az ártrend ebből számol, nem csak a kézi mentésekből.
    // Adatbázis-trigger végzi, így MINDEN módosítás (kézi, import, automatikus
    // javítás, iroda) bekerül, a kód többi részét nem kell hozzá módosítani.

    await db.query(`ALTER TABLE ingatlanok ADD COLUMN IF NOT EXISTS piacrol_le TIMESTAMP`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS ar_elozmenyek (
            id SERIAL PRIMARY KEY,
            ingatlan_id INTEGER REFERENCES ingatlanok(id) ON DELETE CASCADE,
            ar DOUBLE PRECISION,
            nm DOUBLE PRECISION,
            datum TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_ar_elozmenyek ON ar_elozmenyek (ingatlan_id, datum)`);

    // Mióta naplózzuk az árváltozásokat (a Piaci elemzés kiírja)
    await db.query(`INSERT INTO beallitasok (kulcs, ertek) VALUES ('arnaplo_kezdet', NOW()::text) ON CONFLICT (kulcs) DO NOTHING`);

    // Lekerült-e a piacról (a sor mentése ELŐTT állítjuk)
    await db.query(`
        CREATE OR REPLACE FUNCTION ingatlan_piac_allapot() RETURNS trigger AS $fn$
        BEGIN
            IF NEW.statusz = 'aktiv' AND NOT COALESCE(NEW.eladva, false) THEN
                NEW.piacrol_le := NULL;
            ELSIF NEW.piacrol_le IS NULL THEN
                NEW.piacrol_le := NOW();
            END IF;
            RETURN NEW;
        END;
        $fn$ LANGUAGE plpgsql
    `);

    // Árváltozás naplózása (a sor mentése UTÁN)
    await db.query(`
        CREATE OR REPLACE FUNCTION ingatlan_ar_naplo() RETURNS trigger AS $fn$
        BEGIN
            IF COALESCE(NEW.ar, 0) > 0 AND (TG_OP = 'INSERT'
                OR NEW.ar IS DISTINCT FROM OLD.ar
                OR NEW.nm IS DISTINCT FROM OLD.nm) THEN
                INSERT INTO ar_elozmenyek (ingatlan_id, ar, nm, datum)
                VALUES (NEW.id, NEW.ar, NEW.nm,
                        CASE WHEN TG_OP = 'INSERT' THEN COALESCE(NEW.created_at, NOW()) ELSE NOW() END);
            END IF;
            RETURN NULL;
        END;
        $fn$ LANGUAGE plpgsql
    `);

    await db.query(`DROP TRIGGER IF EXISTS trg_ingatlan_piac ON ingatlanok`);
    await db.query(`
        CREATE TRIGGER trg_ingatlan_piac BEFORE INSERT OR UPDATE OF statusz, eladva ON ingatlanok
        FOR EACH ROW EXECUTE FUNCTION ingatlan_piac_allapot()
    `);

    await db.query(`DROP TRIGGER IF EXISTS trg_ingatlan_ar ON ingatlanok`);
    await db.query(`
        CREATE TRIGGER trg_ingatlan_ar AFTER INSERT OR UPDATE OF ar, nm ON ingatlanok
        FOR EACH ROW EXECUTE FUNCTION ingatlan_ar_naplo()
    `);

    // Kezdőértékek a már meglévő hirdetésekhez (csak ahol még hiányzik – gyors)
    await db.query(`
        INSERT INTO ar_elozmenyek (ingatlan_id, ar, nm, datum)
        SELECT i.id, i.ar, i.nm, COALESCE(i.created_at, NOW())
        FROM ingatlanok i
        WHERE COALESCE(i.ar, 0) > 0
          AND NOT EXISTS (SELECT 1 FROM ar_elozmenyek e WHERE e.ingatlan_id = i.id)
    `);

    await db.query(`
        UPDATE ingatlanok
        SET piacrol_le = GREATEST(COALESCE(utolso_ellenorzes, updated_at, NOW()), COALESCE(created_at, NOW()))
        WHERE piacrol_le IS NULL AND (statusz <> 'aktiv' OR COALESCE(eladva, false))
    `);

    // ---------- Jogi ----------

    // Tartalom-bejelentések (EU DSA 16. cikk: bárki jelezheti a jogellenes
    // tartalmat; a döntést és az indoklást is itt tartjuk nyilván)
    await db.query(`
        CREATE TABLE IF NOT EXISTS bejelentesek (
            id SERIAL PRIMARY KEY,
            ingatlan_id INTEGER REFERENCES ingatlanok(id) ON DELETE SET NULL,
            url TEXT,
            ok TEXT NOT NULL,
            leiras TEXT NOT NULL,
            nev TEXT,
            email TEXT,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            statusz TEXT DEFAULT 'uj',
            dontes_indok TEXT,
            dontes_ido TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_bejelentesek_statusz ON bejelentesek (statusz, created_at)`);

    // Látogatottsági statisztika – sütik nélkül. IP-címet NEM tárolunk: a
    // "latogato" egy naponta változó, visszafejthetetlen azonosító (hash),
    // így a látogató napokon át nem követhető. 400 nap után törlődik.
    await db.query(`
        CREATE TABLE IF NOT EXISTS latogatasok (
            id BIGSERIAL PRIMARY KEY,
            ido TIMESTAMPTZ DEFAULT NOW(),
            latogato TEXT NOT NULL,
            oldal TEXT NOT NULL,
            ingatlan_id INTEGER,
            eszkoz TEXT,
            nyelv TEXT,
            forras TEXT,
            bejelentkezve BOOLEAN DEFAULT false
        )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_latogatasok_ido ON latogatasok (ido)`);

    // Süti-hozzájárulások naplója (GDPR 7. cikk (1): igazolni kell tudni a
    // hozzájárulást). IP-címet és fiókot NEM tárolunk, csak egy véletlen azonosítót.
    await db.query(`
        CREATE TABLE IF NOT EXISTS suti_hozzajarulasok (
            id SERIAL PRIMARY KEY,
            azonosito TEXT NOT NULL,
            valasztas JSONB NOT NULL,
            verzio TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // ---------- Reklámfelületek (Admin → Reklámfelületek) ----------
    //
    // Egy hirdetés (reklám): a hirdető, a kép (és ha van, egy telefonra szánt
    // kisebb kép), hova visz a kattintás, mely reklámhelyeken jelenik meg és
    // mettől meddig. A megjelenések / kattintások naponta és helyenként
    // összesítve (reklam_stat) – személyes adat, süti nélkül.
    await db.query(`
        CREATE TABLE IF NOT EXISTS reklamok (
            id SERIAL PRIMARY KEY,
            nev TEXT NOT NULL,
            hirdeto TEXT,
            kapcsolat TEXT,
            cel_url TEXT,
            alt TEXT,
            kep BYTEA,
            kep_mime TEXT,
            kep_w INTEGER,
            kep_h INTEGER,
            kep_mobil BYTEA,
            kep_mobil_mime TEXT,
            kep_mobil_w INTEGER,
            kep_mobil_h INTEGER,
            helyek JSONB DEFAULT '[]'::jsonb,
            kezdet DATE,
            vege DATE,
            aktiv BOOLEAN DEFAULT true,
            suly INTEGER DEFAULT 1,
            ar DOUBLE PRECISION,
            megjegyzes TEXT,
            megjelenes INTEGER DEFAULT 0,
            kattintas INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS reklam_stat (
            reklam_id INTEGER REFERENCES reklamok(id) ON DELETE CASCADE,
            nap DATE NOT NULL,
            hely TEXT NOT NULL DEFAULT '',
            megjelenes INTEGER DEFAULT 0,
            kattintas INTEGER DEFAULT 0,
            PRIMARY KEY (reklam_id, nap, hely)
        )
    `);

    // ---------- Címkeresés gyorstára ----------
    // Az utcák vonala (minden szakasza) és a házszámok – 30 napig, hogy egy
    // újraindítás után ne kelljen mindent újra lekérdezni (OpenStreetMap: 1 kérés / mp)
    await db.query(`
        CREATE TABLE IF NOT EXISTS geo_cache (
            kulcs TEXT PRIMARY KEY,
            adat JSONB,
            ido TIMESTAMP DEFAULT NOW()
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
    "market_snapshot_groups",
    "allapotok"
];

module.exports = { createSchema, seedDefaults, TABLES, VAROS_ADAT };
