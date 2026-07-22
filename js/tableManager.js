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

        // Ha már létezik a grid, csak frissítjük
        if (this.grid) {

            this.grid.setGridOption("rowData", lista);

            return;

        }

        // Csak egyszer hozzuk létre
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
    static update(lista){

        if(this.grid){

            this.grid.setGridOption("rowData", lista);

        }

    }
    static remove(ingatlan){

    if(this.grid){

        this.grid.applyTransaction({

            remove:[ingatlan]

        });

    }

}
static selectById(id) {

    if (!this.grid) return;

    this.grid.forEachNode(node => {

        if (node.data.id === id) {

            node.setSelected(true);

            this.grid.ensureNodeVisible(node, "middle");

        }

    });

}

}