class FavoritesManager {

    static grid = null;
    static lastData = [];

    static load() {

        fetch("/api/favorites")

            .then(r => r.json())

            .then(lista => {

                FavoritesManager.render(lista);

            })

            .catch(err => {

                console.error("Kedvencek betöltése sikertelen:", err);

            });

    }

    static buildColumnDefs() {

        const euro = value =>
            Number(value).toLocaleString("hu-HU") + " €";

        return [

            {
                field: "id",
                headerName: "#",
                width: 80
            },

            {
                field: "ar",
                headerName: I18n.t("colAr"),
                flex: 1.2,
                valueFormatter: p => euro(p.value)
            },

            {
                field: "nm",
                headerName: I18n.t("colNm"),
                width: 100,
                valueFormatter: p => p.value + " m²"
            },

            {
                field: "arNm",
                headerName: I18n.t("colArNm"),
                width: 120,
                valueFormatter: p => Math.round(p.value)
            },

            {
                field: "szobak",
                headerName: I18n.t("colSzoba"),
                width: 90
            },

            {
                field: "varos",
                headerName: I18n.t("detailVaros"),
                width: 150
            },

            {
                field: "kerulet",
                headerName: I18n.t("colKerulet"),
                width: 150
            },

            {
                field: "allapot",
                headerName: I18n.t("colAllapot"),
                flex: 1
            },

            {
                headerName: "🗑️",
                width: 70,
                sortable: false,
                filter: false,
                cellStyle: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                },
                cellRenderer: () => `<button class="btn btn-sm btn-outline-danger favRemoveBtn" title="${I18n.t("favDeleteTitle")}">🗑️</button>`,
                onCellClicked: params => {

                    if (!confirm(I18n.t("favDeleteConfirm"))) return;

                    fetch("/api/favorites/" + params.data.id, {
                        method: "DELETE"
                    })
                    .then(r => r.json())
                    .then(() => {

                        DataManager.favoriteIds.delete(params.data.id);

                        FavoritesManager.load();

                        if (TableManager.grid) {
                            TableManager.grid.redrawRows();
                        }

                    });

                }
            }

        ];

    }

    static render(lista) {

        FavoritesManager.lastData = lista;

        const columnDefs = FavoritesManager.buildColumnDefs();

        const el = document.querySelector("#favoritesGrid");

        if (!el) return;

        if (this.grid) {

            this.grid.setGridOption("rowData", lista);
            this.grid.setGridOption("columnDefs", columnDefs);
            return;

        }

        this.grid = agGrid.createGrid(el, {

            rowData: lista,
            columnDefs,
            animateRows: true,
            pagination: true,
            paginationPageSize: 25,
            rowSelection: "single",
            rowHeight: 54,

            defaultColDef: {
                sortable: true,
                filter: true,
                resizable: true
            },

            onGridReady(params) {
                params.api.sizeColumnsToFit();
            },

            onGridSizeChanged(params) {
                params.api.sizeColumnsToFit();
            },

            onRowClicked(event) {

                if (event.colDef && event.colDef.headerName === "🗑️") return;

                PageManager.show("pageDashboard");

                setTimeout(() => {

                    if (MapManager.map) {
                        MapManager.map.invalidateSize(true);
                    }

                    AppController.select(event.data);

                }, 250);

            }

        });

    }

    static refreshColumns() {

        if (this.grid) {

            this.grid.setGridOption("columnDefs", FavoritesManager.buildColumnDefs());

        }

    }

}