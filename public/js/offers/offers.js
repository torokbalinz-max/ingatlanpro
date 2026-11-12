// ============================================================
//  Vételi ajánlatok – a vevő oldala
//
//   - a hirdetés oldalán „Ajánlatot teszek” (js/offers/viewings.js doboza): irodai
//     hirdetésnél az irodának, magánhirdetésnél a tulajdonosnak – csak ha a vevő már
//     kapcsolatban van a hirdetővel (elfogadott megtekintés, válasz, meghívó)
//   - Fiókom → Ajánlatok: a saját ajánlatok állapota (visszavonás, az
//     ellenajánlat elfogadása), és – magánhirdetőnek – a beérkezett ajánlatok
//  Az ajánlat nem kötelező érvényű: az adásvétel közjegyzői szerződéssel jön létre.
//  Szerver: services/ajanlat.js, végpontok: /api/ajanlatok… (routes/crm.js)
// ============================================================

class Offers {

    static api(ut, opts = {}) {
        const o = { method: opts.method || "GET", headers: {} };
        if (opts.body !== undefined) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(opts.body); }
        return fetch(ut, o).then(async r => {
            const v = await r.json().catch(() => ({}));
            if (!r.ok) { const e = new Error(v.error || "server_error"); e.adat = v; throw e; }
            return v;
        });
    }

    static hiba(e) {
        const k = "ofErr_" + (e && e.message);
        const t = I18n.t(k);
        if (t && t !== k) return t;
        const k2 = "crmErr_" + (e && e.message);
        const t2 = I18n.t(k2);
        return t2 && t2 !== k2 ? t2 : I18n.t("crmErr_server_error");
    }

    static penz(v, p) {
        return `${Number(v || 0).toLocaleString(Utils.locale(), { maximumFractionDigits: 0 })} ${p === "RON" ? "lei" : "€"}`;
    }

    static badge(st) {
        const szin = { uj: "primary", megnezve: "secondary", elfogadva: "success", elutasitva: "dark", ellenajanlat: "warning", visszavonva: "light" }[st] || "light";
        return `<span class="badge text-bg-${szin}">${I18n.t("ofBuyerSt_" + st)}</span>`;
    }

    // ---------- A hirdetés oldalán ----------

    // A doboz (megtekintés-kérés + ajánlat) a js/offers/viewings.js-ben: ajánlatot csak
    // a hirdetővel való kapcsolat után lehet tenni
    static listingBox(i) {
        return typeof Viewings !== "undefined" ? Viewings.box(i) : "";
    }

    static listingKot(i) {
        if (typeof Viewings !== "undefined") Viewings.kot(i);
    }

    // ---------- Az ajánlat űrlapja (ablak) ----------
    // o: { ingatlan_id | kulso_link + iroda_id + kulso_*, cim, ar, cimzett }
    static urlap(o, utana) {
        const { tartalom, modal } = Svc.modal("ofForm", "");
        const esc = Utils.escape;
        const me = AuthManager.user || {};
        const holnap30 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("ofMake")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("crmClose"))}"></button>
            </div>
            <form class="modal-body" id="ofFormEl" novalidate>
                <div class="ofTarget mb-3">
                    <div class="fw-semibold text-truncate">${esc(o.cim || o.kulso_link || "")}</div>
                    <div class="small text-body-secondary">${o.ar ? `${I18n.t("ofAsking")}: ${esc(Offers.penz(o.ar, "EUR"))} · ` : ""}${I18n.f("ofGoesTo", { kinek: esc(o.cimzett || "") })}</div>
                </div>
                <div class="row g-2">
                    <div class="col-8"><label class="form-label small mb-1" for="ofOssz">${I18n.t("ofAmount")} *</label>
                        <input type="number" class="form-control form-control-lg" id="ofOssz" min="1" step="100" required value="${o.ar ? Math.round(o.ar) : ""}" inputmode="numeric"></div>
                    <div class="col-4"><label class="form-label small mb-1" for="ofPenz">${I18n.t("ofCurrency")}</label>
                        <select class="form-select form-select-lg" id="ofPenz"><option value="EUR">€</option><option value="RON">lei</option></select></div>
                </div>
                <div class="small mt-1 mb-3" id="ofKul"></div>
                <span class="form-label small d-block mb-1">${I18n.t("ofFinancing")}</span>
                <div class="d-flex flex-wrap gap-2 mb-2" role="radiogroup" aria-label="${esc(I18n.t("ofFinancing"))}">
                    ${["keszpenz", "hitel", "vegyes"].map((k, n) => `
                        <input type="radio" class="btn-check" name="ofFin" id="ofFin_${k}" value="${k}" ${n === 0 ? "checked" : ""}>
                        <label class="btn btn-sm btn-outline-primary" for="ofFin_${k}">${I18n.t("ofFin_" + k)}</label>`).join("")}
                </div>
                <div class="form-check mb-3" id="ofElobBox" hidden>
                    <input class="form-check-input" type="checkbox" id="ofElob">
                    <label class="form-check-label small" for="ofElob">${I18n.t("ofPreApprovedQ")}</label>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-sm-6"><label class="form-label small mb-1" for="ofBirt">${I18n.t("ofPossession")}</label>
                        <input class="form-control" id="ofBirt" maxlength="80" placeholder="${esc(I18n.t("ofPossessionPh"))}"></div>
                    <div class="col-sm-6"><label class="form-label small mb-1" for="ofErv">${I18n.t("ofValidUntil")}</label>
                        <input type="date" class="form-control" id="ofErv" value="${holnap30}" min="${new Date().toISOString().slice(0, 10)}"></div>
                </div>
                <label class="form-label small mb-1" for="ofUz">${I18n.t("ofMessage")}</label>
                <textarea class="form-control mb-3" id="ofUz" rows="3" maxlength="2000" placeholder="${esc(I18n.t("ofMessagePh"))}"></textarea>
                <div class="row g-2 mb-3">
                    <div class="col-sm-6"><label class="form-label small mb-1" for="ofNev">${I18n.t("crmName")}</label><input class="form-control" id="ofNev" maxlength="120" value="${esc(me.nev || me.felhasznalonev || "")}"></div>
                    <div class="col-sm-6"><label class="form-label small mb-1" for="ofTel">${I18n.t("crmPhone")}</label><input class="form-control" id="ofTel" type="tel" maxlength="40" value="${esc(me.telefon || "")}"></div>
                </div>
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="ofHozza" required>
                    <label class="form-check-label small" for="ofHozza">${I18n.f("ofConsent", { kinek: esc(o.cimzett || "") })}</label>
                </div>
                <div class="alert alert-light small mt-3 mb-0"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> ${I18n.t("ofNonBinding")}</div>
                <div class="alert alert-danger small py-2 mt-3" id="ofHiba" hidden></div>
            </form>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("crmCancel")}</button>
                <button type="submit" class="btn btn-primary" form="ofFormEl" id="ofKuld"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t("ofSendOffer")}</button>
            </div>`;
        modal.show();
        const $ = q => tartalom.querySelector(q);
        const kul = () => {
            const v = Number($("#ofOssz").value);
            $("#ofKul").innerHTML = o.ar && v && $("#ofPenz").value === "EUR"
                ? `<span class="${v < o.ar ? "text-warning" : "text-success"}">${I18n.f("ofDiff", { p: Math.round((v / o.ar - 1) * 100) })}</span>` : "";
        };
        $("#ofOssz").oninput = kul; $("#ofPenz").onchange = kul; kul();
        tartalom.querySelectorAll("input[name=ofFin]").forEach(r => r.onchange = () => { $("#ofElobBox").hidden = r.value === "keszpenz" && r.checked; });
        setTimeout(() => $("#ofOssz").focus(), 300);
        $("#ofFormEl").onsubmit = e => {
            e.preventDefault();
            const hiba = $("#ofHiba");
            hiba.hidden = true;
            if (!(Number($("#ofOssz").value) > 0)) { $("#ofOssz").classList.add("is-invalid"); return; }
            if (!$("#ofHozza").checked) { hiba.textContent = I18n.t("ofErr_consent_required"); hiba.hidden = false; return; }
            $("#ofKuld").disabled = true;
            const fin = (tartalom.querySelector("input[name=ofFin]:checked") || {}).value;
            Offers.api("/api/ajanlatok", {
                method: "POST",
                body: {
                    ...o, cim: undefined, ar: undefined, cimzett: undefined,
                    osszeg: $("#ofOssz").value, penznem: $("#ofPenz").value, finanszirozas: fin, hitel_elobiralat: fin !== "keszpenz" && $("#ofElob").checked,
                    birtokba: $("#ofBirt").value, ervenyes: $("#ofErv").value, uzenet: $("#ofUz").value, nev: $("#ofNev").value, telefon: $("#ofTel").value, hozzajarul: true
                }
            }).then(() => {
                tartalom.querySelector(".modal-body").innerHTML = `
                    <div class="text-center py-4">
                        <i class="fa-solid fa-circle-check text-success fs-1" aria-hidden="true"></i>
                        <h5 class="mt-3">${I18n.t("ofSent")}</h5>
                        <p class="small text-body-secondary">${I18n.t("ofSentHint")}</p>
                        <a class="btn btn-outline-primary btn-sm" href="#fiok/ajanlatok">${I18n.t("ofMyOffers")}</a>
                    </div>`;
                tartalom.querySelector(".modal-footer").innerHTML = `<button type="button" class="btn btn-primary" data-bs-dismiss="modal">${I18n.t("crmClose")}</button>`;
                if (utana) utana();
            }).catch(err => { $("#ofKuld").disabled = false; hiba.textContent = Offers.hiba(err); hiba.hidden = false; });
        };
    }

    // ---------- Fiókom → Ajánlatok ----------

    static fiok(el) {
        const esc = Utils.escape;
        el.innerHTML = `<div class="text-center py-4"><span class="spinner-border text-primary" role="status"></span></div>`;
        Promise.all([Offers.api("/api/ajanlatok/sajat"), Offers.api("/api/ajanlatok/beerkezett")]).then(([sajat, be]) => {
            const sor = (a, bejovo) => `
                <article class="crmOffer st-${esc(a.statusz)}">
                    <div class="d-flex flex-wrap justify-content-between gap-2">
                        <div class="min-w-0">
                            <div class="crmOfferAmount">${esc(Offers.penz(a.osszeg, a.penznem))} ${Offers.badge(a.statusz)}</div>
                            <div class="small text-truncate">${a.ingatlan_id ? `<a href="#listing/${a.ingatlan_id}">${esc(a.ingatlan_cim || "#" + a.ingatlan_id)}</a>` : a.kulso_link ? `<a href="${esc(a.kulso_link)}" target="_blank" rel="noopener nofollow">${esc((a.kulso_adat && a.kulso_adat.cim) || a.kulso_link)}</a>` : ""}</div>
                            <div class="small text-body-secondary">${bejovo ? esc(a.nev || "") + (a.telefon ? ` · <a href="tel:${esc(a.telefon)}">${esc(a.telefon)}</a>` : "") + " · " : (a.iroda_nev ? esc(a.iroda_nev) + " · " : "")}${new Date(a.created_at).toLocaleDateString(Utils.locale())}</div>
                        </div>
                    </div>
                    ${a.uzenet && bejovo ? `<blockquote class="small mt-2 mb-0">${esc(a.uzenet)}</blockquote>` : ""}
                    ${a.statusz === "ellenajanlat" ? `<div class="small mt-2"><b>${I18n.t("ofCounterRecv")}:</b> ${esc(Offers.penz(a.ellen_osszeg, a.penznem))}${a.valasz ? ` – ${esc(a.valasz)}` : ""}</div>` : ""}
                    ${a.valasz && a.statusz !== "ellenajanlat" ? `<div class="small mt-2 text-body-secondary"><b>${I18n.t("ofReply")}:</b> ${esc(a.valasz)}</div>` : ""}
                    <div class="d-flex flex-wrap gap-2 mt-2">
                        ${!bejovo && a.statusz === "ellenajanlat" ? `<button type="button" class="btn btn-sm btn-success" data-ofe="${a.id}">${I18n.f("ofAcceptCounter", { v: esc(Offers.penz(a.ellen_osszeg, a.penznem)) })}</button>` : ""}
                        ${!bejovo && ["uj", "megnezve", "ellenajanlat"].includes(a.statusz) ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-ofv="${a.id}">${I18n.t("ofWithdraw")}</button>` : ""}
                        ${bejovo && ["uj", "megnezve", "ellenajanlat"].includes(a.statusz) ? ["elfogadva", "ellenajanlat", "elutasitva"].map(m => `<button type="button" class="btn btn-sm ${m === "elfogadva" ? "btn-success" : "btn-outline-secondary"}" data-ofb="${a.id}" data-mit="${m}">${I18n.t({ elfogadva: "ofAccept", ellenajanlat: "ofCounter", elutasitva: "ofReject" }[m])}</button>`).join("") : ""}
                    </div>
                </article>`;
            el.innerHTML = `

                ${be.length ? `<h5 class="mt-2">${I18n.t("ofIncoming")}</h5>${be.map(a => sor(a, true)).join("")}<h5 class="mt-4">${I18n.t("ofMyOffers")}</h5>` : ""}
                ${sajat.length ? sajat.map(a => sor(a, false)).join("") : `<div class="emptyState"><i class="fa-solid fa-hand-holding-dollar"></i><h5>${I18n.t("ofMyNone")}</h5><p>${I18n.t("ofMyNoneHint")}</p></div>`}`;
            el.querySelectorAll("[data-ofv]").forEach(b => b.onclick = () => {
                if (!confirm(I18n.t("ofWithdrawConfirm"))) return;
                Offers.api(`/api/ajanlatok/${b.dataset.ofv}/visszavon`, { method: "POST" }).then(() => Offers.fiok(el)).catch(e => alert(Offers.hiba(e)));
            });
            el.querySelectorAll("[data-ofe]").forEach(b => b.onclick = () => {
                if (!confirm(I18n.t("ofAcceptCounterConfirm"))) return;
                Offers.api(`/api/ajanlatok/${b.dataset.ofe}/ellen-elfogad`, { method: "POST" }).then(() => Offers.fiok(el)).catch(e => alert(Offers.hiba(e)));
            });
            el.querySelectorAll("[data-ofb]").forEach(b => b.onclick = () => {
                const mit = b.dataset.mit;
                let ellen = null;
                if (mit === "ellenajanlat") { ellen = prompt(I18n.t("ofCounterAmount")); if (!ellen) return; }
                const valasz = prompt(I18n.t("ofReplyMsg")) || "";
                Offers.api(`/api/ajanlatok/${b.dataset.ofb}/valasz`, { method: "POST", body: { statusz: mit, ellen_osszeg: ellen, valasz } }).then(() => Offers.fiok(el)).catch(e => alert(Offers.hiba(e)));
            });
        }).catch(e => { el.innerHTML = `<div class="alert alert-danger">${Offers.hiba(e)}</div>`; });
    }

}
