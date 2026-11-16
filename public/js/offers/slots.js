// ============================================================
//  Megtekintési idősávok
//
//  Idosav.szerkeszt()        a hirdető (ingatlanos / magán eladó) heti rendje:
//                            mely napokon, mettől meddig fogad megtekintést, milyen
//                            hosszú egy megtekintés, mennyivel előre lehet foglalni,
//                            azonnali visszaigazolás. Bármikor átírható.
//  Idosav.foglal(o, a, utana) az érdeklődő a hirdetés oldalán: nap → időpont →
//                            egy kattintás. Csak a szabad időpontok látszanak.
//  Szerver: server/services/idosav.js  (/api/megtekintes/idosavok, /szabad/:id, /foglal)
//  A hirdetés oldalán a „Megtekintést kérek” gomb (js/offers/viewings.js) ide vezet,
//  ha a hirdetőnek vannak idősávjai; különben marad a régi (1–3 időpont javaslása).
// ============================================================

class Idosav {

    static NAPOK = [1, 2, 3, 4, 5, 6, 7];

    static napNev(n, rovid) {
        // 2024-01-01 hétfő volt
        return new Date(2024, 0, n).toLocaleDateString(Utils.locale(), { weekday: rovid ? "short" : "long" });
    }

    // ===================== A HIRDETŐ: heti rend =====================

