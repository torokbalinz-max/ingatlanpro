// ============================================================
//  CRM → Kérések (az iroda CRM-jében)
//
//   - Gyorskereső telefonáláshoz: beírod a hívó számát vagy a hirdetés kódját
//     (IP-123), és azonnal látod a hirdetést, az ügyfelet és a „hívom” jelzést.
//   - Megtekintés-kérések: a vevő 1–3 időpontot javasolt; egy kattintással
//     elfogadod az egyiket (bekerül a naptárba, a vevő ügyfél lesz), másikat
//     javasolsz, vagy elutasítod. Az ütköző megtekintést jelezzük.
//   - „Hívom” jelzések: ki koppintott a telefonszámra (és melyik hirdetésen) az
//     elmúlt 72 órában – felveheted ügyfélként, vagy elrejtheted.
//  (server/services/megtekintes.js)
// ============================================================

class CrmReq {

    static szuro = "nyitott";

    static badge(n) {
        Crm.keresDb = n;
        document.querySelectorAll(".crmReqBadge").forEach(b => { b.textContent = n; b.hidden = !n; });
    }

    // „csüt., nov. 14. 10:00”
    static ido(t) {
        if (!t) return "";
        const d = Crm.helyi(t);
        return `${d.toLocaleDateString(Utils.locale(), { weekday: "short", month: "short", day: "numeric" })} ${d.toLocaleTimeString(Utils.locale(), { hour: "2-digit", minute: "2-digit" })}`;
    }

    // ---------- Gyorskereső ----------

    static gyorsHtml() {
        return `
            <div class="crmQuick mb-4">
                <label class="crmQuickLabel" for="crmQuickQ"><i class="fa-solid fa-phone-volume" aria-hidden="true"></i> ${Crm.t("mkQuickLabel")}</label>
                <input type="search" class="form-control" id="crmQuickQ" placeholder="${Crm.esc(Crm.t("mkQuickPh"))}" autocomplete="off" inputmode="search">
                <div id="crmQuickRes" class="crmQuickRes" aria-live="polite"></div>
            </div>`;
    }

    static gyorsKot(root) {
        const q = root.querySelector("#crmQuickQ");
        const res = root.querySelector("#crmQuickRes");
        if (!q) return;
        let t = null;
        q.oninput = () => {
            clearTimeout(t);
            const v = q.value.trim();
            if (v.length < 2) { res.innerHTML = ""; return; }
            t = setTimeout(() => Crm.api("/gyors?" + new URLSearchParams({ q: v })).then(d => CrmReq.gyorsRajzol(res, d, v)).catch(() => { }), 250);
        };
    }

