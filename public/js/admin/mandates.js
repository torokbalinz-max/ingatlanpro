// ============================================================
//  Admin → Értékesítés: Megbízások (Eladjuk helyetted)
//
//  #admin/megbizasok          a megbízások állapot szerint (oszlopokban)
//  #admin/megbizasok/<id>     egy megbízás értékesítési felülete:
//                             az ingatlan adatai, kért szolgáltatások, a hirdetés,
//                             érdeklődők, megtekintések, vételi ajánlatok
//                             (továbbítás az eladónak), napló, szerződés, díj
//  #admin/megbizasBeall       díjak (sikerdíj %), szolgáltatások (opciók), terület
//
//  A szerver: server/routes/megbizas.js, server/services/megbizas.js
// ============================================================

(() => {

    // Új menücsoport a Partnerek után
    const gi = AdminManager.GROUPS.findIndex(g => g.key === "partners");
    AdminManager.GROUPS.splice(gi + 1, 0, { key: "sales", label: "adminGroupSales", icon: "fa-solid fa-key" });

    const tabok = {};
    for (const [k, v] of Object.entries(AdminManager.TABS)) {
        tabok[k] = v;
        if (k === "reklam") {
            tabok.megbizasok = { group: "sales", icon: "fa-solid fa-key", title: "adminTabMandates", desc: "adminDescMandates", render: () => AdminManager.renderMandates(), count: "mandatesCount", warn: true };
            tabok.megbizasBeall = { group: "sales", icon: "fa-solid fa-sliders", title: "adminTabMandateSettings", desc: "adminDescMandateSettings", render: () => AdminManager.renderMandateSettings() };
        }
    }
    AdminManager.TABS = tabok;
    AdminManager.ALIASES.megbizas = "megbizasok";
    AdminManager.ALIASES.mandates = "megbizasok";

})();

AdminManager.MB_OSZLOPOK = ["uj", "egyeztetes", "szerzodes", "fotozas", "hirdetes", "targyalas"];
AdminManager.MB_LEZART = ["eladva", "lezarva", "elutasitva"];

AdminManager.mbApi = function (ut, opts) {
    return Svc.api("/api/admin/" + ut, opts);
};