    static szerkeszt(utana) {
        const { tartalom, modal } = Svc.modal("isForm", "modal-lg");
        const esc = Utils.escape;
        const t = k => I18n.t(k);
        tartalom.innerHTML = `<div class="modal-body"><div class="emptyState"><div class="spinner-border text-primary"></div></div></div>`;
        modal.show();

        let savok = [];      // [{ nap, kezd, veg }]
        let beall = {};

        const rajzol = () => {
            tartalom.innerHTML = `
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${t("isTitle")}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(t("crmClose"))}"></button>
                </div>
                <div class="modal-body">
                    <p class="small text-body-secondary">${t("isIntro")}</p>

                    <div class="isHet">
                        ${Idosav.NAPOK.map(n => {
                            const sor = savok.map((s, i) => ({ s, i })).filter(x => x.s.nap === n);
                            return `
                            <div class="isNap ${sor.length ? "" : "ures"}">
                                <b class="isNapNev">${esc(Idosav.napNev(n))}</b>
                                <div class="isSavok">
                                    ${sor.map(({ s, i }) => `
                                        <span class="isSav">
                                            <input type="time" class="form-control form-control-sm" value="${esc(s.kezd)}" step="900" data-is-k="${i}" aria-label="${esc(t("isFrom"))}">
                                            <span aria-hidden="true">–</span>
                                            <input type="time" class="form-control form-control-sm" value="${esc(s.veg)}" step="900" data-is-v="${i}" aria-label="${esc(t("isTo"))}">
                                            <button type="button" class="btn btn-sm btn-link text-danger p-1" data-is-torol="${i}" aria-label="${esc(t("isRemove"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                                        </span>`).join("") || `<span class="small text-body-secondary">${t("isClosed")}</span>`}
                                </div>
                                <div class="isNapGomb">
                                    <button type="button" class="btn btn-sm btn-outline-secondary" data-is-uj="${n}"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${t("isAdd")}</button>
                                    ${sor.length ? `<button type="button" class="btn btn-sm btn-link p-1" data-is-masol="${n}" title="${esc(t("isCopyHelp"))}">${t("isCopy")}</button>` : ""}
                                </div>
                            </div>`;
                        }).join("")}
                    </div>

                    <div class="row g-3 mt-1">
                        <div class="col-6 col-md-3">
                            <label class="form-label small mb-1" for="isHossz">${t("isLength")}</label>
                            <select class="form-select form-select-sm" id="isHossz">${[15, 20, 30, 45, 60, 90].map(p => `<option value="${p}" ${p === beall.hossz_perc ? "selected" : ""}>${p} ${t("isMin")}</option>`).join("")}</select>
                        </div>
                        <div class="col-6 col-md-3">
                            <label class="form-label small mb-1" for="isSzunet">${t("isGap")}</label>
                            <select class="form-select form-select-sm" id="isSzunet">${[0, 10, 15, 30, 45, 60].map(p => `<option value="${p}" ${p === beall.szunet_perc ? "selected" : ""}>${p} ${t("isMin")}</option>`).join("")}</select>
                        </div>
                        <div class="col-6 col-md-3">
                            <label class="form-label small mb-1" for="isMin">${t("isNotice")}</label>
                            <select class="form-select form-select-sm" id="isMin">${[0, 1, 2, 3, 6, 12, 24, 48].map(o => `<option value="${o}" ${o === beall.min_ora ? "selected" : ""}>${o} ${t("isHours")}</option>`).join("")}</select>
                        </div>
                        <div class="col-6 col-md-3">
                            <label class="form-label small mb-1" for="isElore">${t("isAhead")}</label>
                            <select class="form-select form-select-sm" id="isElore">${[7, 14, 21, 30, 60].map(d => `<option value="${d}" ${d === beall.elore_nap ? "selected" : ""}>${d} ${t("isDays")}</option>`).join("")}</select>
                        </div>
                    </div>

                    <div class="form-check form-switch mt-3">
                        <input class="form-check-input" type="checkbox" role="switch" id="isAzonnali" ${beall.azonnali !== false ? "checked" : ""}>
                        <label class="form-check-label" for="isAzonnali"><b>${t("isInstant")}</b><span class="d-block small text-body-secondary">${t("isInstantHelp")}</span></label>
                    </div>
                    <div class="form-check form-switch mt-2">
                        <input class="form-check-input" type="checkbox" role="switch" id="isAktiv" ${beall.aktiv !== false ? "checked" : ""}>
                        <label class="form-check-label" for="isAktiv"><b>${t("isActive")}</b><span class="d-block small text-body-secondary">${t("isActiveHelp")}</span></label>
                    </div>
                    <div class="alert alert-danger small py-2 mt-3" id="isHiba" hidden></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t("crmCancel")}</button>
                    <button type="button" class="btn btn-primary" id="isMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${t("finSave")}</button>
                </div>`;

            const $ = q => tartalom.querySelector(q);
            const be = () => {      // az űrlap mostani értékei a változókba (újrarajzolás előtt)
                tartalom.querySelectorAll("[data-is-k]").forEach(i => { savok[+i.dataset.isK].kezd = i.value; });
                tartalom.querySelectorAll("[data-is-v]").forEach(i => { savok[+i.dataset.isV].veg = i.value; });
                beall = { hossz_perc: +$("#isHossz").value, szunet_perc: +$("#isSzunet").value, min_ora: +$("#isMin").value, elore_nap: +$("#isElore").value,
                    azonnali: $("#isAzonnali").checked, aktiv: $("#isAktiv").checked };
            };
            tartalom.querySelectorAll("[data-is-uj]").forEach(b => b.onclick = () => {
                be();
                const n = +b.dataset.isUj;
                const utolso = savok.filter(s => s.nap === n).pop();
                // az első sáv délután 4–7, a következő az előző után egy órával
                const kezd = utolso ? Idosav.plusz(utolso.veg, 60) : "16:00";
                savok.push({ nap: n, kezd, veg: Idosav.plusz(kezd, utolso ? 120 : 180) });
                rajzol();
            });
            tartalom.querySelectorAll("[data-is-torol]").forEach(b => b.onclick = () => { be(); savok.splice(+b.dataset.isTorol, 1); rajzol(); });
            // „Másolás a hétköznapokra”: ennek a napnak a sávjai hétfőtől péntekig
            tartalom.querySelectorAll("[data-is-masol]").forEach(b => b.onclick = () => {
                be();
                const n = +b.dataset.isMasol;
                const minta = savok.filter(s => s.nap === n).map(s => ({ kezd: s.kezd, veg: s.veg }));
                savok = savok.filter(s => s.nap > 5 || s.nap === n);
                [1, 2, 3, 4, 5].filter(x => x !== n).forEach(x => minta.forEach(m => savok.push({ nap: x, ...m })));
                rajzol();
            });
            $("#isMent").onclick = () => {
                be();
                const hiba = $("#isHiba");
                hiba.hidden = true;
                if (savok.some(s => !s.kezd || !s.veg || s.veg <= s.kezd)) { hiba.textContent = I18n.t("mkErr_slot_bad_range"); hiba.hidden = false; return; }
                $("#isMent").disabled = true;
                Viewings.api("/api/megtekintes/idosavok", { method: "PUT", body: { savok, ...beall } }).then(() => {
                    modal.hide();
                    if (typeof Utils.toast === "function") Utils.toast(I18n.t("isSaved"));
                    if (utana) utana();
                }).catch(e => { $("#isMent").disabled = false; hiba.textContent = Viewings.hiba(e); hiba.hidden = false; });
            };
        };

        Viewings.api("/api/megtekintes/idosavok").then(a => {
            savok = (a.savok || []).map(s => ({ nap: s.nap, kezd: s.kezd, veg: s.veg }));
            beall = a.beall || {};
            rajzol();
        }).catch(e => { tartalom.innerHTML = `<div class="modal-body"><div class="alert alert-danger mb-0">${Utils.escape(Viewings.hiba(e))}</div></div>`; });
    }

