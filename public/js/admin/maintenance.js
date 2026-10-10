// ============================================================
//  Admin – Karbantartás (Beolvasás → Karbantartás)
//
//  Az időnként kézzel indítható, háttérben futó eszközök egy helyen
//  (korábban az Áttekintés "Gyors műveletek" listájában voltak):
//   - Automatikus javítás: a hirdetések szövegéből kitölti a hiányzó
//     adatokat, és ellenőrzi a helyeket (utca, kerület, falu)
//   - Meglévő hirdetések ellenőrzése a forrásoldalon (ár, elérhetőség)
//   - Az értékbecslő pontossága a valós adatokon
// ============================================================

AdminManager.renderMaintenance = function () {

    AdminManager.loading();

    AdminManager.refreshPendingCount().then(() => {

        const c = AdminManager.counts || {};

        const eszkoz = (id, icon, cim, leiras, gomb, extra = "") => `
            <div class="card mb-4 toolCard">
                <div class="card-body">
                    <div class="d-flex flex-wrap align-items-start gap-3">
                        <span class="kpiIcon blue"><i class="${icon}" aria-hidden="true"></i></span>
                        <div class="flex-fill" style="min-width:220px">
                            <h5 class="mb-1">${cim}</h5>
                            <p class="sectionNote mb-0">${leiras}</p>
                            ${extra}
                        </div>
                        ${gomb}
                    </div>
                    <div id="${id}Status" class="mt-3" aria-live="polite"></div>
                </div>
            </div>`;

        AdminManager.box().innerHTML = `
            ${eszkoz("mtAutofix", "fa-solid fa-wand-magic-sparkles", I18n.t("autofixTitle"), I18n.t("autofixDesc") + " " + I18n.t("mtAutofixPlaces"),
                `<button class="btn btn-primary text-nowrap" id="mtAutofix"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ${I18n.t("autofixBtn")}</button>`,
                `<p class="small mt-2 mb-0"><a href="#admin/helyek" data-go-tab="helyek"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> ${I18n.t("mtSeeMoved")}</a></p>`)}

            ${eszkoz("mtRecheck", "fa-solid fa-satellite-dish", I18n.t("recheckTitle"), I18n.t("recheckNote"),
                `<button class="btn btn-outline-primary text-nowrap" id="mtRecheck"><i class="fa-solid fa-play" aria-hidden="true"></i> ${I18n.t("recheckBtn")}</button>`,
                `<p class="small text-body-secondary mt-2 mb-0">${I18n.t("ovLastCheck")}: ${c.utolso_ellenorzes ? Utils.ago(c.utolso_ellenorzes) : I18n.t("ovNever")}</p>`)}

            ${eszkoz("mtValTest", "fa-solid fa-bullseye", I18n.t("valTestTitle"), I18n.t("valTestSub"),
                `<button class="btn btn-outline-primary text-nowrap" id="mtValTest"><i class="fa-solid fa-bullseye" aria-hidden="true"></i> ${I18n.t("valTestBtn")}</button>`)}`;

        const box = AdminManager.box();
        box.querySelectorAll("[data-go-tab]").forEach(a => a.onclick = e => { e.preventDefault(); AdminManager.open(a.dataset.goTab); });

        document.getElementById("mtAutofix").onclick = () => {
            document.getElementById("mtAutofix").disabled = true;
            fetch("/api/admin/autofix", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mind: true })
            }).then(() => AdminManager.pollAutofix("mtAutofixStatus", "mtAutofix"));
        };

        // Ha éppen fut (pl. a telepítés utáni első indításkor), mutatjuk
        fetch("/api/admin/autofix").then(r => r.json()).then(v => {
            if (v.allapot === "fut" || v.allapot === "indul") AdminManager.pollAutofix("mtAutofixStatus", "mtAutofix");
        }).catch(() => { });

        document.getElementById("mtRecheck").onclick = () => {
            fetch("/api/admin/recheck", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ limit: 500 })
            })
                .then(r => r.json())
                .then(v => AdminManager.pollJob(v.jobId, "mtRecheckStatus"));
        };

        document.getElementById("mtValTest").onclick = () => AdminManager.valuationTest("mtValTestStatus");

    });

};

