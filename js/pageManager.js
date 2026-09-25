// ============================================================
//  Oldalak (a lenyíló menü pontjai) + címsor (#hash) kezelés
// ============================================================

class PageManager {

    static current = null;

    static PAGES = {
        properties: { icon: "fa-solid fa-house", label: "menuIngatlanok" },
        new: { icon: "fa-solid fa-circle-plus", label: "menuUj" },
        market: { icon: "fa-solid fa-chart-line", label: "menuStatisztika" },
        favorites: { icon: "fa-solid fa-star", label: "menuKedvencek" },
        valuation: { icon: "fa-solid fa-calculator", label: "menuErtekbecslo" },
        user: { icon: "fa-solid fa-user", label: "menuFelhasznalo" }
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
            PageManager.show(PageManager.fromHash(), { fromHash: true });
        });

        PageManager.show(PageManager.fromHash(), { fromHash: true });

    }

    static fromHash() {
        const h = location.hash.replace("#", "");
        return PageManager.PAGES[h] ? h : "properties";
    }

    static show(page, opts = {}) {

        page = PageManager.ALIASES[page] || page;

        if (!PageManager.PAGES[page]) page = "properties";

        if (!opts.fromHash && location.hash !== "#" + page) {
            // A hashchange esemény újra meghívja a show-t
            location.hash = page;
            return;
        }

        const elozo = PageManager.current;
        PageManager.current = page;

        document.querySelectorAll(".page").forEach(el => {
            el.style.display = el.id === "page-" + page ? "block" : "none";
        });

        // Menü gomb felirata + aktív pont
        const info = PageManager.PAGES[page];

        document.getElementById("navMenuIcon").className = info.icon;

        const label = document.getElementById("navMenuLabel");
        label.setAttribute("data-i18n", info.label);
        label.innerText = I18n.t(info.label);

        document.querySelectorAll(".navMenu .dropdown-item").forEach(a => {
            a.classList.toggle("active", a.dataset.page === page);
        });

        window.scrollTo({ top: 0 });

        // Oldal-specifikus teendők
        if (page === "properties") {
            MapManager.refresh();
        }

        if (page === "new") {
            // Ha nem szerkesztésből jöttünk, üres űrlap
            if (NewPropertyManager.editId === null && elozo !== "new") {
                NewPropertyManager.clearForm();
            }
            NewPropertyMap.refresh();
        } else if (elozo === "new" && NewPropertyManager.editId !== null) {
            // Szerkesztésből kiléptünk mentés nélkül
            NewPropertyManager.editId = null;
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

    }

}
