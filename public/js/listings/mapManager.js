// ============================================================
//  Térkép (#map)
//
//  - Pontos helyű hirdetés: telt, színes pont (szín = állapot)
//  - Ha több pontos helyű hirdetés ugyanarra a pontra esik (ugyanaz az
//    épület, vagy a hirdető iroda címe): EGY jelölő a számukkal, és a
//    felugró ablakban a lista. Korábban ezek egymásra rajzolódtak, és csak
//    a legfelső látszott – ezért "tűnt el" egy-egy hirdetés a térképről.
//  - Közelítő helyű hirdetés: kicsi, üres, szaggatott gyűrű. Az egy
//    helyre eső közelítő hirdetések EGY jelölőbe kerülnek (számmal),
//    így nem takarják egymást. A valószínű környék köre csak akkor
//    látszik, ha a jelölőre kattintasz.
//  - Kerülethatárok (ha az admin megrajzolta): halvány sokszögek névvel.
//    A nevek a jelölők ALATT vannak, így nem takarnak el hirdetést.
//  A két réteg a térkép fölötti kapcsolókkal ki-be kapcsolható; ha a
//  közelítő helyek ki vannak kapcsolva, a térkép fölött szól róla.
// ============================================================

class MapManager {

    static map = null;
    static layer = null;
    static districtLayer = null;
    static legend = null;
    static markerMap = new Map();
    static dirty = false;
    static focusCircle = null;

    static opts = { hatarok: true, kozelito: true };

    // Ennyi méteren belüli pontos helyek egy jelölőbe kerülnek
    static EGY_PONT_M = 12;

    // A jelölő színe az állapot szerint (a színeket az admin állítja: Admin → Állapotok)
    static color(allapot) {
        return Utils.allapotSzin(allapot);
    }

    static loadOpts() {
        try {
            const v = JSON.parse(localStorage.getItem("mapOpts") || "{}");
            if (typeof v.hatarok === "boolean") MapManager.opts.hatarok = v.hatarok;
            if (typeof v.kozelito === "boolean") MapManager.opts.kozelito = v.kozelito;
        } catch (e) { /* nem kritikus */ }
    }

    static saveOpts() {
        try { localStorage.setItem("mapOpts", JSON.stringify(MapManager.opts)); } catch (e) { /* nem kritikus */ }
    }

