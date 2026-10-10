// ============================================================
//  Admin → Pénzügyek: díjcsomagok, ügyfelek, előfizetések,
//  díjbekérők / számlák, kiadások, áttekintés, export, beállítások
//  (a munka: services/penzugy.js)
// ============================================================

const express = require("express");
const pu = require("../services/penzugy");
const oldalAdatok = require("../services/oldalAdatok");
const mail = require("../services/mail");
const { hiba, csakAdmin, csakBelepve } = require("../lib/http");

const router = express.Router();

const id = req => {
    const n = Number(req.params.id);
    return Number.isInteger(n) && n > 0 ? n : null;
};

// ===================== ÁTTEKINTÉS, BEÁLLÍTÁSOK =====================

router.get("/api/admin/penzugy/attekintes", csakAdmin, async (req, res) => {
    try { res.json(await pu.attekintes()); } catch (err) { hiba(res, err); }
});

router.get("/api/admin/penzugy/beallitas", csakAdmin, async (req, res) => {
    try {
        res.json({
            beallitas: await pu.beallitas(),
            uzemelteto: await oldalAdatok.olvas(),
            email: mail.elerheto(),
            listak: {
                kategoriak: pu.KATEGORIAK, idoszakok: pu.IDOSZAKOK, penznemek: pu.PENZNEMEK, fizetesiModok: pu.FIZETESI_MODOK,
                kiadasKategoriak: pu.KIADAS_KATEGORIAK, ugyfelTipusok: pu.UGYFEL_TIPUSOK, elofizetesStatuszok: pu.ELOFIZETES_STATUSZOK
            }
        });
    } catch (err) { hiba(res, err); }
});

router.put("/api/admin/penzugy/beallitas", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, beallitas: await pu.beallitasMent(req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/arfolyam", csakAdmin, async (req, res) => {
    try {
        const a = await pu.bnrArfolyam();
        res.json({ siker: true, ...a, beallitas: await pu.beallitasMent({ eur_arfolyam: a.eur, arfolyam_datum: a.datum }) });
    } catch (err) {
        res.status(502).json({ error: "bnr_unavailable", message: err.message });
    }
});

router.get("/api/admin/penzugy/korlat-elonezet", csakAdmin, async (req, res) => {
    try { res.json(await pu.korlatElonezet()); } catch (err) { hiba(res, err); }
});

// ===================== DÍJCSOMAGOK =====================

