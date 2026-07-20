document.addEventListener("DOMContentLoaded", () => {

    console.log("IngatlanPro indult");

    UIManager.initMenu();
    StatisticsManager.init();

    DataManager.init();

    FilterManager.init();

    NewPropertyMap.init();

    NewPropertyManager.init();

    document.getElementById("btnSaveStatistics").onclick = () => {

        if (!confirm("Biztosan szeretnél egy piaci pillanatképet menteni?")) {
            return;
        }

        fetch("/api/statistics/save", {
            method: "POST"
        })
        .then(r => r.json())
        .then(() => {
            alert("Piaci pillanatkép sikeresen elmentve!");
        })
        .catch(err => {
            console.error(err);
            alert("Hiba történt a mentés során.");
        });

    };
    document.getElementById("btnStatistics").onclick = () => {

    PageManager.show("pageStatistics");

    StatisticsManager.load();

};

});