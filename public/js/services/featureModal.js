// ============================================================
//  Hirdetés kiemelése (promóció) – ablak
//
//  Megnyitható a Fiókom → Hirdetéseim kártyáról és a saját hirdetés
//  oldaláról. Mutatja: kiemelt-e most és meddig; a megvett, még fel nem
//  használt kiemeléseket (kredit); az előfizetés havi keretét; és a
//  megvehető kiemeléseket (Csomagok és árak, kategória: kiemelés) –
//  ezeket a hirdetéshez kötve rendeli meg (díjbekérő → kártyával is fizethető).
// ============================================================

class FeatureModal {

    static nyit(ingatlanId, kesz) {

        const { tartalom, modal } = Svc.modal("featureModal", "modal-lg");
        FeatureModal.modal = modal;
        FeatureModal.kesz = kesz;
        tartalom.innerHTML = `<div class="modal-body"><div class="emptyState"><div class="spinner-border text-primary"></div></div></div>`;
        modal.show();
        FeatureModal.betolt(tartalom, ingatlanId);

    }

    static betolt(tartalom, ingatlanId) {

        Svc.api(`/api/kiemeles/sajat/${Number(ingatlanId)}`)
            .then(d => FeatureModal.rajzol(tartalom, d))
            .catch(e => {
                tartalom.innerHTML = `<div class="modal-header"><h5 class="modal-title">${I18n.t("ftTitle")}</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="OK"></button></div>
                    <div class="modal-body"><div class="alert alert-danger mb-0">${Utils.escape(Svc.hiba(e, "ftErr_"))}</div></div>`;
            });

    }

    static rajzol(tartalom, d) {

        const esc = Utils.escape;
        const h = d.hirdetes;
        const most = d.kiemelt_ig && new Date(d.kiemelt_ig) > new Date();
        const aktiv = ["aktiv", "fuggo"].includes(h.statusz);
        const k = d.keret || {};
        const kr = d.kreditek || [];

        const lehetoseg = [];

        if (kr.length) {
            lehetoseg.push(`
                <div class="ftOpt">
                    <div class="ftOptIcon green"><i class="fa-solid fa-ticket" aria-hidden="true"></i></div>
                    <div class="flex-grow-1">
                        <b>${I18n.f("ftCredits", { n: kr.length })}</b>
                        <div class="small text-body-secondary">${I18n.f("ftCreditsHint", { nap: kr[0].nap })}</div>
                    </div>
                    <button type="button" class="btn btn-success" data-felhasznal="kredit" ${aktiv ? "" : "disabled"}>${I18n.f("ftUseDays", { nap: kr[0].nap })}</button>
                </div>`);
        }

        if (k.osszes) {
            lehetoseg.push(`
                <div class="ftOpt">
                    <div class="ftOptIcon blue"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i></div>
                    <div class="flex-grow-1">
                        <b>${I18n.f("ftQuota", { maradt: k.maradt, osszes: k.osszes })}</b>
                        <div class="small text-body-secondary">${I18n.f("ftQuotaHint", { nap: k.nap })}</div>
                    </div>
                    <button type="button" class="btn btn-primary" data-felhasznal="keret" ${aktiv && k.maradt > 0 ? "" : "disabled"}>${I18n.f("ftUseDays", { nap: k.nap })}</button>
                </div>`);
        }

        const termekek = (d.termekek || []).map(c => `
            <div class="ftOpt">
                <div class="ftOptIcon gold"><i class="fa-solid fa-star" aria-hidden="true"></i></div>
                <div class="flex-grow-1">
                    <b>${esc(Svc.rovidNev(c))}</b>
                    <div class="small text-body-secondary">${I18n.f("ftDays", { nap: c.nap })}${Svc.t(c, "leiras") ? " · " + esc(Svc.t(c, "leiras")) : ""}</div>
                </div>
                <div class="text-end">
                    <div class="fw-bold mb-1">${esc(Svc.penz(c.ar, c.penznem))}</div>
                    <button type="button" class="btn btn-outline-primary btn-sm" data-vesz="${c.id}" ${aktiv ? "" : "disabled"}>${I18n.t("ftBuy")}</button>
                </div>
            </div>`).join("");

        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title"><i class="fa-solid fa-star text-warning" aria-hidden="true"></i> ${I18n.t("ftTitle")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="OK"></button>
            </div>
            <div class="modal-body">
                <div class="ftHead">
                    <div class="text-truncate"><b>#${h.id} · ${esc(h.cim || Types.label(h.tipus))}</b></div>
                    ${most
                        ? `<span class="badge text-bg-warning"><i class="fa-solid fa-star" aria-hidden="true"></i> ${I18n.f("ftUntil", { d: esc(Svc.ido(d.kiemelt_ig)) })}</span>`
                        : `<span class="badge text-bg-light">${I18n.t("ftNotNow")}</span>`}
                </div>
                <p class="small text-body-secondary">${I18n.t("ftExplain")}</p>
                ${aktiv ? "" : `<div class="alert alert-warning small">${I18n.t("ftErr_listing_not_active")}</div>`}
                ${lehetoseg.length ? `<h6 class="mt-3">${I18n.t("ftYouHave")}</h6>${lehetoseg.join("")}` : ""}
                ${termekek ? `<h6 class="mt-3">${I18n.t("ftBuyTitle")}</h6>${termekek}
                    <p class="small text-body-secondary mt-2 mb-0"><i class="fa-solid fa-credit-card" aria-hidden="true"></i> ${I18n.t("ftBuyHint")}</p>` : (lehetoseg.length ? "" : `<p class="text-body-secondary">${I18n.t("ftNothing")}</p>`)}
                ${most ? `<p class="small text-body-secondary mt-3 mb-0">${I18n.t("ftExtendHint")}</p>` : ""}
                <div class="alert alert-danger mt-3" id="ftHiba" hidden></div>
            </div>`;

        tartalom.querySelectorAll("[data-felhasznal]").forEach(b => {
            b.onclick = () => {
                b.disabled = true;
                Svc.api(`/api/kiemeles/sajat/${h.id}/felhasznal`, { method: "POST", body: { mibol: b.dataset.felhasznal } })
                    .then(v => {
                        Utils.toast && Utils.toast(I18n.f("ftDone", { d: Svc.ido(v.vege) }));
                        if (window.DataManager && DataManager.init) DataManager.init();
                        if (typeof FeatureModal.kesz === "function") FeatureModal.kesz();
                        FeatureModal.betolt(tartalom, h.id);
                    })
                    .catch(e => {
                        b.disabled = false;
                        const he = tartalom.querySelector("#ftHiba");
                        he.textContent = Svc.hiba(e, "ftErr_");
                        he.hidden = false;
                    });
            };
        });

        tartalom.querySelectorAll("[data-vesz]").forEach(b => {
            b.onclick = () => {
                const c = (d.termekek || []).find(x => x.id === Number(b.dataset.vesz));
                if (!c) return;
                FeatureModal.modal.hide();
                setTimeout(() => PricingPage.rendeles(c, { ingatlanId: h.id }), 250);
            };
        });

    }

}
