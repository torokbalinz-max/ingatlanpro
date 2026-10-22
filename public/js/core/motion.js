// ============================================================
//  Mozgás (csak kinézet – a működéshez nem nyúl)
//   1. Kezdőlap, első megnyitás: egyetlen nyitójelenet – az örökzöld panel
//      kinyílik, a szintvonalak megrajzolódnak, a cím felgördül, a kereső,
//      a fotó és a város árképe sorban érkezik, a kerületi sávok kinőnek,
//      az átlagár felszámol, végül a funkció-sáv elemei
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
        const h = document.querySelector("#page-home .homeHero.hv2");
        if (!h) return;
        if (!h.querySelector(".ipContour")) h.prepend(szintvonalak());
        if (csendes || document.body.dataset.page !== "home" || !h.offsetParent) return;
        if (!nyitvaVolt) {
            nyitvaVolt = true;
            h.classList.add("ipIntro");
            const dock = document.querySelector("#page-home .homeDock");
            if (dock) dock.classList.add("ipIntroDock");
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

    new MutationObserver(() => { oldalValtas(); hos(); })
        .observe(document.body, { attributes: true, attributeFilter: ["data-page"] });

    // A kezdőlap tartalma később rajzolódik ki: figyeljük, amíg megjelenik
    const home = document.getElementById("page-home");
    if (home) new MutationObserver(hos).observe(home, { childList: true, subtree: true });
    hos();

})();
