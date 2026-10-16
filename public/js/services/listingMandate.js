// ============================================================
//  Megbízásos hirdetés (Eladjuk helyetted) a hirdetés oldalán – a vevő
//
//  Ha a hirdetést mi értékesítjük (ingatlanok.megbizas_id), minden
//  kapcsolat rajtunk keresztül megy (a hirdető kártyája helyett a miénk):
//   - Megtekintés foglalása a naptárból: nap → szabad időpont → név,
//     telefonszám, (kérdés), adatkezelés → Foglalom. Egy vevőnek egy élő
//     foglalása lehet; áthelyezhető, a lemondási határidőig lemondható.
//     Ha egyik időpont sem jó: várólista.
//   - Vételi ajánlat: (alapból) csak a megtekintés után, és csak a
//     finanszírozás megadásával (ablakban).
//   - A saját ügye: foglalása, ajánlatai (az eladó ellenajánlata →
//     elfogadom / új ajánlat, visszavonás), üzenetek.
//
//  Szerver: /api/megbizas/hirdetes/:id/... (server/routes/megbizas.js)
// ============================================================

class ListingMandate {

    static allapot = {};        // hirdetésenként: { nap, ido } (a választott időpont)
    static cel = null;          // { id, mit: "ajanlat" | "foglal" } – az Érdeklődéseim oldalról

    static init() {
        if (typeof ListingPage === "undefined" || ListingPage._mandateHook) return;
        ListingPage._mandateHook = true;
        const eredeti = ListingPage.render;
        ListingPage.render = function (i) {
            eredeti.call(this, i);
            try { ListingMandate.hook(i); } catch (e) { console.error(e); }
        };
    }

    static hook(i) {

        if (!i || !i.megbizas_id) return;

        const box = document.getElementById("listingContent");
        if (!box) return;

        // Jelvény a cím fölött (és az előnézet jelzése)
        const cim = box.querySelector(".listingPageTitle");
        if (cim && !box.querySelector(".lmBadge")) {
            cim.insertAdjacentHTML("beforebegin", `<div class="lmBadge"><i class="fa-solid fa-key" aria-hidden="true"></i> ${I18n.t("vv_badge")}</div>`);
            if (i.statusz === "elonezet") cim.insertAdjacentHTML("beforebegin", `<div class="alert alert-warning small py-2"><i class="fa-regular fa-eye" aria-hidden="true"></i> ${I18n.t("vv_elonezet")}</div>`);
        }

        Promise.all([
            Svc.api("/api/megbizas/hirdetes/" + i.id),
            Svc.api("/api/megbizas/hirdetes/" + i.id + "/idopontok").catch(() => ({ aktiv: false, napok: [] }))
        ]).then(([v, idok]) => ListingMandate.rajzol(i, v, idok)).catch(() => { });

    }

