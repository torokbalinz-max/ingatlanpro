// ============================================================
//  Admin – Duplikátumok
//
//  Ugyanaz az ingatlan több oldalon: a csoportok tagjai egymás
//  mellett, a fotókkal (az egyező fotók kiemelve), így nem kell a
//  linkeket egyenként megnyitni.
//   - "Nagyon valószínű" (egyező fotók): egy gombbal mind összevonható
//   - "Lehetséges": gyors döntés billentyűkkel
//        M = összevonás, N = nem ugyanaz, → = kihagyom, 1–4 = melyik marad
//  A "nem ugyanaz" döntést a szerver megjegyzi.
// ============================================================

AdminManager.dupAdat = null;
AdminManager.dupIdx = 0;
AdminManager.dupKihagyott = new Set();
AdminManager.dupMarad = {};           // csoport kulcs -> megtartott id

AdminManager.dupKepUrl = function (k) {
    return String(k).startsWith("db:") ? "/api/kepek/" + k.slice(3) : Utils.imgUrl(k);
};

AdminManager.dupOkok = function (okok) {
    return (okok || []).map(o => {
        const t = {
            kep: I18n.f(o.n > 1 ? "dupWhyPhotos" : "dupWhyPhoto", { n: o.n }),
            ar_egyezik: I18n.t("dupWhyPrice"),
            ar_kozel: I18n.f("dupWhyPriceNear", { p: o.p }),
            nm_egyezik: I18n.t("dupWhyArea"),
            nm_kozel: I18n.t("dupWhyAreaNear"),
            szoba: I18n.t("dupWhyRooms"),
            emelet: I18n.t("dupWhyFloor"),
            kerulet: I18n.t("dupWhyDistrict"),
            hely: I18n.f("dupWhyPlace", { m: o.m })
        }[o.k] || o.k;
        return `<span class="dupWhy ${o.k === "kep" ? "strong" : ""}"><i class="fa-solid ${o.k === "kep" ? "fa-images" : "fa-check"}"></i> ${Utils.escape(t)}</span>`;
    }).join("");
};

