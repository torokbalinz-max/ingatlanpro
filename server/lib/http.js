// ============================================================
//  Közös segédek az útvonalakhoz
// ============================================================

// Szerverhiba: naplózás + egységes válasz
function hiba(res, err) {
    if (err && err.kod) return res.status(400).json({ error: err.kod });
    // Hibás azonosító / szám a kérésben (pl. /api/ingatlanok/abc) – nem szerverhiba
    if (err && (err.code === "22P02" || err.code === "22003")) return res.status(400).json({ error: "bad_request" });
    console.error(err);
    // A hiba részletei (pl. adatbázis-üzenet) csak az adminnak – másnak árulkodó lehet
    const admin = res.req && res.req.szerep === "admin";
    res.status(500).json(admin ? { error: "server_error", message: err.message } : { error: "server_error" });
}

// Csak az admin érheti el
function csakAdmin(req, res, next) {
    if (req.szerep === "admin") return next();
    res.status(403).json({ error: "admin_only" });
}

// Csak bejelentkezett felhasználó
function csakBelepve(req, res, next) {
    if (req.user) return next();
    res.status(401).json({ error: "login_required" });
}

module.exports = { hiba, csakAdmin, csakBelepve };
