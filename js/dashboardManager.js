class DashboardManager {

    static lastAvgArNm = null;

    static load(lista) {

        const ervenyes = Utils.valid(lista);

        document.getElementById("dbCount").innerText = Utils.num(lista.length);
        document.getElementById("dbSold").innerText = Utils.num(lista.filter(i => i.eladva).length);

        if (ervenyes.length === 0) {

            DashboardManager.lastAvgArNm = null;
            document.getElementById("dbPrice").innerText = "-";
            document.getElementById("dbNm").innerText = "-";
            return;

        }

        const atlagAr = Utils.avg(ervenyes.map(i => i.ar));
        const atlagArNm = Utils.avg(ervenyes.map(Utils.arNm));

        DashboardManager.lastAvgArNm = atlagArNm;

        document.getElementById("dbPrice").innerText = Utils.eur(atlagAr);
        document.getElementById("dbNm").innerText = Utils.eurNm(atlagArNm);

    }

}
