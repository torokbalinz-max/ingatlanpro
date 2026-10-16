// ============================================================
//  Megbízások – automatikus e-mailek (eladó, vevő, csapat)
//
//  Minden levél két nyelvű (magyar + román), és ha az e-mail küldés
//  nincs beállítva (BREVO_API_KEY / RESEND_API_KEY), csendben kimarad –
//  az oldalon (Ingatlanom eladása, a hirdetés kártyája, az admin felület)
//  minden ugyanúgy látszik. A hibák soha nem akadályozzák a kérést.
//
//  Linkek:
//    az eladó      /#eladas            (Ingatlanom eladása)
//    a vevő        /#listing/<id>      (a megbízásos hirdetés)
//    a csapat      /#admin/megbizasok/<id>/<fül>, /#admin/naptar
// ============================================================

const db = require("../db/database");
const mail = require("./mail");
const oldalAdatok = require("./oldalAdatok");

function kuld(to, cim, sorok, link, gomb) {
    if (!mail.elerheto() || !to) return;
    const t = mail.sablon({ cim, sorok: sorok.filter(Boolean), link, gomb });
    mail.kuld({ to, subject: cim, html: t.html, text: t.text }).catch(e => console.error("Megbízás e-mail:", e.message));
}

function cim(req) {
    return mail.oldalCim(req);
}

async function userEmail(id) {
    if (!id) return null;
    try {
        const r = await db.query("SELECT email FROM users WHERE id = $1", [id]);
        return r.rows[0] && r.rows[0].email;
    } catch (e) {
        return null;
    }
}

// Az admin(ok) és a megbízás felelőse
async function csapatnak(req, m, targy, sorok, ful) {
    try {
        const u = await oldalAdatok.nyilvanos();
        const admin = u.email;
        const ut = `/#admin/megbizasok/${m.id}${ful ? "/" + ful : ""}`;
        kuld(admin, targy, sorok, cim(req) + ut, "Megbízás megnyitása / Deschide mandatul");
        const fe = await userEmail(m.felelos_id);
        if (fe && fe !== admin) kuld(fe, targy, sorok, cim(req) + ut, "Megbízás megnyitása / Deschide mandatul");
    } catch (e) {
        console.error("Megbízás e-mail (csapat):", e.message);
    }
}

async function eladonak(req, m, targy, sorok) {
    try {
        const to = m.email || await userEmail(m.user_id);
        kuld(to, targy, sorok, cim(req) + "/#eladas", "Ingatlanom eladása / Vânzarea proprietății mele");
    } catch (e) {
        console.error("Megbízás e-mail (eladó):", e.message);
    }
}

// erd: { email, nev } – a megbízásos hirdetés linkjével
function vevonek(req, m, erd, targy, sorok) {
    if (!erd || !erd.email) return;
    kuld(erd.email, targy, sorok, m.ingatlan_id ? cim(req) + "/#listing/" + m.ingatlan_id : cim(req), "Hirdetés megnyitása / Deschide anunțul");
}

async function munkatarsnak(req, userId, targy, sorok, ut) {
    try {
        kuld(await userEmail(userId), targy, sorok, cim(req) + (ut || "/#admin"), "Admin felület / Panou de administrare");
    } catch (e) {
        console.error("Megbízás e-mail (munkatárs):", e.message);
    }
}

function idoSzoveg(d) {
    try {
        const t = new Date(d);
        return t.toLocaleString("hu-HU", { timeZone: "Europe/Bucharest", dateStyle: "medium", timeStyle: "short" });
    } catch (e) {
        return String(d);
    }
}

function penz(v, pn) {
    return `${Number(v).toLocaleString("hu-HU")} ${pn || "EUR"}`;
}

function hely(m) {
    return [m.cim, m.telepules, m.varos].filter(Boolean).join(", ") || m.szerzodes_szam || "";
}

// A szakaszok neve a levelekben
const SZAKASZ_NEV = {
    uj: "Igénylés / Solicitare", egyeztetes: "Egyeztetés / Discuții", szerzodes: "Szerződés / Contract",
    fotozas: "Előkészítés / Pregătire", hirdetes: "Hirdetés és megtekintések / Anunț și vizionări",
    targyalas: "Ajánlatok / Oferte", adasvetel: "Adásvétel / Vânzare", eladva: "Eladva / Vândut",
    lezarva: "Lezárva / Închis", elutasitva: "Nem vállaltuk / Respins"
};

