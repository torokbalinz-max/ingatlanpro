// ============================================================
//  360°-os körbenézés a hirdetés oldalán (Pannellum, nyílt forrású)
//
//  Csak az itt feladott hirdetéseknek lehet panorámája. A könyvtár csak
//  akkor töltődik be, amikor egy ilyen hirdetést megnyitnak. Több kép
//  (pl. nappali, konyha) között fülekkel lehet váltani; teljes képernyő is.
//  Csökkentett mozgás beállításnál nem forog magától.
// ============================================================

class PanoramaViewer {

    static LIB = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/";
    static betoltes = null;
    static viewer = null;

    static lib() {
        if (window.pannellum) return Promise.resolve();
        if (PanoramaViewer.betoltes) return PanoramaViewer.betoltes;
        PanoramaViewer.betoltes = new Promise((ok, hiba) => {
            const css = document.createElement("link");
            css.rel = "stylesheet";
            css.href = PanoramaViewer.LIB + "pannellum.css";
            document.head.appendChild(css);
            const js = document.createElement("script");
            js.src = PanoramaViewer.LIB + "pannellum.js";
            js.onload = () => ok();
            js.onerror = () => { PanoramaViewer.betoltes = null; hiba(new Error("pannellum")); };
            document.head.appendChild(js);
        });
        return PanoramaViewer.betoltes;
    }

    static nev(p, n) {
        return p.cim || I18n.f("panoRoomN", { n: n + 1 });
    }

    // A hirdetés oldalán: a panoráma szakasz (üres, ha nincs)
    static html(i) {

        const lista = i.panoramak || [];
        if (!lista.length) return "";

        const esc = Utils.escape;

        return `
            <section class="panoSection card mt-4" id="lpPano" aria-labelledby="lpPanoTitle">
                <div class="card-header panoSectionHead">
                    <h5 class="mb-0" id="lpPanoTitle"><span class="panoMark" aria-hidden="true">360°</span> ${I18n.t("panoViewTitle")}</h5>
                    <span class="small text-body-secondary">${I18n.t("panoViewHint")}</span>
                </div>
                <div class="panoStage">
                    <div class="panoView" id="lpPanoView" role="img" aria-label="${esc(I18n.t("panoViewTitle"))}"></div>
                    <div class="panoLoading" id="lpPanoLoading"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> ${I18n.t("loading")}</div>
                </div>
                ${lista.length > 1 ? `
                    <div class="panoTabs" role="tablist" aria-label="${esc(I18n.t("panoViewTitle"))}">
                        ${lista.map((p, n) => `
                            <button type="button" class="panoTab ${n === 0 ? "active" : ""}" role="tab" aria-selected="${n === 0}" data-pano="${n}">
                                <i class="fa-solid fa-street-view" aria-hidden="true"></i> ${esc(PanoramaViewer.nev(p, n))}
                            </button>`).join("")}
                    </div>` : ""}
            </section>`;

    }

    static bind(i) {

        const lista = i.panoramak || [];
        if (PanoramaViewer.viewer) { try { PanoramaViewer.viewer.destroy(); } catch (e) { /* már nincs */ } PanoramaViewer.viewer = null; }
        if (!lista.length) return;

        const el = document.getElementById("lpPanoView");
        if (!el) return;

        // A galéria 360° gombja ide görget
        const gomb = document.getElementById("lp360Btn");
        if (gomb) gomb.onclick = e => {
            e.stopPropagation();
            document.getElementById("lpPano").scrollIntoView({ behavior: "smooth", block: "center" });
        };

        const csendes = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const toltes = document.getElementById("lpPanoLoading");

        const mutat = n => {
            const p = lista[n];
            if (PanoramaViewer.viewer) { try { PanoramaViewer.viewer.destroy(); } catch (e) { /* már nincs */ } }
            if (toltes) toltes.hidden = false;
            // Nem teljes körkép (pl. telefonos panoráma): vízszintesen körbe, függőlegesen a kép aránya szerint
            const arany = p.w && p.h ? p.w / p.h : 2;
            const teljes = arany < 2.15;
            PanoramaViewer.viewer = window.pannellum.viewer(el, {
                type: "equirectangular",
                panorama: "/api/panorama/" + p.id,
                autoLoad: true,
                showControls: true,
                compass: false,
                hfov: 105,
                minHfov: 50,
                maxHfov: 120,
                autoRotate: csendes ? 0 : -2,
                autoRotateInactivityDelay: 4000,
                ...(teljes ? {} : { haov: 360, vaov: Math.min(120, 360 / arany), vOffset: 0, minPitch: -60, maxPitch: 60 }),
                strings: { loadingLabel: I18n.t("loading") }
            });
            PanoramaViewer.viewer.on("load", () => { if (toltes) toltes.hidden = true; });
            PanoramaViewer.viewer.on("error", () => { if (toltes) toltes.textContent = I18n.t("panoLoadError"); });
            document.querySelectorAll("#lpPano [data-pano]").forEach(b => {
                const on = Number(b.dataset.pano) === n;
                b.classList.toggle("active", on);
                b.setAttribute("aria-selected", String(on));
            });
        };

        document.querySelectorAll("#lpPano [data-pano]").forEach(b => {
            b.onclick = () => mutat(Number(b.dataset.pano));
        });

        // Csak ha a szakasz a képernyő közelébe ér, akkor töltjük (nagy képek)
        const indit = () => PanoramaViewer.lib().then(() => mutat(0)).catch(() => {
            if (toltes) toltes.textContent = I18n.t("panoLoadError");
        });

        if ("IntersectionObserver" in window) {
            const io = new IntersectionObserver(es => {
                if (es.some(e => e.isIntersecting)) { io.disconnect(); indit(); }
            }, { rootMargin: "300px" });
            io.observe(el);
        } else {
            indit();
        }

    }

}
