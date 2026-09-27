// ============================================================
//  Helyválasztó térkép (ellenőrzés, hirdetésfeladás)
//
//  Két mód:
//   - Pontos hely: egy jelölő a térképen
//   - Közelítő hely: egy kör (a sugara állítható) – ha csak a
//     környéket, utcát vagy a települést tudjuk
//  Kattintásra / húzásra a pont áthelyeződik; ilyenkor az
//  onPoint visszahívás megkapja (pl. a kerület megkereséséhez).
//
//  Címkereső: utca / környék / falu a város körül (a kiválasztott
//  városban keres, így nem kerülhet egy azonos nevű másik helyre).
//  "A leírásból" gomb: a hirdetés szövegében talált utca / falu.
//  Ha a pont messze van a várostól, figyelmeztetés jelenik meg.
//
//  opts.varos:    () => a kiválasztott város (a mi nevünk)
//  opts.szoveg:   () => { cim, leiras, tipus, telepules, kerulet }
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
            <div class="locSearch">
                <div class="input-group input-group-sm">
                    <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
                    <input type="search" class="form-control locSearchInput" placeholder="${Utils.escape(I18n.t("locSearchPh"))}" aria-label="${Utils.escape(I18n.t("locSearchPh"))}">
                    <button class="btn btn-outline-secondary locSearchBtn" type="button">${I18n.t("locSearchBtn")}</button>
                </div>
                ${opts.szoveg ? `<button class="btn btn-sm btn-outline-primary locFromText" type="button"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ${I18n.t("locFromText")}</button>` : ""}
            </div>
            <div class="locResults" hidden></div>
            <div class="locMap"></div>
            <div class="locWarn alert alert-warning small py-2 mb-0" hidden></div>`;

        this.mapEl = this.box.querySelector(".locMap");

        const kozep = this.x && this.y ? [this.y, this.x] : (opts.kozep || LocationPicker.varosKozep(this.varos()) || LocationPicker.ALAP);

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

        // Címkereső
        const input = this.box.querySelector(".locSearchInput");
        const keres = () => this.keres(input.value.trim());
        this.box.querySelector(".locSearchBtn").onclick = keres;
        input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); keres(); } });

        const szovegBtn = this.box.querySelector(".locFromText");
        if (szovegBtn) szovegBtn.onclick = () => this.szovegbol(szovegBtn);

        this.draw();
        if (this.x && this.y) this.ellenoriz();

        setTimeout(() => this.map.invalidateSize(), 120);

    }

    static meter(m) {
        return m >= 1000 ? `${Utils.num(m / 1000, 1)} km` : `${m} m`;
    }

    varos() {
        const v = this.opts.varos;
        return typeof v === "function" ? v() : (v || DataManager.currentCity);
    }

    // A város közepe (a varosok táblából), [szélesség, hosszúság]
    static varosKozep(varos) {
        const v = (CityManager.varosok || []).find(c => c.nev === varos);
        return v && v.x && v.y ? [v.y, v.x] : null;
    }

    // Városváltáskor: ha még nincs pont, a térkép az új városra ugrik
    varosValtas() {
        if (this.x && this.y) return this.ellenoriz();
        const k = LocationPicker.varosKozep(this.varos());
        if (k) this.map.setView(k, 13);
    }

    // Címkeresés a város körül
    keres(q) {

        const box = this.box.querySelector(".locResults");

        if (q.length < 3) { box.hidden = true; return; }

        box.hidden = false;
        box.innerHTML = `<span class="small text-body-secondary"><span class="spinner-border spinner-border-sm"></span> ${I18n.t("locSearching")}</span>`;

        fetch(`/api/hely/kereses?varos=${encodeURIComponent(this.varos() || "")}&q=${encodeURIComponent(q)}`)
            .then(r => r.json())
            .then(lista => {

                if (!Array.isArray(lista) || !lista.length) {
                    box.innerHTML = `<span class="small text-body-secondary">${I18n.t("locNoResult")}</span>`;
                    return;
                }

                box.innerHTML = lista.map((t, idx) => `
                    <button type="button" class="locResult" data-idx="${idx}">
                        <i class="fa-solid ${t.szint === "utca" ? "fa-road" : "fa-location-dot"}" aria-hidden="true"></i>
                        <span>${Utils.escape(t.nev || "")}${t.telepules ? ` <small class="text-body-secondary">${Utils.escape(t.telepules)}</small>` : ""}</span>
                    </button>`).join("");

                box.querySelectorAll("[data-idx]").forEach(b => {
                    b.onclick = () => {
                        const t = lista[Number(b.dataset.idx)];
                        this.mod = t.szint === "utca" ? "pontos" : "kozelito";
                        if (this.mod === "kozelito") this.sugar = 600;
                        this.syncMod();
                        this.set(t.x, t.y, true);
                        this.center(this.mod === "kozelito" ? 14 : 17);
                        box.hidden = true;
                    };
                });

                // Egy találat: rögtön oda
                if (lista.length === 1) box.querySelector("[data-idx]").click();

            })
            .catch(() => { box.innerHTML = `<span class="small text-danger">${I18n.t("locNoResult")}</span>`; });

    }

    // A hirdetés szövegéből (utca, falu, kerület)
    szovegbol(gomb) {

        const d = this.opts.szoveg ? this.opts.szoveg() : {};
        const box = this.box.querySelector(".locResults");

        gomb.disabled = true;
        box.hidden = false;
        box.innerHTML = `<span class="small text-body-secondary"><span class="spinner-border spinner-border-sm"></span> ${I18n.t("locSearching")}</span>`;

        fetch("/api/hely/szovegbol", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...d, varos: this.varos() })
        })
            .then(r => r.json())
            .then(h => {
                if (!h) {
                    box.innerHTML = `<span class="small text-body-secondary">${I18n.t("locFromTextNone")}</span>`;
                    return;
                }
                this.mod = h.szint === "kozelito" ? "kozelito" : "pontos";
                if (h.sugar) this.sugar = h.sugar;
                this.syncMod();
                this.set(h.x, h.y, true);
                this.center(this.mod === "kozelito" ? 14 : 17);
                box.innerHTML = `<span class="small text-success"><i class="fa-solid fa-check"></i> ${I18n.f("locFromTextFound", { nev: Utils.escape(h.nev || "") })}</span>`;
            })
            .catch(() => { box.innerHTML = `<span class="small text-danger">${I18n.t("locNoResult")}</span>`; })
            .finally(() => { gomb.disabled = false; });

    }

    // A módválasztó és a sugár csúszka a belső állapothoz igazítva
    syncMod() {
        const r = this.box.querySelector(`#${this.id}_${this.mod}`);
        if (r) r.checked = true;
        const rad = this.box.querySelector(".locRadius");
        rad.hidden = this.mod !== "kozelito";
        rad.querySelector("input").value = this.sugar;
        rad.querySelector(".locRadiusVal").innerText = LocationPicker.meter(this.sugar);
    }

    // Figyelmeztetés, ha a pont messze van a várostól / a falutól
    ellenoriz() {

        const warn = this.box.querySelector(".locWarn");
        if (!warn) return;

        clearTimeout(this.ellTimer);

        if (!(this.x && this.y)) { warn.hidden = true; return; }

        this.ellTimer = setTimeout(() => {
            const d = this.opts.szoveg ? this.opts.szoveg() : {};
            fetch("/api/hely/ellenoriz", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ varos: this.varos(), x: this.x, y: this.y, tipus: d.tipus, telepules: d.telepules })
            })
                .then(r => r.json())
                .then(v => {
                    const t = v && v.tavol;
                    warn.hidden = !t;
                    if (t) warn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${I18n.f(t.hova === "telepules" ? "locFarVillage" : "locFarCity", { km: Utils.num(t.km, 1), varos: Utils.escape(CityManager.displayName(this.varos())) })}`;
                })
                .catch(() => { warn.hidden = true; });
        }, 400);

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
        this.ellenoriz();
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
