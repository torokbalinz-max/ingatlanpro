class FavoritesManager {

    static grid = null;

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

    static render(lista) {

        const euro = value =>
            Number(value).toLocaleString("hu-HU") + " €";

        const columnDefs = [

            {
                field: "id",
                headerName: "#",
                width: 80
            },

            {
                field: "ar",
                headerName: "💶 Ár",
                flex: 1.2,
                valueFormatter: p => euro(p.value)
            },

            {
                field: "nm",
                headerName: "📐 m²",
                width: 100,
                valueFormatter: p => p.value + " m²"
            },

            {
                field: "arNm",
                headerName: "💰 €/m²",
                width: 120,
                valueFormatter: p => Math.round(p.value)
            },

            {
                field: "szobak",
                headerName: "🛏",
                width: 90
            },

            {
                field: "varos",
                headerName: "🏙 Város",
                width: 150
            },

            {
                field: "kerulet",
                headerName: "📍 Kerület",
                width: 150
            },

            {
                field: "allapot",
                headerName: "🔧 Állapot",
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
                cellRenderer: () => `<button class="btn btn-sm btn-outline-danger favRemoveBtn" title="Törlés a kedvencek közül">🗑️</button>`,
                onCellClicked: params => {

                    if (!confirm("Törlöd a kedvencek közül?")) return;

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

        const el = document.querySelector("#favoritesGrid");

        if (!el) return;

        if (this.grid) {

            this.grid.setGridOption("rowData", lista);
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

}