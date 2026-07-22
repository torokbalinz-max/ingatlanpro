class MapManager {

    static map;
    static markers = [];
    static markerMap = new Map();

    static load(lista) {

        if (this.map) {
            this.map.remove();
        }

        this.map = L.map("map").setView([45.8590, 25.7900], 13);

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution: "© OpenStreetMap"
            }
        ).addTo(this.map);

        this.markers = [];
        this.markerMap.clear();

        lista.forEach(ingatlan => {

            if (isNaN(ingatlan.y) || isNaN(ingatlan.x))
                return;

            // =============================
            // MARKER SZÍN AZ ÁLLAPOT ALAPJÁN
            // =============================

            let markerColor = "blue";

            const allapot = (ingatlan.allapot || "").toLowerCase();

            if (
                allapot.includes("új") ||
                allapot.includes("uj") ||
                allapot.includes("újszerű") ||
                allapot.includes("ujszerű") ||
                allapot.includes("ujszeru")
            ) {

                markerColor = "green";

            } else if (
                allapot.includes("jó") ||
                allapot.includes("jo")
            ) {

                markerColor = "blue";

            } else if (
                allapot.includes("felúj") ||
                allapot.includes("feluj")
            ) {

                markerColor = "orange";

            } else {

                markerColor = "red";

            }

            const icon = new L.Icon({

                iconUrl:
                    `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${markerColor}.png`,

                shadowUrl:
                    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",

                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]

            });

            const marker = L.marker(
                [ingatlan.y, ingatlan.x],
                {
                    icon: icon
                }
            )

            .addTo(this.map)

            .bindPopup(`

                <div style="min-width:220px">

                    <h5 style="margin-bottom:10px;">
                        🏠 Ingatlan #${ingatlan.id}
                    </h5>

                    <b>💶 Ár:</b>
                    ${ingatlan.ar.toLocaleString()} €<br>

                    <b>📐 Alapterület:</b>
                    ${ingatlan.nm} m²<br>

                    <b>💰 €/m²:</b>
                    ${Math.round(ingatlan.arNm)}<br>

                    <b>🔧 Állapot:</b>
                    ${ingatlan.allapot}

                    <hr>

                    <a
                        href="${ingatlan.link}"
                        target="_blank"
                        class="btn btn-primary btn-sm w-100">

                        🌐 Hirdetés megnyitása

                    </a>

                </div>

            `);

            marker.on("click", () => {

                AppController.select(ingatlan);

                TableManager.selectById(ingatlan.id);

                UIManager.showDetails(ingatlan);

            });

            this.markers.push(marker);

            this.markerMap.set(ingatlan.id, marker);

        });

    }

    static focus(ingatlan) {

        const marker = this.markerMap.get(ingatlan.id);

        if (!marker)
            return;

        this.map.flyTo(
            marker.getLatLng(),
            17,
            {
                animate: true,
                duration: 0.8
            }
        );

        marker.openPopup();

    }

}