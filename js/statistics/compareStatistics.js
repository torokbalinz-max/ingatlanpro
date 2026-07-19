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

    static compare(){

        alert("Következő lépésben itt fogjuk kiszámolni a különbségeket.");

    }

}