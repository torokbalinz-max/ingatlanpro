// ============================================================
//  Kezdőlap: kereső, élő számok, kategóriák (a részletes leírás a Súgó oldalon)
//  + oldal-súgók ("Hogyan működik?" gomb az oldalak fejlécében)
// ============================================================

class HomePage {

    // Fotók: Unsplash (szabadon felhasználható, forrásmegjelölés nélkül) –
    // erdélyi, romániai képek (nem a szokásos amerikai belsőépítészeti fotók)
    static FOTO = id => `https://images.unsplash.com/${id}?auto=format&fit=crop&q=75`;

    static KEPEK = {
        hero: "photo-1644347760697-041c8324029f",          // színes óvárosi házsor, mögötte őszi erdős hegy (Brassó)
        lakas: "photo-1755933780910-23850458afed",         // tömbházak, mögöttük a hegyek
        haz: "photo-1620418739542-40fce94d7639",           // oszlopos tornácú erdélyi kúria
        telek: "photo-1700156968085-164d37155f10",         // dombok közé épült falu
        kereskedelmi: "photo-1696783576440-be3ba9abfdf7"   // üzletes óvárosi utca (Segesvár)
    };

    // "Mit tudsz itt csinálni?" – két út: aki vásárolna / bérelne, és aki eladna / kiadna.
    // Így mindenki a neki szóló funkciókat látja együtt (és rátalál, mi mindent tud az oldal).
    static UTAK = [
        {
            k: "buy", icon: "fa-solid fa-magnifying-glass-location", cim: "homePathBuyTitle", szoveg: "homePathBuyText",
            pontok: [
                { icon: "fa-solid fa-house", cim: "menuIngatlanok", szoveg: "homePathBuy1", hova: "properties", fo: true },
                { icon: "fa-solid fa-map-location-dot", cim: "mapTitle", szoveg: "homeFeatMapText", hova: "map" },
                { icon: "fa-solid fa-calendar-check", cim: "homePathBuyViewing", szoveg: "homePathBuyViewingText", hova: "erdeklodes" },
                { icon: "fa-solid fa-bullhorn", cim: "navBuyRequest", szoveg: "homeFeatReqText", hova: "igenyek" },
                { icon: "fa-solid fa-star", cim: "menuKedvencek", szoveg: "homePathBuyFav", hova: "favorites" }
            ]
        },
        {
            k: "sell", icon: "fa-solid fa-key", cim: "homePathSellTitle", szoveg: "homePathSellText",
            pontok: [
                { icon: "fa-solid fa-key", cim: "menuEladjuk", szoveg: "homeFeatSellText", hova: "eladjuk", fo: true },
                { icon: "fa-solid fa-circle-plus", cim: "navSellPost", szoveg: "navSellPostDesc", hova: "new" },
                { icon: "fa-solid fa-calculator", cim: "navSellValue", szoveg: "homeFeatValText", hova: "valuation" },
                { icon: "fa-solid fa-tags", cim: "menuCsomagok", szoveg: "homeFeatPricesText", hova: "csomagok" }
            ]
        }
    ];

    // A piac eszközei (mindenkinek)
    static ESZKOZOK = [
        { icon: "fa-solid fa-chart-line", cim: "homeFeatMarketTitle", szoveg: "homeFeatMarketText", hova: "market" },
        { icon: "fa-solid fa-briefcase", cim: "homeFeatAgTitle", szoveg: "homeFeatAgText", hova: "irodak" }
    ];

    static stats() {

        const lista = DataManager.ingatlanok || [];
        const lakas = lista.filter(i => (i.tipus || "lakas") === "lakas" && (i.ugylet || "elado") === "elado" && Utils.verified(i) && i.ar > 0 && i.nm > 0);
        const atlag = lakas.length ? lakas.reduce((s, i) => s + i.ar / i.nm, 0) / lakas.length : null;

        return {
            db: lista.length,
            varos: CityManager.displayName(DataManager.currentCity),
            atlag,
            foto: lista.filter(Utils.hasPhoto).length,
            ujHet: lista.filter(i => i.created_at && new Date(i.created_at).getTime() >= Date.now() - 7 * 86400000).length
        };

    }

