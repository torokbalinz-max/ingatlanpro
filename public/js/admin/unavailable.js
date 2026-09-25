// ============================================================
//  Admin – Nem elérhető (eladott / törölt) hirdetések
// ============================================================


AdminManager.renderUnavailable = function () {

    AdminManager.loading();

    fetch("/api/admin/unavailable")
        .then(r => r.json())
        .then(lista => {

            DataManager.prepare(lista);

            AdminManager.setCount("unavailableCount", lista.length);

            AdminManager.box().innerHTML = `

                <div class="card mb-4">
                    <div class="card-body d-flex flex-wrap align-items-center gap-3">
                        <div class="flex-fill">
                            <h5 class="mb-1"><i class="fa-solid fa-satellite-dish"></i> ${I18n.t("recheckTitle")}</h5>
                            <p class="sectionNote mb-0">${I18n.t("recheckNote")}</p>
                        </div>
                        <button class="btn btn-primary" id="recheckStart"><i class="fa-solid fa-play"></i> ${I18n.t("recheckBtn")}</button>
                    </div>
                    <div class="px-3 pb-3" id="recheckStatus"></div>
                </div>

                ${AdminManager.section("fa-solid fa-ban", `${I18n.t("unavailableTitle")} <span class="badge text-bg-secondary">${lista.length}</span>`, I18n.t("unavailableNote"),
                    lista.length ? `<button class="btn btn-sm btn-outline-danger text-nowrap" id="unavDeleteAll"><i class="fa-solid fa-trash"></i> ${I18n.f("invalidDeleteBtn", { n: lista.length })}</button>` : "")}

                ${lista.length ? `
                    <div class="d-flex flex-column gap-3">
                        ${lista.map(i => {
                            const foto = Utils.photoUrl(i);
                            return `
                                <div class="pendingRow card">
                                    <div class="card-body d-flex flex-wrap gap-3 align-items-center">
                                        <div class="pendingThumb">${foto ? `<img src="${Utils.escape(foto)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">` : `<i class="${Types.get(i.tipus).icon}"></i>`}</div>
                                        <div class="flex-fill" style="min-width:220px;">
                                            <div class="fw-bold">${Utils.escape(i.cim || Types.label(i.tipus))} <span class="text-body-secondary small">#${i.id}</span></div>
                                            <div class="small">${Utils.price(i)} · ${i.nm ? Utils.num(i.nm) + " m²" : "?"} · ${Utils.escape(CityManager.displayName(i.varos))}</div>
                                            <div class="small text-body-secondary">${I18n.t("lastChecked")}: ${Utils.ago(i.utolso_ellenorzes)} · ${Sources.badge(i.forras)}</div>
                                        </div>
                                        <div class="d-flex gap-2">
                                            ${i.link ? `<a class="btn btn-sm btn-outline-secondary" href="${Utils.escape(i.link)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ""}
                                            <button class="btn btn-sm btn-outline-success" data-restore="${i.id}"><i class="fa-solid fa-rotate-left"></i> ${I18n.t("unavailableRestore")}</button>
                                            <button class="btn btn-sm btn-outline-danger" data-del="${i.id}"><i class="fa-solid fa-trash"></i></button>
                                        </div>
                                    </div>
                                </div>`;
                        }).join("")}
                    </div>` : `<div class="emptyState"><i class="fa-solid fa-check"></i><h5>${I18n.t("unavailableEmpty")}</h5></div>`}`;

            document.getElementById("recheckStart").onclick = () => {
                fetch("/api/admin/recheck", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ limit: 500 })
                })
                .then(r => r.json())
                .then(v => AdminManager.pollJob(v.jobId, "recheckStatus"));
            };

            const box = AdminManager.box();

            box.querySelectorAll("[data-restore]").forEach(b => {
                b.onclick = () => fetch(`/api/admin/unavailable/${b.dataset.restore}/restore`, { method: "POST" })
                    .then(() => { DataManager.init(); AdminManager.renderUnavailable(); });
            });

            box.querySelectorAll("[data-del]").forEach(b => {
                b.onclick = () => {
                    if (!confirm(I18n.t("alertConfirmDelete"))) return;
                    fetch("/api/ingatlanok/" + b.dataset.del, { method: "DELETE" }).then(() => AdminManager.renderUnavailable());
                };
            });

            const all = document.getElementById("unavDeleteAll");

            if (all) all.onclick = () => {
                if (!confirm(I18n.f("dupCleanConfirm", { n: lista.length }))) return;
                fetch("/api/admin/invalid/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: lista.map(i => i.id) })
                }).then(() => AdminManager.renderUnavailable());
            };

        });

};
