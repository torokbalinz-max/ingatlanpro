class CurrentStatistics {

    static load() {

        const lista = DataManager.szurtIngatlanok;

        if (lista.length === 0) {

            document.getElementById("statisticsContainer").innerHTML = `
                <div class="alert alert-warning">
                    <h3>${I18n.t("currentMarketTitle")}</h3>
                    <p>${I18n.t("currentNoResults")}</p>
                </div>
            `;

            return;

        }

        ChartStatistics.destroy();

        let html = "";

        // ================= DASHBOARD =================

        html += DashboardStatistics.render(lista);

        // ================= DIAGRAMOK =================

        html += `

        <div class="mt-5">

            <h2 class="statisticsTitle">

                <i class="fa-solid fa-chart-column"></i>

                ${I18n.t("chartsTitle")}

            </h2>

            <div class="row g-4">

                <div class="col-lg-6">

                    <div class="card statisticsChartCard">

                        <div class="card-header">

                            <h4>

                                <i class="fa-solid fa-chart-pie"></i>

                                ${I18n.t("chartAllapotTitle")}

                            </h4>

                        </div>

                        <div class="card-body">

                            <canvas id="stateChart"></canvas>

                        </div>

                    </div>

                </div>

                <div class="col-lg-6">

                    <div class="card statisticsChartCard">

                        <div class="card-header">

                            <h4>

                                <i class="fa-solid fa-bed"></i>

                                ${I18n.t("chartRoomsTitle")}

                            </h4>

                        </div>

                        <div class="card-body">

                            <canvas id="roomChart"></canvas>

                        </div>

                    </div>

                </div>

            </div>

            <div class="row g-4 mt-1">

                <div class="col-lg-6">

                    <div class="card statisticsChartCard">

                        <div class="card-header">

                            <h4>

                                <i class="fa-solid fa-building"></i>

                                ${I18n.t("chartFloorsTitle")}

                            </h4>

                        </div>

                        <div class="card-body">

                            <canvas id="floorChart"></canvas>

                        </div>

                    </div>

                </div>

                <div class="col-lg-6">

                    <div class="card statisticsChartCard">

                        <div class="card-header">

                            <h4>

                                <i class="fa-solid fa-map-location-dot"></i>

                                ${I18n.t("chartKeruletTitle")}

                            </h4>

                        </div>

                        <div class="card-body">

                            <canvas id="keruletChart"></canvas>

                        </div>

                    </div>

                </div>

            </div>

        </div>

        `;

        // ================= TÁBLÁZATOK =================

        html += `

        <div class="mt-5">

            <h2 class="statisticsTitle">

                <i class="fa-solid fa-table"></i>

                ${I18n.t("detailedAnalysisTitle")}

            </h2>

        </div>

        `;

        html += StateStatistics.render(lista);

        html += RoomStatistics.render(lista);

        html += FloorStatistics.render(lista);

        html += KeruletStatistics.render(lista);

        document.getElementById("statisticsContainer").innerHTML = html;

        ChartStatistics.render(lista);

    }

}