// ============================================================
//  Piaci elemzés oldal – fülek kezelése
// ============================================================

class StatisticsManager {

    static tab = "current";

    static TABS = {
        current: { btn: "btnCurrentStatistics", load: () => CurrentStatistics.load() },
        history: { btn: "btnHistoryStatistics", load: () => HistoryStatistics.load() },
        compare: { btn: "btnCompareStatistics", load: () => CompareStatistics.load() },
        trend: { btn: "btnTrend", load: () => TrendStatistics.load() }
    };

    static init() {

        Object.entries(StatisticsManager.TABS).forEach(([key, t]) => {
            document.getElementById(t.btn).onclick = () => StatisticsManager.open(key);
        });

    }

    static open(key) {

        StatisticsManager.tab = key;

        Object.entries(StatisticsManager.TABS).forEach(([k, t]) => {
            document.getElementById(t.btn).classList.toggle("active", k === key);
        });

        ChartStatistics.destroy();

        StatisticsManager.TABS[key].load();

    }

    // Az oldal megnyitásakor
    static show() {
        StatisticsManager.open(StatisticsManager.tab);
    }

    // Szűrés változott: csak a "Jelenlegi piac" fül függ tőle
    static refreshCurrent() {
        if (StatisticsManager.tab === "current") {
            CurrentStatistics.load();
        }
    }

    // Nyelv- vagy témaváltás
    static rerender() {
        if (PageManager.current === "market") {
            StatisticsManager.open(StatisticsManager.tab);
        }
    }

    // Régi hívások kompatibilitása
    static loadCurrent() {
        StatisticsManager.open("current");
    }

}
