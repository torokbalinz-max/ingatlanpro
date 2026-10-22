// ============================================================
//  Egy hirdetés teljes oldala (#listing/123)
// ============================================================

class ListingPage {

    static current = null;
    static kepek = [];
    static kepIdx = 0;
    static map = null;

    // Kattintásra a forrásoldal nyíljon-e meg a saját adatlap helyett.
    // Az admin hirdetésenként állítja (megnyitas: lap | forras); ha nincs
    // beállítva (automatikus): minden linkkel rendelkező hirdetés egyből a
    // forrásoldalra visz – kivéve, amit a hirdető itt, fiókkal töltött fel
    // (iroda, megbízás, magánszemély): annak saját adatlapja van.
    //  Közvetített (Imoradar24) hirdetés: az eredeti hirdetésre, ha nem találtuk,
    //  a forrásoldal szűrt keresésére – az Imoradar24-re soha (Sources.url).
    static forrasra(i) {
        if (!i) return false;
        const k = Sources.kulcs(i);
        if (k === "local" || k === "other") return false;
        if (!Sources.url(i)) return false;
        if (i.megnyitas === "lap") return false;
        if (i.megnyitas === "forras") return true;
        if ("sajat_feltoltes" in i) return !i.sajat_feltoltes;
        return i.forras_tipus === "import";
    }

    // Az automatikus beállítás mit jelent ennél a hirdetésnél
    static autoMod(i) {
        return ListingPage.forrasra({ ...i, megnyitas: null }) ? "forras" : "lap";
    }

    static keres(id) {
        return (typeof CardsView !== "undefined" && CardsView.objektumok.get(id))
            || DataManager.ingatlanok.find(x => x.id === id)
            || (ListingPage.current && ListingPage.current.id === id ? ListingPage.current : null);
    }

    // Az eredeti hirdetés új lapon (link-kattintásként, hogy a böngésző ne tiltsa le)
    static forrastNyit(i) {
        const a = document.createElement("a");
        a.href = Sources.url(i) || i.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer nofollow";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    static open(id, obj) {
        id = Number(id);
        const i = obj || ListingPage.keres(id);
        if (i && ListingPage.forrasra(i)) return ListingPage.forrastNyit(i);
        PageManager.show("listing/" + id);
    }

    static show(id) {

        const box = document.getElementById("listingContent");

        box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        fetch("/api/ingatlanok/" + id)
            .then(r => {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            })
            .then(i => {
                DataManager.prepare([i]);
                ListingPage.current = i;
                // A forrásoldalra vivő hirdetésnek nincs nyilvános adatlapja (pl. régi
                // linkről vagy a térképről érkezett látogató): rövid összefoglaló + link
                if (ListingPage.forrasra(i) && !AuthManager.resz("ellenorzes") && !AuthManager.canEdit(i)) {
                    ListingPage.renderKulso(i);
                } else {
                    ListingPage.render(i);
                }
            })
            .catch(() => {
                box.innerHTML = `
                    <div class="emptyState">
                        <i class="fa-solid fa-circle-exclamation"></i>
                        <h5>${I18n.t("listingNotFound")}</h5>
                        <a class="btn btn-primary btn-sm mt-2" href="#properties">${I18n.t("backToResults")}</a>
                    </div>`;
            });

    }

    static rerender() {
        if (PageManager.current === "listing" && ListingPage.current) {
            const i = ListingPage.current;
            if (ListingPage.forrasra(i) && !AuthManager.resz("ellenorzes") && !AuthManager.canEdit(i)) ListingPage.renderKulso(i);
            else ListingPage.render(i);
        }
    }

    // A forrásoldalra vivő hirdetés rövid lapja: a fő adatok, a képek kicsiben,
    // és egy nagy gomb az eredeti hirdetéshez
    static renderKulso(i) {

        const box = document.getElementById("listingContent");
        const forrasNev = Sources.label(Sources.kulcs(i));

        if (ListingPage.map) { ListingPage.map.remove(); ListingPage.map = null; }

        box.innerHTML = `
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <button class="btn btn-link px-0" id="lpBack"><i class="fa-solid fa-arrow-left"></i> ${I18n.t("backToResults")}</button>
            </div>
            <div class="row justify-content-center">
                <div class="col-md-8 col-lg-6">
                    <div class="extCardWrap row g-0">${CardsView.cardHtml(i, { col: "col-12" })}</div>
                    <div class="card mt-3 extInfo">
                        <div class="card-body">
                            <h5 class="mb-1"><i class="fa-solid fa-globe" aria-hidden="true"></i> ${Utils.escape(I18n.f("extTitle", { s: forrasNev }))}</h5>
                            <p class="text-body-secondary small mb-3">${I18n.t(Sources.keresesre(i) ? "extHelpSearch" : "extHelp")}</p>
                            <a class="btn btn-primary w-100" href="${Utils.escape(Sources.url(i) || "")}" target="_blank" rel="noopener noreferrer nofollow">
                                ${Utils.escape(I18n.f("extOpen", { s: forrasNev }))} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
                            </a>
                            ${Types.becsulheto(i.tipus) ? `<button type="button" class="btn btn-outline-primary w-100 mt-2" id="lpExtVal"><i class="fa-solid fa-calculator" aria-hidden="true"></i> ${I18n.t("detailValuate")}</button>` : ""}
                        </div>
                    </div>
                </div>
            </div>`;

        CardsView.bindCards(box);

        document.getElementById("lpBack").onclick = () => PageManager.show(PageManager.lastListPage || "properties");
        const ev = document.getElementById("lpExtVal");
        if (ev) ev.onclick = () => { PageManager.show("valuation"); ValuationManager.prefill(i).then(() => ValuationManager.run()); };

    }

