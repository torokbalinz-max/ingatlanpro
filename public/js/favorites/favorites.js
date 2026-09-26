class FavoritesManager {

    static grid = null;
    static lastData = [];

    static load() {

        fetch("/api/favorites")
            .then(r => r.json())
            .then(lista => {
                lista.forEach(i => { i.forras = Sources.fromLink(i.link); });
                FavoritesManager.render(lista);
            })
            .catch(err => console.error("Kedvencek betöltése sikertelen:", err));

    }

    static buildColumnDefs() {

        return [

            { field: "id", headerName: "#", width: 80 },

            {
                colId: "tipus",
                headerName: I18n.t("typeLabel"),
                width: 130,
                valueGetter: p => Types.label(p.data.tipus)
            },

            {
                field: "ar",
                headerName: I18n.t("colAr"),
                flex: 1.2,
                minWidth: 120,
                valueFormatter: p => Utils.price(p.data),
                cellStyle: { fontWeight: "700", fontVariantNumeric: "tabular-nums" }
            },

            {
                field: "nm",
                headerName: I18n.t("colNm"),
                width: 95,
                valueFormatter: p => Utils.num(p.value) + " m²"
            },

            {
                colId: "arNm",
                headerName: I18n.t("colArNm"),
                width: 110,
                valueGetter: p => Math.round(Utils.arNm(p.data)),
                valueFormatter: p => Utils.num(p.value)
            },

            { field: "szobak", headerName: I18n.t("colSzoba"), width: 80 },

            {
                colId: "varos",
                headerName: I18n.t("detailVaros"),
                minWidth: 130,
                flex: 1,
                valueGetter: p => CityManager.displayName(p.data.varos)
            },

            { colId: "kerulet", headerName: I18n.t("colKerulet"), minWidth: 120, flex: 1, valueGetter: p => CityManager.helyReszLabel(p.data) },

            {
                colId: "allapot",
                headerName: I18n.t("colAllapot"),
                minWidth: 120,
                flex: 1,
                valueGetter: p => Utils.allapotLabel(p.data.allapot)
            },

            {
                colId: "forras",
                headerName: I18n.t("colForras"),
                minWidth: 120,
                flex: 1,
                valueGetter: p => Sources.label(p.data.forras)
            },

            {
                colId: "remove",
                headerName: "",
                width: 70,
                sortable: false,
                filter: false,
                cellRenderer: () => `<button class="btn btn-sm btn-outline-danger favRemoveBtn" title="${I18n.t("favDeleteTitle")}"><i class="fa-solid fa-trash"></i></button>`,
                onCellClicked: params => {

                    if (!confirm(I18n.t("favDeleteConfirm"))) return;

                    fetch("/api/favorites/" + params.data.id, { method: "DELETE" })
                        .then(r => r.json())
                        .then(() => {

                            DataManager.favoriteIds.delete(params.data.id);

                            FavoritesManager.load();

                            if (TableManager.grid) {
                                TableManager.grid.refreshCells({ force: true });
                            }

                        });

                }
            }

        ];

    }

    static render(lista) {

        FavoritesManager.lastData = lista;

        const el = document.querySelector("#favoritesGrid");

        if (!el) return;

        if (FavoritesManager.grid) {
            FavoritesManager.grid.setGridOption("rowData", lista);
            return;
        }

        FavoritesManager.grid = agGrid.createGrid(el, {

            theme: TableManager.theme(),
            rowData: lista,
            columnDefs: FavoritesManager.buildColumnDefs(),
            animateRows: true,
            pagination: true,
            paginationPageSize: 25,
            paginationPageSizeSelector: [25, 50, 100],
            overlayNoRowsTemplate: `<span class="p-3">${I18n.t("favEmpty")}</span>`,

            defaultColDef: {
                sortable: true,
                filter: true,
                resizable: true
            },

            onCellClicked(event) {

                if (event.column.getColId() === "remove") return;

                ListingPage.open(event.data.id);

            }

        });

    }

    static refreshColumns() {
        if (FavoritesManager.grid) {
            FavoritesManager.grid.setGridOption("columnDefs", FavoritesManager.buildColumnDefs());
            FavoritesManager.grid.setGridOption("overlayNoRowsTemplate", `<span class="p-3">${I18n.t("favEmpty")}</span>`);
        }
    }

    static refreshTheme() {
        if (FavoritesManager.grid) {
            FavoritesManager.grid.setGridOption("theme", TableManager.theme());
        }
    }

}
