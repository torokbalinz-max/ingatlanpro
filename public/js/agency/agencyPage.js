// ============================================================
//  Ingatlaniroda
//
//   #iroda                 az irodám kezelése (ha több van: az első)
//   #iroda/<id>            egy adott irodám
//   #iroda/uj              új iroda létrehozása
//   #irodak/<id>           az iroda nyilvános oldala (bárki)
//
//  Kezelés fülei:
//   Hirdetések  mappák, szűrők, tömeges műveletek, belső adatok
//   Ügynökök    a hirdetéseken megjelenő kapcsolattartók
//   Tagok       kik kezelhetik az iroda hirdetéseit (fiókkal)
//   Adatok      név, elérhetőség, leírás; törlés
// ============================================================

class AgencyPage {

    static iroda = null;          // a kezelt iroda (nyilvános adatokkal, ügynökökkel)
    static hirdetesek = [];
    static tab = "hirdetesek";
    static kijelolt = new Set();
    static szuro = { q: "", statusz: "", ugynok: "", mappa: null, tipus: "" };
    static rendezes = "uj";

    static TABS = [
        { key: "hirdetesek", icon: "fa-solid fa-house-user", label: "agTabListings" },
        { key: "ugynokok", icon: "fa-solid fa-id-badge", label: "agTabAgents" },
        { key: "tagok", icon: "fa-solid fa-users", label: "agTabMembers" },
        { key: "adatok", icon: "fa-solid fa-building", label: "agTabDetails" }
    ];

    static box() {
        return document.getElementById("irodaContent");
    }

    static spinner() {
        AgencyPage.box().innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;
    }

    static json(r) {
        return r.json().then(v => {
            if (!r.ok) {
                const e = new Error(v.error || ("HTTP " + r.status));
                e.kod = v.error;
                throw e;
            }
            return v;
        });
    }

    static hibaSzoveg(e) {
        const k = "agErr_" + (e && e.kod);
        return I18n.t(k) !== k ? I18n.t(k) : I18n.t("alertSaveError");
    }

    static api(url, method = "GET", body) {
        return fetch(url, {
            method,
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined
        }).then(AgencyPage.json);
    }

    // ---------- belépési pont ----------

    static show(param) {

        if (!AuthManager.loggedIn()) return;

        const [elso, masodik] = String(param || "").split(":");

        if (elso === "uj" || (!AuthManager.irodak.length && !elso)) {
            return AgencyPage.letrehozas();
        }

        const id = Number(elso) || (AuthManager.irodak[0] && AuthManager.irodak[0].id);

        if (masodik && AgencyPage.TABS.some(t => t.key === masodik)) AgencyPage.tab = masodik;

        if (!AgencyPage.iroda || AgencyPage.iroda.id !== id) {
            AgencyPage.kijelolt.clear();
            AgencyPage.szuro = { q: "", statusz: "", ugynok: "", mappa: null, tipus: "" };
        }

        AgencyPage.spinner();

        Promise.all([
            AgencyPage.api("/api/irodak/" + id),
            AgencyPage.api(`/api/irodak/${id}/hirdetesek`).catch(() => [])
        ]).then(([iroda, hirdetesek]) => {

            if (!iroda.jog || !iroda.jog.tag) {
                location.hash = "#irodak/" + id;
                return;
            }

            DataManager.prepare(hirdetesek);
            AgencyPage.iroda = iroda;
            AgencyPage.hirdetesek = hirdetesek;
            AgencyPage.render();

        }).catch(() => {
            AgencyPage.box().innerHTML = `<div class="emptyState"><i class="fa-solid fa-circle-exclamation"></i><h5>${I18n.t("listingNotFound")}</h5></div>`;
        });

    }

    static rerender() {
        if (PageManager.current === "iroda" && AgencyPage.iroda) AgencyPage.render();
    }

    static reload() {
        AuthManager.refresh().then(() => AgencyPage.show(String(AgencyPage.iroda ? AgencyPage.iroda.id : "")));
    }

    // ---------- új iroda ----------

    static letrehozas() {

        AgencyPage.iroda = null;

        AgencyPage.box().innerHTML = `
            <div class="pageHeader">
                <div class="pageHeaderRow">
                    <div>
                        <h2 class="mb-0"><i class="fa-solid fa-briefcase"></i> ${I18n.t("agCreateTitle")}</h2>
                        <p class="text-body-secondary mb-0">${I18n.t("agCreateSub")}</p>
                    </div>
                </div>
            </div>
            <div class="row g-4">
                <div class="col-lg-7">
                    <form class="card" id="agCreate">
                        <div class="card-body">
                            ${AgencyPage.adatUrlap({})}
                            <div class="accMsg alert alert-danger small py-2 mt-3" hidden></div>
                            <div class="d-flex gap-2 justify-content-end mt-3">
                                ${AuthManager.irodak.length ? `<a class="btn btn-outline-secondary" href="#iroda">${I18n.t("cancel")}</a>` : ""}
                                <button class="btn btn-primary" type="submit"><i class="fa-solid fa-plus"></i> ${I18n.t("agCreateBtn")}</button>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="col-lg-5">
                    <div class="card agBenefits">
                        <div class="card-body">
                            <h6>${I18n.t("agWhatTitle")}</h6>
                            <ul class="small mb-0">
                                <li>${I18n.t("agWhat1")}</li>
                                <li>${I18n.t("agWhat2")}</li>
                                <li>${I18n.t("agWhat3")}</li>
                                <li>${I18n.t("agWhat4")}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>`;

        document.getElementById("agCreate").onsubmit = e => {
            e.preventDefault();
            const msg = e.target.querySelector(".accMsg");
            AgencyPage.api("/api/irodak", "POST", AgencyPage.urlapAdat(e.target))
                .then(ir => AuthManager.refresh().then(() => { location.hash = "#iroda/" + ir.id; }))
                .catch(err => { msg.hidden = false; msg.innerText = AgencyPage.hibaSzoveg(err); });
        };

    }

