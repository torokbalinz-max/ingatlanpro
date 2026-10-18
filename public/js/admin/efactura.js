// ============================================================
//  Admin → Pénzügy → e-Factura (#admin/efactura)
//
//  A számlák beküldése az ANAF-hoz (RO e-Factura):
//    - a kapcsolat (az ANAF-nál regisztrált alkalmazás + csatlakozás a
//      minősített tanúsítvánnyal), éles / próba rendszer
//    - automatikus feltöltés (kezdőnaptól), beérkező számlák letöltése
//    - teendők: elküldendő számlák a határidővel (5 munkanap), elutasítottak
//  A számlák listáján és az Irattárban: e-Factura jelvény (AdminManager.efBadge)
//  → kattintásra az ablak (AdminManager.efSzamla): állapot, küldés, ZIP...
//  Szerver: server/routes/efactura.js, server/services/efacturaSpv.js
// ============================================================

(() => {

    AdminManager.TABS.efactura = {
        group: "finance", jog: "penzugy", icon: "fa-solid fa-landmark", title: "adminTabEfactura", desc: "adminDescEfactura",
        render: () => AdminManager.renderEfactura(), count: "efacturaCount", warn: true
    };
    Object.assign(AdminManager.ALIASES, { anaf: "efactura", spv: "efactura", efact: "efactura" });
    Object.assign(AdminManager.COUNT_KEY || {}, { efacturaCount: "efactura_teendo" });

    const eredeti = AdminManager.applyCounts;
    AdminManager.applyCounts = function (c) {
        eredeti.call(this, c);
        AdminManager.setCount("efacturaCount", c.efactura_teendo);
    };

})();

AdminManager.ef = { allapot: null };

AdminManager.efApi = (ut, o) => Svc.api(ut, o);

AdminManager.efHiba = function (e) {
    const k = e && e.kod ? "efErr_" + e.kod : null;
    const alap = k && I18n.t(k) !== k ? I18n.t(k) : Svc.hiba(e);
    const reszlet = e && e.adat && e.adat.message ? "\n\n" + e.adat.message : "";
    return alap + reszlet;
};

// ---------- jelvény a számla mellett ----------

AdminManager.efBadge = function (ef, id) {
    if (!ef || !ef.kell) return "";
    const esc = Utils.escape;
    let szin = "light", ikon = "fa-solid fa-landmark", szoveg;
    if (ef.allapot === "ok") { szin = "success"; ikon = "fa-solid fa-circle-check"; szoveg = I18n.t("efBadgeOk"); }
    else if (ef.allapot === "kezi") { szin = "success"; ikon = "fa-solid fa-hand"; szoveg = I18n.t("efBadgeManual"); }
    else if (ef.allapot === "feldolgozas") { szin = "info"; ikon = "fa-solid fa-hourglass-half"; szoveg = I18n.t("efBadgeProcessing"); }
    else if (ef.allapot === "nok" || ef.allapot === "hiba") { szin = "danger"; ikon = "fa-solid fa-circle-xmark"; szoveg = I18n.t(ef.allapot === "nok" ? "efBadgeRejected" : "efBadgeError"); }
    else if (ef.hatra !== null && ef.hatra < 0) { szin = "danger"; ikon = "fa-solid fa-triangle-exclamation"; szoveg = I18n.f("efBadgeLate", { n: -ef.hatra }); }
    else if (ef.hatra !== null && ef.hatra <= 1) { szin = "warning"; ikon = "fa-solid fa-clock"; szoveg = I18n.t(ef.hatra === 0 ? "efBadgeToday" : "efBadgeTomorrow"); }
    else { szoveg = ef.hatra !== null ? I18n.f("efBadgeDays", { n: ef.hatra }) : I18n.t("efBadgeNotSent"); }
    const cim = ef.hatarido && !["ok", "kezi"].includes(ef.allapot) ? I18n.f("efDeadlineOn", { datum: AdminManager.finNap(ef.hatarido) }) : (ef.index ? "index " + ef.index : "");
    return `<button type="button" class="badge text-bg-${szin} border-0 efBadge" data-ef-szamla="${Number(id)}" title="${esc(cim)}"><i class="${ikon}" aria-hidden="true"></i> ${esc(szoveg)}</button>`;
};

AdminManager.efBadgeKot = function (box, kesz) {
    box.querySelectorAll("[data-ef-szamla]").forEach(b => {
        b.onclick = e => { e.stopPropagation(); AdminManager.efSzamla(Number(b.dataset.efSzamla), kesz); };
    });
};

