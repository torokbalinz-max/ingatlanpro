// ============================================================
//  CRM – iratok az ügyfél adatlapján (és a közös fájlkezelés)
//
//  Kipipálható lista az adásvételhez szükséges iratokról (sablonból:
//  eladó / vevő, lakás / ház / telek, jelzálog, hitel, külföldi),
//  tételenként állapottal (hiányzik / beküldve / megvan / nem kell),
//  lejárattal és feltölthető fájlokkal. Ügyfélportál: titkos link, amin
//  az ügyfél látja a listát és ő is feltölthet (js/crm/docPortal.js).
//  Szerver: services/crmIratok.js
// ============================================================

class CrmDocs {

    static STATUSZ = ["hianyzik", "bekuldve", "megvan", "nem_kell"];
    static MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    static MAX = 8 * 1024 * 1024;

    static nev(i) {
        if (!i.kulcs) return Utils.escape(i.nev);
        const k = "irat_" + i.kulcs;
        const t = I18n.t(k);
        return Utils.escape(t && t !== k ? t : i.nev);
    }

    static sugo(i) {
        if (!i.kulcs) return "";
        const k = "irat_" + i.kulcs + "_s";
        const t = I18n.t(k);
        return t && t !== k ? t : "";
    }

    static ikon(st) {
        return {
            hianyzik: "fa-regular fa-circle text-body-secondary",
            bekuldve: "fa-solid fa-hourglass-half text-warning",
            megvan: "fa-solid fa-circle-check text-success",
            nem_kell: "fa-solid fa-minus text-body-secondary"
        }[st] || "fa-regular fa-circle";
    }

    static meret(n) {
        return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
    }

    // Fájl beolvasása base64-be (a képeket feltöltés előtt nem módosítjuk: irat)
    static olvas(file) {
        return new Promise((ok, hiba) => {
            if (!CrmDocs.MIME.includes(file.type)) return hiba(new Error("bad_file_type"));
            if (file.size > CrmDocs.MAX) return hiba(new Error("file_too_large"));
            const r = new FileReader();
            r.onload = () => ok({ nev: file.name, mime: file.type, adat: String(r.result).split(",")[1] });
            r.onerror = () => hiba(new Error("read_error"));
            r.readAsDataURL(file);
        });
    }

