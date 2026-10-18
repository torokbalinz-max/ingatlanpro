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
const fs = require("fs");
const crypto = require("crypto");
const compression = require("compression");

const { belepes } = require("./middleware/auth");

const app = express();

// A Render egy proxy mögött fut: így tudjuk, hogy https-en jött-e a kérés
// (a belépési süti "secure" jelzéséhez)
app.set("trust proxy", 1);

const PUBLIC = path.join(__dirname, "..", "public");

console.log("Server indul...");

// Biztonsági fejlécek: a böngésző ne "találgassa" a fájltípust, más oldal ne
// ágyazhassa be (clickjacking), honnan tölthet szkriptet (CSP), csak https
// (HSTS), a hivatkozó cím csak domainnel – részletek: middleware/vedelem.js
const vedelem = require("./middleware/vedelem");
app.use(vedelem.fejlecek());
// Ne árulja el, milyen szerver fut
app.disable("x-powered-by");

// Tömörítés (gzip): a HTML, JS, CSS és az API JSON-válaszai a töredékükre
// mennek össze. A képeket, PDF-eket nem tömöríti (azok már tömörítettek).
app.use(compression());

// ===================== ÉLETJEL, IDŐZÍTÉS (jelszó nélkül) =====================

app.get("/healthz", (req, res) => {
    res.json({ ok: true });
});

app.use(require("./routes/cron"));

// ===================== WEBOLDAL =====================
// A weboldal fájljai belépés nélkül is betöltődnek (a belépő ablak miatt);
// az adatokat (API) a belépés védi.

// Gyorstár: az index.html a saját JS- és CSS-fájljait egy „?v=<tartalom-ujjlenyomat>”
// végződéssel hivatkozza. Ezeket a böngésző egy évig megtartja és nem kérdez rá
// újra – ha egy fájl megváltozik, az ujjlenyomata is, így az új címet tölti le.
// Az index.html-re (és a ?v nélküli fájlokra) továbbra is minden betöltéskor
// rákérdez (ETag, egy rövid 304, ha nem változott), így egy frissítés után
// mindenki azonnal az új változatot kapja.

const ujjlenyomatok = new Map();   // fájl -> { mtime, v }

function ujjlenyomat(rel) {
    const f = path.join(PUBLIC, rel);
    if (!f.startsWith(PUBLIC)) return null;
    try {
        const st = fs.statSync(f);
        const c = ujjlenyomatok.get(f);
        if (c && c.mtime === st.mtimeMs) return c.v;
        const v = crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex").slice(0, 10);
        ujjlenyomatok.set(f, { mtime: st.mtimeMs, v });
        return v;
    } catch (e) {
        return null;
    }
}

let indexGyors = { ido: 0, html: null };

function indexHtml() {
    // Pár másodpercig ugyanazt adjuk (helyi szerkesztésnél is gyorsan frissül)
    if (indexGyors.html && Date.now() - indexGyors.ido < 2000) return indexGyors.html;
    const html = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8")
        .replace(/(\s(?:src|href)=")((?:js|css)\/[^"?#]+\.(?:js|css))"/g, (m, elo, rel) => {
            const v = ujjlenyomat(rel);
            return v ? `${elo}${rel}?v=${v}"` : m;
        });
    indexGyors = { ido: Date.now(), html };
    return html;
}

app.get(["/", "/index.html"], (req, res, next) => {
    try {
        res.set("Cache-Control", "no-cache");
        res.type("html").send(indexHtml());
    } catch (err) {
        next();   // ha valamiért nem megy, a sima fájl (lent)
    }
});

app.use(express.static(PUBLIC, {
    index: "index.html",
    setHeaders: (res, fajl) => {
        const verzios = res.req && /[?&]v=[0-9a-f]{6,}/.test(res.req.originalUrl || "");
        if (/\.(js|css)$/i.test(fajl) && verzios) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        else if (/\.(html|js|css)$/i.test(fajl)) res.setHeader("Cache-Control", "no-cache");
        // Betűtípusok: ritkán változnak; képek (súgó, ikonok): egy napig
        else if (/\.(woff2?|ttf|otf)$/i.test(fajl)) res.setHeader("Cache-Control", "public, max-age=2592000");
        else if (/\.(webp|png|jpe?g|svg|gif|ico)$/i.test(fajl)) res.setHeader("Cache-Control", "public, max-age=86400");
    }
}));

// ===================== ONLINE FIZETÉS: STRIPE ÉRTESÍTÉS =====================
// A belépés és a JSON-olvasó előtt: a Stripe aláírását a nyers kéréstörzsön
// kell ellenőrizni (routes/fizetes.js)

