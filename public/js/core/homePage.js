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

    // A kezdőlap "piaci tábla": a város eladó lakásainak átlagos €/m²-e, és kerületenként
    // (a legtöbb hirdetéssel rendelkező kerületek, legalább 2 lakással) – valós adat
    static piac() {

        const lista = (DataManager.ingatlanok || []).filter(i =>
            (i.tipus || "lakas") === "lakas" && (i.ugylet || "elado") === "elado" && Utils.verified(i) && i.ar > 0 && i.nm > 0);

        const atlag = lista.length ? lista.reduce((s, i) => s + i.ar / i.nm, 0) / lista.length : null;

        const csop = new Map();
        lista.forEach(i => {
            if (!i.kerulet) return;
            const c = csop.get(i.kerulet) || { nev: i.kerulet, db: 0, osszeg: 0 };
            c.db++;
            c.osszeg += i.ar / i.nm;
            csop.set(i.kerulet, c);
        });

        const keruletek = [...csop.values()]
            .filter(c => c.db >= 2)
            .sort((a, b) => b.db - a.db)
            .slice(0, 5)
            .map(c => ({ ...c, atlag: c.osszeg / c.db }))
            .sort((a, b) => b.atlag - a.atlag);

        return { atlag, db: lista.length, keruletek };

    }

    static render() {

        const box = document.getElementById("homeContent");
        if (!box) return;

        const t = I18n.t.bind(I18n);
        const s = HomePage.stats();
        const p = HomePage.piac();
        const esc = Utils.escape;
        const lista = DataManager.ingatlanok || [];

        const db = tipus => lista.filter(i => (i.tipus || "lakas") === tipus).length;
        const terkepen = typeof MapManager !== "undefined" ? lista.filter(i => MapManager.pontos(i)).length : 0;

        // Kiemelt (promóciós) hirdetések – legfeljebb 8, véletlen sorrendben
        const kiemeltek = lista.filter(i => CardsView.kiemelt(i))
            .map(i => [Math.random(), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]).slice(0, 8);

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

        // Az oldal fő funkciói egy sávban, élő számokkal – a hős rész alatt, azonnal látszanak
        const dock = [
            { hova: "properties", icon: "fa-solid fa-house", cim: "menuIngatlanok", meta: `${Utils.num(s.db)} ${t("homeStatListings")}`, go: true },
            { hova: "map", icon: "fa-solid fa-map-location-dot", cim: "mapTitle", meta: I18n.f("homeDockMap", { n: Utils.num(terkepen) }), go: true },
            { hova: "valuation", icon: "fa-solid fa-calculator", cim: "menuErtekbecslo", meta: t("homeDockVal") },
            { hova: "market", icon: "fa-solid fa-chart-line", cim: "menuStatisztika", meta: p.atlag ? I18n.f("homeDockMarket", { v: Utils.eurNm(p.atlag) }) : t("homeFeatMarketTitle") },
            { hova: "eladjuk", icon: "fa-solid fa-key", cim: "menuEladjuk", meta: t("homeDockSell") },
            { hova: "new", icon: "fa-solid fa-circle-plus", cim: "homeCtaPost", meta: t("homeDockPost") }
        ].filter(d => Utils.ertekesites() || !Utils.ERTEKESITES_OLDALAK.includes(d.hova));

        // A sávok hossza a kerületek közti különbséget mutatja (a legolcsóbb 35 %, a legdrágább 100 %)
        const kerArak = p.keruletek.map(k => k.atlag);
        const kMin = kerArak.length ? Math.min(...kerArak) : 0, kMax = kerArak.length ? Math.max(...kerArak) : 1;
        const savHossz = v => kMax > kMin ? Math.round(35 + 65 * (v - kMin) / (kMax - kMin)) : 100;

        box.innerHTML = `

            <section class="homeHero hv2">
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

                <div class="homeHeroVisual">
                    <div class="homeHeroMedia">
                        <img src="${HomePage.FOTO(HomePage.KEPEK.hero)}&w=1400" alt="" fetchpriority="high" width="1400" height="1000" onerror="this.parentElement.classList.add('noImg');this.remove();">
                    </div>

                    <a class="heroBoard" href="#market" aria-label="${esc(t("homeBoardLink"))}">
                        <span class="hbHead">
                            <span class="hbTitle">${t("homeBoardTitle")}</span>
                            <span class="hbCity">${esc(s.varos)}</span>
                        </span>
                        ${p.atlag ? `
                        <span class="hbAvg">
                            <b data-count>${Utils.eurNm(p.atlag)}</b>
                            <span>${t("homeBoardAvgLabel")}</span>
                        </span>
                        ${p.keruletek.length ? `
                        <span class="hbBars" role="list">
                            ${p.keruletek.map((k, n) => `
                                <span class="hbRow" role="listitem" style="--n:${n}">
                                    <span class="hbName">${esc(CityManager.keruletLabel(k.nev, DataManager.currentCity))}</span>
                                    <span class="hbTrack"><span class="hbBar" style="--w:${savHossz(k.atlag)}%"></span></span>
                                    <span class="hbVal">${Utils.eurNm(k.atlag)}</span>
                                </span>`).join("")}
                        </span>` : ""}
                        <span class="hbFoot">
                            <span>${I18n.f("homeBoardBasis", { n: Utils.num(p.db) })}</span>
                            <span class="hbLink">${t("homeBoardLink")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
                        </span>` : `
                        <span class="hbAvg">
                            <b data-count>${Utils.num(s.db)}</b>
                            <span>${t("homeStatListings")}</span>
                        </span>
                        <span class="hbFoot"><span>${t("homeBoardEmpty")}</span></span>`}
                    </a>
                </div>
            </section>

            <nav class="homeDock" aria-label="${esc(t("homeDockAria"))}">
                ${dock.map((d, n) => `
                    <a class="dockItem" href="#${d.hova}" data-dock="${d.hova}" ${d.go ? "data-dock-go" : ""} style="--n:${n}">
                        <span class="dockIcon"><i class="${d.icon}" aria-hidden="true"></i></span>
                        <span class="dockText">
                            <b>${t(d.cim)}</b>
                            <small>${esc(d.meta)}</small>
                        </span>
                        <i class="fa-solid fa-arrow-right dockGo" aria-hidden="true"></i>
                    </a>`).join("")}
            </nav>

            ${typeof AdSlots !== "undefined" ? AdSlots.slot("home_top", "homeAd homeAdTop") : ""}

            ${kiemeltek.length ? `
            <section class="homeSection homeFeatured">
                <div class="homeSectionHead">
                    <h2 class="homeH2">${t("ftHomeTitle")}</h2>
                    <div class="featNav">
                        <a href="#properties" class="homeAll">${t("homeAllListings")}</a>
                        <button type="button" class="featArrow" data-feat-dir="-1" aria-label="${esc(t("featPrev"))}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
                        <button type="button" class="featArrow" data-feat-dir="1" aria-label="${esc(t("featNext"))}"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
                    </div>
                </div>
                <div class="featTrack" tabindex="0" aria-label="${esc(t("ftHomeTitle"))}">${kiemeltek.map(i => CardsView.cardHtml(i, { col: "featCell" })).join("")}</div>
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

            <section class="homeSection homePaths">
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

        // A funkció-sáv: a hirdetések és a térkép a fenti kereső beállításaival nyílik
        box.querySelectorAll("[data-dock-go]").forEach(a => {
            a.addEventListener("click", e => {
                e.preventDefault();
                HomePage.go({ ...ertek(), page: a.dataset.dock });
            });
        });

        // Kiemelt hirdetések: vízszintesen lapozható sáv, nyilakkal
        const track = box.querySelector(".featTrack");
        if (track) {
            const nyilak = box.querySelectorAll("[data-feat-dir]");
            const allapot = () => {
                const max = track.scrollWidth - track.clientWidth - 2;
                nyilak.forEach(b => {
                    b.disabled = Number(b.dataset.featDir) < 0 ? track.scrollLeft <= 2 : track.scrollLeft >= max;
                });
                box.querySelector(".homeFeatured").classList.toggle("featNoScroll", max <= 0);
            };
            nyilak.forEach(b => b.addEventListener("click", () => {
                const cell = track.querySelector(".featCell");
                const lepes = cell ? cell.getBoundingClientRect().width + 16 : track.clientWidth * 0.8;
                track.scrollBy({ left: Number(b.dataset.featDir) * lepes, behavior: "smooth" });
            }));
            track.addEventListener("scroll", () => requestAnimationFrame(allapot), { passive: true });
            requestAnimationFrame(allapot);
        }

        // A kiemelt kártyák ugyanúgy működnek, mint a találati listában
        // (képlapozás, térkép gomb, forrásoldalra vivő hirdetés)
        CardsView.bindCards(box.querySelector(".homeFeatured"));

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
