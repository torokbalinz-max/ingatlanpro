class DashboardManager {

    static load(lista){

        document.getElementById("dbCount").innerHTML = lista.length;

        if(lista.length === 0){

            document.getElementById("dbPrice").innerHTML = "-";
            document.getElementById("dbNm").innerHTML = "-";
            document.getElementById("dbSold").innerHTML = "0";

            return;
        }

        // Átlag ár
        const atlagAr =
            lista.reduce((sum,i)=>sum+i.ar,0) / lista.length;

        // Átlag €/nm
        const atlagNm =
            lista.reduce((sum,i)=>sum+i.arNm,0) / lista.length;

        // Eladottak
        const eladott =
            lista.filter(i=>i.eladva).length;

        document.getElementById("dbPrice").innerHTML =
            Math.round(atlagAr).toLocaleString()+" €";

        document.getElementById("dbNm").innerHTML =
            Math.round(atlagNm).toLocaleString()+" €/nm";

        document.getElementById("dbSold").innerHTML =
            eladott;

    }

}