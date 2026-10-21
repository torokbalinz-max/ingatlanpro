// ============================================================
//  Admin – Hely-ellenőrzés (Hirdetések → Hely-ellenőrzés)
//
//  Két rész (felül váltható):
//   1. Pontos hely nélkül – a hirdetések, amelyeknek nincs pontjuk a
//      térképen, vagy csak közelítő. Gyors munkasor: balra a sor, jobbra
//      a kiválasztott hirdetés (kép, leírás – a helynevek kiemelve, egy
//      kattintással rájuk keres a térkép), a helyválasztó térkép
//      címkeresővel, „A leírásból” javaslattal és műholdképpel, a kerület.
//      „Mentés és következő” (Ctrl+Enter), „Kihagyás”, „Így marad”
//      (a közelítő hely rendben van), „Nem található”. Nem kell a Google
//      és az oldal között ugrálni.
//   2. Áthelyezett – amit az automatikus hely-ellenőrzés (beolvasás, automatikus javítás)
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

AdminManager.lc = { lista: [], varos: null, ok: "", map: null, reteg: null, kijelolt: null, mod: null };

AdminManager.LC_OKOK = ["utca_eltero", "kerulet_eltero", "varostol_tavol", "falutol_tavol", "alappont", "pontosabb"];

AdminManager.renderLocationCheck = function () {

    AdminManager.loading();

    // A két rész száma (a váltóhoz); a pontos hely nélküliek listáját a saját része tölti
    const pont = fetch("/api/admin/hely-pontatlan?csak=szam", { cache: "no-store" })
        .then(r => r.ok ? r.json() : null).catch(() => null);

    fetch("/api/admin/hely-athelyezett", { cache: "no-store" })
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(lista => pont.then(p => { AdminManager.lp.szamok = (p && p.szamok) || AdminManager.lp.szamok || {}; return lista; }))
        .then(lista => {
            const lc = AdminManager.lc;
            lc.lista = (Array.isArray(lista) ? lista : []).filter(i => i.hely_eredeti && i.hely_eredeti.ok);
            // Alapból a kiválasztott város (ha van benne áthelyezett), különben az első
            const varosok = [...new Set(lc.lista.map(i => i.varos || ""))];
            if (lc.varos === null || (lc.varos && !varosok.includes(lc.varos))) {
                lc.varos = varosok.includes(DataManager.currentCity) ? DataManager.currentCity : (varosok.length > 1 ? varosok[0] : "");
            }
            // Alapból: ahol döntés vár (áthelyezett), különben a pontos hely nélküliek
            if (!lc.mod) lc.mod = lc.lista.length ? "athelyezett" : "pontatlan";
            if (lc.mod === "pontatlan") AdminManager.lpTolt();
            else AdminManager.lcDraw();
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
            ${AdminManager.lcModBar()}
            <div class="emptyState">
                <i class="fa-solid fa-location-crosshairs text-success" aria-hidden="true"></i>
                <h5>${I18n.t("lcEmpty")}</h5>
                <p>${I18n.t("lcEmptyHint")}</p>
                <a class="btn btn-outline-primary btn-sm" href="#admin/tools" data-go-tab="tools"><i class="fa-solid fa-toolbox" aria-hidden="true"></i> ${I18n.t("adminTabTools")}</a>
            </div>`;
        box.querySelectorAll("[data-go-tab]").forEach(a => a.onclick = e => { e.preventDefault(); AdminManager.open(a.dataset.goTab); });
        AdminManager.lcModBind();
        return;
    }

    // A városon belül: okok szerint
    const varosban = lc.lista.filter(i => !lc.varos || (i.varos || "") === lc.varos);
    const okDb = k => varosban.filter(i => i.hely_eredeti.ok === k).length;
    if (lc.ok && !okDb(lc.ok)) lc.ok = "";
    const szurt = AdminManager.lcSzurt();

    box.innerHTML = `
        ${AdminManager.lcModBar()}
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

    AdminManager.lcModBind();

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

// ===================== A KÉT RÉSZ VÁLTÓJA =====================

AdminManager.lcModBar = function () {
    const lc = AdminManager.lc;
    const sz = AdminManager.lp.szamok || {};
    const ath = lc.lista.length;
    const nincs = (sz.osszes || 0);
    return `
        <div class="lcModes" role="tablist" aria-label="${Utils.escape(I18n.t("adminTabLocCheck"))}">
            <button type="button" role="tab" class="lcMode ${lc.mod === "pontatlan" ? "active" : ""}" data-lc-mod="pontatlan" aria-selected="${lc.mod === "pontatlan"}">
                <i class="fa-solid fa-map-pin" aria-hidden="true"></i>
                <span><b>${I18n.t("lpModeTitle")}</b><small>${I18n.t("lpModeSub")}</small></span>
                <span class="lcModeDb">${Utils.num(nincs)}</span>
            </button>
            <button type="button" role="tab" class="lcMode ${lc.mod !== "pontatlan" ? "active" : ""}" data-lc-mod="athelyezett" aria-selected="${lc.mod !== "pontatlan"}">
                <i class="fa-solid fa-route" aria-hidden="true"></i>
                <span><b>${I18n.t("lpModeMoved")}</b><small>${I18n.t("lpModeMovedSub")}</small></span>
                <span class="lcModeDb ${ath ? "warn" : ""}">${Utils.num(ath)}</span>
            </button>
        </div>`;
};

AdminManager.lcModBind = function () {
    AdminManager.box().querySelectorAll("[data-lc-mod]").forEach(b => {
        b.onclick = () => {
            const lc = AdminManager.lc;
            if (lc.mod === b.dataset.lcMod) return;
            lc.mod = b.dataset.lcMod;
            AdminManager.lpTakarit();
            if (lc.map) { lc.map.remove(); lc.map = null; lc.reteg = null; }
            if (lc.mod === "pontatlan") AdminManager.lpTolt();
            else AdminManager.lcDraw();
        };
    });
};

// ===================== PONTOS HELY NÉLKÜL: GYORS MUNKASOR =====================

AdminManager.lp = { lista: [], szamok: {}, varos: null, mod: "mind", aktiv: null, picker: null, kesz: 0, satelit: false, kulcs: null };

// A sor betöltése (a kiválasztott város és szűrő szerint)
AdminManager.lpTolt = function () {

    const lp = AdminManager.lp;
    const box = AdminManager.box();
    AdminManager.lpTakarit();

    // Alapból a kiválasztott város, ha van benne teendő
    const varosok = (lp.szamok && lp.szamok.varosok) || {};
    if (lp.varos === null) {
        const db = v => varosok[v] ? varosok[v].nincs + varosok[v].kozelito : 0;
        lp.varos = db(DataManager.currentCity) ? DataManager.currentCity : "";
    }

    if (!box.querySelector("#lpLayout")) AdminManager.loading();
    else box.querySelector("#lpQueue").innerHTML = `<div class="emptyState py-4"><div class="spinner-border text-primary"></div></div>`;

    const p = new URLSearchParams({ mod: lp.mod });
    if (lp.varos) p.set("varos", lp.varos);

    fetch("/api/admin/hely-pontatlan?" + p, { cache: "no-store" })
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(d => {
            lp.lista = Array.isArray(d.lista) ? d.lista : [];
            lp.szamok = d.szamok || {};
            if (!lp.lista.some(i => i.id === lp.aktiv)) lp.aktiv = lp.lista.length ? lp.lista[0].id : null;
            AdminManager.lpDraw();
        })
        .catch(() => { box.innerHTML = `${AdminManager.lcModBar()}<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`; AdminManager.lcModBind(); });

};

// A térkép és a billentyűk eltávolítása (részváltáskor, újrarajzoláskor)
AdminManager.lpTakarit = function () {
    const lp = AdminManager.lp;
    if (lp.picker) { try { lp.picker.remove(); } catch (e) { /* már nincs */ } lp.picker = null; }
    if (lp.kulcs) { document.removeEventListener("keydown", lp.kulcs); lp.kulcs = null; }
};

// Az egyes városok és szűrők száma
AdminManager.lpDb = function (varos, mod) {
    const v = (AdminManager.lp.szamok || {}).varosok || {};
    const egy = x => !x ? 0 : mod === "semmi" ? (x.semmi || 0) : mod === "nincs" ? x.nincs : mod === "kozelito" ? x.kozelito : x.nincs + x.kozelito;
    if (varos) return egy(v[varos]);
    return Object.values(v).reduce((s, x) => s + egy(x), 0);
};

AdminManager.lpDraw = function () {

    const lp = AdminManager.lp;
    const box = AdminManager.box();
    const esc = Utils.escape;
    AdminManager.lpTakarit();

    // A városválasztó (a meglévő városfül-sáv egy „álló” listából)
    const varosok = (lp.szamok && lp.szamok.varosok) || {};
    const alLista = [];
    Object.entries(varosok).forEach(([v, x]) => { for (let n = 0; n < x.nincs + x.kozelito; n++) alLista.push({ varos: v }); });
    const db = m => AdminManager.lpDb(lp.varos, m);

    box.innerHTML = `
        ${AdminManager.lcModBar()}
        ${AdminManager.cityTabs(alLista, lp.varos, "data-lp-city")}

        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
            <div class="typeTabs mb-0" role="tablist">
                ${["semmi", "mind", "nincs", "kozelito"].map(m => `
                    <button type="button" class="typeTab ${lp.mod === m ? "active" : ""}${m === "semmi" ? " lpSemmiTab" : ""}" data-lp-mod="${m}" ${m === "semmi" ? `title="${esc(I18n.t("lpFilter_semmiHelp"))}"` : ""}>
                        <i class="fa-solid ${m === "semmi" ? "fa-circle-question" : m === "nincs" ? "fa-location-pin-lock" : m === "kozelito" ? "fa-circle-dot" : "fa-layer-group"}" aria-hidden="true"></i>
                        ${I18n.t("lpFilter_" + m)} <span class="typeTabCount">${Utils.num(db(m))}</span>
                    </button>`).join("")}
            </div>
            <span class="lpDone ms-auto ${lp.kesz ? "" : "d-none"}" id="lpDone"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${I18n.f("lpDoneN", { n: lp.kesz })}</span>
            ${lp.mod === "kozelito" && lp.lista.length ? `
                <button type="button" class="btn btn-sm btn-outline-secondary ${lp.kesz ? "" : "ms-auto"}" id="lpKeepAll" title="${esc(I18n.t("lpKeepAllHelp"))}">
                    <i class="fa-solid fa-check-double" aria-hidden="true"></i> ${I18n.f("lpKeepAll", { n: lp.lista.length })}
                </button>` : ""}
        </div>

        ${lp.lista.length ? `
        <div class="lpLayout" id="lpLayout">
            <aside class="lpQueue card" aria-label="${esc(I18n.t("lpQueue"))}">
                <div class="lpQueueHead small"><b>${I18n.t("lpQueue")}</b> <span class="text-body-secondary">${Utils.num(lp.lista.length)}${lp.lista.length >= 400 ? "+" : ""}</span></div>
                <div class="lpQueueList" id="lpQueue">${lp.lista.map(i => AdminManager.lpRow(i)).join("")}</div>
            </aside>
            <section class="lpWork" id="lpWork" aria-live="polite"></section>
        </div>` : `
        <div class="emptyState">
            <i class="fa-solid fa-map-location-dot text-success" aria-hidden="true"></i>
            <h5>${I18n.t("lpEmpty")}</h5>
            <p>${I18n.t("lpEmptyHint")}</p>
        </div>`}`;

    AdminManager.lcModBind();

    box.querySelectorAll("[data-lp-city]").forEach(b => {
        b.onclick = () => { lp.varos = b.dataset.lpCity; lp.aktiv = null; AdminManager.lpTolt(); };
    });
    box.querySelectorAll("[data-lp-mod]").forEach(b => {
        b.onclick = () => { lp.mod = b.dataset.lpMod; lp.aktiv = null; AdminManager.lpTolt(); };
    });

    const mind = document.getElementById("lpKeepAll");
    if (mind) mind.onclick = () => {
        const ids = lp.lista.map(i => i.id);
        if (!ids.length || !confirm(I18n.f("lpKeepAllConfirm", { n: ids.length }))) return;
        mind.disabled = true;
        AdminManager.lpPost("/api/admin/hely-pontatlan/mind/marad", { ids })
            .then(() => AdminManager.lpKesz(ids))
            .catch(() => { mind.disabled = false; alert(I18n.t("alertSaveError")); });
    };

    AdminManager.lpQueueBind();

    // Billentyűk: Ctrl+Enter = mentés és következő; Ctrl+→ / Ctrl+← = következő / előző
    lp.kulcs = e => {
        if (!document.getElementById("lpWork")) return AdminManager.lpTakarit();
        if (document.querySelector(".modal.show")) return;
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); const b = document.getElementById("lpSave"); if (b && !b.disabled) b.click(); return; }
        const mezoben = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "");
        if (mezoben) return;
        if ((e.ctrlKey || e.metaKey) && e.key === "ArrowRight") { e.preventDefault(); AdminManager.lpLep(1); }
        if ((e.ctrlKey || e.metaKey) && e.key === "ArrowLeft") { e.preventDefault(); AdminManager.lpLep(-1); }
    };
    document.addEventListener("keydown", lp.kulcs);
    AdminManager.takaritas.push(() => AdminManager.lpTakarit());

    if (lp.aktiv) AdminManager.lpNyit(lp.aktiv, true);

};

