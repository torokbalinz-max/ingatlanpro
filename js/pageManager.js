class PageManager {

    static show(page) {

        // Minden oldal elrejtése
        document.getElementById("pageDashboard").style.display = "none";
        document.getElementById("pageNew").style.display = "none";
        document.getElementById("pageStatistics").style.display = "none";

        // Ingatlanlista alapból látszik
        document.getElementById("propertyContent").style.display = "block";

        // Kiválasztott oldal
        document.getElementById(page).style.display = "block";

        // Új ingatlan
        if (page === "pageNew") {

            setTimeout(() => {

                NewPropertyMap.refresh();

            }, 200);

        }

        // Piaci statisztikák
        if (page === "pageStatistics") {

            document.getElementById("propertyContent").style.display = "none";
            document.getElementById("pageStatistics").style.display = "block";

            StatisticsManager.loadCurrent();

        }

    }

}