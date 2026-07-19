class FilterManager {

    static init() {

        document
            .getElementById("keresesBtn")
            .addEventListener("click", () => {

                this.filter();

            });

    }

    static filter() {

        const minAr = Number(document.getElementById("minAr").value) || 0;
        const maxAr = Number(document.getElementById("maxAr").value) || Infinity;

        const minNm = Number(document.getElementById("minNm").value) || 0;
        const maxNm = Number(document.getElementById("maxNm").value) || Infinity;

        const minSzoba = Number(document.getElementById("minSzoba").value) || 0;
        const minEmelet = Number(document.getElementById("minEmelet").value) || 0;

        const allapot = document.getElementById("allapot").value;

        // A jelenlegi keresési feltételek eltárolása
        DataManager.filter = {

             minAr,
             maxAr,

             minNm,
             maxNm,

            minSzoba,

            minEmelet,

            allapot

            };

        const lista = DataManager.ingatlanok.filter(i => {

            if (i.ar < minAr) return false;
            if (i.ar > maxAr) return false;

            if (i.nm < minNm) return false;
            if (i.nm > maxNm) return false;

            if (i.szobak < minSzoba) return false;
            const emelet = parseInt(i.emelet);

            if (!isNaN(emelet) && emelet < minEmelet)
            return false;

            if (allapot !== "" && i.allapot !== allapot) return false;

            return true;

        });

        DataManager.szurtIngatlanok = lista;

        DashboardManager.load(lista);

        TableManager.update(lista);

        MapManager.load(lista);

    }

}