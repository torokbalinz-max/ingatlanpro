class TrendStatistics {

    static load() {

        document.getElementById("statisticsContainer").innerHTML = `

            <h2>${I18n.t("trendTitle")}</h2>

            <br>

            <div class="row mb-3">

                <div class="col-md-3">
                    <label>${I18n.t("trendFrom")}</label>
                    <input type="date" id="trendFrom" class="form-control">
                </div>

                <div class="col-md-3">
                    <label>${I18n.t("trendTo")}</label>
                    <input type="date" id="trendTo" class="form-control">
                </div>

                <div class="col-md-3">
                    <label>${I18n.t("trendIndicator")}</label>

                    <select id="trendType" class="form-select">

                        <option value="avg_price_nm">${I18n.t("trendOptAvgPriceNm")}</option>
                        <option value="avg_price">${I18n.t("trendOptAvgPrice")}</option>
                        <option value="property_count">${I18n.t("trendOptCount")}</option>

                    </select>

                </div>

            </div>

            <div class="card">

                <div class="card-body">

                    <canvas id="trendChart"></canvas>

                </div>

            </div>

        `;

        document.getElementById("trendFrom").onchange = () => {

            TrendStatistics.draw();

        };

        document.getElementById("trendTo").onchange = () => {

            TrendStatistics.draw();

        };

        document.getElementById("trendType").onchange = () => {

            TrendStatistics.draw();

        };

        TrendStatistics.draw();

    }

    static draw() {

        fetch("/api/statistics/trend")

        .then(r => r.json())

        .then(lista => {

            const from = document.getElementById("trendFrom").value;
            const to = document.getElementById("trendTo").value;
            const type = document.getElementById("trendType").value;

            let chartLabel = "";

            switch(type){

                case "avg_price_nm":
                    chartLabel = I18n.t("trendOptAvgPriceNm");
                    break;

                case "avg_price":
                    chartLabel = I18n.t("trendOptAvgPrice") + " (€)";
                    break;

                case "property_count":
                    chartLabel = I18n.t("trendOptCount");
                    break;

            }

            let adatok = lista;

            if(from){

                adatok = adatok.filter(x => x.created_at >= from);

            }

            if(to){

                adatok = adatok.filter(x => x.created_at <= to + "T23:59:59");

            }

            const labels = adatok.map(x =>
                new Date(x.created_at).toLocaleDateString()
            );

            const values = adatok.map(x =>
                Number(x[type])
            );

            if (
    window.trendChart &&
    typeof window.trendChart.destroy === "function"
) {
    window.trendChart.destroy();
}

            const ctx = document.getElementById("trendChart").getContext("2d");

window.trendChart = new Chart(ctx, {

                    type: "line",

                    data: {

                        labels,

                        datasets: [

                            {

                                label: chartLabel,

                                data: values,

                                borderWidth: 3,

                                tension: 0.35,

                                fill: false

                            }
                        ]

                    },

                    options: {

    responsive: true,

    maintainAspectRatio: false,

    plugins: {

        legend: {

            display: true

        }

    },

    scales: {

        y: {

            beginAtZero: false

        }

    }

}

                }

            );

        });

    }

}