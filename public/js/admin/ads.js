// ============================================================
//  Admin – Reklámfelületek (Partnerek és reklám → Reklámfelületek)
//
//  Egy helyen minden, ami a reklámokkal kapcsolatos:
//   - számok: futó hirdetések, megjelenés, kattintás, átkattintási arány
//   - hirdetések: a hirdető képe, hova visz, hol és mettől meddig fut,
//     súly, saját jegyzet / ár; másolat, ki-be kapcsolás, törlés,
//     napi és helyenkénti statisztika
//   - reklámhelyek: oldalanként, a méretükkel és azzal, ami most fut
//     rajtuk; helyenként kikapcsolható / a helyőrző elrejthető
//   - beállítások: a reklámok mutatása, a "Bérelhető" helyőrző, az
//     érdeklődők e-mail címe
//
//  A reklámhelyek leírása (oldal, forma): js/core/ads.js (AdSlots.SLOTS)
// ============================================================

AdminManager.ads = { napok: 30, szuro: "", adat: null };

// Az oldalak sorrendje a reklámhelyek listájában, és hova visz a "Megnézem"
AdminManager.ADS_OLDALAK = [
    { oldal: "home", hash: "#home" },
    { oldal: "properties", hash: "#properties" },
    { oldal: "map", hash: "#map" },
    { oldal: "listing", hash: null },
    { oldal: "valuation", hash: "#valuation" },
    { oldal: "market", hash: "#market" },
    { oldal: "irodak", hash: "#irodak" },
    { oldal: "igenyek", hash: "#igenyek" }
];

// A kép ajánlott mérete (a hely kétszerese, éles kijelzőkhöz)
AdminManager.adsAjanlott = forma => {
    const f = AdSlots.FORMAK[forma] || { w: 970, h: 250 };
    return { w: f.w * 2, h: f.h * 2 };
};

AdminManager.renderAds = function () {
    AdminManager.loading();
    AdminManager.adsLoad().then(() => AdminManager.adsDraw()).catch(() => {
        AdminManager.box().innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
    });
};

AdminManager.adsLoad = function () {
    return fetch("/api/admin/reklamok?napok=" + AdminManager.ads.napok, { cache: "no-store" })
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(v => { AdminManager.ads.adat = v; return v; });
};

// A weboldal reklámhelyei azonnal kövessék a változást (a /api/config szerint)
AdminManager.adsSiteRefresh = function () {
    return fetch("/api/config", { cache: "no-store" })
        .then(r => r.json())
        .then(cfg => {
            if (cfg && cfg.reklam) {
                AuthManager.config.reklam = cfg.reklam;
                if (typeof AdSlots !== "undefined") AdSlots.refresh();
            }
        })
        .catch(() => { });
};