    static plusz(hhmm, perc) {
        const [h, m] = String(hhmm || "16:00").split(":").map(Number);
        const p = Math.min(23 * 60 + 45, h * 60 + m + perc);
        return `${String(Math.floor(p / 60)).padStart(2, "0")}:${String(p % 60).padStart(2, "0")}`;
    }

    // Rövid összefoglaló a gomb mellé (pl. „H–P 16:00–19:00 · Szo 10:00–13:00”) – vagy „még nincs beállítva”
    static osszegzes(a) {
        const savok = (a && a.savok) || [];
        if (!savok.length || (a.beall && a.beall.aktiv === false)) return I18n.t(savok.length ? "isSumOff" : "isSumNone");
        const napi = {};
        savok.forEach(s => { (napi[s.nap] = napi[s.nap] || []).push(`${s.kezd}–${s.veg}`); });
        const csop = [];
        Idosav.NAPOK.forEach(n => {
            if (!napi[n]) return;
            const k = napi[n].join(", ");
            const u = csop[csop.length - 1];
            if (u && u.k === k && u.ig === n - 1) u.ig = n;
            else csop.push({ tol: n, ig: n, k });
        });
        return csop.map(c => `${Idosav.napNev(c.tol, true)}${c.ig > c.tol ? "–" + Idosav.napNev(c.ig, true) : ""} ${c.k}`).join(" · ");
    }

    // Egy sor a naptár / a megtekintések fölé: mikor fogadok megtekintést + „Beállítás” gomb
    static sav(el, utana) {
        if (!el) return;
        const rajz = a => {
            if (!a.hirdeto && !a.van) { el.innerHTML = ""; el.hidden = true; return; }
            el.innerHTML = `
                <div class="isSavSor ${a.van && a.beall.aktiv !== false ? "" : "nincs"}">
                    <i class="fa-regular fa-clock" aria-hidden="true"></i>
                    <div class="min-w-0 flex-fill">
                        <b>${I18n.t("isBarTitle")}</b>
                        <div class="small text-body-secondary">${Utils.escape(Idosav.osszegzes(a))}${a.van && a.beall.aktiv !== false ? ` · ${I18n.t(a.beall.azonnali ? "isBarInstant" : "isBarApprove")}` : ""}</div>
                    </div>
                    <button type="button" class="btn btn-sm ${a.van ? "btn-outline-primary" : "btn-primary"} text-nowrap" data-is-nyit><i class="fa-solid fa-sliders" aria-hidden="true"></i> ${I18n.t(a.van ? "isBarEdit" : "isBarSetup")}</button>
                </div>`;
            el.querySelector("[data-is-nyit]").onclick = () => Idosav.szerkeszt(() => { Idosav.sav(el, utana); if (utana) utana(); });
        };
        Viewings.api("/api/megtekintes/idosavok").then(rajz).catch(() => { el.innerHTML = ""; });
    }

