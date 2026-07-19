class ChartStatistics {

    static chart1 = null;
    static chart2 = null;
    static chart3 = null;

    static destroy() {

        if (ChartStatistics.chart1)
            ChartStatistics.chart1.destroy();

        if (ChartStatistics.chart2)
            ChartStatistics.chart2.destroy();

        if (ChartStatistics.chart3)
            ChartStatistics.chart3.destroy();

    }

    static render(lista) {

        this.destroy();

        // ===== ÁLLAPOT =====

        const allapotok = {};

        lista.forEach(i => {

            const nev = i.allapot || "Ismeretlen";

            allapotok[nev] = (allapotok[nev] || 0) + 1;

        });

        ChartStatistics.chart1 = new Chart(

            document.getElementById("stateChart"),

            {

                type: "pie",

                data: {

                    labels: Object.keys(allapotok),

                    datasets: [{

                        data: Object.values(allapotok)

                    }]

                }

            }

        );

    }

}