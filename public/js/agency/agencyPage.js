// ============================================================
//  Ingatlaniroda
//
//   #iroda                 az irodám kezelése (ha több van: az első)
//   #iroda/<id>            egy adott irodám
//   #iroda/uj              új iroda regisztrálása (a cég adószámával –
//                          az ANAF-adatokat azonnal megmutatjuk), és a
//                          meghívások elfogadása
//   #irodak, #irodak/<id>  a nyilvános irodalista és adatlap (agencyDirectory.js)
//
//  Az új iroda jóváhagyásra vár (az admin az ANAF-adatok alapján hagyja
//  jóvá); addig is kezelhető, de nyilvánosan nem látszik.
//
//  MUNKATERÜLET (2026-11): az iroda minden munkája egy helyen, bal oldali menüvel
//  (telefonon felül görgethető sávval). Egy szint, nincs fül a fülben:
//   Munka      Áttekintés (teendők, gyorskereső, megtekintések, a hirdetések gondjai)
//              Beérkező (megtekintés-kérések, „hívom” jelzések, üzenetek)
//              Naptár (megtekintések) · Feladatok
//   Ügyfelek   Ügyfelek (lista / tábla) · Ajánlatok
//   Hirdetések az iroda hirdetései – az ügynök csak a sajátjait látja
//   Iroda      Csapat (ügynökök + belépés, a csomag létszáma) · Iroda és csomag
//              (csak a vezetőnek; az ügynök a saját kártyáját látja: „Profilom”)
//  A régi címek (…:crm, …:ugynokok, …:tagok, …:adatok) a megfelelő oldalra visznek.
// ============================================================

class AgencyPage {

    static iroda = null;          // a kezelt iroda (nyilvános adatokkal, ügynökökkel)
    static hirdetesek = [];
    static tab = "attekintes";
    static kijelolt = new Set();
    static szuro = { q: "", statusz: "", ugynok: "", mappa: null, tipus: "", figyelem: "" };
    static rendezes = "uj";

    // A munkaterület menüje (vezeto: csak a vezetőnek; ugynok: csak az ügynöknek)
    static NAV = [
        { cim: "wsGrp_work", elemek: [
            { key: "attekintes", icon: "fa-solid fa-gauge-high" },
            { key: "beerkezo", icon: "fa-solid fa-inbox" },
            { key: "naptar", icon: "fa-regular fa-calendar" },
            { key: "feladatok", icon: "fa-solid fa-list-check" }] },
        { cim: "wsGrp_clients", elemek: [
            { key: "ugyfelek", icon: "fa-solid fa-address-book" },
            { key: "ajanlatok", icon: "fa-solid fa-hand-holding-dollar" }] },
        { cim: "wsGrp_listings", elemek: [
            { key: "hirdetesek", icon: "fa-solid fa-house-user" }] },
        { cim: "wsGrp_agency", elemek: [
            { key: "csapat", icon: "fa-solid fa-people-group", vezeto: true },
            { key: "iroda", icon: "fa-solid fa-building", vezeto: true },
            { key: "csapat", icon: "fa-solid fa-id-badge", ugynok: true, label: "wsNav_profil" }] }
    ];

    // Régi fül-nevek → az új oldalak
    static REGI = { crm: "attekintes", ugynokok: "csapat", tagok: "csapat", adatok: "iroda", keresek: "beerkezo", megtekintesek: "naptar" };
    static KULCSOK = ["attekintes", "beerkezo", "naptar", "feladatok", "ugyfelek", "ajanlatok", "hirdetesek", "csapat", "iroda"];

    // A CRM nézetei ↔ a munkaterület oldalai
    static CRM_NEZET = { attekintes: "attekintes", beerkezo: "beerkezoKomb", naptar: "megtekintesek", feladatok: "feladatok", ugyfelek: "ugyfelek", ajanlatok: "ajanlatok" };

    static vezeto() {
        const ir = AgencyPage.iroda;
        return AuthManager.isAdmin() || !!(ir && (AuthManager.irodak.find(x => x.id === ir.id) || {}).szerep === "vezeto");
    }

    static box() {
        return document.getElementById("irodaContent");
    }

    static spinner() {
        AgencyPage.box().innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;
    }

    static json(r) {
        return r.json().then(v => {
            if (!r.ok) {
                const e = new Error(v.error || ("HTTP " + r.status));
                e.kod = v.error;
                throw e;
            }
            return v;
        });
    }

    static hibaSzoveg(e) {
        const k = "agErr_" + (e && e.kod);
        return I18n.t(k) !== k ? I18n.t(k) : I18n.t("alertSaveError");
    }

    static api(url, method = "GET", body) {
        return fetch(url, {
            method,
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined
        }).then(AgencyPage.json);
    }

    // ---------- belépési pont ----------

    static show(param) {

        if (!AuthManager.loggedIn()) return;

        const [elso, masodik] = String(param || "").split(":");

        if (elso === "uj" || (!AuthManager.irodak.length && !elso)) {
            return AgencyPage.letrehozas();
        }

        const id = Number(elso) || (AuthManager.irodak[0] && AuthManager.irodak[0].id);

        const kulcs = AgencyPage.REGI[masodik] || masodik;
        if (kulcs && AgencyPage.KULCSOK.includes(kulcs)) AgencyPage.tab = kulcs;

        if (!AgencyPage.iroda || AgencyPage.iroda.id !== id) {
            AgencyPage.kijelolt.clear();
            AgencyPage.szuro = { q: "", statusz: "", ugynok: "", mappa: null, tipus: "", figyelem: "" };
        }

        AgencyPage.spinner();

        Promise.all([
            AgencyPage.api("/api/irodak/" + id),
            AgencyPage.api(`/api/irodak/${id}/hirdetesek`).catch(() => [])
        ]).then(([iroda, hirdetesek]) => {

            if (!iroda.jog || !iroda.jog.tag) {
                location.hash = "#irodak/" + id;
                return;
            }

            DataManager.prepare(hirdetesek);
            AgencyPage.iroda = iroda;
            AgencyPage.hirdetesek = hirdetesek;
            AgencyPage.render();

        }).catch(() => {
            AgencyPage.box().innerHTML = `<div class="emptyState"><i class="fa-solid fa-circle-exclamation"></i><h5>${I18n.t("listingNotFound")}</h5></div>`;
        });

    }

    static rerender() {
        if (PageManager.current === "iroda" && AgencyPage.iroda) AgencyPage.render();
    }

    static reload() {
        AuthManager.refresh().then(() => AgencyPage.show(String(AgencyPage.iroda ? AgencyPage.iroda.id : "")));
    }

    // ---------- meghívások ----------

