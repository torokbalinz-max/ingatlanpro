// ============================================================
//  Értesítések (Fiókom → Értesítések) – services/ertesitesek.js
//   GET    /api/ertesitesek              lista + olvasatlan + beállítás
//   GET    /api/ertesitesek/db           csak az olvasatlanok száma (a csengőhöz)
//   PUT    /api/ertesitesek/beallitas    mi hova menjen (oldal / e-mail, milyen gyakran)
//   POST   /api/ertesitesek/nyelv        a levelek nyelve (a weboldal nyelve szerint)
//   POST   /api/ertesitesek/olvasva      { ids: [...] } vagy { mind: true }
//   DELETE /api/ertesitesek/:id          egy (vagy "mind") törlése
//   GET    /ertesitesek/leiratkozas      a levél leiratkozó linkje (belépés nélkül)
// ============================================================

const express = require("express");
const ert = require("../services/ertesitesek");
const mail = require("../services/mail");
const { hiba, csakBelepve } = require("../lib/http");

const router = express.Router();

router.get("/api/ertesitesek", csakBelepve, async (req, res) => {
    try {
        const [lista, olvasatlan, beallitas] = await Promise.all([
            ert.lista(req.user.id, { limit: 60, elotte: Number(req.query.elotte) || null }),
            ert.olvasatlanDb(req.user.id),
            ert.beallitas(req.user.id)
        ]);
        res.json({ lista, olvasatlan, beallitas, email: mail.elerheto() });
    } catch (err) { hiba(res, err); }
});

router.get("/api/ertesitesek/db", csakBelepve, async (req, res) => {
    try { res.json({ olvasatlan: await ert.olvasatlanDb(req.user.id) }); } catch (err) { hiba(res, err); }
});

router.put("/api/ertesitesek/beallitas", csakBelepve, async (req, res) => {
    try { res.json({ siker: true, beallitas: await ert.beallitasMent(req.user.id, req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.post("/api/ertesitesek/nyelv", csakBelepve, async (req, res) => {
    try { await ert.nyelvMent(req.user.id, String((req.body || {}).nyelv || "")); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

router.post("/api/ertesitesek/olvasva", csakBelepve, async (req, res) => {
    try {
        const b = req.body || {};
        res.json({ siker: true, olvasatlan: await ert.olvasva(req.user.id, b.mind ? "mind" : b.ids) });
    } catch (err) { hiba(res, err); }
});

router.delete("/api/ertesitesek/:id", csakBelepve, async (req, res) => {
    try { res.json({ siker: true, olvasatlan: await ert.torol(req.user.id, req.params.id === "mind" ? "mind" : req.params.id) }); } catch (err) { hiba(res, err); }
});

// ---------- leiratkozás a levélből ----------
//  A link megnyitása még nem iratkoztat le (a levelezők előre megnyithatják a
//  linkeket): egy gomb kell, ami POST-tal küld.

const LEIR = {
    hu: { cim: "Leiratkozás", szoveg: "Nem kérsz több e-mailt az IngatlanPro-tól? Az oldalon (a fiókodban) az értesítések továbbra is látszanak.", gomb: "Leiratkozom minden e-mailről", kesz: "Kész – nem küldünk több értesítő e-mailt. A fiókodban (Értesítések) bármikor visszakapcsolhatod.", hibas: "A link hibás vagy lejárt.", vissza: "Az oldal megnyitása" },
    ro: { cim: "Dezabonare", szoveg: "Nu mai dorești e-mailuri de la IngatlanPro? Notificările rămân vizibile pe site, în contul tău.", gomb: "Mă dezabonez de la toate e-mailurile", kesz: "Gata – nu mai trimitem e-mailuri de notificare. Le poți reporni oricând din cont (Notificări).", hibas: "Link invalid sau expirat.", vissza: "Deschide site-ul" },
    en: { cim: "Unsubscribe", szoveg: "Don't want any more e-mails from IngatlanPro? Notifications stay visible on the site, in your account.", gomb: "Unsubscribe from all e-mails", kesz: "Done – no more notification e-mails. You can turn them back on anytime in your account (Notifications).", hibas: "Invalid or expired link.", vissza: "Open the site" }
};

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function oldal(ny, tartalom, script = "") {
    return `<!doctype html><html lang="${ny}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>IngatlanPro</title>
<style>body{font-family:Arial,Helvetica,sans-serif;background:#f4f6f5;color:#1c2321;margin:0;padding:24px}.k{max-width:480px;margin:40px auto;background:#fff;border-radius:14px;padding:26px;box-shadow:0 2px 10px rgba(0,0,0,.06)}h1{font-size:20px;color:#1f6f5c;margin:0 0 12px}p{line-height:1.5}button,a.g{background:#1f6f5c;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer;text-decoration:none;display:inline-block}button:disabled{opacity:.6}.ny{font-size:13px;margin-top:18px}.ny a{color:#1f6f5c;margin-right:10px}</style>
</head><body><div class="k">${tartalom}</div>${script ? `<script>${script}</script>` : ""}</body></html>`;
}

const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'";

router.get("/ertesitesek/leiratkozas", async (req, res) => {
    const ny = ["hu", "ro", "en"].includes(req.query.ny) ? req.query.ny : "ro";
    const t = LEIR[ny];
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Content-Security-Policy", CSP);
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex");
    let jo = false;
    try { jo = await ert.leiratkozoEllenoriz(req.query.u, req.query.t); } catch (e) { jo = false; }
    const nyelvek = ["hu", "ro", "en"].map(n => `<a href="?u=${encodeURIComponent(req.query.u || "")}&t=${encodeURIComponent(req.query.t || "")}&ny=${n}">${n.toUpperCase()}</a>`).join("");
    if (!jo) return res.status(400).send(oldal(ny, `<h1>${esc(t.cim)}</h1><p>${esc(t.hibas)}</p><p><a class="g" href="/">${esc(t.vissza)}</a></p>`));
    const u = JSON.stringify(String(req.query.u || "")), tok = JSON.stringify(String(req.query.t || ""));
    res.send(oldal(ny, `
        <h1>${esc(t.cim)}</h1>
        <p id="sz">${esc(t.szoveg)}</p>
        <p><button type="button" id="g">${esc(t.gomb)}</button></p>
        <div class="ny">${nyelvek}</div>`, `
        (function () {
          var g = document.getElementById("g");
          g.onclick = function () {
            g.disabled = true;
            fetch("/ertesitesek/leiratkozas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ u: ${u}, t: ${tok} }) })
              .then(function (r) { if (!r.ok) throw new Error(); document.getElementById("sz").textContent = ${JSON.stringify(t.kesz)}; g.remove(); })
              .catch(function () { g.disabled = false; alert(${JSON.stringify(t.hibas)}); });
          };
        })();`));
});

router.post("/ertesitesek/leiratkozas", async (req, res) => {
    try {
        const b = req.body || {};
        if (!(await ert.leiratkozoEllenoriz(b.u, b.t))) return res.status(400).json({ error: "bad_token" });
        await ert.leiratkozik(Number(b.u));
        res.json({ siker: true });
    } catch (err) { hiba(res, err); }
});

module.exports = router;
