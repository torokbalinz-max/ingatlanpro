class UIManager {

    static selectedIngatlan = null;

    static showDetails(i) {

        UIManager.selectedIngatlan = i;

        document.getElementById("detailIdLabel").innerText = I18n.t("popupProperty").replace("#", "").trim();
        document.getElementById("detailId").innerText = "#" + i.id;

        document.getElementById("detailAr").innerText = Utils.eur(i.ar);
        document.getElementById("detailArNm").innerText = Utils.eurNm(Utils.arNm(i));
        document.getElementById("detailNm").innerText = Utils.num(i.nm) + " m²";
        document.getElementById("detailSzoba").innerText = i.szobak ?? "-";
        document.getElementById("detailEmelet").innerText = i.emelet || "-";
        document.getElementById("detailAllapot").innerText = Utils.allapotLabel(i.allapot);
        document.getElementById("detailHely").innerText =
            [CityManager.displayName(i.varos), i.kerulet].filter(Boolean).join(" · ") || "-";

        const src = document.getElementById("detailSource");
        src.outerHTML = Sources.badge(i.forras).replace("<span ", '<span id="detailSource" ');

        const link = document.getElementById("detailLink");
        const hasLink = i.link && i.forras !== "local" && i.forras !== "other";
        link.href = hasLink ? i.link : "#";
        link.classList.toggle("disabled", !hasLink);

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

        const link = document.getElementById("detailLink");
        link.href = "#";
        link.classList.add("disabled");

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

    static init() {

        // Kedvenc gomb
        document.getElementById("btnFavoriteToggle").onclick = () => {
            if (!UIManager.requireSelection()) return;
            DataManager.toggleFavorite(UIManager.selectedIngatlan.id);
        };

        // Értékbecslés erre az ingatlanra
        document.getElementById("btnValuateThis").onclick = () => {
            if (!UIManager.requireSelection()) return;
            PageManager.show("valuation");
            ValuationManager.prefill(UIManager.selectedIngatlan).then(() => ValuationManager.run());
        };

        // Törlés
        document.getElementById("btnDelete").onclick = () => {

            if (!UIManager.requireSelection()) return;

            if (!confirm(I18n.t("alertConfirmDelete"))) return;

            const torolt = UIManager.selectedIngatlan;

            fetch("/api/ingatlanok/" + torolt.id, { method: "DELETE" })
                .then(r => r.json())
                .then(() => {

                    DataManager.ingatlanok = DataManager.ingatlanok.filter(x => x.id !== torolt.id);

                    UIManager.showNoSelection();

                    FilterManager.renderSources();
                    FilterManager.apply();

                    alert(I18n.t("alertDeleted"));

                })
                .catch(err => {
                    console.error(err);
                    alert(I18n.t("alertSaveError"));
                });

        };

        // Szerkesztés
        document.getElementById("btnEdit").onclick = () => {

            if (!UIManager.requireSelection()) return;

            NewPropertyManager.startEdit(UIManager.selectedIngatlan);

        };

    }

}
