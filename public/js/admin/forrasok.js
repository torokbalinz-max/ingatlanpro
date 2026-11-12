// ============================================================
//  Admin → Hirdetések → Források (#admin/forrasok)
//
//  - Közvetlen beolvasás: az OLX és a Storia hirdetéseit a saját oldalukról
//    olvassuk (nem az Imoradar24-ről) – így minden ilyen hirdetés egyből a
//    pontos hirdetésre visz. Az imobiliare.ro és a többi oldal hirdetései az
//    Imoradar24-ről jönnek (az imobiliare.ro-s a pontos imobiliare linkkel,
//    a többi kattintásra az Imoradar24 adatlapjára visz).
//  - Fő oldal: ha egy ingatlan több oldalon is fent van, nálunk egyszer
//    látszik; kattintásra a sorrendben elöl lévő oldal nyílik meg.
//  - Városonként: honnan vannak a hirdetések, mikor sikerült utoljára a
//    közvetlen beolvasás, és indítható most (új + frissítés + a levettek le).
//
//  Szerver: /api/admin/forrasok, /api/admin/kozvetlen (server/routes/admin.js)
// ============================================================

AdminManager.TABS.forrasok = {
    group: "listings", jog: "beolvasas", icon: "fa-solid fa-diagram-project",
    title: "fsTab", desc: "fsTabDesc", render: () => AdminManager.renderForrasok()
};

AdminManager.FORRAS_NEV = {
    storia: "Storia", olx: "OLX", imobiliare: "Imobiliare.ro", publi24: "Publi24", homezz: "Homezz",
    lajumate: "LaJumate", anuntul: "Anuntul.ro", romimo: "Romimo", imoradar24: "Imoradar24",
    egyeb: "fsOther", sajat: "fsOwn"
};

AdminManager.forrasNev = k => {
    const n = AdminManager.FORRAS_NEV[k] || k;
    return /^fs[A-Z]/.test(n) ? I18n.t(n) : n;
};

