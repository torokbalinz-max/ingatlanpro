class UIManager {

    static selectedIngatlan = null;

    static showDetails(i) {

        UIManager.selectedIngatlan = i;

        const t = Types.get(i.tipus);

        document.getElementById("detailIdLabel").innerText = `${Types.label(i.tipus)} · ${Types.ugyletLabel(i.ugylet)}`;
        document.getElementById("detailId").innerText = "#" + i.id;

        document.getElementById("detailAr").innerText = Utils.price(i);
        document.getElementById("detailArNm").innerText = Utils.eurNm(Utils.arNm(i));
        document.getElementById("detailNm").innerText = i.nm ? Utils.num(i.nm) + " m²" : "-";
        document.getElementById("detailSzoba").innerText = t.fields.szobak ? (i.szobak ?? "-") : "–";
        document.getElementById("detailEmelet").innerText = t.fields.emelet ? (i.emelet || "-") : "–";
        document.getElementById("detailAllapot").innerText = t.fields.allapot ? Utils.allapotLabel(i.allapot) : "–";
        document.getElementById("detailHely").innerText =
            [CityManager.displayName(i.varos), i.kerulet].filter(Boolean).join(" · ") || "-";

        const src = document.getElementById("detailSource");
        src.outerHTML = (i.forrasok || [i.forras]).map(Sources.badge).join(" ").replace("<span ", '<span id="detailSource" ');

        const foto = Utils.photoUrl(i);
        const photo = document.getElementById("detailPhoto");
        photo.style.display = foto ? "" : "none";
        photo.innerHTML = foto ? `<img src="${Utils.escape(foto)}" referrerpolicy="no-referrer" alt="" onerror="this.parentElement.style.display='none'">` : "";

        UIManager.updateFavoriteButton(i.id);

    }

    static showNoSelection() {

        UIManager.selectedIngatlan = null;

        document.getElementById("detailIdLabel").innerText = "";
        document.getElementById("detailId").innerText = I18n.t("detailNincsKivalasztva");

        ["detailAr", "detailArNm", "detailNm", "detailSzoba", "detailEmelet", "detailAllapot", "detailHely"]
            .forEach(id => { document.getElementById(id).innerText = "-"; });

        const src = document.getElementById("detailSource");
        if (src) src.style.display = "none";

        const photo = document.getElementById("detailPhoto");
        photo.style.display = "none";
        photo.innerHTML = "";

        const btn = document.getElementById("btnFavoriteToggle");
        btn.innerHTML = I18n.t("favAdd");
        btn.classList.add("btn-outline-warning");
        btn.classList.remove("btn-warning");

    }

    static updateFavoriteButton(id) {

        const btn = document.getElementById("btnFavoriteToggle");

        if (!btn) return;

        const isFav = DataManager.isFavorite(id);

        btn.innerHTML = isFav ? I18n.t("favRemove") : I18n.t("favAdd");
        btn.classList.toggle("btn-warning", isFav);
        btn.classList.toggle("btn-outline-warning", !isFav);

    }

    static requireSelection() {

        if (!UIManager.selectedIngatlan) {
            alert(I18n.t("alertNincsKivalasztva"));
            return false;
        }

        return true;

    }

    // Törlés megerősítéssel – igaz, ha sikerült
    static deleteProperty(i) {

        if (!confirm(I18n.t("alertConfirmDelete"))) return Promise.resolve(false);

        return fetch("/api/ingatlanok/" + i.id, { method: "DELETE" })
            .then(r => {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            })
            .then(() => {

                DataManager.ingatlanok = DataManager.ingatlanok.filter(x => x.id !== i.id);

                if (UIManager.selectedIngatlan && UIManager.selectedIngatlan.id === i.id) {
                    UIManager.showNoSelection();
                }

                FilterManager.renderSources();
                FilterManager.apply();

                alert(I18n.t("alertDeleted"));

                return true;

            })
            .catch(err => {
                console.error(err);
                alert(I18n.t("alertSaveError"));
                return false;
            });

    }

    static init() {

        document.getElementById("btnFavoriteToggle").onclick = () => {
            if (!UIManager.requireSelection()) return;
            DataManager.toggleFavorite(UIManager.selectedIngatlan.id);
        };

        document.getElementById("btnOpenListing").onclick = () => {
            if (!UIManager.requireSelection()) return;
            ListingPage.open(UIManager.selectedIngatlan.id);
        };

        document.getElementById("btnValuateThis").onclick = () => {
            if (!UIManager.requireSelection()) return;
            PageManager.show("valuation");
            ValuationManager.prefill(UIManager.selectedIngatlan).then(() => ValuationManager.run());
        };

        document.getElementById("btnDelete").onclick = () => {
            if (!UIManager.requireSelection()) return;
            UIManager.deleteProperty(UIManager.selectedIngatlan);
        };

        document.getElementById("btnEdit").onclick = () => {
            if (!UIManager.requireSelection()) return;
            NewPropertyManager.startEdit(UIManager.selectedIngatlan);
        };

    }

}
