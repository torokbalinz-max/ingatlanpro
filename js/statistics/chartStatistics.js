class ChartStatistics {

    static chart1 = null;
    static chart2 = null;
    static chart3 = null;
    static chart4 = null;

    static destroy() {

        if (ChartStatistics.chart1) ChartStatistics.chart1.destroy();
        if (ChartStatistics.chart2) ChartStatistics.chart2.destroy();
        if (ChartStatistics.chart3) ChartStatistics.chart3.destroy();
        if (ChartStatistics.chart4) ChartStatistics.chart4.destroy();

    }

    static render(lista) {

        this.destroy();

        // ================= ÁLLAPOT =================

        const allapotok = {};

        lista.forEach(i => {

            const nev = i.allapot ? I18n.translateStatValue(i.allapot) : I18n.t("unknownLabel");
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
                            text: I18n.t("chartAllapotTitle")
                        }
                    }
                }
            }
        );

        // ================= SZOBÁK =================

        const szobak = {};

        lista.forEach(i => {

            const nev = `${i.szobak} ${I18n.t("roomWord")}`;
            szobak[nev] = (szobak[nev] || 0) + 1;

        });

        ChartStatistics.chart2 = new Chart(
            document.getElementById("roomChart"),
            {
                type: "bar",
                data: {
                    labels: Object.keys(szobak),
                    datasets: [{
                        label: I18n.t("chartLegendProperties"),
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
                            text: I18n.t("chartRoomsTitle")
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
                nev = I18n.t("unknownLabel");
            else if (e <= 0)
                nev = I18n.t("groundFloorLabel");
            else if (e >= 4)
                nev = I18n.t("floorPlusLabel");
            else
                nev = `${e}. ${I18n.t("floorWord")}`;

            emeletek[nev] = (emeletek[nev] || 0) + 1;

        });

        ChartStatistics.chart3 = new Chart(
            document.getElementById("floorChart"),
            {
                type: "bar",
                data: {
                    labels: Object.keys(emeletek),
                    datasets: [{
                        label: I18n.t("chartLegendProperties"),
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
                            text: I18n.t("chartFloorsTitle")
                        }
                    }
                }
            }
        );

        // ================= KERÜLET =================

        const keruletChartEl = document.getElementById("keruletChart");

        if (keruletChartEl) {

            const keruletek = {};

            lista.forEach(i => {

                const nev = i.kerulet && i.kerulet.trim() !== ""
                    ? i.kerulet
                    : I18n.t("keruletNincsMegadva");

                keruletek[nev] = (keruletek[nev] || 0) + 1;

            });

            ChartStatistics.chart4 = new Chart(
                keruletChartEl,
                {
                    type: "doughnut",
                    data: {
                        labels: Object.keys(keruletek),
                        datasets: [{
                            data: Object.values(keruletek)
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
                                text: I18n.t("chartKeruletTitle")
                            }
                        }
                    }
                }
            );

        }

    }

}