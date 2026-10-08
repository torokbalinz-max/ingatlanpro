// ============================================================
//  Hirdetésfeladás – hely a térképen
//  Pontos hely (jelölő) vagy közelítő hely (kör, állítható sugárral).
//  A pont mozgatásakor a kerületet is kitöltjük, ha még üres.
// ============================================================

class NewPropertyMap {

    static picker = null;

    static init() {

        if (!document.getElementById("newMap")) return;

        NewPropertyMap.build(null, null, "pontos", null);

    }

    static build(x, y, pontossag, sugar) {

        if (NewPropertyMap.picker) NewPropertyMap.picker.remove();

        NewPropertyMap.picker = new LocationPicker("newMap", {
            x, y, pontossag, sugar,
            varos: () => (document.getElementById("ujVaros") || {}).value || DataManager.currentCity,
            szoveg: () => ({
                cim: document.getElementById("ujCim").value,
                leiras: document.getElementById("ujLeiras").value,
                tipus: NewPropertyManager.tipus,
                telepules: NewPropertyManager.telepulesErtek(document.getElementById("ujTelepules").value) || null,
                kerulet: (document.getElementById("ujKerulet") || {}).value || null
            }),
            onChange: h => {
                document.getElementById("ujX").value = h.x ? Number(h.x).toFixed(7) : "";
                document.getElementById("ujY").value = h.y ? Number(h.y).toFixed(7) : "";
                NewPropertyManager.helySugar = h.hely_sugar;
                NewPropertyManager.setLocationInfo(h.x ? h.hely_pontossag : null);
            },
            onPoint: (px, py) => {
                const sel = document.getElementById("ujKerulet");
                const varos = document.getElementById("ujVaros").value;
                if (!sel || !Types.fieldsFor(NewPropertyManager.tipus, document.getElementById("ujVaros").value).kerulet) return;
                // A megrajzolt kerülethatár dönt (pontos helynél felülírja a választást)
                const hatar = typeof Districts !== "undefined" && NewPropertyMap.picker && NewPropertyMap.picker.mod === "pontos"
                    ? Districts.find(varos, px, py) : null;
                if (hatar) {
                    sel.value = hatar;
                    sel.classList.remove("is-invalid");
                    return;
                }
                if (sel.value) return;
                LocationPicker.keruletJavaslat(varos, px, py).then(k => {
                    if (k && !sel.value) sel.value = k;
                });
            }
        });

        NewPropertyMap.picker.valtozott();

    }

    // A régi felület: pont beállítása kívülről (beolvasás, szerkesztés)
    static setPoint(x, y, pontossag, center = true, sugar = null) {

        if (!NewPropertyMap.picker) return;

        NewPropertyMap.build(x || null, y || null, pontossag === "kozelito" ? "kozelito" : "pontos", sugar);

        if (center) NewPropertyMap.picker.refresh();

    }

    static refresh() {
        if (NewPropertyMap.picker) NewPropertyMap.picker.refresh();
    }

}
