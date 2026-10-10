// ============================================================
//  Admin – Hely-ellenőrzés (Helyek → Hely-ellenőrzés)
//
//  Amit az automatikus hely-ellenőrzés (beolvasás, automatikus javítás)
//  áthelyezett, mert a hirdetési oldal pontja nem egyezett a hirdetés
//  szövegével: messze volt a várostól / a falutól, a leírásban szereplő
//  utca vagy kerület máshol van, a pont csak a város "alapértelmezett"
//  közepe volt, vagy most már pontosabban tudjuk (az utcán).
//
//  Városonként nézhető át. Egy hirdetésre kattintva a térképen látszik,
//  honnan (piros) hová (zöld) került. "Rendben": eltűnik a listából;
//  "Vissza az eredetire": a régi pont (és kerület) visszakerül, és az
//  automatika többé nem mozgatja. "Kézi hely": ha egyik sem jó, itt helyben
//  megadod a helyes pontot (címkereső, "a leírásból", pontos / közelítő,
//  kerület, vagy "nincs pontos hely") – a hirdetést nem kell megnyitni.
// ============================================================

AdminManager.lc = { lista: [], varos: null, ok: "", map: null, reteg: null, kijelolt: null };

AdminManager.LC_OKOK = ["utca_eltero", "kerulet_eltero", "varostol_tavol", "falutol_tavol", "alappont", "pontosabb"];

AdminManager.renderLocationCheck = function () {

    AdminManager.loading();

    fetch("/api/admin/hely-athelyezett", { cache: "no-store" })
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(lista => {
            const lc = AdminManager.lc;
            lc.lista = (Array.isArray(lista) ? lista : []).filter(i => i.hely_eredeti && i.hely_eredeti.ok);
            // Alapból a kiválasztott város (ha van benne áthelyezett), különben az első
            const varosok = [...new Set(lc.lista.map(i => i.varos || ""))];
            if (lc.varos === null || (lc.varos && !varosok.includes(lc.varos))) {
                lc.varos = varosok.includes(DataManager.currentCity) ? DataManager.currentCity : (varosok.length > 1 ? varosok[0] : "");
            }
            AdminManager.lcDraw();
        })
        .catch(() => {
            AdminManager.box().innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
        });

};

AdminManager.lcSzurt = function () {
    const lc = AdminManager.lc;
    return lc.lista.filter(i => (!lc.varos || (i.varos || "") === lc.varos) && (!lc.ok || i.hely_eredeti.ok === lc.ok));
};

