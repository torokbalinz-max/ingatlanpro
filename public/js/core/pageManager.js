// ============================================================
//  Oldalak (a fejléc menüpontjai) + címsor (#hash) kezelés
//  #properties, #market, #new, #favorites, #valuation, #admin,
//  #user, #listing/123, #jogi/aszf, #sugo/piac, #irodak, #irodak/5
// ============================================================

class PageManager {

    static current = null;
    static lastListPage = "properties";

    static PAGES = {
        home: { icon: "fa-solid fa-compass", label: "menuHome" },
        properties: { icon: "fa-solid fa-house", label: "menuIngatlanok", search: true },
        map: { icon: "fa-solid fa-map-location-dot", label: "mapTitle", search: true },
        market: { icon: "fa-solid fa-chart-line", label: "menuStatisztika", search: true },
        new: { icon: "fa-solid fa-circle-plus", label: "menuUj" },
        favorites: { icon: "fa-solid fa-star", label: "menuKedvencek" },
        valuation: { icon: "fa-solid fa-calculator", label: "menuErtekbecslo" },
        admin: { icon: "fa-solid fa-user-shield", label: "menuAdmin" },
        igenyek: { icon: "fa-solid fa-bullhorn", label: "menuIgenyek" },
        fiok: { icon: "fa-solid fa-circle-user", label: "menuFiok", login: true },
        iroda: { icon: "fa-solid fa-briefcase", label: "agMenu", login: true },
        irodak: { icon: "fa-solid fa-briefcase", label: "agDirTitle" },
        listing: { icon: "fa-solid fa-rectangle-list", label: "menuHirdetes" },
        jogi: { icon: "fa-solid fa-scale-balanced", label: "legalPageTitle" },
        sugo: { icon: "fa-solid fa-circle-question", label: "menuSugo" }
    };

    // Régi nevek (más modulok még ezeket hívhatják)
    static ALIASES = {
        pageDashboard: "properties",
        pageNew: "new",
        pageStatistics: "market",
        pageFavorites: "favorites",
        user: "fiok"
    };

    // Ezekhez be kell jelentkezni
    static LOGIN_KELL = ["new", "favorites", "fiok", "iroda"];

    static init() {

        window.addEventListener("hashchange", () => {
            PageManager.show(location.hash.replace("#", ""), { fromHash: true });
        });

        PageManager.show(location.hash.replace("#", ""), { fromHash: true });

    }

    static parse(target) {

        target = PageManager.ALIASES[target] || target || "home";

        const [page, param] = String(target).split("/");

        if (!PageManager.PAGES[page]) return { page: "home", param: null };

        return { page, param: param || null };

    }

    static show(target, opts = {}) {

        const { page, param } = PageManager.parse(target);
        const hash = param ? `${page}/${param}` : page;

        // Belépés nélkül: előbb a belépő ablak, utána megyünk tovább
        if (PageManager.LOGIN_KELL.includes(page) && !AuthManager.loggedIn()) {
            AuthManager.kell()
                .then(() => PageManager.show(hash, opts))
                .catch(() => { if (opts.fromHash) PageManager.show(PageManager.current || "home"); });
            if (opts.fromHash && PageManager.current && PageManager.current !== page) {
                history.replaceState(null, "", "#" + PageManager.current);
            }
            return;
        }

        if (!opts.fromHash && location.hash !== "#" + hash) {
            // A hashchange esemény újra meghívja a show-t
            location.hash = hash;
            return;
        }

        const elozo = PageManager.current;
        PageManager.current = page;

        if (page === "properties" || page === "market" || page === "map") {
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

        document.querySelectorAll(".navMenu .dropdown-item, .navLink, .navAdminBtn, .navPostBtn, .navHelpBtn").forEach(a => {
            a.classList.toggle("active", a.dataset.page === menuPage);
        });

        document.body.dataset.page = page;

        // Látogatottsági statisztika (sütik nélkül)
        if (typeof VisitTracker !== "undefined") VisitTracker.pv(page, param);

        window.scrollTo({ top: 0 });

        // Oldal-specifikus teendők
        if (page === "home") {
            HomePage.render();
        }

        if (page === "map") {
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
            if (typeof LegalPage !== "undefined") LegalPage.listingHook(Number(param));
        }

        // Jogi oldalak (impresszum, feltételek, adatvédelem, sütik, bejelentés)
        if (page === "jogi" && typeof LegalPage !== "undefined") {
            LegalPage.show(param);
        }

        if (page === "sugo") {
            HelpPage.show(param);
        }

        if (page === "igenyek") {
            RequestsPage.show(param);
        }

        if (page === "fiok") {
            AccountPage.show(param);
        }

        if (page === "iroda") {
            AgencyPage.show(param);
        }

        // Ingatlanirodák: a lista, vagy egy iroda adatlapja
        if (page === "irodak") {
            if (param) AgencyProfile.show(Number(param));
            else { AgencyProfile.current = null; AgencyDirectory.show(); }
        }

    }

}
