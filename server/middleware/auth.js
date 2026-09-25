// ============================================================
//  Belépés és jogosultság (HTTP Basic)
//
//  ADMIN_USER / ADMIN_PASSWORD  -> admin: mindent módosíthat
//  APP_USER   / APP_PASSWORD    -> felhasználó: böngészhet, hirdetést tölthet fel
//
//  Ha csak az APP_PASSWORD van beállítva, az a belépés admin
//  (így a korábbi beállítás változtatás nélkül működik tovább).
//  Ha egyik sincs beállítva (helyi fejlesztés), mindenki admin.
// ============================================================

const crypto = require("crypto");

const FIOKOK = [];

if (process.env.ADMIN_PASSWORD) {
    FIOKOK.push({ user: process.env.ADMIN_USER || "admin", pass: process.env.ADMIN_PASSWORD, szerep: "admin" });
}

if (process.env.APP_PASSWORD) {
    FIOKOK.push({
        user: process.env.APP_USER || "user",
        pass: process.env.APP_PASSWORD,
        szerep: process.env.ADMIN_PASSWORD ? "user" : "admin"
    });
}

function safeEqual(a, b) {
    const ha = crypto.createHash("sha256").update(String(a)).digest();
    const hb = crypto.createHash("sha256").update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

function belepes() {

    if (FIOKOK.length) {

        console.log(`🔒 Jelszavas védelem BEKAPCSOLVA (${FIOKOK.map(f => f.szerep).join(", ")}).`);

        return (req, res, next) => {

            const header = req.headers.authorization || "";
            const [scheme, encoded] = header.split(" ");

            if (scheme === "Basic" && encoded) {

                const decoded = Buffer.from(encoded, "base64").toString("utf8");
                const sep = decoded.indexOf(":");
                const user = decoded.slice(0, sep);
                const pass = decoded.slice(sep + 1);

                const fiok = sep > -1 && FIOKOK.find(f => safeEqual(user, f.user) && safeEqual(pass, f.pass));

                if (fiok) {
                    req.szerep = fiok.szerep;
                    req.felhasznalo = fiok.user;
                    return next();
                }

            }

            res.set("WWW-Authenticate", 'Basic realm="IngatlanPro", charset="UTF-8"');
            res.status(401).send("Bejelentkezés szükséges.");
        };

    }

    console.warn("⚠️  Nincs jelszó beállítva – az oldal jelszó nélkül, admin joggal érhető el!");

    return (req, res, next) => {
        req.szerep = "admin";
        req.felhasznalo = "local";
        next();
    };

}

module.exports = { belepes, safeEqual };
