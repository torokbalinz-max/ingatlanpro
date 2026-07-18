class ScoreManager {

    static calculate(i){

        let pont = 0;

        // Ár/nm

        if(i.arNm < 1500) pont += 40;
        else if(i.arNm < 1800) pont += 25;
        else if(i.arNm < 2200) pont += 10;

        // Állapot

        switch((i.allapot || "").toLowerCase()){

            case "újszerű":
                pont += 20;
                break;

            case "jó":
                pont += 15;
                break;

            case "felújítandó":
                pont += 5;
                break;
        }

        // Szobák

        if(i.szobak >= 5) pont += 20;
        else if(i.szobak == 4) pont += 15;
        else if(i.szobak == 3) pont += 10;
        else if(i.szobak == 2) pont += 5;

        // Nm

        if(i.nm >= 100) pont += 20;
        else if(i.nm >= 80) pont += 15;
        else if(i.nm >= 60) pont += 10;

        return Math.min(100,pont);

    }

}