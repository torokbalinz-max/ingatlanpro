// ============================================================
//  Admin – a felület váza: modulok felül, a teljes képernyő a munkáé
//
//  A bal oldali hosszú menü helyett:
//    1. sor  (ragadós)  a MODULOK: Ma · Hirdetések · Értékesítés · Pénzügy ·
//                       Partnerek · Rendszer – mindegyiken egy szám, ha sürgős
//                       dolog vár benne; jobbra az „Ugrás…” kereső (Ctrl+K)
//    2. sor             a modul oldalai (fülek), a számlálóikkal
//    alatta             a tartalom a képernyő teljes szélességében
//
//  Minden funkció egyetlen helyen van (nincs ugyanaz két menüben):
//    Ma          a teendők – egy sor modulonként, ami vár
//    Hirdetések  ellenőrzés: Ellenőrzésre vár · Hely-ellenőrzés · Állapot ·
//                Beolvasás · Bejelentések
//                rendrakás: Duplikátumok · Nem elérhető · Figyelt oldalak · Források
//                FELÜL VÁROSVÁLASZTÓ: a Hirdetések (és a Ma) modul egy városra szűkíthető –
//                a listák, számlálók csak azt a várost (és a „<város> és környéke”
//                várost) mutatják. A városra kapott munkatárs csak a saját városait
//                választhatja. (A szerver az X-Admin-Varos fejlécből szűr – csapat.reszSql.)
//    Értékesítés Megbízások · Naptár · Fotók (a csapat helyszíni munkája) · Beállítások
//    Pénzügy     Áttekintés · Rendelések · Díjbekérők · e-Factura · Előfizetések · Ügyfelek ·
//                Kiadások | Csomagok · Számlázás
//    Irattár     Számlák és pénzügyi iratok · Szerződések
//    Partnerek   Ingatlanirodák · Reklámfelületek
//    Rendszer    Városok · Környék · Állapotok | Webhely ·
//                Csapat · Karbantartás · Látogatottság
//
//  A menüpontokat a modulok adják hozzá (adminManager.js, mandates.js,
//  orders.js...); ez a fájl a legvégén töltődik, és itt dől el, mi hova kerül.
// ============================================================