    static gyorsRajzol(res, d, v) {
        const esc = Crm.esc;
        const hird = d.hirdetesek.map(i => `
            <div class="crmQuickItem">
                <i class="fa-solid fa-house text-primary" aria-hidden="true"></i>
                <div class="flex-fill min-w-0">
                    <a href="#listing/${i.id}" class="fw-semibold">IP-${i.id} · ${esc(i.cim || Types.label(i.tipus))}</a>
                    <div class="small text-body-secondary">${i.ar ? esc(Utils.eur(i.ar)) + " · " : ""}${esc([i.kerulet, i.varos].filter(Boolean).join(", "))}${i.ugynok_nev ? " · " + esc(i.ugynok_nev) : ""}</div>
                </div>
                <button type="button" class="btn btn-sm btn-outline-primary" data-qmegt="${i.id}" data-qcim="${esc(i.cim || "")}"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${Crm.t("crmViewingShort")}</button>
            </div>`).join("");
        const ugy = d.ugyfelek.map(u => `
            <div class="crmQuickItem">
                <i class="fa-solid fa-user text-success" aria-hidden="true"></i>
                <div class="flex-fill min-w-0">
                    <button type="button" class="btn btn-link p-0 fw-semibold" data-ugyfel="${u.id}">${esc(u.nev)}</button>
                    <div class="small text-body-secondary">${esc(u.telefon || "")} ${Crm.allapotBadge(u.allapot)}</div>
                </div>
            </div>`).join("");
        const hiv = d.hivasok.map(h => `
            <div class="crmQuickItem">
                <i class="fa-solid fa-phone text-warning" aria-hidden="true"></i>
                <div class="flex-fill min-w-0 small">${Crm.t("mkCalledAbout", { nev: esc(h.nev || ""), cim: esc(h.cim || "IP-" + h.ingatlan_id), mikor: Utils.ago(h.created_at) })}</div>
            </div>`).join("");
        res.innerHTML = hird || ugy || hiv
            ? `${hird}${hiv}${ugy}`
            : `<div class="small text-body-secondary py-2">${Crm.t("mkQuickNone")} <button type="button" class="btn btn-link btn-sm p-0" id="crmQuickNew">${Crm.t("crmNewContact")}</button></div>`;
        res.querySelectorAll("[data-qmegt]").forEach(b => b.onclick = () => {
            const ugyfel = d.ugyfelek.length === 1 ? d.ugyfelek[0] : null;
            Crm.megtSzerk({ ingatlan_id: Number(b.dataset.qmegt), ingatlan_cim: b.dataset.qcim, ugyfel_id: ugyfel ? ugyfel.id : null, ugyfel_nev: ugyfel ? ugyfel.nev : "" }, () => Crm.frissit());
        });
        const uj = res.querySelector("#crmQuickNew");
        if (uj) uj.onclick = () => Crm.ugyfelSzerk({ szerepek: ["vevo"], cimkek: [], allapot: "kapcsolat", felelos_id: Crm.en, igeny: null, forras: "telefon", ...(/^[\d\s+()-]{6,}$/.test(v) ? { telefon: v } : { nev: v }) });
        Crm.kotesek(res);
    }

    // ---------- A nézet ----------

