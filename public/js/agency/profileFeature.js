// ============================================================
//  Kiemelt hirdetés az irodaprofilon
//
//  Ha az iroda csomagja ad rá jogot (csomag joga: profil_kiemeles = N),
//  az iroda vezetője kiválaszthat N aktív hirdetést, ami az iroda nyilvános
//  oldalán (#irodak/<id>) legfelül, nagy, feltűnő kártyán jelenik meg.
//
//   - kezelés: Irodám → Hirdetések fül tetején („Kiemelt a profilon”)
//   - nyilvános: AgencyProfile.render → AgencyFeatured.profilHtml(ir)
//   - szerver: PUT /api/irodak/:id/profil-kiemeles { ids }
// ============================================================

class AgencyFeatured {

    // ---------- Irodám → Hirdetések: a doboz a lista fölött ----------

    static kezeloHtml(ir, hirdetesek, vezeto) {

        const pk = ir.profil_kiemeles || { keret: 0, ids: [] };
        const esc = Utils.escape;

        // Nincs joga és nem is választott soha: semmi (ne zavarjon)
        if (!pk.keret && !(pk.ids || []).length) return "";

        const map = new Map(hirdetesek.map(i => [i.id, i]));
        const valasztott = (pk.ids || []).map(id => map.get(id)).filter(i => i && AgencyPage.statuszOf(i) === "aktiv");

        if (!pk.keret) {
            return `
                <div class="card agFeatBox off mb-4">
                    <div class="card-body d-flex flex-wrap align-items-center gap-3">
                        <span class="agFeatIcon"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i></span>
                        <div class="flex-fill">
                            <b>${I18n.t("agFeatTitle")}</b>
                            <div class="small text-body-secondary">${I18n.t("agFeatExpired")}</div>
                        </div>
                        <a class="btn btn-sm btn-outline-primary" href="#csomagok/iroda">${I18n.t("accAgencyPackages")}</a>
                    </div>
                </div>`;
        }

        return `
            <div class="card agFeatBox mb-4">
                <div class="card-body">
                    <div class="d-flex flex-wrap align-items-center gap-3">
                        <span class="agFeatIcon"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i></span>
                        <div class="flex-fill min-w-0">
                            <b>${I18n.t("agFeatTitle")}</b>
                            <div class="small text-body-secondary">${I18n.f("agFeatSub", { n: pk.keret })}</div>
                        </div>
                        ${vezeto ? `<button type="button" class="btn btn-sm btn-primary" id="agFeatPick"><i class="fa-solid fa-hand-pointer" aria-hidden="true"></i> ${I18n.t(valasztott.length ? "agFeatChange" : "agFeatPick")}</button>` : ""}
                        <a class="btn btn-sm btn-outline-secondary" href="#irodak/${ir.id}"><i class="fa-solid fa-eye" aria-hidden="true"></i> ${I18n.t("agFeatPreview")}</a>
                    </div>
                    ${valasztott.length ? `
                    <div class="agFeatChosen mt-3">
                        ${valasztott.map(i => {
                            const foto = Utils.photoUrl(i);
                            return `
                            <a class="agFeatChip" href="#listing/${i.id}">
                                <span class="agFeatChipImg">${foto ? `<img src="${esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<i class="${Types.get(i.tipus).icon}" aria-hidden="true"></i>`}</span>
                                <span class="min-w-0"><b class="d-block text-truncate">${esc(i.cim || Types.label(i.tipus))}</b><small class="text-body-secondary">${Utils.price(i)}</small></span>
                            </a>`;
                        }).join("")}
                    </div>` : `<div class="small mt-2 ${vezeto ? "text-warning-emphasis" : "text-body-secondary"}"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t(vezeto ? "agFeatNone" : "agFeatNoneMember")}</div>`}
                </div>
            </div>`;

    }

    static kot(root) {
        const b = root.querySelector("#agFeatPick");
        if (b) b.onclick = () => AgencyFeatured.valaszto();
    }

    // ---------- A választó ablak ----------

    static valaszto() {

        const esc = Utils.escape;
        const ir = AgencyPage.iroda;
        const pk = ir.profil_kiemeles || { keret: 0, ids: [] };
        const aktivak = AgencyPage.hirdetesek.filter(i => AgencyPage.statuszOf(i) === "aktiv");
        const kijelolt = new Set((pk.ids || []).filter(id => aktivak.some(i => i.id === id)));

        let el = document.getElementById("agFeatModal");
        if (!el) {
            el = document.createElement("div");
            el.id = "agFeatModal";
            el.className = "modal fade";
            el.tabIndex = -1;
            el.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg"><div class="modal-content"></div></div>`;
            document.body.appendChild(el);
        }

        const tartalom = el.querySelector(".modal-content");
        let q = "";

        const lista = () => {
            const s = q.toLowerCase();
            return aktivak.filter(i => !s || [i.cim, i.iroda_ref, "#" + i.id, i.kerulet, i.telepules].filter(Boolean).join(" ").toLowerCase().includes(s));
        };

        const rajzolLista = () => {
            const box = tartalom.querySelector("#afList");
            const L = lista();
            box.innerHTML = L.length ? L.map(i => {
                const foto = Utils.photoUrl(i);
                const be = kijelolt.has(i.id);
                const tele = !be && kijelolt.size >= pk.keret && pk.keret > 1;
                return `
                    <label class="agFeatRow ${be ? "on" : ""} ${tele ? "dim" : ""}">
                        <input class="form-check-input" type="${pk.keret === 1 ? "radio" : "checkbox"}" name="afPick" value="${i.id}" ${be ? "checked" : ""} ${tele ? "disabled" : ""}>
                        <span class="agFeatRowImg">${foto ? `<img src="${esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<i class="${Types.get(i.tipus).icon}" aria-hidden="true"></i>`}</span>
                        <span class="flex-fill min-w-0">
                            <b class="d-block text-truncate">${esc(i.cim || Types.label(i.tipus))}</b>
                            <small class="text-body-secondary d-block text-truncate">${i.iroda_ref ? esc(i.iroda_ref) + " · " : ""}#${i.id} · ${esc(CityManager.helyLabel(i))}</small>
                        </span>
                        <b class="text-nowrap">${Utils.price(i)}</b>
                    </label>`;
            }).join("") : `<div class="emptyState py-4"><i class="fa-solid fa-house" aria-hidden="true"></i><h6>${I18n.t(aktivak.length ? "currentNoResults" : "agFeatNoActive")}</h6></div>`;

            box.querySelectorAll("input[name=afPick]").forEach(inp => {
                inp.onchange = () => {
                    const id = Number(inp.value);
                    if (pk.keret === 1) { kijelolt.clear(); kijelolt.add(id); }
                    else if (inp.checked) kijelolt.add(id);
                    else kijelolt.delete(id);
                    rajzolLista();
                    szamlalo();
                };
            });
        };

        const szamlalo = () => {
            const e = tartalom.querySelector("#afCount");
            if (e) e.textContent = I18n.f("agFeatCount", { n: kijelolt.size, keret: pk.keret });
        };

        tartalom.innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i> ${I18n.t("agFeatPickTitle")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("close"))}"></button>
            </div>
            <div class="modal-body">
                <p class="small text-body-secondary">${I18n.f("agFeatPickHelp", { n: pk.keret })}</p>
                ${aktivak.length > 6 ? `
                <div class="input-group input-group-sm mb-3">
                    <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
                    <input type="search" class="form-control" id="afQ" placeholder="${esc(I18n.t("agSearchPh"))}" aria-label="${esc(I18n.t("agSearchPh"))}">
                </div>` : ""}
                <div id="afList" class="agFeatList"></div>
                <div class="alert alert-danger small mt-3 mb-0" id="afHiba" hidden></div>
            </div>
            <div class="modal-footer">
                <span class="small text-body-secondary me-auto" id="afCount"></span>
                ${kijelolt.size ? `<button type="button" class="btn btn-outline-danger" id="afClear">${I18n.t("agFeatClear")}</button>` : ""}
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("cancel")}</button>
                <button type="button" class="btn btn-primary" id="afSave"><i class="fa-solid fa-check" aria-hidden="true"></i> ${I18n.t("save")}</button>
            </div>`;

        const modal = bootstrap.Modal.getOrCreateInstance(el);

        const ment = ids => {
            const hibaEl = tartalom.querySelector("#afHiba");
            hibaEl.hidden = true;
            tartalom.querySelector("#afSave").disabled = true;
            AgencyPage.api(`/api/irodak/${ir.id}/profil-kiemeles`, "PUT", { ids })
                .then(v => {
                    ir.profil_kiemeles = { keret: v.keret, ids: v.ids };
                    modal.hide();
                    if (Utils.toast) Utils.toast(I18n.t(ids.length ? "agFeatSaved" : "agFeatCleared"));
                    AgencyPage.hirdetesTab(document.getElementById("agBody"));
                })
                .catch(e => {
                    tartalom.querySelector("#afSave").disabled = false;
                    hibaEl.textContent = AgencyPage.hibaSzoveg(e);
                    hibaEl.hidden = false;
                });
        };

        const qEl = tartalom.querySelector("#afQ");
        if (qEl) qEl.oninput = () => { q = qEl.value.trim(); rajzolLista(); };
        tartalom.querySelector("#afSave").onclick = () => ment([...kijelolt]);
        const clr = tartalom.querySelector("#afClear");
        if (clr) clr.onclick = () => ment([]);

        rajzolLista();
        szamlalo();
        modal.show();

    }

    // ---------- Nyilvános irodaprofil: a kiemelt hirdetés(ek) legfelül ----------

    static profilHtml(ir) {

        const lista = ir.kiemelt_hirdetesek || [];
        if (!lista.length) return "";
        const esc = Utils.escape;

        const kartya = (i, nagy) => {
            const foto = Utils.photoUrl(i);
            const cim = i.cim || `${Types.label(i.tipus)} · ${CityManager.displayName(i.varos)}`;
            const tenyek = typeof CardsView !== "undefined" && CardsView.facts ? CardsView.facts(i) : "";
            return `
                <article class="agHero ${nagy ? "big" : ""}" data-id="${i.id}" tabindex="0" role="link" aria-label="${esc(cim)}">
                    <div class="agHeroImg${foto ? "" : " noPhoto"}">
                        ${foto ? `<img src="${esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('noPhoto');this.remove();">` : ""}
                        <span class="agHeroEmpty"><i class="${Types.get(i.tipus).icon}" aria-hidden="true"></i></span>
                        <span class="agHeroBadge"><i class="fa-solid fa-star" aria-hidden="true"></i> ${I18n.t("agFeatBadge")}</span>
                        ${i.kep_db > 1 ? `<span class="photoCount"><i class="fa-solid fa-camera" aria-hidden="true"></i> ${i.kep_db}</span>` : ""}
                    </div>
                    <div class="agHeroBody">
                        <div class="agHeroPrice">${Utils.price(i)}</div>
                        ${Utils.arNm && Utils.arNm(i) ? `<div class="small text-body-secondary">${Utils.eurNm(Utils.arNm(i))}</div>` : ""}
                        <h4 class="agHeroTitle">${esc(cim)}</h4>
                        ${tenyek ? `<div class="listingFacts">${tenyek}</div>` : ""}
                        <div class="agHeroPlace"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(CityManager.helyLabel(i))}</div>
                        <span class="btn btn-primary agHeroBtn">${I18n.t("agFeatOpen")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
                    </div>
                </article>`;
        };

        return `
            <section class="agHeroWrap mb-4" aria-label="${esc(I18n.t("agFeatBadge"))}">
                <h5 class="agHeroHead"><i class="fa-solid fa-star" aria-hidden="true"></i> ${I18n.t(lista.length > 1 ? "agFeatHeadMany" : "agFeatHead")}</h5>
                <div class="agHeroGrid n${Math.min(lista.length, 3)}">
                    ${lista.map((i, n) => kartya(i, lista.length === 1 || n === 0 && lista.length > 2)).join("")}
                </div>
            </section>`;

    }

    static profilKot(root) {
        root.querySelectorAll(".agHero[data-id]").forEach(k => {
            const nyit = () => ListingPage.open(Number(k.dataset.id));
            k.onclick = nyit;
            k.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nyit(); } };
        });
    }

}
