// ============================================================
//  Ingatlan értékbecslő oldal
// ============================================================

class ValuationManager {

    static last = null;
    static excludeId = null;

    static renderTypeOptions() {

        const sel = document.getElementById("valTipus");
        const v = sel.value || "lakas";

        sel.innerHTML = Types.LIST
            .filter(t => t.key !== "telek")
            .map(t => `<option value="${t.key}">${I18n.t(t.label)}</option>`).join("");

        sel.value = v;

    }

    static init() {

        ValuationManager.renderTypeOptions();

        document.getElementById("btnValuate").onclick = () => ValuationManager.run();

        document.querySelectorAll("#page-valuation input").forEach(input => {
            input.addEventListener("keydown", e => {
                if (e.key === "Enter") ValuationManager.run();
            });
        });

        // Kézi módosítás után már nem egy konkrét ingatlanról van szó
        document.querySelectorAll("#page-valuation input:not(#valAskingPrice), #page-valuation select").forEach(el => {
            el.addEventListener("change", () => { ValuationManager.excludeId = null; });
        });

    }

    static showIntroIfEmpty() {

        const box = document.getElementById("valResult");

        if (box.innerHTML.trim() !== "") return;

        ValuationManager.renderIntro();

    }

    static renderIntro() {

        document.getElementById("valResult").innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5><i class="fa-solid fa-circle-question"></i> ${I18n.t("valHowTitle")}</h5>
                    <ol class="howList">
                        <li>${I18n.t("valHow1")}</li>
                        <li>${I18n.t("valHow2")}</li>
                        <li>${I18n.t("valHow3")}</li>
                        <li>${I18n.t("valHow4")}</li>
                    </ol>
                    <p class="sectionNote mb-0">${I18n.t("valDisclaimer")}</p>
                </div>
            </div>`;

    }

    // Egy meglévő ingatlan adataival tölti ki az űrlapot
    static prefill(i) {

        const valVaros = document.getElementById("valVaros");
        CityManager.fillCitySelect(valVaros, i.varos || DataManager.currentCity);

        document.getElementById("valTipus").value = i.tipus && i.tipus !== "telek" ? i.tipus : "lakas";
        document.getElementById(i.ugylet === "kiado" ? "valUgyletKiado" : "valUgyletElado").checked = true;

        document.getElementById("valNm").value = i.nm || "";
        document.getElementById("valSzobak").value = i.szobak || "";

        const e = Utils.emeletSzam(i.emelet);
        document.getElementById("valEmelet").value = e === null ? "" : e;

        document.getElementById("valAllapot").value = Utils.normAllapot(i.allapot);
        document.getElementById("valAskingPrice").value = i.ar || "";

        ValuationManager.excludeId = i.id;

        return CityManager.loadKeruletekInto("valKerulet", valVaros.value, i.kerulet || "", "allapotMindegy");

    }

    static run() {

        const params = {
            tipus: document.getElementById("valTipus").value,
            ugylet: document.querySelector('input[name="valUgylet"]:checked').value,
            varos: document.getElementById("valVaros").value,
            kerulet: document.getElementById("valKerulet").value,
            nm: document.getElementById("valNm").value,
            szobak: document.getElementById("valSzobak").value,
            emelet: document.getElementById("valEmelet").value,
            allapot: document.getElementById("valAllapot").value
        };

        if (!(Number(params.nm) > 0)) {
            alert(I18n.t("valAlertNm"));
            return;
        }

        // Ha egy meglévő ingatlanra kértük a becslést, saját magát ne vegye hasonlónak
        if (ValuationManager.excludeId) {
            params.exclude = ValuationManager.excludeId;
        }

        const box = document.getElementById("valResult");
        box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        fetch("/api/valuation?" + new URLSearchParams(params).toString())
            .then(r => r.json())
            .then(data => {

                if (data.error) {
                    box.innerHTML = `
                        <div class="alert alert-warning">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            ${data.error === "not_enough_data" ? I18n.t("valNotEnough") : I18n.t("valAlertNm")}
                        </div>`;
                    return;
                }

                ValuationManager.last = { params, data };
                ValuationManager.render(params, data);

            })
            .catch(err => {
                console.error(err);
                box.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
            });

    }

    static rerender() {
        if (ValuationManager.last) {
            ValuationManager.render(ValuationManager.last.params, ValuationManager.last.data);
        } else if (document.getElementById("valResult").innerHTML.trim() !== "") {
            ValuationManager.renderIntro();
        }
    }

    static render(params, d) {

        const conf = {
            high: ["success", "valConfHigh"],
            medium: ["warning", "valConfMedium"],
            low: ["danger", "valConfLow"]
        }[d.confidence];

        // Kért ár összevetése
        const kert = Number(document.getElementById("valAskingPrice").value);
        let kertHtml = "";

        if (kert > 0) {

            const elteres = (kert / d.estimate - 1) * 100;
            let kulcs = "valAskFair";
            let cls = "average";

            if (kert > d.high) { kulcs = "valAskHigh"; cls = "above"; }
            else if (kert < d.low) { kulcs = "valAskLow"; cls = "below"; }

            kertHtml = `
                <div class="askBox ${cls}">
                    <span>${I18n.t("valAskingPrice").replace(/\s*\(.*\)/, "")}: <b>${Utils.eur(kert)}</b></span>
                    <span class="diffBadge ${cls}">${Utils.pct(elteres, 0)}</span>
                    <span>${I18n.t(kulcs)}</span>
                </div>`;

        }

        // Sáv vizualizáció
        const sMin = Math.min(d.low, kert > 0 ? kert : d.low) * 0.9;
        const sMax = Math.max(d.high, kert > 0 ? kert : d.high) * 1.1;
        const pos = v => ((v - sMin) / (sMax - sMin) * 100).toFixed(1);

        const sav = `
            <div class="rangeBar">
                <div class="rangeFill" style="left:${pos(d.low)}%;width:${(pos(d.high) - pos(d.low)).toFixed(1)}%"></div>
                <div class="rangeMark est" style="left:${pos(d.estimate)}%" title="${Utils.eur(d.estimate)}"></div>
                ${kert > 0 ? `<div class="rangeMark ask" style="left:${pos(kert)}%" title="${Utils.eur(kert)}"></div>` : ""}
            </div>
            <div class="d-flex justify-content-between small text-body-secondary">
                <span>${Utils.eur(d.low)}</span>
                <span>${Utils.eur(d.high)}</span>
            </div>`;

        // Piaci háttér
        const hatter = [
            `${I18n.t("valCityAvg")}: <b>${Utils.eurNm(d.cityAvgArNm)}</b>`,
            d.districtAvgArNm ? `${I18n.t("valDistrictAvg")}: <b>${Utils.eurNm(d.districtAvgArNm)}</b> (${d.districtCount} ${I18n.t("pcsWord")})` : null,
            `${I18n.t("valPool")}: <b>${d.poolCount}</b>`
        ].filter(Boolean).map(x => `<li>${x}</li>`).join("");

        // Hasonló ingatlanok
        const sorok = d.comparables.map(c => `
            <tr class="${c.id === ValuationManager.excludeId ? "table-primary" : ""}">
                <td>
                    <div class="simBar"><span style="width:${c.similarity}%"></span></div>
                    <small>${c.similarity}%</small>
                </td>
                <td>#${c.id}</td>
                <td class="text-end fw-semibold">${Utils.eur(c.ar)}</td>
                <td class="text-end">${Utils.num(c.nm)} m²</td>
                <td class="text-end">${Utils.eurNm(c.arNm)}</td>
                <td class="text-center">${c.szobak || "-"}</td>
                <td>${Utils.escape(c.emelet || "-")}</td>
                <td>${Utils.escape(Utils.allapotLabel(c.allapot))}</td>
                <td>${Utils.escape(c.kerulet || "-")}</td>
                <td>${c.link && Sources.fromLink(c.link) !== "other" && Sources.fromLink(c.link) !== "local"
                        ? `<a href="${Utils.escape(c.link)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>`
                        : ""}</td>
            </tr>`).join("");

        document.getElementById("valResult").innerHTML = `

            <div class="card valCard mb-4">
                <div class="card-body">

                    <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
                        <div>
                            <small class="text-body-secondary">${I18n.t("valEstimate")}</small>
                            <div class="valEstimate">${Utils.price({ ar: d.estimate, ugylet: params.ugylet })}</div>
                            <div class="text-body-secondary">≈ ${Utils.eurNm(d.arNm)} · ${Utils.num(params.nm)} m²</div>
                        </div>
                        <span class="badge text-bg-${conf[0]} fs-6">${I18n.t(conf[1])}</span>
                    </div>

                    <div class="mt-4">
                        <small class="text-body-secondary">${I18n.t("valRange")}</small>
                        ${sav}
                    </div>

                    ${kertHtml}

                    <hr>

                    <div class="row g-3">
                        <div class="col-md-6">
                            <h6>${I18n.t("valContext")}</h6>
                            <ul class="small mb-0">${hatter}</ul>
                        </div>
                        <div class="col-md-6">
                            <h6>${I18n.t("valHowTitle")}</h6>
                            <p class="small text-body-secondary mb-0">${I18n.f("valMethod", { n: d.comparables.length })}</p>
                        </div>
                    </div>

                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h5 class="mb-0"><i class="fa-solid fa-list-check"></i> ${I18n.t("valComparables")}</h5>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-sm statTable align-middle mb-0">
                            <thead>
                                <tr>
                                    <th>${I18n.t("valSimilarity")}</th>
                                    <th>#</th>
                                    <th class="text-end">${I18n.t("colAr")}</th>
                                    <th class="text-end">${I18n.t("colNm")}</th>
                                    <th class="text-end">${I18n.t("colArNm")}</th>
                                    <th class="text-center">${I18n.t("colSzoba")}</th>
                                    <th>${I18n.t("colEmelet")}</th>
                                    <th>${I18n.t("colAllapot")}</th>
                                    <th>${I18n.t("colKerulet")}</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>${sorok}</tbody>
                        </table>
                    </div>
                    <p class="sectionNote mt-3 mb-0">${I18n.t("valDisclaimer")}</p>
                </div>
            </div>`;

    }

}
