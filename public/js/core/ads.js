// ============================================================
//  Reklámfelületek – a weboldal reklámhelyei
//
//  Minden reklámhely a tartalom között van (sosem fölötte), nem ugrik fel,
//  nem takar el semmit, és mindig "Hirdetés" felirat van rajta. Ha egy
//  helyre van futó hirdetés (Admin → Reklámfelületek), az látszik – ha több,
//  a súlyuk szerint váltakoznak –, különben a "Bérelhető reklámfelület"
//  helyőrző (helyenként kikapcsolható).
//
//  A helyek (kulcs: oldal, hol, forma):
//    home_top        Kezdőlap: a nyitókép és a számok alatt        970×250
//    home            Kezdőlap: a funkciók alatt                    970×250
//    list_top        Ingatlanok: a találatok fölött                970×90
//    feed            Ingatlanok: a kártyák között (kártya méret)   300×250
//    feed_wide       Ingatlanok: a 12. kártya után, teljes széles  970×250
//    sidebar         Ingatlanok / Térkép / Piac: a kereső alatt,
//                    görgetéskor is látszik (csak széles képernyőn) 300×600
//    map             Térkép: a térkép alatt                        970×90
//    listing_side    Hirdetés oldala: jobb oldalt                  300×250
//    listing         Hirdetés oldala: a térkép alatt               728×90
//    valuation_side  Értékbecslő: az űrlap alatt                   300×250
//    valuation       Értékbecslő: az eredmény alatt                728×90
//    market_top      Piaci elemzés: a fülek alatt                  970×90
//    market          Piaci elemzés: az oldal alján                 728×90
//    agencies        Ingatlanirodák: jobb oldalt                   300×250
//    requests        Keresek: a lista fölött                       970×90
//
//  Több hirdetés egy helyen: a súlyuk szerint váltakoznak – oldalbetöltésenként,
//  vagy (ha az adminban a helynél be van állítva) néhány másodpercenként a
//  helyen belül is (csak amíg a lap látszik).
//
//  Az oldalakon egy reklámhely: <div data-ad-mount="hely"></div> (vagy
//  AdSlots.slot("hely")) – az AdSlots.mount() tölti ki, és elrejti, ha ott
//  nincs mit mutatni. Beállítás- vagy nyelvváltáskor mind frissül.
//
//  A megjelenést (ha a hirdetés legalább félig látszott 1 mp-ig) és a
//  kattintást a szerver számolja – süti és személyes adat nélkül.
// ============================================================

class AdSlots {

    static FORMAK = {
        billboard: { w: 970, h: 250 },
        csik: { w: 970, h: 90 },
        leaderboard: { w: 728, h: 90 },
        negyzet: { w: 300, h: 250 },
        allo: { w: 300, h: 600 }
    };

    static SLOTS = {
        home_top: { oldal: "home", forma: "billboard" },
        home: { oldal: "home", forma: "billboard" },
        list_top: { oldal: "properties", forma: "csik" },
        feed: { oldal: "properties", forma: "negyzet", kartya: true },
        feed_wide: { oldal: "properties", forma: "billboard" },
        sidebar: { oldal: "properties", forma: "allo" },
        map: { oldal: "map", forma: "csik" },
        listing_side: { oldal: "listing", forma: "negyzet" },
        listing: { oldal: "listing", forma: "leaderboard" },
        valuation_side: { oldal: "valuation", forma: "negyzet" },
        valuation: { oldal: "valuation", forma: "leaderboard" },
        market_top: { oldal: "market", forma: "csik" },
        market: { oldal: "market", forma: "leaderboard" },
        agencies: { oldal: "irodak", forma: "negyzet" },
        requests: { oldal: "igenyek", forma: "csik" }
    };

    // A kártyák között: ennyiedik cella után a kártya méretű, ennyi cella után a
    // széles (12 = 2, 3 és 4 oszlopnál is teli sor), és legalább ennyi találatnál
    static FEED_UTAN = 5;
    static FEED_SZELES_UTAN = 12;
    static FEED_MIN = 8;

