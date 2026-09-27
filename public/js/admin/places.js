// ============================================================
//  Admin – Városok, kerületek
//
//  - Kerületek magyar ÉS román névvel (+ más oldalakon használt nevek).
//    Magyarul a magyar név látszik, angolul és románul a román.
//  - "Ismeretlen környékek": a forrásoldalak környék-nevei, amelyekhez
//    még nincs kerület. Egy kattintással hozzárendelhetők – az összes
//    ilyen hirdetés megkapja, és legközelebb magától megy.
// ============================================================

AdminManager.renderPlaces = function () {

    AdminManager.loading();

    Promise.all([
        CityManager.loadVarosok(),
        fetch("/api/keruletek").then(r => r.json()),
        fetch("/api/admin/unmatched-areas").then(r => r.json()).catch(() => ({ nevek: [], keruletNelkul: [] }))
    ]).then(([, keruletek, ismeretlen]) => {

        CityManager.keruletek = keruletek;

        // Az aktuális város elöl, utána akinek van kerülete, aztán ábécé
        const kDb = v => keruletek.filter(x => x.varos === v).length;
        const varosok = [...CityManager.varosok].sort((a, b) =>
            (b.nev === DataManager.currentCity) - (a.nev === DataManager.currentCity) ||
            (kDb(b.nev) > 0) - (kDb(a.nev) > 0) ||
            CityManager.displayName(a.nev).localeCompare(CityManager.displayName(b.nev), "hu"));

        const esc = Utils.escape;

        const keruletSor = x => `
            <div class="districtRow" data-kid="${x.id}">
                <div class="districtNames">
                    <b>${esc(x.nev)}</b>
                    ${x.nev_ro && x.nev_ro !== x.nev ? `<span class="districtRo" lang="ro">${esc(x.nev_ro)}</span>` : ""}
                    ${!x.nev_ro ? `<span class="badge text-bg-warning">${I18n.t("placesNoRo")}</span>` : ""}
                    ${x.aliasok ? `<small class="districtAlias">${esc(x.aliasok)}</small>` : ""}
                </div>
                <button type="button" class="btn btn-sm btn-outline-secondary" data-edit="${x.id}" aria-label="${I18n.t("placesEdit")}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
            </div>`;

        const ismeretlenBlokk = varos => {

            const lista = (ismeretlen.nevek || []).filter(n => n.varos === varos);
            if (!lista.length) return "";

            const opciok = keruletek.filter(k => k.varos === varos)
                .map(k => `<option value="${esc(k.nev)}">${esc(k.nev)}${k.nev_ro && k.nev_ro !== k.nev ? " / " + esc(k.nev_ro) : ""}</option>`).join("");

            return `
                <div class="unmatchedBox">
                    <div class="unmatchedHead">
                        <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
                        <div>
                            <b>${I18n.t("placesUnmatchedTitle")}</b>
                            <p class="mb-0">${I18n.t("placesUnmatchedHelp")}</p>
                        </div>
                    </div>
                    ${lista.map(n => `
                        <div class="unmatchedRow">
                            <span class="unmatchedName" lang="ro">${esc(n.nev)} <span class="badge rounded-pill text-bg-light">${n.db}</span></span>
                            <select class="form-select form-select-sm" aria-label="${I18n.t("placesAssignTo")}" data-um-select>
                                <option value="">${I18n.t("placesAssignTo")}</option>
                                ${opciok}
                                <option value="__uj">+ ${I18n.t("placesNewFromName")}</option>
                            </select>
                            <button type="button" class="btn btn-sm btn-primary" data-um-go data-varos="${esc(varos)}" data-nev="${esc(n.nev)}">${I18n.t("placesAssign")}</button>
                        </div>`).join("")}
                </div>`;

        };

        AdminManager.box().innerHTML = `

            <div class="card mb-4">
                <div class="card-body d-flex flex-wrap gap-2">
                    <label class="visually-hidden" for="newCityName">${I18n.t("alertNewCityPrompt")}</label>
                    <input id="newCityName" class="form-control flex-fill" style="min-width:200px;" autocomplete="off" placeholder="${I18n.t("alertNewCityPrompt")}">
                    <input id="newCityRo" class="form-control" style="max-width:220px;" autocomplete="off" lang="ro" placeholder="${I18n.t("placesCityRo")}" aria-label="${I18n.t("placesCityRo")}">
                    <input id="newCityMegye" class="form-control" style="max-width:180px;" autocomplete="off" placeholder="${I18n.t("placesCounty")}" aria-label="${I18n.t("placesCounty")}">
                    <button class="btn btn-primary text-nowrap" id="addCity"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("newAddVaros")}</button>
                </div>
            </div>

            <p class="sectionNote">${I18n.t("placesLangHelp")}</p>

            <div class="row g-4">
                ${varosok.map(v => {
                    const k = keruletek.filter(x => x.varos === v.nev)
                        .sort((a, b) => a.nev.localeCompare(b.nev, "hu"));
                    const nelkul = (ismeretlen.keruletNelkul || []).find(x => x.varos === v.nev);
                    return `
                        <div class="col-lg-6 col-xxl-4">
                            <div class="card h-100">
                                <div class="card-header d-flex justify-content-between align-items-center gap-2">
                                    <h6 class="mb-0"><i class="fa-solid fa-city" aria-hidden="true"></i> ${esc(CityManager.displayName(v.nev))} <span class="badge text-bg-light">${k.length}</span></h6>
                                    ${nelkul && nelkul.db ? `<span class="small text-body-secondary">${I18n.f("placesWithout", { n: nelkul.db })}</span>` : ""}
                                </div>
                                <div class="cityGeo" data-city-geo="${v.id}">
                                    <i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i>
                                    <span>${v.x && v.y
                                        ? `${esc(v.nev_ro || "")}${v.megye ? " · " + esc(v.megye) : ""} · ${I18n.f("placesRadius", { km: v.sugar_km || 6 })}`
                                        : `<span class="text-warning">${I18n.t("placesNoCenter")}</span>`}</span>
                                    <button type="button" class="btn btn-sm btn-link p-0 ms-auto" data-geo-edit="${v.id}">${I18n.t("placesEdit")}</button>
                                </div>
                                <div class="card-body">
                                    <div class="districtList mb-3">
                                        ${k.length ? k.map(keruletSor).join("") : `<span class="text-body-secondary small">${I18n.t("placesNoDistricts")}</span>`}
                                    </div>

                                    <div class="districtAdd">
                                        <input class="form-control form-control-sm" data-new-hu="${esc(v.nev)}" autocomplete="off" placeholder="${I18n.t("placesNameHu")}" aria-label="${I18n.t("placesNameHu")}">
                                        <input class="form-control form-control-sm" data-new-ro="${esc(v.nev)}" autocomplete="off" lang="ro" placeholder="${I18n.t("placesNameRo")}" aria-label="${I18n.t("placesNameRo")}">
                                        <button class="btn btn-sm btn-outline-primary" data-district-add="${esc(v.nev)}" aria-label="${I18n.t("newAddKerulet")}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
                                    </div>

                                    ${ismeretlenBlokk(v.nev)}
                                </div>
                            </div>
                        </div>`;
                }).join("")}
            </div>`;

        const box = AdminManager.box();

        const utana = varos => {
            CityManager.loadAllKeruletek();
            if (varos === DataManager.currentCity) {
                CityManager.loadSearchKeruletek(varos);
                DataManager.init();
            }
            AdminManager.renderPlaces();
        };

        document.getElementById("addCity").onclick = () => {
            const nev = document.getElementById("newCityName").value.trim();
            if (!nev) return;
            fetch("/api/varosok", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nev, nev_ro: document.getElementById("newCityRo").value.trim(), megye: document.getElementById("newCityMegye").value.trim() })
            }).then(() => CityManager.init()).then(() => AdminManager.renderPlaces());
        };

        // A város helyadatai: román név, megye, méret, közép a térképen
        box.querySelectorAll("[data-geo-edit]").forEach(b => {
            b.onclick = () => AdminManager.cityGeoEdit(varosok.find(v => String(v.id) === b.dataset.geoEdit));
        });

        // Kerület szerkesztése: a sor helyén három mező (magyar, román, más nevek)
        box.querySelectorAll("[data-edit]").forEach(b => {

            b.onclick = () => {

                const x = keruletek.find(k => String(k.id) === b.dataset.edit);
                const sor = b.closest(".districtRow");

                sor.innerHTML = `
                    <div class="districtEdit">
                        <label class="form-label mb-1">${I18n.t("placesNameHu")}
                            <input class="form-control form-control-sm" data-f="nev" value="${esc(x.nev)}" autocomplete="off"></label>
                        <label class="form-label mb-1">${I18n.t("placesNameRo")}
                            <input class="form-control form-control-sm" data-f="nev_ro" value="${esc(x.nev_ro || "")}" autocomplete="off" lang="ro"></label>
                        <label class="form-label mb-1">${I18n.t("placesAliases")}
                            <input class="form-control form-control-sm" data-f="aliasok" value="${esc(x.aliasok || "")}" autocomplete="off"></label>
                        <div class="d-flex gap-2 mt-1">
                            <button type="button" class="btn btn-sm btn-primary" data-save>${I18n.t("placesSave")}</button>
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-cancel>${I18n.t("newCancelBtn")}</button>
                            <button type="button" class="btn btn-sm btn-outline-danger ms-auto" data-del aria-label="${I18n.t("placesDelete")}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                        </div>
                    </div>`;

                const val = f => sor.querySelector(`[data-f="${f}"]`).value;

                sor.querySelector("[data-cancel]").onclick = () => AdminManager.renderPlaces();

                sor.querySelector("[data-save]").onclick = () => {
                    fetch("/api/keruletek/" + x.id, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ nev: val("nev"), nev_ro: val("nev_ro"), aliasok: val("aliasok") })
                    }).then(r => {
                        if (!r.ok) alert(I18n.t("placesDuplicate"));
                        utana(x.varos);
                    });
                };

                sor.querySelector("[data-del]").onclick = () => {
                    if (!confirm(I18n.f("placesDeleteConfirm", { nev: x.nev }))) return;
                    fetch("/api/keruletek/" + x.id, { method: "DELETE" }).then(() => utana(x.varos));
                };

            };

        });

        // Új kerület
        box.querySelectorAll("[data-district-add]").forEach(b => {
            b.onclick = () => {
                const varos = b.dataset.districtAdd;
                const hu = box.querySelector(`[data-new-hu="${CSS.escape(varos)}"]`).value.trim();
                const ro = box.querySelector(`[data-new-ro="${CSS.escape(varos)}"]`).value.trim();
                if (!hu && !ro) return;
                fetch("/api/keruletek", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ varos, nev: hu, nev_ro: ro })
                }).then(() => utana(varos));
            };
        });

        // Ismeretlen környék hozzárendelése
        box.querySelectorAll("[data-um-go]").forEach(b => {
            b.onclick = () => {

                const sel = b.parentElement.querySelector("[data-um-select]");
                if (!sel.value) { sel.focus(); return; }

                const body = { varos: b.dataset.varos, nev: b.dataset.nev };

                if (sel.value === "__uj") {
                    const hu = prompt(I18n.f("placesNewFromNamePrompt", { nev: b.dataset.nev }), b.dataset.nev);
                    if (hu === null) return;
                    body.uj = true;
                    body.ujNev = hu.trim() || b.dataset.nev;
                } else {
                    body.kerulet = sel.value;
                }

                b.disabled = true;

                fetch("/api/admin/unmatched-areas/assign", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                }).then(() => utana(b.dataset.varos));

            };
        });

    });

};


