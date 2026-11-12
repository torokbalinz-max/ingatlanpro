// ============================================================
//  Admin → Város → Források (#admin/forrasok)
//
//  A régi „Beolvasás” és „Figyelt oldalak” egy helyen, a felül kiválasztott
//  városra: típusonként (eladó lakás, kiadó lakás, ház, telek, üzlet, iroda)
//  azok az oldalak, ahonnan beolvasunk – OLX és Storia közvetlenül, a többi
//  (imobiliare.ro, Publi24, Homezz…) az Imoradar24 listájából, és saját
//  linkek (pl. egy kerület listája).
//
//  - a linkek a város nevéből maguktól készülnek, szerkeszthetők
//  - futtatás: egy sor ▶, egy típus, az egész város, vagy minden város
//  - ha egy link megváltozott (404 / máshová visz), a futás megpróbálja
//    megkeresni az újat és kicseréli; ha nem sikerül, a sor pirosan jelzi –
//    a ceruzával kézzel javítható
//  - lent: egy hirdetés / lista linkjének egyszeri beolvasása, és a
//    beállítások (közvetlen oldalak, fő oldal sorrendje)
//
//  Szerver: /api/admin/forraslista (services/forrasLista.js), /api/admin/forrasok
// ============================================================

AdminManager.TABS.forrasok = {
    group: "listings", jog: "beolvasas", icon: "fa-solid fa-diagram-project",
    title: "fsTab", desc: "fsTabDesc2", render: () => AdminManager.renderForrasok()
};

AdminManager.FORRAS_NEV = {
    storia: "Storia", olx: "OLX", imobiliare: "Imobiliare.ro", publi24: "Publi24", homezz: "Homezz",
    lajumate: "LaJumate", anuntul: "Anuntul.ro", romimo: "Romimo", imoradar24: "Imoradar24",
    egyeb: "fsOwnLink", sajat: "fsOwn"
};

AdminManager.forrasNev = k => {
    const n = AdminManager.FORRAS_NEV[k] || k;
    return /^fs[A-Z]/.test(n) ? I18n.t(n) : n;
};

AdminManager.forrasCsoportNev = (tipus, ugylet) =>
    `${Types.label(tipus)} – ${I18n.t(ugylet === "kiado" ? "fsForRent" : "fsForSale")}`;

AdminManager.renderForrasok = function () {

    const esc = Utils.escape;
    const varos = AdminManager.munkaVaros;

    // Város nélkül: előbb válassz várost (a Források mindig egy városé)
    if (!varos) {
        const sajat = AdminManager.sajatVarosok();
        const lista = (CityManager.varosok || []).filter(v => !v.anyavaros && (!sajat || sajat.includes(v.nev)));
        AdminManager.box().innerHTML = `
            <div class="card"><div class="card-body">
                <h5>${I18n.t("fsPickCity")}</h5>
                <p class="text-body-secondary small">${I18n.t("fsPickCityHelp")}</p>
                <div class="d-flex flex-wrap gap-2">
                    ${lista.map(v => `<button type="button" class="btn btn-outline-primary" data-fs-varos="${esc(v.nev)}"><i class="fa-solid fa-city" aria-hidden="true"></i> ${esc(CityManager.displayName(v.nev))}</button>`).join("")}
                </div>
                ${AuthManager.isAdmin() ? `<hr><button type="button" class="btn btn-primary" id="fsMindVaros"><i class="fa-solid fa-forward" aria-hidden="true"></i> ${I18n.t("fsRunAllCities")}</button>
                <div id="fsStatus" class="mt-3" aria-live="polite"></div>` : ""}
            </div></div>`;
        AdminManager.box().querySelectorAll("[data-fs-varos]").forEach(b => b.onclick = () => {
            AdminManager.munkaVarosBeallit(b.dataset.fsVaros);
            AdminManager.open("forrasok");
        });
        const m = document.getElementById("fsMindVaros");
        if (m) m.onclick = () => AdminManager.forrasFuttat({ mind: true });
        return;
    }

    AdminManager.loading();

    fetch("/api/admin/forraslista?varos=" + encodeURIComponent(varos), { cache: "no-store" })
        .then(r => r.ok ? r.json() : Promise.reject(r))
        .then(d => {
            AdminManager.forrasAdat = d;
            AdminManager.forrasRajz();
            if (d.futo) AdminManager.forrasFigyel(d.futo);
        })
        .catch(() => { AdminManager.box().innerHTML = `<div class="alert alert-danger">${I18n.t("importResError")}</div>`; });

};

