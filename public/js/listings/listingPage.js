// ============================================================
//  Egy hirdetés teljes oldala (#listing/123)
// ============================================================

class ListingPage {

    static current = null;
    static kepek = [];
    static kepIdx = 0;
    static map = null;

    static open(id) {
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
                ListingPage.render(i);
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
            ListingPage.render(ListingPage.current);
        }
    }

    static fact(icon, label, value) {
        if (value === null || value === undefined || value === "" || value === "-") return "";
        return `
            <div class="col-6 col-md-4">
                <div class="factBox">
                    <i class="${icon}"></i>
                    <div><small>${label}</small><b>${value}</b></div>
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
            : `<div class="gallery noPhotos"><i class="${t.icon}"></i><span>${I18n.t("noPhotos")}</span></div>`;

        // Hol van meghirdetve
        const linkek = [i.link, ...(i.tovabbi_linkek || [])].filter(l => l && Sources.fromLink(l) !== "other");

        const forrasHtml = linkek.length
            ? linkek.map(l => `
                <a class="sourceLink" href="${Utils.escape(l)}" target="_blank" rel="noopener">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    ${I18n.f("viewOnSite", { site: Utils.escape(Sources.label(Sources.fromLink(l))) })}
                </a>`).join("")
            : `<div class="sourceLink local"><i class="fa-solid fa-house-flag"></i> ${I18n.t("onlyHere")}</div>`;

        const hianyzo = Array.isArray(i.hianyzo) ? i.hianyzo : [];

        const adminBox = AuthManager.isAdmin() ? `
            <div class="card mt-4 listingAdminBox">
                <div class="card-body">
                    <h6 class="mb-3"><i class="fa-solid fa-user-shield"></i> Admin</h6>
                    ${i.statusz === "fuggo" ? `<div class="alert alert-warning small py-2">${I18n.t("listingPending")}</div>` : ""}
                    ${hianyzo.length ? `<div class="small mb-2">${I18n.t("missingFields")}: ${hianyzo.map(m => `<span class="badge text-bg-warning">${I18n.t("field_" + m)}</span>`).join(" ")}</div>` : ""}
                    ${(i.problemak || []).length ? `<div class="small mb-2">${I18n.t("problemsLabel")}: ${(i.problemak || []).map(m => `<span class="badge text-bg-danger">${I18n.t("prob_" + m)}</span>`).join(" ")}</div>` : ""}
                    ${i.statusz === "nem_elerheto" ? `<div class="alert alert-secondary small py-2">${I18n.t("listingUnavailable")}</div>` : ""}
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

                    <div class="row g-3 mt-3">
                        ${ListingPage.fact("fa-solid fa-ruler-combined", I18n.t(i.tipus === "telek" ? "searchTelekNm" : "detailNm"), i.nm ? Utils.num(i.nm) + " m²" : "")}
                        ${t.fields.telek ? ListingPage.fact("fa-solid fa-tree", I18n.t("newTelekNm"), i.telek_nm ? Utils.num(i.telek_nm) + " m²" : "") : ""}
                        ${t.fields.szobak ? ListingPage.fact("fa-solid fa-bed", I18n.t("detailSzoba"), i.szobak || "") : ""}
                        ${t.fields.emelet ? ListingPage.fact("fa-solid fa-stairs", I18n.t("detailEmelet"), i.emelet || "") : ""}
                        ${t.fields.allapot ? ListingPage.fact("fa-solid fa-screwdriver-wrench", I18n.t("detailAllapot"), i.allapot ? Utils.allapotLabel(i.allapot) : "") : ""}
                        ${ListingPage.fact("fa-solid fa-euro-sign", I18n.t("detailArNm"), Utils.arNm(i) ? Utils.eurNm(Utils.arNm(i)) : "")}
                    </div>

                    <div class="card mt-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-align-left"></i> ${I18n.t("newLeiras")}</h5></div>
                        <div class="card-body">
                            ${i.leiras
                                ? `<div class="listingDesc">${Utils.escape(i.leiras)}</div>`
                                : `<p class="text-body-secondary mb-0">${I18n.t("noDescription")}</p>`}
                        </div>
                    </div>

                    <div class="card mt-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-map-location-dot"></i> ${I18n.t("newHely")}</h5></div>
                        <div class="card-body p-2">
                            ${i.hely_pontossag === "kozelito" ? `<div class="alert alert-info small py-2 m-2">${I18n.t("approxLocation")}</div>` : ""}
                            ${i.hely_pontossag === "utca" ? `<div class="alert alert-light small py-2 m-2">${I18n.t("streetLocation")}</div>` : ""}
                            ${i.x && i.y ? `<div id="listingMap"></div>` : `<div class="noLocationBox"><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i><div><b>${I18n.t("hely_nincs")}</b><p class="mb-0">${Utils.escape(CityManager.helyLabel(i))}. ${I18n.t("noLocationHelp")}</p></div></div>`}
                        </div>
                    </div>

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
                                    <button class="btn btn-outline-primary" id="lpValuate">
                                        <i class="fa-solid fa-calculator"></i> ${I18n.t("detailValuate")}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="card mt-4">
                            <div class="card-body">
                                <h6 class="mb-3">${I18n.t("listedOn")}</h6>
                                ${forrasHtml}
                            </div>
                        </div>

                        ${adminBox}

                    </div>
                </div>

            </div>`;

        ListingPage.bind(i);

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

        document.getElementById("lpValuate").onclick = () => {
            PageManager.show("valuation");
            ValuationManager.prefill(i).then(() => ValuationManager.run());
        };

        const rev = document.getElementById("lpReview");
        if (rev) rev.onclick = () => { AdminManager.reviewFocusId = i.id; AdminManager.tab = "review"; PageManager.show("admin"); };

        const edit = document.getElementById("lpEdit");
        if (edit) edit.onclick = () => NewPropertyManager.startEdit(i);

        const del = document.getElementById("lpDelete");
        if (del) del.onclick = () => UIManager.deleteProperty(i).then(ok => { if (ok) PageManager.show("properties"); });

        // Térkép
        if (ListingPage.map) {
            ListingPage.map.remove();
            ListingPage.map = null;
        }

        if (i.x && i.y && document.getElementById("listingMap")) {

            ListingPage.map = L.map("listingMap", { scrollWheelZoom: false }).setView([i.y, i.x], 15);

            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "© OpenStreetMap"
            }).addTo(ListingPage.map);

            if (i.hely_pontossag === "kozelito") {
                L.circle([i.y, i.x], { radius: i.telepules ? 900 : 400, color: Utils.accent(), fillOpacity: 0.12 }).addTo(ListingPage.map);
            } else {
                L.circleMarker([i.y, i.x], { radius: 10, color: "#fff", weight: 3, fillColor: Utils.accent(), fillOpacity: 1 }).addTo(ListingPage.map);
            }

            setTimeout(() => ListingPage.map && ListingPage.map.invalidateSize(), 100);

        }

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
