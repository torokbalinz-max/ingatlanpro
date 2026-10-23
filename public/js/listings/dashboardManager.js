class DashboardManager {

    static lastAvgArNm = null;

    static load(lista) {

        // Az átlagokba csak az ellenőrzött hirdetések számítanak
        const ervenyes = Utils.valid(lista).filter(Utils.verified);

        Utils.szam(document.getElementById("dbCount"), Utils.num(lista.length));
        // A 4. kártya: fényképes hirdetések száma – ha egy sincs, inkább az elmúlt 7 nap új hirdetései
        // („Fényképes: 0” rosszul mutatna a látogatónak)
        const fotos = lista.filter(Utils.hasPhoto).length;
        const hetNap = Date.now() - 7 * 86400000;
        const uj = lista.filter(i => i.created_at && new Date(i.created_at).getTime() >= hetNap).length;
        const kartya = document.getElementById("dbPhotos");
        const cimke = kartya.parentElement.querySelector("small");
        const ikon = kartya.closest(".kpiCard").querySelector(".kpiIcon i");
        const mutatFoto = fotos > 0;
        cimke.setAttribute("data-i18n", mutatFoto ? "dbFotos" : "dbNewWeek");
        cimke.innerText = I18n.t(mutatFoto ? "dbFotos" : "dbNewWeek");
        ikon.className = mutatFoto ? "fa-solid fa-camera" : "fa-solid fa-bolt";
        Utils.szam(kartya, Utils.num(mutatFoto ? fotos : uj));

        if (ervenyes.length === 0) {

            DashboardManager.lastAvgArNm = null;
            document.getElementById("dbPrice").innerText = "-";
            document.getElementById("dbNm").innerText = "-";
            return;

        }

        const atlagAr = Utils.avg(ervenyes.map(i => i.ar));
        const atlagArNm = Utils.avg(ervenyes.map(Utils.arNm));

        DashboardManager.lastAvgArNm = atlagArNm;

        Utils.szam(document.getElementById("dbPrice"), Utils.price({ ar: atlagAr, ugylet: FilterManager.ugylet }));
        Utils.szam(document.getElementById("dbNm"), Utils.eurNm(atlagArNm));

    }

}
