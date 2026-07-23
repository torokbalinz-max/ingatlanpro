class AppController {

    static selectedIngatlan = null;

    static select(ingatlan) {

        this.selectedIngatlan = ingatlan;

        // Adatlap
        UIManager.showDetails(ingatlan);

        // Térkép csak akkor, ha van koordináta
        if (
            ingatlan &&
            !isNaN(Number(ingatlan.x)) &&
            !isNaN(Number(ingatlan.y))
        ) {

            MapManager.focus(ingatlan);

        }

        // Táblázat kijelölése
        if (TableManager.grid) {

            TableManager.selectById(ingatlan.id);

        }

    }

}