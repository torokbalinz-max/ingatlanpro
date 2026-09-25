// ============================================================
//  Piaci elemzés – Jelenlegi piac
//  Minden szám a Keresésben beállított szűrésre vonatkozik
//  (DataManager.szurtIngatlanok).
// ============================================================

class CurrentStatistics {

    // ---------- Csoportosítások ----------

    static CATEGORIES = [

        {
            id: "allapot",
            field: "allapot",
            icon: "fa-solid fa-screwdriver-wrench",
            title: "statsByAllapot",
            note: "noteAllapot",
            key: i => Utils.normAllapot(i.allapot),
            label: k => Utils.allapotLabel(k),
            order: k => Utils.allapotRank(k)
        },

        {
            id: "szobak",
            field: "szobak",
            icon: "fa-solid fa-bed",
            title: "statsByRooms",
            note: "noteRooms",
            key: i => {
                const n = Number(i.szobak) || 0;
                return n <= 0 ? "?" : String(Math.min(n, 4));
            },
            label: k => k === "?" ? I18n.t("unknownLabel") : k === "4" ? I18n.t("roomsPlusLabel") : I18n.f("roomsLabel", { n: k }),
            order: k => k === "?" ? 99 : Number(k)
        },

        {
            id: "emelet",
            field: "emelet",
            icon: "fa-solid fa-building",
            title: "statsByFloor",
            note: "noteFloor",
            key: i => String(Utils.emeletRank(i.emelet)),
            label: k => k === "99" ? I18n.t("unknownLabel") : k === "0" ? I18n.t("groundFloorLabel") : k === "4" ? I18n.t("floorPlusLabel") : `${k}. ${I18n.t("floorWord")}`,
            order: k => Number(k)
        },

        {
            id: "kerulet",
            icon: "fa-solid fa-map-location-dot",
            title: "statsByKerulet",
            note: "noteKerulet",
            key: i => (i.kerulet || "").trim(),
            label: k => k || I18n.t("keruletNincsMegadva"),
            order: k => k ? 0 : 1
        },

        {
            id: "forras",
            icon: "fa-solid fa-globe",
            title: "statsBySource",
            note: "noteSource",
            key: i => i.forras,
            label: k => Sources.label(k),
            order: () => 0
        }

    ];

    static group(lista, cat) {

        const m = new Map();

        lista.forEach(i => {
            const k = cat.key(i);
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(i);
        });

        const osszes = lista.length;

        return [...m.entries()]
            .map(([key, items]) => ({
                key,
                label: cat.label(key),
                count: items.length,
                share: items.length / osszes * 100,
                avgAr: Utils.avg(items.map(i => i.ar)),
                avgArNm: Utils.avg(items.map(Utils.arNm)),
                value: Utils.avg(items.map(Utils.arNm))
            }))
            .sort((a, b) => (cat.order(a.key) - cat.order(b.key)) || (b.count - a.count));

    }

    // ---------- Fő megjelenítés ----------

    static load() {

        const container = document.getElementById("statisticsContainer");

        ChartStatistics.destroy();

        const osszes = DataManager.szurtIngatlanok;
        const lista = Utils.valid(osszes);
        const kimaradt = osszes.length - lista.length;

        let html = CurrentStatistics.renderFilterSummary(osszes.length, lista.length);

        if (lista.length === 0) {

            container.innerHTML = html + `
                <div class="emptyState">
                    <i class="fa-solid fa-magnifying-glass-chart"></i>
                    <h5>${I18n.t("currentNoResults")}</h5>
                    <a href="#properties" class="btn btn-primary btn-sm mt-2">${I18n.t("statsChangeFilter")}</a>
                </div>`;

            return;

        }

        html += CurrentStatistics.renderKpis(lista, osszes);
        html += CurrentStatistics.renderInsights(lista, kimaradt);
        html += CurrentStatistics.renderDistribution();

        const csoportok = {};

        // Csak a típusnál értelmes bontások (pl. telekhez nincs szobaszám)
        const mezok = Types.get(FilterManager.tipus).fields;
        const kategoriak = CurrentStatistics.CATEGORIES.filter(c => !c.field || mezok[c.field] !== false);

        kategoriak.forEach(cat => {
            csoportok[cat.id] = CurrentStatistics.group(lista, cat);
            html += CurrentStatistics.renderCategory(cat, csoportok[cat.id], lista);
        });

        container.innerHTML = html;

        // Grafikonok a HTML beillesztése után
        CurrentStatistics.drawDistribution(lista);

        kategoriak.forEach(cat => {
            const rows = csoportok[cat.id];
            if (rows.length > 1) {
                ChartStatistics.bar("chart_" + cat.id, rows.slice(0, 12));
            }
        });

    }

