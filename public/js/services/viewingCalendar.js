// ============================================================
//  Megtekintési naptár (Admin → Értékesítés → Megtekintési naptár, #admin/naptar)
//
//  A hét napjai oszlopokban: a foglalt időpontok (vevő, telefon), a
//  lezárandók (elmúlt, még nincs jelölve), a lezártak és a szabad
//  időpontok. Egy elemre kattintva alul a részletek és a műveletek:
//  megtörtént (+ jegyzet) / elmaradt / áthelyezés / lemondás; szabad
//  időpontnál a várólistáról időpont kiadása.
//
//  A bemutató (akinek csak a megtekintések részt adták ki, vagy akit egy
//  megbízáshoz bemutatónak rendeltek) csak ezt a részt látja – a saját
//  megbízásait.
//
//  NaptarSzerk: a megbízás idősávjainak szerkesztője (napok, órák,
//  egy megtekintés hossza, szünet, egyéni / nyitott nap, kivételnapok) –
//  az asztal Megtekintések fülén és a beállításokban (alapértelmezés) is.
//
//  Szerver: /api/ertekesites/naptar, /api/ertekesites/megtekintes/:tid/...,
//  /api/ertekesites/megbizasok/:id/naptar
// ============================================================

class NaptarSzerk {

    static NAPOK = [1, 2, 3, 4, 5, 6, 7];

