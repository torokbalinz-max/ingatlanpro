const XLSX = require("xlsx");
const db = require("./database");
const path = require("path");

const file = path.join(__dirname, "../data/ingatlanok.xlsx");

const workbook = XLSX.readFile(file);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

console.log(`Beolvasva: ${rows.length} ingatlan`);

db.serialize(() => {

    const stmt = db.prepare(`
        INSERT INTO ingatlanok
        (link, ar, nm, arNm, szobak, emelet, allapot, eladva, x, y)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    rows.forEach(row => {

        stmt.run(

            row["Link"] || "",

            Number(row["Ár"]) || 0,

            Number(row["Nm"]) || 0,

            Number(row["Ár/nm"]) || 0,

            Number(row["szobaszám"]) || 0,

            row["emelet"] || "",

            row["állapot"] || "",

            row["eladva"] === "IGAZ" ? 1 : 0,

            Number(row["X"]) || 0,

            Number(row["Y"]) || 0

        );

    });

    stmt.finalize();

    console.log("Az összes ingatlan importálva!");

    db.close();

});