require("dotenv").config();

const sqlite3 = require("sqlite3").verbose();
const { Pool } = require("pg");
const path = require("path");

const sqlite = new sqlite3.Database(
    path.join(__dirname, "data", "ingatlan.db")
);

const pg = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

sqlite.all("SELECT * FROM ingatlanok", async (err, rows) => {

    if (err) {
        console.error(err);
        process.exit(1);
    }

    console.log(`${rows.length} ingatlan található.`);

    try {

        for (const i of rows) {

            await pg.query(
                `INSERT INTO ingatlanok
                (link, ar, nm, arnm, szobak, emelet, allapot, eladva, x, y)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [
                    i.link,
                    i.ar,
                    i.nm,
                    i.arnm ?? i.arNm,
                    i.szobak,
                    i.emelet,
                    i.allapot,
                    i.eladva,
                    i.x,
                    i.y
                ]
            );

            console.log("Átmásolva:", i.id);

        }

        console.log("Kész!");

    } catch (e) {

        console.error(e);

    } finally {

        sqlite.close();
        await pg.end();

    }

});