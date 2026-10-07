// ============================================================
//  Admin – Állapotok (a lista kezelése)
//
//  Új állapot felvétele, átnevezés (magyar / román / angol), szín,
//  sorrend, kulcsszavak a szövegből való felismeréshez, ki- / bekapcsolás,
//  törlés (a saját felvettekét). Kódot nem kell hozzá írni: a változás
//  azonnal megjelenik a keresőben, a hirdetésfeladásnál, a térképen,
//  a statisztikában és az értékbecslőben.
// ============================================================

AdminManager.clAllapot = { lista: [], ismeretlen: [], nyitott: null };

// Minőségi szintek (a hasonló hirdetések kereséséhez, az értékbecslőhöz)
AdminManager.CL_SZINTEK = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

AdminManager.renderConditionList = function () {

    AdminManager.loading();

    fetch("/api/admin/allapotok")
        .then(r => r.json())
        .then(d => {
            AdminManager.clAllapot.lista = d.lista || [];
            AdminManager.clAllapot.ismeretlen = d.ismeretlen || [];
            AdminManager.drawConditionList();
        })
        .catch(() => { AdminManager.box().innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`; });

};

// Az egész weboldal (választók, térkép, címkék) frissítése az új listával
AdminManager.clFrissitOldal = function () {
    return fetch("/api/allapotok").then(r => r.json()).then(l => {
        Utils.setAllapotok(l);
        if (typeof BulkEditManager !== "undefined") BulkEditManager.renderAllapotOptions();
        if (typeof MapManager !== "undefined") MapManager.dirty = true;
    }).catch(() => { });
};

AdminManager.clHiba = function (v) {
    const k = "clErr_" + (v && v.error);
    return I18n.t(k) !== k ? I18n.t(k) : I18n.t("alertSaveError");
};

AdminManager.clApi = function (url, method, body) {
    return fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
    }).then(r => r.json().then(v => {
        if (!r.ok) { const e = new Error(v.error || "hiba"); e.v = v; throw e; }
        return v;
    }));
};

AdminManager.clSzintNev = function (sz) {
    const n = Number(sz);
    const nev = { 0: "allapotFelujitando", 2: "allapotJo", 3: "allapotUjszeru", 4: "allapotLuxus" }[n];
    return `${Utils.num(n, n % 1 ? 1 : 0)}${nev ? " – " + I18n.t(nev) : ""}`;
};

// Az űrlap (új állapotnál és szerkesztésnél ugyanaz)
AdminManager.clUrlap = function (a, uj) {

    const esc = Utils.escape;
    const id = uj ? "clNew" : "clEd";
    const jo = a.kulcs === "jó";

    return `
        <form class="clForm" id="${id}Form" data-kulcs="${esc(a.kulcs || "")}">
            <div class="row g-3">
                <div class="col-md-4">
                    <label class="form-label req" for="${id}Hu">${I18n.t("clNameHu")}</label>
                    <input class="form-control" id="${id}Hu" name="nev_hu" maxlength="60" required value="${esc(a.nev_hu || "")}">
                </div>
                <div class="col-md-4">
                    <label class="form-label" for="${id}Ro">${I18n.t("clNameRo")}</label>
                    <input class="form-control" id="${id}Ro" name="nev_ro" maxlength="60" value="${esc(a.nev_ro || "")}">
                </div>
                <div class="col-md-4">
                    <label class="form-label" for="${id}En">${I18n.t("clNameEn")}</label>
                    <input class="form-control" id="${id}En" name="nev_en" maxlength="60" value="${esc(a.nev_en || "")}">
                </div>
                <div class="col-sm-4 col-md-2">
                    <label class="form-label" for="${id}Szin">${I18n.t("clColor")}</label>
                    <input class="form-control form-control-color w-100" type="color" id="${id}Szin" name="szin" value="${esc(a.szin || "#64748b")}">
                </div>
                <div class="col-sm-8 col-md-5">
                    <label class="form-label" for="${id}Szint">${I18n.t("clLevel")}</label>
                    <select class="form-select" id="${id}Szint" name="szint">
                        ${AdminManager.CL_SZINTEK.map(sz => `<option value="${sz}" ${Number(a.szint ?? 2) === sz ? "selected" : ""}>${AdminManager.clSzintNev(sz)}</option>`).join("")}
                    </select>
                    <div class="form-text">${I18n.t("clLevelHelp")}</div>
                </div>
                <div class="col-md-5">
                    <label class="form-label" for="${id}Szorzo">${I18n.t("clFactor")}</label>
                    <input class="form-control" type="number" min="0.3" max="3" step="0.01" id="${id}Szorzo" name="szorzo" value="${jo ? 1 : (a.szorzo ?? 1)}" ${jo ? "disabled" : ""}>
                    <div class="form-text">${I18n.t(jo ? "clFactorBase" : "clFactorHelp")}</div>
                </div>
                <div class="col-12">
                    <label class="form-label" for="${id}Kw">${I18n.t("clKeywords")}</label>
                    <textarea class="form-control" id="${id}Kw" name="kulcsszavak" rows="2" maxlength="1500" placeholder="${esc(I18n.t("clKeywordsPh"))}">${esc(a.kulcsszavak || "")}</textarea>
                    <div class="form-text">${I18n.t("clKeywordsHelp")}</div>
                </div>
            </div>
            <div class="clFormMsg alert alert-danger small py-2 mt-3 mb-0" hidden></div>
            <div class="d-flex gap-2 justify-content-end mt-3">
                ${uj ? "" : `<button type="button" class="btn btn-outline-secondary" data-cl-cancel>${I18n.t("cancel")}</button>`}
                <button type="submit" class="btn btn-primary">${uj ? `<i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("clAdd")}` : I18n.t("save")}</button>
            </div>
        </form>`;

};

AdminManager.clUrlapAdat = function (form) {
    const v = n => { const el = form.querySelector(`[name="${n}"]`); return el ? el.value : undefined; };
    const o = { nev_hu: v("nev_hu"), nev_ro: v("nev_ro"), nev_en: v("nev_en"), szin: v("szin"), szint: v("szint"), kulcsszavak: v("kulcsszavak") };
    const sz = form.querySelector('[name="szorzo"]');
    if (sz && !sz.disabled) o.szorzo = sz.value;
    return o;
};

AdminManager.drawConditionList = function () {

    const S = AdminManager.clAllapot;
    const esc = Utils.escape;
    const box = AdminManager.box();
    const n = S.lista.length;

    const sor = (a, idx) => {

        if (S.nyitott === a.kulcs) {
            return `<li class="list-group-item clRow open">${AdminManager.clUrlap(a, false)}</li>`;
        }

        const nevek = [a.nev_ro, a.nev_en].filter(Boolean).map(esc).join(" · ");

        return `
            <li class="list-group-item clRow ${a.aktiv ? "" : "inactive"}" data-kulcs="${esc(a.kulcs)}">
                <div class="clOrder">
                    <button type="button" class="btn btn-sm btn-link p-0" data-cl-up="${idx}" ${idx === 0 ? "disabled" : ""} aria-label="${esc(I18n.t("clMoveUp"))}" title="${esc(I18n.t("clMoveUp"))}"><i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button>
                    <button type="button" class="btn btn-sm btn-link p-0" data-cl-down="${idx}" ${idx === n - 1 ? "disabled" : ""} aria-label="${esc(I18n.t("clMoveDown"))}" title="${esc(I18n.t("clMoveDown"))}"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
                </div>
                <span class="clSwatch" style="background:${esc(a.szin || "#64748b")}" aria-hidden="true"></span>
                <div class="clName">
                    <b>${esc(a.nev_hu)}</b>
                    ${a.beepitett ? `<span class="badge text-bg-light">${I18n.t("clBuiltin")}</span>` : ""}
                    ${a.aktiv ? "" : `<span class="badge text-bg-secondary">${I18n.t("clInactive")}</span>`}
                    ${nevek ? `<div class="small text-body-secondary">${nevek}</div>` : ""}
                    ${a.kulcsszavak ? `<div class="small text-body-secondary text-truncate"><i class="fa-solid fa-key" aria-hidden="true"></i> ${esc(a.kulcsszavak)}</div>` : ""}
                </div>
                <div class="clStats small text-body-secondary">
                    <div>${I18n.f("clUses", { n: Utils.num(a.db) })}</div>
                    ${a.auto ? `<div>${I18n.f("clAutoUses", { n: Utils.num(a.auto) })}</div>` : ""}
                    <div>${I18n.t("clLevelShort")}: ${a.szint === null || a.szint === undefined ? "–" : Utils.num(a.szint, a.szint % 1 ? 1 : 0)} · ×${Utils.num(a.szorzo ?? 1, 2)}</div>
                </div>
                <div class="clActions">
                    <div class="form-check form-switch m-0" title="${esc(I18n.t("clActiveHelp"))}">
                        <input class="form-check-input" type="checkbox" role="switch" id="clAkt${idx}" data-cl-aktiv="${esc(a.kulcs)}" ${a.aktiv ? "checked" : ""}>
                        <label class="form-check-label small" for="clAkt${idx}">${I18n.t("clActive")}</label>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-cl-edit="${esc(a.kulcs)}"><i class="fa-solid fa-pen" aria-hidden="true"></i> <span class="d-none d-lg-inline">${I18n.t("detailEdit")}</span></button>
                    ${a.beepitett ? "" : `<button type="button" class="btn btn-sm btn-outline-danger" data-cl-del="${esc(a.kulcs)}" aria-label="${esc(I18n.t("detailDelete"))}" title="${esc(I18n.t("detailDelete"))}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`}
                </div>
            </li>`;

    };

    box.innerHTML = `
        <div class="row g-4">
            <div class="col-xxl-8">
                <div class="card mb-4">
                    <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <h5 class="mb-0"><i class="fa-solid fa-sliders" aria-hidden="true"></i> ${I18n.t("adminTabConditions")} <span class="badge text-bg-light">${n}</span></h5>
                        <span class="small text-body-secondary">${I18n.t("clOrderHelp")}</span>
                    </div>
                    <ul class="list-group list-group-flush clList">
                        ${S.lista.map(sor).join("")}
                    </ul>
                </div>

                <div class="card mb-4">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("clAddTitle")}</h5></div>
                    <div class="card-body">
                        <p class="sectionNote">${I18n.t("clAddHelp")}</p>
                        ${AdminManager.clUrlap({ szin: "#64748b", szint: 2, szorzo: 1 }, true)}
                    </div>
                </div>

                ${S.ismeretlen.length ? `
                <div class="card mb-4">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-circle-question" aria-hidden="true"></i> ${I18n.t("clUnknownTitle")}</h5></div>
                    <div class="card-body">
                        <p class="sectionNote">${I18n.t("clUnknownHelp")}</p>
                        <ul class="list-group">
                            ${S.ismeretlen.map((u, k) => `
                                <li class="list-group-item d-flex flex-wrap align-items-center gap-2">
                                    <span class="flex-fill"><b>${esc(u.nev)}</b> <span class="text-body-secondary small">(${I18n.f("clUses", { n: u.db })})</span></span>
                                    <select class="form-select form-select-sm w-auto" id="clMap${k}" aria-label="${esc(I18n.t("clMapTo"))}">${Utils.allapotOptions("", "clMapTo")}</select>
                                    <button type="button" class="btn btn-sm btn-outline-primary" data-cl-map="${k}">${I18n.t("clMapBtn")}</button>
                                </li>`).join("")}
                        </ul>
                    </div>
                </div>` : ""}
            </div>

            <div class="col-xxl-4">
                <div class="card mb-4">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-flask" aria-hidden="true"></i> ${I18n.t("clTestTitle")}</h5></div>
                    <div class="card-body">
                        <p class="sectionNote">${I18n.t("clTestHelp")}</p>
                        <label class="form-label visually-hidden" for="clTestText">${I18n.t("clTestTitle")}</label>
                        <textarea class="form-control mb-2" id="clTestText" rows="5" placeholder="${esc(I18n.t("clTestPh"))}"></textarea>
                        <button type="button" class="btn btn-outline-primary btn-sm" id="clTestBtn"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> ${I18n.t("clTestBtn")}</button>
                        <div id="clTestResult" class="mt-3" aria-live="polite"></div>
                    </div>
                </div>

                <div class="card mb-4">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ${I18n.t("clFillTitle")}</h5></div>
                    <div class="card-body">
                        <p class="sectionNote">${I18n.t("clFillHelp")}</p>
                        <button type="button" class="btn btn-primary btn-sm" id="clFillBtn"><i class="fa-solid fa-play" aria-hidden="true"></i> ${I18n.t("clFillBtn")}</button>
                        <div id="clFillResult" class="mt-3 small" aria-live="polite"></div>
                    </div>
                </div>

                <div class="card helpCard">
                    <div class="card-body small">
                        <h6><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t("clHowTitle")}</h6>
                        <ul class="mb-0 ps-3">
                            <li>${I18n.t("clHow1")}</li>
                            <li>${I18n.t("clHow2")}</li>
                            <li>${I18n.t("clHow3")}</li>
                            <li>${I18n.t("clHow4")}</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>`;

    AdminManager.bindConditionList();

};

AdminManager.bindConditionList = function () {

    const S = AdminManager.clAllapot;
    const box = AdminManager.box();

    const ujra = () => AdminManager.clFrissitOldal().then(() => AdminManager.renderConditionList());

    // Sorrend
    const csere = (i, j) => {
        const kulcsok = S.lista.map(a => a.kulcs);
        [kulcsok[i], kulcsok[j]] = [kulcsok[j], kulcsok[i]];
        AdminManager.clApi("/api/admin/allapotok-sorrend", "POST", { kulcsok }).then(ujra).catch(e => alert(AdminManager.clHiba(e.v)));
    };
    box.querySelectorAll("[data-cl-up]").forEach(b => b.onclick = () => { const i = Number(b.dataset.clUp); csere(i, i - 1); });
    box.querySelectorAll("[data-cl-down]").forEach(b => b.onclick = () => { const i = Number(b.dataset.clDown); csere(i, i + 1); });

    // Be / ki
    box.querySelectorAll("[data-cl-aktiv]").forEach(cb => cb.onchange = () => {
        AdminManager.clApi("/api/admin/allapotok/" + encodeURIComponent(cb.dataset.clAktiv), "PUT", { aktiv: cb.checked })
            .then(ujra).catch(e => { cb.checked = !cb.checked; alert(AdminManager.clHiba(e.v)); });
    });

    // Szerkesztés
    box.querySelectorAll("[data-cl-edit]").forEach(b => b.onclick = () => { S.nyitott = b.dataset.clEdit; AdminManager.drawConditionList(); });

    const ed = document.getElementById("clEdForm");
    if (ed) {
        ed.querySelector("[data-cl-cancel]").onclick = () => { S.nyitott = null; AdminManager.drawConditionList(); };
        ed.onsubmit = e => {
            e.preventDefault();
            const msg = ed.querySelector(".clFormMsg");
            AdminManager.clApi("/api/admin/allapotok/" + encodeURIComponent(ed.dataset.kulcs), "PUT", AdminManager.clUrlapAdat(ed))
                .then(() => { S.nyitott = null; Utils.toast(I18n.t("alertSaveSuccess")); return ujra(); })
                .catch(err => { msg.hidden = false; msg.innerText = AdminManager.clHiba(err.v); });
        };
        ed.scrollIntoView({ block: "nearest" });
    }

    // Új állapot
    const uj = document.getElementById("clNewForm");
    uj.onsubmit = e => {
        e.preventDefault();
        const msg = uj.querySelector(".clFormMsg");
        AdminManager.clApi("/api/admin/allapotok", "POST", AdminManager.clUrlapAdat(uj))
            .then(() => { Utils.toast(I18n.t("clAdded")); return ujra(); })
            .catch(err => { msg.hidden = false; msg.innerText = AdminManager.clHiba(err.v); });
    };

    // Törlés (ha hirdetések használják: hová kerüljenek)
    box.querySelectorAll("[data-cl-del]").forEach(b => b.onclick = () => {
        const a = S.lista.find(x => x.kulcs === b.dataset.clDel);
        if (!a) return;
        if (!a.db) {
            if (!confirm(I18n.f("clDeleteConfirm", { nev: a.nev_hu }))) return;
            AdminManager.clApi("/api/admin/allapotok/" + encodeURIComponent(a.kulcs), "DELETE").then(ujra).catch(e => alert(AdminManager.clHiba(e.v)));
            return;
        }
        AdminManager.clTorlesAblak(a, ujra);
    });

    // Régi, ismeretlen értékek átsorolása
    box.querySelectorAll("[data-cl-map]").forEach(b => b.onclick = () => {
        const u = S.ismeretlen[Number(b.dataset.clMap)];
        const cel = document.getElementById("clMap" + b.dataset.clMap).value;
        if (!u || !cel) return;
        AdminManager.clApi("/api/admin/allapotok/atsorol", "POST", { regi: u.nev, uj: cel })
            .then(v => { Utils.toast(I18n.f("clMapped", { n: v.db })); ujra(); })
            .catch(e => alert(AdminManager.clHiba(e.v)));
    });

    // Kipróbálás
    document.getElementById("clTestBtn").onclick = () => {
        const out = document.getElementById("clTestResult");
        const szoveg = document.getElementById("clTestText").value;
        if (!szoveg.trim()) return;
        AdminManager.clApi("/api/admin/allapotok/teszt", "POST", { szoveg }).then(v => {
            const r = v.eredmeny;
            out.innerHTML = r
                ? `<div class="clTestHit"><span class="clSwatch" style="background:${Utils.escape(Utils.allapotSzin(r.ertek))}"></span> <b>${Utils.escape(Utils.allapotLabel(r.ertek))}</b>
                     <div class="small text-body-secondary mt-1">„${Utils.escape(r.ok)}”</div></div>`
                : `<div class="text-body-secondary small">${I18n.t("clTestNone")}</div>`;
        }).catch(() => { out.innerHTML = `<div class="alert alert-danger small">${I18n.t("alertLoadError")}</div>`; });
    };

    // Kitöltés a leírásokból
    document.getElementById("clFillBtn").onclick = () => {
        const btn = document.getElementById("clFillBtn");
        const out = document.getElementById("clFillResult");
        btn.disabled = true;
        out.innerHTML = `<div class="spinner-border spinner-border-sm text-primary"></div>`;
        AdminManager.clApi("/api/admin/allapotok/kitolt", "POST", {}).then(v => {
            const mibol = Object.entries(v.mibol || {}).map(([k, n]) => `<span class="badge text-bg-light">${Utils.escape(Utils.allapotLabel(k))}: ${n}</span>`).join(" ");
            out.innerHTML = `<p class="mb-2">${I18n.f("clFillDone", { kitoltott: v.kitoltott, osszes: v.osszes })}</p>${mibol}
                ${v.kitoltott ? `<div class="mt-2"><button type="button" class="btn btn-sm btn-outline-primary" data-go-check><i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i> ${I18n.t("clFillCheck")}</button></div>` : ""}`;
            const go = out.querySelector("[data-go-check]");
            if (go) go.onclick = () => { AdminManager.allapot.mod = "bizonytalan"; AdminManager.open("allapot"); };
            AdminManager.refreshPendingCount();
            if (typeof DataManager !== "undefined") DataManager.init();
        }).catch(() => { out.innerHTML = `<div class="alert alert-danger small">${I18n.t("alertSaveError")}</div>`; })
          .finally(() => { btn.disabled = false; });
    };

};

// Törlés, ha hirdetések használják: hová kerüljenek át
AdminManager.clTorlesAblak = function (a, kesz) {

    const esc = Utils.escape;

    let el = document.getElementById("clDelModal");
    if (!el) {
        el = document.createElement("div");
        el.id = "clDelModal";
        el.className = "modal fade";
        el.tabIndex = -1;
        el.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content"></div></div>`;
        document.body.appendChild(el);
    }

    const masok = Utils.ALLAPOTOK.filter(k => k !== a.kulcs);

    el.querySelector(".modal-content").innerHTML = `
        <div class="modal-header">
            <h5 class="modal-title">${I18n.f("clDeleteTitle", { nev: esc(a.nev_hu) })}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${I18n.t("close")}"></button>
        </div>
        <div class="modal-body">
            <p>${I18n.f("clDeleteInUse", { n: a.db })}</p>
            <label class="form-label" for="clDelTarget">${I18n.t("clDeleteMoveTo")}</label>
            <select class="form-select" id="clDelTarget">
                ${masok.map(k => `<option value="${esc(k)}">${esc(Utils.allapotLabel(k))}</option>`).join("")}
                <option value="">— ${I18n.t("clDeleteClear")}</option>
            </select>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("cancel")}</button>
            <button type="button" class="btn btn-danger" id="clDelGo"><i class="fa-solid fa-trash" aria-hidden="true"></i> ${I18n.t("detailDelete")}</button>
        </div>`;

    const modal = bootstrap.Modal.getOrCreateInstance(el);

    document.getElementById("clDelGo").onclick = () => {
        const cel = document.getElementById("clDelTarget").value;
        AdminManager.clApi(`/api/admin/allapotok/${encodeURIComponent(a.kulcs)}?atrak=${encodeURIComponent(cel)}`, "DELETE")
            .then(() => { modal.hide(); kesz(); })
            .catch(e => alert(AdminManager.clHiba(e.v)));
    };

    modal.show();

};
