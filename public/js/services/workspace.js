// ============================================================
//  Fotók és hirdetések a munkatársnak (Admin → Értékesítés → Hirdetések)
//
//  Aki az admintól jogot kapott (Admin → Csapat és jogosultságok), az
//  admin felületen ugyanazt látja, mint az admin – de csak azokat a
//  részeket, amelyekre engedélye van. A régi #munka oldal helyett
//  (a régi linkek átirányítanak: services/sellerPage.js).
//
//  PhotoManager: fotók kezelése egy hirdetéshez (a munkatársnak és az adminnak)
//  Workspace.hirdetesek: a hatókörébe tartozó hirdetések (#admin/hirdetesek)
//  Workspace.hirdetesHook: a hirdetés oldalán a munkatárs gombjai
//  A szerver: server/routes/csapat.js
// ============================================================

class PhotoManager {

    // A hirdetés fotói: feltöltés (lekicsinyítve), törlés, sorrend, borítókép
    static nyit(ingatlanId, utana) {

        const esc = Utils.escape;
        const { tartalom, modal } = Svc.modal("pmModal", "modal-xl");
        let adat = null;
        let sor = [];           // [{ id } | { uj: dataURL }]
        let torlendo = [];
        let mentve = false;

        tartalom.innerHTML = `<div class="modal-body"><div class="emptyState"><div class="spinner-border text-primary"></div></div></div>`;

        const rajzol = () => {
            tartalom.innerHTML = `
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fa-solid fa-images" aria-hidden="true"></i> ${I18n.t("pmTitle")} · #${adat.id}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
                </div>
                <div class="modal-body">
                    <p class="small text-body-secondary mb-2">${esc(adat.cim || Types.label(adat.tipus))}${adat.varos ? " · " + esc(CityManager.displayName(adat.varos)) : ""}</p>
                    <label class="pmDrop" for="pmFajl">
                        <i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>
                        <span>${I18n.t("pmDrop")}</span>
                        <input type="file" id="pmFajl" accept="image/jpeg,image/png,image/webp" multiple hidden>
                    </label>
                    <p class="small text-body-secondary mt-2">${I18n.t("pmHelp")}</p>
                    <div class="pmGrid" id="pmGrid">
                        ${sor.map((k, i) => `
                            <figure class="pmItem ${i === 0 ? "cover" : ""}" draggable="true" data-i="${i}">
                                <img src="${k.uj ? k.uj : "/api/kepek/" + k.id}" alt="" loading="lazy">
                                ${i === 0 ? `<span class="pmCover">${I18n.t("pmCover")}</span>` : ""}
                                ${k.uj ? `<span class="pmNew">${I18n.t("pmNew")}</span>` : ""}
                                <figcaption>
                                    <button type="button" class="btn btn-sm btn-light" data-pm-bal="${i}" ${i === 0 ? "disabled" : ""} aria-label="${esc(I18n.t("pmLeft"))}"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
                                    <button type="button" class="btn btn-sm btn-light" data-pm-elso="${i}" ${i === 0 ? "disabled" : ""} title="${esc(I18n.t("pmMakeCover"))}" aria-label="${esc(I18n.t("pmMakeCover"))}"><i class="fa-solid fa-star" aria-hidden="true"></i></button>
                                    <button type="button" class="btn btn-sm btn-light" data-pm-jobb="${i}" ${i === sor.length - 1 ? "disabled" : ""} aria-label="${esc(I18n.t("pmRight"))}"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
                                    <button type="button" class="btn btn-sm btn-danger" data-pm-torol="${i}" aria-label="${esc(I18n.t("finDelete"))}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                                </figcaption>
                            </figure>`).join("") || `<p class="text-body-secondary small">${I18n.t("pmNone")}</p>`}
                    </div>
                    ${(adat.kulso_kepek || []).length ? `<p class="small text-body-secondary mt-3 mb-0"><i class="fa-solid fa-link" aria-hidden="true"></i> ${I18n.f("pmExternal", { n: adat.kulso_kepek.length })}</p>` : ""}
                    <div class="progress mt-3" id="pmProg" hidden><div class="progress-bar" style="width:0%"></div></div>
                </div>
                <div class="modal-footer">
                    <span class="small text-body-secondary me-auto">${I18n.f("pmCount", { n: sor.length })}${torlendo.length ? " · " + I18n.f("pmToDelete", { n: torlendo.length }) : ""}</span>
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
                    <button type="button" class="btn btn-primary" id="pmMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button>
                </div>`;

            const $ = q => tartalom.querySelector(q);
            const csere = (a, b) => { [sor[a], sor[b]] = [sor[b], sor[a]]; rajzol(); };

            $("#pmFajl").onchange = e => hozzaad([...e.target.files]);
            const drop = tartalom.querySelector(".pmDrop");
            drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
            drop.ondragleave = () => drop.classList.remove("over");
            drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); hozzaad([...e.dataTransfer.files]); };

