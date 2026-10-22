// ============================================================
//  Piaci elemzés – Előzmények (mentett piaci állapotok)
//
//  Havonta kétszer (1-jén és 16-án) a szerver automatikusan elmenti
//  minden város + típus + ügylet piaci állapotát, a hozzá vett hirdetések
//  adataival együtt (server/routes/statistics.js). Itt a bal oldali
//  keresés szerinti sorozat látszik: a görbe a mentések között, a lista,
//  egy kiválasztott mentés részletei, és két mentés összevetése.
// ============================================================

class HistoryStatistics {

    static snapshots = [];
    static valasztott = null;

    static datum(s, ora) {
        return new Date(s.created_at).toLocaleDateString(Utils.locale(), {
            year: "numeric", month: "short", day: "numeric", ...(ora ? { hour: "2-digit", minute: "2-digit" } : {})
        });
    }

    // Mentett snapshot neve a listákban (a régi hívóknak is)
    static label(s) {
        const varos = s.varos ? CityManager.displayName(s.varos) : I18n.t("allCities");
        const tipus = s.tipus ? ` · ${Types.label(s.tipus)} (${Types.ugyletLabel(s.ugylet)})` : "";
        const auto = s.note === "auto" ? ` · ${I18n.t("histAuto")}` : "";
        return `${HistoryStatistics.datum(s, true)} · ${varos}${tipus} · ${s.property_count} ${I18n.t("pcsWord")}${auto}`;
    }