AdminManager.lcDraw = function () {

    const lc = AdminManager.lc;
    const box = AdminManager.box();
    const esc = Utils.escape;

    if (lc.map) { lc.map.remove(); lc.map = null; lc.reteg = null; }

    if (!lc.lista.length) {
        box.innerHTML = `
            <div class="emptyState">
                <i class="fa-solid fa-location-crosshairs text-success" aria-hidden="true"></i>
                <h5>${I18n.t("lcEmpty")}</h5>
                <p>${I18n.t("lcEmptyHint")}</p>
                <a class="btn btn-outline-primary btn-sm" href="#admin/tools" data-go-tab="tools"><i class="fa-solid fa-toolbox" aria-hidden="true"></i> ${I18n.t("adminTabTools")}</a>
            </div>`;
        box.querySelectorAll("[data-go-tab]").forEach(a => a.onclick = e => { e.preventDefault(); AdminManager.open(a.dataset.goTab); });
        return;
    }

    // A városon belül: okok szerint
    const varosban = lc.lista.filter(i => !lc.varos || (i.varos || "") === lc.varos);
    const okDb = k => varosban.filter(i => i.hely_eredeti.ok === k).length;
    if (lc.ok && !okDb(lc.ok)) lc.ok = "";
    const szurt = AdminManager.lcSzurt();

    box.innerHTML = `
        <p class="sectionNote">${I18n.t("lcIntro")}</p>

        ${AdminManager.cityTabs(lc.lista, lc.varos, "data-lc-city")}

        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
            <div class="typeTabs mb-0" role="tablist">
                <button type="button" class="typeTab ${!lc.ok ? "active" : ""}" data-lc-ok="">${I18n.t("lcAllReasons")} <span class="typeTabCount">${varosban.length}</span></button>
                ${AdminManager.LC_OKOK.filter(k => okDb(k)).map(k => `
                    <button type="button" class="typeTab ${lc.ok === k ? "active" : ""}" data-lc-ok="${k}">${I18n.t("lcReason_" + k)} <span class="typeTabCount">${okDb(k)}</span></button>`).join("")}
            </div>
            <button type="button" class="btn btn-sm btn-outline-success ms-auto" id="lcAcceptAll" ${szurt.length ? "" : "disabled"}>
                <i class="fa-solid fa-check-double" aria-hidden="true"></i> ${I18n.f("lcAcceptAll", { n: szurt.length })}
            </button>
        </div>

        <div class="lcLayout">
            <div class="lcList" id="lcList">
                ${szurt.map(i => AdminManager.lcRow(i)).join("")}
            </div>
            <div class="lcMapCol">
                <div class="card lcMapCard">
                    <div class="card-body p-2">
                        <div id="lcMap" class="lcMap"></div>
                        <div class="lcLegend small">
                            <span><span class="lcDot from"></span> ${I18n.t("lcLegendFrom")}</span>
                            <span><span class="lcDot to"></span> ${I18n.t("lcLegendTo")}</span>
                        </div>
                        <div class="small px-1 pt-1" id="lcMapInfo"></div>
                    </div>
                </div>
            </div>
        </div>`;

    box.querySelectorAll("[data-lc-city]").forEach(b => {
        b.onclick = () => { lc.varos = b.dataset.lcCity; lc.ok = ""; lc.kijelolt = null; AdminManager.lcDraw(); };
    });
    box.querySelectorAll("[data-lc-ok]").forEach(b => {
        b.onclick = () => { lc.ok = b.dataset.lcOk; lc.kijelolt = null; AdminManager.lcDraw(); };
    });

    document.getElementById("lcAcceptAll").onclick = () => {
        const ids = AdminManager.lcSzurt().map(i => i.id);
        if (!ids.length || !confirm(I18n.f("lcAcceptAllConfirm", { n: ids.length }))) return;
        AdminManager.lcKuld("mind/elfogad", { ids }).then(() => AdminManager.lcKivesz(ids));
    };

    box.querySelectorAll("[data-lc-row]").forEach(row => {
        const id = Number(row.dataset.lcRow);
        row.addEventListener("click", e => {
            if (e.target.closest("a, button")) return;
            AdminManager.lcMutat(id);
        });
        row.addEventListener("keydown", e => {
            if ((e.key === "Enter" || e.key === " ") && e.target === row) { e.preventDefault(); AdminManager.lcMutat(id); }
        });
    });

    box.querySelectorAll("[data-lc-accept]").forEach(b => {
        b.onclick = () => {
            const id = Number(b.dataset.lcAccept);
            b.disabled = true;
            AdminManager.lcKuld(id + "/elfogad").then(() => AdminManager.lcKivesz([id])).catch(() => { b.disabled = false; });
        };
    });

    box.querySelectorAll("[data-lc-restore]").forEach(b => {
        b.onclick = () => {
            const id = Number(b.dataset.lcRestore);
            if (!confirm(I18n.t("lcRestoreConfirm"))) return;
            b.disabled = true;
            AdminManager.lcKuld(id + "/vissza").then(() => AdminManager.lcKivesz([id])).catch(() => { b.disabled = false; alert(I18n.t("alertSaveError")); });
        };
    });

    box.querySelectorAll("[data-lc-manual]").forEach(b => {
        b.onclick = () => AdminManager.lcKezi(Number(b.dataset.lcManual));
    });

    box.querySelectorAll("[data-lc-show]").forEach(b => {
        b.onclick = () => AdminManager.lcMutat(Number(b.dataset.lcShow));
    });

    // A térkép: alapból az első (vagy a kijelölt) hirdetés
    AdminManager.lcTerkep();
    const elso = szurt.find(i => i.id === lc.kijelolt) || szurt[0];
    if (elso) AdminManager.lcMutat(elso.id, true);

};

