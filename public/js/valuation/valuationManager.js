// ============================================================
//  Ingatlan értékbecslő oldal
//
//  Ha egy hirdetésről indul ("Értékbecslés erre"), a becslés ahhoz a
//  hirdetéshez kötött: a hirdetés saját ára (és a más oldalon lévő
//  példánya) akkor sem számít bele, ha közben átírod a méretet, az
//  állapotot... A kötés csak akkor szűnik meg, ha másik várost, típust,
//  ügyletet választasz, vagy a × gombbal leveszed.
// ============================================================

class ValuationManager {

    static last = null;
    static excludeId = null;
    static linked = null;           // { id, x, y, hely_pontossag, kerulet, telepules }

    static renderTypeOptions() {

        const sel = document.getElementById("valTipus");
        const v = sel.value || "lakas";

        sel.innerHTML = Types.LIST
            .filter(t => Types.becsulheto(t.key))
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

        // Másik város, típus vagy ügylet: már nem ugyanarról az ingatlanról van szó.
        // (A méret, állapot... átírása után a hirdetés saját ára továbbra sem számít bele.)
        document.getElementById("valVaros").addEventListener("change", () => {
            ValuationManager.unlink();
            ValuationManager.applyLocationFields();
        });
        document.getElementById("valTipus").addEventListener("change", () => ValuationManager.unlink());
        document.querySelectorAll('input[name="valUgylet"]').forEach(r => r.addEventListener("change", () => ValuationManager.unlink()));

        ValuationManager.applyLocationFields();
        ValuationManager.renderLinked();

    }

    // A "<város> és környéke" városban kerület helyett a falu (település) számít
    static applyLocationFields() {

        const varos = document.getElementById("valVaros").value;
        const kornyek = typeof CityManager !== "undefined" && CityManager.isKornyek(varos);

        const ker = document.getElementById("valKeruletBox");
        const tel = document.getElementById("valTelepulesBox");
        if (ker) ker.hidden = kornyek;
        if (tel) tel.hidden = !kornyek;

        const dl = document.getElementById("valTelepulesLista");
        if (dl && kornyek) {
            const regio = CityManager.parentOf(varos);
            dl.innerHTML = Telepulesek.regio(regio).map(t => `<option value="${Utils.escape(I18n.current === "hu" ? t.hu : t.ro)}">`).join("");
        }

    }

    static link(i) {
        ValuationManager.excludeId = i.id;
        ValuationManager.linked = {
            id: i.id,
            x: i.x || null,
            y: i.y || null,
            hely_pontossag: i.hely_pontossag || null,
            kerulet: i.kerulet || "",
            telepules: i.telepules || ""
        };
        ValuationManager.renderLinked();
    }

    static unlink() {
        if (!ValuationManager.excludeId && !ValuationManager.linked) return;
        ValuationManager.excludeId = null;
        ValuationManager.linked = null;
        ValuationManager.renderLinked();
    }

