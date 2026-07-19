class CurrentStatistics {

    static load() {

        const lista = DataManager.szurtIngatlanok;

        if (lista.length === 0) {

            document.getElementById("statisticsContainer").innerHTML = `
                <h2>📈 Jelenlegi piac</h2>
                <p>Nincs találat a jelenlegi szűrésre.</p>
            `;

            return;
        }

        const db = lista.length;

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

        // ===== Állapot szerinti statisztika =====

        const allapotok = {};

        lista.forEach(i => {

            const nev = i.allapot || "Ismeretlen";

            if (!allapotok[nev]) {

                allapotok[nev] = {
                    db: 0,
                    ar: 0,
                    arNm: 0
                };

            }

            allapotok[nev].db++;
            allapotok[nev].ar += i.ar;
            allapotok[nev].arNm += i.arNm;

        });

        let html = `

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

            <br><br>

            <h2>Állapot szerinti elemzés</h2>

            <table class="statTable">

                <tr>
                    <th>Állapot</th>
                    <th>Darab</th>
                    <th>Átlag ár</th>
                    <th>Átlag €/m²</th>
                </tr>

        `;

        Object.keys(allapotok).forEach(a => {

            const x = allapotok[a];

            html += `

                <tr>

                    <td>${a}</td>

                    <td>${x.db}</td>

                    <td>${Math.round(x.ar / x.db).toLocaleString()} €</td>

                    <td>${Math.round(x.arNm / x.db)} €/m²</td>

                </tr>

            `;

        });

        html += "</table>";
        // ===== Szobaszám szerinti elemzés =====

const szobak = {};

lista.forEach(i => {

    let kulcs;

    if (i.szobak >= 4)
        kulcs = "4+ szoba";
    else
        kulcs = i.szobak + " szoba";

    if (!szobak[kulcs]) {

        szobak[kulcs] = {
            db: 0,
            arNm: 0
        };

    }

    szobak[kulcs].db++;
    szobak[kulcs].arNm += i.arNm;

});

html += `

    <br><br>

    <h2>Szobaszám szerinti elemzés</h2>

    <table class="statTable">

        <tr>

            <th>Szobák</th>

            <th>Darab</th>

            <th>Átlag €/m²</th>

        </tr>

`;

Object.keys(szobak).forEach(k => {

    const s = szobak[k];

    html += `

        <tr>

            <td>${k}</td>

            <td>${s.db}</td>

            <td>${Math.round(s.arNm / s.db)} €/m²</td>

        </tr>

    `;

});

html += "</table>";

        document.getElementById("statisticsContainer").innerHTML = html;

    }

}