    // Kereső a kezdőlapon: beállítja a szűrőket, és átvisz a hirdetésekhez
    static go(opts) {

        if (opts.ugylet) {
            FilterManager.ugylet = opts.ugylet;
            const r = document.getElementById(opts.ugylet === "kiado" ? "ugyletKiado" : "ugyletElado");
            if (r) r.checked = true;
        }

        if (opts.tipus) {
            FilterManager.tipus = opts.tipus;
            FilterManager.renderTypes();
        }

        FilterManager.onTypeChange();

        const cel = opts.page || "properties";

        if (opts.varos && opts.varos !== DataManager.currentCity) {
            const sel = document.getElementById("citySelect");
            sel.value = opts.varos;
            sel.dispatchEvent(new Event("change"));
        } else {
            FilterManager.apply();
        }

        PageManager.show(cel);

    }

    static render() {

        const box = document.getElementById("homeContent");
        if (!box) return;

        const t = I18n.t.bind(I18n);
        const s = HomePage.stats();
        const esc = Utils.escape;
        const lista = DataManager.ingatlanok || [];

        const db = tipus => lista.filter(i => (i.tipus || "lakas") === tipus).length;

        // Kiemelt (promóciós) hirdetések – legfeljebb 6, véletlen sorrendben
        const kiemeltek = lista.filter(i => CardsView.kiemelt(i))
            .map(i => [Math.random(), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]).slice(0, 6);

        const varosOpciok = [...CityManager.varosok].map(v => v.nev)
            .sort((a, b) => CityManager.displayName(a).localeCompare(CityManager.displayName(b), "hu"))
            .map(n => `<option value="${esc(n)}" ${n === DataManager.currentCity ? "selected" : ""}>${esc(CityManager.displayName(n))}</option>`).join("");

        const tipusOpciok = Types.LIST.map(x => `<option value="${x.key}" ${x.key === FilterManager.tipus ? "selected" : ""}>${t(x.label)}</option>`).join("");

        const kat = [
            { tipus: "lakas", cim: "homeCatLakas", kep: "lakas", cls: "catBig" },
            { tipus: "haz", cim: "homeCatHaz", kep: "haz" },
            { tipus: "telek", cim: "homeCatTelek", kep: "telek" },
            { tipus: "kereskedelmi", cim: "homeCatUzlet", kep: "kereskedelmi" }
        ];

        box.innerHTML = `

            <section class="homeHero">
                <div class="homeHeroText">
                    <h1>${t("homeTitle")}</h1>
                    <p class="homeLead">${t("homeSub")}</p>

                    <form class="heroSearch" id="heroSearch" role="search">
                        <div class="btn-group heroDeal" role="group" aria-label="${t("ugyletLabel")}">
                            <input type="radio" class="btn-check" name="heroUgylet" id="heroElado" value="elado" ${FilterManager.ugylet !== "kiado" ? "checked" : ""}>
                            <label class="btn btn-outline-secondary" for="heroElado">${t("ugyletElado")}</label>
                            <input type="radio" class="btn-check" name="heroUgylet" id="heroKiado" value="kiado" ${FilterManager.ugylet === "kiado" ? "checked" : ""}>
                            <label class="btn btn-outline-secondary" for="heroKiado">${t("ugyletKiado")}</label>
                        </div>
                        <div class="heroFields">
                            <label class="heroField">
                                <span>${t("searchVaros")}</span>
                                <select class="form-select" id="heroVaros">${varosOpciok}</select>
                            </label>
                            <label class="heroField">
                                <span>${t("typeLabel")}</span>
                                <select class="form-select" id="heroTipus">${tipusOpciok}</select>
                            </label>
                            <button class="btn btn-primary btn-lg heroGo" type="submit"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> ${t("keresesBtn")}</button>
                        </div>
                    </form>

                    <div class="heroLinks">
                        <a href="#map" id="heroMap"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i> ${t("homeOnMap")}</a>
                        <a href="#new"><i class="fa-solid fa-circle-plus" aria-hidden="true"></i> ${t("homeCtaPost")}</a>
                    </div>
                </div>

                <div class="homeHeroMedia">
                    <img src="${HomePage.FOTO(HomePage.KEPEK.hero)}&w=1400" alt="" fetchpriority="high" width="1400" height="1000" onerror="this.parentElement.classList.add('noImg');this.remove();">
                    <div class="heroBadge">
                        <b>${Utils.num(s.db)}</b>
                        <span>${t("homeStatListings")} · ${esc(s.varos)}</span>
                    </div>
                </div>
            </section>

            <section class="homeStats" aria-label="${esc(s.varos)}">
                <div><b>${Utils.num(s.db)}</b><span>${t("homeStatListings")}</span></div>
                <div><b>${esc(s.varos)}</b><span>${t("homeStatCity")}</span></div>
                <div><b>${s.atlag ? Utils.eurNm(s.atlag) : "-"}</b><span>${t("homeStatAvg")}</span></div>
                ${s.foto > 0
                    ? `<div><b>${Utils.num(s.foto)}</b><span>${t("homeStatPhotos")}</span></div>`
                    : `<div><b>${Utils.num(s.ujHet)}</b><span>${t("dbNewWeek")}</span></div>`}
            </section>

            ${typeof AdSlots !== "undefined" ? AdSlots.slot("home_top", "homeAd homeAdTop") : ""}

            ${kiemeltek.length ? `
            <section class="homeSection homeFeatured">
                <div class="homeSectionHead">
                    <h2 class="homeH2"><i class="fa-solid fa-star text-warning" aria-hidden="true"></i> ${t("ftHomeTitle")}</h2>
                    <a href="#properties" class="homeAll">${t("homeAllListings")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
                </div>
                <div class="row g-3">${kiemeltek.map(i => CardsView.cardHtml(i)).join("")}</div>
            </section>` : ""}

            <section class="homeSection">
                <div class="homeSectionHead">
                    <h2 class="homeH2">${t("homeBrowseTitle")}</h2>
                    <a href="#properties" class="homeAll">${t("homeAllListings")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
                </div>
                <div class="catGrid">
                    ${kat.map(k => `
                        <a class="catTile ${k.cls || ""}" href="#properties" data-cat="${k.tipus}">
                            <img src="${HomePage.FOTO(HomePage.KEPEK[k.kep])}&w=${k.cls ? 1100 : 700}" alt="" loading="lazy" onerror="this.remove()">
                            <span class="catShade"></span>
                            <span class="catText">
                                <b>${t(k.cim)}</b>
                                <span>${I18n.f("homeCatCount", { n: Utils.num(db(k.tipus)) })}</span>
                            </span>
                        </a>`).join("")}
                </div>
            </section>

            <section class="homeSection">
                <h2 class="homeH2">${t("homeFeaturesTitle")}</h2>
                <div class="pathGrid">
                    ${HomePage.UTAK.map(u => `
                        <div class="pathCard path-${u.k}">
                            <div class="pathHead">
                                <span class="pathIcon"><i class="${u.icon}" aria-hidden="true"></i></span>
                                <div>
                                    <h3 class="pathTitle">${t(u.cim)}</h3>
                                    <p class="pathText">${t(Utils.ertekesites() ? u.szoveg : u.szoveg + "NoSales")}</p>
                                </div>
                            </div>
                            <div class="pathList">
                                ${u.pontok.filter(p => Utils.ertekesites() || !Utils.ERTEKESITES_OLDALAK.includes(p.hova)).map((p, i, l) => ({ ...p, fo: p.fo || (i === 0 && !l.some(x => x.fo)) })).map(p => `
                                    <a class="pathItem ${p.fo ? "fo" : ""}" href="#${p.hova}" ${p.hova === "map" ? 'data-feat="map"' : ""}>
                                        <i class="${p.icon}" aria-hidden="true"></i>
                                        <span><b>${t(p.cim)}</b><small>${t(p.szoveg)}</small></span>
                                        <i class="fa-solid fa-arrow-right pathArrow" aria-hidden="true"></i>
                                    </a>`).join("")}
                            </div>
                        </div>`).join("")}
                </div>
                <div class="toolGrid">
                    ${HomePage.ESZKOZOK.map(f => `
                        <a class="toolCard" href="#${f.hova}">
                            <span class="featIcon"><i class="${f.icon}" aria-hidden="true"></i></span>
                            <span><b>${t(f.cim)}</b><small>${t(f.szoveg)}</small></span>
                        </a>`).join("")}
                </div>
            </section>

            ${typeof AdSlots !== "undefined" ? AdSlots.slot("home", "homeAd") : ""}

            <section class="homeHelpStrip">
                <span class="homeHelpIcon"><i class="fa-solid fa-circle-question" aria-hidden="true"></i></span>
                <div>
                    <b>${t("homeHelpTitle")}</b>
                    <span>${t("homeHelpText")}</span>
                </div>
                <a class="btn btn-outline-primary btn-sm" href="#sugo">${t("homeHelpBtn")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
            </section>`;

        const ertek = () => ({
            ugylet: (box.querySelector('input[name="heroUgylet"]:checked') || {}).value || "elado",
            varos: document.getElementById("heroVaros").value,
            tipus: document.getElementById("heroTipus").value
        });

        document.getElementById("heroSearch").addEventListener("submit", e => {
            e.preventDefault();
            HomePage.go(ertek());
        });

        document.getElementById("heroMap").addEventListener("click", e => {
            e.preventDefault();
            HomePage.go({ ...ertek(), page: "map" });
        });

        // A térkép a keresés szűrőivel nyíljon (mint a hero-ban)
        const terkep = box.querySelector('[data-feat="map"]');
        if (terkep) terkep.addEventListener("click", e => {
            e.preventDefault();
            HomePage.go({ ...ertek(), page: "map" });
        });

        box.querySelectorAll(".homeFeatured .listingCard").forEach(k => {
            k.style.cursor = "pointer";
            k.addEventListener("click", e => {
                const fav = e.target.closest("[data-fav]");
                if (fav) {
                    e.stopPropagation();
                    DataManager.toggleFavorite(Number(fav.dataset.fav));
                    return;
                }
                window.location.hash = "listing/" + k.dataset.id;
            });
        });

        box.querySelectorAll("[data-cat]").forEach(a => {
            a.addEventListener("click", e => {
                e.preventDefault();
                HomePage.go({ tipus: a.dataset.cat });
            });
        });

    }

}

// ---------- Oldal-súgók ----------
//  <button data-help="properties"> a fejlécben -> alatta egy doboz a
//  help_properties pontjaival (i18n-extra.js)

class HelpManager {

