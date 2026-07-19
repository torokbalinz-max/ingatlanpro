class RoomStatistics {

    static render(lista) {

        if (DataManager.filter.minSzoba > 0) {

            return "";

        }

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

        let html = `

            <br><br>

            <h2>🛏 Szobaszám szerinti elemzés</h2>

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

        return html;

    }

}