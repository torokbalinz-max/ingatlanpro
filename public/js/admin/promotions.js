// ============================================================
//  Admin → Pénzügy → Kiemelések (#admin/kiemelesek)
//                 → Online fizetés (#admin/onlinefiz)
//
//  Kiemelések: mely hirdetések kiemeltek most, honnan (megvett / előfizetés
//  kerete / kézzel adott), meddig; kézi kiemelés és leállítás.
//  Online fizetés: a kártyás fizetés (Stripe) és a hivatalos számlázó
//  (SmartBill / Oblio) beállítási állapota, a legutóbbi online fizetések,
//  a hivatalos számla újrapróbálása.
// ============================================================

(() => {

    AdminManager.TABS.kiemelesek = {
        group: "finance", jog: "penzugy", icon: "fa-solid fa-star", title: "adminTabPromotions", desc: "adminDescPromotions",
        render: () => AdminManager.renderPromotions()
    };
    AdminManager.TABS.onlinefiz = {
        group: "finance", jog: "penzugy", icon: "fa-solid fa-credit-card", title: "adminTabOnlinePay", desc: "adminDescOnlinePay",
        render: () => AdminManager.renderOnlinePay()
    };
    Object.assign(AdminManager.ALIASES, { kiemeles: "kiemelesek", promociok: "kiemelesek", fizetesek: "onlinefiz", stripe: "onlinefiz" });

})();

// ===================== KIEMELÉSEK =====================

