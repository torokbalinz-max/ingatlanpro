// ============================================================
//  Piaci elemzés – Előzmények (mentett piaci állapotok)
// ============================================================

class HistoryStatistics {

    static snapshots = [];

    // Mentett snapshot neve a listákban
    static label(s) {
        const datum = new Date(s.created_at).toLocaleString(Utils.locale(), {
            year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
        });
        const varos = s.varos ? CityManager.displayName(s.varos) : I18n.t("allCities");
        return `${datum} · ${varos} · ${s.property_count} ${I18n.t("pcsWord")}`;
    }

    static fetchList() {
        return fetch("/api/statistics")
            .then(r => r.json())
            .then(lista => {
                HistoryStatistics.snapshots = lista;
                return lista;
            });
    }

    // A régi mentésekben lévő nyers értékek (pl. "jó*", "Földszint")
    // egységesítése és összevonása
    static normalizeGroups(groups, category) {

        const m = new Map();

        groups.filter(g => g.category === category).forEach(g => {

            let key;
            let label;
            let order = 0;

            if (category === "allapot") {
                key = Utils.normAllapot(g.value);
                label = Utils.allapotLabel(g.value);
                order = Utils.allapotRank(g.value);
            } else if (category === "szobak") {
                const n = Number(g.value) || 0;
                key = n <= 0 ? "?" : String(Math.min(n, 4));
                label = key === "?" ? I18n.t("unknownLabel") : key === "4" ? I18n.t("roomsPlusLabel") : I18n.f("roomsLabel", { n: key });
                order = key === "?" ? 99 : Number(key);
            } else {
                key = g.value;
                label = I18n.translateStatValue(g.value);
                if (category === "emelet") {
                    const v = String(g.value || "");
                    order = v === "Földszint" ? 0 : v.startsWith("4+") ? 4 : (parseInt(v, 10) || 99);
                } else {
                    order = (g.value === "Nincs megadva") ? 1 : 0;
                }
            }

            const db = Number(g.property_count) || 0;

            if (!m.has(key)) m.set(key, { key, label, order, count: 0, sumAr: 0, sumNm: 0 });

            const x = m.get(key);
            x.count += db;
            x.sumAr += (Number(g.avg_price) || 0) * db;
            x.sumNm += (Number(g.avg_price_nm) || 0) * db;

        });

        return [...m.values()].sort((a, b) => (a.order - b.order) || (b.count - a.count)).map(x => ({
            key: x.key,
            label: x.label,
            count: x.count,
            avgAr: x.count ? x.sumAr / x.count : null,
            avgArNm: x.count ? x.sumNm / x.count : null
        }));

    }

    static load() {

        const container = document.getElementById("statisticsContainer");

        HistoryStatistics.fetchList().then(lista => {

            const varosNev = CityManager.displayName(DataManager.currentCity);

            let html = `
                <div class="card mb-4">
                    <div class="card-body d-flex flex-wrap align-items-center gap-3">
                        <div class="flex-fill">
                            <h5 class="mb-1"><i class="fa-solid fa-camera"></i> ${I18n.t("historySaveTitle")}</h5>
                            <p class="sectionNote mb-0">${I18n.t("historySaveNote")}</p>
                        </div>
                        <button id="btnSaveSnapshot" class="btn btn-success">
                            <i class="fa-solid fa-floppy-disk"></i> ${I18n.f("historySaveBtn", { city: Utils.escape(varosNev) })}
                        </button>
                    </div>
                </div>`;

            if (lista.length === 0) {

                html += `
                    <div class="emptyState">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                        <h5>${I18n.t("historyEmpty")}</h5>
                    </div>`;

                container.innerHTML = html;
                HistoryStatistics.bindSave();
                return;

            }

            html += `
                <div class="d-flex flex-wrap gap-2 mb-4">
                    <select id="snapshotSelect" class="form-select" style="max-width:480px;">
                        ${lista.map(s => `<option value="${s.id}">${Utils.escape(HistoryStatistics.label(s))}</option>`).join("")}
                    </select>
                    <button id="btnDeleteSnapshot" class="btn btn-outline-danger" title="${I18n.t("historyDelete")}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <div id="snapshotContent"></div>`;

            container.innerHTML = html;

            HistoryStatistics.bindSave();

            document.getElementById("snapshotSelect").onchange = e => HistoryStatistics.loadSnapshot(e.target.value);

            document.getElementById("btnDeleteSnapshot").onclick = () => {

                const id = document.getElementById("snapshotSelect").value;

                if (!confirm(I18n.t("alertConfirmDeleteSnapshot"))) return;

                fetch("/api/statistics/" + id, { method: "DELETE" })
                    .then(r => r.json())
                    .then(() => HistoryStatistics.load());

            };

            HistoryStatistics.loadSnapshot(lista[0].id);

        });

    }

