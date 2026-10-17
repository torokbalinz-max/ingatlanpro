// ============================================================
//  Ingatlanközvetítési szerződés (Contract de intermediere imobiliară)
//
//  A hivatalos szöveg ROMÁN (Romániában ez az irányadó); kérésre alatta
//  magyar vagy angol fordítás (?ford=hu | ?ford=en). Ugyanazt a szöveget
//  látja az eladó (aláírás előtt és után), az admin és a jogosult munkatárs.
//
//  Online aláíráskor a román szöveg ujjlenyomata (SHA-256) mentődik, így
//  később igazolható, pontosan melyik változatot fogadta el az eladó. A
//  2026. októberi átírás előtt aláírt szerződések a régi (HU/RO) szöveggel
//  jelennek meg – azt írták alá (torzsV1).
//
//  Az aláírás nyomai a szerződés alján:
//    - az eladó online aláírása: időpont, IP-cím, e-mailben kapott kóddal
//      igazolva, a szöveg ujjlenyomata, korai kezdés kérése
//    - személyes aláírás: a szkennelt példány az iratok között
//    - az ellenjegyzés (a mi aláírásunk): ki, mikor
//
//  Javaslat: élesítés előtt egy romániai ügyvéd nézze át a szöveget.
// ============================================================

const crypto = require("crypto");
const oldalAdatok = require("./oldalAdatok");
const dok = require("./dokumentum");

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
        return new Date(d).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" });
    } catch (e) {
        return String(d);
    }
}

