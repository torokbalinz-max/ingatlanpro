// ============================================================
//  Térkép (#map)
//
//  Csak a PONTOS (vagy utca szintű) helyű hirdetések kerülnek a
//  térképre – ártáblás jelölővel, és ahol sok van egymás közelében,
//  csoportba vonva (a csoportra kattintva a térkép rájuk nagyít; egy
//  házban lévő több hirdetés a legnagyobb nagyításnál szétnyílik).
//
//  A csak kerület / negyed szintű ("közelítő") helyű hirdetések NEM
//  pontként jelennek meg (különben egy-egy kerület közepén száz pont
//  lenne egymáson): a kártyájuk "Térképen" gombja a körzetüket mutatja
//  (AreaMap). Ahol semmilyen hely nincs, ott térképes megjelenés sincs.
//
//  Kerülethatárok (ha az admin megrajzolta): halvány sokszögek névvel.
// ============================================================

class MapManager {

    static map = null;
    static layer = null;
    static tiles = null;
    static districtLayer = null;
    static markerMap = new Map();
    static dirty = false;
    static aktivId = null;

    static opts = { hatarok: true };

    // Ettől a nagyítástól ártábla, alatta kis pötty
    static ARTABLA_ZOOM = 16;

    // A régi beállítás ("közelítő helyek" kapcsoló) – már nincs hatása
    static setApprox() { /* a közelítő helyek nem pontként jelennek meg */ }

    // Térképre kerül-e pontként
    static pontos(i) {
        const x = Number(i.x), y = Number(i.y);
        if (!(x && y) || !["pontos", "utca"].includes(i.hely_pontossag || "pontos")) return false;
        // Ha sok hirdetés (6+) pontosan ugyanazon a ponton van, az nem valódi cím, hanem
        // egy kitalált középpont (pl. a város vagy a kerület közepe, ahova a helymeghatározás
        // tette őket) – ezeket nem rakjuk ki pontként (korábban egy nagy körben álltak)
        return !MapManager.halmozott().has(MapManager.pontKulcs(i));
    }

    static pontKulcs(i) {
        return Number(i.x).toFixed(5) + "," + Number(i.y).toFixed(5);
    }

    static HALMOZOTT_HATAR = 6;

    // A kitalált, sok hirdetésnek közös pontok (az összes betöltött hirdetésből számolva)
    static halmozott() {
        const osszes = (typeof DataManager !== "undefined" && DataManager.ingatlanok) || [];
        if (MapManager._halmozott && MapManager._halmozottN === osszes.length && MapManager._halmozottRef === osszes) return MapManager._halmozott;
        const db = new Map();
        osszes.forEach(i => {
            if (!(Number(i.x) && Number(i.y))) return;
            const k = MapManager.pontKulcs(i);
            db.set(k, (db.get(k) || 0) + 1);
        });
        MapManager._halmozott = new Set([...db].filter(([, n]) => n >= MapManager.HALMOZOTT_HATAR).map(([k]) => k));
        MapManager._halmozottN = osszes.length;
        MapManager._halmozottRef = osszes;
        return MapManager._halmozott;
    }

    static loadOpts() {
        try {
            const v = JSON.parse(localStorage.getItem("mapOpts") || "{}");
            if (typeof v.hatarok === "boolean") MapManager.opts.hatarok = v.hatarok;
        } catch (e) { /* nem kritikus */ }
    }

    static saveOpts() {
        try { localStorage.setItem("mapOpts", JSON.stringify(MapManager.opts)); } catch (e) { /* nem kritikus */ }
    }

    static sotet() {
        return document.documentElement.getAttribute("data-bs-theme") === "dark";
    }

