// ============================================================
//  Ingatlanirodák – nyilvános oldalak
//
//   #irodak          az ellenőrzött irodák listája (keresés, város,
//                    rendezés) + "Hogyan működik?" az irodáknak
//   #irodak/<id>     egy iroda adatlapja: elérhetőség, weboldal,
//                    céginformáció (ANAF), ügynökök, hirdetések
//                    (típus / ügylet szerint szűrhető)
//
//  Csak az admin által jóváhagyott iroda látszik (a cégadatokat az ANAF
//  nyilvántartásában ellenőrizzük). A jóváhagyásra váró iroda adatlapját
//  csak a tagjai látják, egy figyelmeztetéssel.
// ============================================================

class AgencyUI {

    // Logó (feltöltött kép) vagy a név kezdőbetűje
    static logo(ir, meret = "") {
        const esc = Utils.escape;
        if (ir && ir.van_logo) {
            return `<span class="agLogo img ${meret}"><img src="/api/irodak/${Number(ir.id)}/logo${ir._logoV ? "?v=" + ir._logoV : ""}" alt="" loading="lazy"></span>`;
        }
        return `<span class="agLogo ${meret}" aria-hidden="true">${esc(((ir && ir.nev) || "?").trim().slice(0, 1).toUpperCase())}</span>`;
    }

    static verifiedBadge(ir, nagy) {
        if (!ir || ir.statusz !== "jovahagyva") return "";
        const tip = [I18n.t("agVerifiedTip"), ir.hivatalos_nev, ir.cui ? "CUI " + ir.cui : null].filter(Boolean).join(" · ");
        return nagy
            ? `<span class="badge text-bg-primary agVerifiedBadge" title="${Utils.escape(tip)}"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${I18n.t("agVerified")}</span>`
            : `<i class="fa-solid fa-circle-check text-primary" title="${Utils.escape(tip)}" aria-label="${Utils.escape(I18n.t("agVerified"))}"></i>`;
    }

    static weboldalNev(url) {
        try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return url; }
    }

    static tipusChips(tipusok) {
        return Types.LIST.filter(t => tipusok && tipusok[t.key])
            .map(t => `<span class="agTypeChip"><i class="${t.icon}" aria-hidden="true"></i> ${I18n.t(t.label)} <b>${tipusok[t.key]}</b></span>`).join("");
    }

}


class AgencyDirectory {

    static lista = null;
    static szuro = { q: "", varos: "", rendez: "hirdetes" };
    static timer = null;

    static box() {
        return document.getElementById("irodaProfilContent");
    }

