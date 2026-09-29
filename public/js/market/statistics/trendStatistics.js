// ============================================================
//  Piaci elemzés – Ártrend és időszak-összevetés
//
//  A számok a hirdetésekből jönnek (nem csak a kézi mentésekből):
//  egy hónapban azok a hirdetések számítanak, amelyek akkor fent voltak,
//  azon az áron, ami a hónap végén élt (a szerver naplózza az árváltozásokat).
//  A bal oldali keresés szűrői (típus, város, kerület, szobák, állapot...)
//  itt is érvényesek; a Szobák gyorsválasztóval pl. csak a 2 szobásak.
// ============================================================

class TrendStatistics {

    static adat = null;
    static keres = 0;

    // Mutatók: kulcs a szerver válaszában + formázás
    static MUTATOK = [
        { id: "median_nm", label: "trMetricMedianNm", fmt: v => Utils.eurNm(v) },
        { id: "korrigalt_nm", label: "trMetricAdjusted", fmt: v => Utils.eurNm(v), csakOsszes: true },
        { id: "atlag_nm", label: "trMetricAvgNm", fmt: v => Utils.eurNm(v) },
        { id: "median_ar", label: "trMetricMedianPrice", fmt: v => Utils.eur(v) },
        { id: "index", label: "trMetricIndex", fmt: v => v === null || v === undefined ? "-" : Utils.num(v, 1), csakOsszes: true },
        { id: "n", label: "trMetricCount", fmt: v => Utils.num(v) },
        { id: "uj", label: "trMetricNew", fmt: v => Utils.num(v) }
    ];

    static BONTASOK = {
        lakas: ["szobak", "kerulet", "allapot", "emelet"],
        haz: ["szobak", "telepules", "allapot"],
        telek: ["telepules"],
        kereskedelmi: ["kerulet", "allapot", "emelet"],
        iroda: ["kerulet", "allapot", "emelet"]
    };

    static mutato(id) {
        return TrendStatistics.MUTATOK.find(m => m.id === id) || TrendStatistics.MUTATOK[0];
    }

