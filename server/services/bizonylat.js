// ============================================================
//  Számla / díjbekérő / sztornó számla – nyomtatható HTML
//
//  A tartalom a román Adótörvénykönyv (Legea 227/2015, art. 319)
//  kötelező számla-adatai szerint:
//    - sorszám (sorozat + szám), kiállítás dátuma, a teljesítés időszaka
//    - a szolgáltató neve, adószáma (CIF), cégjegyzékszáma, székhelye,
//      bankszámlája; ÁFA-alany-e (ha nem: a mentesség jogalapja)
//    - a vevő neve, adószáma / CNP-je, címe
//    - tételek: megnevezés, mennyiség, mértékegység, nettó egységár,
//      érték, ÁFA-kulcs, ÁFA-összeg; végösszegek
//    - ha nem lejben van és van ÁFA: az ÁFA lejben is, az árfolyammal
//    - sztornó számlán: melyik számlát sztornózza
//  A számla aláírás és bélyegző nélkül érvényes (art. 319 alin. 29).
//
//  A hivatalos szöveg román; kérésre mellette magyar vagy angol fordítás.
// ============================================================

const { esc, ket, oldal } = require("./dokumentum");

// --- Feliratok (ro = hivatalos; hu / en = fordítás) ---
const T = {
    factura: { ro: "FACTURĂ", hu: "SZÁMLA", en: "INVOICE" },
    proforma: { ro: "FACTURĂ PROFORMĂ", hu: "DÍJBEKÉRŐ", en: "PRO FORMA INVOICE" },
    storno: { ro: "FACTURĂ DE STORNARE", hu: "SZTORNÓ SZÁMLA", en: "CREDIT INVOICE (REVERSAL)" },
    seriaNr: { ro: "Seria și nr.", hu: "Sorszám", en: "Number" },
    dataEmiterii: { ro: "Data emiterii", hu: "Kiállítás dátuma", en: "Issue date" },
    termen: { ro: "Termen de plată", hu: "Fizetési határidő", en: "Due date" },
    perioada: { ro: "Perioada prestării", hu: "Teljesítési időszak", en: "Service period" },
    dataLivrarii: { ro: "Data prestării", hu: "Teljesítés dátuma", en: "Date of supply" },
    furnizor: { ro: "Furnizor", hu: "Szolgáltató", en: "Supplier" },
    cumparator: { ro: "Cumpărător", hu: "Vevő", en: "Customer" },
    cif: { ro: "CIF", hu: "Adószám", en: "Tax ID" },
    cifCnp: { ro: "CIF / CNP", hu: "Adószám / CNP", en: "Tax ID / personal no." },
    regCom: { ro: "Nr. Reg. Com.", hu: "Cégjegyzékszám", en: "Trade reg. no." },
    sediu: { ro: "Sediul", hu: "Székhely", en: "Registered office" },
    adresa: { ro: "Adresa", hu: "Cím", en: "Address" },
    iban: { ro: "Cont IBAN", hu: "Bankszámla (IBAN)", en: "Bank account (IBAN)" },
    banca: { ro: "Banca", hu: "Bank", en: "Bank" },
    email: { ro: "E-mail", hu: "E-mail", en: "E-mail" },
    tel: { ro: "Telefon", hu: "Telefon", en: "Phone" },
    platitorTva: { ro: "Plătitor de TVA", hu: "ÁFA-alany", en: "VAT registered" },
    neplatitorTva: { ro: "Neplătitor de TVA", hu: "Nem ÁFA-alany", en: "Not VAT registered" },
    nr: { ro: "Nr. crt.", hu: "#", en: "#" },
    denumire: { ro: "Denumirea produselor sau a serviciilor", hu: "Megnevezés", en: "Description" },
    um: { ro: "U.M.", hu: "Me.", en: "Unit" },
    cant: { ro: "Cant.", hu: "Menny.", en: "Qty" },
    pretUnitar: { ro: "Preț unitar (fără TVA)", hu: "Nettó egységár", en: "Unit price (excl. VAT)" },
    pretUnitarSimplu: { ro: "Preț unitar", hu: "Egységár", en: "Unit price" },
    valoare: { ro: "Valoare", hu: "Érték", en: "Amount" },
    cotaTva: { ro: "Cota TVA", hu: "ÁFA-kulcs", en: "VAT rate" },
    valoareTva: { ro: "Valoare TVA", hu: "ÁFA", en: "VAT" },
    totalFaraTva: { ro: "Total fără TVA", hu: "Nettó összesen", en: "Total excl. VAT" },
    totalTva: { ro: "Total TVA", hu: "ÁFA összesen", en: "Total VAT" },
    totalPlata: { ro: "Total de plată", hu: "Fizetendő", en: "Total due" },
    tvaLei: { ro: "TVA în lei", hu: "ÁFA lejben", en: "VAT in RON" },
    curs: { ro: "curs", hu: "árfolyam", en: "rate" },
    buc: { ro: "buc.", hu: "db", en: "pcs" },
    achitat: { ro: "ACHITAT", hu: "FIZETVE", en: "PAID" },
    anulat: { ro: "STORNATĂ", hu: "SZTORNÓZVA", en: "REVERSED" },
    plata: { ro: "Plata", hu: "Fizetés", en: "Payment" },
    prinTransfer: { ro: "prin transfer bancar în contul", hu: "átutalással a következő számlára", en: "by bank transfer to" },
    beneficiar: { ro: "Beneficiar", hu: "Kedvezményezett", en: "Beneficiary" },
    detalii: { ro: "Detalii plată (de menționat)", hu: "Közlemény (kérjük feltüntetni)", en: "Payment reference (please quote)" },
    card: { ro: "Plată cu cardul", hu: "Kártyás fizetés", en: "Card payment" },
    stornare: { ro: "Stornează factura", hu: "Sztornózza a számlát", en: "Reverses invoice" },
    dinData: { ro: "din data de", hu: "kelte", en: "dated" },
    stornataPrin: { ro: "Factura a fost stornată prin factura", hu: "A számlát sztornózta", en: "This invoice was reversed by" },
    proformaNota: {
        ro: "Factura proformă nu este document fiscal și nu are valoare de factură. Factura fiscală se emite după încasarea plății.",
        hu: "A díjbekérő nem adóügyi bizonylat, nem minősül számlának. A számlát a befizetés után állítjuk ki.",
        en: "A pro forma invoice is not a tax document. The tax invoice is issued once payment is received."
    },
    faraSemnatura: {
        ro: "Factura este valabilă fără semnătură și ștampilă, conform art. 319 alin. (29) din Legea nr. 227/2015 privind Codul fiscal.",
        hu: "A számla aláírás és bélyegző nélkül érvényes (Legea 227/2015, art. 319 alin. 29).",
        en: "This invoice is valid without signature or stamp (Law 227/2015, art. 319(29))."
    },
    mentions: { ro: "Mențiuni", hu: "Megjegyzés", en: "Notes" },
    proformaRef: { ro: "Emisă în baza facturii proforme", hu: "A díjbekérő alapján", en: "Based on pro forma" },
    fizMod: { ro: "Modalitate de plată", hu: "Fizetési mód", en: "Payment method" },
    efIndex: { ro: "RO e-Factura, index încărcare", hu: "RO e-Factura, feltöltési index", en: "RO e-Factura upload index" }
};

