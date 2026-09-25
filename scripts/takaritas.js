// ============================================================
//  Egyszeri takarítás az új mappaszerkezet után
//
//  Törli a régi helyükről átköltözött, illetve üres / már nem
//  használt fájlokat. Az adatokat (data/ mappa, .env) NEM bántja.
//
//  Használat (a projekt mappájában):   npm run takaritas
//  Utána:   git add -A   →   git commit   →   git push
// ============================================================

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Ami a gyökérben volt, de most a public/ vagy a scripts/ mappában van,
// illetve üres vagy régóta nem használt fájl
const TOROLNI = [

    // régi weboldal-fájlok (most: public/)
    "index.html",
    "index_backup.html",
    "css",
    "js",
    "assets",
    "libs",

    // régi egyszeri szkriptek (most: scripts/)
    "migrate.js",
    "import-backup.js",
    "create_statistics_tables.js",

    // régi szerverfájlok (most: server/db, server/services, server/routes)
    "server/ai.js",
    "server/database.js",
    "server/duplicates.js",
    "server/geocode.js",
    "server/importer.js",
    "server/importexcel.js",
    "server/listing.js",
    "server/quality.js",
    "server/schema.js",
    "server/scraper.js",
    "server/valuation.js",
    "server/scrapers"

];

// Biztonsági ellenőrzés: csak akkor fusson, ha az új szerkezet már megvan
const kell = ["public/index.html", "server/server.js", "server/routes/listings.js", "server/services/scraper.js"];
const hianyzik = kell.filter(f => !fs.existsSync(path.join(ROOT, f)));

if (hianyzik.length) {
    console.error("❌ Az új fájlok még nincsenek a helyükön, ezért nem törlök semmit:");
    hianyzik.forEach(f => console.error("   - " + f));
    process.exit(1);
}

let db = 0;

for (const rel of TOROLNI) {

    const p = path.join(ROOT, rel);

    if (!fs.existsSync(p)) continue;

    fs.rmSync(p, { recursive: true, force: true });
    console.log("🗑️  törölve: " + rel);
    db++;

}

console.log(db ? `\n✅ Kész, ${db} régi elem törölve.` : "✅ Nem volt mit törölni, minden rendben.");
console.log("Most:  git add -A   →   git commit -m \"Új mappaszerkezet\"   →   git push");
