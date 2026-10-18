// ============================================================
//  Admin → Irattár (#admin/irattarSzamla, #admin/irattarSzerzodes)
//
//  A cég iratai rendezetten, két részben:
//    Számlák és pénzügyi iratok  kimenő számlák és díjbekérők (az app
//        készíti), bejövő számlák (a kiadásokhoz csatolva), nyugták,
//        bankkivonatok, adóügyi iratok, egyéb
//    Szerződések  megbízási szerződések (az app készíti), ügyfél, partner,
//        szolgáltató, bérleti, munkatársi, cégiratok, egyéb – lejárattal
//
//  Bal oldalt a kategóriák (darabszámmal), jobbra a lista keresővel, év
//  szerinti szűrővel, CSV-exporttal (a könyvelőnek) és feltöltéssel
//  (gomb vagy fájl ráhúzása). Szerver: server/services/irattar.js
// ============================================================

(() => {

    AdminManager.TABS.irattarSzamla = {
        group: "irat", jog: "penzugy", icon: "fa-solid fa-file-invoice-dollar", title: "irTabInvoices", desc: "irDescInvoices",
        render: () => Archive.render("szamla")
    };
    AdminManager.TABS.irattarSzerzodes = {
        group: "irat", jog: "penzugy", icon: "fa-solid fa-file-signature", title: "irTabContracts", desc: "irDescContracts",
        render: () => Archive.render("szerzodes"), count: "contractsCount", warn: true
    };
    Object.assign(AdminManager.ALIASES, { irattar: "irattarSzamla", iratok: "irattarSzamla", szerzodesek: "irattarSzerzodes", archive: "irattarSzamla" });

    const eredeti = AdminManager.applyCounts;
    AdminManager.applyCounts = function (c) {
        eredeti.call(this, c);
        AdminManager.setCount("contractsCount", c.szerzodes_teendo);
    };

})();

class Archive {

    static allapot = { szamla: { kategoria: "", ev: "", q: "" }, szerzodes: { kategoria: "", ev: "", q: "" } };

    static render(resz) {

        Archive.resz = resz;
        AdminManager.loading();
        Archive.betolt();

    }

    static url(alap) {
        const a = Archive.allapot[Archive.resz];
        const p = new URLSearchParams({ resz: Archive.resz });
        if (a.kategoria) p.set("kategoria", a.kategoria);
        if (a.ev) p.set("ev", a.ev);
        if (a.q) p.set("q", a.q);
        return alap + "?" + p.toString();
    }

    static betolt() {

        const resz = Archive.resz;
        Svc.api(Archive.url("/api/admin/irattar")).then(d => {
            if (Archive.resz !== resz) return;
            Archive.adat = d;
            Archive.rajzol(d);
        }).catch(() => {
            AdminManager.box().innerHTML = `<div class="alert alert-danger">${I18n.t("alertLoadError")}</div>`;
        });

    }

    static katNev(resz, kod) {
        return I18n.t(`irCat_${resz}_${kod}`);
    }

    static ikon(x) {
        const m = x.fajl_mime || "";
        if (x.forras === "kiadas") return "fa-regular fa-file text-body-tertiary";
        if (x.forras === "app") return x.resz === "szerzodes" ? "fa-solid fa-file-signature text-success" : "fa-solid fa-file-invoice text-success";
        if (!x.van_fajl) return "fa-regular fa-file-lines text-body-tertiary";
        if (m === "application/pdf") return "fa-solid fa-file-pdf text-danger";
        if (m.startsWith("image/")) return "fa-solid fa-file-image text-primary";
        if (/word|opendocument\.text/.test(m)) return "fa-solid fa-file-word text-primary";
        if (/excel|spreadsheet|csv/.test(m)) return "fa-solid fa-file-excel text-success";
        if (/xml/.test(m)) return "fa-solid fa-file-code";
        return "fa-solid fa-file";
    }

    static allapotBadge(x) {
        const esc = Utils.escape;
        const m = {
            fizetve: "success", kiallitva: "warning", sztorno: "secondary", nincs_irat: "danger", kuldve: "warning",
            aktiv: "success", elfogadva: "info", lejart: "danger", megszunt: "secondary", archiv: "secondary"
        };
        let s = x.statusz;
        // feltöltött pénzügyi irat: nincs „állapota” – csak ha egy kiadáshoz tartozik
        if (x.resz === "szamla" && x.forras === "feltoltott") {
            const r = [];
            if (x.efactura_bejovo) r.push(`<span class="badge text-bg-info"><i class="fa-solid fa-landmark"></i> ${I18n.t("irEfIncoming")}</span>`);
            if (x.kiadas_id) r.push(`<span class="badge text-bg-light"><i class="fa-solid fa-link"></i> ${I18n.t("irLinkedBadge")}</span>`);
            return r.join(" ");
        }
        // kiállított számla: az állapota mellett az e-Factura (ANAF) állapota is
        if (x.forras === "app" && x.ef && AdminManager.efBadge) {
            return `<span class="badge text-bg-${m[s] || "light"}">${esc(I18n.t("irSt_" + s))}</span> ${AdminManager.efBadge(x.ef, x.szamla_id)}`;
        }
        if (x.resz === "szerzodes" && x.forras === "feltoltott" && s === "aktiv" && x.lejar) {
            const nap = Math.round((new Date(x.lejar + "T12:00:00") - new Date()) / 86400000);
            if (nap < 0) return `<span class="badge text-bg-danger">${I18n.t("irSt_lejart")}</span>`;
            if (nap <= 30) return `<span class="badge text-bg-warning">${I18n.f("irExpiresIn", { n: nap })}</span>`;
        }
        if (!s) return "";
        return `<span class="badge text-bg-${m[s] || "light"}">${esc(I18n.t("irSt_" + s))}</span>`;
    }

