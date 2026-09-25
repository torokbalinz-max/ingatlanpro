// ============================================================
//  Piaci elemzés – Ártrend a mentett piaci állapotokból
// ============================================================

class TrendStatistics {

    static data = [];

    static load() {

        const container = document.getElementById("statisticsContainer");

        fetch("/api/statistics/trend")
            .then(r => r.json())
            .then(lista => {

                TrendStatistics.data = lista;

                const varosok = [...new Set(lista.map(s => s.varos || ""))];
                const alap = varosok.includes(DataManager.currentCity) ? DataManager.currentCity : (varosok[0] ?? "");

                container.innerHTML = `
                    <div class="card mb-4">
                        <div class="card-body">
                            <p class="sectionNote">${I18n.t("trendNote")}</p>
                            <div class="row g-3">
                                <div class="col-md-3">
                                    <label class="form-label">${I18n.t("detailVaros")}</label>
                                    <select id="trendCity" class="form-select">
                                        ${varosok.map(v => `<option value="${Utils.escape(v)}">${Utils.escape(v ? CityManager.displayName(v) : I18n.t("allCities"))}</option>`).join("")}
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">${I18n.t("trendIndicator")}</label>
                                    <select id="trendType" class="form-select">
                                        <option value="avg_price_nm">${I18n.t("trendOptAvgPriceNm")}</option>
                                        <option value="avg_price">${I18n.t("trendOptAvgPrice")}</option>
                                        <option value="property_count">${I18n.t("trendOptCount")}</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">${I18n.t("trendFrom")}</label>
                                    <input type="date" id="trendFrom" class="form-control">
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">${I18n.t("trendTo")}</label>
                                    <input type="date" id="trendTo" class="form-control">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-body">
                            <div id="trendSummary" class="mb-3"></div>
                            <div class="chartBox tall"><canvas id="trendChart"></canvas></div>
                        </div>
                    </div>`;

                document.getElementById("trendCity").value = alap;

                ["trendCity", "trendType", "trendFrom", "trendTo"].forEach(id => {
                    document.getElementById(id).onchange = () => TrendStatistics.draw();
                });

                TrendStatistics.draw();

            });

    }

    static draw() {

        ChartStatistics.destroy();

        const varos = document.getElementById("trendCity").value;
        const from = document.getElementById("trendFrom").value;
        const to = document.getElementById("trendTo").value;
        const type = document.getElementById("trendType").value;

        // Csak a keresésben kiválasztott típusú mentések (a régiek lakás/eladó)
        let adatok = TrendStatistics.data.filter(x =>
            (x.varos || "") === varos &&
            (x.tipus || "lakas") === FilterManager.tipus &&
            (x.ugylet || "elado") === FilterManager.ugylet);

        if (from) adatok = adatok.filter(x => x.created_at >= from);
        if (to) adatok = adatok.filter(x => x.created_at <= to + "T23:59:59");

        const fmt = type === "avg_price" ? Utils.eur : type === "avg_price_nm" ? Utils.eurNm : v => Utils.num(v);

        const summary = document.getElementById("trendSummary");

        if (adatok.length < 2) {
            summary.innerHTML = `<div class="alert alert-info mb-0">${I18n.t("trendNeedMore")}</div>`;
        } else {
            const elso = Number(adatok[0][type]);
            const utolso = Number(adatok[adatok.length - 1][type]);
            summary.innerHTML = `
                <span class="me-2">${fmt(elso)} <i class="fa-solid fa-arrow-right mx-1"></i> <b>${fmt(utolso)}</b></span>
                ${CompareStatistics.changeBadge(CompareStatistics.change(elso, utolso))}
                <span class="text-body-secondary small ms-2">(${adatok.length} ${I18n.t("trendPoints")})</span>`;
        }

        const labels = adatok.map(x => new Date(x.created_at).toLocaleDateString(Utils.locale()));
        const values = adatok.map(x => Math.round(Number(x[type])));

        const label = document.querySelector(`#trendType option[value="${type}"]`).innerText;

        ChartStatistics.line("trendChart", labels, values, label, fmt);

    }

}
