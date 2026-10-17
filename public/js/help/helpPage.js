// ============================================================
//  Súgó oldal (#sugo, #sugo/<téma>)
//
//  Bal oldalt a témák (telefonon felül lenyíló választó), jobb oldalt
//  a kiválasztott téma. Kereső: minden témában keres, és a találatokat
//  mutatja. A tartalom a helpContent.js-ben van (HU / EN / RO).
// ============================================================

class HelpPage {

    static tema = "kezdes";
    static kereses = "";

    // Az oldalak "Hogyan működik?" gombjaihoz: melyik súgótéma tartozik hozzájuk
    static OLDAL_TEMA = {
        properties: "kereses",
        map: "terkep",
        market: "piac",
        valuation: "ertekbecslo",
        favorites: "kedvencek",
        new: "feladas"
    };

    static temak() {
        const lista = HELP_CONTENT[I18n.current] || HELP_CONTENT.en;
        return lista.filter(t => !t.admin || AuthManager.isAdmin());
    }

    static show(param) {
        if (param) HelpPage.tema = param;
        HelpPage.render();
    }

    static rerender() {
        if (PageManager.current === "sugo") HelpPage.render();
    }

    // Egy téma tartalma HTML-ben (a szöveg a saját tartalmunk, megbízható)
    static temaHtml(t) {

        let html = `<h2 class="helpTopicTitle"><span class="helpTopicIcon"><i class="${t.icon}" aria-hidden="true"></i></span> ${t.title}</h2>`;

        if (t.intro) html += `<p class="helpIntro">${t.intro}</p>`;

        // Képernyőképek a témához (helpImages.js) – a megadott szakasz után
        const kepek = (typeof HELP_KEPEK !== "undefined" && HELP_KEPEK[t.id]) || [];
        const kepHtml = utan => kepek.filter(k => Math.min(k.utan, t.sections.length - 1) === utan).map(HelpPage.kepHtml).join("");

        html += kepHtml(-1);

        t.sections.forEach((s, idx) => {
            if (s.tip) {
                html += `<div class="helpTip"><i class="fa-regular fa-lightbulb" aria-hidden="true"></i><span>${s.tip}</span></div>`;
                html += kepHtml(idx);
                return;
            }
            html += `<section class="helpSection">`;
            if (s.h) html += `<h3>${s.h}</h3>`;
            if (s.p) html += `<p>${s.p}</p>`;
            if (s.ul) html += `<ul>${s.ul.map(x => `<li>${x}</li>`).join("")}</ul>`;
            if (s.steps) html += `<ol class="helpSteps">${s.steps.map(x => `<li>${x}</li>`).join("")}</ol>`;
            html += `</section>`;
            html += kepHtml(idx);
        });

        // A "Jó tudni" téma alján a kezdőlapról ideköltözött pontok
        if (t.id === "jo-tudni") {
            html += `<section class="helpSection"><h3>${I18n.t("homeGoodTitle")}</h3><dl class="helpGood">`;
            for (let n = 1; n <= 6; n++) {
                html += `<div><dt>${Utils.escape(I18n.t("homeGood" + n + "Title"))}</dt><dd>${Utils.escape(I18n.t("homeGood" + n + "Text"))}</dd></div>`;
            }
            html += `</dl></section>`;
        }

        // Tovább a témához tartozó oldalra
        const oldal = Object.entries(HelpPage.OLDAL_TEMA).find(([, v]) => v === t.id);
        if (oldal) {
            html += `<a class="btn btn-outline-primary btn-sm mt-2" href="#${oldal[0]}">${I18n.t("helpGoToPage")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>`;
        }

        // Az „Első lépések” végén: az összes téma áttekintése
        if (t.id === "kezdes") html += HelpPage.attekintesHtml();

        // Előző / következő téma
        const temak = HelpPage.temak();
        const i = temak.findIndex(x => x.id === t.id);
        const elozo = temak[i - 1], kov = temak[i + 1];
        if (elozo || kov) {
            const cim = x => String(x.title).replace(/<[^>]+>/g, "");
            html += `
                <nav class="helpPager" aria-label="${Utils.escape(I18n.t("helpTitle"))}">
                    ${elozo ? `<a class="helpPagerLink prev" href="#sugo/${elozo.id}"><small><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${I18n.t("helpPrev")}</small><b>${Utils.escape(cim(elozo))}</b></a>` : "<span></span>"}
                    ${kov ? `<a class="helpPagerLink next" href="#sugo/${kov.id}"><small>${I18n.t("helpNext")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></small><b>${Utils.escape(cim(kov))}</b></a>` : ""}
                </nav>`;
        }

        return html;

    }

    // Egy képernyőkép a súgóban: kattintásra nagyban (a képnagyító ablakban)
    static kepHtml(k) {
        const nyelv = ["hu", "ro", "en"].includes(I18n.current) ? I18n.current : "en";
        const src = `img/sugo/${nyelv}/${k.kep}.webp`;
        const felirat = (k.f && (k.f[nyelv] || k.f.en)) || "";
        const alt = felirat.replace(/<[^>]+>/g, "");
        return `
            <figure class="helpFig${k.mobil ? " mobil" : ""}">
                <button type="button" class="helpFigImg" data-help-zoom="${Utils.escape(src)}" aria-label="${Utils.escape(I18n.t("helpZoom"))}">
                    <img src="${Utils.escape(src)}" alt="${Utils.escape(alt)}" loading="lazy" decoding="async">
                    <span class="helpFigZoom"><i class="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i></span>
                </button>
                ${felirat ? `<figcaption>${felirat}</figcaption>` : ""}
            </figure>`;
    }

    // A témák rácsa (ikon, cím, egy mondat) – gyors áttekintés
    static attekintesHtml() {
        const tiszta = x => String(x || "").replace(/<[^>]+>/g, "").trim();
        const leiras = t => {
            const elso = tiszta(t.intro) || tiszta((t.sections.find(s => s.p) || {}).p) || tiszta(((t.sections.find(s => s.ul) || {}).ul || [])[0]);
            return elso.length > 110 ? elso.slice(0, 107).replace(/\s+\S*$/, "") + "…" : elso;
        };
        return `
            <section class="helpSection">
                <h3>${I18n.t("helpAllTopics")}</h3>
                <div class="helpTopicGrid">
                    ${HelpPage.temak().filter(t => t.id !== "kezdes").map(t => `
                        <a class="helpTopicCard${t.admin ? " admin" : ""}" href="#sugo/${t.id}">
                            <span class="helpTopicIcon"><i class="${t.icon}" aria-hidden="true"></i></span>
                            <span><b>${t.title}</b><small>${Utils.escape(leiras(t))}</small></span>
                        </a>`).join("")}
                </div>
            </section>`;
    }

    // Kép nagyítása: a meglévő képnagyító ablak (photoModal)
    static zoom(src) {
        const body = document.getElementById("photoModalBody");
        const el = document.getElementById("photoModal");
        if (!body || !el || typeof bootstrap === "undefined") { window.open(src, "_blank", "noopener"); return; }
        body.innerHTML = `<img src="${Utils.escape(src)}" alt="" style="width:100%;height:auto;display:block;border-radius:6px">`;
        bootstrap.Modal.getOrCreateInstance(el).show();
    }

    // Keresés: a témák szövegében (HTML nélkül, ékezetfüggetlenül)
    static talalatok(q) {

        const norm = s => String(s || "").replace(/<[^>]+>/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const szavak = norm(q).split(/\s+/).filter(w => w.length >= 2);
        if (!szavak.length) return [];

        const eredmeny = [];

        HelpPage.temak().forEach(t => {
            t.sections.forEach(s => {
                const darabok = [s.p, s.tip, ...(s.ul || []), ...(s.steps || [])].filter(Boolean);
                darabok.forEach(d => {
                    const szoveg = norm((s.h || "") + " " + d);
                    if (szavak.every(w => szoveg.includes(w))) {
                        eredmeny.push({ t, h: s.h, d });
                    }
                });
            });
        });

        return eredmeny.slice(0, 40);

    }

    static render() {

        const box = document.getElementById("sugoContent");
        if (!box) return;

        const temak = HelpPage.temak();
        if (!temak.some(t => t.id === HelpPage.tema)) HelpPage.tema = temak[0].id;
        const aktiv = temak.find(t => t.id === HelpPage.tema);
        const esc = Utils.escape;

        box.innerHTML = `
            <div class="pageHeader">
                <h2><i class="fa-solid fa-circle-question" aria-hidden="true"></i> ${I18n.t("helpTitle")}</h2>
                <p class="text-body-secondary mb-0">${I18n.t("helpSubtitle")}</p>
            </div>

            <div class="helpLayout">
                <nav class="helpNav" aria-label="${esc(I18n.t("helpTitle"))}">
                    <div class="helpSearch">
                        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                        <input type="search" class="form-control" id="helpSearch" placeholder="${esc(I18n.t("helpSearchPh"))}" aria-label="${esc(I18n.t("helpSearchPh"))}" value="${esc(HelpPage.kereses)}">
                    </div>
                    <select class="form-select helpNavSelect" id="helpNavSelect" aria-label="${esc(I18n.t("helpTitle"))}">
                        ${temak.map(t => `<option value="${t.id}" ${t.id === aktiv.id ? "selected" : ""}>${esc(t.title.replace(/<[^>]+>/g, ""))}</option>`).join("")}
                    </select>
                    <div class="helpNavList">
                        ${temak.map(t => `
                            <a class="helpNavItem ${t.id === aktiv.id && !HelpPage.kereses ? "active" : ""} ${t.admin ? "admin" : ""}" href="#sugo/${t.id}">
                                <i class="${t.icon}" aria-hidden="true"></i><span>${t.title}</span>
                            </a>`).join("")}
                    </div>
                </nav>

                <article class="helpBody card" id="helpBody"></article>
            </div>`;

        const rajzol = () => {
            const body = document.getElementById("helpBody");
            if (HelpPage.kereses.trim().length >= 2) {
                const tal = HelpPage.talalatok(HelpPage.kereses);
                body.innerHTML = `
                    <div class="card-body">
                        <h2 class="helpTopicTitle"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> ${I18n.f("helpResults", { q: esc(HelpPage.kereses) })}</h2>
                        ${tal.length ? `<ul class="helpResults">${tal.map(r => `
                            <li><a href="#sugo/${r.t.id}" data-clear-search><b>${r.t.title}</b>${r.h ? ` › ${r.h}` : ""}</a><div class="small text-body-secondary">${r.d}</div></li>`).join("")}</ul>`
                            : `<p class="text-body-secondary">${I18n.t("helpNoResults")}</p>`}
                    </div>`;
                body.querySelectorAll("[data-clear-search]").forEach(a => a.addEventListener("click", () => { HelpPage.kereses = ""; }));
            } else {
                body.innerHTML = `<div class="card-body">${HelpPage.temaHtml(aktiv)}</div>`;
                body.querySelectorAll("[data-help-zoom]").forEach(b => { b.onclick = () => HelpPage.zoom(b.dataset.helpZoom); });
            }
        };

        rajzol();

        const kereso = document.getElementById("helpSearch");
        kereso.addEventListener("input", () => {
            HelpPage.kereses = kereso.value;
            box.querySelectorAll(".helpNavItem").forEach(a => a.classList.toggle("active", !HelpPage.kereses && a.getAttribute("href") === "#sugo/" + aktiv.id));
            rajzol();
        });

        box.querySelectorAll(".helpNavItem").forEach(a => a.addEventListener("click", () => {
            if (!HelpPage.kereses) return;
            HelpPage.kereses = "";
            if (a.getAttribute("href") === "#sugo/" + aktiv.id) HelpPage.render();
        }));

        document.getElementById("helpNavSelect").onchange = e => { HelpPage.kereses = ""; location.hash = "sugo/" + e.target.value; };

    }

}
