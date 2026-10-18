// ============================================================
//  Admin – Pénzügyek (1/2): közös segédek, Áttekintés, Ügyfelek,
//  Díjcsomagok, Kiadások, Beállítások
//  (Díjbekérők / számlák és Előfizetések: financeInvoices.js)
//
//  A weboldal bevételei rendszerezve: kitől (ügyfél: magánszemély, iroda,
//  reklámozó cég), miért (kategória: iroda-előfizetés, extra hirdetés,
//  reklámmentes, részletes statisztika, kiemelés, reklámfelület), mikor
//  (díjbekérő, fizetve / lejárt). A kiadásokkal együtt havi eredmény.
//
//  A szerver: server/routes/penzugy.js, server/services/penzugy.js
// ============================================================

AdminManager.fin = {
    cfg: null,              // beállítások + listák + üzemeltető
    csomagok: null,
    ugyfelek: null,
    kiadasok: null,
    kiSzuro: { ev: null, kat: "" },
    ugySzuro: ""
};

AdminManager.FIN_KAT_IKON = {
    iroda_elofizetes: "fa-solid fa-briefcase", extra_hirdetes: "fa-solid fa-layer-group", reklammentes: "fa-solid fa-eye-slash",
    pro_statisztika: "fa-solid fa-chart-line", kiemeles: "fa-solid fa-star", reklamfelulet: "fa-solid fa-rectangle-ad", egyeb: "fa-solid fa-circle-dot"
};

// ---------- Közös segédek ----------

AdminManager.finApi = function (ut, opts = {}) {
    const o = { cache: "no-store", ...opts };
    if (o.body && typeof o.body !== "string") {
        o.headers = { "Content-Type": "application/json", ...(o.headers || {}) };
        o.body = JSON.stringify(o.body);
    }
    return fetch("/api/admin/penzugy/" + ut, o).then(r => r.json().catch(() => ({})).then(v => {
        if (!r.ok) {
            const e = new Error(v.error || ("HTTP " + r.status));
            e.kod = v.error;
            throw e;
        }
        return v;
    }));
};

// Hibaüzenet a szerver hibakódjából
AdminManager.finHiba = function (e) {
    const kod = e && e.kod;
    const kulcs = kod ? "finErr_" + kod : null;
    const sz = kulcs && I18n.t(kulcs) !== kulcs ? I18n.t(kulcs) : I18n.t("alertSaveError");
    alert(sz);
};

AdminManager.finCfg = function (frissit) {
    if (AdminManager.fin.cfg && !frissit) return Promise.resolve(AdminManager.fin.cfg);
    return AdminManager.finApi("beallitas").then(v => { AdminManager.fin.cfg = v; return v; });
};

AdminManager.finPenz = function (v, penznem) {
    if (v === null || v === undefined || isNaN(v)) return "–";
    return `${Utils.num(Number(v), Math.round(v) === Number(v) ? 0 : 2)} ${penznem || "RON"}`;
};

AdminManager.finNap = function (d) {
    if (!d) return "–";
    const x = new Date(String(d).slice(0, 10) + "T12:00:00");
    return isNaN(x) ? "–" : x.toLocaleDateString(Utils.locale(), { year: "numeric", month: "short", day: "numeric" });
};

AdminManager.finHo = function (ho) {
    const x = new Date(ho + "-15T12:00:00");
    return x.toLocaleDateString(Utils.locale(), { month: "short" });
};

