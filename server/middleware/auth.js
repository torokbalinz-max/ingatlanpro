// ============================================================
//  Belépés és jogosultság
//
//  Minden kérésnél kiderítjük, ki van bejelentkezve (süti), és
//  beállítjuk:
//     req.user         a fiók (vagy null = vendég)
//     req.szerep       "admin" | "user" | "vendeg"
//     req.felhasznalo  a megjelenítendő név
//
//  Két üzemmód:
//   - PRIVÁT (alap): az adatokat csak bejelentkezve lehet látni.
//     A weboldal betöltődik, de a belépő ablakot mutatja.
//   - NYILVÁNOS (NYILVANOS=1 a .env-ben): bárki böngészhet;
//     hirdetésfeladáshoz, kedvencekhez, üzenethez kell belépni.
//
//  A régi HTTP Basic belépés (ADMIN_USER / APP_USER) is működik
//  még (pl. parancssorból), de a böngésző már a belépő ablakot használja.
// ============================================================

const acc = require("../services/accounts");

// Belépés nélkül is elérhető API-k
const MINDIG_NYITOTT = [/^\/api\/me$/, /^\/api\/config$/, /^\/api\/auth\//];

function nyilvanosMod() {
    return /^(1|true|igen|yes)$/i.test(String(process.env.NYILVANOS || ""));
}

function belepes() {

    if (acc.fejlesztoiMod()) {
        console.warn("⚠️  Nincs jelszó beállítva – helyi fejlesztés: bejelentkezés nélkül admin joggal érhető el!");
    } else {
        console.log(`🔒 Fiókos belépés BEKAPCSOLVA (${nyilvanosMod() ? "nyilvános böngészés" : "csak bejelentkezve"}).`);
    }

    return async (req, res, next) => {

        try {

            let user = await acc.munkamenetUser(acc.sutiOlvas(req)[acc.SUTI]);

            // Régi HTTP Basic (parancssor, régi könyvjelzők)
            if (!user) {
                const [scheme, encoded] = String(req.headers.authorization || "").split(" ");
                if (scheme === "Basic" && encoded) {
                    const d = Buffer.from(encoded, "base64").toString("utf8");
                    const sep = d.indexOf(":");
                    if (sep > -1) {
                        const f = acc.envFiokok().find(x => acc.safeEqual(d.slice(0, sep), x.user) && acc.safeEqual(d.slice(sep + 1), x.pass));
                        if (f) user = await acc.envFiokSor(f);
                    }
                }
            }

            // Helyi fejlesztés jelszó nélkül: mindenki admin
            if (!user && acc.fejlesztoiMod()) {
                user = await acc.envFiokSor({ user: "local", szerep: "admin" });
            }

            req.user = user;
            req.szerep = user ? (user.szerep || "user") : "vendeg";
            req.felhasznalo = user ? (user.nev || user.felhasznalonev || user.email) : null;

            // Csak az API-t védjük – a weboldal fájljai (HTML, JS, CSS) mindig
            // betöltődnek, hogy a belépő ablak megjelenhessen
            if (!user && req.path.startsWith("/api/") && !MINDIG_NYITOTT.some(re => re.test(req.path))) {

                const olvasas = req.method === "GET" || req.method === "HEAD";

                if (!nyilvanosMod() || !olvasas) {
                    return res.status(401).json({ error: "login_required" });
                }

            }

            next();

        } catch (err) {
            next(err);
        }

    };

}

module.exports = { belepes, safeEqual: acc.safeEqual, nyilvanosMod };
