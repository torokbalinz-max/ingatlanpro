class AppController {

    static selectedIngatlan = null;

    static select(ingatlan){

        this.selectedIngatlan = ingatlan;

        MapManager.focus(ingatlan);

        UIManager.showDetails(ingatlan);

    }

}