    static adatUrlap(ir) {
        const esc = Utils.escape;
        return `
            <div class="row g-3">
                <div class="col-12">
                    <label class="form-label req" for="agNev">${I18n.t("agName")}</label>
                    <input class="form-control" id="agNev" name="nev" maxlength="120" required value="${esc(ir.nev || "")}">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="agTel">${I18n.t("accPhone")}</label>
                    <input class="form-control" id="agTel" name="telefon" type="tel" maxlength="40" value="${esc(ir.telefon || "")}">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="agEmail">${I18n.t("authEmail")}</label>
                    <input class="form-control" id="agEmail" name="email" type="email" maxlength="160" value="${esc(ir.email || "")}">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="agWeb">${I18n.t("agWebsite")}</label>
                    <input class="form-control" id="agWeb" name="weboldal" maxlength="300" placeholder="https://" value="${esc(ir.weboldal || "")}">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="agVaros">${I18n.t("newVaros")}</label>
                    <select class="form-select" id="agVaros" name="varos">
                        <option value="">—</option>
                        ${(CityManager.varosok || []).map(v => `<option value="${esc(v.nev)}" ${v.nev === ir.varos ? "selected" : ""}>${esc(CityManager.displayName(v.nev))}</option>`).join("")}
                    </select>
                </div>
                <div class="col-12">
                    <label class="form-label" for="agCim">${I18n.t("agAddress")}</label>
                    <input class="form-control" id="agCim" name="cim" maxlength="200" value="${esc(ir.cim || "")}">
                </div>
                <div class="col-12">
                    <label class="form-label" for="agLeiras">${I18n.t("agAbout")}</label>
                    <textarea class="form-control" id="agLeiras" name="leiras" rows="4" maxlength="3000">${esc(ir.leiras || "")}</textarea>
                </div>
            </div>`;
    }

    static urlapAdat(form) {
        const o = {};
        ["nev", "telefon", "email", "weboldal", "varos", "cim", "leiras"].forEach(k => {
            const el = form.querySelector(`[name="${k}"]`);
            if (el) o[k] = el.value.trim();
        });
        return o;
    }

    // ---------- keret ----------

    static render() {

        const ir = AgencyPage.iroda;
        const esc = Utils.escape;
        const tobb = AuthManager.irodak.length > 1;
        const szerep = (AuthManager.irodak.find(x => x.id === ir.id) || {}).szerep || (AuthManager.isAdmin() ? "vezeto" : "tag");

        AgencyPage.box().innerHTML = `
            <div class="pageHeader">
                <div class="pageHeaderRow">
                    <div class="d-flex align-items-center gap-3 min-w-0">
                        <span class="agLogo">${esc((ir.nev || "?").slice(0, 1).toUpperCase())}</span>
                        <div class="min-w-0">
                            <h2 class="mb-0 text-truncate">${esc(ir.nev)} ${ir.ellenorzott ? `<i class="fa-solid fa-circle-check text-primary fs-5" title="${esc(I18n.t("agVerified"))}"></i>` : ""}</h2>
                            <p class="text-body-secondary mb-0 small">
                                ${I18n.t(szerep === "vezeto" ? "agRoleManager" : "agRoleMember")}
                                · <a href="#irodak/${ir.id}">${I18n.t("agPublicPage")} <i class="fa-solid fa-arrow-up-right-from-square small"></i></a>
                            </p>
                        </div>
                    </div>
                    <div class="d-flex gap-2 flex-wrap agHeadActions">
                        ${tobb ? `<select class="form-select form-select-sm w-auto" id="agSwitch" aria-label="${esc(I18n.t("agSwitch"))}">
                            ${AuthManager.irodak.map(x => `<option value="${x.id}" ${x.id === ir.id ? "selected" : ""}>${esc(x.nev)}</option>`).join("")}
                        </select>` : ""}
                        <button class="btn btn-primary btn-sm" id="agNewListing"><i class="fa-solid fa-plus"></i> ${I18n.t("navPost")}</button>
                    </div>
                </div>
            </div>

            <div class="typeTabs mb-4" role="tablist">
                ${AgencyPage.TABS.map(t => `
                    <a class="typeTab ${t.key === AgencyPage.tab ? "active" : ""}" href="#iroda/${ir.id}:${t.key}" role="tab" aria-selected="${t.key === AgencyPage.tab}">
                        <i class="${t.icon}" aria-hidden="true"></i> ${I18n.t(t.label)}
                        ${t.key === "hirdetesek" ? `<span class="badge rounded-pill text-bg-light">${AgencyPage.hirdetesek.length}</span>` : ""}
                        ${t.key === "ugynokok" ? `<span class="badge rounded-pill text-bg-light">${ir.ugynokok.length}</span>` : ""}
                    </a>`).join("")}
            </div>

            <div id="agBody"></div>`;

        const sw = document.getElementById("agSwitch");
        if (sw) sw.onchange = () => { location.hash = "#iroda/" + sw.value; };

        document.getElementById("agNewListing").onclick = () => {
            NewPropertyManager.prefIroda = ir.id;
            NewPropertyManager.editId = null;
            PageManager.show("new");
        };

        const body = document.getElementById("agBody");

        ({
            hirdetesek: () => AgencyPage.hirdetesTab(body),
            ugynokok: () => AgencyPage.ugynokTab(body, szerep === "vezeto"),
            tagok: () => AgencyPage.tagTab(body, szerep === "vezeto"),
            adatok: () => AgencyPage.adatTab(body, szerep === "vezeto")
        })[AgencyPage.tab]();

    }

    // ---------- hirdetések ----------

    static statuszOf(i) {
        if (i.statusz === "archiv") return "archiv";
        if (i.eladva) return "eladva";
        if (i.statusz === "fuggo" || i.ellenorzott === false) return "fuggo";
        if (i.statusz === "nem_elerheto") return "nem_elerheto";
        return "aktiv";
    }

    static statuszBadge(i) {
        const s = AgencyPage.statuszOf(i);
        const cls = { aktiv: "text-bg-success", archiv: "text-bg-secondary", eladva: "text-bg-danger", fuggo: "text-bg-warning", nem_elerheto: "text-bg-secondary" }[s];
        return `<span class="badge ${cls}">${I18n.t("agStatus_" + s)}</span>`;
    }

    static mappak() {
        const m = new Map();
        AgencyPage.hirdetesek.forEach(i => {
            const k = i.iroda_mappa || "";
            m.set(k, (m.get(k) || 0) + 1);
        });
        return [...m.entries()].filter(([k]) => k).sort((a, b) => a[0].localeCompare(b[0], "hu"));
    }

