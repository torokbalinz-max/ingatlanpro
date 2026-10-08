// ============================================================
//  Kereső: város, paraméterek, hirdetési oldal (forrás)
// ============================================================

class FilterManager {

    // null = minden forrás; különben a kiválasztott forrás-kulcsok
    static selectedSources = null;
    static tipus = "lakas";
    static ugylet = "elado";

    // Többes választók: kerületek, települések (falvak)
    static keruletMS = null;
    static telepulesMS = null;

    static renderTypes() {

        Types.renderGrid("searchTypeGrid", FilterManager.tipus, t => {
            FilterManager.tipus = t;
            FilterManager.onTypeChange();
            FilterManager.apply();
        });

    }

    // Típus/ügylet váltáskor a nem értelmes mezők eltűnnek
    static onTypeChange() {

        Types.applyFields("#searchAside", FilterManager.tipus, DataManager.currentCity);

        // A darabszámok a típus / ügylet szerint változnak
        FilterManager.renderKeruletek();
        FilterManager.renderTelepulesek();

        document.getElementById("searchArLabel").innerText =
            I18n.t(FilterManager.ugylet === "kiado" ? "searchArRent" : "searchAr");

        document.getElementById("searchNmLabel").innerText =
            I18n.t(FilterManager.tipus === "telek" ? "searchTelekNm" : "searchNm");

    }

    static init() {

        FilterManager.keruletMS = new MultiSelect("keresoKeruletMS", {
            id: "keresoKerulet",
            label: v => CityManager.keruletLabel(v, DataManager.currentCity),
            noOptions: () => I18n.t("msNoDistricts"),
            onChange: () => FilterManager.apply()
        });

        FilterManager.telepulesMS = new MultiSelect("keresoTelepulesMS", {
            id: "keresoTelepules",
            label: v => v === "_varos" ? I18n.t("telepulesVarosban") : CityManager.telepulesLabel(v),
            noOptions: () => I18n.t("msNoVillages"),
            onChange: () => FilterManager.apply()
        });

        I18n.onChange(() => {
            FilterManager.keruletMS.renderTexts();
            FilterManager.telepulesMS.renderTexts();
        });

        FilterManager.renderTypes();

        document.querySelectorAll('input[name="searchUgylet"]').forEach(r => {
            r.addEventListener("change", () => {
                FilterManager.ugylet = r.value;
                FilterManager.onTypeChange();
                FilterManager.apply();
            });
        });

        ["hideDuplicates", "onlyWithPhotos"].forEach(id => {
            document.getElementById(id).addEventListener("change", () => FilterManager.apply());
        });

        FilterManager.onTypeChange();

        document.getElementById("keresesBtn").addEventListener("click", () => {
            FilterManager.apply();
            // Telefonon a keresés után becsukjuk a szűrőket, hogy látszódjanak a találatok
            const panel = document.getElementById("searchCollapse");
            if (panel && window.innerWidth < 992 && window.bootstrap) {
                bootstrap.Collapse.getOrCreateInstance(panel, { toggle: false }).hide();
            }
        });

        document.getElementById("resetFiltersBtn").addEventListener("click", () => FilterManager.reset());

        // Enter a mezőkben = keresés
        document.querySelectorAll("#searchTabParams input").forEach(input => {
            input.addEventListener("keydown", e => {
                if (e.key === "Enter") FilterManager.apply();
            });
        });

        // Legördülők azonnal szűrnek
        ["allapot", "keresoHely", "keresoJelleg"].forEach(id => {
            document.getElementById(id).addEventListener("change", () => FilterManager.apply());
        });

        document.getElementById("btnSourcesAll").onclick = () => {
            FilterManager.selectedSources = null;
            FilterManager.renderSources();
            FilterManager.apply();
        };

        document.getElementById("btnSourcesNone").onclick = () => {
            FilterManager.selectedSources = new Set();
            FilterManager.renderSources();
            FilterManager.apply();
        };

        // Város váltás
        document.getElementById("citySelect").addEventListener("change", function () {

            DataManager.setCity(this.value);

            // Új városnál a kerület- és forrásszűrő nem értelmezhető
            FilterManager.keruletMS.clear(true);
            FilterManager.telepulesMS.clear(true);
            FilterManager.selectedSources = null;

            // A környék-városban a település számít (kerület nincs)
            FilterManager.onTypeChange();

            CityManager.loadSearchKeruletek(this.value);

            if (typeof BulkEditManager !== "undefined") {
                BulkEditManager.loadKeruletOptions();
                if (TableManager.grid) TableManager.grid.deselectAll();
                BulkEditManager.updateBar([]);
            }

            UIManager.showNoSelection();

            DataManager.init();

        });

    }

