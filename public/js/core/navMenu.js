// ============================================================
//  Fejléc menü: témák szerinti csoportok lenyíló panelekkel
//  (Keresés · Piac · Szolgáltatások). Egérrel rámutatva is nyílik,
//  érintőképernyőn kattintásra; Esc / kattintás máshova bezárja.
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
        };

        csoportok.forEach(g => {

            const gomb = g.querySelector(".navGroupBtn");

            gomb.addEventListener("click", e => {
                e.preventDefault();
                if (g.classList.contains("open")) NavMenu.zar(g);
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
