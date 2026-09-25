// ============================================================
//  Admin oldal: ellenőrzés, nem elérhető hirdetések, beolvasás,
//  figyelt oldalak, duplikátumok, városok/kerületek
// ============================================================

class AdminManager {

    static tab = "review";
    static pollTimer = null;
    static ignoredDupGroups = new Set();
    static aiElerheto = false;

    // Ellenőrző felület állapota
    static reviewList = [];
    static reviewIdx = 0;
    static reviewFilter = "all";
    static reviewFocusId = null;
    static reviewMap = null;
    static reviewMarker = null;
    static reviewKeyHandler = null;

    static init() {

        document.querySelectorAll("#adminTabs [data-tab]").forEach(b => {
            b.onclick = () => AdminManager.open(b.dataset.tab);
        });

    }

    static show() {

        if (!AuthManager.isAdmin()) {
            document.getElementById("adminContent").innerHTML =
                `<div class="alert alert-warning">${I18n.t("alertAdminOnly")}</div>`;
            return;
        }

        AdminManager.refreshPendingCount();
        AdminManager.open(AdminManager.tab);

    }

    static open(tab) {

        AdminManager.tab = tab;

        document.querySelectorAll("#adminTabs [data-tab]").forEach(b => {
            b.classList.toggle("active", b.dataset.tab === tab);
        });

        if (AdminManager.pollTimer) {
            clearInterval(AdminManager.pollTimer);
            AdminManager.pollTimer = null;
        }

        AdminManager.unbindKeys();

        ({
            review: AdminManager.renderReview,
            unavailable: AdminManager.renderUnavailable,
            import: AdminManager.renderImport,
            watch: AdminManager.renderWatch,
            dups: AdminManager.renderDups,
            places: AdminManager.renderPlaces
        })[tab]();

    }

    static box() {
        return document.getElementById("adminContent");
    }

    static loading() {
        AdminManager.box().innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;
    }

    // A fülek melletti számlálók
    static refreshPendingCount() {

        if (!AuthManager.isAdmin()) return;

        fetch("/api/admin/counts")
            .then(r => r.json())
            .then(c => {
                AdminManager.aiElerheto = !!c.ai;
                document.getElementById("pendingCount").innerText = c.review || "";
                document.getElementById("unavailableCount").innerText = c.unavailable || "";
            })
            .catch(() => { });

    }

    static typeOptions(selected) {
        return Types.LIST.map(t => `<option value="${t.key}" ${t.key === selected ? "selected" : ""}>${I18n.t(t.label)}</option>`).join("");
    }

    static cityOptions(selected) {
        return CityManager.varosok
            .map(v => v.nev)
            .sort((a, b) => CityManager.displayName(a).localeCompare(CityManager.displayName(b), "hu"))
            .map(n => `<option value="${Utils.escape(n)}" ${n === selected ? "selected" : ""}>${Utils.escape(CityManager.displayName(n))}</option>`)
            .join("");
    }

    static unbindKeys() {
        if (AdminManager.reviewKeyHandler) {
            document.removeEventListener("keydown", AdminManager.reviewKeyHandler);
            AdminManager.reviewKeyHandler = null;
        }
    }

    // ================= GYORS ELLENŐRZÉS =================
    //  Egyszerre egy hirdetés: bal oldalon a mi adataink (azonnal
    //  javíthatók), jobb oldalon a forrásoldal szövege és képei –
    //  nem kell a hirdetési oldalak között ugrálni.