    // A bal oldali keresés (város, típus, ügylet) szerinti mentések, időrendben (legújabb elöl)
    static fetchList() {
        const q = new URLSearchParams({ varos: DataManager.currentCity || "", tipus: FilterManager.tipus || "lakas", ugylet: FilterManager.ugylet || "elado" });
        return fetch("/api/statistics?" + q)
            .then(r => r.json())
            .then(lista => {
                HistoryStatistics.snapshots = Array.isArray(lista) ? lista : [];
                return HistoryStatistics.snapshots;
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
                label = category === "kerulet" && g.value !== "Nincs megadva"
                    ? CityManager.keruletLabel(g.value, DataManager.currentCity)
                    : I18n.translateStatValue(g.value);
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

    // A következő automatikus mentés napja (1-je vagy 16-a)
    static kovetkezo() {
        const d = new Date();
        const k = d.getDate() < 16 ? new Date(d.getFullYear(), d.getMonth(), 16) : new Date(d.getFullYear(), d.getMonth() + 1, 1);
        return k.toLocaleDateString(Utils.locale(), { month: "long", day: "numeric" });
    }

    static load() {

        const container = document.getElementById("statisticsContainer");
        container.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        HistoryStatistics.fetchList().then(lista => {

            const esc = Utils.escape;
            const sorozat = `${CityManager.displayName(DataManager.currentCity)} · ${Types.label(FilterManager.tipus)} · ${Types.ugyletLabel(FilterManager.ugylet)}`;
            const admin = AuthManager.isAdmin();

            let html = `
                <div class="histIntro">
                    <span class="histIntroIcon" aria-hidden="true"><i class="fa-solid fa-calendar-check"></i></span>
                    <div class="flex-fill">
                        <b>${I18n.t("histTitle")}</b>
                        <span>${I18n.f("histIntro", { kov: esc(HistoryStatistics.kovetkezo()) })}</span>
                    </div>
                    <span class="filterChip">${esc(sorozat)}</span>
                    ${admin ? `<button id="btnSaveSnapshot" class="btn btn-sm btn-outline-primary"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> ${I18n.t("histSaveNow")}</button>` : ""}
                </div>`;

            if (!lista.length) {
                container.innerHTML = html + `
                    <div class="emptyState">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                        <h5>${I18n.t("histEmptySeries")}</h5>
                        <p>${I18n.f("histEmptyHint", { kov: esc(HistoryStatistics.kovetkezo()) })}</p>
                    </div>`;
                HistoryStatistics.bindSave();
                return;
            }

            const idorend = [...lista].reverse();      // legrégebbi elöl (a görbéhez)

            html += `
                <div class="card histChartCard mb-4">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> ${I18n.t("histChartTitle")}</h5></div>
                    <div class="card-body">
                        ${idorend.length > 1
                            ? `<div class="chartBox"><canvas id="histChart" role="img" aria-label="${esc(I18n.t("histChartTitle"))}"></canvas></div>`
                            : `<p class="sectionNote mb-0">${I18n.t("histChartOne")}</p>`}
                    </div>
                </div>

                <div class="histLayout">
                    <div class="card histListCard">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> ${I18n.f("histSaves", { n: lista.length })}</h5></div>
                        <div class="histList" role="listbox" aria-label="${esc(I18n.t("histTitle"))}">
                            ${lista.map((s, n) => {
                                const elozo = lista[n + 1];
                                const valt = elozo ? CompareStatistics.change(Number(elozo.avg_price_nm), Number(s.avg_price_nm)) : null;
                                return `
                                    <button type="button" class="histItem" role="option" data-snap="${s.id}" aria-selected="false">
                                        <span class="histDate">${esc(HistoryStatistics.datum(s))}${s.note === "auto" ? "" : ` <span class="histManual">${I18n.t("histManual")}</span>`}</span>
                                        <span class="histVal">${Utils.eurNm(Number(s.avg_price_nm))}</span>
                                        <span class="histMeta">${I18n.f("histCount", { n: Utils.num(s.property_count) })}</span>
                                        <span class="histChange">${valt === null ? "" : CompareStatistics.changeBadge(valt)}</span>
                                    </button>`;
                            }).join("")}
                        </div>
                    </div>
                    <div class="histDetail">
                        <div class="histToolbar">
                            <label class="small text-body-secondary" for="snapshotCompare">${I18n.t("histCompareLabel")}</label>
                            <select id="snapshotCompare" class="form-select form-select-sm">
                                <option value="">${I18n.t("histCompareNone")}</option>
                                ${lista.map(s => `<option value="${s.id}">${esc(HistoryStatistics.datum(s))} · ${Utils.eurNm(Number(s.avg_price_nm))}</option>`).join("")}
                            </select>
                            ${admin ? `
                                <a class="btn btn-sm btn-outline-secondary" id="btnCsvSnapshot" href="#" download><i class="fa-solid fa-file-csv" aria-hidden="true"></i> ${I18n.t("histCsv")}</a>
                                <button id="btnDeleteSnapshot" class="btn btn-sm btn-outline-danger" title="${esc(I18n.t("historyDelete"))}" aria-label="${esc(I18n.t("historyDelete"))}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>` : ""}
                        </div>
                        <div id="snapshotContent"></div>
                    </div>
                </div>`;

            container.innerHTML = html;

            HistoryStatistics.bindSave();

            if (idorend.length > 1) {
                ChartStatistics.multiLine("histChart",
                    idorend.map(s => HistoryStatistics.datum(s)),
                    [
                        { label: I18n.t("dashLabelAvgPriceNm"), data: idorend.map(s => Number(s.avg_price_nm) || null), darab: idorend.map(s => Number(s.property_count)), fo: true }
                    ],
                    Utils.eurNm);
            }

            const valaszt = id => {
                HistoryStatistics.valasztott = id;
                container.querySelectorAll("[data-snap]").forEach(b => {
                    const on = b.dataset.snap === String(id);
                    b.classList.toggle("active", on);
                    b.setAttribute("aria-selected", String(on));
                });
                const csv = document.getElementById("btnCsvSnapshot");
                if (csv) csv.href = `/api/statistics/${id}/csv`;
                HistoryStatistics.mutat();
            };

            container.querySelectorAll("[data-snap]").forEach(b => { b.onclick = () => valaszt(b.dataset.snap); });
            document.getElementById("snapshotCompare").onchange = () => HistoryStatistics.mutat();

            const del = document.getElementById("btnDeleteSnapshot");
            if (del) del.onclick = () => {
                if (!HistoryStatistics.valasztott || !confirm(I18n.t("alertConfirmDeleteSnapshot"))) return;
                fetch("/api/statistics/" + HistoryStatistics.valasztott, { method: "DELETE" })
                    .then(r => r.json())
                    .then(() => HistoryStatistics.load());
            };

            valaszt(String(lista[0].id));

        }).catch(() => {
            container.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
        });

    }

    static mutat() {
        const a = HistoryStatistics.valasztott;
        const b = (document.getElementById("snapshotCompare") || {}).value;
        const cel = document.getElementById("snapshotContent");
        if (!cel || !a) return;
        if (b && b !== a) CompareStatistics.renderInto(b, a, cel);
        else HistoryStatistics.loadSnapshot(a);
    }

    static bindSave() {

        const btn = document.getElementById("btnSaveSnapshot");
        if (!btn) return;

        btn.onclick = () => {

            if (!confirm(I18n.t("alertConfirmSaveStats"))) return;

            btn.disabled = true;

            fetch("/api/statistics/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ varos: DataManager.currentCity, tipus: FilterManager.tipus, ugylet: FilterManager.ugylet })
            })
            .then(r => {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            })
            .then(() => HistoryStatistics.load())
            .catch(err => {
                console.error(err);
                alert(I18n.t("alertStatsSaveError"));
                btn.disabled = false;
            });

        };

    }

    static loadSnapshot(id) {

        const cel = document.getElementById("snapshotContent");
        if (!cel) return;

        fetch("/api/statistics/" + id)
            .then(r => r.json())
            .then(data => {

                const s = data.snapshot;
                if (!s) return;

                let html = `
                    <div class="histDetailHead">
                        <h4>${Utils.escape(HistoryStatistics.datum(s, true))}</h4>
                        <span class="small text-body-secondary">${s.note === "auto" ? I18n.t("histAutoSaved") : I18n.t("histManualSaved")}${Number(s.adat_db) ? " · " + I18n.f("histDataKept", { n: Utils.num(s.adat_db) }) : ""}</span>
                    </div>
                    <div class="statKpis mb-4">
                        ${CurrentStatistics.kpi(I18n.t("dashLabelCount"), Utils.num(s.property_count), "")}
                        ${CurrentStatistics.kpi(I18n.t("statsMedianPrice"), Utils.price({ ar: Number(s.median_price || s.avg_price), ugylet: s.ugylet }),
                            I18n.f("statsAvgSub", { v: Utils.eur(Number(s.avg_price)) }))}
                        ${CurrentStatistics.kpi(I18n.t("dashLabelAvgPriceNm"), Utils.eurNm(Number(s.avg_price_nm)),
                            `${Utils.num(Number(s.min_price_nm))} – ${Utils.num(Number(s.max_price_nm))} €/m²`)}
                        ${CurrentStatistics.kpi(I18n.t("histAvgArea"), s.avg_nm ? Utils.nm(Math.round(Number(s.avg_nm))) : "–", "")}
                    </div>
                    <div class="statGrid">`;

                [
                    ["kerulet", "statsByKerulet", "fa-solid fa-map-location-dot"],
                    ["allapot", "statsByAllapot", "fa-solid fa-screwdriver-wrench"],
                    ["szobak", "statsByRooms", "fa-solid fa-bed"],
                    ["emelet", "statsByFloor", "fa-solid fa-building"]
                ].forEach(([cat, title, icon]) => {

                    const rows = HistoryStatistics.normalizeGroups(data.groups, cat);
                    if (!rows.length) return;
                    const max = Math.max(...rows.map(r => r.avgArNm || 0)) || 1;

                    html += `
                        <div class="card categoryCard">
                            <div class="card-header"><h5 class="mb-0"><i class="${icon}" aria-hidden="true"></i> ${I18n.t(title)}</h5></div>
                            <div class="card-body">
                                <ul class="histBars">
                                    ${rows.map(r => `
                                        <li>
                                            <span class="hbName">${Utils.escape(r.label)} <small>${r.count}</small></span>
                                            <span class="hbTrack"><span class="hbBar" style="--w:${Math.round((r.avgArNm || 0) / max * 100)}%"></span></span>
                                            <span class="hbVal">${Utils.eurNm(r.avgArNm)}</span>
                                        </li>`).join("")}
                                </ul>
                            </div>
                        </div>`;

                });

                html += `</div>`;
                cel.innerHTML = html;

            });

    }

}