            tartalom.querySelectorAll("[data-pm-bal]").forEach(b => { b.onclick = () => csere(+b.dataset.pmBal, +b.dataset.pmBal - 1); });
            tartalom.querySelectorAll("[data-pm-jobb]").forEach(b => { b.onclick = () => csere(+b.dataset.pmJobb, +b.dataset.pmJobb + 1); });
            tartalom.querySelectorAll("[data-pm-elso]").forEach(b => { b.onclick = () => { const x = sor.splice(+b.dataset.pmElso, 1)[0]; sor.unshift(x); rajzol(); }; });
            tartalom.querySelectorAll("[data-pm-torol]").forEach(b => {
                b.onclick = () => { const x = sor.splice(+b.dataset.pmTorol, 1)[0]; if (x.id) torlendo.push(x.id); rajzol(); };
            });

            // Húzással is rendezhető (asztali gépen)
            let honnan = null;
            tartalom.querySelectorAll(".pmItem").forEach(f => {
                f.ondragstart = () => { honnan = +f.dataset.i; f.classList.add("drag"); };
                f.ondragend = () => f.classList.remove("drag");
                f.ondragover = e => e.preventDefault();
                f.ondrop = e => {
                    e.preventDefault();
                    const hova = +f.dataset.i;
                    if (honnan === null || honnan === hova) return;
                    const x = sor.splice(honnan, 1)[0];
                    sor.splice(hova, 0, x);
                    honnan = null;
                    rajzol();
                };
            });

            $("#pmMent").onclick = ment;
        };

        const hozzaad = fajlok => {
            const kepek = fajlok.filter(f => /^image\/(jpeg|png|webp)$/.test(f.type));
            if (!kepek.length) return;
            Promise.all(kepek.map(f => ImageTools.resize(f).catch(() => null))).then(lista => {
                lista.filter(Boolean).forEach(u => sor.push({ uj: u }));
                rajzol();
            });
        };

        const ment = () => {
            const btn = tartalom.querySelector("#pmMent");
            btn.disabled = true;
            const prog = tartalom.querySelector("#pmProg");
            const ujak = sor.map((k, i) => ({ ...k, i })).filter(k => k.uj);
            const api = body => Svc.api(`/api/csapat/hirdetesek/${adat.id}/kepek`, { method: "PUT", body });

            // 1) törlés + a meglévők sorrendje, 2) az újak 6-osával, 3) a végső sorrend
            const reszek = [];
            for (let i = 0; i < ujak.length; i += 6) reszek.push(ujak.slice(i, i + 6));
            prog.hidden = !reszek.length;
            let lanc = api({ torol: torlendo, sorrend: sor.filter(k => k.id).map(k => k.id) });
            const ujIdk = [];
            reszek.forEach((r, n) => {
                lanc = lanc.then(v => {
                    const elotte = new Set(v.kepek);
                    return api({ uj: r.map(k => k.uj) }).then(v2 => {
                        v2.kepek.filter(id => !elotte.has(id)).forEach((id, j) => { ujIdk.push({ id, i: r[j] ? r[j].i : 999 }); });
                        prog.querySelector(".progress-bar").style.width = Math.round((n + 1) / reszek.length * 100) + "%";
                        return v2;
                    });
                });
            });
            lanc.then(() => {
                // A végső sorrend: a meglévők és az újak a rácson látott helyükön
                const vegso = sor.map((k, i) => k.id ? k.id : (ujIdk.find(x => x.i === i) || {}).id).filter(Boolean);
                return ujak.length ? api({ sorrend: vegso }) : null;
            }).then(() => {
                mentve = true;
                modal.hide();
                MandateDesk.jelez(I18n.t("adsSaved"));
            }).catch(e => { btn.disabled = false; MandateDesk.hiba(e); });
        };

        const el = document.getElementById("pmModal");
        el.addEventListener("hidden.bs.modal", () => { if (mentve && utana) utana(); }, { once: true });

        Svc.api(`/api/csapat/hirdetesek/${ingatlanId}/kepek`).then(a => {
            adat = a;
            sor = a.kepek.map(id => ({ id }));
            rajzol();
        }).catch(e => {
            tartalom.innerHTML = `<div class="modal-body"><div class="alert alert-warning mb-0">${Svc.hiba(e)}</div></div>`;
        });

        modal.show();

    }

}