    static beallitas() {
        const r = (typeof AuthManager !== "undefined" && AuthManager.config && AuthManager.config.reklam) || {};
        return { mutat: true, helyorzo: true, email: "", helyek: {}, hirdetesek: [], ...r };
    }

    // Reklámmentes csomag (Admin → Pénzügyek → előfizetés): neki nincs reklám
    static reklammentes() {
        return !!(typeof AuthManager !== "undefined" && AuthManager.csomag && AuthManager.csomag.reklammentes);
    }

    static enabled() {
        return AdSlots.beallitas().mutat !== false && !AdSlots.reklammentes();
    }

    static helyAktiv(hely) {
        const b = AdSlots.beallitas();
        return b.mutat !== false && !AdSlots.reklammentes() && !(b.helyek && b.helyek[hely] && b.helyek[hely].aktiv === false);
    }

    static helyorzoKell(hely) {
        const b = AdSlots.beallitas();
        return b.helyorzo !== false && !(b.helyek && b.helyek[hely] && b.helyek[hely].helyorzo === false);
    }

    // Az adott helyre szánt futó hirdetések
    static hirdetesek(hely) {
        return (AdSlots.beallitas().hirdetesek || []).filter(a => Array.isArray(a.helyek) && a.helyek.includes(hely));
    }

    // Több hirdetés egy helyen: a súlyuk szerint, véletlenszerűen
    //  (kiveve: az éppen látszó – a váltáskor ne ugyanaz jöjjön)
    static valaszt(hely, kiveve) {
        let lista = AdSlots.hirdetesek(hely);
        if (kiveve && lista.length > 1) lista = lista.filter(a => a.id !== kiveve);
        if (!lista.length) return null;
        const ossz = lista.reduce((s, a) => s + (a.suly || 1), 0);
        let r = Math.random() * ossz;
        for (const a of lista) { r -= (a.suly || 1); if (r <= 0) return a; }
        return lista[lista.length - 1];
    }

    // Egy reklámhely HTML-je (üres szöveg, ha ott nincs mit mutatni)
    static html(hely) {
        return AdSlots.htmlNyers(hely).trim();
    }

    static htmlNyers(hely, kenyszer) {

        const s = AdSlots.SLOTS[hely];
        if (!s || !AdSlots.helyAktiv(hely)) return "";

        const esc = Utils.escape;
        const a = kenyszer || AdSlots.valaszt(hely);

        if (a) {

            const tag = I18n.t("adTag") + (a.hirdeto ? " · " + a.hirdeto : "");
            const kep = `
                <picture>
                    ${a.kepMobil ? `<source media="(max-width: 767.98px)" srcset="${esc(a.kepMobil)}">` : ""}
                    <img src="${esc(a.kep)}" alt="${esc(a.alt || a.hirdeto || I18n.t("adTag"))}" loading="lazy" decoding="async"${a.w && a.h ? ` width="${Number(a.w)}" height="${Number(a.h)}"` : ""}>
                </picture>`;

            return `
                <aside class="adSlot adReal ad-${s.forma}" data-ad="${hely}" data-ad-id="${Number(a.id)}" aria-label="${esc(I18n.t("adAria"))}">
                    <span class="adTag">${esc(tag)}</span>
                    ${a.link
                        ? `<a class="adLink" href="/api/reklam/${Number(a.id)}/klikk?hely=${encodeURIComponent(hely)}" target="_blank" rel="sponsored noopener">${kep}</a>`
                        : `<div class="adLink">${kep}</div>`}
                </aside>`;

        }

        if (!AdSlots.helyorzoKell(hely)) return "";

        const f = AdSlots.FORMAK[s.forma] || {};
        const helyNev = I18n.t("adPlace_" + hely);
        const meret = `${f.w} × ${f.h}`;

        // "Érdeklődöm": a bérlési kérés űrlapja (AdSlots.kerdez)
        const gomb = `<button type="button" class="btn btn-sm btn-outline-secondary adCta" data-ad-ask="${esc(hely)}">${I18n.t("adContact")}</button>`;

        return `
            <aside class="adSlot adPlaceholder ad-${s.forma}" data-ad="${hely}" aria-label="${esc(I18n.t("adAria"))}">
                <span class="adTag">${I18n.t("adTag")}</span>
                <div class="adInner">
                    <span class="adIcon"><i class="fa-solid fa-bullhorn" aria-hidden="true"></i></span>
                    <div class="adText">
                        <b>${I18n.t("adRentable")}</b>
                        <small>${esc(meret)} · ${esc(helyNev)}</small>
                    </div>
                    ${gomb}
                </div>
            </aside>`;

    }

