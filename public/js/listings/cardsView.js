// ============================================================
//  Hirdetés-kártyák (mint egy hirdetési oldalon)
// ============================================================

class CardsView {

    static PAGE_SIZE = 24;
    static page = 0;
    static lista = [];

    static init() {

        document.getElementById("cardSort").addEventListener("change", () => {
            CardsView.page = 0;
            CardsView.render(CardsView.lista);
        });

        document.querySelectorAll('input[name="viewMode"]').forEach(r => {
            r.addEventListener("change", () => CardsView.setMode(r.value));
        });

        let mode = "cards";
        try { mode = localStorage.getItem("viewMode") || "cards"; } catch (e) { /* nem kritikus */ }

        document.getElementById(mode === "table" ? "viewTable" : "viewCards").checked = true;
        CardsView.setMode(mode);

    }

    static setMode(mode) {

        document.getElementById("cardsView").style.display = mode === "cards" ? "" : "none";
        document.getElementById("tableView").style.display = mode === "table" ? "" : "none";
        document.getElementById("cardSortBox").style.visibility = mode === "cards" ? "visible" : "hidden";

        try { localStorage.setItem("viewMode", mode); } catch (e) { /* nem kritikus */ }

    }

    static sorted(lista) {

        const s = document.getElementById("cardSort").value;
        const l = [...lista];

        const cmp = {
            newest: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0) || b.id - a.id,
            priceAsc: (a, b) => (a.ar || Infinity) - (b.ar || Infinity),
            priceDesc: (a, b) => (b.ar || 0) - (a.ar || 0),
            nmAsc: (a, b) => (Utils.arNm(a) || Infinity) - (Utils.arNm(b) || Infinity),
            areaDesc: (a, b) => (b.nm || 0) - (a.nm || 0)
        }[s];

        // A hiányos alapadatú hirdetések mindig a lista végére kerülnek
        const hibas = i => !(i.ar > 0 && i.nm > 0);

