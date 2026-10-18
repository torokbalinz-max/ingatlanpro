// ============================================================
//  Számla / díjbekérő PDF-ben (a vevőnek e-mailben csatolva)
//
//  Ugyanaz a tartalom, mint a nyomtatható bizonylaton (services/bizonylat.js –
//  Legea 227/2015 art. 319 kötelező adatai): román hivatalos szöveg, kérésre
//  magyar / angol fordítással. Fejléc: a cég logója (Admin → Webhely adatai →
//  Logó), ha nincs, a cég neve.
//
//  pdfkit + DejaVu Sans betűtípus (server/assets/fonts) – ebben megvannak a
//  román (ș ț ă î â) és a magyar (ő ű) ékezetes betűk is.
// ============================================================

const path = require("path");
const { T, TVA_MENTES_ALAP, penz, nap } = require("./bizonylat");

const BETU = path.join(__dirname, "..", "assets", "fonts");
const ZOLD = "#1f6f5c";
const SZURKE = "#5b6660";
const VONAL = "#dfe3df";

const FIZ_MOD = {
    atutalas: { ro: "transfer bancar", hu: "átutalás", en: "bank transfer" },
    kartya: { ro: "card bancar", hu: "bankkártya", en: "card" },
    online: { ro: "card bancar (online)", hu: "online kártyás fizetés", en: "online card payment" },
    keszpenz: { ro: "numerar", hu: "készpénz", en: "cash" },
    egyeb: { ro: "altă modalitate", hu: "egyéb", en: "other" }
};
const TVA_MENTES_FORD = {
    hu: "Nem ÁFA-alany szolgáltató – kisvállalkozói alanyi mentesség (Codul fiscal, art. 310).",
    en: "Supplier not registered for VAT – small enterprise exemption scheme (Romanian Fiscal Code, art. 310)."
};

const szamStr = v => String(Number(v) || 0).replace(".", ",");

function vevoCim(v) {
    return [v.cim, v.varos && !String(v.cim || "").includes(v.varos) ? v.varos : "", v.megye ? v.megye.replace(/^RO-/, "jud. ") : "",
        v.orszag && v.orszag !== "RO" ? v.orszag : ""].filter(Boolean).join(", ");
}

