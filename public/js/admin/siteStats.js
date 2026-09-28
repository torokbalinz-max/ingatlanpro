// ============================================================
//  Admin – Látogatottság: látogatók, oldalmegtekintések, forgalmas
//  órák és napok, fiókok, aktivitás, az adatbázis telítettsége.
//  Adatok: GET /api/admin/oldalstat?napok=30 (server/routes/sitestats.js)
// ============================================================

(() => {

    const SZOVEG = {
        en: {
            adminTabSiteStats: "Site statistics",
            adminDescSiteStats: "Visitors, accounts, busy hours and database usage. Measured without cookies; your own visits as admin are not counted.",
            ssRange: "Period",
            ssDays: "{n} days",
            ssToday: "Visitors today",
            ssTodaySub: "{pv} page views today",
            ssOnline: "Online now",
            ssOnlineSub: "active in the last 5 minutes",
            ssPeriodPv: "Page views",
            ssPeriodPvSub: "{v} daily visitors in total",
            ssAccounts: "Accounts",
            ssAccountsSub: "+{n} new in this period",
            ssDaily: "Daily visitors",
            ssDailyNote: "Unique visitors per day. Hover a bar for page views.",
            ssVisitors: "visitors",
            ssPageviews: "page views",
            ssHours: "Busy hours",
            ssHoursNote: "Page views by hour of day (Romanian time), whole period.",
            ssWeekdays: "Busy days",
            ssWeekdaysNote: "Page views by day of the week.",
            ssNewAccounts: "New accounts per day",
            ssAccountsTitle: "Accounts",
            ssAccTotal: "All accounts",
            ssAccGoogle: "Signed up with Google",
            ssAccPassword: "With e-mail and password",
            ssAccActive: "Logged in in the last 30 days",
            ssAccBanned: "Banned",
            ssActivity: "Activity in this period",
            ssActListings: "Listings posted by users",
            ssActImports: "Imported listings",
            ssActMessages: "Messages sent",
            ssActRequests: "Search requests",
            ssActSearches: "Saved searches",
            ssActFavs: "Favourites added",
            ssActAgencies: "Agencies (total)",
            ssActReports: "Open content reports",
            ssPages: "Most visited pages",
            ssSources: "Where visitors come from",
            ssDirect: "Direct / unknown",
            ssDevices: "Devices",
            ssDev_mobil: "Phone",
            ssDev_tablet: "Tablet",
            ssDev_asztali: "Computer",
            ssLangs: "Languages",
            ssTopListings: "Most viewed listings",
            ssNoData: "No data yet.",
            ssDb: "Database usage",
            ssDbNote: "Approximate size of the database compared to the Neon free plan limit ({limit}). The exact figure is on the Neon dashboard (Project → Usage).",
            ssDbUsed: "{used} of {limit} used",
            ssDbOk: "Plenty of space",
            ssDbWarn: "Getting full – consider cleaning up",
            ssDbFull: "Almost full – writes will fail at 100%",
            ssDbTables: "Largest tables",
            ssShare: "share",
            ssCount: "count",
            ssPage_egyeb: "Other",
            ssDow1: "Mon", ssDow2: "Tue", ssDow3: "Wed", ssDow4: "Thu", ssDow5: "Fri", ssDow6: "Sat", ssDow7: "Sun",
            ssPrivacy: "Privacy: no cookies and no IP addresses are stored; a visitor is recognised only within the same day. Browsers with “Do Not Track” / GPC are not counted."
        },
        hu: {
            adminTabSiteStats: "Látogatottság",
            adminDescSiteStats: "Látogatók, fiókok, forgalmas órák és az adatbázis mérete. Sütik nélkül mérünk; a saját (admin) látogatásaid nem számítanak.",
            ssRange: "Időszak",
            ssDays: "{n} nap",
            ssToday: "Látogatók ma",
            ssTodaySub: "{pv} oldalmegtekintés ma",
            ssOnline: "Most az oldalon",
            ssOnlineSub: "az elmúlt 5 percben aktív",
            ssPeriodPv: "Oldalmegtekintés",
            ssPeriodPvSub: "összesen {v} napi látogató",
            ssAccounts: "Fiókok",
            ssAccountsSub: "+{n} új ebben az időszakban",
            ssDaily: "Napi látogatók",
            ssDailyNote: "Egyedi látogatók naponta. Az oszlop fölé állva az oldalmegtekintéseket is látod.",
            ssVisitors: "látogató",
            ssPageviews: "oldalmegtekintés",
            ssHours: "Forgalmas órák",
            ssHoursNote: "Oldalmegtekintések a nap órái szerint (romániai idő), a teljes időszakban.",
            ssWeekdays: "Forgalmas napok",
            ssWeekdaysNote: "Oldalmegtekintések a hét napjai szerint.",
            ssNewAccounts: "Új fiókok naponta",
            ssAccountsTitle: "Fiókok",
            ssAccTotal: "Összes fiók",
            ssAccGoogle: "Google-lel regisztrált",
            ssAccPassword: "E-mail + jelszó",
            ssAccActive: "Belépett az elmúlt 30 napban",
            ssAccBanned: "Letiltva",
            ssActivity: "Aktivitás az időszakban",
            ssActListings: "Felhasználók által feladott hirdetések",
            ssActImports: "Beolvasott hirdetések",
            ssActMessages: "Elküldött üzenetek",
            ssActRequests: "Keresési igények",
            ssActSearches: "Mentett keresések",
            ssActFavs: "Kedvencnek jelölések",
            ssActAgencies: "Ingatlanirodák (összesen)",
            ssActReports: "Nyitott tartalom-bejelentések",
            ssPages: "Legnézettebb oldalak",
            ssSources: "Honnan jönnek",
            ssDirect: "Közvetlen / ismeretlen",
            ssDevices: "Eszközök",
            ssDev_mobil: "Telefon",
            ssDev_tablet: "Tablet",
            ssDev_asztali: "Számítógép",
            ssLangs: "Nyelvek",
            ssTopListings: "Legnézettebb hirdetések",
            ssNoData: "Még nincs adat.",
            ssDb: "Adatbázis telítettsége",
            ssDbNote: "Az adatbázis becsült mérete a Neon ingyenes keretéhez ({limit}) képest. A pontos érték a Neon felületén látszik (Project → Usage).",
            ssDbUsed: "{used} / {limit} felhasználva",
            ssDbOk: "Bőven van hely",
            ssDbWarn: "Kezd megtelni – érdemes takarítani",
            ssDbFull: "Majdnem tele – 100%-nál az írás leáll",
            ssDbTables: "A legnagyobb táblák",
            ssShare: "arány",
            ssCount: "db",
            ssPage_egyeb: "Egyéb",
            ssDow1: "H", ssDow2: "K", ssDow3: "Sze", ssDow4: "Cs", ssDow5: "P", ssDow6: "Szo", ssDow7: "V",
            ssPrivacy: "Adatvédelem: nincs süti, IP-címet nem tárolunk; egy látogatót csak ugyanazon a napon belül ismerünk fel. A „Ne kövess” / GPC beállítású böngészőket nem számoljuk."
        },
        ro: {
            adminTabSiteStats: "Statistici vizite",
            adminDescSiteStats: "Vizitatori, conturi, ore aglomerate și dimensiunea bazei de date. Măsurăm fără cookie-uri; vizitele tale de admin nu se numără.",
            ssRange: "Perioadă",
            ssDays: "{n} zile",
            ssToday: "Vizitatori azi",
            ssTodaySub: "{pv} afișări de pagină azi",
            ssOnline: "Acum pe site",
            ssOnlineSub: "activi în ultimele 5 minute",
            ssPeriodPv: "Afișări de pagină",
            ssPeriodPvSub: "în total {v} vizitatori zilnici",
            ssAccounts: "Conturi",
            ssAccountsSub: "+{n} noi în această perioadă",
            ssDaily: "Vizitatori pe zi",
            ssDailyNote: "Vizitatori unici pe zi. Treci peste o coloană pentru afișări.",
            ssVisitors: "vizitatori",
            ssPageviews: "afișări",
            ssHours: "Ore aglomerate",
            ssHoursNote: "Afișări pe ore (ora României), în toată perioada.",
            ssWeekdays: "Zile aglomerate",
            ssWeekdaysNote: "Afișări pe zilele săptămânii.",
            ssNewAccounts: "Conturi noi pe zi",
            ssAccountsTitle: "Conturi",
            ssAccTotal: "Toate conturile",
            ssAccGoogle: "Înregistrați cu Google",
            ssAccPassword: "Cu e-mail și parolă",
            ssAccActive: "Autentificați în ultimele 30 de zile",
            ssAccBanned: "Blocați",
            ssActivity: "Activitate în perioadă",
            ssActListings: "Anunțuri publicate de utilizatori",
            ssActImports: "Anunțuri importate",
            ssActMessages: "Mesaje trimise",
            ssActRequests: "Cereri de căutare",
            ssActSearches: "Căutări salvate",
            ssActFavs: "Adăugări la favorite",
            ssActAgencies: "Agenții (total)",
            ssActReports: "Sesizări deschise",
            ssPages: "Cele mai vizitate pagini",
            ssSources: "De unde vin",
            ssDirect: "Direct / necunoscut",
            ssDevices: "Dispozitive",
            ssDev_mobil: "Telefon",
            ssDev_tablet: "Tabletă",
            ssDev_asztali: "Calculator",
            ssLangs: "Limbi",
            ssTopListings: "Cele mai văzute anunțuri",
            ssNoData: "Încă nu există date.",
            ssDb: "Ocuparea bazei de date",
            ssDbNote: "Dimensiunea aproximativă a bazei de date față de limita planului gratuit Neon ({limit}). Valoarea exactă este în panoul Neon (Project → Usage).",
            ssDbUsed: "{used} din {limit} folosiți",
            ssDbOk: "Spațiu suficient",
            ssDbWarn: "Se umple – merită făcută curățenie",
            ssDbFull: "Aproape plină – la 100% scrierile eșuează",
            ssDbTables: "Cele mai mari tabele",
            ssShare: "pondere",
            ssCount: "buc.",
            ssPage_egyeb: "Altele",
            ssDow1: "Lu", ssDow2: "Ma", ssDow3: "Mi", ssDow4: "Jo", ssDow5: "Vi", ssDow6: "Sâ", ssDow7: "Du",
            ssPrivacy: "Confidențialitate: fără cookie-uri, nu stocăm adrese IP; un vizitator este recunoscut doar în aceeași zi. Browserele cu „Do Not Track” / GPC nu sunt numărate."
        }
    };

    Object.keys(SZOVEG).forEach(l => {
        I18N_STRINGS[l] = Object.assign(I18N_STRINGS[l] || {}, SZOVEG[l]);
    });

})();

