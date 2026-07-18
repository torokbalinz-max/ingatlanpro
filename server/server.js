const express = require("express");
const cors = require("cors");
const db = require("./database");

const app = express();

app.use(cors());
app.use(express.json());

console.log("Server indul...");

app.get("/", (req, res) => {
    console.log("GET /");
    res.send("IngatlanPro szerver működik!");
});

app.get("/api/ingatlanok", (req, res) => {

    console.log("GET /api/ingatlanok");

    db.all("SELECT * FROM ingatlanok", [], (err, rows) => {

        if (err) {
            console.error(err);
            return res.status(500).json(err);
        }

        res.json(rows);

    });

});


app.post("/api/ingatlanok", (req, res) => {

    const adat = req.body;

    db.run(
        `INSERT INTO ingatlanok
        (link, ar, nm, arNm, szobak, emelet, allapot, eladva, x, y)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            adat.link,
            adat.ar,
            adat.nm,
            adat.arNm,
            adat.szobak,
            adat.emelet,
            adat.allapot,
            adat.eladva ? 1 : 0,
            adat.x,
            adat.y
        ],
        function(err) {

            if (err) {
                console.error(err);
                return res.status(500).json(err);
            }

            res.json({
                siker: true,
                id: this.lastID
            });

        }
    );

});
app.put("/api/ingatlanok/:id", (req, res) => {

    console.log("PUT meghívva:", req.params.id);
    console.log(req.body);

    const adat = req.body;

    db.run(

        `UPDATE ingatlanok
        SET
            link=?,
            ar=?,
            nm=?,
            arNm=?,
            szobak=?,
            emelet=?,
            allapot=?,
            eladva=?,
            x=?,
            y=?
        WHERE id=?`,

        [
            adat.link,
            adat.ar,
            adat.nm,
            adat.arNm,
            adat.szobak,
            adat.emelet,
            adat.allapot,
            adat.eladva ? 1 : 0,
            adat.x,
            adat.y,
            req.params.id
        ],

        function(err){

            if(err){

                return res.status(500).json(err);

            }

            res.json({
                siker:true
            });

        }

    );

});
app.delete("/api/ingatlanok/:id", (req, res) => {

    db.run(

        "DELETE FROM ingatlanok WHERE id = ?",

        [req.params.id],

        function(err){

            if(err){

                return res.status(500).json(err);

            }

            res.json({

                siker:true

            });

        }

    );

}
);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Szerver elindult a ${PORT} porton.`);
});