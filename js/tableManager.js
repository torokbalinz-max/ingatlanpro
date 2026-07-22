class TableManager {

    static grid = null;

    static load(lista) {

        const columnDefs = [

            {
                field: "id",
                headerName: "ID",
                width: 90
            },

            {
                field: "ar",
                headerName: "Ár (€)"
            },

            {
                field: "nm",
                headerName: "Nm"
            },

            {
                field: "arNm",
                headerName: "€/Nm"
            },

            {
                field: "szobak",
                headerName: "Szobák"
            },

            {
                field: "emelet",
                headerName: "Emelet"
            },

            {
                field: "allapot",
                headerName: "Állapot"
            }

        ];

        if (this.grid) {

            this.grid.setGridOption("rowData", lista);

            return;

        }

        this.grid = agGrid.createGrid(

            document.querySelector("#ingatlanGrid"),

            {

                rowData: lista,

                columnDefs,

                onRowClicked(event) {

                    AppController.select(event.data);

                },

                pagination: true,

                paginationPageSize: 25,

                animateRows: true,

                rowSelection: "single",

                defaultColDef: {

                    resizable: true,

                    sortable: true,

                    filter: true

                }

            }

        );

    }

    static update(lista) {

        if (this.grid) {

            this.grid.setGridOption("rowData", lista);

        }

    }

    static remove(ingatlan) {

        if (this.grid) {

            this.grid.applyTransaction({

                remove: [ingatlan]

            });

        }

    }

    static selectById(id) {

        if (!this.grid) return;

        let targetNode = null;
        let index = 0;

        this.grid.forEachNode(node => {

            if (node.data.id === id) {

                targetNode = node;

            }

            index++;

        });

        if (!targetNode) return;

        // Oldal kiszámítása
        const pageSize = this.grid.paginationGetPageSize();
        const page = Math.floor(targetNode.rowIndex / pageSize);

        // Átváltás a megfelelő oldalra
        this.grid.paginationGoToPage(page);

        // Kis késleltetés után kijelölés
        setTimeout(() => {

            targetNode.setSelected(true);

            this.grid.ensureNodeVisible(targetNode, "middle");

        }, 100);

    }

}