// ============================================================
//  Üzenetek (Fiókom → Üzenetek)
//  Bal oldalon a beszélgetések, jobb oldalon a kiválasztott.
//  Egy beszélgetés = a másik felhasználó + a téma (igény / hirdetés).
// ============================================================

class Messages {

    static lista = [];
    static aktiv = null;       // { masik, igeny, ingatlan }

    static kulcs(b) {
        return `${b.masik_id || b.masik}|${b.igeny_id || b.igeny || 0}|${b.ingatlan_id || b.ingatlan || 0}`;
    }

    static tema(b) {
        if (b.igeny_id) return { icon: "fa-solid fa-bullhorn", text: b.igeny_cim || `${Types.label(b.igeny_tipus)} · ${CityManager.displayName(b.igeny_varos)}`, link: `#igenyek/${b.igeny_id}` };
        if (b.ingatlan_id) return { icon: "fa-solid fa-house", text: b.ingatlan_cim || `${Types.label(b.ingatlan_tipus)} · ${CityManager.displayName(b.ingatlan_varos)}`, link: `#listing/${b.ingatlan_id}` };
        return { icon: "fa-solid fa-comment", text: I18n.t("msgGeneral"), link: null };
    }

    static render(box, nyit) {

        box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        return fetch("/api/uzenetek")
            .then(r => r.json())
            .then(lista => {

                Messages.lista = Array.isArray(lista) ? lista : [];

                if (!Messages.lista.length) {
                    box.innerHTML = `
                        <div class="emptyState">
                            <i class="fa-regular fa-envelope"></i>
                            <h5>${I18n.t("msgEmpty")}</h5>
                            <p>${I18n.t("msgEmptyHint")}</p>
                        </div>`;
                    return;
                }

                box.innerHTML = `
                    <div class="msgShell">
                        <div class="msgList" id="msgList"></div>
                        <div class="msgThread" id="msgThread">
                            <div class="emptyState"><i class="fa-regular fa-comments"></i><p>${I18n.t("msgPick")}</p></div>
                        </div>
                    </div>`;

                Messages.renderLista();

                const elso = nyit || (window.innerWidth >= 992 ? Messages.lista[0] : null);
                if (elso) Messages.nyit({ masik: elso.masik_id || elso.masik, igeny: elso.igeny_id || elso.igeny, ingatlan: elso.ingatlan_id || elso.ingatlan });

            });

    }

    static renderLista() {

        const el = document.getElementById("msgList");
        if (!el) return;

        el.innerHTML = Messages.lista.map(b => {
            const t = Messages.tema(b);
            const aktiv = Messages.aktiv && Messages.kulcs(Messages.aktiv) === Messages.kulcs(b);
            return `
                <button type="button" class="msgItem ${aktiv ? "active" : ""} ${b.olvasatlan ? "unread" : ""}" data-k="${Messages.kulcs(b)}">
                    <span class="msgAvatar">${Utils.escape((b.masik_nev || "?").slice(0, 1).toUpperCase())}</span>
                    <span class="msgItemBody">
                        <span class="d-flex justify-content-between gap-2">
                            <b class="text-truncate">${Utils.escape(b.masik_nev || "?")}</b>
                            <small class="text-body-secondary text-nowrap">${Utils.ago(b.created_at)}</small>
                        </span>
                        <small class="msgTopic text-truncate"><i class="${t.icon}"></i> ${Utils.escape(t.text)}</small>
                        <small class="text-body-secondary text-truncate">${b.felado_id === AuthManager.user.id ? I18n.t("msgYou") + ": " : ""}${Utils.escape(b.szoveg)}</small>
                    </span>
                    ${b.olvasatlan ? `<span class="badge rounded-pill text-bg-danger">${b.olvasatlan}</span>` : ""}
                </button>`;
        }).join("");

        el.querySelectorAll("[data-k]").forEach(b => {
            b.onclick = () => {
                const [masik, igeny, ingatlan] = b.dataset.k.split("|").map(Number);
                Messages.nyit({ masik, igeny: igeny || null, ingatlan: ingatlan || null });
            };
        });

    }

