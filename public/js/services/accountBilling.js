// ============================================================
//  Fiókom → Csomagom és számláim (#fiok/csomag)
//
//  - a jelenlegi jogaim (hány hirdetést tehetek fel, reklámmentes...)
//  - az irodáim csomagja (ha irodavezető vagyok)
//  - előfizetéseim (lemondás: a kifizetett időszak végéig él)
//  - fizetésre váró rendeléseim: átutalási adatok, díjbekérő, visszavonás
//  - díjbekérőim / számláim (megnyitás, nyomtatás / PDF, hivatalos számla)
//  - online fizetés bankkártyával (Stripe); visszatéréskor az eredmény
// ============================================================

class AccountBilling {

    static render(el) {

        AccountPage.spinner(el);

        AccountBilling.el = el;

        // Visszatérés a kártyás fizetésből (?fizetes=<azonosító> / megszakitva)
        const p = new URLSearchParams(window.location.search);
        const fiz = p.get("fizetes");
        if (fiz) {
            p.delete("fizetes");
            const q = p.toString();
            try { history.replaceState(null, "", window.location.pathname + (q ? "?" + q : "") + window.location.hash); } catch (e) { /* nem kritikus */ }
            AccountBilling.fizetesEredmeny(fiz, 0);
        }

        Svc.api("/api/sajat-csomag/attekintes").then(d => {
            AccountBilling.rajzol(el, d);
            AccountBilling.uzenetMutat();
        }).catch(() => {
            el.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
        });

    }

    // A kártyás fizetés eredménye (a szerver a Stripe-tól ellenőrzi).
    // Az üzenet egy percig megmarad, akkor is, ha közben újrarajzol az oldal.
    static uzenetMutat() {
        const doboz = document.getElementById("abPayResult");
        const u = AccountBilling.uzenet;
        if (!doboz) return;
        doboz.innerHTML = u ? `<div class="alert alert-${u.tipus} d-flex gap-2 align-items-start"><i class="fa-solid ${u.ikon} mt-1" aria-hidden="true"></i><div>${u.szoveg}</div></div>` : "";
    }

    static fizetesEredmeny(munkamenet, probalkozas) {
        const mutat = (tipus, ikon, szoveg) => {
            AccountBilling.uzenet = { tipus, ikon, szoveg };
            clearTimeout(AccountBilling.uzenetIdo);
            AccountBilling.uzenetIdo = setTimeout(() => { AccountBilling.uzenet = null; }, 60000);
            AccountBilling.uzenetMutat();
        };
        if (munkamenet === "megszakitva") return mutat("secondary", "fa-circle-info", I18n.t("payCancelled"));
        mutat("info", "fa-spinner fa-spin", I18n.t("payChecking"));
        Svc.api(`/api/fizetes/ellenoriz/${encodeURIComponent(munkamenet)}`).then(v => {
            if (v.statusz === "fizetve") {
                mutat("success", "fa-circle-check", I18n.f("paySuccess", { sz: Utils.escape((v.szamla && v.szamla.sorszam) || "") }));
                // a csomag / számla állapota frissüljön
                if (AccountBilling.el && document.body.contains(AccountBilling.el)) AccountBilling.render(AccountBilling.el);
            } else if (probalkozas < 6 && v.statusz === "indult") {
                setTimeout(() => AccountBilling.fizetesEredmeny(munkamenet, probalkozas + 1), 2500);
            } else {
                mutat("warning", "fa-hourglass-half", I18n.t("payPending"));
            }
        }).catch(() => mutat("warning", "fa-hourglass-half", I18n.t("payPending")));
    }

