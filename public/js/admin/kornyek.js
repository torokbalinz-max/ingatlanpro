// ============================================================
//  Admin – Város és környéke
//
//  A városon kívül, a környező falvakban lévő hirdetések (telkek,
//  házak, bármi) a "<város> és környéke" városba kerülnek. A szerver
//  magától áthelyezi, amit biztosan tud (ismert falu a település
//  mezőben, a szövegben, vagy a pont messze van a várostól) – itt:
//    - a bizonytalan esetek (javaslatok): áthelyezés vagy "marad a városban",
//    - a környék-város hirdetései falvanként: a falu javítása, vissza a városba,
//    - tömeges műveletek a kijelöltekre, és egy kis térkép.
//  A kézi döntést az automatika többé nem bírálja felül.
// ============================================================

AdminManager.kornyekVaros = null;
AdminManager.kornyekAdat = null;
AdminManager.kornyekMap = null;

AdminManager.renderKornyek = function () {

    AdminManager.loading();

    const q = AdminManager.kornyekVaros ? "?varos=" + encodeURIComponent(AdminManager.kornyekVaros) : "";

    fetch("/api/admin/kornyek" + q)
        .then(r => r.json())
        .then(d => {
            AdminManager.kornyekAdat = d;
            if (d.adat) AdminManager.kornyekVaros = d.adat.varos;
            AdminManager.drawKornyek();
            // A menü számlálója a mostani állapot szerint (a szerver frissítette)
            AdminManager.refreshPendingCount();
        })
        .catch(() => { AdminManager.box().innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`; });

};

// A település választó (a város környékének falvai + a jelenlegi érték)
AdminManager.kornyekFaluOpciok = function (falvak, ertek) {
    const esc = Utils.escape;
    const lista = falvak.slice();
    if (ertek && !lista.some(f => f.ro === ertek)) lista.unshift({ ro: ertek, hu: Telepulesek.nev(ertek, "hu") });
    return `<option value="">${I18n.t("knNoVillage")}</option>` +
        lista.map(f => `<option value="${esc(f.ro)}" ${f.ro === ertek ? "selected" : ""}>${esc(I18n.current === "hu" ? f.hu : f.ro)}${f.hu && f.hu !== f.ro ? ` (${esc(I18n.current === "hu" ? f.ro : f.hu)})` : ""}</option>`).join("");
};

// Miért (került / kerülne) a környékre (a távolság csak a javaslatoknál ismert)
AdminManager.kornyekOk = function (ok, km) {
    if (!ok) return "";
    if ((km === null || km === undefined) && ["hely", "hely_kozel"].includes(ok)) return I18n.t("knReason_" + ok + "_x");
    return I18n.f("knReason_" + ok, { km: km !== null && km !== undefined ? Utils.num(km, 1) : "?" });
};

AdminManager.drawKornyek = function () {

    const esc = Utils.escape;
    const box = AdminManager.box();
    const d = AdminManager.kornyekAdat || {};
    const a = d.adat;
    const varosok = d.varosok || [];

    if (AdminManager.kornyekMap) { AdminManager.kornyekMap.remove(); AdminManager.kornyekMap = null; }

    if (!a) {
        box.innerHTML = `<div class="alert alert-info">${I18n.t("knNoCities")}</div>`;
        return;
    }

    const falvak = a.telepulesek || [];
    const kNev = a.kornyek ? CityManager.displayName(a.kornyek) : "";

    // ---- Fejléc: városválasztó, futtatás
    const valaszto = `
        <div class="d-flex flex-wrap align-items-end gap-2 mb-3">
            <div>
                <label class="form-label small mb-1" for="knVaros">${I18n.t("searchVaros")}</label>
                <select class="form-select form-select-sm" id="knVaros" style="min-width:220px">
                    ${varosok.map(v => `<option value="${esc(v.nev)}" ${v.nev === a.varos ? "selected" : ""}>${esc(CityManager.displayName(v.nev))}${v.kornyek ? " ✓" : ""}</option>`).join("")}
                </select>
            </div>
            ${a.kornyek ? `<button type="button" class="btn btn-primary btn-sm" id="knFuttat"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ${I18n.t("knRunNow")}</button>` : ""}
            <div class="small text-body-secondary ms-auto" id="knUtolso">${a.utolso && a.utolso.ido ? I18n.f("knLastRun", { ido: esc(new Date(a.utolso.ido).toLocaleString(Utils.locale())), n: a.utolso.athelyezve || 0 }) : ""}</div>
        </div>`;

    // ---- Nincs még környék-város: létrehozás
    if (!a.kornyek) {
        const v = CityManager.varosAdat(a.varos);
        box.innerHTML = valaszto + `
            <div class="card">
                <div class="card-body">
                    <h6><i class="fa-solid fa-tree-city" aria-hidden="true"></i> ${I18n.f("knCreateTitle", { varos: esc(CityManager.displayName(a.varos)) })}</h6>
                    <p class="small text-body-secondary">${I18n.t("knCreateHelp")}</p>
                    ${v ? `<button type="button" class="btn btn-primary btn-sm" id="knLetrehoz" data-id="${Number(v.id)}"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.f("knCreateBtn", { nev: esc(I18n.f("kornyekCityNameHu", { varos: CityManager.displayName(a.varos) })) })}</button>` : ""}
                </div>
            </div>`;
        AdminManager.bindKornyekFej();
        const btn = document.getElementById("knLetrehoz");
        if (btn) btn.onclick = () => {
            btn.disabled = true;
            fetch(`/api/varosok/${btn.dataset.id}/kornyek`, { method: "POST" })
                .then(r => r.json().then(v => ({ ok: r.ok, v })))
                .then(({ ok }) => {
                    if (!ok) throw new Error();
                    Utils.toast(I18n.t("knCreated"));
                    return CityManager.loadVarosok();
                })
                .then(() => {
                    CityManager.fillCitySelect(document.getElementById("citySelect"), DataManager.currentCity);
                    // A háttérben futó első rendezés után töltjük újra
                    setTimeout(() => AdminManager.renderKornyek(), 2500);
                })
                .catch(() => { btn.disabled = false; alert(I18n.t("alertSaveError")); });
        };
        return;
    }

    // ---- Egy hirdetés sora
    const sor = (i, javaslat) => {
        const foto = i.kep_id ? "/api/kepek/" + i.kep_id : (i.kulso_kep ? Utils.imgUrl(i.kulso_kep) : null);
        const ok = javaslat ? AdminManager.kornyekOk(javaslat.ok, javaslat.km) : AdminManager.kornyekOk(i.varos_ok);
        const faluJavaslat = javaslat ? (javaslat.telepules || i.telepules || "") : (i.telepules || "");
        return `
            <div class="knRow" data-id="${Number(i.id)}">
                <input type="checkbox" class="form-check-input knCheck" value="${Number(i.id)}" aria-label="#${Number(i.id)}">
                <div class="knThumb">${foto ? `<img src="${esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<i class="${Types.get(i.tipus).icon}" aria-hidden="true"></i>`}</div>
                <div class="knMain">
                    <a href="#listing/${Number(i.id)}" class="knTitle">${esc(i.cim || Types.label(i.tipus))}</a>
                    <div class="small text-body-secondary">
                        #${Number(i.id)} · ${esc(Types.label(i.tipus))} · ${Utils.price(i)}${i.nm ? " · " + Utils.nm(i.nm) : ""}
                        ${i.kerulet ? ` · ${esc(CityManager.keruletLabel(i.kerulet, i.varos))}` : ""}
                        ${i.statusz && i.statusz !== "aktiv" ? ` · <span class="badge text-bg-light">${esc(i.statusz)}</span>` : ""}
                    </div>
                    ${ok ? `<div class="small knReason"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${ok}</div>` : ""}
                </div>
                <div class="knActions">
                    <select class="form-select form-select-sm knFalu" aria-label="${esc(I18n.t("telepulesLabel"))}">${AdminManager.kornyekFaluOpciok(falvak, faluJavaslat)}</select>
                    ${javaslat
                        ? `<button type="button" class="btn btn-sm btn-primary" data-kn="ki"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> ${I18n.t("knMoveOut")}</button>
                           <button type="button" class="btn btn-sm btn-outline-secondary" data-kn="marad">${I18n.t("knKeep")}</button>`
                        : `<button type="button" class="btn btn-sm btn-outline-secondary" data-kn="vissza"><i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i> ${I18n.f("knMoveBack", { varos: esc(CityManager.displayName(a.varos)) })}</button>`}
                </div>
            </div>`;
    };

    // ---- A környék-város hirdetései falvanként (a falu nélküliek elöl)
    const csoportok = new Map();
    (a.kornyekben || []).forEach(i => {
        const k = i.telepules || "";
        if (!csoportok.has(k)) csoportok.set(k, []);
        csoportok.get(k).push(i);
    });
    const kulcsok = [...csoportok.keys()].sort((x, y) => (x ? 1 : 0) - (y ? 1 : 0) || CityManager.telepulesLabel(x).localeCompare(CityManager.telepulesLabel(y), I18n.current));

    const kornyekHtml = kulcsok.length ? kulcsok.map(k => `
        <div class="knGroup">
            <div class="knGroupHead">
                <b>${k ? esc(CityManager.telepulesLabel(k)) : `<span class="text-warning-emphasis"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${I18n.t("knNoVillage")}</span>`}</b>
                <span class="badge rounded-pill text-bg-light">${csoportok.get(k).length}</span>
                <button type="button" class="btn btn-link btn-sm ms-auto p-0" data-kn-all="${esc(k)}">${I18n.t("knSelectGroup")}</button>
            </div>
            ${csoportok.get(k).map(i => sor(i, null)).join("")}
        </div>`).join("") : `<p class="small text-body-secondary mb-0">${I18n.t("knEmptyKornyek")}</p>`;

    const javaslatHtml = (a.javaslatok || []).length
        ? a.javaslatok.map(i => sor(i, i.javaslat)).join("")
        : `<p class="small text-body-secondary mb-0"><i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i> ${I18n.t("knNoSuggestions")}</p>`;

    box.innerHTML = valaszto + `
        <div class="row g-4">
            <div class="col-xxl-8">

                <div class="card mb-4">
                    <div class="card-body">
                        ${AdminManager.section("fa-solid fa-circle-question", I18n.f("knSuggestTitle", { n: (a.javaslatok || []).length }), I18n.f("knSuggestHelp", { varos: esc(CityManager.displayName(a.varos)), kornyek: esc(kNev) }))}
                        <div class="knList" id="knJavaslatok">${javaslatHtml}</div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body">
                        ${AdminManager.section("fa-solid fa-tree-city", I18n.f("knInTitle", { kornyek: esc(kNev), n: (a.kornyekben || []).length }), I18n.t("knInHelp"))}
                        <div class="knList" id="knKornyekben">${kornyekHtml}</div>
                    </div>
                </div>

            </div>

            <div class="col-xxl-4">
                <div class="knSide">
                    <div class="card mb-4">
                        <div class="card-body">
                            <h6 class="mb-2"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> ${I18n.t("knBulkTitle")}</h6>
                            <p class="small text-body-secondary mb-2" id="knBulkCount">${I18n.f("knBulkCount", { n: 0 })}</p>
                            <select class="form-select form-select-sm mb-2" id="knBulkFalu" aria-label="${esc(I18n.t("telepulesLabel"))}">${AdminManager.kornyekFaluOpciok(falvak, "")}</select>
                            <div class="d-grid gap-2">
                                <button type="button" class="btn btn-sm btn-primary" id="knBulkKi" disabled>${I18n.t("knBulkOut")}</button>
                                <button type="button" class="btn btn-sm btn-outline-primary" id="knBulkFaluBtn" disabled>${I18n.t("knBulkVillage")}</button>
                                <button type="button" class="btn btn-sm btn-outline-secondary" id="knBulkVissza" disabled>${I18n.f("knBulkBack", { varos: esc(CityManager.displayName(a.varos)) })}</button>
                                <button type="button" class="btn btn-sm btn-outline-secondary" id="knBulkMarad" disabled>${I18n.t("knBulkKeep")}</button>
                            </div>
                        </div>
                    </div>
                    <div class="card mb-4">
                        <div class="card-body p-2">
                            <div id="knMap" class="knMap"></div>
                            <div class="small text-body-secondary px-2 pt-2">${I18n.f("knMapHelp", { km: a.sugar ? Utils.num(a.sugar, 1) : "?" })}</div>
                        </div>
                    </div>
                    <div class="card helpCard">
                        <div class="card-body small">
                            <h6><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t("knHowTitle")}</h6>
                            <ul class="mb-0 ps-3">
                                <li>${I18n.t("knHow1")}</li>
                                <li>${I18n.t("knHow2")}</li>
                                <li>${I18n.t("knHow3")}</li>
                                <li>${I18n.t("knHow4")}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    AdminManager.bindKornyekFej();
    AdminManager.bindKornyek();
    AdminManager.drawKornyekMap();

};

AdminManager.bindKornyekFej = function () {

    const sel = document.getElementById("knVaros");
    if (sel) sel.onchange = () => { AdminManager.kornyekVaros = sel.value; AdminManager.renderKornyek(); };

    const fut = document.getElementById("knFuttat");
    if (fut) fut.onclick = () => {
        fut.disabled = true;
        fut.innerHTML = `<span class="spinner-border spinner-border-sm"></span> ${I18n.t("knRunning")}`;
        AdminManager.kornyekPost("futtat", { varos: AdminManager.kornyekVaros })
            .then(e => {
                Utils.toast(I18n.f("knRunDone", { n: e.athelyezve || 0, t: e.javitottTelepules || 0, v: e.visszateve || 0 }));
                AdminManager.kornyekUtan();
            })
            .catch(() => { fut.disabled = false; alert(I18n.t("alertSaveError")); });
    };

};

AdminManager.kornyekPost = function (mit, body) {
    return fetch("/api/admin/kornyek/" + mit, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    }).then(r => r.json().then(v => {
        if (!r.ok) throw new Error(v.error || "HTTP " + r.status);
        return v;
    }));
};

