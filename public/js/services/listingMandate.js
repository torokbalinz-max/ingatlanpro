// ============================================================
//  Megbízásos hirdetés (Eladjuk helyetted) a hirdetés oldalán – a vevő
//
//  Ha a hirdetést mi értékesítjük (ingatlanok.megbizas_id), a vevő:
//   - megtekintést kérhet, kérdezhet (üzenet nekünk),
//   - a kapcsolatfelvétel után (vagy ha az admin engedi, bárki) vételi
//     ajánlatot tehet,
//   - látja az ügyét: megtekintései (lemondás), ajánlatai (az eladó
//     ellenajánlata → elfogadom / új ajánlat, visszavonás), üzenetek.
// ============================================================

class ListingMandate {

    static init() {
        if (typeof ListingPage === "undefined" || ListingPage._mandateHook) return;
        ListingPage._mandateHook = true;
        const eredeti = ListingPage.render;
        ListingPage.render = function (i) {
            eredeti.call(this, i);
            try { ListingMandate.hook(i); } catch (e) { console.error(e); }
        };
    }

    static allapot(a) {
        return I18n.t("lmOf_" + a.statusz);
    }

    static hook(i) {

        if (!i || !i.megbizas_id) return;

        const box = document.getElementById("listingContent");
        if (!box) return;

        // Jelvény a cím fölött
        const cim = box.querySelector(".listingPageTitle");
        if (cim && !box.querySelector(".lmBadge")) {
            cim.insertAdjacentHTML("beforebegin", `<div class="lmBadge"><i class="fa-solid fa-key" aria-hidden="true"></i> ${I18n.t("lmBadge")}</div>`);
        }

        Svc.api("/api/megbizas/hirdetes/" + i.id).then(v => {

            const regi = document.getElementById("lmCard");
            if (regi) regi.remove();
            if (!v.aktiv) return;
            const side = box.querySelector(".listingSide");
            if (!side) return;

            const esc = Utils.escape;
            const ugy = v.erdeklodo;
            const nyitottAj = (v.ajanlatok || []).filter(a => ["uj", "tovabbitva", "ellenajanlat"].includes(a.statusz));
            const ajanlhat = v.ajanlhat || (!AuthManager.loggedIn() && v.ajanlat_feltetel === "barki");

            const megtek = (v.megtekintesek || []).map(t => `
                <li>
                    <i class="fa-regular fa-calendar" aria-hidden="true"></i> ${I18n.t("lmMyViewing")}: <b>${t.idopont ? esc(Svc.ido(t.idopont)) : esc(t.javasolt || I18n.t("mbNoTimeYet"))}</b>
                    · <span class="text-body-secondary">${esc(I18n.t("mbVw_" + t.statusz))}</span>
                    ${["kert", "egyeztetve"].includes(t.statusz) ? `<button type="button" class="btn btn-link btn-sm p-0 ms-1 text-danger" data-lm-lemond="${t.id}">${I18n.t("lmCancel")}</button>` : ""}
                </li>`).join("");

            const ajanl = (v.ajanlatok || []).map(a => `
                <li class="lmOfferRow ${esc(a.statusz)}">
                    <div><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("lmMyOffer")}: <b>${esc(Svc.penz(a.osszeg, a.penznem))}</b> · <span class="text-body-secondary">${esc(ListingMandate.allapot(a))}</span></div>
                    ${a.statusz === "ellenajanlat" ? `
                        <div class="lmCounter">
                            ${I18n.t("lmSellerCounter")}: <b>${esc(Svc.penz(a.ellenajanlat, a.penznem))}</b>
                            ${a.elado_valasz ? `<div class="small text-body-secondary">„${esc(a.elado_valasz)}”</div>` : ""}
                            <div class="d-flex flex-wrap gap-1 mt-1">
                                <button type="button" class="btn btn-sm btn-success" data-lm-elfogad="${a.id}"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("lmAcceptCounter")}</button>
                                <button type="button" class="btn btn-sm btn-outline-primary" data-lm="ajanlat">${I18n.t("lmNewOffer")}</button>
                            </div>
                        </div>` : ""}
                    ${a.statusz === "elfogadva" ? `<div class="small text-success">${I18n.t("lmAcceptedInfo")}</div>` : ""}
                    ${["uj", "tovabbitva"].includes(a.statusz) ? `<button type="button" class="btn btn-link btn-sm p-0 text-danger" data-lm-visszavon="${a.id}">${I18n.t("lmWithdraw")}</button>` : ""}
                </li>`).join("");

            const uzenetek = ugy ? `
                <div class="lmChat">
                    <div class="small fw-semibold mb-1"><i class="fa-regular fa-comments" aria-hidden="true"></i> ${I18n.t("lmMessagesTitle")}</div>
                    <div class="mdBubbles lmBubbles">
                        ${(v.uzenetek || []).length ? v.uzenetek.map(z => `
                            <div class="mdBubble ${z.irany === "be" ? "ki" : "be"}">
                                <div class="mdBubbleText">${esc(z.szoveg)}</div>
                                <small>${z.irany === "ki" ? "IngatlanPro · " : ""}${esc(Svc.ido(z.created_at))}</small>
                            </div>`).join("") : `<p class="small text-body-secondary mb-0">${I18n.t("lmNoMessages")}</p>`}
                    </div>
                    <div class="input-group input-group-sm mt-2">
                        <input class="form-control" id="lmGyors" maxlength="2000" placeholder="${esc(I18n.t("lmWritePh"))}" aria-label="${esc(I18n.t("lmWritePh"))}">
                        <button class="btn btn-primary" type="button" id="lmGyorsKuld" aria-label="${esc(I18n.t("lmSend"))}"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
                    </div>
                </div>` : "";

            const html = `
                <div class="card mt-4 lmCard" id="lmCard">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span class="lmIcon"><i class="fa-solid fa-key" aria-hidden="true"></i></span>
                            <div>
                                <b>${I18n.t("lmTitle")}</b>
                                <div class="small text-body-secondary">${I18n.t("lmText")}</div>
                            </div>
                        </div>
                        ${v.sajat ? `<div class="alert alert-info small py-2 mb-0">${I18n.t("lmOwn")} <a href="#fiok/megbizasok">${I18n.t("accTabMandates")}</a></div>` : `
                        <div class="d-grid gap-2 mt-3">
                            <button type="button" class="btn btn-primary" data-lm="megtekintes"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${I18n.t("lmViewBtn")}</button>
                            ${ajanlhat ? `<button type="button" class="btn btn-outline-primary" data-lm="ajanlat"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t(nyitottAj.length ? "lmNewOffer" : "lmOfferBtn")}</button>` : ""}
                            ${!ugy ? `<button type="button" class="btn btn-link btn-sm" data-lm="kerdes">${I18n.t("lmAskBtn")}</button>` : ""}
                        </div>
                        ${!ajanlhat ? `<p class="small text-body-secondary mt-2 mb-0"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t("lmOfferAfterContact")}</p>` : ""}`}
                        ${megtek || ajanl ? `<ul class="mmList small mt-3 mb-0">${megtek}${ajanl}</ul>` : ""}
                        ${uzenetek}
                    </div>
                </div>`;

            // Az eladó (magánszemély) elérhetősége helyett a mi kártyánk
            const kapcsolat = document.getElementById("lpContactCard");
            // (a megbízásos hirdetésnél minden rajtunk keresztül megy: a hirdető kártyája elrejtve)
            if (kapcsolat) { kapcsolat.insertAdjacentHTML("beforebegin", html); if (!v.sajat) kapcsolat.hidden = true; }
            else side.children[0].insertAdjacentHTML("afterend", html);

            const kartya = document.getElementById("lmCard");
            const bub = kartya.querySelector(".lmBubbles");
            if (bub) bub.scrollTop = bub.scrollHeight;
            const ujra = () => ListingMandate.hook(i);

            kartya.querySelectorAll("[data-lm]").forEach(b => {
                b.onclick = () => {
                    const nyit = () => ListingMandate.urlap(i, b.dataset.lm, v);
                    if (!AuthManager.loggedIn()) AuthManager.kell().then(nyit).catch(() => { });
                    else nyit();
                };
            });
            kartya.querySelectorAll("[data-lm-elfogad]").forEach(b => {
                b.onclick = () => {
                    if (!confirm(I18n.t("lmAcceptCounterConfirm"))) return;
                    b.disabled = true;
                    Svc.api(`/api/megbizas/hirdetes/${i.id}/ajanlat/${b.dataset.lmElfogad}/elfogad`, { method: "POST" })
                        .then(ujra).catch(e => { b.disabled = false; alert(Svc.hiba(e)); });
                };
            });
            kartya.querySelectorAll("[data-lm-visszavon]").forEach(b => {
                b.onclick = () => {
                    if (!confirm(I18n.t("lmWithdrawConfirm"))) return;
                    Svc.api(`/api/megbizas/hirdetes/${i.id}/ajanlat/${b.dataset.lmVisszavon}/visszavon`, { method: "POST" })
                        .then(ujra).catch(e => alert(Svc.hiba(e)));
                };
            });
            kartya.querySelectorAll("[data-lm-lemond]").forEach(b => {
                b.onclick = () => {
                    if (!confirm(I18n.t("lmCancelConfirm"))) return;
                    Svc.api(`/api/megbizas/hirdetes/${i.id}/megtekintes/${b.dataset.lmLemond}/lemond`, { method: "POST" })
                        .then(ujra).catch(e => alert(Svc.hiba(e)));
                };
            });
            const gyors = kartya.querySelector("#lmGyorsKuld");
            if (gyors) {
                const inp = kartya.querySelector("#lmGyors");
                const kuld = () => {
                    const szoveg = inp.value.trim();
                    if (!szoveg) return;
                    gyors.disabled = true;
                    Svc.api(`/api/megbizas/hirdetes/${i.id}/uzenet`, { method: "POST", body: { szoveg } })
                        .then(ujra).catch(e => { gyors.disabled = false; alert(Svc.hiba(e)); });
                };
                gyors.onclick = kuld;
                inp.onkeydown = e => { if (e.key === "Enter") kuld(); };
            }

        }).catch(() => { });

    }

    static urlap(i, tipus, v) {

        const esc = Utils.escape;
        const u = AuthManager.user || {};
        const { tartalom, modal } = Svc.modal("lmModal", "");
        // Az ajánlat csak a kapcsolatfelvétel után (ha a beállítás így szól)
        const ajanlhat = !v || v.ajanlhat || v.ajanlat_feltetel === "barki";
        const tipusok = ["megtekintes", ...(ajanlhat ? ["ajanlat"] : []), "kerdes"];
        if (!tipusok.includes(tipus)) tipus = "megtekintes";
        const pn = (v && v.penznem) || "EUR";

        tartalom.innerHTML = `
            <form id="lmForm" novalidate>
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fa-solid fa-key" aria-hidden="true"></i> ${I18n.t("lmFormTitle")}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
                </div>
                <div class="modal-body">
                    <div class="btn-group w-100 mb-3" role="group">
                        ${tipusok.map(t => `
                            <input type="radio" class="btn-check" name="lmTipus" id="lmT_${t}" value="${t}" ${t === tipus ? "checked" : ""}>
                            <label class="btn btn-outline-primary btn-sm" for="lmT_${t}">${I18n.t("lmType_" + t)}</label>`).join("")}
                    </div>
                    <div class="row g-2">
                        <div class="col-12 lmOnly" data-for="megtekintes">
                            <label class="form-label small mb-1" for="lmMikor">${I18n.t("lmWhen")}</label>
                            <input class="form-control" id="lmMikor" maxlength="300" placeholder="${esc(I18n.t("lmWhenPh"))}">
                        </div>
                        <div class="col-7 lmOnly" data-for="ajanlat">
                            <label class="form-label small mb-1" for="lmOsszeg">${I18n.t("lmAmount")} *</label>
                            <input class="form-control" id="lmOsszeg" type="number" min="1" step="500" value="${i.ar ? Math.round(i.ar * 0.95 / 500) * 500 : ""}">
                        </div>
                        <div class="col-5 lmOnly" data-for="ajanlat">
                            <label class="form-label small mb-1" for="lmPenznem">${I18n.t("finCurrency")}</label>
                            <select class="form-select" id="lmPenznem"><option ${pn !== "RON" ? "selected" : ""}>EUR</option><option ${pn === "RON" ? "selected" : ""}>RON</option></select>
                        </div>
                        <div class="col-12 lmOnly" data-for="ajanlat">
                            <label class="form-label small mb-1" for="lmFelt">${I18n.t("lmConditions")}</label>
                            <input class="form-control" id="lmFelt" maxlength="1000" placeholder="${esc(I18n.t("lmConditionsPh"))}">
                            <div class="form-text">${I18n.t("lmOfferNote")}</div>
                        </div>
                        <div class="col-sm-6 lmOnly" data-for="megtekintes ajanlat">
                            <label class="form-label small mb-1" for="lmKeret">${I18n.t("lmBudget")}</label>
                            <input class="form-control" id="lmKeret" type="number" min="0" step="1000">
                        </div>
                        <div class="col-sm-6 lmOnly" data-for="megtekintes ajanlat">
                            <label class="form-label small mb-1" for="lmFin">${I18n.t("lmFinancing")}</label>
                            <select class="form-select" id="lmFin">
                                <option value="">–</option>
                                ${["keszpenz", "hitel", "vegyes", "egyeb"].map(f => `<option value="${f}">${I18n.t("lmFin_" + f)}</option>`).join("")}
                            </select>
                        </div>
                        <div class="col-12">
                            <label class="form-label small mb-1" for="lmUzenet">${I18n.t("lmMessage")}</label>
                            <textarea class="form-control" id="lmUzenet" rows="3" maxlength="2000"></textarea>
                        </div>
                        <div class="col-12"><hr class="my-2"></div>
                        <div class="col-12">
                            <label class="form-label small mb-1" for="lmNev">${I18n.t("authName")} *</label>
                            <input class="form-control" id="lmNev" maxlength="160" value="${esc(u.nev || "")}">
                        </div>
                        <div class="col-sm-6">
                            <label class="form-label small mb-1" for="lmTel">${I18n.t("accPhone")}</label>
                            <input class="form-control" id="lmTel" type="tel" maxlength="40" value="${esc(u.telefon || "")}">
                        </div>
                        <div class="col-sm-6">
                            <label class="form-label small mb-1" for="lmEmail">${I18n.t("authEmail")}</label>
                            <input class="form-control" id="lmEmail" type="email" maxlength="160" value="${esc(u.email || "")}">
                        </div>
                    </div>
                    <p class="small text-body-secondary mt-3 mb-0">${I18n.t("lmPrivacy")}</p>
                    <div class="alert alert-danger small py-2 mt-2 mb-0" id="lmHiba" hidden></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
                    <button type="submit" class="btn btn-primary" id="lmKuld"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t("lmSend")}</button>
                </div>
            </form>`;

        const $ = q => tartalom.querySelector(q);
        const tipusMost = () => (tartalom.querySelector("input[name=lmTipus]:checked") || {}).value || "kerdes";
        const valt = () => {
            const t = tipusMost();
            tartalom.querySelectorAll(".lmOnly").forEach(el => { el.hidden = !el.dataset.for.split(" ").includes(t); });
        };
        tartalom.querySelectorAll("input[name=lmTipus]").forEach(r => { r.onchange = valt; });
        valt();

        $("#lmForm").onsubmit = e => {
            e.preventDefault();
            const hiba = $("#lmHiba");
            hiba.hidden = true;
            const body = {
                tipus: tipusMost(),
                javasolt: $("#lmMikor").value,
                osszeg: $("#lmOsszeg").value,
                penznem: $("#lmPenznem").value,
                feltetelek: $("#lmFelt").value,
                koltsegkeret: $("#lmKeret").value,
                finanszirozas: $("#lmFin").value,
                uzenet: $("#lmUzenet").value,
                nev: $("#lmNev").value,
                telefon: $("#lmTel").value,
                email: $("#lmEmail").value
            };
            $("#lmKuld").disabled = true;
            Svc.api(`/api/megbizas/hirdetes/${i.id}/keres`, { method: "POST", body })
                .then(r => {
                    tartalom.innerHTML = `
                        <div class="modal-body text-center py-5">
                            <i class="fa-solid fa-circle-check text-success" style="font-size:2.5rem" aria-hidden="true"></i>
                            <h5 class="mt-3">${I18n.t("lmThanks")}</h5>
                            <p class="text-body-secondary">${I18n.t(body.tipus === "ajanlat" ? (r.tovabbitva ? "lmThanksOfferDirect" : "lmThanksOffer") : body.tipus === "megtekintes" ? "lmThanksView" : "lmThanksAsk")}</p>
                            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
                        </div>`;
                    ListingMandate.hook(i);
                })
                .catch(err => { $("#lmKuld").disabled = false; hiba.textContent = Svc.hiba(err); hiba.hidden = false; });
        };

        modal.show();

    }

}

document.addEventListener("DOMContentLoaded", () => ListingMandate.init());
