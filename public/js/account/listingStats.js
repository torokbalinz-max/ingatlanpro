// ============================================================
//  Fiókom → Hirdetéseim → Látogatottság
//  Hányan nézték meg a hirdetéseimet, kedvencek, érdeklődők.
//  A részletes rész (napi grafikon, látogatók, honnan jöttek, eszközök,
//  hirdetésenkénti görbe) a "Részletes statisztika" csomaggal jár – a
//  szerver dönti el (pro), itt csak megjelenítjük vagy ajánljuk.
// ============================================================

class ListingStats {

    static napok = 30;
    static chart = null;
    static adat = null;

    static betolt(napok) {
        return fetch("/api/sajat-hirdetesek/statisztika?napok=" + (napok || ListingStats.napok))
            .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
    }

    // A Hirdetéseim és a Látogatottság nézet közti váltó
    static valto(aktiv) {
        return `
            <div class="accSubTabs" role="tablist">
                <a class="accSubTab ${aktiv === "hirdetesek" ? "active" : ""}" href="#fiok/hirdetesek" role="tab" aria-selected="${aktiv === "hirdetesek"}"><i class="fa-solid fa-house-user" aria-hidden="true"></i> ${I18n.t("accTabListings")}</a>
                <a class="accSubTab ${aktiv === "statisztika" ? "active" : ""}" href="#fiok/statisztika" role="tab" aria-selected="${aktiv === "statisztika"}"><i class="fa-solid fa-chart-simple" aria-hidden="true"></i> ${I18n.t("lsTab")}</a>
            </div>`;
    }

    static render(el) {

        el.innerHTML = ListingStats.valto("statisztika") + `<div id="lsBody"><div class="emptyState"><div class="spinner-border text-primary"></div></div></div>`;

        ListingStats.betolt().then(d => {
            ListingStats.adat = d;
            ListingStats.rajzol(document.getElementById("lsBody"), d);
        }).catch(() => {
            const b = document.getElementById("lsBody");
            if (b) b.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
        });

    }

    static szam(v) { return v === null || v === undefined ? "–" : Utils.num(v); }

