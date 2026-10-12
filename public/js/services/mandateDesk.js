// ============================================================
//  Értékesítési asztal – a megbízások kezelése (Eladjuk helyetted)
//
//  Ugyanez a felület két helyen fut:
//    Admin → Értékesítés → Megbízások     #admin/megbizasok[/<id>[/<fül>]]
//    Munkaterületem → Megbízások          #munka/megbizasok[/<id>[/<fül>]]
//  (a munkatárs csak a hatókörébe tartozó megbízásokat látja, és amihez
//  nincs joga – díj, szerződés küldése, lezárás, törlés –, az nem jelenik meg)
//
//  A lista:  KPI-k, Teendők (sürgősség szerint), közelgő megtekintések,
//            szűrők, lista- vagy táblanézet
//  Egy megbízás fülekkel:
//    Áttekintés · Ingatlan és hirdetés · Vevők · Megtekintések · Ajánlatok ·
//    Üzenetek · Szerződés és díj · Napló
//
//  Szerver: /api/ertekesites/megbizasok (server/routes/megbizas.js)
// ============================================================

class MandateDesk {

    static API = "/api/ertekesites/megbizasok";
    static OSZLOPOK = ["uj", "egyeztetes", "szerzodes", "fotozas", "hirdetes", "targyalas"];
    static LEZART = ["eladva", "lezarva", "elutasitva"];
    static FULEK = [
        { k: "attekintes", ikon: "fa-solid fa-gauge" },
        { k: "ingatlan", ikon: "fa-solid fa-house" },
        { k: "vevok", ikon: "fa-solid fa-users" },
        { k: "megtekintesek", ikon: "fa-regular fa-calendar" },
        { k: "ajanlatok", ikon: "fa-solid fa-hand-holding-dollar" },
        { k: "uzenetek", ikon: "fa-regular fa-comments" },
        { k: "szerzodes", ikon: "fa-solid fa-file-signature" },
        { k: "naplo", ikon: "fa-solid fa-clock-rotate-left" }
    ];

    static box = null;
    static base = "#admin/megbizasok";
    static akt = null;          // a megnyitott megbízás
    static szal = null;         // az Üzenetek fülön kiválasztott szál ("elado" | erdeklodo id)
    static szuro = { q: "", statusz: "aktiv", varos: "", felelos: "", nezet: "lista" };

    // ===================== KÖZÖS =====================

    static t(k, p) {
        return p ? I18n.f(k, p) : I18n.t(k);
    }

    static api(ut, opts) {
        return Svc.api(MandateDesk.API + ut, opts);
    }

    static jelez(szoveg, tipus = "success") {
        let el = document.getElementById("mdToast");
        if (!el) {
            el = document.createElement("div");
            el.id = "mdToast";
            el.className = "mdToast";
            el.setAttribute("role", "status");
            document.body.appendChild(el);
        }
        el.textContent = szoveg;
        el.dataset.tipus = tipus;
        el.classList.add("show");
        clearTimeout(MandateDesk._toastT);
        MandateDesk._toastT = setTimeout(() => el.classList.remove("show"), 2600);
    }

    static hiba(e) {
        MandateDesk.jelez(Svc.hiba(e), "danger");
    }

    static hely(m) {
        return [m.cim, m.telepules, m.varos ? CityManager.displayName(m.varos) : ""].filter(Boolean).join(", ") || "–";
    }

    static szazalek(osszeg, kert) {
        if (!osszeg || !kert) return "";
        const p = Math.round((osszeg / kert - 1) * 1000) / 10;
        return (p > 0 ? "+" : "") + Utils.num(p, 1) + "%";
    }

    static tel(t) {
        return t ? `<a href="tel:${Utils.escape(String(t).replace(/\s/g, ""))}">${Utils.escape(t)}</a>` : "";
    }

