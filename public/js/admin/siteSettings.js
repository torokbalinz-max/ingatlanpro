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
                <div class="card mb-4" id="wsAdsCard">
                    <div class="card-body">
                        <h6 class="mb-2"><i class="fa-solid fa-bullhorn" aria-hidden="true"></i> ${I18n.t("wsAdsTitle")}</h6>
                        <p class="small text-body-secondary">${I18n.t("wsAdsHelp")}</p>
                        <div class="form-check form-switch mb-2">
                            <input class="form-check-input" type="checkbox" id="wsAdsShow">
                            <label class="form-check-label" for="wsAdsShow">${I18n.t("wsAdsShow")}</label>
                        </div>
                        <label class="form-label small" for="wsAdsEmail">${I18n.t("wsAdsEmail")}</label>
                        <input class="form-control form-control-sm mb-2" id="wsAdsEmail" type="email" maxlength="160" placeholder="${esc(a.email || adminEmail || "")}">
                        <div class="wsAdsMsg alert small py-2 mb-2" hidden></div>
                        <div class="d-flex justify-content-between align-items-center">
                            <a class="small" href="#properties">${I18n.t("wsAdsPreview")}</a>
                            <button type="button" class="btn btn-sm btn-primary" id="wsAdsSave">${I18n.t("save")}</button>
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

    AdminManager.bindAdsSettings();

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

// Reklámfelületek: ki-be kapcsolás és az érdeklődők e-mail címe (services/reklam.js)
AdminManager.bindAdsSettings = function () {

    const show = document.getElementById("wsAdsShow");
    const email = document.getElementById("wsAdsEmail");
    const msg = document.querySelector(".wsAdsMsg");
    if (!show) return;

    fetch("/api/admin/reklam").then(r => r.json()).then(d => {
        const a = d.adat || {};
        show.checked = a.mutat !== false;
        email.value = a.email || "";
    }).catch(() => { show.checked = AdSlots.enabled(); });

    document.getElementById("wsAdsSave").onclick = () => {
        fetch("/api/admin/reklam", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mutat: show.checked, email: email.value.trim() })
        })
            .then(r => r.json().then(v => ({ ok: r.ok, v })))
            .then(({ ok, v }) => {
                msg.hidden = false;
                if (!ok) {
                    msg.className = "wsAdsMsg alert alert-danger small py-2 mb-2";
                    msg.innerText = I18n.t(v.error === "bad_email" ? "wsBadEmail" : "alertSaveError");
                    return;
                }
                msg.className = "wsAdsMsg alert alert-success small py-2 mb-2";
                msg.innerText = I18n.t("wsSaved");
                // Az oldal azonnal a beállítás szerint mutassa (vagy rejtse) a helyőrzőket
                return fetch("/api/config").then(r => r.json()).then(c => {
                    AuthManager.config = { ...AuthManager.config, reklam: c.reklam };
                    AdSlots.refresh();
                });
            })
            .catch(() => { msg.hidden = false; msg.className = "wsAdsMsg alert alert-danger small py-2 mb-2"; msg.innerText = I18n.t("alertSaveError"); });
    };

};
