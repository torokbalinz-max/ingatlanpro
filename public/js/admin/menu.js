// ============================================================
//  Admin menü – használat szerint rendezve
//
//  A menüpontokat a modulok adják hozzá (adminManager.js, mandates.js,
//  orders.js, finance.js...). Ez a fájl a legvégén töltődik, és egy
//  helyen dönti el, mi hova kerül – nem téma, hanem használat szerint:
//
//    Napi munka          ami minden nap kell (teendők, ellenőrzés, megbízások)
//    Hirdetések          gyakran: beolvasás, szerkesztés, állapot, duplikátumok
//    Ügyfelek és bevétel rendelések, számlák, irodák, reklámok
//    Statisztika         látogatottság, pénzügyi áttekintés
//    Rendrakás           ritkán: hely-ellenőrzés, környék, karbantartás  (összecsukva)
//    Beállítások         ritkán: városok, állapotok, díjak, csapat...     (összecsukva)
//
//  A csoportok fejlécére kattintva összecsukhatók / kinyithatók (a böngésző
//  megjegyzi); összecsukva a fejléc mellett látszik, hány dolog vár bennük.
//  Az aktuális rész csoportja mindig nyitva van.
// ============================================================

(() => {

    AdminManager.GROUPS = [
        { key: "napi", label: "adminGroupDaily", icon: "fa-solid fa-sun", fix: true },
        { key: "hirdetes", label: "adminGroupListingsWork", icon: "fa-solid fa-house" },
        { key: "ugyfel", label: "adminGroupClients", icon: "fa-solid fa-coins" },
        { key: "stat", label: "adminGroupStats", icon: "fa-solid fa-chart-column" },
        { key: "rend", label: "adminGroupCleanup", icon: "fa-solid fa-broom", csukott: true },
        { key: "beall", label: "adminGroupSettings", icon: "fa-solid fa-gear", csukott: true }
    ];

    // Csoportonként a menüpontok, sorrendben
    const REND = {
        napi: ["overview", "review", "reports", "megbizasok", "naptar"],
        hirdetes: ["import", "hirdetesek", "allapot", "unavailable", "dups", "watch"],
        ugyfel: ["rendelesek", "szamlak", "elofizetesek", "ugyfelek", "irodak", "reklam", "kiadasok"],
        stat: ["sitestats", "penzugy"],
        rend: ["helyek", "kornyek", "tools"],
        beall: ["places", "allapotok", "csomagok", "penzugyBeall", "megbizasBeall", "webhely", "csapat"]
    };

    const regi = AdminManager.TABS;
    const uj = {};
    for (const [g, kulcsok] of Object.entries(REND)) {
        kulcsok.forEach(k => { if (regi[k]) uj[k] = { ...regi[k], group: g }; });
    }
    // Ami még nincs besorolva (egy később hozzáadott rész): a Beállítások végére
    for (const [k, t] of Object.entries(regi)) {
        if (!uj[k]) uj[k] = { ...t, group: AdminManager.GROUPS.some(g => g.key === t.group) ? t.group : "beall" };
    }

    // Új nevek a használathoz igazítva
    uj.overview.title = "adminTabToday";
    uj.overview.desc = "adminDescToday";
    uj.overview.icon = "fa-solid fa-sun";
    uj.overview.jog = "panel";                 // minden kezelő látja (a saját teendőivel)
    if (uj.hirdetesek) {
        uj.hirdetesek.title = "adminTabListingsManage";
        uj.hirdetesek.desc = "adminDescListingsManage";
    }
    if (uj.overview) uj.overview.count = "todayCount";

    AdminManager.TABS = uj;
    AdminManager.ALIASES.ma = "overview";
    AdminManager.ALIASES.today = "overview";
    AdminManager.ALIASES.hirdeteseim = "hirdetesek";

    // „panel” jog: bárki, aki az admin felületet látja
    const lathato = AdminManager.lathato;
    AdminManager.lathato = function (t) {
        if (t && t.jog === "panel") return AuthManager.panel();
        return lathato.call(this, t);
    };

    // Mindenki a Mai teendőkkel kezd
    AdminManager.elsoTab = function () {
        return AdminManager.lathato(AdminManager.TABS.overview) ? "overview" : (Object.keys(AdminManager.TABS).find(k => AdminManager.lathato(AdminManager.TABS[k])) || "overview");
    };

})();

// ===================== A MENÜ RAJZOLÁSA (összecsukható csoportok) =====================

AdminManager.navAllapot = function () {
    try { return JSON.parse(localStorage.getItem("adminNavCsoport") || "{}") || {}; } catch (e) { return {}; }
};