AdminManager.adsDraw = function () {

    const box = AdminManager.box();
    const v = AdminManager.ads.adat || {};
    const esc = Utils.escape;
    const lista = Array.isArray(v.hirdetesek) ? v.hirdetesek : [];
    const ossz = v.osszesites || { megjelenes: 0, kattintas: 0 };
    const b = { mutat: true, helyorzo: true, email: "", helyek: {}, ...(v.beallitas || {}) };
    const napok = v.napok || AdminManager.ads.napok;
    const fut = lista.filter(h => h.allapot === "fut");
    const lejaro = Array.isArray(v.lejarok) ? v.lejarok : [];
    const ctr = (m, k) => m ? Utils.num(k / m * 100, 1) + " %" : "–";

    const tile = (icon, color, label, value, sub) => `
        <div class="col-sm-6 col-xxl-3">
            <div class="kpiCard h-100">
                <span class="kpiIcon ${color}"><i class="${icon}" aria-hidden="true"></i></span>
                <div>
                    <small>${label}</small>
                    <h3>${value}</h3>
                    ${sub ? `<p class="kpiNote">${sub}</p>` : ""}
                </div>
            </div>
        </div>`;

    // Szűrő: állapot szerint
    const allapotok = ["fut", "utemezett", "lejart", "ki", "kep_nelkul"];
    const db = k => lista.filter(h => h.allapot === k).length;
    const szuro = AdminManager.ads.szuro;
    const szurt = szuro ? lista.filter(h => h.allapot === szuro) : lista;

    box.innerHTML = `

        <div class="row g-3 g-xxl-4 mb-4">
            ${tile("fa-solid fa-rectangle-ad", "purple", I18n.t("adsKpiRunning"), Utils.num(fut.length),
                lejaro.length ? `<span class="text-warning-emphasis">${I18n.f("adsKpiExpiring", { n: lejaro.length })}</span>` : I18n.t("adsKpiNoneExpiring"))}
            ${tile("fa-solid fa-eye", "blue", I18n.f("adsKpiViews", { n: napok }), Utils.num(ossz.megjelenes), I18n.t("adsKpiViewsSub"))}
            ${tile("fa-solid fa-arrow-pointer", "green", I18n.f("adsKpiClicks", { n: napok }), Utils.num(ossz.kattintas), I18n.t("adsKpiClicksSub"))}
            ${tile("fa-solid fa-percent", "orange", I18n.t("adsKpiCtr"), ctr(ossz.megjelenes, ossz.kattintas), I18n.t("adsKpiCtrSub"))}
        </div>

        ${!b.mutat ? `<div class="alert alert-warning d-flex flex-wrap align-items-center gap-2"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i><span class="flex-fill">${I18n.t("adsAllOff")}</span><button type="button" class="btn btn-sm btn-warning" id="adsTurnOn">${I18n.t("adsTurnOn")}</button></div>` : ""}

        <!-- Hirdetések -->
        <div class="card mb-4">
            <div class="card-header d-flex flex-wrap align-items-center gap-2">
                <h5 class="mb-0 flex-fill"><i class="fa-solid fa-images" aria-hidden="true"></i> ${I18n.t("adsAdsTitle")}</h5>
                <label class="small text-body-secondary" for="adsNapok">${I18n.t("adsPeriod")}</label>
                <select class="form-select form-select-sm w-auto" id="adsNapok">
                    ${[7, 30, 90, 365].map(n => `<option value="${n}" ${n === napok ? "selected" : ""}>${I18n.f("adsPeriodDays", { n })}</option>`).join("")}
                </select>
                <button type="button" class="btn btn-primary btn-sm" id="adsNew"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("adsNew")}</button>
            </div>
            <div class="card-body">
                <p class="sectionNote">${I18n.t("adsAdsNote")}</p>
                ${lista.length ? `
                    <div class="typeTabs mb-3" role="tablist">
                        <button type="button" class="typeTab ${!szuro ? "active" : ""}" data-ads-filter="">${I18n.t("adsFilterAll")} <span class="typeTabCount">${lista.length}</span></button>
                        ${allapotok.filter(k => db(k)).map(k => `
                            <button type="button" class="typeTab ${szuro === k ? "active" : ""}" data-ads-filter="${k}">${I18n.t("adsStatus_" + k)} <span class="typeTabCount">${db(k)}</span></button>`).join("")}
                    </div>
                    <div class="adsList">${szurt.map(h => AdminManager.adsRow(h, napok)).join("") || `<p class="text-body-secondary mb-0">${I18n.t("adsNoneInFilter")}</p>`}</div>` : `
                    <div class="emptyState py-4">
                        <i class="fa-solid fa-rectangle-ad" aria-hidden="true"></i>
                        <h5>${I18n.t("adsEmpty")}</h5>
                        <p>${I18n.t("adsEmptyHint")}</p>
                        <button type="button" class="btn btn-primary btn-sm" data-ads-new><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("adsNew")}</button>
                    </div>`}
            </div>
        </div>

        <!-- Reklámhelyek -->
        <div class="card mb-4">
            <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-table-cells-large" aria-hidden="true"></i> ${I18n.t("adsSlotsTitle")}</h5></div>
            <div class="card-body">
                <p class="sectionNote">${I18n.t("adsSlotsNote")}</p>
                <div class="adsSlotGroups">${AdminManager.adsSlotGroups(lista, b)}</div>
                <div class="d-flex flex-wrap align-items-center gap-2 mt-3">
                    <button type="button" class="btn btn-primary btn-sm" id="adsSlotsSave"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> ${I18n.t("adsSave")}</button>
                    <span class="small" id="adsSlotsMsg" aria-live="polite"></span>
                </div>
            </div>
        </div>

        <!-- Beállítások -->
        <div class="card mb-4">
            <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-sliders" aria-hidden="true"></i> ${I18n.t("adsSettingsTitle")}</h5></div>
            <div class="card-body">
                <div class="row g-4">
                    <div class="col-lg-6">
                        <div class="form-check form-switch mb-1">
                            <input class="form-check-input" type="checkbox" id="adsMutat" ${b.mutat ? "checked" : ""}>
                            <label class="form-check-label fw-semibold" for="adsMutat">${I18n.t("adsShow")}</label>
                        </div>
                        <p class="small text-body-secondary mb-3">${I18n.t("adsShowHelp")}</p>
                        <div class="form-check form-switch mb-1">
                            <input class="form-check-input" type="checkbox" id="adsHelyorzo" ${b.helyorzo ? "checked" : ""}>
                            <label class="form-check-label fw-semibold" for="adsHelyorzo">${I18n.t("adsPlaceholder")}</label>
                        </div>
                        <p class="small text-body-secondary mb-0">${I18n.t("adsPlaceholderHelp")}</p>
                    </div>
                    <div class="col-lg-6">
                        <label class="form-label fw-semibold" for="adsEmail">${I18n.t("adsEmail")}</label>
                        <input type="email" class="form-control" id="adsEmail" maxlength="160" value="${esc(b.email || "")}" placeholder="${esc(I18n.t("adsEmailPh"))}">
                        <div class="form-text">${I18n.t("adsEmailHelp")}</div>
                    </div>
                </div>
                <div class="d-flex flex-wrap align-items-center gap-2 mt-3">
                    <button type="button" class="btn btn-primary btn-sm" id="adsSettingsSave"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> ${I18n.t("adsSave")}</button>
                    <span class="small" id="adsSettingsMsg" aria-live="polite"></span>
                </div>
            </div>
        </div>

        <!-- Hogyan működik -->
        <div class="card mb-4">
            <div class="card-body">
                <h6><i class="fa-regular fa-circle-question" aria-hidden="true"></i> ${I18n.t("adsHowTitle")}</h6>
                <ol class="howList small mb-0">
                    <li>${I18n.t("adsHow1")}</li>
                    <li>${I18n.t("adsHow2")}</li>
                    <li>${I18n.t("adsHow3")}</li>
                    <li>${I18n.t("adsHow4")}</li>
                </ol>
            </div>
        </div>`;

    AdminManager.adsBind();

};