AdminManager.renderForrasok = function () {

    AdminManager.loading();

    fetch("/api/admin/forrasok").then(r => r.ok ? r.json() : Promise.reject(r)).then(d => {

        const esc = Utils.escape;
        const box = AdminManager.box();
        let sorrend = [...d.beallitas.sorrend];
        const mod = !!d.modosithat;

        // Városonként: forrás -> db
        const varosok = {};
        (d.varosonkent || []).forEach(r => {
            const v = varosok[r.varos] = varosok[r.varos] || { ossz: 0, tobb: 0, f: {} };
            v.f[r.forras] = (v.f[r.forras] || 0) + r.db;
            v.ossz += r.db;
            v.tobb += r.tobb_oldalon || 0;
        });
        const oszlopok = ["olx", "storia", "imobiliare", "publi24", "imoradar24", "egyeb", "sajat"]
            .filter(k => Object.values(varosok).some(v => v.f[k]));

        const ido = (f, v) => {
            const t = d.kesz[`${f}|${v}`];
            if (!t) return `<span class="text-body-secondary">${I18n.t("ovNever")}</span>`;
            const friss = Date.now() - new Date(t).getTime() < d.frissOra * 3600 * 1000;
            return `<span class="${friss ? "text-success" : "text-warning"}" title="${esc(new Date(t).toLocaleString())}">${esc(Utils.ago(t))}</span>`;
        };

        const varosLista = Object.keys(varosok)
            .filter(v => !d.csakVarosok || d.csakVarosok.includes(v))
            .sort((a, b) => varosok[b].ossz - varosok[a].ossz);
        // a választható városok (akkor is, ha még nincs hirdetése)
        const valaszthato = (CityManager.varosok || []).filter(v => !v.anyavaros && (!d.csakVarosok || d.csakVarosok.includes(v.nev))).map(v => v.nev);

        const sorrendHtml = () => sorrend.map((k, i) => `
            <li class="fsSor ${k === "imoradar24" ? "fsKozvetito" : ""}">
                <span class="fsHely">${i + 1}.</span>
                <b class="flex-fill">${esc(AdminManager.forrasNev(k))}</b>
                ${k === "imoradar24" ? `<small class="text-body-secondary">${I18n.t("fsLastAlways")}</small>` : mod ? `
                <button type="button" class="btn btn-sm btn-outline-secondary" data-fel="${i}" ${i === 0 ? "disabled" : ""} aria-label="${esc(I18n.t("fsUp"))}"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
                <button type="button" class="btn btn-sm btn-outline-secondary" data-le="${i}" ${i >= sorrend.length - 2 ? "disabled" : ""} aria-label="${esc(I18n.t("fsDown"))}"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>` : ""}
            </li>`).join("");

        box.innerHTML = `
            <div class="row g-4 mb-4">
                <div class="col-lg-6">
                    <div class="card h-100">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-plug" aria-hidden="true"></i> ${I18n.t("fsDirectTitle")}</h5></div>
                        <div class="card-body">
                            <p class="small text-body-secondary">${I18n.t("fsDirectHelp")}</p>
                            ${d.kozvetlenLehet.map(k => `
                                <div class="form-check form-switch mb-2">
                                    <input class="form-check-input" type="checkbox" role="switch" id="fsK_${k}" data-kozvetlen="${k}" ${d.beallitas.kozvetlen.includes(k) ? "checked" : ""} ${mod ? "" : "disabled"}>
                                    <label class="form-check-label" for="fsK_${k}"><b>${esc(AdminManager.forrasNev(k))}</b> – ${I18n.t("fsDirect_" + k)}</label>
                                </div>`).join("")}
                            <div class="alert alert-light small mb-0 mt-3"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t("fsViaImoradar")}</div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="card h-100">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-ranking-star" aria-hidden="true"></i> ${I18n.t("fsMainTitle")}</h5></div>
                        <div class="card-body">
                            <p class="small text-body-secondary">${I18n.t("fsMainHelp")}</p>
                            <ol class="fsSorrend list-unstyled mb-3" id="fsSorrend">${sorrendHtml()}</ol>
                            ${mod ? `<button type="button" class="btn btn-primary" id="fsMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("fsSave")}</button>
                            <span class="small ms-2" id="fsMentEredmeny" aria-live="polite"></span>` : `<p class="small text-body-secondary mb-0">${I18n.t("fsOnlyAdmin")}</p>`}
                        </div>
                    </div>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <h5 class="mb-0"><i class="fa-solid fa-city" aria-hidden="true"></i> ${I18n.t("fsCitiesTitle")}</h5>
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                        <select class="form-select form-select-sm" id="fsVaros" style="width:auto" aria-label="${esc(I18n.t("mtCityLabel"))}">
                            ${valaszthato.sort((a, b) => CityManager.displayName(a).localeCompare(CityManager.displayName(b), "hu"))
                                .map(n => `<option value="${esc(n)}" ${n === (AdminManager.munkaVaros || DataManager.currentCity) ? "selected" : ""}>${esc(CityManager.displayName(n))}</option>`).join("")}
                        </select>
                        <button type="button" class="btn btn-sm btn-primary" id="fsIndit"><i class="fa-solid fa-download" aria-hidden="true"></i> ${I18n.t("fsRun")}</button>
                        <button type="button" class="btn btn-sm btn-outline-primary" id="fsEllenoriz"><i class="fa-solid fa-satellite-dish" aria-hidden="true"></i> ${I18n.t("fsCheckOnly")}</button>
                    </div>
                </div>
                <div class="card-body">
                    <p class="small text-body-secondary">${I18n.t("fsCitiesHelp")}</p>
                    <div id="fsStatus" class="mb-3" aria-live="polite"></div>
                    ${varosLista.length ? `
                    <div class="table-responsive">
                        <table class="table table-sm statTable align-middle mb-0">
                            <thead><tr>
                                <th>${I18n.t("detailVaros")}</th>
                                ${oszlopok.map(k => `<th class="text-end">${esc(AdminManager.forrasNev(k))}</th>`).join("")}
                                <th class="text-end">${I18n.t("fsMulti")}</th>
                                ${d.kozvetlenLehet.map(k => `<th>${I18n.f("fsLastDirect", { f: AdminManager.forrasNev(k) })}</th>`).join("")}
                            </tr></thead>
                            <tbody>
                                ${varosLista.map(v => `
                                <tr>
                                    <td><b>${esc(CityManager.displayName(v))}</b> <small class="text-body-secondary">(${varosok[v].ossz})</small></td>
                                    ${oszlopok.map(k => `<td class="text-end ${k === "imoradar24" && varosok[v].f[k] ? "text-warning" : ""}">${varosok[v].f[k] || "–"}</td>`).join("")}
                                    <td class="text-end">${varosok[v].tobb || "–"}</td>
                                    ${d.kozvetlenLehet.map(k => `<td class="small">${ido(k, v)}</td>`).join("")}
                                </tr>`).join("")}
                            </tbody>
                        </table>
                    </div>
                    <p class="small text-body-secondary mt-2 mb-0">${I18n.t("fsImoradarNote")}</p>` : `<p class="text-body-secondary mb-0">${I18n.t("fsNoListings")}</p>`}
                </div>
            </div>`;

        const $ = q => box.querySelector(q);

        const bekot = () => {
            box.querySelectorAll("[data-fel]").forEach(b => b.onclick = () => {
                const i = Number(b.dataset.fel);
                [sorrend[i - 1], sorrend[i]] = [sorrend[i], sorrend[i - 1]];
                $("#fsSorrend").innerHTML = sorrendHtml(); bekot();
            });
            box.querySelectorAll("[data-le]").forEach(b => b.onclick = () => {
                const i = Number(b.dataset.le);
                [sorrend[i + 1], sorrend[i]] = [sorrend[i], sorrend[i + 1]];
                $("#fsSorrend").innerHTML = sorrendHtml(); bekot();
            });
        };
        bekot();

        const ment = $("#fsMent");
        if (ment) ment.onclick = () => {
            ment.disabled = true;
            const kozvetlen = [...box.querySelectorAll("[data-kozvetlen]:checked")].map(c => c.dataset.kozvetlen);
            fetch("/api/admin/forrasok", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sorrend, kozvetlen }) })
                .then(r => r.ok ? r.json() : Promise.reject(r))
                .then(v => { ment.disabled = false; $("#fsMentEredmeny").textContent = I18n.f("fsSaved", { n: v.atirt || 0 }); })
                .catch(() => { ment.disabled = false; $("#fsMentEredmeny").textContent = I18n.t("importResError"); });
        };

        const indit = csakMeglevo => {
            const varos = $("#fsVaros").value;
            if (!varos) return;
            $("#fsIndit").disabled = $("#fsEllenoriz").disabled = true;
            setTimeout(() => { const a = $("#fsIndit"), b = $("#fsEllenoriz"); if (a) a.disabled = false; if (b) b.disabled = false; }, 5000);
            fetch("/api/admin/kozvetlen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ varos, csakMeglevo }) })
                .then(r => r.ok ? r.json() : Promise.reject(r))
                .then(v => AdminManager.pollJob(v.jobId, "fsStatus"))
                .catch(() => { $("#fsStatus").innerHTML = `<div class="alert alert-danger small">${I18n.t("importResError")}</div>`; });
        };
        $("#fsIndit").onclick = () => indit(false);
        $("#fsEllenoriz").onclick = () => indit(true);

    }).catch(() => {
        AdminManager.box().innerHTML = `<div class="alert alert-danger">${I18n.t("importResError")}</div>`;
    });

};
