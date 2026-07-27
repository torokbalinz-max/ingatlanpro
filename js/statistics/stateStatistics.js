class StateStatistics {

    static render(lista) {

        const allapotok = {};

        lista.forEach(i => {

            const nev = i.allapot || I18n.t("unknownLabel");

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

            <h2>${I18n.t("statsByAllapot")}</h2>

            <table class="statTable">

                <tr>

                    <th>${I18n.t("statsColAllapot")}</th>

                    <th>${I18n.t("statsColCount")}</th>

                    <th>${I18n.t("statsColAvgPrice")}</th>

                    <th>${I18n.t("statsColAvgPriceNm")}</th>

                </tr>

        `;

        Object.keys(allapotok).forEach(a => {

            const x = allapotok[a];

            html += `

                <tr>

                    <td>${I18n.translateStatValue(a)}</td>

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