class KeruletStatistics {

    static render(lista) {

        const keruletek = {};

        lista.forEach(i => {

            const kulcs = i.kerulet && i.kerulet.trim() !== ""
                ? i.kerulet
                : I18n.t("keruletNincsMegadva");

            if (!keruletek[kulcs]) {

                keruletek[kulcs] = {

                    db: 0,
                    ar: 0,
                    arNm: 0

                };

            }

            keruletek[kulcs].db++;
            keruletek[kulcs].ar += i.ar;
            keruletek[kulcs].arNm += i.arNm;

        });

        let html = `

            <br><br>

            <h2>${I18n.t("statsByKerulet")}</h2>

            <table class="statTable">

                <tr>

                    <th>${I18n.t("colKerulet")}</th>
                    <th>${I18n.t("statsColCount")}</th>
                    <th>${I18n.t("statsColAvgPrice")}</th>
                    <th>${I18n.t("statsColAvgPriceNm")}</th>

                </tr>

        `;

        Object.keys(keruletek).forEach(k => {

            const e = keruletek[k];

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