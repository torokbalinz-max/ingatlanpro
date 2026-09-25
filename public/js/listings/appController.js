class AppController {

    static selectedIngatlan = null;

    static select(ingatlan, opts = {}) {

        if (!ingatlan) return;

        AppController.selectedIngatlan = ingatlan;

        UIManager.showDetails(ingatlan);

        if (!opts.fromMap) {
            MapManager.focus(ingatlan);
        }

        TableManager.selectById(ingatlan.id);

    }

}
