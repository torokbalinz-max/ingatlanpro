// ============================================================
//  Értékesítési asztal – a megbízások kezelése (Eladjuk helyetted)
//
//  Admin → Értékesítés → Megbízások   #admin/megbizasok[/<id>[/<fül>]]
//  Ugyanezt látja a munkatárs is, akinek az admin a megbízásokat (egy
//  városra, típusra vagy egy-egy megbízásra) kiadta – és azokon belül
//  ugyanazt tudja, mint az admin. A csak-olvasó jog: minden látszik,
//  de gombok nélkül.
//
//  Egy megbízás = egy szál, hét szakasz (Igénylés → Egyeztetés →
//  Szerződés → Előkészítés → Hirdetés → Ajánlatok → Adásvétel). Mindig
//  egy „következő lépés” látszik, egy felelőssel – a szakaszok között
//  a szerver magától továbblép, ha a feltétel teljesül.
//
//  A lista:  Ma teendő (egy kattintással), közelgő megtekintések, a
//            szakaszok táblája (vagy lista), lezártak
//  Egy megbízás: fejléc, a szakaszok sávja, a következő lépés sávja, és
//            öt fül: Vevők és ajánlatok · Megtekintések · Szerződés és
//            iratok · Ingatlan és csomag · Üzenetek és napló
//
//  Szerver: /api/ertekesites/megbizasok (server/routes/megbizas.js)
// ============================================================

class MandateDesk {

    static API = "/api/ertekesites/megbizasok";
    static SZAKASZOK = ["uj", "egyeztetes", "szerzodes", "fotozas", "hirdetes", "targyalas", "adasvetel"];
    static OSZLOPOK = MandateDesk.SZAKASZOK;
    static LEZART = ["eladva", "lezarva", "elutasitva"];
    static FULEK = [
        { k: "vevok", ikon: "fa-solid fa-users" },
        { k: "megtekintesek", ikon: "fa-regular fa-calendar" },
        { k: "szerzodes", ikon: "fa-solid fa-file-signature" },
        { k: "csomag", ikon: "fa-solid fa-house" },
        { k: "uzenetek", ikon: "fa-regular fa-comments" }
    ];
    // A régi fülnevek (könyvjelzők, levelek)
    static FUL_ALIAS = { ajanlatok: "vevok", ingatlan: "csomag", naplo: "uzenetek", attekintes: null };

    static box = null;
    static base = "#admin/megbizasok";
    static akt = null;          // a megnyitott megbízás
    static szal = null;         // az Üzenetek fülön kiválasztott szál ("elado" | erdeklodo id)
    static szuro = { q: "", statusz: "aktiv", varos: "", felelos: "", nezet: "tabla" };
    static vevoSzuro = "mind";

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

    static szakaszNev(s) {
        return I18n.t("szk_" + s);
    }

