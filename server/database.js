const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(
    path.join(__dirname, "../data/ingatlan.db"),
    (err) => {

        if (err) {
            console.error(err);
        } else {
            console.log("SQLite adatbázis csatlakoztatva.");
        }

    }
);

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS ingatlanok (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            link TEXT,

            ar REAL,

            nm REAL,

            arNm REAL,

            szobak INTEGER,

            emelet TEXT,

            allapot TEXT,

            eladva INTEGER,

            x REAL,

            y REAL

        )
    `);

});

module.exports = db;