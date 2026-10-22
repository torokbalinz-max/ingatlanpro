// ============================================================
//  Értesítések e-mailben
//   - új üzenet (válasz egy igényre, kérdés egy hirdetésről)
//   - naponta: új hirdetések a mentett keresésekhez és a vevői igényekhez
//  Ha nincs e-mail beállítva (BREVO_API_KEY / RESEND_API_KEY), csak
//  az oldalon látszanak (Fiókom → Üzenetek, Mentett keresések).
//
//  A mentett keresések, igények és kedvencek értesítései (oldalon + e-mail,
//  a felhasználó beállítása szerint) már a services/ertesitesek.js-ben vannak;
//  a napiOsszesito csak azt hívja (a régi hívók miatt).
// ============================================================

const db = require("../db/database");
const mail = require("./mail");

// Egy beszélgetésről legfeljebb 15 percenként megy levél
const utolsoLevel = new Map();

async function ujUzenet({ cimzettId, feladoNev, szoveg, tema, req }) {

    if (!mail.elerheto()) return false;

    const r = await db.query("SELECT email, nev, ertesites_email, ertesites_beall FROM users WHERE id = $1", [cimzettId]);
    const u = r.rows[0];

    // Fiókom → Értesítések: az üzenetekről kér-e levelet
    if (!u || !u.email || !require("./ertesitesek").uzenetEmailKell(u)) return false;

    const kulcs = `${cimzettId}|${tema || ""}`;
    if (Date.now() - (utolsoLevel.get(kulcs) || 0) < 15 * 60 * 1000) return false;
    utolsoLevel.set(kulcs, Date.now());

    const { html, text } = mail.sablon({
        cim: `Új üzeneted érkezett – ${feladoNev}`,
        sorok: [
            tema ? `Téma: ${tema}` : "",
            String(szoveg || "").slice(0, 800),
            "Válaszolni az oldalon tudsz (Fiókom → Üzenetek)."
        ].filter(Boolean),
        gomb: "Üzenet megnyitása",
        link: `${mail.oldalCim(req)}/#fiok/uzenetek`
    });

    return mail.kuld({ to: u.email, subject: `IngatlanPro – új üzenet: ${feladoNev}`, html, text });

}

// Az értesítések futtatása (mentett keresések, igények, kedvencek – services/ertesitesek.js)
async function napiOsszesito(opts = {}) {
    const e = await require("./ertesitesek").futtat(opts);
    return { keresesek: e.keresesek, igenyek: e.igenyek, levelek: e.levelek };
}

module.exports = { ujUzenet, napiOsszesito };
