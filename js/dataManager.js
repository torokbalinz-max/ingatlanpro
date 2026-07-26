class DataManager {

    static currentCity = "Sepsiszentgyorgy";
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

    static init() {

        console.log("DataManager indul...");

        DataManager.loadFavoriteIds();

        fetch("/api/ingatlanok?city=" + encodeURIComponent(DataManager.currentCity))

            .then(response => {

                console.log("HTTP státusz:", response.status);

                if (!response.ok) {
                    throw new Error("Szerver hiba: " + response.status);
                }

                return response.json();

            })

            .then(rows => {

                console.log("Beolvasott ingatlanok:", rows);

                DataManager.ingatlanok = rows;

                // Induláskor a szűrt lista is az összes ingatlan
                DataManager.szurtIngatlanok = [...rows];

                DashboardManager.load(DataManager.ingatlanok);

                TableManager.load(DataManager.ingatlanok);

                MapManager.load(DataManager.ingatlanok);

            })

            .catch(err => {

                console.error("DataManager hiba:", err);
                alert(err);

            });

    }

    static loadFavoriteIds() {

        return fetch("/api/favorites/ids")

            .then(r => r.json())

            .then(ids => {

                DataManager.favoriteIds = new Set(ids);

                if (TableManager.grid) {
                    TableManager.grid.redrawRows();
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
                    TableManager.grid.redrawRows();
                }

                return !isFav;

            })

            .catch(err => {

                console.error("Kedvenc módosítása sikertelen:", err);

            });

    }

}