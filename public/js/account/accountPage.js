// ============================================================
//  Fiókom
//   #fiok/profil       név, e-mail, telefon, értesítések, jelszó
//   #fiok/hirdetesek   a saját hirdetéseim (szerkesztés, törlés)
//   #fiok/keresesek    mentett keresések (új találatok)
//   #fiok/igenyek      a keresési igényeim és a rájuk jött válaszok
//   #fiok/uzenetek     üzenetek
// ============================================================

class AccountPage {

    static tab = "profil";
    static nyitando = null;      // egy beszélgetés, amit meg kell nyitni (válasz után)

    static TABS = [
        { key: "profil", icon: "fa-solid fa-id-card", label: "accTabProfil" },
        { key: "hirdetesek", icon: "fa-solid fa-house-user", label: "accTabListings" },
        { key: "keresesek", icon: "fa-solid fa-bookmark", label: "accTabSearches" },
        { key: "igenyek", icon: "fa-solid fa-bullhorn", label: "accTabRequests" },
        { key: "uzenetek", icon: "fa-solid fa-envelope", label: "accTabMessages" }
    ];

    static show(param) {

        if (!AuthManager.loggedIn()) return;

        AccountPage.tab = AccountPage.TABS.some(t => t.key === param) ? param : (AccountPage.tab || "profil");

        const box = document.getElementById("fiokContent");
        const u = AuthManager.user;

        box.innerHTML = `
            <div class="pageHeader">
                <div class="pageHeaderRow">
                    <div class="d-flex align-items-center gap-3">
                        <span class="accAvatar">${Utils.escape((u.nev || "?").slice(0, 1).toUpperCase())}</span>
                        <div>
                            <h2 class="mb-0">${Utils.escape(u.nev)}</h2>
                            <p class="text-body-secondary mb-0">${Utils.escape(u.email || u.felhasznalonev || "")}${u.szerep === "admin" ? ` · <span class="badge text-bg-dark">Admin</span>` : ""}</p>
                        </div>
                    </div>
                    <button class="btn btn-outline-secondary btn-sm" id="accLogout"><i class="fa-solid fa-right-from-bracket"></i> ${I18n.t("authLogout")}</button>
                </div>
            </div>

            <div class="typeTabs mb-4" role="tablist">
                ${AccountPage.TABS.map(t => `
                    <a class="typeTab ${t.key === AccountPage.tab ? "active" : ""}" href="#fiok/${t.key}" role="tab" aria-selected="${t.key === AccountPage.tab}">
                        <i class="${t.icon}" aria-hidden="true"></i> ${I18n.t(t.label)}
                        ${t.key === "uzenetek" ? `<span class="badge rounded-pill text-bg-danger accMsgCount" ${AuthManager.olvasatlan ? "" : "hidden"}>${AuthManager.olvasatlan}</span>` : ""}
                    </a>`).join("")}
                <a class="typeTab" href="#favorites"><i class="fa-solid fa-star" aria-hidden="true"></i> ${I18n.t("menuKedvencek")}</a>
                <a class="typeTab" href="#iroda"><i class="fa-solid fa-briefcase" aria-hidden="true"></i> ${I18n.t(AuthManager.irodak.length ? "agMenu" : "agCreateShort")}</a>
            </div>

            <div id="accBody"></div>`;

        document.getElementById("accLogout").onclick = () => AuthManager.logout();

        const body = document.getElementById("accBody");

        ({
            profil: () => AccountPage.profil(body),
            hirdetesek: () => AccountPage.hirdetesek(body),
            keresesek: () => AccountPage.keresesek(body),
            igenyek: () => AccountPage.igenyek(body),
            uzenetek: () => {
                const ny = AccountPage.nyitando;
                AccountPage.nyitando = null;
                Messages.render(body, ny);
            }
        })[AccountPage.tab]();

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
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="apErtesites" ${u.ertesites_email ? "checked" : ""}>
                                        <label class="form-check-label" for="apErtesites">${I18n.t("accNotify")}</label>
                                    </div>
                                    ${!c.email ? `<div class="form-text">${I18n.t("accNotifyOff")}</div>` : ""}
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
                    ertesites_email: document.getElementById("apErtesites").checked
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

                el.innerHTML = `
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
                    <div class="d-flex gap-2 mt-2">
                        <button class="btn btn-sm btn-outline-secondary" data-edit="${i.id}"><i class="fa-solid fa-pen"></i> ${I18n.t("detailEdit")}</button>
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