    // Alaptérkép: OpenStreetMap (kulcs nélkül, megbízható), CSS-szűrővel halványítva –
    // így modern, nyugodt hátteret ad a jelölőknek; sötét módban sötétre fordítva.
    // (A CARTO alaptérkép már API-kulcsot kér, ezért nem azt használjuk.)
    static tileLayer() {
        return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
            maxZoom: 19,
            className: "ipTiles"
        });
    }

    static ensureMap() {

        if (MapManager.map) return;

        MapManager.loadOpts();

        MapManager.map = L.map("map", { zoomControl: false }).setView([45.8590, 25.7900], 13);
        L.control.zoom({ position: "bottomright" }).addTo(MapManager.map);

        MapManager.tiles = MapManager.tileLayer().addTo(MapManager.map);

        // A kerületek alul, a nevük fölöttük, de a jelölők alatt
        MapManager.map.createPane("districtPane");
        MapManager.map.getPane("districtPane").style.zIndex = 350;
        MapManager.map.createPane("districtLabelPane");
        MapManager.map.getPane("districtLabelPane").style.zIndex = 380;
        MapManager.map.getPane("districtLabelPane").style.pointerEvents = "none";

        // Nincs csoportosítás ("100 hirdetés egy pontban"): távolról minden hirdetés egy
        // kis pötty a saját helyén, közelebbről (16-os nagyítástól) ártábla
        MapManager.layer = L.featureGroup().addTo(MapManager.map);

        const tavol = () => MapManager.map.getContainer().classList.toggle("ipMapFar", MapManager.map.getZoom() < MapManager.ARTABLA_ZOOM);
        MapManager.map.on("zoomend", tavol);
        tavol();

        MapManager.map.on("popupclose", () => MapManager.jelol(null));

        // A rétegkapcsolók (kerülethatárok, közelítő helyek) a térkép jobb felső sarkába,
        // lebegő kártyára kerülnek (mint egy térkép-alkalmazásban)
        const kapcsolok = document.querySelector("#page-map .mapToggles");
        const keret = document.querySelector("#page-map .mapPageBox");
        if (kapcsolok && keret && kapcsolok.parentElement !== keret) {
            kapcsolok.classList.add("isFloating");
            keret.appendChild(kapcsolok);
            // a térkép ne kapja meg a kapcsolókra adott kattintást / görgetést
            L.DomEvent.disableClickPropagation(kapcsolok);
            L.DomEvent.disableScrollPropagation(kapcsolok);
        }

        MapManager.bindToggles();

    }

    static bindToggles() {

        const h = document.getElementById("mapShowDistricts");

        if (h) {
            h.checked = MapManager.opts.hatarok;
            h.onchange = () => { MapManager.opts.hatarok = h.checked; MapManager.saveOpts(); MapManager.drawDistricts(); };
        }

        // A régi "közelítő helyek" kapcsoló már nem kell
        const k = document.getElementById("mapShowApprox");
        if (k) { const w = k.closest(".form-check"); if (w) w.hidden = true; }

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
            L.polygon(Districts.latlngs(k.hatar), {
                pane: "districtPane", color: Utils.accent(), weight: 1, opacity: 0.35, dashArray: "4 4",
                fillColor: Utils.accent(), fillOpacity: 0.025, interactive: false
            })
                .bindTooltip(Utils.escape(CityManager.keruletLabelOf(k)), {
                    permanent: true, direction: "center", className: "districtLabel ipDistrictLabel",
                    interactive: false, pane: "districtLabelPane"
                })
                .addTo(MapManager.districtLayer);
        });

        MapManager.districtLayer.addTo(MapManager.map);

    }

    // Rövid ár a jelölőre: 76 900 € -> "76,9e €"; kiadónál "350 €"
    static rovidAr(i) {
        const a = Number(i.ar);
        if (!(a > 0)) return "–";
        if (i.ugylet === "kiado" || a < 10000) return Utils.num(Math.round(a)) + " €";
        // ezer: magyarul "e", angolul / románul "k"
        const e = I18n.current === "hu" ? "e" : "k";
        if (a >= 1000000) return Utils.num(Math.round(a / 100000) / 10, 1) + "M €";
        return Utils.num(Math.round(a / 1000)) + e + " €";
    }

    static priceIcon(i) {
        const cls = ["ipPin"];
        if (CardsView.kiemelt(i)) cls.push("isFeat");
        if (i.hely_pontossag === "utca") cls.push("isStreet");
        if (i.id === MapManager.aktivId) cls.push("isActive");
        return L.divIcon({
            className: "ipPinWrap",
            html: `<span class="${cls.join(" ")}">${Utils.escape(MapManager.rovidAr(i))}</span>`,
            iconSize: null,
            iconAnchor: [0, 0],
            popupAnchor: [0, -20]
        });
    }

    static clusterIcon(c) {
        const n = c.getChildCount();
        const meret = n < 10 ? 38 : n < 50 ? 46 : 56;
        return L.divIcon({
            className: "ipClusterWrap",
            html: `<span class="ipCluster" style="width:${meret}px;height:${meret}px"><b>${n}</b></span>`,
            iconSize: [meret, meret]
        });
    }

    // A kiválasztott hirdetés jelölője kiemelve
    static jelol(id) {
        const elozo = MapManager.aktivId;
        MapManager.aktivId = id;
        [elozo, id].forEach(x => {
            const m = x && MapManager.markerMap.get(x);
            if (m && m._ipI) m.setIcon(MapManager.priceIcon(m._ipI));
        });
    }

    static popupHtml(i) {

        const foto = Utils.photoUrl(i);
        const kulso = ListingPage.forrasra(i);
        const cim = i.cim || `${Types.label(i.tipus)} · ${CityManager.helyReszLabel(i) || CityManager.displayName(i.varos)}`;
        const tenyek = [
            i.nm ? Utils.nm(i.nm) : "",
            i.szobak && Types.fieldsOf(i).szobak ? I18n.f("roomsLabel", { n: i.szobak }) : "",
            i.emelet && Types.fieldsOf(i).emelet ? I18n.t("cfFloor") + ": " + CardsView.emelet(i.emelet) : "",
            i.allapot ? Utils.allapotLabel(i.allapot) : ""
        ].filter(Boolean);

        return `
            <div class="ipPopup">
                ${foto ? `<div class="ipPopupImg"><img src="${Utils.escape(foto)}" referrerpolicy="no-referrer" alt="" onerror="this.parentElement.remove()"></div>` : ""}
                <div class="ipPopupBody">
                    <div class="ipPopupPrice">${Utils.price(i)}${Utils.arNm(i) ? ` <small>${Utils.eurNm(Utils.arNm(i))}</small>` : ""}</div>
                    <div class="ipPopupTitle">${Utils.escape(cim)}</div>
                    <div class="ipPopupPlace"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${Utils.escape(CityManager.helyLabel(i))}${i.hely_pontossag === "utca" ? ` <span class="ipPopupApprox">${I18n.t("mapStreetLevel")}</span>` : ""}</div>
                    ${tenyek.length ? `<div class="ipPopupFacts">${tenyek.map(t => `<span>${Utils.escape(t)}</span>`).join("")}</div>` : ""}
                    <button type="button" class="btn btn-primary btn-sm w-100 mt-2" onclick="ListingPage.open(${Number(i.id)})">${kulso
                        ? `${Utils.escape(I18n.f("openOnSource", { s: Sources.label(Sources.kulcs(i)) }))} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>`
                        : I18n.t("detailOpenListing")}</button>
                    ${Types.becsulheto(i.tipus) ? `<button type="button" class="btn btn-outline-secondary btn-sm w-100 mt-1 ipPopupVal" onclick="CardsView.objektumok.set(${Number(i.id)}, DataManager.ingatlanok.find(x => x.id === ${Number(i.id)})); CardsView.valuate(${Number(i.id)})"><i class="fa-solid fa-calculator" aria-hidden="true"></i> ${I18n.t("detailValuate")}</button>` : ""}
                </div>
            </div>`;

    }

    static load(lista) {

        MapManager.ensureMap();
        MapManager.dirty = false;

        MapManager.map.invalidateSize();

        MapManager.layer.clearLayers();
        MapManager.markerMap.clear();

        MapManager.drawDistricts();

        const pontok = [];
        let nemPontos = 0;

        const markerek = [];

        // Ugyanarra a pontra eső hirdetések (pl. egy utca közepe, egy tömbház) kis körben
        // szétnyitva, hogy mind külön látsszon és kattintható legyen
        const azonos = new Map();
        lista.forEach(i => {
            if (!MapManager.pontos(i)) return;
            const k = Number(i.x).toFixed(5) + "," + Number(i.y).toFixed(5);
            if (!azonos.has(k)) azonos.set(k, []);
            azonos.get(k).push(i.id);
        });
        const eltolas = i => {
            const k = Number(i.x).toFixed(5) + "," + Number(i.y).toFixed(5);
            const csop = azonos.get(k) || [];
            if (csop.length < 2) return [0, 0];
            const n = csop.indexOf(i.id);
            const sugarM = 10 + csop.length * 2;
            const szog = 2 * Math.PI * n / csop.length;
            const dy = sugarM * Math.sin(szog) / 111320;
            const dx = sugarM * Math.cos(szog) / (111320 * Math.cos(Number(i.y) * Math.PI / 180));
            return [dy, dx];
        };

        lista.forEach(i => {

            if (!MapManager.pontos(i)) { nemPontos++; return; }

            const [ey, ex] = eltolas(i);
            const y = Number(i.y) + ey, x = Number(i.x) + ex;

            const m = L.marker([y, x], { icon: MapManager.priceIcon(i), keyboard: true, title: `${Utils.price(i)} · ${CityManager.helyLabel(i)}`, riseOnHover: true })
                .bindPopup(() => MapManager.popupHtml(i), { maxWidth: 280, minWidth: 240, className: "ipPopupWrap", closeButton: true });

            m._ipI = i;
            m.on("click", () => { MapManager.jelol(i.id); AppController.select(i, { fromMap: true }); });

            markerek.push(m);
            MapManager.markerMap.set(i.id, m);
            pontok.push([y, x]);

        });

        markerek.forEach(m => m.addTo(MapManager.layer));

        if (pontok.length > 0) {
            MapManager.map.fitBounds(L.latLngBounds(pontok), { padding: [40, 40], maxZoom: 15 });
        }

        const cnt = document.getElementById("mapCount");
        if (cnt) cnt.innerText = pontok.length;

        const nl = document.getElementById("mapNoLoc");
        if (nl) nl.innerText = "";

        MapManager.renderNotes(nemPontos);

    }

    //  A térképen lebegő, visszafogott jelzés: a szűrés hirdetései közül ennyi nincs
    //  pontosan a térképen (csak a kerületük ismert, vagy semmi). A "Miért?" kinyitja
    //  a magyarázatot, onnan a listába lehet menni. (A régi széles sáv helyett.)
    static renderNotes(nemPontos) {

        const box = document.getElementById("mapHiddenNote");
        if (!box) return;

        // a térkép keretébe kerül (a bal felső sarokba, a térkép fölé)
        const keret = document.querySelector("#page-map .mapPageBox");
        if (keret && box.parentElement !== keret) keret.appendChild(box);

        const nyitva = box.classList.contains("isOpen");

        box.innerHTML = nemPontos ? `
            <button type="button" class="mapNoteChip" data-map-note="toggle" aria-expanded="${nyitva}" aria-controls="mapNotePop">
                <i class="fa-regular fa-eye-slash" aria-hidden="true"></i>
                <span>${Utils.escape(I18n.f("mapNoteChip", { n: Utils.num(nemPontos) }))}</span>
                <span class="mapNoteWhy">${Utils.escape(I18n.t("mapNoteWhy"))}</span>
            </button>
            <div class="mapNotePop" id="mapNotePop" role="dialog" aria-label="${Utils.escape(I18n.f("mapNoteChip", { n: Utils.num(nemPontos) }))}">
                <p>${Utils.escape(I18n.f("mapNotExactNote", { n: Utils.num(nemPontos) }))}</p>
                <div class="mapNoteActions">
                    <button type="button" class="btn btn-sm btn-primary" data-map-note="list"><i class="fa-solid fa-grip" aria-hidden="true"></i> ${I18n.t("mapNoLocList")}</button>
                    <button type="button" class="btn btn-sm btn-link" data-map-note="close">${I18n.t("mapNoteClose")}</button>
                </div>
            </div>` : "";
        box.hidden = !nemPontos;

        const nyit = v => {
            box.classList.toggle("isOpen", v);
            const t = box.querySelector('[data-map-note="toggle"]');
            if (t) t.setAttribute("aria-expanded", String(v));
        };

        const t = box.querySelector('[data-map-note="toggle"]');
        if (t) t.onclick = () => nyit(!box.classList.contains("isOpen"));
        const c = box.querySelector('[data-map-note="close"]');
        if (c) c.onclick = () => { nyit(false); if (t) t.focus(); };
        const l = box.querySelector('[data-map-note="list"]');
        if (l) l.onclick = () => PageManager.show("properties");

        // Esc vagy egy kattintás máshova (pl. a térképre) bezárja a magyarázatot – egyszer kötjük be
        if (!box.dataset.kotve) {
            box.dataset.kotve = "1";
            const zar = fokusz => {
                if (!box.classList.contains("isOpen")) return;
                box.classList.remove("isOpen");
                const g = box.querySelector('[data-map-note="toggle"]');
                if (g) { g.setAttribute("aria-expanded", "false"); if (fokusz) g.focus(); }
            };
            box.addEventListener("keydown", e => { if (e.key === "Escape") zar(true); });
            document.addEventListener("click", e => { if (!box.contains(e.target)) zar(false); });
        }

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

        const marker = MapManager.markerMap.get(ingatlan.id);
        if (!marker) return;

        MapManager.jelol(ingatlan.id);

        const nyit = () => {
            MapManager.map.flyTo(marker.getLatLng(), Math.max(MapManager.map.getZoom(), 17), { animate: true, duration: 0.8 });
            setTimeout(() => marker.openPopup(), 850);
        };

        nyit();

    }

}

