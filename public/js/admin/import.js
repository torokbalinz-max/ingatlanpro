// ============================================================
//  Admin – Beolvasás linkről, figyelt oldalak, futó feladatok állapota
// ============================================================


AdminManager.renderImport = function () {

    AdminManager.box().innerHTML = `
        <div class="row g-4">
            <div class="col-xl-5">
                <div class="card">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-link"></i> ${I18n.t("importUrls")}</h5></div>
                    <div class="card-body">
                        <label class="form-label visually-hidden" for="impUrls">${I18n.t("importUrls")}</label>
                        <textarea id="impUrls" class="form-control mb-2" rows="8" placeholder="https://www.imoradar24.ro/apartamente-de-vanzare/judetul-covasna/sfantu-gheorghe&#10;https://www.imoradar24.ro/oferta/..."></textarea>
                        <p class="small text-body-secondary">${I18n.t("importUrlsHelp")}</p>

                        <div class="row g-3 mb-2">
                            <div class="col-md-4">
                                <label class="form-label">${I18n.t("detailVaros")}</label>
                                <select id="impVaros" class="form-select">${AdminManager.cityOptions(DataManager.currentCity)}</select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">${I18n.t("typeLabel")}</label>
                                <select id="impTipus" class="form-select">${AdminManager.typeOptions(FilterManager.tipus)}</select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">${I18n.t("ugyletLabel")}</label>
                                <select id="impUgylet" class="form-select">
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
                    <div class="card helpCard"><div class="card-body">
                        <h6><i class="fa-solid fa-circle-info"></i> ${I18n.t("importHowTitle")}</h6>
                        <ol class="howList mb-0">
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

};

AdminManager.pollJob = function (jobId, boxId) {

    const rajzol = job => {

        const box = document.getElementById(boxId);
        if (!box) return;

        const pct = job.osszes ? Math.round(job.kesz / job.osszes * 100) : 0;

        const szoveg = {
            uj: I18n.t("importResNew"),
            ar_frissitve: I18n.t("importResPrice"),
            mar_megvan: I18n.t("importResExists"),
            lista: I18n.t("importResList"),
            hiba: I18n.t("importResError"),
            nem_elerheto: I18n.t("importResUnavailable"),
            rendben: I18n.t("importResOk"),
            frissitve: I18n.t("importResUpdated"),
            ujra_elerheto: I18n.t("importResBack"),
            lista_szinkron: I18n.t("importResSync")
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
                        <span class="badge text-bg-info">${job.frissitett} ${I18n.t("importResUpdated")}</span>
                        <span class="badge text-bg-secondary">${job.kihagyott} ${I18n.t("importResExists")}</span>
                        ${job.nemElerheto ? `<span class="badge text-bg-dark">${job.nemElerheto} ${I18n.t("importResUnavailable")}</span>` : ""}
                        <span class="badge text-bg-danger">${job.hibak} ${I18n.t("importResError")}</span>
                    </div>
                    <div class="importLog">
                        ${job.naplo.slice().reverse().map(n => `
                            <div class="small">
                                <span class="badge ${n.eredmeny === "uj" ? "text-bg-success" : n.eredmeny === "hiba" ? "text-bg-danger" : "text-bg-light"}">${szoveg[n.eredmeny] || n.eredmeny}</span>
                                ${n.url ? `<a href="${Utils.escape(n.url)}" target="_blank" rel="noopener">${Utils.escape(n.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80))}</a>` : ""}
                                ${n.db !== undefined ? `(${n.db})` : ""}
                                ${n.ok === "nincs_a_listaban" ? `<span class="text-muted">${I18n.t("importResNotInList")}</span>` : ""}
                                ${n.uzenet ? `<span class="text-danger">${Utils.escape(n.uzenet)}</span>` : ""}
                                ${n.regi ? `${Utils.eur(n.regi)} → ${Utils.eur(n.uj)}` : ""}
                                ${n.hianyzo && n.hianyzo.length ? n.hianyzo.map(m => `<span class="badge text-bg-warning">${I18n.t("field_" + m)}</span>`).join(" ") : ""}
                                ${n.problemak && n.problemak.length ? n.problemak.map(m => `<span class="badge text-bg-danger">${I18n.t("prob_" + m)}</span>`).join(" ") : ""}
                            </div>`).join("")}
                    </div>
                    ${job.allapot === "kesz" && job.uj ? `<button class="btn btn-sm btn-primary mt-3" id="goPending"><i class="fa-solid fa-inbox"></i> ${I18n.t("importGoPending")}</button>` : ""}
                </div>
            </div>`;

        const go = document.getElementById("goPending");
        if (go) go.onclick = () => AdminManager.open("review");

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

};


AdminManager.renderWatch = function () {

    AdminManager.loading();

    fetch("/api/admin/watch")
        .then(r => r.json())
        .then(lista => {

            const cronUrl = `${location.origin}/api/cron/run?key=CRON_KEY`;

            AdminManager.box().innerHTML = `
                <div class="card mb-4">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-plus"></i> ${I18n.t("watchAddTitle")}</h5></div>
                    <div class="card-body">
                        <div class="row g-3 align-items-end">
                            <div class="col-12"><label class="form-label">${I18n.t("watchUrl")}</label><input id="wUrl" class="form-control" placeholder="https://www.imoradar24.ro/apartamente-de-vanzare/judetul-covasna/sfantu-gheorghe"></div>
                            <div class="col-md-6 col-xl-3"><label class="form-label">${I18n.t("watchName")}</label><input id="wNev" class="form-control"></div>
                            <div class="col-md-6 col-xl-3"><label class="form-label">${I18n.t("detailVaros")}</label><select id="wVaros" class="form-select">${AdminManager.cityOptions(DataManager.currentCity)}</select></div>
                            <div class="col-md-4 col-xl-2"><label class="form-label">${I18n.t("typeLabel")}</label><select id="wTipus" class="form-select">${AdminManager.typeOptions("lakas")}</select></div>
                            <div class="col-md-4 col-xl-2"><label class="form-label">${I18n.t("ugyletLabel")}</label><select id="wUgylet" class="form-select"><option value="elado">${I18n.t("ugyletElado")}</option><option value="kiado">${I18n.t("ugyletKiado")}</option></select></div>
                            <div class="col-md-4 col-xl-2 d-grid"><button class="btn btn-primary" id="wAdd"><i class="fa-solid fa-plus"></i> ${I18n.t("watchAddBtn")}</button></div>
                        </div>
                    </div>
                </div>

                ${lista.length ? `
                    <div class="card mb-4">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-list"></i> ${I18n.t("watchListTitle")} <span class="badge text-bg-light">${lista.length}</span></h5></div>
                    <div class="table-responsive">
                        <table class="table statTable align-middle mb-0">
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
                    </div>
                    <div id="watchStatus" class="mb-4"></div>` : `<div class="emptyState"><i class="fa-solid fa-binoculars"></i><h5>${I18n.t("watchEmpty")}</h5></div>`}

                <div class="card helpCard">
                    <div class="card-body">
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

};
