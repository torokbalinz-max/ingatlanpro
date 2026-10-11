// ============================================================
//  Admin → Pénzügyek → Rendelések (#admin/rendelesek)
//
//  Ki mit rendelt a Csomagok és árak oldalon: magánszemélyek és irodák,
//  csomagonként hányan vették meg, mennyi folyt be, ki fizetett, kire
//  várunk. A díjbekérő „Fizetve” jelölésével a csomag aktív lesz.
// ============================================================

(() => {

    // A menüpont a Pénzügyi áttekintés után
    const tabok = {};
    for (const [k, v] of Object.entries(AdminManager.TABS)) {
        tabok[k] = v;
        if (k === "penzugy") {
            tabok.rendelesek = {
                group: "finance", icon: "fa-solid fa-cart-shopping", title: "adminTabOrders", desc: "adminDescOrders",
                render: () => AdminManager.renderOrders(), count: "ordersCount", warn: true
            };
        }
    }
    AdminManager.TABS = tabok;
    AdminManager.ALIASES.rendeles = "rendelesek";
    AdminManager.ALIASES.orders = "rendelesek";

    // Számlálók: fizetésre váró rendelések, megbízások teendői
    const eredeti = AdminManager.applyCounts;
    AdminManager.applyCounts = function (c) {
        eredeti.call(this, c);
        AdminManager.setCount("ordersCount", c.penzugy_rendeles);
        AdminManager.setCount("mandatesCount", c.megbizas_uj);
        AdminManager.setCount("navAdminCount", (c.review || 0) + (c.iroda_fuggo || 0) + (c.bejelentes_uj || 0) + (c.penzugy_rendeles || 0) + (c.megbizas_uj || 0));
    };

})();

AdminManager.ordSzuro = { statusz: "", celcsoport: "", csomag_id: "" };

