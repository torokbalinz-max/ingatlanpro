// ============================================================
//  Új hirdetés feladása / szerkesztése
//
//  - Közvetlenül itt feladott hirdetésnél MINDEN adat kötelező,
//    fényképpel együtt (különben nem menthető).
//  - Linkkel megadott hirdetésnél az adatokat a linkről előtöltjük,
//    a képek a forrásoldalról jönnek.
//  - Az admin a jóváhagyásra váró (importált) hirdetéseket is itt
//    javítja ki és hagyja jóvá.
// ============================================================

class NewPropertyManager {

    static editId = null;
    static editStatusz = null;
    static tipus = "lakas";
    static ugylet = "elado";
    static helyPontossag = null;

    // { kind: "new", data } | { kind: "saved", id } | { kind: "ext", url }
    static photos = [];
    static removedPhotoIds = [];

    static MAX_PHOTOS = 15;

    static init() {

        NewPropertyManager.renderTypes();

        document.querySelectorAll('input[name="ujUgylet"]').forEach(r => {
            r.addEventListener("change", () => {
                NewPropertyManager.ugylet = r.value;
                NewPropertyManager.applyType();
            });
        });

        document.getElementById("btnSave").onclick = () => NewPropertyManager.save(false);
        document.getElementById("btnApprove").onclick = () => NewPropertyManager.save(true);

        document.getElementById("btnCancelNew").onclick = () => {
            NewPropertyManager.editId = null;
            PageManager.show(PageManager.lastListPage || "properties");
        };

        document.getElementById("btnScrape").onclick = () => NewPropertyManager.scrape();

        ["ujLink", "ujAr", "ujNm"].forEach(id => {
            document.getElementById(id).addEventListener("input", () => NewPropertyManager.updatePreview());
        });

        document.getElementById("ujLeiras").addEventListener("input", e => {
            document.getElementById("ujLeirasCount").innerText = e.target.value.length;
        });

        // Kitöltött mezőről levesszük a piros jelzést
        document.querySelectorAll("#page-new input, #page-new select, #page-new textarea").forEach(el => {
            el.addEventListener("input", () => el.classList.remove("is-invalid"));
            el.addEventListener("change", () => el.classList.remove("is-invalid"));
        });

        // Képek
        const input = document.getElementById("photoInput");
        const drop = document.getElementById("photoDrop");

        input.addEventListener("change", () => {
            NewPropertyManager.addFiles(input.files);
            input.value = "";
        });

        ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => {
            e.preventDefault();
            drop.classList.add("dragging");
        }));

        ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => {
            e.preventDefault();
            drop.classList.remove("dragging");
        }));

        drop.addEventListener("drop", e => NewPropertyManager.addFiles(e.dataTransfer.files));

        NewPropertyManager.applyType();
        NewPropertyManager.updatePreview();

    }

    static renderTypes() {
        Types.renderGrid("newTypeGrid", NewPropertyManager.tipus, t => {
            NewPropertyManager.tipus = t;
            NewPropertyManager.applyType();
        });
    }

    static applyType() {

        Types.applyFields("#page-new", NewPropertyManager.tipus);

        document.getElementById("ujArLabel").innerText =
            I18n.t(NewPropertyManager.ugylet === "kiado" ? "newArRent" : "newAr");

        document.getElementById("ujNmLabel").innerText =
            I18n.t(NewPropertyManager.tipus === "telek" ? "searchTelekNm" : "newNm");

        // Teleknél a hely nem kötelező ("nincs megadva pontos hely")
        const req = document.getElementById("newHelyReq");
        if (req) req.style.display = NewPropertyManager.tipus === "telek" ? "none" : "";

        // A település-javaslatok nyelv szerint
        const dl = document.getElementById("telepulesLista");
        if (dl) dl.innerHTML = Telepulesek.LISTA.map(t => `<option value="${Utils.escape(I18n.current === "hu" ? t.hu : t.ro)}">`).join("");

        NewPropertyManager.updatePreview();

    }

    static isLocal() {
        return !document.getElementById("ujLink").value.trim();
    }

    static updatePreview() {

        const forras = Sources.fromLink(document.getElementById("ujLink").value);
        document.getElementById("ujSourcePreview").innerHTML = Sources.badge(forras);

        const ar = Number(document.getElementById("ujAr").value);
        const nm = Number(document.getElementById("ujNm").value);

        document.getElementById("ujArNmPreview").innerText =
            ar > 0 && nm > 0 ? `≈ ${Utils.eurNm(ar / nm)}` : "";

        document.getElementById("photoHelp").innerText =
            I18n.t(NewPropertyManager.isLocal() ? "newPhotosHelp" : "newPhotosHelpLink");

    }

    static setLocationInfo(pontossag) {

        NewPropertyManager.helyPontossag = pontossag;

        const box = document.getElementById("newLocationInfo");

        if (!pontossag) {
            box.innerHTML = `<span class="text-danger"><i class="fa-solid fa-location-crosshairs"></i> ${I18n.t("newNoLocation")}</span>`;
        } else if (pontossag === "kozelito") {
            box.innerHTML = `<span class="text-warning-emphasis"><i class="fa-solid fa-triangle-exclamation"></i> ${I18n.t("approxLocationEdit")}</span>`;
        } else {
            box.innerHTML = `<span class="text-success"><i class="fa-solid fa-check"></i> ${I18n.t("newLocationSet")}</span>`;
        }

    }

    // ---------- Képek ----------

    static async addFiles(files) {

        const lista = [...files];

        for (const f of lista) {

            if (NewPropertyManager.photos.length >= NewPropertyManager.MAX_PHOTOS) {
                alert(I18n.t("newPhotosMax"));
                break;
            }

            try {
                const data = await ImageTools.resize(f);
                NewPropertyManager.photos.push({ kind: "new", data });
            } catch (e) {
                console.warn("Kép kihagyva:", f.name, e.message);
            }

        }

        NewPropertyManager.renderPhotos();

    }

    static photoSrc(p) {
        if (p.kind === "new") return p.data;
        if (p.kind === "saved") return "/api/kepek/" + p.id;
        return Utils.imgUrl(p.url);
    }

    static renderPhotos() {

        const grid = document.getElementById("photoGrid");

        grid.innerHTML = NewPropertyManager.photos.map((p, idx) => `
            <div class="photoItem ${idx === 0 ? "cover" : ""}">
                <img src="${Utils.escape(NewPropertyManager.photoSrc(p))}" referrerpolicy="no-referrer" alt="">
                ${idx === 0 ? `<span class="coverBadge">${I18n.t("newPhotoCover")}</span>` : ""}
                ${p.kind === "ext" ? `<span class="extBadge"><i class="fa-solid fa-link"></i></span>` : ""}
                <div class="photoActions">
                    ${idx > 0 ? `<button type="button" data-first="${idx}" title="${I18n.t("newPhotoMakeCover")}"><i class="fa-solid fa-star"></i></button>` : ""}
                    <button type="button" data-del="${idx}" title="${I18n.t("detailDelete")}"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>`).join("");

        grid.querySelectorAll("[data-del]").forEach(b => {
            b.onclick = () => {
                const [p] = NewPropertyManager.photos.splice(Number(b.dataset.del), 1);
                if (p.kind === "saved") NewPropertyManager.removedPhotoIds.push(p.id);
                NewPropertyManager.renderPhotos();
            };
        });

        grid.querySelectorAll("[data-first]").forEach(b => {
            b.onclick = () => {
                const [p] = NewPropertyManager.photos.splice(Number(b.dataset.first), 1);
                NewPropertyManager.photos.unshift(p);
                NewPropertyManager.renderPhotos();
            };
        });

    }

    // ---------- Link beolvasása ----------

    static scrape() {

        const url = document.getElementById("ujLink").value.trim();
        const box = document.getElementById("scrapeResult");

        if (!/^https?:\/\//i.test(url)) {
            box.innerHTML = `<div class="alert alert-warning py-2 small">${I18n.t("scrapeBadUrl")}</div>`;
            return;
        }

        const btn = document.getElementById("btnScrape");
        btn.disabled = true;

        box.innerHTML = `<div class="alert alert-info py-2 small"><span class="spinner-border spinner-border-sm"></span> ${I18n.t("scrapeLoading")}</div>`;

        fetch("/api/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, varos: document.getElementById("ujVaros").value })
        })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {

            if (!ok) throw new Error(d.message || d.error);

            NewPropertyManager.fillFromScrape(d);

        })
        .catch(err => {
            box.innerHTML = `<div class="alert alert-danger py-2 small">${I18n.t("scrapeFailed")} (${Utils.escape(err.message)})</div>`;
        })
        .finally(() => { btn.disabled = false; });

    }

    static fillFromScrape(d) {

        const talalt = [];

        const tolt = (id, value, field) => {
            if (value === null || value === undefined || value === "") return;
            const el = document.getElementById(id);
            el.value = value;
            el.classList.remove("is-invalid");
            talalt.push(field);
        };

        if (d.tipus) {
            NewPropertyManager.tipus = d.tipus;
            NewPropertyManager.renderTypes();
        }

        if (d.ugylet) {
            NewPropertyManager.ugylet = d.ugylet;
            document.getElementById(d.ugylet === "kiado" ? "ujUgyletKiado" : "ujUgyletElado").checked = true;
        }

        tolt("ujCim", d.cim, "cim");
        tolt("ujAr", d.ar, "ar");
        tolt("ujNm", d.nm, "nm");
        tolt("ujTelekNm", d.telek_nm, "telek_nm");
        tolt("ujSzobak", d.szobak, "szobak");
        tolt("ujLeiras", d.leiras, "leiras");

        if (d.emelet) {
            const [e, ossz] = String(d.emelet).split("/");
            tolt("ujEmelet", e, "emelet");
            if (ossz) document.getElementById("ujOsszEmelet").value = ossz;
        }

        if (d.allapot) tolt("ujAllapot", d.allapot, "allapot");

        if (d.keruletNev) tolt("ujKerulet", d.keruletNev, "kerulet");
        if (d.telepules) tolt("ujTelepules", CityManager.telepulesLabel(d.telepules), "telepules");

        NewPropertyManager.forrasSzoveg = d.forrasSzoveg || null;

        document.getElementById("ujLeirasCount").innerText = document.getElementById("ujLeiras").value.length;

        if (d.x && d.y) {
            NewPropertyMap.setPoint(d.x, d.y, ["kozelito", "utca"].includes(d.hely_pontossag) ? d.hely_pontossag : "pontos");
            talalt.push("hely");
        }

        // A forrásoldal képei (csak linkként, nem másoljuk le őket)
        (d.kulso_kepek || []).forEach(url => {
            if (NewPropertyManager.photos.length < NewPropertyManager.MAX_PHOTOS &&
                !NewPropertyManager.photos.some(p => p.url === url)) {
                NewPropertyManager.photos.push({ kind: "ext", url });
            }
        });

        NewPropertyManager.renderPhotos();
        NewPropertyManager.applyType();

        const hianyzo = NewPropertyManager.missing(NewPropertyManager.collect()).filter(m => m !== "kepek");

        document.getElementById("scrapeResult").innerHTML = `
            <div class="alert ${hianyzo.length ? "alert-warning" : "alert-success"} py-2 small">
                <b>${I18n.f("scrapeFound", { n: talalt.length })}</b>
                ${talalt.map(m => `<span class="badge text-bg-success">${I18n.t("field_" + m)}</span>`).join(" ")}
                ${hianyzo.length ? `<div class="mt-1">${I18n.t("scrapeMissing")}: ${hianyzo.map(m => `<span class="badge text-bg-warning">${I18n.t("field_" + m)}</span>`).join(" ")}</div>` : ""}
                ${d.hely_pontossag === "kozelito" ? `<div class="mt-1">${I18n.t("approxLocationEdit")}</div>` : ""}
                <div class="mt-1 text-body-secondary">${I18n.t("scrapeCheck")}</div>
            </div>`;

        NewPropertyManager.markMissing(hianyzo);

    }

    // ---------- Adatok ----------

    static collect() {

        const v = id => document.getElementById(id).value.trim();

        const emelet = v("ujEmelet");
        const ossz = v("ujOsszEmelet");

        return {
            tipus: NewPropertyManager.tipus,
            ugylet: NewPropertyManager.ugylet,
            link: v("ujLink"),
            cim: v("ujCim"),
            leiras: v("ujLeiras"),
            ar: Number(v("ujAr")) || null,
            nm: Number(v("ujNm")) || null,
            telek_nm: Number(v("ujTelekNm")) || null,
            szobak: Number(v("ujSzobak")) || null,
            emelet: emelet === "" ? "" : (ossz ? `${emelet}/${ossz}` : emelet),
            allapot: v("ujAllapot"),
            x: Number(v("ujX")) || null,
            y: Number(v("ujY")) || null,
            hely_pontossag: NewPropertyManager.helyPontossag,
            varos: v("ujVaros"),
            kerulet: v("ujKerulet"),
            telepules: NewPropertyManager.telepulesErtek(v("ujTelepules")),
            eladva: false,
            kulso_kepek: NewPropertyManager.photos.filter(p => p.kind === "ext").map(p => p.url),
            kepek: NewPropertyManager.photos.filter(p => p.kind === "new").map(p => p.data),
            torlendoKepek: NewPropertyManager.removedPhotoIds,
            forras_szoveg: NewPropertyManager.forrasSzoveg || null
        };

    }

    // A beírt (magyar vagy román) településnévből a tárolt román név
    static telepulesErtek(nev) {
        if (!nev) return "";
        const t = Telepulesek.keres(nev);
        return t ? t.ro : nev;
    }

    // Ugyanaz a szabály, mint a szerveren (listing.js)
    static missing(d) {

        const f = Types.get(d.tipus).fields;
        const h = [];
        const local = !d.link;

        if (local && !d.cim) h.push("cim");
        if (!(d.ar > 0)) h.push("ar");
        if (!(d.nm > 0)) h.push("nm");
        if (f.telek && !(d.telek_nm > 0)) h.push("telek_nm");
        if (f.szobak && d.tipus !== "kereskedelmi" && !(d.szobak > 0)) h.push("szobak");
        if (f.emelet && d.emelet === "") h.push("emelet");
        if (f.allapot && !d.allapot) h.push("allapot");
        if (!d.varos) h.push("varos");

        const keruletSelect = document.getElementById("ujKerulet");
        if (f.kerulet && !d.kerulet && keruletSelect.options.length > 1) h.push("kerulet");

        if (local && (!d.leiras || d.leiras.length < 20)) h.push("leiras");
        if (local && d.tipus !== "telek" && !(d.x && d.y)) h.push("hely");

        const kepDb = NewPropertyManager.photos.filter(p => p.kind !== "ext").length;
        if (local && kepDb === 0) h.push("kepek");

        return h;

    }

    static FIELD_EL = {
        cim: "ujCim", ar: "ujAr", nm: "ujNm", telek_nm: "ujTelekNm", szobak: "ujSzobak",
        emelet: "ujEmelet", allapot: "ujAllapot", varos: "ujVaros", kerulet: "ujKerulet",
        leiras: "ujLeiras", hely: "newMap", kepek: "photoDrop"
    };

    static markMissing(lista) {

        Object.values(NewPropertyManager.FIELD_EL).forEach(id => {
            document.getElementById(id).classList.remove("is-invalid");
        });

        lista.forEach(m => {
            const id = NewPropertyManager.FIELD_EL[m];
            if (id) document.getElementById(id).classList.add("is-invalid");
        });

    }

    static showMissing(lista) {

        const box = document.getElementById("newMissingAlert");

        if (!lista.length) {
            box.style.display = "none";
            return;
        }

        box.style.display = "";
        box.innerHTML = `<b><i class="fa-solid fa-circle-exclamation"></i> ${I18n.t("newMissingTitle")}</b> ` +
            lista.map(m => `<span class="badge text-bg-danger">${I18n.t("field_" + m)}</span>`).join(" ");

        NewPropertyManager.markMissing(lista);

        box.scrollIntoView({ behavior: "smooth", block: "center" });

    }

    // ---------- Szerkesztés ----------

    static updateTitle() {

        const title = document.getElementById("newPageTitle");
        const approve = document.getElementById("btnApprove");

        if (NewPropertyManager.editId === null) {
            title.innerText = I18n.t("newTitle");
            approve.style.display = "none";
        } else {
            title.innerText = I18n.t("editTitle") + " #" + NewPropertyManager.editId;
            approve.style.display = NewPropertyManager.editStatusz === "fuggo" ? "" : "none";
        }

        const info = document.getElementById("newPendingInfo");
        info.style.display = NewPropertyManager.editStatusz === "fuggo" && NewPropertyManager.editId !== null ? "" : "none";
        info.innerHTML = `<i class="fa-solid fa-inbox"></i> ${I18n.t("newPendingInfo")}`;

    }

    static startEdit(ingatlan) {

        return fetch("/api/ingatlanok/" + ingatlan.id)
            .then(r => r.json())
            .then(i => {

                NewPropertyManager.clearForm();

                NewPropertyManager.editId = i.id;
                NewPropertyManager.editStatusz = i.statusz;
                NewPropertyManager.tipus = i.tipus || "lakas";
                NewPropertyManager.ugylet = i.ugylet || "elado";

                NewPropertyManager.renderTypes();
                document.getElementById(NewPropertyManager.ugylet === "kiado" ? "ujUgyletKiado" : "ujUgyletElado").checked = true;

                const set = (id, v) => { document.getElementById(id).value = v ?? ""; };

                set("ujLink", i.link);
                set("ujCim", i.cim);
                set("ujLeiras", i.leiras);
                set("ujAr", i.ar);
                set("ujNm", i.nm);
                set("ujTelekNm", i.telek_nm);
                set("ujSzobak", i.szobak);
                set("ujTelepules", i.telepules ? CityManager.telepulesLabel(i.telepules) : "");

                const emelet = String(i.emelet ?? "").split("/");
                set("ujEmelet", emelet[0]);
                set("ujOsszEmelet", emelet[1]);

                const allapot = Utils.normAllapot(i.allapot);
                const sel = document.getElementById("ujAllapot");
                sel.value = allapot;
                if (sel.value !== allapot) sel.value = "";

                document.getElementById("ujLeirasCount").innerText = (i.leiras || "").length;

                NewPropertyManager.photos = [
                    ...(i.kepek || []).map(id => ({ kind: "saved", id })),
                    ...(i.kulso_kepek || []).map(url => ({ kind: "ext", url }))
                ];

                NewPropertyManager.renderPhotos();

                const ujVaros = document.getElementById("ujVaros");
                CityManager.fillCitySelect(ujVaros, i.varos || DataManager.currentCity);
                CityManager.loadKeruletek(ujVaros.value, i.kerulet || "");

                NewPropertyManager.updateTitle();
                NewPropertyManager.applyType();

                PageManager.show("new");

                setTimeout(() => {
                    NewPropertyMap.setPoint(i.x, i.y, i.hely_pontossag || (i.x && i.y ? "pontos" : null));
                    if (Array.isArray(i.hianyzo) && i.hianyzo.length) NewPropertyManager.markMissing(i.hianyzo);
                }, 350);

            });

    }

    static clearForm() {

        ["ujLink", "ujCim", "ujLeiras", "ujAr", "ujNm", "ujTelekNm", "ujSzobak", "ujEmelet", "ujOsszEmelet", "ujX", "ujY", "ujTelepules"].forEach(id => {
            document.getElementById(id).value = "";
        });

        document.getElementById("ujAllapot").value = "";
        document.getElementById("ujLeirasCount").innerText = "0";
        document.getElementById("scrapeResult").innerHTML = "";
        document.getElementById("newMissingAlert").style.display = "none";

        NewPropertyManager.editStatusz = null;
        NewPropertyManager.forrasSzoveg = null;
        NewPropertyManager.photos = [];
        NewPropertyManager.removedPhotoIds = [];
        NewPropertyManager.renderPhotos();

        // Alapból a keresésben kiválasztott típus
        NewPropertyManager.tipus = FilterManager.tipus || "lakas";
        NewPropertyManager.ugylet = FilterManager.ugylet || "elado";
        NewPropertyManager.renderTypes();
        document.getElementById(NewPropertyManager.ugylet === "kiado" ? "ujUgyletKiado" : "ujUgyletElado").checked = true;

        const ujVaros = document.getElementById("ujVaros");

        if (ujVaros) {
            CityManager.fillCitySelect(ujVaros, DataManager.currentCity);
            CityManager.loadKeruletek(ujVaros.value);
        }

        NewPropertyMap.setPoint(null, null);
        NewPropertyManager.markMissing([]);

        NewPropertyManager.updateTitle();
        NewPropertyManager.applyType();

    }

    // ---------- Mentés ----------

    static save(jovahagy) {

        const d = NewPropertyManager.collect();
        const edit = NewPropertyManager.editId !== null;

        // Új hirdetésnél (és nem admin szerkesztésnél) minden kötelező adat kell
        if (!edit) {

            const hianyzo = NewPropertyManager.missing(d);

            if (hianyzo.length) {
                NewPropertyManager.showMissing(hianyzo);
                return;
            }

        }

        if (jovahagy) d.jovahagy = true;

        const btns = [document.getElementById("btnSave"), document.getElementById("btnApprove")];
        btns.forEach(b => { b.disabled = true; });

        fetch(edit ? "/api/ingatlanok/" + NewPropertyManager.editId : "/api/ingatlanok", {
            method: edit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(d)
        })
        .then(r => r.json().then(v => ({ ok: r.ok, status: r.status, v })))
        .then(({ ok, status, v }) => {

            if (!ok) {
                if (v.error === "missing_fields") {
                    NewPropertyManager.showMissing(v.hianyzo || []);
                    return;
                }
                if (status === 403) {
                    alert(I18n.t("alertAdminOnly"));
                    return;
                }
                throw new Error(v.message || v.error || ("HTTP " + status));
            }

            if (v.hianyzo && v.hianyzo.length) {
                alert(I18n.t("alertSavedIncomplete") + "\n" + v.hianyzo.map(m => "• " + I18n.t("field_" + m)).join("\n"));
            } else {
                alert(I18n.t("alertSaveSuccess"));
            }

            const ujId = v.id || NewPropertyManager.editId;

            NewPropertyManager.editId = null;
            NewPropertyManager.clearForm();

            if (d.varos !== DataManager.currentCity) {
                DataManager.setCity(d.varos);
                CityManager.fillCitySelect(document.getElementById("citySelect"), d.varos);
                CityManager.loadSearchKeruletek(d.varos);
            }

            DataManager.init();

            if (typeof AdminManager !== "undefined") AdminManager.refreshPendingCount();

            if (ujId) ListingPage.open(ujId);
            else PageManager.show("properties");

        })
        .catch(err => {
            console.error(err);
            alert(I18n.t("alertSaveError") + "\n" + err.message);
        })
        .finally(() => btns.forEach(b => { b.disabled = false; }));

    }

}