// ============================================================
//  A hirdetés körzete (közelítő hely): felugró ablak a kerülettel
//  vagy a hirdetés körével – a "Térképen" gomb nyitja a kártyáról
// ============================================================

class AreaMap {

    static map = null;

    // Mit tudunk mutatni: "pont" (pontos – a nagy térképen), "kor" (a hirdetés köre),
    // "kerulet" (a kerület határa), vagy null (semmit)
    static mod(i) {
        if (!i) return null;
        if (MapManager.pontos(i)) return "pont";
        if (AreaMap.kerulet(i)) return "kerulet";
        if (Number(i.x) && Number(i.y) && i.hely_pontossag === "kozelito") return "kor";
        return null;
    }

    static kerulet(i) {
        if (!i.kerulet || typeof Districts === "undefined") return null;
        return Districts.list(i.varos).find(k => k.nev === i.kerulet) || null;
    }

    static open(i) {

        const mod = AreaMap.mod(i);
        if (!mod || mod === "pont") return;

        let modal = document.getElementById("areaMapModal");

        if (!modal) {
            modal = document.createElement("div");
            modal.className = "modal fade";
            modal.id = "areaMapModal";
            modal.tabIndex = -1;
            modal.setAttribute("aria-hidden", "true");
            modal.innerHTML = `
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content ipAreaModal">
                        <div class="modal-header">
                            <div>
                                <h5 class="modal-title" id="areaMapTitle"></h5>
                                <div class="small text-body-secondary" id="areaMapSub"></div>
                            </div>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body p-0"><div id="areaMapBox"></div></div>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener("shown.bs.modal", () => AreaMap.rajzol());
        }

        AreaMap.aktiv = i;

        const k = AreaMap.kerulet(i);
        document.getElementById("areaMapTitle").textContent = I18n.f("areaTitle", { hely: CityManager.helyLabel(i) });
        document.getElementById("areaMapSub").textContent = I18n.t(k ? "areaSubDistrict" : "areaSubCircle");

        bootstrap.Modal.getOrCreateInstance(modal).show();

    }

    static rajzol() {

        const i = AreaMap.aktiv;
        if (!i) return;

        if (AreaMap.map) { AreaMap.map.remove(); AreaMap.map = null; }

        AreaMap.map = L.map("areaMapBox", { scrollWheelZoom: true, zoomControl: true });
        MapManager.tileLayer().addTo(AreaMap.map);

        const szin = Utils.accent();
        const k = AreaMap.kerulet(i);
        let reteg;

        if (k) {
            reteg = L.polygon(Districts.latlngs(k.hatar), { color: szin, weight: 2, fillColor: szin, fillOpacity: 0.16 })
                .bindTooltip(Utils.escape(CityManager.keruletLabelOf(k)), { permanent: true, direction: "center", className: "districtLabel ipDistrictLabel" });
        } else {
            reteg = L.circle([Number(i.y), Number(i.x)], { radius: Number(i.hely_sugar) || 600, color: szin, weight: 2, fillColor: szin, fillOpacity: 0.16, dashArray: "6 6" });
        }

        reteg.addTo(AreaMap.map);
        AreaMap.map.fitBounds(reteg.getBounds(), { padding: [30, 30], maxZoom: 16 });
        setTimeout(() => AreaMap.map && AreaMap.map.invalidateSize(), 60);

    }

}
