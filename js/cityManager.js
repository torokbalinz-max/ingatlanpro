class CityManager {

    static varosok = [];

    static init() {

        // Navbar városválasztó feltöltése az adatbázisban lévő
        // (alap + újonnan felvett) városokkal.
        CityManager.loadVarosok().then(() => {

            CityManager.fillCitySelect(document.getElementById("citySelect"));

            // Kereső oldali kerület-szűrő feltöltése az aktuális városhoz
            CityManager.loadSearchKeruletek(DataManager.currentCity);

            // Új ingatlan űrlap városválasztója
            const ujVaros = document.getElementById("ujVaros");

            if (ujVaros) {

                CityManager.fillCitySelect(ujVaros);

                ujVaros.value = DataManager.currentCity;

                CityManager.loadKeruletek(ujVaros.value);

                ujVaros.onchange = () => {

                    CityManager.loadKeruletek(ujVaros.value);

                };

            }

        });

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
                .then(() => CityManager.loadVarosok().then(() => {

                    CityManager.fillCitySelect(document.getElementById("citySelect"));

                    const ujVarosSelect = document.getElementById("ujVaros");

                    if (ujVarosSelect) {

                        CityManager.fillCitySelect(ujVarosSelect);
                        ujVarosSelect.value = nev.trim();
                        CityManager.loadKeruletek(nev.trim());

                    }

                }))
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
                .then(() => CityManager.loadKeruletek(varos, nev.trim()))
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

    static fillCitySelect(select) {

        if (!select) return;

        const meglevo = new Set(
            Array.from(select.options).map(o => o.value)
        );

        CityManager.varosok.forEach(v => {

            if (!meglevo.has(v.nev)) {

                const opt = document.createElement("option");

                opt.value = v.nev;
                opt.innerText = v.nev;

                select.appendChild(opt);

            }

        });

    }

    static loadSearchKeruletek(varos) {

        const select = document.getElementById("keresoKerulet");

        if (!select) return Promise.resolve();

        return fetch("/api/keruletek?varos=" + encodeURIComponent(varos))
            .then(r => r.json())
            .then(lista => {

                select.innerHTML = `<option value="">${I18n.t("allapotMindegy")}</option>`;

                lista.forEach(k => {

                    const opt = document.createElement("option");

                    opt.value = k.nev;
                    opt.innerText = k.nev;

                    select.appendChild(opt);

                });

            })
            .catch(err => console.error("Kerületek betöltése sikertelen:", err));

    }

    static loadKeruletek(varos, selectNev) {

        const select = document.getElementById("ujKerulet");

        if (!select) return Promise.resolve();

        return fetch("/api/keruletek?varos=" + encodeURIComponent(varos))
            .then(r => r.json())
            .then(lista => {

                select.innerHTML = `<option value="">${I18n.t("newKeruletNincs")}</option>`;

                lista.forEach(k => {

                    const opt = document.createElement("option");

                    opt.value = k.nev;
                    opt.innerText = k.nev;

                    select.appendChild(opt);

                });

                if (selectNev) {
                    select.value = selectNev;
                }

            })
            .catch(err => console.error("Kerületek betöltése sikertelen:", err));

    }

}