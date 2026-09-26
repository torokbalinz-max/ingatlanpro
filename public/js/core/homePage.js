// ============================================================
//  Kezdőlap: mit tud az oldal, élő számok, valódi hirdetésképek
//  + oldal-súgók ("Hogyan működik?" gomb az oldalak fejlécében)
// ============================================================

class HomePage {

    // Fotók: Unsplash (szabadon felhasználható, forrásmegjelölés nélkül)
    static FOTO = id => `https://images.unsplash.com/${id}?auto=format&fit=crop&q=75`;

    static KEPEK = {
        hero: "photo-1636288087131-7e912d7d37cf",          // Brassó, ősszel
        lakas: "photo-1560448204-e02f11c3d0e2",         // világos nappali
        haz: "photo-1680645944941-da9198d7f6aa",        // családi ház zöld kerttel
        telek: "photo-1625866529727-67ec4c3245d0",      // zöld dombok
        kereskedelmi: "photo-1528698827591-e19ccd7bc23d" // üzletportál
    };

    static FEATURES = [
        { key: "Props", page: "properties", icon: "fa-solid fa-house", cls: "featWide", bullets: ["homeFeatPropsB1", "homeFeatPropsB2", "homeFeatPropsB3"] },
        { key: "Map", page: "map", icon: "fa-solid fa-map-location-dot", cls: "featWide featTint" },
        { key: "Market", page: "market", icon: "fa-solid fa-chart-line", cls: "featThird" },
        { key: "Val", page: "valuation", icon: "fa-solid fa-calculator", cls: "featThird" },
        { key: "New", page: "new", icon: "fa-solid fa-circle-plus", cls: "featThird featTint" }
    ];

    static GOOD = [
        { n: 1, icon: "fa-solid fa-globe" },
        { n: 2, icon: "fa-solid fa-hourglass-half" },
        { n: 3, icon: "fa-solid fa-location-dot" },
        { n: 4, icon: "fa-solid fa-location-crosshairs" },
        { n: 5, icon: "fa-solid fa-map" },
        { n: 6, icon: "fa-solid fa-language" }
    ];

    static stats() {

        const lista = DataManager.ingatlanok || [];
        const lakas = lista.filter(i => (i.tipus || "lakas") === "lakas" && (i.ugylet || "elado") === "elado" && Utils.verified(i) && i.ar > 0 && i.nm > 0);
        const atlag = lakas.length ? lakas.reduce((s, i) => s + i.ar / i.nm, 0) / lakas.length : null;

        return {
            db: lista.length,
            varos: CityManager.displayName(DataManager.currentCity),
            atlag,
            foto: lista.filter(Utils.hasPhoto).length
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
                <div><b>${Utils.num(s.foto)}</b><span>${t("homeStatPhotos")}</span></div>
            </section>

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
                <div class="featGrid">
                    ${HomePage.FEATURES.map(f => `
                        <a class="featCell ${f.cls}" href="#${f.page}">
                            <span class="featBody">
                                <span class="featIcon"><i class="${f.icon}" aria-hidden="true"></i></span>
                                <span class="featTitle">${t("homeFeat" + f.key + "Title")}</span>
                                <span class="featText">${t("homeFeat" + f.key + "Text")}</span>
                                ${f.bullets ? `<ul class="featList">${f.bullets.map(b => `<li><i class="fa-solid fa-check" aria-hidden="true"></i>${t(b)}</li>`).join("")}</ul>` : ""}
                                <span class="featMore">${t("homeOpen")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
                            </span>
                        </a>`).join("")}
                </div>
            </section>

            <section class="homeSection">
                <h2 class="homeH2">${t("homeGoodTitle")}</h2>
                <dl class="goodGrid">
                    ${HomePage.GOOD.map(g => `
                        <div class="goodItem">
                            <dt><i class="${g.icon}" aria-hidden="true"></i>${t("homeGood" + g.n + "Title")}</dt>
                            <dd>${t("homeGood" + g.n + "Text")}</dd>
                        </div>`).join("")}
                </dl>
            </section>

            <footer class="homeFooter">
                <span class="appBrand small"><span class="appBrandIcon"><i class="fa-solid fa-building" aria-hidden="true"></i></span><span translate="no">Ingatlan<b>Pro</b></span></span>
                <span class="small text-body-secondary">${t("homePhotoCredit")}</span>
            </footer>`;

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
        panel.innerHTML = `<ul>${pontok.map(p => `<li>${Utils.escape(p)}</li>`).join("")}</ul>`;
    }

}