    static show() {

        const box = AgencyDirectory.box();
        const esc = Utils.escape;
        const f = AgencyDirectory.szuro;

        box.innerHTML = `
            <div class="pageHeader agDirHeader">
                <div class="pageHeaderRow">
                    <div>
                        <h2 class="mb-1"><i class="fa-solid fa-briefcase" aria-hidden="true"></i> ${I18n.t("agDirTitle")}</h2>
                        <p class="text-body-secondary mb-0">${I18n.t("agDirSub")}</p>
                    </div>
                    <a class="btn btn-primary" href="#iroda/uj"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("agDirRegister")}</a>
                </div>
            </div>

            <div class="agDirToolbar">
                <div class="input-group">
                    <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
                    <input type="search" class="form-control" id="agDirQ" placeholder="${esc(I18n.t("agDirSearchPh"))}" aria-label="${esc(I18n.t("agDirSearchPh"))}" value="${esc(f.q)}">
                </div>
                <select class="form-select" id="agDirCity" aria-label="${esc(I18n.t("detailVaros"))}">
                    <option value="">${I18n.t("allCities")}</option>
                    ${(CityManager.varosok || []).map(v => `<option value="${esc(v.nev)}" ${v.nev === f.varos ? "selected" : ""}>${esc(CityManager.displayName(v.nev))}</option>`).join("")}
                </select>
                <select class="form-select" id="agDirSort" aria-label="${esc(I18n.t("agSort"))}">
                    ${[["hirdetes", "agDirSortListings"], ["nev", "agDirSortName"], ["uj", "agDirSortNew"]].map(([k, l]) => `<option value="${k}" ${f.rendez === k ? "selected" : ""}>${I18n.t(l)}</option>`).join("")}
                </select>
            </div>

            <div class="row g-4">
                <div class="col-xl-9">
                    <div class="row g-3" id="agDirGrid"><div class="col-12"><div class="emptyState"><div class="spinner-border text-primary"></div></div></div></div>
                </div>
                <div class="col-xl-3">
                    <aside class="card agDirAside mb-4">
                        <div class="card-body">
                            <h6 class="mb-3"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ${I18n.t("agDirTrustTitle")}</h6>
                            <p class="small text-body-secondary">${I18n.t("agDirTrust")}</p>
                            <h6 class="mt-4 mb-3"><i class="fa-solid fa-briefcase" aria-hidden="true"></i> ${I18n.t("agDirForAgencies")}</h6>
                            <ol class="agSteps small">
                                <li><b>${I18n.t("agStep1Title")}</b><span>${I18n.t("agStep1")}</span></li>
                                <li><b>${I18n.t("agStep2Title")}</b><span>${I18n.t("agStep2")}</span></li>
                                <li><b>${I18n.t("agStep3Title")}</b><span>${I18n.t("agStep3")}</span></li>
                            </ol>
                            <a class="btn btn-outline-primary btn-sm w-100" href="#iroda/uj">${I18n.t("agDirRegister")}</a>
                        </div>
                    </aside>
                </div>
            </div>`;

        document.getElementById("agDirQ").oninput = e => {
            clearTimeout(AgencyDirectory.timer);
            AgencyDirectory.timer = setTimeout(() => { f.q = e.target.value.trim(); AgencyDirectory.betolt(); }, 250);
        };
        document.getElementById("agDirCity").onchange = e => { f.varos = e.target.value; AgencyDirectory.betolt(); };
        document.getElementById("agDirSort").onchange = e => { f.rendez = e.target.value; AgencyDirectory.betolt(); };

        AgencyDirectory.betolt();

    }

    static betolt() {

        const f = AgencyDirectory.szuro;
        const q = new URLSearchParams();
        if (f.q) q.set("q", f.q);
        if (f.varos) q.set("varos", f.varos);
        if (f.rendez) q.set("rendez", f.rendez);

        fetch("/api/irodak?" + q)
            .then(r => r.json())
            .then(lista => { AgencyDirectory.lista = Array.isArray(lista) ? lista : []; AgencyDirectory.rajzol(); })
            .catch(() => {
                const g = document.getElementById("agDirGrid");
                if (g) g.innerHTML = `<div class="col-12"><div class="alert alert-danger">${I18n.t("alertLoadError")}</div></div>`;
            });

    }