(() => {

    // Két rész (2026-11):
    //   VÁROS  – felül a városválasztó, és ami egy városhoz tartozik: a hirdetések kezelése,
    //            a források (beolvasás), a karbantartás, a reklámfelületek, az értékesítés
    //   ÁLTALÁNOS – ami az egész oldalé: teendők, pénzügy, irattár, ingatlanirodák, beállítások
    //            (állapotok, városok és kerületek, webhely, csapat, látogatottság)
    AdminManager.GROUPS = [
        { key: "hird", label: "adminModListings", icon: "fa-solid fa-house", szekcio: "varos" },
        { key: "forras", label: "fsTab", icon: "fa-solid fa-diagram-project", szekcio: "varos" },
        { key: "karb", label: "adminTabTools", icon: "fa-solid fa-toolbox", szekcio: "varos" },
        { key: "reklam", label: "adminModAds", icon: "fa-solid fa-rectangle-ad", szekcio: "varos" },
        { key: "ert", label: "adminModSales", icon: "fa-solid fa-key", szekcio: "varos" },
        { key: "ma", label: "adminModToday", icon: "fa-solid fa-sun", szekcio: "altalanos" },
        { key: "crm", label: "crmTitle", icon: "fa-solid fa-address-book", szekcio: "altalanos" },
        { key: "penz", label: "adminModFinance", icon: "fa-solid fa-coins", szekcio: "altalanos" },
        { key: "irat", label: "adminModArchive", icon: "fa-solid fa-box-archive", szekcio: "altalanos" },
        { key: "partner", label: "adminModAgencies", icon: "fa-solid fa-briefcase", szekcio: "altalanos" },
        { key: "beall", label: "adminModSettings", icon: "fa-solid fa-gear", szekcio: "altalanos" }
    ];

    // Modulonként az oldalak sorrendben ("|" = elválasztó a fülek között).
    // Minden oldal pontosan egy helyen van. A régi „Beolvasás” és „Figyelt oldalak” a
    // Források oldalba olvadt (a régi címek oda visznek).
    AdminManager.REND = {
        hird: ["review", "helyek", "allapot", "reports", "|", "dups", "unavailable"],
        forras: ["forrasok"],
        karb: ["tools"],
        reklam: ["reklam"],
        ert: ["megbizasok", "naptar", "hirdetesek"],
        ma: ["overview"],
        crm: ["crm"],
        // gyakran: áttekintés, számlák, vásárlások, kiadások, e-Factura | ritkábban | beállítás jellegű a végén
        penz: ["penzugy", "szamlak", "rendelesek", "kiadasok", "efactura", "|", "ugyfelek", "elofizetesek", "kiemelesek", "|", "csomagok", "penzugyBeall"],
        irat: ["irattarSzamla", "irattarSzerzodes"],
        partner: ["irodak"],
        beall: ["allapotok", "places", "kornyek", "megbizasBeall", "|", "webhely", "csapat", "sitestats"]
    };

    // Az oldal saját CRM-je (az admin értékesítése) – az irodákétól külön (js/crm/crm.js)
    AdminManager.TABS.crm = { group: "crm", jog: "admin", icon: "fa-solid fa-address-book", title: "crmTitle", desc: "crmAdminDesc", render: () => Crm.mount(AdminManager.box(), { ter: 0 }) };

    // Megszűnt külön oldalak (a funkciójuk a Források oldalon van)
    const MEGSZUNT = { import: "forrasok", watch: "forrasok" };

    const regi = AdminManager.TABS;
    const uj = {};
    for (const [g, kulcsok] of Object.entries(AdminManager.REND)) {
        kulcsok.forEach(k => { if (k !== "|" && regi[k]) uj[k] = { ...regi[k], group: g }; });
    }
    // Ami még nincs besorolva (egy később hozzáadott rész): a Beállítások végére – így semmi nem vész el
    for (const [k, t] of Object.entries(regi)) {
        if (!uj[k] && !MEGSZUNT[k]) { uj[k] = { ...t, group: "beall" }; AdminManager.REND.beall.push(k); }
    }

    // A használathoz igazított nevek
    Object.assign(uj.overview, { title: "adminTabToday", desc: "adminDescToday", icon: "fa-solid fa-sun", jog: "panel", count: "todayCount" });
    // A fotósok / régiós kollégák munkahelye: a hirdetések fotói (saját és átvett képek)
    if (uj.hirdetesek) Object.assign(uj.hirdetesek, { title: "adminTabPhotos", desc: "adminDescPhotos", icon: "fa-solid fa-camera" });
    if (uj.helyek) Object.assign(uj.helyek, { title: "adminTabLocCheck", desc: "adminDescLocCheck2", warn: false });
    if (uj.megbizasBeall) uj.megbizasBeall.title = "adminTabSalesSettings";
    if (uj.penzugyBeall) Object.assign(uj.penzugyBeall, { title: "adminTabFinSettings2", desc: "adminDescFinSettings2", icon: "fa-solid fa-gear", render: () => AdminManager.renderFinBeall() });
    // A karbantartás városra is adható (a város beolvasási jogával)
    if (uj.tools) Object.assign(uj.tools, { desc: "mtDescCity" });

    AdminManager.TABS = uj;
    Object.assign(AdminManager.ALIASES, { ma: "overview", today: "overview", hirdeteseim: "hirdetesek", import: "forrasok", watch: "forrasok", beolvasas: "forrasok", figyelt: "forrasok" });

    // „panel” jog: bárki, aki az admin felületet látja
    const lathato = AdminManager.lathato;
    AdminManager.lathato = function (t) {
        // kikapcsolt értékesítés: az „Értékesítés” modul rejtve (Webhely adatai → Funkciók)
        if (t && t.group === "ert" && !Utils.ertekesites()) return false;
        if (t && t.jog === "panel") return AuthManager.panel();
        return lathato.call(this, t);
    };

    // Mindenki a Ma oldallal kezd
    AdminManager.elsoTab = function () {
        return AdminManager.lathato(AdminManager.TABS.overview) ? "overview"
            : (Object.keys(AdminManager.TABS).find(k => AdminManager.lathato(AdminManager.TABS[k])) || "overview");
    };

})();

// A modul sürgős számlálója: a „warn” jelölésű oldalak számainak összege
AdminManager.modulDb = function (g) {
    const c = AdminManager.counts || {};
    if (g.key === "ma") return 0;
    return Object.entries(AdminManager.TABS)
        .filter(([, t]) => t.group === g.key && t.warn && t.count && AdminManager.lathato(t))
        .reduce((s, [, t]) => s + (Number(c[AdminManager.COUNT_KEY[t.count]]) || 0), 0);
};

