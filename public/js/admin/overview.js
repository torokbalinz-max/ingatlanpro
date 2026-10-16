// ============================================================
//  Admin – Mai teendők: gyors műveletek, teendők sürgősség szerint, számok
//
//  A teendők csak azt mutatják, ami tényleg vár rád (a munkatársnak csak a
//  saját részeiből): előbb ami ügyfélre vár, aztán a napi rutin, végül a
//  rendrakás. A "Gyors elérés" a
//  menü csoportjai szerint mutatja az összes részt egy rövid leírással –
//  így egy pillantásra látszik, mi hol van. A karbantartó eszközök
//  (automatikus javítás, forrásoldalak ellenőrzése, értékbecslő pontossága)
//  a Beolvasás → Karbantartás oldalon vannak (maintenance.js).
// ============================================================

// A Mai teendők listája (a menü számlálója is ebből): csak ami tényleg vár,
// és csak abból, amit az illető kezelhet (a munkatársnak a saját részei)
//   -> [{ icon, color, text, tab, btn, szint }]
AdminManager.maTeendok = function (c) {
    c = c || {};
    const t = [];
    const lat = tab => AdminManager.TABS[tab] && AdminManager.lathato(AdminManager.TABS[tab]);
    const todo = (ha, szint, icon, color, text, tab, btn) => { if (ha && lat(tab)) t.push({ szint, icon, color, text, tab, btn: btn || I18n.t("ovOpen") }); };

    // Sürgős: ügyfelek várnak
    todo(c.megbizas_uj, 0, "fa-solid fa-key", "orange", I18n.f("ovTodoMandates", { n: c.megbizas_uj }), "megbizasok");
    todo(c.naptar_teendo, 0, "fa-regular fa-calendar-check", "orange", I18n.f("ovTodoViewings", { n: c.naptar_teendo }), "naptar");
    todo(c.bejelentes_uj, 0, "fa-solid fa-flag", "red", I18n.f("ovTodoReports", { n: c.bejelentes_uj }), "reports");
    todo(c.penzugy_rendeles, 0, "fa-solid fa-cart-shopping", "orange", I18n.f("ovTodoOrders", { n: c.penzugy_rendeles }), "rendelesek");
    todo(c.penzugy_lejart, 0, "fa-solid fa-clock", "red", I18n.f("ovTodoFinLate", { n: c.penzugy_lejart }), "szamlak");
    // Napi rutin
    todo(c.review, 1, "fa-solid fa-list-check", "orange", I18n.f("ovTodoReview", { n: c.review }), "review", I18n.t("ovTodoReviewBtn"));
    todo(c.iroda_fuggo, 1, "fa-solid fa-briefcase", "orange", I18n.f("ovTodoAgencies", { n: c.iroda_fuggo }), "irodak");
    todo(c.penzugy_esedekes, 1, "fa-solid fa-arrows-rotate", "orange", I18n.f("ovTodoFinDue", { n: c.penzugy_esedekes }), "elofizetesek");
    todo(c.reklam_lejaro, 1, "fa-solid fa-rectangle-ad", "orange", I18n.f("ovTodoAdsExpiring", { n: c.reklam_lejaro }), "reklam");
    // Ha van időd: rendrakás
    todo(c.unavailable, 2, "fa-solid fa-ban", "red", I18n.f("ovTodoUnavailable", { n: c.unavailable }), "unavailable");
    todo(c.allapot_hianyzo, 2, "fa-solid fa-screwdriver-wrench", "purple", I18n.f("ovTodoAllapot", { n: c.allapot_hianyzo }), "allapot");
    todo(c.kornyek_javaslat, 2, "fa-solid fa-tree-city", "cyan", I18n.f("ovTodoKornyek", { n: c.kornyek_javaslat }), "kornyek");
    todo(c.hely_athelyezett, 2, "fa-solid fa-location-crosshairs", "blue", I18n.f("ovTodoLocations", { n: c.hely_athelyezett }), "helyek");
    todo(c.figyelt === 0, 2, "fa-solid fa-binoculars", "cyan", I18n.t("ovTodoWatch"), "watch");
    return t;
};

