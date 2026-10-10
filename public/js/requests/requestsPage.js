// ============================================================
//  Keresési igények ("Keresek")
//
//  #igenyek          a vevők igényei (szűrhető), "Új igény" gomb
//  #igenyek/uj       új igény feladása
//  #igenyek/123      egy igény: a vevőnek az illeszkedő hirdetések,
//                    az eladónak a válasz (üzenet + saját hirdetés ajánlása)
// ============================================================

class RequestsPage {

    static param = null;
    static szuro = { varos: "", tipus: "", ugylet: "" };
    static szerkesztett = undefined;

    static box() {
        return document.getElementById("igenyekContent");
    }

    static show(param) {

        RequestsPage.param = param || null;

        if (param === "uj") return AuthManager.kell().then(() => RequestsPage.urlap(null)).catch(() => PageManager.show("igenyek"));
        if (param && /^\d+$/.test(param)) return RequestsPage.reszlet(Number(param));

        RequestsPage.lista();

    }

    // Nyelvváltáskor: az űrlapot csak akkor rajzoljuk újra, ha még nem írtak bele
    static rerender() {
        const leiras = document.getElementById("rqLeiras");
        if (leiras) {
            if (leiras.value.trim() && leiras.value !== (RequestsPage.szerkesztett || {}).leiras) return;
            return RequestsPage.urlap(RequestsPage.szerkesztett || null);
        }
        RequestsPage.show(RequestsPage.param);
    }

    // ---------- összefoglaló ----------

    static tartomany(min, max, fmt) {
        if (min === null && max === null) return "";
        if (min !== null && max !== null) return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
        return min !== null ? `${I18n.t("reqFrom")} ${fmt(min)}` : `${I18n.t("reqUpTo")} ${fmt(max)}`;
    }

    static chipek(g) {

        const t = Types.get(g.tipus);
        const c = [];

        c.push(`<i class="${t.icon}"></i> ${Types.label(g.tipus)} · ${I18n.t(g.ugylet === "kiado" ? "reqRent" : "reqBuy")}`);

        const ker = (g.keruletek || []).map(k => CityManager.keruletLabel(k, g.varos));
        const hely = g.telepules
            ? (g.telepules === "_varos" ? I18n.t("telepulesVarosban") : CityManager.telepulesLabel(g.telepules))
            : ker.join(", ");
        c.push(`<i class="fa-solid fa-location-dot"></i> ${Utils.escape(CityManager.displayName(g.varos))}${hely ? " · " + Utils.escape(hely) : ""}`);

        const ar = RequestsPage.tartomany(g.min_ar, g.max_ar, v => Utils.eur(v) + (g.ugylet === "kiado" ? I18n.t("perMonth") : ""));
        if (ar) c.push(`<i class="fa-solid fa-euro-sign"></i> ${ar}`);

        const nm = RequestsPage.tartomany(g.min_nm, g.max_nm, v => Utils.num(v) + " m²");
        if (nm) c.push(`<i class="fa-solid fa-ruler-combined"></i> ${nm}`);

        if (t.fields.szobak) {
            const sz = RequestsPage.tartomany(g.min_szoba, g.max_szoba, v => v);
            if (sz) c.push(`<i class="fa-solid fa-bed"></i> ${sz} ${I18n.t("reqRooms")}`);
        }

        return c;

    }

    static cim(g) {
        return g.cim || `${Types.label(g.tipus)} · ${CityManager.displayName(g.varos)}`;
    }

    // ---------- lista ----------