    static ensureMap() {

        if (MapManager.map) return;

        MapManager.loadOpts();

        MapManager.map = L.map("map").setView([45.8590, 25.7900], 13);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap"
        }).addTo(MapManager.map);

        // A kerületek alul, a nevük fölöttük, de a jelölők alatt
        MapManager.map.createPane("districtPane");
        MapManager.map.getPane("districtPane").style.zIndex = 350;
        MapManager.map.createPane("districtLabelPane");
        MapManager.map.getPane("districtLabelPane").style.zIndex = 380;
        MapManager.map.getPane("districtLabelPane").style.pointerEvents = "none";

        MapManager.layer = L.featureGroup().addTo(MapManager.map);

        MapManager.map.on("popupclose", () => MapManager.hideCircle());

        MapManager.bindToggles();

    }

    // A térkép fölötti kapcsolók (kerülethatárok, közelítő helyek)
    static bindToggles() {

        const h = document.getElementById("mapShowDistricts");
        const k = document.getElementById("mapShowApprox");

        if (h) {
            h.checked = MapManager.opts.hatarok;
            h.onchange = () => { MapManager.opts.hatarok = h.checked; MapManager.saveOpts(); MapManager.drawDistricts(); };
        }

        if (k) {
            k.checked = MapManager.opts.kozelito;
            k.onchange = () => { MapManager.setApprox(k.checked); };
        }

    }

    static setApprox(be) {
        MapManager.opts.kozelito = !!be;
        MapManager.saveOpts();
        const k = document.getElementById("mapShowApprox");
        if (k) k.checked = MapManager.opts.kozelito;
        MapManager.load(DataManager.szurtIngatlanok);
    }

    static drawDistricts() {

        if (MapManager.districtLayer) {
            MapManager.districtLayer.remove();
            MapManager.districtLayer = null;
        }

        const varos = DataManager.currentCity;
        const van = typeof Districts !== "undefined" && Districts.any(varos);

        const wrap = document.getElementById("mapToggleDistrictsWrap");
        if (wrap) wrap.hidden = !van;

        if (!van || !MapManager.opts.hatarok) return;

        MapManager.districtLayer = L.layerGroup();

        Districts.list(varos).forEach(k => {
            const szin = Districts.color(k);
            L.polygon(Districts.latlngs(k.hatar), {
                pane: "districtPane", color: szin, weight: 1.5, opacity: 0.65,
                fillColor: szin, fillOpacity: 0.05, interactive: false
            })
                .bindTooltip(Utils.escape(CityManager.keruletLabelOf(k)), {
                    permanent: true, direction: "center", offset: [0, -24], className: "districtLabel",
                    interactive: false, pane: "districtLabelPane"
                })
                .addTo(MapManager.districtLayer);
        });

        MapManager.districtLayer.addTo(MapManager.map);

    }

    static renderLegend() {

        if (MapManager.legend) MapManager.legend.remove();

        MapManager.legend = L.control({ position: "bottomright" });

        MapManager.legend.onAdd = () => {

            const div = L.DomUtil.create("div", "mapLegend");

            div.innerHTML = Utils.ALLAPOTOK
                .map(a => `<span><i style="background:${Utils.allapotSzin(a)}"></i>${Utils.escape(Utils.allapotLabel(a))}</span>`)
                .join("") +
                `<span class="mapLegendSep"><i class="legendStack">2</i>${I18n.t("mapLegendStack")}</span>` +
                `<span><i class="legendApprox"></i>${I18n.t("hely_kozelito")}</span>`;

            return div;

        };

        MapManager.legend.addTo(MapManager.map);

    }

    // Hol van: kerület (a határ szerint is) vagy település
    static helySor(i) {

        const f = Types.fieldsOf(i);

        if (f.telepules && i.telepules) {
            return `<div class="mapPopupPlace"><i class="fa-solid fa-location-dot"></i> ${Utils.escape(CityManager.helyLabel(i))}</div>`;
        }

        const k = typeof Districts !== "undefined" ? Districts.ofListing(i) : i.kerulet;

        if (!k) return "";

        return `<div class="mapPopupPlace"><i class="fa-solid fa-draw-polygon"></i> ${I18n.t("kerulet")}: <b>${Utils.escape(CityManager.keruletLabel(k, i.varos))}</b></div>`;

    }

    static popupHtml(i) {

        const foto = Utils.photoUrl(i);

        return `
            <div class="mapPopup">
                ${foto ? `<img class="mapPopupImg" src="${Utils.escape(foto)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">` : ""}
                <h6>${Utils.escape(i.cim || I18n.t("popupProperty") + i.id)}</h6>
                ${MapManager.helySor(i)}
                <div class="mapPopupPrice">${Utils.price(i)}</div>
                <div>${i.nm ? Utils.nm(i.nm) + " · " : ""}${Utils.eurNm(Utils.arNm(i))}</div>
                <div>${i.szobak ? I18n.f("roomsLabel", { n: i.szobak }) + " · " : ""}${i.allapot ? Utils.allapotLabel(i.allapot) : ""}</div>
                ${i.iroda_nev ? `<div class="small text-body-secondary"><i class="fa-solid fa-briefcase"></i> ${Utils.escape(i.iroda_nev)}</div>` : ""}
                <div class="mt-1">${(i.forrasok || [i.forras]).map(Sources.badge).join(" ")} ${Utils.helyBadge(i)}</div>
                <button class="btn btn-primary btn-sm w-100 mt-2" onclick="ListingPage.open(${Number(i.id)})">${I18n.t("detailOpenListing")}</button>
            </div>`;

    }

    // Egy helyre eső több hirdetés: rövid lista (a kiemelt az, amit a kártyáról / táblázatból kerestek)
    static groupPopupHtml(lista, kozelito, kiemelt) {

        const elso = lista[0];

        return `
            <div class="mapPopup mapPopupGroup">
                <h6>${I18n.f(kozelito ? "mapApproxGroup" : "mapStackGroup", { n: lista.length })}</h6>
                ${MapManager.helySor(elso)}
                <p class="small text-body-secondary mb-2">${I18n.t(kozelito ? "mapApproxGroupHelp" : "mapStackGroupHelp")}</p>
                <div class="mapGroupList">
                    ${lista.map(i => `
                        <button type="button" class="mapGroupItem ${i.id === kiemelt ? "active" : ""}" onclick="ListingPage.open(${Number(i.id)})">
                            <i class="dot" style="background:${MapManager.color(i.allapot)}"></i>
                            <span class="t">${Utils.escape(i.cim || Types.label(i.tipus))}<small>${[i.nm ? Utils.nm(i.nm) : "", i.szobak ? I18n.f("roomsLabel", { n: i.szobak }) : ""].filter(Boolean).join(" · ")}</small></span>
                            <b>${Utils.price(i)}</b>
                        </button>`).join("")}
                </div>
            </div>`;

    }

    static showCircle(lat, lng, radius, szin) {
        MapManager.hideCircle();
        MapManager.focusCircle = L.circle([lat, lng], {
            radius, color: szin, weight: 1.5, opacity: 0.8, fillOpacity: 0.08, dashArray: "4 4", interactive: false
        }).addTo(MapManager.map);
    }

    static hideCircle() {
        if (MapManager.focusCircle) {
            MapManager.focusCircle.remove();
            MapManager.focusCircle = null;
        }
    }

    // Közelítő jelölő: üres gyűrű; ha több hirdetés van ugyanott, a számuk
    static approxIcon(lista) {

        const n = lista.length;
        const szin = n === 1 ? MapManager.color(lista[0].allapot) : "#475569";

        return L.divIcon({
            className: "approxMarker",
            html: n > 1
                ? `<span class="approxRing multi" style="border-color:${szin}"><b>${n}</b></span>`
                : `<span class="approxRing" style="border-color:${szin}"></span>`,
            iconSize: n > 1 ? [28, 28] : [16, 16],
            iconAnchor: n > 1 ? [14, 14] : [8, 8],
            popupAnchor: [0, -8]
        });

    }

    // Egy ponton álló több pontos helyű hirdetés: telt kör a számukkal
    // (a színe az állapoté, ha mind egyforma)
    static stackIcon(lista) {

        const szinek = [...new Set(lista.map(i => MapManager.color(i.allapot)))];
        const szin = szinek.length === 1 ? szinek[0] : Utils.accent();

        return L.divIcon({
            className: "stackMarker",
            html: `<span class="stackDot" style="--stack:${szin}"><b>${lista.length}</b></span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -12]
        });

    }

    // Két pont távolsága méterben (kis távolságra elég pontos)
    static meter(y1, x1, y2, x2) {
        const dy = (y2 - y1) * 111320;
        const dx = (x2 - x1) * 111320 * Math.cos(y1 * Math.PI / 180);
        return Math.hypot(dx, dy);
    }

    // A pontos helyek csoportosítása: az egymástól EGY_PONT_M méteren belüliek egy csoport
    static pontCsoportok(lista) {

        const csoportok = [];
        const racs = new Map();            // ~100 m-es rács a gyors kereséshez
        const sor = y => Math.floor(y / 0.001);
        const oszlop = x => Math.floor(x / 0.0014);

        lista.forEach(i => {

            const y = Number(i.y), x = Number(i.x);
            const ky = sor(y), kx = oszlop(x);
            let talalt = null;

            for (let a = -1; a <= 1 && !talalt; a++) {
                for (let b = -1; b <= 1 && !talalt; b++) {
                    const resz = racs.get((ky + a) + ":" + (kx + b)) || [];
                    talalt = resz.find(g => MapManager.meter(g.y, g.x, y, x) <= MapManager.EGY_PONT_M) || null;
                }
            }

            if (talalt) {
                talalt.lista.push(i);
            } else {
                const g = { y, x, lista: [i] };
                csoportok.push(g);
                const k = ky + ":" + kx;
                if (!racs.has(k)) racs.set(k, []);
                racs.get(k).push(g);
            }

        });

        return csoportok;

    }

    static load(lista) {

        MapManager.ensureMap();
        MapManager.dirty = false;

        MapManager.map.invalidateSize();

        MapManager.layer.clearLayers();
        MapManager.markerMap.clear();
        MapManager.hideCircle();

        MapManager.drawDistricts();

        let helyNelkul = 0;
        let kozelitoDb = 0;
        const kozelitoCsop = new Map();          // "lat,lng" -> [hirdetések]
        const pontosak = [];
        const pontok = [];

        lista.forEach(ingatlan => {

            const x = Number(ingatlan.x);
            const y = Number(ingatlan.y);

            // Hiányzó / 0 koordináta: nem tesszük ki a térképre
            if (!x || !y || isNaN(x) || isNaN(y)) { helyNelkul++; return; }

            if (ingatlan.hely_pontossag === "kozelito") {

                kozelitoDb++;

                if (!MapManager.opts.kozelito) return;

                const kulcs = y.toFixed(4) + "," + x.toFixed(4);
                if (!kozelitoCsop.has(kulcs)) kozelitoCsop.set(kulcs, []);
                kozelitoCsop.get(kulcs).push(ingatlan);
                return;

            }

            pontosak.push(ingatlan);

        });

        // Pontos helyek: egy jelölő pontonként (a több hirdetéses pont számmal)
        MapManager.pontCsoportok(pontosak).forEach(g => {

            if (g.lista.length === 1) {

                const ingatlan = g.lista[0];

                const marker = L.circleMarker([g.y, g.x], {
                    radius: 7,
                    weight: 2,
                    color: "#ffffff",
                    fillColor: MapManager.color(ingatlan.allapot),
                    fillOpacity: 0.95
                })
                .bindPopup(MapManager.popupHtml(ingatlan));

                marker.on("click", () => AppController.select(ingatlan, { fromMap: true }));

                marker.addTo(MapManager.layer);

                MapManager.markerMap.set(ingatlan.id, marker);

            } else {

                const marker = L.marker([g.y, g.x], {
                    icon: MapManager.stackIcon(g.lista),
                    keyboard: true,
                    title: I18n.f("mapStackGroup", { n: g.lista.length }),
                    zIndexOffset: 200
                })
                .bindPopup(MapManager.groupPopupHtml(g.lista, false), { maxWidth: 320 });

                marker._ipLista = g.lista;
                marker._ipKozelito = false;

                marker.addTo(MapManager.layer);

                g.lista.forEach(i => MapManager.markerMap.set(i.id, marker));

            }

            pontok.push([g.y, g.x]);

        });

        // Közelítő helyek: helyenként egy jelölő
        kozelitoCsop.forEach(csoport => {

            const i0 = csoport[0];
            const y = Number(i0.y), x = Number(i0.x);
            const sugar = Math.max(...csoport.map(i => i.hely_sugar || (i.telepules ? 1500 : 500)));

            const marker = L.marker([y, x], {
                icon: MapManager.approxIcon(csoport),
                keyboard: true,
                title: csoport.length > 1 ? I18n.f("mapApproxGroup", { n: csoport.length }) : I18n.t("hely_kozelito"),
                zIndexOffset: -100
            })
            .bindPopup(csoport.length > 1 ? MapManager.groupPopupHtml(csoport, true) : MapManager.popupHtml(i0), { maxWidth: 320 });

            marker.on("popupopen", () => MapManager.showCircle(y, x, sugar, csoport.length > 1 ? "#475569" : MapManager.color(i0.allapot)));

            if (csoport.length === 1) marker.on("click", () => AppController.select(i0, { fromMap: true }));
            else { marker._ipLista = csoport; marker._ipKozelito = true; }

            marker.addTo(MapManager.layer);

            csoport.forEach(i => MapManager.markerMap.set(i.id, marker));
            pontok.push([y, x]);

        });

        if (pontok.length > 0) {
            MapManager.map.fitBounds(L.latLngBounds(pontok), { padding: [30, 30], maxZoom: 15 });
        }

        const cnt = document.getElementById("mapCount");
        if (cnt) cnt.innerText = lista.length - helyNelkul - (MapManager.opts.kozelito ? 0 : kozelitoDb);

        const nl = document.getElementById("mapNoLoc");
        if (nl) {
            const reszek = [];
            if (kozelitoDb && MapManager.opts.kozelito) reszek.push(I18n.f("mapApproxCount", { n: kozelitoDb }));
            if (helyNelkul) reszek.push(I18n.f("mapNoLocCount", { n: helyNelkul }));
            nl.innerText = reszek.length ? " · " + reszek.join(" · ") : "";
        }

        MapManager.renderNotes(MapManager.opts.kozelito ? 0 : kozelitoDb, helyNelkul);

        MapManager.renderLegend();

    }

    //  A térkép fölötti figyelmeztetés: ami a szűrésben benne van, de nem látszik
    //   - a kikapcsolt közelítő helyek (egy kattintással visszakapcsolható)
    //   - a hely nélküli hirdetések (a listában megnézhetők)
    static renderNotes(rejtettKozelito, helyNelkul) {

        const box = document.getElementById("mapHiddenNote");
        if (!box) return;

        const reszek = [];

        if (rejtettKozelito) {
            reszek.push(`<span><i class="fa-regular fa-eye-slash" aria-hidden="true"></i> ${I18n.f("mapApproxHidden", { n: rejtettKozelito })}</span>
                <button type="button" class="btn btn-sm btn-outline-primary" data-map-note="approx">${I18n.t("mapApproxShow")}</button>`);
        }

        if (helyNelkul) {
            reszek.push(`<span><i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i> ${I18n.f("mapNoLocNote", { n: helyNelkul })}</span>
                <button type="button" class="btn btn-sm btn-outline-secondary" data-map-note="list">${I18n.t("mapNoLocList")}</button>`);
        }

        box.innerHTML = reszek.map(r => `<div class="mapNoteRow">${r}</div>`).join("");
        box.hidden = !reszek.length;

        const a = box.querySelector('[data-map-note="approx"]');
        if (a) a.onclick = () => MapManager.setApprox(true);

        const l = box.querySelector('[data-map-note="list"]');
        if (l) l.onclick = () => {
            const sel = document.getElementById("keresoHely");
            if (sel) sel.value = "nincs";
            FilterManager.apply();
            PageManager.show("properties");
        };

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

        if (!MapManager.map) return;

        // (ha a közelítő helyek ki vannak kapcsolva, a térkép fölötti sáv szól róla)
        const marker = MapManager.markerMap.get(ingatlan.id);

        if (!marker) return;

        // A csoport listájában kiemeljük a keresett hirdetést
        if (marker._ipLista) marker.setPopupContent(MapManager.groupPopupHtml(marker._ipLista, marker._ipKozelito, ingatlan.id));

        MapManager.map.flyTo(marker.getLatLng(), 16, { animate: true, duration: 0.8 });

        marker.openPopup();

    }

}
