// ============================================================
//  Megtekintés-kérés (a vevő oldala) – server/services/megtekintes.js
//
//  A hirdetés oldalán egy doboz:
//   - a hivatkozási kód (IP-123): ha telefonál, ezt mondja – az ügynök a CRM
//     gyorskeresőjében azonnal látja, melyik hirdetésről van szó
//   - „Megtekintést kérek”: 1–3 időpont + üzenet → a hirdető elfogadja / mást javasol
//   - az ajánlattétel csak a hirdetővel való kapcsolat után nyílik meg
//     (elfogadott megtekintés, válasz az üzenetére, vagy a hirdető meghívta)
//  Fiókom → Megtekintések: a saját kérései (állapot, naptárba, lemondás, ajánlat),
//  és a magánhirdetőnek a beérkezett kérések (elfogad / javasol / elutasít).
// ============================================================

class Viewings {

    static api(ut, opts) { return Offers.api(ut, opts); }

    static hiba(e) {
        const kod = e && (e.kod || e.message);
        const k = kod ? "mkErr_" + kod : null;
        if (k && I18n.t(k) !== k) return I18n.t(k);
        return Offers.hiba(e);
    }

    static ido(t) {
        if (!t) return "";
        const [d, h] = String(t).split("T");
        const dt = new Date(`${d}T${h || "00:00"}`);
        return `${dt.toLocaleDateString(Utils.locale(), { weekday: "short", month: "short", day: "numeric" })} ${(h || "").slice(0, 5)}`;
    }

