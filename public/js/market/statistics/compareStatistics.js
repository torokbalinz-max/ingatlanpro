// ============================================================
//  Piaci elemzés – Két mentett piaci állapot összevetése (Előzmények fül)
//  + közös segédek (változás %, jelvény). Az időszakok összevetése a
//  hirdetésekből az Ártrend fülön van (trendStatistics.js).
// ============================================================

class CompareStatistics {

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

    // Két mentett piaci állapot összevetése a megadott dobozba
    // (az Előzmények fülön: "Összevetés másik mentéssel")
    static renderInto(from, to, target) {

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

            // A régebbi legyen elöl
            if (a && b && new Date(a.created_at) > new Date(b.created_at)) {
                return CompareStatistics.renderInto(to, from, target);
            }

            target.innerHTML = html;

        });

    }

}
