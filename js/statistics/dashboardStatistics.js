class DashboardStatistics {

    static render(lista) {

        const db = lista.length;

        if (db === 0) {

            return `
                <div class="alert alert-warning">
                    Nincs adat.
                </div>
            `;

        }

        const atlagAr =
            lista.reduce((s, i) => s + i.ar, 0) / db;

        const atlagNm =
            lista.reduce((s, i) => s + i.nm, 0) / db;

        const atlagArNm =
            lista.reduce((s, i) => s + i.arNm, 0) / db;

        const minArNm =
            Math.min(...lista.map(i => i.arNm));

        const maxArNm =
            Math.max(...lista.map(i => i.arNm));

        return `

            <div class="statisticsGrid">

                <div class="statCard">

                    <h3>🏠 Ingatlanok</h3>

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

                    <h3>🟢 Minimum €/m²</h3>

                    <h1>${Math.round(minArNm)}</h1>

                </div>

                <div class="statCard">

                    <h3>🔴 Maximum €/m²</h3>

                    <h1>${Math.round(maxArNm)}</h1>

                </div>

            </div>

        `;

    }

}