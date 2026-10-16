// ============================================================
//  e-Factura: a saját számla UBL 2.1 XML-ként (RO_CIUS 1.0.1)
//
//  Romániában a számlát az ANAF e-Factura rendszerébe is be kell küldeni.
//  Amíg nincs külső számlázó (SmartBill / Oblio), az app saját számlájából
//  ez az XML letölthető (Admin → Pénzügy → Díjbekérők, számlák, és az
//  Irattár), és az ANAF SPV-ben (spv.anaf.ro → e-Factura → Încărcare)
//  feltölthető. Előtte érdemes az ANAF ingyenes ellenőrzőjével megnézni:
//  https://www.anaf.ro/uploadxmi/ (Validare XML).
//
//  Az eladó adatai: Admin → Rendszer → Webhely adatai (név, adószám, cím,
//  cégjegyzékszám) + Pénzügy → Számlázás (település, megye kód, pl. RO-CV).
//  A vevő: a számlán lévő adatok; magánszemélynél adószám helyett
//  13 db 0 (az ANAF szabálya szerint, ha a CNP nem ismert).
//
//  FONTOS: a beküldés előtt könyvelővel / az ANAF ellenőrzőjével ellenőrizd.
// ============================================================

const pu = require("./penzugy");
const oldalAdatok = require("./oldalAdatok");

