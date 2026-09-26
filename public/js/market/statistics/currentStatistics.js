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
            label: k => k ? CityManager.keruletLabel(k) : I18n.t("keruletNincsMegadva"),
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

    // Melyik bontások számítanak az adott típusnál (a sorrend is ez)
    static EXTRA = [
        {
            id: "telepules",
            icon: "fa-solid fa-map-pin",
            title: "statsByTelepules",
            key: i => i.telepules || "_varos",
            label: k => k === "_varos" ? I18n.t("telepulesVarosban") : CityManager.telepulesLabel(k),
            order: k => k === "_varos" ? 0 : 1
        },
        {
            id: "jelleg",
            icon: "fa-solid fa-signs-post",
            title: "statsByJelleg",
            key: i => i.telek_jelleg || "?",
            label: k => k === "?" ? I18n.t("unknownLabel") : I18n.t("jelleg_" + k),
            order: k => k === "?" ? 9 : k === "belterulet" ? 0 : 1
        }
    ];

    static kategoriak(tipus) {
        const c = id => CurrentStatistics.CATEGORIES.find(x => x.id === id) || CurrentStatistics.EXTRA.find(x => x.id === id);
        if (tipus === "telek") return [c("telepules"), c("jelleg")];
        if (tipus === "haz") return [c("telepules"), c("allapot"), c("szobak")];
        if (tipus === "kereskedelmi") return [c("kerulet"), c("allapot"), c("emelet")];
        return [c("kerulet"), c("allapot"), c("szobak"), c("emelet")];
    }

    // ---------- Fő megjelenítés ----------

    static load() {

        const container = document.getElementById("statisticsContainer");

        ChartStatistics.destroy();

        const osszes = DataManager.szurtIngatlanok;
        const ervenyes = Utils.valid(osszes);

        // Az ellenőrzésre váró (hiányos / gyanús) hirdetések kimaradnak
        const lista = ervenyes.filter(Utils.verified);
        CurrentStatistics.kimaradt = osszes.length - lista.length;

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

        html += CurrentStatistics.renderKpis(lista);

        const kategoriak = CurrentStatistics.kategoriak(FilterManager.tipus);
        const csoportok = {};

        html += `<div class="statGrid">`;

        kategoriak.forEach(cat => {
            csoportok[cat.id] = CurrentStatistics.group(lista, cat);
            html += CurrentStatistics.renderCategory(cat, csoportok[cat.id], lista);
        });

        html += `</div>`;

        html += CurrentStatistics.renderBestValue(lista);

        container.innerHTML = html;

        kategoriak.forEach(cat => {
            const rows = csoportok[cat.id];
            if (rows.length > 1) {
                ChartStatistics.bar("chart_" + cat.id, rows.slice(0, 10), { single: true });
            }
        });

        container.querySelectorAll("[data-open-listing]").forEach(a => {
            a.onclick = e => { e.preventDefault(); ListingPage.open(Number(a.dataset.openListing)); };
        });

    }

    // ---------- Részek ----------

    static renderFilterSummary(db, szamolt) {

        const chips = FilterManager.describe()
            .map(c => `<span class="filterChip">${c}</span>`)
            .join("");

        return `
            <div class="statFilterBar mb-4">
                <div class="statChips">${chips}</div>
                <div class="d-flex align-items-center gap-3">
                    <span class="small text-body-secondary">${I18n.f("statsCounted", { n: Utils.num(szamolt), db: Utils.num(db) })}</span>
                    <a href="#properties" class="btn btn-sm btn-outline-primary text-nowrap">
                        <i class="fa-solid fa-sliders" aria-hidden="true"></i> ${I18n.t("statsChangeFilter")}
                    </a>
                </div>
            </div>`;

    }

    static kpi(label, value, note) {

        return `
            <div class="statKpi">
                <small>${label}</small>
                <b>${value}</b>
                ${note ? `<span>${note}</span>` : ""}
            </div>`;

    }

    static renderKpis(lista) {

        const arak = lista.map(i => i.ar).sort((a, b) => a - b);
        const arNmek = lista.map(Utils.arNm).sort((a, b) => a - b);

        const q = p => arak[Math.floor((arak.length - 1) * p)];

        return `
            <div class="statKpis mb-4">
                ${CurrentStatistics.kpi(I18n.t("dashLabelCount"), Utils.num(lista.length), "")}
                ${CurrentStatistics.kpi(I18n.t("statsMedianPrice"), Utils.price({ ar: Utils.median(arak), ugylet: FilterManager.ugylet }),
                    I18n.f("statsAvgSub", { v: Utils.eur(Utils.avg(arak)) }))}
                ${CurrentStatistics.kpi(I18n.t("dashLabelAvgPriceNm"), Utils.eurNm(Utils.avg(arNmek)),
                    I18n.f("statsMedianSub", { v: Utils.eurNm(Utils.median(arNmek)) }))}
                ${CurrentStatistics.kpi(I18n.t("kpiTypicalRange"), `${Utils.eur(q(0.25))} – ${Utils.eur(q(0.75))}`,
                    I18n.t("statsTypicalSub"))}
            </div>`;

    }

    // A legalacsonyabb négyzetméterárú hirdetések a szűrésben
    static renderBestValue(lista) {

        const atlag = Utils.avg(lista.map(Utils.arNm));
        const top = [...lista].sort((a, b) => Utils.arNm(a) - Utils.arNm(b)).slice(0, 5);

        if (lista.length < 4) return "";

        return `
            <div class="card mb-4">
                <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-arrow-trend-down" aria-hidden="true"></i> ${I18n.t("statsBestValue")}</h5></div>
                <div class="list-group list-group-flush">
                    ${top.map(i => `
                        <a href="#listing/${i.id}" class="list-group-item list-group-item-action bestRow" data-open-listing="${i.id}">
                            <span class="bestTitle">${Utils.escape(i.cim || Types.label(i.tipus))}<small>${Utils.escape(CityManager.helyLabel(i))}${i.nm ? " · " + Utils.num(i.nm) + " m²" : ""}</small></span>
                            <span class="text-end text-nowrap"><b>${Utils.eurNm(Utils.arNm(i))}</b><small>${Utils.price(i)}</small></span>
                            ${CurrentStatistics.diffBadge(Utils.arNm(i), atlag)}
                        </a>`).join("")}
                </div>
            </div>`;

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
                <table class="table statTable align-middle mb-0">
                    <thead>
                        <tr>
                            <th>${I18n.t("statsColCategory")}</th>
                            <th class="text-end">${I18n.t("statsColCount")}</th>
                            <th class="text-end">${I18n.t("statsColAvgPrice")}</th>
                            <th class="text-end">€/m²</th>
                            <th class="text-end"><span class="visually-hidden">${I18n.t("statsColVsAvg")}</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr>
                                <td>${Utils.escape(r.label)}</td>
                                <td class="text-end">${r.count}</td>
                                <td class="text-end">${Utils.eur(r.avgAr)}</td>
                                <td class="text-end fw-semibold">${Utils.eurNm(r.avgArNm)}</td>
                                <td class="text-end">${CurrentStatistics.diffBadge(r.avgArNm, atlag)}</td>
                            </tr>`).join("")}
                    </tbody>
                </table>
            </div>`;

        const grafikon = rows.length > 1
            ? `<div class="chartBox small mb-3"><canvas id="chart_${cat.id}" role="img" aria-label="${Utils.escape(I18n.t(cat.title))}"></canvas></div>`
            : "";

        return `
            <div class="card categoryCard">
                <div class="card-header">
                    <h5 class="mb-0"><i class="${cat.icon}" aria-hidden="true"></i> ${I18n.t(cat.title)}</h5>
                </div>
                <div class="card-body">
                    ${grafikon}
                    ${tabla}
                </div>
            </div>`;

    }

}
