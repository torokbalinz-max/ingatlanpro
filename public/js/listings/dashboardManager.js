class DashboardManager {

    static lastAvgArNm = null;

    static load(lista) {

        // Az átlagokba csak az ellenőrzött hirdetések számítanak
        const ervenyes = Utils.valid(lista).filter(Utils.verified);

        document.getElementById("dbCount").innerText = Utils.num(lista.length);
        document.getElementById("dbPhotos").innerText = Utils.num(lista.filter(Utils.hasPhoto).length);

        if (ervenyes.length === 0) {

            DashboardManager.lastAvgArNm = null;
            document.getElementById("dbPrice").innerText = "-";
            document.getElementById("dbNm").innerText = "-";
            return;

        }

        const atlagAr = Utils.avg(ervenyes.map(i => i.ar));
        const atlagArNm = Utils.avg(ervenyes.map(Utils.arNm));

        DashboardManager.lastAvgArNm = atlagArNm;

        document.getElementById("dbPrice").innerText = Utils.price({ ar: atlagAr, ugylet: FilterManager.ugylet });
        document.getElementById("dbNm").innerText = Utils.eurNm(atlagArNm);

    }

}