    // ---------- Forrás lista (Hirdetési oldal fül) ----------

    static renderSources() {

        const box = document.getElementById("sourceList");

        if (!box) return;

        const lista = Sources.count(DataManager.ingatlanok);

        if (lista.length === 0) {
            box.innerHTML = `<p class="small text-body-secondary mb-0">${I18n.t("sourcesEmpty")}</p>`;
            return;
        }

        box.innerHTML = lista.map(s => {

            const checked = FilterManager.selectedSources === null || FilterManager.selectedSources.has(s.key);

            return `
                <label class="sourceItem">
                    <input type="checkbox" class="form-check-input" value="${Utils.escape(s.key)}" ${checked ? "checked" : ""}>
                    <i class="${Sources.icon(s.key)}"></i>
                    <span class="flex-fill">${Utils.escape(Sources.label(s.key))}</span>
                    <span class="badge rounded-pill text-bg-light">${s.db}</span>
                </label>`;

        }).join("");

        box.querySelectorAll("input").forEach(cb => {

            cb.addEventListener("change", () => {

                const all = [...box.querySelectorAll("input")];
                const checked = all.filter(x => x.checked).map(x => x.value);

                FilterManager.selectedSources = checked.length === all.length ? null : new Set(checked);

                FilterManager.apply();

            });

        });

        FilterManager.updateSourceBadge();

    }

    static updateSourceBadge() {

        const badge = document.getElementById("sourceFilterBadge");

        if (badge) {
            badge.style.display = FilterManager.selectedSources === null ? "none" : "inline-block";
        }

    }

    // ---------- Szűrés ----------

    static read() {

        const n = id => {
            const v = document.getElementById(id).value;
            return v === "" ? null : Number(v);
        };

        const f = Types.fieldsFor(FilterManager.tipus, DataManager.currentCity);
        const keruletek = f.kerulet && FilterManager.keruletMS ? FilterManager.keruletMS.values : [];
        const telepulesek = f.telepules && FilterManager.telepulesMS ? FilterManager.telepulesMS.values : [];

        return {
            varos: DataManager.currentCity,
            tipus: FilterManager.tipus,
            ugylet: FilterManager.ugylet,
            hideDup: document.getElementById("hideDuplicates").checked,
            onlyPhotos: document.getElementById("onlyWithPhotos").checked,
            minAr: n("minAr"),
            maxAr: n("maxAr"),
            minNm: n("minNm"),
            maxNm: n("maxNm"),
            minSzoba: n("minSzoba"),
            maxSzoba: n("maxSzoba"),
            minEmelet: n("minEmelet"),
            maxEmelet: n("maxEmelet"),
            jelleg: FilterManager.tipus === "telek" ? document.getElementById("keresoJelleg").value : "",
            allapot: document.getElementById("allapot").value,
            // Több kerület / település egyszerre; a régi egy-értékes mező csak akkor, ha egy van kiválasztva
            keruletek,
            telepulesek,
            kerulet: keruletek.length === 1 ? keruletek[0] : "",
            telepules: telepulesek.length === 1 ? telepulesek[0] : "",
            hely: document.getElementById("keresoHely").value,
            sources: FilterManager.selectedSources
        };

    }

