// ============================================================
//  Nyomtatható iratok közös kerete (számla, díjbekérő, szerződés)
//
//  - A hivatalos szöveg ROMÁN nyelvű (Romániában ez az irányadó).
//    Kérésre mellette magyar vagy angol fordítás is megjelenik:
//    ?ford=hu | ?ford=en | ?ford=ro (csak román).
//  - Felül eszközsáv (nyomtatáskor nem látszik): Vissza az appba,
//    nyelvválasztó, Nyomtatás / PDF, és amit az irat még kér (pl. XML).
//    A „Vissza” telefonon és tableten is működik: ha az irat új lapon
//    nyílt, bezárja a lapot; ha nem, visszalép; végső esetben az app
//    megadott oldalára visz.
// ============================================================

function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const FORDITASOK = ["hu", "en"];
const UI_NYELVEK = ["hu", "ro", "en"];

// A kért fordítás: "hu" | "en" | "" (csak román)
function fordKer(q, alap) {
    const v = String((q && q.ford) || "").toLowerCase();
    if (v === "ro" || v === "nincs") return "";
    if (FORDITASOK.includes(v)) return v;
    return FORDITASOK.includes(alap) ? alap : "";
}

function uiKer(q, ford) {
    const v = String((q && q.ui) || "").toLowerCase();
    if (UI_NYELVEK.includes(v)) return v;
    return ford || "hu";
}

// Az eszközsáv feliratai
const UI = {
    hu: { vissza: "Vissza", nyomtat: "Nyomtatás / PDF", nyelv: "Nyelv", csakRo: "Román", roHu: "Román + magyar", roEn: "Román + angol" },
    ro: { vissza: "Înapoi", nyomtat: "Tipărire / PDF", nyelv: "Limba", csakRo: "Română", roHu: "Română + maghiară", roEn: "Română + engleză" },
    en: { vissza: "Back", nyomtat: "Print / PDF", nyelv: "Language", csakRo: "Romanian", roHu: "Romanian + Hungarian", roEn: "Romanian + English" }
};

// Kétnyelvű felirat: a román a fő, mellette (ha kérték) a fordítás
//   t: { ro, hu, en }   ford: "" | "hu" | "en"
function ket(t, ford, { blokk = false } = {}) {
    if (!t) return "";
    const ro = t.ro || "";
    const tr = ford && t[ford] && t[ford] !== ro ? t[ford] : "";
    if (!tr) return ro;
    return blokk ? `${ro}<span class="tr tr-blokk">${tr}</span>` : `${ro} <span class="tr">/ ${tr}</span>`;
}

// Bekezdés: román szöveg, alatta a fordítás dőlten
function bek(t, ford) {
    const tr = ford && t[ford] ? `<p class="tr-p">${t[ford]}</p>` : "";
    return `<p>${t.ro}</p>${tr}`;
}

const ALAP_CSS = `
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1c2321; margin: 0; background: #eef0ed; line-height: 1.45; }
  .eszkoz { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
            padding: 10px max(12px, env(safe-area-inset-right)) 10px max(12px, env(safe-area-inset-left));
            background: #1f6f5c; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
  .eszkoz .ter { flex: 1; }
  .eszkoz button, .eszkoz a.gomb, .eszkoz select { font: inherit; font-size: 15px; min-height: 40px; padding: 7px 14px; border-radius: 8px;
            border: 1px solid rgba(255,255,255,.55); background: transparent; color: #fff; cursor: pointer; text-decoration: none;
            display: inline-flex; align-items: center; gap: 6px; }
  .eszkoz select { padding-right: 8px; }
  .eszkoz select option { color: #1c2321; }
  .eszkoz .fo { background: #fff; color: #1f6f5c; border-color: #fff; font-weight: bold; }
  .eszkoz .vissza { font-weight: bold; }
  .eszkoz .uzenet { width: 100%; font-size: 13px; background: rgba(255,255,255,.12); border-radius: 6px; padding: 6px 10px; display: none; white-space: pre-line; }
  .eszkoz .uzenet.on { display: block; }
  .lap { max-width: 820px; margin: 20px auto 40px; background: #fff; padding: 36px 44px; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .tr { color: #6a746f; font-weight: normal; }
  .tr-blokk { display: block; font-size: .82em; }
  .tr-p { color: #55605a; font-style: italic; font-size: .93em; margin-top: -2px; }
  @media print {
    body { background: #fff; }
    .eszkoz { display: none !important; }
    .lap { box-shadow: none; margin: 0; max-width: none; padding: 0; border-radius: 0; }
    @page { margin: 14mm 12mm; }
  }
  @media (max-width: 640px) {
    .lap { padding: 20px 14px; margin: 0 0 24px; border-radius: 0; }
    .eszkoz button, .eszkoz a.gomb, .eszkoz select { font-size: 14px; padding: 6px 10px; }
  }
`;