    static ymd(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    // Egy időpont-sor: dátum + idő (08:00–20:30, félóránként)
    static slotHtml(elotag, n, kotelezo = true) {
        const ma = new Date();
        const max = new Date(Date.now() + 59 * 86400000);
        const holnap = new Date(Date.now() + 86400000);
        const idok = [];
        for (let h = 8; h <= 20; h++) for (const m of ["00", "30"]) idok.push(`${String(h).padStart(2, "0")}:${m}`);
        return `
            <div class="mkSlotRow" data-slot="${n}">
                <span class="mkSlotNo" aria-hidden="true">${n + 1}</span>
                <input type="date" class="form-control" id="${elotag}D${n}" min="${Viewings.ymd(ma)}" max="${Viewings.ymd(max)}" ${n === 0 ? `value="${Viewings.ymd(holnap)}"` : ""} ${kotelezo && n === 0 ? "required" : ""} aria-label="${Utils.escape(I18n.f("mkSlotDate", { n: n + 1 }))}">
                <select class="form-select" id="${elotag}T${n}" aria-label="${Utils.escape(I18n.f("mkSlotTime", { n: n + 1 }))}">
                    ${idok.map(t => `<option value="${t}" ${t === (n === 0 ? "17:00" : n === 1 ? "10:00" : "12:00") ? "selected" : ""}>${t}</option>`).join("")}
                </select>
            </div>`;
    }

    static slotErtek(root, elotag, n) {
        const d = root.querySelector(`#${elotag}D${n}`);
        const t = root.querySelector(`#${elotag}T${n}`);
        if (!d || !d.value) return null;
        return `${d.value}T${t.value}`;
    }

    // ---------- A hirdetés oldalán ----------

    static box(i) {
        if (!i || i.statusz !== "aktiv" || i.eladva) return "";
        if (AuthManager.canEdit(i)) return "";
        return `<div class="card mt-3 ofBox mkBox" id="mkBox" aria-live="polite"><div class="card-body"><span class="spinner-border spinner-border-sm text-primary" role="status"></span></div></div>`;
    }

    static kot(i) {
        // „Hívom” jelzés: a belépett érdeklődő a telefonszámra koppint
        document.querySelectorAll('#lpContactCard a[href^="tel:"]').forEach(a => a.addEventListener("click", () => {
            if (!AuthManager.user) return;
            try { fetch(`/api/ingatlanok/${i.id}/hivas`, { method: "POST", keepalive: true }); } catch (e) { /* nem baj */ }
        }));
        const el = document.getElementById("mkBox");
        if (!el) return;
        Viewings.api(`/api/megtekintes/hirdetes/${i.id}`).then(a => Viewings.rajzol(el, i, a)).catch(() => { el.remove(); });
    }

    static rajzol(el, i, a) {
        const esc = Utils.escape;
        const body = el.querySelector(".card-body");
        if (a.sajat) { el.remove(); return; }
        const kod = `
            <div class="mkCode">
                <i class="fa-solid fa-phone" aria-hidden="true"></i>
                <span>${I18n.t("mkCodeHint")}</span>
                <b class="mkCodeVal">IP-${i.id}</b>
            </div>`;

        // Nincs kinek továbbítani (más oldalról átvett hirdetés): itt nincs teendő – a forrásoldalon kell jelentkezni
        if (!a.kerheto && !a.keres) { el.remove(); return; }

        const k = a.keres && !["lemondva", "elutasitva"].includes(a.keres.statusz) ? a.keres : null;
        let allapot = "";
        if (k && k.statusz === "uj") {
            allapot = `
                <div class="mkState">
                    <i class="fa-regular fa-hourglass-half" aria-hidden="true"></i>
                    <div><b>${I18n.t("mkStateSent")}</b><div class="small text-body-secondary">${(k.idopontok || []).map(t => esc(Viewings.ido(t))).join(" · ")}</div></div>
                </div>
                <button type="button" class="btn btn-link btn-sm p-0" data-mklemond="${k.id}">${I18n.t("mkCancel")}</button>`;
        } else if (k && k.statusz === "javasolt") {
            allapot = `
                <div class="mkState warn">
                    <i class="fa-regular fa-clock" aria-hidden="true"></i>
                    <div><b>${I18n.f("mkStateProposed", { ido: esc(Viewings.ido(k.javasolt)) })}</b>${k.valasz ? `<div class="small">${esc(k.valasz)}</div>` : ""}</div>
                </div>
                <div class="d-flex gap-2 mt-2">
                    <button type="button" class="btn btn-sm btn-success" data-mkjav="1">${I18n.t("mkAcceptProposal")}</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-mkjav="0">${I18n.t("mkDeclineProposal")}</button>
                </div>`;
        } else if (k && k.statusz === "elfogadva") {
            allapot = `
                <div class="mkState ok">
                    <i class="fa-regular fa-calendar-check" aria-hidden="true"></i>
                    <div><b>${I18n.f("mkStateAccepted", { ido: esc(Viewings.ido(k.valasztott)) })}</b>${k.valasz ? `<div class="small">${esc(k.valasz)}</div>` : ""}</div>
                </div>
                <div class="d-flex flex-wrap gap-3 mt-1">
                    <a class="btn btn-link btn-sm p-0" href="/api/megtekintes/${k.id}/ics" download><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${I18n.t("mkAddCal")}</a>
                    <button type="button" class="btn btn-link btn-sm p-0 text-danger" data-mklemond="${k.id}">${I18n.t("mkCancel")}</button>
                </div>`;
        }

        body.innerHTML = `
            ${kod}
            ${allapot || `
                <button type="button" class="btn btn-primary w-100 mt-2" id="mkKer"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${I18n.t("mkRequest")}</button>
                <p class="small text-body-secondary mt-2 mb-0">${I18n.t(a.irodai ? "mkRequestHintAgency" : "mkRequestHintPrivate")}</p>`}
            <hr class="my-3">
            ${a.ajanlat ? `
                <button type="button" class="btn btn-outline-primary w-100" id="ofListingBtn"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("ofMake")}</button>
                <p class="small text-body-secondary mt-2 mb-0">${I18n.t(a.irodai ? "ofListingHintAgency" : "ofListingHintPrivate")}</p>`
            : `
                <div class="mkLocked">
                    <i class="fa-solid fa-lock" aria-hidden="true"></i>
                    <div class="small"><b>${I18n.t("ofMake")}</b><div class="text-body-secondary">${I18n.t("mkOfferLocked")}</div></div>
                </div>`}`;

        const $ = q => body.querySelector(q);
        const ujra = () => Viewings.kot(i);
        if ($("#mkKer")) $("#mkKer").onclick = () => AuthManager.kell().then(() => {
            if (AuthManager.owns(i) || AuthManager.irodaTag(i.iroda_id)) return;
            Viewings.urlap({ ingatlan_id: i.id, cim: i.cim || Types.label(i.tipus), cimzett: i.iroda ? i.iroda.nev : (i.hirdeto_nev || I18n.t("lpSeller")) }, ujra);
        }).catch(() => { });
        body.querySelectorAll("[data-mklemond]").forEach(b => b.onclick = () => {
            if (!confirm(I18n.t("mkCancelConfirm"))) return;
            Viewings.api(`/api/megtekintes/${b.dataset.mklemond}/lemond`, { method: "POST" }).then(ujra).catch(e => alert(Viewings.hiba(e)));
        });
        body.querySelectorAll("[data-mkjav]").forEach(b => b.onclick = () => {
            Viewings.api(`/api/megtekintes/${k.id}/javaslat`, { method: "POST", body: { elfogad: b.dataset.mkjav === "1" } }).then(ujra).catch(e => alert(Viewings.hiba(e)));
        });
        const of = $("#ofListingBtn");
        if (of) of.onclick = () => AuthManager.kell().then(() => Offers.urlap({
            ingatlan_id: i.id, cim: i.cim || Types.label(i.tipus), ar: i.ar,
            cimzett: i.iroda ? i.iroda.nev : (i.hirdeto_nev || I18n.t("lpSeller"))
        }, ujra)).catch(() => { });
    }