    static matches(i, f) {

        if ((i.tipus || "lakas") !== f.tipus) return false;
        if ((i.ugylet || "elado") !== f.ugylet) return false;

        if (f.hideDup && i.dup) return false;
        if (f.onlyPhotos && !Utils.hasPhoto(i)) return false;

        if (f.minAr !== null && i.ar < f.minAr) return false;
        if (f.maxAr !== null && i.ar > f.maxAr) return false;

        if (f.minNm !== null && i.nm < f.minNm) return false;
        if (f.maxNm !== null && i.nm > f.maxNm) return false;

        if (f.minSzoba !== null && (i.szobak || 0) < f.minSzoba) return false;

        if (f.maxSzoba !== null && (i.szobak || 0) > f.maxSzoba) return false;

        // Emelet: pontos tartomány (pl. 1–1 = csak első emelet). Ismeretlen emeletű
        // hirdetés ilyenkor nem felel meg.
        if (f.minEmelet !== null || f.maxEmelet !== null) {
            const e = Utils.emeletSzam(i.emelet);
            if (e === null) return false;
            if (f.minEmelet !== null && e < f.minEmelet) return false;
            if (f.maxEmelet !== null && e > f.maxEmelet) return false;
        }

        if (f.jelleg && i.telek_jelleg !== f.jelleg) return false;

        if (f.allapot && Utils.normAllapot(i.allapot) !== f.allapot) return false;

        // Kerületek (bármelyik); a régi, egy-értékes mentett szűrő is működik
        const keruletek = f.keruletek && f.keruletek.length ? f.keruletek : (f.kerulet ? [f.kerulet] : []);
        if (keruletek.length && !keruletek.includes(i.kerulet || "")) return false;

        // Települések (bármelyik); "_varos" = magában a városban
        const telepulesek = f.telepulesek && f.telepulesek.length ? f.telepulesek : (f.telepules ? [f.telepules] : []);
        if (telepulesek.length && !telepulesek.includes(i.telepules || "_varos")) return false;

        if (f.hely && (i.hely_pontossag || (i.x && i.y ? "pontos" : "nincs")) !== f.hely &&
            !(f.hely === "pontos" && i.hely_pontossag === "utca")) return false;

        if (f.sources !== null && !(i.forrasok || [i.forras]).some(k => f.sources.has(k))) return false;

        return true;

    }

    // A darabszámokhoz: a betöltött hirdetések az aktuális típusban, ügyletben
    static tipusSzerint() {
        return (DataManager.ingatlanok || []).filter(i =>
            (i.tipus || "lakas") === FilterManager.tipus && (i.ugylet || "elado") === FilterManager.ugylet && !i.dup);
    }

    // Kerületek (több is kiválasztható), darabszámmal
    static renderKeruletek() {

        const ms = FilterManager.keruletMS;
        if (!ms) return;

        const varos = DataManager.currentCity;
        const db = new Map();
        FilterManager.tipusSzerint().forEach(i => { if (i.kerulet) db.set(i.kerulet, (db.get(i.kerulet) || 0) + 1); });

        const lista = CityManager.searchKeruletek(varos).slice()
            .sort((a, b) => CityManager.keruletLabelOf(a).localeCompare(CityManager.keruletLabelOf(b), I18n.current));

        ms.setOptions(lista.map(k => {
            const masik = I18n.current === "hu" ? k.nev_ro : k.nev;
            const fo = CityManager.keruletLabelOf(k);
            return { value: k.nev, label: fo, hint: masik && masik !== fo ? masik : "", count: db.get(k.nev) || 0 };
        }));

    }