AdminManager.navAllapotMent = function (a) {
    try { localStorage.setItem("adminNavCsoport", JSON.stringify(a)); } catch (e) { /* nem kritikus */ }
};

AdminManager.renderNav = function () {

    const nav = document.getElementById("adminTabs");
    const sel = document.getElementById("adminNavSelect");
    if (!nav) return;

    const esc = Utils.escape;
    const pontok = g => Object.entries(AdminManager.TABS).filter(([, t]) => t.group === g.key && AdminManager.lathato(t));
    const allapot = AdminManager.navAllapot();
    const aktivCsoport = (AdminManager.TABS[AdminManager.tab] || {}).group;
    const csoportok = AdminManager.GROUPS.filter(g => pontok(g).length);

    nav.innerHTML = csoportok.map((g, gi) => {
        const nyitva = g.fix || g.key === aktivCsoport || (g.key in allapot ? allapot[g.key] : !g.csukott);
        return `
            <div class="adminNavSec ${nyitva ? "" : "csukott"}" data-sec="${g.key}">
                ${g.fix && gi === 0 ? "" : `
                <button type="button" class="adminNavGroup adminNavGroupBtn" data-sec-toggle="${g.key}" aria-expanded="${nyitva}">
                    <span>${esc(I18n.t(g.label))}</span>
                    <span class="adminNavGroupDb" hidden></span>
                    <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                </button>`}
                <div class="adminNavSecItems">
                    ${pontok(g).map(([k, t]) => `
                        <button class="adminNavItem ${k === AdminManager.tab ? "active" : ""}" data-tab="${k}" type="button">
                            <i class="${t.icon}" aria-hidden="true"></i><span>${esc(I18n.t(t.title))}</span>
                            ${t.count ? `<span class="navCount ${t.warn ? "warn" : ""}" id="${t.count}" hidden></span>` : ""}
                        </button>`).join("")}
                </div>
            </div>`;
    }).join("");

    nav.querySelectorAll("[data-tab]").forEach(b => {
        b.onclick = () => AdminManager.open(b.dataset.tab);
    });

    nav.querySelectorAll("[data-sec-toggle]").forEach(b => {
        b.onclick = () => {
            const sec = b.closest(".adminNavSec");
            const nyit = sec.classList.contains("csukott");
            sec.classList.toggle("csukott", !nyit);
            b.setAttribute("aria-expanded", String(nyit));
            const a = AdminManager.navAllapot();
            a[b.dataset.secToggle] = nyit;
            AdminManager.navAllapotMent(a);
        };
    });

    if (sel) {
        sel.innerHTML = csoportok.map(g => `
            <optgroup label="${esc(I18n.t(g.label))}">
                ${pontok(g).map(([k, t]) => `<option value="${k}" ${k === AdminManager.tab ? "selected" : ""} data-label="${esc(I18n.t(t.title))}" ${t.count ? `data-count="${t.count}"` : ""}>${esc(I18n.t(t.title))}</option>`).join("")}
            </optgroup>`).join("");
        sel.onchange = () => AdminManager.open(sel.value);
    }

    if (AdminManager.counts && Object.keys(AdminManager.counts).length) AdminManager.applyCounts(AdminManager.counts);

};

// Részváltáskor: az aktuális rész csoportja legyen nyitva
(() => {
    const open = AdminManager.open;
    AdminManager.open = function (tab, opts) {
        const r = open.call(this, tab, opts);
        const g = (AdminManager.TABS[AdminManager.tab] || {}).group;
        const sec = document.querySelector(`#adminTabs .adminNavSec[data-sec="${g}"]`);
        if (sec && sec.classList.contains("csukott")) {
            sec.classList.remove("csukott");
            const b = sec.querySelector("[data-sec-toggle]");
            if (b) b.setAttribute("aria-expanded", "true");
        }
        return r;
    };

    // Számlálók: a Mai teendők összesen, és az összecsukott csoportok fejlécén
    const apply = AdminManager.applyCounts;
    AdminManager.applyCounts = function (c) {
        apply.call(this, c);
        AdminManager.setCount("todayCount", AdminManager.maTeendoDb(c));
        document.querySelectorAll("#adminTabs .adminNavSec").forEach(sec => {
            const db = sec.querySelector(".adminNavGroupDb");
            if (!db) return;
            const n = [...sec.querySelectorAll(".adminNavSecItems .navCount")].reduce((s, el) => s + (parseInt(el.innerText, 10) || 0), 0);
            db.hidden = !n;
            db.innerText = n > 99 ? "99+" : n;
        });
    };
})();

// A Mai teendők száma: ami tényleg vár (csak a látható részekből)
AdminManager.maTeendoDb = function (c) {
    return AdminManager.maTeendok(c).length;
};