    static rajzol(i, v, idok) {

        const box = document.getElementById("listingContent");
        const regi = document.getElementById("lmCard");
        if (regi) regi.remove();
        if (!v.aktiv || !box) return;
        const side = box.querySelector(".listingSide");
        if (!side) return;

        const esc = Utils.escape;
        const u = AuthManager.user || {};
        const erd = v.erdeklodo || {};
        const al = ListingMandate.allapot[i.id] || (ListingMandate.allapot[i.id] = { nap: null, ido: null, athelyez: null });
        const elo = (v.megtekintesek || []).find(t => t.statusz === "egyeztetve" && t.idopont && new Date(t.idopont) > Date.now());
        const varol = (v.megtekintesek || []).find(t => t.statusz === "kert");
        const megnezte = (v.megtekintesek || []).some(t => t.statusz === "megtortent");
        const napok = idok.napok || [];
        if (!al.nap || !napok.some(d => d.nap === al.nap)) {
            const elso = napok.find(d => d.idopontok.some(x => x.szabad > 0));
            al.nap = elso ? elso.nap : null;
        }
        const nap = napok.find(d => d.nap === al.nap);
        const foglalhat = !v.sajat && !v.foglalt && v.naptar && v.naptar.aktiv && idok.aktiv;
        const nyitottAj = (v.ajanlatok || []).filter(a => ["uj", "tovabbitva", "ellenajanlat"].includes(a.statusz));
        const valasztas = !elo || al.athelyez;

        const napGomb = d => {
            const dt = new Date(d.nap + "T12:00:00");
            const db = d.idopontok.reduce((s, x) => s + (x.szabad > 0 ? 1 : 0), 0);
            return `<button type="button" class="bkNap ${d.nap === al.nap ? "be" : ""} ${db ? "" : "tele"}" data-bk-nap="${d.nap}" ${db ? "" : "disabled"}>
                <span>${esc(dt.toLocaleDateString(Utils.locale(), { weekday: "short" }))}</span><b>${dt.getDate()}</b>
                <small>${db ? esc(I18n.f("vv_hely", { n: db })) : esc(I18n.t("vv_tele"))}</small></button>`;
        };

        const foglalo = foglalhat && valasztas ? `
            ${napok.length ? `
            <div class="bkNapok" role="group" aria-label="${esc(I18n.t("vv_nap"))}">${napok.map(napGomb).join("")}</div>
            ${nap ? `
            <div class="small fw-semibold mt-3 mb-2">${esc(new Date(nap.nap + "T12:00:00").toLocaleDateString(Utils.locale(), { weekday: "long", month: "long", day: "numeric" }))} – ${I18n.t("vv_szabadIdopontok")}</div>
            <div class="bkIdok" role="group" aria-label="${esc(I18n.t("vv_ido"))}">
                ${nap.idopontok.map(x => `<button type="button" class="bkIdo ${al.ido === x.idopont ? "be" : ""}" data-bk-ido="${esc(x.idopont)}" ${x.szabad > 0 ? "" : "disabled"}>${esc(x.ora)}${al.ido === x.idopont ? " ✓" : ""}</button>`).join("")}
            </div>` : ""}` : `<p class="small text-body-secondary mb-2">${I18n.t("vv_nincsSzabad")}</p>`}
            <button type="button" class="btn btn-link btn-sm px-0 mt-2" id="bkVarolista">${I18n.t("vv_egyikSem")}</button>
            ${al.ido ? `
            <form class="bkUrlap mt-2" id="bkUrlap" novalidate>
                ${al.athelyez ? `<p class="small mb-2">${I18n.f("vv_athelyezes", { ido: Svc.ido(elo.idopont) })}</p>` : `
                <div class="mb-2"><label class="form-label small mb-1" for="bkNev">${I18n.t("authName")} *</label>
                    <input class="form-control" id="bkNev" maxlength="160" value="${esc(erd.nev || u.nev || "")}" autocomplete="name"></div>
                <div class="mb-2"><label class="form-label small mb-1" for="bkTel">${I18n.t("accPhone")} *</label>
                    <input class="form-control" id="bkTel" type="tel" maxlength="40" value="${esc(erd.telefon || u.telefon || "")}" autocomplete="tel"></div>
                <div class="mb-2"><label class="form-label small mb-1" for="bkKerdes">${I18n.t("vv_kerdes")}</label>
                    <textarea class="form-control" id="bkKerdes" rows="2" maxlength="2000"></textarea></div>
                <label class="d-flex gap-2 align-items-start small mb-2"><input type="checkbox" class="form-check-input mt-0 flex-none" id="bkOk"><span>${I18n.t("vv_adatkezeles")} <a href="#jogi/adatvedelem">${I18n.t("legalAdatvedelem")}</a></span></label>`}
                <div class="alert alert-danger small py-2" id="bkHiba" hidden></div>
                <button type="submit" class="btn btn-primary w-100" id="bkKuld">${esc(I18n.f(al.athelyez ? "vv_athelyezem" : "vv_foglalom", { ido: Svc.ido(al.ido) }))}</button>
                ${al.athelyez ? `<button type="button" class="btn btn-link btn-sm w-100" id="bkMegse">${I18n.t("adsCancel")}</button>` : ""}
            </form>` : ""}` : "";

        const sajatFoglalas = elo && !al.athelyez ? `
            <div class="bkSajat">
                <span class="small fw-semibold"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${I18n.t("vv_foglalasod")}</span>
                <b>${esc(Svc.ido(elo.idopont))}</b>
                <div class="d-flex flex-wrap gap-2 mt-2">
                    <a class="btn btn-sm btn-outline-secondary" href="/api/megbizas/megtekintes/${elo.id}/ics"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${I18n.t("nt_naptarba")}</a>
                    ${foglalhat ? `<button type="button" class="btn btn-sm btn-outline-secondary" id="bkAthelyez">${I18n.t("nt_athelyez")}</button>` : ""}
                    ${elo.lemondhato ? `<button type="button" class="btn btn-sm btn-link text-danger" data-lm-lemond="${elo.id}">${I18n.t("lmCancel")}</button>` : ""}
                </div>
                ${!elo.lemondhato ? `<p class="small text-body-secondary mt-2 mb-0">${I18n.t("vv_mostMarNem")}</p>` : ""}
            </div>` : "";

        const ajanl = (v.ajanlatok || []).map(a => `
            <li class="lmOfferRow ${esc(a.statusz)}">
                <div><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("lmMyOffer")}: <b>${esc(Svc.penz(a.osszeg, a.penznem))}</b> · <span class="text-body-secondary">${esc(I18n.t("lmOf_" + a.statusz))}</span></div>
                ${a.ervenyes_ig && ["tovabbitva"].includes(a.statusz) ? `<div class="small text-body-secondary">${esc(I18n.f("aj_ervenyesRov", { ido: Svc.ido(a.ervenyes_ig) }))}</div>` : ""}
                ${a.statusz === "ellenajanlat" ? `
                    <div class="lmCounter">
                        ${I18n.t("lmSellerCounter")}: <b>${esc(Svc.penz(a.ellenajanlat, a.penznem))}</b>
                        ${a.elado_valasz ? `<div class="small text-body-secondary">„${esc(a.elado_valasz)}”</div>` : ""}
                        <div class="d-flex flex-wrap gap-1 mt-1">
                            <button type="button" class="btn btn-sm btn-success" data-lm-elfogad="${a.id}"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("lmAcceptCounter")}</button>
                            ${v.ajanlhat ? `<button type="button" class="btn btn-sm btn-outline-primary" data-lm-ajanlat>${I18n.t("lmNewOffer")}</button>` : ""}
                        </div>
                    </div>` : ""}
                ${a.statusz === "elfogadva" ? `<div class="small text-success">${I18n.t("lmAcceptedInfo")}</div>` : ""}
                ${["tovabbitva"].includes(a.statusz) ? `<button type="button" class="btn btn-link btn-sm p-0 text-danger align-self-start" data-lm-visszavon="${a.id}">${I18n.t("lmWithdraw")}</button>` : ""}
            </li>`).join("");

