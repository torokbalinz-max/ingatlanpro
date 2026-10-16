// ============================================================
//  Ingatlanom eladása (#eladas) – az eladó oldala
//
//  A menüben (a fejlécben, jól látható helyen) annak jelenik meg, akinek
//  van megbízása; a jelvény azt mutatja, hány dolog vár rá.
//
//  Egy megbízás (ha több van, fent választható):
//    - fejléc: cím, szám, mióta hirdetjük, kért ár, az ügyintéző
//    - a hét szakasz sávja és a számok (látogatás, érdeklődő, megtekintés, ajánlat)
//    - „Rád vár”: a csomag jóváhagyása, a szerződés aláírása (online, e-mailben
//      kapott kóddal – vagy személyesen), a hirdetés jóváhagyása, a válaszra
//      váró ajánlatok, a hiányzó iratok feltöltése
//    - Megtekintések (a vevők név nélkül: „Vevő #3”) és a visszajelzések
//    - Szerződés és iratok (az aláírt példány itt marad letölthetően)
//    - Ajánlatok, adásvétel, üzenetek, napló
//
//  Szerver: /api/megbizas/sajat/... (server/routes/megbizas.js)
// ============================================================

class SellerPage {

    static lista = [];
    static valasztott = null;

    static show(param) {

        const box = document.getElementById("eladasContent");
        if (!box) return;
        if (param && /^\d+$/.test(param)) SellerPage.valasztott = Number(param);
        if (!SellerPage.lista.length) box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        Svc.api("/api/megbizas/sajat").then(lista => {
            SellerPage.lista = lista;
            SellerPage.rajzol(box);
        }).catch(() => { box.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`; });

    }

    static frissit() {
        SellerPage.show();
        AuthManager.refresh();
    }

    static rajzol(box) {

        const esc = Utils.escape;
        const lista = SellerPage.lista;

        if (!lista.length) {
            box.innerHTML = `
                <div class="emptyState">
                    <i class="fa-solid fa-key"></i>
                    <h5>${I18n.t("mmNone")}</h5>
                    <p>${I18n.t("mmNoneText")}</p>
                    <a class="btn btn-primary" href="#eladjuk">${I18n.t("menuEladjuk")}</a>
                </div>`;
            return;
        }

        let m = lista.find(x => x.id === SellerPage.valasztott) || lista[0];
        SellerPage.valasztott = m.id;
        const lezart = ["lezarva", "elutasitva"].includes(m.statusz);
        const napja = m.hirdetve ? Math.floor((Date.now() - new Date(m.hirdetve)) / 86400000) + 1 : null;

        box.innerHTML = `
            ${lista.length > 1 ? `
            <nav class="elValaszto mb-3" aria-label="${esc(I18n.t("el_megbizasaim"))}">
                ${lista.map(x => `<button type="button" class="btn btn-sm ${x.id === m.id ? "btn-dark" : "btn-outline-secondary"}" data-el-mb="${x.id}">${esc(x.cim || Types.label(x.tipus))}${x.teendok.length ? ` <span class="badge text-bg-danger">${x.teendok.length}</span>` : ""}</button>`).join("")}
            </nav>` : ""}

            <section class="card elFej mb-4">
                <div class="card-body">
                    <div class="d-flex flex-wrap gap-3 justify-content-between align-items-center">
                        <div class="min-w-0">
                            <h1 class="h3 mb-1">${esc(m.cim || [m.telepules, m.varos ? CityManager.displayName(m.varos) : ""].filter(Boolean).join(", ") || Types.label(m.tipus))} · ${esc(Types.label(m.tipus))}${m.szobak ? ", " + esc(I18n.f("dk_szoba", { n: m.szobak })) : ""}</h1>
                            <div class="text-body-secondary small">${I18n.t("el_megbizas")} ${esc(m.szerzodes_szam || "")}${napja !== null ? " · " + esc(I18n.f("el_hirdetveNapja", { n: napja })) : ""}${m.kert_ar ? ` · ${I18n.t("sfPrice")}: <b>${esc(Svc.penz(m.kert_ar, m.penznem))}</b>` : ""}</div>
                        </div>
                        ${m.felelos ? `
                        <div class="elUgyintezo">
                            <span class="elAvatar" aria-hidden="true"><i class="fa-solid fa-user-tie"></i></span>
                            <div><b>${esc(m.felelos.nev || "")}</b> · ${I18n.t("el_ugyintezod")}
                                <div class="small">${m.felelos.telefon ? `<a href="tel:${esc(String(m.felelos.telefon).replace(/\s/g, ""))}">${esc(m.felelos.telefon)}</a> · ` : ""}<button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-el-ful="uzenetek">${I18n.t("el_uzenet")}</button></div>
                            </div>
                        </div>` : ""}
                    </div>
                    ${lezart ? `<div class="mt-3"><span class="badge mbBadge mb-${esc(m.statusz)}">${esc(MandateDesk.szakaszNev(m.statusz))}</span></div>` : `<div class="mt-3">${MandateDesk.sav(m.statusz)}</div>`}
                    ${m.statusz === "eladva" ? `<div class="alert alert-success mt-3 mb-0"><i class="fa-solid fa-champagne-glasses" aria-hidden="true"></i> ${I18n.f("el_eladva", { datum: Svc.nap(m.eladva), ar: m.eladasi_ar ? Svc.penz(m.eladasi_ar, m.penznem) : "" })}</div>` : ""}
                    <div class="elSzamok mt-3">
                        <div><b>${m.stat.latogatas}</b><span>${I18n.t("el_statLatogatas")}</span></div>
                        <div><b>${m.stat.erdeklodok}</b><span>${I18n.t("el_statErdeklodo")}</span></div>
                        <div><b>${m.stat.megtekintes}</b><span>${I18n.t("el_statMegtekintes")}</span></div>
                        <div><b>${m.stat.ajanlat}</b><span>${I18n.t("el_statAjanlat")}</span></div>
                    </div>
                </div>
            </section>

            <section class="mb-4" aria-labelledby="elRadVar">
                <h2 class="h5 mb-2" id="elRadVar">${I18n.t("el_radVar")} ${m.teendok.length ? `<span class="badge text-bg-danger">${m.teendok.length}</span>` : ""}</h2>
                ${m.teendok.length ? m.teendok.map(t => SellerPage.teendoKartya(m, t)).join("") : `
                <div class="card"><div class="card-body d-flex gap-2 align-items-start">
                    <i class="fa-solid fa-circle-check text-success mt-1" aria-hidden="true"></i>
                    <div><b>${I18n.t("el_nincsTeendo")}</b><div class="small text-body-secondary">${esc(SellerPage.mostMi(m))}</div></div>
                </div></div>`}
            </section>

            <div class="row g-4">
                <div class="col-lg-6">
                    <section class="card h-100">
                        <div class="card-header"><h2 class="h5 mb-0">${I18n.t("mmViewings")}</h2></div>
                        <div class="card-body">${SellerPage.megtekintesek(m)}</div>
                    </section>
                </div>
                <div class="col-lg-6">
                    <section class="card h-100">
                        <div class="card-header"><h2 class="h5 mb-0">${I18n.t("el_szerzodesIratok")}</h2></div>
                        <div class="card-body">${SellerPage.szerzodesIratok(m)}</div>
                    </section>
                </div>
                ${m.ajanlatok.length ? `
                <div class="col-12">
                    <section class="card">
                        <div class="card-header"><h2 class="h5 mb-0">${I18n.t("mmOffers")}</h2></div>
                        <div class="card-body">${m.ajanlatok.map(a => SellerPage.ajanlatKartya(m, a, false)).join("")}</div>
                    </section>
                </div>` : ""}
                ${["adasvetel", "eladva"].includes(m.statusz) ? `
                <div class="col-12">
                    <section class="card">
                        <div class="card-header"><h2 class="h5 mb-0">${I18n.t("av_cim")}</h2></div>
                        <div class="card-body">
                            <ol class="avLista mb-0">
                                <li class="kesz"><b>${I18n.t("av_ajanlat")}</b>${m.eladasi_ar ? ` – ${esc(Svc.penz(m.eladasi_ar, m.penznem))}` : ""}</li>
                                <li class="${m.eloszerzodes_datum ? "kesz" : ""}"><b>${I18n.t("av_eloszerzodes")}</b>${m.eloszerzodes_datum ? ` – ${esc(Svc.nap(m.eloszerzodes_datum))}` : ""}${m.foglalo ? ` · ${esc(I18n.f("aj_foglaloRov", { osszeg: Svc.penz(m.foglalo, m.penznem) }))}` : ""}</li>
                                <li class="${m.iratok.every(x => x.allapot === "ellenorizve" || x.allapot === "mi_intezzuk") ? "kesz" : ""}"><b>${I18n.t("av_iratok")}</b></li>
                                <li class="${m.kozjegyzo_idopont ? "kesz" : ""}"><b>${I18n.t("av_kozjegyzo")}</b>${m.kozjegyzo_idopont ? ` – ${esc(Svc.ido(m.kozjegyzo_idopont))}${m.kozjegyzo ? " · " + esc(m.kozjegyzo) : ""}` : ""}</li>
                                <li class="${m.statusz === "eladva" ? "kesz" : ""}"><b>${I18n.t("av_alairas")}</b>${m.kulcsatadas ? ` · ${I18n.t("av_kulcs")}: ${esc(Svc.nap(m.kulcsatadas))}` : ""}</li>
                            </ol>
                        </div>
                    </section>
                </div>` : ""}
                <div class="col-lg-7" id="elUzenetek">
                    <section class="card h-100">
                        <div class="card-header"><h2 class="h5 mb-0">${I18n.t("el_uzenetek")}</h2></div>
                        <div class="card-body">
                            <div class="mdBubbles mmBubbles">
                                ${m.uzenetek.length ? m.uzenetek.map(z => `
                                    <div class="mdBubble ${z.irany === "be" ? "ki" : "be"}">
                                        <div class="mdBubbleText">${esc(z.szoveg)}</div>
                                        <small>${z.irany === "ki" ? esc(z.szerzo || "IngatlanPro") + " · " : ""}${esc(Svc.ido(z.created_at))}</small>
                                    </div>`).join("") : `<p class="text-body-secondary small text-center my-3">${I18n.t("mmNoMessages")}</p>`}
                            </div>
                            ${!lezart ? `
                            <div class="mt-2">
                                <textarea class="form-control" rows="2" maxlength="4000" id="elUz" placeholder="${esc(I18n.t("mmWritePh"))}" aria-label="${esc(I18n.t("mmWritePh"))}"></textarea>
                                <div class="text-end mt-2"><button type="button" class="btn btn-sm btn-primary" id="elUzKuld"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t("lmSend")}</button></div>
                            </div>` : ""}
                        </div>
                    </section>
                </div>
                <div class="col-lg-5">
                    <section class="card h-100">
                        <div class="card-header"><h2 class="h5 mb-0">${I18n.t("mmTimeline")}</h2></div>
                        <div class="card-body">
                            ${m.naplo.length ? `<ul class="mmList elNaplo">${m.naplo.slice(0, 40).map(n => `<li><span class="small text-body-secondary">${esc(Svc.ido(n.created_at))}</span> · ${n.tipus === "statusz" ? `<b>${esc(MandateDesk.szakaszNev(n.szoveg))}</b>` : esc(n.szoveg)}</li>`).join("")}</ul>` : `<p class="text-body-secondary small mb-0">–</p>`}
                            ${["uj", "egyeztetes"].includes(m.statusz) ? `<button type="button" class="btn btn-sm btn-link text-danger px-0 mt-2" id="elVisszavon">${I18n.t("mmWithdraw")}</button>` : ""}
                        </div>
                    </section>
                </div>
            </div>`;

        SellerPage.kot(box, m);

        // Az üzenetek olvasottak, ha megnyitotta az oldalt
        if (m.olvasatlan) Svc.api(`/api/megbizas/sajat/${m.id}/olvasva`, { method: "POST" }).then(() => AuthManager.refresh()).catch(() => { });
        const bub = box.querySelector(".mmBubbles");
        if (bub) bub.scrollTop = bub.scrollHeight;

    }

    // Mit csinálunk most (ha az eladóra semmi nem vár)
    static mostMi(m) {
        const k = m.kovetkezo || {};
        if (k.kod === "feladat" && m.fotozas_idopont) return I18n.f("el_most_fotozas", { ido: Svc.ido(m.fotozas_idopont) });
        const s = I18n.t("el_most_" + (k.kod || ""));
        return s !== "el_most_" + (k.kod || "") ? s : I18n.t("el_most_alap");
    }

    // ---------- A „Rád vár” kártyák ----------

    static teendoKartya(m, t) {

        const esc = Utils.escape;

        if (t.kod === "csomag") {
            return `
                <div class="card elRadVar mb-3"><div class="card-body">
                    <span class="elRadVarCimke">${I18n.t("el_rv_csomag")}</span>
                    <h3 class="h5">${I18n.t("el_csomagCim")}</h3>
                    <p class="small text-body-secondary">${I18n.t("el_csomagSugo")}</p>
                    <ul class="elCsomag">${m.opciok.map(o => `<li><i class="${esc(o.ikon || "fa-solid fa-check")}" aria-hidden="true"></i> ${esc(Svc.t(o.nev))}${o.ar > 0 ? ` <span class="text-body-secondary">(${esc(Svc.penz(o.ar, o.penznem))})</span>` : ""}</li>`).join("")}</ul>
                    <div class="elKv">
                        <div><span>${I18n.t("cs_indulAr")}</span><b>${m.kert_ar ? esc(Svc.penz(m.kert_ar, m.penznem)) : "–"}</b></div>
                        <div><span>${I18n.t("mbCommission")}</span><b>${m.jutalek !== null ? esc(Utils.num(m.jutalek, 1)) + "%" : "–"}${m.minimum_dij ? ` · ${I18n.t("el_legalabb")} ${esc(Svc.penz(m.minimum_dij, m.penznem))}` : ""}</b></div>
                        ${m.fix_dij ? `<div><span>${I18n.t("mbFixFee")}</span><b>${esc(Svc.penz(m.fix_dij, m.penznem))}</b></div>` : ""}
                        <div><span>${I18n.t("mbDuration")}</span><b>${esc(I18n.f("el_honap", { n: m.idotartam_honap || 6 }))}${m.kizarolagos ? " · " + I18n.t("mbExclusive") : ""}</b></div>
                    </div>
                    <div class="d-flex flex-wrap gap-2 mt-3">
                        <button type="button" class="btn btn-primary" data-el-lep="csomag-jovahagy"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("el_jovahagyom")}</button>
                        <button type="button" class="btn btn-outline-secondary" data-el-ful="uzenetek">${I18n.t("el_kerdesemVan")}</button>
                    </div>
                </div></div>`;
        }

        if (t.kod === "szerzodes") {
            return `
                <div class="card elRadVar elSzerzodes mb-3"><div class="card-body">
                    <span class="elRadVarCimke">${I18n.t("el_rv_szerzodes")}</span>
                    <h3 class="h5">${I18n.t("el_szerzodesCim")}</h3>
                    <div class="row g-3">
                        <div class="col-lg-7">
                            <p class="small">${I18n.t("el_szerzodesSugo")}</p>
                            <a class="btn btn-sm btn-outline-secondary mb-3" href="/api/megbizas/${m.id}/szerzodes" target="_blank" rel="noopener"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> ${I18n.t("mmReadContract")}</a>
                            <label class="d-flex gap-2 align-items-start small mb-2"><input class="form-check-input mt-0 flex-none" type="checkbox" id="elSzOk"><span>${I18n.t("el_elolvastam")}</span></label>
                            <label class="d-flex gap-2 align-items-start small mb-3"><input class="form-check-input mt-0 flex-none" type="checkbox" id="elSzKorai"><span>${I18n.t("el_koraiKezdes")}</span></label>
                            <div id="elKodResz">
                                <button type="button" class="btn btn-primary" id="elKodKer" disabled><i class="fa-solid fa-signature" aria-hidden="true"></i> ${I18n.t("el_alairas")}</button>
                            </div>
                            <p class="small text-body-secondary mt-2 mb-0">${I18n.t("el_alairasNyom")}</p>
                        </div>
                        <div class="col-lg-5">
                            <div class="elSzemelyes">
                                <b>${I18n.t("el_szemelyesCim")}</b>
                                <p class="small mb-2">${I18n.t("el_szemelyesSugo")}</p>
                                <input class="form-control form-control-sm mb-2" id="elSzemJav" maxlength="300" placeholder="${esc(I18n.t("el_szemJavPh"))}" aria-label="${esc(I18n.t("el_szemJav"))}">
                                <button type="button" class="btn btn-sm btn-outline-primary" id="elSzemKer">${I18n.t("el_szemelyesKer")}</button>
                            </div>
                        </div>
                    </div>
                </div></div>`;
        }

        if (t.kod === "hirdetes") {
            return `
                <div class="card elRadVar mb-3"><div class="card-body">
                    <span class="elRadVarCimke">${I18n.t("el_rv_hirdetes")}</span>
                    <h3 class="h5">${I18n.t("el_hirdetesCim")}</h3>
                    <p class="small text-body-secondary">${I18n.t("el_hirdetesSugo")}</p>
                    <div class="d-flex flex-wrap gap-2">
                        ${m.ingatlan_id ? `<a class="btn btn-outline-secondary" href="#listing/${m.ingatlan_id}"><i class="fa-regular fa-eye" aria-hidden="true"></i> ${I18n.t("el_elonezet")}</a>` : ""}
                        <button type="button" class="btn btn-primary" data-el-lep="hirdetes-jovahagy"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("el_jovahagyom")}</button>
                        <button type="button" class="btn btn-outline-secondary" data-el-ful="uzenetek">${I18n.t("el_valtoztatast")}</button>
                    </div>
                </div></div>`;
        }

        if (t.kod === "ajanlat") {
            const a = m.ajanlatok.find(x => x.id === t.id);
            return a ? `<div class="card elRadVar mb-3"><div class="card-body">${SellerPage.ajanlatKartya(m, a, true)}</div></div>` : "";
        }

        if (t.kod === "iratok") {
            const hiany = m.iratok.filter(x => x.allapot === "hiany");
            return `
                <div class="card elRadVar mb-3"><div class="card-body">
                    <span class="elRadVarCimke">${I18n.t("el_rv_iratok")}</span>
                    <h3 class="h5">${I18n.f("el_iratHiany", { n: hiany.length })}</h3>
                    <ul class="elIratLista">${hiany.map(x => `<li><span>${esc(Svc.t(x.nev))}</span><button type="button" class="btn btn-sm btn-outline-primary" data-el-irat="${esc(x.kod)}"><i class="fa-solid fa-upload" aria-hidden="true"></i> ${I18n.t("el_feltoltom")}</button></li>`).join("")}</ul>
                    <p class="small text-body-secondary mb-0">${I18n.t("el_iratSugo")}</p>
                </div></div>`;
        }

        return "";

    }

    static ajanlatKartya(m, a, kiemelt) {
        const esc = Utils.escape;
        const szaz = m.kert_ar ? Math.round((a.osszeg / m.kert_ar - 1) * 1000) / 10 : null;
        const nyitott = a.statusz === "tovabbitva";
        return `
            <div class="elAjanlat ${kiemelt ? "" : "mb-3"} st-${esc(a.statusz)}">
                <div class="d-flex flex-wrap justify-content-between gap-2 align-items-baseline">
                    <div>
                        ${kiemelt ? `<span class="elRadVarCimke">${I18n.t("el_rv_ajanlat")}${a.ervenyes_ig ? " · " + esc(I18n.f("el_valaszoljIg", { ido: Svc.ido(a.ervenyes_ig) })) : ""}</span>` : ""}
                        <div class="fs-3 fw-bold">${esc(Svc.penz(a.osszeg, a.penznem))} ${szaz !== null ? `<span class="fs-6 fw-semibold text-body-secondary">${szaz > 0 ? "+" : ""}${Utils.num(szaz, 1)}% ${I18n.t("dk_kerthez")}</span>` : ""}</div>
                    </div>
                    <span class="small text-body-secondary">${esc(I18n.f("dk_vevoSzam", { n: a.vevo_szam || "?" }))}${a.megnezte ? " · " + esc(I18n.t("el_megnezte")) : ""}</span>
                </div>
                <div class="elKv mt-2">
                    <div><span>${I18n.t("lmFinancing")}</span><b>${esc(MandateDesk.finSzoveg({ ...a, igazolas_id: a.igazolas }))}</b></div>
                    ${a.foglalo ? `<div><span>${I18n.t("aj_foglalo")}</span><b>${esc(Svc.penz(a.foglalo, a.penznem))}</b></div>` : ""}
                    ${a.eloszerzodes_ig ? `<div><span>${I18n.t("av_eloszerzodes")}</span><b>${esc(I18n.f("el_ig", { datum: Svc.nap(a.eloszerzodes_ig) }))}</b></div>` : ""}
                    ${a.kozjegyzo_ig ? `<div><span>${I18n.t("aj_kozjegyzo")}</span><b>${esc(I18n.f("el_ig", { datum: Svc.nap(a.kozjegyzo_ig) }))}</b></div>` : ""}
                </div>
                ${a.feltetelek ? `<div class="small mt-2 elIdezet">„${esc(a.feltetelek)}”</div>` : ""}
                ${a.ellenajanlat ? `<div class="small mt-1">${I18n.t("mmYourCounter")}: <b>${esc(Svc.penz(a.ellenajanlat, a.penznem))}</b></div>` : ""}
                ${a.statusz === "elfogadva" && a.vegso_osszeg ? `<div class="small text-success fw-semibold mt-1">${I18n.t("mdAgreed")}: ${esc(Svc.penz(a.vegso_osszeg, a.penznem))}</div>` : ""}
                ${!kiemelt ? `<span class="badge mt-2 text-bg-${a.statusz === "elfogadva" ? "success" : ["elutasitva", "visszavonva", "lejart"].includes(a.statusz) ? "secondary" : a.statusz === "ellenajanlat" ? "info" : "warning"}">${esc(I18n.t("mmOf_" + a.statusz))}</span>` : ""}
                ${nyitott ? `
                <div class="d-flex flex-wrap gap-2 mt-3">
                    <button type="button" class="btn btn-success" data-valasz="elfogad" data-a="${a.id}"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("mmAccept")}</button>
                    <button type="button" class="btn btn-outline-primary" data-valasz="ellen" data-a="${a.id}"><i class="fa-solid fa-right-left" aria-hidden="true"></i> ${I18n.t("mmCounterBtn")}</button>
                    <button type="button" class="btn btn-outline-secondary" data-valasz="elutasit" data-a="${a.id}">${I18n.t("mmReject")}</button>
                </div>` : ""}
            </div>`;
    }

    static megtekintesek(m) {
        const esc = Utils.escape;
        const most = Date.now();
        const jovo = m.megtekintesek.filter(t => t.statusz === "egyeztetve" && new Date(t.idopont) > most).sort((a, b) => new Date(a.idopont) - new Date(b.idopont));
        const mult = m.megtekintesek.filter(t => ["megtortent", "elmaradt"].includes(t.statusz));
        if (!jovo.length && !mult.length) return `<p class="text-body-secondary small mb-0">${I18n.t(["hirdetes", "targyalas"].includes(m.statusz) ? "el_nincsMegtekintes" : "el_megtekintesKesobb")}</p>`;
        return `
            ${jovo.map(t => `<div class="elMegt"><b>${esc(Svc.ido(t.idopont))}</b><span>${esc(I18n.f("dk_vevoSzam", { n: t.vevo_szam || "?" }))} – ${I18n.t("el_foglalva")}</span></div>`).join("")}
            ${mult.length ? `<div class="${jovo.length ? "border-top pt-2 mt-2" : ""}">${mult.slice(0, 12).map(t => `<div class="elMegt mult"><b>${esc(Svc.nap(t.idopont))}</b><span>${esc(I18n.f("dk_vevoSzam", { n: t.vevo_szam || "?" }))}${t.statusz === "elmaradt" ? " – " + esc(I18n.t("mbVw_elmaradt")) : t.visszajelzes ? ` – „${esc(t.visszajelzes)}”` : ""}</span></div>`).join("")}</div>` : ""}`;
    }

    static szerzodesIratok(m) {
        const esc = Utils.escape;
        const hatalyos = m.szerzodes_allapot === "alairva";
        const szkennelt = (m.fajlok || []).filter(f => f.tipus === "szerzodes_alairt");
        const szerz = m.szerzodes_allapot === "tervezet" ? `<p class="small text-body-secondary">${I18n.t("el_szerzodesMeg")}</p>` : `
            <div class="elSzerzSor ${hatalyos ? "ok" : ""}">
                <div class="flex-fill">
                    <b>${I18n.t(hatalyos ? "el_szerzHatalyos" : m.szerzodes_allapot === "elfogadva" ? "el_szerzAlairtad" : "el_szerzAlairasra")}</b>
                    <div class="small">${m.szerzodes_elfogadva ? esc(I18n.f("el_onlineAlairva", { ido: Svc.ido(m.szerzodes_elfogadva) })) : ""}${m.ellenjegyezve ? " · " + esc(I18n.f("el_ellenjegyezve", { ido: Svc.nap(m.ellenjegyezve) })) : ""}${m.szerzodes_mod === "szemelyes" && m.alairva ? esc(I18n.f("el_szemelyesAlairva", { datum: Svc.nap(m.alairva) })) : ""}</div>
                </div>
                <a class="btn btn-sm btn-outline-secondary" href="/api/megbizas/${m.id}/szerzodes" target="_blank" rel="noopener">${I18n.t(hatalyos ? "el_szerzLetolt" : "mmReadContract")}</a>
            </div>
            ${szkennelt.map(f => `<div class="small mt-1"><a href="/api/megbizas/fajl/${f.id}" target="_blank" rel="noopener"><i class="fa-regular fa-file-pdf" aria-hidden="true"></i> ${esc(f.nev)}</a></div>`).join("")}`;
        return `
            ${szerz}
            <h3 class="h6 mt-3 text-uppercase small text-body-secondary">${I18n.t("mmDocsTitle")}</h3>
            <ul class="elIratLista">
                ${m.iratok.map(x => `
                    <li>
                        <span class="flex-fill">${esc(Svc.t(x.nev))}${x.fajlok.length ? `<br><small>${x.fajlok.map(f => `<a href="/api/megbizas/fajl/${f.id}" target="_blank" rel="noopener">${esc(f.nev)}</a>`).join(", ")}</small>` : ""}${x.megj ? `<br><small class="text-body-secondary">${esc(x.megj)}</small>` : ""}</span>
                        <span class="badge ${{ ellenorizve: "text-bg-success", feltoltve: "text-bg-info", mi_intezzuk: "text-bg-light", hiany: "text-bg-warning" }[x.allapot]}">${I18n.t("ir_" + x.allapot)}</span>
                        ${!["lezarva", "elutasitva", "eladva"].includes(m.statusz) && x.allapot !== "ellenorizve" ? `<button type="button" class="btn btn-sm btn-link p-0" data-el-irat="${esc(x.kod)}" title="${esc(I18n.t("el_feltoltom"))}" aria-label="${esc(I18n.t("el_feltoltom"))}"><i class="fa-solid fa-upload" aria-hidden="true"></i></button>` : ""}
                    </li>`).join("")}
            </ul>
            <p class="small text-body-secondary mb-0">${I18n.t("el_iratAdatvedelem")}</p>`;
    }

    // ---------- Események ----------

    static kot(box, m) {

        const esc = Utils.escape;
        const $ = q => box.querySelector(q);
        const hibaJel = e => alert(Svc.hiba(e));

        box.querySelectorAll("[data-el-mb]").forEach(b => { b.onclick = () => { SellerPage.valasztott = Number(b.dataset.elMb); SellerPage.rajzol(box); }; });
        box.querySelectorAll("[data-el-ful]").forEach(b => { b.onclick = () => { const u = $("#elUzenetek"); if (u) { u.scrollIntoView({ behavior: "smooth" }); setTimeout(() => { const t = $("#elUz"); if (t) t.focus(); }, 400); } }; });

        box.querySelectorAll("[data-el-lep]").forEach(b => {
            b.onclick = () => {
                const mit = b.dataset.elLep;
                if (!confirm(I18n.t(mit === "csomag-jovahagy" ? "el_csomagKerdes" : "el_hirdetesKerdes"))) return;
                b.disabled = true;
                Svc.api(`/api/megbizas/sajat/${m.id}/${mit}`, { method: "POST" })
                    .then(() => { MandateDesk.jelez(I18n.t("el_koszonjuk")); SellerPage.frissit(); })
                    .catch(e => { b.disabled = false; hibaJel(e); });
            };
        });

        // Szerződés: elolvastam → kód kérése (e-mailben) → aláírás
        const ok = $("#elSzOk");
        const ker = $("#elKodKer");
        if (ok && ker) {
            ok.onchange = () => { ker.disabled = !ok.checked; };
            ker.onclick = () => {
                ker.disabled = true;
                Svc.api(`/api/megbizas/sajat/${m.id}/szerzodes-kod`, { method: "POST" }).then(r => {
                    const resz = $("#elKodResz");
                    if (!r.kell) {
                        // Nincs e-mail küldés beállítva: aláírás kód nélkül
                        return SellerPage.alair(m, null, $("#elSzKorai").checked);
                    }
                    resz.innerHTML = `
                        <p class="small mb-2">${esc(I18n.f("el_kodElkuldve", { email: r.email || "" }))}</p>
                        <div class="d-flex flex-wrap gap-2 align-items-end">
                            <div><label class="form-label small mb-1" for="elKod">${I18n.t("el_kod")}</label>
                            <input class="form-control elKodMezo" id="elKod" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="– – – – – –"></div>
                            <button type="button" class="btn btn-primary" id="elAlair"><i class="fa-solid fa-signature" aria-hidden="true"></i> ${I18n.t("el_alairom")}</button>
                            <button type="button" class="btn btn-link btn-sm" id="elUjKod">${I18n.t("el_ujKod")}</button>
                        </div>
                        <div class="alert alert-danger small py-2 mt-2 mb-0" id="elKodHiba" hidden></div>`;
                    $("#elKod").focus();
                    $("#elAlair").onclick = () => {
                        $("#elAlair").disabled = true;
                        SellerPage.alair(m, $("#elKod").value, $("#elSzKorai").checked).catch(e => { $("#elAlair").disabled = false; $("#elKodHiba").textContent = Svc.hiba(e); $("#elKodHiba").hidden = false; });
                    };
                    $("#elUjKod").onclick = () => Svc.api(`/api/megbizas/sajat/${m.id}/szerzodes-kod`, { method: "POST" }).then(() => MandateDesk.jelez(I18n.t("el_kodUjra"))).catch(hibaJel);
                }).catch(e => { ker.disabled = false; hibaJel(e); });
            };
        }
        const szem = $("#elSzemKer");
        if (szem) szem.onclick = () => {
            szem.disabled = true;
            Svc.api(`/api/megbizas/sajat/${m.id}/szerzodes-szemelyes`, { method: "POST", body: { javaslat: $("#elSzemJav").value } })
                .then(() => { MandateDesk.jelez(I18n.t("el_szemelyesOk")); SellerPage.frissit(); })
                .catch(e => { szem.disabled = false; hibaJel(e); });
        };

        box.querySelectorAll("[data-el-irat]").forEach(b => {
            b.onclick = () => MandateDesk.fajlValaszt().then(f => {
                if (!f) return;
                b.disabled = true;
                return Svc.api(`/api/megbizas/sajat/${m.id}/irat`, { method: "POST", body: { kod: b.dataset.elIrat, nev: f.nev, fajl: f.adat } })
                    .then(() => { MandateDesk.jelez(I18n.t("ir_feltoltve")); SellerPage.frissit(); });
            }).catch(e => { b.disabled = false; hibaJel(e); });
        });

        box.querySelectorAll("[data-valasz]").forEach(b => {
            b.onclick = () => SellerPage.valasz(m, Number(b.dataset.a), b.dataset.valasz);
        });

        const kuld = $("#elUzKuld");
        if (kuld) kuld.onclick = () => {
            const szoveg = $("#elUz").value.trim();
            if (!szoveg) return;
            kuld.disabled = true;
            Svc.api(`/api/megbizas/sajat/${m.id}/uzenet`, { method: "POST", body: { szoveg } })
                .then(() => SellerPage.frissit())
                .catch(e => { kuld.disabled = false; hibaJel(e); });
        };

        const vissza = $("#elVisszavon");
        if (vissza) vissza.onclick = () => {
            if (!confirm(I18n.t("mmWithdrawConfirm"))) return;
            Svc.api(`/api/megbizas/sajat/${m.id}/visszavon`, { method: "POST" }).then(() => SellerPage.frissit()).catch(hibaJel);
        };

    }

    static alair(m, kod, korai) {
        return Svc.api(`/api/megbizas/sajat/${m.id}/szerzodes-elfogad`, { method: "POST", body: { elfogad: true, kod, korai_kezdes: korai } })
            .then(() => { MandateDesk.jelez(I18n.t("el_alairvaOk")); SellerPage.frissit(); });
    }

    // Válasz egy ajánlatra – ablakban (elfogadom / ellenajánlat / nem fogadom el)
    static valasz(m, aid, tipus) {

        const esc = Utils.escape;
        const a = m.ajanlatok.find(x => x.id === aid);
        const { tartalom, modal } = Svc.modal("mmValaszModal", "");

        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title">${I18n.t(tipus === "elfogad" ? "mmAcceptTitle" : tipus === "ellen" ? "mmCounterTitle" : "mmRejectTitle")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
            </div>
            <div class="modal-body">
                <p class="mb-3">${I18n.t("mmOfferWas")}: <b>${esc(Svc.penz(a.osszeg, a.penznem))}</b> · ${esc(MandateDesk.finSzoveg({ ...a, igazolas_id: a.igazolas }))}</p>
                ${tipus === "ellen" ? `
                    <label class="form-label" for="mmvOsszeg">${I18n.t("mmCounterPrompt")}</label>
                    <div class="input-group mb-3">
                        <input class="form-control" id="mmvOsszeg" type="number" min="1" step="500" value="${m.kert_ar ? Math.round(((Number(a.osszeg) + Number(m.kert_ar)) / 2) / 500) * 500 : ""}">
                        <span class="input-group-text">${esc(a.penznem)}</span>
                    </div>` : ""}
                ${tipus === "elfogad" ? `<p class="small text-body-secondary">${I18n.t("el_elfogadSugo")}</p>` : `
                    <label class="form-label" for="mmvUz">${I18n.t("mmMessagePrompt")}</label>
                    <textarea class="form-control" id="mmvUz" rows="3" maxlength="1000"></textarea>`}
                <div class="alert alert-danger small py-2 mt-3 mb-0" id="mmvHiba" hidden></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
                <button type="button" class="btn ${tipus === "elutasit" ? "btn-secondary" : "btn-success"}" id="mmvOk">${I18n.t(tipus === "elfogad" ? "mmAccept" : tipus === "ellen" ? "mmSendCounter" : "mmReject")}</button>
            </div>`;

        const $ = q => tartalom.querySelector(q);
        $("#mmvOk").onclick = () => {
            const body = { valasz: tipus };
            if (tipus === "ellen") {
                body.osszeg = Number($("#mmvOsszeg").value);
                if (!body.osszeg) { $("#mmvHiba").textContent = I18n.t("svcErr_bad_amount"); $("#mmvHiba").hidden = false; return; }
            }
            if ($("#mmvUz") && $("#mmvUz").value.trim()) body.uzenet = $("#mmvUz").value.trim();
            $("#mmvOk").disabled = true;
            Svc.api(`/api/megbizas/sajat/${m.id}/ajanlat/${aid}/valasz`, { method: "POST", body })
                .then(() => { modal.hide(); SellerPage.frissit(); })
                .catch(e => { $("#mmvOk").disabled = false; $("#mmvHiba").textContent = Svc.hiba(e); $("#mmvHiba").hidden = false; });
        };

        modal.show();

    }

}

