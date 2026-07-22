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

           TableManager.selectById(ingatlan.id);

        }

    }

}