    // Háznál, teleknél (és a környék-városban mindennél): a városban / melyik faluban
    static renderTelepulesek() {

        const ms = FilterManager.telepulesMS;
        if (!ms) return;

        const kornyek = CityManager.isKornyek(DataManager.currentCity);
        const lista = FilterManager.tipusSzerint();
        const db = new Map();
        lista.forEach(i => { const k = i.telepules || "_varos"; db.set(k, (db.get(k) || 0) + 1); });

        // Az összes típus falvai (hogy típusváltáskor se tűnjön el egy falu a listából)
        const nevek = [...new Set((DataManager.ingatlanok || []).map(i => i.telepules).filter(Boolean))]
            .sort((a, b) => CityManager.telepulesLabel(a).localeCompare(CityManager.telepulesLabel(b), I18n.current));

        const opciok = nevek.map(n => {
            const fo = CityManager.telepulesLabel(n);
            const masik = I18n.current === "hu" ? n : Telepulesek.nev(n, "hu");
            return { value: n, label: fo, hint: masik && masik !== fo ? masik : "", count: db.get(n) || 0 };
        });

        // A környék-városban nincs "a városban" (ott csak falvak vannak)
        if (!kornyek) opciok.unshift({ value: "_varos", label: I18n.t("telepulesVarosban"), count: db.get("_varos") || 0 });

        ms.setOptions(opciok);

    }

    //  A kereső alatti tipp:
    //   - a városban: "+ N hirdetés a környező falvakban → <város> és környéke"
    //   - a környék-városban: "← vissza a városba"
    static renderKornyekHint() {

        const box = document.getElementById("kornyekHint");
        if (!box) return;

        const varos = DataManager.currentCity;
        const anya = CityManager.parentOf(varos);
        const k = anya ? null : CityManager.kornyekOf(varos);

        let html = "";

        if (anya) {
            html = `<i class="fa-solid fa-tree-city" aria-hidden="true"></i>
                <div>
                    <span>${I18n.f("kornyekHintIn", { varos: Utils.escape(CityManager.displayName(anya)) })}</span>
                    <button type="button" class="btn btn-link btn-sm p-0" data-varos="${Utils.escape(anya)}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${I18n.f("kornyekHintBack", { varos: Utils.escape(CityManager.displayName(anya)) })}</button>
                </div>`;
        } else if (k && k.db > 0) {
            html = `<i class="fa-solid fa-tree-city" aria-hidden="true"></i>
                <div>
                    <span>${I18n.f("kornyekHintOut", { n: Utils.num(k.db) })}</span>
                    <button type="button" class="btn btn-link btn-sm p-0" data-varos="${Utils.escape(k.nev)}">${Utils.escape(CityManager.displayName(k.nev))} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
                </div>`;
        }

        box.innerHTML = html;
        box.hidden = !html;

        const btn = box.querySelector("[data-varos]");
        if (btn) btn.onclick = () => FilterManager.setCity(btn.dataset.varos);

    }

    // Városváltás kódból (ugyanaz, mintha a listában választották volna)
    static setCity(varos) {
        const sel = document.getElementById("citySelect");
        if (!sel || !varos) return;
        if (![...sel.options].some(o => o.value === varos)) CityManager.fillCitySelect(sel, varos);
        sel.value = varos;
        sel.dispatchEvent(new Event("change"));
    }

    static apply() {

        const f = FilterManager.read();

        DataManager.filter = f;

        const lista = DataManager.ingatlanok.filter(i => FilterManager.matches(i, f));

        DataManager.szurtIngatlanok = lista;

        document.getElementById("searchResultCount").innerText = lista.length;
        const mob = document.getElementById("searchResultCountMobile");
        if (mob) mob.innerText = lista.length;

        FilterManager.updateSourceBadge();

        DashboardManager.load(lista);
        TableManager.load(lista);
        CardsView.render(lista, true);

        // A térképet csak akkor rajzoljuk, ha látszik (rejtett elemen a Leaflet rosszul méretez)
        if (PageManager.current === "map") {
            MapManager.load(lista);
        } else {
            MapManager.dirty = true;
        }

        if (PageManager.current === "market") {
            StatisticsManager.refreshCurrent();
        }

    }