AdminManager.efAllapotTolt = function (friss) {
    if (AdminManager.ef.allapot && !friss) return Promise.resolve(AdminManager.ef.allapot);
    return AdminManager.efApi("/api/admin/efactura/allapot").then(a => { AdminManager.ef.allapot = a; return a; });
};

// ---------- egy számla e-Factura ablaka ----------

AdminManager.efSzamla = function (id, kesz) {

    const esc = Utils.escape;
    const { tartalom, modal } = Svc.modal("efModal", "modal-lg");
    tartalom.innerHTML = `<div class="modal-body text-center py-5"><div class="spinner-border text-primary"></div></div>`;
    modal.show();

    const rajzol = () => Promise.all([
        AdminManager.finApi("szamlak/" + id),
        AdminManager.efAllapotTolt().catch(() => ({})),
        AdminManager.efApi(`/api/admin/penzugy/szamlak/${id}/efactura/hianyok`).catch(() => ({ hianyok: [] }))
    ]).then(([s, a, hi]) => {
        const ef = s.ef || {};
        const hiany = (hi.hianyok || []).filter(h => !["draft", "not_invoice"].includes(h.kod));
        const vevoHiany = hiany.some(h => /^buyer_/.test(h.kod));
        const javithato = !["feldolgozas", "ok", "kezi"].includes(ef.allapot);
        const kesz2 = ["ok", "kezi"].includes(ef.allapot);
        const kuldheto = a.kapcsolva && !["ok", "feldolgozas"].includes(ef.allapot);
        const sor = (cimke, ertek) => ertek ? `<div class="efKv"><span>${cimke}</span><b>${ertek}</b></div>` : "";
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title"><i class="fa-solid fa-landmark" aria-hidden="true"></i> e-Factura · ${esc(s.sorszam)}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="OK"></button>
            </div>
            <div class="modal-body">
                <div class="mb-3">${AdminManager.efBadge(ef, s.id).replace("<button", "<span").replace("</button>", "</span>")}</div>
                ${sor(I18n.t("efBuyer"), esc(AdminManager.finVevoNev(s)) + ` <span class="badge text-bg-light">${(s.vevo && s.vevo.cui) ? "B2B" : "B2C"}</span>`)}
                ${sor(I18n.t("efIssued"), esc(AdminManager.finNap(s.kiallitva)))}
                ${!kesz2 && ef.hatarido ? sor(I18n.t("efDeadline"), esc(AdminManager.finNap(ef.hatarido)) + (ef.hatra !== null ? ` <span class="text-body-secondary">(${esc(ef.hatra < 0 ? I18n.f("efLateN", { n: -ef.hatra }) : I18n.f("efWorkdaysLeft", { n: ef.hatra }))})</span>` : "")) : ""}
                ${sor(I18n.t("efIndex"), ef.index ? `<span class="font-monospace">${esc(ef.index)}</span>` : "")}
                ${sor(I18n.t("efSentAt"), ef.kuldve ? esc(new Date(ef.kuldve).toLocaleString(Utils.locale())) : "")}
                ${ef.hiba ? `<div class="alert alert-danger small mt-3 mb-0" style="white-space:pre-wrap">${esc(ef.hiba)}</div>` : ""}
                ${hiany.length && javithato ? `
                <div class="alert alert-warning small mt-3 mb-0">
                    <b><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${I18n.t("efMissingTitle")}</b>
                    <ul class="mb-0 mt-1">${hiany.map(h => `<li>${esc(h.szoveg)}</li>`).join("")}</ul>
                    ${hiany.some(h => /^seller_/.test(h.kod)) ? `<div class="mt-2">${I18n.t("efMissingSeller")} <a href="#admin/webhely">${I18n.t("efSiteData")}</a> · <a href="#admin/penzugyBeall">${I18n.t("adminTabBilling")}</a></div>` : ""}
                </div>` : ""}
                ${javithato ? `
                <details class="mt-3" ${vevoHiany ? "open" : ""} id="efVevoBox">
                    <summary class="small fw-semibold">${I18n.t("efBuyerFix")}</summary>
                    <form class="row g-2 mt-1" id="efVevoForm" novalidate>
                        <div class="col-sm-4"><label class="form-label small mb-1" for="efvTipus">${I18n.t("efBuyerType")}</label>
                            <select class="form-select form-select-sm" id="efvTipus">${["maganszemely", "pfa", "ceg"].map(t => `<option value="${t}" ${((s.vevo && s.vevo.tipus) || "maganszemely") === t ? "selected" : ""}>${esc(I18n.t("finCustType_" + t))}</option>`).join("")}</select></div>
                        <div class="col-sm-8"><label class="form-label small mb-1" for="efvNev">${I18n.t("prBillName")} *</label>
                            <input class="form-control form-control-sm" id="efvNev" maxlength="200" value="${esc((s.vevo && s.vevo.nev) || s.ugyfel_nev || "")}"></div>
                        <div class="col-sm-5"><label class="form-label small mb-1" for="efvCui" id="efvCuiLabel">CUI</label>
                            <input class="form-control form-control-sm" id="efvCui" maxlength="20" value="${esc((s.vevo && s.vevo.cui) || "")}"></div>
                        <div class="col-sm-4 efvCeg"><label class="form-label small mb-1" for="efvReg">${I18n.t("prRegCom")}</label>
                            <input class="form-control form-control-sm" id="efvReg" maxlength="40" value="${esc((s.vevo && s.vevo.reg_com) || "")}"></div>
                        <div class="col-sm-3 efvCeg d-flex align-items-end"><div class="form-check"><input class="form-check-input" type="checkbox" id="efvAfa" ${s.vevo && s.vevo.afa ? "checked" : ""}><label class="form-check-label small" for="efvAfa">${I18n.t("efVatShort")}</label></div></div>
                        <div class="col-12"><label class="form-label small mb-1" for="efvCim">${I18n.t("prStreet")} *</label>
                            <input class="form-control form-control-sm" id="efvCim" maxlength="400" value="${esc((s.vevo && s.vevo.cim) || "")}"></div>
                        <div class="col-sm-5"><label class="form-label small mb-1" for="efvVaros">${I18n.t("prCity")} *</label>
                            <input class="form-control form-control-sm" id="efvVaros" maxlength="80" value="${esc((s.vevo && s.vevo.varos) || "")}"></div>
                        <div class="col-sm-4"><label class="form-label small mb-1" for="efvMegye">${I18n.t("prCounty")} *</label>
                            <select class="form-select form-select-sm" id="efvMegye"><option value="">–</option>${PricingPage.MEGYEK.map(([k, n]) => `<option value="RO-${k}" ${s.vevo && s.vevo.megye === "RO-" + k ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
                        <div class="col-sm-3"><label class="form-label small mb-1" for="efvOrszag">${I18n.t("prCountry")}</label>
                            <select class="form-select form-select-sm" id="efvOrszag">${PricingPage.orszagok((s.vevo && s.vevo.orszag) || "RO")}</select></div>
                        <div class="col-12 d-flex flex-wrap align-items-center gap-3 mt-2">
                            <div class="form-check"><input class="form-check-input" type="checkbox" id="efvUgyfel" ${s.ugyfel_id ? "checked" : "disabled"}><label class="form-check-label small" for="efvUgyfel">${I18n.t("efBuyerFixClient")}</label></div>
                            <button type="submit" class="btn btn-sm btn-primary ms-auto"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button>
                        </div>
                        <div class="col-12 small text-body-secondary">${I18n.t("efBuyerFixHelp")}</div>
                    </form>
                </details>` : ""}
                ${!a.kapcsolva ? `<div class="alert alert-info small mt-3 mb-0"><i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i> ${I18n.t("efNotConnectedHint")} <a href="#admin/efactura">${I18n.t("adminTabEfactura")}</a></div>` : ""}
                ${!kesz2 ? `
                <details class="mt-3">
                    <summary class="small">${I18n.t("efManualTitle")}</summary>
                    <p class="small text-body-secondary mt-2 mb-2">${I18n.t("efManualHelp")}</p>
                    <div class="input-group input-group-sm" style="max-width:380px">
                        <input class="form-control" id="efKeziIndex" inputmode="numeric" maxlength="20" placeholder="${esc(I18n.t("efManualIndexPh"))}">
                        <button type="button" class="btn btn-outline-success" id="efKezi"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("efManualBtn")}</button>
                    </div>
                </details>` : ""}
            </div>
            <div class="modal-footer flex-wrap gap-2">
                <button type="button" class="btn btn-outline-secondary btn-sm me-auto" id="efXml"><i class="fa-solid fa-file-code" aria-hidden="true"></i> XML</button>
                ${!hiany.length ? `<a class="btn btn-outline-secondary btn-sm" href="/api/admin/penzugy/szamlak/${s.id}/efactura.pdf" target="_blank" rel="noopener" title="${esc(I18n.t("efPdfHint"))}"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> ANAF PDF</a>` : ""}
                <button type="button" class="btn btn-outline-secondary btn-sm" id="efEllenoriz"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ${I18n.t("finAnafCheck")}</button>
                ${ef.zip ? `<a class="btn btn-outline-success btn-sm" href="/api/admin/penzugy/szamlak/${s.id}/efactura/valasz.zip"><i class="fa-solid fa-file-zipper" aria-hidden="true"></i> ${I18n.t("efZip")}</a>` : ""}
                ${ef.index && ef.allapot === "feldolgozas" ? `<button type="button" class="btn btn-outline-primary btn-sm" id="efFrissit"><i class="fa-solid fa-rotate" aria-hidden="true"></i> ${I18n.t("efRefresh")}</button>` : ""}
                ${kuldheto ? `<button type="button" class="btn btn-primary btn-sm" id="efKuld"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t(ef.allapot === "nok" || ef.allapot === "hiba" ? "efResend" : "efSend")}</button>` : ""}
            </div>`;

        const $ = q => tartalom.querySelector(q);
        const futtat = (gomb, p) => {
            gomb.disabled = true;
            const r = gomb.innerHTML;
            gomb.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
            return p.then(() => { if (kesz) kesz(); return rajzol(); })
                .catch(e => { alert(AdminManager.efHiba(e)); gomb.disabled = false; gomb.innerHTML = r; return rajzol(); });
        };
        $("#efXml").onclick = () => AdminManager.finXml(s.id, s.sorszam);
        const vf = $("#efVevoForm");
        if (vf) {
            const tipusValt = () => {
                const t = $("#efvTipus").value;
                tartalom.querySelectorAll(".efvCeg").forEach(el => { el.hidden = t === "maganszemely"; });
                $("#efvCuiLabel").textContent = t === "maganszemely" ? I18n.t("prCnp") : "CUI *";
            };
            $("#efvTipus").onchange = tipusValt;
            tipusValt();
            vf.onsubmit = e => {
                e.preventDefault();
                const g = vf.querySelector("button[type=submit]");
                g.disabled = true;
                AdminManager.efApi(`/api/admin/penzugy/szamlak/${s.id}/efactura/vevo`, { method: "POST", body: {
                    ugyfelIs: $("#efvUgyfel").checked,
                    vevo: { tipus: $("#efvTipus").value, nev: $("#efvNev").value, cui: $("#efvCui").value, reg_com: $("#efvReg").value, afa: $("#efvAfa").checked,
                        cim: $("#efvCim").value, varos: $("#efvVaros").value, megye: $("#efvMegye").value, orszag: $("#efvOrszag").value }
                } }).then(() => { if (kesz) kesz(); rajzol(); })
                    .catch(err => { g.disabled = false; alert(AdminManager.efHiba(err)); });
            };
        }
        $("#efEllenoriz").onclick = e => AdminManager.finAnaf(s.id, e.currentTarget);
        if ($("#efKuld")) $("#efKuld").onclick = e => {
            if (!confirm(I18n.f("efSendConfirm", { sorszam: s.sorszam, mod: a.mod === "test" ? I18n.t("efModeTest") : I18n.t("efModeProd") }))) return;
            futtat(e.currentTarget, AdminManager.efApi(`/api/admin/penzugy/szamlak/${s.id}/efactura/kuld`, { method: "POST", body: { ujra: ef.allapot === "kezi" } }));
        };
        if ($("#efFrissit")) $("#efFrissit").onclick = e => futtat(e.currentTarget, AdminManager.efApi(`/api/admin/penzugy/szamlak/${s.id}/efactura/frissit`, { method: "POST" }));
        if ($("#efKezi")) $("#efKezi").onclick = e => futtat(e.currentTarget, AdminManager.efApi(`/api/admin/penzugy/szamlak/${s.id}/efactura/kezi`, { method: "POST", body: { index: $("#efKeziIndex").value.trim() } }));
    }).catch(() => { tartalom.innerHTML = `<div class="modal-body"><div class="alert alert-danger mb-0">${I18n.t("alertLoadError")}</div></div>`; });

    rajzol();

};