    // ---------- A kérés űrlapja ----------
    // o: { ingatlan_id | kulso_link + iroda_id + kulso_cim + kulso_ar, cim, cimzett }
    static urlap(o, utana) {
        const { tartalom, modal } = Svc.modal("mkForm", "");
        const esc = Utils.escape;
        const me = AuthManager.user || {};
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${I18n.t("mkRequest")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("crmClose"))}"></button>
            </div>
            <form class="modal-body" id="mkFormEl" novalidate>
                <div class="ofTarget mb-3">
                    <div class="fw-semibold text-truncate">${esc(o.cim || o.kulso_link || "")}</div>
                    <div class="small text-body-secondary">${I18n.f("ofGoesTo", { kinek: esc(o.cimzett || "") })}</div>
                </div>
                <span class="form-label small d-block mb-1">${I18n.t("mkSlotsLabel")} *</span>
                <div id="mkSlots">${Viewings.slotHtml("mk", 0)}</div>
                <button type="button" class="btn btn-link btn-sm p-0 mt-1" id="mkPlus"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("mkAddSlot")}</button>
                <p class="small text-body-secondary mt-1">${I18n.t("mkSlotsHint")}</p>
                <label class="form-label small mb-1" for="mkUz">${I18n.t("ofMessage")}</label>
                <textarea class="form-control mb-3" id="mkUz" rows="2" maxlength="1500" placeholder="${esc(I18n.t("mkMessagePh"))}"></textarea>
                <div class="row g-2 mb-3">
                    <div class="col-sm-6"><label class="form-label small mb-1" for="mkNev">${I18n.t("crmName")}</label><input class="form-control" id="mkNev" maxlength="120" value="${esc(me.nev || me.felhasznalonev || "")}"></div>
                    <div class="col-sm-6"><label class="form-label small mb-1" for="mkTel">${I18n.t("crmPhone")} *</label><input class="form-control" id="mkTel" type="tel" maxlength="40" required value="${esc(me.telefon || "")}" autocomplete="tel"></div>
                </div>
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="mkHozza" required>
                    <label class="form-check-label small" for="mkHozza">${I18n.f("mkConsent", { kinek: esc(o.cimzett || "") })}</label>
                </div>
                <div class="alert alert-danger small py-2 mt-3" id="mkHiba" hidden></div>
            </form>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("crmCancel")}</button>
                <button type="submit" class="btn btn-primary" form="mkFormEl" id="mkKuld"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t("mkSend")}</button>
            </div>`;
        modal.show();
        const $ = q => tartalom.querySelector(q);
        let db = 1;
        $("#mkPlus").onclick = () => {
            if (db >= 3) return;
            $("#mkSlots").insertAdjacentHTML("beforeend", Viewings.slotHtml("mk", db, false));
            db++;
            if (db >= 3) $("#mkPlus").hidden = true;
        };
        $("#mkFormEl").onsubmit = e => {
            e.preventDefault();
            const hiba = $("#mkHiba");
            hiba.hidden = true;
            const idopontok = [0, 1, 2].map(n => Viewings.slotErtek(tartalom, "mk", n)).filter(Boolean);
            if (!idopontok.length) { hiba.textContent = I18n.t("mkErr_time_required"); hiba.hidden = false; return; }
            if (!$("#mkTel").value.trim()) { $("#mkTel").classList.add("is-invalid"); $("#mkTel").focus(); return; }
            if (!$("#mkHozza").checked) { hiba.textContent = I18n.t("ofErr_consent_required"); hiba.hidden = false; return; }
            $("#mkKuld").disabled = true;
            Viewings.api("/api/megtekintes", {
                method: "POST",
                body: { ingatlan_id: o.ingatlan_id, kulso_link: o.kulso_link, iroda_id: o.iroda_id, kulso_cim: o.kulso_cim, kulso_ar: o.kulso_ar,
                        idopontok, uzenet: $("#mkUz").value, nev: $("#mkNev").value, telefon: $("#mkTel").value, hozzajarul: true }
            }).then(() => {
                tartalom.querySelector(".modal-body").innerHTML = `
                    <div class="text-center py-4">
                        <i class="fa-regular fa-calendar-check text-success fs-1" aria-hidden="true"></i>
                        <h5 class="mt-3">${I18n.t("mkSent")}</h5>
                        <p class="small text-body-secondary">${I18n.t("mkSentHint")}</p>
                        <a class="btn btn-outline-primary btn-sm" href="#fiok/megtekintesek">${I18n.t("mkMine")}</a>
                    </div>`;
                tartalom.querySelector(".modal-footer").innerHTML = `<button type="button" class="btn btn-primary" data-bs-dismiss="modal">${I18n.t("crmClose")}</button>`;
                if (utana) utana();
            }).catch(err => { $("#mkKuld").disabled = false; hiba.textContent = Viewings.hiba(err); hiba.hidden = false; });
        };
    }

    // ---------- Fiókom → Megtekintések ----------

    static fiok(el) {
        const esc = Utils.escape;
        el.innerHTML = `<div class="text-center py-4"><span class="spinner-border text-primary" role="status"></span></div>`;
        Promise.all([Viewings.api("/api/megtekintes/sajat"), Viewings.api("/api/megtekintes/beerkezett")]).then(([sajat, be]) => {
            const cim = k => k.ingatlan_id ? `<a href="#listing/${k.ingatlan_id}">${esc(k.ingatlan_cim || "IP-" + k.ingatlan_id)}</a>`
                : `<a href="${esc(k.kulso_link || "#")}" target="_blank" rel="noopener nofollow">${esc((k.kulso_adat && k.kulso_adat.cim) || k.kulso_link || "")}</a>`;
            const sor = (k, bejovo) => `
                <article class="crmReq st-${esc(k.statusz)}">
                    <div class="d-flex flex-wrap justify-content-between gap-2">
                        <div class="min-w-0">
                            <div class="fw-semibold text-truncate">${cim(k)} <span class="badge mkSt mkSt-${esc(k.statusz)}">${I18n.t("mkSt_" + k.statusz)}</span></div>
                            <div class="small text-body-secondary">${bejovo ? `${esc(k.nev || "")}${k.telefon ? ` · <a href="tel:${esc(k.telefon)}">${esc(k.telefon)}</a>` : ""}` : esc(k.iroda_nev || k.cimzett_nev || "")} · ${Utils.ago(k.created_at)}</div>
                        </div>
                    </div>
                    ${k.uzenet && bejovo ? `<blockquote class="small mt-2 mb-0">${esc(k.uzenet)}</blockquote>` : ""}
                    ${k.statusz === "uj" && !bejovo ? `<div class="small mt-2">${I18n.t("mkYourSlots")}: ${(k.idopontok || []).map(t => esc(Viewings.ido(t))).join(" · ")}</div>` : ""}
                    ${k.statusz === "uj" && bejovo ? `
                        <div class="small fw-semibold mt-2 mb-1">${I18n.t("mkPickSlot")}</div>
                        <div class="mkSlots">${(k.idopontok || []).map(t => `<button type="button" class="mkSlot" data-mkel="${k.id}" data-ido="${esc(t)}"><span><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${esc(Viewings.ido(t))}</span></button>`).join("")}</div>` : ""}
                    ${k.statusz === "javasolt" ? `<div class="small mt-2">${I18n.f(bejovo ? "mkProposedWait" : "mkStateProposed", { ido: esc(Viewings.ido(k.javasolt)) })}</div>` : ""}
                    ${k.statusz === "elfogadva" ? `<div class="small mt-2 text-success"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${esc(Viewings.ido(k.valasztott))}</div>` : ""}
                    ${k.valasz ? `<div class="small text-body-secondary mt-1"><b>${I18n.t("ofReply")}:</b> ${esc(k.valasz)}</div>` : ""}
                    <div class="d-flex flex-wrap gap-2 mt-2">
                        ${!bejovo && k.statusz === "javasolt" ? `<button type="button" class="btn btn-sm btn-success" data-mkjav="${k.id}" data-v="1">${I18n.t("mkAcceptProposal")}</button><button type="button" class="btn btn-sm btn-outline-secondary" data-mkjav="${k.id}" data-v="0">${I18n.t("mkDeclineProposal")}</button>` : ""}
                        ${k.statusz === "elfogadva" ? `<a class="btn btn-sm btn-outline-primary" href="/api/megtekintes/${k.id}/ics" download><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${I18n.t("mkAddCal")}</a>` : ""}
                        ${!bejovo && k.ajanlat ? `<button type="button" class="btn btn-sm btn-primary" data-mkof="${k.id}"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("ofMake")}</button>` : ""}
                        ${!bejovo && ["uj", "javasolt", "elfogadva"].includes(k.statusz) ? `<button type="button" class="btn btn-sm btn-link text-danger" data-mklemond="${k.id}">${I18n.t("mkCancel")}</button>` : ""}
                        ${bejovo && ["uj", "javasolt"].includes(k.statusz) ? `<button type="button" class="btn btn-sm btn-outline-primary" data-mkjavasol="${k.id}">${I18n.t("mkPropose")}</button><button type="button" class="btn btn-sm btn-outline-secondary" data-mkelut="${k.id}">${I18n.t("ofReject")}</button>` : ""}
                    </div>
                </article>`;
            el.innerHTML = `
                ${be.length ? `<h5 class="mt-2">${I18n.t("mkIncoming")}</h5>${be.map(k => sor(k, true)).join("")}<h5 class="mt-4">${I18n.t("mkMine")}</h5>` : ""}
                ${sajat.length ? sajat.map(k => sor(k, false)).join("") : `<div class="emptyState"><i class="fa-regular fa-calendar"></i><h5>${I18n.t("mkMineNone")}</h5><p>${I18n.t("mkMineNoneHint")}</p></div>`}`;
            const ujra = () => Viewings.fiok(el);
            const k = id => sajat.concat(be).find(x => String(x.id) === String(id));
            el.querySelectorAll("[data-mklemond]").forEach(b => b.onclick = () => {
                if (!confirm(I18n.t("mkCancelConfirm"))) return;
                Viewings.api(`/api/megtekintes/${b.dataset.mklemond}/lemond`, { method: "POST" }).then(ujra).catch(e => alert(Viewings.hiba(e)));
            });
            el.querySelectorAll("[data-mkjav]").forEach(b => b.onclick = () => Viewings.api(`/api/megtekintes/${b.dataset.mkjav}/javaslat`, { method: "POST", body: { elfogad: b.dataset.v === "1" } }).then(ujra).catch(e => alert(Viewings.hiba(e))));
            el.querySelectorAll("[data-mkel]").forEach(b => b.onclick = () => {
                const kk = k(b.dataset.mkel);
                if (!confirm(I18n.f("mkAcceptConfirm", { ido: Viewings.ido(b.dataset.ido), nev: kk.nev || "" }))) return;
                Viewings.api(`/api/megtekintes/${kk.id}/valasz`, { method: "POST", body: { mit: "elfogad", idopont: b.dataset.ido } }).then(ujra).catch(e => alert(Viewings.hiba(e)));
            });
            el.querySelectorAll("[data-mkelut]").forEach(b => b.onclick = () => {
                const v = prompt(I18n.t("mkRejectMsg"));
                if (v === null) return;
                Viewings.api(`/api/megtekintes/${b.dataset.mkelut}/valasz`, { method: "POST", body: { mit: "elutasit", valasz: v } }).then(ujra).catch(e => alert(Viewings.hiba(e)));
            });
            el.querySelectorAll("[data-mkjavasol]").forEach(b => b.onclick = () => Viewings.javasol(k(b.dataset.mkjavasol), ujra));
            el.querySelectorAll("[data-mkof]").forEach(b => b.onclick = () => {
                const kk = k(b.dataset.mkof);
                Offers.urlap(kk.ingatlan_id && !kk.kulso_link
                    ? { ingatlan_id: kk.ingatlan_id, cim: kk.ingatlan_cim, ar: kk.ingatlan_ar, cimzett: kk.iroda_nev || kk.cimzett_nev || "" }
                    : { keres_id: kk.id, cim: (kk.kulso_adat && kk.kulso_adat.cim) || kk.kulso_link, ar: kk.kulso_adat && kk.kulso_adat.ar, cimzett: kk.iroda_nev || "" }, ujra);
            });
        }).catch(e => { el.innerHTML = `<div class="alert alert-danger">${Viewings.hiba(e)}</div>`; });
    }

    // A magánhirdető másik időpontot javasol
    static javasol(k, utana) {
        const { tartalom, modal } = Svc.modal("mkJav", "");
        const esc = Utils.escape;
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title">${I18n.t("mkPropose")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("crmClose"))}"></button>
            </div>
            <form class="modal-body" id="mkJavF">
                <p class="small text-body-secondary">${I18n.f("mkProposeHelp", { nev: esc(k.nev || "") })}</p>
                ${Viewings.slotHtml("mkj", 0)}
                <label class="form-label small mb-1 mt-3" for="mkjMsg">${I18n.t("ofReplyMsg")}</label>
                <textarea class="form-control" id="mkjMsg" rows="2" maxlength="1000"></textarea>
            </form>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("crmCancel")}</button>
                <button type="submit" class="btn btn-primary" form="mkJavF">${I18n.t("mkProposeSend")}</button>
            </div>`;
        modal.show();
        tartalom.querySelector("#mkJavF").onsubmit = e => {
            e.preventDefault();
            const ido = Viewings.slotErtek(tartalom, "mkj", 0);
            if (!ido) return;
            Viewings.api(`/api/megtekintes/${k.id}/valasz`, { method: "POST", body: { mit: "javasol", idopont: ido, valasz: tartalom.querySelector("#mkjMsg").value } })
                .then(() => { modal.hide(); utana(); }).catch(err => alert(Viewings.hiba(err)));
        };
    }

}
