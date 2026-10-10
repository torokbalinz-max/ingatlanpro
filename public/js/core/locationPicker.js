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
//  Nagyítás: a +/− gombok mellett görgővel is (ha az egér egy pillanatra
//  megáll a térképen, vagy rákattintottál – így az oldal görgetése nem
//  akad meg rajta), Ctrl + görgővel / két ujjal azonnal. A "Teljes
//  képernyő" gombbal a térkép kitölti a képernyőt (Esc vagy "Kész": vissza).
//
//  Címkereső: utca (házszámmal), kerület, falu a város körül (a kiválasztott
//  városban keres, így nem kerülhet egy azonos nevű másik helyre). Utcánál
//  a térkép kiemeli az egész utcát, így pontosan rá lehet kattintani.
//  "A leírásból" gomb: a hirdetés szövegében talált utca / kerület / falu.
//  Ha a pont messze van a várostól, figyelmeztetés jelenik meg.
//
//  opts.varos:    () => a kiválasztott város (a mi nevünk)
//  opts.szoveg:   () => { cim, leiras, tipus, telepules, kerulet }
// ============================================================

class LocationPicker {

    static ALAP = [45.8590, 25.7900];

    // A keresési találatok ikonja (a találat szintje szerint)
    static IKON = {
        haz: "fa-house", utca: "fa-road", kerulet: "fa-draw-polygon",
        telepules: "fa-tree-city", varos: "fa-city", hely: "fa-location-dot"
    };

    // Görgős nagyítás: ennyi ideig kell az egérnek a térképen állnia
    static GORGO_VAR_MS = 450;