    // "A #69 hirdetés becslése – a saját ára nem számít bele  ×"
    static renderLinked() {

        const box = document.getElementById("valLinked");
        if (!box) return;

        const l = ValuationManager.linked;
        box.hidden = !l;
        if (!l) { box.innerHTML = ""; return; }

        box.innerHTML = `
            <i class="fa-solid fa-link" aria-hidden="true"></i>
            <div class="flex-fill">
                <b>${I18n.f("valLinkedTo", { id: l.id })}</b>
                <small>${I18n.t("valLinkedHelp")}</small>
            </div>
            <button type="button" class="btn-close" id="valUnlink" title="${Utils.escape(I18n.t("valUnlink"))}" aria-label="${Utils.escape(I18n.t("valUnlink"))}"></button>`;

        document.getElementById("valUnlink").onclick = () => ValuationManager.unlink();

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
            </div>
            ${typeof AdSlots !== "undefined" ? AdSlots.slot("valuation", "mt-4") : ""}`;

        if (typeof AdSlots !== "undefined") AdSlots.bind(document.getElementById("valResult"));

    }

    // Egy meglévő ingatlan adataival tölti ki az űrlapot
    static prefill(i) {

        const valVaros = document.getElementById("valVaros");
        CityManager.fillCitySelect(valVaros, i.varos || DataManager.currentCity);

        document.getElementById("valTipus").value = Types.becsulheto(i.tipus) ? i.tipus : "lakas";
        document.getElementById(i.ugylet === "kiado" ? "valUgyletKiado" : "valUgyletElado").checked = true;

        // A pontos alapterület (48,8 m² is) – magyarul, románul tizedes vesszővel
        const nm = i.nm ? String(Math.round(Number(i.nm) * 100) / 100) : "";
        document.getElementById("valNm").value = I18n.current === "en" ? nm : nm.replace(".", ",");
        document.getElementById("valSzobak").value = i.szobak || "";

        const e = Utils.emeletSzam(i.emelet);
        document.getElementById("valEmelet").value = e === null ? "" : e;
        const ossz = parseInt(String(i.emelet || "").split("/")[1], 10);
        document.getElementById("valEmeletOssz").value = isNaN(ossz) ? "" : ossz;

        document.getElementById("valAllapot").value = Utils.normAllapot(i.allapot);
        document.getElementById("valAskingPrice").value = i.ar || "";

        const ev = document.getElementById("valEvszam");
        if (ev) ev.value = i.evszam || "";

        const tel = document.getElementById("valTelepules");
        if (tel) tel.value = i.telepules ? CityManager.telepulesLabel(i.telepules) : "";

        ValuationManager.applyLocationFields();
        ValuationManager.link(i);

        return CityManager.loadKeruletekInto("valKerulet", valVaros.value, i.kerulet || "", "allapotMindegy");

    }

    static params() {

        const v = id => { const el = document.getElementById(id); return el ? el.value : ""; };
        const varos = v("valVaros");
        const kornyek = CityManager.isKornyek(varos);

        const params = {
            tipus: v("valTipus"),
            ugylet: document.querySelector('input[name="valUgylet"]:checked').value,
            varos,
            kerulet: kornyek ? "" : v("valKerulet"),
            nm: String(v("valNm")).replace(",", "."),
            szobak: v("valSzobak"),
            emelet: v("valEmelet"),
            emeletOssz: v("valEmeletOssz"),
            allapot: v("valAllapot"),
            evszam: v("valEvszam")
        };

        if (kornyek) params.telepules = NewPropertyManager.telepulesErtek(v("valTelepules").trim());

        // Egy konkrét hirdetés becslése: a saját ára nem számít bele; ha a helye nem
        // változott, a pontos helyét is figyelembe vesszük (a közelebbi hasonlóbb)
        const l = ValuationManager.linked;
        if (ValuationManager.excludeId) params.exclude = ValuationManager.excludeId;
        if (l && l.x && l.y && (kornyek ? (params.telepules || "") === (l.telepules || "") : params.kerulet === (l.kerulet || ""))) {
            params.x = l.x;
            params.y = l.y;
            if (l.hely_pontossag) params.hely_pontossag = l.hely_pontossag;
        }

        // Üres mezőket nem küldünk
        Object.keys(params).forEach(k => { if (params[k] === "" || params[k] === null || params[k] === undefined) delete params[k]; });

        return params;

    }

    static run(masodszor) {

        const params = ValuationManager.params();

        if (!(Number(params.nm) > 0)) {
            alert(I18n.t("valAlertNm"));
            return;
        }

        // A becsléshez be kell jelentkezni (mint a hirdetésfeladáshoz): a belépő
        // ablak, utána magától lefut – a kitöltött adatok megmaradnak
        if (!AuthManager.loggedIn()) {
            AuthManager.kell().then(() => ValuationManager.run()).catch(() => { });
            return;
        }

        const box = document.getElementById("valResult");
        box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        fetch("/api/valuation?" + new URLSearchParams(params).toString())
            .then(r => r.json().then(data => ({ status: r.status, data })))
            .then(({ status, data }) => {

                // Lejárt a belépés: újra belépés, utána még egyszer
                if (status === 401) {
                    ValuationManager.renderIntro();
                    if (masodszor) return;
                    AuthManager.refresh()
                        .then(() => AuthManager.kell())
                        .then(() => ValuationManager.run(true))
                        .catch(() => { });
                    return;
                }

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
        ValuationManager.renderLinked();
        ValuationManager.applyLocationFields();
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
        }[d.confidence] || ["secondary", "valConfMedium"];

        const nm = d.nm || Number(params.nm);

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

        // Piaci háttér: mediánok (a kilógó árak nem húzzák el), a keresett ingatlan szegmensében
        const uj = d.segment === "uj";
        const helyNev = d.helySzerint === "telepules" ? I18n.t("valVillageMedian") : I18n.t(uj ? "valDistrictMedianNew" : "valDistrictMedianOld");
        const hatter = [
            `${I18n.t(uj ? "valCityMedianNew" : "valCityMedianOld")}: <b>${Utils.eurNm(d.cityMedianArNm || d.cityAvgArNm)}</b>`,
            (d.districtMedianArNm || d.districtAvgArNm) ? `${helyNev}: <b>${Utils.eurNm(d.districtMedianArNm || d.districtAvgArNm)}</b> (${d.districtCount} ${I18n.t("pcsWord")})` : null,
            `${I18n.t("valPool")}: <b>${d.poolCount}</b>`
        ].filter(Boolean).map(x => `<li>${x}</li>`).join("");

        // Új építésű / meglévő: külön piac (az újépítésűek nem húzzák fel a régi lakások becslését)
        let szegmensHtml = "";
        if (d.version >= 3) {
            if (uj) {
                szegmensHtml = `<div class="valSegment uj"><i class="fa-solid fa-helmet-safety" aria-hidden="true"></i> <span>${I18n.f("valSegmentNew", { n: d.segmentCount })}</span></div>`;
            } else if (d.districtOtherCount > 0 && d.districtOtherMedianArNm) {
                szegmensHtml = `<div class="valSegment"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> <span>${I18n.f(d.helySzerint === "telepules" ? "valSegmentOldVillage" : "valSegmentOld", { n: d.districtOtherCount, ar: Utils.eurNm(d.districtOtherMedianArNm) })}</span></div>`;
            }
        }

        const linkHtml = d.excluded && d.excluded.id
            ? `<div class="small text-body-secondary mt-1"><i class="fa-solid fa-link" aria-hidden="true"></i> ${I18n.f(d.excluded.ikrek ? "valExcludedTwins" : "valExcluded", { id: d.excluded.id, n: d.excluded.ikrek })}</div>`
            : "";

        // Hasonló ingatlanok (a 4. változatban alapból nincs átszámítás: az eredeti €/m² számít)
        const atszamolt = !(d.method && d.method.kind === "comparables" && d.method.converted === false);
        const sorok = d.comparables.map(c => `
            <tr class="${c.id === ValuationManager.excludeId ? "table-primary" : ""}">
                <td title="${Utils.escape(ValuationManager.hasonlosagCim(c))}">
                    <div class="simBar"><span style="width:${c.similarity}%"></span></div>
                    <small>${c.similarity}%</small>${c.weight !== undefined ? `<small class="d-block text-body-secondary" title="${Utils.escape(I18n.t("valWeightHelp"))}">${I18n.f("valWeight", { pct: Utils.num(c.weight, 1) })}</small>` : ""}
                </td>
                <td><a href="#listing/${Number(c.id)}" class="text-reset">#${c.id}</a>${c.uj ? ` <span class="badge text-bg-info valNewBadge" title="${Utils.escape(I18n.t("valNewBuildHint"))}">${I18n.t("valNewBuild")}</span>` : ""}</td>
                <td class="text-end fw-semibold">${Utils.eur(c.ar)}</td>
                <td class="text-end">${Utils.nm(c.nm)}</td>
                <td class="text-end">${Utils.eurNm(c.arNm)}</td>
                ${atszamolt ? `<td class="text-end text-body-secondary" title="${Utils.escape(ValuationManager.atszamitasCim(c))}">${c.adjusted ? Utils.eur(c.adjusted) : "-"}${c.adjustedArNm ? `<small class="d-block">${Utils.eurNm(c.adjustedArNm)}</small>` : ""}</td>` : ""}
                <td class="text-center">${c.szobak || "-"}</td>
                <td>${Utils.escape(c.emelet || "-")}</td>
                <td>${Utils.escape(Utils.allapotLabel(c.allapot))}</td>
                <td>${Utils.escape(CityManager.helyReszLabel({ ...c, varos: params.varos, tipus: params.tipus }) || "-")}</td>
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
                            <div class="text-body-secondary">≈ ${Utils.eurNm(d.arNm)} · ${Utils.nm(nm)}</div>
                            ${linkHtml}
                        </div>
                        <span class="badge text-bg-${conf[0]} fs-6">${I18n.t(conf[1])}</span>
                    </div>

                    <div class="mt-4">
                        <small class="text-body-secondary">${I18n.t("valRange")}</small>
                        ${sav}
                    </div>

                    ${kertHtml}

                    ${szegmensHtml}

                    <hr>

                    <div class="row g-3">
                        <div class="col-md-6">
                            <h6>${I18n.t("valContext")}</h6>
                            <ul class="small mb-0">${hatter}</ul>
                        </div>
                        <div class="col-md-6">
                            <h6>${I18n.t("valHowTitle")}</h6>
                            ${ValuationManager.methodHtml(d, params)}
                        </div>
                    </div>

                </div>
            </div>

            ${typeof AdSlots !== "undefined" ? AdSlots.slot("valuation", "mb-4") : ""}

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
                                    ${atszamolt ? `<th class="text-end" title="${Utils.escape(I18n.t("valAdjustedHelp"))}">${I18n.t("valAdjusted")}</th>` : ""}
                                    <th class="text-center">${I18n.t("colSzoba")}</th>
                                    <th>${I18n.t("colEmelet")}</th>
                                    <th>${I18n.t("colAllapot")}</th>
                                    <th>${I18n.t(d.helySzerint === "telepules" ? "telepulesLabel" : "colKerulet")}</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>${sorok}</tbody>
                        </table>
                    </div>
                    <p class="sectionNote mt-3 mb-0">${I18n.t("valDisclaimer")}</p>
                </div>
            </div>`;

        if (typeof AdSlots !== "undefined") AdSlots.bind(document.getElementById("valResult"));

    }

    // Miből jön a hasonlóság (a cella címe): méret, kerület, állapot...
    static hasonlosagCim(c) {
        if (!c.simParts) return "";
        return Object.entries(c.simParts).map(([k, v]) => `${I18n.t("valSim_" + k)}: ${v} %`).join("\n");
    }

    // Az átszámítás részletei egy hasonló hirdetésnél (a cella címe)
    static atszamitasCim(c) {
        if (c.adjDistrict === undefined) return I18n.t("valAdjustedHelp");
        const p = v => (v > 0 ? "+" : "") + Utils.num(v, 1) + " %";
        return I18n.t("valAdjustedHelp") + "\n" + I18n.f("valAdjParts", { ker: p(c.adjDistrict), mas: p(c.adjOther) });
    }

    // Hogyan jött ki a becslés (4. változat: a hasonlók átszámolt €/m²-e)
    static methodHtml4(d, params) {
        const m = d.method;
        const p = v => (v > 0 ? "+" : "") + Utils.num(v, 0) + " %";
        const kerek = (m.districtRatios || []).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 5)
            .map(x => `${Utils.escape(CityManager.keruletLabel(x.hely, params.varos) || x.hely)} <b class="${x.pct >= 0 ? "text-success" : "text-danger"}">${p(x.pct)}</b>`).join(", ");
        return `
            <ul class="small mb-2 valMethodList">
                <li>${I18n.f("valM4Used", { n: m.used, sim: m.avgSimilarity })}${m.dropped ? ` <span class="text-body-secondary">${I18n.f("valM4Dropped", { n: m.dropped })}</span>` : ""}</li>
                <li>${I18n.f(m.converted === false ? "valM4WeightedRaw" : "valM4Weighted", { arnm: Utils.eurNm(m.weightedArNm), nm: Utils.nm(d.nm) })}</li>
                <li>${I18n.f("valM4Raw", { min: Utils.eurNm(m.rawMinArNm), max: Utils.eurNm(m.rawMaxArNm) })}</li>
                ${kerek ? `<li>${I18n.t(d.helySzerint === "telepules" ? "valM4Villages" : "valM4Districts")}: ${kerek}</li>` : ""}
                ${m.conditionAdjustment && Math.abs(m.conditionAdjustment) >= 0.5 ? `<li>${I18n.f("valCondAdjusted", { pct: Utils.pct(m.conditionAdjustment, 1) })}</li>` : ""}
            </ul>
            <p class="small text-body-secondary mb-0">${I18n.t("valM4Note")}</p>`;
    }

    // Hogyan jött ki a becslés: hasonlók + árarány-modell, és a fő arányok
    static methodHtml(d, params) {

        const m = d.method;
        if (m && m.kind === "comparables") return ValuationManager.methodHtml4(d, params);

        if (!m) {
            return `<p class="small text-body-secondary mb-0">${I18n.f("valMethod", { n: d.comparables.length })}</p>`;
        }

        const ar = v => Utils.price({ ar: v, ugylet: params.ugylet });

        // A fő arányok (az 1,5%-nál kisebb hatás csak zaj – nem mutatjuk)
        const tenyezok = (m.factors || [])
            .filter(t => Math.abs(t.szorzo - 1) >= 0.015)
            .sort((a, b) => Math.abs(b.szorzo - 1) - Math.abs(a.szorzo - 1))
            .map(t => {
                const pct = (t.szorzo - 1) * 100;
                return `<li>${I18n.t("valF_" + t.csoport)}: <b class="${pct >= 0 ? "text-success" : "text-danger"}">${Utils.pct(pct, 0)}</b></li>`;
            }).join("");

        const igazitas = m.conditionAdjustment && Math.abs(m.conditionAdjustment) >= 0.5
            ? `<p class="small text-body-secondary mb-2"><i class="fa-solid fa-arrow-up-wide-short" aria-hidden="true"></i> ${I18n.f("valCondAdjusted", { pct: Utils.pct(m.conditionAdjustment, 1) })}</p>`
            : "";

        return `
            <ul class="small mb-2 valMethodList">
                <li>${I18n.t("valByComparables")}: <b>${ar(m.comparableEstimate)}</b> <span class="text-body-secondary">(${m.comparableWeight}%)</span></li>
                ${m.modelEstimate ? `<li>${I18n.t("valByModel")}: <b>${ar(m.modelEstimate)}</b> <span class="text-body-secondary">(${m.modelWeight}%)</span></li>` : ""}
            </ul>
            ${igazitas}
            ${tenyezok ? `
                <div class="small text-body-secondary mb-1">${I18n.f("valFactorsTitle", { base: Utils.eurNm(m.baseArNm) })}</div>
                <ul class="small mb-2 valMethodList">${tenyezok}</ul>` : ""}
            <p class="small text-body-secondary mb-0">${I18n.f("valMethod2", { n: d.comparables.length })}</p>`;

    }

}
