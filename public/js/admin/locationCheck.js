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
//  automatika többé nem mozgatja.
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