    // ---------- Részek ----------

    static renderFilterSummary(db, ervenyes) {

        const chips = FilterManager.describe()
            .map(c => `<span class="filterChip">${c}</span>`)
            .join("");

        return `
            <div class="card filterSummary mb-4">
                <div class="card-body d-flex flex-wrap align-items-center gap-2">
                    <span class="fw-semibold me-1"><i class="fa-solid fa-filter"></i> ${I18n.t("statsBasedOn")}</span>
                    ${chips}
                    <span class="ms-auto d-flex align-items-center gap-2">
                        <span class="badge text-bg-primary fs-6">${Utils.num(db)} ${I18n.t("pcsWord")}</span>
                        <a href="#properties" class="btn btn-sm btn-outline-primary">
                            <i class="fa-solid fa-sliders"></i> ${I18n.t("statsChangeFilter")}
                        </a>
                    </span>
                </div>
            </div>`;

    }

    static kpi(icon, color, label, value, note) {

        return `
            <div class="col-md-6 col-xl-4">
                <div class="kpiCard tall">
                    <span class="kpiIcon ${color}"><i class="${icon}"></i></span>
                    <div>
                        <small>${label}</small>
                        <h3>${value}</h3>
                        <p class="kpiNote">${note}</p>
                    </div>
                </div>
            </div>`;

    }

    static renderKpis(lista, osszes) {

        const arak = lista.map(i => i.ar).sort((a, b) => a - b);
        const arNmek = lista.map(Utils.arNm).sort((a, b) => a - b);

        const q = p => arak[Math.floor((arak.length - 1) * p)];

        const eladva = osszes.filter(i => i.eladva).length;

        return `
            <h4 class="sectionTitle"><i class="fa-solid fa-gauge-high"></i> ${I18n.t("statsKeyFigures")}</h4>

            <div class="row g-3 mb-4">

                ${CurrentStatistics.kpi("fa-solid fa-house", "blue", I18n.t("dashLabelCount"),
                    Utils.num(lista.length),
                    I18n.f("kpiNoteCount", { sold: Utils.num(eladva) }))}

                ${CurrentStatistics.kpi("fa-solid fa-euro-sign", "green", I18n.t("dashLabelAvgPrice"),
                    Utils.price({ ar: Utils.avg(arak), ugylet: FilterManager.ugylet }),
                    I18n.f("kpiNoteMedian", { median: Utils.eur(Utils.median(arak)) }))}

                ${CurrentStatistics.kpi("fa-solid fa-ruler-combined", "purple", I18n.t("dashLabelAvgPriceNm"),
                    Utils.eurNm(Utils.avg(arNmek)),
                    I18n.f("kpiNoteMedianNm", { median: Utils.eurNm(Utils.median(arNmek)) }))}

                ${CurrentStatistics.kpi("fa-solid fa-vector-square", "cyan", I18n.t("dashLabelAvgNm"),
                    Utils.num(Utils.avg(lista.map(i => i.nm)), 1) + " m²",
                    I18n.t("kpiNoteNm"))}

                ${CurrentStatistics.kpi("fa-solid fa-arrows-left-right", "orange", I18n.t("kpiTypicalRange"),
                    `${Utils.eur(q(0.25))} – ${Utils.eur(q(0.75))}`,
                    I18n.t("kpiNoteTypicalRange"))}

                ${CurrentStatistics.kpi("fa-solid fa-arrow-down-up-across-line", "red", I18n.t("kpiNmRange"),
                    `${Utils.num(arNmek[0])} – ${Utils.num(arNmek[arNmek.length - 1])} €/m²`,
                    I18n.t("kpiNoteNmRange"))}

            </div>`;

    }