// ===================== VÁROSVÁLASZTÓ (Hirdetések, Ma) =====================

// A munkatárs városai a hirdetések kezeléséhez – null = minden város (admin / egész oldal)
AdminManager.sajatVarosok = function () {
    if (AuthManager.isAdmin()) return null;
    const c = AuthManager.csapat || {};
    const j = c.jogok || {};
    if (j.ellenorzes_mind || j.beolvasas_mind) return null;
    const v = (c.hozzaferesek || []).filter(h => h.hatokor === "varos" && h.varos && (h.jogok || []).some(x => ["ellenorzes", "beolvasas", "hirdetes", "kepek"].includes(x))).map(h => h.varos);
    return [...new Set(v)];
};

AdminManager.munkaVaros = (() => { try { return localStorage.getItem("ip_adm_varos") || ""; } catch (e) { return ""; } })();

// A Város részben vagyunk-e (Hirdetések, Források, Karbantartás, Reklám, Értékesítés) – csak ott szűr
// a városválasztó; az Általános rész (teendők, pénzügy…) mindig az egész oldalt mutatja
AdminManager.varosSzekcio = function () {
    const t = AdminManager.TABS && AdminManager.TABS[AdminManager.tab];
    const g = t && (AdminManager.GROUPS || []).find(x => x.key === t.group);
    return !!(g && g.szekcio === "varos");
};

AdminManager.munkaVarosBeallit = function (v) {
    AdminManager.munkaVaros = v || "";
    try { localStorage.setItem("ip_adm_varos", AdminManager.munkaVaros); } catch (e) { /* nem baj */ }
};

// Csak érvényes (és a munkatársnak kiadott) város maradhat kiválasztva
AdminManager.munkaVarosEllenoriz = function () {
    // amíg a városok listája nincs betöltve, nem döntünk (különben elveszne a választás)
    if (!(CityManager.varosok || []).length) return;
    const sajat = AdminManager.sajatVarosok();
    const van = n => (CityManager.varosok || []).some(v => v.nev === n);
    if (AdminManager.munkaVaros && (!van(AdminManager.munkaVaros) || (sajat && !sajat.includes(AdminManager.munkaVaros)))) AdminManager.munkaVarosBeallit("");
    // egy városra kapott munkatárs: az az egy város
    if (!AdminManager.munkaVaros && sajat && sajat.length === 1) AdminManager.munkaVarosBeallit(sajat[0]);
    // első alkalommal: az oldal mostani városa legyen kiválasztva (utána a választás megmarad)
    let volt = null;
    try { volt = localStorage.getItem("ip_adm_varos"); } catch (e) { volt = ""; }
    if (volt === null && !AdminManager.munkaVaros && typeof DataManager !== "undefined" && DataManager.currentCity && (!sajat || sajat.includes(DataManager.currentCity))) {
        AdminManager.munkaVarosBeallit(DataManager.currentCity);
    }
};

AdminManager.varosValaszto = function () {
    const esc = Utils.escape;
    const sajat = AdminManager.sajatVarosok();
    const lista = (CityManager.varosok || []).filter(v => !v.anyavaros && (!sajat || sajat.includes(v.nev))).map(v => v.nev)
        .sort((a, b) => CityManager.displayName(a).localeCompare(CityManager.displayName(b), "hu"));
    if (!lista.length) return "";
    return `
        <label class="admVaros ${AdminManager.munkaVaros ? "aktiv" : ""}" title="${esc(I18n.t("admCityHelp"))}">
            <i class="fa-solid fa-city" aria-hidden="true"></i>
            <span class="visually-hidden">${esc(I18n.t("admCityLabel"))}</span>
            <select id="admVaros" class="form-select form-select-sm" aria-label="${esc(I18n.t("admCityLabel"))}">
                ${!sajat || sajat.length > 1 ? `<option value="">${esc(I18n.t(sajat ? "admCityMine" : "admCityAll"))}</option>` : ""}
                ${lista.map(n => `<option value="${esc(n)}" ${n === AdminManager.munkaVaros ? "selected" : ""}>${esc(CityManager.displayName(n))}</option>`).join("")}
            </select>
        </label>`;
};

