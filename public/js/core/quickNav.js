// ============================================================
//  "Mit szeretnél csinálni?" – gyorsindító
//
//  Egy ablak, amelyben az oldal összes funkciója és a súgó témái
//  kereshetők (gépeléssel szűr, nyilakkal / Enterrel választható).
//  Megnyitás: a fejléc kérdőjel gombja, a Ctrl+K (Mac: Cmd+K) vagy a "/"
//  billentyű, telefonon a Menü lap tetején lévő kereső.
//  Egy hirdetés száma (pl. 1234 vagy #1234) beírva: a hirdetés megnyílik.
// ============================================================

class QuickNav {

    // Csoportok és pontok – minden pont egy oldalra / aloldalra visz
    static PONTOK = [
        { csop: "qnGrpFind", icon: "fa-solid fa-house", cim: "menuIngatlanok", leiras: "menuIngatlanokDesc", hova: "properties", kulcs: "listings search kereses hirdetes anunturi cautare" },
        { csop: "qnGrpFind", icon: "fa-solid fa-map-location-dot", cim: "mapTitle", leiras: "menuMapDesc", hova: "map", kulcs: "map terkep harta" },
        { csop: "qnGrpFind", icon: "fa-solid fa-star", cim: "menuKedvencek", leiras: "qnFavDesc", hova: "favorites", kulcs: "favorites kedvenc favorite csillag" },
        { csop: "qnGrpFind", icon: "fa-solid fa-bullhorn", cim: "menuIgenyek", leiras: "navBuyRequestDesc", hova: "igenyek", kulcs: "wanted keresek cerere" },
        { csop: "qnGrpFind", icon: "fa-solid fa-house-circle-check", cim: "by_cim", leiras: "qnViewingsDesc", hova: "erdeklodes", sales: true, kulcs: "viewing megtekintes ajanlat oferta vizionare" },
        { csop: "qnGrpFind", icon: "fa-solid fa-briefcase", cim: "agDirTitle", leiras: "agDirMenuDesc", hova: "irodak", kulcs: "agency iroda agentie" },

        { csop: "qnGrpMarket", icon: "fa-solid fa-calculator", cim: "menuErtekbecslo", leiras: "menuErtekbecsloDesc", hova: "valuation", kulcs: "valuation ertek becsles evaluare pret" },
        { csop: "qnGrpMarket", icon: "fa-solid fa-chart-line", cim: "menuStatisztika", leiras: "menuStatisztikaDesc", hova: "market", kulcs: "market piac statisztika trend statistici" },

        { csop: "qnGrpSell", icon: "fa-solid fa-circle-plus", cim: "navPost", leiras: "navSellPostDesc", hova: "new", kulcs: "post feladas uj adauga anunt" },
        { csop: "qnGrpSell", icon: "fa-solid fa-key", cim: "menuEladjuk", leiras: "menuEladjukDesc", hova: "eladjuk", sales: true, kulcs: "sell eladas vindem mandat" },
        { csop: "qnGrpSell", icon: "fa-solid fa-tags", cim: "menuCsomagok", leiras: "menuCsomagokDesc", hova: "csomagok", kulcs: "pricing csomag ar pachete" },

        { csop: "qnGrpAccount", icon: "fa-solid fa-house-user", cim: "accTabListings", leiras: "qnMyListingsDesc", hova: "fiok/hirdetesek", login: true, kulcs: "my listings hirdeteseim anunturile mele" },
        { csop: "qnGrpAccount", icon: "fa-solid fa-bookmark", cim: "accTabSearches", leiras: "qnSearchesDesc", hova: "fiok/keresesek", login: true, kulcs: "saved searches mentett cautari" },
        { csop: "qnGrpAccount", icon: "fa-solid fa-envelope", cim: "accTabMessages", leiras: "qnMessagesDesc", hova: "fiok/uzenetek", login: true, kulcs: "messages uzenet mesaje" },
        { csop: "qnGrpAccount", icon: "fa-solid fa-bell", cim: "accTabNotifications", leiras: "qnNotifDesc", hova: "fiok/ertesitesek", login: true, kulcs: "notifications ertesites notificari" },
        { csop: "qnGrpAccount", icon: "fa-solid fa-receipt", cim: "accTabBilling", leiras: "qnBillingDesc", hova: "fiok/csomag", login: true, kulcs: "invoice szamla factura billing" },
        { csop: "qnGrpAccount", icon: "fa-solid fa-id-card", cim: "accTabProfil", leiras: "qnProfileDesc", hova: "fiok/profil", login: true, kulcs: "profile profil password jelszo" },
        { csop: "qnGrpAccount", icon: "fa-solid fa-user-shield", cim: "menuAdmin", leiras: "qnAdminDesc", hova: "admin", admin: true, kulcs: "admin" },

        { csop: "qnGrpHelp", icon: "fa-solid fa-circle-question", cim: "menuSugo", leiras: "menuSugoDesc", hova: "sugo", kulcs: "help sugo ajutor" },
        { csop: "qnGrpHelp", icon: "fa-solid fa-scale-balanced", cim: "qnLegal", leiras: "qnLegalDesc", hova: "jogi/aszf", kulcs: "terms aszf feltetelek gdpr adatvedelem cookie suti termeni" }
    ];

