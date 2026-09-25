// ============================================================
//  Ingatlantípusok és ügyletek (eladó / kiadó)
//  A mezők láthatósága típusonként – a szerver listing.js-ével egyezik.
// ============================================================

class Types {

    static LIST = [
        { key: "lakas", icon: "fa-solid fa-building", label: "typeLakas", fields: { szobak: true, emelet: true, allapot: true, telek: false } },
        { key: "haz", icon: "fa-solid fa-house-chimney", label: "typeHaz", fields: { szobak: true, emelet: false, allapot: true, telek: true } },
        { key: "telek", icon: "fa-solid fa-mountain-sun", label: "typeTelek", fields: { szobak: false, emelet: false, allapot: false, telek: false } },
        { key: "kereskedelmi", icon: "fa-solid fa-store", label: "typeKereskedelmi", fields: { szobak: false, emelet: true, allapot: true, telek: false } },
        { key: "iroda", icon: "fa-solid fa-briefcase", label: "typeIroda", fields: { szobak: true, emelet: true, allapot: true, telek: false } }
    ];

    static get(key) {
        return Types.LIST.find(t => t.key === key) || Types.LIST[0];
    }

    static label(key) {
        return I18n.t(Types.get(key).label);
    }

    static ugyletLabel(key) {
        return I18n.t(key === "kiado" ? "ugyletKiado" : "ugyletElado");
    }

    // Csempés típusválasztó kirajzolása egy konténerbe
    static renderGrid(containerId, current, onChange) {

        const box = document.getElementById(containerId);

        if (!box) return;

        box.innerHTML = Types.LIST.map(t => `
            <button type="button" class="typeBtn ${t.key === current ? "active" : ""}" data-type="${t.key}">
                <i class="${t.icon}"></i>
                <span>${I18n.t(t.label)}</span>
            </button>`).join("");

        box.querySelectorAll(".typeBtn").forEach(btn => {
            btn.onclick = () => {
                box.querySelectorAll(".typeBtn").forEach(b => b.classList.toggle("active", b === btn));
                onChange(btn.dataset.type);
            };
        });

    }

    // A [data-field] elemek elrejtése, ha a típusnál nem értelmes
    static applyFields(rootSelector, tipus) {

        const f = Types.get(tipus).fields;

        document.querySelectorAll(`${rootSelector} [data-field]`).forEach(el => {
            const k = el.dataset.field;
            el.style.display = f[k] === false ? "none" : "";
        });

    }

}