// ===================== BEKÖTÉS: oldal, menü =====================

document.addEventListener("DOMContentLoaded", () => {

    PageManager.PAGES.eladas = { icon: "fa-solid fa-key", label: "el_menu", login: true };
    if (!PageManager.LOGIN_KELL.includes("eladas")) PageManager.LOGIN_KELL.push("eladas");

    const show = PageManager.show;
    PageManager.show = function (target, opts = {}) {
        const t = String(target || "").replace(/^#/, "");
        // A régi Fiókom → Megbízásaim és a régi Munkaterületem helyett
        if (/^fiok\/megbizasok/.test(t)) return show.call(this, "eladas", opts.fromHash ? { ...opts, fromHash: false } : opts);
        if (/^munka/.test(t)) {
            const ut = t.replace(/^munka\/?/, "");
            const cel = ut.startsWith("megbizasok") ? "admin/" + ut : ut.startsWith("megtekintesek") ? "admin/naptar" : ut.startsWith("hirdetesek") ? "admin/hirdetesek" : "admin";
            return show.call(this, cel, opts.fromHash ? { ...opts, fromHash: false } : opts);
        }
        const r = show.call(this, target, opts);
        if (PageManager.current === "eladas" && /^eladas/.test(t)) SellerPage.show(PageManager.parse(t).param);
        return r;
    };

});

// A régi Fiókom → Megbízásaim fül: átirányít ide
if (typeof MyMandates === "undefined") {
    window.MyMandates = class {
        static render(el) {
            if (el) el.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;
            location.hash = "#eladas";
        }
    };
}