    static nezet(body) {
        Crm.betolt(body);
        Crm.api("/keresek?" + new URLSearchParams({ statusz: CrmReq.szuro })).then(d => {
            const esc = Crm.esc;
            if (CrmReq.szuro === "nyitott") CrmReq.badge(d.keresek.filter(k => k.statusz === "uj").length);
            const keres = k => {
                const nyitott = ["uj", "javasolt"].includes(k.statusz);
                const cim = k.ingatlan_id ? `<a href="#listing/${k.ingatlan_id}">IP-${k.ingatlan_id} · ${esc(k.ingatlan_cim || "")}</a>`
                    : `<a href="${esc(k.kulso_link || "#")}" target="_blank" rel="noopener nofollow"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> ${esc((k.kulso_adat && k.kulso_adat.cim) || Crm.domain(k.kulso_link || ""))}</a> <span class="badge text-bg-light">${Crm.t("ofExternal")}</span>`;
                return `
                <article class="crmReq st-${esc(k.statusz)}">
                    <div class="d-flex flex-wrap justify-content-between gap-2">
                        <div class="min-w-0">
                            <div class="fw-semibold">${esc(k.nev || "")} <span class="badge mkSt mkSt-${esc(k.statusz)}">${Crm.t("mkSt_" + k.statusz)}</span></div>
                            <div class="small">${k.telefon ? `<a href="tel:${esc(k.telefon)}"><i class="fa-solid fa-phone" aria-hidden="true"></i> ${esc(k.telefon)}</a>` : ""}${k.email && !/@teszt\.invalid$/.test(k.email) ? ` · <a href="mailto:${esc(k.email)}">${esc(k.email)}</a>` : ""}</div>
                            <div class="small text-truncate">${cim}</div>
                        </div>
                        <div class="small text-body-secondary text-end">${Utils.ago(k.created_at)}${Crm.vezeto && k.felelos_nev ? `<div><i class="fa-regular fa-user" aria-hidden="true"></i> ${esc(k.felelos_nev)}</div>` : ""}</div>
                    </div>
                    ${k.uzenet ? `<blockquote class="small mt-2 mb-2">${esc(k.uzenet)}</blockquote>` : ""}
                    ${k.statusz === "uj" ? `
                        <div class="small fw-semibold mt-2 mb-1">${Crm.t("mkPickSlot")}</div>
                        <div class="mkSlots">
                            ${(k.idopontok || []).map(t => `
                                <button type="button" class="mkSlot ${k.utkozes[t] ? "busy" : ""}" data-elfogad="${k.id}" data-ido="${esc(t)}">
                                    <span><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${esc(CrmReq.ido(t))}</span>
                                    ${k.utkozes[t] ? `<span class="mkBusy"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${Crm.t("mkBusy", { ido: esc(k.utkozes[t].ido), cim: esc(k.utkozes[t].cim || "") })}</span>` : ""}
                                </button>`).join("")}
                        </div>` : ""}
                    ${k.statusz === "javasolt" ? `<div class="small mt-2">${Crm.t("mkProposedWait", { ido: esc(CrmReq.ido(k.javasolt)) })}</div>` : ""}
                    ${k.statusz === "elfogadva" ? `<div class="small mt-2 text-success"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${esc(CrmReq.ido(k.valasztott))}${k.crm_ugyfel_id ? ` · <button type="button" class="btn btn-link btn-sm p-0" data-ugyfel="${k.crm_ugyfel_id}">${Crm.t("mkOpenContact")}</button>` : ""}</div>` : ""}
                    ${k.valasz ? `<div class="small text-body-secondary mt-1"><b>${Crm.t("ofReply")}:</b> ${esc(k.valasz)}</div>` : ""}
                    ${nyitott ? `
                        <div class="d-flex flex-wrap gap-2 mt-2">
                            <button type="button" class="btn btn-sm btn-outline-primary" data-javasol="${k.id}"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${Crm.t("mkPropose")}</button>
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-elutasit="${k.id}">${Crm.t("ofReject")}</button>
                        </div>` : ""}
                </article>`;
            };
            const hivas = h => `
                <li class="list-group-item d-flex flex-wrap align-items-center gap-2">
                    <i class="fa-solid fa-phone text-warning" aria-hidden="true"></i>
                    <div class="flex-fill min-w-0">
                        <div><b>${esc(h.nev || "")}</b> ${h.telefon ? `· <a href="tel:${esc(h.telefon)}">${esc(h.telefon)}</a>` : ""}</div>
                        <div class="small text-body-secondary text-truncate"><a href="#listing/${h.ingatlan_id}">IP-${h.ingatlan_id} · ${esc(h.cim || "")}</a> · ${Utils.ago(h.created_at)}</div>
                    </div>
                    ${h.crm_ugyfel_id ? `<button type="button" class="btn btn-sm btn-link" data-ugyfel="${h.crm_ugyfel_id}">${Crm.t("mkOpenContact")}</button>`
                        : `<button type="button" class="btn btn-sm btn-outline-primary" data-hfelvesz="${h.id}"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${Crm.t("mkAddContact")}</button>`}
                    <button type="button" class="btn btn-sm btn-link text-body-secondary" data-hrejt="${h.id}" aria-label="${esc(Crm.t("mkHide"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </li>`;

            body.innerHTML = `
                ${CrmReq.gyorsHtml()}
                <div class="row g-4">
                    <div class="col-lg-7">
                        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                            <h6 class="mb-0"><i class="fa-solid fa-bell-concierge" aria-hidden="true"></i> ${Crm.t("mkReqsTitle")}</h6>
                            <select class="form-select form-select-sm w-auto" id="crmReqSz" aria-label="${esc(Crm.t("mkReqsTitle"))}">
                                ${["nyitott", "elfogadva", "elutasitva", "lemondva", "mind"].map(s => `<option value="${s}" ${CrmReq.szuro === s ? "selected" : ""}>${Crm.t("mkFilter_" + s)}</option>`).join("")}
                            </select>
                        </div>
                        ${d.keresek.length ? d.keresek.map(keres).join("") : `<div class="emptyState"><i class="fa-regular fa-calendar"></i><p>${Crm.t("mkReqsNone")}</p></div>`}
                    </div>
                    <div class="col-lg-5">
                        <div class="card">
                            <div class="card-header"><h6 class="mb-0"><i class="fa-solid fa-phone-volume" aria-hidden="true"></i> ${Crm.t("mkCallsTitle")}</h6></div>
                            <div class="card-body small text-body-secondary pb-2">${Crm.t("mkCallsHelp")}</div>
                            ${d.hivasok.length ? `<ul class="list-group list-group-flush">${d.hivasok.map(hivas).join("")}</ul>` : `<div class="card-body pt-0 small text-body-secondary">${Crm.t("mkCallsNone")}</div>`}
                        </div>
                    </div>
                </div>`;

            CrmReq.gyorsKot(body);
            Crm.kotesek(body);
            body.querySelector("#crmReqSz").onchange = e => { CrmReq.szuro = e.target.value; CrmReq.nezet(body); };
            const ujra = () => CrmReq.nezet(body);
            const k = id => d.keresek.find(x => String(x.id) === String(id));
            body.querySelectorAll("[data-elfogad]").forEach(b => b.onclick = () => {
                const kk = k(b.dataset.elfogad);
                const busy = kk.utkozes[b.dataset.ido];
                if (!confirm(Crm.t(busy ? "mkAcceptBusyConfirm" : "mkAcceptConfirm", { ido: CrmReq.ido(b.dataset.ido), nev: kk.nev || "" }))) return;
                b.disabled = true;
                Crm.api(`/keresek/${kk.id}/valasz`, { method: "POST", body: { mit: "elfogad", idopont: b.dataset.ido } })
                    .then(() => { Crm.jelez(Crm.t("mkAccepted")); ujra(); }).catch(e => { b.disabled = false; alert(Crm.hiba(e)); });
            });
            body.querySelectorAll("[data-javasol]").forEach(b => b.onclick = () => CrmReq.javasolAblak(k(b.dataset.javasol), ujra));
            body.querySelectorAll("[data-elutasit]").forEach(b => b.onclick = () => {
                const v = prompt(Crm.t("mkRejectMsg"));
                if (v === null) return;
                Crm.api(`/keresek/${b.dataset.elutasit}/valasz`, { method: "POST", body: { mit: "elutasit", valasz: v } }).then(ujra).catch(e => alert(Crm.hiba(e)));
            });
            body.querySelectorAll("[data-hfelvesz]").forEach(b => b.onclick = () => {
                b.disabled = true;
                Crm.api(`/hivasok/${b.dataset.hfelvesz}/felvesz`, { method: "POST" }).then(v => { ujra(); Crm.ugyfelNyit(v.ugyfel_id); }).catch(e => { b.disabled = false; alert(Crm.hiba(e)); });
            });
            body.querySelectorAll("[data-hrejt]").forEach(b => b.onclick = () => Crm.api(`/hivasok/${b.dataset.hrejt}/rejt`, { method: "POST" }).then(ujra).catch(e => alert(Crm.hiba(e))));
        }).catch(e => { body.innerHTML = `<div class="alert alert-danger">${Crm.hiba(e)}</div>`; });
    }