    static nyitva = false;
    static aktiv = 0;
    static talalatok = [];

    static ekezetNelkul(s) {
        return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    }

    static lista() {
        const t = I18n.t.bind(I18n);
        const belepve = AuthManager.loggedIn();
        const pontok = QuickNav.PONTOK
            .filter(p => !p.sales || Utils.ertekesites())
            .filter(p => !p.admin || AuthManager.isAdmin())
            .filter(p => !p.login || belepve)
            .map(p => ({ ...p, cimSz: t(p.cim), leirasSz: t(p.leiras), csopSz: t(p.csop) }));

        // A súgó témái (a súgó oldal tartalma)
        if (typeof HELP_CONTENT !== "undefined") {
            const temak = (HELP_CONTENT[I18n.current] || HELP_CONTENT.en || []).filter(x => !x.admin || AuthManager.isAdmin());
            temak.forEach(x => pontok.push({
                csop: "qnGrpHelpTopics", csopSz: t("qnGrpHelpTopics"), icon: x.icon || "fa-solid fa-book-open",
                cimSz: x.title, leirasSz: String(x.intro || "").replace(/<[^>]+>/g, "").slice(0, 110),
                hova: "sugo/" + x.id, sugo: true
            }));
        }
        return pontok;
    }

    static szur(q) {
        const minden = QuickNav.lista();
        const n = QuickNav.ekezetNelkul(q).trim();

        // Hirdetés száma
        const szam = n.match(/^#?\s*(\d{1,7})$/);
        const extra = szam ? [{ csopSz: I18n.t("qnGrpListing"), icon: "fa-solid fa-rectangle-list", cimSz: I18n.f("qnOpenListing", { n: szam[1] }), leirasSz: I18n.t("qnOpenListingDesc"), hova: "listing/" + szam[1] }] : [];

        if (!n) return minden.filter(p => !p.sugo);

        const szavak = n.split(/\s+/).filter(Boolean);
        const pont = p => {
            const cim = QuickNav.ekezetNelkul(p.cimSz), mind = QuickNav.ekezetNelkul(`${p.cimSz} ${p.leirasSz} ${p.kulcs || ""} ${p.csopSz}`);
            if (!szavak.every(sz => mind.includes(sz))) return -1;
            return (cim.startsWith(szavak[0]) ? 30 : 0) + (cim.includes(n) ? 20 : 0) + (p.sugo ? 0 : 10);
        };
        return extra.concat(minden.map(p => [pont(p), p]).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0]).map(x => x[1]).slice(0, 14));
    }

    static epit() {
        if (document.getElementById("qnDialog")) return;
        const t = I18n.t.bind(I18n);
        const d = document.createElement("div");
        d.id = "qnDialog";
        d.className = "qnBackdrop";
        d.hidden = true;
        d.innerHTML = `
            <div class="qnPanel" role="dialog" aria-modal="true" aria-labelledby="qnTitle">
                <div class="qnHead">
                    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                    <label class="visually-hidden" for="qnInput" id="qnTitle" data-i18n="qnTitle">${t("qnTitle")}</label>
                    <input id="qnInput" type="search" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="qnList" aria-autocomplete="list" data-i18n-placeholder="qnPlaceholder" placeholder="${Utils.escape(t("qnPlaceholder"))}">
                    <kbd class="qnEsc">Esc</kbd>
                </div>
                <div class="qnList" id="qnList" role="listbox"></div>
                <div class="qnFoot">
                    <span><kbd>↑</kbd><kbd>↓</kbd> <span data-i18n="qnKeysMove">${t("qnKeysMove")}</span></span>
                    <span><kbd>Enter</kbd> <span data-i18n="qnKeysOpen">${t("qnKeysOpen")}</span></span>
                    <span class="qnFootShort"><kbd>Ctrl</kbd><kbd>K</kbd> <span data-i18n="qnKeysAnywhere">${t("qnKeysAnywhere")}</span></span>
                </div>
            </div>`;
        document.body.appendChild(d);

        const inp = d.querySelector("#qnInput");
        inp.addEventListener("input", () => { QuickNav.aktiv = 0; QuickNav.rajzol(inp.value); });
        inp.addEventListener("keydown", e => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = QuickNav.talalatok.length;
                if (!n) return;
                QuickNav.aktiv = (QuickNav.aktiv + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
                QuickNav.jelol();
            } else if (e.key === "Enter") {
                e.preventDefault();
                const p = QuickNav.talalatok[QuickNav.aktiv];
                if (p) QuickNav.menj(p.hova);
            }
        });
        d.addEventListener("click", e => { if (e.target === d) QuickNav.zar(); });
        d.addEventListener("keydown", e => {
            if (e.key === "Escape") { e.preventDefault(); QuickNav.zar(); }
            if (e.key === "Tab") {            // a fókusz az ablakban marad
                const f = [...d.querySelectorAll("input, a[href]")];
                if (!f.length) return;
                const i = f.indexOf(document.activeElement);
                if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
                else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
            }
        });
    }

    static rajzol(q) {
        const box = document.getElementById("qnList");
        const lista = QuickNav.szur(q);
        QuickNav.talalatok = lista;
        if (!lista.length) {
            box.innerHTML = `<div class="qnEmpty"><i class="fa-regular fa-face-meh" aria-hidden="true"></i> ${Utils.escape(I18n.t("qnNoResult"))} <a href="#sugo">${Utils.escape(I18n.t("menuSugo"))}</a></div>`;
            return;
        }
        let csop = null, html = "";
        lista.forEach((p, n) => {
            if (p.csopSz !== csop) { csop = p.csopSz; html += `<div class="qnGroup" role="presentation">${Utils.escape(csop)}</div>`; }
            html += `<a class="qnItem" role="option" id="qn-${n}" data-n="${n}" href="#${Utils.escape(p.hova)}" aria-selected="false">
                <span class="qnIcon"><i class="${Utils.escape(p.icon)}" aria-hidden="true"></i></span>
                <span class="qnText"><b>${Utils.escape(p.cimSz)}</b>${p.leirasSz ? `<small>${Utils.escape(p.leirasSz)}</small>` : ""}</span>
                <i class="fa-solid fa-arrow-right qnGo" aria-hidden="true"></i>
            </a>`;
        });
        box.innerHTML = html;
        box.querySelectorAll(".qnItem").forEach(a => {
            a.addEventListener("mousemove", () => { if (QuickNav.aktiv !== Number(a.dataset.n)) { QuickNav.aktiv = Number(a.dataset.n); QuickNav.jelol(true); } });
            a.addEventListener("click", e => { e.preventDefault(); QuickNav.menj(QuickNav.talalatok[Number(a.dataset.n)].hova); });
        });
        QuickNav.jelol();
    }

    static jelol(egerrel) {
        const box = document.getElementById("qnList");
        box.querySelectorAll(".qnItem").forEach(a => {
            const on = Number(a.dataset.n) === QuickNav.aktiv;
            a.classList.toggle("isActive", on);
            a.setAttribute("aria-selected", on ? "true" : "false");
            if (on && !egerrel) a.scrollIntoView({ block: "nearest" });
        });
        document.getElementById("qnInput").setAttribute("aria-activedescendant", "qn-" + QuickNav.aktiv);
    }

    static nyit(kezdo) {
        QuickNav.epit();
        const d = document.getElementById("qnDialog");
        const inp = document.getElementById("qnInput");
        QuickNav.elozoFokusz = document.activeElement;
        d.hidden = false;
        document.body.classList.add("qnOpen");
        requestAnimationFrame(() => d.classList.add("isOn"));
        inp.value = kezdo || "";
        QuickNav.aktiv = 0;
        QuickNav.rajzol(inp.value);
        QuickNav.nyitva = true;
        setTimeout(() => inp.focus(), 30);
        const mob = document.getElementById("mobSheet");
        if (mob && !mob.hidden) { const z = document.getElementById("mobSheetZar"); if (z) z.click(); }
    }

    static zar() {
        const d = document.getElementById("qnDialog");
        if (!d || d.hidden) return;
        d.classList.remove("isOn");
        document.body.classList.remove("qnOpen");
        QuickNav.nyitva = false;
        setTimeout(() => { d.hidden = true; }, 160);
        if (QuickNav.elozoFokusz && QuickNav.elozoFokusz.focus) QuickNav.elozoFokusz.focus();
    }

    static menj(hova) {
        QuickNav.zar();
        PageManager.show(hova);
    }

    static init() {

        // A fejléc kérdőjel gombja: a gyorsindító (a súgó az első pontja)
        document.querySelectorAll(".navHelpBtn").forEach(b => {
            b.addEventListener("click", e => {
                if (e.ctrlKey || e.metaKey || e.shiftKey) return;     // új lapon a súgó
                e.preventDefault();
                QuickNav.nyit();
            });
            b.setAttribute("aria-haspopup", "dialog");
        });

        document.querySelectorAll("[data-qn-open]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); QuickNav.nyit(); }));

        document.addEventListener("keydown", e => {
            const mezo = e.target && (e.target.closest("input, textarea, select, [contenteditable='true']"));
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
                e.preventDefault();
                QuickNav.nyitva ? QuickNav.zar() : QuickNav.nyit();
            } else if (e.key === "/" && !mezo && !QuickNav.nyitva && !document.querySelector(".modal.show")) {
                e.preventDefault();
                QuickNav.nyit();
            }
        });

        // Nyelvváltáskor az ablak szövegei is (ha épp nyitva van, újrarajzoljuk)
        I18n.onChange(() => {
            const d = document.getElementById("qnDialog");
            if (d) d.remove();
            if (QuickNav.nyitva) { QuickNav.nyitva = false; document.body.classList.remove("qnOpen"); }
        });

        // Telefonon: a Menü lap tetején kereső gomb
        const lista = document.querySelector("#mobSheet .mobSheetLista");
        if (lista && !lista.querySelector(".qnMobBtn")) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "qnMobBtn";
            b.innerHTML = `<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> <span data-i18n="qnMobile">${Utils.escape(I18n.t("qnMobile"))}</span>`;
            b.addEventListener("click", () => QuickNav.nyit());
            lista.prepend(b);
        }

    }

}

document.addEventListener("DOMContentLoaded", () => QuickNav.init());
