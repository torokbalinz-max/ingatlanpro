// ============================================================
//  Admin – Duplikátumok és hibás adatsorok
// ============================================================


AdminManager.dupRow = function (i, name, checked) {
    return `
        <label class="dupMember">
            <input type="radio" class="form-check-input" name="${name}" value="${i.id}" ${checked ? "checked" : ""}>
            <span class="flex-fill">
                <b>#${i.id}</b> · ${Utils.eur(i.ar)} · ${Utils.num(i.nm)} m² · ${i.szobak || "-"} ${I18n.t("colSzoba").toLowerCase()} · ${Utils.escape(i.emelet || "-")}
                ${i.kerulet ? " · " + Utils.escape(i.kerulet) : ""}
                ${i.kep_db ? ` · <i class="fa-solid fa-camera"></i> ${i.kep_db}` : ""}
                ${i.kedvenc ? " · ⭐" : ""}
            </span>
            ${Sources.badge(Sources.fromLink(i.link))}
            ${i.link ? `<a href="${Utils.escape(i.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ""}
        </label>`;
};

AdminManager.renderDups = function () {

    AdminManager.loading();

    fetch("/api/admin/duplicates")
        .then(r => r.json())
        .then(d => {

            const valoszinu = d.valoszinu.filter(g => !AdminManager.ignoredDupGroups.has(g.tagok.map(t => t.id).join("-")));

            AdminManager.box().innerHTML = `

                <div class="card mb-4">
                    <div class="card-body d-flex flex-wrap align-items-center gap-3">
                        <div class="flex-fill">
                            <h5 class="mb-1"><i class="fa-solid fa-clone"></i> ${I18n.t("dupExactTitle")}</h5>
                            <p class="sectionNote mb-0">${I18n.f("dupExactNote", { groups: d.biztos.length, extra: d.biztosFelesleges })}</p>
                        </div>
                        <button class="btn btn-danger" id="dupClean" ${d.biztosFelesleges ? "" : "disabled"}>
                            <i class="fa-solid fa-broom"></i> ${I18n.f("dupCleanBtn", { n: d.biztosFelesleges })}
                        </button>
                    </div>
                </div>

                ${d.hibas.length ? `
                <div class="card mb-4">
                    <div class="card-body">
                        <div class="d-flex flex-wrap align-items-center gap-3 mb-2">
                            <div class="flex-fill">
                                <h5 class="mb-1"><i class="fa-solid fa-triangle-exclamation text-warning"></i> ${I18n.t("invalidTitle")}</h5>
                                <p class="sectionNote mb-0">${I18n.f("invalidNote", { n: d.hibas.length })}</p>
                            </div>
                            <button class="btn btn-outline-danger" id="invalidDelete"><i class="fa-solid fa-trash"></i> ${I18n.f("invalidDeleteBtn", { n: d.hibas.length })}</button>
                        </div>
                        <div class="table-responsive" style="max-height:260px;">
                            <table class="table table-sm statTable mb-0">
                                <thead><tr><th>#</th><th>${I18n.t("colAr")}</th><th>${I18n.t("colNm")}</th><th>Link</th><th></th></tr></thead>
                                <tbody>${d.hibas.map(i => `
                                    <tr>
                                        <td>${i.id}</td>
                                        <td>${i.ar ?? "-"}</td>
                                        <td>${i.nm ?? "-"}</td>
                                        <td class="small text-truncate" style="max-width:320px;">${Utils.escape(i.link || "–")}</td>
                                        <td><button class="btn btn-sm btn-link p-0" data-fix="${i.id}">${I18n.t("detailEdit")}</button></td>
                                    </tr>`).join("")}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>` : ""}

                ${AdminManager.section("fa-solid fa-code-compare", `${I18n.t("dupProbableTitle")} <span class="badge text-bg-warning">${valoszinu.length}</span>`, I18n.t("dupProbableNote"))}

                ${valoszinu.length ? valoszinu.map((g, gi) => `
                    <div class="card mb-3 dupGroup" data-group="${g.tagok.map(t => t.id).join("-")}">
                        <div class="card-body">
                            <div class="d-flex flex-column gap-2 mb-3">
                                ${g.tagok.map((i, idx) => AdminManager.dupRow(i, "dupKeep" + gi, idx === 0)).join("")}
                            </div>
                            <div class="d-flex gap-2 justify-content-end">
                                <button class="btn btn-sm btn-outline-secondary" data-ignore="${gi}">${I18n.t("dupNotDuplicate")}</button>
                                <button class="btn btn-sm btn-primary" data-merge="${gi}"><i class="fa-solid fa-object-group"></i> ${I18n.t("dupMerge")}</button>
                            </div>
                        </div>
                    </div>`).join("") : `<div class="emptyState"><i class="fa-solid fa-check"></i><h5>${I18n.t("dupNone")}</h5></div>`}`;

            const inv = document.getElementById("invalidDelete");

            if (inv) inv.onclick = () => {
                if (!confirm(I18n.f("dupCleanConfirm", { n: d.hibas.length }))) return;
                fetch("/api/admin/invalid/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: d.hibas.map(i => i.id) })
                }).then(() => {
                    DataManager.init();
                    AdminManager.renderDups();
                });
            };

            AdminManager.box().querySelectorAll("[data-fix]").forEach(b => {
                b.onclick = () => NewPropertyManager.startEdit({ id: Number(b.dataset.fix) });
            });

            const clean = document.getElementById("dupClean");

            clean.onclick = () => {
                if (!confirm(I18n.f("dupCleanConfirm", { n: d.biztosFelesleges }))) return;
                clean.disabled = true;
                fetch("/api/admin/duplicates/clean", { method: "POST" })
                    .then(r => r.json())
                    .then(v => {
                        alert(I18n.f("dupCleaned", { n: v.torolt }));
                        DataManager.init();
                        AdminManager.renderDups();
                    });
            };

            AdminManager.box().querySelectorAll("[data-ignore]").forEach(b => {
                b.onclick = () => {
                    AdminManager.ignoredDupGroups.add(valoszinu[Number(b.dataset.ignore)].tagok.map(t => t.id).join("-"));
                    AdminManager.renderDups();
                };
            });

            AdminManager.box().querySelectorAll("[data-merge]").forEach(b => {
                b.onclick = () => {

                    const gi = Number(b.dataset.merge);
                    const g = valoszinu[gi];
                    const megtart = Number(document.querySelector(`input[name="dupKeep${gi}"]:checked`).value);
                    const torlendo = g.tagok.map(t => t.id).filter(id => id !== megtart);

                    if (!confirm(I18n.f("dupMergeConfirm", { keep: megtart }))) return;

                    fetch("/api/admin/duplicates/merge", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ megtart, torlendo })
                    }).then(() => {
                        DataManager.init();
                        AdminManager.renderDups();
                    });

                };
            });

        });

};
