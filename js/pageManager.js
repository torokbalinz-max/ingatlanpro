class PageManager {

    static show(page) {

        // Minden oldal elrejtése

        document.getElementById("pageDashboard").style.display = "none";
        document.getElementById("pageNew").style.display = "none";
        document.getElementById("pageStatistics").style.display = "none";

        // Kiválasztott oldal megjelenítése

        document.getElementById(page).style.display = "block";

        // Ha új ingatlan oldal

        if (page === "pageNew") {

            setTimeout(() => {

                NewPropertyMap.refresh();

            }, 200);

        }

        // Ha statisztika oldal

        if (page === "pageStatistics") {

            StatisticsManager.loadCurrent();

        }

    }

}