// A város közepe, mérete, román neve és megyéje (a helymeghatározás ebből
// dönti el, mi van "a városban", és hol keresse a hasonló nevű falvakat)
AdminManager.cityGeoEdit = function (v) {

    let el = document.getElementById("cityGeoModal");

    if (!el) {
        el = document.createElement("div");
        el.id = "cityGeoModal";
        el.className = "modal fade";
        el.tabIndex = -1;
        el.innerHTML = `<div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content"></div></div>`;
        document.body.appendChild(el);
    }

    const esc = Utils.escape;

    el.querySelector(".modal-content").innerHTML = `
        <div class="modal-header">
            <h5 class="modal-title"><i class="fa-solid fa-city"></i> ${esc(CityManager.displayName(v.nev))}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${I18n.t("close")}"></button>
        </div>
        <div class="modal-body">
            <p class="sectionNote">${I18n.t("placesGeoHelp")}</p>
            <div class="row g-3 mb-3">
                <div class="col-md-5"><label class="form-label" for="cgRo">${I18n.t("placesCityRo")}</label><input class="form-control" id="cgRo" lang="ro" value="${esc(v.nev_ro || "")}"></div>
                <div class="col-md-4"><label class="form-label" for="cgMegye">${I18n.t("placesCounty")}</label><input class="form-control" id="cgMegye" value="${esc(v.megye || "")}"></div>
                <div class="col-md-3"><label class="form-label" for="cgSugar">${I18n.t("placesRadiusLabel")}</label><input class="form-control" id="cgSugar" type="number" min="1" max="40" step="0.5" value="${v.sugar_km || 6}"></div>
            </div>
            <label class="form-label">${I18n.t("placesCenterLabel")}</label>
            <div id="cityGeoMap" class="locPicker"></div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("cancel")}</button>
            <button type="button" class="btn btn-primary" id="cgSave">${I18n.t("save")}</button>
        </div>`;

    const modal = bootstrap.Modal.getOrCreateInstance(el);
    let picker = null;

    el.addEventListener("shown.bs.modal", function once() {
        el.removeEventListener("shown.bs.modal", once);
        picker = new LocationPicker("cityGeoMap", { x: v.x, y: v.y, pontossag: "pontos", varos: () => v.nev, kozep: v.x && v.y ? [v.y, v.x] : null });
        picker.refresh();
    });

    document.getElementById("cgSave").onclick = () => {
        const h = picker ? picker.get() : {};
        fetch("/api/varosok/" + v.id, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                nev_ro: document.getElementById("cgRo").value,
                megye: document.getElementById("cgMegye").value,
                sugar_km: document.getElementById("cgSugar").value,
                x: h.x || v.x, y: h.y || v.y
            })
        }).then(r => {
            if (!r.ok) return alert(I18n.t("alertSaveError"));
            modal.hide();
            CityManager.loadVarosok().then(() => AdminManager.renderPlaces());
        });
    };

    modal.show();

};