    // el: hova; o: { naptar, szerk, bemutato: { id, lista } | null, ment(naptar, bemutatoId) -> Promise, alap: bool }
    static rajzol(el, o) {

        const esc = Utils.escape;
        const n = JSON.parse(JSON.stringify(o.naptar || {}));
        n.savok = n.savok || [];
        n.kivetelek = n.kivetelek || [];
        let bem = o.bemutato ? o.bemutato.id : undefined;
        const dis = o.szerk ? "" : "disabled";
        const opt = (lista, ertek, cimke) => lista.map(v => `<option value="${v}" ${Number(ertek) === v ? "selected" : ""}>${esc(cimke(v))}</option>`).join("");

        const rajz = () => {
            el.innerHTML = `
                ${!o.alap ? `
                <div class="form-check form-switch mb-3">
                    <input class="form-check-input" type="checkbox" role="switch" id="nsAktiv" ${n.aktiv ? "checked" : ""} ${dis}>
                    <label class="form-check-label fw-semibold" for="nsAktiv">${I18n.t("ns_aktiv")}<div class="small text-body-secondary fw-normal">${I18n.t(n.alap ? "ns_alapSugo" : "ns_aktivSugo")}</div></label>
                </div>` : ""}
                ${o.bemutato ? `
                <div class="mb-3">
                    <label class="form-label small mb-1" for="nsBem">${I18n.t("mdPresenter")}</label>
                    <select class="form-select form-select-sm" id="nsBem" ${dis}>
                        <option value="">–</option>
                        ${(o.bemutato.lista || []).map(u => `<option value="${u.id}" ${bem === u.id ? "selected" : ""}>${esc(u.nev)}</option>`).join("")}
                    </select>
                </div>` : ""}
                <div class="mb-2 small fw-semibold">${I18n.t("ns_savok")}</div>
                <div class="nsSavok">
                    ${n.savok.map((s, i) => `
                        <div class="nsSav" data-i="${i}">
                            <div class="nsNapok" role="group" aria-label="${esc(I18n.t("ns_napok"))}">
                                ${NaptarSzerk.NAPOK.map(d => `<button type="button" class="nsNap ${s.napok.includes(d) ? "be" : ""}" data-nap="${d}" aria-pressed="${s.napok.includes(d)}" ${dis}>${esc(I18n.t("het_" + d))}</button>`).join("")}
                            </div>
                            <div class="nsOrak">
                                <input type="time" class="form-control form-control-sm" data-k="tol" value="${esc(s.tol)}" aria-label="${esc(I18n.t("ns_tol"))}" ${dis}>
                                <span aria-hidden="true">–</span>
                                <input type="time" class="form-control form-control-sm" data-k="ig" value="${esc(s.ig)}" aria-label="${esc(I18n.t("ns_ig"))}" ${dis}>
                                ${o.szerk ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-ns-torol="${i}" aria-label="${esc(I18n.t("finDelete"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ""}
                            </div>
                        </div>`).join("") || `<p class="small text-body-secondary">${I18n.t("ns_nincsSav")}</p>`}
                </div>
                ${o.szerk ? `<button type="button" class="btn btn-sm btn-outline-secondary mb-3" id="nsUjSav"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("ns_ujSav")}</button>` : ""}
                <div class="row g-2">
                    <div class="col-6"><label class="form-label small mb-1" for="nsHossz">${I18n.t("ns_hossz")}</label>
                        <select class="form-select form-select-sm" id="nsHossz" ${dis}>${opt([15, 20, 30, 45, 60, 90], n.hossz, v => I18n.f("ns_perc", { n: v }))}</select></div>
                    <div class="col-6"><label class="form-label small mb-1" for="nsSzunet">${I18n.t("ns_szunet")}</label>
                        <select class="form-select form-select-sm" id="nsSzunet" ${dis}>${opt([0, 5, 10, 15, 30], n.szunet, v => v ? I18n.f("ns_perc", { n: v }) : I18n.t("ns_nincs"))}</select></div>
                    <div class="col-6"><label class="form-label small mb-1" for="nsElore">${I18n.t("ns_legkorabban")}</label>
                        <select class="form-select form-select-sm" id="nsElore" ${dis}>${opt([1, 2, 6, 12, 24, 48], n.elore_ora, v => I18n.f("ns_oraval", { n: v }))}</select></div>
                    <div class="col-6"><label class="form-label small mb-1" for="nsLemond">${I18n.t("ns_lemondas")}</label>
                        <select class="form-select form-select-sm" id="nsLemond" ${dis}>${opt([0, 1, 2, 3, 6, 12, 24], n.lemondas_ora, v => v ? I18n.f("ns_oraig", { n: v }) : I18n.t("ns_barmikor"))}</select></div>
                    <div class="col-6"><label class="form-label small mb-1" for="nsNapokElore">${I18n.t("ns_napokElore")}</label>
                        <select class="form-select form-select-sm" id="nsNapokElore" ${dis}>${opt([7, 14, 21, 30, 60], n.napok_elore, v => I18n.f("ns_nap", { n: v }))}</select></div>
                    <div class="col-6"><label class="form-label small mb-1" for="nsMod">${I18n.t("ns_mod")}</label>
                        <select class="form-select form-select-sm" id="nsMod" ${dis}>
                            <option value="egyeni" ${n.mod !== "nyitott" ? "selected" : ""}>${I18n.t("ns_mod_egyeni")}</option>
                            <option value="nyitott" ${n.mod === "nyitott" ? "selected" : ""}>${I18n.t("ns_mod_nyitott")}</option>
                        </select></div>
                    ${n.mod === "nyitott" ? `<div class="col-6"><label class="form-label small mb-1" for="nsKap">${I18n.t("ns_kapacitas")}</label>
                        <input class="form-control form-control-sm" id="nsKap" type="number" min="1" max="50" value="${n.kapacitas || 6}" ${dis}></div>` : ""}
                </div>
                <div class="mt-3">
                    <div class="small fw-semibold mb-1">${I18n.t("ns_kivetelek")}</div>
                    <div class="d-flex flex-wrap gap-1 mb-2">${n.kivetelek.map((d, i) => `<span class="badge text-bg-light nsKiv">${esc(Svc.nap(d))}${o.szerk ? ` <button type="button" class="btn btn-link btn-sm p-0" data-ns-kiv="${i}" aria-label="${esc(I18n.t("finDelete"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ""}</span>`).join("") || `<span class="small text-body-secondary">–</span>`}</div>
                    ${o.szerk ? `<div class="input-group input-group-sm" style="max-width:260px"><input type="date" class="form-control" id="nsKivUj" aria-label="${esc(I18n.t("ns_kivetelek"))}"><button type="button" class="btn btn-outline-secondary" id="nsKivAdd">${I18n.t("mbAdd")}</button></div>` : ""}
                </div>
                <div class="nsSzabaly mt-3">
                    <b>${I18n.t("ns_szabalyCim")}</b>
                    <span>${I18n.t("ns_szabaly")}</span>
                </div>
                ${o.szerk ? `<div class="text-end mt-3"><button type="button" class="btn btn-primary btn-sm" id="nsMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button></div>` : ""}`;

            if (!o.szerk) return;
            const $ = q => el.querySelector(q);
            el.querySelectorAll(".nsSav").forEach(row => {
                const s = n.savok[Number(row.dataset.i)];
                row.querySelectorAll("[data-nap]").forEach(b => {
                    b.onclick = () => {
                        olvas();
                        const d = Number(b.dataset.nap);
                        s.napok = s.napok.includes(d) ? s.napok.filter(x => x !== d) : [...s.napok, d].sort();
                        rajz();
                    };
                });
            });
            el.querySelectorAll("[data-ns-torol]").forEach(b => { b.onclick = () => { olvas(); n.savok.splice(Number(b.dataset.nsTorol), 1); rajz(); }; });
            $("#nsUjSav").onclick = () => { olvas(); n.savok.push({ napok: [1, 3, 5], tol: "16:00", ig: "19:00" }); rajz(); };
            $("#nsMod").onchange = () => { olvas(); rajz(); };
            el.querySelectorAll("[data-ns-kiv]").forEach(b => { b.onclick = () => { olvas(); n.kivetelek.splice(Number(b.dataset.nsKiv), 1); rajz(); }; });
            $("#nsKivAdd").onclick = () => { olvas(); const v = $("#nsKivUj").value; if (v && !n.kivetelek.includes(v)) n.kivetelek.push(v); n.kivetelek.sort(); rajz(); };
            $("#nsMent").onclick = () => {
                olvas();
                $("#nsMent").disabled = true;
                Promise.resolve(o.ment({ ...n, alap: undefined }, bem)).catch(e => MandateDesk.hiba(e)).finally(() => { const b = $("#nsMent"); if (b) b.disabled = false; });
            };
        };

        const olvas = () => {
            const $ = q => el.querySelector(q);
            if (!$("#nsHossz")) return;
            if ($("#nsAktiv")) n.aktiv = $("#nsAktiv").checked;
            if ($("#nsBem")) bem = Number($("#nsBem").value) || null;
            el.querySelectorAll(".nsSav").forEach(row => {
                const s = n.savok[Number(row.dataset.i)];
                s.tol = row.querySelector("[data-k=tol]").value || s.tol;
                s.ig = row.querySelector("[data-k=ig]").value || s.ig;
            });
            n.hossz = Number($("#nsHossz").value);
            n.szunet = Number($("#nsSzunet").value);
            n.elore_ora = Number($("#nsElore").value);
            n.lemondas_ora = Number($("#nsLemond").value);
            n.napok_elore = Number($("#nsNapokElore").value);
            n.mod = $("#nsMod").value;
            if ($("#nsKap")) n.kapacitas = Number($("#nsKap").value) || 6;
        };

        rajz();
        return { olvas: () => { olvas(); return n; } };

    }

    // Ablakban (a naptár oldalról)
    static ablak(mb, frissit) {
        const { tartalom, modal } = Svc.modal("nsModal", "modal-lg");
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${Utils.escape(I18n.t("nt_elerhetoseg"))} · ${Utils.escape(MandateDesk.hely(mb))}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${Utils.escape(I18n.t("adsCancel"))}"></button>
            </div>
            <div class="modal-body" id="nsAblak"></div>`;
        NaptarSzerk.rajzol(tartalom.querySelector("#nsAblak"), {
            naptar: mb.naptar, szerk: true,
            ment: n => Svc.api(`/api/ertekesites/megbizasok/${mb.id}/naptar`, { method: "PUT", body: n })
                .then(() => { modal.hide(); MandateDesk.jelez(I18n.t("adsSaved")); if (frissit) frissit(); })
        });
        modal.show();
    }

}