// Egy áthelyezett hirdetés sora
AdminManager.lcRow = function (i) {

    const esc = Utils.escape;
    const e = i.hely_eredeti || {};
    const kep = i.kep_id ? `/api/kepek/${i.kep_id}` : (i.kulso_kep ? Utils.imgUrl(i.kulso_kep) : null);
    const cim = i.cim || `${Types.label(i.tipus)} · ${CityManager.displayName(i.varos)}`;
    const tav = AdminManager.lcTav(i);
    const szin = { utca_eltero: "warning", kerulet_eltero: "warning", varostol_tavol: "danger", falutol_tavol: "danger", alappont: "secondary", pontosabb: "info" }[e.ok] || "secondary";

    // Mit mond a szöveg (utca / kerület), ha tudjuk
    const mit = e.nev
        ? (e.ok === "kerulet_eltero"
            ? I18n.f("lcDistrict", { nev: esc(CityManager.keruletLabel(e.nev, i.varos)) })
            : I18n.f("lcStreet", { nev: esc(e.nev) }))
        : "";

    const keruletValt = typeof e.kerulet === "string" && e.kerulet !== (i.kerulet || "")
        ? ` · ${I18n.f("lcDistrictChanged", { regi: esc(e.kerulet ? CityManager.keruletLabel(e.kerulet, i.varos) : I18n.t("keruletNincsMegadva")), uj: esc(i.kerulet ? CityManager.keruletLabel(i.kerulet, i.varos) : I18n.t("keruletNincsMegadva")) })}`
        : "";

    return `
        <article class="lcRow" data-lc-row="${i.id}" tabindex="0">
            <div class="lcThumb">${kep ? `<img src="${esc(kep)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<i class="${Types.get(i.tipus).icon}" aria-hidden="true"></i></div>
            <div class="lcMain">
                <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                    <span class="badge text-bg-${szin}">${I18n.t("lcReason_" + e.ok)}</span>
                    <span class="small text-body-secondary">#${i.id} · ${esc(CityManager.helyLabel(i))}</span>
                    ${i.statusz === "fuggo" ? `<span class="badge text-bg-light">${I18n.t("lcPending")}</span>` : ""}
                </div>
                <b class="lcTitle">${esc(cim)}</b>
                <div class="small">
                    ${mit ? `<span>${mit}</span> · ` : ""}
                    <span class="text-body-secondary">${tav}</span>${keruletValt}
                </div>
                <div class="small text-body-secondary">${ListingPage.helyEredetiSzoveg(i)}</div>
            </div>
            <div class="lcActions">
                <button type="button" class="btn btn-sm btn-outline-secondary d-xl-none" data-lc-show="${i.id}"><i class="fa-solid fa-map" aria-hidden="true"></i> ${I18n.t("lcShowMap")}</button>
                <a class="btn btn-sm btn-outline-secondary" href="#listing/${i.id}" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i> ${I18n.t("lcOpen")}</a>
                <button type="button" class="btn btn-sm btn-success" data-lc-accept="${i.id}"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("lcAccept")}</button>
                <button type="button" class="btn btn-sm btn-outline-primary" data-lc-manual="${i.id}"><i class="fa-solid fa-map-pin" aria-hidden="true"></i> ${I18n.t("lcManual")}</button>
                ${e.x && e.y ? `<button type="button" class="btn btn-sm btn-outline-danger" data-lc-restore="${i.id}"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> ${I18n.t("lcRestore")}</button>` : ""}
            </div>
        </article>`;

};

// "1,2 km-rel odébb" / "a pontot töröltük"
AdminManager.lcTav = function (i) {
    const e = i.hely_eredeti || {};
    if (!(i.x && i.y)) return I18n.t("lcDeleted");
    if (!(e.x && e.y)) return "";
    const km = AdminManager.lcKm(Number(e.x), Number(e.y), Number(i.x), Number(i.y));
    if (km < 0.05) return I18n.t("lcSamePlace");
    return I18n.f("lcMoved", { km: Utils.num(km, km < 10 ? 1 : 0) });
};

AdminManager.lcKm = function (x1, y1, x2, y2) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (y2 - y1) * r, dLon = (x2 - x1) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(y1 * r) * Math.cos(y2 * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
};

AdminManager.lcTerkep = function () {
    const lc = AdminManager.lc;
    const el = document.getElementById("lcMap");
    if (!el || typeof L === "undefined") return;
    const k = LocationPicker.varosKozep(lc.varos || DataManager.currentCity) || LocationPicker.ALAP;
    lc.map = L.map(el, { scrollWheelZoom: true }).setView(k, 13);
    AdminManager.takaritas.push(() => { if (lc.map) { lc.map.remove(); lc.map = null; lc.reteg = null; } });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(lc.map);
    if (typeof Districts !== "undefined" && lc.varos && Districts.any(lc.varos)) {
        Districts.layer(lc.varos, { labels: true, fillOpacity: 0.04, weight: 1.2 }).addTo(lc.map);
    }
    setTimeout(() => { if (lc.map) lc.map.invalidateSize(); }, 120);
};

// Egy hirdetés a térképen: honnan (piros) hová (zöld)
AdminManager.lcMutat = function (id, csendben) {

    const lc = AdminManager.lc;
    const i = lc.lista.find(x => x.id === id);
    if (!i) return;

    lc.kijelolt = id;
    document.querySelectorAll("#lcList [data-lc-row]").forEach(r => r.classList.toggle("active", Number(r.dataset.lcRow) === id));

    if (!lc.map) return;
    if (lc.reteg) { lc.reteg.remove(); lc.reteg = null; }

    const e = i.hely_eredeti || {};
    const elemek = [];
    const pont = (y, x, cls) => L.circleMarker([y, x], { radius: 8, weight: 2, color: "#fff", fillColor: cls === "from" ? "#dc2626" : "#16a34a", fillOpacity: 0.95 });

    if (e.x && e.y) elemek.push(pont(Number(e.y), Number(e.x), "from").bindTooltip(I18n.t("lcLegendFrom")));
    if (i.x && i.y) {
        if (i.hely_pontossag === "kozelito") elemek.push(L.circle([Number(i.y), Number(i.x)], { radius: Number(i.hely_sugar) || 500, color: "#16a34a", weight: 1.5, fillOpacity: 0.08 }));
        elemek.push(pont(Number(i.y), Number(i.x), "to").bindTooltip(I18n.t("lcLegendTo")));
    }
    if (e.x && e.y && i.x && i.y) {
        elemek.push(L.polyline([[Number(e.y), Number(e.x)], [Number(i.y), Number(i.x)]], { color: "#475569", weight: 2, dashArray: "6 6", opacity: 0.8 }));
    }

    if (!elemek.length) return;

    lc.reteg = L.featureGroup(elemek).addTo(lc.map);
    const b = lc.reteg.getBounds();
    if (b.isValid()) lc.map.fitBounds(b, { padding: [36, 36], maxZoom: 16 });

    const info = document.getElementById("lcMapInfo");
    if (info) info.innerHTML = `<b>#${i.id}</b> ${Utils.escape(i.cim || "")} · ${AdminManager.lcTav(i)}`;

    // Kis képernyőn a térkép a lista fölött van: oda görgetünk
    if (!csendben && window.innerWidth < 1200) {
        const kartya = document.querySelector(".lcMapCard");
        if (kartya) kartya.scrollIntoView({ behavior: "smooth", block: "start" });
    }

};

