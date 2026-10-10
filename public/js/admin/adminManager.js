// ============================================================
//  Admin felület – keret
//
//  Bal oldalon a menü (csoportokba rendezve), jobb oldalon a kiválasztott
//  rész. Minden résznek saját címe van (#admin/review, #admin/reklam...),
//  így a böngésző Vissza gombja és a frissítés is ugyanoda visz.
//  Telefonon a menü egy lenyíló választó.
//
//  A csoportok:
//    Irányítópult            áttekintés, látogatottság
//    Hirdetések ellenőrzése  ellenőrzésre vár, állapot, duplikátumok,
//                            nem elérhető, bejelentések
//    Beolvasás               beolvasás linkről, figyelt oldalak, karbantartás
//    Helyek                  városok és kerületek, város és környéke, hely-ellenőrzés
//    Partnerek és reklám     ingatlanirodák, reklámfelületek
//    Beállítások             állapotok, webhely adatai
//
//  Az egyes részek külön fájlban vannak (ugyanebben a mappában):
//    overview.js       áttekintés: teendők, gyors elérés
//    siteStats.js      látogatottság, fiókok, forgalmas órák, adatbázis mérete
//    review.js         ellenőrzésre váró hirdetések (városonként)
//    conditions.js     állapot gyors beállítása (fényképek alapján)
//    duplicates.js     duplikátumok, hibás adatsorok
//    unavailable.js    nem elérhető (eladott / törölt) hirdetések
//    (legalPage.js)    tartalom-bejelentések (EU DSA)
//    import.js         beolvasás linkről + figyelt oldalak
//    maintenance.js    karbantartás: automatikus javítás, forrásoldalak, értékbecslő pontossága
//    places.js         városok, kerületek (+ districtEditor.js: kerülethatárok)
//    kornyek.js        város és környéke: a falvakban lévő hirdetések rendezése
//    locationCheck.js  hely-ellenőrzés: amit az automatika áthelyezett
//    agencies.js       ingatlanirodák jóváhagyása (ANAF-adatokkal)
//    ads.js            reklámfelületek: reklámhelyek, hirdetések, statisztika
//    conditionList.js  az állapotok listája (új állapot, átnevezés, szín, kulcsszavak)
//    siteSettings.js   a webhely / üzemeltető adatai (a jogi oldalakhoz)
// ============================================================

class AdminManager {

    static tab = "overview";
    static pollTimer = null;
    static ignoredDupGroups = new Set();
    static aiElerheto = false;
    static counts = {};
    static takaritas = [];          // részváltáskor lefutó takarítások (pl. térkép eltávolítása)

    // Ellenőrző felület állapota
    static reviewList = [];
    static reviewIdx = 0;
    static reviewFilter = "all";
    static reviewFocusId = null;
    static reviewMap = null;
    static reviewMarker = null;
    static reviewKeyHandler = null;

    // A menü csoportjai, sorrendben
    static GROUPS = [
        { key: "dash", label: "adminGroupDash", icon: "fa-solid fa-gauge-high" },
        { key: "listings", label: "adminGroupListings", icon: "fa-solid fa-list-check" },
        { key: "import", label: "adminGroupImport", icon: "fa-solid fa-file-import" },
        { key: "places", label: "adminGroupPlaces", icon: "fa-solid fa-map-location-dot" },
        { key: "partners", label: "adminGroupPartners", icon: "fa-solid fa-handshake" },
        { key: "settings", label: "adminGroupSettings", icon: "fa-solid fa-gear" }
    ];

