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

    static enabled() {
        return AdSlots.beallitas().mutat !== false;
    }

    static helyAktiv(hely) {
        const b = AdSlots.beallitas();
        return b.mutat !== false && !(b.helyek && b.helyek[hely] && b.helyek[hely].aktiv === false);
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
    static valaszt(hely) {
        const lista = AdSlots.hirdetesek(hely);
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

    static htmlNyers(hely) {

        const s = AdSlots.SLOTS[hely];
        if (!s || !AdSlots.helyAktiv(hely)) return "";

        const esc = Utils.escape;
        const a = AdSlots.valaszt(hely);

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
        const email = AdSlots.beallitas().email || "";
        const helyNev = I18n.t("adPlace_" + hely);
        const meret = `${f.w} × ${f.h}`;
        const targy = encodeURIComponent(I18n.f("adMailSubject", { hely: helyNev }));

        const gomb = email
            ? `<a class="btn btn-sm btn-outline-secondary adCta" href="mailto:${esc(email)}?subject=${targy}">${I18n.t("adContact")}</a>`
            : `<a class="btn btn-sm btn-outline-secondary adCta" href="#jogi/impresszum">${I18n.t("adContact")}</a>`;

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
        });
    }

    static mountStatic() {
        AdSlots.mount(document);
        AdSlots.figyelInit();
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
