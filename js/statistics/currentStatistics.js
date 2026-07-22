class CurrentStatistics {

    static load() {

        const lista = DataManager.szurtIngatlanok;

        if (lista.length === 0) {

            document.getElementById("statisticsContainer").innerHTML = `
                <h2>📈 Jelenlegi piac</h2>
                <p>Nincs találat a jelenlegi szűrésre.</p>
            `;

            return;

        }

        ChartStatistics.destroy();

        let html = "";

        // ===== Dashboard =====

        html += DashboardStatistics.render(lista);

        // ===== Táblázatok =====

        html += StateStatistics.render(lista);

        html += RoomStatistics.render(lista);

        html += FloorStatistics.render(lista);

        // ===== Diagramok =====

        html += `

        <br>

        <h2 class="mb-3">📊 Diagramok</h2>

        <div class="row">

            <div class="col-lg-6">

                <div class="card shadow">

                    <div class="card-body">

                        <canvas id="stateChart"></canvas>

                    </div>

                </div>

            </div>

            <div class="col-lg-6">

                <div class="card shadow">

                    <div class="card-body">

                        <canvas id="roomChart"></canvas>

                    </div>

                </div>

            </div>

        </div>

        <br>

        <div class="card shadow">

            <div class="card-body">

                <canvas id="floorChart"></canvas>

            </div>

        </div>

        `;

        document.getElementById("statisticsContainer").innerHTML = html;

        ChartStatistics.render(lista);

    }

}