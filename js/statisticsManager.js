class StatisticsManager {

    static load() {

        fetch("/api/statistics")
        .then(r => r.json())
        .then(lista => {

            if(lista.length === 0){

                document.getElementById("statisticsContainer").innerHTML =
                    "<h3>Nincs még mentett piaci pillanatkép.</h3>";

                return;

            }

            const s = lista[0];

            document.getElementById("statisticsContainer").innerHTML = `

                <div class="statCard">

                    <h3>Utolsó mentés</h3>

                    <p>${new Date(s.created_at).toLocaleString()}</p>

                    <hr>

                    <p><b>Ingatlanok:</b> ${s.property_count}</p>

                    <p><b>Átlag ár:</b> ${Math.round(s.avg_price).toLocaleString()} €</p>

                    <p><b>Átlag m²:</b> ${Number(s.avg_nm).toFixed(1)} m²</p>

                    <p><b>Átlag €/m²:</b> ${Math.round(s.avg_price_nm)} €/m²</p>

                    <p><b>Minimum €/m²:</b> ${Math.round(s.min_price_nm)}</p>

                    <p><b>Maximum €/m²:</b> ${Math.round(s.max_price_nm)}</p>

                </div>

            `;

        });

    }

}