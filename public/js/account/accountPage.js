// ============================================================
//  Fiókom – témák szerint rendezve (bal oldalt a menü, telefonon felül görgethető sáv)
//
//   #fiok              Áttekintés: minden rész egy kártyán, egy mondattal, mire jó
//   Keresés            Kedvencek (#favorites) · Mentett keresések · Keresési igényeim
//   Ügyeim             Megtekintéseim · Ajánlataim · Érdeklődéseim (#erdeklodes) ·
//                      Üzenetek · Értesítések
//   Eladás             Hirdetéseim (+ látogatottság) · Ingatlanom eladása (#eladas)
//   Beállítások        Profil és jelszó · Értesítési beállítások · Csomagom és számláim
//   Ingatlanosoknak    Munkaterület (#iroda) – vagy iroda regisztrálása
//  A régi címek (#fiok/profil, #fiok/hirdetesek…) ugyanúgy működnek.
//   #fiok/megbizasok   „Eladjuk helyetted” megbízásaim (services/myMandates.js)
// ============================================================

class AccountPage {

    static tab = "attekintes";
    static nyitando = null;      // egy beszélgetés, amit meg kell nyitni (válasz után)

    // Minden rész: kulcs, ikon, cím, rövid leírás (az áttekintéshez); link: másik oldal
    static RESZEK = {
        attekintes: { icon: "fa-solid fa-house", label: "acNav_attekintes" },
        kedvencek: { icon: "fa-solid fa-star", label: "menuKedvencek", desc: "acDesc_kedvencek", link: "#favorites" },
        keresesek: { icon: "fa-solid fa-bookmark", label: "accTabSearches", desc: "acDesc_keresesek" },
        igenyek: { icon: "fa-solid fa-bullhorn", label: "accTabRequests", desc: "acDesc_igenyek" },
        megtekintesek: { icon: "fa-regular fa-calendar-check", label: "acNav_megtekintesek", desc: "acDesc_megtekintesek" },
        ajanlatok: { icon: "fa-solid fa-hand-holding-dollar", label: "acNav_ajanlatok", desc: "acDesc_ajanlatok" },
        erdeklodes: { icon: "fa-solid fa-house-circle-check", label: "by_cim", desc: "acDesc_erdeklodes", link: "#erdeklodes" },
        uzenetek: { icon: "fa-solid fa-envelope", label: "accTabMessages", desc: "acDesc_uzenetek" },
        ertesitesek: { icon: "fa-solid fa-bell", label: "accTabNotifications", desc: "acDesc_ertesitesek" },
        hirdetesek: { icon: "fa-solid fa-house-user", label: "accTabListings", desc: "acDesc_hirdetesek" },
        eladas: { icon: "fa-solid fa-key", label: "el_menu", desc: "acDesc_eladas", link: "#eladas" },
        profil: { icon: "fa-solid fa-id-card", label: "acNav_profil", desc: "acDesc_profil" },
        ertesitesBeall: { icon: "fa-solid fa-sliders", label: "acNav_ertesitesBeall", desc: "acDesc_ertesitesBeall" },
        csomag: { icon: "fa-solid fa-receipt", label: "accTabBilling", desc: "acDesc_csomag" },
        munkaterulet: { icon: "fa-solid fa-briefcase", label: "wsEnter", desc: "acDesc_munkaterulet", link: "#iroda" },
        // a Hirdetéseim alatti második oldal (nem külön menüpont)
        statisztika: { icon: "fa-solid fa-chart-simple", label: "lsTab", al: "hirdetesek" },
        megbizasok: { icon: "fa-solid fa-key", label: "el_menu", al: "eladas" }
    };