    // "2026-04" / "2026-Q2" -> olvasható címke
    static idoszakLabel(k) {
        const q = /^(\d{4})-Q(\d)$/.exec(k);
        if (q) return `${q[1]} Q${q[2]}`;
        const m = /^(\d{4})-(\d{2})$/.exec(k);
        if (!m) return k;
        return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15))
            .toLocaleDateString(Utils.locale(), { year: "numeric", month: "short", timeZone: "UTC" });
    }

    static tartomanyLabel(k) {
        return String(k).split(" – ").map(TrendStatistics.idoszakLabel).join(" – ");
    }

    // Egy bontás-kulcs címkéje
    static kulcsLabel(bontas, k) {
        if (k === "_osszes") return I18n.t("trAllListings");
        if (bontas === "szobak") return k === "?" ? I18n.t("unknownLabel") : k === "4" ? I18n.t("roomsPlusLabel") : I18n.f("roomsLabel", { n: k });
        if (bontas === "allapot") return k === "?" ? I18n.t("unknownLabel") : Utils.allapotLabel(k);
        if (bontas === "kerulet") return k === "?" ? I18n.t("keruletNincsMegadva") : CityManager.keruletLabel(k);
        if (bontas === "emelet") return k === "?" ? I18n.t("unknownLabel") : k === "0" ? I18n.t("groundFloorLabel") : k === "4" ? I18n.t("floorPlusLabel") : `${k}. ${I18n.t("floorWord")}`;
        if (bontas === "telepules") return k === "_varos" ? I18n.t("telepulesVarosban") : CityManager.telepulesLabel(k);
        return k;
    }

    static bontasCim(b) {
        return I18n.t({ szobak: "statsByRooms", kerulet: "statsByKerulet", allapot: "statsByAllapot", emelet: "statsByFloor", telepules: "statsByTelepules" }[b]);
    }

    static honap(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    // ---------- Oldal ----------

    static load() {

        const container = document.getElementById("statisticsContainer");
        const tipus = FilterManager.tipus;
        const bontasok = TrendStatistics.BONTASOK[tipus] || [];
        const most = new Date();
        const elotte = new Date(most.getFullYear(), most.getMonth() - 11, 1);
        const szobas = ["lakas", "haz"].includes(tipus);

        const opt = (v, l) => `<option value="${v}">${Utils.escape(l)}</option>`;

        container.innerHTML = `
            <div id="trendFilterBar"></div>

            <div class="card mb-4">
                <div class="card-body">
                    <div class="row g-3">
                        <div class="col-sm-6 col-xl-4">
                            <label class="form-label" for="trendMetric">${I18n.t("trendIndicator")}</label>
                            <select id="trendMetric" class="form-select">
                                ${TrendStatistics.MUTATOK.map(m => opt(m.id, I18n.t(m.label))).join("")}
                            </select>
                        </div>
                        <div class="col-sm-6 col-xl-4">
                            <label class="form-label" for="trendSplit">${I18n.t("trSplit")}</label>
                            <select id="trendSplit" class="form-select">
                                ${opt("", I18n.t("trSplitNone"))}
                                ${bontasok.map(b => opt(b, TrendStatistics.bontasCim(b))).join("")}
                            </select>
                        </div>
                        <div class="col-sm-6 col-xl-4" ${szobas ? "" : "hidden"}>
                            <label class="form-label" for="trendRooms">${I18n.t("searchSzoba")}</label>
                            <select id="trendRooms" class="form-select">
                                ${opt("", I18n.t("trRoomsFromSearch"))}
                                ${opt("1", I18n.f("roomsLabel", { n: 1 }))}
                                ${opt("2", I18n.f("roomsLabel", { n: 2 }))}
                                ${opt("3", I18n.f("roomsLabel", { n: 3 }))}
                                ${opt("4", I18n.t("roomsPlusLabel"))}
                            </select>
                        </div>
                        <div class="col-sm-4 col-xl-4">
                            <label class="form-label" for="trendRes">${I18n.t("trResolution")}</label>
                            <select id="trendRes" class="form-select">
                                ${opt("honap", I18n.t("trMonthly"))}
                                ${opt("negyedev", I18n.t("trQuarterly"))}
                            </select>
                        </div>
                        <div class="col-sm-4 col-xl-4">
                            <label class="form-label" for="trendFrom">${I18n.t("trendFrom")}</label>
                            <input type="month" id="trendFrom" class="form-control" value="${TrendStatistics.honap(elotte)}" max="${TrendStatistics.honap(most)}">
                        </div>
                        <div class="col-sm-4 col-xl-4">
                            <label class="form-label" for="trendTo">${I18n.t("trendTo")}</label>
                            <input type="month" id="trendTo" class="form-control" value="${TrendStatistics.honap(most)}" max="${TrendStatistics.honap(most)}">
                        </div>
                    </div>
                    <details class="trendHow mt-3">
                        <summary><i class="fa-regular fa-circle-question" aria-hidden="true"></i> ${I18n.t("trHowTitle")}</summary>
                        <ul class="small text-body-secondary mb-0 mt-2">
                            <li>${I18n.t("trHow1")}</li>
                            <li>${I18n.t("trHow2")}</li>
                            <li>${I18n.t("trHow3")}</li>
                            <li>${I18n.t("trHow4")}</li>
                        </ul>
                    </details>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-body">
                    <div id="trendSummary" class="mb-3"></div>
                    <div class="chartBox tall"><canvas id="trendChart" role="img" aria-label="${Utils.escape(I18n.t("statsTrend"))}"></canvas></div>
                    <div id="trendTable" class="mt-3"></div>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> ${I18n.t("trCompareTitle")}</h5></div>
                <div class="card-body">
                    <p class="sectionNote">${I18n.t("trCompareNote")}</p>
                    <div class="row g-3 align-items-end mb-3">
                        <div class="col-md-5">
                            <label class="form-label">${I18n.t("trPeriodA")}</label>
                            <div class="input-group">
                                <input type="month" id="cmpATol" class="form-control" aria-label="${Utils.escape(I18n.t("trendFrom"))}">
                                <span class="input-group-text">–</span>
                                <input type="month" id="cmpAIg" class="form-control" aria-label="${Utils.escape(I18n.t("trendTo"))}">
                            </div>
                        </div>
                        <div class="col-md-5">
                            <label class="form-label">${I18n.t("trPeriodB")}</label>
                            <div class="input-group">
                                <input type="month" id="cmpBTol" class="form-control" aria-label="${Utils.escape(I18n.t("trendFrom"))}">
                                <span class="input-group-text">–</span>
                                <input type="month" id="cmpBIg" class="form-control" aria-label="${Utils.escape(I18n.t("trendTo"))}">
                            </div>
                        </div>
                        <div class="col-md-2 d-grid">
                            <button id="btnPeriodCompare" class="btn btn-primary" type="button">${I18n.t("compareBtn")}</button>
                        </div>
                    </div>
                    <div id="periodCompareResult"></div>
                </div>
            </div>`;

        // Alap összevetés: 4 hónappal ezelőtt vs. ez a hónap
        const a = new Date(most.getFullYear(), most.getMonth() - 4, 1);
        document.getElementById("cmpATol").value = TrendStatistics.honap(a);
        document.getElementById("cmpBTol").value = TrendStatistics.honap(most);

        ["trendMetric"].forEach(id => document.getElementById(id).onchange = () => TrendStatistics.draw());
        ["trendSplit", "trendRooms", "trendRes", "trendFrom", "trendTo"].forEach(id => {
            document.getElementById(id).onchange = () => TrendStatistics.refresh();
        });

        document.getElementById("btnPeriodCompare").onclick = () => TrendStatistics.compare();

        TrendStatistics.refresh();
        TrendStatistics.compare();

    }

    // A szerverre küldött szűrők (a keresés + a gyorsválasztók)
    static params(extra = {}) {

        const f = DataManager.filter || {};
        const p = new URLSearchParams();

        const tesz = (k, v) => { if (v !== null && v !== undefined && v !== "") p.set(k, v); };

        tesz("varos", f.varos || DataManager.currentCity);
        tesz("tipus", FilterManager.tipus);
        tesz("ugylet", FilterManager.ugylet);
        ["kerulet", "telepules", "allapot", "jelleg", "minNm", "maxNm", "minEmelet", "maxEmelet", "minSzoba", "maxSzoba"].forEach(k => tesz(k, f[k]));

        const szoba = document.getElementById("trendRooms") ? document.getElementById("trendRooms").value : "";
        if (szoba) {
            p.set("minSzoba", szoba);
            if (szoba === "4") p.delete("maxSzoba"); else p.set("maxSzoba", szoba);
        }

        Object.entries(extra).forEach(([k, v]) => tesz(k, v));

        return p.toString();

    }

    static renderFilterBar() {
        const bar = document.getElementById("trendFilterBar");
        if (!bar) return;
        const chips = FilterManager.describe().map(c => `<span class="filterChip">${c}</span>`).join("");
        const szoba = document.getElementById("trendRooms").value;
        const extra = szoba ? `<span class="filterChip filterChipAccent"><i class="fa-solid fa-bed" aria-hidden="true"></i> ${Utils.escape(TrendStatistics.kulcsLabel("szobak", szoba))}</span>` : "";
        bar.innerHTML = `
            <div class="statFilterBar mb-4">
                <div class="statChips">${chips}${extra}</div>
                <a href="#properties" class="btn btn-sm btn-outline-primary text-nowrap">
                    <i class="fa-solid fa-sliders" aria-hidden="true"></i> ${I18n.t("statsChangeFilter")}
                </a>
            </div>`;
    }

    // Új adatok a szerverről (szűrő / időszak / bontás változott)
    static refresh() {

        if (!document.getElementById("trendChart")) return;

        TrendStatistics.renderFilterBar();

        const sorszam = ++TrendStatistics.keres;

        const q = TrendStatistics.params({
            tol: document.getElementById("trendFrom").value,
            ig: document.getElementById("trendTo").value,
            felbontas: document.getElementById("trendRes").value,
            bontas: document.getElementById("trendSplit").value
        });

        document.getElementById("trendSummary").innerHTML = `<span class="text-body-secondary small"><i class="fa-solid fa-spinner fa-spin"></i> ${I18n.t("loading")}</span>`;

        fetch("/api/statistics/piactrend?" + q)
            .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then(d => {
                if (sorszam !== TrendStatistics.keres) return;
                TrendStatistics.adat = d;
                TrendStatistics.draw();
            })
            .catch(err => {
                console.error(err);
                const s = document.getElementById("trendSummary");
                if (s) s.innerHTML = `<div class="alert alert-danger mb-0">${I18n.t("alertLoadError")}</div>`;
            });

    }

    static draw() {

        ChartStatistics.destroy();

        const d = TrendStatistics.adat;
        const summary = document.getElementById("trendSummary");
        const tabla = document.getElementById("trendTable");
        if (!d || !summary) return;

        const m = TrendStatistics.mutato(document.getElementById("trendMetric").value);
        const labels = d.idoszakok.map(TrendStatistics.idoszakLabel);

        // A csak az "összes" sorra értelmezett mutatóknál nincs bontás
        const sorozatok = m.csakOsszes ? d.sorozatok.slice(0, 1) : d.sorozatok;
        const fo = d.sorozatok[0];

        const ertek = p => {
            const v = p[m.id];
            if (v === null || v === undefined) return null;
            // Ahol nincs hirdetés, ott nincs pont (a vonal kihagyja)
            if (!p.n && m.id !== "n" && m.id !== "uj") return null;
            return m.id === "index" ? Math.round(v * 10) / 10 : Math.round(v);
        };

        if (!fo || fo.pontok.every(p => !p.n)) {
            summary.innerHTML = `<div class="alert alert-info mb-0">${I18n.t("trNoData")}</div>`;
            tabla.innerHTML = "";
            return;
        }

        // Összegzés: első és utolsó időszak, ahol van adat
        const ervenyes = fo.pontok.map((p, n) => ({ p, n })).filter(x => ertek(x.p) !== null);
        const elso = ervenyes[0], utolso = ervenyes[ervenyes.length - 1];

        let html = "";
        if (ervenyes.length >= 2) {
            html += `
                <div class="trendHeadline">
                    <span class="me-2">${TrendStatistics.idoszakLabel(d.idoszakok[elso.n])}: ${m.fmt(ertek(elso.p))}
                        <i class="fa-solid fa-arrow-right mx-1" aria-hidden="true"></i>
                        ${TrendStatistics.idoszakLabel(d.idoszakok[utolso.n])}: <b>${m.fmt(ertek(utolso.p))}</b></span>
                    ${CompareStatistics.changeBadge(CompareStatistics.change(ertek(elso.p), ertek(utolso.p)))}
                </div>`;
        } else {
            html += `<div class="alert alert-info mb-2">${I18n.t("trNeedTwo")}</div>`;
        }

        const keves = fo.pontok.some(p => p.n > 0 && p.n < 5);
        html += `<div class="small text-body-secondary mt-1">${I18n.f("trBasedOn", { n: Utils.num(d.hirdetesDb) })}${keves ? " · " + I18n.t("trFewWarning") : ""}</div>`;
        if (d.naploKezdet) {
            html += `<div class="small text-body-secondary">${I18n.f("trLogSince", { d: Utils.ago(d.naploKezdet) })}</div>`;
        }
        summary.innerHTML = html;

        // Grafikon
        const datasets = sorozatok.map((s, idx) => ({
            label: TrendStatistics.kulcsLabel(d.bontas, s.kulcs),
            data: s.pontok.map(ertek),
            darab: s.pontok.map(p => p.n),
            fo: idx === 0
        }));

        ChartStatistics.multiLine("trendChart", labels, datasets, m.fmt);

        // Táblázat (az összes hirdetésre)
        let elozo = null;
        tabla.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm statTable align-middle mb-0">
                    <thead>
                        <tr>
                            <th>${I18n.t("trPeriod")}</th>
                            <th class="text-end">${I18n.t("statsColCount")}</th>
                            <th class="text-end">${I18n.t("trMetricNew")}</th>
                            <th class="text-end">${I18n.t("trMetricMedianNm")}</th>
                            <th class="text-end d-none d-md-table-cell">${I18n.t("trTypicalNm")}</th>
                            <th class="text-end">${I18n.t("trMetricMedianPrice")}</th>
                            <th class="text-end">${I18n.t("compareChange")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${fo.pontok.map((p, n) => {
                            const v = p.n ? p.median_nm : null;
                            const valt = elozo && v ? CompareStatistics.changeBadge(CompareStatistics.change(elozo, v)) : "";
                            if (v) elozo = v;
                            return `
                                <tr class="${p.n && p.n < 5 ? "text-body-secondary" : ""}">
                                    <td>${TrendStatistics.idoszakLabel(d.idoszakok[n])}</td>
                                    <td class="text-end">${Utils.num(p.n)}</td>
                                    <td class="text-end">${Utils.num(p.uj)}</td>
                                    <td class="text-end fw-semibold">${p.n ? Utils.eurNm(p.median_nm) : "-"}</td>
                                    <td class="text-end d-none d-md-table-cell">${p.n >= 4 ? `${Utils.num(p.p25_nm)} – ${Utils.num(p.p75_nm)}` : "-"}</td>
                                    <td class="text-end">${p.n ? Utils.eur(p.median_ar) : "-"}</td>
                                    <td class="text-end">${valt}</td>
                                </tr>`;
                        }).join("")}
                    </tbody>
                </table>
            </div>`;

    }

    // ---------- Két időszak összevetése ----------

    static compare() {

        const box = document.getElementById("periodCompareResult");
        if (!box) return;

        const v = id => document.getElementById(id).value;

        if (!v("cmpATol") || !v("cmpBTol")) {
            box.innerHTML = `<div class="alert alert-warning mb-0">${I18n.t("trPickPeriods")}</div>`;
            return;
        }

        box.innerHTML = `<span class="text-body-secondary small"><i class="fa-solid fa-spinner fa-spin"></i> ${I18n.t("loading")}</span>`;

        const q = TrendStatistics.params({ aTol: v("cmpATol"), aIg: v("cmpAIg"), bTol: v("cmpBTol"), bIg: v("cmpBIg") });

        fetch("/api/statistics/osszevetes?" + q)
            .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then(d => { box.innerHTML = TrendStatistics.renderCompare(d); })
            .catch(err => {
                console.error(err);
                box.innerHTML = `<div class="alert alert-danger mb-0">${I18n.t("alertLoadError")}</div>`;
            });

    }

    static azonosSzoveg(az) {
        if (!az || !az.n) return `<span class="text-body-secondary">${I18n.t("trSameNone")}</span>`;
        return `${CompareStatistics.changeBadge(az.atlag)} <span class="small text-body-secondary ms-1">${I18n.f("trSameDetail", { n: az.n, up: az.emelt, down: az.csokkent })}</span>`;
    }

    static renderCompare(d) {

        const A = TrendStatistics.tartomanyLabel(d.a.kulcs);
        const B = TrendStatistics.tartomanyLabel(d.b.kulcs);

        if (!d.a.n && !d.b.n) return `<div class="alert alert-info mb-0">${I18n.t("trNoData")}</div>`;

        const kartya = (label, x, y, fmt) => `
            <div class="col-sm-6 col-xxl-3">
                <div class="compareCard">
                    <small>${label}</small>
                    <div class="compareValues">
                        <span>${fmt(x)}</span>
                        <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                        <b>${fmt(y)}</b>
                    </div>
                    ${CompareStatistics.changeBadge(CompareStatistics.change(x, y))}
                </div>
            </div>`;

        let html = `
            <div class="small text-body-secondary mb-2"><b>A</b>: ${Utils.escape(A)} &nbsp;·&nbsp; <b>B</b>: ${Utils.escape(B)}</div>
            <div class="row g-3 mb-3">
                ${kartya(I18n.t("dashLabelCount"), d.a.n, d.b.n, x => Utils.num(x))}
                ${kartya(I18n.t("trMetricMedianNm"), d.a.median_nm, d.b.median_nm, Utils.eurNm)}
                ${kartya(I18n.t("trMetricAvgNm"), d.a.atlag_nm, d.b.atlag_nm, Utils.eurNm)}
                ${kartya(I18n.t("trMetricMedianPrice"), d.a.median_ar, d.b.median_ar, Utils.eur)}
            </div>
            <div class="trendSameBox mb-4">
                <b><i class="fa-solid fa-tags" aria-hidden="true"></i> ${I18n.t("trSameTitle")}</b>
                <div>${TrendStatistics.azonosSzoveg(d.azonos)}</div>
                <div class="small text-body-secondary">${I18n.t("trSameNote")}</div>
            </div>`;

        if ((d.a.n && d.a.n < 5) || (d.b.n && d.b.n < 5)) {
            html += `<div class="alert alert-warning">${I18n.t("trFewWarning")}</div>`;
        }

        Object.entries(d.bontasok).forEach(([cat, sorok]) => {

            if (!sorok.length) return;

            const rend = sorok.slice().sort((x, y) => (y.a.n + y.b.n) - (x.a.n + x.b.n));
            if (cat === "szobak" || cat === "emelet") rend.sort((x, y) => (x.kulcs === "?" ? 99 : Number(x.kulcs)) - (y.kulcs === "?" ? 99 : Number(y.kulcs)));
            if (cat === "allapot") rend.sort((x, y) => Utils.allapotRank(x.kulcs) - Utils.allapotRank(y.kulcs));

            html += `
                <h6 class="mt-3">${TrendStatistics.bontasCim(cat)}</h6>
                <div class="table-responsive">
                    <table class="table table-sm statTable align-middle">
                        <thead>
                            <tr>
                                <th>${I18n.t("statsColCategory")}</th>
                                <th class="text-end">A · €/m²</th>
                                <th class="text-end">B · €/m²</th>
                                <th class="text-end">${I18n.t("compareChange")}</th>
                                <th class="text-end">${I18n.t("trCountAB")}</th>
                                <th class="text-end d-none d-md-table-cell">${I18n.t("trSameShort")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rend.map(r => `
                                <tr>
                                    <td>${Utils.escape(TrendStatistics.kulcsLabel(cat, r.kulcs))}</td>
                                    <td class="text-end">${r.a.n ? Utils.eurNm(r.a.median_nm) : "-"}</td>
                                    <td class="text-end fw-semibold">${r.b.n ? Utils.eurNm(r.b.median_nm) : "-"}</td>
                                    <td class="text-end">${CompareStatistics.changeBadge(r.a.n && r.b.n ? CompareStatistics.change(r.a.median_nm, r.b.median_nm) : null)}</td>
                                    <td class="text-end text-nowrap">${r.a.n} / ${r.b.n}</td>
                                    <td class="text-end d-none d-md-table-cell">${r.azonos && r.azonos.n ? CompareStatistics.changeBadge(r.azonos.atlag) : "-"}</td>
                                </tr>`).join("")}
                        </tbody>
                    </table>
                </div>`;

        });

        return html;

    }

}