        return l.sort((a, b) => (hibas(a) - hibas(b)) || cmp(a, b));

    }

    static facts(i) {

        const f = Types.get(i.tipus).fields;
        const out = [];

        if (i.nm) out.push(`<span><i class="fa-solid fa-ruler-combined"></i> ${Utils.num(i.nm)} m²</span>`);
        if (f.szobak && i.szobak) out.push(`<span><i class="fa-solid fa-bed"></i> ${I18n.f("roomsLabel", { n: i.szobak })}</span>`);
        if (f.emelet && i.emelet) out.push(`<span><i class="fa-solid fa-stairs"></i> ${Utils.escape(Utils.emeletLabel(i.emelet))}</span>`);
        if (f.telek && i.telek_nm) out.push(`<span><i class="fa-solid fa-tree"></i> ${Utils.num(i.telek_nm)} m²</span>`);

        return out.join("");

    }

    static cardHtml(i) {

        const foto = Utils.photoUrl(i);
        const cim = i.cim || `${Types.label(i.tipus)} · ${CityManager.displayName(i.varos)}`;
        const hely = [CityManager.displayName(i.varos), i.kerulet].filter(Boolean).join(" · ");
        const fav = DataManager.isFavorite(i.id);

        const badges = (i.forrasok || [i.forras]).map(k => Sources.badge(k)).join(" ");

        const hianyos = Array.isArray(i.hianyzo) && i.hianyzo.length;

        return `
            <div class="col-sm-6 col-xl-4 col-4k-3">
                <article class="listingCard" data-id="${i.id}">
                    <div class="listingThumb">
                        ${foto
                            ? `<img src="${Utils.escape(foto)}" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.parentElement.classList.add('noPhoto');this.remove();">`
                            : ""}
                        <span class="listingThumbEmpty"><i class="${Types.get(i.tipus).icon}"></i></span>
                        <button class="favBtn ${fav ? "active" : ""}" data-fav="${i.id}" title="${I18n.t("favAdd")}">${fav ? "★" : "☆"}</button>
                        ${i.kep_db > 1 ? `<span class="photoCount"><i class="fa-solid fa-camera"></i> ${i.kep_db}</span>` : ""}
                    </div>
                    <div class="listingBody">
                        <div class="listingPrice">${Utils.price(i)}</div>
                        <div class="listingNm">${Utils.arNm(i) ? Utils.eurNm(Utils.arNm(i)) : ""}</div>
                        <h6 class="listingTitle">${Utils.escape(cim)}</h6>
                        <div class="listingFacts">${CardsView.facts(i)}</div>
                        <div class="listingPlace"><i class="fa-solid fa-location-dot"></i> ${Utils.escape(hely)}</div>
                        <div class="listingBadges">${badges}${i.ellenorzott === false ? ` <span class="badge text-bg-light" title="${I18n.t("unverifiedHint")}"><i class="fa-solid fa-hourglass-half"></i> ${I18n.t("unverified")}</span>` : ""}${hianyos && AuthManager.isAdmin() ? ` <span class="badge text-bg-warning" title="${I18n.t("incompleteHint")}"><i class="fa-solid fa-triangle-exclamation"></i> ${I18n.t("incomplete")}</span>` : ""}</div>
                    </div>
                </article>
            </div>`;

    }

    static render(lista, resetPage) {

        CardsView.lista = lista;

        if (resetPage) CardsView.page = 0;

        const grid = document.getElementById("cardsGrid");

        if (!grid) return;

        const rendezett = CardsView.sorted(lista);
        const oldalak = Math.max(1, Math.ceil(rendezett.length / CardsView.PAGE_SIZE));

        CardsView.page = Math.min(CardsView.page, oldalak - 1);

        const resz = rendezett.slice(CardsView.page * CardsView.PAGE_SIZE, (CardsView.page + 1) * CardsView.PAGE_SIZE);

        grid.innerHTML = resz.length
            ? resz.map(CardsView.cardHtml).join("")
            : `<div class="col-12"><div class="emptyState"><i class="fa-solid fa-magnifying-glass"></i><h5>${I18n.t("currentNoResults")}</h5></div></div>`;

        grid.querySelectorAll(".listingCard").forEach(card => {
            card.addEventListener("click", e => {
                const favBtn = e.target.closest("[data-fav]");
                if (favBtn) {
                    e.stopPropagation();
                    DataManager.toggleFavorite(Number(favBtn.dataset.fav));
                    return;
                }
                ListingPage.open(Number(card.dataset.id));
            });
        });

        CardsView.renderPager(oldalak);

    }

    static renderPager(oldalak) {

        const pager = document.getElementById("cardsPager");

        if (oldalak <= 1) {
            pager.innerHTML = "";
            return;
        }

        const p = CardsView.page;
        const gombok = [];

        const gomb = (idx, label, disabled, active) =>
            `<li class="page-item ${disabled ? "disabled" : ""} ${active ? "active" : ""}"><button class="page-link" data-page="${idx}">${label}</button></li>`;

        gombok.push(gomb(p - 1, "‹", p === 0, false));

        for (let i = 0; i < oldalak; i++) {
            if (i === 0 || i === oldalak - 1 || Math.abs(i - p) <= 2) {
                gombok.push(gomb(i, i + 1, false, i === p));
            } else if (Math.abs(i - p) === 3) {
                gombok.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
            }
        }

        gombok.push(gomb(p + 1, "›", p === oldalak - 1, false));

        pager.innerHTML = `<ul class="pagination pagination-sm mb-0">${gombok.join("")}</ul>`;

        pager.querySelectorAll("[data-page]").forEach(b => {
            b.onclick = () => {
                CardsView.page = Number(b.dataset.page);
                CardsView.render(CardsView.lista);
                document.getElementById("cardsView").scrollIntoView({ behavior: "smooth", block: "start" });
            };
        });

    }

    static refreshFavorites() {
        document.querySelectorAll("#cardsGrid [data-fav]").forEach(b => {
            const fav = DataManager.isFavorite(Number(b.dataset.fav));
            b.classList.toggle("active", fav);
            b.textContent = fav ? "★" : "☆";
        });
    }

}
