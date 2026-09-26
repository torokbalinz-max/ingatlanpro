// ============================================================
//  Admin – Áttekintés: számok, teendők, gyors műveletek
// ============================================================

AdminManager.renderOverview = function () {

    AdminManager.loading();

    AdminManager.refreshPendingCount().then(() => {

        const c = AdminManager.counts || {};
        const n = v => Utils.num(v || 0);

        const tile = (tab, icon, color, label, value, sub) => `
            <div class="col-sm-6 col-xxl-3">
                <button type="button" class="kpiCard kpiLink w-100" ${tab ? `data-go="${tab}"` : ""}>
                    <span class="kpiIcon ${color}"><i class="${icon}"></i></span>
                    <div class="text-start">
                        <small>${label}</small>
                        <h3>${value}</h3>
                        ${sub ? `<p class="kpiNote">${sub}</p>` : ""}
                    </div>
                </button>
            </div>`;

        // Teendők: csak ami tényleg vár rád
        const teendok = [];

        if (c.review) teendok.push({
            icon: "fa-solid fa-list-check", color: "orange",
            text: I18n.f("ovTodoReview", { n: c.review }),
            tab: "review", btn: I18n.t("ovTodoReviewBtn")
        });

        if (c.unavailable) teendok.push({
            icon: "fa-solid fa-ban", color: "red",
            text: I18n.f("ovTodoUnavailable", { n: c.unavailable }),
            tab: "unavailable", btn: I18n.t("ovOpen")
        });

        if (!c.figyelt) teendok.push({
            icon: "fa-solid fa-binoculars", color: "cyan",
            text: I18n.t("ovTodoWatch"),
            tab: "watch", btn: I18n.t("ovOpen")
        });

        AdminManager.box().innerHTML = `

            <div class="row g-3 g-xxl-4 mb-4">
                ${tile("", "fa-solid fa-house", "blue", I18n.t("ovActive"), n(c.aktiv),
                    I18n.f("ovActiveSub", { ok: n(c.ellenorzott), foto: n(c.fotos) }))}
                ${tile("review", "fa-solid fa-list-check", "orange", I18n.t("adminTabReview"), n(c.review),
                    I18n.t("ovReviewSub"))}
                ${tile("unavailable", "fa-solid fa-ban", "red", I18n.t("adminTabUnavailable"), n(c.unavailable),
                    I18n.t("ovUnavailableSub"))}
                ${tile("watch", "fa-solid fa-binoculars", "cyan", I18n.t("adminTabWatch"), n(c.figyelt),
                    `${I18n.t("ovLastRun")}: ${c.utolso_futas ? Utils.ago(c.utolso_futas) : I18n.t("ovNever")}`)}
            </div>

            <div class="row g-4">

                <div class="col-xl-7">
                    <div class="card h-100">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-clipboard-check"></i> ${I18n.t("ovTodo")}</h5></div>
                        <div class="card-body">
                            ${teendok.length ? `
                                <div class="todoList">
                                    ${teendok.map(t => `
                                        <div class="todoItem">
                                            <span class="kpiIcon ${t.color}"><i class="${t.icon}"></i></span>
                                            <span class="flex-fill">${t.text}</span>
                                            <button class="btn btn-sm btn-outline-primary text-nowrap" data-go="${t.tab}">${t.btn} <i class="fa-solid fa-arrow-right"></i></button>
                                        </div>`).join("")}
                                </div>` : `
                                <div class="emptyState py-4">
                                    <i class="fa-solid fa-circle-check text-success"></i>
                                    <h5>${I18n.t("ovTodoNone")}</h5>
                                </div>`}
                        </div>
                    </div>
                </div>

                <div class="col-xl-5">
                    <div class="card h-100">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-bolt"></i> ${I18n.t("ovQuick")}</h5></div>
                        <div class="card-body">

                            <div class="quickList">

                                <div class="quickItem">
                                    <div>
                                        <b>${I18n.t("autofixTitle")}</b>
                                        <p class="sectionNote mb-0">${I18n.t("autofixDesc")}</p>
                                    </div>
                                    <button class="btn btn-primary btn-sm text-nowrap" id="ovAutofix"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ${I18n.t("autofixBtn")}</button>
                                </div>

                                <div class="quickItem">
                                    <div>
                                        <b>${I18n.t("recheckTitle")}</b>
                                        <p class="sectionNote mb-0">${I18n.t("ovLastCheck")}: ${c.utolso_ellenorzes ? Utils.ago(c.utolso_ellenorzes) : I18n.t("ovNever")}</p>
                                    </div>
                                    <button class="btn btn-outline-primary btn-sm text-nowrap" id="ovRecheck"><i class="fa-solid fa-play"></i> ${I18n.t("recheckBtn")}</button>
                                </div>

                                <div class="quickItem">
                                    <div>
                                        <b>${I18n.t("adminTabImport")}</b>
                                        <p class="sectionNote mb-0">${I18n.t("ovImportSub")}</p>
                                    </div>
                                    <button class="btn btn-outline-primary btn-sm text-nowrap" data-go="import"><i class="fa-solid fa-file-import"></i> ${I18n.t("ovOpen")}</button>
                                </div>

                                <div class="quickItem">
                                    <div>
                                        <b>${I18n.t("adminTabDups")}</b>
                                        <p class="sectionNote mb-0">${I18n.t("ovDupsSub")}</p>
                                    </div>
                                    <button class="btn btn-outline-primary btn-sm text-nowrap" data-go="dups"><i class="fa-solid fa-clone"></i> ${I18n.t("ovOpen")}</button>
                                </div>

                            </div>

                        </div>
                    </div>
                </div>

            </div>

            <div id="ovAutofixStatus" class="mt-4" aria-live="polite"></div>
            <div id="ovJobStatus" class="mt-4"></div>`;

        AdminManager.box().querySelectorAll("[data-go]").forEach(b => {
            b.onclick = () => AdminManager.open(b.dataset.go);
        });

        document.getElementById("ovAutofix").onclick = () => {
            document.getElementById("ovAutofix").disabled = true;
            fetch("/api/admin/autofix", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mind: true })
            }).then(() => AdminManager.pollAutofix());
        };

        // Ha éppen fut (pl. a telepítés utáni első indításkor), mutatjuk
        fetch("/api/admin/autofix").then(r => r.json()).then(v => {
            if (v.allapot === "fut" || v.allapot === "indul") AdminManager.pollAutofix();
        }).catch(() => { });

        document.getElementById("ovRecheck").onclick = () => {
            fetch("/api/admin/recheck", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ limit: 500 })
            })
            .then(r => r.json())
            .then(v => AdminManager.pollJob(v.jobId, "ovJobStatus"));
        };

    });

};


