class ChartStatistics {

    static chart1 = null;
    static chart2 = null;
    static chart3 = null;

    static destroy() {

        if (ChartStatistics.chart1) ChartStatistics.chart1.destroy();
        if (ChartStatistics.chart2) ChartStatistics.chart2.destroy();
        if (ChartStatistics.chart3) ChartStatistics.chart3.destroy();

    }

    static render(lista) {

        this.destroy();

        // ================= ÁLLAPOT =================

        const allapotok = {};

        lista.forEach(i => {

            const nev = i.allapot || "Ismeretlen";
            allapotok[nev] = (allapotok[nev] || 0) + 1;

        });

        ChartStatistics.chart1 = new Chart(
            document.getElementById("stateChart"),
            {
                type: "doughnut",
                data: {
                    labels: Object.keys(allapotok),
                    datasets: [{
                        data: Object.values(allapotok)
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: "bottom"
                        },
                        title: {
                            display: true,
                            text: "Állapot szerinti megoszlás"
                        }
                    }
                }
            }
        );

        // ================= SZOBÁK =================

        const szobak = {};

        lista.forEach(i => {

            const nev = i.szobak + " szoba";
            szobak[nev] = (szobak[nev] || 0) + 1;

        });

        ChartStatistics.chart2 = new Chart(
            document.getElementById("roomChart"),
            {
                type: "bar",
                data: {
                    labels: Object.keys(szobak),
                    datasets: [{
                        label: "Ingatlanok",
                        data: Object.values(szobak)
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: "Szobaszám szerinti megoszlás"
                        }
                    }
                }
            }
        );

        // ================= EMELET =================

        const emeletek = {};

        lista.forEach(i => {

            let nev;

            const e = parseInt(i.emelet);

            if (isNaN(e))
                nev = "Ismeretlen";
            else if (e <= 0)
                nev = "Földszint";
            else if (e >= 4)
                nev = "4+";
            else
                nev = e + ".";

            emeletek[nev] = (emeletek[nev] || 0) + 1;

        });

        ChartStatistics.chart3 = new Chart(
            document.getElementById("floorChart"),
            {
                type: "bar",
                data: {
                    labels: Object.keys(emeletek),
                    datasets: [{
                        label: "Ingatlanok",
                        data: Object.values(emeletek)
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: "Emelet szerinti megoszlás"
                        }
                    }
                }
            }
        );

    }

}