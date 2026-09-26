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

    // ---------- Kerületek: magyar és román név ----------
    //  Az adatbázisban a "nev" a magyar név, a "nev_ro" a román.
    //  Magyarul a magyar név látszik, angolul és románul a román.

    static keruletek = [];

    static loadAllKeruletek() {
        return fetch("/api/keruletek")
            .then(r => r.json())
            .then(lista => { CityManager.keruletek = Array.isArray(lista) ? lista : []; })
            .catch(err => console.error("Kerületek betöltése sikertelen:", err));
    }

    static keruletLabelOf(k) {
        if (!k) return "";
        return I18n.current === "hu" ? k.nev : (k.nev_ro || k.nev);
    }

    static keruletLabel(nev, varos) {
        if (!nev) return "";
        const k = CityManager.keruletek.find(x => x.nev === nev && (!varos || x.varos === varos))
            || CityManager.keruletek.find(x => x.nev === nev);
        return k ? CityManager.keruletLabelOf(k) : nev;
    }

    // Település (háznál, teleknél): magyarul magyar, máshol román név
    static telepulesLabel(nev) {
        return Telepulesek.nev(nev, I18n.current);
    }

    // "Sepsiszentgyörgy · Csíki negyed" / "Uzon, Sepsiszentgyörgy mellett"
    static helyLabel(i) {

        const varos = CityManager.displayName(i.varos);
        const f = Types.get(i.tipus).fields;

        if (f.telepules) {
            if (i.telepules) return I18n.f("nearCity", { hely: CityManager.telepulesLabel(i.telepules), varos });
            return varos;
        }

        return [varos, CityManager.keruletLabel(i.kerulet, i.varos)].filter(Boolean).join(" · ");

    }

    // A kerület vagy a település (táblázat oszlopához)
    static helyReszLabel(i) {
        const f = Types.get(i.tipus).fields;
        if (f.telepules) return i.telepules ? CityManager.telepulesLabel(i.telepules) : I18n.t("telepulesVarosban");
        return CityManager.keruletLabel(i.kerulet, i.varos);
    }

    static init() {

        return Promise.all([CityManager.loadVarosok(), CityManager.loadAllKeruletek()]).then(() => {

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

                const cimke = k => {
                    const fo = CityManager.keruletLabelOf(k);
                    const masik = I18n.current === "hu" ? k.nev_ro : k.nev;
                    return masik && masik !== fo ? `${fo} (${masik})` : fo;
                };

                lista.sort((a, b) => CityManager.keruletLabelOf(a).localeCompare(CityManager.keruletLabelOf(b), I18n.current));

                select.innerHTML = `<option value="">${I18n.t(emptyKey)}</option>` +
                    lista.map(k => `<option value="${Utils.escape(k.nev)}">${Utils.escape(cimke(k))}</option>`).join("");

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

        if (typeof FilterManager !== "undefined") FilterManager.renderTelepulesek();

        CityManager.loadSearchKeruletek(DataManager.currentCity);

        const uj = document.getElementById("ujKerulet");
        const ujVaros = document.getElementById("ujVaros");
        if (uj && ujVaros) CityManager.loadKeruletek(ujVaros.value, uj.value);

        const val = document.getElementById("valKerulet");
        const valVaros = document.getElementById("valVaros");
        if (val && valVaros) CityManager.loadKeruletekInto("valKerulet", valVaros.value, val.value, "allapotMindegy");

    }

}
