class UIManager {

    static selectedIngatlan = null;

    static showDetails(ingatlan) {

        UIManager.selectedIngatlan = ingatlan;

        document.getElementById("detailId").innerText = ingatlan.id;
        document.getElementById("detailAr").innerText = ingatlan.ar.toLocaleString() + " €";
        document.getElementById("detailNm").innerText = ingatlan.nm + " nm";
        document.getElementById("detailSzoba").innerText = ingatlan.szobak;
        document.getElementById("detailEmelet").innerText = ingatlan.emelet;
        document.getElementById("detailAllapot").innerText = ingatlan.allapot;
        document.getElementById("detailLink").href = ingatlan.link;

        const varosEl = document.getElementById("detailVaros");
        const keruletEl = document.getElementById("detailKerulet");

        if (varosEl) varosEl.innerText = ingatlan.varos || "-";
        if (keruletEl) keruletEl.innerText = ingatlan.kerulet || "-";

        UIManager.updateFavoriteButton(ingatlan.id);

    }

    static showNoSelection() {

        UIManager.selectedIngatlan = null;

        const detailId = document.getElementById("detailId");

        if (detailId) detailId.innerText = I18n.t("detailNincsKivalasztva");

        const btn = document.getElementById("btnFavoriteToggle");

        if (btn) btn.innerHTML = I18n.t("favAdd");

    }

    static updateFavoriteButton(id) {

        const btn = document.getElementById("btnFavoriteToggle");

        if (!btn) return;

        const isFav = DataManager.isFavorite(id);

        btn.innerHTML = isFav ? I18n.t("favRemove") : I18n.t("favAdd");
        btn.classList.toggle("btn-warning", isFav);
        btn.classList.toggle("btn-outline-warning", !isFav);

    }

    static setActiveMenu(id){

        document.querySelectorAll(".sidebarBtn").forEach(btn=>{

            btn.classList.remove("active");

        });

        document.getElementById(id).classList.add("active");

    }

    static initMenu() {


        // Ingatlanok

        document.getElementById("menuIngatlanok").onclick = () => {

            UIManager.setActiveMenu("menuIngatlanok");

            PageManager.show("pageDashboard");

        };

        // Statisztikák

        document.getElementById("menuStatisztika").onclick = () => {

            UIManager.setActiveMenu("menuStatisztika");

            PageManager.show("pageStatistics");

            StatisticsManager.loadCurrent();

            setTimeout(() => {

                document.getElementById("pageStatistics").scrollIntoView({

                    behavior:"smooth",

                    block:"start"

                });

            },100);

        };

        // Kedvencek

        const menuKedvencek = document.getElementById("menuKedvencek");

        if (menuKedvencek) {

            menuKedvencek.onclick = () => {

                UIManager.setActiveMenu("menuKedvencek");

                PageManager.show("pageFavorites");

                FavoritesManager.load();

            };

        }

        // Kedvenc gomb az adatlapon

        const btnFavoriteToggle = document.getElementById("btnFavoriteToggle");

        if (btnFavoriteToggle) {

            btnFavoriteToggle.onclick = () => {

                if (!UIManager.selectedIngatlan) {

                    alert(I18n.t("alertNincsKivalasztva"));
                    return;

                }

                DataManager.toggleFavorite(UIManager.selectedIngatlan.id)
                    .then(() => {

                        UIManager.updateFavoriteButton(UIManager.selectedIngatlan.id);

                    });

            };

        }

        // Új ingatlan

      document.getElementById("menuUj").onclick = () => {

    // Ha új ingatlant veszünk fel, ne szerkesztés legyen
    NewPropertyManager.editId = null;

    // Űrlap törlése
    NewPropertyManager.clearForm();

    UIManager.setActiveMenu("menuUj");

    PageManager.show("pageNew");

    setTimeout(() => {

        NewPropertyMap.refresh();

    }, 200);

};

        // ===== Törlés =====

        document.getElementById("btnDelete").onclick = () => {

            if (!UIManager.selectedIngatlan) {

                alert(I18n.t("alertNincsKivalasztva"));

                return;

            }

            if (!confirm(I18n.t("alertConfirmDelete"))) {

                return;

            }

            fetch("/api/ingatlanok/" + UIManager.selectedIngatlan.id, {

                method:"DELETE"

            })

            .then(r=>r.json())

            .then(()=>{

                alert(I18n.t("alertDeleted"));

                DataManager.ingatlanok =
                    DataManager.ingatlanok.filter(x=>x.id!==UIManager.selectedIngatlan.id);

                DataManager.szurtIngatlanok =
                    DataManager.szurtIngatlanok.filter(x=>x.id!==UIManager.selectedIngatlan.id);

                TableManager.remove(UIManager.selectedIngatlan);

                DashboardManager.load(DataManager.szurtIngatlanok);

                MapManager.load(DataManager.szurtIngatlanok);

                UIManager.showNoSelection();

            });

        };

        // ===== Szerkesztés =====

        document.getElementById("btnEdit").onclick = () => {

            if (!UIManager.selectedIngatlan) {

                alert(I18n.t("alertNincsKivalasztva"));

                return;

            }

            const i = UIManager.selectedIngatlan;

            document.getElementById("ujLink").value=i.link;
            document.getElementById("ujAr").value=i.ar;
            document.getElementById("ujNm").value=i.nm;
            document.getElementById("ujSzobak").value=i.szobak;

            const emelet=String(i.emelet||"").split("/");

            document.getElementById("ujEmelet").value=emelet[0]||"";
            document.getElementById("ujOsszEmelet").value=emelet[1]||"";

            document.getElementById("ujAllapot").value=i.allapot;
            document.getElementById("ujX").value=i.x;
            document.getElementById("ujY").value=i.y;

            const ujVaros = document.getElementById("ujVaros");

            if (ujVaros) {

                ujVaros.value = i.varos || DataManager.currentCity;

                CityManager.loadKeruletek(ujVaros.value, i.kerulet || "");

            }

            NewPropertyManager.editId=i.id;

            UIManager.setActiveMenu("menuUj");

            PageManager.show("pageNew");

            setTimeout(()=>{

                NewPropertyMap.refresh();

            },300);

        };

    }

}