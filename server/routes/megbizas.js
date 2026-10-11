// ============================================================
//  Eladjuk helyetted – megbízásos értékesítés: nyilvános ajánlat,
//  megbízás leadása, az eladó (Fiókom → Megbízásaim), a vevő (a
//  hirdetésen: megtekintés, ajánlat), Admin → Megbízások
//  (a munka: services/megbizas.js)
// ============================================================

const express = require("express");
const mb = require("../services/megbizas");
const pu = require("../services/penzugy");
const mail = require("../services/mail");
const oldalAdatok = require("../services/oldalAdatok");
const db = require("../db/database");
const { hiba, csakAdmin, csakBelepve } = require("../lib/http");

const router = express.Router();

const STATUSZ_NEV = {
    uj: "Új megbízás / Mandat nou", egyeztetes: "Egyeztetés / Discuții", szerzodes: "Szerződés aláírva / Contract semnat",
    fotozas: "Fotózás / Fotografiere", hirdetes: "Hirdetés kint van / Anunț publicat", targyalas: "Tárgyalás / Negociere",
    eladva: "Eladva / Vândut", lezarva: "Lezárva / Închis", elutasitva: "Nem vállaltuk / Respins"
};

// Levél (ha az e-mail be van állítva) – a hibák nem akadályozzák a kérést
function level(to, cim, sorok, link, gomb) {
    if (!mail.elerheto() || !to) return;
    const t = mail.sablon({ cim, sorok, link, gomb });
    mail.kuld({ to, subject: cim, html: t.html, text: t.text }).catch(e => console.error("Megbízás e-mail:", e.message));
}

async function adminLevel(req, cim, sorok, id) {
    const u = await oldalAdatok.nyilvanos();
    level(u.email, cim, sorok, mail.oldalCim(req) + "/#admin/megbizasok" + (id ? "/" + id : ""), "Megbízás megnyitása");
}

async function eladoLevel(req, m, cim, sorok) {
    let to = m.email;
    if (!to && m.user_id) {
        const r = await db.query("SELECT email FROM users WHERE id = $1", [m.user_id]);
        to = r.rows[0] && r.rows[0].email;
    }
    level(to, cim, sorok, mail.oldalCim(req) + "/#fiok/megbizasok", "Megbízásaim");
}

// ===================== NYILVÁNOS =====================

router.get("/api/megbizas/ajanlat", async (req, res) => {
    try { res.json(await mb.ajanlat()); } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas", csakBelepve, async (req, res) => {
    try {
        const v = await mb.letrehoz(req.user, req.body || {});
        res.json({ siker: true, ...v });
        const b = req.body || {};
        adminLevel(req, `Új megbízás: ${v.szam}`, [
            `${b.nev || "–"} (${b.telefon || ""} ${b.email || ""}) megbízott minket: ${b.ugylet === "kiado" ? "kiadás" : "eladás"}, ${b.tipus || ""}, ${b.varos || ""} ${b.cim || ""}`,
            b.kert_ar ? `Elképzelt ár: ${b.kert_ar}` : "",
            "Vedd fel vele a kapcsolatot az egyeztetéshez."
        ].filter(Boolean), v.id).catch(() => { });
    } catch (err) { hiba(res, err); }
});

// ===================== AZ ELADÓ =====================