    // ---------- Az adatlap kártyája ----------
    // u: az ügyfél (iratok, portal_token), frissit: újrarajzolás
    static kartya(u) {
        const esc = Utils.escape;
        const L = u.iratok || [];
        const szamit = L.filter(i => i.statusz !== "nem_kell");
        const kesz = szamit.filter(i => i.statusz === "megvan").length;
        const vár = L.filter(i => i.statusz === "bekuldve").length;
        const pct = szamit.length ? Math.round(kesz / szamit.length * 100) : 0;
        const csop = ["elado", "vevo", "mindketto"].map(k => ({ k, l: L.filter(i => i.kinek === k) })).filter(c => c.l.length);
        const ma = new Date().toISOString().slice(0, 10);

        return `
            <div class="crmCard crmDocs" id="crmDocs">
                <div class="d-flex justify-content-between align-items-center mb-2 gap-2 flex-wrap">
                    <h6 class="mb-0"><i class="fa-solid fa-folder-open" aria-hidden="true"></i> ${I18n.t("dcTitle")}</h6>
                    <div class="d-flex gap-2">
                        <button type="button" class="btn btn-sm btn-outline-primary" id="dcSablon"><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${I18n.t(L.length ? "dcAddFromTemplate" : "dcStart")}</button>
                        ${L.length ? `<button type="button" class="btn btn-sm btn-link p-0" id="dcSajat"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${I18n.t("dcCustom")}</button>` : ""}
                    </div>
                </div>
                ${L.length ? `
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <div class="progress flex-fill" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(I18n.t("dcProgress"))}" style="height:8px">
                            <div class="progress-bar bg-success" style="width:${pct}%"></div>
                        </div>
                        <span class="small text-nowrap">${I18n.f("dcProgressN", { a: kesz, b: szamit.length })}</span>
                    </div>
                    ${vár ? `<div class="alert alert-warning small py-1 px-2 mb-2"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> ${I18n.f("dcToCheck", { n: vár })}</div>` : ""}
                    ${csop.map(c => `
                        <div class="crmDocGroup">
                            <div class="crmGroupHead px-0 bg-transparent">${I18n.t("dcFor_" + c.k)}</div>
                            ${c.l.map(i => `
                                <div class="crmDocRow st-${esc(i.statusz)}" data-irat="${i.id}">
                                    <i class="${CrmDocs.ikon(i.statusz)} crmDocIcon" aria-hidden="true"></i>
                                    <div class="flex-fill min-w-0">
                                        <div class="d-flex flex-wrap align-items-center gap-2">
                                            <span class="fw-semibold small ${i.statusz === "nem_kell" ? "text-decoration-line-through text-body-secondary" : ""}">${CrmDocs.nev(i)}</span>
                                            ${i.lejarat ? `<span class="badge ${i.lejarat < ma ? "text-bg-danger" : "text-bg-light"}" title="${esc(I18n.t("dcExpiry"))}"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${esc(i.lejarat)}</span>` : ""}
                                        </div>
                                        ${CrmDocs.sugo(i) ? `<div class="small text-body-secondary">${CrmDocs.sugo(i)}</div>` : ""}
                                        ${i.megjegyzes ? `<div class="small fst-italic">${esc(i.megjegyzes)}</div>` : ""}
                                        ${(i.fajlok || []).length ? `<div class="crmFiles">${i.fajlok.map(f => `
                                            <span class="crmFile">
                                                <a href="/api/crm/${Crm.ter}/ugyfelek/${u.id}/fajl/${f.id}" target="_blank" rel="noopener"><i class="fa-regular ${f.mime === "application/pdf" ? "fa-file-pdf" : "fa-file-image"}" aria-hidden="true"></i> ${esc(f.nev)}</a>
                                                <span class="text-body-secondary">${CrmDocs.meret(f.meret)}${f.feltolto === "ugyfel" ? ` · ${I18n.t("dcByClient")}` : ""}</span>
                                                <button type="button" class="btn btn-link btn-sm p-0 text-danger" data-fajltorol="${f.id}" aria-label="${esc(I18n.t("crmDelete"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                                            </span>`).join("")}</div>` : ""}
                                    </div>
                                    <div class="d-flex flex-column align-items-end gap-1">
                                        <select class="form-select form-select-sm crmDocSel" data-iratst="${i.id}" aria-label="${esc(I18n.t("crmStatus"))}">
                                            ${CrmDocs.STATUSZ.map(st => `<option value="${st}" ${i.statusz === st ? "selected" : ""}>${I18n.t("dcSt_" + st)}</option>`).join("")}
                                        </select>
                                        <div class="d-flex gap-2">
                                            <label class="btn btn-link btn-sm p-0" title="${esc(I18n.t("dcUploadHint"))}">
                                                <i class="fa-solid fa-upload" aria-hidden="true"></i> ${I18n.t("dcUpload")}
                                                <input type="file" class="visually-hidden" data-feltolt="${i.id}" accept="${CrmDocs.MIME.join(",")}" multiple>
                                            </label>
                                            <button type="button" class="btn btn-link btn-sm p-0 text-body-secondary" data-iratszerk="${i.id}" aria-label="${esc(I18n.t("crmEdit"))}"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
                                        </div>
                                    </div>
                                </div>`).join("")}
                        </div>`).join("")}

                    <div class="crmPortalBox mt-3">
                        <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                            <div class="min-w-0">
                                <b class="small"><i class="fa-solid fa-user-lock" aria-hidden="true"></i> ${I18n.t("dcPortal")}</b>
                                <div class="small text-body-secondary">${I18n.t(u.portal_token ? "dcPortalOn" : "dcPortalOff")}</div>
                            </div>
                            ${u.portal_token
                                ? `<button type="button" class="btn btn-sm btn-outline-danger" id="dcPortalKi">${I18n.t("dcPortalDisable")}</button>`
                                : `<button type="button" class="btn btn-sm btn-primary" id="dcPortalBe">${I18n.t("dcPortalEnable")}</button>`}
                        </div>
                        ${u.portal_token ? `
                        <div class="input-group input-group-sm mt-2">
                            <input class="form-control" id="dcPortalLink" readonly value="${esc(location.origin + "/#iratok/" + u.portal_token)}" aria-label="${esc(I18n.t("dcPortal"))}">
                            <button type="button" class="btn btn-outline-secondary" id="dcPortalMasol"><i class="fa-regular fa-copy" aria-hidden="true"></i> ${I18n.t("dcCopy")}</button>
                        </div>
                        <div class="d-flex flex-wrap gap-2 mt-2 small">
                            ${u.telefon ? `<a href="https://wa.me/${esc(String(u.telefon).replace(/[^0-9]/g, "").replace(/^0/, "40"))}?text=${encodeURIComponent(I18n.f("dcShareText", { link: location.origin + "/#iratok/" + u.portal_token }))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp</a>` : ""}
                            ${u.email ? `<a href="mailto:${esc(u.email)}?subject=${encodeURIComponent(I18n.t("dcShareSubject"))}&body=${encodeURIComponent(I18n.f("dcShareText", { link: location.origin + "/#iratok/" + u.portal_token }))}"><i class="fa-regular fa-envelope" aria-hidden="true"></i> E-mail</a>` : ""}
                            <button type="button" class="btn btn-link btn-sm p-0" id="dcPortalUj">${I18n.t("dcPortalNew")}</button>
                        </div>` : ""}
                    </div>
                    <p class="small text-body-secondary mt-2 mb-0">${I18n.t("dcDisclaimer")}</p>` : `<p class="small text-body-secondary mb-0">${I18n.t("dcEmpty")}</p>`}
            </div>`;
    }

    static kot(root, u, ujra) {
        const $ = s => root.querySelector(s);
        const api = (ut, opts) => Crm.api(`/ugyfelek/${u.id}${ut}`, opts);
        const hiba = e => alert(Crm.hiba(e));

        const sab = $("#dcSablon");
        if (sab) sab.onclick = () => CrmDocs.sablonAblak(u, ujra);
        const saj = $("#dcSajat");
        if (saj) saj.onclick = () => {
            const nev = prompt(I18n.t("dcCustomPrompt"));
            if (!nev) return;
            api("/iratok", { method: "POST", body: { nev, kinek: "mindketto" } }).then(ujra).catch(hiba);
        };
        root.querySelectorAll("[data-iratst]").forEach(s => s.onchange = () =>
            api(`/iratok/${s.dataset.iratst}`, { method: "PUT", body: { statusz: s.value } }).then(ujra).catch(hiba));
        root.querySelectorAll("[data-feltolt]").forEach(inp => inp.onchange = async () => {
            const files = [...inp.files];
            inp.disabled = true;
            try {
                for (const f of files) {
                    const adat = await CrmDocs.olvas(f);
                    await api(`/iratok/${inp.dataset.feltolt}/fajl`, { method: "POST", body: adat });
                }
                Crm.jelez(I18n.t("dcUploaded"));
                ujra();
            } catch (e) { inp.disabled = false; hiba(e); }
        });
        root.querySelectorAll("[data-fajltorol]").forEach(b => b.onclick = () => {
            if (!confirm(I18n.t("dcDeleteFile"))) return;
            api(`/fajl/${b.dataset.fajltorol}`, { method: "DELETE" }).then(ujra).catch(hiba);
        });
        root.querySelectorAll("[data-iratszerk]").forEach(b => b.onclick = () => {
            const i = u.iratok.find(x => String(x.id) === b.dataset.iratszerk);
            CrmDocs.tetelAblak(u, i, ujra);
        });
        const be = $("#dcPortalBe");
        if (be) be.onclick = () => api("/portal", { method: "POST", body: { mit: "be" } }).then(ujra).catch(hiba);
        const uj = $("#dcPortalUj");
        if (uj) uj.onclick = () => { if (confirm(I18n.t("dcPortalNewConfirm"))) api("/portal", { method: "POST", body: { mit: "be" } }).then(ujra).catch(hiba); };
        const ki = $("#dcPortalKi");
        if (ki) ki.onclick = () => { if (confirm(I18n.t("dcPortalDisableConfirm"))) api("/portal", { method: "POST", body: { mit: "ki" } }).then(ujra).catch(hiba); };
        const masol = $("#dcPortalMasol");
        if (masol) masol.onclick = () => {
            const l = $("#dcPortalLink");
            (navigator.clipboard ? navigator.clipboard.writeText(l.value) : Promise.reject()).catch(() => { l.select(); document.execCommand("copy"); })
                .finally(() => Crm.jelez(I18n.t("dcCopied")));
        };
    }

    // Lista indítása sablonból
    static sablonAblak(u, ujra) {
        const { tartalom, modal } = Svc.modal("crmDocSab", "");
        const esc = Utils.escape;
        const szerep = (u.szerepek || []).includes("elado") ? "elado" : (u.szerepek || []).includes("vevo") ? "vevo" : "elado";
        const ing = (u.ingatlanok || []).find(x => x.szerep === (szerep === "elado" ? "tulajdonos" : "erdeklodik")) || (u.ingatlanok || [])[0];
        const tipus = ing ? (ing.tipus === "haz" ? "haz" : ing.tipus === "telek" ? "telek" : "lakas") : "lakas";
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title">${I18n.t("dcStart")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("crmClose"))}"></button>
            </div>
            <div class="modal-body">
                <p class="small text-body-secondary">${I18n.t("dcTemplateHelp")}</p>
                <span class="form-label small d-block mb-1">${I18n.t("dcSide")}</span>
                <div class="d-flex flex-wrap gap-2 mb-3" role="radiogroup">
                    ${["elado", "vevo", "mindketto"].map(k => `
                        <input type="radio" class="btn-check" name="dsOldal" id="dsO_${k}" value="${k}" ${k === szerep ? "checked" : ""}>
                        <label class="btn btn-sm btn-outline-primary" for="dsO_${k}">${I18n.t("dcFor_" + k)}</label>`).join("")}
                </div>
                <span class="form-label small d-block mb-1">${I18n.t("dcPropType")}</span>
                <div class="d-flex flex-wrap gap-2 mb-3" role="radiogroup">
                    ${["lakas", "haz", "telek"].map(k => `
                        <input type="radio" class="btn-check" name="dsTipus" id="dsT_${k}" value="${k}" ${k === tipus ? "checked" : ""}>
                        <label class="btn btn-sm btn-outline-primary" for="dsT_${k}">${Types.label(k)}</label>`).join("")}
                </div>
                ${[["dsJelzalog", "dcMortgage"], ["dsHitel", "dcLoan"], ["dsKulfoldi", "dcForeign"], ["dsKulterulet", "dcAgriLand"]].map(([id, k]) => `
                    <div class="form-check"><input class="form-check-input" type="checkbox" id="${id}"><label class="form-check-label small" for="${id}">${I18n.t(k)}</label></div>`).join("")}
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("crmCancel")}</button>
                <button type="button" class="btn btn-primary" id="dsOk">${I18n.t("dcCreate")}</button>
            </div>`;
        modal.show();
        const $ = s => tartalom.querySelector(s);
        $("#dsOk").onclick = () => {
            $("#dsOk").disabled = true;
            Crm.api(`/ugyfelek/${u.id}/iratok/sablon`, {
                method: "POST",
                body: {
                    oldal: tartalom.querySelector("input[name=dsOldal]:checked").value,
                    tipus: tartalom.querySelector("input[name=dsTipus]:checked").value,
                    jelzalog: $("#dsJelzalog").checked, hitel: $("#dsHitel").checked, kulfoldi: $("#dsKulfoldi").checked, kulterulet: $("#dsKulterulet").checked,
                    ingatlan_id: ing ? ing.id : null
                }
            }).then(v => { modal.hide(); Crm.jelez(I18n.f("dcCreated", { n: v.letrehozva })); ujra(); })
                .catch(e => { $("#dsOk").disabled = false; alert(Crm.hiba(e)); });
        };
    }