class Workspace {

    static szuro = { q: "", varos: "", foto: "", megbizas: "" };

    // ---------- Hirdetések (fotók, szerkesztés) ----------

    static hirdetesek(hova) {

        const esc = Utils.escape;
        const sz = Workspace.szuro;
        const c = AuthManager.csapat;
        const varosok = AuthManager.isAdmin() || !c ? CityManager.varosok.map(v => v.nev)
            : [...new Set(c.hozzaferesek.filter(h => h.hatokor === "varos").map(h => h.varos))];

        hova.innerHTML = `
            <div class="mdToolbar">
                <div class="input-group input-group-sm mdSearch">
                    <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
                    <input class="form-control" id="wsQ" value="${esc(sz.q)}" placeholder="${esc(I18n.t("wsSearchPh"))}" aria-label="${esc(I18n.t("wsSearchPh"))}">
                </div>
                ${varosok.length > 1 ? `
                <select class="form-select form-select-sm w-auto" id="wsVaros" aria-label="${esc(I18n.t("detailVaros"))}">
                    <option value="">${I18n.t("allCities")}</option>
                    ${varosok.map(v => `<option value="${esc(v)}" ${sz.varos === v ? "selected" : ""}>${esc(CityManager.displayName(v))}</option>`).join("")}
                </select>` : ""}
                <div class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" role="switch" id="wsFoto" ${sz.foto ? "checked" : ""}>
                    <label class="form-check-label small" for="wsFoto">${I18n.t("wsOnlyNoPhoto")}</label>
                </div>
                <div class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" role="switch" id="wsMb" ${sz.megbizas ? "checked" : ""}>
                    <label class="form-check-label small" for="wsMb">${I18n.t("wsOnlyMandate")}</label>
                </div>
                <div class="ms-auto d-flex flex-wrap gap-2">
                    ${AuthManager.isAdmin() || AuthManager.resz("hirdetes") ? `<a class="btn btn-sm btn-primary" href="#new"><i class="fa-solid fa-circle-plus" aria-hidden="true"></i> ${I18n.t("ovQuickNew")}</a>` : ""}
                    ${AuthManager.isAdmin() || AuthManager.resz("beolvasas") ? `<a class="btn btn-sm btn-outline-primary" href="#admin/import"><i class="fa-solid fa-file-import" aria-hidden="true"></i> ${I18n.t("ovQuickImport")}</a>` : ""}
                    ${AuthManager.isAdmin() ? `<a class="btn btn-sm btn-outline-secondary" href="#properties" title="${Utils.escape(I18n.t("wsBulkHelp"))}"><i class="fa-solid fa-table" aria-hidden="true"></i> ${I18n.t("wsBulk")}</a>` : ""}
                </div>
            </div>
            <div id="wsLista"><div class="emptyState"><div class="spinner-border text-primary"></div></div></div>`;

        const tolt = () => {
            const p = new URLSearchParams();
            if (sz.q) p.set("q", sz.q);
            if (sz.varos) p.set("varos", sz.varos);
            if (sz.foto) p.set("foto", "nincs");
            if (sz.megbizas) p.set("megbizas", "1");
            Svc.api("/api/csapat/hirdetesek?" + p.toString()).then(lista => {
                const el = hova.querySelector("#wsLista");
                if (!el) return;
                el.innerHTML = lista.length ? `<div class="wsListings">${lista.map(i => `
                    <article class="wsListing">
                        <a class="wsThumb" href="#listing/${i.id}">${i.elso_kep ? `<img src="/api/kepek/${i.elso_kep}" alt="" loading="lazy">` : `<i class="fa-regular fa-image" aria-hidden="true"></i>`}</a>
                        <div class="min-w-0 flex-fill">
                            <div class="d-flex justify-content-between gap-2">
                                <b class="text-truncate">${esc(i.cim || Types.label(i.tipus))}</b>
                                ${i.megbizas_id ? `<span class="badge lmBadge m-0"><i class="fa-solid fa-key" aria-hidden="true"></i></span>` : ""}
                            </div>
                            <div class="small text-body-secondary text-truncate">#${i.id} · ${esc(Types.label(i.tipus))} · ${esc(CityManager.displayName(i.varos || ""))}${i.kerulet ? " · " + esc(i.kerulet) : ""} · ${esc(Utils.price(i))}</div>
                            <div class="small ${i.kep_db ? "text-body-secondary" : "text-warning fw-semibold"}"><i class="fa-solid fa-image" aria-hidden="true"></i> ${I18n.f("pmCount", { n: i.kep_db })}${i.kulso_db ? ` + ${i.kulso_db} ${I18n.t("wsExternal")}` : ""} · ${esc(Utils.ago(i.updated_at))}</div>
                            <div class="d-flex flex-wrap gap-1 mt-2">
                                ${i.jog.kepek ? `<button type="button" class="btn btn-sm btn-primary" data-ws-foto="${i.id}"><i class="fa-solid fa-images" aria-hidden="true"></i> ${I18n.t("pmTitle")}</button>` : ""}
                                ${i.jog.hirdetes ? `<button type="button" class="btn btn-sm btn-outline-primary" data-ws-szerk="${i.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("detailEdit")}</button>` : ""}
                                <a class="btn btn-sm btn-link" href="#listing/${i.id}">${I18n.t("wsView")}</a>
                            </div>
                        </div>
                    </article>`).join("")}</div>
                    ${lista.length >= 300 ? `<p class="small text-body-secondary mt-2">${I18n.t("wsMore")}</p>` : ""}` : `<p class="text-body-secondary py-4 text-center">${I18n.t("wsNoListings")}</p>`;
                el.querySelectorAll("[data-ws-foto]").forEach(b => { b.onclick = () => PhotoManager.nyit(Number(b.dataset.wsFoto), tolt); });
                el.querySelectorAll("[data-ws-szerk]").forEach(b => { b.onclick = () => NewPropertyManager.startEdit({ id: Number(b.dataset.wsSzerk) }); });
            }).catch(() => {
                const el = hova.querySelector("#wsLista");
                if (el) el.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
            });
        };

        let idozito = null;
        hova.querySelector("#wsQ").oninput = e => { sz.q = e.target.value.trim(); clearTimeout(idozito); idozito = setTimeout(tolt, 300); };
        const v = hova.querySelector("#wsVaros");
        if (v) v.onchange = e => { sz.varos = e.target.value; tolt(); };
        hova.querySelector("#wsFoto").onchange = e => { sz.foto = e.target.checked ? "1" : ""; tolt(); };
        hova.querySelector("#wsMb").onchange = e => { sz.megbizas = e.target.checked ? "1" : ""; tolt(); };

        tolt();

    }

}