// Az automatikus javítás állapota (másodpercenként frissül, amíg fut)
AdminManager.pollAutofix = function () {

    const box = document.getElementById("ovAutofixStatus");
    if (!box) return;

    fetch("/api/admin/autofix").then(r => r.json()).then(v => {

        const fut = v.allapot === "fut" || v.allapot === "indul";
        const pct = v.osszes ? Math.round(v.kesz / v.osszes * 100) : 0;

        const mezok = Object.entries(v.mezok || {})
            .filter(([k]) => !["hely_pontossag", "y"].includes(k))
            .map(([k, n]) => `<span class="badge text-bg-light">${I18n.t("field_" + (k === "x" ? "hely" : k))}: ${n}</span>`).join(" ");

        box.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                        <b><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ${I18n.t("autofixTitle")}</b>
                        <span class="small text-body-secondary">${fut ? I18n.f("autofixRunning", { kesz: v.kesz, osszes: v.osszes }) : ""}</span>
                    </div>
                    ${fut ? `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:${pct}%"></div></div>
                             <p class="small text-body-secondary mt-2 mb-0">${I18n.t("autofixSlow")}</p>` : ""}
                    ${v.allapot === "kesz" ? `<p class="mb-2">${I18n.f("autofixDone", { javitott: v.javitott, elotte: v.elotte, utana: v.utana })}</p><div class="d-flex flex-wrap gap-1">${mezok}</div>` : ""}
                    ${v.allapot === "hiba" ? `<div class="alert alert-danger small mb-0">${Utils.escape(v.utolsoHiba || "")}</div>` : ""}
                </div>
            </div>`;

        if (fut) {
            setTimeout(AdminManager.pollAutofix, 1500);
        } else {
            const b = document.getElementById("ovAutofix");
            if (b) b.disabled = false;
            AdminManager.refreshPendingCount();
        }

    });

};
