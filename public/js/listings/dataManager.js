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

                DataManager.prepare(rows);

                DataManager.ingatlanok = rows;

                FilterManager.renderSources();
                FilterManager.renderTelepulesek();
                FilterManager.renderKeruletek();
                FilterManager.renderKornyekHint();
                FilterManager.apply();

                if (typeof PageManager !== "undefined" && PageManager.current === "home") HomePage.render();

            })

            .catch(err => {

                console.error("DataManager hiba:", err);
                alert(I18n.t("alertLoadError") + "\n" + err.message);

            });

    }

    // Forrás(ok) előre kiszámolva + a duplikált hirdetések megjelölése
    // (ugyanaz a link többször: csak az első számít "eredetinek")
    static prepare(rows) {

        const latott = new Set();

        rows.forEach(i => {

            i.forras = Sources.fromLink(i.link);
            i.forrasok = Sources.allOf(i);

            const k = Utils.normLink(i.link);

            i.dup = !!k && latott.has(k);

            if (k) latott.add(k);

        });

        return rows;

    }

    static loadFavoriteIds() {

        if (!AuthManager.loggedIn()) {
            DataManager.favoriteIds = new Set();
            return Promise.resolve();
        }

        return fetch("/api/favorites/ids")

            .then(r => r.json())

            .then(ids => {

                DataManager.favoriteIds = new Set(ids);

                if (TableManager.grid) {
                    TableManager.grid.refreshCells({ force: true });
                }

                if (typeof CardsView !== "undefined") CardsView.refreshFavorites();

            })

            .catch(err => {

                console.error("Kedvencek betöltése sikertelen:", err);

            });

    }

    static isFavorite(id) {

        return DataManager.favoriteIds.has(id);

    }

    static toggleFavorite(id) {

        // Kedvenc csak bejelentkezve (a fiókhoz tartozik)
        if (!AuthManager.loggedIn()) {
            return AuthManager.kell()
                .then(() => DataManager.loadFavoriteIds())
                .then(() => DataManager.isFavorite(id) ? true : DataManager.toggleFavorite(id))
                .catch(() => { });
        }

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

                CardsView.refreshFavorites();

                if (typeof ListingPage !== "undefined") ListingPage.updateFavorite(id);

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