    // A kártyák közé: a rácsba illő cella / egy teljes széles sor
    static feedCol() {
        const h = AdSlots.html("feed");
        return h ? `<div class="col-sm-6 col-xl-4 col-4k-3 adFeedCol">${h}</div>` : "";
    }

    static feedWideCol() {
        const h = AdSlots.html("feed_wide");
        return h ? `<div class="col-12 adFeedWide">${h}</div>` : "";
    }

    static bind() { /* a kattintás sima link; a megjelenést a figyelő számolja */ }

    // Egy reklámhely a lapba (a mount() frissíti később is)
    static slot(hely, cls = "") {
        const h = AdSlots.html(hely);
        return `<div class="adMount ${cls}" data-ad-mount="${hely}"${h ? "" : " hidden"}>${h}</div>`;
    }

    // Minden reklámhely kitöltése (az oldal fix helyei és a lapok saját helyei)
    static mount(gyoker = document) {
        gyoker.querySelectorAll("[data-ad-mount]").forEach(el => {
            const h = AdSlots.html(el.dataset.adMount);
            el.innerHTML = h;
            el.hidden = !h;
            AdSlots.forgat(el);
        });
    }

    // Váltás a helyen belül (Admin → Reklámfelületek → a helynél: „Váltás”): ha
    // több hirdetés fut ott, X másodpercenként a következő – csak ha a lap látszik
    static valtasMp(hely) {
        const h = (AdSlots.beallitas().helyek || {})[hely] || {};
        return Number(h.valtas) || 0;
    }

    static forgat(el) {
        clearInterval(el._adForgat);
        el._adForgat = null;
        const hely = el.dataset.adMount;
        const mp = AdSlots.valtasMp(hely);
        if (!mp || AdSlots.hirdetesek(hely).length < 2) return;
        el._adForgat = setInterval(() => {
            if (!el.isConnected) { clearInterval(el._adForgat); el._adForgat = null; return; }
            if (document.hidden || el.hidden) return;
            const most = el.querySelector("[data-ad-id]");
            const kov = AdSlots.valaszt(hely, most ? Number(most.dataset.adId) : null);
            if (!kov) return;
            el.innerHTML = AdSlots.htmlNyers(hely, kov).trim();
            const uj = el.querySelector(".adReal");
            if (uj) uj.classList.add("adValt");
        }, Math.max(4, mp) * 1000);
    }

    static mountStatic() {
        AdSlots.mount(document);
        AdSlots.figyelInit();
        if (!AdSlots._kerdesKotve) {
            AdSlots._kerdesKotve = true;
            document.addEventListener("click", e => {
                const b = e.target.closest && e.target.closest("[data-ad-ask]");
                if (b) { e.preventDefault(); AdSlots.kerdez(b.dataset.adAsk); }
            });
        }
    }

    // ---------- Bérlési kérés (a weboldalról) ----------
    //  Ki, melyik hely(ek), mettől, hány hónapra, weboldal, üzenet → /api/reklam/keres
    //  Az admin e-mailt kap, a kérő visszaigazolást; Admin → Reklámfelületek → Bérlési kérések

