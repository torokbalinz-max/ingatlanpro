// ============================================================
//  Kereső: város, paraméterek, hirdetési oldal (forrás)
// ============================================================

class FilterManager {

    // null = minden forrás; különben a kiválasztott forrás-kulcsok
    static selectedSources = null;
    static tipus = "lakas";
    static ugylet = "elado";

    static renderTypes() {

        Types.renderGrid("searchTypeGrid", FilterManager.tipus, t => {
            FilterManager.tipus = t;
            FilterManager.onTypeChange();
            FilterManager.apply();
        });

    }

    // Típus/ügylet váltáskor a nem értelmes mezők eltűnnek
    static onTypeChange() {

        Types.applyFields("#searchAside", FilterManager.tipus);

        document.getElementById("searchArLabel").innerText =
            I18n.t(FilterManager.ugylet === "kiado" ? "searchArRent" : "searchAr");

        document.getElementById("searchNmLabel").innerText =
            I18n.t(FilterManager.tipus === "telek" ? "searchTelekNm" : "searchNm");

    }

    static init() {

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
        ["allapot", "keresoKerulet"].forEach(id => {
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
            document.getElementById("keresoKerulet").value = "";
            FilterManager.selectedSources = null;

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
            minEmelet: n("minEmelet"),
            allapot: document.getElementById("allapot").value,
            kerulet: document.getElementById("keresoKerulet").value,
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

        if (f.minEmelet !== null) {
            const e = Utils.emeletSzam(i.emelet);
            if (e !== null && e < f.minEmelet) return false;
        }

        if (f.allapot && Utils.normAllapot(i.allapot) !== f.allapot) return false;

        if (f.kerulet && (i.kerulet || "") !== f.kerulet) return false;

        if (f.sources !== null && !(i.forrasok || [i.forras]).some(k => f.sources.has(k))) return false;

        return true;

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
        if (PageManager.current === "properties") {
            MapManager.load(lista);
        } else {
            MapManager.dirty = true;
        }

        if (PageManager.current === "market") {
            StatisticsManager.refreshCurrent();
        }

    }

    static reset() {

        ["minAr", "maxAr", "minNm", "maxNm", "minSzoba", "minEmelet"].forEach(id => {
            document.getElementById(id).value = "";
        });

        document.getElementById("allapot").value = "";
        document.getElementById("keresoKerulet").value = "";
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

        if (f.minSzoba !== null) chips.push(`${I18n.t("minSzoba")}: ${f.minSzoba}`);
        if (f.minEmelet !== null) chips.push(`${I18n.t("minEmelet")}: ${f.minEmelet}`);
        if (f.allapot) chips.push(`${I18n.t("allapot")}: ${Utils.allapotLabel(f.allapot)}`);
        if (f.kerulet) chips.push(`${I18n.t("kerulet")}: ${Utils.escape(f.kerulet)}`);

        if (f.sources !== null && f.sources !== undefined) {
            const nevek = [...f.sources].map(Sources.label).join(", ");
            chips.push(`${I18n.t("searchTabSources")}: ${Utils.escape(nevek || "–")}`);
        }

        return chips;

    }

    static isFiltered() {
        return FilterManager.describe().length > 2;
    }

}
