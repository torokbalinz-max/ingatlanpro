class FloorStatistics {

    static render(lista) {

        const emeletek = {};

        lista.forEach(i => {

            let kulcs;

            const e = parseInt(i.emelet);

            if (isNaN(e))
                kulcs = "Ismeretlen";
            else if (e <= 0)
                kulcs = "Földszint";
            else if (e >= 4)
                kulcs = "4+ emelet";
            else
                kulcs = e + ". emelet";

            if (!emeletek[kulcs]) {

                emeletek[kulcs] = {

                    db: 0,
                    ar: 0,
                    arNm: 0

                };

            }

            emeletek[kulcs].db++;
            emeletek[kulcs].ar += i.ar;
            emeletek[kulcs].arNm += i.arNm;

        });

        let html = `

            <br><br>

            <h2>🏢 Emelet szerinti elemzés</h2>

            <table class="statTable">

                <tr>

                    <th>Emelet</th>
                    <th>Darab</th>
                    <th>Átlag ár</th>
                    <th>Átlag €/m²</th>

                </tr>

        `;

        Object.keys(emeletek).forEach(k => {

            const e = emeletek[k];

            html += `

                <tr>

                    <td>${k}</td>

                    <td>${e.db}</td>

                    <td>${Math.round(e.ar / e.db).toLocaleString()} €</td>

                    <td>${Math.round(e.arNm / e.db)} €/m²</td>

                </tr>

            `;

        });

        html += "</table>";

        return html;

    }

}