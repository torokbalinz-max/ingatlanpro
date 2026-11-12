// ============================================================
//  CRM – ügyfelek, feladatok, beérkező érdeklődések
//
//  Minden irodának saját, zárt CRM-je van (Irodám kezelése → CRM fül);
//  az oldal saját értékesítésének CRM-je az adminban (Admin → CRM).
//  Crm.mount(el, { ter })  ter = az iroda id-je, 0 = az oldal CRM-je
//
//  Nézetek:
//   Áttekintés  ma és késésben lévő feladatok, új érdeklődők, akikkel
//               régóta nem beszéltetek, a folyamat számai, legutóbbiak
//   Ügyfelek    lista szűrőkkel (állapot, szerep, felelős, címke), CSV
//   Feladatok   határidő szerint csoportosítva, egy kattintással kész
//   Beérkező    a hirdetésekre jött üzenetek – egy kattintással ügyfél
//  Ügyfél adatlap (ablak): adatok, keresési igény és az illeszkedő
//  ingatlanok, kapcsolódó ingatlanok, gyors bejegyzés (hívás, üzenet…),
//  feladatok, idővonal.
//  Szerver: /api/crm/:ter (server/routes/crm.js, services/crm.js)
// ============================================================

class Crm {

    static ALLAPOTOK = ["uj", "kapcsolat", "aktiv", "targyalas", "nyert", "elvesztett", "inaktiv"];
    static NYITOTT = ["uj", "kapcsolat", "aktiv", "targyalas"];
    static SZEREPEK = ["vevo", "elado", "berlo", "berbeado"];
    static FORRASOK = ["hirdetes", "telefon", "ajanlas", "weboldal", "kozosseg", "szemelyes", "egyeb"];
    static TEV = [
        { k: "hivas", ikon: "fa-solid fa-phone" },
        { k: "uzenet", ikon: "fa-regular fa-comment" },
        { k: "email", ikon: "fa-regular fa-envelope" },
        { k: "talalkozo", ikon: "fa-solid fa-handshake" },
        { k: "megtekintes", ikon: "fa-solid fa-door-open" },
        { k: "ajanlat", ikon: "fa-solid fa-file-signature" },
        { k: "jegyzet", ikon: "fa-regular fa-note-sticky" }
    ];
    static NEZETEK = [
        { k: "attekintes", ikon: "fa-solid fa-gauge-high" },
        { k: "ugyfelek", ikon: "fa-solid fa-address-book" },
        { k: "feladatok", ikon: "fa-solid fa-list-check" },
        { k: "beerkezo", ikon: "fa-solid fa-inbox" }
    ];

    static el = null;
    static ter = 0;
    static nezet = "attekintes";
    static tagok = [];
    static en = null;
    static vezeto = false;
    static szuro = { q: "", allapot: "nyitott", szerep: "", felelos: "", cimke: "", rend: "friss" };
    static fSzuro = { felelos: "", kesz: false };
    static beerkezoDb = 0;

    // ===================== KÖZÖS =====================

    static t(k, p) { return p ? I18n.f(k, p) : I18n.t(k); }
    static esc(v) { return Utils.escape(v == null ? "" : String(v)); }

