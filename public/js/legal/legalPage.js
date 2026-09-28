// ============================================================
//  Jogi oldalak és funkciók
//
//  #jogi/impresszum    Impresszum és kapcsolat
//  #jogi/aszf          Felhasználási feltételek
//  #jogi/adatvedelem   Adatvédelmi tájékoztató (+ Adataim letöltése)
//  #jogi/sutik         Süti-tájékoztató
//  #jogi/bejelentes    Tartalom bejelentése (#jogi/bejelentes-123 = a 123-as hirdetés)
//  #jogi/bejelentesek  Admin: a bejelentések kezelése
//
//  LegalPage.modal("aszf")   ugyanezek felugró ablakban (pl. regisztrációnál)
//  LegalPage.aszfKerdes()    ÁSZF elfogadása belépés után (ha még nem fogadta el)
// ============================================================

class LegalPage {

    static DOKUMENTUMOK = ["impresszum", "aszf", "adatvedelem", "sutik"];

    static CIMEK = {
        impresszum: "legalImpresszum",
        aszf: "legalAszf",
        adatvedelem: "legalAdatvedelem",
        sutik: "legalSutik",
        bejelentes: "legalReport",
        bejelentesek: "legalReports"
    };

    static IKONOK = {
        impresszum: "fa-solid fa-circle-info",
        aszf: "fa-solid fa-file-contract",
        adatvedelem: "fa-solid fa-user-shield",
        sutik: "fa-solid fa-cookie-bite",
        bejelentes: "fa-solid fa-flag",
        bejelentesek: "fa-solid fa-inbox"
    };

    static OKOK = ["csalas", "jogsertes_kep", "szemelyes_adat", "tiltott", "hamis", "diszkriminacio", "egyeb"];

    static aktualis = "impresszum";
    static aszfNyitva = false;

    // ---------- segédek ----------