    static rajzol(d) {

        const box = AdminManager.box();
        const esc = Utils.escape;
        const resz = Archive.resz;
        const a = Archive.allapot[resz];
        const o = d.osszeg;
        const szerz = resz === "szerzodes";

        const kat = [{ kod: "", icon: "fa-solid fa-layer-group" }, ...d.kategoriak];
        // a kategória oszlop csak a „Mind” nézetben kell
        const katOszlop = a.kategoria ? "d-none" : "d-none d-xl-table-cell";

        const figyelmeztet = [];
        if (szerz && o.lejart) figyelmeztet.push(`<div class="alert alert-danger py-2 small mb-2"><i class="fa-solid fa-file-circle-exclamation"></i> ${I18n.f("irExpiredN", { n: o.lejart })}</div>`);
        if (szerz && o.lejaro) figyelmeztet.push(`<div class="alert alert-warning py-2 small mb-2"><i class="fa-solid fa-hourglass-half"></i> ${I18n.f("irExpiringN", { n: o.lejaro })}</div>`);
        if (!szerz && o.kiadas_irat_nelkul) figyelmeztet.push(`<div class="alert alert-warning py-2 small mb-2"><i class="fa-solid fa-paperclip"></i> ${I18n.f("irExpenseNoDoc", { n: o.kiadas_irat_nelkul })} <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-ir-kat="bejovo">${I18n.t("irShow")}</button></div>`);

        const sor = x => {
            const muvelet = [];
            if (x.forras === "feltoltott") {
                // az ANAF-ból letöltött számla (ZIP): olvasható PDF-ként az ANAF alakítja át
                if (x.van_fajl && x.fajl_mime === "application/zip") {
                    muvelet.push(`<a class="btn btn-sm btn-outline-primary" href="/api/admin/irattar/${x.id}/anaf-pdf" target="_blank" rel="noopener" title="${esc(I18n.t("irAnafPdfHint"))}"><i class="fa-solid fa-file-pdf"></i> PDF</a>`);
                }
                if (x.van_fajl) {
                    muvelet.push(`<a class="btn btn-sm btn-outline-secondary" href="/api/admin/irattar/${x.id}/fajl" target="_blank" rel="noopener" title="${esc(I18n.t("irOpen"))}" aria-label="${esc(I18n.t("irOpen"))}"><i class="fa-solid fa-eye"></i></a>`);
                    muvelet.push(`<a class="btn btn-sm btn-outline-secondary" href="/api/admin/irattar/${x.id}/fajl?letolt=1" title="${esc(I18n.t("irDownload"))}" aria-label="${esc(I18n.t("irDownload"))}"><i class="fa-solid fa-download"></i></a>`);
                }
                muvelet.push(`<button type="button" class="btn btn-sm btn-outline-secondary" data-ir-szerk="${x.id}" title="${esc(I18n.t("detailEdit"))}" aria-label="${esc(I18n.t("detailEdit"))}"><i class="fa-solid fa-pen"></i></button>`);
                muvelet.push(`<button type="button" class="btn btn-sm btn-outline-danger" data-ir-torol="${x.id}" title="${esc(I18n.t("detailDelete"))}" aria-label="${esc(I18n.t("detailDelete"))}"><i class="fa-solid fa-trash"></i></button>`);
            } else if (x.forras === "app" && x.szamla_id) {
                muvelet.push(`<a class="btn btn-sm btn-outline-secondary" href="/api/admin/penzugy/szamlak/${x.szamla_id}/nyomtat${Dokumentum.q(true)}" target="_blank" rel="noopener" title="${esc(I18n.t("irOpen"))}" aria-label="${esc(I18n.t("irOpen"))}"><i class="fa-solid fa-eye"></i></a>`);
                if (x.efactura) {
                    if (x.ef && x.ef.zip) muvelet.push(`<a class="btn btn-sm btn-outline-success" href="/api/admin/penzugy/szamlak/${x.szamla_id}/efactura/valasz.zip" title="${esc(I18n.t("irEfZipHint"))}"><i class="fa-solid fa-file-zipper"></i> ANAF</a>`);
                    muvelet.push(`<button type="button" class="btn btn-sm btn-outline-primary" data-ir-xml="${x.szamla_id}" data-ir-xml-nev="${esc(x.szam)}" title="${esc(I18n.t("irEfacturaHint"))}"><i class="fa-solid fa-file-code"></i> XML</button>`);
                    muvelet.push(`<button type="button" class="btn btn-sm btn-outline-primary" data-ir-anaf="${x.szamla_id}" title="${esc(I18n.t("finAnafCheckHint"))}" aria-label="${esc(I18n.t("finAnafCheck"))}"><i class="fa-solid fa-shield-halved"></i></button>`);
                }
            } else if (x.forras === "app" && x.reklam_id) {
                muvelet.push(`<a class="btn btn-sm btn-outline-secondary" href="/api/admin/reklamok/${x.reklam_id}/szerzodes${Dokumentum.q(true)}" target="_blank" rel="noopener" title="${esc(I18n.t("irOpen"))}" aria-label="${esc(I18n.t("irOpen"))}"><i class="fa-solid fa-eye"></i></a>`);
            } else if (x.forras === "app" && x.megbizas_id) {
                muvelet.push(`<a class="btn btn-sm btn-outline-secondary" href="/api/megbizas/${x.megbizas_id}/szerzodes${Dokumentum.q(true)}" target="_blank" rel="noopener" title="${esc(I18n.t("irOpen"))}" aria-label="${esc(I18n.t("irOpen"))}"><i class="fa-solid fa-eye"></i></a>`);
            } else if (x.forras === "kiadas") {
                muvelet.push(`<button type="button" class="btn btn-sm btn-warning" data-ir-csatol="${x.kiadas_id}"><i class="fa-solid fa-paperclip"></i> ${I18n.t("irAttach")}</button>`);
            }
            const forrasJel = x.forras === "app" ? `<span class="irSrc" title="${esc(I18n.t("irAutoHint"))}"><i class="fa-solid fa-wand-magic-sparkles"></i> ${I18n.t("irAuto")}</span>`
                : x.forras === "kiadas" ? `<span class="irSrc warn">${I18n.t("irFromExpense")}</span>` : "";
            return `
                <tr class="${x.forras === "kiadas" ? "irMissing" : ""}">
                    <td class="irIcon"><i class="${Archive.ikon(x)}" aria-hidden="true"></i></td>
                    <td class="irTitle">
                        <b>${esc(x.cim || "–")}</b> ${forrasJel}
                        <div class="small text-body-secondary">${[x.partner, x.szam && x.szam !== x.cim ? "№ " + x.szam : "", x.fajl_nev].filter(Boolean).map(esc).join(" · ")}</div>
                        ${x.megjegyzes ? `<div class="small text-body-secondary text-truncate irNote" title="${esc(x.megjegyzes)}">${esc(x.megjegyzes)}</div>` : ""}
                        ${x.megorzes_ig ? `<div class="small irKeep" title="${esc(I18n.t("irKeepHint"))}"><i class="fa-solid fa-box-archive" aria-hidden="true"></i> ${I18n.f("irKeepUntil", { datum: esc(Svc.nap(x.megorzes_ig)) })}</div>` : ""}
                        ${x.cimkek ? `<div>${x.cimkek.split(",").map(c => c.trim()).filter(Boolean).map(c => `<span class="badge text-bg-light">${esc(c)}</span>`).join(" ")}</div>` : ""}
                    </td>
                    <td class="${katOszlop}"><span class="badge text-bg-light irCatBadge">${esc(Archive.katNev(resz, x.kategoria))}</span></td>
                    <td class="text-nowrap small irDate">${esc(Svc.nap(x.datum))}${szerz && (x.kezdet || x.lejar) ? `<div class="text-body-secondary">${x.kezdet ? esc(Svc.nap(x.kezdet)) : "…"} → ${x.lejar ? esc(Svc.nap(x.lejar)) : I18n.t("irIndefinite")}</div>` : ""}</td>
                    <td class="text-end text-nowrap irAmt">${x.osszeg !== null && x.osszeg !== undefined ? esc(Svc.penz(x.osszeg, x.penznem)) : ""}</td>
                    <td class="irSt">${Archive.allapotBadge(x)}</td>
                    <td class="text-end irActs"><div class="d-inline-flex gap-1 justify-content-end">${muvelet.join("")}</div></td>
                </tr>`;
        };

        box.innerHTML = `
            <div class="irWrap">
                <aside class="irSide">
                    <nav class="irCats" aria-label="${esc(I18n.t("irCategories"))}">
                        ${kat.map(k => `
                            <button type="button" class="irCat ${a.kategoria === k.kod ? "active" : ""}" data-ir-kat="${k.kod}">
                                <i class="${k.icon}" aria-hidden="true"></i>
                                <span>${k.kod ? esc(Archive.katNev(resz, k.kod)) : I18n.t("irAll")}</span>
                                <b>${k.kod ? (o.kategoriak[k.kod] || 0) : o.osszes}</b>
                            </button>`).join("")}
                    </nav>
                    <div class="irInfo small text-body-secondary d-none d-lg-block">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> ${I18n.t(szerz ? "irInfoContracts" : "irInfoInvoices")}
                    </div>
                </aside>
                <section class="irMain" id="irMain">
                    <div class="irBar">
                        <div class="input-group irSearch">
                            <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                            <input type="search" class="form-control" id="irQ" placeholder="${esc(I18n.t(szerz ? "irSearchContracts" : "irSearchInvoices"))}" value="${esc(a.q)}">
                        </div>
                        <select class="form-select irYear" id="irEv" aria-label="${esc(I18n.t("irYear"))}">
                            <option value="">${I18n.t("irAllYears")}</option>
                            ${o.evek.map(e => `<option value="${e}" ${String(a.ev) === String(e) ? "selected" : ""}>${e}</option>`).join("")}
                        </select>
                        <select class="form-select irLang" id="irNyelv" aria-label="${esc(I18n.t("irDocLang"))}" title="${esc(I18n.t("irDocLangHint"))}" style="max-width:12rem">
                            <option value="" ${!Dokumentum.adminForditas() ? "selected" : ""}>${I18n.t("irDocLangDefault")}</option>
                            <option value="ro" ${Dokumentum.adminForditas() === "ro" ? "selected" : ""}>${I18n.t("finDocLang_ro")}</option>
                            <option value="hu" ${Dokumentum.adminForditas() === "hu" ? "selected" : ""}>${I18n.t("finDocLang_hu")}</option>
                            <option value="en" ${Dokumentum.adminForditas() === "en" ? "selected" : ""}>${I18n.t("finDocLang_en")}</option>
                        </select>
                        <a class="btn btn-outline-secondary" href="${esc(Archive.url("/api/admin/irattar/export.csv"))}" title="${esc(I18n.t("irCsvHint"))}"><i class="fa-solid fa-file-csv"></i> <span class="d-none d-xl-inline">CSV</span></a>
                        ${!szerz ? `<button type="button" class="btn btn-outline-primary" id="irCsomag" title="${esc(I18n.t("irPackHint"))}"><i class="fa-solid fa-file-zipper"></i> <span class="d-none d-lg-inline">${I18n.t("irPackBtn")}</span></button>` : ""}
                        <button type="button" class="btn btn-outline-success" id="irSzinkron" title="${esc(I18n.t("irSyncHint"))}"><i class="fa-solid fa-computer"></i> <span class="d-none d-lg-inline">${I18n.t("irSyncBtn")}</span></button>
                        <button type="button" class="btn btn-primary" id="irUj"><i class="fa-solid fa-upload"></i> ${I18n.t(szerz ? "irUploadContract" : "irUpload")}</button>
                    </div>
                    ${figyelmeztet.join("")}
                    <div class="irDropHint" id="irDrop"><i class="fa-solid fa-cloud-arrow-up"></i> ${I18n.t("irDropHere")}</div>
                    ${d.lista.length ? `
                        <div class="card"><div class="table-responsive">
                            <table class="table table-hover align-middle mb-0 irTable">
                                <thead><tr>
                                    <th></th><th>${I18n.t(szerz ? "irColContract" : "irColDocument")}</th>
                                    <th class="${katOszlop}">${I18n.t("irColCategory")}</th>
                                    <th>${I18n.t(szerz ? "irColDateTerm" : "irColDate")}</th>
                                    <th class="text-end">${I18n.t(szerz ? "irColValue" : "irColAmount")}</th>
                                    <th>${I18n.t("irColStatus")}</th><th></th>
                                </tr></thead>
                                <tbody>${d.lista.map(sor).join("")}</tbody>
                            </table>
                        </div></div>
                        <p class="small text-body-secondary mt-2">${I18n.f("irCountN", { n: d.lista.length })}</p>`
                    : `<div class="emptyState"><i class="fa-solid fa-box-archive"></i><h5>${I18n.t("irEmpty")}</h5><p>${I18n.t("irEmptyHint")}</p></div>`}
                </section>
            </div>`;

        box.querySelectorAll("[data-ir-kat]").forEach(b => {
            b.onclick = () => { a.kategoria = b.dataset.irKat; Archive.betolt(); };
        });
        const q = box.querySelector("#irQ");
        let ido;
        q.oninput = () => { clearTimeout(ido); ido = setTimeout(() => { a.q = q.value.trim(); Archive.betolt(); }, 350); };
        if (a.q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
        box.querySelector("#irEv").onchange = e => { a.ev = e.target.value; Archive.betolt(); };
        box.querySelector("#irUj").onclick = () => Archive.urlap(null, { kategoria: a.kategoria });
        const csomagGomb = box.querySelector("#irCsomag");
        if (csomagGomb) csomagGomb.onclick = () => Archive.csomag();
        box.querySelector("#irSzinkron").onclick = () => Archive.szinkron();
        if (AdminManager.efBadgeKot) AdminManager.efBadgeKot(box, () => Archive.betolt());

        box.querySelectorAll("[data-ir-szerk]").forEach(b => {
            b.onclick = () => Svc.api(`/api/admin/irattar/${b.dataset.irSzerk}`).then(x => Archive.urlap(x)).catch(e => alert(Svc.hiba(e)));
        });
        box.querySelectorAll("[data-ir-torol]").forEach(b => {
            b.onclick = () => {
                if (!confirm(I18n.t("irDeleteConfirm"))) return;
                Svc.api(`/api/admin/irattar/${b.dataset.irTorol}`, { method: "DELETE" }).then(() => Archive.betolt()).catch(e => alert(Svc.hiba(e)));
            };
        });
        box.querySelectorAll("[data-ir-csatol]").forEach(b => {
            const x = d.lista.find(y => y.forras === "kiadas" && String(y.kiadas_id) === b.dataset.irCsatol);
            b.onclick = () => Archive.urlap(null, {
                kategoria: "bejovo", cim: x.cim, partner: x.partner, szam: x.szam, datum: x.datum, osszeg: x.osszeg, penznem: x.penznem, kiadas_id: x.kiadas_id
            });
        });
        box.querySelectorAll("[data-ir-xml]").forEach(b => {
            b.onclick = () => Archive.xml(b.dataset.irXml, b.dataset.irXmlNev);
        });
        box.querySelectorAll("[data-ir-anaf]").forEach(b => {
            b.onclick = () => AdminManager.finAnaf(b.dataset.irAnaf, b);
        });
        const nyelv = box.querySelector("#irNyelv");
        if (nyelv) nyelv.onchange = () => { Dokumentum.adminForditasMent(nyelv.value); Archive.betolt(); };

        // Fájl ráhúzása a listára → feltöltés
        const main = box.querySelector("#irMain");
        const drop = box.querySelector("#irDrop");
        main.ondragover = e => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); drop.classList.add("on"); } };
        main.ondragleave = e => { if (!main.contains(e.relatedTarget)) drop.classList.remove("on"); };
        main.ondrop = e => {
            e.preventDefault();
            drop.classList.remove("on");
            const f = e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) Archive.urlap(null, { kategoria: a.kategoria }, f);
        };

    }

    // e-Factura XML letöltése (ha hiányzik adat, megmondja mi) – AdminManager.finXml
    static xml(id, nev) {
        return AdminManager.finXml(id, nev);
    }

    // Csomag a könyvelőnek: egy hónap / év minden pénzügyi irata egy ZIP-ben,
    // a bevétel–kiadás naplóval (Registrul-jurnal de încasări și plăți)
    static csomag() {
        const esc = Utils.escape;
        const { tartalom, modal } = Svc.modal("irPackModal", "");
        const most = new Date();
        // alapból az előző hónap (a könyvelő általában a lezárt hónapot kéri)
        const elozo = new Date(most.getFullYear(), most.getMonth() - 1, 1);
        const evek = [];
        for (let e = most.getFullYear(); e >= most.getFullYear() - 6; e--) evek.push(e);
        const honapNev = h => new Date(2026, h - 1, 15).toLocaleDateString(Utils.locale(), { month: "long" });
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title"><i class="fa-solid fa-file-zipper" aria-hidden="true"></i> ${I18n.t("irPackTitle")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="OK"></button>
            </div>
            <div class="modal-body">
                <p class="small text-body-secondary">${I18n.t("irPackIntro")}</p>
                <div class="row g-2">
                    <div class="col-6"><label class="form-label small mb-1" for="irPackEv">${I18n.t("irYear")}</label>
                        <select class="form-select" id="irPackEv">${evek.map(e => `<option ${e === elozo.getFullYear() ? "selected" : ""}>${e}</option>`).join("")}</select></div>
                    <div class="col-6"><label class="form-label small mb-1" for="irPackHo">${I18n.t("irMonth")}</label>
                        <select class="form-select" id="irPackHo"><option value="">${I18n.t("irWholeYear")}</option>
                        ${Array.from({ length: 12 }, (_, i) => i + 1).map(h => `<option value="${h}" ${h === elozo.getMonth() + 1 ? "selected" : ""}>${esc(honapNev(h))}</option>`).join("")}</select></div>
                </div>
                <ul class="small mt-3 mb-0">
                    <li>${I18n.t("irPackItem1")}</li>
                    <li>${I18n.t("irPackItem2")}</li>
                    <li>${I18n.t("irPackItem3")}</li>
                    <li>${I18n.t("irPackItem4")}</li>
                </ul>
            </div>
            <div class="modal-footer">
                <a class="btn btn-outline-secondary" id="irRegistru" href="#"><i class="fa-solid fa-book" aria-hidden="true"></i> ${I18n.t("irRegisterBtn")}</a>
                <a class="btn btn-primary" id="irPackLetolt" href="#"><i class="fa-solid fa-download" aria-hidden="true"></i> ${I18n.t("irPackDownload")}</a>
            </div>`;
        const $ = q => tartalom.querySelector(q);
        const frissit = () => {
            const p = new URLSearchParams({ ev: $("#irPackEv").value });
            if ($("#irPackHo").value) p.set("honap", $("#irPackHo").value);
            $("#irPackLetolt").href = "/api/admin/irattar/csomag.zip?" + p;
            $("#irRegistru").href = "/api/admin/irattar/registru.csv?" + p;
        };
        $("#irPackEv").onchange = frissit;
        $("#irPackHo").onchange = frissit;
        frissit();
        modal.show();
    }

    // Szinkron a gépre: kulcs a helyi programnak (eszkozok/szinkron-telepites.bat)
    static szinkron() {
        const esc = Utils.escape;
        const { tartalom, modal } = Svc.modal("irSyncModal", "modal-lg");
        const datum = d => d ? new Date(d).toLocaleString(Utils.locale()) : "–";
        const rajzol = (all, ujKulcs = null, cim = "") => {
            tartalom.innerHTML = `
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fa-solid fa-computer" aria-hidden="true"></i> ${I18n.t("irSyncTitle")}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="OK"></button>
                </div>
                <div class="modal-body">
                    <p class="small">${I18n.t("irSyncIntro")}</p>
                    <div class="alert ${all.van_kulcs ? "alert-success" : "alert-secondary"} py-2 small">
                        ${all.van_kulcs
                            ? `<i class="fa-solid fa-circle-check"></i> ${I18n.f("irSyncActive", { d: esc(datum(all.letrehozva)) })}<br>${I18n.f("irSyncLast", { d: esc(datum(all.utolso)), n: all.utolso_db || 0 })}`
                            : `<i class="fa-solid fa-circle-info"></i> ${I18n.t("irSyncNone")}`}
                    </div>
                    ${ujKulcs ? `
                        <div class="alert alert-warning small">
                            <strong>${I18n.t("irSyncKeyOnce")}</strong>
                            <div class="input-group input-group-sm mt-2"><span class="input-group-text">${I18n.t("irSyncSite")}</span><input class="form-control font-monospace" readonly value="${esc(cim)}"></div>
                            <div class="input-group input-group-sm mt-2"><span class="input-group-text">${I18n.t("irSyncKey")}</span><input class="form-control font-monospace" id="irSyncKulcs" readonly value="${esc(ujKulcs)}">
                            <button type="button" class="btn btn-outline-secondary" id="irSyncMasol"><i class="fa-solid fa-copy"></i></button></div>
                        </div>` : ""}
                    <h6 class="mt-3">${I18n.t("irSyncSteps")}</h6>
                    <ol class="small mb-0">
                        <li>${I18n.t("irSyncStep1")}</li>
                        <li>${I18n.t("irSyncStep2")}</li>
                        <li>${I18n.t("irSyncStep3")}</li>
                        <li>${I18n.t("irSyncStep4")}</li>
                    </ol>
                </div>
                <div class="modal-footer">
                    ${all.van_kulcs ? `<button type="button" class="btn btn-outline-danger me-auto" id="irSyncTorol"><i class="fa-solid fa-ban"></i> ${I18n.t("irSyncRevoke")}</button>` : ""}
                    <button type="button" class="btn btn-primary" id="irSyncUj"><i class="fa-solid fa-key"></i> ${I18n.t(all.van_kulcs ? "irSyncNewKeyAgain" : "irSyncNewKey")}</button>
                </div>`;
            const $ = q => tartalom.querySelector(q);
            $("#irSyncUj").onclick = () => {
                if (all.van_kulcs && !confirm(I18n.t("irSyncNewConfirm"))) return;
                Svc.api("/api/admin/irattar/szinkron/kulcs", { method: "POST" })
                    .then(r => Svc.api("/api/admin/irattar/szinkron").then(a2 => rajzol(a2, r.kulcs, r.cim)))
                    .catch(e => alert(Svc.hiba(e)));
            };
            if ($("#irSyncTorol")) $("#irSyncTorol").onclick = () => {
                if (!confirm(I18n.t("irSyncRevokeConfirm"))) return;
                Svc.api("/api/admin/irattar/szinkron/kulcs", { method: "DELETE" })
                    .then(() => Svc.api("/api/admin/irattar/szinkron").then(a2 => rajzol(a2)))
                    .catch(e => alert(Svc.hiba(e)));
            };
            if ($("#irSyncMasol")) $("#irSyncMasol").onclick = () => {
                const i = $("#irSyncKulcs");
                i.select();
                (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).catch(() => document.execCommand("copy"));
            };
        };
        Svc.api("/api/admin/irattar/szinkron").then(all => { rajzol(all); modal.show(); }).catch(e => alert(Svc.hiba(e)));
    }

    // ---------- Feltöltés / szerkesztés ----------

    static urlap(x, elo = {}, kezdoFajl = null) {

        const esc = Utils.escape;
        const resz = x ? x.resz : Archive.resz;
        const szerz = resz === "szerzodes";
        const v = { ...(x || {}), ...elo };
        const kategoriak = (Archive.adat && Archive.adat.kategoriak || []).filter(k => !k.csakAuto);
        const most = new Date();
        const ma = `${most.getFullYear()}-${String(most.getMonth() + 1).padStart(2, "0")}-${String(most.getDate()).padStart(2, "0")}`;
        const alapKat = v.kategoria && kategoriak.some(k => k.kod === v.kategoria) ? v.kategoria : (szerz ? "ugyfel" : "bejovo");
        const { tartalom, modal } = Svc.modal("irModal", "modal-lg");
        let fajl = null;

        const mezo = (id, label, html, col = "col-sm-6") => `<div class="${col}"><label class="form-label small mb-1" for="${id}">${label}</label>${html}</div>`;

        tartalom.innerHTML = `
            <form id="irForm" novalidate>
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fa-solid ${x ? "fa-pen" : "fa-upload"}" aria-hidden="true"></i> ${I18n.t(x ? "irEditTitle" : (szerz ? "irUploadContract" : "irUpload"))}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="OK"></button>
                </div>
                <div class="modal-body">
                    <label class="irFile" id="irFileBox" for="irFile">
                        <input type="file" id="irFile" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.gif,.doc,.docx,.xls,.xlsx,.odt,.ods,.txt,.csv,.xml,.zip">
                        <i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>
                        <span id="irFileText">${x && x.fajl_nev ? `${esc(x.fajl_nev)} · <u>${I18n.t("irReplaceFile")}</u>` : I18n.t("irChooseFile")}</span>
                        <small>${I18n.t("irFileTypes")}</small>
                    </label>
                    ${v.kiadas_id ? `<div class="alert alert-info small py-2 mt-2 mb-0"><i class="fa-solid fa-link"></i> ${I18n.t("irLinkedExpense")}</div>` : ""}
                    <div class="row g-3 mt-1">
                        ${mezo("irKat", I18n.t("irColCategory"), `<select class="form-select" id="irKat">${kategoriak.map(k => `<option value="${k.kod}" ${alapKat === k.kod ? "selected" : ""}>${esc(Archive.katNev(resz, k.kod))}</option>`).join("")}</select>`)}
                        ${mezo("irCim", I18n.t("irTitle") + " *", `<input class="form-control" id="irCim" maxlength="200" value="${esc(v.cim || "")}" required placeholder="${esc(I18n.t(szerz ? "irTitlePhContract" : "irTitlePh"))}">`)}
                        ${mezo("irPartner", I18n.t(szerz ? "irPartnerContract" : "irPartner"), `<input class="form-control" id="irPartner" maxlength="200" value="${esc(v.partner || "")}">`)}
                        ${mezo("irSzam", I18n.t(szerz ? "irNumberContract" : "irNumber"), `<input class="form-control" id="irSzam" maxlength="80" value="${esc(v.szam || "")}">`, "col-sm-3")}
                        ${mezo("irDatum", I18n.t(szerz ? "irSignedDate" : "irDocDate"), `<input type="date" class="form-control" id="irDatum" value="${esc(v.datum || ma)}">`, "col-sm-3")}
                        ${mezo("irOsszeg", I18n.t(szerz ? "irColValue" : "irColAmount"), `<div class="input-group"><input type="number" step="0.01" class="form-control" id="irOsszeg" value="${v.osszeg ?? ""}"><select class="form-select" id="irPenznem" style="max-width:96px">${["RON", "EUR", "HUF", "USD"].map(p => `<option ${(v.penznem || "RON") === p ? "selected" : ""}>${p}</option>`).join("")}</select></div>`)}
                        ${szerz ? `
                            ${mezo("irKezdet", I18n.t("irStart"), `<input type="date" class="form-control" id="irKezdet" value="${esc(v.kezdet || "")}">`, "col-sm-3")}
                            ${mezo("irLejar", I18n.t("irEnd"), `<input type="date" class="form-control" id="irLejar" value="${esc(v.lejar || "")}"><div class="form-text">${I18n.t("irEndHint")}</div>`, "col-sm-3")}
                            ${mezo("irFelmondas", I18n.t("irNotice"), `<input type="number" min="0" max="3650" class="form-control" id="irFelmondas" value="${v.felmondas_nap ?? ""}">`, "col-sm-3")}
                            ${mezo("irStatusz", I18n.t("irColStatus"), `<select class="form-select" id="irStatusz">${["aktiv", "lejart", "megszunt", "archiv"].map(s => `<option value="${s}" ${(v.statusz || "aktiv") === s ? "selected" : ""}>${I18n.t("irSt_" + s)}</option>`).join("")}</select>`, "col-sm-3")}
                        ` : ""}
                        ${mezo("irCimkek", I18n.t("irTags"), `<input class="form-control" id="irCimkek" maxlength="300" value="${esc(v.cimkek || "")}" placeholder="${esc(I18n.t("irTagsPh"))}">`, "col-12")}
                        ${mezo("irMegj", I18n.t("irNote"), `<textarea class="form-control" id="irMegj" rows="2" maxlength="2000">${esc(v.megjegyzes || "")}</textarea>`, "col-12")}
                    </div>
                    <div class="alert alert-warning small mt-3 mb-0" id="irDup" hidden></div>
                    <div class="alert alert-danger small mt-3 mb-0" id="irHiba" hidden></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("cancel")}</button>
                    <button type="submit" class="btn btn-primary" id="irMent"><i class="fa-solid fa-check"></i> ${I18n.t("irSave")}</button>
                </div>
            </form>`;
        modal.show();

        const $ = s => tartalom.querySelector(s);
        const hiba = t => { $("#irHiba").textContent = t; $("#irHiba").hidden = !t; };

        const fajlValaszt = f => {
            hiba("");
            if (!f) return;
            if (f.size > 15 * 1024 * 1024) { hiba(I18n.t("irErr_file_too_large")); return; }
            fajl = f;
            $("#irFileText").innerHTML = `<b>${esc(f.name)}</b> · ${(f.size / 1024 / 1024).toFixed(f.size > 1048576 ? 1 : 2)} MB`;
            $("#irFileBox").classList.add("has");
            // A megnevezés a fájlnévből, ha még üres
            if (!$("#irCim").value.trim()) $("#irCim").value = f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").slice(0, 200);
        };
        $("#irFile").onchange = e => fajlValaszt(e.target.files[0]);
        const fb = $("#irFileBox");
        fb.ondragover = e => { e.preventDefault(); fb.classList.add("on"); };
        fb.ondragleave = () => fb.classList.remove("on");
        fb.ondrop = e => { e.preventDefault(); fb.classList.remove("on"); fajlValaszt(e.dataTransfer.files[0]); };
        if (kezdoFajl) fajlValaszt(kezdoFajl);

        const MIME_KIT = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", gif: "image/gif",
            doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel",
            xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", odt: "application/vnd.oasis.opendocument.text",
            ods: "application/vnd.oasis.opendocument.spreadsheet", txt: "text/plain", csv: "text/csv", xml: "application/xml", zip: "application/zip" };

        const olvas = f => new Promise((ok, nem) => {
            const r = new FileReader();
            r.onload = () => ok(r.result);
            r.onerror = () => nem(r.error);
            r.readAsDataURL(f);
        });

        $("#irForm").onsubmit = async e => {
            e.preventDefault();
            hiba("");
            if (!$("#irCim").value.trim()) { hiba(I18n.t("irErr_missing_title")); $("#irCim").focus(); return; }
            const val = id => { const el = $(id); return el ? el.value : undefined; };
            const body = {
                resz, kategoria: val("#irKat"), cim: val("#irCim"), partner: val("#irPartner"), szam: val("#irSzam"), datum: val("#irDatum"),
                osszeg: val("#irOsszeg"), penznem: val("#irPenznem"), cimkek: val("#irCimkek"), megjegyzes: val("#irMegj")
            };
            if (szerz) Object.assign(body, { kezdet: val("#irKezdet"), lejar: val("#irLejar"), felmondas_nap: val("#irFelmondas"), statusz: val("#irStatusz") });
            if (v.kiadas_id) body.kiadas_id = v.kiadas_id;
            $("#irMent").disabled = true;
            try {
                if (fajl) {
                    const kit = (fajl.name.split(".").pop() || "").toLowerCase();
                    body.fajl_nev = fajl.name;
                    body.fajl_mime = MIME_KIT[kit] || fajl.type;
                    body.fajl_adat = await olvas(fajl);
                }
                const v2 = await Svc.api(x ? `/api/admin/irattar/${x.id}` : "/api/admin/irattar", { method: x ? "PUT" : "POST", body });
                if (v2.duplikatum) {
                    Utils.toast && Utils.toast(I18n.f("irDuplicate", { cim: v2.duplikatum.cim }));
                }
                modal.hide();
                Utils.toast && Utils.toast(I18n.t("irSaved"));
                Archive.betolt();
            } catch (err) {
                $("#irMent").disabled = false;
                hiba(Svc.hiba(err, "irErr_"));
            }
        };

    }

}
