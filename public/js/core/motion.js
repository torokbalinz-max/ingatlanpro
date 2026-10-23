// ============================================================
//  Mozgás (csak kinézet – a működéshez nem nyúl)
//   1. Kezdőlap, első megnyitás: egyetlen nyitójelenet – a szintvonalak
//      megrajzolódnak, a cím felgördül, a fotó a szöveg felől a képernyő
//      széléig kinyílik, a kereső és a város árképe sorban érkezik, a
//      kerületi sávok kinőnek, az átlagár felszámol
//   2. Görgetéskor a fejléc kap egy finom árnyékot
//   3. Oldalváltáskor az új oldal finoman beúszik
//  Aki a csökkentett mozgást kérte (rendszerbeállítás), annál semmi sem mozog.
// ============================================================

(() => {

    const csendes = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---------- Szintvonalak (domborzati vonalak – a Kárpátok térképére utal) ----------
    function szintvonalak() {
        const W = 1200, H = 700, N = 13;
        let utak = "";
        for (let k = 0; k < N; k++) {
            const alap = 40 + k * 52;
            const a1 = 24 + (k % 3) * 9, a2 = 12 + (k % 4) * 6;
            const f1 = 0.0040 + k * 0.00011, f2 = 0.0105 - k * 0.00028;
            const ph = k * 0.7;
            let d = "";
            for (let x = -20; x <= W + 20; x += 24) {
                const y = alap + Math.sin(x * f1 + ph) * a1 + Math.sin(x * f2 + ph * 1.7) * a2
                    // két "hegy": a vonalak ott összesűrűsödnek
                    - Math.exp(-Math.pow((x - 300) / 220, 2)) * (52 - k * 3)
                    - Math.exp(-Math.pow((x - 980) / 260, 2)) * (64 - k * 3.5);
                d += (d ? " L" : "M") + x.toFixed(0) + " " + y.toFixed(1);
            }
            utak += `<path d="${d}" pathLength="1" style="--i:${k}"/>`;
        }
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "ipContour");
        svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
        svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        svg.innerHTML = utak;
        return svg;
    }

    // ---------- Szám felszámolása (pl. 1 417 €/m²) ----------
    function felszamol(el, ido = 1500) {
        const szoveg = el.textContent;
        const m = szoveg.match(/\d[\d.,   ]*\d|\d/);
        if (!m) return;
        const nyers = m[0];
        if (/[.,]\d{1,2}$/.test(nyers)) return;                // tizedes: nem bántjuk
        const ertek = Number(nyers.replace(/\D/g, ""));
        if (!(ertek > 9)) return;
        const elv = (nyers.match(/[^\d]/) || [""])[0];         // ezres elválasztó (ha van)
        const form = n => elv ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, elv) : String(n);
        const elo = szoveg.slice(0, m.index), uto = szoveg.slice(m.index + nyers.length);
        const t0 = performance.now();
        const lep = t => {
            const p = Math.min(1, (t - t0) / ido);
            const e = 1 - Math.pow(1 - p, 4);
            el.textContent = elo + form(Math.round(ertek * e)) + uto;
            if (p < 1) requestAnimationFrame(lep);
            else el.textContent = szoveg;
        };
        requestAnimationFrame(lep);
    }

    // ---------- Kezdőlap: nyitójelenet (oldalbetöltésenként egyszer) ----------
    //  A kezdőlap kétszer is kirajzolódhat (előbb adatok nélkül, utána az adatokkal):
    //  a nyitójelenet csak az elsőnél fut, az átlagár akkor számol fel, amikor megvan.
    let nyitvaVolt = false, szamolva = false;
    function hos() {
        const h = document.querySelector("#page-home .homeHero.hv3");
        if (!h) return;
        if (!h.querySelector(".ipContour")) h.prepend(szintvonalak());
        if (csendes || document.body.dataset.page !== "home" || !h.offsetParent) return;
        if (!nyitvaVolt) {
            nyitvaVolt = true;
            h.classList.add("ipIntro");
        }
        if (!szamolva) {
            const el = h.querySelector(".heroBoard [data-count]");
            if (el && /\d{2}/.test(el.textContent)) {
                szamolva = true;
                if (h.classList.contains("ipIntro")) {
                    el.style.visibility = "hidden";
                    setTimeout(() => { el.style.visibility = ""; felszamol(el); }, 1050);
                } else {
                    felszamol(el);
                }
            }
        }
    }

    // ---------- Kezdőlap: görgetésre finoman beúsznak a részek (egyszer) ----------
    //  Csak ha a mozgás be van kapcsolva; a html.ipMotion osztály nélkül minden
    //  azonnal látszik (ha a szkript valamiért nem fut, semmi sem marad rejtve).
    if (!csendes) document.documentElement.classList.add("ipMotion");

    const figyelo = !csendes && "IntersectionObserver" in window ? new IntersectionObserver(es => {
        es.forEach(e => {
            if (!e.isIntersecting) return;
            const el = e.target;
            el.classList.add("isIn");
            figyelo.unobserve(el);
            // A funkció-sáv számai (pl. 56 aktív hirdetés) felszámolnak
            if (el.classList.contains("dockItem")) {
                const sz = el.querySelector(".dockText small");
                if (sz && /\d{2}/.test(sz.textContent)) setTimeout(() => felszamol(sz, 1100), 150);
            }
        });
    }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" }) : null;

    function felfed() {
        document.querySelectorAll("#page-home [data-reveal]:not(.isIn):not([data-figyelt]), #page-home .featCell:not(.isIn):not([data-figyelt])").forEach((el, n) => {
            el.setAttribute("data-figyelt", "");
            if (!figyelo) { el.classList.add("isIn"); return; }
            // a kiemelt hirdetések és a csempék sorban jönnek
            if (!el.style.getPropertyValue("--i")) {
                const testverek = [...el.parentElement.children].filter(x => x.hasAttribute("data-reveal") || x.classList.contains("featCell"));
                el.style.setProperty("--i", String(Math.min(6, testverek.indexOf(el))));
            }
            figyelo.observe(el);
        });
    }

    // ---------- Fejléc: görgetéskor finom árnyék (egy figyelő az oldal tetején) ----------
    const jel = document.createElement("div");
    jel.setAttribute("aria-hidden", "true");
    jel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:8px;pointer-events:none;";
    document.body.prepend(jel);
    if ("IntersectionObserver" in window) {
        new IntersectionObserver(([e]) => document.body.classList.toggle("ipScrolled", !e.isIntersecting))
            .observe(jel);
    }

    // ---------- Oldalváltás ----------
    let elozoOldal = document.body.dataset.page;
    function oldalValtas() {
        const most = document.body.dataset.page;
        if (most === elozoOldal) return;
        elozoOldal = most;
        if (csendes || most === "admin") return;
        const el = document.getElementById("page-" + most);
        if (!el) return;
        el.classList.remove("ipEnter");
        void el.offsetWidth;                // az animáció újraindítása
        el.classList.add("ipEnter");
        const vege = e => { if (e.target !== el) return; el.classList.remove("ipEnter"); el.removeEventListener("animationend", vege); };
        el.addEventListener("animationend", vege);
    }

    // ======================================================================
    //  v23: az egész oldalon (nem csak a kezdőlapon)
    //   - az oldalak fejléce (örökzöld sáv) megkapja a szintvonalakat
    //   - a kártyák, dobozok görgetéskor / megjelenéskor finoman beúsznak
    //     (sorban, legfeljebb 8 lépcsővel – a szűrésre újrarajzolt kártyák is)
    //   - a számlálók (találatok, átlagár…) az új értékre "átpörögnek"
    //  Az admin felület és a térkép kimarad. Csökkentett mozgásnál semmi sem mozog.
    // ======================================================================

    const REVEAL = [
        ".pageHeader", ".prHero", ".prCard", ".kpiCard", ".listingCard", ".favBar", ".favEmpty", ".emptyState",
        ".page > .card", ".page > .row > [class*='col'] > .card", ".statsCard", ".valCard",
        ".homeAreas", ".homeSellBand", ".homeHelpStrip", ".pricingCard", ".pkgCard", ".agCard",
        ".helpLayout", ".legalLayout", ".accLayout", ".ipPanel"
    ].join(", ");
    const KIZAR = "#page-admin, #page-map, .modal, .dropdown-menu, .leaflet-container, .ag-root-wrapper, .featTrack, #page-home .homeHero";

    const lathato = el => {
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight * 0.98 && r.bottom > 0;
    };

    const rFigyelo = !csendes && "IntersectionObserver" in window ? new IntersectionObserver(es => {
        es.forEach(e => {
            if (!e.isIntersecting) return;
            e.target.classList.add("ipRvIn");
            rFigyelo.unobserve(e.target);
        });
    }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" }) : null;

    function fejlecek(root) {
        document.querySelectorAll(".page .pageHeader:not([data-ipfej]), .page .homeSellBand:not([data-ipfej]), .page .prHero:not([data-ipfej]), .favEmpty:not([data-ipfej]), .appFooter:not([data-ipfej])").forEach(h => {
            if (h.closest("#page-admin")) return;
            h.setAttribute("data-ipfej", "");
            const svg = szintvonalak();
            svg.classList.add("ipContourSm");
            h.prepend(svg);
        });
    }

    function scan(root) {
        fejlecek(root);
        if (!rFigyelo) return;
        let lepcso = 0;
        (root || document).querySelectorAll(REVEAL).forEach(el => {
            if (el.hasAttribute("data-iprv") || el.closest(KIZAR) || !el.closest(".page")) return;
            el.setAttribute("data-iprv", "");
            if (lathato(el)) {
                // ami már látszik: azonnal, sorban (a sor ne várjon sokat)
                el.style.setProperty("--rv", String(Math.min(8, lepcso++)));
                el.classList.add("ipRv");
                requestAnimationFrame(() => el.classList.add("ipRvIn"));
            } else {
                el.style.setProperty("--rv", "0");
                el.classList.add("ipRv");
                rFigyelo.observe(el);
            }
        });
    }

    // ---------- Számlálók: az új értékre pörögnek (a régiről) ----------
    const szamErtek = szoveg => {
        const m = String(szoveg).match(/\d[\d.,\u00a0\u202f ]*\d|\d/);
        if (!m || /[.,]\d{1,2}(?!\d)/.test(m[0])) return null;
        return { n: Number(m[0].replace(/\D/g, "")), m };
    };

    // Az oldal ezzel írja a számlálókat (találatok, átlagár…): ha a szám változik és
    // látszik, a régi értékről az újra pörög; minden más esetben azonnal beíródik.
    const futo = new WeakMap();
    function szamIr(el, cel) {
        if (!el) return;
        cel = String(cel);
        const regi = szamErtek(el.textContent), uj = szamErtek(cel);
        const id = (futo.get(el) || 0) + 1;
        futo.set(el, id);
        if (csendes || !uj || !regi || uj.n === regi.n || document.hidden || !lathato(el)) { el.textContent = cel; return; }
        const nyers = uj.m[0];
        const elv = (nyers.match(/[^\d]/) || [""])[0];
        const form = n => elv ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, elv) : String(n);
        const elo = cel.slice(0, uj.m.index), uto = cel.slice(uj.m.index + nyers.length);
        const t0 = performance.now(), ido = 650;
        const lep = t => {
            if (futo.get(el) !== id) return;            // közben új érték jött: az nyer
            const p = Math.min(1, (t - t0) / ido), e = 1 - Math.pow(1 - p, 3);
            el.textContent = p < 1 ? elo + form(Math.round(regi.n + (uj.n - regi.n) * e)) + uto : cel;
            if (p < 1) requestAnimationFrame(lep);
        };
        requestAnimationFrame(lep);
    }

    window.IpMotion = { csendes, scan, szamIr, szintvonalak, felszamol };

    // Új tartalom (a JS-ből rajzolt oldalak, a szűrésre újrarajzolt kártyák): átnézzük
    let scanIdo = null;
    const main = document.querySelector(".appMain") || document.body;
    new MutationObserver(() => {
        if (scanIdo) return;
        scanIdo = requestAnimationFrame(() => { scanIdo = null; scan(main); });
    }).observe(main, { childList: true, subtree: true });

    new MutationObserver(() => { oldalValtas(); hos(); felfed(); scan(main); })
        .observe(document.body, { attributes: true, attributeFilter: ["data-page"] });
    scan(main);

    // A kezdőlap tartalma később rajzolódik ki: figyeljük, amíg megjelenik
    const home = document.getElementById("page-home");
    if (home) new MutationObserver(() => { hos(); felfed(); }).observe(home, { childList: true, subtree: true });
    hos();
    felfed();

})();
