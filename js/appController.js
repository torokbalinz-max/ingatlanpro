class AppController {

    static selectedIngatlan = null;

    static select(ingatlan) {

        this.selectedIngatlan = ingatlan;

        // Térkép
        MapManager.focus(ingatlan);

        // Jobb oldali adatlap
        UIManager.showDetails(ingatlan);

        // Táblázat kijelölése
        if (TableManager.grid) {

            TableManager.grid.forEachNode(node => {

                if (node.data.id === ingatlan.id) {

                    node.setSelected(true);

                    TableManager.grid.ensureNodeVisible(node, "middle");

                }

            });

        }

    }

}