class StatisticsManager {

    static init() {

        document.getElementById("btnCurrentStatistics").onclick = () => {

            StatisticsManager.loadCurrent();

        };

        document.getElementById("btnHistoryStatistics").onclick = () => {

            StatisticsManager.loadHistory();

        };

        document.getElementById("btnCompareStatistics").onclick = () => {

            CompareStatistics.load();

        };

    }

    static load() {

        fetch("/api/statistics")
        .then(r => r.json())
        .then(lista => {

            let html = `

                <div style="margin-bottom:20px;">

                    <label><b>Piaci mentés:</b></label>

                    <select id="snapshotSelect">

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

                    <button id="btnLoadSnapshot">
                        Betöltés
                    </button>

                </div>

                <div id="snapshotContent"></div>

            `;

            document.getElementById("statisticsContainer").innerHTML = html;

            document.getElementById("btnLoadSnapshot").onclick = () => {

                StatisticsManager.loadSnapshot(
                    document.getElementById("snapshotSelect").value
                );

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

            let html = `

                <div class="statCard">

                    <h2>${new Date(s.created_at).toLocaleString()}</h2>

                    <hr>

                    <p><b>Ingatlanok:</b> ${s.property_count}</p>

                    <p><b>Átlag ár:</b> ${Math.round(s.avg_price).toLocaleString()} €</p>

                    <p><b>Átlag €/m²:</b> ${Math.round(s.avg_price_nm)} €/m²</p>

                </div>

                <br>

                <table class="statTable">

                    <tr>

                        <th>Állapot</th>

                        <th>Darab</th>

                        <th>Átlag ár</th>

                        <th>€/m²</th>

                    </tr>

            `;

            data.groups.forEach(g => {

                html += `

                    <tr>

                        <td>${g.value}</td>

                        <td>${g.property_count}</td>

                        <td>${Math.round(g.avg_price).toLocaleString()} €</td>

                        <td>${Math.round(g.avg_price_nm)} €/m²</td>

                    </tr>

                `;

            });

            html += "</table>";

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