// Egy hirdetés sora: kép, név, helyek, időtartam, számok, műveletek
AdminManager.adsRow = function (h, napok) {

    const esc = Utils.escape;
    const helyek = Array.isArray(h.helyek) ? h.helyek : [];
    const szin = { fut: "success", utemezett: "info", lejart: "secondary", ki: "secondary", kep_nelkul: "warning" }[h.allapot] || "secondary";
    const ctr = h.megj_idoszak ? Utils.num(h.katt_idoszak / h.megj_idoszak * 100, 1) + " %" : "–";

    return `
        <article class="adsRow" data-ad-row="${h.id}">
            <div class="adsThumb">
                ${h.kep_mime ? `<img src="/api/reklam/${h.id}/kep?v=${h.v}" alt="" loading="lazy">` : `<i class="fa-regular fa-image" aria-hidden="true"></i>`}
            </div>
            <div class="adsMain">
                <div class="d-flex flex-wrap align-items-center gap-2">
                    <b class="adsName">${esc(h.nev)}</b>
                    <span class="badge text-bg-${szin}">${I18n.t("adsStatus_" + h.allapot)}</span>
                    ${h.suly > 1 ? `<span class="badge text-bg-light" title="${esc(I18n.t("adsFWeight"))}"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> ${h.suly}</span>` : ""}
                </div>
                <div class="small text-body-secondary">
                    ${h.hirdeto ? `<i class="fa-regular fa-building" aria-hidden="true"></i> ${esc(h.hirdeto)}` : ""}
                    ${h.cel_url ? ` · <a href="${esc(h.cel_url)}" target="_blank" rel="noopener nofollow">${esc(AdminManager.adsDomain(h.cel_url))}</a>` : ` · ${I18n.t("adsNoLink")}`}
                </div>
                <div class="adsSlotChips">
                    ${helyek.length ? helyek.map(k => `<span class="adsChip">${esc(I18n.t("adPlace_" + k))}</span>`).join("") : `<span class="text-warning-emphasis small">${I18n.t("adsWarnNoSlots")}</span>`}
                </div>
            </div>
            <div class="adsDates small">
                <i class="fa-regular fa-calendar" aria-hidden="true"></i> ${AdminManager.adsIdotartam(h)}
            </div>
            <div class="adsNums small">
                <div><b>${Utils.num(h.megj_idoszak || 0)}</b> <span class="text-body-secondary">${I18n.t("adsViews")}</span></div>
                <div><b>${Utils.num(h.katt_idoszak || 0)}</b> <span class="text-body-secondary">${I18n.t("adsClicks")}</span> · ${ctr}</div>
                <div class="text-body-secondary">${I18n.f("adsTotal", { m: Utils.num(h.megjelenes || 0), k: Utils.num(h.kattintas || 0) })}</div>
            </div>
            <div class="adsActions">
                <button type="button" class="btn btn-sm btn-outline-primary" data-ads-edit="${h.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("adsEdit")}</button>
                <div class="btn-group btn-group-sm">
                    <button type="button" class="btn btn-outline-secondary" data-ads-stat="${h.id}" title="${esc(I18n.t("adsStats"))}" aria-label="${esc(I18n.t("adsStats"))}"><i class="fa-solid fa-chart-line" aria-hidden="true"></i></button>
                    <button type="button" class="btn btn-outline-secondary" data-ads-dup="${h.id}" title="${esc(I18n.t("adsDuplicate"))}" aria-label="${esc(I18n.t("adsDuplicate"))}"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>
                    <button type="button" class="btn btn-outline-secondary" data-ads-toggle="${h.id}" title="${esc(I18n.t(h.aktiv ? "adsDisable" : "adsEnable"))}" aria-label="${esc(I18n.t(h.aktiv ? "adsDisable" : "adsEnable"))}"><i class="fa-solid ${h.aktiv ? "fa-pause" : "fa-play"}" aria-hidden="true"></i></button>
                    <button type="button" class="btn btn-outline-danger" data-ads-del="${h.id}" title="${esc(I18n.t("adsDelete"))}" aria-label="${esc(I18n.t("adsDelete"))}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                </div>
            </div>
        </article>`;

};

AdminManager.adsDomain = url => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return url; }
};

AdminManager.adsDatum = d => {
    if (!d) return "";
    const [y, m, n] = String(d).split("-").map(Number);
    try {
        return new Date(y, m - 1, n).toLocaleDateString(I18n.current === "en" ? "en-GB" : I18n.current === "ro" ? "ro-RO" : "hu-HU", { year: "numeric", month: "short", day: "numeric" });
    } catch (e) { return d; }
};

// "2026. okt. 1. – 2026. nov. 30. · még 52 nap"
AdminManager.adsIdotartam = function (h) {
    const tol = AdminManager.adsDatum(h.kezdet), ig = AdminManager.adsDatum(h.vege);
    let s = tol && ig ? I18n.f("adsFromTo", { tol, ig }) : tol ? I18n.f("adsFrom", { tol }) : ig ? I18n.f("adsUntil", { ig }) : I18n.t("adsNoEnd");
    if (h.vege && h.allapot === "fut") {
        const [y, m, n] = h.vege.split("-").map(Number);
        const ma = new Date(); ma.setHours(0, 0, 0, 0);
        const nap = Math.round((new Date(y, m - 1, n) - ma) / 86400000);
        s += ` · <span class="${nap <= 7 ? "text-warning-emphasis fw-semibold" : "text-body-secondary"}">${nap <= 0 ? I18n.t("adsEndsToday") : I18n.f("adsDaysLeft", { n: nap })}</span>`;
    }
    return s;
};

// A reklámhelyek oldalanként: méret, forma, mi fut rajta, ki-be kapcsolás
AdminManager.adsSlotGroups = function (lista, b) {

    const esc = Utils.escape;
    const futok = lista.filter(h => h.allapot === "fut");

    return AdminManager.ADS_OLDALAK.map(o => {

        const helyek = Object.entries(AdSlots.SLOTS).filter(([, s]) => s.oldal === o.oldal);
        if (!helyek.length) return "";

        const lap = PageManager.PAGES[o.oldal] || { icon: "fa-solid fa-file", label: o.oldal };

        return `
            <div class="adsSlotGroup">
                <div class="adsSlotGroupHead">
                    <span><i class="${lap.icon}" aria-hidden="true"></i> <b>${esc(I18n.t(lap.label))}</b></span>
                    ${o.hash ? `<a class="small" href="${o.hash}">${I18n.t("adsSlotView")} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>` : ""}
                </div>
                ${helyek.map(([k, s]) => {
                    const f = AdSlots.FORMAK[s.forma] || {};
                    const h = (b.helyek && b.helyek[k]) || {};
                    const rajta = futok.filter(a => Array.isArray(a.helyek) && a.helyek.includes(k));
                    return `
                        <div class="adsSlot" data-slot="${k}">
                            <span class="adsShape ad-shape-${s.forma}" aria-hidden="true"></span>
                            <div class="adsSlotMain">
                                <b>${esc(I18n.t("adPlace_" + k))}</b>
                                <small class="text-body-secondary">${f.w} × ${f.h} · ${esc(I18n.t("adsFormat_" + s.forma))}</small>
                                <small class="${rajta.length ? "text-success" : "text-body-secondary"}">
                                    ${rajta.length ? `<i class="fa-solid fa-circle-play" aria-hidden="true"></i> ${esc(rajta.map(a => a.hirdeto || a.nev).join(", "))}` : I18n.t("adsSlotEmpty")}
                                </small>
                            </div>
                            <div class="adsSlotSwitches">
                                <div class="form-check form-switch mb-0">
                                    <input class="form-check-input" type="checkbox" id="adsOn_${k}" data-slot-on="${k}" ${h.aktiv !== false ? "checked" : ""}>
                                    <label class="form-check-label small" for="adsOn_${k}">${I18n.t("adsSlotOn")}</label>
                                </div>
                                <div class="form-check form-switch mb-0">
                                    <input class="form-check-input" type="checkbox" id="adsPh_${k}" data-slot-ph="${k}" ${h.helyorzo !== false ? "checked" : ""}>
                                    <label class="form-check-label small" for="adsPh_${k}">${I18n.t("adsSlotPlaceholder")}</label>
                                </div>
                            </div>
                        </div>`;
                }).join("")}
            </div>`;

    }).join("");

};

