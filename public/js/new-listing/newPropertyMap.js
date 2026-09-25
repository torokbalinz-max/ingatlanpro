class NewPropertyMap {

    static map = null;
    static marker = null;

    static init() {

        const mapDiv = document.getElementById("newMap");

        if (!mapDiv) return;

        NewPropertyMap.map = L.map("newMap").setView([45.8590, 25.7900], 13);

        NewPropertyMap.map.getContainer().style.cursor = "crosshair";

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap"
        }).addTo(NewPropertyMap.map);

        NewPropertyMap.map.on("click", e => {
            NewPropertyMap.setPoint(e.latlng.lng, e.latlng.lat, "pontos", false);
        });

    }

    static setPoint(x, y, pontossag, center = true) {

        if (!NewPropertyMap.map) return;

        if (NewPropertyMap.marker) {
            NewPropertyMap.map.removeLayer(NewPropertyMap.marker);
            NewPropertyMap.marker = null;
        }

        if (!x || !y) {
            document.getElementById("ujX").value = "";
            document.getElementById("ujY").value = "";
            NewPropertyManager.setLocationInfo(null);
            return;
        }

        document.getElementById("ujX").value = Number(x).toFixed(7);
        document.getElementById("ujY").value = Number(y).toFixed(7);

        NewPropertyMap.marker = L.marker([y, x]).addTo(NewPropertyMap.map);

        if (center) NewPropertyMap.map.setView([y, x], 16);

        NewPropertyManager.setLocationInfo(pontossag || "pontos");

    }

    static refresh() {

        if (!NewPropertyMap.map) return;

        setTimeout(() => {

            NewPropertyMap.map.invalidateSize(true);

            const x = Number(document.getElementById("ujX").value);
            const y = Number(document.getElementById("ujY").value);

            if (x && y) {
                NewPropertyMap.map.setView([y, x], 16);
            } else {
                NewPropertyMap.map.setView([45.8590, 25.7900], 13);
            }

        }, 250);

    }

}
