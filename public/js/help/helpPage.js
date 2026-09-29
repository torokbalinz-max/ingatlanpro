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

        let html = `<h2 class="helpTopicTitle"><i class="${t.icon}" aria-hidden="true"></i> ${t.title}</h2>`;

        if (t.intro) html += `<p class="helpIntro">${t.intro}</p>`;

        t.sections.forEach(s => {
            if (s.tip) {
                html += `<div class="helpTip"><i class="fa-regular fa-lightbulb" aria-hidden="true"></i><span>${s.tip}</span></div>`;
                return;
            }
            html += `<section class="helpSection">`;
            if (s.h) html += `<h3>${s.h}</h3>`;
            if (s.p) html += `<p>${s.p}</p>`;
            if (s.ul) html += `<ul>${s.ul.map(x => `<li>${x}</li>`).join("")}</ul>`;
            if (s.steps) html += `<ol class="helpSteps">${s.steps.map(x => `<li>${x}</li>`).join("")}</ol>`;
            html += `</section>`;
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

        return html;

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
