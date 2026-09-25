require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

const db = require("./database");
const { becsles } = require("./valuation");
const { normalize, hianyzoMezok, parseKepek } = require("./listing");
const { scrape } = require("./scraper");
const { geocode } = require("./geocode");
const duplikatumok = require("./duplicates");
const importer = require("./importer");
const quality = require("./quality");
const ai = require("./ai");

const app = express();

const ROOT = path.join(__dirname, "../");

console.log("Server indul...");

// ===================== ÉLETJEL (jelszó nélkül) =====================

app.get("/healthz", (req, res) => {
    res.json({ ok: true });
});

// ===================== BELÉPÉS ÉS JOGOSULTSÁG =====================
//
//  ADMIN_USER / ADMIN_PASSWORD  -> admin: mindent módosíthat
//  APP_USER   / APP_PASSWORD    -> felhasználó: böngészhet, hirdetést tölthet fel
//
//  Ha csak az APP_PASSWORD van beállítva, az a belépés admin
//  (így a korábbi beállítás változtatás nélkül működik tovább).
//  Ha egyik sincs beállítva (helyi fejlesztés), mindenki admin.

const FIOKOK = [];

if (process.env.ADMIN_PASSWORD) {
    FIOKOK.push({ user: process.env.ADMIN_USER || "admin", pass: process.env.ADMIN_PASSWORD, szerep: "admin" });
}

if (process.env.APP_PASSWORD) {
    FIOKOK.push({
        user: process.env.APP_USER || "user",
        pass: process.env.APP_PASSWORD,
        szerep: process.env.ADMIN_PASSWORD ? "user" : "admin"
    });
}

