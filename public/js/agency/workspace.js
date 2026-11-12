// ============================================================
//  Munkaterület ↔ böngészés (ingatlanosoknak)
//
//  Aki egy ingatlaniroda tagja (vezető vagy ügynök), annak két felülete van:
//   - Munkaterület (#iroda): az iroda munkája – ügyfelek, kérések, naptár,
//     hirdetések, csapat. A fejlécben csak a lényeg, a nyilvános menü rejtve.
//   - Böngészés: a rendes oldal (keresés, térkép, értékbecslő…), mint bárkinek.
//  A fejléc gombja vált a kettő között; az app megjegyzi, melyikben volt utoljára,
//  és a következő megnyitáskor (a kezdőlapról) oda viszi vissza.
//  A munkaterület maga: js/agency/agencyPage.js
// ============================================================

(() => {

    const MOD = "ip_mod";
    const mod = () => { try { return localStorage.getItem(MOD); } catch (e) { return null; } };
    const ment = v => { try { localStorage.setItem(MOD, v); } catch (e) { /* nem baj */ } };

    // Elhagyva a munkaterületet: vissza a rendes fejléc
    window.addEventListener("hashchange", () => {
        if (!/^#iroda(\/|$)/.test(location.hash) || /^#iroda\/uj/.test(location.hash)) document.body.classList.remove("wsMode");
    });

    document.addEventListener("click", e => {
        const b = e.target.closest("#navWorkBtn");
        if (!b) return;
        e.preventDefault();
        if (document.body.classList.contains("wsMode")) {
            ment("bongesz");
            document.body.classList.remove("wsMode");
            location.hash = "#home";
        } else {
            ment("munka");
            location.hash = "#iroda";
        }
    });

    // Belépéskor: aki legutóbb a munkaterületen dolgozott, a kezdőlap helyett oda kerül
    if (typeof AuthManager === "undefined" || AuthManager.__wsHorog) return;
    AuthManager.__wsHorog = true;
    let egyszer = false;
    const eredeti = AuthManager.setMe;
    AuthManager.setMe = function (me) {
        const r = eredeti.call(this, me);
        try {
            if (!egyszer && me && me.user && (me.irodak || []).length) {
                egyszer = true;
                const h = location.hash;
                if ((h === "" || h === "#" || h === "#home") && mod() !== "bongesz") location.hash = "#iroda";
            }
        } catch (e) { /* nem baj */ }
        return r;
    };

})();