AdminManager.siteStatsNapok = 30;
AdminManager.siteStatsCharts = [];

AdminManager.renderSiteStats = function () {

    AdminManager.loading();

    const napok = AdminManager.siteStatsNapok;

    fetch("/api/admin/oldalstat?napok=" + napok)
        .then(r => r.json())
        .then(d => {
            if (d.error) throw new Error(d.message || d.error);
            AdminManager.siteStatsData = d;
            AdminManager.drawSiteStats(d);
        })
        .catch(err => {
            AdminManager.box().innerHTML = `<div class="alert alert-danger">${Utils.escape(err.message || "error")}</div>`;
        });

};

AdminManager.drawSiteStats = function (d) {

    const e = Utils.escape;
    const n = v => Utils.num(v || 0);
    const o = d.osszesites || {};
    const f = d.fiokok || {};
    const h = d.hirdetesStat || {};
    const a = d.aktivitas || {};
    const db = d.adatbazis || {};

    const mb = b => (b / 1024 / 1024).toLocaleString(Utils.locale(), { maximumFractionDigits: b < 10 * 1024 * 1024 ? 1 : 0 }) + " MB";
    const napiOssz = (d.napi || []).reduce((s, x) => s + x.latogatok, 0);

    const tile = (icon, color, label, value, sub) => `
        <div class="col-sm-6 col-xxl-3">
            <div class="kpiCard">
                <span class="kpiIcon ${color}"><i class="${icon}" aria-hidden="true"></i></span>
                <div>
                    <small>${label}</small>
                    <h3>${value}</h3>
                    ${sub ? `<p class="kpiNote">${sub}</p>` : ""}
                </div>
            </div>
        </div>`;

    // Rangsor-táblázat arány-sávval
    const lista = (cim, icon, sorok, cimke) => {
        const ossz = sorok.reduce((s, x) => s + x.n, 0) || 1;
        return `
            <div class="card h-100">
                <div class="card-header"><h5 class="mb-0"><i class="${icon}" aria-hidden="true"></i> ${cim}</h5></div>
                <div class="card-body">
                    ${sorok.length ? `
                        <table class="ssRank">
                            <tbody>
                                ${sorok.map(s => `
                                    <tr>
                                        <td class="ssRankLabel">${cimke(s)}</td>
                                        <td class="ssRankBar"><span style="width:${Math.max(2, Math.round(s.n / ossz * 100))}%"></span></td>
                                        <td class="ssRankNum">${n(s.n)}</td>
                                        <td class="ssRankPct">${Math.round(s.n / ossz * 100)}%</td>
                                    </tr>`).join("")}
                            </tbody>
                        </table>` : `<p class="text-body-secondary mb-0">${I18n.t("ssNoData")}</p>`}
                </div>
            </div>`;
    };

    const oldalNev = k => {
        const p = typeof PageManager !== "undefined" && PageManager.PAGES[k];
        return e(p ? I18n.t(p.label) : I18n.t("ssPage_" + k));
    };

    const nyelvNev = k => ({ hu: "Magyar", ro: "Română", en: "English" }[k] || "?");

    // Adatbázis
    const arany = db.limit ? db.bajt / db.limit : 0;
    const szazalek = Math.min(100, Math.round(arany * 1000) / 10);
    const dbAllapot = arany >= 0.9 ? "full" : (arany >= 0.7 ? "warn" : "ok");
    const dbIkon = { ok: "fa-circle-check", warn: "fa-triangle-exclamation", full: "fa-circle-exclamation" }[dbAllapot];
    const dbSzoveg = { ok: "ssDbOk", warn: "ssDbWarn", full: "ssDbFull" }[dbAllapot];

    const kartya = (icon, cim, note, canvas, magas = 260) => `
        <div class="card h-100">
            <div class="card-header">
                <h5 class="mb-0"><i class="${icon}" aria-hidden="true"></i> ${cim}</h5>
                ${note ? `<p class="sectionNote mb-0 mt-1">${note}</p>` : ""}
            </div>
            <div class="card-body"><div class="ssChart" style="height:${magas}px"><canvas id="${canvas}" role="img" aria-label="${e(cim)}"></canvas></div></div>
        </div>`;

    const sor = (label, value) => `<tr><th>${label}</th><td>${value}</td></tr>`;

    AdminManager.box().innerHTML = `

        <div class="ssToolbar mb-4">
            <span class="text-body-secondary small">${I18n.t("ssRange")}:</span>
            <div class="btn-group btn-group-sm" role="group">
                ${[7, 30, 90, 365].map(x => `<button type="button" class="btn ${x === d.napok ? "btn-primary" : "btn-outline-secondary"}" data-napok="${x}">${I18n.f("ssDays", { n: x })}</button>`).join("")}
            </div>
        </div>

        <div class="row g-3 g-xxl-4 mb-4">
            ${tile("fa-solid fa-users", "blue", I18n.t("ssToday"), n(o.ma_latogato), I18n.f("ssTodaySub", { pv: n(o.ma_pv) }))}
            ${tile("fa-solid fa-signal", "green", I18n.t("ssOnline"), n(o.online), I18n.t("ssOnlineSub"))}
            ${tile("fa-solid fa-eye", "cyan", I18n.t("ssPeriodPv") + " · " + I18n.f("ssDays", { n: d.napok }), n(o.idoszak_pv), I18n.f("ssPeriodPvSub", { v: n(napiOssz) }))}
            ${tile("fa-solid fa-user-plus", "orange", I18n.t("ssAccounts"), n(f.osszes), I18n.f("ssAccountsSub", { n: n(f.uj) }))}
        </div>

        <div class="row g-4 mb-4">
            <div class="col-12">${kartya("fa-solid fa-chart-column", I18n.t("ssDaily"), I18n.t("ssDailyNote"), "ssDailyChart", 280)}</div>
            <div class="col-xl-8">${kartya("fa-solid fa-clock", I18n.t("ssHours"), I18n.t("ssHoursNote"), "ssHourChart")}</div>
            <div class="col-xl-4">${kartya("fa-solid fa-calendar-week", I18n.t("ssWeekdays"), I18n.t("ssWeekdaysNote"), "ssDowChart")}</div>
        </div>

        <div class="row g-4 mb-4">
            <div class="col-xl-8">${kartya("fa-solid fa-user-plus", I18n.t("ssNewAccounts"), "", "ssAccChart", 240)}</div>
            <div class="col-xl-4">
                <div class="card h-100">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-id-card" aria-hidden="true"></i> ${I18n.t("ssAccountsTitle")}</h5></div>
                    <div class="card-body">
                        <table class="ssKV">
                            ${sor(I18n.t("ssAccTotal"), n(f.osszes))}
                            ${sor(I18n.t("ssAccGoogle"), n(f.google))}
                            ${sor(I18n.t("ssAccPassword"), n(f.jelszavas))}
                            ${sor(I18n.t("ssAccActive"), n(f.aktiv30))}
                            ${f.tiltott ? sor(I18n.t("ssAccBanned"), n(f.tiltott)) : ""}
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <div class="row g-4 mb-4">
            <div class="col-xl-4">
                <div class="card h-100">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-bolt" aria-hidden="true"></i> ${I18n.t("ssActivity")}</h5></div>
                    <div class="card-body">
                        <table class="ssKV">
                            ${sor(I18n.t("ssActListings"), n(h.uj_felhasznaloi))}
                            ${sor(I18n.t("ssActImports"), n(h.uj_import))}
                            ${sor(I18n.t("ssActMessages"), n(a.uzenetek))}
                            ${sor(I18n.t("ssActRequests"), n(a.igenyek))}
                            ${sor(I18n.t("ssActSearches"), n(a.keresesek))}
                            ${sor(I18n.t("ssActFavs"), n(a.kedvencek))}
                            ${sor(I18n.t("ssActAgencies"), n(a.irodak))}
                            ${sor(`<a href="#jogi/bejelentesek">${I18n.t("ssActReports")}</a>`, n(a.nyitott_bejelentes))}
                        </table>
                    </div>
                </div>
            </div>
            <div class="col-xl-4">${lista(I18n.t("ssPages"), "fa-solid fa-file-lines", d.oldalak || [], s => oldalNev(s.kulcs))}</div>
            <div class="col-xl-4">${lista(I18n.t("ssSources"), "fa-solid fa-arrow-right-to-bracket", d.forrasok || [], s => s.kulcs ? e(s.kulcs) : `<span class="text-body-secondary">${I18n.t("ssDirect")}</span>`)}</div>
        </div>

        <div class="row g-4 mb-4">
            <div class="col-xl-4">${lista(I18n.t("ssDevices"), "fa-solid fa-mobile-screen", d.eszkozok || [], s => I18n.t("ssDev_" + s.kulcs) !== "ssDev_" + s.kulcs ? I18n.t("ssDev_" + s.kulcs) : "?")}</div>
            <div class="col-xl-4">${lista(I18n.t("ssLangs"), "fa-solid fa-language", d.nyelvek || [], s => nyelvNev(s.kulcs))}</div>
            <div class="col-xl-4">${lista(I18n.t("ssTopListings"), "fa-solid fa-house", d.hirdetesek || [], s => `<a href="#listing/${s.id}">#${s.id} ${e(s.cim || s.varos || "")}</a>`)}</div>
        </div>

        <div class="card ssDb mb-3">
            <div class="card-header">
                <h5 class="mb-0"><i class="fa-solid fa-database" aria-hidden="true"></i> ${I18n.t("ssDb")}</h5>
                <p class="sectionNote mb-0 mt-1">${I18n.f("ssDbNote", { limit: mb(db.limit || 0) })}</p>
            </div>
            <div class="card-body">
                <div class="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-2">
                    <span class="ssDbPct">${szazalek.toLocaleString(Utils.locale())}%</span>
                    <span class="text-body-secondary">${I18n.f("ssDbUsed", { used: mb(db.bajt || 0), limit: mb(db.limit || 0) })}</span>
                </div>
                <div class="ssMeter ${dbAllapot}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${szazalek}" aria-label="${e(I18n.t("ssDb"))}">
                    <span style="width:${Math.max(1, szazalek)}%"></span>
                </div>
                <p class="ssDbState ${dbAllapot} mt-2 mb-3"><i class="fa-solid ${dbIkon}" aria-hidden="true"></i> ${I18n.t(dbSzoveg)}</p>
                <b class="small">${I18n.t("ssDbTables")}</b>
                <table class="ssRank mt-1">
                    <tbody>
                        ${(db.tablak || []).map(t => `
                            <tr>
                                <td class="ssRankLabel"><code>${e(t.tabla)}</code></td>
                                <td class="ssRankBar"><span style="width:${Math.max(2, Math.round(t.bajt / (db.bajt || 1) * 100))}%"></span></td>
                                <td class="ssRankNum">${mb(t.bajt)}</td>
                            </tr>`).join("")}
                    </tbody>
                </table>
            </div>
        </div>

        <p class="small text-body-secondary"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ${I18n.t("ssPrivacy")}</p>`;

    AdminManager.box().querySelectorAll("[data-napok]").forEach(b => {
        b.onclick = () => {
            AdminManager.siteStatsNapok = Number(b.dataset.napok);
            AdminManager.renderSiteStats();
        };
    });

    AdminManager.siteStatsGrafikonok(d);

};

AdminManager.siteStatsGrafikonok = function (d) {

    AdminManager.siteStatsCharts.forEach(c => c.destroy());
    AdminManager.siteStatsCharts = [];

    if (typeof Chart === "undefined") return;

    const dark = document.documentElement.getAttribute("data-bs-theme") === "dark";
    const szin = Utils.accent();
    const racs = dark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.07)";

    Chart.defaults.color = dark ? "#9ba6a1" : "#5b6560";
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

    const loc = Utils.locale();
    const napCimke = s => new Date(s + "T12:00:00").toLocaleDateString(loc, { month: "short", day: "numeric" });

    // Egy adatsoros oszlopdiagram (egy szín, jelmagyarázat nélkül – a cím nevezi meg)
    const oszlop = (id, labels, values, cimke, extra) => {
        const el = document.getElementById(id);
        if (!el) return;
        AdminManager.siteStatsCharts.push(new Chart(el, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: cimke,
                    data: values,
                    backgroundColor: szin,
                    hoverBackgroundColor: dark ? "#7fd0b8" : "#185a4a",
                    borderRadius: { topLeft: 4, topRight: 4 },
                    borderSkipped: "bottom",
                    maxBarThickness: 28,
                    categoryPercentage: 0.85,
                    barPercentage: 0.9
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 250 },
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        displayColors: false,
                        callbacks: {
                            label: ctx => `${Utils.num(ctx.parsed.y)} ${cimke}`,
                            afterLabel: extra ? ctx => extra(ctx.dataIndex) : undefined
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 10 } },
                    y: { beginAtZero: true, grid: { color: racs }, border: { display: false }, ticks: { precision: 0 } }
                }
            }
        }));
    };

    const napi = d.napi || [];

    oszlop("ssDailyChart", napi.map(x => napCimke(x.nap)), napi.map(x => x.latogatok), I18n.t("ssVisitors"),
        i => `${Utils.num(napi[i].pv)} ${I18n.t("ssPageviews")}`);

    const orak = Array.from({ length: 24 }, (_, i) => {
        const x = (d.orak || []).find(r => r.ora === i);
        return x ? x.pv : 0;
    });

    oszlop("ssHourChart", orak.map((_, i) => String(i).padStart(2, "0") + ":00"), orak, I18n.t("ssPageviews"));

    const het = [1, 2, 3, 4, 5, 6, 7].map(i => {
        const x = (d.hetnapok || []).find(r => r.nap === i);
        return x ? x.pv : 0;
    });

    oszlop("ssDowChart", [1, 2, 3, 4, 5, 6, 7].map(i => I18n.t("ssDow" + i)), het, I18n.t("ssPageviews"));

    const uj = (d.fiokok && d.fiokok.napi) || [];

    oszlop("ssAccChart", uj.map(x => napCimke(x.nap)), uj.map(x => x.n), I18n.t("ssAccounts").toLowerCase());

};

// Sötét / világos mód váltásakor a grafikonok színei is váltsanak
new MutationObserver(() => {
    if (AdminManager.tab === "sitestats" && AdminManager.siteStatsData && document.getElementById("ssDailyChart")) {
        AdminManager.siteStatsGrafikonok(AdminManager.siteStatsData);
    }
}).observe(document.documentElement, { attributes: true, attributeFilter: ["data-bs-theme"] });
