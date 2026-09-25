// ============================================================
//  Oldalak (a fejléc menüpontjai) + címsor (#hash) kezelés
//  #properties, #market, #new, #favorites, #valuation, #admin,
//  #user, #listing/123
// ============================================================

class PageManager {

    static current = null;
    static lastListPage = "properties";

    static PAGES = {
        properties: { icon: "fa-solid fa-house", label: "menuIngatlanok", search: true },
        market: { icon: "fa-solid fa-chart-line", label: "menuStatisztika", search: true },
        new: { icon: "fa-solid fa-circle-plus", label: "menuUj" },
        favorites: { icon: "fa-solid fa-star", label: "menuKedvencek" },
        valuation: { icon: "fa-solid fa-calculator", label: "menuErtekbecslo" },
        admin: { icon: "fa-solid fa-user-shield", label: "menuAdmin" },
        user: { icon: "fa-solid fa-user", label: "menuFelhasznalo" },
        listing: { icon: "fa-solid fa-rectangle-list", label: "menuHirdetes" }
    };

    // Régi nevek (más modulok még ezeket hívhatják)
    static ALIASES = {
        pageDashboard: "properties",
        pageNew: "new",
        pageStatistics: "market",
        pageFavorites: "favorites"
    };

    static init() {

        window.addEventListener("hashchange", () => {
            PageManager.show(location.hash.replace("#", ""), { fromHash: true });
        });

        PageManager.show(location.hash.replace("#", ""), { fromHash: true });

    }

    static parse(target) {

        target = PageManager.ALIASES[target] || target || "properties";

        const [page, param] = String(target).split("/");

        if (!PageManager.PAGES[page]) return { page: "properties", param: null };

        return { page, param: param || null };

    }

    static show(target, opts = {}) {

        const { page, param } = PageManager.parse(target);
        const hash = param ? `${page}/${param}` : page;

        if (!opts.fromHash && location.hash !== "#" + hash) {
            // A hashchange esemény újra meghívja a show-t
            location.hash = hash;
            return;
        }

        const elozo = PageManager.current;
        PageManager.current = page;

        if (page === "properties" || page === "market") {
            PageManager.lastListPage = page;
        }

        // Kereső csak az Ingatlanok és a Piaci elemzés oldalon
        const info = PageManager.PAGES[page];

        document.getElementById("searchAside").style.display = info.search ? "" : "none";
        document.getElementById("mainCol").className = info.search ? "col-xl-9 col-lg-8" : "col-12";

        document.querySelectorAll(".page").forEach(el => {
            el.style.display = el.id === "page-" + page ? "block" : "none";
        });

        // Menü gomb felirata + aktív pont
        document.getElementById("navMenuIcon").className = info.icon;

        const label = document.getElementById("navMenuLabel");
        label.setAttribute("data-i18n", info.label);
        label.innerText = I18n.t(info.label);

        // A hirdetés oldal a lista része (a menüben az Ingatlanok marad kiemelve)
        const menuPage = page === "listing" ? PageManager.lastListPage : page;

        document.querySelectorAll(".navMenu .dropdown-item, .navLink, .navAdminBtn, .navPostBtn").forEach(a => {
            a.classList.toggle("active", a.dataset.page === menuPage);
        });

        document.body.dataset.page = page;

        window.scrollTo({ top: 0 });

        // Oldal-specifikus teendők
        if (page === "properties") {
            MapManager.refresh();
        }

        if (page === "new") {
            if (NewPropertyManager.editId === null && elozo !== "new") {
                NewPropertyManager.clearForm();
            }
            NewPropertyMap.refresh();
        } else if (elozo === "new" && NewPropertyManager.editId !== null) {
            NewPropertyManager.editId = null;
            NewPropertyManager.editStatusz = null;
            NewPropertyManager.updateTitle();
        }

        if (page === "market") {
            StatisticsManager.show();
        }

        if (page === "favorites") {
            FavoritesManager.load();
        }

        if (page === "valuation") {
            ValuationManager.showIntroIfEmpty();
        }

        if (page === "admin") {
            AdminManager.show();
        }

        if (page === "listing" && param) {
            ListingPage.show(Number(param));
        }

    }

}