    static szurt() {

        const f = AgencyPage.szuro;
        const q = f.q.toLowerCase();

        const lista = AgencyPage.hirdetesek.filter(i => {
            if (f.statusz && AgencyPage.statuszOf(i) !== f.statusz) return false;
            if (f.ugynok === "nincs" && i.ugynok_id) return false;
            if (f.ugynok && f.ugynok !== "nincs" && String(i.ugynok_id) !== f.ugynok) return false;
            if (f.mappa !== null && (i.iroda_mappa || "") !== f.mappa) return false;
            if (f.tipus && i.tipus !== f.tipus) return false;
            if (q) {
                const hay = [i.cim, i.iroda_ref, "#" + i.id, i.kerulet, i.telepules, i.iroda_megjegyzes].filter(Boolean).join(" ").toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        const cmp = {
            uj: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
            regi: (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
            arNo: (a, b) => (a.ar || 0) - (b.ar || 0),
            arCsokken: (a, b) => (b.ar || 0) - (a.ar || 0),
            ref: (a, b) => String(a.iroda_ref || "~").localeCompare(String(b.iroda_ref || "~"), "hu", { numeric: true }),
            erdeklodes: (a, b) => ((b.uzenet_db || 0) + (b.kedvenc_db || 0)) - ((a.uzenet_db || 0) + (a.kedvenc_db || 0))
        }[AgencyPage.rendezes];

        return lista.sort(cmp);

    }

    static hirdetesTab(el) {

        const esc = Utils.escape;
        const ir = AgencyPage.iroda;
        const L = AgencyPage.hirdetesek;
        const szam = s => L.filter(i => AgencyPage.statuszOf(i) === s).length;
        const f = AgencyPage.szuro;
        const mappak = AgencyPage.mappak();
        const nincsMappa = L.filter(i => !i.iroda_mappa).length;

        const ugynokNev = id => {
            const u = ir.ugynokok.find(x => x.id === id);
            return u ? u.nev : "";
        };

        el.innerHTML = `
            <div class="agStats">
                ${[["", "agStatAll", L.length], ["aktiv", "agStatus_aktiv", szam("aktiv")], ["fuggo", "agStatus_fuggo", szam("fuggo")],
                   ["eladva", "agStatus_eladva", szam("eladva")], ["archiv", "agStatus_archiv", szam("archiv")]]
                    .map(([k, l, n]) => `<button type="button" class="agStat ${f.statusz === k ? "active" : ""}" data-stat="${k}"><b>${n}</b><span>${I18n.t(l)}</span></button>`).join("")}
                <div class="agStat static"><b>${L.reduce((s, i) => s + (i.uzenet_db || 0), 0)}</b><span>${I18n.t("agStatMessages")}</span></div>
            </div>

            <div class="row g-4">
                <div class="col-lg-3">
                    <div class="card agFolders">
                        <div class="card-header d-flex align-items-center justify-content-between">
                            <h6 class="mb-0"><i class="fa-regular fa-folder"></i> ${I18n.t("agFolders")}</h6>
                        </div>
                        <div class="list-group list-group-flush">
                            <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between ${f.mappa === null ? "active" : ""}" data-folder="__all">
                                <span><i class="fa-solid fa-layer-group"></i> ${I18n.t("agAllListings")}</span><span class="badge text-bg-light">${L.length}</span>
                            </button>
                            ${mappak.map(([m, n]) => `
                                <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between ${f.mappa === m ? "active" : ""}" data-folder="${esc(m)}">
                                    <span class="text-truncate"><i class="fa-regular fa-folder"></i> ${esc(m)}</span><span class="badge text-bg-light">${n}</span>
                                </button>`).join("")}
                            <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between ${f.mappa === "" ? "active" : ""}" data-folder="">
                                <span class="text-body-secondary"><i class="fa-regular fa-folder-open"></i> ${I18n.t("agNoFolder")}</span><span class="badge text-bg-light">${nincsMappa}</span>
                            </button>
                        </div>
                        <div class="card-body small text-body-secondary">${I18n.t("agFoldersHelp")}</div>
                    </div>
                </div>

                <div class="col-lg-9">
                    <div class="agFilters">
                        <div class="input-group input-group-sm agSearch">
                            <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                            <input type="search" class="form-control" id="agQ" placeholder="${esc(I18n.t("agSearchPh"))}" value="${esc(f.q)}" aria-label="${esc(I18n.t("agSearchPh"))}">
                        </div>
                        <select class="form-select form-select-sm" id="agFAgent" aria-label="${esc(I18n.t("agAgent"))}">
                            <option value="">${I18n.t("agAnyAgent")}</option>
                            ${ir.ugynokok.map(u => `<option value="${u.id}" ${f.ugynok === String(u.id) ? "selected" : ""}>${esc(u.nev)}</option>`).join("")}
                            <option value="nincs" ${f.ugynok === "nincs" ? "selected" : ""}>${I18n.t("agNoAgent")}</option>
                        </select>
                        <select class="form-select form-select-sm" id="agFType" aria-label="${esc(I18n.t("agType"))}">
                            <option value="">${I18n.t("agAnyType")}</option>
                            ${Types.LIST.map(t => `<option value="${t.key}" ${f.tipus === t.key ? "selected" : ""}>${I18n.t(t.label)}</option>`).join("")}
                        </select>
                        <select class="form-select form-select-sm" id="agSort" aria-label="${esc(I18n.t("agSort"))}">
                            ${["uj", "regi", "arNo", "arCsokken", "ref", "erdeklodes"].map(k => `<option value="${k}" ${AgencyPage.rendezes === k ? "selected" : ""}>${I18n.t("agSort_" + k)}</option>`).join("")}
                        </select>
                    </div>

                    <div class="agBulk" id="agBulk" hidden></div>

                    <div id="agList"></div>
                </div>
            </div>`;

        // Események
        el.querySelectorAll("[data-stat]").forEach(b => b.onclick = () => { f.statusz = b.dataset.stat; AgencyPage.hirdetesTab(el); });
        el.querySelectorAll("[data-folder]").forEach(b => b.onclick = () => {
            f.mappa = b.dataset.folder === "__all" ? null : b.dataset.folder;
            AgencyPage.hirdetesTab(el);
        });

        let t = null;
        document.getElementById("agQ").oninput = e => {
            clearTimeout(t);
            t = setTimeout(() => { f.q = e.target.value; AgencyPage.lista(ugynokNev); }, 200);
        };
        document.getElementById("agFAgent").onchange = e => { f.ugynok = e.target.value; AgencyPage.lista(ugynokNev); };
        document.getElementById("agFType").onchange = e => { f.tipus = e.target.value; AgencyPage.lista(ugynokNev); };
        document.getElementById("agSort").onchange = e => { AgencyPage.rendezes = e.target.value; AgencyPage.lista(ugynokNev); };

        AgencyPage.lista(ugynokNev);

    }

    static lista(ugynokNev) {

        const esc = Utils.escape;
        const box = document.getElementById("agList");
        const lista = AgencyPage.szurt();

        // A már nem látható kijelöléseket elengedjük
        const lathato = new Set(lista.map(i => i.id));
        [...AgencyPage.kijelolt].forEach(id => { if (!lathato.has(id)) AgencyPage.kijelolt.delete(id); });

        if (!AgencyPage.hirdetesek.length) {
            box.innerHTML = `
                <div class="emptyState">
                    <i class="fa-solid fa-house-user"></i>
                    <h5>${I18n.t("agEmpty")}</h5>
                    <p>${I18n.t("agEmptyHint")}</p>
                    <button class="btn btn-outline-primary btn-sm" id="agTakeOver"><i class="fa-solid fa-right-to-bracket"></i> ${I18n.t("agTakeOver")}</button>
                </div>`;
            document.getElementById("agTakeOver").onclick = () => AgencyPage.atvetel();
            AgencyPage.bulkBar();
            return;
        }

        if (!lista.length) {
            box.innerHTML = `<div class="emptyState"><i class="fa-solid fa-filter-circle-xmark"></i><h5>${I18n.t("currentNoResults")}</h5></div>`;
            AgencyPage.bulkBar();
            return;
        }

        const mind = lista.every(i => AgencyPage.kijelolt.has(i.id));

        box.innerHTML = `
            <div class="agTableWrap">
                <table class="table table-hover align-middle agTable">
                    <thead>
                        <tr>
                            <th class="agChk"><input class="form-check-input" type="checkbox" id="agAll" ${mind ? "checked" : ""} aria-label="${esc(I18n.t("agSelectAll"))}"></th>
                            <th>${I18n.t("agColListing")}</th>
                            <th class="d-none d-md-table-cell">${I18n.t("agAgent")}</th>
                            <th class="d-none d-xl-table-cell">${I18n.t("agFolder")}</th>
                            <th class="text-end">${I18n.t("detailAr")}</th>
                            <th>${I18n.t("agColStatus")}</th>
                            <th class="text-end"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(i => {
                            const foto = Utils.photoUrl(i);
                            return `
                            <tr class="${AgencyPage.kijelolt.has(i.id) ? "table-active" : ""}">
                                <td class="agChk"><input class="form-check-input" type="checkbox" data-sel="${i.id}" ${AgencyPage.kijelolt.has(i.id) ? "checked" : ""} aria-label="#${i.id}"></td>
                                <td>
                                    <div class="d-flex align-items-center gap-2 min-w-0">
                                        <a class="agThumb" href="#listing/${i.id}">${foto ? `<img src="${esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<i class="${Types.get(i.tipus).icon}"></i>`}</a>
                                        <div class="min-w-0">
                                            <a href="#listing/${i.id}" class="fw-semibold d-block text-truncate agTitle">${esc(i.cim || Types.label(i.tipus))}</a>
                                            <div class="small text-body-secondary text-truncate">
                                                ${i.iroda_ref ? `<span class="agRef">${esc(i.iroda_ref)}</span> · ` : ""}#${i.id} · ${esc(CityManager.helyLabel(i))}
                                            </div>
                                            ${i.iroda_megjegyzes ? `<div class="small agNote text-truncate"><i class="fa-regular fa-note-sticky"></i> ${esc(i.iroda_megjegyzes)}</div>` : ""}
                                        </div>
                                    </div>
                                </td>
                                <td class="d-none d-md-table-cell small">${i.ugynok_id ? esc(ugynokNev(i.ugynok_id)) : `<span class="text-body-secondary">—</span>`}</td>
                                <td class="d-none d-xl-table-cell">${i.iroda_mappa ? `<span class="agFolderChip"><i class="fa-regular fa-folder"></i> ${esc(i.iroda_mappa)}</span>` : ""}</td>
                                <td class="text-end text-nowrap fw-semibold">${Utils.price(i)}</td>
                                <td>
                                    ${AgencyPage.statuszBadge(i)}
                                    <div class="small text-body-secondary text-nowrap mt-1" title="${esc(I18n.t("agInterestHint"))}">
                                        <i class="fa-regular fa-star"></i> ${i.kedvenc_db || 0} · <i class="fa-regular fa-envelope"></i> ${i.uzenet_db || 0}
                                    </div>
                                </td>
                                <td class="text-end text-nowrap">
                                    <button class="btn btn-sm btn-outline-secondary" data-internal="${i.id}" title="${esc(I18n.t("agInternal"))}" aria-label="${esc(I18n.t("agInternal"))}"><i class="fa-regular fa-note-sticky"></i></button>
                                    <button class="btn btn-sm btn-outline-secondary" data-edit="${i.id}" title="${esc(I18n.t("detailEdit"))}" aria-label="${esc(I18n.t("detailEdit"))}"><i class="fa-solid fa-pen"></i></button>
                                </td>
                            </tr>`;
                        }).join("")}
                    </tbody>
                </table>
            </div>
            <div class="small text-body-secondary">${I18n.f("agShowing", { n: lista.length, ossz: AgencyPage.hirdetesek.length })}</div>`;

        document.getElementById("agAll").onchange = e => {
            lista.forEach(i => e.target.checked ? AgencyPage.kijelolt.add(i.id) : AgencyPage.kijelolt.delete(i.id));
            AgencyPage.lista(ugynokNev);
        };

        box.querySelectorAll("[data-sel]").forEach(cb => {
            cb.onchange = () => {
                const id = Number(cb.dataset.sel);
                cb.checked ? AgencyPage.kijelolt.add(id) : AgencyPage.kijelolt.delete(id);
                cb.closest("tr").classList.toggle("table-active", cb.checked);
                document.getElementById("agAll").checked = lista.every(i => AgencyPage.kijelolt.has(i.id));
                AgencyPage.bulkBar();
            };
        });

        box.querySelectorAll("[data-edit]").forEach(b => {
            b.onclick = () => NewPropertyManager.startEdit({ id: Number(b.dataset.edit) });
        });

        box.querySelectorAll("[data-internal]").forEach(b => {
            b.onclick = () => AgencyPage.belsoAdatok(AgencyPage.hirdetesek.find(i => i.id === Number(b.dataset.internal)));
        });

        AgencyPage.bulkBar();

    }

    // Tömeges műveletek a kijelölt hirdetéseken
    static bulkBar() {

        const bar = document.getElementById("agBulk");
        if (!bar) return;

        const n = AgencyPage.kijelolt.size;
        bar.hidden = !n;
        if (!n) return;

        const esc = Utils.escape;
        const ir = AgencyPage.iroda;

        bar.innerHTML = `
            <b>${I18n.f("agSelected", { n })}</b>
            <div class="agBulkGroup">
                <select class="form-select form-select-sm" id="agBulkAgent" aria-label="${esc(I18n.t("agAssignAgent"))}">
                    <option value="">${I18n.t("agAssignAgent")}…</option>
                    ${ir.ugynokok.map(u => `<option value="${u.id}">${esc(u.nev)}</option>`).join("")}
                    <option value="0">— ${I18n.t("agNoAgent")}</option>
                </select>
            </div>
            <div class="agBulkGroup">
                <input class="form-control form-control-sm" id="agBulkFolder" list="agFolderList" placeholder="${esc(I18n.t("agMoveToFolder"))}" aria-label="${esc(I18n.t("agMoveToFolder"))}">
                <datalist id="agFolderList">${AgencyPage.mappak().map(([m]) => `<option value="${esc(m)}">`).join("")}</datalist>
                <button class="btn btn-sm btn-outline-primary" id="agBulkFolderGo"><i class="fa-regular fa-folder"></i></button>
            </div>
            <div class="agBulkGroup">
                <button class="btn btn-sm btn-outline-secondary" data-bulk="archival"><i class="fa-solid fa-box-archive"></i> ${I18n.t("agArchive")}</button>
                <button class="btn btn-sm btn-outline-success" data-bulk="aktival"><i class="fa-solid fa-rotate-left"></i> ${I18n.t("agActivate")}</button>
                <button class="btn btn-sm btn-outline-danger" data-bulk="eladva"><i class="fa-solid fa-handshake"></i> ${I18n.t("agMarkSold")}</button>
                <button class="btn btn-sm btn-outline-secondary" data-bulk="nem_eladva">${I18n.t("agUnmarkSold")}</button>
                <button class="btn btn-sm btn-danger" data-bulk="torles" aria-label="${esc(I18n.t("detailDelete"))}"><i class="fa-solid fa-trash"></i></button>
            </div>
            <button class="btn btn-sm btn-link ms-auto" id="agBulkClear">${I18n.t("agClearSel")}</button>`;

        const futtat = (muvelet, ertek) => {
            if (muvelet === "torles" && !confirm(I18n.f("agDeleteConfirm", { n }))) return;
            AgencyPage.api(`/api/irodak/${ir.id}/hirdetesek`, "PATCH", { ids: [...AgencyPage.kijelolt], muvelet, ertek })
                .then(v => {
                    Utils.toast(I18n.f("agBulkDone", { n: v.db }));
                    if (muvelet === "torles") AgencyPage.kijelolt.clear();
                    DataManager.init();
                    AgencyPage.show(String(ir.id));
                })
                .catch(e => alert(AgencyPage.hibaSzoveg(e)));
        };

        document.getElementById("agBulkAgent").onchange = e => { if (e.target.value !== "") futtat("ugynok", Number(e.target.value) || null); };
        document.getElementById("agBulkFolderGo").onclick = () => futtat("mappa", document.getElementById("agBulkFolder").value.trim());
        document.getElementById("agBulkFolder").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); futtat("mappa", e.target.value.trim()); } };
        bar.querySelectorAll("[data-bulk]").forEach(b => b.onclick = () => futtat(b.dataset.bulk));
        document.getElementById("agBulkClear").onclick = () => {
            AgencyPage.kijelolt.clear();
            AgencyPage.hirdetesTab(document.getElementById("agBody"));
        };

    }

    // Belső adatok egy hirdetéshez: hivatkozási szám, mappa, ügynök, megjegyzés
    static belsoAdatok(i) {

        const esc = Utils.escape;
        const ir = AgencyPage.iroda;

        let el = document.getElementById("agInternalModal");
        if (!el) {
            el = document.createElement("div");
            el.id = "agInternalModal";
            el.className = "modal fade";
            el.tabIndex = -1;
            el.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content"></div></div>`;
            document.body.appendChild(el);
        }

        el.querySelector(".modal-content").innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title text-truncate"><i class="fa-regular fa-note-sticky"></i> ${esc(i.cim || Types.label(i.tipus))}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${I18n.t("close")}"></button>
            </div>
            <div class="modal-body">
                <p class="small text-body-secondary">${I18n.t("agInternalHelp")}</p>
                <div class="row g-3">
                    <div class="col-6">
                        <label class="form-label" for="aiRef">${I18n.t("agRef")}</label>
                        <input class="form-control" id="aiRef" maxlength="40" value="${esc(i.iroda_ref || "")}">
                    </div>
                    <div class="col-6">
                        <label class="form-label" for="aiFolder">${I18n.t("agFolder")}</label>
                        <input class="form-control" id="aiFolder" maxlength="60" list="aiFolderList" value="${esc(i.iroda_mappa || "")}">
                        <datalist id="aiFolderList">${AgencyPage.mappak().map(([m]) => `<option value="${esc(m)}">`).join("")}</datalist>
                    </div>
                    <div class="col-12">
                        <label class="form-label" for="aiAgent">${I18n.t("agAgent")}</label>
                        <select class="form-select" id="aiAgent">
                            <option value="">— ${I18n.t("agNoAgent")}</option>
                            ${ir.ugynokok.map(u => `<option value="${u.id}" ${u.id === i.ugynok_id ? "selected" : ""}>${esc(u.nev)}</option>`).join("")}
                        </select>
                    </div>
                    <div class="col-12">
                        <label class="form-label" for="aiNote">${I18n.t("agNote")}</label>
                        <textarea class="form-control" id="aiNote" rows="3" maxlength="2000">${esc(i.iroda_megjegyzes || "")}</textarea>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("cancel")}</button>
                <button type="button" class="btn btn-primary" id="aiSave">${I18n.t("save")}</button>
            </div>`;

        const modal = bootstrap.Modal.getOrCreateInstance(el);

        document.getElementById("aiSave").onclick = () => {
            const body = {
                iroda_ref: document.getElementById("aiRef").value,
                iroda_mappa: document.getElementById("aiFolder").value,
                ugynok_id: document.getElementById("aiAgent").value || null,
                iroda_megjegyzes: document.getElementById("aiNote").value
            };
            AgencyPage.api(`/api/irodak/${ir.id}/hirdetesek/${i.id}`, "PUT", body)
                .then(() => {
                    Object.assign(i, body, { ugynok_id: body.ugynok_id ? Number(body.ugynok_id) : null });
                    modal.hide();
                    AgencyPage.hirdetesTab(document.getElementById("agBody"));
                })
                .catch(e => alert(AgencyPage.hibaSzoveg(e)));
        };

        modal.show();

    }

    static atvetel() {
        if (!confirm(I18n.t("agTakeOverConfirm"))) return;
        AgencyPage.api(`/api/irodak/${AgencyPage.iroda.id}/atvetel`, "POST", {})
            .then(v => {
                Utils.toast(I18n.f("agTakeOverDone", { n: v.db }));
                DataManager.init();
                AgencyPage.show(String(AgencyPage.iroda.id));
            })
            .catch(e => alert(AgencyPage.hibaSzoveg(e)));
    }

    // ---------- ügynökök ----------

    static ugynokTab(el, vezeto) {

        const esc = Utils.escape;
        const ir = AgencyPage.iroda;
        const db = id => AgencyPage.hirdetesek.filter(i => i.ugynok_id === id && AgencyPage.statuszOf(i) !== "archiv").length;
        const en = AuthManager.user.id;

        el.innerHTML = `
            <p class="sectionNote">${I18n.t("agAgentsHelp")}</p>
            <div class="row g-3 mb-4">
                ${ir.ugynokok.map(u => `
                    <div class="col-md-6 col-xl-4">
                        <div class="card h-100 agAgentCard ${u.aktiv ? "" : "opacity-50"}" data-uid="${u.id}">
                            <div class="card-body">
                                <div class="d-flex align-items-center gap-3 mb-2">
                                    <span class="accAvatar small">${esc((u.nev || "?").slice(0, 1).toUpperCase())}</span>
                                    <div class="min-w-0">
                                        <b class="d-block text-truncate">${esc(u.nev)}</b>
                                        <span class="small text-body-secondary">${I18n.f("agAgentListings", { n: db(u.id) })}${u.van_fiok ? ` · <i class="fa-solid fa-user-check" title="${esc(I18n.t("agHasAccount"))}"></i>` : ""}${u.aktiv ? "" : ` · ${I18n.t("agInactive")}`}</span>
                                    </div>
                                </div>
                                <div class="small">${u.telefon ? `<div><i class="fa-solid fa-phone"></i> ${esc(u.telefon)}</div>` : ""}${u.email ? `<div class="text-truncate"><i class="fa-regular fa-envelope"></i> ${esc(u.email)}</div>` : ""}</div>
                                ${vezeto || u.user_id === en ? `
                                <div class="d-flex gap-2 mt-3">
                                    <button class="btn btn-sm btn-outline-secondary" data-aedit="${u.id}"><i class="fa-solid fa-pen"></i> ${I18n.t("detailEdit")}</button>
                                    ${vezeto ? `<button class="btn btn-sm btn-outline-danger" data-adel="${u.id}" aria-label="${esc(I18n.t("detailDelete"))}"><i class="fa-solid fa-trash"></i></button>` : ""}
                                </div>` : ""}
                            </div>
                        </div>
                    </div>`).join("")}
            </div>

            ${vezeto ? `
            <form class="card" id="agAgentAdd">
                <div class="card-header"><h6 class="mb-0"><i class="fa-solid fa-user-plus"></i> ${I18n.t("agAddAgent")}</h6></div>
                <div class="card-body">
                    <div class="row g-2">
                        <div class="col-md-4"><input class="form-control" name="nev" required maxlength="100" placeholder="${esc(I18n.t("authName"))}" aria-label="${esc(I18n.t("authName"))}"></div>
                        <div class="col-md-3"><input class="form-control" name="telefon" type="tel" maxlength="40" placeholder="${esc(I18n.t("accPhone"))}" aria-label="${esc(I18n.t("accPhone"))}"></div>
                        <div class="col-md-3"><input class="form-control" name="email" type="email" maxlength="160" placeholder="${esc(I18n.t("authEmail"))}" aria-label="${esc(I18n.t("authEmail"))}"></div>
                        <div class="col-md-2 d-grid"><button class="btn btn-primary" type="submit">${I18n.t("agAdd")}</button></div>
                    </div>
                    <div class="form-text">${I18n.t("agAddAgentHelp")}</div>
                </div>
            </form>` : ""}`;

        const add = document.getElementById("agAgentAdd");
        if (add) add.onsubmit = e => {
            e.preventDefault();
            const f = e.target;
            AgencyPage.api(`/api/irodak/${ir.id}/ugynokok`, "POST", { nev: f.nev.value, telefon: f.telefon.value, email: f.email.value })
                .then(() => AgencyPage.show(String(ir.id)))
                .catch(err => alert(AgencyPage.hibaSzoveg(err)));
        };

        el.querySelectorAll("[data-adel]").forEach(b => b.onclick = () => {
            const u = ir.ugynokok.find(x => x.id === Number(b.dataset.adel));
            if (!confirm(I18n.f("agAgentDeleteConfirm", { nev: u.nev }))) return;
            AgencyPage.api(`/api/irodak/${ir.id}/ugynokok/${u.id}`, "DELETE").then(() => AgencyPage.show(String(ir.id)));
        });

        el.querySelectorAll("[data-aedit]").forEach(b => b.onclick = () => {
            const u = ir.ugynokok.find(x => x.id === Number(b.dataset.aedit));
            const kartya = b.closest(".card-body");
            kartya.innerHTML = `
                <input class="form-control form-control-sm mb-2" data-f="nev" value="${esc(u.nev)}" aria-label="${esc(I18n.t("authName"))}">
                <input class="form-control form-control-sm mb-2" data-f="telefon" value="${esc(u.telefon || "")}" placeholder="${esc(I18n.t("accPhone"))}" aria-label="${esc(I18n.t("accPhone"))}">
                <input class="form-control form-control-sm mb-2" data-f="email" value="${esc(u.email || "")}" placeholder="${esc(I18n.t("authEmail"))}" aria-label="${esc(I18n.t("authEmail"))}">
                <div class="form-check form-switch mb-2">
                    <input class="form-check-input" type="checkbox" data-f="aktiv" id="agAktiv${u.id}" ${u.aktiv ? "checked" : ""}>
                    <label class="form-check-label small" for="agAktiv${u.id}">${I18n.t("agActiveAgent")}</label>
                </div>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-primary" data-save>${I18n.t("save")}</button>
                    <button class="btn btn-sm btn-outline-secondary" data-cancel>${I18n.t("cancel")}</button>
                </div>`;
            const v = f => kartya.querySelector(`[data-f="${f}"]`);
            kartya.querySelector("[data-cancel]").onclick = () => AgencyPage.ugynokTab(el, vezeto);
            kartya.querySelector("[data-save]").onclick = () => {
                AgencyPage.api(`/api/irodak/${ir.id}/ugynokok/${u.id}`, "PUT", {
                    nev: v("nev").value, telefon: v("telefon").value, email: v("email").value, aktiv: v("aktiv").checked
                }).then(() => AgencyPage.show(String(ir.id))).catch(err => alert(AgencyPage.hibaSzoveg(err)));
            };
        });

    }

    // ---------- tagok ----------

    static tagTab(el, vezeto) {

        const esc = Utils.escape;
        const ir = AgencyPage.iroda;

        el.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        AgencyPage.api(`/api/irodak/${ir.id}/tagok`).then(tagok => {

            el.innerHTML = `
                <p class="sectionNote">${I18n.t("agMembersHelp")}</p>
                <div class="card mb-4">
                    <ul class="list-group list-group-flush">
                        ${tagok.map(t => `
                            <li class="list-group-item d-flex align-items-center gap-3">
                                <span class="accAvatar small">${esc((t.nev || "?").slice(0, 1).toUpperCase())}</span>
                                <div class="flex-fill min-w-0">
                                    <b class="d-block text-truncate">${esc(t.nev || "")}</b>
                                    <span class="small text-body-secondary text-truncate d-block">${esc(t.email || "")}</span>
                                </div>
                                <span class="badge ${t.szerep === "vezeto" ? "text-bg-primary" : "text-bg-light"}">${I18n.t(t.szerep === "vezeto" ? "agRoleManager" : "agRoleMember")}</span>
                                ${vezeto || t.id === AuthManager.user.id ? `<button class="btn btn-sm btn-outline-danger" data-mdel="${t.id}" title="${esc(I18n.t(t.id === AuthManager.user.id ? "agLeave" : "agRemove"))}" aria-label="${esc(I18n.t(t.id === AuthManager.user.id ? "agLeave" : "agRemove"))}"><i class="fa-solid ${t.id === AuthManager.user.id ? "fa-right-from-bracket" : "fa-user-minus"}"></i></button>` : ""}
                            </li>`).join("")}
                    </ul>
                </div>

                ${vezeto ? `
                <form class="card" id="agMemberAdd">
                    <div class="card-header"><h6 class="mb-0"><i class="fa-solid fa-user-plus"></i> ${I18n.t("agAddMember")}</h6></div>
                    <div class="card-body">
                        <div class="row g-2">
                            <div class="col-md-6"><input class="form-control" name="email" required placeholder="${esc(I18n.t("authEmail"))}" aria-label="${esc(I18n.t("authEmail"))}"></div>
                            <div class="col-md-3">
                                <select class="form-select" name="szerep" aria-label="${esc(I18n.t("agRole"))}">
                                    <option value="tag">${I18n.t("agRoleMember")}</option>
                                    <option value="vezeto">${I18n.t("agRoleManager")}</option>
                                </select>
                            </div>
                            <div class="col-md-3 d-grid"><button class="btn btn-primary" type="submit">${I18n.t("agAdd")}</button></div>
                        </div>
                        <div class="form-text">${I18n.t("agAddMemberHelp")}</div>
                        <div class="accMsg alert alert-danger small py-2 mt-2" hidden></div>
                    </div>
                </form>` : ""}`;

            const add = document.getElementById("agMemberAdd");
            if (add) add.onsubmit = e => {
                e.preventDefault();
                const msg = add.querySelector(".accMsg");
                AgencyPage.api(`/api/irodak/${ir.id}/tagok`, "POST", { email: add.email.value, szerep: add.szerep.value })
                    .then(() => AgencyPage.show(String(ir.id)))
                    .catch(err => { msg.hidden = false; msg.innerText = AgencyPage.hibaSzoveg(err); });
            };

            el.querySelectorAll("[data-mdel]").forEach(b => b.onclick = () => {
                const sajat = Number(b.dataset.mdel) === AuthManager.user.id;
                if (!confirm(I18n.t(sajat ? "agLeaveConfirm" : "agRemoveConfirm"))) return;
                AgencyPage.api(`/api/irodak/${ir.id}/tagok/${b.dataset.mdel}`, "DELETE")
                    .then(() => sajat ? AuthManager.refresh().then(() => { location.hash = "#fiok"; }) : AgencyPage.tagTab(el, vezeto))
                    .catch(err => alert(AgencyPage.hibaSzoveg(err)));
            });

        }).catch(err => { el.innerHTML = `<div class="alert alert-danger">${AgencyPage.hibaSzoveg(err)}</div>`; });

    }

    // ---------- adatok ----------

    static adatTab(el, vezeto) {

        const ir = AgencyPage.iroda;

        if (!vezeto) {
            el.innerHTML = `<div class="alert alert-light">${I18n.t("agOnlyManager")}</div>`;
            return;
        }

        el.innerHTML = `
            <div class="row g-4">
                <div class="col-lg-8">
                    <form class="card" id="agEdit">
                        <div class="card-body">
                            ${AgencyPage.adatUrlap(ir)}
                            <div class="accMsg alert small py-2 mt-3" hidden></div>
                            <div class="text-end mt-3"><button class="btn btn-primary" type="submit">${I18n.t("save")}</button></div>
                        </div>
                    </form>
                </div>
                <div class="col-lg-4">
                    <div class="card">
                        <div class="card-body small">
                            <p class="mb-2">${I18n.t("agDeleteHelp")}</p>
                            <button class="btn btn-outline-danger btn-sm" id="agDelete"><i class="fa-solid fa-trash"></i> ${I18n.t("agDeleteBtn")}</button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.getElementById("agEdit").onsubmit = e => {
            e.preventDefault();
            const msg = e.target.querySelector(".accMsg");
            AgencyPage.api("/api/irodak/" + ir.id, "PUT", AgencyPage.urlapAdat(e.target))
                .then(v => {
                    Object.assign(ir, v);
                    msg.hidden = false;
                    msg.className = "accMsg alert alert-success small py-2 mt-3";
                    msg.innerText = I18n.t("alertSaveSuccess");
                    AuthManager.refresh();
                })
                .catch(err => {
                    msg.hidden = false;
                    msg.className = "accMsg alert alert-danger small py-2 mt-3";
                    msg.innerText = AgencyPage.hibaSzoveg(err);
                });
        };

        document.getElementById("agDelete").onclick = () => {
            if (!confirm(I18n.f("agDeleteAgencyConfirm", { nev: ir.nev }))) return;
            AgencyPage.api("/api/irodak/" + ir.id, "DELETE")
                .then(() => AuthManager.refresh())
                .then(() => { AgencyPage.iroda = null; DataManager.init(); location.hash = "#fiok"; });
        };

    }

}