function x(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

const ket = v => (Math.round(Number(v || 0) * 100) / 100).toFixed(2);

// Fizetési mód → UNTDID 4461 kód
const FIZ_KOD = { kartya: "48", online: "48", atutalas: "42", keszpenz: "10" };

// Cím szétbontása: "Str. X 5, Sfântu Gheorghe, Covasna" → utca + település
function cimBont(cim, alapVaros) {
    const r = String(cim || "").split(",").map(t => t.trim()).filter(Boolean);
    if (r.length >= 2) return { utca: r.slice(0, -1).join(", "), varos: r[r.length - 1] };
    return { utca: r[0] || "-", varos: alapVaros || "-" };
}

function adoszam(cui) {
    return String(cui || "").toUpperCase().replace(/\s/g, "").replace(/^RO/, "");
}

function fel(tag, p) {
    // p: { nev, cui, afa, regcom, utca, varos, megye, email, telefon }
    return `
  <cac:${tag}>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${x(p.utca)}</cbc:StreetName>
        <cbc:CityName>${x(p.varos)}</cbc:CityName>
        ${p.megye ? `<cbc:CountrySubentity>${x(p.megye)}</cbc:CountrySubentity>` : ""}
        <cac:Country><cbc:IdentificationCode>RO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${p.afa && p.cui ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>RO${x(p.cui)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ""}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${x(p.nev)}</cbc:RegistrationName>
        <cbc:CompanyID>${x(p.afa ? (p.regcom || p.cui) : (p.cui || "0000000000000"))}</cbc:CompanyID>
      </cac:PartyLegalEntity>
      ${p.email || p.telefon ? `<cac:Contact>
        ${p.telefon ? `<cbc:Telephone>${x(p.telefon)}</cbc:Telephone>` : ""}
        ${p.email ? `<cbc:ElectronicMail>${x(p.email)}</cbc:ElectronicMail>` : ""}
      </cac:Contact>` : ""}
    </cac:Party>
  </cac:${tag}>`;
}

// Hiányzó adatok, amik nélkül az ANAF elutasítja
async function hianyok(s) {
    const u = await oldalAdatok.nyilvanos();
    const be = await pu.beallitas();
    const h = [];
    if (!s || s.tipus !== "szamla") h.push("not_invoice");
    if (!u.nev) h.push("seller_name");
    if (!u.adoszam) h.push("seller_cui");
    if (!u.cim) h.push("seller_address");
    if (!be.efactura_varos) h.push("seller_city");
    if (!/^RO-[A-Z]{1,2}$/.test(be.efactura_megye || "")) h.push("seller_county");
    return h;
}

async function xml(s) {

    const u = await oldalAdatok.nyilvanos();
    const be = await pu.beallitas();
    const v = s.vevo || {};
    const afa = !!be.afa_fizeto;
    const penz = s.penznem || "RON";

    const elado = {
        nev: u.nev, cui: adoszam(u.adoszam), afa, regcom: u.cegjegyzekszam,
        utca: cimBont(u.cim, be.efactura_varos).utca, varos: be.efactura_varos, megye: be.efactura_megye,
        email: u.email, telefon: u.telefon
    };
    const vc = cimBont(v.cim, be.efactura_varos);
    // a vevő ÁFA-alanyiságát nem tároljuk: az adószáma a jogi azonosítóként megy
    const vevoAfa = false;
    const vevo = {
        nev: v.nev || s.ugyfel_nev || "Client", cui: adoszam(v.cui), afa: vevoAfa, regcom: v.reg_com,
        utca: vc.utca, varos: vc.varos, megye: be.efactura_megye, email: v.email, telefon: v.telefon
    };

    // ÁFA-csoportok
    const tetelek = s.tetelek || [];
    const csoport = {};
    tetelek.forEach(t => {
        const k = afa ? Number(t.afa_kulcs || 0) : -1;
        csoport[k] = csoport[k] || { alap: 0, ado: 0 };
        csoport[k].alap += Number(t.netto || 0);
        csoport[k].ado += Number(t.afa || 0);
    });
    const kat = k => k < 0 ? "O" : k === 0 ? "Z" : "S";
    const katXml = (k, tag) => `<cac:${tag}>
          <cbc:ID>${kat(k)}</cbc:ID>
          ${k >= 0 ? `<cbc:Percent>${ket(k)}</cbc:Percent>` : ""}
          ${tag === "TaxCategory" && k < 0 ? `<cbc:TaxExemptionReasonCode>VATEX-EU-O</cbc:TaxExemptionReasonCode>` : ""}
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:${tag}>`;

    const netto = tetelek.reduce((a, t) => a + Number(t.netto || 0), 0);
    const adoOssz = tetelek.reduce((a, t) => a + Number(t.afa || 0), 0);
    const brutto = netto + adoOssz;

    // Ha nem lejben van: az ÁFA összegét lejben is meg kell adni
    const arf = Number(be.eur_arfolyam) || 5;
    const lejben = penz !== "RON" ? `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RON">${ket(adoOssz * arf)}</cbc:TaxAmount>
  </cac:TaxTotal>` : "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>
  <cbc:ID>${x(s.sorszam)}</cbc:ID>
  <cbc:IssueDate>${x(pu.pgDatum(s.kiallitva))}</cbc:IssueDate>
  ${s.esedekes ? `<cbc:DueDate>${x(pu.pgDatum(s.esedekes))}</cbc:DueDate>` : ""}
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  ${s.megjegyzes ? `<cbc:Note>${x(String(s.megjegyzes).slice(0, 300))}</cbc:Note>` : ""}
  <cbc:DocumentCurrencyCode>${x(penz)}</cbc:DocumentCurrencyCode>
  ${penz !== "RON" ? `<cbc:TaxCurrencyCode>RON</cbc:TaxCurrencyCode>` : ""}
  ${s.idoszak_tol ? `<cac:InvoicePeriod>
    <cbc:StartDate>${x(pu.pgDatum(s.idoszak_tol))}</cbc:StartDate>
    <cbc:EndDate>${x(pu.pgDatum(s.idoszak_ig || s.idoszak_tol))}</cbc:EndDate>
  </cac:InvoicePeriod>` : ""}
  ${fel("AccountingSupplierParty", elado)}
  ${fel("AccountingCustomerParty", vevo)}
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${FIZ_KOD[s.fizetesi_mod] || "42"}</cbc:PaymentMeansCode>
    ${be.iban ? `<cac:PayeeFinancialAccount><cbc:ID>${x(be.iban)}</cbc:ID></cac:PayeeFinancialAccount>` : ""}
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${x(penz)}">${ket(adoOssz)}</cbc:TaxAmount>
    ${Object.entries(csoport).map(([k, c]) => `<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${x(penz)}">${ket(c.alap)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${x(penz)}">${ket(c.ado)}</cbc:TaxAmount>
      ${katXml(Number(k), "TaxCategory")}
    </cac:TaxSubtotal>`).join("\n    ")}
  </cac:TaxTotal>${lejben}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${x(penz)}">${ket(netto)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${x(penz)}">${ket(netto)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${x(penz)}">${ket(brutto)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${x(penz)}">${ket(brutto)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${tetelek.map((t, i) => `<cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${Number(t.mennyiseg || 1)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${x(penz)}">${ket(t.netto)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${x(String(t.megnevezes).slice(0, 200))}</cbc:Name>
      ${katXml(afa ? Number(t.afa_kulcs || 0) : -1, "ClassifiedTaxCategory")}
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${x(penz)}">${ket(t.egysegar)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`).join("\n  ")}
</Invoice>
`;
}

module.exports = { xml, hianyok };