    static renderInsights(lista, kimaradt) {

        const pontok = [];

        const atlagNm = Utils.avg(lista.map(Utils.arNm));

        // 1) Mit jelent az átlag a gyakorlatban
        pontok.push(I18n.f("insightAvg", {
            nm: Utils.eurNm(atlagNm),
            price60: Utils.eur(atlagNm * 60)
        }));

        // 2) Kerületek
        const ker = CurrentStatistics.group(lista, CurrentStatistics.CATEGORIES[3])
            .filter(g => g.key && g.count >= 3)
            .sort((a, b) => a.avgArNm - b.avgArNm);

        if (ker.length >= 2) {
            pontok.push(I18n.f("insightDistrict", {
                cheap: Utils.escape(ker[0].label),
                cheapNm: Utils.eurNm(ker[0].avgArNm),
                exp: Utils.escape(ker[ker.length - 1].label),
                expNm: Utils.eurNm(ker[ker.length - 1].avgArNm)
            }));
        } else {
            const nincs = lista.filter(i => !(i.kerulet || "").trim()).length;
            if (nincs > lista.length / 2) {
                pontok.push(I18n.f("insightNoDistrict", { pct: Utils.num(nincs / lista.length * 100) }));
            }
        }

        // 3) Állapot hatása
        const all = CurrentStatistics.group(lista, CurrentStatistics.CATEGORIES[0]);
        const feluj = all.find(g => g.key === "felújítandó" && g.count >= 3);
        const jo = all.find(g => g.key === "jó" && g.count >= 3);

        if (feluj && jo) {
            pontok.push(I18n.f("insightCondition", {
                pct: Utils.num((jo.avgArNm / feluj.avgArNm - 1) * 100),
                diff: Utils.eurNm(jo.avgArNm - feluj.avgArNm)
            }));
        }

        // 4) Szobaszám
        const szobak = CurrentStatistics.group(lista, CurrentStatistics.CATEGORIES[1])
            .filter(g => g.key !== "?" && g.count >= 3);

        if (szobak.length >= 2) {
            const kicsi = szobak[0];
            const nagy = szobak[szobak.length - 1];
            pontok.push(I18n.f("insightRooms", {
                small: kicsi.label,
                smallNm: Utils.eurNm(kicsi.avgArNm),
                big: nagy.label,
                bigNm: Utils.eurNm(nagy.avgArNm)
            }));
        }

        // 5) Forrás
        const forras = CurrentStatistics.group(lista, CurrentStatistics.CATEGORIES[4]).sort((a, b) => b.count - a.count);

        if (forras.length) {
            pontok.push(I18n.f("insightSource", {
                source: Utils.escape(forras[0].label),
                pct: Utils.num(forras[0].share)
            }));
        }

        // 6) Szűrt vs. teljes város
        if (FilterManager.isFiltered()) {

            const varosLista = Utils.valid(DataManager.ingatlanok);
            const varosAtlag = Utils.avg(varosLista.map(Utils.arNm));

            if (varosAtlag) {
                const elteres = (atlagNm / varosAtlag - 1) * 100;
                pontok.push(I18n.f(elteres >= 0 ? "insightVsCityUp" : "insightVsCityDown", {
                    pct: Utils.num(Math.abs(elteres), 1),
                    city: Utils.eurNm(varosAtlag)
                }));
            }

        }

        // 7) Kimaradt, hiányos adatok
        if (kimaradt > 0) {
            pontok.push(I18n.f("insightMissing", { db: kimaradt }));
        }

        return `
            <div class="card insightCard mb-4">
                <div class="card-header">
                    <h5 class="mb-0"><i class="fa-solid fa-lightbulb"></i> ${I18n.t("statsInsightsTitle")}</h5>
                </div>
                <div class="card-body">
                    <ul class="insightList">
                        ${pontok.map(p => `<li>${p}</li>`).join("")}
                    </ul>
                </div>
            </div>`;

    }