AdminManager.lpQueueBind = function () {
    document.querySelectorAll("#lpQueue [data-lp-row]").forEach(r => {
        r.onclick = () => AdminManager.lpNyit(Number(r.dataset.lpRow));
    });
};

// Egy sor a munkasorban
AdminManager.lpRow = function (i) {
    const esc = Utils.escape;
    const kep = i.kep_id ? `/api/kepek/${i.kep_id}` : (i.kulso_kep ? Utils.imgUrl(i.kulso_kep) : null);
    const nincs = !(i.x && i.y) || i.hely_pontossag === "nincs";
    return `
        <button type="button" class="lpRow ${i.id === AdminManager.lp.aktiv ? "active" : ""}" data-lp-row="${i.id}">
            <span class="lcThumb">${kep ? `<img src="${esc(kep)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<i class="${Types.get(i.tipus).icon}" aria-hidden="true"></i></span>
            <span class="lpRowMain">
                <b>${esc(i.cim || Types.label(i.tipus))}</b>
                <small>#${i.id} · ${esc(CityManager.helyLabel(i))}</small>
                <span class="lpTag ${nincs ? "nincs" : "kozelito"}">${nincs ? I18n.t("lpTagNone") : I18n.f("lpTagApprox", { m: LocationPicker.meter(Number(i.hely_sugar) || 500) })}</span>
            </span>
        </button>`;
};

// A leírás a helynevek kiemelésével (kattintásra a térkép rájuk keres)
AdminManager.lpKiemel = function (szoveg) {
    const esc = Utils.escape(String(szoveg || "").slice(0, 1500));
    const nev = "(?:\\p{Lu}[\\p{L}\\-']*|\\d{1,4})";
    const minta = new RegExp(
        // román / magyar előtag: str. Gábor Áron, strada Kós Károly nr. 5, bd. 1 Decembrie 1918, calea …, aleea …, piața …, cartierul …
        `(?:\\b(?:[Ss]tr(?:ada)?\\.?|[Uu]l\\.|[Bb](?:-dul|d\\.|ulevardul)|[Cc]alea|[Aa]leea|[Pp]ia[țţt]a|[Ss]pl(?:aiul)?\\.?|[Cc]artier(?:ul)?|[Zz]ona|[Ll]ak[óo]telep)\\s+${nev}(?:\\s+(?:${nev}|nr\\.?\\s*\\d+[A-Za-z]?)){0,3})` +
        // magyar utótag: Kós Károly utca, Gábor Áron u., Csíki út, Szabadság tér, Árnyas sor
        `|(?:${nev}(?:\\s+${nev}){0,2}\\s+(?:utc[aá]\\p{L}*|u\\.|útj?(?:a|on|ra|nál)?|t[ée]r(?:en|re|i)?|sor(?:on)?|k[öo]z|s[ée]t[áa]ny|lak[óo]telep\\p{L}*|negyed\\p{L}*)(?![\\p{L}])(?:\\s*\\d+[A-Za-z]?)?)`,
        "gu");
    return esc.replace(minta, m => m.length > 70 ? m : `<button type="button" class="lpHit" data-lp-q="${m.replace(/"/g, "&quot;")}">${m}</button>`);
};