// ===================== BEKÖTÉS: a hirdetés oldala =====================

document.addEventListener("DOMContentLoaded", () => {

    // A hirdetés oldalán: a munkatárs gombjai (fotók, szerkesztés)
    if (typeof ListingPage !== "undefined" && !ListingPage._csapatHook) {
        ListingPage._csapatHook = true;
        const render = ListingPage.render;
        ListingPage.render = function (i) {
            render.call(this, i);
            try { Workspace.hirdetesHook(i); } catch (e) { console.error(e); }
        };
    }

});

// A munkatárs (nem tulajdonos, nem admin) a jogai szerint
Workspace.hirdetesHook = function (i) {
    const c = AuthManager.csapat;
    if (!c || !i || AuthManager.isAdmin() || AuthManager.owns(i)) return;
    const box = document.getElementById("listingContent");
    const side = box && box.querySelector(".listingSide");
    if (!side || document.getElementById("wsListingCard")) return;
    Svc.api("/api/csapat/hirdetesek/" + i.id + "/kepek").then(a => {
        // Ha fotó-joga van ehhez a hirdetéshez: a kártya (+ szerkesztés, ha arra is van joga)
        side.insertAdjacentHTML("afterbegin", `
            <div class="card mb-3 wsListingCard" id="wsListingCard">
                <div class="card-body d-flex flex-wrap gap-2 align-items-center">
                    <span class="small fw-semibold me-auto"><i class="fa-solid fa-briefcase" aria-hidden="true"></i> ${I18n.t("wsTitle")}</span>
                    <button type="button" class="btn btn-sm btn-primary" id="wsLFoto"><i class="fa-solid fa-images" aria-hidden="true"></i> ${I18n.t("pmTitle")}</button>
                    ${a.jog && a.jog.hirdetes ? `<button type="button" class="btn btn-sm btn-outline-primary" id="wsLSzerk"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("detailEdit")}</button>` : ""}
                </div>
            </div>`);
        document.getElementById("wsLFoto").onclick = () => PhotoManager.nyit(i.id, () => ListingPage.show(i.id));
        const sz = document.getElementById("wsLSzerk");
        if (sz) sz.onclick = () => NewPropertyManager.startEdit(i);
    }).catch(() => { /* nincs joga ehhez a hirdetéshez */ });
};
