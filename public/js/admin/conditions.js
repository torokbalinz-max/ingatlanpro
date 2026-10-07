// ============================================================
//  Admin – Állapot gyors beállítása
//
//  A hirdetések többsége nem írja le az állapotot, a fényképekből kell
//  megítélni. Két nézet:
//   - Egyesével: nagy kép + bélyegképek, 1–6 billentyű = állapot, és
//     magától jön a következő. ← → a képek, S / ↓ kihagyás, Z visszavonás,
//     Enter = a szövegből adott javaslat elfogadása.
//   - Rács: sok hirdetés egyszerre, kártyánként 6 gomb, vagy kijelölés
//     és egy kattintással mindre ugyanaz.
// ============================================================

AdminManager.allapot = {
    lista: [],
    idx: 0,
    kep: 0,
    mod: "hianyzo",
    tipus: "",
    varos: null,
    nezet: "egyes",
    elozmeny: [],       // visszavonáshoz: [{ id, regi, uj, idx }]
    kijelolt: new Set(),
    szamok: {}
};

AdminManager.renderConditions = function () {

    const A = AdminManager.allapot;
    if (A.varos === null) A.varos = DataManager.currentCity;

    const box = AdminManager.box();
    AdminManager.loading();

    const q = new URLSearchParams({ mod: A.mod });
    if (A.tipus) q.set("tipus", A.tipus);
    if (A.varos) q.set("varos", A.varos);

    fetch("/api/admin/allapot?" + q)
        .then(r => r.json())
        .then(d => {
            A.lista = d.lista || [];
            A.szamok = d.szamok || {};
            A.idx = 0;
            A.kep = 0;
            A.kijelolt = new Set();
            AdminManager.drawConditions();
        })
        .catch(err => {
            console.error(err);
            box.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
        });

};

// A hirdetés képei (saját feltöltött + más oldalról beolvasott)
AdminManager.condPhotos = function (i) {
    return [
        ...(i.kepek || []).map(id => "/api/kepek/" + id),
        ...(i.kulso_kepek || []).map(Utils.imgUrl)
    ].filter(Boolean);
};

AdminManager.drawConditions = function () {

    const A = AdminManager.allapot;
    const box = AdminManager.box();
    const esc = Utils.escape;

    AdminManager.unbindKeys();

    const tipusok = ["lakas", "haz", "kereskedelmi", "iroda"];

    const fej = `
        <div class="condToolbar">
            <div class="btn-group btn-group-sm" role="group" aria-label="${esc(I18n.t("condMode"))}">
                ${[["hianyzo", I18n.f("condModeMissing", { n: A.szamok.hianyzo || 0 })], ["bizonytalan", I18n.f("condModeGuessed", { n: A.szamok.bizonytalan || 0 })], ["mind", I18n.t("condModeAll")]]
                    .map(([k, l]) => `<button type="button" class="btn ${A.mod === k ? "btn-primary" : "btn-outline-primary"}" data-cond-mod="${k}">${esc(l)}</button>`).join("")}
            </div>
            <select class="form-select form-select-sm" id="condCity" aria-label="${esc(I18n.t("detailVaros"))}">
                <option value="">${I18n.t("allCities")}</option>
                ${AdminManager.cityOptions(A.varos)}
            </select>
            <select class="form-select form-select-sm" id="condType" aria-label="${esc(I18n.t("typeLabel"))}">
                <option value="">${I18n.t("condAllTypes")}</option>
                ${tipusok.map(t => `<option value="${t}" ${A.tipus === t ? "selected" : ""}>${esc(Types.label(t))}</option>`).join("")}
            </select>
            <div class="btn-group btn-group-sm ms-auto" role="group">
                <button type="button" class="btn ${A.nezet === "egyes" ? "btn-secondary" : "btn-outline-secondary"}" data-cond-view="egyes"><i class="fa-solid fa-square"></i> ${I18n.t("condViewOne")}</button>
                <button type="button" class="btn ${A.nezet === "racs" ? "btn-secondary" : "btn-outline-secondary"}" data-cond-view="racs"><i class="fa-solid fa-table-cells"></i> ${I18n.t("condViewGrid")}</button>
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-go-tab="allapotok"><i class="fa-solid fa-sliders" aria-hidden="true"></i> ${I18n.t("clManage")}</button>
        </div>`;

    let tartalom;

    if (!A.lista.length) {
        tartalom = `
            <div class="emptyState">
                <i class="fa-solid fa-circle-check"></i>
                <h5>${I18n.t("condEmpty")}</h5>
            </div>`;
    } else if (A.nezet === "racs") {
        tartalom = AdminManager.condGridHtml();
    } else {
        tartalom = AdminManager.condOneHtml();
    }

    box.innerHTML = fej + tartalom;

    box.querySelectorAll("[data-go-tab]").forEach(b => b.onclick = () => AdminManager.open(b.dataset.goTab));
    box.querySelectorAll("[data-cond-mod]").forEach(b => b.onclick = () => { A.mod = b.dataset.condMod; AdminManager.renderConditions(); });
    box.querySelectorAll("[data-cond-view]").forEach(b => b.onclick = () => { A.nezet = b.dataset.condView; AdminManager.drawConditions(); });
    document.getElementById("condCity").onchange = e => { A.varos = e.target.value; AdminManager.renderConditions(); };
    document.getElementById("condType").onchange = e => { A.tipus = e.target.value; AdminManager.renderConditions(); };

    if (!A.lista.length) return;

    if (A.nezet === "racs") AdminManager.bindCondGrid();
    else AdminManager.bindCondOne();

};