AdminManager.renderOrders = function () {

    AdminManager.loading();

    const f = AdminManager.ordSzuro;
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();

    AdminManager.finApi("rendelesek" + (q ? "?" + q : "")).then(d => {

        const box = AdminManager.box();
        const esc = Utils.escape;
        const o = d.osszesites;
        const ma = AdminManager.finMa();

        const statusz = r => {
            const m = { fizetesre_var: ["warning", "ordSt_fizetesre_var"], aktiv: ["success", "ordSt_aktiv"], teljesitve: ["success", "ordSt_teljesitve"], lemondva: ["secondary", "ordSt_lemondva"], torolve: ["secondary", "ordSt_torolve"] }[r.statusz] || ["secondary", r.statusz];
            return `<span class="badge text-bg-${r.lejart ? "danger" : m[0]}">${esc(r.lejart ? I18n.t("accBillLate") : I18n.t(m[1]))}</span>`;
        };

        const max = Math.max(1, ...d.havi.map(h => h.maganszemely + h.iroda));

        box.innerHTML = `
            <div class="row g-3 mb-4">
                ${AdminManager.finTile("fa-solid fa-cart-shopping", "green", I18n.t("ordTotal"), Utils.num(o.osszes), I18n.f("ordBuyers", { n: o.vevok }))}
                ${AdminManager.finTile("fa-solid fa-hourglass-half", o.lejart ? "red" : "orange", I18n.t("ordAwaiting"), Utils.num(o.fizetesre_var), o.lejart ? I18n.f("ordLateN", { n: o.lejart }) : "")}
                ${AdminManager.finTile("fa-solid fa-arrows-rotate", "blue", I18n.t("ordActiveSubs"), Utils.num(o.aktiv_elofizetok), "", "elofizetesek")}
                ${AdminManager.finTile("fa-solid fa-coins", "green", I18n.t("ordRevenueYear"), AdminManager.finPenz(o.bevetel_iden, "RON"), I18n.t("ordRevenueNote"), "penzugy")}
            </div>

            <div class="card mb-4">
                <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <h5 class="mb-0"><i class="fa-solid fa-tags" aria-hidden="true"></i> ${I18n.t("ordByPackage")}</h5>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-fin-go="csomagok"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("adminTabFinPackages")}</button>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-sm align-middle statTable mb-0">
                            <thead><tr>
                                <th>${I18n.t("accPackage")}</th><th>${I18n.t("finAudience")}</th><th class="text-end">${I18n.t("finPrice")}</th>
                                <th class="text-end">${I18n.t("ordOrders")}</th><th class="text-end">${I18n.t("ordPaid")}</th><th class="text-end">${I18n.t("ordAwaitingShort")}</th>
                                <th class="text-end"><i class="fa-solid fa-user" title="${esc(I18n.t("finAud_maganszemely"))}"></i> / <i class="fa-solid fa-briefcase" title="${esc(I18n.t("finAud_iroda"))}"></i></th>
                                <th class="text-end">${I18n.t("ordActiveSubsShort")}</th><th class="text-end">${I18n.t("ordRevenueYearShort")}</th><th class="text-end">${I18n.t("ordRevenueAll")}</th>
                            </tr></thead>
                            <tbody>
                                ${d.csomagok.map(c => `
                                    <tr class="${c.aktiv ? "" : "text-body-secondary"}">
                                        <td><button type="button" class="btn btn-link p-0 text-start" data-ord-csomag="${c.id}">${esc(AdminManager.finCsomagNev(c))}</button>${c.aktiv ? "" : ` <span class="badge text-bg-light">${I18n.t("finInactive")}</span>`}${c.nyilvanos === false ? ` <span class="badge text-bg-light">${I18n.t("finHidden")}</span>` : ""}</td>
                                        <td class="small">${esc(I18n.t("finAud_" + (c.celcsoport || "mindenki")))}</td>
                                        <td class="text-end text-nowrap">${esc(AdminManager.finPenz(c.ar, c.penznem))}<small class="text-body-secondary"> / ${esc(AdminManager.finIdoszakLabel(c.idoszak))}</small></td>
                                        <td class="text-end">${c.rendelesek || "–"}</td>
                                        <td class="text-end">${c.fizetett || "–"}</td>
                                        <td class="text-end ${c.fizetesre_var ? "text-warning fw-semibold" : ""}">${c.fizetesre_var || "–"}</td>
                                        <td class="text-end text-nowrap">${c.maganszemelyek} / ${c.irodak}</td>
                                        <td class="text-end">${c.aktiv_elofizetok || "–"}</td>
                                        <td class="text-end text-nowrap">${c.bevetel_iden ? esc(AdminManager.finPenz(c.bevetel_iden, "RON")) : "–"}</td>
                                        <td class="text-end text-nowrap">${c.bevetel_ossz ? esc(AdminManager.finPenz(c.bevetel_ossz, "RON")) : "–"}</td>
                                    </tr>`).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-chart-column" aria-hidden="true"></i> ${I18n.t("ordMonthly")}</h5></div>
                <div class="card-body">
                    <div class="ordBars" role="img" aria-label="${esc(I18n.t("ordMonthly"))}">
                        ${d.havi.map(h => `
                            <div class="ordBar" title="${esc(AdminManager.finHo(h.ho))}: ${h.maganszemely} + ${h.iroda} (${I18n.t("ordPaid").toLowerCase()}: ${h.fizetett})">
                                <div class="ordBarStack">
                                    <span class="iroda" style="height:${h.iroda / max * 100}%"></span>
                                    <span class="magan" style="height:${h.maganszemely / max * 100}%"></span>
                                </div>
                                <b>${h.maganszemely + h.iroda || ""}</b>
                                <small>${esc(AdminManager.finHo(h.ho))}</small>
                            </div>`).join("")}
                    </div>
                    <div class="ordLegend small"><span class="magan"></span> ${I18n.t("finAud_maganszemely")} <span class="iroda"></span> ${I18n.t("finAud_iroda")}</div>
                </div>
            </div>

            <div class="d-flex flex-wrap align-items-end gap-2 mb-2">
                <h5 class="mb-0 flex-fill">${I18n.t("ordList")} <span class="badge text-bg-secondary">${d.rendelesek.length}</span></h5>
                <select class="form-select form-select-sm w-auto" id="ordSt" aria-label="${esc(I18n.t("ordStatus"))}">
                    <option value="">${I18n.t("ordAllStatus")}</option>
                    ${["fizetesre_var", "aktiv", "teljesitve", "lemondva", "torolve"].map(k => `<option value="${k}" ${f.statusz === k ? "selected" : ""}>${esc(I18n.t("ordSt_" + k))}</option>`).join("")}
                </select>
                <select class="form-select form-select-sm w-auto" id="ordCel" aria-label="${esc(I18n.t("finAudience"))}">
                    <option value="">${I18n.t("ordAllAudience")}</option>
                    <option value="maganszemely" ${f.celcsoport === "maganszemely" ? "selected" : ""}>${I18n.t("finAud_maganszemely")}</option>
                    <option value="iroda" ${f.celcsoport === "iroda" ? "selected" : ""}>${I18n.t("finAud_iroda")}</option>
                </select>
                <select class="form-select form-select-sm w-auto" id="ordCs" aria-label="${esc(I18n.t("accPackage"))}">
                    <option value="">${I18n.t("ordAllPackages")}</option>
                    ${d.csomagok.map(c => `<option value="${c.id}" ${String(f.csomag_id) === String(c.id) ? "selected" : ""}>${esc(AdminManager.finCsomagNev(c))}</option>`).join("")}
                </select>
            </div>

            ${d.rendelesek.length ? `
            <div class="table-responsive card">
                <table class="table table-sm align-middle mb-0 ordTable">
                    <thead><tr>
                        <th>${I18n.t("accDocDate")}</th><th>${I18n.t("ordCustomer")}</th><th>${I18n.t("accPackage")}</th>
                        <th class="text-end">${I18n.t("prAmount")}</th><th>${I18n.t("prProforma")}</th><th>${I18n.t("ordStatus")}</th><th></th>
                    </tr></thead>
                    <tbody>
                        ${d.rendelesek.map(r => `
                            <tr>
                                <td class="text-nowrap small">${esc(AdminManager.finNap(r.created_at))}</td>
                                <td>
                                    <b>${esc(r.ugyfel_nev || r.fiok_nev || "–")}</b>
                                    <div class="small text-body-secondary">
                                        <i class="fa-solid ${r.celcsoport === "iroda" ? "fa-briefcase" : "fa-user"}" aria-hidden="true"></i>
                                        ${esc(r.iroda_nev || I18n.t("finCustType_" + (r.ugyfel_tipus || "maganszemely")))}
                                        ${r.fiok_email || r.ugyfel_email ? ` · ${esc(r.ugyfel_email || r.fiok_email)}` : ""}
                                    </div>
                                </td>
                                <td>${esc(r.megnevezes || r.csomag_nev || "")}${r.ingatlan_id ? ` <a class="small" href="#listing/${r.ingatlan_id}" target="_blank">#${r.ingatlan_id}</a>` : ""}${r.megjegyzes ? `<div class="small text-body-secondary">„${esc(r.megjegyzes)}”</div>` : ""}</td>
                                <td class="text-end text-nowrap">${esc(AdminManager.finPenz(r.ar, r.penznem))}</td>
                                <td class="text-nowrap small">${r.szamla_id ? `<a href="/api/admin/penzugy/szamlak/${r.szamla_id}/nyomtat" target="_blank" rel="noopener">${esc(r.sorszam || "#" + r.szamla_id)}</a>` : "–"}${r.esedekes && r.statusz === "fizetesre_var" ? `<div class="text-body-secondary">${I18n.t("prDue")}: ${esc(AdminManager.finNap(r.esedekes))}</div>` : ""}</td>
                                <td>${statusz(r)}</td>
                                <td class="text-end text-nowrap">
                                    ${r.statusz === "fizetesre_var" && r.szamla_id ? `
                                        <button type="button" class="btn btn-sm btn-success" data-ord-fizet="${r.szamla_id}"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("ordMarkPaid")}</button>
                                        <button type="button" class="btn btn-sm btn-outline-secondary" data-ord-sztorno="${r.szamla_id}" title="${esc(I18n.t("ordCancel"))}"><i class="fa-solid fa-ban" aria-hidden="true"></i></button>` : ""}
                                </td>
                            </tr>`).join("")}
                    </tbody>
                </table>
            </div>` : `<div class="emptyState"><i class="fa-solid fa-cart-shopping"></i><h5>${I18n.t("ordNone")}</h5><p>${I18n.t("ordNoneText")}</p><a class="btn btn-outline-primary" href="#csomagok" target="_blank">${I18n.t("menuCsomagok")}</a></div>`}`;

        AdminManager.finBindGo(box);

        const szur = () => {
            AdminManager.ordSzuro = { statusz: box.querySelector("#ordSt").value, celcsoport: box.querySelector("#ordCel").value, csomag_id: box.querySelector("#ordCs").value };
            AdminManager.renderOrders();
        };
        ["#ordSt", "#ordCel", "#ordCs"].forEach(q => { const el = box.querySelector(q); if (el) el.onchange = szur; });

        box.querySelectorAll("[data-ord-csomag]").forEach(b => {
            b.onclick = () => { AdminManager.ordSzuro.csomag_id = b.dataset.ordCsomag; AdminManager.renderOrders(); };
        });

        box.querySelectorAll("[data-ord-fizet]").forEach(b => {
            b.onclick = () => {
                const datum = prompt(I18n.t("ordPaidDatePrompt"), ma);
                if (datum === null) return;
                b.disabled = true;
                AdminManager.finApi(`szamlak/${b.dataset.ordFizet}/allapot`, { method: "POST", body: { statusz: "fizetve", fizetve: datum || ma, fizetesi_mod: "atutalas" } })
                    .then(() => { Utils.toast && Utils.toast(I18n.t("ordPaidDone")); AdminManager.refreshPendingCount(); AdminManager.renderOrders(); })
                    .catch(e => { b.disabled = false; AdminManager.finHiba(e); });
            };
        });

        box.querySelectorAll("[data-ord-sztorno]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("ordCancelConfirm"))) return;
                AdminManager.finApi(`szamlak/${b.dataset.ordSztorno}/allapot`, { method: "POST", body: { statusz: "sztorno" } })
                    .then(() => { AdminManager.refreshPendingCount(); AdminManager.renderOrders(); })
                    .catch(AdminManager.finHiba);
            };
        });

    }).catch(() => AdminManager.finHibaDoboz());

};
