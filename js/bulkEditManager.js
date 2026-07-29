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

    }

    static loadKeruletOptions(selectNev) {

        const select = document.getElementById("bulkKerulet");

        if (!select) return Promise.resolve();

        return fetch("/api/keruletek?varos=" + encodeURIComponent(DataManager.currentCity))
            .then(r => r.json())
            .then(lista => {

                select.innerHTML = `<option value="">${I18n.t("bulkKeruletChoose")}</option>`;

                lista.forEach(k => {

                    const opt = document.createElement("option");

                    opt.value = k.nev;
                    opt.innerText = k.nev;

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

        if (BulkEditManager.selectedRows.length > 0) {

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