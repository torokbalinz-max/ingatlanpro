// ============================================================
//  Munkaterületem (#munka) – a munkatársak „kis admin” felülete
//
//  Aki az admintól jogot kapott (Admin → Csapat és jogosultságok), itt
//  csak azt látja és kezeli, amire engedélye van:
//    #munka                    áttekintés: a jogaim, mi vár rám
//    #munka/hirdetesek         a hatókörömbe tartozó hirdetések: fotók
//                              (feltöltés, törlés, sorrend), szerkesztés
//    #munka/megbizasok[/id]    megbízások (értékesítési asztal)
//    #munka/megtekintesek      bemutatások: időpont, cím, vevő, lezárás
//
//  PhotoManager: fotók kezelése egy hirdetéshez (a munkatársnak és az adminnak)
//  A szerver: server/routes/csapat.js, /api/ertekesites (megbizas.js)
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

    static FULEK = [
        { k: "attekintes", ikon: "fa-solid fa-gauge", jog: null },
        { k: "hirdetesek", ikon: "fa-solid fa-images", jog: "kepek" },
        { k: "megbizasok", ikon: "fa-solid fa-key", jog: "megbizas_lat" },
        { k: "megtekintesek", ikon: "fa-solid fa-door-open", jog: "megtekintes" }
    ];

    static szuro = { q: "", varos: "", foto: "", megbizas: "" };

    static jogom(j) {
        const c = AuthManager.csapat;
        return !!(c && c.jogok && c.jogok[j]);
    }

    static show(param) {

        const box = document.getElementById("munkaContent");
        if (!box) return;
        const esc = Utils.escape;
        const c = AuthManager.csapat;

        if (!c) {
            box.innerHTML = AuthManager.isAdmin() ? `
                <div class="emptyState">
                    <i class="fa-solid fa-user-shield"></i>
                    <h5>${I18n.t("wsAdminTitle")}</h5>
                    <p>${I18n.t("wsAdminText")}</p>
                    <a class="btn btn-primary" href="#admin/csapat">${I18n.t("tmTeamTitle")}</a>
                </div>` : `
                <div class="emptyState">
                    <i class="fa-solid fa-lock"></i>
                    <h5>${I18n.t("wsNoAccessTitle")}</h5>
                    <p>${I18n.t("wsNoAccessText")}</p>
                </div>`;
            return;
        }

        const fulek = Workspace.FULEK.filter(f => !f.jog || Workspace.jogom(f.jog));
        const m = location.hash.match(/^#munka\/([a-z]+)/);
        let ful = m ? m[1] : (param || "attekintes");
        if (!fulek.some(f => f.k === ful)) ful = "attekintes";

        box.innerHTML = `
            <div class="wsHead">
                <div>
                    <h2 class="mb-1"><i class="fa-solid fa-briefcase" aria-hidden="true"></i> ${I18n.t("wsTitle")}</h2>
                    <p class="text-body-secondary mb-0">${esc(AuthManager.user ? AuthManager.user.nev : "")} · <span class="badge tmRole r-${esc(c.szerep)}">${esc(I18n.t("tmRole_" + c.szerep))}</span></p>
                </div>
            </div>
            <nav class="mdTabs mb-3" role="tablist" aria-label="${esc(I18n.t("wsTitle"))}">
                ${fulek.map(f => `
                    <a role="tab" class="mdTab ${f.k === ful ? "active" : ""}" href="#munka/${f.k}" aria-selected="${f.k === ful}">
                        <i class="${f.ikon}" aria-hidden="true"></i><span>${I18n.t("wsTab_" + f.k)}</span>
                    </a>`).join("")}
            </nav>
            <div id="wsFul"></div>`;

        const hova = box.querySelector("#wsFul");
        if (ful === "hirdetesek") Workspace.hirdetesek(hova);
        else if (ful === "megbizasok") MandateDesk.nyit(hova, { base: "#munka/megbizasok" });
        else if (ful === "megtekintesek") Workspace.megtekintesek(hova);
        else Workspace.attekintes(hova, fulek);

    }

    // ---------- Áttekintés ----------

    static attekintes(hova, fulek) {

        const esc = Utils.escape;
        const c = AuthManager.csapat;

        hova.innerHTML = `
            <div class="row g-4">
                <div class="col-lg-6">
                    <div class="card h-100">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-key" aria-hidden="true"></i> ${I18n.t("wsMyAccess")}</h5></div>
                        <div class="card-body">
                            <ul class="tmAccess">
                                ${c.hozzaferesek.map(h => `
                                    <li>
                                        <span class="tmScope">${AdminManager.teamHatokor(h)}${h.lejar ? ` <small class="text-body-secondary">(${I18n.t("tmUntil")} ${esc(Svc.nap(h.lejar))})</small>` : ""}</span>
                                        <span class="tmPerms">${h.jogok.filter(j => AdminManager.TEAM_JOGOK.includes(j)).map(j => `<span><i class="${AdminManager.TEAM_IKON[j]}" aria-hidden="true"></i> ${esc(I18n.t("tmPermShort_" + j))}</span>`).join("")}</span>
                                    </li>`).join("")}
                                ${c.hozzarendelt.map(h => `
                                    <li>
                                        <span class="tmScope"><a href="#munka/megbizasok/${h.megbizas_id}">${I18n.t("tmScope_megbizas")} #${h.megbizas_id}</a> <small class="text-body-secondary">(${I18n.t("wsAssigned")})</small></span>
                                        <span class="tmPerms">${h.jogok.filter(j => AdminManager.TEAM_JOGOK.includes(j)).map(j => `<span><i class="${AdminManager.TEAM_IKON[j]}" aria-hidden="true"></i> ${esc(I18n.t("tmPermShort_" + j))}</span>`).join("")}</span>
                                    </li>`).join("")}
                                ${!c.hozzaferesek.length && !c.hozzarendelt.length ? `<li class="text-body-secondary small">${I18n.t("tmNoAccess")}</li>` : ""}
                            </ul>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="card h-100">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${I18n.t("wsWaiting")}</h5></div>
                        <div class="card-body"><ul class="mdTodoList" id="wsTodo"><li class="small text-body-secondary">…</li></ul></div>
                    </div>
                </div>
            </div>
            <div class="wsShortcuts mt-4">
                ${fulek.filter(f => f.k !== "attekintes").map(f => `
                    <a class="wsShortcut" href="#munka/${f.k}">
                        <i class="${f.ikon}" aria-hidden="true"></i>
                        <b>${I18n.t("wsTab_" + f.k)}</b>
                        <small>${I18n.t("wsTabHelp_" + f.k)}</small>
                    </a>`).join("")}
            </div>`;

        // Mi vár rám: fotó nélküli hirdetések, megbízás-teendők, közelgő bemutatások
        const sorok = [];
        const keresek = [];
        if (Workspace.jogom("kepek")) keresek.push(Svc.api("/api/csapat/hirdetesek?foto=nincs").then(l => {
            if (l.length) sorok.push({ szint: "kozepes", szoveg: I18n.f("wsTodoNoPhotos", { n: l.length }), link: "#munka/hirdetesek" });
        }).catch(() => { }));
        if (Workspace.jogom("megbizas_lat")) keresek.push(Svc.api("/api/ertekesites/megbizasok").then(d => {
            d.teendok.forEach(x => sorok.push({ szint: x.szint, szoveg: `${MandateDesk.teendoSzoveg(x)} – ${x.szam || ""}`, link: `#munka/megbizasok/${x.megbizas_id}/${x.ful}` }));
        }).catch(() => { }));
        if (Workspace.jogom("megtekintes")) keresek.push(Svc.api("/api/csapat/megtekintesek").then(l => {
            const kov = l.filter(t => t.statusz === "egyeztetve" && t.idopont && new Date(t.idopont) > Date.now() - 2 * 3600 * 1000);
            kov.slice(0, 5).forEach(t => sorok.push({ szint: "info", szoveg: `${I18n.t("wsViewingAt")} ${Svc.ido(t.idopont)} – ${MandateDesk.hely(t)}`, link: "#munka/megtekintesek" }));
        }).catch(() => { }));

        Promise.all(keresek).then(() => {
            const ul = hova.querySelector("#wsTodo");
            if (!ul) return;
            const sorrend = { magas: 0, kozepes: 1, info: 2 };
            sorok.sort((a, b) => sorrend[a.szint] - sorrend[b.szint]);
            ul.innerHTML = sorok.length ? sorok.slice(0, 12).map(x => `
                <li class="mdTodo ${x.szint}">
                    <span class="mdTodoDot" aria-hidden="true"></span>
                    <div class="flex-fill min-w-0">${esc(x.szoveg)}</div>
                    <a class="btn btn-sm btn-outline-primary text-nowrap" href="${x.link}">${I18n.t("mdOpen")}</a>
                </li>`).join("") : `<li class="text-body-secondary small"><i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i> ${I18n.t("mdNoTodos")}</li>`;
        });

    }

    // ---------- Hirdetések (fotók, szerkesztés) ----------

    static hirdetesek(hova) {

        const esc = Utils.escape;
        const sz = Workspace.szuro;
        const c = AuthManager.csapat;
        const varosok = [...new Set(c.hozzaferesek.filter(h => h.hatokor === "varos").map(h => h.varos))];

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

    // ---------- Megtekintések (bemutató) ----------

    static megtekintesek(hova) {

        const esc = Utils.escape;
        hova.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        Svc.api("/api/csapat/megtekintesek").then(lista => {

            const most = Date.now();
            const csop = {
                kozelgo: lista.filter(t => t.statusz === "egyeztetve" && t.idopont && new Date(t.idopont) >= most - 2 * 3600 * 1000),
                lezarando: lista.filter(t => t.statusz === "egyeztetve" && t.idopont && new Date(t.idopont) < most - 2 * 3600 * 1000),
                kert: lista.filter(t => t.statusz === "kert"),
                korabbi: lista.filter(t => ["megtortent", "elmaradt", "lemondva"].includes(t.statusz))
            };

            const sor = t => `
                <li class="${t.statusz}">
                    <div class="d-flex flex-wrap justify-content-between gap-2">
                        <div class="min-w-0">
                            <b>${t.idopont ? esc(Svc.ido(t.idopont)) : esc(t.javasolt || I18n.t("mbNoTimeYet"))}</b>
                            ${t.enyem ? ` <span class="badge text-bg-primary">${I18n.t("wsMine")}</span>` : ""}
                            <div class="small"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(MandateDesk.hely(t))} · ${esc(Types.label(t.tipus))}
                                ${t.cim || t.varos ? ` · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([t.cim, t.telepules, t.varos].filter(Boolean).join(", "))}" target="_blank" rel="noopener">${I18n.t("wsMap")}</a>` : ""}
                                ${t.ingatlan_id ? ` · <a href="#listing/${t.ingatlan_id}">${I18n.t("mmListing")}</a>` : ""}</div>
                            <div class="small"><i class="fa-solid fa-user" aria-hidden="true"></i> ${esc(t.erdeklodo_nev || "–")} ${MandateDesk.tel(t.erdeklodo_telefon)}</div>
                            <div class="small text-body-secondary"><i class="fa-solid fa-user-tag" aria-hidden="true"></i> ${I18n.t("mdSeller")}: ${esc(t.elado_nev || "–")} ${MandateDesk.tel(t.elado_telefon)}</div>
                        </div>
                        <span class="badge text-bg-light align-self-start">${esc(I18n.t("mbVw_" + t.statusz))}</span>
                    </div>
                    ${t.visszajelzes ? `<div class="small mt-1"><i class="fa-regular fa-comment" aria-hidden="true"></i> ${esc(t.visszajelzes)}</div>` : ""}
                    ${t.statusz === "egyeztetve" ? `
                    <div class="d-flex flex-wrap gap-1 mt-2">
                        <button type="button" class="btn btn-sm btn-success" data-ws-lezar="${t.id}:megtortent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("mbVw_megtortent")}</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-ws-lezar="${t.id}:elmaradt">${I18n.t("mbVw_elmaradt")}</button>
                    </div>` : ""}
                </li>`;

            const blokk = (k, ikon) => csop[k].length ? `
                <h6 class="mdGroupHead mt-3"><i class="${ikon}" aria-hidden="true"></i> ${I18n.t("mdVwGroup_" + k)} <span class="badge text-bg-light">${csop[k].length}</span></h6>
                <ul class="mbTimeline">${csop[k].map(sor).join("")}</ul>` : "";

            hova.innerHTML = lista.length ? `
                <p class="small text-body-secondary">${I18n.t("wsViewingsHelp")}</p>
                ${blokk("lezarando", "fa-solid fa-flag-checkered")}
                ${blokk("kozelgo", "fa-regular fa-calendar-check")}
                ${blokk("kert", "fa-solid fa-hourglass-half")}
                ${blokk("korabbi", "fa-solid fa-box-archive")}` : `
                <div class="emptyState"><i class="fa-regular fa-calendar"></i><h5>${I18n.t("mbNoViewings")}</h5><p>${I18n.t("wsNoViewingsText")}</p></div>`;

            hova.querySelectorAll("[data-ws-lezar]").forEach(b => {
                b.onclick = () => {
                    const [tid, statusz] = b.dataset.wsLezar.split(":");
                    const vj = prompt(I18n.t(statusz === "megtortent" ? "mdFeedbackPrompt" : "wsMissedPrompt"), "");
                    if (vj === null) return;
                    b.disabled = true;
                    Svc.api("/api/csapat/megtekintesek/" + tid, { method: "PUT", body: { statusz, visszajelzes: vj } })
                        .then(() => { MandateDesk.jelez(I18n.t("adsSaved")); Workspace.megtekintesek(hova); })
                        .catch(e => { b.disabled = false; MandateDesk.hiba(e); });
                };
            });

        }).catch(() => { hova.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`; });

    }

}

