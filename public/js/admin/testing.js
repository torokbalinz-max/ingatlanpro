// ============================================================
//  Admin → Beállítások → Tesztelés (#admin/teszt)
//
//  Egy gombnyomással 15 tesztfiók két tesztirodával, hirdetésekkel és
//  CRM-adatokkal (server/services/teszt.js). Bármelyikbe belépsz e-mail és
//  regisztráció nélkül; alul a sávból váltasz a fiókok között. A tesztadatok
//  a nyilvános oldalon nem látszanak, levél nem megy ki, fizetni nem lehet.
//  Lent egy kipipálható forgatókönyv: mit érdemes végigpróbálni (a pipák ebben
//  a böngészőben maradnak meg).
// ============================================================

(() => {
    AdminManager.TABS.teszt = {
        group: "beall", jog: "admin", icon: "fa-solid fa-flask", title: "tdTab", desc: "tdDesc",
        render: () => TesztAdmin.render(AdminManager.box())
    };
    Object.assign(AdminManager.ALIASES, { teszteles: "teszt", test: "teszt", tesztfiokok: "teszt" });
})();

class TesztAdmin {

    static PIPA = "ip_teszt_pipak";

    // A forgatókönyv: témánként lépések – [fiók kulcsa, szöveg kulcsa]
    static FORGATOKONYV = [
        { k: "crm", lepesek: [["vezeto_a", "tdS_crm1"], ["ugynok_a1", "tdS_crm2"], ["ugynok_a2", "tdS_crm3"], ["vezeto_a", "tdS_crm4"], ["ugynok_a1", "tdS_crm5"], ["vezeto_b", "tdS_crm6"]] },
        { k: "ajanlat", lepesek: [["vevo3", "tdS_of1"], ["ugynok_a1", "tdS_of2"], ["vevo3", "tdS_of3"], ["vevo4", "tdS_of4"], ["vezeto_a", "tdS_of5"], ["vevo5", "tdS_of6"], ["magan", "tdS_of7"]] },
        { k: "iratok", lepesek: [["ugynok_a1", "tdS_doc1"], ["ugynok_a1", "tdS_doc2"], ["", "tdS_doc3"], ["ugynok_a1", "tdS_doc4"]] },
        { k: "uzenet", lepesek: [["vevo1", "tdS_msg1"], ["ugynok_a1", "tdS_msg2"], ["vevo6", "tdS_msg3"], ["vezeto_b", "tdS_msg4"]] },
        { k: "iroda", lepesek: [["iroda_uj", "tdS_ag1"], ["", "tdS_ag2"], ["iroda_uj", "tdS_ag3"], ["vezeto_a", "tdS_ag4"]] },
        { k: "hirdetes", lepesek: [["magan", "tdS_li1"], ["ugynok_a2", "tdS_li2"], ["vevo2", "tdS_li3"], ["vevo2", "tdS_li4"]] },
        { k: "megbizas", lepesek: [["megbizo", "tdS_md1"], ["", "tdS_md2"], ["megbizo", "tdS_md3"]] },
        { k: "csapat", lepesek: [["", "tdS_tm1"], ["munkatars", "tdS_tm2"]] }
    ];

    static pipak() {
        try { return JSON.parse(localStorage.getItem(TesztAdmin.PIPA) || "{}") || {}; } catch (e) { return {}; }
    }

    static render(box) {
        AdminManager.loading();
        Svc.api("/api/admin/teszt").then(d => TesztAdmin.rajzol(box, d)).catch(e => {
            box.innerHTML = `<div class="alert alert-danger">${Utils.escape(Svc.hiba(e))}</div>`;
        });
    }

