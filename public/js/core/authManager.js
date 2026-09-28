// ============================================================
//  Fiók: ki van bejelentkezve, belépő / regisztráló ablak
//
//  AuthManager.user      a bejelentkezett felhasználó (vagy null)
//  AuthManager.isAdmin() admin-e
//  AuthManager.kell()    Promise: ha nincs belépve, felhozza a belépő
//                        ablakot, és a belépés után folytatódik
//
//  Privát módban (alap) belépés nélkül csak a belépő ablak látszik.
//  Nyilvános módban (NYILVANOS=1) bárki böngészhet.
// ============================================================

class AuthManager {

    static szerep = "vendeg";
    static felhasznalo = null;
    static user = null;
    static config = {};
    static olvasatlan = 0;
    static adminNezet = false;      // az admin a felhasználói nézetet próbálja
    static irodak = [];             // az ingatlanirodák, amelyeknek tagja
    static varakozok = [];
    static modal = null;
    static mod = "login";
    static resetToken = null;

    static isAdmin() {
        return AuthManager.szerep === "admin";
    }

    static loggedIn() {
        return !!AuthManager.user;
    }

    static owns(i) {
        return !!(AuthManager.user && i && i.owner_id && i.owner_id === AuthManager.user.id);
    }

    static canEdit(i) {
        return AuthManager.isAdmin() || AuthManager.owns(i) || AuthManager.irodaTag(i && i.iroda_id);
    }

    // Tagja-e az irodának (az iroda hirdetéseit kezelheti)
    static irodaTag(irodaId) {
        return !!(irodaId && AuthManager.irodak.some(x => x.id === Number(irodaId)));
    }

