// ============================================================
//  e-Factura: a saját számla UBL 2.1 XML-ként (CIUS-RO 1.0.1)
//
//  Romániában a számlát az ANAF e-Factura rendszerébe is be kell küldeni
//  (a kiállítástól számított 5 munkanapon belül). Amíg nincs külső számlázó
//  (SmartBill / Oblio), az app saját számlájából ez az XML letölthető
//  (Admin → Pénzügyek → Számlák, vagy az Irattár), és az ANAF SPV-ben
//  (spv.anaf.ro → e-Factura → Încărcare factură) feltölthető.
//
//  Az XML egy gépi adatfájl: megnyitva „kódnak” látszik – ez így helyes,
//  az ANAF pontosan ezt kéri. Olvasható (PDF) alakban az ANAF maga is
//  megmutatja: az „ANAF PDF” gomb ide küldi (ellenoriz / pdf alább).
//
//  Az eladó adatai: Admin → Rendszer → Webhely adatai (név, adószám, cím,
//  cégjegyzékszám) + Pénzügyek → Számlázás (település, megye kód, pl. RO-CV).
//  A vevő: a számlára mentett adatok; magánszemélynél, ha a CNP nem
//  ismert, 13 db 0 (az ANAF szabálya szerint).
//
//  Ellenőrzés: az ANAF nyilvános, belépés nélküli szolgáltatása
//  (webservicesp.anaf.ro/prod/FCTEL/rest/validare/FACT1) – ugyanazokat a
//  szabályokat futtatja, mint a feltöltéskor.
// ============================================================

const pu = require("./penzugy");
const oldalAdatok = require("./oldalAdatok");
const db = require("../db/database");

const ANAF_ALAP = process.env.ANAF_EFACTURA_URL || "https://webservicesp.anaf.ro/prod/FCTEL/rest";