    static renderReview() {

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

                document.getElementById("pendingCount").innerText = lista.length || "";

                AdminManager.renderReviewItem();

            });

    }

    static reviewFiltered() {

        const f = AdminManager.reviewFilter;

        return AdminManager.reviewList.filter(i => {
            const h = (i.hianyzo || []).length;
            const p = (i.problemak || []).length;
            if (f === "missing") return h > 0;
            if (f === "suspicious") return p > 0;
            return true;
        });

    }

    static renderReviewItem() {

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

        const num = (id, v) => `<input type="number" class="form-control form-control-sm" id="${id}" value="${v ?? ""}">`;

        const forrasSzoveg = Utils.escape(i.forras_szoveg || i.leiras || I18n.t("reviewNoSource"))
            .replace(/(\d[\d.,\s]*\s*(?:€|EUR|lei|mp|m²|camere|cam\.?))/gi, "<mark>$1</mark>")
            .replace(/(Etaj[^.\n]{0,12}|Nr\.? ?cam[^:]*:|Sup[^:]{0,25}:|An constr[^:]*:)/gi, "<b>$1</b>");

        box.innerHTML = AdminManager.reviewToolbar(lista.length) + `

            <div class="row g-4">

                <div class="col-xl-7">

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

                            <div class="row g-2">
                                <div class="col-6 col-md-4">
                                    <label class="form-label">${I18n.t("typeLabel")}</label>
                                    <select class="form-select form-select-sm" id="rvTipus">${AdminManager.typeOptions(i.tipus)}</select>
                                </div>
                                <div class="col-6 col-md-4">
                                    <label class="form-label">${I18n.t("ugyletLabel")}</label>
                                    <select class="form-select form-select-sm" id="rvUgylet">
                                        <option value="elado">${I18n.t("ugyletElado")}</option>
                                        <option value="kiado" ${i.ugylet === "kiado" ? "selected" : ""}>${I18n.t("ugyletKiado")}</option>
                                    </select>
                                </div>
                                ${mezo("ar", I18n.t(i.ugylet === "kiado" ? "newArRent" : "newAr"), num("rvAr", i.ar))}
                                ${mezo("nm", I18n.t("newNm"), num("rvNm", i.nm))}
                                ${t.fields.szobak ? mezo("szobak", I18n.t("newSzobak"), num("rvSzobak", i.szobak)) : ""}
                                ${t.fields.emelet ? mezo("emelet", I18n.t("newEmelet") + " / " + I18n.t("newOsszEmelet").toLowerCase(), `
                                    <div class="input-group input-group-sm">
                                        <input class="form-control" id="rvEmelet" value="${Utils.escape(emelet[0] || "")}">
                                        <span class="input-group-text">/</span>
                                        <input class="form-control" id="rvOssz" value="${Utils.escape(emelet[1] || "")}">
                                    </div>`) : ""}
                                ${t.fields.telek ? mezo("telek_nm", I18n.t("newTelekNm"), num("rvTelek", i.telek_nm)) : ""}
                                ${t.fields.allapot ? mezo("allapot", I18n.t("newAllapot"), `
                                    <select class="form-select form-select-sm" id="rvAllapot">
                                        <option value="">${I18n.t("chooseOne")}</option>
                                        ${["felújítandó", "részbenfel", "jó", "újszerű", "luxus"].map(a => `<option value="${a}" ${Utils.normAllapot(i.allapot) === a ? "selected" : ""}>${Utils.allapotLabel(a)}</option>`).join("")}
                                    </select>`) : ""}
                                ${mezo("kerulet", I18n.t("newKerulet"), `
                                    <select class="form-select form-select-sm" id="rvKerulet"><option value="">${I18n.t("newKeruletNincs")}</option></select>
                                    ${i.forras_kerulet ? `<div class="form-text">${I18n.f("reviewSourceDistrict", { nev: Utils.escape(i.forras_kerulet) })}</div>` : ""}`)}
                                <div class="col-12">
                                    <label class="form-label">${I18n.t("newCim")}</label>
                                    <input class="form-control form-control-sm" id="rvCim" value="${Utils.escape(i.cim || "")}">
                                </div>
                            </div>

                            <div class="mt-3 ${hianyzo.includes("hely") ? "revMissing" : ""}" data-field="hely">
                                <label class="form-label">${I18n.t("newHely")} ${i.hely_pontossag === "kozelito" ? `<span class="badge text-bg-info">${I18n.t("approxShort")}</span>` : ""} <span class="text-body-secondary fw-normal">– ${I18n.t("reviewDragHint")}</span></label>
                                <div id="reviewMap"></div>
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

                <div class="col-xl-5">

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

    }

    static reviewToolbar(db) {

        return `
            <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                <select class="form-select form-select-sm" style="width:auto;" id="rvFilter">
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
            <p class="sectionNote">${I18n.t("reviewNote")}</p>`;

    }

    static bindReviewToolbar() {

        const f = document.getElementById("rvFilter");

        f.onchange = () => {
            AdminManager.reviewFilter = f.value;
            AdminManager.reviewIdx = 0;
            AdminManager.renderReviewItem();
        };

        const prev = document.getElementById("rvPrev");
        const next = document.getElementById("rvNext");

        if (prev) prev.onclick = () => AdminManager.reviewStep(-1);
        if (next) next.onclick = () => AdminManager.reviewStep(1);

    }

    static reviewStep(d) {
        const n = AdminManager.reviewFiltered().length;
        if (!n) return;
        AdminManager.reviewIdx = (AdminManager.reviewIdx + d + n) % n;
        AdminManager.renderReviewItem();
    }

    // Az űrlap adatai a mentéshez (a teljes hirdetés + a javított mezők)
    static reviewCollect(i) {

        const v = id => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : null;
        };

        const tipus = v("rvTipus");
        const emelet = v("rvEmelet");
        const ossz = v("rvOssz");

        const marker = AdminManager.reviewMarker ? AdminManager.reviewMarker.getLatLng() : null;

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
            x: marker ? marker.lng : i.x,
            y: marker ? marker.lat : i.y,
            hely_pontossag: AdminManager.reviewMoved ? "pontos" : i.hely_pontossag
        };

    }

    static bindReviewItem(i) {

        // Kerületek
        CityManager.loadKeruletekInto("rvKerulet", i.varos, i.kerulet || "", "newKeruletNincs");

        // Térkép, húzható jelölővel
        if (AdminManager.reviewMap) {
            AdminManager.reviewMap.remove();
            AdminManager.reviewMap = null;
        }

        AdminManager.reviewMoved = false;

        const kozep = i.x && i.y ? [i.y, i.x] : [45.8590, 25.7900];

        AdminManager.reviewMap = L.map("reviewMap", { scrollWheelZoom: false }).setView(kozep, i.x && i.y ? 16 : 13);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(AdminManager.reviewMap);

        const tesz = latlng => {
            if (AdminManager.reviewMarker) AdminManager.reviewMap.removeLayer(AdminManager.reviewMarker);
            AdminManager.reviewMarker = L.marker(latlng, { draggable: true }).addTo(AdminManager.reviewMap);
            AdminManager.reviewMarker.on("dragend", () => { AdminManager.reviewMoved = true; });
        };

        AdminManager.reviewMarker = null;

        if (i.x && i.y) tesz(kozep);

        AdminManager.reviewMap.on("click", e => {
            tesz(e.latlng);
            AdminManager.reviewMoved = true;
        });

        setTimeout(() => AdminManager.reviewMap && AdminManager.reviewMap.invalidateSize(), 100);

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
                document.getElementById("pendingCount").innerText = AdminManager.reviewList.length || "";
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

    }

    // ================= NEM ELÉRHETŐ (ELADOTT / TÖRÖLT) =================

    static renderUnavailable() {

        AdminManager.loading();

        fetch("/api/admin/unavailable")
            .then(r => r.json())
            .then(lista => {

                DataManager.prepare(lista);

                document.getElementById("unavailableCount").innerText = lista.length || "";

                AdminManager.box().innerHTML = `

                    <div class="card mb-4">
                        <div class="card-body d-flex flex-wrap align-items-center gap-3">
                            <div class="flex-fill">
                                <h5 class="mb-1"><i class="fa-solid fa-satellite-dish"></i> ${I18n.t("recheckTitle")}</h5>
                                <p class="sectionNote mb-0">${I18n.t("recheckNote")}</p>
                            </div>
                            <button class="btn btn-primary" id="recheckStart"><i class="fa-solid fa-play"></i> ${I18n.t("recheckBtn")}</button>
                        </div>
                        <div class="px-3 pb-3" id="recheckStatus"></div>
                    </div>

                    <h5 class="sectionTitle"><i class="fa-solid fa-ban"></i> ${I18n.t("unavailableTitle")} <span class="badge text-bg-secondary">${lista.length}</span></h5>
                    <p class="sectionNote">${I18n.t("unavailableNote")}</p>

                    ${lista.length ? `
                        <div class="d-flex justify-content-end mb-2">
                            <button class="btn btn-sm btn-outline-danger" id="unavDeleteAll"><i class="fa-solid fa-trash"></i> ${I18n.f("invalidDeleteBtn", { n: lista.length })}</button>
                        </div>
                        <div class="d-flex flex-column gap-2">
                            ${lista.map(i => {
                                const foto = Utils.photoUrl(i);
                                return `
                                    <div class="pendingRow card">
                                        <div class="card-body d-flex flex-wrap gap-3 align-items-center">
                                            <div class="pendingThumb">${foto ? `<img src="${Utils.escape(foto)}" referrerpolicy="no-referrer" alt="" onerror="this.remove()">` : `<i class="${Types.get(i.tipus).icon}"></i>`}</div>
                                            <div class="flex-fill" style="min-width:220px;">
                                                <div class="fw-bold">${Utils.escape(i.cim || Types.label(i.tipus))} <span class="text-body-secondary small">#${i.id}</span></div>
                                                <div class="small">${Utils.price(i)} · ${i.nm ? Utils.num(i.nm) + " m²" : "?"} · ${Utils.escape(CityManager.displayName(i.varos))}</div>
                                                <div class="small text-body-secondary">${I18n.t("lastChecked")}: ${Utils.ago(i.utolso_ellenorzes)} · ${Sources.badge(i.forras)}</div>
                                            </div>
                                            <div class="d-flex gap-2">
                                                ${i.link ? `<a class="btn btn-sm btn-outline-secondary" href="${Utils.escape(i.link)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ""}
                                                <button class="btn btn-sm btn-outline-success" data-restore="${i.id}"><i class="fa-solid fa-rotate-left"></i> ${I18n.t("unavailableRestore")}</button>
                                                <button class="btn btn-sm btn-outline-danger" data-del="${i.id}"><i class="fa-solid fa-trash"></i></button>
                                            </div>
                                        </div>
                                    </div>`;
                            }).join("")}
                        </div>` : `<div class="emptyState"><i class="fa-solid fa-check"></i><h5>${I18n.t("unavailableEmpty")}</h5></div>`}`;

                document.getElementById("recheckStart").onclick = () => {
                    fetch("/api/admin/recheck", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ limit: 500 })
                    })
                    .then(r => r.json())
                    .then(v => AdminManager.pollJob(v.jobId, "recheckStatus"));
                };

                const box = AdminManager.box();

                box.querySelectorAll("[data-restore]").forEach(b => {
                    b.onclick = () => fetch(`/api/admin/unavailable/${b.dataset.restore}/restore`, { method: "POST" })
                        .then(() => { DataManager.init(); AdminManager.renderUnavailable(); });
                });

                box.querySelectorAll("[data-del]").forEach(b => {
                    b.onclick = () => {
                        if (!confirm(I18n.t("alertConfirmDelete"))) return;
                        fetch("/api/ingatlanok/" + b.dataset.del, { method: "DELETE" }).then(() => AdminManager.renderUnavailable());
                    };
                });

                const all = document.getElementById("unavDeleteAll");

                if (all) all.onclick = () => {
                    if (!confirm(I18n.f("dupCleanConfirm", { n: lista.length }))) return;
                    fetch("/api/admin/invalid/delete", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ids: lista.map(i => i.id) })
                    }).then(() => AdminManager.renderUnavailable());
                };

            });

    }

    // ================= BEOLVASÁS =================

    static renderImport() {

        AdminManager.box().innerHTML = `
            <div class="row g-4">
                <div class="col-xl-5">
                    <div class="card">
                        <div class="card-body">
                            <label class="form-label" for="impUrls">${I18n.t("importUrls")}</label>
                            <textarea id="impUrls" class="form-control mb-2" rows="8" placeholder="https://www.imobiliare.ro/vanzare-apartamente/sfantu-gheorghe&#10;https://www.imoradar24.ro/oferta/..."></textarea>
                            <p class="small text-body-secondary">${I18n.t("importUrlsHelp")}</p>

                            <div class="row g-2 mb-3">
                                <div class="col-md-4">
                                    <label class="form-label">${I18n.t("detailVaros")}</label>
                                    <select id="impVaros" class="form-select form-select-sm">${AdminManager.cityOptions(DataManager.currentCity)}</select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">${I18n.t("typeLabel")}</label>
                                    <select id="impTipus" class="form-select form-select-sm">${AdminManager.typeOptions(FilterManager.tipus)}</select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">${I18n.t("ugyletLabel")}</label>
                                    <select id="impUgylet" class="form-select form-select-sm">
                                        <option value="elado">${I18n.t("ugyletElado")}</option>
                                        <option value="kiado" ${FilterManager.ugylet === "kiado" ? "selected" : ""}>${I18n.t("ugyletKiado")}</option>
                                    </select>
                                </div>
                            </div>
                            <p class="small text-body-secondary">${I18n.t("importDefaultsHelp")}</p>

                            <div class="d-grid">
                                <button class="btn btn-primary" id="impStart"><i class="fa-solid fa-play"></i> ${I18n.t("importStart")}</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-xl-7">
                    <div id="impStatus">
                        <div class="card"><div class="card-body">
                            <h6>${I18n.t("importHowTitle")}</h6>
                            <ol class="howList small mb-0">
                                <li>${I18n.t("importHow1")}</li>
                                <li>${I18n.t("importHow2")}</li>
                                <li>${I18n.t("importHow3")}</li>
                                <li>${I18n.t("importHow4")}</li>
                            </ol>
                        </div></div>
                    </div>
                </div>
            </div>`;

        document.getElementById("impStart").onclick = () => {

            const body = {
                urls: document.getElementById("impUrls").value,
                varos: document.getElementById("impVaros").value,
                tipus: document.getElementById("impTipus").value,
                ugylet: document.getElementById("impUgylet").value
            };

            fetch("/api/admin/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
            .then(r => r.json().then(v => ({ ok: r.ok, v })))
            .then(({ ok, v }) => {
                if (!ok) {
                    alert(I18n.t(v.error === "no_urls" ? "importNoUrls" : "alertSaveError"));
                    return;
                }
                AdminManager.pollJob(v.jobId, "impStatus");
            });

        };

    }

    static pollJob(jobId, boxId) {

        const rajzol = job => {

            const box = document.getElementById(boxId);
            if (!box) return;

            const pct = job.osszes ? Math.round(job.kesz / job.osszes * 100) : 0;

            const szoveg = {
                uj: I18n.t("importResNew"),
                ar_frissitve: I18n.t("importResPrice"),
                mar_megvan: I18n.t("importResExists"),
                lista: I18n.t("importResList"),
                hiba: I18n.t("importResError"),
                nem_elerheto: I18n.t("importResUnavailable"),
                rendben: I18n.t("importResOk")
            };

            box.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <div class="d-flex justify-content-between mb-2">
                            <b>${job.allapot === "kesz" ? I18n.t("importDone") : I18n.t("importRunning")}</b>
                            <span>${job.kesz} / ${job.osszes || "?"}</span>
                        </div>
                        <div class="progress mb-3" style="height:8px;"><div class="progress-bar ${job.allapot === "kesz" ? "bg-success" : "progress-bar-striped progress-bar-animated"}" style="width:${job.allapot === "kesz" ? 100 : pct}%"></div></div>
                        <div class="d-flex flex-wrap gap-2 mb-3">
                            <span class="badge text-bg-success">${job.uj} ${I18n.t("importResNew")}</span>
                            <span class="badge text-bg-info">${job.frissitett} ${I18n.t("importResPrice")}</span>
                            <span class="badge text-bg-secondary">${job.kihagyott} ${I18n.t("importResExists")}</span>
                            ${job.nemElerheto ? `<span class="badge text-bg-dark">${job.nemElerheto} ${I18n.t("importResUnavailable")}</span>` : ""}
                            <span class="badge text-bg-danger">${job.hibak} ${I18n.t("importResError")}</span>
                        </div>
                        <div class="importLog">
                            ${job.naplo.slice().reverse().map(n => `
                                <div class="small">
                                    <span class="badge ${n.eredmeny === "uj" ? "text-bg-success" : n.eredmeny === "hiba" ? "text-bg-danger" : "text-bg-light"}">${szoveg[n.eredmeny] || n.eredmeny}</span>
                                    ${n.url ? `<a href="${Utils.escape(n.url)}" target="_blank" rel="noopener">${Utils.escape(n.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80))}</a>` : ""}
                                    ${n.db !== undefined ? `(${n.db})` : ""}
                                    ${n.uzenet ? `<span class="text-danger">${Utils.escape(n.uzenet)}</span>` : ""}
                                    ${n.regi ? `${Utils.eur(n.regi)} → ${Utils.eur(n.uj)}` : ""}
                                    ${n.hianyzo && n.hianyzo.length ? n.hianyzo.map(m => `<span class="badge text-bg-warning">${I18n.t("field_" + m)}</span>`).join(" ") : ""}
                                    ${n.problemak && n.problemak.length ? n.problemak.map(m => `<span class="badge text-bg-danger">${I18n.t("prob_" + m)}</span>`).join(" ") : ""}
                                </div>`).join("")}
                        </div>
                        ${job.allapot === "kesz" && job.uj ? `<button class="btn btn-sm btn-primary mt-3" id="goPending"><i class="fa-solid fa-inbox"></i> ${I18n.t("importGoPending")}</button>` : ""}
                    </div>
                </div>`;

            const go = document.getElementById("goPending");
            if (go) go.onclick = () => AdminManager.open("review");

        };

        const lekerdez = () => fetch("/api/admin/import/" + jobId)
            .then(r => r.json())
            .then(job => {
                rajzol(job);
                if (job.allapot === "kesz" || job.allapot === "hiba") {
                    clearInterval(AdminManager.pollTimer);
                    AdminManager.pollTimer = null;
                    AdminManager.refreshPendingCount();
                    DataManager.init();
                }
            });

        if (AdminManager.pollTimer) clearInterval(AdminManager.pollTimer);

        lekerdez();
        AdminManager.pollTimer = setInterval(lekerdez, 2000);

    }

    // ================= FIGYELT OLDALAK =================

    static renderWatch() {

        AdminManager.loading();

        fetch("/api/admin/watch")
            .then(r => r.json())
            .then(lista => {

                const cronUrl = `${location.origin}/api/cron/run?key=CRON_KEY`;

                AdminManager.box().innerHTML = `
                    <p class="sectionNote">${I18n.t("watchNote")}</p>

                    <div class="card mb-4">
                        <div class="card-body">
                            <div class="row g-2 align-items-end">
                                <div class="col-lg-4"><label class="form-label">${I18n.t("watchUrl")}</label><input id="wUrl" class="form-control form-control-sm" placeholder="https://www.imobiliare.ro/vanzare-apartamente/..."></div>
                                <div class="col-lg-2"><label class="form-label">${I18n.t("watchName")}</label><input id="wNev" class="form-control form-control-sm"></div>
                                <div class="col-lg-2"><label class="form-label">${I18n.t("detailVaros")}</label><select id="wVaros" class="form-select form-select-sm">${AdminManager.cityOptions(DataManager.currentCity)}</select></div>
                                <div class="col-lg-2"><label class="form-label">${I18n.t("typeLabel")}</label><select id="wTipus" class="form-select form-select-sm">${AdminManager.typeOptions("lakas")}</select></div>
                                <div class="col-lg-1"><label class="form-label">${I18n.t("ugyletLabel")}</label><select id="wUgylet" class="form-select form-select-sm"><option value="elado">${I18n.t("ugyletElado")}</option><option value="kiado">${I18n.t("ugyletKiado")}</option></select></div>
                                <div class="col-lg-1 d-grid"><button class="btn btn-sm btn-primary" id="wAdd"><i class="fa-solid fa-plus"></i></button></div>
                            </div>
                        </div>
                    </div>

                    ${lista.length ? `
                        <div class="table-responsive mb-4">
                            <table class="table table-sm statTable align-middle">
                                <thead><tr><th>${I18n.t("watchName")}</th><th>${I18n.t("detailVaros")}</th><th>${I18n.t("typeLabel")}</th><th>${I18n.t("watchLastRun")}</th><th></th></tr></thead>
                                <tbody>
                                    ${lista.map(w => `
                                        <tr>
                                            <td><a href="${Utils.escape(w.url)}" target="_blank" rel="noopener">${Utils.escape(w.nev || w.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60))}</a></td>
                                            <td>${Utils.escape(CityManager.displayName(w.varos))}</td>
                                            <td>${Types.label(w.tipus)} · ${Types.ugyletLabel(w.ugylet)}</td>
                                            <td class="small">${w.utolso_futas ? Utils.ago(w.utolso_futas) + "<br>" + Utils.escape(w.utolso_eredmeny || "") : "–"}</td>
                                            <td class="text-end text-nowrap">
                                                <button class="btn btn-sm btn-outline-primary" data-run="${w.id}"><i class="fa-solid fa-rotate"></i> ${I18n.t("watchRun")}</button>
                                                <button class="btn btn-sm btn-outline-danger" data-del="${w.id}"><i class="fa-solid fa-trash"></i></button>
                                            </td>
                                        </tr>`).join("")}
                                </tbody>
                            </table>
                        </div>
                        <div id="watchStatus" class="mb-4"></div>` : `<div class="emptyState"><i class="fa-solid fa-binoculars"></i><h5>${I18n.t("watchEmpty")}</h5></div>`}

                    <div class="card">
                        <div class="card-body small">
                            <h6><i class="fa-solid fa-clock"></i> ${I18n.t("watchAutoTitle")}</h6>
                            <ol class="howList mb-0">
                                <li>${I18n.t("watchAuto1")}</li>
                                <li>${I18n.t("watchAuto2")}</li>
                                <li>${I18n.t("watchAuto3")} <code>${Utils.escape(cronUrl)}</code></li>
                            </ol>
                        </div>
                    </div>`;

                document.getElementById("wAdd").onclick = () => {
                    fetch("/api/admin/watch", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            url: document.getElementById("wUrl").value,
                            nev: document.getElementById("wNev").value,
                            varos: document.getElementById("wVaros").value,
                            tipus: document.getElementById("wTipus").value,
                            ugylet: document.getElementById("wUgylet").value
                        })
                    }).then(r => {
                        if (!r.ok) alert(I18n.t("scrapeBadUrl"));
                        AdminManager.renderWatch();
                    });
                };

                AdminManager.box().querySelectorAll("[data-run]").forEach(b => {
                    b.onclick = () => {
                        fetch(`/api/admin/watch/${b.dataset.run}/run`, { method: "POST" })
                            .then(r => r.json())
                            .then(v => AdminManager.pollJob(v.jobId, "watchStatus"));
                    };
                });

                AdminManager.box().querySelectorAll("[data-del]").forEach(b => {
                    b.onclick = () => {
                        if (!confirm(I18n.t("watchDeleteConfirm"))) return;
                        fetch("/api/admin/watch/" + b.dataset.del, { method: "DELETE" }).then(() => AdminManager.renderWatch());
                    };
                });

            });

    }

    // ================= DUPLIKÁTUMOK =================

    static dupRow(i, name, checked) {
        return `
            <label class="dupMember">
                <input type="radio" class="form-check-input" name="${name}" value="${i.id}" ${checked ? "checked" : ""}>
                <span class="flex-fill">
                    <b>#${i.id}</b> · ${Utils.eur(i.ar)} · ${Utils.num(i.nm)} m² · ${i.szobak || "-"} ${I18n.t("colSzoba").toLowerCase()} · ${Utils.escape(i.emelet || "-")}
                    ${i.kerulet ? " · " + Utils.escape(i.kerulet) : ""}
                    ${i.kep_db ? ` · <i class="fa-solid fa-camera"></i> ${i.kep_db}` : ""}
                    ${i.kedvenc ? " · ⭐" : ""}
                </span>
                ${Sources.badge(Sources.fromLink(i.link))}
                ${i.link ? `<a href="${Utils.escape(i.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ""}
            </label>`;
    }

    static renderDups() {

        AdminManager.loading();

        fetch("/api/admin/duplicates")
            .then(r => r.json())
            .then(d => {

                const valoszinu = d.valoszinu.filter(g => !AdminManager.ignoredDupGroups.has(g.tagok.map(t => t.id).join("-")));

                AdminManager.box().innerHTML = `

                    <div class="card mb-4">
                        <div class="card-body d-flex flex-wrap align-items-center gap-3">
                            <div class="flex-fill">
                                <h5 class="mb-1"><i class="fa-solid fa-clone"></i> ${I18n.t("dupExactTitle")}</h5>
                                <p class="sectionNote mb-0">${I18n.f("dupExactNote", { groups: d.biztos.length, extra: d.biztosFelesleges })}</p>
                            </div>
                            <button class="btn btn-danger" id="dupClean" ${d.biztosFelesleges ? "" : "disabled"}>
                                <i class="fa-solid fa-broom"></i> ${I18n.f("dupCleanBtn", { n: d.biztosFelesleges })}
                            </button>
                        </div>
                    </div>

                    ${d.hibas.length ? `
                    <div class="card mb-4">
                        <div class="card-body">
                            <div class="d-flex flex-wrap align-items-center gap-3 mb-2">
                                <div class="flex-fill">
                                    <h5 class="mb-1"><i class="fa-solid fa-triangle-exclamation text-warning"></i> ${I18n.t("invalidTitle")}</h5>
                                    <p class="sectionNote mb-0">${I18n.f("invalidNote", { n: d.hibas.length })}</p>
                                </div>
                                <button class="btn btn-outline-danger" id="invalidDelete"><i class="fa-solid fa-trash"></i> ${I18n.f("invalidDeleteBtn", { n: d.hibas.length })}</button>
                            </div>
                            <div class="table-responsive" style="max-height:260px;">
                                <table class="table table-sm statTable mb-0">
                                    <thead><tr><th>#</th><th>${I18n.t("colAr")}</th><th>${I18n.t("colNm")}</th><th>Link</th><th></th></tr></thead>
                                    <tbody>${d.hibas.map(i => `
                                        <tr>
                                            <td>${i.id}</td>
                                            <td>${i.ar ?? "-"}</td>
                                            <td>${i.nm ?? "-"}</td>
                                            <td class="small text-truncate" style="max-width:320px;">${Utils.escape(i.link || "–")}</td>
                                            <td><button class="btn btn-sm btn-link p-0" data-fix="${i.id}">${I18n.t("detailEdit")}</button></td>
                                        </tr>`).join("")}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>` : ""}

                    <h5 class="sectionTitle"><i class="fa-solid fa-code-compare"></i> ${I18n.t("dupProbableTitle")} <span class="badge text-bg-warning">${valoszinu.length}</span></h5>
                    <p class="sectionNote">${I18n.t("dupProbableNote")}</p>

                    ${valoszinu.length ? valoszinu.map((g, gi) => `
                        <div class="card mb-3 dupGroup" data-group="${g.tagok.map(t => t.id).join("-")}">
                            <div class="card-body">
                                <div class="d-flex flex-column gap-1 mb-2">
                                    ${g.tagok.map((i, idx) => AdminManager.dupRow(i, "dupKeep" + gi, idx === 0)).join("")}
                                </div>
                                <div class="d-flex gap-2 justify-content-end">
                                    <button class="btn btn-sm btn-outline-secondary" data-ignore="${gi}">${I18n.t("dupNotDuplicate")}</button>
                                    <button class="btn btn-sm btn-primary" data-merge="${gi}"><i class="fa-solid fa-object-group"></i> ${I18n.t("dupMerge")}</button>
                                </div>
                            </div>
                        </div>`).join("") : `<div class="emptyState"><i class="fa-solid fa-check"></i><h5>${I18n.t("dupNone")}</h5></div>`}`;

                const inv = document.getElementById("invalidDelete");

                if (inv) inv.onclick = () => {
                    if (!confirm(I18n.f("dupCleanConfirm", { n: d.hibas.length }))) return;
                    fetch("/api/admin/invalid/delete", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ids: d.hibas.map(i => i.id) })
                    }).then(() => {
                        DataManager.init();
                        AdminManager.renderDups();
                    });
                };

                AdminManager.box().querySelectorAll("[data-fix]").forEach(b => {
                    b.onclick = () => NewPropertyManager.startEdit({ id: Number(b.dataset.fix) });
                });

                const clean = document.getElementById("dupClean");

                clean.onclick = () => {
                    if (!confirm(I18n.f("dupCleanConfirm", { n: d.biztosFelesleges }))) return;
                    clean.disabled = true;
                    fetch("/api/admin/duplicates/clean", { method: "POST" })
                        .then(r => r.json())
                        .then(v => {
                            alert(I18n.f("dupCleaned", { n: v.torolt }));
                            DataManager.init();
                            AdminManager.renderDups();
                        });
                };

                AdminManager.box().querySelectorAll("[data-ignore]").forEach(b => {
                    b.onclick = () => {
                        AdminManager.ignoredDupGroups.add(valoszinu[Number(b.dataset.ignore)].tagok.map(t => t.id).join("-"));
                        AdminManager.renderDups();
                    };
                });

                AdminManager.box().querySelectorAll("[data-merge]").forEach(b => {
                    b.onclick = () => {

                        const gi = Number(b.dataset.merge);
                        const g = valoszinu[gi];
                        const megtart = Number(document.querySelector(`input[name="dupKeep${gi}"]:checked`).value);
                        const torlendo = g.tagok.map(t => t.id).filter(id => id !== megtart);

                        if (!confirm(I18n.f("dupMergeConfirm", { keep: megtart }))) return;

                        fetch("/api/admin/duplicates/merge", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ megtart, torlendo })
                        }).then(() => {
                            DataManager.init();
                            AdminManager.renderDups();
                        });

                    };
                });

            });

    }

    // ================= VÁROSOK, KERÜLETEK =================

    static renderPlaces() {

        AdminManager.loading();

        Promise.all([
            CityManager.loadVarosok(),
            fetch("/api/keruletek").then(r => r.json())
        ]).then(([, keruletek]) => {

            const varosok = [...CityManager.varosok].sort((a, b) =>
                CityManager.displayName(a.nev).localeCompare(CityManager.displayName(b.nev), "hu"));

            AdminManager.box().innerHTML = `
                <p class="sectionNote">${I18n.t("placesNote")}</p>

                <div class="card mb-4">
                    <div class="card-body d-flex gap-2">
                        <input id="newCityName" class="form-control" placeholder="${I18n.t("alertNewCityPrompt")}">
                        <button class="btn btn-primary text-nowrap" id="addCity"><i class="fa-solid fa-plus"></i> ${I18n.t("newAddVaros")}</button>
                    </div>
                </div>

                <div class="row g-3">
                    ${varosok.map(v => {
                        const k = keruletek.filter(x => x.varos === v.nev);
                        return `
                            <div class="col-md-6 col-xl-4">
                                <div class="card h-100">
                                    <div class="card-header"><h6 class="mb-0"><i class="fa-solid fa-city"></i> ${Utils.escape(CityManager.displayName(v.nev))} <span class="badge text-bg-light">${k.length}</span></h6></div>
                                    <div class="card-body">
                                        <div class="d-flex flex-wrap gap-1 mb-3">
                                            ${k.length ? k.map(x => `
                                                <button type="button" class="filterChip border-0" data-kid="${x.id}" data-aliasok="${Utils.escape(x.aliasok || "")}" data-nev="${Utils.escape(x.nev)}" title="${I18n.t("placesAliasHint")}">
                                                    ${Utils.escape(x.nev)}${x.aliasok ? ` <small class="opacity-75">(${Utils.escape(x.aliasok)})</small>` : ""}
                                                </button>`).join("") : `<span class="text-body-secondary small">${I18n.t("placesNoDistricts")}</span>`}
                                        </div>
                                        <div class="input-group input-group-sm">
                                            <input class="form-control" data-district-input="${Utils.escape(v.nev)}" placeholder="${I18n.t("alertNewDistrictPrompt")}">
                                            <button class="btn btn-outline-primary" data-district-add="${Utils.escape(v.nev)}"><i class="fa-solid fa-plus"></i></button>
                                        </div>
                                    </div>
                                </div>
                            </div>`;
                    }).join("")}
                </div>`;

            document.getElementById("addCity").onclick = () => {
                const nev = document.getElementById("newCityName").value.trim();
                if (!nev) return;
                fetch("/api/varosok", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ nev })
                }).then(() => CityManager.init()).then(() => AdminManager.renderPlaces());
            };

            // Kerület más oldalakon használt nevei (pl. "Ciucului" = "Csíki negyed")
            AdminManager.box().querySelectorAll("[data-kid]").forEach(b => {
                b.onclick = () => {
                    const uj = prompt(I18n.f("placesAliasPrompt", { nev: b.dataset.nev }), b.dataset.aliasok || "");
                    if (uj === null) return;
                    fetch("/api/keruletek/" + b.dataset.kid, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ aliasok: uj })
                    }).then(() => AdminManager.renderPlaces());
                };
            });

            AdminManager.box().querySelectorAll("[data-district-add]").forEach(b => {
                b.onclick = () => {
                    const varos = b.dataset.districtAdd;
                    const input = AdminManager.box().querySelector(`[data-district-input="${CSS.escape(varos)}"]`);
                    const nev = input.value.trim();
                    if (!nev) return;
                    fetch("/api/keruletek", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ varos, nev })
                    }).then(() => {
                        if (varos === DataManager.currentCity) CityManager.loadSearchKeruletek(varos);
                        AdminManager.renderPlaces();
                    });
                };
            });

        });

    }

}