    static reset() {

        ["minAr", "maxAr", "minNm", "maxNm", "minSzoba", "maxSzoba", "minEmelet", "maxEmelet"].forEach(id => {
            document.getElementById(id).value = "";
        });

        document.getElementById("allapot").value = "";
        FilterManager.keruletMS.clear(true);
        FilterManager.telepulesMS.clear(true);
        document.getElementById("keresoHely").value = "";
        document.getElementById("keresoJelleg").value = "";
        document.getElementById("hideDuplicates").checked = true;
        document.getElementById("onlyWithPhotos").checked = false;

        FilterManager.selectedSources = null;
        FilterManager.renderSources();

        FilterManager.apply();

    }

    // Az aktív szűrők emberi nyelven (a Piaci elemzés fejlécéhez)
    static describe() {

        const f = DataManager.filter;
        const chips = [];

        const varosNev = CityManager.displayName(f.varos || DataManager.currentCity);
        chips.push(`<i class="${Types.get(f.tipus).icon}"></i> ${Types.label(f.tipus)} · ${Types.ugyletLabel(f.ugylet)}`);
        chips.push(`<i class="fa-solid fa-city"></i> ${Utils.escape(varosNev)}`);

        if (f.minAr !== null || f.maxAr !== null) {
            chips.push(`${I18n.t("searchAr")}: ${f.minAr !== null ? Utils.num(f.minAr) : "…"} – ${f.maxAr !== null ? Utils.num(f.maxAr) : "…"}`);
        }

        if (f.minNm !== null || f.maxNm !== null) {
            chips.push(`m²: ${f.minNm !== null ? f.minNm : "…"} – ${f.maxNm !== null ? f.maxNm : "…"}`);
        }

        const tart = (a, b) => a !== null && b !== null && a === b ? `${a}` : `${a !== null ? a : "…"} – ${b !== null ? b : "…"}`;
        if (f.minSzoba !== null || f.maxSzoba !== null) chips.push(`${I18n.t("searchSzoba")}: ${tart(f.minSzoba, f.maxSzoba)}`);
        if (f.minEmelet !== null || f.maxEmelet !== null) chips.push(`${I18n.t("floorWordCap")}: ${tart(f.minEmelet, f.maxEmelet)}`);
        if (f.jelleg) chips.push(I18n.t("jelleg_" + f.jelleg));
        if (f.allapot) chips.push(`${I18n.t("allapot")}: ${Utils.allapotLabel(f.allapot)}`);
        const keruletek = f.keruletek && f.keruletek.length ? f.keruletek : (f.kerulet ? [f.kerulet] : []);
        const telepulesek = f.telepulesek && f.telepulesek.length ? f.telepulesek : (f.telepules ? [f.telepules] : []);
        if (keruletek.length) chips.push(`${I18n.t(keruletek.length > 1 ? "keruletekLabel" : "kerulet")}: ${Utils.escape(FilterManager.felsorol(keruletek.map(k => CityManager.keruletLabel(k, f.varos))))}`);
        if (telepulesek.length) chips.push(`${I18n.t("telepulesLabel")}: ${Utils.escape(FilterManager.felsorol(telepulesek.map(t => t === "_varos" ? I18n.t("telepulesVarosban") : CityManager.telepulesLabel(t))))}`);
        if (f.hely) chips.push(`${I18n.t("filterHely")}: ${Utils.escape(I18n.t("hely_" + f.hely))}`);

        if (f.sources !== null && f.sources !== undefined) {
            const nevek = [...f.sources].map(Sources.label).join(", ");
            chips.push(`${I18n.t("searchTabSources")}: ${Utils.escape(nevek || "–")}`);
        }

        return chips;

    }

    // "Lenin, Központ" / "Lenin, Központ, Csíki és 2 további"
    static felsorol(lista) {
        if (lista.length <= 3) return lista.join(", ");
        return I18n.f("listMore", { list: lista.slice(0, 3).join(", "), n: lista.length - 3 });
    }

    static isFiltered() {
        return FilterManager.describe().length > 2;
    }

}