AdminManager.adsBind = function () {

    const box = AdminManager.box();
    const v = AdminManager.ads.adat || {};
    const lista = Array.isArray(v.hirdetesek) ? v.hirdetesek : [];
    const keres = id => lista.find(h => h.id === Number(id));

    box.querySelectorAll("#adsNew, [data-ads-new]").forEach(b => { b.onclick = () => AdminManager.adsEditor(null); });

    document.getElementById("adsNapok").onchange = e => {
        AdminManager.ads.napok = Number(e.target.value) || 30;
        AdminManager.renderAds();
    };

    box.querySelectorAll("[data-ads-filter]").forEach(b => {
        b.onclick = () => { AdminManager.ads.szuro = b.dataset.adsFilter; AdminManager.adsDraw(); };
    });

    box.querySelectorAll("[data-ads-edit]").forEach(b => { b.onclick = () => AdminManager.adsEditor(keres(b.dataset.adsEdit)); });
    box.querySelectorAll("[data-ads-stat]").forEach(b => { b.onclick = () => AdminManager.adsStats(keres(b.dataset.adsStat)); });

    // Másolat: ugyanaz a hirdetés (a képeivel), új névvel – pl. egy következő időszakra
    box.querySelectorAll("[data-ads-dup]").forEach(b => {
        b.onclick = () => {
            const h = keres(b.dataset.adsDup);
            if (h) AdminManager.adsEditor({ ...h, id: null, nev: `${h.nev} ${I18n.t("adsCopySuffix")}`, masolat: h.id, megjelenes: 0, kattintas: 0 });
        };
    });

    box.querySelectorAll("[data-ads-toggle]").forEach(b => {
        b.onclick = () => {
            const h = keres(b.dataset.adsToggle);
            if (!h) return;
            b.disabled = true;
            AdminManager.adsKuld("PUT", "/api/admin/reklamok/" + h.id, { aktiv: !h.aktiv })
                .then(() => AdminManager.adsUtanna())
                .catch(err => { b.disabled = false; alert(AdminManager.adsHiba(err)); });
        };
    });

    box.querySelectorAll("[data-ads-del]").forEach(b => {
        b.onclick = () => {
            const h = keres(b.dataset.adsDel);
            if (!h || !confirm(I18n.t("adsDeleteConfirm") + "\n\n" + h.nev)) return;
            b.disabled = true;
            fetch("/api/admin/reklamok/" + h.id, { method: "DELETE" })
                .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); })
                .then(() => AdminManager.adsUtanna())
                .catch(() => { b.disabled = false; alert(I18n.t("adsErrGeneric")); });
        };
    });

    // Beállítások
    const turnOn = document.getElementById("adsTurnOn");
    if (turnOn) turnOn.onclick = () => {
        turnOn.disabled = true;
        AdminManager.adsKuld("PUT", "/api/admin/reklam", { mutat: true }).then(() => AdminManager.adsUtanna());
    };

    document.getElementById("adsSettingsSave").onclick = () => {
        const msg = document.getElementById("adsSettingsMsg");
        msg.className = "small text-body-secondary";
        msg.innerText = "…";
        AdminManager.adsKuld("PUT", "/api/admin/reklam", {
            mutat: document.getElementById("adsMutat").checked,
            helyorzo: document.getElementById("adsHelyorzo").checked,
            email: document.getElementById("adsEmail").value.trim()
        })
            .then(() => {
                msg.className = "small text-success";
                msg.innerHTML = `<i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("adsSaved")}`;
                return AdminManager.adsUtanna(true);
            })
            .catch(err => { msg.className = "small text-danger"; msg.innerText = AdminManager.adsHiba(err); });
    };

    document.getElementById("adsSlotsSave").onclick = () => {
        const msg = document.getElementById("adsSlotsMsg");
        const helyek = {};
        Object.keys(AdSlots.SLOTS).forEach(k => {
            const on = box.querySelector(`[data-slot-on="${k}"]`);
            const ph = box.querySelector(`[data-slot-ph="${k}"]`);
            helyek[k] = { aktiv: on ? on.checked : true, helyorzo: ph ? ph.checked : true };
        });
        msg.className = "small text-body-secondary";
        msg.innerText = "…";
        AdminManager.adsKuld("PUT", "/api/admin/reklam", { helyek })
            .then(() => {
                msg.className = "small text-success";
                msg.innerHTML = `<i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("adsSaved")}`;
                return AdminManager.adsUtanna(true);
            })
            .catch(err => { msg.className = "small text-danger"; msg.innerText = AdminManager.adsHiba(err); });
    };

    // Egy hely kikapcsolva: a helyőrző kapcsolója nem számít
    box.querySelectorAll("[data-slot-on]").forEach(c => {
        const ph = box.querySelector(`[data-slot-ph="${c.dataset.slotOn}"]`);
        const igazit = () => { if (ph) ph.disabled = !c.checked; };
        c.addEventListener("change", igazit);
        igazit();
    });

};

// Mentés után: a lista, a számlálók és a weboldal reklámhelyei újra
//  csendben: a lap nem rajzolódik újra (a mentés üzenete látszódjon)
AdminManager.adsUtanna = function (csendben) {
    const p = [AdminManager.adsSiteRefresh(), AdminManager.refreshPendingCount()];
    if (!csendben) p.push(AdminManager.adsLoad().then(() => { if (AdminManager.tab === "reklam") AdminManager.adsDraw(); }));
    else p.push(AdminManager.adsLoad());
    return Promise.all(p);
};

AdminManager.adsKuld = function (method, url, body) {
    return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(r => r.json().catch(() => ({})).then(v => {
            if (!r.ok) { const e = new Error(v.error || ("HTTP " + r.status)); e.kod = v.error; throw e; }
            return v;
        }));
};