// ---------- az oldal ----------

AdminManager.renderEfactura = function () {

    AdminManager.loading();

    // visszatérés az ANAF belépés után (?anaf=ok / hibakód)
    const p = new URLSearchParams(location.search);
    const anaf = p.get("anaf");
    if (anaf) history.replaceState(null, "", location.pathname + location.hash);

    Promise.all([
        AdminManager.efAllapotTolt(true),
        AdminManager.finApi("szamlak").catch(() => []),
        AdminManager.finCfg().catch(() => ({}))
    ]).then(([a, szamlak]) => {

        const box = AdminManager.box();
        const esc = Utils.escape;
        const admin = AuthManager.isAdmin();
        const sz = a.szamok || {};

        // teendő számlák: kell e-Factura, de még nincs kész (a legsürgősebb elöl)
        const kezdet = a.kezdet || "";
        const teendo = szamlak.filter(s => s.ef && s.ef.kell && !["ok", "kezi"].includes(s.ef.allapot) && (!kezdet || s.kiallitva >= kezdet))
            .sort((x, y) => (x.ef.allapot === "feldolgozas") - (y.ef.allapot === "feldolgozas") || (x.ef.hatra ?? 99) - (y.ef.hatra ?? 99));
        const regiek = kezdet ? szamlak.filter(s => s.ef && s.ef.kell && !["ok", "kezi"].includes(s.ef.allapot) && s.kiallitva < kezdet).length : 0;

        const uzenet = anaf === "ok"
            ? `<div class="alert alert-success"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${I18n.t("efConnectedOk")}</div>`
            : anaf ? `<div class="alert alert-danger"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(I18n.t("efErr_" + anaf) !== "efErr_" + anaf ? I18n.t("efErr_" + anaf) : I18n.t("efConnectFailed"))}</div>` : "";

        const lepes = (n, cim, szoveg, kesz) => `
            <li class="efStep ${kesz ? "done" : ""}">
                <span class="efStepNo">${kesz ? `<i class="fa-solid fa-check" aria-hidden="true"></i>` : n}</span>
                <div><b>${cim}</b><div class="small text-body-secondary">${szoveg}</div></div>
            </li>`;

        box.innerHTML = `
            ${uzenet}
            <div class="row g-3 mb-4">
                ${AdminManager.finTile("fa-solid fa-paper-plane", "blue", I18n.t("efTileToSend"), Utils.num(sz.kuldendo || 0), I18n.t("efTileToSendSub"))}
                ${AdminManager.finTile("fa-solid fa-clock", sz.surgos ? "red" : "green", I18n.t("efTileUrgent"), Utils.num(sz.surgos || 0), I18n.t("efTileUrgentSub"))}
                ${AdminManager.finTile("fa-solid fa-circle-xmark", sz.elutasitva ? "red" : "green", I18n.t("efTileRejected"), Utils.num(sz.elutasitva || 0), I18n.t("efTileRejectedSub"))}
                ${AdminManager.finTile("fa-solid fa-hourglass-half", "orange", I18n.t("efTileProcessing"), Utils.num(sz.feldolgozas || 0), I18n.t("efTileProcessingSub"))}
            </div>

            <div class="row g-4">
                <div class="col-xl-7">

                    <div class="card mb-4">
                        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                            <h5 class="mb-0"><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${I18n.t("efQueueTitle")}</h5>
                            ${a.kapcsolva && teendo.some(s => !s.ef.allapot || ["nok", "hiba"].includes(s.ef.allapot)) ? `<button type="button" class="btn btn-sm btn-primary" id="efMind"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t("efSendAll")}</button>` : ""}
                        </div>
                        <div class="card-body">
                            ${teendo.length ? `<div class="finList">${teendo.map(s => `
                                <article class="finRow ${s.ef.hatra !== null && s.ef.hatra < 0 ? "late" : ""}">
                                    <span class="kpiIcon blue"><i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i></span>
                                    <div class="finMain">
                                        <div class="d-flex flex-wrap align-items-center gap-2"><b>${esc(s.sorszam)}</b> ${AdminManager.efBadge(s.ef, s.id)}
                                            <span class="badge text-bg-light">${s.vevo && s.vevo.cui ? "B2B" : "B2C"}</span></div>
                                        <div class="small"><b>${esc(AdminManager.finVevoNev(s))}</b> · ${I18n.f("finIssuedOn", { datum: esc(AdminManager.finNap(s.kiallitva)) })}
                                            ${s.ef.hatarido ? ` · ${I18n.f("efDeadlineOn", { datum: esc(AdminManager.finNap(s.ef.hatarido)) })}` : ""}</div>
                                        ${s.ef.hiba ? `<div class="small text-danger text-truncate" title="${esc(s.ef.hiba)}">${esc(s.ef.hiba)}</div>` : ""}
                                    </div>
                                    <b class="finAmount">${esc(AdminManager.finPenz(s.brutto, s.penznem))}</b>
                                    <div class="finActions"><button type="button" class="btn btn-sm btn-outline-primary" data-ef-szamla="${s.id}">${I18n.t("efOpen")}</button></div>
                                </article>`).join("")}</div>`
                            : `<p class="text-success mb-0"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${I18n.t("efQueueEmpty")}</p>`}
                            ${regiek ? `<p class="small text-body-secondary mt-3 mb-0">${I18n.f("efOlderHint", { n: regiek, datum: esc(AdminManager.finNap(kezdet)) })}</p>` : ""}
                        </div>
                    </div>

                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> ${I18n.t("efRulesTitle")}</h5></div>
                        <div class="card-body small">
                            <ul class="mb-2 efRules">
                                <li>${I18n.t("efRule1")}</li>
                                <li>${I18n.t("efRule2")}</li>
                                <li>${I18n.t("efRule3")}</li>
                                <li>${I18n.t("efRule4")}</li>
                                <li>${I18n.t("efRule5")}</li>
                                <li>${I18n.t("efRule6")}</li>
                            </ul>
                            <p class="text-body-secondary mb-0">${I18n.t("efRulesNote")}</p>
                        </div>
                    </div>

                </div>
                <div class="col-xl-5">

                    <div class="card mb-4">
                        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                            <h5 class="mb-0"><i class="fa-solid fa-plug" aria-hidden="true"></i> ${I18n.t("efConnTitle")}</h5>
                            <span class="badge text-bg-${a.kapcsolva ? "success" : "secondary"}">${I18n.t(a.kapcsolva ? "efConnOn" : "efConnOff")}</span>
                        </div>
                        <div class="card-body">
                            ${a.kapcsolva ? `
                                <p class="small mb-2">${I18n.f("efConnSince", { datum: esc(a.kapcsolva_at ? new Date(a.kapcsolva_at).toLocaleDateString(Utils.locale()) : "–") })}
                                    · CIF <b>${esc(a.cif || "–")}</b> · <span class="badge text-bg-${a.mod === "test" ? "warning" : "primary"}">${I18n.t(a.mod === "test" ? "efModeTest" : "efModeProd")}</span></p>
                                ${a.frissites_lejar ? `<p class="small text-body-secondary mb-3">${I18n.f("efRefreshUntil", { datum: esc(new Date(a.frissites_lejar).toLocaleDateString(Utils.locale())) })}</p>` : ""}
                                ${admin ? `<div class="d-flex flex-wrap gap-2">
                                    <a class="btn btn-sm btn-outline-primary" href="/api/admin/efactura/csatlakozas"><i class="fa-solid fa-rotate" aria-hidden="true"></i> ${I18n.t("efReconnect")}</a>
                                    <button type="button" class="btn btn-sm btn-outline-danger" id="efLecsatol">${I18n.t("efDisconnect")}</button>
                                </div>` : ""}`
                            : `
                                <ol class="efSteps list-unstyled mb-3">
                                    ${lepes(1, I18n.t("efStep1"), I18n.t("efStep1Help"), !!a.cif)}
                                    ${lepes(2, I18n.t("efStep2"), I18n.f("efStep2Help", { url: `<code class="user-select-all">${esc(a.redirect_uri)}</code>` }), !!a.client_id_vege)}
                                    ${lepes(3, I18n.t("efStep3"), I18n.t("efStep3Help"), !!a.client_id_vege && a.van_titok)}
                                    ${lepes(4, I18n.t("efStep4"), I18n.t("efStep4Help"), false)}
                                </ol>
                                ${admin && a.client_id_vege && a.van_titok ? `<a class="btn btn-primary" href="/api/admin/efactura/csatlakozas"><i class="fa-solid fa-key" aria-hidden="true"></i> ${I18n.t("efConnectBtn")}</a>` : ""}`}
                            ${admin ? `
                            <details class="mt-3" ${!a.client_id_vege ? "open" : ""}>
                                <summary class="small">${I18n.t("efAppKeys")}${a.client_id_vege ? ` · …${esc(a.client_id_vege)} (${I18n.t(a.kulcs_forras === "szerver" ? "efKeysFromServer" : "efKeysFromAdmin")})` : ""}</summary>
                                ${a.kulcs_forras === "szerver" ? `<p class="small text-body-secondary mt-2 mb-0">${I18n.t("efKeysServerHint")}</p>` : `
                                <form class="row g-2 mt-1" id="efKulcsForm" autocomplete="off">
                                    <div class="col-12"><label class="form-label small mb-1" for="efCid">Client ID</label><input class="form-control form-control-sm font-monospace" id="efCid" required maxlength="200" placeholder="${a.client_id_vege ? "…" + esc(a.client_id_vege) : ""}"></div>
                                    <div class="col-12"><label class="form-label small mb-1" for="efCsec">Client secret</label><input type="password" class="form-control form-control-sm font-monospace" id="efCsec" maxlength="300" autocomplete="new-password"></div>
                                    <div class="col-12 d-flex gap-2">
                                        <button class="btn btn-sm btn-primary" type="submit">${I18n.t("finSave")}</button>
                                        ${a.client_id_vege ? `<button class="btn btn-sm btn-outline-danger" type="button" id="efKulcsTorol">${I18n.t("finDelete")}</button>` : ""}
                                    </div>
                                    <div class="col-12 small text-body-secondary">${I18n.f("efCallbackHint", { url: `<code class="user-select-all">${esc(a.redirect_uri)}</code>` })}</div>
                                </form>`}
                            </details>` : ""}
                        </div>
                    </div>

                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-sliders" aria-hidden="true"></i> ${I18n.t("efSettingsTitle")}</h5></div>
                        <form class="card-body row g-3" id="efBeallForm">
                            <div class="col-12">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="efAuto" ${a.auto ? "checked" : ""} ${admin ? "" : "disabled"}>
                                    <label class="form-check-label" for="efAuto"><b>${I18n.t("efAuto")}</b></label>
                                </div>
                                <div class="small text-body-secondary">${I18n.t("efAutoHelp")}</div>
                            </div>
                            <div class="col-sm-6">
                                <label class="form-label small mb-1" for="efKezdet">${I18n.t("efStartDate")}</label>
                                <input type="date" class="form-control form-control-sm" id="efKezdet" value="${esc(a.kezdet || "")}" ${admin ? "" : "disabled"}>
                                <div class="small text-body-secondary mt-1">${I18n.t("efStartDateHelp")}</div>
                            </div>
                            <div class="col-sm-6">
                                <label class="form-label small mb-1" for="efMod">${I18n.t("efMode")}</label>
                                <select class="form-select form-select-sm" id="efMod" ${admin ? "" : "disabled"}>
                                    <option value="prod" ${a.mod !== "test" ? "selected" : ""}>${I18n.t("efModeProd")}</option>
                                    <option value="test" ${a.mod === "test" ? "selected" : ""}>${I18n.t("efModeTest")}</option>
                                </select>
                                <div class="small text-body-secondary mt-1">${I18n.t("efModeHelp")}</div>
                            </div>
                            <div class="col-12">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="efBejovo" ${a.bejovo ? "checked" : ""} ${admin ? "" : "disabled"}>
                                    <label class="form-check-label" for="efBejovo">${I18n.t("efIncoming")}</label>
                                </div>
                                <div class="small text-body-secondary">${I18n.t("efIncomingHelp")}</div>
                            </div>
                            ${admin ? `<div class="col-12 d-flex align-items-center gap-2"><button class="btn btn-sm btn-primary" type="submit">${I18n.t("finSave")}</button><span class="small" id="efBeallMsg"></span></div>` : ""}
                        </form>
                    </div>

                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-gears" aria-hidden="true"></i> ${I18n.t("efRunTitle")}</h5></div>
                        <div class="card-body">
                            <p class="small mb-1">${I18n.t("efLastRun")}: <b>${a.utolso_futas ? esc(Utils.ago(a.utolso_futas)) : I18n.t("ovNever")}</b>
                                · ${I18n.t("efLastIncoming")}: <b>${a.bejovo_utolso ? esc(Utils.ago(a.bejovo_utolso)) : I18n.t("ovNever")}</b></p>
                            ${a.utolso_hiba ? `<div class="alert alert-warning small py-2 mb-2" style="white-space:pre-wrap">${esc(a.utolso_hiba)}</div>` : ""}
                            <p class="small text-body-secondary">${I18n.t("efRunHelp")}</p>
                            <div class="d-flex flex-wrap gap-2">
                                <button type="button" class="btn btn-sm btn-outline-primary" id="efFuttat" ${a.kapcsolva ? "" : "disabled"}><i class="fa-solid fa-play" aria-hidden="true"></i> ${I18n.t("efRunNow")}</button>
                                <a class="btn btn-sm btn-outline-secondary" href="#admin/irattarSzamla">${I18n.t("efToArchive")}</a>
                            </div>
                            <div class="small mt-2" id="efFutMsg"></div>
                        </div>
                    </div>

                </div>
            </div>`;

        const $ = q => box.querySelector(q);
        const ujra = () => { AdminManager.refreshPendingCount && AdminManager.refreshPendingCount(); AdminManager.renderEfactura(); };
        AdminManager.efBadgeKot(box, ujra);
        box.querySelectorAll(".finActions [data-ef-szamla]").forEach(b => { b.onclick = () => AdminManager.efSzamla(Number(b.dataset.efSzamla), ujra); });

        const kulcsForm = $("#efKulcsForm");
        if (kulcsForm) kulcsForm.onsubmit = e => {
            e.preventDefault();
            AdminManager.efApi("/api/admin/efactura/kulcs", { method: "POST", body: { client_id: $("#efCid").value, client_secret: $("#efCsec").value } })
                .then(ujra).catch(err => alert(AdminManager.efHiba(err)));
        };
        if ($("#efKulcsTorol")) $("#efKulcsTorol").onclick = () => {
            if (!confirm(I18n.t("efKeysDeleteConfirm"))) return;
            AdminManager.efApi("/api/admin/efactura/kulcs", { method: "DELETE" }).then(ujra).catch(err => alert(AdminManager.efHiba(err)));
        };
        if ($("#efLecsatol")) $("#efLecsatol").onclick = () => {
            if (!confirm(I18n.t("efDisconnectConfirm"))) return;
            AdminManager.efApi("/api/admin/efactura/lecsatol", { method: "POST" }).then(ujra).catch(err => alert(AdminManager.efHiba(err)));
        };
        const bf = $("#efBeallForm");
        if (bf) bf.onsubmit = e => {
            e.preventDefault();
            if (!admin) return;
            const auto = $("#efAuto").checked;
            if (auto && !a.auto && !$("#efKezdet").value && !confirm(I18n.t("efAutoNoStartConfirm"))) return;
            AdminManager.efApi("/api/admin/efactura/beallitas", { method: "PUT", body: { efactura_auto: auto, efactura_kezdet: $("#efKezdet").value || null, efactura_mod: $("#efMod").value, efactura_bejovo: $("#efBejovo").checked } })
                .then(() => { AdminManager.fin.cfg = null; ujra(); })
                .catch(err => alert(AdminManager.efHiba(err)));
        };
        if ($("#efFuttat")) $("#efFuttat").onclick = e => {
            const g = e.currentTarget;
            g.disabled = true;
            $("#efFutMsg").innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
            AdminManager.efApi("/api/admin/efactura/futtat", { method: "POST" }).then(v => {
                $("#efFutMsg").textContent = I18n.f("efRunDone", { kuldve: v.kuldve || 0, frissitve: v.feldolgozva || 0, bejovo: v.bejovo ? v.bejovo.uj : 0 })
                    + (v.hibak && v.hibak.length ? " · " + v.hibak.join(" | ") : "");
                setTimeout(ujra, 2500);
            }).catch(err => { $("#efFutMsg").textContent = AdminManager.efHiba(err); g.disabled = false; });
        };
        if ($("#efMind")) $("#efMind").onclick = e => {
            const lista = teendo.filter(s => !s.ef.allapot || ["nok", "hiba"].includes(s.ef.allapot));
            if (!confirm(I18n.f("efSendAllConfirm", { n: lista.length, mod: a.mod === "test" ? I18n.t("efModeTest") : I18n.t("efModeProd") }))) return;
            const g = e.currentTarget;
            g.disabled = true;
            let kesz = 0;
            const hibak = [];
            lista.reduce((p, s) => p.then(() => AdminManager.efApi(`/api/admin/penzugy/szamlak/${s.id}/efactura/kuld`, { method: "POST", body: {} })
                .then(() => { kesz++; g.textContent = `${kesz} / ${lista.length}`; })
                .catch(err => hibak.push(`${s.sorszam}: ${AdminManager.efHiba(err)}`))), Promise.resolve())
                .then(() => { if (hibak.length) alert(hibak.join("\n\n")); ujra(); });
        };

    }).catch(() => AdminManager.finHibaDoboz());

};
