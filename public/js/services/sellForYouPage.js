// ============================================================
//  Eladjuk helyetted (#eladjuk) – megbízásos értékesítés
//
//  A tulajdonos feljön az oldalra, kiválasztja a szolgáltatásokat
//  (fotózás, alaprajz, videó, kampány, bemutatás...), megadja az
//  ingatlan alapadatait és az elérhetőségét. Mi felhívjuk, szerződést
//  kötünk, lefotózzuk, feltöltjük, reklámozzuk, kezeljük a vevőket.
//  A díjakat és az opciókat az admin állítja (Admin → Megbízások).
// ============================================================

class SellForYouPage {

    static adat = null;
    static valasztott = new Set();

    static show() {

        const box = document.getElementById("eladjukContent");
        if (!SellForYouPage.adat) box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        Svc.api("/api/megbizas/ajanlat").then(a => {
            const elso = !SellForYouPage.adat;
            SellForYouPage.adat = a;
            if (elso) a.opciok.filter(o => o.alap).forEach(o => SellForYouPage.valasztott.add(o.kod));
            SellForYouPage.render();
        }).catch(() => {
            box.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
        });

        if (!SellForYouPage._i18n) {
            SellForYouPage._i18n = true;
            I18n.onChange(() => { if (PageManager.current === "eladjuk" && SellForYouPage.adat) SellForYouPage.render(); });
        }

    }

    static terulet(a) {
        return I18n.current === "ro" ? (a.terulet_ro || a.terulet) : I18n.current === "en" ? (a.terulet_en || a.terulet) : a.terulet;
    }