    // Másik időpont javaslata
    static javasolAblak(k, utana) {
        const { tartalom, modal } = Svc.modal("crmMkJav", "");
        const esc = Crm.esc;
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title">${Crm.t("mkPropose")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(Crm.t("crmClose"))}"></button>
            </div>
            <form class="modal-body" id="crmMkJavF">
                <p class="small text-body-secondary">${Crm.t("mkProposeHelp", { nev: esc(k.nev || "") })}</p>
                ${Viewings.slotHtml("cmj", 0)}
                <label class="form-label small mb-1 mt-3" for="cmjMsg">${Crm.t("ofReplyMsg")}</label>
                <textarea class="form-control" id="cmjMsg" rows="2" maxlength="1000"></textarea>
            </form>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${Crm.t("crmCancel")}</button>
                <button type="submit" class="btn btn-primary" form="crmMkJavF">${Crm.t("mkProposeSend")}</button>
            </div>`;
        modal.show();
        tartalom.querySelector("#crmMkJavF").onsubmit = e => {
            e.preventDefault();
            const ido = Viewings.slotErtek(tartalom, "cmj", 0);
            if (!ido) return;
            Crm.api(`/keresek/${k.id}/valasz`, { method: "POST", body: { mit: "javasol", idopont: ido, valasz: tartalom.querySelector("#cmjMsg").value } })
                .then(() => { modal.hide(); Crm.jelez(Crm.t("mkProposedSent")); utana(); }).catch(err => alert(Crm.hiba(err)));
        };
    }

}