    // Egy tétel: lejárat, megjegyzés (az ügyfél is látja), saját tétel neve, törlés
    static tetelAblak(u, i, ujra) {
        const { tartalom, modal } = Svc.modal("crmDocTet", "");
        const esc = Utils.escape;
        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title">${CrmDocs.nev(i)}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("crmClose"))}"></button>
            </div>
            <div class="modal-body">
                ${!i.kulcs ? `<label class="form-label small mb-1" for="dtNev">${I18n.t("crmName")}</label><input class="form-control mb-3" id="dtNev" maxlength="200" value="${esc(i.nev)}">` : ""}
                <label class="form-label small mb-1" for="dtLej">${I18n.t("dcExpiry")}</label>
                <input type="date" class="form-control mb-1" id="dtLej" value="${esc(i.lejarat || "")}">
                <p class="small text-body-secondary">${I18n.t("dcExpiryHelp")}</p>
                <label class="form-label small mb-1" for="dtMegj">${I18n.t("dcNoteForClient")}</label>
                <textarea class="form-control" id="dtMegj" rows="2" maxlength="500">${esc(i.megjegyzes || "")}</textarea>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-danger me-auto" id="dtTorol"><i class="fa-solid fa-trash" aria-hidden="true"></i> ${I18n.t("crmDelete")}</button>
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("crmCancel")}</button>
                <button type="button" class="btn btn-primary" id="dtOk">${I18n.t("crmSave")}</button>
            </div>`;
        modal.show();
        const $ = s => tartalom.querySelector(s);
        $("#dtOk").onclick = () => Crm.api(`/ugyfelek/${u.id}/iratok/${i.id}`, {
            method: "PUT", body: { lejarat: $("#dtLej").value, megjegyzes: $("#dtMegj").value, ...($("#dtNev") ? { nev: $("#dtNev").value } : {}) }
        }).then(() => { modal.hide(); ujra(); }).catch(e => alert(Crm.hiba(e)));
        $("#dtTorol").onclick = () => {
            if (!confirm(I18n.t("dcDeleteItem"))) return;
            Crm.api(`/ugyfelek/${u.id}/iratok/${i.id}`, { method: "DELETE" }).then(() => { modal.hide(); ujra(); }).catch(e => alert(Crm.hiba(e)));
        };
    }

}
