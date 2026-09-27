// ============================================================
//  E-mail küldés (nem kötelező)
//
//  A Render ingyenes szerverén az SMTP (Gmail stb.) le van tiltva,
//  ezért HTTP-n keresztül küldünk:
//    BREVO_API_KEY   – brevo.com (ingyen napi 300 levél; elég egy
//                      megerősített feladó e-mail cím, domain nem kell)
//    RESEND_API_KEY  – resend.com (saját domain kell hozzá)
//  MAIL_FROM        – a feladó címe (Brevón megerősített cím)
//  MAIL_FROM_NAME   – a feladó neve (alap: IngatlanPro)
//
//  Ha nincs beállítva, az üzenetek csak az oldalon látszanak.
// ============================================================

function elerheto() {
    return !!((process.env.BREVO_API_KEY || process.env.RESEND_API_KEY) && process.env.MAIL_FROM);
}

function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Egyszerű, olvasható levél: cím, bekezdések, egy gomb
function sablon({ cim, sorok = [], gomb, link, lablec }) {
    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1c2321">
  <div style="padding:18px 0;font-size:20px;font-weight:bold;color:#1f6f5c">IngatlanPro</div>
  <h2 style="font-size:18px;margin:0 0 12px">${esc(cim)}</h2>
  ${sorok.map(s => `<p style="margin:0 0 12px;line-height:1.5;white-space:pre-line">${esc(s)}</p>`).join("")}
  ${link ? `<p style="margin:20px 0"><a href="${esc(link)}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(gomb || "Megnyitás")}</a></p>` : ""}
  <p style="font-size:12px;color:#6b7470;margin-top:28px">${esc(lablec || "Ezt a levelet az IngatlanPro küldte. Az értesítéseket a fiókodban kapcsolhatod ki.")}</p>
</div>`;
    const text = [cim, "", ...sorok, "", link ? `${gomb || "Megnyitás"}: ${link}` : ""].join("\n");
    return { html, text };
}

async function kuld({ to, subject, html, text, replyTo }) {

    if (!elerheto() || !to) return false;

    const from = process.env.MAIL_FROM;
    const fromName = process.env.MAIL_FROM_NAME || "IngatlanPro";

    try {

        let res;

        if (process.env.BREVO_API_KEY) {
            res = await fetch("https://api.brevo.com/v3/smtp/email", {
                method: "POST",
                headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
                body: JSON.stringify({
                    sender: { email: from, name: fromName },
                    to: [{ email: to }],
                    subject,
                    htmlContent: html,
                    textContent: text,
                    ...(replyTo ? { replyTo: { email: replyTo } } : {})
                }),
                signal: AbortSignal.timeout(15000)
            });
        } else {
            res = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { authorization: "Bearer " + process.env.RESEND_API_KEY, "content-type": "application/json" },
                body: JSON.stringify({
                    from: `${fromName} <${from}>`,
                    to: [to],
                    subject,
                    html,
                    text,
                    ...(replyTo ? { reply_to: replyTo } : {})
                }),
                signal: AbortSignal.timeout(15000)
            });
        }

        if (!res.ok) {
            console.error("E-mail küldési hiba:", res.status, (await res.text()).slice(0, 300));
            return false;
        }

        return true;

    } catch (e) {
        console.error("E-mail küldési hiba:", e.message);
        return false;
    }

}

// Az oldal címe a levelekben lévő linkekhez
function oldalCim(req) {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
    if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, "");
    if (req) return `${req.protocol}://${req.get("host")}`;
    return "";
}

module.exports = { elerheto, kuld, sablon, oldalCim };