    // A címsorból: <base>/<id>/<fül>
    static hash() {
        const m = location.hash.match(/^#(?:admin|munka)\/megbizasok(?:\/(\d+))?(?:\/([a-z]+))?/);
        return { id: m && m[1] ? Number(m[1]) : null, ful: m && m[2] ? m[2] : null };
    }

    static go(id, ful) {
        const h = MandateDesk.base + (id ? "/" + id : "") + (id && ful ? "/" + ful : "");
        if (location.hash !== h) history.pushState(null, "", h);
        MandateDesk.nyit(MandateDesk.box, { base: MandateDesk.base });
        window.scrollTo({ top: 0 });
    }

    // Belépési pont: box = a tartalom helye; base = #admin/megbizasok vagy #munka/megbizasok
    static nyit(box, { base } = {}) {
        MandateDesk.box = box;
        if (base) MandateDesk.base = base;
        try {
            const s = JSON.parse(localStorage.getItem("mdSzuro") || "null");
            if (s) MandateDesk.szuro = { ...MandateDesk.szuro, ...s };
        } catch (e) { /* nincs tároló */ }
        const { id, ful } = MandateDesk.hash();
        if (id) MandateDesk.reszlet(id, ful || "attekintes");
        else MandateDesk.lista();
    }

    static spinner() {
        MandateDesk.box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;
    }

    static betoltHiba() {
        MandateDesk.box.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
    }

    static tile(icon, color, label, value, sub) {
        return `
            <div class="col-6 col-xl-3">
                <div class="kpiCard w-100 h-100">
                    <span class="kpiIcon ${color}"><i class="${icon}" aria-hidden="true"></i></span>
                    <div class="text-start">
                        <small>${label}</small>
                        <h3>${value}</h3>
                        ${sub ? `<p class="kpiNote">${sub}</p>` : ""}
                    </div>
                </div>
            </div>`;
    }

    static teendoSzoveg(x) {
        return MandateDesk.t("mdTodo_" + x.kod, { n: x.n || 0, ora: x.ora || 0, datum: x.datum ? Svc.nap(x.datum) : "", nap: x.nap ?? "" });
    }

    static teendoSor(x, nevvel) {
        const esc = Utils.escape;
        return `
            <li class="mdTodo ${x.szint}">
                <span class="mdTodoDot" aria-hidden="true"></span>
                <div class="flex-fill min-w-0">
                    <div>${esc(MandateDesk.teendoSzoveg(x))}</div>
                    ${nevvel ? `<div class="small text-body-secondary text-truncate">${esc(x.szam || "")} · ${esc(x.nev || "–")}${x.varos ? " · " + esc(CityManager.displayName(x.varos)) : ""}</div>` : ""}
                </div>
                <button type="button" class="btn btn-sm btn-outline-primary text-nowrap" data-md-go="${x.megbizas_id}" data-md-ful="${x.ful}">${I18n.t("mdOpen")}</button>
            </li>`;
    }

    // ===================== A LISTA =====================

    static lista() {

        MandateDesk.spinner();

        MandateDesk.api("").then(d => {

            const esc = Utils.escape;
            const sz = MandateDesk.szuro;
            const box = MandateDesk.box;
            const admin = d.jog.admin;
            const lista = d.lista;
            const aktiv = lista.filter(m => MandateDesk.OSZLOPOK.includes(m.statusz));
            const ev = String(new Date().getFullYear());
            const eladott = lista.filter(m => m.statusz === "eladva" && String(m.eladva || "").startsWith(ev));
            const surgos = d.teendok.filter(x => x.szint === "magas").length;
            const varosok = [...new Set(lista.map(m => m.varos).filter(Boolean))];
            const felelosok = [...new Map(lista.filter(m => m.felelos_id).map(m => [m.felelos_id, m.felelos_nev])).entries()];

            box.innerHTML = `
                <div class="row g-3 mb-4">
                    ${MandateDesk.tile("fa-solid fa-inbox", "orange", I18n.t("mbStNew"), Utils.num(lista.filter(m => m.statusz === "uj").length), "")}
                    ${MandateDesk.tile("fa-solid fa-key", "green", I18n.t("mbActive"), Utils.num(aktiv.length), "")}
                    ${MandateDesk.tile("fa-solid fa-bell", surgos ? "red" : "blue", I18n.t("mdUrgent"), Utils.num(surgos), I18n.f("mdTodoAll", { n: d.teendok.length }))}
                    ${MandateDesk.tile("fa-solid fa-handshake", "purple", I18n.f("mdSoldYear", { ev }), Utils.num(eladott.length), eladott.length ? Svc.penz(eladott.reduce((s, m) => s + (Number(m.eladasi_ar) || 0), 0), (eladott[0] || {}).penznem || "EUR") : "")}
                </div>

                ${!d.beallitas.aktiv && admin ? `<div class="alert alert-warning small">${I18n.t("mbServiceOff")}</div>` : ""}

                <div class="row g-4 mb-4">
                    <div class="col-lg-7">
                        <div class="card h-100">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <h5 class="mb-0"><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${I18n.t("mdTodos")} <span class="badge text-bg-light">${d.teendok.length}</span></h5>
                            </div>
                            <div class="card-body">
                                ${d.teendok.length ? `
                                    <ul class="mdTodoList">${d.teendok.slice(0, 8).map(x => MandateDesk.teendoSor(x, true)).join("")}</ul>
                                    ${d.teendok.length > 8 ? `
                                        <details class="mt-2"><summary class="small">${I18n.f("mdShowAll", { n: d.teendok.length - 8 })}</summary>
                                        <ul class="mdTodoList mt-2">${d.teendok.slice(8).map(x => MandateDesk.teendoSor(x, true)).join("")}</ul></details>` : ""}` : `
                                    <p class="text-body-secondary mb-0"><i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i> ${I18n.t("mdNoTodos")}</p>`}
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-5">
                        <div class="card h-100">
                            <div class="card-header"><h5 class="mb-0"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${I18n.t("mdUpcoming")}</h5></div>
                            <div class="card-body">
                                ${d.kozelgo.length ? `<ul class="mdUpcoming">${d.kozelgo.map(t => `
                                    <li>
                                        <button type="button" class="mdUpcomingBtn" data-md-go="${t.megbizas_id}" data-md-ful="megtekintesek">
                                            <b>${esc(Svc.ido(t.idopont))}</b>
                                            <span class="d-block small text-truncate">${esc(MandateDesk.hely(t))}</span>
                                            <span class="d-block small text-body-secondary text-truncate">${esc(t.erdeklodo_nev || "–")}${t.bemutato_nev ? ` · <i class="fa-solid fa-door-open" aria-hidden="true"></i> ${esc(t.bemutato_nev)}` : ""}</span>
                                        </button>
                                    </li>`).join("")}</ul>` : `<p class="text-body-secondary small mb-0">${I18n.t("mdNoUpcoming")}</p>`}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mdToolbar">
                    <div class="input-group input-group-sm mdSearch">
                        <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
                        <input class="form-control" id="mdQ" placeholder="${esc(I18n.t("mdSearchPh"))}" value="${esc(sz.q)}" aria-label="${esc(I18n.t("mdSearchPh"))}">
                    </div>
                    <select class="form-select form-select-sm w-auto" id="mdSt" aria-label="${esc(I18n.t("ordStatus"))}">
                        <option value="aktiv" ${sz.statusz === "aktiv" ? "selected" : ""}>${I18n.t("mdFilterActive")}</option>
                        <option value="" ${!sz.statusz ? "selected" : ""}>${I18n.t("mdFilterAll")}</option>
                        ${d.statuszok.map(s => `<option value="${s}" ${sz.statusz === s ? "selected" : ""}>${esc(I18n.t("mbSt_" + s))}</option>`).join("")}
                    </select>
                    ${varosok.length > 1 ? `
                    <select class="form-select form-select-sm w-auto" id="mdVaros" aria-label="${esc(I18n.t("detailVaros"))}">
                        <option value="">${I18n.t("allCities")}</option>
                        ${varosok.map(v => `<option value="${esc(v)}" ${sz.varos === v ? "selected" : ""}>${esc(CityManager.displayName(v))}</option>`).join("")}
                    </select>` : ""}
                    ${admin && felelosok.length ? `
                    <select class="form-select form-select-sm w-auto" id="mdFelelos" aria-label="${esc(I18n.t("mdResponsible"))}">
                        <option value="">${I18n.t("mdAllResponsible")}</option>
                        <option value="-" ${sz.felelos === "-" ? "selected" : ""}>${I18n.t("mdNoResponsible")}</option>
                        ${felelosok.map(([id, n]) => `<option value="${id}" ${String(sz.felelos) === String(id) ? "selected" : ""}>${esc(n || "#" + id)}</option>`).join("")}
                    </select>` : ""}
                    <div class="btn-group btn-group-sm ms-auto" role="group" aria-label="${esc(I18n.t("mdView"))}">
                        <button type="button" class="btn btn-outline-secondary ${sz.nezet === "lista" ? "active" : ""}" data-md-nezet="lista"><i class="fa-solid fa-list" aria-hidden="true"></i> ${I18n.t("mdViewList")}</button>
                        <button type="button" class="btn btn-outline-secondary ${sz.nezet === "tabla" ? "active" : ""}" data-md-nezet="tabla"><i class="fa-solid fa-table-columns" aria-hidden="true"></i> ${I18n.t("mdViewBoard")}</button>
                    </div>
                </div>

                <div id="mdLista"></div>`;

            const rajzol = () => {

                const q = Utils.ekezetNelkul(sz.q || "").toLowerCase();
                let t = lista.filter(m =>
                    (sz.statusz === "aktiv" ? MandateDesk.OSZLOPOK.includes(m.statusz) : !sz.statusz || m.statusz === sz.statusz) &&
                    (!sz.varos || m.varos === sz.varos) &&
                    (!sz.felelos || (sz.felelos === "-" ? !m.felelos_id : String(m.felelos_id) === String(sz.felelos))) &&
                    (!q || Utils.ekezetNelkul([m.szerzodes_szam, m.nev, m.fiok_nev, m.cim, m.telepules, m.varos, m.telefon, m.email].join(" ")).toLowerCase().includes(q)));

                const hova = box.querySelector("#mdLista");

                if (!lista.length) {
                    hova.innerHTML = `
                        <div class="emptyState">
                            <i class="fa-solid fa-key"></i>
                            <h5>${I18n.t("mbNone")}</h5>
                            <p>${I18n.t("mbNoneText")}</p>
                            <a class="btn btn-outline-primary" href="#eladjuk" target="_blank">${I18n.t("menuEladjuk")}</a>
                        </div>`;
                    return;
                }

                if (!t.length) {
                    hova.innerHTML = `<p class="text-body-secondary py-4 text-center">${I18n.t("mdNoMatch")}</p>`;
                    return;
                }

                if (sz.nezet === "tabla") {
                    const oszlopok = sz.statusz === "aktiv" || !sz.statusz ? MandateDesk.OSZLOPOK : [sz.statusz];
                    hova.innerHTML = `
                        <div class="mbBoard">
                            ${oszlopok.map(s => {
                                const x = t.filter(m => m.statusz === s);
                                return `
                                    <section class="mbCol">
                                        <header><span class="mbDot mb-${s}"></span> ${esc(I18n.t("mbSt_" + s))} <span class="badge text-bg-light">${x.length}</span></header>
                                        ${x.map(MandateDesk.kartya).join("") || `<p class="small text-body-secondary px-1">–</p>`}
                                    </section>`;
                            }).join("")}
                        </div>`;
                } else {
                    hova.innerHTML = `
                        <div class="table-responsive mdTableWrap">
                            <table class="table table-hover align-middle mdTable mb-0">
                                <thead><tr>
                                    <th>${I18n.t("mdColMandate")}</th>
                                    <th>${I18n.t("ordStatus")}</th>
                                    <th class="d-none d-md-table-cell">${I18n.t("mdResponsible")}</th>
                                    <th class="text-center">${I18n.t("mdColActivity")}</th>
                                    <th class="text-end">${I18n.t("mdColPrice")}</th>
                                    <th class="text-center">${I18n.t("mdTodos")}</th>
                                    <th class="d-none d-lg-table-cell">${I18n.t("mdColUpdated")}</th>
                                </tr></thead>
                                <tbody>${t.map(m => `
                                    <tr data-md-go="${m.id}" tabindex="0" role="link">
                                        <td class="mdCellMain">
                                            <b>${esc(m.nev || m.fiok_nev || "–")}</b>
                                            <div class="small text-body-secondary">${esc(m.szerzodes_szam || "")} · ${esc(Types.label(m.tipus))} · ${esc(MandateDesk.hely(m))}</div>
                                        </td>
                                        <td>
                                            <span class="badge mbBadge mb-${esc(m.statusz)}">${esc(I18n.t("mbSt_" + m.statusz))}</span>
                                            ${m.szerzodes_allapot && m.szerzodes_allapot !== "tervezet" && MandateDesk.OSZLOPOK.includes(m.statusz) ? `<div class="small text-body-secondary mt-1"><i class="fa-solid fa-file-signature" aria-hidden="true"></i> ${esc(I18n.t("mdCst_" + m.szerzodes_allapot))}</div>` : ""}
                                        </td>
                                        <td class="d-none d-md-table-cell small">${esc(m.felelos_nev || "–")}</td>
                                        <td class="text-center text-nowrap small mdActivity">
                                            <span title="${esc(I18n.t("mmInterested"))}"><i class="fa-solid fa-users" aria-hidden="true"></i> ${m.erdeklodok}</span>
                                            <span class="${m.megtekintes_kert ? "warn" : ""}" title="${esc(I18n.t("mmViewings"))}"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${m.megtekintes_kert || (m.kovetkezo_megtekintes ? "✓" : 0)}</span>
                                            <span class="${m.ajanlat_uj ? "warn" : ""}" title="${esc(I18n.t("mmOffers"))}"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${m.ajanlat_nyitott}</span>
                                            ${m.olvasatlan ? `<span class="warn" title="${esc(I18n.t("mdUnread"))}"><i class="fa-solid fa-envelope" aria-hidden="true"></i> ${m.olvasatlan}</span>` : ""}
                                        </td>
                                        <td class="text-end text-nowrap small">
                                            ${m.kert_ar ? esc(Svc.penz(m.kert_ar, m.penznem)) : "–"}
                                            ${m.legjobb_ajanlat ? `<div class="text-body-secondary" title="${esc(I18n.t("mbBestOffer"))}"><i class="fa-solid fa-trophy" aria-hidden="true"></i> ${esc(Svc.penz(m.legjobb_ajanlat, m.penznem))}</div>` : ""}
                                        </td>
                                        <td class="text-center">${m.teendo_db ? `<span class="badge text-bg-danger">${m.teendo_db}</span>` : `<i class="fa-solid fa-check text-success" aria-hidden="true"></i>`}</td>
                                        <td class="d-none d-lg-table-cell small text-body-secondary text-nowrap">${esc(Utils.ago(m.updated_at))}</td>
                                    </tr>`).join("")}</tbody>
                            </table>
                        </div>`;
                }

                hova.querySelectorAll("[data-md-go]").forEach(el => {
                    el.onclick = () => MandateDesk.go(Number(el.dataset.mdGo));
                    el.onkeydown = e => { if (e.key === "Enter") MandateDesk.go(Number(el.dataset.mdGo)); };
                });

            };

            const ment = () => {
                try { localStorage.setItem("mdSzuro", JSON.stringify(sz)); } catch (e) { /* nincs tároló */ }
                rajzol();
            };

            box.querySelector("#mdQ").oninput = e => { sz.q = e.target.value; rajzol(); };
            box.querySelector("#mdSt").onchange = e => { sz.statusz = e.target.value; ment(); };
            const v = box.querySelector("#mdVaros");
            if (v) v.onchange = e => { sz.varos = e.target.value; ment(); };
            const f = box.querySelector("#mdFelelos");
            if (f) f.onchange = e => { sz.felelos = e.target.value; ment(); };
            box.querySelectorAll("[data-md-nezet]").forEach(b => {
                b.onclick = () => {
                    sz.nezet = b.dataset.mdNezet;
                    box.querySelectorAll("[data-md-nezet]").forEach(x => x.classList.toggle("active", x === b));
                    ment();
                };
            });
            box.querySelectorAll(".mdTodoList [data-md-go], .mdUpcoming [data-md-go]").forEach(b => {
                b.onclick = () => MandateDesk.go(Number(b.dataset.mdGo), b.dataset.mdFul);
            });

            rajzol();

        }).catch(() => MandateDesk.betoltHiba());

    }

    static kartya(m) {
        const esc = Utils.escape;
        return `
            <button type="button" class="mbCard" data-md-go="${m.id}">
                <span class="d-flex justify-content-between gap-2">
                    <b class="text-truncate">${esc(m.nev || m.fiok_nev || "–")}</b>
                    ${m.teendo_db ? `<span class="badge text-bg-danger">${m.teendo_db}</span>` : ""}
                </span>
                <span class="small text-body-secondary text-truncate d-block">${esc(m.szerzodes_szam || "")} · ${esc(Types.label(m.tipus))} · ${esc(MandateDesk.hely(m))}</span>
                <span class="mbCardMeta">
                    ${m.kert_ar ? `<span><i class="fa-solid fa-tag" aria-hidden="true"></i> ${esc(Svc.penz(m.kert_ar, m.penznem))}</span>` : ""}
                    ${m.erdeklodok ? `<span><i class="fa-solid fa-users" aria-hidden="true"></i> ${m.erdeklodok}</span>` : ""}
                    ${m.megtekintes_kert ? `<span class="warn"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${m.megtekintes_kert}</span>` : ""}
                    ${m.ajanlat_uj ? `<span class="warn"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${m.ajanlat_uj}</span>` : ""}
                    ${m.legjobb_ajanlat ? `<span><i class="fa-solid fa-trophy" aria-hidden="true"></i> ${esc(Svc.penz(m.legjobb_ajanlat, m.penznem))}</span>` : ""}
                </span>
                ${m.kovetkezo_megtekintes ? `<span class="mbNext"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${esc(Svc.ido(m.kovetkezo_megtekintes))}</span>` : ""}
                <span class="small text-body-secondary">${m.felelos_nev ? `<i class="fa-solid fa-user-tie" aria-hidden="true"></i> ${esc(m.felelos_nev)} · ` : ""}${esc(Utils.ago(m.updated_at))}</span>
            </button>`;
    }

    // ===================== EGY MEGBÍZÁS =====================

    static reszlet(id, ful) {

        if (!MandateDesk.akt || MandateDesk.akt.id !== id) MandateDesk.spinner();

        MandateDesk.api("/" + id).then(m => {
            MandateDesk.akt = m;
            MandateDesk.rajzolReszlet(ful);
        }).catch(e => {
            if (e && e.status === 404) MandateDesk.box.innerHTML = `<div class="alert alert-warning">${I18n.t("mdNotFound")}</div>`;
            else if (e && e.status === 403) MandateDesk.box.innerHTML = `<div class="alert alert-warning">${I18n.t("mdForbidden")}</div>`;
            else MandateDesk.betoltHiba();
        });

    }

    // Újratöltés ugyanazon a fülön
    static frissit() {
        const { ful } = MandateDesk.hash();
        MandateDesk.reszlet(MandateDesk.akt.id, ful || "attekintes");
        if (typeof AdminManager !== "undefined" && AuthManager.isAdmin()) AdminManager.refreshPendingCount();
    }

    static ment(adat, uzenet) {
        return MandateDesk.api("/" + MandateDesk.akt.id, { method: "PUT", body: adat })
            .then(() => { MandateDesk.jelez(uzenet || I18n.t("adsSaved")); MandateDesk.frissit(); })
            .catch(e => MandateDesk.hiba(e));
    }

    static rajzolReszlet(ful) {

        const m = MandateDesk.akt;
        const esc = Utils.escape;
        const box = MandateDesk.box;
        const kezel = m.jog.kezel;
        const admin = m.jog.admin;
        if (!MandateDesk.FULEK.some(f => f.k === ful)) ful = "attekintes";

        const szamlalo = {
            attekintes: m.teendok.filter(x => x.szint !== "info").length,
            vevok: m.erdeklodok.length,
            megtekintesek: m.megtekintes_kert,
            ajanlatok: m.ajanlat_uj + m.ellen_tovabbitando,
            uzenetek: m.olvasatlan
        };
        const surgosFul = { attekintes: true, megtekintesek: true, ajanlatok: true, uzenetek: true };

        const legjobb = m.legjobb_ajanlat;
        const kov = m.megtekintesek.filter(t => t.statusz === "egyeztetve" && t.idopont && new Date(t.idopont) > Date.now() - 2 * 3600 * 1000)
            .sort((a, b) => new Date(a.idopont) - new Date(b.idopont))[0];

        box.innerHTML = `
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <button type="button" class="btn btn-link px-0" id="mdBack"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${I18n.t("adminTabMandates")}</button>
                <span class="ms-auto small text-body-secondary">${esc(m.szerzodes_szam || "")} · ${esc(Svc.nap(m.created_at))}</span>
            </div>

            <div class="mdHead">
                <div class="min-w-0">
                    <h4 class="mb-1">${esc(m.nev || m.fiok_nev || "–")} <span class="badge mbBadge mb-${esc(m.statusz)}">${esc(I18n.t("mbSt_" + m.statusz))}</span></h4>
                    <div class="text-body-secondary mb-2"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(Types.label(m.tipus))} · ${esc(Types.ugyletLabel(m.ugylet))}${m.nm ? ` · ${esc(Utils.nm(m.nm))}` : ""} · ${esc(MandateDesk.hely(m))}</div>
                    <div class="d-flex flex-wrap gap-2">
                        ${m.telefon ? `<a class="btn btn-sm btn-outline-primary" href="tel:${esc(String(m.telefon).replace(/\s/g, ""))}"><i class="fa-solid fa-phone" aria-hidden="true"></i> ${esc(m.telefon)}</a>` : ""}
                        ${m.email ? `<a class="btn btn-sm btn-outline-secondary" href="mailto:${esc(m.email)}"><i class="fa-regular fa-envelope" aria-hidden="true"></i> ${esc(m.email)}</a>` : ""}
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-md-ful-go="uzenetek"><i class="fa-regular fa-comments" aria-hidden="true"></i> ${I18n.t("mdMessageSeller")}</button>
                        ${m.elerhetoseg ? `<span class="small text-body-secondary align-self-center"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${esc(m.elerhetoseg)}</span>` : ""}
                    </div>
                </div>
                <div class="mdChips">
                    <div class="mdChip"><span>${I18n.t("sfPrice")}</span><b>${m.kert_ar ? esc(Svc.penz(m.kert_ar, m.penznem)) : "–"}</b></div>
                    <div class="mdChip"><span>${I18n.t("mbBestOffer")}</span><b>${legjobb ? esc(Svc.penz(legjobb, m.penznem)) : "–"}</b>${legjobb && m.kert_ar ? `<small>${esc(MandateDesk.szazalek(legjobb, m.kert_ar))}</small>` : ""}</div>
                    <div class="mdChip"><span>${I18n.t("mdNextViewing")}</span><b>${kov ? esc(Svc.ido(kov.idopont)) : "–"}</b></div>
                    <div class="mdChip"><span>${I18n.t("mdExpires")}</span><b>${m.lejar ? esc(Svc.nap(m.lejar)) : "–"}</b></div>
                </div>
            </div>

            ${kezel ? `
            <div class="mbStepper mb-3" role="group" aria-label="${esc(I18n.t("ordStatus"))}">
                ${[...MandateDesk.OSZLOPOK, ...(admin ? ["eladva"] : [])].map(s => `<button type="button" class="${s === m.statusz ? "active" : ""}" data-md-st="${s}">${esc(I18n.t("mbSt_" + s))}</button>`).join("")}
                ${admin ? `
                <select class="form-select form-select-sm" id="mdStMas" aria-label="${esc(I18n.t("ordStatus"))}">
                    <option value="">${I18n.t("mbOtherStatus")}</option>
                    ${["lezarva", "elutasitva"].map(s => `<option value="${s}" ${s === m.statusz ? "selected" : ""}>${esc(I18n.t("mbSt_" + s))}</option>`).join("")}
                </select>` : ""}
            </div>` : `<div class="alert alert-light small py-2"><i class="fa-regular fa-eye" aria-hidden="true"></i> ${I18n.t("mdReadOnly")}</div>`}

            <nav class="mdTabs" role="tablist" aria-label="${esc(I18n.t("adminTabMandates"))}">
                ${MandateDesk.FULEK.map(f => `
                    <button type="button" role="tab" class="mdTab ${f.k === ful ? "active" : ""}" data-md-tab="${f.k}" aria-selected="${f.k === ful}">
                        <i class="${f.ikon}" aria-hidden="true"></i><span>${I18n.t("mdTab_" + f.k)}</span>
                        ${szamlalo[f.k] ? `<span class="mdTabCount ${surgosFul[f.k] ? "warn" : ""}">${szamlalo[f.k]}</span>` : ""}
                    </button>`).join("")}
            </nav>

            <div id="mdFul" class="mdFul"></div>`;

        // Keskeny képernyőn a kiválasztott fül legyen látható
        const tabs = box.querySelector(".mdTabs");
        const aktTab = tabs.querySelector(".mdTab.active");
        if (aktTab) tabs.scrollLeft = Math.max(0, aktTab.offsetLeft - tabs.offsetLeft - 24);

        box.querySelector("#mdBack").onclick = () => MandateDesk.go(null);
        box.querySelectorAll("[data-md-tab]").forEach(b => {
            b.onclick = () => {
                history.replaceState(null, "", `${MandateDesk.base}/${m.id}/${b.dataset.mdTab}`);
                MandateDesk.rajzolReszlet(b.dataset.mdTab);
            };
        });
        box.querySelectorAll("[data-md-ful-go]").forEach(b => {
            b.onclick = () => {
                history.replaceState(null, "", `${MandateDesk.base}/${m.id}/${b.dataset.mdFulGo}`);
                MandateDesk.rajzolReszlet(b.dataset.mdFulGo);
            };
        });
        box.querySelectorAll("[data-md-st]").forEach(b => {
            b.onclick = () => {
                const s = b.dataset.mdSt;
                if (s === m.statusz) return;
                if (s === "eladva" && !confirm(I18n.t("mdSoldConfirm"))) return;
                MandateDesk.ment({ statusz: s });
            };
        });
        const mas = box.querySelector("#mdStMas");
        if (mas) mas.onchange = e => { if (e.target.value && confirm(I18n.t("mdCloseConfirm"))) MandateDesk.ment({ statusz: e.target.value }); };

        const hova = box.querySelector("#mdFul");
        ({
            attekintes: MandateDesk.fulAttekintes, ingatlan: MandateDesk.fulIngatlan, vevok: MandateDesk.fulVevok,
            megtekintesek: MandateDesk.fulMegtekintesek, ajanlatok: MandateDesk.fulAjanlatok, uzenetek: MandateDesk.fulUzenetek,
            szerzodes: MandateDesk.fulSzerzodes, naplo: MandateDesk.fulNaplo
        })[ful](hova, m);

        // A teendők gombjai (bármelyik fülön)
        hova.querySelectorAll("[data-md-go]").forEach(b => {
            b.onclick = () => {
                history.replaceState(null, "", `${MandateDesk.base}/${m.id}/${b.dataset.mdFul}`);
                MandateDesk.rajzolReszlet(b.dataset.mdFul);
                window.scrollTo({ top: box.querySelector(".mdTabs").offsetTop - 80, behavior: "smooth" });
            };
        });

    }

    // ---------- Áttekintés ----------

    static fulAttekintes(hova, m) {

        const esc = Utils.escape;
        const admin = m.jog.admin;
        const nev = id => (m.munkatarsak.find(x => x.id === id) || {}).nev;
        const valaszto = (mezo, cimke, ikon) => `
            <div class="col-12 col-sm-4 col-xl-12">
                <label class="form-label small mb-1" for="md_${mezo}"><i class="${ikon}" aria-hidden="true"></i> ${cimke}</label>
                ${admin ? `
                <select class="form-select form-select-sm" id="md_${mezo}" data-md-hozzarendel="${mezo}">
                    <option value="">–</option>
                    ${m.munkatarsak.map(u => `<option value="${u.id}" ${m[mezo] === u.id ? "selected" : ""}>${esc(u.nev)} (${esc(I18n.t("tmRole_" + u.szerep))})</option>`).join("")}
                    ${m[mezo] && !m.munkatarsak.some(u => u.id === m[mezo]) ? `<option value="${m[mezo]}" selected>${esc(nev(m[mezo]) || "#" + m[mezo])}</option>` : ""}
                </select>` : `<div class="fw-semibold">${esc(m[mezo.replace("_id", "_nev")] || "–")}</div>`}
            </div>`;

        hova.innerHTML = `
            <div class="row g-4">
                <div class="col-xl-7">
                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${I18n.t("mdTodosHere")}</h5></div>
                        <div class="card-body">
                            ${m.teendok.length ? `<ul class="mdTodoList">${m.teendok.map(x => MandateDesk.teendoSor(x, false)).join("")}</ul>`
                                : `<p class="text-body-secondary mb-0"><i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i> ${I18n.t("mdNoTodosHere")}</p>`}
                        </div>
                    </div>

                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-chart-simple" aria-hidden="true"></i> ${I18n.t("mdSummary")}</h5></div>
                        <div class="card-body">
                            <div class="row g-2 mb-3">
                                <div class="col-6 col-md-3"><div class="mmStat"><i class="fa-solid fa-users" aria-hidden="true"></i><b>${m.erdeklodok.length}</b><span>${I18n.t("mmInterested")}</span></div></div>
                                <div class="col-6 col-md-3"><div class="mmStat"><i class="fa-regular fa-calendar" aria-hidden="true"></i><b>${m.megtekintesek.filter(t => ["egyeztetve", "megtortent"].includes(t.statusz)).length}</b><span>${I18n.t("mmViewings")}</span></div></div>
                                <div class="col-6 col-md-3"><div class="mmStat"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i><b>${m.ajanlatok.filter(a => a.statusz !== "visszavonva").length}</b><span>${I18n.t("mmOffers")}</span></div></div>
                                <div class="col-6 col-md-3"><div class="mmStat"><i class="fa-solid fa-image" aria-hidden="true"></i><b>${m.hirdetes ? m.hirdetes.kep_db : "–"}</b><span>${I18n.t("mdPhotos")}</span></div></div>
                            </div>
                            <div class="mbKv"><span>${I18n.t("mbListing")}</span><b>${m.hirdetes ? `<a href="#listing/${m.hirdetes.id}">#${m.hirdetes.id}</a> · ${esc(Utils.price(m.hirdetes))}` : `<span class="text-warning">${I18n.t("mdNoListingShort")}</span>`}</b></div>
                            <div class="mbKv"><span>${I18n.t("mdContract")}</span><b>${esc(I18n.t("mdCst_" + (m.szerzodes_allapot || "tervezet")))}${m.kizarolagos ? ` · ${I18n.t("mbExclusive")}` : ""}</b></div>
                            <div class="mbKv"><span>${I18n.t("mdOfferMode")}</span><b>${esc(I18n.t("mdMode_" + m.mod))}</b></div>
                            <div class="mt-2 d-flex flex-wrap gap-1">${(m.opciok || []).map(k => `<span class="badge text-bg-light">${esc(k)}</span>`).join("")}</div>
                        </div>
                    </div>

                    <div class="card mb-4">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> ${I18n.t("mdLatest")}</h5>
                            <button type="button" class="btn btn-sm btn-link" data-md-go="${m.id}" data-md-ful="naplo">${I18n.t("mdAllLog")}</button>
                        </div>
                        <div class="card-body">
                            <ul class="mbLog">${MandateDesk.naploSorok(m.naplo.slice(0, 6))}</ul>
                        </div>
                    </div>
                </div>

                <div class="col-xl-5">
                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-people-group" aria-hidden="true"></i> ${I18n.t("mdTeam")}</h5></div>
                        <div class="card-body">
                            <div class="row g-2">
                                ${valaszto("felelos_id", I18n.t("mdResponsible"), "fa-solid fa-user-tie")}
                                ${valaszto("fotos_id", I18n.t("mdPhotographer"), "fa-solid fa-camera")}
                                ${valaszto("bemutato_id", I18n.t("mdPresenter"), "fa-solid fa-door-open")}
                            </div>
                            ${admin ? `<p class="small text-body-secondary mt-2 mb-0">${I18n.t(m.munkatarsak.length ? "mdTeamNote" : "mdTeamEmpty")} <a href="#admin/csapat">${I18n.t("tmTeamTitle")}</a></p>` : ""}
                        </div>
                    </div>

                    ${admin ? `
                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("mdOfferMode")}</h5></div>
                        <div class="card-body">
                            ${["", "jovahagyas", "azonnal"].map(v => `
                                <div class="form-check">
                                    <input class="form-check-input" type="radio" name="mdMod" id="mdMod_${v || "alap"}" value="${v}" ${(m.ajanlat_mod || "") === v ? "checked" : ""}>
                                    <label class="form-check-label" for="mdMod_${v || "alap"}">${I18n.t(v ? "mdMode_" + v : "mdModeDefault")}<div class="small text-body-secondary">${I18n.t(v ? "mdModeHelp_" + v : "mdModeHelpDefault")}</div></label>
                                </div>`).join("")}
                        </div>
                    </div>` : ""}

                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-user" aria-hidden="true"></i> ${I18n.t("mdSeller")}</h5></div>
                        <div class="card-body small">
                            <div class="mbKv"><span>${I18n.t("authName")}</span><b>${esc(m.nev || "–")}</b></div>
                            <div class="mbKv"><span>${I18n.t("accPhone")}</span><b>${MandateDesk.tel(m.telefon) || "–"}</b></div>
                            <div class="mbKv"><span>${I18n.t("authEmail")}</span><b>${m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : "–"}</b></div>
                            <div class="mbKv"><span>${I18n.t("mdAccount")}</span><b>${esc(m.fiok_nev || "–")}${m.fiok_email && m.fiok_email !== m.email ? ` · ${esc(m.fiok_email)}` : ""}</b></div>
                            ${m.leiras ? `<p class="mt-2 mb-0 text-body-secondary mbClamp">${esc(m.leiras)}</p>` : ""}
                        </div>
                    </div>

                    ${admin ? `
                    <div class="card">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-regular fa-note-sticky" aria-hidden="true"></i> ${I18n.t("mbAdminNote")}</h5></div>
                        <div class="card-body">
                            <textarea class="form-control form-control-sm" id="mdAdminJ" rows="4">${esc(m.admin_jegyzet || "")}</textarea>
                            <div class="text-end mt-2"><button type="button" class="btn btn-sm btn-outline-primary" id="mdMentJ">${I18n.t("finSave")}</button></div>
                        </div>
                    </div>` : ""}
                </div>
            </div>`;

        hova.querySelectorAll("[data-md-hozzarendel]").forEach(s => {
            s.onchange = () => MandateDesk.ment({ [s.dataset.mdHozzarendel]: s.value || null }, I18n.t("mdAssigned"));
        });
        hova.querySelectorAll("input[name=mdMod]").forEach(r => {
            r.onchange = () => MandateDesk.ment({ ajanlat_mod: r.value || null });
        });
        const j = hova.querySelector("#mdMentJ");
        if (j) j.onclick = () => MandateDesk.ment({ admin_jegyzet: hova.querySelector("#mdAdminJ").value });

    }

    static naploSorok(lista) {
        const esc = Utils.escape;
        if (!lista.length) return `<li class="text-body-secondary small">–</li>`;
        return lista.map(n => `
            <li class="${n.lathato_eladonak ? "visible" : ""}">
                <span class="small text-body-secondary">${esc(Svc.ido(n.created_at))}${n.szerzo ? " · " + esc(n.szerzo) : ""}${n.lathato_eladonak ? ` · <i class="fa-regular fa-eye" title="${esc(I18n.t("mbVisibleToSeller"))}" aria-label="${esc(I18n.t("mbVisibleToSeller"))}"></i>` : ""}</span>
                <div>${n.tipus === "statusz" ? `<b>${esc(I18n.t("mbSt_" + n.szoveg))}</b>` : esc(n.szoveg)}</div>
            </li>`).join("");
    }

    // ---------- Ingatlan és hirdetés ----------

    static fulIngatlan(hova, m) {

        const esc = Utils.escape;
        const kezel = m.jog.kezel;
        const dis = kezel ? "" : "disabled";
        const opciok = new Set(m.opciok || []);

        hova.innerHTML = `
            <div class="row g-4">
                <div class="col-xl-7">
                    <div class="card">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-house" aria-hidden="true"></i> ${I18n.t("mbProperty")}</h5></div>
                        <div class="card-body">
                            <fieldset ${dis}>
                            <div class="row g-2">
                                <div class="col-sm-4"><label class="form-label small mb-1" for="mbUgylet">${I18n.t("searchUgylet")}</label>
                                    <select class="form-select form-select-sm" id="mbUgylet"><option value="elado" ${m.ugylet !== "kiado" ? "selected" : ""}>${I18n.t("ugyletElado")}</option><option value="kiado" ${m.ugylet === "kiado" ? "selected" : ""}>${I18n.t("ugyletKiado")}</option></select></div>
                                <div class="col-sm-4"><label class="form-label small mb-1" for="mbTipus">${I18n.t("newTipus")}</label>
                                    <select class="form-select form-select-sm" id="mbTipus">${Types.LIST.map(t => `<option value="${t.key}" ${t.key === m.tipus ? "selected" : ""}>${esc(I18n.t(t.label))}</option>`).join("")}</select></div>
                                <div class="col-sm-4"><label class="form-label small mb-1" for="mbVaros">${I18n.t("detailVaros")}</label>
                                    <select class="form-select form-select-sm" id="mbVaros"></select></div>
                                <div class="col-sm-8"><label class="form-label small mb-1" for="mbCim">${I18n.t("sfAddress")}</label>
                                    <input class="form-control form-control-sm" id="mbCim" value="${esc(m.cim || "")}"></div>
                                <div class="col-sm-4"><label class="form-label small mb-1" for="mbTelepules">${I18n.t("newTelepules")}</label>
                                    <input class="form-control form-control-sm" id="mbTelepules" value="${esc(m.telepules || "")}"></div>
                                <div class="col-4"><label class="form-label small mb-1" for="mbNm">${I18n.t("detailNm")}</label>
                                    <input class="form-control form-control-sm" id="mbNm" type="number" step="0.1" value="${m.nm ?? ""}"></div>
                                <div class="col-3"><label class="form-label small mb-1" for="mbSzobak">${I18n.t("detailSzoba")}</label>
                                    <input class="form-control form-control-sm" id="mbSzobak" type="number" value="${m.szobak ?? ""}"></div>
                                <div class="col-5"><label class="form-label small mb-1" for="mbKertAr">${I18n.t("sfPrice")}</label>
                                    <input class="form-control form-control-sm" id="mbKertAr" type="number" step="500" value="${m.kert_ar ?? ""}"></div>
                                <div class="col-12"><label class="form-label small mb-1" for="mbLeiras">${I18n.t("sfDesc")}</label>
                                    <textarea class="form-control form-control-sm" id="mbLeiras" rows="3">${esc(m.leiras || "")}</textarea></div>
                                <div class="col-sm-6"><label class="form-label small mb-1" for="mbTel">${I18n.t("accPhone")}</label>
                                    <input class="form-control form-control-sm" id="mbTel" value="${esc(m.telefon || "")}"></div>
                                <div class="col-sm-6"><label class="form-label small mb-1" for="mbEmail">${I18n.t("authEmail")}</label>
                                    <input class="form-control form-control-sm" id="mbEmail" value="${esc(m.email || "")}"></div>
                            </div>
                            <h6 class="mt-3 mb-2">${I18n.t("mbServices")}</h6>
                            <div class="mbOptList" id="mdOpciok"></div>
                            ${kezel ? `<div class="text-end mt-2"><button type="button" class="btn btn-sm btn-primary" id="mbMentAdat"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button></div>` : ""}
                            </fieldset>
                        </div>
                    </div>
                </div>
                <div class="col-xl-5">
                    <div class="card">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-rectangle-list" aria-hidden="true"></i> ${I18n.t("mbListing")}</h5></div>
                        <div class="card-body">
                            ${m.hirdetes ? `
                                <a href="#listing/${m.hirdetes.id}" class="fw-semibold d-block">#${m.hirdetes.id} · ${esc(m.hirdetes.cim || Types.label(m.hirdetes.tipus))}</a>
                                <div class="text-body-secondary small mb-3">${esc(Utils.price(m.hirdetes))} · ${esc(m.hirdetes.statusz || "")} · <i class="fa-solid fa-image" aria-hidden="true"></i> ${m.hirdetes.kep_db}</div>
                                <div class="d-flex flex-wrap gap-2">
                                    ${kezel ? `<button type="button" class="btn btn-sm btn-outline-primary" id="mbHirdSzerk"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("detailEdit")}</button>` : ""}
                                    <button type="button" class="btn btn-sm btn-outline-primary" id="mbHirdFoto"><i class="fa-solid fa-images" aria-hidden="true"></i> ${I18n.t("pmTitle")}</button>
                                    ${m.jog.admin ? `<button type="button" class="btn btn-sm btn-link text-danger ms-auto" id="mbHirdLe">${I18n.t("mbUnlink")}</button>` : ""}
                                </div>` : `
                                <p class="small text-body-secondary">${I18n.t("mbNoListing")}</p>
                                ${kezel ? `
                                <div class="d-flex flex-wrap gap-2">
                                    <button type="button" class="btn btn-sm btn-primary" id="mbHirdUj"><i class="fa-solid fa-circle-plus" aria-hidden="true"></i> ${I18n.t("mbCreateListing")}</button>
                                    <div class="input-group input-group-sm" style="max-width:240px">
                                        <span class="input-group-text">#</span>
                                        <input class="form-control" id="mbHirdId" type="number" placeholder="${esc(I18n.t("mbListingId"))}" aria-label="${esc(I18n.t("mbListingId"))}">
                                        <button class="btn btn-outline-secondary" type="button" id="mbHirdKapcsol">${I18n.t("mbLink")}</button>
                                    </div>
                                </div>` : ""}`}
                        </div>
                    </div>
                </div>
            </div>`;

        const $ = q => hova.querySelector(q);

        // A szolgáltatások listája a beállításokból
        const opcHova = $("#mdOpciok");
        const rajzOpc = lista => {
            opcHova.innerHTML = lista.map(o => `
                <label class="form-check">
                    <input class="form-check-input" type="checkbox" value="${esc(o.kod)}" ${opciok.has(o.kod) ? "checked" : ""} data-mb-opc>
                    <span class="form-check-label small"><i class="${esc(o.ikon)}" aria-hidden="true"></i> ${esc(Svc.t(o.nev))}${o.ar > 0 ? ` <span class="text-body-secondary">(${esc(Svc.penz(o.ar, o.penznem))})</span>` : ""}</span>
                </label>`).join("") || (m.opciok || []).map(k => `<span class="badge text-bg-light me-1">${esc(k)}</span>`).join("");
        };
        Svc.api("/api/megbizas/ajanlat").then(a => rajzOpc(a.opciok || [])).catch(() => rajzOpc([]));

        const vs = $("#mbVaros");
        if (CityManager.varosok && CityManager.varosok.length) CityManager.fillCitySelect(vs, m.varos || DataManager.currentCity);
        if (m.varos && ![...vs.options].some(o => o.value === m.varos)) vs.insertAdjacentHTML("afterbegin", `<option value="${esc(m.varos)}" selected>${esc(m.varos)}</option>`);

        const mentB = $("#mbMentAdat");
        if (mentB) mentB.onclick = () => MandateDesk.ment({
            ugylet: $("#mbUgylet").value, tipus: $("#mbTipus").value, varos: $("#mbVaros").value, cim: $("#mbCim").value,
            telepules: $("#mbTelepules").value, nm: $("#mbNm").value, szobak: $("#mbSzobak").value, kert_ar: $("#mbKertAr").value,
            leiras: $("#mbLeiras").value, telefon: $("#mbTel").value, email: $("#mbEmail").value,
            opciok: [...hova.querySelectorAll("[data-mb-opc]:checked")].map(c => c.value)
        });

        const uj = $("#mbHirdUj");
        if (uj) uj.onclick = () => MandateDesk.hirdetesFelad(m);
        const kapcs = $("#mbHirdKapcsol");
        if (kapcs) kapcs.onclick = () => { const v = Number($("#mbHirdId").value); if (v) MandateDesk.ment({ ingatlan_id: v }); };
        const le = $("#mbHirdLe");
        if (le) le.onclick = () => { if (confirm(I18n.t("mbUnlinkConfirm"))) MandateDesk.ment({ ingatlan_id: null }); };
        const szerk = $("#mbHirdSzerk");
        if (szerk) szerk.onclick = () => NewPropertyManager.startEdit({ id: m.hirdetes.id });
        const foto = $("#mbHirdFoto");
        if (foto) foto.onclick = () => PhotoManager.nyit(m.hirdetes.id, () => MandateDesk.frissit());

    }

    // Hirdetés feladása a megbízás adataiból: az Új ingatlan űrlap kitöltve,
    // a mentéskor a hirdetés a megbízáshoz kapcsolódik
    static hirdetesFelad(m) {
        NewPropertyManager.editId = null;
        PageManager.show("new");
        setTimeout(() => {
            const varos = document.getElementById("ujVaros");
            if (varos && m.varos && [...varos.options].some(o => o.value === m.varos)) {
                varos.value = m.varos;
                CityManager.loadKeruletek(m.varos);
            }
            NewPropertyManager.fillFromScrape({
                tipus: m.tipus, ugylet: m.ugylet, cim: m.cim, ar: m.kert_ar, nm: m.nm, szobak: m.szobak,
                leiras: m.leiras, telepules: m.telepules
            });
            NewPropertyManager.megbizasId = m.id;
            const r = document.getElementById("scrapeResult");
            if (r) r.insertAdjacentHTML("afterbegin", `<div class="alert alert-info py-2 small"><i class="fa-solid fa-key" aria-hidden="true"></i> ${Utils.escape(I18n.f("mbListingFromMandate", { szam: m.szerzodes_szam || "#" + m.id }))}</div>`);
        }, 350);
    }

    // ---------- Vevők ----------

    static fulVevok(hova, m) {

        const esc = Utils.escape;
        const kezel = m.jog.kezel;
        const vevoMegt = e => m.megtekintesek.filter(t => t.erdeklodo_id === e.id);
        const vevoAj = e => m.ajanlatok.filter(a => a.erdeklodo_id === e.id);
        const olvasatlan = e => m.uzenetek.filter(z => z.erdeklodo_id === e.id && z.irany === "be" && !z.olvasva).length;
        const sorrend = { vevo: 0, ajanlat: 1, megtekintes: 2, kapcsolat: 3, uj: 4, elutasitva: 9 };
        const lista = [...m.erdeklodok].sort((a, b) => (sorrend[a.statusz] ?? 5) - (sorrend[b.statusz] ?? 5) || b.id - a.id);

        hova.innerHTML = `
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                <p class="text-body-secondary small mb-0">${I18n.t("mdBuyersHelp")}</p>
                ${kezel ? `<button type="button" class="btn btn-sm btn-primary" data-md-uj="erdeklodok"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${I18n.t("mdAddBuyer")}</button>` : ""}
            </div>
            ${lista.length ? `<div class="mdBuyerGrid">${lista.map(e => `
                <article class="mdBuyer st-${esc(e.statusz)}">
                    <header class="d-flex justify-content-between gap-2">
                        <div class="min-w-0">
                            <b>${esc(e.nev || "–")}</b>
                            <div class="small">${MandateDesk.tel(e.telefon)}${e.telefon && e.email ? " · " : ""}${e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : ""}</div>
                        </div>
                        ${kezel ? `
                        <select class="form-select form-select-sm w-auto mdBuyerSt" data-md-erd-st="${e.id}" aria-label="${esc(I18n.t("ordStatus"))}">
                            ${["uj", "kapcsolat", "megtekintes", "ajanlat", "vevo", "elutasitva"].map(s => `<option value="${s}" ${e.statusz === s ? "selected" : ""}>${esc(I18n.t("mbEr_" + s))}</option>`).join("")}
                        </select>` : `<span class="badge text-bg-light">${esc(I18n.t("mbEr_" + e.statusz))}</span>`}
                    </header>
                    <div class="small text-body-secondary mt-1">
                        ${e.koltsegkeret ? `<i class="fa-solid fa-wallet" aria-hidden="true"></i> ${esc(Svc.penz(e.koltsegkeret, m.penznem))} · ` : ""}${e.finanszirozas ? esc(I18n.t("lmFin_" + e.finanszirozas)) + " · " : ""}${esc(I18n.t("mdSource_" + (e.forras || "kezi")))} · ${esc(Svc.nap(e.created_at))}
                    </div>
                    ${e.megjegyzes ? `<div class="small mt-1 mbClamp">${esc(e.megjegyzes)}</div>` : ""}
                    <ul class="mdMini">
                        ${vevoMegt(e).map(t => `<li><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${t.idopont ? esc(Svc.ido(t.idopont)) : esc(t.javasolt || I18n.t("mbNoTimeYet"))} · <span class="text-body-secondary">${esc(I18n.t("mbVw_" + t.statusz))}</span></li>`).join("")}
                        ${vevoAj(e).map(a => `<li><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> <b>${esc(Svc.penz(a.vegso_osszeg || a.osszeg, a.penznem))}</b> · <span class="text-body-secondary">${esc(I18n.t("mbOf_" + a.statusz))}</span></li>`).join("")}
                    </ul>
                    <div class="d-flex flex-wrap gap-1 mt-2">
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-md-szal="${e.id}"><i class="fa-regular fa-comments" aria-hidden="true"></i> ${I18n.t("mdMessage")}${olvasatlan(e) ? ` <span class="badge text-bg-danger">${olvasatlan(e)}</span>` : ""}</button>
                        ${kezel ? `
                        <button type="button" class="btn btn-sm btn-outline-primary" data-md-uj-erd="megtekintesek:${e.id}"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${I18n.t("mdAddViewing")}</button>
                        <button type="button" class="btn btn-sm btn-outline-primary" data-md-uj-erd="ajanlatok:${e.id}"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("mdAddOffer")}</button>
                        <button type="button" class="btn btn-sm btn-link ms-auto" data-md-szerk="erdeklodok:${e.id}">${I18n.t("detailEdit")}</button>` : ""}
                    </div>
                </article>`).join("")}</div>` : `<p class="text-body-secondary">${I18n.t("mbNoInterested")}</p>`}

            ${m.regi_uzenetek && m.regi_uzenetek.length ? `
                <div class="card mt-4">
                    <div class="card-header"><h6 class="mb-0">${I18n.t("mbListingMessages")}</h6></div>
                    <div class="card-body">
                        ${m.regi_uzenetek.map(u => `
                            <div class="mbMsg">
                                <div class="flex-fill"><b>${esc(u.nev || "–")}</b> <span class="small text-body-secondary">${esc(Svc.ido(u.created_at))}</span><div class="small mbClamp">${esc(u.szoveg)}</div></div>
                                ${u.felveve ? `<span class="badge text-bg-success">${I18n.t("mbAdded")}</span>` : kezel ? `<button type="button" class="btn btn-sm btn-outline-primary" data-md-felvesz="${u.felado_id}">${I18n.t("mbAddAsInterested")}</button>` : ""}
                            </div>`).join("")}
                        <a class="small" href="#fiok/uzenetek">${I18n.t("accTabMessages")} →</a>
                    </div>
                </div>` : ""}`;

        hova.querySelectorAll("[data-md-erd-st]").forEach(s => {
            s.onchange = () => {
                const e = m.erdeklodok.find(x => x.id === Number(s.dataset.mdErdSt));
                MandateDesk.api(`/${m.id}/erdeklodok/${e.id}`, { method: "PUT", body: { ...e, statusz: s.value } })
                    .then(() => { MandateDesk.jelez(I18n.t("adsSaved")); MandateDesk.frissit(); }).catch(err => MandateDesk.hiba(err));
            };
        });
        hova.querySelectorAll("[data-md-szal]").forEach(b => {
            b.onclick = () => {
                MandateDesk.szal = Number(b.dataset.mdSzal);
                history.replaceState(null, "", `${MandateDesk.base}/${m.id}/uzenetek`);
                MandateDesk.rajzolReszlet("uzenetek");
            };
        });
        MandateDesk.kotSzerk(hova, m);
        hova.querySelectorAll("[data-md-uj-erd]").forEach(b => {
            const [resz, eid] = b.dataset.mdUjErd.split(":");
            b.onclick = () => MandateDesk.reszSzerk(m, resz, null, { erdeklodo_id: Number(eid) });
        });
        hova.querySelectorAll("[data-md-felvesz]").forEach(b => {
            b.onclick = () => {
                const u = m.regi_uzenetek.find(x => String(x.felado_id) === b.dataset.mdFelvesz);
                MandateDesk.api(`/${m.id}/erdeklodok`, { method: "POST", body: { nev: u.nev || "–", email: u.email, telefon: u.telefon, user_id: u.felado_id, megjegyzes: u.szoveg, statusz: "kapcsolat" } })
                    .then(() => MandateDesk.frissit()).catch(e => MandateDesk.hiba(e));
            };
        });

    }

    static kotSzerk(hova, m) {
        hova.querySelectorAll("[data-md-uj]").forEach(b => { b.onclick = () => MandateDesk.reszSzerk(m, b.dataset.mdUj, null); });
        hova.querySelectorAll("[data-md-szerk]").forEach(b => {
            const [resz, rid] = b.dataset.mdSzerk.split(":");
            b.onclick = () => MandateDesk.reszSzerk(m, resz, m[resz].find(x => x.id === Number(rid)));
        });
    }

    // ---------- Megtekintések ----------

    static fulMegtekintesek(hova, m) {

        const esc = Utils.escape;
        const kezel = m.jog.kezel;
        const most = Date.now();
        const csop = {
            kert: m.megtekintesek.filter(t => t.statusz === "kert"),
            kozelgo: m.megtekintesek.filter(t => t.statusz === "egyeztetve" && t.idopont && new Date(t.idopont) >= most - 2 * 3600 * 1000),
            lezarando: m.megtekintesek.filter(t => t.statusz === "egyeztetve" && (!t.idopont || new Date(t.idopont) < most - 2 * 3600 * 1000)),
            korabbi: m.megtekintesek.filter(t => ["megtortent", "elmaradt", "lemondva"].includes(t.statusz))
        };

        const sor = t => `
            <li class="${t.statusz}">
                <div class="d-flex flex-wrap justify-content-between gap-2">
                    <div class="min-w-0">
                        <b>${t.idopont ? esc(Svc.ido(t.idopont)) : `<span class="text-warning">${I18n.t("mbNoTimeYet")}</span>`}</b>
                        · ${esc(t.erdeklodo_nev || "–")}${t.erdeklodo_telefon ? ` · ${MandateDesk.tel(t.erdeklodo_telefon)}` : ""}
                        ${t.bemutato_nev ? `<span class="small text-body-secondary"> · <i class="fa-solid fa-door-open" aria-hidden="true"></i> ${esc(t.bemutato_nev)}</span>` : ""}
                    </div>
                    <span class="badge text-bg-light align-self-start">${esc(I18n.t("mbVw_" + t.statusz))}</span>
                </div>
                ${t.javasolt ? `<div class="small text-body-secondary">${I18n.t("lmWhen")}: ${esc(t.javasolt)}</div>` : ""}
                ${t.visszajelzes ? `<div class="small mt-1"><i class="fa-regular fa-comment" aria-hidden="true"></i> ${esc(t.visszajelzes)}</div>` : ""}
                ${kezel ? `
                <div class="d-flex flex-wrap gap-1 mt-2">
                    ${t.statusz === "kert" ? `<button type="button" class="btn btn-sm btn-primary" data-md-szerk="megtekintesek:${t.id}"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${I18n.t("mdSetTime")}</button>` : ""}
                    ${t.statusz === "egyeztetve" ? `
                        <button type="button" class="btn btn-sm btn-outline-success" data-md-lezar="${t.id}:megtortent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("mbVw_megtortent")}</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-md-lezar="${t.id}:elmaradt">${I18n.t("mbVw_elmaradt")}</button>` : ""}
                    <button type="button" class="btn btn-sm btn-link ms-auto" data-md-szerk="megtekintesek:${t.id}">${I18n.t("detailEdit")}</button>
                </div>` : ""}
            </li>`;

        const blokk = (k, ikon) => csop[k].length ? `
            <h6 class="mdGroupHead mt-3"><i class="${ikon}" aria-hidden="true"></i> ${I18n.t("mdVwGroup_" + k)} <span class="badge text-bg-light">${csop[k].length}</span></h6>
            <ul class="mbTimeline">${csop[k].map(sor).join("")}</ul>` : "";

        hova.innerHTML = `
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                <p class="text-body-secondary small mb-0">${I18n.t("mdViewingsHelp")}</p>
                ${kezel ? `<button type="button" class="btn btn-sm btn-primary" data-md-uj="megtekintesek"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${I18n.t("mdAddViewing")}</button>` : ""}
            </div>
            ${m.megtekintesek.length ? `
                ${blokk("kert", "fa-solid fa-hourglass-half")}
                ${blokk("lezarando", "fa-solid fa-flag-checkered")}
                ${blokk("kozelgo", "fa-regular fa-calendar-check")}
                ${blokk("korabbi", "fa-solid fa-box-archive")}` : `<p class="text-body-secondary mt-3">${I18n.t("mbNoViewings")}</p>`}`;

        MandateDesk.kotSzerk(hova, m);
        hova.querySelectorAll("[data-md-lezar]").forEach(b => {
            b.onclick = () => {
                const [tid, statusz] = b.dataset.mdLezar.split(":");
                const t = m.megtekintesek.find(x => x.id === Number(tid));
                const vj = statusz === "megtortent" ? prompt(I18n.t("mdFeedbackPrompt"), t.visszajelzes || "") : null;
                if (statusz === "megtortent" && vj === null) return;
                MandateDesk.api(`/${m.id}/megtekintesek/${tid}`, { method: "PUT", body: { ...t, idopont: t.idopont, statusz, visszajelzes: vj || t.visszajelzes } })
                    .then(() => { MandateDesk.jelez(I18n.t("adsSaved")); MandateDesk.frissit(); }).catch(e => MandateDesk.hiba(e));
            };
        });

    }

    // ---------- Ajánlatok ----------

    static fulAjanlatok(hova, m) {

        const esc = Utils.escape;
        const kezel = m.jog.kezel;
        const sorrend = { uj: 0, ellenajanlat: 1, tovabbitva: 2, elfogadva: 3, elutasitva: 8, visszavonva: 9 };
        const lista = [...m.ajanlatok].sort((a, b) => (sorrend[a.statusz] ?? 5) - (sorrend[b.statusz] ?? 5) || new Date(b.created_at) - new Date(a.created_at));
        const max = Math.max(0, ...m.ajanlatok.filter(a => !["visszavonva", "elutasitva"].includes(a.statusz)).map(a => a.vegso_osszeg || a.osszeg));

        // Hol tart az ajánlat: nálunk / az eladónál / a vevőnél / megállapodás / lezárva
        const hol = a => {
            if (a.statusz === "uj") return { k: "nalunk", c: "warning" };
            if (a.statusz === "tovabbitva") return { k: "eladonal", c: "info" };
            if (a.statusz === "ellenajanlat") return a.ellen_vevonek ? { k: "vevonel", c: "info" } : { k: "nalunk_ellen", c: "warning" };
            if (a.statusz === "elfogadva") return { k: "megallapodas", c: "success" };
            return { k: "lezarva", c: "secondary" };
        };

        hova.innerHTML = `
            <div class="alert ${m.mod === "azonnal" ? "alert-info" : "alert-light"} small d-flex gap-2 align-items-start">
                <i class="fa-solid ${m.mod === "azonnal" ? "fa-bolt" : "fa-user-check"} mt-1" aria-hidden="true"></i>
                <div><b>${esc(I18n.t("mdMode_" + m.mod))}</b> – ${esc(I18n.t("mdModeHelp_" + m.mod))}${m.jog.admin ? ` <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-md-go="${m.id}" data-md-ful="attekintes">${I18n.t("mdChange")}</button>` : ""}</div>
            </div>
            <div class="d-flex justify-content-end mb-2">
                ${kezel ? `<button type="button" class="btn btn-sm btn-outline-primary" data-md-uj="ajanlatok"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("mdAddOffer")}</button>` : ""}
            </div>
            ${lista.length ? `<div class="mdOffers">${lista.map(a => {
                const h = hol(a);
                const osszeg = a.vegso_osszeg || a.osszeg;
                return `
                <article class="mdOffer st-${esc(a.statusz)} ${osszeg === max && max ? "best" : ""}">
                    <div class="d-flex flex-wrap justify-content-between gap-2">
                        <div>
                            <span class="fs-5 fw-bold">${esc(Svc.penz(a.osszeg, a.penznem))}</span>
                            ${m.kert_ar ? ` <span class="small text-body-secondary">(${esc(MandateDesk.szazalek(a.osszeg, m.kert_ar))})</span>` : ""}
                            ${osszeg === max && max ? ` <span class="badge text-bg-warning"><i class="fa-solid fa-trophy" aria-hidden="true"></i> ${I18n.t("mbBestOffer")}</span>` : ""}
                            ${a.ellenajanlat ? `<div class="small">${I18n.t("mmCounter")}: <b>${esc(Svc.penz(a.ellenajanlat, a.penznem))}</b></div>` : ""}
                            ${a.vegso_osszeg && a.statusz === "elfogadva" ? `<div class="small text-success fw-semibold">${I18n.t("mdAgreed")}: ${esc(Svc.penz(a.vegso_osszeg, a.penznem))}</div>` : ""}
                        </div>
                        <div class="text-end">
                            <span class="badge text-bg-${h.c}">${esc(I18n.t("mdWhere_" + h.k))}</span>
                            <div class="small text-body-secondary mt-1">${esc(I18n.t("mbOf_" + a.statusz))} · ${esc(Svc.nap(a.created_at))}</div>
                        </div>
                    </div>
                    <div class="small mt-1">
                        <i class="fa-solid fa-user" aria-hidden="true"></i> ${esc(a.erdeklodo_nev || "–")}${a.finanszirozas ? ` · ${esc(I18n.t("lmFin_" + a.finanszirozas))}` : ""}${a.koltsegkeret ? ` · ${I18n.t("lmBudget")}: ${esc(Svc.penz(a.koltsegkeret, a.penznem))}` : ""}
                    </div>
                    ${a.feltetelek ? `<div class="small text-body-secondary">${esc(a.feltetelek)}</div>` : ""}
                    ${a.elado_valasz ? `<div class="mbSeller"><i class="fa-solid fa-user-tag" aria-hidden="true"></i> ${I18n.t("mdSellerSaid")}: „${esc(a.elado_valasz)}”</div>` : ""}
                    ${a.vevo_valasz ? `<div class="small text-body-secondary"><i class="fa-solid fa-user" aria-hidden="true"></i> ${esc(a.vevo_valasz)}</div>` : ""}
                    ${kezel ? `
                    <div class="d-flex flex-wrap gap-1 mt-2">
                        ${a.statusz === "uj" ? `
                            <button type="button" class="btn btn-sm btn-success" data-md-aj="${a.id}:tovabbit"><i class="fa-solid fa-share" aria-hidden="true"></i> ${I18n.t("mdForwardSeller")}</button>
                            <button type="button" class="btn btn-sm btn-outline-danger" data-md-aj="${a.id}:elutasit">${I18n.t("mdRejectOffer")}</button>` : ""}
                        ${a.statusz === "ellenajanlat" && !a.ellen_vevonek ? `
                            <button type="button" class="btn btn-sm btn-success" data-md-aj="${a.id}:ellen_tovabbit"><i class="fa-solid fa-reply" aria-hidden="true"></i> ${I18n.t("mdForwardBuyer")}</button>` : ""}
                        ${["tovabbitva", "ellenajanlat"].includes(a.statusz) ? `
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-md-aj="${a.id}:elutasit">${I18n.t("mdCloseOffer")}</button>` : ""}
                        <button type="button" class="btn btn-sm btn-link ms-auto" data-md-szerk="ajanlatok:${a.id}">${I18n.t("detailEdit")}</button>
                    </div>` : ""}
                </article>`;
            }).join("")}</div>` : `<p class="text-body-secondary">${I18n.t("mbNoOffers")}</p>`}`;

        MandateDesk.kotSzerk(hova, m);
        hova.querySelectorAll("[data-md-aj]").forEach(b => {
            b.onclick = () => {
                const [aid, muv] = b.dataset.mdAj.split(":");
                const a = m.ajanlatok.find(x => x.id === Number(aid));
                let body = {};
                if (muv === "tovabbit" && !confirm(I18n.f("mbForwardConfirm", { osszeg: Svc.penz(a.osszeg, a.penznem) }))) return;
                if (muv === "ellen_tovabbit" && !confirm(I18n.f("mdForwardBuyerConfirm", { osszeg: Svc.penz(a.ellenajanlat, a.penznem) }))) return;
                if (muv === "elutasit") {
                    if (!confirm(I18n.t("mdRejectConfirm"))) return;
                    body = { ertesit: confirm(I18n.t("mdRejectNotify")) };
                }
                b.disabled = true;
                MandateDesk.api(`/${m.id}/ajanlatok/${aid}/${muv}`, { method: "POST", body })
                    .then(() => { MandateDesk.jelez(I18n.t("mdDone")); MandateDesk.frissit(); })
                    .catch(e => { b.disabled = false; MandateDesk.hiba(e); });
            };
        });

    }