// A városválasztók (pl. Karbantartás) a városra kapott munkatársnak csak a saját városait kínálják
(() => {
    const eredeti = AdminManager.cityOptions;
    AdminManager.cityOptions = function (selected) {
        const sajat = AdminManager.sajatVarosok();
        if (!sajat) return eredeti.call(this, selected);
        return sajat.slice().sort((a, b) => CityManager.displayName(a).localeCompare(CityManager.displayName(b), "hu"))
            .map(n => `<option value="${Utils.escape(n)}" ${n === selected ? "selected" : ""}>${Utils.escape(CityManager.displayName(n))}</option>`).join("");
    };
})();

// Minden admin-kérés viszi a kiválasztott várost (a szerver a hirdetés-listákat erre szűri)
(() => {
    if (window.__ipAdminFetch) return;
    window.__ipAdminFetch = true;
    const eredeti = window.fetch.bind(window);
    window.fetch = function (input, init) {
        try {
            const url = typeof input === "string" ? input : (input && input.url) || "";
            if (AdminManager.munkaVaros && AdminManager.varosSzekcio() && /^(\/|https?:\/\/[^/]*\/)api\/(admin\/|jogi\/bejelentesek)/.test(url) && (url.startsWith("/") || url.startsWith(location.origin))) {
                const h = new Headers((init && init.headers) || (typeof input !== "string" && input.headers) || {});
                if (!h.has("X-Admin-Varos")) h.set("X-Admin-Varos", encodeURIComponent(AdminManager.munkaVaros));
                init = { ...(init || {}), headers: h };
            }
        } catch (e) { /* a kérés megy tovább fejléc nélkül */ }
        return eredeti(input, init);
    };
})();

// ===================== A FELSŐ SÁV: modulok + a modul oldalai =====================

AdminManager.renderNav = function () {

    const top = document.getElementById("adminTop");
    if (!top) return;

    const esc = Utils.escape;
    AdminManager.munkaVarosEllenoriz();
    const aktivTab = AdminManager.TABS[AdminManager.tab] ? AdminManager.tab : "overview";
    const aktivModul = AdminManager.TABS[aktivTab].group;
    const oldalak = g => (AdminManager.REND[g.key] || []).filter(k => k === "|" || (AdminManager.TABS[k] && AdminManager.lathato(AdminManager.TABS[k])));
    const modulok = AdminManager.GROUPS.filter(g => oldalak(g).some(k => k !== "|"));

    const lapok = oldalak(AdminManager.GROUPS.find(g => g.key === aktivModul) || modulok[0])
        // elválasztó csak két oldal között
        .filter((k, i, l) => k !== "|" || (i > 0 && i < l.length - 1 && l[i - 1] !== "|"));

    top.innerHTML = `
        <div class="admTop">
            ${["varos", "altalanos"].map(sz => {
                const ms = modulok.filter(g => g.szekcio === sz);
                if (!ms.length) return "";
                return `
                <nav class="admModulok admSzekcio sz-${sz} ${(AdminManager.GROUPS.find(g => g.key === aktivModul) || {}).szekcio === sz ? "aktiv" : ""}" aria-label="${esc(I18n.t(sz === "varos" ? "admSecCity" : "admSecGeneral"))}">
                    ${sz === "varos" ? AdminManager.varosValaszto() : `<span class="admSzekcioCim">${esc(I18n.t("admSecGeneral"))}</span>`}
                    ${ms.map(g => {
                        const elso = oldalak(g).find(k => k !== "|");
                        const db = AdminManager.modulDb(g);
                        return `
                        <button type="button" class="admModul ${g.key === aktivModul ? "active" : ""}" data-modul="${elso}" ${g.key === aktivModul ? 'aria-current="page"' : ""}>
                            <i class="${g.icon}" aria-hidden="true"></i><span>${esc(I18n.t(g.label))}</span>
                            ${g.key === "ma" ? `<span class="admModulDb" id="todayCount" hidden></span>` : db ? `<span class="admModulDb">${db > 99 ? "99+" : db}</span>` : ""}
                        </button>`;
                    }).join("")}
                </nav>`;
            }).join("")}
            <button type="button" class="admUgras" id="admUgras" aria-keyshortcuts="Control+K">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><span>${esc(I18n.t("adminJump"))}</span><kbd>Ctrl K</kbd>
            </button>
        </div>
        ${lapok.length > 1 ? `
        <nav class="admLapok" id="adminTabs" aria-label="${esc(I18n.t((AdminManager.GROUPS.find(g => g.key === aktivModul) || {}).label || "adminTitle"))}">
            ${lapok.map(k => k === "|" ? `<span class="admLapSep" aria-hidden="true"></span>` : (() => {
                const t = AdminManager.TABS[k];
                return `
                    <button type="button" class="admLap ${k === aktivTab ? "active" : ""}" data-tab="${k}">
                        <i class="${t.icon}" aria-hidden="true"></i><span>${esc(I18n.t(t.title))}</span>
                        ${t.count ? `<span class="navCount ${t.warn ? "warn" : ""}" id="${t.count}" hidden></span>` : ""}
                    </button>`;
            })()).join("")}
        </nav>` : `<nav id="adminTabs" hidden></nav>`}`;

    top.querySelectorAll("[data-modul]").forEach(b => { b.onclick = () => AdminManager.open(b.dataset.modul); });
    top.querySelectorAll("[data-tab]").forEach(b => { b.onclick = () => AdminManager.open(b.dataset.tab); });
    top.querySelector("#admUgras").onclick = () => AdminManager.ugras();
    const vv = top.querySelector("#admVaros");
    if (vv) vv.onchange = () => {
        AdminManager.munkaVarosBeallit(vv.value);
        // a mostani oldal és a számlálók újra, a kiválasztott városra
        AdminManager.open(AdminManager.TABS[AdminManager.tab] ? AdminManager.tab : "overview");
        if (AdminManager.refreshPendingCount) AdminManager.refreshPendingCount();
    };

    // Kis képernyőn a kiválasztott fül legyen látható
    const akt = top.querySelector(".admLap.active, .admModul.active");
    if (akt && window.innerWidth < 992) akt.scrollIntoView({ block: "nearest", inline: "center" });

    if (AdminManager.counts && Object.keys(AdminManager.counts).length) AdminManager.applyCounts(AdminManager.counts);

};

