// ============================================================
//  Oldalak (a fejléc menüpontjai) + címsor (#hash) kezelés
//  #properties, #market, #new, #favorites, #valuation, #admin,
//  #user, #listing/123, #jogi/aszf, #sugo/piac, #irodak, #irodak/5,
//  #csomagok, #eladjuk
// ============================================================

class PageManager {

    static current = null;
    static currentHash = null;
    static lastListPage = "properties";

    // Görgetési hely oldalanként: ha visszajössz (pl. Ingatlanok → Térkép → Ingatlanok,
    // vagy egy hirdetésből vissza), ott folytatod, ahol abbahagytad – nem a lista elején
    static scrollPos = {};
    static MEGJEGYZETT = ["home", "properties", "map", "market", "favorites", "irodak", "igenyek", "csomagok", "eladjuk", "valuation"];

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
        sugo: { icon: "fa-solid fa-circle-question", label: "menuSugo" },
        csomagok: { icon: "fa-solid fa-tags", label: "menuCsomagok" },
        eladjuk: { icon: "fa-solid fa-key", label: "menuEladjuk" },
        iratok: { icon: "fa-solid fa-folder-open", label: "ptTitle" }
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

        // a görgetési helyet mi állítjuk vissza (oldalanként) – a böngésző ne ugráljon közbe
        try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (e) { /* nem baj */ }

        window.addEventListener("hashchange", () => {
            PageManager.show(location.hash.replace("#", ""), { fromHash: true });
        });

        // Vendég (nincs bejelentkezve) új látogatása: mindig a Kezdőlappal indul – kivéve, ha
        // egy konkrét hirdetés / iroda / jogi / súgó oldal linkjével jött (megosztott link)
        try {
            const uj = !sessionStorage.getItem("ip_munkamenet");
            sessionStorage.setItem("ip_munkamenet", "1");
            const h = location.hash.replace("#", "");
            const megosztott = /^(listing\/\d+|irodak\/\d+|jogi(\/|$)|sugo(\/|$)|csomagok|eladjuk|reset|uj-jelszo|iratok\/)/.test(h) || /[?&](token|reset)=/.test(location.search);
            if (uj && !AuthManager.loggedIn() && h && h !== "home" && !megosztott) history.replaceState(null, "", "#home");
        } catch (e) { /* sessionStorage nélkül marad a régi viselkedés */ }

        PageManager.show(location.hash.replace("#", ""), { fromHash: true });

    }

    static parse(target) {

        target = PageManager.ALIASES[target] || target || "home";

        const [page, param] = String(target).split("/");

        if (!PageManager.PAGES[page]) return { page: "home", param: null };

        return { page, param: param || null };

    }

    static show(target, opts = {}) {

        let { page, param } = PageManager.parse(target);
        // kikapcsolt értékesítés: az oldalai helyett a kezdőlap
        if (Utils.ERTEKESITES_OLDALAK.includes(page) && !Utils.ertekesites()) {
            page = "home"; param = null;
            if (opts.fromHash) history.replaceState(null, "", "#home");
        }
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
        // a mostani oldal görgetési helye (a visszatéréshez)
        if (PageManager.currentHash && PageManager.MEGJEGYZETT.includes(elozo)) PageManager.scrollPos[PageManager.currentHash] = window.scrollY;
        PageManager.current = page;
        PageManager.currentHash = hash;

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

        document.querySelectorAll(".navMenu .dropdown-item, .navAdminBtn, .navPostBtn, .navHelpBtn").forEach(a => {
            a.classList.toggle("active", a.dataset.page === menuPage);
        });

        if (typeof NavMenu !== "undefined") NavMenu.aktiv(menuPage);

        document.body.dataset.page = page;

        // Látogatottsági statisztika (sütik nélkül)
        if (typeof VisitTracker !== "undefined") VisitTracker.pv(page, param);

        // Visszatérés egy már látott oldalra: ugyanoda görgetünk (a tartalom addig megmaradt);
        // új oldal / hirdetés: a tetejére
        const vissza = PageManager.MEGJEGYZETT.includes(page) ? PageManager.scrollPos[hash] : undefined;
        if (vissza !== undefined && vissza > 0) {
            window.scrollTo({ top: vissza });
            // a képek / kártyák betöltése után még egyszer (ha közben nőtt az oldal)
            setTimeout(() => { if (PageManager.currentHash === hash) window.scrollTo({ top: vissza }); }, 120);
            setTimeout(() => { if (PageManager.currentHash === hash && Math.abs(window.scrollY - vissza) > 40) window.scrollTo({ top: vissza }); }, 450);
        } else {
            window.scrollTo({ top: 0 });
        }

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
            AdminManager.show(param);
        }

        if (page === "listing" && param) {
            ListingPage.show(Number(param));
            if (typeof LegalPage !== "undefined") LegalPage.listingHook(Number(param));
        }

        // Jogi oldalak (impresszum, feltételek, adatvédelem, sütik, bejelentés)
        if (page === "jogi" && typeof LegalPage !== "undefined") {
            LegalPage.show(param);
        }

        if (page === "csomagok" && typeof PricingPage !== "undefined") {
            PricingPage.show(param);
        }

        if (page === "eladjuk" && typeof SellForYouPage !== "undefined") {
            SellForYouPage.show(param);
        }

        if (page === "sugo") {
            HelpPage.show(param);
        }

        if (page === "igenyek") {
            RequestsPage.show(param);
        }

        if (page === "iratok" && typeof DocPortal !== "undefined") {
            DocPortal.show(param);
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

// A bejelentkezés tényének feljegyzése (a következő betöltéskor már az első rajzolás a
// jó nyelven: vendégnek román, bejelentkezve a saját nyelve – lásd i18n-v25.js)
(() => {
    if (typeof AuthManager === "undefined" || AuthManager.__nyelvHorog) return;
    AuthManager.__nyelvHorog = true;
    const eredeti = AuthManager.setMe;
    AuthManager.setMe = function (me) {
        const r = eredeti.call(this, me);
        try {
            if (me && me.user) {
                localStorage.setItem("ip_belepve", "1");
                const sajat = localStorage.getItem("lang");
                if (sajat && sajat !== I18n.current && I18N_STRINGS[sajat] && !sessionStorage.getItem("ip_lang")) I18n.setLanguage(sajat);
            } else {
                localStorage.removeItem("ip_belepve");
                const cel = sessionStorage.getItem("ip_lang") || "ro";
                if (I18n.current !== cel && I18N_STRINGS[cel]) I18n.setLanguage(cel);
            }
        } catch (e) { /* nem baj */ }
        return r;
    };
})();

// „Irodám kezelése” a fiókmenüben csak annak, aki egy ingatlaniroda tagja vagy meghívást kapott –
// az átlagos felhasználót ne zavarja (irodát regisztrálni az Ingatlanirodák oldalon lehet)
(() => {
    if (typeof AuthManager === "undefined" || AuthManager.__irodaHorog) return;
    AuthManager.__irodaHorog = true;
    const eredeti = AuthManager.apply;
    AuthManager.apply = function () {
        const r = eredeti.apply(this, arguments);
        try {
            const van = (AuthManager.irodak || []).length > 0 || (AuthManager.irodaMeghivasok || []).length > 0;
            document.querySelectorAll(".agency-only").forEach(el => { el.hidden = !(AuthManager.loggedIn() && van); });
        } catch (e) { /* nem baj */ }
        return r;
    };
})();
