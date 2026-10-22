// ============================================================
//  Fiókom → Értesítések (#fiok/ertesitesek)
//
//  Bal oldalt az értesítések (új találat egy mentett kereséshez vagy az
//  igényhez, egy kedvenc ára változott / már nem elérhető), jobb oldalt a
//  beállítás: típusonként az oldalon és/vagy e-mailben (azonnal, naponta,
//  hetente, soha). A fejléc csengője az olvasatlanok számát mutatja.
//  Szerver: server/services/ertesitesek.js, server/routes/ertesitesek.js
// ============================================================

class Notifications {

    static adat = null;

    static IKON = {
        kereses: "fa-solid fa-bookmark",
        igeny: "fa-solid fa-bullhorn",
        kedvenc_ar: "fa-solid fa-tag",
        kedvenc_statusz: "fa-solid fa-circle-info",
        uzenet: "fa-solid fa-envelope"
    };

    static TIPUSOK = ["kereses", "igeny", "kedvenc_ar", "kedvenc_statusz", "uzenet"];

    // ---------- a csengő a fejlécben ----------

    static jelvenyFrissit(n) {
        if (typeof n === "number") AuthManager.ertesites = n;
        const db = AuthManager.ertesites || 0;
        document.querySelectorAll(".navBellCount, .accNotifCount").forEach(b => {
            b.hidden = !(db > 0);
            b.innerText = db > 9 ? "9+" : db;
        });
        const bell = document.getElementById("navBellBtn");
        if (bell) {
            const t = db ? I18n.f("ntfBellN", { n: db }) : I18n.t("ntfTitle");
            bell.title = t;
            bell.setAttribute("aria-label", t);
        }
    }

    // 2 percenként (ha a lap látszik): van-e új értesítés
    static figyel() {
        if (Notifications._figyel) return;
        Notifications._figyel = setInterval(() => {
            if (document.hidden || !AuthManager.loggedIn()) return;
            fetch("/api/ertesitesek/db", { cache: "no-store" })
                .then(r => r.ok ? r.json() : null)
                .then(v => { if (v && typeof v.olvasatlan === "number") Notifications.jelvenyFrissit(v.olvasatlan); })
                .catch(() => { });
        }, 2 * 60 * 1000);
    }