(() => {

    // Részváltáskor a felső sáv is frissül (más modul → más fülek)
    const open = AdminManager.open;
    AdminManager.open = function (tab, opts) {
        const elotte = AdminManager.varosSzekcio();
        const r = open.call(this, tab, opts);
        AdminManager.renderNav();
        // Város ↔ Általános váltáskor a számlálók is (a városra szűrt / az egész oldal)
        if (elotte !== AdminManager.varosSzekcio() && AdminManager.refreshPendingCount) AdminManager.refreshPendingCount();
        return r;
    };

    // Számlálók: a Ma (a teendők száma) és a modulok sürgős számai
    const apply = AdminManager.applyCounts;
    AdminManager.applyCounts = function (c) {
        apply.call(this, c);
        AdminManager.setCount("todayCount", AdminManager.maTeendok(c).length);
        document.querySelectorAll(".admModul[data-modul]").forEach(b => {
            const t = AdminManager.TABS[b.dataset.modul];
            const g = t && AdminManager.GROUPS.find(x => x.key === t.group);
            if (!g || g.key === "ma") return;
            let el = b.querySelector(".admModulDb");
            const n = AdminManager.modulDb(g);
            if (!n) { if (el) el.remove(); return; }
            if (!el) { el = document.createElement("span"); el.className = "admModulDb"; b.appendChild(el); }
            el.textContent = n > 99 ? "99+" : n;
        });
    };

    // Ctrl+K (vagy /) az admin felületen: Ugrás…
    document.addEventListener("keydown", e => {
        if (PageManager.current !== "admin" || !AuthManager.panel()) return;
        const gepel = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || "") || (e.target && e.target.isContentEditable);
        if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); AdminManager.ugras(); }
        else if (e.key === "/" && !gepel && !document.getElementById("admUgrasAblak")) { e.preventDefault(); AdminManager.ugras(); }
    });

})();

// ===================== UGRÁS… (keresés az admin minden részében) =====================

