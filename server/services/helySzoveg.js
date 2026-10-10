// ============================================================
//  Helyek a hirdetés szövegéből: utcák (házszámmal) és kerület-említések
//
//  Utcák – román és magyar írásmóddal, rövidítésekkel:
//    "pe strada Viitorului", "str. 1 Dec. 1918", "B-dul General Grigore Bălan",
//    "Aleea Hărniciei!", "strada Al. Centralei" (= Aleea Centralei),
//    "Strada Fabricii 51", "str. Kós Károly nr. 13", "Gábor Áron u. 12",
//    "a Kós Károly utcában", "Szabadság tér", "între B-dul X și str. Y"
//  Minden találatnál: a név (egységes alak), a házszám, hol szerepelt (cím /
//  leírás), és hogy közvetlen-e ("pe strada X") vagy csak viszonyítás
//  ("aproape de strada X", "la 5 minute de ...").
//
//  Kerület-említések – a város kerületeinek neveivel (magyar, román, más
//  oldalakon használt nevek): "zona Gării", "cartierul Simeria", "Zona Lenin",
//  "zona centrală" (= Központ / Central), "Csíki negyed", a címben puszta
//  névként is ("..., Lenin, Sfantu Gheorghe"). A cím erősebb, mint a leírás.
//
//  Nincs függősége: a szerver (location.js, textParse.js) használja.
// ============================================================

"use strict";

