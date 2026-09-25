class CityManager {

    static varosok = [];

    // Az alapvárosok ékezetes megjelenítése (az adatbázisban ékezet nélkül vannak)
    static DISPLAY = {
        "Sepsiszentgyorgy": "Sepsiszentgyörgy",
        "Kezdivasarhely": "Kézdivásárhely",
        "Csikszereda": "Csíkszereda",
        "Brasso": "Brassó",
        "Marosvasarhely": "Marosvásárhely"
    };

    static displayName(nev) {
        return CityManager.DISPLAY[nev] || nev || "";
    }

    static init() {

        return CityManager.loadVarosok().then(() => {

            // Keresőben lévő városválasztó
            CityManager.fillCitySelect(document.getElementById("citySelect"), DataManager.currentCity);
            CityManager.loadSearchKeruletek(DataManager.currentCity);

            // Új ingatlan űrlap
            const ujVaros = document.getElementById("ujVaros");

            if (ujVaros) {

                CityManager.fillCitySelect(ujVaros, DataManager.currentCity);
                CityManager.loadKeruletek(ujVaros.value);

                ujVaros.onchange = () => CityManager.loadKeruletek(ujVaros.value);

            }

            // Értékbecslő
            const valVaros = document.getElementById("valVaros");

            if (valVaros) {

                CityManager.fillCitySelect(valVaros, DataManager.currentCity);
                CityManager.loadKeruletekInto("valKerulet", valVaros.value, "", "allapotMindegy");

                valVaros.onchange = () => CityManager.loadKeruletekInto("valKerulet", valVaros.value, "", "allapotMindegy");

            }

            CityManager.initButtons();

        });

    }

    static initButtons() {

        // "+ Új város" gomb
        const btnUjVaros = document.getElementById("btnUjVaros");

        if (btnUjVaros) {

            btnUjVaros.onclick = () => {

                const nev = prompt(I18n.t("alertNewCityPrompt"));

                if (!nev || !nev.trim()) return;

                fetch("/api/varosok", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ nev: nev.trim() })
                })
                .then(r => r.json())
                .then(() => CityManager.loadVarosok())
                .then(() => {

                    CityManager.fillCitySelect(document.getElementById("citySelect"), DataManager.currentCity);
                    CityManager.fillCitySelect(document.getElementById("valVaros"));
                    CityManager.fillCitySelect(document.getElementById("ujVaros"), nev.trim());
                    CityManager.loadKeruletek(nev.trim());

                })
                .catch(err => {
                    console.error(err);
                    alert(I18n.t("alertNewCityError"));
                });

            };

        }

        // "+ Új kerület" gomb
        const btnUjKerulet = document.getElementById("btnUjKerulet");

        if (btnUjKerulet) {

            btnUjKerulet.onclick = () => {

                const varos = document.getElementById("ujVaros").value;

                if (!varos) {
                    alert(I18n.t("alertChooseCityFirst"));
                    return;
                }

                const nev = prompt(I18n.t("alertNewDistrictPrompt"));

                if (!nev || !nev.trim()) return;

                fetch("/api/keruletek", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ varos: varos, nev: nev.trim() })
                })
                .then(r => r.json())
                .then(() => {

                    CityManager.loadKeruletek(varos, nev.trim());

                    if (varos === DataManager.currentCity) {
                        CityManager.loadSearchKeruletek(varos);
                    }

                })
                .catch(err => {
                    console.error(err);
                    alert(I18n.t("alertNewDistrictError"));
                });

            };

        }

    }

    static loadVarosok() {

        return fetch("/api/varosok")
            .then(r => r.json())
            .then(lista => {
                CityManager.varosok = lista;
            })
            .catch(err => console.error("Városok betöltése sikertelen:", err));

    }

    // A select teljes újratöltése a városlistával
    static fillCitySelect(select, value) {

        if (!select) return;

        const current = value || select.value || DataManager.currentCity;

        const nevek = CityManager.varosok.map(v => v.nev);

        if (current && !nevek.includes(current)) nevek.push(current);

        nevek.sort((a, b) => CityManager.displayName(a).localeCompare(CityManager.displayName(b), "hu"));

        select.innerHTML = nevek
            .map(n => `<option value="${Utils.escape(n)}">${Utils.escape(CityManager.displayName(n))}</option>`)
            .join("");

        select.value = current;

    }

    // Általános kerület-betöltő egy selectbe
    static loadKeruletekInto(selectId, varos, selectNev, emptyKey) {

        const select = document.getElementById(selectId);

        if (!select) return Promise.resolve();

        return fetch("/api/keruletek?varos=" + encodeURIComponent(varos))
            .then(r => r.json())
            .then(lista => {

                select.innerHTML = `<option value="">${I18n.t(emptyKey)}</option>` +
                    lista.map(k => `<option value="${Utils.escape(k.nev)}">${Utils.escape(k.nev)}</option>`).join("");

                if (selectNev) select.value = selectNev;

            })
            .catch(err => console.error("Kerületek betöltése sikertelen:", err));

    }

    static loadSearchKeruletek(varos) {
        const el = document.getElementById("keresoKerulet");
        const keep = el ? el.value : "";
        return CityManager.loadKeruletekInto("keresoKerulet", varos, keep, "allapotMindegy");
    }

    static loadKeruletek(varos, selectNev) {
        return CityManager.loadKeruletekInto("ujKerulet", varos, selectNev, "newKeruletNincs");
    }

    // Nyelvváltáskor az "üres" opciók szövege frissüljön
    static refreshLabels() {

        CityManager.loadSearchKeruletek(DataManager.currentCity);

        const uj = document.getElementById("ujKerulet");
        const ujVaros = document.getElementById("ujVaros");
        if (uj && ujVaros) CityManager.loadKeruletek(ujVaros.value, uj.value);

        const val = document.getElementById("valKerulet");
        const valVaros = document.getElementById("valVaros");
        if (val && valVaros) CityManager.loadKeruletekInto("valKerulet", valVaros.value, val.value, "allapotMindegy");

    }

}