AdminManager.dupTag = function (g, t, idx) {

    const marad = (AdminManager.dupMarad[g.kulcs] || g.javasolt) === t.id;
    const egyezo = new Set(t.egyezoKepek || []);
    const kepek = (t.kepek || []).slice(0, 4);
    const linkek = [t.link, ...(t.tovabbi_linkek || [])].filter(Boolean);

    return `
        <div class="dupCol ${marad ? "keep" : ""}" data-id="${t.id}">
            <div class="dupPhotos">
                ${kepek.length ? kepek.map(k => `<img src="${Utils.escape(AdminManager.dupKepUrl(k))}" class="${egyezo.has(k) ? "match" : ""}" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.classList.add('broken')">`).join("")
                    : `<div class="dupNoPhoto"><i class="fa-regular fa-image"></i> ${I18n.t("noPhotos")}</div>`}
            </div>
            <div class="dupColBody">
                <div class="d-flex justify-content-between align-items-center gap-2">
                    <span>${linkek.map(l => `<a href="${Utils.escape(l)}" target="_blank" rel="noopener" title="${Utils.escape(l)}">${Sources.badge(Sources.fromLink(l))}</a>`).join(" ") || `<span class="badge text-bg-light">${I18n.t("onlyHere")}</span>`}</span>
                    <a href="#listing/${t.id}" class="small text-body-secondary" target="_blank">#${t.id}</a>
                </div>
                <div class="dupPrice">${Utils.price(t)}</div>
                <div class="dupFacts">
                    <span>${t.nm ? Utils.num(t.nm, t.nm % 1 ? 1 : 0) + " m²" : "–"}</span>
                    ${t.szobak ? `<span>${t.szobak} ${I18n.t("colSzoba").toLowerCase()}</span>` : ""}
                    ${t.emelet ? `<span>${I18n.t("floorWordCap")} ${Utils.escape(t.emelet)}</span>` : ""}
                    ${CityManager.helyReszLabel(t) ? `<span>${Utils.escape(CityManager.helyReszLabel(t))}</span>` : ""}
                </div>
                <div class="small text-body-secondary text-truncate" title="${Utils.escape(t.cim || "")}">${Utils.escape(t.cim || "")}</div>
                <div class="small text-body-secondary">${Utils.ago(t.created_at)}${t.kedvenc ? " · ⭐" : ""}${t.owner_id ? ` · <i class="fa-solid fa-user"></i>` : ""}</div>
                <div class="d-flex justify-content-between align-items-center mt-2">
                    <label class="dupKeep">
                        <input type="radio" class="form-check-input" name="keep_${g.kulcs}" value="${t.id}" ${marad ? "checked" : ""}>
                        <span>${I18n.t("dupKeepThis")}</span> <kbd>${idx + 1}</kbd>
                    </label>
                    ${g.tagok.length > 2 ? `<button class="btn btn-link btn-sm p-0 text-body-secondary" data-out="${t.id}">${I18n.t("dupNotThis")}</button>` : ""}
                </div>
            </div>
        </div>`;

};

AdminManager.renderDups = function () {

    AdminManager.loading();

    fetch("/api/admin/duplicates")
        .then(r => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))
        .then(d => {
            AdminManager.dupAdat = d;
            AdminManager.dupIdx = 0;
            AdminManager.dupRajzol();
        })
        .catch(err => {
            AdminManager.box().innerHTML = `<div class="alert alert-warning">${I18n.t("alertLoadError")} ${Utils.escape(err.message)}</div>`;
        });

};

AdminManager.dupCsoportok = function () {
    const d = AdminManager.dupAdat;
    return d ? d.valoszinu.filter(g => !AdminManager.dupKihagyott.has(g.kulcs)) : [];
};

AdminManager.dupRajzol = function () {

    const d = AdminManager.dupAdat;
    const lista = AdminManager.dupCsoportok();
    const erosek = lista.filter(g => g.eros);
    const kep = d.kepek || {};

    AdminManager.dupIdx = Math.max(0, Math.min(AdminManager.dupIdx, lista.length - 1));

    AdminManager.box().innerHTML = `

        <div class="dupSummary mb-4">

            <div class="card">
                <div class="card-body">
                    <h6 class="mb-1"><i class="fa-solid fa-link"></i> ${I18n.t("dupExactTitle")}</h6>
                    <p class="sectionNote mb-2">${I18n.f("dupExactNote", { groups: d.biztos.length, extra: d.biztosFelesleges })}</p>
                    <button class="btn btn-sm btn-danger" id="dupClean" ${d.biztosFelesleges ? "" : "disabled"}><i class="fa-solid fa-broom"></i> ${I18n.f("dupCleanBtn", { n: d.biztosFelesleges })}</button>
                </div>
            </div>

            <div class="card">
                <div class="card-body">
                    <h6 class="mb-1"><i class="fa-solid fa-images"></i> ${I18n.t("dupPhotosTitle")}</h6>
                    <p class="sectionNote mb-2" id="dupPhotoNote">${!kep.elerheto ? I18n.t("dupPhotosOff") : (kep.hianyzik ? I18n.f("dupPhotosMissing", { n: kep.hianyzik }) : I18n.t("dupPhotosReady"))}</p>
                    ${kep.elerheto ? `<button class="btn btn-sm btn-outline-primary" id="dupPhotoRun" ${kep.hianyzik ? "" : "disabled"}><i class="fa-solid fa-fingerprint"></i> ${I18n.t("dupPhotosBtn")}</button>` : ""}
                </div>
            </div>

            <div class="card dupStrongCard">
                <div class="card-body">
                    <h6 class="mb-1"><i class="fa-solid fa-circle-check text-success"></i> ${I18n.t("dupStrongTitle")}</h6>
                    <p class="sectionNote mb-2">${I18n.f("dupStrongNote", { n: erosek.length })}</p>
                    <button class="btn btn-sm btn-success" id="dupMergeAll" ${erosek.length ? "" : "disabled"}><i class="fa-solid fa-object-group"></i> ${I18n.f("dupMergeAllBtn", { n: erosek.length })}</button>
                </div>
            </div>

        </div>

        ${d.hibas.length ? `
        <details class="card mb-4 dupInvalid">
            <summary class="card-body d-flex flex-wrap align-items-center gap-2">
                <i class="fa-solid fa-triangle-exclamation text-warning"></i>
                <b>${I18n.t("invalidTitle")}</b>
                <span class="badge text-bg-warning">${d.hibas.length}</span>
                <span class="small text-body-secondary">${I18n.f("invalidNote", { n: d.hibas.length })}</span>
            </summary>
            <div class="card-body pt-0">
                <div class="table-responsive" style="max-height:260px;">
                    <table class="table table-sm statTable mb-2">
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
                <button class="btn btn-sm btn-outline-danger" id="invalidDelete"><i class="fa-solid fa-trash"></i> ${I18n.f("invalidDeleteBtn", { n: d.hibas.length })}</button>
            </div>
        </details>` : ""}

        <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-2">
            <div>
                <h5 class="mb-0">${I18n.t("dupProbableTitle")} <span class="badge text-bg-warning">${lista.length}</span></h5>
                <p class="sectionNote mb-0">${I18n.t("dupKeysHint")}</p>
            </div>
            ${AdminManager.dupKihagyott.size ? `<button class="btn btn-sm btn-link" id="dupShowSkipped">${I18n.f("dupShowSkipped", { n: AdminManager.dupKihagyott.size })}</button>` : ""}
        </div>

        <div id="dupGroups">
            ${lista.length ? lista.map((g, gi) => `
                <div class="card mb-3 dupGroup ${gi === AdminManager.dupIdx ? "current" : ""}" data-g="${gi}">
                    <div class="card-body">
                        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                            <span class="badge ${g.eros ? "text-bg-success" : "text-bg-warning"}">${I18n.t(g.eros ? "dupStrong" : "dupPossible")}</span>
                            <span class="dupScore" title="${I18n.t("dupScore")}">${g.pont}%</span>
                            <div class="dupWhyList">${AdminManager.dupOkok(g.okok)}</div>
                        </div>
                        <div class="dupCols" style="--cols:${Math.min(g.tagok.length, 4)}">
                            ${g.tagok.map((t, idx) => AdminManager.dupTag(g, t, idx)).join("")}
                        </div>
                        <div class="d-flex flex-wrap gap-2 justify-content-end mt-3">
                            <button class="btn btn-sm btn-link text-body-secondary" data-skip="${gi}">${I18n.t("dupSkip")} <kbd>→</kbd></button>
                            <button class="btn btn-sm btn-outline-secondary" data-ignore="${gi}"><i class="fa-solid fa-xmark"></i> ${I18n.t("dupNotDuplicate")} <kbd>N</kbd></button>
                            <button class="btn btn-sm btn-primary" data-merge="${gi}"><i class="fa-solid fa-object-group"></i> ${I18n.t("dupMerge")} <kbd>M</kbd></button>
                        </div>
                    </div>
                </div>`).join("") : `<div class="emptyState"><i class="fa-solid fa-check"></i><h5>${I18n.t("dupNone")}</h5></div>`}
        </div>`;

    AdminManager.dupKot();

};

// Egy csoport eltávolítása a listából (összevonás / nem ugyanaz után)
AdminManager.dupKivesz = function (g) {
    AdminManager.dupAdat.valoszinu = AdminManager.dupAdat.valoszinu.filter(x => x.kulcs !== g.kulcs);
    AdminManager.dupRajzol();
    const cur = document.querySelector(".dupGroup.current");
    if (cur) cur.scrollIntoView({ block: "nearest", behavior: "smooth" });
};

AdminManager.dupOsszevon = function (g) {

    const megtart = AdminManager.dupMarad[g.kulcs] || g.javasolt;
    const torlendo = g.tagok.map(t => t.id).filter(id => id !== megtart);

    return fetch("/api/admin/duplicates/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ megtart, torlendo })
    }).then(r => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        AdminManager.dupKivesz(g);
        AdminManager.dupValtozott = true;
    }).catch(err => alert(I18n.t("alertSaveError") + " " + err.message));

};

AdminManager.dupNemUgyanaz = function (g) {
    return fetch("/api/admin/duplicates/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: g.tagok.map(t => t.id) })
    }).then(() => AdminManager.dupKivesz(g));
};

AdminManager.dupKot = function () {

    const box = AdminManager.box();
    const lista = AdminManager.dupCsoportok();

    const clean = document.getElementById("dupClean");
    if (clean) clean.onclick = () => {
        if (!confirm(I18n.f("dupCleanConfirm", { n: AdminManager.dupAdat.biztosFelesleges }))) return;
        clean.disabled = true;
        fetch("/api/admin/duplicates/clean", { method: "POST" })
            .then(r => r.json())
            .then(v => {
                Utils.toast(I18n.f("dupCleaned", { n: v.torolt }));
                DataManager.init();
                AdminManager.renderDups();
            });
    };

    const inv = document.getElementById("invalidDelete");
    if (inv) inv.onclick = () => {
        const d = AdminManager.dupAdat;
        if (!confirm(I18n.f("dupCleanConfirm", { n: d.hibas.length }))) return;
        fetch("/api/admin/invalid/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: d.hibas.map(i => i.id) })
        }).then(() => { DataManager.init(); AdminManager.renderDups(); });
    };

    box.querySelectorAll("[data-fix]").forEach(b => {
        b.onclick = () => NewPropertyManager.startEdit({ id: Number(b.dataset.fix) });
    });

    // Fotók feldolgozása (háttérben, a haladás látszik)
    const foto = document.getElementById("dupPhotoRun");
    if (foto) foto.onclick = () => {
        foto.disabled = true;
        fetch("/api/admin/duplicates/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 2000 }) })
            .then(() => AdminManager.dupFotoFigyel());
    };

    const all = document.getElementById("dupMergeAll");
    if (all) all.onclick = () => {
        const erosek = lista.filter(g => g.eros);
        if (!confirm(I18n.f("dupMergeAllConfirm", { n: erosek.length }))) return;
        all.disabled = true;
        all.innerHTML = `<span class="spinner-border spinner-border-sm"></span> ${I18n.t("dupMerging")}`;
        fetch("/api/admin/duplicates/merge-bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                csoportok: erosek.map(g => {
                    const megtart = AdminManager.dupMarad[g.kulcs] || g.javasolt;
                    return { megtart, torlendo: g.tagok.map(t => t.id).filter(id => id !== megtart) };
                })
            })
        })
            .then(r => r.json())
            .then(v => {
                Utils.toast(I18n.f("dupMergedAll", { n: v.osszevont, torolt: v.torolt }));
                DataManager.init();
                AdminManager.renderDups();
            });
    };

    const skipped = document.getElementById("dupShowSkipped");
    if (skipped) skipped.onclick = () => { AdminManager.dupKihagyott.clear(); AdminManager.dupRajzol(); };

    box.querySelectorAll(".dupGroup").forEach(el => {
        el.addEventListener("click", e => {
            if (e.target.closest("a, button, input")) return;
            AdminManager.dupIdx = Number(el.dataset.g);
            box.querySelectorAll(".dupGroup").forEach(x => x.classList.toggle("current", x === el));
        });
    });

    box.querySelectorAll(".dupKeep input").forEach(r => {
        r.onchange = () => {
            const gEl = r.closest(".dupGroup");
            const g = lista[Number(gEl.dataset.g)];
            AdminManager.dupMarad[g.kulcs] = Number(r.value);
            gEl.querySelectorAll(".dupCol").forEach(c => c.classList.toggle("keep", Number(c.dataset.id) === Number(r.value)));
        };
    });

    box.querySelectorAll("[data-merge]").forEach(b => { b.onclick = () => AdminManager.dupOsszevon(lista[Number(b.dataset.merge)]); });
    box.querySelectorAll("[data-ignore]").forEach(b => { b.onclick = () => AdminManager.dupNemUgyanaz(lista[Number(b.dataset.ignore)]); });
    box.querySelectorAll("[data-skip]").forEach(b => {
        b.onclick = () => { AdminManager.dupKihagyott.add(lista[Number(b.dataset.skip)].kulcs); AdminManager.dupRajzol(); };
    });

    // Egy tag kivétele a csoportból (a többivel nem ugyanaz)
    box.querySelectorAll("[data-out]").forEach(b => {
        b.onclick = () => {
            const gEl = b.closest(".dupGroup");
            const g = lista[Number(gEl.dataset.g)];
            const id = Number(b.dataset.out);
            fetch("/api/admin/duplicates/ignore", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: g.tagok.map(t => t.id), kivesz: id })
            }).then(() => {
                g.tagok = g.tagok.filter(t => t.id !== id);
                if (g.tagok.length < 2) return AdminManager.dupKivesz(g);
                if (!g.tagok.some(t => t.id === (AdminManager.dupMarad[g.kulcs] || g.javasolt))) g.javasolt = g.tagok[0].id;
                AdminManager.dupRajzol();
            });
        };
    });

    // Billentyűk: M összevonás, N nem ugyanaz, → kihagyás, ↑↓ lépés, 1–4 melyik marad
    AdminManager.unbindKeys();

    AdminManager.reviewKeyHandler = e => {

        if (AdminManager.tab !== "dups" || PageManager.current !== "admin") return;
        if (e.target.closest("input[type=text], input[type=number], textarea, select") || e.ctrlKey || e.metaKey || e.altKey) return;

        const most = AdminManager.dupCsoportok();
        const g = most[AdminManager.dupIdx];
        if (!g) return;

        const k = e.key.toLowerCase();

        if (k === "m") { e.preventDefault(); AdminManager.dupOsszevon(g); }
        else if (k === "n") { e.preventDefault(); AdminManager.dupNemUgyanaz(g); }
        else if (e.key === "ArrowRight") { e.preventDefault(); AdminManager.dupKihagyott.add(g.kulcs); AdminManager.dupRajzol(); }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            AdminManager.dupIdx = Math.max(0, Math.min(most.length - 1, AdminManager.dupIdx + (e.key === "ArrowDown" ? 1 : -1)));
            document.querySelectorAll(".dupGroup").forEach((x, i) => x.classList.toggle("current", i === AdminManager.dupIdx));
            const cur = document.querySelector(".dupGroup.current");
            if (cur) cur.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } else if (/^[1-4]$/.test(e.key) && g.tagok[Number(e.key) - 1]) {
            e.preventDefault();
            const r = document.querySelector(`.dupGroup.current input[value="${g.tagok[Number(e.key) - 1].id}"]`);
            if (r) { r.checked = true; r.dispatchEvent(new Event("change")); }
        }

    };

    document.addEventListener("keydown", AdminManager.reviewKeyHandler);

};

// A fotó-feldolgozás haladása
AdminManager.dupFotoFigyel = function () {

    if (AdminManager.pollTimer) clearInterval(AdminManager.pollTimer);

    const frissit = () => fetch("/api/admin/duplicates/images").then(r => r.json()).then(v => {
        const note = document.getElementById("dupPhotoNote");
        if (!note) return;
        if (v.allapot === "fut" || v.allapot === "indul") {
            note.innerHTML = `<span class="spinner-border spinner-border-sm"></span> ${I18n.f("dupPhotosRunning", { kesz: v.kesz || 0, osszes: v.osszes || 0 })}`;
        } else {
            clearInterval(AdminManager.pollTimer);
            AdminManager.pollTimer = null;
            AdminManager.renderDups();
        }
    });

    frissit();
    AdminManager.pollTimer = setInterval(frissit, 2500);

};