function safeEqual(a, b) {
    const ha = crypto.createHash("sha256").update(String(a)).digest();
    const hb = crypto.createHash("sha256").update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

// Időzített futtatás (pl. cron-job.org) – saját kulccsal, jelszó nélkül
app.post("/api/cron/run", async (req, res) => {

    const kulcs = process.env.CRON_KEY;

    if (!kulcs || !safeEqual(req.query.key || "", kulcs)) {
        return res.status(403).json({ error: "forbidden" });
    }

    // Azonnal válaszolunk, a munka a háttérben fut
    res.json({ elindult: true });

    // 1) figyelt találati listák (új hirdetések), 2) meglévők elérhetősége
    importer.figyeltFuttat()
        .then(() => importer.figyelesIndit({ limit: 150 }).promise)
        .catch(err => console.error("Cron hiba:", err));

});

if (FIOKOK.length) {

    app.use((req, res, next) => {

        const header = req.headers.authorization || "";
        const [scheme, encoded] = header.split(" ");

        if (scheme === "Basic" && encoded) {

            const decoded = Buffer.from(encoded, "base64").toString("utf8");
            const sep = decoded.indexOf(":");
            const user = decoded.slice(0, sep);
            const pass = decoded.slice(sep + 1);

            const fiok = sep > -1 && FIOKOK.find(f => safeEqual(user, f.user) && safeEqual(pass, f.pass));

            if (fiok) {
                req.szerep = fiok.szerep;
                req.felhasznalo = fiok.user;
                return next();
            }

        }

        res.set("WWW-Authenticate", 'Basic realm="IngatlanPro", charset="UTF-8"');
        res.status(401).send("Bejelentkezés szükséges.");

    });

    console.log(`🔒 Jelszavas védelem BEKAPCSOLVA (${FIOKOK.map(f => f.szerep).join(", ")}).`);

} else {

    app.use((req, res, next) => {
        req.szerep = "admin";
        req.felhasznalo = "local";
        next();
    });

    console.warn("⚠️  Nincs jelszó beállítva – az oldal jelszó nélkül, admin joggal érhető el!");

}

function csakAdmin(req, res, next) {
    if (req.szerep === "admin") return next();
    res.status(403).json({ error: "admin_only" });
}

app.use(cors());

// Nagyobb limit a képek miatt (a böngésző előtte lekicsinyíti őket)
app.use(express.json({ limit: "40mb" }));

// ===================== STATIKUS FÁJLOK =====================

app.use("/js", express.static(path.join(ROOT, "js")));
app.use("/css", express.static(path.join(ROOT, "css")));
app.use("/assets", express.static(path.join(ROOT, "assets")));
app.use("/libs", express.static(path.join(ROOT, "libs")));

app.get("/", (req, res) => {
    res.sendFile(path.join(ROOT, "index.html"));
});

function hiba(res, err) {
    console.error(err);
    res.status(500).json({ error: "server_error", message: err.message });
}

// ===================== FELHASZNÁLÓ =====================

app.get("/api/me", (req, res) => {
    res.json({ szerep: req.szerep, felhasznalo: req.felhasznalo });
});

// ===================== INGATLANOK =====================

const LISTA_MEZOK = `
    i.id, i.link, i.ar, i.nm, i.arnm AS "arNm", i.szobak, i.emelet, i.allapot, i.eladva,
    i.x, i.y, i.varos, i.kerulet, i.tipus, i.ugylet, i.cim, i.telek_nm, i.statusz,
    i.forras_tipus, i.hely_pontossag, i.kulso_kepek, i.tovabbi_linkek, i.hianyzo,
    i.problemak, i.ellenorzott, i.jovahagyva, i.forras_kerulet, i.evszam, i.utolso_ellenorzes,
    i.created_at, i.updated_at,
    (SELECT k.id FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id ORDER BY k.sorrend, k.id LIMIT 1) AS kep_id,
    (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id)::int AS kep_db
`;

app.get("/api/ingatlanok", async (req, res) => {

    try {

        const city = req.query.city;

        const result = city
            ? await db.query(`SELECT ${LISTA_MEZOK} FROM ingatlanok i WHERE i.varos = $1 AND i.statusz = 'aktiv' ORDER BY i.id`, [city])
            : await db.query(`SELECT ${LISTA_MEZOK} FROM ingatlanok i WHERE i.statusz = 'aktiv' ORDER BY i.id`);

        res.json(result.rows);

    } catch (err) {
        hiba(res, err);
    }

});

app.get("/api/ingatlanok/:id", async (req, res) => {

    try {

        const r = await db.query(`SELECT ${LISTA_MEZOK}, i.leiras, i.forras_szoveg FROM ingatlanok i WHERE i.id = $1`, [req.params.id]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const kepek = await db.query(
            "SELECT id FROM ingatlan_kepek WHERE ingatlan_id = $1 ORDER BY sorrend, id",
            [req.params.id]
        );

        res.json({ ...r.rows[0], kepek: kepek.rows.map(k => k.id) });

    } catch (err) {
        hiba(res, err);
    }

});

async function vannakKeruletek(varos) {
    if (!varos) return false;
    const r = await db.query("SELECT 1 FROM keruletek WHERE varos = $1 LIMIT 1", [varos]);
    return r.rowCount > 0;
}

async function kepeketMent(client, ingatlanId, kepek, kezdoSorrend = 0) {

    let sorrend = kezdoSorrend;

    for (const k of kepek) {
        await client.query(
            "INSERT INTO ingatlan_kepek (ingatlan_id, sorrend, mime, adat) VALUES ($1,$2,$3,$4)",
            [ingatlanId, sorrend++, k.mime, k.adat]
        );
    }

}

// Új hirdetés – bárki (bejelentkezve). Minden kötelező adatot ki kell tölteni.
app.post("/api/ingatlanok", async (req, res) => {

    let client;

    try {

        client = await db.connect();

        const d = normalize(req.body);
        const kepek = parseKepek(req.body.kepek);

        const hianyzo = hianyzoMezok(d, {
            mod: d.link ? "link" : "kezi",
            kepDb: kepek.length,
            vannakKeruletek: await vannakKeruletek(d.varos)
        });

        if (hianyzo.length) {
            return res.status(400).json({ error: "missing_fields", hianyzo });
        }

        // Gyanús adatok (pl. irreális €/m²) – a hirdetés megjelenik, de az admin ellenőrzi
        const q = await quality.ertekel(d, { mod: d.link ? "link" : "kezi", kepDb: kepek.length });

        await client.query("BEGIN");

        const r = await client.query(`
            INSERT INTO ingatlanok
            (link, ar, nm, arnm, szobak, emelet, allapot, eladva, x, y, varos, kerulet,
             tipus, ugylet, cim, leiras, telek_nm, statusz, forras_tipus, hely_pontossag,
             kulso_kepek, hianyzo, problemak, ellenorzott, forras_szoveg)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'aktiv','kezi',$18,$19::jsonb,'[]'::jsonb,$20::jsonb,$21,$22)
            RETURNING id
        `, [
            d.link, d.ar, d.nm, d.arnm, d.szobak, d.emelet, d.allapot, d.eladva, d.x, d.y,
            d.varos, d.kerulet, d.tipus, d.ugylet, d.cim, d.leiras, d.telek_nm, d.hely_pontossag,
            JSON.stringify(d.kulso_kepek || []), JSON.stringify(q.problemak), q.ellenorzott,
            req.body.forras_szoveg ? String(req.body.forras_szoveg).slice(0, 5000) : null
        ]);

        const id = r.rows[0].id;

        await kepeketMent(client, id, kepek);

        await client.query("COMMIT");

        res.json({ siker: true, id });

    } catch (err) {

        if (client) await client.query("ROLLBACK").catch(() => { });
        hiba(res, err);

    } finally {

        if (client) client.release();

    }

});

// Hirdetés módosítása – egyelőre csak admin (a 2. verzióban a tulajdonos is)
//  body.jovahagy = true   -> függő (importált) hirdetés élesítése
//  body.torlendoKepek     -> törlendő képek azonosítói
//  body.kepek             -> új képek (data URL)
app.put("/api/ingatlanok/:id", csakAdmin, async (req, res) => {

    let client;

    try {

        client = await db.connect();

        const id = Number(req.params.id);

        const regi = await client.query("SELECT statusz, forras_tipus, jovahagyva, forras_kerulet, kerulet FROM ingatlanok WHERE id = $1", [id]);

        if (!regi.rowCount) return res.status(404).json({ error: "not_found" });

        const elozo = regi.rows[0];

        const d = normalize(req.body);
        const ujKepek = parseKepek(req.body.kepek);
        const torlendo = Array.isArray(req.body.torlendoKepek) ? req.body.torlendoKepek.map(Number).filter(Boolean) : [];

        const maradoKep = await client.query(
            "SELECT COUNT(*)::int AS n FROM ingatlan_kepek WHERE ingatlan_id = $1 AND NOT (id = ANY($2::int[]))",
            [id, torlendo]
        );

        const kepDb = maradoKep.rows[0].n + ujKepek.length;
        const importalt = elozo.forras_tipus === "import";

        let statusz = elozo.statusz;
        let jovahagyva = !!elozo.jovahagyva;

        // Jóváhagyás: az alapadatok mindenképp kellenek
        if (req.body.jovahagy) {

            const alap = hianyzoMezok(d, { mod: "import" }).filter(m => ["ar", "nm", "varos", "hely"].includes(m));

            if (alap.length) {
                return res.status(400).json({ error: "missing_fields", hianyzo: alap });
            }

            statusz = "aktiv";
            jovahagyva = true;

        }

        d.forras_kerulet = elozo.forras_kerulet;

        const q = await quality.ertekel(d, {
            mod: importalt ? "import" : (d.link ? "link" : "kezi"),
            kepDb,
            jovahagyva
        });

        const hianyzo = q.hianyzo;

        // Ha az admin kerületet rendelt egy ismeretlen forrás-környékhez,
        // megjegyezzük, hogy legközelebb magától menjen
        if (d.kerulet && elozo.forras_kerulet && d.kerulet !== elozo.kerulet) {
            await quality.aliasHozzaad(d.varos, d.kerulet, elozo.forras_kerulet);
        }

        await client.query("BEGIN");

        await client.query(`
            UPDATE ingatlanok SET
                link=$1, ar=$2, nm=$3, arnm=$4, szobak=$5, emelet=$6, allapot=$7, eladva=$8,
                x=$9, y=$10, varos=$11, kerulet=$12, tipus=$13, ugylet=$14, cim=$15, leiras=$16,
                telek_nm=$17, hely_pontossag=$18, kulso_kepek=$19::jsonb, statusz=$20,
                hianyzo=$21::jsonb, tovabbi_linkek=COALESCE($22::jsonb, tovabbi_linkek),
                problemak=$23::jsonb, ellenorzott=$24, jovahagyva=$25, updated_at=NOW()
            WHERE id=$26
        `, [
            d.link, d.ar, d.nm, d.arnm, d.szobak, d.emelet, d.allapot, d.eladva,
            d.x, d.y, d.varos, d.kerulet, d.tipus, d.ugylet, d.cim, d.leiras,
            d.telek_nm, d.hely_pontossag, JSON.stringify(d.kulso_kepek || []), statusz,
            JSON.stringify(hianyzo), d.tovabbi_linkek ? JSON.stringify(d.tovabbi_linkek) : null,
            JSON.stringify(q.problemak), q.ellenorzott, jovahagyva, id
        ]);

        if (torlendo.length) {
            await client.query("DELETE FROM ingatlan_kepek WHERE ingatlan_id = $1 AND id = ANY($2::int[])", [id, torlendo]);
        }

        const max = await client.query("SELECT COALESCE(MAX(sorrend), -1) AS m FROM ingatlan_kepek WHERE ingatlan_id = $1", [id]);

        await kepeketMent(client, id, ujKepek, max.rows[0].m + 1);

        await client.query("COMMIT");

        res.json({ siker: true, hianyzo, problemak: q.problemak, ellenorzott: q.ellenorzott, statusz });

    } catch (err) {

        if (client) await client.query("ROLLBACK").catch(() => { });
        hiba(res, err);

    } finally {

        if (client) client.release();

    }

});

app.delete("/api/ingatlanok/:id", csakAdmin, async (req, res) => {

    try {

        await db.query("DELETE FROM favorites WHERE property_id = $1", [req.params.id]);
        await db.query("DELETE FROM ingatlanok WHERE id = $1", [req.params.id]);

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// Tömeges kerület-beállítás
app.patch("/api/ingatlanok/bulk-kerulet", csakAdmin, async (req, res) => {

    try {

        const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(n => !isNaN(n)) : [];
        const kerulet = (req.body.kerulet || "").trim();

        if (ids.length === 0) return res.status(400).json({ error: "Hiányzó ingatlan azonosítók" });
        if (!kerulet) return res.status(400).json({ error: "Hiányzó kerület" });

        await db.query("UPDATE ingatlanok SET kerulet=$1, updated_at=NOW() WHERE id = ANY($2::int[])", [kerulet, ids]);

        res.json({ siker: true, updated: ids.length });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== KÉPEK =====================

app.get("/api/kepek/:id", async (req, res) => {

    try {

        const r = await db.query("SELECT mime, adat FROM ingatlan_kepek WHERE id = $1", [req.params.id]);

        if (!r.rowCount) return res.status(404).end();

        res.set("Content-Type", r.rows[0].mime);
        res.set("Cache-Control", "private, max-age=31536000, immutable");
        res.send(r.rows[0].adat);

    } catch (err) {
        hiba(res, err);
    }

});

// Más oldalak képeinek továbbítása (így a forrásoldal nem tilthatja le,
// és nem kell a böngészőnek közvetlenül oda fordulnia). Kis memóriás
// gyorstárral, hogy ugyanazt a képet ne kérjük le újra és újra.
const kepCache = new Map();
let kepCacheMeret = 0;
const KEP_CACHE_MAX = 60 * 1024 * 1024;

app.get("/api/img", async (req, res) => {

    try {

        const u = String(req.query.u || "");

        if (!/^https:\/\//i.test(u) || u.length > 2000) return res.status(400).end();

        const host = new URL(u).hostname;

        if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return res.status(400).end();

        const cached = kepCache.get(u);

        if (cached) {
            res.set("Content-Type", cached.type);
            res.set("Cache-Control", "private, max-age=604800");
            return res.send(cached.buf);
        }

        const valasz = await fetch(u, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
                "Referer": "https://" + host.split(".").slice(-2).join(".") + "/",
                "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"
            },
            signal: AbortSignal.timeout(15000)
        });

        const type = valasz.headers.get("content-type") || "";

        if (!valasz.ok || !type.startsWith("image/")) return res.status(404).end();

        const buf = Buffer.from(await valasz.arrayBuffer());

        if (buf.length > 8 * 1024 * 1024) return res.status(413).end();

        kepCache.set(u, { type, buf });
        kepCacheMeret += buf.length;

        while (kepCacheMeret > KEP_CACHE_MAX && kepCache.size) {
            const [k, v] = kepCache.entries().next().value;
            kepCache.delete(k);
            kepCacheMeret -= v.buf.length;
        }

        res.set("Content-Type", type);
        res.set("Cache-Control", "private, max-age=604800");
        res.send(buf);

    } catch (err) {

        res.status(502).end();

    }

});

// ===================== LINK BEOLVASÁSA =====================
// Bárki használhatja az "Új ingatlan" űrlapon az adatok előtöltésére.

app.post("/api/scrape", async (req, res) => {

    try {

        const url = String(req.body.url || "").trim();

        if (!/^https?:\/\//i.test(url)) {
            return res.status(400).json({ error: "bad_url" });
        }

        const d = await scrape(url);

        // A forrásoldal környék-nevéből a mi kerületünk (ha ismert)
        if (req.body.varos) {
            d.keruletNev = await quality.keruletKeres(req.body.varos, d.kerulet, d.utca, d.cim);
        }

        // Ha nincs koordináta, közelítő hely a címből
        if (!(d.x && d.y) && d.cimSzoveg) {
            const hely = await geocode(d.cimSzoveg, req.body.varos);
            if (hely) {
                d.x = hely.x;
                d.y = hely.y;
                d.hely_pontossag = hely.szint;
            }
        }

        res.json(d);

    } catch (err) {

        console.error("Scrape hiba:", err.message);
        res.status(502).json({ error: "scrape_failed", message: err.message });

    }

});

// ===================== VÁROSOK, KERÜLETEK =====================

app.get("/api/varosok", async (req, res) => {

    try {
        const result = await db.query("SELECT id, nev FROM varosok ORDER BY nev");
        res.json(result.rows);
    } catch (err) {
        hiba(res, err);
    }

});

app.post("/api/varosok", csakAdmin, async (req, res) => {

    try {

        const nev = (req.body.nev || "").trim();

        if (!nev) return res.status(400).json({ error: "Hiányzó városnév" });

        const result = await db.query(
            `INSERT INTO varosok (nev) VALUES ($1)
             ON CONFLICT (nev) DO UPDATE SET nev=EXCLUDED.nev
             RETURNING id, nev`,
            [nev]
        );

        res.json(result.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

app.get("/api/keruletek", async (req, res) => {

    try {

        const varos = req.query.varos;

        const result = varos
            ? await db.query("SELECT id, varos, nev, aliasok FROM keruletek WHERE varos=$1 ORDER BY nev", [varos])
            : await db.query("SELECT id, varos, nev, aliasok FROM keruletek ORDER BY varos, nev");

        res.json(result.rows);

    } catch (err) {
        hiba(res, err);
    }

});

app.post("/api/keruletek", csakAdmin, async (req, res) => {

    try {

        const varos = (req.body.varos || "").trim();
        const nev = (req.body.nev || "").trim();

        if (!varos || !nev) return res.status(400).json({ error: "Hiányzó város vagy kerület név" });

        const result = await db.query(
            `INSERT INTO keruletek (varos, nev) VALUES ($1,$2)
             ON CONFLICT (varos, nev) DO UPDATE SET nev=EXCLUDED.nev
             RETURNING id, varos, nev`,
            [varos, nev]
        );

        res.json(result.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

app.put("/api/keruletek/:id", csakAdmin, async (req, res) => {

    try {

        const aliasok = String(req.body.aliasok || "").split(",").map(x => x.trim()).filter(Boolean).join(", ");

        await db.query("UPDATE keruletek SET aliasok = $1 WHERE id = $2", [aliasok || null, req.params.id]);

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== KEDVENCEK =====================

app.get("/api/favorites", async (req, res) => {

    try {

        const result = await db.query(`
            SELECT ${LISTA_MEZOK}
            FROM favorites f
            JOIN ingatlanok i ON i.id = f.property_id
            ORDER BY i.id
        `);

        res.json(result.rows);

    } catch (err) {
        hiba(res, err);
    }

});

app.get("/api/favorites/ids", async (req, res) => {

    try {
        const result = await db.query("SELECT property_id FROM favorites");
        res.json(result.rows.map(r => r.property_id));
    } catch (err) {
        hiba(res, err);
    }

});

app.post("/api/favorites/:id", async (req, res) => {

    try {
        await db.query(
            `INSERT INTO favorites (property_id) VALUES ($1) ON CONFLICT (property_id) DO NOTHING`,
            [req.params.id]
        );
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }

});

app.delete("/api/favorites/:id", async (req, res) => {

    try {
        await db.query("DELETE FROM favorites WHERE property_id=$1", [req.params.id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }

});

// ===================== PIACI STATISZTIKA =====================

// Piaci állapot mentése: város + típus + ügylet szerint
app.post("/api/statistics/save", csakAdmin, async (req, res) => {

    try {

        const varos = (req.body && req.body.varos ? String(req.body.varos) : "").trim() || null;
        const tipus = req.body && req.body.tipus ? String(req.body.tipus) : "lakas";
        const ugylet = req.body && req.body.ugylet ? String(req.body.ugylet) : "elado";

        const felt = ["ar > 0", "nm > 0", "statusz = 'aktiv'", "ellenorzott", "tipus = $1", "ugylet = $2"];
        const params = [tipus, ugylet];

        if (varos) {
            params.push(varos);
            felt.push(`varos = $${params.length}`);
        }

        const where = "WHERE " + felt.join(" AND ");

        const stat = await db.query(`
            SELECT
                COUNT(*) AS property_count,
                AVG(ar) AS avg_price,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ar) AS median_price,
                AVG(nm) AS avg_nm,
                AVG(arnm) AS avg_price_nm,
                MIN(arnm) AS min_price_nm,
                MAX(arnm) AS max_price_nm
            FROM ingatlanok
            ${where}
        `, params);

        const s = stat.rows[0];

        const snapshot = await db.query(`
            INSERT INTO market_snapshots
            (varos, tipus, ugylet, property_count, avg_price, median_price, avg_nm, avg_price_nm, min_price_nm, max_price_nm)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING id
        `, [varos, tipus, ugylet, s.property_count, s.avg_price, s.median_price, s.avg_nm, s.avg_price_nm, s.min_price_nm, s.max_price_nm]);

        const snapshotId = snapshot.rows[0].id;

        const F = "COALESCE(NULLIF(TRIM(split_part(emelet,'/',1)),''),'0')";
        const floorExpr = `
            CASE
                WHEN ${F} !~ '^-?[0-9]+$' THEN 'Ismeretlen'
                WHEN ${F}::int <= 0 THEN 'Földszint'
                WHEN ${F}::int = 1 THEN '1. emelet'
                WHEN ${F}::int = 2 THEN '2. emelet'
                WHEN ${F}::int = 3 THEN '3. emelet'
                ELSE '4+ emelet'
            END`;

        const groups = {
            allapot: "COALESCE(NULLIF(allapot,''), 'Ismeretlen')",
            szobak: "COALESCE(szobak, 0)::text",
            emelet: floorExpr,
            kerulet: "COALESCE(NULLIF(kerulet,''), 'Nincs megadva')"
        };

        for (const [category, expr] of Object.entries(groups)) {

            const rows = await db.query(`
                SELECT ${expr} AS value, COUNT(*) AS property_count, AVG(ar) AS avg_price, AVG(arnm) AS avg_price_nm
                FROM ingatlanok
                ${where}
                GROUP BY 1
                ORDER BY 1
            `, params);

            for (const g of rows.rows) {
                await db.query(`
                    INSERT INTO market_snapshot_groups
                    (snapshot_id, category, value, property_count, avg_price, avg_price_nm)
                    VALUES ($1,$2,$3,$4,$5,$6)
                `, [snapshotId, category, g.value, g.property_count, g.avg_price, g.avg_price_nm]);
            }

        }

        res.json({ success: true, id: snapshotId });

    } catch (err) {
        hiba(res, err);
    }

});

app.get("/api/statistics", async (req, res) => {

    try {
        const result = await db.query("SELECT * FROM market_snapshots ORDER BY created_at DESC");
        res.json(result.rows);
    } catch (err) {
        hiba(res, err);
    }

});

app.get("/api/statistics/trend", async (req, res) => {

    try {
        const result = await db.query(`
            SELECT id, created_at, property_count, avg_price, avg_price_nm, avg_nm, varos, tipus, ugylet
            FROM market_snapshots
            ORDER BY created_at ASC
        `);
        res.json(result.rows);
    } catch (err) {
        hiba(res, err);
    }

});

app.get("/api/statistics/:id", async (req, res) => {

    try {

        const snapshot = await db.query("SELECT * FROM market_snapshots WHERE id=$1", [req.params.id]);
        const groups = await db.query("SELECT * FROM market_snapshot_groups WHERE snapshot_id=$1", [req.params.id]);

        res.json({ snapshot: snapshot.rows[0], groups: groups.rows });

    } catch (err) {
        hiba(res, err);
    }

});

app.delete("/api/statistics/:id", csakAdmin, async (req, res) => {

    try {

        await db.query("DELETE FROM market_snapshot_groups WHERE snapshot_id=$1", [req.params.id]);
        await db.query("DELETE FROM market_snapshots WHERE id=$1", [req.params.id]);

        res.json({ success: true });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== ÉRTÉKBECSLŐ =====================

app.get("/api/valuation", async (req, res) => {

    try {

        const eredmeny = await becsles(req.query);

        if (eredmeny.error) return res.status(400).json(eredmeny);

        res.json(eredmeny);

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== ADMIN =====================

// Ellenőrizendő hirdetések: hiányos / gyanús adatok (és a régi "függő" importok)
app.get("/api/admin/review", csakAdmin, async (req, res) => {

    try {
        const r = await db.query(`
            SELECT ${LISTA_MEZOK}, i.forras_szoveg, i.leiras
            FROM ingatlanok i
            WHERE (i.statusz = 'aktiv' AND NOT i.ellenorzott) OR i.statusz = 'fuggo'
            ORDER BY i.id DESC
        `);
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }

});

// Régi név megtartása
app.get("/api/admin/pending", csakAdmin, (req, res) => res.redirect(307, "/api/admin/review"));

// Már nem elérhető (eladott / törölt) hirdetések
app.get("/api/admin/unavailable", csakAdmin, async (req, res) => {

    try {
        const r = await db.query(`SELECT ${LISTA_MEZOK} FROM ingatlanok i WHERE i.statusz = 'nem_elerheto' ORDER BY i.utolso_ellenorzes DESC NULLS LAST`);
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }

});

app.get("/api/admin/counts", csakAdmin, async (req, res) => {

    try {
        const r = await db.query(`
            SELECT
                COUNT(*) FILTER (WHERE (statusz = 'aktiv' AND NOT ellenorzott) OR statusz = 'fuggo')::int AS review,
                COUNT(*) FILTER (WHERE statusz = 'nem_elerheto')::int AS unavailable
            FROM ingatlanok
        `);
        res.json({ ...r.rows[0], ai: ai.elerheto() });
    } catch (err) {
        hiba(res, err);
    }

});

// Gyors jóváhagyás (az adatok rendben vannak)
app.post("/api/admin/review/:id/approve", csakAdmin, async (req, res) => {

    try {

        const r = await db.query(
            `UPDATE ingatlanok SET jovahagyva = true, ellenorzott = true, statusz = 'aktiv', updated_at = NOW()
             WHERE id = $1 AND ar > 0 AND nm > 0 AND x IS NOT NULL AND y IS NOT NULL
             RETURNING id`,
            [req.params.id]
        );

        if (!r.rowCount) return res.status(400).json({ error: "missing_fields", hianyzo: ["ar", "nm", "hely"] });

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// Nem elérhető hirdetés visszaállítása (ha tévedés volt)
app.post("/api/admin/unavailable/:id/restore", csakAdmin, async (req, res) => {

    try {
        await db.query("UPDATE ingatlanok SET statusz = 'aktiv', updated_at = NOW() WHERE id = $1", [req.params.id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }

});

// Egy hirdetés azonnali újraolvasása a forrásoldalról
app.post("/api/admin/listing/:id/refresh", csakAdmin, async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM ingatlanok WHERE id = $1", [req.params.id]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        if (!r.rows[0].link) return res.status(400).json({ error: "no_link" });

        const job = importer.ujJob("egy");
        await importer.frissitForrasbol(r.rows[0], job);

        res.json({ siker: true, naplo: job.naplo });

    } catch (err) {
        hiba(res, err);
    }

});

// Meglévő hirdetések ellenőrzése a forrásoldalon (háttérben)
app.post("/api/admin/recheck", csakAdmin, (req, res) => {

    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : null;
    const limit = Math.min(Number(req.body.limit) || 100, 500);

    const job = importer.figyelesIndit({ ids, limit });

    res.json({ jobId: job.id });

});

// AI-ellenőrzés (ha be van állítva az ANTHROPIC_API_KEY)
app.post("/api/admin/ai-check/:id", csakAdmin, async (req, res) => {

    try {

        if (!ai.elerheto()) return res.status(400).json({ error: "no_api_key" });

        const r = await db.query("SELECT * FROM ingatlanok WHERE id = $1", [req.params.id]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        res.json(await ai.ellenoriz(r.rows[0]));

    } catch (err) {
        hiba(res, err);
    }

});

// Duplikátumok
app.get("/api/admin/duplicates", csakAdmin, async (req, res) => {

    try {
        res.json(await duplikatumok.keres());
    } catch (err) {
        hiba(res, err);
    }

});

app.post("/api/admin/duplicates/clean", csakAdmin, async (req, res) => {

    try {
        res.json(await duplikatumok.biztosTorlese());
    } catch (err) {
        hiba(res, err);
    }

});

// Hibás alapadatú hirdetések törlése (a kijelölt azonosítók)
app.post("/api/admin/invalid/delete", csakAdmin, async (req, res) => {

    try {

        const ids = (req.body.ids || []).map(Number).filter(Boolean);

        if (!ids.length) return res.status(400).json({ error: "bad_request" });

        await db.query("DELETE FROM favorites WHERE property_id = ANY($1::int[])", [ids]);
        const r = await db.query("DELETE FROM ingatlanok WHERE id = ANY($1::int[])", [ids]);

        res.json({ torolt: r.rowCount });

    } catch (err) {
        hiba(res, err);
    }

});

app.post("/api/admin/duplicates/merge", csakAdmin, async (req, res) => {

    try {

        const megtart = Number(req.body.megtart);
        const torlendo = (req.body.torlendo || []).map(Number).filter(n => n && n !== megtart);

        if (!megtart || !torlendo.length) return res.status(400).json({ error: "bad_request" });

        res.json(await duplikatumok.osszevon(megtart, torlendo));

    } catch (err) {
        hiba(res, err);
    }

});

// Tömeges beolvasás linkekről
app.post("/api/admin/import", csakAdmin, async (req, res) => {

    try {

        const urls = String(req.body.urls || "")
            .split(/\s+/)
            .map(u => u.trim())
            .filter(u => /^https?:\/\//i.test(u))
            .slice(0, 100);

        if (!urls.length) return res.status(400).json({ error: "no_urls" });

        const varos = String(req.body.varos || "").trim();

        if (!varos) return res.status(400).json({ error: "no_city" });

        const job = importer.indit(urls, {
            varos,
            tipus: req.body.tipus || "lakas",
            ugylet: req.body.ugylet || "elado"
        });

        res.json({ jobId: job.id });

    } catch (err) {
        hiba(res, err);
    }

});

app.get("/api/admin/import/:id", csakAdmin, (req, res) => {

    const j = importer.allapot(req.params.id);

    if (!j) return res.status(404).json({ error: "not_found" });

    res.json(j);

});

// Figyelt oldalak
app.get("/api/admin/watch", csakAdmin, async (req, res) => {

    try {
        const r = await db.query("SELECT * FROM figyelt_oldalak ORDER BY id");
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }

});

app.post("/api/admin/watch", csakAdmin, async (req, res) => {

    try {

        const url = String(req.body.url || "").trim();
        const varos = String(req.body.varos || "").trim();

        if (!/^https?:\/\//i.test(url) || !varos) return res.status(400).json({ error: "bad_request" });

        const r = await db.query(
            `INSERT INTO figyelt_oldalak (url, nev, varos, tipus, ugylet) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [url, String(req.body.nev || "").trim() || null, varos, req.body.tipus || "lakas", req.body.ugylet || "elado"]
        );

        res.json(r.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

app.delete("/api/admin/watch/:id", csakAdmin, async (req, res) => {

    try {
        await db.query("DELETE FROM figyelt_oldalak WHERE id = $1", [req.params.id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }

});

app.post("/api/admin/watch/:id/run", csakAdmin, async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM figyelt_oldalak WHERE id = $1", [req.params.id]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const f = r.rows[0];

        const job = importer.indit([f.url], { varos: f.varos, tipus: f.tipus, ugylet: f.ugylet });

        // A végén az eredményt elmentjük a figyelt oldalhoz
        job.promise.then(j => db.query(
            "UPDATE figyelt_oldalak SET utolso_futas = NOW(), utolso_eredmeny = $1 WHERE id = $2",
            [`${j.uj} új, ${j.frissitett} árváltozás, ${j.kihagyott} már megvolt, ${j.hibak} hiba`, f.id]
        )).catch(err => console.error(err));

        res.json({ jobId: job.id });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== INDÍTÁS =====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Szerver elindult a ${PORT} porton.`);
});