        const uzenetek = !v.sajat ? `
            <div class="lmChat">
                <div class="small fw-semibold mb-1"><i class="fa-regular fa-comments" aria-hidden="true"></i> ${I18n.t("vv_kerdesCim")}</div>
                ${(v.uzenetek || []).length ? `<div class="mdBubbles lmBubbles">${v.uzenetek.map(z => `
                    <div class="mdBubble ${z.irany === "be" ? "ki" : "be"}">
                        <div class="mdBubbleText">${esc(z.szoveg)}</div>
                        <small>${z.irany === "ki" ? "IngatlanPro · " : ""}${esc(Svc.ido(z.created_at))}</small>
                    </div>`).join("")}</div>` : ""}
                <div class="input-group input-group-sm mt-2">
                    <input class="form-control" id="lmGyors" maxlength="2000" placeholder="${esc(I18n.t("lmWritePh"))}" aria-label="${esc(I18n.t("lmWritePh"))}">
                    <button class="btn btn-primary" type="button" id="lmGyorsKuld" aria-label="${esc(I18n.t("lmSend"))}"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
                </div>
            </div>` : "";

        const html = `
            <div class="card mt-4 lmCard" id="lmCard">
                <div class="card-body">
                    <div class="d-flex align-items-start gap-2 mb-3">
                        <span class="lmIcon"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i></span>
                        <div>
                            <h2 class="h5 mb-0">${I18n.t("vv_cim")}</h2>
                            <div class="small text-body-secondary">${esc(I18n.f("vv_alcim", { perc: (v.naptar && v.naptar.hossz) || 30 }))}</div>
                        </div>
                    </div>

                    ${v.sajat ? `<div class="alert alert-info small py-2 mb-0">${I18n.t("lmOwn")} <a href="#eladas">${I18n.t("el_menu")}</a></div>` : v.foglalt ? `
                        <div class="alert alert-secondary small py-2 mb-0"><i class="fa-solid fa-handshake" aria-hidden="true"></i> ${I18n.t("vv_foglaltIngatlan")}</div>` : `
                        ${sajatFoglalas}
                        ${varol && !elo ? `<div class="bkSajat"><span class="small"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> ${I18n.t("vv_varolistan")}${varol.javasolt ? ": " + esc(varol.javasolt) : ""}</span>
                            <button type="button" class="btn btn-link btn-sm p-0 text-danger align-self-start" data-lm-lemond="${varol.id}">${I18n.t("vv_varolistaLe")}</button></div>` : ""}
                        ${foglalo}
                        ${!foglalhat && !elo ? `<p class="small text-body-secondary mb-0">${I18n.t("vv_naptarKi")}</p><button type="button" class="btn btn-link btn-sm px-0" id="bkVarolista">${I18n.t("vv_jelentkezem")}</button>` : ""}