// ============================================================
//  Az iroda nyilvános oldala (#irodak/<id>)
// ============================================================

class AgencyProfile {

    static current = null;

    static show(id) {

        const box = document.getElementById("irodaProfilContent");
        box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;

        fetch("/api/irodak/" + Number(id))
            .then(AgencyPage.json)
            .then(ir => {
                DataManager.prepare(ir.hirdetesek);
                AgencyProfile.current = ir;
                AgencyProfile.render(ir);
            })
            .catch(() => {
                box.innerHTML = `<div class="emptyState"><i class="fa-solid fa-circle-exclamation"></i><h5>${I18n.t("listingNotFound")}</h5></div>`;
            });

    }

    static rerender() {
        if (PageManager.current === "irodak" && AgencyProfile.current) AgencyProfile.render(AgencyProfile.current);
    }

    static render(ir) {

        const esc = Utils.escape;
        const box = document.getElementById("irodaProfilContent");

        box.innerHTML = `
            <div class="card agProfileHead mb-4">
                <div class="card-body">
                    <div class="d-flex flex-wrap align-items-start gap-3">
                        <span class="agLogo lg">${esc((ir.nev || "?").slice(0, 1).toUpperCase())}</span>
                        <div class="flex-fill min-w-0">
                            <h2 class="mb-1">${esc(ir.nev)} ${ir.ellenorzott ? `<span class="badge text-bg-primary fs-6 align-middle"><i class="fa-solid fa-circle-check"></i> ${I18n.t("agVerified")}</span>` : ""}</h2>
                            <div class="text-body-secondary small mb-2">
                                <i class="fa-solid fa-briefcase"></i> ${I18n.t("agLabel")}
                                ${ir.varos ? ` · <i class="fa-solid fa-location-dot"></i> ${esc(CityManager.displayName(ir.varos))}` : ""}
                                ${ir.cim ? ` · ${esc(ir.cim)}` : ""}
                            </div>
                            ${ir.leiras ? `<p class="mb-2 agAboutText">${esc(ir.leiras)}</p>` : ""}
                            <div class="d-flex flex-wrap gap-2">
                                ${ir.telefon ? `<a class="btn btn-primary btn-sm" href="tel:${esc(ir.telefon.replace(/\s/g, ""))}"><i class="fa-solid fa-phone"></i> ${esc(ir.telefon)}</a>` : ""}
                                ${ir.email ? `<a class="btn btn-outline-primary btn-sm" href="mailto:${esc(ir.email)}"><i class="fa-regular fa-envelope"></i> ${esc(ir.email)}</a>` : ""}
                                ${ir.weboldal ? `<a class="btn btn-outline-secondary btn-sm" href="${esc(ir.weboldal)}" target="_blank" rel="noopener nofollow"><i class="fa-solid fa-globe"></i> ${I18n.t("agWebsite")}</a>` : ""}
                            </div>
                        </div>
                        <div class="d-flex flex-column gap-2">
                            ${ir.jog && ir.jog.tag ? `<a class="btn btn-outline-secondary btn-sm" href="#iroda/${ir.id}"><i class="fa-solid fa-gear"></i> ${I18n.t("agManage")}</a>` : ""}
                            ${AuthManager.isAdmin() ? `
                                <div class="form-check form-switch small">
                                    <input class="form-check-input" type="checkbox" id="agVerifySw" ${ir.ellenorzott ? "checked" : ""}>
                                    <label class="form-check-label" for="agVerifySw">${I18n.t("agVerified")} (admin)</label>
                                </div>` : ""}
                        </div>
                    </div>
                </div>
            </div>

            ${ir.ugynokok.length ? `
            <h5 class="mb-3">${I18n.t("agTabAgents")}</h5>
            <div class="row g-3 mb-4">
                ${ir.ugynokok.filter(u => u.aktiv !== false).map(u => `
                    <div class="col-sm-6 col-lg-4 col-xl-3">
                        <div class="card h-100"><div class="card-body d-flex gap-3 align-items-center">
                            <span class="accAvatar small">${esc((u.nev || "?").slice(0, 1).toUpperCase())}</span>
                            <div class="min-w-0 small">
                                <b class="d-block text-truncate">${esc(u.nev)}</b>
                                ${u.telefon ? `<a class="d-block" href="tel:${esc(u.telefon.replace(/\s/g, ""))}"><i class="fa-solid fa-phone"></i> ${esc(u.telefon)}</a>` : ""}
                                ${u.email ? `<a class="d-block text-truncate" href="mailto:${esc(u.email)}"><i class="fa-regular fa-envelope"></i> ${esc(u.email)}</a>` : ""}
                            </div>
                        </div></div>
                    </div>`).join("")}
            </div>` : ""}

            <h5 class="mb-3">${I18n.f("agListingsCount", { n: ir.hirdetesek.length })}</h5>
            <div class="row g-3" id="agProfileCards">
                ${ir.hirdetesek.length ? ir.hirdetesek.map(CardsView.cardHtml).join("") : `<div class="col-12"><div class="emptyState"><i class="fa-solid fa-house"></i><h5>${I18n.t("agNoPublicListings")}</h5></div></div>`}
            </div>`;

        box.querySelectorAll("#agProfileCards .listingCard").forEach(card => {
            card.addEventListener("click", e => {
                const favBtn = e.target.closest("[data-fav]");
                if (favBtn) {
                    e.stopPropagation();
                    DataManager.toggleFavorite(Number(favBtn.dataset.fav));
                    return;
                }
                ListingPage.open(Number(card.dataset.id));
            });
        });

        const sw = document.getElementById("agVerifySw");
        if (sw) sw.onchange = () => fetch(`/api/irodak/${ir.id}/ellenorzott`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ellenorzott: sw.checked })
        }).then(() => { ir.ellenorzott = sw.checked; AgencyProfile.render(ir); });

    }

}
