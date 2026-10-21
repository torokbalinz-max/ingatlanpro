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
        // Mi nyíljon meg, ha a látogató a hirdetésre kattint (NULL = automatikus:
        // a más oldalról átvett hirdetés a forrásoldalra visz, a többi saját adatlapot kap)
        "megnyitas TEXT",                        // NULL | lap | forras
        // Közvetítő oldalról (Imoradar24) jött hirdetés: a közvetítő azonosítói (hogy a
        // valódi forrásra cserélt link mellett is felismerjük), és ha a valódi forrást
        // nem találtuk meg, a közvetítő neve (a link ilyenkor a közvetítő adatlapja)
        "kulso_azon JSONB",
        "kozvetito TEXT",
        "updated_at TIMESTAMP DEFAULT NOW()"
    ];

    for (const o of ujOszlopok) {
        await db.query(`ALTER TABLE ingatlanok ADD COLUMN IF NOT EXISTS ${o}`);
    }

    await db.query(`UPDATE ingatlanok SET tipus = 'lakas' WHERE tipus IS NULL`);
    await db.query(`UPDATE ingatlanok SET ugylet = 'elado' WHERE ugylet IS NULL`);
    await db.query(`UPDATE ingatlanok SET statusz = 'aktiv' WHERE statusz IS NULL`);
    // a lejárt csomag türelmi ideje után archivált hirdetés (újra előfizetve visszajön – services/turelem.js)
    await db.query(`ALTER TABLE ingatlanok ADD COLUMN IF NOT EXISTS csomag_archivalva TIMESTAMP`);

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
        "aszf_verzio TEXT",
        // Biztonság: igazolta-e, hogy az e-mail cím az övé (Google-belépés vagy
        // e-mailes jelszó-visszaállítás). Admin jog csak igazolt címre jár.
        "email_igazolva BOOLEAN DEFAULT false"
    ];

    for (const o of userOszlopok) {
        await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${o}`);
    }

    // A Google-lel belépett fiókok címe igazolt
    await db.query(`UPDATE users SET email_igazolva = true WHERE google_id IS NOT NULL AND email_igazolva IS NOT TRUE`);

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

    // Hogyan hívjuk a városon belüli részeket: 'kerulet', 'negyed', 'varosresz'
    // (NULL = alap: "Kerület / városrész"). Ugyanazt jelenti, csak más a neve.
    await db.query(`ALTER TABLE varosok ADD COLUMN IF NOT EXISTS resz_nev TEXT`);

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
        "logo_mime TEXT",
        // a profil tetején kiemelt hirdetések (azonosítók, sorrendben) – csomag joga: profil_kiemeles
        "profil_kiemelt JSONB DEFAULT '[]'::jsonb"
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

    // ===================== PÉNZÜGYEK (Admin → Pénzügyek) =====================
    // A weboldal bevételei és kiadásai egy helyen:
    //  - díjcsomagok (árlista): iroda-előfizetés, extra hirdetések, reklámmentes,
    //    részletes statisztika, kiemelés, reklámfelület... – mit ad (jogosultsag)
    //  - ügyfelek: magánszemély / cég (ANAF-adatokkal), kapcsolható fiókhoz / irodához
    //  - előfizetések: ki, melyik csomag, mettől, mikor esedékes a következő díjbekérő
    //  - díjbekérők / számlák tételekkel, fizetve / lejárt / sztornó
    //  - kiadások (tárhely, domain, könyvelő...)
    // A pénzösszegek NUMERIC(12,2) – nincs kerekítési hiba.
    await db.query(`
        CREATE TABLE IF NOT EXISTS penzugy_csomagok (
            id SERIAL PRIMARY KEY,
            kod TEXT UNIQUE,
            nev TEXT NOT NULL,
            nev_ro TEXT,
            nev_en TEXT,
            kategoria TEXT NOT NULL DEFAULT 'egyeb',
            ar NUMERIC(12,2) DEFAULT 0,
            penznem TEXT DEFAULT 'RON',
            idoszak TEXT DEFAULT 'havi',
            leiras TEXT,
            jogosultsag JSONB DEFAULT '{}'::jsonb,
            aktiv BOOLEAN DEFAULT true,
            sorrend INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS penzugy_ugyfelek (
            id SERIAL PRIMARY KEY,
            tipus TEXT DEFAULT 'maganszemely',
            nev TEXT NOT NULL,
            cui TEXT,
            reg_com TEXT,
            cim TEXT,
            email TEXT,
            telefon TEXT,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            iroda_id INTEGER REFERENCES irodak(id) ON DELETE SET NULL,
            jegyzet TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_pu_ugyfel_user ON penzugy_ugyfelek (user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_pu_ugyfel_iroda ON penzugy_ugyfelek (iroda_id)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS penzugy_elofizetesek (
            id SERIAL PRIMARY KEY,
            ugyfel_id INTEGER REFERENCES penzugy_ugyfelek(id) ON DELETE CASCADE,
            csomag_id INTEGER REFERENCES penzugy_csomagok(id) ON DELETE SET NULL,
            megnevezes TEXT,
            ar NUMERIC(12,2) DEFAULT 0,
            penznem TEXT DEFAULT 'RON',
            idoszak TEXT DEFAULT 'havi',
            mennyiseg INTEGER DEFAULT 1,
            kezdet DATE DEFAULT CURRENT_DATE,
            kovetkezo DATE,
            vege DATE,
            statusz TEXT DEFAULT 'aktiv',
            jegyzet TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS penzugy_szamlak (
            id SERIAL PRIMARY KEY,
            sorszam TEXT UNIQUE,
            tipus TEXT DEFAULT 'dijbekero',
            ugyfel_id INTEGER REFERENCES penzugy_ugyfelek(id) ON DELETE SET NULL,
            vevo JSONB DEFAULT '{}'::jsonb,
            kiallitva DATE DEFAULT CURRENT_DATE,
            esedekes DATE,
            fizetve DATE,
            statusz TEXT DEFAULT 'kiallitva',
            penznem TEXT DEFAULT 'RON',
            netto NUMERIC(12,2) DEFAULT 0,
            afa NUMERIC(12,2) DEFAULT 0,
            brutto NUMERIC(12,2) DEFAULT 0,
            fizetesi_mod TEXT,
            kulso_szam TEXT,
            elofizetes_id INTEGER REFERENCES penzugy_elofizetesek(id) ON DELETE SET NULL,
            reklam_id INTEGER REFERENCES reklamok(id) ON DELETE SET NULL,
            idoszak_tol DATE,
            idoszak_ig DATE,
            megjegyzes TEXT,
            emailezve TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_pu_szamla_kiallitva ON penzugy_szamlak (kiallitva)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_pu_szamla_ugyfel ON penzugy_szamlak (ugyfel_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_pu_szamla_elofizetes ON penzugy_szamlak (elofizetes_id)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS penzugy_tetelek (
            id SERIAL PRIMARY KEY,
            szamla_id INTEGER REFERENCES penzugy_szamlak(id) ON DELETE CASCADE,
            megnevezes TEXT NOT NULL,
            kategoria TEXT DEFAULT 'egyeb',
            csomag_id INTEGER REFERENCES penzugy_csomagok(id) ON DELETE SET NULL,
            mennyiseg NUMERIC(12,2) DEFAULT 1,
            egysegar NUMERIC(12,2) DEFAULT 0,
            afa_kulcs NUMERIC(5,2) DEFAULT 0,
            netto NUMERIC(12,2) DEFAULT 0,
            afa NUMERIC(12,2) DEFAULT 0,
            brutto NUMERIC(12,2) DEFAULT 0,
            sorrend INTEGER DEFAULT 0
        )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_pu_tetel_szamla ON penzugy_tetelek (szamla_id)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS penzugy_kiadasok (
            id SERIAL PRIMARY KEY,
            datum DATE DEFAULT CURRENT_DATE,
            kategoria TEXT DEFAULT 'egyeb',
            leiras TEXT NOT NULL,
            szallito TEXT,
            osszeg NUMERIC(12,2) DEFAULT 0,
            penznem TEXT DEFAULT 'RON',
            afa NUMERIC(12,2) DEFAULT 0,
            szamlaszam TEXT,
            ismetlodo TEXT,
            jegyzet TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_pu_kiadas_datum ON penzugy_kiadasok (datum)`);

    // ===================== 8. változat =====================

    // Díjcsomagok az árlistán (Csomagok és árak oldal): kinek szól (magánszemély /
    // iroda / mindenki), látszik-e nyilvánosan, kiemelt-e ("legnépszerűbb"),
    // leírás és előnyök (soronként egy) három nyelven
    const csomagOszlopok = [
        "celcsoport TEXT DEFAULT 'mindenki'",
        "nyilvanos BOOLEAN DEFAULT true",
        "kiemelt BOOLEAN DEFAULT false",
        "leiras_ro TEXT",
        "leiras_en TEXT",
        "elonyok TEXT",
        "elonyok_ro TEXT",
        "elonyok_en TEXT"
    ];
    for (const o of csomagOszlopok) {
        await db.query(`ALTER TABLE penzugy_csomagok ADD COLUMN IF NOT EXISTS ${o}`);
    }

    // Rendelések: a felhasználó a Csomagok és árak oldalon megrendel egy csomagot →
    // ügyfél + (függő) előfizetés + díjbekérő. A befizetés után a csomag él.
    await db.query(`
        CREATE TABLE IF NOT EXISTS penzugy_rendelesek (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            iroda_id INTEGER REFERENCES irodak(id) ON DELETE SET NULL,
            csomag_id INTEGER REFERENCES penzugy_csomagok(id) ON DELETE SET NULL,
            ugyfel_id INTEGER REFERENCES penzugy_ugyfelek(id) ON DELETE SET NULL,
            elofizetes_id INTEGER REFERENCES penzugy_elofizetesek(id) ON DELETE SET NULL,
            szamla_id INTEGER REFERENCES penzugy_szamlak(id) ON DELETE SET NULL,
            ingatlan_id INTEGER REFERENCES ingatlanok(id) ON DELETE SET NULL,
            celcsoport TEXT DEFAULT 'maganszemely',
            megnevezes TEXT,
            ar NUMERIC(12,2) DEFAULT 0,
            penznem TEXT DEFAULT 'RON',
            idoszak TEXT,
            statusz TEXT DEFAULT 'fizetesre_var',
            megjegyzes TEXT,
            fizetve TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_pu_rendeles_user ON penzugy_rendelesek (user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_pu_rendeles_statusz ON penzugy_rendelesek (statusz)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_pu_rendeles_szamla ON penzugy_rendelesek (szamla_id)`);

    // ---------- Eladjuk helyetted: megbízásos értékesítés ----------
    // A tulajdonos az oldalon kiválasztja a szolgáltatásokat (fotózás, hirdetés,
    // bemutatás...), mi szerződést kötünk, lefotózzuk, feltöltjük, reklámozzuk,
    // kezeljük az érdeklődőket, megtekintéseket, ajánlatokat.
    await db.query(`
        CREATE TABLE IF NOT EXISTS megbizasok (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            ingatlan_id INTEGER REFERENCES ingatlanok(id) ON DELETE SET NULL,
            statusz TEXT DEFAULT 'uj',
            ugylet TEXT DEFAULT 'elado',
            tipus TEXT,
            varos TEXT,
            telepules TEXT,
            cim TEXT,
            nm DOUBLE PRECISION,
            szobak INTEGER,
            kert_ar DOUBLE PRECISION,
            leiras TEXT,
            nev TEXT,
            email TEXT,
            telefon TEXT,
            elerhetoseg TEXT,
            opciok JSONB DEFAULT '[]'::jsonb,
            jutalek NUMERIC(5,2),
            fix_dij NUMERIC(12,2),
            penznem TEXT DEFAULT 'EUR',
            kizarolagos BOOLEAN DEFAULT false,
            idotartam_honap INTEGER DEFAULT 6,
            szerzodes_szam TEXT,
            szerzodes_datum DATE,
            alairva DATE,
            eladasi_ar DOUBLE PRECISION,
            eladva DATE,
            admin_jegyzet TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_megbizas_user ON megbizasok (user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_megbizas_statusz ON megbizasok (statusz)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_megbizas_ingatlan ON megbizasok (ingatlan_id)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS megbizas_erdeklodok (
            id SERIAL PRIMARY KEY,
            megbizas_id INTEGER REFERENCES megbizasok(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            nev TEXT,
            telefon TEXT,
            email TEXT,
            koltsegkeret DOUBLE PRECISION,
            finanszirozas TEXT,
            statusz TEXT DEFAULT 'uj',
            megjegyzes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mb_erd ON megbizas_erdeklodok (megbizas_id)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS megbizas_megtekintesek (
            id SERIAL PRIMARY KEY,
            megbizas_id INTEGER REFERENCES megbizasok(id) ON DELETE CASCADE,
            erdeklodo_id INTEGER REFERENCES megbizas_erdeklodok(id) ON DELETE SET NULL,
            idopont TIMESTAMP,
            javasolt TEXT,
            statusz TEXT DEFAULT 'kert',
            visszajelzes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mb_megt ON megbizas_megtekintesek (megbizas_id)`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS megbizas_ajanlatok (
            id SERIAL PRIMARY KEY,
            megbizas_id INTEGER REFERENCES megbizasok(id) ON DELETE CASCADE,
            erdeklodo_id INTEGER REFERENCES megbizas_erdeklodok(id) ON DELETE SET NULL,
            osszeg DOUBLE PRECISION,
            penznem TEXT DEFAULT 'EUR',
            feltetelek TEXT,
            statusz TEXT DEFAULT 'uj',
            ellenajanlat DOUBLE PRECISION,
            elado_valasz TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mb_ajanlat ON megbizas_ajanlatok (megbizas_id)`);

    // Napló: státuszváltás, jegyzet, egyeztetés az eladóval
    await db.query(`
        CREATE TABLE IF NOT EXISTS megbizas_naplo (
            id SERIAL PRIMARY KEY,
            megbizas_id INTEGER REFERENCES megbizasok(id) ON DELETE CASCADE,
            tipus TEXT DEFAULT 'jegyzet',
            szoveg TEXT,
            lathato_eladonak BOOLEAN DEFAULT false,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mb_naplo ON megbizas_naplo (megbizas_id)`);

    // A megbízásos hirdetés jelölése (a hirdetés oldalán: „Az IngatlanPro értékesíti”)
    await db.query(`ALTER TABLE ingatlanok ADD COLUMN IF NOT EXISTS megbizas_id INTEGER`);

    // ---------- Megbízások 2: felelősök, ajánlat-mód, szerződés-folyamat, iratok ----------
    const mbOszlopok = [
        "felelos_id INTEGER",            // ki viszi (értékesítő)
        "fotos_id INTEGER",              // ki fotózza
        "bemutato_id INTEGER",           // ki mutatja be
        "ajanlat_mod TEXT",              // jovahagyas | azonnal | NULL = a beállítás szerint
        "szerzodes_allapot TEXT DEFAULT 'tervezet'",   // tervezet | elkuldve | elfogadva | alairva
        "szerzodes_elkuldve TIMESTAMP",
        "szerzodes_elfogadva TIMESTAMP",
        "szerzodes_elfogadva_ip TEXT",
        "iratok JSONB DEFAULT '{}'::jsonb",            // { kod: { megvan, datum, megj } }
        "dijbekero_id INTEGER",
        "elso_kapcsolat TIMESTAMP"
    ];
    for (const o of mbOszlopok) await db.query(`ALTER TABLE megbizasok ADD COLUMN IF NOT EXISTS ${o}`);

    const ajOszlopok = [
        "vegso_osszeg DOUBLE PRECISION",
        "ellen_vevonek BOOLEAN",   // az eladó ellenajánlatát a vevő is látja
        "tovabbitva_at TIMESTAMP",
        "emlekeztetve TIMESTAMP",
        "vevo_valasz TEXT"
    ];
    for (const o of ajOszlopok) await db.query(`ALTER TABLE megbizas_ajanlatok ADD COLUMN IF NOT EXISTS ${o}`);
    // A régi (már az eladónál lévő) ajánlatok: mikor kerültek hozzá
    await db.query(`UPDATE megbizas_ajanlatok SET tovabbitva_at = COALESCE(updated_at, created_at)
                    WHERE tovabbitva_at IS NULL AND statusz IN ('tovabbitva', 'ellenajanlat', 'elfogadva')`);
    // Az eddigi ellenajánlatokat a vevő is látta
    await db.query(`UPDATE megbizas_ajanlatok SET ellen_vevonek = true WHERE statusz = 'ellenajanlat' AND ellen_vevonek IS NULL`);
    // A régi aláírt megbízások szerződés-állapota
    await db.query(`UPDATE megbizasok SET szerzodes_allapot = 'alairva' WHERE alairva IS NOT NULL AND COALESCE(szerzodes_allapot, 'tervezet') = 'tervezet'`);

    const mtOszlopok = [
        "bemutato_id INTEGER",
        "emlekeztetve TIMESTAMP",
        "visszajelzes_kerve TIMESTAMP"
    ];
    for (const o of mtOszlopok) await db.query(`ALTER TABLE megbizas_megtekintesek ADD COLUMN IF NOT EXISTS ${o}`);

    await db.query(`ALTER TABLE megbizas_erdeklodok ADD COLUMN IF NOT EXISTS forras TEXT`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mb_erd_user ON megbizas_erdeklodok (user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mb_ajanlat_erd ON megbizas_ajanlatok (erdeklodo_id)`);

    // Üzenetek egy megbízáshoz: az eladóval (erdeklodo_id NULL) vagy egy vevővel
    //  irany: 'be' = az ügyfél írta, 'ki' = mi (admin / munkatárs)
    await db.query(`
        CREATE TABLE IF NOT EXISTS megbizas_uzenetek (
            id SERIAL PRIMARY KEY,
            megbizas_id INTEGER REFERENCES megbizasok(id) ON DELETE CASCADE,
            erdeklodo_id INTEGER REFERENCES megbizas_erdeklodok(id) ON DELETE CASCADE,
            irany TEXT DEFAULT 'ki',
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            szoveg TEXT,
            olvasva BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mb_uzenet ON megbizas_uzenetek (megbizas_id, erdeklodo_id)`);

    // ---------- Csapat: munkatársak és jogosultságaik ----------
    // Egy munkatárs (fotós, bemutató, régiós kezelő, értékesítő) a saját
    // fiókjával lép be, és csak ahhoz fér hozzá, amire az admin engedélyt adott.
    await db.query(`
        CREATE TABLE IF NOT EXISTS csapat_tagok (
            id SERIAL PRIMARY KEY,
            user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            szerep TEXT DEFAULT 'egyeni',
            aktiv BOOLEAN DEFAULT true,
            megjegyzes TEXT,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // Egy hozzáférés: milyen jogok (kepek, hirdetes, megtekintes, megbizas_lat,
    // megbizas) mire (mind | varos [+ tipus] | megbizas | ingatlan), meddig
    await db.query(`
        CREATE TABLE IF NOT EXISTS csapat_jogok (
            id SERIAL PRIMARY KEY,
            tag_id INTEGER REFERENCES csapat_tagok(id) ON DELETE CASCADE,
            jogok JSONB DEFAULT '[]'::jsonb,
            hatokor TEXT DEFAULT 'varos',
            varos TEXT,
            tipus TEXT,
            megbizas_id INTEGER REFERENCES megbizasok(id) ON DELETE CASCADE,
            ingatlan_id INTEGER REFERENCES ingatlanok(id) ON DELETE CASCADE,
            lejar DATE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_csapat_jogok_tag ON csapat_jogok (tag_id)`);

    // ---------- Megbízások 3: szakaszok és kapuk, naptár, ajánlat-adatok, iratfájlok ----------
    // Egy megbízás = egy szál, hét szakasz (Igénylés → Egyeztetés → Szerződés →
    // Előkészítés → Hirdetés és megtekintések → Ajánlatok → Adásvétel); a
    // szakaszok közötti „kapuk” adatai, a megtekintési naptár, az adásvétel lépései.
    const mb3 = [
        "naptar JSONB",                         // idősávok, hossz, szünet, mód, kapacitás...
        "feladatok JSONB DEFAULT '{}'::jsonb",  // előkészítés: { foto: { kesz, datum, ki } ... }
        "csomag_kuldve TIMESTAMP",              // a végleges csomagot elküldtük jóváhagyásra
        "csomag_jovahagyva TIMESTAMP",
        "csomag_jovahagyta TEXT",               // elado | csapat (telefonon)
        "hirdetes_kuldve TIMESTAMP",            // a hirdetés előnézetét elküldtük jóváhagyásra
        "hirdetes_jovahagyva TIMESTAMP",
        "hirdetve TIMESTAMP",                   // mikor lett nyilvános
        "szerzodes_mod TEXT",                   // online | szemelyes
        "szerzodes_kod_hash TEXT",
        "szerzodes_kod_lejar TIMESTAMP",
        "szerzodes_kod_proba INTEGER DEFAULT 0",
        "szerzodes_kod_ok BOOLEAN",
        "szerzodes_hash TEXT",                  // az elfogadott szöveg ujjlenyomata
        "szerzodes_ua TEXT",
        "korai_kezdes BOOLEAN",
        "szemelyes_javaslat TEXT",
        "ellenjegyezve TIMESTAMP",
        "ellenjegyezte INTEGER",
        "fotozas_idopont TIMESTAMP",
        "eloszerzodes_datum DATE",
        "foglalo DOUBLE PRECISION",
        "kozjegyzo_idopont TIMESTAMP",
        "kozjegyzo TEXT",
        "kulcsatadas DATE",
        "adasvetel_ajanlat_id INTEGER",
        "statusz_valtva TIMESTAMP"
    ];
    for (const o of mb3) await db.query(`ALTER TABLE megbizasok ADD COLUMN IF NOT EXISTS ${o}`);
    // A régi aláírt szerződések: ellenjegyzettnek számítanak
    await db.query(`UPDATE megbizasok SET ellenjegyezve = alairva::timestamp WHERE alairva IS NOT NULL AND ellenjegyezve IS NULL`);
    await db.query(`UPDATE megbizasok SET statusz_valtva = COALESCE(updated_at, created_at) WHERE statusz_valtva IS NULL`);
    await db.query(`UPDATE megbizasok SET hirdetve = COALESCE(updated_at, created_at) WHERE hirdetve IS NULL AND statusz IN ('hirdetes', 'targyalas', 'eladva')`);

    await db.query(`ALTER TABLE megbizas_erdeklodok ADD COLUMN IF NOT EXISTS ajanlat_engedve BOOLEAN DEFAULT false`);
    await db.query(`ALTER TABLE megbizas_erdeklodok ADD COLUMN IF NOT EXISTS sorszam INTEGER`);
    // A vevők sorszáma megbízásonként (az eladó „Vevő #3”-ként látja őket)
    await db.query(`
        UPDATE megbizas_erdeklodok e SET sorszam = x.n
        FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY megbizas_id ORDER BY id) AS n FROM megbizas_erdeklodok) x
        WHERE x.id = e.id AND e.sorszam IS NULL`);

    for (const o of ["emlekeztetve2 TIMESTAMP", "forras TEXT", "varolista BOOLEAN DEFAULT false", "lezarta INTEGER", "lezarva_at TIMESTAMP"]) {
        await db.query(`ALTER TABLE megbizas_megtekintesek ADD COLUMN IF NOT EXISTS ${o}`);
    }
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mb_megt_ido ON megbizas_megtekintesek (idopont)`);

    const aj3 = [
        "finanszirozas TEXT",          // keszpenz | hitel | vegyes
        "onero DOUBLE PRECISION",
        "hitel_osszeg DOUBLE PRECISION",
        "hitel_allapot TEXT",          // elozetes | folyamatban | nincs
        "bank TEXT",
        "foglalo DOUBLE PRECISION",
        "eloszerzodes_ig DATE",
        "kozjegyzo_ig DATE",
        "ervenyes_ig TIMESTAMP",
        "szandek BOOLEAN",
        "igazolas_id INTEGER"
    ];
    for (const o of aj3) await db.query(`ALTER TABLE megbizas_ajanlatok ADD COLUMN IF NOT EXISTS ${o}`);

    // Fájlok egy megbízáshoz: az eladó iratai, az aláírt szerződés (szkennelve),
    // a vevő hitel-igazolása. Az adat az adatbázisban (nincs külön tárhely).
    await db.query(`
        CREATE TABLE IF NOT EXISTS megbizas_fajlok (
            id SERIAL PRIMARY KEY,
            megbizas_id INTEGER REFERENCES megbizasok(id) ON DELETE CASCADE,
            tipus TEXT DEFAULT 'irat',
            kod TEXT,
            nev TEXT,
            mime TEXT,
            meret INTEGER,
            adat BYTEA,
            lathato_eladonak BOOLEAN DEFAULT true,
            feltoltotte INTEGER REFERENCES users(id) ON DELETE SET NULL,
            erdeklodo_id INTEGER REFERENCES megbizas_erdeklodok(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mb_fajl ON megbizas_fajlok (megbizas_id)`);

    // Kiemelések (promóciók): a hirdetés ennyi ideig kiemelt – a lista elején,
    // „Kiemelt” jelöléssel. Forrás: megvásárolt kiemelés (rendelés), a csomag
    // havi kerete, vagy az admin adta.
    await db.query(`
        CREATE TABLE IF NOT EXISTS ingatlan_kiemelesek (
            id SERIAL PRIMARY KEY,
            ingatlan_id INTEGER REFERENCES ingatlanok(id) ON DELETE CASCADE,
            kezdet TIMESTAMP NOT NULL DEFAULT NOW(),
            vege TIMESTAMP NOT NULL,
            forras TEXT DEFAULT 'admin',
            rendeles_id INTEGER REFERENCES penzugy_rendelesek(id) ON DELETE SET NULL,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            iroda_id INTEGER REFERENCES irodak(id) ON DELETE SET NULL,
            statusz TEXT DEFAULT 'aktiv',
            megjegyzes TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_kiemeles_ingatlan ON ingatlan_kiemelesek (ingatlan_id, vege)`);

    // Online fizetések (Stripe): egy díjbekérőhöz egy vagy több próbálkozás
    await db.query(`
        CREATE TABLE IF NOT EXISTS online_fizetesek (
            id SERIAL PRIMARY KEY,
            szamla_id INTEGER REFERENCES penzugy_szamlak(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            szolgaltato TEXT DEFAULT 'stripe',
            munkamenet TEXT UNIQUE,
            fizetes_azon TEXT,
            osszeg NUMERIC(12,2),
            penznem TEXT,
            statusz TEXT DEFAULT 'indult',
            hiba TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            fizetve_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_online_fizetes_szamla ON online_fizetesek (szamla_id)`);

    // A hivatalos számla (SmartBill / Oblio) adatai a díjbekérőn
    await db.query(`ALTER TABLE penzugy_szamlak ADD COLUMN IF NOT EXISTS hivatalos_szamlazo TEXT`);
    await db.query(`ALTER TABLE penzugy_szamlak ADD COLUMN IF NOT EXISTS hivatalos_link TEXT`);
    await db.query(`ALTER TABLE penzugy_szamlak ADD COLUMN IF NOT EXISTS hivatalos_hiba TEXT`);
    await db.query(`ALTER TABLE penzugy_szamlak ADD COLUMN IF NOT EXISTS hivatalos_at TIMESTAMP`);

    // Saját számla: melyik díjbekérőből készült (a kifizetett díjbekérőből az
    // app maga állítja ki a számlát, ha nincs külső számlázó)
    await db.query(`ALTER TABLE penzugy_szamlak ADD COLUMN IF NOT EXISTS dijbekero_id INTEGER REFERENCES penzugy_szamlak(id) ON DELETE SET NULL`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_pu_szamla_dijbekero ON penzugy_szamlak (dijbekero_id)`);

    // Hivatalos számla (2026. október): sztornó számla hivatkozása az eredetire,
    // az árfolyam a kiállításkor (nem lejes számlán az ÁFA lejben is kell),
    // az e-Factura ANAF-ellenőrzés eredménye
    for (const o of ["sztorno_eredeti_id INTEGER REFERENCES penzugy_szamlak(id) ON DELETE SET NULL", "arfolyam NUMERIC(12,4)", "arfolyam_datum DATE",
        "efactura_ellenorizve TIMESTAMP", "efactura_ok BOOLEAN"]) {
        await db.query(`ALTER TABLE penzugy_szamlak ADD COLUMN IF NOT EXISTS ${o}`);
    }
    await db.query(`CREATE INDEX IF NOT EXISTS idx_pu_szamla_sztorno ON penzugy_szamlak (sztorno_eredeti_id)`);
    // A tétel neve románul (a hivatalos számlán) és angolul (fordításhoz)
    await db.query(`ALTER TABLE penzugy_tetelek ADD COLUMN IF NOT EXISTS megnevezes_ro TEXT`);
    await db.query(`ALTER TABLE penzugy_tetelek ADD COLUMN IF NOT EXISTS megnevezes_en TEXT`);
    // A vevő címe az e-Facturához: település, megye (RO-CV), ország; ÁFA-alany-e
    for (const o of ["varos TEXT", "megye TEXT", "orszag TEXT DEFAULT 'RO'", "afa_alany BOOLEAN DEFAULT false"]) {
        await db.query(`ALTER TABLE penzugy_ugyfelek ADD COLUMN IF NOT EXISTS ${o}`);
    }

    // Irattár: a cég iratai rendezetten – két rész:
    //   szamla     számlák és pénzügyi iratok (bejövő számla, nyugta, bankkivonat...)
    //   szerzodes  szerződések (ügyfél, partner, szolgáltató, bérleti...)
    // A fájl az adatbázisban (bytea) – a lista nem tölti be.
    await db.query(`
        CREATE TABLE IF NOT EXISTS irattar (
            id SERIAL PRIMARY KEY,
            resz TEXT NOT NULL DEFAULT 'szamla',
            kategoria TEXT NOT NULL DEFAULT 'egyeb',
            cim TEXT NOT NULL,
            partner TEXT,
            szam TEXT,
            datum DATE DEFAULT CURRENT_DATE,
            osszeg NUMERIC(12,2),
            penznem TEXT DEFAULT 'RON',
            kezdet DATE,
            lejar DATE,
            felmondas_nap INTEGER,
            statusz TEXT DEFAULT 'aktiv',
            megjegyzes TEXT,
            cimkek TEXT,
            fajl_nev TEXT,
            fajl_mime TEXT,
            fajl_meret INTEGER,
            fajl_hash TEXT,
            fajl BYTEA,
            szamla_id INTEGER REFERENCES penzugy_szamlak(id) ON DELETE SET NULL,
            kiadas_id INTEGER REFERENCES penzugy_kiadasok(id) ON DELETE SET NULL,
            megbizas_id INTEGER REFERENCES megbizasok(id) ON DELETE SET NULL,
            feltoltotte INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_irattar_resz ON irattar (resz, kategoria, datum)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_irattar_kiadas ON irattar (kiadas_id)`);

    // e-Factura automatikus beküldés (2026. október – services/efacturaSpv.js):
    //   efactura_allapot  NULL (nincs elküldve) | feldolgozas | ok | nok | hiba | kezi (az SPV-ben kézzel)
    //   efactura_index    az ANAF feltöltési indexe (index_incarcare)
    //   efactura_letoltes a válasz letöltési azonosítója (id_descarcare)
    for (const o of ["efactura_allapot TEXT", "efactura_index TEXT", "efactura_letoltes TEXT", "efactura_kuldve TIMESTAMP",
        "efactura_valasz_at TIMESTAMP", "efactura_hiba TEXT", "efactura_b2c BOOLEAN"]) {
        await db.query(`ALTER TABLE penzugy_szamlak ADD COLUMN IF NOT EXISTS ${o}`);
    }
    await db.query(`CREATE INDEX IF NOT EXISTS idx_pu_szamla_efactura ON penzugy_szamlak (efactura_allapot)`);
    // Az ANAF válasza (ZIP: a számla XML + az ANAF digitális aláírása) – 5 évig megőrzendő
    await db.query(`
        CREATE TABLE IF NOT EXISTS efactura_valaszok (
            szamla_id INTEGER PRIMARY KEY REFERENCES penzugy_szamlak(id) ON DELETE CASCADE,
            letoltes_id TEXT,
            allapot TEXT,
            zip BYTEA,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    // A beérkező e-Factura számlák (az ANAF-ból letöltve): az ANAF üzenet azonosítója
    await db.query(`ALTER TABLE irattar ADD COLUMN IF NOT EXISTS anaf_id TEXT`);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_irattar_anaf ON irattar (anaf_id) WHERE anaf_id IS NOT NULL`);

    // Reklámfelület bérlése (services/reklamSzamla.js): ügyfél, havi ár, számlázás,
    // szerződés online elfogadással, megjelenés csak a befizetés után
    for (const o of ["ugyfel_id INTEGER REFERENCES penzugy_ugyfelek(id) ON DELETE SET NULL", "penznem TEXT DEFAULT 'RON'",
        "szamlazas TEXT DEFAULT 'egyben'", "fizetes_utan BOOLEAN DEFAULT false", "szerzodes_kell BOOLEAN DEFAULT true", "szerzodes_szam TEXT", "szerzodes_token TEXT",
        "szerzodes_kuldve TIMESTAMP", "szerzodes_elfogadva TIMESTAMP", "szerzodes_ip TEXT", "elofizetes_id INTEGER"]) {
        await db.query(`ALTER TABLE reklamok ADD COLUMN IF NOT EXISTS ${o}`);
    }
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_reklam_token ON reklamok (szerzodes_token) WHERE szerzodes_token IS NOT NULL`);
    await db.query(`ALTER TABLE penzugy_elofizetesek ADD COLUMN IF NOT EXISTS reklam_id INTEGER REFERENCES reklamok(id) ON DELETE SET NULL`);
    // Reklámfelület-bérlési kérések a weboldalról (services/reklamKeres.js)
    await db.query(`
        CREATE TABLE IF NOT EXISTS reklam_keresek (
            id SERIAL PRIMARY KEY,
            nev TEXT NOT NULL,
            ceg TEXT,
            cui TEXT,
            email TEXT NOT NULL,
            telefon TEXT,
            cim TEXT,
            varos TEXT,
            helyek JSONB DEFAULT '[]'::jsonb,
            kezdet TEXT,
            honap INTEGER DEFAULT 1,
            weboldal TEXT,
            uzenet TEXT,
            nyelv TEXT,
            statusz TEXT DEFAULT 'uj',
            admin_megjegyzes TEXT,
            reklam_id INTEGER REFERENCES reklamok(id) ON DELETE SET NULL,
            ugyfel_id INTEGER REFERENCES penzugy_ugyfelek(id) ON DELETE SET NULL,
            ip TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_reklam_keres_statusz ON reklam_keresek (statusz, created_at DESC)`);
    // Kiadás, amit a beérkezett e-Factura számlából az app vett fel (ellenőrizendő)
    await db.query(`ALTER TABLE penzugy_kiadasok ADD COLUMN IF NOT EXISTS auto BOOLEAN DEFAULT false`);
    // Szinkron a gépre (Irattár → a helyi mappa): a letöltött iratok
    await db.query(`
        CREATE TABLE IF NOT EXISTS irattar_szinkron (
            kulcs TEXT PRIMARY KEY,
            letoltve TIMESTAMP DEFAULT NOW()
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
