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

        alert("Statisztika gomb");

        PageManager.show("pageStatistics");

        StatisticsManager.loadCurrent();

        setTimeout(() => {

            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: "smooth"
            });

        }, 100);

    };
    // =======================
// DARK MODE
// =======================

const btnDark = document.getElementById("btnDarkMode");

if (btnDark) {

    if (localStorage.getItem("theme") === "dark") {

        document.body.classList.add("dark-mode");
        btnDark.innerHTML = "☀️ Világos mód";

    }

    btnDark.onclick = () => {

        document.body.classList.toggle("dark-mode");

        if (document.body.classList.contains("dark-mode")) {

            localStorage.setItem("theme", "dark");
            btnDark.innerHTML = "☀️ Világos mód";

        } else {

            localStorage.setItem("theme", "light");
            btnDark.innerHTML = "🌙 Sötét mód";

        }

    };

}
});