const ekezetNelkul = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const kulcs = s => ekezetNelkul(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ---------- Utcatípusok ----------

// Román előtagok (a név előtt) -> egységes alak
const RO_TIPUS = [
    { re: /^(?:strada|str|stradă|străzii|strazii|stradei|strzii)$/i, nev: "Strada" },
    { re: /^(?:bulevardul|bulevard|b-dul|bdul|bd|blvd|b-dului|bulevardului)$/i, nev: "Bulevardul" },
    { re: /^(?:aleea|al|aleii)$/i, nev: "Aleea" },
    { re: /^(?:calea|căii|caii)$/i, nev: "Calea" },
    { re: /^(?:piața|piata|piaţa|p-ța|p-ta|p-ţa|pța|pta|pieței|pietei)$/i, nev: "Piața" },
    { re: /^(?:splaiul)$/i, nev: "Splaiul" },
    { re: /^(?:intrarea|intr)$/i, nev: "Intrarea" },
    { re: /^(?:șoseaua|soseaua|şoseaua|șos|sos|şos)$/i, nev: "Șoseaua" },
    { re: /^(?:drumul)$/i, nev: "Drumul" },
    { re: /^(?:fundătura|fundatura)$/i, nev: "Fundătura" }
];

const RO_ELOTAG = "(?:strada|str\\.|str(?=\\s)|stradă|străzii|strazii|stradei|bulevardul|bulevardului|bulevard|b-dul\\.?|b-dului|bdul\\.?|bd\\.|bd(?=\\s)|blvd\\.?|aleea|aleii|al\\.|calea|pia[tțţ]a|p-[tțţ]a\\.?|p[tț]a\\.|pieței|pietei|splaiul|intrarea|intr\\.|[sșş]oseaua|[sșş]os\\.|drumul|fund[aă]tura)";

// Magyar utótagok (a név után) -> román megfelelő (a kereséshez)
const HU_TIPUS = [
    { re: /^(?:utca|utcá(?:ban|n|ra|ról|tól|hoz|nál|ba|ig)|utcai|u)$/i, ro: "Strada", hu: "utca" },
    { re: /^(?:út|útja|úton|úti|útról|útnál|úthoz)$/i, ro: "Strada", hu: "út" },
    { re: /^(?:tér|téren|téri|térre|térről|térnél)$/i, ro: "Piața", hu: "tér" },
    { re: /^(?:köz|közben|közben|közi)$/i, ro: "Aleea", hu: "köz" },
    { re: /^(?:sor|soron|sori)$/i, ro: "Strada", hu: "sor" },
    { re: /^(?:sétány|sétányon|sétányi)$/i, ro: "Aleea", hu: "sétány" },
    { re: /^(?:körút|körúton|körúti|krt)$/i, ro: "Bulevardul", hu: "körút" }
];

const HU_UTOTAG = "(?:utcá(?:ban|n|ra|ról|tól|hoz|nál|ba|ig)|utcai|utca|u\\.|útja|úton|úti|útról|útnál|úthoz|út|téren|téri|térre|térről|térnél|tér|közben|közi|köz|soron|sori|sor|sétányon|sétányi|sétány|körúton|körúti|körút|krt\\.)";

// Rövidítések a nevekben ("1 Dec. 1918", "Gen. Grigore Bălan")
const ROVIDITES = {
    dec: "Decembrie", ian: "Ianuarie", febr: "Februarie", mart: "Martie", apr: "Aprilie",
    gen: "General", gral: "General", lt: "Locotenent", col: "Colonel", dr: "Doctor", prof: "Profesor",
    sf: "Sfântul", sfm: "Sfântul", mr: "Maior", cpt: "Căpitan", av: "Avram", m: "Mihai"
};

// A név nem lehet ilyen köznapi szó ("strada principală", "strada liniștită"...)
const NEM_NEV = /^(?:principal[aă]?|lini[sșş]tit[aă]?|lini[sșş]tii|asfaltat[aă]?|asfalt|intens[aă]?|circulat[aă]?|pietruit[aă]?|nou[aă]?|noi|reziden[tțţ]ial[aă]?|termic[aă]?|proprie|foarte|bun[aă]|central[aă] termic[aă]|lateral[aă]|secundar[aă]|privat[aă]|de acces|acces|din|cu|si|și|care|este|sunt|la|in|în|pe|spre|catre|către|vecin[aă]|paralel[aă]|perpendicular[aă]|neasfaltat[aă]|betonat[aă]|deschis[aă]|inchis[aă]|închis[aă]|f[aă]r[aă]|nr|numar|număr|a|al|ale|cea|cel|mai|unei|unui|această|aceasta|acestei|respectiv[aă]?|principale|mare|mic[aă])$/i;

// Kis kötőszavak, amik egy név közepén állhatnak ("Ștefan cel Mare", "Mihai Viteazul", "Avram Iancu")
const KOTOSZO = /^(?:cel|lui|de|din|la|și|si)$/i;

// Ami után egy utca csak viszonyítási pont (a közelében, nem rajta)
const KOZELI_ELOTT = /(?:aproape\s+de|apropiere(?:a)?\s+(?:de|a)?|l[aâ]ng[aă]|vis-?[aà]-?vis\s+(?:de|cu)?|vizavi\s+(?:de|cu)?|la\s+\d+\s*(?:de\s+)?(?:m|metri|minute|min\.?)\s+(?:de|fa[tțţ][aă]\s+de)|la\s+c[aâ]teva\s+minute\s+de|la\s+doar\s+\S+\s+minute\s+de|peste\s+drum\s+de|[iî]n\s+spatele|[iî]n\s+fa[tțţ]a|[iî]ntre|near|close\s+to|next\s+to|k[oö]zel(?:[eé]ben)?|mellett|szomsz[eé]dságában|percre)\s*$/i;

// Szavak egy név végén, amik már nem a név részei
const NEV_VEGE = /^(?:nr|num[aă]r|bl|bloc|sc|scara|ap|et|etaj|etajul|parter|in|în|si|și|cu|langa|lângă|aproape|zona|zonă|cartier|cartierul|din|jud|judet|județ|mun|municipiul|ora[sșş]ul|loc|localitatea|sat|comuna|sector|sfantu|sfântu|sfantul|sfântul|sf|tg|targu|târgu|nr\.)$/i;

// Nagybetűs szavak, amik már a következő mondatot kezdik ("str. Crangului Apartament cu 2 camere",
// "Strada Jókai Mór Agenția Imobiliară...") – a név itt véget ér
const NEV_STOP = /^(?:Apartament|Apartamentul|Apartamente|Garsoniera|Garsonieră|Casa|Casă|Vila|Teren|Terenul|Spatiu|Spațiu|Imobil|Imobilul|Bloc|Blocul|Locuinta|Locuința|Proprietate|Proprietatea|Oferta|Oferim|Pret|Preț|Pretul|Prețul|Suprafata|Suprafața|Situat|Situată|Situata|Agenția|Agentia|Agentie|Imobiliara|Imobiliară|Contact|Telefon|Tel|Detalii|Vand|Vând|Vanzare|Vânzare|Inchiriez|Închiriez|Inchiriere|Închiriere|Comision|Descriere|Zona|Zonă|Sfantu|Sfântu|Municipiul|Judetul|Județul|Covasna|Harghita|Brasov|Brașov|Bucuresti|București|Utilități|Utilitati|Utilitățile|Caracteristici|Dotari|Dotări|Avantaje|Localizare|Specificații|Specificatii|Compartimentare|Lakás|Ház|Eladó|Kiadó|Telek|Ár|Agen\?ia)$/;

const NAGYBETU = /^[A-ZĂÂÎȘȚŞŢÁÉÍÓÖŐÚÜŰ]/;

// Egy szó tisztítása (írásjelek le), rövidítés kibontása
function szoTisztit(sz) {
    let s = String(sz || "").replace(/^[("'„“«]+|[)"'”»!?;:,–-]+$/g, "");
    const pont = /\.$/.test(s);
    const alap = s.replace(/\.+$/, "");
    const r = ROVIDITES[kulcs(alap)];
    if (pont && r) return { szo: r, rovidites: true };
    return { szo: alap, rovidites: false, pont };
}

const hazszamE = s => /^\d{1,4}[A-Za-z]?$/.test(s) && !/^(?:18|19|20)\d\d$/.test(s);

// A típus utáni szavakból a név (és a házszám) – a mondat / tagmondat végéig
function nevOlvas(szavak, kisbetuOk) {

    const nev = [];
    let hazszam = null;

    for (let i = 0; i < szavak.length && nev.length < 6; i++) {

        const nyers = szavak[i];
        const vegJel = /[,;:!?)(]$|[.]$/.test(nyers) ? nyers.slice(-1) : "";
        const { szo, rovidites, pont } = szoTisztit(nyers);
        if (!szo) break;

        // "nr. 13", "nr 13", "numărul 13"
        if (/^(?:nr|num[aă]r|num[aă]rul|no)$/i.test(szo)) {
            const k = szoTisztit(szavak[i + 1] || "").szo;
            if (hazszamE(k)) hazszam = k;
            break;
        }

        if (NEV_VEGE.test(szo) && nev.length) break;
        if (NEV_STOP.test(szo) && nev.length) break;

        const szam = /^\d{1,4}$/.test(szo);
        const nagy = NAGYBETU.test(szo);
        const kotoszo = KOTOSZO.test(szo) && nev.length && szavak[i + 1] && NAGYBETU.test(szoTisztit(szavak[i + 1]).szo);

        // Házszám a név után ("Strada Fabricii 51"); évszám a név része ("1 Decembrie 1918")
        if (szam && nev.length && nev.some(n => !/^\d+$/.test(n)) && hazszamE(szo)) {
            hazszam = szo;
            break;
        }

        if (!(nagy || szam || kotoszo || (kisbetuOk && !nev.length && /^[a-zăâîșțşţáéíóöőúüű]{4,}$/i.test(szo)))) break;

        // Egy köznapi szó nem kezdhet nevet
        if (!nev.length && NEM_NEV.test(szo)) break;

        nev.push(kisbetuOk && !nev.length && !nagy ? szo.charAt(0).toUpperCase() + szo.slice(1) : szo);

        // Írásjel a szó végén: itt vége (a rövidítés pontja nem az)
        if (vegJel && vegJel !== "." ) break;
        if (vegJel === "." && !rovidites && !(pont && szo.length <= 2)) break;

    }

    // A végéről a kötőszavak le
    while (nev.length && KOTOSZO.test(nev[nev.length - 1])) nev.pop();

    return { nev: nev.join(" "), hazszam };

}

// "1 dec" eleje-e az "1 decembrie 1918"-nak (szavanként)
function szoElotag(a, b) {
    const x = a.split(" "), y = b.split(" ");
    return x.length <= y.length && x.every((w, i) => y[i].startsWith(w)) && a !== b;
}

// Egységes kulcs két utcanév összevetéséhez ("Strada Viitorului" = "str. viitorului")
function utcaKulcs(u) {
    return kulcs(String(u || "").replace(/^(?:strada|str\.?|bulevardul|b-dul|bd\.?|aleea|al\.|calea|pia[tț]a)\s+/i, ""))
        .replace(/\b(?:general|gen)\b/g, "")
        .replace(/\s+/g, " ").trim();
}

//  Az utcák a szövegben.
//   szoveg:  egy szöveg (cím vagy leírás)
//   hol:     "cim" | "leiras" (a címben említett utca erősebb)
//  -> [{ nev: "Strada Viitorului", tipus: "Strada", alap: "Viitorului", hazszam, hol, kozeli, poz, hu? }]
function utcak(szoveg, hol = "leiras") {

    const s = String(szoveg || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&#160;/g, " ")
        .replace(/\s+/g, " ")
        // "Jókai MórAgenția" – két szó egybeírva (a forrásoldal szövegéből)
        .replace(/([a-zăâîșțşţáéíóöőúüű]{2,})([A-ZĂÂÎȘȚŞŢÁÉÍÓÖŐÚÜŰ][a-zăâîșțşţáéíóöőúüű]{3,})/g, "$1 $2")
        // "Akos.Sunt ideale" – hiányzik a szóköz a pont után
        .replace(/([a-zăâîșțşţáéíóöőúüű]{3,})\.(?=[A-ZĂÂÎȘȚŞŢÁÉÍÓÖŐÚÜŰ][a-zăâîșțşţáéíóöőúüű])/g, "$1. ");

    const ki = [];

    // ---- Román: típus + név
    const roRe = new RegExp(`(?<![\\p{L}\\d])(${RO_ELOTAG})\\s+(?:(${RO_ELOTAG})\\s+)?`, "giu");

    for (const m of s.matchAll(roRe)) {

        const tipusSzo = m[1].replace(/\.$/, "").toLowerCase();
        const masodik = m[2] ? m[2].replace(/\.$/, "").toLowerCase() : null;

        // "strada Aleea Căminului", "strada Al. Centralei": a második típus számít
        let tipusAlap = (RO_TIPUS.find(t => t.re.test(masodik || tipusSzo)) || {}).nev || "Strada";

        // "str. Al. I. Cuza": az "Al." itt keresztnév (Alexandru), nem Aleea
        const utana = s.slice(m.index + m[0].length);
        if ((masodik === "al" || tipusSzo === "al") && /^[A-Z]\.\s/.test(utana)) tipusAlap = "Strada";

        // A "str." után kisbetűvel is jöhet a név ("pe str. crangului")
        const kisbetuOk = /^(?:str|strada|al|aleea|bd|b-dul|bulevardul)$/.test(masodik || tipusSzo);

        const szavak = utana.split(" ").slice(0, 9);
        const { nev, hazszam } = nevOlvas(szavak, kisbetuOk);

        let nevJo = nev;
        // "str. Al. I. Cuza", "str. A.I. Cuza" -> Alexandru Ioan Cuza
        if (/^(?:I\.?\s*)?Cuza$/i.test(nevJo) && ((masodik === "al" || tipusSzo === "al") || /^I\.?\s/.test(nevJo))) nevJo = "Alexandru Ioan Cuza";
        if (/^A\.?\s*I\.?\s*Cuza$/i.test(nevJo)) nevJo = "Alexandru Ioan Cuza";

        if (!nevJo || kulcs(nevJo).length < 3) continue;
        if (NEM_NEV.test(nevJo)) continue;

        const elotte = s.slice(Math.max(0, m.index - 40), m.index);
        ki.push({
            nev: `${tipusAlap} ${nevJo}`,
            tipus: tipusAlap,
            alap: nevJo,
            hazszam,
            hol,
            kozeli: KOZELI_ELOTT.test(elotte.trim()),
            poz: m.index
        });

    }

    // ---- Magyar: név + utótag ("Kós Károly utca 12", "Gábor Áron u. 12", "a Csíki utcában")
    const huRe = new RegExp(`((?:[A-ZÁÉÍÓÖŐÚÜŰ][\\p{L}'’-]*\\.?\\s+){1,4})${HU_UTOTAG}(?![\\p{L}])(?:\\s*(\\d{1,4}[A-Za-z]?)\\b)?`, "gu");

    for (const m of s.matchAll(huRe)) {

        const szavak = m[1].trim().split(/\s+/);
        // A mondat eleji nagybetűs szavak ("Eladó Kós Károly utca...") ne kerüljenek a névbe:
        // a név legfeljebb az utolsó 3 szó, és az eleje nem lehet köznapi szó
        while (szavak.length > 1 && /^(?:Eladó|Kiadó|Eladnám|Kiadnám|Az|A|Egy|Lakás|Ház|Telek|Garzon|Garzonlakás|Ingatlan|Sepsiszentgyörgy|Sepsiszentgyörgyön|Kézdivásárhely|Kézdivásárhelyen|Szentgyörgy|Szentgyörgyön|Brassó|Brassóban|Csíkszereda|Csíkszeredában|Központ|Központban|Belváros|Belvárosban)$/.test(szavak[0])) szavak.shift();
        if (szavak.length > 3) szavak.splice(0, szavak.length - 3);

        const nev = szavak.map(w => w.replace(/[.,]+$/, "")).join(" ");
        if (!nev || kulcs(nev).length < 3 || NEM_NEV.test(nev)) continue;

        const uto = m[0].slice(m[1].length).trim().split(/\s+/)[0].replace(/\.$/, "");
        const t = HU_TIPUS.find(x => x.re.test(uto)) || HU_TIPUS[0];

        const elotte = s.slice(Math.max(0, m.index - 40), m.index);
        ki.push({
            nev: `${nev} ${t.hu}`,
            tipus: t.ro,
            alap: nev,
            hazszam: m[2] && hazszamE(m[2]) ? m[2] : null,
            hol,
            kozeli: KOZELI_ELOTT.test(elotte.trim()),
            poz: m.index,
            hu: true
        });

    }

    // Egy utca egyszer (a házszámos / közvetlen változat nyer); a csonka alak
    // ("1 Dec") a teljesbe olvad ("1 Decembrie 1918")
    const egyedi = new Map();
    ki.sort((a, b) => a.poz - b.poz).forEach(u => {
        let k = utcaKulcs(u.alap);
        if (!k || k.length < 3) return;
        const hosszabb = [...egyedi.keys()].find(x => x !== k && szoElotag(k, x));
        if (hosszabb) k = hosszabb;
        const van = egyedi.get(k);
        if (!van) { egyedi.set(k, u); return; }
        if (!van.hazszam && u.hazszam) van.hazszam = u.hazszam;
        if (van.kozeli && !u.kozeli) van.kozeli = false;
    });

    return [...egyedi.values()];

}

//  Az összes utca egy hirdetésből: a cím előre, aztán a leírás és a forrás szövege.
//  -> legfeljebb `max` utca; a viszonyítási ("aproape de ...") utcák a végén
function hirdetesUtcai(d, max = 4) {

    const lista = [
        ...utcak(d.cim, "cim"),
        ...utcak(d.leiras, "leiras"),
        ...utcak(d.forras_szoveg, "forras")
    ];

    const egyedi = new Map();
    lista.forEach(u => {
        const k = utcaKulcs(u.alap);
        const van = egyedi.get(k);
        if (!van) { egyedi.set(k, { ...u, db: 1 }); return; }
        van.db++;
        if (!van.hazszam && u.hazszam) van.hazszam = u.hazszam;
        if (van.kozeli && !u.kozeli) van.kozeli = false;
    });

    const rang = u => (u.kozeli ? 10 : 0) + (u.hol === "cim" ? 0 : u.hol === "leiras" ? 1 : 2) - Math.min(u.db, 3) * 0.1;

    return [...egyedi.values()].sort((a, b) => rang(a) - rang(b)).slice(0, max);

}

// A kereséshez használható névváltozatok ("Strada Kós Károly", "Kós Károly utca", "Kós Károly")
const HU_RO_NEV = {
    "csiki": "Ciucului", "vasut": "Gării", "allomas": "Gării", "malom": "Morii", "hid": "Podului",
    "temeto": "Cimitirului", "templom": "Bisericii", "iskola": "Școlii", "korhaz": "Spitalului",
    "szabadsag": "Libertății", "kossuth lajos": "Kossuth Lajos", "petofi sandor": "Petőfi Sándor",
    "gabor aron": "Gábor Áron", "kos karoly": "Kós Károly", "jokai mor": "Jókai Mór",
    "fo": "Principală", "piac": "Pieței", "gyar": "Fabricii", "stadion": "Stadionului", "liget": "Parcului",
    "virag": "Florilor", "kert": "Grădinii", "erdo": "Pădurii", "patak": "Pârâului", "uj": "Nouă",
    "rovid": "Scurtă", "hosszu": "Lungă", "kis": "Mică", "nagy": "Mare"
};

function keresoNevek(u) {

    const ki = [];
    const alap = String(u.alap || u.nev || "").trim();

    if (u.hu) {
        const ro = HU_RO_NEV[kulcs(alap)];
        if (ro) ki.push(`${u.tipus} ${ro}`);
        ki.push(`${u.tipus} ${alap}`);
        ki.push(u.nev);
    } else {
        ki.push(u.nev);
        // "Bulevardul Grigore Bălan" -> "Bulevardul General Grigore Bălan" is megtalálja a kereső,
        // de a típus nélküli alak is jöhet (a térképen néha "Strada" nélkül szerepel)
        if (u.tipus === "Strada" && alap.split(" ").length >= 2) ki.push(alap);
    }

    return [...new Set(ki.filter(Boolean))];

}

// ---------- Kerület-említések ----------

//  keruletek: [{ nev, nev_ro, aliasok }] (a város kerületei)
//  -> [{ kerulet, erosseg, hol, szoveg }] – erősség: 3 = a címben, 2 = a leírásban
//     "zona / cartier / negyed" formában vagy a forrásoldal kerület-mezőjében
function keruletLista(keruletek) {

    const lista = [];
    const hivatalos = new Map();          // kulcs -> kerület (a hivatalos nevek)

    (keruletek || []).forEach(k => {
        [k.nev, k.nev_ro].filter(Boolean).forEach(n => {
            const kk = kulcs(n);
            if (kk.length >= 3) hivatalos.set(kk, k.nev);
        });
    });

    (keruletek || []).forEach(k => {
        [k.nev, k.nev_ro].filter(Boolean).forEach(n => {
            const kk = kulcs(n);
            if (kk.length >= 3) lista.push({ nev: k.nev, kulcs: kk, hivatalos: true });
        });
        String(k.aliasok || "").split(",").map(a => kulcs(a)).filter(a => a.length >= 3).forEach(a => {
            // Egy másik kerület hivatalos neve nem lehet ennek az aliasa
            if (hivatalos.has(a) && hivatalos.get(a) !== k.nev) return;
            lista.push({ nev: k.nev, kulcs: a, hivatalos: false });
        });
    });

    // Hosszabb előbb ("ultracentral" előbb, mint "central"); a hivatalos előbb, mint az alias
    return lista.sort((a, b) => b.kulcs.length - a.kulcs.length || (b.hivatalos - a.hivatalos));

}

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A "zona centrală", "ultracentral", "semicentral" stb. a kerületek neveire
function kozpontTipus(lista) {
    const van = k => lista.find(x => x.kulcs === k);
    return {
        central: van("central") || van("centru") || van("kozpont"),
        semicentral: van("semicentral"),
        ultracentral: van("ultracentral") || van("central") || van("kozpont")
    };
}

function keruletEmlitesek(szoveg, keruletek, hol = "leiras") {

    const lista = Array.isArray(keruletek) && keruletek.length && keruletek[0].kulcs ? keruletek : keruletLista(keruletek);
    if (!lista.length || !szoveg) return [];

    const t = " " + kulcs(String(szoveg).replace(/<[^>]+>/g, " ")) + " ";
    const ki = [];
    const kp = kozpontTipus(lista);

    const add = (k, erosseg, minta) => { if (k) ki.push({ kerulet: k.nev, erosseg, hol, szoveg: minta }); };

    // "zona centrală / centrala / centru", "zona semicentrală", "zona ultracentrală" –
    // de nem "aleea centralei" (utca) és nem "centrala termica" (fűtés)
    for (const m of t.matchAll(/(?:zona|zone|cartier(?:ul)?|zon[aă]) (ultra ?central[aă]?|ultracentral[aă]?|semi ?central[aă]?|semicentral[aă]?|central[aă]?|centru(?:l|lui)?|centrului)(?= )/g)) {
        const w = m[1].replace(/\s+/g, "");
        if (/^ultra/.test(w)) add(kp.ultracentral, hol === "cim" ? 3 : 2, m[0]);
        else if (/^semi/.test(w)) add(kp.semicentral, hol === "cim" ? 3 : 2, m[0]);
        else add(kp.central, hol === "cim" ? 3 : 2, m[0]);
    }

    // Magyarul: "a központban", "belvárosi", "központi"
    if (/ (?:kozpontban|kozponti|belvaros(?:ban|i)?|a kozpont kozeleben) /.test(t) && kp.central) add(kp.central, hol === "cim" ? 3 : 1, "központ");

    for (const k of lista) {

        if (["central", "centru", "kozpont", "semicentral", "ultracentral"].includes(k.kulcs)) continue;

        const x = reEsc(k.kulcs);

        // "zona X", "cartierul X", "in zona X", "X negyed", "X lakótelep"; "zona Ciuc" (csonka) is
        const re1 = new RegExp(` (?:zona|zone|zon[aă]|cartier(?:ul)?|cartierului|in cartierul|lakotelep|negyed) (?:de |a |al )?${x}(?: |$)`);
        const re2 = new RegExp(` ${x} (?:negyed|negyedben|lakotelep|lakotelepen|varosresz|varosreszben|kornyeken|zona|cartier)`);
        // Csonka: "zona Ciuc" -> Ciucului (legalább 4 betű, és csak ha egyértelmű)
        const elotag = k.kulcs.length >= 6 ? new RegExp(` (?:zona|cartier(?:ul)?) (${x.slice(0, Math.max(4, k.kulcs.length - 4))}[a-z]*) `) : null;

        if (re1.test(t) || re2.test(t)) {
            add(k, hol === "cim" ? 3 : 2, k.kulcs);
            continue;
        }

        if (elotag) {
            const m = t.match(elotag);
            if (m && k.kulcs.startsWith(m[1]) && lista.filter(o => o.kulcs.startsWith(m[1])).every(o => o.nev === k.nev)) {
                add(k, hol === "cim" ? 3 : 2, m[0].trim());
                continue;
            }
        }

        // A címben puszta névként is (vesszővel, kötőjellel, "în X" formában):
        // "..., Lenin, Sfantu Gheorghe", "Apartament cu 3 camere în Gării"
        if (hol === "cim" && k.hivatalos) {
            const re3 = new RegExp(`(?:^| )(?:in |în )?${x}(?: |$)`);
            if (re3.test(t) && !new RegExp(` (?:strada|str|aleea|al|bulevardul|bd|b dul|calea|piata) (?:[a-z]+ ){0,2}${x} `).test(t)) add(k, 3, k.kulcs);
        }

    }

    // Egy kerület egyszer, a legerősebb említéssel
    const legjobb = new Map();
    ki.forEach(e => {
        const v = legjobb.get(e.kerulet);
        if (!v || e.erosseg > v.erosseg) legjobb.set(e.kerulet, e);
    });

    return [...legjobb.values()].sort((a, b) => b.erosseg - a.erosseg);

}

//  A hirdetés kerülete a szövegek és a forrásoldal kerület-mezője szerint.
//   d: { cim, leiras, forras_szoveg, forras_kerulet }
//  -> { kerulet, erosseg, honnan } vagy null. Ha a cím és a leírás mást mond, a cím nyer.
function allitottKerulet(d, keruletek) {

    const lista = keruletLista(keruletek);
    if (!lista.length) return null;

    const cim = keruletEmlitesek(d.cim, lista, "cim");
    const leiras = keruletEmlitesek([d.leiras, d.forras_szoveg].filter(Boolean).join("\n"), lista, "leiras");

    // A forrásoldal kerület-mezője: a hivatalos név erősebb, mint az alias
    let forras = null;
    if (d.forras_kerulet) {
        const fk = kulcs(d.forras_kerulet);
        const talalat = lista.find(k => k.kulcs === fk);
        if (talalat) forras = { kerulet: talalat.nev, erosseg: talalat.hivatalos ? 2 : 1, hol: "forras", szoveg: d.forras_kerulet };
    }

    // Ha a cím egy kerületet említ, az dönt
    if (cim.length === 1) return { ...cim[0], honnan: "cim" };
    if (cim.length > 1) {
        // Több kerület a címben: ami a leírásban / a forrásban is szerepel
        const meg = cim.find(c => leiras.some(l => l.kerulet === c.kerulet) || (forras && forras.kerulet === c.kerulet));
        return meg ? { ...meg, honnan: "cim" } : null;
    }

    // A leírás "zona X" említése és a forrás mezője
    const leirasEros = leiras.filter(l => l.erosseg >= 2);
    if (forras && forras.erosseg >= 2) {
        if (!leirasEros.length || leirasEros.some(l => l.kerulet === forras.kerulet)) return { ...forras, honnan: "forras" };
        // A leírás egyértelműen mást mond
        if (leirasEros.length === 1) return { ...leirasEros[0], honnan: "leiras" };
        return { ...forras, honnan: "forras" };
    }

    if (leirasEros.length === 1) return { ...leirasEros[0], honnan: "leiras" };
    if (forras) return { ...forras, honnan: "forras" };

    return null;

}

//  Az összes (erős) jel a hirdetés kerületére – a hely-ellenőrzésnek
//  -> [{ kerulet, honnan: "cim" | "leiras" | "forras", erosseg }]
//     cím: minden említés; leírás: "zona / cartier / negyed" formában;
//     forrás: a forrásoldal kerület-mezője (csak a kerület hivatalos neve)
function keruletJelek(d, keruletek) {

    const lista = keruletLista(keruletek);
    if (!lista.length) return [];

    const ki = [];

    keruletEmlitesek(d.cim, lista, "cim").forEach(e => ki.push({ kerulet: e.kerulet, honnan: "cim", erosseg: e.erosseg }));
    keruletEmlitesek([d.leiras, d.forras_szoveg].filter(Boolean).join("\n"), lista, "leiras")
        .filter(e => e.erosseg >= 2)
        .forEach(e => ki.push({ kerulet: e.kerulet, honnan: "leiras", erosseg: e.erosseg }));

    if (d.forras_kerulet) {
        const fk = kulcs(d.forras_kerulet);
        const t = lista.find(k => k.kulcs === fk && k.hivatalos);
        if (t) ki.push({ kerulet: t.nev, honnan: "forras", erosseg: 2 });
    }

    return ki;

}

module.exports = { utcak, hirdetesUtcai, keresoNevek, utcaKulcs, keruletLista, keruletEmlitesek, allitottKerulet, keruletJelek, kulcs, ekezetNelkul };
