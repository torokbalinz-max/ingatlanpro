// ============================================================
//  Mozgás (csak kinézet – a működéshez nem nyúl)
//   1. Kezdőlap, első megnyitás: egyetlen nyitójelenet – a szintvonalak
//      megrajzolódnak, a cím felgördül, a kereső és a fotó sorban érkezik,
//      a számok felszámolnak a valódi értékig
//   2. Oldalváltáskor az új oldal finoman beúszik
//  Aki a csökkentett mozgást kérte (rendszerbeállítás), annál semmi sem mozog.
// ============================================================

(() => {

    const csendes = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---------- Szintvonalak (domborzati vonalak) ----------
    //  Néhány hullámzó, egymás alatti vonal – mint egy hegyvidéki térkép szintvonalai
    function szintvonalak() {
        const W = 1200, H = 700, N = 11;
        let utak = "";
        for (let k = 0; k < N; k++) {
            const alap = 70 + k * 52;
            const a1 = 26 + (k % 3) * 9, a2 = 14 + (k % 4) * 6;
            const f1 = 0.0042 + k * 0.00012, f2 = 0.011 - k * 0.0003;
            const ph = k * 0.7;
            let d = "";
            for (let x = -20; x <= W + 20; x += 24) {
                const y = alap + Math.sin(x * f1 + ph) * a1 + Math.sin(x * f2 + ph * 1.7) * a2
                    // a jobb felső sarok felé "hegy": a vonalak ott összesűrűsödnek
                    - Math.exp(-Math.pow((x - 860) / 260, 2)) * (60 - k * 3.5);
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

    // ---------- Számok felszámolása (pl. 387 hirdetés, 1 436 €/m²) ----------
    function felszamol(el, ido = 1400) {
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

    // ---------- Kezdőlap nyitójelenet (oldalbetöltésenként egyszer) ----------
    //  A kezdőlap kétszer is kirajzolódhat (előbb adatok nélkül, utána az adatokkal):
    //  a nyitójelenet csak az elsőnél fut, a számok akkor számolnak fel, amikor megvannak.
    let nyitvaVolt = false, szamolva = false;
    function hos() {
        const h = document.querySelector("#page-home .homeHero");
        if (!h) return;
        if (!h.querySelector(".ipContour")) h.prepend(szintvonalak());
        if (csendes || document.body.dataset.page !== "home" || !h.offsetParent) return;
        if (!nyitvaVolt) {
            nyitvaVolt = true;
            h.classList.add("ipIntro");
        }
        if (!szamolva) {
            const els = [...document.querySelectorAll("#page-home .homeStats b, #page-home .homeStats strong, #page-home .heroBadge b")];
            if (els.some(e => /\d{2}/.test(e.textContent))) {
                szamolva = true;
                setTimeout(() => els.forEach(e => felszamol(e)), h.classList.contains("ipIntro") ? 600 : 0);
            }
        }
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