    static rajzol(box, d) {
        const esc = Utils.escape;
        const t = k => esc(I18n.t(k));

        const szabalyok = `
            <ul class="tdRules">
                <li><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> ${t("tdRuleHidden")}</li>
                <li><i class="fa-solid fa-envelope-circle-check" aria-hidden="true"></i> ${t("tdRuleMail")}</li>
                <li><i class="fa-solid fa-credit-card" aria-hidden="true"></i> ${t("tdRulePay")}</li>
                <li><i class="fa-solid fa-box" aria-hidden="true"></i> ${t("tdRulePkg")}</li>
            </ul>`;

        if (!d.van) {
            box.innerHTML = `
                <div class="card tdHero">
                    <div class="card-body">
                        <h2 class="h4">${t("tdEmptyTitle")}</h2>
                        <p class="text-body-secondary">${t("tdEmptyText")}</p>
                        <div class="row g-3 my-1">
                            ${[["fa-briefcase", "tdWhatAgencies"], ["fa-user-tie", "tdWhatPeople"], ["fa-house", "tdWhatListings"], ["fa-address-book", "tdWhatCrm"]]
                                .map(([i, k]) => `<div class="col-sm-6 col-lg-3"><div class="tdWhat"><i class="fa-solid ${i}" aria-hidden="true"></i><span>${t(k)}</span></div></div>`).join("")}
                        </div>
                        ${szabalyok}
                        <button class="btn btn-primary btn-lg" id="tdCreate" type="button"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> ${t("tdCreate")}</button>
                    </div>
                </div>`;
            box.querySelector("#tdCreate").onclick = e => {
                const b = e.currentTarget;
                b.disabled = true;
                b.innerHTML = `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> ${t("tdCreating")}`;
                Svc.api("/api/admin/teszt", { method: "POST" }).then(() => TesztAdmin.render(box))
                    .catch(err => { b.disabled = false; b.textContent = I18n.t("tdCreate"); alert(Svc.hiba(err, "tdErr_")); });
            };
            return;
        }

        const csop = ["iroda", "elado", "vevo", "csapat", "egyeb"];
        const fiokSor = f => `
            <div class="tdAcc">
                <div class="tdAccAv" aria-hidden="true">${esc((f.nev || "?").trim().charAt(0))}</div>
                <div class="tdAccBody">
                    <div class="tdAccName">${esc(f.nev)}</div>
                    <div class="small text-body-secondary">${f.leiras ? t(f.leiras) : ""}</div>
                    <div class="small tdAccLogin"><code>${esc(f.felhasznalonev || f.email)}</code></div>
                </div>
                <button class="btn btn-sm btn-outline-primary" type="button" data-td="${f.id}"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> ${t("tdLoginAs")}</button>
            </div>`;

        const pipak = TesztAdmin.pipak();
        const nevKulcs = Object.fromEntries(d.fiokok.map(f => [f.teszt_kulcs, f]));
        const osszLepes = TesztAdmin.FORGATOKONYV.reduce((s, x) => s + x.lepesek.length, 0);
        const kesz = Object.values(pipak).filter(Boolean).length;

        box.innerHTML = `
            <div class="row g-3 mb-3">
                <div class="col-lg-8">
                    <div class="card h-100">
                        <div class="card-body">
                            <h2 class="h5"><i class="fa-solid fa-flask" aria-hidden="true"></i> ${t("tdReadyTitle")}</h2>
                            <p class="mb-2">${t("tdReadyText")}</p>
                            ${szabalyok}
                        </div>
                    </div>
                </div>
                <div class="col-lg-4">
                    <div class="card h-100">
                        <div class="card-body">
                            <h3 class="h6">${t("tdShareTitle")}</h3>
                            <p class="small text-body-secondary mb-2">${t("tdShareText")}</p>
                            <div class="small mb-1">${t("tdUserLabel")}: <code>teszt01</code> … <code>teszt15</code></div>
                            <div class="d-flex align-items-center gap-2 mb-3">
                                <span class="small">${t("tdPassLabel")}:</span> <code class="fs-6">${esc(d.jelszo || "–")}</code>
                                ${d.jelszo ? `<button class="btn btn-sm btn-link p-0" type="button" id="tdCopy">${t("tdCopy")}</button>` : ""}
                            </div>
                            <div class="small text-body-secondary">${esc(I18n.f("tdCounts", { i: d.db.irodak, h: d.db.hirdetesek, c: d.db.crm }))}</div>
                            <button class="btn btn-sm btn-outline-danger mt-3" type="button" id="tdDelete"><i class="fa-solid fa-trash" aria-hidden="true"></i> ${t("tdDelete")}</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card mb-3">
                <div class="card-header"><h3 class="h6 mb-0">${t("tdAccounts")}</h3></div>
                <div class="card-body">
                    ${csop.map(c => {
                        const f = d.fiokok.filter(x => x.csop === c);
                        return f.length ? `<h4 class="tdGroupTitle">${t("tdGroup_" + c)}</h4><div class="tdAccGrid">${f.map(fiokSor).join("")}</div>` : "";
                    }).join("")}
                </div>
            </div>

            <div class="card">
                <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <h3 class="h6 mb-0">${t("tdScript")}</h3>
                    <div class="d-flex align-items-center gap-2">
                        <span class="small text-body-secondary" id="tdProg">${esc(I18n.f("tdProgress", { n: kesz, m: osszLepes }))}</span>
                        <button class="btn btn-sm btn-link" type="button" id="tdReset">${t("tdResetChecks")}</button>
                    </div>
                </div>
                <div class="card-body">
                    <p class="small text-body-secondary">${t("tdScriptHint")}</p>
                    ${TesztAdmin.FORGATOKONYV.map(s => `
                        <section class="tdScen">
                            <h4 class="tdScenTitle">${t("tdScen_" + s.k)}</h4>
                            <ol class="tdSteps">
                                ${s.lepesek.map(([fk, sk], n) => {
                                    const id = `${s.k}_${n}`;
                                    const f = nevKulcs[fk];
                                    return `<li class="tdStep ${pipak[id] ? "done" : ""}">
                                        <input class="form-check-input" type="checkbox" id="tdc_${id}" data-pipa="${id}" ${pipak[id] ? "checked" : ""}>
                                        <label class="form-check-label" for="tdc_${id}">${t(sk)}</label>
                                        ${f ? `<button class="btn btn-sm btn-light tdStepWho" type="button" data-td="${f.id}" title="${esc(I18n.t("tdLoginAs"))}"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> ${esc(f.nev)}</button>`
                                            : `<span class="badge text-bg-secondary tdStepWho">${t("tdAsAdmin")}</span>`}
                                    </li>`;
                                }).join("")}
                            </ol>
                        </section>`).join("")}
                </div>
            </div>`;

        box.querySelectorAll("[data-td]").forEach(b => { b.onclick = () => TesztSav.belep(Number(b.dataset.td)); });
        const cp = box.querySelector("#tdCopy");
        if (cp) cp.onclick = () => navigator.clipboard && navigator.clipboard.writeText(d.jelszo).then(() => { cp.textContent = I18n.t("tdCopied"); });

        const prog = box.querySelector("#tdProg");
        box.querySelectorAll("[data-pipa]").forEach(c => {
            c.onchange = () => {
                const p = TesztAdmin.pipak();
                p[c.dataset.pipa] = c.checked;
                try { localStorage.setItem(TesztAdmin.PIPA, JSON.stringify(p)); } catch (e) { /* nem baj */ }
                c.closest(".tdStep").classList.toggle("done", c.checked);
                prog.textContent = I18n.f("tdProgress", { n: Object.values(p).filter(Boolean).length, m: osszLepes });
            };
        });
        box.querySelector("#tdReset").onclick = () => {
            try { localStorage.removeItem(TesztAdmin.PIPA); } catch (e) { /* nem baj */ }
            TesztAdmin.rajzol(box, d);
        };
        box.querySelector("#tdDelete").onclick = e => {
            if (!confirm(I18n.t("tdDeleteConfirm"))) return;
            const b = e.currentTarget;
            b.disabled = true;
            Svc.api("/api/admin/teszt", { method: "DELETE" }).then(r => {
                alert(I18n.f("tdDeleted", { f: r.fiokok, i: r.irodak, h: r.hirdetesek }));
                TesztAdmin.render(box);
            }).catch(err => { b.disabled = false; alert(Svc.hiba(err)); });
        };
    }

}
