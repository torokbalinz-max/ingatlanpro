// ============================================================
//  Megbízásos hirdetés (Eladjuk helyetted) a hirdetés oldalán
//
//  Ha a hirdetést mi értékesítjük (ingatlanok.megbizas_id), a vevő:
//   - megtekintést kérhet (javasolt időpont),
//   - vételi ajánlatot tehet (összeg, feltételek),
//   - kérdezhet – mindhárom az admin értékesítési felületére megy
//     (Admin → Megbízások), az ajánlatot mi továbbítjuk az eladónak.
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

    static hook(i) {

        if (!i || !i.megbizas_id) return;

        const box = document.getElementById("listingContent");
        if (!box) return;

        // Jelvény a cím fölött
        const jelvenyek = box.querySelector(".listingPageTitle");
        if (jelvenyek && !box.querySelector(".lmBadge")) {
            jelvenyek.insertAdjacentHTML("beforebegin", `<div class="lmBadge"><i class="fa-solid fa-key" aria-hidden="true"></i> ${I18n.t("lmBadge")}</div>`);
        }

        Svc.api("/api/megbizas/hirdetes/" + i.id).then(v => {

            if (!v.aktiv || document.getElementById("lmCard")) return;
            const side = box.querySelector(".listingSide");
            if (!side) return;

            const esc = Utils.escape;
            const sajatKeresek = [
                ...(v.megtekintesek || []).map(t => `<li><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${I18n.t("lmMyViewing")}: ${t.idopont ? esc(Svc.ido(t.idopont)) : esc(t.javasolt || "")} · <span class="text-body-secondary">${esc(I18n.t("mbVw_" + t.statusz))}</span></li>`),
                ...(v.ajanlatok || []).map(a => `<li><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("lmMyOffer")}: <b>${esc(Svc.penz(a.osszeg, a.penznem))}</b> · <span class="text-body-secondary">${esc(I18n.t("lmOf_" + a.statusz))}</span>${a.statusz === "ellenajanlat" && a.ellenajanlat ? ` – ${I18n.t("mmCounter")}: <b>${esc(Svc.penz(a.ellenajanlat, a.penznem))}</b>` : ""}</li>`)
            ];

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
                            <button type="button" class="btn btn-outline-primary" data-lm="ajanlat"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("lmOfferBtn")}</button>
                            <button type="button" class="btn btn-link btn-sm" data-lm="kerdes">${I18n.t("lmAskBtn")}</button>
                        </div>`}
                        ${sajatKeresek.length ? `<ul class="mmList small mt-3 mb-0">${sajatKeresek.join("")}</ul>` : ""}
                    </div>
                </div>`;

            // Az eladó (magánszemély) elérhetősége helyett a mi kártyánk
            const kapcsolat = document.getElementById("lpContactCard");
            if (kapcsolat) kapcsolat.insertAdjacentHTML("beforebegin", html);
            else side.children[0].insertAdjacentHTML("afterend", html);

            side.querySelectorAll("[data-lm]").forEach(b => {
                b.onclick = () => {
                    const nyit = () => ListingMandate.urlap(i, b.dataset.lm);
                    if (!AuthManager.loggedIn()) AuthManager.kell().then(nyit).catch(() => { });
                    else nyit();
                };
            });

        }).catch(() => { });

    }

    static urlap(i, tipus) {

        const esc = Utils.escape;
        const u = AuthManager.user || {};
        const { tartalom, modal } = Svc.modal("lmModal", "");

        tartalom.innerHTML = `
            <form id="lmForm" novalidate>
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fa-solid fa-key" aria-hidden="true"></i> ${I18n.t("lmFormTitle")}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
                </div>
                <div class="modal-body">
                    <div class="btn-group w-100 mb-3" role="group">
                        ${["megtekintes", "ajanlat", "kerdes"].map(t => `
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
                            <select class="form-select" id="lmPenznem"><option>EUR</option><option>RON</option></select>
                        </div>
                        <div class="col-12 lmOnly" data-for="ajanlat">
                            <label class="form-label small mb-1" for="lmFelt">${I18n.t("lmConditions")}</label>
                            <input class="form-control" id="lmFelt" maxlength="1000" placeholder="${esc(I18n.t("lmConditionsPh"))}">
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
                .then(() => {
                    tartalom.innerHTML = `
                        <div class="modal-body text-center py-5">
                            <i class="fa-solid fa-circle-check text-success" style="font-size:2.5rem" aria-hidden="true"></i>
                            <h5 class="mt-3">${I18n.t("lmThanks")}</h5>
                            <p class="text-body-secondary">${I18n.t(body.tipus === "ajanlat" ? "lmThanksOffer" : body.tipus === "megtekintes" ? "lmThanksView" : "lmThanksAsk")}</p>
                            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
                        </div>`;
                    const regi = document.getElementById("lmCard");
                    if (regi) regi.remove();
                    ListingMandate.hook(i);
                })
                .catch(err => { $("#lmKuld").disabled = false; hiba.textContent = Svc.hiba(err); hiba.hidden = false; });
        };

        modal.show();

    }

}

document.addEventListener("DOMContentLoaded", () => ListingMandate.init());