    static kerdez(hely) {

        const esc = Utils.escape;
        let el = document.getElementById("adAskModal");
        if (!el) {
            el = document.createElement("div");
            el.id = "adAskModal";
            el.className = "modal fade";
            el.tabIndex = -1;
            el.setAttribute("aria-hidden", "true");
            el.setAttribute("aria-labelledby", "adAskTitle");
            el.innerHTML = `<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"></div></div>`;
            document.body.appendChild(el);
        }

        const u = (typeof AuthManager !== "undefined" && AuthManager.user) || {};
        const most = new Date();
        const honapok = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(most.getFullYear(), most.getMonth() + i, 1);
            const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            let n = k;
            try { n = d.toLocaleDateString(I18n.current === "en" ? "en-GB" : I18n.current === "ro" ? "ro-RO" : "hu-HU", { year: "numeric", month: "long" }); } catch (e) { /* */ }
            return { k, n };
        });
        const oldalak = {};
        Object.entries(AdSlots.SLOTS).forEach(([k, s]) => { (oldalak[s.oldal] = oldalak[s.oldal] || []).push(k); });
        const lapNev = o => (typeof PageManager !== "undefined" && PageManager.PAGES && PageManager.PAGES[o]) ? I18n.t(PageManager.PAGES[o].label) : o;

        el.querySelector(".modal-content").innerHTML = `
            <form id="adAskForm" novalidate>
                <div class="modal-header">
                    <h5 class="modal-title" id="adAskTitle"><i class="fa-solid fa-bullhorn" aria-hidden="true"></i> ${I18n.t("adAskTitle")}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${esc(I18n.t("close") || "×")}"></button>
                </div>
                <div class="modal-body">
                    <p class="small text-body-secondary">${I18n.t("adAskIntro")}</p>
                    <div class="row g-3">
                        <div class="col-md-6"><label class="form-label" for="adAskNev">${I18n.t("adAskName")} *</label>
                            <input class="form-control" id="adAskNev" maxlength="120" required autocomplete="name" value="${esc(u.nev || u.name || "")}"></div>
                        <div class="col-md-6"><label class="form-label" for="adAskCeg">${I18n.t("adAskCompany")}</label>
                            <input class="form-control" id="adAskCeg" maxlength="160" autocomplete="organization"></div>
                        <div class="col-md-6"><label class="form-label" for="adAskEmail">${I18n.t("adAskEmail")} *</label>
                            <input type="email" class="form-control" id="adAskEmail" maxlength="160" required autocomplete="email" value="${esc(u.email || "")}"></div>
                        <div class="col-md-6"><label class="form-label" for="adAskTel">${I18n.t("adAskPhone")}</label>
                            <input type="tel" class="form-control" id="adAskTel" maxlength="40" autocomplete="tel" value="${esc(u.telefon || "")}"></div>
                        <div class="col-md-6"><label class="form-label" for="adAskCui">${I18n.t("adAskCui")}</label>
                            <div class="input-group">
                                <input class="form-control" id="adAskCui" maxlength="20" placeholder="RO12345678">
                                <button type="button" class="btn btn-outline-secondary" id="adAskAnaf" title="${esc(I18n.t("adAskAnafHint"))}"><i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i> ANAF</button>
                            </div>
                            <div class="form-text" id="adAskAnafMsg">${I18n.t("adAskAnafHelp")}</div></div>
                        <div class="col-md-12"><label class="form-label" for="adAskCim">${I18n.t("adAskAddress")}</label>
                            <input class="form-control" id="adAskCim" maxlength="400" autocomplete="street-address"></div>
                        <div class="col-md-6"><label class="form-label" for="adAskVaros">${I18n.t("adAskCity")}</label>
                            <input class="form-control" id="adAskVaros" maxlength="80" autocomplete="address-level2"></div>
                        <div class="col-md-6"><label class="form-label" for="adAskMegye">${I18n.t("adAskCounty")}</label>
                            <select class="form-select" id="adAskMegye"><option value="">–</option>${(typeof PricingPage !== "undefined" && PricingPage.MEGYEK ? PricingPage.MEGYEK : []).map(([k, n]) => `<option value="RO-${k}">${esc(n)}</option>`).join("")}</select></div>
                        <div class="col-md-6"><label class="form-label" for="adAskWeb">${I18n.t("adAskWeb")}</label>
                            <input type="url" class="form-control" id="adAskWeb" maxlength="300" placeholder="https://"></div>
                        <div class="col-12">
                            <span class="form-label d-block">${I18n.t("adAskPlaces")}</span>
                            <div class="adAskPlaces">
                                ${Object.entries(oldalak).map(([o, helyek]) => `
                                    <fieldset class="adAskGroup"><legend>${esc(lapNev(o))}</legend>
                                        ${helyek.map(k => {
                                            const f = AdSlots.FORMAK[AdSlots.SLOTS[k].forma] || {};
                                            return `<div class="form-check"><input class="form-check-input" type="checkbox" id="adAsk_${k}" value="${k}" ${k === hely ? "checked" : ""}>
                                                <label class="form-check-label small" for="adAsk_${k}">${esc(I18n.t("adPlace_" + k))} <span class="text-body-secondary">${f.w}×${f.h}</span>
                                                <span class="adAskPrice" data-ask-ar="${k}"></span></label></div>`;
                                        }).join("")}
                                    </fieldset>`).join("")}
                            </div>
                        </div>
                        <div class="col-md-6"><label class="form-label" for="adAskKezdet">${I18n.t("adAskStart")}</label>
                            <select class="form-select" id="adAskKezdet">${honapok.map((h, i) => `<option value="${h.k}" ${i === 1 ? "selected" : ""}>${esc(h.n)}</option>`).join("")}</select></div>
                        <div class="col-md-6"><label class="form-label" for="adAskHonap">${I18n.t("adAskMonths")}</label>
                            <select class="form-select" id="adAskHonap">${[1, 2, 3, 6, 12].map(n => `<option value="${n}">${I18n.f("adAskMonthsN", { n })}</option>`).join("")}</select></div>
                        <div class="col-12"><div class="adAskTotal small" id="adAskTotal" aria-live="polite"></div></div>
                        <div class="col-12"><label class="form-label" for="adAskMsg">${I18n.t("adAskMessage")}</label>
                            <textarea class="form-control" id="adAskMsg" rows="3" maxlength="3000" placeholder="${esc(I18n.t("adAskMessagePh"))}"></textarea></div>
                        <div class="adAskHp" aria-hidden="true"><label for="adAskWeb2">Web</label><input id="adAskWeb2" tabindex="-1" autocomplete="off"></div>
                        <div class="col-12"><div class="form-check">
                            <input class="form-check-input" type="checkbox" id="adAskOk" required>
                            <label class="form-check-label small" for="adAskOk">${I18n.t("adAskConsent")}</label>
                        </div></div>
                    </div>
                    <div class="alert alert-danger mt-3 mb-0" id="adAskErr" hidden></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${I18n.t("adAskCancel")}</button>
                    <button type="submit" class="btn btn-primary" id="adAskSend"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> ${I18n.t("adAskSend")}</button>
                </div>
            </form>`;

        const $ = id => document.getElementById(id);
        const modal = bootstrap.Modal.getOrCreateInstance(el);

        // Árak és foglaltság a választott hónapokra (/api/reklam/arlista)
        const arlista = () => {
            const kezdet = $("adAskKezdet").value, honap = Number($("adAskHonap").value) || 1;
            fetch(`/api/reklam/arlista?kezdet=${encodeURIComponent(kezdet)}&honap=${honap}`, { cache: "no-store" })
                .then(r => r.ok ? r.json() : null)
                .then(v => {
                    if (!v || !v.helyek) return;
                    AdSlots._arlista = v;
                    el.querySelectorAll("[data-ask-ar]").forEach(sp => {
                        const k = sp.dataset.askAr, h = v.helyek[k] || {};
                        const cb = $("adAsk_" + k);
                        sp.innerHTML = !h.szabad
                            ? ` <span class="badge text-bg-secondary">${esc(I18n.t("adAskTaken"))}</span>`
                            : h.ar ? ` <span class="badge text-bg-light">${esc(Utils.num(h.ar))} ${esc(v.penznem)}${esc(I18n.t("adAskPerMonth"))}</span>` : "";
                        if (cb) { cb.disabled = !h.szabad; if (!h.szabad) cb.checked = false; }
                    });
                    osszeg();
                })
                .catch(() => { });
        };
        const osszeg = () => {
            const v = AdSlots._arlista, box = $("adAskTotal");
            if (!v || !box) return;
            const kiv = [...el.querySelectorAll(".adAskPlaces input:checked")].map(c => c.value);
            const honap = Number($("adAskHonap").value) || 1;
            const arak = kiv.map(k => (v.helyek[k] || {}).ar);
            box.innerHTML = kiv.length && v.arak_mutat && arak.every(a => a > 0)
                ? `<i class="fa-solid fa-calculator" aria-hidden="true"></i> ${esc(I18n.f("adAskTotalN", { havi: Utils.num(arak.reduce((x, y) => x + y, 0)) + " " + v.penznem, n: honap, ossz: Utils.num(arak.reduce((x, y) => x + y, 0) * honap) + " " + v.penznem }))}`
                : "";
        };
        $("adAskKezdet").onchange = arlista;
        $("adAskHonap").onchange = arlista;
        el.querySelectorAll(".adAskPlaces input").forEach(c => c.addEventListener("change", osszeg));
        arlista();

        // Cégadatok az adószám alapján (ANAF)
        $("adAskAnaf").onclick = () => {
            const cui = $("adAskCui").value.trim(), msg = $("adAskAnafMsg"), g = $("adAskAnaf");
            if (!cui) { $("adAskCui").focus(); return; }
            g.disabled = true;
            msg.textContent = "…";
            fetch("/api/reklam/ceg/" + encodeURIComponent(cui))
                .then(r => r.json().then(v => ({ ok: r.ok, v })))
                .then(({ ok, v }) => {
                    if (!ok || !v.talalt) { msg.textContent = I18n.t(v && v.error === "bad_cui" ? "adAskAnafBad" : ok ? "adAskAnafNotFound" : "adAskAnafErr"); return; }
                    if (v.nev) $("adAskCeg").value = v.nev;
                    if (v.cim) $("adAskCim").value = v.cim;
                    if (v.varos) $("adAskVaros").value = v.varos;
                    if (v.megye) $("adAskMegye").value = v.megye;
                    msg.textContent = I18n.t(v.aktiv === false ? "adAskAnafInactive" : "adAskAnafOk");
                })
                .catch(() => { msg.textContent = I18n.t("adAskAnafErr"); })
                .finally(() => { g.disabled = false; });
        };

        $("adAskForm").onsubmit = e => {
            e.preventDefault();
            const err = $("adAskErr");
            err.hidden = true;
            const hiba = t => { err.textContent = t; err.hidden = false; };
            const body = {
                nev: $("adAskNev").value.trim(),
                ceg: $("adAskCeg").value.trim(),
                email: $("adAskEmail").value.trim(),
                telefon: $("adAskTel").value.trim(),
                cui: $("adAskCui").value.trim(),
                cim: $("adAskCim").value.trim(),
                varos: $("adAskVaros").value.trim(),
                megye: $("adAskMegye").value,
                weboldal: $("adAskWeb").value.trim(),
                helyek: [...el.querySelectorAll(".adAskPlaces input:checked")].map(c => c.value),
                kezdet: $("adAskKezdet").value,
                honap: Number($("adAskHonap").value) || 1,
                uzenet: $("adAskMsg").value.trim(),
                web2: $("adAskWeb2").value,
                nyelv: I18n.current
            };
            if (!body.nev) return hiba(I18n.t("adAskErr_name_required"));
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email)) return hiba(I18n.t("adAskErr_bad_email"));
            if (!body.helyek.length && !body.uzenet) return hiba(I18n.t("adAskErr_places"));
            if (!$("adAskOk").checked) return hiba(I18n.t("adAskErr_consent"));
            const g = $("adAskSend");
            g.disabled = true;
            fetch("/api/reklam/keres", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
                .then(r => r.json().catch(() => ({})).then(v => { if (!r.ok) { const x = new Error(v.error || "x"); x.kod = v.error; throw x; } return v; }))
                .then(() => {
                    el.querySelector(".modal-body").innerHTML = `
                        <div class="emptyState py-4">
                            <i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i>
                            <h5>${I18n.t("adAskDoneTitle")}</h5>
                            <p>${I18n.t("adAskDone")}</p>
                        </div>`;
                    el.querySelector(".modal-footer").innerHTML = `<button type="button" class="btn btn-primary" data-bs-dismiss="modal">${I18n.t("adAskClose")}</button>`;
                })
                .catch(x => {
                    g.disabled = false;
                    const k = "adAskErr_" + (x.kod || "");
                    hiba(x.kod && I18n.t(k) !== k ? I18n.t(k) : I18n.t("alertSaveError"));
                });
        };

        modal.show();

    }

    // Beállítás változott / nyelvváltás: minden reklámhely újra
    // (a kártyák közöttiek a kártyákkal együtt)
    static refresh() {
        AdSlots.mountStatic();
        if (typeof CardsView !== "undefined" && CardsView.lista) CardsView.render(CardsView.lista);
    }

    // ---------- Megjelenések számolása ----------
    //  Ha egy valódi hirdetés legalább félig látszik 1 másodpercig, egyszer
    //  számít (oldalanként, helyenként); pár másodpercenként egyben küldjük.

    static figyelInit() {

        if (AdSlots._io || typeof IntersectionObserver === "undefined" || typeof MutationObserver === "undefined") return;

        AdSlots._sor = [];
        AdSlots._latott = new Set();

        AdSlots._io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                const el = e.target;
                if (e.isIntersecting && e.intersectionRatio >= 0.5) {
                    if (!el._adIdozito) el._adIdozito = setTimeout(() => {
                        el._adIdozito = null;
                        if (!el.isConnected) return;
                        const k = `${el.dataset.adId}|${el.dataset.ad}|${location.hash}`;
                        if (!AdSlots._latott.has(k)) {
                            AdSlots._latott.add(k);
                            AdSlots._sor.push({ id: Number(el.dataset.adId), hely: el.dataset.ad });
                            AdSlots.kuld();
                        }
                        AdSlots._io.unobserve(el);
                    }, 1000);
                } else if (el._adIdozito) {
                    clearTimeout(el._adIdozito);
                    el._adIdozito = null;
                }
            });
        }, { threshold: [0, 0.5] });

        const figyel = gyoker => {
            (gyoker.querySelectorAll ? gyoker.querySelectorAll("[data-ad-id]") : []).forEach(el => {
                if (el._adFigyelt) return;
                el._adFigyelt = true;
                AdSlots._io.observe(el);
            });
        };

        figyel(document);

        new MutationObserver(lista => {
            lista.forEach(m => m.addedNodes.forEach(n => {
                if (n.nodeType !== 1) return;
                // a lapok saját reklámhelyei (AdSlots.slot): a váltás itt indul
                if (n.matches && n.matches("[data-ad-mount]")) { if (!n._adForgat) AdSlots.forgat(n); }
                else if (n.querySelectorAll) n.querySelectorAll("[data-ad-mount]").forEach(x => { if (!x._adForgat) AdSlots.forgat(x); });
                if (n.matches && n.matches("[data-ad-id]")) figyel(n.parentElement || document);
                else figyel(n);
            }));
        }).observe(document.body, { childList: true, subtree: true });

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") AdSlots.kuld(true);
        });

        // Másik oldalra lépve ugyanaz a hirdetés újra számíthat
        window.addEventListener("hashchange", () => { AdSlots._latott = new Set(); });

    }

    static kuld(azonnal) {

        clearTimeout(AdSlots._kuldIdozito);

        const megy = () => {
            if (!AdSlots._sor.length) return;
            const lista = AdSlots._sor.splice(0, 40);
            const body = JSON.stringify({ lista });
            try {
                if (navigator.sendBeacon && navigator.sendBeacon("/api/reklam/megjelenes", new Blob([body], { type: "application/json" }))) return;
            } catch (e) { /* a fetch-csel próbáljuk */ }
            fetch("/api/reklam/megjelenes", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => { });
        };

        if (azonnal) megy();
        else AdSlots._kuldIdozito = setTimeout(megy, 3000);

    }

}
