// ============================================================
//  Admin → Értékesítés (Eladjuk helyetted) és Csapat
//
//  #admin/megbizasok[/<id>[/<fül>]]   az értékesítési asztal (services/mandateDesk.js)
//  #admin/megbizasBeall               díjak, ajánlat-kezelés, automatizmusok, szolgáltatások
//  #admin/csapat                      munkatársak és jogosultságaik (admin/team.js)
//
//  A szerver: server/routes/megbizas.js, server/routes/csapat.js
// ============================================================

(() => {

    // Új menücsoportok a Partnerek után: Értékesítés, Csapat
    const gi = AdminManager.GROUPS.findIndex(g => g.key === "partners");
    AdminManager.GROUPS.splice(gi + 1, 0,
        { key: "sales", label: "adminGroupSales", icon: "fa-solid fa-key" },
        { key: "team", label: "tmGroup", icon: "fa-solid fa-people-group" });

    const tabok = {};
    for (const [k, v] of Object.entries(AdminManager.TABS)) {
        tabok[k] = v;
        if (k === "reklam") {
            tabok.megbizasok = { group: "sales", icon: "fa-solid fa-key", title: "adminTabMandates", desc: "adminDescMandates", render: () => AdminManager.renderMandates(), count: "mandatesCount", warn: true };
            tabok.megbizasBeall = { group: "sales", icon: "fa-solid fa-sliders", title: "adminTabMandateSettings", desc: "adminDescMandateSettings", render: () => AdminManager.renderMandateSettings() };
            tabok.csapat = { group: "team", icon: "fa-solid fa-people-group", title: "tmTeamTitle", desc: "tmDesc", render: () => AdminManager.renderTeam() };
        }
    }
    AdminManager.TABS = tabok;
    AdminManager.ALIASES.megbizas = "megbizasok";
    AdminManager.ALIASES.mandates = "megbizasok";
    AdminManager.ALIASES.team = "csapat";
    AdminManager.ALIASES.jogosultsagok = "csapat";

})();

AdminManager.renderMandates = function () {
    MandateDesk.nyit(AdminManager.box(), { base: "#admin/megbizasok" });
};

// ===================== BEÁLLÍTÁSOK =====================