// ===================== BEKÖTÉS: oldal, menü, hirdetés =====================

// A pageManager.js a lap végén töltődik: a bekötés a DOMContentLoaded-kor (az app indulása előtt)
document.addEventListener("DOMContentLoaded", () => {

    // Az oldal: #munka (belépés kell)
    PageManager.PAGES.munka = { icon: "fa-solid fa-briefcase", label: "wsTitle", login: true };
    if (!PageManager.LOGIN_KELL.includes("munka")) PageManager.LOGIN_KELL.push("munka");

    const show = PageManager.show;
    PageManager.show = function (target, opts) {
        const r = show.call(this, target, opts);
        if (PageManager.current === "munka" && /^munka/.test(String(target || "").replace(/^#/, ""))) Workspace.show(PageManager.parse(target).param);
        return r;
    };

    // A munkatárs adatai a /api/me-ből; a menüpont csak neki (és az adminnak) látszik
    const setMe = AuthManager.setMe;
    AuthManager.setMe = function (me) {
        AuthManager.csapat = (me && me.csapat) || null;
        const r = setMe.call(this, me);
        Workspace.menu();
        return r;
    };

    const apply = AuthManager.apply;
    AuthManager.apply = function () {
        const r = apply.call(this);
        Workspace.menu();
        return r;
    };

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

Workspace.menu = function () {
    const lathato = !!AuthManager.csapat;
    document.querySelectorAll(".team-only").forEach(el => { el.hidden = !lathato; });
};

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
