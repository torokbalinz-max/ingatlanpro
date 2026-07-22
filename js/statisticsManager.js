class StatisticsManager {

    static init() {

    const buttons = document.querySelectorAll(".statisticsButton");

    function activate(buttonId){

        buttons.forEach(b => b.classList.remove("active"));

        document.getElementById(buttonId).classList.add("active");

    }

    document.getElementById("btnCurrentStatistics").onclick = () => {

        activate("btnCurrentStatistics");
        StatisticsManager.loadCurrent();

    };

    document.getElementById("btnHistoryStatistics").onclick = () => {

        activate("btnHistoryStatistics");
        StatisticsManager.loadHistory();

    };

    document.getElementById("btnCompareStatistics").onclick = () => {

        activate("btnCompareStatistics");
        CompareStatistics.load();

    };

    document.getElementById("btnTrend").onclick = () => {

        activate("btnTrend");
        TrendStatistics.load();

    };

}

    static load() {

    fetch("/api/statistics")
        .then(r => r.json())
        .then(lista => {

            let html = `

                <div style="margin-bottom:20px;">

                    <label><b>Piaci mentés:</b></label>

                    <div class="d-flex gap-2">

                        <select
                            id="snapshotSelect"
                            class="form-select">

            `;

            lista.forEach(s => {

                html += `
                    <option value="${s.id}">
                        ${new Date(s.created_at).toLocaleString()}
                    </option>
                `;

            });

            html += `

                        </select>

                        <button
                            id="btnLoadSnapshot"
                            class="btn btn-primary">

                            Betöltés

                        </button>

                        <button
                            id="btnDeleteSnapshot"
                            class="btn btn-danger">

                            🗑️

                        </button>

                    </div>

                </div>

                <div id="snapshotContent"></div>

            `;

            document.getElementById("statisticsContainer").innerHTML = html;

            document.getElementById("btnLoadSnapshot").onclick = () => {

                StatisticsManager.loadSnapshot(
                    document.getElementById("snapshotSelect").value
                );

            };

            document.getElementById("btnDeleteSnapshot").onclick = () => {

                const id =
                    document.getElementById("snapshotSelect").value;

                if (!confirm("Biztosan törölni szeretnéd ezt a mentést?"))
                    return;

                fetch("/api/statistics/" + id, {

                    method: "DELETE"

                })
                .then(r => r.json())
                .then(() => {

                    alert("Mentés törölve.");

                    StatisticsManager.load();

                });

            };

            if (lista.length > 0) {

                StatisticsManager.loadSnapshot(lista[0].id);

            }

        });

}

    static loadSnapshot(id) {

        fetch("/api/statistics/" + id)
            .then(r => r.json())
            .then(data => {

                const s = data.snapshot;

                const allapotok = data.groups.filter(g => g.category === "allapot");
                const szobak = data.groups.filter(g => g.category === "szobak");
                const emeletek = data.groups.filter(g => g.category === "emelet");

                let html = `

                    <div class="statisticsGrid">

                        <div class="statCard">
                            <h3>🏠 Ingatlanok</h3>
                            <h1>${s.property_count}</h1>
                        </div>

                        <div class="statCard">
                            <h3>💶 Átlag ár</h3>
                            <h1>${Math.round(s.avg_price).toLocaleString()} €</h1>
                        </div>

                        <div class="statCard">
                            <h3>💰 Átlag €/m²</h3>
                            <h1>${Math.round(s.avg_price_nm)}</h1>
                        </div>

                    </div>

                    <br><br>

                    <h2>🔧 Állapot szerinti elemzés</h2>

                    <table class="statTable">

                        <tr>
                            <th>Állapot</th>
                            <th>Darab</th>
                            <th>Átlag ár</th>
                            <th>Átlag €/m²</th>
                        </tr>

                `;

                allapotok.forEach(g => {

                    html += `
                        <tr>
                            <td>${g.value}</td>
                            <td>${g.property_count}</td>
                            <td>${Math.round(g.avg_price).toLocaleString()} €</td>
                            <td>${Math.round(g.avg_price_nm)} €/m²</td>
                        </tr>
                    `;

                });

                html += `

                    </table>

                    <br><br>

                    <h2>🛏 Szobaszám szerinti elemzés</h2>

                    <table class="statTable">

                        <tr>
                            <th>Szobák</th>
                            <th>Darab</th>
                            <th>Átlag ár</th>
                            <th>Átlag €/m²</th>
                        </tr>

                `;

                szobak.forEach(g => {

                    html += `
                        <tr>
                            <td>${g.value}</td>
                            <td>${g.property_count}</td>
                            <td>${Math.round(g.avg_price).toLocaleString()} €</td>
                            <td>${Math.round(g.avg_price_nm)} €/m²</td>
                        </tr>
                    `;

                });

                html += `

                    </table>

                    <br><br>

                    <h2>🏢 Emelet szerinti elemzés</h2>

                    <table class="statTable">

                        <tr>
                            <th>Emelet</th>
                            <th>Darab</th>
                            <th>Átlag ár</th>
                            <th>Átlag €/m²</th>
                        </tr>

                `;

                emeletek.forEach(g => {

                    html += `
                        <tr>
                            <td>${g.value}</td>
                            <td>${g.property_count}</td>
                            <td>${Math.round(g.avg_price).toLocaleString()} €</td>
                            <td>${Math.round(g.avg_price_nm)} €/m²</td>
                        </tr>
                    `;

                });

                html += `</table>`;

                document.getElementById("snapshotContent").innerHTML = html;

            });

    }

    static loadCurrent() {
        CurrentStatistics.load();
    }

    static loadHistory() {
        StatisticsManager.load();
    }

}