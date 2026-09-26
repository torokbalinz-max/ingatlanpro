class MapManager {

    static map = null;
    static layer = null;
    static legend = null;
    static markerMap = new Map();
    static dirty = false;

    static COLORS = {
        "felújítandó": "#c2410c",
        "részbenfel": "#ca8a04",
        "jó": "#1f6f5c",
        "újszerű": "#2563eb",
        "luxus": "#7c3aed",
        "": "#6b7280"
    };

    static color(allapot) {
        return MapManager.COLORS[Utils.normAllapot(allapot)] || MapManager.COLORS[""];
    }

    static ensureMap() {

        if (MapManager.map) return;

        MapManager.map = L.map("map").setView([45.8590, 25.7900], 13);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap"
        }).addTo(MapManager.map);

        MapManager.layer = L.featureGroup().addTo(MapManager.map);

    }

    static renderLegend() {

        if (MapManager.legend) MapManager.legend.remove();

        MapManager.legend = L.control({ position: "bottomright" });

        MapManager.legend.onAdd = () => {

            const div = L.DomUtil.create("div", "mapLegend");

            div.innerHTML = ["felújítandó", "részbenfel", "jó", "újszerű", "luxus"]
                .map(a => `<span><i style="background:${MapManager.COLORS[a]}"></i>${Utils.allapotLabel(a)}</span>`)
                .join("");

            return div;

        };

        MapManager.legend.addTo(MapManager.map);

    }

    static popupHtml(i) {

        const foto = Utils.photoUrl(i);

        return `
            <div class="mapPopup">
                ${foto ? `<img class="mapPopupImg" src="${Utils.escape(foto)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">` : ""}
                <h6>${Utils.escape(i.cim || I18n.t("popupProperty") + i.id)}</h6>
                <div class="mapPopupPrice">${Utils.price(i)}</div>
                <div>${i.nm ? Utils.num(i.nm) + " m² · " : ""}${Utils.eurNm(Utils.arNm(i))}</div>
                <div>${i.szobak ? I18n.f("roomsLabel", { n: i.szobak }) + " · " : ""}${i.allapot ? Utils.allapotLabel(i.allapot) : ""}</div>
                <div class="mt-1">${(i.forrasok || [i.forras]).map(Sources.badge).join(" ")} ${Utils.helyBadge(i)}</div>
                <button class="btn btn-primary btn-sm w-100 mt-2" onclick="ListingPage.open(${Number(i.id)})">${I18n.t("detailOpenListing")}</button>
            </div>`;

    }

    static load(lista) {

        MapManager.ensureMap();
        MapManager.dirty = false;

        MapManager.map.invalidateSize();

        MapManager.layer.clearLayers();
        MapManager.markerMap.clear();

        let helyNelkul = 0;

        lista.forEach(ingatlan => {

            const x = Number(ingatlan.x);
            const y = Number(ingatlan.y);

            // Hiányzó / 0 koordináta: nem tesszük ki a térképre
            if (!x || !y || isNaN(x) || isNaN(y)) { helyNelkul++; return; }

            const szin = MapManager.color(ingatlan.allapot);
            const kozelito = ingatlan.hely_pontossag === "kozelito";

            // Közelítő helynél halvány kör a valószínű környékre
            if (kozelito) {
                L.circle([y, x], {
                    radius: ingatlan.hely_sugar || (ingatlan.telepules ? 1500 : 500),
                    color: szin, weight: 1, opacity: 0.5, fillOpacity: 0.06, interactive: false
                }).addTo(MapManager.layer);
            }

            const marker = L.circleMarker([y, x], {
                radius: 8,
                weight: 2,
                color: "#ffffff",
                dashArray: kozelito ? "3 3" : null,
                fillColor: szin,
                fillOpacity: kozelito ? 0.6 : 0.9
            })
            .bindPopup(MapManager.popupHtml(ingatlan));

            marker.on("click", () => AppController.select(ingatlan, { fromMap: true }));

            marker.addTo(MapManager.layer);

            MapManager.markerMap.set(ingatlan.id, marker);

        });

        if (MapManager.markerMap.size > 0) {
            MapManager.map.fitBounds(L.featureGroup([...MapManager.markerMap.values()]).getBounds(), { padding: [30, 30], maxZoom: 15 });
        }

        const cnt = document.getElementById("mapCount");
        if (cnt) cnt.innerText = MapManager.markerMap.size;

        const nl = document.getElementById("mapNoLoc");
        if (nl) nl.innerText = helyNelkul ? " · " + I18n.f("mapNoLocCount", { n: helyNelkul }) : "";

        MapManager.renderLegend();

    }

    // Oldalváltás után (a rejtett térkép méretének frissítése)
    static refresh() {

        if (MapManager.dirty || !MapManager.map) {
            MapManager.load(DataManager.szurtIngatlanok);
            return;
        }

        setTimeout(() => MapManager.map.invalidateSize(), 50);

    }

    static focus(ingatlan) {

        const marker = MapManager.markerMap.get(ingatlan.id);

        if (!marker || !MapManager.map) return;

        MapManager.map.flyTo(marker.getLatLng(), 16, { animate: true, duration: 0.8 });

        marker.openPopup();

    }

}
