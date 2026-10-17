// ============================================================
//  Nyomtatható iratok (számla, díjbekérő, szerződés) linkjei
//
//  A hivatalos szöveg román; mellé fordítás kérhető (?ford=hu | en | ro).
//    - A felhasználónál alapból a felülete nyelve (magyar / angol felületen
//      a román mellett magyarul / angolul is látja; román felületen csak román).
//    - Az adminban az Irattárban választott nyelv (vagy a Pénzügyek →
//      Beállítások alapértéke).
//  Az iraton felül bármikor átváltható, és a „Vissza” gomb visszahoz.
// ============================================================

class Dokumentum {

    static KULCS = "dokForditas";

    // Az adminban választott fordítás: "" (alapérték) | "ro" | "hu" | "en"
    static adminForditas() {
        try { return localStorage.getItem(Dokumentum.KULCS) || ""; } catch (e) { return ""; }
    }

    static adminForditasMent(v) {
        try { localStorage.setItem(Dokumentum.KULCS, v || ""); } catch (e) { /* nem kritikus */ }
    }

    // A link végére: ?ford=…&ui=…
    static q(admin = false) {
        const ui = ["hu", "ro", "en"].includes(I18n.current) ? I18n.current : "hu";
        const ford = admin ? Dokumentum.adminForditas() : (["hu", "en"].includes(I18n.current) ? I18n.current : "ro");
        const p = new URLSearchParams();
        if (ford) p.set("ford", ford);
        p.set("ui", ui);
        return "?" + p.toString();
    }

}
