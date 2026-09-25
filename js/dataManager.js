class DataManager {

    static currentCity = localStorage.getItem("city") || "Sepsiszentgyorgy";
    static ingatlanok = [];
    static szurtIngatlanok = [];
    static filter = {};
    static favoriteIds = new Set();

    static toNumber(value) {

        if (value === null || value === undefined) return 0;

        return Number(
            String(value)
                .replace(/\s/g, "")
                .replace(",", ".")
                .replace("€", "")
        ) || 0;

    }

    static setCity(city) {

        DataManager.currentCity = city;

        try { localStorage.setItem("city", city); } catch (e) { /* nem kritikus */ }

    }

    // Az aktuális város ingatlanjainak betöltése, majd a
    // keresési szűrők újraalkalmazása.
    static init() {

        DataManager.loadFavoriteIds();

        return fetch("/api/ingatlanok?city=" + encodeURIComponent(DataManager.currentCity))

            .then(response => {

                if (!response.ok) {
                    throw new Error("Szerver hiba: " + response.status);
                }

                return response.json();

            })

            .then(rows => {

                // Forrás (hirdetési oldal) előre kiszámolva
                rows.forEach(i => {
                    i.forras = Sources.fromLink(i.link);
                });

                DataManager.ingatlanok = rows;

                FilterManager.renderSources();
                FilterManager.apply();

            })

            .catch(err => {

                console.error("DataManager hiba:", err);
                alert(I18n.t("alertLoadError") + "\n" + err.message);

            });

    }

    static loadFavoriteIds() {

        return fetch("/api/favorites/ids")

            .then(r => r.json())

            .then(ids => {

                DataManager.favoriteIds = new Set(ids);

                if (TableManager.grid) {
                    TableManager.grid.refreshCells({ force: true });
                }

            })

            .catch(err => {

                console.error("Kedvencek betöltése sikertelen:", err);

            });

    }

    static isFavorite(id) {

        return DataManager.favoriteIds.has(id);

    }

    static toggleFavorite(id) {

        const isFav = DataManager.isFavorite(id);

        const request = isFav
            ? fetch("/api/favorites/" + id, { method: "DELETE" })
            : fetch("/api/favorites/" + id, { method: "POST" });

        return request

            .then(r => r.json())

            .then(() => {

                if (isFav) {
                    DataManager.favoriteIds.delete(id);
                } else {
                    DataManager.favoriteIds.add(id);
                }

                if (TableManager.grid) {
                    TableManager.grid.refreshCells({ force: true });
                }

                if (UIManager.selectedIngatlan && UIManager.selectedIngatlan.id === id) {
                    UIManager.updateFavoriteButton(id);
                }

                return !isFav;

            })

            .catch(err => {

                console.error("Kedvenc módosítása sikertelen:", err);

            });

    }

}