    // A címsorból: <base>/<id>/<fül>
    static hash() {
        const m = location.hash.match(/^#(?:admin|munka)\/megbizasok(?:\/(\d+))?(?:\/([a-z]+))?/);
        let ful = m && m[2] ? m[2] : null;
        if (ful && ful in MandateDesk.FUL_ALIAS) ful = MandateDesk.FUL_ALIAS[ful];
        return { id: m && m[1] ? Number(m[1]) : null, ful };
    }

    static go(id, ful) {
        const h = MandateDesk.base + (id ? "/" + id : "") + (id && ful ? "/" + ful : "");
        if (location.hash !== h) history.pushState(null, "", h);
        MandateDesk.nyit(MandateDesk.box, { base: MandateDesk.base });
        window.scrollTo({ top: 0 });
    }

    // Belépési pont: box = a tartalom helye
    static nyit(box, { base } = {}) {
        MandateDesk.box = box;
        if (base) MandateDesk.base = base;
        try {
            const s = JSON.parse(localStorage.getItem("mdSzuro2") || "null");
            if (s) MandateDesk.szuro = { ...MandateDesk.szuro, ...s };
        } catch (e) { /* nincs tároló */ }
        const { id, ful } = MandateDesk.hash();
        if (id) MandateDesk.reszlet(id, ful);
        else MandateDesk.lista();
    }

    static spinner() {
        MandateDesk.box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;
    }

    static betoltHiba() {
        MandateDesk.box.innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
    }

    // Ki csinálja: a szerep és (ha van) a neve
    static kiNev(x, m) {
        if (!x.ki) return "";
        const nev = { felelos: m.felelos_nev, fotos: m.fotos_nev || m.felelos_nev, bemutato: m.bemutato_nev || m.felelos_nev }[x.ki];
        if (x.ki === "admin" || ((x.ki === "felelos" || x.ki === "fotos" || x.ki === "bemutato") && !nev)) return I18n.t("ki_admin");
        if (x.ki === "elado") return I18n.t("ki_elado");
        if (x.ki === "vevo") return I18n.t("ki_vevo");
        return nev;
    }

    static kovSzoveg(x) {
        return I18n.f("kov_" + x.kod, { n: x.n || 0, ora: x.ora || 0, datum: x.datum ? Svc.ido(x.datum) : "", nap: x.nap ?? "" });
    }

    // Visszafelé kompatibilis (a régi Munkaterület / Áttekintés hívja)
    static teendoSzoveg(x) {
        return MandateDesk.kovSzoveg(x);
    }

    // A szakaszok sávja (7 lépés)
    static sav(statusz) {
        const esc = Utils.escape;
        const idx = MandateDesk.SZAKASZOK.indexOf(statusz);
        const vege = statusz === "eladva" ? 99 : idx;
        return `
            <ol class="szSav" aria-label="${esc(I18n.t("szk_cim"))}">
                ${MandateDesk.SZAKASZOK.map((s, i) => `
                    <li class="${i < vege ? "kesz" : i === vege ? "most" : ""}" ${i === vege ? 'aria-current="step"' : ""}>
                        <span class="szSavVonal"></span>
                        <span class="szSavNev">${i + 1}. ${esc(MandateDesk.szakaszNev(s))}</span>
                    </li>`).join("")}
            </ol>`;
    }

    // ===================== A LISTA =====================

    static lista() {

        MandateDesk.spinner();

        MandateDesk.api("").then(d => {

            const esc = Utils.escape;
            const sz = MandateDesk.szuro;
            const box = MandateDesk.box;
            const lista = d.lista;
            const en = d.jog.en;
            const varosok = [...new Set(lista.map(m => m.varos).filter(Boolean))];
            const felelosok = [...new Map(lista.filter(m => m.felelos_id).map(m => [m.felelos_id, m.felelos_nev])).entries()];

            // Ma teendő: a mi oldalunk dolgai (az eladóra / vevőre várók külön)
            const minek = x => sz.felelos === "en" ? x.felelos_id === en || (!x.felelos_id && d.jog.admin) : true;
            const sajat = d.teendok.filter(x => x.szint !== "info" && !["elado", "vevo"].includes(x.ki) && minek(x));
            const masra = d.teendok.filter(x => ["elado", "vevo"].includes(x.ki) && minek(x));

            box.innerHTML = `
                <div class="dkTop">
                    <div class="dkToolbar">
                        <div class="input-group input-group-sm mdSearch">
                            <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
                            <input class="form-control" id="mdQ" placeholder="${esc(I18n.t("mdSearchPh"))}" value="${esc(sz.q)}" aria-label="${esc(I18n.t("mdSearchPh"))}">
                        </div>
                        <select class="form-select form-select-sm w-auto" id="mdFelelos" aria-label="${esc(I18n.t("mdResponsible"))}">
                            <option value="">${I18n.t("dk_mindenki")}</option>
                            <option value="en" ${sz.felelos === "en" ? "selected" : ""}>${I18n.t("dk_en")}</option>
                            ${d.jog.admin ? `<option value="-" ${sz.felelos === "-" ? "selected" : ""}>${I18n.t("mdNoResponsible")}</option>` : ""}
                            ${felelosok.map(([id, n]) => `<option value="${id}" ${String(sz.felelos) === String(id) ? "selected" : ""}>${esc(n || "#" + id)}</option>`).join("")}
                        </select>
                        ${varosok.length > 1 ? `
                        <select class="form-select form-select-sm w-auto" id="mdVaros" aria-label="${esc(I18n.t("detailVaros"))}">
                            <option value="">${I18n.t("allCities")}</option>
                            ${varosok.map(v => `<option value="${esc(v)}" ${sz.varos === v ? "selected" : ""}>${esc(CityManager.displayName(v))}</option>`).join("")}
                        </select>` : ""}
                        <div class="btn-group btn-group-sm ms-auto" role="group" aria-label="${esc(I18n.t("mdView"))}">
                            <button type="button" class="btn btn-outline-secondary ${sz.nezet === "tabla" ? "active" : ""}" data-md-nezet="tabla"><i class="fa-solid fa-table-columns" aria-hidden="true"></i> ${I18n.t("dk_tabla")}</button>
                            <button type="button" class="btn btn-outline-secondary ${sz.nezet === "lista" ? "active" : ""}" data-md-nezet="lista"><i class="fa-solid fa-list" aria-hidden="true"></i> ${I18n.t("mdViewList")}</button>
                        </div>
                        <a class="btn btn-sm btn-outline-primary" href="#eladjuk" target="_blank" rel="noopener"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("dk_ujMegbizas")}</a>
                    </div>
                    ${!d.beallitas.aktiv && d.jog.admin ? `<div class="alert alert-warning small mb-0">${I18n.t("mbServiceOff")}</div>` : ""}
                </div>

                <div class="row g-4 mb-4">
                    <div class="col-12">
                        <section class="card dkMa h-100" aria-labelledby="dkMaCim">
                            <div class="card-header d-flex flex-wrap justify-content-between align-items-baseline gap-2">
                                <h5 class="mb-0" id="dkMaCim">${I18n.t("dk_ma")} <span class="small text-body-secondary fw-normal">· ${I18n.f("dk_maDb", { n: sajat.length })}</span></h5>
                                ${masra.length ? `<button type="button" class="btn btn-link btn-sm p-0" id="dkMasra">${I18n.f("dk_masraVar", { n: masra.length })}</button>` : ""}
                            </div>
                            <div class="card-body">
                                ${sajat.length ? `<ul class="dkTodo">${sajat.slice(0, 8).map(x => MandateDesk.maSor(x)).join("")}</ul>
                                    ${sajat.length > 8 ? `<details class="mt-2"><summary class="small">${I18n.f("mdShowAll", { n: sajat.length - 8 })}</summary><ul class="dkTodo mt-2">${sajat.slice(8).map(x => MandateDesk.maSor(x)).join("")}</ul></details>` : ""}`
                                    : `<p class="text-body-secondary mb-0"><i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i> ${I18n.t("mdNoTodos")}</p>`}
                                <div id="dkMasraLista" hidden>
                                    <h6 class="mdGroupHead mt-3">${I18n.t("dk_masraCim")}</h6>
                                    <ul class="dkTodo">${masra.map(x => MandateDesk.maSor(x)).join("")}</ul>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                <div class="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-2">
                    <h5 class="mb-0">${I18n.t("dk_szakaszonkent")}</h5>
                    <span class="small text-body-secondary">${I18n.t("dk_szakaszSugo")}</span>
                </div>
                <div id="mdLista"></div>
                <details class="mt-4" id="dkLezart">
                    <summary class="fw-semibold">${I18n.f("dk_lezartak", { n: lista.filter(m => MandateDesk.LEZART.includes(m.statusz)).length })}</summary>
                    <div id="dkLezartLista" class="mt-2"></div>
                </details>`;

            const szur = (m) => {
                const q = Utils.ekezetNelkul(sz.q || "").toLowerCase();
                return (!sz.varos || m.varos === sz.varos) &&
                    (!sz.felelos || (sz.felelos === "-" ? !m.felelos_id : sz.felelos === "en" ? m.felelos_id === en || m.fotos_id === en || m.bemutato_id === en : String(m.felelos_id) === String(sz.felelos))) &&
                    (!q || Utils.ekezetNelkul([m.szerzodes_szam, m.nev, m.fiok_nev, m.cim, m.telepules, m.varos, m.telefon, m.email].join(" ")).toLowerCase().includes(q));
            };

            const rajzol = () => {

                const hova = box.querySelector("#mdLista");
                const aktiv = lista.filter(m => MandateDesk.SZAKASZOK.includes(m.statusz) && szur(m));
                const lezart = lista.filter(m => MandateDesk.LEZART.includes(m.statusz) && szur(m));

                if (!lista.length) {
                    hova.innerHTML = `
                        <div class="emptyState">
                            <i class="fa-solid fa-key"></i>
                            <h5>${I18n.t("mbNone")}</h5>
                            <p>${I18n.t("mbNoneText")}</p>
                            <a class="btn btn-outline-primary" href="#eladjuk" target="_blank">${I18n.t("menuEladjuk")}</a>
                        </div>`;
                } else if (sz.nezet === "lista") {
                    hova.innerHTML = aktiv.length ? MandateDesk.tablazat(aktiv) : `<p class="text-body-secondary py-4 text-center">${I18n.t("mdNoMatch")}</p>`;
                } else {
                    hova.innerHTML = `
                        <div class="dkBoardWrap">
                            <div class="dkBoard">
                                ${MandateDesk.SZAKASZOK.map((s, i) => {
                                    const x = aktiv.filter(m => m.statusz === s);
                                    return `
                                        <section class="dkCol" aria-label="${esc(MandateDesk.szakaszNev(s))}">
                                            <header><span>${i + 1} · ${esc(MandateDesk.szakaszNev(s))}</span><span class="dkColDb">${x.length}</span></header>
                                            ${x.map(MandateDesk.kartya).join("") || `<p class="small text-body-secondary px-1 mb-0">–</p>`}
                                        </section>`;
                                }).join("")}
                            </div>
                        </div>`;
                }

                box.querySelector("#dkLezartLista").innerHTML = lezart.length ? MandateDesk.tablazat(lezart) : `<p class="small text-body-secondary">–</p>`;

                box.querySelectorAll("#mdLista [data-md-go], #dkLezartLista [data-md-go]").forEach(el => {
                    el.onclick = () => MandateDesk.go(Number(el.dataset.mdGo), el.dataset.mdFul);
                    el.onkeydown = e => { if (e.key === "Enter") MandateDesk.go(Number(el.dataset.mdGo)); };
                });

            };

            const ment = () => {
                try { localStorage.setItem("mdSzuro2", JSON.stringify(sz)); } catch (e) { /* nincs tároló */ }
                rajzol();
            };

            box.querySelector("#mdQ").oninput = e => { sz.q = e.target.value; rajzol(); };
            const v = box.querySelector("#mdVaros");
            if (v) v.onchange = e => { sz.varos = e.target.value; ment(); };
            box.querySelector("#mdFelelos").onchange = e => { sz.felelos = e.target.value; ment(); MandateDesk.lista(); };
            box.querySelectorAll("[data-md-nezet]").forEach(b => {
                b.onclick = () => {
                    sz.nezet = b.dataset.mdNezet;
                    box.querySelectorAll("[data-md-nezet]").forEach(x => x.classList.toggle("active", x === b));
                    ment();
                };
            });
            const masraG = box.querySelector("#dkMasra");
            if (masraG) masraG.onclick = () => { const l = box.querySelector("#dkMasraLista"); l.hidden = !l.hidden; };
            box.querySelectorAll(".dkTodo [data-md-go], .mdUpcoming [data-md-go]").forEach(b => {
                b.onclick = () => MandateDesk.go(Number(b.dataset.mdGo), b.dataset.mdFul);
            });

            rajzol();

        }).catch(e => {
            if (e && e.status === 403) MandateDesk.box.innerHTML = `<div class="alert alert-warning">${I18n.t("mdForbidden")}</div>`;
            else MandateDesk.betoltHiba();
        });

    }

    // Egy „Ma teendő” sor
    static maSor(x) {
        const esc = Utils.escape;
        const ki = MandateDesk.kiNev(x, x);
        const mikor = x.datum ? Svc.ido(x.datum) : x.ora ? I18n.f("dk_oraja", { n: x.ora }) : "";
        return `
            <li class="dkTodoSor sz-${esc(x.szint)}">
                <span class="dkDot" aria-hidden="true"></span>
                <div class="dkTodoMi">
                    <b>${esc(MandateDesk.kovSzoveg(x))}</b>
                    <span>${esc(x.szam || "")} · ${esc(MandateDesk.hely(x))}${x.nev ? " · " + esc(x.nev) : ""}</span>
                </div>
                ${ki ? `<span class="dkKi">${esc(ki)}</span>` : ""}
                ${mikor ? `<span class="dkMikor">${esc(mikor)}</span>` : ""}
                <button type="button" class="btn btn-sm btn-outline-primary text-nowrap" data-md-go="${x.megbizas_id}" data-md-ful="${x.ful}">${I18n.t("mdOpen")}</button>
            </li>`;
    }

    // A tábla egy kártyája: cím, alapadatok, két jelző, a következő lépés
    static kartya(m) {
        const esc = Utils.escape;
        const k = m.kovetkezo || {};
        const jelzok = MandateDesk.kartyaJelzok(m);
        return `
            <button type="button" class="dkCard" data-md-go="${m.id}" data-md-ful="${esc(k.ful || "")}">
                <b class="dkCardCim">${esc(m.cim || m.telepules || (m.varos ? CityManager.displayName(m.varos) : "") || m.nev || "–")}</b>
                <span class="dkCardMeta">${esc(Types.label(m.tipus))}${m.nm ? " · " + esc(Utils.nm(m.nm)) : ""}${m.kert_ar ? " · " + esc(Svc.penz(m.kert_ar, m.penznem)) : ""}</span>
                <span class="dkCardMeta">${esc(m.nev || m.fiok_nev || "")}${m.felelos_nev ? ` · <i class="fa-solid fa-user-tie" aria-hidden="true"></i> ${esc(m.felelos_nev)}` : ""}</span>
                ${jelzok.length ? `<span class="dkChips">${jelzok.map(j => `<span class="dkChip">${esc(j)}</span>`).join("")}</span>` : ""}
                <span class="dkNext sz-${esc(k.szint || "info")}">→ ${esc(k.kod ? MandateDesk.kovSzoveg(k) : "")}${k.ki && ["elado", "vevo"].includes(k.ki) ? ` <small>(${esc(MandateDesk.kiNev(k, m))})</small>` : ""}</span>
            </button>`;
    }

    static kartyaJelzok(m) {
        const j = [];
        if (["hirdetes", "targyalas", "adasvetel"].includes(m.statusz)) {
            j.push(I18n.f("dk_jErdeklodo", { n: m.erdeklodok }));
            if (m.foglalas_db) j.push(I18n.f("dk_jFoglalas", { n: m.foglalas_db }));
            if (m.ajanlat_nyitott) j.push(I18n.f("dk_jAjanlat", { n: m.ajanlat_nyitott }));
            if (m.legjobb_ajanlat) j.push(I18n.f("dk_jLegjobb", { osszeg: Svc.penz(m.legjobb_ajanlat, m.penznem) }));
        } else if (m.statusz === "fotozas") {
            if (m.kep_db) j.push(I18n.f("dk_jFoto", { n: m.kep_db }));
            if (m.fotozas_idopont) j.push(Svc.ido(m.fotozas_idopont));
        } else if (m.statusz === "szerzodes") {
            j.push(I18n.t("mdCst_" + (m.szerzodes_allapot || "tervezet")));
            if (m.szerzodes_mod) j.push(I18n.t("dk_mod_" + m.szerzodes_mod));
        }
        if (m.olvasatlan) j.push(I18n.f("dk_jUzenet", { n: m.olvasatlan }));
        return j.slice(0, 3);
    }

    static tablazat(lista) {
        const esc = Utils.escape;
        return `
            <div class="table-responsive mdTableWrap">
                <table class="table table-hover align-middle mdTable mb-0">
                    <thead><tr>
                        <th>${I18n.t("mdColMandate")}</th>
                        <th>${I18n.t("szk_cim")}</th>
                        <th>${I18n.t("dk_kovetkezo")}</th>
                        <th class="d-none d-md-table-cell">${I18n.t("mdResponsible")}</th>
                        <th class="text-end">${I18n.t("mdColPrice")}</th>
                        <th class="d-none d-lg-table-cell">${I18n.t("mdColUpdated")}</th>
                    </tr></thead>
                    <tbody>${lista.map(m => {
                        const k = m.kovetkezo || {};
                        return `
                        <tr data-md-go="${m.id}" data-md-ful="${esc(k.ful || "")}" tabindex="0" role="link">
                            <td class="mdCellMain">
                                <b>${esc(m.cim || m.nev || m.fiok_nev || "–")}</b>
                                <div class="small text-body-secondary">${esc(m.szerzodes_szam || "")} · ${esc(Types.label(m.tipus))} · ${esc(m.nev || m.fiok_nev || "")}</div>
                            </td>
                            <td><span class="badge mbBadge mb-${esc(m.statusz)}">${esc(MandateDesk.szakaszNev(m.statusz))}</span></td>
                            <td class="small"><span class="dkNext sz-${esc(k.szint || "info")}">${esc(k.kod ? MandateDesk.kovSzoveg(k) : "–")}</span></td>
                            <td class="d-none d-md-table-cell small">${esc(m.felelos_nev || "–")}</td>
                            <td class="text-end text-nowrap small">
                                ${m.kert_ar ? esc(Svc.penz(m.kert_ar, m.penznem)) : "–"}
                                ${m.legjobb_ajanlat ? `<div class="text-body-secondary"><i class="fa-solid fa-trophy" aria-hidden="true"></i> ${esc(Svc.penz(m.legjobb_ajanlat, m.penznem))}</div>` : ""}
                            </td>
                            <td class="d-none d-lg-table-cell small text-body-secondary text-nowrap">${esc(Utils.ago(m.updated_at))}</td>
                        </tr>`;
                    }).join("")}</tbody>
                </table>
            </div>`;
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
        MandateDesk.reszlet(MandateDesk.akt.id, ful);
        if (typeof AdminManager !== "undefined") AdminManager.refreshPendingCount();
    }

    static ment(adat, uzenet) {
        return MandateDesk.api("/" + MandateDesk.akt.id, { method: "PUT", body: adat })
            .then(() => { MandateDesk.jelez(uzenet || I18n.t("adsSaved")); MandateDesk.frissit(); })
            .catch(e => MandateDesk.hiba(e));
    }

    static lepes(mit, megerosit) {
        if (megerosit && !confirm(megerosit)) return Promise.resolve();
        return MandateDesk.api(`/${MandateDesk.akt.id}/lepes/${mit}`, { method: "POST" })
            .then(() => { MandateDesk.jelez(I18n.t("mdDone")); MandateDesk.frissit(); })
            .catch(e => MandateDesk.hiba(e));
    }

    // Az alapértelmezett fül a szakasz szerint
    static alapFul(m) {
        return { uj: "csomag", egyeztetes: "csomag", szerzodes: "szerzodes", fotozas: "csomag", hirdetes: "vevok", targyalas: "vevok", adasvetel: "szerzodes", eladva: "szerzodes" }[m.statusz] || "uzenetek";
    }

    static rajzolReszlet(ful) {

        const m = MandateDesk.akt;
        const esc = Utils.escape;
        const box = MandateDesk.box;
        const kezel = m.jog.kezel;
        if (!ful || !MandateDesk.FULEK.some(f => f.k === ful)) ful = MandateDesk.alapFul(m);

        const nyitottAj = m.ajanlatok.filter(a => ["uj", "tovabbitva", "ellenajanlat"].includes(a.statusz)).length;
        const szamlalo = {
            vevok: m.ajanlat_uj + m.ellen_tovabbitando,
            megtekintesek: m.megtekintes_lezarando + m.varolista_db,
            szerzodes: (m.szerzodes_allapot === "elfogadva" ? 1 : 0) + (m.irat_uj || 0),
            uzenetek: m.olvasatlan
        };
        const lezart = MandateDesk.LEZART.includes(m.statusz);

        box.innerHTML = `
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <button type="button" class="btn btn-link px-0" id="mdBack"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${I18n.t("adminTabMandates")}</button>
                <span class="ms-auto small text-body-secondary">${esc(m.szerzodes_szam || "")} · ${esc(Svc.nap(m.created_at))}</span>
            </div>

            <section class="card dkHead mb-3">
                <div class="card-body">
                    <div class="dkHeadTop">
                        <div class="dkHeadKep" aria-hidden="true">${m.elso_kep ? `<img src="/api/kepek/${m.elso_kep}" alt="" loading="lazy">` : `<i class="fa-solid fa-house"></i>`}</div>
                        <div class="dkHeadSzoveg">
                            <h4 class="mb-1">${esc(m.cim || MandateDesk.hely(m))} <span class="dkHeadTipus">· ${esc(Types.label(m.tipus))}${m.szobak ? ", " + esc(I18n.f("dk_szoba", { n: m.szobak })) : ""}${m.nm ? ", " + esc(Utils.nm(m.nm)) : ""}</span></h4>
                            <div class="dkHeadAdat">
                                ${m.varos ? `<span>${esc([m.telepules, CityManager.displayName(m.varos)].filter(Boolean).join(", "))}</span>` : ""}
                                <span>${I18n.t("sfPrice")}: <b>${m.kert_ar ? esc(Svc.penz(m.kert_ar, m.penznem)) : "–"}</b></span>
                                <span>${I18n.t("ki_elado")}: <b>${esc(m.nev || m.fiok_nev || "–")}</b> ${m.telefon ? MandateDesk.tel(m.telefon) : ""}</span>
                                <span>${I18n.t("mdResponsible")}: <b>${esc(m.felelos_nev || "–")}</b></span>
                                ${m.bemutato_nev ? `<span>${I18n.t("mdPresenter")}: <b>${esc(m.bemutato_nev)}</b></span>` : ""}
                                ${m.latogatas ? `<span><i class="fa-regular fa-eye" aria-hidden="true"></i> ${I18n.f("dk_latogatas", { n: m.latogatas })}</span>` : ""}
                            </div>
                        </div>
                        <div class="dkHeadGombok">
                            ${m.hirdetes ? `<a class="btn btn-sm btn-outline-secondary" href="#listing/${m.hirdetes.id}"><i class="fa-solid fa-rectangle-list" aria-hidden="true"></i> ${I18n.t(m.hirdetes.statusz === "elonezet" ? "dk_elonezet" : "dk_hirdetesNyit")}</a>` : ""}
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-md-ful-go="uzenetek"><i class="fa-regular fa-comments" aria-hidden="true"></i> ${I18n.t("mdMessageSeller")}</button>
                            ${kezel ? `
                            <select class="form-select form-select-sm w-auto" id="mdStMas" aria-label="${esc(I18n.t("dk_kezi"))}">
                                <option value="">${I18n.t("dk_kezi")}</option>
                                ${[...MandateDesk.SZAKASZOK, ...MandateDesk.LEZART].filter(s => s !== m.statusz).map(s => `<option value="${s}">${esc(MandateDesk.szakaszNev(s))}</option>`).join("")}
                            </select>` : ""}
                        </div>
                    </div>
                    ${lezart ? `<div class="dkLezartJel mt-3"><span class="badge mbBadge mb-${esc(m.statusz)}">${esc(MandateDesk.szakaszNev(m.statusz))}</span>${m.eladva ? ` ${esc(Svc.nap(m.eladva))}` : ""}${m.eladasi_ar ? ` · ${esc(Svc.penz(m.eladasi_ar, m.penznem))}` : ""}</div>` : MandateDesk.sav(m.statusz)}
                    ${MandateDesk.kovetkezoSav(m)}
                </div>
            </section>

            ${!kezel ? `<div class="alert alert-light small py-2"><i class="fa-regular fa-eye" aria-hidden="true"></i> ${I18n.t("mdReadOnly")}</div>` : ""}

            <nav class="mdTabs" role="tablist" aria-label="${esc(I18n.t("adminTabMandates"))}">
                ${MandateDesk.FULEK.map(f => `
                    <button type="button" role="tab" class="mdTab ${f.k === ful ? "active" : ""}" data-md-tab="${f.k}" aria-selected="${f.k === ful}">
                        <i class="${f.ikon}" aria-hidden="true"></i><span>${I18n.t("dk_ful_" + f.k)}</span>
                        ${szamlalo[f.k] ? `<span class="mdTabCount warn">${szamlalo[f.k]}</span>` : ""}
                    </button>`).join("")}
            </nav>

            <div id="mdFul" class="mdFul"></div>`;

        const tabs = box.querySelector(".mdTabs");
        const aktTab = tabs.querySelector(".mdTab.active");
        if (aktTab) tabs.scrollLeft = Math.max(0, aktTab.offsetLeft - tabs.offsetLeft - 24);

        const fulre = f => {
            history.replaceState(null, "", `${MandateDesk.base}/${m.id}/${f}`);
            MandateDesk.rajzolReszlet(f);
        };

        box.querySelector("#mdBack").onclick = () => MandateDesk.go(null);
        box.querySelectorAll("[data-md-tab]").forEach(b => { b.onclick = () => fulre(b.dataset.mdTab); });
        box.querySelectorAll("[data-md-ful-go]").forEach(b => { b.onclick = () => fulre(b.dataset.mdFulGo); });
        const mas = box.querySelector("#mdStMas");
        if (mas) mas.onchange = e => {
            const s = e.target.value;
            if (!s) return;
            const kerdes = s === "eladva" ? I18n.t("mdSoldConfirm") : MandateDesk.LEZART.includes(s) ? I18n.t("mdCloseConfirm") : I18n.f("dk_keziConfirm", { nev: MandateDesk.szakaszNev(s) });
            if (confirm(kerdes)) MandateDesk.ment({ statusz: s });
            else e.target.value = "";
        };

        MandateDesk.kotKovetkezo(box, m);

        const hova = box.querySelector("#mdFul");
        ({
            vevok: MandateDesk.fulVevok, megtekintesek: MandateDesk.fulMegtekintesek, szerzodes: MandateDesk.fulSzerzodes,
            csomag: MandateDesk.fulCsomag, uzenetek: MandateDesk.fulUzenetek
        })[ful](hova, m);

        // Fülváltó gombok a tartalomban
        hova.querySelectorAll("[data-md-ful-go]").forEach(b => { b.onclick = () => fulre(b.dataset.mdFulGo); });

        void nyitottAj;

    }

    // ---------- A következő lépés sávja ----------

    static kovetkezoSav(m) {

        const esc = Utils.escape;
        const k = m.kovetkezo || {};
        if (!k.kod || ["lezart", "kesz"].includes(k.kod)) return "";
        const kezel = m.jog.kezel;
        const ki = MandateDesk.kiNev(k, m);
        const masra = ["elado", "vevo"].includes(k.ki);
        const leiras = I18n.t("kovL_" + k.kod) !== "kovL_" + k.kod ? I18n.f("kovL_" + k.kod, { n: k.n || 0 }) : "";
        const gomb = (mit, cimke, cls = "btn-primary", extra = "") => kezel ? `<button type="button" class="btn ${cls}" data-kov="${mit}" ${extra}>${cimke}</button>` : "";
        const fulGomb = (ful, cimke) => `<button type="button" class="btn btn-outline-secondary" data-md-ful-go="${ful}">${cimke}</button>`;
        let gombok = "";
        let extra = "";

        switch (k.kod) {
            case "felelos_kell":
                extra = kezel ? `
                    <select class="form-select w-auto" id="kovFelelos" aria-label="${esc(I18n.t("mdResponsible"))}">
                        <option value="">${I18n.t("dk_valassz")}</option>
                        ${m.munkatarsak.map(u => `<option value="${u.id}">${esc(u.nev)} (${esc(I18n.t("tmRole_" + u.szerep))})</option>`).join("")}
                    </select>` : "";
                gombok = gomb("elso_hivas", `<i class="fa-solid fa-phone" aria-hidden="true"></i> ${I18n.t("kovG_elso_hivas")}`, "btn-outline-primary");
                break;
            case "elso_hivas":
                gombok = (m.telefon ? `<a class="btn btn-outline-primary" href="tel:${esc(String(m.telefon).replace(/\s/g, ""))}"><i class="fa-solid fa-phone" aria-hidden="true"></i> ${esc(m.telefon)}</a>` : "") + gomb("elso_hivas", `<i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("kovG_elso_hivas")}`);
                break;
            case "csomag_kuld":
                gombok = fulGomb("csomag", I18n.t("kovG_csomag_nez")) + gomb("csomag_kuld", `<i class="fa-regular fa-paper-plane" aria-hidden="true"></i> ${I18n.t("kovG_csomag_kuld")}`) + gomb("csomag_ok", I18n.t("kovG_tel_ok"), "btn-outline-secondary");
                break;
            case "csomag_var":
                gombok = fulGomb("uzenetek", I18n.t("kovG_emlekeztet")) + gomb("csomag_ok", I18n.t("kovG_tel_ok"), "btn-outline-secondary");
                break;
            case "szerzodes_kuld":
                gombok = gomb("szerzodes_kuld", `<i class="fa-regular fa-paper-plane" aria-hidden="true"></i> ${I18n.t("mdSendContract")}`);
                break;
            case "szerzodes_var":
            case "szemelyes_alairas":
                gombok = `<a class="btn btn-outline-secondary" href="/api/megbizas/${m.id}/szerzodes" target="_blank" rel="noopener">${I18n.t("mbOpenContract")}</a>` + (kezel ? `<button type="button" class="btn ${k.kod === "szemelyes_alairas" ? "btn-primary" : "btn-outline-primary"}" data-kov="feltolt_szerzodes"><i class="fa-solid fa-upload" aria-hidden="true"></i> ${I18n.t("kovG_szkennelt")}</button>` : "");
                if (m.szemelyes_javaslat) extra = `<span class="small">${I18n.t("el_szemJav")}: <b>${esc(m.szemelyes_javaslat)}</b></span>`;
                break;
            case "ellenjegyzes":
                gombok = `<a class="btn btn-outline-secondary" href="/api/megbizas/${m.id}/szerzodes" target="_blank" rel="noopener">${I18n.t("mbOpenContract")}</a>` + gomb("ellenjegyez", `<i class="fa-solid fa-signature" aria-hidden="true"></i> ${I18n.t("kovG_ellenjegyez")}`);
                break;
            case "feladat":
                extra = MandateDesk.feladatPipak(m, kezel || m.fotos_id);
                gombok = fulGomb("csomag", I18n.t("kovG_elokeszites"));
                break;
            case "hirdetes_keszit":
                gombok = kezel ? `<button type="button" class="btn btn-primary" data-kov="hird_uj"><i class="fa-solid fa-circle-plus" aria-hidden="true"></i> ${I18n.t("mbCreateListing")}</button>` + fulGomb("csomag", I18n.t("kovG_hird_kapcsol")) : "";
                break;
            case "hirdetes_kuld":
                gombok = (m.hirdetes ? `<a class="btn btn-outline-secondary" href="#listing/${m.hirdetes.id}">${I18n.t("dk_elonezet")}</a>` : "") + gomb("hirdetes_kuld", `<i class="fa-regular fa-paper-plane" aria-hidden="true"></i> ${I18n.t("kovG_hird_kuld")}`) + gomb("hirdetes_ok", I18n.t("kovG_tel_ok"), "btn-outline-secondary");
                break;
            case "hirdetes_var":
                gombok = (m.hirdetes ? `<a class="btn btn-outline-secondary" href="#listing/${m.hirdetes.id}">${I18n.t("dk_elonezet")}</a>` : "") + gomb("hirdetes_ok", I18n.t("kovG_tel_ok"), "btn-outline-secondary");
                break;
            case "naptar_beallit":
            case "megtekintes_lezar":
            case "varolista":
                gombok = fulGomb("megtekintesek", I18n.t("kovG_megtekintesek")) + `<a class="btn btn-outline-secondary" href="#admin/naptar">${I18n.t("nt_megnyit")}</a>`;
                break;
            case "ajanlat_jovahagy":
            case "ellen_tovabbit": {
                const a = m.ajanlatok.find(x => k.kod === "ajanlat_jovahagy" ? x.statusz === "uj" : x.statusz === "ellenajanlat" && !x.ellen_vevonek);
                if (a) {
                    extra = `<span class="small">${esc(I18n.f("dk_vevoSzam", { n: a.vevo_szam || "?" }))} · ${esc(a.erdeklodo_nev || "")} · <b>${esc(Svc.penz(k.kod === "ellen_tovabbit" ? a.ellenajanlat : a.osszeg, a.penznem))}</b> · ${esc(MandateDesk.finSzoveg(a))}${a.foglalo ? " · " + esc(I18n.f("aj_foglaloRov", { osszeg: Svc.penz(a.foglalo, a.penznem) })) : ""}${a.ervenyes_ig ? " · " + esc(I18n.f("aj_ervenyesRov", { ido: Svc.ido(a.ervenyes_ig) })) : ""}</span>`;
                    gombok = kezel ? (k.kod === "ajanlat_jovahagy"
                        ? `<button type="button" class="btn btn-primary" data-kov-aj="${a.id}:tovabbit"><i class="fa-solid fa-share" aria-hidden="true"></i> ${I18n.t("mdForwardSeller")}</button>
                           <button type="button" class="btn btn-outline-secondary" data-kov-szal="${a.erdeklodo_id}">${I18n.t("kovG_visszakerdez")}</button>
                           <button type="button" class="btn btn-outline-danger" data-kov-aj="${a.id}:elutasit">${I18n.t("mdRejectOffer")}</button>`
                        : `<button type="button" class="btn btn-primary" data-kov-aj="${a.id}:ellen_tovabbit"><i class="fa-solid fa-reply" aria-hidden="true"></i> ${I18n.t("mdForwardBuyer")}</button>`) : "";
                }
                break;
            }
            case "elado_valasz":
            case "vevo_valasz":
                gombok = fulGomb("vevok", I18n.t("kovG_ajanlatok")) + fulGomb("uzenetek", I18n.t("kovG_emlekeztet"));
                break;
            case "eloszerzodes":
            case "kozjegyzo_idopont":
            case "iratok":
                gombok = fulGomb("szerzodes", I18n.t("kovG_adasvetel"));
                break;
            case "kozjegyzo_alairas":
                gombok = fulGomb("szerzodes", I18n.t("kovG_adasvetel")) + gomb("kozjegyzo_kesz", `<i class="fa-solid fa-handshake" aria-hidden="true"></i> ${I18n.t("kovG_kozjegyzo_kesz")}`, "btn-success");
                break;
            case "dijbekero":
                gombok = kezel ? `<button type="button" class="btn btn-primary" data-kov="dijbekero"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${I18n.t("mbMakeProforma")}</button>` : "";
                break;
            default:
                break;
        }

        const semleges = ["vevokre_var", "ajanlatra_var"].includes(k.kod);

        return `
            <div class="dkKov sz-${esc(semleges ? "info" : masra ? "var" : k.szint)}">
                <div class="dkKovSzoveg">
                    <span class="dkKovCimke">${I18n.t(semleges ? "dk_nincsTeendo" : masra ? "dk_varunk" : "dk_kovetkezoLepes")}${ki ? " · " + esc(ki) : ""}${k.datum ? " · " + esc(Svc.ido(k.datum)) : ""}</span>
                    <b>${esc(MandateDesk.kovSzoveg(k))}</b>
                    ${leiras ? `<span class="small">${esc(leiras)}</span>` : ""}
                    ${extra}
                </div>
                ${gombok ? `<div class="dkKovGombok">${gombok}</div>` : ""}
            </div>`;
    }

    static kotKovetkezo(box, m) {
        box.querySelectorAll("[data-kov]").forEach(b => {
            b.onclick = () => {
                const mit = b.dataset.kov;
                if (mit === "hird_uj") return MandateDesk.hirdetesFelad(m);
                if (mit === "feltolt_szerzodes") return MandateDesk.szerzodesFeltolt(m);
                if (mit === "dijbekero") return MandateDesk.dijbekero(m);
                if (mit === "szerzodes_kuld") {
                    if (!confirm(I18n.t("mdSendContractConfirm"))) return;
                    return MandateDesk.api(`/${m.id}/szerzodes-kuld`, { method: "POST" }).then(() => { MandateDesk.jelez(I18n.t("mdSent")); MandateDesk.frissit(); }).catch(e => MandateDesk.hiba(e));
                }
                const kerdes = { csomag_ok: I18n.t("kovQ_tel_ok"), hirdetes_ok: I18n.t("kovQ_tel_ok"), kozjegyzo_kesz: I18n.t("kovQ_kozjegyzo_kesz"), ellenjegyez: I18n.t("kovQ_ellenjegyez"), csomag_kuld: I18n.t("kovQ_csomag_kuld"), hirdetes_kuld: I18n.t("kovQ_hirdetes_kuld") }[mit];
                b.disabled = true;
                const sel = box.querySelector("#kovFelelos");
                const elotte = sel && sel.value ? MandateDesk.api("/" + m.id, { method: "PUT", body: { felelos_id: Number(sel.value) } }) : Promise.resolve();
                elotte.then(() => MandateDesk.lepes(mit, kerdes)).finally(() => { b.disabled = false; });
            };
        });
        const fel = box.querySelector("#kovFelelos");
        if (fel) fel.onchange = () => { if (fel.value) MandateDesk.ment({ felelos_id: Number(fel.value) }, I18n.t("mdAssigned")); };
        box.querySelectorAll("[data-kov-aj]").forEach(b => {
            b.onclick = () => { const [aid, muv] = b.dataset.kovAj.split(":"); MandateDesk.ajanlatMuvelet(m, Number(aid), muv, b); };
        });
        box.querySelectorAll("[data-kov-szal]").forEach(b => {
            b.onclick = () => {
                MandateDesk.szal = Number(b.dataset.kovSzal);
                history.replaceState(null, "", `${MandateDesk.base}/${m.id}/uzenetek`);
                MandateDesk.rajzolReszlet("uzenetek");
            };
        });
        MandateDesk.kotFeladat(box, m);
    }

    // Az előkészítés feladatai pipálható listaként (a fotós is jelölheti)
    static feladatPipak(m, szerk) {
        const esc = Utils.escape;
        const l = m.feladatok_lista || [];
        if (!l.length) return `<span class="small">${I18n.t("dk_nincsFeladat")}</span>`;
        return `<div class="dkPipak">${l.map(f => `
            <label class="dkPipa ${f.kesz ? "kesz" : ""}">
                <input type="checkbox" class="form-check-input" data-feladat="${esc(f.kod)}" ${f.kesz ? "checked" : ""} ${szerk ? "" : "disabled"}>
                <span>${esc(I18n.t("fel_" + f.kod))}${f.kesz && f.datum ? ` <small>· ${esc(Svc.nap(f.datum))}</small>` : ""}</span>
            </label>`).join("")}</div>`;
    }

    static kotFeladat(box, m) {
        box.querySelectorAll("[data-feladat]").forEach(c => {
            c.onchange = () => {
                c.disabled = true;
                MandateDesk.api(`/${m.id}/feladat`, { method: "POST", body: { kod: c.dataset.feladat, kesz: c.checked } })
                    .then(() => { MandateDesk.jelez(I18n.t("adsSaved")); MandateDesk.frissit(); })
                    .catch(e => { c.disabled = false; c.checked = !c.checked; MandateDesk.hiba(e); });
            };
        });
    }

    static finSzoveg(a) {
        if (!a.finanszirozas) return I18n.t("aj_finNincs");
        let s = I18n.t("lmFin_" + a.finanszirozas);
        if (a.hitel_allapot) s += " · " + I18n.t("aj_hitel_" + a.hitel_allapot);
        if (a.igazolas_id) s += " · " + I18n.t("aj_igazolasVan");
        return s;
    }

    static ajanlatMuvelet(m, aid, muv, b) {
        const a = m.ajanlatok.find(x => x.id === aid);
        let body = {};
        if (muv === "tovabbit" && !confirm(I18n.f("mbForwardConfirm", { osszeg: Svc.penz(a.osszeg, a.penznem) }))) return;
        if (muv === "ellen_tovabbit" && !confirm(I18n.f("mdForwardBuyerConfirm", { osszeg: Svc.penz(a.ellenajanlat, a.penznem) }))) return;
        if (muv === "elutasit") {
            if (!confirm(I18n.t("mdRejectConfirm"))) return;
            body = { ertesit: confirm(I18n.t("mdRejectNotify")) };
        }
        if (b) b.disabled = true;
        MandateDesk.api(`/${m.id}/ajanlatok/${aid}/${muv}`, { method: "POST", body })
            .then(() => { MandateDesk.jelez(I18n.t("mdDone")); MandateDesk.frissit(); })
            .catch(e => { if (b) b.disabled = false; MandateDesk.hiba(e); });
    }

    // ---------- Vevők és ajánlatok ----------

    // A vevő hol tart: erdeklodo | idopont | megnezte | ajanlat | vevo | elutasitva
    static vevoLepcso(e, m) {
        if (e.statusz === "vevo") return "vevo";
        if (e.statusz === "elutasitva") return "elutasitva";
        if (m.ajanlatok.some(a => a.erdeklodo_id === e.id && !["visszavonva"].includes(a.statusz))) return "ajanlat";
        if (e.megnezte) return "megnezte";
        if (m.megtekintesek.some(t => t.erdeklodo_id === e.id && ["egyeztetve", "kert"].includes(t.statusz))) return "idopont";
        return "erdeklodo";
    }

    static fulVevok(hova, m) {

        const esc = Utils.escape;
        const kezel = m.jog.kezel;
        const LEPCSO = ["erdeklodo", "idopont", "megnezte", "ajanlat", "vevo"];
        const vevok = m.erdeklodok.map(e => ({ ...e, lepcso: MandateDesk.vevoLepcso(e, m) }));
        const db = k => vevok.filter(e => e.lepcso === k).length;
        const szuro = MandateDesk.vevoSzuro;
        const lista = vevok.filter(e => szuro === "mind" || e.lepcso === szuro)
            .sort((a, b) => LEPCSO.indexOf(b.lepcso) - LEPCSO.indexOf(a.lepcso) || b.id - a.id);
        const utolsoMegt = e => m.megtekintesek.filter(t => t.erdeklodo_id === e.id).sort((a, b) => new Date(b.idopont || 0) - new Date(a.idopont || 0))[0];
        const utolsoAj = e => m.ajanlatok.filter(a => a.erdeklodo_id === e.id && a.statusz !== "visszavonva")[0];
        const olvasatlan = e => m.uzenetek.filter(z => z.erdeklodo_id === e.id && z.irany === "be" && !z.olvasva).length;

        const sorrend = { uj: 0, ellenajanlat: 1, tovabbitva: 2, elfogadva: 3, lejart: 7, elutasitva: 8, visszavonva: 9 };
        const ajanlatok = [...m.ajanlatok].filter(a => a.statusz !== "visszavonva").sort((a, b) => (sorrend[a.statusz] ?? 5) - (sorrend[b.statusz] ?? 5) || new Date(b.created_at) - new Date(a.created_at));
        const max = Math.max(0, ...ajanlatok.filter(a => !["elutasitva", "lejart"].includes(a.statusz)).map(a => a.vegso_osszeg || a.osszeg));
        const hol = a => {
            if (a.statusz === "uj") return { k: "nalunk", c: "warning" };
            if (a.statusz === "tovabbitva") return { k: "eladonal", c: "info" };
            if (a.statusz === "ellenajanlat") return a.ellen_vevonek ? { k: "vevonel", c: "info" } : { k: "nalunk_ellen", c: "warning" };
            if (a.statusz === "elfogadva") return { k: "megallapodas", c: "success" };
            if (a.statusz === "lejart") return { k: "lejart", c: "secondary" };
            return { k: "lezarva", c: "secondary" };
        };

        hova.innerHTML = `
            <div class="alert ${m.mod === "azonnal" ? "alert-info" : "alert-light"} small d-flex flex-wrap gap-2 align-items-start">
                <i class="fa-solid ${m.mod === "azonnal" ? "fa-bolt" : "fa-user-check"} mt-1" aria-hidden="true"></i>
                <div class="flex-fill"><b>${esc(I18n.t("mdMode_" + m.mod))}</b> – ${esc(I18n.t("mdModeHelp_" + m.mod))} · ${esc(I18n.t("dk_ajFelt_" + (m.ajanlat_feltetel || "megtekintes_utan")))}</div>
                ${kezel ? `<button type="button" class="btn btn-link btn-sm p-0" data-md-ful-go="csomag">${I18n.t("mdChange")}</button>` : ""}
            </div>
            <div class="row g-4">
                <div class="col-xl-8">
                    <section class="card">
                        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                            <h5 class="mb-0">${I18n.t("dk_vevok")}</h5>
                            <div class="d-flex flex-wrap gap-1" role="group" aria-label="${esc(I18n.t("dk_szures"))}">
                                <button type="button" class="btn btn-sm ${szuro === "mind" ? "btn-dark" : "btn-outline-secondary"}" data-vsz="mind">${I18n.t("dk_mind")} ${vevok.length}</button>
                                ${LEPCSO.map(k => `<button type="button" class="btn btn-sm ${szuro === k ? "btn-dark" : "btn-outline-secondary"}" data-vsz="${k}">${I18n.t("vl_" + k)} ${db(k)}</button>`).join("")}
                            </div>
                        </div>
                        <div class="card-body">
                            ${lista.length ? `
                            <div class="table-responsive">
                                <table class="table align-middle dkVevoTabla mb-0">
                                    <thead><tr>
                                        <th>${I18n.t("dk_vevo")}</th><th>${I18n.t("dk_holTart")}</th><th>${I18n.t("dk_megtekintes")}</th>
                                        <th>${I18n.t("dk_ajanlat")}</th><th>${I18n.t("lmFinancing")}</th><th><span class="visually-hidden">${I18n.t("dk_muvelet")}</span></th>
                                    </tr></thead>
                                    <tbody>${lista.map(e => {
                                        const t = utolsoMegt(e);
                                        const a = utolsoAj(e);
                                        return `
                                        <tr>
                                            <td><b>${esc(I18n.f("dk_vevoSzam", { n: e.sorszam || e.id }))} · ${esc(e.nev || "–")}</b>
                                                <div class="small">${MandateDesk.tel(e.telefon)}${e.telefon && e.email ? " · " : ""}${e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : ""}</div>
                                                ${e.ajanlat_engedve ? `<span class="badge text-bg-light">${I18n.t("dk_ajanlatEngedve")}</span>` : ""}</td>
                                            <td><span class="vlChip vl-${e.lepcso}">${esc(I18n.t("vl_" + e.lepcso))}</span></td>
                                            <td class="small">${t ? `${t.idopont ? esc(Svc.ido(t.idopont)) : esc(t.javasolt || I18n.t("mbNoTimeYet"))}<div class="text-body-secondary">${esc(I18n.t("mbVw_" + t.statusz))}${t.visszajelzes ? " · „" + esc(t.visszajelzes.slice(0, 60)) + "”" : ""}</div>` : "–"}</td>
                                            <td><b>${a ? esc(Svc.penz(a.vegso_osszeg || a.osszeg, a.penznem)) : "–"}</b>${a ? `<div class="small text-body-secondary">${esc(I18n.t("mbOf_" + a.statusz))}</div>` : ""}</td>
                                            <td class="small">${a ? esc(MandateDesk.finSzoveg(a)) : e.finanszirozas ? esc(I18n.t("lmFin_" + e.finanszirozas)) : "–"}</td>
                                            <td class="text-end text-nowrap">
                                                <button type="button" class="btn btn-sm btn-outline-secondary" data-md-szal="${e.id}" title="${esc(I18n.t("mdMessage"))}" aria-label="${esc(I18n.t("mdMessage"))}"><i class="fa-regular fa-comments" aria-hidden="true"></i>${olvasatlan(e) ? ` <span class="badge text-bg-danger">${olvasatlan(e)}</span>` : ""}</button>
                                                ${kezel ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-md-szerk="erdeklodok:${e.id}" title="${esc(I18n.t("detailEdit"))}" aria-label="${esc(I18n.t("detailEdit"))}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>` : ""}
                                            </td>
                                        </tr>`;
                                    }).join("")}</tbody>
                                </table>
                            </div>` : `<p class="text-body-secondary mb-0">${I18n.t("mbNoInterested")}</p>`}
                            ${kezel ? `<div class="d-flex flex-wrap gap-2 mt-3">
                                <button type="button" class="btn btn-sm btn-outline-primary" data-md-uj="erdeklodok"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${I18n.t("mdAddBuyer")}</button>
                                <button type="button" class="btn btn-sm btn-outline-primary" data-md-uj="ajanlatok"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("mdAddOffer")}</button>
                            </div>` : ""}
                        </div>
                    </section>

                    ${m.regi_uzenetek && m.regi_uzenetek.length ? `
                    <section class="card mt-4">
                        <div class="card-header"><h6 class="mb-0">${I18n.t("mbListingMessages")}</h6></div>
                        <div class="card-body">
                            ${m.regi_uzenetek.map(u => `
                                <div class="mbMsg">
                                    <div class="flex-fill"><b>${esc(u.nev || "–")}</b> <span class="small text-body-secondary">${esc(Svc.ido(u.created_at))}</span><div class="small mbClamp">${esc(u.szoveg)}</div></div>
                                    ${u.felveve ? `<span class="badge text-bg-success">${I18n.t("mbAdded")}</span>` : kezel ? `<button type="button" class="btn btn-sm btn-outline-primary" data-md-felvesz="${u.felado_id}">${I18n.t("mbAddAsInterested")}</button>` : ""}
                                </div>`).join("")}
                        </div>
                    </section>` : ""}
                </div>

                <div class="col-xl-4">
                    <section class="card">
                        <div class="card-header"><h5 class="mb-0">${I18n.t("dk_ajanlatokEgymasMellett")}</h5></div>
                        <div class="card-body d-flex flex-column gap-2">
                            ${ajanlatok.length ? ajanlatok.map(a => {
                                const h = hol(a);
                                const osszeg = a.vegso_osszeg || a.osszeg;
                                return `
                                <article class="dkAj st-${esc(a.statusz)} ${osszeg === max && max ? "legjobb" : ""}">
                                    <div class="d-flex justify-content-between align-items-baseline gap-2">
                                        <span class="fs-5 fw-bold">${esc(Svc.penz(a.osszeg, a.penznem))}</span>
                                        ${m.kert_ar ? `<span class="small text-body-secondary">${esc(MandateDesk.szazalek(a.osszeg, m.kert_ar))} ${I18n.t("dk_kerthez")}</span>` : ""}
                                    </div>
                                    <div class="small">${esc(I18n.f("dk_vevoSzam", { n: a.vevo_szam || "?" }))} · ${esc(a.erdeklodo_nev || "")}${a.megnezte ? ` · <i class="fa-solid fa-eye" aria-hidden="true"></i>` : ""}</div>
                                    <div class="small">${esc(MandateDesk.finSzoveg(a))}${a.onero ? " · " + esc(I18n.f("aj_oneroRov", { osszeg: Svc.penz(a.onero, a.penznem) })) : ""}${a.hitel_osszeg ? " · " + esc(I18n.f("aj_hitelRov", { osszeg: Svc.penz(a.hitel_osszeg, a.penznem) })) : ""}</div>
                                    <div class="small text-body-secondary">${a.foglalo ? esc(I18n.f("aj_foglaloRov", { osszeg: Svc.penz(a.foglalo, a.penznem) })) + " · " : ""}${a.eloszerzodes_ig ? esc(I18n.f("aj_eloRov", { datum: Svc.nap(a.eloszerzodes_ig) })) + " · " : ""}${a.kozjegyzo_ig ? esc(I18n.f("aj_kozRov", { datum: Svc.nap(a.kozjegyzo_ig) })) : ""}</div>
                                    ${a.ervenyes_ig && ["uj", "tovabbitva"].includes(a.statusz) ? `<div class="small">${esc(I18n.f("aj_ervenyesRov", { ido: Svc.ido(a.ervenyes_ig) }))}</div>` : ""}
                                    ${a.feltetelek ? `<div class="small text-body-secondary">„${esc(a.feltetelek)}”</div>` : ""}
                                    ${a.ellenajanlat ? `<div class="small">${I18n.t("mmCounter")}: <b>${esc(Svc.penz(a.ellenajanlat, a.penznem))}</b></div>` : ""}
                                    ${a.elado_valasz ? `<div class="mbSeller small"><i class="fa-solid fa-user-tag" aria-hidden="true"></i> „${esc(a.elado_valasz)}”</div>` : ""}
                                    <div class="d-flex flex-wrap gap-1 align-items-center mt-1">
                                        <span class="badge text-bg-${h.c}">${esc(I18n.t("mdWhere_" + h.k))}</span>
                                        ${a.igazolas_id ? `<a class="small" href="/api/megbizas/fajl/${a.igazolas_id}" target="_blank" rel="noopener"><i class="fa-solid fa-paperclip" aria-hidden="true"></i> ${I18n.t("aj_igazolas")}</a>` : ""}
                                    </div>
                                    ${kezel ? `
                                    <div class="d-flex flex-wrap gap-1 mt-2">
                                        ${a.statusz === "uj" ? `
                                            <button type="button" class="btn btn-sm btn-success" data-md-aj="${a.id}:tovabbit"><i class="fa-solid fa-share" aria-hidden="true"></i> ${I18n.t("mdForwardSeller")}</button>
                                            <button type="button" class="btn btn-sm btn-outline-danger" data-md-aj="${a.id}:elutasit">${I18n.t("mdRejectOffer")}</button>` : ""}
                                        ${a.statusz === "ellenajanlat" && !a.ellen_vevonek ? `<button type="button" class="btn btn-sm btn-success" data-md-aj="${a.id}:ellen_tovabbit"><i class="fa-solid fa-reply" aria-hidden="true"></i> ${I18n.t("mdForwardBuyer")}</button>` : ""}
                                        ${["tovabbitva", "ellenajanlat"].includes(a.statusz) ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-md-aj="${a.id}:elutasit">${I18n.t("mdCloseOffer")}</button>` : ""}
                                        <button type="button" class="btn btn-sm btn-link ms-auto" data-md-szerk="ajanlatok:${a.id}">${I18n.t("detailEdit")}</button>
                                    </div>` : ""}
                                </article>`;
                            }).join("") : `<p class="text-body-secondary small mb-0">${I18n.t("mbNoOffers")}</p>`}
                        </div>
                    </section>
                </div>
            </div>`;

        hova.querySelectorAll("[data-vsz]").forEach(b => {
            b.onclick = () => { MandateDesk.vevoSzuro = b.dataset.vsz; MandateDesk.fulVevok(hova, m); };
        });
        hova.querySelectorAll("[data-md-szal]").forEach(b => {
            b.onclick = () => {
                MandateDesk.szal = Number(b.dataset.mdSzal);
                history.replaceState(null, "", `${MandateDesk.base}/${m.id}/uzenetek`);
                MandateDesk.rajzolReszlet("uzenetek");
            };
        });
        hova.querySelectorAll("[data-md-aj]").forEach(b => {
            b.onclick = () => { const [aid, muv] = b.dataset.mdAj.split(":"); MandateDesk.ajanlatMuvelet(m, Number(aid), muv, b); };
        });
        hova.querySelectorAll("[data-md-felvesz]").forEach(b => {
            b.onclick = () => {
                const u = m.regi_uzenetek.find(x => String(x.felado_id) === b.dataset.mdFelvesz);
                MandateDesk.api(`/${m.id}/erdeklodok`, { method: "POST", body: { nev: u.nev || "–", email: u.email, telefon: u.telefon, user_id: u.felado_id, megjegyzes: u.szoveg, statusz: "kapcsolat" } })
                    .then(() => MandateDesk.frissit()).catch(e => MandateDesk.hiba(e));
            };
        });
        hova.querySelectorAll("[data-md-ful-go]").forEach(b => {
            b.onclick = () => { history.replaceState(null, "", `${MandateDesk.base}/${m.id}/${b.dataset.mdFulGo}`); MandateDesk.rajzolReszlet(b.dataset.mdFulGo); };
        });
        MandateDesk.kotSzerk(hova, m);

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
        const jog = m.jog.megtekintes || m.jog.kezel;
        const most = Date.now();
        const csop = {
            lezarando: m.megtekintesek.filter(t => t.statusz === "egyeztetve" && t.idopont && new Date(t.idopont) < most - 3600 * 1000),
            kozelgo: m.megtekintesek.filter(t => t.statusz === "egyeztetve" && t.idopont && new Date(t.idopont) >= most - 3600 * 1000),
            varolista: m.megtekintesek.filter(t => t.statusz === "kert"),
            korabbi: m.megtekintesek.filter(t => ["megtortent", "elmaradt", "lemondva"].includes(t.statusz))
        };

        const sor = t => `
            <li class="ntSor st-${esc(t.statusz)}">
                <div class="d-flex flex-wrap justify-content-between gap-2">
                    <div class="min-w-0">
                        <b>${t.idopont ? esc(Svc.ido(t.idopont)) : `<span class="text-warning">${I18n.t("mbNoTimeYet")}</span>`}</b>
                        · ${esc(I18n.f("dk_vevoSzam", { n: t.vevo_szam || "?" }))} ${esc(t.erdeklodo_nev || "–")}${t.erdeklodo_telefon ? ` · ${MandateDesk.tel(t.erdeklodo_telefon)}` : ""}
                        ${t.bemutato_nev ? `<span class="small text-body-secondary"> · <i class="fa-solid fa-door-open" aria-hidden="true"></i> ${esc(t.bemutato_nev)}</span>` : ""}
                    </div>
                    <span class="badge text-bg-light align-self-start">${esc(I18n.t("mbVw_" + t.statusz))}</span>
                </div>
                ${t.javasolt ? `<div class="small text-body-secondary">${I18n.t("nt_mikorErne")}: ${esc(t.javasolt)}</div>` : ""}
                ${t.visszajelzes ? `<div class="small mt-1"><i class="fa-regular fa-comment" aria-hidden="true"></i> ${esc(t.visszajelzes)}</div>` : ""}
                ${jog ? `
                <div class="d-flex flex-wrap gap-1 mt-2">
                    ${t.statusz === "kert" ? `<button type="button" class="btn btn-sm btn-primary" data-nt-athelyez="${t.id}"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${I18n.t("nt_idopontotAd")}</button>` : ""}
                    ${t.statusz === "egyeztetve" ? `
                        <button type="button" class="btn btn-sm btn-success" data-nt-lezar="${t.id}:megtortent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("nt_megtortent")}</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-nt-lezar="${t.id}:elmaradt">${I18n.t("mbVw_elmaradt")}</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-nt-athelyez="${t.id}">${I18n.t("nt_athelyez")}</button>` : ""}
                    ${["kert", "egyeztetve"].includes(t.statusz) ? `<button type="button" class="btn btn-sm btn-link text-danger" data-nt-lemond="${t.id}">${I18n.t("nt_lemond")}</button>` : ""}
                    ${t.idopont && t.statusz === "egyeztetve" ? `<a class="btn btn-sm btn-link" href="/api/megbizas/megtekintes/${t.id}/ics">${I18n.t("nt_naptarba")}</a>` : ""}
                    ${m.jog.kezel ? `<button type="button" class="btn btn-sm btn-link ms-auto" data-md-szerk="megtekintesek:${t.id}">${I18n.t("detailEdit")}</button>` : ""}
                </div>` : ""}
            </li>`;

        const blokk = (k, ikon) => csop[k].length ? `
            <h6 class="mdGroupHead mt-3"><i class="${ikon}" aria-hidden="true"></i> ${I18n.t("nt_csop_" + k)} <span class="badge text-bg-light">${csop[k].length}</span></h6>
            <ul class="ntLista">${csop[k].map(sor).join("")}</ul>` : "";

        hova.innerHTML = `
            <div class="row g-4">
                <div class="col-xl-5">
                    <section class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">${I18n.t("nt_elerhetoseg")}</h5>
                            <a class="small" href="#admin/naptar">${I18n.t("nt_megnyit")} →</a>
                        </div>
                        <div class="card-body" id="ntSzerkHely"></div>
                    </section>
                </div>
                <div class="col-xl-7">
                    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <p class="text-body-secondary small mb-0">${I18n.t("nt_foglalasSugo")}</p>
                        ${m.jog.kezel ? `<button type="button" class="btn btn-sm btn-outline-primary" data-md-uj="megtekintesek"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${I18n.t("mdAddViewing")}</button>` : ""}
                    </div>
                    ${m.megtekintesek.length ? `
                        ${blokk("lezarando", "fa-solid fa-flag-checkered")}
                        ${blokk("varolista", "fa-solid fa-hourglass-half")}
                        ${blokk("kozelgo", "fa-regular fa-calendar-check")}
                        ${blokk("korabbi", "fa-solid fa-box-archive")}` : `<p class="text-body-secondary mt-3">${I18n.t("mbNoViewings")}</p>`}
                </div>
            </div>`;

        // Az idősávok szerkesztője (a naptár rész is ezt használja)
        NaptarSzerk.rajzol(hova.querySelector("#ntSzerkHely"), {
            naptar: m.naptar, szerk: !!jog, bemutato: m.jog.kezel ? { id: m.bemutato_id, lista: m.munkatarsak } : null,
            ment: (n, bem) => {
                const elotte = bem !== undefined && bem !== m.bemutato_id ? MandateDesk.api("/" + m.id, { method: "PUT", body: { bemutato_id: bem } }) : Promise.resolve();
                return elotte.then(() => MandateDesk.api(`/${m.id}/naptar`, { method: "PUT", body: n }))
                    .then(() => { MandateDesk.jelez(I18n.t("adsSaved")); MandateDesk.frissit(); });
            }
        });

        ViewingCalendar.kotMuveletek(hova, () => MandateDesk.frissit(), id => ({ megbizas_id: m.id, ...(m.megtekintesek.find(x => x.id === id) || {}) }));
        MandateDesk.kotSzerk(hova, m);

    }

    // ---------- Szerződés és iratok (+ adásvétel, díj) ----------

    static fulSzerzodes(hova, m) {

        const esc = Utils.escape;
        const admin = m.jog.kezel;
        const dij = m.dij || {};
        const dis = admin ? "" : "disabled";
        const lepesek = ["tervezet", "elkuldve", "elfogadva", "alairva"];
        const idx = lepesek.indexOf(m.szerzodes_allapot || "tervezet");
        const sor = (label, v) => v ? `<div class="mbKv"><span>${label}</span><b>${v}</b></div>` : "";
        const lokalis = d => { if (!d) return ""; const t = new Date(d); const p = n => String(n).padStart(2, "0"); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`; };
        const szerzFajl = (m.fajlok || []).filter(f => f.tipus === "szerzodes_alairt");
        const egyeb = (m.fajlok || []).filter(f => f.tipus === "egyeb");
        const adasvetel = ["targyalas", "adasvetel", "eladva"].includes(m.statusz);

        hova.innerHTML = `
            <div class="row g-4">
                <div class="col-xl-7">
                    ${adasvetel ? `
                    <section class="card mb-4 dkAdasvetel">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-handshake" aria-hidden="true"></i> ${I18n.t("av_cim")}</h5></div>
                        <div class="card-body">
                            <ol class="avLista">
                                <li class="${m.adasvetel_ajanlat_id ? "kesz" : ""}"><b>${I18n.t("av_ajanlat")}</b>${m.eladasi_ar ? ` – ${esc(Svc.penz(m.eladasi_ar, m.penznem))}` : ""}</li>
                                <li class="${m.eloszerzodes_datum ? "kesz" : ""}"><b>${I18n.t("av_eloszerzodes")}</b>${m.eloszerzodes_datum ? ` – ${esc(Svc.nap(m.eloszerzodes_datum))}` : ""}${m.foglalo ? ` · ${esc(I18n.f("aj_foglaloRov", { osszeg: Svc.penz(m.foglalo, m.penznem) }))}` : ""}</li>
                                <li class="${m.iratok_lista.every(x => x.megvan) ? "kesz" : ""}"><b>${I18n.t("av_iratok")}</b> – ${m.iratok_lista.filter(x => x.megvan).length}/${m.iratok_lista.length}</li>
                                <li class="${m.kozjegyzo_idopont ? "kesz" : ""}"><b>${I18n.t("av_kozjegyzo")}</b>${m.kozjegyzo_idopont ? ` – ${esc(Svc.ido(m.kozjegyzo_idopont))}${m.kozjegyzo ? " · " + esc(m.kozjegyzo) : ""}` : ""}</li>
                                <li class="${m.statusz === "eladva" ? "kesz" : ""}"><b>${I18n.t("av_alairas")}</b>${m.eladva ? ` – ${esc(Svc.nap(m.eladva))}` : ""}</li>
                            </ol>
                            <fieldset ${dis}>
                            <div class="row g-2">
                                <div class="col-sm-6"><label class="form-label small mb-1" for="avElo">${I18n.t("av_eloszerzodesDatum")}</label><input class="form-control form-control-sm" id="avElo" type="date" value="${esc(m.eloszerzodes_datum || "")}"></div>
                                <div class="col-sm-6"><label class="form-label small mb-1" for="avFogl">${I18n.t("aj_foglalo")} (${esc(m.penznem || "EUR")})</label><input class="form-control form-control-sm" id="avFogl" type="number" step="500" value="${m.foglalo ?? ""}"></div>
                                <div class="col-sm-6"><label class="form-label small mb-1" for="avKozIdo">${I18n.t("av_kozjegyzoIdo")}</label><input class="form-control form-control-sm" id="avKozIdo" type="datetime-local" value="${lokalis(m.kozjegyzo_idopont)}"></div>
                                <div class="col-sm-6"><label class="form-label small mb-1" for="avKoz">${I18n.t("av_kozjegyzoNev")}</label><input class="form-control form-control-sm" id="avKoz" value="${esc(m.kozjegyzo || "")}"></div>
                                <div class="col-sm-6"><label class="form-label small mb-1" for="avKulcs">${I18n.t("av_kulcs")}</label><input class="form-control form-control-sm" id="avKulcs" type="date" value="${esc(m.kulcsatadas || "")}"></div>
                                <div class="col-sm-6"><label class="form-label small mb-1" for="avAr">${I18n.t("mbSalePrice")}</label><input class="form-control form-control-sm" id="avAr" type="number" step="500" value="${m.eladasi_ar ?? ""}"></div>
                            </div>
                            ${admin ? `<div class="d-flex flex-wrap gap-2 justify-content-end mt-3">
                                <button type="button" class="btn btn-sm btn-primary" id="avMent">${I18n.t("finSave")}</button>
                                ${m.statusz === "adasvetel" ? `<button type="button" class="btn btn-sm btn-success" id="avKesz"><i class="fa-solid fa-handshake" aria-hidden="true"></i> ${I18n.t("kovG_kozjegyzo_kesz")}</button>` : ""}
                            </div>` : ""}
                            </fieldset>
                            <p class="small text-body-secondary mt-2 mb-0">${I18n.t("av_sugo")}</p>
                        </div>
                    </section>` : ""}

                    <section class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-file-signature" aria-hidden="true"></i> ${I18n.t("mdContract")}</h5></div>
                        <div class="card-body">
                            <ol class="mmSteps mb-3">
                                ${lepesek.map((s, i) => `<li class="${i < idx ? "done" : i === idx ? "current" : ""}"><span></span>${esc(I18n.t("szc_" + s))}</li>`).join("")}
                            </ol>
                            <div class="small text-body-secondary mb-3">
                                ${m.szerzodes_elkuldve ? `<div><i class="fa-regular fa-paper-plane" aria-hidden="true"></i> ${I18n.t("szc_elkuldve")}: ${esc(Svc.ido(m.szerzodes_elkuldve))}</div>` : ""}
                                ${m.szerzodes_mod === "szemelyes" && m.szerzodes_allapot !== "alairva" ? `<div><i class="fa-solid fa-people-arrows" aria-hidden="true"></i> ${I18n.t("dk_mod_szemelyes")}${m.szemelyes_javaslat ? `: ${esc(m.szemelyes_javaslat)}` : ""}</div>` : ""}
                                ${m.szerzodes_elfogadva ? `<div><i class="fa-solid fa-signature" aria-hidden="true"></i> ${I18n.t("szc_onlineAlairva")}: ${esc(Svc.ido(m.szerzodes_elfogadva))}${m.szerzodes_elfogadva_ip ? ` · IP ${esc(m.szerzodes_elfogadva_ip)}` : ""}${m.szerzodes_kod_ok ? ` · ${I18n.t("szc_koddal")}` : ""}${m.korai_kezdes ? ` · ${I18n.t("szc_koraiKezdes")}` : ""}</div>` : ""}
                                ${m.ellenjegyezve ? `<div><i class="fa-solid fa-stamp" aria-hidden="true"></i> ${I18n.t("szc_ellenjegyezve")}: ${esc(Svc.ido(m.ellenjegyezve))}${m.ellenjegyzo ? " · " + esc(m.ellenjegyzo) : ""}</div>` : ""}
                                ${m.szerzodes_hash ? `<div class="text-break"><i class="fa-solid fa-fingerprint" aria-hidden="true"></i> SHA-256: <code>${esc(m.szerzodes_hash)}</code></div>` : ""}
                                ${m.lejar ? `<div><i class="fa-regular fa-hourglass" aria-hidden="true"></i> ${I18n.t("mdExpires")}: ${esc(Svc.nap(m.lejar))}</div>` : ""}
                            </div>
                            <div class="d-flex flex-wrap gap-2">
                                <a class="btn btn-sm btn-outline-secondary" href="/api/megbizas/${m.id}/szerzodes" target="_blank" rel="noopener"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> ${I18n.t("mbOpenContract")}</a>
                                ${admin && idx < 2 ? `<button type="button" class="btn btn-sm btn-outline-primary" id="mdSzKuld"><i class="fa-regular fa-paper-plane" aria-hidden="true"></i> ${I18n.t(idx === 1 ? "mdResendContract" : "mdSendContract")}</button>` : ""}
                                ${admin && m.szerzodes_allapot === "elfogadva" ? `<button type="button" class="btn btn-sm btn-primary" data-kov="ellenjegyez"><i class="fa-solid fa-signature" aria-hidden="true"></i> ${I18n.t("kovG_ellenjegyez")}</button>` : ""}
                                ${admin && m.szerzodes_allapot !== "alairva" ? `<button type="button" class="btn btn-sm btn-outline-primary" data-kov="feltolt_szerzodes"><i class="fa-solid fa-upload" aria-hidden="true"></i> ${I18n.t("kovG_szkennelt")}</button>` : ""}
                            </div>
                            ${szerzFajl.length ? `<ul class="dkFajlok mt-2">${szerzFajl.map(MandateDesk.fajlSor).join("")}</ul>` : ""}
                            <p class="small text-body-secondary mt-2 mb-0">${I18n.t("szc_sugo")}</p>

                            <hr>
                            <fieldset ${dis}>
                            <div class="row g-2">
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
                                <div class="col-6"><label class="form-label small mb-1" for="mbSzDatum">${I18n.t("mbContractDate")}</label>
                                    <input class="form-control form-control-sm" id="mbSzDatum" type="date" value="${esc(m.szerzodes_datum || "")}"></div>
                                <div class="col-6"><label class="form-label small mb-1" for="mbAlairva">${I18n.t("mdSignedPaper")}</label>
                                    <input class="form-control form-control-sm" id="mbAlairva" type="date" value="${esc(m.alairva || "")}"></div>
                            </div>
                            ${admin ? `<div class="text-end mt-3"><button type="button" class="btn btn-sm btn-primary" id="mbMentSz"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button></div>` : ""}
                            </fieldset>
                        </div>
                    </section>
                </div>

                <div class="col-xl-5">
                    <section class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-folder-open" aria-hidden="true"></i> ${I18n.t("mdDocs")} <span class="badge text-bg-light">${m.iratok_lista.filter(x => x.megvan).length}/${m.iratok_lista.length}</span></h5></div>
                        <div class="card-body">
                            <p class="small text-body-secondary">${I18n.t("ir_sugoCsapat")}</p>
                            <ul class="mdDocs">
                                ${m.iratok_lista.map(x => `
                                    <li class="irSor ${x.megvan ? "ok" : x.fajlok.length ? "feltoltve" : ""}">
                                        <div class="d-flex flex-wrap align-items-center gap-2">
                                            <label class="form-check mb-0 flex-fill">
                                                <input class="form-check-input" type="checkbox" data-md-irat="${esc(x.kod)}" ${x.megvan ? "checked" : ""} ${dis}>
                                                <span class="form-check-label">${esc(Svc.t(x.nev))}</span>
                                            </label>
                                            <span class="badge ${x.megvan ? "text-bg-success" : x.fajlok.length ? "text-bg-info" : "text-bg-light"}">${I18n.t(x.megvan ? "ir_ellenorizve" : x.fajlok.length ? "ir_feltoltve" : "ir_hiany")}</span>
                                            ${admin ? `<button type="button" class="btn btn-sm btn-link p-0" data-irat-fel="${esc(x.kod)}" title="${esc(I18n.t("ir_feltolt"))}" aria-label="${esc(I18n.t("ir_feltolt"))}"><i class="fa-solid fa-upload" aria-hidden="true"></i></button>` : ""}
                                        </div>
                                        ${x.fajlok.length ? `<ul class="dkFajlok">${x.fajlok.map(MandateDesk.fajlSor).join("")}</ul>` : ""}
                                        <input class="form-control form-control-sm mt-1" data-md-irat-megj="${esc(x.kod)}" value="${esc(x.megj || "")}" placeholder="${esc(I18n.t("prNote"))}" aria-label="${esc(I18n.t("prNote"))}" ${dis}>
                                    </li>`).join("")}
                            </ul>
                            ${egyeb.length ? `<h6 class="small text-uppercase text-body-secondary mt-3">${I18n.t("ir_egyeb")}</h6><ul class="dkFajlok">${egyeb.map(MandateDesk.fajlSor).join("")}</ul>` : ""}
                            ${admin ? `<div class="d-flex flex-wrap gap-2 justify-content-end">
                                <button type="button" class="btn btn-sm btn-outline-secondary" data-irat-fel="">${I18n.t("ir_egyebFeltolt")}</button>
                                <button type="button" class="btn btn-sm btn-outline-primary" id="mdIratMent">${I18n.t("finSave")}</button>
                            </div>` : ""}
                        </div>
                    </section>

                    <section class="card">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-coins" aria-hidden="true"></i> ${I18n.t("mbContractFee")}</h5></div>
                        <div class="card-body">
                            <div class="mbFeeBox">
                                ${sor(I18n.t(dij.becsult ? "mbFeeEstimated" : "mbFeeSuccess"), dij.siker ? esc(Svc.penz(dij.siker, dij.penznem)) + ` <small>(${esc(Utils.num(dij.jutalek, 1))}% · ${esc(Svc.penz(dij.alap, dij.penznem))})</small>` : "")}
                                ${sor(I18n.t("mbFixFee"), dij.fix ? esc(Svc.penz(dij.fix, dij.penznem)) : "")}
                                ${(dij.opciok || []).map(o => sor(esc(Svc.t(o.nev)), esc(Svc.penz(o.ar, o.penznem)))).join("")}
                            </div>
                            ${admin ? `
                            <div class="d-flex flex-wrap gap-2 mt-3 align-items-center">
                                <button type="button" class="btn btn-sm btn-outline-success" data-kov="dijbekero"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${I18n.t("mbMakeProforma")}</button>
                                ${m.dijbekero_id ? `<a class="small" href="/api/admin/penzugy/szamlak/${m.dijbekero_id}/nyomtat" target="_blank" rel="noopener">${I18n.f("mdProformaDone", { id: m.dijbekero_id })}</a>` : ""}
                            </div>` : ""}
                        </div>
                    </section>
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
            penznem: $("#mbPenznem").value, idotartam_honap: $("#mbIdo").value, kizarolagos: $("#mbKizar").checked
        });
        const av = $("#avMent");
        if (av) av.onclick = () => MandateDesk.ment({
            eloszerzodes_datum: $("#avElo").value, foglalo: $("#avFogl").value,
            kozjegyzo_idopont: $("#avKozIdo").value ? new Date($("#avKozIdo").value).toISOString() : null,
            kozjegyzo: $("#avKoz").value, kulcsatadas: $("#avKulcs").value, eladasi_ar: $("#avAr").value
        });
        const avk = $("#avKesz");
        if (avk) avk.onclick = () => MandateDesk.lepes("kozjegyzo_kesz", I18n.t("kovQ_kozjegyzo_kesz"));
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
        hova.querySelectorAll("[data-irat-fel]").forEach(b => {
            b.onclick = () => MandateDesk.fajlValaszt({ accept: "application/pdf,image/jpeg,image/png,image/webp" }).then(f => {
                if (!f) return;
                const kod = b.dataset.iratFel;
                return MandateDesk.api(`/${m.id}/fajl`, { method: "POST", body: { tipus: kod ? "irat" : "egyeb", kod: kod || null, nev: f.nev, fajl: f.adat } })
                    .then(() => { MandateDesk.jelez(I18n.t("ir_feltoltve")); MandateDesk.frissit(); });
            }).catch(e => MandateDesk.hiba(e));
        });
        hova.querySelectorAll("[data-fajl-torol]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("finDeleteConfirm"))) return;
                MandateDesk.api(`/${m.id}/fajl/${b.dataset.fajlTorol}`, { method: "DELETE" }).then(() => MandateDesk.frissit()).catch(e => MandateDesk.hiba(e));
            };
        });
        MandateDesk.kotKovetkezo(hova, m);

    }

    static fajlSor(f) {
        const esc = Utils.escape;
        const admin = MandateDesk.akt && MandateDesk.akt.jog.kezel;
        return `<li><a href="/api/megbizas/fajl/${f.id}" target="_blank" rel="noopener"><i class="fa-regular ${f.mime === "application/pdf" ? "fa-file-pdf" : "fa-file-image"}" aria-hidden="true"></i> ${esc(f.nev)}</a>
            <small class="text-body-secondary">${esc(Svc.nap(f.created_at))}${f.feltolto ? " · " + esc(f.feltolto) : ""}${f.lathato_eladonak === false ? " · " + esc(I18n.t("ir_csakCsapat")) : ""}</small>
            ${admin ? `<button type="button" class="btn btn-sm btn-link text-danger p-0 ms-1" data-fajl-torol="${f.id}" aria-label="${esc(I18n.t("finDelete"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ""}</li>`;
    }

    // Fájl kiválasztása (PDF / kép, legfeljebb 8 MB) → { nev, adat: dataURL }
    static fajlValaszt({ accept } = {}) {
        return new Promise((ok, nem) => {
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = accept || "application/pdf,image/jpeg,image/png,image/webp";
            inp.onchange = () => {
                const f = inp.files && inp.files[0];
                if (!f) return ok(null);
                if (f.size > 8 * 1024 * 1024) { const e = new Error("file_too_large"); e.kod = "file_too_large"; return nem(e); }
                const r = new FileReader();
                r.onload = () => ok({ nev: f.name, adat: r.result, meret: f.size });
                r.onerror = () => nem(new Error("bad_file"));
                r.readAsDataURL(f);
            };
            inp.click();
        });
    }

    // A személyesen aláírt szerződés szkennelt példánya
    static szerzodesFeltolt(m) {
        const ma = new Date().toISOString().slice(0, 10);
        const datum = prompt(I18n.t("szc_alairasDatuma"), m.alairva || ma);
        if (datum === null) return;
        MandateDesk.fajlValaszt().then(f => {
            if (!f) return;
            return MandateDesk.api(`/${m.id}/fajl`, { method: "POST", body: { tipus: "szerzodes_alairt", nev: f.nev, fajl: f.adat, alairva: datum || ma } })
                .then(() => { MandateDesk.jelez(I18n.t("szc_feltoltve")); MandateDesk.frissit(); });
        }).catch(e => MandateDesk.hiba(e));
    }

    static dijbekero(m) {
        if (!confirm(I18n.t("mbProformaConfirm"))) return;
        MandateDesk.api(`/${m.id}/dijbekero`, { method: "POST", body: {} })
            .then(v => { window.open(`/api/admin/penzugy/szamlak/${v.szamla_id}/nyomtat`, "_blank", "noopener"); MandateDesk.frissit(); })
            .catch(e => MandateDesk.hiba(e));
    }

    // ---------- Ingatlan és csomag (+ előkészítés, hirdetés, csapat) ----------

    static fulCsomag(hova, m) {

        const esc = Utils.escape;
        const kezel = m.jog.kezel;
        const dis = kezel ? "" : "disabled";
        const opciok = new Set(m.opciok || []);
        const lokalis = d => { if (!d) return ""; const t = new Date(d); const p = n => String(n).padStart(2, "0"); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`; };
        const nev = id => (m.munkatarsak.find(x => x.id === id) || {}).nev;
        const valaszto = (mezo, cimke, ikon) => `
            <div class="col-sm-4 col-xl-12">
                <label class="form-label small mb-1" for="md_${mezo}"><i class="${ikon}" aria-hidden="true"></i> ${cimke}</label>
                ${kezel ? `
                <select class="form-select form-select-sm" id="md_${mezo}" data-md-hozzarendel="${mezo}">
                    <option value="">–</option>
                    ${m.munkatarsak.map(u => `<option value="${u.id}" ${m[mezo] === u.id ? "selected" : ""}>${esc(u.nev)} (${esc(I18n.t("tmRole_" + u.szerep))})</option>`).join("")}
                    ${m[mezo] && !m.munkatarsak.some(u => u.id === m[mezo]) ? `<option value="${m[mezo]}" selected>${esc(nev(m[mezo]) || "#" + m[mezo])}</option>` : ""}
                </select>` : `<div class="fw-semibold">${esc(m[mezo.replace("_id", "_nev")] || "–")}</div>`}
            </div>`;
        const csomagAllapot = m.csomag_jovahagyva ? `<span class="badge text-bg-success">${I18n.f(m.csomag_jovahagyta === "csapat" ? "cs_jovahagyvaTel" : "cs_jovahagyva", { datum: Svc.nap(m.csomag_jovahagyva) })}</span>`
            : m.csomag_kuldve ? `<span class="badge text-bg-warning">${I18n.f("cs_kuldve", { datum: Svc.nap(m.csomag_kuldve) })}</span>` : `<span class="badge text-bg-light">${I18n.t("cs_nemKuldve")}</span>`;

        hova.innerHTML = `
            <div class="row g-4">
                <div class="col-xl-7">
                    <section class="card mb-4">
                        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                            <h5 class="mb-0"><i class="fa-solid fa-box-open" aria-hidden="true"></i> ${I18n.t("cs_cim")}</h5>
                            ${csomagAllapot}
                        </div>
                        <div class="card-body">
                            <p class="small text-body-secondary">${I18n.t("cs_sugo")}</p>
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
                                <div class="col-5"><label class="form-label small mb-1" for="mbKertAr">${I18n.t("cs_indulAr")}</label>
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
                            <div class="mbKv mt-2"><span>${I18n.t("mbCommission")}</span><b>${m.jutalek !== null && m.jutalek !== undefined ? esc(Utils.num(m.jutalek, 1)) + "%" : "–"}${m.dij && m.dij.minimum ? ` · ${I18n.t("mbMinFee")}: ${esc(Svc.penz(m.dij.minimum, m.dij.penznem))}` : ""}${m.fix_dij ? ` · ${I18n.t("mbFixFee")}: ${esc(Svc.penz(m.fix_dij, m.penznem))}` : ""}${m.kizarolagos ? ` · ${I18n.t("mbExclusive")}` : ""}</b></div>
                            ${kezel ? `
                            <div class="d-flex flex-wrap gap-2 justify-content-end mt-3">
                                <button type="button" class="btn btn-sm btn-outline-primary" id="mbMentAdat"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button>
                                ${["uj", "egyeztetes"].includes(m.statusz) ? `
                                <button type="button" class="btn btn-sm btn-primary" id="csKuld"><i class="fa-regular fa-paper-plane" aria-hidden="true"></i> ${I18n.t(m.csomag_kuldve ? "cs_ujraKuld" : "kovG_csomag_kuld")}</button>
                                ${!m.csomag_jovahagyva ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-kov="csomag_ok">${I18n.t("kovG_tel_ok")}</button>` : ""}` : ""}
                            </div>` : ""}
                            </fieldset>
                        </div>
                    </section>

                    <section class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-camera" aria-hidden="true"></i> ${I18n.t("ek_cim")}</h5></div>
                        <div class="card-body">
                            <div class="row g-2 align-items-end mb-3">
                                <div class="col-sm-7"><label class="form-label small mb-1" for="ekIdo">${I18n.t("ek_fotozasIdo")}</label>
                                    <input class="form-control form-control-sm" id="ekIdo" type="datetime-local" value="${lokalis(m.fotozas_idopont)}" ${dis}></div>
                                ${kezel ? `<div class="col-sm-5"><button type="button" class="btn btn-sm btn-outline-primary w-100" id="ekIdoMent">${I18n.t("ek_idoMent")}</button></div>` : ""}
                            </div>
                            ${MandateDesk.feladatPipak(m, kezel || (MandateDesk.enId() && MandateDesk.enId() === m.fotos_id))}
                            <p class="small text-body-secondary mt-2 mb-0">${I18n.t("ek_sugo")}</p>
                        </div>
                    </section>
                </div>

                <div class="col-xl-5">
                    <section class="card mb-4">
                        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                            <h5 class="mb-0"><i class="fa-solid fa-rectangle-list" aria-hidden="true"></i> ${I18n.t("mbListing")}</h5>
                            ${m.hirdetes ? `<span class="badge ${m.hirdetes.statusz === "elonezet" ? "text-bg-warning" : "text-bg-success"}">${I18n.t(m.hirdetes.statusz === "elonezet" ? "hd_elonezet" : "hd_nyilvanos")}</span>` : ""}
                        </div>
                        <div class="card-body">
                            ${m.hirdetes ? `
                                <a href="#listing/${m.hirdetes.id}" class="fw-semibold d-block">#${m.hirdetes.id} · ${esc(m.hirdetes.cim || Types.label(m.hirdetes.tipus))}</a>
                                <div class="text-body-secondary small mb-2">${esc(Utils.price(m.hirdetes))} · <i class="fa-solid fa-image" aria-hidden="true"></i> ${m.hirdetes.kep_db}</div>
                                <div class="small mb-3">${m.hirdetes_jovahagyva ? `<i class="fa-solid fa-check text-success" aria-hidden="true"></i> ${I18n.f("hd_jovahagyva", { datum: Svc.nap(m.hirdetes_jovahagyva) })}` : m.hirdetes_kuldve ? `<i class="fa-regular fa-clock" aria-hidden="true"></i> ${I18n.f("hd_kuldve", { datum: Svc.nap(m.hirdetes_kuldve) })}` : I18n.t("hd_nemKuldve")}</div>
                                <div class="d-flex flex-wrap gap-2">
                                    ${kezel ? `<button type="button" class="btn btn-sm btn-outline-primary" id="mbHirdSzerk"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("detailEdit")}</button>` : ""}
                                    <button type="button" class="btn btn-sm btn-outline-primary" id="mbHirdFoto"><i class="fa-solid fa-images" aria-hidden="true"></i> ${I18n.t("pmTitle")}</button>
                                    ${kezel && m.statusz === "fotozas" ? `<button type="button" class="btn btn-sm btn-primary" data-kov="hirdetes_kuld">${I18n.t(m.hirdetes_kuldve ? "hd_ujraKuld" : "kovG_hird_kuld")}</button>` : ""}
                                    ${kezel && m.statusz === "fotozas" && !m.hirdetes_jovahagyva ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-kov="hirdetes_ok">${I18n.t("kovG_tel_ok")}</button>` : ""}
                                    ${kezel ? `<button type="button" class="btn btn-sm btn-link text-danger ms-auto" id="mbHirdLe">${I18n.t("mbUnlink")}</button>` : ""}
                                </div>` : `
                                <p class="small text-body-secondary">${I18n.t("hd_nincs")}</p>
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
                    </section>

                    <section class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-people-group" aria-hidden="true"></i> ${I18n.t("mdTeam")}</h5></div>
                        <div class="card-body">
                            <div class="row g-2">
                                ${valaszto("felelos_id", I18n.t("mdResponsible"), "fa-solid fa-user-tie")}
                                ${valaszto("fotos_id", I18n.t("mdPhotographer"), "fa-solid fa-camera")}
                                ${valaszto("bemutato_id", I18n.t("mdPresenter"), "fa-solid fa-door-open")}
                            </div>
                            ${m.jog.rendszergazda ? `<p class="small text-body-secondary mt-2 mb-0">${I18n.t(m.munkatarsak.length ? "mdTeamNote" : "mdTeamEmpty")} <a href="#admin/csapat">${I18n.t("tmTeamTitle")}</a></p>` : ""}
                        </div>
                    </section>

                    ${kezel ? `
                    <section class="card mb-4">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${I18n.t("mdOfferMode")}</h5></div>
                        <div class="card-body">
                            ${["", "jovahagyas", "azonnal"].map(v => `
                                <div class="form-check">
                                    <input class="form-check-input" type="radio" name="mdMod" id="mdMod_${v || "alap"}" value="${v}" ${(m.ajanlat_mod || "") === v ? "checked" : ""}>
                                    <label class="form-check-label" for="mdMod_${v || "alap"}">${I18n.t(v ? "mdMode_" + v : "mdModeDefault")}<div class="small text-body-secondary">${I18n.t(v ? "mdModeHelp_" + v : "mdModeHelpDefault")}</div></label>
                                </div>`).join("")}
                        </div>
                    </section>

                    <section class="card">
                        <div class="card-header"><h5 class="mb-0"><i class="fa-regular fa-note-sticky" aria-hidden="true"></i> ${I18n.t("mbAdminNote")}</h5></div>
                        <div class="card-body">
                            <textarea class="form-control form-control-sm" id="mdAdminJ" rows="4">${esc(m.admin_jegyzet || "")}</textarea>
                            <div class="text-end mt-2"><button type="button" class="btn btn-sm btn-outline-primary" id="mdMentJ">${I18n.t("finSave")}</button></div>
                        </div>
                    </section>` : ""}
                </div>
            </div>`;

        const $ = q => hova.querySelector(q);

        // A szolgáltatások listája a beállításokból
        const opcHova = $("#mdOpciok");
        const rajzOpc = lista => {
            opcHova.innerHTML = lista.map(o => `
                <label class="form-check">
                    <input class="form-check-input" type="checkbox" value="${esc(o.kod)}" ${opciok.has(o.kod) ? "checked" : ""} data-mb-opc ${dis}>
                    <span class="form-check-label small"><i class="${esc(o.ikon)}" aria-hidden="true"></i> ${esc(Svc.t(o.nev))}${o.ar > 0 ? ` <span class="text-body-secondary">(${esc(Svc.penz(o.ar, o.penznem))})</span>` : ""}</span>
                </label>`).join("") || (m.opciok || []).map(k => `<span class="badge text-bg-light me-1">${esc(k)}</span>`).join("");
        };
        Svc.api("/api/megbizas/ajanlat").then(a => rajzOpc(a.opciok || [])).catch(() => rajzOpc([]));

        const vs = $("#mbVaros");
        if (CityManager.varosok && CityManager.varosok.length) CityManager.fillCitySelect(vs, m.varos || DataManager.currentCity);
        if (m.varos && ![...vs.options].some(o => o.value === m.varos)) vs.insertAdjacentHTML("afterbegin", `<option value="${esc(m.varos)}" selected>${esc(m.varos)}</option>`);

        const adatok = () => ({
            ugylet: $("#mbUgylet").value, tipus: $("#mbTipus").value, varos: $("#mbVaros").value, cim: $("#mbCim").value,
            telepules: $("#mbTelepules").value, nm: $("#mbNm").value, szobak: $("#mbSzobak").value, kert_ar: $("#mbKertAr").value,
            leiras: $("#mbLeiras").value, telefon: $("#mbTel").value, email: $("#mbEmail").value,
            opciok: [...hova.querySelectorAll("[data-mb-opc]:checked")].map(c => c.value)
        });
        const mentB = $("#mbMentAdat");
        if (mentB) mentB.onclick = () => MandateDesk.ment(adatok());
        const csK = $("#csKuld");
        if (csK) csK.onclick = () => {
            if (!confirm(I18n.t("kovQ_csomag_kuld"))) return;
            csK.disabled = true;
            MandateDesk.api("/" + m.id, { method: "PUT", body: adatok() })
                .then(() => MandateDesk.lepes("csomag_kuld"))
                .catch(e => MandateDesk.hiba(e)).finally(() => { csK.disabled = false; });
        };
        const ekM = $("#ekIdoMent");
        if (ekM) ekM.onclick = () => MandateDesk.ment({ fotozas_idopont: $("#ekIdo").value ? new Date($("#ekIdo").value).toISOString() : null });

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

        hova.querySelectorAll("[data-md-hozzarendel]").forEach(s => {
            s.onchange = () => MandateDesk.ment({ [s.dataset.mdHozzarendel]: s.value || null }, I18n.t("mdAssigned"));
        });
        hova.querySelectorAll("input[name=mdMod]").forEach(r => {
            r.onchange = () => MandateDesk.ment({ ajanlat_mod: r.value || null });
        });
        const j = $("#mdMentJ");
        if (j) j.onclick = () => MandateDesk.ment({ admin_jegyzet: $("#mdAdminJ").value });
        MandateDesk.kotKovetkezo(hova, m);

    }

    static enId() {
        return AuthManager.user ? AuthManager.user.id : null;
    }

    // Hirdetés feladása a megbízás adataiból: az Új ingatlan űrlap kitöltve,
    // a mentéskor a hirdetés a megbízáshoz kapcsolódik (előnézetként)
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

    // ---------- Üzenetek és napló ----------

    static fulUzenetek(hova, m) {

        const esc = Utils.escape;
        const kezel = m.jog.kezel;
        const szalak = [
            { k: "elado", nev: m.nev || I18n.t("mdSeller"), al: I18n.t("mdSeller"), eid: null },
            ...m.erdeklodok.map(e => ({ k: e.id, nev: `${I18n.f("dk_vevoSzam", { n: e.sorszam || e.id })} · ${e.nev || "–"}`, al: I18n.t("vl_" + MandateDesk.vevoLepcso(e, m)), eid: e.id }))
        ].map(s => {
            const z = m.uzenetek.filter(x => (x.erdeklodo_id || null) === s.eid);
            return { ...s, z, olv: z.filter(x => x.irany === "be" && !x.olvasva).length, utolso: z[z.length - 1] };
        }).sort((a, b) => (a.k === "elado" ? -1 : b.k === "elado" ? 1 : 0) || (b.olv - a.olv) || (new Date(b.utolso ? b.utolso.created_at : 0) - new Date(a.utolso ? a.utolso.created_at : 0)));

        let akt = szalak.find(s => s.k === MandateDesk.szal) || szalak.find(s => s.olv) || szalak[0];
        MandateDesk.szal = akt.k;
        let csakElado = false;

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
                                <small class="text-body-secondary">${I18n.t(akt.k === "elado" ? "dk_mailElado" : "mdMailBuyer")}</small>
                                <button type="button" class="btn btn-primary btn-sm" id="mdUzKuld"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t("lmSend")}</button>
                            </div>
                        </div>` : ""}
                    </section>
                </div>

                <div class="row g-4 mt-1">
                    <div class="col-lg-5">
                        ${kezel ? `
                        <section class="card">
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
                        </section>` : ""}
                    </div>
                    <div class="col-lg-7">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="mb-0">${I18n.t("mmTimeline")} <span class="badge text-bg-light">${m.naplo.length}</span></h6>
                            <div class="form-check form-switch mb-0">
                                <input class="form-check-input" type="checkbox" role="switch" id="mdLogSeller" ${csakElado ? "checked" : ""}>
                                <label class="form-check-label small" for="mdLogSeller">${I18n.t("mdOnlySellerVisible")}</label>
                            </div>
                        </div>
                        <ul class="mbLog mdLogFull">${MandateDesk.naploSorok(csakElado ? m.naplo.filter(n => n.lathato_eladonak) : m.naplo)}</ul>
                    </div>
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
            hova.querySelector("#mdLogSeller").onchange = e => { csakElado = e.target.checked; rajzol(); };
            const k = hova.querySelector("#mbNaploKuld");
            if (k) k.onclick = () => {
                const szoveg = hova.querySelector("#mbNaploSz").value.trim();
                if (!szoveg) return;
                MandateDesk.api(`/${m.id}/naplo`, { method: "POST", body: { szoveg, lathato_eladonak: hova.querySelector("#mbNaploLat").checked } })
                    .then(() => MandateDesk.frissit()).catch(e => MandateDesk.hiba(e));
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

    static naploSorok(lista) {
        const esc = Utils.escape;
        if (!lista.length) return `<li class="text-body-secondary small">–</li>`;
        return lista.map(n => `
            <li class="${n.lathato_eladonak ? "visible" : ""}">
                <span class="small text-body-secondary">${esc(Svc.ido(n.created_at))}${n.szerzo ? " · " + esc(n.szerzo) : ""}${n.lathato_eladonak ? ` · <i class="fa-regular fa-eye" title="${esc(I18n.t("mbVisibleToSeller"))}" aria-label="${esc(I18n.t("mbVisibleToSeller"))}"></i>` : ""}</span>
                <div>${n.tipus === "statusz" ? `<b>${esc(MandateDesk.szakaszNev(n.szoveg))}</b>` : esc(n.szoveg)}</div>
            </li>`).join("");
    }

    // ===================== SZERKESZTŐ ABLAK (vevő / megtekintés / ajánlat) =====================

    static reszSzerk(m, resz, x, elore = {}) {

        const esc = Utils.escape;
        const uj = !x;
        x = { ...(x || {}), ...elore };
        const { tartalom, modal } = Svc.modal("mbReszModal", "");
        const erdOpt = sel => `<option value="">–</option>${m.erdeklodok.map(e => `<option value="${e.id}" ${e.id === sel ? "selected" : ""}>${esc(I18n.f("dk_vevoSzam", { n: e.sorszam || e.id }))} · ${esc(e.nev)}</option>`).join("")}`;
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
                <div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="mrEngedve" ${x.ajanlat_engedve ? "checked" : ""}><label class="form-check-label" for="mrEngedve">${I18n.t("dk_ajanlatEngedve")}<div class="small text-body-secondary">${I18n.t("dk_ajanlatEngedveSugo")}</div></label></div></div>
                <div class="col-12"><label class="form-label small mb-1" for="mrMegj">${I18n.t("prNote")}</label><textarea class="form-control" id="mrMegj" rows="3">${esc(x.megjegyzes || "")}</textarea></div>`,
            megtekintesek: `
                <div class="col-12"><label class="form-label small mb-1" for="mrErd">${I18n.t("ordCustomer")}</label><select class="form-select" id="mrErd">${erdOpt(x.erdeklodo_id)}</select></div>
                <div class="col-7"><label class="form-label small mb-1" for="mrIdo">${I18n.t("mbWhen")}</label><input class="form-control" id="mrIdo" type="datetime-local" value="${lokalis(x.idopont)}"></div>
                <div class="col-5"><label class="form-label small mb-1" for="mrSt">${I18n.t("ordStatus")}</label><select class="form-select" id="mrSt">${["kert", "egyeztetve", "megtortent", "elmaradt", "lemondva"].map(s => `<option value="${s}" ${(x.statusz || "egyeztetve") === s ? "selected" : ""}>${I18n.t("mbVw_" + s)}</option>`).join("")}</select></div>
                <div class="col-12"><label class="form-label small mb-1" for="mrBem">${I18n.t("mdPresenter")}</label><select class="form-select" id="mrBem">${bemOpt(x.bemutato_id)}</select></div>
                <div class="col-12"><label class="form-label small mb-1" for="mrJav">${I18n.t("nt_mikorErne")}</label><input class="form-control" id="mrJav" value="${esc(x.javasolt || "")}"></div>
                <div class="col-12"><label class="form-label small mb-1" for="mrVissza">${I18n.t("mbFeedback")}</label><textarea class="form-control" id="mrVissza" rows="3">${esc(x.visszajelzes || "")}</textarea></div>
                <p class="small text-body-secondary mb-0">${I18n.t("mdViewingNotify")}</p>`,
            ajanlatok: `
                <div class="col-12"><label class="form-label small mb-1" for="mrErd">${I18n.t("ordCustomer")}</label><select class="form-select" id="mrErd">${erdOpt(x.erdeklodo_id)}</select></div>
                <div class="col-7"><label class="form-label small mb-1" for="mrOsszeg">${I18n.t("lmAmount")} *</label><input class="form-control" id="mrOsszeg" type="number" value="${x.osszeg ?? ""}"></div>
                <div class="col-5"><label class="form-label small mb-1" for="mrPn">${I18n.t("finCurrency")}</label><select class="form-select" id="mrPn"><option ${(x.penznem || m.penznem) !== "RON" ? "selected" : ""}>EUR</option><option ${(x.penznem || m.penznem) === "RON" ? "selected" : ""}>RON</option></select></div>
                <div class="col-6"><label class="form-label small mb-1" for="mrFin">${I18n.t("lmFinancing")}</label><select class="form-select" id="mrFin"><option value="">–</option>${["keszpenz", "hitel", "vegyes", "egyeb"].map(f => `<option value="${f}" ${x.finanszirozas === f ? "selected" : ""}>${I18n.t("lmFin_" + f)}</option>`).join("")}</select></div>
                <div class="col-6"><label class="form-label small mb-1" for="mrFogl">${I18n.t("aj_foglalo")}</label><input class="form-control" id="mrFogl" type="number" value="${x.foglalo ?? ""}"></div>
                <div class="col-12"><label class="form-label small mb-1" for="mrFelt">${I18n.t("lmConditions")}</label><input class="form-control" id="mrFelt" value="${esc(x.feltetelek || "")}"></div>
                <div class="col-7"><label class="form-label small mb-1" for="mrSt">${I18n.t("ordStatus")}</label><select class="form-select" id="mrSt">${["uj", "tovabbitva", "ellenajanlat", "elfogadva", "elutasitva", "visszavonva", "lejart"].map(s => `<option value="${s}" ${(x.statusz || "uj") === s ? "selected" : ""}>${I18n.t("mbOf_" + s)}</option>`).join("")}</select></div>
                <div class="col-5"><label class="form-label small mb-1" for="mrEllen">${I18n.t("mmCounter")}</label><input class="form-control" id="mrEllen" type="number" value="${x.ellenajanlat ?? ""}"></div>
                <div class="col-12"><label class="form-label small mb-1" for="mrErv">${I18n.t("aj_ervenyes")}</label><input class="form-control" id="mrErv" type="datetime-local" value="${lokalis(x.ervenyes_ig)}"></div>
                <p class="small text-body-secondary mb-0">${I18n.t("mdOfferEditNote")}</p>`
        }[resz];

        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title">${I18n.t({ erdeklodok: uj ? "mdAddBuyer" : "mdEditBuyer", megtekintesek: uj ? "mdAddViewing" : "mmViewings", ajanlatok: uj ? "mdAddOffer" : "mmOffers" }[resz])}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
            </div>
            <div class="modal-body"><div class="row g-2">${mezok}</div></div>
            <div class="modal-footer">
                ${!uj && m.jog.kezel ? `<button type="button" class="btn btn-outline-danger me-auto" id="mrTorol" aria-label="${esc(I18n.t("finDelete"))}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>` : ""}
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
                erdeklodok: () => ({ nev: v("#mrNev"), telefon: v("#mrTel"), email: v("#mrEmail"), koltsegkeret: v("#mrKeret"), finanszirozas: v("#mrFin"), statusz: v("#mrSt"), megjegyzes: v("#mrMegj"), user_id: x.user_id, ajanlat_engedve: $("#mrEngedve").checked }),
                megtekintesek: () => ({ erdeklodo_id: v("#mrErd"), idopont: v("#mrIdo") ? new Date(v("#mrIdo")).toISOString() : null, statusz: v("#mrSt"), javasolt: v("#mrJav"), visszajelzes: v("#mrVissza"), bemutato_id: v("#mrBem") || null }),
                ajanlatok: () => ({ erdeklodo_id: v("#mrErd"), osszeg: v("#mrOsszeg"), penznem: v("#mrPn"), feltetelek: v("#mrFelt"), statusz: v("#mrSt"), ellenajanlat: v("#mrEllen"), finanszirozas: v("#mrFin"), foglalo: v("#mrFogl"), ervenyes_ig: v("#mrErv") ? new Date(v("#mrErv")).toISOString() : null })
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
