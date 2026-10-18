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
        if (CityManager.DISPLAY[nev]) return CityManager.DISPLAY[nev];
        // "<város> és környéke": magyarul a saját neve, más nyelven lefordítva
        const anya = CityManager.parentOf(nev);
        if (anya && typeof I18n !== "undefined" && I18n.current !== "hu") {
            return I18n.f("kornyekCityName", { varos: CityManager.displayName(anya) });
        }
        return nev || "";
    }

    // ---------- Város és környéke ----------
    //  A "<város> és környéke" városban vannak a város falvaiban lévő hirdetések
    //  (a városok listájában: anyavaros = melyik város környéke)

    static varosAdat(nev) {
        return CityManager.varosok.find(v => v.nev === nev) || null;
    }

    // Ez egy környék-város? -> az anyaváros neve, különben null
    static parentOf(nev) {
        const v = CityManager.varosAdat(nev);
        return v && v.anyavaros ? v.anyavaros : null;
    }

    static isKornyek(nev) {
        return !!CityManager.parentOf(nev);
    }

    // A város környék-városa (ha van)
    static kornyekOf(nev) {
        return CityManager.varosok.find(v => v.anyavaros && v.anyavaros === nev) || null;
    }

    // ---------- A városon belüli részek neve ----------
    //  Városonként az admin választja ki (Admin → Városok → Szerkesztés):
    //  kerület / negyed / városrész. Ugyanazt jelenti, csak más a neve
    //  (románul: cartier / cartier / zonă). Üres = az alap szövegek.

    static RESZ_ALAP = {
        label: "kerulet", form: "newKerulet", plural: "keruletekLabel", choose: "bulkKeruletChoose",
        col: "colKerulet", factor: "valF_kerulet", medOld: "valDistrictMedianOld", medNew: "valDistrictMedianNew", m4: "valM4Districts"
    };

    static reszTipus(varos) {
        const v = CityManager.varosAdat(varos);
        return v && v.resz_nev ? v.resz_nev : null;
    }

    // CityManager.reszT("label", "Sepsiszentgyorgy") -> "Negyed" / "Cartier" / "Neighbourhood"
    static reszT(kind, varos) {
        const tipus = CityManager.reszTipus(varos);
        if (tipus) {
            const k = ["form", "col", "factor"].includes(kind) ? "label" : kind;
            const key = `resz_${tipus}_${k}`;
            const s = I18n.t(key);
            if (s !== key) return s;
        }
        return I18n.t(CityManager.RESZ_ALAP[kind] || kind);
    }

    // A [data-resz] feliratok (kereső, hirdetésfeladás, értékbecslő, tömeges szerkesztés)
    //  data-resz-varos: melyik városválasztóhoz tartozik ("current" = a kiválasztott város)
    static applyReszLabels() {
        document.querySelectorAll("[data-resz]").forEach(el => {
            const forras = el.dataset.reszVaros;
            const sel = forras && forras !== "current" ? document.getElementById(forras) : null;
            const varos = sel ? sel.value : DataManager.currentCity;
            el.innerText = CityManager.reszT(el.dataset.resz, varos) + (el.dataset.reszSuffix || "");
        });
    }

    static reszFigyel = false;

    static watchReszLabels() {
        if (CityManager.reszFigyel) return;
        CityManager.reszFigyel = true;
        document.addEventListener("change", e => {
            const id = e.target && e.target.id;
            if (!["citySelect", "ujVaros", "valVaros"].includes(id)) return;
            // A város-váltás többi kezelője előbb lefut (DataManager.currentCity)
            setTimeout(() => {
                CityManager.applyReszLabels();
                if (id === "citySelect" && typeof TableManager !== "undefined") TableManager.refreshColumns();
            }, 0);
        });
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

        const anya = CityManager.parentOf(i.varos);
        const varos = CityManager.displayName(i.varos);
        const f = Types.fieldsOf(i);

        if (f.telepules) {
            // A környék-városban a falu az anyaváros mellett van ("Uzon, Sepsiszentgyörgy mellett")
            if (i.telepules) return I18n.f("nearCity", { hely: CityManager.telepulesLabel(i.telepules), varos: anya ? CityManager.displayName(anya) : varos });
            return varos;
        }

        return [varos, CityManager.keruletLabel(i.kerulet, i.varos)].filter(Boolean).join(" · ");

    }

    // A kerület vagy a település (táblázat oszlopához)
    static helyReszLabel(i) {
        const f = Types.fieldsOf(i);
        if (f.telepules) {
            if (i.telepules) return CityManager.telepulesLabel(i.telepules);
            return CityManager.isKornyek(i.varos) ? I18n.t("kornyekNoVillage") : I18n.t("telepulesVarosban");
        }
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

            // A városon belüli részek neve (kerület / negyed / városrész)
            CityManager.watchReszLabels();
            CityManager.applyReszLabels();
            if (typeof TableManager !== "undefined") TableManager.refreshColumns();

            // A városok listája megvan: a "<város> és környéke" városban más mezők látszanak
            if (typeof FilterManager !== "undefined") FilterManager.onTypeChange();
            if (typeof ValuationManager !== "undefined") ValuationManager.applyLocationFields();
            if (typeof NewPropertyManager !== "undefined") NewPropertyManager.applyType();

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

        // A környék-város közvetlenül a városa után
        const alap = n => CityManager.displayName(CityManager.parentOf(n) || n);
        nevek.sort((a, b) => alap(a).localeCompare(alap(b), "hu") || (CityManager.isKornyek(a) - CityManager.isKornyek(b)));

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

    // A kereső kerületei (több is kiválasztható: FilterManager.renderKeruletek)
    static keruletCache = {};

    static loadSearchKeruletek(varos) {
        return fetch("/api/keruletek?varos=" + encodeURIComponent(varos))
            .then(r => r.json())
            .then(lista => { CityManager.keruletCache[varos] = Array.isArray(lista) ? lista : []; })
            .catch(err => console.error("Kerületek betöltése sikertelen:", err))
            .then(() => {
                if (typeof FilterManager !== "undefined") {
                    FilterManager.renderKeruletek();
                    FilterManager.renderKornyekHint();
                }
            });
    }

    static searchKeruletek(varos) {
        return CityManager.keruletCache[varos] || CityManager.keruletek.filter(k => k.varos === varos);
    }

    static loadKeruletek(varos, selectNev) {
        return CityManager.loadKeruletekInto("ujKerulet", varos, selectNev, "newKeruletNincs");
    }

    // Nyelvváltáskor az "üres" opciók szövege frissüljön
    static refreshLabels() {

        CityManager.applyReszLabels();

        if (typeof FilterManager !== "undefined") {
            FilterManager.renderTelepulesek();
            FilterManager.renderKeruletek();
            FilterManager.renderKornyekHint();
        }

        // A városnevek (a környék-város neve nyelvfüggő)
        ["citySelect", "valVaros", "ujVaros"].forEach(id => {
            const sel = document.getElementById(id);
            if (sel && sel.options.length) CityManager.fillCitySelect(sel, sel.value);
        });

        const uj = document.getElementById("ujKerulet");
        const ujVaros = document.getElementById("ujVaros");
        if (uj && ujVaros) CityManager.loadKeruletek(ujVaros.value, uj.value);

        const val = document.getElementById("valKerulet");
        const valVaros = document.getElementById("valVaros");
        if (val && valVaros) CityManager.loadKeruletekInto("valKerulet", valVaros.value, val.value, "allapotMindegy");

    }

}
