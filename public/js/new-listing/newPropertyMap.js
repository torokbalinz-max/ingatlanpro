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
            onChange: h => {
                document.getElementById("ujX").value = h.x ? Number(h.x).toFixed(7) : "";
                document.getElementById("ujY").value = h.y ? Number(h.y).toFixed(7) : "";
                NewPropertyManager.helySugar = h.hely_sugar;
                NewPropertyManager.setLocationInfo(h.x ? h.hely_pontossag : null);
            },
            onPoint: (px, py) => {
                const sel = document.getElementById("ujKerulet");
                const varos = document.getElementById("ujVaros").value;
                if (!sel || sel.value || !Types.get(NewPropertyManager.tipus).fields.kerulet) return;
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
