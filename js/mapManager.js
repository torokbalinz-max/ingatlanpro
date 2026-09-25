class MapManager {

    static map = null;
    static layer = null;
    static legend = null;
    static markerMap = new Map();
    static dirty = false;

    static COLORS = {
        "felújítandó": "#f97316",
        "részbenfel": "#eab308",
        "jó": "#2563eb",
        "újszerű": "#16a34a",
        "luxus": "#9333ea",
        "": "#64748b"
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

        return `
            <div class="mapPopup">
                <h6>${I18n.t("popupProperty")}${i.id}</h6>
                <div class="mapPopupPrice">${Utils.eur(i.ar)}</div>
                <div>${Utils.num(i.nm)} m² · ${Utils.eurNm(Utils.arNm(i))}</div>
                <div>${I18n.f("roomsLabel", { n: i.szobak || "-" })} · ${Utils.allapotLabel(i.allapot)}</div>
                <div class="mt-1">${Sources.badge(i.forras)}</div>
                ${i.link && i.forras !== "other"
                    ? `<a href="${Utils.escape(i.link)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm w-100 mt-2">${I18n.t("popupLink")}</a>`
                    : ""}
            </div>`;

    }

    static load(lista) {

        MapManager.ensureMap();
        MapManager.dirty = false;

        MapManager.map.invalidateSize();

        MapManager.layer.clearLayers();
        MapManager.markerMap.clear();

        lista.forEach(ingatlan => {

            const x = Number(ingatlan.x);
            const y = Number(ingatlan.y);

            // Hiányzó / 0 koordináta: nem tesszük ki a térképre
            if (!x || !y || isNaN(x) || isNaN(y)) return;

            const marker = L.circleMarker([y, x], {
                radius: 8,
                weight: 2,
                color: "#ffffff",
                fillColor: MapManager.color(ingatlan.allapot),
                fillOpacity: 0.9
            })
            .bindPopup(MapManager.popupHtml(ingatlan));

            marker.on("click", () => AppController.select(ingatlan, { fromMap: true }));

            marker.addTo(MapManager.layer);

            MapManager.markerMap.set(ingatlan.id, marker);

        });

        if (MapManager.markerMap.size > 0) {
            MapManager.map.fitBounds(MapManager.layer.getBounds(), { padding: [30, 30], maxZoom: 15 });
        }

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
