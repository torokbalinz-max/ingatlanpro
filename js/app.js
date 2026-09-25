document.addEventListener("DOMContentLoaded", () => {

    console.log("IngatlanPro indult");

    // ===================== MODULOK =====================

    UIManager.init();
    FilterManager.init();
    StatisticsManager.init();
    BulkEditManager.init();
    NewPropertyMap.init();
    NewPropertyManager.init();
    ValuationManager.init();

    UIManager.showNoSelection();

    // Városok, majd az ingatlanok betöltése
    CityManager.init().then(() => DataManager.init());

    // Oldal a címsor alapján (#properties, #market ...)
    PageManager.init();

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

        CityManager.refreshLabels();
        FilterManager.renderSources();

        if (UIManager.selectedIngatlan) {
            UIManager.showDetails(UIManager.selectedIngatlan);
        } else {
            UIManager.showNoSelection();
        }

        DashboardManager.load(DataManager.szurtIngatlanok);

        if (PageManager.current === "properties") {
            MapManager.load(DataManager.szurtIngatlanok);
        } else {
            MapManager.dirty = true;
        }

        NewPropertyManager.updateTitle();
        NewPropertyManager.updatePreview();

        BulkEditManager.loadKeruletOptions();

        StatisticsManager.rerender();
        ValuationManager.rerender();

        darkBtn.title = I18n.t(document.documentElement.getAttribute("data-bs-theme") === "dark" ? "darkModeOff" : "darkModeOn");

    });

});
