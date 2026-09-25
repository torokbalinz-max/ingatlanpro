class NewPropertyManager {

    static editId = null;

    static init() {

        document.getElementById("btnSave").onclick = () => NewPropertyManager.save();

        document.getElementById("btnCancelNew").onclick = () => {
            NewPropertyManager.editId = null;
            PageManager.show("properties");
        };

        // Élő előnézet: forrás és €/m²
        document.getElementById("ujLink").addEventListener("input", () => NewPropertyManager.updatePreview());
        document.getElementById("ujAr").addEventListener("input", () => NewPropertyManager.updatePreview());
        document.getElementById("ujNm").addEventListener("input", () => NewPropertyManager.updatePreview());

        NewPropertyManager.updatePreview();

    }

    static updatePreview() {

        const forras = Sources.fromLink(document.getElementById("ujLink").value);
        document.getElementById("ujSourcePreview").innerHTML = Sources.badge(forras);

        const ar = Number(document.getElementById("ujAr").value);
        const nm = Number(document.getElementById("ujNm").value);

        document.getElementById("ujArNmPreview").innerText =
            ar > 0 && nm > 0 ? `≈ ${Utils.eurNm(ar / nm)}` : "";

    }

    static updateTitle() {

        const title = document.getElementById("newPageTitle");

        if (NewPropertyManager.editId === null) {
            title.setAttribute("data-i18n", "newTitle");
            title.innerText = I18n.t("newTitle");
        } else {
            title.setAttribute("data-i18n", "editTitle");
            title.innerText = I18n.t("editTitle") + " #" + NewPropertyManager.editId;
        }

    }

    static startEdit(i) {

        NewPropertyManager.editId = i.id;

        document.getElementById("ujLink").value = i.link || "";
        document.getElementById("ujAr").value = i.ar ?? "";
        document.getElementById("ujNm").value = i.nm ?? "";
        document.getElementById("ujSzobak").value = i.szobak ?? "";

        const emelet = String(i.emelet || "").split("/");
        document.getElementById("ujEmelet").value = emelet[0] || "";
        document.getElementById("ujOsszEmelet").value = emelet[1] || "";

        const allapot = Utils.normAllapot(i.allapot);
        const allapotSelect = document.getElementById("ujAllapot");
        allapotSelect.value = allapot;
        if (allapotSelect.value !== allapot) allapotSelect.selectedIndex = 0;

        document.getElementById("ujX").value = i.x ?? "";
        document.getElementById("ujY").value = i.y ?? "";

        const ujVaros = document.getElementById("ujVaros");
        CityManager.fillCitySelect(ujVaros, i.varos || DataManager.currentCity);
        CityManager.loadKeruletek(ujVaros.value, i.kerulet || "");

        NewPropertyManager.updateTitle();
        NewPropertyManager.updatePreview();

        PageManager.show("new");

    }

    static clearForm() {

        ["ujLink", "ujAr", "ujNm", "ujSzobak", "ujEmelet", "ujOsszEmelet", "ujX", "ujY"].forEach(id => {
            document.getElementById(id).value = "";
        });

        document.getElementById("ujAllapot").selectedIndex = 0;

        const ujVaros = document.getElementById("ujVaros");

        if (ujVaros) {
            CityManager.fillCitySelect(ujVaros, DataManager.currentCity);
            CityManager.loadKeruletek(ujVaros.value);
        }

        NewPropertyManager.updateTitle();
        NewPropertyManager.updatePreview();

    }

    static save() {

        const ar = Number(document.getElementById("ujAr").value);
        const nm = Number(document.getElementById("ujNm").value);

        const emelet = document.getElementById("ujEmelet").value.trim();
        const osszEmelet = document.getElementById("ujOsszEmelet").value.trim();

        const adat = {
            link: document.getElementById("ujLink").value.trim(),
            ar,
            nm,
            arNm: ar > 0 && nm > 0 ? ar / nm : 0,
            szobak: Number(document.getElementById("ujSzobak").value) || 0,
            emelet: osszEmelet ? `${emelet}/${osszEmelet}` : emelet,
            allapot: document.getElementById("ujAllapot").value,
            eladva: false,
            x: Number(document.getElementById("ujX").value) || null,
            y: Number(document.getElementById("ujY").value) || null,
            varos: document.getElementById("ujVaros").value,
            kerulet: document.getElementById("ujKerulet").value
        };

        if (!adat.varos) {
            alert(I18n.t("alertNoVaros"));
            return;
        }

        if (!(ar > 0) || !(nm > 0)) {
            alert(I18n.t("alertNoPriceNm"));
            return;
        }

        const edit = NewPropertyManager.editId !== null;

        fetch(edit ? "/api/ingatlanok/" + NewPropertyManager.editId : "/api/ingatlanok", {
            method: edit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(adat)
        })
        .then(r => {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
        })
        .then(() => {

            alert(I18n.t("alertSaveSuccess"));

            NewPropertyManager.editId = null;
            NewPropertyManager.clearForm();

            // Ha más városba mentettünk, arra váltunk
            if (adat.varos !== DataManager.currentCity) {
                DataManager.setCity(adat.varos);
                CityManager.fillCitySelect(document.getElementById("citySelect"), adat.varos);
                CityManager.loadSearchKeruletek(adat.varos);
            }

            DataManager.init();

            PageManager.show("properties");

        })
        .catch(err => {
            console.error(err);
            alert(I18n.t("alertSaveError"));
        });

    }

}
