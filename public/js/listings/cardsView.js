// ============================================================
//  Hirdetés-kártyák (mint egy hirdetési oldalon)
// ============================================================

class CardsView {

    static PAGE_SIZE = 24;
    static MAX_KEP = 15;
    static objektumok = new Map();      // a kártyákon látható hirdetések (azonosító → adatok)
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

        // Elrendezés (hány kártya egy sorban) – a böngésző megjegyzi
        try { CardsView.cols = Number(localStorage.getItem("cardCols")) || 3; } catch (e) { /* nem kritikus */ }
        if (!CardsView.COLS[CardsView.cols]) CardsView.cols = 3;
        document.querySelectorAll("[data-cols]").forEach(b => {
            b.addEventListener("click", () => CardsView.setCols(Number(b.dataset.cols)));
        });
        CardsView.markCols();

        let mode = "cards";
        try { mode = localStorage.getItem("viewMode") || "cards"; } catch (e) { /* nem kritikus */ }

        document.getElementById(mode === "table" ? "viewTable" : "viewCards").checked = true;
        CardsView.setMode(mode);

    }

    static setCols(n) {
        if (!CardsView.COLS[n]) return;
        CardsView.cols = n;
        try { localStorage.setItem("cardCols", String(n)); } catch (e) { /* nem kritikus */ }
        CardsView.markCols();
        CardsView.render(CardsView.lista);
    }

    static markCols() {
        document.querySelectorAll("[data-cols]").forEach(b => {
            const on = Number(b.dataset.cols) === CardsView.cols;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", on ? "true" : "false");
        });
    }

    static setMode(mode) {

        document.getElementById("cardsView").style.display = mode === "cards" ? "" : "none";
        document.getElementById("tableView").style.display = mode === "table" ? "" : "none";
        document.getElementById("cardSortBox").style.visibility = mode === "cards" ? "visible" : "hidden";
        const cb = document.getElementById("cardColsBox");
        if (cb) cb.style.visibility = mode === "cards" ? "visible" : "hidden";

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

        // A kiemelt (promóciós) hirdetések a lista elején
        return l.sort((a, b) => (hibas(a) - hibas(b)) || (CardsView.kiemelt(b) - CardsView.kiemelt(a)) || cmp(a, b));

    }

    // Kiemelt (promóciós) hirdetés: a kiemelés még tart
    static kiemelt(i) {
        return i && i.kiemelt_ig && new Date(i.kiemelt_ig) > new Date() ? 1 : 0;
    }

    // A fő adatok címkével (a kártya adatrácsa)
    static adatok(i) {

        const f = Types.get(i.tipus).fields;
        const out = [];
        const add = (icon, label, value) => out.push({ icon, label, value });

        if (i.nm) add("fa-solid fa-ruler-combined", I18n.t(i.tipus === "telek" ? "cfLand" : "cfArea"), Utils.nm(i.nm));
        if (f.szobak && i.szobak) add("fa-solid fa-bed", I18n.t("cfRooms"), String(i.szobak));
        if (f.emelet && i.emelet) add("fa-solid fa-stairs", I18n.t("cfFloor"), CardsView.emelet(i.emelet));
        if (f.allapot && i.allapot) add("fa-solid fa-screwdriver-wrench", I18n.t("cfCond"), Utils.allapotLabel(i.allapot));
        if (f.telek && i.telek_nm) add("fa-solid fa-tree", I18n.t("cfPlot"), Utils.nm(i.telek_nm));
        if (i.tipus === "telek" && i.telek_jelleg) add("fa-solid fa-signs-post", I18n.t("cfKind"), I18n.t("jelleg_" + i.telek_jelleg));
        if (i.evszam) add("fa-regular fa-calendar", I18n.t("cfYear"), String(Number(i.evszam)));

        return out;

    }

    // (régi hívóknak) a fő adatok rövid, ikonos formában
    static facts(i) {
        return CardsView.adatok(i).map(a => `<span><i class="${a.icon}"></i> ${Utils.escape(a.value)}</span>`).join("");
    }

    // Emelet a kártyán: a pontos szám, és ha ismert, az épület szintjei (pl. "2. emelet / 4")
    static emelet(e) {
        const str = String(e).trim();
        const m = str.match(/\/\s*(\d+)/);
        // Földszint (P, parter, fsz) – a szám helyett szöveg
        if (/^(p|parter|fsz|f\.?sz)\b/i.test(str)) return I18n.t("groundFloorLabel") + (m ? ` / ${m[1]}` : "");
        const n = Utils.emeletSzam(e);
        if (n === null) return str;
        const alap = n <= 0 ? I18n.t("groundFloorLabel") : String(n);
        return m ? `${alap} / ${m[1]}` : alap;
    }

    // A hirdetés képei (saját feltöltöttek, vagy a forrásoldalról beolvasottak)
    static kepek(i) {
        if (Array.isArray(i.kep_idk) && i.kep_idk.length) return i.kep_idk.slice(0, CardsView.MAX_KEP).map(id => "/api/kepek/" + id);
        if (i.kep_id) return ["/api/kepek/" + i.kep_id];
        if (Array.isArray(i.kulso_kepek) && i.kulso_kepek.length) return i.kulso_kepek.slice(0, CardsView.MAX_KEP).map(Utils.imgUrl);
        return [];
    }

    // Lapozható képsáv a kártya tetején (ujjal húzható, egérrel a nyilakkal);
    // csak az első kép töltődik be azonnal, a többi lapozáskor
    static kepSav(i) {

        const kepek = CardsView.kepek(i);

        if (!kepek.length) return "";

        const sav = kepek.map((u, n) => n === 0
            ? `<img src="${Utils.escape(u)}" referrerpolicy="no-referrer" loading="lazy" alt="">`
            : `<img data-src="${Utils.escape(u)}" referrerpolicy="no-referrer" alt="">`).join("");

        return `
            <div class="thumbStrip" data-strip>${sav}</div>
            ${kepek.length > 1 ? `
                <button type="button" class="thumbNav prev" data-nav="-1" aria-label="${Utils.escape(I18n.t("cardPhotoPrev"))}"><i class="fa-solid fa-chevron-left"></i></button>
                <button type="button" class="thumbNav next" data-nav="1" aria-label="${Utils.escape(I18n.t("cardPhotoNext"))}"><i class="fa-solid fa-chevron-right"></i></button>` : ""}`;

    }

    // Elrendezés: hány kártya legyen egy sorban (1 = nagy, fekvő kártyák)
    static COLS = {
        1: "col-12",
        2: "col-sm-6",
        3: "col-sm-6 col-lg-4",
        4: "col-sm-6 col-lg-4 col-xxl-3"
    };
    static cols = 3;

    static cardHtml(i, opts = {}) {

        CardsView.objektumok.set(i.id, i);

        const t = Types.get(i.tipus);
        const kepek = CardsView.kepek(i);
        const reszNev = CityManager.helyReszLabel(i);
        const cim = i.cim || `${Types.label(i.tipus)} · ${reszNev || CityManager.displayName(i.varos)}`;
        const hely = CityManager.helyLabel(i);
        const fav = DataManager.isFavorite(i.id);
        const kiemelt = CardsView.kiemelt(i);
        const hianyos = Array.isArray(i.hianyzo) && i.hianyzo.length;
        const admin = AuthManager.resz("ellenorzes");

        const kulso = ListingPage.forrasra(i);
        const terkep = Number(i.x) && Number(i.y);
        const szeles = !!opts.wide;
        const oszlop = opts.col || "col-sm-6 col-xl-4 col-4k-3";

        // A forrás(ok) – mindegyik egyszer; ha kattintásra oda visz, nyíl jelzi
        const fo = Sources.fromLink(i.link);
        const forrasok = [...new Set(i.forrasok || [i.forras || fo])];
        const forrasChip = k => {
            const ki = kulso && k === fo;
            return `<span class="ipSrc${k === "local" ? " isLocal" : ""}${ki ? " isExt" : ""}"${ki ? ` title="${Utils.escape(I18n.f("cardExtTitle", { s: Sources.label(k) }))}"` : ""}>
                <i class="${k === "local" ? "fa-solid fa-house-flag" : "fa-solid fa-globe"}" aria-hidden="true"></i>${Utils.escape(k === "local" ? "IngatlanPro" : Sources.label(k))}${ki ? ` <i class="fa-solid fa-arrow-up-right-from-square ipSrcGo" aria-hidden="true"></i>` : ""}
            </span>`;
        };

        const adatok = CardsView.adatok(i);

        // Admin: kattintásra mi nyíljon meg (közvetlenül a kártyán)
        const linkOk = fo !== "local" && fo !== "other";
        const nyitasValaszto = admin && linkOk ? `
            <label class="ipOpenSel" title="${Utils.escape(I18n.t("openModeLabel"))}">
                <i class="fa-solid fa-arrow-pointer" aria-hidden="true"></i> <span>${I18n.t("cardOpenLabel")}</span>
                <select data-openmode="${i.id}" aria-label="${Utils.escape(I18n.t("openModeLabel"))}">
                    <option value="auto" ${!i.megnyitas ? "selected" : ""}>${Utils.escape(I18n.f("cardOpenAuto", { m: I18n.t(ListingPage.autoMod(i) === "forras" ? "cardOpenSrcShort" : "cardOpenPageShort") }))}</option>
                    <option value="forras" ${i.megnyitas === "forras" ? "selected" : ""}>${Utils.escape(I18n.t("cardOpenSrcShort"))}</option>
                    <option value="lap" ${i.megnyitas === "lap" ? "selected" : ""}>${Utils.escape(I18n.t("cardOpenPageShort"))}</option>
                </select>
            </label>` : "";

        const jelzesek = [
            i.ellenorzott === false ? `<span class="ipFlag" title="${Utils.escape(I18n.t("unverifiedHint"))}"><i class="fa-solid fa-hourglass-half"></i> ${I18n.t("unverified")}</span>` : "",
            hianyos && AuthManager.isAdmin() ? `<span class="ipFlag isWarn" title="${Utils.escape(I18n.t("incompleteHint"))}"><i class="fa-solid fa-triangle-exclamation"></i> ${I18n.t("incomplete")}</span>` : ""
        ].join("");

        return `
            <div class="${oszlop}">
                <article class="listingCard ipCard${szeles ? " ipWide" : ""}${kiemelt ? " isFeatured" : ""}${kulso ? " isExternal" : ""}" data-id="${i.id}"${kulso ? ` title="${Utils.escape(I18n.f("cardExtTitle", { s: Sources.label(fo) }))}"` : ""}>

                    <div class="listingThumb ipMedia${kepek.length ? "" : " noPhoto"}" data-tipus="${Utils.escape(i.tipus || "")}">
                        ${CardsView.kepSav(i)}
                        <span class="listingThumbEmpty"><i class="${t.icon}"></i><small>${Utils.escape(reszNev || Types.label(i.tipus))}</small></span>
                        <div class="ipChips">
                            <span class="ipChip"><i class="${t.icon}" aria-hidden="true"></i> ${Utils.escape(Types.label(i.tipus))}</span>
                            <span class="ipChip isDeal">${Utils.escape(Types.ugyletLabel(i.ugylet))}</span>
                            ${kiemelt ? `<span class="ipChip isFeat"><i class="fa-solid fa-star" aria-hidden="true"></i> ${I18n.t("featured")}</span>` : ""}
                            ${i.eladva ? `<span class="ipChip isSold">${I18n.t("dbEladva")}</span>` : ""}
                        </div>
                        <button class="favBtn ipFav ${fav ? "active" : ""}" data-fav="${i.id}" title="${I18n.t("favAdd")}" aria-label="${Utils.escape(I18n.t("favAdd"))}">${fav ? "★" : "☆"}</button>
                        ${kepek.length > 1 ? `<span class="photoCount ipCount" data-count><i class="fa-solid fa-camera"></i> <b>1</b> / ${kepek.length}</span>` : ""}
                    </div>

                    <div class="ipBody">

                        <div class="ipPriceRow">
                            <span class="ipPrice">${Utils.price(i)}</span>
                            ${Utils.arNm(i) ? `<span class="ipPpm">${Utils.eurNm(Utils.arNm(i))}</span>` : ""}
                        </div>

                        <h3 class="ipTitle">${Utils.escape(cim)}</h3>

                        <div class="ipPlace"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> <span>${Utils.escape(hely)}</span> ${Utils.helyBadge(i)}</div>

                        ${adatok.length ? `
                        <dl class="ipSpecs">
                            ${adatok.map(a => `
                                <div class="ipSpec">
                                    <dt><i class="${a.icon}" aria-hidden="true"></i> ${Utils.escape(a.label)}</dt>
                                    <dd>${Utils.escape(a.value)}</dd>
                                </div>`).join("")}
                        </dl>` : ""}

                        ${i.iroda_nev ? `<div class="ipAgency"><i class="fa-solid fa-briefcase" aria-hidden="true"></i> <span>${Utils.escape(i.iroda_nev)}</span></div>` : ""}

                        ${jelzesek ? `<div class="ipFlags">${jelzesek}</div>` : ""}

                        ${nyitasValaszto || (kulso && admin) ? `
                        <div class="ipAdmin">
                            ${nyitasValaszto}
                            ${kulso && admin ? `<button type="button" class="ipIconBtn" data-lap="${i.id}" title="${Utils.escape(I18n.t("cardAdminPage"))}" aria-label="${Utils.escape(I18n.t("cardAdminPage"))}"><i class="fa-solid fa-file-lines"></i></button>` : ""}
                        </div>` : ""}

                        <div class="ipFoot">
                            <div class="ipSrcs">${forrasok.map(forrasChip).join("")}</div>
                            <div class="ipActions">
                                ${terkep ? `<button type="button" class="ipMapBtn" data-map="${i.id}" title="${Utils.escape(I18n.t("cardShowOnMap"))}"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i> <span>${I18n.t("cardShowOnMapShort")}</span></button>` : ""}
                            </div>
                        </div>

                    </div>
                </article>
            </div>`;

    }

    // A kártyák eseményei (a találati lista és a kezdőlap kiemelt kártyái is ezt használják)
    static bindCards(root) {

        if (!root) return;

        root.querySelectorAll(".listingCard").forEach(card => {

            if (card.dataset.bound) return;
            card.dataset.bound = "1";

            const id = Number(card.dataset.id);

            CardsView.bindStrip(card);

            const sel = card.querySelector("[data-openmode]");
            if (sel) sel.addEventListener("change", () => {
                sel.disabled = true;
                ListingPage.setMegnyitas([id], sel.value)
                    .then(() => {
                        if (typeof Utils.toast === "function") Utils.toast(I18n.t("openModeSaved"));
                        if (document.getElementById("cardsGrid") && CardsView.lista.length) CardsView.render(CardsView.lista);
                        if (PageManager.current === "home" && typeof HomePage !== "undefined") HomePage.render();
                    })
                    .catch(() => { alert(I18n.t("bulkAlertError")); sel.disabled = false; });
            });

            card.addEventListener("click", e => {

                const favBtn = e.target.closest("[data-fav]");
                if (favBtn) {
                    e.stopPropagation();
                    DataManager.toggleFavorite(Number(favBtn.dataset.fav));
                    return;
                }

                if (e.target.closest("[data-nav]") || e.target.closest(".ipOpenSel")) return;

                if (e.target.closest("[data-map]")) {
                    e.stopPropagation();
                    CardsView.showOnMap(id);
                    return;
                }

                if (e.target.closest("[data-lap]")) {
                    e.stopPropagation();
                    PageManager.show("listing/" + id);
                    return;
                }

                ListingPage.open(id, CardsView.objektumok.get(id));

            });

        });

    }

    // A képsáv lapozása: nyilak, húzás, számláló, a következő kép előtöltése
    static bindStrip(card) {

        const strip = card.querySelector("[data-strip]");
        if (!strip) return;

        const thumb = card.querySelector(".listingThumb");
        const szamlalo = card.querySelector("[data-count]");

        const betolt = idx => {
            [idx, idx + 1].forEach(n => {
                const img = strip.children[n];
                if (img && img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute("data-src");
                }
            });
        };

        const aktualis = () => Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth));

        const frissit = () => {
            const n = strip.children.length;
            const idx = Math.min(aktualis(), n - 1);
            betolt(idx);
            if (szamlalo) {
                szamlalo.hidden = n < 2;
                const b = szamlalo.querySelector("b");
                if (b) b.textContent = idx + 1;
                szamlalo.lastChild.textContent = " / " + n;
            }
            card.querySelectorAll("[data-nav]").forEach(b => { b.hidden = n < 2; });
        };

        // A hibás (már nem elérhető) kép kimarad; ha egy sem maradt, a "nincs fotó" kép
        strip.querySelectorAll("img").forEach(img => {
            img.addEventListener("error", () => {
                img.remove();
                if (!strip.children.length) {
                    thumb.classList.add("noPhoto");
                    strip.remove();
                    card.querySelectorAll("[data-nav], [data-count]").forEach(el => el.remove());
                    return;
                }
                frissit();
            });
        });

        let idozito = null;
        strip.addEventListener("scroll", () => {
            clearTimeout(idozito);
            idozito = setTimeout(frissit, 60);
        }, { passive: true });

        card.querySelectorAll("[data-nav]").forEach(b => {
            b.addEventListener("click", e => {
                e.stopPropagation();
                e.preventDefault();
                const n = strip.children.length;
                let idx = aktualis() + Number(b.dataset.nav);
                if (idx < 0) idx = n - 1;
                if (idx >= n) idx = 0;
                betolt(idx);
                strip.scrollTo({ left: idx * strip.clientWidth, behavior: "smooth" });
            });
        });

        // Egérrel előre betöltjük a 2. képet, hogy a lapozás ne villanjon
        thumb.addEventListener("mouseenter", () => betolt(aktualis()), { once: true });

    }

    // "Megnyitás térképen": a térkép oldal, a hirdetés jelölője kinyitva
    static showOnMap(id) {

        const i = CardsView.objektumok.get(id) || DataManager.ingatlanok.find(x => x.id === id);
        if (!i) return;

        // A közelítő helyű hirdetés jelölője csak bekapcsolt közelítő helyekkel látszik
        if (i.hely_pontossag === "kozelito" && !MapManager.opts.kozelito) {
            MapManager.opts.kozelito = true;
            MapManager.saveOpts();
            MapManager.dirty = true;
        }

        PageManager.show("map");

        setTimeout(() => {
            if (MapManager.dirty) MapManager.load(DataManager.szurtIngatlanok);
            // A térkép a szűrt hirdetéseket mutatja – ha ez nincs köztük, betesszük
            if (!MapManager.markerMap.has(i.id)) {
                MapManager.load([...DataManager.szurtIngatlanok, i]);
            }
            AppController.select(i);
        }, 350);

    }

    static render(lista, resetPage) {

        CardsView.lista = lista;

        if (resetPage) CardsView.page = 0;

        const grid = document.getElementById("cardsGrid");

        if (!grid) return;

        const rendezett = CardsView.sorted(lista);

        // Reklámhelyek a kártyák között (oldalanként, csak ha elég találat van):
        // egy kártya méretű az 5. kártya után, és egy teljes széles a 12. cella
        // után (2, 3 és 4 oszlopnál is egy sor vége) – a hirdetések sorrendjét
        // nem változtatják
        const reklam = typeof AdSlots !== "undefined" && rendezett.length >= AdSlots.FEED_MIN;
        const feed = reklam ? AdSlots.feedCol() : "";
        const szeles = reklam ? AdSlots.feedWideCol() : "";

        // Ha a kártyák között reklám cella is van, egy hirdetéssel kevesebb fér
        // egy oldalra – így a rács sorai teliek maradnak (24 cella)
        const meret = feed ? CardsView.PAGE_SIZE - 1 : CardsView.PAGE_SIZE;
        const oldalak = Math.max(1, Math.ceil(rendezett.length / meret));

        CardsView.page = Math.min(CardsView.page, oldalak - 1);

        const resz = rendezett.slice(CardsView.page * meret, (CardsView.page + 1) * meret);

        const kartyak = resz.map(i => CardsView.cardHtml(i, { col: CardsView.COLS[CardsView.cols], wide: CardsView.cols === 1 }));
        if (feed && resz.length >= AdSlots.FEED_MIN) kartyak.splice(AdSlots.FEED_UTAN, 0, feed);
        if (szeles && kartyak.length > AdSlots.FEED_SZELES_UTAN) kartyak.splice(AdSlots.FEED_SZELES_UTAN, 0, szeles);

        grid.dataset.cols = CardsView.cols;

        grid.innerHTML = resz.length
            ? kartyak.join("")
            : `<div class="col-12"><div class="emptyState"><i class="fa-solid fa-magnifying-glass"></i><h5>${I18n.t("currentNoResults")}</h5></div></div>`;

        CardsView.bindCards(grid);

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
        document.querySelectorAll(".listingCard [data-fav]").forEach(b => {
            const fav = DataManager.isFavorite(Number(b.dataset.fav));
            b.classList.toggle("active", fav);
            b.textContent = fav ? "★" : "☆";
        });
    }

}