    static api(ut, opts = {}) {
        const o = { method: opts.method || "GET", headers: {} };
        if (opts.body !== undefined) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(opts.body); }
        return fetch(`/api/crm/${Crm.ter}${ut}`, o).then(async r => {
            const v = await r.json().catch(() => ({}));
            if (!r.ok) { const e = new Error(v.error || "server_error"); e.adat = v; e.status = r.status; throw e; }
            return v;
        });
    }

    static hiba(e) {
        const k = "crmErr_" + (e && e.message);
        const s = I18n.t(k);
        return s && s !== k ? s : I18n.t("crmErr_server_error");
    }

    static jelez(szoveg) {
        let el = document.getElementById("crmToast");
        if (!el) {
            el = document.createElement("div");
            el.id = "crmToast";
            el.className = "crmToast";
            el.setAttribute("role", "status");
            document.body.appendChild(el);
        }
        el.textContent = szoveg;
        el.classList.add("show");
        clearTimeout(Crm._tt);
        Crm._tt = setTimeout(() => el.classList.remove("show"), 2200);
    }

    // A határidők helyi időben vannak tárolva (ahogy beírták)
    static helyi(d) {
        if (!d) return null;
        const s = String(d).replace("Z", "").replace(" ", "T").slice(0, 16);
        const x = new Date(s);
        return isNaN(x) ? null : x;
    }

    static nap(d) {
        const x = d instanceof Date ? d : new Date(d);
        return isNaN(x) ? "–" : x.toLocaleDateString(Utils.locale(), { month: "short", day: "numeric", year: x.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
    }

    static idopont(d) {
        const x = d instanceof Date ? d : new Date(d);
        if (isNaN(x)) return "–";
        return `${Crm.nap(x)} ${x.toLocaleTimeString(Utils.locale(), { hour: "2-digit", minute: "2-digit" })}`;
    }

    static hatarido(h) {
        const x = Crm.helyi(h);
        if (!x) return "";
        const vanIdo = x.getHours() || x.getMinutes();
        return vanIdo ? Crm.idopont(x) : Crm.nap(x);
    }

    static kesik(h) {
        const x = Crm.helyi(h);
        return !!x && x < new Date();
    }

    static allapotBadge(a) {
        return `<span class="crmSt crmSt-${Crm.esc(a)}">${Crm.t("crmSt_" + a)}</span>`;
    }

    static szerepek(lista) {
        return (lista || []).map(s => `<span class="crmRole">${Crm.t("crmRole_" + s)}</span>`).join(" ");
    }

    static tagNev(id) {
        const t = Crm.tagok.find(x => x.id === Number(id));
        return t ? t.nev : "";
    }

    static tagOpciok(kivalasztott, ures = true) {
        return (ures ? `<option value="">${Crm.t("crmNoOwner")}</option>` : "")
            + Crm.tagok.map(t => `<option value="${t.id}" ${Number(kivalasztott) === t.id ? "selected" : ""}>${Crm.esc(t.nev)}${t.id === Crm.en ? ` (${Crm.t("crmMe")})` : ""}</option>`).join("");
    }

    static ingatlanSor(i, extra = "") {
        const kep = Utils.photoUrl(i);
        return `
            <div class="crmProp">
                <a class="crmPropImg" href="#listing/${i.id}">${kep ? `<img src="${Crm.esc(kep)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<i class="${Types.get(i.tipus).icon}" aria-hidden="true"></i>`}</a>
                <div class="flex-fill min-w-0">
                    <a class="d-block text-truncate fw-semibold small" href="#listing/${i.id}">${Crm.esc(i.cim || Types.label(i.tipus))}</a>
                    <div class="small text-body-secondary">${i.ar ? Crm.esc(Utils.eur(i.ar)) : "–"}${i.nm ? ` · ${Crm.esc(Utils.nm(i.nm))}` : ""}${i.szobak ? ` · ${i.szobak} ${Crm.t("crmRooms")}` : ""}${i.kerulet ? ` · ${Crm.esc(i.kerulet)}` : ""}</div>
                </div>
                ${extra}
            </div>`;
    }

    // ===================== KERET =====================

    static mount(el, opts = {}) {
        Crm.el = el;
        if (Crm.ter !== Number(opts.ter || 0)) {
            Crm.ter = Number(opts.ter || 0);
            Crm.szuro = { q: "", allapot: "nyitott", szerep: "", felelos: "", cimke: "", rend: "friss" };
            Crm.fSzuro = { felelos: "", kesz: false };
            Crm.nezet = "attekintes";
        }
        el.innerHTML = `<div class="text-center py-5"><span class="spinner-border text-primary" role="status"></span></div>`;
        Crm.api("/tagok").then(v => {
            Crm.tagok = v.tagok || [];
            Crm.en = v.en;
            Crm.vezeto = !!v.vezeto;
            Crm.keret();
        }).catch(e => {
            el.innerHTML = `<div class="emptyState"><i class="fa-solid fa-lock"></i><p>${Crm.hiba(e)}</p></div>`;
        });
    }

    static keret() {
        const el = Crm.el;
        el.innerHTML = `
            <div class="crm">
                <div class="crmTop">
                    <nav class="crmNav" aria-label="CRM">
                        ${Crm.NEZETEK.map(n => `
                            <button type="button" class="crmNavBtn ${Crm.nezet === n.k ? "active" : ""}" data-crm-nezet="${n.k}" aria-pressed="${Crm.nezet === n.k}">
                                <i class="${n.ikon}" aria-hidden="true"></i> ${Crm.t("crmNav_" + n.k)}
                                ${n.k === "beerkezo" ? `<span class="badge rounded-pill text-bg-warning crmInboxBadge" ${Crm.beerkezoDb ? "" : "hidden"}>${Crm.beerkezoDb}</span>` : ""}
                            </button>`).join("")}
                    </nav>
                    <div class="d-flex gap-2">
                        <button type="button" class="btn btn-outline-primary btn-sm" id="crmUjFeladat"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${Crm.t("crmNewTask")}</button>
                        <button type="button" class="btn btn-primary btn-sm" id="crmUjUgyfel"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${Crm.t("crmNewContact")}</button>
                    </div>
                </div>
                <p class="small text-body-secondary crmHelp"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${Crm.t("crmHelp_" + Crm.nezet)}</p>
                <div id="crmBody"></div>
            </div>`;
        el.querySelectorAll("[data-crm-nezet]").forEach(b => b.onclick = () => { Crm.nezet = b.dataset.crmNezet; Crm.keret(); });
        el.querySelector("#crmUjUgyfel").onclick = () => Crm.ugyfelSzerk(null);
        el.querySelector("#crmUjFeladat").onclick = () => Crm.feladatSzerk(null);
        Crm.frissit();
    }

    static frissit() {
        const body = document.getElementById("crmBody");
        if (!body) return;
        ({
            attekintes: () => Crm.attekintes(body),
            ugyfelek: () => Crm.ugyfelek(body),
            feladatok: () => Crm.feladatok(body),
            beerkezo: () => Crm.beerkezo(body)
        })[Crm.nezet]();
    }

    static badge(n) {
        Crm.beerkezoDb = n;
        const b = Crm.el && Crm.el.querySelector(".crmInboxBadge");
        if (b) { b.textContent = n; b.hidden = !n; }
    }

    static betolt(body) {
        body.innerHTML = `<div class="text-center py-4"><span class="spinner-border spinner-border-sm text-primary" role="status"></span></div>`;
    }

    // ===================== ÁTTEKINTÉS =====================

    static attekintes(body) {
        Crm.betolt(body);
        Crm.api("/attekintes").then(a => {
            Crm.badge(a.beerkezett);
            const most = new Date();
            const vege = new Date(); vege.setHours(23, 59, 59, 999);
            const kesik = a.feladatok.filter(f => Crm.helyi(f.hatarido) < most && Crm.helyi(f.hatarido).toDateString() !== most.toDateString());
            const ma = a.feladatok.filter(f => Crm.helyi(f.hatarido).toDateString() === most.toDateString());
            const kesobb = a.feladatok.filter(f => Crm.helyi(f.hatarido) > vege);

            const csempe = (n, kulcs, szin, adat) => `
                <button type="button" class="agTile ${szin}" ${adat}>
                    <span class="agTileIcon" aria-hidden="true"><i class="fa-solid ${{ uj: "fa-star", kapcsolat: "fa-phone", aktiv: "fa-fire", targyalas: "fa-scale-balanced", nyert: "fa-trophy" }[kulcs] || "fa-circle"}"></i></span>
                    <b>${n}</b><span>${Crm.t("crmSt_" + kulcs)}</span>
                </button>`;

            body.innerHTML = `
                <div class="agTiles mb-4">
                    ${csempe(a.allapotok.uj, "uj", "blue", `data-st="uj"`)}
                    ${csempe(a.allapotok.kapcsolat, "kapcsolat", "", `data-st="kapcsolat"`)}
                    ${csempe(a.allapotok.aktiv, "aktiv", "green", `data-st="aktiv"`)}
                    ${csempe(a.allapotok.targyalas, "targyalas", "amber", `data-st="targyalas"`)}
                    ${csempe(a.allapotok.nyert, "nyert", "green", `data-st="nyert"`)}
                </div>
                ${a.beerkezett ? `
                <button type="button" class="crmInboxAlert mb-4" id="crmGoInbox">
                    <i class="fa-solid fa-inbox" aria-hidden="true"></i>
                    <span class="flex-fill text-start"><b>${Crm.t("crmInboxAlert", { n: a.beerkezett })}</b><span class="d-block small">${Crm.t("crmInboxAlertHint")}</span></span>
                    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </button>` : ""}
                <div class="row g-4">
                    <div class="col-lg-7">
                        <div class="card mb-4">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <h6 class="mb-0"><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${Crm.t("crmTasksDue")}</h6>
                                <button type="button" class="btn btn-link btn-sm p-0" data-go="feladatok">${Crm.t("crmAll")}</button>
                            </div>
                            ${a.feladatok.length ? `
                            <div class="list-group list-group-flush">
                                ${kesik.length ? `<div class="crmGroupHead text-danger">${Crm.t("crmLate")} (${kesik.length})</div>${kesik.map(f => Crm.feladatSor(f)).join("")}` : ""}
                                ${ma.length ? `<div class="crmGroupHead">${Crm.t("crmToday")} (${ma.length})</div>${ma.map(f => Crm.feladatSor(f)).join("")}` : ""}
                                ${kesobb.length ? `<div class="crmGroupHead">${Crm.t("crmNext7")} (${kesobb.length})</div>${kesobb.map(f => Crm.feladatSor(f)).join("")}` : ""}
                            </div>` : `<div class="card-body small text-body-secondary">${Crm.t("crmNoTasksDue")}</div>`}
                        </div>
                    </div>
                    <div class="col-lg-5">
                        <div class="card mb-4">
                            <div class="card-header"><h6 class="mb-0"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${Crm.t("crmCold")}</h6></div>
                            ${a.hidegek.length ? `
                            <ul class="list-group list-group-flush">
                                ${a.hidegek.map(u => `
                                    <li class="list-group-item d-flex align-items-center gap-2">
                                        <button type="button" class="btn btn-link p-0 text-start flex-fill text-truncate" data-ugyfel="${u.id}">${Crm.esc(u.nev)}</button>
                                        ${Crm.allapotBadge(u.allapot)}
                                        <span class="small text-body-secondary text-nowrap">${Utils.ago(u.utolso_kapcsolat || u.created_at)}</span>
                                    </li>`).join("")}
                            </ul>` : `<div class="card-body small text-success"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${Crm.t("crmColdNone")}</div>`}
                        </div>
                        <div class="card">
                            <div class="card-header"><h6 class="mb-0"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> ${Crm.t("crmRecent")}</h6></div>
                            ${a.tevekenysegek.length ? `
                            <ul class="list-group list-group-flush">
                                ${a.tevekenysegek.map(t => `
                                    <li class="list-group-item small">
                                        <button type="button" class="btn btn-link p-0 fw-semibold" data-ugyfel="${t.ugyfel_id}">${Crm.esc(t.ugyfel_nev)}</button>
                                        <span class="text-body-secondary"> · ${Crm.tevCim(t)} · ${Utils.ago(t.created_at)}</span>
                                    </li>`).join("")}
                            </ul>` : `<div class="card-body small text-body-secondary">${Crm.t("crmRecentNone")}</div>`}
                        </div>
                    </div>
                </div>
                ${!a.nyitott && !a.feladatok.length ? `
                <div class="crmStart mt-4">
                    <h6>${Crm.t("crmStartTitle")}</h6>
                    <ol class="small mb-0">
                        <li>${Crm.t("crmStart1")}</li>
                        <li>${Crm.t("crmStart2")}</li>
                        <li>${Crm.t("crmStart3")}</li>
                    </ol>
                </div>` : ""}`;

            body.querySelectorAll("[data-st]").forEach(b => b.onclick = () => { Crm.szuro.allapot = b.dataset.st; Crm.nezet = "ugyfelek"; Crm.keret(); });
            body.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { Crm.nezet = b.dataset.go; Crm.keret(); });
            const gi = body.querySelector("#crmGoInbox");
            if (gi) gi.onclick = () => { Crm.nezet = "beerkezo"; Crm.keret(); };
            Crm.kotesek(body);
        }).catch(e => { body.innerHTML = `<div class="alert alert-danger">${Crm.hiba(e)}</div>`; });
    }

    // Közös kötések: ügyfél megnyitása, feladat kész
    static kotesek(root) {
        root.querySelectorAll("[data-ugyfel]").forEach(b => b.onclick = e => { e.preventDefault(); Crm.ugyfelNyit(b.dataset.ugyfel); });
        root.querySelectorAll("[data-kesz]").forEach(cb => cb.onchange = () => {
            cb.disabled = true;
            Crm.api(`/feladatok/${cb.dataset.kesz}/kesz`, { method: "POST", body: { kesz: cb.checked } })
                .then(() => { Crm.jelez(Crm.t(cb.checked ? "crmTaskDone" : "crmTaskReopened")); Crm.frissit(); })
                .catch(e => { cb.disabled = false; cb.checked = !cb.checked; alert(Crm.hiba(e)); });
        });
        root.querySelectorAll("[data-fszerk]").forEach(b => b.onclick = () => Crm.feladatSzerk(JSON.parse(b.dataset.fszerk)));
    }

    static feladatSor(f, ugyfelNelkul = false) {
        const kesik = !f.kesz && Crm.kesik(f.hatarido);
        const adat = Crm.esc(JSON.stringify({ id: f.id, cim: f.cim, hatarido: f.hatarido, fontos: f.fontos, felelos_id: f.felelos_id, ugyfel_id: f.ugyfel_id, ugyfel_nev: f.ugyfel_nev }));
        return `
            <div class="list-group-item crmTask ${f.kesz ? "done" : ""}">
                <input class="form-check-input" type="checkbox" data-kesz="${f.id}" ${f.kesz ? "checked" : ""} aria-label="${Crm.esc(Crm.t("crmMarkDone"))}">
                <div class="flex-fill min-w-0">
                    <button type="button" class="btn btn-link p-0 text-start crmTaskTitle" data-fszerk="${adat}">${f.fontos ? `<i class="fa-solid fa-flag text-danger" aria-hidden="true"></i> ` : ""}${Crm.esc(f.cim)}</button>
                    <div class="small text-body-secondary">
                        ${f.hatarido ? `<span class="${kesik ? "text-danger fw-semibold" : ""}"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${Crm.hatarido(f.hatarido)}</span>` : Crm.t("crmNoDue")}
                        ${!ugyfelNelkul && f.ugyfel_id ? ` · <a href="#" data-ugyfel="${f.ugyfel_id}">${Crm.esc(f.ugyfel_nev || "")}</a>` : ""}
                        ${!ugyfelNelkul && f.ugyfel_telefon ? ` · <a href="tel:${Crm.esc(f.ugyfel_telefon)}">${Crm.esc(f.ugyfel_telefon)}</a>` : ""}
                        ${Crm.vezeto && f.felelos_id && f.felelos_id !== Crm.en ? ` · <i class="fa-regular fa-user" aria-hidden="true"></i> ${Crm.esc(f.felelos_nev || Crm.tagNev(f.felelos_id))}` : ""}
                    </div>
                </div>
            </div>`;
    }

    // ===================== ÜGYFELEK =====================

    static ugyfelek(body) {
        const f = Crm.szuro;
        Crm.betolt(body);
        const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
        Crm.api("/ugyfelek?" + qs).then(v => {
            const L = v.ugyfelek;
            body.innerHTML = `
                <div class="crmFilters">
                    <input type="search" class="form-control form-control-sm" id="crmQ" placeholder="${Crm.esc(Crm.t("crmSearch"))}" value="${Crm.esc(f.q)}" aria-label="${Crm.esc(Crm.t("crmSearch"))}">
                    <select class="form-select form-select-sm" id="crmFAllapot" aria-label="${Crm.esc(Crm.t("crmStatus"))}">
                        <option value="">${Crm.t("crmAllStatuses")}</option>
                        <option value="nyitott" ${f.allapot === "nyitott" ? "selected" : ""}>${Crm.t("crmOpen")}</option>
                        ${Crm.ALLAPOTOK.map(a => `<option value="${a}" ${f.allapot === a ? "selected" : ""}>${Crm.t("crmSt_" + a)}</option>`).join("")}
                    </select>
                    <select class="form-select form-select-sm" id="crmFSzerep" aria-label="${Crm.esc(Crm.t("crmRoles"))}">
                        <option value="">${Crm.t("crmAllRoles")}</option>
                        ${Crm.SZEREPEK.map(s => `<option value="${s}" ${f.szerep === s ? "selected" : ""}>${Crm.t("crmRole_" + s)}</option>`).join("")}
                    </select>
                    ${Crm.vezeto && Crm.tagok.length > 1 ? `
                    <select class="form-select form-select-sm" id="crmFFelelos" aria-label="${Crm.esc(Crm.t("crmOwner"))}">
                        <option value="">${Crm.t("crmAllOwners")}</option>
                        <option value="nincs" ${f.felelos === "nincs" ? "selected" : ""}>${Crm.t("crmNoOwner")}</option>
                        ${Crm.tagok.map(t => `<option value="${t.id}" ${String(f.felelos) === String(t.id) ? "selected" : ""}>${Crm.esc(t.nev)}</option>`).join("")}
                    </select>` : ""}
                    ${v.cimkek.length ? `
                    <select class="form-select form-select-sm" id="crmFCimke" aria-label="${Crm.esc(Crm.t("crmTags"))}">
                        <option value="">${Crm.t("crmAllTags")}</option>
                        ${v.cimkek.map(c => `<option ${f.cimke === c ? "selected" : ""}>${Crm.esc(c)}</option>`).join("")}
                    </select>` : ""}
                    <select class="form-select form-select-sm" id="crmFRend" aria-label="${Crm.esc(Crm.t("crmSort"))}">
                        ${["friss", "kapcsolat", "uj", "nev"].map(r => `<option value="${r}" ${f.rend === r ? "selected" : ""}>${Crm.t("crmSort_" + r)}</option>`).join("")}
                    </select>
                    <a class="btn btn-sm btn-outline-secondary" href="/api/crm/${Crm.ter}/export.csv" download title="${Crm.esc(Crm.t("crmExport"))}"><i class="fa-solid fa-file-csv" aria-hidden="true"></i> CSV</a>
                </div>
                ${L.length ? `
                <div class="table-responsive crmTableWrap">
                    <table class="table table-hover align-middle crmTable mb-0">
                        <thead><tr>
                            <th>${Crm.t("crmName")}</th><th>${Crm.t("crmContact")}</th><th>${Crm.t("crmStatus")}</th>
                            <th class="d-none d-lg-table-cell">${Crm.t("crmRoles")}</th>
                            ${Crm.vezeto && Crm.tagok.length > 1 ? `<th class="d-none d-md-table-cell">${Crm.t("crmOwner")}</th>` : ""}
                            <th>${Crm.t("crmNextTask")}</th><th class="d-none d-md-table-cell">${Crm.t("crmLastContact")}</th>
                        </tr></thead>
                        <tbody>
                            ${L.map(u => `
                                <tr data-sor="${u.id}">
                                    <td><button type="button" class="btn btn-link p-0 fw-semibold text-start" data-ugyfel="${u.id}">${Crm.esc(u.nev)}</button>
                                        ${(u.cimkek || []).length ? `<div>${u.cimkek.map(c => `<span class="crmTag">${Crm.esc(c)}</span>`).join(" ")}</div>` : ""}</td>
                                    <td class="small">${u.telefon ? `<a href="tel:${Crm.esc(u.telefon)}">${Crm.esc(u.telefon)}</a>` : ""}${u.email ? `<div class="text-truncate crmMail"><a href="mailto:${Crm.esc(u.email)}">${Crm.esc(u.email)}</a></div>` : ""}</td>
                                    <td>${Crm.allapotBadge(u.allapot)}</td>
                                    <td class="d-none d-lg-table-cell">${Crm.szerepek(u.szerepek)}</td>
                                    ${Crm.vezeto && Crm.tagok.length > 1 ? `<td class="d-none d-md-table-cell small">${Crm.esc(u.felelos_nev || "–")}</td>` : ""}
                                    <td class="small">${u.kov_feladat ? `<span class="${Crm.kesik(u.kov_feladat) ? "text-danger fw-semibold" : ""}">${Crm.hatarido(u.kov_feladat)}</span>` : `<span class="text-body-secondary">–</span>`}</td>
                                    <td class="small text-body-secondary d-none d-md-table-cell">${u.utolso_kapcsolat ? Utils.ago(u.utolso_kapcsolat) : "–"}</td>
                                </tr>`).join("")}
                        </tbody>
                    </table>
                </div>
                <p class="small text-body-secondary mt-2">${Crm.t("crmCount", { n: L.length })}</p>` : `
                <div class="emptyState">
                    <i class="fa-solid fa-address-book"></i>
                    <h5>${Crm.t(f.q || f.allapot !== "nyitott" || f.szerep || f.felelos || f.cimke ? "crmNoMatch" : "crmEmpty")}</h5>
                    <p>${Crm.t("crmEmptyHint")}</p>
                    <button type="button" class="btn btn-primary btn-sm" id="crmUres"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${Crm.t("crmNewContact")}</button>
                </div>`}`;

            let t = null;
            body.querySelector("#crmQ").oninput = e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; Crm.ugyfelek(body); }, 350); };
            const sel = (id, k) => { const x = body.querySelector(id); if (x) x.onchange = () => { f[k] = x.value; Crm.ugyfelek(body); }; };
            sel("#crmFAllapot", "allapot"); sel("#crmFSzerep", "szerep"); sel("#crmFFelelos", "felelos"); sel("#crmFCimke", "cimke"); sel("#crmFRend", "rend");
            const u = body.querySelector("#crmUres");
            if (u) u.onclick = () => Crm.ugyfelSzerk(null);
            body.querySelectorAll("tr[data-sor]").forEach(tr => tr.onclick = e => { if (e.target.closest("a,button")) return; Crm.ugyfelNyit(tr.dataset.sor); });
            Crm.kotesek(body);
            if (f.q) { const q = body.querySelector("#crmQ"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
        }).catch(e => { body.innerHTML = `<div class="alert alert-danger">${Crm.hiba(e)}</div>`; });
    }

    // ---------- Új / szerkesztés ----------

    static ugyfelSzerk(u, utana) {
        const uj = !u;
        u = u || { szerepek: [], cimkek: [], allapot: "uj", felelos_id: Crm.en, igeny: null };
        const i = u.igeny || {};
        const { tartalom, modal } = Svc.modal("crmSzerk", "modal-lg");
        const esc = Crm.esc;
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title">${Crm.t(uj ? "crmNewContact" : "crmEditContact")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(Crm.t("crmClose"))}"></button>
            </div>
            <form class="modal-body" id="crmSzerkForm" novalidate>
                <div class="row g-3">
                    <div class="col-md-6"><label class="form-label small mb-1" for="csNev">${Crm.t("crmName")} *</label><input class="form-control" id="csNev" required maxlength="160" value="${esc(u.nev)}"></div>
                    <div class="col-md-3"><label class="form-label small mb-1" for="csTel">${Crm.t("crmPhone")}</label><input class="form-control" id="csTel" type="tel" maxlength="40" value="${esc(u.telefon)}"></div>
                    <div class="col-md-3"><label class="form-label small mb-1" for="csEmail">${Crm.t("crmEmail")}</label><input class="form-control" id="csEmail" type="email" maxlength="160" value="${esc(u.email)}"></div>
                    <div class="col-12">
                        <span class="form-label small mb-1 d-block">${Crm.t("crmRoles")}</span>
                        <div class="d-flex flex-wrap gap-2">${Crm.SZEREPEK.map(s => `
                            <input type="checkbox" class="btn-check" id="csSz_${s}" value="${s}" ${u.szerepek.includes(s) ? "checked" : ""} autocomplete="off">
                            <label class="btn btn-sm btn-outline-primary" for="csSz_${s}">${Crm.t("crmRole_" + s)}</label>`).join("")}</div>
                    </div>
                    <div class="col-md-4"><label class="form-label small mb-1" for="csAllapot">${Crm.t("crmStatus")}</label>
                        <select class="form-select" id="csAllapot">${Crm.ALLAPOTOK.map(a => `<option value="${a}" ${u.allapot === a ? "selected" : ""}>${Crm.t("crmSt_" + a)}</option>`).join("")}</select></div>
                    <div class="col-md-4"><label class="form-label small mb-1" for="csForras">${Crm.t("crmSource")}</label>
                        <select class="form-select" id="csForras"><option value="">–</option>${Crm.FORRASOK.map(s => `<option value="${s}" ${u.forras === s ? "selected" : ""}>${Crm.t("crmSrc_" + s)}</option>`).join("")}</select></div>
                    ${Crm.vezeto ? `<div class="col-md-4"><label class="form-label small mb-1" for="csFelelos">${Crm.t("crmOwner")}</label>
                        <select class="form-select" id="csFelelos">${Crm.tagOpciok(u.felelos_id)}</select></div>` : ""}
                    <div class="col-12"><label class="form-label small mb-1" for="csCimkek">${Crm.t("crmTags")}</label>
                        <input class="form-control" id="csCimkek" maxlength="300" value="${esc((u.cimkek || []).join(", "))}" placeholder="${esc(Crm.t("crmTagsPh"))}"></div>

                    <div class="col-12"><h6 class="mt-2 mb-0"><i class="fa-solid fa-magnifying-glass-location" aria-hidden="true"></i> ${Crm.t("crmWish")}</h6>
                        <p class="small text-body-secondary mb-0">${Crm.t("crmWishHelp")}</p></div>
                    <div class="col-6 col-md-3"><label class="form-label small mb-1" for="csUgylet">${Crm.t("crmDeal")}</label>
                        <select class="form-select form-select-sm" id="csUgylet"><option value="">–</option>
                            <option value="elado" ${i.ugylet === "elado" ? "selected" : ""}>${Types.ugyletLabel("elado")}</option>
                            <option value="kiado" ${i.ugylet === "kiado" ? "selected" : ""}>${Types.ugyletLabel("kiado")}</option></select></div>
                    <div class="col-6 col-md-3"><label class="form-label small mb-1" for="csTipus">${Crm.t("crmType")}</label>
                        <select class="form-select form-select-sm" id="csTipus"><option value="">–</option>${Types.LIST.map(x => `<option value="${x.key}" ${i.tipus === x.key ? "selected" : ""}>${Types.label(x.key)}</option>`).join("")}</select></div>
                    <div class="col-6 col-md-3"><label class="form-label small mb-1" for="csVaros">${Crm.t("crmCity")}</label><input class="form-control form-control-sm" id="csVaros" maxlength="80" value="${esc(i.varos)}" list="crmVarosok"></div>
                    <div class="col-6 col-md-3"><label class="form-label small mb-1" for="csKerulet">${Crm.t("crmDistrict")}</label><input class="form-control form-control-sm" id="csKerulet" maxlength="80" value="${esc(i.kerulet)}"></div>
                    <div class="col-6 col-md-3"><label class="form-label small mb-1" for="csArMin">${Crm.t("crmPriceMin")} (€)</label><input class="form-control form-control-sm" id="csArMin" type="number" min="0" value="${esc(i.ar_min)}"></div>
                    <div class="col-6 col-md-3"><label class="form-label small mb-1" for="csArMax">${Crm.t("crmPriceMax")} (€)</label><input class="form-control form-control-sm" id="csArMax" type="number" min="0" value="${esc(i.ar_max)}"></div>
                    <div class="col-6 col-md-3"><label class="form-label small mb-1" for="csSzoba">${Crm.t("crmRoomsMin")}</label><input class="form-control form-control-sm" id="csSzoba" type="number" min="0" max="20" value="${esc(i.szoba_min)}"></div>
                    <div class="col-6 col-md-3"><label class="form-label small mb-1" for="csNm">${Crm.t("crmAreaMin")} (m²)</label><input class="form-control form-control-sm" id="csNm" type="number" min="0" value="${esc(i.nm_min)}"></div>
                    <div class="col-12"><label class="form-label small mb-1" for="csJegyzet">${Crm.t("crmNotes")}</label><textarea class="form-control" id="csJegyzet" rows="3" maxlength="4000">${esc(u.jegyzet)}</textarea></div>
                </div>
                <datalist id="crmVarosok">${(typeof CityManager !== "undefined" ? CityManager.varosok : []).map(c => `<option value="${esc(c.nev)}">`).join("")}</datalist>
                <div class="alert alert-warning small py-2 mt-3" id="csDup" hidden></div>
                <div class="alert alert-danger small py-2 mt-3" id="csHiba" hidden></div>
            </form>
            <div class="modal-footer">
                ${!uj && Crm.vezeto ? `<button type="button" class="btn btn-outline-danger me-auto" id="csTorol"><i class="fa-solid fa-trash" aria-hidden="true"></i> ${Crm.t("crmDelete")}</button>` : ""}
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${Crm.t("crmCancel")}</button>
                <button type="submit" class="btn btn-primary" form="crmSzerkForm" id="csMent">${Crm.t("crmSave")}</button>
            </div>`;
        modal.show();
        setTimeout(() => tartalom.querySelector("#csNev").focus(), 300);

        const $ = s => tartalom.querySelector(s);
        let mindenkepp = false;
        const kuld = e => {
            if (e) e.preventDefault();
            const hibaEl = $("#csHiba");
            hibaEl.hidden = true;
            const adat = {
                nev: $("#csNev").value, telefon: $("#csTel").value, email: $("#csEmail").value,
                szerepek: Crm.SZEREPEK.filter(s => $("#csSz_" + s).checked),
                allapot: $("#csAllapot").value, forras: $("#csForras").value,
                cimkek: $("#csCimkek").value.split(",").map(x => x.trim()).filter(Boolean),
                jegyzet: $("#csJegyzet").value,
                igeny: { ugylet: $("#csUgylet").value, tipus: $("#csTipus").value, varos: $("#csVaros").value, kerulet: $("#csKerulet").value,
                    ar_min: $("#csArMin").value, ar_max: $("#csArMax").value, szoba_min: $("#csSzoba").value, nm_min: $("#csNm").value },
                mindenkepp
            };
            if ($("#csFelelos")) adat.felelos_id = $("#csFelelos").value;
            if (!adat.nev.trim()) { $("#csNev").classList.add("is-invalid"); $("#csNev").focus(); return; }
            $("#csMent").disabled = true;
            Crm.api(uj ? "/ugyfelek" : `/ugyfelek/${u.id}`, { method: uj ? "POST" : "PUT", body: adat })
                .then(v => {
                    modal.hide();
                    Crm.jelez(Crm.t("crmSaved"));
                    if (utana) utana(v);
                    else if (uj) Crm.ugyfelNyit(v.id);
                    Crm.frissit();
                })
                .catch(err => {
                    $("#csMent").disabled = false;
                    if (err.message === "duplicate" && err.adat && err.adat.masik) {
                        const d = $("#csDup");
                        d.innerHTML = `${Crm.t("crmDupFound", { nev: Crm.esc(err.adat.masik.nev) })}
                            <div class="mt-2 d-flex gap-2"><button type="button" class="btn btn-sm btn-outline-primary" id="csDupNyit">${Crm.t("crmDupOpen")}</button>
                            <button type="button" class="btn btn-sm btn-outline-secondary" id="csDupMeg">${Crm.t("crmDupCreate")}</button></div>`;
                        d.hidden = false;
                        $("#csDupNyit").onclick = () => { modal.hide(); Crm.ugyfelNyit(err.adat.masik.id); };
                        $("#csDupMeg").onclick = () => { mindenkepp = true; d.hidden = true; kuld(); };
                        return;
                    }
                    hibaEl.textContent = Crm.hiba(err);
                    hibaEl.hidden = false;
                });
        };
        $("#crmSzerkForm").onsubmit = kuld;
        const tor = $("#csTorol");
        if (tor) tor.onclick = () => {
            if (!confirm(Crm.t("crmDeleteConfirm", { nev: u.nev }))) return;
            Crm.api(`/ugyfelek/${u.id}`, { method: "DELETE" }).then(() => {
                modal.hide();
                const m = document.getElementById("crmUgyfel");
                if (m) bootstrap.Modal.getOrCreateInstance(m).hide();
                Crm.jelez(Crm.t("crmDeleted"));
                Crm.frissit();
            }).catch(e => alert(Crm.hiba(e)));
        };
    }

    // ---------- Adatlap ----------

    static ugyfelNyit(id) {
        const { tartalom, modal } = Svc.modal("crmUgyfel", "modal-xl");
        tartalom.innerHTML = `<div class="modal-body text-center py-5"><span class="spinner-border text-primary" role="status"></span></div>`;
        modal.show();
        Crm.adatlap(id, tartalom, modal);
    }

    static adatlap(id, tartalom, modal) {
        Crm.api(`/ugyfelek/${id}`).then(u => {
            const esc = Crm.esc;
            const i = u.igeny || {};
            const igenySzoveg = [
                i.ugylet ? Types.ugyletLabel(i.ugylet) : "", i.tipus ? Types.label(i.tipus) : "", i.varos, i.kerulet,
                i.ar_min || i.ar_max ? `${i.ar_min ? Utils.eur(i.ar_min) : ""}–${i.ar_max ? Utils.eur(i.ar_max) : ""}` : "",
                i.szoba_min ? `${i.szoba_min}+ ${Crm.t("crmRooms")}` : "", i.nm_min ? `${i.nm_min}+ m²` : ""
            ].filter(Boolean).join(" · ");
            const nyitottF = u.feladatok.filter(f => !f.kesz);
            const keszF = u.feladatok.filter(f => f.kesz);

            tartalom.innerHTML = `
                <div class="modal-header crmHead">
                    <div class="min-w-0">
                        <h5 class="modal-title text-truncate">${esc(u.nev)}</h5>
                        <div class="d-flex flex-wrap gap-2 align-items-center mt-1">
                            <select class="form-select form-select-sm w-auto crmStSel crmSt-${esc(u.allapot)}" id="cuAllapot" aria-label="${esc(Crm.t("crmStatus"))}">
                                ${Crm.ALLAPOTOK.map(a => `<option value="${a}" ${u.allapot === a ? "selected" : ""}>${Crm.t("crmSt_" + a)}</option>`).join("")}
                            </select>
                            ${Crm.szerepek(u.szerepek)}
                            ${(u.cimkek || []).map(c => `<span class="crmTag">${esc(c)}</span>`).join(" ")}
                        </div>
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(Crm.t("crmClose"))}"></button>
                </div>
                <div class="modal-body">
                    <div class="row g-4">
                        <div class="col-lg-5">
                            <div class="crmCard">
                                <div class="d-flex justify-content-between align-items-start gap-2">
                                    <div class="small crmFacts">
                                        ${u.telefon ? `<div><i class="fa-solid fa-phone fa-fw" aria-hidden="true"></i> <a href="tel:${esc(u.telefon)}">${esc(u.telefon)}</a></div>` : ""}
                                        ${u.email ? `<div class="text-truncate"><i class="fa-regular fa-envelope fa-fw" aria-hidden="true"></i> <a href="mailto:${esc(u.email)}">${esc(u.email)}</a></div>` : ""}
                                        ${u.forras ? `<div><i class="fa-solid fa-route fa-fw" aria-hidden="true"></i> ${Crm.t("crmSrc_" + u.forras)}</div>` : ""}
                                        <div><i class="fa-regular fa-user fa-fw" aria-hidden="true"></i> ${Crm.vezeto && Crm.tagok.length > 1
                                            ? `<select class="form-select form-select-sm d-inline-block w-auto py-0" id="cuFelelos" aria-label="${esc(Crm.t("crmOwner"))}">${Crm.tagOpciok(u.felelos_id)}</select>`
                                            : esc(u.felelos_nev || Crm.t("crmNoOwner"))}</div>
                                        <div class="text-body-secondary"><i class="fa-regular fa-calendar fa-fw" aria-hidden="true"></i> ${Crm.t("crmCreated")}: ${Crm.nap(u.created_at)}${u.utolso_kapcsolat ? ` · ${Crm.t("crmLastContact")}: ${Utils.ago(u.utolso_kapcsolat)}` : ""}</div>
                                    </div>
                                    <button type="button" class="btn btn-sm btn-outline-secondary" id="cuSzerk"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${Crm.t("crmEdit")}</button>
                                </div>
                                ${u.jegyzet ? `<p class="small mt-2 mb-0 crmNote">${esc(u.jegyzet)}</p>` : ""}
                            </div>

                            <div class="crmCard">
                                <h6><i class="fa-solid fa-magnifying-glass-location" aria-hidden="true"></i> ${Crm.t("crmWish")}</h6>
                                ${igenySzoveg ? `<p class="small mb-2">${esc(igenySzoveg)}</p>` : `<p class="small text-body-secondary mb-2">${Crm.t("crmWishNone")}</p>`}
                                ${i.megjegyzes ? `<p class="small text-body-secondary">${esc(i.megjegyzes)}</p>` : ""}
                                ${u.illeszkedo.length ? `
                                    <div class="small fw-semibold mb-1">${Crm.t("crmMatches", { n: u.illeszkedo.length })}</div>
                                    ${u.illeszkedo.map(x => Crm.ingatlanSor(x, `<button type="button" class="btn btn-sm btn-outline-primary text-nowrap" data-ajanl="${x.id}" title="${esc(Crm.t("crmOfferHint"))}">${Crm.t("crmOffer")}</button>`)).join("")}` : igenySzoveg ? `<p class="small text-body-secondary mb-0">${Crm.t("crmMatchesNone")}</p>` : ""}
                            </div>

                            <div class="crmCard">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <h6 class="mb-0"><i class="fa-solid fa-house" aria-hidden="true"></i> ${Crm.t("crmProps")}</h6>
                                    <button type="button" class="btn btn-sm btn-link p-0" id="cuIngUj"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${Crm.t("crmLinkProp")}</button>
                                </div>
                                <div id="cuIngKereso" hidden class="mb-2">
                                    <input type="search" class="form-control form-control-sm" id="cuIngQ" placeholder="${esc(Crm.t("crmPropSearch"))}" aria-label="${esc(Crm.t("crmPropSearch"))}">
                                    <div id="cuIngTalal" class="crmPropResults"></div>
                                </div>
                                ${u.ingatlanok.length ? u.ingatlanok.map(x => Crm.ingatlanSor(x, `
                                    <div class="d-flex flex-column align-items-end gap-1">
                                        <select class="form-select form-select-sm py-0 crmKapcsSel" data-kapcs="${x.id}" data-szerep="${esc(x.szerep)}" aria-label="${esc(Crm.t("crmStatus"))}">
                                            ${["uj", "kuldve", "megtekintes", "ajanlat", "elvetve"].map(k => `<option value="${k}" ${x.kapcs_allapot === k ? "selected" : ""}>${Crm.t((x.szerep === "tulajdonos" ? "crmOwnSt_" : "crmLinkSt_") + k)}</option>`).join("")}
                                        </select>
                                        <span class="small text-body-secondary">${Crm.t("crmLinkRole_" + x.szerep)} · <button type="button" class="btn btn-link btn-sm p-0 text-danger" data-levesz="${x.id}">${Crm.t("crmUnlink")}</button></span>
                                    </div>`)).join("") : `<p class="small text-body-secondary mb-0">${Crm.t("crmPropsNone")}</p>`}
                            </div>
                        </div>

                        <div class="col-lg-7">
                            <div class="crmCard crmLog">
                                <div class="crmLogTypes" role="group" aria-label="${esc(Crm.t("crmLogType"))}">
                                    ${Crm.TEV.map((x, n) => `
                                        <input type="radio" class="btn-check" name="cuTip" id="cuTip_${x.k}" value="${x.k}" ${n === 0 ? "checked" : ""}>
                                        <label class="btn btn-sm btn-outline-secondary" for="cuTip_${x.k}"><i class="${x.ikon}" aria-hidden="true"></i> ${Crm.t("crmTev_" + x.k)}</label>`).join("")}
                                </div>
                                <textarea class="form-control mt-2" id="cuSzoveg" rows="2" maxlength="4000" placeholder="${esc(Crm.t("crmLogPh"))}" aria-label="${esc(Crm.t("crmLogPh"))}"></textarea>
                                <div class="d-flex flex-wrap gap-2 align-items-center mt-2">
                                    <div class="form-check form-check-inline small m-0">
                                        <input class="form-check-input" type="checkbox" id="cuKov">
                                        <label class="form-check-label" for="cuKov">${Crm.t("crmFollowUp")}</label>
                                    </div>
                                    <input type="datetime-local" class="form-control form-control-sm w-auto" id="cuKovIdo" hidden aria-label="${esc(Crm.t("crmDue"))}">
                                    <button type="button" class="btn btn-primary btn-sm ms-auto" id="cuNaploz"><i class="fa-solid fa-check" aria-hidden="true"></i> ${Crm.t("crmLogSave")}</button>
                                </div>
                            </div>

                            <div class="crmCard">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <h6 class="mb-0"><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${Crm.t("crmTasks")}</h6>
                                    <button type="button" class="btn btn-sm btn-link p-0" id="cuFelUj"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${Crm.t("crmNewTask")}</button>
                                </div>
                                ${nyitottF.length ? `<div class="list-group list-group-flush">${nyitottF.map(f => Crm.feladatSor(f, true)).join("")}</div>` : `<p class="small text-body-secondary mb-0">${Crm.t("crmNoOpenTasks")}</p>`}
                                ${keszF.length ? `<details class="mt-2"><summary class="small text-body-secondary">${Crm.t("crmDoneTasks", { n: keszF.length })}</summary><div class="list-group list-group-flush">${keszF.map(f => Crm.feladatSor(f, true)).join("")}</div></details>` : ""}
                            </div>

                            <div class="crmCard">
                                <h6><i class="fa-solid fa-timeline" aria-hidden="true"></i> ${Crm.t("crmTimeline")}</h6>
                                <ol class="crmTimeline">
                                    ${u.tevekenysegek.map(t => `
                                        <li class="crmTl crmTl-${esc(t.tipus)}">
                                            <span class="crmTlIcon" aria-hidden="true"><i class="${(Crm.TEV.find(x => x.k === t.tipus) || { ikon: "fa-solid fa-circle-info" }).ikon}"></i></span>
                                            <div class="flex-fill min-w-0">
                                                <div class="small"><b>${Crm.tevCim(t)}</b> <span class="text-body-secondary">· ${Crm.idopont(t.created_at)}${t.user_nev ? ` · ${esc(t.user_nev)}` : ""}</span>
                                                    ${t.tipus !== "rendszer" && (Crm.vezeto || t.user_id === Crm.en) && t.user_id ? `<button type="button" class="btn btn-link btn-sm p-0 ms-1 text-body-secondary" data-tevtorol="${t.id}" aria-label="${esc(Crm.t("crmDelete"))}"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>` : ""}</div>
                                                ${t.tipus !== "rendszer" && t.szoveg ? `<div class="crmTlText">${esc(t.szoveg)}</div>` : ""}
                                                ${t.ingatlan_id ? `<a class="small" href="#listing/${t.ingatlan_id}"><i class="fa-solid fa-house" aria-hidden="true"></i> ${esc(t.ingatlan_cim || "#" + t.ingatlan_id)}</a>` : ""}
                                            </div>
                                        </li>`).join("")}
                                </ol>
                            </div>
                        </div>
                    </div>
                </div>`;

            const $ = s => tartalom.querySelector(s);
            const ujra = () => { Crm.adatlap(u.id, tartalom, modal); Crm.frissit(); };

            $("#cuSzerk").onclick = () => Crm.ugyfelSzerk(u, () => ujra());
            $("#cuAllapot").onchange = e => Crm.api(`/ugyfelek/${u.id}`, { method: "PATCH", body: { allapot: e.target.value } }).then(ujra).catch(err => alert(Crm.hiba(err)));
            const fel = $("#cuFelelos");
            if (fel) fel.onchange = e => Crm.api(`/ugyfelek/${u.id}`, { method: "PATCH", body: { felelos_id: e.target.value } }).then(() => { Crm.jelez(Crm.t("crmReassigned")); ujra(); }).catch(err => alert(Crm.hiba(err)));

            // Gyors bejegyzés (+ opcionális követő feladat)
            $("#cuKov").onchange = e => {
                const x = $("#cuKovIdo");
                x.hidden = !e.target.checked;
                if (e.target.checked && !x.value) {
                    const d = new Date(Date.now() + 2 * 86400000); d.setHours(10, 0, 0, 0);
                    x.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                }
            };
            $("#cuNaploz").onclick = () => {
                const szoveg = $("#cuSzoveg").value.trim();
                const tipus = (tartalom.querySelector("input[name=cuTip]:checked") || {}).value || "jegyzet";
                if (!szoveg) { $("#cuSzoveg").classList.add("is-invalid"); $("#cuSzoveg").focus(); return; }
                $("#cuNaploz").disabled = true;
                const lepesek = [Crm.api(`/ugyfelek/${u.id}/tevekenyseg`, { method: "POST", body: { tipus, szoveg } })];
                if ($("#cuKov").checked && $("#cuKovIdo").value) {
                    lepesek.push(Crm.api("/feladatok", { method: "POST", body: { cim: Crm.t("crmFollowUpTitle", { nev: u.nev }), hatarido: $("#cuKovIdo").value, ugyfel_id: u.id, felelos_id: u.felelos_id || Crm.en } }));
                }
                Promise.all(lepesek).then(() => { Crm.jelez(Crm.t("crmLogged")); ujra(); })
                    .catch(err => { $("#cuNaploz").disabled = false; alert(Crm.hiba(err)); });
            };

            $("#cuFelUj").onclick = () => Crm.feladatSzerk({ ugyfel_id: u.id, ugyfel_nev: u.nev, felelos_id: u.felelos_id || Crm.en }, ujra);

            // Ingatlanok
            $("#cuIngUj").onclick = () => {
                const k = $("#cuIngKereso");
                k.hidden = !k.hidden;
                if (!k.hidden) { $("#cuIngQ").focus(); keres(""); }
            };
            let tt = null;
            const keres = q => Crm.api("/ingatlan-kereso?q=" + encodeURIComponent(q)).then(L => {
                $("#cuIngTalal").innerHTML = L.length ? L.map(x => `
                    <div class="crmPropPick">
                        <span class="flex-fill min-w-0 text-truncate small">#${x.id} ${esc(x.cim || Types.label(x.tipus))} <span class="text-body-secondary">${x.ar ? esc(Utils.eur(x.ar)) : ""}${x.sajat ? "" : ` · ${Crm.t("crmNotOurs")}`}</span></span>
                        <button type="button" class="btn btn-sm btn-outline-primary py-0" data-kapcsol="${x.id}" data-szerep="erdeklodik">${Crm.t("crmLinkRole_erdeklodik")}</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary py-0" data-kapcsol="${x.id}" data-szerep="tulajdonos">${Crm.t("crmLinkRole_tulajdonos")}</button>
                    </div>`).join("") : `<p class="small text-body-secondary mb-0 mt-1">${Crm.t("crmPropNoResult")}</p>`;
                $("#cuIngTalal").querySelectorAll("[data-kapcsol]").forEach(b => b.onclick = () =>
                    Crm.api(`/ugyfelek/${u.id}/ingatlan`, { method: "POST", body: { ingatlan_id: b.dataset.kapcsol, szerep: b.dataset.szerep } }).then(ujra).catch(err => alert(Crm.hiba(err))));
            });
            $("#cuIngQ").oninput = e => { clearTimeout(tt); tt = setTimeout(() => keres(e.target.value), 300); };
            tartalom.querySelectorAll("[data-kapcs]").forEach(s => s.onchange = () =>
                Crm.api(`/ugyfelek/${u.id}/ingatlan`, { method: "POST", body: { ingatlan_id: s.dataset.kapcs, szerep: s.dataset.szerep, allapot: s.value } }).then(ujra).catch(err => alert(Crm.hiba(err))));
            tartalom.querySelectorAll("[data-levesz]").forEach(b => b.onclick = () => {
                if (!confirm(Crm.t("crmUnlinkConfirm"))) return;
                Crm.api(`/ugyfelek/${u.id}/ingatlan/${b.dataset.levesz}`, { method: "DELETE" }).then(ujra).catch(err => alert(Crm.hiba(err)));
            });
            // Illeszkedő ajánlása: kapcsolás „elküldve” állapottal
            tartalom.querySelectorAll("[data-ajanl]").forEach(b => b.onclick = () =>
                Crm.api(`/ugyfelek/${u.id}/ingatlan`, { method: "POST", body: { ingatlan_id: b.dataset.ajanl, szerep: "erdeklodik", allapot: "kuldve" } })
                    .then(() => { Crm.jelez(Crm.t("crmOffered")); ujra(); }).catch(err => alert(Crm.hiba(err))));

            tartalom.querySelectorAll("[data-tevtorol]").forEach(b => b.onclick = () => {
                if (!confirm(Crm.t("crmDeleteEntry"))) return;
                Crm.api(`/ugyfelek/${u.id}/tevekenyseg/${b.dataset.tevtorol}`, { method: "DELETE" }).then(ujra).catch(err => alert(Crm.hiba(err)));
            });

            // feladatok (kész / szerkesztés) – az adatlapon maradva
            tartalom.querySelectorAll("[data-kesz]").forEach(cb => cb.onchange = () =>
                Crm.api(`/feladatok/${cb.dataset.kesz}/kesz`, { method: "POST", body: { kesz: cb.checked } }).then(ujra).catch(err => alert(Crm.hiba(err))));
            tartalom.querySelectorAll("[data-fszerk]").forEach(b => b.onclick = () => Crm.feladatSzerk(JSON.parse(b.dataset.fszerk), ujra));
        }).catch(e => {
            tartalom.innerHTML = `<div class="modal-body"><div class="alert alert-danger mb-0">${Crm.hiba(e)}</div></div>`;
        });
    }

    // Az idővonal sorának címe (a rendszer-bejegyzések szövegesen)
    static tevCim(t) {
        if (t.tipus !== "rendszer") return Crm.t("crmTev_" + t.tipus);
        const s = String(t.szoveg || "");
        if (s === "letrehozva") return Crm.t("crmSys_created");
        if (s === "letrehozva_uzenetbol") return Crm.t("crmSys_fromMsg");
        if (s.startsWith("allapot:")) {
            const [a, b] = s.slice(8).split(">");
            return Crm.t("crmSys_status", { a: Crm.t("crmSt_" + a), b: Crm.t("crmSt_" + b) });
        }
        if (s.startsWith("felelos:")) {
            const id = s.slice(8);
            return id ? Crm.t("crmSys_owner", { nev: Crm.esc(Crm.tagNev(id) || "#" + id) }) : Crm.t("crmSys_ownerNone");
        }
        if (s.startsWith("ingatlan:")) {
            const [, szerep, all] = s.split(":");
            return Crm.t("crmSys_prop", { mi: Crm.t((szerep === "tulajdonos" ? "crmOwnSt_" : "crmLinkSt_") + (all || "uj")) });
        }
        if (s.startsWith("feladat:")) return Crm.t("crmSys_task", { cim: Crm.esc(s.slice(8)) });
        if (s.startsWith("kesz:")) return Crm.t("crmSys_done", { cim: Crm.esc(s.slice(5)) });
        return Crm.esc(s);
    }

    // ===================== FELADATOK =====================

    static feladatok(body) {
        const f = Crm.fSzuro;
        Crm.betolt(body);
        const qs = new URLSearchParams({ ...(f.felelos ? { felelos: f.felelos } : {}), ...(f.kesz ? { kesz: 1 } : {}) }).toString();
        Crm.api("/feladatok?" + qs).then(L => {
            const most = new Date();
            const maVege = new Date(); maVege.setHours(23, 59, 59, 999);
            const holnapVege = new Date(maVege.getTime() + 86400000);
            const hetVege = new Date(maVege.getTime() + 7 * 86400000);
            const csop = { kesik: [], ma: [], holnap: [], het: [], kesobb: [], nincs: [] };
            if (!f.kesz) {
                L.forEach(x => {
                    const h = Crm.helyi(x.hatarido);
                    if (!h) csop.nincs.push(x);
                    else if (h < most && h.toDateString() !== most.toDateString()) csop.kesik.push(x);
                    else if (h <= maVege) csop.ma.push(x);
                    else if (h <= holnapVege) csop.holnap.push(x);
                    else if (h <= hetVege) csop.het.push(x);
                    else csop.kesobb.push(x);
                });
            }
            body.innerHTML = `
                <div class="crmFilters">
                    <div class="btn-group btn-group-sm" role="group">
                        <button type="button" class="btn ${!f.kesz ? "btn-primary" : "btn-outline-secondary"}" data-fk="0">${Crm.t("crmOpenTasks")}</button>
                        <button type="button" class="btn ${f.kesz ? "btn-primary" : "btn-outline-secondary"}" data-fk="1">${Crm.t("crmDoneTab")}</button>
                    </div>
                    ${Crm.vezeto && Crm.tagok.length > 1 ? `
                    <select class="form-select form-select-sm w-auto" id="crmFFel" aria-label="${Crm.esc(Crm.t("crmOwner"))}">
                        <option value="">${Crm.t("crmEveryone")}</option>
                        <option value="en" ${f.felelos === "en" ? "selected" : ""}>${Crm.t("crmMine")}</option>
                        ${Crm.tagok.filter(t => t.id !== Crm.en).map(t => `<option value="${t.id}" ${String(f.felelos) === String(t.id) ? "selected" : ""}>${Crm.esc(t.nev)}</option>`).join("")}
                    </select>` : ""}
                </div>
                ${L.length ? (f.kesz
                    ? `<div class="card"><div class="list-group list-group-flush">${L.map(x => Crm.feladatSor(x)).join("")}</div></div>`
                    : Object.entries(csop).filter(([, l]) => l.length).map(([k, l]) => `
                        <div class="card mb-3">
                            <div class="card-header py-2"><h6 class="mb-0 ${k === "kesik" ? "text-danger" : ""}">${Crm.t("crmGrp_" + k)} <span class="badge text-bg-light">${l.length}</span></h6></div>
                            <div class="list-group list-group-flush">${l.map(x => Crm.feladatSor(x)).join("")}</div>
                        </div>`).join(""))
                : `<div class="emptyState"><i class="fa-solid fa-list-check"></i><h5>${Crm.t(f.kesz ? "crmNoDone" : "crmNoTasks")}</h5><p>${Crm.t("crmNoTasksHint")}</p></div>`}`;
            body.querySelectorAll("[data-fk]").forEach(b => b.onclick = () => { f.kesz = b.dataset.fk === "1"; Crm.feladatok(body); });
            const ff = body.querySelector("#crmFFel");
            if (ff) ff.onchange = () => { f.felelos = ff.value; Crm.feladatok(body); };
            Crm.kotesek(body);
        }).catch(e => { body.innerHTML = `<div class="alert alert-danger">${Crm.hiba(e)}</div>`; });
    }

    static feladatSzerk(f, utana) {
        const uj = !f || !f.id;
        f = f || { felelos_id: Crm.en };
        const { tartalom, modal } = Svc.modal("crmFeladat", "");
        const esc = Crm.esc;
        const h = Crm.helyi(f.hatarido);
        const hErtek = h ? new Date(h.getTime() - h.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title">${Crm.t(uj ? "crmNewTask" : "crmEditTask")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(Crm.t("crmClose"))}"></button>
            </div>
            <form class="modal-body" id="crmFelForm" novalidate>
                <label class="form-label small mb-1" for="cfCim">${Crm.t("crmTaskTitle")} *</label>
                <input class="form-control mb-2" id="cfCim" maxlength="200" required value="${esc(f.cim)}" placeholder="${esc(Crm.t("crmTaskPh"))}">
                <div class="d-flex flex-wrap gap-1 mb-3">
                    ${["crmQ_call", "crmQ_viewing", "crmQ_send", "crmQ_docs"].map(k => `<button type="button" class="btn btn-sm btn-outline-secondary py-0" data-gyors="${esc(Crm.t(k))}">${Crm.t(k)}</button>`).join("")}
                </div>
                <label class="form-label small mb-1" for="cfIdo">${Crm.t("crmDue")}</label>
                <input type="datetime-local" class="form-control mb-1" id="cfIdo" value="${hErtek}">
                <div class="d-flex flex-wrap gap-1 mb-3">
                    <button type="button" class="btn btn-sm btn-link p-0 me-2" data-nap="0">${Crm.t("crmToday")}</button>
                    <button type="button" class="btn btn-sm btn-link p-0 me-2" data-nap="1">${Crm.t("crmTomorrow")}</button>
                    <button type="button" class="btn btn-sm btn-link p-0 me-2" data-nap="7">${Crm.t("crmInAWeek")}</button>
                </div>
                ${Crm.vezeto && Crm.tagok.length > 1 ? `
                <label class="form-label small mb-1" for="cfFelelos">${Crm.t("crmOwner")}</label>
                <select class="form-select mb-3" id="cfFelelos">${Crm.tagOpciok(f.felelos_id, false)}</select>` : ""}
                ${f.ugyfel_id ? `<p class="small mb-2"><i class="fa-regular fa-user" aria-hidden="true"></i> ${Crm.t("crmForContact")}: <b>${esc(f.ugyfel_nev || "#" + f.ugyfel_id)}</b></p>` : ""}
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="cfFontos" ${f.fontos ? "checked" : ""}>
                    <label class="form-check-label" for="cfFontos">${Crm.t("crmImportant")}</label>
                </div>
                <div class="alert alert-danger small py-2 mt-3" id="cfHiba" hidden></div>
            </form>
            <div class="modal-footer">
                ${!uj ? `<button type="button" class="btn btn-outline-danger me-auto" id="cfTorol"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>` : ""}
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${Crm.t("crmCancel")}</button>
                <button type="submit" class="btn btn-primary" form="crmFelForm" id="cfMent">${Crm.t("crmSave")}</button>
            </div>`;
        modal.show();
        const $ = s => tartalom.querySelector(s);
        setTimeout(() => $("#cfCim").focus(), 300);
        tartalom.querySelectorAll("[data-gyors]").forEach(b => b.onclick = () => { $("#cfCim").value = b.dataset.gyors + (f.ugyfel_nev ? ` – ${f.ugyfel_nev}` : ""); });
        tartalom.querySelectorAll("[data-nap]").forEach(b => b.onclick = () => {
            const d = new Date(Date.now() + Number(b.dataset.nap) * 86400000);
            d.setHours(Number(b.dataset.nap) === 0 ? Math.min(23, new Date().getHours() + 1) : 10, 0, 0, 0);
            $("#cfIdo").value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        });
        $("#crmFelForm").onsubmit = e => {
            e.preventDefault();
            const cim = $("#cfCim").value.trim();
            if (!cim) { $("#cfCim").classList.add("is-invalid"); return; }
            $("#cfMent").disabled = true;
            Crm.api(uj ? "/feladatok" : `/feladatok/${f.id}`, {
                method: uj ? "POST" : "PUT",
                body: { cim, hatarido: $("#cfIdo").value || null, fontos: $("#cfFontos").checked, felelos_id: $("#cfFelelos") ? $("#cfFelelos").value : (f.felelos_id || Crm.en), ugyfel_id: f.ugyfel_id || null }
            }).then(() => { modal.hide(); Crm.jelez(Crm.t("crmSaved")); if (utana) utana(); else Crm.frissit(); })
                .catch(err => { $("#cfMent").disabled = false; $("#cfHiba").textContent = Crm.hiba(err); $("#cfHiba").hidden = false; });
        };
        const tor = $("#cfTorol");
        if (tor) tor.onclick = () => {
            if (!confirm(Crm.t("crmDeleteTask"))) return;
            Crm.api(`/feladatok/${f.id}`, { method: "DELETE" }).then(() => { modal.hide(); if (utana) utana(); else Crm.frissit(); }).catch(err => alert(Crm.hiba(err)));
        };
    }

    // ===================== BEÉRKEZŐ =====================

    static beerkezo(body) {
        Crm.betolt(body);
        Crm.api("/beerkezo").then(L => {
            Crm.badge(L.length);
            const esc = Crm.esc;
            body.innerHTML = L.length ? L.map(c => `
                <article class="crmInbox" data-felado="${esc(c.felado_id)}">
                    <div class="d-flex flex-wrap gap-2 align-items-start">
                        <div class="flex-fill min-w-0">
                            <b>${esc(c.nev || c.email || Crm.t("crmUnknown"))}</b>
                            ${c.meglevo ? `<span class="badge text-bg-info ms-1">${Crm.t("crmExisting")}</span>` : `<span class="badge text-bg-warning ms-1">${Crm.t("crmNewLead")}</span>`}
                            <div class="small text-body-secondary">
                                ${c.telefon ? `<a href="tel:${esc(c.telefon)}">${esc(c.telefon)}</a> · ` : ""}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a> · ` : ""}${Utils.ago(c.utolso)}
                            </div>
                        </div>
                        <div class="d-flex flex-wrap gap-2 align-items-center">
                            ${!c.meglevo ? `<div class="form-check small m-0"><input class="form-check-input" type="checkbox" id="crmCb${esc(c.felado_id)}" checked><label class="form-check-label" for="crmCb${esc(c.felado_id)}">${Crm.t("crmCallBackTomorrow")}</label></div>` : ""}
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-elvet="${esc(c.felado_id)}" title="${esc(Crm.t("crmDismissHint"))}">${Crm.t("crmDismiss")}</button>
                            <button type="button" class="btn btn-sm btn-primary" data-felvesz="${esc(c.felado_id)}">
                                ${c.meglevo ? `<i class="fa-solid fa-link" aria-hidden="true"></i> ${Crm.t("crmAddToExisting", { nev: esc(c.meglevo.nev) })}` : `<i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${Crm.t("crmMakeContact")}`}
                            </button>
                        </div>
                    </div>
                    ${c.ingatlanok.length ? `<div class="small mt-2"><i class="fa-solid fa-house" aria-hidden="true"></i> ${c.ingatlanok.map(i => `<a href="#listing/${i.id}">${esc(i.cim || "#" + i.id)}</a>`).join(", ")}</div>` : ""}
                    <div class="crmInboxMsgs">
                        ${c.uzenetek.slice(0, 3).map(m => `<blockquote class="small"><span class="text-body-secondary">${Crm.idopont(m.created_at)}</span><br>${esc(m.szoveg).slice(0, 600)}</blockquote>`).join("")}
                        ${c.uzenetek.length > 3 ? `<div class="small text-body-secondary">${Crm.t("crmMoreMsgs", { n: c.uzenetek.length - 3 })}</div>` : ""}
                    </div>
                </article>`).join("")
                : `<div class="emptyState"><i class="fa-solid fa-inbox"></i><h5>${Crm.t("crmInboxEmpty")}</h5><p>${Crm.t("crmInboxEmptyHint")}</p></div>`;

            body.querySelectorAll("[data-felvesz]").forEach(b => b.onclick = () => {
                b.disabled = true;
                const cb = body.querySelector("#crmCb" + CSS.escape(b.dataset.felvesz));
                Crm.api("/beerkezo/felvesz", { method: "POST", body: { felado_id: b.dataset.felvesz, feladat: cb && cb.checked ? Crm.t("crmQ_call") : null } })
                    .then(v => { Crm.jelez(Crm.t(v.uj ? "crmLeadCreated" : "crmLeadAdded")); Crm.beerkezo(body); Crm.ugyfelNyit(v.ugyfel_id); })
                    .catch(e => { b.disabled = false; alert(Crm.hiba(e)); });
            });
            body.querySelectorAll("[data-elvet]").forEach(b => b.onclick = () => {
                if (!confirm(Crm.t("crmDismissConfirm"))) return;
                Crm.api("/beerkezo/elvet", { method: "POST", body: { felado_id: b.dataset.elvet } }).then(() => Crm.beerkezo(body)).catch(e => alert(Crm.hiba(e)));
            });
        }).catch(e => { body.innerHTML = `<div class="alert alert-danger">${Crm.hiba(e)}</div>`; });
    }

}