// Művelet után: újratöltés + a kereső (darabszámok, ha az aktuális városról van szó)
AdminManager.kornyekUtan = function () {
    const a = (AdminManager.kornyekAdat || {}).adat || {};
    CityManager.loadVarosok().then(() => {
        FilterManager.renderKornyekHint();
        if ([a.varos, a.kornyek].includes(DataManager.currentCity)) DataManager.init();
    });
    AdminManager.renderKornyek();
};

AdminManager.bindKornyek = function () {

    const box = AdminManager.box();
    const a = AdminManager.kornyekAdat.adat;

    const kijeloltek = () => [...box.querySelectorAll(".knCheck:checked")].map(c => Number(c.value));

    const frissitGombok = () => {
        const ids = kijeloltek();
        document.getElementById("knBulkCount").textContent = I18n.f("knBulkCount", { n: ids.length });
        ["knBulkKi", "knBulkFaluBtn", "knBulkVissza", "knBulkMarad"].forEach(id => { document.getElementById(id).disabled = !ids.length; });
    };

    box.querySelectorAll(".knCheck").forEach(c => c.onchange = frissitGombok);

    // Egy falu összes hirdetésének kijelölése
    box.querySelectorAll("[data-kn-all]").forEach(b => b.onclick = () => {
        const csoport = b.closest(".knGroup");
        const cbk = [...csoport.querySelectorAll(".knCheck")];
        const mind = cbk.every(c => c.checked);
        cbk.forEach(c => { c.checked = !mind; });
        frissitGombok();
    });

    const muvelet = (gomb, p) => {
        if (gomb) gomb.disabled = true;
        return p.then(() => AdminManager.kornyekUtan())
            .catch(() => { if (gomb) gomb.disabled = false; alert(I18n.t("alertSaveError")); });
    };

    // Soronként: áthelyezés / marad / vissza / falu váltása
    box.querySelectorAll(".knRow").forEach(row => {

        const id = Number(row.dataset.id);
        const falu = row.querySelector(".knFalu");

        row.querySelectorAll("[data-kn]").forEach(b => b.onclick = () => {
            const mit = b.dataset.kn;
            if (mit === "ki") muvelet(b, AdminManager.kornyekPost("athelyez", { varos: a.varos, ids: [id], cel: "kornyek", telepules: falu.value }));
            if (mit === "marad") muvelet(b, AdminManager.kornyekPost("marad", { ids: [id] }));
            if (mit === "vissza") muvelet(b, AdminManager.kornyekPost("athelyez", { varos: a.varos, ids: [id], cel: "varos" }));
        });

        // A környék-városban a falu azonnal mentődik
        if (row.closest("#knKornyekben")) {
            falu.onchange = () => muvelet(null, AdminManager.kornyekPost("telepules", { ids: [id], telepules: falu.value }));
        }

    });

    // Tömeges műveletek
    const bulkFalu = document.getElementById("knBulkFalu");

    document.getElementById("knBulkKi").onclick = e => muvelet(e.currentTarget,
        AdminManager.kornyekPost("athelyez", { varos: a.varos, ids: kijeloltek(), cel: "kornyek", ...(bulkFalu.value ? { telepules: bulkFalu.value } : {}) }));

    document.getElementById("knBulkFaluBtn").onclick = e => muvelet(e.currentTarget,
        AdminManager.kornyekPost("telepules", { ids: kijeloltek(), telepules: bulkFalu.value }));

    document.getElementById("knBulkVissza").onclick = e => muvelet(e.currentTarget,
        AdminManager.kornyekPost("athelyez", { varos: a.varos, ids: kijeloltek(), cel: "varos" }));

    document.getElementById("knBulkMarad").onclick = e => muvelet(e.currentTarget,
        AdminManager.kornyekPost("marad", { ids: kijeloltek() }));

};