const FIZ_MOD = {
    atutalas: { ro: "transfer bancar", hu: "átutalás", en: "bank transfer" },
    kartya: { ro: "card bancar", hu: "bankkártya", en: "card" },
    online: { ro: "card bancar (online)", hu: "online kártyás fizetés", en: "online card payment" },
    keszpenz: { ro: "numerar", hu: "készpénz", en: "cash" },
    egyeb: { ro: "altă modalitate", hu: "egyéb", en: "other" }
};

// Alapértelmezett szöveg a nem ÁFA-alany szolgáltatónak
const TVA_MENTES_ALAP = "Furnizor neplătitor de TVA – regim special de scutire pentru întreprinderile mici (art. 310 din Codul fiscal). Scutit de TVA.";
const TVA_MENTES_FORD = {
    hu: "Nem ÁFA-alany szolgáltató – kisvállalkozói alanyi mentesség (Codul fiscal, art. 310).",
    en: "Supplier not registered for VAT – small enterprise exemption scheme (Romanian Fiscal Code, art. 310)."
};

// ---------- formázás ----------

function penz(v, penznem) {
    const n = Number(v) || 0;
    const s = Math.abs(n).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${n < 0 ? "-" : ""}${s}${penznem ? " " + penznem : ""}`;
}

function nap(d) {
    if (!d) return "–";
    const s = String(d).slice(0, 10);
    const [y, m, n] = s.split("-");
    return n && m && y ? `${n}.${m}.${y}` : s;
}

const szamStr = v => String(Number(v) || 0).replace(".", ",");

// A sorszám sorozat + szám alakban: "IP-2026-0001" → seria "IP", nr "2026-0001"
function sorozat(sorszam) {
    const m = String(sorszam || "").match(/^([A-Za-z]+)[-\s]?(.*)$/);
    return m ? { seria: m[1].toUpperCase(), nr: m[2] || "" } : { seria: "", nr: String(sorszam || "") };
}

// Tétel megnevezése románul (+ fordítás)
function tetelNev(t, ford) {
    const ro = t.megnevezes_ro || t.megnevezes || "";
    let tr = "";
    if (ford === "hu" && t.megnevezes && t.megnevezes !== ro) tr = t.megnevezes;
    if (ford === "en" && t.megnevezes_en && t.megnevezes_en !== ro) tr = t.megnevezes_en;
    return `${esc(ro)}${tr ? `<span class="tr tr-blokk">${esc(tr)}</span>` : ""}`;
}

function vevoCim(v) {
    return [v.cim, v.varos && !String(v.cim || "").includes(v.varos) ? v.varos : "", v.megye ? v.megye.replace(/^RO-/, "jud. ") : "",
        v.orszag && v.orszag !== "RO" ? v.orszag : ""].filter(Boolean).join(", ");
}

// ---------- a bizonylat ----------
//   s: a bizonylat (penzugy.szamla()), u: üzemeltető (oldalAdatok), b: pénzügyi beállítások
//   o: { ford, ui, nyomtat, vissza, admin, eredeti (sztornózott számla), sztornoja (a rá vonatkozó sztornó), dijbekero }
function html(s, u, b, o = {}) {

    const ford = o.ford || "";
    const L = (k, opt) => ket(T[k], ford, opt);
    const v = s.vevo || {};
    const proforma = s.tipus !== "szamla";
    const stornoSzamla = !proforma && (!!s.sztorno_eredeti_id || Number(s.brutto) < 0);
    const cimKulcs = proforma ? "proforma" : stornoSzamla ? "storno" : "factura";
    const tetelek = s.tetelek || [];
    const afaAlany = !!b.afa_fizeto;
    const afaOszlop = afaAlany || tetelek.some(t => Number(t.afa_kulcs) > 0);
    const penznem = s.penznem || "RON";
    const arf = Number(s.arfolyam) || Number(b.eur_arfolyam) || 0;

    // a mobil nézet cellacímkéje (szövegként)
    const cimke = k => T[k].ro + (ford && T[k][ford] && T[k][ford] !== T[k].ro ? " / " + T[k][ford] : "");
    const sor = (k, ertek) => ertek ? `<div class="adat"><span class="cimke">${L(k)}:</span> ${esc(ertek)}</div>` : "";

    const tvaMentes = !afaAlany ? `<div class="mentes">${esc(b.tva_mentes_szoveg || TVA_MENTES_ALAP)}${ford && TVA_MENTES_FORD[ford] && !b.tva_mentes_szoveg ? `<span class="tr tr-blokk">${esc(TVA_MENTES_FORD[ford])}</span>` : ""}</div>` : "";

    const belyeg = s.statusz === "sztorno"
        ? `<div class="belyeg piros">${L("anulat")}</div>`
        : s.statusz === "fizetve" && !stornoSzamla ? `<div class="belyeg">${L("achitat")} ${nap(s.fizetve)}</div>` : "";

    const fizetesBlokk = (s.statusz !== "fizetve" && s.statusz !== "sztorno" && !stornoSzamla && Number(s.brutto) > 0) ? `
  <div class="fizetes">
    <div><b>${L("plata")}:</b> ${b.iban ? `${L("prinTransfer")} <b class="mono">${esc(b.iban)}</b>${b.bank ? ` (${esc(b.bank)})` : ""}` : ""}</div>
    ${b.kedvezmenyezett ? `<div>${L("beneficiar")}: <b>${esc(b.kedvezmenyezett)}</b></div>` : ""}
    ${b.revolut_link ? `<div>${L("card")}: <a href="${esc(b.revolut_link)}">${esc(b.revolut_link.replace(/^https:\/\//, ""))}</a></div>` : ""}
    <div>${L("detalii")}: <b class="mono">${esc(s.sorszam)}</b> · ${L("termen")}: <b>${nap(s.esedekes)}</b></div>
  </div>` : "";

    // ÁFA lejben, ha a számla nem lejben van (art. 319 alin. 20 lit. j)
    const tvaLei = !proforma && afaOszlop && penznem !== "RON" && arf > 0
        ? `<div><span>${L("tvaLei")} (${L("curs")} BNR ${szamStr(arf)}${s.arfolyam_datum ? ", " + nap(String(s.arfolyam_datum instanceof Date ? s.arfolyam_datum.toISOString() : s.arfolyam_datum)) : ""})</span><span>${penz(Number(s.afa) * arf, "RON")}</span></div>`
        : "";

    const hivatkozasok = [];
    if (o.eredeti) hivatkozasok.push(`${L("stornare")} <b>${esc(o.eredeti.sorszam)}</b> ${L("dinData")} ${nap(o.eredeti.kiallitva)}.`);
    if (o.sztornoja) hivatkozasok.push(`${L("stornataPrin")} <b>${esc(o.sztornoja.sorszam)}</b> ${L("dinData")} ${nap(o.sztornoja.kiallitva)}.`);
    if (!proforma && o.dijbekero) hivatkozasok.push(`${L("proformaRef")}: ${esc(o.dijbekero.sorszam)}.`);
    if (!proforma && s.fizetesi_mod && FIZ_MOD[s.fizetesi_mod]) hivatkozasok.push(`${L("fizMod")}: ${ket(FIZ_MOD[s.fizetesi_mod], ford)}.`);

    // A rendszer belső megjegyzései (pl. „Díjbekérő / Proforma: …”, „Számla / Factură: …”) nem kellenek a nyomtatott iraton
    const megj = String(s.megjegyzes || "").split("\n").map(x => x.trim())
        .filter(x => x && !/^(Díjbekérő \/ Proforma|Számla \/ Factură|Sztornó \/ Stornare):/.test(x)).join("\n");

    const tartalom = `
  <div class="fej">
    <div class="kibocsato">
      <div class="logo">${esc(u.nev || "IngatlanPro")}</div>
      ${u.nev && u.nev !== "IngatlanPro" ? `<div class="kicsi">IngatlanPro</div>` : ""}
    </div>
    <div class="cim">
      <h1>${ket(T[cimKulcs], ford, { blokk: true })}</h1>
      <div class="szamadat">
        <div>${L("seriaNr")}: <b>${esc(s.sorszam)}</b></div>
        <div>${L("dataEmiterii")}: <b>${nap(s.kiallitva)}</b></div>
        ${s.idoszak_tol ? `<div>${L("perioada")}: ${nap(s.idoszak_tol)} – ${nap(s.idoszak_ig || s.idoszak_tol)}</div>` : ""}
        ${!stornoSzamla && s.esedekes && s.statusz !== "fizetve" ? `<div>${L("termen")}: <b>${nap(s.esedekes)}</b></div>` : ""}
        ${!proforma && s.kulso_szam && s.kulso_szam !== s.sorszam && !/^IP-/.test(s.kulso_szam) ? `<div class="kicsi">Ref.: ${esc(s.kulso_szam)}</div>` : ""}
        ${!proforma && s.efactura_index && ["feldolgozas", "ok", "kezi"].includes(s.efactura_allapot) ? `<div class="kicsi">${L("efIndex")}: ${esc(s.efactura_index)}</div>` : ""}
      </div>
      ${belyeg}
    </div>
  </div>

  <div class="felek">
    <div class="fel">
      <h3>${L("furnizor")}</h3>
      <div class="nev">${esc(u.nev || "–")}</div>
      ${sor("cif", u.adoszam)}
      ${sor("regCom", u.cegjegyzekszam)}
      ${sor("sediu", u.cim)}
      ${b.iban ? `<div class="adat"><span class="cimke">${L("iban")}:</span> <span class="mono">${esc(b.iban)}</span></div>` : ""}
      ${sor("banca", b.bank)}
      ${sor("email", u.email)}
      ${sor("tel", u.telefon)}
      <div class="adat"><span class="cimke">${afaAlany ? L("platitorTva") : L("neplatitorTva")}</span></div>
    </div>
    <div class="fel">
      <h3>${L("cumparator")}</h3>
      <div class="nev">${esc(v.nev || s.ugyfel_nev || "–")}</div>
      ${sor(v.tipus === "ceg" || v.tipus === "pfa" || v.reg_com ? "cif" : "cifCnp", v.cui ? (v.afa ? "RO" : "") + String(v.cui).replace(/^RO/i, "") : "")}
      ${sor("regCom", v.reg_com)}
      ${sor("adresa", vevoCim(v))}
      ${sor("email", v.email)}
      ${sor("tel", v.telefon)}
    </div>
  </div>

  <table class="tetelek">
    <thead>
      <tr>
        <th class="c">${L("nr")}</th>
        <th>${L("denumire")}</th>
        <th class="c">${L("um")}</th>
        <th class="r">${L("cant")}</th>
        <th class="r">${afaOszlop ? L("pretUnitar") : L("pretUnitarSimplu")}</th>
        <th class="r">${L("valoare")}</th>
        ${afaOszlop ? `<th class="r">${L("cotaTva")}</th><th class="r">${L("valoareTva")}</th>` : ""}
      </tr>
    </thead>
    <tbody>
      ${tetelek.map((t, i) => `
      <tr>
        <td class="c sorsz">${i + 1}.</td>
        <td class="nev">${tetelNev(t, ford)}</td>
        <td class="c" data-l="${esc(cimke("um"))}">${T.buc.ro}</td>
        <td class="r" data-l="${esc(cimke("cant"))}">${esc(szamStr(t.mennyiseg))}</td>
        <td class="r" data-l="${esc(cimke(afaOszlop ? "pretUnitar" : "pretUnitarSimplu"))}">${penz(t.egysegar)}</td>
        <td class="r" data-l="${esc(cimke("valoare"))}">${penz(t.netto)}</td>
        ${afaOszlop ? `<td class="r" data-l="${esc(cimke("cotaTva"))}">${esc(szamStr(t.afa_kulcs))}%</td><td class="r" data-l="${esc(cimke("valoareTva"))}">${penz(t.afa)}</td>` : ""}
      </tr>`).join("")}
    </tbody>
  </table>

  <div class="osszesen">
    ${afaOszlop ? `<div><span>${L("totalFaraTva")}</span><span>${penz(s.netto, penznem)}</span></div>
    <div><span>${L("totalTva")}</span><span>${penz(s.afa, penznem)}</span></div>` : ""}
    ${tvaLei}
    <div class="fo"><span>${L("totalPlata")}</span><span>${penz(s.brutto, penznem)}</span></div>
  </div>

  ${tvaMentes}
  ${fizetesBlokk}

  ${hivatkozasok.length || megj || b.szamla_megjegyzes ? `
  <div class="megj">
    <h3>${L("mentions")}</h3>
    ${hivatkozasok.map(h => `<div>${h}</div>`).join("")}
    ${megj ? `<div class="pre">${esc(megj)}</div>` : ""}
    ${b.szamla_megjegyzes ? `<div class="pre">${esc(b.szamla_megjegyzes)}</div>` : ""}
  </div>` : ""}

  <div class="lab">
    ${proforma ? ket(T.proformaNota, ford, { blokk: true }) : ket(T.faraSemnatura, ford, { blokk: true })}
  </div>`;

    const css = `
  .fej { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 3px solid #1f6f5c; padding-bottom: 14px; margin-bottom: 18px; }
  .logo { font-size: 21px; font-weight: bold; color: #1f6f5c; }
  .kicsi { font-size: 11.5px; color: #6a746f; }
  .cim { text-align: right; }
  h1 { font-size: 21px; margin: 0 0 6px; letter-spacing: .02em; }
  h1 .tr { font-size: 12px; letter-spacing: 0; }
  .szamadat { font-size: 13px; line-height: 1.6; }
  .felek { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; }
  .fel { font-size: 12.5px; line-height: 1.5; border: 1px solid #dfe3df; border-radius: 8px; padding: 10px 12px; }
  .fel h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #1f6f5c; margin: 0 0 4px; }
  .fel .nev { font-size: 14.5px; font-weight: bold; margin-bottom: 2px; }
  .cimke { color: #5b6660; }
  .mono { font-family: "Courier New", monospace; letter-spacing: .02em; }
  table.tetelek { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .tetelek th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .02em; color: #3f4944; background: #f1f4f1; border-bottom: 1px solid #cfd5cf; padding: 7px 5px; vertical-align: bottom; white-space: normal; hyphens: auto; }
  .tetelek th.r { text-align: right; }
  .tetelek td.nev { width: 36%; }
  .tetelek th .tr { text-transform: none; letter-spacing: 0; }
  .tetelek td { border-bottom: 1px solid #e6e9e6; padding: 8px 6px; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  .c { text-align: center; }
  .osszesen { margin: 12px 0 0 auto; width: 340px; max-width: 100%; font-size: 13.5px; }
  .osszesen div { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
  .osszesen .fo { font-size: 17px; font-weight: bold; border-top: 2px solid #1c2321; margin-top: 6px; padding-top: 8px; }
  .mentes { margin-top: 14px; font-size: 12px; color: #3f4944; }
  .fizetes { margin-top: 14px; font-size: 12.5px; line-height: 1.65; background: #eef6f3; border-radius: 8px; padding: 10px 12px; }
  .megj { margin-top: 14px; font-size: 12px; color: #3f4944; }
  .megj h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 4px; color: #5b6660; }
  .pre { white-space: pre-line; }
  .belyeg { display: inline-block; border: 2px solid #1f6f5c; color: #1f6f5c; font-weight: bold; padding: 2px 10px; border-radius: 6px; transform: rotate(-3deg); margin-top: 8px; font-size: 13px; }
  .belyeg .tr { color: inherit; }
  .belyeg.piros { border-color: #b42318; color: #b42318; }
  .lab { margin-top: 26px; padding-top: 10px; border-top: 1px solid #dfe3df; font-size: 11px; color: #6a746f; }
  @media (max-width: 640px) {
    .fej { flex-direction: column; } .cim { text-align: left; }
    .felek { grid-template-columns: 1fr; }
    .osszesen { width: 100%; }
    table.tetelek, .tetelek tbody, .tetelek tr, .tetelek td { display: block; width: 100%; }
    .tetelek thead { display: none; }
    .tetelek tr { border: 1px solid #dfe3df; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; position: relative; }
    .tetelek td { border: 0; padding: 2px 0; text-align: right; }
    .tetelek td.nev { width: auto; text-align: left; font-weight: bold; padding: 0 0 4px 22px; }
    .tetelek td.sorsz { position: absolute; left: 10px; top: 8px; width: auto; color: #6a746f; }
    .tetelek td[data-l] { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; }
    .tetelek td[data-l]::before { content: attr(data-l); color: #6a746f; text-align: left; }
  }
  @media print { .fel, .fizetes { break-inside: avoid; } tr { break-inside: avoid; } }`;

    const cimSor = `${T[cimKulcs].ro} ${s.sorszam}`;

    // XML / ANAF gombok (csak az adminnak, fiskális számlánál)
    const xmlGombok = o.admin && !proforma && o.nyomtat ? `
  <button type="button" id="dXml">XML (e-Factura)</button>
  <button type="button" id="dAnaf">ANAF ✓</button>` : "";
    const xmlScript = xmlGombok ? `
(function () {
  var ID = ${JSON.stringify(s.id)}, NEV = ${JSON.stringify(String(s.sorszam || "factura").replace(/[^\w.-]/g, "_"))};
  var HIBA = ${JSON.stringify(o.uiSzovegek || {})};
  function uz(t) { window.dUzenet(t); }
  document.getElementById("dXml").onclick = function () {
    uz("");
    fetch("/api/admin/penzugy/szamlak/" + ID + "/efactura.xml", { cache: "no-store", credentials: "same-origin" }).then(function (r) {
      if (r.ok) return r.blob().then(function (b) {
        var u = URL.createObjectURL(b), a = document.createElement("a");
        a.href = u; a.download = NEV + ".xml"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 3000);
      });
      return r.json().then(function (j) { uz((HIBA.hianyzik || "Missing data") + ":\\n" + (j.hianyzik_szoveg || j.hianyzik || []).join("\\n")); });
    }).catch(function () { uz(HIBA.halozat || "Network error"); });
  };
  document.getElementById("dAnaf").onclick = function () {
    uz(HIBA.ellenoriz || "…");
    fetch("/api/admin/penzugy/szamlak/" + ID + "/efactura/ellenoriz", { method: "POST", credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.hianyzik_szoveg) return uz((HIBA.hianyzik || "Missing data") + ":\\n" + j.hianyzik_szoveg.join("\\n"));
        if (j.stare === "ok") return uz(HIBA.ok || "OK");
        uz((HIBA.nok || "ANAF") + "\\n" + (j.hibak || [j.error || ""]).join("\\n"));
      }).catch(function () { uz(HIBA.halozat || "Network error"); });
  };
})();` : "";

    return oldal({
        cim: cimSor,
        css,
        tartalom,
        ford,
        ui: o.ui,
        vissza: o.vissza,
        eszkoz: !!o.nyomtat,
        extraGombok: xmlGombok,
        script: xmlScript
    });
}

module.exports = { html, T, TVA_MENTES_ALAP, sorozat, penz, nap };
