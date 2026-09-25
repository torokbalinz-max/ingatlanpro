require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const db = require("./database");
const { becsles } = require("./valuation");

const app = express();

const ROOT = path.join(__dirname, "../");

console.log("Server indul...");

// ===================== ÉLETJEL (jelszó nélkül) =====================
// Render health check / ébresztés ezt hívhatja.

app.get("/healthz", (req, res) => {
    res.json({ ok: true });
});

// ===================== JELSZAVAS VÉDELEM =====================
// Ha az APP_PASSWORD környezeti változó be van állítva, az egész
// oldal és az API csak felhasználónév + jelszó után érhető el.
// A böngésző a saját bejelentkező ablakát dobja fel, és utána
// a fetch() hívásokhoz is automatikusan elküldi.

const APP_USER = process.env.APP_USER || "admin";
const APP_PASSWORD = process.env.APP_PASSWORD || "";

function safeEqual(a, b) {
    const ha = crypto.createHash("sha256").update(String(a)).digest();
    const hb = crypto.createHash("sha256").update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

if (APP_PASSWORD) {

    app.use((req, res, next) => {

        const header = req.headers.authorization || "";
        const [scheme, encoded] = header.split(" ");

        if (scheme === "Basic" && encoded) {

            const decoded = Buffer.from(encoded, "base64").toString("utf8");
            const sep = decoded.indexOf(":");
            const user = decoded.slice(0, sep);
            const pass = decoded.slice(sep + 1);

            if (sep > -1 && safeEqual(user, APP_USER) && safeEqual(pass, APP_PASSWORD)) {
                return next();
            }

        }

        res.set("WWW-Authenticate", 'Basic realm="IngatlanPro", charset="UTF-8"');
        res.status(401).send("Bejelentkezés szükséges.");

    });

    console.log("🔒 Jelszavas védelem BEKAPCSOLVA.");

} else {

    console.warn("⚠️  APP_PASSWORD nincs beállítva – az oldal jelszó nélkül elérhető!");

}

app.use(cors());
app.use(express.json());

// ===================== STATIKUS FÁJLOK =====================
// Csak a frontendhez szükséges mappák érhetők el.
// (Korábban a TELJES projektmappa ki volt szolgálva, így pl. a
// /data/ingatlanok.xlsx vagy a /server/server.js is letölthető volt.)

app.use("/js", express.static(path.join(ROOT, "js")));
app.use("/css", express.static(path.join(ROOT, "css")));
app.use("/assets", express.static(path.join(ROOT, "assets")));
app.use("/libs", express.static(path.join(ROOT, "libs")));

// Főoldal
app.get("/", (req, res) => {
    res.sendFile(path.join(ROOT, "index.html"));
});

// API
app.get("/api/ingatlanok", async (req, res) => {

    try {


    const city = req.query.city;

    let result;

    if (city) {

        result = await db.query(`
            SELECT
                id,
                link,
                ar,
                nm,
                arnm AS "arNm",
                szobak,
                emelet,
                allapot,
                eladva,
                x,
                y,
                varos,
                kerulet
            FROM ingatlanok
            WHERE varos = $1
            ORDER BY id
        `, [city]);

    } else {

        result = await db.query(`
            SELECT
                id,
                link,
                ar,
                nm,
                arnm AS "arNm",
                szobak,
                emelet,
                allapot,
                eladva,
                x,
                y,
                varos,
                kerulet
            FROM ingatlanok
            ORDER BY id
        `);

    }

    res.json(result.rows);

} catch (err) {

    console.error(err);

    res.status(500).json(err);

}

});


app.post("/api/ingatlanok", async (req, res) => {

    try {

        const adat = req.body;

        const result = await db.query(

            `INSERT INTO ingatlanok
            (link, ar, nm, arnm, szobak, emelet, allapot, eladva, x, y, varos, kerulet)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING id`,

            [

                adat.link,
                adat.ar,
                adat.nm,
                adat.arNm,
                adat.szobak,
                adat.emelet,
                adat.allapot,
                adat.eladva,
                adat.x,
                adat.y,
                adat.varos || null,
                adat.kerulet || null

            ]

        );

        res.json({

            siker: true,

            id: result.rows[0].id

        });

    } catch(err) {

        console.error(err);

        res.status(500).json(err);

    }

});
app.put("/api/ingatlanok/:id", async (req, res) => {

    try {

        const adat = req.body;

        await db.query(

            `UPDATE ingatlanok
            SET
                link=$1,
                ar=$2,
                nm=$3,
                arnm=$4,
                szobak=$5,
                emelet=$6,
                allapot=$7,
                eladva=$8,
                x=$9,
                y=$10,
                varos=$11,
                kerulet=$12
            WHERE id=$13`,

            [

                adat.link,
                adat.ar,
                adat.nm,
                adat.arNm,
                adat.szobak,
                adat.emelet,
                adat.allapot,
                adat.eladva,
                adat.x,
                adat.y,
                adat.varos || null,
                adat.kerulet || null,
                req.params.id

            ]

        );

        res.json({
            siker: true
        });

    } catch (err) {

        console.error(err);

        res.status(500).json(err);

    }

});
app.delete("/api/ingatlanok/:id", async (req, res) => {

    try {

        await db.query(

            "DELETE FROM ingatlanok WHERE id=$1",

            [req.params.id]

        );

        res.json({

            siker: true

        });

    } catch (err) {

        console.error(err);

        res.status(500).json(err);

    }

});

// Tömeges kerület-beállítás egyszerre több ingatlanra
app.patch("/api/ingatlanok/bulk-kerulet", async (req, res) => {

    try {

        const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(n => !isNaN(n)) : [];
        const kerulet = (req.body.kerulet || "").trim();

        if (ids.length === 0) {
            return res.status(400).json({ error: "Hiányzó ingatlan azonosítók" });
        }

        if (!kerulet) {
            return res.status(400).json({ error: "Hiányzó kerület" });
        }

        await db.query(
            "UPDATE ingatlanok SET kerulet=$1 WHERE id = ANY($2::int[])",
            [kerulet, ids]
        );

        res.json({ siker: true, updated: ids.length });

    } catch (err) {

        console.error(err);
        res.status(500).json(err);

    }

});

// ===================== VÁROSOK =====================

app.get("/api/varosok", async (req, res) => {

    try {

        const result = await db.query(
            "SELECT id, nev FROM varosok ORDER BY nev"
        );

        res.json(result.rows);

    } catch (err) {

        console.error(err);
        res.status(500).json(err);

    }

});

app.post("/api/varosok", async (req, res) => {

    try {

        const nev = (req.body.nev || "").trim();

        if (!nev) {
            return res.status(400).json({ error: "Hiányzó városnév" });
        }

        const result = await db.query(
            `INSERT INTO varosok (nev)
             VALUES ($1)
             ON CONFLICT (nev) DO UPDATE SET nev=EXCLUDED.nev
             RETURNING id, nev`,
            [nev]
        );

        res.json(result.rows[0]);

    } catch (err) {

        console.error(err);
        res.status(500).json(err);

    }

});

// ===================== KERÜLETEK / VÁROSRÉSZEK =====================

app.get("/api/keruletek", async (req, res) => {

    try {

        const varos = req.query.varos;

        const result = varos
            ? await db.query(
                "SELECT id, varos, nev FROM keruletek WHERE varos=$1 ORDER BY nev",
                [varos]
              )
            : await db.query(
                "SELECT id, varos, nev FROM keruletek ORDER BY varos, nev"
              );

        res.json(result.rows);

    } catch (err) {

        console.error(err);
        res.status(500).json(err);

    }

});

app.post("/api/keruletek", async (req, res) => {

    try {

        const varos = (req.body.varos || "").trim();
        const nev = (req.body.nev || "").trim();

        if (!varos || !nev) {
            return res.status(400).json({ error: "Hiányzó város vagy kerület név" });
        }

        const result = await db.query(
            `INSERT INTO keruletek (varos, nev)
             VALUES ($1,$2)
             ON CONFLICT (varos, nev) DO UPDATE SET nev=EXCLUDED.nev
             RETURNING id, varos, nev`,
            [varos, nev]
        );

        res.json(result.rows[0]);

    } catch (err) {

        console.error(err);
        res.status(500).json(err);

    }

});

// ===================== KEDVENCEK =====================

app.get("/api/favorites", async (req, res) => {

    try {

        const result = await db.query(`
            SELECT
                i.id,
                i.link,
                i.ar,
                i.nm,
                i.arnm AS "arNm",
                i.szobak,
                i.emelet,
                i.allapot,
                i.eladva,
                i.x,
                i.y,
                i.varos,
                i.kerulet
            FROM favorites f
            JOIN ingatlanok i ON i.id = f.property_id
            ORDER BY i.id
        `);

        res.json(result.rows);

    } catch (err) {

        console.error(err);
        res.status(500).json(err);

    }

});

app.get("/api/favorites/ids", async (req, res) => {

    try {

        const result = await db.query("SELECT property_id FROM favorites");

        res.json(result.rows.map(r => r.property_id));

    } catch (err) {

        console.error(err);
        res.status(500).json(err);

    }

});

app.post("/api/favorites/:id", async (req, res) => {

    try {

        await db.query(
            `INSERT INTO favorites (property_id)
             VALUES ($1)
             ON CONFLICT (property_id) DO NOTHING`,
            [req.params.id]
        );

        res.json({ siker: true });

    } catch (err) {

        console.error(err);
        res.status(500).json(err);

    }

});

app.delete("/api/favorites/:id", async (req, res) => {

    try {

        await db.query(
            "DELETE FROM favorites WHERE property_id=$1",
            [req.params.id]
        );

        res.json({ siker: true });

    } catch (err) {

        console.error(err);
        res.status(500).json(err);

    }

});

// Piaci állapot mentése (snapshot). Ha a body-ban van "varos",
// akkor csak az adott város ingatlanaiból készül.
app.post("/api/statistics/save", async (req, res) => {

    try {

        const varos = (req.body && req.body.varos ? String(req.body.varos) : "").trim() || null;

        // Csak értelmes adatok (ár és alapterület > 0) számítanak bele
        const where = varos
            ? "WHERE varos = $1 AND ar > 0 AND nm > 0"
            : "WHERE ar > 0 AND nm > 0";
        const params = varos ? [varos] : [];

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
            (varos, property_count, avg_price, median_price, avg_nm, avg_price_nm, min_price_nm, max_price_nm)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            RETURNING id
        `, [varos, s.property_count, s.avg_price, s.median_price, s.avg_nm, s.avg_price_nm, s.min_price_nm, s.max_price_nm]);

        const snapshotId = snapshot.rows[0].id;

        // Csoportosítások: kategória -> SQL kifejezés
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
            szobak: "szobak::text",
            emelet: floorExpr,
            kerulet: "COALESCE(NULLIF(kerulet,''), 'Nincs megadva')"
        };

        for (const [category, expr] of Object.entries(groups)) {

            const rows = await db.query(`
                SELECT
                    ${expr} AS value,
                    COUNT(*) AS property_count,
                    AVG(ar) AS avg_price,
                    AVG(arnm) AS avg_price_nm
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

        console.error(err);
        res.status(500).json(err);

    }

});

app.get("/api/statistics", async (req, res) => {
    try {

        const result = await db.query(`
            SELECT *
            FROM market_snapshots
            ORDER BY created_at DESC
        `);

        res.json(result.rows);

    } catch (err) {

        console.error(err);
        res.status(500).json(err);

    }
});
app.get("/api/statistics/trend", async (req, res) => {

    try {

        const result = await db.query(`

            SELECT
                id,
                created_at,
                property_count,
                avg_price,
                avg_price_nm,
                avg_nm,
                varos
            FROM market_snapshots
            ORDER BY created_at ASC

        `);

        res.json(result.rows);

    }

    catch(err){

        console.error(err);

        res.status(500).json(err);

    }

});
app.get("/api/statistics/:id", async (req, res) => {

    try {

        const snapshot = await db.query(
            "SELECT * FROM market_snapshots WHERE id=$1",
            [req.params.id]
        );

        const groups = await db.query(
            "SELECT * FROM market_snapshot_groups WHERE snapshot_id=$1",
            [req.params.id]
        );

        res.json({
            snapshot: snapshot.rows[0],
            groups: groups.rows
        });

    } catch(err) {

        console.error(err);
        res.status(500).json(err);

    }

});
app.delete("/api/statistics/:id", async (req, res) => {

    try {

        await db.query(
            "DELETE FROM market_snapshot_groups WHERE snapshot_id=$1",
            [req.params.id]
        );

        await db.query(
            "DELETE FROM market_snapshots WHERE id=$1",
            [req.params.id]
        );

        res.json({
            success: true
        });

    } catch(err) {

        console.error(err);
        res.status(500).json(err);

    }

});

// ===================== ÉRTÉKBECSLŐ =====================

app.get("/api/valuation", async (req, res) => {

    try {

        const eredmeny = await becsles(req.query);

        if (eredmeny.error) {
            return res.status(400).json(eredmeny);
        }

        res.json(eredmeny);

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "server_error" });

    }

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Szerver elindult a ${PORT} porton.`);
});