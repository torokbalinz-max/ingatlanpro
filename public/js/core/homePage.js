// ============================================================
//  Kezdőlap: mit tud az oldal, élő számok, valódi hirdetésképek
//  + oldal-súgók ("Hogyan működik?" gomb az oldalak fejlécében)
// ============================================================

class HomePage {

    static FEATURES = [
        { key: "Props", page: "properties", icon: "fa-solid fa-house", cls: "featBig", bullets: ["homeFeatPropsB1", "homeFeatPropsB2", "homeFeatPropsB3"], photo: true },
        { key: "Market", page: "market", icon: "fa-solid fa-chart-line", cls: "featWide featTint" },
        { key: "Val", page: "valuation", icon: "fa-solid fa-calculator", cls: "featWide" },
        { key: "Map", page: "properties", icon: "fa-solid fa-map-location-dot", cls: "featThird", scrollMap: true },
        { key: "Fav", page: "favorites", icon: "fa-solid fa-star", cls: "featThird" },
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

    // Legfeljebb 3 kép a betöltött hirdetésekből (valódi fotók)
    static fotok() {
        const lista = (DataManager.ingatlanok || []).filter(i => Utils.hasPhoto(i) && i.ar > 0);
        const vegyes = [...lista].sort((a, b) => (b.kep_db || 0) - (a.kep_db || 0) || b.id - a.id);
        return vegyes.slice(0, 3);
    }

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

    static render() {

        const box = document.getElementById("homeContent");
        if (!box) return;

        const t = I18n.t.bind(I18n);
        const fotok = HomePage.fotok();
        const s = HomePage.stats();

        const kep = (i, cls) => `
            <button type="button" class="heroPhoto ${cls}" data-listing="${i.id}" aria-label="${Utils.escape(i.cim || Types.label(i.tipus))}">
                <img src="${Utils.escape(Utils.photoUrl(i))}" alt="" referrerpolicy="no-referrer" loading="eager" onerror="this.closest('.heroPhoto').classList.add('broken');this.remove();">
                <span class="heroPhotoTag">${Utils.price(i)}</span>
            </button>`;

        const featFoto = fotok[1] || fotok[0];

        box.innerHTML = `

            <section class="homeHero">
                <div class="homeHeroText">
                    <h1>${t("homeTitle")}</h1>
                    <p class="homeLead">${t("homeSub")}</p>
                    <div class="homeCtas">
                        <a class="btn btn-primary btn-lg" href="#properties">${t("homeCtaBrowse")}</a>
                        <a class="btn btn-outline-secondary btn-lg" href="#new">${t("homeCtaPost")}</a>
                    </div>
                </div>
                <div class="homeHeroMedia ${fotok.length ? "" : "empty"}">
                    ${fotok.length
                        ? fotok.map((i, idx) => kep(i, "p" + idx)).join("")
                        : `<div class="heroPlaceholder"><i class="fa-solid fa-building" aria-hidden="true"></i></div>`}
                </div>
            </section>

            <section class="homeStats" aria-label="${Utils.escape(s.varos)}">
                <div><b>${Utils.num(s.db)}</b><span>${t("homeStatListings")}</span></div>
                <div><b>${Utils.escape(s.varos)}</b><span>${t("homeStatCity")}</span></div>
                <div><b>${s.atlag ? Utils.eurNm(s.atlag) : "-"}</b><span>${t("homeStatAvg")}</span></div>
                <div><b>${Utils.num(s.foto)}</b><span>${t("homeStatPhotos")}</span></div>
            </section>

            <section class="homeSection">
                <h2 class="homeH2">${t("homeFeaturesTitle")}</h2>
                <div class="featGrid">
                    ${HomePage.FEATURES.map(f => `
                        <a class="featCell ${f.cls}" href="#${f.page}" ${f.scrollMap ? 'data-scroll-map="1"' : ""}>
                            ${f.photo && featFoto ? `<span class="featPhoto"><img src="${Utils.escape(Utils.photoUrl(featFoto))}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.parentElement.remove()"></span>` : ""}
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
            </footer>`;

        box.querySelectorAll("[data-listing]").forEach(b => {
            b.onclick = () => PageManager.show("listing/" + b.dataset.listing);
        });

        box.querySelectorAll("[data-scroll-map]").forEach(a => {
            a.addEventListener("click", () => {
                setTimeout(() => {
                    const m = document.getElementById("map");
                    if (m) m.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 400);
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
