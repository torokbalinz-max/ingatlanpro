// ============================================================
//  Admin oldal: jóváhagyás, beolvasás, figyelt oldalak,
//  duplikátumok, városok/kerületek
// ============================================================

class AdminManager {

    static tab = "pending";
    static pollTimer = null;
    static ignoredDupGroups = new Set();

    static init() {

        document.querySelectorAll("#adminTabs [data-tab]").forEach(b => {
            b.onclick = () => AdminManager.open(b.dataset.tab);
        });

    }

    static show() {

        if (!AuthManager.isAdmin()) {
            document.getElementById("adminContent").innerHTML =
                `<div class="alert alert-warning">${I18n.t("alertAdminOnly")}</div>`;
            return;
        }

        AdminManager.open(AdminManager.tab);

    }

    static open(tab) {

        AdminManager.tab = tab;

        document.querySelectorAll("#adminTabs [data-tab]").forEach(b => {
            b.classList.toggle("active", b.dataset.tab === tab);
        });

        if (AdminManager.pollTimer) {
            clearInterval(AdminManager.pollTimer);
            AdminManager.pollTimer = null;
        }

        ({
            pending: AdminManager.renderPending,
            import: AdminManager.renderImport,
            watch: AdminManager.renderWatch,
            dups: AdminManager.renderDups,
            places: AdminManager.renderPlaces
        })[tab]();

    }

    static box() {
        return document.getElementById("adminContent");
    }

    static loading() {
        AdminManager.box().innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;
    }

    static refreshPendingCount() {

        if (!AuthManager.isAdmin()) return;

        fetch("/api/admin/pending")
            .then(r => r.json())
            .then(lista => {
                document.getElementById("pendingCount").innerText = lista.length || "";
            })
            .catch(() => { });

    }

    static typeOptions(selected) {
        return Types.LIST.map(t => `<option value="${t.key}" ${t.key === selected ? "selected" : ""}>${I18n.t(t.label)}</option>`).join("");
    }

    static cityOptions(selected) {
        return CityManager.varosok
            .map(v => v.nev)
            .sort((a, b) => CityManager.displayName(a).localeCompare(CityManager.displayName(b), "hu"))
            .map(n => `<option value="${Utils.escape(n)}" ${n === selected ? "selected" : ""}>${Utils.escape(CityManager.displayName(n))}</option>`)
            .join("");
    }

    // ================= JÓVÁHAGYÁSRA VÁR =================

