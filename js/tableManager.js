class TableManager {

    static grid = null;

    static load(lista) {

        const euro = value =>
            Number(value).toLocaleString("hu-HU") + " €";

        const columnDefs = [

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
                headerName: "💶 Ár",
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
                headerName: "📐 m²",
                width: 110,
                valueFormatter: p => p.value + " m²",
                cellStyle: {
                    fontWeight: "600"
                }
            },

            {
                field: "arNm",
                headerName: "💰 €/m²",
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
                headerName:"🛏",
                width:100
            },

            {
                field:"emelet",
                headerName:"🏢",
                width:120
            },

            {
                field:"allapot",
                headerName:"🔧 Állapot",
                flex:1
            }

        ];

        if(this.grid){

            this.grid.setGridOption("rowData",lista);

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

                    AppController.select(event.data);

                }

            }

        );

    }

    static update(lista){

        if(this.grid){

            this.grid.setGridOption("rowData",lista);

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