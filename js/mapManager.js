class MapManager {

    static map;
    static markers = [];
    static markerMap = new Map();

    static load(lista){

        if(this.map){

            this.map.remove();

        }

        this.map = L.map("map").setView([45.8590,25.7900],13);

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution:"© OpenStreetMap"
            }
        ).addTo(this.map);

        this.markers = [];

        lista.forEach(ingatlan=>{

            if(isNaN(ingatlan.y) || isNaN(ingatlan.x)) return;

            const marker = L.marker([ingatlan.y,ingatlan.x])

            .addTo(this.map)

            .bindPopup(`

                <b>${ingatlan.id}</b><br>

                Ár: ${ingatlan.ar.toLocaleString()} €<br>

                ${ingatlan.nm} nm<br>

                ${ingatlan.allapot}<br><br>

                <a href="${ingatlan.link}" target="_blank">

                Megnyitás

                </a>

            `);

            this.markers.push(marker);
            this.markerMap.set(ingatlan.id, marker);

        });

    }
static focus(ingatlan){

    const marker = this.markerMap.get(ingatlan.id);

    if(!marker) return;

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