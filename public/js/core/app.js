document.addEventListener("DOMContentLoaded", () => {

    console.log("IngatlanPro indult");

    // ===================== MODULOK =====================

    UIManager.init();
    FilterManager.init();
    CardsView.init();
    StatisticsManager.init();
    BulkEditManager.init();
    NewPropertyMap.init();
    NewPropertyManager.init();
    ValuationManager.init();
    AdminManager.init();

    UIManager.showNoSelection();
    HelpManager.init();
    SavedSearches.init();

    // Fejléc: belépés / kilépés
    document.getElementById("navLoginBtn").onclick = () => AuthManager.open("login");
    document.getElementById("navLogout").onclick = () => AuthManager.logout();
    document.getElementById("navViewToggle").onclick = () => AuthManager.setView(!AuthManager.adminNezet);
    document.getElementById("viewAsUserBack").onclick = () => AuthManager.setView(false);
    document.getElementById("navDarkItem").onclick = () => document.getElementById("btnDarkMode").click();

    // Először kiderítjük, ki van belépve (privát módban megvárjuk a belépést),
    // utána töltjük a városokat és az ingatlanokat.
    AuthManager.load()
        .then(() => CityManager.init())
        .then(() => {
            DataManager.init();
            PageManager.init();
            AdminManager.refreshPendingCount();
        });

    // Olvasatlan üzenetek száma (percenként)
    setInterval(() => {
        if (AuthManager.loggedIn() && document.visibilityState === "visible") AuthManager.refresh();
    }, 60000);

    // ===================== SÖTÉT MÓD =====================

    const darkBtn = document.getElementById("btnDarkMode");

    function applyTheme(dark) {

        document.documentElement.setAttribute("data-bs-theme", dark ? "dark" : "light");

        darkBtn.innerHTML = dark
            ? '<i class="fa-solid fa-sun"></i>'
            : '<i class="fa-solid fa-moon"></i>';

        darkBtn.title = I18n.t(dark ? "darkModeOff" : "darkModeOn");

        TableManager.refreshTheme();
        FavoritesManager.refreshTheme();
        StatisticsManager.rerender();

    }

    applyTheme(document.documentElement.getAttribute("data-bs-theme") === "dark");

    darkBtn.onclick = () => {

        const dark = document.documentElement.getAttribute("data-bs-theme") !== "dark";

        try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) { /* nem kritikus */ }

        applyTheme(dark);

    };

    // ===================== NYELVVÁLTÁS =====================

    I18n.onChange(() => {

        TableManager.refreshColumns();
        FavoritesManager.refreshColumns();

        FilterManager.renderTypes();
        FilterManager.onTypeChange();
        NewPropertyManager.renderTypes();
        NewPropertyManager.applyType();
        ValuationManager.renderTypeOptions();

        CityManager.refreshLabels();
        FilterManager.renderSources();

        if (UIManager.selectedIngatlan) {
            UIManager.showDetails(UIManager.selectedIngatlan);
        } else {
            UIManager.showNoSelection();
    HelpManager.init();
        }

        DashboardManager.load(DataManager.szurtIngatlanok);
        CardsView.render(DataManager.szurtIngatlanok);

        if (PageManager.current === "map") {
            MapManager.load(DataManager.szurtIngatlanok);
        } else {
            MapManager.dirty = true;
        }

        NewPropertyManager.updateTitle();
        NewPropertyManager.updatePreview();
        NewPropertyManager.renderPhotos();

        BulkEditManager.loadKeruletOptions();

        StatisticsManager.rerender();
        ValuationManager.rerender();
        ListingPage.rerender();

        if (PageManager.current === "admin") AdminManager.show();
        if (PageManager.current === "igenyek") RequestsPage.rerender();
        if (PageManager.current === "fiok") AccountPage.rerender();
        AgencyPage.rerender();
        AgencyProfile.rerender();
        AuthManager.apply();
        if (PageManager.current === "home") HomePage.render();

        darkBtn.title = I18n.t(document.documentElement.getAttribute("data-bs-theme") === "dark" ? "darkModeOff" : "darkModeOn");

    });

});