    static CSOPORTOK = [
        { cim: null, elemek: ["attekintes"] },
        { cim: "acGrp_search", elemek: ["kedvencek", "keresesek", "igenyek"] },
        { cim: "acGrp_deals", elemek: ["megtekintesek", "ajanlatok", "erdeklodes", "uzenetek", "ertesitesek"] },
        { cim: "acGrp_sell", elemek: ["hirdetesek", "eladas"] },
        { cim: "acGrp_settings", elemek: ["profil", "ertesitesBeall", "csomag"] },
        { cim: "acGrp_pro", elemek: ["munkaterulet"] }
    ];

    // A régi kulcsok
    static REGI = { "ertesites-beallitas": "ertesitesBeall", beallitasok: "profil" };

    static reszCim(k) {
        if (k === "munkaterulet") return I18n.t(AuthManager.irodak.length ? "wsEnter" : "acNav_irodaUj");
        return I18n.t(AccountPage.RESZEK[k].label);
    }

    static jelveny(k) {
        const n = { uzenetek: AuthManager.olvasatlan, ertesitesek: AuthManager.ertesites, erdeklodes: AuthManager.vevo && AuthManager.vevo.teendo,
            eladas: AuthManager.megbizas && AuthManager.megbizas.teendo, munkaterulet: (AuthManager.irodaMeghivasok || []).length }[k] || 0;
        const cls = { uzenetek: "accMsgCount", ertesitesek: "accNotifCount" }[k] || "";
        return n || cls ? `<span class="badge rounded-pill text-bg-danger ${cls}" ${n ? "" : "hidden"}>${n > 9 ? "9+" : n}</span>` : "";
    }

    static show(param) {

        if (!AuthManager.loggedIn()) return;

        const kert = AccountPage.REGI[param] || param;
        AccountPage.tab = AccountPage.RESZEK[kert] && !AccountPage.RESZEK[kert].link ? kert : (param ? AccountPage.tab || "attekintes" : "attekintes");

        const box = document.getElementById("fiokContent");
        const u = AuthManager.user;
        const esc = Utils.escape;
        const R = AccountPage.RESZEK;
        const aktiv = R[AccountPage.tab].al || AccountPage.tab;

        box.innerHTML = `
            <div class="ws accWs">
                <aside class="wsSide" aria-label="${esc(I18n.t("menuFiok"))}">
                    <div class="wsAgency">
                        <span class="accAvatar small">${esc((u.nev || "?").slice(0, 1).toUpperCase())}</span>
                        <div class="min-w-0">
                            <b class="d-block text-truncate">${esc(u.nev)}</b>
                            <span class="small text-body-secondary text-truncate d-block">${esc(u.email || u.felhasznalonev || "")}</span>
                        </div>
                    </div>
                    <nav class="wsNav">
                        ${AccountPage.CSOPORTOK.map(g => `
                            <div class="wsNavGroup">
                                ${g.cim ? `<span class="wsNavHead">${I18n.t(g.cim)}</span>` : ""}
                                ${g.elemek.map(k => `
                                    <a class="wsNavItem ${k === aktiv ? "active" : ""}" href="${R[k].link || "#fiok/" + k}" ${k === aktiv ? 'aria-current="page"' : ""}>
                                        <i class="${R[k].icon} fa-fw" aria-hidden="true"></i><span>${AccountPage.reszCim(k)}</span>${AccountPage.jelveny(k)}
                                    </a>`).join("")}
                            </div>`).join("")}
                    </nav>
                    <div class="wsSideFoot">
                        ${u.szerep === "admin" ? `<a href="#admin"><i class="fa-solid fa-user-shield fa-fw" aria-hidden="true"></i> Admin</a>` : ""}
                        <a href="#" id="accLogout"><i class="fa-solid fa-right-from-bracket fa-fw" aria-hidden="true"></i> ${I18n.t("authLogout")}</a>
                    </div>
                </aside>
                <main class="wsMain">
                    ${AccountPage.tab === "attekintes" ? "" : `
                    <div class="wsHead">
                        <div class="min-w-0">
                            <h1 class="wsTitle">${esc(AccountPage.reszCim(aktiv))}</h1>
                            ${R[aktiv].desc ? `<p class="wsHelp">${I18n.t(R[aktiv].desc)}</p>` : ""}
                        </div>
                    </div>`}
                    <div id="accBody"></div>
                </main>
            </div>`;

        document.getElementById("accLogout").onclick = e => { e.preventDefault(); AuthManager.logout(); };

        const body = document.getElementById("accBody");

        ({
            attekintes: () => AccountPage.attekintes(body),
            profil: () => AccountPage.profil(body),
            hirdetesek: () => AccountPage.hirdetesek(body),
            statisztika: () => ListingStats.render(body),
            keresesek: () => AccountPage.keresesek(body),
            igenyek: () => AccountPage.igenyek(body),
            uzenetek: () => {
                const ny = AccountPage.nyitando;
                AccountPage.nyitando = null;
                Messages.render(body, ny);
            },
            ertesitesek: () => Notifications.render(body, "lista"),
            ertesitesBeall: () => Notifications.render(body, "beallitas"),
            ajanlatok: () => Offers.fiok(body),
            megtekintesek: () => Viewings.fiok(body),
            csomag: () => AccountBilling.render(body),
            megbizasok: () => MyMandates.render(body)
        })[AccountPage.tab]();

    }