// ---------- Egyesével ----------

AdminManager.condButtons = function (aktualis, javasolt, kicsi) {
    return Utils.ALLAPOTOK.map((a, n) => `
        <button type="button" class="btn ${kicsi ? "btn-sm" : ""} condBtn ${Utils.normAllapot(aktualis) === a ? "active" : ""} ${javasolt === a ? "suggested" : ""}" data-allapot="${Utils.escape(a)}" style="--cond:${Utils.allapotSzin(a)}">
            ${kicsi || n > 8 ? "" : `<kbd>${n + 1}</kbd>`} ${Utils.escape(Utils.allapotLabel(a))}
        </button>`).join("");
};

AdminManager.condOneHtml = function () {

    const A = AdminManager.allapot;
    const esc = Utils.escape;

    if (A.idx >= A.lista.length) {
        return `
            <div class="emptyState">
                <i class="fa-solid fa-flag-checkered"></i>
                <h5>${I18n.t("condDone")}</h5>
                <button class="btn btn-primary btn-sm mt-2" type="button" id="condReload">${I18n.t("condReload")}</button>
            </div>`;
    }

    const i = A.lista[A.idx];
    const kepek = AdminManager.condPhotos(i);
    if (A.kep >= kepek.length) A.kep = 0;
    const jav = i.javaslat;

    const adatok = [
        Types.label(i.tipus),
        i.nm ? Utils.num(i.nm) + " m²" : null,
        i.szobak ? I18n.f("roomsLabel", { n: i.szobak }) : null,
        i.emelet ? `${I18n.t("floorWordCap")}: ${esc(i.emelet)}` : null,
        i.evszam ? `${I18n.t("condYear")}: ${i.evszam}` : null,
        i.kerulet ? esc(CityManager.keruletLabel(i.kerulet, i.varos)) : (i.telepules ? esc(CityManager.telepulesLabel(i.telepules)) : null)
    ].filter(Boolean).join(" · ");

    return `
        <div class="condProgress">
            <div class="progress" role="progressbar" aria-valuenow="${A.idx}" aria-valuemin="0" aria-valuemax="${A.lista.length}">
                <div class="progress-bar" style="width:${Math.round(A.idx / A.lista.length * 100)}%"></div>
            </div>
            <span class="small text-body-secondary text-nowrap">${A.idx + 1} / ${A.lista.length}</span>
        </div>

        <div class="condOne">
            <div class="condPhotoCol">
                <div class="condPhoto">
                    ${kepek.length
                        ? `<img src="${esc(kepek[A.kep])}" alt="" id="condImg">
                           ${kepek.length > 1 ? `
                               <button type="button" class="condNav prev" id="condPrev" aria-label="${esc(I18n.t("condPrevPhoto"))}"><i class="fa-solid fa-chevron-left"></i></button>
                               <button type="button" class="condNav next" id="condNext" aria-label="${esc(I18n.t("condNextPhoto"))}"><i class="fa-solid fa-chevron-right"></i></button>
                               <span class="condCounter">${A.kep + 1} / ${kepek.length}</span>` : ""}`
                        : `<div class="condNoPhoto"><i class="fa-regular fa-image"></i><span>${I18n.t("condNoPhoto")}</span></div>`}
                </div>
                ${kepek.length > 1 ? `
                    <div class="condThumbs">
                        ${kepek.slice(0, 16).map((u, n) => `<button type="button" class="condThumb ${n === A.kep ? "active" : ""}" data-kep="${n}"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join("")}
                    </div>` : ""}
            </div>

            <div class="condInfo">
                <h5 class="mb-1">${esc(i.cim || Types.label(i.tipus))}</h5>
                <div class="text-body-secondary small mb-2">${adatok}</div>
                <div class="mb-3"><b>${Utils.price(i)}</b>${i.ar && i.nm ? ` <span class="text-body-secondary">· ${Utils.eurNm(i.ar / i.nm)}</span>` : ""}</div>

                ${i.allapot ? `<div class="small mb-2">${I18n.t("condCurrent")}: <b>${esc(Utils.allapotLabel(i.allapot))}</b>${Utils.allapotBecsult(i) ? ` <span class="badge text-bg-warning">${I18n.t(i.allapot_forras === "szoveg" ? "condFromText" : i.allapot_forras === "ev" ? "condFromYear" : "condGuessedBadge")}</span>` : ""}</div>` : ""}

                ${jav ? `
                    <div class="condSuggest">
                        <div><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ${I18n.t("condSuggestion")}: <b>${esc(Utils.allapotLabel(jav.ertek))}</b> <kbd>Enter</kbd></div>
                        <div class="small text-body-secondary">${esc(jav.ok)}</div>
                    </div>` : ""}

                <div class="condBtns">${AdminManager.condButtons(i.allapot, jav && jav.ertek)}</div>

                <div class="d-flex flex-wrap gap-2 mt-2">
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="condSkip"><kbd>S</kbd> ${I18n.t("condSkip")}</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="condUndo" ${A.elozmeny.length ? "" : "disabled"}><kbd>Z</kbd> ${I18n.t("deUndo")}</button>
                    <a class="btn btn-sm btn-outline-secondary" href="#listing/${i.id}" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square"></i> ${I18n.t("condOpen")}</a>
                    ${i.link ? `<a class="btn btn-sm btn-outline-secondary" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-globe"></i> ${I18n.t("condSource")}</a>` : ""}
                </div>

                ${i.leiras ? `
                    <details class="mt-3">
                        <summary class="small">${I18n.t("condDescription")}</summary>
                        <div class="small condDesc">${esc(i.leiras)}</div>
                    </details>` : ""}

                <p class="small text-body-secondary mt-3 mb-0">${I18n.t("condKeysHelp")}</p>
            </div>
        </div>`;

};

AdminManager.bindCondOne = function () {

    const A = AdminManager.allapot;
    const box = AdminManager.box();

    const reload = document.getElementById("condReload");
    if (reload) { reload.onclick = () => AdminManager.renderConditions(); return; }

    const i = A.lista[A.idx];
    const kepek = AdminManager.condPhotos(i);

    const kepre = n => {
        if (!kepek.length) return;
        A.kep = (n + kepek.length) % kepek.length;
        const img = document.getElementById("condImg");
        if (img) img.src = kepek[A.kep];
        box.querySelectorAll(".condThumb").forEach(t => t.classList.toggle("active", Number(t.dataset.kep) === A.kep));
        const c = box.querySelector(".condCounter");
        if (c) c.innerText = `${A.kep + 1} / ${kepek.length}`;
    };

    // A következő hirdetés képeit előre betöltjük (gyorsabb váltás)
    const kov = A.lista[A.idx + 1];
    if (kov) AdminManager.condPhotos(kov).slice(0, 2).forEach(u => { const im = new Image(); im.src = u; });

    const beallit = allapot => {
        const regi = i.allapot;
        const regiForras = i.allapot_forras;
        AdminManager.condSave([i.id], allapot).then(ok => {
            if (!ok) return;
            A.elozmeny.push({ id: i.id, regi, regiForras, uj: allapot, idx: A.idx });
            i.allapot = allapot;
            i.allapot_forras = "kezi";
            A.idx++;
            A.kep = 0;
            AdminManager.drawConditions();
        });
    };

    const kihagy = () => { A.idx++; A.kep = 0; AdminManager.drawConditions(); };

    const visszavon = () => {
        const u = A.elozmeny.pop();
        if (!u) return;
        AdminManager.condSave([u.id], u.regi ? Utils.normAllapot(u.regi) : null).then(() => {
            const x = A.lista.find(l => l.id === u.id);
            if (x) { x.allapot = u.regi; x.allapot_forras = u.regiForras; }
            A.idx = u.idx;
            A.kep = 0;
            AdminManager.drawConditions();
        });
    };

    box.querySelectorAll(".condBtns [data-allapot]").forEach(b => b.onclick = () => beallit(b.dataset.allapot));
    box.querySelectorAll(".condThumb").forEach(t => t.onclick = () => kepre(Number(t.dataset.kep)));
    const p = document.getElementById("condPrev"), n = document.getElementById("condNext");
    if (p) p.onclick = () => kepre(A.kep - 1);
    if (n) n.onclick = () => kepre(A.kep + 1);
    document.getElementById("condSkip").onclick = kihagy;
    document.getElementById("condUndo").onclick = visszavon;

    AdminManager.reviewKeyHandler = e => {
        if (PageManager.current !== "admin" || AdminManager.tab !== "allapot") return;
        if (e.target.closest("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key;
        if (/^[1-9]$/.test(k) && Utils.ALLAPOTOK[Number(k) - 1]) { e.preventDefault(); beallit(Utils.ALLAPOTOK[Number(k) - 1]); }
        else if (k === "Enter" && i.javaslat) { e.preventDefault(); beallit(i.javaslat.ertek); }
        else if (k === "ArrowRight") { e.preventDefault(); kepre(A.kep + 1); }
        else if (k === "ArrowLeft") { e.preventDefault(); kepre(A.kep - 1); }
        else if (k === "s" || k === "S" || k === "ArrowDown") { e.preventDefault(); kihagy(); }
        else if (k === "z" || k === "Z") { e.preventDefault(); visszavon(); }
    };

    document.addEventListener("keydown", AdminManager.reviewKeyHandler);

};

// ---------- Rács ----------

AdminManager.condGridHtml = function () {

    const A = AdminManager.allapot;
    const esc = Utils.escape;

    return `
        <div class="condBulkBar" id="condBulkBar">
            <span><b id="condSelCount">0</b> ${I18n.t("condSelected")}</span>
            <button type="button" class="btn btn-sm btn-link" id="condSelAll">${I18n.t("sourcesAll")}</button>
            <span class="ms-auto small text-body-secondary">${I18n.t("condSetSelected")}:</span>
            <div class="condBtns small">${AdminManager.condButtons(null, null, true)}</div>
        </div>
        <div class="condGrid">
            ${A.lista.map(i => {
                const kep = AdminManager.condPhotos(i)[0];
                const jav = i.javaslat;
                return `
                    <div class="condCard" data-id="${i.id}">
                        <label class="condCardSel"><input type="checkbox" class="form-check-input" data-sel="${i.id}" aria-label="${esc(I18n.t("condSelected"))}"></label>
                        <a class="condCardPhoto" href="#listing/${i.id}" target="_blank" rel="noopener">
                            ${kep ? `<img src="${esc(kep)}" alt="" loading="lazy">` : `<div class="condNoPhoto"><i class="fa-regular fa-image"></i></div>`}
                            <span class="condCardCount"><i class="fa-regular fa-images"></i> ${AdminManager.condPhotos(i).length}</span>
                        </a>
                        <div class="condCardBody">
                            <div class="small fw-semibold text-truncate">${esc(i.cim || Types.label(i.tipus))}</div>
                            <div class="small text-body-secondary">${Utils.price(i)}${i.nm ? " · " + Utils.num(i.nm) + " m²" : ""}${i.evszam ? " · " + i.evszam : ""}</div>
                            ${jav ? `<div class="small condSuggestMini" title="${esc(jav.ok)}"><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(Utils.allapotLabel(jav.ertek))}</div>` : ""}
                            <div class="condBtns small">${AdminManager.condButtons(i.allapot, jav && jav.ertek, true)}</div>
                        </div>
                    </div>`;
            }).join("")}
        </div>`;

};

AdminManager.bindCondGrid = function () {

    const A = AdminManager.allapot;
    const box = AdminManager.box();

    const frissitSzam = () => {
        document.getElementById("condSelCount").innerText = A.kijelolt.size;
        document.getElementById("condBulkBar").classList.toggle("active", A.kijelolt.size > 0);
    };

    box.querySelectorAll("[data-sel]").forEach(cb => cb.onchange = () => {
        const id = Number(cb.dataset.sel);
        if (cb.checked) A.kijelolt.add(id); else A.kijelolt.delete(id);
        frissitSzam();
    });

    document.getElementById("condSelAll").onclick = () => {
        const mind = A.kijelolt.size < A.lista.length;
        box.querySelectorAll("[data-sel]").forEach(cb => {
            cb.checked = mind;
            const id = Number(cb.dataset.sel);
            if (mind) A.kijelolt.add(id); else A.kijelolt.delete(id);
        });
        frissitSzam();
    };

    const jelol = (ids, allapot) => {
        ids.forEach(id => {
            const x = A.lista.find(l => l.id === id);
            if (x) x.allapot = allapot;
            const card = box.querySelector(`.condCard[data-id="${id}"]`);
            if (!card) return;
            card.classList.add("done");
            card.querySelectorAll("[data-allapot]").forEach(b => b.classList.toggle("active", b.dataset.allapot === allapot));
        });
    };

    // Kártyánként
    box.querySelectorAll(".condCard [data-allapot]").forEach(b => b.onclick = () => {
        const id = Number(b.closest(".condCard").dataset.id);
        AdminManager.condSave([id], b.dataset.allapot).then(ok => { if (ok) jelol([id], b.dataset.allapot); });
    });

    // A kijelöltekre egyszerre
    box.querySelectorAll("#condBulkBar [data-allapot]").forEach(b => b.onclick = () => {
        const ids = [...A.kijelolt];
        if (!ids.length) { alert(I18n.t("condSelectFirst")); return; }
        AdminManager.condSave(ids, b.dataset.allapot).then(ok => {
            if (!ok) return;
            jelol(ids, b.dataset.allapot);
            A.kijelolt.clear();
            box.querySelectorAll("[data-sel]").forEach(cb => { cb.checked = false; });
            frissitSzam();
        });
    });

};

// ---------- Mentés ----------

AdminManager.condSave = function (ids, allapot) {

    return fetch("/api/admin/allapot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, allapot })
    })
        .then(r => r.json())
        .then(v => {
            if (!v.siker) throw new Error(v.error || "save failed");
            // A betöltött hirdetéslista is frissüljön (szűrés, statisztika)
            const idSet = new Set(ids);
            DataManager.ingatlanok.forEach(i => { if (idSet.has(i.id)) { i.allapot = allapot; i.allapot_forras = allapot ? "kezi" : null; } });
            AdminManager.refreshPendingCount();
            return true;
        })
        .catch(err => {
            console.error(err);
            alert(I18n.t("alertSaveError"));
            return false;
        });

};
