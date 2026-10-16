// ============================================================
//  Megbízási (közvetítési) szerződés – HU / RO, nyomtatható HTML
//
//  Ugyanazt a szöveget látja az eladó (aláírás előtt és után), az
//  admin és a jogosult munkatárs. Online aláíráskor a szerződés
//  szövegének ujjlenyomata (SHA-256) is mentődik, így később igazolható,
//  hogy pontosan melyik változatot fogadta el az eladó.
//
//  Az aláírás nyomai a szerződés alján:
//    - az eladó online aláírása: időpont, IP-cím, e-mailben kapott kóddal
//      igazolva, a szöveg ujjlenyomata, korai kezdés kérése
//    - személyes aláírás: a szkennelt példány az iratok között
//    - az ellenjegyzés (a mi aláírásunk): ki, mikor
//
//  FONTOS: a szöveg tervezet – romániai ügyvéddel ellenőriztetendő.
// ============================================================

const crypto = require("crypto");
const oldalAdatok = require("./oldalAdatok");

function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const TIPUS_NEV = { lakas: "lakás / apartament", haz: "ház / casă", telek: "telek / teren", kereskedelmi: "üzlethelyiség / spațiu comercial", iroda: "iroda / birou" };

function pgDatum(v) {
    if (!v) return null;
    if (v instanceof Date) {
        const p = n => String(n).padStart(2, "0");
        return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    return String(v).slice(0, 10);
}

function nap(d) {
    if (!d) return "____________";
    return pgDatum(d).replace(/-/g, ".") + ".";
}

function ido(d) {
    try {
        return new Date(d).toLocaleString("hu-HU", { timeZone: "Europe/Bucharest" });
    } catch (e) {
        return String(d);
    }
}

// A szerződés szövege (az aláírások nélkül) – ennek az ujjlenyomatát mentjük
async function torzs(m, be, dij) {

    const u = await oldalAdatok.nyilvanos();
    const opciok = (Array.isArray(m.opciok) ? m.opciok : []).map(k => be.opciok.find(o => o.kod === k)).filter(Boolean);
    const kiado = m.ugylet === "kiado";
    const jut = dij.jutalek;
    const idotartam = m.idotartam_honap || be.idotartam_honap || 6;
    const p = (hu, ro) => `<p>${hu}</p><p class="ro">${ro}</p>`;
    const jogi = opciok.some(o => o.kod === "jogi");

    return `
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
  ${p("A Megbízott az érdeklődőket előszűri, a megtekintéseket időpontfoglalással szervezi és bonyolítja, a vételi ajánlatokat (a vevő finanszírozási adataival együtt) írásban továbbítja a Megbízónak. Az ajánlat elfogadásáról mindig a Megbízó dönt. A vételi ajánlat szándéknyilatkozat; a felek között kötelezettség az előszerződés aláírásával és a foglaló (arvună) megfizetésével jön létre.",
      "Intermediarul filtrează persoanele interesate, organizează și efectuează vizionările pe bază de programare și transmite în scris ofertele de cumpărare (împreună cu datele de finanțare ale cumpărătorului) către Client. Decizia de acceptare a unei oferte aparține întotdeauna Clientului. Oferta de cumpărare este o declarație de intenție; obligațiile între părți se nasc prin semnarea antecontractului și plata arvunei.")}
  ${jogi ? p("A Megbízó felhatalmazza a Megbízottat, hogy az adásvételhez szükséges iratokat (telekkönyvi kivonat, adóigazolás stb.) a nevében kikérje, és a közjegyzői időpontot egyeztesse. Az adásvételi szerződést kizárólag közjegyző foglalhatja okiratba.",
      "Clientul împuternicește Intermediarul să solicite în numele său documentele necesare vânzării (extras CF, certificat fiscal etc.) și să programeze notarul. Contractul de vânzare-cumpărare se încheie exclusiv în formă autentică, la notar.") : ""}

  <h2>3. Díjazás / Remunerația</h2>
  ${p(`A Megbízottat az ügylet létrejötte esetén <b>sikerdíj</b> illeti meg: a végleges ${kiado ? "éves bérleti díj" : "vételár"} <b>${esc(jut)}%-a</b>${be.minimum_dij ? `, de legalább <b>${esc(be.minimum_dij)} ${esc(dij.penznem)}</b>` : ""}${dij.fix ? `, valamint <b>${esc(dij.fix)} ${esc(dij.penznem)}</b> megbízási díj` : ""}. A sikerdíj az adásvételi (bérleti) szerződés aláírásakor esedékes.${opciok.some(o => o.ar > 0) ? " A külön díjas szolgáltatások díja a teljesítéskor esedékes, akkor is, ha az ügylet nem jön létre." : ""}`,
      `Intermediarul are dreptul la un <b>comision de succes</b> de <b>${esc(jut)}%</b> din ${kiado ? "chiria anuală" : "prețul final de vânzare"}${be.minimum_dij ? `, dar nu mai puțin de <b>${esc(be.minimum_dij)} ${esc(dij.penznem)}</b>` : ""}${dij.fix ? `, plus o taxă de mandat de <b>${esc(dij.fix)} ${esc(dij.penznem)}</b>` : ""}. Comisionul este exigibil la semnarea contractului de vânzare-cumpărare (închiriere).${opciok.some(o => o.ar > 0) ? " Serviciile cu tarif separat se plătesc la prestare, chiar dacă tranzacția nu se încheie." : ""}`)}
  ${p("A sikerdíj akkor is jár, ha a Megbízó a Megbízott által bemutatott vevővel a szerződés megszűnésétől számított 6 hónapon belül köt szerződést.",
      "Comisionul se datorează și dacă Clientul încheie tranzacția cu un cumpărător prezentat de Intermediar în termen de 6 luni de la încetarea contractului.")}

  <h2>4. Időtartam${m.kizarolagos ? ", kizárólagosság" : ""} / Durata${m.kizarolagos ? ", exclusivitate" : ""}</h2>
  ${p(`A szerződés <b>${esc(idotartam)} hónapra</b> szól, és bármelyik fél 15 napos írásbeli felmondással megszüntetheti.${m.kizarolagos ? " A szerződés idején a Megbízó más közvetítőt nem bíz meg; ha mégis más közvetítő révén ad el, a sikerdíj a Megbízottat illeti." : " A megbízás nem kizárólagos: a Megbízó maga is, illetve más közvetítő útján is értékesíthet."}`,
      `Contractul se încheie pe <b>${esc(idotartam)} luni</b> și poate fi denunțat de oricare parte cu o notificare scrisă de 15 zile.${m.kizarolagos ? " Pe durata contractului, Clientul nu va mandata alt intermediar; în caz contrar, comisionul se datorează Intermediarului." : " Mandatul nu este exclusiv: Clientul poate vinde și singur sau prin alt intermediar."}`)}

  <h2>5. Elállási jog / Dreptul de retragere</h2>
  ${p("Ha a szerződést a Megbízó online vagy az üzlethelyiségen kívül köti, a szerződéskötéstől számított 14 napon belül indoklás nélkül elállhat (OUG 34/2014). Ha a Megbízó kifejezetten kéri, hogy a Megbízott a munkát (fotózás, hirdetés) az elállási határidő lejárta előtt megkezdje, elállás esetén az addig teljesített szolgáltatások arányos díját meg kell fizetnie.",
      "Dacă contractul este încheiat online sau în afara spațiilor comerciale, Clientul se poate retrage fără justificare în termen de 14 zile de la încheiere (OUG 34/2014). Dacă Clientul solicită expres începerea serviciilor (fotografiere, publicare) înainte de expirarea termenului, în caz de retragere va plăti contravaloarea proporțională a serviciilor prestate până atunci.")}

  <h2>6. A Megbízó kötelezettségei / Obligațiile Clientului</h2>
  ${p("A Megbízó szavatolja, hogy jogosult az ingatlan feletti rendelkezésre, átadja a szükséges iratokat (telekkönyv-kivonat, energetikai tanúsítvány stb.), lehetővé teszi a fotózást és a megtekintéseket, és tájékoztatja a Megbízottat, ha az ingatlant más módon eladta.",
      "Clientul garantează că are dreptul de a dispune de imobil, pune la dispoziție documentele necesare (extras CF, certificat energetic etc.), permite fotografierea și vizionările și informează Intermediarul dacă a vândut imobilul pe altă cale.")}
  ${p("A Megbízott a pénzmosás megelőzéséről szóló jogszabályok (Legea 129/2019) szerint az ügyfeleit azonosítja; ehhez a Megbízó a személyazonosító iratát bemutatja.",
      "Intermediarul identifică clienții conform legislației privind prevenirea spălării banilor (Legea 129/2019); în acest scop Clientul prezintă actul de identitate.")}

  <h2>7. Adatvédelem / Protecția datelor</h2>
  ${p("A felek személyes adatait a Megbízott kizárólag a szerződés teljesítéséhez kezeli, az IngatlanPro adatvédelmi tájékoztatója és a GDPR szerint. A vevők finanszírozási adatait a Megbízó csak az ajánlat elbírálásához kapja meg.",
      "Intermediarul prelucrează datele personale ale părților exclusiv pentru executarea contractului, conform politicii de confidențialitate IngatlanPro și GDPR. Datele de finanțare ale cumpărătorilor sunt comunicate Clientului doar pentru evaluarea ofertei.")}

  <h2>8. Elektronikus aláírás, egyéb / Semnătura electronică, dispoziții finale</h2>
  ${p("A felek elfogadják, hogy a szerződést az IngatlanPro felületén, a Megbízó fiókjában, e-mailben kapott egyszeri kóddal is aláírhatják; ez egyszerű elektronikus aláírásnak minősül (910/2014/EU rendelet – eIDAS, Legea 455/2001). A szerződésre a román jog, különösen a Polgári Törvénykönyv közvetítési szerződésre vonatkozó rendelkezései irányadók.",
      "Părțile acceptă ca contractul să fie semnat și pe platforma IngatlanPro, în contul Clientului, cu un cod unic primit pe e-mail; aceasta constituie semnătură electronică simplă (Regulamentul UE 910/2014 – eIDAS, Legea 455/2001). Contractul este guvernat de legea română, în special de dispozițiile Codului civil privind contractul de intermediere.")}
  ${be.szerzodes_megjegyzes ? `<p style="white-space:pre-line">${esc(be.szerzodes_megjegyzes)}</p>` : ""}`;

}

function ujjlenyomat(html) {
    return crypto.createHash("sha256").update(String(html).replace(/\s+/g, " ").trim()).digest("hex");
}

// A teljes oldal: a szöveg + az aláírások nyomai + nyomtatás gomb
async function html(m, be, dij, extra = {}) {

    const u = await oldalAdatok.nyilvanos();
    const szoveg = await torzs(m, be, dij);
    const hash = ujjlenyomat(szoveg);
    const valtozott = m.szerzodes_hash && m.szerzodes_hash !== hash;

    const alairas = [];
    if (m.szerzodes_elfogadva) {
        alairas.push(`<div class="elfogadva">
            <b>Az eladó online aláírta / Semnat online de client:</b> ${esc(ido(m.szerzodes_elfogadva))}
            ${m.szerzodes_elfogadva_ip ? ` · IP: ${esc(m.szerzodes_elfogadva_ip)}` : ""}
            ${m.szerzodes_kod_ok ? " · e-mailben kapott kóddal igazolva / confirmat cu cod primit pe e-mail" : ""}
            ${m.korai_kezdes ? "<br>A Megbízó kérte a munka megkezdését az elállási határidő előtt. / Clientul a solicitat începerea serviciilor înainte de expirarea termenului de retragere." : ""}
            ${m.szerzodes_hash ? `<br><span class="hash">Ujjlenyomat / Amprentă (SHA-256): ${esc(m.szerzodes_hash)}</span>` : ""}
        </div>`);
    }
    if (m.szerzodes_mod === "szemelyes" && m.alairva) {
        alairas.push(`<div class="elfogadva">Személyesen aláírva / Semnat în persoană: <b>${esc(nap(m.alairva))}</b> – a szkennelt példány az iratok között / exemplarul scanat se află la documente.</div>`);
    }
    if (m.ellenjegyezve) {
        alairas.push(`<div class="elfogadva">Ellenjegyezve / Contrasemnat: <b>${esc(ido(m.ellenjegyezve))}</b>${extra.ellenjegyzo ? ` – ${esc(extra.ellenjegyzo)}` : ""} (${esc(u.nev || "IngatlanPro")})</div>`);
    }

    const allapot = m.ellenjegyezve || (m.szerzodes_mod === "szemelyes" && m.alairva)
        ? `<div class="hatalyos">HATÁLYOS / ÎN VIGOARE</div>`
        : `<div class="tervezet"><b>TERVEZET / PROIECT.</b> Ezt a szerződést aláírás előtt romániai ügyvéddel ellenőriztesd (közvetítői tevékenység, fogyasztóvédelem, GDPR). · Acest contract trebuie verificat de un avocat înainte de semnare.</div>`;

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
  .hatalyos { font-family: Arial, sans-serif; display: inline-block; border: 2px solid #1f6f5c; color: #1f6f5c; border-radius: 6px; padding: 4px 12px; font-weight: bold; letter-spacing: .06em; margin-bottom: 18px; }
  .valtozott { font-family: Arial, sans-serif; background: #fdecea; border: 1px solid #f1aeb5; color: #842029; border-radius: 8px; padding: 8px 12px; font-size: 12.5px; margin-bottom: 18px; }
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
  .elfogadva { margin-top: 14px; font-family: Arial, sans-serif; font-size: 12.5px; background: #e8f4ef; border: 1px solid #9fd0bd; color: #14523f; border-radius: 8px; padding: 8px 12px; }
  .hash { font-family: monospace; font-size: 11px; word-break: break-all; }
  .eszkoz { text-align: center; margin: 16px 0 32px; font-family: Arial, sans-serif; }
  .eszkoz button { font-size: 15px; padding: 9px 18px; border-radius: 8px; border: 0; background: #1f6f5c; color: #fff; cursor: pointer; }
  @media print { body { background: #fff; } .lap { box-shadow: none; margin: 0; max-width: none; padding: 0; } .eszkoz { display: none; } }
  @media (max-width: 640px) { .lap { padding: 20px 16px; margin: 0; border-radius: 0; } .felek, .alair { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="lap">
  ${allapot}
  ${valtozott ? `<div class="valtozott">Az aláírás óta a szerződés adatai módosultak – az aláírt változat ujjlenyomata eltér. / Datele contractului au fost modificate după semnare.</div>` : ""}
  ${szoveg}
  ${alairas.join("")}
  <div class="alair">
    <div>Megbízott / Intermediar<br><br>${esc(u.nev || "IngatlanPro")}</div>
    <div>Megbízó / Client<br><br>${esc(m.nev || "")}</div>
  </div>
</div>
<div class="eszkoz"><button type="button" onclick="window.print()">Nyomtatás / PDF</button></div>
</body>
</html>`;

}

module.exports = { torzs, html, ujjlenyomat, esc };