    static rajzol(el, d) {

        const esc = Utils.escape;
        const j = d.jog || {};
        const h = d.hasznalat || {};
        const ma = new Date().toISOString().slice(0, 10);

        const jogok = [];
        jogok.push(h.limit === null || h.limit === undefined
            ? I18n.f("prUsageUnlimited", { db: h.db })
            : I18n.f("prUsage", { db: h.db, limit: h.limit }));
        if (j.reklammentes) jogok.push(I18n.t("finRightAdFree"));
        if (j.pro_statisztika) jogok.push(I18n.t("finRightProStats"));
        if (j.kiemeles) jogok.push(I18n.f("finRightFeatured", { n: j.kiemeles }));

        const szazalek = h.limit ? Math.min(100, Math.round(h.db / h.limit * 100)) : 0;

        const fuggok = d.rendelesek.filter(r => r.statusz === "fizetesre_var");
        const elof = d.elofizetesek;

        const allapotBadge = s => {
            const m = {
                fizetve: ["success", "accBillPaid"], kiallitva: ["warning", "accBillOpen"], lejart: ["danger", "accBillLate"],
                sztorno: ["secondary", "accBillCancelled"]
            }[s] || ["secondary", s];
            return `<span class="badge text-bg-${m[0]}">${esc(I18n.t(m[1]))}</span>`;
        };

        const elofStatusz = e => {
            if (e.statusz === "fuggo") return `<span class="badge text-bg-warning">${I18n.t("accSubPending")}</span>`;
            if (e.vege && e.vege < ma) return `<span class="badge text-bg-secondary">${I18n.t("accSubEnded")}</span>`;
            if (e.vege) return `<span class="badge text-bg-info">${I18n.f("accSubEnds", { d: Svc.nap(e.vege) })}</span>`;
            if (e.statusz === "aktiv") return `<span class="badge text-bg-success">${I18n.t("accSubActive")}</span>`;
            return `<span class="badge text-bg-secondary">${esc(e.statusz)}</span>`;
        };

        const online = d.fizetes && d.fizetes.online;
        const fizetheto = s => online && s.tipus === "dijbekero" && ["kiallitva", "lejart"].includes(s.allapot) && Number(s.brutto) > 0;

        el.innerHTML = `
            <div id="abPayResult"></div>
            <div class="row g-4">
                <div class="col-lg-5">
                    <div class="card abPlan">
                        <div class="card-body">
                            <div class="d-flex align-items-center gap-3 mb-3">
                                <span class="kpiIcon green"><i class="fa-solid fa-receipt" aria-hidden="true"></i></span>
                                <div>
                                    <small class="text-body-secondary">${I18n.t("prYourPlan")}</small>
                                    <h5 class="mb-0">${j.csomagok ? I18n.f("prYourPlanN", { n: j.csomagok }) : I18n.t("prYourPlanFree")}</h5>
                                </div>
                            </div>
                            ${h.limit ? `
                                <div class="d-flex justify-content-between small mb-1"><span>${I18n.t("accActiveListings")}</span><b>${h.db} / ${h.limit}</b></div>
                                <div class="progress mb-3" role="progressbar" aria-valuenow="${szazalek}" aria-valuemin="0" aria-valuemax="100" style="height:8px"><div class="progress-bar ${szazalek >= 100 ? "bg-danger" : ""}" style="width:${szazalek}%"></div></div>` : ""}
                            <ul class="prList mb-3">${jogok.map(x => `<li><i class="fa-solid fa-check" aria-hidden="true"></i> ${esc(x)}</li>`).join("")}</ul>
                            ${!h.korlatok_be ? `<p class="small text-body-secondary mb-3">${I18n.t("prLimitsOff")}</p>` : ""}
                            <a class="btn btn-primary w-100" href="#csomagok"><i class="fa-solid fa-tags" aria-hidden="true"></i> ${I18n.t("accSeePackages")}</a>
                        </div>
                    </div>

                    ${d.irodak.length ? d.irodak.map(i => `
                        <div class="card mt-3">
                            <div class="card-body">
                                <div class="d-flex align-items-center gap-2 mb-2"><i class="fa-solid fa-briefcase text-body-secondary" aria-hidden="true"></i> <b>${esc(i.nev)}</b></div>
                                <div class="small">${i.limit === null ? I18n.f("prUsageUnlimited", { db: i.db }) : I18n.f("prUsage", { db: i.db, limit: i.limit })}</div>
                                <div class="small text-body-secondary">${i.csomagok ? I18n.f("prYourPlanN", { n: i.csomagok }) : I18n.t("prYourPlanFree")}</div>
                                <a class="btn btn-sm btn-outline-primary mt-2" href="#csomagok/iroda">${I18n.t("accAgencyPackages")}</a>
                            </div>
                        </div>`).join("") : ""}
                </div>

                <div class="col-lg-7">

                    ${fuggok.length ? `
                        <div class="card abPending mb-4">
                            <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> ${I18n.t("accPendingOrders")}</h5></div>
                            <div class="card-body">
                                ${fuggok.map(r => `
                                    <div class="abOrder">
                                        <div class="d-flex flex-wrap justify-content-between gap-2">
                                            <div>
                                                <b>${esc(Svc.rovidNev({ nev: r.csomag_nev || r.megnevezes, nev_ro: r.nev_ro, nev_en: r.nev_en }))}</b>
                                                ${r.iroda_nev ? `<span class="small text-body-secondary"> · ${esc(r.iroda_nev)}</span>` : ""}
                                                <div class="small text-body-secondary">${I18n.t("prProforma")}: <b>${esc(r.sorszam || "–")}</b> · ${I18n.t("prDue")}: ${esc(Svc.nap(r.esedekes))}</div>
                                            </div>
                                            <b class="fs-5">${esc(Svc.penz(r.ar, r.penznem))}</b>
                                        </div>
                                        ${online && r.szamla_id ? `<div class="d-flex flex-wrap align-items-center gap-2 mt-2">${Svc.kartyaGomb(r.szamla_id)}<span class="small text-body-secondary"><i class="fa-solid fa-lock" aria-hidden="true"></i> ${I18n.t("payCardHintShort")}</span></div>
                                        <div class="small text-body-secondary mt-2">${I18n.t("payOrTransfer")}:</div>` : ""}
                                        ${d.fizetes.revolut && r.szamla_id ? `<div class="mt-2">${Svc.revolutDoboz(d.fizetes, r.sorszam, r.ar, r.penznem, true)}</div>${online ? "" : `<div class="small text-body-secondary mt-2">${I18n.t("payOrTransfer")}:</div>`}` : ""}
                                        <div class="prPayBox compact mt-2">
                                            <div><span>${I18n.t("prBeneficiary")}</span><b>${esc(d.fizetes.kedvezmenyezett || "IngatlanPro")}</b></div>
                                            <div><span>IBAN</span><b class="${d.fizetes.iban ? "prIban" : ""}">${esc(d.fizetes.iban || I18n.t("prIbanSoon"))}</b></div>
                                            ${d.fizetes.bank ? `<div><span>${I18n.t("prBank")}</span><b>${esc(d.fizetes.bank)}</b></div>` : ""}
                                            <div><span>${I18n.t("prReference")}</span><b>${esc(r.sorszam || "")}</b></div>
                                        </div>
                                        <div class="d-flex flex-wrap gap-2 mt-2">
                                            ${r.szamla_id ? `<a class="btn btn-sm btn-outline-secondary" href="/api/sajat-csomag/szamlak/${r.szamla_id}/nyomtat" target="_blank" rel="noopener"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${I18n.t("prOpenProforma")}</a>` : ""}
                                            <button type="button" class="btn btn-sm btn-link text-danger" data-visszavon="${r.id}">${I18n.t("accCancelOrder")}</button>
                                        </div>
                                    </div>`).join("")}
                                <p class="small text-body-secondary mb-0 mt-2">${I18n.t("prAfterPay")}</p>
                            </div>
                        </div>` : ""}

                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> ${I18n.t("accSubscriptions")}</h5></div>
                        <div class="card-body">
                            ${elof.length ? `
                                <div class="table-responsive">
                                    <table class="table table-sm align-middle mb-0">
                                        <thead><tr><th>${I18n.t("accPackage")}</th><th class="text-end">${I18n.t("prAmount")}</th><th>${I18n.t("accPaidUntil")}</th><th></th><th></th></tr></thead>
                                        <tbody>
                                            ${elof.map(e => `
                                                <tr>
                                                    <td><b>${esc(Svc.rovidNev({ nev: e.csomag_nev || e.megnevezes, nev_ro: e.nev_ro, nev_en: e.nev_en }))}</b>${e.iroda_id ? `<div class="small text-body-secondary">${esc(e.ugyfel_nev)}</div>` : ""}</td>
                                                    <td class="text-end text-nowrap">${esc(Svc.penz(e.ar * (e.mennyiseg || 1), e.penznem))} <small class="text-body-secondary">/ ${esc(Svc.idoszak(e.idoszak))}</small></td>
                                                    <td class="text-nowrap">${e.fizetve_ig ? esc(Svc.nap(e.fizetve_ig)) : "–"}</td>
                                                    <td>${elofStatusz(e)}</td>
                                                    <td class="text-end">${e.statusz === "aktiv" && !e.vege ? `<button type="button" class="btn btn-sm btn-link text-danger p-0" data-lemond="${e.id}">${I18n.t("accCancelSub")}</button>` : ""}</td>
                                                </tr>`).join("")}
                                        </tbody>
                                    </table>
                                </div>` : `<p class="text-body-secondary mb-0">${I18n.t("accNoSubs")}</p>`}
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${I18n.t("accInvoices")}</h5></div>
                        <div class="card-body">
                            ${d.szamlak.length ? `
                                <div class="table-responsive">
                                    <table class="table table-sm align-middle mb-0">
                                        <thead><tr><th>${I18n.t("accDocNo")}</th><th>${I18n.t("accDocDate")}</th><th class="text-end">${I18n.t("prAmount")}</th><th></th><th></th></tr></thead>
                                        <tbody>
                                            ${d.szamlak.map(s => `
                                                <tr>
                                                    <td><b>${esc(s.sorszam)}</b><div class="small text-body-secondary text-truncate" style="max-width:260px" title="${esc(s.tetelek || "")}">${esc(s.tetelek || "")}</div>${s.kulso_szam ? `<div class="small">${I18n.t("accOfficialNo")}: ${esc(s.kulso_szam)}</div>` : ""}</td>
                                                    <td class="text-nowrap">${esc(Svc.nap(s.kiallitva))}</td>
                                                    <td class="text-end text-nowrap">${esc(Svc.penz(s.brutto, s.penznem))}</td>
                                                    <td>${allapotBadge(s.allapot)}</td>
                                                    <td class="text-end text-nowrap">
                                                        ${fizetheto(s) ? Svc.kartyaGomb(s.id, "btn-sm btn-success") : ""}
                                                        ${s.hivatalos ? `<a class="btn btn-sm btn-outline-primary" href="/api/sajat-csomag/szamlak/${s.id}/hivatalos" target="_blank" rel="noopener" title="${esc(I18n.t("payOfficialInvoice"))}"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> ${I18n.t("payInvoiceShort")}</a>` : ""}
                                                        <a class="btn btn-sm btn-outline-secondary" href="/api/sajat-csomag/szamlak/${s.id}/nyomtat" target="_blank" rel="noopener" title="${esc(I18n.t("prOpenProforma"))}"><i class="fa-solid fa-print" aria-hidden="true"></i></a>
                                                    </td>
                                                </tr>`).join("")}
                                        </tbody>
                                    </table>
                                </div>
                                <p class="small text-body-secondary mt-2 mb-0">${I18n.t("accInvoiceNote")}</p>` : `<p class="text-body-secondary mb-0">${I18n.t("accNoInvoices")}</p>`}
                        </div>
                    </div>

                </div>
            </div>`;

        Svc.kartyaKot(el);

        el.querySelectorAll("[data-lemond]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("accCancelSubConfirm"))) return;
                b.disabled = true;
                Svc.api(`/api/sajat-csomag/elofizetes/${b.dataset.lemond}/lemond`, { method: "POST" })
                    .then(v => { Utils.toast && Utils.toast(I18n.f("accCancelSubDone", { d: Svc.nap(v.vege) })); AccountBilling.render(el); })
                    .catch(e => { b.disabled = false; alert(Svc.hiba(e)); });
            };
        });

        el.querySelectorAll("[data-visszavon]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("accCancelOrderConfirm"))) return;
                b.disabled = true;
                Svc.api(`/api/sajat-csomag/rendeles/${b.dataset.visszavon}/visszavon`, { method: "POST" })
                    .then(() => AccountBilling.render(el))
                    .catch(e => { b.disabled = false; alert(Svc.hiba(e)); });
            };
        });

    }

}
