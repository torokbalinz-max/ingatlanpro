// ============================================================
//  Fiókom → Megbízásaim (#fiok/megbizasok) – az eladó nézete
//
//  Megbízásonként egy kártya:
//    - hol tart (lépések), ki az ügyintézője
//    - „Teendőd” sáv: elfogadandó szerződés, válaszra váró ajánlat,
//      olvasatlan üzenet
//    - fülek: Áttekintés · Ajánlatok · Megtekintések · Üzenetek ·
//      Szerződés és iratok · Napló
//  Az ajánlatra: elfogadom / ellenajánlat / nem fogadom el (ablakban).
// ============================================================

class MyMandates {

    static LEPESEK = ["uj", "egyeztetes", "szerzodes", "fotozas", "hirdetes", "targyalas", "eladva"];
    static ful = {};        // megbízásonként a megnyitott fül

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
            const valaszra = m.ajanlatok.filter(a => a.statusz === "tovabbitva");
            const szerzodesVar = m.szerzodes_allapot === "elkuldve";
            const hianyIrat = m.iratok.filter(x => !x.megvan);
            const ful = MyMandates.ful[m.id] || (szerzodesVar ? "szerzodes" : valaszra.length ? "ajanlatok" : m.olvasatlan ? "uzenetek" : "attekintes");

            const teendo = [
                szerzodesVar ? `<button type="button" class="mmTodo" data-mm-ful="${m.id}:szerzodes"><i class="fa-solid fa-file-signature" aria-hidden="true"></i> ${I18n.t("mmTodoContract")}</button>` : "",
                valaszra.length ? `<button type="button" class="mmTodo" data-mm-ful="${m.id}:ajanlatok"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.f("mmTodoOffers", { n: valaszra.length })}</button>` : "",
                m.olvasatlan ? `<button type="button" class="mmTodo" data-mm-ful="${m.id}:uzenetek"><i class="fa-regular fa-envelope" aria-hidden="true"></i> ${I18n.f("mmTodoMessages", { n: m.olvasatlan })}</button>` : "",
                !lezart && m.statusz !== "eladva" && ["szerzodes", "fotozas", "hirdetes", "targyalas"].includes(m.statusz) && hianyIrat.length ? `<button type="button" class="mmTodo info" data-mm-ful="${m.id}:szerzodes"><i class="fa-solid fa-folder-open" aria-hidden="true"></i> ${I18n.f("mmTodoDocs", { n: hianyIrat.length })}</button>` : ""
            ].filter(Boolean);

            const fulek = [
                { k: "attekintes", n: 0 },
                { k: "ajanlatok", n: valaszra.length },
                { k: "megtekintesek", n: 0 },
                { k: "uzenetek", n: m.olvasatlan },
                { k: "szerzodes", n: szerzodesVar ? 1 : 0 },
                { k: "naplo", n: 0 }
            ];