    static nyit(a) {

        Messages.aktiv = a;

        const box = document.getElementById("msgThread");
        if (!box) return;

        document.querySelector(".msgShell").classList.add("threadOpen");

        const qs = `masik=${a.masik}${a.igeny ? "&igeny=" + a.igeny : ""}${a.ingatlan ? "&ingatlan=" + a.ingatlan : ""}`;

        fetch("/api/uzenetek/beszelgetes?" + qs)
            .then(r => r.json())
            .then(d => {

                const b = Messages.lista.find(x => Messages.kulcs(x) === Messages.kulcs(a)) || {};
                const t = Messages.tema(b.masik_id ? b : { igeny_id: a.igeny, ingatlan_id: a.ingatlan });

                // Olvasottnak jelöltük
                if (b.olvasatlan) {
                    b.olvasatlan = 0;
                    AuthManager.refresh();
                }

                Messages.renderLista();

                box.innerHTML = `
                    <div class="msgThreadHead">
                        <button class="btn btn-link px-0 d-lg-none" id="msgBack"><i class="fa-solid fa-arrow-left"></i></button>
                        <span class="msgAvatar">${Utils.escape((d.masik.nev || "?").slice(0, 1).toUpperCase())}</span>
                        <div class="min-w-0">
                            <b>${Utils.escape(d.masik.nev || "?")}</b>
                            <div class="small text-truncate">${t.link ? `<a href="${t.link}"><i class="${t.icon}"></i> ${Utils.escape(t.text)}</a>` : Utils.escape(t.text)}</div>
                        </div>
                    </div>
                    <div class="msgBubbles" id="msgBubbles">
                        ${d.uzenetek.map(m => Messages.buborek(m)).join("")}
                    </div>
                    <form class="msgCompose" id="msgCompose">
                        <textarea class="form-control" id="msgText" rows="2" maxlength="3000" placeholder="${Utils.escape(I18n.t("msgPlaceholder"))}" required></textarea>
                        <button class="btn btn-primary" type="submit" aria-label="${I18n.t("msgSend")}"><i class="fa-solid fa-paper-plane"></i></button>
                    </form>
                    <p class="small text-body-secondary mt-2 mb-0">${I18n.t("msgPrivacy")}</p>`;

                const bub = document.getElementById("msgBubbles");
                bub.scrollTop = bub.scrollHeight;

                const back = document.getElementById("msgBack");
                if (back) back.onclick = () => document.querySelector(".msgShell").classList.remove("threadOpen");

                const text = document.getElementById("msgText");
                text.addEventListener("keydown", e => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) document.getElementById("msgCompose").requestSubmit();
                });

                document.getElementById("msgCompose").onsubmit = e => {

                    e.preventDefault();
                    const szoveg = text.value.trim();
                    if (!szoveg) return;

                    const gomb = e.target.querySelector("button");
                    gomb.disabled = true;

                    fetch("/api/uzenetek", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ masik: a.masik, igeny_id: a.igeny || null, ingatlan_id: a.ingatlan || null, szoveg })
                    })
                        .then(r => r.json().then(v => ({ ok: r.ok, v })))
                        .then(({ ok, v }) => {
                            if (!ok) throw new Error(v.error);
                            text.value = "";
                            bub.insertAdjacentHTML("beforeend", Messages.buborek(v));
                            bub.scrollTop = bub.scrollHeight;
                            const l = Messages.lista.find(x => Messages.kulcs(x) === Messages.kulcs(a));
                            if (l) { l.szoveg = szoveg; l.created_at = v.created_at; l.felado_id = AuthManager.user.id; Messages.renderLista(); }
                        })
                        .catch(() => alert(I18n.t("msgSendError")))
                        .finally(() => { gomb.disabled = false; });

                };

            });

    }

    static buborek(m) {

        const sajat = m.felado_id === AuthManager.user.id;

        const ajanlat = m.ajanlott_ingatlan_id ? `
            <a class="msgOffer" href="#listing/${m.ajanlott_ingatlan_id}">
                <i class="fa-solid fa-house"></i>
                <span>
                    <b>${Utils.escape(m.ajanlott_cim || Types.label(m.ajanlott_tipus))}</b>
                    <small>${Utils.price({ ar: m.ajanlott_ar, ugylet: m.ajanlott_ugylet })}${m.ajanlott_nm ? " · " + Utils.nm(m.ajanlott_nm) : ""}</small>
                </span>
                <i class="fa-solid fa-chevron-right ms-auto"></i>
            </a>` : "";

        return `
            <div class="msgBubble ${sajat ? "mine" : ""}">
                ${ajanlat}
                <div class="msgBubbleText">${Utils.escape(m.szoveg)}</div>
                <small>${new Date(m.created_at).toLocaleString(I18n.current === "hu" ? "hu-HU" : I18n.current === "ro" ? "ro-RO" : "en-GB", { dateStyle: "short", timeStyle: "short" })}</small>
            </div>`;

    }

}
