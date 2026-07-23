class PageManager {

    static show(page) {

        const dashboard = document.getElementById("pageDashboard");
        const newPage = document.getElementById("pageNew");
        const statistics = document.getElementById("pageStatistics");

        // Alapból minden elrejtése
        dashboard.style.display = "none";
        newPage.style.display = "none";

        // A statisztika most már a dashboard része,
        // ezért csak ezt rejtsük el külön.
        statistics.style.display = "none";

        if (page === "pageDashboard") {

            dashboard.style.display = "block";

        }

        if (page === "pageNew") {

    newPage.style.display = "block";

    setTimeout(() => {

        NewPropertyMap.refresh();

    }, 200);

}

        if (page === "pageStatistics") {

            // Dashboard látszik, mert ebben van a statisztika
            dashboard.style.display = "block";

            // A statisztika rész jelenjen meg
            statistics.style.display = "block";

            StatisticsManager.init();
            StatisticsManager.loadCurrent();

        }

    }

}