            return `
                <article class="card mb-4 mmCard" data-mm="${m.id}">
                    <div class="card-body">
                        <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
                            <div class="min-w-0">
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

                        ${m.felelos ? `
                        <div class="mmContact">
                            <i class="fa-solid fa-user-tie" aria-hidden="true"></i>
                            <span>${I18n.t("mmYourAgent")}: <b>${esc(m.felelos.nev || "")}</b>${m.felelos.telefon ? ` · <a href="tel:${esc(String(m.felelos.telefon).replace(/\s/g, ""))}">${esc(m.felelos.telefon)}</a>` : ""}</span>
                        </div>` : ""}

                        ${teendo.length ? `<div class="mmTodos"><span class="small fw-semibold">${I18n.t("mmYourTodo")}</span>${teendo.join("")}</div>` : ""}

                        <nav class="mdTabs mdTabsSm mt-3" role="tablist">
                            ${fulek.map(f => `
                                <button type="button" role="tab" class="mdTab ${f.k === ful ? "active" : ""}" data-mm-ful="${m.id}:${f.k}" aria-selected="${f.k === ful}">
                                    <span>${I18n.t("mmTab_" + f.k)}</span>${f.n ? `<span class="mdTabCount warn">${f.n}</span>` : ""}
                                </button>`).join("")}
                        </nav>
                        <div class="mmFul">${MyMandates.fulHtml(m, ful)}</div>
                    </div>
                </article>`;

        }).join("") + `<p class="small text-body-secondary">${I18n.t("mmHelp")} <a href="#eladjuk">${I18n.t("menuEladjuk")}</a></p>`;

        MyMandates.kot(el, lista);

    }

    static fulHtml(m, ful) {

        const esc = Utils.escape;

        if (ful === "ajanlatok") {
            if (!m.ajanlatok.length) return `<p class="text-body-secondary small mb-0">${I18n.t("mmNoOffersYet")}</p>`;
            return m.ajanlatok.map(a => `
                <div class="mmOffer ${esc(a.statusz)}">
                    <div class="d-flex flex-wrap justify-content-between gap-2">
                        <div>
                            <b class="fs-5">${esc(Svc.penz(a.osszeg, a.penznem))}</b>
                            ${m.kert_ar ? `<span class="small text-body-secondary"> (${MyMandates.szazalek(a.osszeg, m.kert_ar)})</span>` : ""}
                            <div class="small text-body-secondary">${esc(Svc.nap(a.tovabbitva_at || a.created_at))}${a.finanszirozas ? " · " + esc(I18n.t("lmFin_" + a.finanszirozas)) : ""}${a.feltetelek ? " · " + esc(a.feltetelek) : ""}</div>
                            ${a.ellenajanlat ? `<div class="small">${I18n.t("mmYourCounter")}: <b>${esc(Svc.penz(a.ellenajanlat, a.penznem))}</b></div>` : ""}
                            ${a.statusz === "elfogadva" && a.vegso_osszeg ? `<div class="small text-success fw-semibold">${I18n.t("mdAgreed")}: ${esc(Svc.penz(a.vegso_osszeg, a.penznem))}</div>` : ""}
                            ${a.elado_valasz ? `<div class="small text-body-secondary">„${esc(a.elado_valasz)}”</div>` : ""}
                        </div>
                        <span class="badge align-self-start text-bg-${a.statusz === "elfogadva" ? "success" : a.statusz === "elutasitva" || a.statusz === "visszavonva" ? "secondary" : a.statusz === "ellenajanlat" ? "info" : "warning"}">${esc(I18n.t("mmOf_" + a.statusz))}</span>
                    </div>
                    ${a.statusz === "tovabbitva" ? `
                        <div class="d-flex flex-wrap gap-2 mt-2">
                            <button type="button" class="btn btn-sm btn-success" data-valasz="elfogad" data-m="${m.id}" data-a="${a.id}"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("mmAccept")}</button>
                            <button type="button" class="btn btn-sm btn-outline-primary" data-valasz="ellen" data-m="${m.id}" data-a="${a.id}"><i class="fa-solid fa-right-left" aria-hidden="true"></i> ${I18n.t("mmCounterBtn")}</button>
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-valasz="elutasit" data-m="${m.id}" data-a="${a.id}"><i class="fa-solid fa-xmark" aria-hidden="true"></i> ${I18n.t("mmReject")}</button>
                        </div>` : ""}
                </div>`).join("");
        }

        if (ful === "megtekintesek") {
            if (!m.megtekintesek.length) return `<p class="text-body-secondary small mb-0">${I18n.t("mbNoViewings")}</p>`;
            return `<ul class="mmList">${m.megtekintesek.map(t => `<li><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${esc(Svc.ido(t.idopont))} · <span class="text-body-secondary">${esc(I18n.t("mbVw_" + t.statusz))}</span>${t.visszajelzes && t.statusz === "megtortent" ? `<div class="small text-body-secondary">${esc(t.visszajelzes)}</div>` : ""}</li>`).join("")}</ul>`;
        }

        if (ful === "uzenetek") {
            return `
                <div class="mdBubbles mmBubbles">
                    ${m.uzenetek.length ? m.uzenetek.map(z => `
                        <div class="mdBubble ${z.irany === "be" ? "ki" : "be"}">
                            <div class="mdBubbleText">${esc(z.szoveg)}</div>
                            <small>${z.irany === "ki" ? esc(z.szerzo || "IngatlanPro") + " · " : ""}${esc(Svc.ido(z.created_at))}</small>
                        </div>`).join("") : `<p class="text-body-secondary small text-center my-3">${I18n.t("mmNoMessages")}</p>`}
                </div>
                ${!["lezarva", "elutasitva"].includes(m.statusz) ? `
                <div class="mt-2">
                    <textarea class="form-control" rows="2" maxlength="4000" data-mm-uz="${m.id}" placeholder="${esc(I18n.t("mmWritePh"))}" aria-label="${esc(I18n.t("mmWritePh"))}"></textarea>
                    <div class="text-end mt-2"><button type="button" class="btn btn-sm btn-primary" data-mm-kuld="${m.id}"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t("lmSend")}</button></div>
                </div>` : ""}`;
        }

        if (ful === "szerzodes") {
            const lepesek = ["tervezet", "elkuldve", "elfogadva", "alairva"];
            const i = lepesek.indexOf(m.szerzodes_allapot || "tervezet");
            return `
                <div class="row g-3">
                    <div class="col-lg-6">
                        <ol class="mmSteps mb-2">${lepesek.map((s, n) => `<li class="${n < i ? "done" : n === i ? "current" : ""}"><span></span>${esc(I18n.t("mdCst_" + s))}</li>`).join("")}</ol>
                        ${m.szerzodes_allapot === "elkuldve" ? `
                            <div class="mmContractBox">
                                <p class="mb-2">${I18n.t("mmContractReady")}</p>
                                <a class="btn btn-sm btn-outline-secondary mb-2" href="/api/megbizas/${m.id}/szerzodes" target="_blank" rel="noopener"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> ${I18n.t("mmReadContract")}</a>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="checkbox" id="mmSzOk${m.id}">
                                    <label class="form-check-label small" for="mmSzOk${m.id}">${I18n.t("mmContractAgree")}</label>
                                </div>
                                <button type="button" class="btn btn-sm btn-success" data-mm-szerz="${m.id}" disabled><i class="fa-solid fa-signature" aria-hidden="true"></i> ${I18n.t("mmAcceptContract")}</button>
                            </div>` : `
                            <a class="btn btn-sm btn-outline-secondary" href="/api/megbizas/${m.id}/szerzodes" target="_blank" rel="noopener"><i class="fa-solid fa-file-signature" aria-hidden="true"></i> ${I18n.t(m.alairva || m.szerzodes_elfogadva ? "mmContract" : "sfContractDraft")}</a>`}
                        <div class="small text-body-secondary mt-2">
                            ${m.szerzodes_elfogadva ? `<div>${I18n.t("mdAcceptedOnline")}: ${esc(Svc.ido(m.szerzodes_elfogadva))}</div>` : ""}
                            ${m.alairva ? `<div>${I18n.t("mbSigned")}: ${esc(Svc.nap(m.alairva))}</div>` : ""}
                            ${m.lejar ? `<div>${I18n.t("mdExpires")}: ${esc(Svc.nap(m.lejar))}</div>` : ""}
                            ${m.jutalek !== null ? `<div>${I18n.t("mbCommission")}: ${esc(Utils.num(m.jutalek, 1))}%${m.kizarolagos ? " · " + I18n.t("mbExclusive") : ""}</div>` : ""}
                        </div>
                    </div>
                    <div class="col-lg-6">
                        <h6 class="small text-uppercase text-body-secondary">${I18n.t("mmDocsTitle")}</h6>
                        <ul class="mmDocs">${m.iratok.map(x => `<li class="${x.megvan ? "ok" : ""}"><i class="fa-solid ${x.megvan ? "fa-circle-check" : "fa-circle"}" aria-hidden="true"></i> ${esc(Svc.t(x.nev))}</li>`).join("")}</ul>
                        <p class="small text-body-secondary mb-0">${I18n.t("mmDocsHelp")}</p>
                    </div>
                </div>`;
        }

        if (ful === "naplo") {
            if (!m.naplo.length) return `<p class="text-body-secondary small mb-0">–</p>`;
            return `<ul class="mmList">${m.naplo.map(n => `<li><span class="small text-body-secondary">${esc(Svc.ido(n.created_at))}</span> · ${n.tipus === "statusz" ? `<b>${esc(MyMandates.statuszNev(n.szoveg))}</b>` : esc(n.szoveg)}</li>`).join("")}</ul>`;
        }

        // Áttekintés
        return `
            <div class="row g-3">
                <div class="col-4"><div class="mmStat"><i class="fa-solid fa-users" aria-hidden="true"></i><b>${m.erdeklodok}</b><span>${I18n.t("mmInterested")}</span></div></div>
                <div class="col-4"><div class="mmStat"><i class="fa-solid fa-door-open" aria-hidden="true"></i><b>${m.megtekintesek.length}</b><span>${I18n.t("mmViewings")}</span></div></div>
                <div class="col-4"><div class="mmStat"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i><b>${m.ajanlatok.length}</b><span>${I18n.t("mmOffers")}</span></div></div>
            </div>
            <div class="d-flex flex-wrap gap-2 mt-3">
                ${m.ingatlan_id ? `<a class="btn btn-sm btn-outline-primary" href="#listing/${m.ingatlan_id}"><i class="fa-solid fa-rectangle-list" aria-hidden="true"></i> ${I18n.t("mmListing")}</a>` : `<span class="small text-body-secondary align-self-center">${I18n.t("mmNoListingYet")}</span>`}
                ${["uj", "egyeztetes"].includes(m.statusz) ? `<button type="button" class="btn btn-sm btn-link text-danger ms-auto" data-visszavon="${m.id}">${I18n.t("mmWithdraw")}</button>` : ""}
            </div>`;

    }

    static kot(el, lista) {

        el.querySelectorAll("[data-mm-ful]").forEach(b => {
            b.onclick = () => {
                const [id, ful] = b.dataset.mmFul.split(":");
                MyMandates.ful[id] = ful;
                const m = lista.find(x => x.id === Number(id));
                if (ful === "uzenetek" && m.olvasatlan) {
                    m.olvasatlan = 0;
                    Svc.api(`/api/megbizas/sajat/${id}/olvasva`, { method: "POST" }).catch(() => { });
                }
                MyMandates.rajzol(el, lista);
                const kartya = el.querySelector(`[data-mm="${id}"] .mdTabs`);
                if (kartya) kartya.scrollIntoView({ block: "nearest", behavior: "smooth" });
            };
        });

        // Ha az üzenetek fül már nyitva van, az olvasatlanok olvasottak
        lista.forEach(m => {
            if (m.olvasatlan && el.querySelector(`[data-mm-kuld="${m.id}"]`)) {
                Svc.api(`/api/megbizas/sajat/${m.id}/olvasva`, { method: "POST" }).catch(() => { });
            }
        });

        el.querySelectorAll(".mmBubbles").forEach(b => { b.scrollTop = b.scrollHeight; });

        el.querySelectorAll("[data-valasz]").forEach(b => {
            b.onclick = () => MyMandates.valasz(el, lista.find(x => x.id === Number(b.dataset.m)), Number(b.dataset.a), b.dataset.valasz);
        });

        el.querySelectorAll("[data-mm-kuld]").forEach(b => {
            b.onclick = () => {
                const id = b.dataset.mmKuld;
                const ta = el.querySelector(`[data-mm-uz="${id}"]`);
                const szoveg = ta.value.trim();
                if (!szoveg) return;
                b.disabled = true;
                Svc.api(`/api/megbizas/sajat/${id}/uzenet`, { method: "POST", body: { szoveg } })
                    .then(() => { MyMandates.ful[id] = "uzenetek"; MyMandates.render(el); })
                    .catch(e => { b.disabled = false; alert(Svc.hiba(e)); });
            };
        });

        el.querySelectorAll("[data-mm-szerz]").forEach(b => {
            const id = b.dataset.mmSzerz;
            const chk = el.querySelector("#mmSzOk" + id);
            if (chk) chk.onchange = () => { b.disabled = !chk.checked; };
            b.onclick = () => {
                b.disabled = true;
                Svc.api(`/api/megbizas/sajat/${id}/szerzodes-elfogad`, { method: "POST", body: { elfogad: true } })
                    .then(() => { MyMandates.ful[id] = "szerzodes"; MyMandates.render(el); })
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

    // Válasz egy ajánlatra – ablakban
    static valasz(el, m, aid, tipus) {

        const esc = Utils.escape;
        const a = m.ajanlatok.find(x => x.id === aid);
        const { tartalom, modal } = Svc.modal("mmValaszModal", "");

        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title">${I18n.t(tipus === "elfogad" ? "mmAcceptTitle" : tipus === "ellen" ? "mmCounterTitle" : "mmRejectTitle")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
            </div>
            <div class="modal-body">
                <p class="mb-3">${I18n.t("mmOfferWas")}: <b>${esc(Svc.penz(a.osszeg, a.penznem))}</b>${m.kert_ar ? ` <span class="text-body-secondary">(${MyMandates.szazalek(a.osszeg, m.kert_ar)})</span>` : ""}</p>
                ${tipus === "ellen" ? `
                    <label class="form-label" for="mmvOsszeg">${I18n.t("mmCounterPrompt")}</label>
                    <div class="input-group mb-3">
                        <input class="form-control" id="mmvOsszeg" type="number" min="1" step="500" value="${m.kert_ar ? Math.round(((Number(a.osszeg) + Number(m.kert_ar)) / 2) / 500) * 500 : ""}">
                        <span class="input-group-text">${esc(a.penznem)}</span>
                    </div>` : ""}
                ${tipus === "elfogad" ? `<p class="small text-body-secondary">${I18n.t("mmAcceptConfirm")}</p>` : `
                    <label class="form-label" for="mmvUz">${I18n.t("mmMessagePrompt")}</label>
                    <textarea class="form-control" id="mmvUz" rows="3" maxlength="1000"></textarea>`}
                <div class="alert alert-danger small py-2 mt-3 mb-0" id="mmvHiba" hidden></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
                <button type="button" class="btn ${tipus === "elutasit" ? "btn-secondary" : "btn-success"}" id="mmvOk">${I18n.t(tipus === "elfogad" ? "mmAccept" : tipus === "ellen" ? "mmSendCounter" : "mmReject")}</button>
            </div>`;

        const $ = q => tartalom.querySelector(q);
        $("#mmvOk").onclick = () => {
            const body = { valasz: tipus };
            if (tipus === "ellen") {
                body.osszeg = Number($("#mmvOsszeg").value);
                if (!body.osszeg) { $("#mmvHiba").textContent = I18n.t("svcErr_bad_amount"); $("#mmvHiba").hidden = false; return; }
            }
            if ($("#mmvUz") && $("#mmvUz").value.trim()) body.uzenet = $("#mmvUz").value.trim();
            $("#mmvOk").disabled = true;
            Svc.api(`/api/megbizas/sajat/${m.id}/ajanlat/${aid}/valasz`, { method: "POST", body })
                .then(() => { modal.hide(); MyMandates.ful[m.id] = "ajanlatok"; MyMandates.render(el); })
                .catch(e => { $("#mmvOk").disabled = false; $("#mmvHiba").textContent = Svc.hiba(e); $("#mmvHiba").hidden = false; });
        };

        modal.show();

    }

}