// Kis térkép: a város közepe és mérete, a javaslatok (narancs) és a környéken lévők (zöld)
AdminManager.drawKornyekMap = function () {

    const a = (AdminManager.kornyekAdat || {}).adat;
    const el = document.getElementById("knMap");
    if (!a || !el || typeof L === "undefined") return;

    const kozep = a.kozep && a.kozep.y ? [a.kozep.y, a.kozep.x] : null;
    const pontok = [];

    const map = L.map(el, { scrollWheelZoom: false }).setView(kozep || [45.86, 25.79], 11);
    AdminManager.kornyekMap = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);

    if (kozep && a.sugar) {
        L.circle(kozep, { radius: a.sugar * 1000, color: Utils.accent(), weight: 1.5, fillOpacity: 0.05, dashArray: "5 5", interactive: false }).addTo(map);
        pontok.push(kozep);
    }

    const jel = (i, szin) => {
        if (!(i.x && i.y)) return;
        L.circleMarker([i.y, i.x], { radius: 5, weight: 1.5, color: "#fff", fillColor: szin, fillOpacity: 0.95 })
            .bindTooltip(Utils.escape((i.telepules ? CityManager.telepulesLabel(i.telepules) + " · " : "") + (i.cim || Types.label(i.tipus))))
            .on("click", () => {
                const row = document.querySelector(`.knRow[data-id="${Number(i.id)}"]`);
                if (row) { row.scrollIntoView({ behavior: "smooth", block: "center" }); row.classList.add("flash"); setTimeout(() => row.classList.remove("flash"), 1200); }
            })
            .addTo(map);
        pontok.push([i.y, i.x]);
    };

    (a.kornyekben || []).forEach(i => jel(i, "#15803d"));
    (a.javaslatok || []).forEach(i => jel(i, "#ea580c"));

    if (pontok.length > 1) map.fitBounds(L.latLngBounds(pontok), { padding: [20, 20], maxZoom: 13 });

    setTimeout(() => map.invalidateSize(), 120);

};
