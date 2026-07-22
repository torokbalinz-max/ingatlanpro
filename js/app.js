document.addEventListener("DOMContentLoaded", () => {

    console.log("IngatlanPro indult");

    UIManager.initMenu();
    StatisticsManager.init();

    DataManager.init();
    FilterManager.init();

    NewPropertyMap.init();
    NewPropertyManager.init();

    // ===================== PIACI MENTÉS =====================

    const btnSaveStatistics = document.getElementById("btnSaveStatistics");

    if (btnSaveStatistics) {

        btnSaveStatistics.onclick = () => {

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

    if (darkBtn) {

        if (localStorage.getItem("theme") === "dark") {

            body.classList.add("dark-mode");
            darkBtn.innerHTML = "☀️ Világos mód";

        }

        darkBtn.onclick = () => {

            body.classList.toggle("dark-mode");

            if (body.classList.contains("dark-mode")) {

                localStorage.setItem("theme", "dark");
                darkBtn.innerHTML = "☀️ Világos mód";

            } else {

                localStorage.setItem("theme", "light");
                darkBtn.innerHTML = "🌙 Sötét mód";

            }

        };

    }

});