    constructor(containerId, opts = {}) {

        this.box = document.getElementById(containerId);
        this.opts = opts;
        this.x = opts.x || null;
        this.y = opts.y || null;
        this.mod = opts.pontossag === "kozelito" ? "kozelito" : "pontos";
        this.sugar = opts.sugar || 500;
        this.mozgatva = false;
        this.id = containerId;
        this.nagy = false;
        this.erintes = 0;
        this.ac = typeof AbortController !== "undefined" ? new AbortController() : null;

        const esc = Utils.escape;

        this.box.classList.add("locPicker");
        this.box.innerHTML = `
            <div class="locFullHead">
                <b><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i> ${esc(I18n.t("locFullTitle"))}</b>
                <span class="locFullTip small">${esc(I18n.t("locFullTip"))}</span>
                <button type="button" class="btn btn-primary btn-sm locFullDone"><i class="fa-solid fa-check" aria-hidden="true"></i> ${esc(I18n.t("locFullDone"))}</button>
            </div>
            <div class="locBar">
                <div class="btn-group btn-group-sm" role="group" aria-label="${esc(I18n.t("locModeLabel"))}">
                    <input type="radio" class="btn-check" name="${this.id}_mod" id="${this.id}_pontos" value="pontos" ${this.mod === "pontos" ? "checked" : ""}>
                    <label class="btn btn-outline-secondary" for="${this.id}_pontos"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${I18n.t("hely_pontos")}</label>
                    <input type="radio" class="btn-check" name="${this.id}_mod" id="${this.id}_kozelito" value="kozelito" ${this.mod === "kozelito" ? "checked" : ""}>
                    <label class="btn btn-outline-secondary" for="${this.id}_kozelito"><i class="fa-regular fa-circle" aria-hidden="true"></i> ${I18n.t("hely_kozelito")}</label>
                </div>
                <label class="locRadius" ${this.mod === "kozelito" ? "" : "hidden"}>
                    <span>${I18n.t("locRadius")}</span>
                    <input type="range" min="150" max="3000" step="50" value="${this.sugar}" aria-label="${esc(I18n.t("locRadius"))}">
                    <b class="locRadiusVal">${LocationPicker.meter(this.sugar)}</b>
                </label>
                ${this.x ? "" : `<span class="locHint">${I18n.t("locClickHint")}</span>`}
                <button type="button" class="btn btn-sm btn-outline-secondary locFullToggle" aria-pressed="false">
                    <i class="fa-solid fa-expand" aria-hidden="true"></i> <span>${esc(I18n.t("locFullscreen"))}</span>
                </button>
            </div>
            <div class="locSearch">
                <div class="input-group input-group-sm">
                    <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
                    <input type="search" class="form-control locSearchInput" placeholder="${esc(I18n.t("locSearchPh"))}" aria-label="${esc(I18n.t("locSearchPh"))}" autocomplete="off">
                    <button class="btn btn-outline-secondary locSearchBtn" type="button">${I18n.t("locSearchBtn")}</button>
                </div>
                ${opts.szoveg ? `<button class="btn btn-sm btn-outline-primary locFromText" type="button"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ${I18n.t("locFromText")}</button>` : ""}
            </div>
            <div class="locResults" hidden></div>
            <div class="locMapWrap">
                <div class="locMap"></div>
                <div class="locZoomTip" hidden>${esc(I18n.t("locWheelTip"))}</div>
            </div>
            <div class="locDistrict small" hidden></div>
            <div class="locWarn alert alert-warning small py-2 mb-0" hidden></div>`;

        this.mapEl = this.box.querySelector(".locMap");

        const kozep = this.x && this.y ? [this.y, this.x] : (opts.kozep || LocationPicker.varosKozep(this.varos()) || LocationPicker.ALAP);

        this.map = L.map(this.mapEl, { scrollWheelZoom: false, wheelPxPerZoomLevel: 80 })
            .setView(kozep, this.x ? (this.mod === "kozelito" ? 14 : 16) : 13);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(this.map);

        this.map.getContainer().style.cursor = "crosshair";

        this.map.on("click", e => this.set(e.latlng.lng, e.latlng.lat, true));

        // A város kerülethatárai (ha az admin megrajzolta) – látszik, hová esik a pont
        if (opts.hatarok !== false) this.drawDistricts();

        // Teljes képernyő gomb a térképen is (a +/− alatt)
        const picker = this;
        const Nagyit = L.Control.extend({
            options: { position: "topleft" },
            onAdd() {
                const b = L.DomUtil.create("button", "leaflet-bar locFullMapBtn");
                b.type = "button";
                b.title = I18n.t("locFullscreen");
                b.setAttribute("aria-label", I18n.t("locFullscreen"));
                b.innerHTML = `<i class="fa-solid fa-expand" aria-hidden="true"></i>`;
                L.DomEvent.disableClickPropagation(b);
                L.DomEvent.on(b, "click", e => { L.DomEvent.preventDefault(e); picker.nagyit(!picker.nagy); });
                picker.fullMapBtn = b;
                return b;
            }
        });
        this.map.addControl(new Nagyit());

        this.box.querySelector(".locFullToggle").onclick = () => this.nagyit(!this.nagy);
        this.box.querySelector(".locFullDone").onclick = () => this.nagyit(false);

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

        this.gorgoInit();

        this.draw();
        if (this.x && this.y) this.ellenoriz();
        this.kerulteKiir();

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

    // ---------- Nagyítás görgővel / két ujjal ----------

    gorgoInit() {

        const m = this.map;
        const el = this.mapEl;
        const opt = this.ac ? { signal: this.ac.signal } : undefined;
        let idozito = null;

        const be = () => {
            clearTimeout(idozito);
            if (!m.scrollWheelZoom.enabled()) m.scrollWheelZoom.enable();
            this.tipp(false);
        };
        const ki = () => {
            clearTimeout(idozito);
            if (!this.nagy && m.scrollWheelZoom.enabled()) m.scrollWheelZoom.disable();
        };
        const varj = () => {
            clearTimeout(idozito);
            idozito = setTimeout(be, LocationPicker.GORGO_VAR_MS);
        };

        el.addEventListener("mouseenter", varj);
        el.addEventListener("mouseleave", ki);

        // Ha az oldal görgetése közben ér ide az egér, előbb tovább görgethet az oldal;
        // Ctrl + görgő (és a tapipad két ujjas csippentése) azonnal nagyít
        el.addEventListener("wheel", e => {
            if (m.scrollWheelZoom.enabled()) return;
            if (e.ctrlKey) {
                e.preventDefault();
                be();
                const pont = m.mouseEventToContainerPoint(e);
                m.setZoomAround(pont, m.getZoom() + (e.deltaY < 0 ? 1 : -1));
                return;
            }
            this.tipp(true);
            varj();
        }, { passive: false });

        // Kattintás / húzás után már görgővel is nagyít
        m.on("mousedown", be);

        // Safari (Mac / iPad tapipad): a csippentés "gesture" esemény – érintőképernyőn
        // a Leaflet maga kezeli, ezért ott nem
        el.addEventListener("pointerdown", e => { if (e.pointerType === "touch") this.erintes++; });
        window.addEventListener("pointerup", e => { if (e.pointerType === "touch" && this.erintes > 0) this.erintes--; }, opt);
        window.addEventListener("pointercancel", e => { if (e.pointerType === "touch" && this.erintes > 0) this.erintes--; }, opt);

        let kezdo = null;
        el.addEventListener("gesturestart", e => {
            if (this.erintes > 0) return;
            e.preventDefault();
            kezdo = m.getZoom();
        });
        el.addEventListener("gesturechange", e => {
            if (this.erintes > 0 || kezdo === null) return;
            e.preventDefault();
            const z = Math.max(m.getMinZoom(), Math.min(m.getMaxZoom(), kezdo + Math.log2(e.scale || 1)));
            const pont = Number.isFinite(e.clientX) ? m.mouseEventToContainerPoint(e) : m.getSize().divideBy(2);
            m.setZoomAround(pont, Math.round(z * 4) / 4, { animate: false });
        });
        el.addEventListener("gestureend", () => { kezdo = null; });

    }

    // "Állj meg egy pillanatra a térképen, vagy kattints rá – utána görgővel nagyíthatsz"
    tipp(mutat) {
        const t = this.box.querySelector(".locZoomTip");
        if (!t) return;
        clearTimeout(this.tippIdozito);
        if (!mutat) { t.hidden = true; return; }
        t.hidden = false;
        this.tippIdozito = setTimeout(() => { t.hidden = true; }, 1600);
    }

    // ---------- Teljes képernyő ----------

    nagyit(be) {

        be = !!be;
        if (be === this.nagy) return;
        this.nagy = be;

        // Egy felugró ablakban (pl. a város helye) helyben marad – kivinni a
        // fókusz miatt nem lehet; máshol az oldal végére kerül, hogy semmi
        // (fejléc, mentés-sáv) ne takarja
        const modalban = !!this.box.closest(".modal");

        if (be) {

            if (!modalban) {
                this.helyJel = document.createComment("locPicker");
                this.box.parentNode.insertBefore(this.helyJel, this.box);
                document.body.appendChild(this.box);
            }

            this.box.classList.add("locFull");
            document.body.classList.add("locFullOpen");
            this.map.scrollWheelZoom.enable();

            this.escFn = e => {
                if (e.key !== "Escape") return;
                e.preventDefault();
                e.stopPropagation();
                this.nagyit(false);
            };
            document.addEventListener("keydown", this.escFn, true);

        } else {

            if (this.helyJel && this.helyJel.parentNode) {
                this.helyJel.parentNode.insertBefore(this.box, this.helyJel);
                this.helyJel.remove();
            }
            this.helyJel = null;

            this.box.classList.remove("locFull");
            if (!document.querySelector(".locPicker.locFull")) document.body.classList.remove("locFullOpen");
            this.map.scrollWheelZoom.disable();

            if (this.escFn) document.removeEventListener("keydown", this.escFn, true);
            this.escFn = null;

        }

        // A gombok felirata / ikonja
        const t = this.box.querySelector(".locFullToggle");
        if (t) {
            t.setAttribute("aria-pressed", String(be));
            t.innerHTML = `<i class="fa-solid ${be ? "fa-compress" : "fa-expand"}" aria-hidden="true"></i> <span>${Utils.escape(I18n.t(be ? "locFullExit" : "locFullscreen"))}</span>`;
        }
        if (this.fullMapBtn) {
            this.fullMapBtn.innerHTML = `<i class="fa-solid ${be ? "fa-compress" : "fa-expand"}" aria-hidden="true"></i>`;
            this.fullMapBtn.title = I18n.t(be ? "locFullExit" : "locFullscreen");
            this.fullMapBtn.setAttribute("aria-label", this.fullMapBtn.title);
        }

        setTimeout(() => {
            this.map.invalidateSize();
            if (this.x && this.y) this.map.panTo([this.y, this.x], { animate: false });
        }, 60);

        if (!be && !modalban) {
            // Vissza a helyére: ott látszódjon, ahol abbahagytad
            setTimeout(() => { if (this.box.scrollIntoView) this.box.scrollIntoView({ block: "nearest" }); }, 80);
        }

    }

    // Városváltáskor: ha még nincs pont, a térkép az új városra ugrik
    varosValtas() {
        this.drawDistricts();
        this.kerulteKiir();
        if (this.x && this.y) return this.ellenoriz();
        const k = LocationPicker.varosKozep(this.varos());
        if (k) this.map.setView(k, 13);
    }

    // ---------- Címkeresés a város körül ----------

    keres(q) {

        const box = this.box.querySelector(".locResults");
        const esc = Utils.escape;

        if (q.length < 3) {
            box.hidden = false;
            box.innerHTML = `<span class="small text-body-secondary">${I18n.t("locTypeMore")}</span>`;
            return;
        }

        box.hidden = false;
        box.innerHTML = `<span class="small text-body-secondary"><span class="spinner-border spinner-border-sm"></span> ${I18n.t("locSearching")}</span>`;

        fetch(`/api/hely/kereses?varos=${encodeURIComponent(this.varos() || "")}&q=${encodeURIComponent(q)}`)
            .then(r => {
                if (r.status === 401) throw new Error("login_required");
                return r.json();
            })
            .then(lista => {

                if (!Array.isArray(lista) || !lista.length) {
                    box.innerHTML = `<span class="small text-body-secondary">${I18n.t("locNoResult")}</span>`;
                    return;
                }

                const km = t => t.tavolKm !== null && t.tavolKm !== undefined && t.tavolKm >= 0.5
                    ? ` · ${I18n.f("locKmFromCity", { km: Utils.num(t.tavolKm, 1) })}` : "";

                box.innerHTML = `
                    <div class="locResultsHead small text-body-secondary">${I18n.f("locResultsCount", { n: lista.length })}</div>
                    ${lista.map((t, idx) => `
                        <button type="button" class="locResult ${t.tavol ? "isFar" : ""}" data-idx="${idx}">
                            <i class="fa-solid ${LocationPicker.IKON[t.szint] || "fa-location-dot"}" aria-hidden="true"></i>
                            <span class="locResultText">
                                <b>${esc(t.nev || "")}</b>
                                <small>${esc(I18n.t("locLevel_" + (t.szint || "hely")))}${t.telepules ? " · " + esc(t.telepules) : ""}${km(t)}</small>
                            </span>
                            ${t.tavol ? `<span class="badge text-bg-warning">${I18n.t("locFarBadge")}</span>` : ""}
                        </button>`).join("")}`;

                box.querySelectorAll("[data-idx]").forEach(b => {
                    b.onclick = () => {
                        this.valaszt(lista[Number(b.dataset.idx)]);
                        box.hidden = true;
                    };
                });

                // Egy (közeli) találat: rögtön oda
                if (lista.length === 1 && !lista[0].tavol) box.querySelector("[data-idx]").click();

            })
            .catch(err => {
                box.innerHTML = err && err.message === "login_required"
                    ? `<span class="small text-body-secondary">${I18n.t("locLoginNeeded")}</span>`
                    : `<span class="small text-danger">${I18n.t("locNoResult")}</span>`;
            });

    }

    // Egy keresési találat kiválasztása: a pont oda kerül; utcánál az egész utca kiemelve
    valaszt(t) {

        const pontos = t.szint === "haz" || t.szint === "utca";

        this.mod = pontos ? "pontos" : "kozelito";
        if (!pontos) this.sugar = Math.max(150, Math.min(3000, Math.round((t.sugar || 600) / 50) * 50));
        this.syncMod();

        this.utcaKiemel(t.vonalak);
        this.set(t.x, t.y, true);

        if (t.szint === "haz") this.center(18);
        else if (this.utcaLayer && t.szint === "utca") {
            const b = this.utcaLayer.getBounds();
            if (b.isValid()) this.map.fitBounds(b, { maxZoom: 17, padding: [28, 28] });
            else this.center(17);
        }
        else if (this.kor) this.map.fitBounds(this.kor.getBounds(), { maxZoom: 16, padding: [16, 16] });
        else this.center(14);

    }

    // Az utca vonala a térképen (a GeoJSON [hosszúság, szélesség] pontjaiból)
    utcaKiemel(vonalak) {
        if (this.utcaLayer) { this.utcaLayer.remove(); this.utcaLayer = null; }
        if (!Array.isArray(vonalak) || !vonalak.length) return;
        const vonal = vonalak.filter(v => Array.isArray(v) && v.length > 1)
            .map(v => L.polyline(v.map(p => [p[1], p[0]]), { color: "#f59e0b", weight: 7, opacity: 0.55, interactive: false }));
        if (!vonal.length) return;
        this.utcaLayer = L.featureGroup(vonal).addTo(this.map);
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
                if (!h || !(h.x && h.y)) {
                    box.innerHTML = `<span class="small text-body-secondary">${I18n.t("locFromTextNone")}</span>`;
                    return;
                }
                this.mod = h.szint === "kozelito" ? "kozelito" : "pontos";
                if (h.sugar) this.sugar = Math.max(150, Math.min(3000, Math.round(h.sugar / 50) * 50));
                this.syncMod();
                this.utcaKiemel(null);
                this.set(h.x, h.y, true);
                if (this.kor) this.map.fitBounds(this.kor.getBounds(), { maxZoom: 16, padding: [16, 16] });
                else this.center(17);

                const nev = h.nev ? (h.forras === "kerulet" ? CityManager.keruletLabel(h.nev, this.varos()) : h.nev) : "";
                const honnan = I18n.t("locSrc_" + (h.forras || "szoveg"));
                box.innerHTML = `<span class="small text-success"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.f("locFromTextFound", { nev: Utils.escape(nev || I18n.t("locLevel_hely")) })}${honnan && !honnan.startsWith("locSrc_") ? ` <span class="text-body-secondary">(${Utils.escape(honnan)})</span>` : ""}</span>
                    <span class="small text-body-secondary d-block">${I18n.t("locFromTextCheck")}</span>`;
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
        this.kerulteKiir();
        if (felhasznalo && this.opts.onPoint) this.opts.onPoint(x, y);
    }

    drawDistricts() {
        if (typeof Districts === "undefined" || !this.map) return;
        if (this.hatarLayer) { this.hatarLayer.remove(); this.hatarLayer = null; }
        const varos = this.varos();
        if (!Districts.any(varos)) return;
        this.hatarLayer = Districts.layer(varos, { labels: true, fillOpacity: 0.04, weight: 1.2 }).addTo(this.map);
    }

    // A pont alatt: melyik kerületbe esik (a megrajzolt határok szerint)
    kerulteKiir() {
        const box = this.box.querySelector(".locDistrict");
        if (!box || typeof Districts === "undefined") return;
        const k = this.x && this.y ? Districts.findObj(this.varos(), this.x, this.y) : null;
        box.hidden = !k;
        if (k) box.innerHTML = `<i class="fa-solid fa-draw-polygon" aria-hidden="true"></i> ${I18n.t("locInDistrict")}: <b>${Utils.escape(CityManager.keruletLabelOf(k))}</b>`;
    }

    clear() {
        this.x = null;
        this.y = null;
        this.utcaKiemel(null);
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
        if (this.nagy) this.nagyit(false);
        if (this.ac) this.ac.abort();
        clearTimeout(this.tippIdozito);
        clearTimeout(this.ellTimer);
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
