// ============================================================
//  Hirdetésfeladás: a lépések állapota, élő előnézet, kötelező adatok
//  (csak megjelenítés – a mentés és az ellenőrzés a NewPropertyManager dolga)
//
//  - A fejlécben a négy lépés: kész (pipa) vagy hány adat hiányzik még;
//    kattintva odagörget
//  - Minden lépés fejlécében ugyanez a jelzés
//  - Jobb oldalt (széles képernyőn ragad): így fog kinézni a hirdetés a
//    listában, alatta a kötelező adatok – ami megvan, kipipálva; egy
//    hiányzóra kattintva a mezőjéhez ugrik
//  - Az alsó mentés-sávban: mi hiányzik még, vagy hogy mentheted
// ============================================================

class NewListingUi {

    // Melyik adat melyik lépéshez tartozik
    static LEPES = {
        cim: 1,
        ar: 2, nm: 2, telek_nm: 2, szobak: 2, emelet: 2, allapot: 2, telek_jelleg: 2, varos: 2, kerulet: 2, leiras: 2,
        kepek: 3,
        hely: 4
    };

    static init() {

        const lap = document.getElementById("page-new");
        if (!lap || !document.getElementById("newPreview")) return;

        let idozito = null;
        const kesobb = () => {
            clearTimeout(idozito);
            idozito = setTimeout(() => NewListingUi.frissit(), 120);
        };
        NewListingUi.kesobb = kesobb;

        lap.addEventListener("input", kesobb);
        lap.addEventListener("change", kesobb);
        lap.addEventListener("click", e => { if (e.target.closest(".typeBtn")) kesobb(); });

        // Képek, hely, beolvasás: a NewPropertyManager a lapot frissíti – azt figyeljük
        const figyelo = new MutationObserver(kesobb);
        ["photoGrid", "panoGrid", "newLocationInfo", "scrapeResult", "ujKerulet", "newPageTitle"].forEach(id => {
            const el = document.getElementById(id);
            if (el) figyelo.observe(el, { childList: true, subtree: true, characterData: true });
        });

        // Lépésre kattintás: odagörget (a fejléc alá)
        lap.querySelectorAll("[data-step-go]").forEach(a => {
            a.addEventListener("click", e => {
                e.preventDefault();
                NewListingUi.ugrik(document.getElementById("newStep" + a.dataset.stepGo));
            });
        });

        // Egy adatra kattintva a mezőhöz ugrik (és oda kerül a fókusz)
        document.getElementById("newCheck").addEventListener("click", e => {
            const gomb = e.target.closest("[data-field-go]");
            if (!gomb) return;
            const id = NewPropertyManager.FIELD_EL[gomb.dataset.fieldGo];
            const el = id && document.getElementById(id);
            if (!el) return;
            NewListingUi.ugrik(el);
            if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) setTimeout(() => el.focus({ preventScroll: true }), 400);
        });

        // Az oldal megnyitásakor (új hirdetés, szerkesztés) és nyelvváltáskor is
        new MutationObserver(() => { if (document.body.dataset.page === "new") kesobb(); })
            .observe(document.body, { attributes: true, attributeFilter: ["data-page"] });
        if (typeof I18n !== "undefined" && I18n.onChange) I18n.onChange(kesobb);

