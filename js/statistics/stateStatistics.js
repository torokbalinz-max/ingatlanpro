class StateStatistics {

    static render(lista) {

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

            <br><br>

            <h2>🔧 Állapot szerinti elemzés</h2>

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

        return html;

    }

}