    static renderPending() {

        AdminManager.loading();

        fetch("/api/admin/pending")
            .then(r => r.json())
            .then(lista => {

                DataManager.prepare(lista);

                document.getElementById("pendingCount").innerText = lista.length || "";

                if (!lista.length) {
                    AdminManager.box().innerHTML = `
                        <div class="emptyState">
                            <i class="fa-solid fa-inbox"></i>
                            <h5>${I18n.t("pendingEmpty")}</h5>
                            <p>${I18n.t("pendingEmptyHint")}</p>
                        </div>`;
                    return;
                }

                AdminManager.box().innerHTML = `
                    <p class="sectionNote">${I18n.t("pendingNote")}</p>
                    <div class="d-flex flex-column gap-2">
                        ${lista.map(i => {
                            const foto = Utils.photoUrl(i);
                            const hianyzo = i.hianyzo || [];
                            return `
                                <div class="pendingRow card">
                                    <div class="card-body d-flex flex-wrap gap-3 align-items-center">
                                        <div class="pendingThumb">${foto ? `<img src="${Utils.escape(foto)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">` : `<i class="${Types.get(i.tipus).icon}"></i>`}</div>
                                        <div class="flex-fill" style="min-width:220px;">
                                            <div class="fw-bold">${Utils.escape(i.cim || Types.label(i.tipus))} <span class="text-body-secondary small">#${i.id}</span></div>
                                            <div class="small">${Utils.price(i)} · ${i.nm ? Utils.num(i.nm) + " m²" : "?"} · ${Utils.escape(CityManager.displayName(i.varos))}${i.kerulet ? " · " + Utils.escape(i.kerulet) : ""}</div>
                                            <div class="small mt-1">${Sources.badge(i.forras)}
                                                ${i.hely_pontossag === "kozelito" ? `<span class="badge text-bg-info">${I18n.t("approxShort")}</span>` : ""}
                                                ${hianyzo.map(m => `<span class="badge text-bg-warning">${I18n.t("field_" + m)}</span>`).join(" ")}
                                            </div>
                                        </div>
                                        <div class="d-flex gap-2 flex-wrap">
                                            ${i.link ? `<a class="btn btn-sm btn-outline-secondary" href="${Utils.escape(i.link)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ""}
                                            <button class="btn btn-sm btn-primary" data-edit="${i.id}"><i class="fa-solid fa-pen"></i> ${I18n.t("pendingEdit")}</button>
                                            <button class="btn btn-sm btn-success" data-approve="${i.id}" ${["ar", "nm", "hely"].some(m => hianyzo.includes(m)) ? "disabled" : ""}><i class="fa-solid fa-check"></i> ${I18n.t("pendingApprove")}</button>
                                            <button class="btn btn-sm btn-outline-danger" data-reject="${i.id}"><i class="fa-solid fa-trash"></i></button>
                                        </div>
                                    </div>
                                </div>`;
                        }).join("")}
                    </div>`;

                const box = AdminManager.box();

                box.querySelectorAll("[data-edit]").forEach(b => {
                    b.onclick = () => NewPropertyManager.startEdit({ id: Number(b.dataset.edit) });
                });

                box.querySelectorAll("[data-approve]").forEach(b => {
                    b.onclick = () => AdminManager.approve(Number(b.dataset.approve));
                });

                box.querySelectorAll("[data-reject]").forEach(b => {
                    b.onclick = () => {
                        if (!confirm(I18n.t("pendingRejectConfirm"))) return;
                        fetch("/api/ingatlanok/" + b.dataset.reject, { method: "DELETE" })
                            .then(() => AdminManager.renderPending());
                    };
                });

            });

    }

    static approve(id) {

        fetch("/api/ingatlanok/" + id)
            .then(r => r.json())
            .then(i => fetch("/api/ingatlanok/" + id, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...i, kepek: [], jovahagy: true })
            }))
            .then(r => r.json().then(v => ({ ok: r.ok, v })))
            .then(({ ok, v }) => {
                if (!ok) {
                    alert(I18n.t("newMissingTitle") + " " + (v.hianyzo || []).map(m => I18n.t("field_" + m)).join(", "));
                    return;
                }
                DataManager.init();
                AdminManager.renderPending();
            });

    }

    // ================= BEOLVASÁS =================

    static renderImport() {

        AdminManager.box().innerHTML = `
            <div class="row g-4">
                <div class="col-xl-5">
                    <div class="card">
                        <div class="card-body">
                            <label class="form-label" for="impUrls">${I18n.t("importUrls")}</label>
                            <textarea id="impUrls" class="form-control mb-2" rows="8" placeholder="https://www.imobiliare.ro/vanzare-apartamente/sfantu-gheorghe&#10;https://www.imoradar24.ro/oferta/..."></textarea>
                            <p class="small text-body-secondary">${I18n.t("importUrlsHelp")}</p>

                            <div class="row g-2 mb-3">
                                <div class="col-md-4">
                                    <label class="form-label">${I18n.t("detailVaros")}</label>
                                    <select id="impVaros" class="form-select form-select-sm">${AdminManager.cityOptions(DataManager.currentCity)}</select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">${I18n.t("typeLabel")}</label>
                                    <select id="impTipus" class="form-select form-select-sm">${AdminManager.typeOptions(FilterManager.tipus)}</select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">${I18n.t("ugyletLabel")}</label>
                                    <select id="impUgylet" class="form-select form-select-sm">
                                        <option value="elado">${I18n.t("ugyletElado")}</option>
                                        <option value="kiado" ${FilterManager.ugylet === "kiado" ? "selected" : ""}>${I18n.t("ugyletKiado")}</option>
                                    </select>
                                </div>
                            </div>
                            <p class="small text-body-secondary">${I18n.t("importDefaultsHelp")}</p>

                            <div class="d-grid">
                                <button class="btn btn-primary" id="impStart"><i class="fa-solid fa-play"></i> ${I18n.t("importStart")}</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-xl-7">
                    <div id="impStatus">
                        <div class="card"><div class="card-body">
                            <h6>${I18n.t("importHowTitle")}</h6>
                            <ol class="howList small mb-0">
                                <li>${I18n.t("importHow1")}</li>
                                <li>${I18n.t("importHow2")}</li>
                                <li>${I18n.t("importHow3")}</li>
                                <li>${I18n.t("importHow4")}</li>
                            </ol>
                        </div></div>
                    </div>
                </div>
            </div>`;

        document.getElementById("impStart").onclick = () => {

            const body = {
                urls: document.getElementById("impUrls").value,
                varos: document.getElementById("impVaros").value,
                tipus: document.getElementById("impTipus").value,
                ugylet: document.getElementById("impUgylet").value
            };

            fetch("/api/admin/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
            .then(r => r.json().then(v => ({ ok: r.ok, v })))
            .then(({ ok, v }) => {
                if (!ok) {
                    alert(I18n.t(v.error === "no_urls" ? "importNoUrls" : "alertSaveError"));
                    return;
                }
                AdminManager.pollJob(v.jobId, "impStatus");
            });

        };

    }

    static pollJob(jobId, boxId) {

        const rajzol = job => {

            const box = document.getElementById(boxId);
            if (!box) return;

            const pct = job.osszes ? Math.round(job.kesz / job.osszes * 100) : 0;

            const szoveg = {
                uj: I18n.t("importResNew"),
                ar_frissitve: I18n.t("importResPrice"),
                mar_megvan: I18n.t("importResExists"),
                lista: I18n.t("importResList"),
                hiba: I18n.t("importResError")
            };

            box.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between mb-2">
                            <b>${job.allapot === "kesz" ? I18n.t("importDone") : I18n.t("importRunning")}</b>
                            <span>${job.kesz} / ${job.osszes || "?"}</span>
                        </div>
                        <div class="progress mb-3" style="height:8px;"><div class="progress-bar ${job.allapot === "kesz" ? "bg-success" : "progress-bar-striped progress-bar-animated"}" style="width:${job.allapot === "kesz" ? 100 : pct}%"></div></div>
                        <div class="d-flex flex-wrap gap-2 mb-3">
                            <span class="badge text-bg-success">${job.uj} ${I18n.t("importResNew")}</span>
                            <span class="badge text-bg-info">${job.frissitett} ${I18n.t("importResPrice")}</span>
                            <span class="badge text-bg-secondary">${job.kihagyott} ${I18n.t("importResExists")}</span>
                            <span class="badge text-bg-danger">${job.hibak} ${I18n.t("importResError")}</span>
                        </div>
                        <div class="importLog">
                            ${job.naplo.slice().reverse().map(n => `
                                <div class="small">
                                    <span class="badge ${n.eredmeny === "uj" ? "text-bg-success" : n.eredmeny === "hiba" ? "text-bg-danger" : "text-bg-light"}">${szoveg[n.eredmeny] || n.eredmeny}</span>
                                    ${n.url ? `<a href="${Utils.escape(n.url)}" target="_blank" rel="noopener">${Utils.escape(n.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80))}</a>` : ""}
                                    ${n.db !== undefined ? `(${n.db})` : ""}
                                    ${n.uzenet ? `<span class="text-danger">${Utils.escape(n.uzenet)}</span>` : ""}
                                    ${n.regi ? `${Utils.eur(n.regi)} → ${Utils.eur(n.uj)}` : ""}
                                    ${n.hianyzo && n.hianyzo.length ? n.hianyzo.map(m => `<span class="badge text-bg-warning">${I18n.t("field_" + m)}</span>`).join(" ") : ""}
                                </div>`).join("")}
                        </div>
                        ${job.allapot === "kesz" && job.uj ? `<button class="btn btn-sm btn-primary mt-3" id="goPending"><i class="fa-solid fa-inbox"></i> ${I18n.t("importGoPending")}</button>` : ""}
                    </div>
                </div>`;

            const go = document.getElementById("goPending");
            if (go) go.onclick = () => AdminManager.open("pending");

        };

