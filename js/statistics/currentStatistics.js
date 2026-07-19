class CurrentStatistics {

    static load() {

        const lista = DataManager.szurtIngatlanok;

        if(lista.length === 0){

            document.getElementById("statisticsContainer").innerHTML = `

                <h2>📈 Jelenlegi piac</h2>

                <p>Nincs találat a jelenlegi szűrésre.</p>

            `;

            return;

        }

        const db = lista.length;

        const atlagAr =
            lista.reduce((s,i)=>s+i.ar,0)/db;

        const atlagNm =
            lista.reduce((s,i)=>s+i.nm,0)/db;

        const atlagArNm =
            lista.reduce((s,i)=>s+i.arNm,0)/db;

        const minArNm =
            Math.min(...lista.map(i=>i.arNm));

        const maxArNm =
            Math.max(...lista.map(i=>i.arNm));

        document.getElementById("statisticsContainer").innerHTML = `

            <div class="statisticsGrid">

                <div class="statCard">
                    <h3>🏠 Ingatlan</h3>
                    <h1>${db}</h1>
                </div>

                <div class="statCard">
                    <h3>💶 Átlag ár</h3>
                    <h1>${Math.round(atlagAr).toLocaleString()} €</h1>
                </div>

                <div class="statCard">
                    <h3>📐 Átlag m²</h3>
                    <h1>${atlagNm.toFixed(1)}</h1>
                </div>

                <div class="statCard">
                    <h3>💰 Átlag €/m²</h3>
                    <h1>${Math.round(atlagArNm)}</h1>
                </div>

                <div class="statCard">
                    <h3>🟢 Legolcsóbb €/m²</h3>
                    <h1>${Math.round(minArNm)}</h1>
                </div>

                <div class="statCard">
                    <h3>🔴 Legdrágább €/m²</h3>
                    <h1>${Math.round(maxArNm)}</h1>
                </div>

            </div>

        `;

    }

}