// 1. változat (2026. októberig): HU + RO egymás alatt. NEM VÁLTOZTATHATÓ –
// a vele aláírt szerződések ujjlenyomata ezzel egyezik, ezért ezek így jelennek meg.
async function torzsV1(m, be, dij) {

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

// ============================================================
//  2. változat: a hivatalos szöveg ROMÁN; kérésre alatta magyar vagy
//  angol fordítás (ford: "" | "hu" | "en"). Az ujjlenyomat a csak román
//  szövegből készül (torzs(m, be, dij) – ford nélkül), így a fordítás
//  választása nem érinti az aláírás igazolását.
// ============================================================

const TIPUS = {
    lakas: { ro: "apartament", hu: "lakás", en: "apartment" },
    haz: { ro: "casă", hu: "ház", en: "house" },
    telek: { ro: "teren", hu: "telek", en: "land plot" },
    kereskedelmi: { ro: "spațiu comercial", hu: "üzlethelyiség", en: "commercial space" },
    iroda: { ro: "birou", hu: "iroda", en: "office" }
};

function napRo(d) {
    if (!d) return "____________";
    const [y, m, n] = pgDatum(d).split("-");
    return `${n}.${m}.${y}`;
}

const ures = (n = 14) => "_".repeat(n);

async function torzs(m, be, dij, ford = "") {

    const u = await oldalAdatok.nyilvanos();
    const F = ["hu", "en"].includes(ford) ? ford : "";
    const opciok = (Array.isArray(m.opciok) ? m.opciok : []).map(k => be.opciok.find(o => o.kod === k)).filter(Boolean);
    const kiado = m.ugylet === "kiado";
    const jut = esc(dij.jutalek);
    const pn = esc(dij.penznem);
    const idotartam = esc(m.idotartam_honap || be.idotartam_honap || 6);
    const jogi = opciok.some(o => o.kod === "jogi");
    const fizetos = opciok.some(o => o.ar > 0);
    const tip = TIPUS[m.tipus] || { ro: m.tipus || "–", hu: m.tipus || "–", en: m.tipus || "–" };
    const minimum = be.minimum_dij ? esc(be.minimum_dij) : "";
    const fix = dij.fix ? esc(dij.fix) : "";
    const kertAr = m.kert_ar ? `<b>${esc(Number(m.kert_ar).toLocaleString("ro-RO"))} ${pn}</b>` : ures(16);
    const cim = esc([m.cim, m.telepules, m.varos].filter(Boolean).join(", ")) || ures(40);

    // p({ ro, hu, en }) – román bekezdés, alatta a kért fordítás
    const p = t => `<p>${t.ro}</p>${F && t[F] ? `<p class="tr-p">${t[F]}</p>` : ""}`;
    // h({ ro, hu, en }) – fejezetcím
    const h = (n, t) => `<h2>Art. ${n}. ${t.ro}${F && t[F] ? ` <span class="tr">/ ${t[F]}</span>` : ""}</h2>`;
    const li = t => `<li>${t.ro}${F && t[F] ? `<span class="tr tr-blokk">${t[F]}</span>` : ""}</li>`;
    const c = t => `${t.ro}${F && t[F] ? ` <span class="tr">/ ${t[F]}</span>` : ""}`;

    let n = 0;
    const A = () => ++n;

    return `
  <h1>CONTRACT DE INTERMEDIERE IMOBILIARĂ${F ? `<span class="tr tr-blokk">${F === "hu" ? "Ingatlanközvetítési szerződés" : "Real estate brokerage agreement"}</span>` : ""}</h1>
  <div class="alcim">Nr. <b>${esc(m.szerzodes_szam || ures(8))}</b> din data de <b>${napRo(m.szerzodes_datum || m.alairva)}</b></div>

  <h2 class="partile">${c({ ro: "Părțile contractante", hu: "A szerződő felek", en: "The parties" })}</h2>
  <div class="felek">
    <div class="fel">
      <h3>${c({ ro: "Intermediar", hu: "Közvetítő (megbízott)", en: "Broker" })}</h3>
      <b>${esc(u.nev || "IngatlanPro")}</b><br>
      ${u.adoszam ? `CIF: ${esc(u.adoszam)}<br>` : ""}
      ${u.cegjegyzekszam ? `Nr. Reg. Com.: ${esc(u.cegjegyzekszam)}<br>` : ""}
      ${u.cim ? `${c({ ro: "Sediul", hu: "Székhely", en: "Registered office" })}: ${esc(u.cim)}<br>` : ""}
      ${u.email ? `E-mail: ${esc(u.email)}<br>` : ""}
      ${u.telefon ? `Tel.: ${esc(u.telefon)}<br>` : ""}
      ${c({ ro: "denumit în continuare „Intermediarul”", hu: "a továbbiakban: Közvetítő", en: "hereinafter “the Broker”" })}
    </div>
    <div class="fel">
      <h3>${c({ ro: "Client (proprietar)", hu: "Megbízó (tulajdonos)", en: "Client (owner)" })}</h3>
      <b>${esc(m.nev || ures(30))}</b><br>
      CNP: ${ures(16)}<br>
      ${c({ ro: "C.I. seria / nr.", hu: "Szem. ig. sorozat / szám", en: "ID card series / no." })}: ${ures(6)} / ${ures(10)}<br>
      ${c({ ro: "Domiciliul", hu: "Lakcím", en: "Address" })}: ${ures(30)}<br>
      ${m.telefon ? `Tel.: ${esc(m.telefon)}<br>` : ""}
      ${m.email ? `E-mail: ${esc(m.email)}<br>` : ""}
      ${c({ ro: "denumit în continuare „Clientul”", hu: "a továbbiakban: Megbízó", en: "hereinafter “the Client”" })}
    </div>
  </div>
  ${p({
        ro: "Părțile au convenit încheierea prezentului contract de intermediere, în conformitate cu art. 2096–2102 din Codul civil (Legea nr. 287/2009), în următoarele condiții:",
        hu: "A felek a román Polgári Törvénykönyv (Legea 287/2009) 2096–2102. cikke alapján az alábbi feltételekkel közvetítési szerződést kötnek:",
        en: "The parties enter into this brokerage agreement under Articles 2096–2102 of the Romanian Civil Code (Law 287/2009), on the following terms:"
    })}

  ${h(A(), { ro: "Obiectul contractului", hu: "A szerződés tárgya", en: "Subject matter" })}
  ${p({
        ro: `Clientul împuternicește Intermediarul să identifice un ${kiado ? "chiriaș" : "cumpărător"} pentru imobilul descris la art. 2 și să îl pună în legătură cu acesta în vederea încheierii unui contract de ${kiado ? "închiriere" : "vânzare-cumpărare"}. Intermediarul acționează ca intermediar și nu reprezintă părțile la încheierea contractului (art. 2097 Cod civil), cu excepția cazului în care Clientul îi acordă un mandat expres, în scris.`,
        hu: `A Megbízó megbízza a Közvetítőt, hogy a 2. cikkben leírt ingatlanhoz ${kiado ? "bérlőt" : "vevőt"} keressen, és azt ${kiado ? "bérleti" : "adásvételi"} szerződés megkötése céljából a Megbízóval kapcsolatba hozza. A Közvetítő közvetítőként jár el, a szerződés megkötésekor a feleket nem képviseli (Ptk. 2097. cikk), kivéve, ha a Megbízó erre kifejezett írásbeli meghatalmazást ad.`,
        en: `The Client instructs the Broker to find a ${kiado ? "tenant" : "buyer"} for the property described in Art. 2 and to put them in contact with the Client with a view to concluding a ${kiado ? "lease" : "sale"} agreement. The Broker acts as an intermediary and does not represent the parties when the agreement is concluded (Civil Code Art. 2097), unless the Client grants an express written power of attorney.`
    })}

  ${h(A(), { ro: "Imobilul", hu: "Az ingatlan", en: "The property" })}
  <ul>
    ${li({ ro: `Tip: ${esc(tip.ro)}${m.nm ? `, suprafață ${esc(m.nm)} m²` : ""}${m.szobak ? `, ${esc(m.szobak)} camere` : ""}`, hu: `Típus: ${esc(tip.hu)}${m.nm ? `, ${esc(m.nm)} m²` : ""}${m.szobak ? `, ${esc(m.szobak)} szoba` : ""}`, en: `Type: ${esc(tip.en)}${m.nm ? `, ${esc(m.nm)} m²` : ""}${m.szobak ? `, ${esc(m.szobak)} rooms` : ""}` })}
    ${li({ ro: `Adresa: ${cim}`, hu: "Cím (lásd fent)", en: "Address (see above)" })}
    ${li({ ro: `Carte funciară nr.: ${ures()} · Nr. cadastral: ${ures()}`, hu: "Telekkönyv száma · Kataszteri (helyrajzi) szám", en: "Land register no. · Cadastral no." })}
    ${li({ ro: `${kiado ? "Chiria solicitată" : "Prețul solicitat"}: ${kertAr} (negociabil)`, hu: `${kiado ? "Kért bérleti díj" : "Kért ár"} (alkuképes)`, en: `${kiado ? "Asking rent" : "Asking price"} (negotiable)` })}
  </ul>
  ${p({
        ro: "Prețul final se stabilește exclusiv de Client. Intermediarul nu poate accepta oferte sau încheia contracte în numele Clientului.",
        hu: "A végső árat kizárólag a Megbízó határozza meg. A Közvetítő a Megbízó nevében ajánlatot nem fogadhat el és szerződést nem köthet.",
        en: "The final price is set solely by the Client. The Broker may not accept offers or sign agreements on the Client's behalf."
    })}

  ${h(A(), { ro: "Serviciile Intermediarului", hu: "A Közvetítő szolgáltatásai", en: "The Broker's services" })}
  ${opciok.length ? `<ul>${opciok.map(o => li({
        ro: `<b>${esc(o.nev.ro)}</b>${o.ar > 0 ? ` – ${esc(o.ar)} ${esc(o.penznem)}` : ""}`,
        hu: esc(o.nev.hu), en: esc(o.nev.en || o.nev.hu)
    })).join("")}</ul>` : ""}
  ${p({
        ro: "Intermediarul promovează imobilul, filtrează persoanele interesate, organizează și efectuează vizionările pe bază de programare și transmite Clientului, în scris, ofertele primite (împreună cu informațiile despre finanțarea cumpărătorului, dacă există). Decizia de acceptare a unei oferte aparține exclusiv Clientului. O ofertă de cumpărare este o declarație de intenție; obligațiile dintre Client și cumpărător se nasc prin semnarea antecontractului și, după caz, plata arvunei.",
        hu: "A Közvetítő hirdeti az ingatlant, előszűri az érdeklődőket, időpontfoglalással megszervezi és lebonyolítja a megtekintéseket, és a beérkezett ajánlatokat (a vevő finanszírozási adataival együtt, ha vannak) írásban továbbítja a Megbízónak. Az ajánlat elfogadásáról kizárólag a Megbízó dönt. A vételi ajánlat szándéknyilatkozat; a Megbízó és a vevő közötti kötelezettség az előszerződés aláírásával és adott esetben a foglaló (arvună) megfizetésével jön létre.",
        en: "The Broker advertises the property, screens interested parties, organises and conducts viewings by appointment and forwards received offers to the Client in writing (together with the buyer's financing details, if any). Only the Client decides whether to accept an offer. A purchase offer is a statement of intent; obligations between the Client and the buyer arise when the preliminary agreement is signed and, where applicable, the deposit (arvună) is paid."
    })}
  ${jogi ? p({
        ro: "Clientul împuternicește Intermediarul să solicite, în numele său, documentele necesare tranzacției (extras de carte funciară, certificat fiscal etc.) și să programeze întâlnirea la notar. Contractul de vânzare-cumpărare a unui imobil se încheie, sub sancțiunea nulității, în formă autentică, la notar (art. 1244 Cod civil).",
        hu: "A Megbízó felhatalmazza a Közvetítőt, hogy az ügylethez szükséges iratokat (telekkönyvi kivonat, adóigazolás stb.) a nevében kikérje, és a közjegyzői időpontot egyeztesse. Ingatlan adásvételi szerződése érvénytelenség terhe mellett csak közjegyzői okiratban köthető meg (Ptk. 1244. cikk).",
        en: "The Client authorises the Broker to request on the Client's behalf the documents needed for the transaction (land register extract, tax certificate, etc.) and to book the notary appointment. A real estate sale agreement must, on pain of nullity, be concluded in authentic form before a notary (Civil Code Art. 1244)."
    }) : ""}

  ${h(A(), { ro: "Durata contractului" + (m.kizarolagos ? " și exclusivitatea" : ""), hu: "Időtartam" + (m.kizarolagos ? " és kizárólagosság" : ""), en: "Term" + (m.kizarolagos ? " and exclusivity" : "") })}
  ${p({
        ro: `Contractul se încheie pe o durată de <b>${idotartam} luni</b> de la semnare. Oricare parte îl poate denunța unilateral printr-o notificare scrisă (inclusiv e-mail) transmisă cu cel puțin 15 zile înainte.`,
        hu: `A szerződés az aláírástól számított <b>${idotartam} hónapra</b> szól. Bármelyik fél legalább 15 nappal korábban küldött írásbeli (e-mailben is megküldhető) értesítéssel egyoldalúan felmondhatja.`,
        en: `This agreement runs for <b>${idotartam} months</b> from signature. Either party may terminate it by written notice (e-mail included) given at least 15 days in advance.`
    })}
  ${m.kizarolagos ? p({
        ro: "Pe durata contractului, Clientul nu va contracta servicii de intermediere pentru același imobil cu un alt intermediar. Dacă, pe durata contractului, Clientul vinde (închiriază) imobilul prin intermediul altui intermediar, comisionul prevăzut la art. 5 este datorat Intermediarului.",
        hu: "A szerződés ideje alatt a Megbízó ugyanerre az ingatlanra más közvetítőt nem bíz meg. Ha a szerződés ideje alatt a Megbízó az ingatlant más közvetítő útján adja el (adja bérbe), az 5. cikk szerinti díj a Közvetítőt illeti.",
        en: "During the term, the Client will not engage another broker for the same property. If during the term the Client sells (lets) the property through another broker, the commission under Art. 5 is owed to the Broker."
    }) : p({
        ro: "Contractul nu este exclusiv: Clientul poate vinde (închiria) imobilul și singur sau prin alți intermediari, cu obligația de a-l informa pe Intermediar fără întârziere.",
        hu: "A szerződés nem kizárólagos: a Megbízó maga is, illetve más közvetítő útján is értékesíthet (bérbe adhat), erről azonban a Közvetítőt haladéktalanul tájékoztatja.",
        en: "This agreement is non-exclusive: the Client may also sell (let) the property personally or through other brokers, but must inform the Broker without delay."
    })}

  ${h(A(), { ro: "Remunerația Intermediarului", hu: "A Közvetítő díja", en: "The Broker's fee" })}
  ${p({
        ro: `Intermediarul are dreptul la un comision de <b>${jut}%</b> din ${kiado ? "chiria aferentă unui an" : "prețul final de vânzare"}${minimum ? `, dar nu mai puțin de <b>${minimum} ${pn}</b>` : ""}${fix ? `, precum și la o taxă de mandat de <b>${fix} ${pn}</b>` : ""}. Comisionul se datorează numai dacă ${kiado ? "contractul de închiriere" : "contractul de vânzare-cumpărare"} se încheie ca urmare a activității Intermediarului (art. 2100 Cod civil) și devine exigibil la data semnării acestuia${kiado ? "" : " (sau a antecontractului, dacă părțile semnează un antecontract cu plata arvunei)"}.`,
        hu: `A Közvetítőt ${kiado ? "az egy évre eső bérleti díj" : "a végleges vételár"} <b>${jut}%-a</b>${minimum ? `, de legalább <b>${minimum} ${pn}</b>` : ""} közvetítői díj${fix ? `, valamint <b>${fix} ${pn}</b> megbízási díj` : ""} illeti meg. A díj csak akkor jár, ha a ${kiado ? "bérleti" : "adásvételi"} szerződés a Közvetítő tevékenysége eredményeként jön létre (Ptk. 2100. cikk), és annak aláírásakor${kiado ? "" : " (vagy foglalóval kötött előszerződés esetén az előszerződés aláírásakor)"} esedékes.`,
        en: `The Broker is entitled to a commission of <b>${jut}%</b> of ${kiado ? "one year's rent" : "the final sale price"}${minimum ? `, but not less than <b>${minimum} ${pn}</b>` : ""}${fix ? `, plus a mandate fee of <b>${fix} ${pn}</b>` : ""}. The commission is owed only if the ${kiado ? "lease" : "sale"} agreement is concluded as a result of the Broker's activity (Civil Code Art. 2100) and falls due when that agreement${kiado ? "" : " (or a preliminary agreement with a deposit)"} is signed.`
    })}
  ${fizetos ? p({
        ro: "Serviciile cu tarif separat prevăzute la art. 3 se plătesc la prestare, chiar dacă tranzacția nu se încheie.",
        hu: "A 3. cikkben szereplő külön díjas szolgáltatások díja a teljesítéskor esedékes, akkor is, ha az ügylet nem jön létre.",
        en: "Separately priced services listed in Art. 3 are payable when performed, even if no transaction takes place."
    }) : ""}
  ${p({
        ro: "Comisionul se datorează și dacă, în termen de 6 luni de la încetarea contractului, Clientul încheie tranzacția cu o persoană prezentată de Intermediar în perioada contractuală.",
        hu: "A díj akkor is jár, ha a Megbízó a szerződés megszűnésétől számított 6 hónapon belül olyan személlyel köt szerződést, akit a Közvetítő a szerződés ideje alatt mutatott be.",
        en: "The commission is also owed if, within 6 months of the end of this agreement, the Client concludes the transaction with a person introduced by the Broker during the term."
    })}
  ${p({
        ro: "Plata se face pe baza facturii emise de Intermediar, prin transfer bancar, în termenul indicat pe factură. Cheltuielile notariale, taxele și impozitele aferente tranzacției nu sunt incluse în comision.",
        hu: "A fizetés a Közvetítő által kiállított számla alapján, banki átutalással, a számlán megadott határidőig történik. A közjegyzői költségek, az ügylet illetékei és adói nem részei a díjnak.",
        en: "Payment is made by bank transfer against the Broker's invoice, by the due date shown on it. Notary costs, duties and taxes related to the transaction are not included in the commission."
    })}

  ${h(A(), { ro: "Obligațiile Intermediarului", hu: "A Közvetítő kötelezettségei", en: "Obligations of the Broker" })}
  ${p({
        ro: "Intermediarul se obligă să acționeze cu diligență și bună-credință, să informeze Clientul cu privire la evoluția activității (vizionări, oferte), să nu prezinte imobilul la alt preț decât cel stabilit de Client, să păstreze confidențialitatea informațiilor primite și să nu urmărească interese contrare celor ale Clientului.",
        hu: "A Közvetítő gondosan és jóhiszeműen jár el, tájékoztatja a Megbízót a munka állásáról (megtekintések, ajánlatok), az ingatlant csak a Megbízó által meghatározott áron kínálja, a kapott információkat bizalmasan kezeli, és a Megbízó érdekeivel ellentétes érdeket nem követ.",
        en: "The Broker will act diligently and in good faith, keep the Client informed of progress (viewings, offers), offer the property only at the price set by the Client, keep the information received confidential and not pursue interests contrary to the Client's."
    })}

  ${h(A(), { ro: "Obligațiile Clientului", hu: "A Megbízó kötelezettségei", en: "Obligations of the Client" })}
  ${p({
        ro: "Clientul declară că este proprietarul imobilului (sau are dreptul de a dispune de acesta, cu acordul tuturor coproprietarilor) și că imobilul nu face obiectul unor litigii sau sarcini nedeclarate. Clientul pune la dispoziție documentele necesare (act de proprietate, extras de carte funciară, certificat de performanță energetică etc.), permite fotografierea și vizionările la date convenite și informează Intermediarul, în scris, dacă vinde (închiriază) imobilul pe altă cale sau dacă își schimbă intenția.",
        hu: "A Megbízó kijelenti, hogy az ingatlan tulajdonosa (vagy – minden tulajdonostárs hozzájárulásával – jogosult rendelkezni vele), és hogy az ingatlan nem képezi be nem jelentett per vagy teher tárgyát. Átadja a szükséges iratokat (tulajdoni okirat, telekkönyvi kivonat, energetikai tanúsítvány stb.), lehetővé teszi a fotózást és az egyeztetett időpontú megtekintéseket, és írásban tájékoztatja a Közvetítőt, ha az ingatlant más úton adja el (adja bérbe), vagy ha szándéka megváltozik.",
        en: "The Client declares that they own the property (or are entitled to dispose of it with the consent of all co-owners) and that it is not subject to undisclosed litigation or encumbrances. The Client provides the necessary documents (title deed, land register extract, energy performance certificate, etc.), allows photography and viewings at agreed times, and informs the Broker in writing if the property is sold (let) by other means or if their intentions change."
    })}

  ${h(A(), { ro: "Dreptul de retragere", hu: "Elállási jog", en: "Right of withdrawal" })}
  ${p({
        ro: "Dacă Clientul este consumator și contractul este încheiat la distanță (online) sau în afara spațiilor comerciale, Clientul are dreptul de a se retrage din contract, fără a invoca vreun motiv, în termen de 14 zile de la încheierea acestuia (OUG nr. 34/2014). Retragerea se notifică prin orice declarație neechivocă (de exemplu e-mail) sau folosind formularul din anexă. Dacă Clientul solicită expres începerea serviciilor (fotografiere, publicare) înainte de expirarea termenului de retragere, în caz de retragere va plăti contravaloarea proporțională a serviciilor prestate până la data notificării.",
        hu: "Ha a Megbízó fogyasztó, és a szerződést távollévők között (online) vagy üzlethelyiségen kívül kötik, a Megbízó a megkötéstől számított 14 napon belül indoklás nélkül elállhat (OUG 34/2014). Az elállás bármely egyértelmű nyilatkozattal (pl. e-mailben) vagy a mellékelt nyilatkozatmintával közölhető. Ha a Megbízó kifejezetten kéri, hogy a munka (fotózás, hirdetés) az elállási határidő lejárta előtt induljon, elállás esetén az értesítésig teljesített szolgáltatások arányos díját megfizeti.",
        en: "If the Client is a consumer and the agreement is concluded at a distance (online) or off-premises, the Client may withdraw without giving any reason within 14 days of conclusion (Government Emergency Ordinance 34/2014). Withdrawal may be notified by any unequivocal statement (e.g. e-mail) or using the model form in the annex. If the Client expressly asks for the services (photography, advertising) to start before the withdrawal period ends, on withdrawal the Client pays a proportionate amount for the services provided until notification."
    })}

  ${h(A(), { ro: "Încetarea contractului", hu: "A szerződés megszűnése", en: "Termination" })}
  ${p({
        ro: "Contractul încetează: la expirarea duratei; prin încheierea tranzacției; prin acordul părților; prin denunțare unilaterală conform art. 4; prin rezilierea de către partea interesată, dacă cealaltă parte nu își execută obligațiile esențiale după o notificare de 10 zile. Încetarea nu afectează dreptul la comisionul deja datorat.",
        hu: "A szerződés megszűnik: az időtartam lejártával; az ügylet létrejöttével; közös megegyezéssel; a 4. cikk szerinti felmondással; az érdekelt fél általi felbontással, ha a másik fél lényeges kötelezettségét 10 napos felszólítás után sem teljesíti. A megszűnés a már esedékes díjat nem érinti.",
        en: "The agreement ends: on expiry of the term; when the transaction is concluded; by mutual agreement; by notice under Art. 4; by termination by either party if the other fails to perform an essential obligation within 10 days of notice. Termination does not affect a commission already due."
    })}

  ${h(A(), { ro: "Prevenirea spălării banilor", hu: "Pénzmosás megelőzése", en: "Anti-money laundering" })}
  ${p({
        ro: "Intermediarul este entitate raportoare conform Legii nr. 129/2019 și are obligația de a identifica clienții și de a aplica măsurile de cunoaștere a clientelei. Clientul prezintă actul de identitate și furnizează informațiile solicitate în acest scop.",
        hu: "A Közvetítő a Legea 129/2019 szerint bejelentésre kötelezett szolgáltató, köteles ügyfeleit azonosítani és az ügyfél-átvilágítási intézkedéseket alkalmazni. A Megbízó ehhez bemutatja személyazonosító iratát és megadja a kért adatokat.",
        en: "The Broker is an obliged entity under Law 129/2019 and must identify its clients and apply customer due diligence measures. The Client presents an identity document and provides the information requested for this purpose."
    })}

  ${h(A(), { ro: "Protecția datelor personale", hu: "Személyes adatok védelme", en: "Personal data" })}
  ${p({
        ro: "Intermediarul prelucrează datele personale ale Clientului și ale persoanelor interesate în calitate de operator, exclusiv pentru executarea prezentului contract și pentru îndeplinirea obligațiilor legale, conform Regulamentului (UE) 2016/679 (GDPR) și politicii de confidențialitate publicate pe platforma IngatlanPro. Datele de finanțare ale cumpărătorilor sunt comunicate Clientului doar pentru evaluarea ofertelor. Clientul își poate exercita drepturile (acces, rectificare, ștergere, opoziție) la adresa de e-mail a Intermediarului și are dreptul de a depune plângere la ANSPDCP.",
        hu: "A Közvetítő a Megbízó és az érdeklődők személyes adatait adatkezelőként, kizárólag a szerződés teljesítéséhez és a jogi kötelezettségei teljesítéséhez kezeli, a GDPR (EU 2016/679) és az IngatlanPro adatvédelmi tájékoztatója szerint. A vevők finanszírozási adatait a Megbízó csak az ajánlatok elbírálásához kapja meg. A Megbízó jogait (hozzáférés, helyesbítés, törlés, tiltakozás) a Közvetítő e-mail címén gyakorolhatja, és panaszt tehet az ANSPDCP-nél.",
        en: "The Broker processes the personal data of the Client and of interested parties as controller, solely to perform this agreement and to meet legal obligations, under Regulation (EU) 2016/679 (GDPR) and the privacy policy published on the IngatlanPro platform. Buyers' financing details are shared with the Client only to assess offers. The Client may exercise their rights (access, rectification, erasure, objection) at the Broker's e-mail address and may complain to ANSPDCP, the Romanian data protection authority."
    })}

  ${h(A(), { ro: "Forța majoră", hu: "Vis maior", en: "Force majeure" })}
  ${p({
        ro: "Niciuna dintre părți nu răspunde pentru neexecutarea obligațiilor cauzată de forță majoră, în condițiile art. 1351 Cod civil, cu condiția notificării celeilalte părți în cel mult 5 zile.",
        hu: "Egyik fél sem felel a vis maior (Ptk. 1351. cikk) miatti nemteljesítésért, ha erről a másik felet legkésőbb 5 napon belül értesíti.",
        en: "Neither party is liable for non-performance caused by force majeure (Civil Code Art. 1351), provided the other party is notified within 5 days."
    })}

  ${h(A(), { ro: "Comunicări și semnătura electronică", hu: "Értesítések, elektronikus aláírás", en: "Notices and electronic signature" })}
  ${p({
        ro: "Comunicările dintre părți se fac în scris, la adresele de e-mail de mai sus sau prin contul Clientului de pe platforma IngatlanPro. Părțile convin ca prezentul contract să poată fi semnat și electronic, în contul Clientului de pe platforma IngatlanPro, cu un cod unic transmis pe e-mail; această modalitate constituie semnătură electronică în sensul Regulamentului (UE) nr. 910/2014 (eIDAS), iar părțile îi recunosc valoarea probatorie. Amprenta digitală (SHA-256) a textului acceptat se păstrează ca dovadă a versiunii semnate.",
        hu: "A felek egymással írásban, a fenti e-mail címeken vagy a Megbízó IngatlanPro-fiókján keresztül érintkeznek. A felek elfogadják, hogy a szerződés elektronikusan, a Megbízó IngatlanPro-fiókjában, e-mailben kapott egyszeri kóddal is aláírható; ez az (EU) 910/2014 rendelet (eIDAS) szerinti elektronikus aláírás, amelynek bizonyító erejét a felek elismerik. Az elfogadott szöveg digitális ujjlenyomata (SHA-256) az aláírt változat bizonyítékaként megőrződik.",
        en: "Notices between the parties are given in writing to the e-mail addresses above or through the Client's IngatlanPro account. The parties agree that this agreement may also be signed electronically in the Client's IngatlanPro account using a one-time code sent by e-mail; this constitutes an electronic signature within the meaning of Regulation (EU) 910/2014 (eIDAS) and the parties recognise its evidential value. A digital fingerprint (SHA-256) of the accepted text is kept as proof of the signed version."
    })}

  ${h(A(), { ro: "Legea aplicabilă și soluționarea litigiilor", hu: "Irányadó jog, viták rendezése", en: "Governing law and disputes" })}
  ${p({
        ro: "Contractul este guvernat de legea română. Părțile vor încerca soluționarea amiabilă a oricărei neînțelegeri. Clientul consumator se poate adresa Autorității Naționale pentru Protecția Consumatorilor (ANPC, www.anpc.ro) sau unei entități de soluționare alternativă a litigiilor (SAL). În lipsa unei înțelegeri, litigiile se soluționează de instanțele competente din România; în cazul consumatorului, inclusiv de instanța de la domiciliul acestuia.",
        hu: "A szerződésre a román jog irányadó. A felek vitáikat elsősorban békés úton rendezik. A fogyasztó Megbízó az Országos Fogyasztóvédelmi Hatósághoz (ANPC, www.anpc.ro) vagy alternatív vitarendezési fórumhoz (SAL) fordulhat. Megegyezés hiányában a vitákat a hatáskörrel rendelkező romániai bíróságok döntik el; fogyasztó esetén a lakóhelye szerinti bíróság is.",
        en: "This agreement is governed by Romanian law. The parties will first try to settle disputes amicably. A consumer Client may contact the National Consumer Protection Authority (ANPC, www.anpc.ro) or an alternative dispute resolution body (SAL). Failing agreement, disputes are settled by the competent Romanian courts, including, for consumers, the court of their domicile."
    })}

  ${h(A(), { ro: "Dispoziții finale", hu: "Záró rendelkezések", en: "Final provisions" })}
  ${p({
        ro: "Orice modificare a contractului se face numai în scris, prin act adițional. Prezentul contract a fost încheiat în două exemplare originale, câte unul pentru fiecare parte, sau în formă electronică, accesibilă ambelor părți. În caz de neconcordanță între textul în limba română și orice traducere, prevalează textul în limba română.",
        hu: "A szerződés csak írásban, kiegészítő okirattal módosítható. A szerződés két eredeti példányban – mindkét félnek egy-egy –, vagy mindkét fél számára hozzáférhető elektronikus formában készült. A román szöveg és bármely fordítás eltérése esetén a román szöveg az irányadó.",
        en: "Any amendment must be made in writing by an addendum. This agreement is made in two originals, one for each party, or in electronic form accessible to both parties. In case of discrepancy between the Romanian text and any translation, the Romanian text prevails."
    })}
  ${be.szerzodes_megjegyzes ? `<p style="white-space:pre-line">${esc(be.szerzodes_megjegyzes)}</p>` : ""}`;
}


// Melléklet: elállási nyilatkozatminta (OUG 34/2014, 1. melléklet B) – az aláírások után
async function anexa(m, ford = "") {
    const u = await oldalAdatok.nyilvanos();
    const F = ["hu", "en"].includes(ford) ? ford : "";
    const p = t => `<p>${t.ro}</p>${F && t[F] ? `<p class="tr-p">${t[F]}</p>` : ""}`;
    const c = t => `${t.ro}${F && t[F] ? ` <span class="tr">/ ${t[F]}</span>` : ""}`;
    return `
  <div class="anexa">
    <h2>${c({ ro: "Anexă – Formular de retragere", hu: "Melléklet – Elállási nyilatkozatminta", en: "Annex – Model withdrawal form" })}</h2>
    ${p({
        ro: `Către ${esc(u.nev || "IngatlanPro")}${u.cim ? ", " + esc(u.cim) : ""}${u.email ? ", e-mail: " + esc(u.email) : ""}:<br>Vă informez prin prezenta cu privire la retragerea mea din contractul de intermediere imobiliară nr. ${esc(m.szerzodes_szam || ures(8))}, încheiat la data de ${ures(12)}.<br>Numele consumatorului: ${ures(30)}<br>Adresa consumatorului: ${ures(30)}<br>Semnătura (doar în cazul în care formularul este transmis pe hârtie): ${ures(20)} · Data: ${ures(12)}`,
        hu: "A fenti címre: Kijelentem, hogy a fenti számú ingatlanközvetítési szerződéstől elállok. Név, cím, aláírás (csak papíron küldve), dátum.",
        en: "To the address above: I hereby give notice that I withdraw from the brokerage agreement with the number above. Name, address, signature (only if sent on paper), date."
    })}
  </div>`;
}

function ujjlenyomat(html) {
    return crypto.createHash("sha256").update(String(html).replace(/\s+/g, " ").trim()).digest("hex");
}

// A teljes oldal: a szöveg + az aláírások nyomai + eszközsáv (vissza, nyelv, nyomtatás)
//   extra: { ellenjegyzo, ford, ui, vissza, admin }
async function html(m, be, dij, extra = {}) {

    const u = await oldalAdatok.nyilvanos();
    const ford = ["hu", "en"].includes(extra.ford) ? extra.ford : "";
    const k = (t) => dok.ket(t, ford);

    // Melyik szöveg: a mostani, vagy (ha azt írták alá) a régi
    const hashUj = ujjlenyomat(await torzs(m, be, dij));
    let regi = false;
    let szoveg;
    if (m.szerzodes_hash && m.szerzodes_hash !== hashUj && ujjlenyomat(await torzsV1(m, be, dij)) === m.szerzodes_hash) {
        regi = true;
        szoveg = await torzsV1(m, be, dij);
    } else {
        szoveg = await torzs(m, be, dij, ford);
    }
    const valtozott = m.szerzodes_hash && !regi && m.szerzodes_hash !== hashUj;

    const alairas = [];
    if (m.szerzodes_elfogadva) {
        alairas.push(`<div class="elfogadva">
            <b>${k({ ro: "Semnat online de Client", hu: "A Megbízó online aláírta", en: "Signed online by the Client" })}:</b> ${esc(ido(m.szerzodes_elfogadva))}
            ${m.szerzodes_elfogadva_ip ? ` · IP: ${esc(m.szerzodes_elfogadva_ip)}` : ""}
            ${m.szerzodes_kod_ok ? ` · ${k({ ro: "confirmat cu cod unic primit pe e-mail", hu: "e-mailben kapott kóddal igazolva", en: "confirmed with a one-time code sent by e-mail" })}` : ""}
            ${m.korai_kezdes ? `<br>${k({ ro: "Clientul a solicitat expres începerea serviciilor înainte de expirarea termenului de retragere.", hu: "A Megbízó kérte a munka megkezdését az elállási határidő lejárta előtt.", en: "The Client expressly asked for the services to start before the withdrawal period ended." })}` : ""}
            ${m.szerzodes_hash ? `<br><span class="hash">${k({ ro: "Amprentă", hu: "Ujjlenyomat", en: "Fingerprint" })} (SHA-256): ${esc(m.szerzodes_hash)}</span>` : ""}
        </div>`);
    }
    if (m.szerzodes_mod === "szemelyes" && m.alairva) {
        alairas.push(`<div class="elfogadva">${k({ ro: "Semnat în persoană", hu: "Személyesen aláírva", en: "Signed in person" })}: <b>${esc(nap(m.alairva))}</b> – ${k({ ro: "exemplarul scanat se află la documente", hu: "a szkennelt példány az iratok között", en: "the scanned copy is filed with the documents" })}.</div>`);
    }
    if (m.ellenjegyezve) {
        alairas.push(`<div class="elfogadva">${k({ ro: "Contrasemnat de Intermediar", hu: "A Közvetítő ellenjegyezte", en: "Countersigned by the Broker" })}: <b>${esc(ido(m.ellenjegyezve))}</b>${extra.ellenjegyzo ? ` – ${esc(extra.ellenjegyzo)}` : ""} (${esc(u.nev || "IngatlanPro")})</div>`);
    }

    const hatalyos = m.ellenjegyezve || (m.szerzodes_mod === "szemelyes" && m.alairva);
    const allapot = hatalyos
        ? `<div class="hatalyos">${k({ ro: "ÎN VIGOARE", hu: "HATÁLYOS", en: "IN FORCE" })}</div>`
        : m.szerzodes_elfogadva
            ? `<div class="tervezet">${k({ ro: "Semnat de Client – în așteptarea contrasemnării Intermediarului.", hu: "A Megbízó aláírta – a Közvetítő ellenjegyzésére vár.", en: "Signed by the Client – awaiting the Broker's countersignature." })}</div>`
            : `<div class="tervezet"><b>${k({ ro: "PROIECT – nesemnat", hu: "TERVEZET – még nincs aláírva", en: "DRAFT – not yet signed" })}</b>${extra.admin ? `<br><span class="kicsi">Tipp: élesítés előtt egy romániai ügyvéd nézze át a szöveget (közvetítés, fogyasztóvédelem, GDPR).</span>` : ""}</div>`;

    const css = `
  .lap { font-family: Georgia, "Times New Roman", serif; font-size: 14px; line-height: 1.55; }
  .tervezet { font-family: Arial, sans-serif; background: #fff4e5; border: 1px solid #f0c27a; color: #7a4a00; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; margin-bottom: 22px; }
  .hatalyos { font-family: Arial, sans-serif; display: inline-block; border: 2px solid #1f6f5c; color: #1f6f5c; border-radius: 6px; padding: 4px 12px; font-weight: bold; letter-spacing: .06em; margin-bottom: 18px; }
  .hatalyos .tr { color: inherit; }
  .valtozott, .regi { font-family: Arial, sans-serif; border-radius: 8px; padding: 8px 12px; font-size: 12.5px; margin-bottom: 18px; }
  .valtozott { background: #fdecea; border: 1px solid #f1aeb5; color: #842029; }
  .regi { background: #eef3fb; border: 1px solid #b6c8e6; color: #23406e; }
  .kicsi { font-size: 11.5px; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 4px; letter-spacing: .02em; }
  h1 .tr { font-size: 13px; letter-spacing: 0; }
  .alcim { text-align: center; color: #5b6660; margin-bottom: 22px; font-size: 13px; }
  h2 { font-size: 14px; margin: 22px 0 6px; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: .03em; color: #1f6f5c; break-after: avoid; }
  h2 .tr { text-transform: none; letter-spacing: 0; }
  p { margin: 0 0 7px; text-align: justify; }
  .ro { color: #4b5651; font-style: italic; margin-bottom: 10px; }
  .felek { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-family: Arial, sans-serif; font-size: 13px; margin-bottom: 12px; }
  .fel { background: #f7f8f6; border-radius: 8px; padding: 12px 14px; }
  .fel h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #5b6660; }
  ul { margin: 4px 0 10px 18px; padding: 0; }
  .alair { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; font-family: Arial, sans-serif; font-size: 13px; break-inside: avoid; }
  .alair div { border-top: 1px solid #1c2321; padding-top: 6px; text-align: center; }
  .elfogadva { margin-top: 14px; font-family: Arial, sans-serif; font-size: 12.5px; background: #e8f4ef; border: 1px solid #9fd0bd; color: #14523f; border-radius: 8px; padding: 8px 12px; }
  .hash { font-family: monospace; font-size: 11px; word-break: break-all; }
  .anexa { margin-top: 36px; padding-top: 12px; border-top: 1px dashed #b9c0bb; break-before: page; }
  @media (max-width: 640px) { .felek, .alair { grid-template-columns: 1fr; } p { text-align: left; } }`;

    const tartalom = `
  ${allapot}
  ${regi ? `<div class="regi">${k({ ro: "Acest contract a fost semnat cu versiunea anterioară a textului (maghiară / română) – se afișează textul semnat.", hu: "Ezt a szerződést a korábbi (magyar / román) szöveggel írták alá – az aláírt szöveg látszik.", en: "This agreement was signed with the earlier (Hungarian / Romanian) text – the signed text is shown." })}</div>` : ""}
  ${valtozott ? `<div class="valtozott">${k({ ro: "Datele contractului au fost modificate după semnare – amprenta versiunii semnate diferă.", hu: "Az aláírás óta a szerződés adatai módosultak – az aláírt változat ujjlenyomata eltér.", en: "The agreement data changed after signing – the fingerprint of the signed version differs." })}</div>` : ""}
  ${szoveg}
  ${alairas.join("")}
  <div class="alair">
    <div>${k({ ro: "Intermediar", hu: "Közvetítő", en: "Broker" })}<br><br>${esc(u.nev || "IngatlanPro")}</div>
    <div>${k({ ro: "Client", hu: "Megbízó", en: "Client" })}<br><br>${esc(m.nev || "")}</div>
  </div>
  ${regi ? "" : await anexa(m, ford)}`;

    return dok.oldal({
        cim: `Contract de intermediere ${m.szerzodes_szam || ""}`.trim(),
        css,
        tartalom,
        ford,
        ui: extra.ui || ford || "hu",
        vissza: extra.vissza || "/"
    });

}

module.exports = { torzs, torzsV1, html, ujjlenyomat, esc };
