// ============================================================
//  Admin – Pénzügyek (2/2): Díjbekérők / számlák, Előfizetések
//
//  Díjbekérő (proforma): tételes, sorszámozott (DB-2026-0001), nyomtatható
//  / PDF-be menthető, e-mailben elküldhető. Fizetve / lejárt / sztornó.
//  A hivatalos (e-Factura) számla számát a "Hivatalos számla száma"
//  mezőbe lehet beírni.
//  Előfizetés: ügyfél + csomag + ár + időszak; a "Következő díjbekérő"
//  napján (vagy pár nappal előtte) elkészül a díjbekérő – gombbal, vagy
//  ha a beállításokban be van kapcsolva, magától.
// ============================================================

AdminManager.fin.szSzuro = { allapot: "", ho: "", ugyfel: null, q: "" };

AdminManager.FIN_ALLAPOT_SZIN = { piszkozat: "secondary", kiallitva: "warning", lejart: "danger", fizetve: "success", sztorno: "dark" };

AdminManager.finAllapotBadge = function (s) {
    const a = s.allapot || s.statusz;
    return `<span class="badge text-bg-${AdminManager.FIN_ALLAPOT_SZIN[a] || "secondary"}">${I18n.t("finSt_" + a)}</span>`;
};

AdminManager.finVevoNev = s => (s.vevo && s.vevo.nev) || s.ugyfel_nev || "–";

// Rövid sor (áttekintés)
AdminManager.finSzamlaSorRovid = function (s) {
    const esc = Utils.escape;
    return `
        <article class="finRow">
            <span class="kpiIcon ${s.tipus === "szamla" ? "blue" : "green"}"><i class="fa-solid ${s.tipus === "szamla" ? "fa-file-invoice-dollar" : "fa-file-invoice"}" aria-hidden="true"></i></span>
            <div class="finMain">
                <b>${esc(s.sorszam)}</b> ${AdminManager.finAllapotBadge(s)}
                <div class="small text-body-secondary">${esc(AdminManager.finVevoNev(s))} · ${esc(AdminManager.finNap(s.kiallitva))}</div>
            </div>
            <b class="finAmount">${esc(AdminManager.finPenz(s.brutto, s.penznem))}</b>
            <div class="finActions">
                <button type="button" class="btn btn-sm btn-outline-primary" data-fin-open="${s.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("adsEdit")}</button>
            </div>
        </article>`;
};

// ===================== DÍJBEKÉRŐK / SZÁMLÁK =====================

