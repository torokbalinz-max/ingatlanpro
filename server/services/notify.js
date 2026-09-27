// ============================================================
//  Értesítések e-mailben
//   - új üzenet (válasz egy igényre, kérdés egy hirdetésről)
//   - naponta: új hirdetések a mentett keresésekhez és a vevői igényekhez
//  Ha nincs e-mail beállítva (BREVO_API_KEY / RESEND_API_KEY), csak
//  az oldalon látszanak (Fiókom → Üzenetek, Mentett keresések).
// ============================================================

const db = require("../db/database");
const mail = require("./mail");
const matching = require("./matching");

// Egy beszélgetésről legfeljebb 15 percenként megy levél
const utolsoLevel = new Map();

async function ujUzenet({ cimzettId, feladoNev, szoveg, tema, req }) {

    if (!mail.elerheto()) return false;

    const r = await db.query("SELECT email, nev, ertesites_email FROM users WHERE id = $1", [cimzettId]);
    const u = r.rows[0];

    if (!u || !u.email || u.ertesites_email === false) return false;

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

const eur = n => n > 0 ? Math.round(n).toLocaleString("hu-HU") + " €" : "–";

function hirdetesSor(i) {
    return `• ${i.cim || i.tipus} – ${eur(i.ar)}, ${i.nm ? Math.round(i.nm) + " m²" : ""}${i.szobak ? ", " + i.szobak + " szoba" : ""}`;
}

// Napi összesítő (a cron hívja): mentett keresések + vevői igények
async function napiOsszesito(opts = {}) {

    const eredmeny = { keresesek: 0, igenyek: 0, levelek: 0 };

    // ---- Mentett keresések
    const k = await db.query(`
        SELECT k.*, u.email, u.nev AS user_nev, u.ertesites_email
        FROM mentett_keresesek k JOIN users u ON u.id = k.user_id
        WHERE k.ertesites AND u.email IS NOT NULL AND COALESCE(u.ertesites_email, true)
          AND NOT COALESCE(u.tiltva, false)
    `);

    const cache = new Map();
    const hirdetesek = async (varos, tipus, ugylet, utana) => {
        const kulcs = `${varos}|${tipus}|${ugylet}`;
        if (!cache.has(kulcs)) cache.set(kulcs, await matching.aktivHirdetesek(varos, tipus, ugylet, null));
        return cache.get(kulcs).filter(i => !utana || new Date(i.created_at) > new Date(utana));
    };

    for (const s of k.rows) {

        const f = s.szurok || {};
        const uj = (await hirdetesek(f.varos, f.tipus || "lakas", f.ugylet || "elado", s.utolso_ertesites))
            .filter(i => matching.keresesIllik(i, f));

        await db.query("UPDATE mentett_keresesek SET utolso_ertesites = NOW() WHERE id = $1", [s.id]);

        if (!uj.length) continue;

        eredmeny.keresesek++;

        if (mail.elerheto()) {
            const { html, text } = mail.sablon({
                cim: `${uj.length} új hirdetés: ${s.nev || "mentett keresés"}`,
                sorok: [uj.slice(0, 10).map(hirdetesSor).join("\n"), uj.length > 10 ? `…és még ${uj.length - 10}.` : ""].filter(Boolean),
                gomb: "Találatok megnyitása",
                link: `${mail.oldalCim(opts.req)}/#fiok/keresesek`
            });
            if (await mail.kuld({ to: s.email, subject: `IngatlanPro – ${uj.length} új hirdetés (${s.nev || "mentett keresés"})`, html, text })) eredmeny.levelek++;
        }

    }

    // ---- Vevői igények: új hirdetések, amelyek illenek
    const g = await db.query(`
        SELECT g.*, u.email, u.ertesites_email
        FROM igenyek g JOIN users u ON u.id = g.user_id
        WHERE g.statusz = 'aktiv' AND (g.lejar IS NULL OR g.lejar > NOW())
          AND u.email IS NOT NULL AND COALESCE(u.ertesites_email, true)
    `);

    for (const ig of g.rows) {

        const utana = ig.utolso_ertesites || ig.created_at;
        const uj = (await hirdetesek(ig.varos, ig.tipus, ig.ugylet, utana)).filter(i => matching.igenyIllik(i, ig));

        await db.query("UPDATE igenyek SET utolso_ertesites = NOW() WHERE id = $1", [ig.id]);

        if (!uj.length) continue;

        eredmeny.igenyek++;

        if (mail.elerheto()) {
            const { html, text } = mail.sablon({
                cim: `${uj.length} új hirdetés illik az igényedhez`,
                sorok: [ig.cim ? `Igény: ${ig.cim}` : "", uj.slice(0, 10).map(hirdetesSor).join("\n")].filter(Boolean),
                gomb: "Megnézem",
                link: `${mail.oldalCim(opts.req)}/#igenyek/${ig.id}`
            });
            if (await mail.kuld({ to: ig.email, subject: `IngatlanPro – ${uj.length} új hirdetés az igényedhez`, html, text })) eredmeny.levelek++;
        }

    }

    return eredmeny;

}

module.exports = { ujUzenet, napiOsszesito };
