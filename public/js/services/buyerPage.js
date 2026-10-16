// ============================================================
//  Érdeklődéseim (#erdeklodes) – a vevő oldala
//
//  Egy helyen minden ingatlan, ahol a felhasználó vevőként jelentkezett
//  (az „Eladjuk helyetted” hirdetéseken):
//    - „Rád vár”: az eladó ellenajánlata (elfogadás / új ajánlat /
//      visszavonás), az új üzenetek
//    - ingatlanonként: hol tart (időpont → megtekintés → ajánlat → adásvétel),
//      a foglalás (naptárba, lemondás, áthelyezés), a várólista, az ajánlatai,
//      és az üzenetek az ügyintézővel – a hirdetés megnyitása nélkül is
//
//  A menüben: a fejléc „Vásárlás” csoportja és a fiók menü; a jelvény azt
//  mutatja, hány dolog vár rá (/api/me → vevo).
//  Szerver: GET /api/megbizas/vevo + a hirdetés vevői végpontjai
//  (/api/megbizas/hirdetes/:id/...) – server/routes/megbizas.js
// ============================================================

class BuyerPage {

    static lista = [];
    static szuro = "aktiv";         // aktiv | mind | lezart
    static nyitottSzal = null;      // ingatlan_id: a kinyitott üzenetváltás

