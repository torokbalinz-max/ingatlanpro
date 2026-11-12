// ============================================================
//  Ügyfélportál – iratok titkos linkkel (#iratok/<token>)
//
//  Az iroda a CRM-ben bekapcsolja az ügyfél portálját, és elküldi neki a
//  linket. Az ügyfél belépés nélkül látja: melyik irat van meg, mi hiányzik,
//  mit kell még beszereznie (rövid magyarázattal), és ő is feltöltheti a
//  sajátjait (PDF / fotó). Csak a saját feltöltését törölheti.
//  Szerver: /api/crm-portal/:token (server/routes/crm.js)
// ============================================================

class DocPortal {

    static token = null;

    static show(token) {
        DocPortal.token = String(token || "").trim();
        DocPortal.render();
    }

    static api(ut, opts = {}) {
        const o = { method: opts.method || "GET", headers: {} };
        if (opts.body !== undefined) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(opts.body); }
        return fetch(`/api/crm-portal/${DocPortal.token}${ut}`, o).then(async r => {
            const v = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(v.error || "server_error");
            return v;
        });
    }

    static render() {
        const el = document.getElementById("ptPage");
        if (!el) return;
        const esc = Utils.escape;
        el.innerHTML = `<div class="text-center py-5"><span class="spinner-border text-primary" role="status"></span></div>`;
        DocPortal.api("").then(d => {
            const L = d.iratok;
            const kesz = L.filter(i => i.statusz === "megvan").length;
            const pct = L.length ? Math.round(kesz / L.length * 100) : 0;
            const hianyzik = L.filter(i => i.statusz === "hianyzik");
            const csop = ["elado", "vevo", "mindketto"].map(k => ({ k, l: L.filter(i => i.kinek === k) })).filter(c => c.l.length);
            el.innerHTML = `
                <div class="ptWrap">
                    <header class="ptHead">
                        ${d.iroda && d.iroda.van_logo ? `<img src="/api/irodak/${d.iroda.id}/logo" alt="" class="ptLogo">` : `<span class="ptLogo ptLogoIcon"><i class="fa-solid fa-folder-open" aria-hidden="true"></i></span>`}
                        <div class="min-w-0">
                            <div class="small text-body-secondary">${esc(d.iroda ? d.iroda.nev : "IngatlanPro")}</div>
                            <h1 class="h4 mb-0">${I18n.f("ptHello", { nev: esc(d.ugyfel.nev) })}</h1>
                        </div>
                    </header>
                    <p>${I18n.t("ptIntro")}</p>
                    <div class="d-flex align-items-center gap-2 mb-3">
                        <div class="progress flex-fill" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(I18n.t("dcProgress"))}" style="height:10px">
                            <div class="progress-bar bg-success" style="width:${pct}%"></div>
                        </div>
                        <b class="small text-nowrap">${I18n.f("dcProgressN", { a: kesz, b: L.length })}</b>
                    </div>
                    ${hianyzik.length ? `<div class="alert alert-info small"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.f("ptMissing", { n: hianyzik.length })}</div>` : L.length ? `<div class="alert alert-success small"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${I18n.t("ptAllIn")}</div>` : ""}
                    ${csop.map(c => `
                        <section class="mb-3">
                            <h2 class="h6 text-uppercase text-body-secondary">${I18n.t("dcFor_" + c.k)}</h2>
                            ${c.l.map(i => `
                                <div class="ptRow st-${esc(i.statusz)}">
                                    <i class="${CrmDocs.ikon(i.statusz)} crmDocIcon" aria-hidden="true"></i>
                                    <div class="flex-fill min-w-0">
                                        <div class="fw-semibold">${CrmDocs.nev(i)} <span class="badge text-bg-light fw-normal">${I18n.t("ptSt_" + i.statusz)}</span></div>
                                        ${CrmDocs.sugo(i) ? `<div class="small text-body-secondary">${CrmDocs.sugo(i)}</div>` : ""}
                                        ${i.megjegyzes ? `<div class="small fst-italic"><i class="fa-regular fa-comment" aria-hidden="true"></i> ${esc(i.megjegyzes)}</div>` : ""}
                                        ${i.lejarat ? `<div class="small"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${I18n.t("dcExpiry")}: ${esc(i.lejarat)}</div>` : ""}
                                        ${(i.fajlok || []).length ? `<div class="crmFiles">${i.fajlok.map(f => `
                                            <span class="crmFile">
                                                <a href="/api/crm-portal/${DocPortal.token}/fajl/${f.id}" target="_blank" rel="noopener"><i class="fa-regular ${f.mime === "application/pdf" ? "fa-file-pdf" : "fa-file-image"}" aria-hidden="true"></i> ${esc(f.nev)}</a>
                                                ${f.feltolto === "ugyfel" && i.statusz !== "megvan" ? `<button type="button" class="btn btn-link btn-sm p-0 text-danger" data-ptorol="${f.id}" aria-label="${esc(I18n.t("crmDelete"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>` : ""}
                                            </span>`).join("")}</div>` : ""}
                                    </div>
                                    ${i.statusz !== "megvan" ? `
                                    <label class="btn btn-sm btn-outline-primary text-nowrap">
                                        <i class="fa-solid fa-upload" aria-hidden="true"></i> ${I18n.t("dcUpload")}
                                        <input type="file" class="visually-hidden" data-pfeltolt="${i.id}" accept="${CrmDocs.MIME.join(",")}" multiple>
                                    </label>` : ""}
                                </div>`).join("")}
                        </section>`).join("")}
                    ${d.felelos || d.iroda ? `
                    <div class="ptContact">
                        <b>${I18n.t("ptQuestions")}</b>
                        <div class="small">${esc((d.felelos && d.felelos.nev) || (d.iroda && d.iroda.nev) || "")}
                            ${(d.felelos && d.felelos.telefon) || (d.iroda && d.iroda.telefon) ? ` · <a href="tel:${esc((d.felelos && d.felelos.telefon) || d.iroda.telefon)}">${esc((d.felelos && d.felelos.telefon) || d.iroda.telefon)}</a>` : ""}
                            ${(d.felelos && d.felelos.email) || (d.iroda && d.iroda.email) ? ` · <a href="mailto:${esc((d.felelos && d.felelos.email) || d.iroda.email)}">${esc((d.felelos && d.felelos.email) || d.iroda.email)}</a>` : ""}</div>
                    </div>` : ""}
                    <p class="small text-body-secondary mt-3">${I18n.t("ptPrivacy")}</p>
                </div>`;
            el.querySelectorAll("[data-pfeltolt]").forEach(inp => inp.onchange = async () => {
                inp.disabled = true;
                try {
                    for (const f of [...inp.files]) {
                        const adat = await CrmDocs.olvas(f);
                        await DocPortal.api(`/irat/${inp.dataset.pfeltolt}`, { method: "POST", body: adat });
                    }
                    DocPortal.render();
                } catch (e) { inp.disabled = false; alert(DocPortal.hiba(e)); }
            });
            el.querySelectorAll("[data-ptorol]").forEach(b => b.onclick = () => {
                if (!confirm(I18n.t("dcDeleteFile"))) return;
                DocPortal.api(`/fajl/${b.dataset.ptorol}`, { method: "DELETE" }).then(() => DocPortal.render()).catch(e => alert(DocPortal.hiba(e)));
            });
        }).catch(e => {
            el.innerHTML = `<div class="emptyState"><i class="fa-solid fa-link-slash"></i><h5>${I18n.t("ptInvalid")}</h5><p>${I18n.t("ptInvalidHint")}</p></div>`;
            void e;
        });
    }

    static hiba(e) {
        const k = "crmErr_" + (e && e.message);
        const t = I18n.t(k);
        return t && t !== k ? t : I18n.t("crmErr_server_error");
    }

}
