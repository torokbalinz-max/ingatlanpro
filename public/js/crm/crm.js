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
//   Ügyfelek    lista vagy tábla (oszlop = állapot, húzással léptethető),
//               szűrők (állapot, szerep, felelős, címke), CSV
//   Ingatlanok  az iroda hirdetései: ki érdeklődik, ki a tulajdonos, hány
//               megtekintés volt, mikor a következő – kattintásra a részletek
//   Megtekintések  heti naptár: ki, melyik ingatlant, mikor, kivel; utána
//               az eredmény (megtörtént, mennyire érdekli, visszajelzés)
//   Feladatok   határidő szerint csoportosítva, egy kattintással kész
//   Csapat      (vezetőnek) munkatársanként ügyfelek, feladatok, megtekintések
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
        { k: "ingatlanok", ikon: "fa-solid fa-house" },
        { k: "keresek", ikon: "fa-solid fa-bell-concierge", iroda: true },
        { k: "megtekintesek", ikon: "fa-regular fa-calendar" },
        { k: "ajanlatok", ikon: "fa-solid fa-hand-holding-dollar", iroda: true },
        { k: "feladatok", ikon: "fa-solid fa-list-check" },
        { k: "beerkezo", ikon: "fa-solid fa-inbox" },
        { k: "csapat", ikon: "fa-solid fa-people-group", vezeto: true }
    ];
    static ugyfelNezet = "lista";
    static adatlapFul = "attekintes";        // az ügyfél-adatlap belső füle        // lista | tabla
    static het = null;                   // a megtekintések naptárának hétfője
    static mSzuro = { felelos: "" };
    static iSzuro = { q: "", statusz: "aktiv" };

    static el = null;
    static ter = 0;
    static nezet = "attekintes";
    static tagok = [];
    static en = null;
    static vezeto = false;
    static szuro = { q: "", allapot: "nyitott", szerep: "", felelos: "", cimke: "", rend: "friss" };
    static fSzuro = { felelos: "", kesz: false };
    static beerkezoDb = 0;
    static ajanlatDb = 0;
    static aSzuro = { statusz: "nyitott" };

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

    // opts: { ter, nezet, beagyazott }
    //  beagyazott: az iroda munkaterületén egy nézet (saját menü nélkül – a munkaterület
    //  bal oldali menüje vált); a nézetek közti ugrás a munkaterület címére visz
    static mount(el, opts = {}) {
        Crm.el = el;
        if (Crm.ter !== Number(opts.ter || 0)) {
            Crm.ter = Number(opts.ter || 0);
            Crm.szuro = { q: "", allapot: "nyitott", szerep: "", felelos: "", cimke: "", rend: "friss" };
            Crm.fSzuro = { felelos: "", kesz: false };
            Crm.nezet = "attekintes";
        }
        Crm.beagyazott = !!opts.beagyazott;
        if (opts.nezet) { Crm.nezet = opts.nezet; Crm.beagyNezet = opts.nezet; }
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

    // A CRM nézet → a munkaterület oldala (beágyazott módban)
    static WS_OLDAL = { attekintes: "attekintes", ugyfelek: "ugyfelek", megtekintesek: "naptar", feladatok: "feladatok", beerkezo: "beerkezo",
        beerkezoKomb: "beerkezo", keresek: "beerkezo", ajanlatok: "ajanlatok", ingatlanok: "hirdetesek", csapat: "csapat" };

    static keret() {
        const el = Crm.el;
        if (Crm.beagyazott) {
            if (Crm.nezet !== Crm.beagyNezet) {
                const cel = Crm.WS_OLDAL[Crm.nezet] || "attekintes";
                Crm.nezet = Crm.beagyNezet;
                location.hash = `#iroda/${Crm.ter}:${cel}`;
                return;
            }
            const muvelet = ["attekintes", "ugyfelek", "megtekintesek", "feladatok"].includes(Crm.nezet);
            el.innerHTML = `
                <div class="crm crmEmbed">
                    ${muvelet ? `
                    <div class="crmActions">
                        <button type="button" class="btn btn-outline-primary btn-sm" id="crmUjMegt"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${Crm.t("crmNewViewing")}</button>
                        <button type="button" class="btn btn-outline-primary btn-sm" id="crmUjFeladat"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${Crm.t("crmNewTask")}</button>
                        <button type="button" class="btn btn-primary btn-sm" id="crmUjUgyfel"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${Crm.t("crmNewContact")}</button>
                    </div>` : ""}
                    <div id="crmBody"></div>
                </div>`;
            if (muvelet) {
                el.querySelector("#crmUjUgyfel").onclick = () => Crm.ugyfelSzerk(null);
                el.querySelector("#crmUjFeladat").onclick = () => Crm.feladatSzerk(null);
                el.querySelector("#crmUjMegt").onclick = () => Crm.megtSzerk(null);
            }
            Crm.frissit();
            return;
        }
        el.innerHTML = `
            <div class="crm">
                <div class="crmTop">
                    <nav class="crmNav" aria-label="CRM">
                        ${Crm.NEZETEK.filter(n => (!n.vezeto || (Crm.vezeto && Crm.ter)) && (!n.iroda || Crm.ter)).map(n => `
                            <button type="button" class="crmNavBtn ${Crm.nezet === n.k ? "active" : ""}" data-crm-nezet="${n.k}" aria-pressed="${Crm.nezet === n.k}">
                                <i class="${n.ikon}" aria-hidden="true"></i> ${Crm.t("crmNav_" + n.k)}
                                ${n.k === "beerkezo" ? `<span class="badge rounded-pill text-bg-warning crmInboxBadge" ${Crm.beerkezoDb ? "" : "hidden"}>${Crm.beerkezoDb}</span>` : ""}
                                ${n.k === "ajanlatok" ? `<span class="badge rounded-pill text-bg-danger crmOfferBadge" ${Crm.ajanlatDb ? "" : "hidden"}>${Crm.ajanlatDb}</span>` : ""}
                                ${n.k === "keresek" ? `<span class="badge rounded-pill text-bg-danger crmReqBadge" ${Crm.keresDb ? "" : "hidden"}>${Crm.keresDb}</span>` : ""}
                            </button>`).join("")}
                    </nav>
                    <div class="d-flex gap-2">
                        <button type="button" class="btn btn-outline-primary btn-sm" id="crmUjMegt"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${Crm.t("crmNewViewing")}</button>
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
        el.querySelector("#crmUjMegt").onclick = () => Crm.megtSzerk(null);
        Crm.frissit();
    }

    static frissit() {
        const body = document.getElementById("crmBody");
        if (!body) return;
        ({
            attekintes: () => Crm.attekintes(body),
            ugyfelek: () => Crm.ugyfelek(body),
            feladatok: () => Crm.feladatok(body),
            beerkezo: () => Crm.beerkezo(body),
            ingatlanok: () => Crm.ingatlanok(body),
            megtekintesek: () => Crm.megtekintesek(body),
            csapat: () => Crm.csapat(body),
            ajanlatok: () => Crm.ajanlatok(body),
            keresek: () => CrmReq.nezet(body),
            // A munkaterület „Beérkező” oldala: kérések + hívás-jelzések, alatta az üzenetek
            beerkezoKomb: () => {
                body.innerHTML = `<div id="crmKombKer"></div>
                    <h6 class="crmKombHead"><i class="fa-regular fa-envelope" aria-hidden="true"></i> ${Crm.t("wsInboxMessages")}</h6>
                    <div id="crmKombUz"></div>`;
                CrmReq.nezet(body.querySelector("#crmKombKer"));
                Crm.beerkezo(body.querySelector("#crmKombUz"));
            }
        })[Crm.nezet]();
    }

    static badge(n) {
        Crm.beerkezoDb = n;
        document.querySelectorAll(".crmInboxBadge").forEach(b => { b.textContent = n; b.hidden = !n; });
    }

    static betolt(body) {
        body.innerHTML = `<div class="text-center py-4"><span class="spinner-border spinner-border-sm text-primary" role="status"></span></div>`;
    }

    // ===================== ÁTTEKINTÉS =====================

    static attekintes(body) {
        Crm.betolt(body);
        Crm.api("/attekintes").then(a => {
            Crm.badge(a.beerkezett);
            Crm.ajanlatDb = a.uj_ajanlat || 0;
            document.querySelectorAll(".crmOfferBadge").forEach(ob => { ob.textContent = Crm.ajanlatDb; ob.hidden = !Crm.ajanlatDb; });
            if (typeof CrmReq !== "undefined") CrmReq.badge(a.uj_keres || 0);
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
                ${Crm.ter && typeof CrmReq !== "undefined" ? CrmReq.gyorsHtml() : ""}
                ${Crm.ter && (a.uj_keres || a.hivas_jelzes) ? `
                <button type="button" class="crmInboxAlert crmReqAlert mb-4" data-go="keresek">
                    <i class="fa-solid fa-bell-concierge" aria-hidden="true"></i>
                    <span class="flex-fill text-start"><b>${[a.uj_keres ? Crm.t("mkNewReqs", { n: a.uj_keres }) : "", a.hivas_jelzes ? Crm.t("mkCallSignals", { n: a.hivas_jelzes }) : ""].filter(Boolean).join(" · ")}</b><span class="d-block small">${Crm.t("mkNewReqsHint")}</span></span>
                    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </button>` : ""}
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
                ${a.uj_ajanlat ? `
                <button type="button" class="crmInboxAlert crmOfferAlert mb-4" data-go="ajanlatok">
                    <i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i>
                    <span class="flex-fill text-start"><b>${Crm.t("ofNewOffers", { n: a.uj_ajanlat })}</b><span class="d-block small">${Crm.t("ofNewOffersHint")}</span></span>
                    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </button>` : ""}
                ${a.lezaratlan.length ? `
                <div class="crmInboxAlert crmResultAlert mb-4">
                    <i class="fa-solid fa-clipboard-question" aria-hidden="true"></i>
                    <span class="flex-fill text-start"><b>${Crm.t("crmUnresolved", { n: a.lezaratlan.length })}</b>
                        <span class="d-block small">${a.lezaratlan.slice(0, 3).map(m => `<a href="#" data-eredmeny="${m.id}">${Crm.esc(m.ugyfel_nev || "")} · ${Crm.hatarido(m.kezdet)}</a>`).join(" · ")}</span></span>
                </div>` : ""}
                <div class="row g-4">
                    <div class="col-lg-7">
                        <div class="card mb-4">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <h6 class="mb-0"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${Crm.t("crmUpcomingViewings")}</h6>
                                <button type="button" class="btn btn-link btn-sm p-0" data-go="megtekintesek">${Crm.t("crmCalendar")}</button>
                            </div>
                            ${a.megtekintesek.length ? `<div class="list-group list-group-flush">${a.megtekintesek.map(m => Crm.megtSor(m)).join("")}</div>`
                                : `<div class="card-body small text-body-secondary">${Crm.t("crmNoUpcoming")} <button type="button" class="btn btn-link btn-sm p-0" data-ujmegt="1">${Crm.t("crmNewViewing")}</button></div>`}
                        </div>
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
            if (Crm.ter && typeof CrmReq !== "undefined") CrmReq.gyorsKot(body);
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
        root.querySelectorAll("[data-eredmeny]").forEach(b => b.onclick = e => { e.preventDefault(); Crm.megtNyit(b.dataset.eredmeny, true); });
        root.querySelectorAll("[data-megt]").forEach(b => b.onclick = e => { e.preventDefault(); Crm.megtNyit(b.dataset.megt); });
        root.querySelectorAll("[data-ujmegt]").forEach(b => b.onclick = () => Crm.megtSzerk(null));
        root.querySelectorAll("[data-ingatlan]").forEach(b => b.onclick = e => { e.preventDefault(); Crm.ingatlanNyit(b.dataset.ingatlan); });
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

    static nezetValto() {
        return `
            <div class="btn-group btn-group-sm" role="group" aria-label="${Crm.esc(Crm.t("crmViewMode"))}">
                <button type="button" class="btn ${Crm.ugyfelNezet === "lista" ? "btn-primary" : "btn-outline-secondary"}" data-unezet="lista"><i class="fa-solid fa-list" aria-hidden="true"></i> ${Crm.t("crmViewList")}</button>
                <button type="button" class="btn ${Crm.ugyfelNezet === "tabla" ? "btn-primary" : "btn-outline-secondary"}" data-unezet="tabla"><i class="fa-solid fa-table-columns" aria-hidden="true"></i> ${Crm.t("crmViewBoard")}</button>
            </div>`;
    }

    static nezetValtoKot(body) {
        body.querySelectorAll("[data-unezet]").forEach(b => b.onclick = () => { Crm.ugyfelNezet = b.dataset.unezet; Crm.ugyfelek(body); });
    }

    // Ügyfelek: felül a fázisok (fülek darabszámmal), alatta a kereső és a gyors szűrők
    // (gombok, nem lenyíló listák), a lista kártyákból áll: ki, milyen fázisban, mi a
    // következő lépés (megtekintés / feladat), melyik ingatlan, mikor beszéltetek utoljára.
    static FAZIS_FULEK = ["nyitott", "uj", "kapcsolat", "aktiv", "targyalas", "nyert", "lezart", ""];

    static ugyfelek(body) {
        if (Crm.ugyfelNezet === "tabla") return Crm.kanban(body);
        const f = Crm.szuro;
        if (f.fokusz === undefined) f.fokusz = "";
        Crm.betolt(body);
        const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
        Crm.api("/ugyfelek?" + qs).then(v => {
            const L = v.ugyfelek;
            const esc = Crm.esc;
            const fz = v.fazisok || {};
            const db = k => k === "nyitott" ? Crm.NYITOTT.reduce((s, a) => s + (fz[a] || 0), 0)
                : k === "lezart" ? (fz.elvesztett || 0) + (fz.inaktiv || 0)
                : k === "" ? Object.values(fz).reduce((s, n) => s + n, 0) : (fz[k] || 0);
            const fk = v.fokusz || {};
            const tobbTag = Crm.vezeto && Crm.tagok.length > 1;
            const szurt = !!(f.q || f.szerep || f.felelos || f.cimke || f.fokusz);

            const kovetkezo = u => {
                if (u.kov_megt) return `<span class="crmNext megt"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${Crm.t("crmNextViewing", { ido: Crm.hatarido(u.kov_megt) })}${u.kov_megt_cim ? `<small>${esc(u.kov_megt_cim)}</small>` : ""}</span>`;
                if (u.kov_feladat) return `<span class="crmNext ${Crm.kesik(u.kov_feladat) ? "late" : "task"}"><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${esc(u.kov_feladat_cim || Crm.t("crmTask"))}<small>${Crm.kesik(u.kov_feladat) ? Crm.t("crmLateSince", { ido: Crm.hatarido(u.kov_feladat) }) : Crm.hatarido(u.kov_feladat)}</small></span>`;
                if (Crm.NYITOTT.includes(u.allapot)) return `<span class="crmNext none"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> ${Crm.t("crmNoNextStep")}</span>`;
                return `<span class="crmNext done">–</span>`;
            };

            body.innerHTML = `
                <div class="crmPhaseTabs" role="tablist" aria-label="${esc(Crm.t("crmStatus"))}">
                    ${Crm.FAZIS_FULEK.map(k => `
                        <button type="button" role="tab" class="crmPhaseTab ph-${k || "mind"} ${f.allapot === k ? "active" : ""}" aria-selected="${f.allapot === k}" data-fazis="${k}">
                            <span>${Crm.t(k === "nyitott" ? "crmOpen" : k === "lezart" ? "crmPhaseClosed" : k === "" ? "crmPhaseAll" : "crmSt_" + k)}</span>
                            <b>${db(k)}</b>
                        </button>`).join("")}
                </div>

                <div class="crmToolbar">
                    <div class="crmSearchBox">
                        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                        <input type="search" class="form-control" id="crmQ" placeholder="${esc(Crm.t("crmSearchPh"))}" value="${esc(f.q)}" aria-label="${esc(Crm.t("crmSearch"))}">
                    </div>
                    <div class="crmToolRight">
                        ${Crm.nezetValto()}
                        <a class="btn btn-sm btn-outline-secondary" href="/api/crm/${Crm.ter}/export.csv" download title="${esc(Crm.t("crmExport"))}" aria-label="${esc(Crm.t("crmExport"))}"><i class="fa-solid fa-file-csv" aria-hidden="true"></i></a>
                    </div>
                </div>

                <div class="crmChipRows">
                    <div class="crmChipRow" role="group" aria-label="${esc(Crm.t("crmFocus"))}">
                        <span class="crmChipLabel">${Crm.t("crmFocus")}</span>
                        ${[["lepes", "fa-circle-exclamation"], ["kesik", "fa-clock"], ["hideg", "fa-snowflake"]].map(([k, i]) => `
                            <button type="button" class="crmChip ${f.fokusz === k ? "active" : ""}" data-fokusz="${k}" aria-pressed="${f.fokusz === k}">
                                <i class="fa-solid ${i}" aria-hidden="true"></i> ${Crm.t("crmFocus_" + k)} <b>${fk[k] || 0}</b>
                            </button>`).join("")}
                    </div>
                    <div class="crmChipRow" role="group" aria-label="${esc(Crm.t("crmRoles"))}">
                        <span class="crmChipLabel">${Crm.t("crmWho")}</span>
                        <button type="button" class="crmChip ${!f.szerep ? "active" : ""}" data-szerep="">${Crm.t("crmAllRoles")}</button>
                        ${Crm.SZEREPEK.map(r => `<button type="button" class="crmChip ${f.szerep === r ? "active" : ""}" data-szerep="${r}">${Crm.t("crmRole_" + r)}</button>`).join("")}
                    </div>
                    ${tobbTag ? `
                    <div class="crmChipRow" role="group" aria-label="${esc(Crm.t("crmOwner"))}">
                        <span class="crmChipLabel">${Crm.t("crmOwner")}</span>
                        <button type="button" class="crmChip ${!f.felelos ? "active" : ""}" data-felelos="">${Crm.t("crmAllOwners")}</button>
                        ${Crm.tagok.map(t => `<button type="button" class="crmChip ${String(f.felelos) === String(t.id) ? "active" : ""}" data-felelos="${t.id}">${esc(t.id === Crm.en ? Crm.t("crmMeChip") : t.nev)}</button>`).join("")}
                        <button type="button" class="crmChip warn ${f.felelos === "nincs" ? "active" : ""}" data-felelos="nincs">${Crm.t("crmNoOwner")}</button>
                    </div>` : ""}
                    ${v.cimkek.length ? `
                    <div class="crmChipRow" role="group" aria-label="${esc(Crm.t("crmTags"))}">
                        <span class="crmChipLabel">${Crm.t("crmTags")}</span>
                        ${v.cimkek.map(c => `<button type="button" class="crmChip tag ${f.cimke === c ? "active" : ""}" data-cimke="${esc(c)}">#${esc(c)}</button>`).join("")}
                    </div>` : ""}
                </div>

                <div class="crmListHead">
                    <span class="small text-body-secondary">${Crm.t("crmCount", { n: L.length })}${szurt ? ` · <button type="button" class="btn btn-link btn-sm p-0" id="crmSzuroTorol">${Crm.t("crmFilterClear")}</button>` : ""}</span>
                    <label class="small text-body-secondary d-flex align-items-center gap-2">${Crm.t("crmSort")}
                        <select class="form-select form-select-sm w-auto" id="crmFRend">
                            ${["friss", "kapcsolat", "uj", "nev"].map(r => `<option value="${r}" ${f.rend === r ? "selected" : ""}>${Crm.t("crmSort_" + r)}</option>`).join("")}
                        </select>
                    </label>
                </div>

                ${L.length ? `
                <div class="crmClientList">
                    ${L.map(u => `
                        <article class="crmClient st-${esc(u.allapot)}" data-sor="${u.id}" tabindex="0" aria-label="${esc(u.nev)}">
                            <div class="crmClientMain">
                                <span class="crmAvatar" aria-hidden="true">${esc((u.nev || "?").trim().split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase())}</span>
                                <div class="min-w-0">
                                    <button type="button" class="btn btn-link p-0 fw-semibold text-start crmClientName" data-ugyfel="${u.id}">${esc(u.nev)}</button>
                                    <div class="crmClientMeta">
                                        ${Crm.allapotBadge(u.allapot)} ${Crm.szerepek(u.szerepek)}
                                        ${(u.cimkek || []).map(c => `<span class="crmTag">#${esc(c)}</span>`).join(" ")}
                                    </div>
                                    <div class="crmClientContact small">
                                        ${u.telefon ? `<a href="tel:${esc(u.telefon)}"><i class="fa-solid fa-phone" aria-hidden="true"></i> ${esc(u.telefon)}</a>` : ""}
                                        ${u.email && !/@teszt\.invalid$/.test(u.email) ? `<a href="mailto:${esc(u.email)}" class="text-truncate"><i class="fa-regular fa-envelope" aria-hidden="true"></i> ${esc(u.email)}</a>` : ""}
                                    </div>
                                </div>
                            </div>
                            <div class="crmClientNext">
                                <span class="crmColLabel">${Crm.t("crmNextStep")}</span>
                                ${kovetkezo(u)}
                            </div>
                            <div class="crmClientProp">
                                <span class="crmColLabel">${Crm.t("crmProps")}</span>
                                ${u.elso_ingatlan ? `<span class="text-truncate"><i class="fa-solid fa-house" aria-hidden="true"></i> ${esc(u.elso_ingatlan)}</span>${u.ingatlan_db > 1 ? `<small>+${u.ingatlan_db - 1}</small>` : ""}` : `<span class="text-body-secondary">–</span>`}
                            </div>
                            <div class="crmClientLast">
                                <span class="crmColLabel">${Crm.t("crmLastContact")}</span>
                                <span class="${u.utolso_kapcsolat && (Date.now() - new Date(u.utolso_kapcsolat).getTime()) > 14 * 86400000 && Crm.NYITOTT.includes(u.allapot) ? "text-warning fw-semibold" : ""}">${u.utolso_kapcsolat ? Utils.ago(u.utolso_kapcsolat) : Crm.t("crmNever")}</span>
                                ${tobbTag ? `<small>${esc(u.felelos_nev || Crm.t("crmNoOwner"))}</small>` : ""}
                            </div>
                        </article>`).join("")}
                </div>` : `
                <div class="emptyState">
                    <i class="fa-solid fa-address-book"></i>
                    <h5>${Crm.t(szurt || f.allapot !== "nyitott" ? "crmNoMatch" : "crmEmpty")}</h5>
                    <p>${Crm.t("crmEmptyHint")}</p>
                    <button type="button" class="btn btn-primary btn-sm" id="crmUres"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${Crm.t("crmNewContact")}</button>
                </div>`}`;

            const ujra = () => Crm.ugyfelek(body);
            let t = null;
            body.querySelector("#crmQ").oninput = e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; ujra(); }, 350); };
            body.querySelectorAll("[data-fazis]").forEach(b => b.onclick = () => { f.allapot = b.dataset.fazis; ujra(); });
            body.querySelectorAll("[data-fokusz]").forEach(b => b.onclick = () => { f.fokusz = f.fokusz === b.dataset.fokusz ? "" : b.dataset.fokusz; ujra(); });
            body.querySelectorAll("[data-szerep]").forEach(b => b.onclick = () => { f.szerep = b.dataset.szerep; ujra(); });
            body.querySelectorAll("[data-felelos]").forEach(b => b.onclick = () => { f.felelos = b.dataset.felelos; ujra(); });
            body.querySelectorAll("[data-cimke]").forEach(b => b.onclick = () => { f.cimke = f.cimke === b.dataset.cimke ? "" : b.dataset.cimke; ujra(); });
            body.querySelector("#crmFRend").onchange = e => { f.rend = e.target.value; ujra(); };
            const tor = body.querySelector("#crmSzuroTorol");
            if (tor) tor.onclick = () => { Object.assign(f, { q: "", szerep: "", felelos: "", cimke: "", fokusz: "" }); ujra(); };
            const u = body.querySelector("#crmUres");
            if (u) u.onclick = () => Crm.ugyfelSzerk(null);
            Crm.nezetValtoKot(body);
            body.querySelectorAll("[data-sor]").forEach(el => {
                el.onclick = e => { if (e.target.closest("a,button")) return; Crm.ugyfelNyit(el.dataset.sor); };
                el.onkeydown = e => { if (e.key === "Enter" && e.target === el) Crm.ugyfelNyit(el.dataset.sor); };
            });
            Crm.kotesek(body);
            if (f.q) { const q = body.querySelector("#crmQ"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
        }).catch(e => { body.innerHTML = `<div class="alert alert-danger">${Crm.hiba(e)}</div>`; });
    }

    // ---------- Új / szerkesztés ----------

    static ugyfelSzerk(u, utana) {
        const uj = !u || !u.id;
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
                    <div class="col-md-3"><label class="form-label small mb-1" for="csTel2">${Crm.t("crmPhone2")}</label><input class="form-control form-control-sm" id="csTel2" type="tel" maxlength="40" value="${esc(u.telefon2)}"></div>
                    <div class="col-md-6"><label class="form-label small mb-1" for="csCim">${Crm.t("crmAddress")}</label><input class="form-control form-control-sm" id="csCim" maxlength="200" value="${esc(u.cim)}"></div>
                    <div class="col-md-3"><label class="form-label small mb-1" for="csMod">${Crm.t("crmPrefContact")}</label>
                        <select class="form-select form-select-sm" id="csMod"><option value="">–</option>${["telefon", "whatsapp", "sms", "email", "barmely"].map(m => `<option value="${m}" ${u.kapcsolat_mod === m ? "selected" : ""}>${Crm.t("crmMod_" + m)}</option>`).join("")}</select></div>
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
                    <div class="col-12">
                        <div class="form-check crmConsent">
                            <input class="form-check-input" type="checkbox" id="csHozza" ${u.hozzajarulas ? "checked" : ""}>
                            <label class="form-check-label small" for="csHozza">${Crm.t("crmConsent")}${u.hozzajarulas ? ` <span class="text-body-secondary">(${Crm.nap(u.hozzajarulas)})</span>` : ""}</label>
                        </div>
                    </div>
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
                telefon2: $("#csTel2").value, cim: $("#csCim").value, kapcsolat_mod: $("#csMod").value, hozzajarulas: $("#csHozza").checked,
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
        Crm.adatlapFul = "attekintes";
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

            const most = new Date();
            const tervezett = u.megtekintesek.filter(m => m.statusz === "tervezett" && Crm.helyi(m.kezdet) >= new Date(most.getTime() - 3 * 3600000)).sort((x, y) => String(x.kezdet).localeCompare(String(y.kezdet)));
            const multbeli = u.megtekintesek.filter(m => !tervezett.includes(m));
            const kovF = [...nyitottF].sort((x, y) => String(x.hatarido || "9").localeCompare(String(y.hatarido || "9")))[0];
            const kovM = tervezett[0];
            const nyitott = Crm.NYITOTT.includes(u.allapot);
            const lepesSzam = Crm.NYITOTT.concat(["nyert"]);
            const lepesIdx = lepesSzam.indexOf(u.allapot);
            const tel = u.telefon ? String(u.telefon).replace(/[^0-9+]/g, "") : "";
            const wa = u.telefon ? String(u.telefon).replace(/[^0-9]/g, "").replace(/^0/, "40") : "";
            const fulek = [
                ["attekintes", "fa-solid fa-user", Crm.t("crmTabOverview"), ""],
                ["ingatlanok", "fa-solid fa-house", Crm.t("crmProps"), u.ingatlanok.length],
                ["megtekintesek", "fa-regular fa-calendar", Crm.t("crmViewings"), u.megtekintesek.length],
                ["feladatok", "fa-solid fa-list-check", Crm.t("crmTasks"), nyitottF.length],
                ...(Crm.ter ? [["iratok", "fa-solid fa-folder-open", Crm.t("dcTitle"), (u.iratok || []).length]] : []),
                ["elozmenyek", "fa-solid fa-timeline", Crm.t("crmTimeline"), ""]
            ];
            if (!fulek.some(x => x[0] === Crm.adatlapFul)) Crm.adatlapFul = "attekintes";
            const ful = Crm.adatlapFul;

            const tevLista = lista => `
                <ol class="crmTimeline">
                    ${lista.map(t => `
                        <li class="crmTl crmTl-${esc(t.tipus)}">
                            <span class="crmTlIcon" aria-hidden="true"><i class="${(Crm.TEV.find(x => x.k === t.tipus) || { ikon: "fa-solid fa-circle-info" }).ikon}"></i></span>
                            <div class="flex-fill min-w-0">
                                <div class="small"><b>${Crm.tevCim(t)}</b> <span class="text-body-secondary">· ${Crm.idopont(t.created_at)}${t.user_nev ? ` · ${esc(t.user_nev)}` : ""}</span>
                                    ${t.tipus !== "rendszer" && (Crm.vezeto || t.user_id === Crm.en) && t.user_id ? `<button type="button" class="btn btn-link btn-sm p-0 ms-1 text-body-secondary" data-tevtorol="${t.id}" aria-label="${esc(Crm.t("crmDelete"))}"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>` : ""}</div>
                                ${t.tipus !== "rendszer" && t.szoveg ? `<div class="crmTlText">${Crm.tevSzoveg(t)}</div>` : ""}
                                ${t.ingatlan_id ? `<a class="small" href="#listing/${t.ingatlan_id}"><i class="fa-solid fa-house" aria-hidden="true"></i> ${esc(t.ingatlan_cim || "#" + t.ingatlan_id)}</a>` : ""}
                            </div>
                        </li>`).join("")}
                </ol>`;

            tartalom.innerHTML = `
                <div class="modal-header crmHead crmDetailHead">
                    <div class="d-flex align-items-center gap-3 min-w-0 flex-fill">
                        <span class="crmAvatar lg" aria-hidden="true">${esc((u.nev || "?").trim().split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase())}</span>
                        <div class="min-w-0">
                            <h5 class="modal-title text-truncate">${esc(u.nev)}</h5>
                            <div class="d-flex flex-wrap gap-1 align-items-center mt-1">
                                ${Crm.szerepek(u.szerepek)} ${(u.cimkek || []).map(c => `<span class="crmTag">#${esc(c)}</span>`).join(" ")}
                                <span class="small text-body-secondary ms-1"><i class="fa-regular fa-user" aria-hidden="true"></i> ${Crm.vezeto && Crm.tagok.length > 1
                                    ? `<select class="form-select form-select-sm d-inline-block w-auto py-0" id="cuFelelos" aria-label="${esc(Crm.t("crmOwner"))}">${Crm.tagOpciok(u.felelos_id)}</select>`
                                    : esc(u.felelos_nev || Crm.t("crmNoOwner"))}</span>
                            </div>
                        </div>
                    </div>
                    <div class="crmQuickActs">
                        ${tel ? `<a class="btn btn-sm btn-outline-primary" href="tel:${esc(tel)}" title="${esc(u.telefon)}"><i class="fa-solid fa-phone" aria-hidden="true"></i><span>${Crm.t("crmCall")}</span></a>` : ""}
                        ${wa ? `<a class="btn btn-sm btn-outline-success" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>WhatsApp</span></a>` : ""}
                        ${u.email ? `<a class="btn btn-sm btn-outline-secondary" href="mailto:${esc(u.email)}"><i class="fa-regular fa-envelope" aria-hidden="true"></i><span>E-mail</span></a>` : ""}
                        <button type="button" class="btn btn-sm btn-outline-secondary" id="cuSzerk"><i class="fa-solid fa-pen" aria-hidden="true"></i><span>${Crm.t("crmEdit")}</span></button>
                    </div>
                    <button type="button" class="btn-close ms-2" data-bs-dismiss="modal" aria-label="${esc(Crm.t("crmClose"))}"></button>
                </div>

                <div class="crmStageBar">
                    <ol class="crmStages" aria-label="${esc(Crm.t("crmStatus"))}">
                        ${lepesSzam.map((a, n) => `
                            <li><button type="button" class="crmStage ${a === u.allapot ? "current" : lepesIdx > -1 && n < lepesIdx ? "done" : ""}" data-allapot="${a}" ${a === u.allapot ? 'aria-current="step"' : ""}>
                                <span class="crmStageDot">${lepesIdx > -1 && n < lepesIdx ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : n + 1}</span><span>${Crm.t("crmSt_" + a)}</span>
                            </button></li>`).join("")}
                    </ol>
                    <div class="crmStageSide">
                        ${["elvesztett", "inaktiv"].map(a => `<button type="button" class="btn btn-sm ${u.allapot === a ? "btn-secondary" : "btn-outline-secondary"}" data-allapot="${a}">${Crm.t("crmSt_" + a)}</button>`).join("")}
                    </div>
                    <p class="crmStageHint small mb-0"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${Crm.t("crmStHint_" + u.allapot)}</p>
                </div>

                <div class="crmNextBox ${kovM || kovF ? "" : nyitott ? "warn" : "quiet"}">
                    <div class="flex-fill min-w-0">
                        <span class="crmColLabel">${Crm.t("crmNextStep")}</span>
                        ${kovM ? `<div class="fw-semibold"><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${Crm.t("crmNextViewing", { ido: Crm.hatarido(kovM.kezdet) })} ${kovM.ingatlan_cim || kovM.hely ? `<span class="fw-normal text-body-secondary">· ${esc(kovM.ingatlan_cim || kovM.hely)}</span>` : ""}</div>` : ""}
                        ${kovF ? `<div class="${kovM ? "small" : "fw-semibold"} ${Crm.kesik(kovF.hatarido) ? "text-danger" : ""}"><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${esc(kovF.cim)} <span class="fw-normal">· ${kovF.hatarido ? Crm.hatarido(kovF.hatarido) : ""}</span></div>` : ""}
                        ${!kovM && !kovF ? `<div class="fw-semibold">${Crm.t(nyitott ? "crmNoNextStepLong" : "crmClosedNoStep")}</div>` : ""}
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                        <button type="button" class="btn btn-sm btn-primary" id="cuMegtUj"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${Crm.t("crmNewViewing")}</button>
                        <button type="button" class="btn btn-sm btn-outline-primary" id="cuFelUj"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${Crm.t("crmNewTask")}</button>
                    </div>
                </div>

                <div class="crmDetailTabs" role="tablist">
                    ${fulek.map(([k, i, c, n]) => `
                        <button type="button" role="tab" class="crmDetailTab ${k === ful ? "active" : ""}" data-dful="${k}" aria-selected="${k === ful}">
                            <i class="${i}" aria-hidden="true"></i> ${c}${n !== "" && n ? ` <span class="badge rounded-pill text-bg-light">${n}</span>` : ""}
                        </button>`).join("")}
                </div>

                <div class="modal-body crmDetailBody">
                    <section data-dpanel="attekintes" ${ful === "attekintes" ? "" : "hidden"}>
                        <div class="row g-4">
                            <div class="col-lg-5">
                                <div class="crmCard">
                                    <h6><i class="fa-solid fa-id-card" aria-hidden="true"></i> ${Crm.t("crmData")}</h6>
                                    <dl class="crmDl">
                                        ${u.telefon ? `<dt>${Crm.t("crmPhone")}</dt><dd><a href="tel:${esc(tel)}">${esc(u.telefon)}</a>${u.telefon2 ? `<br><a href="tel:${esc(u.telefon2)}">${esc(u.telefon2)}</a>` : ""}</dd>` : ""}
                                        ${u.email ? `<dt>E-mail</dt><dd class="text-truncate"><a href="mailto:${esc(u.email)}">${esc(u.email)}</a></dd>` : ""}
                                        ${u.cim ? `<dt>${Crm.t("crmAddress")}</dt><dd>${esc(u.cim)}</dd>` : ""}
                                        ${u.kapcsolat_mod ? `<dt>${Crm.t("crmPrefContact")}</dt><dd>${Crm.t("crmMod_" + u.kapcsolat_mod)}</dd>` : ""}
                                        ${u.forras ? `<dt>${Crm.t("crmSource")}</dt><dd>${Crm.t("crmSrc_" + u.forras)}</dd>` : ""}
                                        <dt>${Crm.t("crmCreated")}</dt><dd>${Crm.nap(u.created_at)}</dd>
                                        <dt>${Crm.t("crmLastContact")}</dt><dd>${u.utolso_kapcsolat ? Utils.ago(u.utolso_kapcsolat) : Crm.t("crmNever")}</dd>
                                        <dt>GDPR</dt><dd class="${u.hozzajarulas ? "text-success" : "text-warning"}">${u.hozzajarulas ? Crm.t("crmConsentYes", { d: Crm.nap(u.hozzajarulas) }) : Crm.t("crmConsentNo")}</dd>
                                    </dl>
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
                            </div>
                            <div class="col-lg-7">
                                <div class="crmCard crmLog">
                                    <h6><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> ${Crm.t("crmLogTitle")}</h6>
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
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <h6 class="mb-0"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> ${Crm.t("crmRecentHere")}</h6>
                                        ${u.tevekenysegek.length > 5 ? `<button type="button" class="btn btn-link btn-sm p-0" data-dful="elozmenyek">${Crm.t("crmAll")}</button>` : ""}
                                    </div>
                                    ${u.tevekenysegek.length ? tevLista(u.tevekenysegek.slice(0, 5)) : `<p class="small text-body-secondary mb-0">${Crm.t("crmRecentNone")}</p>`}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section data-dpanel="ingatlanok" ${ful === "ingatlanok" ? "" : "hidden"}>
                        <div class="crmCard">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h6 class="mb-0"><i class="fa-solid fa-house" aria-hidden="true"></i> ${Crm.t("crmProps")}</h6>
                                <button type="button" class="btn btn-sm btn-outline-primary" id="cuIngUj"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${Crm.t("crmLinkProp")}</button>
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
                                    <span class="small text-body-secondary">${Crm.t("crmLinkRole_" + x.szerep)} · ${x.szerep !== "tulajdonos" ? `<button type="button" class="btn btn-link btn-sm p-0" data-ujmegtI="${x.id}">${Crm.t("crmViewingShort")}</button> · ` : ""}${x.szerep !== "tulajdonos" && u.user_id && Crm.ter ? `<button type="button" class="btn btn-link btn-sm p-0" data-ajmeghiv="${x.id}" title="${esc(Crm.t("mkInviteOfferHint"))}">${Crm.t("mkInviteOffer")}</button> · ` : ""}<button type="button" class="btn btn-link btn-sm p-0 text-danger" data-levesz="${x.id}">${Crm.t("crmUnlink")}</button></span>
                                </div>`)).join("") : `<p class="small text-body-secondary mb-0">${Crm.t("crmPropsNone")}</p>`}
                        </div>
                        ${u.ajanlatok && u.ajanlatok.length ? `
                        <div class="crmCard">
                            <h6><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${Crm.t("ofOffers")}</h6>
                            ${u.ajanlatok.map(o => `
                                <div class="d-flex justify-content-between gap-2 small border-top pt-1 mt-1">
                                    <span class="text-truncate">${esc(o.ingatlan_cim || o.kulso_link || "")}</span>
                                    <span class="text-nowrap"><b>${esc(Crm.penz(o.osszeg, o.penznem))}</b> ${Crm.ajanlatBadge(o.statusz)}</span>
                                </div>`).join("")}
                        </div>` : ""}
                    </section>

                    <section data-dpanel="megtekintesek" ${ful === "megtekintesek" ? "" : "hidden"}>
                        <div class="crmCard">
                            <h6><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${Crm.t("crmViewPlanned")} <span class="badge rounded-pill text-bg-light">${tervezett.length}</span></h6>
                            ${tervezett.length ? `<div class="list-group list-group-flush">${tervezett.map(m => Crm.megtSor(m, "ugyfel")).join("")}</div>` : `<p class="small text-body-secondary mb-0">${Crm.t("crmNoViewings")}</p>`}
                        </div>
                        <div class="crmCard">
                            <h6><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> ${Crm.t("crmViewPast")} <span class="badge rounded-pill text-bg-light">${multbeli.length}</span></h6>
                            ${multbeli.length ? `<div class="list-group list-group-flush">${multbeli.map(m => Crm.megtSor(m, "ugyfel")).join("")}</div>` : `<p class="small text-body-secondary mb-0">–</p>`}
                        </div>
                    </section>

                    <section data-dpanel="feladatok" ${ful === "feladatok" ? "" : "hidden"}>
                        <div class="crmCard">
                            <h6><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${Crm.t("crmTasks")}</h6>
                            ${nyitottF.length ? `<div class="list-group list-group-flush">${nyitottF.map(f => Crm.feladatSor(f, true)).join("")}</div>` : `<p class="small text-body-secondary mb-0">${Crm.t("crmNoOpenTasks")}</p>`}
                            ${keszF.length ? `<details class="mt-2"><summary class="small text-body-secondary">${Crm.t("crmDoneTasks", { n: keszF.length })}</summary><div class="list-group list-group-flush">${keszF.map(f => Crm.feladatSor(f, true)).join("")}</div></details>` : ""}
                        </div>
                    </section>

                    ${Crm.ter ? `<section data-dpanel="iratok" ${ful === "iratok" ? "" : "hidden"}>${CrmDocs.kartya(u)}</section>` : ""}

                    <section data-dpanel="elozmenyek" ${ful === "elozmenyek" ? "" : "hidden"}>
                        <div class="crmCard">
                            ${u.tevekenysegek.length ? tevLista(u.tevekenysegek) : `<p class="small text-body-secondary mb-0">${Crm.t("crmRecentNone")}</p>`}
                        </div>
                    </section>
                </div>`;

            // Belső fülek (újrarajzolás nélkül)
            tartalom.querySelectorAll("[data-dful]").forEach(b => b.onclick = () => {
                Crm.adatlapFul = b.dataset.dful;
                tartalom.querySelectorAll("[data-dpanel]").forEach(p => { p.hidden = p.dataset.dpanel !== Crm.adatlapFul; });
                tartalom.querySelectorAll(".crmDetailTab").forEach(t => { const on = t.dataset.dful === Crm.adatlapFul; t.classList.toggle("active", on); t.setAttribute("aria-selected", on); });
            });

            const $ = s => tartalom.querySelector(s);
            const ujra = () => { Crm.adatlap(u.id, tartalom, modal); Crm.frissit(); };

            $("#cuSzerk").onclick = () => Crm.ugyfelSzerk(u, () => ujra());
            tartalom.querySelectorAll("[data-allapot]").forEach(b => b.onclick = () => {
                if (b.dataset.allapot === u.allapot) return;
                Crm.api(`/ugyfelek/${u.id}`, { method: "PATCH", body: { allapot: b.dataset.allapot } }).then(() => { Crm.jelez(Crm.t("crmStatusSaved", { st: Crm.t("crmSt_" + b.dataset.allapot) })); ujra(); }).catch(err => alert(Crm.hiba(err)));
            });
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
            if (Crm.ter) CrmDocs.kot(tartalom, u, ujra);
            $("#cuMegtUj").onclick = () => Crm.megtSzerk({ ugyfel_id: u.id, ugyfel_nev: u.nev, felelos_id: u.felelos_id || Crm.en }, ujra);
            tartalom.querySelectorAll("[data-ujmegtI]").forEach(b => b.onclick = () => {
                const ing = u.ingatlanok.find(x => String(x.id) === b.dataset.ujmegti);
                Crm.megtSzerk({ ugyfel_id: u.id, ugyfel_nev: u.nev, ingatlan_id: ing.id, ingatlan_cim: ing.cim, felelos_id: u.felelos_id || Crm.en }, ujra);
            });
            tartalom.querySelectorAll("[data-ajmeghiv]").forEach(b => b.onclick = () => {
                if (!confirm(Crm.t("mkInviteOfferConfirm"))) return;
                Crm.api(`/ugyfelek/${u.id}/ajanlat-engedely`, { method: "POST", body: { ingatlan_id: Number(b.dataset.ajmeghiv) } })
                    .then(() => { Crm.jelez(Crm.t("mkInviteOfferSent")); ujra(); }).catch(e => alert(Crm.hiba(e)));
            });
            tartalom.querySelectorAll("[data-megt]").forEach(b => b.onclick = e => { e.preventDefault(); Crm.megtNyit(b.dataset.megt, false, ujra); });
            tartalom.querySelectorAll("[data-eredmeny]").forEach(b => b.onclick = e => { e.preventDefault(); Crm.megtNyit(b.dataset.eredmeny, true, ujra); });

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

    // A bejegyzés szövege (a megtekintés eredményénél az érdeklődés jelölése lefordítva)
    static tevSzoveg(t) {
        const m = String(t.szoveg || "").match(/^\[(nagyon|talan|nem)\]\s*(.*)$/s);
        if (t.tipus === "megtekintes" && m) return `<span class="crmSt crmSt-${m[1] === "nagyon" ? "nyert" : m[1] === "nem" ? "elvesztett" : "targyalas"}">${Crm.t("crmInt_" + m[1])}</span> ${Crm.esc(m[2] === "–" ? "" : m[2])}`;
        return Crm.esc(t.szoveg);
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
        if (s === "letrehozva_ajanlatbol") return Crm.t("ofSys_created");
        if (s === "letrehozva_megtekintesbol") return Crm.t("mkSys_created");
        if (s === "letrehozva_hivasbol") return Crm.t("mkSys_fromCall");
        if (s === "mk_lemondva") return Crm.t("mkSys_cancelled");
        if (s === "ajanlat_meghivo") return Crm.t("mkSys_invited");
        if (s === "ajanlat_visszavonva") return Crm.t("ofSys_withdrawn");
        if (s.startsWith("ajanlat_")) {
            const [st, ossz] = s.slice(8).split(":");
            return Crm.t("ofSys_" + st) + (ossz ? " – " + Crm.esc(ossz) : "");
        }
        if (s.startsWith("irat_feltoltve:")) {
            const [, kulcs, ...nev] = s.split(":");
            return Crm.t("dcSys_uploaded", { nev: kulcs ? CrmDocs.nev({ kulcs, nev: nev.join(":") }) : Crm.esc(nev.join(":")) });
        }
        if (s.startsWith("megt_terv:")) return Crm.t("crmSys_viewPlan", { ido: Crm.hatarido(s.slice(10)) });
        if (s.startsWith("megt_elmaradt")) return Crm.t("crmSys_viewMissed") + (s.includes(":") ? " – " + Crm.esc(s.split(":").slice(1).join(":")) : "");
        if (s.startsWith("megt_lemondva")) return Crm.t("crmSys_viewCancelled") + (s.includes(":") ? " – " + Crm.esc(s.split(":").slice(1).join(":")) : "");
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

    // ===================== TÁBLA (állapot-oszlopok, húzással) =====================

    static kanban(body) {
        const f = Crm.szuro;
        Crm.betolt(body);
        const qs = new URLSearchParams(Object.entries({ ...f, allapot: "" }).filter(([, v]) => v)).toString();
        Crm.api("/ugyfelek?" + qs).then(v => {
            const esc = Crm.esc;
            const oszlopok = [...Crm.NYITOTT, "nyert", "elvesztett"];
            body.innerHTML = `
                <div class="crmFilters">
                    ${Crm.nezetValto()}
                    <input type="search" class="form-control form-control-sm" id="crmQ" placeholder="${esc(Crm.t("crmSearch"))}" value="${esc(f.q)}" aria-label="${esc(Crm.t("crmSearch"))}">
                    ${Crm.vezeto && Crm.tagok.length > 1 ? `
                    <select class="form-select form-select-sm" id="crmFFelelos" aria-label="${esc(Crm.t("crmOwner"))}">
                        <option value="">${Crm.t("crmAllOwners")}</option>
                        ${Crm.tagok.map(t => `<option value="${t.id}" ${String(f.felelos) === String(t.id) ? "selected" : ""}>${esc(t.nev)}</option>`).join("")}
                    </select>` : ""}
                </div>
                <p class="small text-body-secondary">${Crm.t("crmBoardHelp")}</p>
                <div class="crmBoard">
                    ${oszlopok.map(a => {
                        const L = v.ugyfelek.filter(u => u.allapot === a);
                        return `
                        <section class="crmCol" data-oszlop="${a}" aria-label="${esc(Crm.t("crmSt_" + a))}">
                            <h6 class="crmColHead">${Crm.allapotBadge(a)} <span class="text-body-secondary">${L.length}</span></h6>
                            <div class="crmColBody">
                                ${L.map(u => `
                                    <article class="crmKCard" draggable="true" data-kartya="${u.id}" tabindex="0">
                                        <b class="d-block text-truncate">${esc(u.nev)}</b>
                                        <div class="small text-body-secondary text-truncate">${Crm.szerepek(u.szerepek)}${u.telefon ? ` · ${esc(u.telefon)}` : ""}</div>
                                        <div class="small d-flex justify-content-between gap-2 mt-1">
                                            <span class="${u.kov_feladat && Crm.kesik(u.kov_feladat) ? "text-danger fw-semibold" : "text-body-secondary"}">${u.kov_feladat ? `<i class="fa-regular fa-clock" aria-hidden="true"></i> ${Crm.hatarido(u.kov_feladat)}` : ""}</span>
                                            ${Crm.vezeto && u.felelos_nev ? `<span class="text-body-secondary text-truncate">${esc(u.felelos_nev)}</span>` : ""}
                                        </div>
                                        <label class="visually-hidden" for="kSel${u.id}">${Crm.t("crmStatus")}</label>
                                        <select class="form-select form-select-sm crmKSel" id="kSel${u.id}" data-ksel="${u.id}">
                                            ${Crm.ALLAPOTOK.map(x => `<option value="${x}" ${x === a ? "selected" : ""}>${Crm.t("crmSt_" + x)}</option>`).join("")}
                                        </select>
                                    </article>`).join("") || `<p class="small text-body-secondary text-center my-3">${Crm.t("crmColEmpty")}</p>`}
                            </div>
                        </section>`;
                    }).join("")}
                </div>`;
            Crm.nezetValtoKot(body);
            let t = null;
            body.querySelector("#crmQ").oninput = e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; Crm.kanban(body); }, 350); };
            const ff = body.querySelector("#crmFFelelos");
            if (ff) ff.onchange = () => { f.felelos = ff.value; Crm.kanban(body); };

            const valt = (id, allapot) => Crm.api(`/ugyfelek/${id}`, { method: "PATCH", body: { allapot } })
                .then(() => { Crm.jelez(Crm.t("crmMoved", { a: Crm.t("crmSt_" + allapot) })); Crm.kanban(body); })
                .catch(e => alert(Crm.hiba(e)));
            body.querySelectorAll("[data-kartya]").forEach(k => {
                k.onclick = e => { if (e.target.closest("select")) return; Crm.ugyfelNyit(k.dataset.kartya); };
                k.onkeydown = e => { if (e.key === "Enter") Crm.ugyfelNyit(k.dataset.kartya); };
                k.ondragstart = e => { e.dataTransfer.setData("text/plain", k.dataset.kartya); k.classList.add("drag"); };
                k.ondragend = () => k.classList.remove("drag");
            });
            body.querySelectorAll("[data-ksel]").forEach(sel => sel.onchange = () => valt(sel.dataset.ksel, sel.value));
            body.querySelectorAll("[data-oszlop]").forEach(o => {
                o.ondragover = e => { e.preventDefault(); o.classList.add("over"); };
                o.ondragleave = () => o.classList.remove("over");
                o.ondrop = e => {
                    e.preventDefault();
                    o.classList.remove("over");
                    const id = e.dataTransfer.getData("text/plain");
                    const kartya = body.querySelector(`[data-kartya="${CSS.escape(id)}"]`);
                    if (id && kartya && kartya.closest("[data-oszlop]") !== o) valt(id, o.dataset.oszlop);
                };
            });
        }).catch(e => { body.innerHTML = `<div class="alert alert-danger">${Crm.hiba(e)}</div>`; });
    }

    // ===================== MEGTEKINTÉSEK =====================

    static megtIkon(st) {
        return { tervezett: "fa-regular fa-calendar", megtortent: "fa-solid fa-circle-check text-success", elmaradt: "fa-solid fa-user-xmark text-danger", lemondva: "fa-solid fa-ban text-body-secondary" }[st] || "fa-regular fa-calendar";
    }

    // Egy megtekintés sora (mezo: "ugyfel" = az ügyfél adatlapján – ott az ingatlan a fontos)
    static megtSor(m, mezo) {
        const esc = Crm.esc;
        const mult = m.statusz === "tervezett" && Crm.kesik(m.kezdet);
        return `
            <div class="list-group-item crmViewRow">
                <i class="${Crm.megtIkon(m.statusz)} crmViewIcon" aria-hidden="true"></i>
                <div class="flex-fill min-w-0">
                    <a href="#" class="fw-semibold" data-megt="${m.id}">${Crm.hatarido(m.kezdet)}</a>
                    <span class="small text-body-secondary"> · ${Crm.t("crmVSt_" + m.statusz)}${m.erdeklodes ? ` · ${Crm.t("crmInt_" + m.erdeklodes)}` : ""}</span>
                    <div class="small text-truncate">
                        ${mezo !== "ugyfel" && m.ugyfel_id ? `<a href="#" data-ugyfel="${m.ugyfel_id}">${esc(m.ugyfel_nev || "")}</a>` : ""}
                        ${m.ingatlan_id ? `${mezo !== "ugyfel" ? " · " : ""}<a href="#" data-ingatlan="${m.ingatlan_id}"><i class="fa-solid fa-house" aria-hidden="true"></i> ${esc(m.ingatlan_cim || "#" + m.ingatlan_id)}</a>` : ""}
                        ${Crm.vezeto && m.felelos_nev ? ` · <i class="fa-regular fa-user" aria-hidden="true"></i> ${esc(m.felelos_nev)}` : ""}
                    </div>
                </div>
                ${mult ? `<button type="button" class="btn btn-sm btn-warning text-nowrap" data-eredmeny="${m.id}">${Crm.t("crmRecordResult")}</button>` : ""}
            </div>`;
    }

    static hetfo(d) {
        const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
        return x;
    }

    static ymd(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    static megtekintesek(body) {
        if (!Crm.het) Crm.het = Crm.hetfo(new Date());
        const f = Crm.mSzuro;
        const tol = Crm.het;
        const ig = new Date(tol.getTime()); ig.setDate(ig.getDate() + 6);
        Crm.betolt(body);
        const qs = new URLSearchParams({ tol: Crm.ymd(tol), ig: Crm.ymd(ig), ...(f.felelos ? { felelos: f.felelos } : {}) }).toString();
        Crm.api("/megtekintesek?" + qs).then(L => {
            const esc = Crm.esc;
            const napok = [...Array(7)].map((_, n) => { const d = new Date(tol.getTime()); d.setDate(d.getDate() + n); return d; });
            const ma = Crm.ymd(new Date());
            body.innerHTML = `
                <div class="crmFilters">
                    <div class="btn-group btn-group-sm" role="group">
                        <button type="button" class="btn btn-outline-secondary" id="crmHetE" aria-label="${esc(Crm.t("crmPrevWeek"))}"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
                        <button type="button" class="btn btn-outline-secondary" id="crmHetMa">${Crm.t("crmThisWeek")}</button>
                        <button type="button" class="btn btn-outline-secondary" id="crmHetK" aria-label="${esc(Crm.t("crmNextWeek"))}"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
                    </div>
                    <b class="ms-1">${Crm.nap(tol)} – ${Crm.nap(ig)}</b>
                    ${Crm.vezeto && Crm.tagok.length > 1 ? `
                    <select class="form-select form-select-sm ms-auto" id="crmMFel" aria-label="${esc(Crm.t("crmOwner"))}">
                        <option value="">${Crm.t("crmEveryone")}</option>
                        <option value="en" ${f.felelos === "en" ? "selected" : ""}>${Crm.t("crmMine")}</option>
                        ${Crm.tagok.filter(t => t.id !== Crm.en).map(t => `<option value="${t.id}" ${String(f.felelos) === String(t.id) ? "selected" : ""}>${esc(t.nev)}</option>`).join("")}
                    </select>` : ""}
                </div>
                <div class="crmWeek">
                    ${napok.map(d => {
                        const k = Crm.ymd(d);
                        const nap = L.filter(m => String(m.kezdet).slice(0, 10) === k);
                        return `
                        <section class="crmDay ${k === ma ? "today" : ""}" aria-label="${esc(d.toLocaleDateString(Utils.locale(), { weekday: "long", month: "long", day: "numeric" }))}">
                            <header class="crmDayHead">
                                <span>${esc(d.toLocaleDateString(Utils.locale(), { weekday: "short" }))}</span>
                                <b>${d.getDate()}</b>
                                <button type="button" class="btn btn-sm btn-link p-0 ms-auto" data-napra="${k}" aria-label="${esc(Crm.t("crmNewViewing"))}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
                            </header>
                            ${nap.map(m => `
                                <button type="button" class="crmEvent st-${esc(m.statusz)}" data-megt="${m.id}">
                                    <span class="crmEventTime">${esc(String(m.kezdet).slice(11, 16))}</span>
                                    <span class="d-block fw-semibold text-truncate">${esc(m.ugyfel_nev || "")}</span>
                                    <span class="d-block small text-truncate">${esc(m.ingatlan_cim || "")}</span>
                                    ${Crm.vezeto && m.felelos_nev ? `<span class="d-block small text-truncate opacity-75">${esc(m.felelos_nev)}</span>` : ""}
                                </button>`).join("") || `<p class="small text-body-secondary text-center my-2 crmDayEmpty">–</p>`}
                        </section>`;
                    }).join("")}
                </div>
                <p class="small text-body-secondary mt-2">${Crm.t("crmWeekHelp")}</p>`;
            const lep = n => { Crm.het = new Date(Crm.het.getTime() + n * 7 * 86400000); Crm.megtekintesek(body); };
            body.querySelector("#crmHetE").onclick = () => lep(-1);
            body.querySelector("#crmHetK").onclick = () => lep(1);
            body.querySelector("#crmHetMa").onclick = () => { Crm.het = Crm.hetfo(new Date()); Crm.megtekintesek(body); };
            const mf = body.querySelector("#crmMFel");
            if (mf) mf.onchange = () => { f.felelos = mf.value; Crm.megtekintesek(body); };
            body.querySelectorAll("[data-napra]").forEach(b => b.onclick = () => Crm.megtSzerk({ kezdet: b.dataset.napra + "T10:00", felelos_id: Crm.en }));
            Crm.kotesek(body);
        }).catch(e => { body.innerHTML = `<div class="alert alert-danger">${Crm.hiba(e)}</div>`; });
    }

    // Ügyfél / ingatlan választó listák a megtekintés ablakához
    static valasztoAdat() {
        return Promise.all([
            Crm.api("/ugyfelek?allapot=").then(v => v.ugyfelek),
            Crm.api("/ingatlanok?statusz=aktiv").catch(() => [])
        ]);
    }

    static megtSzerk(m, utana) {
        const uj = !m || !m.id;
        m = m || {};
        const { tartalom, modal } = Svc.modal("crmMegt", "");
        const esc = Crm.esc;
        if (!m.kezdet) {
            const d = new Date(Date.now() + 86400000); d.setHours(10, 0, 0, 0);
            m.kezdet = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }
        tartalom.innerHTML = `<div class="modal-body text-center py-4"><span class="spinner-border spinner-border-sm text-primary" role="status"></span></div>`;
        modal.show();
        Crm.valasztoAdat().then(([ugyfelek, ingatlanok]) => {
            const ugyfelErtek = id => { const u = ugyfelek.find(x => x.id === Number(id)); return u ? `${u.nev}${u.telefon ? " · " + u.telefon : ""} [#${u.id}]` : ""; };
            const ingErtek = id => { const i = ingatlanok.find(x => x.id === Number(id)); return i ? `${i.cim || Types.label(i.tipus)}${i.ar ? " · " + Utils.eur(i.ar) : ""} [#${i.id}]` : (id ? `${m.ingatlan_cim || ""} [#${id}]` : ""); };
            tartalom.innerHTML = `
                <div class="modal-header">
                    <h5 class="modal-title">${Crm.t(uj ? "crmNewViewing" : "crmEditViewing")}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(Crm.t("crmClose"))}"></button>
                </div>
                <form class="modal-body" id="crmMegtForm" novalidate>
                    <label class="form-label small mb-1" for="cmUgyfel">${Crm.t("crmForContact")} *</label>
                    <input class="form-control mb-1" id="cmUgyfel" list="cmUgyfelL" autocomplete="off" value="${esc(ugyfelErtek(m.ugyfel_id) || (m.ugyfel_id ? `${m.ugyfel_nev || ""} [#${m.ugyfel_id}]` : ""))}" placeholder="${esc(Crm.t("crmPickContact"))}">
                    <datalist id="cmUgyfelL">${ugyfelek.map(u => `<option value="${esc(ugyfelErtek(u.id))}">`).join("")}</datalist>
                    <button type="button" class="btn btn-link btn-sm p-0 mb-3" id="cmUjUgyfel"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${Crm.t("crmNewContact")}</button>

                    <label class="form-label small mb-1 d-block" for="cmIngatlan">${Crm.t("crmProperty")}</label>
                    <input class="form-control mb-3" id="cmIngatlan" list="cmIngL" autocomplete="off" value="${esc(ingErtek(m.ingatlan_id))}" placeholder="${esc(Crm.t("crmPickProperty"))}">
                    <datalist id="cmIngL">${ingatlanok.map(i => `<option value="${esc(ingErtek(i.id))}">`).join("")}</datalist>

                    <div class="row g-2 mb-3">
                        <div class="col-7"><label class="form-label small mb-1" for="cmIdo">${Crm.t("crmWhen")} *</label><input type="datetime-local" class="form-control" id="cmIdo" value="${esc(String(m.kezdet).slice(0, 16))}"></div>
                        <div class="col-5"><label class="form-label small mb-1" for="cmHossz">${Crm.t("crmDuration")}</label>
                            <select class="form-select" id="cmHossz">${[15, 30, 45, 60, 90, 120].map(n => `<option value="${n}" ${(m.hossz_perc || 30) === n ? "selected" : ""}>${n} ${Crm.t("crmMinutes")}</option>`).join("")}</select></div>
                    </div>
                    ${Crm.vezeto && Crm.tagok.length > 1 ? `
                    <label class="form-label small mb-1" for="cmFelelos">${Crm.t("crmWhoGoes")}</label>
                    <select class="form-select mb-3" id="cmFelelos">${Crm.tagOpciok(m.felelos_id || Crm.en, false)}</select>` : ""}
                    <label class="form-label small mb-1" for="cmHely">${Crm.t("crmPlace")}</label>
                    <input class="form-control mb-3" id="cmHely" maxlength="200" value="${esc(m.hely)}" placeholder="${esc(Crm.t("crmPlacePh"))}">
                    <label class="form-label small mb-1" for="cmMegj">${Crm.t("crmNotes")}</label>
                    <textarea class="form-control" id="cmMegj" rows="2" maxlength="1000">${esc(m.megjegyzes)}</textarea>
                    <div class="alert alert-warning small py-2 mt-3" id="cmUtk" hidden></div>
                    <div class="alert alert-danger small py-2 mt-3" id="cmHiba" hidden></div>
                </form>
                <div class="modal-footer">
                    ${!uj ? `<button type="button" class="btn btn-outline-danger me-auto" id="cmTorol" aria-label="${esc(Crm.t("crmDelete"))}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>` : ""}
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${Crm.t("crmCancel")}</button>
                    <button type="submit" class="btn btn-primary" form="crmMegtForm" id="cmMent">${Crm.t("crmSave")}</button>
                </div>`;
            const $ = q => tartalom.querySelector(q);
            const idOf = v => { const x = String(v || "").match(/\[#(\d+)\]\s*$/); return x ? Number(x[1]) : null; };
            $("#cmUjUgyfel").onclick = () => { modal.hide(); Crm.ugyfelSzerk(null, v => Crm.megtSzerk({ ...m, ugyfel_id: v.id, ugyfel_nev: v.nev }, utana)); };
            let mindenkepp = false;
            const kuld = e => {
                if (e) e.preventDefault();
                const ugyfelId = idOf($("#cmUgyfel").value);
                if (!ugyfelId) { $("#cmUgyfel").classList.add("is-invalid"); $("#cmHiba").textContent = Crm.t("crmErr_contact_required"); $("#cmHiba").hidden = false; return; }
                if (!$("#cmIdo").value) { $("#cmIdo").classList.add("is-invalid"); return; }
                $("#cmMent").disabled = true;
                Crm.api(uj ? "/megtekintesek" : `/megtekintesek/${m.id}`, {
                    method: uj ? "POST" : "PUT",
                    body: { ugyfel_id: ugyfelId, ingatlan_id: idOf($("#cmIngatlan").value), kezdet: $("#cmIdo").value, hossz_perc: $("#cmHossz").value,
                        felelos_id: $("#cmFelelos") ? $("#cmFelelos").value : (m.felelos_id || Crm.en), hely: $("#cmHely").value, megjegyzes: $("#cmMegj").value, mindenkepp }
                }).then(() => { modal.hide(); Crm.jelez(Crm.t("crmViewingSaved")); if (utana) utana(); Crm.frissit(); })
                    .catch(err => {
                        $("#cmMent").disabled = false;
                        if (err.message === "overlap" && err.adat && err.adat.utkozes) {
                            $("#cmUtk").innerHTML = `${Crm.t("crmOverlap", { ido: esc(err.adat.utkozes.ido), cim: esc(err.adat.utkozes.cim || "") })}
                                <button type="button" class="btn btn-sm btn-outline-secondary ms-2" id="cmMeg">${Crm.t("crmSaveAnyway")}</button>`;
                            $("#cmUtk").hidden = false;
                            $("#cmMeg").onclick = () => { mindenkepp = true; kuld(); };
                            return;
                        }
                        $("#cmHiba").textContent = Crm.hiba(err); $("#cmHiba").hidden = false;
                    });
            };
            $("#crmMegtForm").onsubmit = kuld;
            const tor = $("#cmTorol");
            if (tor) tor.onclick = () => {
                if (!confirm(Crm.t("crmDeleteViewing"))) return;
                Crm.api(`/megtekintesek/${m.id}`, { method: "DELETE" }).then(() => { modal.hide(); if (utana) utana(); Crm.frissit(); }).catch(err => alert(Crm.hiba(err)));
            };
        });
    }

    // Megtekintés megnyitása: részletek + eredmény rögzítése (eredmeny = rögtön az eredmény)
    static megtNyit(id, eredmeny, utana) {
        const { tartalom, modal } = Svc.modal("crmMegtN", "");
        const esc = Crm.esc;
        tartalom.innerHTML = `<div class="modal-body text-center py-4"><span class="spinner-border spinner-border-sm text-primary" role="status"></span></div>`;
        modal.show();
        Crm.api(`/megtekintesek?id=${encodeURIComponent(id)}`).then(L => {
            const m = L.find(x => String(x.id) === String(id));
            if (!m) throw new Error("not_found");
            const kesz = m.statusz !== "tervezett";
            tartalom.innerHTML = `
                <div class="modal-header">
                    <h5 class="modal-title"><i class="${Crm.megtIkon(m.statusz)}" aria-hidden="true"></i> ${Crm.t("crmViewing")} – ${Crm.hatarido(m.kezdet)}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(Crm.t("crmClose"))}"></button>
                </div>
                <div class="modal-body">
                    <dl class="crmDl small">
                        <dt>${Crm.t("crmForContact")}</dt><dd><a href="#" data-ugyfel="${m.ugyfel_id}">${esc(m.ugyfel_nev || "")}</a>${m.ugyfel_telefon ? ` · <a href="tel:${esc(m.ugyfel_telefon)}">${esc(m.ugyfel_telefon)}</a>` : ""}</dd>
                        ${m.ingatlan_id ? `<dt>${Crm.t("crmProperty")}</dt><dd><a href="#listing/${m.ingatlan_id}">${esc(m.ingatlan_cim || "#" + m.ingatlan_id)}</a></dd>` : ""}
                        <dt>${Crm.t("crmWhen")}</dt><dd>${Crm.hatarido(m.kezdet)} · ${m.hossz_perc} ${Crm.t("crmMinutes")}</dd>
                        ${m.felelos_nev ? `<dt>${Crm.t("crmWhoGoes")}</dt><dd>${esc(m.felelos_nev)}</dd>` : ""}
                        ${m.hely ? `<dt>${Crm.t("crmPlace")}</dt><dd>${esc(m.hely)} · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.hely)}" target="_blank" rel="noopener">${Crm.t("crmMap")}</a></dd>` : ""}
                        ${m.megjegyzes ? `<dt>${Crm.t("crmNotes")}</dt><dd>${esc(m.megjegyzes)}</dd>` : ""}
                        <dt>${Crm.t("crmStatus")}</dt><dd>${Crm.t("crmVSt_" + m.statusz)}${m.erdeklodes ? ` · ${Crm.t("crmInt_" + m.erdeklodes)}` : ""}</dd>
                        ${m.visszajelzes ? `<dt>${Crm.t("crmFeedback")}</dt><dd>${esc(m.visszajelzes)}</dd>` : ""}
                    </dl>
                    <div class="crmResult" id="cnEredmeny" ${eredmeny || !kesz ? "" : "hidden"}>
                        <h6 class="mb-2">${Crm.t("crmHowWasIt")}</h6>
                        <div class="d-flex flex-wrap gap-2 mb-2" role="radiogroup" aria-label="${esc(Crm.t("crmStatus"))}">
                            ${["megtortent", "elmaradt", "lemondva"].map((x, n) => `
                                <input type="radio" class="btn-check" name="cnSt" id="cnSt_${x}" value="${x}" ${(kesz ? m.statusz === x : n === 0) ? "checked" : ""}>
                                <label class="btn btn-sm btn-outline-secondary" for="cnSt_${x}">${Crm.t("crmVSt_" + x)}</label>`).join("")}
                        </div>
                        <div id="cnErdBox" class="mb-2">
                            <span class="small d-block mb-1">${Crm.t("crmInterest")}</span>
                            <div class="d-flex flex-wrap gap-2" role="radiogroup" aria-label="${esc(Crm.t("crmInterest"))}">
                                ${["nagyon", "talan", "nem"].map(x => `
                                    <input type="radio" class="btn-check" name="cnErd" id="cnErd_${x}" value="${x}" ${m.erdeklodes === x ? "checked" : ""}>
                                    <label class="btn btn-sm btn-outline-secondary" for="cnErd_${x}">${Crm.t("crmInt_" + x)}</label>`).join("")}
                            </div>
                        </div>
                        <label class="form-label small mb-1" for="cnVissza">${Crm.t("crmFeedback")}</label>
                        <textarea class="form-control" id="cnVissza" rows="2" maxlength="2000" placeholder="${esc(Crm.t("crmFeedbackPh"))}">${esc(m.visszajelzes)}</textarea>
                        <div class="form-check mt-2">
                            <input class="form-check-input" type="checkbox" id="cnKov" ${kesz ? "" : "checked"}>
                            <label class="form-check-label small" for="cnKov">${Crm.t("crmFollowUpIn2")}</label>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    ${m.statusz === "tervezett" ? `<button type="button" class="btn btn-outline-secondary me-auto" id="cnSzerk"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${Crm.t("crmEdit")}</button>` : ""}
                    ${kesz && !eredmeny ? `<button type="button" class="btn btn-outline-secondary" id="cnMod">${Crm.t("crmChangeResult")}</button>` : ""}
                    <button type="button" class="btn btn-primary" id="cnMent" ${eredmeny || !kesz ? "" : "hidden"}>${Crm.t("crmSaveResult")}</button>
                </div>`;
            const $ = q => tartalom.querySelector(q);
            const erdLatszik = () => { $("#cnErdBox").hidden = (tartalom.querySelector("input[name=cnSt]:checked") || {}).value !== "megtortent"; };
            tartalom.querySelectorAll("input[name=cnSt]").forEach(r => r.onchange = erdLatszik);
            erdLatszik();
            tartalom.querySelectorAll("[data-ugyfel]").forEach(a => a.onclick = e => { e.preventDefault(); modal.hide(); Crm.ugyfelNyit(m.ugyfel_id); });
            const sz = $("#cnSzerk");
            if (sz) sz.onclick = () => { modal.hide(); Crm.megtSzerk(m, utana); };
            const mod = $("#cnMod");
            if (mod) mod.onclick = () => { $("#cnEredmeny").hidden = false; $("#cnMent").hidden = false; mod.hidden = true; };
            $("#cnMent").onclick = () => {
                const statusz = (tartalom.querySelector("input[name=cnSt]:checked") || {}).value || "megtortent";
                const erd = (tartalom.querySelector("input[name=cnErd]:checked") || {}).value || null;
                $("#cnMent").disabled = true;
                const lepesek = [Crm.api(`/megtekintesek/${m.id}/eredmeny`, { method: "POST", body: { statusz, erdeklodes: erd, visszajelzes: $("#cnVissza").value } })];
                if ($("#cnKov").checked && m.ugyfel_id) {
                    const d = new Date(Date.now() + 2 * 86400000); d.setHours(10, 0, 0, 0);
                    lepesek.push(Crm.api("/feladatok", { method: "POST", body: { cim: Crm.t("crmFollowUpTitle", { nev: m.ugyfel_nev || "" }), hatarido: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16), ugyfel_id: m.ugyfel_id, felelos_id: m.felelos_id || Crm.en } }));
                }
                Promise.all(lepesek).then(() => { modal.hide(); Crm.jelez(Crm.t("crmResultSaved")); if (utana) utana(); Crm.frissit(); })
                    .catch(err => { $("#cnMent").disabled = false; alert(Crm.hiba(err)); });
            };
        }).catch(e => { tartalom.innerHTML = `<div class="modal-body"><div class="alert alert-danger mb-0">${Crm.hiba(e)}</div></div>`; });
    }

    // ===================== INGATLANOK =====================

    static ingatlanok(body) {
        const f = Crm.iSzuro;
        Crm.betolt(body);
        const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
        Crm.api("/ingatlanok?" + qs).then(L => {
            const esc = Crm.esc;
            body.innerHTML = `
                <div class="crmFilters">
                    <input type="search" class="form-control form-control-sm" id="crmIQ" placeholder="${esc(Crm.t("crmPropSearch"))}" value="${esc(f.q)}" aria-label="${esc(Crm.t("crmPropSearch"))}">
                    <select class="form-select form-select-sm" id="crmISt" aria-label="${esc(Crm.t("crmStatus"))}">
                        <option value="aktiv" ${f.statusz === "aktiv" ? "selected" : ""}>${Crm.t("crmPropActive")}</option>
                        <option value="eladva" ${f.statusz === "eladva" ? "selected" : ""}>${Crm.t("crmPropSold")}</option>
                        <option value="" ${!f.statusz ? "selected" : ""}>${Crm.t("crmPropAll")}</option>
                    </select>
                </div>
                ${L.length ? `
                <div class="crmPropGrid">
                    ${L.map(i => {
                        const kep = Utils.photoUrl(i);
                        return `
                        <article class="crmPropCard" data-ingatlan="${i.id}" tabindex="0" role="button" aria-label="${esc(i.cim || Types.label(i.tipus))}">
                            <div class="crmPropCardImg">${kep ? `<img src="${esc(kep)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<i class="${Types.get(i.tipus).icon}" aria-hidden="true"></i>`}
                                ${i.eladva ? `<span class="badge text-bg-danger">${Crm.t("crmPropSoldBadge")}</span>` : ""}</div>
                            <div class="p-2">
                                <b class="d-block text-truncate">${esc(i.cim || Types.label(i.tipus))}</b>
                                <div class="small text-body-secondary text-truncate">${i.ar ? esc(Utils.eur(i.ar)) : "–"}${i.nm ? ` · ${esc(Utils.nm(i.nm))}` : ""}${i.kerulet ? ` · ${esc(i.kerulet)}` : ""}</div>
                                <div class="crmPropStats">
                                    <span title="${esc(Crm.t("crmInterested"))}"><i class="fa-solid fa-user-group" aria-hidden="true"></i> ${i.erdeklodok}</span>
                                    <span title="${esc(Crm.t("crmViewed"))}"><i class="fa-solid fa-door-open" aria-hidden="true"></i> ${i.megtekintve}</span>
                                    <span title="${esc(Crm.t("crmOffers"))}"><i class="fa-solid fa-file-signature" aria-hidden="true"></i> ${i.ajanlatok}</span>
                                </div>
                                <div class="small text-truncate">${i.tulajdonos ? `<i class="fa-solid fa-key" aria-hidden="true"></i> ${esc(i.tulajdonos)}` : `<span class="text-body-secondary">${Crm.t("crmNoOwnerContact")}</span>`}</div>
                                <div class="small ${i.kov_megtekintes ? "text-primary fw-semibold" : "text-body-secondary"}"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${i.kov_megtekintes ? Crm.hatarido(i.kov_megtekintes) : Crm.t("crmNoNextViewing")}</div>
                                ${i.ugynok_nev ? `<div class="small text-body-secondary text-truncate"><i class="fa-solid fa-id-badge" aria-hidden="true"></i> ${esc(i.ugynok_nev)}</div>` : ""}
                            </div>
                        </article>`;
                    }).join("")}
                </div>` : `<div class="emptyState"><i class="fa-solid fa-house"></i><h5>${Crm.t("crmNoProps")}</h5><p>${Crm.t(Crm.ter ? "crmNoPropsHint" : "crmNoPropsHintAdmin")}</p></div>`}`;
            let t = null;
            body.querySelector("#crmIQ").oninput = e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; Crm.ingatlanok(body); }, 350); };
            body.querySelector("#crmISt").onchange = e => { f.statusz = e.target.value; Crm.ingatlanok(body); };
            body.querySelectorAll("[data-ingatlan]").forEach(k => {
                k.onclick = () => Crm.ingatlanNyit(k.dataset.ingatlan);
                k.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); Crm.ingatlanNyit(k.dataset.ingatlan); } };
            });
        }).catch(e => { body.innerHTML = `<div class="alert alert-danger">${Crm.hiba(e)}</div>`; });
    }

    // Egy ingatlan: tulajdonos, érdeklődők (állapottal), megtekintések
    // Egy ingatlan „ügye”: az eladó, a vevők fázisok szerint (új érdeklődő → ajánlottam →
    // megnézte → ajánlatot tett), a megtekintések és az ajánlatok – egy helyen
    static VEVO_FAZIS = ["uj", "kuldve", "megtekintes", "ajanlat"];

    static ingatlanNyit(id) {
        const { tartalom, modal } = Svc.modal("crmIng", "modal-xl");
        tartalom.innerHTML = `<div class="modal-body text-center py-5"><span class="spinner-border text-primary" role="status"></span></div>`;
        modal.show();
        const rajzol = () => Crm.api(`/ingatlanok/${id}`).then(d => {
            const esc = Crm.esc;
            const i = d.ingatlan;
            const tulaj = d.ugyfelek.filter(u => u.szerep === "tulajdonos");
            const erd = d.ugyfelek.filter(u => u.szerep !== "tulajdonos");
            const elvetve = erd.filter(u => u.kapcs_allapot === "elvetve");
            const kep = Utils.photoUrl(i);
            const most = Date.now() - 3 * 3600000;
            const tervezett = d.megtekintesek.filter(m => m.statusz === "tervezett" && Crm.helyi(m.kezdet).getTime() >= most);
            const korabbi = d.megtekintesek.filter(m => !tervezett.includes(m));
            const nyitottAj = (d.ajanlatok || []).filter(a => ["uj", "megnezve", "ellenajanlat"].includes(a.statusz));
            const legjobb = nyitottAj.sort((x, y) => y.osszeg - x.osszeg)[0];

            const vevoKartya = u => `
                <div class="propBuyer ${u.kapcs_allapot === "elvetve" ? "off" : ""}">
                    <a href="#" data-ugyfel="${u.id}" class="fw-semibold d-block propBuyerNev">${esc(u.nev)}</a>
                    <div class="mb-1">${Crm.allapotBadge(u.allapot)}</div>
                    <div class="small text-body-secondary">
                        ${u.telefon ? `<a href="tel:${esc(u.telefon)}"><i class="fa-solid fa-phone" aria-hidden="true"></i> ${esc(u.telefon)}</a>` : ""}
                        ${u.utolso_megt ? `<div><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> ${Crm.t("crmLastViewing")}: ${Crm.hatarido(u.utolso_megt)}</div>` : ""}
                        ${Crm.vezeto && u.felelos_nev ? `<div><i class="fa-regular fa-user" aria-hidden="true"></i> ${esc(u.felelos_nev)}</div>` : ""}
                    </div>
                    <div class="d-flex gap-1 mt-2 propBuyerAct">
                        <select class="form-select form-select-sm crmKapcsSel" data-kapcsu="${u.id}" aria-label="${esc(Crm.t("crmWhereStands"))}">
                            ${Crm.VEVO_FAZIS.concat(["elvetve"]).map(k => `<option value="${k}" ${u.kapcs_allapot === k ? "selected" : ""}>${Crm.t("propCol_" + k)}</option>`).join("")}
                        </select>
                        <button type="button" class="btn btn-sm btn-outline-primary" data-megtu="${u.id}" data-nev="${esc(u.nev)}" title="${esc(Crm.t("crmNewViewing"))}" aria-label="${esc(Crm.t("crmNewViewing"))}"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i></button>
                    </div>
                </div>`;

            tartalom.innerHTML = `
                <div class="modal-header propHead">
                    <div class="d-flex align-items-center gap-3 min-w-0 flex-fill">
                        <a class="propHeadImg" href="#listing/${i.id}">${kep ? `<img src="${esc(kep)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<i class="${Types.get(i.tipus).icon}" aria-hidden="true"></i>`}</a>
                        <div class="min-w-0">
                            <h5 class="modal-title text-truncate">${esc(i.cim || Types.label(i.tipus))}</h5>
                            <div class="small text-body-secondary">
                                <b class="propCode">IP-${i.id}</b>${i.iroda_ref ? ` · ${esc(i.iroda_ref)}` : ""} · ${i.ar ? esc(Utils.eur(i.ar)) : "–"}${i.nm ? ` · ${esc(Utils.nm(i.nm))}` : ""}${i.szobak ? ` · ${i.szobak} ${Crm.t("crmRooms")}` : ""}
                                ${i.ugynok_nev ? ` · <i class="fa-regular fa-user" aria-hidden="true"></i> ${esc(i.ugynok_nev)}` : ""}
                            </div>
                        </div>
                    </div>
                    <div class="d-flex flex-wrap gap-2">
                        <a class="btn btn-sm btn-outline-secondary" href="#listing/${i.id}"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> ${Crm.t("crmOpenListing")}</a>
                        <button type="button" class="btn btn-sm btn-primary" id="ciMegt"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${Crm.t("crmNewViewing")}</button>
                    </div>
                    <button type="button" class="btn-close ms-2" data-bs-dismiss="modal" aria-label="${esc(Crm.t("crmClose"))}"></button>
                </div>
                <div class="modal-body">
                    <div class="propStats">
                        <div><b>${erd.length - elvetve.length}</b><span>${Crm.t("propStatBuyers")}</span></div>
                        <div><b>${d.megtekintesek.filter(m => m.statusz === "megtortent").length}</b><span>${Crm.t("propStatViewed")}</span></div>
                        <div><b>${tervezett.length}</b><span>${Crm.t("propStatPlanned")}</span></div>
                        <div><b>${legjobb ? esc(Crm.penz(legjobb.osszeg, legjobb.penznem)) : "–"}</b><span>${Crm.t("propStatBestOffer")}</span></div>
                    </div>

                    <div class="row g-4">
                        <div class="col-lg-4">
                            <div class="crmCard propSellerCard">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <h6 class="mb-0"><i class="fa-solid fa-key" aria-hidden="true"></i> ${Crm.t("propSeller")}</h6>
                                    <button type="button" class="btn btn-sm btn-link p-0" id="ciTulaj">${Crm.t(tulaj.length ? "propSellerChange" : "propSellerAdd")}</button>
                                </div>
                                ${tulaj.length ? tulaj.map(u => `
                                    <div class="propPerson">
                                        <span class="crmAvatar" aria-hidden="true">${esc((u.nev || "?").trim().split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase())}</span>
                                        <div class="min-w-0">
                                            <a href="#" data-ugyfel="${u.id}" class="fw-semibold d-block text-truncate">${esc(u.nev)}</a>
                                            <div class="small">${u.telefon ? `<a href="tel:${esc(u.telefon)}"><i class="fa-solid fa-phone" aria-hidden="true"></i> ${esc(u.telefon)}</a>` : ""}</div>
                                            <div class="small text-body-secondary">${Crm.t("crmOwnSt_" + (u.kapcs_allapot || "uj"))}</div>
                                        </div>
                                    </div>`).join("") : `<p class="small text-body-secondary mb-0">${Crm.t("propSellerNone")}</p>`}
                            </div>
                            <div id="ciKereso" class="crmCard" hidden>
                                <h6 id="ciKeresoCim"></h6>
                                <input class="form-control form-control-sm" id="ciQ" list="ciUgyfelL" autocomplete="off" placeholder="${esc(Crm.t("crmPickContact"))}" aria-label="${esc(Crm.t("crmPickContact"))}">
                                <datalist id="ciUgyfelL"></datalist>
                                <div class="d-flex gap-2 mt-2"><button type="button" class="btn btn-sm btn-primary" id="ciHozzaad">${Crm.t("crmAdd")}</button>
                                    <button type="button" class="btn btn-sm btn-link" id="ciUjUgyfel">${Crm.t("crmNewContact")}</button></div>
                            </div>
                            <div class="crmCard">
                                <h6><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${Crm.t("crmViewings")}</h6>
                                <div class="small fw-semibold text-body-secondary mb-1">${Crm.t("crmViewPlanned")} (${tervezett.length})</div>
                                ${tervezett.length ? `<div class="list-group list-group-flush mb-2">${tervezett.map(m => Crm.megtSor(m, "ingatlan")).join("")}</div>` : `<p class="small text-body-secondary">${Crm.t("crmNoViewings")}</p>`}
                                ${korabbi.length ? `<details><summary class="small text-body-secondary">${Crm.t("crmViewPast")} (${korabbi.length})</summary><div class="list-group list-group-flush">${korabbi.map(m => Crm.megtSor(m, "ingatlan")).join("")}</div></details>` : ""}
                            </div>
                            ${(d.ajanlatok || []).length ? `
                            <div class="crmCard">
                                <h6><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> ${Crm.t("ofOffers")}</h6>
                                ${d.ajanlatok.map(a => `
                                    <div class="d-flex justify-content-between gap-2 small border-top pt-1 mt-1">
                                        <span class="text-truncate">${a.crm_ugyfel_id ? `<a href="#" data-ugyfel="${a.crm_ugyfel_id}">${esc(a.nev || "")}</a>` : esc(a.nev || "")}</span>
                                        <span class="text-nowrap"><b>${esc(Crm.penz(a.osszeg, a.penznem))}</b> ${Crm.ajanlatBadge(a.statusz)}</span>
                                    </div>`).join("")}
                            </div>` : ""}
                        </div>

                        <div class="col-lg-8">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h6 class="mb-0"><i class="fa-solid fa-user-group" aria-hidden="true"></i> ${Crm.t("propBuyers")} <span class="badge text-bg-light">${erd.length - elvetve.length}</span></h6>
                                <button type="button" class="btn btn-sm btn-outline-primary" id="ciErd"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${Crm.t("crmAddInterested")}</button>
                            </div>
                            <div class="propPipe">
                                ${Crm.VEVO_FAZIS.map(k => {
                                    const L = erd.filter(u => (u.kapcs_allapot || "uj") === k);
                                    return `
                                    <div class="propCol pc-${k}">
                                        <div class="propColHead"><span>${Crm.t("propCol_" + k)}</span><b>${L.length}</b></div>
                                        ${L.length ? L.map(vevoKartya).join("") : `<div class="propColEmpty">–</div>`}
                                    </div>`;
                                }).join("")}
                            </div>
                            ${elvetve.length ? `<details class="mt-2"><summary class="small text-body-secondary">${Crm.t("propCol_elvetve")} (${elvetve.length})</summary><div class="propOff">${elvetve.map(vevoKartya).join("")}</div></details>` : ""}
                            <p class="small text-body-secondary mt-2 mb-0"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${Crm.t("propPipeHelp")}</p>
                        </div>
                    </div>
                </div>`;
            const $ = q => tartalom.querySelector(q);
            const nyit = fn => { modal.hide(); fn(); };
            tartalom.querySelectorAll("[data-ugyfel]").forEach(a => a.onclick = e => { e.preventDefault(); nyit(() => Crm.ugyfelNyit(a.dataset.ugyfel)); });
            tartalom.querySelectorAll("[data-megt]").forEach(a => a.onclick = e => { e.preventDefault(); nyit(() => Crm.megtNyit(a.dataset.megt)); });
            tartalom.querySelectorAll("[data-eredmeny]").forEach(a => a.onclick = e => { e.preventDefault(); nyit(() => Crm.megtNyit(a.dataset.eredmeny, true)); });
            $("#ciMegt").onclick = () => nyit(() => Crm.megtSzerk({ ingatlan_id: i.id, ingatlan_cim: i.cim, felelos_id: Crm.en }));
            tartalom.querySelectorAll("[data-megtu]").forEach(b => b.onclick = () => nyit(() => Crm.megtSzerk({ ugyfel_id: Number(b.dataset.megtu), ugyfel_nev: b.dataset.nev, ingatlan_id: i.id, ingatlan_cim: i.cim, felelos_id: Crm.en })));
            tartalom.querySelectorAll("[data-kapcsu]").forEach(sel => sel.onchange = () =>
                Crm.api(`/ugyfelek/${sel.dataset.kapcsu}/ingatlan`, { method: "POST", body: { ingatlan_id: i.id, szerep: "erdeklodik", allapot: sel.value } })
                    .then(() => { Crm.jelez(Crm.t("crmSaved")); rajzol(); }).catch(err => alert(Crm.hiba(err))));
            // ügyfél hozzáadása vevőként / eladóként
            let szerep = "erdeklodik";
            let lista = [];
            const kereso = sz => {
                szerep = sz;
                $("#ciKereso").hidden = false;
                $("#ciKeresoCim").textContent = Crm.t(sz === "tulajdonos" ? "propSellerAdd" : "crmAddInterested");
                Crm.api("/ugyfelek?allapot=").then(v => {
                    lista = v.ugyfelek;
                    $("#ciUgyfelL").innerHTML = lista.map(u => `<option value="${esc(`${u.nev}${u.telefon ? " · " + u.telefon : ""} [#${u.id}]`)}">`).join("");
                    $("#ciQ").focus();
                });
            };
            $("#ciErd").onclick = () => kereso("erdeklodik");
            $("#ciTulaj").onclick = () => kereso("tulajdonos");
            const kapcsol = uid => Crm.api(`/ugyfelek/${uid}/ingatlan`, { method: "POST", body: { ingatlan_id: i.id, szerep } }).then(() => { Crm.jelez(Crm.t("crmSaved")); rajzol(); });
            $("#ciHozzaad").onclick = () => {
                const x = String($("#ciQ").value).match(/\[#(\d+)\]\s*$/);
                if (!x) { $("#ciQ").classList.add("is-invalid"); return; }
                kapcsol(Number(x[1])).catch(err => alert(Crm.hiba(err)));
            };
            $("#ciUjUgyfel").onclick = () => {
                modal.hide();
                Crm.ugyfelSzerk({ szerepek: [szerep === "tulajdonos" ? "elado" : "vevo"], cimkek: [], allapot: "uj", felelos_id: Crm.en, igeny: null, _uj: true }, v =>
                    Crm.api(`/ugyfelek/${v.id}/ingatlan`, { method: "POST", body: { ingatlan_id: i.id, szerep } }).then(() => Crm.ingatlanNyit(i.id)));
            };
        }).catch(e => { tartalom.innerHTML = `<div class="modal-body"><div class="alert alert-danger mb-0">${Crm.hiba(e)}</div></div>`; });
        rajzol();
    }

    // ===================== CSAPAT =====================

    static csapat(body) {
        Crm.betolt(body);
        Crm.api("/csapat").then(d => {
            const esc = Crm.esc;
            const sor = (nev, x, id) => `
                <tr>
                    <td class="fw-semibold">${esc(nev)}</td>
                    ${Crm.NYITOTT.map(a => `<td class="text-center"><button type="button" class="btn btn-link btn-sm p-0" data-csfil="${id ?? "nincs"}" data-csst="${a}">${x.allapotok[a]}</button></td>`).join("")}
                    <td class="text-center">${x.nyert90}</td>
                    <td class="text-center">${x.feladat}${x.kesik ? ` <span class="badge text-bg-danger">${x.kesik}</span>` : ""}</td>
                    <td class="text-center">${x.heti_megt}</td>
                    <td class="text-center">${x.megtortent30}</td>
                </tr>`;
            body.innerHTML = `
                <div class="table-responsive crmTableWrap">
                    <table class="table align-middle mb-0 crmTable crmTeam">
                        <thead><tr>
                            <th>${Crm.t("crmMember")}</th>
                            ${Crm.NYITOTT.map(a => `<th class="text-center">${Crm.t("crmSt_" + a)}</th>`).join("")}
                            <th class="text-center">${Crm.t("crmWon90")}</th><th class="text-center">${Crm.t("crmOpenTasksLate")}</th>
                            <th class="text-center">${Crm.t("crmViewsThisWeek")}</th><th class="text-center">${Crm.t("crmViews30")}</th>
                        </tr></thead>
                        <tbody>
                            ${d.tagok.map(t => sor(t.nev + (t.id === Crm.en ? ` (${Crm.t("crmMe")})` : ""), t, t.id)).join("")}
                            ${d.nincs.nyitott_ugyfel || d.nincs.feladat ? sor(Crm.t("crmNoOwner"), d.nincs, null) : ""}
                        </tbody>
                    </table>
                </div>
                <p class="small text-body-secondary mt-2">${Crm.t("crmTeamHelp")}</p>`;
            body.querySelectorAll("[data-csfil]").forEach(b => b.onclick = () => {
                Object.assign(Crm.szuro, { felelos: b.dataset.csfil, allapot: b.dataset.csst, q: "", szerep: "", cimke: "" });
                Crm.ugyfelNezet = "lista";
                Crm.nezet = "ugyfelek";
                Crm.keret();
            });
        }).catch(e => { body.innerHTML = `<div class="alert alert-danger">${Crm.hiba(e)}</div>`; });
    }

    // ===================== AJÁNLATOK (irodának) =====================

    static penz(v, p) {
        return `${Number(v || 0).toLocaleString(Utils.locale(), { maximumFractionDigits: 0 })} ${p === "RON" ? "lei" : "€"}`;
    }

    static ajanlatBadge(st) {
        const szin = { uj: "danger", megnezve: "secondary", elfogadva: "success", elutasitva: "dark", ellenajanlat: "warning", visszavonva: "light" }[st] || "light";
        return `<span class="badge text-bg-${szin}">${Crm.t("ofSt_" + st)}</span>`;
    }

    static ajanlatok(body) {
        const f = Crm.aSzuro;
        Crm.betolt(body);
        Promise.all([Crm.api("/ajanlatok?" + new URLSearchParams(f.statusz ? { statusz: f.statusz } : {})), Crm.api("/ingatlanok?statusz=aktiv").catch(() => [])]).then(([L, sajat]) => {
            const esc = Crm.esc;
            body.innerHTML = `
                <div class="crmFilters">
                    <div class="btn-group btn-group-sm" role="group">
                        ${[["nyitott", "ofOpen"], ["elfogadva", "ofSt_elfogadva"], ["", "crmAll"]].map(([k, l]) => `<button type="button" class="btn ${f.statusz === k ? "btn-primary" : "btn-outline-secondary"}" data-ast="${k}">${Crm.t(l)}</button>`).join("")}
                    </div>
                </div>
                <p class="small text-body-secondary">${Crm.t("ofAgencyHelp")}</p>
                ${L.length ? L.map(a => `
                    <article class="crmOffer st-${esc(a.statusz)}">
                        <div class="d-flex flex-wrap justify-content-between gap-2">
                            <div class="min-w-0">
                                <div class="crmOfferAmount">${esc(Crm.penz(a.osszeg, a.penznem))} ${Crm.ajanlatBadge(a.statusz)}</div>
                                <div class="small">
                                    ${a.crm_ugyfel_id ? `<a href="#" data-ugyfel="${a.crm_ugyfel_id}" class="fw-semibold">${esc(a.nev || "")}</a>` : `<b>${esc(a.nev || "")}</b>`}
                                    ${a.telefon ? ` · <a href="tel:${esc(a.telefon)}">${esc(a.telefon)}</a>` : ""}${a.email ? ` · <a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : ""}
                                </div>
                                <div class="small text-body-secondary">${Crm.idopont(a.created_at)}${a.ervenyes ? ` · ${Crm.t("ofValidUntil")}: ${esc(String(a.ervenyes).slice(0, 10))}` : ""}</div>
                            </div>
                            <div class="text-end small">
                                ${a.ingatlan_id ? `<a href="#" data-ingatlan="${a.ingatlan_id}"><i class="fa-solid fa-house" aria-hidden="true"></i> ${esc(a.ingatlan_cim || "#" + a.ingatlan_id)}</a>
                                    ${a.ingatlan_ar ? `<div class="text-body-secondary">${Crm.t("ofAsking")}: ${esc(Crm.penz(a.ingatlan_ar, "EUR"))} · ${Math.round((a.osszeg / a.ingatlan_ar - 1) * 100)}%</div>` : ""}` : ""}
                                ${a.kulso_link ? `<div><span class="badge text-bg-info">${Crm.t("ofExternal")}</span> <a href="${esc(a.kulso_link)}" target="_blank" rel="noopener nofollow">${esc(Crm.domain(a.kulso_link))}</a></div>
                                    ${a.kulso_adat ? `<div class="text-body-secondary">${esc([a.kulso_adat.cim, a.kulso_adat.ar ? Crm.penz(a.kulso_adat.ar, "EUR") : ""].filter(Boolean).join(" · "))}</div>` : ""}` : ""}
                            </div>
                        </div>
                        <div class="crmOfferMeta small mt-2">
                            ${a.finanszirozas ? `<span><i class="fa-solid fa-wallet" aria-hidden="true"></i> ${Crm.t("ofFin_" + a.finanszirozas)}${a.hitel_elobiralat ? ` (${Crm.t("ofPreApproved")})` : ""}</span>` : ""}
                            ${a.birtokba ? `<span><i class="fa-solid fa-key" aria-hidden="true"></i> ${esc(a.birtokba)}</span>` : ""}
                        </div>
                        ${a.uzenet ? `<blockquote class="small mt-2 mb-0">${esc(a.uzenet)}</blockquote>` : ""}
                        ${a.kulso_adat && a.kulso_adat.megjegyzes ? `<blockquote class="small mt-2 mb-0">${esc(a.kulso_adat.megjegyzes)}</blockquote>` : ""}
                        ${a.statusz === "ellenajanlat" ? `<div class="small mt-2"><b>${Crm.t("ofCounterSent")}:</b> ${esc(Crm.penz(a.ellen_osszeg, a.penznem))}${a.valasz ? ` – ${esc(a.valasz)}` : ""}</div>` : ""}
                        ${a.valasz && a.statusz !== "ellenajanlat" ? `<div class="small mt-2 text-body-secondary"><b>${Crm.t("ofReply")}:</b> ${esc(a.valasz)}</div>` : ""}
                        ${["uj", "megnezve", "ellenajanlat"].includes(a.statusz) ? `
                        <div class="d-flex flex-wrap gap-2 mt-2">
                            <button type="button" class="btn btn-sm btn-success" data-av="${a.id}" data-mit="elfogadva">${Crm.t("ofAccept")}</button>
                            <button type="button" class="btn btn-sm btn-outline-warning" data-av="${a.id}" data-mit="ellenajanlat">${Crm.t("ofCounter")}</button>
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-av="${a.id}" data-mit="elutasitva">${Crm.t("ofReject")}</button>
                            ${a.kulso_link && !a.ingatlan_id && sajat.length ? `
                            <span class="ms-auto d-flex gap-1 align-items-center">
                                <label class="visually-hidden" for="akap${a.id}">${Crm.t("ofLinkOwn")}</label>
                                <select class="form-select form-select-sm" id="akap${a.id}" data-akap="${a.id}">
                                    <option value="">${Crm.t("ofLinkOwn")}</option>
                                    ${sajat.map(i => `<option value="${i.id}">#${i.id} ${esc(i.cim || Types.label(i.tipus))}</option>`).join("")}
                                </select>
                            </span>` : ""}
                        </div>` : ""}
                    </article>`).join("") : `<div class="emptyState"><i class="fa-solid fa-hand-holding-dollar"></i><h5>${Crm.t("ofNone")}</h5><p>${Crm.t("ofNoneHint")}</p></div>`}`;
            body.querySelectorAll("[data-ast]").forEach(b => b.onclick = () => { f.statusz = b.dataset.ast; Crm.ajanlatok(body); });
            // megnyitva: „megnézve”
            L.filter(a => a.statusz === "uj").forEach(a => Crm.api(`/ajanlatok/${a.id}/valasz`, { method: "POST", body: { statusz: "megnezve" } }).catch(() => { }));
            if (L.some(a => a.statusz === "uj")) { Crm.ajanlatDb = 0; const ob = Crm.el.querySelector(".crmOfferBadge"); if (ob) ob.hidden = true; }
            body.querySelectorAll("[data-av]").forEach(b => b.onclick = () => {
                const a = L.find(x => String(x.id) === b.dataset.av);
                Crm.ajanlatValasz(a, b.dataset.mit, () => Crm.ajanlatok(body));
            });
            body.querySelectorAll("[data-akap]").forEach(s => s.onchange = () => {
                if (!s.value) return;
                Crm.api(`/ajanlatok/${s.dataset.akap}/kapcsol`, { method: "POST", body: { ingatlan_id: s.value } }).then(() => { Crm.jelez(Crm.t("crmSaved")); Crm.ajanlatok(body); }).catch(e => alert(Crm.hiba(e)));
            });
            Crm.kotesek(body);
        }).catch(e => { body.innerHTML = `<div class="alert alert-danger">${Crm.hiba(e)}</div>`; });
    }

    static domain(u) {
        try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; }
    }

    // Válasz: elfogad / elutasít / ellenajánlat (összeg + üzenet)
    static ajanlatValasz(a, mit, utana) {
        const { tartalom, modal } = Svc.modal("crmAjVal", "");
        const esc = Crm.esc;
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title">${Crm.t("ofReplyTitle_" + mit)}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(Crm.t("crmClose"))}"></button>
            </div>
            <div class="modal-body">
                <p class="small">${esc(a.nev || "")} · <b>${esc(Crm.penz(a.osszeg, a.penznem))}</b></p>
                ${mit === "ellenajanlat" ? `
                <label class="form-label small mb-1" for="avOssz">${Crm.t("ofCounterAmount")} (${a.penznem === "RON" ? "lei" : "€"})</label>
                <input type="number" class="form-control mb-3" id="avOssz" min="1" value="${Math.round(a.ingatlan_ar || a.osszeg)}">` : ""}
                <label class="form-label small mb-1" for="avSzoveg">${Crm.t("ofReplyMsg")}</label>
                <textarea class="form-control" id="avSzoveg" rows="3" maxlength="2000" placeholder="${esc(Crm.t("ofReplyPh_" + mit))}"></textarea>
                <p class="small text-body-secondary mt-2 mb-0">${Crm.t("ofReplyNote")}</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${Crm.t("crmCancel")}</button>
                <button type="button" class="btn btn-primary" id="avOk">${Crm.t("ofSend")}</button>
            </div>`;
        modal.show();
        const $ = q => tartalom.querySelector(q);
        $("#avOk").onclick = () => {
            $("#avOk").disabled = true;
            Crm.api(`/ajanlatok/${a.id}/valasz`, { method: "POST", body: { statusz: mit, ellen_osszeg: $("#avOssz") ? $("#avOssz").value : null, valasz: $("#avSzoveg").value } })
                .then(() => { modal.hide(); Crm.jelez(Crm.t("ofReplied")); utana(); })
                .catch(e => { $("#avOk").disabled = false; alert(Crm.hiba(e)); });
        };
    }

}
