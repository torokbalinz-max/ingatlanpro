// ============================================================
//  Védelem: biztonsági fejlécek és a túl sok kérés korlátozása
//
//  fejlecek()  – a böngésző biztonsági beállításai minden válaszra:
//      Content-Security-Policy: honnan tölthet a weboldal szkriptet, stílust,
//          képet; más oldal nem ágyazhatja be; űrlap csak ide küldhető
//      Strict-Transport-Security: https-en a böngésző ezután csak https-sel jön
//      Permissions-Policy: kamera, mikrofon, fizetés stb. letiltva
//      Cross-Origin-Opener-Policy: más oldal nem nyúlhat bele az ablakba
//
//  korlatozo() – IP-címenként (bejelentkezve fiókonként is) percenként
//      ennyi API-kérés: olvasás 600, írás 120. Az admin nincs korlátozva.
//      A képek (/api/kepek, /api/img) külön számolnak (sok kép egy oldalon).
//      Üzenet, ajánlat, megtekintés-foglalás, hirdetés feladása: óránként 40
//      fiókonként – a spam ellen.
//
//  Ha egy korlát gondot okoz, a számok itt egy helyen állíthatók.
// ============================================================

// A Google-belépés gombja, a CDN-ről jövő könyvtárak (Bootstrap, Leaflet,
// ag-Grid, Chart.js, Font Awesome); a térkép csempéi és a külső képek https-ről
const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://accounts.google.com/gsi/",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://accounts.google.com/gsi/",
    "font-src 'self' data: https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://accounts.google.com/gsi/",
    "frame-src 'self' https://accounts.google.com/gsi/",
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'"
].join("; ");

function fejlecek() {
    return (req, res, next) => {
        res.set("X-Content-Type-Options", "nosniff");
        res.set("X-Frame-Options", "SAMEORIGIN");
        res.set("Referrer-Policy", "strict-origin-when-cross-origin");
        res.set("Permissions-Policy", "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)");
        // A Google-belépés felugró ablaka miatt "same-origin-allow-popups"
        res.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
        // Az útvonalak (pl. a nyomtatható iratok) a sajátjukkal felülírhatják
        res.set("Content-Security-Policy", CSP);
        if (req.secure) res.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
        next();
    };
}

// ---------- kéréskorlát (egyszerű, memóriában: percenkénti ablak) ----------

const szamlalok = new Map();     // kulcs -> { n, kezdet }

function szamol(kulcs, ablakMs) {
    const most = Date.now();
    let s = szamlalok.get(kulcs);
    if (!s || most - s.kezdet >= ablakMs) {
        s = { n: 0, kezdet: most };
        szamlalok.set(kulcs, s);
    }
    s.n++;
    return s.n;
}

// Időnként a lejártak törlése
setInterval(() => {
    const most = Date.now();
    for (const [k, s] of szamlalok) if (most - s.kezdet > 3600 * 1000) szamlalok.delete(k);
}, 5 * 60 * 1000).unref();

const LIMIT = {
    olvasas: 600,     // GET / perc
    iras: 120,        // POST, PUT, PATCH, DELETE / perc
    kep: 1500,        // /api/kepek, /api/img / perc
    kapcsolat: 40     // üzenet, ajánlat, foglalás, hirdetésfeladás / óra / fiók
};

// Kapcsolatfelvétel jellegű kérések (más felhasználóknak / az irodának mennek)
const KAPCSOLAT = [
    /^\/api\/uzenetek$/,
    /^\/api\/ingatlanok$/,
    /^\/api\/ingatlanok\/\d+\/uzenet$/,
    /^\/api\/igenyek(\/\d+\/valasz)?$/,
    /^\/api\/megbizas$/,
    /^\/api\/megbizas\/hirdetes\/\d+\/(foglal|varolista|ajanlat|uzenet|keres)$/,
    /^\/api\/megbizas\/sajat\/\d+\/uzenet$/
];

function korlatozo() {
    return (req, res, next) => {

        if (!req.path.startsWith("/api/")) return next();
        // Az admin (és a felhasználói nézetet próbáló admin) nincs korlátozva
        if (req.valodiSzerep === "admin") return next();

        const ip = String(req.ip || (req.socket && req.socket.remoteAddress) || "?");
        const ki = req.user ? "u" + req.user.id : "ip" + ip;
        const iras = !["GET", "HEAD", "OPTIONS"].includes(req.method);
        const kep = /^\/api\/(kepek\/|img$|irodak\/\d+\/logo$|reklam\/\d+\/kep$)/.test(req.path);

        const tul = (kulcs, max, ablak = 60 * 1000) => szamol(kulcs, ablak) > max;

        let tullepve = false;
        if (kep) tullepve = tul("kep:" + ip, LIMIT.kep);
        else if (iras) tullepve = tul("ir:" + ip, LIMIT.iras) || (req.user && tul("ir:" + ki, LIMIT.iras));
        else tullepve = tul("ol:" + ip, LIMIT.olvasas) || (req.user && tul("ol:" + ki, LIMIT.olvasas));

        if (!tullepve && iras && req.method === "POST" && KAPCSOLAT.some(re => re.test(req.path))) {
            tullepve = tul("kapcs:" + ki, LIMIT.kapcsolat, 3600 * 1000);
        }

        if (tullepve) {
            res.set("Retry-After", "60");
            return res.status(429).json({ error: "too_many" });
        }

        next();

    };
}

module.exports = { fejlecek, korlatozo, CSP };
