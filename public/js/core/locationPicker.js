// ============================================================
//  Helyválasztó térkép (ellenőrzés, hirdetésfeladás)
//
//  Két mód:
//   - Pontos hely: egy jelölő a térképen
//   - Közelítő hely: egy kör (a sugara állítható) – ha csak a
//     környéket, utcát vagy a települést tudjuk
//  Kattintásra / húzásra a pont áthelyeződik; ilyenkor az
//  onPoint visszahívás megkapja (pl. a kerület megkereséséhez).
// ============================================================

class LocationPicker {

    static ALAP = [45.8590, 25.7900];

    constructor(containerId, opts = {}) {

        this.box = document.getElementById(containerId);
        this.opts = opts;
        this.x = opts.x || null;
        this.y = opts.y || null;
        this.mod = opts.pontossag === "kozelito" ? "kozelito" : "pontos";
        this.sugar = opts.sugar || 500;
        this.mozgatva = false;
        this.id = containerId;

        this.box.innerHTML = `
            <div class="locBar">
                <div class="btn-group btn-group-sm" role="group" aria-label="${I18n.t("locModeLabel")}">
                    <input type="radio" class="btn-check" name="${this.id}_mod" id="${this.id}_pontos" value="pontos" ${this.mod === "pontos" ? "checked" : ""}>
                    <label class="btn btn-outline-secondary" for="${this.id}_pontos"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${I18n.t("hely_pontos")}</label>
                    <input type="radio" class="btn-check" name="${this.id}_mod" id="${this.id}_kozelito" value="kozelito" ${this.mod === "kozelito" ? "checked" : ""}>
                    <label class="btn btn-outline-secondary" for="${this.id}_kozelito"><i class="fa-regular fa-circle" aria-hidden="true"></i> ${I18n.t("hely_kozelito")}</label>
                </div>
                <label class="locRadius" ${this.mod === "kozelito" ? "" : "hidden"}>
                    <span>${I18n.t("locRadius")}</span>
                    <input type="range" min="150" max="3000" step="50" value="${this.sugar}" aria-label="${I18n.t("locRadius")}">
                    <b class="locRadiusVal">${LocationPicker.meter(this.sugar)}</b>
                </label>
                ${this.x ? "" : `<span class="locHint">${I18n.t("locClickHint")}</span>`}
            </div>
            <div class="locMap"></div>`;

        this.mapEl = this.box.querySelector(".locMap");

        const kozep = this.x && this.y ? [this.y, this.x] : (opts.kozep || LocationPicker.ALAP);

        this.map = L.map(this.mapEl, { scrollWheelZoom: false }).setView(kozep, this.x ? (this.mod === "kozelito" ? 14 : 16) : 13);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(this.map);

        this.map.getContainer().style.cursor = "crosshair";

        this.map.on("click", e => this.set(e.latlng.lng, e.latlng.lat, true));

        this.box.querySelectorAll(`input[name="${this.id}_mod"]`).forEach(r => {
            r.addEventListener("change", () => {
                this.mod = r.value;
                this.box.querySelector(".locRadius").hidden = this.mod !== "kozelito";
                this.draw();
                this.valtozott();
            });
        });

        const range = this.box.querySelector(".locRadius input");
        range.addEventListener("input", () => {
            this.sugar = Number(range.value);
            this.box.querySelector(".locRadiusVal").innerText = LocationPicker.meter(this.sugar);
            this.draw();
        });
        range.addEventListener("change", () => this.valtozott());

        this.draw();

        setTimeout(() => this.map.invalidateSize(), 120);

    }

    static meter(m) {
        return m >= 1000 ? `${Utils.num(m / 1000, 1)} km` : `${m} m`;
    }

    // Pont áthelyezése (felhasználó: kattintás / húzás)
    set(x, y, felhasznalo) {
        this.x = x;
        this.y = y;
        if (felhasznalo) this.mozgatva = true;
        const hint = this.box.querySelector(".locHint");
        if (hint) hint.remove();
        this.draw();
        this.valtozott();
        if (felhasznalo && this.opts.onPoint) this.opts.onPoint(x, y);
    }

    clear() {
        this.x = null;
        this.y = null;
        this.draw();
        this.valtozott();
    }

    draw() {

        if (this.marker) { this.map.removeLayer(this.marker); this.marker = null; }
        if (this.kor) { this.map.removeLayer(this.kor); this.kor = null; }

        if (!(this.x && this.y)) return;

        const ll = [this.y, this.x];

        if (this.mod === "kozelito") {
            this.kor = L.circle(ll, { radius: this.sugar, color: Utils.accent(), weight: 2, fillOpacity: 0.14 }).addTo(this.map);
        }

        this.marker = L.marker(ll, { draggable: true, opacity: this.mod === "kozelito" ? 0.75 : 1 }).addTo(this.map);

        this.marker.on("dragend", () => {
            const p = this.marker.getLatLng();
            this.set(p.lng, p.lat, true);
        });

    }

    center(zoom) {
        if (this.x && this.y) this.map.setView([this.y, this.x], zoom || (this.mod === "kozelito" ? 14 : 16));
    }

    refresh() {
        setTimeout(() => { this.map.invalidateSize(); this.center(); }, 150);
    }

    valtozott() {
        if (this.opts.onChange) this.opts.onChange(this.get());
    }

    get() {
        const van = !!(this.x && this.y);
        return {
            x: van ? this.x : null,
            y: van ? this.y : null,
            hely_pontossag: van ? this.mod : "nincs",
            hely_sugar: van && this.mod === "kozelito" ? this.sugar : null
        };
    }

    remove() {
        this.map.remove();
    }

    // Kerület-javaslat a ponthoz (a szerver: térképi környéknév / legközelebbi kerület)
    static keruletJavaslat(varos, x, y) {
        return fetch(`/api/kerulet-helybol?varos=${encodeURIComponent(varos || "")}&x=${x}&y=${y}`)
            .then(r => r.json())
            .then(v => v.kerulet || null)
            .catch(() => null);
    }

}