    static show() {

        const box = document.getElementById("erdeklodesContent");
        if (!box) return;
        if (!BuyerPage.lista.length) box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        Svc.api("/api/megbizas/vevo").then(lista => {
            BuyerPage.lista = lista;
            BuyerPage.rajzol(box);
        }).catch(() => { box.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`; });

    }

    static frissit() {
        BuyerPage.show();
        AuthManager.refresh();
    }

    static hely(x) {
        return [x.cim, x.telepules, x.kerulet, x.varos ? CityManager.displayName(x.varos) : ""].filter(Boolean).join(", ") || Types.label(x.tipus);
    }

    static aktivE(x) {
        return ["elerheto", "te_veszed"].includes(x.allapot);
    }

    // ---------- Az oldal ----------

    static rajzol(box) {

        const esc = Utils.escape;
        const lista = BuyerPage.lista;

        const fej = `
            <header class="byHead">
                <div>
                    <h1 class="h3 mb-1"><i class="fa-solid fa-house-circle-check" aria-hidden="true"></i> ${I18n.t("by_cim")}</h1>
                    <p class="text-body-secondary mb-0">${I18n.t("by_alcim")}</p>
                </div>
                <nav class="byLinkek" aria-label="${esc(I18n.t("by_kapcsolodo"))}">
                    <a href="#favorites"><i class="fa-solid fa-star" aria-hidden="true"></i> ${I18n.t("menuKedvencek")}</a>
                    <a href="#fiok/keresesek"><i class="fa-solid fa-bookmark" aria-hidden="true"></i> ${I18n.t("accTabSearches")}</a>
                    <a href="#fiok/igenyek"><i class="fa-solid fa-bullhorn" aria-hidden="true"></i> ${I18n.t("accTabRequests")}</a>
                    <a href="#fiok/uzenetek"><i class="fa-solid fa-envelope" aria-hidden="true"></i> ${I18n.t("accTabMessages")}</a>
                </nav>
            </header>`;

        if (!lista.length) {
            box.innerHTML = fej + `
                <div class="card byUres">
                    <div class="card-body">
                        <h2 class="h5">${I18n.t("by_uresCim")}</h2>
                        <p class="text-body-secondary">${I18n.t("by_uresSzoveg")}</p>
                        <ol class="byLepesek">
                            <li><b>${I18n.t("by_lepes1")}</b><span>${I18n.t("by_lepes1Sugo")}</span></li>
                            <li><b>${I18n.t("by_lepes2")}</b><span>${I18n.t("by_lepes2Sugo")}</span></li>
                            <li><b>${I18n.t("by_lepes3")}</b><span>${I18n.t("by_lepes3Sugo")}</span></li>
                        </ol>
                        <div class="d-flex flex-wrap gap-2 mt-3">
                            <a class="btn btn-primary" href="#properties"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> ${I18n.t("by_bongeszes")}</a>
                            <a class="btn btn-outline-secondary" href="#favorites"><i class="fa-solid fa-star" aria-hidden="true"></i> ${I18n.t("menuKedvencek")}</a>
                        </div>
                    </div>
                </div>`;
            return;
        }

        const radVar = lista.filter(x => x.teendok.length);
        const db = { aktiv: lista.filter(BuyerPage.aktivE).length, lezart: lista.filter(x => !BuyerPage.aktivE(x)).length, mind: lista.length };
        if (!db[BuyerPage.szuro]) BuyerPage.szuro = "mind";
        const lathato = lista.filter(x => BuyerPage.szuro === "mind" || (BuyerPage.szuro === "aktiv") === BuyerPage.aktivE(x));

        box.innerHTML = fej + `
            ${radVar.length ? `
            <section class="mb-4" aria-labelledby="byRadVar">
                <h2 class="h5 mb-2" id="byRadVar">${I18n.t("el_radVar")} <span class="badge text-bg-danger">${radVar.reduce((s, x) => s + x.teendok.length, 0)}</span></h2>
                ${radVar.map(x => BuyerPage.teendoKartya(x)).join("")}
            </section>` : ""}

            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                <h2 class="h5 mb-0">${I18n.t("by_ingatlanok")}</h2>
                <div class="btn-group btn-group-sm" role="group" aria-label="${esc(I18n.t("dk_szures"))}">
                    ${["aktiv", "lezart", "mind"].map(k => `<button type="button" class="btn ${BuyerPage.szuro === k ? "btn-dark" : "btn-outline-secondary"}" data-by-szuro="${k}">${I18n.t("by_sz_" + k)} ${db[k]}</button>`).join("")}
                </div>
            </div>
            <div class="byLista">${lathato.map(x => BuyerPage.kartya(x)).join("") || `<p class="text-body-secondary">${I18n.t("by_nincsIlyen")}</p>`}</div>`;

        box.querySelectorAll("[data-by-szuro]").forEach(b => { b.onclick = () => { BuyerPage.szuro = b.dataset.bySzuro; BuyerPage.rajzol(box); }; });
        BuyerPage.kot(box);

        if (BuyerPage.nyitottSzal) BuyerPage.szal(box, BuyerPage.nyitottSzal);

    }

    // ---------- „Rád vár” ----------

    static teendoKartya(x) {
        const esc = Utils.escape;
        return x.teendok.map(t => {
            if (t.kod === "ellenajanlat") {
                const a = x.ajanlatok.find(y => y.id === t.ajanlat_id);
                if (!a) return "";
                return `
                    <div class="card elRadVar mb-3"><div class="card-body">
                        <span class="elRadVarCimke">${I18n.t("by_rv_ellen")}</span>
                        <div class="d-flex flex-wrap gap-3 align-items-start">
                            ${BuyerPage.kep(x, "byKepKicsi")}
                            <div class="flex-fill min-w-0">
                                <h3 class="h6 mb-1"><a href="#listing/${x.ingatlan_id}">${esc(BuyerPage.hely(x))}</a></h3>
                                <div class="byEllen">
                                    <div><span>${I18n.t("lmMyOffer")}</span><b>${esc(Svc.penz(a.osszeg, a.penznem))}</b></div>
                                    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                                    <div><span>${I18n.t("lmSellerCounter")}</span><b class="text-primary">${esc(Svc.penz(a.ellenajanlat, a.penznem))}</b></div>
                                </div>
                                ${a.elado_valasz ? `<div class="small elIdezet mt-2">„${esc(a.elado_valasz)}”</div>` : ""}
                                <div class="d-flex flex-wrap gap-2 mt-3">
                                    <button type="button" class="btn btn-success" data-by-elfogad="${x.ingatlan_id}:${a.id}"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("lmAcceptCounter")}</button>
                                    ${x.ajanlhat ? `<button type="button" class="btn btn-outline-primary" data-by-ajanlat="${x.ingatlan_id}">${I18n.t("lmNewOffer")}</button>` : ""}
                                    <button type="button" class="btn btn-outline-danger" data-by-visszavon="${x.ingatlan_id}:${a.id}">${I18n.t("by_elutasitom")}</button>
                                </div>
                                <p class="small text-body-secondary mt-2 mb-0">${I18n.t("by_ellenSugo")}</p>
                            </div>
                        </div>
                    </div></div>`;
            }
            if (t.kod === "uzenet") {
                return `
                    <div class="card elRadVar mb-3"><div class="card-body d-flex flex-wrap gap-3 align-items-center">
                        <div class="flex-fill min-w-0">
                            <span class="elRadVarCimke">${I18n.t("by_rv_uzenet")}</span>
                            <div><b>${esc(I18n.f("by_ujUzenet", { n: t.n }))}</b> · <a href="#listing/${x.ingatlan_id}">${esc(BuyerPage.hely(x))}</a></div>
                        </div>
                        <button type="button" class="btn btn-primary" data-by-szal="${x.ingatlan_id}"><i class="fa-regular fa-comments" aria-hidden="true"></i> ${I18n.t("by_elolvasom")}</button>
                    </div></div>`;
            }
            return "";
        }).join("");
    }

    static kep(x, cls) {
        return `<a class="${cls}" href="#listing/${x.ingatlan_id}" aria-hidden="true" tabindex="-1">${x.elso_kep ? `<img src="/api/kepek/${x.elso_kep}" alt="" loading="lazy">` : `<i class="fa-solid fa-house"></i>`}</a>`;
    }

    // ---------- Egy ingatlan ----------

    static lepes(x) {
        // 0: érdeklődik, 1: van időpontja, 2: megnézte, 3: ajánlatot tett, 4: adásvétel
        if (["te_veszed", "megvetted"].includes(x.allapot)) return 4;
        if (x.ajanlatok.some(a => !["visszavonva"].includes(a.statusz))) return 3;
        if (x.megtekintesek.some(t => t.statusz === "megtortent")) return 2;
        if (x.megtekintesek.some(t => ["egyeztetve", "kert"].includes(t.statusz))) return 1;
        return 0;
    }

    static kartya(x) {

        const esc = Utils.escape;
        const most = Date.now();
        const elo = x.megtekintesek.find(t => t.statusz === "egyeztetve" && t.idopont && new Date(t.idopont).getTime() > most - 2 * 3600 * 1000);
        const varol = x.megtekintesek.find(t => t.statusz === "kert");
        const megnezte = x.megtekintesek.find(t => t.statusz === "megtortent");
        const nyitottAj = x.ajanlatok.filter(a => ["tovabbitva", "ellenajanlat"].includes(a.statusz));
        const lepes = BuyerPage.lepes(x);
        const aktiv = BuyerPage.aktivE(x);
        const allapotSzin = { elerheto: "text-bg-success", te_veszed: "text-bg-primary", megvetted: "text-bg-primary", foglalt: "text-bg-warning", eladva: "text-bg-secondary", lezarva: "text-bg-secondary" }[x.allapot];

        const megtekintes = elo ? `
            <div class="bySor">
                <i class="fa-regular fa-calendar-check text-primary" aria-hidden="true"></i>
                <div class="flex-fill">
                    <b>${esc(Svc.ido(elo.idopont))}</b> <span class="text-body-secondary small">· ${I18n.t("vv_foglalasod")}</span>
                    <div class="d-flex flex-wrap gap-2 mt-1">
                        <a class="btn btn-sm btn-outline-secondary" href="/api/megbizas/megtekintes/${elo.id}/ics"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${I18n.t("nt_naptarba")}</a>
                        ${elo.lemondhato ? `
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-by-foglal="${x.ingatlan_id}">${I18n.t("nt_athelyez")}</button>
                            <button type="button" class="btn btn-sm btn-link text-danger" data-by-lemond="${x.ingatlan_id}:${elo.id}">${I18n.t("nt_lemond")}</button>` : `<span class="small text-body-secondary">${I18n.t("vv_mostMarNem")}</span>`}
                    </div>
                </div>
            </div>` : varol ? `
            <div class="bySor">
                <i class="fa-solid fa-hourglass-half text-warning" aria-hidden="true"></i>
                <div class="flex-fill">
                    <b>${I18n.t("vv_varolistan")}</b>${varol.javasolt ? ` <span class="small text-body-secondary">· ${esc(varol.javasolt)}</span>` : ""}
                    <div><button type="button" class="btn btn-sm btn-link text-danger p-0" data-by-lemond="${x.ingatlan_id}:${varol.id}">${I18n.t("vv_varolistaLe")}</button></div>
                </div>
            </div>` : megnezte ? `
            <div class="bySor">
                <i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i>
                <div class="flex-fill"><b>${I18n.t("by_megnezted")}</b> <span class="small text-body-secondary">· ${esc(Svc.ido(megnezte.idopont))}</span></div>
            </div>` : "";

        const ajanlatok = x.ajanlatok.length ? `
            <ul class="byAjanlatok">
                ${x.ajanlatok.slice(0, 4).map(a => `
                    <li class="st-${esc(a.statusz)}">
                        <i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i>
                        <span class="flex-fill">${I18n.t("lmMyOffer")}: <b>${esc(Svc.penz(a.osszeg, a.penznem))}</b>${a.statusz === "ellenajanlat" ? ` → ${I18n.t("lmSellerCounter")}: <b>${esc(Svc.penz(a.ellenajanlat, a.penznem))}</b>` : ""}${a.vegso_osszeg && a.statusz === "elfogadva" ? ` → <b>${esc(Svc.penz(a.vegso_osszeg, a.penznem))}</b>` : ""}
                            <small class="d-block text-body-secondary">${esc(I18n.t("lmOf_" + a.statusz))}${a.ervenyes_ig && a.statusz === "tovabbitva" ? " · " + esc(I18n.f("aj_ervenyesRov", { ido: Svc.ido(a.ervenyes_ig) })) : ""}</small>
                        </span>
                        ${a.statusz === "tovabbitva" ? `<button type="button" class="btn btn-sm btn-link text-danger p-0" data-by-visszavon="${x.ingatlan_id}:${a.id}">${I18n.t("lmWithdraw")}</button>` : ""}
                    </li>`).join("")}
            </ul>` : "";

        // Mi a következő lépése
        let kov = "";
        if (x.allapot === "te_veszed") kov = I18n.t("by_kov_adasvetel");
        else if (x.allapot === "megvetted") kov = I18n.t("by_kov_megvetted");
        else if (x.allapot === "foglalt") kov = I18n.t("by_kov_foglalt");
        else if (!aktiv) kov = I18n.t("by_kov_lezart");
        else if (nyitottAj.some(a => a.statusz === "ellenajanlat")) kov = I18n.t("by_kov_ellen");
        else if (nyitottAj.length) kov = I18n.t("by_kov_ajanlatVar");
        else if (x.ajanlhat) kov = I18n.t("by_kov_ajanlhat");
        else if (elo) kov = I18n.t("by_kov_megtekintes");
        else if (varol) kov = I18n.t("by_kov_varolista");
        else if (x.naptar) kov = I18n.t("by_kov_foglalj");
        else kov = I18n.t("by_kov_kerdezz");

        const gombok = aktiv ? `
            ${x.naptar && !elo && !megnezte && x.allapot === "elerheto" ? `<button type="button" class="btn btn-sm btn-primary" data-by-foglal="${x.ingatlan_id}"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${I18n.t("by_idopontFoglal")}</button>` : ""}
            ${x.ajanlhat && !nyitottAj.length ? `<button type="button" class="btn btn-sm btn-primary" data-by-ajanlat="${x.ingatlan_id}"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("vv_ajanlatotTeszek")}</button>` : ""}` : "";

        return `
            <article class="card byKartya ${aktiv ? "" : "lezart"}" id="by-${x.ingatlan_id}">
                <div class="card-body">
                    <div class="byFelso">
                        ${BuyerPage.kep(x, "byKep")}
                        <div class="flex-fill min-w-0">
                            <div class="d-flex flex-wrap justify-content-between gap-2">
                                <h3 class="h6 mb-0"><a href="#listing/${x.ingatlan_id}">${esc(BuyerPage.hely(x))}</a></h3>
                                <span class="badge ${allapotSzin}">${I18n.t("by_al_" + x.allapot)}</span>
                            </div>
                            <div class="small text-body-secondary">${esc(Types.label(x.tipus))}${x.szobak ? " · " + esc(I18n.f("dk_szoba", { n: x.szobak })) : ""}${x.nm ? " · " + esc(Utils.nm(x.nm)) : ""}${x.ar ? " · " + esc(Svc.penz(x.ar, x.penznem)) : ""}</div>
                            <ol class="byUt" aria-label="${esc(I18n.t("by_hol"))}">
                                ${["by_ut1", "by_ut2", "by_ut3", "by_ut4"].map((k, i) => `<li class="${lepes > i + 1 || (lepes === 4 && i === 3) ? "kesz" : lepes === i + 1 ? "most" : ""}">${I18n.t(k)}</li>`).join("")}
                            </ol>
                        </div>
                    </div>
                    <div class="byKov"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${esc(kov)}</div>
                    ${megtekintes}
                    ${ajanlatok}
                    <div class="d-flex flex-wrap gap-2 mt-3">
                        ${gombok}
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-by-szal="${x.ingatlan_id}"><i class="fa-regular fa-comments" aria-hidden="true"></i> ${I18n.t("el_uzenetek")}${x.olvasatlan ? ` <span class="badge text-bg-danger">${x.olvasatlan}</span>` : ""}</button>
                        <a class="btn btn-sm btn-link" href="#listing/${x.ingatlan_id}">${I18n.t("by_hirdetes")} →</a>
                    </div>
                    <div class="bySzal" id="bySzal-${x.ingatlan_id}" hidden></div>
                </div>
            </article>`;

    }

    // ---------- Műveletek ----------

    static kot(box) {

        const hibaJel = e => MandateDesk.jelez(Svc.hiba(e), "danger");
        const ugras = (id, mit) => { ListingMandate.cel = { id: Number(id), mit }; location.hash = "#listing/" + id; };

        box.querySelectorAll("[data-by-foglal]").forEach(b => { b.onclick = () => ugras(b.dataset.byFoglal, "foglal"); });
        box.querySelectorAll("[data-by-ajanlat]").forEach(b => { b.onclick = () => ugras(b.dataset.byAjanlat, "ajanlat"); });

        box.querySelectorAll("[data-by-elfogad]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("lmAcceptCounterConfirm"))) return;
                const [iid, aid] = b.dataset.byElfogad.split(":");
                b.disabled = true;
                Svc.api(`/api/megbizas/hirdetes/${iid}/ajanlat/${aid}/elfogad`, { method: "POST" })
                    .then(() => { MandateDesk.jelez(I18n.t("by_elfogadvaOk")); BuyerPage.frissit(); })
                    .catch(e => { b.disabled = false; hibaJel(e); });
            };
        });
        box.querySelectorAll("[data-by-visszavon]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("lmWithdrawConfirm"))) return;
                const [iid, aid] = b.dataset.byVisszavon.split(":");
                b.disabled = true;
                Svc.api(`/api/megbizas/hirdetes/${iid}/ajanlat/${aid}/visszavon`, { method: "POST" })
                    .then(() => { MandateDesk.jelez(I18n.t("adsSaved")); BuyerPage.frissit(); })
                    .catch(e => { b.disabled = false; hibaJel(e); });
            };
        });
        box.querySelectorAll("[data-by-lemond]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("lmCancelConfirm"))) return;
                const [iid, tid] = b.dataset.byLemond.split(":");
                b.disabled = true;
                Svc.api(`/api/megbizas/hirdetes/${iid}/megtekintes/${tid}/lemond`, { method: "POST" })
                    .then(() => { MandateDesk.jelez(I18n.t("adsSaved")); BuyerPage.frissit(); })
                    .catch(e => { b.disabled = false; hibaJel(e); });
            };
        });
        box.querySelectorAll("[data-by-szal]").forEach(b => {
            b.onclick = () => {
                const id = Number(b.dataset.bySzal);
                if (BuyerPage.nyitottSzal === id) {
                    BuyerPage.nyitottSzal = null;
                    const el = box.querySelector("#bySzal-" + id);
                    if (el) el.hidden = true;
                    return;
                }
                BuyerPage.nyitottSzal = id;
                BuyerPage.szal(box, id, true);
            };
        });

    }

    // Az üzenetváltás az ügyintézővel (megnyitáskor olvasottnak jelöli)
    static szal(box, id, gorget) {

        const esc = Utils.escape;
        const el = box.querySelector("#bySzal-" + id);
        if (!el) return;
        el.hidden = false;
        el.innerHTML = `<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;
        if (gorget) box.querySelector("#by-" + id).scrollIntoView({ block: "nearest", behavior: "smooth" });

        Svc.api("/api/megbizas/hirdetes/" + id).then(v => {
            const uz = v.uzenetek || [];
            el.innerHTML = `
                <div class="mdBubbles byBubbles">
                    ${uz.length ? uz.map(z => `
                        <div class="mdBubble ${z.irany === "be" ? "ki" : "be"}">
                            <div class="mdBubbleText">${esc(z.szoveg)}</div>
                            <small>${z.irany === "be" ? I18n.t("by_te") : I18n.t("el_ugyintezod")} · ${esc(Svc.ido(z.created_at))}</small>
                        </div>`).join("") : `<p class="small text-body-secondary mb-0">${I18n.t("by_nincsUzenet")}</p>`}
                </div>
                <div class="input-group mt-2">
                    <input class="form-control" id="byUz-${id}" maxlength="2000" placeholder="${esc(I18n.t("by_irjPh"))}" aria-label="${esc(I18n.t("by_irjPh"))}">
                    <button class="btn btn-primary" type="button" id="byUzKuld-${id}" aria-label="${esc(I18n.t("by_kuld"))}"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
                </div>`;
            const lista = el.querySelector(".byBubbles");
            lista.scrollTop = lista.scrollHeight;
            const inp = el.querySelector("#byUz-" + id);
            const gomb = el.querySelector("#byUzKuld-" + id);
            const u = AuthManager.user || {};
            const erd = v.erdeklodo || {};
            const kuld = () => {
                const szoveg = inp.value.trim();
                if (!szoveg) return;
                gomb.disabled = true;
                Svc.api(`/api/megbizas/hirdetes/${id}/uzenet`, { method: "POST", body: { szoveg, nev: erd.nev || u.nev, telefon: erd.telefon || u.telefon, email: u.email } })
                    .then(() => BuyerPage.szal(box, id))
                    .catch(e => { gomb.disabled = false; MandateDesk.jelez(Svc.hiba(e), "danger"); });
            };
            gomb.onclick = kuld;
            inp.onkeydown = e => { if (e.key === "Enter") kuld(); };
            // Olvasottnak jelölte: a jelvények frissítése
            const x = BuyerPage.lista.find(y => y.ingatlan_id === id);
            if (x && x.olvasatlan) {
                x.olvasatlan = 0;
                x.teendok = x.teendok.filter(t => t.kod !== "uzenet");
                AuthManager.refresh();
                BuyerPage.rajzol(box);      // a „Rád vár” kártya eltűnik (a beszélgetés nyitva marad)
            }
        }).catch(() => { el.innerHTML = `<div class="alert alert-danger mb-0">${I18n.t("alertLoadError")}</div>`; });

    }

}

// ===================== BEKÖTÉS: oldal =====================

document.addEventListener("DOMContentLoaded", () => {

    PageManager.PAGES.erdeklodes = { icon: "fa-solid fa-house-circle-check", label: "by_cim", login: true };
    if (!PageManager.LOGIN_KELL.includes("erdeklodes")) PageManager.LOGIN_KELL.push("erdeklodes");

    const show = PageManager.show;
    PageManager.show = function (target, opts = {}) {
        const t = String(target || "").replace(/^#/, "");
        const r = show.call(this, target, opts);
        if (PageManager.current === "erdeklodes" && /^erdeklodes/.test(t)) BuyerPage.show();
        return r;
    };

});