router.get("/api/admin/penzugy/csomagok", csakAdmin, async (req, res) => {
    try { res.json(await pu.csomagok()); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/csomagok", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, id: await pu.csomagMent(null, req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/penzugy/csomagok/:id", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, id: await pu.csomagMent(id(req), req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/penzugy/csomagok/:id", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, ...(await pu.csomagTorol(id(req))) }); } catch (err) { hiba(res, err); }
});

// ===================== ÜGYFELEK =====================

router.get("/api/admin/penzugy/ugyfelek", csakAdmin, async (req, res) => {
    try { res.json(await pu.ugyfelek()); } catch (err) { hiba(res, err); }
});

router.get("/api/admin/penzugy/ugyfel-javaslat", csakAdmin, async (req, res) => {
    try { res.json(await pu.ugyfelJavaslat(req.query.q)); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/ugyfelek", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, id: await pu.ugyfelMent(null, req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/penzugy/ugyfelek/:id", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, id: await pu.ugyfelMent(id(req), req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/penzugy/ugyfelek/:id", csakAdmin, async (req, res) => {
    try { await pu.ugyfelTorol(id(req)); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// ===================== ELŐFIZETÉSEK =====================

router.get("/api/admin/penzugy/elofizetesek", csakAdmin, async (req, res) => {
    try { res.json(await pu.elofizetesek()); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/elofizetesek", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, id: await pu.elofizetesMent(null, req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/penzugy/elofizetesek/:id", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, id: await pu.elofizetesMent(id(req), req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/penzugy/elofizetesek/:id", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, ...(await pu.elofizetesTorol(id(req))) }); } catch (err) { hiba(res, err); }
});

// Az esedékes előfizetések díjbekérőinek elkészítése
router.post("/api/admin/penzugy/esedekes-dijbekerok", csakAdmin, async (req, res) => {
    try { const ids = await pu.esedekesDijbekerok(); res.json({ siker: true, db: ids.length, ids }); } catch (err) { hiba(res, err); }
});

// ===================== DÍJBEKÉRŐK / SZÁMLÁK =====================

router.get("/api/admin/penzugy/szamlak", csakAdmin, async (req, res) => {
    try { res.json(await pu.szamlak({ tol: req.query.tol, ig: req.query.ig, ugyfel_id: req.query.ugyfel })); } catch (err) { hiba(res, err); }
});

router.get("/api/admin/penzugy/szamlak/:id", csakAdmin, async (req, res) => {
    try {
        const s = await pu.szamla(id(req));
        if (!s) return res.status(404).json({ error: "not_found" });
        res.json(s);
    } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/szamlak", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, id: await pu.szamlaMent(null, req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/penzugy/szamlak/:id", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, id: await pu.szamlaMent(id(req), req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/szamlak/:id/allapot", csakAdmin, async (req, res) => {
    try { await pu.szamlaAllapotValt(id(req), req.body || {}); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/penzugy/szamlak/:id", csakAdmin, async (req, res) => {
    try { await pu.szamlaTorol(id(req)); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// Nyomtatható díjbekérő (új lapon nyílik; a böngészőből PDF-be menthető)
router.get("/api/admin/penzugy/szamlak/:id/nyomtat", csakAdmin, async (req, res) => {
    try {
        const s = await pu.szamla(id(req));
        if (!s) return res.status(404).send("Nincs ilyen bizonylat");
        const html = await bizonylatHtml(s, { nyomtat: true });
        res.set("Content-Type", "text/html; charset=utf-8");
        res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:");
        res.send(html);
    } catch (err) { hiba(res, err); }
});

// Díjbekérő küldése e-mailben a vevőnek
router.post("/api/admin/penzugy/szamlak/:id/email", csakAdmin, async (req, res) => {
    try {
        if (!mail.elerheto()) return res.status(400).json({ error: "mail_not_configured" });
        const s = await pu.szamla(id(req));
        if (!s) return res.status(404).json({ error: "not_found" });
        const to = String((req.body && req.body.email) || (s.vevo && s.vevo.email) || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return res.status(400).json({ error: "bad_email" });
        const u = await oldalAdatok.nyilvanos();
        const ok = await mail.kuld({
            to,
            subject: `${s.tipus === "szamla" ? "Számla / Factură" : "Díjbekérő / Factură proformă"} ${s.sorszam}`,
            html: await bizonylatHtml(s, { nyomtat: false }),
            replyTo: u.email || undefined
        });
        if (!ok) return res.status(502).json({ error: "mail_failed" });
        await require("../db/database").query("UPDATE penzugy_szamlak SET emailezve = NOW() WHERE id = $1", [s.id]);
        res.json({ siker: true, to });
    } catch (err) { hiba(res, err); }
});

// ===================== KIADÁSOK =====================

router.get("/api/admin/penzugy/kiadasok", csakAdmin, async (req, res) => {
    try { res.json(await pu.kiadasok({ tol: req.query.tol, ig: req.query.ig })); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/penzugy/kiadasok", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, id: await pu.kiadasMent(null, req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/penzugy/kiadasok/:id", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, id: await pu.kiadasMent(id(req), req.body || {}) }); } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/penzugy/kiadasok/:id", csakAdmin, async (req, res) => {
    try { await pu.kiadasTorol(id(req)); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// ===================== EXPORT (könyvelőnek, CSV / Excel) =====================

router.get("/api/admin/penzugy/export/:mit", csakAdmin, async (req, res) => {
    try {
        const f = { tol: req.query.tol, ig: req.query.ig };
        const mit = req.params.mit === "kiadasok" ? "kiadasok" : "szamlak";
        const tartalom = mit === "kiadasok" ? await pu.exportKiadasok(f) : await pu.exportSzamlak(f);
        const nev = `ingatlanpro-${mit}-${(f.tol || "").slice(0, 10) || "osszes"}${f.ig ? "_" + String(f.ig).slice(0, 10) : ""}.csv`.replace(/[^\w.-]/g, "");
        res.set("Content-Type", "text/csv; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="${nev}"`);
        res.send(tartalom);
    } catch (err) { hiba(res, err); }
});

// ===================== A FELHASZNÁLÓ SAJÁT CSOMAGJA =====================

router.get("/api/sajat-csomag", csakBelepve, async (req, res) => {
    try { res.json(await pu.jogosultsag(req.user.id)); } catch (err) { hiba(res, err); }
});

// ===================== A BIZONYLAT HTML-JE =====================

function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function penz(v, penznem) {
    const s = (Number(v) || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${s} ${penznem || ""}`.trim();
}

function nap(d) {
    return d ? String(d).slice(0, 10).replace(/-/g, ".") + "." : "–";
}

async function bizonylatHtml(s, { nyomtat }) {

    const u = await oldalAdatok.nyilvanos();
    const b = await pu.beallitas();
    const v = s.vevo || {};
    const proforma = s.tipus !== "szamla";
    const cim = proforma ? "Díjbekérő · Factură proformă" : "Számla · Factură";
    const afaOszlop = (s.tetelek || []).some(t => Number(t.afa_kulcs) > 0) || b.afa_fizeto;

    const sor = (label, ertek) => ertek ? `<div><span>${esc(label)}</span> ${esc(ertek)}</div>` : "";

    return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(cim)} ${esc(s.sorszam)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1c2321; margin: 0; background: #f3f4f2; }
  .lap { max-width: 800px; margin: 24px auto; background: #fff; padding: 36px 40px; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .fej { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 3px solid #1f6f5c; padding-bottom: 16px; margin-bottom: 20px; }
  .logo { font-size: 22px; font-weight: bold; color: #1f6f5c; }
  h1 { font-size: 20px; margin: 0 0 6px; text-align: right; }
  .szam { text-align: right; font-size: 13px; line-height: 1.6; }
  .felek { display: flex; gap: 24px; margin-bottom: 22px; }
  .fel { flex: 1; font-size: 13px; line-height: 1.55; background: #f7f8f6; border-radius: 8px; padding: 12px 14px; }
  .fel h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #5b6660; margin: 0 0 6px; }
  .fel b { font-size: 14px; }
  .fel span { color: #5b6660; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #5b6660; border-bottom: 1px solid #d9ddd9; padding: 8px 6px; }
  td { border-bottom: 1px solid #eceeea; padding: 9px 6px; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  .ossz { margin-top: 14px; margin-left: auto; width: 300px; font-size: 14px; }
  .ossz div { display: flex; justify-content: space-between; padding: 4px 0; }
  .ossz .fo { font-size: 18px; font-weight: bold; border-top: 2px solid #1c2321; margin-top: 6px; padding-top: 8px; }
  .fizetes { margin-top: 24px; font-size: 13px; line-height: 1.6; background: #eef6f3; border-radius: 8px; padding: 12px 14px; }
  .megj { margin-top: 16px; font-size: 12px; color: #5b6660; white-space: pre-line; }
  .belyeg { display: inline-block; border: 2px solid #1f6f5c; color: #1f6f5c; font-weight: bold; padding: 2px 10px; border-radius: 6px; transform: rotate(-4deg); margin-top: 6px; }
  .belyeg.sztorno { border-color: #b42318; color: #b42318; }
  .eszkoz { text-align: center; margin: 16px 0 32px; }
  .eszkoz button { font-size: 15px; padding: 9px 18px; border-radius: 8px; border: 0; background: #1f6f5c; color: #fff; cursor: pointer; }
  @media print { body { background: #fff; } .lap { box-shadow: none; margin: 0; max-width: none; padding: 0; } .eszkoz { display: none; } }
  @media (max-width: 640px) { .lap { padding: 20px 16px; margin: 0; border-radius: 0; } .felek, .fej { flex-direction: column; } h1, .szam { text-align: left; } .ossz { width: 100%; } }
</style>
</head>
<body>
<div class="lap">
  <div class="fej">
    <div>
      <div class="logo">IngatlanPro</div>
      ${u.nev ? `<div style="font-size:13px;margin-top:4px">${esc(u.nev)}</div>` : ""}
    </div>
    <div>
      <h1>${esc(cim)}</h1>
      <div class="szam">
        <div><b>${esc(s.sorszam)}</b></div>
        ${!proforma && s.kulso_szam ? `<div>Hivatalos szám / Nr. factură: <b>${esc(s.kulso_szam)}</b></div>` : ""}
        <div>Kiállítva / Data emiterii: ${nap(s.kiallitva)}</div>
        <div>Fizetési határidő / Scadența: ${nap(s.esedekes)}</div>
        ${s.idoszak_tol ? `<div>Időszak / Perioada: ${nap(s.idoszak_tol)} – ${nap(s.idoszak_ig)}</div>` : ""}
        ${s.statusz === "fizetve" ? `<div class="belyeg">FIZETVE / ACHITAT ${nap(s.fizetve)}</div>` : ""}
        ${s.statusz === "sztorno" ? `<div class="belyeg sztorno">SZTORNÓ / ANULAT</div>` : ""}
      </div>
    </div>
  </div>

  <div class="felek">
    <div class="fel">
      <h3>Szolgáltató / Furnizor</h3>
      <b>${esc(u.nev || "IngatlanPro")}</b>
      ${sor("Adószám / CUI:", u.adoszam)}
      ${sor("Cégjegyzékszám / Reg. Com.:", u.cegjegyzekszam)}
      ${sor("", u.cim)}
      ${sor("E-mail:", u.email)}
      ${sor("Tel.:", u.telefon)}
      ${b.iban ? `<div><span>IBAN:</span> ${esc(b.iban)}${b.bank ? ` · ${esc(b.bank)}` : ""}</div>` : ""}
      <div><span>${b.afa_fizeto ? "ÁFA-alany / Plătitor de TVA" : "Nem ÁFA-alany / Neplătitor de TVA"}</span></div>
    </div>
    <div class="fel">
      <h3>Vevő / Client</h3>
      <b>${esc(v.nev || s.ugyfel_nev || "–")}</b>
      ${sor("Adószám / CUI:", v.cui)}
      ${sor("Reg. Com.:", v.reg_com)}
      ${sor("", v.cim)}
      ${sor("E-mail:", v.email)}
      ${sor("Tel.:", v.telefon)}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Megnevezés / Denumire</th>
        <th class="r">Menny. / Cant.</th>
        <th class="r">Egységár / Preț unitar</th>
        ${afaOszlop ? `<th class="r">ÁFA / TVA</th>` : ""}
        <th class="r">Összesen / Total</th>
      </tr>
    </thead>
    <tbody>
      ${(s.tetelek || []).map((t, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(t.megnevezes)}</td>
        <td class="r">${esc(String(t.mennyiseg).replace(".", ","))}</td>
        <td class="r">${penz(t.egysegar, s.penznem)}</td>
        ${afaOszlop ? `<td class="r">${esc(String(t.afa_kulcs))}% · ${penz(t.afa, s.penznem)}</td>` : ""}
        <td class="r">${penz(t.brutto, s.penznem)}</td>
      </tr>`).join("")}
    </tbody>
  </table>

  <div class="ossz">
    ${afaOszlop ? `<div><span>Nettó / Valoare fără TVA</span><span>${penz(s.netto, s.penznem)}</span></div>
    <div><span>ÁFA / TVA</span><span>${penz(s.afa, s.penznem)}</span></div>` : ""}
    <div class="fo"><span>Fizetendő / Total de plată</span><span>${penz(s.brutto, s.penznem)}</span></div>
  </div>

  ${s.statusz !== "fizetve" && s.statusz !== "sztorno" ? `
  <div class="fizetes">
    <b>Fizetés / Plata:</b> ${b.iban ? `átutalással / prin transfer bancar: <b>${esc(b.iban)}</b>${b.bank ? ` (${esc(b.bank)})` : ""}` : "a megadott módon / conform înțelegerii"}<br>
    Közlemény / Detalii plată: <b>${esc(s.sorszam)}</b> · Határidő / Termen: <b>${nap(s.esedekes)}</b>
  </div>` : ""}

  <div class="megj">${proforma ? "Ez a díjbekérő nem adóügyi bizonylat. A befizetés után a számlát kiállítjuk.\nAcest document nu are valoare fiscală. Factura fiscală se emite după efectuarea plății." : ""}${s.megjegyzes ? "\n\n" + esc(s.megjegyzes) : ""}${b.szamla_megjegyzes ? "\n\n" + esc(b.szamla_megjegyzes) : ""}</div>
</div>
${nyomtat ? `<div class="eszkoz"><button type="button" onclick="window.print()">Nyomtatás / PDF</button></div>` : ""}
</body>
</html>`;
}

module.exports = router;