        const lekerdez = () => fetch("/api/admin/import/" + jobId)
            .then(r => r.json())
            .then(job => {
                rajzol(job);
                if (job.allapot === "kesz" || job.allapot === "hiba") {
                    clearInterval(AdminManager.pollTimer);
                    AdminManager.pollTimer = null;
                    AdminManager.refreshPendingCount();
                    DataManager.init();
                }
            });

        if (AdminManager.pollTimer) clearInterval(AdminManager.pollTimer);

        lekerdez();
        AdminManager.pollTimer = setInterval(lekerdez, 2000);

    }

    // ================= FIGYELT OLDALAK =================

    static renderWatch() {

        AdminManager.loading();

        fetch("/api/admin/watch")
            .then(r => r.json())
            .then(lista => {

                const cronUrl = `${location.origin}/api/cron/run?key=CRON_KEY`;

                AdminManager.box().innerHTML = `
                    <p class="sectionNote">${I18n.t("watchNote")}</p>

                    <div class="card mb-4">
                        <div class="card-body">
                            <div class="row g-2 align-items-end">
                                <div class="col-lg-4"><label class="form-label">${I18n.t("watchUrl")}</label><input id="wUrl" class="form-control form-control-sm" placeholder="https://www.imobiliare.ro/vanzare-apartamente/..."></div>
                                <div class="col-lg-2"><label class="form-label">${I18n.t("watchName")}</label><input id="wNev" class="form-control form-control-sm"></div>
                                <div class="col-lg-2"><label class="form-label">${I18n.t("detailVaros")}</label><select id="wVaros" class="form-select form-select-sm">${AdminManager.cityOptions(DataManager.currentCity)}</select></div>
                                <div class="col-lg-2"><label class="form-label">${I18n.t("typeLabel")}</label><select id="wTipus" class="form-select form-select-sm">${AdminManager.typeOptions("lakas")}</select></div>
                                <div class="col-lg-1"><label class="form-label">${I18n.t("ugyletLabel")}</label><select id="wUgylet" class="form-select form-select-sm"><option value="elado">${I18n.t("ugyletElado")}</option><option value="kiado">${I18n.t("ugyletKiado")}</option></select></div>
                                <div class="col-lg-1 d-grid"><button class="btn btn-sm btn-primary" id="wAdd"><i class="fa-solid fa-plus"></i></button></div>
                            </div>
                        </div>
                    </div>

                    ${lista.length ? `
                        <div class="table-responsive mb-4">
                            <table class="table table-sm statTable align-middle">
                                <thead><tr><th>${I18n.t("watchName")}</th><th>${I18n.t("detailVaros")}</th><th>${I18n.t("typeLabel")}</th><th>${I18n.t("watchLastRun")}</th><th></th></tr></thead>
                                <tbody>
                                    ${lista.map(w => `
                                        <tr>
                                            <td><a href="${Utils.escape(w.url)}" target="_blank" rel="noopener">${Utils.escape(w.nev || w.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60))}</a></td>
                                            <td>${Utils.escape(CityManager.displayName(w.varos))}</td>
                                            <td>${Types.label(w.tipus)} · ${Types.ugyletLabel(w.ugylet)}</td>
                                            <td class="small">${w.utolso_futas ? Utils.ago(w.utolso_futas) + "<br>" + Utils.escape(w.utolso_eredmeny || "") : "–"}</td>
                                            <td class="text-end text-nowrap">
                                                <button class="btn btn-sm btn-outline-primary" data-run="${w.id}"><i class="fa-solid fa-rotate"></i> ${I18n.t("watchRun")}</button>
                                                <button class="btn btn-sm btn-outline-danger" data-del="${w.id}"><i class="fa-solid fa-trash"></i></button>
                                            </td>
                                        </tr>`).join("")}
                                </tbody>
                            </table>
                        </div>
                        <div id="watchStatus" class="mb-4"></div>` : `<div class="emptyState"><i class="fa-solid fa-binoculars"></i><h5>${I18n.t("watchEmpty")}</h5></div>`}

                    <div class="card">
                        <div class="card-body small">
                            <h6><i class="fa-solid fa-clock"></i> ${I18n.t("watchAutoTitle")}</h6>
                            <ol class="howList mb-0">
                                <li>${I18n.t("watchAuto1")}</li>
                                <li>${I18n.t("watchAuto2")}</li>
                                <li>${I18n.t("watchAuto3")} <code>${Utils.escape(cronUrl)}</code></li>
                            </ol>
                        </div>
                    </div>`;

                document.getElementById("wAdd").onclick = () => {
                    fetch("/api/admin/watch", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            url: document.getElementById("wUrl").value,
                            nev: document.getElementById("wNev").value,
                            varos: document.getElementById("wVaros").value,
                            tipus: document.getElementById("wTipus").value,
                            ugylet: document.getElementById("wUgylet").value
                        })
                    }).then(r => {
                        if (!r.ok) alert(I18n.t("scrapeBadUrl"));
                        AdminManager.renderWatch();
                    });
                };

                AdminManager.box().querySelectorAll("[data-run]").forEach(b => {
                    b.onclick = () => {
                        fetch(`/api/admin/watch/${b.dataset.run}/run`, { method: "POST" })
                            .then(r => r.json())
                            .then(v => AdminManager.pollJob(v.jobId, "watchStatus"));
                    };
                });

                AdminManager.box().querySelectorAll("[data-del]").forEach(b => {
                    b.onclick = () => {
                        if (!confirm(I18n.t("watchDeleteConfirm"))) return;
                        fetch("/api/admin/watch/" + b.dataset.del, { method: "DELETE" }).then(() => AdminManager.renderWatch());
                    };
                });

            });

    }

    // ================= DUPLIKÁTUMOK =================

    static dupRow(i, name, checked) {
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
    }

    static renderDups() {

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

                    <h5 class="sectionTitle"><i class="fa-solid fa-code-compare"></i> ${I18n.t("dupProbableTitle")} <span class="badge text-bg-warning">${valoszinu.length}</span></h5>
                    <p class="sectionNote">${I18n.t("dupProbableNote")}</p>

                    ${valoszinu.length ? valoszinu.map((g, gi) => `
                        <div class="card mb-3 dupGroup" data-group="${g.tagok.map(t => t.id).join("-")}">
                            <div class="card-body">
                                <div class="d-flex flex-column gap-1 mb-2">
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

    }

    // ================= VÁROSOK, KERÜLETEK =================

    static renderPlaces() {

        AdminManager.loading();

        Promise.all([
            CityManager.loadVarosok(),
            fetch("/api/keruletek").then(r => r.json())
        ]).then(([, keruletek]) => {

            const varosok = [...CityManager.varosok].sort((a, b) =>
                CityManager.displayName(a.nev).localeCompare(CityManager.displayName(b.nev), "hu"));

            AdminManager.box().innerHTML = `
                <p class="sectionNote">${I18n.t("placesNote")}</p>

                <div class="card mb-4">
                    <div class="card-body d-flex gap-2">
                        <input id="newCityName" class="form-control" placeholder="${I18n.t("alertNewCityPrompt")}">
                        <button class="btn btn-primary text-nowrap" id="addCity"><i class="fa-solid fa-plus"></i> ${I18n.t("newAddVaros")}</button>
                    </div>
                </div>

                <div class="row g-3">
                    ${varosok.map(v => {
                        const k = keruletek.filter(x => x.varos === v.nev);
                        return `
                            <div class="col-md-6 col-xl-4">
                                <div class="card h-100">
                                    <div class="card-header"><h6 class="mb-0"><i class="fa-solid fa-city"></i> ${Utils.escape(CityManager.displayName(v.nev))} <span class="badge text-bg-light">${k.length}</span></h6></div>
                                    <div class="card-body">
                                        <div class="d-flex flex-wrap gap-1 mb-3">
                                            ${k.length ? k.map(x => `<span class="filterChip">${Utils.escape(x.nev)}</span>`).join("") : `<span class="text-body-secondary small">${I18n.t("placesNoDistricts")}</span>`}
                                        </div>
                                        <div class="input-group input-group-sm">
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

    }

}