AdminManager.renderPromotions = function () {

    AdminManager.loading();

    Svc.api("/api/admin/kiemelesek").then(d => {

        const box = AdminManager.box();
        const esc = Utils.escape;
        const o = d.osszeg;
        const forras = f => `<span class="badge text-bg-${{ rendeles: "success", keret: "info", admin: "secondary" }[f] || "light"}">${esc(I18n.t("ftSrc_" + f))}</span>`;
        const allapot = k => k.fut ? `<span class="badge text-bg-warning"><i class="fa-solid fa-star"></i> ${I18n.t("ftStRunning")}</span>`
            : k.kesobb ? `<span class="badge text-bg-light">${I18n.t("ftStLater")}</span>`
            : `<span class="badge text-bg-secondary">${I18n.t(k.statusz === "leallitva" ? "ftStStopped" : "ftStEnded")}</span>`;

        box.innerHTML = `
            <div class="row g-3 mb-4">
                ${AdminManager.finTile("fa-solid fa-star", "orange", I18n.t("ftRunningNow"), Utils.num(o.fut), o.kesobb ? I18n.f("ftLaterN", { n: o.kesobb }) : "")}
                ${AdminManager.finTile("fa-solid fa-cart-shopping", "green", I18n.t("ftSrc_rendeles"), Utils.num(o.rendeles), "")}
                ${AdminManager.finTile("fa-solid fa-calendar-check", "blue", I18n.t("ftSrc_keret"), Utils.num(o.keret), "")}
                ${AdminManager.finTile("fa-solid fa-user-shield", "blue", I18n.t("ftSrc_admin"), Utils.num(o.admin), "")}
            </div>

            <div class="card mb-4">
                <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("ftAdminAdd")}</h5></div>
                <div class="card-body">
                    <form class="row g-2 align-items-end" id="ftAdd">
                        <div class="col-sm-3"><label class="form-label small" for="ftAddId">${I18n.t("ftListingId")}</label><input class="form-control" id="ftAddId" type="number" min="1" required placeholder="1234"></div>
                        <div class="col-sm-2"><label class="form-label small" for="ftAddNap">${I18n.t("ftDaysLabel")}</label><input class="form-control" id="ftAddNap" type="number" min="1" max="365" value="7" required></div>
                        <div class="col-sm-5"><label class="form-label small" for="ftAddMegj">${I18n.t("ftNote")}</label><input class="form-control" id="ftAddMegj" maxlength="300"></div>
                        <div class="col-sm-2"><button class="btn btn-primary w-100" type="submit">${I18n.t("ftAdminAddBtn")}</button></div>
                    </form>
                    <p class="small text-body-secondary mt-2 mb-0">${I18n.t("ftAdminHint")}</p>
                </div>
            </div>

            <div class="card">
                <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-list" aria-hidden="true"></i> ${I18n.t("ftList")}</h5></div>
                <div class="card-body">
                    ${d.lista.length ? `
                    <div class="table-responsive">
                        <table class="table table-sm align-middle mb-0">
                            <thead><tr><th>${I18n.t("ftListing")}</th><th>${I18n.t("ftWho")}</th><th>${I18n.t("ftSource")}</th><th>${I18n.t("ftPeriod")}</th><th></th><th></th></tr></thead>
                            <tbody>${d.lista.map(k => `
                                <tr>
                                    <td><a href="#listing/${k.ingatlan_id}" target="_blank" rel="noopener">#${k.ingatlan_id}</a> ${esc((k.cim || Types.label(k.tipus)).slice(0, 50))}<div class="small text-body-secondary">${esc(CityManager.displayName(k.varos || ""))}</div></td>
                                    <td class="small">${esc(k.iroda_nev || k.user_nev || "–")}${k.megjegyzes ? `<div class="text-body-secondary">„${esc(k.megjegyzes)}”</div>` : ""}</td>
                                    <td>${forras(k.forras)}${k.rendeles_nev ? `<div class="small text-body-secondary">${esc(k.rendeles_nev)}</div>` : ""}</td>
                                    <td class="small text-nowrap">${esc(Svc.ido(k.kezdet))}<br>→ ${esc(Svc.ido(k.vege))}</td>
                                    <td>${allapot(k)}</td>
                                    <td class="text-end">${k.fut || k.kesobb ? `<button type="button" class="btn btn-sm btn-link text-danger p-0" data-ft-stop="${k.id}">${I18n.t("ftStop")}</button>` : ""}</td>
                                </tr>`).join("")}
                            </tbody>
                        </table>
                    </div>` : `<p class="text-body-secondary mb-0">${I18n.t("ftNone")}</p>`}
                </div>
            </div>`;

        box.querySelector("#ftAdd").onsubmit = e => {
            e.preventDefault();
            Svc.api("/api/admin/kiemelesek", {
                method: "POST",
                body: { ingatlan_id: Number(box.querySelector("#ftAddId").value), nap: Number(box.querySelector("#ftAddNap").value), megjegyzes: box.querySelector("#ftAddMegj").value }
            }).then(v => {
                Utils.toast && Utils.toast(I18n.f("ftDone", { d: Svc.ido(v.vege) }));
                if (DataManager.init) DataManager.init();
                AdminManager.renderPromotions();
            }).catch(err => alert(Svc.hiba(err, "ftErr_")));
        };

        box.querySelectorAll("[data-ft-stop]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("ftStopConfirm"))) return;
                Svc.api(`/api/admin/kiemelesek/${b.dataset.ftStop}/leallit`, { method: "POST" })
                    .then(() => { if (DataManager.init) DataManager.init(); AdminManager.renderPromotions(); })
                    .catch(err => alert(Svc.hiba(err)));
            };
        });

    }).catch(() => { AdminManager.box().innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`; });

};

// ===================== ONLINE FIZETÉS ÉS SZÁMLÁZÁS =====================

AdminManager.renderOnlinePay = function () {

    AdminManager.loading();

    Promise.all([Svc.api("/api/admin/fizetes/allapot"), Svc.api("/api/admin/fizetes/lista")]).then(([a, lista]) => {

        const box = AdminManager.box();
        const esc = Utils.escape;
        const f = a.fizetes;
        const sz = a.szamlazo;

        const sor = (jo, cim, szoveg) => `
            <div class="opStatus ${jo === true ? "ok" : jo === "warn" ? "warn" : "no"}">
                <i class="fa-solid ${jo === true ? "fa-circle-check" : jo === "warn" ? "fa-triangle-exclamation" : "fa-circle-xmark"}" aria-hidden="true"></i>
                <div><b>${cim}</b><div class="small">${szoveg}</div></div>
            </div>`;

        const modSzoveg = { eles: I18n.t("opModeLive"), teszt: I18n.t("opModeTest"), demo: I18n.t("opModeDemo") }[f.mod] || I18n.t("opNotSet");
        const stLabel = s => `<span class="badge text-bg-${{ fizetve: "success", indult: "light", lejart: "secondary", sikertelen: "danger", elteres: "danger" }[s] || "light"}">${esc(I18n.t("opSt_" + s))}</span>`;

        box.innerHTML = `
            <div class="row g-4 mb-4">
                <div class="col-lg-6">
                    <div class="card h-100">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-credit-card" aria-hidden="true"></i> ${I18n.t("opCardTitle")}</h5></div>
                        <div class="card-body">
                            ${sor(f.szolgaltato ? (f.mod === "eles" ? true : "warn") : false, I18n.t("opProvider"), f.szolgaltato === "demo" ? esc(modSzoveg) : f.szolgaltato ? `Stripe – ${esc(modSzoveg)}` : I18n.t("opStripeMissing"))}
                            ${f.szolgaltato === "stripe" ? sor(f.webhook ? true : false, I18n.t("opWebhook"), f.webhook ? esc(a.webhook_cim) : I18n.f("opWebhookMissing", { url: esc(a.webhook_cim) })) : ""}
                            ${sor(f.bekapcsolva ? true : "warn", I18n.t("opOnSite"), f.bekapcsolva ? I18n.t("opOnSiteOn") : I18n.t("opOnSiteOff"))}
                            <p class="small text-body-secondary mt-3 mb-0">${I18n.t("opCardHelp")}</p>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="card h-100">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${I18n.t("opInvoicerTitle")}</h5></div>
                        <div class="card-body">
                            ${sor(sz.szamlazo ? true : sz.hianyos ? "warn" : false, I18n.t("opInvoicer"), sz.szamlazo ? esc(sz.szamlazo === "smartbill" ? "SmartBill" : "Oblio") : sz.hianyos ? I18n.t("opInvoicerIncomplete") : I18n.t("opInvoicerMissing"))}
                            <p class="small text-body-secondary mt-3 mb-0">${I18n.t("opInvoicerHelp")}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-list" aria-hidden="true"></i> ${I18n.t("opRecent")}</h5></div>
                <div class="card-body">
                    ${lista.length ? `
                    <div class="table-responsive">
                        <table class="table table-sm align-middle mb-0">
                            <thead><tr><th>${I18n.t("accDocDate")}</th><th>${I18n.t("prProforma")}</th><th>${I18n.t("ftWho")}</th><th class="text-end">${I18n.t("prAmount")}</th><th></th><th>${I18n.t("accOfficialNo")}</th></tr></thead>
                            <tbody>${lista.map(x => `
                                <tr>
                                    <td class="small text-nowrap">${esc(Svc.ido(x.fizetve_at || x.created_at))}</td>
                                    <td><b>${esc(x.sorszam || "–")}</b><div class="small text-body-secondary">${esc(x.szolgaltato)}${x.fizetes_azon ? " · " + esc(x.fizetes_azon) : ""}</div></td>
                                    <td class="small">${esc(x.user_nev || "–")}</td>
                                    <td class="text-end text-nowrap">${esc(Svc.penz(x.osszeg, x.penznem))}</td>
                                    <td>${stLabel(x.statusz)}${x.hiba ? `<div class="small text-danger">${esc(x.hiba)}</div>` : ""}</td>
                                    <td class="small">
                                        ${x.kulso_szam ? esc(x.kulso_szam) : ""}
                                        ${x.statusz === "fizetve" && sz.szamlazo && (!x.kulso_szam || x.hivatalos_hiba) ? `<button type="button" class="btn btn-sm btn-outline-primary" data-op-szamla="${x.szamla_id}">${I18n.t("opIssue")}</button>` : ""}
                                        ${x.hivatalos_hiba ? `<div class="text-danger">${esc(x.hivatalos_hiba)}</div>` : ""}
                                    </td>
                                </tr>`).join("")}
                            </tbody>
                        </table>
                    </div>` : `<p class="text-body-secondary mb-0">${I18n.t("opNone")}</p>`}
                </div>
            </div>`;

        box.querySelectorAll("[data-op-szamla]").forEach(b => {
            b.onclick = () => {
                b.disabled = true;
                Svc.api(`/api/admin/penzugy/szamlak/${b.dataset.opSzamla}/hivatalos`, { method: "POST" })
                    .then(() => AdminManager.renderOnlinePay())
                    .catch(err => { b.disabled = false; alert((err.adat && err.adat.message) || Svc.hiba(err)); });
            };
        });

    }).catch(() => { AdminManager.box().innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`; });

};
