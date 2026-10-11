// ============================================================
//  Fiókom → Megbízásaim (#fiok/megbizasok)
//
//  Az „Eladjuk helyetted” megbízásaim: hol tart (idővonal), a
//  hirdetés, hány érdeklődő van, az egyeztetett megtekintések, és a
//  nekem továbbított vételi ajánlatok – elfogadom / nem / ellenajánlat.
// ============================================================

class MyMandates {

    static LEPESEK = ["uj", "egyeztetes", "szerzodes", "fotozas", "hirdetes", "targyalas", "eladva"];

    static render(el) {

        AccountPage.spinner(el);

        Svc.api("/api/megbizas/sajat").then(lista => MyMandates.rajzol(el, lista)).catch(() => {
            el.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
        });

    }

    static szazalek(osszeg, kert) {
        const p = Math.round((osszeg / kert - 1) * 100);
        return (p > 0 ? "+" : "") + p + "%";
    }

    static statuszNev(s) {
        return I18n.t("mbSt_" + s);
    }

    static rajzol(el, lista) {

        const esc = Utils.escape;

        if (!lista.length) {
            el.innerHTML = `
                <div class="emptyState">
                    <i class="fa-solid fa-key"></i>
                    <h5>${I18n.t("mmNone")}</h5>
                    <p>${I18n.t("mmNoneText")}</p>
                    <a class="btn btn-primary" href="#eladjuk">${I18n.t("menuEladjuk")}</a>
                </div>`;
            return;
        }

        el.innerHTML = lista.map(m => {

            const idx = MyMandates.LEPESEK.indexOf(m.statusz);
            const lezart = ["lezarva", "elutasitva"].includes(m.statusz);

            return `
                <article class="card mb-4 mmCard">
                    <div class="card-body">
                        <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
                            <div>
                                <div class="small text-body-secondary">${esc(m.szerzodes_szam || "")} · ${esc(Svc.nap(m.created_at))}</div>
                                <h5 class="mb-1">${esc(Types.label(m.tipus))} · ${esc(Types.ugyletLabel(m.ugylet))}${m.nm ? ` · ${esc(Utils.nm(m.nm))}` : ""}</h5>
                                <div class="text-body-secondary"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc([m.cim, m.telepules, m.varos ? CityManager.displayName(m.varos) : ""].filter(Boolean).join(", ") || "–")}</div>
                            </div>
                            <div class="text-end">
                                <span class="badge mbBadge mb-${esc(m.statusz)}">${esc(MyMandates.statuszNev(m.statusz))}</span>
                                ${m.kert_ar ? `<div class="mt-1 small">${I18n.t("sfPrice")}: <b>${esc(Svc.penz(m.kert_ar, m.penznem))}</b></div>` : ""}
                            </div>
                        </div>

                        ${!lezart ? `
                        <ol class="mmSteps">
                            ${MyMandates.LEPESEK.map((s, i) => `<li class="${i < idx ? "done" : i === idx ? "current" : ""}"><span></span>${esc(MyMandates.statuszNev(s))}</li>`).join("")}
                        </ol>` : ""}

                        <div class="row g-3 mt-1">
                            <div class="col-md-4">
                                <div class="mmStat"><i class="fa-solid fa-users" aria-hidden="true"></i><b>${m.erdeklodok}</b><span>${I18n.t("mmInterested")}</span></div>
                            </div>
                            <div class="col-md-4">
                                <div class="mmStat"><i class="fa-solid fa-door-open" aria-hidden="true"></i><b>${m.megtekintesek.length}</b><span>${I18n.t("mmViewings")}</span></div>
                            </div>
                            <div class="col-md-4">
                                <div class="mmStat"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i><b>${m.ajanlatok.length}</b><span>${I18n.t("mmOffers")}</span></div>
                            </div>
                        </div>

                        ${m.ajanlatok.length ? `
                            <h6 class="mt-4">${I18n.t("mmOffersTitle")}</h6>
                            ${m.ajanlatok.map(a => `
                                <div class="mmOffer ${esc(a.statusz)}">
                                    <div class="d-flex flex-wrap justify-content-between gap-2">
                                        <div>
                                            <b class="fs-5">${esc(Svc.penz(a.osszeg, a.penznem))}</b>
                                            ${m.kert_ar ? `<span class="small text-body-secondary"> (${MyMandates.szazalek(a.osszeg, m.kert_ar)})</span>` : ""}
                                            <div class="small text-body-secondary">${esc(Svc.nap(a.created_at))}${a.feltetelek ? " · " + esc(a.feltetelek) : ""}</div>
                                            ${a.ellenajanlat ? `<div class="small">${I18n.t("mmCounter")}: <b>${esc(Svc.penz(a.ellenajanlat, a.penznem))}</b></div>` : ""}
                                        </div>
                                        <span class="badge align-self-start text-bg-${a.statusz === "elfogadva" ? "success" : a.statusz === "elutasitva" ? "secondary" : a.statusz === "ellenajanlat" ? "info" : "warning"}">${esc(I18n.t("mbOf_" + a.statusz))}</span>
                                    </div>
                                    ${a.statusz === "tovabbitva" ? `
                                        <div class="d-flex flex-wrap gap-2 mt-2">
                                            <button type="button" class="btn btn-sm btn-success" data-valasz="elfogad" data-m="${m.id}" data-a="${a.id}"><i class="fa-solid fa-check"></i> ${I18n.t("mmAccept")}</button>
                                            <button type="button" class="btn btn-sm btn-outline-primary" data-valasz="ellen" data-m="${m.id}" data-a="${a.id}"><i class="fa-solid fa-right-left"></i> ${I18n.t("mmCounterBtn")}</button>
                                            <button type="button" class="btn btn-sm btn-outline-secondary" data-valasz="elutasit" data-m="${m.id}" data-a="${a.id}"><i class="fa-solid fa-xmark"></i> ${I18n.t("mmReject")}</button>
                                        </div>` : ""}
                                </div>`).join("")}` : ""}

                        ${m.megtekintesek.length ? `
                            <h6 class="mt-4">${I18n.t("mmViewingsTitle")}</h6>
                            <ul class="mmList">
                                ${m.megtekintesek.map(t => `<li><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${esc(Svc.ido(t.idopont))} · <span class="text-body-secondary">${esc(I18n.t("mbVw_" + t.statusz))}</span>${t.visszajelzes ? `<div class="small text-body-secondary">${esc(t.visszajelzes)}</div>` : ""}</li>`).join("")}
                            </ul>` : ""}

                        ${m.naplo.length ? `
                            <details class="mt-3 mmLog">
                                <summary>${I18n.t("mmTimeline")} (${m.naplo.length})</summary>
                                <ul class="mmList">
                                    ${m.naplo.map(n => `<li><span class="small text-body-secondary">${esc(Svc.ido(n.created_at))}</span> · ${n.tipus === "statusz" ? `<b>${esc(MyMandates.statuszNev(n.szoveg))}</b>` : esc(n.szoveg)}</li>`).join("")}
                                </ul>
                            </details>` : ""}

                        <div class="d-flex flex-wrap gap-2 mt-3">
                            ${m.ingatlan_id ? `<a class="btn btn-sm btn-outline-primary" href="#listing/${m.ingatlan_id}"><i class="fa-solid fa-rectangle-list"></i> ${I18n.t("mmListing")}</a>` : ""}
                            <a class="btn btn-sm btn-outline-secondary" href="/api/megbizas/${m.id}/szerzodes" target="_blank" rel="noopener"><i class="fa-solid fa-file-signature"></i> ${I18n.t(m.alairva ? "mmContract" : "sfContractDraft")}</a>
                            ${["uj", "egyeztetes"].includes(m.statusz) ? `<button type="button" class="btn btn-sm btn-link text-danger ms-auto" data-visszavon="${m.id}">${I18n.t("mmWithdraw")}</button>` : ""}
                        </div>
                    </div>
                </article>`;

        }).join("") + `<p class="small text-body-secondary">${I18n.t("mmHelp")} <a href="#eladjuk">${I18n.t("menuEladjuk")}</a></p>`;

        el.querySelectorAll("[data-valasz]").forEach(b => {
            b.onclick = () => {
                const body = { valasz: b.dataset.valasz };
                if (body.valasz === "ellen") {
                    const v = prompt(I18n.t("mmCounterPrompt"));
                    if (!v) return;
                    body.osszeg = Number(String(v).replace(/[^\d.,]/g, "").replace(",", "."));
                    if (!body.osszeg) return;
                }
                if (body.valasz === "elfogad" && !confirm(I18n.t("mmAcceptConfirm"))) return;
                const uz = body.valasz !== "elfogad" ? prompt(I18n.t("mmMessagePrompt")) : null;
                if (uz) body.uzenet = uz;
                b.disabled = true;
                Svc.api(`/api/megbizas/sajat/${b.dataset.m}/ajanlat/${b.dataset.a}/valasz`, { method: "POST", body })
                    .then(() => MyMandates.render(el))
                    .catch(e => { b.disabled = false; alert(Svc.hiba(e)); });
            };
        });

        el.querySelectorAll("[data-visszavon]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("mmWithdrawConfirm"))) return;
                Svc.api(`/api/megbizas/sajat/${b.dataset.visszavon}/visszavon`, { method: "POST" })
                    .then(() => MyMandates.render(el))
                    .catch(e => alert(Svc.hiba(e)));
            };
        });

    }

}