    static lista() {

        const box = RequestsPage.box();
        const sz = RequestsPage.szuro;

        if (!sz.varos) sz.varos = DataManager.currentCity || "";

        box.innerHTML = `
            <div class="pageHeader">
                <div class="pageHeaderRow">
                    <div>
                        <h2>${I18n.t("reqTitle")}</h2>
                        <p class="text-body-secondary mb-0">${I18n.t("reqSubtitle")}</p>
                    </div>
                    <button class="btn btn-primary" id="reqNew"><i class="fa-solid fa-plus"></i> ${I18n.t("reqNewBtn")}</button>
                </div>
            </div>

            <div class="reqHow mb-4">
                <div><span class="reqHowNum">1</span><span>${I18n.t("reqHow1")}</span></div>
                <div><span class="reqHowNum">2</span><span>${I18n.t("reqHow2")}</span></div>
                <div><span class="reqHowNum">3</span><span>${I18n.t("reqHow3")}</span></div>
            </div>

            ${typeof AdSlots !== "undefined" ? AdSlots.slot("requests", "mb-4") : ""}

            <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
                <select class="form-select w-auto" id="reqFVaros"><option value="">${I18n.t("reqAllCities")}</option></select>
                <select class="form-select w-auto" id="reqFTipus">
                    <option value="">${I18n.t("reviewAllTypes")}</option>
                    ${Types.LIST.map(t => `<option value="${t.key}" ${sz.tipus === t.key ? "selected" : ""}>${I18n.t(t.label)}</option>`).join("")}
                </select>
                <select class="form-select w-auto" id="reqFUgylet">
                    <option value="">${I18n.t("reqBuyOrRent")}</option>
                    <option value="elado" ${sz.ugylet === "elado" ? "selected" : ""}>${I18n.t("reqBuy")}</option>
                    <option value="kiado" ${sz.ugylet === "kiado" ? "selected" : ""}>${I18n.t("reqRent")}</option>
                </select>
                <span class="text-body-secondary small ms-auto" id="reqCount"></span>
            </div>

            <div id="reqList" class="reqGrid"><div class="emptyState"><div class="spinner-border text-primary"></div></div></div>`;

        const vs = document.getElementById("reqFVaros");
        CityManager.varosok.forEach(v => vs.insertAdjacentHTML("beforeend", `<option value="${Utils.escape(v.nev)}">${Utils.escape(CityManager.displayName(v.nev))}</option>`));
        vs.value = sz.varos;

        const valt = () => {
            sz.varos = vs.value;
            sz.tipus = document.getElementById("reqFTipus").value;
            sz.ugylet = document.getElementById("reqFUgylet").value;
            RequestsPage.betolt();
        };

        ["reqFVaros", "reqFTipus", "reqFUgylet"].forEach(id => { document.getElementById(id).onchange = valt; });

        document.getElementById("reqNew").onclick = () => PageManager.show("igenyek/uj");

        RequestsPage.betolt();

    }

    static betolt() {

        const sz = RequestsPage.szuro;
        const qs = new URLSearchParams(Object.entries(sz).filter(([, v]) => v)).toString();

        fetch("/api/igenyek?" + qs)
            .then(r => r.json())
            .then(lista => {

                const el = document.getElementById("reqList");
                if (!el) return;

                document.getElementById("reqCount").innerText = I18n.f("reqCount", { n: lista.length });

                if (!lista.length) {
                    el.innerHTML = `
                        <div class="emptyState">
                            <i class="fa-solid fa-bullhorn"></i>
                            <h5>${I18n.t("reqEmpty")}</h5>
                            <p>${I18n.t("reqEmptyHint")}</p>
                        </div>`;
                    return;
                }

                el.innerHTML = lista.map(g => `
                    <a class="reqCard card" href="#igenyek/${g.id}">
                        <div class="card-body">
                            <div class="d-flex justify-content-between gap-2 mb-2">
                                <h5 class="mb-0">${Utils.escape(RequestsPage.cim(g))}</h5>
                                ${g.sajat ? `<span class="badge text-bg-primary align-self-start">${I18n.t("reqMine")}</span>` : ""}
                            </div>
                            <div class="reqChips">${RequestsPage.chipek(g).map(c => `<span class="filterChip">${c}</span>`).join("")}</div>
                            <p class="reqDesc">${Utils.escape(g.leiras)}</p>
                            <div class="d-flex justify-content-between align-items-center small text-body-secondary">
                                <span><i class="fa-regular fa-user"></i> ${Utils.escape(g.nev)} · ${Utils.ago(g.created_at)}</span>
                                <span>${g.valaszok ? `<i class="fa-regular fa-comments"></i> ${I18n.f("reqReplies", { n: g.valaszok })}` : `<span class="text-success">${I18n.t("reqBeFirst")}</span>`}</span>
                            </div>
                        </div>
                    </a>`).join("");

            })
            .catch(() => {
                const el = document.getElementById("reqList");
                if (el) el.innerHTML = `<div class="alert alert-warning">${I18n.t("alertLoadError")}</div>`;
            });

    }