// Szakaszváltás: az eladó levelet kap, a lezárt ajánlatok / megtekintések vevői is
async function lepesErtesit(req, m, lepes) {
    if (!m || !lepes) return;
    for (const s of lepes.lepesek || []) {
        const sorok = {
            egyeztetes: ["Felvettük veled a kapcsolatot – hamarosan elküldjük a végleges csomagot jóváhagyásra.", "Te-am contactat – în curând îți trimitem pachetul final spre aprobare."],
            szerzodes: ["A megbízási szerződés elkészült. Az „Ingatlanom eladása” oldalon elolvashatod, és online (e-mailben kapott kóddal) aláírhatod – vagy kérhetsz személyes aláírást.",
                "Contractul de intermediere este gata. Pe pagina „Vânzarea proprietății mele” îl poți citi și semna online (cu un cod primit pe e-mail) – sau poți cere semnarea în persoană."],
            fotozas: ["A szerződés hatályos. Jön a fotózás és a hirdetés előkészítése – az időpontot hamarosan egyeztetjük.", "Contractul este în vigoare. Urmează fotografierea și pregătirea anunțului."],
            hirdetes: ["Kint van a hirdetésed! A vevők a hirdetésen foglalhatnak időpontot megtekintésre – minden foglalást látsz az oldaladon.", "Anunțul tău este publicat! Cumpărătorii pot programa vizionări direct din anunț."],
            targyalas: ["Megérkezett az első vételi ajánlat.", "A sosit prima ofertă de cumpărare."],
            adasvetel: ["Megállapodás született! Következik az előszerződés, a foglaló, az iratok és a közjegyző – mindent az oldaladon követhetsz.", "S-a ajuns la un acord! Urmează antecontractul, arvuna, actele și notarul."],
            eladva: ["Gratulálunk, az ingatlan elkelt! Köszönjük a bizalmat.", "Felicitări, proprietatea a fost vândută! Mulțumim pentru încredere."]
        }[s];
        if (sorok) await eladonak(req, m, `${m.szerzodes_szam}: ${SZAKASZ_NEV[s] || s}`, sorok);
    }
    const l = lepes.lezart;
    if (l) {
        (l.ajanlatok || []).forEach(x => vevonek(req, m, x, "Válasz az ajánlatodra / Răspuns la oferta ta", [
            "Köszönjük az ajánlatodat – az eladó időközben egy másik ajánlatot fogadott el. Ha hasonlót keresel, nézd meg a többi hirdetést, vagy add fel a keresésed („Keresek”).",
            "Mulțumim pentru ofertă – între timp vânzătorul a acceptat o altă ofertă."
        ]));
        (l.megtekintesek || []).forEach(x => vevonek(req, m, x, "Elmarad a megtekintés / Vizionare anulată", [
            "Sajnos a megtekintés elmarad: az ingatlanra időközben elfogadott ajánlat érkezett.",
            "Din păcate vizionarea se anulează: între timp a fost acceptată o ofertă pentru proprietate."
        ]));
    }
}

// Naptárfájl (.ics) egy megtekintéshez – a vevőnek és a bemutatónak
function ics({ uid, kezd, perc, cim: targy, hely: helyszin, leiras }) {
    const f = d => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const e = s => String(s || "").replace(/[\\;,]/g, x => "\\" + x).replace(/\n/g, "\\n");
    const veg = new Date(new Date(kezd).getTime() + (perc || 30) * 60000);
    return [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IngatlanPro//Megtekintes//HU", "METHOD:PUBLISH",
        "BEGIN:VEVENT", `UID:${uid}@ingatlanpro`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(kezd)}`, `DTEND:${f(veg)}`,
        `SUMMARY:${e(targy)}`, `LOCATION:${e(helyszin)}`, `DESCRIPTION:${e(leiras)}`, "END:VEVENT", "END:VCALENDAR"
    ].join("\r\n");
}

module.exports = { kuld, csapatnak, eladonak, vevonek, munkatarsnak, idoSzoveg, penz, hely, userEmail, lepesErtesit, ics, SZAKASZ_NEV };