    static rajzol() {

        const grid = document.getElementById("agDirGrid");
        if (!grid) return;

        const esc = Utils.escape;
        const lista = AgencyDirectory.lista || [];
        const szurt = AgencyDirectory.szuro.q || AgencyDirectory.szuro.varos;

        if (!lista.length) {
            grid.innerHTML = `
                <div class="col-12">
                    <div class="emptyState">
                        <i class="fa-solid fa-briefcase" aria-hidden="true"></i>
                        <h5>${I18n.t(szurt ? "agDirNoResults" : "agDirEmpty")}</h5>
                        <p>${I18n.t(szurt ? "agDirNoResultsHint" : "agDirEmptyHint")}</p>
                        ${szurt ? "" : `<a class="btn btn-primary btn-sm" href="#iroda/uj">${I18n.t("agDirRegister")}</a>`}
                    </div>
                </div>`;
            return;
        }

        grid.innerHTML = lista.map(ir => `
            <div class="col-md-6 col-xxl-4">
                <article class="card agDirCard h-100">
                    <a class="agDirCardMain" href="#irodak/${ir.id}">
                        <div class="d-flex align-items-start gap-3">
                            ${AgencyUI.logo(ir)}
                            <div class="min-w-0">
                                <h5 class="agDirName">${esc(ir.nev)} ${AgencyUI.verifiedBadge({ ...ir, statusz: "jovahagyva" })}</h5>
                                <div class="small text-body-secondary text-truncate">
                                    ${ir.varos ? `<i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(CityManager.displayName(ir.varos))}` : ""}
                                    ${ir.ugynok_db ? ` · ${I18n.f("agDirAgents", { n: ir.ugynok_db })}` : ""}
                                </div>
                            </div>
                        </div>
                        ${ir.leiras ? `<p class="agDirAbout small">${esc(ir.leiras)}</p>` : ""}
                        <div class="agDirCount"><b>${Utils.num(ir.aktiv_db)}</b> ${I18n.t("agDirActive")}</div>
                        <div class="agTypeChips">${AgencyUI.tipusChips(ir.tipusok)}</div>
                    </a>
                    <div class="agDirActions">
                        <a class="btn btn-sm btn-primary" href="#irodak/${ir.id}"><i class="fa-solid fa-house" aria-hidden="true"></i> ${I18n.t("agDirListings")}</a>
                        ${ir.weboldal ? `<a class="btn btn-sm btn-outline-secondary" href="${esc(ir.weboldal)}" target="_blank" rel="noopener nofollow"><i class="fa-solid fa-globe" aria-hidden="true"></i> ${esc(AgencyUI.weboldalNev(ir.weboldal))}</a>` : ""}
                        ${ir.telefon ? `<a class="btn btn-sm btn-outline-secondary" href="tel:${esc(ir.telefon.replace(/\s/g, ""))}" aria-label="${esc(ir.telefon)}"><i class="fa-solid fa-phone" aria-hidden="true"></i></a>` : ""}
                    </div>
                </article>
            </div>`).join("");

    }

    static rerender() {
        if (PageManager.current !== "irodak") return;
        if (AgencyProfile.current && location.hash.match(/^#irodak\/\d+/)) AgencyProfile.render(AgencyProfile.current);
        else AgencyDirectory.show();
    }

}


// ============================================================
//  Az iroda nyilvános oldala (#irodak/<id>)
// ============================================================

class AgencyProfile {

    static current = null;
    static szuro = { tipus: "", ugylet: "", rendez: "uj", mennyi: 24 };

    static show(id) {

        const box = document.getElementById("irodaProfilContent");
        box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        if (!AgencyProfile.current || AgencyProfile.current.id !== Number(id)) {
            AgencyProfile.szuro = { tipus: "", ugylet: "", rendez: "uj", mennyi: 24 };
        }

        fetch("/api/irodak/" + Number(id))
            .then(AgencyPage.json)
            .then(ir => {
                DataManager.prepare(ir.hirdetesek);
                AgencyProfile.current = ir;
                AgencyProfile.render(ir);
            })
            .catch(() => {
                AgencyProfile.current = null;
                box.innerHTML = `
                    <div class="emptyState">
                        <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
                        <h5>${I18n.t("agNotFound")}</h5>
                        <a class="btn btn-outline-primary btn-sm" href="#irodak">${I18n.t("agBackToList")}</a>
                    </div>`;
            });

    }

    static rerender() {
        if (PageManager.current === "irodak" && AgencyProfile.current) AgencyProfile.render(AgencyProfile.current);
    }

    static szurt(ir) {
        const f = AgencyProfile.szuro;
        const l = ir.hirdetesek.filter(i => (!f.tipus || (i.tipus || "lakas") === f.tipus) && (!f.ugylet || (i.ugylet || "elado") === f.ugylet));
        const cmp = {
            uj: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
            arNo: (a, b) => (a.ar || Infinity) - (b.ar || Infinity),
            arCsokken: (a, b) => (b.ar || 0) - (a.ar || 0)
        }[f.rendez] || (() => 0);
        return l.sort(cmp);
    }

    static render(ir) {

        const esc = Utils.escape;
        const box = document.getElementById("irodaProfilContent");
        const f = AgencyProfile.szuro;
        const tag = ir.jog && ir.jog.tag;

        const tipusok = {};
        const ugyletek = {};
        ir.hirdetesek.forEach(i => {
            tipusok[i.tipus || "lakas"] = (tipusok[i.tipus || "lakas"] || 0) + 1;
            ugyletek[i.ugylet || "elado"] = (ugyletek[i.ugylet || "elado"] || 0) + 1;
        });

        const varosok = [...new Set(ir.hirdetesek.map(i => i.varos).filter(Boolean))];
        const aktivUgynokok = ir.ugynokok.filter(u => u.aktiv !== false);
        const lista = AgencyProfile.szurt(ir);
        const latszik = lista.slice(0, f.mennyi);

        const statuszSav = ir.statusz !== "jovahagyva" && (tag || AuthManager.isAdmin()) ? `
            <div class="alert ${ir.statusz === "fuggo" ? "alert-warning" : "alert-danger"} d-flex gap-2 align-items-start">
                <i class="fa-solid ${ir.statusz === "fuggo" ? "fa-hourglass-half" : "fa-ban"} mt-1" aria-hidden="true"></i>
                <div>${I18n.t("agProfileHidden_" + ir.statusz)}${ir.dontes_ok ? `<div class="small mt-1">${I18n.t("agReason")}: ${esc(ir.dontes_ok)}</div>` : ""}</div>
            </div>` : "";

        box.innerHTML = `
            <nav class="small mb-3" aria-label="breadcrumb"><a href="#irodak"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${I18n.t("agBackToList")}</a></nav>

            ${statuszSav}

            <div class="card agProfileHead mb-4">
                <div class="card-body">
                    <div class="d-flex flex-wrap align-items-start gap-3">
                        ${AgencyUI.logo(ir, "lg")}
                        <div class="flex-fill min-w-0">
                            <h2 class="mb-1">${esc(ir.nev)} ${AgencyUI.verifiedBadge(ir, true)}</h2>
                            <div class="text-body-secondary small mb-2">
                                <i class="fa-solid fa-briefcase" aria-hidden="true"></i> ${I18n.t("agLabel")}
                                ${ir.varos ? ` · <i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(CityManager.displayName(ir.varos))}` : ""}
                                ${ir.cim ? ` · ${esc(ir.cim)}` : ""}
                            </div>
                            ${ir.leiras ? `<p class="mb-3 agAboutText">${esc(ir.leiras)}</p>` : ""}
                            <div class="d-flex flex-wrap gap-2">
                                ${ir.weboldal ? `<a class="btn btn-primary btn-sm" href="${esc(ir.weboldal)}" target="_blank" rel="noopener nofollow"><i class="fa-solid fa-globe" aria-hidden="true"></i> ${I18n.t("agVisitWebsite")} <span class="opacity-75">(${esc(AgencyUI.weboldalNev(ir.weboldal))})</span></a>` : ""}
                                ${ir.telefon ? `<a class="btn btn-outline-primary btn-sm" href="tel:${esc(ir.telefon.replace(/\s/g, ""))}"><i class="fa-solid fa-phone" aria-hidden="true"></i> ${esc(ir.telefon)}</a>` : ""}
                                ${ir.email ? `<a class="btn btn-outline-primary btn-sm" href="mailto:${esc(ir.email)}"><i class="fa-regular fa-envelope" aria-hidden="true"></i> ${esc(ir.email)}</a>` : ""}
                            </div>
                        </div>
                        <div class="d-flex flex-column gap-2">
                            ${tag ? `<a class="btn btn-outline-secondary btn-sm" href="#iroda/${ir.id}"><i class="fa-solid fa-gear" aria-hidden="true"></i> ${I18n.t("agManage")}</a>` : ""}
                            ${AuthManager.isAdmin() ? `<button type="button" class="btn btn-outline-secondary btn-sm" id="agAdminOpen"><i class="fa-solid fa-user-shield" aria-hidden="true"></i> ${I18n.t("agAdminReview")}</button>` : ""}
                        </div>
                    </div>

                    <div class="agProfileStats">
                        <div><b>${Utils.num(ir.hirdetesek.length)}</b><span>${I18n.t("agDirActive")}</span></div>
                        <div><b>${Utils.num(aktivUgynokok.length)}</b><span>${I18n.t("agTabAgents")}</span></div>
                        ${varosok.length ? `<div><b>${varosok.length}</b><span>${I18n.t(varosok.length === 1 ? "agCityOne" : "agCities")}: ${varosok.slice(0, 3).map(v => esc(CityManager.displayName(v))).join(", ")}${varosok.length > 3 ? "…" : ""}</span></div>` : ""}
                        ${ir.dontes_ido || ir.created_at ? `<div><b>${new Date(ir.dontes_ido || ir.created_at).getFullYear()}</b><span>${I18n.t("agOnSiteSince")}</span></div>` : ""}
                    </div>
                </div>
            </div>

            <div class="row g-4">
                <div class="col-xl-9">
                    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                        <h5 class="mb-0">${I18n.f("agListingsCount", { n: lista.length })}</h5>
                        <div class="d-flex flex-wrap gap-2">
                            <div class="btn-group btn-group-sm" role="group" aria-label="${esc(I18n.t("ugyletLabel"))}">
                                ${[["", "agAll"], ["elado", "ugyletElado"], ["kiado", "ugyletKiado"]].filter(([k]) => !k || ugyletek[k]).map(([k, l]) => `<button type="button" class="btn ${f.ugylet === k ? "btn-primary" : "btn-outline-primary"}" data-ugylet="${k}">${I18n.t(l)}</button>`).join("")}
                            </div>
                            <select class="form-select form-select-sm w-auto" id="agProfSort" aria-label="${esc(I18n.t("agSort"))}">
                                ${[["uj", "agSort_uj"], ["arNo", "agSort_arNo"], ["arCsokken", "agSort_arCsokken"]].map(([k, l]) => `<option value="${k}" ${f.rendez === k ? "selected" : ""}>${I18n.t(l)}</option>`).join("")}
                            </select>
                        </div>
                    </div>

                    ${Object.keys(tipusok).length > 1 ? `
                    <div class="agTypeFilter mb-3" role="group" aria-label="${esc(I18n.t("agType"))}">
                        <button type="button" class="agTypeChip btn ${!f.tipus ? "active" : ""}" data-tipus="">${I18n.t("agAll")} <b>${ir.hirdetesek.length}</b></button>
                        ${Types.LIST.filter(t => tipusok[t.key]).map(t => `<button type="button" class="agTypeChip btn ${f.tipus === t.key ? "active" : ""}" data-tipus="${t.key}"><i class="${t.icon}" aria-hidden="true"></i> ${I18n.t(t.label)} <b>${tipusok[t.key]}</b></button>`).join("")}
                    </div>` : ""}

                    <div class="row g-3" id="agProfileCards">
                        ${latszik.length ? latszik.map(CardsView.cardHtml).join("") : `<div class="col-12"><div class="emptyState"><i class="fa-solid fa-house" aria-hidden="true"></i><h5>${I18n.t("agNoPublicListings")}</h5></div></div>`}
                    </div>
                    ${lista.length > latszik.length ? `<div class="text-center mt-3"><button type="button" class="btn btn-outline-primary" id="agMore">${I18n.f("agShowMore", { n: lista.length - latszik.length })}</button></div>` : ""}
                </div>

                <div class="col-xl-3">
                    ${aktivUgynokok.length ? `
                    <div class="card mb-4">
                        <div class="card-header"><h6 class="mb-0"><i class="fa-solid fa-id-badge" aria-hidden="true"></i> ${I18n.t("agTabAgents")}</h6></div>
                        <ul class="list-group list-group-flush">
                            ${aktivUgynokok.map(u => `
                                <li class="list-group-item d-flex gap-3 align-items-center">
                                    <span class="accAvatar small" aria-hidden="true">${esc((u.nev || "?").slice(0, 1).toUpperCase())}</span>
                                    <div class="min-w-0 small">
                                        <b class="d-block text-truncate">${esc(u.nev)}</b>
                                        ${u.aktiv_db ? `<span class="text-body-secondary d-block">${I18n.f("agAgentListings", { n: u.aktiv_db })}</span>` : ""}
                                        ${u.telefon ? `<a class="d-block" href="tel:${esc(u.telefon.replace(/\s/g, ""))}"><i class="fa-solid fa-phone" aria-hidden="true"></i> ${esc(u.telefon)}</a>` : ""}
                                        ${u.email ? `<a class="d-block text-truncate" href="mailto:${esc(u.email)}"><i class="fa-regular fa-envelope" aria-hidden="true"></i> ${esc(u.email)}</a>` : ""}
                                    </div>
                                </li>`).join("")}
                        </ul>
                    </div>` : ""}

                    ${ir.cui || ir.hivatalos_nev ? `
                    <div class="card mb-4 agCompanyCard">
                        <div class="card-header"><h6 class="mb-0"><i class="fa-solid fa-building-columns" aria-hidden="true"></i> ${I18n.t("agCompanyInfo")}</h6></div>
                        <div class="card-body small">
                            <dl class="anafList mb-2">
                                ${ir.hivatalos_nev ? `<dt>${I18n.t("agOfficialName")}</dt><dd>${esc(ir.hivatalos_nev)}</dd>` : ""}
                                ${ir.cui ? `<dt>${I18n.t("anafCui")}</dt><dd>${esc(ir.cui)}</dd>` : ""}
                                ${ir.reg_com ? `<dt>${I18n.t("anafRegCom")}</dt><dd>${esc(ir.reg_com)}</dd>` : ""}
                                ${ir.hivatalos_cim ? `<dt>${I18n.t("anafAddress")}</dt><dd>${esc(ir.hivatalos_cim)}</dd>` : ""}
                                ${ir.caen ? `<dt>${I18n.t("anafCaen")}</dt><dd>${esc(ir.caen)}${AgencyAnaf.caenNev(ir.caen) ? " – " + esc(AgencyAnaf.caenNev(ir.caen)) : ""}</dd>` : ""}
                            </dl>
                            <p class="text-body-secondary mb-0">${I18n.t("agCompanyInfoNote")}</p>
                        </div>
                    </div>` : ""}

                    <div class="card helpCard">
                        <div class="card-body small">
                            <p class="mb-2">${I18n.t("agReportHint")}</p>
                            <a href="#jogi/bejelentes">${I18n.t("legalReport")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
                        </div>
                    </div>
                </div>
            </div>`;

        // Kártyák
        box.querySelectorAll("#agProfileCards .listingCard").forEach(card => {
            card.addEventListener("click", e => {
                const favBtn = e.target.closest("[data-fav]");
                if (favBtn) {
                    e.stopPropagation();
                    DataManager.toggleFavorite(Number(favBtn.dataset.fav));
                    return;
                }
                ListingPage.open(Number(card.dataset.id));
            });
        });

        // Szűrők
        box.querySelectorAll("[data-tipus]").forEach(b => b.onclick = () => { f.tipus = b.dataset.tipus; f.mennyi = 24; AgencyProfile.render(ir); });
        box.querySelectorAll("[data-ugylet]").forEach(b => b.onclick = () => { f.ugylet = b.dataset.ugylet; f.mennyi = 24; AgencyProfile.render(ir); });
        const sort = document.getElementById("agProfSort");
        if (sort) sort.onchange = () => { f.rendez = sort.value; AgencyProfile.render(ir); };
        const tobb = document.getElementById("agMore");
        if (tobb) tobb.onclick = () => { f.mennyi += 24; AgencyProfile.render(ir); };

        const adm = document.getElementById("agAdminOpen");
        if (adm) adm.onclick = () => { AdminManager.tab = "irodak"; location.hash = "#admin"; };

    }

}
