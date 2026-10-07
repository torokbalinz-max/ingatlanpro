// ============================================================
//  Admin felület – keret
//
//  Bal oldalon a menü, jobb oldalon a kiválasztott rész.
//  Az egyes részek külön fájlban vannak (ugyanebben a mappában):
//    overview.js     áttekintés, teendők, gyors műveletek
//    review.js       ellenőrzésre váró hirdetések
//    unavailable.js  nem elérhető (eladott / törölt) hirdetések
//    conditions.js   állapot gyors beállítása (fényképek alapján)
//    import.js       beolvasás linkről + figyelt oldalak
//    duplicates.js   duplikátumok, hibás adatsorok
//    places.js       városok, kerületek
//    siteStats.js    látogatottság, fiókok, forgalmas órák, adatbázis mérete
//    conditionList.js az állapotok listája (új állapot, átnevezés, szín, kulcsszavak)
//    siteSettings.js  a webhely / üzemeltető adatai (a jogi oldalakhoz)
//    agencies.js      ingatlanirodák jóváhagyása (ANAF-adatokkal)
// ============================================================

class AdminManager {

    static tab = "overview";
    static pollTimer = null;
    static ignoredDupGroups = new Set();
    static aiElerheto = false;
    static counts = {};

    // Ellenőrző felület állapota
    static reviewList = [];
    static reviewIdx = 0;
    static reviewFilter = "all";
    static reviewFocusId = null;
    static reviewMap = null;
    static reviewMarker = null;
    static reviewKeyHandler = null;

    // A menüpontok: cím + rövid leírás a tartalom fölött
    static TABS = {
        overview:    { title: "adminTabOverview",    desc: "adminDescOverview",    render: () => AdminManager.renderOverview() },
        sitestats:   { title: "adminTabSiteStats",   desc: "adminDescSiteStats",   render: () => AdminManager.renderSiteStats() },
        review:      { title: "adminTabReview",      desc: "adminDescReview",      render: () => AdminManager.renderReview() },
        unavailable: { title: "adminTabUnavailable", desc: "adminDescUnavailable", render: () => AdminManager.renderUnavailable() },
        allapot:     { title: "adminTabAllapot",     desc: "adminDescAllapot",     render: () => AdminManager.renderConditions() },
        dups:        { title: "adminTabDups",        desc: "adminDescDups",        render: () => AdminManager.renderDups() },
        import:      { title: "adminTabImport",      desc: "adminDescImport",      render: () => AdminManager.renderImport() },
        watch:       { title: "adminTabWatch",       desc: "adminDescWatch",       render: () => AdminManager.renderWatch() },
        irodak:      { title: "adminTabAgencies",    desc: "adminDescAgencies",    render: () => AdminManager.renderAgencies() },
        places:      { title: "adminTabPlaces",      desc: "adminDescPlaces",      render: () => AdminManager.renderPlaces() },
        allapotok:   { title: "adminTabConditions",  desc: "adminDescConditions",  render: () => AdminManager.renderConditionList() },
        webhely:     { title: "adminTabSite",        desc: "adminDescSite",        render: () => AdminManager.renderSiteSettings() }
    };

    static init() {

        document.querySelectorAll("#adminTabs [data-tab]").forEach(b => {
            b.onclick = () => AdminManager.open(b.dataset.tab);
        });

    }

    static show() {

        if (!AuthManager.isAdmin()) {
            document.getElementById("adminPageTitle").innerText = I18n.t("adminTitle");
            document.getElementById("adminPageDesc").innerText = "";
            AdminManager.box().innerHTML = `<div class="alert alert-warning">${I18n.t("alertAdminOnly")}</div>`;
            return;
        }

        AdminManager.refreshPendingCount();
        AdminManager.open(AdminManager.tab);

    }

    static open(tab) {

        if (!AdminManager.TABS[tab]) tab = "overview";

        AdminManager.tab = tab;

        document.querySelectorAll("#adminTabs [data-tab]").forEach(b => {
            b.classList.toggle("active", b.dataset.tab === tab);
        });

        const info = AdminManager.TABS[tab];

        document.getElementById("adminPageTitle").innerText = I18n.t(info.title);
        document.getElementById("adminPageDesc").innerText = I18n.t(info.desc);

        if (AdminManager.pollTimer) {
            clearInterval(AdminManager.pollTimer);
            AdminManager.pollTimer = null;
        }

        AdminManager.unbindKeys();

        info.render();

        // Kis képernyőn a kiválasztott menüpont legyen látható
        const aktiv = document.querySelector("#adminTabs .active");
        if (aktiv && aktiv.scrollIntoView && window.innerWidth < 992) {
            aktiv.scrollIntoView({ block: "nearest", inline: "center" });
        }

    }

    static box() {
        return document.getElementById("adminContent");
    }

    static loading() {
        AdminManager.box().innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;
    }

    // A menü melletti számlálók (és a fejléc admin gombja)
    static refreshPendingCount() {

        if (!AuthManager.isAdmin()) return Promise.resolve();

        return fetch("/api/admin/counts")
            .then(r => r.json())
            .then(c => {
                AdminManager.counts = c;
                AdminManager.aiElerheto = !!c.ai;
                AdminManager.setCount("pendingCount", c.review);
                AdminManager.setCount("unavailableCount", c.unavailable);
                AdminManager.setCount("allapotCount", c.allapot_hianyzo);
                AdminManager.setCount("irodaCount", c.iroda_fuggo);
                AdminManager.setCount("navAdminCount", (c.review || 0) + (c.iroda_fuggo || 0));
                return c;
            })
            .catch(() => { });

    }

    static setCount(id, n) {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerText = n ? String(n) : "";
        el.hidden = !n;
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

    static unbindKeys() {
        if (AdminManager.reviewKeyHandler) {
            document.removeEventListener("keydown", AdminManager.reviewKeyHandler);
            AdminManager.reviewKeyHandler = null;
        }
    }

    // Egységes részcím a tartalmon belül
    static section(icon, title, note, extra = "") {
        return `
            <div class="adminSectionHead">
                <div>
                    <h5><i class="${icon}"></i> ${title}</h5>
                    ${note ? `<p class="sectionNote mb-0">${note}</p>` : ""}
                </div>
                ${extra}
            </div>`;
    }

}