function x(s) {
    return String(s ?? "")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

const kerek = v => Math.round((Number(v) || 0) * 100) / 100;
const ket = v => kerek(v).toFixed(2);
// Mennyiség: legfeljebb 2 tizedes, felesleges nullák nélkül
const menny = v => String(kerek(v));
const vag = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// Fizetési mód → UNTDID 4461 kód
const FIZ_KOD = { kartya: "48", online: "48", atutalas: "42", keszpenz: "10", egyeb: "ZZZ" };

// Megyék (ISO 3166-2:RO) – a névből / rövidítésből a kód
const MEGYE = {
    AB: "Alba", AR: "Arad", AG: "Argeș", BC: "Bacău", BH: "Bihor", BN: "Bistrița-Năsăud", BT: "Botoșani", BV: "Brașov", BR: "Brăila",
    B: "București", BZ: "Buzău", CS: "Caraș-Severin", CL: "Călărași", CJ: "Cluj", CT: "Constanța", CV: "Covasna", DB: "Dâmbovița", DJ: "Dolj",
    GL: "Galați", GR: "Giurgiu", GJ: "Gorj", HR: "Harghita", HD: "Hunedoara", IL: "Ialomița", IS: "Iași", IF: "Ilfov", MM: "Maramureș",
    MH: "Mehedinți", MS: "Mureș", NT: "Neamț", OT: "Olt", PH: "Prahova", SM: "Satu Mare", SJ: "Sălaj", SB: "Sibiu", SV: "Suceava",
    TR: "Teleorman", TM: "Timiș", TL: "Tulcea", VS: "Vaslui", VL: "Vâlcea", VN: "Vrancea"
};
const ekezetNelkul = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

// "RO-CV", "CV", "Covasna", "jud. Covasna", "Kovászna" → "RO-CV" (vagy "")
function megyeKod(v) {
    const s = String(v || "").trim();
    if (!s) return "";
    const m = s.toUpperCase().match(/^(?:RO-)?([A-Z]{1,2})$/);
    if (m && MEGYE[m[1]]) return "RO-" + m[1];
    const n = ekezetNelkul(s.replace(/^(jud(et)?(ul)?\.?|megye)\s*/i, ""));
    if (n.includes("bucuresti") || n.includes("bukarest")) return "RO-B";
    if (n.includes("kovaszna")) return "RO-CV";
    if (n.includes("hargita")) return "RO-HR";
    if (n.includes("maros")) return "RO-MS";
    if (n.includes("kolozs")) return "RO-CJ";
    if (n.includes("brasso")) return "RO-BV";
    if (n.includes("bihar")) return "RO-BH";
    for (const [k, nev] of Object.entries(MEGYE)) if (n === ekezetNelkul(nev)) return "RO-" + k;
    return "";
}

// Bukarestben a település a kerület: SECTOR1..SECTOR6 (BR-RO-100)
function bukarestSzektor(...szovegek) {
    for (const s of szovegek) {
        const m = String(s || "").match(/sector(?:ul)?\s*([1-6])\b/i);
        if (m) return "SECTOR" + m[1];
    }
    return "";
}

// Cím szétbontása: "Str. X 5, Sfântu Gheorghe, Covasna" → utca + település
function cimBont(cim, alapVaros) {
    const r = String(cim || "").split(",").map(t => t.trim()).filter(Boolean);
    if (r.length >= 2) return { utca: r.slice(0, -1).join(", "), varos: r[r.length - 1] };
    return { utca: r[0] || "", varos: alapVaros || "" };
}

function adoszam(cui) {
    return String(cui || "").toUpperCase().replace(/\s/g, "").replace(/^RO/, "");
}

const ORSZAG_RE = /^[A-Z]{2}$/;

// A két fél címe, ahogy az XML kéri
function cimAdat({ cim, varos, megye, orszag }) {
    const o = ORSZAG_RE.test(String(orszag || "").toUpperCase()) ? String(orszag).toUpperCase() : "RO";
    const c = cimBont(cim, varos);
    let telepules = vag(varos || c.varos, 50);
    let utca = vag(c.utca && c.utca !== telepules ? c.utca : cim, 150);
    let mk = o === "RO" ? megyeKod(megye) : "";
    if (o === "RO" && mk === "RO-B") {
        const sz = bukarestSzektor(varos, cim);
        if (sz) telepules = sz;
    }
    return { utca, varos: telepules, megye: mk, orszag: o };
}

function fel(tag, p) {
    // p: { nev, cui, afa, regcom, cim:{utca,varos,megye,orszag}, email, telefon, azonosito }
    return `
  <cac:${tag}>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${x(p.cim.utca)}</cbc:StreetName>
        <cbc:CityName>${x(p.cim.varos)}</cbc:CityName>
        ${p.cim.megye ? `<cbc:CountrySubentity>${x(p.cim.megye)}</cbc:CountrySubentity>` : ""}
        <cac:Country><cbc:IdentificationCode>${x(p.cim.orszag)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${p.afa && p.cui ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>${x((p.cim.orszag === "GR" ? "EL" : p.cim.orszag) + p.cui)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ""}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${x(vag(p.nev, 200))}</cbc:RegistrationName>
        <cbc:CompanyID>${x(p.azonosito)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
      ${p.email || p.telefon ? `<cac:Contact>
        ${p.telefon ? `<cbc:Telephone>${x(vag(p.telefon, 40))}</cbc:Telephone>` : ""}
        ${p.email ? `<cbc:ElectronicMail>${x(vag(p.email, 100))}</cbc:ElectronicMail>` : ""}
      </cac:Contact>` : ""}
    </cac:Party>
  </cac:${tag}>`;
}

// ---------- adatok összeállítása ----------

async function adatok(s) {
    const u = await oldalAdatok.nyilvanos();
    const be = await pu.beallitas();
    const v = s.vevo || {};
    const afa = !!be.afa_fizeto;

    const eladoCui = adoszam(u.adoszam);
    const elado = {
        nev: u.nev, cui: eladoCui, afa,
        cim: cimAdat({ cim: cimBont(u.cim, be.efactura_varos).utca || u.cim, varos: be.efactura_varos, megye: be.efactura_megye, orszag: "RO" }),
        email: u.email, telefon: u.telefon,
        // BT-30: ÁFA-alanynál a cégjegyzékszám, különben az adószám
        azonosito: afa ? (u.cegjegyzekszam || eladoCui) : eladoCui
    };

    const vevoCui = adoszam(v.cui);
    const vevoOrszag = ORSZAG_RE.test(String(v.orszag || "").toUpperCase()) ? String(v.orszag).toUpperCase() : "RO";
    const vevo = {
        nev: v.nev || s.ugyfel_nev || "Client", cui: vevoCui, afa: !!v.afa && !!vevoCui,
        cim: cimAdat({ cim: v.cim, varos: v.varos, megye: v.megye, orszag: vevoOrszag }),
        email: v.email, telefon: v.telefon,
        // magánszemély CNP nélkül: 13 db nulla
        azonosito: vevoCui || (vevoOrszag === "RO" ? "0000000000000" : "-")
    };

    return { u, be, afa, elado, vevo };
}

// Hiányzó adatok, amik nélkül az ANAF elutasítja – kód + magyarázat
async function hianyok(s) {
    const h = [];
    if (!s || s.tipus !== "szamla") { h.push("not_invoice"); return h; }
    if (s.statusz === "piszkozat") h.push("draft");
    const { u, be, elado, vevo } = await adatok(s);
    if (!u.nev) h.push("seller_name");
    if (!elado.cui) h.push("seller_cui");
    if (!u.cim) h.push("seller_address");
    if (!be.efactura_varos) h.push("seller_city");
    if (!/^RO-[A-Z]{1,2}$/.test(be.efactura_megye || "")) h.push("seller_county");
    if (elado.cim.megye === "RO-B" && !/^SECTOR[1-6]$/.test(elado.cim.varos)) h.push("seller_sector");
    if (!vevo.nev || vevo.nev === "Client") h.push("buyer_name");
    if (!vevo.cim.utca) h.push("buyer_address");
    if (!vevo.cim.varos) h.push("buyer_city");
    if (vevo.cim.orszag === "RO" && !vevo.cim.megye) h.push("buyer_county");
    if (vevo.cim.megye === "RO-B" && !/^SECTOR[1-6]$/.test(vevo.cim.varos)) h.push("buyer_sector");
    if (!(s.tetelek || []).length) h.push("no_items");
    return h;
}

// Magyar magyarázat a hiányokhoz (az admin felületnek és az eszközsávnak)
const HIANY_SZOVEG = {
    not_invoice: "Ez díjbekérő – e-Factura XML csak számlához készül.",
    draft: "A számla még piszkozat – előbb állítsd ki.",
    seller_name: "Az üzemeltető neve (Admin → Rendszer → Webhely adatai)",
    seller_cui: "Az üzemeltető adószáma / CUI (Webhely adatai)",
    seller_address: "Az üzemeltető címe (Webhely adatai)",
    seller_city: "Az e-Factura település (Pénzügyek → Beállítások → e-Factura)",
    seller_county: "Az e-Factura megye (Pénzügyek → Beállítások → e-Factura)",
    seller_sector: "Bukarestben a település helyett a kerület kell (pl. „Sector 3” a címben)",
    buyer_name: "A vevő neve",
    buyer_address: "A vevő címe (utca, házszám)",
    buyer_city: "A vevő települése (az ügyfél adatainál)",
    buyer_county: "A vevő megyéje (az ügyfél adatainál)",
    buyer_sector: "Bukaresti vevőnél a kerület (pl. „Sector 3” a címben)",
    no_items: "A számlán nincs tétel"
};

// ---------- az XML ----------

async function xml(s) {

    const { be, afa, elado, vevo } = await adatok(s);
    const penz = s.penznem || "RON";
    const tetelek = s.tetelek || [];

    // A tételek (a sorösszeg = menny. × egységár, két tizedesre – mint a számlán)
    const sorok = tetelek.map(t => {
        const kulcs = afa ? Number(t.afa_kulcs || 0) : -1;
        const netto = kerek(Number(t.netto ?? (Number(t.mennyiseg || 1) * Number(t.egysegar || 0))));
        return { t, kulcs, netto, menny: Number(t.mennyiseg || 1), ar: Math.abs(Number(t.egysegar || 0)) };
    });

    // ÁFA-csoportok – az adó a csoport alapjából számolva (BR-CO-17, BR-S-09)
    const csoport = {};
    sorok.forEach(r => {
        csoport[r.kulcs] = csoport[r.kulcs] || { alap: 0 };
        csoport[r.kulcs].alap = kerek(csoport[r.kulcs].alap + r.netto);
    });
    Object.entries(csoport).forEach(([k, c]) => { c.ado = Number(k) > 0 ? kerek(c.alap * Number(k) / 100) : 0; });

    const netto = kerek(sorok.reduce((a, r) => a + r.netto, 0));
    const adoOssz = kerek(Object.values(csoport).reduce((a, c) => a + c.ado, 0));
    const brutto = kerek(netto + adoOssz);

    const kat = k => k < 0 ? "O" : k === 0 ? "Z" : "S";
    const katXml = (k, tag) => `<cac:${tag}>
          <cbc:ID>${kat(k)}</cbc:ID>
          ${k >= 0 ? `<cbc:Percent>${ket(k)}</cbc:Percent>` : ""}
          ${tag === "TaxCategory" && k < 0 ? `<cbc:TaxExemptionReasonCode>VATEX-EU-O</cbc:TaxExemptionReasonCode>` : ""}
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:${tag}>`;

    // Ha nem lejben van: az ÁFA összegét lejben is meg kell adni (BR-53)
    const arf = Number(s.arfolyam) || Number(be.eur_arfolyam) || 5;
    const lejben = penz !== "RON" ? `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RON">${ket(adoOssz * arf)}</cbc:TaxAmount>
  </cac:TaxTotal>` : "";

    // Sztornó számla: hivatkozás az eredetire
    let eredeti = null;
    if (s.sztorno_eredeti_id) {
        const r = await db.query("SELECT sorszam, kiallitva FROM penzugy_szamlak WHERE id = $1", [s.sztorno_eredeti_id]);
        eredeti = r.rows[0] || null;
    }

    // Megjegyzések (BT-22): legfeljebb 300 karakter darabonként
    const megjegyzesek = [];
    if (!afa) megjegyzesek.push(be.tva_mentes_szoveg || "Furnizor neplătitor de TVA – regim special de scutire pentru întreprinderile mici (art. 310 Cod fiscal).");
    const sajat = String(s.megjegyzes || "").split("\n").map(t => t.trim())
        .filter(t => t && !/^(Díjbekérő \/ Proforma|Számla \/ Factură|Sztornó \/ Stornare):/.test(t)).join(" ");
    if (sajat) megjegyzesek.push(sajat);

    const fizKod = FIZ_KOD[s.fizetesi_mod] || "42";
    const iban = be.iban && ["42", "30", "58"].includes(fizKod) ? be.iban : "";
    // kifizetett számlán a fizetendő 0 (az előre fizetett összeg = a végösszeg)
    const vegso = s.statusz === "fizetve" && brutto > 0 ? 0 : brutto;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>
  <cbc:ID>${x(s.sorszam)}</cbc:ID>
  <cbc:IssueDate>${x(pu.pgDatum(s.kiallitva))}</cbc:IssueDate>
  ${s.esedekes ? `<cbc:DueDate>${x(pu.pgDatum(s.esedekes))}</cbc:DueDate>` : ""}
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  ${megjegyzesek.slice(0, 20).map(n => `<cbc:Note>${x(vag(n, 300))}</cbc:Note>`).join("\n  ")}
  <cbc:DocumentCurrencyCode>${x(penz)}</cbc:DocumentCurrencyCode>
  ${penz !== "RON" ? `<cbc:TaxCurrencyCode>RON</cbc:TaxCurrencyCode>` : ""}
  ${s.idoszak_tol ? `<cac:InvoicePeriod>
    <cbc:StartDate>${x(pu.pgDatum(s.idoszak_tol))}</cbc:StartDate>
    <cbc:EndDate>${x(pu.pgDatum(s.idoszak_ig || s.idoszak_tol))}</cbc:EndDate>
  </cac:InvoicePeriod>` : ""}
  ${eredeti ? `<cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${x(eredeti.sorszam)}</cbc:ID>
      <cbc:IssueDate>${x(pu.pgDatum(eredeti.kiallitva))}</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>` : ""}
  ${fel("AccountingSupplierParty", elado)}
  ${fel("AccountingCustomerParty", vevo)}
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${fizKod}</cbc:PaymentMeansCode>
    <cbc:PaymentID>${x(s.sorszam)}</cbc:PaymentID>
    ${iban ? `<cac:PayeeFinancialAccount><cbc:ID>${x(iban)}</cbc:ID>${be.kedvezmenyezett ? `<cbc:Name>${x(vag(be.kedvezmenyezett, 100))}</cbc:Name>` : ""}</cac:PayeeFinancialAccount>` : ""}
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
    ${vegso !== brutto ? `<cbc:PrepaidAmount currencyID="${x(penz)}">${ket(brutto)}</cbc:PrepaidAmount>` : ""}
    <cbc:PayableAmount currencyID="${x(penz)}">${ket(vegso)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${sorok.map((r, i) => `<cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="H87">${menny(r.menny)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${x(penz)}">${ket(r.netto)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${x(vag(r.t.megnevezes_ro || r.t.megnevezes, 100))}</cbc:Name>
      ${katXml(r.kulcs, "ClassifiedTaxCategory")}
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${x(penz)}">${ket(r.ar)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`).join("\n  ")}
</Invoice>
`;
}

// ---------- ANAF: ellenőrzés és PDF (nyilvános, belépés nélkül) ----------

async function anafKeres(ut, xmlSzoveg, valasz = "json") {
    const res = await fetch(`${ANAF_ALAP}/${ut}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: xmlSzoveg,
        signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) throw Object.assign(new Error("ANAF HTTP " + res.status), { kod: "anaf_unavailable" });
    if (valasz === "pdf") {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.slice(0, 4).toString() === "%PDF") return { pdf: buf };
        // hibánál JSON jön (vagy a tűzfal HTML-oldala)
        let j = null;
        try { j = JSON.parse(buf.toString("utf8")); } catch (e) { /* nem JSON */ }
        return { hiba: j, nyers: j ? null : buf.toString("utf8").slice(0, 300) };
    }
    const szoveg = await res.text();
    try { return JSON.parse(szoveg); } catch (e) { throw Object.assign(new Error("ANAF: nem JSON válasz"), { kod: "anaf_unavailable" }); }
}

// → { stare: "ok" | "nok", hibak: [..] }
async function ellenoriz(s) {
    const v = await anafKeres("validare/FACT1", await xml(s));
    const hibak = (v.Messages || v.messages || []).map(m => String(m.message || m.Message || JSON.stringify(m)));
    return { stare: v.stare === "ok" ? "ok" : "nok", hibak, trace_id: v.trace_id || null };
}

// Az ANAF saját, olvasható PDF-e az XML-ből
async function pdf(s) {
    const v = await anafKeres("transformare/FACT1", await xml(s), "pdf");
    if (v.pdf) return { pdf: v.pdf };
    const hibak = v.hiba ? (v.hiba.Messages || v.hiba.messages || []).map(m => String(m.message || JSON.stringify(m))) : [];
    return { hibak: hibak.length ? hibak : [v.nyers ? "Az ANAF most nem adott PDF-et – próbáld később." : "ANAF"] };
}

module.exports = { xml, hianyok, HIANY_SZOVEG, ellenoriz, pdf, megyeKod, cimAdat };