    // Admin: mi nyíljon meg kattintásra ennél a hirdetésnél
    static megnyitasBox(i) {

        const k = Sources.kulcs(i);
        if (k === "local" || k === "other") return "";

        const most = i.megnyitas || "auto";
        const auto = I18n.f("openMode_autoNow", { m: I18n.t("openMode_" + ListingPage.autoMod(i)) });
        const opt = (v, label) => `<option value="${v}" ${most === v ? "selected" : ""}>${Utils.escape(label)}</option>`;

        return `
            <div class="mb-3 lpOpenModeBox">
                <label class="form-label small fw-semibold mb-1" for="lpOpenMode"><i class="fa-solid fa-arrow-pointer"></i> ${I18n.t("openModeLabel")}</label>
                <select class="form-select form-select-sm" id="lpOpenMode">
                    ${opt("auto", auto)}
                    ${opt("forras", I18n.f("openMode_forrasNev", { s: Sources.label(k) }))}
                    ${opt("lap", I18n.t("openMode_lap"))}
                </select>
                <div class="form-text">${I18n.t("openModeHelp")}</div>
                ${ListingPage.forrasra(i) ? `<div class="alert alert-info small py-2 mt-2 mb-0"><i class="fa-solid fa-circle-info"></i> ${Utils.escape(I18n.f("openModeAdminNote", { s: Sources.label(k) }))}</div>` : ""}
            </div>`;

    }

