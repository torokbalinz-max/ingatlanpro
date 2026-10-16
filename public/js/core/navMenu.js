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
            const van = !!g.querySelector(`.navPanel [data-page="${oldal}"]`);
            g.classList.toggle("active", van);
            const btn = g.querySelector(".navGroupBtn");
            if (btn) btn.classList.toggle("active", van);
            // Az aktív oldal neve a csoport neve mellett (pl. Piac › Értékbecslő)
            const cur = g.querySelector(".navGroupCur");
            const b = van ? g.querySelector(`.navPanel [data-page="${oldal}"] b`) : null;
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
        // A közvetlen menüpontok (Ingatlanok, Térkép, Keresek, Eladjuk helyetted)
        document.querySelectorAll(".navLinks > .navLink[data-page]").forEach(a => {
            a.classList.toggle("active", a.dataset.page === oldal);
        });
        document.querySelectorAll(".navPanel [data-page]").forEach(a => {
            a.classList.toggle("active", a.dataset.page === oldal);
        });
    }

}

document.addEventListener("DOMContentLoaded", () => NavMenu.init());