    // ---------- egy igény ----------

    static reszlet(id) {

        const box = RequestsPage.box();
        box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        fetch("/api/igenyek/" + id)
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(g => {

                const aktiv = g.statusz === "aktiv" && (!g.lejar || new Date(g.lejar) > new Date());

                box.innerHTML = `
                    <button class="btn btn-link px-0 mb-2" id="reqBack"><i class="fa-solid fa-arrow-left"></i> ${I18n.t("reqBack")}</button>

                    <div class="row g-4">
                        <div class="col-lg-7">
                            <div class="card">
                                <div class="card-body p-4">
                                    <div class="d-flex flex-wrap justify-content-between gap-2 mb-2">
                                        <h3 class="mb-0">${Utils.escape(RequestsPage.cim(g))}</h3>
                                        ${!aktiv ? `<span class="badge text-bg-secondary align-self-start">${I18n.t(g.statusz === "lezart" ? "reqClosed" : "reqExpired")}</span>` : ""}
                                    </div>
                                    <div class="small text-body-secondary mb-3"><i class="fa-regular fa-user"></i> ${Utils.escape(g.nev)} · ${Utils.ago(g.created_at)}${g.lejar ? ` · ${I18n.f("reqValidUntil", { d: Utils.ago(g.lejar) })}` : ""}</div>
                                    <div class="reqChips mb-3">${RequestsPage.chipek(g).map(c => `<span class="filterChip">${c}</span>`).join("")}</div>
                                    <div class="listingDesc">${Utils.escape(g.leiras)}</div>
                                    ${g.sajat ? `
                                        <div class="d-flex flex-wrap gap-2 mt-4">
                                            <button class="btn btn-outline-secondary btn-sm" id="reqEdit"><i class="fa-solid fa-pen"></i> ${I18n.t("detailEdit")}</button>
                                            ${aktiv
                                                ? `<button class="btn btn-outline-secondary btn-sm" id="reqClose"><i class="fa-solid fa-check"></i> ${I18n.t("reqCloseBtn")}</button>`
                                                : `<button class="btn btn-outline-primary btn-sm" id="reqReopen"><i class="fa-solid fa-rotate"></i> ${I18n.t("reqReopenBtn")}</button>`}
                                            <button class="btn btn-outline-danger btn-sm ms-auto" id="reqDelete"><i class="fa-solid fa-trash"></i></button>
                                        </div>
                                        <p class="small text-body-secondary mt-3 mb-0">${I18n.f("reqOwnerNote", { n: g.valaszok || 0 })} <a href="#fiok/uzenetek">${I18n.t("accTabMessages")}</a></p>` : ""}
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-5" id="reqSide"></div>
                    </div>

                    ${g.sajat ? `
                        <h5 class="mt-5 mb-3">${I18n.f("reqMatchesTitle", { n: g.illeszkedo.length })}</h5>
                        <p class="sectionNote">${I18n.t("reqMatchesNote")}</p>
                        <div class="reqMatches">${g.illeszkedo.length ? g.illeszkedo.map(i => RequestsPage.miniKartya(i)).join("") : `<div class="alert alert-light">${I18n.t("reqNoMatches")}</div>`}</div>` : ""}`;

                document.getElementById("reqBack").onclick = () => PageManager.show("igenyek");

                if (!g.sajat) RequestsPage.valaszPanel(g, aktiv);
                else RequestsPage.sajatPanel(g);

                if (g.sajat) {

                    document.getElementById("reqEdit").onclick = () => RequestsPage.urlap(g);

                    const allapot = st => fetch("/api/igenyek/" + g.id, {
                        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statusz: st })
                    }).then(() => RequestsPage.reszlet(g.id));

                    const close = document.getElementById("reqClose");
                    if (close) close.onclick = () => allapot("lezart");
                    const reopen = document.getElementById("reqReopen");
                    if (reopen) reopen.onclick = () => allapot("aktiv");

                    document.getElementById("reqDelete").onclick = () => {
                        if (!confirm(I18n.t("reqDeleteConfirm"))) return;
                        fetch("/api/igenyek/" + g.id, { method: "DELETE" }).then(() => PageManager.show("igenyek"));
                    };

                }

            })
            .catch(() => {
                box.innerHTML = `<div class="emptyState"><i class="fa-solid fa-circle-question"></i><h5>${I18n.t("reqNotFound")}</h5><a href="#igenyek">${I18n.t("reqBack")}</a></div>`;
            });

    }

    static miniKartya(i) {
        const foto = Utils.photoUrl(i);
        return `
            <a class="miniCard" href="#listing/${i.id}">
                ${foto ? `<img src="${Utils.escape(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="miniCardNoPhoto"><i class="${Types.get(i.tipus).icon}"></i></span>`}
                <span class="miniCardBody">
                    <b>${Utils.price(i)}</b>
                    <small>${i.nm ? Utils.nm(i.nm) : ""}${i.szobak ? " · " + i.szobak + " " + I18n.t("reqRooms") : ""}</small>
                    <small class="text-body-secondary text-truncate">${Utils.escape(CityManager.helyLabel(i))}</small>
                </span>
            </a>`;
    }

    static sajatPanel(g) {
        const el = document.getElementById("reqSide");
        el.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h6><i class="fa-solid fa-lightbulb text-warning"></i> ${I18n.t("reqTipsTitle")}</h6>
                    <ul class="small mb-0 ps-3">
                        <li>${I18n.t("reqTip1")}</li>
                        <li>${I18n.t("reqTip2")}</li>
                        <li>${I18n.t("reqTip3")}</li>
                    </ul>
                </div>
            </div>`;
    }

    // Eladó / ingatlanos: válasz a vevőnek
    static valaszPanel(g, aktiv) {

        const el = document.getElementById("reqSide");

        if (!aktiv) {
            el.innerHTML = `<div class="alert alert-secondary">${I18n.t("reqNoLongerActive")}</div>`;
            return;
        }

        if (!AuthManager.loggedIn()) {
            el.innerHTML = `
                <div class="card"><div class="card-body text-center p-4">
                    <i class="fa-regular fa-comments fs-2 text-primary"></i>
                    <h5 class="mt-2">${I18n.t("reqReplyTitle")}</h5>
                    <p class="text-body-secondary small">${I18n.t("reqLoginToReply")}</p>
                    <button class="btn btn-primary" id="reqLogin">${I18n.t("authLoginBtn")}</button>
                </div></div>`;
            document.getElementById("reqLogin").onclick = () => AuthManager.kell().then(() => RequestsPage.reszlet(g.id)).catch(() => { });
            return;
        }

        const sajat = g.sajatHirdetesek || [];
        const illok = sajat.filter(i => i.illik);

        el.innerHTML = `
            <div class="card reqReplyCard">
                <div class="card-body">
                    <h5><i class="fa-regular fa-comments"></i> ${I18n.t("reqReplyTitle")}</h5>
                    <p class="small text-body-secondary">${I18n.t("reqReplyHelp")}</p>
                    <form id="reqReplyForm">
                        ${sajat.length ? `
                            <label class="form-label" for="reqOffer">${I18n.t("reqOfferLabel")}</label>
                            <select class="form-select mb-1" id="reqOffer">
                                <option value="">${I18n.t("reqOfferNone")}</option>
                                ${sajat.map(i => `<option value="${i.id}" ${illok[0] && illok[0].id === i.id ? "selected" : ""}>${i.illik ? "✓ " : ""}${Utils.escape(i.cim || Types.label(i.tipus))} – ${Utils.eur(i.ar)}${i.nm ? ", " + Utils.nm(i.nm) : ""}</option>`).join("")}
                            </select>
                            <div class="form-text mb-3">${illok.length ? I18n.f("reqOfferMatching", { n: illok.length }) : I18n.t("reqOfferHelp")}</div>` : `
                            <div class="alert alert-light small">${I18n.t("reqNoOwnListings")} <a href="#new">${I18n.t("navPost")}</a></div>`}
                        <label class="form-label" for="reqMsg">${I18n.t("reqMsgLabel")}</label>
                        <textarea class="form-control mb-3" id="reqMsg" rows="5" maxlength="3000" required placeholder="${Utils.escape(I18n.t("reqMsgPh"))}"></textarea>
                        <button class="btn btn-primary w-100" type="submit"><i class="fa-solid fa-paper-plane"></i> ${I18n.t("reqSendBtn")}</button>
                    </form>
                </div>
            </div>`;

        document.getElementById("reqReplyForm").onsubmit = e => {

            e.preventDefault();

            const szoveg = document.getElementById("reqMsg").value.trim();
            if (szoveg.length < 2) return;

            const offer = document.getElementById("reqOffer");
            const gomb = e.target.querySelector("button[type=submit]");
            gomb.disabled = true;

            fetch(`/api/igenyek/${g.id}/valasz`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ szoveg, ajanlott_ingatlan_id: offer && offer.value ? Number(offer.value) : null })
            })
                .then(r => r.json().then(v => ({ ok: r.ok, v })))
                .then(({ ok, v }) => {
                    if (!ok) throw new Error(v.error);
                    Utils.toast(I18n.t("reqSent"));
                    AccountPage.nyitando = { masik: v.cimzett_id, igeny: g.id };
                    PageManager.show("fiok/uzenetek");
                })
                .catch(() => alert(I18n.t("msgSendError")))
                .finally(() => { gomb.disabled = false; });

        };

    }

    // ---------- új / szerkesztés ----------

    static urlap(g) {

        RequestsPage.szerkesztett = g;

        const box = RequestsPage.box();
        const d = g || { tipus: FilterManager.tipus || "lakas", ugylet: FilterManager.ugylet || "elado", varos: DataManager.currentCity, keruletek: [] };

        box.innerHTML = `
            <button class="btn btn-link px-0 mb-2" id="reqBack"><i class="fa-solid fa-arrow-left"></i> ${I18n.t("reqBack")}</button>

            <div class="pageHeader">
                <h2>${I18n.t(g ? "reqEditTitle" : "reqNewTitle")}</h2>
                <p class="text-body-secondary mb-0">${I18n.t("reqFormSubtitle")}</p>
            </div>

            <div class="row g-4">
                <div class="col-lg-8">
                    <form class="card" id="reqForm" novalidate>
                        <div class="card-body p-4">

                            <div class="btn-group w-100 mb-3 ugyletSwitch" role="group">
                                <input type="radio" class="btn-check" name="rqUgylet" id="rqElado" value="elado" ${d.ugylet !== "kiado" ? "checked" : ""}>
                                <label class="btn btn-outline-primary" for="rqElado">${I18n.t("reqBuy")}</label>
                                <input type="radio" class="btn-check" name="rqUgylet" id="rqKiado" value="kiado" ${d.ugylet === "kiado" ? "checked" : ""}>
                                <label class="btn btn-outline-primary" for="rqKiado">${I18n.t("reqRent")}</label>
                            </div>

                            <div class="typeGrid mb-4" id="rqTypeGrid"></div>

                            <div class="row g-3">
                                <div class="col-md-6">
                                    <label class="form-label" for="rqVaros">${I18n.t("searchVaros")}</label>
                                    <select class="form-select" id="rqVaros"></select>
                                </div>
                                <div class="col-md-6" data-field="telepules">
                                    <label class="form-label" for="rqTelepules">${I18n.t("telepulesLabel")}</label>
                                    <input class="form-control" id="rqTelepules" list="telepulesLista" autocomplete="off" placeholder="${Utils.escape(I18n.t("reqTelepulesPh"))}" value="${Utils.escape(d.telepules && d.telepules !== "_varos" ? CityManager.telepulesLabel(d.telepules) : "")}">
                                </div>
                                <div class="col-12" data-field="kerulet">
                                    <label class="form-label">${I18n.t("reqDistricts")}</label>
                                    <div class="reqDistricts" id="rqKeruletek"></div>
                                    <div class="form-text">${I18n.t("reqDistrictsHelp")}</div>
                                </div>

                                <div class="col-md-6">
                                    <label class="form-label" id="rqArLabel">${I18n.t(d.ugylet === "kiado" ? "searchArRent" : "searchAr")}</label>
                                    <div class="input-group">
                                        <input class="form-control" type="number" min="0" id="rqMinAr" placeholder="min" value="${d.min_ar ?? ""}">
                                        <span class="input-group-text">–</span>
                                        <input class="form-control" type="number" min="0" id="rqMaxAr" placeholder="max" value="${d.max_ar ?? ""}">
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">${I18n.t("searchNm")}</label>
                                    <div class="input-group">
                                        <input class="form-control" type="number" min="0" id="rqMinNm" placeholder="min" value="${d.min_nm ?? ""}">
                                        <span class="input-group-text">–</span>
                                        <input class="form-control" type="number" min="0" id="rqMaxNm" placeholder="max" value="${d.max_nm ?? ""}">
                                    </div>
                                </div>
                                <div class="col-md-6" data-field="szobak">
                                    <label class="form-label">${I18n.t("searchSzoba")}</label>
                                    <div class="input-group">
                                        <input class="form-control" type="number" min="0" id="rqMinSzoba" placeholder="min" value="${d.min_szoba ?? ""}">
                                        <span class="input-group-text">–</span>
                                        <input class="form-control" type="number" min="0" id="rqMaxSzoba" placeholder="max" value="${d.max_szoba ?? ""}">
                                    </div>
                                </div>

                                <div class="col-12">
                                    <label class="form-label" for="rqCim">${I18n.t("reqShortTitle")}</label>
                                    <input class="form-control" id="rqCim" maxlength="120" placeholder="${Utils.escape(I18n.t("reqShortTitlePh"))}" value="${Utils.escape(d.cim || "")}">
                                </div>
                                <div class="col-12">
                                    <label class="form-label" for="rqLeiras">${I18n.t("reqDescLabel")}</label>
                                    <textarea class="form-control" id="rqLeiras" rows="6" maxlength="3000" placeholder="${Utils.escape(I18n.t("reqDescPh"))}">${Utils.escape(d.leiras || "")}</textarea>
                                </div>
                            </div>

                            <div class="alert alert-light small mt-3 mb-0"><i class="fa-solid fa-lock"></i> ${I18n.t("reqPrivacy")}</div>
                            <div class="reqFormError alert alert-danger small py-2 mt-3" hidden></div>

                            <div class="d-flex justify-content-end gap-2 mt-4">
                                <button type="button" class="btn btn-outline-secondary" id="rqCancel">${I18n.t("cancel")}</button>
                                <button type="submit" class="btn btn-primary"><i class="fa-solid fa-bullhorn"></i> ${I18n.t(g ? "save" : "reqPublishBtn")}</button>
                            </div>

                        </div>
                    </form>
                </div>
                <div class="col-lg-4">
                    <div class="card">
                        <div class="card-body">
                            <h6><i class="fa-solid fa-circle-info text-primary"></i> ${I18n.t("reqWhatHappens")}</h6>
                            <ul class="small mb-0 ps-3">
                                <li>${I18n.t("reqWhat1")}</li>
                                <li>${I18n.t("reqWhat2")}</li>
                                <li>${I18n.t("reqWhat3")}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>`;

        let tipus = d.tipus || "lakas";
        let ugylet = d.ugylet || "elado";

        const mezok = () => {
            Types.applyFields("#reqForm", tipus);
            document.getElementById("rqArLabel").innerText = I18n.t(ugylet === "kiado" ? "searchArRent" : "searchAr");
        };

        Types.renderGrid("rqTypeGrid", tipus, t => { tipus = t; mezok(); });

        document.querySelectorAll('input[name="rqUgylet"]').forEach(r => r.onchange = () => { ugylet = r.value; mezok(); });

        const vs = document.getElementById("rqVaros");
        CityManager.fillCitySelect(vs, d.varos || DataManager.currentCity);

        const keruletek = () => {
            const varos = vs.value;
            const lista = CityManager.keruletek.filter(k => k.varos === varos)
                .sort((a, b) => CityManager.keruletLabelOf(a).localeCompare(CityManager.keruletLabelOf(b), I18n.current));
            const el = document.getElementById("rqKeruletek");
            el.innerHTML = lista.length
                ? lista.map(k => `
                    <label class="reqDistrict">
                        <input type="checkbox" class="form-check-input" value="${Utils.escape(k.nev)}" ${(d.keruletek || []).includes(k.nev) ? "checked" : ""}>
                        <span>${Utils.escape(CityManager.keruletLabelOf(k))}</span>
                    </label>`).join("")
                : `<span class="small text-body-secondary">${I18n.t("reqNoDistricts")}</span>`;
        };

        vs.onchange = () => { d.keruletek = []; keruletek(); };
        keruletek();
        mezok();

        document.getElementById("reqBack").onclick = document.getElementById("rqCancel").onclick = () => {
            RequestsPage.szerkesztett = undefined;
            PageManager.show(g ? `igenyek/${g.id}` : "igenyek");
            if (g) RequestsPage.reszlet(g.id);
        };

        document.getElementById("reqForm").onsubmit = e => {

            e.preventDefault();

            const n = id => { const v = document.getElementById(id).value; return v === "" ? null : Number(v); };
            const f = Types.get(tipus).fields;
            const telepules = document.getElementById("rqTelepules").value.trim();

            const body = {
                tipus, ugylet,
                varos: vs.value,
                keruletek: f.kerulet ? [...document.querySelectorAll("#rqKeruletek input:checked")].map(x => x.value) : [],
                telepules: f.telepules && telepules ? NewPropertyManager.telepulesErtek(telepules) : null,
                min_ar: n("rqMinAr"), max_ar: n("rqMaxAr"),
                min_nm: n("rqMinNm"), max_nm: n("rqMaxNm"),
                min_szoba: f.szobak ? n("rqMinSzoba") : null, max_szoba: f.szobak ? n("rqMaxSzoba") : null,
                cim: document.getElementById("rqCim").value.trim(),
                leiras: document.getElementById("rqLeiras").value.trim()
            };

            const hibaEl = document.querySelector(".reqFormError");

            if (body.leiras.length < 10) {
                hibaEl.hidden = false;
                hibaEl.innerText = I18n.t("reqErrShort");
                document.getElementById("rqLeiras").focus();
                return;
            }

            const gomb = e.target.querySelector("button[type=submit]");
            gomb.disabled = true;

            fetch(g ? "/api/igenyek/" + g.id : "/api/igenyek", {
                method: g ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
                .then(r => r.json().then(v => ({ ok: r.ok, v })))
                .then(({ ok, v }) => {
                    if (!ok) {
                        hibaEl.hidden = false;
                        hibaEl.innerText = I18n.t("reqErr_" + v.error) !== "reqErr_" + v.error ? I18n.t("reqErr_" + v.error) : I18n.t("alertSaveError");
                        return;
                    }
                    RequestsPage.szerkesztett = undefined;
                    Utils.toast(I18n.t(g ? "alertSaveSuccess" : "reqPublished"));
                    PageManager.show("igenyek/" + v.id);
                    if (g) RequestsPage.reszlet(v.id);
                })
                .finally(() => { gomb.disabled = false; });

        };

    }

}
