// ============================================================
//  Admin – Ellenőrzésre váró hirdetések (egyszerre egy, gyors javítás)
// ============================================================

//  Egyszerre egy hirdetés: bal oldalon a mi adataink (azonnal
//  javíthatók), jobb oldalon a forrásoldal szövege és képei –
//  nem kell a hirdetési oldalak között ugrálni.

AdminManager.renderReview = function () {

    AdminManager.loading();

    fetch("/api/admin/review")
        .then(r => r.json())
        .then(lista => {

            DataManager.prepare(lista);

            AdminManager.reviewList = lista;

            if (AdminManager.reviewFocusId) {
                const idx = lista.findIndex(i => i.id === AdminManager.reviewFocusId);
                AdminManager.reviewIdx = idx >= 0 ? idx : 0;
                AdminManager.reviewFocusId = null;
            } else {
                AdminManager.reviewIdx = Math.min(AdminManager.reviewIdx, Math.max(lista.length - 1, 0));
            }

            AdminManager.setCount("pendingCount", lista.length); AdminManager.setCount("navAdminCount", lista.length);

            AdminManager.renderReviewItem();

        });

};

AdminManager.reviewFiltered = function () {

    const f = AdminManager.reviewFilter;
    const t = AdminManager.reviewTipus || "";

    return AdminManager.reviewList.filter(i => {
        if (t && (i.tipus || "lakas") !== t) return false;
        const h = (i.hianyzo || []).length;
        const p = (i.problemak || []).length;
        if (f === "missing") return h > 0;
        if (f === "suspicious") return p > 0;
        return true;
    });

};