AdminManager.renderFinInvoices = function () {

    AdminManager.loading();

    const f = AdminManager.fin.szSzuro;
    let ut = "szamlak";
    if (f.ho) {
        const tol = f.ho.length === 4 ? `${f.ho}-01-01` : `${f.ho}-01`;
        const ig = f.ho.length === 4 ? `${f.ho}-12-31` : `${f.ho}-31`;
        ut += `?tol=${tol}&ig=${ig}`;
    }

    Promise.all([AdminManager.finApi(ut), AdminManager.finCfg(), AdminManager.finUgyfelLista()]).then(([lista]) => {

        AdminManager.fin.szamlak = lista;
        const box = AdminManager.box();
        const esc = Utils.escape;
        const b = AdminManager.fin.cfg.beallitas;

        let alap = lista;
        if (f.ugyfel) alap = alap.filter(s => s.ugyfel_id === f.ugyfel);
        const q = (f.q || "").trim().toLowerCase();
        if (q) alap = alap.filter(s => [s.sorszam, s.kulso_szam, AdminManager.finVevoNev(s), s.vevo && s.vevo.cui, ...(s.tetelek_rovid || []).map(t => t.megnevezes)]
            .some(v => String(v || "").toLowerCase().includes(q)));

        const allapotok = ["kiallitva", "lejart", "fizetve", "piszkozat", "sztorno"];
        const db = k => alap.filter(s => s.allapot === k || (k === "kiallitva" && s.allapot === "lejart")).length;
        if (f.allapot && !db(f.allapot)) f.allapot = "";
        const szurt = f.allapot ? alap.filter(s => s.allapot === f.allapot || (f.allapot === "kiallitva" && s.allapot === "lejart")) : alap;

        const ron = s => s.penznem === "EUR" ? s.brutto * (b.eur_arfolyam || 5) : s.brutto;
        const ossz = szurt.filter(s => s.statusz !== "sztorno").reduce((x, s) => x + ron(s), 0);

        // Hónap / év választó: az utolsó 18 hónap + az évek
        const most = new Date();
        const hok = [];
        for (let i = 0; i < 18; i++) {
            const d = new Date(most.getFullYear(), most.getMonth() - i, 1);
            hok.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
        const evek = [most.getFullYear(), most.getFullYear() - 1, most.getFullYear() - 2].map(String);
        const ugyfel = f.ugyfel ? (AdminManager.fin.ugyfelek || []).find(u => u.id === f.ugyfel) : null;

        const exportUt = f.ho
            ? `/api/admin/penzugy/export/szamlak?tol=${f.ho.length === 4 ? f.ho + "-01-01" : f.ho + "-01"}&ig=${f.ho.length === 4 ? f.ho + "-12-31" : f.ho + "-31"}`
            : "/api/admin/penzugy/export/szamlak";

        box.innerHTML = `
            <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                <select class="form-select form-select-sm w-auto" id="fsHo" aria-label="${esc(I18n.t("finPeriodFilter"))}">
                    <option value="">${I18n.t("finAllTime")}</option>
                    <optgroup label="${esc(I18n.t("finYear"))}">${evek.map(e => `<option ${f.ho === e ? "selected" : ""}>${e}</option>`).join("")}</optgroup>
                    <optgroup label="${esc(I18n.t("finMonth"))}">${hok.map(h => `<option value="${h}" ${f.ho === h ? "selected" : ""}>${esc(new Date(h + "-15T12:00:00").toLocaleDateString(Utils.locale(), { year: "numeric", month: "long" }))}</option>`).join("")}</optgroup>
                </select>
                <div class="input-group input-group-sm finSearch">
                    <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
                    <input type="search" class="form-control" id="fsQ" value="${esc(f.q || "")}" placeholder="${esc(I18n.t("finSearchInvoice"))}" aria-label="${esc(I18n.t("finSearchInvoice"))}">
                </div>
                ${ugyfel ? `<span class="badge text-bg-primary finChip">${esc(ugyfel.nev)} <button type="button" class="btn-close btn-close-white ms-1" id="fsUgyfelKi" aria-label="${esc(I18n.t("finClearFilter"))}"></button></span>` : ""}
                <a class="btn btn-outline-secondary btn-sm ms-auto" href="${exportUt}"><i class="fa-solid fa-file-csv" aria-hidden="true"></i> ${I18n.t("finExport")}</a>
                <button type="button" class="btn btn-primary btn-sm" id="fsUj"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("finNewInvoice")}</button>
            </div>

            <div class="typeTabs mb-3" role="tablist">
                <button type="button" class="typeTab ${!f.allapot ? "active" : ""}" data-fs-all="">${I18n.t("finFilterAll")} <span class="typeTabCount">${alap.length}</span></button>
                ${allapotok.filter(k => db(k)).map(k => `
                    <button type="button" class="typeTab ${f.allapot === k ? "active" : ""}" data-fs-all="${k}">${I18n.t(k === "kiallitva" ? "finFilterOpen" : "finSt_" + k)} <span class="typeTabCount">${db(k)}</span></button>`).join("")}
            </div>

            ${szurt.length ? `
                <p class="small text-body-secondary">${I18n.f("finListTotal", { n: szurt.length, osszeg: `<b>${esc(AdminManager.finPenz(Math.round(ossz * 100) / 100, "RON"))}</b>` })}</p>
                <div class="finList">${szurt.map(s => AdminManager.finSzamlaSor(s)).join("")}</div>` : `
                <div class="emptyState py-4">
                    <i class="fa-solid fa-file-invoice" aria-hidden="true"></i>
                    <h5>${I18n.t(lista.length ? "finNothingFound" : "finNoInvoices")}</h5>
                    ${lista.length ? "" : `<p>${I18n.t("finNoInvoicesHint")}</p>`}
                </div>`}`;

        const ujra = () => AdminManager.renderFinInvoices();
        document.getElementById("fsHo").onchange = e => { f.ho = e.target.value; ujra(); };
        const qi = document.getElementById("fsQ");
        qi.oninput = () => {
            clearTimeout(AdminManager.fin.qTimer);
            AdminManager.fin.qTimer = setTimeout(() => {
                f.q = qi.value;
                ujra();
                setTimeout(() => { const x = document.getElementById("fsQ"); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 0);
            }, 300);
        };
        const ki = document.getElementById("fsUgyfelKi");
        if (ki) ki.onclick = () => { f.ugyfel = null; ujra(); };
        document.getElementById("fsUj").onclick = () => AdminManager.finSzamlaSzerk(null, ujra, f.ugyfel ? { ugyfel_id: f.ugyfel } : {});
        box.querySelectorAll("[data-fs-all]").forEach(btn => { btn.onclick = () => { f.allapot = btn.dataset.fsAll; ujra(); }; });
        AdminManager.finSzamlaGombok(box, ujra);

    }).catch(() => AdminManager.finHibaDoboz());

};

AdminManager.finSzamlaSor = function (s) {
    const esc = Utils.escape;
    const lejart = s.allapot === "lejart";
    const kat = [...new Set((s.tetelek_rovid || []).map(t => t.kategoria))];
    return `
        <article class="finRow ${lejart ? "late" : ""}">
            <span class="kpiIcon ${s.tipus === "szamla" ? "blue" : "green"}"><i class="fa-solid ${s.tipus === "szamla" ? "fa-file-invoice-dollar" : "fa-file-invoice"}" aria-hidden="true"></i></span>
            <div class="finMain">
                <div class="d-flex flex-wrap align-items-center gap-2">
                    <b>${AdminManager.finSorszam(s)}</b> ${AdminManager.finAllapotBadge(s)}
                    ${AdminManager.efBadge ? AdminManager.efBadge(s.ef, s.id) : ""}
                    <span class="small text-body-secondary">${I18n.t(s.tipus === "szamla" ? "finTypeInvoice" : "finTypeProforma")}${s.kulso_szam ? ` · ${esc(s.kulso_szam)}` : ""}</span>
                </div>
                <div class="small"><b>${esc(AdminManager.finVevoNev(s))}</b> · ${(s.tetelek_rovid || []).map(t => esc(t.megnevezes)).join(", ")}</div>
                <div class="small text-body-secondary">
                    ${I18n.f("finIssuedOn", { datum: esc(AdminManager.finNap(s.kiallitva)) })}
                    · ${s.statusz === "fizetve" ? I18n.f("finPaidOn", { datum: esc(AdminManager.finNap(s.fizetve)) }) : `<span class="${lejart ? "text-danger fw-semibold" : ""}">${I18n.f("finDueOn", { datum: esc(AdminManager.finNap(s.esedekes)) })}</span>`}
                    ${kat.map(k => ` · <i class="${AdminManager.FIN_KAT_IKON[k] || AdminManager.FIN_KAT_IKON.egyeb}" aria-hidden="true" title="${esc(AdminManager.finKatLabel(k))}"></i>`).join("")}
                    ${s.emailezve ? ` · <i class="fa-solid fa-envelope-circle-check" aria-hidden="true" title="${esc(I18n.t("finEmailed"))}"></i>` : ""}
                </div>
            </div>
            <b class="finAmount ${s.statusz === "sztorno" ? "text-decoration-line-through text-body-secondary" : ""}">${esc(AdminManager.finPenz(s.brutto, s.penznem))}</b>
            <div class="finActions">
                ${["kiallitva", "piszkozat"].includes(s.statusz) ? `<button type="button" class="btn btn-sm btn-success" data-fs-fizetve="${s.id}"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finMarkPaid")}</button>` : ""}
                <a class="btn btn-sm btn-outline-secondary" href="/api/admin/penzugy/szamlak/${s.id}/nyomtat${Dokumentum.q(true)}" target="_blank" rel="noopener" title="${esc(I18n.t("finPrint"))}"><i class="fa-solid fa-print" aria-hidden="true"></i><span class="visually-hidden">${I18n.t("finPrint")}</span></a>
                ${s.tipus === "szamla" && s.statusz !== "piszkozat" ? `<button type="button" class="btn btn-sm btn-outline-primary" data-fs-xml="${s.id}" data-fs-xml-nev="${esc(s.sorszam)}" title="${esc(I18n.t("finXmlHint"))}"><i class="fa-solid fa-file-code" aria-hidden="true"></i> XML</button>` : ""}
                <button type="button" class="btn btn-sm btn-outline-secondary" data-fs-email="${s.id}" title="${esc(I18n.t("finSendEmail"))}"><i class="fa-solid fa-envelope" aria-hidden="true"></i><span class="visually-hidden">${I18n.t("finSendEmail")}</span></button>
                <button type="button" class="btn btn-sm btn-outline-primary" data-fs-szerk="${s.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("adsEdit")}</button>
            </div>
        </article>`;
};

AdminManager.finSzamlaGombok = function (box, kesz) {
    box.querySelectorAll("[data-fs-szerk]").forEach(b => { b.onclick = () => AdminManager.finSzamlaSzerk(Number(b.dataset.fsSzerk), kesz); });
    box.querySelectorAll("[data-fs-fizetve]").forEach(b => { b.onclick = () => AdminManager.finFizetve(Number(b.dataset.fsFizetve), kesz); });
    box.querySelectorAll("[data-fs-email]").forEach(b => { b.onclick = () => AdminManager.finEmail(Number(b.dataset.fsEmail), kesz); });
    box.querySelectorAll("[data-fs-xml]").forEach(b => { b.onclick = () => AdminManager.finXml(Number(b.dataset.fsXml), b.dataset.fsXmlNev); });
    if (AdminManager.efBadgeKot) AdminManager.efBadgeKot(box, kesz);
};

// A számla sorszáma (a piszkozat még nem kap sorszámot)
AdminManager.finSorszam = function (s) {
    return /^TERV-/.test(String(s.sorszam || "")) ? `<span class="text-body-secondary">${Utils.escape(I18n.t("finNoNumberYet"))}</span>` : Utils.escape(s.sorszam || "");
};

// e-Factura XML letöltése (ha hiányzik adat, megmondja mi)
AdminManager.finXml = function (id, nev) {
    return fetch(`/api/admin/penzugy/szamlak/${id}/efactura.xml`, { cache: "no-store", credentials: "same-origin" }).then(r => {
        if (r.ok) return r.blob().then(b => {
            const u = URL.createObjectURL(b);
            const l = document.createElement("a");
            l.href = u;
            l.download = String(nev || "factura").replace(/[^\w.-]/g, "_") + ".xml";
            document.body.appendChild(l);
            l.click();
            l.remove();
            setTimeout(() => URL.revokeObjectURL(u), 3000);
        });
        return r.json().catch(() => ({})).then(j => {
            const h = AdminManager.finHianyok(j).map(k => "• " + k).join("\n");
            alert(I18n.t("irEfacturaMissing") + (h ? "\n\n" + h : ""));
        });
    }).catch(() => alert(I18n.t("alertLoadError")));
};

// A hiányzó adatok szövege (a kezelő nyelvén; ha nincs fordítás, a szerver magyar szövege)
AdminManager.finHianyok = function (j) {
    return (j.hianyzik || []).map((k, i) => {
        const kulcs = "irEfMissing_" + k;
        return I18n.t(kulcs) !== kulcs ? I18n.t(kulcs) : ((j.hianyzik_szoveg || [])[i] || k);
    });
};

// Ellenőrzés az ANAF-nál (ugyanazok a szabályok, mint a feltöltéskor)
AdminManager.finAnaf = function (id, gomb) {
    if (gomb) gomb.disabled = true;
    return fetch(`/api/admin/penzugy/szamlak/${id}/efactura/ellenoriz`, { method: "POST", credentials: "same-origin" })
        .then(r => r.json().catch(() => ({})))
        .then(j => {
            if (j.hianyzik) return alert(I18n.t("irEfacturaMissing") + "\n\n" + AdminManager.finHianyok(j).map(k => "• " + k).join("\n"));
            if (j.stare === "ok") return alert(I18n.t("finAnafOk"));
            alert(I18n.t("finAnafNok") + "\n\n" + (j.hibak || []).map(k => "• " + k).join("\n"));
        })
        .catch(() => alert(I18n.t("alertLoadError")))
        .finally(() => { if (gomb) gomb.disabled = false; });
};

AdminManager.finUgyfelLista = function (frissit) {
    if (AdminManager.fin.ugyfelek && !frissit) return Promise.resolve(AdminManager.fin.ugyfelek);
    return AdminManager.finApi("ugyfelek").then(v => { AdminManager.fin.ugyfelek = v; return v; });
};

AdminManager.finCsomagLista = function (frissit) {
    if (AdminManager.fin.csomagok && !frissit) return Promise.resolve(AdminManager.fin.csomagok);
    return AdminManager.finApi("csomagok").then(v => { AdminManager.fin.csomagok = v; return v; });
};

// Fizetve: dátum, fizetési mód, hivatalos számla száma
AdminManager.finFizetve = function (id, kesz) {

    const esc = Utils.escape;
    const s = (AdminManager.fin.szamlak || []).find(x => x.id === id) || {};
    const L = AdminManager.fin.cfg.listak;
    const { tartalom, modal } = AdminManager.finModal("finFizetveModal", "modal-sm");

    tartalom.innerHTML = `
        <div class="modal-header">
            <h5 class="modal-title"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${I18n.t("finMarkPaid")}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
        </div>
        <div class="modal-body">
            <p class="small mb-2"><b>${esc(s.sorszam || "")}</b> · ${esc(AdminManager.finPenz(s.brutto, s.penznem))}</p>
            <label class="form-label small mb-1" for="ffDatum">${I18n.t("finPaidDate")}</label>
            <input type="date" class="form-control form-control-sm mb-2" id="ffDatum" value="${AdminManager.finMa()}">
            <label class="form-label small mb-1" for="ffMod">${I18n.t("finPayMethod")}</label>
            <select class="form-select form-select-sm mb-2" id="ffMod">${L.fizetesiModok.map(m => `<option value="${m}" ${(s.fizetesi_mod || "atutalas") === m ? "selected" : ""}>${esc(I18n.t("finPay_" + m))}</option>`).join("")}</select>
            <label class="form-label small mb-1" for="ffKulso">${I18n.t("finOfficialNumber")}</label>
            <input class="form-control form-control-sm" id="ffKulso" value="${esc(s.kulso_szam || "")}" maxlength="60" placeholder="${esc(I18n.t("finOfficialNumberPh"))}">
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
            <button type="button" class="btn btn-success" id="ffMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finMarkPaid")}</button>
        </div>`;

    tartalom.querySelector("#ffMent").onclick = () => {
        const btn = tartalom.querySelector("#ffMent");
        btn.disabled = true;
        AdminManager.finApi(`szamlak/${id}/allapot`, {
            method: "POST",
            body: { statusz: "fizetve", fizetve: tartalom.querySelector("#ffDatum").value, fizetesi_mod: tartalom.querySelector("#ffMod").value, kulso_szam: tartalom.querySelector("#ffKulso").value }
        })
            .then(() => { modal.hide(); AdminManager.refreshPendingCount(); if (kesz) kesz(); })
            .catch(e => { btn.disabled = false; AdminManager.finHiba(e); });
    };

    modal.show();

};

AdminManager.finEmail = function (id, kesz) {
    const s = (AdminManager.fin.szamlak || []).find(x => x.id === id) || {};
    const cfg = AdminManager.fin.cfg || {};
    if (!cfg.email) { alert(I18n.t("finErr_mail_not_configured")); return; }
    const cim = prompt(I18n.t("finEmailPrompt"), (s.vevo && s.vevo.email) || "");
    if (!cim) return;
    AdminManager.finApi(`szamlak/${id}/email`, { method: "POST", body: { email: cim } })
        .then(v => { alert(I18n.f("finEmailSent", { to: v.to })); if (kesz) kesz(); })
        .catch(AdminManager.finHiba);
};

// Esedékes előfizetések díjbekérői
AdminManager.finEsedekesKeszit = function (btn, kesz) {
    if (btn) btn.disabled = true;
    AdminManager.finApi("esedekes-dijbekerok", { method: "POST" })
        .then(v => {
            alert(I18n.f("finDueMade", { n: v.db }));
            AdminManager.refreshPendingCount();
            if (kesz) kesz();
        })
        .catch(e => { if (btn) btn.disabled = false; AdminManager.finHiba(e); });
};

// ---------- A díjbekérő / számla szerkesztője ----------
//  opts.ugyfel_id: ennek az ügyfélnek; opts.reklam: egy reklám díjbekérője

AdminManager.finSzamlaSzerk = function (id, kesz, opts = {}) {

    const betolt = id ? AdminManager.finApi("szamlak/" + id) : Promise.resolve(null);
    const reklamok = fetch("/api/admin/reklamok?napok=7", { cache: "no-store" }).then(r => r.ok ? r.json() : {}).then(v => v.hirdetesek || []).catch(() => []);

    Promise.all([betolt, AdminManager.finCfg(), AdminManager.finUgyfelLista(true), AdminManager.finCsomagLista(), reklamok])
        .then(([s, cfg, ugyfelek, csomagok, reklamLista]) => AdminManager.finSzamlaUrlap(s, { ...opts, cfg, ugyfelek, csomagok, reklamLista, kesz }))
        .catch(() => alert(I18n.t("alertLoadError")));

};

AdminManager.finSzamlaUrlap = function (s, o) {

    const uj = !s;
    const esc = Utils.escape;
    const b = o.cfg.beallitas;
    const L = o.cfg.listak;
    const ma = AdminManager.finMa();
    const plusNap = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

    if (uj) {
        s = {
            tipus: "dijbekero", statusz: "kiallitva", kiallitva: ma, esedekes: plusNap(ma, b.fizetesi_hatarido || 14),
            penznem: b.penznem || "RON", ugyfel_id: o.ugyfel_id || null, tetelek: [{ megnevezes: "", mennyiseg: 1, egysegar: "", kategoria: "egyeb" }]
        };
        if (o.minta) {
            // Előre kitöltve (másolat / új ügyfél felvétele közben megkezdett űrlap)
            s = { ...s, ...o.minta };
            if (!s.tetelek || !s.tetelek.length) s.tetelek = [{ megnevezes: "", mennyiseg: 1, egysegar: "", kategoria: "egyeb" }];
        } else if (o.reklam) {
            const r = o.reklam;
            const nev = String(r.hirdeto || "").trim().toLowerCase();
            const talalt = nev ? o.ugyfelek.find(u => u.nev.toLowerCase() === nev) : null;
            s.ugyfel_id = talalt ? talalt.id : null;
            s.reklam_id = r.id;
            s.idoszak_tol = r.kezdet || null;
            s.idoszak_ig = r.vege || null;
            s.tetelek = [{
                megnevezes: `${I18n.t("finCat_reklamfelulet")}: ${r.nev}${r.kezdet ? ` (${r.kezdet}${r.vege ? " – " + r.vege : ""})` : ""}`,
                mennyiseg: 1, egysegar: r.ar, kategoria: "reklamfelulet"
            }];
        }
    }

    const { tartalom, modal, el } = AdminManager.finModal("finSzamlaModal", "modal-xl");
    const afa = !!b.afa_fizeto;
    const lezart = !uj && ["fizetve", "sztorno"].includes(s.statusz);
    // Kiállított számla: a tartalma nem módosítható (csak a fizetés adatai) – javítás sztornó számlával
    const zart = !uj && s.tipus === "szamla" && s.statusz !== "piszkozat";

    const ugyfelOpts = sel => `<option value="">${I18n.t("finPickCustomer")}</option>` +
        o.ugyfelek.map(u => `<option value="${u.id}" ${u.id === sel ? "selected" : ""}>${esc(u.nev)}${u.cui ? " · " + esc(u.cui) : ""}</option>`).join("");

    const tetelSor = (t, i) => `
        <tr data-tetel="${i}">
            <td class="finTdName">
                <input class="form-control form-control-sm" data-t="megnevezes" value="${esc(t.megnevezes || "")}" maxlength="300" placeholder="${esc(I18n.t("finItemPh"))}" aria-label="${esc(I18n.t("finItemName"))}">
                <input class="form-control form-control-sm mt-1" data-t="megnevezes_ro" value="${esc(t.megnevezes_ro || "")}" maxlength="300" placeholder="${esc(I18n.t("finItemRoPh"))}" aria-label="${esc(I18n.t("finItemRo"))}" title="${esc(I18n.t("finItemRoHelp"))}">
                <input type="hidden" data-t="megnevezes_en" value="${esc(t.megnevezes_en || "")}">
                <select class="form-select form-select-sm mt-1" data-t="kategoria" aria-label="${esc(I18n.t("finCategory"))}">${L.kategoriak.map(k => `<option value="${k}" ${(t.kategoria || "egyeb") === k ? "selected" : ""}>${esc(AdminManager.finKatLabel(k))}</option>`).join("")}</select>
                <input type="hidden" data-t="csomag_id" value="${t.csomag_id || ""}">
            </td>
            <td><input type="number" min="0.01" step="0.01" class="form-control form-control-sm" data-t="mennyiseg" value="${t.mennyiseg ?? 1}" aria-label="${esc(I18n.t("finQty"))}"></td>
            <td><input type="number" min="0" step="0.01" class="form-control form-control-sm" data-t="egysegar" value="${t.egysegar ?? ""}" aria-label="${esc(I18n.t("finUnitPrice"))}"></td>
            ${afa ? `<td><input type="number" min="0" max="50" step="0.5" class="form-control form-control-sm" data-t="afa_kulcs" value="${t.afa_kulcs ?? b.afa_kulcs}" aria-label="${esc(I18n.t("finVatRate"))}"></td>` : ""}
            <td class="text-end finTdSum" data-t-ossz>–</td>
            <td><button type="button" class="btn btn-sm btn-outline-danger" data-t-torol title="${esc(I18n.t("finDelete"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span class="visually-hidden">${I18n.t("finDelete")}</span></button></td>
        </tr>`;

    tartalom.innerHTML = `
        <div class="modal-header">
            <h5 class="modal-title"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${uj ? I18n.t("finNewInvoice") : AdminManager.finSorszam(s)} ${!uj ? AdminManager.finAllapotBadge(s) : ""}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
        </div>
        <div class="modal-body">
            ${zart ? `<div class="alert alert-info small"><i class="fa-solid fa-lock" aria-hidden="true"></i> ${I18n.t("finInvoiceLockedNote")}</div>` : lezart ? `<div class="alert alert-secondary small">${I18n.t("finLockedNote")}</div>` : ""}
            <div class="row g-2">
                <div class="col-md-6">
                    <label class="form-label small mb-1" for="fszUgyfel">${I18n.t("finCustomer")} *</label>
                    <div class="input-group input-group-sm">
                        <select class="form-select" id="fszUgyfel">${ugyfelOpts(s.ugyfel_id)}</select>
                        <button type="button" class="btn btn-outline-primary" id="fszUjUgyfel"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${I18n.t("finNew")}</button>
                    </div>
                    ${!uj && s.vevo && s.vevo.nev ? `<div class="small text-body-secondary mt-1">${I18n.f("finBuyerOnDoc", { nev: esc(s.vevo.nev) })}</div>` : ""}
                </div>
                <div class="col-6 col-md-3">
                    <label class="form-label small mb-1" for="fszTipus">${I18n.t("finDocType")}</label>
                    <select class="form-select form-select-sm" id="fszTipus">
                        <option value="dijbekero" ${s.tipus !== "szamla" ? "selected" : ""}>${I18n.t("finTypeProforma")}</option>
                        <option value="szamla" ${s.tipus === "szamla" ? "selected" : ""}>${I18n.t("finTypeInvoice")}</option>
                    </select>
                </div>
                <div class="col-6 col-md-3">
                    <label class="form-label small mb-1" for="fszStatusz">${I18n.t("finStatus")}</label>
                    <select class="form-select form-select-sm" id="fszStatusz">${(zart ? (s.statusz === "sztorno" ? ["sztorno"] : ["kiallitva", "fizetve"]) : ["piszkozat", "kiallitva", "fizetve", "sztorno"]).map(k => `<option value="${k}" ${s.statusz === k ? "selected" : ""}>${I18n.t("finSt_" + k)}</option>`).join("")}</select>
                </div>
                <div class="col-6 col-md-3">
                    <label class="form-label small mb-1" for="fszKiallitva">${I18n.t("finIssueDate")}</label>
                    <input type="date" class="form-control form-control-sm" id="fszKiallitva" value="${esc(s.kiallitva || "")}">
                </div>
                <div class="col-6 col-md-3">
                    <label class="form-label small mb-1" for="fszEsedekes">${I18n.t("finDueDate")}</label>
                    <input type="date" class="form-control form-control-sm" id="fszEsedekes" value="${esc(s.esedekes || "")}">
                </div>
                <div class="col-6 col-md-3" id="fszFizetveWrap">
                    <label class="form-label small mb-1" for="fszFizetve">${I18n.t("finPaidDate")}</label>
                    <input type="date" class="form-control form-control-sm" id="fszFizetve" value="${esc(s.fizetve || "")}">
                </div>
                <div class="col-6 col-md-3">
                    <label class="form-label small mb-1" for="fszPenznem">${I18n.t("finCurrency")}</label>
                    <select class="form-select form-select-sm" id="fszPenznem">${L.penznemek.map(p => `<option ${s.penznem === p ? "selected" : ""}>${p}</option>`).join("")}</select>
                </div>
            </div>

            <div class="d-flex flex-wrap align-items-center gap-2 mt-3 mb-1">
                <h6 class="mb-0 flex-fill">${I18n.t("finItems")}</h6>
                <select class="form-select form-select-sm w-auto" id="fszCsomag" aria-label="${esc(I18n.t("finAddPackage"))}">
                    <option value="">+ ${I18n.t("finAddPackage")}</option>
                    ${o.csomagok.filter(c => c.aktiv).map(c => `<option value="${c.id}">${esc(AdminManager.finCsomagNev(c))} · ${esc(AdminManager.finPenz(c.ar, c.penznem))}</option>`).join("")}
                </select>
                <button type="button" class="btn btn-sm btn-outline-primary" id="fszUjTetel"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("finAddItem")}</button>
            </div>
            <div class="table-responsive">
                <table class="table table-sm align-top finItems mb-1">
                    <thead><tr>
                        <th>${I18n.t("finItemName")}</th><th class="finThQty">${I18n.t("finQty")}</th><th class="finThPrice">${I18n.t(afa ? "finUnitPriceNet" : "finUnitPrice")}</th>
                        ${afa ? `<th class="finThVat">${I18n.t("finVatRate")}</th>` : ""}<th class="text-end">${I18n.t("finTotal")}</th><th></th>
                    </tr></thead>
                    <tbody id="fszTetelek">${(s.tetelek || []).map(tetelSor).join("")}</tbody>
                </table>
            </div>
            <div class="finTotals" id="fszOssz"></div>
            ${!afa ? `<p class="small text-body-secondary mb-0">${I18n.t("finNoVatNote")}</p>` : ""}

            <details class="mt-3" ${s.idoszak_tol || s.reklam_id || s.kulso_szam || s.megjegyzes ? "open" : ""}>
                <summary class="small fw-semibold">${I18n.t("finMore")}</summary>
                <div class="row g-2 mt-1">
                    <div class="col-6 col-md-3">
                        <label class="form-label small mb-1" for="fszTol">${I18n.t("finPeriodFrom")}</label>
                        <input type="date" class="form-control form-control-sm" id="fszTol" value="${esc(s.idoszak_tol || "")}">
                    </div>
                    <div class="col-6 col-md-3">
                        <label class="form-label small mb-1" for="fszIg">${I18n.t("finPeriodTo")}</label>
                        <input type="date" class="form-control form-control-sm" id="fszIg" value="${esc(s.idoszak_ig || "")}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small mb-1" for="fszReklam">${I18n.t("finLinkedAd")}</label>
                        <select class="form-select form-select-sm" id="fszReklam">
                            <option value="">–</option>
                            ${o.reklamLista.map(r => `<option value="${r.id}" ${r.id === s.reklam_id ? "selected" : ""}>${esc(r.nev)}${r.hirdeto ? " · " + esc(r.hirdeto) : ""}</option>`).join("")}
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small mb-1" for="fszKulso">${I18n.t("finOfficialNumber")}</label>
                        <input class="form-control form-control-sm" id="fszKulso" value="${esc(s.kulso_szam || "")}" maxlength="60" placeholder="${esc(I18n.t("finOfficialNumberPh"))}">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small mb-1" for="fszMod">${I18n.t("finPayMethod")}</label>
                        <select class="form-select form-select-sm" id="fszMod">
                            <option value="">–</option>
                            ${L.fizetesiModok.map(m => `<option value="${m}" ${s.fizetesi_mod === m ? "selected" : ""}>${esc(I18n.t("finPay_" + m))}</option>`).join("")}
                        </select>
                    </div>
                    <div class="col-12">
                        <label class="form-label small mb-1" for="fszMegj">${I18n.t("finNoteOnDoc")}</label>
                        <textarea class="form-control form-control-sm" id="fszMegj" rows="2" maxlength="2000">${esc(s.megjegyzes || "")}</textarea>
                    </div>
                    ${s.elofizetes_nev ? `<div class="col-12 small text-body-secondary"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> ${I18n.f("finFromSub", { nev: esc(s.elofizetes_nev) })}</div>` : ""}
                </div>
            </details>
        </div>
        <div class="modal-footer flex-wrap">
            ${!uj && s.statusz === "piszkozat" ? `<button type="button" class="btn btn-outline-danger" id="fszTorol"><i class="fa-solid fa-trash" aria-hidden="true"></i> ${I18n.t("finDelete")}</button>` : ""}
            ${!uj && s.statusz !== "sztorno" && s.statusz !== "piszkozat" && !s.sztorno_eredeti_id ? `<button type="button" class="btn btn-outline-danger" id="fszSztorno"><i class="fa-solid fa-ban" aria-hidden="true"></i> ${I18n.t(zart ? "finIssueReversal" : "finCancelDoc")}</button>` : ""}
            ${zart ? `<button type="button" class="btn btn-outline-primary" id="fszXml"><i class="fa-solid fa-file-code" aria-hidden="true"></i> XML</button>
                     <button type="button" class="btn btn-outline-primary" id="fszAnaf" title="${esc(I18n.t("finAnafCheckHint"))}"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ${I18n.t("finAnafCheck")}</button>
                     <a class="btn btn-outline-secondary" href="/api/admin/penzugy/szamlak/${s.id}/efactura.pdf" target="_blank" rel="noopener" title="${esc(I18n.t("finAnafPdfHint"))}"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> ANAF PDF</a>` : ""}
            ${!uj ? `<button type="button" class="btn btn-outline-secondary" id="fszMasol"><i class="fa-solid fa-copy" aria-hidden="true"></i> ${I18n.t("finCopy")}</button>
                     <a class="btn btn-outline-secondary" href="/api/admin/penzugy/szamlak/${s.id}/nyomtat${Dokumentum.q(true)}" target="_blank" rel="noopener"><i class="fa-solid fa-print" aria-hidden="true"></i> ${I18n.t("finPrint")}</a>` : ""}
            <span class="me-auto"></span>
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
            <button type="button" class="btn btn-primary" id="fszMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t(uj ? "finCreate" : "finSave")}</button>
        </div>`;

    const $ = q => tartalom.querySelector(q);
    const tbody = $("#fszTetelek");

    // Összegek (a szerver ugyanígy számol, és az övé a végső)
    const kerek = v => Math.round(v * 100) / 100;
    const szamol = () => {
        let netto = 0;
        const csop = {};   // ÁFA kulcsonként a nettó – a végösszeg ÁFA-ja ebből (mint a szerveren és az e-Facturában)
        tbody.querySelectorAll("[data-tetel]").forEach(tr => {
            const m = Number(tr.querySelector('[data-t="mennyiseg"]').value) || 0;
            const a = Number(tr.querySelector('[data-t="egysegar"]').value) || 0;
            const k = afa ? (Number((tr.querySelector('[data-t="afa_kulcs"]') || {}).value) || 0) : 0;
            const n = kerek(m * a), x = kerek(n * k / 100);
            netto = kerek(netto + n);
            csop[k] = kerek((csop[k] || 0) + n);
            tr.querySelector("[data-t-ossz]").textContent = AdminManager.finPenz(kerek(n + x), $("#fszPenznem").value);
        });
        const afaOssz = kerek(Object.entries(csop).reduce((x, [k, alap]) => x + kerek(alap * Number(k) / 100), 0));
        const p = $("#fszPenznem").value;
        $("#fszOssz").innerHTML = `
            ${afa ? `<div><span>${I18n.t("finNet")}</span><b>${esc(AdminManager.finPenz(kerek(netto), p))}</b></div>
            <div><span>${I18n.t("finVat")}</span><b>${esc(AdminManager.finPenz(kerek(afaOssz), p))}</b></div>` : ""}
            <div class="fo"><span>${I18n.t("finGrandTotal")}</span><b>${esc(AdminManager.finPenz(kerek(netto + afaOssz), p))}</b></div>`;
    };

    const kotes = () => {
        tbody.querySelectorAll("input, select").forEach(i => { i.oninput = szamol; i.onchange = szamol; });
        tbody.querySelectorAll("[data-t-torol]").forEach(btn => {
            btn.onclick = () => {
                if (tbody.querySelectorAll("[data-tetel]").length <= 1) { btn.closest("tr").querySelectorAll("input").forEach(i => { if (i.type !== "hidden") i.value = i.dataset.t === "mennyiseg" ? 1 : ""; }); }
                else btn.closest("tr").remove();
                szamol();
            };
        });
    };

    const ujSor = t => {
        const i = tbody.querySelectorAll("[data-tetel]").length;
        tbody.insertAdjacentHTML("beforeend", tetelSor(t, i));
        kotes();
        szamol();
    };

    $("#fszUjTetel").onclick = () => { ujSor({ mennyiseg: 1, kategoria: "egyeb" }); tbody.querySelector("tr:last-child [data-t='megnevezes']").focus(); };

    $("#fszCsomag").onchange = e => {
        const c = o.csomagok.find(x => x.id === Number(e.target.value));
        e.target.value = "";
        if (!c) return;
        // Ha az egyetlen sor üres, azt töltjük ki
        const sorok = tbody.querySelectorAll("[data-tetel]");
        const elso = sorok.length === 1 && !sorok[0].querySelector('[data-t="megnevezes"]').value.trim() ? sorok[0] : null;
        if (elso) elso.remove();
        if (c.penznem !== $("#fszPenznem").value && !tbody.querySelector("[data-tetel]")) $("#fszPenznem").value = c.penznem;
        ujSor({ megnevezes: AdminManager.finCsomagNev(c), mennyiseg: 1, egysegar: c.ar, kategoria: c.kategoria, csomag_id: c.id });
    };

    $("#fszPenznem").onchange = szamol;

    const fizetveMutat = () => { $("#fszFizetveWrap").hidden = $("#fszStatusz").value !== "fizetve"; };
    $("#fszStatusz").onchange = () => { if ($("#fszStatusz").value === "fizetve" && !$("#fszFizetve").value) $("#fszFizetve").value = ma; fizetveMutat(); };
    fizetveMutat();

    // Kiállítás dátuma -> határidő (ha még az alap határidő volt)
    $("#fszKiallitva").onchange = () => {
        if ($("#fszKiallitva").value) $("#fszEsedekes").value = plusNap($("#fszKiallitva").value, b.fizetesi_hatarido || 14);
    };

    // Új ügyfél: az eddig beírtak megmaradnak, utána az új ügyfél lesz kiválasztva
    $("#fszUjUgyfel").onclick = () => {
        const most = adat();
        modal.hide();
        AdminManager.finUgyfelSzerk(null, ujId => {
            AdminManager.finUgyfelLista(true).then(l => {
                const reszlet = { ...most, ugyfel_id: ujId ? Number(ujId) : null };
                if (uj) AdminManager.finSzamlaUrlap(null, { ...o, ugyfelek: l, minta: { ...s, ...reszlet }, reklam: null });
                else AdminManager.finSzamlaUrlap({ ...s, ...reszlet }, { ...o, ugyfelek: l });
            });
        });
    };

    const adat = () => ({
        ugyfel_id: $("#fszUgyfel").value || null,
        tipus: $("#fszTipus").value,
        statusz: $("#fszStatusz").value,
        kiallitva: $("#fszKiallitva").value,
        esedekes: $("#fszEsedekes").value,
        fizetve: $("#fszFizetve").value,
        penznem: $("#fszPenznem").value,
        idoszak_tol: $("#fszTol").value,
        idoszak_ig: $("#fszIg").value,
        reklam_id: $("#fszReklam").value || null,
        kulso_szam: $("#fszKulso").value,
        fizetesi_mod: $("#fszMod").value,
        megjegyzes: $("#fszMegj").value,
        ...(uj && s.elofizetes_id ? { elofizetes_id: s.elofizetes_id } : {}),
        tetelek: [...tbody.querySelectorAll("[data-tetel]")].map(tr => {
            const v = k => { const i = tr.querySelector(`[data-t="${k}"]`); return i ? i.value : undefined; };
            return { megnevezes: v("megnevezes"), megnevezes_ro: v("megnevezes_ro"), megnevezes_en: v("megnevezes_en"), kategoria: v("kategoria"), csomag_id: v("csomag_id") || null, mennyiseg: v("mennyiseg"), egysegar: v("egysegar"), afa_kulcs: v("afa_kulcs") };
        }).filter(t => t.megnevezes && t.megnevezes.trim())
    });

    const kuld = (d, ujBiz) => AdminManager.finApi("szamlak" + (ujBiz ? "" : "/" + s.id), { method: ujBiz ? "POST" : "PUT", body: d })
        .then(v => { modal.hide(); AdminManager.refreshPendingCount(); if (o.kesz) o.kesz(v.id); return v; });

    $("#fszMent").onclick = () => {
        const d = adat();
        if (!d.ugyfel_id) { $("#fszUgyfel").classList.add("is-invalid"); $("#fszUgyfel").focus(); return; }
        if (!d.tetelek.length) { const f = tbody.querySelector('[data-t="megnevezes"]'); if (f) { f.classList.add("is-invalid"); f.focus(); } return; }
        if (lezart && !zart && !confirm(I18n.t("finEditLockedConfirm"))) return;
        $("#fszMent").disabled = true;
        kuld(d, uj).catch(e => { $("#fszMent").disabled = false; AdminManager.finHiba(e); });
    };

    const torol = $("#fszTorol");
    if (torol) torol.onclick = () => {
        if (!confirm(I18n.t("finDeleteDraftConfirm"))) return;
        AdminManager.finApi("szamlak/" + s.id, { method: "DELETE" })
            .then(() => { modal.hide(); if (o.kesz) o.kesz(); })
            .catch(AdminManager.finHiba);
    };

    const sztorno = $("#fszSztorno");
    if (sztorno) sztorno.onclick = () => {
        if (!confirm(I18n.t(zart ? "finReversalConfirm" : "finCancelConfirm"))) return;
        AdminManager.finApi(`szamlak/${s.id}/allapot`, { method: "POST", body: { statusz: "sztorno" } })
            .then(() => { modal.hide(); AdminManager.refreshPendingCount(); if (o.kesz) o.kesz(); })
            .catch(AdminManager.finHiba);
    };

    // Másolat: új díjbekérő ugyanezekkel a tételekkel, mai dátummal
    const masol = $("#fszMasol");
    if (masol) masol.onclick = () => {
        modal.hide();
        const m = {
            tipus: "dijbekero", statusz: "kiallitva", kiallitva: ma, esedekes: plusNap(ma, b.fizetesi_hatarido || 14), penznem: s.penznem,
            ugyfel_id: s.ugyfel_id, tetelek: (s.tetelek || []).map(t => ({ megnevezes: t.megnevezes, mennyiseg: t.mennyiseg, egysegar: t.egysegar, kategoria: t.kategoria, csomag_id: t.csomag_id, afa_kulcs: t.afa_kulcs }))
        };
        setTimeout(() => AdminManager.finSzamlaUrlap(null, { ...o, minta: m, reklam: null }), 250);
    };

    kotes();
    szamol();

    // Kiállított számla: csak a fizetés adatai szerkeszthetők
    if (zart) {
        const szabad = ["fszStatusz", "fszFizetve", "fszMod", "fszKulso", "fszReklam"];
        tartalom.querySelectorAll(".modal-body input, .modal-body select, .modal-body textarea, .modal-body button").forEach(el => {
            if (!szabad.includes(el.id)) el.disabled = true;
        });
        const det = tartalom.querySelector(".modal-body details");
        if (det) det.open = true;
        const xb = $("#fszXml");
        if (xb) xb.onclick = () => AdminManager.finXml(s.id, s.sorszam);
        const ab = $("#fszAnaf");
        if (ab) ab.onclick = () => AdminManager.finAnaf(s.id, ab);
    }

    el.addEventListener("shown.bs.modal", () => {
        const f = !$("#fszUgyfel").value ? $("#fszUgyfel") : tbody.querySelector('[data-t="megnevezes"]');
        if (f && !lezart) f.focus();
    }, { once: true });

    modal.show();

};

// ===================== ELŐFIZETÉSEK =====================

AdminManager.renderFinSubscriptions = function () {

    AdminManager.loading();

    Promise.all([AdminManager.finApi("elofizetesek"), AdminManager.finCfg(), AdminManager.finUgyfelLista(true), AdminManager.finCsomagLista(true)]).then(([lista]) => {

        AdminManager.fin.elofizetesek = lista;
        const box = AdminManager.box();
        const esc = Utils.escape;
        const b = AdminManager.fin.cfg.beallitas;
        const ma = AdminManager.finMa();
        const hatar = (() => { const x = new Date(ma + "T12:00:00"); x.setDate(x.getDate() + (b.elore_nap || 0)); return x.toISOString().slice(0, 10); })();
        const esedekes = lista.filter(e => e.statusz === "aktiv" && e.kovetkezo && e.kovetkezo <= hatar && (!e.vege || e.kovetkezo <= e.vege));
        const aktiv = lista.filter(e => e.statusz === "aktiv");
        const tobbi = lista.filter(e => e.statusz !== "aktiv");

        const sor = e => `
            <article class="finRow ${e.statusz !== "aktiv" ? "off" : ""}">
                <span class="kpiIcon ${e.statusz === "aktiv" ? "blue" : ""}"><i class="${AdminManager.FIN_KAT_IKON[e.kategoria] || "fa-solid fa-arrows-rotate"}" aria-hidden="true"></i></span>
                <div class="finMain">
                    <div class="d-flex flex-wrap align-items-center gap-2">
                        <b>${esc(e.ugyfel_nev || "–")}</b>
                        <span class="badge text-bg-${{ aktiv: "success", szunetel: "warning", lemondva: "secondary" }[e.statusz] || "secondary"}">${I18n.t("finSubSt_" + e.statusz)}</span>
                        ${e.nyitott ? `<span class="badge text-bg-warning">${I18n.f("finOpenN", { n: e.nyitott })}</span>` : ""}
                    </div>
                    <div class="small">${esc(e.megnevezes)}${e.mennyiseg > 1 ? ` × ${e.mennyiseg}` : ""}</div>
                    <div class="small text-body-secondary">
                        ${I18n.f("finSince", { datum: esc(AdminManager.finNap(e.kezdet)) })}
                        ${e.statusz === "aktiv" && e.kovetkezo ? ` · <span class="${e.kovetkezo <= hatar ? "text-warning-emphasis fw-semibold" : ""}">${I18n.f("finNextProforma", { datum: esc(AdminManager.finNap(e.kovetkezo)) })}</span>` : ""}
                        ${e.szamlazva_ig ? ` · ${I18n.f("finBilledUntil", { datum: esc(AdminManager.finNap(e.szamlazva_ig)) })}` : ""}
                        ${e.vege ? ` · ${I18n.f("finEnds", { datum: esc(AdminManager.finNap(e.vege)) })}` : ""}
                    </div>
                </div>
                <b class="finAmount">${esc(AdminManager.finPenz(e.ar * (e.mennyiseg || 1), e.penznem))}<small class="d-block text-body-secondary fw-normal">/ ${esc(AdminManager.finIdoszakLabel(e.idoszak))}</small></b>
                <div class="finActions">
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-fe-szamlak="${e.ugyfel_id}"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i><span class="visually-hidden">${I18n.t("adminTabFinInvoices")}</span></button>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-fe-szerk="${e.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${I18n.t("adsEdit")}</button>
                </div>
            </article>`;

        box.innerHTML = `
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <p class="sectionNote mb-0 flex-fill">${I18n.f("finSubsNote", { n: b.elore_nap })}</p>
                <button type="button" class="btn btn-primary btn-sm" id="feUj"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("finNewSub")}</button>
            </div>
            ${esedekes.length ? `
                <div class="alert alert-warning d-flex flex-wrap align-items-center gap-2">
                    <i class="fa-solid fa-bell" aria-hidden="true"></i>
                    <span class="flex-fill">${I18n.f("finTodoDue", { n: esedekes.length })}</span>
                    <button type="button" class="btn btn-sm btn-warning" id="feEsedekes"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> ${I18n.t("finMakeDue")}</button>
                </div>` : ""}
            ${!b.auto_dijbekero ? `<p class="small text-body-secondary">${I18n.t("finAutoOffNote")}</p>` : ""}
            ${aktiv.length ? `<div class="finList mb-4">${aktiv.map(sor).join("")}</div>` : `
                <div class="emptyState py-4">
                    <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
                    <h5>${I18n.t("finNoSubs")}</h5>
                    <p>${I18n.t("finNoSubsHint")}</p>
                </div>`}
            ${tobbi.length ? `<h6 class="finMonthHead">${I18n.t("finInactiveSubs")}</h6><div class="finList">${tobbi.map(sor).join("")}</div>` : ""}`;

        const ujra = () => AdminManager.renderFinSubscriptions();
        document.getElementById("feUj").onclick = () => AdminManager.finElofizetesSzerk(null, ujra);
        const es = document.getElementById("feEsedekes");
        if (es) es.onclick = () => AdminManager.finEsedekesKeszit(es, ujra);
        box.querySelectorAll("[data-fe-szerk]").forEach(btn => {
            btn.onclick = () => AdminManager.finElofizetesSzerk(lista.find(e => e.id === Number(btn.dataset.feSzerk)), ujra);
        });
        box.querySelectorAll("[data-fe-szamlak]").forEach(btn => {
            btn.onclick = () => { AdminManager.fin.szSzuro = { allapot: "", ho: "", ugyfel: Number(btn.dataset.feSzamlak), q: "" }; AdminManager.open("szamlak"); };
        });

    }).catch(() => AdminManager.finHibaDoboz());

};

AdminManager.finElofizetesSzerk = function (e, kesz) {

    const uj = !e || !e.id;
    const ma = AdminManager.finMa();
    e = e || { statusz: "aktiv", idoszak: "havi", penznem: "RON", mennyiseg: 1, kezdet: ma, kovetkezo: ma };
    const esc = Utils.escape;
    const L = AdminManager.fin.cfg.listak;
    const ugyfelek = AdminManager.fin.ugyfelek || [];
    const csomagok = (AdminManager.fin.csomagok || []).filter(c => c.aktiv || c.id === e.csomag_id);
    const { tartalom, modal } = AdminManager.finModal("finElofizetesModal", "modal-lg");

    tartalom.innerHTML = `
        <div class="modal-header">
            <h5 class="modal-title"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> ${I18n.t(uj ? "finNewSub" : "finEditSub")}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("adsCancel"))}"></button>
        </div>
        <div class="modal-body">
            <div class="row g-2">
                <div class="col-md-6">
                    <label class="form-label small mb-1" for="feUgyfel">${I18n.t("finCustomer")} *</label>
                    <div class="input-group input-group-sm">
                        <select class="form-select" id="feUgyfel">
                            <option value="">${I18n.t("finPickCustomer")}</option>
                            ${ugyfelek.map(u => `<option value="${u.id}" ${u.id === e.ugyfel_id ? "selected" : ""}>${esc(u.nev)}</option>`).join("")}
                        </select>
                        <button type="button" class="btn btn-outline-primary" id="feUjUgyfel"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> ${I18n.t("finNew")}</button>
                    </div>
                </div>
                <div class="col-md-6">
                    <label class="form-label small mb-1" for="feCsomag">${I18n.t("finPackage")}</label>
                    <select class="form-select form-select-sm" id="feCsomag">
                        <option value="">${I18n.t("finCustomPackage")}</option>
                        ${csomagok.filter(c => c.idoszak !== "egyszeri").map(c => `<option value="${c.id}" ${c.id === e.csomag_id ? "selected" : ""}>${esc(AdminManager.finCsomagNev(c))} · ${esc(AdminManager.finPenz(c.ar, c.penznem))} / ${esc(AdminManager.finIdoszakLabel(c.idoszak))}</option>`).join("")}
                    </select>
                </div>
                <div class="col-12">
                    <label class="form-label small mb-1" for="feNev">${I18n.t("finSubName")} *</label>
                    <input class="form-control form-control-sm" id="feNev" value="${esc(e.megnevezes || "")}" maxlength="200">
                </div>
                <div class="col-6 col-md-3">
                    <label class="form-label small mb-1" for="feAr">${I18n.t("finPrice")}</label>
                    <input type="number" min="0" step="0.01" class="form-control form-control-sm" id="feAr" value="${e.ar ?? ""}">
                </div>
                <div class="col-6 col-md-3">
                    <label class="form-label small mb-1" for="fePenznem">${I18n.t("finCurrency")}</label>
                    <select class="form-select form-select-sm" id="fePenznem">${L.penznemek.map(p => `<option ${e.penznem === p ? "selected" : ""}>${p}</option>`).join("")}</select>
                </div>
                <div class="col-6 col-md-3">
                    <label class="form-label small mb-1" for="feIdoszak">${I18n.t("finPeriod")}</label>
                    <select class="form-select form-select-sm" id="feIdoszak">${L.idoszakok.filter(p => p !== "egyszeri").map(p => `<option value="${p}" ${e.idoszak === p ? "selected" : ""}>${esc(AdminManager.finIdoszakLabel(p))}</option>`).join("")}</select>
                </div>
                <div class="col-6 col-md-3">
                    <label class="form-label small mb-1" for="feMenny">${I18n.t("finQty")}</label>
                    <input type="number" min="1" step="1" class="form-control form-control-sm" id="feMenny" value="${e.mennyiseg || 1}">
                </div>
                <div class="col-6 col-md-3">
                    <label class="form-label small mb-1" for="feKezdet">${I18n.t("finStart")}</label>
                    <input type="date" class="form-control form-control-sm" id="feKezdet" value="${esc(e.kezdet || "")}">
                </div>
                <div class="col-6 col-md-3">
                    <label class="form-label small mb-1" for="feKov">${I18n.t("finNextProformaLabel")}</label>
                    <input type="date" class="form-control form-control-sm" id="feKov" value="${esc(e.kovetkezo || "")}">
                </div>
                <div class="col-6 col-md-3">
                    <label class="form-label small mb-1" for="feVege">${I18n.t("finEnd")}</label>
                    <input type="date" class="form-control form-control-sm" id="feVege" value="${esc(e.vege || "")}">
                </div>
                <div class="col-6 col-md-3">
                    <label class="form-label small mb-1" for="feStatusz">${I18n.t("finStatus")}</label>
                    <select class="form-select form-select-sm" id="feStatusz">${L.elofizetesStatuszok.map(k => `<option value="${k}" ${e.statusz === k ? "selected" : ""}>${I18n.t("finSubSt_" + k)}</option>`).join("")}</select>
                </div>
                <div class="col-12">
                    <label class="form-label small mb-1" for="feJegyzet">${I18n.t("finNote")}</label>
                    <textarea class="form-control form-control-sm" id="feJegyzet" rows="2" maxlength="2000">${esc(e.jegyzet || "")}</textarea>
                </div>
                <div class="col-12 small text-body-secondary">${I18n.t("finSubRightsNote")}</div>
            </div>
        </div>
        <div class="modal-footer">
            ${!uj ? `<button type="button" class="btn btn-outline-danger me-auto" id="feTorol"><i class="fa-solid fa-ban" aria-hidden="true"></i> ${I18n.t("finEndSub")}</button>` : ""}
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adsCancel")}</button>
            <button type="button" class="btn btn-primary" id="feMent"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("finSave")}</button>
        </div>`;

    const $ = q => tartalom.querySelector(q);

    $("#feCsomag").onchange = () => {
        const c = csomagok.find(x => x.id === Number($("#feCsomag").value));
        if (!c) return;
        $("#feNev").value = AdminManager.finCsomagNev(c);
        $("#feAr").value = c.ar;
        $("#fePenznem").value = c.penznem;
        if (c.idoszak !== "egyszeri") $("#feIdoszak").value = c.idoszak;
    };

    // Új előfizetésnél a kezdet = az első díjbekérő napja
    $("#feKezdet").onchange = () => { if (uj || !$("#feKov").value) $("#feKov").value = $("#feKezdet").value; };

    function feAdat() {
        return {
            ugyfel_id: $("#feUgyfel").value, csomag_id: $("#feCsomag").value || null, megnevezes: $("#feNev").value, ar: $("#feAr").value,
            penznem: $("#fePenznem").value, idoszak: $("#feIdoszak").value, mennyiseg: $("#feMenny").value, kezdet: $("#feKezdet").value,
            kovetkezo: $("#feKov").value, vege: $("#feVege").value, statusz: $("#feStatusz").value, jegyzet: $("#feJegyzet").value
        };
    }

    $("#feUjUgyfel").onclick = () => {
        modal.hide();
        AdminManager.finUgyfelSzerk(null, ujId => {
            AdminManager.finUgyfelLista(true).then(() => AdminManager.finElofizetesSzerk({ ...e, ...feAdat(), csomag_id: Number($("#feCsomag").value) || null, mennyiseg: Number($("#feMenny").value) || 1, ugyfel_id: Number(ujId) || null }, kesz));
        });
    };

    $("#feMent").onclick = () => {
        const d = feAdat();
        if (!d.ugyfel_id) { $("#feUgyfel").classList.add("is-invalid"); $("#feUgyfel").focus(); return; }
        if (!d.megnevezes.trim()) { $("#feNev").classList.add("is-invalid"); $("#feNev").focus(); return; }
        $("#feMent").disabled = true;
        AdminManager.finApi("elofizetesek" + (uj ? "" : "/" + e.id), { method: uj ? "POST" : "PUT", body: d })
            .then(() => { modal.hide(); AdminManager.refreshPendingCount(); if (kesz) kesz(); })
            .catch(er => { $("#feMent").disabled = false; AdminManager.finHiba(er); });
    };

    const torol = $("#feTorol");
    if (torol) torol.onclick = () => {
        if (!confirm(I18n.t("finEndSubConfirm"))) return;
        AdminManager.finApi("elofizetesek/" + e.id, { method: "DELETE" })
            .then(() => { modal.hide(); if (kesz) kesz(); })
            .catch(AdminManager.finHiba);
    };

    modal.show();

};