AdminManager.finMa = function () {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

AdminManager.finKatLabel = k => I18n.t("finCat_" + (k || "egyeb"));
AdminManager.finIdoszakLabel = k => I18n.t("finPeriod_" + (k || "havi"));

// Csomag neve a felület nyelvén
AdminManager.finCsomagNev = function (c) {
    if (!c) return "";
    if (I18n.current === "ro" && c.nev_ro) return c.nev_ro;
    if (I18n.current === "en" && c.nev_en) return c.nev_en;
    return c.nev;
};

// Egy ablak (Bootstrap modal) – újrahasznosítva
AdminManager.finModal = function (azon, meret = "modal-lg") {
    let el = document.getElementById(azon);
    if (!el) {
        el = document.createElement("div");
        el.id = azon;
        el.className = "modal fade";
        el.tabIndex = -1;
        el.setAttribute("aria-hidden", "true");
        document.body.appendChild(el);
    }
    el.innerHTML = `<div class="modal-dialog ${meret} modal-dialog-scrollable modal-fullscreen-md-down"><div class="modal-content"></div></div>`;
    return { el, tartalom: el.querySelector(".modal-content"), modal: bootstrap.Modal.getOrCreateInstance(el) };
};

AdminManager.finTile = function (icon, color, label, value, sub, go) {
    return `
        <div class="col-sm-6 col-xxl-3">
            <${go ? `button type="button" data-fin-go="${go}"` : "div"} class="kpiCard ${go ? "kpiLink" : ""} w-100 h-100">
                <span class="kpiIcon ${color}"><i class="${icon}" aria-hidden="true"></i></span>
                <div class="text-start">
                    <small>${label}</small>
                    <h3>${value}</h3>
                    ${sub ? `<p class="kpiNote">${sub}</p>` : ""}
                </div>
            </${go ? "button" : "div"}>
        </div>`;
};

// Románia megyéi (ISO 3166-2:RO) – az e-Facturához
AdminManager.MEGYEK = [["AB", "Alba"], ["AR", "Arad"], ["AG", "Argeș"], ["BC", "Bacău"], ["BH", "Bihor"], ["BN", "Bistrița-Năsăud"], ["BT", "Botoșani"],
    ["BV", "Brașov"], ["BR", "Brăila"], ["B", "București"], ["BZ", "Buzău"], ["CS", "Caraș-Severin"], ["CL", "Călărași"], ["CJ", "Cluj"], ["CT", "Constanța"],
    ["CV", "Covasna"], ["DB", "Dâmbovița"], ["DJ", "Dolj"], ["GL", "Galați"], ["GR", "Giurgiu"], ["GJ", "Gorj"], ["HR", "Harghita"], ["HD", "Hunedoara"],
    ["IL", "Ialomița"], ["IS", "Iași"], ["IF", "Ilfov"], ["MM", "Maramureș"], ["MH", "Mehedinți"], ["MS", "Mureș"], ["NT", "Neamț"], ["OT", "Olt"],
    ["PH", "Prahova"], ["SM", "Satu Mare"], ["SJ", "Sălaj"], ["SB", "Sibiu"], ["SV", "Suceava"], ["TR", "Teleorman"], ["TM", "Timiș"], ["TL", "Tulcea"],
    ["VS", "Vaslui"], ["VL", "Vâlcea"], ["VN", "Vrancea"]];

AdminManager.finBindGo = function (box) {
    box.querySelectorAll("[data-fin-go]").forEach(b => { b.onclick = () => AdminManager.open(b.dataset.finGo); });
};

AdminManager.finHibaDoboz = function () {
    AdminManager.box().innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
};

// ===================== ÁTTEKINTÉS =====================

AdminManager.renderFinOverview = function () {

    AdminManager.loading();

    Promise.all([AdminManager.finApi("attekintes"), AdminManager.finCfg(true)]).then(([a]) => {

        const box = AdminManager.box();
        const esc = Utils.escape;
        const p = v => AdminManager.finPenz(v, "RON");
        const eredmeny = (a.honap.bevetel || 0) - (a.honap.kiadas || 0);
        const b = a.beallitas || {};

        // Teendők
        const teendok = [];
        if (a.lejartDb) teendok.push(`
            <div class="todoItem">
                <span class="kpiIcon red"><i class="fa-solid fa-clock" aria-hidden="true"></i></span>
                <span class="flex-fill">${I18n.f("finTodoLate", { n: a.lejartDb, osszeg: esc(p(a.lejartOsszeg)) })}</span>
                <button type="button" class="btn btn-sm btn-outline-primary text-nowrap" data-fin-szamlak="lejart">${I18n.t("ovOpen")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
            </div>`);
        if (a.esedekes) teendok.push(`
            <div class="todoItem">
                <span class="kpiIcon orange"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i></span>
                <span class="flex-fill">${I18n.f("finTodoDue", { n: a.esedekes })}</span>
                <button type="button" class="btn btn-sm btn-primary text-nowrap" id="finMakeDue"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${I18n.t("finMakeDue")}</button>
            </div>`);
        (a.szamlazatlanReklamok || []).slice(0, 6).forEach(r => teendok.push(`
            <div class="todoItem">
                <span class="kpiIcon purple"><i class="fa-solid fa-rectangle-ad" aria-hidden="true"></i></span>
                <span class="flex-fill">${I18n.f("finTodoAd", { nev: esc(r.nev), hirdeto: esc(r.hirdeto || "–"), ar: esc(AdminManager.finPenz(r.ar, b.penznem)) })}</span>
                <button type="button" class="btn btn-sm btn-outline-primary text-nowrap" data-fin-go="reklam">${I18n.t("ovOpen")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
            </div>`));
        if (!b.iban) teendok.push(`
            <div class="todoItem">
                <span class="kpiIcon cyan"><i class="fa-solid fa-building-columns" aria-hidden="true"></i></span>
                <span class="flex-fill">${I18n.t("finTodoBank")}</span>
                <button type="button" class="btn btn-sm btn-outline-primary text-nowrap" data-fin-go="penzugyBeall">${I18n.t("ovOpen")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
            </div>`);

        // Kategóriák (idén, fizetve)
        const kat = Object.entries(a.kategoriak || {}).sort((x, y) => y[1] - x[1]);
        const katMax = Math.max(1, ...kat.map(k => k[1]));

        box.innerHTML = `

            <div class="row g-3 g-xxl-4 mb-4">
                ${AdminManager.finTile("fa-solid fa-sack-dollar", "green", I18n.t("finKpiIncomeMonth"), esc(p(a.honap.bevetel)),
                    I18n.f("finKpiIncomeYear", { osszeg: esc(p(a.ev.bevetel)) }), "szamlak")}
                ${AdminManager.finTile("fa-solid fa-hourglass-half", a.lejartDb ? "red" : "orange", I18n.t("finKpiOpen"), esc(p(a.kintlevoseg)),
                    a.lejartDb ? `<span class="text-danger">${I18n.f("finKpiLate", { n: a.lejartDb, osszeg: esc(p(a.lejartOsszeg)) })}</span>` : I18n.f("finKpiOpenSub", { n: a.nyitottDb }), "szamlak")}
                ${AdminManager.finTile("fa-solid fa-arrows-rotate", "blue", I18n.t("finKpiMrr"), esc(p(a.mrr)),
                    I18n.f("finKpiMrrSub", { n: a.aktivElofizetes }), "elofizetesek")}
                ${AdminManager.finTile("fa-solid fa-scale-balanced", eredmeny >= 0 ? "cyan" : "red", I18n.t("finKpiResult"), esc(p(eredmeny)),
                    I18n.f("finKpiResultSub", { kiadas: esc(p(a.honap.kiadas)) }), "kiadasok")}
            </div>

            <div class="card mb-4">
                <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i> ${I18n.t("ovTodo")}</h5></div>
                <div class="card-body">
                    ${teendok.length ? `<div class="todoList">${teendok.join("")}</div>` : `
                        <div class="emptyState py-3">
                            <i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i>
                            <h5>${I18n.t("ovTodoNone")}</h5>
                        </div>`}
                </div>
            </div>

            <div class="row g-4 mb-4">
                <div class="col-xl-8">
                    <div class="card h-100">
                        <div class="card-header d-flex flex-wrap align-items-center gap-2">
                            <h5 class="mb-0 flex-fill"><i class="fa-solid fa-chart-column" aria-hidden="true"></i> ${I18n.t("finChartTitle")}</h5>
                            <span class="finLegend small">
                                <span><i class="finSw in"></i> ${I18n.t("finIncome")}</span>
                                <span><i class="finSw out"></i> ${I18n.t("finExpense")}</span>
                            </span>
                        </div>
                        <div class="card-body">
                            ${AdminManager.finChart(a.havi)}
                            <p class="small text-body-secondary mb-0 mt-2">${I18n.f("finChartNote", { arfolyam: Utils.num(b.eur_arfolyam, 4) })}</p>
                        </div>
                    </div>
                </div>
                <div class="col-xl-4">
                    <div class="card h-100">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-chart-pie" aria-hidden="true"></i> ${I18n.t("finByCategory")}</h5></div>
                        <div class="card-body">
                            ${kat.length ? `<div class="finCatList">${kat.map(([k, v]) => `
                                <div class="finCatRow">
                                    <div class="d-flex justify-content-between gap-2 small">
                                        <span><i class="${AdminManager.FIN_KAT_IKON[k] || AdminManager.FIN_KAT_IKON.egyeb}" aria-hidden="true"></i> ${esc(AdminManager.finKatLabel(k))}</span>
                                        <b>${esc(p(v))}</b>
                                    </div>
                                    <div class="finBar"><span style="width:${Math.max(2, v / katMax * 100).toFixed(1)}%"></span></div>
                                </div>`).join("")}</div>` : `<p class="text-body-secondary small mb-0">${I18n.t("finByCategoryEmpty")}</p>`}
                        </div>
                    </div>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header d-flex flex-wrap align-items-center gap-2">
                    <h5 class="mb-0 flex-fill"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${I18n.t("finRecent")}</h5>
                    <button type="button" class="btn btn-outline-primary btn-sm" data-fin-go="szamlak">${I18n.t("finAllInvoices")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
                </div>
                <div class="card-body">
                    ${(a.utolsok || []).length ? `<div class="finList">${a.utolsok.map(s => AdminManager.finSzamlaSorRovid(s)).join("")}</div>` : `
                        <div class="emptyState py-3">
                            <i class="fa-solid fa-file-invoice" aria-hidden="true"></i>
                            <h5>${I18n.t("finNoInvoices")}</h5>
                            <p>${I18n.t("finNoInvoicesHint")}</p>
                        </div>`}
                </div>
            </div>`;

        AdminManager.finBindGo(box);
        box.querySelectorAll("[data-fin-szamlak]").forEach(btn => {
            btn.onclick = () => { AdminManager.fin.szSzuro = { ...(AdminManager.fin.szSzuro || {}), nezet: "fizetesre", allapot: "" }; AdminManager.open("szamlak"); };
        });
        box.querySelectorAll("[data-fin-open]").forEach(btn => {
            btn.onclick = () => AdminManager.finSzamlaSzerk(Number(btn.dataset.finOpen), () => AdminManager.renderFinOverview());
        });
        const uj = document.getElementById("finNewInvoice");
        if (uj) uj.onclick = () => AdminManager.finSzamlaSzerk(null, () => AdminManager.renderFinOverview());
        box.querySelectorAll("[data-fin-ad]").forEach(btn => {
            const r = (a.szamlazatlanReklamok || []).find(x => x.id === Number(btn.dataset.finAd));
            btn.onclick = () => AdminManager.finSzamlaSzerk(null, () => AdminManager.renderFinOverview(), { reklam: r });
        });
        const due = document.getElementById("finMakeDue");
        if (due) due.onclick = () => AdminManager.finEsedekesKeszit(due, () => AdminManager.renderFinOverview());

    }).catch(() => AdminManager.finHibaDoboz());

};

// 12 havi oszlopdiagram: bevétel (fizetve) és kiadás, RON-ban
AdminManager.finChart = function (havi) {

    havi = havi || [];
    const max = Math.max(1, ...havi.map(h => Math.max(h.bevetel, h.kiadas)));
    // "Szép" felső határ a rácshoz
    const lepes = Math.pow(10, Math.floor(Math.log10(max)));
    const felso = Math.ceil(max / lepes) * lepes;
    const W = 720, H = 240, bal = 52, lent = 26, fent = 8;
    const sz = (W - bal - 8) / Math.max(1, havi.length);
    const oszlop = Math.min(18, (sz - 10) / 2);
    const y = v => fent + (H - fent - lent) * (1 - v / felso);
    const esc = Utils.escape;
    const p = v => AdminManager.finPenz(v, "RON");

    const racs = [0, 0.5, 1].map(f => {
        const v = felso * f;
        return `<line x1="${bal}" x2="${W - 4}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="finGrid"/>
                <text x="${bal - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="finAxis">${esc(Utils.num(v))}</text>`;
    }).join("");

    // Felül lekerekített oszlop (4px), az alapvonalon szögletes
    const rud = (x, v, cls, cimke) => {
        if (!(v > 0)) return "";
        const yy = y(v), h = (H - lent) - yy, r = Math.min(4, h, oszlop / 2);
        const d = `M${x},${H - lent} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + oszlop - r} Q${x + oszlop},${yy} ${x + oszlop},${yy + r} V${H - lent} Z`;
        return `<path d="${d}" class="${cls}"><title>${esc(cimke)}</title></path>`;
    };

    const oszlopok = havi.map((h, i) => {
        const x0 = bal + i * sz + (sz - (oszlop * 2 + 2)) / 2;
        const ho = AdminManager.finHo(h.ho);
        return `
            <g class="finCol">
                <rect x="${bal + i * sz}" y="${fent}" width="${sz}" height="${H - fent - lent}" class="finHit"><title>${esc(`${h.ho} · ${I18n.t("finIncome")}: ${p(h.bevetel)} · ${I18n.t("finExpense")}: ${p(h.kiadas)}`)}</title></rect>
                ${rud(x0, h.bevetel, "finIn", `${h.ho} · ${I18n.t("finIncome")}: ${p(h.bevetel)}`)}
                ${rud(x0 + oszlop + 2, h.kiadas, "finOut", `${h.ho} · ${I18n.t("finExpense")}: ${p(h.kiadas)}`)}
                <text x="${(bal + i * sz + sz / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="finAxis">${esc(ho)}</text>
            </g>`;
    }).join("");

    return `
        <div class="finChartWrap">
            <svg viewBox="0 0 ${W} ${H}" class="finChart" role="img" aria-label="${esc(I18n.t("finChartTitle"))}">
                ${racs}
                <line x1="${bal}" x2="${W - 4}" y1="${H - lent}" y2="${H - lent}" class="finBase"/>
                ${oszlopok}
            </svg>
        </div>
        <details class="small mt-2">
            <summary>${I18n.t("finShowTable")}</summary>
            <div class="table-responsive mt-2">
                <table class="table table-sm mb-0">
                    <thead><tr><th>${I18n.t("finMonth")}</th><th class="text-end">${I18n.t("finIncome")}</th><th class="text-end">${I18n.t("finIssued")}</th><th class="text-end">${I18n.t("finExpense")}</th></tr></thead>
                    <tbody>${havi.map(h => `<tr><td>${h.ho}</td><td class="text-end">${esc(p(h.bevetel))}</td><td class="text-end">${esc(p(h.kiallitva))}</td><td class="text-end">${esc(p(h.kiadas))}</td></tr>`).join("")}</tbody>
                </table>
            </div>
        </details>`;

};

// ===================== ÜGYFELEK =====================

AdminManager.renderFinCustomers = function () {

    AdminManager.loading();

    Promise.all([AdminManager.finApi("ugyfelek"), AdminManager.finCfg()]).then(([lista]) => {

        AdminManager.fin.ugyfelek = lista;
        const box = AdminManager.box();
        const esc = Utils.escape;
        const q = (AdminManager.fin.ugySzuro || "").toLowerCase();
        const szurt = q ? lista.filter(u => [u.nev, u.cui, u.email, u.iroda_nev, u.fiok].some(v => String(v || "").toLowerCase().includes(q))) : lista;
        const tart = u => [u.tartozas_ron ? AdminManager.finPenz(u.tartozas_ron, "RON") : "", u.tartozas_eur ? AdminManager.finPenz(u.tartozas_eur, "EUR") : ""].filter(Boolean).join(" + ");
        const fiz = u => [u.fizetve_ron ? AdminManager.finPenz(u.fizetve_ron, "RON") : "", u.fizetve_eur ? AdminManager.finPenz(u.fizetve_eur, "EUR") : ""].filter(Boolean).join(" + ") || "–";

        box.innerHTML = `
            <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                <div class="input-group input-group-sm finSearch">
                    <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
                    <input type="search" class="form-control" id="finUgyQ" value="${esc(AdminManager.fin.ugySzuro || "")}" placeholder="${esc(I18n.t("finSearchCustomer"))}" aria-label="${esc(I18n.t("finSearchCustomer"))}">
                </div>
                <button type="button" class="btn btn-primary btn-sm ms-auto" id="finUgyUj"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${I18n.t("finNewCustomer")}</button>
            </div>
            <p class="sectionNote">${I18n.t("finCustomersNote")}</p>
            ${szurt.length ? `<div class="finList">${szurt.map(u => `
                <article class="finRow">
                    <span class="kpiIcon ${u.tipus === "ceg" ? "blue" : u.tipus === "pfa" ? "cyan" : "green"}"><i class="fa-solid ${u.iroda_id ? "fa-briefcase" : u.tipus === "maganszemely" ? "fa-user" : "fa-building"}" aria-hidden="true"></i></span>
                    <div class="finMain">
                        <b>${esc(u.nev)}</b>
                        <div class="small text-body-secondary">
                            ${esc(I18n.t("finCustType_" + u.tipus))}${u.cui ? ` · CUI ${esc(u.cui)}` : ""}${u.email ? ` · ${esc(u.email)}` : ""}
                            ${u.iroda_nev ? ` · <i class="fa-solid fa-briefcase" aria-hidden="true"></i> ${esc(u.iroda_nev)}` : ""}
                            ${u.fiok ? ` · <i class="fa-solid fa-user" aria-hidden="true"></i> ${esc(u.fiok)}` : ""}
                        </div>
                        <div class="small">
                            ${u.aktiv_elofizetes ? `<span class="badge text-bg-primary">${I18n.f("finActiveSubs", { n: u.aktiv_elofizetes })}</span>` : ""}
                            <span class="text-body-secondary">${I18n.f("finPaidTotal", { osszeg: esc(fiz(u)) })}</span>
                            ${tart(u) ? ` · <span class="text-danger">${I18n.f("finOwes", { osszeg: esc(tart(u)) })}</span>` : ""}
                        </div>
                    </div>
                    <div class="finActions">
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-ugy-szamlak="${u.id}"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${I18n.f("finInvoicesN", { n: u.szamlak })}</button>
                        <button type="button" class="btn btn-sm btn-outline-primary" data-ugy-szamla="${u.id}"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("finNewInvoiceShort")}</button>
                        <button type="button" class="btn btn-sm btn-outline-primary" data-ugy-szerk="${u.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("adsEdit")}</button>
                    </div>
                </article>`).join("")}</div>` : `
                <div class="emptyState py-4">
                    <i class="fa-solid fa-address-book" aria-hidden="true"></i>
                    <h5>${I18n.t(lista.length ? "finNothingFound" : "finNoCustomers")}</h5>
                    ${lista.length ? "" : `<p>${I18n.t("finNoCustomersHint")}</p>`}
                </div>`}`;

        const qi = document.getElementById("finUgyQ");
        qi.oninput = () => {
            clearTimeout(AdminManager.fin.qTimer);
            AdminManager.fin.qTimer = setTimeout(() => {
                AdminManager.fin.ugySzuro = qi.value;
                AdminManager.renderFinCustomers();
                setTimeout(() => { const x = document.getElementById("finUgyQ"); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 0);
            }, 300);
        };
        document.getElementById("finUgyUj").onclick = () => AdminManager.finUgyfelSzerk(null, () => AdminManager.renderFinCustomers());
        box.querySelectorAll("[data-ugy-szerk]").forEach(b => {
            b.onclick = () => AdminManager.finUgyfelSzerk(lista.find(u => u.id === Number(b.dataset.ugySzerk)), () => AdminManager.renderFinCustomers());
        });
        box.querySelectorAll("[data-ugy-szamla]").forEach(b => {
            b.onclick = () => AdminManager.finSzamlaSzerk(null, () => AdminManager.renderFinCustomers(), { ugyfel_id: Number(b.dataset.ugySzamla) });
        });
        box.querySelectorAll("[data-ugy-szamlak]").forEach(b => {
            b.onclick = () => { AdminManager.fin.szSzuro = { nezet: "minden", allapot: "", ho: "", ugyfel: Number(b.dataset.ugySzamlak), q: "" }; AdminManager.open("szamlak"); };
        });

    }).catch(() => AdminManager.finHibaDoboz());

};

// Ügyfél szerkesztése / új ügyfél. Új ügyfélnél: egy regisztrált irodából /
// fiókból egy kattintással kitölthető, a cégadatok az ANAF-tól.
AdminManager.finUgyfelSzerk = function (u, kesz) {

    const uj = !u;
    u = u || { tipus: "ceg" };
    const esc = Utils.escape;
    const { tartalom, modal, el } = AdminManager.finModal("finUgyfelModal", "modal-lg");
    const tipusok = (AdminManager.fin.cfg && AdminManager.fin.cfg.listak.ugyfelTipusok) || ["maganszemely", "pfa", "ceg"];

    tartalom.innerHTML = `
        <div class="modal-header">
            <h5 class="modal-title"><i class="fa-solid fa-address-card" aria-hidden="true"></i> ${I18n.t(uj ? "finNewCustomer" : "finEditCustomer")}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
        </div>
        <div class="modal-body">
            ${uj ? `
                <div class="finPick mb-3">
                    <label class="form-label small mb-1" for="fuJavQ"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ${I18n.t("finPickFrom")}</label>
                    <input type="search" class="form-control form-control-sm" id="fuJavQ" placeholder="${esc(I18n.t("finPickFromPh"))}" autocomplete="off">
                    <div class="finPickList" id="fuJavLista"></div>
                </div>` : ""}
            <form id="fuForm" class="row g-2" novalidate>
                <div class="col-sm-4">
                    <label class="form-label small mb-1" for="fuTipus">${I18n.t("finCustType")}</label>
                    <select class="form-select form-select-sm" id="fuTipus">${tipusok.map(t => `<option value="${t}" ${u.tipus === t ? "selected" : ""}>${esc(I18n.t("finCustType_" + t))}</option>`).join("")}</select>
                </div>
                <div class="col-sm-8">
                    <label class="form-label small mb-1" for="fuNev">${I18n.t("finCustName")} *</label>
                    <input class="form-control form-control-sm" id="fuNev" value="${esc(u.nev || "")}" required maxlength="200">
                </div>
                <div class="col-sm-4">
                    <label class="form-label small mb-1" for="fuCui">${I18n.t("finCui")}</label>
                    <div class="input-group input-group-sm">
                        <input class="form-control" id="fuCui" value="${esc(u.cui || "")}" maxlength="20" inputmode="numeric">
                        <button type="button" class="btn btn-outline-secondary" id="fuAnaf" title="${esc(I18n.t("finAnafFill"))}"><i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i> ANAF</button>
                    </div>
                </div>
                <div class="col-sm-4">
                    <label class="form-label small mb-1" for="fuReg">${I18n.t("finRegCom")}</label>
                    <input class="form-control form-control-sm" id="fuReg" value="${esc(u.reg_com || "")}" maxlength="40">
                </div>
                <div class="col-sm-4">
                    <label class="form-label small mb-1" for="fuTel">${I18n.t("finPhone")}</label>
                    <input class="form-control form-control-sm" id="fuTel" value="${esc(u.telefon || "")}" maxlength="40">
                </div>
                <div class="col-sm-8">
                    <label class="form-label small mb-1" for="fuCim">${I18n.t("finAddress")}</label>
                    <input class="form-control form-control-sm" id="fuCim" value="${esc(u.cim || "")}" maxlength="400">
                </div>
                <div class="col-sm-4">
                    <label class="form-label small mb-1" for="fuEmail">${I18n.t("finEmail")}</label>
                    <input type="email" class="form-control form-control-sm" id="fuEmail" value="${esc(u.email || "")}" maxlength="160">
                </div>
                <div class="col-sm-4">
                    <label class="form-label small mb-1" for="fuVaros">${I18n.t("finCity")}</label>
                    <input class="form-control form-control-sm" id="fuVaros" value="${esc(u.varos || "")}" maxlength="80" placeholder="Sfântu Gheorghe">
                </div>
                <div class="col-sm-4">
                    <label class="form-label small mb-1" for="fuMegye">${I18n.t("finCounty")}</label>
                    <select class="form-select form-select-sm" id="fuMegye">
                        <option value="">–</option>
                        ${AdminManager.MEGYEK.map(([k, n]) => `<option value="RO-${k}" ${u.megye === "RO-" + k ? "selected" : ""}>${esc(n)}</option>`).join("")}
                    </select>
                </div>
                <div class="col-sm-2">
                    <label class="form-label small mb-1" for="fuOrszag">${I18n.t("finCountry")}</label>
                    <input class="form-control form-control-sm text-uppercase" id="fuOrszag" value="${esc(u.orszag || "RO")}" maxlength="2" pattern="[A-Za-z]{2}">
                </div>
                <div class="col-sm-2 d-flex align-items-end">
                    <div class="form-check mb-1">
                        <input class="form-check-input" type="checkbox" id="fuAfa" ${u.afa_alany ? "checked" : ""}>
                        <label class="form-check-label small" for="fuAfa">${I18n.t("finVatPayer")}</label>
                    </div>
                </div>
                <div class="col-12 small text-body-secondary">${I18n.t("finAddrHint")}</div>
                <div class="col-12">
                    <label class="form-label small mb-1" for="fuJegyzet">${I18n.t("finNote")}</label>
                    <textarea class="form-control form-control-sm" id="fuJegyzet" rows="2" maxlength="2000">${esc(u.jegyzet || "")}</textarea>
                </div>
                <input type="hidden" id="fuUser" value="${u.user_id || ""}">
                <input type="hidden" id="fuIroda" value="${u.iroda_id || ""}">
                <div class="col-12 small text-body-secondary" id="fuKapcsolat">${AdminManager.finUgyKapcsolat(u)}</div>
                <div class="col-12 small text-danger" id="fuAnafMsg" hidden></div>
            </form>
        </div>
        <div class="modal-footer">
            ${!uj ? `<button type="button" class="btn btn-outline-danger me-auto" id="fuTorol"><i class="fa-solid fa-trash" aria-hidden="true"></i> ${I18n.t("finDelete")}</button>` : ""}
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
            <button type="button" class="btn btn-primary" id="fuMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button>
        </div>`;

    const $ = s => tartalom.querySelector(s);

    // Irodából / fiókból
    if (uj) {
        let jav = { irodak: [], fiokok: [] };
        const rajzol = () => {
            const lista = $("#fuJavLista");
            const sor = (tipus, x, ikon, cim, al) => `
                <button type="button" class="finPickItem" data-jav="${tipus}:${x.id}">
                    <i class="fa-solid ${ikon}" aria-hidden="true"></i>
                    <span><b>${esc(cim)}</b><small>${esc(al)}</small></span>
                </button>`;
            lista.innerHTML = [
                ...jav.irodak.map(i => sor("iroda", i, "fa-briefcase", i.nev, [i.hivatalos_nev, i.cui ? "CUI " + i.cui : "", i.statusz ? I18n.t("finAgSt_" + i.statusz) : ""].filter(Boolean).join(" · "))),
                ...jav.fiokok.map(f => sor("fiok", f, "fa-user", f.nev || f.email, [f.email, I18n.f("finListingsN", { n: f.hirdetesek })].filter(Boolean).join(" · ")))
            ].join("") || `<p class="small text-body-secondary mb-0 px-2 py-1">${I18n.t("finNothingFound")}</p>`;
            lista.querySelectorAll("[data-jav]").forEach(b => {
                b.onclick = () => {
                    const [t, idS] = b.dataset.jav.split(":");
                    const x = (t === "iroda" ? jav.irodak : jav.fiokok).find(y => y.id === Number(idS));
                    if (!x) return;
                    if (t === "iroda") {
                        $("#fuTipus").value = "ceg";
                        $("#fuNev").value = x.hivatalos_nev || x.nev || "";
                        $("#fuCui").value = x.cui || "";
                        $("#fuReg").value = x.reg_com || "";
                        $("#fuCim").value = x.cim || "";
                        $("#fuEmail").value = x.email || "";
                        $("#fuTel").value = x.telefon || "";
                        $("#fuIroda").value = x.id;
                        $("#fuUser").value = x.vezeto_id || "";
                        $("#fuKapcsolat").innerHTML = AdminManager.finUgyKapcsolat({ iroda_nev: x.nev });
                    } else {
                        $("#fuTipus").value = "maganszemely";
                        $("#fuNev").value = x.nev || "";
                        $("#fuEmail").value = x.email || "";
                        $("#fuTel").value = x.telefon || "";
                        $("#fuUser").value = x.id;
                        $("#fuIroda").value = "";
                        $("#fuKapcsolat").innerHTML = AdminManager.finUgyKapcsolat({ fiok: x.felhasznalonev || x.email || x.nev });
                    }
                    lista.innerHTML = "";
                    $("#fuJavQ").value = "";
                };
            });
        };
        const keres = () => AdminManager.finApi("ugyfel-javaslat?q=" + encodeURIComponent($("#fuJavQ").value.trim()))
            .then(v => { jav = v; rajzol(); }).catch(() => { });
        let t = null;
        $("#fuJavQ").oninput = () => { clearTimeout(t); t = setTimeout(keres, 250); };
        $("#fuJavQ").onfocus = () => { if (!$("#fuJavLista").innerHTML) keres(); };
    }

    // Cégadatok az ANAF-tól
    $("#fuAnaf").onclick = () => {
        const cui = $("#fuCui").value.trim();
        const msg = $("#fuAnafMsg");
        msg.hidden = true;
        if (!cui) { $("#fuCui").focus(); return; }
        const btn = $("#fuAnaf");
        btn.disabled = true;
        fetch("/api/anaf/" + encodeURIComponent(cui))
            .then(r => r.json().then(v => ({ ok: r.ok, v })))
            .then(({ ok, v }) => {
                // a válasz: { cui, talalt, adat: { nev, cim, regCom, telefon, telepules, megye, tva, ... } }
                const a = (v && v.adat) || {};
                if (!ok || !v.talalt || !a.nev) {
                    msg.hidden = false;
                    msg.textContent = I18n.t(v.error === "cui_checksum" || v.error === "bad_cui" ? "finAnafBadCui" : ok && !v.talalt ? "finAnafNotFound" : "finAnafError");
                    return;
                }
                $("#fuNev").value = a.nev;
                if (a.cim) $("#fuCim").value = a.cim;
                if (a.regCom) $("#fuReg").value = a.regCom;
                if (a.telefon && !$("#fuTel").value) $("#fuTel").value = a.telefon;
                if (a.telepules) $("#fuVaros").value = String(a.telepules).replace(/^(mun\.|ors\.|oraș|municipiul|com\.|sat)\s*/i, "").trim();
                if (a.megye) {
                    const n = String(a.megye).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                    const talal = AdminManager.MEGYEK.find(([k, nev]) => n.includes(nev.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()) || (k === "B" && n.includes("bucuresti")));
                    if (talal) $("#fuMegye").value = "RO-" + talal[0];
                }
                $("#fuOrszag").value = "RO";
                $("#fuAfa").checked = !!a.tva;
                $("#fuTipus").value = /PFA|INTREPRINDERE|ÎNTREPRINDERE/i.test(a.nev) ? "pfa" : "ceg";
                $("#fuCui").value = (a.cui || v.cui || cui);
                if (a.inaktiv || a.torolve) { msg.hidden = false; msg.textContent = I18n.t("finAnafInactive"); }
            })
            .catch(() => { msg.hidden = false; msg.textContent = I18n.t("finAnafError"); })
            .finally(() => { btn.disabled = false; });
    };

    $("#fuMent").onclick = () => {
        const nev = $("#fuNev").value.trim();
        if (!nev) { $("#fuNev").classList.add("is-invalid"); $("#fuNev").focus(); return; }
        const d = {
            tipus: $("#fuTipus").value, nev, cui: $("#fuCui").value, reg_com: $("#fuReg").value, cim: $("#fuCim").value,
            email: $("#fuEmail").value, telefon: $("#fuTel").value, jegyzet: $("#fuJegyzet").value,
            varos: $("#fuVaros").value, megye: $("#fuMegye").value, orszag: $("#fuOrszag").value || "RO", afa_alany: $("#fuAfa").checked,
            user_id: $("#fuUser").value || null, iroda_id: $("#fuIroda").value || null
        };
        $("#fuMent").disabled = true;
        AdminManager.finApi("ugyfelek" + (uj ? "" : "/" + u.id), { method: uj ? "POST" : "PUT", body: d })
            .then(v => { modal.hide(); AdminManager.fin.ugyfelek = null; if (kesz) kesz(v.id); })
            .catch(e => { $("#fuMent").disabled = false; AdminManager.finHiba(e); });
    };

    const torol = $("#fuTorol");
    if (torol) torol.onclick = () => {
        if (!confirm(I18n.f("finDeleteCustomerConfirm", { nev: u.nev }))) return;
        AdminManager.finApi("ugyfelek/" + u.id, { method: "DELETE" })
            .then(() => { modal.hide(); AdminManager.fin.ugyfelek = null; if (kesz) kesz(); })
            .catch(AdminManager.finHiba);
    };

    el.addEventListener("shown.bs.modal", () => { const f = $(uj ? "#fuJavQ" : "#fuNev"); if (f) f.focus(); }, { once: true });
    modal.show();

};

AdminManager.finUgyKapcsolat = function (u) {
    const esc = Utils.escape;
    const r = [];
    if (u.iroda_nev) r.push(`<i class="fa-solid fa-briefcase" aria-hidden="true"></i> ${I18n.f("finLinkedAgency", { nev: esc(u.iroda_nev) })}`);
    if (u.fiok) r.push(`<i class="fa-solid fa-user" aria-hidden="true"></i> ${I18n.f("finLinkedAccount", { nev: esc(u.fiok) })}`);
    return r.length ? r.join(" · ") + ` <span class="d-block">${I18n.t("finLinkedNote")}</span>` : "";
};

// ===================== DÍJCSOMAGOK =====================

AdminManager.renderFinPackages = function () {

    AdminManager.loading();

    Promise.all([AdminManager.finApi("csomagok"), AdminManager.finCfg()]).then(([lista]) => {

        AdminManager.fin.csomagok = lista;
        const box = AdminManager.box();
        const esc = Utils.escape;

        const jogok = j => {
            j = j || {};
            const r = [];
            if (j.korlatlan_hirdetes) r.push(I18n.t("finRightUnlimited"));
            else if (j.hirdetes_limit !== undefined) r.push(I18n.f("finRightLimit", { n: j.hirdetes_limit }));
            if (j.hirdetes_plusz) r.push(I18n.f("finRightPlus", { n: j.hirdetes_plusz }));
            if (j.reklammentes) r.push(I18n.t("finRightAdFree"));
            if (j.pro_statisztika) r.push(I18n.t("finRightProStats"));
            if (j.kiemeles) r.push(I18n.f("finRightFeatured", { n: j.kiemeles }));
            if (j.iroda_profil) r.push(I18n.t("finRightAgency"));
            if (j.profil_kiemeles) r.push(I18n.f("finRightProfileFeat", { n: j.profil_kiemeles }));
            return r.map(x => `<span class="badge text-bg-light">${esc(x)}</span>`).join(" ");
        };

        box.innerHTML = `
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <p class="sectionNote mb-0 flex-fill">${I18n.t("finPackagesNote")}</p>
                <button type="button" class="btn btn-primary btn-sm" id="finCsUj"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("finNewPackage")}</button>
            </div>
            <div class="finPkgGrid">
                ${lista.map(c => `
                    <article class="finPkg ${c.aktiv ? "" : "off"}">
                        <div class="d-flex align-items-start gap-2">
                            <span class="kpiIcon ${c.aktiv ? "green" : ""}"><i class="${AdminManager.FIN_KAT_IKON[c.kategoria] || AdminManager.FIN_KAT_IKON.egyeb}" aria-hidden="true"></i></span>
                            <div class="flex-fill">
                                <b>${esc(AdminManager.finCsomagNev(c))}</b>
                                <div class="small text-body-secondary">${esc(AdminManager.finKatLabel(c.kategoria))}${c.aktiv ? "" : ` · ${I18n.t("finInactive")}`}</div>
                                <div class="mt-1 d-flex flex-wrap gap-1">
                                    <span class="badge text-bg-light"><i class="fa-solid ${c.celcsoport === "iroda" ? "fa-briefcase" : c.celcsoport === "maganszemely" ? "fa-user" : "fa-users"}" aria-hidden="true"></i> ${esc(I18n.t("finAud_" + (c.celcsoport || "mindenki")))}</span>
                                    ${c.nyilvanos === false ? `<span class="badge text-bg-secondary">${I18n.t("finHidden")}</span>` : ""}
                                    ${c.kiemelt ? `<span class="badge text-bg-warning">${I18n.t("prPopular")}</span>` : ""}
                                </div>
                            </div>
                        </div>
                        <div class="finPkgPrice">${esc(AdminManager.finPenz(c.ar, c.penznem))} <small>/ ${esc(AdminManager.finIdoszakLabel(c.idoszak))}</small></div>
                        ${c.leiras ? `<p class="small mb-2">${esc(c.leiras)}</p>` : ""}
                        <div class="mb-2">${jogok(c.jogosultsag)}</div>
                        <div class="d-flex flex-wrap align-items-center gap-2 mt-auto">
                            <span class="small text-body-secondary flex-fill">${I18n.f("finSubscribersN", { n: c.elofizetok })}${c.rendelesek ? ` · ${I18n.f("finOrdersN", { n: c.rendelesek })}` : ""}${c.fizetesre_var ? ` · <span class="text-warning">${I18n.f("finAwaitingN", { n: c.fizetesre_var })}</span>` : ""}</span>
                            <button type="button" class="btn btn-sm btn-outline-primary" data-cs-szerk="${c.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("adsEdit")}</button>
                        </div>
                    </article>`).join("") || `<p class="text-body-secondary">${I18n.t("finNoPackages")}</p>`}
            </div>`;

        document.getElementById("finCsUj").onclick = () => AdminManager.finCsomagSzerk(null);
        box.querySelectorAll("[data-cs-szerk]").forEach(b => {
            b.onclick = () => AdminManager.finCsomagSzerk(lista.find(c => c.id === Number(b.dataset.csSzerk)));
        });

    }).catch(() => AdminManager.finHibaDoboz());

};

AdminManager.finCsomagSzerk = function (c) {

    const uj = !c;
    c = c || { kategoria: "egyeb", idoszak: "havi", penznem: "RON", aktiv: true, jogosultsag: {} };
    const j = c.jogosultsag || {};
    const esc = Utils.escape;
    const L = AdminManager.fin.cfg.listak;
    const { tartalom, modal } = AdminManager.finModal("finCsomagModal", "modal-lg");

    tartalom.innerHTML = `
        <div class="modal-header">
            <h5 class="modal-title"><i class="fa-solid fa-tag" aria-hidden="true"></i> ${I18n.t(uj ? "finNewPackage" : "finEditPackage")}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
        </div>
        <div class="modal-body">
            <div class="row g-2">
                <div class="col-sm-8">
                    <label class="form-label small mb-1" for="fcNev">${I18n.t("finPkgName")} (HU) *</label>
                    <input class="form-control form-control-sm" id="fcNev" value="${esc(c.nev || "")}" maxlength="160">
                </div>
                <div class="col-sm-4">
                    <label class="form-label small mb-1" for="fcKat">${I18n.t("finCategory")}</label>
                    <select class="form-select form-select-sm" id="fcKat">${L.kategoriak.map(k => `<option value="${k}" ${c.kategoria === k ? "selected" : ""}>${esc(AdminManager.finKatLabel(k))}</option>`).join("")}</select>
                </div>
                <div class="col-sm-6">
                    <label class="form-label small mb-1" for="fcNevRo">${I18n.t("finPkgName")} (RO)</label>
                    <input class="form-control form-control-sm" id="fcNevRo" value="${esc(c.nev_ro || "")}" maxlength="160">
                </div>
                <div class="col-sm-6">
                    <label class="form-label small mb-1" for="fcNevEn">${I18n.t("finPkgName")} (EN)</label>
                    <input class="form-control form-control-sm" id="fcNevEn" value="${esc(c.nev_en || "")}" maxlength="160">
                </div>
                <div class="col-6 col-sm-4">
                    <label class="form-label small mb-1" for="fcAr">${I18n.t("finPrice")}</label>
                    <input type="number" min="0" step="0.01" class="form-control form-control-sm" id="fcAr" value="${c.ar ?? ""}">
                </div>
                <div class="col-6 col-sm-4">
                    <label class="form-label small mb-1" for="fcPenznem">${I18n.t("finCurrency")}</label>
                    <select class="form-select form-select-sm" id="fcPenznem">${L.penznemek.map(p => `<option ${c.penznem === p ? "selected" : ""}>${p}</option>`).join("")}</select>
                </div>
                <div class="col-sm-4">
                    <label class="form-label small mb-1" for="fcIdoszak">${I18n.t("finPeriod")}</label>
                    <select class="form-select form-select-sm" id="fcIdoszak">${L.idoszakok.map(p => `<option value="${p}" ${c.idoszak === p ? "selected" : ""}>${esc(AdminManager.finIdoszakLabel(p))}</option>`).join("")}</select>
                </div>
                <div class="col-12">
                    <label class="form-label small mb-1" for="fcLeiras">${I18n.t("finDescription")} (HU)</label>
                    <textarea class="form-control form-control-sm" id="fcLeiras" rows="2" maxlength="1000">${esc(c.leiras || "")}</textarea>
                </div>
            </div>
            <h6 class="mt-3 mb-1">${I18n.t("finPricePage")}</h6>
            <p class="small text-body-secondary mb-2">${I18n.t("finPricePageNote")}</p>
            <div class="row g-2">
                <div class="col-sm-4">
                    <label class="form-label small mb-1" for="fcCel">${I18n.t("finAudience")}</label>
                    <select class="form-select form-select-sm" id="fcCel">
                        ${["maganszemely", "iroda", "mindenki"].map(k => `<option value="${k}" ${(c.celcsoport || "mindenki") === k ? "selected" : ""}>${esc(I18n.t("finAud_" + k))}</option>`).join("")}
                    </select>
                </div>
                <div class="col-sm-4 d-flex align-items-end">
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" role="switch" id="fcNyilv" ${c.nyilvanos !== false ? "checked" : ""}>
                        <label class="form-check-label small" for="fcNyilv">${I18n.t("finPublic")}</label>
                    </div>
                </div>
                <div class="col-sm-4 d-flex align-items-end">
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" role="switch" id="fcKiemelt" ${c.kiemelt ? "checked" : ""}>
                        <label class="form-check-label small" for="fcKiemelt">${I18n.t("finHighlighted")}</label>
                    </div>
                </div>
                <div class="col-sm-6">
                    <label class="form-label small mb-1" for="fcLeirasRo">${I18n.t("finDescription")} (RO)</label>
                    <textarea class="form-control form-control-sm" id="fcLeirasRo" rows="2" maxlength="1000">${esc(c.leiras_ro || "")}</textarea>
                </div>
                <div class="col-sm-6">
                    <label class="form-label small mb-1" for="fcLeirasEn">${I18n.t("finDescription")} (EN)</label>
                    <textarea class="form-control form-control-sm" id="fcLeirasEn" rows="2" maxlength="1000">${esc(c.leiras_en || "")}</textarea>
                </div>
                ${[["fcElony", "elonyok", "HU"], ["fcElonyRo", "elonyok_ro", "RO"], ["fcElonyEn", "elonyok_en", "EN"]].map(([id, k, ny]) => `
                    <div class="col-sm-4">
                        <label class="form-label small mb-1" for="${id}">${I18n.t("finBenefits")} (${ny})</label>
                        <textarea class="form-control form-control-sm" id="${id}" rows="4" maxlength="2000" placeholder="${esc(I18n.t("finBenefitsPh"))}">${esc(c[k] || "")}</textarea>
                    </div>`).join("")}
            </div>
            <h6 class="mt-3 mb-1">${I18n.t("finRights")}</h6>
            <p class="small text-body-secondary mb-2">${I18n.t("finRightsNote")}</p>
            <div class="row g-2 align-items-end">
                <div class="col-6 col-sm-4">
                    <label class="form-label small mb-1" for="fcLimit">${I18n.t("finRightLimitLabel")}</label>
                    <input type="number" min="0" step="1" class="form-control form-control-sm" id="fcLimit" value="${j.hirdetes_limit ?? ""}" placeholder="–">
                </div>
                <div class="col-6 col-sm-4">
                    <label class="form-label small mb-1" for="fcPlusz">${I18n.t("finRightPlusLabel")}</label>
                    <input type="number" min="0" step="1" class="form-control form-control-sm" id="fcPlusz" value="${j.hirdetes_plusz ?? ""}" placeholder="–">
                </div>
                <div class="col-6 col-sm-4">
                    <label class="form-label small mb-1" for="fcKiemeles">${I18n.t("finRightFeaturedLabel")}</label>
                    <input type="number" min="0" step="1" class="form-control form-control-sm" id="fcKiemeles" value="${j.kiemeles ?? ""}" placeholder="–">
                </div>
                <div class="col-6 col-sm-4">
                    <label class="form-label small mb-1" for="fcKiemelesNap">${I18n.t("finRightFeaturedDays")}</label>
                    <input type="number" min="1" max="365" step="1" class="form-control form-control-sm" id="fcKiemelesNap" value="${j.kiemeles_nap ?? ""}" placeholder="7">
                </div>
                <div class="col-6 col-sm-4">
                    <label class="form-label small mb-1" for="fcProfilKiemeles">${I18n.t("finRightProfileFeatLabel")}</label>
                    <input type="number" min="0" max="20" step="1" class="form-control form-control-sm" id="fcProfilKiemeles" value="${j.profil_kiemeles ?? ""}" placeholder="–" title="${esc(I18n.t("finRightProfileFeatHint"))}">
                </div>
                <div class="col-12 small text-body-secondary">${I18n.t("finRightProfileFeatHint")}</div>
                <div class="col-12 d-flex flex-wrap gap-3 mt-2">
                    ${[["korlatlan_hirdetes", "finRightUnlimited"], ["reklammentes", "finRightAdFree"], ["pro_statisztika", "finRightProStats"], ["iroda_profil", "finRightAgency"]].map(([k, l]) => `
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="fcJ_${k}" ${j[k] ? "checked" : ""}>
                            <label class="form-check-label small" for="fcJ_${k}">${I18n.t(l)}</label>
                        </div>`).join("")}
                </div>
            </div>
            <div class="row g-2 mt-2">
                <div class="col-6 col-sm-4">
                    <label class="form-label small mb-1" for="fcKod">${I18n.t("finPkgCode")}</label>
                    <input class="form-control form-control-sm" id="fcKod" value="${esc(c.kod || "")}" maxlength="40">
                </div>
                <div class="col-6 col-sm-4">
                    <label class="form-label small mb-1" for="fcSorrend">${I18n.t("finOrder")}</label>
                    <input type="number" step="1" class="form-control form-control-sm" id="fcSorrend" value="${c.sorrend ?? 0}">
                </div>
                <div class="col-sm-4 d-flex align-items-end">
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" role="switch" id="fcAktiv" ${c.aktiv ? "checked" : ""}>
                        <label class="form-check-label small" for="fcAktiv">${I18n.t("finActive")}</label>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            ${!uj ? `<button type="button" class="btn btn-outline-danger me-auto" id="fcTorol"><i class="fa-solid fa-trash" aria-hidden="true"></i> ${I18n.t("finDelete")}</button>` : ""}
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
            <button type="button" class="btn btn-primary" id="fcMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button>
        </div>`;

    const $ = s => tartalom.querySelector(s);
    const ures = v => v === "" ? undefined : Number(v);

    $("#fcMent").onclick = () => {
        if (!$("#fcNev").value.trim()) { $("#fcNev").classList.add("is-invalid"); $("#fcNev").focus(); return; }
        const d = {
            nev: $("#fcNev").value, nev_ro: $("#fcNevRo").value, nev_en: $("#fcNevEn").value, kategoria: $("#fcKat").value,
            ar: $("#fcAr").value, penznem: $("#fcPenznem").value, idoszak: $("#fcIdoszak").value, leiras: $("#fcLeiras").value,
            kod: $("#fcKod").value, sorrend: $("#fcSorrend").value, aktiv: $("#fcAktiv").checked,
            celcsoport: $("#fcCel").value, nyilvanos: $("#fcNyilv").checked, kiemelt: $("#fcKiemelt").checked,
            leiras_ro: $("#fcLeirasRo").value, leiras_en: $("#fcLeirasEn").value,
            elonyok: $("#fcElony").value, elonyok_ro: $("#fcElonyRo").value, elonyok_en: $("#fcElonyEn").value,
            jogosultsag: {
                hirdetes_limit: ures($("#fcLimit").value), hirdetes_plusz: ures($("#fcPlusz").value), kiemeles: ures($("#fcKiemeles").value), kiemeles_nap: ures($("#fcKiemelesNap").value),
                korlatlan_hirdetes: $("#fcJ_korlatlan_hirdetes").checked, reklammentes: $("#fcJ_reklammentes").checked,
                pro_statisztika: $("#fcJ_pro_statisztika").checked, iroda_profil: $("#fcJ_iroda_profil").checked,
                profil_kiemeles: ures($("#fcProfilKiemeles").value)
            }
        };
        $("#fcMent").disabled = true;
        AdminManager.finApi("csomagok" + (uj ? "" : "/" + c.id), { method: uj ? "POST" : "PUT", body: d })
            .then(() => { modal.hide(); AdminManager.renderFinPackages(); })
            .catch(e => { $("#fcMent").disabled = false; AdminManager.finHiba(e); });
    };

    const torol = $("#fcTorol");
    if (torol) torol.onclick = () => {
        if (!confirm(I18n.t("finDeletePackageConfirm"))) return;
        AdminManager.finApi("csomagok/" + c.id, { method: "DELETE" })
            .then(v => { modal.hide(); if (v.kikapcsolva) alert(I18n.t("finPackageDeactivated")); AdminManager.renderFinPackages(); })
            .catch(AdminManager.finHiba);
    };

    modal.show();

};

// ===================== KIADÁSOK =====================

AdminManager.renderFinExpenses = function () {

    AdminManager.loading();

    const f = AdminManager.fin.kiSzuro;
    if (!f.ev) f.ev = String(new Date().getFullYear());

    Promise.all([AdminManager.finApi(`kiadasok?tol=${f.ev}-01-01&ig=${f.ev}-12-31`), AdminManager.finCfg()]).then(([lista]) => {

        AdminManager.fin.kiadasok = lista;
        const box = AdminManager.box();
        const esc = Utils.escape;
        const L = AdminManager.fin.cfg.listak;
        const b = AdminManager.fin.cfg.beallitas;
        const ronban = k => k.penznem === "EUR" ? k.osszeg * (b.eur_arfolyam || 5) : k.osszeg;
        const szurt = f.kat ? lista.filter(k => k.kategoria === f.kat) : lista;
        const ossz = szurt.reduce((s, k) => s + ronban(k), 0);
        const most = new Date().getFullYear();
        const evek = [most + 1, most, most - 1, most - 2, most - 3].map(String);

        // Havonta csoportosítva
        const honapok = {};
        szurt.forEach(k => { (honapok[k.datum.slice(0, 7)] = honapok[k.datum.slice(0, 7)] || []).push(k); });

        box.innerHTML = `
            <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                <select class="form-select form-select-sm w-auto" id="fkEv" aria-label="${esc(I18n.t("finYear"))}">${evek.map(e => `<option ${e === f.ev ? "selected" : ""}>${e}</option>`).join("")}</select>
                <select class="form-select form-select-sm w-auto" id="fkKat" aria-label="${esc(I18n.t("finCategory"))}">
                    <option value="">${I18n.t("finAllCategories")}</option>
                    ${L.kiadasKategoriak.map(k => `<option value="${k}" ${f.kat === k ? "selected" : ""}>${esc(I18n.t("finExpCat_" + k))}</option>`).join("")}
                </select>
                <span class="small text-body-secondary">${I18n.f("finExpTotal", { osszeg: `<b>${esc(AdminManager.finPenz(Math.round(ossz * 100) / 100, "RON"))}</b>`, n: szurt.length })}</span>
                <a class="btn btn-outline-secondary btn-sm ms-auto" href="/api/admin/penzugy/export/kiadasok?tol=${f.ev}-01-01&ig=${f.ev}-12-31"><i class="fa-solid fa-file-csv" aria-hidden="true"></i> ${I18n.t("finExport")}</a>
                <button type="button" class="btn btn-primary btn-sm" id="fkUj"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("finNewExpense")}</button>
            </div>
            ${szurt.length ? Object.entries(honapok).map(([ho, sorok]) => `
                <h6 class="finMonthHead">${esc(new Date(ho + "-15T12:00:00").toLocaleDateString(Utils.locale(), { year: "numeric", month: "long" }))}
                    <span>${esc(AdminManager.finPenz(Math.round(sorok.reduce((s, k) => s + ronban(k), 0) * 100) / 100, "RON"))}</span></h6>
                <div class="finList mb-3">${sorok.map(k => `
                    <article class="finRow">
                        <span class="kpiIcon orange"><i class="fa-solid ${{ tarhely: "fa-server", domain: "fa-globe", szoftver: "fa-code", marketing: "fa-bullhorn", konyveles: "fa-calculator", adok: "fa-landmark", bank: "fa-building-columns" }[k.kategoria] || "fa-receipt"}" aria-hidden="true"></i></span>
                        <div class="finMain">
                            <b>${esc(k.leiras)}</b>
                            <div class="small text-body-secondary">${esc(AdminManager.finNap(k.datum))} · ${esc(I18n.t("finExpCat_" + k.kategoria))}${k.szallito ? ` · ${esc(k.szallito)}` : ""}${k.szamlaszam ? ` · ${esc(k.szamlaszam)}` : ""}${k.ismetlodo ? ` · <i class="fa-solid fa-repeat" aria-hidden="true"></i> ${esc(AdminManager.finIdoszakLabel(k.ismetlodo))}` : ""}</div>
                        </div>
                        <b class="finAmount">${esc(AdminManager.finPenz(k.osszeg, k.penznem))}</b>
                        <div class="finActions">
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-fk-masol="${k.id}" title="${esc(I18n.t("finCopy"))}"><i class="fa-solid fa-copy" aria-hidden="true"></i><span class="visually-hidden">${I18n.t("finCopy")}</span></button>
                            <button type="button" class="btn btn-sm btn-outline-primary" data-fk-szerk="${k.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("adsEdit")}</button>
                        </div>
                    </article>`).join("")}</div>`).join("") : `
                <div class="emptyState py-4">
                    <i class="fa-solid fa-receipt" aria-hidden="true"></i>
                    <h5>${I18n.t("finNoExpenses")}</h5>
                    <p>${I18n.t("finNoExpensesHint")}</p>
                </div>`}`;

        document.getElementById("fkEv").onchange = e => { f.ev = e.target.value; AdminManager.renderFinExpenses(); };
        document.getElementById("fkKat").onchange = e => { f.kat = e.target.value; AdminManager.renderFinExpenses(); };
        document.getElementById("fkUj").onclick = () => AdminManager.finKiadasSzerk(null);
        box.querySelectorAll("[data-fk-szerk]").forEach(btn => {
            btn.onclick = () => AdminManager.finKiadasSzerk(lista.find(k => k.id === Number(btn.dataset.fkSzerk)));
        });
        // Másolat (pl. a havi tárhelydíj): mai dátummal
        box.querySelectorAll("[data-fk-masol]").forEach(btn => {
            btn.onclick = () => {
                const k = lista.find(x => x.id === Number(btn.dataset.fkMasol));
                AdminManager.finKiadasSzerk({ ...k, id: null, datum: AdminManager.finMa(), szamlaszam: "" });
            };
        });

    }).catch(() => AdminManager.finHibaDoboz());

};

AdminManager.finKiadasSzerk = function (k) {

    const uj = !k || !k.id;
    k = k || { datum: AdminManager.finMa(), kategoria: "egyeb", penznem: "RON" };
    const esc = Utils.escape;
    const L = AdminManager.fin.cfg.listak;
    const { tartalom, modal } = AdminManager.finModal("finKiadasModal", "");

    tartalom.innerHTML = `
        <div class="modal-header">
            <h5 class="modal-title"><i class="fa-solid fa-receipt" aria-hidden="true"></i> ${I18n.t(uj ? "finNewExpense" : "finEditExpense")}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
        </div>
        <div class="modal-body">
            <div class="row g-2">
                <div class="col-12">
                    <label class="form-label small mb-1" for="fkLeiras">${I18n.t("finDescription")} *</label>
                    <input class="form-control form-control-sm" id="fkLeiras" value="${esc(k.leiras || "")}" maxlength="300" placeholder="${esc(I18n.t("finExpensePh"))}">
                </div>
                <div class="col-6">
                    <label class="form-label small mb-1" for="fkDatum">${I18n.t("finDate")}</label>
                    <input type="date" class="form-control form-control-sm" id="fkDatum" value="${esc(k.datum || "")}">
                </div>
                <div class="col-6">
                    <label class="form-label small mb-1" for="fkKat2">${I18n.t("finCategory")}</label>
                    <select class="form-select form-select-sm" id="fkKat2">${L.kiadasKategoriak.map(x => `<option value="${x}" ${k.kategoria === x ? "selected" : ""}>${esc(I18n.t("finExpCat_" + x))}</option>`).join("")}</select>
                </div>
                <div class="col-6">
                    <label class="form-label small mb-1" for="fkOsszeg">${I18n.t("finAmountGross")}</label>
                    <input type="number" min="0" step="0.01" class="form-control form-control-sm" id="fkOsszeg" value="${k.osszeg ?? ""}">
                </div>
                <div class="col-3">
                    <label class="form-label small mb-1" for="fkPenznem">${I18n.t("finCurrency")}</label>
                    <select class="form-select form-select-sm" id="fkPenznem">${L.penznemek.map(p => `<option ${k.penznem === p ? "selected" : ""}>${p}</option>`).join("")}</select>
                </div>
                <div class="col-3">
                    <label class="form-label small mb-1" for="fkAfa">${I18n.t("finVatAmount")}</label>
                    <input type="number" min="0" step="0.01" class="form-control form-control-sm" id="fkAfa" value="${k.afa || ""}" placeholder="0">
                </div>
                <div class="col-6">
                    <label class="form-label small mb-1" for="fkSzallito">${I18n.t("finSupplier")}</label>
                    <input class="form-control form-control-sm" id="fkSzallito" value="${esc(k.szallito || "")}" maxlength="160" placeholder="Render, Neon, ...">
                </div>
                <div class="col-6">
                    <label class="form-label small mb-1" for="fkSzam">${I18n.t("finInvoiceNumber")}</label>
                    <input class="form-control form-control-sm" id="fkSzam" value="${esc(k.szamlaszam || "")}" maxlength="60">
                </div>
                <div class="col-6">
                    <label class="form-label small mb-1" for="fkIsm">${I18n.t("finRecurring")}</label>
                    <select class="form-select form-select-sm" id="fkIsm">
                        <option value="">${I18n.t("finRecurringNo")}</option>
                        <option value="havi" ${k.ismetlodo === "havi" ? "selected" : ""}>${esc(AdminManager.finIdoszakLabel("havi"))}</option>
                        <option value="eves" ${k.ismetlodo === "eves" ? "selected" : ""}>${esc(AdminManager.finIdoszakLabel("eves"))}</option>
                    </select>
                </div>
                <div class="col-12">
                    <label class="form-label small mb-1" for="fkJegyzet">${I18n.t("finNote")}</label>
                    <textarea class="form-control form-control-sm" id="fkJegyzet" rows="2" maxlength="1000">${esc(k.jegyzet || "")}</textarea>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            ${!uj ? `<button type="button" class="btn btn-outline-danger me-auto" id="fkTorol"><i class="fa-solid fa-trash" aria-hidden="true"></i> ${I18n.t("finDelete")}</button>` : ""}
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
            <button type="button" class="btn btn-primary" id="fkMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button>
        </div>`;

    const $ = s => tartalom.querySelector(s);

    $("#fkMent").onclick = () => {
        if (!$("#fkLeiras").value.trim()) { $("#fkLeiras").classList.add("is-invalid"); $("#fkLeiras").focus(); return; }
        const d = {
            leiras: $("#fkLeiras").value, datum: $("#fkDatum").value, kategoria: $("#fkKat2").value, osszeg: $("#fkOsszeg").value,
            penznem: $("#fkPenznem").value, afa: $("#fkAfa").value, szallito: $("#fkSzallito").value, szamlaszam: $("#fkSzam").value,
            ismetlodo: $("#fkIsm").value, jegyzet: $("#fkJegyzet").value
        };
        $("#fkMent").disabled = true;
        AdminManager.finApi("kiadasok" + (uj ? "" : "/" + k.id), { method: uj ? "POST" : "PUT", body: d })
            .then(() => { modal.hide(); if (AdminManager.tab === "kiadasok") AdminManager.renderFinExpenses(); })
            .catch(e => { $("#fkMent").disabled = false; AdminManager.finHiba(e); });
    };

    const torol = $("#fkTorol");
    if (torol) torol.onclick = () => {
        if (!confirm(I18n.t("finDeleteExpenseConfirm"))) return;
        AdminManager.finApi("kiadasok/" + k.id, { method: "DELETE" })
            .then(() => { modal.hide(); AdminManager.renderFinExpenses(); })
            .catch(AdminManager.finHiba);
    };

    modal.show();

};

// ===================== BEÁLLÍTÁSOK =====================

AdminManager.renderFinSettings = function () {

    AdminManager.loading();

    AdminManager.finCfg(true).then(cfg => {

        const b = cfg.beallitas;
        const u = cfg.uzemelteto || {};
        const esc = Utils.escape;
        const box = AdminManager.box();

        const mezo = (id, label, value, attrs = "", col = "col-sm-6") => `
            <div class="${col}">
                <label class="form-label small mb-1" for="${id}">${label}</label>
                <input class="form-control form-control-sm" id="${id}" value="${esc(value ?? "")}" ${attrs}>
            </div>`;
        const kapcs = (id, label, on, help) => `
            <div class="col-12">
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" id="${id}" ${on ? "checked" : ""}>
                    <label class="form-check-label" for="${id}">${label}</label>
                </div>
                ${help ? `<div class="small text-body-secondary ms-4 ps-2">${help}</div>` : ""}
            </div>`;

        box.innerHTML = `
            <div class="card mb-4">
                <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-id-card" aria-hidden="true"></i> ${I18n.t("finSupplierData")}</h5></div>
                <div class="card-body">
                    <p class="sectionNote">${I18n.t("finSupplierNote")}</p>
                    <div class="finSupplier small mb-2">
                        <b>${esc(u.nev || "–")}</b>${u.adoszam ? ` · CUI ${esc(u.adoszam)}` : ""}${u.cegjegyzekszam ? ` · ${esc(u.cegjegyzekszam)}` : ""}<br>
                        ${esc(u.cim || "")}
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-fin-go="webhely"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("adminTabSite")}</button>
                    ${u.tipus !== "ceg" ? `<div class="alert alert-warning small mt-3 mb-0">${I18n.t("finNoCompanyYet")}</div>` : ""}
                </div>
            </div>

            <form id="finBeallForm" novalidate>
                <div class="card mb-4">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${I18n.t("finInvoicing")}</h5></div>
                    <div class="card-body row g-3">
                        ${mezo("fbBank", I18n.t("finBank"), b.bank, 'maxlength="120"')}
                        ${mezo("fbIban", "IBAN", b.iban, 'maxlength="40" autocomplete="off" spellcheck="false"')}
                        ${mezo("fbKedv", I18n.t("finPayee"), b.kedvezmenyezett || "", `maxlength="120" placeholder="${esc(u.nev || "")}"`)}
                        ${mezo("fbRevolut", I18n.t("finRevolut"), b.revolut_link || "", 'maxlength="80" placeholder="revolut.me/felhasznalonev" autocomplete="off" spellcheck="false"')}
                        <p class="small text-body-secondary col-12 mb-0">${I18n.t("finRevolutHelp")}</p>
                        <div class="col-6 col-sm-3">
                            <label class="form-label small mb-1" for="fbPenznem">${I18n.t("finDefaultCurrency")}</label>
                            <select class="form-select form-select-sm" id="fbPenznem">${cfg.listak.penznemek.map(p => `<option ${b.penznem === p ? "selected" : ""}>${p}</option>`).join("")}</select>
                        </div>
                        ${mezo("fbHatarido", I18n.t("finPaymentDays"), b.fizetesi_hatarido, 'type="number" min="0" max="120"', "col-6 col-sm-3")}
                        ${mezo("fbDbElotag", I18n.t("finProformaPrefix"), b.dijbekero_elotag, 'maxlength="8"', "col-6 col-sm-3")}
                        ${mezo("fbSzElotag", I18n.t("finInvoicePrefix"), b.szamla_elotag, 'maxlength="8"', "col-6 col-sm-3")}
                        ${kapcs("fbAfaFizeto", I18n.t("finVatPayer"), b.afa_fizeto, I18n.t("finVatPayerHelp"))}
                        ${mezo("fbAfaKulcs", I18n.t("finVatRate"), b.afa_kulcs, 'type="number" min="0" max="50" step="0.5"', "col-6 col-sm-3")}
                        <div class="col-12">
                            <label class="form-label small mb-1" for="fbMegj">${I18n.t("finInvoiceFooter")}</label>
                            <textarea class="form-control form-control-sm" id="fbMegj" rows="2" maxlength="600">${esc(b.szamla_megjegyzes || "")}</textarea>
                        </div>
                    </div>
                </div>

                <div class="card mb-4">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> ${I18n.t("finAutomation")}</h5></div>
                    <div class="card-body row g-3">
                        ${kapcs("fbAuto", I18n.t("finAutoProforma"), b.auto_dijbekero, I18n.t("finAutoProformaHelp"))}
                        ${mezo("fbElore", I18n.t("finDaysAhead"), b.elore_nap, 'type="number" min="0" max="60"', "col-6 col-sm-3")}
                        ${mezo("fbTurelmi", I18n.t("finGraceDays"), b.turelmi_nap, 'type="number" min="0" max="90"', "col-6 col-sm-3")}
                        <div class="col-sm-6">
                            <label class="form-label small mb-1" for="fbArfolyam">${I18n.t("finEurRate")}</label>
                            <div class="input-group input-group-sm">
                                <span class="input-group-text">1 EUR =</span>
                                <input type="number" min="0.5" max="50" step="0.0001" class="form-control" id="fbArfolyam" value="${b.eur_arfolyam}">
                                <span class="input-group-text">RON</span>
                                <button type="button" class="btn btn-outline-secondary" id="fbBnr"><i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i> BNR</button>
                            </div>
                            <div class="small text-body-secondary mt-1" id="fbArfDatum">${b.arfolyam_datum ? I18n.f("finRateDate", { datum: esc(AdminManager.finNap(b.arfolyam_datum)) }) : I18n.t("finRateHelp")}</div>
                        </div>
                    </div>
                </div>

                <div class="card mb-4">
                    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <h5 class="mb-0"><i class="fa-solid fa-credit-card" aria-hidden="true"></i> ${I18n.t("finOnlineTitle")}</h5>
                        <button type="button" class="btn btn-sm btn-outline-primary" data-fb-online="1">${I18n.t("adminTabOnlinePay")}</button>
                    </div>
                    <div class="card-body row g-3">
                        ${kapcs("fbOnline", I18n.t("finOnlinePay"), b.online_fizetes !== false, I18n.t("finOnlinePayHelp"))}
                        ${kapcs("fbAutoSzamla", I18n.t("finAutoInvoice"), b.auto_szamla !== false, I18n.t("finAutoInvoiceHelp"))}
                        ${kapcs("fbSajatSzamla", I18n.t("finOwnInvoice"), b.sajat_szamla !== false, I18n.t("finOwnInvoiceHelp"))}
                        ${mezo("fbEfVaros", I18n.t("finEfCity"), b.efactura_varos || "", 'maxlength="80" placeholder="Sfântu Gheorghe"', "col-6 col-sm-3")}
                        <div class="col-6 col-sm-3">
                            <label class="form-label small mb-1" for="fbEfMegye">${I18n.t("finEfCounty")}</label>
                            <select class="form-select form-select-sm" id="fbEfMegye">
                                <option value="">–</option>
                                ${AdminManager.MEGYEK.map(([k, n]) => `<option value="RO-${k}" ${b.efactura_megye === "RO-" + k ? "selected" : ""}>${esc(n)} (${k})</option>`).join("")}
                            </select>
                        </div>
                        <p class="small text-body-secondary col-12 mb-0">${I18n.t("finEfHelp")}
                            <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-fin-go="efactura"><i class="fa-solid fa-landmark" aria-hidden="true"></i> ${I18n.t("finEfGoAnaf")}</button></p>
                        <div class="col-sm-6">
                            <label class="form-label small mb-1" for="fbForditas">${I18n.t("finDocLang")}</label>
                            <select class="form-select form-select-sm" id="fbForditas">
                                <option value="" ${!b.bizonylat_forditas ? "selected" : ""}>${I18n.t("finDocLang_ro")}</option>
                                <option value="hu" ${b.bizonylat_forditas === "hu" ? "selected" : ""}>${I18n.t("finDocLang_hu")}</option>
                                <option value="en" ${b.bizonylat_forditas === "en" ? "selected" : ""}>${I18n.t("finDocLang_en")}</option>
                            </select>
                            <div class="small text-body-secondary mt-1">${I18n.t("finDocLangHelp")}</div>
                        </div>
                        <div class="col-sm-6">
                            <label class="form-label small mb-1" for="fbTvaMentes">${I18n.t("finVatExemptText")}</label>
                            <textarea class="form-control form-control-sm" id="fbTvaMentes" rows="2" maxlength="300" placeholder="Furnizor neplătitor de TVA – regim special de scutire pentru întreprinderile mici (art. 310 din Codul fiscal). Scutit de TVA.">${esc(b.tva_mentes_szoveg || "")}</textarea>
                            <div class="small text-body-secondary mt-1">${I18n.t("finVatExemptHelp")}</div>
                        </div>
                        ${mezo("fbKiemelesNap", I18n.t("finFeaturedDays"), b.kiemeles_nap || 7, 'type="number" min="1" max="90"', "col-6 col-sm-3")}
                    </div>
                </div>

                <div class="card mb-4">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> ${I18n.t("finLimits")}</h5></div>
                    <div class="card-body row g-3">
                        <p class="sectionNote col-12 mb-0">${I18n.t("finLimitsNote")}</p>
                        ${mezo("fbIngyenes", I18n.t("finFreeListings"), b.ingyenes_hirdetes, 'type="number" min="0" max="1000"', "col-6 col-sm-3")}
                        ${mezo("fbIrodaIngyenes", I18n.t("finFreeListingsAgency"), b.iroda_ingyenes_hirdetes, 'type="number" min="0" max="1000"', "col-6 col-sm-3")}
                        ${kapcs("fbKorlat", `<b>${I18n.t("finEnforce")}</b>`, b.korlatok_be, I18n.t("finEnforceHelp"))}
                        ${mezo("fbLejTurelem", I18n.t("finExpiryGrace"), b.lejarat_turelem_nap ?? 30, 'type="number" min="0" max="180"', "col-6 col-sm-3")}
                        ${mezo("fbLejFigy", I18n.t("finExpiryWarn"), b.lejarat_figyelmeztet_nap ?? 7, 'type="number" min="1" max="60"', "col-6 col-sm-3")}
                        <p class="small text-body-secondary col-12 mb-0">${I18n.t("finExpiryHelp")}</p>
                        <div class="col-12">
                            <button type="button" class="btn btn-sm btn-outline-secondary" id="fbElonezet"><i class="fa-solid fa-users-viewfinder" aria-hidden="true"></i> ${I18n.t("finLimitPreview")}</button>
                            <div id="fbElonezetBox" class="mt-2"></div>
                        </div>
                    </div>
                </div>

                <div class="finSaveBar">
                    <span class="small text-body-secondary flex-fill" id="fbMsg"></span>
                    <button type="submit" class="btn btn-primary" id="fbMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button>
                </div>
            </form>`;

        AdminManager.finBindGo(box);
        const $ = s => box.querySelector(s);

        $("#fbBnr").onclick = () => {
            const btn = $("#fbBnr");
            btn.disabled = true;
            AdminManager.finApi("arfolyam", { method: "POST" })
                .then(v => {
                    $("#fbArfolyam").value = v.eur;
                    $("#fbArfDatum").textContent = I18n.f("finRateDate", { datum: AdminManager.finNap(v.datum) });
                    AdminManager.fin.cfg = null;
                })
                .catch(() => alert(I18n.t("finBnrError")))
                .finally(() => { btn.disabled = false; });
        };

        $("#fbElonezet").onclick = () => {
            const hova = $("#fbElonezetBox");
            hova.innerHTML = `<div class="spinner-border spinner-border-sm text-primary"></div>`;
            AdminManager.finApi("korlat-elonezet").then(v => {
                const sorok = [
                    ...v.fiokok.map(x => `<li><i class="fa-solid fa-user" aria-hidden="true"></i> ${esc(x.nev || "#" + x.id)}: <b>${x.db}</b> / ${x.limit}</li>`),
                    ...v.irodak.map(x => `<li><i class="fa-solid fa-briefcase" aria-hidden="true"></i> ${esc(x.nev)}: <b>${x.db}</b> / ${x.limit}</li>`)
                ];
                hova.innerHTML = sorok.length
                    ? `<p class="small mb-1">${I18n.f("finLimitPreviewSome", { n: sorok.length })}</p><ul class="small mb-0">${sorok.join("")}</ul>`
                    : `<p class="small text-success mb-0"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${I18n.t("finLimitPreviewNone")}</p>`;
            }).catch(() => { hova.innerHTML = `<p class="small text-danger mb-0">${I18n.t("alertLoadError")}</p>`; });
        };

        $("#finBeallForm").onsubmit = e => {
            e.preventDefault();
            if ($("#fbKorlat").checked && !b.korlatok_be && !confirm(I18n.t("finEnforceConfirm"))) return;
            const d = {
                bank: $("#fbBank").value, iban: $("#fbIban").value, kedvezmenyezett: $("#fbKedv").value, revolut_link: $("#fbRevolut").value, penznem: $("#fbPenznem").value,
                fizetesi_hatarido: $("#fbHatarido").value, dijbekero_elotag: $("#fbDbElotag").value, szamla_elotag: $("#fbSzElotag").value,
                afa_fizeto: $("#fbAfaFizeto").checked, afa_kulcs: $("#fbAfaKulcs").value, szamla_megjegyzes: $("#fbMegj").value,
                auto_dijbekero: $("#fbAuto").checked, elore_nap: $("#fbElore").value, turelmi_nap: $("#fbTurelmi").value,
                eur_arfolyam: $("#fbArfolyam").value,
                ingyenes_hirdetes: $("#fbIngyenes").value, iroda_ingyenes_hirdetes: $("#fbIrodaIngyenes").value, korlatok_be: $("#fbKorlat").checked,
                lejarat_turelem_nap: $("#fbLejTurelem").value, lejarat_figyelmeztet_nap: $("#fbLejFigy").value,
                online_fizetes: $("#fbOnline").checked, auto_szamla: $("#fbAutoSzamla").checked, sajat_szamla: $("#fbSajatSzamla").checked,
                efactura_varos: $("#fbEfVaros").value, efactura_megye: $("#fbEfMegye").value, kiemeles_nap: $("#fbKiemelesNap").value,
                bizonylat_forditas: $("#fbForditas").value, tva_mentes_szoveg: $("#fbTvaMentes").value
            };
            $("#fbMent").disabled = true;
            AdminManager.finApi("beallitas", { method: "PUT", body: d })
                .then(() => {
                    AdminManager.fin.cfg = null;
                    $("#fbMsg").innerHTML = `<i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i> ${I18n.t("finSaved")}`;
                    b.korlatok_be = d.korlatok_be;
                })
                .catch(AdminManager.finHiba)
                .finally(() => { $("#fbMent").disabled = false; });
        };

    }).catch(() => AdminManager.finHibaDoboz());

};