    static load() {

        // Jelszó-visszaállító link: #reset/<token>
        const m = location.hash.match(/^#reset\/([\w-]+)/);
        if (m) {
            AuthManager.resetToken = m[1];
            history.replaceState(null, "", location.pathname + "#home");
        }

        return Promise.all([
            fetch("/api/config").then(r => r.json()).catch(() => ({})),
            fetch("/api/me").then(r => r.json()).catch(() => ({}))
        ]).then(([config, me]) => {

            AuthManager.config = config || {};
            AuthManager.setMe(me);

            if (AuthManager.resetToken) {
                AuthManager.open("reset");
            }

            // Privát oldal, nincs belépve: csak a belépő ablak
            if (!AuthManager.user && !AuthManager.config.nyilvanos) {
                return AuthManager.kapu();
            }

        });

    }

    static setMe(me) {

        me = me || {};
        AuthManager.user = me.user || null;
        AuthManager.szerep = me.szerep || (me.user ? me.user.szerep : "vendeg");
        AuthManager.felhasznalo = me.felhasznalo || null;
        AuthManager.olvasatlan = me.olvasatlan || 0;
        AuthManager.adminNezet = !!me.adminNezet;
        AuthManager.irodak = Array.isArray(me.irodak) ? me.irodak : [];

        AuthManager.apply();

        // A felhasználási feltételek (új változatának) elfogadása
        if (me.aszfKell && typeof LegalPage !== "undefined") LegalPage.aszfKerdes();

    }

    static refresh() {
        return fetch("/api/me").then(r => r.json()).then(me => AuthManager.setMe(me)).catch(() => { });
    }

    // Admin / belépett / vendég elemek, fejléc
    static apply() {

        const admin = AuthManager.isAdmin();
        const bent = AuthManager.loggedIn();

        document.body.classList.toggle("is-admin", admin);
        document.body.classList.toggle("is-logged-in", bent);

        document.querySelectorAll(".admin-only").forEach(el => { el.hidden = !admin; });
        document.querySelectorAll(".auth-only").forEach(el => { el.hidden = !bent; });
        document.querySelectorAll(".guest-only").forEach(el => { el.hidden = bent; });

        // Admin: felhasználói nézet ki / be
        const valodiAdmin = admin || AuthManager.adminNezet;
        document.querySelectorAll(".adminView-only").forEach(el => { el.hidden = !valodiAdmin; });
        const bar = document.getElementById("viewAsUserBar");
        if (bar) bar.hidden = !AuthManager.adminNezet;
        document.body.classList.toggle("view-as-user", !!AuthManager.adminNezet);
        const vl = document.getElementById("navViewLabel");
        if (vl) {
            vl.setAttribute("data-i18n", AuthManager.adminNezet ? "viewAsAdmin" : "viewAsUser");
            vl.innerText = I18n.t(AuthManager.adminNezet ? "viewAsAdmin" : "viewAsUser");
        }

        const nev = document.getElementById("navUserName");
        if (nev) nev.innerText = bent ? AuthManager.user.nev : I18n.t("authLoginBtn");

        document.querySelectorAll("#navMsgCount, .navMsgCount2, .accMsgCount").forEach(badge => {
            badge.hidden = !(AuthManager.olvasatlan > 0);
            badge.innerText = AuthManager.olvasatlan > 9 ? "9+" : AuthManager.olvasatlan;
        });

    }

    // Belépés kell a művelethez: ha nincs, belépő ablak, utána folytatjuk
    static kell(mod = "login") {

        if (AuthManager.loggedIn()) return Promise.resolve(AuthManager.user);

        return new Promise((resolve, reject) => {
            AuthManager.varakozok.push({ resolve, reject });
            AuthManager.open(mod);
        });

    }

    // Privát mód: teljes képernyős belépés (nem zárható be)
    static kapu() {

        document.body.classList.add("auth-gate");

        return new Promise(resolve => {
            AuthManager.varakozok.push({ resolve, reject: () => { } });
            AuthManager.open("login", { kotelezo: true });
        });

    }

    // ---------- ablak ----------

    static open(mod = "login", opts = {}) {

        AuthManager.mod = mod;
        AuthManager.kotelezo = !!opts.kotelezo;

        let el = document.getElementById("authModal");

        if (!el) {
            el = document.createElement("div");
            el.id = "authModal";
            el.className = "modal fade";
            el.tabIndex = -1;
            el.innerHTML = `<div class="modal-dialog modal-dialog-centered authDialog"><div class="modal-content"></div></div>`;
            document.body.appendChild(el);
            el.addEventListener("hidden.bs.modal", () => {
                if (!AuthManager.loggedIn()) {
                    const v = AuthManager.varakozok;
                    AuthManager.varakozok = [];
                    v.forEach(x => x.reject(new Error("login_cancelled")));
                }
            });
        }

        AuthManager.modal = bootstrap.Modal.getOrCreateInstance(el, {
            backdrop: AuthManager.kotelezo ? "static" : true,
            keyboard: !AuthManager.kotelezo
        });

        // A bootstrap a már létező példány beállításait nem frissíti
        AuthManager.modal._config.backdrop = AuthManager.kotelezo ? "static" : true;
        AuthManager.modal._config.keyboard = !AuthManager.kotelezo;

        AuthManager.render();
        AuthManager.modal.show();

    }

    static render() {

        const box = document.querySelector("#authModal .modal-content");
        const c = AuthManager.config;
        const mod = AuthManager.mod;

        const fejlec = `
            <div class="authHead">
                <span class="appBrandIcon"><i class="fa-solid fa-building" aria-hidden="true"></i></span>
                <div>
                    <h4 class="mb-0">${I18n.t({ login: "authLoginTitle", register: "authRegisterTitle", forgot: "authForgotTitle", reset: "authResetTitle" }[mod])}</h4>
                    <p class="text-body-secondary small mb-0">${I18n.t(AuthManager.kotelezo ? "authGateNote" : "authWhy")}</p>
                </div>
                ${AuthManager.kotelezo ? "" : `<button type="button" class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="${I18n.t("close")}"></button>`}
            </div>`;

        const google = c.googleClientId && (mod === "login" || mod === "register") ? `
            <div id="googleBtn" class="googleBtnBox"></div>
            ${typeof LegalPage !== "undefined" ? `<p class="authGoogleTerms small text-body-secondary text-center">${LegalPage.feltetelSzoveg("authGoogleTerms")}</p>` : ""}
            <div class="authOr"><span>${I18n.t("authOr")}</span></div>` : "";

        let urlap = "";

        if (mod === "login") {
            urlap = `
                <form id="authForm" novalidate>
                    <label class="form-label" for="authEmail">${I18n.t("authEmailOrUser")}</label>
                    <input class="form-control mb-3" id="authEmail" autocomplete="username" required>
                    <div class="d-flex justify-content-between align-items-baseline">
                        <label class="form-label" for="authPass">${I18n.t("authPassword")}</label>
                        ${c.email ? `<button type="button" class="btn btn-link btn-sm p-0" data-mod="forgot">${I18n.t("authForgotLink")}</button>` : ""}
                    </div>
                    <input class="form-control mb-3" id="authPass" type="password" autocomplete="current-password" required>
                    <div class="authError alert alert-danger small py-2" hidden></div>
                    <button class="btn btn-primary w-100" type="submit">${I18n.t("authLoginBtn")}</button>
                </form>
                ${c.regisztracio !== false ? `<p class="text-center small mt-3 mb-0">${I18n.t("authNoAccount")} <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-mod="register">${I18n.t("authRegisterLink")}</button></p>` : ""}`;
        }

        if (mod === "register") {
            urlap = `
                <form id="authForm" novalidate>
                    <label class="form-label" for="authName">${I18n.t("authName")}</label>
                    <input class="form-control mb-3" id="authName" autocomplete="name" maxlength="80" required>
                    <label class="form-label" for="authEmail">${I18n.t("authEmail")}</label>
                    <input class="form-control mb-3" id="authEmail" type="email" autocomplete="email" required>
                    <label class="form-label" for="authPass">${I18n.t("authPassword")}</label>
                    <input class="form-control mb-1" id="authPass" type="password" autocomplete="new-password" minlength="8" required>
                    <div class="form-text mb-3">${I18n.t("authPasswordHelp")}</div>
                    ${c.meghivoKell ? `
                        <label class="form-label" for="authInvite">${I18n.t("authInvite")}</label>
                        <input class="form-control mb-1" id="authInvite" autocomplete="off" required>
                        <div class="form-text mb-3">${I18n.t("authInviteHelp")}</div>` : ""}
                    ${typeof LegalPage !== "undefined" ? `
                    <div class="form-check mb-3 authTerms">
                        <input class="form-check-input" type="checkbox" id="authTerms" required>
                        <label class="form-check-label small" for="authTerms">${LegalPage.feltetelSzoveg("authTermsCheck")}</label>
                    </div>` : ""}
                    <div class="authError alert alert-danger small py-2" hidden></div>
                    <button class="btn btn-primary w-100" type="submit">${I18n.t("authRegisterBtn")}</button>
                </form>
                <p class="text-center small mt-3 mb-0">${I18n.t("authHaveAccount")} <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-mod="login">${I18n.t("authLoginLink")}</button></p>`;
        }

        if (mod === "forgot") {
            urlap = `
                <form id="authForm" novalidate>
                    <p class="small text-body-secondary">${I18n.t("authForgotHelp")}</p>
                    <label class="form-label" for="authEmail">${I18n.t("authEmail")}</label>
                    <input class="form-control mb-3" id="authEmail" type="email" autocomplete="email" required>
                    <div class="authError alert alert-danger small py-2" hidden></div>
                    <div class="authOk alert alert-success small py-2" hidden></div>
                    <button class="btn btn-primary w-100" type="submit">${I18n.t("authForgotBtn")}</button>
                </form>
                <p class="text-center small mt-3 mb-0"><button type="button" class="btn btn-link btn-sm p-0" data-mod="login"><i class="fa-solid fa-arrow-left"></i> ${I18n.t("authBackToLogin")}</button></p>`;
        }

        if (mod === "reset") {
            urlap = `
                <form id="authForm" novalidate>
                    <label class="form-label" for="authPass">${I18n.t("authNewPassword")}</label>
                    <input class="form-control mb-1" id="authPass" type="password" autocomplete="new-password" minlength="8" required>
                    <div class="form-text mb-3">${I18n.t("authPasswordHelp")}</div>
                    <div class="authError alert alert-danger small py-2" hidden></div>
                    <button class="btn btn-primary w-100" type="submit">${I18n.t("authResetBtn")}</button>
                </form>`;
        }

        box.innerHTML = `
            <div class="modal-body p-4">
                ${fejlec}
                ${google}
                ${urlap}
                ${AuthManager.kotelezo ? `<div class="authLangs mt-4">${["en", "hu", "ro"].map(l => `<button type="button" class="btn btn-sm ${I18n.current === l ? "btn-secondary" : "btn-outline-secondary"}" data-lang="${l}">${l.toUpperCase()}</button>`).join("")}</div>` : ""}
            </div>`;

        box.querySelectorAll("[data-mod]").forEach(b => {
            b.onclick = () => { AuthManager.mod = b.dataset.mod; AuthManager.render(); };
        });

        box.querySelectorAll(".authLangs [data-lang]").forEach(b => {
            b.onclick = () => { I18n.setLanguage(b.dataset.lang); AuthManager.render(); };
        });

        document.getElementById("authForm").onsubmit = e => {
            e.preventDefault();
            AuthManager.submit();
        };

        if (google) AuthManager.googleGomb();

        setTimeout(() => {
            const f = box.querySelector("input");
            if (f) f.focus();
        }, 300);

    }

    static hiba(kod) {
        const el = document.querySelector("#authModal .authError");
        if (!el) return;
        el.hidden = !kod;
        el.innerText = kod ? (I18n.t("authErr_" + kod) !== "authErr_" + kod ? I18n.t("authErr_" + kod) : I18n.t("authErr_generic")) : "";
    }

    static submit() {

        const mod = AuthManager.mod;
        const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
        const gomb = document.querySelector("#authForm button[type=submit]");

        let url, body;

        if (mod === "login") {
            url = "/api/auth/login";
            body = { email: v("authEmail"), jelszo: document.getElementById("authPass").value };
            if (!body.email || !body.jelszo) return AuthManager.hiba("missing");
        } else if (mod === "register") {
            url = "/api/auth/register";
            const terms = document.getElementById("authTerms");
            body = { nev: v("authName"), email: v("authEmail"), jelszo: document.getElementById("authPass").value, meghivo: v("authInvite"), aszf: !!(terms && terms.checked) };
            if (!body.nev || !body.email) return AuthManager.hiba("missing");
            if (body.jelszo.length < 8) return AuthManager.hiba("weak_password");
            if (terms && !terms.checked) return AuthManager.hiba("terms_required");
        } else if (mod === "forgot") {
            url = "/api/auth/elfelejtett";
            body = { email: v("authEmail") };
            if (!body.email) return AuthManager.hiba("missing");
        } else {
            url = "/api/auth/uj-jelszo";
            body = { token: AuthManager.resetToken, jelszo: document.getElementById("authPass").value };
            if (body.jelszo.length < 8) return AuthManager.hiba("weak_password");
        }

        AuthManager.hiba(null);
        gomb.disabled = true;

        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            .then(r => r.json().then(d => ({ ok: r.ok, status: r.status, d })))
            .then(({ ok, status, d }) => {

                if (!ok) {
                    AuthManager.hiba(status === 429 ? "too_many" : (d.error || "generic"));
                    if (d.message) {
                        const el = document.querySelector("#authModal .authError");
                        if (el) el.innerText += " (" + d.message + ")";
                    }
                    return;
                }

                if (mod === "forgot") {
                    const okEl = document.querySelector("#authModal .authOk");
                    okEl.hidden = false;
                    okEl.innerText = I18n.t("authForgotSent");
                    return;
                }

                AuthManager.resetToken = null;
                AuthManager.belepett();

            })
            .catch(() => AuthManager.hiba("generic"))
            .finally(() => { gomb.disabled = false; });

    }

    // Sikeres belépés: a várakozó műveletek folytatódnak
    static belepett() {

        const kapu = document.body.classList.contains("auth-gate");

        return AuthManager.refresh().then(() => {

            document.body.classList.remove("auth-gate");
            if (AuthManager.modal) AuthManager.modal.hide();

            const v = AuthManager.varakozok;
            AuthManager.varakozok = [];
            v.forEach(x => x.resolve(AuthManager.user));

            // A kedvencek, admin számlálók stb. frissítése (a kapunál az indítás tölti be)
            if (!kapu && typeof DataManager !== "undefined") {
                DataManager.loadFavoriteIds();
                if (typeof AdminManager !== "undefined") AdminManager.refreshPendingCount();
                if (typeof PageManager !== "undefined" && PageManager.current) PageManager.show(location.hash.replace("#", "") || "home", { fromHash: true });
            }

        });

    }

    // Az admin kipróbálja a felhasználói felületet (süti: a szerver is így kezeli)
    static setView(user) {
        document.cookie = "ipnezet=" + (user ? "user" : "") + "; path=/; SameSite=Lax" + (user ? "; max-age=86400" : "; max-age=0");
        location.hash = user ? "#home" : "#admin";
        location.reload();
    }

    static logout() {
        document.cookie = "ipnezet=; path=/; max-age=0";
        return fetch("/api/auth/logout", { method: "POST" })
            .finally(() => { location.hash = "#home"; location.reload(); });
    }

    // Google gomb (Google Identity Services)
    static googleGomb() {

        // A Google-gomb a Google sütijeit használja: csak hozzájárulással töltjük be
        if (typeof ConsentManager !== "undefined" && !ConsentManager.allowed("google")) {
            const box = document.getElementById("googleBtn");
            if (!box) return;
            box.innerHTML = `
                <div class="googleConsentBox">
                    <button type="button" class="btn btn-outline-secondary w-100 googleConsentBtn">
                        <i class="fa-brands fa-google" aria-hidden="true"></i> ${I18n.t("ckGoogleBtn")}
                    </button>
                    <p class="small text-body-secondary text-center mt-1 mb-0">${I18n.t("ckGoogleNote")}</p>
                </div>`;
            box.querySelector("button").onclick = () => {
                ConsentManager.set({ google: true });
                box.innerHTML = "";
                AuthManager.googleGomb();
            };
            return;
        }

        const rajzol = () => {
            const box = document.getElementById("googleBtn");
            if (!box || !window.google || !google.accounts) return;
            google.accounts.id.initialize({
                client_id: AuthManager.config.googleClientId,
                callback: resp => {
                    fetch("/api/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: resp.credential }) })
                        .then(r => r.json().then(d => ({ ok: r.ok, d })))
                        .then(({ ok, d }) => ok ? AuthManager.belepett() : AuthManager.hiba(d.error || "generic"));
                }
            });
            google.accounts.id.renderButton(box, { theme: "outline", size: "large", width: 320, text: "continue_with", locale: I18n.current });
        };

        if (window.google && google.accounts) return rajzol();

        if (!document.getElementById("gsiScript")) {
            const s = document.createElement("script");
            s.id = "gsiScript";
            s.src = "https://accounts.google.com/gsi/client";
            s.async = true;
            s.onload = rajzol;
            document.head.appendChild(s);
        } else {
            setTimeout(rajzol, 500);
        }

    }

    // Egy fetch válasz: 401 esetén belépés, majd újra
    static handle401(r) {
        if (r.status === 401) {
            return AuthManager.kell().then(() => { throw new Error("retry"); });
        }
        return r;
    }

}
