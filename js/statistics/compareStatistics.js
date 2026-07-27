class CompareStatistics {

    static load() {

        fetch("/api/statistics")

        .then(r => r.json())

        .then(lista => {

            let html = `

                <h2>${I18n.t("compareTitle")}</h2>

                <br>

                <div class="row">

                    <div class="col-md-5">

                        <label>${I18n.t("compareFrom")}</label>

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

                        <label>${I18n.t("compareTo")}</label>

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

                            ${I18n.t("compareBtn")}

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

                    <h3>${I18n.t("compareAvgPrice")}</h3>

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

                    <h3>${I18n.t("compareAvgPriceNm")}</h3>

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
        // ===============================
// Állapot szerinti összehasonlítás
// ===============================

html += `

<br><br>

<h2>${I18n.t("compareByAllapot")}</h2>

<table class="statTable">

<tr>

    <th>${I18n.t("statsColAllapot")}</th>

    <th>${I18n.t("compareOldNm")}</th>

    <th>${I18n.t("compareNewNm")}</th>

    <th>${I18n.t("compareChange")}</th>

</tr>

`;

const oldAllapot = oldData.groups.filter(g => g.category === "allapot");
const newAllapot = newData.groups.filter(g => g.category === "allapot");

oldAllapot.forEach(oldGroup => {

    const uj = newAllapot.find(g => g.value === oldGroup.value);

    if (!uj)
        return;

    const diff =
        ((uj.avg_price_nm - oldGroup.avg_price_nm)
        / oldGroup.avg_price_nm * 100);

    const nyil =
        diff >= 0 ? "🟢" : "🔴";

    html += `

        <tr>

            <td>${I18n.translateStatValue(oldGroup.value)}</td>

            <td>${Math.round(oldGroup.avg_price_nm)}</td>

            <td>${Math.round(uj.avg_price_nm)}</td>

            <td>

                ${nyil}
                ${diff.toFixed(1)} %

            </td>

        </tr>

    `;

});

html += "</table>";
html += `

<br><br>

<h2>${I18n.t("compareByRooms")}</h2>

<table class="statTable">

<tr>

    <th>${I18n.t("statsColSzobak")}</th>

    <th>${I18n.t("compareOldNm")}</th>

    <th>${I18n.t("compareNewNm")}</th>

    <th>${I18n.t("compareChange")}</th>

</tr>

`;

const oldRooms = oldData.groups.filter(g => g.category === "szobak");
console.log(oldData.groups);
console.log(oldRooms);
const newRooms = newData.groups.filter(g => g.category === "szobak");

oldRooms.forEach(oldGroup => {

    const uj = newRooms.find(g => g.value == oldGroup.value);

    if (!uj) return;

    const diff =
        ((uj.avg_price_nm - oldGroup.avg_price_nm)
        / oldGroup.avg_price_nm * 100);

    html += `

        <tr>

            <td>${oldGroup.value}</td>

            <td>${Math.round(oldGroup.avg_price_nm)}</td>

            <td>${Math.round(uj.avg_price_nm)}</td>

            <td>${diff >= 0 ? "🟢" : "🔴"} ${diff.toFixed(1)} %</td>

        </tr>

    `;

});

html += "</table>";
html += `

<br><br>

<h2>${I18n.t("compareByFloor")}</h2>

<table class="statTable">

<tr>

    <th>${I18n.t("statsColEmelet")}</th>

    <th>${I18n.t("compareOldNm")}</th>

    <th>${I18n.t("compareNewNm")}</th>

    <th>${I18n.t("compareChange")}</th>

</tr>

`;

const oldFloors = oldData.groups.filter(g => g.category === "emelet");
const newFloors = newData.groups.filter(g => g.category === "emelet");

oldFloors.forEach(oldGroup => {

    const uj = newFloors.find(g => g.value === oldGroup.value);

    if (!uj) return;

    const diff =
        ((uj.avg_price_nm - oldGroup.avg_price_nm)
        / oldGroup.avg_price_nm * 100);

    html += `

        <tr>

            <td>${I18n.translateStatValue(oldGroup.value)}</td>

            <td>${Math.round(oldGroup.avg_price_nm)}</td>

            <td>${Math.round(uj.avg_price_nm)}</td>

            <td>${diff >= 0 ? "🟢" : "🔴"} ${diff.toFixed(1)} %</td>

        </tr>

    `;

});

html += "</table>";
html += `

<br><br>

<h2>${I18n.t("compareByKerulet")}</h2>

<table class="statTable">

<tr>

    <th>${I18n.t("colKerulet")}</th>

    <th>${I18n.t("compareOldNm")}</th>

    <th>${I18n.t("compareNewNm")}</th>

    <th>${I18n.t("compareChange")}</th>

</tr>

`;

const oldKeruletek = oldData.groups.filter(g => g.category === "kerulet");
const newKeruletek = newData.groups.filter(g => g.category === "kerulet");

oldKeruletek.forEach(oldGroup => {

    const uj = newKeruletek.find(g => g.value === oldGroup.value);

    if (!uj) return;

    const diff =
        ((uj.avg_price_nm - oldGroup.avg_price_nm)
        / oldGroup.avg_price_nm * 100);

    html += `

        <tr>

            <td>${I18n.translateStatValue(oldGroup.value)}</td>

            <td>${Math.round(oldGroup.avg_price_nm)}</td>

            <td>${Math.round(uj.avg_price_nm)}</td>

            <td>${diff >= 0 ? "🟢" : "🔴"} ${diff.toFixed(1)} %</td>

        </tr>

    `;

});

html += "</table>";

        document.getElementById("compareResult").innerHTML = html;

    });

}

}