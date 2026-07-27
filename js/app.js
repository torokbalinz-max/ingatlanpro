document.addEventListener("DOMContentLoaded", () => {

    console.log("IngatlanPro indult");

    UIManager.initMenu();
    StatisticsManager.init();

    CityManager.init();

    DataManager.init();
    FilterManager.init();

    NewPropertyMap.init();
    NewPropertyManager.init();

    UIManager.showNoSelection();

    // ===================== NYELV VÁLTOZÁS KEZELÉSE =====================

    I18n.onChange(() => {

        TableManager.refreshColumns();

        if (typeof FavoritesManager !== "undefined") {
            FavoritesManager.refreshColumns();
        }

        if (!UIManager.selectedIngatlan) {
            UIManager.showNoSelection();
        } else {
            UIManager.updateFavoriteButton(UIManager.selectedIngatlan.id);
        }

        if (MapManager.map && DataManager.szurtIngatlanok) {
            MapManager.load(DataManager.szurtIngatlanok);
        }

        updateDarkModeButtonText();

    });

    // ===================== PIACI MENTÉS =====================

    const btnSaveStatistics = document.getElementById("btnSaveStatistics");

    if (btnSaveStatistics) {

        btnSaveStatistics.onclick = () => {

            if (!confirm(I18n.t("alertConfirmSaveStats"))) {
                return;
            }

            fetch("/api/statistics/save", {
                method: "POST"
            })
            .then(r => r.json())
            .then(() => {
                alert(I18n.t("alertStatsSaved"));
            })
            .catch(err => {
                console.error(err);
                alert(I18n.t("alertStatsSaveError"));
            });

        };

    }

    // ===================== STATISZTIKA GOMB =====================

    const btnStatistics = document.getElementById("btnStatistics");

    if (btnStatistics) {

        btnStatistics.onclick = () => {

            PageManager.show("pageStatistics");

            StatisticsManager.loadCurrent();

            setTimeout(() => {

                window.scrollTo({
                    top: document.body.scrollHeight,
                    behavior: "smooth"
                });

            }, 100);

        };

    }

    // ===================== SÖTÉT MÓD =====================

    const body = document.body;
    const darkBtn = document.getElementById("btnDarkMode");

    function updateDarkModeButtonText() {

        if (!darkBtn) return;

        darkBtn.innerHTML = body.classList.contains("dark-mode")
            ? I18n.t("darkModeOff")
            : I18n.t("darkModeOn");

    }

    if (darkBtn) {

        if (localStorage.getItem("theme") === "dark") {

            body.classList.add("dark-mode");

        }

        updateDarkModeButtonText();

        darkBtn.onclick = () => {

            body.classList.toggle("dark-mode");

            localStorage.setItem(
                "theme",
                body.classList.contains("dark-mode") ? "dark" : "light"
            );

            updateDarkModeButtonText();

        };

    }

});
document.getElementById("citySelect").onchange = function () {

    DataManager.currentCity = this.value;

    DataManager.init();

    CityManager.loadSearchKeruletek(this.value);

};