    static rajzol(box, d) {

        if (!box) return;
        const esc = Utils.escape;
        const o = d.osszesen;

        if (!d.hirdetesek.length) {
            box.innerHTML = `
                <div class="emptyState">
                    <i class="fa-solid fa-chart-simple"></i>
                    <h5>${I18n.t("lsEmpty")}</h5>
                    <a class="btn btn-primary btn-sm mt-2" href="#new"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("navPost")}</a>
                </div>`;
            return;
        }

        const kpi = (ikon, cim, ertek, al, zarolt) => `
            <div class="lsKpi ${zarolt ? "isLocked" : ""}">
                <span class="lsKpiIcon" aria-hidden="true"><i class="${ikon}"></i></span>
                <small>${cim}</small>
                <b>${zarolt ? `<i class="fa-solid fa-lock" aria-hidden="true"></i>` : ertek}</b>
                ${al ? `<span>${al}</span>` : ""}
            </div>`;

        const sorok = [...d.hirdetesek].sort((a, b) => b.megtekintes - a.megtekintes || b.megtekintes_ossz - a.megtekintes_ossz);
        const maxN = Math.max(1, ...sorok.map(h => h.megtekintes));

        const gorbe = arr => {
            if (!arr || !arr.length) return "";
            const max = Math.max(1, ...arr);
            const w = 96, hgt = 26, lep = w / Math.max(1, arr.length - 1);
            const pontok = arr.map((v, n) => `${(n * lep).toFixed(1)},${(hgt - 2 - (v / max) * (hgt - 4)).toFixed(1)}`).join(" ");
            return `<svg class="lsSpark" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" aria-hidden="true" focusable="false"><polyline points="${pontok}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
        };

        const lista = (cim, ikon, sorok2, nev) => {
            const ossz = sorok2.reduce((s, x) => s + x.n, 0) || 1;
            return `
                <div class="lsCard">
                    <h6><i class="${ikon}" aria-hidden="true"></i> ${cim}</h6>
                    ${sorok2.length ? `<ul class="lsBars">${sorok2.map(x => `
                        <li><span class="lsBarName">${esc(nev(x.k))}</span>
                            <span class="lsBarTrack"><span style="width:${Math.max(3, Math.round(x.n / ossz * 100))}%"></span></span>
                            <span class="lsBarVal">${Math.round(x.n / ossz * 100)} %</span></li>`).join("")}</ul>`
                        : `<p class="small text-body-secondary mb-0">${I18n.t("lsNoData")}</p>`}
                </div>`;
        };

        box.innerHTML = `
            <div class="lsHead">
                <div>
                    <h3 class="lsTitle">${I18n.t("lsTitle")}</h3>
                    <p class="text-body-secondary mb-0 small">${I18n.t("lsNote")}</p>
                </div>
                <div class="lsPeriod" role="group" aria-label="${esc(I18n.t("lsPeriod"))}">
                    ${[7, 30, 90].map(n => `<button type="button" class="${n === d.napok ? "active" : ""}" data-ls-napok="${n}" aria-pressed="${n === d.napok}">${I18n.f("lsDays", { n })}</button>`).join("")}
                </div>
            </div>

            <div class="lsKpis">
                ${kpi("fa-solid fa-eye", I18n.t("lsViews"), ListingStats.szam(o.megtekintes), I18n.f("lsViewsSub", { het: Utils.num(o.het), ossz: Utils.num(o.megtekintes_ossz) }))}
                ${kpi("fa-solid fa-user-group", I18n.t("lsVisitors"), ListingStats.szam(o.latogato), d.pro ? I18n.t("lsVisitorsSub") : I18n.t("lsProOnly"), !d.pro)}
                ${kpi("fa-solid fa-star", I18n.t("lsFavs"), ListingStats.szam(o.kedvenc), I18n.t("lsFavsSub"))}
                ${kpi("fa-solid fa-envelope", I18n.t("lsInquiries"), ListingStats.szam(o.erdeklodo), I18n.t("lsInquiriesSub"))}
            </div>

            ${d.pro ? `
                <div class="lsCard lsChartCard">
                    <h6><i class="fa-solid fa-chart-column" aria-hidden="true"></i> ${I18n.t("lsDaily")}</h6>
                    <div class="lsChartBox"><canvas id="lsChart" role="img" aria-label="${esc(I18n.t("lsDaily"))}"></canvas></div>
                </div>
                <div class="lsTwo">
                    ${lista(I18n.t("lsSources"), "fa-solid fa-arrow-right-to-bracket", d.forrasok || [], k => k ? k : I18n.t("lsDirect"))}
                    ${lista(I18n.t("lsDevices"), "fa-solid fa-mobile-screen", d.eszkozok || [], k => I18n.t("lsDevice_" + k))}
                </div>` : `
                <div class="lsUpsell">
                    <span class="lsUpsellIcon" aria-hidden="true"><i class="fa-solid fa-chart-line"></i></span>
                    <div>
                        <b>${I18n.t("lsUpsellTitle")}</b>
                        <span>${I18n.t("lsUpsellText")}</span>
                    </div>
                    <a class="btn btn-primary btn-sm" href="#csomagok">${I18n.t("lsUpsellBtn")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
                </div>`}

            <div class="lsCard lsTableCard">
                <h6><i class="fa-solid fa-list" aria-hidden="true"></i> ${I18n.t("lsPerListing")}</h6>
                <div class="lsRows">
                    ${sorok.map(h => `
                        <a class="lsRow" href="#listing/${h.id}">
                            <span class="lsThumb">${h.kep ? `<img src="${esc(h.kep)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<i class="${Types.get(h.tipus).icon}" aria-hidden="true"></i>`}</span>
                            <span class="lsRowMain">
                                <b>${esc(h.cim || `${Types.label(h.tipus)} · ${CityManager.displayName(h.varos)}`)}</b>
                                <small>${esc(CityManager.helyLabel(h))} · ${Utils.price(h)}${h.statusz !== "aktiv" ? ` · <span class="text-warning-emphasis">${I18n.t("lsNotLive")}</span>` : ""}</small>
                                <span class="lsRowBar" aria-hidden="true"><span style="width:${Math.round(h.megtekintes / maxN * 100)}%"></span></span>
                            </span>
                            <span class="lsRowSpark">${d.pro ? gorbe(h.napi) : ""}</span>
                            <span class="lsRowNums">
                                <span title="${esc(I18n.t("lsViews"))}"><i class="fa-solid fa-eye" aria-hidden="true"></i> <b>${Utils.num(h.megtekintes)}</b></span>
                                <span title="${esc(I18n.t("lsFavs"))}"><i class="fa-solid fa-star" aria-hidden="true"></i> ${Utils.num(h.kedvenc)}</span>
                                <span title="${esc(I18n.t("lsInquiries"))}"><i class="fa-solid fa-envelope" aria-hidden="true"></i> ${Utils.num(h.erdeklodo)}</span>
                                <small>${h.utolso ? I18n.f("lsLastView", { t: Utils.ago(h.utolso) }) : I18n.t("lsNoViewYet")}</small>
                            </span>
                        </a>`).join("")}
                </div>
            </div>`;

        box.querySelectorAll("[data-ls-napok]").forEach(b => {
            b.onclick = () => {
                ListingStats.napok = Number(b.dataset.lsNapok);
                box.style.opacity = ".55";
                ListingStats.betolt(ListingStats.napok).then(uj => {
                    box.style.opacity = "";
                    ListingStats.adat = uj;
                    ListingStats.rajzol(box, uj);
                }).catch(() => { box.style.opacity = ""; });
            };
        });

        if (d.pro && d.napi && typeof Chart !== "undefined") ListingStats.grafikon(d);

    }

    static grafikon(d) {

        const el = document.getElementById("lsChart");
        if (!el) return;
        if (ListingStats.chart) { ListingStats.chart.destroy(); ListingStats.chart = null; }

        const sotet = document.documentElement.getAttribute("data-bs-theme") === "dark";
        const szin = getComputedStyle(document.body).getPropertyValue("--ip-accent").trim() || "#1b6a55";
        const cimke = d.napi.map(x => new Date(x.nap + "T12:00:00").toLocaleDateString(Utils.locale(), { month: "short", day: "numeric" }));

        ListingStats.chart = new Chart(el, {
            type: "bar",
            data: {
                labels: cimke,
                datasets: [
                    { label: I18n.t("lsViews"), data: d.napi.map(x => x.n), backgroundColor: szin, borderRadius: 4, maxBarThickness: 22 },
                    { label: I18n.t("lsVisitors"), data: d.napi.map(x => x.l), type: "line", borderColor: sotet ? "#e8c46a" : "#b07a1a", backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: .35 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 600 },
                interaction: { mode: "index", intersect: false },
                plugins: { legend: { position: "bottom", labels: { color: sotet ? "#cbd5e1" : "#475569", boxWidth: 12 } } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: sotet ? "#9fb3aa" : "#64748b", maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
                    y: { beginAtZero: true, ticks: { precision: 0, color: sotet ? "#9fb3aa" : "#64748b" }, grid: { color: sotet ? "rgba(148,163,184,.14)" : "rgba(15,23,42,.06)" } }
                }
            }
        });

    }

}