AdminManager.renderReviewItem = function () {

    const lista = AdminManager.reviewFiltered();
    const box = AdminManager.box();

    if (!lista.length) {
        box.innerHTML = AdminManager.reviewToolbar(0) + `
            <div class="emptyState">
                <i class="fa-solid fa-circle-check text-success"></i>
                <h5>${I18n.t("reviewEmpty")}</h5>
                <p>${I18n.t("reviewEmptyHint")}</p>
            </div>`;
        AdminManager.bindReviewToolbar();
        return;
    }

    AdminManager.reviewIdx = Math.max(0, Math.min(AdminManager.reviewIdx, lista.length - 1));

    const i = lista[AdminManager.reviewIdx];
    const t = Types.get(i.tipus);
    const hianyzo = i.hianyzo || [];
    const prob = i.problemak || [];
    const emelet = String(i.emelet ?? "").split("/");

    const kepek = [
        ...(i.kep_id ? ["/api/kepek/" + i.kep_id] : []),
        ...(i.kulso_kepek || []).map(Utils.imgUrl)
    ].slice(0, 6);

    const mezo = (key, label, input) => `
        <div class="col-6 col-md-4 ${hianyzo.includes(key) ? "revMissing" : ""}" data-field="${key}">
            <label class="form-label">${label}</label>
            ${input}
        </div>`;

    const num = (id, v) => `<input type="number" class="form-control" id="${id}" value="${v ?? ""}">`;

    const forrasSzoveg = Utils.escape(i.forras_szoveg || i.leiras || I18n.t("reviewNoSource"))
        .replace(/(\d[\d.,\s]*\s*(?:€|EUR|lei|mp|m²|m2|nm|ari|ha|hectare?|camere|cam\.?))(?![a-z])/gi, "<mark>$1</mark>")
        .replace(/(Etaj[^.\n]{0,12}|Nr\.? ?cam[^:]*:|Sup[^:]{0,25}:|An constr[^:]*:)/gi, "<b>$1</b>");

    box.innerHTML = AdminManager.reviewToolbar(lista.length) + `

        <div class="row g-4">

            <div class="col-xl-8">

                <div class="card mb-3">
                    <div class="card-body">

                        <div class="d-flex flex-wrap justify-content-between gap-2 mb-2">
                            <div>
                                <h5 class="mb-1">${Utils.escape(i.cim || Types.label(i.tipus))}</h5>
                                <div class="small text-body-secondary">#${i.id} · ${Utils.escape(CityManager.displayName(i.varos))} · ${(i.forrasok || [i.forras]).map(Sources.badge).join(" ")}</div>
                            </div>
                            <div class="text-end">
                                <div class="fw-bold fs-5 text-success">${Utils.price(i)}</div>
                                <div class="small text-body-secondary">${Utils.arNm(i) ? Utils.eurNm(Utils.arNm(i)) : ""}</div>
                            </div>
                        </div>

                        ${hianyzo.length || prob.length ? `
                            <div class="revIssues mb-3">
                                ${hianyzo.map(m => `<span class="badge text-bg-warning"><i class="fa-solid fa-circle-question"></i> ${I18n.t("missingFields")}: ${I18n.t("field_" + m)}</span>`).join(" ")}
                                ${prob.map(m => `<span class="badge text-bg-danger"><i class="fa-solid fa-triangle-exclamation"></i> ${I18n.t("prob_" + m)}</span>`).join(" ")}
                            </div>` : ""}

                        <div class="row g-3">
                            <div class="col-6 col-md-4">
                                <label class="form-label">${I18n.t("typeLabel")}</label>
                                <select class="form-select" id="rvTipus">${AdminManager.typeOptions(i.tipus)}</select>
                            </div>
                            <div class="col-6 col-md-4">
                                <label class="form-label">${I18n.t("ugyletLabel")}</label>
                                <select class="form-select" id="rvUgylet">
                                    <option value="elado">${I18n.t("ugyletElado")}</option>
                                    <option value="kiado" ${i.ugylet === "kiado" ? "selected" : ""}>${I18n.t("ugyletKiado")}</option>
                                </select>
                            </div>
                            ${mezo("ar", I18n.t(i.ugylet === "kiado" ? "newArRent" : "newAr"), num("rvAr", i.ar))}
                            ${mezo("nm", I18n.t("newNm"), num("rvNm", i.nm))}
                            ${t.fields.szobak ? mezo("szobak", I18n.t("newSzobak"), num("rvSzobak", i.szobak)) : ""}
                            ${t.fields.emelet ? mezo("emelet", I18n.t("newEmelet") + " / " + I18n.t("newOsszEmelet").toLowerCase(), `
                                <div class="input-group">
                                    <input class="form-control" id="rvEmelet" value="${Utils.escape(emelet[0] || "")}">
                                    <span class="input-group-text">/</span>
                                    <input class="form-control" id="rvOssz" value="${Utils.escape(emelet[1] || "")}">
                                </div>`) : ""}
                            ${t.fields.telek ? mezo("telek_nm", I18n.t("newTelekNm"), num("rvTelek", i.telek_nm)) : ""}
                            ${t.fields.allapot ? mezo("allapot", I18n.t("newAllapot"), `
                                <select class="form-select" id="rvAllapot">
                                    <option value="">${I18n.t("chooseOne")}</option>
                                    ${["felújítandó", "részbenfel", "jó", "újszerű", "luxus"].map(a => `<option value="${a}" ${Utils.normAllapot(i.allapot) === a ? "selected" : ""}>${Utils.allapotLabel(a)}</option>`).join("")}
                                </select>`) : ""}
                            ${t.fields.kerulet ? mezo("kerulet", I18n.t("newKerulet"), `
                                <select class="form-select" id="rvKerulet"><option value="">${I18n.t("newKeruletNincs")}</option></select>
                                ${i.forras_kerulet ? `<div class="form-text">${I18n.f("reviewSourceDistrict", { nev: Utils.escape(i.forras_kerulet) })}</div>` : ""}`) : ""}
                            ${t.fields.jelleg ? mezo("telek_jelleg", I18n.t("telekJellegLabel"), `
                                <div class="btn-group btn-group-sm w-100 jellegSwitch" role="group">
                                    <input type="radio" class="btn-check" name="rvJelleg" id="rvJelBel" value="belterulet" ${i.telek_jelleg === "belterulet" ? "checked" : ""}>
                                    <label class="btn btn-outline-primary" for="rvJelBel">${I18n.t("jelleg_belterulet")}</label>
                                    <input type="radio" class="btn-check" name="rvJelleg" id="rvJelKul" value="kulterulet" ${i.telek_jelleg === "kulterulet" ? "checked" : ""}>
                                    <label class="btn btn-outline-primary" for="rvJelKul">${I18n.t("jelleg_kulterulet")}</label>
                                </div>`) : ""}
                            ${t.fields.telepules ? mezo("telepules", I18n.t("telepulesLabel"), `
                                <input class="form-control" id="rvTelepules" list="telepulesLista" autocomplete="off" placeholder="${Utils.escape(I18n.t("telepulesPh"))}" value="${Utils.escape(i.telepules ? CityManager.telepulesLabel(i.telepules) : "")}">
                                ${i.forras_kerulet ? `<div class="form-text">${I18n.f("reviewSourceDistrict", { nev: Utils.escape(i.forras_kerulet) })}</div>` : ""}`) : ""}
                            <div class="col-12">
                                <label class="form-label">${I18n.t("newCim")}</label>
                                <input class="form-control" id="rvCim" value="${Utils.escape(i.cim || "")}">
                            </div>
                        </div>

                        <div class="mt-3 ${hianyzo.includes("hely") ? "revMissing" : ""}" data-field="hely">
                            <label class="form-label">${I18n.t("newHely")} ${Utils.helyBadge(i)}</label>
                            <div id="reviewLoc" class="locPicker"></div>
                        </div>

                        <div id="aiResult" class="mt-3"></div>

                        <div class="d-flex flex-wrap gap-2 mt-3">
                            <button class="btn btn-success" id="rvApprove"><i class="fa-solid fa-check"></i> ${I18n.t("reviewApprove")} <kbd>Enter</kbd></button>
                            <button class="btn btn-outline-secondary" id="rvRefresh"><i class="fa-solid fa-rotate"></i> ${I18n.t("reviewRefresh")}</button>
                            ${AdminManager.aiElerheto ? `<button class="btn btn-outline-primary" id="rvAi"><i class="fa-solid fa-robot"></i> ${I18n.t("reviewAi")}</button>` : ""}
                            <button class="btn btn-outline-secondary" id="rvFull"><i class="fa-solid fa-pen-to-square"></i> ${I18n.t("reviewFullEdit")}</button>
                            <button class="btn btn-outline-danger ms-auto" id="rvDelete"><i class="fa-solid fa-trash"></i></button>
                        </div>

                    </div>
                </div>

            </div>

            <div class="col-xl-4">

                ${kepek.length ? `
                    <div class="revPhotos mb-3">
                        ${kepek.map(k => `<img src="${Utils.escape(k)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">`).join("")}
                    </div>` : `<div class="alert alert-light small">${I18n.t("noPhotos")}</div>`}

                <div class="card">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h6 class="mb-0"><i class="fa-solid fa-file-lines"></i> ${I18n.t("reviewSourceText")}</h6>
                        ${i.link ? `<a class="btn btn-sm btn-outline-primary" href="${Utils.escape(i.link)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${I18n.t("reviewOpenSource")}</a>` : ""}
                    </div>
                    <div class="card-body">
                        <div class="revSource">${forrasSzoveg}</div>
                    </div>
                </div>

            </div>

        </div>`;

    AdminManager.bindReviewToolbar();
    AdminManager.bindReviewItem(i);

};

AdminManager.reviewToolbar = function (db) {

    const tipusDb = t => AdminManager.reviewList.filter(i => !t || (i.tipus || "lakas") === t).length;
    const aktTipus = AdminManager.reviewTipus || "";

    return `
        <div class="typeTabs mb-3" role="tablist">
            ${[{ key: "", icon: "fa-solid fa-layer-group", label: "reviewAllTypes" }, ...Types.LIST].map(t => {
                const n = tipusDb(t.key);
                if (t.key && !n) return "";
                return `<button type="button" role="tab" class="typeTab ${aktTipus === t.key ? "active" : ""}" data-rvtipus="${t.key}" aria-selected="${aktTipus === t.key}">
                    <i class="${t.icon}" aria-hidden="true"></i> ${I18n.t(t.label)} <span class="typeTabCount">${n}</span></button>`;
            }).join("")}
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
            <select class="form-select" style="width:auto;" id="rvFilter">
                <option value="all" ${AdminManager.reviewFilter === "all" ? "selected" : ""}>${I18n.t("reviewFilterAll")}</option>
                <option value="missing" ${AdminManager.reviewFilter === "missing" ? "selected" : ""}>${I18n.t("reviewFilterMissing")}</option>
                <option value="suspicious" ${AdminManager.reviewFilter === "suspicious" ? "selected" : ""}>${I18n.t("reviewFilterSuspicious")}</option>
            </select>
            <span class="text-body-secondary small">${I18n.f("reviewCount", { n: db })}</span>
            ${db ? `
                <div class="btn-group btn-group-sm ms-auto">
                    <button class="btn btn-outline-secondary" id="rvPrev"><i class="fa-solid fa-chevron-left"></i></button>
                    <span class="btn btn-outline-secondary disabled">${AdminManager.reviewIdx + 1} / ${db}</span>
                    <button class="btn btn-outline-secondary" id="rvNext"><i class="fa-solid fa-chevron-right"></i></button>
                </div>` : ""}
        </div>
        <p class="sectionNote">${I18n.t("reviewKeysHint")}</p>`;

};

AdminManager.bindReviewToolbar = function () {

    const f = document.getElementById("rvFilter");

    document.querySelectorAll("[data-rvtipus]").forEach(b => {
        b.onclick = () => {
            AdminManager.reviewTipus = b.dataset.rvtipus;
            AdminManager.reviewIdx = 0;
            AdminManager.renderReviewItem();
        };
    });

    f.onchange = () => {
        AdminManager.reviewFilter = f.value;
        AdminManager.reviewIdx = 0;
        AdminManager.renderReviewItem();
    };

    const prev = document.getElementById("rvPrev");
    const next = document.getElementById("rvNext");

    if (prev) prev.onclick = () => AdminManager.reviewStep(-1);
    if (next) next.onclick = () => AdminManager.reviewStep(1);

};

AdminManager.reviewStep = function (d) {
    const n = AdminManager.reviewFiltered().length;
    if (!n) return;
    AdminManager.reviewIdx = (AdminManager.reviewIdx + d + n) % n;
    AdminManager.renderReviewItem();
};

// Az űrlap adatai a mentéshez (a teljes hirdetés + a javított mezők)
AdminManager.reviewCollect = function (i) {

    const v = id => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : null;
    };

    const tipus = v("rvTipus");
    const emelet = v("rvEmelet");
    const ossz = v("rvOssz");

    const hely = AdminManager.reviewLoc ? AdminManager.reviewLoc.get() : {};
    const jelleg = document.querySelector('input[name="rvJelleg"]:checked');

    return {
        ...i,
        kepek: [],
        tipus,
        ugylet: v("rvUgylet"),
        cim: v("rvCim"),
        ar: Number(v("rvAr")) || null,
        nm: Number(v("rvNm")) || null,
        szobak: v("rvSzobak") !== null ? (Number(v("rvSzobak")) || null) : i.szobak,
        emelet: emelet !== null ? (ossz ? `${emelet}/${ossz}` : emelet) : i.emelet,
        telek_nm: v("rvTelek") !== null ? (Number(v("rvTelek")) || null) : i.telek_nm,
        allapot: v("rvAllapot") !== null ? v("rvAllapot") : i.allapot,
        kerulet: v("rvKerulet"),
        telepules: v("rvTelepules") !== null ? NewPropertyManager.telepulesErtek(v("rvTelepules")) : i.telepules,
        telek_jelleg: jelleg ? jelleg.value : i.telek_jelleg,
        x: hely.x !== undefined ? hely.x : i.x,
        y: hely.y !== undefined ? hely.y : i.y,
        hely_pontossag: hely.hely_pontossag || i.hely_pontossag,
        hely_sugar: hely.hely_sugar !== undefined ? hely.hely_sugar : i.hely_sugar
    };

};

AdminManager.bindReviewItem = function (i) {

    // Kerületek
    if (document.getElementById("rvKerulet")) {
        CityManager.loadKeruletekInto("rvKerulet", i.varos, i.kerulet || "", "newKeruletNincs");
    }

    // Térkép: pontos hely (jelölő) vagy közelítő hely (kör). A pont
    // mozgatásakor a kerületet is megkeressük (ha még nincs megadva).
    if (AdminManager.reviewLoc) {
        AdminManager.reviewLoc.remove();
        AdminManager.reviewLoc = null;
    }

    AdminManager.reviewLoc = new LocationPicker("reviewLoc", {
        x: i.x, y: i.y,
        pontossag: i.hely_pontossag,
        sugar: i.hely_sugar,
        onPoint: (x, y) => {
            const sel = document.getElementById("rvKerulet");
            if (!sel || sel.value) return;
            LocationPicker.keruletJavaslat(i.varos, x, y).then(k => {
                if (k && !sel.value) {
                    sel.value = k;
                    sel.classList.add("autoFilled");
                }
            });
        }
    });

    // Gombok
    const ment = () => {

        const d = AdminManager.reviewCollect(i);
        d.jovahagy = true;

        return fetch("/api/ingatlanok/" + i.id, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(d)
        })
        .then(r => r.json().then(v => ({ ok: r.ok, v })))
        .then(({ ok, v }) => {

            if (!ok) {
                alert(I18n.t("newMissingTitle") + " " + (v.hianyzo || []).map(m => I18n.t("field_" + m)).join(", "));
                return;
            }

            // Kész: kivesszük a listából, jön a következő
            AdminManager.reviewList = AdminManager.reviewList.filter(x => x.id !== i.id);
            AdminManager.setCount("pendingCount", AdminManager.reviewList.length); AdminManager.setCount("navAdminCount", AdminManager.reviewList.length);
            AdminManager.renderReviewItem();
            DataManager.init();

        });

    };

    document.getElementById("rvApprove").onclick = ment;

    document.getElementById("rvFull").onclick = () => NewPropertyManager.startEdit(i);

    document.getElementById("rvDelete").onclick = () => {
        if (!confirm(I18n.t("alertConfirmDelete"))) return;
        fetch("/api/ingatlanok/" + i.id, { method: "DELETE" }).then(() => {
            AdminManager.reviewList = AdminManager.reviewList.filter(x => x.id !== i.id);
            AdminManager.renderReviewItem();
            DataManager.init();
        });
    };

    document.getElementById("rvRefresh").onclick = () => {

        const btn = document.getElementById("rvRefresh");
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> ${I18n.t("reviewRefreshing")}`;

        fetch(`/api/admin/listing/${i.id}/refresh`, { method: "POST" })
            .then(r => r.json())
            .then(v => {
                const n = (v.naplo || [])[0];
                if (n && n.eredmeny === "nem_elerheto") alert(I18n.t("reviewNowUnavailable"));
                return fetch("/api/ingatlanok/" + i.id).then(r => r.json());
            })
            .then(uj => {
                DataManager.prepare([uj]);
                const idx = AdminManager.reviewList.findIndex(x => x.id === i.id);
                if (uj.statusz === "nem_elerheto" || uj.ellenorzott) {
                    AdminManager.reviewList.splice(idx, 1);
                } else if (idx >= 0) {
                    AdminManager.reviewList[idx] = { ...AdminManager.reviewList[idx], ...uj };
                }
                AdminManager.renderReviewItem();
            })
            .catch(err => {
                alert(I18n.t("scrapeFailed") + " " + err.message);
                btn.disabled = false;
            });

    };

    const aiBtn = document.getElementById("rvAi");

    if (aiBtn) aiBtn.onclick = () => {

        aiBtn.disabled = true;
        const box = document.getElementById("aiResult");
        box.innerHTML = `<div class="alert alert-info small py-2"><span class="spinner-border spinner-border-sm"></span> ${I18n.t("reviewAiRunning")}</div>`;

        fetch(`/api/admin/ai-check/${i.id}`, { method: "POST" })
            .then(r => r.json().then(v => ({ ok: r.ok, v })))
            .then(({ ok, v }) => {

                aiBtn.disabled = false;

                if (!ok) throw new Error(v.message || v.error);

                const mezoId = { ar: "rvAr", nm: "rvNm", szobak: "rvSzobak", telek_nm: "rvTelek", allapot: "rvAllapot", tipus: "rvTipus", ugylet: "rvUgylet" };

                box.innerHTML = `
                    <div class="alert ${v.rendben && !(v.javaslatok || []).length ? "alert-success" : "alert-warning"} small py-2">
                        <b><i class="fa-solid fa-robot"></i> ${Utils.escape(v.megjegyzes || "")}</b>
                        ${(v.javaslatok || []).map((j, idx) => `
                            <div class="d-flex align-items-center gap-2 mt-2">
                                <span class="flex-fill">${I18n.t("field_" + j.mezo)}: <b>${Utils.escape(j.ertek)}</b> – ${Utils.escape(j.indok || "")}</span>
                                ${mezoId[j.mezo] || j.mezo === "emelet" ? `<button class="btn btn-sm btn-outline-primary" data-ai="${idx}">${I18n.t("reviewAiApply")}</button>` : ""}
                            </div>`).join("")}
                    </div>`;

                box.querySelectorAll("[data-ai]").forEach(b => {
                    b.onclick = () => {
                        const j = v.javaslatok[Number(b.dataset.ai)];
                        if (j.mezo === "emelet") {
                            const [e, o] = String(j.ertek).split("/");
                            document.getElementById("rvEmelet").value = e || "";
                            if (o) document.getElementById("rvOssz").value = o;
                        } else {
                            const el = document.getElementById(mezoId[j.mezo]);
                            if (el) el.value = j.ertek;
                        }
                        b.disabled = true;
                        b.innerHTML = '<i class="fa-solid fa-check"></i>';
                    };
                });

            })
            .catch(err => {
                aiBtn.disabled = false;
                box.innerHTML = `<div class="alert alert-danger small py-2">${Utils.escape(err.message)}</div>`;
            });

    };

    // Billentyűk: Enter = jóváhagyás, ← → = lapozás
    AdminManager.unbindKeys();

    AdminManager.reviewKeyHandler = e => {
        if (PageManager.current !== "admin" || AdminManager.tab !== "review") return;
        const tag = (e.target.tagName || "").toLowerCase();
        if (e.key === "Enter" && tag !== "textarea" && tag !== "select" && tag !== "button") { e.preventDefault(); ment(); }
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        if (e.key === "ArrowRight") AdminManager.reviewStep(1);
        if (e.key === "ArrowLeft") AdminManager.reviewStep(-1);
    };

    document.addEventListener("keydown", AdminManager.reviewKeyHandler);

};