    // ---------- Üzenetek ----------

    static fulUzenetek(hova, m) {

        const esc = Utils.escape;
        const kezel = m.jog.kezel;
        const szalak = [
            { k: "elado", nev: m.nev || I18n.t("mdSeller"), al: I18n.t("mdSeller"), eid: null },
            ...m.erdeklodok.map(e => ({ k: e.id, nev: e.nev || "–", al: I18n.t("mbEr_" + e.statusz), eid: e.id }))
        ].map(s => {
            const z = m.uzenetek.filter(x => (x.erdeklodo_id || null) === s.eid);
            return { ...s, z, olv: z.filter(x => x.irany === "be" && !x.olvasva).length, utolso: z[z.length - 1] };
        }).sort((a, b) => (a.k === "elado" ? -1 : b.k === "elado" ? 1 : 0) || (b.olv - a.olv) || (new Date(b.utolso ? b.utolso.created_at : 0) - new Date(a.utolso ? a.utolso.created_at : 0)));

        let akt = szalak.find(s => s.k === MandateDesk.szal) || szalak.find(s => s.olv) || szalak[0];
        MandateDesk.szal = akt.k;

        const SABLONOK = ["mdTpl_thanks", "mdTpl_available", "mdTpl_when", "mdTpl_docs"];

        const rajzol = () => {
            hova.innerHTML = `
                <div class="mdChat">
                    <aside class="mdThreads" role="tablist" aria-label="${esc(I18n.t("mdTab_uzenetek"))}">
                        ${szalak.map(s => `
                            <button type="button" role="tab" class="mdThread ${s.k === akt.k ? "active" : ""}" data-md-th="${s.k}" aria-selected="${s.k === akt.k}">
                                <span class="d-flex justify-content-between gap-2"><b class="text-truncate">${esc(s.nev)}</b>${s.olv ? `<span class="badge text-bg-danger">${s.olv}</span>` : ""}</span>
                                <small class="d-block text-body-secondary text-truncate">${s.k === "elado" ? `<i class="fa-solid fa-user-tag" aria-hidden="true"></i> ` : ""}${esc(s.al)}${s.utolso ? " · " + esc(s.utolso.szoveg.slice(0, 40)) : ""}</small>
                            </button>`).join("")}
                    </aside>
                    <section class="mdConv">
                        <header class="mdConvHead"><b>${esc(akt.nev)}</b> <span class="small text-body-secondary">${esc(akt.al)}</span></header>
                        <div class="mdBubbles" id="mdBubbles">
                            ${akt.z.length ? akt.z.map(z => `
                                <div class="mdBubble ${z.irany}">
                                    <div class="mdBubbleText">${esc(z.szoveg)}</div>
                                    <small>${z.irany === "ki" && z.szerzo ? esc(z.szerzo) + " · " : ""}${esc(Svc.ido(z.created_at))}${z.irany === "ki" ? (z.olvasva ? ` · <i class="fa-solid fa-check-double" title="${esc(I18n.t("mdSeen"))}" aria-label="${esc(I18n.t("mdSeen"))}"></i>` : "") : ""}</small>
                                </div>`).join("") : `<p class="text-body-secondary small text-center my-4">${I18n.t("mdNoMessages")}</p>`}
                        </div>
                        ${kezel ? `
                        <div class="mdCompose">
                            <div class="d-flex flex-wrap gap-1 mb-2">
                                ${SABLONOK.map(k => `<button type="button" class="btn btn-sm btn-outline-secondary mdTpl" data-md-tpl="${k}">${esc(I18n.t(k + "Label"))}</button>`).join("")}
                            </div>
                            <textarea class="form-control" id="mdUzSz" rows="3" maxlength="4000" placeholder="${esc(I18n.t("mdWritePh"))}" aria-label="${esc(I18n.t("mdWritePh"))}"></textarea>
                            <div class="d-flex justify-content-between align-items-center mt-2">
                                <small class="text-body-secondary">${I18n.t(akt.k === "elado" ? "mdMailSeller" : "mdMailBuyer")}</small>
                                <button type="button" class="btn btn-primary btn-sm" id="mdUzKuld"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t("lmSend")}</button>
                            </div>
                        </div>` : ""}
                    </section>
                </div>`;

            const bub = hova.querySelector("#mdBubbles");
            bub.scrollTop = bub.scrollHeight;

            hova.querySelectorAll("[data-md-th]").forEach(b => {
                b.onclick = () => {
                    akt = szalak.find(s => String(s.k) === b.dataset.mdTh);
                    MandateDesk.szal = akt.k;
                    olvas();
                    rajzol();
                };
            });
            hova.querySelectorAll("[data-md-tpl]").forEach(b => {
                b.onclick = () => {
                    const ta = hova.querySelector("#mdUzSz");
                    ta.value = (ta.value ? ta.value + "\n" : "") + I18n.t(b.dataset.mdTpl);
                    ta.focus();
                };
            });
            const kuld = hova.querySelector("#mdUzKuld");
            if (kuld) kuld.onclick = () => {
                const szoveg = hova.querySelector("#mdUzSz").value.trim();
                if (!szoveg) return;
                kuld.disabled = true;
                MandateDesk.api(`/${m.id}/uzenet`, { method: "POST", body: { erdeklodo_id: akt.eid, szoveg } })
                    .then(() => { MandateDesk.jelez(I18n.t("mdSent")); MandateDesk.frissit(); })
                    .catch(e => { kuld.disabled = false; MandateDesk.hiba(e); });
            };
        };

