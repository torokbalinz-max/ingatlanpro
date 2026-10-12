// ============================================================
//  Megbízások – automatikus e-mailek (eladó, vevő, csapat)
//
//  Minden levél két nyelvű (magyar + román), és ha az e-mail küldés
//  nincs beállítva (BREVO_API_KEY / RESEND_API_KEY), csendben kimarad –
//  az oldalon (Megbízásaim, a hirdetés kártyája, Munkaterületem) minden
//  ugyanúgy látszik. A hibák soha nem akadályozzák a kérést.
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
        kuld(admin, targy, sorok, cim(req) + ut, "Megbízás megnyitása");
        const fe = await userEmail(m.felelos_id);
        if (fe && fe !== admin) kuld(fe, targy, sorok, cim(req) + `/#munka/megbizasok/${m.id}${ful ? "/" + ful : ""}`, "Megbízás megnyitása");
    } catch (e) {
        console.error("Megbízás e-mail (csapat):", e.message);
    }
}

async function eladonak(req, m, targy, sorok) {
    try {
        const to = m.email || await userEmail(m.user_id);
        kuld(to, targy, sorok, cim(req) + "/#fiok/megbizasok", "Megbízásaim / Mandatele mele");
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
        kuld(await userEmail(userId), targy, sorok, cim(req) + (ut || "/#munka"), "Munkaterületem / Spațiul meu de lucru");
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

module.exports = { kuld, csapatnak, eladonak, vevonek, munkatarsnak, idoSzoveg, penz, hely, userEmail };