// A teljes HTML oldal
//   o: { cim, css, tartalom, ford, ui, vissza (az app oldala), eszkoz (bool),
//        extraGombok (HTML), script (extra JS), lang }
function oldal(o) {
    const ui = UI[o.ui] || UI.hu;
    const ford = o.ford || "";
    const eszkoz = o.eszkoz === false ? "" : `
<div class="eszkoz" role="toolbar">
  <button type="button" class="vissza" id="dVissza" aria-label="${esc(ui.vissza)}">&#8592; ${esc(ui.vissza)}</button>
  <span class="ter"></span>
  <label style="display:inline-flex;align-items:center;gap:6px">
    <span class="sr" style="position:absolute;left:-9999px">${esc(ui.nyelv)}</span>
    <select id="dNyelv" aria-label="${esc(ui.nyelv)}">
      <option value="ro" ${!ford ? "selected" : ""}>${esc(ui.csakRo)}</option>
      <option value="hu" ${ford === "hu" ? "selected" : ""}>${esc(ui.roHu)}</option>
      <option value="en" ${ford === "en" ? "selected" : ""}>${esc(ui.roEn)}</option>
    </select>
  </label>
  ${o.extraGombok || ""}
  <button type="button" class="fo" id="dNyomtat">${esc(ui.nyomtat)}</button>
  <div class="uzenet" id="dUzenet" role="status"></div>
</div>`;

    const script = o.eszkoz === false ? "" : `
<script>
(function () {
  var APP = ${JSON.stringify(String(o.vissza || "/"))};
  document.getElementById("dNyomtat").onclick = function () { window.print(); };
  document.getElementById("dNyelv").onchange = function () {
    var u = new URL(location.href);
    u.searchParams.set("ford", this.value);
    location.replace(u.toString());
  };
  document.getElementById("dVissza").onclick = function () {
    // 1) ha az appból ugyanezen a lapon jöttünk: vissza
    try {
      if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { history.back(); return; }
    } catch (e) {}
    // 2) ha új lapon nyílt: a lap bezárása (visszaugrik az appra)
    try { window.close(); } catch (e) {}
    // 3) ha a böngésző nem engedi bezárni: az app megfelelő oldala
    setTimeout(function () { location.href = APP; }, 250);
  };
  window.dUzenet = function (szoveg) {
    var u = document.getElementById("dUzenet");
    u.textContent = szoveg || "";
    u.classList.toggle("on", !!szoveg);
  };
})();
${o.script || ""}
</script>`;

    return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${esc(o.cim)}</title>
<style>${ALAP_CSS}${o.css || ""}</style>
</head>
<body>
${eszkoz}
<div class="lap">
${o.tartalom}
</div>
${script}
</body>
</html>`;
}

// A CSP, amivel ezek az oldalak mennek (inline stílus és script kell)
const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'";

module.exports = { esc, ket, bek, oldal, fordKer, uiKer, CSP, FORDITASOK };
