// ============================================================
//  Közös segédek az útvonalakhoz
// ============================================================

// Szerverhiba: naplózás + egységes válasz
function hiba(res, err) {
    if (err && err.kod) return res.status(400).json({ error: err.kod });
    console.error(err);
    res.status(500).json({ error: "server_error", message: err.message });
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
