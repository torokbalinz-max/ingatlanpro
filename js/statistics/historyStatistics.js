class HistoryStatistics {

    static load() {

        fetch("/api/statistics")

        .then(r => r.json())

        .then(lista => {

            let html = `

                <h2>📈 Piaci ártrend</h2>

                <div class="card shadow">

                    <div class="card-body">

                        <canvas id="historyChart" height="120"></canvas>

                    </div>

                </div>

                <br>

            `;

            document.getElementById("statisticsContainer").innerHTML = html;

            const labels = lista.map(x =>
                new Date(x.created_at).toLocaleDateString()
            );

            const prices = lista.map(x =>
                Math.round(x.avg_price)
            );

            new Chart(

                document.getElementById("historyChart"),

                {

                    type: "line",

                    data: {

                        labels: labels,

                        datasets: [

                            {

                                label: "Átlag ár (€)",

                                data: prices,

                                borderWidth: 3,

                                tension: 0.3,

                                fill: false

                            }

                        ]

                    },

                    options: {

                        responsive: true,

                        plugins: {

                            legend: {

                                display: true

                            }

                        }

                    }

                }

            );

        });

    }

}