// ============================================================
//  Reklámfelület bérlése: ügyfél → díjbekérő + fizetési link → fizetés →
//  számla → ANAF (a szerződés nem kötelező, de ajánlott)
//
//  Nem automatikus: a hirdető megkeres (pl. e-mailben), te beállítod a
//  hirdetést (ügyfél, havi ár, időszak), és a „Díjbekérő + fizetési link”
//  gombbal elkészül a díjbekérő a teljes időszakra és egy fizetési oldal:
//  kártyával (Stripe) vagy átutalással fizethet, és – ha bekapcsolod – ott
//  a szerződést is elfogadhatja (időpont + IP). A fizetés után ugyanolyan
//  számla készül, mint a csomagoknál (szamlazo.js), és megy az ANAF-hoz.
//
//  A reklám anyagát (kép, telefonos kép, hova vigyen) a hirdető maga is
//  feltöltheti ugyanezen az oldalon – vagy elküldi, és az admin tölti fel.
//  Amint ki van fizetve és van képe, a reklám magától megjelenik (a
//  kezdő naptól); ha fizetett, de még nincs kép, levélben kérjük.
//
//  Jogilag: cégek között a szolgáltatási szerződésnek nincs kötelező
//  alakja (Codul civil art. 1178) – az írásos, elfogadott megrendelés a
//  bizonyíték. A reklám tartalmáért a hirdető felel (Legea 148/2000).
// ============================================================

const crypto = require("crypto");
const db = require("../db/database");
const pu = require("./penzugy");
const dok = require("./dokumentum");
const oldalAdatok = require("./oldalAdatok");