AdminManager.adsHiba = function (err) {
    const k = err && err.kod ? "adsErr_" + err.kod : null;
    const t = k ? I18n.t(k) : "";
    return t && t !== k ? t : I18n.t("adsErrGeneric");
};

// ---------- Szerkesztő (új hirdetés / módosítás / másolat) ----------

AdminManager.adsEditor = function (h) {

    const esc = Utils.escape;
    const uj = !h || !h.id;
    h = h || { aktiv: true, suly: 1, helyek: [] };

    let el = document.getElementById("adsEditorModal");
    if (!el) {
        el = document.createElement("div");
        el.id = "adsEditorModal";
        el.className = "modal fade";
        el.tabIndex = -1;
        el.setAttribute("aria-hidden", "true");
        el.innerHTML = `<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"></div></div>`;
        document.body.appendChild(el);
    }

    // A választott képek (data URL) és a méretük – a mentésig
    const kep = { fo: null, mobil: null, foMeret: h.kep_w ? { w: h.kep_w, h: h.kep_h } : null, mobilMeret: h.kep_mobil_w ? { w: h.kep_mobil_w, h: h.kep_mobil_h } : null, mobilTorol: false };
    //  (másolatnál az eredeti képei – a mentéskor újra feltöltjük őket)
    const forrasId = h.id || h.masolat || null;
    const regiKep = forrasId && h.kep_mime ? `/api/reklam/${forrasId}/kep?v=${h.v}` : null;
    const regiMobil = forrasId && h.van_mobil ? `/api/reklam/${forrasId}/kep?m=1&v=${h.v}` : null;
    const vanKep = () => !!(kep.fo || (!uj && h.kep_mime));

    const helyek = new Set(Array.isArray(h.helyek) ? h.helyek : []);

    // A helyek oldalanként, a forma ajánlott méretével
    const helyLista = AdminManager.ADS_OLDALAK.map(o => {
        const sl = Object.entries(AdSlots.SLOTS).filter(([, s]) => s.oldal === o.oldal);
        if (!sl.length) return "";
        const lap = PageManager.PAGES[o.oldal] || { icon: "fa-solid fa-file", label: o.oldal };
        return `
            <div class="adsPickGroup">
                <div class="adsPickHead"><i class="${lap.icon}" aria-hidden="true"></i> ${esc(I18n.t(lap.label))}</div>
                ${sl.map(([k, s]) => {
                    const f = AdSlots.FORMAK[s.forma] || {};
                    return `
                        <label class="adsPick" data-pick="${k}" data-forma="${s.forma}">
                            <input class="form-check-input" type="checkbox" value="${k}" ${helyek.has(k) ? "checked" : ""}>
                            <span class="adsShape ad-shape-${s.forma}" aria-hidden="true"></span>
                            <span class="adsPickText">
                                <b>${esc(I18n.t("adPlace_" + k))}</b>
                                <small>${f.w} × ${f.h} · ${esc(I18n.t("adsFormat_" + s.forma))}</small>
                            </span>
                            <span class="adsFit" data-fit="${k}"></span>
                        </label>`;
                }).join("")}
            </div>`;
    }).join("");

    // Ajánlott képméretek formánként
    const ajanlas = Object.keys(AdSlots.FORMAK).map(f => {
        const a = AdminManager.adsAjanlott(f);
        return `<li><span class="adsShape ad-shape-${f}" aria-hidden="true"></span> ${esc(I18n.t("adsFormat_" + f))}: <b>${a.w} × ${a.h}</b> px</li>`;
    }).join("");

    el.querySelector(".modal-content").innerHTML = `
        <div class="modal-header">
            <h5 class="modal-title"><i class="fa-solid fa-rectangle-ad" aria-hidden="true"></i> ${I18n.t(uj ? "adsEditorNew" : "adsEditorEdit")}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
        </div>
        <div class="modal-body">
            <div class="alert alert-danger small py-2" id="adsEdErr" hidden></div>
            <div class="row g-4">

                <div class="col-lg-6">
                    <h6 class="adsEdH">${I18n.t("adsEdAbout")}</h6>
                    <div class="mb-3">
                        <label class="form-label req" for="adsEdNev">${I18n.t("adsFName")}</label>
                        <input type="text" class="form-control" id="adsEdNev" maxlength="120" value="${esc(h.nev || "")}" placeholder="${esc(I18n.t("adsFNamePh"))}">
                    </div>
                    <div class="row g-3 mb-3">
                        <div class="col-sm-6">
                            <label class="form-label" for="adsEdHirdeto">${I18n.t("adsFAdvertiser")}</label>
                            <input type="text" class="form-control" id="adsEdHirdeto" maxlength="120" value="${esc(h.hirdeto || "")}">
                            <div class="form-text">${I18n.t("adsFAdvertiserHelp")}</div>
                        </div>
                        <div class="col-sm-6">
                            <label class="form-label" for="adsEdKapcsolat">${I18n.t("adsFContact")}</label>
                            <input type="text" class="form-control" id="adsEdKapcsolat" maxlength="300" value="${esc(h.kapcsolat || "")}" placeholder="${esc(I18n.t("adsFContactPh"))}">
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label" for="adsEdUrl">${I18n.t("adsFUrl")}</label>
                        <input type="url" class="form-control" id="adsEdUrl" maxlength="500" value="${esc(h.cel_url || "")}" placeholder="https://">
                        <div class="form-text">${I18n.t("adsFUrlHelp")}</div>
                    </div>

                    <h6 class="adsEdH mt-4">${I18n.t("adsFImage")}</h6>
                    <div class="adsImgPick mb-2">
                        <div class="adsImgPrev" id="adsEdKepPrev">${regiKep ? `<img src="${regiKep}" alt="">` : `<i class="fa-regular fa-image" aria-hidden="true"></i>`}</div>
                        <div class="flex-fill">
                            <label class="btn btn-outline-primary btn-sm mb-1">
                                <i class="fa-solid fa-upload" aria-hidden="true"></i> <span>${I18n.t(regiKep ? "adsFImageChange" : "adsFImagePick")}</span>
                                <input type="file" id="adsEdKep" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
                            </label>
                            <div class="small text-body-secondary" id="adsEdKepInfo">${kep.foMeret ? I18n.f("adsImageSize", { w: kep.foMeret.w, h: kep.foMeret.h }) : ""}</div>
                        </div>
                    </div>
                    <div class="form-text mb-3">${I18n.t("adsFImageHelp")}</div>

                    <div class="adsImgPick mb-2">
                        <div class="adsImgPrev small" id="adsEdMobilPrev">${regiMobil ? `<img src="${regiMobil}" alt="">` : `<i class="fa-solid fa-mobile-screen" aria-hidden="true"></i>`}</div>
                        <div class="flex-fill">
                            <div class="small fw-semibold mb-1">${I18n.t("adsFMobile")}</div>
                            <label class="btn btn-outline-secondary btn-sm mb-1">
                                <i class="fa-solid fa-upload" aria-hidden="true"></i> <span>${I18n.t(regiMobil ? "adsFImageChange" : "adsFImagePick")}</span>
                                <input type="file" id="adsEdMobil" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
                            </label>
                            ${regiMobil && !uj ? `<button type="button" class="btn btn-link btn-sm text-danger" id="adsEdMobilDel">${I18n.t("adsFMobileRemove")}</button>` : ""}
                            <div class="small text-body-secondary" id="adsEdMobilInfo">${kep.mobilMeret ? I18n.f("adsImageSize", { w: kep.mobilMeret.w, h: kep.mobilMeret.h }) : ""}</div>
                            <div class="form-text mt-0">${I18n.t("adsFMobileHelp")}</div>
                        </div>
                    </div>

                    <div class="mb-3 mt-3">
                        <label class="form-label" for="adsEdAlt">${I18n.t("adsFAlt")}</label>
                        <input type="text" class="form-control" id="adsEdAlt" maxlength="200" value="${esc(h.alt || "")}" placeholder="${esc(I18n.t("adsFAltPh"))}">
                    </div>

                    <details class="small adsSizes">
                        <summary>${I18n.t("adsSizesTitle")}</summary>
                        <ul class="list-unstyled mt-2 mb-0">${ajanlas}</ul>
                    </details>
                </div>

                <div class="col-lg-6">
                    <h6 class="adsEdH">${I18n.t("adsFSlots")}</h6>
                    <p class="small text-body-secondary mb-2">${I18n.t("adsFSlotsHelp")}</p>
                    <div class="adsPickList" id="adsEdHelyek">${helyLista}</div>

                    <h6 class="adsEdH mt-4">${I18n.t("adsEdWhen")}</h6>
                    <div class="row g-3">
                        <div class="col-sm-6">
                            <label class="form-label" for="adsEdKezdet">${I18n.t("adsFStart")}</label>
                            <input type="date" class="form-control" id="adsEdKezdet" value="${esc(h.kezdet || "")}">
                        </div>
                        <div class="col-sm-6">
                            <label class="form-label" for="adsEdVege">${I18n.t("adsFEnd")}</label>
                            <input type="date" class="form-control" id="adsEdVege" value="${esc(h.vege || "")}">
                        </div>
                        <div class="col-12"><div class="form-text mt-0">${I18n.t("adsFDatesHelp")}</div></div>
                        <div class="col-sm-6">
                            <label class="form-label" for="adsEdSuly">${I18n.t("adsFWeight")}</label>
                            <input type="number" class="form-control" id="adsEdSuly" min="1" max="10" value="${Number(h.suly) || 1}">
                            <div class="form-text">${I18n.t("adsFWeightHelp")}</div>
                        </div>
                        <div class="col-sm-6">
                            <label class="form-label" for="adsEdAr">${I18n.t("adsFPrice")}</label>
                            <input type="number" class="form-control" id="adsEdAr" min="0" step="any" value="${h.ar !== null && h.ar !== undefined ? esc(String(h.ar)) : ""}">
                        </div>
                        <div class="col-12">
                            <label class="form-label" for="adsEdMegj">${I18n.t("adsFNote")}</label>
                            <textarea class="form-control" id="adsEdMegj" rows="2" maxlength="2000">${esc(h.megjegyzes || "")}</textarea>
                        </div>
                        <div class="col-12">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="adsEdAktiv" ${h.aktiv !== false ? "checked" : ""}>
                                <label class="form-check-label" for="adsEdAktiv">${I18n.t("adsFActive")}</label>
                            </div>
                        </div>
                    </div>

                    <h6 class="adsEdH mt-4">${I18n.t("adsPreview")}</h6>
                    <div class="adsPreview" id="adsEdPreview"></div>
                </div>

            </div>
        </div>
        <div class="modal-footer">
            <span class="small text-warning-emphasis me-auto" id="adsEdWarn"></span>
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
            <button type="button" class="btn btn-primary" id="adsEdSave"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> ${I18n.t("adsSaveAd")}</button>
        </div>`;

    const modal = bootstrap.Modal.getOrCreateInstance(el);
    const $ = id => document.getElementById(id);

    const valasztott = () => [...el.querySelectorAll("#adsEdHelyek input:checked")].map(c => c.value);

    // Melyik hely illik a kép arányához (±25 %)
    const illik = () => {
        const m = kep.foMeret;
        el.querySelectorAll("[data-pick]").forEach(p => {
            const fit = p.querySelector(".adsFit");
            const f = AdSlots.FORMAK[p.dataset.forma];
            if (!m || !f || !m.w || !m.h) { fit.innerHTML = ""; p.classList.remove("fitOk", "fitBad"); return; }
            const arany = (m.w / m.h) / (f.w / f.h);
            const jo = arany > 0.8 && arany < 1.25;
            p.classList.toggle("fitOk", jo);
            p.classList.toggle("fitBad", !jo);
            fit.innerHTML = jo
                ? `<i class="fa-solid fa-circle-check text-success" title="${esc(I18n.t("adsFitOk"))}" aria-label="${esc(I18n.t("adsFitOk"))}"></i>`
                : `<i class="fa-solid fa-triangle-exclamation text-warning" title="${esc(I18n.t("adsFitBad"))}" aria-label="${esc(I18n.t("adsFitBad"))}"></i>`;
        });
    };

    // Előnézet: a kép az első választott hely formájában (vagy a legjobban illőben)
    const elonezet = () => {
        const prev = $("adsEdPreview");
        const src = kep.fo || regiKep;
        const v = valasztott();
        const hely = v[0] || "home";
        const forma = (AdSlots.SLOTS[hely] || {}).forma || "billboard";
        const hirdeto = $("adsEdHirdeto").value.trim();
        prev.innerHTML = src
            ? `<div class="adsPreviewLabel small text-body-secondary">${esc(I18n.t("adPlace_" + hely))}</div>
               <aside class="adSlot adReal ad-${forma}">
                   <span class="adTag">${esc(I18n.t("adTag") + (hirdeto ? " · " + hirdeto : ""))}</span>
                   <div class="adLink"><picture><img src="${src}" alt=""></picture></div>
               </aside>`
            : `<p class="small text-body-secondary mb-0">${I18n.t("adsPreviewNoImage")}</p>`;
    };

    const figyelmeztet = () => {
        const w = [];
        if (!vanKep()) w.push(I18n.t("adsWarnNoImage"));
        if (!valasztott().length) w.push(I18n.t("adsWarnNoSlots"));
        $("adsEdWarn").innerText = w.join(" ");
    };

    // Kép választása: 3 MB fölött (nem GIF) lekicsinyítjük
    const kepValaszt = (input, cel) => {
        const file = input.files && input.files[0];
        if (!file) return;
        const info = $(cel === "fo" ? "adsEdKepInfo" : "adsEdMobilInfo");
        const prevBox = $(cel === "fo" ? "adsEdKepPrev" : "adsEdMobilPrev");
        info.innerText = "…";
        AdminManager.adsKepOlvas(file).then(k => {
            kep[cel] = k.dataUrl;
            kep[cel === "fo" ? "foMeret" : "mobilMeret"] = { w: k.w, h: k.h };
            if (cel === "mobil") kep.mobilTorol = false;
            prevBox.innerHTML = `<img src="${k.dataUrl}" alt="">`;
            info.innerHTML = I18n.f("adsImageInfo", { w: k.w, h: k.h, kb: Math.round(k.bajt / 1024) }) + (k.kicsinyitett ? ` · <span class="text-body-secondary">${I18n.t("adsImageResized")}</span>` : "");
            if (cel === "fo") { illik(); elonezet(); }
            figyelmeztet();
        }).catch(err => {
            input.value = "";
            const kod = "adsErr_" + ((err && err.message) || "bad_image");
            const t = I18n.t(kod);
            info.innerHTML = `<span class="text-danger">${esc(t !== kod ? t : I18n.t("adsErr_bad_image"))}</span>`;
        });
    };

    $("adsEdKep").onchange = e => kepValaszt(e.target, "fo");
    $("adsEdMobil").onchange = e => kepValaszt(e.target, "mobil");

    const mobilDel = $("adsEdMobilDel");
    if (mobilDel) mobilDel.onclick = () => {
        kep.mobil = null;
        kep.mobilMeret = null;
        kep.mobilTorol = true;
        $("adsEdMobilPrev").innerHTML = `<i class="fa-solid fa-mobile-screen" aria-hidden="true"></i>`;
        $("adsEdMobilInfo").innerText = "";
        mobilDel.remove();
    };

    el.querySelectorAll("#adsEdHelyek input").forEach(c => c.addEventListener("change", () => { elonezet(); figyelmeztet(); }));
    $("adsEdHirdeto").addEventListener("input", elonezet);

    illik();
    elonezet();
    figyelmeztet();

    // Másolat: az eredeti képei (data URL-ként, hogy a mentéssel feltöltődjenek)
    if (uj && h.masolat) {
        if (regiKep) AdminManager.adsKepLetolt(regiKep).then(d => { kep.fo = d; figyelmeztet(); }).catch(() => { });
        if (regiMobil) AdminManager.adsKepLetolt(regiMobil).then(d => { kep.mobil = d; }).catch(() => { });
    }

    $("adsEdSave").onclick = () => {

        const err = $("adsEdErr");
        err.hidden = true;

        const body = {
            nev: $("adsEdNev").value.trim(),
            hirdeto: $("adsEdHirdeto").value.trim(),
            kapcsolat: $("adsEdKapcsolat").value.trim(),
            cel_url: $("adsEdUrl").value.trim(),
            alt: $("adsEdAlt").value.trim(),
            helyek: valasztott(),
            kezdet: $("adsEdKezdet").value || null,
            vege: $("adsEdVege").value || null,
            suly: Number($("adsEdSuly").value) || 1,
            ar: $("adsEdAr").value === "" ? null : Number($("adsEdAr").value),
            megjegyzes: $("adsEdMegj").value.trim(),
            aktiv: $("adsEdAktiv").checked
        };

        if (!body.nev) {
            err.innerText = I18n.t("adsErr_name_required");
            err.hidden = false;
            $("adsEdNev").focus();
            return;
        }

        if (kep.fo) body.kep = kep.fo;
        if (kep.mobil) body.kep_mobil = kep.mobil;
        if (kep.mobilTorol) body.kep_mobil_torol = true;

        const gomb = $("adsEdSave");
        gomb.disabled = true;

        AdminManager.adsKuld(uj ? "POST" : "PUT", uj ? "/api/admin/reklamok" : "/api/admin/reklamok/" + h.id, body)
            .then(() => {
                modal.hide();
                return AdminManager.adsUtanna();
            })
            .catch(e => {
                err.innerText = AdminManager.adsHiba(e);
                err.hidden = false;
                err.scrollIntoView({ block: "nearest" });
            })
            .finally(() => { gomb.disabled = false; });

    };

    modal.show();

};