    static bindSave() {

        document.getElementById("btnSaveSnapshot").onclick = () => {

            if (!confirm(I18n.t("alertConfirmSaveStats"))) return;

            fetch("/api/statistics/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ varos: DataManager.currentCity })
            })
            .then(r => {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            })
            .then(() => {
                alert(I18n.t("alertStatsSaved"));
                HistoryStatistics.load();
            })
            .catch(err => {
                console.error(err);
                alert(I18n.t("alertStatsSaveError"));
            });

        };

    }

    static loadSnapshot(id) {

        fetch("/api/statistics/" + id)
            .then(r => r.json())
            .then(data => {

                const s = data.snapshot;

                let html = `
                    <div class="row g-3 mb-4">
                        ${CurrentStatistics.kpi("fa-solid fa-house", "blue", I18n.t("dashLabelCount"), Utils.num(s.property_count), HistoryStatistics.label(s))}
                        ${CurrentStatistics.kpi("fa-solid fa-euro-sign", "green", I18n.t("dashLabelAvgPrice"), Utils.eur(s.avg_price),
                            s.median_price ? I18n.f("kpiNoteMedian", { median: Utils.eur(s.median_price) }) : "&nbsp;")}
                        ${CurrentStatistics.kpi("fa-solid fa-ruler-combined", "purple", I18n.t("dashLabelAvgPriceNm"), Utils.eurNm(s.avg_price_nm),
                            `${I18n.t("kpiNmRange")}: ${Utils.num(s.min_price_nm)} – ${Utils.num(s.max_price_nm)} €/m²`)}
                    </div>`;

                [
                    ["allapot", "statsByAllapot", "fa-solid fa-screwdriver-wrench"],
                    ["szobak", "statsByRooms", "fa-solid fa-bed"],
                    ["emelet", "statsByFloor", "fa-solid fa-building"],
                    ["kerulet", "statsByKerulet", "fa-solid fa-map-location-dot"]
                ].forEach(([cat, title, icon]) => {

                    const rows = HistoryStatistics.normalizeGroups(data.groups, cat);

                    if (!rows.length) return;

                    html += `
                        <div class="card mb-4">
                            <div class="card-header"><h5 class="mb-0"><i class="${icon}"></i> ${I18n.t(title)}</h5></div>
                            <div class="card-body">
                                <table class="table table-sm statTable mb-0">
                                    <thead>
                                        <tr>
                                            <th>${I18n.t("statsColCategory")}</th>
                                            <th class="text-end">${I18n.t("statsColCount")}</th>
                                            <th class="text-end">${I18n.t("statsColAvgPrice")}</th>
                                            <th class="text-end">${I18n.t("statsColAvgPriceNm")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${rows.map(r => `
                                            <tr>
                                                <td>${Utils.escape(r.label)}</td>
                                                <td class="text-end">${r.count}</td>
                                                <td class="text-end">${Utils.eur(r.avgAr)}</td>
                                                <td class="text-end fw-semibold">${Utils.eurNm(r.avgArNm)}</td>
                                            </tr>`).join("")}
                                    </tbody>
                                </table>
                            </div>
                        </div>`;

                });

                document.getElementById("snapshotContent").innerHTML = html;

            });

    }

}
