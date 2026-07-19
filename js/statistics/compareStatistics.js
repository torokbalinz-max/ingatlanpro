class CompareStatistics {

    static load() {

        fetch("/api/statistics")

        .then(r => r.json())

        .then(lista => {

            let html = `

                <h2>📊 Piaci összehasonlítás</h2>

                <br>

                <div class="row">

                    <div class="col-md-5">

                        <label>Első mentés</label>

                        <select id="compareFrom" class="form-select">

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

                    </div>

                    <div class="col-md-5">

                        <label>Második mentés</label>

                        <select id="compareTo" class="form-select">

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

                    </div>

                    <div class="col-md-2">

                        <br>

                        <button
                            id="btnCompare"
                            class="btn btn-success w-100">

                            Összehasonlítás

                        </button>

                    </div>

                </div>

                <hr>

                <div id="compareResult"></div>

            `;

            document.getElementById("statisticsContainer").innerHTML = html;

            document.getElementById("btnCompare").onclick = () => {

                CompareStatistics.compare();

            };

        });

    }

    static compare() {

    const from =
        document.getElementById("compareFrom").value;

    const to =
        document.getElementById("compareTo").value;

    Promise.all([

        fetch("/api/statistics/" + from).then(r => r.json()),

        fetch("/api/statistics/" + to).then(r => r.json())

    ])

    .then(([oldData, newData]) => {

        const oldStat = oldData.snapshot;
        const newStat = newData.snapshot;

        const arValtozas =
            ((newStat.avg_price - oldStat.avg_price)
            / oldStat.avg_price * 100);

        const nmValtozas =
            ((newStat.avg_price_nm - oldStat.avg_price_nm)
            / oldStat.avg_price_nm * 100);

        let html = `

            <div class="statisticsGrid">

                <div class="statCard">

                    <h3>Átlag ár</h3>

                    <h2>
                        ${Math.round(oldStat.avg_price).toLocaleString()} €
                    </h2>

                    <h1>

                        ➜

                    </h1>

                    <h2>
                        ${Math.round(newStat.avg_price).toLocaleString()} €
                    </h2>

                    <hr>

                    <h2>

                        ${arValtozas.toFixed(1)} %

                    </h2>

                </div>

                <div class="statCard">

                    <h3>Átlag €/m²</h3>

                    <h2>
                        ${Math.round(oldStat.avg_price_nm)}
                    </h2>

                    <h1>

                        ➜

                    </h1>

                    <h2>
                        ${Math.round(newStat.avg_price_nm)}
                    </h2>

                    <hr>

                    <h2>

                        ${nmValtozas.toFixed(1)} %

                    </h2>

                </div>

            </div>

        `;

        document.getElementById("compareResult").innerHTML = html;

    });

}

}