AdminManager.lcKuld = function (ut, body) {
    return fetch("/api/admin/hely-athelyezett/" + ut, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {})
    }).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
};

// Elfogadva / visszatéve: kikerül a listából (a számlálók is frissülnek)
AdminManager.lcKivesz = function (ids) {
    const lc = AdminManager.lc;
    const ki = new Set(ids);
    lc.lista = lc.lista.filter(i => !ki.has(i.id));
    if (lc.varos && !lc.lista.some(i => (i.varos || "") === lc.varos)) {
        const varosok = [...new Set(lc.lista.map(i => i.varos || ""))];
        lc.varos = varosok.length > 1 ? varosok[0] : "";
    }
    if (ki.has(lc.kijelolt)) lc.kijelolt = null;
    AdminManager.refreshPendingCount();
    AdminManager.lcDraw();
};

// ===================== KÉZI HELY =====================
// Egy ablakban a helyválasztó térkép (ugyanaz, mint a hirdetésfeladásnál):
// a térképen halványan a hirdetési oldal pontja (piros) és az automatika
// pontja (zöld) is látszik. Mentés után a hirdetés kikerül a listából, és az
// automatika többé nem mozgatja.

AdminManager.lcKezi = function (id) {

    const lc = AdminManager.lc;
    const i = lc.lista.find(x => x.id === id);
    if (!i) return;

    const esc = Utils.escape;
    const e = i.hely_eredeti || {};
    const vanKerulet = Types.fieldsFor(i.tipus, i.varos).kerulet;

    let el = document.getElementById("lcManualModal");
    if (!el) {
        el = document.createElement("div");
        el.id = "lcManualModal";
        el.className = "modal fade";
        el.tabIndex = -1;
        el.setAttribute("aria-hidden", "true");
        el.innerHTML = `<div class="modal-dialog modal-xl modal-dialog-scrollable modal-fullscreen-lg-down"><div class="modal-content"></div></div>`;
        document.body.appendChild(el);
        el.addEventListener("hidden.bs.modal", () => {
            if (AdminManager.lcPicker) { AdminManager.lcPicker.remove(); AdminManager.lcPicker = null; }
        });
    }

    el.querySelector(".modal-content").innerHTML = `
        <div class="modal-header">
            <h5 class="modal-title"><i class="fa-solid fa-map-pin" aria-hidden="true"></i> ${I18n.t("lcManualTitle")} <small class="text-body-secondary">#${i.id}</small></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("lcManualCancel"))}"></button>
        </div>
        <div class="modal-body">
            <p class="mb-1"><b>${esc(i.cim || Types.label(i.tipus))}</b></p>
            <p class="small text-body-secondary mb-2">${esc(CityManager.helyLabel(i))} · ${I18n.t("lcReason_" + e.ok)}</p>
            <p class="sectionNote">${I18n.t("lcManualNote")}</p>
            <div class="lcLegend small mb-2">
                <span><span class="lcDot from"></span> ${I18n.t("lcLegendFrom")}</span>
                <span><span class="lcDot to"></span> ${I18n.t("lcManualAuto")}</span>
            </div>
            <div id="lcManualLoc"><div class="emptyState py-4"><div class="spinner-border text-primary"></div></div></div>
            ${vanKerulet ? `
                <div class="row g-2 mt-2 align-items-end">
                    <div class="col-sm-6 col-lg-4">
                        <label class="form-label small mb-1" for="lcManualKerulet">${I18n.t("detailKerulet")}</label>
                        <select class="form-select form-select-sm" id="lcManualKerulet"></select>
                    </div>
                    <div class="col-sm-6 col-lg-8 small text-body-secondary">${I18n.t("lcManualDistrictNote")}</div>
                </div>` : ""}
        </div>
        <div class="modal-footer flex-wrap">
            <button type="button" class="btn btn-outline-secondary me-auto" id="lcManualNone"><i class="fa-solid fa-location-pin-lock" aria-hidden="true"></i> ${I18n.t("lcManualNone")}</button>
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("lcManualCancel")}</button>
            <button type="button" class="btn btn-primary" id="lcManualSave" disabled><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("lcManualSave")}</button>
        </div>`;

    const modal = bootstrap.Modal.getOrCreateInstance(el);

    // A hirdetés szövege (a "A leírásból" gombhoz) – a lista nem tartalmazza
    const reszletek = fetch("/api/ingatlanok/" + i.id, { cache: "no-store" })
        .then(r => r.ok ? r.json() : {})
        .catch(() => ({}));

    const ker = vanKerulet ? CityManager.loadKeruletekInto("lcManualKerulet", i.varos, i.kerulet || "", "newKeruletNincs") : Promise.resolve();

    let kezdve = false;
    const indul = () => {
        if (kezdve) return;
        kezdve = true;
        reszletek.then(d => {
            if (!document.getElementById("lcManualLoc")) return;
            document.getElementById("lcManualLoc").innerHTML = "";
            const vanUj = !!(i.x && i.y);
            AdminManager.lcPicker = new LocationPicker("lcManualLoc", {
                x: vanUj ? Number(i.x) : null,
                y: vanUj ? Number(i.y) : null,
                pontossag: i.hely_pontossag,
                sugar: i.hely_sugar,
                varos: () => i.varos,
                szoveg: () => ({
                    cim: d.cim || i.cim,
                    leiras: [d.leiras, d.forras_szoveg].filter(Boolean).join("\n"),
                    tipus: i.tipus,
                    telepules: d.telepules || null,
                    kerulet: (document.getElementById("lcManualKerulet") || {}).value || i.kerulet,
                    forras_kerulet: i.forras_kerulet
                }),
                onChange: h => { document.getElementById("lcManualSave").disabled = !(h.x && h.y); },
                onPoint: (x, y) => {
                    document.getElementById("lcManualSave").disabled = false;
                    const sel = document.getElementById("lcManualKerulet");
                    if (!sel) return;
                    // A kerülethatárok (ha vannak), különben a szerver javaslata
                    const k = typeof Districts !== "undefined" ? Districts.findObj(i.varos, x, y) : null;
                    if (k && k.nev) { sel.value = k.nev; sel.classList.add("autoFilled"); return; }
                    LocationPicker.keruletJavaslat(i.varos, x, y).then(n => {
                        if (n) { sel.value = n; sel.classList.add("autoFilled"); }
                    });
                }
            });

            const p = AdminManager.lcPicker;
            document.getElementById("lcManualSave").disabled = !vanUj;

            // Viszonyítási pontok (nem mozgathatók): hirdetési oldal = piros, automatika = zöld
            const halvany = (y, x, szin, cimke) => L.circleMarker([y, x], { radius: 7, weight: 2, color: "#fff", fillColor: szin, fillOpacity: 0.8, interactive: true })
                .bindTooltip(cimke).addTo(p.map);
            const pontok = [];
            if (e.x && e.y) { halvany(Number(e.y), Number(e.x), "#dc2626", I18n.t("lcLegendFrom")); pontok.push([Number(e.y), Number(e.x)]); }
            if (vanUj) { halvany(Number(i.y), Number(i.x), "#16a34a", I18n.t("lcManualAuto")); pontok.push([Number(i.y), Number(i.x)]); }
            if (pontok.length > 1) p.map.fitBounds(L.latLngBounds(pontok), { padding: [40, 40], maxZoom: 16 });
            setTimeout(() => p.map.invalidateSize(), 150);
        });
    };

    el.addEventListener("shown.bs.modal", indul, { once: true });

    const kuld = body => {
        const gombok = el.querySelectorAll("#lcManualSave, #lcManualNone");
        gombok.forEach(g => g.disabled = true);
        return AdminManager.lcKuld(i.id + "/kezi", body)
            .then(() => { modal.hide(); AdminManager.lcKivesz([i.id]); })
            .catch(() => { gombok.forEach(g => g.disabled = false); alert(I18n.t("alertSaveError")); });
    };

    const keruletErtek = () => {
        const sel = document.getElementById("lcManualKerulet");
        return sel ? sel.value : undefined;
    };

    document.getElementById("lcManualSave").onclick = () => {
        const p = AdminManager.lcPicker;
        if (!p) return;
        const h = p.get();
        if (!(h.x && h.y)) return;
        ker.then(() => kuld({ ...h, kerulet: keruletErtek() }));
    };

    document.getElementById("lcManualNone").onclick = () => {
        if (!confirm(I18n.t("lcManualNoneConfirm"))) return;
        kuld({ x: null, y: null, hely_pontossag: "nincs", kerulet: keruletErtek() });
    };

    modal.show();

};
