// ============================================================
//  Fejléc menü
//   Felső sor (laptop, iPad fekve): Ingatlanok · Térkép · Keresek · Statisztikák ·
//   Csomagok · Eladjuk helyetted · Több ▾ (Értékbecslő, Ingatlanirodák, Súgó).
//   Ami nem fér ki a sorban, az a sor végéről magától a „Több” alá kerül
//   (NavMenu.elfer) – nincs képernyőméretenként külön kézzel állított lista.
//   Telefon, iPad állva: alsó sáv + Menü lap (index.html: mobBar, mobSheet).
//  A „Több” egérrel rámutatva is nyílik, érintőképernyőn kattintásra;
//  Esc / kattintás máshova bezárja.
// ============================================================

class NavMenu {

    static init() {

        const csoportok = [...document.querySelectorAll(".navGroup")];
        const eger = window.matchMedia("(hover: hover) and (pointer: fine)");
        let zarIdo = null;

        const nyit = g => {
            csoportok.forEach(x => { if (x !== g) NavMenu.zar(x); });
            g.classList.add("open");
            g.querySelector(".navGroupBtn").setAttribute("aria-expanded", "true");
            NavMenu.igazit(g);
        };

        csoportok.forEach(g => {

            const gomb = g.querySelector(".navGroupBtn");

            gomb.addEventListener("click", e => {
                e.preventDefault();
                // egérrel a rámutatás már kinyitotta – a kattintás ne csukja vissza azonnal
                if (g.classList.contains("open") && !eger.matches) NavMenu.zar(g);
                else nyit(g);
            });

            // Egérrel: rámutatásra nyílik, kis késleltetéssel zárul
            g.addEventListener("mouseenter", () => {
                if (!eger.matches) return;
                clearTimeout(zarIdo);
                nyit(g);
            });
            g.addEventListener("mouseleave", () => {
                if (!eger.matches) return;
                clearTimeout(zarIdo);
                zarIdo = setTimeout(() => NavMenu.zar(g), 180);
            });

            // Billentyűzet: lefelé nyíl a panelbe lép
            gomb.addEventListener("keydown", e => {
                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    nyit(g);
                    const elso = g.querySelector(".navPanel a");
                    if (elso) elso.focus();
                }
            });

            g.querySelectorAll(".navPanel a").forEach(a => {
                a.addEventListener("click", () => NavMenu.zar(g));
            });

            g.addEventListener("focusout", e => {
                if (!g.contains(e.relatedTarget)) NavMenu.zar(g);
            });

        });

        document.addEventListener("click", e => {
            if (!e.target.closest(".navGroup")) csoportok.forEach(NavMenu.zar);
        });

        document.addEventListener("keydown", e => {
            if (e.key !== "Escape") return;
            const nyitott = csoportok.find(g => g.classList.contains("open"));
            if (nyitott) {
                NavMenu.zar(nyitott);
                nyitott.querySelector(".navGroupBtn").focus();
            }
        });

        window.addEventListener("hashchange", () => csoportok.forEach(NavMenu.zar));
        window.addEventListener("resize", () => csoportok.forEach(g => { if (g.classList.contains("open")) NavMenu.igazit(g); }));

    }

    // A lenyíló panel ne lógjon ki a képernyőről (iPad, kisebb laptop: a „Több”
    // gomb helye attól is függ, mely menüpontok látszanak – pl. kikapcsolt
    // „Eladjuk helyetted”). Szükség esetén vízszintesen beljebb toljuk.
    static igazit(g) {
        const p = g.querySelector(".navPanel");
        if (!p) return;
        p.style.marginLeft = "";
        const alap = parseFloat(getComputedStyle(p).marginLeft) || 0;
        const r = p.getBoundingClientRect();
        const szel = document.documentElement.clientWidth;
        const hely = 8;
        let dx = 0;
        if (r.right > szel - hely) dx = (szel - hely) - r.right;
        if (r.left + dx < hely) dx = hely - r.left;
        if (dx) p.style.marginLeft = `${Math.round(alap + dx)}px`;
    }

    static zar(g) {
        g.classList.remove("open");
        const b = g.querySelector(".navGroupBtn");
        if (b) b.setAttribute("aria-expanded", "false");
    }

    // Az aktuális oldal csoportja kiemelve (PageManager hívja)
    static aktiv(oldal) {
        document.querySelectorAll(".navGroup").forEach(g => {
            // csak a látható menüpont számít (a „Több” alatt keskeny képernyőn ott van a Térkép is)
            const lathato = el => el && getComputedStyle(el).display !== "none";
            const pont = [...g.querySelectorAll(`.navPanel [data-page="${oldal}"]`)].find(lathato);
            const van = !!pont;
            g.classList.toggle("active", van);
            const btn = g.querySelector(".navGroupBtn");
            if (btn) btn.classList.toggle("active", van);
            // Az aktív oldal neve a csoport neve mellett (pl. Piac › Értékbecslő)
            const cur = g.querySelector(".navGroupCur");
            const b = van ? pont.querySelector("b") : null;
            if (cur) {
                if (b && b.dataset.i18n) {
                    cur.setAttribute("data-i18n", b.dataset.i18n);
                    cur.textContent = I18n.t(b.dataset.i18n);
                } else {
                    cur.removeAttribute("data-i18n");
                    cur.textContent = "";
                }
            }
        });
        // A közvetlen menüpontok (Ingatlanok, Térkép, Keresek, Eladjuk helyetted) és az alsó sáv
        document.querySelectorAll(".navLinks > .navLink[data-page], .mobBar [data-page], .mobSheetLista [data-page]").forEach(a => {
            a.classList.toggle("active", a.dataset.page === oldal);
        });
        const mb = document.getElementById("mobMenuBtn");
        if (mb) mb.classList.toggle("active", !!document.querySelector(`.mobSheetLista [data-page="${oldal}"]`));
        document.querySelectorAll(".navPanel [data-page]").forEach(a => {
            a.classList.toggle("active", a.dataset.page === oldal);
        });
    }

}