                        <div class="lmAjanlatResz">
                            ${v.ajanlhat ? `<button type="button" class="btn ${megnezte ? "btn-primary" : "btn-outline-primary"} w-100" data-lm-ajanlat><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t(nyitottAj.length ? "lmNewOffer" : "vv_ajanlatotTeszek")}</button>
                                <p class="small text-body-secondary mt-1 mb-0">${I18n.t("vv_ajanlatSugo")}</p>`
                                : `<p class="small text-body-secondary mb-0"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t(v.miert === "contact_first" ? "lmOfferAfterContact" : v.miert === "not_open" ? "vv_ajanlatZarva" : "vv_ajanlatMegtekintesUtan")}</p>`}
                        </div>`}

                    ${ajanl ? `<ul class="mmList small mt-3 mb-0">${ajanl}</ul>` : ""}
                    ${uzenetek}

                    ${!v.sajat && !v.foglalt ? `
                    <div class="bkMiTortenik">
                        <b>${I18n.t("vv_miTortenik")}</b>
                        <span>1. ${I18n.t("vv_lepes1")}</span>
                        <span>2. ${I18n.t("vv_lepes2")}</span>
                        <span>3. ${I18n.t("vv_lepes3")}</span>
                    </div>` : ""}
                </div>
            </div>`;

        // Az eladó (magánszemély) elérhetősége helyett a mi kártyánk
        const kapcsolat = document.getElementById("lpContactCard");
        if (kapcsolat) { kapcsolat.insertAdjacentHTML("beforebegin", html); if (!v.sajat) kapcsolat.hidden = true; }
        else side.children[0].insertAdjacentHTML("afterend", html);

        const kartya = document.getElementById("lmCard");
        const bub = kartya.querySelector(".lmBubbles");
        if (bub) bub.scrollTop = bub.scrollHeight;
        const ujra = () => ListingMandate.hook(i);
        const rajzUjra = () => ListingMandate.rajzol(i, v, idok);
        const bent = fn => () => { if (!AuthManager.loggedIn()) AuthManager.kell().then(() => ujra()).catch(() => { }); else fn(); };