    // ===================== AZ ÉRDEKLŐDŐ: foglalás =====================

    // o: { ingatlan_id, cim, cimzett }, a: { napok: [{datum, idok}], hossz_perc, azonnali }
    static foglal(o, a, utana) {
        const { tartalom, modal } = Svc.modal("isFoglal", "");
        const esc = Utils.escape;
        const t = k => I18n.t(k);
        const me = AuthManager.user || {};
        let nap = a.napok[0].datum;
        let ido = null;
        const d = ymd => new Date(ymd + "T00:00");

        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${t("isBookTitle")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(t("crmClose"))}"></button>
            </div>
            <form class="modal-body" id="isFormEl" novalidate>
                <div class="ofTarget mb-3">
                    <div class="fw-semibold text-truncate">${esc(o.cim || "")}</div>
                    <div class="small text-body-secondary">${esc(o.cimzett || "")} · ${a.hossz_perc} ${t("isMin")}</div>
                </div>

                <span class="form-label small d-block mb-1">${t("isPickDay")}</span>
                <div class="isNapok" id="isNapok" role="listbox" aria-label="${esc(t("isPickDay"))}">
                    ${a.napok.map(n => `
                        <button type="button" class="isNapChip" role="option" data-nap="${n.datum}">
                            <small>${esc(d(n.datum).toLocaleDateString(Utils.locale(), { weekday: "short" }))}</small>
                            <b>${d(n.datum).getDate()}</b>
                            <small>${esc(d(n.datum).toLocaleDateString(Utils.locale(), { month: "short" }))}</small>
                        </button>`).join("")}
                </div>

                <span class="form-label small d-block mt-3 mb-1">${t("isPickTime")}</span>
                <div class="isIdok" id="isIdok" role="listbox" aria-label="${esc(t("isPickTime"))}"></div>

                <div class="isValasztott" id="isValasztott" hidden></div>

                <div class="row g-2 mt-2">
                    <div class="col-sm-6"><label class="form-label small mb-1" for="isNev">${t("crmName")}</label><input class="form-control" id="isNev" maxlength="120" value="${esc(me.nev || me.felhasznalonev || "")}"></div>
                    <div class="col-sm-6"><label class="form-label small mb-1" for="isTel">${t("crmPhone")} *</label><input class="form-control" id="isTel" type="tel" maxlength="40" required value="${esc(me.telefon || "")}" autocomplete="tel"></div>
                </div>
                <label class="form-label small mb-1 mt-2" for="isUz">${t("ofMessage")}</label>
                <textarea class="form-control mb-3" id="isUz" rows="2" maxlength="1500" placeholder="${esc(t("mkMessagePh"))}"></textarea>
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="isHozza" required>
                    <label class="form-check-label small" for="isHozza">${I18n.f("mkConsent", { kinek: esc(o.cimzett || "") })}</label>
                </div>
                <div class="alert alert-danger small py-2 mt-3" id="isHiba" hidden></div>
                <button type="button" class="btn btn-link btn-sm p-0 mt-2" id="isMas">${t("isOtherTime")}</button>
            </form>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t("crmCancel")}</button>
                <button type="submit" class="btn btn-primary" form="isFormEl" id="isKuld" disabled><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${t(a.azonnali ? "isBook" : "isBookAsk")}</button>
            </div>`;
        modal.show();

        const $ = q => tartalom.querySelector(q);
        const idok = () => {
            const n = a.napok.find(x => x.datum === nap) || { idok: [] };
            tartalom.querySelectorAll(".isNapChip").forEach(b => { const akt = b.dataset.nap === nap; b.classList.toggle("active", akt); b.setAttribute("aria-selected", String(akt)); });
            $("#isIdok").innerHTML = n.idok.map(h => `<button type="button" class="isIdo ${h === ido ? "active" : ""}" role="option" aria-selected="${h === ido}" data-ido="${h}">${h}</button>`).join("");
            $("#isIdok").querySelectorAll("[data-ido]").forEach(b => b.onclick = () => { ido = b.dataset.ido; idok(); });
            const v = $("#isValasztott");
            v.hidden = !ido;
            if (ido) v.innerHTML = `<i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${esc(Viewings.ido(`${nap}T${ido}`))}`;
            $("#isKuld").disabled = !ido;
        };
        tartalom.querySelectorAll(".isNapChip").forEach(b => b.onclick = () => { nap = b.dataset.nap; ido = null; idok(); });
        idok();

        // Egyik sem jó: a régi űrlap (1–3 saját időpont javaslása)
        $("#isMas").onclick = () => { modal.hide(); setTimeout(() => Viewings.urlap(o, utana), 250); };

        $("#isFormEl").onsubmit = e => {
            e.preventDefault();
            const hiba = $("#isHiba");
            hiba.hidden = true;
            if (!ido) return;
            if (!$("#isTel").value.trim()) { $("#isTel").classList.add("is-invalid"); $("#isTel").focus(); return; }
            if (!$("#isHozza").checked) { hiba.textContent = I18n.t("ofErr_consent_required"); hiba.hidden = false; return; }
            $("#isKuld").disabled = true;
            Viewings.api("/api/megtekintes/foglal", {
                method: "POST",
                body: { ingatlan_id: o.ingatlan_id, idopont: `${nap}T${ido}`, uzenet: $("#isUz").value, nev: $("#isNev").value, telefon: $("#isTel").value, hozzajarul: true }
            }).then(r => {
                const kesz = r.statusz === "elfogadva";
                tartalom.querySelector(".modal-body").innerHTML = `
                    <div class="text-center py-4">
                        <i class="fa-regular fa-calendar-check text-success fs-1" aria-hidden="true"></i>
                        <h5 class="mt-3">${t(kesz ? "isBooked" : "mkSent")}</h5>
                        <p class="fw-semibold mb-1">${esc(Viewings.ido(r.idopont))}</p>
                        <p class="small text-body-secondary">${t(kesz ? "isBookedHint" : "mkSentHint")}</p>
                        <div class="d-flex flex-wrap gap-2 justify-content-center">
                            ${kesz ? `<a class="btn btn-outline-primary btn-sm" href="/api/megtekintes/${r.id}/ics" download><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${t("mkAddCal")}</a>` : ""}
                            <a class="btn btn-outline-secondary btn-sm" href="#fiok/megtekintesek">${t("mkMine")}</a>
                        </div>
                    </div>`;
                tartalom.querySelector(".modal-footer").innerHTML = `<button type="button" class="btn btn-primary" data-bs-dismiss="modal">${t("crmClose")}</button>`;
                if (utana) utana();
            }).catch(err => {
                hiba.textContent = Viewings.hiba(err);
                hiba.hidden = false;
                // közben elvitték: a friss szabad időpontok
                if ((err && (err.kod || err.message)) === "slot_taken") {
                    Viewings.api(`/api/megtekintes/szabad/${o.ingatlan_id}`).then(uj => {
                        if (!uj.napok.length) return;
                        a.napok = uj.napok;
                        if (!a.napok.some(x => x.datum === nap)) nap = a.napok[0].datum;
                        ido = null;
                        idok();
                    }).catch(() => { });
                } else $("#isKuld").disabled = false;
            });
        };
    }

}
