// ============================================================
//  Mentett keresések
//   - "Keresés mentése" gomb a kereső alján
//   - a Fiókom → Mentett keresések fülön: lista, új találatok száma,
//     egy kattintással visszatölti a szűrőket
// ============================================================

class SavedSearches {

    static init() {

        const btn = document.getElementById("saveSearchBtn");
        if (btn) btn.onclick = () => AuthManager.kell().then(() => SavedSearches.mentesAblak()).catch(() => { });

    }

    // A szűrők röviden, szövegesen ("Lakás · Sepsiszentgyörgy · max. 90 000 € · 2+ szoba")
    static leiras(f) {

        f = f || {};
        const van = v => v !== null && v !== undefined && v !== "";
        const tart = (min, max, fmt) => {
            if (!van(min) && !van(max)) return "";
            if (van(min) && van(max)) return Number(min) === Number(max) ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
            return van(min) ? `${I18n.t("reqFrom")} ${fmt(min)}` : `${I18n.t("reqUpTo")} ${fmt(max)}`;
        };

        const r = [];
        r.push(Types.label(f.tipus || "lakas") + (f.ugylet === "kiado" ? " · " + Types.ugyletLabel("kiado") : ""));
        if (f.varos) r.push(CityManager.displayName(f.varos));
        if (f.kerulet) r.push(CityManager.keruletLabel(f.kerulet, f.varos));
        if (f.telepules) r.push(f.telepules === "_varos" ? I18n.t("telepulesVarosban") : CityManager.telepulesLabel(f.telepules));

        const ar = tart(f.minAr, f.maxAr, v => Utils.eur(v));
        if (ar) r.push(ar);
        const nm = tart(f.minNm, f.maxNm, v => Utils.num(v) + " m²");
        if (nm) r.push(nm);
        const sz = tart(f.minSzoba, f.maxSzoba, v => v);
        if (sz) r.push(`${sz} ${I18n.t("reqRooms")}`);
        const em = tart(f.minEmelet, f.maxEmelet, v => v);
        if (em) r.push(`${I18n.t("floorWordCap")} ${em}`);
        if (f.allapot) r.push(Utils.allapotLabel(f.allapot));
        if (f.jelleg) r.push(I18n.t("jelleg_" + f.jelleg));
        if (f.hely) r.push(I18n.t("hely_" + f.hely));

        return r.filter(Boolean).join(" · ");

    }

    static szurok() {
        const f = FilterManager.read();
        delete f.sources;
        return f;
    }

    static mentesAblak() {

        const f = SavedSearches.szurok();

        let el = document.getElementById("saveSearchModal");

        if (!el) {
            el = document.createElement("div");
            el.id = "saveSearchModal";
            el.className = "modal fade";
            el.tabIndex = -1;
            el.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content"></div></div>`;
            document.body.appendChild(el);
        }

        el.querySelector(".modal-content").innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title"><i class="fa-regular fa-bookmark"></i> ${I18n.t("saveSearchTitle")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${I18n.t("close")}"></button>
            </div>
            <div class="modal-body">
                <div class="d-flex flex-wrap gap-1 mb-3">${FilterManager.describe().map(c => `<span class="filterChip">${c}</span>`).join("")}</div>
                <label class="form-label" for="ssNev">${I18n.t("saveSearchName")}</label>
                <input class="form-control mb-3" id="ssNev" maxlength="80" value="${Utils.escape(SavedSearches.leiras(f).slice(0, 80))}">
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="ssErtesites" checked>
                    <label class="form-check-label" for="ssErtesites">${I18n.t(AuthManager.config.email ? "saveSearchNotifyEmail" : "saveSearchNotify")}</label>
                </div>
                <div class="ssError alert alert-danger small py-2 mt-3" hidden></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("cancel")}</button>
                <button type="button" class="btn btn-primary" id="ssMent"><i class="fa-solid fa-check"></i> ${I18n.t("save")}</button>
            </div>`;

        const modal = bootstrap.Modal.getOrCreateInstance(el);

        document.getElementById("ssMent").onclick = () => {

            fetch("/api/keresesek", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nev: document.getElementById("ssNev").value, szurok: f, ertesites: document.getElementById("ssErtesites").checked })
            })
                .then(r => r.json().then(d => ({ ok: r.ok, d })))
                .then(({ ok, d }) => {
                    if (!ok) {
                        const e = el.querySelector(".ssError");
                        e.hidden = false;
                        e.innerText = I18n.t(d.error === "too_many_searches" ? "saveSearchTooMany" : "alertSaveError");
                        return;
                    }
                    modal.hide();
                    Utils.toast(I18n.t("saveSearchDone"));
                });

        };

        modal.show();

    }

    // Rövid visszajelzés a képernyő alján
    static toast(szoveg) {
        let t = document.getElementById("ipToast");
        if (!t) {
            t = document.createElement("div");
            t.id = "ipToast";
            t.className = "ipToast";
            t.setAttribute("role", "status");
            document.body.appendChild(t);
        }
        t.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${Utils.escape(szoveg)}`;
        t.classList.add("show");
        clearTimeout(SavedSearches.toastTimer);
        SavedSearches.toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
    }

    // Egy mentett keresés visszatöltése a keresőbe
    static alkalmaz(f) {

        const beallit = () => {

            FilterManager.tipus = f.tipus || "lakas";
            FilterManager.ugylet = f.ugylet || "elado";

            const ug = document.getElementById(FilterManager.ugylet === "kiado" ? "ugyletKiado" : "ugyletElado");
            if (ug) ug.checked = true;

            FilterManager.renderTypes();
            FilterManager.onTypeChange();

            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ""; };

            ["minAr", "maxAr", "minNm", "maxNm", "minSzoba", "maxSzoba", "minEmelet", "maxEmelet"].forEach(k => set(k, f[k]));
            set("allapot", f.allapot);
            set("keresoHely", f.hely);
            set("keresoJelleg", f.jelleg);
            set("keresoTelepules", f.telepules);

            document.getElementById("hideDuplicates").checked = f.hideDup !== false;
            document.getElementById("onlyWithPhotos").checked = !!f.onlyPhotos;

            FilterManager.selectedSources = null;
            FilterManager.renderSources();

            // A kerületlista betöltése után állítjuk be a kerületet
            const ker = document.getElementById("keresoKerulet");
            const kerBeallit = () => { if (ker) ker.value = f.kerulet || ""; FilterManager.apply(); };

            kerBeallit();
            setTimeout(kerBeallit, 400);

        };

        PageManager.show("properties");

        if (f.varos && f.varos !== DataManager.currentCity) {
            DataManager.setCity(f.varos);
            CityManager.fillCitySelect(document.getElementById("citySelect"), f.varos);
            CityManager.loadSearchKeruletek(f.varos);
            return DataManager.init().then(beallit);
        }

        beallit();
        return Promise.resolve();

    }

}

// Közös rövid visszajelzés (más modulok is használják)
if (!Utils.toast) Utils.toast = szoveg => SavedSearches.toast(szoveg);