    static meghivasHtml(lista) {
        const esc = Utils.escape;
        if (!lista || !lista.length) return "";
        return `
            <div class="card agInviteCard mb-4">
                <div class="card-body">
                    <h6 class="mb-3"><i class="fa-solid fa-envelope-open-text" aria-hidden="true"></i> ${I18n.t("agInvitesTitle")}</h6>
                    ${lista.map(m => `
                        <div class="agInviteRow">
                            <div class="min-w-0">
                                <b>${esc(m.nev)}</b>
                                <div class="small text-body-secondary">${I18n.f("agInvitedBy", { nev: esc(m.meghivta_nev || "?"), szerep: I18n.t(m.szerep === "vezeto" ? "agRoleManager" : "agRoleMember") })}</div>
                            </div>
                            <div class="d-flex gap-2">
                                <button type="button" class="btn btn-sm btn-primary" data-invite-ok="${m.id}"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("agInviteAccept")}</button>
                                <button type="button" class="btn btn-sm btn-outline-secondary" data-invite-no="${m.id}">${I18n.t("agInviteDecline")}</button>
                            </div>
                        </div>`).join("")}
                </div>
            </div>`;
    }

    static meghivasKotes(root) {
        const valasz = (id, elfogad) => AgencyPage.api(`/api/irodak/${id}/meghivas`, "POST", { elfogad })
            .then(() => AuthManager.refresh())
            .then(() => { location.hash = elfogad ? "#iroda/" + id : "#iroda"; AgencyPage.show(elfogad ? String(id) : ""); })
            .catch(e => alert(AgencyPage.hibaSzoveg(e)));
        root.querySelectorAll("[data-invite-ok]").forEach(b => b.onclick = () => valasz(Number(b.dataset.inviteOk), true));
        root.querySelectorAll("[data-invite-no]").forEach(b => b.onclick = () => {
            if (confirm(I18n.t("agInviteDeclineConfirm"))) valasz(Number(b.dataset.inviteNo), false);
        });
    }

    // ---------- új iroda ----------

    static letrehozas() {

        document.body.classList.remove("wsMode");

        AgencyPage.iroda = null;
        const esc = Utils.escape;

        AgencyPage.box().innerHTML = `
            <div class="pageHeader">
                <div class="pageHeaderRow">
                    <div>
                        <h2 class="mb-0"><i class="fa-solid fa-briefcase"></i> ${I18n.t("agCreateTitle")}</h2>
                        <p class="text-body-secondary mb-0">${I18n.t("agCreateSub2")}</p>
                    </div>
                    <a class="btn btn-outline-secondary btn-sm" href="#irodak"><i class="fa-solid fa-list" aria-hidden="true"></i> ${I18n.t("agDirTitle")}</a>
                </div>
            </div>
            ${AgencyPage.meghivasHtml(AuthManager.irodaMeghivasok)}
            <div class="row g-4">
                <div class="col-lg-7">
                    <form class="card" id="agCreate" novalidate>
                        <div class="card-body stepForm">
                            <div class="stepBlock">
                                <div class="stepHead"><span class="stepNo">1</span> ${I18n.t("agCreateStep1")}</div>
                                <p class="small text-body-secondary mb-2">${I18n.t("agCreateStep1Help")}</p>
                                <label class="form-label req" for="agCui">${I18n.t("anafCui")}</label>
                                <div class="input-group">
                                    <input class="form-control" id="agCui" name="cui" maxlength="20" required placeholder="RO12345678" autocomplete="off">
                                    <button class="btn btn-outline-primary" type="button" id="agCuiCheck"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> ${I18n.t("agCuiCheck")}</button>
                                </div>
                                <div id="agAnafResult" class="mt-2" aria-live="polite"></div>
                            </div>
                            <div class="stepBlock">
                                <div class="stepHead"><span class="stepNo">2</span> ${I18n.t("agCreateStep2")}</div>
                                ${AgencyPage.adatUrlap({}, true)}
                            </div>
                            <div class="stepBlock" id="agStep3" hidden>
                                <div class="stepHead"><span class="stepNo">3</span> ${I18n.t("agCreateStep3")}</div>
                                <p class="small text-body-secondary mb-0">${I18n.t("agCreateStep3Help")}</p>
                            </div>
                            <div class="accMsg alert alert-danger small py-2 mt-3" hidden></div>
                            <div class="d-flex gap-2 justify-content-end mt-3">
                                ${AuthManager.irodak.length ? `<a class="btn btn-outline-secondary" href="#iroda">${I18n.t("cancel")}</a>` : ""}
                                <button class="btn btn-primary" type="submit"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t("agCreateBtn2")}</button>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="col-lg-5">
                    <div class="card agBenefits mb-4">
                        <div class="card-body">
                            <h6>${I18n.t("agWhatTitle")}</h6>
                            <ul class="small mb-0">
                                <li>${I18n.t("agWhat1")}</li>
                                <li>${I18n.t("agWhat2")}</li>
                                <li>${I18n.t("agWhat3")}</li>
                                <li>${I18n.t("agWhat4")}</li>
                                <li>${I18n.t("agWhat5")}</li>
                            </ul>
                        </div>
                    </div>
                    <div class="card helpCard">
                        <div class="card-body small">
                            <h6><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ${I18n.t("agVerifyHowTitle")}</h6>
                            <ol class="mb-0 ps-3">
                                <li>${I18n.t("agVerifyHow1")}</li>
                                <li>${I18n.t("agVerifyHow2")}</li>
                                <li>${I18n.t("agVerifyHow3")}</li>
                            </ol>
                        </div>
                    </div>
                </div>
            </div>`;

        AgencyPage.meghivasKotes(AgencyPage.box());

        // Ha az iroda csak irodai csomaggal lesz aktív: a 3. lépés (fizetés)
        fetch("/api/csomagok").then(r => r.json()).then(v => {
            const el = document.getElementById("agStep3");
            if (el && v && v.iroda_csomag_kell) el.hidden = false;
        }).catch(() => { });

        const form = document.getElementById("agCreate");
        const msg = form.querySelector(".accMsg");
        const eredmeny = document.getElementById("agAnafResult");

        // Cégadatok az ANAF-ból: a hivatalos név, cím, cégjegyzékszám kitöltése
        const ellenoriz = () => {
            const cui = document.getElementById("agCui").value.trim();
            if (!cui) { document.getElementById("agCui").focus(); return Promise.resolve(null); }
            eredmeny.innerHTML = `<div class="spinner-border spinner-border-sm text-primary"></div> <span class="small text-body-secondary">${I18n.t("agCuiChecking")}</span>`;
            return AgencyAnaf.lekerdez(cui).then(v => {
                eredmeny.innerHTML = AgencyAnaf.html(v);
                if (v.talalt && v.adat) {
                    const d = v.adat;
                    const tolt = (nev, ertek) => { const el = form.querySelector(`[name="${nev}"]`); if (el && !el.value.trim() && ertek) el.value = ertek; };
                    tolt("nev", d.nev);
                    tolt("cim", d.cim);
                    tolt("reg_com", d.regCom);
                }
                return v;
            }).catch(err => {
                eredmeny.innerHTML = `<div class="anafBox warn"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(AgencyAnaf.hibaSzoveg(err))}</div>`;
                return null;
            });
        };

        document.getElementById("agCuiCheck").onclick = ellenoriz;
        document.getElementById("agCui").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); ellenoriz(); } };

        form.onsubmit = e => {
            e.preventDefault();
            msg.hidden = true;
            const adat = { ...AgencyPage.urlapAdat(form), cui: document.getElementById("agCui").value.trim() };
            const gomb = form.querySelector('button[type="submit"]');
            gomb.disabled = true;
            AgencyPage.api("/api/irodak", "POST", adat)
                .then(ir => AuthManager.refresh().then(() => { location.hash = "#iroda/" + ir.id; }))
                .catch(err => { msg.hidden = false; msg.innerText = AgencyPage.hibaSzoveg(err); })
                .finally(() => { gomb.disabled = false; });
        };

    }

    // Az iroda adatai (új irodánál és a szerkesztésnél ugyanaz)
    static adatUrlap(ir, uj) {
        const esc = Utils.escape;
        return `
            <div class="row g-3">
                <div class="col-12">
                    <label class="form-label req" for="agNev">${I18n.t("agName")}</label>
                    <input class="form-control" id="agNev" name="nev" maxlength="120" required value="${esc(ir.nev || "")}">
                    <div class="form-text">${I18n.t(uj ? "agNameHelpNew" : "agNameHelp")}</div>
                </div>
                ${uj ? "" : `
                <div class="col-md-6">
                    <label class="form-label" for="agCuiEd">${I18n.t("anafCui")}</label>
                    <input class="form-control" id="agCuiEd" name="cui" maxlength="20" value="${esc(ir.cui || "")}" placeholder="RO12345678">
                </div>`}
                <div class="col-md-6">
                    <label class="form-label" for="agRegCom">${I18n.t("anafRegCom")}</label>
                    <input class="form-control" id="agRegCom" name="reg_com" maxlength="40" value="${esc(ir.reg_com || "")}" placeholder="J14/123/2020">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="agTel">${I18n.t("accPhone")}</label>
                    <input class="form-control" id="agTel" name="telefon" type="tel" maxlength="40" value="${esc(ir.telefon || "")}">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="agEmail">${I18n.t("authEmail")}</label>
                    <input class="form-control" id="agEmail" name="email" type="email" maxlength="160" value="${esc(ir.email || "")}">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="agWeb">${I18n.t("agWebsite")}</label>
                    <input class="form-control" id="agWeb" name="weboldal" maxlength="300" placeholder="https://" value="${esc(ir.weboldal || "")}">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="agVaros">${I18n.t("newVaros")}</label>
                    <select class="form-select" id="agVaros" name="varos">
                        <option value="">—</option>
                        ${(CityManager.varosok || []).map(v => `<option value="${esc(v.nev)}" ${v.nev === ir.varos ? "selected" : ""}>${esc(CityManager.displayName(v.nev))}</option>`).join("")}
                    </select>
                </div>
                <div class="col-12">
                    <label class="form-label" for="agCim">${I18n.t("agAddress")}</label>
                    <input class="form-control" id="agCim" name="cim" maxlength="200" value="${esc(ir.cim || "")}">
                </div>
                <div class="col-12">
                    <label class="form-label" for="agLeiras">${I18n.t("agAbout")}</label>
                    <textarea class="form-control" id="agLeiras" name="leiras" rows="4" maxlength="3000" placeholder="${esc(I18n.t("agAboutPh"))}">${esc(ir.leiras || "")}</textarea>
                </div>
            </div>`;
    }

    static urlapAdat(form) {
        const o = {};
        ["nev", "telefon", "email", "weboldal", "varos", "cim", "leiras", "reg_com", "cui"].forEach(k => {
            const el = form.querySelector(`[name="${k}"]`);
            if (el) o[k] = el.value.trim();
        });
        return o;
    }

    // ---------- keret ----------

    static render() {

        const ir = AgencyPage.iroda;
        const esc = Utils.escape;
        const tobb = AuthManager.irodak.length > 1;
        const vezeto = AgencyPage.vezeto();
        const statusz = ir.statusz || "fuggo";
        const zarolt = AgencyPage.zarolt();
        if (!vezeto && AgencyPage.tab === "iroda") AgencyPage.tab = "attekintes";
        const tab = AgencyPage.tab;
        const navCim = e => I18n.t(e.label || "wsNav_" + e.key);

        document.body.classList.add("wsMode");
        try { localStorage.setItem("ip_mod", "munka"); } catch (e) { /* nem baj */ }

        const aktivElem = AgencyPage.NAV.flatMap(g => g.elemek).find(e => e.key === tab && (!e.vezeto || vezeto) && (!e.ugynok || !vezeto)) || {};

        AgencyPage.box().innerHTML = `
            <div class="ws">
                <aside class="wsSide" aria-label="${esc(I18n.t("wsTitle"))}">
                    <div class="wsAgency">
                        ${AgencyUI.logo(ir, "sm")}
                        <div class="min-w-0">
                            <b class="d-block text-truncate">${esc(ir.nev)} ${AgencyUI.verifiedBadge(ir)}</b>
                            <span class="small text-body-secondary">${I18n.t(vezeto ? "agRoleManager" : "wsRoleAgent")}</span>
                        </div>
                    </div>
                    ${tobb ? `<select class="form-select form-select-sm mb-2" id="agSwitch" aria-label="${esc(I18n.t("agSwitch"))}">
                        ${AuthManager.irodak.map(x => `<option value="${x.id}" ${x.id === ir.id ? "selected" : ""}>${esc(x.nev)}</option>`).join("")}
                    </select>` : ""}
                    <nav class="wsNav">
                        ${AgencyPage.NAV.map(g => {
                            const el = g.elemek.filter(e => (!e.vezeto || vezeto) && (!e.ugynok || !vezeto));
                            if (!el.length) return "";
                            return `<div class="wsNavGroup"><span class="wsNavHead">${I18n.t(g.cim)}</span>
                                ${el.map(e => `
                                    <a class="wsNavItem ${e.key === tab ? "active" : ""}" href="#iroda/${ir.id}:${e.key}" ${e.key === tab ? 'aria-current="page"' : ""}>
                                        <i class="${e.icon} fa-fw" aria-hidden="true"></i><span>${navCim(e)}</span>
                                        ${e.key === "beerkezo" ? `<span class="badge rounded-pill text-bg-danger crmReqBadge" hidden></span><span class="badge rounded-pill text-bg-warning crmInboxBadge" hidden></span>` : ""}
                                        ${e.key === "ajanlatok" ? `<span class="badge rounded-pill text-bg-danger crmOfferBadge" hidden></span>` : ""}
                                        ${e.key === "hirdetesek" ? `<span class="wsNavCount">${AgencyPage.hirdetesek.length}</span>` : ""}
                                    </a>`).join("")}
                            </div>`;
                        }).join("")}
                    </nav>
                    <div class="wsSideFoot">
                        <a href="#irodak/${ir.id}"><i class="fa-solid fa-arrow-up-right-from-square fa-fw" aria-hidden="true"></i> ${I18n.t("agPublicPage")}</a>
                        <a href="#home" data-wsexit><i class="fa-solid fa-magnifying-glass fa-fw" aria-hidden="true"></i> ${I18n.t("wsExit")}</a>
                    </div>
                </aside>

                <main class="wsMain">
                    ${AgencyPage.meghivasHtml(AuthManager.irodaMeghivasok)}
                    ${zarolt ? `
                    <div class="alert alert-info agStatusBar d-flex gap-3 align-items-start">
                        <i class="fa-solid fa-key fs-4" aria-hidden="true"></i>
                        <div class="flex-fill">
                            <b>${I18n.t("agActivateTitle")}</b>
                            <div class="small">${I18n.t(vezeto ? "agActivateText" : "agActivateTextMember")}</div>
                        </div>
                        ${vezeto ? `<a class="btn btn-primary btn-sm text-nowrap" href="#csomagok/iroda">${I18n.t("agActivateBtn")}</a>` : ""}
                    </div>` : ""}
                    ${statusz !== "jovahagyva" ? `
                    <div class="alert ${statusz === "fuggo" ? "alert-warning" : "alert-danger"} agStatusBar d-flex gap-3 align-items-start">
                        <i class="fa-solid ${statusz === "fuggo" ? "fa-hourglass-half" : "fa-ban"} fs-4" aria-hidden="true"></i>
                        <div>
                            <b>${I18n.t("agStatusTitle_" + statusz)}</b>
                            <div class="small">${I18n.t("agStatusText_" + statusz)}</div>
                            ${ir.dontes_ok ? `<div class="small mt-1"><b>${I18n.t("agReason")}:</b> ${esc(ir.dontes_ok)}</div>` : ""}
                        </div>
                    </div>` : ""}
                    <div class="wsHead">
                        <div class="min-w-0">
                            <h1 class="wsTitle">${esc(navCim(aktivElem.key ? aktivElem : { key: tab }))}</h1>
                            <p class="wsHelp">${I18n.t((vezeto ? "wsHelp_" : "wsHelpA_") + (aktivElem.label === "wsNav_profil" ? "profil" : tab))}</p>
                        </div>
                        <div class="wsActions">
                            <button class="btn btn-primary btn-sm" id="agNewListing" ${zarolt ? "disabled" : ""}><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("navPost")}</button>
                        </div>
                    </div>
                    <div id="agBody"></div>
                </main>
            </div>`;

        const sw = document.getElementById("agSwitch");
        if (sw) sw.onchange = () => { location.hash = `#iroda/${sw.value}:${AgencyPage.tab}`; };
        const exit = AgencyPage.box().querySelector("[data-wsexit]");
        if (exit) exit.onclick = () => { try { localStorage.setItem("ip_mod", "bongesz"); } catch (e) { /* nem baj */ } };

        AgencyPage.meghivasKotes(AgencyPage.box());

        document.getElementById("agNewListing").onclick = () => {
            NewPropertyManager.prefIroda = ir.id;
            NewPropertyManager.editId = null;
            PageManager.show("new");
        };

        const body = document.getElementById("agBody");

        // Csomaghoz kötött, még nem aktív iroda: csak az áttekintés és az iroda adatai
        if (zarolt && !["attekintes", "iroda"].includes(tab)) {
            body.innerHTML = `
                <div class="emptyState">
                    <i class="fa-solid fa-lock"></i>
                    <h5>${I18n.t("agActivateTitle")}</h5>
                    <p>${I18n.t("agLockedTab")}</p>
                    ${vezeto ? `<a class="btn btn-primary btn-sm" href="#csomagok/iroda">${I18n.t("agActivateBtn")}</a>` : ""}
                </div>`;
            return;
        }

        // A számlálók a menüben (új kérések, üzenetek, ajánlatok)
        if (!zarolt) fetch(`/api/crm/${ir.id}/attekintes`).then(r => r.ok ? r.json() : null).then(a => {
            if (!a) return;
            const jel = (sel, n) => { const b = AgencyPage.box().querySelector(sel); if (b) { b.textContent = n; b.hidden = !n; } };
            jel(".wsNav .crmReqBadge", (a.uj_keres || 0) + (a.hivas_jelzes || 0));
            jel(".wsNav .crmInboxBadge", a.beerkezett || 0);
            jel(".wsNav .crmOfferBadge", a.uj_ajanlat || 0);
        }).catch(() => { });

        if (AgencyPage.CRM_NEZET[tab]) {
            if (tab === "attekintes") return AgencyPage.attekintesTab(body, vezeto);
            return Crm.mount(body, { ter: ir.id, nezet: AgencyPage.CRM_NEZET[tab], beagyazott: true });
        }
        ({
            hirdetesek: () => AgencyPage.hirdetesTab(body),
            csapat: () => AgencyPage.csapatTab(body, vezeto),
            iroda: () => AgencyPage.irodaTab(body)
        })[tab]();

    }

    // Csomaghoz kötött iroda, amelynek még nincs kifizetett csomagja
    static zarolt() {
        const c = AgencyPage.iroda && AgencyPage.iroda.csomag;
        return !!(c && c.kell && !c.aktiv) && !AuthManager.isAdmin();
    }

    // ---------- áttekintés ----------

    // Mire kell figyelni (a Hirdetések fül szűrője is ezt használja)
    static FIGYELEM = {
        fuggo: i => AgencyPage.statuszOf(i) === "fuggo",
        ugynok: i => AgencyPage.statuszOf(i) === "aktiv" && !i.ugynok_id,
        foto: i => AgencyPage.statuszOf(i) === "aktiv" && !Utils.photoUrl(i),
        ar: i => AgencyPage.statuszOf(i) === "aktiv" && !(Number(i.ar) > 0),
        regi: i => AgencyPage.statuszOf(i) === "aktiv" && (Date.now() - new Date(i.updated_at || i.created_at || 0).getTime()) > 60 * 86400000
    };

    // Áttekintés: az első lépések (a vezetőnek, amíg nincs kész), a CRM teendői
    // (gyorskereső, kérések, megtekintések, feladatok), és a hirdetések gondjai
    static attekintesTab(el, vezeto) {

        const ir = AgencyPage.iroda;
        const L = AgencyPage.hirdetesek;
        const szam = s => L.filter(i => AgencyPage.statuszOf(i) === s).length;
        const fig = Object.fromEntries(Object.entries(AgencyPage.FIGYELEM).map(([k, f]) => [k, L.filter(f).length]));
        const figOssz = Object.values(fig).reduce((a, b) => a + b, 0);

        el.innerHTML = `
            <div id="wsSetup"></div>
            <div id="wsCrm"></div>
            <div class="card mt-4">
                <div class="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
                    <h6 class="mb-0"><i class="fa-solid fa-house-user" aria-hidden="true"></i> ${I18n.t(vezeto ? "wsListingsAgency" : "wsListingsMine")}</h6>
                    <a class="btn btn-link btn-sm p-0" href="#iroda/${ir.id}:hirdetesek">${I18n.t("crmAll")}</a>
                </div>
                <div class="card-body">
                    <div class="wsMini">
                        ${[["aktiv", "fa-circle-check", "green"], ["fuggo", "fa-hourglass-half", "amber"], ["eladva", "fa-handshake", "red"], ["archiv", "fa-box-archive", ""]].map(([k, i, c]) => `
                            <button type="button" class="wsMiniItem ${c}" data-go-stat="${k}"><i class="fa-solid ${i}" aria-hidden="true"></i><b>${szam(k)}</b><span>${I18n.t("agStatus_" + k)}</span></button>`).join("")}
                    </div>
                    ${figOssz ? `
                    <div class="list-group list-group-flush mt-3">
                        ${Object.entries(fig).filter(([, n]) => n).map(([k, n]) => `
                            <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center gap-2 px-0" data-go-fig="${k}">
                                <span><b>${I18n.t("agAttn_" + k)}</b><span class="d-block small text-body-secondary">${I18n.t("agAttnHint_" + k)}</span></span>
                                <span class="badge rounded-pill text-bg-warning">${n}</span>
                            </button>`).join("")}
                    </div>` : `<div class="small text-success mt-3"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${I18n.t("agAttnNone")}</div>`}
                </div>
            </div>`;

        const hirdetesekre = () => { location.hash = `#iroda/${ir.id}:hirdetesek`; };
        el.querySelectorAll("[data-go-stat]").forEach(b => b.onclick = () => { Object.assign(AgencyPage.szuro, { statusz: b.dataset.goStat, figyelem: "" }); hirdetesekre(); });
        el.querySelectorAll("[data-go-fig]").forEach(b => b.onclick = () => { Object.assign(AgencyPage.szuro, { statusz: "", figyelem: b.dataset.goFig }); hirdetesekre(); });

        if (!AgencyPage.zarolt()) Crm.mount(el.querySelector("#wsCrm"), { ter: ir.id, nezet: "attekintes", beagyazott: true });

        // Első lépések (a vezetőnek): ami kész, kipipálva; ha minden kész, eltűnik
        if (!vezeto) return;
        AgencyPage.api(`/api/irodak/${ir.id}/csapat`).catch(() => null).then(cs => {
            const lepesek = [
                { ok: !!(ir.telefon && (ir.email || ir.weboldal) && ir.leiras), cim: "agStep_details", tab: "iroda" },
                { ok: !!ir.van_logo, cim: "agStep_logo", tab: "iroda" },
                { ok: !!(cs && cs.csapat.filter(a => a.allapot !== "kapcsolattarto").length > 1), cim: "wsStep_team", tab: "csapat" },
                { ok: L.length > 0, cim: "agStep_listing", tab: "hirdetesek" }
            ];
            if (ir.csomag && ir.csomag.kell) lepesek.unshift({ ok: !!ir.csomag.aktiv, cim: "agStep_package", link: "#csomagok/iroda" });
            const hatra = lepesek.filter(l => !l.ok).length;
            const box = el.querySelector("#wsSetup");
            if (!hatra || !box) return;
            box.innerHTML = `
                <div class="card wsSetup mb-4">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="mb-0"><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${I18n.t("agStepsTitle")}</h6>
                            <span class="small text-body-secondary">${I18n.f("wsStepsLeft", { n: hatra })}</span>
                        </div>
                        <div class="wsSteps">
                            ${lepesek.map(l => `
                                <a class="wsStep ${l.ok ? "done" : ""}" href="${l.link || `#iroda/${ir.id}:${l.tab}`}">
                                    <i class="fa-${l.ok ? "solid fa-circle-check" : "regular fa-circle"}" aria-hidden="true"></i> ${I18n.t(l.cim)}
                                </a>`).join("")}
                        </div>
                    </div>
                </div>`;
        });

    }

    // ---------- hirdetések ----------

    static statuszOf(i) {
        if (i.statusz === "archiv") return "archiv";
        if (i.eladva) return "eladva";
        if (i.statusz === "fuggo" || i.ellenorzott === false) return "fuggo";
        if (i.statusz === "nem_elerheto") return "nem_elerheto";
        return "aktiv";
    }

    static statuszBadge(i) {
        const s = AgencyPage.statuszOf(i);
        const cls = { aktiv: "text-bg-success", archiv: "text-bg-secondary", eladva: "text-bg-danger", fuggo: "text-bg-warning", nem_elerheto: "text-bg-secondary" }[s];
        return `<span class="badge ${cls}">${I18n.t("agStatus_" + s)}</span>`;
    }

    static mappak() {
        const m = new Map();
        AgencyPage.hirdetesek.forEach(i => {
            const k = i.iroda_mappa || "";
            m.set(k, (m.get(k) || 0) + 1);
        });
        return [...m.entries()].filter(([k]) => k).sort((a, b) => a[0].localeCompare(b[0], "hu"));
    }

    static szurt() {

        const f = AgencyPage.szuro;
        const q = f.q.toLowerCase();

        const lista = AgencyPage.hirdetesek.filter(i => {
            if (f.statusz && AgencyPage.statuszOf(i) !== f.statusz) return false;
            if (f.figyelem && AgencyPage.FIGYELEM[f.figyelem] && !AgencyPage.FIGYELEM[f.figyelem](i)) return false;
            if (f.ugynok === "nincs" && i.ugynok_id) return false;
            if (f.ugynok && f.ugynok !== "nincs" && String(i.ugynok_id) !== f.ugynok) return false;
            if (f.mappa !== null && (i.iroda_mappa || "") !== f.mappa) return false;
            if (f.tipus && i.tipus !== f.tipus) return false;
            if (q) {
                const hay = [i.cim, i.iroda_ref, "#" + i.id, i.kerulet, i.telepules, i.iroda_megjegyzes].filter(Boolean).join(" ").toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        const cmp = {
            uj: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
            regi: (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
            arNo: (a, b) => (a.ar || 0) - (b.ar || 0),
            arCsokken: (a, b) => (b.ar || 0) - (a.ar || 0),
            ref: (a, b) => String(a.iroda_ref || "~").localeCompare(String(b.iroda_ref || "~"), "hu", { numeric: true }),
            erdeklodes: (a, b) => ((b.uzenet_db || 0) + (b.kedvenc_db || 0)) - ((a.uzenet_db || 0) + (a.kedvenc_db || 0))
        }[AgencyPage.rendezes];

        return lista.sort(cmp);

    }

    static hirdetesTab(el) {

        const esc = Utils.escape;
        const ir = AgencyPage.iroda;
        const L = AgencyPage.hirdetesek;
        const szam = s => L.filter(i => AgencyPage.statuszOf(i) === s).length;
        const f = AgencyPage.szuro;
        const mappak = AgencyPage.mappak();
        const nincsMappa = L.filter(i => !i.iroda_mappa).length;

        const ugynokNev = id => {
            const u = ir.ugynokok.find(x => x.id === id);
            return u ? u.nev : "";
        };

        const vezeto = AgencyPage.vezeto();

        el.innerHTML = `
            ${typeof AgencyFeatured !== "undefined" ? AgencyFeatured.kezeloHtml(ir, L, vezeto) : ""}
            <div class="agStats">
                ${[["", "agStatAll", L.length], ["aktiv", "agStatus_aktiv", szam("aktiv")], ["fuggo", "agStatus_fuggo", szam("fuggo")],
                   ["eladva", "agStatus_eladva", szam("eladva")], ["archiv", "agStatus_archiv", szam("archiv")]]
                    .map(([k, l, n]) => `<button type="button" class="agStat ${f.statusz === k ? "active" : ""}" data-stat="${k}"><b>${n}</b><span>${I18n.t(l)}</span></button>`).join("")}
                <div class="agStat static"><b>${L.reduce((s, i) => s + (i.uzenet_db || 0), 0)}</b><span>${I18n.t("agStatMessages")}</span></div>
            </div>

            <div class="row g-4">
                <div class="col-lg-3">
                    <div class="card agFolders">
                        <div class="card-header d-flex align-items-center justify-content-between">
                            <h6 class="mb-0"><i class="fa-regular fa-folder"></i> ${I18n.t("agFolders")}</h6>
                        </div>
                        <div class="list-group list-group-flush">
                            <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between ${f.mappa === null ? "active" : ""}" data-folder="__all">
                                <span><i class="fa-solid fa-layer-group"></i> ${I18n.t("agAllListings")}</span><span class="badge text-bg-light">${L.length}</span>
                            </button>
                            ${mappak.map(([m, n]) => `
                                <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between ${f.mappa === m ? "active" : ""}" data-folder="${esc(m)}">
                                    <span class="text-truncate"><i class="fa-regular fa-folder"></i> ${esc(m)}</span><span class="badge text-bg-light">${n}</span>
                                </button>`).join("")}
                            <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between ${f.mappa === "" ? "active" : ""}" data-folder="">
                                <span class="text-body-secondary"><i class="fa-regular fa-folder-open"></i> ${I18n.t("agNoFolder")}</span><span class="badge text-bg-light">${nincsMappa}</span>
                            </button>
                        </div>
                        <div class="card-body small text-body-secondary">${I18n.t("agFoldersHelp")}</div>
                    </div>
                </div>

                <div class="col-lg-9">
                    <div class="agFilters">
                        <div class="input-group input-group-sm agSearch">
                            <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                            <input type="search" class="form-control" id="agQ" placeholder="${esc(I18n.t("agSearchPh"))}" value="${esc(f.q)}" aria-label="${esc(I18n.t("agSearchPh"))}">
                        </div>
                        ${vezeto ? `<select class="form-select form-select-sm" id="agFAgent" aria-label="${esc(I18n.t("agAgent"))}">
                            <option value="">${I18n.t("agAnyAgent")}</option>
                            ${ir.ugynokok.map(u => `<option value="${u.id}" ${f.ugynok === String(u.id) ? "selected" : ""}>${esc(u.nev)}</option>`).join("")}
                            <option value="nincs" ${f.ugynok === "nincs" ? "selected" : ""}>${I18n.t("agNoAgent")}</option>
                        </select>` : ""}
                        <select class="form-select form-select-sm" id="agFType" aria-label="${esc(I18n.t("agType"))}">
                            <option value="">${I18n.t("agAnyType")}</option>
                            ${Types.LIST.map(t => `<option value="${t.key}" ${f.tipus === t.key ? "selected" : ""}>${I18n.t(t.label)}</option>`).join("")}
                        </select>
                        <select class="form-select form-select-sm" id="agSort" aria-label="${esc(I18n.t("agSort"))}">
                            ${["uj", "regi", "arNo", "arCsokken", "ref", "erdeklodes"].map(k => `<option value="${k}" ${AgencyPage.rendezes === k ? "selected" : ""}>${I18n.t("agSort_" + k)}</option>`).join("")}
                        </select>
                    </div>

                    ${f.figyelem ? `
                    <div class="agFigChip">
                        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${I18n.t("agAttn_" + f.figyelem)}
                        <button type="button" class="btn btn-sm btn-link p-0 ms-2" id="agFigClear">${I18n.t("agFilterClear")}</button>
                    </div>` : ""}

                    <div class="agBulk" id="agBulk" hidden></div>

                    <div id="agList"></div>
                </div>
            </div>`;

        // Események
        if (typeof AgencyFeatured !== "undefined") AgencyFeatured.kot(el);
        el.querySelectorAll("[data-stat]").forEach(b => b.onclick = () => { f.statusz = b.dataset.stat; f.figyelem = ""; AgencyPage.hirdetesTab(el); });
        const figClear = document.getElementById("agFigClear");
        if (figClear) figClear.onclick = () => { f.figyelem = ""; AgencyPage.hirdetesTab(el); };
        el.querySelectorAll("[data-folder]").forEach(b => b.onclick = () => {
            f.mappa = b.dataset.folder === "__all" ? null : b.dataset.folder;
            AgencyPage.hirdetesTab(el);
        });

        let t = null;
        document.getElementById("agQ").oninput = e => {
            clearTimeout(t);
            t = setTimeout(() => { f.q = e.target.value; AgencyPage.lista(ugynokNev); }, 200);
        };
        const fa = document.getElementById("agFAgent");
        if (fa) fa.onchange = e => { f.ugynok = e.target.value; AgencyPage.lista(ugynokNev); };
        document.getElementById("agFType").onchange = e => { f.tipus = e.target.value; AgencyPage.lista(ugynokNev); };
        document.getElementById("agSort").onchange = e => { AgencyPage.rendezes = e.target.value; AgencyPage.lista(ugynokNev); };

        AgencyPage.lista(ugynokNev);

    }

    static lista(ugynokNev) {

        const esc = Utils.escape;
        const box = document.getElementById("agList");
        const lista = AgencyPage.szurt();

        // A már nem látható kijelöléseket elengedjük
        const lathato = new Set(lista.map(i => i.id));
        [...AgencyPage.kijelolt].forEach(id => { if (!lathato.has(id)) AgencyPage.kijelolt.delete(id); });

        if (!AgencyPage.hirdetesek.length) {
            box.innerHTML = `
                <div class="emptyState">
                    <i class="fa-solid fa-house-user"></i>
                    <h5>${I18n.t("agEmpty")}</h5>
                    <p>${I18n.t("agEmptyHint")}</p>
                    <button class="btn btn-outline-primary btn-sm" id="agTakeOver"><i class="fa-solid fa-right-to-bracket"></i> ${I18n.t("agTakeOver")}</button>
                </div>`;
            document.getElementById("agTakeOver").onclick = () => AgencyPage.atvetel();
            AgencyPage.bulkBar();
            return;
        }

        if (!lista.length) {
            box.innerHTML = `<div class="emptyState"><i class="fa-solid fa-filter-circle-xmark"></i><h5>${I18n.t("currentNoResults")}</h5></div>`;
            AgencyPage.bulkBar();
            return;
        }

        const mind = lista.every(i => AgencyPage.kijelolt.has(i.id));

        box.innerHTML = `
            <div class="agTableWrap">
                <table class="table table-hover align-middle agTable">
                    <thead>
                        <tr>
                            <th class="agChk"><input class="form-check-input" type="checkbox" id="agAll" ${mind ? "checked" : ""} aria-label="${esc(I18n.t("agSelectAll"))}"></th>
                            <th>${I18n.t("agColListing")}</th>
                            ${AgencyPage.vezeto() ? `<th class="d-none d-md-table-cell">${I18n.t("agAgent")}</th>` : ""}
                            <th class="d-none d-xl-table-cell">${I18n.t("agFolder")}</th>
                            <th class="text-end">${I18n.t("detailAr")}</th>
                            <th>${I18n.t("agColStatus")}</th>
                            <th class="text-end"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(i => {
                            const foto = Utils.photoUrl(i);
                            return `
                            <tr class="${AgencyPage.kijelolt.has(i.id) ? "table-active" : ""}">
                                <td class="agChk"><input class="form-check-input" type="checkbox" data-sel="${i.id}" ${AgencyPage.kijelolt.has(i.id) ? "checked" : ""} aria-label="#${i.id}"></td>
                                <td>
                                    <div class="d-flex align-items-center gap-2 min-w-0">
                                        <a class="agThumb" href="#listing/${i.id}">${foto ? `<img src="${esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<i class="${Types.get(i.tipus).icon}"></i>`}</a>
                                        <div class="min-w-0">
                                            <a href="#listing/${i.id}" class="fw-semibold d-block text-truncate agTitle">${esc(i.cim || Types.label(i.tipus))}</a>
                                            <div class="small text-body-secondary text-truncate">
                                                ${i.iroda_ref ? `<span class="agRef">${esc(i.iroda_ref)}</span> · ` : ""}#${i.id} · ${esc(CityManager.helyLabel(i))}
                                            </div>
                                            ${i.iroda_megjegyzes ? `<div class="small agNote text-truncate"><i class="fa-regular fa-note-sticky"></i> ${esc(i.iroda_megjegyzes)}</div>` : ""}
                                        </div>
                                    </div>
                                </td>
                                ${AgencyPage.vezeto() ? `<td class="d-none d-md-table-cell small">${i.ugynok_id ? esc(ugynokNev(i.ugynok_id)) : `<span class="text-body-secondary">—</span>`}</td>` : ""}
                                <td class="d-none d-xl-table-cell">${i.iroda_mappa ? `<span class="agFolderChip"><i class="fa-regular fa-folder"></i> ${esc(i.iroda_mappa)}</span>` : ""}</td>
                                <td class="text-end text-nowrap fw-semibold">${Utils.price(i)}</td>
                                <td>
                                    ${AgencyPage.statuszBadge(i)}
                                    <div class="small text-body-secondary text-nowrap mt-1" title="${esc(I18n.t("agInterestHint"))}">
                                        <i class="fa-regular fa-star"></i> ${i.kedvenc_db || 0} · <i class="fa-regular fa-envelope"></i> ${i.uzenet_db || 0}
                                    </div>
                                    <button type="button" class="btn btn-link btn-sm p-0 text-nowrap" data-erd="${i.id}"><i class="fa-solid fa-user-group" aria-hidden="true"></i> ${I18n.f("wsInterested", { n: i.erdeklodo_db || 0 })}</button>
                                </td>
                                <td class="text-end text-nowrap">
                                    <button class="btn btn-sm btn-outline-secondary" data-internal="${i.id}" title="${esc(I18n.t("agInternal"))}" aria-label="${esc(I18n.t("agInternal"))}"><i class="fa-regular fa-note-sticky"></i></button>
                                    <button class="btn btn-sm btn-outline-secondary" data-edit="${i.id}" title="${esc(I18n.t("detailEdit"))}" aria-label="${esc(I18n.t("detailEdit"))}"><i class="fa-solid fa-pen"></i></button>
                                </td>
                            </tr>`;
                        }).join("")}
                    </tbody>
                </table>
            </div>
            <div class="small text-body-secondary">${I18n.f("agShowing", { n: lista.length, ossz: AgencyPage.hirdetesek.length })}</div>`;

        document.getElementById("agAll").onchange = e => {
            lista.forEach(i => e.target.checked ? AgencyPage.kijelolt.add(i.id) : AgencyPage.kijelolt.delete(i.id));
            AgencyPage.lista(ugynokNev);
        };

        box.querySelectorAll("[data-sel]").forEach(cb => {
            cb.onchange = () => {
                const id = Number(cb.dataset.sel);
                cb.checked ? AgencyPage.kijelolt.add(id) : AgencyPage.kijelolt.delete(id);
                cb.closest("tr").classList.toggle("table-active", cb.checked);
                document.getElementById("agAll").checked = lista.every(i => AgencyPage.kijelolt.has(i.id));
                AgencyPage.bulkBar();
            };
        });

        box.querySelectorAll("[data-edit]").forEach(b => {
            b.onclick = () => NewPropertyManager.startEdit({ id: Number(b.dataset.edit) });
        });

        // Érdeklődők: kik érdeklődnek, ki a tulajdonos, megtekintések (CRM)
        box.querySelectorAll("[data-erd]").forEach(b => {
            b.onclick = () => {
                Crm.ter = AgencyPage.iroda.id;
                Crm.api("/tagok").then(v => { Crm.tagok = v.tagok || []; Crm.en = v.en; Crm.vezeto = !!v.vezeto; Crm.ingatlanNyit(Number(b.dataset.erd)); })
                    .catch(e => alert(Crm.hiba(e)));
            };
        });

        box.querySelectorAll("[data-internal]").forEach(b => {
            b.onclick = () => AgencyPage.belsoAdatok(AgencyPage.hirdetesek.find(i => i.id === Number(b.dataset.internal)));
        });

        AgencyPage.bulkBar();

    }

    // Tömeges műveletek a kijelölt hirdetéseken
    static bulkBar() {

        const bar = document.getElementById("agBulk");
        if (!bar) return;

        const n = AgencyPage.kijelolt.size;
        bar.hidden = !n;
        if (!n) return;

        const esc = Utils.escape;
        const ir = AgencyPage.iroda;

        bar.innerHTML = `
            <b>${I18n.f("agSelected", { n })}</b>
            ${AgencyPage.vezeto() ? `<div class="agBulkGroup">
                <select class="form-select form-select-sm" id="agBulkAgent" aria-label="${esc(I18n.t("agAssignAgent"))}">
                    <option value="">${I18n.t("agAssignAgent")}…</option>
                    ${ir.ugynokok.map(u => `<option value="${u.id}">${esc(u.nev)}</option>`).join("")}
                    <option value="0">— ${I18n.t("agNoAgent")}</option>
                </select>
            </div>` : ""}
            <div class="agBulkGroup">
                <input class="form-control form-control-sm" id="agBulkFolder" list="agFolderList" placeholder="${esc(I18n.t("agMoveToFolder"))}" aria-label="${esc(I18n.t("agMoveToFolder"))}">
                <datalist id="agFolderList">${AgencyPage.mappak().map(([m]) => `<option value="${esc(m)}">`).join("")}</datalist>
                <button class="btn btn-sm btn-outline-primary" id="agBulkFolderGo"><i class="fa-regular fa-folder"></i></button>
            </div>
            <div class="agBulkGroup">
                <button class="btn btn-sm btn-outline-secondary" data-bulk="archival"><i class="fa-solid fa-box-archive"></i> ${I18n.t("agArchive")}</button>
                <button class="btn btn-sm btn-outline-success" data-bulk="aktival"><i class="fa-solid fa-rotate-left"></i> ${I18n.t("agActivate")}</button>
                <button class="btn btn-sm btn-outline-danger" data-bulk="eladva"><i class="fa-solid fa-handshake"></i> ${I18n.t("agMarkSold")}</button>
                <button class="btn btn-sm btn-outline-secondary" data-bulk="nem_eladva">${I18n.t("agUnmarkSold")}</button>
                <button class="btn btn-sm btn-danger" data-bulk="torles" aria-label="${esc(I18n.t("detailDelete"))}"><i class="fa-solid fa-trash"></i></button>
            </div>
            <button class="btn btn-sm btn-link ms-auto" id="agBulkClear">${I18n.t("agClearSel")}</button>`;

        const futtat = (muvelet, ertek) => {
            if (muvelet === "torles" && !confirm(I18n.f("agDeleteConfirm", { n }))) return;
            AgencyPage.api(`/api/irodak/${ir.id}/hirdetesek`, "PATCH", { ids: [...AgencyPage.kijelolt], muvelet, ertek })
                .then(v => {
                    Utils.toast(I18n.f("agBulkDone", { n: v.db }));
                    if (muvelet === "torles") AgencyPage.kijelolt.clear();
                    DataManager.init();
                    AgencyPage.show(String(ir.id));
                })
                .catch(e => alert(AgencyPage.hibaSzoveg(e)));
        };

        const ba = document.getElementById("agBulkAgent");
        if (ba) ba.onchange = e => { if (e.target.value !== "") futtat("ugynok", Number(e.target.value) || null); };
        document.getElementById("agBulkFolderGo").onclick = () => futtat("mappa", document.getElementById("agBulkFolder").value.trim());
        document.getElementById("agBulkFolder").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); futtat("mappa", e.target.value.trim()); } };
        bar.querySelectorAll("[data-bulk]").forEach(b => b.onclick = () => futtat(b.dataset.bulk));
        document.getElementById("agBulkClear").onclick = () => {
            AgencyPage.kijelolt.clear();
            AgencyPage.hirdetesTab(document.getElementById("agBody"));
        };

    }

    // Belső adatok egy hirdetéshez: hivatkozási szám, mappa, ügynök, megjegyzés
    static belsoAdatok(i) {

        const esc = Utils.escape;
        const ir = AgencyPage.iroda;

        let el = document.getElementById("agInternalModal");
        if (!el) {
            el = document.createElement("div");
            el.id = "agInternalModal";
            el.className = "modal fade";
            el.tabIndex = -1;
            el.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content"></div></div>`;
            document.body.appendChild(el);
        }

        el.querySelector(".modal-content").innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title text-truncate"><i class="fa-regular fa-note-sticky"></i> ${esc(i.cim || Types.label(i.tipus))}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${I18n.t("close")}"></button>
            </div>
            <div class="modal-body">
                <p class="small text-body-secondary">${I18n.t("agInternalHelp")}</p>
                <div class="row g-3">
                    <div class="col-6">
                        <label class="form-label" for="aiRef">${I18n.t("agRef")}</label>
                        <input class="form-control" id="aiRef" maxlength="40" value="${esc(i.iroda_ref || "")}">
                    </div>
                    <div class="col-6">
                        <label class="form-label" for="aiFolder">${I18n.t("agFolder")}</label>
                        <input class="form-control" id="aiFolder" maxlength="60" list="aiFolderList" value="${esc(i.iroda_mappa || "")}">
                        <datalist id="aiFolderList">${AgencyPage.mappak().map(([m]) => `<option value="${esc(m)}">`).join("")}</datalist>
                    </div>
                    <div class="col-12" ${AgencyPage.vezeto() ? "" : "hidden"}>
                        <label class="form-label" for="aiAgent">${I18n.t("agAgent")}</label>
                        <select class="form-select" id="aiAgent">
                            <option value="">— ${I18n.t("agNoAgent")}</option>
                            ${ir.ugynokok.map(u => `<option value="${u.id}" ${u.id === i.ugynok_id ? "selected" : ""}>${esc(u.nev)}</option>`).join("")}
                        </select>
                    </div>
                    <div class="col-12">
                        <label class="form-label" for="aiNote">${I18n.t("agNote")}</label>
                        <textarea class="form-control" id="aiNote" rows="3" maxlength="2000">${esc(i.iroda_megjegyzes || "")}</textarea>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("cancel")}</button>
                <button type="button" class="btn btn-primary" id="aiSave">${I18n.t("save")}</button>
            </div>`;

        const modal = bootstrap.Modal.getOrCreateInstance(el);

        document.getElementById("aiSave").onclick = () => {
            const body = {
                iroda_ref: document.getElementById("aiRef").value,
                iroda_mappa: document.getElementById("aiFolder").value,
                ugynok_id: document.getElementById("aiAgent").value || null,
                iroda_megjegyzes: document.getElementById("aiNote").value
            };
            AgencyPage.api(`/api/irodak/${ir.id}/hirdetesek/${i.id}`, "PUT", body)
                .then(() => {
                    Object.assign(i, body, { ugynok_id: body.ugynok_id ? Number(body.ugynok_id) : null });
                    modal.hide();
                    AgencyPage.hirdetesTab(document.getElementById("agBody"));
                })
                .catch(e => alert(AgencyPage.hibaSzoveg(e)));
        };

        modal.show();

    }

    static atvetel() {
        if (!confirm(I18n.t("agTakeOverConfirm"))) return;
        AgencyPage.api(`/api/irodak/${AgencyPage.iroda.id}/atvetel`, "POST", {})
            .then(v => {
                Utils.toast(I18n.f("agTakeOverDone", { n: v.db }));
                DataManager.init();
                AgencyPage.show(String(AgencyPage.iroda.id));
            })
            .catch(e => alert(AgencyPage.hibaSzoveg(e)));
    }

    // ---------- ügynökök ----------

    // ---------- csapat (ügynökök + belépés) ----------
    //  Egy lista: minden ügynöknek kártyája van (ez látszik a hirdetésen), és kaphat
    //  belépést (meghívó e-mailben – akkor is, ha még nincs fiókja). A belépők száma a
    //  csomagtól függ. Az ügynök itt csak a saját kártyáját látja (Profilom).

    static csapatTab(el, vezeto) {

        const esc = Utils.escape;
        const ir = AgencyPage.iroda;
        el.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        AgencyPage.api(`/api/irodak/${ir.id}/csapat`).then(d => {

            const h = d.hely || {};
            const tele = h.limit !== null && h.limit !== undefined && h.foglalt >= h.limit;
            const allapot = a => ({
                belepes: `<span class="badge ${a.szerep === "vezeto" ? "text-bg-primary" : "text-bg-success"}">${I18n.t(a.szerep === "vezeto" ? "agRoleManager" : "wsRoleAgent")}</span>`,
                meghivott: `<span class="badge text-bg-warning">${I18n.t("wsInvited")}</span>`,
                kapcsolattarto: `<span class="badge text-bg-light">${I18n.t("wsContactOnly")}</span>`
            })[a.allapot];

            const kartya = a => `
                <div class="col-md-6 col-xl-4">
                    <div class="card h-100 wsAgent ${a.aktiv ? "" : "opacity-50"}">
                        <div class="card-body">
                            <div class="d-flex align-items-start gap-3">
                                <span class="accAvatar small">${esc((a.nev || "?").slice(0, 1).toUpperCase())}</span>
                                <div class="min-w-0 flex-fill">
                                    <b class="d-block text-truncate">${esc(a.nev)}</b>
                                    <div class="mt-1">${allapot(a)}${a.aktiv ? "" : ` <span class="badge text-bg-secondary">${I18n.t("agInactive")}</span>`}</div>
                                </div>
                            </div>
                            <div class="small mt-2">
                                ${a.telefon ? `<div><i class="fa-solid fa-phone fa-fw" aria-hidden="true"></i> ${esc(a.telefon)}</div>` : ""}
                                ${a.email ? `<div class="text-truncate"><i class="fa-regular fa-envelope fa-fw" aria-hidden="true"></i> ${esc(a.email)}</div>` : ""}
                            </div>
                            <div class="wsAgentStats small text-body-secondary mt-2">
                                <span><i class="fa-solid fa-house-user" aria-hidden="true"></i> ${I18n.f("wsAgentListings", { n: a.hirdetes_db || 0 })}</span>
                                ${a.user_id ? `<span><i class="fa-solid fa-address-book" aria-hidden="true"></i> ${I18n.f("wsAgentClients", { n: a.ugyfel_db || 0 })}</span>` : ""}
                            </div>
                            ${a.allapot === "kapcsolattarto" && vezeto ? `<p class="small text-body-secondary mt-2 mb-0">${I18n.t("wsContactOnlyHint")}</p>` : ""}
                            ${a.allapot === "meghivott" ? `<p class="small text-body-secondary mt-2 mb-0">${I18n.t("wsInvitedHint")}</p>` : ""}
                            <div class="d-flex flex-wrap gap-2 mt-3">
                                <button class="btn btn-sm btn-outline-secondary" data-cedit="${a.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("detailEdit")}</button>
                                ${vezeto && a.allapot === "kapcsolattarto" ? `<button class="btn btn-sm btn-outline-primary" data-cinv="${a.id}" ${tele ? `title="${esc(I18n.t("wsSeatFull"))}"` : ""}><i class="fa-solid fa-key" aria-hidden="true"></i> ${I18n.t("wsGiveAccess")}</button>` : ""}
                                ${vezeto && a.allapot === "meghivott" ? `<button class="btn btn-sm btn-outline-primary" data-cinv="${a.id}"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t("wsResend")}</button>` : ""}
                                ${vezeto && a.allapot !== "kapcsolattarto" && a.user_id !== AuthManager.user.id ? `<button class="btn btn-sm btn-outline-secondary" data-crevoke="${a.id}">${I18n.t("wsRevoke")}</button>` : ""}
                                ${vezeto && a.user_id !== AuthManager.user.id ? `<button class="btn btn-sm btn-outline-danger" data-cdel="${a.id}" aria-label="${esc(I18n.t("detailDelete"))}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>` : ""}
                                ${!vezeto && a.user_id === AuthManager.user.id ? `<button class="btn btn-sm btn-outline-danger" data-cleave="${a.id}"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> ${I18n.t("agLeave")}</button>` : ""}
                            </div>
                        </div>
                    </div>
                </div>`;

            el.innerHTML = `
                ${vezeto ? `
                <div class="card wsSeats mb-4">
                    <div class="card-body d-flex flex-wrap align-items-center gap-3">
                        <i class="fa-solid fa-users fs-3 text-primary" aria-hidden="true"></i>
                        <div class="flex-fill">
                            <b>${h.limit === null || h.limit === undefined ? I18n.f("wsSeatsUnlimited", { n: h.foglalt || 0 }) : I18n.f("wsSeatsUsed", { n: h.foglalt, m: h.limit })}</b>
                            ${h.limit !== null && h.limit !== undefined ? `<div class="progress mt-2" role="progressbar" aria-valuenow="${h.foglalt}" aria-valuemin="0" aria-valuemax="${h.limit}" style="height:6px"><div class="progress-bar ${tele ? "bg-warning" : ""}" style="width:${Math.min(100, Math.round(h.foglalt / Math.max(1, h.limit) * 100))}%"></div></div>` : ""}
                            <div class="small text-body-secondary mt-1">${I18n.t("wsSeatsHelp")}</div>
                        </div>
                        ${h.limit !== null && h.limit !== undefined ? `<a class="btn btn-sm ${tele ? "btn-primary" : "btn-outline-primary"}" href="#csomagok/iroda"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${I18n.t("wsSeatsExpand")}</a>` : ""}
                    </div>
                </div>` : ""}

                <div class="row g-3 mb-4">${d.csapat.map(kartya).join("")}</div>

                ${d.regi_meghivok && d.regi_meghivok.length ? `
                <div class="card mb-4">
                    <div class="card-header"><h6 class="mb-0">${I18n.t("wsOldInvites")}</h6></div>
                    <ul class="list-group list-group-flush">
                        ${d.regi_meghivok.map(m => `<li class="list-group-item d-flex align-items-center gap-2"><span class="flex-fill">${esc(m.nev || "")} <span class="small text-body-secondary">${esc(m.email || "")}</span></span>
                            <button class="btn btn-sm btn-outline-danger" data-oldinv="${m.user_id}">${I18n.t("agInviteCancel")}</button></li>`).join("")}
                    </ul>
                </div>` : ""}

                ${vezeto ? `
                <form class="card" id="wsAddAgent" novalidate>
                    <div class="card-header"><h6 class="mb-0"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${I18n.t("agAddAgent")}</h6></div>
                    <div class="card-body">
                        <div class="row g-2">
                            <div class="col-md-4"><label class="form-label small mb-1" for="waNev">${I18n.t("authName")} *</label><input class="form-control" id="waNev" required maxlength="100"></div>
                            <div class="col-md-3"><label class="form-label small mb-1" for="waTel">${I18n.t("accPhone")}</label><input class="form-control" id="waTel" type="tel" maxlength="40"></div>
                            <div class="col-md-5"><label class="form-label small mb-1" for="waEmail">${I18n.t("authEmail")}</label><input class="form-control" id="waEmail" type="email" maxlength="160"></div>
                        </div>
                        <div class="d-flex flex-wrap align-items-center gap-3 mt-3">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="waBelep" ${tele ? "" : "checked"}>
                                <label class="form-check-label" for="waBelep">${I18n.t("wsGetsAccess")}</label>
                            </div>
                            <select class="form-select form-select-sm w-auto" id="waSzerep" aria-label="${esc(I18n.t("agRole"))}">
                                <option value="tag">${I18n.t("wsRoleAgent")}</option>
                                <option value="vezeto">${I18n.t("agRoleManager")}</option>
                            </select>
                            <button class="btn btn-primary ms-auto" type="submit">${I18n.t("agAdd")}</button>
                        </div>
                        <div class="form-text">${I18n.t("wsAddHelp")}</div>
                        <div class="alert alert-danger small py-2 mt-2" id="waHiba" hidden></div>
                    </div>
                </form>` : ""}`;

            const ujra = () => AgencyPage.csapatTab(el, vezeto);
            const hibaUzenet = e => e.kod === "seat_limit" ? I18n.f("wsErrSeat", { m: e.limit || "?" }) : AgencyPage.hibaSzoveg(e);
            const add = el.querySelector("#wsAddAgent");
            if (add) add.onsubmit = e => {
                e.preventDefault();
                const $ = q => add.querySelector(q);
                const hiba = $("#waHiba"); hiba.hidden = true;
                if (!$("#waNev").value.trim()) { $("#waNev").classList.add("is-invalid"); return; }
                if ($("#waBelep").checked && !$("#waEmail").value.trim()) { hiba.textContent = I18n.t("wsErrEmail"); hiba.hidden = false; return; }
                AgencyPage.api(`/api/irodak/${ir.id}/csapat`, "POST", { nev: $("#waNev").value, telefon: $("#waTel").value, email: $("#waEmail").value, belepes: $("#waBelep").checked, szerep: $("#waSzerep").value })
                    .then(v => { Utils.toast(I18n.t($("#waBelep").checked ? (v.regisztralt ? "wsInviteSentReg" : "wsInviteSentNew") : "alertSaveSuccess")); ujra(); })
                    .catch(err => { hiba.textContent = hibaUzenet(err); hiba.hidden = false; });
            };
            const a = id => d.csapat.find(x => x.id === Number(id));
            el.querySelectorAll("[data-cinv]").forEach(b => b.onclick = () => {
                const x = a(b.dataset.cinv);
                if (!x.email) { alert(I18n.t("wsErrEmail")); return AgencyPage.csapatSzerk(x, vezeto, ujra); }
                AgencyPage.api(`/api/irodak/${ir.id}/csapat/${x.id}/meghivo`, "POST", {})
                    .then(v => { Utils.toast(I18n.t(v.regisztralt ? "wsInviteSentReg" : "wsInviteSentNew")); ujra(); })
                    .catch(err => alert(hibaUzenet(err)));
            });
            el.querySelectorAll("[data-crevoke]").forEach(b => b.onclick = () => {
                const x = a(b.dataset.crevoke);
                if (!confirm(I18n.f("wsRevokeConfirm", { nev: x.nev }))) return;
                AgencyPage.api(`/api/irodak/${ir.id}/csapat/${x.id}/megvon`, "POST", {}).then(ujra).catch(err => alert(AgencyPage.hibaSzoveg(err)));
            });
            el.querySelectorAll("[data-cdel]").forEach(b => b.onclick = () => {
                const x = a(b.dataset.cdel);
                if (!confirm(I18n.f("wsDeleteConfirm", { nev: x.nev }))) return;
                AgencyPage.api(`/api/irodak/${ir.id}/csapat/${x.id}`, "DELETE").then(() => AgencyPage.show(`${ir.id}:csapat`)).catch(err => alert(AgencyPage.hibaSzoveg(err)));
            });
            el.querySelectorAll("[data-cleave]").forEach(b => b.onclick = () => {
                if (!confirm(I18n.t("agLeaveConfirm"))) return;
                AgencyPage.api(`/api/irodak/${ir.id}/csapat/${b.dataset.cleave}/megvon`, "POST", {})
                    .then(() => AuthManager.refresh()).then(() => { document.body.classList.remove("wsMode"); location.hash = "#fiok"; })
                    .catch(err => alert(AgencyPage.hibaSzoveg(err)));
            });
            el.querySelectorAll("[data-cedit]").forEach(b => b.onclick = () => AgencyPage.csapatSzerk(a(b.dataset.cedit), vezeto, ujra));
            el.querySelectorAll("[data-oldinv]").forEach(b => b.onclick = () => {
                if (!confirm(I18n.t("agInviteCancelConfirm"))) return;
                AgencyPage.api(`/api/irodak/${ir.id}/tagok/${b.dataset.oldinv}`, "DELETE").then(ujra).catch(err => alert(AgencyPage.hibaSzoveg(err)));
            });

        }).catch(err => { el.innerHTML = `<div class="alert alert-danger">${AgencyPage.hibaSzoveg(err)}</div>`; });

    }

    static csapatSzerk(a, vezeto, utana) {
        const ir = AgencyPage.iroda;
        const esc = Utils.escape;
        const { tartalom, modal } = Svc.modal("wsAgentEdit", "");
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title">${esc(a.nev)}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("close"))}"></button>
            </div>
            <form class="modal-body" id="wsAeF" novalidate>
                <p class="small text-body-secondary">${I18n.t("wsEditHelp")}</p>
                <label class="form-label small mb-1" for="weNev">${I18n.t("authName")}</label>
                <input class="form-control mb-2" id="weNev" maxlength="100" value="${esc(a.nev)}">
                <label class="form-label small mb-1" for="weTel">${I18n.t("accPhone")}</label>
                <input class="form-control mb-2" id="weTel" type="tel" maxlength="40" value="${esc(a.telefon || "")}">
                <label class="form-label small mb-1" for="weEmail">${I18n.t("authEmail")}</label>
                <input class="form-control mb-3" id="weEmail" type="email" maxlength="160" value="${esc(a.email || "")}">
                ${vezeto && a.allapot !== "kapcsolattarto" ? `
                <label class="form-label small mb-1" for="weSzerep">${I18n.t("agRole")}</label>
                <select class="form-select mb-3" id="weSzerep">
                    <option value="tag" ${(a.szerep || a.meghivo_szerep) !== "vezeto" ? "selected" : ""}>${I18n.t("wsRoleAgent")}</option>
                    <option value="vezeto" ${(a.szerep || a.meghivo_szerep) === "vezeto" ? "selected" : ""}>${I18n.t("agRoleManager")}</option>
                </select>
                <p class="small text-body-secondary">${I18n.t("wsRoleHelp")}</p>` : ""}
                ${vezeto ? `
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="weAktiv" ${a.aktiv ? "checked" : ""}>
                    <label class="form-check-label small" for="weAktiv">${I18n.t("agActiveAgent")}</label>
                </div>` : ""}
            </form>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("cancel")}</button>
                <button type="submit" class="btn btn-primary" form="wsAeF">${I18n.t("save")}</button>
            </div>`;
        modal.show();
        const $ = q => tartalom.querySelector(q);
        $("#wsAeF").onsubmit = e => {
            e.preventDefault();
            AgencyPage.api(`/api/irodak/${ir.id}/csapat/${a.id}`, "PUT", {
                nev: $("#weNev").value, telefon: $("#weTel").value, email: $("#weEmail").value,
                aktiv: $("#weAktiv") ? $("#weAktiv").checked : true, szerep: $("#weSzerep") ? $("#weSzerep").value : undefined
            }).then(() => { modal.hide(); AuthManager.refresh(); utana(); }).catch(err => alert(AgencyPage.hibaSzoveg(err)));
        };
    }

    // ---------- iroda és csomag (a vezetőnek) ----------

    static irodaTab(el) {
        const ir = AgencyPage.iroda;
        const c = ir.csomag || {};
        el.innerHTML = `
            <div class="card wsPlan mb-4">
                <div class="card-body d-flex flex-wrap align-items-center gap-3">
                    <i class="fa-solid fa-box fs-3 text-primary" aria-hidden="true"></i>
                    <div class="flex-fill">
                        <b>${I18n.t(c.kell ? (c.aktiv ? "wsPlanActive" : "wsPlanNone") : "wsPlanFree")}</b>
                        <div class="small text-body-secondary" id="wsPlanSeats">${I18n.t("wsPlanHelp")}</div>
                    </div>
                    <a class="btn btn-sm btn-outline-secondary" href="#fiok/csomag"><i class="fa-solid fa-receipt" aria-hidden="true"></i> ${I18n.t("wsPlanBilling")}</a>
                    <a class="btn btn-sm btn-primary" href="#csomagok/iroda"><i class="fa-solid fa-arrow-up-right-dots" aria-hidden="true"></i> ${I18n.t("wsPlanChange")}</a>
                </div>
            </div>
            <div id="wsDetails"></div>`;
        AgencyPage.api(`/api/irodak/${ir.id}/csapat`).then(d => {
            const h = d.hely || {};
            const t = el.querySelector("#wsPlanSeats");
            if (t) t.textContent = h.limit === null || h.limit === undefined ? I18n.f("wsSeatsUnlimited", { n: h.foglalt || 0 }) : I18n.f("wsSeatsUsed", { n: h.foglalt, m: h.limit });
        }).catch(() => { });
        AgencyPage.adatTab(el.querySelector("#wsDetails"), true);
    }

    // ---------- adatok ----------

    static adatTab(el, vezeto) {

        const ir = AgencyPage.iroda;

        if (!vezeto) {
            el.innerHTML = `<div class="alert alert-light">${I18n.t("agOnlyManager")}</div>`;
            return;
        }

        el.innerHTML = `
            <div class="row g-4">
                <div class="col-lg-8">
                    <form class="card" id="agEdit">
                        <div class="card-body">
                            ${AgencyPage.adatUrlap(ir)}
                            ${ir.statusz === "jovahagyva" ? `<p class="small text-body-secondary mt-3 mb-0"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t("agReapproveNote")}</p>` : ""}
                            <div class="accMsg alert small py-2 mt-3" hidden></div>
                            <div class="text-end mt-3"><button class="btn btn-primary" type="submit">${I18n.t("save")}</button></div>
                        </div>
                    </form>
                </div>
                <div class="col-lg-4">
                    <div class="card mb-4">
                        <div class="card-header"><h6 class="mb-0"><i class="fa-regular fa-image" aria-hidden="true"></i> ${I18n.t("agLogoTitle")}</h6></div>
                        <div class="card-body">
                            <div class="d-flex align-items-center gap-3 mb-3">
                                <div id="agLogoPreview">${AgencyUI.logo(ir, "lg")}</div>
                                <p class="small text-body-secondary mb-0">${I18n.t("agLogoHelp")}</p>
                            </div>
                            <div class="d-flex flex-wrap gap-2">
                                <label class="btn btn-outline-primary btn-sm mb-0">
                                    <i class="fa-solid fa-upload" aria-hidden="true"></i> ${I18n.t("agLogoUpload")}
                                    <input type="file" accept="image/png,image/jpeg,image/webp" id="agLogoFile" hidden>
                                </label>
                                ${ir.van_logo ? `<button type="button" class="btn btn-outline-secondary btn-sm" id="agLogoDel">${I18n.t("agLogoRemove")}</button>` : ""}
                            </div>
                        </div>
                    </div>
                    ${ir.cui || ir.hivatalos_nev ? `
                    <div class="card mb-4">
                        <div class="card-header"><h6 class="mb-0"><i class="fa-solid fa-building-columns" aria-hidden="true"></i> ${I18n.t("agCompanyInfo")}</h6></div>
                        <div class="card-body small">
                            <dl class="anafList mb-0">
                                ${ir.hivatalos_nev ? `<dt>${I18n.t("agOfficialName")}</dt><dd>${Utils.escape(ir.hivatalos_nev)}</dd>` : ""}
                                ${ir.cui ? `<dt>${I18n.t("anafCui")}</dt><dd>${Utils.escape(ir.cui)}</dd>` : ""}
                                ${ir.hivatalos_cim ? `<dt>${I18n.t("anafAddress")}</dt><dd>${Utils.escape(ir.hivatalos_cim)}</dd>` : ""}
                                ${ir.caen ? `<dt>${I18n.t("anafCaen")}</dt><dd>${Utils.escape(ir.caen)}${AgencyAnaf.caenNev(ir.caen) ? " – " + Utils.escape(AgencyAnaf.caenNev(ir.caen)) : ""}</dd>` : ""}
                            </dl>
                        </div>
                    </div>` : ""}
                    <div class="card">
                        <div class="card-body small">
                            <p class="mb-2">${I18n.t("agDeleteHelp")}</p>
                            <button class="btn btn-outline-danger btn-sm" id="agDelete"><i class="fa-solid fa-trash"></i> ${I18n.t("agDeleteBtn")}</button>
                        </div>
                    </div>
                </div>
            </div>`;

        // Logó feltöltése / törlése
        const logoMent = kep => AgencyPage.api(`/api/irodak/${ir.id}/logo`, "PUT", { kep })
            .then(() => {
                ir.van_logo = !!kep;
                ir._logoV = Date.now();
                AuthManager.refresh();
                AgencyPage.adatTab(el, vezeto);
            })
            .catch(e => alert(e.kod === "bad_image" ? I18n.t("agLogoBad") : AgencyPage.hibaSzoveg(e)));
        document.getElementById("agLogoFile").onchange = e => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            ImageTools.logo(file).then(logoMent).catch(() => alert(I18n.t("agLogoBad")));
        };
        const logoDel = document.getElementById("agLogoDel");
        if (logoDel) logoDel.onclick = () => { if (confirm(I18n.t("agLogoRemoveConfirm"))) logoMent(null); };

        document.getElementById("agEdit").onsubmit = e => {
            e.preventDefault();
            const msg = e.target.querySelector(".accMsg");
            AgencyPage.api("/api/irodak/" + ir.id, "PUT", AgencyPage.urlapAdat(e.target))
                .then(v => {
                    Object.assign(ir, v);
                    if (v.ujraJovahagyas) {
                        alert(I18n.t("agReapproveDone"));
                        AuthManager.refresh().then(() => AgencyPage.render());
                        return;
                    }
                    msg.hidden = false;
                    msg.className = "accMsg alert alert-success small py-2 mt-3";
                    msg.innerText = I18n.t("alertSaveSuccess");
                    AuthManager.refresh();
                })
                .catch(err => {
                    msg.hidden = false;
                    msg.className = "accMsg alert alert-danger small py-2 mt-3";
                    msg.innerText = AgencyPage.hibaSzoveg(err);
                });
        };

        document.getElementById("agDelete").onclick = () => {
            if (!confirm(I18n.f("agDeleteAgencyConfirm", { nev: ir.nev }))) return;
            AgencyPage.api("/api/irodak/" + ir.id, "DELETE")
                .then(() => AuthManager.refresh())
                .then(() => { AgencyPage.iroda = null; DataManager.init(); location.hash = "#fiok"; });
        };

    }

}