// Értékbecslő pontossága a valós adatokon (az első, az előző és a mostani módszer)
AdminManager.valuationTest = function (boxId) {

    const box = document.getElementById(boxId);
    const q = new URLSearchParams({ varos: DataManager.currentCity, tipus: FilterManager.tipus, ugylet: FilterManager.ugylet });
    box.innerHTML = `<div class="spinner-border spinner-border-sm text-primary"></div>`;

    fetch("/api/admin/ertekbecslo-teszt?" + q).then(r => r.json()).then(v => {
        if (v.error) { box.innerHTML = `<div class="alert alert-warning">${I18n.t("valNotEnough")}</div>`; return; }
        const e = v.eredmeny || {};
        const modszerek = [["regi", "valTestFirst"], ["elozo", "valTestPrev"], ["uj", "valTestNew"]].filter(([k]) => e[k]);
        const cella = (o, vastag) => o
            ? `<td class="text-end ${vastag ? "fw-semibold" : ""}">${o.medianHiba} %</td><td class="text-end ${vastag ? "fw-semibold" : ""}">${o.atlagHiba} %</td><td class="text-end ${vastag ? "fw-semibold" : ""}">${o.tizSzazalekonBelul} %</td>`
            : `<td colspan="3"></td>`;
        const sor = (l, g) => g ? `<tr><td>${l}${g.uj && g.uj.n !== undefined ? ` <small class="text-body-secondary">(${g.uj.n})</small>` : ""}</td>${modszerek.map(([k]) => cella(g[k], k === "uj")).join("")}</tr>` : "";
        const cs = v.csoportok || {};
        const st = v.stabilitas || {};
        box.innerHTML = `
            <h6>${I18n.t("valTestTitle")} – ${Utils.escape(CityManager.displayName(v.varos))} · ${Types.label(v.tipus)} (${v.hirdetesek} ${I18n.t("pcsWord")})</h6>
            <p class="sectionNote">${I18n.t("valTestNote")}</p>
            <div class="table-responsive"><table class="table table-sm statTable mb-0">
                <thead><tr><th></th>${modszerek.map(([, l]) => `<th class="text-end" colspan="3">${I18n.t(l)}</th>`).join("")}</tr>
                <tr><th></th>${modszerek.map(() => `<th class="text-end">${I18n.t("valTestMedian")}</th><th class="text-end">${I18n.t("valTestMean")}</th><th class="text-end">${I18n.t("valTestWithin")}</th>`).join("")}</tr></thead>
                <tbody>
                    ${sor(I18n.t("valTestAll"), e)}
                    ${sor(I18n.t("valTestExisting"), cs.meglevo)}
                    ${sor(I18n.t("valTestNewBuild"), cs.ujepitesu)}
                    ${sor(I18n.t("valTestRare"), cs.ritka)}
                    ${sor(I18n.t("valTestCommon"), cs.gyakori)}
                </tbody>
            </table></div>
            ${st.uj ? `<p class="small mt-3 mb-0"><i class="fa-solid fa-ruler-combined" aria-hidden="true"></i> ${I18n.f("valTestStability", {
                elozo: Utils.num(st.elozo ? st.elozo.atlag : 0, 2), elozoMax: Utils.num(st.elozo ? st.elozo.max : 0, 1),
                uj: Utils.num(st.uj.atlag, 2), ujMax: Utils.num(st.uj.max, 1)
            })}</p>` : ""}`;
    }).catch(() => { box.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`; });

};

// Az automatikus javítás állapota (másodpercenként frissül, amíg fut)
AdminManager.pollAutofix = function (boxId = "mtAutofixStatus", btnId = "mtAutofix") {

    const box = document.getElementById(boxId);
    if (!box) return;

    fetch("/api/admin/autofix").then(r => r.json()).then(v => {

        const fut = v.allapot === "fut" || v.allapot === "indul";
        const pct = v.osszes ? Math.round(v.kesz / v.osszes * 100) : 0;

        const mezok = Object.entries(v.mezok || {})
            .filter(([k]) => !["hely_pontossag", "y", "hely_eredeti", "hely_ok"].includes(k))
            .map(([k, n]) => `<span class="badge text-bg-light">${I18n.t("field_" + (k === "x" ? "hely" : k))}: ${n}</span>`).join(" ");

        box.innerHTML = `
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                <span class="small text-body-secondary">${fut ? I18n.f("autofixRunning", { kesz: v.kesz, osszes: v.osszes }) : ""}</span>
            </div>
            ${fut ? `<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:${pct}%"></div></div>
                     <p class="small text-body-secondary mt-2 mb-0">${I18n.t("autofixSlow")}</p>` : ""}
            ${v.allapot === "kesz" ? `<p class="mb-2">${I18n.f("autofixDone", { javitott: v.javitott, elotte: v.elotte, utana: v.utana })}</p><div class="d-flex flex-wrap gap-1">${mezok}</div>` : ""}
            ${v.allapot === "hiba" ? `<div class="alert alert-danger small mb-0">${Utils.escape(v.utolsoHiba || "")}</div>` : ""}`;

        if (fut) {
            setTimeout(() => AdminManager.pollAutofix(boxId, btnId), 1500);
        } else {
            const b = document.getElementById(btnId);
            if (b) b.disabled = false;
            AdminManager.refreshPendingCount();
        }

    }).catch(() => { });

};
