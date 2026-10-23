// ============================================================
//  Admin – Webhely adatai (az üzemeltető adatai)
//
//  Ezeket veszi át minden jogi oldal (Impresszum, Felhasználási
//  feltételek, Adatvédelem, Sütik) és a lábléc. A kapcsolattartó
//  e-mail, ha üres, az admin e-mail címe. Cégnél / PFA-nál az
//  adószámból (CUI) az ANAF adataival egy gombbal kitölthető.
// ============================================================

AdminManager.renderSiteSettings = function () {

    AdminManager.loading();

    fetch("/api/admin/oldal-adatok")
        .then(r => r.json())
        .then(d => AdminManager.drawSiteSettings(d.adat || {}, d.adminEmail || ""))
        .catch(() => { AdminManager.box().innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`; });

};

AdminManager.drawSiteSettings = function (a, adminEmail) {

    const esc = Utils.escape;
    const box = AdminManager.box();
    const ceg = a.tipus === "ceg" || a.tipus === "pfa";

    // Ami még hiányzik (a jogi oldalakon "kitöltendő" jelzés látszik a helyén)
    const hianyzik = [];
    if (!a.nev) hianyzik.push(I18n.t("wsName"));
    if (!a.cim) hianyzik.push(I18n.t("wsAddress"));
    if (!a.email && !adminEmail) hianyzik.push(I18n.t("authEmail"));
    if (ceg && !a.adoszam) hianyzik.push(I18n.t("wsCui"));
    if (ceg && !a.cegjegyzekszam) hianyzik.push(I18n.t("wsRegCom"));

    box.innerHTML = `
        <div class="row g-4">
            <div class="col-xl-7">
                <form class="card" id="wsForm" novalidate>
                    <div class="card-body">

                        <fieldset class="mb-4">
                            <legend class="form-label">${I18n.t("wsType")}</legend>
                            <div class="btn-group flex-wrap" role="group">
                                ${[["maganszemely", "wsTypePerson"], ["pfa", "wsTypePfa"], ["ceg", "wsTypeCompany"]].map(([k, l]) => `
                                    <input type="radio" class="btn-check" name="tipus" id="wsT_${k}" value="${k}" ${(a.tipus || "maganszemely") === k ? "checked" : ""}>
                                    <label class="btn btn-outline-primary btn-sm" for="wsT_${k}">${I18n.t(l)}</label>`).join("")}
                            </div>
                        </fieldset>

                        <div class="row g-3">
                            <div class="col-md-6 wsCegOnly" ${ceg ? "" : "hidden"}>
                                <label class="form-label" for="wsCui">${I18n.t("wsCui")}</label>
                                <div class="input-group">
                                    <input class="form-control" id="wsCui" name="adoszam" maxlength="20" value="${esc(a.adoszam || "")}" placeholder="RO12345678" autocomplete="off">
                                    <button class="btn btn-outline-primary" type="button" id="wsAnaf"><i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i> ${I18n.t("wsAnafFill")}</button>
                                </div>
                                <div class="form-text">${I18n.t("wsAnafHelp")}</div>
                            </div>
                            <div class="col-md-6 wsCegOnly" ${ceg ? "" : "hidden"}>
                                <label class="form-label" for="wsRegCom">${I18n.t("wsRegCom")}</label>
                                <input class="form-control" id="wsRegCom" name="cegjegyzekszam" maxlength="40" value="${esc(a.cegjegyzekszam || "")}" placeholder="J14/123/2026">
                            </div>
                            <div class="col-12" id="wsAnafResult" aria-live="polite"></div>
                            <div class="col-12">
                                <label class="form-label" for="wsNev">${I18n.t("wsName")}</label>
                                <input class="form-control" id="wsNev" name="nev" maxlength="160" value="${esc(a.nev || "")}">
                                <div class="form-text">${I18n.t("wsNameHelp")}</div>
                            </div>
                            <div class="col-12">
                                <label class="form-label" for="wsCim">${I18n.t("wsAddress")}</label>
                                <input class="form-control" id="wsCim" name="cim" maxlength="300" value="${esc(a.cim || "")}">
                                <div class="form-text">${I18n.t("wsAddressHelp")}</div>
                            </div>
                            <div class="col-md-7">
                                <label class="form-label" for="wsEmail">${I18n.t("wsEmail")}</label>
                                <input class="form-control" id="wsEmail" name="email" type="email" maxlength="160" value="${esc(a.email || "")}" placeholder="${esc(adminEmail)}">
                                <div class="form-text">${adminEmail ? I18n.f("wsEmailHelp", { email: esc(adminEmail) }) : I18n.t("wsEmailHelpNone")}</div>
                            </div>
                            <div class="col-md-5">
                                <label class="form-label" for="wsTel">${I18n.t("accPhone")}</label>
                                <input class="form-control" id="wsTel" name="telefon" type="tel" maxlength="40" value="${esc(a.telefon || "")}">
                            </div>
                        </div>

                        <div class="wsMsg alert small py-2 mt-3 mb-0" hidden></div>
                        <div class="d-flex justify-content-end mt-3">
                            <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> ${I18n.t("save")}</button>
                        </div>

                    </div>
                </form>
            </div>

            <div class="col-xl-5">
                <div class="card mb-4" id="wsLogoCard">
                    <div class="card-body">
                        <h6 class="mb-1"><i class="fa-regular fa-image" aria-hidden="true"></i> ${I18n.t("wsLogoTitle")}</h6>
                        <p class="small text-body-secondary mb-3">${I18n.t("wsLogoHelp")}</p>
                        <div class="wsLogoBox mb-3" id="wsLogoPrev"><span class="text-body-secondary small">${I18n.t("wsLogoNone")}</span></div>
                        <div class="d-flex flex-wrap gap-2">
                            <label class="btn btn-sm btn-primary mb-0">
                                <i class="fa-solid fa-upload" aria-hidden="true"></i> ${I18n.t("wsLogoUpload")}
                                <input type="file" accept="image/png,image/jpeg,image/webp" id="wsLogoFile" hidden>
                            </label>
                            <button type="button" class="btn btn-sm btn-outline-danger" id="wsLogoDel" hidden><i class="fa-solid fa-trash" aria-hidden="true"></i> ${I18n.t("wsLogoDelete")}</button>
                        </div>
                        <div class="small mt-2" id="wsLogoMsg" aria-live="polite"></div>
                    </div>
                </div>
                <div class="card mb-4">
                    <div class="card-body">
                        <h6 class="mb-2"><i class="fa-solid ${hianyzik.length ? "fa-triangle-exclamation text-warning" : "fa-circle-check text-success"}" aria-hidden="true"></i> ${I18n.t(hianyzik.length ? "wsMissingTitle" : "wsCompleteTitle")}</h6>
                        <p class="small mb-0">${hianyzik.length ? I18n.f("wsMissing", { mezok: hianyzik.map(esc).join(", ") }) : I18n.t("wsComplete")}</p>
                    </div>
                </div>
                <div class="card mb-4">
                    <div class="card-body">
                        <h6 class="mb-2"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> ${I18n.t("wsWhereTitle")}</h6>
                        <p class="small text-body-secondary">${I18n.t("wsWhere")}</p>
                        <div class="d-flex flex-wrap gap-2">
                            ${["impresszum", "aszf", "adatvedelem", "sutik"].map(d => `<button type="button" class="btn btn-sm btn-outline-secondary" data-legal-modal="${d}">${I18n.t(LegalPage.CIMEK[d])}</button>`).join("")}
                        </div>
                    </div>
                </div>
                <div class="card mb-4" id="wsFunkciok">
                    <div class="card-body">
                        <h6 class="mb-2"><i class="fa-solid fa-toggle-on" aria-hidden="true"></i> ${I18n.t("wsFeaturesTitle")}</h6>
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" role="switch" id="wsErtekesites" ${Utils.ertekesites() ? "checked" : ""}>
                            <label class="form-check-label" for="wsErtekesites"><b>${I18n.t("wsFeatSales")}</b></label>
                        </div>
                        <p class="small text-body-secondary mb-0 mt-1">${I18n.t("wsFeatSalesHelp")}</p>
                        <div class="form-check form-switch mt-3">
                            <input class="form-check-input" type="checkbox" role="switch" id="wsChatbot" ${(AuthManager.config.funkciok || {}).chatbot !== false ? "checked" : ""}>
                            <label class="form-check-label" for="wsChatbot"><b>${I18n.t("wsFeatChat")}</b></label>
                        </div>
                        <p class="small text-body-secondary mb-0 mt-1">${I18n.t("wsFeatChatHelp")}${AuthManager.config.chatbot ? "" : ` <span class="text-warning-emphasis">${I18n.t("wsFeatChatNoKey")}</span>`}</p>
                        <div class="small mt-2" id="wsFunkMsg"></div>
                    </div>
                </div>
                <div class="card mb-4">
                    <div class="card-body d-flex align-items-start gap-3">
                        <i class="fa-solid fa-rectangle-ad fs-4 text-primary" aria-hidden="true"></i>
                        <div class="flex-fill">
                            <h6 class="mb-1">${I18n.t("wsAdsTitle")}</h6>
                            <p class="small text-body-secondary mb-2">${I18n.t("wsAdsMoved")}</p>
                            <button type="button" class="btn btn-sm btn-outline-primary" data-go-tab="reklam">${I18n.t("adminTabAds")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
                        </div>
                    </div>
                </div>
                <div class="card helpCard">
                    <div class="card-body small">
                        <h6><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t("wsLawTitle")}</h6>
                        <p class="mb-0">${I18n.t("wsLaw")}</p>
                    </div>
                </div>
            </div>
        </div>`;

    box.querySelectorAll("[data-go-tab]").forEach(b => b.onclick = () => AdminManager.open(b.dataset.goTab));

    // Logó (a számlán és a számlát kísérő e-mailben)
    AdminManager.wsLogo(box);

    // Funkciók ki/be – azonnal érvényes (a nyilvános oldalon is)
    const funk = box.querySelector("#wsErtekesites");
    if (funk) funk.onchange = () => {
        funk.disabled = true;
        fetch("/api/admin/funkciok", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ertekesites: funk.checked }) })
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(v => {
                AuthManager.config.funkciok = v.adat;
                document.body.classList.toggle("noSales", !Utils.ertekesites());
                if (AdminManager.renderNav) AdminManager.renderNav();
                box.querySelector("#wsFunkMsg").innerHTML = `<i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i> ${I18n.t(v.adat.ertekesites ? "wsFeatSalesOn" : "wsFeatSalesOff")}`;
            })
            .catch(() => { funk.checked = !funk.checked; alert(I18n.t("alertSaveError")); })
            .finally(() => { funk.disabled = false; });
    };

    const chat = box.querySelector("#wsChatbot");
    if (chat) chat.onchange = () => {
        chat.disabled = true;
        fetch("/api/admin/funkciok", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatbot: chat.checked }) })
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(v => {
                AuthManager.config.funkciok = v.adat;
                if (typeof ChatWidget !== "undefined") ChatWidget.indit();
                box.querySelector("#wsFunkMsg").innerHTML = `<i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i> ${I18n.t(v.adat.chatbot ? "wsFeatChatOn" : "wsFeatChatOff")}`;
            })
            .catch(() => { chat.checked = !chat.checked; alert(I18n.t("alertSaveError")); })
            .finally(() => { chat.disabled = false; });
    };

    const form = document.getElementById("wsForm");
    const msg = form.querySelector(".wsMsg");

    form.querySelectorAll('input[name="tipus"]').forEach(r => r.onchange = () => {
        const c = r.value === "ceg" || r.value === "pfa";
        form.querySelectorAll(".wsCegOnly").forEach(el => { el.hidden = !c; });
    });

    // Kitöltés az ANAF adataiból
    document.getElementById("wsAnaf").onclick = () => {
        const out = document.getElementById("wsAnafResult");
        const cui = document.getElementById("wsCui").value.trim();
        if (!cui) { document.getElementById("wsCui").focus(); return; }
        out.innerHTML = `<div class="spinner-border spinner-border-sm text-primary"></div>`;
        AgencyAnaf.lekerdez(cui).then(v => {
            out.innerHTML = AgencyAnaf.html(v);
            if (v.talalt && v.adat) {
                const d = v.adat;
                if (d.nev) document.getElementById("wsNev").value = d.nev;
                if (d.cim) document.getElementById("wsCim").value = d.cim;
                if (d.regCom) document.getElementById("wsRegCom").value = d.regCom;
                document.getElementById("wsCui").value = (d.tva ? "RO" : "") + (d.cui || cui.replace(/\D/g, ""));
            }
        }).catch(err => { out.innerHTML = `<div class="alert alert-warning small mb-0">${esc(AgencyAnaf.hibaSzoveg(err))}</div>`; });
    };

    form.onsubmit = e => {
        e.preventDefault();
        const adat = {};
        new FormData(form).forEach((v, k) => { adat[k] = String(v).trim(); });
        fetch("/api/admin/oldal-adatok", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adat) })
            .then(r => r.json().then(v => ({ ok: r.ok, v })))
            .then(({ ok, v }) => {
                msg.hidden = false;
                if (!ok) {
                    msg.className = "wsMsg alert alert-danger small py-2 mt-3 mb-0";
                    msg.innerText = I18n.t(v.error === "bad_email" ? "wsBadEmail" : "alertSaveError");
                    return;
                }
                msg.className = "wsMsg alert alert-success small py-2 mt-3 mb-0";
                msg.innerText = I18n.t("wsSaved");
                // A jogi oldalak és a lábléc azonnal az új adatokat mutassák
                fetch("/api/config").then(r => r.json()).then(c => {
                    AuthManager.config = { ...AuthManager.config, uzemelteto: c.uzemelteto };
                    LegalPage.labLec();
                    AdminManager.drawSiteSettings(v.adat || adat, adminEmail);
                });
            })
            .catch(() => { msg.hidden = false; msg.className = "wsMsg alert alert-danger small py-2 mt-3 mb-0"; msg.innerText = I18n.t("alertSaveError"); });
    };

};


// ---------- Logó: feltöltés, előnézet, törlés ----------
AdminManager.wsLogo = function (box) {

    const prev = box.querySelector("#wsLogoPrev");
    const del = box.querySelector("#wsLogoDel");
    const file = box.querySelector("#wsLogoFile");
    const msg = box.querySelector("#wsLogoMsg");
    if (!prev) return;

    const mutat = d => {
        if (d && d.van) {
            prev.innerHTML = `<img src="/api/oldal/logo.png?v=${encodeURIComponent(d.v)}" alt="">`;
            del.hidden = false;
        } else {
            prev.innerHTML = `<span class="text-body-secondary small">${I18n.t("wsLogoNone")}</span>`;
            del.hidden = true;
        }
    };

    fetch("/api/admin/oldal-logo").then(r => r.json()).then(mutat).catch(() => mutat(null));

    file.onchange = () => {
        const f = file.files && file.files[0];
        file.value = "";
        if (!f) return;
        if (f.size > 4 * 1024 * 1024) { msg.innerHTML = `<span class="text-danger">${I18n.t("wsLogoTooBig")}</span>`; return; }
        const r = new FileReader();
        r.onload = () => {
            msg.innerHTML = `<span class="spinner-border spinner-border-sm text-primary"></span>`;
            fetch("/api/admin/oldal-logo", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kep: r.result }) })
                .then(x => x.json().then(v => ({ ok: x.ok, v })))
                .then(({ ok, v }) => {
                    if (!ok) throw new Error(v.error || "x");
                    mutat({ van: true, v: v.v });
                    msg.innerHTML = `<i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i> ${I18n.t("wsLogoSaved")}`;
                })
                .catch(e => { msg.innerHTML = `<span class="text-danger">${I18n.t(e.message === "too_large" ? "wsLogoTooBig" : "wsLogoBad")}</span>`; });
        };
        r.readAsDataURL(f);
    };

    del.onclick = () => {
        if (!confirm(I18n.t("wsLogoDeleteConfirm"))) return;
        fetch("/api/admin/oldal-logo", { method: "DELETE" })
            .then(x => { if (!x.ok) throw new Error(); mutat(null); msg.innerHTML = ""; })
            .catch(() => alert(I18n.t("alertSaveError")));
    };

};