AdminManager.ugras = function () {

    if (document.getElementById("admUgrasAblak")) return;
    const esc = Utils.escape;
    const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

    // Minden látható oldal + néhány gyakori művelet
    const elemek = [];
    AdminManager.GROUPS.forEach(g => (AdminManager.REND[g.key] || []).forEach(k => {
        const t = AdminManager.TABS[k];
        if (k === "|" || !t || !AdminManager.lathato(t)) return;
        elemek.push({ tab: k, icon: t.icon, cim: I18n.t(t.title), sugo: I18n.t(t.desc), modul: I18n.t(g.label) });
    }));
    if (AuthManager.isAdmin() || AuthManager.resz("hirdetes")) elemek.push({ href: "#new", icon: "fa-solid fa-circle-plus", cim: I18n.t("ovQuickNew"), sugo: I18n.t("adminJumpNewHelp"), modul: I18n.t("adminJumpAction") });
    if (AuthManager.isAdmin()) elemek.push({ href: "#properties", icon: "fa-solid fa-table", cim: I18n.t("wsBulk"), sugo: I18n.t("wsBulkHelp"), modul: I18n.t("adminJumpAction") });

    const doboz = document.createElement("div");
    doboz.id = "admUgrasAblak";
    doboz.className = "admUgrasAblak";
    doboz.innerHTML = `
        <div class="admUgrasPanel" role="dialog" aria-modal="true" aria-label="${esc(I18n.t("adminJump"))}">
            <div class="admUgrasKeres">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <input type="text" id="admUgrasQ" placeholder="${esc(I18n.t("adminJumpPh"))}" aria-label="${esc(I18n.t("adminJumpPh"))}" autocomplete="off">
                <kbd>Esc</kbd>
            </div>
            <ul class="admUgrasLista" id="admUgrasLista" role="listbox"></ul>
        </div>`;
    document.body.appendChild(doboz);

    const q = doboz.querySelector("#admUgrasQ");
    const ul = doboz.querySelector("#admUgrasLista");
    let talalat = elemek;
    let jelolt = 0;

    const rajz = () => {
        const s = norm(q.value.trim());
        // A címben talált előre, azon belül ami a cím (egy szava) elején kezdődik
        const pont = x => {
            const c = norm(x.cim);
            if (c.startsWith(s)) return 0;
            if (c.split(/[\s,–-]+/).some(w => w.startsWith(s))) return 1;
            if (c.includes(s)) return 2;
            if (norm(x.modul).includes(s)) return 3;
            return norm(x.sugo).includes(s) ? 4 : 9;
        };
        talalat = s ? elemek.map(x => ({ x, p: pont(x) })).filter(y => y.p < 9).sort((a, b) => a.p - b.p).map(y => y.x) : elemek;
        jelolt = Math.min(jelolt, Math.max(0, talalat.length - 1));
        ul.innerHTML = talalat.map((x, i) => `
            <li role="option" aria-selected="${i === jelolt}" class="${i === jelolt ? "jelolt" : ""}" data-i="${i}">
                <i class="${x.icon}" aria-hidden="true"></i>
                <span class="flex-fill min-w-0"><b>${esc(x.cim)}</b><small>${esc(x.sugo)}</small></span>
                <em>${esc(x.modul)}</em>
            </li>`).join("") || `<li class="ures">${esc(I18n.t("adminJumpNone"))}</li>`;
        ul.querySelectorAll("[data-i]").forEach(li => {
            li.onclick = () => megy(Number(li.dataset.i));
            li.onmousemove = () => { if (jelolt !== Number(li.dataset.i)) { jelolt = Number(li.dataset.i); rajz(); } };
        });
        const j = ul.querySelector(".jelolt");
        if (j) j.scrollIntoView({ block: "nearest" });
    };

    const zar = () => { doboz.remove(); document.removeEventListener("keydown", bill, true); };
    const megy = i => {
        const x = talalat[i];
        if (!x) return;
        zar();
        if (x.tab) AdminManager.open(x.tab);
        else location.hash = x.href;
    };
    const bill = e => {
        if (e.key === "Escape") { e.preventDefault(); zar(); }
        else if (e.key === "ArrowDown") { e.preventDefault(); jelolt = Math.min(talalat.length - 1, jelolt + 1); rajz(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); jelolt = Math.max(0, jelolt - 1); rajz(); }
        else if (e.key === "Enter") { e.preventDefault(); megy(jelolt); }
    };

    q.oninput = () => { jelolt = 0; rajz(); };
    document.addEventListener("keydown", bill, true);
    doboz.addEventListener("mousedown", e => { if (e.target === doboz) zar(); });
    rajz();
    q.focus();

};