app.use(require("./routes/fizetes").stripeWebhook);

// ===================== BELÉPÉS =====================

app.use(belepes());

// Túl sok kérés egy címről / fiókból (próbálgatás, spam, terhelés) – 429
app.use(vedelem.korlatozo());

app.use(cors());

// Nagyobb limit a képek miatt (a böngésző előtte lekicsinyíti őket) – de csak
// bejelentkezve; vendégtől legfeljebb 1 MB (ne lehessen óriási kérésekkel terhelni)
const jsonNagy = express.json({ limit: "40mb" });
const jsonKicsi = express.json({ limit: "1mb" });
app.use((req, res, next) => (req.user ? jsonNagy : jsonKicsi)(req, res, next));

// ===================== API =====================

app.use(require("./routes/auth"));
app.use(require("./routes/listings"));
app.use(require("./routes/images"));
app.use(require("./routes/places"));
app.use(require("./routes/favorites"));
app.use(require("./routes/statistics"));
app.use(require("./routes/valuation"));
app.use(require("./routes/admin"));
app.use(require("./routes/allapot"));
app.use(require("./routes/searches"));
app.use(require("./routes/requests"));
app.use(require("./routes/messages"));
app.use(require("./routes/location"));
app.use(require("./routes/irodak"));
app.use(require("./routes/legal"));
app.use(require("./routes/sitestats"));
app.use(require("./routes/beallitasok"));
app.use(require("./routes/kornyek"));
app.use(require("./routes/reklam"));
app.use(require("./routes/penzugy"));
app.use(require("./routes/csomagok"));
app.use(require("./routes/megbizas"));
app.use(require("./routes/csapat"));
app.use(require("./routes/fizetes"));
app.use(require("./routes/efactura"));
app.use(require("./routes/irattar"));

// Hibakezelő (pl. a belépés-ellenőrzés adatbázis-hibája)
app.use((err, req, res, next) => {
    if (err && (err.type === "entity.too.large" || err.status === 413)) return res.status(413).json({ error: "too_large" });
    if (err && err.type === "entity.parse.failed") return res.status(400).json({ error: "bad_request" });
    console.error(err);
    if (res.headersSent) return next(err);
    // A részletek csak az adminnak
    res.status(500).json(req.szerep === "admin" ? { error: "server_error", message: err.message } : { error: "server_error" });
});

// ===================== INDÍTÁS =====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Szerver elindult a ${PORT} porton.`);
    // Az állapotok listája (Admin → Állapotok) a gyorstárba
    require("./services/allapotok").kesz();
    // A meglévő hirdetések automatikus javítása – csak egyszer, az első indításkor.
    // Utána a falvakban lévő hirdetések a "<város> és környéke" városba (minden indításkor).
    setTimeout(() => {
        const autofix = require("./services/autofix");
        autofix.indulaskor()
            .then(() => autofix.nemKotelezoFrissit())
            .then(() => autofix.keruletIgazitas())
            .then(() => require("./services/kornyek").indulaskor());
    }, 5000);
    // Havi automatikus piaci mentés (ha ebben a hónapban még nem volt) – induláskor és naponta
    const havonta = () => require("./routes/statistics").havontaMent().catch(() => { });
    setTimeout(havonta, 60 * 1000);
    setInterval(havonta, 12 * 3600 * 1000).unref();
    // Pénzügyek: a kezdő díjcsomagok (egyszer), és ha be van kapcsolva, az
    // esedékes előfizetések díjbekérői (induláskor és 6 óránként)
    const penzugy = require("./services/penzugy");
    setTimeout(() => penzugy.kesz().then(() => penzugy.napi()), 20 * 1000);
    setInterval(() => penzugy.napi(), 6 * 3600 * 1000).unref();
    // Megbízások: emlékeztetők (24 és 2 órával a megtekintés előtt), lejárt ajánlatok,
    // lezáratlan megtekintések, a szakaszok kapui (15 percenként)
    const mbAuto = () => require("./services/megbizasAuto").futtat().catch(() => { });
    setTimeout(mbAuto, 90 * 1000);
    setInterval(mbAuto, 15 * 60 * 1000).unref();
    // e-Factura: az ANAF-nak küldött számlák állapota, az automatikus feltöltés
    // (ha be van kapcsolva) és a beérkező számlák letöltése – 30 percenként
    const efFut = () => require("./services/efacturaSpv").futtat().catch(() => { });
    setTimeout(efFut, 2 * 60 * 1000);
    setInterval(efFut, 30 * 60 * 1000).unref();
});