    // A levelek nyelve: a weboldal nyelve (belépve, nyelvváltáskor)
    static nyelvKuld() {
        if (!AuthManager.loggedIn()) return;
        const ny = I18n.current;
        if (Notifications._nyelv === ny) return;
        Notifications._nyelv = ny;
        fetch("/api/ertesitesek/nyelv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nyelv: ny }) }).catch(() => { });
    }

    // ---------- az oldal ----------

    static render(el) {

        AccountPage.spinner(el);

        fetch("/api/ertesitesek", { cache: "no-store" })
            .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then(v => {
                Notifications.adat = v;
                Notifications.rajzol(el);
                // megnyitva = elolvasva (ebben a nézetben még kiemelve látszanak)
                if (v.olvasatlan) {
                    fetch("/api/ertesitesek/olvasva", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mind: true }) })
                        .then(r => r.json()).then(x => Notifications.jelvenyFrissit(x.olvasatlan || 0)).catch(() => { });
                }
            })
            .catch(() => { el.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`; });

    }

    static rajzol(el) {

        const v = Notifications.adat || { lista: [], beallitas: {} };
        const esc = Utils.escape;
        const lista = v.lista || [];

        el.innerHTML = `
            <div class="row g-4">
                <div class="col-xl-7">
                    <div class="card">
                        <div class="card-header d-flex flex-wrap align-items-center gap-2">
                            <h5 class="mb-0 flex-fill"><i class="fa-regular fa-bell" aria-hidden="true"></i> ${I18n.t("ntfTitle")}</h5>
                            ${lista.length ? `<button type="button" class="btn btn-sm btn-link text-body-secondary" id="ntfClear"><i class="fa-solid fa-trash" aria-hidden="true"></i> ${I18n.t("ntfClearAll")}</button>` : ""}
                        </div>
                        <div class="card-body p-0">
                            ${lista.length ? `<ul class="ntfList">${lista.map(e => Notifications.elem(e)).join("")}</ul>` : `
                                <div class="emptyState py-5">
                                    <i class="fa-regular fa-bell" aria-hidden="true"></i>
                                    <h5>${I18n.t("ntfEmpty")}</h5>
                                    <p>${I18n.t("ntfEmptyHint")}</p>
                                </div>`}
                        </div>
                    </div>
                </div>
                <div class="col-xl-5">
                    ${Notifications.beallitasHtml(v)}
                </div>
            </div>`;

        Notifications.kot(el);

    }

    // Egy hirdetés kicsiben (kép, cím, ár)
    static hirdetes(h, extra) {
        if (!h) return "";
        const esc = Utils.escape;
        const kep = h.kep ? (String(h.kep).startsWith("db:") ? "/api/kepek/" + String(h.kep).slice(3) : Utils.imgUrl(h.kep)) : null;
        const cim = [Types.label(h.tipus), h.cim || (typeof CityManager !== "undefined" && CityManager.helyReszLabel ? CityManager.helyReszLabel(h) : "") || h.varos].filter(Boolean).join(" – ");
        const adatok = [h.nm ? Utils.nm(h.nm) : "", h.szobak ? `${h.szobak} ${I18n.t("colSzoba").toLowerCase()}` : ""].filter(Boolean).join(" · ");
        return `
            <a class="ntfListing" href="#listing/${Number(h.id)}">
                <span class="ntfThumb">${kep ? `<img src="${esc(kep)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<i class="fa-regular fa-image" aria-hidden="true"></i>`}</span>
                <span class="ntfListingText">
                    <b>${esc(cim)}</b>
                    <span><span class="ntfPrice">${esc(Utils.price(h))}</span>${adatok ? ` · ${esc(adatok)}` : ""}</span>
                    ${extra || ""}
                </span>
            </a>`;
    }

    static elem(e) {

        const esc = Utils.escape;
        const a = e.adat || {};
        let cim = "", tartalom = "";

        if (e.tipus === "kereses" || e.tipus === "igeny") {
            cim = e.tipus === "kereses"
                ? I18n.f("ntfSearchN", { n: a.db, nev: a.nev || I18n.t("ntfSavedSearch") })
                : I18n.f("ntfRequestN", { n: a.db }) + (a.cim ? `: ${a.cim}` : "");
            const l = (a.hirdetesek || []).slice(0, 3);
            tartalom = l.map(h => Notifications.hirdetes(h)).join("")
                + (a.db > l.length ? `<button type="button" class="btn btn-link btn-sm px-0" data-ntf-open="${e.id}">${esc(I18n.f("ntfMoreN", { n: a.db - l.length }))}</button>` : "");
        } else if (e.tipus === "kedvenc_ar") {
            const le = a.uj < a.regi;
            cim = I18n.t(le ? "ntfPriceDown" : "ntfPriceUp");
            tartalom = Notifications.hirdetes({ ...(a.hirdetes || {}), ar: a.uj },
                `<span class="ntfPriceChange"><s>${esc(Utils.eur(a.regi))}</s> → <b class="${le ? "text-success" : "text-danger"}">${esc(Utils.eur(a.uj))}</b> (${a.szazalek > 0 ? "+" : ""}${esc(String(a.szazalek))}%)</span>`);
        } else if (e.tipus === "kedvenc_statusz") {
            cim = I18n.t(a.allapot === "ujra" ? "ntfAvailableAgain" : "ntfUnavailable");
            tartalom = Notifications.hirdetes(a.hirdetes);
        } else {
            return "";
        }

        return `
            <li class="ntfItem ${e.olvasva ? "" : "unread"}" data-ntf="${e.id}">
                <span class="ntfIcon ntf-${esc(e.tipus)}"><i class="${Notifications.IKON[e.tipus] || "fa-regular fa-bell"}" aria-hidden="true"></i></span>
                <div class="ntfBody">
                    <div class="d-flex align-items-start gap-2">
                        <b class="flex-fill">${esc(cim)}</b>
                        <small class="text-body-secondary text-nowrap">${esc(Notifications.mikor(e.created_at))}</small>
                        <button type="button" class="btn-close btn-close-sm ntfDel" data-ntf-del="${e.id}" aria-label="${esc(I18n.t("ntfDelete"))}" title="${esc(I18n.t("ntfDelete"))}"></button>
                    </div>
                    ${tartalom}
                </div>
            </li>`;

    }

    // "5 perce", "3 órája", vagy a dátum
    static mikor(d) {
        const t = new Date(d);
        const perc = Math.round((Date.now() - t.getTime()) / 60000);
        if (perc < 1) return I18n.t("ntfNow");
        if (perc < 60) return I18n.f("ntfMinAgo", { n: perc });
        if (perc < 24 * 60) return I18n.f("ntfHourAgo", { n: Math.round(perc / 60) });
        return Utils.ago(d);
    }

    static beallitasHtml(v) {

        const esc = Utils.escape;
        const b = v.beallitas || { tipusok: {} };
        const t = b.tipusok || {};
        const emailOk = !!b.email;
        const gyak = (tipus, ertek) => {
            const opciok = tipus === "uzenet" ? ["azonnal", "ki"] : ["azonnal", "napi", "heti", "ki"];
            return `<select class="form-select form-select-sm" data-ntf-email="${tipus}" aria-label="${esc(I18n.t("ntfColEmail"))}">
                ${opciok.map(o => `<option value="${o}" ${o === ertek ? "selected" : ""}>${esc(I18n.t("ntfFreq_" + o))}</option>`).join("")}
            </select>`;
        };

        return `
            <form class="card" id="ntfForm">
                <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-sliders" aria-hidden="true"></i> ${I18n.t("ntfSettings")}</h5></div>
                <div class="card-body">
                    <div class="form-check form-switch mb-1">
                        <input class="form-check-input" type="checkbox" id="ntfEmailMind" ${b.email_mind !== false ? "checked" : ""} ${emailOk ? "" : "disabled"}>
                        <label class="form-check-label fw-semibold" for="ntfEmailMind">${I18n.t("ntfEmailAll")}</label>
                    </div>
                    <p class="small text-body-secondary mb-3">
                        ${emailOk ? esc(I18n.f("ntfEmailTo", { email: b.email })) : `<span class="text-warning-emphasis">${I18n.t("accNoEmail")}</span>`}
                        ${!v.email ? `<br>${I18n.t("accNotifyOff")}` : ""}
                    </p>

                    <div class="ntfPrefs">
                        <div class="ntfPrefHead small text-body-secondary">
                            <span></span><span>${I18n.t("ntfColSite")}</span><span>${I18n.t("ntfColEmail")}</span>
                        </div>
                        ${Notifications.TIPUSOK.map(k => {
                            const p = t[k] || {};
                            return `
                                <div class="ntfPref">
                                    <div>
                                        <b><i class="${Notifications.IKON[k]} me-1" aria-hidden="true"></i>${I18n.t("ntfType_" + k)}</b>
                                        <div class="small text-body-secondary">${I18n.t("ntfTypeHelp_" + k)}</div>
                                        ${k === "kedvenc_ar" ? `
                                            <div class="form-check mt-1">
                                                <input class="form-check-input" type="checkbox" id="ntfCsakLe" ${p.csak_csokkenes ? "checked" : ""}>
                                                <label class="form-check-label small" for="ntfCsakLe">${I18n.t("ntfOnlyDrops")}</label>
                                            </div>` : ""}
                                    </div>
                                    <div class="text-center">
                                        ${k === "uzenet" ? `<span class="small text-body-secondary" title="${esc(I18n.t("ntfMsgOwnPage"))}">–</span>` : `
                                        <span class="ntfMobLabel">${I18n.t("ntfColSite")}</span>
                                        <div class="form-check form-switch d-inline-block mb-0">
                                            <input class="form-check-input" type="checkbox" data-ntf-site="${k}" ${p.oldal !== false ? "checked" : ""} aria-label="${esc(I18n.t("ntfColSite"))}">
                                        </div>`}
                                    </div>
                                    <div><span class="ntfMobLabel">${I18n.t("ntfColEmail")}</span>${gyak(k, p.email)}</div>
                                </div>`;
                        }).join("")}
                    </div>
                    <p class="small text-body-secondary mt-3 mb-0">${I18n.t("ntfHowNote")}</p>
                    <div class="d-flex align-items-center gap-2 mt-3">
                        <button type="submit" class="btn btn-primary">${I18n.t("save")}</button>
                        <span class="small" id="ntfMsg" aria-live="polite"></span>
                    </div>
                </div>
            </form>`;

    }

    static kot(el) {

        const v = Notifications.adat || {};

        // e-mail mind ki: a gyakoriságok nem számítanak
        const mind = document.getElementById("ntfEmailMind");
        const igazit = () => el.querySelectorAll("[data-ntf-email]").forEach(s => { s.disabled = !mind.checked || mind.disabled; });
        if (mind) { mind.onchange = igazit; igazit(); }

        document.getElementById("ntfForm").onsubmit = e => {
            e.preventDefault();
            const tipusok = {};
            Notifications.TIPUSOK.forEach(k => {
                const site = el.querySelector(`[data-ntf-site="${k}"]`);
                const em = el.querySelector(`[data-ntf-email="${k}"]`);
                tipusok[k] = { ...(site ? { oldal: site.checked } : {}), email: em ? em.value : undefined };
            });
            tipusok.kedvenc_ar.csak_csokkenes = document.getElementById("ntfCsakLe").checked;
            const msg = document.getElementById("ntfMsg");
            msg.className = "small text-body-secondary";
            msg.innerText = "…";
            fetch("/api/ertesitesek/beallitas", {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tipusok, email_mind: mind ? mind.checked : true, nyelv: I18n.current })
            })
                .then(r => { if (!r.ok) throw new Error(); return r.json(); })
                .then(x => {
                    v.beallitas = x.beallitas;
                    if (AuthManager.user) AuthManager.user.ertesites_email = x.beallitas.email_mind;
                    msg.className = "small text-success";
                    msg.innerHTML = `<i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("ntfSaved")}`;
                })
                .catch(() => { msg.className = "small text-danger"; msg.innerText = I18n.t("alertSaveError"); });
        };

        el.querySelectorAll("[data-ntf-del]").forEach(b => {
            b.onclick = ev => {
                ev.preventDefault();
                ev.stopPropagation();
                const id = Number(b.dataset.ntfDel);
                fetch("/api/ertesitesek/" + id, { method: "DELETE" }).then(r => r.json()).then(x => {
                    v.lista = (v.lista || []).filter(e => e.id !== id);
                    Notifications.jelvenyFrissit(x.olvasatlan || 0);
                    Notifications.rajzol(el);
                }).catch(() => { });
            };
        });

        const clr = document.getElementById("ntfClear");
        if (clr) clr.onclick = () => {
            if (!confirm(I18n.t("ntfClearConfirm"))) return;
            fetch("/api/ertesitesek/mind", { method: "DELETE" }).then(() => {
                v.lista = [];
                Notifications.jelvenyFrissit(0);
                Notifications.rajzol(el);
            }).catch(() => { });
        };

        // Az értesítés megnyitása: a mentett keresés találatai / az igény / a hirdetés
        el.querySelectorAll(".ntfItem").forEach(li => {
            li.addEventListener("click", ev => {
                if (ev.target.closest("a, button, input, select, label")) return;
                Notifications.nyit((v.lista || []).find(e => e.id === Number(li.dataset.ntf)));
            });
        });
        el.querySelectorAll("[data-ntf-open]").forEach(b => {
            b.onclick = () => Notifications.nyit((v.lista || []).find(e => e.id === Number(b.dataset.ntfOpen)));
        });

    }

    static nyit(e) {
        if (!e) return;
        const a = e.adat || {};
        if (e.tipus === "kereses" && a.kereses_id && typeof SavedSearches !== "undefined") {
            fetch("/api/keresesek").then(r => r.json()).then(lista => {
                const s = (lista || []).find(x => x.id === a.kereses_id);
                if (!s) { location.hash = "#fiok/keresesek"; return; }
                fetch(`/api/keresesek/${s.id}/megnez`, { method: "POST" });
                SavedSearches.alkalmaz(s.szurok);
            }).catch(() => { location.hash = "#fiok/keresesek"; });
            return;
        }
        if (e.link) location.hash = e.link;
    }

}

// Nyelvváltáskor a levelek nyelve is kövesse
if (typeof I18n !== "undefined" && I18n.onChange) I18n.onChange(() => { Notifications.nyelvKuld(); });