// s: a bizonylat (penzugy.szamla()), u: üzemeltető, b: pénzügyi beállítások
// o: { ford, logo (Buffer PNG), eredeti, sztornoja, dijbekero }  →  Promise<Buffer>
function pdf(s, u, b, o = {}) {

    const PDFDocument = require("pdfkit");
    const ford = o.ford || "";

    return new Promise((resolve, reject) => {

        const doc = new PDFDocument({
            size: "A4",
            bufferPages: true,
            margins: { top: 40, bottom: 46, left: 42, right: 42 },
            info: { Title: `${s.tipus === "szamla" ? "Factura" : "Proforma"} ${s.sorszam}`, Author: u.nev || "IngatlanPro", Creator: "IngatlanPro" }
        });
        const darabok = [];
        doc.on("data", d => darabok.push(d));
        doc.on("end", () => resolve(Buffer.concat(darabok)));
        doc.on("error", reject);

        doc.registerFont("R", path.join(BETU, "DejaVuSans.ttf"));
        doc.registerFont("B", path.join(BETU, "DejaVuSans-Bold.ttf"));

        const L = k => {
            const t = T[k];
            if (!t) return k;
            return ford && t[ford] && t[ford] !== t.ro ? `${t.ro} / ${t[ford]}` : t.ro;
        };
        const LF = (t) => ford && t[ford] && t[ford] !== t.ro ? `${t.ro} / ${t[ford]}` : t.ro;

        const X0 = doc.page.margins.left;
        const SZ = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const ALJ = () => doc.page.height - doc.page.margins.bottom;

        const v = s.vevo || {};
        const proforma = s.tipus !== "szamla";
        const storno = !proforma && (!!s.sztorno_eredeti_id || Number(s.brutto) < 0);
        const cimKulcs = proforma ? "proforma" : storno ? "storno" : "factura";
        const tetelek = s.tetelek || [];
        const afaAlany = !!b.afa_fizeto;
        const afaOszlop = afaAlany || tetelek.some(t => Number(t.afa_kulcs) > 0);
        const penznem = s.penznem || "RON";
        const arf = Number(s.arfolyam) || Number(b.eur_arfolyam) || 0;

        // ---------- fejléc ----------
        let y = doc.page.margins.top;
        const jobbSz = 250;
        const balSz = SZ - jobbSz - 16;

        let balAlja = y;
        if (o.logo) {
            try {
                doc.image(o.logo, X0, y, { fit: [Math.min(balSz, 200), 64], align: "left", valign: "top" });
                balAlja = y + 66;
            } catch (e) { o.logo = null; }
        }
        if (!o.logo) {
            doc.font("B").fontSize(18).fillColor(ZOLD).text(u.nev || "IngatlanPro", X0, y, { width: balSz });
            balAlja = doc.y + 2;
        }

        doc.font("B").fontSize(16).fillColor("#1c2321").text(T[cimKulcs].ro, X0 + SZ - jobbSz, y, { width: jobbSz, align: "right" });
        if (ford && T[cimKulcs][ford]) doc.font("R").fontSize(9).fillColor(SZURKE).text(T[cimKulcs][ford], { width: jobbSz, align: "right" });
        doc.moveDown(0.4);
        const adatSor = (k, ertek, vastag) => {
            if (!ertek) return;
            const jx = X0 + SZ - jobbSz;
            const ertSz = 112;
            const yy = doc.y;
            doc.font("R").fontSize(8.5).fillColor(SZURKE).text(`${L(k)}:`, jx, yy, { width: jobbSz - ertSz - 6, align: "right" });
            const y1 = doc.y;
            doc.font(vastag ? "B" : "R").fontSize(9).fillColor("#1c2321").text(String(ertek), jx + jobbSz - ertSz, yy, { width: ertSz, align: "right" });
            doc.y = Math.max(y1, doc.y) + 1;
            doc.x = jx;
        };
        adatSor("seriaNr", s.sorszam, true);
        adatSor("dataEmiterii", nap(s.kiallitva), true);
        if (s.idoszak_tol) adatSor("perioada", `${nap(s.idoszak_tol)} – ${nap(s.idoszak_ig || s.idoszak_tol)}`);
        if (!storno && s.esedekes && s.statusz !== "fizetve") adatSor("termen", nap(s.esedekes), true);
        if (!proforma && s.efactura_index && ["feldolgozas", "ok", "kezi"].includes(s.efactura_allapot)) adatSor("efIndex", s.efactura_index);

        // fizetve / sztornó pecsét
        const belyeg = s.statusz === "sztorno" ? { t: L("anulat"), c: "#b42318" }
            : s.statusz === "fizetve" && !storno ? { t: `${L("achitat")} ${nap(s.fizetve)}`, c: ZOLD } : null;
        if (belyeg) {
            doc.moveDown(0.4);
            doc.font("B").fontSize(10);
            const w = doc.widthOfString(belyeg.t) + 16;
            const bx = X0 + SZ - w;
            const by = doc.y;
            doc.save().lineWidth(1.5).strokeColor(belyeg.c).roundedRect(bx, by, w, 18, 4).stroke().restore();
            doc.fillColor(belyeg.c).text(belyeg.t, bx, by + 4.5, { width: w, align: "center" });
        }

        y = Math.max(balAlja, doc.y) + 10;
        doc.save().moveTo(X0, y).lineTo(X0 + SZ, y).lineWidth(2.5).strokeColor(ZOLD).stroke().restore();
        y += 14;

        // ---------- szolgáltató / vevő ----------
        const dobozSz = (SZ - 14) / 2;
        const fel = (x, cim, nev, sorok) => {
            let yy = y + 8;
            doc.font("B").fontSize(8).fillColor(ZOLD).text(cim.toUpperCase(), x + 10, yy, { width: dobozSz - 20, characterSpacing: 0.4 });
            yy = doc.y + 2;
            doc.font("B").fontSize(11).fillColor("#1c2321").text(nev || "–", x + 10, yy, { width: dobozSz - 20 });
            yy = doc.y + 2;
            sorok.filter(r => r && r[1]).forEach(([c, e]) => {
                doc.font("R").fontSize(8.5).fillColor(SZURKE).text(c ? `${c}: ` : "", x + 10, yy, { width: dobozSz - 20, continued: !!c })
                    .fillColor("#1c2321").text(String(e));
                yy = doc.y + 1;
            });
            return yy + 6;
        };
        const cegVevo = v.tipus === "ceg" || v.tipus === "pfa" || v.reg_com;
        const fA = fel(X0, L("furnizor"), u.nev, [
            [L("cif"), u.adoszam], [L("regCom"), u.cegjegyzekszam], [L("sediu"), u.cim],
            [L("iban"), b.iban], [L("banca"), b.bank], [L("email"), u.email], [L("tel"), u.telefon],
            ["", afaAlany ? L("platitorTva") : L("neplatitorTva")]
        ]);
        const fB = fel(X0 + dobozSz + 14, L("cumparator"), v.nev || s.ugyfel_nev, [
            [L(cegVevo ? "cif" : "cifCnp"), v.cui ? (v.afa ? "RO" : "") + String(v.cui).replace(/^RO/i, "") : ""],
            [L("regCom"), v.reg_com], [L("adresa"), vevoCim(v)], [L("email"), v.email], [L("tel"), v.telefon]
        ]);
        const dobozMag = Math.max(fA, fB) - y;
        doc.save().lineWidth(0.8).strokeColor(VONAL)
            .roundedRect(X0, y, dobozSz, dobozMag, 6).stroke()
            .roundedRect(X0 + dobozSz + 14, y, dobozSz, dobozMag, 6).stroke().restore();
        y += dobozMag + 16;

        // ---------- tételek ----------
        const oszl = afaOszlop
            ? [["nr", 24, "c"], ["denumire", 0, "l"], ["um", 34, "c"], ["cant", 38, "r"], ["pretUnitar", 70, "r"], ["valoare", 70, "r"], ["cotaTva", 44, "r"], ["valoareTva", 62, "r"]]
            : [["nr", 26, "c"], ["denumire", 0, "l"], ["um", 40, "c"], ["cant", 46, "r"], ["pretUnitarSimplu", 84, "r"], ["valoare", 90, "r"]];
        const fix = oszl.reduce((a, c) => a + c[1], 0);
        oszl[1][1] = SZ - fix;
        const xk = [];
        oszl.reduce((x, c) => { xk.push(x); return x + c[1]; }, X0);
        const igazit = a => (a === "r" ? "right" : a === "c" ? "center" : "left");

        const fejlec = () => {
            doc.font("B").fontSize(7);
            const mag = Math.max(...oszl.map(c => doc.heightOfString(L(c[0]).toUpperCase(), { width: c[1] - 8 }))) + 10;
            doc.save().rect(X0, y, SZ, mag).fill("#f1f4f1").restore();
            oszl.forEach((c, i) => doc.font("B").fontSize(7).fillColor("#3f4944")
                .text(L(c[0]).toUpperCase(), xk[i] + 4, y + 5, { width: c[1] - 8, align: igazit(c[2]) }));
            y += mag;
            doc.save().moveTo(X0, y).lineTo(X0 + SZ, y).lineWidth(0.8).strokeColor("#cfd5cf").stroke().restore();
        };
        fejlec();

        tetelek.forEach((t, i) => {
            const ro = t.megnevezes_ro || t.megnevezes || "";
            let tr = "";
            if (ford === "hu" && t.megnevezes && t.megnevezes !== ro) tr = t.megnevezes;
            if (ford === "en" && t.megnevezes_en && t.megnevezes_en !== ro) tr = t.megnevezes_en;
            const ertekek = afaOszlop
                ? [`${i + 1}.`, null, T.buc.ro, szamStr(t.mennyiseg), penz(t.egysegar), penz(t.netto), `${szamStr(t.afa_kulcs)}%`, penz(t.afa)]
                : [`${i + 1}.`, null, T.buc.ro, szamStr(t.mennyiseg), penz(t.egysegar), penz(t.netto)];
            doc.font("R").fontSize(8.5);
            let mag = doc.heightOfString(ro, { width: oszl[1][1] - 8 });
            if (tr) { doc.fontSize(7.5); mag += doc.heightOfString(tr, { width: oszl[1][1] - 8 }) + 1; }
            mag += 10;
            if (y + mag > ALJ() - 20) { doc.addPage(); y = doc.page.margins.top; fejlec(); }
            ertekek.forEach((e, k) => {
                if (k === 1) {
                    doc.font("R").fontSize(8.5).fillColor("#1c2321").text(ro, xk[1] + 4, y + 5, { width: oszl[1][1] - 8 });
                    if (tr) doc.fontSize(7.5).fillColor(SZURKE).text(tr, { width: oszl[1][1] - 8 });
                } else {
                    doc.font("R").fontSize(8.5).fillColor("#1c2321").text(e, xk[k] + 4, y + 5, { width: oszl[k][1] - 8, align: igazit(oszl[k][2]) });
                }
            });
            y += mag;
            doc.save().moveTo(X0, y).lineTo(X0 + SZ, y).lineWidth(0.5).strokeColor("#e6e9e6").stroke().restore();
        });

        // ---------- végösszeg ----------
        y += 10;
        const ossSz = 320;
        const ossX = X0 + SZ - ossSz;
        const osszSor = (cim, ertek, fo) => {
            doc.font(fo ? "B" : "R").fontSize(fo ? 12 : 9.5).fillColor("#1c2321");
            const mag = Math.max(doc.heightOfString(cim, { width: ossSz - 110 }), 12);
            if (y + mag > ALJ()) { doc.addPage(); y = doc.page.margins.top; }
            doc.text(cim, ossX, y, { width: ossSz - 110 });
            doc.text(ertek, ossX + ossSz - 110, y, { width: 110, align: "right" });
            y += mag + 4;
        };
        if (afaOszlop) {
            osszSor(L("totalFaraTva"), penz(s.netto, penznem));
            osszSor(L("totalTva"), penz(s.afa, penznem));
            if (!proforma && penznem !== "RON" && arf > 0) {
                osszSor(`${L("tvaLei")} (${L("curs")} BNR ${szamStr(arf)})`, penz(Number(s.afa) * arf, "RON"));
            }
        }
        doc.save().moveTo(ossX, y).lineTo(X0 + SZ, y).lineWidth(1.5).strokeColor("#1c2321").stroke().restore();
        y += 6;
        osszSor(L("totalPlata"), penz(s.brutto, penznem), true);

        // ---------- szövegek ----------
        y += 8;
        const bekezdes = (szoveg, { szin = "#3f4944", meret = 8.5, vastag = false, cim } = {}) => {
            if (!szoveg) return;
            doc.font(vastag ? "B" : "R").fontSize(meret);
            const teljes = (cim ? cim + "\n" : "") + szoveg;
            const mag = doc.heightOfString(teljes, { width: SZ });
            if (y + mag > ALJ()) { doc.addPage(); y = doc.page.margins.top; }
            if (cim) {
                doc.font("B").fontSize(7.5).fillColor(SZURKE).text(cim.toUpperCase(), X0, y, { width: SZ, characterSpacing: 0.4 });
                y = doc.y + 1;
            }
            doc.font(vastag ? "B" : "R").fontSize(meret).fillColor(szin).text(szoveg, X0, y, { width: SZ });
            y = doc.y + 8;
        };

        if (!afaAlany) {
            bekezdes((b.tva_mentes_szoveg || TVA_MENTES_ALAP) + (ford && TVA_MENTES_FORD[ford] && !b.tva_mentes_szoveg ? "\n" + TVA_MENTES_FORD[ford] : ""));
        }

        if (s.statusz !== "fizetve" && s.statusz !== "sztorno" && !storno && Number(s.brutto) > 0 && b.iban) {
            bekezdes([
                `${L("plata")}: ${L("prinTransfer")} ${b.iban}${b.bank ? ` (${b.bank})` : ""}`,
                b.kedvezmenyezett ? `${L("beneficiar")}: ${b.kedvezmenyezett}` : "",
                `${L("detalii")}: ${s.sorszam} · ${L("termen")}: ${nap(s.esedekes)}`
            ].filter(Boolean).join("\n"), { szin: "#1c2321" });
        }

        const hiv = [];
        if (o.eredeti) hiv.push(`${L("stornare")} ${o.eredeti.sorszam} ${L("dinData")} ${nap(o.eredeti.kiallitva)}.`);
        if (o.sztornoja) hiv.push(`${L("stornataPrin")} ${o.sztornoja.sorszam} ${L("dinData")} ${nap(o.sztornoja.kiallitva)}.`);
        if (!proforma && o.dijbekero) hiv.push(`${L("proformaRef")}: ${o.dijbekero.sorszam}.`);
        if (!proforma && s.fizetesi_mod && FIZ_MOD[s.fizetesi_mod]) hiv.push(`${L("fizMod")}: ${LF(FIZ_MOD[s.fizetesi_mod])}.`);
        const megj = String(s.megjegyzes || "").split("\n").map(x => x.trim())
            .filter(x => x && !/^(Díjbekérő \/ Proforma|Számla \/ Factură|Sztornó \/ Stornare):/.test(x) && !/^TESZT|kártyás fizetés/i.test(x)).join("\n");
        const megjAll = [...hiv, megj, b.szamla_megjegyzes].filter(Boolean).join("\n");
        if (megjAll) bekezdes(megjAll, { cim: L("mentions") });

        // ---------- lábléc (minden oldalon) ----------
        const lab = LF(proforma ? T.proformaNota : T.faraSemnatura);
        const oldalak = doc.bufferedPageRange();
        for (let i = 0; i < oldalak.count; i++) {
            doc.switchToPage(oldalak.start + i);
            const ly = doc.page.height - doc.page.margins.bottom + 8;
            doc.save().moveTo(X0, ly - 4).lineTo(X0 + SZ, ly - 4).lineWidth(0.5).strokeColor(VONAL).stroke().restore();
            doc.font("R").fontSize(7).fillColor("#6a746f");
            const old = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            doc.text(lab, X0, ly, { width: SZ - 50 });
            doc.text(`${i + 1} / ${oldalak.count}`, X0 + SZ - 50, ly, { width: 50, align: "right" });
            doc.page.margins.bottom = old;
        }

        doc.end();

    });

}

module.exports = { pdf };