        kartya.querySelectorAll("[data-bk-nap]").forEach(b => { b.onclick = () => { al.nap = b.dataset.bkNap; al.ido = null; rajzUjra(); }; });
        kartya.querySelectorAll("[data-bk-ido]").forEach(b => {
            b.onclick = bent(() => { al.ido = b.dataset.bkIdo; rajzUjra(); const f = document.getElementById("bkUrlap"); if (f) f.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
        });
        const ath = kartya.querySelector("#bkAthelyez");
        if (ath) ath.onclick = () => { al.athelyez = elo.id; al.ido = null; rajzUjra(); };
        const megse = kartya.querySelector("#bkMegse");
        if (megse) megse.onclick = () => { al.athelyez = null; al.ido = null; rajzUjra(); };

        const urlap = kartya.querySelector("#bkUrlap");
        if (urlap) urlap.onsubmit = e => {
            e.preventDefault();
            const $ = q => kartya.querySelector(q);
            const hiba = $("#bkHiba");
            hiba.hidden = true;
            if (!al.athelyez && !$("#bkOk").checked) { hiba.textContent = I18n.t("vv_adatkezelesKell"); hiba.hidden = false; return; }
            const body = al.athelyez
                ? { idopont: al.ido, athelyez: al.athelyez, adatkezeles: true }
                : { idopont: al.ido, nev: $("#bkNev").value, telefon: $("#bkTel").value, kerdes: $("#bkKerdes").value, adatkezeles: true };
            $("#bkKuld").disabled = true;
            Svc.api(`/api/megbizas/hirdetes/${i.id}/foglal`, { method: "POST", body })
                .then(r => {
                    ListingMandate.allapot[i.id] = { nap: null, ido: null, athelyez: null };
                    ListingMandate.koszonjuk(I18n.t("vv_koszFoglalas"), I18n.f("vv_koszFoglalasSzoveg", { ido: Svc.ido(r.idopont) }), r.megtekintes_id);
                    ujra();
                })
                .catch(err => {
                    $("#bkKuld").disabled = false;
                    hiba.textContent = Svc.hiba(err);
                    hiba.hidden = false;
                    if (err && err.kod === "slot_taken") setTimeout(ujra, 1200);
                });
        };

        kartya.querySelectorAll("#bkVarolista").forEach(b => { b.onclick = bent(() => ListingMandate.varolista(i, v)); });
        kartya.querySelectorAll("[data-lm-ajanlat]").forEach(b => { b.onclick = bent(() => ListingMandate.ajanlatUrlap(i, v)); });
        kartya.querySelectorAll("[data-lm-elfogad]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("lmAcceptCounterConfirm"))) return;
                b.disabled = true;
                Svc.api(`/api/megbizas/hirdetes/${i.id}/ajanlat/${b.dataset.lmElfogad}/elfogad`, { method: "POST" })
                    .then(ujra).catch(e => { b.disabled = false; alert(Svc.hiba(e)); });
            };
        });
        kartya.querySelectorAll("[data-lm-visszavon]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("lmWithdrawConfirm"))) return;
                Svc.api(`/api/megbizas/hirdetes/${i.id}/ajanlat/${b.dataset.lmVisszavon}/visszavon`, { method: "POST" })
                    .then(ujra).catch(e => alert(Svc.hiba(e)));
            };
        });
        kartya.querySelectorAll("[data-lm-lemond]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("lmCancelConfirm"))) return;
                Svc.api(`/api/megbizas/hirdetes/${i.id}/megtekintes/${b.dataset.lmLemond}/lemond`, { method: "POST" })
                    .then(ujra).catch(e => alert(Svc.hiba(e)));
            };
        });
        const gyors = kartya.querySelector("#lmGyorsKuld");
        if (gyors) {
            const inp = kartya.querySelector("#lmGyors");
            const kuld = bent(() => {
                const szoveg = inp.value.trim();
                if (!szoveg) return;
                gyors.disabled = true;
                Svc.api(`/api/megbizas/hirdetes/${i.id}/uzenet`, { method: "POST", body: { szoveg, nev: erd.nev || u.nev, telefon: erd.telefon || u.telefon, email: u.email } })
                    .then(ujra).catch(e => { gyors.disabled = false; alert(Svc.hiba(e)); });
            });
            gyors.onclick = kuld;
            inp.onkeydown = e => { if (e.key === "Enter") kuld(); };
        }

        // Az Érdeklődéseim oldalról jött: ajánlat ablak / ugrás a kártyához
        const cel = ListingMandate.cel;
        if (cel && cel.id === i.id) {
            ListingMandate.cel = null;
            setTimeout(() => {
                kartya.scrollIntoView({ block: "start", behavior: "smooth" });
                if (cel.mit === "ajanlat" && v.ajanlhat && !v.sajat) ListingMandate.ajanlatUrlap(i, v);
            }, 300);
        }

    }

    static koszonjuk(cim, szoveg, tid) {
        const esc = Utils.escape;
        const { tartalom, modal } = Svc.modal("lmModal", "");
        tartalom.innerHTML = `
            <div class="modal-body text-center py-5">
                <i class="fa-solid fa-circle-check text-success" style="font-size:2.5rem" aria-hidden="true"></i>
                <h5 class="mt-3">${esc(cim)}</h5>
                <p class="text-body-secondary">${esc(szoveg)}</p>
                <div class="d-flex justify-content-center gap-2">
                    ${tid ? `<a class="btn btn-outline-secondary" href="/api/megbizas/megtekintes/${tid}/ics"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${I18n.t("nt_naptarba")}</a>` : ""}
                    <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
                </div>
            </div>`;
        modal.show();
    }

    // Várólista: egyik időpont sem jó
    static varolista(i, v) {
        const esc = Utils.escape;
        const u = AuthManager.user || {};
        const erd = v.erdeklodo || {};
        const { tartalom, modal } = Svc.modal("lmModal", "");
        tartalom.innerHTML = `
            <form id="vlForm" novalidate>
                <div class="modal-header">
                    <h5 class="modal-title">${I18n.t("vv_varolistaCim")}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
                </div>
                <div class="modal-body">
                    <p class="small text-body-secondary">${I18n.t("vv_varolistaSugo")}</p>
                    <div class="mb-2"><label class="form-label small mb-1" for="vlMikor">${I18n.t("nt_mikorErne")} *</label>
                        <input class="form-control" id="vlMikor" maxlength="300" placeholder="${esc(I18n.t("lmWhenPh"))}"></div>
                    <div class="mb-2"><label class="form-label small mb-1" for="vlNev">${I18n.t("authName")} *</label>
                        <input class="form-control" id="vlNev" maxlength="160" value="${esc(erd.nev || u.nev || "")}"></div>
                    <div class="mb-2"><label class="form-label small mb-1" for="vlTel">${I18n.t("accPhone")} *</label>
                        <input class="form-control" id="vlTel" type="tel" maxlength="40" value="${esc(erd.telefon || u.telefon || "")}"></div>
                    <div class="alert alert-danger small py-2 mb-0" id="vlHiba" hidden></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
                    <button type="submit" class="btn btn-primary" id="vlKuld">${I18n.t("vv_varolistaKuld")}</button>
                </div>
            </form>`;
        const $ = q => tartalom.querySelector(q);
        $("#vlForm").onsubmit = e => {
            e.preventDefault();
            $("#vlKuld").disabled = true;
            Svc.api(`/api/megbizas/hirdetes/${i.id}/varolista`, { method: "POST", body: { javasolt: $("#vlMikor").value, nev: $("#vlNev").value, telefon: $("#vlTel").value } })
                .then(() => { modal.hide(); ListingMandate.hook(i); MandateDesk.jelez(I18n.t("vv_varolistaOk")); })
                .catch(err => { $("#vlKuld").disabled = false; $("#vlHiba").textContent = Svc.hiba(err); $("#vlHiba").hidden = false; });
        };
        modal.show();
    }

    // Vételi ajánlat finanszírozással (ablakban)
    static ajanlatUrlap(i, v) {

        const esc = Utils.escape;
        const u = AuthManager.user || {};
        const erd = v.erdeklodo || {};
        const pn = v.penznem || "EUR";
        const { tartalom, modal } = Svc.modal("lmAjModal", "modal-xl");
        const ar = Number(i.ar) || 0;
        const d = {
            osszeg: ar ? Math.round(ar * 0.96 / 500) * 500 : "", penznem: pn, finanszirozas: "", onero: "", hitel_osszeg: "", hitel_allapot: "elozetes",
            bank: "", foglalo: ar ? Math.round(ar * 0.07 / 500) * 500 : "", eloszerzodes_ig: "", kozjegyzo_ig: "", ervenyes_ora: v.ervenyes_ora || 72,
            feltetelek: "", uzenet: "", igazolas: null, igazolas_nev: "", szandek: false
        };
        const ma = new Date().toISOString().slice(0, 10);

        const rajz = () => {
            const hitel = d.finanszirozas === "hitel" || d.finanszirozas === "vegyes";
            const szaz = ar && d.osszeg ? Math.round((Number(d.osszeg) / ar - 1) * 1000) / 10 : null;
            const ervIg = new Date(Date.now() + Number(d.ervenyes_ora) * 3600000);
            tartalom.innerHTML = `
                <form id="ajForm" novalidate>
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("aj_cim")}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row g-4">
                            <div class="col-lg-8 d-flex flex-column gap-3">
                                <p class="text-body-secondary mb-0">${I18n.t("aj_bevezeto")}</p>
                                <section class="ajResz">
                                    <h6>1. ${I18n.t("aj_ar")}</h6>
                                    <div class="d-flex flex-wrap gap-2 align-items-end">
                                        <div class="flex-fill" style="min-width:200px">
                                            <label class="form-label small mb-1" for="ajOsszeg">${I18n.t("aj_vetelar")} *</label>
                                            <div class="input-group"><input class="form-control form-control-lg fw-bold" id="ajOsszeg" type="number" min="1" step="500" value="${esc(d.osszeg)}" data-k="osszeg">
                                            <select class="form-select flex-grow-0 w-auto" id="ajPn" data-k="penznem" aria-label="${esc(I18n.t("finCurrency"))}"><option ${d.penznem !== "RON" ? "selected" : ""}>EUR</option><option ${d.penznem === "RON" ? "selected" : ""}>RON</option></select></div>
                                        </div>
                                        ${szaz !== null ? `<span class="ajSzaz ${szaz < 0 ? "le" : "fel"}">${szaz > 0 ? "+" : ""}${Utils.num(szaz, 1)}% ${I18n.t("dk_kerthez")}</span>` : ""}
                                    </div>
                                </section>

                                <section class="ajResz">
                                    <h6>2. ${I18n.t("lmFinancing")} *</h6>
                                    <div class="ajFinValaszto" role="radiogroup" aria-label="${esc(I18n.t("lmFinancing"))}">
                                        ${["keszpenz", "hitel", "vegyes"].map(f => `
                                            <button type="button" role="radio" aria-checked="${d.finanszirozas === f}" class="ajFin ${d.finanszirozas === f ? "be" : ""}" data-fin="${f}">
                                                <b>${I18n.t("aj_fin_" + f)}</b><span>${I18n.t("aj_finSugo_" + f)}</span>
                                            </button>`).join("")}
                                    </div>
                                    ${hitel ? `
                                    <div class="row g-2 mt-1">
                                        <div class="col-sm-6"><label class="form-label small mb-1" for="ajOnero">${I18n.t("aj_onero")}</label><input class="form-control" id="ajOnero" type="number" min="0" step="500" value="${esc(d.onero)}" data-k="onero"></div>
                                        <div class="col-sm-6"><label class="form-label small mb-1" for="ajHitel">${I18n.t("aj_hitelOsszeg")} *</label><input class="form-control" id="ajHitel" type="number" min="1" step="500" value="${esc(d.hitel_osszeg)}" data-k="hitel_osszeg"></div>
                                        <div class="col-sm-6"><label class="form-label small mb-1" for="ajHitAll">${I18n.t("aj_hitelBiralat")} *</label>
                                            <select class="form-select" id="ajHitAll" data-k="hitel_allapot">${["elozetes", "folyamatban", "nincs"].map(x => `<option value="${x}" ${d.hitel_allapot === x ? "selected" : ""}>${I18n.t("aj_hitelOpt_" + x)}</option>`).join("")}</select></div>
                                        <div class="col-sm-6"><label class="form-label small mb-1" for="ajBank">${I18n.t("aj_bank")}</label><input class="form-control" id="ajBank" maxlength="120" value="${esc(d.bank)}" data-k="bank"></div>
                                    </div>
                                    <div class="ajIgazolas mt-2">
                                        <div><b class="small">${I18n.t("aj_igazolasCim")}</b><div class="small text-body-secondary">${I18n.t("aj_igazolasSugo")}</div></div>
                                        <div class="d-flex gap-2 align-items-center">${d.igazolas ? `<span class="small"><i class="fa-solid fa-paperclip" aria-hidden="true"></i> ${esc(d.igazolas_nev)}</span><button type="button" class="btn btn-sm btn-link text-danger p-0" id="ajIgTorol">${I18n.t("finDelete")}</button>` : `<button type="button" class="btn btn-sm btn-outline-secondary" id="ajIgFel">${I18n.t("aj_fajl")}</button>`}</div>
                                    </div>` : ""}
                                </section>

                                <section class="ajResz">
                                    <h6>3. ${I18n.t("aj_foglaloHataridok")}</h6>
                                    <div class="row g-2">
                                        <div class="col-sm-6"><label class="form-label small mb-1" for="ajFogl">${I18n.t("aj_foglaloElo")}</label><input class="form-control" id="ajFogl" type="number" min="0" step="500" value="${esc(d.foglalo)}" data-k="foglalo"></div>
                                        <div class="col-sm-6"><label class="form-label small mb-1" for="ajErv">${I18n.t("aj_ervenyes")}</label>
                                            <select class="form-select" id="ajErv" data-k="ervenyes_ora">${[24, 48, 72, 120, 168].map(h => `<option value="${h}" ${Number(d.ervenyes_ora) === h ? "selected" : ""}>${esc(I18n.f("aj_oraig", { n: h }))}</option>`).join("")}</select></div>
                                        <div class="col-sm-6"><label class="form-label small mb-1" for="ajElo">${I18n.t("aj_eloszerzodesIg")}</label><input class="form-control" id="ajElo" type="date" min="${ma}" value="${esc(d.eloszerzodes_ig)}" data-k="eloszerzodes_ig"></div>
                                        <div class="col-sm-6"><label class="form-label small mb-1" for="ajKoz">${I18n.t("aj_kozjegyzoIg")}</label><input class="form-control" id="ajKoz" type="date" min="${ma}" value="${esc(d.kozjegyzo_ig)}" data-k="kozjegyzo_ig"></div>
                                        <div class="col-12"><label class="form-label small mb-1" for="ajFelt">${I18n.t("aj_feltetelek")}</label><textarea class="form-control" id="ajFelt" rows="2" maxlength="1000" data-k="feltetelek" placeholder="${esc(I18n.t("lmConditionsPh"))}">${esc(d.feltetelek)}</textarea></div>
                                    </div>
                                </section>

                                <label class="d-flex gap-2 align-items-start small"><input type="checkbox" class="form-check-input mt-0 flex-none" id="ajSzandek" ${d.szandek ? "checked" : ""}><span>${I18n.t("aj_szandek")}</span></label>
                                <div class="alert alert-danger small py-2 mb-0" id="ajHiba" hidden></div>
                            </div>

                            <aside class="col-lg-4">
                                <div class="ajOsszegzo">
                                    <h6>${I18n.t("aj_osszegzo")}</h6>
                                    <div class="mbKv"><span>${I18n.t("aj_ajanlat")}</span><b>${d.osszeg ? esc(Svc.penz(d.osszeg, d.penznem)) : "–"}</b></div>
                                    <div class="mbKv"><span>${I18n.t("lmFinancing")}</span><b>${d.finanszirozas ? esc(I18n.t("aj_fin_" + d.finanszirozas)) + (hitel ? " · " + esc(I18n.t("aj_hitel_" + d.hitel_allapot)) : "") : "–"}</b></div>
                                    <div class="mbKv"><span>${I18n.t("aj_foglalo")}</span><b>${d.foglalo ? esc(Svc.penz(d.foglalo, d.penznem)) : "–"}</b></div>
                                    <div class="mbKv"><span>${I18n.t("aj_kozjegyzo")}</span><b>${d.kozjegyzo_ig ? esc(Svc.nap(d.kozjegyzo_ig)) : "–"}</b></div>
                                    <div class="mbKv"><span>${I18n.t("aj_ervenyesRovid")}</span><b>${esc(Svc.ido(ervIg))}</b></div>
                                </div>
                                <div class="ajOsszegzo mt-3">
                                    <h6>${I18n.t("vv_miTortenik")}</h6>
                                    <ol class="small mb-0 ps-3">
                                        <li>${I18n.t("aj_lepes1")}</li>
                                        <li>${I18n.t("aj_lepes2")}</li>
                                        <li>${I18n.t("aj_lepes3")}</li>
                                    </ol>
                                    <p class="small text-body-secondary mt-2 mb-0">${I18n.t("aj_visszavonhato")}</p>
                                </div>
                            </aside>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
                        <button type="submit" class="btn btn-primary" id="ajKuld"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t("aj_kuld")}</button>
                    </div>
                </form>`;

            const $ = q => tartalom.querySelector(q);
            const olvas = () => {
                tartalom.querySelectorAll("[data-k]").forEach(el => { d[el.dataset.k] = el.value; });
                d.szandek = $("#ajSzandek").checked;
            };
            tartalom.querySelectorAll("[data-k]").forEach(el => { el.onchange = () => { olvas(); rajz(); }; });
            tartalom.querySelectorAll("[data-fin]").forEach(b => { b.onclick = () => { olvas(); d.finanszirozas = b.dataset.fin; rajz(); }; });
            const igF = $("#ajIgFel");
            if (igF) igF.onclick = () => { olvas(); MandateDesk.fajlValaszt().then(f => { if (f) { d.igazolas = f.adat; d.igazolas_nev = f.nev; rajz(); } }).catch(e => alert(Svc.hiba(e))); };
            const igT = $("#ajIgTorol");
            if (igT) igT.onclick = () => { olvas(); d.igazolas = null; d.igazolas_nev = ""; rajz(); };

            $("#ajForm").onsubmit = e => {
                e.preventDefault();
                olvas();
                const hiba = $("#ajHiba");
                hiba.hidden = true;
                const hib = s => { hiba.textContent = s; hiba.hidden = false; };
                if (!Number(d.osszeg)) return hib(I18n.t("svcErr_bad_amount"));
                if (!d.finanszirozas) return hib(I18n.t("svcErr_missing_financing"));
                if ((d.finanszirozas === "hitel" || d.finanszirozas === "vegyes") && !Number(d.hitel_osszeg)) return hib(I18n.t("svcErr_missing_financing"));
                if (!d.szandek) return hib(I18n.t("aj_szandekKell"));
                $("#ajKuld").disabled = true;
                Svc.api(`/api/megbizas/hirdetes/${i.id}/ajanlat`, { method: "POST", body: { ...d, nev: erd.nev || u.nev, telefon: erd.telefon || u.telefon, email: u.email } })
                    .then(r => {
                        modal.hide();
                        ListingMandate.koszonjuk(I18n.t("lmThanks"), I18n.f(r.tovabbitva ? "aj_koszDirekt" : "aj_kosz", { ido: Svc.ido(r.ervenyes_ig) }));
                        ListingMandate.hook(i);
                    })
                    .catch(err => { $("#ajKuld").disabled = false; hib(Svc.hiba(err)); });
            };
        };

        rajz();
        modal.show();

    }

}

document.addEventListener("DOMContentLoaded", () => ListingMandate.init());
