// ============================================================
//  Piaci elemzés oldal – fülek kezelése
// ============================================================

class StatisticsManager {

    static tab = "current";

    // reszletes: csomaghoz kötött fül (ha az admin bekapcsolta a fizetős statisztikát)
    static TABS = {
        current: { btn: "btnCurrentStatistics", load: () => CurrentStatistics.load(), leiras: "spTabCurrent", pdf: "spPdfCurrent" },
        history: { btn: "btnHistoryStatistics", load: () => HistoryStatistics.load(), leiras: "spTabHistory", pdf: "spPdfHistory", reszletes: true },
        trend: { btn: "btnTrend", load: () => TrendStatistics.load(), leiras: "spTabTrend", pdf: "spPdfTrend", reszletes: true }
    };

    static INTRO_KULCS = "spIntroKesz";

    static init() {

        Object.entries(StatisticsManager.TABS).forEach(([key, t]) => {
            document.getElementById(t.btn).onclick = () => StatisticsManager.open(key);
        });

    }

    static open(key) {

        StatisticsManager.tab = key;
        const t = StatisticsManager.TABS[key];

        Object.entries(StatisticsManager.TABS).forEach(([k, x]) => {
            const b = document.getElementById(x.btn);
            b.classList.toggle("active", k === key);
            // lakat a csomaghoz kötött füleken
            let lakat = b.querySelector(".spTabLock");
            if (x.reszletes && !StatPro.pro()) {
                if (!lakat) b.insertAdjacentHTML("beforeend", ` <i class="fa-solid fa-lock spTabLock" aria-hidden="true"></i>`);
            } else if (lakat) lakat.remove();
        });

        ChartStatistics.destroy();
        StatisticsManager.intro();
        StatisticsManager.eszkozsor();

        if (t.reszletes && !StatPro.pro()) {
            const c = document.getElementById("statisticsContainer");
            c.innerHTML = StatPro.zar("spLockTitle_" + key, "spLockText");
            StatPro.zarKot(c);
            return;
        }

        t.load();

    }

    // Az oldal megnyitásakor (a jogosultság friss lekérésével)
    static show() {
        StatPro.betolt(true).then(() => StatisticsManager.open(StatisticsManager.tab));
    }

    // ---------- Első látogatás: hogyan működik ----------

    static introLatott() {
        try { return localStorage.getItem(StatisticsManager.INTRO_KULCS) === "1"; } catch (e) { return false; }
    }

    static intro(mutat) {
        const box = document.getElementById("statIntro");
        if (!box) return;
        if (!mutat && StatisticsManager.introLatott()) { box.innerHTML = ""; return; }
        box.innerHTML = `
            <div class="spIntro">
                <div class="spIntroHead">
                    <h5 class="mb-0"><i class="fa-solid fa-route" aria-hidden="true"></i> ${I18n.t("spIntroTitle")}</h5>
                    <button type="button" class="btn-close" id="spIntroX" aria-label="${Utils.escape(I18n.t("spIntroClose"))}"></button>
                </div>
                <ol class="spIntroSteps">
                    <li><b>${I18n.t("spIntro1T")}</b><span>${I18n.t("spIntro1")}</span></li>
                    <li><b>${I18n.t("spIntro2T")}</b><span>${I18n.t("spIntro2")}</span></li>
                    <li><b>${I18n.t("spIntro3T")}</b><span>${I18n.t("spIntro3")}</span></li>
                </ol>
                <details class="spGloss">
                    <summary>${I18n.t("spGlossTitle")}</summary>
                    <dl>
                        <dt>${I18n.t("spGlossMedianT")}</dt><dd>${I18n.t("spGlossMedian")}</dd>
                        <dt>${I18n.t("spGlossNmT")}</dt><dd>${I18n.t("spGlossNm")}</dd>
                        <dt>${I18n.t("spGlossRangeT")}</dt><dd>${I18n.t("spGlossRange")}</dd>
                        <dt>${I18n.t("spGlossListT")}</dt><dd>${I18n.t("spGlossList")}</dd>
                    </dl>
                </details>
                <div class="d-flex justify-content-end mt-2">
                    <button type="button" class="btn btn-primary btn-sm" id="spIntroOk">${I18n.t("spIntroOk")}</button>
                </div>
            </div>`;
        const zar = () => {
            try { localStorage.setItem(StatisticsManager.INTRO_KULCS, "1"); } catch (e) { /* nem kritikus */ }
            box.innerHTML = "";
        };
        document.getElementById("spIntroX").onclick = zar;
        document.getElementById("spIntroOk").onclick = zar;
    }

    // ---------- A fül leírása + PDF ----------

    static eszkozsor() {
        const box = document.getElementById("statToolbar");
        if (!box) return;
        const t = StatisticsManager.TABS[StatisticsManager.tab];
        const zarolt = t.reszletes && !StatPro.pro();
        box.innerHTML = `
            <div class="spToolbar">
                <p class="small mb-0 flex-fill"><i class="fa-solid fa-circle-info text-primary" aria-hidden="true"></i> ${I18n.t(t.leiras)}</p>
                <div class="d-flex gap-2 flex-wrap">
                    ${StatisticsManager.introLatott() ? `<button type="button" class="btn btn-sm btn-link" id="spIntroAgain">${I18n.t("spIntroAgain")}</button>` : ""}
                    ${zarolt ? "" : StatPro.gomb("spPdfBtn", "spPdf")}
                </div>
            </div>
            ${StatPro.jog.fizetos && !StatPro.pro() && !zarolt ? `<p class="small text-body-secondary mb-3"><i class="fa-solid fa-lock" aria-hidden="true"></i> ${I18n.t("spBasicNote")}</p>` : ""}`;
        const ujra = document.getElementById("spIntroAgain");
        if (ujra) ujra.onclick = () => { StatisticsManager.intro(true); ujra.remove(); };
        const pdf = document.getElementById("spPdfBtn");
        if (pdf) pdf.onclick = () => StatPro.pdf({
            cim: `${I18n.t("statsTitle")} – ${I18n.t(t.pdf)}`,
            alcim: StatPro.szuresSzoveg(),
            el: document.getElementById("statisticsContainer")
        });
    }

    // Szűrés változott: csak a "Jelenlegi piac" fül függ tőle
    static refreshCurrent() {
        if (StatisticsManager.TABS[StatisticsManager.tab].reszletes && !StatPro.pro()) return;
        if (StatisticsManager.tab === "current") {
            CurrentStatistics.load();
        } else if (StatisticsManager.tab === "trend" && document.getElementById("trendChart")) {
            TrendStatistics.refresh();
            TrendStatistics.compare();
        } else if (StatisticsManager.tab === "history") {
            HistoryStatistics.load();
        }
    }

    // Nyelv- vagy témaváltás
    static rerender() {
        if (PageManager.current === "market") {
            StatisticsManager.open(StatisticsManager.tab);
        }
    }

    // Régi hívások kompatibilitása
    static loadCurrent() {
        StatisticsManager.open("current");
    }

}
