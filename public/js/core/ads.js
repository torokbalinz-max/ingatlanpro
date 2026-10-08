// ============================================================
//  Reklámfelületek (egyelőre helyőrzők: "Bérelhető reklámfelület")
//
//  A szokásos helyeken, úgy, hogy SEMMIT ne takarjanak el az oldal
//  funkcióiból: nem ugranak fel, nem lógnak rá a tartalomra, nem
//  tolják le a keresőt vagy a találatokat, és mindig "Hirdetés"
//  felirat van rajtuk.
//
//    home       Kezdőlap: a kategóriák alatt (970×250, telefonon kisebb)
//    sidebar    Ingatlanok / Térkép / Piac: a kereső doboz alatt (300×250,
//               csak széles képernyőn – telefonon nem foglal helyet)
//    feed       A hirdetéskártyák között: a 6. kártya után, oldalanként
//               egyszer, csak ha legalább 8 találat van az oldalon
//    listing    Egy hirdetés oldala: a térkép alatt (728×90)
//    valuation  Értékbecslő: az eredmény és a hasonlók táblázata között (728×90)
//    market     Piaci elemzés: az oldal alján (728×90)
//
//  Kikapcsolni (és az érdeklődők e-mail címét megadni):
//  Admin → Webhely adatai → Reklámfelületek.
//  Valódi hirdetéshez a html()-ben a helyőrző helyére kerül a kód.
// ============================================================

class AdSlots {

    static SLOTS = {
        home: { meret: "970 × 250", forma: "billboard" },
        sidebar: { meret: "300 × 250", forma: "rectangle" },
        feed: { meret: "", forma: "card" },
        listing: { meret: "728 × 90", forma: "leaderboard" },
        valuation: { meret: "728 × 90", forma: "leaderboard" },
        market: { meret: "728 × 90", forma: "leaderboard" }
    };

    // A kártyák között: ennyiedik kártya után, és legalább ennyi találatnál az oldalon
    static FEED_UTAN = 6;
    static FEED_MIN = 8;

    static beallitas() {
        return (typeof AuthManager !== "undefined" && AuthManager.config && AuthManager.config.reklam) || { mutat: true, email: "" };
    }

    static enabled() {
        return AdSlots.beallitas().mutat !== false;
    }

    // Egy helyőrző HTML-je (üres szöveg, ha ki vannak kapcsolva)
    static html(hely) {

        if (!AdSlots.enabled()) return "";

        const s = AdSlots.SLOTS[hely];
        if (!s) return "";

        const esc = Utils.escape;
        const email = AdSlots.beallitas().email || "";
        const helyNev = I18n.t("adPlace_" + hely);
        const meret = hely === "feed" ? I18n.t("adSizeCard") : s.meret;
        const targy = encodeURIComponent(I18n.f("adMailSubject", { hely: helyNev }));

        const gomb = email
            ? `<a class="btn btn-sm btn-outline-secondary adCta" href="mailto:${esc(email)}?subject=${targy}">${I18n.t("adContact")}</a>`
            : `<a class="btn btn-sm btn-outline-secondary adCta" href="#jogi/impresszum">${I18n.t("adContact")}</a>`;

        return `
            <aside class="adSlot ad-${s.forma}" data-ad="${hely}" aria-label="${esc(I18n.t("adAria"))}">
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

    // A kártyák közé: a rácsba illő oszlop
    static feedCol() {
        const h = AdSlots.html("feed");
        return h ? `<div class="col-sm-6 col-xl-4 col-4k-3 adFeedCol">${h}</div>` : "";
    }

    static bind() { /* a helyőrzőkhöz nem kell esemény (a gomb sima link) */ }

    // Az oldal fix helyei (a kereső alatt, a piaci oldal alján)
    static mountStatic() {
        [["adSearchSide", "sidebar"], ["adMarketBottom", "market"]].forEach(([id, hely]) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = AdSlots.html(hely);
            el.hidden = !el.innerHTML.trim();
        });
    }

    // Beállítás változott / nyelvváltás: minden helyőrző újra
    static refresh() {
        AdSlots.mountStatic();
        if (typeof CardsView !== "undefined" && CardsView.lista) CardsView.render(CardsView.lista);
        if (typeof PageManager !== "undefined") {
            if (PageManager.current === "home" && typeof HomePage !== "undefined") HomePage.render();
            if (PageManager.current === "listing" && typeof ListingPage !== "undefined") ListingPage.rerender();
            if (PageManager.current === "valuation" && typeof ValuationManager !== "undefined") ValuationManager.rerender();
        }
    }

}
