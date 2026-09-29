// ============================================================
//  Admin – kerülethatárok megrajzolása a térképen
//
//  Bal oldalt a város kerületei; egyet kiválasztva:
//   - kattintás a térképre: új pont a határon (a legközelebbi oldalba
//     kerül, így utólag is lehet pontot beszúrni)
//   - pont húzása: mozgatás
//   - kattintás egy pontra: törlés
//   - a szomszéd kerület pontjaihoz "tapad" (közös határ, nincs rés)
//  Mentés után a város hirdetései újra besorolódnak:
//   pontos helynél a határ dönti el a kerületet, a csak kerülettel ismert
//   (közelítő) hirdetések a kerület közepére kerülnek.
// ============================================================

AdminManager.districtEditor = function (varos) {

    let el = document.getElementById("districtEditorModal");

    if (!el) {
        el = document.createElement("div");
        el.id = "districtEditorModal";
        el.className = "modal fade";
        el.tabIndex = -1;
        el.innerHTML = `<div class="modal-dialog modal-fullscreen-lg-down modal-xl modal-dialog-centered"><div class="modal-content"></div></div>`;
        document.body.appendChild(el);
    }

    const esc = Utils.escape;
    const E = {
        varos,
        keruletek: CityManager.keruletek.filter(k => k.varos === varos)
            .sort((a, b) => CityManager.keruletLabelOf(a).localeCompare(CityManager.keruletLabelOf(b), I18n.current === "hu" ? "hu" : "ro")),
        aktiv: null,          // a szerkesztett kerület id-ja
        pontok: [],           // [[x, y], ...] a szerkesztett határ
        tortenet: [],         // visszavonáshoz
        valtozott: false,
        map: null,
        retegek: null,
        szerkReteg: null,
        hirdetesReteg: null
    };

    el.querySelector(".modal-content").innerHTML = `
        <div class="modal-header">
            <h5 class="modal-title"><i class="fa-solid fa-draw-polygon"></i> ${I18n.t("deTitle")} – ${esc(CityManager.displayName(varos))}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${I18n.t("close")}"></button>
        </div>
        <div class="modal-body p-0">
            <div class="deLayout">
                <div class="deSide">
                    <p class="small text-body-secondary mb-2">${I18n.t("deHelp")}</p>
                    <div class="deList" id="deList"></div>
                    <div class="deTools" id="deTools" hidden>
                        <div class="small mb-2" id="deInfo"></div>
                        <div class="d-flex flex-wrap gap-2">
                            <button class="btn btn-sm btn-primary" id="deSave"><i class="fa-solid fa-floppy-disk"></i> ${I18n.t("save")}</button>
                            <button class="btn btn-sm btn-outline-secondary" id="deUndo" title="${esc(I18n.t("deUndo"))}"><i class="fa-solid fa-rotate-left"></i> ${I18n.t("deUndo")}</button>
                            <button class="btn btn-sm btn-outline-secondary" id="deReset"><i class="fa-solid fa-eraser"></i> ${I18n.t("deRestart")}</button>
                            <button class="btn btn-sm btn-outline-danger" id="deDelete"><i class="fa-solid fa-trash"></i> ${I18n.t("deDelete")}</button>
                        </div>
                    </div>
                    <div class="deFoot">
                        <button class="btn btn-sm btn-outline-secondary w-100 mb-2" id="deCheck"><i class="fa-solid fa-list-check"></i> ${I18n.t("deCheck")}</button>
                        <button class="btn btn-sm btn-outline-primary w-100" id="deClassify"><i class="fa-solid fa-arrows-rotate"></i> ${I18n.t("deClassify")}</button>
                        <div class="small mt-2" id="deResult"></div>
                    </div>
                </div>
                <div class="deMapWrap">
                    <div id="deMap"></div>
                    <div class="deHint" id="deHint">${I18n.t("dePickFirst")}</div>
                </div>
            </div>
        </div>`;

    const modal = bootstrap.Modal.getOrCreateInstance(el);

    // ---------- lista ----------

    const renderList = () => {
        document.getElementById("deList").innerHTML = E.keruletek.map(k => `
            <button type="button" class="deItem ${k.id === E.aktiv ? "active" : ""}" data-id="${k.id}">
                <i class="dot" style="background:${Districts.color(k)}"></i>
                <span class="flex-fill text-start">${esc(CityManager.keruletLabelOf(k))}</span>
                ${Array.isArray(k.hatar) && k.hatar.length >= 3
                    ? `<i class="fa-solid fa-circle-check text-success" title="${esc(I18n.t("deHasBorder"))}"></i>`
                    : `<span class="badge text-bg-light">${I18n.t("deNoBorder")}</span>`}
            </button>`).join("") || `<p class="small text-body-secondary">${I18n.t("placesNoDistricts")}</p>`;

        document.querySelectorAll("#deList [data-id]").forEach(b => {
            b.onclick = () => valaszt(Number(b.dataset.id));
        });
    };

    // ---------- térkép ----------

    const pxTav = (a, b) => E.map.latLngToContainerPoint(a).distanceTo(E.map.latLngToContainerPoint(b));

    // Tapadás a többi kerület pontjaihoz (15 px-en belül)
    const tapad = ll => {
        let legjobb = null, min = 15;
        E.keruletek.forEach(k => {
            if (k.id === E.aktiv || !Array.isArray(k.hatar)) return;
            k.hatar.forEach(p => {
                const d = pxTav(ll, L.latLng(p[1], p[0]));
                if (d < min) { min = d; legjobb = p; }
            });
        });
        return legjobb ? [legjobb[0], legjobb[1]] : [ll.lng, ll.lat];
    };

    // Hová szúrjuk be az új pontot: a legközelebbi oldalba
    const beszurasHelye = p => {
        const n = E.pontok.length;
        if (n < 3) return n;
        const P = E.map.latLngToContainerPoint(L.latLng(p[1], p[0]));
        let best = n, min = Infinity;
        for (let i = 0; i < n; i++) {
            const a = E.map.latLngToContainerPoint(L.latLng(E.pontok[i][1], E.pontok[i][0]));
            const b = E.map.latLngToContainerPoint(L.latLng(E.pontok[(i + 1) % n][1], E.pontok[(i + 1) % n][0]));
            const d = L.LineUtil.pointToSegmentDistance(P, a, b);
            if (d < min) { min = d; best = i + 1; }
        }
        return best;
    };

    const mentes = () => E.tortenet.push(E.pontok.map(p => [...p]));

    const rajzol = () => {

        E.retegek.clearLayers();
        E.szerkReteg.clearLayers();

        E.keruletek.forEach(k => {
            if (k.id === E.aktiv || !Array.isArray(k.hatar) || k.hatar.length < 3) return;
            const szin = Districts.color(k);
            L.polygon(Districts.latlngs(k.hatar), { color: szin, weight: 1.5, fillColor: szin, fillOpacity: 0.08, interactive: false })
                .bindTooltip(esc(CityManager.keruletLabelOf(k)), { permanent: true, direction: "center", className: "districtLabel" })
                .addTo(E.retegek);
        });

        const info = document.getElementById("deInfo");

        if (!E.aktiv) return;

        const k = E.keruletek.find(x => x.id === E.aktiv);
        const szin = Districts.color(k);

        if (E.pontok.length >= 2) {
            const ll = Districts.latlngs(E.pontok);
            (E.pontok.length >= 3 ? L.polygon(ll, { color: szin, weight: 3, fillColor: szin, fillOpacity: 0.18, interactive: false })
                : L.polyline(ll, { color: szin, weight: 3, interactive: false })).addTo(E.szerkReteg);
        }

        E.pontok.forEach((p, idx) => {
            const m = L.marker([p[1], p[0]], {
                draggable: true,
                icon: L.divIcon({ className: "deVertex", html: `<span style="border-color:${szin}"></span>`, iconSize: [14, 14], iconAnchor: [7, 7] })
            }).addTo(E.szerkReteg);

            m.on("dragend", () => {
                mentes();
                E.pontok[idx] = tapad(m.getLatLng());
                E.valtozott = true;
                rajzol();
            });

            m.on("click", ev => {
                L.DomEvent.stopPropagation(ev);
                mentes();
                E.pontok.splice(idx, 1);
                E.valtozott = true;
                rajzol();
            });
        });

        info.innerHTML = `<b>${esc(CityManager.keruletLabelOf(k))}</b> · ${I18n.f("dePoints", { n: E.pontok.length })}` +
            (E.pontok.length > 0 && E.pontok.length < 3 ? ` <span class="text-warning">${I18n.t("deMin3")}</span>` : "");

        document.getElementById("deSave").disabled = !(E.pontok.length >= 3 || (E.pontok.length === 0 && k.hatar));

    };

    const valaszt = id => {

        if (E.valtozott && !confirm(I18n.t("deDiscard"))) return;

        E.aktiv = id;
        const k = E.keruletek.find(x => x.id === id);
        E.pontok = Array.isArray(k.hatar) ? k.hatar.map(p => [...p]) : [];
        E.tortenet = [];
        E.valtozott = false;

        document.getElementById("deTools").hidden = false;
        document.getElementById("deHint").innerText = I18n.t(E.pontok.length ? "deHintEdit" : "deHintNew");

        renderList();
        rajzol();

        if (E.pontok.length >= 3) E.map.fitBounds(L.latLngBounds(Districts.latlngs(E.pontok)), { padding: [40, 40], maxZoom: 16 });

    };

    const ment = () => {

        const k = E.keruletek.find(x => x.id === E.aktiv);
        const hatar = E.pontok.length >= 3 ? E.pontok : null;

        document.getElementById("deSave").disabled = true;

        return fetch(`/api/keruletek/${k.id}/hatar`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hatar })
        })
            .then(r => r.json().then(v => ({ ok: r.ok, v })))
            .then(({ ok, v }) => {
                if (!ok) throw new Error(v.error);
                k.hatar = hatar;
                const g = CityManager.keruletek.find(x => x.id === k.id);
                if (g) g.hatar = hatar;
                E.valtozott = false;
                eredmeny(v);
                renderList();
                rajzol();
                MapManager.dirty = true;
                DataManager.init();
            })
            .catch(() => alert(I18n.t("alertSaveError")))
            .finally(() => { document.getElementById("deSave").disabled = false; });

    };

    const eredmeny = v => {
        document.getElementById("deResult").innerHTML = `<span class="text-success"><i class="fa-solid fa-check"></i> ${I18n.f("deResult", {
            k: v.keruletValtozott || 0, a: v.athelyezve || 0, u: v.ujHely || 0
        })}</span>`;
    };

    // ---------- események ----------

    el.addEventListener("shown.bs.modal", function once() {

        el.removeEventListener("shown.bs.modal", once);

        const kozep = LocationPicker.varosKozep(varos) || LocationPicker.ALAP;

        E.map = L.map("deMap", { doubleClickZoom: false }).setView(kozep, 14);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(E.map);

        E.hirdetesReteg = L.layerGroup().addTo(E.map);
        E.retegek = L.layerGroup().addTo(E.map);
        E.szerkReteg = L.layerGroup().addTo(E.map);

        E.map.getContainer().style.cursor = "crosshair";

        E.map.on("click", e => {
            if (!E.aktiv) {
                document.getElementById("deHint").classList.add("flash");
                setTimeout(() => document.getElementById("deHint").classList.remove("flash"), 600);
                return;
            }
            mentes();
            const p = tapad(e.latlng);
            E.pontok.splice(beszurasHelye(p), 0, p);
            E.valtozott = true;
            rajzol();
        });

        // A város pontos helyű hirdetései halvány pöttyökkel – hogy látszódjon, mi hová esik
        fetch("/api/ingatlanok?city=" + encodeURIComponent(varos))
            .then(r => r.json())
            .then(lista => {
                lista.filter(i => i.x && i.y && i.hely_pontossag !== "kozelito").forEach(i => {
                    L.circleMarker([i.y, i.x], { radius: 3, weight: 0, fillColor: "#334155", fillOpacity: 0.55, interactive: false }).addTo(E.hirdetesReteg);
                });
            })
            .catch(() => { });

        rajzol();

        const van = E.keruletek.filter(k => Array.isArray(k.hatar) && k.hatar.length >= 3);
        if (van.length) E.map.fitBounds(L.latLngBounds(van.flatMap(k => Districts.latlngs(k.hatar))), { padding: [30, 30] });

        setTimeout(() => E.map.invalidateSize(), 100);

    });

    el.addEventListener("hide.bs.modal", function once(ev) {
        if (E.valtozott && !confirm(I18n.t("deDiscard"))) { ev.preventDefault(); return; }
        el.removeEventListener("hide.bs.modal", once);
    });

    el.addEventListener("hidden.bs.modal", function once() {
        el.removeEventListener("hidden.bs.modal", once);
        if (E.map) { E.map.remove(); E.map = null; }
        if (PageManager.current === "admin") AdminManager.renderPlaces();
    });

    document.getElementById("deSave").onclick = ment;

    document.getElementById("deUndo").onclick = () => {
        if (!E.tortenet.length) return;
        E.pontok = E.tortenet.pop();
        E.valtozott = true;
        rajzol();
    };

    document.getElementById("deReset").onclick = () => {
        mentes();
        E.pontok = [];
        E.valtozott = true;
        rajzol();
    };

    document.getElementById("deDelete").onclick = () => {
        const k = E.keruletek.find(x => x.id === E.aktiv);
        if (!confirm(I18n.f("deDeleteConfirm", { nev: CityManager.keruletLabelOf(k) }))) return;
        E.pontok = [];
        ment();
    };

    document.getElementById("deClassify").onclick = () => {
        const b = document.getElementById("deClassify");
        b.disabled = true;
        fetch("/api/keruletek/besorol", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ varos })
        })
            .then(r => r.json())
            .then(v => { eredmeny(v); MapManager.dirty = true; DataManager.init(); })
            .catch(() => alert(I18n.t("alertSaveError")))
            .finally(() => { b.disabled = false; });
    };

    // Ellenőrzés: pontos helyű hirdetések, ahol a kerület nem egyezik a térképpel
    document.getElementById("deCheck").onclick = () => {
        const b = document.getElementById("deCheck");
        const box = document.getElementById("deResult");
        b.disabled = true;
        fetch("/api/keruletek/ellenorzes?varos=" + encodeURIComponent(varos))
            .then(r => r.json())
            .then(v => {
                if (!v.vanHatar) { box.innerHTML = I18n.t("deCheckNoBorders"); return; }
                const nev = n => n ? esc(CityManager.keruletLabel(n, varos)) : "–";
                const sor = x => `<li><a href="#listing/${x.id}" target="_blank" rel="noopener">#${x.id}</a> ${esc((x.cim || "").slice(0, 40))}: ${nev(x.kerulet)}${x.terkep ? ` → <b>${nev(x.terkep)}</b>` : ""}</li>`;
                box.innerHTML = `
                    <div class="${v.elteres.length ? "text-warning-emphasis" : "text-success"}">
                        ${I18n.f("deCheckResult", { n: v.osszes, e: v.elteres.length, k: v.kivulDb })}
                    </div>
                    ${v.elteres.length ? `<div class="small mt-1">${I18n.t("deCheckMismatch")}</div><ul class="small deCheckList">${v.elteres.slice(0, 30).map(sor).join("")}</ul>` : ""}
                    ${v.kivulDb ? `<div class="small mt-1">${I18n.t("deCheckOutside")}</div><ul class="small deCheckList">${v.kivul.slice(0, 15).map(sor).join("")}</ul>` : ""}`;
            })
            .catch(() => { box.innerHTML = I18n.t("alertLoadError"); })
            .finally(() => { b.disabled = false; });
    };

    renderList();
    modal.show();

};