// A kiemelt helynév kereshető formában: "str. Gábor Áron nr. 12" → "Gábor Áron 12",
// "Kós Károly utcában" → "Kós Károly utca"
AdminManager.lpTisztit = function (q) {
    return String(q || "")
        .replace(/\s+/g, " ")
        .replace(/^(?:str(?:ada)?\.?|ul\.)\s+/i, "")
        .replace(/\bnr\.?\s*/gi, "")
        .replace(/\s+utc[aá][\p{L}]*/u, " utca")
        .replace(/\s+útj?(?:a|on|ra|nál)?(?![\p{L}])/u, " út")
        .replace(/\s+t[ée]r(?:en|re|i)(?![\p{L}])/u, " tér")
        .trim();
};

// Egy hirdetés megnyitása a munkaterületen
AdminManager.lpNyit = function (id, csendben) {

    const lp = AdminManager.lp;
    const i = lp.lista.find(x => x.id === id);
    const hova = document.getElementById("lpWork");
    if (!i || !hova) return;
    const esc = Utils.escape;

    lp.aktiv = id;
    document.querySelectorAll("#lpQueue [data-lp-row]").forEach(r => r.classList.toggle("active", Number(r.dataset.lpRow) === id));
    const sorEl = document.querySelector(`#lpQueue [data-lp-row="${id}"]`);
    if (sorEl) sorEl.scrollIntoView({ block: "nearest" });

    if (lp.picker) { try { lp.picker.remove(); } catch (e) { /* már nincs */ } lp.picker = null; }

    const kep = i.kep_id ? `/api/kepek/${i.kep_id}` : (i.kulso_kep ? Utils.imgUrl(i.kulso_kep) : null);
    const vanPont = !!(i.x && i.y) && i.hely_pontossag !== "nincs";
    const vanKerulet = Types.fieldsFor(i.tipus, i.varos).kerulet;
    const sorszam = lp.lista.findIndex(x => x.id === id) + 1;
    const adatok = [Types.label(i.tipus), i.ar ? Utils.price(i) : "", i.nm ? `${Utils.num(i.nm)} m²` : "", i.szobak ? I18n.f("lpRooms", { n: i.szobak }) : ""].filter(Boolean);
    const leiras = String(i.leiras || "").trim();

    hova.innerHTML = `
        <div class="card lpCard">
            <div class="card-body">
                <div class="lpHead">
                    <div class="min-w-0">
                        <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                            <span class="lpTag ${vanPont ? "kozelito" : "nincs"}">${vanPont ? I18n.f("lpTagApprox", { m: LocationPicker.meter(Number(i.hely_sugar) || 500) }) : I18n.t("lpTagNone")}</span>
                            <span class="small text-body-secondary">#${i.id} · ${esc(CityManager.helyLabel(i))}</span>
                            ${i.statusz === "fuggo" ? `<span class="badge text-bg-light">${I18n.t("lcPending")}</span>` : ""}
                            <span class="small text-body-secondary ms-auto">${I18n.f("lpPos", { n: sorszam, ossz: lp.lista.length })}</span>
                        </div>
                        <h5 class="lpTitle">${esc(i.cim || Types.label(i.tipus))}</h5>
                        <div class="small text-body-secondary">${adatok.map(esc).join(" · ")}</div>
                    </div>
                    <div class="lpHeadBtns">
                        <a class="btn btn-sm btn-outline-secondary" href="#listing/${i.id}" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i> ${I18n.t("lcOpen")}</a>
                        ${i.link ? `<a class="btn btn-sm btn-outline-secondary" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-link" aria-hidden="true"></i> ${I18n.t("lpSource")}</a>` : ""}
                    </div>
                </div>

                <div class="lpBody">
                    <div class="lpText">
                        ${kep ? `<a class="lpPhoto" href="#listing/${i.id}" target="_blank" rel="noopener"><img src="${esc(kep)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></a>` : ""}
                        ${i.forras_kerulet ? `<div class="small mb-2"><i class="fa-solid fa-signs-post" aria-hidden="true"></i> ${I18n.t("lpSourceArea")}: <button type="button" class="lpHit" data-lp-q="${esc(i.forras_kerulet)}">${esc(i.forras_kerulet)}</button></div>` : ""}
                        <div class="lpDescHead small"><b>${I18n.t("lpDesc")}</b> <span class="text-body-secondary">${I18n.t("lpDescHint")}</span></div>
                        <div class="lpDesc">${leiras ? AdminManager.lpKiemel(leiras) : `<span class="text-body-secondary">${I18n.t("lpNoDesc")}</span>`}</div>
                    </div>
                    <div class="lpMapCol">
                        <div id="lpPicker"></div>
                        <div class="lpGuess small" id="lpGuess" hidden></div>
                        ${vanKerulet ? `
                        <div class="row g-2 mt-1 align-items-end">
                            <div class="col-sm-6">
                                <label class="form-label small mb-1" for="lpKerulet">${I18n.t("detailKerulet")}</label>
                                <select class="form-select form-select-sm" id="lpKerulet"></select>
                            </div>
                            <div class="col-sm-6 small text-body-secondary">${I18n.t("lcManualDistrictNote")}</div>
                        </div>` : ""}
                    </div>
                </div>

                <div class="lpFoot">
                    ${vanPont
                        ? `<button type="button" class="btn btn-outline-secondary btn-sm" id="lpKeep" title="${esc(I18n.t("lpKeepHelp"))}"><i class="fa-regular fa-circle-check" aria-hidden="true"></i> ${I18n.t("lpKeep")}</button>`
                        : `<button type="button" class="btn btn-outline-secondary btn-sm" id="lpNone" title="${esc(I18n.t("lpNoneHelp"))}"><i class="fa-solid fa-location-pin-lock" aria-hidden="true"></i> ${I18n.t("lpNone")}</button>`}
                    <span class="lpKeys small text-body-secondary d-none d-lg-inline">${I18n.t("lpKeys")}</span>
                    <button type="button" class="btn btn-outline-secondary btn-sm ms-auto" id="lpSkip"><i class="fa-solid fa-forward" aria-hidden="true"></i> ${I18n.t("lpSkip")}</button>
                    <button type="button" class="btn btn-primary" id="lpSave" ${vanPont ? "" : "disabled"}><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("lpSaveNext")}</button>
                </div>
            </div>
        </div>`;

    const ker = vanKerulet ? CityManager.loadKeruletekInto("lpKerulet", i.varos, i.kerulet || "", "newKeruletNincs") : Promise.resolve();
    const mentGomb = document.getElementById("lpSave");

    lp.picker = new LocationPicker("lpPicker", {
        x: vanPont ? Number(i.x) : null,
        y: vanPont ? Number(i.y) : null,
        pontossag: i.hely_pontossag,
        sugar: i.hely_sugar,
        varos: () => i.varos,
        szoveg: () => ({
            cim: i.cim, leiras: i.leiras || "", tipus: i.tipus, telepules: i.telepules || null,
            kerulet: (document.getElementById("lpKerulet") || {}).value || i.kerulet, forras_kerulet: i.forras_kerulet
        }),
        onChange: h => { mentGomb.disabled = !(h.x && h.y); },
        onPoint: (x, y) => {
            mentGomb.disabled = false;
            const sel = document.getElementById("lpKerulet");
            if (!sel) return;
            const k = typeof Districts !== "undefined" ? Districts.findObj(i.varos, x, y) : null;
            if (k && k.nev) { sel.value = k.nev; sel.classList.add("autoFilled"); return; }
            LocationPicker.keruletJavaslat(i.varos, x, y).then(n => { if (n) { sel.value = n; sel.classList.add("autoFilled"); } });
        }
    });
    const p = lp.picker;
    AdminManager.lpSatelit(p);

    // A kiemelt helynevek: a térkép rájuk keres
    hova.querySelectorAll("[data-lp-q]").forEach(b => {
        b.onclick = () => {
            const q = AdminManager.lpTisztit(b.dataset.lpQ);
            const inp = p.box.querySelector(".locSearchInput");
            if (inp) inp.value = q;
            p.keres(q);
            hova.querySelectorAll(".lpHit.active").forEach(x => x.classList.remove("active"));
            b.classList.add("active");
        };
    });

    // Nincs pont: rögtön javaslat a szövegből (csak javaslat – menteni a gombbal kell)
    if (!vanPont) {
        const g = p.box.querySelector(".locFromText");
        if (g) p.szovegbol(g);
        // a kereső előtöltése az első kiemelt névvel (Enterrel keres)
        const elso = hova.querySelector(".lpDesc [data-lp-q]");
        const inp = p.box.querySelector(".locSearchInput");
        if (elso && inp && !inp.value) inp.value = AdminManager.lpTisztit(elso.dataset.lpQ);
    }

    const kuld = (ut, body) => {
        hova.querySelectorAll(".lpFoot button").forEach(b => b.disabled = true);
        return AdminManager.lpPost(ut, body)
            .then(() => AdminManager.lpKesz([i.id]))
            .catch(() => { hova.querySelectorAll(".lpFoot button").forEach(b => b.disabled = false); alert(I18n.t("alertSaveError")); });
    };
    const keruletErtek = () => { const s = document.getElementById("lpKerulet"); return s ? s.value : undefined; };

    mentGomb.onclick = () => {
        const h = p.get();
        if (!(h.x && h.y)) return;
        ker.then(() => kuld(`/api/admin/hely-athelyezett/${i.id}/kezi`, { ...h, kerulet: keruletErtek() }));
    };
    document.getElementById("lpSkip").onclick = () => AdminManager.lpLep(1);
    const keep = document.getElementById("lpKeep");
    if (keep) keep.onclick = () => kuld(`/api/admin/hely-pontatlan/${i.id}/marad`);
    const none = document.getElementById("lpNone");
    if (none) none.onclick = () => {
        if (!confirm(I18n.t("lcManualNoneConfirm"))) return;
        kuld(`/api/admin/hely-athelyezett/${i.id}/kezi`, { x: null, y: null, hely_pontossag: "nincs", kerulet: keruletErtek() });
    };

    if (!csendben && window.innerWidth < 992) hova.scrollIntoView({ behavior: "smooth", block: "start" });

};

// Műholdkép kapcsoló a helyválasztó térképén (a házak, telkek felismeréséhez)
AdminManager.lpSatelit = function (p) {
    const lp = AdminManager.lp;
    if (!p || !p.map || typeof L === "undefined") return;
    const reteg = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19, attribution: "© Esri, Maxar, Earthstar Geographics"
    });
    const cimkek = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 });
    const be = on => {
        if (on) { reteg.addTo(p.map); cimkek.addTo(p.map); }
        else { reteg.remove(); cimkek.remove(); }
        if (gomb) { gomb.classList.toggle("active", on); gomb.setAttribute("aria-pressed", String(on)); }
    };
    let gomb = null;
    const Gomb = L.Control.extend({
        options: { position: "topright" },
        onAdd() {
            gomb = L.DomUtil.create("button", "leaflet-bar lpSatBtn");
            gomb.type = "button";
            gomb.innerHTML = `<i class="fa-solid fa-satellite" aria-hidden="true"></i> <span>${Utils.escape(I18n.t("lpSatellite"))}</span>`;
            gomb.setAttribute("aria-pressed", "false");
            L.DomEvent.disableClickPropagation(gomb);
            L.DomEvent.on(gomb, "click", e => { L.DomEvent.preventDefault(e); lp.satelit = !lp.satelit; be(lp.satelit); });
            return gomb;
        }
    });
    p.map.addControl(new Gomb());
    if (lp.satelit) be(true);
};

// Előre / hátra a sorban (kihagyás: a hirdetés a sorban marad)
AdminManager.lpLep = function (irany) {
    const lp = AdminManager.lp;
    if (!lp.lista.length) return;
    const n = lp.lista.findIndex(x => x.id === lp.aktiv);
    const k = (n + irany + lp.lista.length) % lp.lista.length;
    AdminManager.lpNyit(lp.lista[k].id);
};

AdminManager.lpPost = function (ut, body) {
    return fetch(ut, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {})
    }).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
};

// Kész: kikerül a sorból, jön a következő
AdminManager.lpKesz = function (ids) {
    const lp = AdminManager.lp;
    const ki = new Set(ids);
    const n = Math.max(0, lp.lista.findIndex(x => x.id === lp.aktiv));
    // A számok (város / szűrő) csökkentése
    lp.lista.filter(i => ki.has(i.id)).forEach(i => {
        const v = ((lp.szamok || {}).varosok || {})[i.varos || ""];
        const nincs = !(i.x && i.y) || i.hely_pontossag === "nincs";
        if (v) { if (nincs) v.nincs = Math.max(0, v.nincs - 1); else v.kozelito = Math.max(0, v.kozelito - 1); }
        if (lp.szamok) lp.szamok.osszes = Math.max(0, (lp.szamok.osszes || 0) - 1);
    });
    lp.lista = lp.lista.filter(i => !ki.has(i.id));
    lp.kesz += ids.length;
    clearTimeout(lp.szamlaloIdo);
    lp.szamlaloIdo = setTimeout(() => AdminManager.refreshPendingCount(), 1500);

    if (ids.length > 1 || !lp.lista.length) {
        lp.aktiv = lp.lista.length ? lp.lista[0].id : null;
        // Ha a szűrő kiürült, újratöltjük (lehet még a szerveren a 400 fölött)
        return lp.lista.length ? AdminManager.lpDraw() : AdminManager.lpTolt();
    }
    // Egy hirdetés: csak a sorból vesszük ki, a munkaterületen a következő
    ids.forEach(id => { const el = document.querySelector(`#lpQueue [data-lp-row="${id}"]`); if (el) el.remove(); });
    const kov = lp.lista[Math.min(n, lp.lista.length - 1)];
    const done = document.getElementById("lpDone");
    if (done) { done.classList.remove("d-none"); done.innerHTML = `<i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${I18n.f("lpDoneN", { n: lp.kesz })}`; }
    const fej = document.querySelector(".lpQueueHead span");
    if (fej) fej.textContent = Utils.num(lp.lista.length);
    const modDb = document.querySelectorAll(".lcModeDb")[0];
    if (modDb) modDb.textContent = Utils.num((lp.szamok || {}).osszes || 0);
    document.querySelectorAll("[data-lp-mod]").forEach(b => {
        const c = b.querySelector(".typeTabCount");
        if (c) c.textContent = Utils.num(AdminManager.lpDb(lp.varos, b.dataset.lpMod));
    });
    AdminManager.lpNyit(kov.id, true);
};
