// ============================================================
//  Csomagok és árak (#csomagok)
//
//  Két nézet: Magánszemélyeknek / Ingatlanirodáknak. Az árlistát az
//  admin kezeli (Admin → Pénzügyek → Díjcsomagok, árak): kinek szól,
//  ár, időszak, előnyök, „legnépszerűbb”. A megrendelés díjbekérőt
//  készít; a befizetés után a csomag aktív (Fiókom → Csomagom és számláim).
//
//  Svc: közös segédek a szolgáltatás-oldalakhoz (nyelv, pénz, dátum, API)
// ============================================================

class Svc {

    // Egy mező a felület nyelvén (nev → nev_ro / nev_en; vagy {hu, ro, en})
    static t(obj, mezo) {
        if (!obj) return "";
        const ny = I18n.current;
        if (mezo === undefined) return obj[ny] || obj.hu || obj.en || "";
        if (ny === "ro" && obj[mezo + "_ro"]) return obj[mezo + "_ro"];
        if (ny === "en" && obj[mezo + "_en"]) return obj[mezo + "_en"];
        return obj[mezo] || "";
    }

    // Csomagnév az időszak nélkül ("Iroda – pro (havi)" → "Iroda – pro")
    static rovidNev(c) {
        return Svc.t(c, "nev").replace(/\s*\([^)]*\)\s*$/, "");
    }

    static penz(v, penznem) {
        if (v === null || v === undefined || isNaN(v)) return "–";
        const n = Number(v);
        return `${Utils.num(n, Math.round(n) === n ? 0 : 2)} ${penznem || "RON"}`;
    }

    static nap(d) {
        if (!d) return "–";
        const x = String(d).length > 10 ? new Date(d) : new Date(String(d).slice(0, 10) + "T12:00:00");
        return isNaN(x) ? "–" : x.toLocaleDateString(Utils.locale(), { year: "numeric", month: "short", day: "numeric" });
    }

    static ido(d) {
        if (!d) return "–";
        const x = new Date(d);
        // Romániai idő (a megtekintések időpontjai is ebben vannak) – külföldről nézve is ugyanaz
        try {
            return isNaN(x) ? "–" : x.toLocaleString(Utils.locale(), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" });
        } catch (e) {
            return isNaN(x) ? "–" : x.toLocaleString(Utils.locale(), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        }
    }

    // ---------- Online fizetés (bankkártya – Stripe) ----------
    // A díjbekérő kifizetése: a szerver elindítja a fizetést, és a Stripe
    // biztonságos oldalára visz (a kártyaadat nem hozzánk kerül).
    static kartyaGomb(szamlaId, osztaly = "btn-success") {
        return `<button type="button" class="btn ${osztaly} payCardBtn" data-kartya="${Number(szamlaId)}"><i class="fa-solid fa-credit-card" aria-hidden="true"></i> ${I18n.t("payByCard")}</button>`;
    }

    static kartyaFizet(szamlaId, gomb) {
        if (gomb) {
            gomb.disabled = true;
            gomb.dataset.eredeti = gomb.innerHTML;
            gomb.innerHTML = `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> ${I18n.t("payRedirecting")}`;
        }
        return Svc.api(`/api/fizetes/szamla/${Number(szamlaId)}`, { method: "POST", body: { nyelv: I18n.current } })
            .then(v => { if (v.url) window.location.href = v.url; })
            .catch(e => {
                if (gomb) { gomb.disabled = false; gomb.innerHTML = gomb.dataset.eredeti; }
                alert(Svc.hiba(e, "payErr_"));
            });
    }

    // Fizetés Revolut-linkkel (revolut.me): kártyával, Apple / Google Pay-jel vagy
    // Revolut-utalással – a pénz a beállított Revolut-számlára érkezik. Nincs
    // automatikus visszajelzés: a beérkezés után az admin jelöli kifizetettnek
    // (akkor a csomag / kiemelés él, és elkészül a számla).
    static revolutDoboz(f, sorszam, osszeg, penznem, kompakt) {
        if (!f || !f.revolut) return "";
        const esc = Utils.escape;
        return `
            <div class="payRevBox ${kompakt ? "compact" : ""}">
                <div class="d-flex align-items-center gap-3 flex-wrap">
                    <div class="flex-grow-1">
                        <b>${I18n.t("payRevTitle")}</b>
                        <div class="small text-body-secondary">${I18n.f("payRevHint", { osszeg: esc(Svc.penz(osszeg, penznem)), sz: esc(sorszam) })}</div>
                    </div>
                    <div class="d-flex gap-2 flex-wrap">
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-masol="${esc(sorszam)}" title="${esc(I18n.t("payRevCopy"))}"><i class="fa-regular fa-copy"></i> ${esc(sorszam)}</button>
                        <a class="btn btn-dark ${kompakt ? "btn-sm" : ""}" href="${esc(f.revolut)}" target="_blank" rel="noopener"><i class="fa-solid fa-credit-card" aria-hidden="true"></i> ${I18n.t("payRevBtn")}</a>
                    </div>
                </div>
            </div>`;
    }

    static kartyaKot(el) {
        el.querySelectorAll("[data-masol]").forEach(b => {
            b.onclick = () => navigator.clipboard && navigator.clipboard.writeText(b.dataset.masol).then(() => Utils.toast && Utils.toast(I18n.t("prCopied")));
        });
        el.querySelectorAll("[data-kartya]").forEach(b => { b.onclick = () => Svc.kartyaFizet(b.dataset.kartya, b); });
    }

    static api(ut, opts = {}) {
        const o = { cache: "no-store", ...opts };
        if (o.body && typeof o.body !== "string") {
            o.headers = { "Content-Type": "application/json", ...(o.headers || {}) };
            o.body = JSON.stringify(o.body);
        }
        return fetch(ut, o).then(r => r.json().catch(() => ({})).then(v => {
            if (!r.ok) {
                const e = new Error(v.error || ("HTTP " + r.status));
                e.kod = v.error;
                e.adat = v;
                e.status = r.status;
                throw e;
            }
            return v;
        }));
    }

    static hiba(e, elotag = "svcErr_") {
        const k = e && e.kod ? elotag + e.kod : null;
        if (k && I18n.t(k) !== k) return I18n.t(k);
        if (e && e.status === 401) return I18n.t("svcErr_login_required");
        return I18n.t("alertSaveError");
    }

    static modal(azon, meret = "modal-lg") {
        let el = document.getElementById(azon);
        if (!el) {
            el = document.createElement("div");
            el.id = azon;
            el.className = "modal fade";
            el.tabIndex = -1;
            el.setAttribute("aria-hidden", "true");
            document.body.appendChild(el);
        }
        el.innerHTML = `<div class="modal-dialog ${meret} modal-dialog-scrollable modal-fullscreen-md-down"><div class="modal-content"></div></div>`;
        const modal = bootstrap.Modal.getOrCreateInstance(el);
        // Egy linkre kattintva (pl. #fiok/csomag) az ablak bezárul
        if (!el.dataset.hashZar) {
            el.dataset.hashZar = "1";
            window.addEventListener("hashchange", () => { if (el.classList.contains("show")) modal.hide(); });
        }
        return { el, tartalom: el.querySelector(".modal-content"), modal };
    }

    static idoszak(k) {
        return I18n.t("svcPer_" + (k || "havi"));
    }

}

class PricingPage {

    static adat = null;
    static nezet = "maganszemely";
    static sajat = null;

    static show(param) {

        if (param === "iroda" || param === "maganszemely") PricingPage.nezet = param;
        else if (AuthManager.loggedIn() && (AuthManager.irodak || []).length && !PricingPage._valasztott) PricingPage.nezet = "iroda";

        const box = document.getElementById("csomagokContent");
        if (!PricingPage.adat) box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        const kerdes = [Svc.api("/api/csomagok")];
        if (AuthManager.loggedIn()) kerdes.push(Svc.api("/api/sajat-csomag/attekintes").catch(() => null));

        Promise.all(kerdes).then(([adat, sajat]) => {
            PricingPage.adat = adat;
            PricingPage.sajat = sajat || null;
            PricingPage.render();
        }).catch(() => {
            box.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
        });

        if (!PricingPage._i18n) {
            PricingPage._i18n = true;
            I18n.onChange(() => { if (PageManager.current === "csomagok" && PricingPage.adat) PricingPage.render(); });
        }

    }

    // Fő csomag-e (hirdetésszám / irodaprofil), vagy kiegészítő
    static fo(c) {
        const j = c.jogosultsag || {};
        return c.kategoria === "iroda_elofizetes" || j.korlatlan_hirdetes || j.hirdetes_limit !== undefined || j.hirdetes_plusz;
    }

    static elonyok(c) {
        return String(Svc.t(c, "elonyok") || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    }

    static render() {

        const box = document.getElementById("csomagokContent");
        const d = PricingPage.adat;
        const esc = Utils.escape;
        const nezet = PricingPage.nezet;

        const sajat = d.csomagok.filter(c => c.celcsoport === nezet);
        const mindenki = d.csomagok.filter(c => c.celcsoport === "mindenki");
        const fok = [...sajat.filter(PricingPage.fo), ...mindenki.filter(PricingPage.fo)];
        const kieg = [...sajat.filter(c => !PricingPage.fo(c)), ...mindenki.filter(c => !PricingPage.fo(c))];

        const ingyenesDb = nezet === "iroda" ? d.ingyenes.iroda : d.ingyenes.maganszemely;

        const aktivKodok = new Set(((PricingPage.sajat && PricingPage.sajat.elofizetesek) || [])
            .filter(e => e.statusz === "aktiv" && (!e.vege || e.vege >= new Date().toISOString().slice(0, 10)))
            .map(e => e.csomag_id));
        const fuggoKodok = new Set(((PricingPage.sajat && PricingPage.sajat.rendelesek) || [])
            .filter(r => r.statusz === "fizetesre_var").map(r => r.csomag_nev));

        const kartya = c => {
            const el = PricingPage.elonyok(c);
            const aktiv = aktivKodok.has(c.id);
            const fugg = fuggoKodok.has(c.nev);
            return `
                <article class="prCard ${c.kiemelt ? "featured" : ""}">
                    ${c.kiemelt ? `<span class="prRibbon">${I18n.t("prPopular")}</span>` : ""}
                    <h3 class="prName">${esc(PricingPage.rovid(c))}</h3>
                    <p class="prDesc">${esc(Svc.t(c, "leiras"))}</p>
                    <div class="prPrice">
                        <b>${esc(Utils.num(c.ar, Math.round(c.ar) === c.ar ? 0 : 2))}</b> <span>${esc(c.penznem)}</span>
                        <small>${c.idoszak === "egyszeri" ? I18n.t("prOneOff") : "/ " + esc(Svc.idoszak(c.idoszak))}</small>
                    </div>
                    ${d.afa_fizeto ? `<div class="prVat">${I18n.f("prPlusVat", { p: d.afa_kulcs })}</div>` : ""}
                    <ul class="prList">${el.map(x => `<li><i class="fa-solid fa-check" aria-hidden="true"></i> ${esc(x)}</li>`).join("")}</ul>
                    ${aktiv
                        ? `<button type="button" class="btn btn-outline-success w-100 mt-auto" disabled><i class="fa-solid fa-circle-check"></i> ${I18n.t("prActiveNow")}</button>`
                        : fugg
                            ? `<a class="btn btn-outline-warning w-100 mt-auto" href="#fiok/csomag"><i class="fa-solid fa-hourglass-half"></i> ${I18n.t("prPendingNow")}</a>`
                            : `<button type="button" class="btn ${c.kiemelt ? "btn-primary" : "btn-outline-primary"} w-100 mt-auto" data-rendel="${c.id}">${I18n.t("prOrder")}</button>`}
                </article>`;
        };

        const s = PricingPage.sajat;
        const sajatSav = s ? `
            <div class="prMine">
                <i class="fa-solid fa-receipt" aria-hidden="true"></i>
                <div class="flex-fill">
                    <b>${I18n.t("prYourPlan")}</b>
                    <span>${s.jog && s.jog.csomagok ? I18n.f("prYourPlanN", { n: s.jog.csomagok }) : I18n.t("prYourPlanFree")}
                    · ${s.hasznalat.limit === null ? I18n.f("prUsageUnlimited", { db: s.hasznalat.db }) : I18n.f("prUsage", { db: s.hasznalat.db, limit: s.hasznalat.limit })}</span>
                </div>
                <a class="btn btn-sm btn-outline-primary" href="#fiok/csomag">${I18n.t("accTabBilling")} <i class="fa-solid fa-arrow-right"></i></a>
            </div>` : "";

        box.innerHTML = `
            <div class="prHero">
                <div>
                    <span class="prEyebrow"><i class="fa-solid fa-tags" aria-hidden="true"></i> ${I18n.t("menuCsomagok")}</span>
                    <h1>${I18n.t("prTitle")}</h1>
                    <p>${I18n.t("prLead")}</p>
                </div>
                <div class="prSwitch" role="tablist" aria-label="${esc(I18n.t("menuCsomagok"))}">
                    <button type="button" role="tab" class="${nezet === "maganszemely" ? "active" : ""}" aria-selected="${nezet === "maganszemely"}" data-nezet="maganszemely"><i class="fa-solid fa-user" aria-hidden="true"></i> ${I18n.t("prForPrivate")}</button>
                    <button type="button" role="tab" class="${nezet === "iroda" ? "active" : ""}" aria-selected="${nezet === "iroda"}" data-nezet="iroda"><i class="fa-solid fa-briefcase" aria-hidden="true"></i> ${I18n.t("prForAgency")}</button>
                </div>
            </div>

            ${sajatSav}

            <div class="prGrid">
                <article class="prCard free">
                    <h3 class="prName">${I18n.t("prFree")}</h3>
                    <p class="prDesc">${I18n.t(nezet === "iroda" ? "prFreeDescAgency" : "prFreeDesc")}</p>
                    <div class="prPrice"><b>0</b> <span>RON</span></div>
                    <ul class="prList">
                        <li><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.f("prFreeListings", { n: ingyenesDb })}</li>
                        <li><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("prFreeSearch")}</li>
                        <li><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("prFreeValuation")}</li>
                        <li><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("prFreeMessages")}</li>
                        ${nezet === "iroda" ? `<li><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("prFreeAgencyProfile")}</li>` : ""}
                    </ul>
                    <a class="btn btn-outline-secondary w-100 mt-auto" href="${nezet === "iroda" ? "#iroda" : "#new"}">${I18n.t(nezet === "iroda" ? "prFreeCtaAgency" : "prFreeCta")}</a>
                </article>
                ${fok.map(kartya).join("")}
            </div>

            ${!d.ingyenes.korlatok_be ? `<p class="prNote"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t("prLimitsOff")}</p>` : ""}

            ${kieg.length ? `
                <h2 class="prSub">${I18n.t("prExtras")}</h2>
                <div class="prGrid extras">${kieg.map(kartya).join("")}</div>` : ""}

            <a class="prPromo" href="#eladjuk">
                <span class="prPromoIcon"><i class="fa-solid fa-key" aria-hidden="true"></i></span>
                <span class="flex-fill">
                    <b>${I18n.t("prPromoTitle")}</b>
                    <span>${I18n.t("prPromoText")}</span>
                </span>
                <span class="btn btn-light">${I18n.t("navFeatureMore")} <i class="fa-solid fa-arrow-right"></i></span>
            </a>

            <h2 class="prSub">${I18n.t("prHowTitle")}</h2>
            <ol class="prSteps">
                <li><span>1</span><div><b>${I18n.t("prHow1")}</b><p>${I18n.t("prHow1d")}</p></div></li>
                <li><span>2</span><div><b>${I18n.t("prHow2")}</b><p>${I18n.f("prHow2d", { n: d.fizetesi_hatarido || 14 })}</p></div></li>
                <li><span>3</span><div><b>${I18n.t("prHow3")}</b><p>${I18n.t("prHow3d")}</p></div></li>
            </ol>`;

        box.querySelectorAll("[data-nezet]").forEach(b => {
            b.onclick = () => {
                PricingPage.nezet = b.dataset.nezet;
                PricingPage._valasztott = true;
                history.replaceState(null, "", "#csomagok/" + PricingPage.nezet);
                PricingPage.render();
            };
        });

        box.querySelectorAll("[data-rendel]").forEach(b => {
            b.onclick = () => {
                const c = d.csomagok.find(x => x.id === Number(b.dataset.rendel));
                const nyit = () => PricingPage.rendeles(c);
                if (!AuthManager.loggedIn()) AuthManager.kell().then(nyit).catch(() => { });
                else nyit();
            };
        });

    }

    static rovid(c) {
        return Svc.rovidNev(c);
    }

    // ===================== Megrendelés =====================

    static rendeles(c, opts = {}) {

        const esc = Utils.escape;
        const { tartalom, modal } = Svc.modal("prOrderModal", "modal-lg");

        tartalom.innerHTML = `<div class="modal-body"><div class="emptyState"><div class="spinner-border text-primary"></div></div></div>`;
        modal.show();

        Promise.all([
            Svc.api("/api/sajat-csomag/attekintes"),
            c.kategoria === "kiemeles" ? Svc.api("/api/sajat-hirdetesek").catch(() => []) : Promise.resolve([])
        ]).then(([s, hirdetesek]) => {

            PricingPage.sajat = s;
            const irodak = s.vezetettIrodak || [];
            const irodaKell = c.celcsoport === "iroda";
            const irodaLehet = c.celcsoport !== "maganszemely" && irodak.length;
            const sz = s.szamlazas || {};
            const lista = Array.isArray(hirdetesek) ? hirdetesek : (hirdetesek.hirdetesek || hirdetesek.lista || []);

            if (irodaKell && !irodak.length) {
                tartalom.innerHTML = `
                    <div class="modal-header">
                        <h5 class="modal-title">${esc(PricingPage.rovid(c))}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
                    </div>
                    <div class="modal-body">
                        <div class="emptyState">
                            <i class="fa-solid fa-briefcase"></i>
                            <h5>${I18n.t("prNeedAgency")}</h5>
                            <p>${I18n.t("prNeedAgencyText")}</p>
                            <a class="btn btn-primary" href="#iroda">${I18n.t("agCreateShort")}</a>
                        </div>
                    </div>`;
                return;
            }

            tartalom.innerHTML = `
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i> ${I18n.t("prOrderTitle")}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
                </div>
                <div class="modal-body">
                    <div class="prOrderSum">
                        <div>
                            <b>${esc(PricingPage.rovid(c))}</b>
                            <div class="small text-body-secondary">${esc(Svc.t(c, "leiras"))}</div>
                        </div>
                        <div class="text-end">
                            <b class="fs-5">${esc(Svc.penz(c.ar, c.penznem))}</b>
                            <div class="small text-body-secondary">${c.idoszak === "egyszeri" ? I18n.t("prOneOff") : "/ " + esc(Svc.idoszak(c.idoszak))}</div>
                        </div>
                    </div>

                    ${irodaLehet ? `
                        <div class="mb-3">
                            <label class="form-label" for="prKinek">${I18n.t("prForWhom")}</label>
                            <select class="form-select" id="prKinek">
                                ${!irodaKell ? `<option value="">${I18n.t("prForMe")}</option>` : ""}
                                ${irodak.map(i => `<option value="${i.id}">${esc(i.nev)}${i.statusz !== "jovahagyva" ? ` (${esc(I18n.t("agPendingLabel"))})` : ""}</option>`).join("")}
                            </select>
                        </div>` : ""}

                    ${c.kategoria === "kiemeles" ? `
                        <div class="mb-3">
                            <label class="form-label" for="prHirdetes">${I18n.t("prWhichListing")}</label>
                            <select class="form-select" id="prHirdetes">
                                <option value="">${I18n.t("prListingLater")}</option>
                                ${lista.filter(h => ["aktiv", "fuggo"].includes(h.statusz)).map(h => `<option value="${h.id}"${Number(opts.ingatlanId) === h.id ? " selected" : ""}>#${h.id} · ${esc(h.cim || Types.label(h.tipus))} · ${esc(Utils.price(h))}</option>`).join("")}
                            </select>
                        </div>` : ""}

                    <h6 class="mt-3 mb-2">${I18n.t("prBilling")}</h6>
                    <div class="prTypeSel mb-3" role="radiogroup">
                        ${["maganszemely", "pfa", "ceg"].map(t => `
                            <label class="prTypeOpt">
                                <input type="radio" name="prTipus" value="${t}" ${(sz.tipus || "maganszemely") === t ? "checked" : ""}>
                                <span><i class="fa-solid ${t === "ceg" ? "fa-building" : t === "pfa" ? "fa-user-tie" : "fa-user"}" aria-hidden="true"></i> ${I18n.t("finCustType_" + t)}</span>
                            </label>`).join("")}
                    </div>
                    <div class="row g-2">
                        <div class="col-12 prCegMezo">
                            <label class="form-label small mb-1" for="prCui">${I18n.t("prCui")} *</label>
                            <div class="input-group">
                                <input class="form-control" id="prCui" maxlength="20" value="${esc(sz.cui || "")}" inputmode="numeric" placeholder="RO12345678">
                                <button class="btn btn-outline-secondary" type="button" id="prAnaf"><i class="fa-solid fa-magnifying-glass"></i> ANAF</button>
                            </div>
                            <div id="prAnafInfo" class="small mt-1"></div>
                        </div>
                        <div class="col-md-8">
                            <label class="form-label small mb-1" for="prNev">${I18n.t("prBillName")} *</label>
                            <input class="form-control" id="prNev" maxlength="200" value="${esc(sz.nev || "")}" autocomplete="name">
                        </div>
                        <div class="col-md-4 prCegMezo">
                            <label class="form-label small mb-1" for="prRegCom">${I18n.t("prRegCom")}</label>
                            <input class="form-control" id="prRegCom" maxlength="40" value="${esc(sz.reg_com || "")}" placeholder="J14/123/2020">
                        </div>
                        <div class="col-12">
                            <label class="form-label small mb-1" for="prCim">${I18n.t("prBillAddress")} *</label>
                            <input class="form-control" id="prCim" maxlength="400" value="${esc(sz.cim || "")}" autocomplete="street-address">
                        </div>
                        <div class="col-md-7">
                            <label class="form-label small mb-1" for="prEmail">${I18n.t("authEmail")} *</label>
                            <input class="form-control" id="prEmail" type="email" maxlength="160" value="${esc(sz.email || (AuthManager.user && AuthManager.user.email) || "")}" autocomplete="email">
                        </div>
                        <div class="col-md-5">
                            <label class="form-label small mb-1" for="prTel">${I18n.t("accPhone")}</label>
                            <input class="form-control" id="prTel" type="tel" maxlength="40" value="${esc(sz.telefon || (AuthManager.user && AuthManager.user.telefon) || "")}" autocomplete="tel">
                        </div>
                        <div class="col-12">
                            <label class="form-label small mb-1" for="prMegj">${I18n.t("prNote")}</label>
                            <textarea class="form-control" id="prMegj" rows="2" maxlength="600"></textarea>
                        </div>
                    </div>

                    <div class="form-check mt-3">
                        <input class="form-check-input" type="checkbox" id="prElfogad">
                        <label class="form-check-label small" for="prElfogad">${I18n.t("prAccept")} <a href="#jogi/aszf" target="_blank">${I18n.t("prTerms")}</a></label>
                    </div>
                    <p class="small text-body-secondary mt-2 mb-0"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t("prPayInfo")}</p>
                    <div class="alert alert-danger small py-2 mt-3 mb-0" id="prHiba" hidden></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
                    <button type="button" class="btn btn-primary" id="prKuld"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("prOrderSubmit")}</button>
                </div>`;

            const $ = q => tartalom.querySelector(q);

            const tipusValt = () => {
                const t = (tartalom.querySelector("input[name=prTipus]:checked") || {}).value || "maganszemely";
                tartalom.querySelectorAll(".prCegMezo").forEach(el => { el.hidden = t === "maganszemely"; });
            };
            tartalom.querySelectorAll("input[name=prTipus]").forEach(r => { r.onchange = tipusValt; });
            tipusValt();

            // Iroda kiválasztásakor az iroda adatai
            const kinek = $("#prKinek");
            const irodaTolt = () => {
                const i = irodak.find(x => x.id === Number(kinek.value));
                if (!i) return;
                const ceg = tartalom.querySelector("input[name=prTipus][value=ceg]");
                if (ceg) ceg.checked = true;
                $("#prNev").value = i.hivatalos_nev || i.nev || "";
                $("#prCui").value = i.cui || "";
                $("#prRegCom").value = i.reg_com || "";
                $("#prCim").value = i.cim || "";
                if (i.email) $("#prEmail").value = i.email;
                if (i.telefon) $("#prTel").value = i.telefon;
                tipusValt();
            };
            if (kinek) {
                kinek.onchange = irodaTolt;
                if (irodaKell || PricingPage.nezet === "iroda") { if (!kinek.value && irodak[0]) kinek.value = irodak[0].id; irodaTolt(); }
            }

            $("#prAnaf").onclick = () => {
                const info = $("#prAnafInfo");
                info.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
                AgencyAnaf.lekerdez($("#prCui").value).then(v => {
                    info.innerHTML = AgencyAnaf.html(v);
                    const a = v && v.adat;
                    if (a) {
                        if (a.nev) $("#prNev").value = a.nev;
                        if (a.cim) $("#prCim").value = a.cim;
                        if (a.regCom || a.reg_com) $("#prRegCom").value = a.regCom || a.reg_com;
                    }
                }).catch(e => { info.innerHTML = `<span class="text-danger">${esc(AgencyAnaf.hibaSzoveg(e))}</span>`; });
            };

            $("#prKuld").onclick = () => {
                const hibaEl = $("#prHiba");
                hibaEl.hidden = true;
                if (!$("#prElfogad").checked) {
                    hibaEl.textContent = I18n.t("svcErr_must_accept");
                    hibaEl.hidden = false;
                    return;
                }
                const body = {
                    csomag_id: c.id,
                    iroda_id: kinek ? Number(kinek.value) || null : null,
                    ingatlan_id: $("#prHirdetes") ? Number($("#prHirdetes").value) || null : null,
                    megjegyzes: $("#prMegj").value,
                    elfogad: true,
                    szamlazas: {
                        tipus: (tartalom.querySelector("input[name=prTipus]:checked") || {}).value || "maganszemely",
                        nev: $("#prNev").value, cui: $("#prCui").value, reg_com: $("#prRegCom").value,
                        cim: $("#prCim").value, email: $("#prEmail").value, telefon: $("#prTel").value
                    }
                };
                $("#prKuld").disabled = true;
                Svc.api("/api/csomagok/rendeles", { method: "POST", body })
                    .then(v => PricingPage.siker(tartalom, c, v))
                    .catch(e => {
                        $("#prKuld").disabled = false;
                        hibaEl.innerHTML = e.kod === "already_pending"
                            ? `${I18n.t("svcErr_already_pending")} <a href="#fiok/csomag">${I18n.t("accTabBilling")}</a>`
                            : Utils.escape(Svc.hiba(e));
                        hibaEl.hidden = false;
                    });
            };

        }).catch(() => {
            tartalom.innerHTML = `<div class="modal-body"><div class="alert alert-danger">${I18n.t("alertLoadError")}</div></div>`;
        });

    }

    static siker(tartalom, c, v) {

        const esc = Utils.escape;
        const s = v.szamla;
        const f = v.fizetes || {};
        const ingyen = Number(s.brutto) === 0;

        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title"><i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i> ${I18n.t("prThanks")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="OK"></button>
            </div>
            <div class="modal-body">
                <p>${ingyen ? I18n.t("prThanksFree") : I18n.f(f.online || f.revolut ? "prThanksTextCard" : "prThanksText", { nev: esc(PricingPage.rovid(c)) })}</p>
                ${!ingyen && f.online ? `
                <div class="payCardBox">
                    <div class="d-flex align-items-center gap-3 flex-wrap">
                        <div class="flex-grow-1">
                            <b>${I18n.t("payCardTitle")}</b>
                            <div class="small text-body-secondary">${I18n.t("payCardHint")}</div>
                        </div>
                        ${Svc.kartyaGomb(s.id, "btn-success btn-lg")}
                    </div>
                    <div class="payCardLogos" aria-hidden="true"><i class="fa-brands fa-cc-visa"></i><i class="fa-brands fa-cc-mastercard"></i><i class="fa-brands fa-apple-pay"></i><i class="fa-brands fa-google-pay"></i> <span><i class="fa-solid fa-lock"></i> ${I18n.t("paySecure")}</span></div>
                </div>
                <div class="payOr"><span>${I18n.t("payOrTransfer")}</span></div>` : ""}
                ${!ingyen && f.revolut ? Svc.revolutDoboz(f, s.sorszam, s.brutto, s.penznem) + `<div class="payOr"><span>${I18n.t("payOrTransfer")}</span></div>` : ""}
                ${ingyen ? "" : `
                <div class="prPayBox">
                    <div><span>${I18n.t("prProforma")}</span><b>${esc(s.sorszam)}</b></div>
                    <div><span>${I18n.t("prAmount")}</span><b>${esc(Svc.penz(s.brutto, s.penznem))}</b></div>
                    <div><span>${I18n.t("prDue")}</span><b>${esc(Svc.nap(s.esedekes))}</b></div>
                    <hr>
                    <div><span>${I18n.t("prBeneficiary")}</span><b>${esc(f.kedvezmenyezett || "IngatlanPro")}</b></div>
                    <div><span>IBAN</span><b class="${f.iban ? "prIban" : ""}">${esc(f.iban || I18n.t("prIbanSoon"))}</b>${f.iban ? ` <button type="button" class="btn btn-link btn-sm p-0" id="prIbanCopy"><i class="fa-regular fa-copy"></i></button>` : ""}</div>
                    ${f.bank ? `<div><span>${I18n.t("prBank")}</span><b>${esc(f.bank)}</b></div>` : ""}
                    <div><span>${I18n.t("prReference")}</span><b>${esc(s.sorszam)}</b></div>
                </div>
                <p class="small text-body-secondary mt-3 mb-0">${I18n.t("prAfterPay")}</p>`}
            </div>
            <div class="modal-footer">
                ${ingyen ? "" : `<a class="btn btn-outline-secondary" href="/api/sajat-csomag/szamlak/${s.id}/nyomtat" target="_blank" rel="noopener"><i class="fa-solid fa-file-invoice"></i> ${I18n.t("prOpenProforma")}</a>`}
                <a class="btn btn-primary" href="#fiok/csomag">${I18n.t("accTabBilling")}</a>
            </div>`;

        Svc.kartyaKot(tartalom);

        const copy = tartalom.querySelector("#prIbanCopy");
        if (copy) copy.onclick = () => {
            navigator.clipboard && navigator.clipboard.writeText(f.iban).then(() => Utils.toast && Utils.toast(I18n.t("prCopied")));
        };

        // Az árlista frissítése (a gomb „fizetésre vár” lesz)
        if (PageManager.current === "csomagok") PricingPage.show();

    }

}
