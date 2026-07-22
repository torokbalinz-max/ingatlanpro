const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./database");

const app = express();

app.use(cors());
app.use(express.json());

// A teljes weboldal (index.html, js, css, képek) kiszolgálása
app.use(express.static(path.join(__dirname, "../")));

console.log("Server indul...");

// Főoldal
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../index.html"));
});

// API
app.get("/api/ingatlanok", async (req, res) => {

    try {

    console.log("GET /api/ingatlanok");

    const result = await db.query(`
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
            y
        FROM ingatlanok
        ORDER BY id
    `);

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
            (link, ar, nm, arnm, szobak, emelet, allapot, eladva, x, y)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
                adat.y

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
                y=$10
            WHERE id=$11`,

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
app.post("/api/statistics/save", async (req, res) => {

    try {

        const stat = await db.query(`
            SELECT
                COUNT(*) AS property_count,
                AVG(ar) AS avg_price,
                AVG(nm) AS avg_nm,
                AVG(arnm) AS avg_price_nm,
                MIN(arnm) AS min_price_nm,
                MAX(arnm) AS max_price_nm
            FROM ingatlanok
        `);

        const s = stat.rows[0];

        const snapshot = await db.query(`
            INSERT INTO market_snapshots
            (
                property_count,
                avg_price,
                avg_nm,
                avg_price_nm,
                min_price_nm,
                max_price_nm
            )
            VALUES ($1,$2,$3,$4,$5,$6)
            RETURNING id
        `,
        [
            s.property_count,
            s.avg_price,
            s.avg_nm,
            s.avg_price_nm,
            s.min_price_nm,
            s.max_price_nm
        ]);

        const snapshotId = snapshot.rows[0].id;

        const groups = await db.query(`
            SELECT
                allapot,
                COUNT(*) AS property_count,
                AVG(ar) AS avg_price,
                AVG(arnm) AS avg_price_nm
            FROM ingatlanok
            GROUP BY allapot
        `);

        for (const g of groups.rows) {

            await db.query(`
                INSERT INTO market_snapshot_groups
                (
                    snapshot_id,
                    category,
                    value,
                    property_count,
                    avg_price,
                    avg_price_nm
                )
                VALUES ($1,$2,$3,$4,$5,$6)
            `,
            [
                snapshotId,
                "allapot",
                g.allapot,
                g.property_count,
                g.avg_price,
                g.avg_price_nm
            ]);

        }
        const rooms = await db.query(`
    SELECT
        szobak,
        COUNT(*) AS property_count,
        AVG(ar) AS avg_price,
        AVG(arnm) AS avg_price_nm
    FROM ingatlanok
    GROUP BY szobak
`);

for (const g of rooms.rows) {

    await db.query(`
        INSERT INTO market_snapshot_groups
        (
            snapshot_id,
            category,
            value,
            property_count,
            avg_price,
            avg_price_nm
        )
        VALUES ($1,$2,$3,$4,$5,$6)
    `,
    [
        snapshotId,
        "szobak",
        g.szobak,
        g.property_count,
        g.avg_price,
        g.avg_price_nm
    ]);

}
const floors = await db.query(`

SELECT

CASE

WHEN COALESCE(NULLIF(split_part(emelet,'/',1),''),'0')::int = 0 THEN 'Földszint'
WHEN COALESCE(NULLIF(split_part(emelet,'/',1),''),'0')::int = 1 THEN '1. emelet'
WHEN COALESCE(NULLIF(split_part(emelet,'/',1),''),'0')::int = 2 THEN '2. emelet'
WHEN COALESCE(NULLIF(split_part(emelet,'/',1),''),'0')::int = 3 THEN '3. emelet'
ELSE '4+ emelet'

END AS emelet,

COUNT(*) AS property_count,
AVG(ar) AS avg_price,
AVG(arnm) AS avg_price_nm

FROM ingatlanok

GROUP BY

CASE

WHEN COALESCE(NULLIF(split_part(emelet,'/',1),''),'0')::int = 0 THEN 'Földszint'
WHEN COALESCE(NULLIF(split_part(emelet,'/',1),''),'0')::int = 1 THEN '1. emelet'
WHEN COALESCE(NULLIF(split_part(emelet,'/',1),''),'0')::int = 2 THEN '2. emelet'
WHEN COALESCE(NULLIF(split_part(emelet,'/',1),''),'0')::int = 3 THEN '3. emelet'
ELSE '4+ emelet'

END

ORDER BY 1

`);
console.log("FLOORS:", floors.rows);
for (const g of floors.rows) {

    await db.query(`
        INSERT INTO market_snapshot_groups
        (
            snapshot_id,
            category,
            value,
            property_count,
            avg_price,
            avg_price_nm
        )
        VALUES ($1,$2,$3,$4,$5,$6)
    `,
    [
        snapshotId,
        "emelet",
        g.emelet,
        g.property_count,
        g.avg_price,
        g.avg_price_nm
    ]);

}

        res.json({
            success: true
        });

    } catch(err) {

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
                avg_nm
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Szerver elindult a ${PORT} porton.`);
});