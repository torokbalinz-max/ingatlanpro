class NewPropertyMap {

    static map = null;
    static marker = null;

    static init() {

        const mapDiv = document.getElementById("newMap");

        if (!mapDiv) return;

        this.map = L.map("newMap").setView([45.8590, 25.7900], 13);

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution: "© OpenStreetMap"
            }
        ).addTo(this.map);

        this.map.on("click", (e) => {

            if (this.marker) {
                this.map.removeLayer(this.marker);
            }

            this.marker = L.marker(e.latlng).addTo(this.map);

            document.getElementById("ujX").value = e.latlng.lng.toFixed(7);
            document.getElementById("ujY").value = e.latlng.lat.toFixed(7);

        });

    }

    static refresh() {

        if (!this.map) return;

        setTimeout(() => {

            this.map.invalidateSize(true);

            const x = Number(document.getElementById("ujX").value);
            const y = Number(document.getElementById("ujY").value);

            if (!isNaN(x) && !isNaN(y) && x !== 0 && y !== 0) {

                const latlng = [y, x];

                this.map.setView(latlng, 16);

                if (this.marker) {
                    this.map.removeLayer(this.marker);
                }

                this.marker = L.marker(latlng).addTo(this.map);

            } else {

                this.map.setView([45.8590, 25.7900], 13);

            }

        }, 300);

    }

}