function hibaKod(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

const esc = dok.esc;

// A kampány hónapjai (legalább 1; 30,4 naponként)
function honapok(kezdet, vege) {
    if (!kezdet || !vege) return 1;
    const k = new Date(kezdet + "T00:00:00Z"), v = new Date(vege + "T00:00:00Z");
    const nap = Math.round((v - k) / 86400000) + 1;
    return Math.max(1, Math.round(nap / 30.4));
}

async function reklamAdat(id) {
    const r = await db.query(`
        SELECT r.id, r.nev, r.hirdeto, r.cel_url, r.helyek, r.kezdet::text AS kezdet, r.vege::text AS vege, r.ar, r.penznem,
               r.szamlazas, r.fizetes_utan, COALESCE(r.szerzodes_kell, true) AS szerzodes_kell, r.ugyfel_id, r.szerzodes_szam, r.szerzodes_token, r.szerzodes_kuldve, r.szerzodes_elfogadva,
               r.szerzodes_ip, r.elofizetes_id
        FROM reklamok r WHERE r.id = $1`, [Number(id) || 0]);
    return r.rows[0] || null;
}

async function ugyfelAdat(id) {
    if (!id) return null;
    const r = await db.query(`SELECT id, tipus, nev, cui, reg_com, cim, varos, megye, COALESCE(orszag, 'RO') AS orszag,
                                     COALESCE(afa_alany, false) AS afa_alany, email, telefon FROM penzugy_ugyfelek WHERE id = $1`, [id]);
    return r.rows[0] || null;
}

// A hirdetés díjbekérői / számlái és állapota (az admin szerkesztőnek)
async function allapot(id) {
    const r = await reklamAdat(id);
    if (!r) throw hibaKod("not_found");
    const sz = await db.query(`
        SELECT id, sorszam, tipus, statusz, brutto, penznem, idoszak_tol::text AS tol, idoszak_ig::text AS ig, kulso_szam, fizetve::text AS fizetve
        FROM penzugy_szamlak WHERE reklam_id = $1 ORDER BY kiallitva, id`, [r.id]);
    const ugyfel = await ugyfelAdat(r.ugyfel_id);
    const hianyzik = [], figyel = [];
    if (!r.ugyfel_id) hianyzik.push("ugyfel");
    else {
        // e-mail nélkül is megy: a szerződés linkjét / a díjbekérőt kézzel adod át
        if (!ugyfel.email) figyel.push("ugyfel_email");
        if (!ugyfel.cim || !ugyfel.varos || (ugyfel.orszag === "RO" && !ugyfel.megye)) hianyzik.push("ugyfel_cim");
    }
    if (!(Number(r.ar) > 0)) hianyzik.push("ar");
    if (!r.kezdet) hianyzik.push("kezdet");
    return {
        reklam: { ...r, szerzodes_token: undefined },
        ugyfel,
        honapok: honapok(r.kezdet, r.vege),
        bizonylatok: sz.rows.map(x => ({ ...x, brutto: Number(x.brutto) })),
        fizetve: sz.rows.some(x => x.tipus === "dijbekero" && x.statusz === "fizetve"),
        link: r.szerzodes_token ? `/reklam-szerzodes/${r.szerzodes_token}` : null,
        hianyzik,
        figyel
    };
}

async function kovetkezoSzam() {
    const ev = new Date().getFullYear();
    const r = await db.query(`SELECT COUNT(*)::int AS n FROM reklamok WHERE szerzodes_szam LIKE $1`, [`RK-${ev}-%`]);
    return `RK-${ev}-${String(r.rows[0].n + 1).padStart(4, "0")}`;
}

// „Díjbekérő + fizetési link” – a hirdető megkeresett (pl. e-mailben), az
// admin beállította a hirdetést; ez elkészíti a díjbekérőt a teljes
// időszakra, és a fizetési oldal linkjét (kártya / átutalás, és ha kell,
// a szerződés elfogadása). Kifizetve → ugyanolyan számla, mint a csomagoknál.
async function kuld(id, alapCim) {
    const a = await allapot(id);
    if (a.hianyzik.length) throw Object.assign(hibaKod("ad_billing_missing"), { reszlet: a.hianyzik.join(",") });
    const r = a.reklam;
    const be = await pu.beallitas();
    const penznem = ["RON", "EUR"].includes(r.penznem) ? r.penznem : "RON";
    const ho = honapok(r.kezdet, r.vege);
    const nev = `Spațiu publicitar IngatlanPro – ${r.nev}`;
    const tol = r.kezdet;
    const ig = r.vege || pu.napHozzaad(pu.honapHozzaad(tol, 1), -1);

    const tok = (await db.query("SELECT szerzodes_token FROM reklamok WHERE id = $1", [r.id])).rows[0].szerzodes_token
        || crypto.randomBytes(24).toString("hex");
    const szam = r.szerzodes_kell !== false ? (r.szerzodes_szam || await kovetkezoSzam()) : r.szerzodes_szam;
    await db.query(`UPDATE reklamok SET szerzodes_szam = $2, szerzodes_token = $3, szerzodes_kuldve = NOW(), updated_at = NOW() WHERE id = $1`, [r.id, szam, tok]);

    // A nyitott díjbekérő marad (újraküldés) – ha közben az időszak változott,
    // a régit sztornózzuk és újat készítünk; a már kifizetett időszakra nem kell új
    let dijbekero = a.bizonylatok.find(x => x.tipus === "dijbekero" && (x.statusz === "kiallitva" || x.statusz === "piszkozat"));
    if (dijbekero && (dijbekero.tol !== tol || dijbekero.ig !== ig)) {
        await pu.szamlaAllapotValt(dijbekero.id, { statusz: "sztorno" });
        dijbekero = null;
    }
    if (!dijbekero) {
        if (a.bizonylatok.some(x => x.tipus === "dijbekero" && x.statusz === "fizetve" && x.tol === tol && x.ig === ig)) throw hibaKod("ad_already_paid");
        const dbId = await pu.szamlaMent(null, {
            tipus: "dijbekero",
            ugyfel_id: r.ugyfel_id,
            reklam_id: r.id,
            kiallitva: pu.ma(),
            esedekes: tol > pu.ma() ? tol : pu.napHozzaad(pu.ma(), be.fizetesi_hatarido || 14),
            idoszak_tol: tol,
            idoszak_ig: ig,
            penznem,
            megjegyzes: szam ? `Contract / Szerződés: ${szam}` : null,
            tetelek: [{
                megnevezes: `Reklámfelület – ${r.nev} (${tol} – ${ig})`,
                megnevezes_ro: `${nev} (${tol} – ${ig})`,
                megnevezes_en: `Ad space – ${r.nev} (${tol} – ${ig})`,
                kategoria: "reklamfelulet",
                mennyiseg: ho,
                egysegar: Number(r.ar)
            }]
        });
        dijbekero = await pu.szamla(dbId);
    } else {
        dijbekero = await pu.szamla(dijbekero.id);
    }

    // e-mail a hirdetőnek (ha van címe és be van állítva a levelezés) – különben a linket te küldöd el
    const mail = require("./mail");
    let emailezve = false;
    const link = `${(alapCim || mail.oldalCim()).replace(/\/+$/, "")}/reklam-szerzodes/${tok}`;
    if (mail.elerheto() && a.ugyfel.email) {
        const t = mail.sablon({
            cim: `Plată spațiu publicitar / Reklámfelület díja – ${dijbekero.sorszam}`,
            sorok: [
                `Vă mulțumim! Spațiul publicitar „${r.nev}” (${tol} – ${ig}): ${dijbekero.brutto} ${penznem}. Plata se poate face online cu cardul sau prin transfer bancar la linkul de mai jos${r.szerzodes_kell !== false ? ", unde găsiți și contractul" : ""}. Tot acolo puteți încărca imaginea reclamei – după plată reclama apare automat. Factura o primiți pe e-mail.`,
                `Köszönjük! A(z) „${r.nev}” reklámfelület (${tol} – ${ig}): ${dijbekero.brutto} ${penznem}. Az alábbi linken kártyával vagy átutalással fizethet${r.szerzodes_kell !== false ? ", és ott a szerződés is" : ""}. Ugyanott feltöltheti a reklám képét – a fizetés után a reklám magától megjelenik. A számlát e-mailben küldjük.`,
                be.iban ? `IBAN: ${be.iban}${be.bank ? " (" + be.bank + ")" : ""} – detalii plată / közlemény: ${dijbekero.sorszam}` : ""
            ].filter(Boolean),
            gomb: "Plătește / Fizetés",
            link,
            lablec: "IngatlanPro – spațiu publicitar / reklámfelület."
        });
        emailezve = await mail.kuld({ to: a.ugyfel.email, subject: `Plată spațiu publicitar / Reklámfelület – ${dijbekero.sorszam}`, html: t.html, text: t.text });
        if (emailezve) await db.query("UPDATE penzugy_szamlak SET emailezve = NOW() WHERE id = $1", [dijbekero.id]);
    }

    return { szerzodes_szam: szam, link: `/reklam-szerzodes/${tok}`, dijbekero: { id: dijbekero.id, sorszam: dijbekero.sorszam, brutto: dijbekero.brutto }, emailezve };
}

// ---------- a szerződés szövege ----------

const T = {
    cim: { ro: "CONTRACT DE PRESTĂRI SERVICII DE PUBLICITATE", hu: "REKLÁMSZOLGÁLTATÁSI SZERZŐDÉS", en: "ADVERTISING SERVICES CONTRACT" },
    nr: { ro: "Nr.", hu: "Szám", en: "No." },
    din: { ro: "din", hu: "kelte", en: "dated" },
    prestator: { ro: "Prestator", hu: "Szolgáltató", en: "Provider" },
    beneficiar: { ro: "Beneficiar", hu: "Megrendelő", en: "Client" },
    elfogadva: { ro: "ACCEPTAT ELECTRONIC", hu: "ELEKTRONIKUSAN ELFOGADVA", en: "ACCEPTED ELECTRONICALLY" },
    elfogadGomb: { ro: "Accept contractul", hu: "Elfogadom a szerződést", en: "I accept the contract" },
    elfogadSzoveg: {
        ro: "Prin apăsarea butonului accept termenii contractului în numele beneficiarului. Data, ora și adresa IP se înregistrează.",
        hu: "A gombbal a megrendelő nevében elfogadom a szerződést. Az időpont és az IP-cím rögzül.",
        en: "By clicking I accept the contract on behalf of the client. Date, time and IP address are recorded."
    },
    plata: { ro: "De plată", hu: "Fizetendő", en: "Amount due" },
    cimFizetes: { ro: "PLATĂ SPAȚIU PUBLICITAR", hu: "REKLÁMFELÜLET DÍJA", en: "AD SPACE PAYMENT" },
    proforma: { ro: "Factură proformă", hu: "Díjbekérő", en: "Pro forma invoice" },
    hatarido: { ro: "scadență", hu: "határidő", en: "due" },
    kartya: { ro: "Plătește cu cardul", hu: "Fizetés kártyával", en: "Pay by card" },
    kartyaInfo: { ro: "Plată securizată (Stripe). Factura se emite automat după plată.", hu: "Biztonságos fizetés (Stripe). A számla a fizetés után magától elkészül.", en: "Secure payment (Stripe). The invoice is issued automatically after payment." },
    atutalas: { ro: "Sau prin transfer bancar", hu: "Vagy átutalással", en: "Or by bank transfer" },
    kozlemeny: { ro: "Detalii plată", hu: "Közlemény", en: "Reference" },
    fizetve: { ro: "Plătit – mulțumim!", hu: "Kifizetve – köszönjük!", en: "Paid – thank you!" },
    szamla: { ro: "factura", hu: "számla", en: "invoice" },
    anyagCim: { ro: "Materialul reclamei", hu: "A reklám anyaga", en: "Your ad creative" },
    anyagInfo: {
        ro: "Încărcați imaginea reclamei și linkul la care trimite. După plată, reclama apare automat de la data de început – nu trebuie să ne trimiteți nimic altceva.",
        hu: "Töltsd fel a reklám képét és add meg, hova vigyen a kattintás. A fizetés után a reklám a kezdő naptól magától megjelenik – mást nem kell küldened.",
        en: "Upload your ad image and the link it should open. After payment the ad appears automatically from the start date – nothing else to send."
    },
    anyagNincs: { ro: "Încă nu există imagine.", hu: "Még nincs kép.", en: "No image yet." },
    anyagFut: { ro: "Reclama dvs. este afișată acum.", hu: "A reklámod most is megjelenik.", en: "Your ad is live now." },
    anyagFizetesUtan: { ro: "Imaginea este pregătită – reclama apare automat după plată.", hu: "A kép megvan – a reklám a fizetés után magától megjelenik.", en: "The image is ready – the ad goes live automatically after payment." },
    anyagKezdet: { ro: "Imaginea este pregătită – reclama apare de la", hu: "A kép megvan – a reklám ettől a naptól jelenik meg:", en: "The image is ready – the ad appears from" },
    anyagKep: { ro: "Imagine (desktop)", hu: "Kép (számítógép)", en: "Image (desktop)" },
    anyagMobil: { ro: "Imagine pentru telefon (opțional)", hu: "Kép telefonra (nem kötelező)", en: "Image for phones (optional)" },
    anyagUrl: { ro: "Link (unde trimite reclama)", hu: "Link (hova vigyen a reklám)", en: "Link (where the ad leads)" },
    anyagAlt: { ro: "Text scurt (pentru cititoare de ecran)", hu: "Rövid szöveg (felolvasó programoknak)", en: "Short text (for screen readers)" },
    anyagMeret: { ro: "Dimensiuni recomandate", hu: "Ajánlott méretek", en: "Recommended sizes" },
    anyagMent: { ro: "Salvează materialul", hu: "Anyag mentése", en: "Save creative" },
    anyagKesz: { ro: "Salvat – mulțumim!", hu: "Elmentve – köszönjük!", en: "Saved – thank you!" },
    anyagHibaMeret: { ro: "Imaginea este prea mare (max. 3 MB).", hu: "A kép túl nagy (legfeljebb 3 MB).", en: "The image is too large (max 3 MB)." },
    anyagHibaTipus: { ro: "Format acceptat: JPG, PNG, WebP, GIF.", hu: "Elfogadott formátum: JPG, PNG, WebP, GIF.", en: "Accepted formats: JPG, PNG, WebP, GIF." },
    anyagKell: { ro: "Alegeți o imagine.", hu: "Válassz egy képet.", en: "Choose an image." }
};

// A reklámhelyek formája és mérete (mint a weboldalon: public/js/core/ads.js)
const FORMA_MERET = { billboard: [970, 250], csik: [970, 90], leaderboard: [728, 90], negyzet: [300, 250], allo: [300, 600] };

function cikkek(r, u, ugyfel, ar, ho, penznem, helyekSzoveg) {
    const per = `${r.kezdet}${r.vege ? " – " + r.vege : ""}`;
    return [
        {
            ro: `<b>Art. 1. Obiectul contractului.</b> Prestatorul afișează pe site-ul IngatlanPro reclama „${esc(r.nev)}” a beneficiarului${r.cel_url ? `, cu trimitere la ${esc(r.cel_url)}` : ""}, în pozițiile: ${esc(helyekSzoveg)}, în perioada ${esc(per)}.`,
            hu: `<b>1. A szerződés tárgya.</b> A Szolgáltató az IngatlanPro weboldalon megjeleníti a Megrendelő „${esc(r.nev)}” reklámját${r.cel_url ? ` (hivatkozás: ${esc(r.cel_url)})` : ""} a következő helyeken: ${esc(helyekSzoveg)}, ${esc(per)} között.`,
            en: `<b>1. Subject.</b> The Provider displays the Client's ad “${esc(r.nev)}”${r.cel_url ? ` (linking to ${esc(r.cel_url)})` : ""} on the IngatlanPro website in: ${esc(helyekSzoveg)}, during ${esc(per)}.`
        },
        {
            ro: `<b>Art. 2. Prețul.</b> ${esc(String(ar))} ${penznem} / lună${ho > 1 ? `, ${ho} luni` : ""}${u.afa ? " + TVA" : " (prestatorul nu este plătitor de TVA)"}. Facturarea: integral, în avans, pe baza facturii proforme.`,
            hu: `<b>2. Díj.</b> ${esc(String(ar))} ${penznem} / hó${ho > 1 ? `, ${ho} hónap` : ""}${u.afa ? " + ÁFA" : " (a Szolgáltató nem ÁFA-alany)"}. Számlázás: egyben, előre, díjbekérő alapján.`,
            en: `<b>2. Price.</b> ${esc(String(ar))} ${penznem} / month${ho > 1 ? `, ${ho} months` : ""}${u.afa ? " + VAT" : " (the Provider is not VAT registered)"}. Billing: in full in advance, based on a pro forma invoice.`
        },
        {
            ro: `<b>Art. 3. Plata și afișarea.</b> Plata se face prin transfer bancar sau card, în termenul din factura proformă. ${r.fizetes_utan ? "Reclama este afișată după încasarea plății." : "Reclama este afișată de la data de început."} După plată se emite factura fiscală, transmisă și în sistemul RO e-Factura.`,
            hu: `<b>3. Fizetés és megjelenés.</b> A fizetés átutalással vagy kártyával történik a díjbekérőn szereplő határidőig. ${r.fizetes_utan ? "A reklám a befizetés után jelenik meg." : "A reklám a kezdő naptól jelenik meg."} A befizetés után a Szolgáltató kiállítja a számlát, amely az RO e-Factura rendszerbe is bekerül.`,
            en: `<b>3. Payment and display.</b> Payment by bank transfer or card by the pro forma due date. ${r.fizetes_utan ? "The ad is shown after payment is received." : "The ad is shown from the start date."} After payment the tax invoice is issued and also sent to RO e-Factura.`
        },
        {
            ro: `<b>Art. 4. Conținutul reclamei.</b> Beneficiarul răspunde pentru conținutul reclamei și al paginii la care trimite (Legea nr. 148/2000 privind publicitatea, drepturi de autor, date personale). Prestatorul poate refuza sau retrage o reclamă ilegală, înșelătoare sau care contravine bunelor moravuri, cu restituirea sumei pentru perioada neafișată.`,
            hu: `<b>4. A reklám tartalma.</b> A reklám és a hivatkozott oldal tartalmáért a Megrendelő felel (Legea 148/2000 a reklámról, szerzői jog, személyes adatok). A Szolgáltató a jogszabályba ütköző, megtévesztő vagy erkölcsbe ütköző reklámot elutasíthatja vagy leveheti, a meg nem jelent időszak díjának visszatérítésével.`,
            en: `<b>4. Ad content.</b> The Client is responsible for the ad and the linked page (Law 148/2000 on advertising, copyright, personal data). The Provider may refuse or remove an unlawful, misleading or indecent ad, refunding the unused period.`
        },
        {
            ro: `<b>Art. 5. Statistici și disponibilitate.</b> Prestatorul pune la dispoziție, la cerere, numărul de afișări și clicuri (orientativ). Întreruperile tehnice de scurtă durată nu dau dreptul la despăgubiri; o întrerupere de peste 48 de ore se compensează prin prelungirea afișării.`,
            hu: `<b>5. Statisztika, elérhetőség.</b> A Szolgáltató kérésre tájékoztat a megjelenések és kattintások számáról (tájékoztató jellegű). A rövid technikai kimaradás nem ad alapot kártérítésre; a 48 óránál hosszabb kimaradást a megjelenés meghosszabbításával pótolja.`,
            en: `<b>5. Statistics and availability.</b> On request the Provider reports impressions and clicks (indicative). Short technical outages give no right to compensation; an outage over 48 hours is compensated by extending the display.`
        },
        {
            ro: `<b>Art. 6. Încetarea.</b> Contractul încetează la sfârșitul perioadei. Oricare parte îl poate denunța cu 15 zile preaviz scris (e-mail); sumele plătite pentru perioada neprestată se restituie.`,
            hu: `<b>6. Megszűnés.</b> A szerződés az időszak végével megszűnik. Bármelyik fél 15 napos írásbeli (e-mailes) felmondással megszüntetheti; a teljesítetlen időszakra fizetett díjat a Szolgáltató visszatéríti.`,
            en: `<b>6. Termination.</b> The contract ends at the end of the period. Either party may terminate with 15 days' written notice (e-mail); amounts paid for the unused period are refunded.`
        },
        {
            ro: `<b>Art. 7. Date personale.</b> Datele de contact se prelucrează doar pentru executarea contractului și obligațiile legale (Regulamentul UE 2016/679), conform politicii de confidențialitate a site-ului.`,
            hu: `<b>7. Személyes adatok.</b> A kapcsolattartási adatokat csak a szerződés teljesítéséhez és a jogi kötelezettségekhez kezeljük (GDPR – EU 2016/679), a weboldal adatvédelmi tájékoztatója szerint.`,
            en: `<b>7. Personal data.</b> Contact data are processed only to perform the contract and meet legal obligations (GDPR – EU 2016/679), per the website's privacy policy.`
        },
        {
            ro: `<b>Art. 8. Dispoziții finale.</b> Contractul este guvernat de legea română; litigiile se soluționează pe cale amiabilă, iar în lipsa acordului de instanțele de la sediul prestatorului. Contractul se încheie în formă electronică, prin acceptarea online a beneficiarului.`,
            hu: `<b>8. Záró rendelkezések.</b> A szerződésre a román jog irányadó; a vitákat a felek békésen rendezik, ennek hiányában a Szolgáltató székhelye szerinti bíróság dönt. A szerződés elektronikus formában, a Megrendelő online elfogadásával jön létre.`,
            en: `<b>8. Final provisions.</b> Romanian law applies; disputes are settled amicably, failing which by the courts at the Provider's seat. The contract is concluded electronically by the Client's online acceptance.`
        }
    ];
}

const HELY_NEV = {
    home_top: "pagina principală (sus)", home: "pagina principală", list_top: "lista de anunțuri (sus)", feed: "lista de anunțuri",
    feed_wide: "lista de anunțuri (lat)", sidebar: "bara laterală", map: "harta", listing_side: "pagina anunțului (lateral)",
    listing: "pagina anunțului", valuation_side: "evaluator (lateral)", valuation: "evaluator", market_top: "analiză de piață (sus)",
    market: "analiză de piață", agencies: "agenții", requests: "cereri"
};

// A hirdető oldala (nyilvános – a tokennel – vagy az adminnak): fölül a
// fizetés (kártya / átutalás), alatta – ha kell – a szerződés elfogadással
async function html(r, o = {}) {
    const ford = o.ford || "";
    const L = k => dok.ket(T[k], ford);
    const TX = k => dok.ket(T[k], ford).replace(/<[^>]+>/g, "");
    const u = await oldalAdatok.nyilvanos();
    const be = await pu.beallitas();
    const ugyfel = await ugyfelAdat(r.ugyfel_id) || {};
    const ho = honapok(r.kezdet, r.vege);
    const penznem = r.penznem || "RON";
    const helyek = (Array.isArray(r.helyek) ? r.helyek : []).map(h => HELY_NEV[h] || h).join(", ") || "–";
    const szerzodes = r.szerzodes_kell !== false;
    const sz = await db.query(`
        SELECT d.id, d.sorszam, d.brutto, d.penznem, d.statusz, d.esedekes::text AS esedekes,
               (SELECT x.sorszam FROM penzugy_szamlak x WHERE x.dijbekero_id = d.id AND x.tipus = 'szamla' AND x.statusz <> 'sztorno' LIMIT 1) AS szamla
        FROM penzugy_szamlak d WHERE d.reklam_id = $1 AND d.tipus = 'dijbekero' AND d.statusz <> 'sztorno' ORDER BY d.kiallitva, d.id`, [r.id]);
    const nyitott = sz.rows.find(x => x.statusz === "kiallitva");
    const fizetett = sz.rows.filter(x => x.statusz === "fizetve");

    // ---- a reklám anyaga (a hirdető maga tölti fel) ----
    const reklam = require("./reklam");
    const kepInfo = (await db.query("SELECT kep_mime, kep_w, kep_h, (kep_mobil IS NOT NULL) AS van_mobil, cel_url, alt, EXTRACT(EPOCH FROM updated_at)::bigint AS v FROM reklamok WHERE id = $1", [r.id])).rows[0] || {};
    const formak = [...new Set((Array.isArray(r.helyek) ? r.helyek : []).map(h => reklam.HELYEK[h]).filter(Boolean))];
    const ma = pu.ma();
    const anyagAllapot = !kepInfo.kep_mime ? L("anyagNincs")
        : fizetett.length ? ((!r.kezdet || r.kezdet <= ma) ? `✓ ${L("anyagFut")}` : `${L("anyagKezdet")} ${esc(r.kezdet)}`)
        : r.fizetes_utan ? L("anyagFizetesUtan") : `✓ ${L("anyagFut")}`;
    const anyag = o.elfogadhato ? `
  <div class="anyag" id="anyag">
    <h2>${L("anyagCim")}</h2>
    <p class="kicsi">${dok.ket(T.anyagInfo, ford)}</p>
    <div class="anyagSor">
      <div class="anyagKep" id="anyagPrev">${kepInfo.kep_mime ? `<img src="/api/reklam/${r.id}/kep?v=${kepInfo.v}" alt="">` : `<span>${L("anyagNincs")}</span>`}</div>
      <div class="anyagAll"><b id="anyagAllapot">${anyagAllapot}</b>
        ${formak.length ? `<div class="kicsi">${L("anyagMeret")}: ${formak.map(fm => { const m = FORMA_MERET[fm] || [970, 250]; return `${m[0] * 2} × ${m[1] * 2} px`; }).join(", ")}</div>` : ""}
      </div>
    </div>
    <label class="mezo">${L("anyagKep")}<input type="file" id="anyagKep" accept="image/jpeg,image/png,image/webp,image/gif"></label>
    <label class="mezo">${L("anyagMobil")}<input type="file" id="anyagMobil" accept="image/jpeg,image/png,image/webp,image/gif"></label>
    <label class="mezo">${L("anyagUrl")}<input type="url" id="anyagUrl" maxlength="500" placeholder="https://" value="${esc(kepInfo.cel_url || r.cel_url || "")}"></label>
    <label class="mezo">${L("anyagAlt")}<input type="text" id="anyagAlt" maxlength="200" value="${esc(kepInfo.alt || "")}"></label>
    <button type="button" class="gomb" id="anyagGomb">${L("anyagMent")}</button>
    <div id="anyagUzenet" class="kicsi" aria-live="polite"></div>
  </div>` : "";
    const online = o.elfogadhato && nyitott && Number(nyitott.brutto) > 0
        ? await require("./fizetes").allapot().then(a => a.elerheto).catch(() => false) : false;

    const fel = (cim, f) => `
      <div class="fel">
        <h3>${L(cim)}</h3>
        <div class="nev">${esc(f.nev || "–")}</div>
        ${f.cui ? `<div>CIF: ${esc(f.cui)}</div>` : ""}${f.reg ? `<div>Reg. Com.: ${esc(f.reg)}</div>` : ""}
        ${f.cim ? `<div>${esc(f.cim)}</div>` : ""}${f.email ? `<div>${esc(f.email)}</div>` : ""}
      </div>`;
    const felek = `
  <div class="felek">
    ${fel("prestator", { nev: u.nev, cui: u.adoszam, reg: u.cegjegyzekszam, cim: u.cim, email: u.email })}
    ${fel("beneficiar", { nev: ugyfel.nev, cui: ugyfel.tipus !== "maganszemely" ? ugyfel.cui : "", reg: ugyfel.reg_com, cim: [ugyfel.cim, ugyfel.varos].filter(Boolean).join(", "), email: ugyfel.email })}
  </div>`;

    // ---- fizetés ----
    const fizetes = nyitott ? `
  <div class="fizetes">
    <h2>${L("plata")}: ${esc(Number(nyitott.brutto).toFixed(2))} ${esc(nyitott.penznem)}</h2>
    <div class="kicsi">${dok.ket(T.proforma, ford)} <b>${esc(nyitott.sorszam)}</b>${nyitott.esedekes ? ` · ${dok.ket(T.hatarido, ford)} ${esc(nyitott.esedekes)}` : ""}</div>
    ${online ? `<button type="button" id="kartyaGomb" class="gomb">${dok.ket(T.kartya, ford)}</button><div class="kicsi">${dok.ket(T.kartyaInfo, ford)}</div>` : ""}
    ${be.iban ? `<div class="atutal"><b>${dok.ket(T.atutalas, ford)}</b><br>IBAN: <b class="mono">${esc(be.iban)}</b>${be.bank ? " (" + esc(be.bank) + ")" : ""}<br>${esc(be.kedvezmenyezett || u.nev || "")}<br>${dok.ket(T.kozlemeny, ford)}: <b>${esc(nyitott.sorszam)}</b></div>` : ""}
    <div id="fizUzenet" class="kicsi"></div>
  </div>` : fizetett.length ? `
  <div class="fizetve">✓ ${dok.ket(T.fizetve, ford)}${fizetett.map(x => x.szamla ? ` · ${dok.ket(T.szamla, ford)} <b>${esc(x.szamla)}</b>` : "").join("")}</div>` : "";

    const osszegzes = `
  <p><b>${esc(r.nev)}</b> · ${esc(r.kezdet)}${r.vege ? " – " + esc(r.vege) : ""} · ${esc(helyek)}<br>
  ${esc(String(Number(r.ar)))} ${esc(penznem)} × ${ho} = <b>${esc((Number(r.ar) * ho).toFixed(2))} ${esc(penznem)}</b></p>`;

    const elfogadva = r.szerzodes_elfogadva
        ? `<div class="pecset">${L("elfogadva")}<br><small>${esc(new Date(r.szerzodes_elfogadva).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" }))}${r.szerzodes_ip ? " · IP " + esc(r.szerzodes_ip) : ""}</small></div>` : "";

    const tartalom = szerzodes ? `
  ${fizetes}
  ${anyag}
  <h1>${dok.ket(T.cim, ford, { blokk: true })}</h1>
  <p class="kozep">${L("nr")} <b>${esc(r.szerzodes_szam || "–")}</b> ${L("din")} ${esc(String(r.szerzodes_kuldve ? new Date(r.szerzodes_kuldve).toISOString().slice(0, 10) : pu.ma()))}</p>
  ${felek}
  ${cikkek(r, { afa: !!be.afa_fizeto }, ugyfel, Number(r.ar), ho, penznem, helyek).map(c => dok.bek(c, ford)).join("")}
  ${elfogadva}
  ${!r.szerzodes_elfogadva && o.elfogadhato ? `
  <div class="elfogad" id="elfogadBox">
    <p>${dok.ket(T.elfogadSzoveg, ford, { blokk: true })}</p>
    <label><input type="checkbox" id="elfogadPipa"> ${esc(ugyfel.nev || "")}</label><br>
    <button type="button" id="elfogadGomb" class="gomb" disabled>${L("elfogadGomb")}</button>
  </div>` : ""}` : `
  <h1>${dok.ket(T.cimFizetes, ford, { blokk: true })}</h1>
  ${felek}
  ${osszegzes}
  ${fizetes}
  ${anyag}`;

    // az oldal CSP-je nem enged űrlap-küldést – a gombok fetch-csel küldenek
    const tok = JSON.stringify(String(o.token || ""));
    const script = o.elfogadhato ? `
(function () {
  var tok = ${tok};
  var p = document.getElementById("elfogadPipa"), g = document.getElementById("elfogadGomb");
  if (p && g) {
    p.onchange = function () { g.disabled = !p.checked; };
    g.onclick = function () {
      g.disabled = true;
      fetch("/reklam-szerzodes/" + tok + "/elfogad", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
        .then(function (r) { if (!r.ok) throw new Error(); location.reload(); })
        .catch(function () { g.disabled = false; alert("Error / Hiba"); });
    };
  }
  var k = document.getElementById("kartyaGomb"), m = document.getElementById("fizUzenet");
  if (k) k.onclick = function () {
    k.disabled = true;
    fetch("/reklam-szerzodes/" + tok + "/fizet", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(function (r) { return r.json().then(function (v) { if (!r.ok || !v.url) throw new Error(); location.href = v.url; }); })
      .catch(function () { k.disabled = false; alert("Error / Hiba"); });
  };
  // a reklám anyaga: kép (3 MB fölött – ha nem GIF – lekicsinyítve), telefonos kép, link
  var ag = document.getElementById("anyagGomb"), au = document.getElementById("anyagUzenet");
  var olvas = function (f) {
    return new Promise(function (ok, hiba) {
      if (!f) return ok(null);
      if (!/^image\\/(jpeg|png|webp|gif)$/.test(f.type)) return hiba(${JSON.stringify(TX("anyagHibaTipus"))});
      var fr = new FileReader();
      fr.onerror = function () { hiba("?"); };
      fr.onload = function () {
        if (f.size <= 3 * 1024 * 1024) return ok(fr.result);
        if (f.type === "image/gif") return hiba(${JSON.stringify(TX("anyagHibaMeret"))});
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, 2400 / Math.max(img.width, img.height));
          var c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          var d = c.toDataURL("image/jpeg", 0.85);
          if (d.length * 0.75 > 3 * 1024 * 1024) return hiba(${JSON.stringify(TX("anyagHibaMeret"))});
          ok(d);
        };
        img.onerror = function () { hiba(${JSON.stringify(TX("anyagHibaTipus"))}); };
        img.src = fr.result;
      };
      fr.readAsDataURL(f);
    });
  };
  var ak = document.getElementById("anyagKep");
  if (ak) ak.onchange = function () {
    var f = ak.files && ak.files[0]; if (!f) return;
    olvas(f).then(function (d) { document.getElementById("anyagPrev").innerHTML = '<img src="' + d + '" alt="">'; }).catch(function (m) { au.textContent = m; });
  };
  if (ag) ag.onclick = function () {
    var vanKep = !!document.querySelector("#anyagPrev img");
    var kf = ak && ak.files && ak.files[0], mf = document.getElementById("anyagMobil").files[0];
    if (!kf && !vanKep) { au.textContent = ${JSON.stringify(TX("anyagKell"))}; return; }
    ag.disabled = true; au.textContent = "…";
    Promise.all([olvas(kf), olvas(mf)]).then(function (k) {
      var body = { cel_url: document.getElementById("anyagUrl").value, alt: document.getElementById("anyagAlt").value, ford: ${JSON.stringify(ford)} };
      if (k[0]) body.kep = k[0];
      if (k[1]) body.kep_mobil = k[1];
      return fetch("/reklam-szerzodes/" + tok + "/anyag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (v) { if (!r.ok) throw (v.uzenet || v.error || "Error / Hiba"); return v; }); });
    }).then(function (v) {
      au.textContent = ${JSON.stringify(TX("anyagKesz"))};
      if (v.allapot) document.getElementById("anyagAllapot").textContent = v.allapot;
    }).catch(function (m) { au.textContent = String(m); }).then(function () { ag.disabled = false; });
  };
  // visszatérés a kártyás fizetésből: ellenőrzés, majd frissítés
  var q = new URLSearchParams(location.search).get("fizetes");
  if (q && q !== "megszakitva") {
    if (m) m.textContent = "…";
    fetch("/reklam-szerzodes/" + tok + "/fizetes/" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function () { location.replace(location.pathname); })
      .catch(function () { location.replace(location.pathname); });
  }
})();` : "";
    const css = `
  h1 { font-size: 19px; text-align: center; margin: 0 0 4px; }
  .kozep { text-align: center; margin-top: 0; }
  .felek { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 16px 0; font-size: 13px; }
  .fel { border: 1px solid #dfe3df; border-radius: 8px; padding: 10px 12px; }
  .fel h3 { font-size: 11px; text-transform: uppercase; color: #1f6f5c; margin: 0 0 4px; }
  .fel .nev { font-weight: bold; }
  p { font-size: 13.5px; line-height: 1.55; }
  .fizetes { border: 2px solid #1f6f5c; border-radius: 12px; padding: 14px 16px; margin: 0 0 22px; }
  .fizetes h2 { margin: 0 0 4px; font-size: 18px; color: #1f6f5c; }
  .kicsi { font-size: 12.5px; color: #555; margin: 4px 0; }
  .atutal { font-size: 13px; background: #f6f7f6; border-radius: 8px; padding: 8px 10px; margin-top: 10px; }
  .fizetve { background: #e8f4ee; color: #1f6f5c; border-radius: 10px; padding: 10px 14px; font-weight: bold; margin: 0 0 18px; }
  .mono { font-family: "Courier New", monospace; }
  .gomb { background: #1f6f5c; color: #fff; border: 0; border-radius: 8px; padding: 10px 18px; font-size: 15px; cursor: pointer; margin-top: 10px; }
  .gomb:disabled { opacity: .6; cursor: default; }
  .pecset { border: 3px solid #1f6f5c; color: #1f6f5c; display: inline-block; padding: 8px 14px; font-weight: bold; border-radius: 8px; margin-top: 10px; }
  .elfogad { background: #f1f6f3; border-radius: 10px; padding: 14px; margin-top: 18px; }
  .anyag { border: 1px solid #dfe3df; border-radius: 12px; padding: 14px 16px; margin: 0 0 22px; }
  .anyag h2 { margin: 0 0 4px; font-size: 17px; color: #1f6f5c; }
  .anyagSor { display: flex; gap: 14px; align-items: center; margin: 10px 0; flex-wrap: wrap; }
  .anyagKep { width: 220px; min-height: 70px; background: #f1f3f1; border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; font-size: 12.5px; color: #6a746f; }
  .anyagKep img { max-width: 100%; max-height: 160px; display: block; }
  .anyagAll { flex: 1; min-width: 200px; font-size: 14px; }
  .mezo { display: block; font-size: 13px; margin: 8px 0; }
  .mezo input { display: block; width: 100%; margin-top: 3px; padding: 7px 9px; border: 1px solid #cfd5d1; border-radius: 7px; font: inherit; }
  @media (max-width: 600px) { .felek { grid-template-columns: 1fr; } }
  @media print { .elfogad, .gomb, .anyag { display: none; } }`;
    return dok.oldal({ cim: szerzodes ? `Contract ${r.szerzodes_szam || ""}` : `Plată ${nyitott ? nyitott.sorszam : ""}`, css, tartalom, ford, ui: o.ui || "ro", vissza: o.vissza || "/", script });
}

async function tokennel(token) {
    if (!/^[a-f0-9]{48}$/.test(String(token || ""))) return null;
    const r = await db.query("SELECT id FROM reklamok WHERE szerzodes_token = $1", [token]);
    return r.rowCount ? reklamAdat(r.rows[0].id) : null;
}

async function elfogad(token, ip) {
    const r = await tokennel(token);
    if (!r) throw hibaKod("not_found");
    if (!r.szerzodes_elfogadva) {
        await db.query("UPDATE reklamok SET szerzodes_elfogadva = NOW(), szerzodes_ip = $2, updated_at = NOW() WHERE id = $1",
            [r.id, String(ip || "").slice(0, 60)]);
        // értesítés az adminnak
        try {
            const mail = require("./mail");
            const u = await oldalAdatok.nyilvanos();
            if (mail.elerheto() && u.email) {
                const t = mail.sablon({ cim: `Elfogadták a reklám szerződést: ${r.szerzodes_szam}`, sorok: [`${r.nev} (${r.hirdeto || ""})`], lablec: "Admin értesítés." });
                await mail.kuld({ to: u.email, subject: `Reklám szerződés elfogadva: ${r.szerzodes_szam}`, html: t.html, text: t.text });
            }
        } catch (e) { /* nem kritikus */ }
    }
    return reklamAdat(r.id);
}

// ---------- a reklám anyaga: a hirdető feltölti (a fizetési oldalon) ----------

async function anyagAllapot(id, ford = "") {
    const r = await reklamAdat(id);
    if (!r) return "";
    const k = (await db.query("SELECT kep_mime FROM reklamok WHERE id = $1", [id])).rows[0] || {};
    const fizetve = (await db.query("SELECT 1 FROM penzugy_szamlak WHERE reklam_id = $1 AND tipus = 'dijbekero' AND statusz = 'fizetve' LIMIT 1", [id])).rowCount > 0;
    const t = x => dok.ket(x, ["hu", "en"].includes(ford) ? ford : "").replace(/<[^>]+>/g, "");
    if (!k.kep_mime) return t(T.anyagNincs);
    if (fizetve) return (!r.kezdet || r.kezdet <= pu.ma()) ? t(T.anyagFut) : `${t(T.anyagKezdet)} ${r.kezdet}`;
    return r.fizetes_utan ? t(T.anyagFizetesUtan) : t(T.anyagFut);
}

async function anyagFeltolt(token, b) {
    const r = await tokennel(token);
    if (!r) throw hibaKod("not_found");
    // a lejárt kampányhoz már nem
    if (r.vege && r.vege < pu.ma()) throw hibaKod("ad_ended");
    await require("./reklam").anyagMent(r.id, b || {});
    // értesítés az adminnak
    try {
        const mail = require("./mail");
        const cim = await adminCim();
        if (mail.elerheto() && cim) {
            const t = mail.sablon({
                cim: `A hirdető feltöltötte a reklám anyagát: ${r.nev}`,
                sorok: [`${r.hirdeto || ""} – ${r.kezdet || ""}${r.vege ? " – " + r.vege : ""}`, "A kép az Admin → Reklámfelületek alatt látszik; ha ki van fizetve, a reklám magától megjelenik."],
                gomb: "Megnyitás az adminban", link: `${mail.oldalCim()}/#admin/reklam`, lablec: "Admin értesítés."
            });
            await mail.kuld({ to: cim, subject: `Reklám anyag feltöltve – ${r.nev}`, html: t.html, text: t.text });
        }
    } catch (e) { /* nem kritikus */ }
    return { allapot: await anyagAllapot(r.id, b && b.ford) };
}

async function adminCim() {
    const b = await require("./reklam").olvas().catch(() => ({}));
    if (b && b.email) return b.email;
    return require("./oldalAdatok").adminEmail();
}

// Kifizették a díjbekérőt: a reklám a kezdő naptól magától megjelenik. Ha még
// nincs képe, a hirdetőt levélben kérjük (a fizetési oldal linkjével), az admin is tud róla.
async function fizetveUtan(szamlaId) {
    const sz = (await db.query("SELECT id, reklam_id, tipus FROM penzugy_szamlak WHERE id = $1", [szamlaId])).rows[0];
    if (!sz || !sz.reklam_id || sz.tipus !== "dijbekero") return;
    const reklam = require("./reklam");
    reklam.cacheUrit();
    const r = await reklamAdat(sz.reklam_id);
    if (!r) return;
    const k = (await db.query("SELECT kep_mime, szerzodes_token, anyag_kerve FROM reklamok WHERE id = $1", [r.id])).rows[0] || {};
    const mail = require("./mail");
    if (!mail.elerheto()) return;
    const alap = mail.oldalCim().replace(/\/+$/, "");
    const ugyfel = await ugyfelAdat(r.ugyfel_id);
    if (!k.kep_mime && ugyfel && ugyfel.email && k.szerzodes_token && !k.anyag_kerve) {
        const t = mail.sablon({
            cim: "Mulțumim pentru plată! / Köszönjük a befizetést!",
            sorok: [
                `Plata pentru „${r.nev}” a fost primită. Mai lipsește imaginea reclamei: încărcați-o la linkul de mai jos (sau trimiteți-o răspunzând la acest e-mail) – reclama apare automat${r.kezdet && r.kezdet > pu.ma() ? " de la " + r.kezdet : ""}.`,
                `A(z) „${r.nev}” díja megérkezett. Már csak a reklám képe hiányzik: töltse fel az alábbi linken (vagy küldje el válaszként erre a levélre) – a reklám magától megjelenik${r.kezdet && r.kezdet > pu.ma() ? " " + r.kezdet + "-tól" : ""}.`
            ],
            gomb: "Încarcă imaginea / Kép feltöltése",
            link: `${alap}/reklam-szerzodes/${k.szerzodes_token}#anyag`,
            lablec: "IngatlanPro – spațiu publicitar / reklámfelület."
        });
        const valasz = await adminCim().catch(() => null);
        if (await mail.kuld({ to: ugyfel.email, subject: `Imaginea reclamei / A reklám képe – ${r.nev}`, html: t.html, text: t.text, replyTo: valasz || undefined })) {
            await db.query("UPDATE reklamok SET anyag_kerve = NOW() WHERE id = $1", [r.id]);
        }
    }
    try {
        const cim = await adminCim();
        if (cim) {
            const t = mail.sablon({
                cim: `Kifizették a reklámot: ${r.nev}`,
                sorok: [k.kep_mime ? `A reklám magától megjelenik${r.kezdet && r.kezdet > pu.ma() ? " " + r.kezdet + "-tól" : ""}.` : "Még nincs képe – a hirdetőt levélben kértük, hogy töltse fel (vagy töltsd fel te az adminban)."],
                gomb: "Megnyitás az adminban", link: `${alap}/#admin/reklam`, lablec: "Admin értesítés."
            });
            await mail.kuld({ to: cim, subject: `Reklám kifizetve – ${r.nev}`, html: t.html, text: t.text });
        }
    } catch (e) { /* nem kritikus */ }
}

pu.fizetveFigyelo(id => fizetveUtan(id).catch(e => console.error("Reklám fizetés után:", e.message)));

// Az Irattárnak (Szerződések → Reklám)
async function irattarLista() {
    const r = await db.query(`
        SELECT r.id, r.nev, r.hirdeto, r.szerzodes_szam, r.szerzodes_kuldve, r.szerzodes_elfogadva, r.kezdet::text AS kezdet, r.vege::text AS vege,
               r.ar, r.penznem, u.nev AS ugyfel_nev
        FROM reklamok r LEFT JOIN penzugy_ugyfelek u ON u.id = r.ugyfel_id
        WHERE r.szerzodes_szam IS NOT NULL ORDER BY r.szerzodes_kuldve DESC NULLS LAST`);
    return r.rows;
}

module.exports = { allapot, kuld, html, tokennel, elfogad, irattarLista, honapok, reklamAdat, anyagFeltolt, anyagAllapot, fizetveUtan };