// A címsorból: #admin/megbizasok/12 → 12
AdminManager.mbHashId = function () {
    const m = location.hash.match(/^#admin\/megbizasok\/(\d+)/);
    return m ? Number(m[1]) : null;
};

AdminManager.renderMandates = function () {

    const id = AdminManager.mbHashId();
    if (id) return AdminManager.renderMandate(id);

    AdminManager.loading();

    AdminManager.mbApi("megbizasok").then(d => {

        const box = AdminManager.box();
        const esc = Utils.escape;
        const lista = d.lista;

        const kartya = m => `
            <button type="button" class="mbCard" data-mb="${m.id}">
                <span class="d-flex justify-content-between gap-2">
                    <b class="text-truncate">${esc(m.nev || m.fiok_nev || "–")}</b>
                    <small class="text-body-secondary text-nowrap">${esc(m.szerzodes_szam || "")}</small>
                </span>
                <span class="small text-body-secondary text-truncate d-block">${esc(Types.label(m.tipus))} · ${esc([m.cim, m.telepules, m.varos ? CityManager.displayName(m.varos) : ""].filter(Boolean).join(", ") || "–")}</span>
                <span class="mbCardMeta">
                    ${m.kert_ar ? `<span><i class="fa-solid fa-tag" aria-hidden="true"></i> ${esc(Svc.penz(m.kert_ar, m.penznem))}</span>` : ""}
                    ${m.erdeklodok ? `<span title="${esc(I18n.t("mmInterested"))}"><i class="fa-solid fa-users" aria-hidden="true"></i> ${m.erdeklodok}</span>` : ""}
                    ${m.megtekintes_kert ? `<span class="warn" title="${esc(I18n.t("mbViewRequests"))}"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${m.megtekintes_kert}</span>` : ""}
                    ${m.ajanlat_uj ? `<span class="warn" title="${esc(I18n.t("mbNewOffers"))}"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${m.ajanlat_uj}</span>` : ""}
                    ${m.legjobb_ajanlat ? `<span title="${esc(I18n.t("mbBestOffer"))}"><i class="fa-solid fa-trophy" aria-hidden="true"></i> ${esc(Svc.penz(m.legjobb_ajanlat, m.penznem))}</span>` : ""}
                </span>
                ${m.kovetkezo_megtekintes ? `<span class="mbNext"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${esc(Svc.ido(m.kovetkezo_megtekintes))}</span>` : ""}
                <span class="small text-body-secondary">${esc(Utils.ago(m.updated_at))}</span>
            </button>`;

        const aktiv = lista.filter(m => AdminManager.MB_OSZLOPOK.includes(m.statusz));
        const lezart = lista.filter(m => AdminManager.MB_LEZART.includes(m.statusz));
        const eladott = lista.filter(m => m.statusz === "eladva");

        box.innerHTML = `
            <div class="row g-3 mb-4">
                ${AdminManager.finTile("fa-solid fa-inbox", "orange", I18n.t("mbStNew"), Utils.num(lista.filter(m => m.statusz === "uj").length), "")}
                ${AdminManager.finTile("fa-solid fa-key", "green", I18n.t("mbActive"), Utils.num(aktiv.length), "")}
                ${AdminManager.finTile("fa-solid fa-handshake", "blue", I18n.t("mbSold"), Utils.num(eladott.length), eladott.length ? Svc.penz(eladott.reduce((s, m) => s + (Number(m.eladasi_ar) || 0), 0), (eladott[0] || {}).penznem || "EUR") : "")}
                ${AdminManager.finTile("fa-solid fa-sliders", "purple", I18n.t("mbFee"), `${Utils.num(d.beallitas.jutalek, 1)}%`, I18n.f("mbFeeSub", { pk: Utils.num(d.beallitas.jutalek_kizarolagos, 1), min: Svc.penz(d.beallitas.minimum_dij, d.beallitas.penznem) }), "megbizasBeall")}
            </div>

            ${!d.beallitas.aktiv ? `<div class="alert alert-warning small">${I18n.t("mbServiceOff")}</div>` : ""}

            ${lista.length ? `
                <div class="mbBoard">
                    ${AdminManager.MB_OSZLOPOK.map(s => {
                        const t = aktiv.filter(m => m.statusz === s);
                        return `
                            <section class="mbCol">
                                <header><span class="mbDot mb-${s}"></span> ${esc(I18n.t("mbSt_" + s))} <span class="badge text-bg-light">${t.length}</span></header>
                                ${t.map(kartya).join("") || `<p class="small text-body-secondary px-1">–</p>`}
                            </section>`;
                    }).join("")}
                </div>
                ${lezart.length ? `
                    <details class="mt-4">
                        <summary class="h6">${I18n.t("mbClosed")} (${lezart.length})</summary>
                        <div class="mbClosedList">${lezart.map(m => `<div class="mbClosedItem">${kartya(m)}<span class="badge mbBadge mb-${m.statusz}">${esc(I18n.t("mbSt_" + m.statusz))}</span></div>`).join("")}</div>
                    </details>` : ""}` : `
                <div class="emptyState">
                    <i class="fa-solid fa-key"></i>
                    <h5>${I18n.t("mbNone")}</h5>
                    <p>${I18n.t("mbNoneText")}</p>
                    <a class="btn btn-outline-primary" href="#eladjuk" target="_blank">${I18n.t("menuEladjuk")}</a>
                </div>`}`;

        AdminManager.finBindGo(box);
        box.querySelectorAll("[data-mb]").forEach(b => {
            b.onclick = () => { history.pushState(null, "", "#admin/megbizasok/" + b.dataset.mb); AdminManager.renderMandate(Number(b.dataset.mb)); };
        });

    }).catch(() => AdminManager.finHibaDoboz());

};

// ===================== EGY MEGBÍZÁS =====================

AdminManager.renderMandate = function (id) {

    AdminManager.loading();

    Promise.all([AdminManager.mbApi("megbizasok/" + id), AdminManager.mbApi("megbizas-beallitas")]).then(([m, be]) => {

        AdminManager.mbAkt = m;
        const box = AdminManager.box();
        const esc = Utils.escape;
        const dij = m.dij || {};
        const opciok = new Set(m.opciok || []);
        const erdNev = eid => { const e = m.erdeklodok.find(x => x.id === eid); return e ? e.nev : "–"; };

        const sor = (label, v) => v ? `<div class="mbKv"><span>${label}</span><b>${v}</b></div>` : "";

        box.innerHTML = `
            <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                <button type="button" class="btn btn-link px-0" id="mbBack"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${I18n.t("adminTabMandates")}</button>
                <span class="ms-auto small text-body-secondary">${esc(m.szerzodes_szam || "")} · ${esc(Svc.nap(m.created_at))}</span>
            </div>

            <div class="mbHead">
                <div>
                    <h4 class="mb-1">${esc(m.nev || m.fiok_nev || "–")} <span class="badge mbBadge mb-${esc(m.statusz)}">${esc(I18n.t("mbSt_" + m.statusz))}</span></h4>
                    <div class="d-flex flex-wrap gap-2">
                        ${m.telefon ? `<a class="btn btn-sm btn-outline-primary" href="tel:${esc(String(m.telefon).replace(/\s/g, ""))}"><i class="fa-solid fa-phone"></i> ${esc(m.telefon)}</a>` : ""}
                        ${m.email ? `<a class="btn btn-sm btn-outline-secondary" href="mailto:${esc(m.email)}"><i class="fa-regular fa-envelope"></i> ${esc(m.email)}</a>` : ""}
                        ${m.elerhetoseg ? `<span class="small text-body-secondary align-self-center"><i class="fa-regular fa-clock"></i> ${esc(m.elerhetoseg)}</span>` : ""}
                    </div>
                </div>
                <div class="mbStepper" role="group" aria-label="${esc(I18n.t("ordStatus"))}">
                    ${[...AdminManager.MB_OSZLOPOK, "eladva"].map(s => `<button type="button" class="${s === m.statusz ? "active" : ""}" data-mb-st="${s}">${esc(I18n.t("mbSt_" + s))}</button>`).join("")}
                    <select class="form-select form-select-sm" id="mbStMas" aria-label="${esc(I18n.t("ordStatus"))}">
                        <option value="">${I18n.t("mbOtherStatus")}</option>
                        ${["lezarva", "elutasitva"].map(s => `<option value="${s}" ${s === m.statusz ? "selected" : ""}>${esc(I18n.t("mbSt_" + s))}</option>`).join("")}
                    </select>
                </div>
            </div>

            <div class="row g-4">
                <div class="col-xl-7">

                    <div class="card mb-4">
                        <div class="card-header d-flex justify-content-between align-items-center"><h5 class="mb-0"><i class="fa-solid fa-house" aria-hidden="true"></i> ${I18n.t("mbProperty")}</h5></div>
                        <div class="card-body">
                            <div class="row g-2">
                                <div class="col-sm-4"><label class="form-label small mb-1" for="mbUgylet">${I18n.t("searchUgylet")}</label>
                                    <select class="form-select form-select-sm" id="mbUgylet"><option value="elado" ${m.ugylet !== "kiado" ? "selected" : ""}>${I18n.t("ugyletElado")}</option><option value="kiado" ${m.ugylet === "kiado" ? "selected" : ""}>${I18n.t("ugyletKiado")}</option></select></div>
                                <div class="col-sm-4"><label class="form-label small mb-1" for="mbTipus">${I18n.t("newTipus")}</label>
                                    <select class="form-select form-select-sm" id="mbTipus">${Types.LIST.map(t => `<option value="${t.key}" ${t.key === m.tipus ? "selected" : ""}>${esc(I18n.t(t.label))}</option>`).join("")}</select></div>
                                <div class="col-sm-4"><label class="form-label small mb-1" for="mbVaros">${I18n.t("detailVaros")}</label>
                                    <select class="form-select form-select-sm" id="mbVaros"></select></div>
                                <div class="col-sm-8"><label class="form-label small mb-1" for="mbCim">${I18n.t("sfAddress")}</label>
                                    <input class="form-control form-control-sm" id="mbCim" value="${esc(m.cim || "")}"></div>
                                <div class="col-sm-4"><label class="form-label small mb-1" for="mbTelepules">${I18n.t("newTelepules")}</label>
                                    <input class="form-control form-control-sm" id="mbTelepules" value="${esc(m.telepules || "")}"></div>
                                <div class="col-4"><label class="form-label small mb-1" for="mbNm">${I18n.t("detailNm")}</label>
                                    <input class="form-control form-control-sm" id="mbNm" type="number" step="0.1" value="${m.nm ?? ""}"></div>
                                <div class="col-3"><label class="form-label small mb-1" for="mbSzobak">${I18n.t("detailSzoba")}</label>
                                    <input class="form-control form-control-sm" id="mbSzobak" type="number" value="${m.szobak ?? ""}"></div>
                                <div class="col-5"><label class="form-label small mb-1" for="mbKertAr">${I18n.t("sfPrice")}</label>
                                    <input class="form-control form-control-sm" id="mbKertAr" type="number" step="500" value="${m.kert_ar ?? ""}"></div>
                                <div class="col-12"><label class="form-label small mb-1" for="mbLeiras">${I18n.t("sfDesc")}</label>
                                    <textarea class="form-control form-control-sm" id="mbLeiras" rows="3">${esc(m.leiras || "")}</textarea></div>
                            </div>
                            <h6 class="mt-3 mb-2">${I18n.t("mbServices")}</h6>
                            <div class="mbOptList">
                                ${be.opciok.map(o => `
                                    <label class="form-check">
                                        <input class="form-check-input" type="checkbox" value="${esc(o.kod)}" ${opciok.has(o.kod) ? "checked" : ""} data-mb-opc>
                                        <span class="form-check-label small"><i class="${esc(o.ikon)}" aria-hidden="true"></i> ${esc(Svc.t(o.nev))}${o.ar > 0 ? ` <span class="text-body-secondary">(${esc(Svc.penz(o.ar, o.penznem))})</span>` : ""}</span>
                                    </label>`).join("")}
                            </div>
                            <div class="text-end mt-2"><button type="button" class="btn btn-sm btn-primary" id="mbMentAdat"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button></div>
                        </div>
                    </div>

                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-rectangle-list" aria-hidden="true"></i> ${I18n.t("mbListing")}</h5></div>
                        <div class="card-body">
                            ${m.hirdetes ? `
                                <div class="d-flex flex-wrap align-items-center gap-2">
                                    <a href="#listing/${m.hirdetes.id}" class="fw-semibold">#${m.hirdetes.id} · ${esc(m.hirdetes.cim || Types.label(m.hirdetes.tipus))}</a>
                                    <span class="text-body-secondary small">${esc(Utils.price(m.hirdetes))} · ${esc(m.hirdetes.statusz)}</span>
                                    <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" id="mbHirdSzerk"><i class="fa-solid fa-pen"></i> ${I18n.t("detailEdit")}</button>
                                    <button type="button" class="btn btn-sm btn-link text-danger" id="mbHirdLe">${I18n.t("mbUnlink")}</button>
                                </div>` : `
                                <p class="small text-body-secondary">${I18n.t("mbNoListing")}</p>
                                <div class="d-flex flex-wrap gap-2">
                                    <button type="button" class="btn btn-sm btn-primary" id="mbHirdUj"><i class="fa-solid fa-circle-plus"></i> ${I18n.t("mbCreateListing")}</button>
                                    <div class="input-group input-group-sm" style="max-width:240px">
                                        <span class="input-group-text">#</span>
                                        <input class="form-control" id="mbHirdId" type="number" placeholder="${esc(I18n.t("mbListingId"))}">
                                        <button class="btn btn-outline-secondary" type="button" id="mbHirdKapcsol">${I18n.t("mbLink")}</button>
                                    </div>
                                </div>`}
                        </div>
                    </div>

                    <div class="card mb-4">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0"><i class="fa-solid fa-users" aria-hidden="true"></i> ${I18n.t("mmInterested")} <span class="badge text-bg-light">${m.erdeklodok.length}</span></h5>
                            <button type="button" class="btn btn-sm btn-outline-primary" data-mb-uj="erdeklodok"><i class="fa-solid fa-plus"></i> ${I18n.t("mbAdd")}</button>
                        </div>
                        <div class="card-body">
                            ${m.erdeklodok.length ? `<div class="table-responsive"><table class="table table-sm align-middle mb-0">
                                <thead><tr><th>${I18n.t("authName")}</th><th>${I18n.t("mbContactCol")}</th><th>${I18n.t("lmBudget")}</th><th>${I18n.t("ordStatus")}</th><th></th></tr></thead>
                                <tbody>${m.erdeklodok.map(e => `
                                    <tr>
                                        <td><b>${esc(e.nev)}</b>${e.megjegyzes ? `<div class="small text-body-secondary mbClamp">${esc(e.megjegyzes)}</div>` : ""}</td>
                                        <td class="small">${e.telefon ? `<a href="tel:${esc(String(e.telefon).replace(/\s/g, ""))}">${esc(e.telefon)}</a><br>` : ""}${e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : ""}</td>
                                        <td class="small text-nowrap">${e.koltsegkeret ? esc(Svc.penz(e.koltsegkeret, m.penznem)) : "–"}${e.finanszirozas ? `<div class="text-body-secondary">${esc(I18n.t("lmFin_" + e.finanszirozas))}</div>` : ""}</td>
                                        <td><span class="badge text-bg-light">${esc(I18n.t("mbEr_" + e.statusz))}</span></td>
                                        <td class="text-end text-nowrap"><button type="button" class="btn btn-sm btn-link p-0" data-mb-szerk="erdeklodok:${e.id}">${I18n.t("detailEdit")}</button></td>
                                    </tr>`).join("")}</tbody></table></div>` : `<p class="small text-body-secondary mb-0">${I18n.t("mbNoInterested")}</p>`}
                            ${m.uzenetek && m.uzenetek.length ? `
                                <h6 class="mt-3 small text-uppercase text-body-secondary">${I18n.t("mbListingMessages")}</h6>
                                ${m.uzenetek.map(u => `
                                    <div class="mbMsg">
                                        <div class="flex-fill"><b>${esc(u.nev || "–")}</b> <span class="small text-body-secondary">${esc(Svc.ido(u.created_at))}</span><div class="small mbClamp">${esc(u.szoveg)}</div></div>
                                        ${u.felveve ? `<span class="badge text-bg-success">${I18n.t("mbAdded")}</span>` : `<button type="button" class="btn btn-sm btn-outline-primary" data-mb-felvesz="${u.felado_id}">${I18n.t("mbAddAsInterested")}</button>`}
                                    </div>`).join("")}
                                <a class="small" href="#fiok/uzenetek">${I18n.t("accTabMessages")} →</a>` : ""}
                        </div>
                    </div>

                    <div class="card mb-4">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${I18n.t("mmViewings")} <span class="badge text-bg-light">${m.megtekintesek.length}</span></h5>
                            <button type="button" class="btn btn-sm btn-outline-primary" data-mb-uj="megtekintesek"><i class="fa-solid fa-plus"></i> ${I18n.t("mbAdd")}</button>
                        </div>
                        <div class="card-body">
                            ${m.megtekintesek.length ? `<ul class="mbTimeline">${m.megtekintesek.map(t => `
                                <li class="${t.statusz}">
                                    <div class="d-flex flex-wrap justify-content-between gap-2">
                                        <span><b>${t.idopont ? esc(Svc.ido(t.idopont)) : `<span class="text-warning">${I18n.t("mbNoTimeYet")}</span>`}</b> · ${esc(t.erdeklodo_nev || "–")}${t.erdeklodo_telefon ? ` · <a href="tel:${esc(String(t.erdeklodo_telefon).replace(/\s/g, ""))}">${esc(t.erdeklodo_telefon)}</a>` : ""}</span>
                                        <span><span class="badge text-bg-light">${esc(I18n.t("mbVw_" + t.statusz))}</span> <button type="button" class="btn btn-sm btn-link p-0" data-mb-szerk="megtekintesek:${t.id}">${I18n.t("detailEdit")}</button></span>
                                    </div>
                                    ${t.javasolt ? `<div class="small text-body-secondary">${I18n.t("lmWhen")}: ${esc(t.javasolt)}</div>` : ""}
                                    ${t.visszajelzes ? `<div class="small">${esc(t.visszajelzes)}</div>` : ""}
                                </li>`).join("")}</ul>` : `<p class="small text-body-secondary mb-0">${I18n.t("mbNoViewings")}</p>`}
                        </div>
                    </div>

                    <div class="card mb-4">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("mmOffers")} <span class="badge text-bg-light">${m.ajanlatok.length}</span></h5>
                            <button type="button" class="btn btn-sm btn-outline-primary" data-mb-uj="ajanlatok"><i class="fa-solid fa-plus"></i> ${I18n.t("mbAdd")}</button>
                        </div>
                        <div class="card-body">
                            ${m.ajanlatok.length ? `<div class="table-responsive"><table class="table table-sm align-middle mb-0">
                                <thead><tr><th>${I18n.t("lmAmount")}</th><th>${I18n.t("ordCustomer")}</th><th>${I18n.t("ordStatus")}</th><th></th></tr></thead>
                                <tbody>${m.ajanlatok.map(a => `
                                    <tr>
                                        <td class="text-nowrap"><b>${esc(Svc.penz(a.osszeg, a.penznem))}</b>${m.kert_ar ? ` <small class="text-body-secondary">(${MyMandates.szazalek(a.osszeg, m.kert_ar)})</small>` : ""}
                                            ${a.ellenajanlat ? `<div class="small">${I18n.t("mmCounter")}: ${esc(Svc.penz(a.ellenajanlat, a.penznem))}</div>` : ""}
                                            <div class="small text-body-secondary">${esc(Svc.nap(a.created_at))}</div></td>
                                        <td class="small">${esc(a.erdeklodo_nev || erdNev(a.erdeklodo_id))}${a.feltetelek ? `<div class="text-body-secondary mbClamp">${esc(a.feltetelek)}</div>` : ""}${a.elado_valasz ? `<div class="mbSeller"><i class="fa-solid fa-user" aria-hidden="true"></i> „${esc(a.elado_valasz)}”</div>` : ""}</td>
                                        <td><span class="badge text-bg-${a.statusz === "elfogadva" ? "success" : a.statusz === "uj" ? "warning" : "light"}">${esc(I18n.t("mbOf_" + a.statusz))}</span></td>
                                        <td class="text-end text-nowrap">
                                            ${a.statusz === "uj" ? `<button type="button" class="btn btn-sm btn-success" data-mb-tovabbit="${a.id}"><i class="fa-solid fa-share"></i> ${I18n.t("mbForward")}</button>` : ""}
                                            <button type="button" class="btn btn-sm btn-link p-0 ms-1" data-mb-szerk="ajanlatok:${a.id}">${I18n.t("detailEdit")}</button>
                                        </td>
                                    </tr>`).join("")}</tbody></table></div>` : `<p class="small text-body-secondary mb-0">${I18n.t("mbNoOffers")}</p>`}
                        </div>
                    </div>

                </div>

                <div class="col-xl-5">

                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-file-signature" aria-hidden="true"></i> ${I18n.t("mbContractFee")}</h5></div>
                        <div class="card-body">
                            <div class="row g-2">
                                <div class="col-6"><label class="form-label small mb-1" for="mbSzDatum">${I18n.t("mbContractDate")}</label>
                                    <input class="form-control form-control-sm" id="mbSzDatum" type="date" value="${esc(m.szerzodes_datum || "")}"></div>
                                <div class="col-6"><label class="form-label small mb-1" for="mbAlairva">${I18n.t("mbSigned")}</label>
                                    <input class="form-control form-control-sm" id="mbAlairva" type="date" value="${esc(m.alairva || "")}"></div>
                                <div class="col-4"><label class="form-label small mb-1" for="mbJut">${I18n.t("mbCommission")} %</label>
                                    <input class="form-control form-control-sm" id="mbJut" type="number" step="0.1" value="${m.jutalek ?? ""}"></div>
                                <div class="col-4"><label class="form-label small mb-1" for="mbFix">${I18n.t("mbFixFee")}</label>
                                    <input class="form-control form-control-sm" id="mbFix" type="number" step="10" value="${m.fix_dij ?? ""}"></div>
                                <div class="col-4"><label class="form-label small mb-1" for="mbPenznem">${I18n.t("finCurrency")}</label>
                                    <select class="form-select form-select-sm" id="mbPenznem"><option ${m.penznem !== "RON" ? "selected" : ""}>EUR</option><option ${m.penznem === "RON" ? "selected" : ""}>RON</option></select></div>
                                <div class="col-6"><label class="form-label small mb-1" for="mbIdo">${I18n.t("mbDuration")}</label>
                                    <input class="form-control form-control-sm" id="mbIdo" type="number" min="1" max="36" value="${m.idotartam_honap ?? 6}"></div>
                                <div class="col-6 d-flex align-items-end"><div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" role="switch" id="mbKizar" ${m.kizarolagos ? "checked" : ""}>
                                    <label class="form-check-label small" for="mbKizar">${I18n.t("mbExclusive")}</label></div></div>
                                <div class="col-6"><label class="form-label small mb-1" for="mbEladAr">${I18n.t("mbSalePrice")}</label>
                                    <input class="form-control form-control-sm" id="mbEladAr" type="number" step="500" value="${m.eladasi_ar ?? ""}"></div>
                                <div class="col-6"><label class="form-label small mb-1" for="mbEladva">${I18n.t("mbSoldOn")}</label>
                                    <input class="form-control form-control-sm" id="mbEladva" type="date" value="${esc(m.eladva || "")}"></div>
                            </div>
                            <div class="mbFeeBox mt-3">
                                ${sor(I18n.t(dij.becsult ? "mbFeeEstimated" : "mbFeeSuccess"), dij.siker ? esc(Svc.penz(dij.siker, dij.penznem)) + ` <small>(${esc(Utils.num(dij.jutalek, 1))}% · ${esc(Svc.penz(dij.alap, dij.penznem))})</small>` : "")}
                                ${sor(I18n.t("mbFixFee"), dij.fix ? esc(Svc.penz(dij.fix, dij.penznem)) : "")}
                                ${(dij.opciok || []).map(o => sor(esc(Svc.t(o.nev)), esc(Svc.penz(o.ar, o.penznem)))).join("")}
                            </div>
                            <div class="d-flex flex-wrap gap-2 mt-3">
                                <button type="button" class="btn btn-sm btn-primary" id="mbMentSz"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button>
                                <a class="btn btn-sm btn-outline-secondary" href="/api/megbizas/${m.id}/szerzodes" target="_blank" rel="noopener"><i class="fa-solid fa-file-signature" aria-hidden="true"></i> ${I18n.t("mbOpenContract")}</a>
                                <button type="button" class="btn btn-sm btn-outline-success" id="mbDijbekero"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${I18n.t("mbMakeProforma")}</button>
                            </div>
                            <p class="small text-body-secondary mt-2 mb-0">${I18n.t("mbContractNote")}</p>
                        </div>
                    </div>

                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> ${I18n.t("mmTimeline")}</h5></div>
                        <div class="card-body">
                            <textarea class="form-control form-control-sm" id="mbNaploSz" rows="2" placeholder="${esc(I18n.t("mbNotePh"))}"></textarea>
                            <div class="d-flex justify-content-between align-items-center mt-2">
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="mbNaploLat">
                                    <label class="form-check-label small" for="mbNaploLat">${I18n.t("mbVisibleToSeller")}</label>
                                </div>
                                <button type="button" class="btn btn-sm btn-outline-primary" id="mbNaploKuld">${I18n.t("mbAddNote")}</button>
                            </div>
                            <ul class="mbLog mt-3">
                                ${m.naplo.map(n => `
                                    <li class="${n.lathato_eladonak ? "visible" : ""}">
                                        <span class="small text-body-secondary">${esc(Svc.ido(n.created_at))}${n.szerzo ? " · " + esc(n.szerzo) : ""}${n.lathato_eladonak ? ` · <i class="fa-regular fa-eye" title="${esc(I18n.t("mbVisibleToSeller"))}"></i>` : ""}</span>
                                        <div>${n.tipus === "statusz" ? `<b>${esc(I18n.t("mbSt_" + n.szoveg))}</b>` : esc(n.szoveg)}</div>
                                    </li>`).join("")}
                            </ul>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-regular fa-note-sticky" aria-hidden="true"></i> ${I18n.t("mbAdminNote")}</h5></div>
                        <div class="card-body">
                            <textarea class="form-control form-control-sm" id="mbAdminJ" rows="4">${esc(m.admin_jegyzet || "")}</textarea>
                            <div class="text-end mt-2"><button type="button" class="btn btn-sm btn-outline-primary" id="mbMentJ">${I18n.t("finSave")}</button></div>
                        </div>
                    </div>

                </div>
            </div>`;

        const $ = q => box.querySelector(q);
        const ment = (adat, utana) => AdminManager.mbApi("megbizasok/" + m.id, { method: "PUT", body: adat })
            .then(() => { Utils.toast && Utils.toast(I18n.t("adsSaved")); AdminManager.refreshPendingCount(); (utana || (() => AdminManager.renderMandate(m.id)))(); })
            .catch(e => alert(Svc.hiba(e)));

        // Városok
        const vs = $("#mbVaros");
        if (CityManager.varosok && CityManager.varosok.length) CityManager.fillCitySelect(vs, m.varos || DataManager.currentCity);
        if (m.varos && ![...vs.options].some(o => o.value === m.varos)) vs.insertAdjacentHTML("afterbegin", `<option value="${esc(m.varos)}" selected>${esc(m.varos)}</option>`);

        $("#mbBack").onclick = () => { history.pushState(null, "", "#admin/megbizasok"); AdminManager.renderMandates(); };

        box.querySelectorAll("[data-mb-st]").forEach(b => { b.onclick = () => ment({ statusz: b.dataset.mbSt }); });
        $("#mbStMas").onchange = e => { if (e.target.value) ment({ statusz: e.target.value }); };

        $("#mbMentAdat").onclick = () => ment({
            ugylet: $("#mbUgylet").value, tipus: $("#mbTipus").value, varos: $("#mbVaros").value, cim: $("#mbCim").value,
            telepules: $("#mbTelepules").value, nm: $("#mbNm").value, szobak: $("#mbSzobak").value, kert_ar: $("#mbKertAr").value,
            leiras: $("#mbLeiras").value, opciok: [...box.querySelectorAll("[data-mb-opc]:checked")].map(c => c.value)
        });

        $("#mbMentSz").onclick = () => ment({
            szerzodes_datum: $("#mbSzDatum").value, alairva: $("#mbAlairva").value, jutalek: $("#mbJut").value, fix_dij: $("#mbFix").value,
            penznem: $("#mbPenznem").value, idotartam_honap: $("#mbIdo").value, kizarolagos: $("#mbKizar").checked,
            eladasi_ar: $("#mbEladAr").value, eladva: $("#mbEladva").value
        });

        $("#mbMentJ").onclick = () => ment({ admin_jegyzet: $("#mbAdminJ").value });

        $("#mbNaploKuld").onclick = () => {
            const szoveg = $("#mbNaploSz").value.trim();
            if (!szoveg) return;
            AdminManager.mbApi(`megbizasok/${m.id}/naplo`, { method: "POST", body: { szoveg, lathato_eladonak: $("#mbNaploLat").checked } })
                .then(() => AdminManager.renderMandate(m.id)).catch(e => alert(Svc.hiba(e)));
        };

        $("#mbDijbekero").onclick = () => {
            if (!confirm(I18n.t("mbProformaConfirm"))) return;
            AdminManager.mbApi(`megbizasok/${m.id}/dijbekero`, { method: "POST", body: {} })
                .then(v => { window.open(`/api/admin/penzugy/szamlak/${v.szamla_id}/nyomtat`, "_blank", "noopener"); AdminManager.renderMandate(m.id); })
                .catch(e => alert(Svc.hiba(e)));
        };

        // Hirdetés: feladás a megbízás adataiból / kapcsolás / leválasztás
        const uj = $("#mbHirdUj");
        if (uj) uj.onclick = () => AdminManager.mbHirdetesFelad(m);
        const kapcs = $("#mbHirdKapcsol");
        if (kapcs) kapcs.onclick = () => { const v = Number($("#mbHirdId").value); if (v) ment({ ingatlan_id: v }); };
        const le = $("#mbHirdLe");
        if (le) le.onclick = () => { if (confirm(I18n.t("mbUnlinkConfirm"))) ment({ ingatlan_id: null }); };
        const szerk = $("#mbHirdSzerk");
        if (szerk) szerk.onclick = () => NewPropertyManager.startEdit({ id: m.hirdetes.id });

        box.querySelectorAll("[data-mb-uj]").forEach(b => { b.onclick = () => AdminManager.mbReszSzerk(m, b.dataset.mbUj, null); });
        box.querySelectorAll("[data-mb-szerk]").forEach(b => {
            const [resz, rid] = b.dataset.mbSzerk.split(":");
            b.onclick = () => AdminManager.mbReszSzerk(m, resz, m[resz].find(x => x.id === Number(rid)));
        });

        box.querySelectorAll("[data-mb-tovabbit]").forEach(b => {
            b.onclick = () => {
                const a = m.ajanlatok.find(x => x.id === Number(b.dataset.mbTovabbit));
                if (!confirm(I18n.f("mbForwardConfirm", { osszeg: Svc.penz(a.osszeg, a.penznem) }))) return;
                AdminManager.mbApi(`megbizasok/${m.id}/ajanlatok/${a.id}`, { method: "PUT", body: { ...a, statusz: "tovabbitva" } })
                    .then(() => AdminManager.renderMandate(m.id)).catch(e => alert(Svc.hiba(e)));
            };
        });

        box.querySelectorAll("[data-mb-felvesz]").forEach(b => {
            b.onclick = () => {
                const u = m.uzenetek.find(x => String(x.felado_id) === b.dataset.mbFelvesz);
                AdminManager.mbApi(`megbizasok/${m.id}/erdeklodok`, { method: "POST", body: { nev: u.nev || "–", email: u.email, telefon: u.telefon, user_id: u.felado_id, megjegyzes: u.szoveg, statusz: "kapcsolat" } })
                    .then(() => AdminManager.renderMandate(m.id)).catch(e => alert(Svc.hiba(e)));
            };
        });

    }).catch(() => AdminManager.finHibaDoboz());

};

// Érdeklődő / megtekintés / ajánlat szerkesztése (ablakban)
AdminManager.mbReszSzerk = function (m, resz, x) {

    const esc = Utils.escape;
    const uj = !x;
    x = x || {};
    const { tartalom, modal } = Svc.modal("mbReszModal", "");
    const erdOpt = sel => `<option value="">–</option>${m.erdeklodok.map(e => `<option value="${e.id}" ${e.id === sel ? "selected" : ""}>${esc(e.nev)}</option>`).join("")}`;
    const lokalis = d => { if (!d) return ""; const t = new Date(d); const p = n => String(n).padStart(2, "0"); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`; };

    const mezok = {
        erdeklodok: `
            <div class="col-12"><label class="form-label small mb-1" for="mrNev">${I18n.t("authName")} *</label><input class="form-control" id="mrNev" value="${esc(x.nev || "")}"></div>
            <div class="col-6"><label class="form-label small mb-1" for="mrTel">${I18n.t("accPhone")}</label><input class="form-control" id="mrTel" value="${esc(x.telefon || "")}"></div>
            <div class="col-6"><label class="form-label small mb-1" for="mrEmail">${I18n.t("authEmail")}</label><input class="form-control" id="mrEmail" value="${esc(x.email || "")}"></div>
            <div class="col-6"><label class="form-label small mb-1" for="mrKeret">${I18n.t("lmBudget")}</label><input class="form-control" id="mrKeret" type="number" value="${x.koltsegkeret ?? ""}"></div>
            <div class="col-6"><label class="form-label small mb-1" for="mrFin">${I18n.t("lmFinancing")}</label><select class="form-select" id="mrFin"><option value="">–</option>${["keszpenz", "hitel", "vegyes", "egyeb"].map(f => `<option value="${f}" ${x.finanszirozas === f ? "selected" : ""}>${I18n.t("lmFin_" + f)}</option>`).join("")}</select></div>
            <div class="col-12"><label class="form-label small mb-1" for="mrSt">${I18n.t("ordStatus")}</label><select class="form-select" id="mrSt">${["uj", "kapcsolat", "megtekintes", "ajanlat", "vevo", "elutasitva"].map(s => `<option value="${s}" ${(x.statusz || "uj") === s ? "selected" : ""}>${I18n.t("mbEr_" + s)}</option>`).join("")}</select></div>
            <div class="col-12"><label class="form-label small mb-1" for="mrMegj">${I18n.t("prNote")}</label><textarea class="form-control" id="mrMegj" rows="3">${esc(x.megjegyzes || "")}</textarea></div>`,
        megtekintesek: `
            <div class="col-12"><label class="form-label small mb-1" for="mrErd">${I18n.t("ordCustomer")}</label><select class="form-select" id="mrErd">${erdOpt(x.erdeklodo_id)}</select></div>
            <div class="col-7"><label class="form-label small mb-1" for="mrIdo">${I18n.t("mbWhen")}</label><input class="form-control" id="mrIdo" type="datetime-local" value="${lokalis(x.idopont)}"></div>
            <div class="col-5"><label class="form-label small mb-1" for="mrSt">${I18n.t("ordStatus")}</label><select class="form-select" id="mrSt">${["kert", "egyeztetve", "megtortent", "elmaradt", "lemondva"].map(s => `<option value="${s}" ${(x.statusz || "egyeztetve") === s ? "selected" : ""}>${I18n.t("mbVw_" + s)}</option>`).join("")}</select></div>
            <div class="col-12"><label class="form-label small mb-1" for="mrJav">${I18n.t("lmWhen")}</label><input class="form-control" id="mrJav" value="${esc(x.javasolt || "")}"></div>
            <div class="col-12"><label class="form-label small mb-1" for="mrVissza">${I18n.t("mbFeedback")}</label><textarea class="form-control" id="mrVissza" rows="3">${esc(x.visszajelzes || "")}</textarea></div>
            <p class="small text-body-secondary mb-0">${I18n.t("mbViewingNotify")}</p>`,
        ajanlatok: `
            <div class="col-12"><label class="form-label small mb-1" for="mrErd">${I18n.t("ordCustomer")}</label><select class="form-select" id="mrErd">${erdOpt(x.erdeklodo_id)}</select></div>
            <div class="col-7"><label class="form-label small mb-1" for="mrOsszeg">${I18n.t("lmAmount")} *</label><input class="form-control" id="mrOsszeg" type="number" value="${x.osszeg ?? ""}"></div>
            <div class="col-5"><label class="form-label small mb-1" for="mrPn">${I18n.t("finCurrency")}</label><select class="form-select" id="mrPn"><option ${x.penznem !== "RON" ? "selected" : ""}>EUR</option><option ${x.penznem === "RON" ? "selected" : ""}>RON</option></select></div>
            <div class="col-12"><label class="form-label small mb-1" for="mrFelt">${I18n.t("lmConditions")}</label><input class="form-control" id="mrFelt" value="${esc(x.feltetelek || "")}"></div>
            <div class="col-7"><label class="form-label small mb-1" for="mrSt">${I18n.t("ordStatus")}</label><select class="form-select" id="mrSt">${["uj", "tovabbitva", "ellenajanlat", "elfogadva", "elutasitva", "visszavonva"].map(s => `<option value="${s}" ${(x.statusz || "uj") === s ? "selected" : ""}>${I18n.t("mbOf_" + s)}</option>`).join("")}</select></div>
            <div class="col-5"><label class="form-label small mb-1" for="mrEllen">${I18n.t("mmCounter")}</label><input class="form-control" id="mrEllen" type="number" value="${x.ellenajanlat ?? ""}"></div>
            <p class="small text-body-secondary mb-0">${I18n.t("mbOfferNotify")}</p>`
    }[resz];

    tartalom.innerHTML = `
        <div class="modal-header">
            <h5 class="modal-title">${I18n.t({ erdeklodok: "mmInterested", megtekintesek: "mmViewings", ajanlatok: "mmOffers" }[resz])}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
        </div>
        <div class="modal-body"><div class="row g-2">${mezok}</div></div>
        <div class="modal-footer">
            ${!uj ? `<button type="button" class="btn btn-outline-danger me-auto" id="mrTorol"><i class="fa-solid fa-trash"></i></button>` : ""}
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
            <button type="button" class="btn btn-primary" id="mrMent">${I18n.t("finSave")}</button>
        </div>`;

    const $ = q => tartalom.querySelector(q);
    const v = q => ($(q) ? $(q).value : undefined);

    $("#mrMent").onclick = () => {
        const body = {
            erdeklodok: () => ({ nev: v("#mrNev"), telefon: v("#mrTel"), email: v("#mrEmail"), koltsegkeret: v("#mrKeret"), finanszirozas: v("#mrFin"), statusz: v("#mrSt"), megjegyzes: v("#mrMegj"), user_id: x.user_id }),
            megtekintesek: () => ({ erdeklodo_id: v("#mrErd"), idopont: v("#mrIdo") ? new Date(v("#mrIdo")).toISOString() : null, statusz: v("#mrSt"), javasolt: v("#mrJav"), visszajelzes: v("#mrVissza") }),
            ajanlatok: () => ({ erdeklodo_id: v("#mrErd"), osszeg: v("#mrOsszeg"), penznem: v("#mrPn"), feltetelek: v("#mrFelt"), statusz: v("#mrSt"), ellenajanlat: v("#mrEllen") })
        }[resz]();
        $("#mrMent").disabled = true;
        AdminManager.mbApi(`megbizasok/${m.id}/${resz}${uj ? "" : "/" + x.id}`, { method: uj ? "POST" : "PUT", body })
            .then(() => { modal.hide(); AdminManager.refreshPendingCount(); AdminManager.renderMandate(m.id); })
            .catch(e => { $("#mrMent").disabled = false; alert(Svc.hiba(e)); });
    };

    const t = $("#mrTorol");
    if (t) t.onclick = () => {
        if (!confirm(I18n.t("finDeleteConfirm"))) return;
        AdminManager.mbApi(`megbizasok/${m.id}/${resz}/${x.id}`, { method: "DELETE" })
            .then(() => { modal.hide(); AdminManager.renderMandate(m.id); }).catch(e => alert(Svc.hiba(e)));
    };

    modal.show();

};

// Hirdetés feladása a megbízás adataiból: az Új ingatlan űrlap kitöltve,
// a mentéskor a hirdetés a megbízáshoz kapcsolódik (fotók, hely: kézzel)
AdminManager.mbHirdetesFelad = function (m) {
    NewPropertyManager.editId = null;
    PageManager.show("new");
    setTimeout(() => {
        const varos = document.getElementById("ujVaros");
        if (varos && m.varos && [...varos.options].some(o => o.value === m.varos)) {
            varos.value = m.varos;
            CityManager.loadKeruletek(m.varos);
        }
        NewPropertyManager.fillFromScrape({
            tipus: m.tipus, ugylet: m.ugylet, cim: m.cim, ar: m.kert_ar, nm: m.nm, szobak: m.szobak,
            leiras: m.leiras, telepules: m.telepules
        });
        NewPropertyManager.megbizasId = m.id;
        const r = document.getElementById("scrapeResult");
        if (r) r.insertAdjacentHTML("afterbegin", `<div class="alert alert-info py-2 small"><i class="fa-solid fa-key"></i> ${Utils.escape(I18n.f("mbListingFromMandate", { szam: m.szerzodes_szam || "#" + m.id }))}</div>`);
    }, 350);
};

// A mentés a megbízás azonosítóját is elküldi (a szerver összekapcsolja)
(() => {
    if (typeof NewPropertyManager === "undefined") return;
    const gyujt = NewPropertyManager.collect;
    NewPropertyManager.collect = function () {
        const d = gyujt.call(this);
        if (NewPropertyManager.megbizasId && NewPropertyManager.editId === null) d.megbizas_id = NewPropertyManager.megbizasId;
        return d;
    };
    const urit = NewPropertyManager.clearForm;
    NewPropertyManager.clearForm = function () {
        NewPropertyManager.megbizasId = null;
        return urit.call(this);
    };
})();

// ===================== BEÁLLÍTÁSOK =====================

AdminManager.renderMandateSettings = function () {

    AdminManager.loading();

    AdminManager.mbApi("megbizas-beallitas").then(b => {

        const box = AdminManager.box();
        const esc = Utils.escape;
        let opciok = (b.opciok || []).map(o => ({ ...o }));

        const opcioSor = (o, i) => `
            <div class="mbOptEdit" data-i="${i}">
                <div class="row g-2 align-items-end">
                    <div class="col-sm-3"><label class="form-label small mb-1">${I18n.t("finPkgCode")}</label><input class="form-control form-control-sm" data-k="kod" value="${esc(o.kod || "")}"></div>
                    <div class="col-sm-3"><label class="form-label small mb-1">${I18n.t("mbIcon")}</label><input class="form-control form-control-sm" data-k="ikon" value="${esc(o.ikon || "fa-solid fa-circle-check")}"></div>
                    <div class="col-6 col-sm-2"><label class="form-label small mb-1">${I18n.t("finPrice")}</label><input class="form-control form-control-sm" type="number" min="0" data-k="ar" value="${o.ar ?? 0}"></div>
                    <div class="col-6 col-sm-2"><label class="form-label small mb-1">${I18n.t("finCurrency")}</label><select class="form-select form-select-sm" data-k="penznem"><option ${o.penznem !== "EUR" ? "selected" : ""}>RON</option><option ${o.penznem === "EUR" ? "selected" : ""}>EUR</option></select></div>
                    <div class="col-sm-2 d-flex gap-2 justify-content-end">
                        <button type="button" class="btn btn-sm btn-outline-danger" data-opc-torol="${i}" title="${esc(I18n.t("finDelete"))}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    ${["hu", "ro", "en"].map(ny => `
                        <div class="col-sm-4"><label class="form-label small mb-1">${I18n.t("finPkgName")} (${ny.toUpperCase()})</label><input class="form-control form-control-sm" data-k="nev.${ny}" value="${esc((o.nev || {})[ny] || "")}"></div>`).join("")}
                    ${["hu", "ro", "en"].map(ny => `
                        <div class="col-sm-4"><label class="form-label small mb-1">${I18n.t("finDescription")} (${ny.toUpperCase()})</label><textarea class="form-control form-control-sm" rows="2" data-k="leiras.${ny}">${esc((o.leiras || {})[ny] || "")}</textarea></div>`).join("")}
                    <div class="col-12 d-flex flex-wrap gap-3">
                        <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" data-k="alap" id="mbo_a${i}" ${o.alap ? "checked" : ""}><label class="form-check-label small" for="mbo_a${i}">${I18n.t("mbOptIncluded")}</label></div>
                        <div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" data-k="aktiv" id="mbo_k${i}" ${o.aktiv !== false ? "checked" : ""}><label class="form-check-label small" for="mbo_k${i}">${I18n.t("finActive")}</label></div>
                    </div>
                </div>
            </div>`;

        const rajzol = () => {
            box.innerHTML = `
                <div class="card mb-4">
                    <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-percent" aria-hidden="true"></i> ${I18n.t("mbFees")}</h5></div>
                    <div class="card-body">
                        <div class="form-check form-switch mb-3">
                            <input class="form-check-input" type="checkbox" role="switch" id="mbsAktiv" ${b.aktiv ? "checked" : ""}>
                            <label class="form-check-label" for="mbsAktiv">${I18n.t("mbServiceOn")}</label>
                        </div>
                        <div class="row g-2">
                            <div class="col-6 col-md-2"><label class="form-label small mb-1" for="mbsJut">${I18n.t("mbCommission")} %</label><input class="form-control form-control-sm" id="mbsJut" type="number" step="0.1" value="${b.jutalek}"></div>
                            <div class="col-6 col-md-2"><label class="form-label small mb-1" for="mbsJutK">${I18n.t("mbCommissionExcl")} %</label><input class="form-control form-control-sm" id="mbsJutK" type="number" step="0.1" value="${b.jutalek_kizarolagos}"></div>
                            <div class="col-6 col-md-2"><label class="form-label small mb-1" for="mbsMin">${I18n.t("mbMinFee")}</label><input class="form-control form-control-sm" id="mbsMin" type="number" step="50" value="${b.minimum_dij}"></div>
                            <div class="col-6 col-md-2"><label class="form-label small mb-1" for="mbsPn">${I18n.t("finCurrency")}</label><select class="form-select form-select-sm" id="mbsPn"><option ${b.penznem !== "RON" ? "selected" : ""}>EUR</option><option ${b.penznem === "RON" ? "selected" : ""}>RON</option></select></div>
                            <div class="col-6 col-md-2"><label class="form-label small mb-1" for="mbsIdo">${I18n.t("mbDuration")}</label><input class="form-control form-control-sm" id="mbsIdo" type="number" min="1" max="36" value="${b.idotartam_honap}"></div>
                            ${["", "_ro", "_en"].map(s => `<div class="col-md-4"><label class="form-label small mb-1" for="mbsTer${s}">${I18n.t("mbArea")} (${(s.slice(1) || "hu").toUpperCase()})</label><input class="form-control form-control-sm" id="mbsTer${s}" value="${esc(b["terulet" + s] || "")}"></div>`).join("")}
                            <div class="col-12"><label class="form-label small mb-1" for="mbsSzM">${I18n.t("mbContractExtra")}</label><textarea class="form-control form-control-sm" id="mbsSzM" rows="3">${esc(b.szerzodes_megjegyzes || "")}</textarea></div>
                        </div>
                    </div>
                </div>

                <div class="card mb-4">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0"><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${I18n.t("mbOptions")}</h5>
                        <button type="button" class="btn btn-sm btn-outline-primary" id="mbsUjOpc"><i class="fa-solid fa-plus"></i> ${I18n.t("mbAdd")}</button>
                    </div>
                    <div class="card-body">
                        <p class="small text-body-secondary">${I18n.t("mbOptionsNote")}</p>
                        <div id="mbsOpciok">${opciok.map(opcioSor).join("")}</div>
                    </div>
                </div>

                <div class="text-end"><button type="button" class="btn btn-primary" id="mbsMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button></div>`;

            const olvasOpciok = () => {
                opciok = [...box.querySelectorAll(".mbOptEdit")].map(el => {
                    const o = { nev: {}, leiras: {} };
                    el.querySelectorAll("[data-k]").forEach(inp => {
                        const [k, ny] = inp.dataset.k.split(".");
                        const val = inp.type === "checkbox" ? inp.checked : inp.value;
                        if (ny) o[k][ny] = val; else o[k] = val;
                    });
                    return o;
                });
            };

            box.querySelector("#mbsUjOpc").onclick = () => {
                olvasOpciok();
                opciok.push({ kod: "uj_" + (opciok.length + 1), ikon: "fa-solid fa-circle-check", ar: 0, penznem: "RON", alap: false, aktiv: true, nev: {}, leiras: {} });
                rajzol();
            };
            box.querySelectorAll("[data-opc-torol]").forEach(btn => {
                btn.onclick = () => { olvasOpciok(); opciok.splice(Number(btn.dataset.opcTorol), 1); rajzol(); };
            });

            box.querySelector("#mbsMent").onclick = () => {
                olvasOpciok();
                const $ = q => box.querySelector(q);
                AdminManager.mbApi("megbizas-beallitas", {
                    method: "PUT", body: {
                        aktiv: $("#mbsAktiv").checked, jutalek: $("#mbsJut").value, jutalek_kizarolagos: $("#mbsJutK").value,
                        minimum_dij: $("#mbsMin").value, penznem: $("#mbsPn").value, idotartam_honap: $("#mbsIdo").value,
                        terulet: $("#mbsTer").value, terulet_ro: $("#mbsTer_ro").value, terulet_en: $("#mbsTer_en").value,
                        szerzodes_megjegyzes: $("#mbsSzM").value, opciok
                    }
                }).then(v => { b = v.beallitas; opciok = b.opciok.map(o => ({ ...o })); Utils.toast && Utils.toast(I18n.t("adsSaved")); rajzol(); })
                    .catch(e => alert(Svc.hiba(e)));
            };
        };

        rajzol();

    }).catch(() => AdminManager.finHibaDoboz());

};