AdminManager.renderOverview = function () {

    AdminManager.loading();

    AdminManager.refreshPendingCount().then(() => {

        const c = AdminManager.counts || {};
        const n = v => Utils.num(v || 0);
        const esc = Utils.escape;
        const admin = AuthManager.isAdmin();
        const lat = tab => AdminManager.TABS[tab] && AdminManager.lathato(AdminManager.TABS[tab]);

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

        // Gyors műveletek: amit a legtöbbször csinálsz
        const gyors = [
            { tab: "import", icon: "fa-solid fa-file-import", cim: "ovQuickImport" },
            { href: "#new", icon: "fa-solid fa-circle-plus", cim: "ovQuickNew", ha: admin || AuthManager.resz("hirdetes") },
            { tab: "hirdetesek", icon: "fa-solid fa-pen-to-square", cim: "adminTabListingsManage" },
            { tab: "review", icon: "fa-solid fa-list-check", cim: "adminTabReview" },
            { tab: "megbizasok", icon: "fa-solid fa-key", cim: "adminTabMandates" },
            { tab: "naptar", icon: "fa-regular fa-calendar-days", cim: "nt_cim" }
        ].filter(g => g.tab ? lat(g.tab) : g.ha);

        const teendok = AdminManager.maTeendok(c);
        const szintek = [0, 1, 2].map(sz => teendok.filter(t => t.szint === sz)).map((l, i) => l.length ? `
            <h6 class="ovSzint">${I18n.t("ovSzint" + i)}</h6>
            <div class="todoList">
                ${l.map(t => `
                    <div class="todoItem">
                        <span class="kpiIcon ${t.color}"><i class="${t.icon}"></i></span>
                        <span class="flex-fill">${t.text}</span>
                        <button class="btn btn-sm btn-outline-primary text-nowrap" data-go="${t.tab}">${t.btn} <i class="fa-solid fa-arrow-right"></i></button>
                    </div>`).join("")}
            </div>` : "").join("");

        // A menü egy pillantásra (csoportonként, egy-egy mondattal)
        const csoportok = AdminManager.GROUPS.filter(g => g.key !== "napi").map(g => {
            const pontok = Object.entries(AdminManager.TABS).filter(([, t]) => t.group === g.key && AdminManager.lathato(t));
            if (!pontok.length) return "";
            return `
                <div class="col-md-6 col-xxl-4">
                    <div class="card h-100 ovGroup">
                        <div class="card-header"><h6 class="mb-0"><i class="${g.icon}" aria-hidden="true"></i> ${esc(I18n.t(g.label))}</h6></div>
                        <div class="list-group list-group-flush">
                            ${pontok.map(([k, t]) => `
                                <button type="button" class="list-group-item list-group-item-action ovGroupItem" data-go="${k}">
                                    <i class="${t.icon}" aria-hidden="true"></i>
                                    <span class="flex-fill">
                                        <b>${esc(I18n.t(t.title))}</b>
                                        <small>${esc(I18n.t(t.desc))}</small>
                                    </span>
                                    ${t.count && c[AdminManager.COUNT_KEY[t.count]] ? `<span class="navCount ${t.warn ? "warn" : ""}">${n(c[AdminManager.COUNT_KEY[t.count]])}</span>` : ""}
                                </button>`).join("")}
                        </div>
                    </div>
                </div>`;
        }).join("");

        AdminManager.box().innerHTML = `

            <div id="ovRunning"></div>

            ${gyors.length ? `
            <div class="ovGyors mb-4">
                ${gyors.map(g => g.tab
                    ? `<button type="button" class="ovGyorsGomb" data-go="${g.tab}"><i class="${g.icon}" aria-hidden="true"></i><span>${esc(I18n.t(g.cim))}</span></button>`
                    : `<a class="ovGyorsGomb" href="${g.href}"><i class="${g.icon}" aria-hidden="true"></i><span>${esc(I18n.t(g.cim))}</span></a>`).join("")}
            </div>` : ""}

            <div class="card mb-4">
                <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-clipboard-check"></i> ${I18n.t("ovTodo")}</h5></div>
                <div class="card-body">
                    ${teendok.length ? szintek : `
                        <div class="emptyState py-4">
                            <i class="fa-solid fa-circle-check text-success"></i>
                            <h5>${I18n.t("ovTodoNone")}</h5>
                        </div>`}
                </div>
            </div>

            ${admin ? `
            <div class="row g-3 g-xxl-4 mb-4">
                ${tile("", "fa-solid fa-house", "blue", I18n.t("ovActive"), n(c.aktiv),
                    I18n.f("ovActiveSub", { ok: n(c.ellenorzott), foto: n(c.fotos) }))}
                ${tile("review", "fa-solid fa-list-check", "orange", I18n.t("adminTabReview"), n(c.review),
                    I18n.t("ovReviewSub"))}
                ${tile("reklam", "fa-solid fa-rectangle-ad", "purple", I18n.t("ovAdsRunning"), n(c.reklam_fut),
                    c.reklam_lejaro ? I18n.f("ovAdsExpiringSub", { n: c.reklam_lejaro }) : I18n.t("ovAdsSub"))}
                ${tile("watch", "fa-solid fa-binoculars", "cyan", I18n.t("adminTabWatch"), n(c.figyelt),
                    `${I18n.t("ovLastRun")}: ${c.utolso_futas ? Utils.ago(c.utolso_futas) : I18n.t("ovNever")}`)}
            </div>` : ""}

            ${csoportok.trim() ? `
            ${AdminManager.section("fa-solid fa-sitemap", I18n.t("ovMapTitle"), I18n.t("ovMapNote"))}
            <div class="row g-4">${csoportok}</div>` : ""}`;

        AdminManager.box().querySelectorAll("[data-go]").forEach(b => {
            b.onclick = () => AdminManager.open(b.dataset.go);
        });

        // Ha éppen fut az automatikus javítás (pl. telepítés után), egy sávban jelezzük
        if (admin) fetch("/api/admin/autofix").then(r => r.json()).then(v => {
            if (!(v.allapot === "fut" || v.allapot === "indul")) return;
            const el = document.getElementById("ovRunning");
            if (!el) return;
            el.innerHTML = `
                <div class="alert alert-info d-flex flex-wrap align-items-center gap-2">
                    <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                    <span class="flex-fill">${I18n.f("autofixRunning", { kesz: v.kesz || 0, osszes: v.osszes || 0 })} – ${I18n.t("autofixTitle")}</span>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-go-tools>${I18n.t("ovOpen")} <i class="fa-solid fa-arrow-right"></i></button>
                </div>`;
            el.querySelector("[data-go-tools]").onclick = () => AdminManager.open("tools");
        }).catch(() => { });

    });

};

// A számláló-elemek és az /api/admin/counts mezői
AdminManager.COUNT_KEY = {
    pendingCount: "review", unavailableCount: "unavailable", allapotCount: "allapot_hianyzo",
    irodaCount: "iroda_fuggo", kornyekCount: "kornyek_javaslat", reportCount: "bejelentes_uj",
    helyCount: "hely_athelyezett", reklamCount: "reklam_fut", finLateCount: "penzugy_lejart", finDueCount: "penzugy_esedekes",
    mandatesCount: "megbizas_uj", naptarCount: "naptar_teendo", ordersCount: "penzugy_rendeles"
};