    static init() {

        document.querySelectorAll("[data-help]").forEach(btn => {

            const key = btn.dataset.help;
            const panel = document.getElementById("help-" + key);
            if (!panel) return;

            btn.setAttribute("aria-controls", panel.id);
            btn.setAttribute("aria-expanded", "false");

            btn.addEventListener("click", () => {
                const nyitva = panel.hidden;
                panel.hidden = !nyitva;
                btn.setAttribute("aria-expanded", String(nyitva));
                if (nyitva) HelpManager.fill(key);
            });

        });

        I18n.onChange(() => {
            document.querySelectorAll(".pageHelp:not([hidden])").forEach(p => HelpManager.fill(p.id.replace("help-", "")));
        });

    }

    static fill(key) {
        const panel = document.getElementById("help-" + key);
        const pontok = I18n.t("help_" + key);
        if (!panel || !Array.isArray(pontok)) return;
        const tema = typeof HelpPage !== "undefined" ? HelpPage.OLDAL_TEMA[key] : null;
        panel.innerHTML = `<ul>${pontok.map(p => `<li>${Utils.escape(p)}</li>`).join("")}</ul>` +
            (tema ? `<a class="small" href="#sugo/${tema}"><i class="fa-solid fa-book-open" aria-hidden="true"></i> ${I18n.t("helpMoreLink")}</a>` : "");
    }

}