    // Beállítás mentése (egy vagy több hirdetésnél) – a betöltött listában is átírjuk
    static setMegnyitas(ids, megnyitas) {
        return fetch("/api/ingatlanok/bulk-megnyitas", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids, megnyitas })
        })
            .then(r => r.json().then(v => ({ ok: r.ok, v })))
            .then(({ ok, v }) => {
                if (!ok || !v.siker) throw new Error(v.error || "megnyitas");
                const ertek = megnyitas === "auto" ? null : megnyitas;
                const set = new Set(ids);
                DataManager.ingatlanok.forEach(x => { if (set.has(x.id)) x.megnyitas = ertek; });
                if (typeof CardsView !== "undefined") CardsView.objektumok.forEach((x, id) => { if (set.has(id)) x.megnyitas = ertek; });
                if (ListingPage.current && set.has(ListingPage.current.id)) ListingPage.current.megnyitas = ertek;
                return v;
            });
    }

    // Egy adat-doboz (az érték szöveg – mindig "escape"-elve, mert a hirdetésből jön)
    static fact(icon, label, value, megjegyzes) {
        if (value === null || value === undefined || value === "" || value === "-") return "";
        return `
            <div class="col-6 col-md-4">
                <div class="factBox">
                    <i class="${icon}"></i>
                    <div><small>${label}</small><b>${Utils.escape(value)}</b>${megjegyzes ? `<span class="allapotBecsult d-block ms-0">${Utils.escape(megjegyzes)}</span>` : ""}</div>
                </div>
            </div>`;
    }

    static render(i) {

        const box = document.getElementById("listingContent");
        const t = Types.get(i.tipus);

        // Képek: saját feltöltöttek, vagy a forrásoldalról beolvasottak
        ListingPage.kepek = (i.kepek && i.kepek.length)
            ? i.kepek.map(k => "/api/kepek/" + k)
            : (i.kulso_kepek || []).map(Utils.imgUrl);

        ListingPage.kepIdx = 0;

        const cim = i.cim || `${Types.label(i.tipus)} · ${CityManager.displayName(i.varos)}`;
        const hely = CityManager.helyLabel(i);

        const galeria = ListingPage.kepek.length
            ? `
                <div class="gallery">
                    <div class="galleryMain">
                        <img id="galleryImg" src="${Utils.escape(ListingPage.kepek[0])}" referrerpolicy="no-referrer" alt="">
                        ${(i.panoramak || []).length ? `<button type="button" class="gallery360" id="lp360Btn"><i class="fa-solid fa-street-view" aria-hidden="true"></i> ${I18n.t("pano360Btn")}</button>` : ""}
                        ${ListingPage.kepek.length > 1 ? `
                            <button class="galleryNav prev" id="galleryPrev"><i class="fa-solid fa-chevron-left"></i></button>
                            <button class="galleryNav next" id="galleryNext"><i class="fa-solid fa-chevron-right"></i></button>
                            <span class="galleryCounter" id="galleryCounter">1 / ${ListingPage.kepek.length}</span>` : ""}
                    </div>
                    ${ListingPage.kepek.length > 1 ? `
                        <div class="galleryThumbs">
                            ${ListingPage.kepek.map((k, idx) => `<img src="${Utils.escape(k)}" data-idx="${idx}" class="${idx === 0 ? "active" : ""}" referrerpolicy="no-referrer" loading="lazy" alt="">`).join("")}
                        </div>` : ""}
                </div>`
            : `<div class="gallery noPhotos" data-tipus="${Utils.escape(i.tipus || "")}">
                    <span class="npIcon"><i class="${t.icon}" aria-hidden="true"></i></span>
                    <span class="npText"><b>${Utils.escape(Types.label(i.tipus))} · ${Utils.escape(hely)}</b><span>${I18n.t("noPhotos")}</span></span>
               </div>`;

        // Hol van meghirdetve
        // (a közvetítő – Imoradar24 – helyett a valódi forrás, vagy annak szűrt keresése)
        //  Ha az eredeti hirdetés linkje még nincs meg: a forrásoldal szűrt keresése (tartalék)
        const linkek = [...new Set([Sources.url(i), ...(i.tovabbi_linkek || []), Sources.kereso(i)].filter(l => l && !Sources.kozvetito(l) && Sources.fromLink(l) !== "other"))];

        // A hirdető itt (fiókkal) töltötte fel, és más oldalakon is fent van:
        // itt közvetlenül neki lehet írni
        const sajatEsMas = i.owner_id && linkek.length && !i.iroda;
        const atvett = i.forras_tipus === "import" || i.leiras_rejtve;

        // Más oldalakon is fent van: nagy, feltűnő blokk közvetlenül az adatok alatt
        const forrasFo = linkek.length ? `
            <div class="srcBlock mt-4">
                <div class="srcBlockHead">
                    <i class="fa-solid fa-globe" aria-hidden="true"></i>
                    <div>
                        <h5 class="mb-1">${I18n.f(linkek.length > 1 ? "srcBlockTitleN" : "srcBlockTitle1", { n: linkek.length })}</h5>
                        <p class="mb-0">${I18n.t(sajatEsMas ? "lpAlsoOnOther" : atvett ? "srcBlockHelpImport" : "srcBlockHelp")}</p>
                    </div>
                </div>
                ${sajatEsMas ? `<div class="sourceLink local ownUpload mb-2"><i class="fa-solid fa-house-flag"></i> <span>${I18n.t("lpOwnUploadHere")}</span></div>` : ""}
                <div class="srcBlockList">
                    ${linkek.map(l => {
                        const k = Sources.fromLink(l);
                        return `
                        <a class="srcRow" href="${Utils.escape(l)}" target="_blank" rel="noopener noreferrer nofollow">
                            <span class="srcRowIcon"><i class="fa-solid fa-globe" aria-hidden="true"></i></span>
                            <span class="srcRowText">
                                <b>${Utils.escape(Sources.label(k))}</b>
                                <small>${Utils.escape(l === i.forras_kereso ? I18n.t("srcSearchOnSite") : k)}</small>
                            </span>
                            <span class="srcRowGo">${I18n.t("srcOpen")} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></span>
                        </a>`;
                    }).join("")}
                </div>
                ${atvett ? `<p class="srcBlockNote mb-0"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t("srcBlockNote")}</p>` : ""}
            </div>` : "";

        // Csak itt van fent: a jobb oldali sávban marad a kis jelzés
        //  (átvett hirdetésnél soha nem „csak itt”: ha az eredeti linket még nem
        //   találtuk meg, a forrás neve látszik, és hogy a link hamarosan meglesz)
        const forrasOldal = linkek.length ? "" : i.link ? `
                        <div class="card mt-4">
                            <div class="card-body">
                                <h6 class="mb-3">${I18n.t("listedOn")}</h6>
                                <div class="sourceLink"><i class="fa-solid fa-globe"></i> ${Utils.escape(Sources.label(Sources.kulcs(i)))}</div>
                                <div class="small text-body-secondary mt-2">${I18n.t("srcLinkPending")}</div>
                            </div>
                        </div>` : `
                        <div class="card mt-4">
                            <div class="card-body">
                                <h6 class="mb-3">${I18n.t("listedOn")}</h6>
                                <div class="sourceLink local"><i class="fa-solid fa-house-flag"></i> ${I18n.t("onlyHere")}</div>
                            </div>
                        </div>`;

        const hianyzo = Array.isArray(i.hianyzo) ? i.hianyzo : [];

        // A hely-ellenőrzés áthelyezte a forrás (rossz) pontját
        const helyInfo = i.hely_eredeti && i.hely_eredeti.ok
            ? `<div class="alert alert-info small py-2"><i class="fa-solid fa-location-crosshairs"></i> ${ListingPage.helyEredetiSzoveg(i)}</div>`
            : "";

        // A saját hirdetésem (nem admin): szerkesztés, törlés
        const sajatBox = !AuthManager.resz("ellenorzes") && AuthManager.canEdit(i) ? `
            <div class="card mt-4">
                <div class="card-body">
                    <h6 class="mb-3"><i class="fa-solid fa-house-user"></i> ${I18n.t(i.iroda && !AuthManager.owns(i) ? "lpAgencyListing" : "lpOwnListing")}</h6>
                    ${i.statusz === "archiv" ? `<div class="alert alert-secondary small py-2">${I18n.t("agArchivedInfo")}</div>` : ""}
                    ${i.iroda_mappa || i.iroda_megjegyzes ? `<div class="small mb-2 agInternalBox">
                        ${i.iroda_mappa ? `<div><i class="fa-regular fa-folder"></i> ${Utils.escape(i.iroda_mappa)}</div>` : ""}
                        ${i.iroda_megjegyzes ? `<div><i class="fa-regular fa-note-sticky"></i> ${Utils.escape(i.iroda_megjegyzes)}</div>` : ""}
                    </div>` : ""}
                    ${(i.problemak || []).includes("hely_tavol") ? `<div class="alert alert-warning small py-2">${I18n.t("prob_hely_tavol")}</div>` : ""}
                    ${["aktiv", "fuggo"].includes(i.statusz) ? `<button class="btn ${CardsView.kiemelt(i) ? "btn-warning" : "btn-outline-warning"} btn-sm w-100 mb-2" id="lpFeature"><i class="fa-solid fa-star"></i> ${CardsView.kiemelt(i) ? I18n.f("ftUntilShort", { d: Svc.nap(i.kiemelt_ig) }) : I18n.t("ftButton")}</button>` : ""}
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-secondary btn-sm flex-fill" id="lpEdit"><i class="fa-solid fa-pen"></i> ${I18n.t("detailEdit")}</button>
                        <button class="btn btn-outline-danger btn-sm flex-fill" id="lpDelete"><i class="fa-solid fa-trash"></i> ${I18n.t("detailDelete")}</button>
                    </div>
                </div>
            </div>` : "";

        // Ingatlanirodás hirdetés: az iroda és az ügynök elérhetősége
        const tel = t => `<a class="btn btn-outline-primary btn-sm w-100 mb-2 text-start" href="tel:${Utils.escape(String(t).replace(/\s/g, ""))}"><i class="fa-solid fa-phone"></i> ${Utils.escape(t)}</a>`;
        const mail = m => `<a class="btn btn-outline-secondary btn-sm w-100 mb-2 text-start text-truncate" href="mailto:${Utils.escape(m)}"><i class="fa-regular fa-envelope"></i> ${Utils.escape(m)}</a>`;
        const uzenhet = i.owner_id && !AuthManager.canEdit(i);

        const irodaBox = i.iroda ? `
            <div class="card mt-4 agContactCard" id="lpContactCard">
                <div class="card-body">
                    <div class="small text-body-secondary mb-1">${I18n.t("lpListedBy")}</div>
                    <a class="d-flex align-items-center gap-2 mb-3 agContactHead" href="#irodak/${i.iroda.id}">
                        ${AgencyUI.logo(i.iroda, "sm")}
                        <span class="min-w-0">
                            <b class="d-block text-truncate">${Utils.escape(i.iroda.nev)} ${AgencyUI.verifiedBadge(i.iroda)}</b>
                            <span class="small text-body-secondary">${I18n.t(i.iroda.statusz === "jovahagyva" ? "agLabel" : "agPendingLabel")}</span>
                        </span>
                    </a>
                    ${i.iroda.weboldal ? `<a class="btn btn-outline-secondary btn-sm w-100 mb-2 text-start text-truncate" href="${Utils.escape(i.iroda.weboldal)}" target="_blank" rel="noopener nofollow"><i class="fa-solid fa-globe"></i> ${Utils.escape(AgencyUI.weboldalNev(i.iroda.weboldal))}</a>` : ""}
                    ${i.ugynok ? `
                        <div class="agAgentLine mb-2"><i class="fa-regular fa-user"></i> <span class="small text-body-secondary">${I18n.t("agAgent")}:</span> <b>${Utils.escape(i.ugynok.nev)}</b></div>
                        ${i.ugynok.telefon ? tel(i.ugynok.telefon) : ""}
                        ${i.ugynok.email ? mail(i.ugynok.email) : ""}` : ""}
                    ${(!i.ugynok || !i.ugynok.telefon) && i.iroda.telefon ? tel(i.iroda.telefon) : ""}
                    ${(!i.ugynok || !i.ugynok.email) && i.iroda.email ? mail(i.iroda.email) : ""}
                    ${i.iroda_ref ? `<div class="small text-body-secondary mb-2">${I18n.t("agRef")}: <b>${Utils.escape(i.iroda_ref)}</b></div>` : ""}
                    ${uzenhet ? `
                        <div id="lpContactForm" hidden>
                            <textarea class="form-control mb-2" id="lpContactText" rows="4" maxlength="3000" placeholder="${Utils.escape(I18n.t("lpContactPh"))}"></textarea>
                        </div>
                        <button class="btn btn-primary w-100" id="lpContact"><i class="fa-regular fa-envelope"></i> ${I18n.t("lpContactBtn")}</button>` : ""}
                    <a class="btn btn-link btn-sm w-100 mt-1" href="#irodak/${i.iroda.id}">${I18n.t("lpAgencyAll")} <i class="fa-solid fa-arrow-right"></i></a>
                </div>
            </div>` : "";

        // Kapcsolat a hirdetővel (csak az oldalon, fiókkal feltöltött hirdetéseknél)
        const kapcsolatBox = i.iroda ? irodaBox : i.owner_id && !AuthManager.owns(i) ? `
            <div class="card mt-4" id="lpContactCard">
                <div class="card-body">
                    <h6 class="mb-1"><i class="fa-regular fa-user"></i> ${Utils.escape(i.hirdeto_nev || I18n.t("lpSeller"))}</h6>
                    <p class="small text-body-secondary">${I18n.t("lpContactHelp")}</p>
                    <div id="lpContactForm" hidden>
                        <textarea class="form-control mb-2" id="lpContactText" rows="4" maxlength="3000" placeholder="${Utils.escape(I18n.t("lpContactPh"))}"></textarea>
                    </div>
                    <button class="btn btn-primary w-100" id="lpContact"><i class="fa-regular fa-envelope"></i> ${I18n.t("lpContactBtn")}</button>
                </div>
            </div>` : "";

        const adminBox = AuthManager.resz("ellenorzes") ? `
            <div class="card mt-4 listingAdminBox">
                <div class="card-body">
                    <h6 class="mb-3"><i class="fa-solid fa-user-shield"></i> Admin</h6>
                    ${i.statusz === "fuggo" ? `<div class="alert alert-warning small py-2">${I18n.t("listingPending")}</div>` : ""}
                    ${hianyzo.length ? `<div class="small mb-2">${I18n.t("missingFields")}: ${hianyzo.map(m => `<span class="badge text-bg-warning">${I18n.t("field_" + m)}</span>`).join(" ")}</div>` : ""}
                    ${(i.problemak || []).length ? `<div class="small mb-2">${I18n.t("problemsLabel")}: ${(i.problemak || []).map(m => `<span class="badge text-bg-danger">${I18n.t("prob_" + m)}</span>`).join(" ")}</div>` : ""}
                    ${i.statusz === "nem_elerheto" ? `<div class="alert alert-secondary small py-2">${I18n.t("listingUnavailable")}</div>` : ""}
                    ${helyInfo}
                    ${ListingPage.megnyitasBox(i)}
                    ${i.ellenorzott === false ? `<button class="btn btn-warning btn-sm w-100 mb-2" id="lpReview"><i class="fa-solid fa-list-check"></i> ${I18n.t("openInReview")}</button>` : ""}
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-secondary btn-sm flex-fill" id="lpEdit"><i class="fa-solid fa-pen"></i> ${I18n.t("detailEdit")}</button>
                        <button class="btn btn-outline-danger btn-sm flex-fill" id="lpDelete"><i class="fa-solid fa-trash"></i> ${I18n.t("detailDelete")}</button>
                    </div>
                </div>
            </div>` : "";

        box.innerHTML = `

            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <button class="btn btn-link px-0" id="lpBack"><i class="fa-solid fa-arrow-left"></i> ${I18n.t("backToResults")}</button>
                <span class="text-body-secondary small">${I18n.t("popupProperty")}${i.id} · ${Utils.ago(i.created_at)}</span>
            </div>

            <div class="row g-4 g-xl-5">

                <div class="col-lg-8">

                    ${galeria}

                    <div class="mt-4">
                        <div class="d-flex flex-wrap gap-2 mb-2">
                            <span class="badge text-bg-primary"><i class="${t.icon}"></i> ${Types.label(i.tipus)}</span>
                            <span class="badge text-bg-secondary">${Types.ugyletLabel(i.ugylet)}</span>
                            ${i.eladva ? `<span class="badge text-bg-danger">${I18n.t("dbEladva")}</span>` : ""}
                            ${i.ellenorzott === false ? `<span class="badge text-bg-light" title="${I18n.t("unverifiedHint")}"><i class="fa-solid fa-hourglass-half"></i> ${I18n.t("unverified")}</span>` : ""}
                        </div>
                        <h2 class="listingPageTitle">${Utils.escape(cim)}</h2>
                        <div class="text-body-secondary"><i class="fa-solid fa-location-dot"></i> ${Utils.escape(hely)}</div>
                        <div class="listingPriceMobile d-lg-none">
                            <span class="listingPriceBig">${Utils.price(i)}</span>
                            <span class="text-body-secondary">${Utils.arNm(i) ? Utils.eurNm(Utils.arNm(i)) : ""}</span>
                        </div>
                    </div>

                    <div class="row g-3 mt-3 factRow">
                        ${ListingPage.fact("fa-solid fa-ruler-combined", I18n.t(i.tipus === "telek" ? "searchTelekNm" : "detailNm"), i.nm ? Utils.nm(i.nm) : "")}
                        ${t.fields.telek ? ListingPage.fact("fa-solid fa-tree", I18n.t("newTelekNm"), i.telek_nm ? Utils.nm(i.telek_nm) : "") : ""}
                        ${t.fields.szobak && (i.szobak || Types.kotelezo(i.tipus, "szobak", i.varos)) ? ListingPage.fact("fa-solid fa-bed", I18n.t("detailSzoba"), i.szobak || "") : ""}
                        ${t.fields.emelet && (i.emelet || Types.kotelezo(i.tipus, "emelet", i.varos)) ? ListingPage.fact("fa-solid fa-stairs", I18n.t("detailEmelet"), i.emelet || "") : ""}
                        ${t.fields.allapot ? ListingPage.fact("fa-solid fa-screwdriver-wrench", I18n.t("detailAllapot"), i.allapot ? Utils.allapotLabel(i.allapot) : "", Utils.allapotBecsult(i) ? I18n.t("condFromTextShort") : "") : ""}
                        ${ListingPage.fact("fa-solid fa-euro-sign", I18n.t("detailArNm"), Utils.arNm(i) ? Utils.eurNm(Utils.arNm(i)) : "")}
                    </div>

                    ${forrasFo}

                    ${typeof PanoramaViewer !== "undefined" ? PanoramaViewer.html(i) : ""}

                    ${atvett ? "" : `
                    <div class="card mt-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-align-left"></i> ${I18n.t("newLeiras")}</h5></div>
                        <div class="card-body">
                            ${i.leiras
                                ? `<div class="listingDesc">${Utils.escape(i.leiras)}</div>`
                                : `<p class="text-body-secondary mb-0">${I18n.t("noDescription")}</p>`}
                        </div>
                    </div>`}

                    <div class="card mt-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-map-location-dot"></i> ${I18n.t("newHely")}</h5></div>
                        <div class="card-body p-2">
                            ${i.hely_pontossag === "kozelito" ? `<div class="alert alert-info small py-2 m-2">${I18n.t("approxLocation")}</div>` : ""}
                            ${i.hely_pontossag === "utca" ? `<div class="alert alert-light small py-2 m-2">${I18n.t("streetLocation")}</div>` : ""}
                            ${i.x && i.y ? `<div id="listingMap"></div>` : `<div class="noLocationBox"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i><div><b>${I18n.t("hely_nincs")}</b><p class="mb-0">${Utils.escape(CityManager.helyLabel(i))}. ${I18n.t("noLocationHelp")}</p></div></div>`}
                        </div>
                    </div>

                    ${typeof AdSlots !== "undefined" ? AdSlots.slot("listing", "mt-4") : ""}

                </div>

                <div class="col-lg-4">
                    <div class="listingSide">

                        <div class="card">
                            <div class="card-body">
                                <div class="listingPriceBig">${Utils.price(i)}</div>
                                <div class="text-body-secondary mb-3">${Utils.arNm(i) ? Utils.eurNm(Utils.arNm(i)) : ""}</div>

                                <div class="d-grid gap-2">
                                    <button class="btn ${DataManager.isFavorite(i.id) ? "btn-warning" : "btn-outline-warning"}" id="lpFav">
                                        ${DataManager.isFavorite(i.id) ? I18n.t("favRemove") : I18n.t("favAdd")}
                                    </button>
                                    ${Types.becsulheto(i.tipus) ? `<button class="btn btn-outline-primary" id="lpValuate">
                                        <i class="fa-solid fa-calculator"></i> ${I18n.t("detailValuate")}
                                    </button>` : ""}
                                </div>
                            </div>
                        </div>

                        ${forrasOldal}

                        ${kapcsolatBox}

                        ${sajatBox}

                        ${adminBox}

                        ${typeof AdSlots !== "undefined" ? AdSlots.slot("listing_side", "mt-4 adSideSlot") : ""}

                    </div>
                </div>

            </div>`;

        ListingPage.bind(i);
        if (typeof PanoramaViewer !== "undefined") PanoramaViewer.bind(i);
        ListingPage.oldalRagad();

    }

    // A jobb oldali sáv görgetéskor csak akkor marad a helyén, ha kifér a
    // képernyőre (különben az alja – pl. a kapcsolat, a reklám – sosem látszana)
    static oldalRagad() {
        const side = document.querySelector("#listingContent .listingSide");
        if (!side) return;
        const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ip-nav-h")) || 64;
        side.classList.toggle("noStick", side.offsetHeight > window.innerHeight - nav - 32);
        if (!ListingPage._ragadFigyel) {
            ListingPage._ragadFigyel = true;
            window.addEventListener("resize", () => { if (PageManager.current === "listing") ListingPage.oldalRagad(); });
            // A képek / reklám betöltése után is
            if (typeof ResizeObserver !== "undefined") {
                ListingPage._ro = new ResizeObserver(() => ListingPage.oldalRagad());
            }
        }
        if (ListingPage._ro) { ListingPage._ro.disconnect(); ListingPage._ro.observe(side); }
    }

    static setPhoto(idx) {

        const n = ListingPage.kepek.length;

        if (!n) return;

        ListingPage.kepIdx = (idx + n) % n;

        const img = document.getElementById("galleryImg");
        if (img) img.src = ListingPage.kepek[ListingPage.kepIdx];

        const c = document.getElementById("galleryCounter");
        if (c) c.innerText = `${ListingPage.kepIdx + 1} / ${n}`;

        document.querySelectorAll(".galleryThumbs img").forEach(t => {
            t.classList.toggle("active", Number(t.dataset.idx) === ListingPage.kepIdx);
        });

    }

    static openModal() {

        const body = document.getElementById("photoModalBody");

        body.innerHTML = `
            <div class="photoModalImg">
                <img id="modalImg" src="${Utils.escape(ListingPage.kepek[ListingPage.kepIdx])}" referrerpolicy="no-referrer" alt="">
                ${ListingPage.kepek.length > 1 ? `
                    <button class="galleryNav prev" id="modalPrev"><i class="fa-solid fa-chevron-left"></i></button>
                    <button class="galleryNav next" id="modalNext"><i class="fa-solid fa-chevron-right"></i></button>` : ""}
            </div>`;

        const lep = d => {
            ListingPage.setPhoto(ListingPage.kepIdx + d);
            document.getElementById("modalImg").src = ListingPage.kepek[ListingPage.kepIdx];
        };

        const prev = document.getElementById("modalPrev");
        const next = document.getElementById("modalNext");
        if (prev) prev.onclick = () => lep(-1);
        if (next) next.onclick = () => lep(1);

        bootstrap.Modal.getOrCreateInstance(document.getElementById("photoModal")).show();

    }

    static bind(i) {

        document.getElementById("lpBack").onclick = () => PageManager.show(PageManager.lastListPage || "properties");

        const prev = document.getElementById("galleryPrev");
        const next = document.getElementById("galleryNext");
        if (prev) prev.onclick = () => ListingPage.setPhoto(ListingPage.kepIdx - 1);
        if (next) next.onclick = () => ListingPage.setPhoto(ListingPage.kepIdx + 1);

        document.querySelectorAll(".galleryThumbs img").forEach(t => {
            t.onclick = () => ListingPage.setPhoto(Number(t.dataset.idx));
        });

        const main = document.getElementById("galleryImg");
        if (main) {
            main.onclick = () => ListingPage.openModal();
            main.onerror = () => { main.closest(".galleryMain").classList.add("broken"); };
        }

        document.getElementById("lpFav").onclick = () => DataManager.toggleFavorite(i.id);

        const lpVal = document.getElementById("lpValuate");
        if (lpVal) lpVal.onclick = () => {
            PageManager.show("valuation");
            ValuationManager.prefill(i).then(() => ValuationManager.run());
        };

        const rev = document.getElementById("lpReview");
        if (rev) rev.onclick = () => { AdminManager.reviewFocusId = i.id; AdminManager.reviewVaros = i.varos || ""; AdminManager.tab = "review"; PageManager.show("admin/review"); };

        const ft = document.getElementById("lpFeature");
        if (ft) ft.onclick = () => FeatureModal.nyit(i.id, () => DataManager.init && DataManager.init());

        const om = document.getElementById("lpOpenMode");
        if (om) om.onchange = () => {
            om.disabled = true;
            ListingPage.setMegnyitas([i.id], om.value)
                .then(() => {
                    if (typeof Utils.toast === "function") Utils.toast(I18n.t("openModeSaved"));
                    ListingPage.render(i);
                    if (typeof CardsView !== "undefined" && CardsView.lista.length) CardsView.render(CardsView.lista);
                })
                .catch(() => { alert(I18n.t("bulkAlertError")); om.disabled = false; });
        };

        const edit = document.getElementById("lpEdit");
        if (edit) edit.onclick = () => NewPropertyManager.startEdit(i);

        const kapcs = document.getElementById("lpContact");
        if (kapcs) kapcs.onclick = () => {
            AuthManager.kell().then(() => {
                if (AuthManager.owns(i)) return ListingPage.render(i);
                const form = document.getElementById("lpContactForm");
                const text = document.getElementById("lpContactText");
                if (form.hidden) {
                    form.hidden = false;
                    kapcs.innerHTML = `<i class="fa-solid fa-paper-plane"></i> ${I18n.t("msgSend")}`;
                    text.focus();
                    return;
                }
                const szoveg = text.value.trim();
                if (szoveg.length < 2) return text.focus();
                kapcs.disabled = true;
                fetch(`/api/ingatlanok/${i.id}/uzenet`, {
                    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ szoveg })
                })
                    .then(r => r.json().then(v => ({ ok: r.ok, v })))
                    .then(({ ok, v }) => {
                        if (!ok) throw new Error(v.error);
                        Utils.toast(I18n.t("reqSent"));
                        AccountPage.nyitando = { masik: v.cimzett_id, ingatlan: i.id };
                        PageManager.show("fiok/uzenetek");
                    })
                    .catch(() => alert(I18n.t("msgSendError")))
                    .finally(() => { kapcs.disabled = false; });
            }).catch(() => { });
        };

        const del = document.getElementById("lpDelete");
        if (del) del.onclick = () => UIManager.deleteProperty(i).then(ok => { if (ok) PageManager.show("properties"); });

        // Térkép
        if (ListingPage.map) {
            ListingPage.map.remove();
            ListingPage.map = null;
        }

        if (i.x && i.y && document.getElementById("listingMap")) {

            ListingPage.map = L.map("listingMap", { scrollWheelZoom: false }).setView([i.y, i.x], 15);

            MapManager.tileLayer().addTo(ListingPage.map);

            // A hirdetés kerületének határa (ha meg van rajzolva)
            const kn = Districts.ofListing(i);
            const kObj = kn && Districts.list(i.varos).find(k => k.nev === kn);
            if (kObj && !(Types.fieldsOf(i).telepules && i.telepules)) {
                const szin = Districts.color(kObj);
                L.polygon(Districts.latlngs(kObj.hatar), { color: szin, weight: 1.5, fillColor: szin, fillOpacity: 0.06, interactive: false })
                    .bindTooltip(Utils.escape(CityManager.keruletLabelOf(kObj)), { permanent: true, direction: "center", offset: [0, -22], className: "districtLabel" })
                    .addTo(ListingPage.map);
            }

            if (i.hely_pontossag === "kozelito") {
                L.circle([i.y, i.x], { radius: i.hely_sugar || (i.telepules ? 1500 : 500), color: Utils.accent(), weight: 2, fillOpacity: 0.14 }).addTo(ListingPage.map);
            } else {
                L.circleMarker([i.y, i.x], { radius: 10, color: "#fff", weight: 3, fillColor: Utils.accent(), fillOpacity: 1 }).addTo(ListingPage.map);
            }

            setTimeout(() => ListingPage.map && ListingPage.map.invalidateSize(), 100);

        }

    }

    // Miért van máshol, mint a hirdetési oldalon (a hely-ellenőrzés oka)
    static HELY_OK = {
        varostol_tavol: "helyOkVaros", falutol_tavol: "helyOkFalu", utca_eltero: "helyOkUtca",
        kerulet_eltero: "helyOkKerulet", pontosabb: "helyOkPontosabb", alappont: "helyOkAlappont"
    };

    static helyEredetiSzoveg(i) {
        const e = i.hely_eredeti || {};
        const kulcs = e.ok === "utca_eltero" && e.nev ? "helyOkUtcaNev" : (ListingPage.HELY_OK[e.ok] || "helyOkVaros");
        const utana = e.ok === "alappont" ? "helyAlappontUtana" : (i.x && i.y ? "helyAthelyezve" : "helyTorolve");
        return I18n.f(kulcs, {
            km: e.km !== null && e.km !== undefined ? Utils.num(e.km, 1) : "?",
            nev: Utils.escape(e.nev ? (e.ok === "kerulet_eltero" ? CityManager.keruletLabel(e.nev, i.varos) : e.nev) : "")
        }) + " " + I18n.t(utana);
    }

    static updateFavorite(id) {

        if (!ListingPage.current || ListingPage.current.id !== id) return;

        const btn = document.getElementById("lpFav");
        if (!btn) return;

        const fav = DataManager.isFavorite(id);
        btn.className = "btn " + (fav ? "btn-warning" : "btn-outline-warning");
        btn.innerHTML = fav ? I18n.t("favRemove") : I18n.t("favAdd");

    }

}