// Egy meglévő hirdetés képe data URL-ként (a másolathoz)
AdminManager.adsKepLetolt = function (url) {
    return fetch(url).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); })
        .then(blob => new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => reject(new Error("read_error"));
            fr.readAsDataURL(blob);
        }));
};

//  A választott kép: { dataUrl, w, h, bajt, kicsinyitett }
//  3 MB fölött (és nem GIF – az animáció megmaradjon) lekicsinyítjük
AdminManager.adsKepOlvas = function (file) {

    const MAX = 3 * 1024 * 1024;

    return new Promise((resolve, reject) => {

        if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return reject(new Error("bad_image_type"));
        if (file.type === "image/gif" && file.size > MAX) return reject(new Error("image_too_big"));

        const reader = new FileReader();
        reader.onerror = () => reject(new Error("bad_image"));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error("bad_image"));
            img.onload = () => {
                const w = img.naturalWidth, h = img.naturalHeight;
                if (file.size <= MAX) return resolve({ dataUrl: reader.result, w, h, bajt: file.size, kicsinyitett: false });

                // Túl nagy: legfeljebb 2400 pixel, JPEG (átlátszó PNG / WebP: WebP)
                const arany = Math.min(1, 2400 / Math.max(w, h));
                const cw = Math.round(w * arany), ch = Math.round(h * arany);
                const c = document.createElement("canvas");
                c.width = cw;
                c.height = ch;
                const ctx = c.getContext("2d");
                const atlatszo = file.type !== "image/jpeg";
                if (!atlatszo) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch); }
                ctx.drawImage(img, 0, 0, cw, ch);
                let url = c.toDataURL(atlatszo ? "image/webp" : "image/jpeg", 0.88);
                if (!url.startsWith("data:image/webp") && atlatszo) url = c.toDataURL("image/png");
                const bajt = Math.round((url.length - url.indexOf(",") - 1) * 3 / 4);
                if (bajt > MAX) return reject(new Error("image_too_big"));
                resolve({ dataUrl: url, w: cw, h: ch, bajt, kicsinyitett: true });
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);

    });

};