    // Áttekintés: minden rész egy kártya, témák szerint – egy mondat, mire jó
    static attekintes(el) {
        const esc = Utils.escape;
        const R = AccountPage.RESZEK;
        const u = AuthManager.user;
        el.innerHTML = `
            <div class="accHello">
                <h1 class="wsTitle">${esc(I18n.f("acHello", { nev: (u.nev || "").split(" ")[0] || "" }))}</h1>
                <p class="wsHelp">${I18n.t("acHelloText")}</p>
            </div>
            ${AccountPage.CSOPORTOK.filter(g => g.cim).map(g => `
                <section class="accSection">
                    <h2 class="accSectionHead">${I18n.t(g.cim)}</h2>
                    <p class="small text-body-secondary mb-2">${I18n.t(g.cim + "_desc")}</p>
                    <div class="accCards">
                        ${g.elemek.map(k => `
                            <a class="accCard" href="${R[k].link || "#fiok/" + k}">
                                <span class="accCardIcon" aria-hidden="true"><i class="${R[k].icon}"></i></span>
                                <span class="accCardBody">
                                    <b>${esc(AccountPage.reszCim(k))} ${AccountPage.jelveny(k)}</b>
                                    <span>${I18n.t(k === "munkaterulet" && !AuthManager.irodak.length ? "acDesc_irodaUj" : R[k].desc)}</span>
                                </span>
                                <i class="fa-solid fa-chevron-right accCardGo" aria-hidden="true"></i>
                            </a>`).join("")}
                    </div>
                </section>`).join("")}`;
    }

    static rerender() {
        if (PageManager.current === "fiok") AccountPage.show(AccountPage.tab);
    }

    static spinner(el) {
        el.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;
    }

    // ---------- profil ----------