    // A menüpontok: csoport, ikon, cím + rövid leírás a tartalom fölött, számláló
    static TABS = {
        overview:    { group: "dash",     icon: "fa-solid fa-gauge-high",          title: "adminTabOverview",    desc: "adminDescOverview",    render: () => AdminManager.renderOverview() },
        sitestats:   { group: "dash",     icon: "fa-solid fa-chart-column",        title: "adminTabSiteStats",   desc: "adminDescSiteStats",   render: () => AdminManager.renderSiteStats() },

        review:      { group: "listings", icon: "fa-solid fa-list-check",          title: "adminTabReview",      desc: "adminDescReview",      render: () => AdminManager.renderReview(),      count: "pendingCount", warn: true },
        allapot:     { group: "listings", icon: "fa-solid fa-screwdriver-wrench",  title: "adminTabAllapot",     desc: "adminDescAllapot",     render: () => AdminManager.renderConditions(),  count: "allapotCount" },
        dups:        { group: "listings", icon: "fa-solid fa-clone",               title: "adminTabDups",        desc: "adminDescDups",        render: () => AdminManager.renderDups() },
        unavailable: { group: "listings", icon: "fa-solid fa-ban",                 title: "adminTabUnavailable", desc: "adminDescUnavailable", render: () => AdminManager.renderUnavailable(), count: "unavailableCount" },
        reports:     { group: "listings", icon: "fa-solid fa-flag",                title: "adminTabReports",     desc: "adminDescReports",     render: () => AdminManager.renderReports(),     count: "reportCount", warn: true },

        import:      { group: "import",   icon: "fa-solid fa-file-import",         title: "adminTabImport",      desc: "adminDescImport",      render: () => AdminManager.renderImport() },
        watch:       { group: "import",   icon: "fa-solid fa-binoculars",          title: "adminTabWatch",       desc: "adminDescWatch",       render: () => AdminManager.renderWatch() },
        tools:       { group: "import",   icon: "fa-solid fa-toolbox",             title: "adminTabTools",       desc: "adminDescTools",       render: () => AdminManager.renderMaintenance() },

        places:      { group: "places",   icon: "fa-solid fa-city",                title: "adminTabPlaces",      desc: "adminDescPlaces",      render: () => AdminManager.renderPlaces() },
        kornyek:     { group: "places",   icon: "fa-solid fa-tree-city",           title: "adminTabKornyek",     desc: "adminDescKornyek",     render: () => AdminManager.renderKornyek(),     count: "kornyekCount", warn: true },
        helyek:      { group: "places",   icon: "fa-solid fa-location-crosshairs", title: "adminTabLocCheck",    desc: "adminDescLocCheck",    render: () => AdminManager.renderLocationCheck(), count: "helyCount" },

        irodak:      { group: "partners", icon: "fa-solid fa-briefcase",           title: "adminTabAgencies",    desc: "adminDescAgencies",    render: () => AdminManager.renderAgencies(),    count: "irodaCount", warn: true },
        reklam:      { group: "partners", icon: "fa-solid fa-rectangle-ad",        title: "adminTabAds",         desc: "adminDescAds",         render: () => AdminManager.renderAds(),         count: "reklamCount" },

        allapotok:   { group: "settings", icon: "fa-solid fa-sliders",             title: "adminTabConditions",  desc: "adminDescConditions",  render: () => AdminManager.renderConditionList() },
        webhely:     { group: "settings", icon: "fa-solid fa-id-card",             title: "adminTabSite",        desc: "adminDescSite",        render: () => AdminManager.renderSiteSettings() }
    };

    // Régi nevek (könyvjelzők, más modulok)
    static ALIASES = { bejelentesek: "reports", karbantartas: "tools", hely: "helyek", reklamok: "reklam", ads: "reklam" };

    static init() {
        AdminManager.renderNav();
        I18n.onChange(() => AdminManager.renderNav());
    }

