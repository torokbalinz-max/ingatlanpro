class TableManager {

    static grid = null;
    static lastData = [];

    // ag-Grid téma a világos / sötét módhoz
    static theme() {

        const dark = document.documentElement.getAttribute("data-bs-theme") === "dark";

        let t = agGrid.themeQuartz.withParams({
            fontFamily: "inherit",
            fontSize: 14,
            headerFontWeight: 700,
            borderRadius: 10,
            wrapperBorderRadius: 12,
            accentColor: "#2563eb"
        });

        if (dark) {
            t = t.withPart(agGrid.colorSchemeDarkBlue).withParams({
                backgroundColor: "#111827",
                headerBackgroundColor: "#1f2937",
                accentColor: "#60a5fa"
            });
        }

        return t;

    }

    static buildColumnDefs() {

        return [

            {
                headerName: "⭐",
                colId: "fav",
                width: 56,
                sortable: false,
                filter: false,
                resizable: false,
                cellClass: "favCell",
                cellRenderer: params =>
                    DataManager.isFavorite(params.data.id) ? "⭐" : "☆",
                onCellClicked: params => {
                    DataManager.toggleFavorite(params.data.id);
                }
            },

            {
                field: "id",
                headerName: "#",
                width: 80,
                cellStyle: { fontWeight: "700", color: "#3b82f6" }
            },

            {
                field: "ar",
                headerName: I18n.t("colAr"),
                minWidth: 115,
                flex: 1,
                valueFormatter: p => Utils.eur(p.value),
                cellStyle: { fontWeight: "700", color: "#16a34a" }
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
                valueFormatter: p => Utils.num(p.value),
                cellStyle: params => {

                    const atlag = DashboardManager.lastAvgArNm;
                    let color = "inherit";

                    if (atlag && params.value > 0) {
                        if (params.value < atlag * 0.9) color = "#16a34a";
                        else if (params.value > atlag * 1.1) color = "#dc2626";
                    }

                    return { fontWeight: "700", color };

                }
            },

            {
                field: "szobak",
                headerName: I18n.t("colSzoba"),
                width: 95
            },

            {
                field: "emelet",
                headerName: I18n.t("colEmelet"),
                width: 100
            },

            {
                field: "kerulet",
                headerName: I18n.t("colKerulet"),
                minWidth: 110,
                flex: 1
            },

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
            }

        ];

    }

    static load(lista) {

        TableManager.lastData = lista;

        if (TableManager.grid) {
            TableManager.grid.setGridOption("rowData", lista);
            return;
        }

        TableManager.grid = agGrid.createGrid(

            document.querySelector("#ingatlanGrid"),

            {
                theme: TableManager.theme(),
                rowData: lista,
                columnDefs: TableManager.buildColumnDefs(),
                getRowId: p => String(p.data.id),
                animateRows: true,
                pagination: true,
                paginationPageSize: 25,
                paginationPageSizeSelector: [25, 50, 100, 250],
                rowSelection: {
                    mode: "multiRow",
                    checkboxes: true,
                    headerCheckbox: true,
                    enableClickSelection: false
                },
                selectionColumnDef: { width: 48, pinned: "left" },

                defaultColDef: {
                    sortable: true,
                    filter: true,
                    resizable: true
                },

                onSelectionChanged(params) {
                    if (typeof BulkEditManager !== "undefined") {
                        BulkEditManager.updateBar(params.api.getSelectedRows());
                    }
                },

                onCellClicked(event) {

                    // A kedvenc csillag és a kijelölő jelölőnégyzet nem nyitja az adatlapot
                    const colId = event.column.getColId();
                    if (colId === "fav" || colId.startsWith("ag-Grid-Selection")) return;

                    AppController.select(event.data);

                }
            }

        );

    }

    static update(lista) {
        TableManager.load(lista);
    }

    static refreshColumns() {
        if (TableManager.grid) {
            TableManager.grid.setGridOption("columnDefs", TableManager.buildColumnDefs());
        }
    }

    static refreshTheme() {
        if (TableManager.grid) {
            TableManager.grid.setGridOption("theme", TableManager.theme());
        }
    }

    static remove(ingatlan) {
        if (TableManager.grid) {
            TableManager.grid.applyTransaction({ remove: [ingatlan] });
        }
    }

    static selectById(id) {

        const grid = TableManager.grid;

        if (!grid) return;

        const node = grid.getRowNode(String(id));

        if (!node || node.rowIndex === null) return;

        const pageSize = grid.paginationGetPageSize();
        grid.paginationGoToPage(Math.floor(node.rowIndex / pageSize));

        setTimeout(() => {
            grid.ensureNodeVisible(node, "middle");
            grid.flashCells({ rowNodes: [node] });
        }, 120);

    }

}
