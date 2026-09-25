// ============================================================
//  Admin – Városok, kerületek
// ============================================================


AdminManager.renderPlaces = function () {

    AdminManager.loading();

    Promise.all([
        CityManager.loadVarosok(),
        fetch("/api/keruletek").then(r => r.json())
    ]).then(([, keruletek]) => {

        const varosok = [...CityManager.varosok].sort((a, b) =>
            CityManager.displayName(a.nev).localeCompare(CityManager.displayName(b.nev), "hu"));

        AdminManager.box().innerHTML = `
            <div class="card mb-4">
                <div class="card-body d-flex flex-wrap gap-2">
                    <input id="newCityName" class="form-control flex-fill" style="min-width:220px;" placeholder="${I18n.t("alertNewCityPrompt")}">
                    <button class="btn btn-primary text-nowrap" id="addCity"><i class="fa-solid fa-plus"></i> ${I18n.t("newAddVaros")}</button>
                </div>
            </div>

            <div class="row g-4">
                ${varosok.map(v => {
                    const k = keruletek.filter(x => x.varos === v.nev);
                    return `
                        <div class="col-md-6 col-xl-4">
                            <div class="card h-100">
                                <div class="card-header"><h6 class="mb-0"><i class="fa-solid fa-city"></i> ${Utils.escape(CityManager.displayName(v.nev))} <span class="badge text-bg-light">${k.length}</span></h6></div>
                                <div class="card-body">
                                    <div class="d-flex flex-wrap gap-2 mb-3">
                                        ${k.length ? k.map(x => `
                                            <button type="button" class="filterChip border-0" data-kid="${x.id}" data-aliasok="${Utils.escape(x.aliasok || "")}" data-nev="${Utils.escape(x.nev)}" title="${I18n.t("placesAliasHint")}">
                                                ${Utils.escape(x.nev)}${x.aliasok ? ` <small class="opacity-75">(${Utils.escape(x.aliasok)})</small>` : ""}
                                            </button>`).join("") : `<span class="text-body-secondary small">${I18n.t("placesNoDistricts")}</span>`}
                                    </div>
                                    <div class="input-group">
                                        <input class="form-control" data-district-input="${Utils.escape(v.nev)}" placeholder="${I18n.t("alertNewDistrictPrompt")}">
                                        <button class="btn btn-outline-primary" data-district-add="${Utils.escape(v.nev)}"><i class="fa-solid fa-plus"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                }).join("")}
            </div>`;

        document.getElementById("addCity").onclick = () => {
            const nev = document.getElementById("newCityName").value.trim();
            if (!nev) return;
            fetch("/api/varosok", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nev })
            }).then(() => CityManager.init()).then(() => AdminManager.renderPlaces());
        };

        // Kerület más oldalakon használt nevei (pl. "Ciucului" = "Csíki negyed")
        AdminManager.box().querySelectorAll("[data-kid]").forEach(b => {
            b.onclick = () => {
                const uj = prompt(I18n.f("placesAliasPrompt", { nev: b.dataset.nev }), b.dataset.aliasok || "");
                if (uj === null) return;
                fetch("/api/keruletek/" + b.dataset.kid, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ aliasok: uj })
                }).then(() => AdminManager.renderPlaces());
            };
        });

        AdminManager.box().querySelectorAll("[data-district-add]").forEach(b => {
            b.onclick = () => {
                const varos = b.dataset.districtAdd;
                const input = AdminManager.box().querySelector(`[data-district-input="${CSS.escape(varos)}"]`);
                const nev = input.value.trim();
                if (!nev) return;
                fetch("/api/keruletek", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ varos, nev })
                }).then(() => {
                    if (varos === DataManager.currentCity) CityManager.loadSearchKeruletek(varos);
                    AdminManager.renderPlaces();
                });
            };
        });

    });

};