    // A menü (bal oldalon) és a telefonos választó a TABS / GROUPS alapján
    static renderNav() {

        const nav = document.getElementById("adminTabs");
        const sel = document.getElementById("adminNavSelect");
        if (!nav) return;

        const esc = Utils.escape;
        const pontok = g => Object.entries(AdminManager.TABS).filter(([, t]) => t.group === g.key);

        nav.innerHTML = AdminManager.GROUPS.map((g, gi) => `
            ${gi ? `<div class="adminNavGroup">${esc(I18n.t(g.label))}</div>` : ""}
            ${pontok(g).map(([k, t]) => `
                <button class="adminNavItem ${k === AdminManager.tab ? "active" : ""}" data-tab="${k}" type="button">
                    <i class="${t.icon}" aria-hidden="true"></i><span>${esc(I18n.t(t.title))}</span>
                    ${t.count ? `<span class="navCount ${t.warn ? "warn" : ""}" id="${t.count}" hidden></span>` : ""}
                </button>`).join("")}`).join("");

        nav.querySelectorAll("[data-tab]").forEach(b => {
            b.onclick = () => AdminManager.open(b.dataset.tab);
        });

        if (sel) {
            sel.innerHTML = AdminManager.GROUPS.map(g => `
                <optgroup label="${esc(I18n.t(g.label))}">
                    ${pontok(g).map(([k, t]) => `<option value="${k}" ${k === AdminManager.tab ? "selected" : ""} data-label="${esc(I18n.t(t.title))}" ${t.count ? `data-count="${t.count}"` : ""}>${esc(I18n.t(t.title))}</option>`).join("")}
                </optgroup>`).join("");
            sel.onchange = () => AdminManager.open(sel.value);
        }

        // A számlálók a legutóbbi adatokkal
        if (AdminManager.counts && Object.keys(AdminManager.counts).length) AdminManager.applyCounts(AdminManager.counts);

    }

    // A címsorból (#admin/<rész>) vagy a legutóbbi részre
    static show(param) {

        if (!AuthManager.isAdmin()) {
            document.getElementById("adminPageTitle").innerText = I18n.t("adminTitle");
            document.getElementById("adminPageDesc").innerText = "";
            const bc = document.getElementById("adminCrumb");
            if (bc) bc.innerHTML = "";
            AdminManager.box().innerHTML = `<div class="alert alert-warning">${I18n.t("alertAdminOnly")}</div>`;
            return;
        }

        if (!document.querySelector("#adminTabs [data-tab]")) AdminManager.renderNav();

        AdminManager.refreshPendingCount();

        const tab = param ? (AdminManager.ALIASES[param] || param) : AdminManager.tab;
        AdminManager.open(AdminManager.TABS[tab] ? tab : "overview", { fromHash: !!param });

    }