AdminManager.FORRAS_ALLAPOT = {
    ok: { cls: "text-bg-success", icon: "fa-check" },
    letiltva: { cls: "text-bg-secondary", icon: "fa-ban" },
    link_hiba: { cls: "text-bg-danger", icon: "fa-link-slash" },
    hiba: { cls: "text-bg-warning", icon: "fa-triangle-exclamation" },
    kikapcsolva: { cls: "text-bg-light", icon: "fa-power-off" }
};

AdminManager.forrasRajz = function () {

    const esc = Utils.escape;
    const d = AdminManager.forrasAdat;
    const box = AdminManager.box();
    const mod = !!d.modosithat;

    const sorHtml = s => {
        const a = AdminManager.FORRAS_ALLAPOT[s.allapot] || null;
        const rovid = String(s.url || "").replace(/^https?:\/\/(www\.)?/, "");
        return `
            <tr class="${s.aktiv === false ? "fsKi" : ""} ${s.allapot === "link_hiba" ? "fsLinkHiba" : ""}" data-sor="${s.id}">
                <td class="text-nowrap">
                    <span class="fsForras f-${esc(s.forras || "egyeb")}">${esc(AdminManager.forrasNev(s.forras || "egyeb"))}</span>
                    ${s.forras === "olx" || s.forras === "storia" ? `<small class="d-block text-body-secondary">${I18n.t("fsDirectShort")}</small>` : ""}
                    ${s.kerulet ? `<small class="d-block text-body-secondary"><i class="fa-solid fa-map-pin" aria-hidden="true"></i> ${esc(s.kerulet)}</small>` : ""}
                </td>
                <td class="fsLink">
                    <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.url)}">${esc(s.nev || rovid)}</a>
                    ${s.uzenet ? `<small class="d-block ${s.allapot === "link_hiba" ? "text-danger" : "text-body-secondary"}">${esc(s.uzenet)}</small>` : ""}
                    ${s.regi_url ? `<small class="d-block text-body-secondary">${I18n.t("fsOldLink")}: ${esc(String(s.regi_url).replace(/^https?:\/\/(www\.)?/, "").slice(0, 70))}</small>` : ""}
                </td>
                <td class="text-nowrap small">
                    ${a ? `<span class="badge ${a.cls}"><i class="fa-solid ${a.icon}" aria-hidden="true"></i> ${esc(I18n.t("fsSt_" + s.allapot))}</span>` : `<span class="text-body-secondary">${I18n.t("ovNever")}</span>`}
                    ${s.utolso_futas ? `<div class="text-body-secondary">${esc(Utils.ago(s.utolso_futas))}${s.utolso_db !== null && s.utolso_db !== undefined ? ` · ${s.utolso_db} ${I18n.t("pcsWord")}` : ""}</div>` : ""}
                    ${s.utolso_eredmeny ? `<div class="text-body-secondary">${esc(s.utolso_eredmeny)}</div>` : ""}
                </td>
                <td class="text-end text-nowrap">
                    <button type="button" class="btn btn-sm btn-outline-primary" data-fs-run="${s.id}" title="${esc(I18n.t("fsRunRow"))}" aria-label="${esc(I18n.t("fsRunRow"))}" ${s.aktiv === false ? "disabled" : ""}><i class="fa-solid fa-play" aria-hidden="true"></i></button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-fs-edit="${s.id}" title="${esc(I18n.t("fsEditLink"))}" aria-label="${esc(I18n.t("fsEditLink"))}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
                    ${s.auto ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-fs-reset="${s.id}" title="${esc(I18n.t("fsResetLink"))}" aria-label="${esc(I18n.t("fsResetLink"))}"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>` : ""}
                    <button type="button" class="btn btn-sm ${s.aktiv === false ? "btn-outline-success" : "btn-outline-secondary"}" data-fs-toggle="${s.id}" title="${esc(I18n.t(s.aktiv === false ? "fsTurnOn" : "fsTurnOff"))}" aria-label="${esc(I18n.t(s.aktiv === false ? "fsTurnOn" : "fsTurnOff"))}"><i class="fa-solid fa-power-off" aria-hidden="true"></i></button>
                    ${!s.auto ? `<button type="button" class="btn btn-sm btn-outline-danger" data-fs-del="${s.id}" title="${esc(I18n.t("detailDelete"))}" aria-label="${esc(I18n.t("detailDelete"))}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>` : ""}
                </td>
            </tr>`;
    };

    const csoportHtml = c => {
        const sorok = d.sorok.filter(s => s.tipus === c.tipus && s.ugylet === c.ugylet);
        const hibas = sorok.filter(s => s.allapot === "link_hiba").length;
        const kulcs = `${c.tipus}|${c.ugylet}`;
        return `
            <div class="card mb-3 fsCsoport" data-csoport="${kulcs}">
                <div class="card-header d-flex flex-wrap align-items-center gap-2">
                    <h6 class="mb-0 flex-fill">${esc(AdminManager.forrasCsoportNev(c.tipus, c.ugylet))}
                        ${hibas ? `<span class="badge text-bg-danger ms-1">${I18n.f("fsBrokenN", { n: hibas })}</span>` : ""}</h6>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-fs-csoport="${kulcs}"><i class="fa-solid fa-play" aria-hidden="true"></i> ${I18n.t("fsRunGroup")}</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-fs-uj="${kulcs}"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("fsAddLink")}</button>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm align-middle mb-0 fsTabla">
                        <tbody>${sorok.map(sorHtml).join("")}</tbody>
                    </table>
                </div>
                <div class="card-body border-top fsUjSor" data-uj-panel="${kulcs}" hidden>
                    <div class="row g-2 align-items-end">
                        <div class="col-md-6"><label class="form-label small mb-1">${I18n.t("fsLinkLabel")}</label>
                            <input type="url" class="form-control form-control-sm" data-uj-url placeholder="https://www.imoradar24.ro/…, https://www.publi24.ro/…"></div>
                        <div class="col-md-3"><label class="form-label small mb-1">${I18n.t("fsDistrictOpt")}</label>
                            <input type="text" class="form-control form-control-sm" data-uj-kerulet list="fsKeruletek"></div>
                        <div class="col-md-3"><button type="button" class="btn btn-sm btn-primary w-100" data-uj-ment="${kulcs}"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("fsAdd")}</button></div>
                    </div>
                    <div class="form-text">${I18n.t("fsAddHelp")}</div>
                </div>
            </div>`;
    };

    const hibasOssz = d.sorok.filter(s => s.allapot === "link_hiba").length;

    box.innerHTML = `
        <div class="card mb-3">
            <div class="card-body d-flex flex-wrap align-items-center gap-2">
                <div class="flex-fill">
                    <h5 class="mb-0"><i class="fa-solid fa-city" aria-hidden="true"></i> ${esc(CityManager.displayName(d.varos))}</h5>
                    <small class="text-body-secondary">${I18n.t("fsCityHelp")}</small>
                </div>
                <button type="button" class="btn btn-primary" id="fsVarosFut"><i class="fa-solid fa-play" aria-hidden="true"></i> ${I18n.f("fsRunCity", { v: esc(CityManager.displayName(d.varos)) })}</button>
                ${mod ? `<button type="button" class="btn btn-outline-primary" id="fsMindFut"><i class="fa-solid fa-forward" aria-hidden="true"></i> ${I18n.t("fsRunAllCities")}</button>` : ""}
            </div>
            ${hibasOssz ? `<div class="alert alert-danger mx-3 small"><i class="fa-solid fa-link-slash" aria-hidden="true"></i> ${I18n.f("fsBrokenAll", { n: hibasOssz })}</div>` : ""}
            <div id="fsStatus" class="px-3 pb-3" aria-live="polite"></div>
        </div>

        <datalist id="fsKeruletek"></datalist>
        <div id="fsCsoportok">${d.csoportok.map(csoportHtml).join("")}</div>

        <details class="card mb-3 fsReszlet">
            <summary class="card-header"><i class="fa-solid fa-link" aria-hidden="true"></i> ${I18n.t("fsOneOffTitle")}</summary>
            <div class="card-body">
                <p class="small text-body-secondary">${I18n.t("fsOneOffHelp")}</p>
                <textarea class="form-control mb-2" id="fsEgyLink" rows="3" placeholder="https://…"></textarea>
                <div class="row g-2 align-items-end">
                    <div class="col-md-3"><label class="form-label small mb-1" for="fsEgyTipus">${I18n.t("newTipus")}</label>
                        <select class="form-select form-select-sm" id="fsEgyTipus">${Types.LIST.map(x => `<option value="${x.key}">${esc(I18n.t(x.label))}</option>`).join("")}</select></div>
                    <div class="col-md-3"><label class="form-label small mb-1" for="fsEgyUgylet">${I18n.t("fsDeal")}</label>
                        <select class="form-select form-select-sm" id="fsEgyUgylet"><option value="elado">${I18n.t("fsForSale")}</option><option value="kiado">${I18n.t("fsForRent")}</option></select></div>
                    <div class="col-md-3"><label class="form-label small mb-1" for="fsEgyKerulet">${I18n.t("fsDistrictOpt")}</label>
                        <input type="text" class="form-control form-control-sm" id="fsEgyKerulet" list="fsKeruletek"></div>
                    <div class="col-md-3"><button type="button" class="btn btn-sm btn-primary w-100" id="fsEgyIndit"><i class="fa-solid fa-download" aria-hidden="true"></i> ${I18n.t("fsOneOffRun")}</button></div>
                </div>
            </div>
        </details>

        <details class="card mb-3 fsReszlet" id="fsBeallitasok">
            <summary class="card-header"><i class="fa-solid fa-sliders" aria-hidden="true"></i> ${I18n.t("fsSettingsTitle")}</summary>
            <div class="card-body" id="fsBeallBody"><div class="spinner-border spinner-border-sm text-primary"></div></div>
        </details>`;

    const $ = q => box.querySelector(q);
    const sor = id => d.sorok.find(s => s.id === Number(id));
    const ujra = () => fetch("/api/admin/forraslista?varos=" + encodeURIComponent(d.varos), { cache: "no-store" })
        .then(r => r.json()).then(v => { AdminManager.forrasAdat = { ...v }; const st = $("#fsStatus").innerHTML; AdminManager.forrasRajz(); $("#fsStatus").innerHTML = st; });
    const kuld = (url, method, body) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
        .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)));
    AdminManager.forrasUjra = ujra;

    // a város kerületei a saját linkekhez
    fetch("/api/keruletek?varos=" + encodeURIComponent(d.varos)).then(r => r.ok ? r.json() : []).then(l => {
        const dl = document.getElementById("fsKeruletek");
        if (dl && Array.isArray(l)) dl.innerHTML = l.map(k => `<option value="${esc(k.nev || k)}">`).join("");
    }).catch(() => { });

    $("#fsVarosFut").onclick = () => AdminManager.forrasFuttat({ varos: d.varos });
    const mf = $("#fsMindFut");
    if (mf) mf.onclick = () => { if (confirm(I18n.t("fsRunAllConfirm"))) AdminManager.forrasFuttat({ mind: true }); };

    box.querySelectorAll("[data-fs-run]").forEach(b => b.onclick = () => AdminManager.forrasFuttat({ ids: [Number(b.dataset.fsRun)] }));
    box.querySelectorAll("[data-fs-csoport]").forEach(b => b.onclick = () => {
        const [tipus, ugylet] = b.dataset.fsCsoport.split("|");
        AdminManager.forrasFuttat({ varos: d.varos, tipus, ugylet });
    });
    box.querySelectorAll("[data-fs-edit]").forEach(b => b.onclick = () => {
        const s = sor(b.dataset.fsEdit);
        const uj = prompt(I18n.t("fsEditPrompt"), s.url);
        if (!uj || uj.trim() === s.url) return;
        kuld("/api/admin/forraslista/" + s.id, "PUT", { url: uj.trim() }).then(ujra).catch(e => alert(I18n.t(e && e.error === "bad_url" ? "fsBadUrl" : "importResError")));
    });
    box.querySelectorAll("[data-fs-reset]").forEach(b => b.onclick = () => {
        if (!confirm(I18n.t("fsResetConfirm"))) return;
        kuld("/api/admin/forraslista/" + b.dataset.fsReset + "/alap", "POST").then(ujra).catch(() => alert(I18n.t("importResError")));
    });
    box.querySelectorAll("[data-fs-toggle]").forEach(b => b.onclick = () => {
        const s = sor(b.dataset.fsToggle);
        kuld("/api/admin/forraslista/" + s.id, "PUT", { aktiv: s.aktiv === false }).then(ujra).catch(() => alert(I18n.t("importResError")));
    });
    box.querySelectorAll("[data-fs-del]").forEach(b => b.onclick = () => {
        if (!confirm(I18n.t("fsDeleteConfirm"))) return;
        kuld("/api/admin/forraslista/" + b.dataset.fsDel, "DELETE").then(ujra).catch(() => alert(I18n.t("importResError")));
    });
    box.querySelectorAll("[data-fs-uj]").forEach(b => b.onclick = () => {
        const p = box.querySelector(`[data-uj-panel="${b.dataset.fsUj}"]`);
        p.hidden = !p.hidden;
        if (!p.hidden) p.querySelector("[data-uj-url]").focus();
    });
    box.querySelectorAll("[data-uj-ment]").forEach(b => b.onclick = () => {
        const [tipus, ugylet] = b.dataset.ujMent.split("|");
        const p = box.querySelector(`[data-uj-panel="${b.dataset.ujMent}"]`);
        const url = p.querySelector("[data-uj-url]").value.trim();
        if (!/^https?:\/\//i.test(url)) return alert(I18n.t("fsBadUrl"));
        kuld("/api/admin/forraslista", "POST", { varos: d.varos, tipus, ugylet, url, kerulet: p.querySelector("[data-uj-kerulet]").value.trim() })
            .then(ujra).catch(() => alert(I18n.t("importResError")));
    });

    // Egy link egyszeri beolvasása (a régi „Beolvasás”)
    $("#fsEgyIndit").onclick = () => {
        const urls = $("#fsEgyLink").value.trim();
        if (!urls) return;
        kuld("/api/admin/import", "POST", { urls, varos: d.varos, tipus: $("#fsEgyTipus").value, ugylet: $("#fsEgyUgylet").value, kerulet: $("#fsEgyKerulet").value.trim() })
            .then(v => AdminManager.pollJob(v.jobId, "fsStatus"))
            .catch(e => alert(I18n.t(e && e.error === "no_urls" ? "fsBadUrl" : "importResError")));
    };

    // Beállítások (közvetlen oldalak, fő oldal sorrendje) – csak megnyitáskor töltjük
    $("#fsBeallitasok").addEventListener("toggle", function () {
        if (this.open && !this.dataset.kesz) { this.dataset.kesz = "1"; AdminManager.forrasBeallitas(document.getElementById("fsBeallBody")); }
    });

};

// Futtatás indítása és a napló követése; a végén a sorok frissülnek
AdminManager.forrasFuttat = function (body) {
    const st = document.getElementById("fsStatus");
    fetch("/api/admin/forraslista/futtat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
        .then(v => AdminManager.forrasFigyel(v.jobId))
        .catch(e => { if (st) st.innerHTML = `<div class="alert alert-danger small">${Utils.escape(I18n.t(e && e.error === "admin_only" ? "fsOnlyAdmin" : "importResError"))}</div>`; });
};

AdminManager.forrasFigyel = function (jobId) {
    AdminManager.pollJob(jobId, "fsStatus");
    clearInterval(AdminManager.forrasTimer);
    let utolso = 0;
    AdminManager.forrasTimer = setInterval(() => {
        if (AdminManager.tab !== "forrasok") { clearInterval(AdminManager.forrasTimer); return; }
        fetch("/api/admin/import/" + jobId).then(r => r.json()).then(j => {
            // egy-egy sor elkészült: a táblázat is frissül
            const n = (j.sorok || []).length;
            if ((n !== utolso || j.allapot === "kesz" || j.allapot === "hiba") && AdminManager.forrasUjra) { utolso = n; AdminManager.forrasUjra(); }
            if (j.allapot === "kesz" || j.allapot === "hiba") clearInterval(AdminManager.forrasTimer);
        }).catch(() => { });
    }, 4000);
};

// ---------- Beállítások: közvetlen oldalak, fő oldal sorrendje ----------

AdminManager.forrasBeallitas = function (el) {

    fetch("/api/admin/forrasok").then(r => r.ok ? r.json() : Promise.reject(r)).then(d => {

        const esc = Utils.escape;
        const mod = !!d.modosithat;
        let sorrend = [...d.beallitas.sorrend];

        const sorrendHtml = () => sorrend.map((k, i) => `
            <li class="fsSor ${k === "imoradar24" ? "fsKozvetito" : ""}">
                <span class="fsHely">${i + 1}.</span>
                <b class="flex-fill">${esc(AdminManager.forrasNev(k))}</b>
                ${k === "imoradar24" ? `<small class="text-body-secondary">${I18n.t("fsLastAlways")}</small>` : mod ? `
                <button type="button" class="btn btn-sm btn-outline-secondary" data-fel="${i}" ${i === 0 ? "disabled" : ""} aria-label="${esc(I18n.t("fsUp"))}"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
                <button type="button" class="btn btn-sm btn-outline-secondary" data-le="${i}" ${i >= sorrend.length - 2 ? "disabled" : ""} aria-label="${esc(I18n.t("fsDown"))}"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>` : ""}
            </li>`).join("");

        el.innerHTML = `
            <div class="row g-4">
                <div class="col-lg-6">
                    <h6>${I18n.t("fsDirectTitle")}</h6>
                    <p class="small text-body-secondary">${I18n.t("fsDirectHelp")}</p>
                    ${d.kozvetlenLehet.map(k => `
                        <div class="form-check form-switch mb-2">
                            <input class="form-check-input" type="checkbox" role="switch" id="fsK_${k}" data-kozvetlen="${k}" ${d.beallitas.kozvetlen.includes(k) ? "checked" : ""} ${mod ? "" : "disabled"}>
                            <label class="form-check-label" for="fsK_${k}"><b>${esc(AdminManager.forrasNev(k))}</b> – ${I18n.t("fsDirect_" + k)}</label>
                        </div>`).join("")}
                    <div class="alert alert-light small mb-0 mt-3"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t("fsViaImoradar2")}</div>
                </div>
                <div class="col-lg-6">
                    <h6>${I18n.t("fsMainTitle")}</h6>
                    <p class="small text-body-secondary">${I18n.t("fsMainHelp")}</p>
                    <ol class="fsSorrend list-unstyled mb-3" id="fsSorrend">${sorrendHtml()}</ol>
                    ${mod ? `<button type="button" class="btn btn-primary" id="fsMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("fsSave")}</button>
                    <span class="small ms-2" id="fsMentEredmeny" aria-live="polite"></span>` : `<p class="small text-body-secondary mb-0">${I18n.t("fsOnlyAdmin")}</p>`}
                </div>
            </div>`;

        const $ = q => el.querySelector(q);
        const bekot = () => {
            el.querySelectorAll("[data-fel]").forEach(b => b.onclick = () => {
                const i = Number(b.dataset.fel);
                [sorrend[i - 1], sorrend[i]] = [sorrend[i], sorrend[i - 1]];
                $("#fsSorrend").innerHTML = sorrendHtml(); bekot();
            });
            el.querySelectorAll("[data-le]").forEach(b => b.onclick = () => {
                const i = Number(b.dataset.le);
                [sorrend[i + 1], sorrend[i]] = [sorrend[i], sorrend[i + 1]];
                $("#fsSorrend").innerHTML = sorrendHtml(); bekot();
            });
        };
        bekot();

        const ment = $("#fsMent");
        if (ment) ment.onclick = () => {
            ment.disabled = true;
            const kozvetlen = [...el.querySelectorAll("[data-kozvetlen]:checked")].map(c => c.dataset.kozvetlen);
            fetch("/api/admin/forrasok", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sorrend, kozvetlen }) })
                .then(r => r.ok ? r.json() : Promise.reject(r))
                .then(v => { ment.disabled = false; $("#fsMentEredmeny").textContent = I18n.f("fsSaved", { n: v.atirt || 0 }); })
                .catch(() => { ment.disabled = false; $("#fsMentEredmeny").textContent = I18n.t("importResError"); });
        };

    }).catch(() => { el.innerHTML = `<div class="alert alert-danger small">${I18n.t("importResError")}</div>`; });

};