// ---------- Telefon / iPad: az alsó sáv „Menü” lapja ----------

NavMenu.lap = function (nyit) {
    const lap = document.getElementById("mobSheet");
    const gomb = document.getElementById("mobMenuBtn");
    if (!lap || !gomb) return;
    lap.hidden = !nyit;
    gomb.setAttribute("aria-expanded", String(!!nyit));
    document.body.classList.toggle("mobSheetNyitva", !!nyit);
};

document.addEventListener("DOMContentLoaded", () => {
    NavMenu.init();
    const gomb = document.getElementById("mobMenuBtn");
    const lap = document.getElementById("mobSheet");
    if (!gomb || !lap) return;
    gomb.addEventListener("click", () => NavMenu.lap(lap.hidden));
    document.getElementById("mobSheetZar").addEventListener("click", () => NavMenu.lap(false));
    lap.addEventListener("click", e => { if (e.target === lap || e.target.closest("a[href]")) NavMenu.lap(false); });
    document.getElementById("mobDark").addEventListener("click", () => { const d = document.getElementById("btnDarkMode"); if (d) d.click(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !lap.hidden) NavMenu.lap(false); });
    window.addEventListener("hashchange", () => NavMenu.lap(false));
});

// ---------- Ami nem fér ki a felső sorban, a „Több” alá kerül ----------
// Sorrend: ami előbb áll, az tűnik el előbb a sorból (az Ingatlanok soha).
NavMenu.SORREND = ["eladjuk", "csomagok", "market", "igenyek", "map"];

NavMenu.elfer = function () {
    const sor = document.getElementById("navGroups");
    const keret = document.querySelector(".appNavInner");
    if (!sor || !keret) return;
    const link = k => sor.querySelector(`:scope > .navLink[data-nav="${k}"]`);
    const iker = k => sor.querySelector(`.navPanel [data-nav-iker="${k}"]`);
    // először minden kint a sorban
    NavMenu.SORREND.forEach(k => { const l = link(k), i = iker(k); if (l) l.hidden = false; if (i) i.hidden = true; });
    document.body.classList.remove("navSzuk", "navSzuk2");
    if (getComputedStyle(sor).display === "none") return;      // telefon: az alsó sáv él
    const tul = () => keret.scrollWidth > keret.clientWidth + 1;
    // előbb a jobb oldal húzódik össze: rövid „Feladás” felirat, majd (bejelentkezve)
    // a sötét mód kapcsoló a fiók menübe kerül – csak ezután kerül menüpont a „Több” alá
    if (tul()) document.body.classList.add("navSzuk");
    if (tul()) document.body.classList.add("navSzuk2");
    for (const k of NavMenu.SORREND) {
        if (!tul()) break;
        const l = link(k), i = iker(k);
        if (!l || getComputedStyle(l).display === "none") continue;     // pl. kikapcsolt „Eladjuk helyetted”
        l.hidden = true;
        if (i) i.hidden = false;
    }
    if (PageManager && PageManager.current) NavMenu.aktiv(PageManager.current === "listing" ? PageManager.lastListPage : PageManager.current);
};

(() => {
    let ido = null;
    const ujra = () => { clearTimeout(ido); ido = setTimeout(NavMenu.elfer, 60); };
    window.addEventListener("resize", ujra);
    window.addEventListener("load", ujra);
    document.addEventListener("DOMContentLoaded", () => {
        NavMenu.elfer();
        if (typeof I18n !== "undefined" && I18n.onChange) I18n.onChange(ujra);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(ujra);
    });

    // Belépés / kilépés után a jobb oldal szélessége változik (ikonok), és ekkor dől el,
    // ki lát szakmai eszközöket (táblázat nézet): admin, munkatárs, ingatlaniroda tagja
    if (typeof AuthManager === "undefined" || AuthManager.__navHorog) return;
    AuthManager.__navHorog = true;
    const eredeti = AuthManager.apply;
    AuthManager.apply = function () {
        const r = eredeti.apply(this, arguments);
        try {
            const pro = AuthManager.isAdmin() || AuthManager.panel() || (AuthManager.irodak || []).length > 0;
            document.body.classList.toggle("proNezet", pro);
            const tabla = document.getElementById("viewTable");
            if (!pro && tabla && tabla.checked && typeof CardsView !== "undefined") {
                document.getElementById("viewCards").checked = true;
                CardsView.setMode("cards");
            }
        } catch (e) { /* nem baj */ }
        ujra();
        return r;
    };
})();
