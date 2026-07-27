class TableManager {

    static grid = null;
    static lastData = [];

    static buildColumnDefs() {

        const euro = value =>
            Number(value).toLocaleString("hu-HU") + " €";

        return [

            {
                headerName: "⭐",
                width: 60,
                sortable: false,
                filter: false,
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
                cellStyle: {
                    fontWeight: "700",
                    color: "#3b82f6"
                }
            },

            {
                field: "ar",
                headerName: I18n.t("colAr"),
                flex: 1.3,
                valueFormatter: p => euro(p.value),
                cellStyle: {
                    fontWeight: "700",
                    color: "#16a34a",
                    fontSize: "15px"
                }
            },

            {
                field: "nm",
                headerName: I18n.t("colNm"),
                width: 110,
                valueFormatter: p => p.value + " m²",
                cellStyle: {
                    fontWeight: "600"
                }
            },

            {
                field: "arNm",
                headerName: I18n.t("colArNm"),
                width: 130,
                valueFormatter: p => Math.round(p.value),
                cellStyle: params => {

                    let color = "#2563eb";

                    if(params.value > 3500) color = "#dc2626";

                    if(params.value < 2200) color = "#16a34a";

                    return {

                        fontWeight:"700",

                        color:color

                    };

                }

            },

            {
                field:"szobak",
                headerName: I18n.t("colSzoba"),
                width:100
            },

            {
                field:"emelet",
                headerName: I18n.t("colEmelet"),
                width:120
            },

            {
                field:"kerulet",
                headerName: I18n.t("colKerulet"),
                width:150
            },

            {
                field:"allapot",
                headerName: I18n.t("colAllapot"),
                flex:1
            }

        ];

    }

    static load(lista) {

        TableManager.lastData = lista;

        const columnDefs = TableManager.buildColumnDefs();

        if(this.grid){

            this.grid.setGridOption("rowData",lista);
            this.grid.setGridOption("columnDefs",columnDefs);

            return;

        }

        this.grid = agGrid.createGrid(

            document.querySelector("#ingatlanGrid"),

            {

                rowData:lista,

                columnDefs,

                animateRows:true,

                pagination:true,

                paginationPageSize:25,

                paginationPageSizeSelector:[25,50,100,250],

                rowSelection:"single",

                suppressRowClickSelection:false,

                defaultColDef:{

                    sortable:true,

                    filter:true,

                    resizable:true

                },

                onGridReady(params){

                    params.api.sizeColumnsToFit();

                },

                onGridSizeChanged(params){

                    params.api.sizeColumnsToFit();

                },

                onRowClicked(event){

                    if (event.colDef && event.colDef.headerName === "⭐") return;

                    AppController.select(event.data);

                }

            }

        );

    }

    static update(lista){

        TableManager.lastData = lista;

        if(this.grid){

            this.grid.setGridOption("rowData",lista);

        }

    }

    static refreshColumns(){

        if(this.grid){

            this.grid.setGridOption("columnDefs", TableManager.buildColumnDefs());

        }

    }

    static remove(ingatlan){

        if(this.grid){

            this.grid.applyTransaction({

                remove:[ingatlan]

            });

        }

    }

    static selectById(id){

        if(!this.grid) return;

        let targetNode=null;

        this.grid.forEachNode(node=>{

            if(node.data.id===id){

                targetNode=node;

            }

        });

        if(!targetNode) return;

        const pageSize=this.grid.paginationGetPageSize();

        const page=Math.floor(targetNode.rowIndex/pageSize);

        this.grid.paginationGoToPage(page);

        setTimeout(()=>{

            targetNode.setSelected(true);

            this.grid.ensureNodeVisible(targetNode,"middle");

        },120);

    }

}