    static renderDistribution() {

        return `
            <div class="card mb-4">
                <div class="card-header">
                    <h5 class="mb-0"><i class="fa-solid fa-chart-simple"></i> ${I18n.t("statsDistTitle")}</h5>
                </div>
                <div class="card-body">
                    <p class="sectionNote">${I18n.t("noteDist")}</p>
                    <div class="chartBox"><canvas id="chart_dist"></canvas></div>
                </div>
            </div>`;

    }

    static drawDistribution(lista) {

        const lepes = 250;
        const ertekek = lista.map(Utils.arNm);
        const min = Math.floor(Math.min(...ertekek) / lepes) * lepes;
        const max = Math.ceil(Math.max(...ertekek) / lepes) * lepes;

        const rows = [];

        for (let a = min; a < Math.max(max, min + lepes); a += lepes) {
            const count = ertekek.filter(v => v >= a && v < a + lepes).length;
            rows.push({ label: `${Utils.num(a)}–${Utils.num(a + lepes)}`, value: count });
        }

        ChartStatistics.bar("chart_dist", rows, {
            horizontal: false,
            single: true,
            label: I18n.t("chartLegendProperties"),
            format: v => `${v} ${I18n.t("pcsWord")}`
        });

    }

    static diffBadge(ertek, atlag) {

        if (!atlag || !ertek) return "";

        const d = (ertek / atlag - 1) * 100;
        const cls = d > 5 ? "above" : d < -5 ? "below" : "average";

        return `<span class="diffBadge ${cls}">${Utils.pct(d, 0)}</span>`;

    }

    static renderCategory(cat, rows, lista) {

        const atlag = Utils.avg(lista.map(Utils.arNm));

        const tabla = `
            <div class="table-responsive">
                <table class="table table-sm statTable align-middle mb-0">
                    <thead>
                        <tr>
                            <th>${I18n.t("statsColCategory")}</th>
                            <th class="text-end">${I18n.t("statsColCount")}</th>
                            <th class="text-end">${I18n.t("statsColShare")}</th>
                            <th class="text-end">${I18n.t("statsColAvgPrice")}</th>
                            <th class="text-end">${I18n.t("statsColAvgPriceNm")}</th>
                            <th class="text-end">${I18n.t("statsColVsAvg")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr>
                                <td>${Utils.escape(r.label)}</td>
                                <td class="text-end">${r.count}</td>
                                <td class="text-end">${Utils.num(r.share)} %</td>
                                <td class="text-end">${Utils.eur(r.avgAr)}</td>
                                <td class="text-end fw-semibold">${Utils.eurNm(r.avgArNm)}</td>
                                <td class="text-end">${CurrentStatistics.diffBadge(r.avgArNm, atlag)}</td>
                            </tr>`).join("")}
                    </tbody>
                </table>
            </div>`;

        const grafikon = rows.length > 1
            ? `<div class="chartBox small"><canvas id="chart_${cat.id}"></canvas></div>`
            : `<p class="text-body-secondary small">${I18n.t("statsOneGroup")}</p>`;

        return `
            <div class="card mb-4 categoryCard">
                <div class="card-header">
                    <h5 class="mb-0"><i class="${cat.icon}"></i> ${I18n.t(cat.title)}</h5>
                </div>
                <div class="card-body">
                    <p class="sectionNote">${I18n.t(cat.note)}</p>
                    <div class="row g-4 align-items-center">
                        <div class="col-xl-5">${grafikon}</div>
                        <div class="col-xl-7">${tabla}</div>
                    </div>
                </div>
            </div>`;

    }

}