    static profil(el) {

        const u = AuthManager.user;
        const c = AuthManager.config;

        el.innerHTML = `
            <div class="row g-4">
                <div class="col-lg-7">
                    <form class="card" id="accProfil">
                        <div class="card-header"><h5 class="mb-0">${I18n.t("accProfileTitle")}</h5></div>
                        <div class="card-body">
                            <div class="row g-3">
                                <div class="col-md-6">
                                    <label class="form-label" for="apNev">${I18n.t("authName")}</label>
                                    <input class="form-control" id="apNev" maxlength="80" value="${Utils.escape(u.nev || "")}">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label" for="apTel">${I18n.t("accPhone")}</label>
                                    <input class="form-control" id="apTel" type="tel" maxlength="40" value="${Utils.escape(u.telefon || "")}">
                                    <div class="form-text">${I18n.t("accPhoneHelp")}</div>
                                </div>
                                <div class="col-12">
                                    <label class="form-label" for="apEmail">${I18n.t("authEmail")}</label>
                                    <input class="form-control" id="apEmail" type="email" value="${Utils.escape(u.email || "")}">
                                    ${!u.email ? `<div class="form-text text-warning">${I18n.t("accNoEmail")}</div>` : ""}
                                </div>
                                <div class="col-12">
                                    <a class="small" href="#fiok/ertesitesBeall"><i class="fa-regular fa-bell" aria-hidden="true"></i> ${I18n.t("accNotifySettingsLink")}</a>
                                </div>
                            </div>
                            <div class="accMsg alert small py-2 mt-3" hidden></div>
                            <div class="text-end mt-3"><button class="btn btn-primary" type="submit">${I18n.t("save")}</button></div>
                        </div>
                    </form>
                </div>

                <div class="col-lg-5">
                    <form class="card" id="accJelszo">
                        <div class="card-header"><h5 class="mb-0">${I18n.t(u.jelszo ? "accPasswordTitle" : "accSetPasswordTitle")}</h5></div>
                        <div class="card-body">
                            ${u.jelszo ? `
                                <label class="form-label" for="apRegi">${I18n.t("accOldPassword")}</label>
                                <input class="form-control mb-3" id="apRegi" type="password" autocomplete="current-password">` : `<p class="small text-body-secondary">${I18n.t(u.google ? "accGoogleNoPassword" : "accEnvNoPassword")}</p>`}
                            <label class="form-label" for="apUj">${I18n.t("authNewPassword")}</label>
                            <input class="form-control mb-1" id="apUj" type="password" autocomplete="new-password" minlength="8">
                            <div class="form-text mb-3">${I18n.t("authPasswordHelp")}</div>
                            <div class="accMsg alert small py-2" hidden></div>
                            <div class="text-end"><button class="btn btn-outline-primary" type="submit">${I18n.t("accPasswordBtn")}</button></div>
                        </div>
                    </form>

                    <div class="card mt-4">
                        <div class="card-body small">
                            ${u.google ? `<p class="mb-2"><i class="fa-brands fa-google"></i> ${I18n.t("accGoogleLinked")}</p>` : ""}
                            <p class="text-body-secondary mb-2">${I18n.f("accMemberSince", { d: Utils.ago(u.created_at) })}</p>
                            ${u.szerep !== "admin" ? `<button class="btn btn-link text-danger btn-sm p-0" id="accDelete">${I18n.t("accDeleteBtn")}</button>` : ""}
                        </div>
                    </div>
                </div>
            </div>`;

        const uzenet = (form, ok, szoveg) => {
            const m = form.querySelector(".accMsg");
            m.hidden = false;
            m.className = `accMsg alert small py-2 ${ok ? "alert-success" : "alert-danger"}`;
            m.innerText = szoveg;
        };

        document.getElementById("accProfil").onsubmit = e => {
            e.preventDefault();
            fetch("/api/auth/profil", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nev: document.getElementById("apNev").value,
                    telefon: document.getElementById("apTel").value,
                    email: document.getElementById("apEmail").value,
                    // az e-mail értesítések a Fiókom → Értesítések fülön
                })
            })
                .then(r => r.json().then(v => ({ ok: r.ok, v })))
                .then(({ ok, v }) => {
                    if (!ok) return uzenet(e.target, false, I18n.t("authErr_" + v.error) !== "authErr_" + v.error ? I18n.t("authErr_" + v.error) : I18n.t("alertSaveError"));
                    AuthManager.user = v.user;
                    AuthManager.apply();
                    uzenet(e.target, true, I18n.t("alertSaveSuccess"));
                });
        };

        document.getElementById("accJelszo").onsubmit = e => {
            e.preventDefault();
            const regi = document.getElementById("apRegi");
            const uj = document.getElementById("apUj").value;
            if (uj.length < 8) return uzenet(e.target, false, I18n.t("authErr_weak_password"));
            fetch("/api/auth/jelszo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ regi: regi ? regi.value : "", uj })
            })
                .then(r => r.json().then(v => ({ ok: r.ok, v })))
                .then(({ ok, v }) => {
                    if (!ok) return uzenet(e.target, false, I18n.t("authErr_" + v.error) !== "authErr_" + v.error ? I18n.t("authErr_" + v.error) : I18n.t("alertSaveError"));
                    uzenet(e.target, true, I18n.t("accPasswordDone"));
                    AuthManager.user.jelszo = true;
                    e.target.reset();
                });
        };

        const del = document.getElementById("accDelete");
        if (del) del.onclick = () => {
            if (!confirm(I18n.t("accDeleteConfirm"))) return;
            const jelszo = u.jelszo ? prompt(I18n.t("accDeletePassword")) : "";
            if (u.jelszo && !jelszo) return;
            fetch("/api/auth/fiok", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jelszo }) })
                .then(r => r.json().then(v => ({ ok: r.ok, v })))
                .then(({ ok, v }) => {
                    if (!ok) return alert(I18n.t("authErr_" + v.error) !== "authErr_" + v.error ? I18n.t("authErr_" + v.error) : I18n.t("alertSaveError"));
                    location.hash = "#home";
                    location.reload();
                });
        };

    }

    // ---------- saját hirdetések ----------

    static hirdetesek(el) {

        AccountPage.spinner(el);

        fetch("/api/sajat-hirdetesek")
            .then(r => r.json())
            .then(lista => {

                el.innerHTML = ListingStats.valto("hirdetesek") + `
                    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                        <p class="sectionNote mb-0">${I18n.t("accListingsNote")}</p>
                        <a class="btn btn-primary btn-sm" href="#new"><i class="fa-solid fa-plus"></i> ${I18n.t("navPost")}</a>
                    </div>
                    ${lista.length ? `<div class="accListings">${lista.map(i => AccountPage.hirdetesKartya(i)).join("")}</div>` : `
                        <div class="emptyState">
                            <i class="fa-solid fa-house-user"></i>
                            <h5>${I18n.t("accListingsEmpty")}</h5>
                            <p>${I18n.t("accListingsEmptyHint")}</p>
                        </div>`}`;

                el.querySelectorAll("[data-edit]").forEach(b => {
                    b.onclick = () => NewPropertyManager.startEdit({ id: Number(b.dataset.edit) });
                });

                // Megtekintések a kártyákon (az utolsó 30 napban) – a részletek a Látogatottság fülön
                if (lista.length) ListingStats.betolt(30).then(st => {
                    st.hirdetesek.forEach(h => {
                        const hely = el.querySelector(`[data-views="${h.id}"]`);
                        if (hely) hely.innerHTML = `<i class="fa-solid fa-eye" aria-hidden="true"></i> ${I18n.f("lsCardViews", { n: Utils.num(h.megtekintes) })}${h.kedvenc ? ` · <i class="fa-solid fa-star" aria-hidden="true"></i> ${Utils.num(h.kedvenc)}` : ""}`;
                    });
                }).catch(() => { });

                el.querySelectorAll("[data-kiemel]").forEach(b => {
                    b.onclick = () => FeatureModal.nyit(Number(b.dataset.kiemel), () => AccountPage.hirdetesek(el));
                });

                el.querySelectorAll("[data-del]").forEach(b => {
                    b.onclick = () => {
                        if (!confirm(I18n.t("alertConfirmDelete"))) return;
                        fetch("/api/ingatlanok/" + b.dataset.del, { method: "DELETE" }).then(() => {
                            DataManager.init();
                            AccountPage.hirdetesek(el);
                        });
                    };
                });

            });

    }

    static hirdetesKartya(i) {

        const foto = Utils.photoUrl(i);
        const allapot = i.statusz === "aktiv"
            ? (i.ellenorzott === false ? `<span class="badge text-bg-warning">${I18n.t("accStatusReview")}</span>` : `<span class="badge text-bg-success">${I18n.t("accStatusLive")}</span>`)
            : `<span class="badge text-bg-secondary">${I18n.t(i.statusz === "nem_elerheto" ? "accStatusUnavailable" : (i.statusz === "archiv" ? "agStatus_archiv" : "accStatusPending"))}</span>`;

        return `
            <div class="card accListing">
                <a href="#listing/${i.id}" class="accListingPhoto">
                    ${foto ? `<img src="${Utils.escape(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<i class="${Types.get(i.tipus).icon}"></i>`}
                </a>
                <div class="card-body">
                    <div class="d-flex justify-content-between gap-2">
                        <a href="#listing/${i.id}" class="fw-semibold text-truncate">${Utils.escape(i.cim || Types.label(i.tipus))}</a>
                        ${allapot}
                    </div>
                    <div class="small text-body-secondary">${Utils.escape(CityManager.helyLabel(i))} · #${i.id} · ${Utils.ago(i.created_at)}</div>
                    ${i.iroda_nev ? `<div class="small"><i class="fa-solid fa-briefcase"></i> <a href="#iroda/${i.iroda_id}">${Utils.escape(i.iroda_nev)}</a></div>` : ""}
                    <div class="fw-bold mt-1">${Utils.price(i)} <span class="small fw-normal text-body-secondary">${i.nm ? Utils.nm(i.nm) : ""}</span></div>
                    <a class="accViews small" href="#fiok/statisztika" data-views="${i.id}"></a>
                    <div class="d-flex gap-2 mt-2">
                        <button class="btn btn-sm btn-outline-secondary" data-edit="${i.id}"><i class="fa-solid fa-pen"></i> ${I18n.t("detailEdit")}</button>
                        ${["aktiv", "fuggo"].includes(i.statusz) ? (CardsView.kiemelt(i)
                            ? `<button class="btn btn-sm btn-warning" data-kiemel="${i.id}" title="${Utils.escape(I18n.t("ftTitle"))}"><i class="fa-solid fa-star"></i> ${I18n.f("ftUntilShort", { d: Svc.nap(i.kiemelt_ig) })}</button>`
                            : `<button class="btn btn-sm btn-outline-warning" data-kiemel="${i.id}"><i class="fa-regular fa-star"></i> ${I18n.t("ftButton")}</button>`) : ""}
                        <button class="btn btn-sm btn-outline-danger" data-del="${i.id}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>`;

    }

    // ---------- mentett keresések ----------

    static keresesek(el) {

        AccountPage.spinner(el);

        fetch("/api/keresesek")
            .then(r => r.json())
            .then(lista => {

                el.innerHTML = `
                    <p class="sectionNote">${I18n.t(AuthManager.config.email ? "accSearchesNoteEmail" : "accSearchesNote")}</p>
                    ${lista.length ? `<div class="d-flex flex-column gap-3">${lista.map(s => `
                        <div class="card savedSearch">
                            <div class="card-body d-flex flex-wrap align-items-center gap-3">
                                <div class="flex-fill min-w-0">
                                    <div class="d-flex align-items-center gap-2 mb-1">
                                        <b class="text-truncate">${Utils.escape(s.nev || SavedSearches.leiras(s.szurok))}</b>
                                        ${s.uj ? `<span class="badge text-bg-danger">${I18n.f("accNewMatches", { n: s.uj })}</span>` : ""}
                                    </div>
                                    <div class="small text-body-secondary">${Utils.escape(SavedSearches.leiras(s.szurok))}</div>
                                    <div class="small mt-1">${I18n.f("accMatchesTotal", { n: s.osszes })}</div>
                                </div>
                                <div class="form-check form-switch mb-0" title="${Utils.escape(I18n.t("saveSearchNotify"))}">
                                    <input class="form-check-input" type="checkbox" data-notify="${s.id}" ${s.ertesites ? "checked" : ""} aria-label="${Utils.escape(I18n.t("saveSearchNotify"))}">
                                    <i class="fa-regular fa-bell small"></i>
                                </div>
                                <button class="btn btn-primary btn-sm" data-open="${s.id}"><i class="fa-solid fa-magnifying-glass"></i> ${I18n.t("accOpenSearch")}</button>
                                <button class="btn btn-outline-danger btn-sm" data-del="${s.id}" aria-label="${I18n.t("detailDelete")}"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>`).join("")}</div>` : `
                        <div class="emptyState">
                            <i class="fa-regular fa-bookmark"></i>
                            <h5>${I18n.t("accSearchesEmpty")}</h5>
                            <p>${I18n.t("accSearchesEmptyHint")}</p>
                            <a class="btn btn-primary btn-sm" href="#properties">${I18n.t("menuIngatlanok")}</a>
                        </div>`}`;

                el.querySelectorAll("[data-open]").forEach(b => {
                    b.onclick = () => {
                        const s = lista.find(x => x.id === Number(b.dataset.open));
                        fetch(`/api/keresesek/${s.id}/megnez`, { method: "POST" });
                        SavedSearches.alkalmaz(s.szurok);
                    };
                });

                el.querySelectorAll("[data-notify]").forEach(cb => {
                    cb.onchange = () => fetch("/api/keresesek/" + cb.dataset.notify, {
                        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ertesites: cb.checked })
                    });
                });

                el.querySelectorAll("[data-del]").forEach(b => {
                    b.onclick = () => {
                        if (!confirm(I18n.t("accSearchDeleteConfirm"))) return;
                        fetch("/api/keresesek/" + b.dataset.del, { method: "DELETE" }).then(() => AccountPage.keresesek(el));
                    };
                });

            });

    }

    // ---------- keresési igényeim ----------

    static igenyek(el) {

        AccountPage.spinner(el);

        fetch("/api/igenyek/sajat")
            .then(r => r.json())
            .then(lista => {

                el.innerHTML = `
                    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                        <p class="sectionNote mb-0">${I18n.t("accRequestsNote")}</p>
                        <a class="btn btn-primary btn-sm" href="#igenyek/uj"><i class="fa-solid fa-plus"></i> ${I18n.t("reqNewBtn")}</a>
                    </div>
                    ${lista.length ? `<div class="reqGrid">${lista.map(g => {
                        const aktiv = g.statusz === "aktiv" && (!g.lejar || new Date(g.lejar) > new Date());
                        return `
                        <a class="reqCard card" href="#igenyek/${g.id}">
                            <div class="card-body">
                                <div class="d-flex justify-content-between gap-2 mb-2">
                                    <h5 class="mb-0">${Utils.escape(RequestsPage.cim(g))}</h5>
                                    <span class="badge ${aktiv ? "text-bg-success" : "text-bg-secondary"} align-self-start">${I18n.t(aktiv ? "reqActive" : (g.statusz === "lezart" ? "reqClosed" : "reqExpired"))}</span>
                                </div>
                                <div class="reqChips">${RequestsPage.chipek(g).map(c => `<span class="filterChip">${c}</span>`).join("")}</div>
                                <div class="d-flex flex-wrap gap-3 small mt-2">
                                    <span><i class="fa-regular fa-comments"></i> ${I18n.f("reqReplies", { n: g.valaszok })}${g.olvasatlan ? ` <span class="badge text-bg-danger">${I18n.f("accUnread", { n: g.olvasatlan })}</span>` : ""}</span>
                                    <span><i class="fa-solid fa-house-circle-check"></i> ${I18n.f("reqMatchCount", { n: g.illeszkedo })}</span>
                                </div>
                            </div>
                        </a>`;
                    }).join("")}</div>` : `
                        <div class="emptyState">
                            <i class="fa-solid fa-bullhorn"></i>
                            <h5>${I18n.t("accRequestsEmpty")}</h5>
                            <p>${I18n.t("accRequestsEmptyHint")}</p>
                        </div>`}`;

            });

    }

}
