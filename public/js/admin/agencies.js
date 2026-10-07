// ============================================================
//  Admin – Ingatlanirodák jóváhagyása
//
//  Az új iroda csak jóváhagyás után látszik nyilvánosan. Itt az iroda
//  által megadott adatok mellett ott vannak az ANAF nyilvános adatai
//  (hivatalos név, cím, fő tevékenység, aktív-e), és néhány jelzés,
//  ami segít eldönteni, hogy valódi irodáról van-e szó.
// ============================================================

AdminManager.irodaAllapot = { lista: [], szuro: "fuggo", nyitott: null };

AdminManager.renderAgencies = function () {

    AdminManager.loading();

    fetch("/api/admin/irodak")
        .then(r => r.json())
        .then(lista => {
            const S = AdminManager.irodaAllapot;
            S.lista = Array.isArray(lista) ? lista : [];
            // Ha nincs függő, az összeset mutatjuk
            if (S.szuro === "fuggo" && !S.lista.some(i => i.statusz === "fuggo")) S.szuro = "mind";
            AdminManager.drawAgencies();
        })
        .catch(() => { AdminManager.box().innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`; });

};

AdminManager.irodaJelzesek = function (ir) {

    const jel = [];
    const a = ir.anaf_adat || null;
    const domain = u => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) { return ""; } };
    const ingyenes = /@(gmail|yahoo|hotmail|outlook|live|icloud|ymail|mail|protonmail)\./i;

    if (ir.anaf_hiba && !a) jel.push(["warn", "fa-cloud-exclamation", I18n.t("agaAnafError")]);
    if (a && a.talalt === false) jel.push(["bad", "fa-circle-xmark", I18n.t("anafNotFound")]);
    if (a && a.torolve) jel.push(["bad", "fa-circle-xmark", I18n.t("anafDeleted")]);
    else if (a && a.inaktiv) jel.push(["bad", "fa-circle-xmark", I18n.t("anafInactive")]);
    else if (a && a.nev) jel.push(["ok", "fa-circle-check", I18n.t("agaAnafActive")]);

    if (a && a.caen) {
        if (a.caen === "6831") jel.push(["ok", "fa-circle-check", I18n.t("agaCaenAgency")]);
        else if (a.ingatlanos) jel.push(["ok", "fa-circle-check", I18n.t("agaCaenRealEstate")]);
        else jel.push(["warn", "fa-triangle-exclamation", I18n.f("agaCaenOther", { caen: a.caen })]);
    }

    if (ir.email && ir.weboldal) {
        const d = domain(ir.weboldal);
        if (d && ir.email.toLowerCase().endsWith("@" + d)) jel.push(["ok", "fa-circle-check", I18n.t("agaEmailDomain")]);
    }
    if (ir.email && ingyenes.test(ir.email)) jel.push(["info", "fa-circle-info", I18n.t("agaFreeEmail")]);
    if (!ir.weboldal) jel.push(["info", "fa-circle-info", I18n.t("agaNoWebsite")]);

    if (ir.letrehozo_reg && Date.now() - new Date(ir.letrehozo_reg).getTime() < 2 * 24 * 3600 * 1000) {
        jel.push(["info", "fa-circle-info", I18n.t("agaNewAccount")]);
    }

    return jel;

};

AdminManager.drawAgencies = function () {

    const S = AdminManager.irodaAllapot;
    const esc = Utils.escape;
    const box = AdminManager.box();

    const szam = st => S.lista.filter(i => st === "mind" || i.statusz === st).length;
    const lista = S.lista.filter(i => S.szuro === "mind" || i.statusz === S.szuro);

    const statuszBadge = st => {
        const cls = { fuggo: "text-bg-warning", jovahagyva: "text-bg-success", elutasitva: "text-bg-danger", felfuggesztve: "text-bg-secondary" }[st] || "text-bg-light";
        return `<span class="badge ${cls}">${I18n.t("agaStatus_" + st)}</span>`;
    };

    const kartya = ir => {

        const a = ir.anaf_adat && ir.anaf_adat.talalt !== false ? ir.anaf_adat : null;
        const jel = AdminManager.irodaJelzesek(ir);

        return `
            <div class="card agaCard mb-3" data-id="${ir.id}">
                <div class="card-body">
                    <div class="d-flex flex-wrap align-items-start gap-3 mb-3">
                        ${AgencyUI.logo(ir)}
                        <div class="flex-fill min-w-0">
                            <h5 class="mb-1">${esc(ir.nev)} ${statuszBadge(ir.statusz)}</h5>
                            <div class="small text-body-secondary">
                                ${I18n.f("agaCreated", { d: Utils.ago(ir.created_at) })}
                                · ${I18n.t("agaBy")}: <b>${esc(ir.letrehozo_nev || "?")}</b>${ir.letrehozo_email ? ` (${esc(ir.letrehozo_email)})` : ""}
                            </div>
                            <div class="small text-body-secondary">
                                ${I18n.f("agaCounts", { h: ir.aktiv_db, t: ir.tag_db, u: ir.ugynok_db })}
                            </div>
                        </div>
                        <div class="d-flex flex-wrap gap-2">
                            ${ir.statusz === "jovahagyva" ? `<a class="btn btn-sm btn-outline-secondary" href="#irodak/${ir.id}"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i> ${I18n.t("agaOpenPublic")}</a>` : ""}
                            <a class="btn btn-sm btn-outline-secondary" href="#iroda/${ir.id}"><i class="fa-solid fa-gear" aria-hidden="true"></i> ${I18n.t("agManage")}</a>
                        </div>
                    </div>

                    <div class="row g-3">
                        <div class="col-lg-6">
                            <div class="agaCol">
                                <h6>${I18n.t("agaGiven")}</h6>
                                <dl class="anafList mb-0">
                                    <dt>${I18n.t("agName")}</dt><dd>${esc(ir.nev)}</dd>
                                    ${ir.varos ? `<dt>${I18n.t("newVaros")}</dt><dd>${esc(CityManager.displayName(ir.varos))}</dd>` : ""}
                                    ${ir.cim ? `<dt>${I18n.t("agAddress")}</dt><dd>${esc(ir.cim)}</dd>` : ""}
                                    ${ir.telefon ? `<dt>${I18n.t("accPhone")}</dt><dd>${esc(ir.telefon)}</dd>` : ""}
                                    ${ir.email ? `<dt>${I18n.t("authEmail")}</dt><dd>${esc(ir.email)}</dd>` : ""}
                                    ${ir.weboldal ? `<dt>${I18n.t("agWebsite")}</dt><dd><a href="${esc(ir.weboldal)}" target="_blank" rel="noopener nofollow">${esc(AgencyUI.weboldalNev(ir.weboldal))} <i class="fa-solid fa-arrow-up-right-from-square small" aria-hidden="true"></i></a></dd>` : ""}
                                    ${ir.leiras ? `<dt>${I18n.t("agAbout")}</dt><dd class="small">${esc(ir.leiras)}</dd>` : ""}
                                </dl>
                            </div>
                        </div>
                        <div class="col-lg-6">
                            <div class="agaCol anaf">
                                <h6 class="d-flex justify-content-between align-items-center gap-2">
                                    <span>${I18n.t("agaAnaf")}</span>
                                    ${ir.cui ? `<button type="button" class="btn btn-sm btn-link p-0" data-aga-anaf="${ir.id}"><i class="fa-solid fa-rotate" aria-hidden="true"></i> ${I18n.t("agaAnafRefresh")}</button>` : ""}
                                </h6>
                                ${a ? `
                                <dl class="anafList mb-0">
                                    <dt>${I18n.t("agOfficialName")}</dt><dd><b>${esc(a.nev || "")}</b></dd>
                                    <dt>${I18n.t("anafCui")}</dt><dd>${a.tva ? "RO" : ""}${esc(a.cui || ir.cui || "")}</dd>
                                    ${a.regCom ? `<dt>${I18n.t("anafRegCom")}</dt><dd>${esc(a.regCom)}</dd>` : ""}
                                    ${a.cim ? `<dt>${I18n.t("anafAddress")}</dt><dd>${esc(a.cim)}</dd>` : ""}
                                    <dt>${I18n.t("anafCaen")}</dt><dd>${esc(a.caen || "–")}${AgencyAnaf.caenNev(a.caen) ? " – " + esc(AgencyAnaf.caenNev(a.caen)) : ""}</dd>
                                    ${a.bejegyezve ? `<dt>${I18n.t("anafRegistered")}</dt><dd>${esc(a.bejegyezve)}</dd>` : ""}
                                    ${a.allapotSzoveg ? `<dt>${I18n.t("agaRegState")}</dt><dd class="small">${esc(a.allapotSzoveg)}</dd>` : ""}
                                </dl>` : `
                                <p class="small text-body-secondary mb-0">${ir.cui ? `CUI: <b>${esc(ir.cui)}</b> – ` : ""}${I18n.t(ir.cui ? "agaAnafMissing" : "agaNoCui")}</p>`}
                                ${ir.anaf_ido ? `<div class="small text-body-secondary mt-2">${I18n.f("agaAnafChecked", { d: Utils.ago(ir.anaf_ido) })}</div>` : ""}
                            </div>
                        </div>
                    </div>

                    ${jel.length ? `<div class="agaSignals mt-3">${jel.map(([t, ikon, sz]) => `<span class="agaSignal ${t}"><i class="fa-solid ${ikon}" aria-hidden="true"></i> ${esc(sz)}</span>`).join("")}</div>` : ""}

                    ${ir.dontes_ok ? `<div class="small mt-3"><b>${I18n.t("agReason")}:</b> ${esc(ir.dontes_ok)} ${ir.dontes_ido ? `<span class="text-body-secondary">(${Utils.ago(ir.dontes_ido)})</span>` : ""}</div>` : ""}

                    <div class="agaActions mt-3">
                        ${ir.statusz !== "jovahagyva" ? `<button type="button" class="btn btn-success btn-sm" data-aga-do="jovahagyva"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("agaApprove")}</button>` : ""}
                        ${ir.statusz === "fuggo" ? `<button type="button" class="btn btn-outline-danger btn-sm" data-aga-do="elutasitva"><i class="fa-solid fa-xmark" aria-hidden="true"></i> ${I18n.t("agaReject")}</button>` : ""}
                        ${ir.statusz === "jovahagyva" ? `<button type="button" class="btn btn-outline-danger btn-sm" data-aga-do="felfuggesztve"><i class="fa-solid fa-ban" aria-hidden="true"></i> ${I18n.t("agaSuspend")}</button>` : ""}
                    </div>
                    <div class="agaReason mt-2" hidden>
                        <label class="form-label small" for="agaOk${ir.id}">${I18n.t("agaReasonLabel")}</label>
                        <textarea class="form-control form-control-sm mb-2" id="agaOk${ir.id}" rows="2" maxlength="1000" placeholder="${esc(I18n.t("agaReasonPh"))}"></textarea>
                        <div class="d-flex gap-2">
                            <button type="button" class="btn btn-danger btn-sm" data-aga-confirm>${I18n.t("agaConfirm")}</button>
                            <button type="button" class="btn btn-outline-secondary btn-sm" data-aga-cancel>${I18n.t("cancel")}</button>
                        </div>
                    </div>
                </div>
            </div>`;

    };

    box.innerHTML = `
        <div class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="${esc(I18n.t("adminTabAgencies"))}">
            ${["fuggo", "jovahagyva", "elutasitva", "felfuggesztve", "mind"].map(st => `
                <button type="button" class="btn btn-sm ${S.szuro === st ? "btn-primary" : "btn-outline-primary"}" data-aga-filter="${st}">
                    ${I18n.t("agaFilter_" + st)} <span class="badge ${S.szuro === st ? "text-bg-light" : "text-bg-secondary"}">${szam(st)}</span>
                </button>`).join("")}
        </div>
        <p class="sectionNote">${I18n.t("agaIntro")}</p>
        ${lista.length ? lista.map(kartya).join("") : `
            <div class="emptyState">
                <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
                <h5>${I18n.t(S.szuro === "fuggo" ? "agaNonePending" : "agaNone")}</h5>
            </div>`}`;

    box.querySelectorAll("[data-aga-filter]").forEach(b => b.onclick = () => { S.szuro = b.dataset.agaFilter; AdminManager.drawAgencies(); });

    const dont = (id, statusz, ok) => fetch(`/api/admin/irodak/${id}/dontes`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statusz, ok })
    }).then(r => r.json().then(v => ({ ok: r.ok, v }))).then(({ ok: siker, v }) => {
        if (!siker) { alert(I18n.t(v.error === "reason_required" ? "agaReasonRequired" : "alertSaveError")); return; }
        Utils.toast(I18n.t("agaDone_" + statusz));
        AdminManager.refreshPendingCount();
        AdminManager.renderAgencies();
    });

    box.querySelectorAll(".agaCard").forEach(card => {

        const id = Number(card.dataset.id);
        const ok = card.querySelector(".agaReason");
        let mit = null;

        card.querySelectorAll("[data-aga-do]").forEach(b => b.onclick = () => {
            mit = b.dataset.agaDo;
            if (mit === "jovahagyva") { dont(id, mit, null); return; }
            ok.hidden = false;
            ok.querySelector("textarea").focus();
        });

        card.querySelector("[data-aga-cancel]").onclick = () => { ok.hidden = true; mit = null; };
        card.querySelector("[data-aga-confirm]").onclick = () => {
            const indok = ok.querySelector("textarea").value.trim();
            if (!indok) { alert(I18n.t("agaReasonRequired")); return; }
            dont(id, mit, indok);
        };

        const anafBtn = card.querySelector("[data-aga-anaf]");
        if (anafBtn) anafBtn.onclick = () => {
            anafBtn.disabled = true;
            fetch(`/api/admin/irodak/${id}/anaf`, { method: "POST" })
                .then(r => r.json().then(v => ({ ok: r.ok, v })))
                .then(({ ok: siker }) => {
                    if (!siker) alert(I18n.t("anafErr_anaf_unavailable"));
                    AdminManager.renderAgencies();
                })
                .catch(() => { anafBtn.disabled = false; });
        };

    });

};