class ViewingCalendar {

    static box = null;
    static all = { tol: null, napok: 7, megbizas: "", enyem: false, kijelolt: null };
    static adat = null;

    // A hét hétfője (helyi dátum ÉÉÉÉ-HH-NN)
    static hetfo(d = new Date()) {
        const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const w = (x.getDay() + 6) % 7;
        x.setDate(x.getDate() - w);
        return ViewingCalendar.nap(x);
    }

    static nap(d) {
        const p = n => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    static napHozzaad(nap, n) {
        const [y, m, d] = nap.split("-").map(Number);
        return ViewingCalendar.nap(new Date(y, m - 1, d + n));
    }

    static ora(d) {
        return new Date(d).toLocaleTimeString(Utils.locale(), { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" });
    }

    // Egy időpont napja romániai idő szerint (ÉÉÉÉ-HH-NN)
    static tzNap(iso) {
        try { return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" }); } catch (e) { return ViewingCalendar.nap(new Date(iso)); }
    }

    static nyit(box) {
        ViewingCalendar.box = box;
        const a = ViewingCalendar.all;
        if (!a.tol) a.tol = ViewingCalendar.hetfo();
        try {
            const m = location.hash.match(/[?&]m=(\d+)/);
            if (m) a.megbizas = m[1];
        } catch (e) { /* nincs */ }
        ViewingCalendar.betolt();
    }

    static betolt() {
        const a = ViewingCalendar.all;
        const box = ViewingCalendar.box;
        if (!ViewingCalendar.adat) box.innerHTML = `<div class="emptyState"><div class="spinner-border text-primary"></div></div>`;
        const q = new URLSearchParams({ tol: a.tol, napok: a.napok });
        if (a.megbizas) q.set("megbizas_id", a.megbizas);
        if (a.enyem) q.set("csak_enyem", "1");
        Svc.api("/api/ertekesites/naptar?" + q).then(d => {
            ViewingCalendar.adat = d;
            ViewingCalendar.rajzol();
        }).catch(e => {
            box.innerHTML = e && e.status === 403 ? `<div class="alert alert-warning">${I18n.t("mdForbidden")}</div>` : `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
        });
    }

    static rajzol() {

        const esc = Utils.escape;
        const d = ViewingCalendar.adat;
        const a = ViewingCalendar.all;
        const box = ViewingCalendar.box;
        const mbk = Object.fromEntries(d.megbizasok.map(m => [m.id, m]));
        const tobb = d.megbizasok.length > 1 && !a.megbizas;
        const most = Date.now();
        const napok = [...Array(a.napok)].map((_, i) => ViewingCalendar.napHozzaad(a.tol, i));
        const ma = ViewingCalendar.nap(new Date());
        const helyiNap = iso => ViewingCalendar.tzNap(iso);

        // Elemek napokra
        const elemek = [];
        d.foglalasok.filter(f => f.idopont && f.statusz !== "kert").forEach(f => {
            const mult = new Date(f.idopont).getTime() < most - 3600 * 1000;
            const tipus = f.statusz === "egyeztetve" ? (mult ? "lezarando" : "foglalt") : "lezart";
            elemek.push({ tipus, nap: helyiNap(f.idopont), ido: f.idopont, f, m: mbk[f.megbizas_id] });
        });
        d.szabad.forEach(s => elemek.push({ tipus: "szabad", nap: helyiNap(s.idopont), ido: s.idopont, s, m: mbk[s.megbizas_id] }));
        elemek.sort((x, y) => new Date(x.ido) - new Date(y.ido));

        const lezarandok = d.foglalasok.filter(f => f.statusz === "egyeztetve" && f.idopont && new Date(f.idopont).getTime() < most - 3600 * 1000);
        const varolista = d.foglalasok.filter(f => f.statusz === "kert");
        const hetCim = `${Svc.nap(napok[0])} – ${Svc.nap(napok[napok.length - 1])}`;
        const valasztott = a.megbizas ? mbk[a.megbizas] : null;

        box.innerHTML = `
            <div class="ntToolbar">
                <div class="d-flex align-items-center gap-1">
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="ntElozo" aria-label="${esc(I18n.t("nt_elozoHet"))}"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
                    <h5 class="mb-0 px-2">${esc(hetCim)}</h5>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="ntKov" aria-label="${esc(I18n.t("nt_kovHet"))}"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
                    <button type="button" class="btn btn-sm btn-link" id="ntMa">${I18n.t("nt_ma")}</button>
                </div>
                <select class="form-select form-select-sm w-auto" id="ntMb" aria-label="${esc(I18n.t("adminTabMandates"))}">
                    <option value="">${I18n.t("nt_mindenIngatlan")} (${d.megbizasok.length})</option>
                    ${d.megbizasok.map(m => `<option value="${m.id}" ${String(a.megbizas) === String(m.id) ? "selected" : ""}>${esc(MandateDesk.hely(m))} · ${esc(m.szerzodes_szam || "")}</option>`).join("")}
                </select>
                <div class="form-check form-switch mb-0">
                    <input class="form-check-input" type="checkbox" role="switch" id="ntEnyem" ${a.enyem ? "checked" : ""}>
                    <label class="form-check-label small" for="ntEnyem">${I18n.t("nt_csakEnyem")}</label>
                </div>
                ${valasztott ? `<button type="button" class="btn btn-sm btn-outline-primary" id="ntSzerk"><i class="fa-solid fa-sliders" aria-hidden="true"></i> ${I18n.t("nt_savokSzerk")}</button>` : ""}
                <div class="ntJelmagyarazat ms-auto">
                    <span><i class="ntJ szabad" aria-hidden="true"></i>${I18n.t("nt_szabad")}</span>
                    <span><i class="ntJ foglalt" aria-hidden="true"></i>${I18n.t("nt_foglalt")}</span>
                    <span><i class="ntJ lezarando" aria-hidden="true"></i>${I18n.t("nt_lezarando")}</span>
                    <span><i class="ntJ lezart" aria-hidden="true"></i>${I18n.t("nt_lezart")}</span>
                </div>
            </div>

            ${!d.megbizasok.length ? `<div class="emptyState"><i class="fa-regular fa-calendar"></i><h5>${I18n.t("nt_nincsMegbizas")}</h5><p>${I18n.t("nt_nincsMegbizasSzoveg")}</p></div>` : `
            <div class="row g-4">
                <div class="col-xxl-9 col-xl-8">
                    <div class="ntRacsWrap">
                        <div class="ntRacs" style="grid-template-columns: repeat(${a.napok}, minmax(118px, 1fr))">
                            ${napok.map(n => {
                                const x = elemek.filter(e => e.nap === n);
                                const dt = new Date(n + "T12:00:00");
                                return `
                                <div class="ntNap ${n === ma ? "ma" : ""}">
                                    <div class="ntNapFej"><span>${esc(dt.toLocaleDateString(Utils.locale(), { weekday: "short" }))}</span><b>${dt.getDate()}</b></div>
                                    ${x.map((e, i) => {
                                        const kulcs = e.tipus === "szabad" ? `s:${e.s.megbizas_id}:${e.ido}` : `f:${e.f.id}`;
                                        const cimke = e.tipus === "szabad" ? (e.s.kapacitas > 1 ? I18n.f("nt_helyDb", { n: e.s.szabad }) : I18n.t("nt_szabad"))
                                            : `${I18n.f("dk_vevoSzam", { n: e.f.vevo_szam || "?" })}${e.tipus === "lezarando" ? " – " + I18n.t("nt_jelold") : e.tipus === "lezart" ? " " + (e.f.statusz === "megtortent" ? "✓" : "✕") : ""}`;
                                        return `<button type="button" class="ntElem ${e.tipus} ${a.kijelolt === kulcs ? "kijelolt" : ""}" data-nt-elem="${esc(kulcs)}" data-i="${i}">
                                            <b>${esc(ViewingCalendar.ora(e.ido))}</b><span>${esc(cimke)}</span>${tobb && e.m ? `<small>${esc(e.m.cim || e.m.telepules || "")}</small>` : ""}
                                        </button>`;
                                    }).join("") || `<div class="ntUres">–</div>`}
                                </div>`;
                            }).join("")}
                        </div>
                    </div>
                    <div id="ntPanel" class="mt-3"></div>
                </div>
                <div class="col-xxl-3 col-xl-4">
                    <section class="card mb-3">
                        <div class="card-header"><h6 class="mb-0"><i class="fa-solid fa-flag-checkered" aria-hidden="true"></i> ${I18n.t("nt_csop_lezarando")} <span class="badge text-bg-light">${lezarandok.length}</span></h6></div>
                        <div class="card-body">
                            ${lezarandok.length ? `<ul class="ntOldalLista">${lezarandok.map(f => `<li><button type="button" class="btn btn-link p-0 text-start" data-nt-elem="f:${f.id}"><b>${esc(Svc.ido(f.idopont))}</b><br><small>${esc(f.erdeklodo_nev || "")} · ${esc(MandateDesk.hely(mbk[f.megbizas_id] || {}))}</small></button></li>`).join("")}</ul>` : `<p class="small text-body-secondary mb-0">${I18n.t("nt_nincsLezarando")}</p>`}
                        </div>
                    </section>
                    <section class="card">
                        <div class="card-header"><h6 class="mb-0"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> ${I18n.t("nt_csop_varolista")} <span class="badge text-bg-light">${varolista.length}</span></h6></div>
                        <div class="card-body">
                            ${varolista.length ? `<ul class="ntOldalLista">${varolista.map(f => `<li>
                                <b>${esc(f.erdeklodo_nev || "–")}</b> ${MandateDesk.tel(f.erdeklodo_telefon)}<br>
                                <small class="text-body-secondary">${esc(MandateDesk.hely(mbk[f.megbizas_id] || {}))}${f.javasolt ? " · " + esc(f.javasolt) : ""}</small>
                                ${d.jog.kezel || (mbk[f.megbizas_id] || {}).bemutato_id === (AuthManager.user || {}).id ? `<div><button type="button" class="btn btn-sm btn-outline-primary mt-1" data-nt-athelyez="${f.id}">${I18n.t("nt_idopontotAd")}</button></div>` : ""}
                            </li>`).join("")}</ul>` : `<p class="small text-body-secondary mb-0">${I18n.t("nt_nincsVarolista")}</p>`}
                        </div>
                    </section>
                </div>
            </div>`}`;

        const $ = q => box.querySelector(q);
        const lep = n => { a.tol = ViewingCalendar.napHozzaad(a.tol, n); a.kijelolt = null; ViewingCalendar.betolt(); };
        if ($("#ntElozo")) {
            $("#ntElozo").onclick = () => lep(-7);
            $("#ntKov").onclick = () => lep(7);
            $("#ntMa").onclick = () => { a.tol = ViewingCalendar.hetfo(); a.kijelolt = null; ViewingCalendar.betolt(); };
            $("#ntMb").onchange = e => { a.megbizas = e.target.value; a.kijelolt = null; ViewingCalendar.betolt(); };
            $("#ntEnyem").onchange = e => { a.enyem = e.target.checked; ViewingCalendar.betolt(); };
        }
        const sz = $("#ntSzerk");
        if (sz) sz.onclick = () => NaptarSzerk.ablak(valasztott, () => ViewingCalendar.betolt());

        box.querySelectorAll("[data-nt-elem]").forEach(b => {
            b.onclick = () => { a.kijelolt = b.dataset.ntElem; ViewingCalendar.rajzol(); const p = $("#ntPanel"); if (p) p.scrollIntoView({ block: "nearest", behavior: "smooth" }); };
        });

        ViewingCalendar.panel(mbk);
        ViewingCalendar.kotMuveletek(box, () => ViewingCalendar.betolt(), tid => d.foglalasok.find(x => x.id === tid));

    }

    // A kijelölt elem részletei és műveletei
    static panel(mbk) {

        const esc = Utils.escape;
        const a = ViewingCalendar.all;
        const d = ViewingCalendar.adat;
        const hova = ViewingCalendar.box.querySelector("#ntPanel");
        if (!hova || !a.kijelolt) return;
        const [t, ...r] = a.kijelolt.split(":");

        if (t === "f") {
            const f = d.foglalasok.find(x => x.id === Number(r[0]));
            if (!f) { hova.innerHTML = ""; return; }
            const m = mbk[f.megbizas_id] || {};
            const cim = MandateDesk.hely(m);
            const mult = f.idopont && new Date(f.idopont).getTime() < Date.now() - 3600 * 1000;
            hova.innerHTML = `
                <section class="card ntPanel">
                    <div class="card-body">
                        <h5 class="mb-2">${esc(f.idopont ? Svc.ido(f.idopont) : I18n.t("mbNoTimeYet"))} · ${esc(I18n.f("dk_vevoSzam", { n: f.vevo_szam || "?" }))} · ${esc(f.erdeklodo_nev || "–")}</h5>
                        <div class="d-flex flex-wrap gap-2 align-items-center small mb-2">
                            ${f.erdeklodo_telefon ? `<a href="tel:${esc(String(f.erdeklodo_telefon).replace(/\s/g, ""))}"><i class="fa-solid fa-phone" aria-hidden="true"></i> ${esc(f.erdeklodo_telefon)}</a><span aria-hidden="true">·</span>` : ""}
                            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cim)}" target="_blank" rel="noopener"><i class="fa-solid fa-route" aria-hidden="true"></i> ${I18n.t("nt_utvonal")}</a>
                            <span aria-hidden="true">·</span>
                            <a href="/api/megbizas/megtekintes/${f.id}/ics"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> ${I18n.t("nt_naptarba")}</a>
                            <span aria-hidden="true">·</span>
                            <span>${esc(cim)}</span>
                            ${f.bemutato_nev ? `<span aria-hidden="true">·</span><span><i class="fa-solid fa-door-open" aria-hidden="true"></i> ${esc(f.bemutato_nev)}</span>` : ""}
                            ${d.jog.kezel ? `<span aria-hidden="true">·</span><a href="#admin/megbizasok/${f.megbizas_id}/megtekintesek">${esc(m.szerzodes_szam || "")}</a>` : ""}
                        </div>
                        ${f.visszajelzes ? `<p class="small mb-2"><i class="fa-regular fa-comment" aria-hidden="true"></i> ${esc(f.visszajelzes)}</p>` : ""}
                        <span class="badge text-bg-light mb-2">${esc(I18n.t("mbVw_" + f.statusz))}</span>
                        ${f.statusz === "egyeztetve" ? `
                        <div class="d-flex flex-wrap gap-2">
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-nt-athelyez="${f.id}">${I18n.t("nt_athelyez")}</button>
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-nt-lezar="${f.id}:elmaradt">${I18n.t("mbVw_elmaradt")}</button>
                            <button type="button" class="btn btn-sm ${mult ? "btn-success" : "btn-outline-success"}" data-nt-lezar="${f.id}:megtortent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("nt_megtortentJegyzet")}</button>
                            <button type="button" class="btn btn-sm btn-link text-danger" data-nt-lemond="${f.id}">${I18n.t("nt_lemond")}</button>
                        </div>
                        <p class="small text-body-secondary mt-2 mb-0">${I18n.t("nt_megtortentSugo")}</p>` : ""}
                    </div>
                </section>`;
            return;
        }

        // Szabad időpont
        const [mid, ...idoReszek] = r;
        const ido = idoReszek.join(":");
        const m = mbk[mid] || {};
        const varok = d.foglalasok.filter(x => x.statusz === "kert" && String(x.megbizas_id) === String(mid));
        hova.innerHTML = `
            <section class="card ntPanel">
                <div class="card-body">
                    <h5 class="mb-1">${esc(Svc.ido(ido))} · ${I18n.t("nt_szabad")}</h5>
                    <p class="small text-body-secondary">${esc(MandateDesk.hely(m))} · ${esc(m.szerzodes_szam || "")}</p>
                    ${varok.length ? `
                    <div class="d-flex flex-wrap gap-2 align-items-end">
                        <div><label class="form-label small mb-1" for="ntVarSel">${I18n.t("nt_varolistarol")}</label>
                        <select class="form-select form-select-sm" id="ntVarSel">${varok.map(x => `<option value="${x.id}">${esc(x.erdeklodo_nev || "–")}${x.javasolt ? " (" + esc(x.javasolt) + ")" : ""}</option>`).join("")}</select></div>
                        <button type="button" class="btn btn-sm btn-primary" id="ntKiad">${I18n.t("nt_idopontKiad")}</button>
                    </div>` : `<p class="small mb-2">${I18n.t("nt_szabadSugo")}</p>`}
                    <div class="mt-2"><button type="button" class="btn btn-sm btn-outline-secondary" id="ntSzerk2"><i class="fa-solid fa-sliders" aria-hidden="true"></i> ${I18n.t("nt_savokSzerk")}</button></div>
                </div>
            </section>`;
        const kiad = hova.querySelector("#ntKiad");
        if (kiad) kiad.onclick = () => {
            kiad.disabled = true;
            Svc.api(`/api/ertekesites/megtekintes/${hova.querySelector("#ntVarSel").value}/athelyez`, { method: "PUT", body: { idopont: ido } })
                .then(() => { MandateDesk.jelez(I18n.t("adsSaved")); a.kijelolt = null; ViewingCalendar.betolt(); })
                .catch(e => { kiad.disabled = false; MandateDesk.hiba(e); });
        };
        const sz2 = hova.querySelector("#ntSzerk2");
        if (sz2) sz2.onclick = () => NaptarSzerk.ablak(m, () => ViewingCalendar.betolt());

    }

    // Közös műveletek (a naptárban és a megbízás Megtekintések fülén):
    //   [data-nt-lezar="tid:megtortent|elmaradt"], [data-nt-athelyez="tid"], [data-nt-lemond="tid"]
    static kotMuveletek(root, frissit, keres) {

        root.querySelectorAll("[data-nt-lezar]").forEach(b => {
            b.onclick = () => {
                const [tid, statusz] = b.dataset.ntLezar.split(":");
                const t = keres(Number(tid)) || {};
                const vj = prompt(I18n.t(statusz === "megtortent" ? "nt_jegyzetKerdes" : "nt_elmaradtKerdes"), statusz === "megtortent" ? (t.visszajelzes || "") : "");
                if (vj === null) return;
                b.disabled = true;
                Svc.api(`/api/ertekesites/megtekintes/${tid}/lezar`, { method: "PUT", body: { statusz, visszajelzes: vj || null } })
                    .then(() => { MandateDesk.jelez(I18n.t(statusz === "megtortent" ? "nt_lezarvaOk" : "adsSaved")); frissit(); })
                    .catch(e => { b.disabled = false; MandateDesk.hiba(e); });
            };
        });

        root.querySelectorAll("[data-nt-lemond]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("nt_lemondKerdes"))) return;
                const ertesit = confirm(I18n.t("nt_lemondErtesit"));
                Svc.api(`/api/ertekesites/megtekintes/${b.dataset.ntLemond}/lemond`, { method: "POST", body: { ertesit } })
                    .then(() => { MandateDesk.jelez(I18n.t("mdDone")); frissit(); })
                    .catch(e => MandateDesk.hiba(e));
            };
        });

        root.querySelectorAll("[data-nt-athelyez]").forEach(b => {
            b.onclick = () => {
                const t = keres(Number(b.dataset.ntAthelyez));
                if (!t) return;
                ViewingCalendar.idopontValaszto(t.megbizas_id, ido => Svc.api(`/api/ertekesites/megtekintes/${t.id}/athelyez`, { method: "PUT", body: { idopont: ido } })
                    .then(() => { MandateDesk.jelez(I18n.t("adsSaved")); frissit(); }));
            };
        });

    }

    // Szabad időpont választása (áthelyezés, várólistásnak időpont)
    static idopontValaszto(megbizasId, kesz) {

        const esc = Utils.escape;
        const { tartalom, modal } = Svc.modal("ntValModal", "");
        tartalom.innerHTML = `<div class="modal-body"><div class="emptyState"><div class="spinner-border text-primary"></div></div></div>`;
        modal.show();

        Svc.api(`/api/ertekesites/megbizasok/${megbizasId}/idopontok?napok=30`).then(lista => {
            const szabad = lista.filter(x => x.szabad > 0);
            const napok = [...new Set(szabad.map(x => x.nap))];
            let valasztottNap = napok[0];
            let valasztott = null;
            const rajz = () => {
                tartalom.innerHTML = `
                    <div class="modal-header">
                        <h5 class="modal-title">${I18n.t("nt_ujIdopont")}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
                    </div>
                    <div class="modal-body">
                        ${napok.length ? `
                        <div class="bkNapok mb-3" role="group" aria-label="${esc(I18n.t("vv_nap"))}">
                            ${napok.map(n => { const dt = new Date(n + "T12:00:00"); return `<button type="button" class="bkNap ${n === valasztottNap ? "be" : ""}" data-nap="${n}"><span>${esc(dt.toLocaleDateString(Utils.locale(), { weekday: "short" }))}</span><b>${dt.getDate()}</b><small>${esc(dt.toLocaleDateString(Utils.locale(), { month: "short" }))}</small></button>`; }).join("")}
                        </div>
                        <div class="bkIdok" role="group" aria-label="${esc(I18n.t("vv_ido"))}">
                            ${szabad.filter(x => x.nap === valasztottNap).map(x => `<button type="button" class="bkIdo ${valasztott === x.idopont ? "be" : ""}" data-ido="${esc(x.idopont)}">${esc(x.ora)}</button>`).join("")}
                        </div>` : `<p class="text-body-secondary">${I18n.t("nt_nincsSzabad")}</p>`}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
                        <button type="button" class="btn btn-primary" id="ntValOk" ${valasztott ? "" : "disabled"}>${I18n.t("nt_athelyez")}</button>
                    </div>`;
                tartalom.querySelectorAll("[data-nap]").forEach(b => { b.onclick = () => { valasztottNap = b.dataset.nap; valasztott = null; rajz(); }; });
                tartalom.querySelectorAll("[data-ido]").forEach(b => { b.onclick = () => { valasztott = b.dataset.ido; rajz(); }; });
                const ok = tartalom.querySelector("#ntValOk");
                if (ok) ok.onclick = () => {
                    ok.disabled = true;
                    Promise.resolve(kesz(valasztott)).then(() => modal.hide()).catch(e => { ok.disabled = false; MandateDesk.hiba(e); });
                };
            };
            rajz();
        }).catch(e => { tartalom.innerHTML = `<div class="modal-body"><div class="alert alert-warning mb-0">${Svc.hiba(e)}</div></div>`; });

    }

}