    static render() {

        const a = SellForYouPage.adat;
        const box = document.getElementById("eladjukContent");
        const esc = Utils.escape;
        const u = AuthManager.user || {};

        const alap = a.opciok.filter(o => o.alap);
        const extra = a.opciok.filter(o => !o.alap);

        const opcio = o => `
            <label class="sfOpt ${o.alap ? "included" : ""} ${SellForYouPage.valasztott.has(o.kod) ? "on" : ""}">
                <input type="checkbox" value="${esc(o.kod)}" ${SellForYouPage.valasztott.has(o.kod) ? "checked" : ""} ${o.alap ? "disabled" : ""}>
                <span class="sfOptIcon"><i class="${esc(o.ikon)}" aria-hidden="true"></i></span>
                <span class="sfOptText">
                    <b>${esc(Svc.t(o.nev))}</b>
                    <small>${esc(Svc.t(o.leiras))}</small>
                </span>
                <span class="sfOptPrice">${o.alap ? I18n.t("sfIncluded") : o.ar > 0 ? "+" + esc(Svc.penz(o.ar, o.penznem)) : I18n.t("sfFree")}</span>
            </label>`;

        if (!a.aktiv) {
            box.innerHTML = `<div class="emptyState"><i class="fa-solid fa-key"></i><h5>${I18n.t("sfOff")}</h5><p>${I18n.t("sfOffText")}</p></div>`;
            return;
        }

        box.innerHTML = `
            <section class="sfHero">
                <div class="sfHeroText">
                    <span class="prEyebrow"><i class="fa-solid fa-key" aria-hidden="true"></i> ${I18n.t("menuEladjuk")}</span>
                    <h1>${I18n.t("sfTitle")}</h1>
                    <p class="lead">${I18n.t("sfLead")}</p>
                    <div class="sfChips">
                        <span><i class="fa-solid fa-percent" aria-hidden="true"></i> ${I18n.f("sfChipFee", { p: Utils.num(a.jutalek, 1) })}</span>
                        <span><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("sfChipOnlySuccess")}</span>
                        <span><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(SellForYouPage.terulet(a))}</span>
                    </div>
                    <a class="btn btn-primary btn-lg mt-3" href="#eladjuk" id="sfToForm"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> ${I18n.t("sfCta")}</a>
                </div>
                <ol class="sfFlow">
                    ${[["fa-solid fa-handshake", "sfStep1", "sfStep1d"], ["fa-solid fa-file-signature", "sfStep2", "sfStep2d"], ["fa-solid fa-camera", "sfStep3", "sfStep3d"],
                       ["fa-solid fa-people-arrows", "sfStep4", "sfStep4d"], ["fa-solid fa-stamp", "sfStep5", "sfStep5d"]].map(([ic, t, dd], i) => `
                        <li>
                            <span class="sfFlowNo">${i + 1}</span>
                            <div><b><i class="${ic}" aria-hidden="true"></i> ${I18n.t(t)}</b><p>${I18n.t(dd)}</p></div>
                        </li>`).join("")}
                </ol>
            </section>

            <div class="row g-4 mt-1">
                <div class="col-xl-7">
                    <h2 class="prSub mt-0">${I18n.t("sfWhatYouGet")}</h2>
                    <div class="sfOpts">${alap.map(opcio).join("")}</div>
                    ${extra.length ? `
                        <h2 class="prSub">${I18n.t("sfExtras")}</h2>
                        <p class="text-body-secondary small">${I18n.t("sfExtrasNote")}</p>
                        <div class="sfOpts" id="sfExtraOpts">${extra.map(opcio).join("")}</div>` : ""}

                    <div class="sfFee">
                        <h3><i class="fa-solid fa-calculator" aria-hidden="true"></i> ${I18n.t("sfFeeTitle")}</h3>
                        <p>${I18n.f("sfFeeText", { p: Utils.num(a.jutalek, 1), pk: Utils.num(a.jutalek_kizarolagos, 1), min: Svc.penz(a.minimum_dij, a.penznem) })}</p>
                        <div class="sfCalc">
                            <label for="sfCalcAr">${I18n.t("sfCalcLabel")}</label>
                            <div class="input-group">
                                <input type="number" min="0" step="1000" class="form-control" id="sfCalcAr" placeholder="80000">
                                <span class="input-group-text">${esc(a.penznem)}</span>
                            </div>
                            <div class="sfCalcOut" id="sfCalcOut"></div>
                        </div>
                    </div>

                    <div class="sfFaq">
                        <h2 class="prSub">${I18n.t("sfFaqTitle")}</h2>
                        ${[1, 2, 3, 4, 5].map(n => `
                            <details>
                                <summary>${I18n.t("sfQ" + n)}</summary>
                                <p>${I18n.f("sfA" + n, { p: Utils.num(a.jutalek, 1), honap: a.idotartam_honap })}</p>
                            </details>`).join("")}
                    </div>
                </div>

                <div class="col-xl-5">
                    <form class="card sfForm" id="sfForm" novalidate>
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-key" aria-hidden="true"></i> ${I18n.t("sfFormTitle")}</h5></div>
                        <div class="card-body">
                            <div class="btn-group w-100 mb-3" role="group">
                                <input type="radio" class="btn-check" name="sfUgylet" id="sfElado" value="elado" checked>
                                <label class="btn btn-outline-primary" for="sfElado">${I18n.t("sfSell")}</label>
                                <input type="radio" class="btn-check" name="sfUgylet" id="sfKiado" value="kiado">
                                <label class="btn btn-outline-primary" for="sfKiado">${I18n.t("sfRent")}</label>
                            </div>
                            <div class="row g-2">
                                <div class="col-sm-6">
                                    <label class="form-label small mb-1" for="sfTipus">${I18n.t("newTipus")}</label>
                                    <select class="form-select" id="sfTipus">${Types.LIST.map(t => `<option value="${t.key}">${esc(I18n.t(t.label))}</option>`).join("")}</select>
                                </div>
                                <div class="col-sm-6">
                                    <label class="form-label small mb-1" for="sfVaros">${I18n.t("detailVaros")}</label>
                                    <select class="form-select" id="sfVaros"></select>
                                </div>
                                <div class="col-12">
                                    <label class="form-label small mb-1" for="sfCim">${I18n.t("sfAddress")}</label>
                                    <input class="form-control" id="sfCim" maxlength="300" placeholder="${esc(I18n.t("sfAddressPh"))}">
                                </div>
                                <div class="col-4">
                                    <label class="form-label small mb-1" for="sfNm">${I18n.t("detailNm")}</label>
                                    <input class="form-control" id="sfNm" type="number" min="1" step="0.1" inputmode="decimal">
                                </div>
                                <div class="col-3">
                                    <label class="form-label small mb-1" for="sfSzobak">${I18n.t("detailSzoba")}</label>
                                    <input class="form-control" id="sfSzobak" type="number" min="0" step="1" inputmode="numeric">
                                </div>
                                <div class="col-5">
                                    <label class="form-label small mb-1" for="sfAr">${I18n.t("sfPrice")}</label>
                                    <div class="input-group">
                                        <input class="form-control" id="sfAr" type="number" min="0" step="1000" inputmode="numeric">
                                        <span class="input-group-text">${esc(a.penznem)}</span>
                                    </div>
                                </div>
                                <div class="col-12">
                                    <label class="form-label small mb-1" for="sfLeiras">${I18n.t("sfDesc")}</label>
                                    <textarea class="form-control" id="sfLeiras" rows="3" maxlength="4000" placeholder="${esc(I18n.t("sfDescPh"))}"></textarea>
                                </div>
                            </div>
                            <h6 class="mt-3 mb-2">${I18n.t("sfContact")}</h6>
                            <div class="row g-2">
                                <div class="col-12">
                                    <label class="form-label small mb-1" for="sfNev">${I18n.t("authName")} *</label>
                                    <input class="form-control" id="sfNev" maxlength="160" value="${esc(u.nev || "")}" autocomplete="name">
                                </div>
                                <div class="col-sm-6">
                                    <label class="form-label small mb-1" for="sfTel">${I18n.t("svcPhone")} *</label>
                                    <input class="form-control" id="sfTel" type="tel" maxlength="40" value="${esc(u.telefon || "")}" autocomplete="tel">
                                </div>
                                <div class="col-sm-6">
                                    <label class="form-label small mb-1" for="sfEmail">${I18n.t("authEmail")}</label>
                                    <input class="form-control" id="sfEmail" type="email" maxlength="160" value="${esc(u.email || "")}" autocomplete="email">
                                </div>
                                <div class="col-12">
                                    <label class="form-label small mb-1" for="sfMikor">${I18n.t("sfWhen")}</label>
                                    <input class="form-control" id="sfMikor" maxlength="300" placeholder="${esc(I18n.t("sfWhenPh"))}">
                                </div>
                            </div>
                            <div class="form-check form-switch mt-3">
                                <input class="form-check-input" type="checkbox" role="switch" id="sfKizar">
                                <label class="form-check-label small" for="sfKizar">${I18n.f("sfExclusive", { p: Utils.num(a.jutalek_kizarolagos, 1) })}</label>
                            </div>
                            <div class="sfSummary" id="sfSummary"></div>
                            <div class="form-check mt-2">
                                <input class="form-check-input" type="checkbox" id="sfElfogad">
                                <label class="form-check-label small" for="sfElfogad">${I18n.t("sfAccept")} <a href="#jogi/aszf" target="_blank">${I18n.t("prTerms")}</a></label>
                            </div>
                            <div class="alert alert-danger small py-2 mt-2 mb-0" id="sfHiba" hidden></div>
                            <button type="submit" class="btn btn-primary btn-lg w-100 mt-3" id="sfKuld"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t("sfSubmit")}</button>
                            <p class="small text-body-secondary mt-2 mb-0">${I18n.t("sfNoCommit")}</p>
                        </div>
                    </form>
                </div>
            </div>`;

        const $ = q => box.querySelector(q);

        // Városok
        const varos = $("#sfVaros");
        if (CityManager.varosok && CityManager.varosok.length) CityManager.fillCitySelect(varos, DataManager.currentCity);
        else varos.innerHTML = `<option value="Sepsiszentgyorgy">Sepsiszentgyörgy</option>`;

        $("#sfToForm").onclick = e => {
            e.preventDefault();
            $("#sfForm").scrollIntoView({ behavior: "smooth", block: "start" });
            setTimeout(() => $("#sfCim").focus({ preventScroll: true }), 400);
        };

        box.querySelectorAll(".sfOpt input:not([disabled])").forEach(cb => {
            cb.onchange = () => {
                if (cb.checked) SellForYouPage.valasztott.add(cb.value);
                else SellForYouPage.valasztott.delete(cb.value);
                cb.closest(".sfOpt").classList.toggle("on", cb.checked);
                SellForYouPage.osszegzes();
            };
        });

        const kalk = () => {
            const ar = Number($("#sfCalcAr").value) || 0;
            const out = $("#sfCalcOut");
            if (!ar) { out.innerHTML = ""; return; }
            const egy = p => Math.max(a.minimum_dij || 0, Math.round(ar * p) / 100);
            out.innerHTML = `
                <div><span>${I18n.t("sfCalcNormal")}</span><b>${esc(Svc.penz(egy(a.jutalek), a.penznem))}</b></div>
                <div><span>${I18n.t("sfCalcExclusive")}</span><b>${esc(Svc.penz(egy(a.jutalek_kizarolagos), a.penznem))}</b></div>
                <div class="small text-body-secondary">${I18n.t("sfCalcNet")}: ${esc(Svc.penz(ar - egy(a.jutalek_kizarolagos), a.penznem))} – ${esc(Svc.penz(ar - egy(a.jutalek), a.penznem))}</div>`;
        };
        $("#sfCalcAr").oninput = kalk;
        $("#sfAr").oninput = () => { $("#sfCalcAr").value = $("#sfAr").value; kalk(); };
        $("#sfKizar").onchange = () => SellForYouPage.osszegzes();

        $("#sfForm").onsubmit = e => {
            e.preventDefault();
            SellForYouPage.kuld();
        };

        SellForYouPage.osszegzes();

    }