        // Megnyitáskor a beérkezettek olvasottak
        const olvas = () => {
            if (!akt.olv) return;
            akt.z.forEach(z => { if (z.irany === "be") z.olvasva = true; });
            akt.olv = 0;
            MandateDesk.api(`/${m.id}/olvasva`, { method: "POST", body: { erdeklodo_id: akt.eid } }).catch(() => { });
        };

        olvas();
        rajzol();

    }

    // ---------- Szerződés és díj ----------

    static fulSzerzodes(hova, m) {

        const esc = Utils.escape;
        const admin = m.jog.admin;
        const dij = m.dij || {};
        const dis = admin ? "" : "disabled";
        const lepesek = ["tervezet", "elkuldve", "elfogadva", "alairva"];
        const idx = lepesek.indexOf(m.szerzodes_allapot || "tervezet");
        const sor = (label, v) => v ? `<div class="mbKv"><span>${label}</span><b>${v}</b></div>` : "";

        hova.innerHTML = `
            <div class="row g-4">
                <div class="col-xl-7">
                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-file-signature" aria-hidden="true"></i> ${I18n.t("mdContract")}</h5></div>
                        <div class="card-body">
                            <ol class="mmSteps mb-3">
                                ${lepesek.map((s, i) => `<li class="${i < idx ? "done" : i === idx ? "current" : ""}"><span></span>${esc(I18n.t("mdCst_" + s))}</li>`).join("")}
                            </ol>
                            <div class="small text-body-secondary mb-3">
                                ${m.szerzodes_elkuldve ? `<div><i class="fa-regular fa-paper-plane" aria-hidden="true"></i> ${I18n.t("mdCst_elkuldve")}: ${esc(Svc.ido(m.szerzodes_elkuldve))}</div>` : ""}
                                ${m.szerzodes_elfogadva ? `<div><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("mdAcceptedOnline")}: ${esc(Svc.ido(m.szerzodes_elfogadva))}${m.szerzodes_elfogadva_ip ? ` · IP ${esc(m.szerzodes_elfogadva_ip)}` : ""}</div>` : ""}
                                ${m.alairva ? `<div><i class="fa-solid fa-pen-nib" aria-hidden="true"></i> ${I18n.t("mbSigned")}: ${esc(Svc.nap(m.alairva))}</div>` : ""}
                                ${m.lejar ? `<div><i class="fa-regular fa-hourglass" aria-hidden="true"></i> ${I18n.t("mdExpires")}: ${esc(Svc.nap(m.lejar))}</div>` : ""}
                            </div>
                            <div class="d-flex flex-wrap gap-2">
                                <a class="btn btn-sm btn-outline-secondary" href="/api/megbizas/${m.id}/szerzodes" target="_blank" rel="noopener"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> ${I18n.t("mbOpenContract")}</a>
                                ${admin && idx < 2 ? `<button type="button" class="btn btn-sm btn-primary" id="mdSzKuld"><i class="fa-regular fa-paper-plane" aria-hidden="true"></i> ${I18n.t(idx === 1 ? "mdResendContract" : "mdSendContract")}</button>` : ""}
                            </div>
                            <p class="small text-body-secondary mt-2 mb-0">${I18n.t("mdContractHelp")}</p>

                            <hr>
                            <fieldset ${dis}>
                            <div class="row g-2">
                                <div class="col-6"><label class="form-label small mb-1" for="mbSzDatum">${I18n.t("mbContractDate")}</label>
                                    <input class="form-control form-control-sm" id="mbSzDatum" type="date" value="${esc(m.szerzodes_datum || "")}"></div>
                                <div class="col-6"><label class="form-label small mb-1" for="mbAlairva">${I18n.t("mdSignedPaper")}</label>
                                    <input class="form-control form-control-sm" id="mbAlairva" type="date" value="${esc(m.alairva || "")}"></div>
                                <div class="col-4"><label class="form-label small mb-1" for="mbJut">${I18n.t("mbCommission")} %</label>
                                    <input class="form-control form-control-sm" id="mbJut" type="number" step="0.1" value="${m.jutalek ?? ""}"></div>
                                <div class="col-4"><label class="form-label small mb-1" for="mbFix">${I18n.t("mbFixFee")}</label>
                                    <input class="form-control form-control-sm" id="mbFix" type="number" step="10" value="${m.fix_dij ?? ""}"></div>
                                <div class="col-4"><label class="form-label small mb-1" for="mbPenznem">${I18n.t("finCurrency")}</label>
                                    <select class="form-select form-select-sm" id="mbPenznem"><option ${m.penznem !== "RON" ? "selected" : ""}>EUR</option><option ${m.penznem === "RON" ? "selected" : ""}>RON</option></select></div>
                                <div class="col-6"><label class="form-label small mb-1" for="mbIdo">${I18n.t("mbDuration")}</label>
                                    <input class="form-control form-control-sm" id="mbIdo" type="number" min="1" max="36" value="${m.idotartam_honap ?? 6}"></div>
                                <div class="col-6 d-flex align-items-end"><div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" role="switch" id="mbKizar" ${m.kizarolagos ? "checked" : ""}>
                                    <label class="form-check-label small" for="mbKizar">${I18n.t("mbExclusive")}</label></div></div>
                                <div class="col-6"><label class="form-label small mb-1" for="mbEladAr">${I18n.t("mbSalePrice")}</label>
                                    <input class="form-control form-control-sm" id="mbEladAr" type="number" step="500" value="${m.eladasi_ar ?? ""}"></div>
                                <div class="col-6"><label class="form-label small mb-1" for="mbEladva">${I18n.t("mbSoldOn")}</label>
                                    <input class="form-control form-control-sm" id="mbEladva" type="date" value="${esc(m.eladva || "")}"></div>
                            </div>
                            ${admin ? `<div class="text-end mt-3"><button type="button" class="btn btn-sm btn-primary" id="mbMentSz"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button></div>` : ""}
                            </fieldset>
                            <p class="small text-body-secondary mt-2 mb-0">${I18n.t("mbContractNote")}</p>
                        </div>
                    </div>
                </div>

                <div class="col-xl-5">
                    <div class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-folder-open" aria-hidden="true"></i> ${I18n.t("mdDocs")} <span class="badge text-bg-light">${m.iratok_lista.filter(x => x.megvan).length}/${m.iratok_lista.length}</span></h5></div>
                        <div class="card-body">
                            <p class="small text-body-secondary">${I18n.t("mdDocsHelp")}</p>
                            <ul class="mdDocs">
                                ${m.iratok_lista.map(x => `
                                    <li>
                                        <label class="form-check mb-0">
                                            <input class="form-check-input" type="checkbox" data-md-irat="${esc(x.kod)}" ${x.megvan ? "checked" : ""} ${dis}>
                                            <span class="form-check-label">${esc(Svc.t(x.nev))}</span>
                                        </label>
                                        <input class="form-control form-control-sm mt-1" data-md-irat-megj="${esc(x.kod)}" value="${esc(x.megj || "")}" placeholder="${esc(I18n.t("prNote"))}" aria-label="${esc(I18n.t("prNote"))}" ${dis}>
                                    </li>`).join("")}
                            </ul>
                            ${admin ? `<div class="text-end"><button type="button" class="btn btn-sm btn-outline-primary" id="mdIratMent">${I18n.t("finSave")}</button></div>` : ""}
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-coins" aria-hidden="true"></i> ${I18n.t("mbContractFee")}</h5></div>
                        <div class="card-body">
                            <div class="mbFeeBox">
                                ${sor(I18n.t(dij.becsult ? "mbFeeEstimated" : "mbFeeSuccess"), dij.siker ? esc(Svc.penz(dij.siker, dij.penznem)) + ` <small>(${esc(Utils.num(dij.jutalek, 1))}% · ${esc(Svc.penz(dij.alap, dij.penznem))})</small>` : "")}
                                ${sor(I18n.t("mbFixFee"), dij.fix ? esc(Svc.penz(dij.fix, dij.penznem)) : "")}
                                ${(dij.opciok || []).map(o => sor(esc(Svc.t(o.nev)), esc(Svc.penz(o.ar, o.penznem)))).join("")}
                            </div>
                            ${admin ? `
                            <div class="d-flex flex-wrap gap-2 mt-3 align-items-center">
                                <button type="button" class="btn btn-sm btn-outline-success" id="mbDijbekero"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${I18n.t("mbMakeProforma")}</button>
                                ${m.dijbekero_id ? `<a class="small" href="/api/admin/penzugy/szamlak/${m.dijbekero_id}/nyomtat" target="_blank" rel="noopener">${I18n.f("mdProformaDone", { id: m.dijbekero_id })}</a>` : ""}
                            </div>` : ""}
                        </div>
                    </div>
                </div>
            </div>`;

        const $ = q => hova.querySelector(q);
        const kuld = $("#mdSzKuld");
        if (kuld) kuld.onclick = () => {
            if (!confirm(I18n.t("mdSendContractConfirm"))) return;
            kuld.disabled = true;
            MandateDesk.api(`/${m.id}/szerzodes-kuld`, { method: "POST" })
                .then(() => { MandateDesk.jelez(I18n.t("mdSent")); MandateDesk.frissit(); })
                .catch(e => { kuld.disabled = false; MandateDesk.hiba(e); });
        };
        const mentSz = $("#mbMentSz");
        if (mentSz) mentSz.onclick = () => MandateDesk.ment({
            szerzodes_datum: $("#mbSzDatum").value, alairva: $("#mbAlairva").value, jutalek: $("#mbJut").value, fix_dij: $("#mbFix").value,
            penznem: $("#mbPenznem").value, idotartam_honap: $("#mbIdo").value, kizarolagos: $("#mbKizar").checked,
            eladasi_ar: $("#mbEladAr").value, eladva: $("#mbEladva").value
        });
        const irat = $("#mdIratMent");
        if (irat) irat.onclick = () => {
            const iratok = {};
            m.iratok_lista.forEach(x => {
                iratok[x.kod] = {
                    megvan: hova.querySelector(`[data-md-irat="${x.kod}"]`).checked,
                    datum: x.megvan ? x.datum : null,
                    megj: hova.querySelector(`[data-md-irat-megj="${x.kod}"]`).value
                };
                if (iratok[x.kod].megvan && !x.megvan) iratok[x.kod].datum = new Date().toISOString().slice(0, 10);
            });
            MandateDesk.ment({ iratok });
        };
        const db = $("#mbDijbekero");
        if (db) db.onclick = () => {
            if (!confirm(I18n.t("mbProformaConfirm"))) return;
            MandateDesk.api(`/${m.id}/dijbekero`, { method: "POST", body: {} })
                .then(v => { window.open(`/api/admin/penzugy/szamlak/${v.szamla_id}/nyomtat`, "_blank", "noopener"); MandateDesk.frissit(); })
                .catch(e => MandateDesk.hiba(e));
        };

    }

    // ---------- Napló ----------

    static fulNaplo(hova, m) {

        const esc = Utils.escape;
        const kezel = m.jog.kezel;
        let csakElado = false;

        const rajzol = () => {
            const lista = csakElado ? m.naplo.filter(n => n.lathato_eladonak) : m.naplo;
            hova.querySelector("#mdLogList").innerHTML = MandateDesk.naploSorok(lista);
        };

        hova.innerHTML = `
            <div class="row g-4">
                <div class="col-lg-5">
                    ${kezel ? `
                    <div class="card">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i> ${I18n.t("mbAddNote")}</h5></div>
                        <div class="card-body">
                            <textarea class="form-control form-control-sm" id="mbNaploSz" rows="3" placeholder="${esc(I18n.t("mbNotePh"))}" aria-label="${esc(I18n.t("mbNotePh"))}"></textarea>
                            <div class="d-flex justify-content-between align-items-center mt-2">
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="mbNaploLat">
                                    <label class="form-check-label small" for="mbNaploLat">${I18n.t("mbVisibleToSeller")}</label>
                                </div>
                                <button type="button" class="btn btn-sm btn-primary" id="mbNaploKuld">${I18n.t("mbAddNote")}</button>
                            </div>
                        </div>
                    </div>` : ""}
                </div>
                <div class="col-lg-7">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0">${I18n.t("mmTimeline")} <span class="badge text-bg-light">${m.naplo.length}</span></h6>
                        <div class="form-check form-switch mb-0">
                            <input class="form-check-input" type="checkbox" role="switch" id="mdLogSeller">
                            <label class="form-check-label small" for="mdLogSeller">${I18n.t("mdOnlySellerVisible")}</label>
                        </div>
                    </div>
                    <ul class="mbLog mdLogFull" id="mdLogList"></ul>
                </div>
            </div>`;

        rajzol();
        hova.querySelector("#mdLogSeller").onchange = e => { csakElado = e.target.checked; rajzol(); };
        const k = hova.querySelector("#mbNaploKuld");
        if (k) k.onclick = () => {
            const szoveg = hova.querySelector("#mbNaploSz").value.trim();
            if (!szoveg) return;
            MandateDesk.api(`/${m.id}/naplo`, { method: "POST", body: { szoveg, lathato_eladonak: hova.querySelector("#mbNaploLat").checked } })
                .then(() => MandateDesk.frissit()).catch(e => MandateDesk.hiba(e));
        };

    }

    // ===================== SZERKESZTŐ ABLAK (vevő / megtekintés / ajánlat) =====================

    static reszSzerk(m, resz, x, elore = {}) {

        const esc = Utils.escape;
        const uj = !x;
        x = { ...(x || {}), ...elore };
        const { tartalom, modal } = Svc.modal("mbReszModal", "");
        const erdOpt = sel => `<option value="">–</option>${m.erdeklodok.map(e => `<option value="${e.id}" ${e.id === sel ? "selected" : ""}>${esc(e.nev)}</option>`).join("")}`;
        const lokalis = d => { if (!d) return ""; const t = new Date(d); const p = n => String(n).padStart(2, "0"); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`; };
        const bemOpt = sel => `<option value="">${esc(m.bemutato_nev ? I18n.f("mdPresenterDefault", { nev: m.bemutato_nev }) : "–")}</option>${(m.munkatarsak || []).map(u => `<option value="${u.id}" ${u.id === sel ? "selected" : ""}>${esc(u.nev)}</option>`).join("")}`;

        const mezok = {
            erdeklodok: `
                <div class="col-12"><label class="form-label small mb-1" for="mrNev">${I18n.t("authName")} *</label><input class="form-control" id="mrNev" value="${esc(x.nev || "")}"></div>
                <div class="col-6"><label class="form-label small mb-1" for="mrTel">${I18n.t("accPhone")}</label><input class="form-control" id="mrTel" value="${esc(x.telefon || "")}"></div>
                <div class="col-6"><label class="form-label small mb-1" for="mrEmail">${I18n.t("authEmail")}</label><input class="form-control" id="mrEmail" value="${esc(x.email || "")}"></div>
                <div class="col-6"><label class="form-label small mb-1" for="mrKeret">${I18n.t("lmBudget")}</label><input class="form-control" id="mrKeret" type="number" value="${x.koltsegkeret ?? ""}"></div>
                <div class="col-6"><label class="form-label small mb-1" for="mrFin">${I18n.t("lmFinancing")}</label><select class="form-select" id="mrFin"><option value="">–</option>${["keszpenz", "hitel", "vegyes", "egyeb"].map(f => `<option value="${f}" ${x.finanszirozas === f ? "selected" : ""}>${I18n.t("lmFin_" + f)}</option>`).join("")}</select></div>
                <div class="col-12"><label class="form-label small mb-1" for="mrSt">${I18n.t("ordStatus")}</label><select class="form-select" id="mrSt">${["uj", "kapcsolat", "megtekintes", "ajanlat", "vevo", "elutasitva"].map(s => `<option value="${s}" ${(x.statusz || "uj") === s ? "selected" : ""}>${I18n.t("mbEr_" + s)}</option>`).join("")}</select></div>
                <div class="col-12"><label class="form-label small mb-1" for="mrMegj">${I18n.t("prNote")}</label><textarea class="form-control" id="mrMegj" rows="3">${esc(x.megjegyzes || "")}</textarea></div>`,
            megtekintesek: `
                <div class="col-12"><label class="form-label small mb-1" for="mrErd">${I18n.t("ordCustomer")}</label><select class="form-select" id="mrErd">${erdOpt(x.erdeklodo_id)}</select></div>
                <div class="col-7"><label class="form-label small mb-1" for="mrIdo">${I18n.t("mbWhen")}</label><input class="form-control" id="mrIdo" type="datetime-local" value="${lokalis(x.idopont)}"></div>
                <div class="col-5"><label class="form-label small mb-1" for="mrSt">${I18n.t("ordStatus")}</label><select class="form-select" id="mrSt">${["kert", "egyeztetve", "megtortent", "elmaradt", "lemondva"].map(s => `<option value="${s}" ${(x.statusz || "egyeztetve") === s ? "selected" : ""}>${I18n.t("mbVw_" + s)}</option>`).join("")}</select></div>
                ${m.jog.admin ? `<div class="col-12"><label class="form-label small mb-1" for="mrBem">${I18n.t("mdPresenter")}</label><select class="form-select" id="mrBem">${bemOpt(x.bemutato_id)}</select></div>` : ""}
                <div class="col-12"><label class="form-label small mb-1" for="mrJav">${I18n.t("lmWhen")}</label><input class="form-control" id="mrJav" value="${esc(x.javasolt || "")}"></div>
                <div class="col-12"><label class="form-label small mb-1" for="mrVissza">${I18n.t("mbFeedback")}</label><textarea class="form-control" id="mrVissza" rows="3">${esc(x.visszajelzes || "")}</textarea></div>
                <p class="small text-body-secondary mb-0">${I18n.t("mdViewingNotify")}</p>`,
            ajanlatok: `
                <div class="col-12"><label class="form-label small mb-1" for="mrErd">${I18n.t("ordCustomer")}</label><select class="form-select" id="mrErd">${erdOpt(x.erdeklodo_id)}</select></div>
                <div class="col-7"><label class="form-label small mb-1" for="mrOsszeg">${I18n.t("lmAmount")} *</label><input class="form-control" id="mrOsszeg" type="number" value="${x.osszeg ?? ""}"></div>
                <div class="col-5"><label class="form-label small mb-1" for="mrPn">${I18n.t("finCurrency")}</label><select class="form-select" id="mrPn"><option ${(x.penznem || m.penznem) !== "RON" ? "selected" : ""}>EUR</option><option ${(x.penznem || m.penznem) === "RON" ? "selected" : ""}>RON</option></select></div>
                <div class="col-12"><label class="form-label small mb-1" for="mrFelt">${I18n.t("lmConditions")}</label><input class="form-control" id="mrFelt" value="${esc(x.feltetelek || "")}"></div>
                <div class="col-7"><label class="form-label small mb-1" for="mrSt">${I18n.t("ordStatus")}</label><select class="form-select" id="mrSt">${["uj", "tovabbitva", "ellenajanlat", "elfogadva", "elutasitva", "visszavonva"].map(s => `<option value="${s}" ${(x.statusz || "uj") === s ? "selected" : ""}>${I18n.t("mbOf_" + s)}</option>`).join("")}</select></div>
                <div class="col-5"><label class="form-label small mb-1" for="mrEllen">${I18n.t("mmCounter")}</label><input class="form-control" id="mrEllen" type="number" value="${x.ellenajanlat ?? ""}"></div>
                <p class="small text-body-secondary mb-0">${I18n.t("mdOfferEditNote")}</p>`
        }[resz];

        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title">${I18n.t({ erdeklodok: uj ? "mdAddBuyer" : "mdEditBuyer", megtekintesek: uj ? "mdAddViewing" : "mmViewings", ajanlatok: uj ? "mdAddOffer" : "mmOffers" }[resz])}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
            </div>
            <div class="modal-body"><div class="row g-2">${mezok}</div></div>
            <div class="modal-footer">
                ${!uj && m.jog.admin ? `<button type="button" class="btn btn-outline-danger me-auto" id="mrTorol" aria-label="${esc(I18n.t("finDelete"))}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>` : ""}
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
                <button type="button" class="btn btn-primary" id="mrMent">${I18n.t("finSave")}</button>
            </div>`;

        const $ = q => tartalom.querySelector(q);
        const v = q => ($(q) ? $(q).value : undefined);

        // Időpont megadásakor az állapot magától „egyeztetve”
        const ido = $("#mrIdo");
        if (ido) ido.onchange = () => { if (ido.value && $("#mrSt").value === "kert") $("#mrSt").value = "egyeztetve"; };

        $("#mrMent").onclick = () => {
            const body = {
                erdeklodok: () => ({ nev: v("#mrNev"), telefon: v("#mrTel"), email: v("#mrEmail"), koltsegkeret: v("#mrKeret"), finanszirozas: v("#mrFin"), statusz: v("#mrSt"), megjegyzes: v("#mrMegj"), user_id: x.user_id }),
                megtekintesek: () => ({ erdeklodo_id: v("#mrErd"), idopont: v("#mrIdo") ? new Date(v("#mrIdo")).toISOString() : null, statusz: v("#mrSt"), javasolt: v("#mrJav"), visszajelzes: v("#mrVissza"), bemutato_id: $("#mrBem") ? (v("#mrBem") || null) : (x.bemutato_id || null) }),
                ajanlatok: () => ({ erdeklodo_id: v("#mrErd"), osszeg: v("#mrOsszeg"), penznem: v("#mrPn"), feltetelek: v("#mrFelt"), statusz: v("#mrSt"), ellenajanlat: v("#mrEllen") })
            }[resz]();
            $("#mrMent").disabled = true;
            MandateDesk.api(`/${m.id}/${resz}${uj ? "" : "/" + x.id}`, { method: uj ? "POST" : "PUT", body })
                .then(() => { modal.hide(); MandateDesk.jelez(I18n.t("adsSaved")); MandateDesk.frissit(); })
                .catch(e => { $("#mrMent").disabled = false; MandateDesk.hiba(e); });
        };

        const t = $("#mrTorol");
        if (t) t.onclick = () => {
            if (!confirm(I18n.t("finDeleteConfirm"))) return;
            MandateDesk.api(`/${m.id}/${resz}/${x.id}`, { method: "DELETE" })
                .then(() => { modal.hide(); MandateDesk.frissit(); }).catch(e => MandateDesk.hiba(e));
        };

        modal.show();

    }

}

// A hirdetés mentése a megbízás azonosítóját is elküldi (a szerver összekapcsolja)
(() => {
    if (typeof NewPropertyManager === "undefined") return;
    const gyujt = NewPropertyManager.collect;
    NewPropertyManager.collect = function () {
        const d = gyujt.call(this);
        if (NewPropertyManager.megbizasId && NewPropertyManager.editId === null) d.megbizas_id = NewPropertyManager.megbizasId;
        return d;
    };
    const urit = NewPropertyManager.clearForm;
    NewPropertyManager.clearForm = function () {
        NewPropertyManager.megbizasId = null;
        return urit.call(this);
    };
})();
