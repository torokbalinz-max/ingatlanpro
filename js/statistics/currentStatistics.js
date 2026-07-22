class CurrentStatistics {

    static load() {

        const lista = DataManager.szurtIngatlanok;

        if (lista.length === 0) {

            document.getElementById("statisticsContainer").innerHTML = `
                <div class="alert alert-warning">
                    <h3>📈 Jelenlegi piac</h3>
                    <p>Nincs találat a jelenlegi szűrésre.</p>
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

                Piaci diagramok

            </h2>

            <div class="row g-4">

                <div class="col-lg-6">

                    <div class="card statisticsChartCard">

                        <div class="card-header">

                            <h4>

                                <i class="fa-solid fa-chart-pie"></i>

                                Állapot szerinti eloszlás

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

                                Szobaszám szerinti eloszlás

                            </h4>

                        </div>

                        <div class="card-body">

                            <canvas id="roomChart"></canvas>

                        </div>

                    </div>

                </div>

            </div>

            <div class="mt-4">

                <div class="card statisticsChartCard">

                    <div class="card-header">

                        <h4>

                            <i class="fa-solid fa-building"></i>

                            Emeletek megoszlása

                        </h4>

                    </div>

                    <div class="card-body">

                        <canvas id="floorChart"></canvas>

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

                Részletes elemzések

            </h2>

        </div>

        `;

        html += StateStatistics.render(lista);

        html += RoomStatistics.render(lista);

        html += FloorStatistics.render(lista);

        document.getElementById("statisticsContainer").innerHTML = html;

        ChartStatistics.render(lista);

    }

}