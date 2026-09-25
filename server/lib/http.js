// ============================================================
//  Közös segédek az útvonalakhoz
// ============================================================

// Szerverhiba: naplózás + egységes válasz
function hiba(res, err) {
    console.error(err);
    res.status(500).json({ error: "server_error", message: err.message });
}

// Csak az admin érheti el
function csakAdmin(req, res, next) {
    if (req.szerep === "admin") return next();
    res.status(403).json({ error: "admin_only" });
}

module.exports = { hiba, csakAdmin };
