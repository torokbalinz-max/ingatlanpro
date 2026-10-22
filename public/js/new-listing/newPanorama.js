// ============================================================
//  Hirdetésfeladás: 360°-os körképek (csak az itt feladott hirdetéseknél)
//
//  - Körkép: legalább 1,9 : 1 arányú kép (360°-os kamera, vagy a telefon
//    "Panoráma" / "Photo Sphere" módja). Feltöltés előtt legfeljebb 4096 px
//    szélesre kicsinyítjük – ennél nagyobbat sok telefon nem tud megjeleníteni.
//  - Mindegyiknek adható név (pl. Nappali), a hirdetés oldalán fülek lesznek
//  - Linkkel (más oldalról) feladott és a beolvasott hirdetésnél nem látszik
// ============================================================

class NewPanorama {

    static MAX = 4;
    static SZELES = 4096;
    static lista = [];        // { kind: "new", data, w, h, thumb, cim } | { kind: "saved", id, w, h, cim, eredetiCim }
    static torlendo = [];

    static init() {

        const input = document.getElementById("panoInput");
        const drop = document.getElementById("panoDrop");
        if (!input || !drop) return;

        input.addEventListener("change", () => {
            NewPanorama.hozzaad(input.files);
            input.value = "";
        });

        ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("dragging"); }));
        ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("dragging"); }));
        drop.addEventListener("drop", e => NewPanorama.hozzaad(e.dataTransfer.files));

        NewPanorama.render();

    }

    // Csak az itt (link nélkül) feladott, nem beolvasott hirdetésnél
    static lathato() {
        return NewPropertyManager.isLocal() && NewPropertyManager.editForras !== "import";
    }

    static frissitLathato() {
        const b = document.getElementById("panoBlock");
        if (b) b.hidden = !NewPanorama.lathato();
    }

    static reset() {
        NewPanorama.lista = [];
        NewPanorama.torlendo = [];
        NewPanorama.render();
    }

    static betolt(lista) {
        NewPanorama.lista = (lista || []).map(p => ({ kind: "saved", id: p.id, w: p.w, h: p.h, cim: p.cim || "", eredetiCim: p.cim || "" }));
        NewPanorama.torlendo = [];
        NewPanorama.render();
    }

    static kep(file) {
        return new Promise((ok, hiba) => {
            if (!/^image\/(jpeg|webp)$/.test(file.type)) return hiba(new Error("bad_type"));
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { ok(img); };
            img.onerror = () => { URL.revokeObjectURL(url); hiba(new Error("bad_image")); };
            img.src = url;
        });
    }

    static async hozzaad(files) {

        const hiba = [];

        for (const f of [...files]) {

            if (NewPanorama.lista.length >= NewPanorama.MAX) { hiba.push(I18n.f("panoMax", { n: NewPanorama.MAX })); break; }

            try {
                const img = await NewPanorama.kep(f);
                const w0 = img.naturalWidth, h0 = img.naturalHeight;
                URL.revokeObjectURL(img.src);

                if (!(w0 / h0 >= 1.9)) { hiba.push(I18n.f("panoBadRatio", { nev: f.name })); continue; }

                const arany = Math.min(1, NewPanorama.SZELES / w0);
                const w = Math.round(w0 * arany), h = Math.round(h0 * arany);

                const c = document.createElement("canvas");
                c.width = w; c.height = h;
                c.getContext("2d").drawImage(img, 0, 0, w, h);
                const data = c.toDataURL("image/jpeg", 0.82);

                const t = document.createElement("canvas");
                t.width = 480; t.height = Math.round(480 * h / w);
                t.getContext("2d").drawImage(img, 0, 0, t.width, t.height);

                NewPanorama.lista.push({ kind: "new", data, w, h, thumb: t.toDataURL("image/jpeg", 0.7), cim: "" });
            } catch (e) {
                hiba.push(I18n.f("panoBadFile", { nev: f.name }));
            }

        }

        NewPanorama.render();
        if (hiba.length) alert(hiba.join("\n"));

    }

    static render() {

        const grid = document.getElementById("panoGrid");
        if (!grid) return;

        NewPanorama.frissitLathato();

        const esc = Utils.escape;
        const drop = document.getElementById("panoDrop");
        if (drop) drop.hidden = NewPanorama.lista.length >= NewPanorama.MAX;

        grid.innerHTML = NewPanorama.lista.map((p, n) => `
            <div class="panoItem">
                <div class="panoThumb">
                    <img src="${esc(p.kind === "new" ? p.thumb : "/api/panorama/" + p.id)}" alt="">
                    <span class="panoMark" aria-hidden="true">360°</span>
                    <button type="button" class="panoDel" data-pano-del="${n}" aria-label="${esc(I18n.t("detailDelete"))}" title="${esc(I18n.t("detailDelete"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>
                <label class="visually-hidden" for="panoCim${n}">${I18n.t("panoNameLabel")}</label>
                <input type="text" class="form-control form-control-sm" id="panoCim${n}" data-pano-cim="${n}" maxlength="60" value="${esc(p.cim)}" placeholder="${esc(I18n.t("panoNamePh"))}" autocomplete="off">
            </div>`).join("");

        grid.querySelectorAll("[data-pano-del]").forEach(b => {
            b.onclick = () => {
                const [p] = NewPanorama.lista.splice(Number(b.dataset.panoDel), 1);
                if (p && p.kind === "saved") NewPanorama.torlendo.push(p.id);
                NewPanorama.render();
            };
        });

        grid.querySelectorAll("[data-pano-cim]").forEach(inp => {
            inp.oninput = () => { NewPanorama.lista[Number(inp.dataset.panoCim)].cim = inp.value; };
        });

    }

    // A mentéshez (NewPropertyManager.collect)
    static adat() {
        if (!NewPanorama.lathato()) return {};
        const cimek = {};
        NewPanorama.lista.filter(p => p.kind === "saved" && p.cim !== p.eredetiCim).forEach(p => { cimek[p.id] = p.cim; });
        return {
            panoramak: NewPanorama.lista.filter(p => p.kind === "new").map(p => ({ data: p.data, w: p.w, h: p.h, cim: p.cim })),
            torlendoPanoramak: NewPanorama.torlendo,
            panoramaCimek: cimek
        };
    }

}

document.addEventListener("DOMContentLoaded", () => NewPanorama.init());
