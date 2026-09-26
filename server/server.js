// ============================================================
//  IngatlanPro – szerver (belépési pont)
//
//  Felépítés:
//    public/           a weboldal (HTML, CSS, JS) – ezt kapja a böngésző
//    server/routes/    az API útvonalai témánként
//    server/services/  a „munka”: beolvasás, minőség, becslés, helymeghatározás...
//    server/db/        adatbázis-kapcsolat és táblák
//    server/middleware belépés, jogosultság
//    scripts/          egyszeri parancsok (adatmentés visszatöltése, költöztetés)
// ============================================================

require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const path = require("path");

const { belepes } = require("./middleware/auth");

const app = express();

const PUBLIC = path.join(__dirname, "..", "public");

console.log("Server indul...");

// ===================== ÉLETJEL, IDŐZÍTÉS (jelszó nélkül) =====================

app.get("/healthz", (req, res) => {
    res.json({ ok: true });
});

app.use(require("./routes/cron"));

// ===================== BELÉPÉS =====================

app.use(belepes());

app.use(cors());

// Nagyobb limit a képek miatt (a böngésző előtte lekicsinyíti őket)
app.use(express.json({ limit: "40mb" }));

// ===================== WEBOLDAL =====================

app.use(express.static(PUBLIC, { index: "index.html" }));

// ===================== API =====================

app.get("/api/me", (req, res) => {
    res.json({ szerep: req.szerep, felhasznalo: req.felhasznalo });
});

app.use(require("./routes/listings"));
app.use(require("./routes/images"));
app.use(require("./routes/places"));
app.use(require("./routes/favorites"));
app.use(require("./routes/statistics"));
app.use(require("./routes/valuation"));
app.use(require("./routes/admin"));

// ===================== INDÍTÁS =====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Szerver elindult a ${PORT} porton.`);
    // A meglévő hirdetések automatikus javítása – csak egyszer, az első indításkor
    setTimeout(() => require("./services/autofix").indulaskor(), 5000);
});