        NewListingUi.frissit();

    }

    static ugrik(el) {
        if (!el) return;
        const nav = document.querySelector(".appNav");
        const y = el.getBoundingClientRect().top + window.scrollY - (nav ? nav.offsetHeight : 68) - 16;
        const csendes = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: Math.max(0, y), behavior: csendes ? "auto" : "smooth" });
    }

    // A kötelező adatok (a típus, a város és a link szerint) – ugyanaz a szabály,
    // mint mentéskor (NewPropertyManager.missing), csak üres adatokra
    static kotelezok(d) {
        const ures = {
            ...d, cim: "", ar: null, nm: null, telek_nm: null, szobak: null, emelet: "", allapot: "",
            telek_jelleg: "", kerulet: "", leiras: "", x: null, y: null, hely_pontossag: null
        };
        const lista = NewPropertyManager.missing(ures);
        if (!d.link && !lista.includes("kepek")) lista.push("kepek");
        return lista.sort((a, b) => (NewListingUi.LEPES[a] || 9) - (NewListingUi.LEPES[b] || 9));
    }

    static mezoNev(m) {
        const s = I18n.t("field_" + m);
        return s.charAt(0).toLocaleUpperCase(I18n.current || "hu") + s.slice(1);
    }

    // Az első kép (feltöltött, már elmentett, vagy a forrásoldalról beolvasott)
    static kep() {
        const p = (NewPropertyManager.photos || [])[0];
        if (!p) return null;
        if (p.kind === "new") return p.data;
        if (p.kind === "saved") return "/api/kepek/" + p.id;
        if (p.kind === "ext") return Utils.imgUrl(p.url);
        return null;
    }

    static frissit() {

        const box = document.getElementById("newPreview");
        if (!box || typeof NewPropertyManager === "undefined") return;

        let d;
        try { d = NewPropertyManager.collect(); } catch (e) { return; }

        const esc = Utils.escape;
        const kell = NewListingUi.kotelezok(d);
        const hiany = NewPropertyManager.missing(d).filter(m => kell.includes(m));
        const megvan = kell.filter(m => !hiany.includes(m));

        // ---------- A lépések ----------
        [1, 2, 3, 4].forEach(n => {
            const sajat = kell.filter(m => NewListingUi.LEPES[m] === n);
            const h = sajat.filter(m => hiany.includes(m)).length;
            const kesz = h === 0;
            const szoveg = !sajat.length ? I18n.t("newStepOptional")
                : kesz ? I18n.t("newStepDone")
                    : I18n.f("newStepMissing", { n: h });

            document.querySelectorAll(`[data-step-state="${n}"]`).forEach(el => { el.textContent = szoveg; });

            const badge = document.querySelector(`[data-step-badge="${n}"]`);
            if (badge) {
                badge.className = "newStepBadge " + (!sajat.length ? "isOptional" : kesz ? "isDone" : "isTodo");
                badge.innerHTML = (kesz && sajat.length ? `<i class="fa-solid fa-check" aria-hidden="true"></i> ` : "") + esc(szoveg);
            }

            const li = document.querySelector(`[data-step-link="${n}"]`);
            if (li) li.classList.toggle("isDone", kesz && sajat.length > 0);
        });

        // ---------- Előnézet: ahogy a listában megjelenik ----------
        const t = Types.get(d.tipus);
        const varos = d.varos ? CityManager.displayName(d.varos) : "";
        const hely = [varos, d.kerulet ? CityManager.keruletLabel(d.kerulet, d.varos) : ""].filter(Boolean).join(", ");
        const cim = d.cim || [Types.label(d.tipus), varos].filter(Boolean).join(", ");
        const kep = NewListingUi.kep();
        const kepDb = (NewPropertyManager.photos || []).length;
        const adatok = [
            d.nm > 0 ? { l: I18n.t(d.tipus === "telek" ? "searchTelekNm" : "detailNm"), v: Utils.nm(d.nm) } : null,
            d.szobak > 0 ? { l: I18n.t("detailSzoba"), v: String(d.szobak) } : null,
            d.emelet !== "" && d.emelet !== null && d.emelet !== undefined ? { l: I18n.t("detailEmelet"), v: CardsView.emelet(d.emelet) } : null
        ].filter(Boolean);

        box.innerHTML = `
            <div class="npCard">
                <div class="npMedia${kep ? "" : " noPhoto"}" data-tipus="${esc(d.tipus || "")}">
                    ${kep ? `<img alt="" data-np-img>` : `<span class="npEmpty"><i class="${t.icon}" aria-hidden="true"></i></span>`}
                    <span class="npChips">
                        <span class="ipChip"><i class="${t.icon}" aria-hidden="true"></i> ${esc(Types.label(d.tipus))}</span>
                        <span class="ipChip isDeal">${esc(Types.ugyletLabel(d.ugylet))}</span>
                        ${typeof NewPanorama !== "undefined" && NewPanorama.lathato() && NewPanorama.lista.length ? `<span class="ipChip isPano"><i class="fa-solid fa-street-view" aria-hidden="true"></i> 360°</span>` : ""}
                    </span>
                    ${kepDb > 1 ? `<span class="npCount"><i class="fa-solid fa-camera" aria-hidden="true"></i> ${kepDb}</span>` : ""}
                </div>
                <div class="npBody">
                    <div class="npPriceRow">
                        <span class="npPrice${d.ar > 0 ? "" : " isEmpty"}">${d.ar > 0 ? esc(Utils.price(d)) : esc(I18n.t("newPreviewNoPrice"))}</span>
                        ${d.ar > 0 && d.nm > 0 ? `<span class="ipPpm">${esc(Utils.eurNm(d.ar / d.nm))}</span>` : ""}
                    </div>
                    <b class="npTitle">${esc(cim)}</b>
                    ${hely ? `<span class="npPlace"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(hely)}</span>` : ""}
                    ${adatok.length ? `<dl class="npSpecs">${adatok.map(a => `<div><dt>${esc(a.l)}</dt><dd>${esc(a.v)}</dd></div>`).join("")}</dl>` : ""}
                </div>
            </div>`;

        // A kép (akár egy nagy feltöltött kép) nem a HTML szövegébe kerül
        const img = box.querySelector("[data-np-img]");
        if (img) {
            img.onerror = () => { const m = img.closest(".npMedia"); if (m) m.classList.add("noPhoto"); img.remove(); };
            img.src = kep;
        }

        // ---------- Kötelező adatok ----------
        const lista = document.getElementById("newCheck");
        lista.innerHTML = kell.map(m => {
            const ok = !hiany.includes(m);
            return `
                <li class="${ok ? "isDone" : ""}">
                    <button type="button" data-field-go="${m}">
                        <span class="ncMark" aria-hidden="true">${ok ? `<i class="fa-solid fa-check"></i>` : ""}</span>
                        <span class="ncText">${esc(NewListingUi.mezoNev(m))}</span>
                        ${ok ? `<span class="visually-hidden">${esc(I18n.t("newStepDone"))}</span>` : `<i class="fa-solid fa-arrow-right ncGo" aria-hidden="true"></i>`}
                    </button>
                </li>`;
        }).join("");

        const szam = document.getElementById("newCheckCount");
        if (szam) szam.textContent = I18n.f("newCheckCount", { a: megvan.length, b: kell.length });

        const doboz = lista.closest(".newCheckBox");
        if (doboz) doboz.classList.toggle("isReady", kell.length > 0 && !hiany.length);

        // ---------- Mentés-sáv: mi hiányzik még ----------
        const jegyzet = document.getElementById("newSaveBarNote");
        if (jegyzet && NewPropertyManager.editId === null) {
            if (hiany.length) {
                const nevek = hiany.slice(0, 3).map(m => I18n.t("field_" + m));
                jegyzet.textContent = I18n.f("newSaveBarMissing", { lista: nevek.join(", ") }) + (hiany.length > 3 ? " " + I18n.f("newSaveBarMore", { n: hiany.length - 3 }) : "");
            } else {
                jegyzet.textContent = I18n.t("newSaveBarReady");
            }
            jegyzet.classList.toggle("isReady", !hiany.length);
        }

    }

}

document.addEventListener("DOMContentLoaded", () => NewListingUi.init());
