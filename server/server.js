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

        const result = await db.query(
            "SELECT * FROM ingatlanok ORDER BY id"
        );

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
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Szerver elindult a ${PORT} porton.`);
});