    // A kiválasztott szolgáltatások és a díj összegzése az űrlap alján
    static osszegzes() {
        const a = SellForYouPage.adat;
        const el = document.getElementById("sfSummary");
        if (!el) return;
        const esc = Utils.escape;
        const extrak = a.opciok.filter(o => !o.alap && SellForYouPage.valasztott.has(o.kod));
        const kizar = document.getElementById("sfKizar") && document.getElementById("sfKizar").checked;
        const fizetos = extrak.filter(o => o.ar > 0);
        el.innerHTML = `
            <div><span>${I18n.t("sfSumFee")}</span><b>${Utils.num(kizar ? a.jutalek_kizarolagos : a.jutalek, 1)}% <small>(min. ${esc(Svc.penz(a.minimum_dij, a.penznem))})</small></b></div>
            ${extrak.length ? `<div><span>${I18n.t("sfSumExtras")}</span><b>${extrak.map(o => esc(Svc.t(o.nev))).join(", ")}</b></div>` : ""}
            ${fizetos.length ? `<div><span>${I18n.t("sfSumExtrasPrice")}</span><b>${fizetos.map(o => esc(Svc.penz(o.ar, o.penznem))).join(" + ")}</b></div>` : ""}`;
    }

    static kuld() {

        const $ = q => document.querySelector("#eladjukContent " + q);
        const hiba = $("#sfHiba");
        hiba.hidden = true;

        const mutat = szoveg => { hiba.textContent = szoveg; hiba.hidden = false; };

        const body = {
            ugylet: (document.querySelector("input[name=sfUgylet]:checked") || {}).value || "elado",
            tipus: $("#sfTipus").value,
            varos: $("#sfVaros").value,
            cim: $("#sfCim").value,
            nm: $("#sfNm").value,
            szobak: $("#sfSzobak").value,
            kert_ar: $("#sfAr").value,
            leiras: $("#sfLeiras").value,
            nev: $("#sfNev").value,
            telefon: $("#sfTel").value,
            email: $("#sfEmail").value,
            elerhetoseg: $("#sfMikor").value,
            kizarolagos: $("#sfKizar").checked,
            opciok: [...SellForYouPage.valasztott],
            elfogad: $("#sfElfogad").checked
        };

        if (!body.nev.trim()) { $("#sfNev").classList.add("is-invalid"); $("#sfNev").focus(); return mutat(I18n.t("svcErr_missing_name")); }
        if (!body.telefon.trim() && !body.email.trim()) { $("#sfTel").classList.add("is-invalid"); $("#sfTel").focus(); return mutat(I18n.t("svcErr_missing_contact")); }
        if (!body.elfogad) return mutat(I18n.t("svcErr_must_accept"));

        const tovabb = () => {
            $("#sfKuld").disabled = true;
            Svc.api("/api/megbizas", { method: "POST", body })
                .then(v => SellForYouPage.siker(v))
                .catch(e => { $("#sfKuld").disabled = false; mutat(Svc.hiba(e)); });
        };

        if (!AuthManager.loggedIn()) AuthManager.kell("register").then(tovabb).catch(() => { });
        else tovabb();

    }

    static siker(v) {
        const box = document.getElementById("eladjukContent");
        box.innerHTML = `
            <div class="sfDone">
                <span class="sfDoneIcon"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></span>
                <h1>${I18n.t("sfDoneTitle")}</h1>
                <p class="lead">${I18n.f("sfDoneText", { szam: Utils.escape(v.szam) })}</p>
                <ol class="sfDoneNext">
                    <li>${I18n.t("sfDoneNext1")}</li>
                    <li>${I18n.t("sfDoneNext2")}</li>
                    <li>${I18n.t("sfDoneNext3")}</li>
                </ol>
                <div class="d-flex flex-wrap gap-2 justify-content-center mt-3">
                    <a class="btn btn-primary" href="#fiok/megbizasok"><i class="fa-solid fa-key" aria-hidden="true"></i> ${I18n.t("accTabMandates")}</a>
                    <a class="btn btn-outline-secondary" href="/api/megbizas/${v.id}/szerzodes" target="_blank" rel="noopener"><i class="fa-solid fa-file-signature" aria-hidden="true"></i> ${I18n.t("sfContractDraft")}</a>
                </div>
            </div>`;
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

}
