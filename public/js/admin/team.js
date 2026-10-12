// ============================================================
//  Admin → Csapat és jogosultságok (#admin/csapat)
//
//  Munkatársak (a saját fiókjukkal lépnek be) és a hozzáféréseik:
//  milyen jog (fotók, hirdetés szerkesztése, megtekintések, megbízások
//  megtekintése / kezelése) mire (minden, egy város [+ típus], egy
//  megbízás, egy hirdetés), meddig. A munkatárs a Munkaterületem
//  oldalon (#munka) dolgozik.
//
//  Szerver: /api/admin/csapat (server/routes/csapat.js)
// ============================================================

AdminManager.TEAM_JOGOK = ["kepek", "hirdetes", "megtekintes", "megbizas_lat", "megbizas"];
AdminManager.TEAM_IKON = { kepek: "fa-solid fa-camera", hirdetes: "fa-solid fa-pen-to-square", megtekintes: "fa-solid fa-door-open", megbizas_lat: "fa-regular fa-eye", megbizas: "fa-solid fa-key" };

AdminManager.teamHatokor = function (h) {
    const esc = Utils.escape;
    if (h.hatokor === "mind") return esc(I18n.t("tmScope_mind"));
    if (h.hatokor === "varos") return esc(CityManager.displayName(h.varos || "")) + (h.tipus ? " · " + esc(Types.label(h.tipus)) : "");
    if (h.hatokor === "megbizas") return `${esc(I18n.t("tmScope_megbizas"))}: ${esc(h.szerzodes_szam || "#" + h.megbizas_id)}${h.megbizas_nev ? " – " + esc(h.megbizas_nev) : ""}`;
    if (h.hatokor === "ingatlan") return `${esc(I18n.t("tmScope_ingatlan"))}: <a href="#listing/${h.ingatlan_id}">#${h.ingatlan_id}</a>${h.ingatlan_cim ? " – " + esc(h.ingatlan_cim) : ""}`;
    return "–";
};