    static open(tab, opts = {}) {

        tab = AdminManager.ALIASES[tab] || tab;
        if (!AdminManager.TABS[tab]) tab = "overview";

        AdminManager.tab = tab;

        // A címsor kövesse (a Vissza gomb az előző részre visz)
        const hash = "#admin/" + tab;
        if (!opts.fromHash && PageManager.current === "admin" && location.hash !== hash) {
            // A puszta "#admin" helyére (ne legyen egy üres lépés a Vissza gombnál)
            if (/^#admin\/?$/.test(location.hash)) history.replaceState(null, "", hash);
            else history.pushState(null, "", hash);
        }

        document.querySelectorAll("#adminTabs [data-tab]").forEach(b => {
            b.classList.toggle("active", b.dataset.tab === tab);
        });

        const sel = document.getElementById("adminNavSelect");
        if (sel) sel.value = tab;

        const info = AdminManager.TABS[tab];
        const csoport = AdminManager.GROUPS.find(g => g.key === info.group);

        document.getElementById("adminPageTitle").innerText = I18n.t(info.title);
        document.getElementById("adminPageDesc").innerText = I18n.t(info.desc);

        const bc = document.getElementById("adminCrumb");
        if (bc) bc.innerHTML = csoport
            ? `<i class="${csoport.icon}" aria-hidden="true"></i> <span>${Utils.escape(I18n.t(csoport.label))}</span>`
            : "";

        if (AdminManager.pollTimer) {
            clearInterval(AdminManager.pollTimer);
            AdminManager.pollTimer = null;
        }

        AdminManager.unbindKeys();

        // Az előző rész takarítása (pl. a térképei)
        AdminManager.takaritas.splice(0).forEach(fn => { try { fn(); } catch (e) { /* nem kritikus */ } });

        info.render();

        // Kis képernyőn a kiválasztott menüpont legyen látható
        const aktiv = document.querySelector("#adminTabs .active");
        if (aktiv && aktiv.scrollIntoView && window.innerWidth < 992) {
            aktiv.scrollIntoView({ block: "nearest", inline: "center" });
        }

        if (!opts.fromHash) window.scrollTo({ top: 0 });

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
                AdminManager.applyCounts(c);
                return c;
            })
            .catch(() => { });

    }

    static applyCounts(c) {
        AdminManager.setCount("pendingCount", c.review);
        AdminManager.setCount("unavailableCount", c.unavailable);
        AdminManager.setCount("allapotCount", c.allapot_hianyzo);
        AdminManager.setCount("irodaCount", c.iroda_fuggo);
        AdminManager.setCount("kornyekCount", c.kornyek_javaslat);
        AdminManager.setCount("reportCount", c.bejelentes_uj);
        AdminManager.setCount("helyCount", c.hely_athelyezett);
        AdminManager.setCount("reklamCount", c.reklam_fut);
        AdminManager.setCount("navAdminCount", (c.review || 0) + (c.iroda_fuggo || 0) + (c.bejelentes_uj || 0));
    }

    static setCount(id, n) {
        const el = document.getElementById(id);
        if (el) {
            el.innerText = n ? String(n) : "";
            el.hidden = !n;
        }
        // A telefonos választóban a menüpont mellett zárójelben
        document.querySelectorAll(`#adminNavSelect option[data-count="${id}"]`).forEach(o => {
            o.textContent = o.dataset.label + (n ? ` (${n})` : "");
        });
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

    // Városválasztó "fülek" darabszámmal (ellenőrzés, nem elérhető, hely-ellenőrzés)
    //  lista: a hirdetések; aktualis: a kiválasztott város ("" = mind)
    static cityTabs(lista, aktualis, attr = "data-city") {
        const db = new Map();
        lista.forEach(i => db.set(i.varos || "", (db.get(i.varos || "") || 0) + 1));
        const varosok = [...db.keys()].sort((a, b) =>
            (b === DataManager.currentCity) - (a === DataManager.currentCity) ||
            CityManager.displayName(a).localeCompare(CityManager.displayName(b), "hu"));
        if (varosok.length < 2 && !aktualis) return "";
        return `
            <div class="cityTabs mb-3" role="tablist" aria-label="${Utils.escape(I18n.t("detailVaros"))}">
                <button type="button" role="tab" class="cityTab ${!aktualis ? "active" : ""}" ${attr}="" aria-selected="${!aktualis}">
                    <i class="fa-solid fa-earth-europe" aria-hidden="true"></i> ${I18n.t("allCities")} <span class="typeTabCount">${lista.length}</span>
                </button>
                ${varosok.map(v => `
                    <button type="button" role="tab" class="cityTab ${aktualis === v ? "active" : ""}" ${attr}="${Utils.escape(v)}" aria-selected="${aktualis === v}">
                        <i class="fa-solid ${CityManager.isKornyek && CityManager.isKornyek(v) ? "fa-tree-city" : "fa-city"}" aria-hidden="true"></i>
                        ${Utils.escape(v ? CityManager.displayName(v) : I18n.t("lcNoCity"))} <span class="typeTabCount">${db.get(v)}</span>
                    </button>`).join("")}
            </div>`;
    }

}

// Tartalom-bejelentések (a jogi oldal admin listája, itt az admin felületen)
AdminManager.renderReports = function () {
    if (typeof LegalPage === "undefined") {
        AdminManager.box().innerHTML = `<div class="alert alert-warning">${I18n.t("alertLoadError")}</div>`;
        return;
    }
    LegalPage.adminLista(AdminManager.box());
};
