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

// A Render egy proxy mögött fut: így tudjuk, hogy https-en jött-e a kérés
// (a belépési süti "secure" jelzéséhez)
app.set("trust proxy", 1);

const PUBLIC = path.join(__dirname, "..", "public");

console.log("Server indul...");

// ===================== ÉLETJEL, IDŐZÍTÉS (jelszó nélkül) =====================

app.get("/healthz", (req, res) => {
    res.json({ ok: true });
});

app.use(require("./routes/cron"));

// ===================== WEBOLDAL =====================
// A weboldal fájljai belépés nélkül is betöltődnek (a belépő ablak miatt);
// az adatokat (API) a belépés védi.

app.use(express.static(PUBLIC, { index: "index.html" }));

// ===================== BELÉPÉS =====================

app.use(belepes());

app.use(cors());

// Nagyobb limit a képek miatt (a böngésző előtte lekicsinyíti őket)
app.use(express.json({ limit: "40mb" }));

// ===================== API =====================

app.use(require("./routes/auth"));
app.use(require("./routes/listings"));
app.use(require("./routes/images"));
app.use(require("./routes/places"));
app.use(require("./routes/favorites"));
app.use(require("./routes/statistics"));
app.use(require("./routes/valuation"));
app.use(require("./routes/admin"));
app.use(require("./routes/searches"));
app.use(require("./routes/requests"));
app.use(require("./routes/messages"));
app.use(require("./routes/location"));
app.use(require("./routes/irodak"));
app.use(require("./routes/legal"));

// Hibakezelő (pl. a belépés-ellenőrzés adatbázis-hibája)
app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: "server_error", message: err.message });
});

// ===================== INDÍTÁS =====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Szerver elindult a ${PORT} porton.`);
    // A meglévő hirdetések automatikus javítása – csak egyszer, az első indításkor
    setTimeout(() => require("./services/autofix").indulaskor(), 5000);
});