AdminManager.renderTeam = function () {

    AdminManager.loading();

    Svc.api("/api/admin/csapat").then(d => {

        const box = AdminManager.box();
        const esc = Utils.escape;
        AdminManager.teamAdat = d;

        box.innerHTML = `
            <div class="row g-4 mb-4">
                <div class="col-lg-7">
                    <div class="card h-100">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${I18n.t("tmAdd")}</h5></div>
                        <div class="card-body">
                            <p class="small text-body-secondary">${I18n.t("tmAddHelp")}</p>
                            <div class="position-relative">
                                <div class="input-group">
                                    <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
                                    <input class="form-control" id="tmKeres" placeholder="${esc(I18n.t("tmSearchPh"))}" autocomplete="off" aria-label="${esc(I18n.t("tmSearchPh"))}">
                                </div>
                                <div class="list-group tmTalalat" id="tmTalalat" hidden></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-5">
                    <div class="card h-100">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t("tmRolesTitle")}</h5></div>
                        <div class="card-body small">
                            ${d.szerepek.filter(s => s !== "egyeni").map(s => `
                                <div class="mb-2"><span class="badge tmRole r-${s}">${esc(I18n.t("tmRole_" + s))}</span> ${esc(I18n.t("tmRoleHelp_" + s))}</div>`).join("")}
                            <div class="text-body-secondary">${I18n.t("tmRolesNote")}</div>
                        </div>
                    </div>
                </div>
            </div>

            ${d.tagok.length ? `<div class="tmGrid">${d.tagok.map(t => `
                <article class="tmCard ${t.aktiv ? "" : "inactive"}">
                    <header class="d-flex justify-content-between gap-2">
                        <div class="min-w-0">
                            <b>${esc(t.nev || t.email || "–")}</b>
                            <div class="small text-body-secondary text-truncate">${esc(t.email || "")}${t.telefon ? " · " + esc(t.telefon) : ""}</div>
                        </div>
                        <span class="badge tmRole r-${esc(t.szerep)} align-self-start">${esc(I18n.t("tmRole_" + t.szerep))}</span>
                    </header>
                    ${!t.aktiv ? `<div class="small text-warning mt-1"><i class="fa-solid fa-pause" aria-hidden="true"></i> ${I18n.t("tmInactive")}</div>` : ""}
                    <ul class="tmAccess">
                        ${t.hozzaferesek.length ? t.hozzaferesek.map(h => `
                            <li>
                                <span class="tmScope">${AdminManager.teamHatokor(h)}${h.lejar ? ` <small class="text-body-secondary">(${I18n.t("tmUntil")} ${esc(Svc.nap(h.lejar))})</small>` : ""}</span>
                                <span class="tmPerms">${(h.jogok || []).map(j => `<span title="${esc(I18n.t("tmPerm_" + j))}"><i class="${AdminManager.TEAM_IKON[j]}" aria-hidden="true"></i> ${esc(I18n.t("tmPermShort_" + j))}</span>`).join("")}</span>
                            </li>`).join("") : `<li class="text-body-secondary small">${I18n.t("tmNoAccess")}</li>`}
                    </ul>
                    <footer class="d-flex flex-wrap gap-2 align-items-center small text-body-secondary">
                        <span><i class="fa-solid fa-key" aria-hidden="true"></i> ${I18n.f("tmMandates", { n: t.megbizas_db })}</span>
                        <span>${I18n.t("tmLastLogin")}: ${t.utolso_belepes ? esc(Utils.ago(t.utolso_belepes)) : "–"}</span>
                        <button type="button" class="btn btn-sm btn-outline-primary ms-auto" data-tm-szerk="${t.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("tmEdit")}</button>
                    </footer>
                </article>`).join("")}</div>` : `
                <div class="emptyState">
                    <i class="fa-solid fa-people-group"></i>
                    <h5>${I18n.t("tmNone")}</h5>
                    <p>${I18n.t("tmNoneText")}</p>
                </div>`}`;

        // Felhasználó keresése
        const inp = box.querySelector("#tmKeres");
        const lista = box.querySelector("#tmTalalat");
        let idozito = null;
        inp.oninput = () => {
            clearTimeout(idozito);
            const q = inp.value.trim();
            if (q.length < 2) { lista.hidden = true; return; }
            idozito = setTimeout(() => {
                Svc.api("/api/admin/csapat/keres?q=" + encodeURIComponent(q)).then(talalat => {
                    lista.innerHTML = talalat.length ? talalat.map(u => `
                        <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" data-tm-uj="${u.id}" ${u.tag || u.szerep === "admin" ? "disabled" : ""}>
                            <span><b>${esc(u.nev || "–")}</b> <small class="text-body-secondary">${esc(u.email || "")}</small></span>
                            <small>${u.tag ? I18n.t("tmAlready") : u.szerep === "admin" ? "admin" : `<i class="fa-solid fa-plus" aria-hidden="true"></i>`}</small>
                        </button>`).join("") : `<div class="list-group-item small text-body-secondary">${I18n.t("tmNoUser")}</div>`;
                    lista.hidden = false;
                    lista.querySelectorAll("[data-tm-uj]").forEach(b => {
                        b.onclick = () => {
                            lista.hidden = true;
                            inp.value = "";
                            const u = talalat.find(x => String(x.id) === b.dataset.tmUj);
                            AdminManager.teamSzerk({ user_id: u.id, nev: u.nev, email: u.email, szerep: "fotos", aktiv: true, hozzaferesek: [] }, true);
                        };
                    });
                }).catch(() => { });
            }, 250);
        };

        box.querySelectorAll("[data-tm-szerk]").forEach(b => {
            b.onclick = () => AdminManager.teamSzerk(d.tagok.find(t => t.id === Number(b.dataset.tmSzerk)), false);
        });

    }).catch(() => AdminManager.finHibaDoboz());

};

