class BulkEditManager {

    static selectedRows = [];

    static init() {

        const btnApply = document.getElementById("btnBulkApply");
        const btnCancel = document.getElementById("btnBulkCancel");
        const btnAddKerulet = document.getElementById("btnBulkAddKerulet");

        if (btnApply) {

            btnApply.onclick = () => {

                BulkEditManager.apply();

            };

        }

        if (btnCancel) {

            btnCancel.onclick = () => {

                if (TableManager.grid) {
                    TableManager.grid.deselectAll();
                }

                BulkEditManager.updateBar([]);

            };

        }

        if (btnAddKerulet) {

            btnAddKerulet.onclick = () => {

                const varos = DataManager.currentCity;

                const nev = prompt(I18n.t("alertNewDistrictPrompt"));

                if (!nev || !nev.trim()) return;

                fetch("/api/keruletek", {

                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ varos: varos, nev: nev.trim() })

                })
                .then(r => r.json())
                .then(() => BulkEditManager.loadKeruletOptions(nev.trim()))
                .catch(err => {

                    console.error(err);
                    alert(I18n.t("alertNewDistrictError"));

                });

            };

        }

        BulkEditManager.loadKeruletOptions();

        // Állapot tömegesen (pl. egy fotók alapján átnézett csoportra)
        BulkEditManager.renderAllapotOptions();

        const btnAllapot = document.getElementById("btnBulkAllapot");
        if (btnAllapot) btnAllapot.onclick = () => BulkEditManager.applyAllapot();

    }

    static renderAllapotOptions() {
        const sel = document.getElementById("bulkAllapot");
        if (!sel) return;
        const keep = sel.value;
        sel.innerHTML = Utils.allapotOptions(keep, "bulkAllapotChoose");
        sel.setAttribute("aria-label", I18n.t("allapot"));
    }

    static applyAllapot() {

        const allapot = document.getElementById("bulkAllapot").value;

        if (!allapot) {
            alert(I18n.t("bulkAlertNoAllapot"));
            return;
        }

        if (!BulkEditManager.selectedRows.length) return;

        const ids = BulkEditManager.selectedRows.map(r => r.id);

        if (!confirm(I18n.f("bulkAllapotConfirm", { n: ids.length, a: Utils.allapotLabel(allapot) }))) return;

        fetch("/api/admin/allapot", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids, allapot })
        })
            .then(r => r.json())
            .then(v => {
                if (!v.siker) throw new Error("bulk allapot failed");
                const idSet = new Set(ids);
                DataManager.ingatlanok.forEach(i => { if (idSet.has(i.id)) i.allapot = allapot; });
                FilterManager.apply();
                if (TableManager.grid) TableManager.grid.deselectAll();
                BulkEditManager.updateBar([]);
                AdminManager.refreshPendingCount();
            })
            .catch(err => {
                console.error(err);
                alert(I18n.t("bulkAlertError"));
            });

    }

    static loadKeruletOptions(selectNev) {

        const select = document.getElementById("bulkKerulet");

        if (!select) return Promise.resolve();

        return fetch("/api/keruletek?varos=" + encodeURIComponent(DataManager.currentCity))
            .then(r => r.json())
            .then(lista => {

                select.innerHTML = `<option value="">${I18n.t("bulkKeruletChoose")}</option>`;

                (Array.isArray(lista) ? lista : []).forEach(k => {

                    const opt = document.createElement("option");

                    opt.value = k.nev;
                    opt.innerText = CityManager.keruletLabelOf(k);

                    select.appendChild(opt);

                });

                if (selectNev) {
                    select.value = selectNev;
                }

            })
            .catch(err => console.error("Kerületek betöltése sikertelen:", err));

    }

    static updateBar(selectedRows) {

        BulkEditManager.selectedRows = selectedRows || [];

        const bar = document.getElementById("bulkEditBar");
        const countEl = document.getElementById("bulkEditCount");

        if (!bar) return;

        if (BulkEditManager.selectedRows.length > 0 && AuthManager.isAdmin()) {

            bar.style.display = "flex";

            if (countEl) countEl.innerText = BulkEditManager.selectedRows.length;

        } else {

            bar.style.display = "none";

        }

    }

    static apply() {

        const select = document.getElementById("bulkKerulet");

        const kerulet = select ? select.value : "";

        if (!kerulet) {

            alert(I18n.t("bulkAlertNoKerulet"));
            return;

        }

        if (BulkEditManager.selectedRows.length === 0) return;

        if (!confirm(I18n.t("bulkAlertConfirm"))) return;

        const ids = BulkEditManager.selectedRows.map(r => r.id);

        fetch("/api/ingatlanok/bulk-kerulet", {

            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids, kerulet })

        })
        .then(r => r.json())
        .then(valasz => {

            if (!valasz.siker) {
                throw new Error("bulk update failed");
            }

            const idSet = new Set(ids);

            DataManager.ingatlanok.forEach(i => {
                if (idSet.has(i.id)) i.kerulet = kerulet;
            });

            DataManager.szurtIngatlanok.forEach(i => {
                if (idSet.has(i.id)) i.kerulet = kerulet;
            });

            TableManager.update(DataManager.szurtIngatlanok);

            if (TableManager.grid) {
                TableManager.grid.deselectAll();
            }

            BulkEditManager.updateBar([]);

            alert(I18n.t("bulkAlertSuccess"));

        })
        .catch(err => {

            console.error(err);
            alert(I18n.t("bulkAlertError"));

        });

    }

}