AdminManager.renderMandateSettings = function () {

    AdminManager.loading();

    Svc.api("/api/admin/megbizas-beallitas").then(b => {

        const box = AdminManager.box();
        const esc = Utils.escape;
        let opciok = (b.opciok || []).map(o => ({ ...o }));

        const opcioSor = (o, i) => `
            <div class="mbOptEdit" data-i="${i}">
                <div class="row g-2 align-items-end">
                    <div class="col-sm-3"><label class="form-label small mb-1">${I18n.t("finPkgCode")}</label><input class="form-control form-control-sm" data-k="kod" value="${esc(o.kod || "")}"></div>
                    <div class="col-sm-3"><label class="form-label small mb-1">${I18n.t("mbIcon")}</label><input class="form-control form-control-sm" data-k="ikon" value="${esc(o.ikon || "fa-solid fa-circle-check")}"></div>
                    <div class="col-6 col-sm-2"><label class="form-label small mb-1">${I18n.t("finPrice")}</label><input class="form-control form-control-sm" type="number" min="0" data-k="ar" value="${o.ar ?? 0}"></div>
                    <div class="col-6 col-sm-2"><label class="form-label small mb-1">${I18n.t("finCurrency")}</label><select class="form-select form-select-sm" data-k="penznem"><option ${o.penznem !== "EUR" ? "selected" : ""}>RON</option><option ${o.penznem === "EUR" ? "selected" : ""}>EUR</option></select></div>
                    <div class="col-sm-2 d-flex gap-2 justify-content-end">
                        <button type="button" class="btn btn-sm btn-outline-danger" data-opc-torol="${i}" title="${esc(I18n.t("finDelete"))}" aria-label="${esc(I18n.t("finDelete"))}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                    </div>
                    ${["hu", "ro", "en"].map(ny => `
                        <div class="col-sm-4"><label class="form-label small mb-1">${I18n.t("finPkgName")} (${ny.toUpperCase()})</label><input class="form-control form-control-sm" data-k="nev.${ny}" value="${esc((o.nev || {})[ny] || "")}"></div>`).join("")}
                    ${["hu", "ro", "en"].map(ny => `
                        <div class="col-sm-4"><label class="form-label small mb-1">${I18n.t("finDescription")} (${ny.toUpperCase()})</label><textarea class="form-control form-control-sm" rows="2" data-k="leiras.${ny}">${esc((o.leiras || {})[ny] || "")}</textarea></div>`).join("")}
                    <div class="col-12 d-flex flex-wrap gap-3">
                        <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" data-k="alap" id="mbo_a${i}" ${o.alap ? "checked" : ""}><label class="form-check-label small" for="mbo_a${i}">${I18n.t("mbOptIncluded")}</label></div>
                        <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" data-k="aktiv" id="mbo_k${i}" ${o.aktiv !== false ? "checked" : ""}><label class="form-check-label small" for="mbo_k${i}">${I18n.t("finActive")}</label></div>
                    </div>
                </div>
            </div>`;

        const kapcsolo = (id, kulcs, cimke, sugo) => `
            <div class="form-check form-switch mb-2">
                <input class="form-check-input" type="checkbox" role="switch" id="${id}" ${b[kulcs] ? "checked" : ""}>
                <label class="form-check-label" for="${id}">${I18n.t(cimke)}<div class="small text-body-secondary">${I18n.t(sugo)}</div></label>
            </div>`;

        const rajzol = () => {
            box.innerHTML = `
                <div class="row g-4">
                    <div class="col-xl-6">
                        <div class="card mb-4">
                            <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("mdSetOffers")}</h5></div>
                            <div class="card-body">
                                <label class="form-label fw-semibold">${I18n.t("mdOfferMode")}</label>
                                ${["jovahagyas", "azonnal"].map(v => `
                                    <div class="form-check">
                                        <input class="form-check-input" type="radio" name="mbsMod" id="mbsMod_${v}" value="${v}" ${(b.ajanlat_mod || "jovahagyas") === v ? "checked" : ""}>
                                        <label class="form-check-label" for="mbsMod_${v}">${I18n.t("mdMode_" + v)}<div class="small text-body-secondary">${I18n.t("mdModeHelp_" + v)}</div></label>
                                    </div>`).join("")}
                                <p class="small text-body-secondary mt-1">${I18n.t("mdModePerMandate")}</p>
                                <label class="form-label fw-semibold mt-2">${I18n.t("mdWhoCanOffer")}</label>
                                ${["kapcsolat_utan", "barki"].map(v => `
                                    <div class="form-check">
                                        <input class="form-check-input" type="radio" name="mbsFelt" id="mbsFelt_${v}" value="${v}" ${(b.ajanlat_feltetel || "kapcsolat_utan") === v ? "checked" : ""}>
                                        <label class="form-check-label" for="mbsFelt_${v}">${I18n.t("mdWho_" + v)}</label>
                                    </div>`).join("")}
                            </div>
                        </div>
                    </div>
                    <div class="col-xl-6">
                        <div class="card mb-4">
                            <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-robot" aria-hidden="true"></i> ${I18n.t("mdSetAuto")}</h5></div>
                            <div class="card-body">
                                ${kapcsolo("mbsAutoVissza", "auto_visszaigazolas", "mdAutoConfirm", "mdAutoConfirmHelp")}
                                ${kapcsolo("mbsAutoMegt", "auto_megtekintes_emlekezteto", "mdAutoViewing", "mdAutoViewingHelp")}
                                ${kapcsolo("mbsAutoVj", "auto_visszajelzes", "mdAutoFeedback", "mdAutoFeedbackHelp")}
                                ${kapcsolo("mbsAutoLezar", "auto_eladaskor_lezar", "mdAutoSold", "mdAutoSoldHelp")}
                                <div class="d-flex align-items-center gap-2 mt-2">
                                    <label class="form-label small mb-0" for="mbsEml">${I18n.t("mdAutoRemind")}</label>
                                    <input class="form-control form-control-sm" style="max-width:90px" id="mbsEml" type="number" min="0" max="720" value="${b.auto_elado_emlekezteto ?? 48}">
                                    <span class="small text-body-secondary">${I18n.t("mdHours")}</span>
                                </div>
                                <p class="small text-body-secondary mt-2 mb-0">${I18n.t("mdAutoNote")}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card mb-4">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-percent" aria-hidden="true"></i> ${I18n.t("mbFees")}</h5></div>
                    <div class="card-body">
                        <div class="form-check form-switch mb-3">
                            <input class="form-check-input" type="checkbox" role="switch" id="mbsAktiv" ${b.aktiv ? "checked" : ""}>
                            <label class="form-check-label" for="mbsAktiv">${I18n.t("mbServiceOn")}</label>
                        </div>
                        <div class="row g-2">
                            <div class="col-6 col-md-2"><label class="form-label small mb-1" for="mbsJut">${I18n.t("mbCommission")} %</label><input class="form-control form-control-sm" id="mbsJut" type="number" step="0.1" value="${b.jutalek}"></div>
                            <div class="col-6 col-md-2"><label class="form-label small mb-1" for="mbsJutK">${I18n.t("mbCommissionExcl")} %</label><input class="form-control form-control-sm" id="mbsJutK" type="number" step="0.1" value="${b.jutalek_kizarolagos}"></div>
                            <div class="col-6 col-md-2"><label class="form-label small mb-1" for="mbsMin">${I18n.t("mbMinFee")}</label><input class="form-control form-control-sm" id="mbsMin" type="number" step="50" value="${b.minimum_dij}"></div>
                            <div class="col-6 col-md-2"><label class="form-label small mb-1" for="mbsPn">${I18n.t("finCurrency")}</label><select class="form-select form-select-sm" id="mbsPn"><option ${b.penznem !== "RON" ? "selected" : ""}>EUR</option><option ${b.penznem === "RON" ? "selected" : ""}>RON</option></select></div>
                            <div class="col-6 col-md-2"><label class="form-label small mb-1" for="mbsIdo">${I18n.t("mbDuration")}</label><input class="form-control form-control-sm" id="mbsIdo" type="number" min="1" max="36" value="${b.idotartam_honap}"></div>
                            ${["", "_ro", "_en"].map(s => `<div class="col-md-4"><label class="form-label small mb-1" for="mbsTer${s}">${I18n.t("mbArea")} (${(s.slice(1) || "hu").toUpperCase()})</label><input class="form-control form-control-sm" id="mbsTer${s}" value="${esc(b["terulet" + s] || "")}"></div>`).join("")}
                            <div class="col-12"><label class="form-label small mb-1" for="mbsSzM">${I18n.t("mbContractExtra")}</label><textarea class="form-control form-control-sm" id="mbsSzM" rows="3">${esc(b.szerzodes_megjegyzes || "")}</textarea></div>
                        </div>
                    </div>
                </div>

                <div class="card mb-4">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0"><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${I18n.t("mbOptions")}</h5>
                        <button type="button" class="btn btn-sm btn-outline-primary" id="mbsUjOpc"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("mbAdd")}</button>
                    </div>
                    <div class="card-body">
                        <p class="small text-body-secondary">${I18n.t("mbOptionsNote")}</p>
                        <div id="mbsOpciok">${opciok.map(opcioSor).join("")}</div>
                    </div>
                </div>

                <div class="text-end mdSaveBar"><button type="button" class="btn btn-primary" id="mbsMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button></div>`;

            const olvasOpciok = () => {
                opciok = [...box.querySelectorAll(".mbOptEdit")].map(el => {
                    const o = { nev: {}, leiras: {} };
                    el.querySelectorAll("[data-k]").forEach(inp => {
                        const [k, ny] = inp.dataset.k.split(".");
                        const val = inp.type === "checkbox" ? inp.checked : inp.value;
                        if (ny) o[k][ny] = val; else o[k] = val;
                    });
                    return o;
                });
            };

            box.querySelector("#mbsUjOpc").onclick = () => {
                olvasOpciok();
                opciok.push({ kod: "uj_" + (opciok.length + 1), ikon: "fa-solid fa-circle-check", ar: 0, penznem: "RON", alap: false, aktiv: true, nev: {}, leiras: {} });
                rajzol();
            };
            box.querySelectorAll("[data-opc-torol]").forEach(btn => {
                btn.onclick = () => { olvasOpciok(); opciok.splice(Number(btn.dataset.opcTorol), 1); rajzol(); };
            });

            box.querySelector("#mbsMent").onclick = () => {
                olvasOpciok();
                const $ = q => box.querySelector(q);
                const radio = n => (box.querySelector(`input[name=${n}]:checked`) || {}).value;
                Svc.api("/api/admin/megbizas-beallitas", {
                    method: "PUT", body: {
                        aktiv: $("#mbsAktiv").checked, jutalek: $("#mbsJut").value, jutalek_kizarolagos: $("#mbsJutK").value,
                        minimum_dij: $("#mbsMin").value, penznem: $("#mbsPn").value, idotartam_honap: $("#mbsIdo").value,
                        terulet: $("#mbsTer").value, terulet_ro: $("#mbsTer_ro").value, terulet_en: $("#mbsTer_en").value,
                        szerzodes_megjegyzes: $("#mbsSzM").value, opciok,
                        ajanlat_mod: radio("mbsMod"), ajanlat_feltetel: radio("mbsFelt"),
                        auto_visszaigazolas: $("#mbsAutoVissza").checked, auto_megtekintes_emlekezteto: $("#mbsAutoMegt").checked,
                        auto_visszajelzes: $("#mbsAutoVj").checked, auto_eladaskor_lezar: $("#mbsAutoLezar").checked,
                        auto_elado_emlekezteto: $("#mbsEml").value
                    }
                }).then(v => { b = v.beallitas; opciok = b.opciok.map(o => ({ ...o })); MandateDesk.jelez(I18n.t("adsSaved")); rajzol(); })
                    .catch(e => MandateDesk.hiba(e));
            };
        };

        rajzol();

    }).catch(() => AdminManager.finHibaDoboz());

};
