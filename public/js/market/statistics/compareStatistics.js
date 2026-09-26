// ============================================================
//  Piaci elemzés – Két mentett piaci állapot összehasonlítása
// ============================================================

class CompareStatistics {

    static load() {

        const container = document.getElementById("statisticsContainer");

        HistoryStatistics.fetchList().then(lista => {

            if (lista.length < 2) {

                container.innerHTML = `
                    <div class="emptyState">
                        <i class="fa-solid fa-scale-balanced"></i>
                        <h5>${I18n.t("compareNeedTwo")}</h5>
                        <p class="text-body-secondary">${I18n.t("historyEmpty")}</p>
                    </div>`;

                return;

            }

            const options = lista
                .map(s => `<option value="${s.id}">${Utils.escape(HistoryStatistics.label(s))}</option>`)
                .join("");

            container.innerHTML = `
                <div class="card mb-4">
                    <div class="card-body">
                        <p class="sectionNote">${I18n.t("compareNote")}</p>
                        <div class="row g-3 align-items-end">
                            <div class="col-md-5">
                                <label class="form-label">${I18n.t("compareFrom")}</label>
                                <select id="compareFrom" class="form-select">${options}</select>
                            </div>
                            <div class="col-md-5">
                                <label class="form-label">${I18n.t("compareTo")}</label>
                                <select id="compareTo" class="form-select">${options}</select>
                            </div>
                            <div class="col-md-2 d-grid">
                                <button id="btnCompare" class="btn btn-primary">${I18n.t("compareBtn")}</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="compareResult"></div>`;

            // Alapból: legrégebbi -> legújabb
            document.getElementById("compareFrom").value = lista[lista.length - 1].id;
            document.getElementById("compareTo").value = lista[0].id;

            document.getElementById("btnCompare").onclick = () => CompareStatistics.compare();

            CompareStatistics.compare();

        });

    }

    static change(regi, uj) {
        if (!regi || !uj) return null;
        return (uj / regi - 1) * 100;
    }

    static changeBadge(d) {
        if (d === null || isNaN(d)) return "-";
        const cls = d > 0.5 ? "up" : d < -0.5 ? "down" : "flat";
        const icon = d > 0.5 ? "fa-arrow-trend-up" : d < -0.5 ? "fa-arrow-trend-down" : "fa-minus";
        return `<span class="changeBadge ${cls}"><i class="fa-solid ${icon}"></i> ${Utils.pct(d)}</span>`;
    }

    static compare() {

        const from = document.getElementById("compareFrom").value;
        const to = document.getElementById("compareTo").value;

        Promise.all([
            fetch("/api/statistics/" + from).then(r => r.json()),
            fetch("/api/statistics/" + to).then(r => r.json())
        ])
        .then(([regi, uj]) => {

            const a = regi.snapshot;
            const b = uj.snapshot;

            let html = "";

            if ((a.varos || "") !== (b.varos || "")) {
                html += `<div class="alert alert-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${I18n.t("compareDifferentCity")}</div>`;
            }

            const kartya = (label, x, y, fmt) => `
                <div class="col-md-4">
                    <div class="compareCard">
                        <small>${label}</small>
                        <div class="compareValues">
                            <span>${fmt(x)}</span>
                            <i class="fa-solid fa-arrow-right"></i>
                            <b>${fmt(y)}</b>
                        </div>
                        ${CompareStatistics.changeBadge(CompareStatistics.change(x, y))}
                    </div>
                </div>`;

            html += `
                <div class="row g-3 mb-4">
                    ${kartya(I18n.t("dashLabelCount"), a.property_count, b.property_count, v => Utils.num(v))}
                    ${kartya(I18n.t("compareAvgPrice"), a.avg_price, b.avg_price, Utils.eur)}
                    ${kartya(I18n.t("compareAvgPriceNm"), a.avg_price_nm, b.avg_price_nm, Utils.eurNm)}
                </div>`;

            [
                ["allapot", "compareByAllapot"],
                ["szobak", "compareByRooms"],
                ["emelet", "compareByFloor"],
                ["kerulet", "compareByKerulet"]
            ].forEach(([cat, title]) => {

                const regiRows = HistoryStatistics.normalizeGroups(regi.groups, cat);
                const ujRows = HistoryStatistics.normalizeGroups(uj.groups, cat);

                const kulcsok = [...new Set([...regiRows, ...ujRows].map(r => r.key))];

                if (!kulcsok.length) return;

                html += `
                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0">${I18n.t(title)}</h5></div>
                        <div class="card-body">
                            <table class="table table-sm statTable mb-0">
                                <thead>
                                    <tr>
                                        <th>${I18n.t("statsColCategory")}</th>
                                        <th class="text-end">${I18n.t("compareOldNm")}</th>
                                        <th class="text-end">${I18n.t("compareNewNm")}</th>
                                        <th class="text-end">${I18n.t("compareChange")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${kulcsok.map(k => {
                                        const r = regiRows.find(x => x.key === k);
                                        const u = ujRows.find(x => x.key === k);
                                        return `
                                            <tr>
                                                <td>${Utils.escape((u || r).label)}</td>
                                                <td class="text-end">${r ? Utils.eurNm(r.avgArNm) : "-"}</td>
                                                <td class="text-end">${u ? Utils.eurNm(u.avgArNm) : "-"}</td>
                                                <td class="text-end">${CompareStatistics.changeBadge(r && u ? CompareStatistics.change(r.avgArNm, u.avgArNm) : null)}</td>
                                            </tr>`;
                                    }).join("")}
                                </tbody>
                            </table>
                        </div>
                    </div>`;

            });

            document.getElementById("compareResult").innerHTML = html;

        });

    }

}