    static e(s) {
        return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    static cfg() {
        return (typeof LEGAL_CONFIG !== "undefined" && LEGAL_CONFIG) || { uzemelteto: {} };
    }

    // A szövegekhez adott környezet (üzemeltető adatai, bekapcsolt szolgáltatások)
    static ctx() {

        const cfg = LegalPage.cfg();
        const op = cfg.uzemelteto || {};
        const jogi = (typeof AuthManager !== "undefined" && AuthManager.config && AuthManager.config.jogi) || {};
        const e = LegalPage.e;

        const v = (x, cimke) => x
            ? e(x)
            : `<span class="legalTodo" title="public/js/legal/legalConfig.js"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${e(I18n.t("legalTodo"))}: ${e(cimke)}</span>`;

        return {
            op,
            ceg: op.tipus === "ceg" || op.tipus === "pfa",
            db: cfg.adatbazisHelye || "EU",
            kor: cfg.minimumKor || 18,
            mail: jogi.mail === undefined ? "brevo" : jogi.mail,
            google: jogi.google === undefined ? true : !!jogi.google,
            ai: jogi.ai === undefined ? true : !!jogi.ai,
            e,
            v,
            mailto: x => x ? `<a href="mailto:${e(x)}">${e(x)}</a>` : v("", "e-mail"),
            link: (doc, szoveg) => `<a href="#jogi/${doc}" data-legal-link="${doc}">${e(szoveg)}</a>`
        };

    }

    static datum() {
        const d = new Date((LegalPage.cfg().hatalyos || "2026-09-28") + "T12:00:00");
        const loc = { hu: "hu-HU", ro: "ro-RO", en: "en-GB" }[I18n.current] || "en-GB";
        return d.toLocaleDateString(loc, { year: "numeric", month: "long", day: "numeric" });
    }

    static szoveg(doc) {
        const nyelv = LEGAL_DOCS[I18n.current] ? I18n.current : "en";
        const fn = LEGAL_DOCS[nyelv][doc];
        return fn ? fn(LegalPage.ctx()) : "";
    }

    // "Elmúltam 18 éves, elfogadom a [Felhasználási feltételeket] ..." – linkekkel
    static feltetelSzoveg(kulcs) {
        const link = (doc, k) => `<a href="#jogi/${doc}" data-legal-modal="${doc}">${LegalPage.e(I18n.t(k))}</a>`;
        return LegalPage.e(I18n.t(kulcs))
            .replace("{kor}", LegalPage.cfg().minimumKor || 18)
            .replace("{aszf}", link("aszf", "authTermsAszf"))
            .replace("{adatv}", link("adatvedelem", "authTermsAdatv"));
    }

    // ---------- indítás ----------

    static init() {

        LegalPage.labLec();

        // Linkek a jogi szövegekben / láblécben / süti-sávban
        document.addEventListener("click", e => {

            const m = e.target.closest("[data-legal-modal]");
            if (m) {
                e.preventDefault();
                LegalPage.modal(m.dataset.legalModal);
                return;
            }

            const l = e.target.closest("[data-legal-link]");
            if (l) {
                // Felugró ablakon belül, vagy a privát oldal belépő kapujánál: ablakban
                const ablak = l.closest(".modal") || document.body.classList.contains("auth-gate");
                if (ablak) {
                    e.preventDefault();
                    LegalPage.modal(l.dataset.legalLink);
                }
            }

        });

        I18n.onChange(() => {
            LegalPage.labLec();
            if (typeof PageManager !== "undefined" && PageManager.current === "jogi") {
                LegalPage.show(LegalPage.aktualisParam || LegalPage.aktualis);
            }
            const ablak = document.getElementById("legalModal");
            if (ablak && ablak.classList.contains("show")) LegalPage.modal(LegalPage.modalDoc);
        });

    }

    // A lábléc dinamikus részei (év, fogyasztóvédelem)
    static labLec() {

        const ev = document.getElementById("footerYear");
        if (ev) ev.innerText = new Date().getFullYear();

        const nev = document.getElementById("footerOperator");
        const op = LegalPage.cfg().uzemelteto || {};
        if (nev) nev.innerText = op.nev ? " · " + op.nev : "";

        const anpc = document.getElementById("footerAnpc");
        if (anpc) {
            const ceg = op.tipus === "ceg" || op.tipus === "pfa";
            anpc.hidden = !ceg;
            anpc.innerHTML = ceg
                ? `<a href="https://anpc.ro" target="_blank" rel="noopener">ANPC</a> · <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener">SAL</a>`
                : "";
        }

    }

    // ---------- oldal ----------

    static show(param) {

        const box = document.getElementById("jogiContent");
        if (!box) return;

        param = param || "impresszum";
        LegalPage.aktualisParam = param;

        const bej = String(param).match(/^bejelentes(?:-(\d+))?$/);
        const doc = bej ? "bejelentes" : (LegalPage.CIMEK[param] ? param : "impresszum");

        LegalPage.aktualis = doc;

        const fulek = [...LegalPage.DOKUMENTUMOK, "bejelentes"].map(d => `
            <li class="nav-item">
                <a class="nav-link ${d === doc ? "active" : ""}" href="#jogi/${d}" ${d === doc ? 'aria-current="page"' : ""}>
                    <i class="${LegalPage.IKONOK[d]}" aria-hidden="true"></i> ${I18n.t(LegalPage.CIMEK[d])}
                </a>
            </li>`).join("");

        const admin = typeof AuthManager !== "undefined" && AuthManager.isAdmin();

        box.innerHTML = `
            <div class="pageHeader legalHeader">
                <h2>${I18n.t(LegalPage.CIMEK[doc])}</h2>
                ${LegalPage.DOKUMENTUMOK.includes(doc) ? `
                    <p class="text-body-secondary small mb-0">
                        ${I18n.f("legalEffective", { d: LegalPage.datum() })}
                        · <button type="button" class="btn btn-link btn-sm p-0 align-baseline" onclick="window.print()"><i class="fa-solid fa-print" aria-hidden="true"></i> ${I18n.t("legalPrint")}</button>
                    </p>` : ""}
            </div>
            <ul class="nav nav-pills legalTabs mb-4">
                ${fulek}
                ${admin ? `<li class="nav-item"><a class="nav-link ${doc === "bejelentesek" ? "active" : ""}" href="#jogi/bejelentesek"><i class="${LegalPage.IKONOK.bejelentesek}" aria-hidden="true"></i> ${I18n.t("legalReports")}</a></li>` : ""}
            </ul>
            <div id="legalBody"></div>`;

        const body = document.getElementById("legalBody");

        if (param === "bejelentesek") {
            LegalPage.adminLista(body);
            return;
        }

        if (doc === "bejelentes") {
            LegalPage.urlap(body, bej && bej[1] ? Number(bej[1]) : null);
            return;
        }

        body.innerHTML = `
            ${doc === "adatvedelem" ? LegalPage.adataimDoboz() : ""}
            <article class="card legalDoc" lang="${LEGAL_DOCS[I18n.current] ? I18n.current : "en"}">
                <div class="card-body">${LegalPage.szoveg(doc)}</div>
            </article>`;

    }

    static adataimDoboz() {

        const bent = typeof AuthManager !== "undefined" && AuthManager.loggedIn();

        return `
            <div class="card legalData mb-4">
                <div class="card-body d-flex flex-wrap flex-md-nowrap align-items-center gap-3">
                    <i class="fa-solid fa-file-arrow-down legalDataIcon" aria-hidden="true"></i>
                    <div class="legalDataText">
                        <b>${I18n.t("legalDataTitle")}</b>
                        <p class="small text-body-secondary mb-0">${I18n.t(bent ? "legalDataText" : "legalDataLogin")} ${bent ? I18n.t("legalDeleteHint") : ""}</p>
                    </div>
                    ${bent
                        ? `<a class="btn btn-primary btn-sm" href="/api/jogi/adataim" download><i class="fa-solid fa-download" aria-hidden="true"></i> ${I18n.t("legalDataBtn")}</a>`
                        : `<button type="button" class="btn btn-outline-primary btn-sm" onclick="AuthManager.open('login')">${I18n.t("authLoginBtn")}</button>`}
                </div>
            </div>`;

    }

    // ---------- felugró ablak ----------

    static modal(doc) {

        if (!LegalPage.CIMEK[doc] || doc === "bejelentesek") doc = "impresszum";

        // A bejelentő űrlap saját oldalon van
        if (doc === "bejelentes") {
            const nyitott = document.querySelector(".modal.show");
            if (nyitott && !document.body.classList.contains("auth-gate")) bootstrap.Modal.getInstance(nyitott)?.hide();
            location.hash = "#jogi/bejelentes";
            return;
        }

        LegalPage.modalDoc = doc;

        let el = document.getElementById("legalModal");

        if (!el) {
            el = document.createElement("div");
            el.id = "legalModal";
            el.className = "modal fade";
            el.tabIndex = -1;
            el.setAttribute("aria-labelledby", "legalModalTitle");
            el.innerHTML = `<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"></div></div>`;
            document.body.appendChild(el);

            // Egy másik ablak (pl. belépés) fölött is jól látsszon
            el.addEventListener("shown.bs.modal", () => {
                const hatter = document.querySelectorAll(".modal-backdrop");
                if (hatter.length > 1) hatter[hatter.length - 1].classList.add("legalBackdrop");
            });
            el.addEventListener("hidden.bs.modal", () => {
                // A korábbi ablak görgetése / fókusza maradjon meg
                if (document.querySelector(".modal.show")) document.body.classList.add("modal-open");
            });
        }

        el.querySelector(".modal-content").innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title" id="legalModalTitle"><i class="${LegalPage.IKONOK[doc]}" aria-hidden="true"></i> ${I18n.t(LegalPage.CIMEK[doc])}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${I18n.t("close")}"></button>
            </div>
            <div class="modal-body legalDoc">
                <p class="text-body-secondary small">${I18n.f("legalEffective", { d: LegalPage.datum() })}</p>
                ${LegalPage.szoveg(doc)}
            </div>`;

        el.querySelector(".modal-body").scrollTop = 0;

        bootstrap.Modal.getOrCreateInstance(el).show();

    }

    // ---------- ÁSZF elfogadása belépés után ----------

    static aszfKerdes() {

        if (LegalPage.aszfNyitva) return;
        LegalPage.aszfNyitva = true;

        // A belépő ablak bezáródása után
        setTimeout(() => {

            let el = document.getElementById("termsModal");

            if (!el) {
                el = document.createElement("div");
                el.id = "termsModal";
                el.className = "modal fade";
                el.tabIndex = -1;
                el.setAttribute("aria-labelledby", "termsModalTitle");
                el.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content"></div></div>`;
                document.body.appendChild(el);
            }

            const regi = !!(AuthManager.user && AuthManager.user.created_at && new Date(AuthManager.user.created_at) < new Date((LegalPage.cfg().hatalyos || "2026-09-28") + "T00:00:00"));

            const rajzol = () => {
                el.querySelector(".modal-content").innerHTML = `
                    <div class="modal-body p-4">
                        <h4 id="termsModalTitle" class="mb-2"><i class="fa-solid fa-file-contract text-primary" aria-hidden="true"></i> ${I18n.t(regi ? "tmTitleUpdate" : "tmTitle")}</h4>
                        <p class="text-body-secondary">${I18n.t("tmText")}</p>
                        <div class="form-check mb-3">
                            <input class="form-check-input" type="checkbox" id="termsCheck">
                            <label class="form-check-label small" for="termsCheck">${LegalPage.feltetelSzoveg("tmCheck")}</label>
                        </div>
                        <div class="alert alert-danger small py-2" id="termsError" hidden></div>
                        <div class="d-flex gap-2 justify-content-end">
                            <button type="button" class="btn btn-outline-secondary" id="termsLogout">${I18n.t("tmLogout")}</button>
                            <button type="button" class="btn btn-primary" id="termsAccept" disabled>${I18n.t("tmAccept")}</button>
                        </div>
                    </div>`;

                const chk = el.querySelector("#termsCheck");
                const ok = el.querySelector("#termsAccept");

                chk.onchange = () => { ok.disabled = !chk.checked; };

                el.querySelector("#termsLogout").onclick = () => AuthManager.logout();

                ok.onclick = () => {
                    ok.disabled = true;
                    fetch("/api/jogi/aszf", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ elfogad: true })
                    })
                        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
                        .then(() => {
                            LegalPage.aszfNyitva = false;
                            bootstrap.Modal.getOrCreateInstance(el).hide();
                        })
                        .catch(() => {
                            const h = el.querySelector("#termsError");
                            h.hidden = false;
                            h.innerText = I18n.t("rpErr_generic");
                            ok.disabled = false;
                        });
                };
            };

            rajzol();
            el._rajzol = rajzol;

            if (!el._figyel) {
                el._figyel = true;
                I18n.onChange(() => { if (LegalPage.aszfNyitva && el._rajzol) el._rajzol(); });
            }

            bootstrap.Modal.getOrCreateInstance(el, { backdrop: "static", keyboard: false }).show();

        }, 600);

    }

    // ---------- bejelentő űrlap (DSA 16. cikk) ----------

    static urlap(box, ingatlanId) {

        const u = (typeof AuthManager !== "undefined" && AuthManager.user) || {};
        const e = LegalPage.e;

        box.innerHTML = `
            <div class="card legalDoc">
                <div class="card-body">
                    <p class="legalLead">${I18n.t("rpIntro")}</p>
                    <form id="reportForm" novalidate>
                        ${ingatlanId ? `
                            <div class="mb-3">
                                <span class="form-label d-block">${I18n.t("rpListing")}</span>
                                <a href="#listing/${ingatlanId}" class="reportListing" id="reportListing">#${ingatlanId}</a>
                            </div>` : `
                            <div class="mb-3">
                                <label class="form-label" for="rpUrl">${I18n.t("rpUrl")} *</label>
                                <input class="form-control" id="rpUrl" type="url" maxlength="1000" required placeholder="${e(location.origin)}/#listing/123">
                                <div class="form-text">${I18n.t("rpUrlHelp")}</div>
                            </div>`}
                        <div class="mb-3">
                            <label class="form-label" for="rpOk">${I18n.t("rpReason")} *</label>
                            <select class="form-select" id="rpOk" required>
                                <option value="">${I18n.t("rpChoose")}</option>
                                ${LegalPage.OKOK.map(o => `<option value="${o}">${I18n.t("rp_" + o)}</option>`).join("")}
                            </select>
                        </div>
                        <div class="mb-3">
                            <label class="form-label" for="rpLeiras">${I18n.t("rpDesc")} *</label>
                            <textarea class="form-control" id="rpLeiras" rows="5" maxlength="5000" required></textarea>
                            <div class="form-text">${I18n.t("rpDescHelp")}</div>
                        </div>
                        <div class="row g-3 mb-3">
                            <div class="col-md-6">
                                <label class="form-label" for="rpNev">${I18n.t("rpName")}</label>
                                <input class="form-control" id="rpNev" maxlength="120" autocomplete="name" value="${e(u.nev || "")}">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label" for="rpEmail">${I18n.t("rpEmail")}</label>
                                <input class="form-control" id="rpEmail" type="email" maxlength="200" autocomplete="email" value="${e(u.email || "")}">
                                <div class="form-text">${I18n.t("rpEmailHelp")}</div>
                            </div>
                        </div>
                        <div class="form-check mb-3">
                            <input class="form-check-input" type="checkbox" id="rpJohiszem" required>
                            <label class="form-check-label" for="rpJohiszem">${I18n.t("rpGoodFaith")} *</label>
                        </div>
                        <div class="alert alert-danger small py-2" id="rpHiba" hidden></div>
                        <div class="alert alert-success" id="rpOkUzenet" hidden></div>
                        <div class="d-flex flex-wrap align-items-center gap-3">
                            <button class="btn btn-primary" type="submit"><i class="fa-solid fa-flag" aria-hidden="true"></i> ${I18n.t("rpSend")}</button>
                            <span class="small text-body-secondary">${I18n.t("rpPrivacy").replace(/\.$/, "")}: <a href="#jogi/adatvedelem">${I18n.t("legalAdatvedelem")}</a></span>
                        </div>
                    </form>
                </div>
            </div>`;

        // A hirdetés címe
        if (ingatlanId) {
            fetch("/api/ingatlanok/" + ingatlanId)
                .then(r => r.ok ? r.json() : null)
                .then(i => {
                    const a = document.getElementById("reportListing");
                    if (a && i) a.innerText = `#${i.id} – ${i.cim || [i.varos, i.kerulet].filter(Boolean).join(", ")}`;
                })
                .catch(() => { });
        }

        const form = document.getElementById("reportForm");

        form.onsubmit = ev => {

            ev.preventDefault();

            const hiba = document.getElementById("rpHiba");
            const gomb = form.querySelector("button[type=submit]");
            const val = id => { const x = document.getElementById(id); return x ? x.value.trim() : ""; };

            const adat = {
                ingatlan_id: ingatlanId || null,
                url: ingatlanId ? `${location.origin}/#listing/${ingatlanId}` : val("rpUrl"),
                ok: val("rpOk"),
                leiras: val("rpLeiras"),
                nev: val("rpNev"),
                email: val("rpEmail"),
                johiszem: document.getElementById("rpJohiszem").checked
            };

            const mutat = kod => {
                hiba.hidden = !kod;
                const k = "rpErr_" + kod;
                hiba.innerText = kod ? (I18n.t(k) !== k ? I18n.t(k) : I18n.t("rpErr_generic")) : "";
            };

            if (!adat.url || adat.leiras.length < 10) return mutat("missing");
            if (!adat.ok) return mutat("bad_reason");
            if (!adat.johiszem) return mutat("good_faith_required");

            mutat(null);
            gomb.disabled = true;

            fetch("/api/jogi/bejelentes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(adat)
            })
                .then(r => r.json().then(d => ({ ok: r.ok, status: r.status, d })))
                .then(({ ok, status, d }) => {
                    if (!ok) {
                        gomb.disabled = false;
                        return mutat(status === 429 ? "too_many" : (d.error || "generic"));
                    }
                    form.querySelectorAll("input, select, textarea, button").forEach(x => { x.disabled = true; });
                    const kesz = document.getElementById("rpOkUzenet");
                    kesz.hidden = false;
                    kesz.innerText = I18n.f(adat.email ? "rpSent" : "rpSentNoMail", { szam: d.szam });
                    kesz.scrollIntoView({ block: "center", behavior: "smooth" });
                })
                .catch(() => { gomb.disabled = false; mutat("generic"); });

        };

    }

    // A hirdetés oldal alján: „Hirdetés bejelentése”
    static listingHook(id) {

        const sec = document.getElementById("page-listing");
        if (!sec || !id) return;

        let box = document.getElementById("listingReportBox");

        if (!box) {
            box = document.createElement("div");
            box.id = "listingReportBox";
            box.className = "listingReportBox";
            sec.appendChild(box);
        }

        box.innerHTML = `<a href="#jogi/bejelentes-${Number(id)}" class="btn btn-link btn-sm text-body-secondary"><i class="fa-regular fa-flag" aria-hidden="true"></i> <span data-i18n="rpListingBtn">${I18n.t("rpListingBtn")}</span></a>`;

    }

    // ---------- admin: bejelentések ----------

    static adminLista(box) {

        if (typeof AuthManager === "undefined" || !AuthManager.isAdmin()) {
            box.innerHTML = `<div class="emptyState">${I18n.t("rvAdminOnly")}</div>`;
            return;
        }

        box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        fetch("/api/jogi/bejelentesek")
            .then(r => r.json())
            .then(lista => {

                if (!Array.isArray(lista)) throw new Error();

                const e = LegalPage.e;
                const ido = d => d ? new Date(d).toLocaleString(I18n.current) : "";

                box.innerHTML = `
                    <p class="text-body-secondary">${I18n.t("rvIntro")}</p>
                    ${lista.length ? "" : `<div class="emptyState">${I18n.t("rvEmpty")}</div>`}
                    ${lista.map(b => `
                        <div class="card reportCard mb-3" data-id="${b.id}">
                            <div class="card-body">
                                <div class="d-flex flex-wrap justify-content-between gap-2 mb-2">
                                    <div>
                                        <b>#${b.id}</b> · ${e(I18n.t("rp_" + b.ok))}
                                        <span class="badge ${b.statusz === "uj" ? "text-bg-danger" : (b.statusz === "folyamatban" ? "text-bg-warning" : "text-bg-secondary")} ms-1">${I18n.t("rvStatus_" + b.statusz)}</span>
                                    </div>
                                    <small class="text-body-secondary">${ido(b.created_at)}</small>
                                </div>
                                <p class="mb-2">
                                    ${b.ingatlan_id
                                        ? `<a href="#listing/${b.ingatlan_id}">#${b.ingatlan_id} ${e(b.ingatlan_cim || "")}</a>${b.ingatlan_statusz === "tiltott" ? ` <span class="badge text-bg-dark">${I18n.t("rvListingHidden")}</span>` : ""}`
                                        : `<a href="${e(b.url)}" target="_blank" rel="noopener nofollow">${e(b.url)}</a>`}
                                </p>
                                <p class="reportText mb-2">${e(b.leiras)}</p>
                                <p class="small text-body-secondary mb-3">${I18n.t("rvReporter")}: ${e(b.nev || "–")} ${b.email ? `&lt;<a href="mailto:${e(b.email)}">${e(b.email)}</a>&gt;` : ""}</p>
                                <div class="row g-2 align-items-start">
                                    <div class="col-md-4">
                                        <label class="form-label small mb-1">${I18n.t("rvDecision")}</label>
                                        <select class="form-select form-select-sm" data-f="statusz">
                                            ${["uj", "folyamatban", "eltavolitva", "elutasitva"].map(s => `<option value="${s}" ${s === b.statusz ? "selected" : ""}>${I18n.t("rvStatus_" + s)}</option>`).join("")}
                                        </select>
                                    </div>
                                    <div class="col-md-8">
                                        <textarea class="form-control form-control-sm" data-f="indok" rows="3" placeholder="${e(I18n.t("rvReasonPh"))}">${e(b.dontes_indok || "")}</textarea>
                                    </div>
                                </div>
                                ${b.ingatlan_id && b.ingatlan_statusz !== "tiltott" ? `
                                    <div class="form-check mt-2">
                                        <input class="form-check-input" type="checkbox" data-f="elrejt" id="rvHide${b.id}">
                                        <label class="form-check-label small" for="rvHide${b.id}">${I18n.t("rvHide")}</label>
                                    </div>` : ""}
                                <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
                                    <button type="button" class="btn btn-primary btn-sm" data-f="ment">${I18n.t("rvSave")}</button>
                                    <span class="small" data-f="uzenet"></span>
                                </div>
                            </div>
                        </div>`).join("")}`;

                box.querySelectorAll(".reportCard").forEach(kartya => {

                    const f = n => kartya.querySelector(`[data-f="${n}"]`);

                    f("ment").onclick = () => {

                        const uz = f("uzenet");
                        const elrejt = f("elrejt");

                        f("ment").disabled = true;
                        uz.className = "small";
                        uz.innerText = "";

                        fetch("/api/jogi/bejelentesek/" + kartya.dataset.id, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                statusz: f("statusz").value,
                                indok: f("indok").value.trim(),
                                elrejt: !!(elrejt && elrejt.checked)
                            })
                        })
                            .then(r => r.json().then(d => ({ ok: r.ok, d })))
                            .then(({ ok, d }) => {
                                f("ment").disabled = false;
                                if (!ok) {
                                    uz.className = "small text-danger";
                                    const k = "rvErr_" + d.error;
                                    uz.innerText = I18n.t(k) !== k ? I18n.t(k) : I18n.t("rpErr_generic");
                                    return;
                                }
                                const vegleges = ["eltavolitva", "elutasitva"].includes(f("statusz").value);
                                uz.className = "small text-success";
                                uz.innerText = I18n.t("rvSaved") + (vegleges
                                    ? " " + ((d.bejelentoErtesitve || d.hirdetoErtesitve) ? I18n.t("rvMailed") : I18n.t("rvNoMail"))
                                    : "");
                                if (elrejt && elrejt.checked) setTimeout(() => LegalPage.adminLista(box), 1500);
                            })
                            .catch(() => {
                                f("ment").disabled = false;
                                uz.className = "small text-danger";
                                uz.innerText = I18n.t("rpErr_generic");
                            });

                    };

                });

            })
            .catch(() => {
                box.innerHTML = `<div class="alert alert-danger">${I18n.t("rpErr_generic")}</div>`;
            });

    }

}

// Indítás: a süti-sáv és a lábléc az app többi része előtt
document.addEventListener("DOMContentLoaded", () => {
    ConsentManager.init();
    LegalPage.init();
});