// Egy munkatárs szerkesztése (új tag hozzáadásakor is)
AdminManager.teamSzerk = function (t, uj) {

    const esc = Utils.escape;
    const d = AdminManager.teamAdat;
    const { tartalom, modal } = Svc.modal("tmModal", "modal-xl");
    let hozz = (t.hozzaferesek || []).map(h => ({ ...h, jogok: [...(h.jogok || [])] }));
    let megbizasok = null;

    // Az új tag első hozzáférése a szerep szerinti jogokkal, a kiválasztott városra
    if (uj && !hozz.length) hozz.push({ hatokor: "varos", varos: DataManager.currentCity || "", tipus: "", jogok: [...(d.szerep_jogok[t.szerep] || [])] });

    const varosOpt = sel => (CityManager.varosok || []).map(v => v.nev)
        .sort((a, b) => CityManager.displayName(a).localeCompare(CityManager.displayName(b), "hu"))
        .map(n => `<option value="${esc(n)}" ${n === sel ? "selected" : ""}>${esc(CityManager.displayName(n))}</option>`).join("");

    const sor = (h, i) => `
        <div class="tmRow" data-i="${i}">
            <div class="row g-2 align-items-end">
                <div class="col-md-3">
                    <label class="form-label small mb-1" for="tmH_${i}">${I18n.t("tmScope")}</label>
                    <select class="form-select form-select-sm" id="tmH_${i}" data-k="hatokor">
                        ${d.hatokorok.map(k => `<option value="${k}" ${h.hatokor === k ? "selected" : ""}>${esc(I18n.t("tmScope_" + k))}</option>`).join("")}
                    </select>
                </div>
                ${h.hatokor === "varos" ? `
                <div class="col-md-3">
                    <label class="form-label small mb-1" for="tmV_${i}">${I18n.t("detailVaros")}</label>
                    <select class="form-select form-select-sm" id="tmV_${i}" data-k="varos">${varosOpt(h.varos)}</select>
                </div>
                <div class="col-md-2">
                    <label class="form-label small mb-1" for="tmT_${i}">${I18n.t("newTipus")}</label>
                    <select class="form-select form-select-sm" id="tmT_${i}" data-k="tipus">
                        <option value="">${I18n.t("tmAllTypes")}</option>
                        ${Types.LIST.map(x => `<option value="${x.key}" ${h.tipus === x.key ? "selected" : ""}>${esc(I18n.t(x.label))}</option>`).join("")}
                    </select>
                </div>` : h.hatokor === "megbizas" ? `
                <div class="col-md-5">
                    <label class="form-label small mb-1" for="tmM_${i}">${I18n.t("tmScope_megbizas")}</label>
                    <select class="form-select form-select-sm" id="tmM_${i}" data-k="megbizas_id">
                        ${megbizasok ? megbizasok.map(m => `<option value="${m.id}" ${m.id === h.megbizas_id ? "selected" : ""}>${esc(m.szerzodes_szam || "#" + m.id)} – ${esc(m.nev || "")} (${esc(MandateDesk.hely(m))})</option>`).join("") : `<option value="${h.megbizas_id || ""}">${esc(h.szerzodes_szam || (h.megbizas_id ? "#" + h.megbizas_id : "…"))}</option>`}
                    </select>
                </div>` : h.hatokor === "ingatlan" ? `
                <div class="col-md-5">
                    <label class="form-label small mb-1" for="tmI_${i}">${I18n.t("tmListingId")}</label>
                    <div class="input-group input-group-sm"><span class="input-group-text">#</span>
                    <input class="form-control" id="tmI_${i}" type="number" data-k="ingatlan_id" value="${h.ingatlan_id || ""}"></div>
                </div>` : `<div class="col-md-5"><p class="small text-body-secondary mb-1">${I18n.t("tmScopeAllHelp")}</p></div>`}
                <div class="col-md-2">
                    <label class="form-label small mb-1" for="tmL_${i}">${I18n.t("tmUntil")}</label>
                    <input class="form-control form-control-sm" id="tmL_${i}" type="date" data-k="lejar" value="${esc(h.lejar || "")}">
                </div>
                <div class="col-md-2 text-end">
                    <button type="button" class="btn btn-sm btn-outline-danger" data-tm-torol-sor="${i}" aria-label="${esc(I18n.t("finDelete"))}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                </div>
                <div class="col-12 tmPermPick">
                    ${d.jogok.map(j => `
                        <label class="tmPermChk">
                            <input type="checkbox" class="form-check-input" data-jog="${j}" ${h.jogok.includes(j) ? "checked" : ""}>
                            <i class="${AdminManager.TEAM_IKON[j]}" aria-hidden="true"></i>
                            <span><b>${esc(I18n.t("tmPermShort_" + j))}</b><small>${esc(I18n.t("tmPerm_" + j))}</small></span>
                        </label>`).join("")}
                </div>
            </div>
        </div>`;

    const olvas = () => {
        hozz = [...tartalom.querySelectorAll(".tmRow")].map(el => {
            const h = { jogok: [...el.querySelectorAll("[data-jog]:checked")].map(c => c.dataset.jog) };
            el.querySelectorAll("[data-k]").forEach(inp => { h[inp.dataset.k] = inp.value; });
            if (h.megbizas_id) h.megbizas_id = Number(h.megbizas_id) || null;
            if (h.ingatlan_id) h.ingatlan_id = Number(h.ingatlan_id) || null;
            return h;
        });
    };

    const rajzol = () => {
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title"><i class="fa-solid fa-user-shield" aria-hidden="true"></i> ${esc(t.nev || t.email || "")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
            </div>
            <div class="modal-body">
                <div class="row g-3 mb-3">
                    <div class="col-md-4">
                        <label class="form-label small mb-1" for="tmSzerep">${I18n.t("tmRole")}</label>
                        <select class="form-select" id="tmSzerep">${d.szerepek.map(s => `<option value="${s}" ${t.szerep === s ? "selected" : ""}>${esc(I18n.t("tmRole_" + s))}</option>`).join("")}</select>
                        <div class="form-text">${I18n.t("tmRoleApply")}</div>
                    </div>
                    <div class="col-md-5">
                        <label class="form-label small mb-1" for="tmMegj">${I18n.t("prNote")}</label>
                        <input class="form-control" id="tmMegj" value="${esc(t.megjegyzes || "")}" maxlength="1000">
                    </div>
                    <div class="col-md-3 d-flex align-items-end">
                        <div class="form-check form-switch mb-2">
                            <input class="form-check-input" type="checkbox" role="switch" id="tmAktiv" ${t.aktiv !== false ? "checked" : ""}>
                            <label class="form-check-label" for="tmAktiv">${I18n.t("tmActive")}</label>
                        </div>
                    </div>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="mb-0">${I18n.t("tmAccessTitle")}</h6>
                    <button type="button" class="btn btn-sm btn-outline-primary" id="tmUjSor"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("tmAddAccess")}</button>
                </div>
                <p class="small text-body-secondary">${I18n.t("tmAccessHelp")}</p>
                <div id="tmSorok">${hozz.map(sor).join("") || `<p class="text-body-secondary small">${I18n.t("tmNoAccess")}</p>`}</div>
            </div>
            <div class="modal-footer">
                ${!uj ? `<button type="button" class="btn btn-outline-danger me-auto" id="tmTorol"><i class="fa-solid fa-user-minus" aria-hidden="true"></i> ${I18n.t("tmRemove")}</button>` : ""}
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
                <button type="button" class="btn btn-primary" id="tmMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t(uj ? "tmAddBtn" : "finSave")}</button>
            </div>`;

        const $ = q => tartalom.querySelector(q);

        // Hatókör váltása: újrarajzolás (a megbízásokat egyszer töltjük be)
        tartalom.querySelectorAll("[data-k=hatokor]").forEach(s => {
            s.onchange = () => {
                olvas();
                if (s.value === "megbizas" && !megbizasok) {
                    Svc.api("/api/ertekesites/megbizasok").then(x => {
                        megbizasok = x.lista.filter(m => !["lezarva", "elutasitva"].includes(m.statusz));
                        hozz.forEach(h => { if (h.hatokor === "megbizas" && !h.megbizas_id && megbizasok[0]) h.megbizas_id = megbizasok[0].id; });
                        rajzol();
                    }).catch(() => rajzol());
                } else rajzol();
            };
        });
        tartalom.querySelectorAll("[data-tm-torol-sor]").forEach(b => {
            b.onclick = () => { olvas(); hozz.splice(Number(b.dataset.tmTorolSor), 1); rajzol(); };
        });
        $("#tmUjSor").onclick = () => {
            olvas();
            hozz.push({ hatokor: "varos", varos: DataManager.currentCity || "", tipus: "", jogok: [...(d.szerep_jogok[$("#tmSzerep").value] || [])] });
            rajzol();
        };
        // Szerep váltása: a javasolt jogok minden hozzáférésre (ha kéri)
        $("#tmSzerep").onchange = e => {
            t.szerep = e.target.value;
            const javasolt = d.szerep_jogok[t.szerep] || [];
            if (javasolt.length && hozz.length && confirm(I18n.t("tmApplyConfirm"))) {
                olvas();
                hozz.forEach(h => { h.jogok = [...javasolt]; });
                rajzol();
            }
        };

        $("#tmMent").onclick = () => {
            olvas();
            const body = { szerep: $("#tmSzerep").value, aktiv: $("#tmAktiv").checked, megjegyzes: $("#tmMegj").value, hozzaferesek: hozz };
            const ures = hozz.filter(h => !h.jogok.length).length;
            if (ures && !confirm(I18n.t("tmEmptyRows"))) return;
            $("#tmMent").disabled = true;
            const keres = uj
                ? Svc.api("/api/admin/csapat", { method: "POST", body: { ...body, user_id: t.user_id } }).then(v => Svc.api("/api/admin/csapat/" + v.id, { method: "PUT", body }))
                : Svc.api("/api/admin/csapat/" + t.id, { method: "PUT", body });
            keres.then(() => { modal.hide(); MandateDesk.jelez(I18n.t("adsSaved")); AdminManager.renderTeam(); })
                .catch(e => { $("#tmMent").disabled = false; alert(Svc.hiba(e, "tmErr_")); });
        };

        const torol = $("#tmTorol");
        if (torol) torol.onclick = () => {
            if (!confirm(I18n.t("tmRemoveConfirm"))) return;
            Svc.api("/api/admin/csapat/" + t.id, { method: "DELETE" })
                .then(() => { modal.hide(); AdminManager.renderTeam(); }).catch(e => alert(Svc.hiba(e)));
        };
    };

    // Ha már van megbízás-hatókör, töltsük be a listát
    rajzol();
    if (hozz.some(h => h.hatokor === "megbizas")) {
        Svc.api("/api/ertekesites/megbizasok").then(x => { olvas(); megbizasok = x.lista; rajzol(); }).catch(() => { });
    }

    modal.show();

};
