// ============================================================
//  Admin – Beolvasás linkről, figyelt oldalak, futó feladatok állapota
// ============================================================


AdminManager.renderImport = function () {

    // Lépések: 1) város  2) ingatlantípus + eladó/kiadó  3) linkek
    const allapot = AdminManager.importValasztas = AdminManager.importValasztas || {
        varos: DataManager.currentCity,
        tipus: FilterManager.tipus || "lakas",
        ugylet: FilterManager.ugylet || "elado"
    };

    AdminManager.box().innerHTML = `
        <div class="row g-4">
            <div class="col-xl-6">
                <div class="card">
                    <div class="card-body stepForm">

                        <div class="stepBlock">
                            <div class="stepHead"><span class="stepNo">1</span> ${I18n.t("importStepCity")}</div>
                            <select id="impVaros" class="form-select" aria-label="${I18n.t("detailVaros")}">${AdminManager.cityOptions(allapot.varos)}</select>
                        </div>

                        <div class="stepBlock">
                            <div class="stepHead"><span class="stepNo">2</span> ${I18n.t("importStepType")}</div>
                            <div class="btn-group w-100 mb-2 ugyletSwitch" role="group">
                                <input type="radio" class="btn-check" name="impUgylet" id="impElado" value="elado" ${allapot.ugylet !== "kiado" ? "checked" : ""}>
                                <label class="btn btn-outline-primary btn-sm" for="impElado">${I18n.t("ugyletElado")}</label>
                                <input type="radio" class="btn-check" name="impUgylet" id="impKiado" value="kiado" ${allapot.ugylet === "kiado" ? "checked" : ""}>
                                <label class="btn btn-outline-primary btn-sm" for="impKiado">${I18n.t("ugyletKiado")}</label>
                            </div>
                            <div class="typeGrid" id="impTypeGrid"></div>
                        </div>

                        <div class="stepBlock">
                            <div class="stepHead"><span class="stepNo">3</span> ${I18n.t("importStepLinks")} <span class="stepTarget" id="impTarget"></span></div>
                            <label class="form-label visually-hidden" for="impUrls">${I18n.t("importUrls")}</label>
                            <textarea id="impUrls" class="form-control mb-2" rows="7" spellcheck="false" placeholder="https://www.imoradar24.ro/apartamente-de-vanzare/judetul-covasna/sfantu-gheorghe&#10;https://www.imoradar24.ro/oferta/..."></textarea>
                            <p class="small text-body-secondary mb-3">${I18n.t("importUrlsHelp")}</p>
                            <div class="d-flex flex-wrap gap-2">
                                <button class="btn btn-primary" id="impStart"><i class="fa-solid fa-play" aria-hidden="true"></i> ${I18n.t("importStart")}</button>
                                <button class="btn btn-outline-secondary" id="impSaveWatch"><i class="fa-solid fa-binoculars" aria-hidden="true"></i> ${I18n.t("importSaveWatch")}</button>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
            <div class="col-xl-6">
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

    const cel = () => {
        document.getElementById("impTarget").innerText =
            `${CityManager.displayName(allapot.varos)} · ${Types.label(allapot.tipus)} · ${Types.ugyletLabel(allapot.ugylet)}`;
    };

    Types.renderGrid("impTypeGrid", allapot.tipus, t => { allapot.tipus = t; cel(); });

    document.getElementById("impVaros").onchange = e => { allapot.varos = e.target.value; cel(); };
    document.querySelectorAll('input[name="impUgylet"]').forEach(r => r.onchange = () => { allapot.ugylet = r.value; cel(); });

    cel();

    document.getElementById("impSaveWatch").onclick = () => {
        const urls = document.getElementById("impUrls").value.split(/\s+/).filter(u => /^https?:\/\//i.test(u));
        if (!urls.length) { alert(I18n.t("importNoUrls")); return; }
        Promise.all(urls.map(url => fetch("/api/admin/watch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, varos: allapot.varos, tipus: allapot.tipus, ugylet: allapot.ugylet })
        }))).then(() => AdminManager.open("watch"));
    };

    document.getElementById("impStart").onclick = () => {

        const body = {
            urls: document.getElementById("impUrls").value,
            varos: allapot.varos,
            tipus: allapot.tipus,
            ugylet: allapot.ugylet
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
            const esc = Utils.escape;

            // Város -> típus + ügylet szerinti csoportok
            const varosok = [...new Set([DataManager.currentCity, ...lista.map(w => w.varos)])]
                .filter(Boolean)
                .sort((a, b) => (b === DataManager.currentCity) - (a === DataManager.currentCity) ||
                    CityManager.displayName(a).localeCompare(CityManager.displayName(b), "hu"));

            const sor = w => `
                <div class="watchRow">
                    <div class="watchInfo">
                        <a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(w.nev || w.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70))}</a>
                        <small>${w.utolso_futas ? `${I18n.t("watchLastRun")}: ${Utils.ago(w.utolso_futas)} · ${esc(w.utolso_eredmeny || "")}` : I18n.t("ovNever")}</small>
                    </div>
                    <div class="text-nowrap">
                        <button class="btn btn-sm btn-outline-primary" data-run="${w.id}" aria-label="${I18n.t("watchRun")}"><i class="fa-solid fa-rotate" aria-hidden="true"></i> <span class="d-none d-md-inline">${I18n.t("watchRun")}</span></button>
                        <button class="btn btn-sm btn-outline-danger" data-del="${w.id}" aria-label="${I18n.t("detailDelete")}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                    </div>
                </div>`;

            const varosBlokk = varos => {

                const sajat = lista.filter(w => w.varos === varos);

                const csoportok = [];
                Types.LIST.forEach(t => ["elado", "kiado"].forEach(u => {
                    const elemek = sajat.filter(w => (w.tipus || "lakas") === t.key && (w.ugylet || "elado") === u);
                    if (elemek.length) csoportok.push({ t, u, elemek });
                }));

                return `
                    <div class="card mb-4">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0"><i class="fa-solid fa-city" aria-hidden="true"></i> ${esc(CityManager.displayName(varos))} <span class="badge text-bg-light">${sajat.length}</span></h5>
                        </div>
                        <div class="card-body">
                            ${csoportok.length ? csoportok.map(c => `
                                <div class="watchGroup">
                                    <div class="watchGroupHead"><i class="${c.t.icon}" aria-hidden="true"></i> ${I18n.t(c.t.label)} · ${Types.ugyletLabel(c.u)} <span class="badge text-bg-light">${c.elemek.length}</span></div>
                                    ${c.elemek.map(sor).join("")}
                                </div>`).join("") : `<p class="text-body-secondary small mb-0">${I18n.t("watchEmpty")}</p>`}
                        </div>
                    </div>`;

            };

            AdminManager.box().innerHTML = `
                <div class="card mb-4">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("watchAddTitle")}</h5></div>
                    <div class="card-body">
                        <div class="row g-3 align-items-end">
                            <div class="col-md-4 col-xl-3"><label class="form-label" for="wVaros"><span class="stepNo sm">1</span> ${I18n.t("detailVaros")}</label><select id="wVaros" class="form-select">${AdminManager.cityOptions(DataManager.currentCity)}</select></div>
                            <div class="col-md-4 col-xl-3"><label class="form-label" for="wTipus"><span class="stepNo sm">2</span> ${I18n.t("typeLabel")}</label><select id="wTipus" class="form-select">${AdminManager.typeOptions("lakas")}</select></div>
                            <div class="col-md-4 col-xl-2"><label class="form-label" for="wUgylet">${I18n.t("ugyletLabel")}</label><select id="wUgylet" class="form-select"><option value="elado">${I18n.t("ugyletElado")}</option><option value="kiado">${I18n.t("ugyletKiado")}</option></select></div>
                            <div class="col-xl-4"><label class="form-label" for="wNev">${I18n.t("watchName")}</label><input id="wNev" class="form-control" autocomplete="off"></div>
                            <div class="col-md-9 col-xl-10"><label class="form-label" for="wUrl"><span class="stepNo sm">3</span> ${I18n.t("watchUrl")}</label><input id="wUrl" class="form-control" type="url" spellcheck="false" placeholder="https://www.imoradar24.ro/apartamente-de-vanzare/judetul-covasna/sfantu-gheorghe"></div>
                            <div class="col-md-3 col-xl-2 d-grid"><button class="btn btn-primary" id="wAdd"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("watchAddBtn")}</button></div>
                        </div>
                    </div>
                </div>

                ${varosok.map(varosBlokk).join("")}
                <div id="watchStatus" class="mb-4"></div>

                <div class="card helpCard">
                    <div class="card-body">
                        <h6><i class="fa-solid fa-clock"></i> ${I18n.t("watchAutoTitle")}</h6>
                        <ol class="howList mb-0">
                            <li>${I18n.t("watchAuto1")}</li>
                            <li>${I18n.t("watchAuto2")}</li>
                            <li>${I18n.t("watchAuto3")} <code>${esc(cronUrl)}</code></li>
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
                        .then(v => {
                            document.getElementById("watchStatus").scrollIntoView({ behavior: "smooth", block: "center" });
                            AdminManager.pollJob(v.jobId, "watchStatus");
                        });
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