// ---------- Statisztika (napi és helyenkénti bontás) ----------

AdminManager.adsStats = function (h) {

    if (!h) return;
    const esc = Utils.escape;

    let el = document.getElementById("adsStatsModal");
    if (!el) {
        el = document.createElement("div");
        el.id = "adsStatsModal";
        el.className = "modal fade";
        el.tabIndex = -1;
        el.setAttribute("aria-hidden", "true");
        el.innerHTML = `<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"></div></div>`;
        document.body.appendChild(el);
        el.addEventListener("hidden.bs.modal", () => {
            if (AdminManager.adsChart) { AdminManager.adsChart.destroy(); AdminManager.adsChart = null; }
        });
    }

    el.querySelector(".modal-content").innerHTML = `
        <div class="modal-header">
            <h5 class="modal-title"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> ${esc(I18n.f("adsStatsTitle", { nev: h.nev }))}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
        </div>
        <div class="modal-body" id="adsStatsBody"><div class="emptyState"><div class="spinner-border text-primary"></div></div></div>`;

    bootstrap.Modal.getOrCreateInstance(el).show();

    fetch("/api/admin/reklamok/" + h.id + "/stat", { cache: "no-store" })
        .then(r => r.json())
        .then(v => {

            const sorok = Array.isArray(v.napi) ? v.napi : [];
            const body = document.getElementById("adsStatsBody");
            if (!body) return;

            if (!sorok.length) {
                body.innerHTML = `<div class="emptyState py-4"><i class="fa-regular fa-chart-bar" aria-hidden="true"></i><h5>${I18n.t("adsStatsNoData")}</h5></div>`;
                return;
            }

            // Naponta (az elmúlt 60 nap, a hiányzó napok nullával)
            const napok = [];
            const ma = new Date(); ma.setHours(0, 0, 0, 0);
            for (let i = 59; i >= 0; i--) {
                const d = new Date(ma.getTime() - i * 86400000);
                napok.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
            }
            const napi = new Map(napok.map(n => [n, { m: 0, k: 0 }]));
            const helyenkent = new Map();
            sorok.forEach(s => {
                const n = napi.get(s.nap);
                if (n) { n.m += s.megjelenes || 0; n.k += s.kattintas || 0; }
                const hk = s.hely || "";
                if (!helyenkent.has(hk)) helyenkent.set(hk, { m: 0, k: 0 });
                helyenkent.get(hk).m += s.megjelenes || 0;
                helyenkent.get(hk).k += s.kattintas || 0;
            });

            const ctr = (m, k) => m ? Utils.num(k / m * 100, 1) + " %" : "–";

            body.innerHTML = `
                <h6>${I18n.t("adsStatsDaily")}</h6>
                <div class="adsChartBox mb-4"><canvas id="adsStatsChart" aria-label="${esc(I18n.t("adsStatsDaily"))}"></canvas></div>
                <h6>${I18n.t("adsStatsBySlot")}</h6>
                <div class="table-responsive">
                    <table class="table table-sm statTable mb-0">
                        <thead><tr><th></th><th class="text-end">${I18n.t("adsViews")}</th><th class="text-end">${I18n.t("adsClicks")}</th><th class="text-end">${I18n.t("adsCtr")}</th></tr></thead>
                        <tbody>
                            ${[...helyenkent.entries()].sort((a, b) => b[1].m - a[1].m).map(([k, x]) => `
                                <tr><td>${esc(k ? I18n.t("adPlace_" + k) : "–")}</td><td class="text-end">${Utils.num(x.m)}</td><td class="text-end">${Utils.num(x.k)}</td><td class="text-end">${ctr(x.m, x.k)}</td></tr>`).join("")}
                        </tbody>
                    </table>
                </div>`;

            if (typeof Chart === "undefined") return;

            const css = getComputedStyle(document.documentElement);
            const szin = (v, d) => (css.getPropertyValue(v) || "").trim() || d;
            if (AdminManager.adsChart) AdminManager.adsChart.destroy();
            AdminManager.adsChart = new Chart(document.getElementById("adsStatsChart"), {
                type: "bar",
                data: {
                    labels: napok.map(n => n.slice(5).replace("-", ".")),
                    datasets: [
                        { label: I18n.t("adsViews"), data: napok.map(n => napi.get(n).m), backgroundColor: szin("--ip-accent", "#1f6f5c"), yAxisID: "y" },
                        { label: I18n.t("adsClicks"), data: napok.map(n => napi.get(n).k), type: "line", borderColor: "#f59e0b", backgroundColor: "#f59e0b", pointRadius: 2, tension: 0.25, yAxisID: "y1" }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: { legend: { position: "bottom" } },
                    scales: {
                        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
                        y: { beginAtZero: true, ticks: { precision: 0 } },
                        y1: { beginAtZero: true, position: "right", ticks: { precision: 0 }, grid: { drawOnChartArea: false } }
                    }
                }
            });

        })
        .catch(() => {
            const body = document.getElementById("adsStatsBody");
            if (body) body.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
        });

};