router.get("/api/megbizas/sajat", csakBelepve, async (req, res) => {
    try { res.json(await mb.sajatLista(req.user)); } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/sajat/:id/ajanlat/:aid/valasz", csakBelepve, async (req, res) => {
    try {
        const v = await mb.eladoValasz(req.user, req.params.id, req.params.aid, req.body || {});
        res.json({ siker: true, statusz: v.statusz });
        adminLevel(req, `Az eladó válaszolt az ajánlatra (${v.megbizas.szerzodes_szam})`, [
            `Ajánlat: ${v.ajanlat.osszeg} ${v.ajanlat.penznem} → ${v.statusz}${req.body && req.body.osszeg ? ` (ellenajánlat: ${req.body.osszeg})` : ""}`,
            req.body && req.body.uzenet ? `„${String(req.body.uzenet).slice(0, 500)}”` : ""
        ].filter(Boolean), v.megbizas.id).catch(() => { });
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/sajat/:id/visszavon", csakBelepve, async (req, res) => {
    try {
        const m = await mb.sajatVisszavon(req.user, req.params.id);
        res.json({ siker: true });
        adminLevel(req, `Visszavont megbízás: ${m.szerzodes_szam}`, [`${m.nev || ""} visszavonta a megbízást.`], m.id).catch(() => { });
    } catch (err) { hiba(res, err); }
});

// A szerződés (tervezet) – az eladó a sajátját, az admin bármelyiket
router.get("/api/megbizas/:id/szerzodes", csakBelepve, async (req, res) => {
    try {
        const m = req.szerep === "admin"
            ? (await db.query("SELECT * FROM megbizasok WHERE id = $1", [Number(req.params.id) || 0])).rows[0]
            : await mb.sajatMegbizas(req.user, req.params.id);
        if (!m) return res.status(404).send("Nincs ilyen megbízás / Mandat inexistent");
        res.set("Content-Type", "text/html; charset=utf-8");
        res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:");
        res.send(await szerzodesHtml(m));
    } catch (err) { hiba(res, err); }
});

// ===================== A VEVŐ (megbízásos hirdetés) =====================

router.get("/api/megbizas/hirdetes/:id", async (req, res) => {
    try { res.json(await mb.vevoAllapot(req.user, req.params.id)); } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/hirdetes/:id/keres", csakBelepve, async (req, res) => {
    try {
        const v = await mb.vevoKeres(req.user, req.params.id, req.body || {});
        res.json({ siker: true, ...v });
        const b = req.body || {};
        adminLevel(req, v.tipus === "ajanlat" ? "Új vételi ajánlat" : v.tipus === "megtekintes" ? "Megtekintési kérés" : "Kérdés egy megbízásos hirdetésről", [
            `${b.nev || ""} (${b.telefon || ""} ${b.email || ""}) – hirdetés #${req.params.id}`,
            v.tipus === "ajanlat" ? `Ajánlat: ${b.osszeg} ${b.penznem === "RON" ? "RON" : "EUR"}` : "",
            b.javasolt ? `Javasolt időpont: ${b.javasolt}` : "",
            b.uzenet ? `„${String(b.uzenet).slice(0, 500)}”` : ""
        ].filter(Boolean), v.megbizas_id).catch(() => { });
    } catch (err) { hiba(res, err); }
});

// ===================== ADMIN =====================

router.get("/api/admin/megbizasok", csakAdmin, async (req, res) => {
    try { res.json(await mb.adminLista()); } catch (err) { hiba(res, err); }
});

router.get("/api/admin/megbizasok/:id", csakAdmin, async (req, res) => {
    try {
        const m = await mb.adminReszlet(req.params.id);
        if (!m) return res.status(404).json({ error: "not_found" });
        res.json(m);
    } catch (err) { hiba(res, err); }
});

router.put("/api/admin/megbizasok/:id", csakAdmin, async (req, res) => {
    try {
        const v = await mb.adminMent(req.params.id, req.body || {}, req.user && req.user.id);
        res.json({ siker: true });
        if (v.ujStatusz && !["uj"].includes(v.ujStatusz)) {
            eladoLevel(req, v.elozo, `Megbízásod állapota: ${STATUSZ_NEV[v.ujStatusz] || v.ujStatusz}`, [
                `${v.elozo.szerzodes_szam}: ${STATUSZ_NEV[v.ujStatusz] || v.ujStatusz}`,
                "A részleteket a fiókodban látod. / Detaliile le găsești în contul tău."
            ]).catch(() => { });
        }
    } catch (err) { hiba(res, err); }
});

router.post("/api/admin/megbizasok/:id/naplo", csakAdmin, async (req, res) => {
    try {
        await mb.naploHozzaad(req.params.id, req.body || {}, req.user && req.user.id);
        res.json({ siker: true });
        if (req.body && req.body.lathato_eladonak) {
            const m = (await db.query("SELECT * FROM megbizasok WHERE id = $1", [Number(req.params.id)])).rows[0];
            if (m) eladoLevel(req, m, `Új üzenet a megbízásodhoz (${m.szerzodes_szam})`, [String(req.body.szoveg || "").slice(0, 2000)]).catch(() => { });
        }
    } catch (err) { hiba(res, err); }
});

const ALRESZ = { erdeklodok: mb.erdeklodoMent, megtekintesek: mb.megtekintesMent, ajanlatok: mb.ajanlatMent };

router.post("/api/admin/megbizasok/:id/:resz", csakAdmin, async (req, res, next) => {
    const fn = ALRESZ[req.params.resz];
    if (!fn) return next();
    try {
        const id = await fn(Number(req.params.id), null, req.body || {});
        res.json({ siker: true, id });
        await utanaErtesit(req, req.params.resz, Number(req.params.id), id, null);
    } catch (err) { hiba(res, err); }
});

router.put("/api/admin/megbizasok/:id/:resz/:rid", csakAdmin, async (req, res, next) => {
    const fn = ALRESZ[req.params.resz];
    if (!fn) return next();
    try {
        const elozo = req.params.resz === "ajanlatok"
            ? (await db.query("SELECT statusz FROM megbizas_ajanlatok WHERE id = $1", [Number(req.params.rid)])).rows[0]
            : req.params.resz === "megtekintesek"
                ? (await db.query("SELECT statusz, idopont FROM megbizas_megtekintesek WHERE id = $1", [Number(req.params.rid)])).rows[0]
                : null;
        const id = await fn(Number(req.params.id), Number(req.params.rid), req.body || {});
        res.json({ siker: true, id });
        await utanaErtesit(req, req.params.resz, Number(req.params.id), id, elozo);
    } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/megbizasok/:id/:resz/:rid", csakAdmin, async (req, res) => {
    try { await mb.torol(req.params.resz, req.params.id, req.params.rid); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// Az eladó értesítése: továbbított ajánlat, egyeztetett megtekintés
async function utanaErtesit(req, resz, megbizasId, id, elozo) {
    try {
        const m = (await db.query("SELECT * FROM megbizasok WHERE id = $1", [megbizasId])).rows[0];
        if (!m) return;
        if (resz === "ajanlatok") {
            const a = (await db.query("SELECT * FROM megbizas_ajanlatok WHERE id = $1", [id])).rows[0];
            if (a && a.statusz === "tovabbitva" && (!elozo || elozo.statusz !== "tovabbitva")) {
                await db.query(`INSERT INTO megbizas_naplo (megbizas_id, tipus, szoveg, lathato_eladonak, created_by) VALUES ($1, 'ajanlat', $2, true, $3)`,
                    [m.id, `Vételi ajánlat érkezett: ${a.osszeg} ${a.penznem}`, req.user && req.user.id]);
                eladoLevel(req, m, `Vételi ajánlat érkezett (${m.szerzodes_szam})`, [
                    `Ajánlat: ${a.osszeg} ${a.penznem}${a.feltetelek ? ` – ${a.feltetelek}` : ""}`,
                    "A fiókodban elfogadhatod, elutasíthatod, vagy ellenajánlatot tehetsz. / Poți accepta, refuza sau face o contraofertă în cont."
                ]).catch(() => { });
            }
        }
        if (resz === "megtekintesek") {
            const t = (await db.query("SELECT * FROM megbizas_megtekintesek WHERE id = $1", [id])).rows[0];
            const ujIdopont = t && t.idopont && (!elozo || String(elozo.idopont) !== String(t.idopont) || elozo.statusz !== "egyeztetve");
            if (t && t.statusz === "egyeztetve" && ujIdopont) {
                const ido = new Date(t.idopont).toLocaleString("hu-HU", { timeZone: "Europe/Bucharest", dateStyle: "medium", timeStyle: "short" });
                await db.query(`INSERT INTO megbizas_naplo (megbizas_id, tipus, szoveg, lathato_eladonak, created_by) VALUES ($1, 'megtekintes', $2, true, $3)`,
                    [m.id, `Megtekintés egyeztetve: ${ido}`, req.user && req.user.id]);
                eladoLevel(req, m, `Megtekintés: ${ido}`, [
                    `Egy érdeklődő megnézi az ingatlant: ${ido}.`,
                    "Vizionare programată – detalii în contul tău."
                ]).catch(() => { });
            }
        }
    } catch (e) {
        console.error("Megbízás értesítés:", e.message);
    }
}

router.get("/api/admin/megbizas-beallitas", csakAdmin, async (req, res) => {
    try { res.json(await mb.beallitas()); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/megbizas-beallitas", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, beallitas: await mb.beallitasMent(req.body || {}) }); } catch (err) { hiba(res, err); }
});

// Díjbekérő a sikerdíjról (és a fizetős opciókról) – a Pénzügyekbe kerül
router.post("/api/admin/megbizasok/:id/dijbekero", csakAdmin, async (req, res) => {
    try {
        const m = (await db.query("SELECT * FROM megbizasok WHERE id = $1", [Number(req.params.id) || 0])).rows[0];
        if (!m) return res.status(404).json({ error: "not_found" });
        const dij = await mb.dijSzamol(m);
        const b = req.body || {};
        const tetelek = [];
        if (b.siker !== false && dij.siker) {
            tetelek.push({ megnevezes: `Közvetítési sikerdíj / Comision intermediere – ${m.szerzodes_szam}${m.eladasi_ar ? ` (${m.eladasi_ar} ${dij.penznem} × ${dij.jutalek}%)` : ""}`, kategoria: "kozvetites", mennyiseg: 1, egysegar: dij.siker });
        }
        if (dij.fix) tetelek.push({ megnevezes: `Megbízási díj / Taxă mandat – ${m.szerzodes_szam}`, kategoria: "kozvetites", mennyiseg: 1, egysegar: dij.fix });
        if (b.opciok !== false) {
            dij.opciok.forEach(o => tetelek.push({ megnevezes: `${o.nev.hu} / ${o.nev.ro} – ${m.szerzodes_szam}`, kategoria: "kozvetites", mennyiseg: 1, egysegar: o.ar, penznem: o.penznem }));
        }
        if (!tetelek.length) return res.status(400).json({ error: "missing_items" });

        // Egy díjbekérőn egy pénznem: ami eltér, átváltjuk a beállított árfolyammal
        const be = await pu.beallitas();
        const penznem = dij.penznem;
        tetelek.forEach(t => {
            if (t.penznem && t.penznem !== penznem) {
                t.egysegar = penznem === "EUR" ? Math.round(t.egysegar / (be.eur_arfolyam || 5) * 100) / 100 : Math.round(t.egysegar * (be.eur_arfolyam || 5) * 100) / 100;
            }
            delete t.penznem;
        });

        // Ügyfél: az eladó (a fiókjához kötve)
        let ugyfelId = null;
        const u = await db.query("SELECT id FROM penzugy_ugyfelek WHERE user_id = $1 AND iroda_id IS NULL ORDER BY id LIMIT 1", [m.user_id || 0]);
        if (u.rowCount) ugyfelId = u.rows[0].id;
        else {
            ugyfelId = await pu.ugyfelMent(null, {
                tipus: "maganszemely", nev: m.nev || "Eladó", cim: [m.cim, m.telepules, m.varos].filter(Boolean).join(", ") || null,
                email: m.email, telefon: m.telefon, user_id: m.user_id, jegyzet: `Megbízás: ${m.szerzodes_szam}`
            });
        }
        const szamlaId = await pu.szamlaMent(null, {
            tipus: "dijbekero", ugyfel_id: ugyfelId, penznem, tetelek,
            megjegyzes: `Megbízás / Mandat: ${m.szerzodes_szam}`
        });
        await db.query(`INSERT INTO megbizas_naplo (megbizas_id, tipus, szoveg, lathato_eladonak, created_by) VALUES ($1, 'jegyzet', $2, false, $3)`,
            [m.id, `Díjbekérő készült (#${szamlaId})`, req.user && req.user.id]);
        res.json({ siker: true, szamla_id: szamlaId });
    } catch (err) { hiba(res, err); }
});

// ===================== A SZERZŐDÉS (tervezet, HU / RO) =====================

function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const TIPUS_NEV = { lakas: "lakás / apartament", haz: "ház / casă", telek: "telek / teren", kereskedelmi: "üzlethelyiség / spațiu comercial", iroda: "iroda / birou" };

function nap(d) {
    if (!d) return "____________";
    return mb.pgDatum(d).replace(/-/g, ".") + ".";
}

async function szerzodesHtml(m) {
    const u = await oldalAdatok.nyilvanos();
    const be = await mb.beallitas();
    const dij = await mb.dijSzamol(m);
    const opciok = (Array.isArray(m.opciok) ? m.opciok : []).map(k => be.opciok.find(o => o.kod === k)).filter(Boolean);
    const kiado = m.ugylet === "kiado";
    const jut = dij.jutalek;
    const ido = m.idotartam_honap || be.idotartam_honap || 6;
    const p = (hu, ro) => `<p>${hu}</p><p class="ro">${ro}</p>`;

    return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Megbízási szerződés / Contract de intermediere ${esc(m.szerzodes_szam)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1c2321; margin: 0; background: #f3f4f2; line-height: 1.5; }
  .lap { max-width: 820px; margin: 24px auto; background: #fff; padding: 40px 48px; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,.08); font-size: 14px; }
  .tervezet { font-family: Arial, sans-serif; background: #fff4e5; border: 1px solid #f0c27a; color: #7a4a00; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; margin-bottom: 22px; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 4px; }
  .alcim { text-align: center; color: #5b6660; margin-bottom: 22px; font-size: 13px; }
  h2 { font-size: 14.5px; margin: 22px 0 6px; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: .03em; color: #1f6f5c; }
  p { margin: 0 0 6px; }
  .ro { color: #4b5651; font-style: italic; margin-bottom: 10px; }
  .felek { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-family: Arial, sans-serif; font-size: 13px; }
  .fel { background: #f7f8f6; border-radius: 8px; padding: 12px 14px; }
  .fel h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #5b6660; }
  ul { margin: 4px 0 10px 18px; padding: 0; }
  .alair { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; font-family: Arial, sans-serif; font-size: 13px; }
  .alair div { border-top: 1px solid #1c2321; padding-top: 6px; text-align: center; }
  .eszkoz { text-align: center; margin: 16px 0 32px; font-family: Arial, sans-serif; }
  .eszkoz button { font-size: 15px; padding: 9px 18px; border-radius: 8px; border: 0; background: #1f6f5c; color: #fff; cursor: pointer; }
  @media print { body { background: #fff; } .lap { box-shadow: none; margin: 0; max-width: none; padding: 0; } .eszkoz { display: none; } }
  @media (max-width: 640px) { .lap { padding: 20px 16px; margin: 0; border-radius: 0; } .felek, .alair { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="lap">
  <div class="tervezet"><b>TERVEZET / PROIECT.</b> Ezt a szerződést aláírás előtt romániai ügyvéddel ellenőriztesd (közvetítői tevékenység, fogyasztóvédelem, GDPR). ·
  Acest contract trebuie verificat de un avocat înainte de semnare.</div>

  <h1>Megbízási (közvetítési) szerződés</h1>
  <div class="alcim">Contract de intermediere imobiliară · Nr. <b>${esc(m.szerzodes_szam)}</b> · ${nap(m.szerzodes_datum || m.alairva)}</div>

  <div class="felek">
    <div class="fel">
      <h3>Megbízott / Intermediar</h3>
      <b>${esc(u.nev || "IngatlanPro")}</b><br>
      ${u.adoszam ? `CUI: ${esc(u.adoszam)}<br>` : ""}
      ${u.cegjegyzekszam ? `Reg. Com.: ${esc(u.cegjegyzekszam)}<br>` : ""}
      ${u.cim ? `${esc(u.cim)}<br>` : ""}
      ${u.email ? `E-mail: ${esc(u.email)}<br>` : ""}
      ${u.telefon ? `Tel.: ${esc(u.telefon)}` : ""}
    </div>
    <div class="fel">
      <h3>Megbízó / Client (proprietar)</h3>
      <b>${esc(m.nev || "____________________")}</b><br>
      Szem. ig. / CI: ____________ · CNP: ________________<br>
      Lakcím / Domiciliu: ______________________________<br>
      ${m.telefon ? `Tel.: ${esc(m.telefon)}<br>` : ""}
      ${m.email ? `E-mail: ${esc(m.email)}` : ""}
    </div>
  </div>

  <h2>1. A szerződés tárgya / Obiectul contractului</h2>
  ${p(`A Megbízó megbízza a Megbízottat, hogy az alábbi ingatlan <b>${kiado ? "bérbeadásához" : "eladásához"}</b> vevőt (bérlőt) keressen, és az ügylet létrejöttét elősegítse.`,
      `Clientul îl împuternicește pe Intermediar să caute un ${kiado ? "chiriaș" : "cumpărător"} pentru imobilul de mai jos și să faciliteze încheierea tranzacției.`)}
  <ul>
    <li>${esc(TIPUS_NEV[m.tipus] || m.tipus || "–")}${m.nm ? `, ${esc(m.nm)} m²` : ""}${m.szobak ? `, ${esc(m.szobak)} szoba / camere` : ""}</li>
    <li>Cím / Adresa: ${esc([m.cim, m.telepules, m.varos].filter(Boolean).join(", ") || "______________________________")}</li>
    <li>Telekkönyv / Carte funciară nr.: ______________ · Helyrajzi szám / Nr. cadastral: ______________</li>
    <li>Kért ár / Preț solicitat: ${m.kert_ar ? `<b>${esc(Number(m.kert_ar).toLocaleString("hu-HU"))} ${esc(dij.penznem)}</b>` : "______________"} (tárgyalható / negociabil)</li>
  </ul>

  <h2>2. A Megbízott szolgáltatásai / Serviciile intermediarului</h2>
  <ul>
    ${opciok.map(o => `<li><b>${esc(o.nev.hu)}</b> / ${esc(o.nev.ro)}${o.ar > 0 ? ` – ${esc(o.ar)} ${esc(o.penznem)}` : ""}</li>`).join("")}
  </ul>
  ${p("A Megbízott az érdeklődőket előszűri, a megtekintéseket egyezteti, a vételi ajánlatokat írásban továbbítja a Megbízónak. Az ajánlat elfogadásáról mindig a Megbízó dönt.",
      "Intermediarul filtrează persoanele interesate, programează vizionările și transmite în scris ofertele către Client. Decizia de acceptare a unei oferte aparține întotdeauna Clientului.")}

  <h2>3. Díjazás / Remunerația</h2>
  ${p(`A Megbízottat az ügylet létrejötte esetén <b>sikerdíj</b> illeti meg: a végleges ${kiado ? "éves bérleti díj" : "vételár"} <b>${esc(jut)}%-a</b>${be.minimum_dij ? `, de legalább <b>${esc(be.minimum_dij)} ${esc(dij.penznem)}</b>` : ""}${dij.fix ? `, valamint <b>${esc(dij.fix)} ${esc(dij.penznem)}</b> megbízási díj` : ""}. A sikerdíj az adásvételi (bérleti) szerződés aláírásakor esedékes.${opciok.some(o => o.ar > 0) ? " A külön díjas szolgáltatások díja a teljesítéskor esedékes, akkor is, ha az ügylet nem jön létre." : ""}`,
      `Intermediarul are dreptul la un <b>comision de succes</b> de <b>${esc(jut)}%</b> din ${kiado ? "chiria anuală" : "prețul final de vânzare"}${be.minimum_dij ? `, dar nu mai puțin de <b>${esc(be.minimum_dij)} ${esc(dij.penznem)}</b>` : ""}${dij.fix ? `, plus o taxă de mandat de <b>${esc(dij.fix)} ${esc(dij.penznem)}</b>` : ""}. Comisionul este exigibil la semnarea contractului de vânzare-cumpărare (închiriere).${opciok.some(o => o.ar > 0) ? " Serviciile cu tarif separat se plătesc la prestare, chiar dacă tranzacția nu se încheie." : ""}`)}
  ${p("A sikerdíj akkor is jár, ha a Megbízó a Megbízott által bemutatott vevővel a szerződés megszűnésétől számított 6 hónapon belül köt szerződést.",
      "Comisionul se datorează și dacă Clientul încheie tranzacția cu un cumpărător prezentat de Intermediar în termen de 6 luni de la încetarea contractului.")}

  <h2>4. Időtartam${m.kizarolagos ? ", kizárólagosság" : ""} / Durata${m.kizarolagos ? ", exclusivitate" : ""}</h2>
  ${p(`A szerződés <b>${esc(ido)} hónapra</b> szól, és bármelyik fél 15 napos írásbeli felmondással megszüntetheti.${m.kizarolagos ? " A szerződés idején a Megbízó más közvetítőt nem bíz meg; ha mégis más közvetítő révén ad el, a sikerdíj a Megbízottat illeti." : " A megbízás nem kizárólagos: a Megbízó maga is, illetve más közvetítő útján is értékesíthet."}`,
      `Contractul se încheie pe <b>${esc(ido)} luni</b> și poate fi denunțat de oricare parte cu o notificare scrisă de 15 zile.${m.kizarolagos ? " Pe durata contractului, Clientul nu va mandata alt intermediar; în caz contrar, comisionul se datorează Intermediarului." : " Mandatul nu este exclusiv: Clientul poate vinde și singur sau prin alt intermediar."}`)}

  <h2>5. A Megbízó kötelezettségei / Obligațiile Clientului</h2>
  ${p("A Megbízó szavatolja, hogy jogosult az ingatlan feletti rendelkezésre, átadja a szükséges iratokat (telekkönyv-kivonat, energetikai tanúsítvány stb.), lehetővé teszi a fotózást és a megtekintéseket, és tájékoztatja a Megbízottat, ha az ingatlant más módon eladta.",
      "Clientul garantează că are dreptul de a dispune de imobil, pune la dispoziție documentele necesare (extras CF, certificat energetic etc.), permite fotografierea și vizionările și informează Intermediarul dacă a vândut imobilul pe altă cale.")}

  <h2>6. Adatvédelem / Protecția datelor</h2>
  ${p("A felek személyes adatait a Megbízott kizárólag a szerződés teljesítéséhez kezeli, az IngatlanPro adatvédelmi tájékoztatója és a GDPR szerint.",
      "Intermediarul prelucrează datele personale ale părților exclusiv pentru executarea contractului, conform politicii de confidențialitate IngatlanPro și GDPR.")}

  <h2>7. Egyéb / Dispoziții finale</h2>
  ${p("A szerződésre a román jog, különösen a Polgári Törvénykönyv közvetítési szerződésre vonatkozó rendelkezései irányadók. A szerződés két eredeti példányban készült.",
      "Contractul este guvernat de legea română, în special de dispozițiile Codului civil privind contractul de intermediere. Contractul s-a încheiat în două exemplare originale.")}
  ${be.szerzodes_megjegyzes ? `<p style="white-space:pre-line">${esc(be.szerzodes_megjegyzes)}</p>` : ""}

  <div class="alair">
    <div>Megbízott / Intermediar<br><br>${esc(u.nev || "IngatlanPro")}</div>
    <div>Megbízó / Client<br><br>${esc(m.nev || "")}</div>
  </div>
</div>
<div class="eszkoz"><button type="button" onclick="window.print()">Nyomtatás / PDF</button></div>
</body>
</html>`;
}

module.exports = router;
