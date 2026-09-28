// ============================================================
//  Süti-hozzájárulás (EU ePrivacy irányelv, román 506/2004 tv. 4. cikk,
//  GDPR 7. cikk)
//
//  - A feltétlenül szükséges sütikhez nem kell hozzájárulás.
//  - Minden más kategóriát (most: Google-belépés) csak akkor töltünk be,
//    ha a látogató engedélyezte. Az „Elfogadom” és a „Csak a szükségesek”
//    gomb egyformán hangsúlyos (EDPB iránymutatás).
//  - A választás 12 hónapig érvényes, utána újra megkérdezzük; ha a
//    kategóriák változnak (VERZIO), szintén.
//  - A választást a szerver naplózza (véletlen azonosítóval, IP nélkül),
//    hogy igazolható legyen.
//
//  Használat máshol:
//     ConsentManager.allowed("google")       -> true / false
//     ConsentManager.set({ google: true })    -> egy kategória engedélyezése
//     ConsentManager.onChange(fn)             -> értesítés változáskor
//     ConsentManager.openSettings()           -> beállítások ablak
//
//  Új kategória (pl. statisztika) felvétele: a KATEGORIAK listába, a
//  VERZIO növelésével, és a szövegekhez (i18n-legal.js) és a
//  Süti-tájékoztatóhoz (legalTexts.js).
// ============================================================

class ConsentManager {

    static KULCS = "ipConsent";
    static VERZIO = "1";
    static ERVENYES_NAP = 365;

    // Nem kötelező kategóriák (a szükségesek mindig aktívak)
    static KATEGORIAK = [
        { id: "google", cim: "ckGoogle", leiras: "ckGoogleDesc" }
    ];

    static allapot = null;
    static figyelok = [];

    static init() {

        ConsentManager.allapot = ConsentManager.olvas();

        // Linkek / gombok bárhol az oldalon: data-consent-open
        document.addEventListener("click", e => {
            const b = e.target.closest("[data-consent-open]");
            if (b) {
                e.preventDefault();
                ConsentManager.openSettings();
            }
        });

        if (!ConsentManager.allapot) ConsentManager.showBanner();

        I18n.onChange(() => {
            if (document.getElementById("cookieBanner")) ConsentManager.showBanner();
        });

    }

    static olvas() {

        try {
            const a = JSON.parse(localStorage.getItem(ConsentManager.KULCS) || "null");
            if (!a || a.v !== ConsentManager.VERZIO) return null;
            if (Date.now() - new Date(a.ido).getTime() > ConsentManager.ERVENYES_NAP * 86400000) return null;
            return a;
        } catch (e) {
            return null;
        }

    }

    static allowed(kategoria) {
        return !!(ConsentManager.allapot && ConsentManager.allapot.k && ConsentManager.allapot.k[kategoria]);
    }

    static onChange(fn) {
        ConsentManager.figyelok.push(fn);
    }

    // valasztas: { google: true/false, ... } – a hiányzó kategória marad a régi (vagy false)
    static set(valasztas) {

        const regi = (ConsentManager.allapot && ConsentManager.allapot.k) || {};
        const k = {};

        ConsentManager.KATEGORIAK.forEach(kat => {
            k[kat.id] = valasztas[kat.id] !== undefined ? !!valasztas[kat.id] : !!regi[kat.id];
        });

        const azonosito = (ConsentManager.allapot && ConsentManager.allapot.id)
            || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

        ConsentManager.allapot = { v: ConsentManager.VERZIO, ido: new Date().toISOString(), id: azonosito, k };

        try { localStorage.setItem(ConsentManager.KULCS, JSON.stringify(ConsentManager.allapot)); } catch (e) { /* privát böngészés */ }

        // Naplózás a szerveren (nem kritikus)
        fetch("/api/jogi/suti", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ azonosito, valasztas: k, verzio: ConsentManager.VERZIO })
        }).catch(() => { });

        ConsentManager.hideBanner();

        ConsentManager.figyelok.forEach(fn => { try { fn(k); } catch (e) { console.error(e); } });

    }

    static acceptAll() {
        const v = {};
        ConsentManager.KATEGORIAK.forEach(k => { v[k.id] = true; });
        ConsentManager.set(v);
    }

    static rejectAll() {
        const v = {};
        ConsentManager.KATEGORIAK.forEach(k => { v[k.id] = false; });
        ConsentManager.set(v);
    }

    // ---------- sáv ----------

    static showBanner() {

        let el = document.getElementById("cookieBanner");

        if (!el) {
            el = document.createElement("div");
            el.id = "cookieBanner";
            el.className = "cookieBanner";
            el.setAttribute("role", "dialog");
            el.setAttribute("aria-live", "polite");
            el.setAttribute("aria-labelledby", "cookieBannerTitle");
            document.body.appendChild(el);
        }

        el.innerHTML = `
            <div class="cookieBannerInner">
                <div class="cookieBannerText">
                    <b id="cookieBannerTitle"><i class="fa-solid fa-cookie-bite" aria-hidden="true"></i> ${I18n.t("ckTitle")}</b>
                    <p class="mb-0">${I18n.t("ckText")} <a href="#jogi/sutik" data-legal-modal="sutik">${I18n.t("ckMore")}</a></p>
                </div>
                <div class="cookieBannerBtns">
                    <button type="button" class="btn btn-outline-secondary btn-sm" data-ck="settings">${I18n.t("ckSettings")}</button>
                    <button type="button" class="btn btn-primary btn-sm" data-ck="reject">${I18n.t("ckRejectAll")}</button>
                    <button type="button" class="btn btn-primary btn-sm" data-ck="accept">${I18n.t("ckAcceptAll")}</button>
                </div>
            </div>`;

        el.querySelector('[data-ck="accept"]').onclick = () => ConsentManager.acceptAll();
        el.querySelector('[data-ck="reject"]').onclick = () => ConsentManager.rejectAll();
        el.querySelector('[data-ck="settings"]').onclick = () => ConsentManager.openSettings();

        document.body.classList.add("has-cookie-banner");

    }

    static hideBanner() {
        const el = document.getElementById("cookieBanner");
        if (el) el.remove();
        document.body.classList.remove("has-cookie-banner");
    }

    // ---------- beállítások ablak ----------

    static openSettings() {

        let el = document.getElementById("cookieModal");

        if (!el) {
            el = document.createElement("div");
            el.id = "cookieModal";
            el.className = "modal fade";
            el.tabIndex = -1;
            el.setAttribute("aria-labelledby", "cookieModalTitle");
            el.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content"></div></div>`;
            document.body.appendChild(el);
        }

        const kat = ConsentManager.KATEGORIAK.map(k => `
            <div class="ckCat">
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" id="ck_${k.id}" data-kat="${k.id}" ${ConsentManager.allowed(k.id) ? "checked" : ""}>
                    <label class="form-check-label fw-semibold" for="ck_${k.id}">${I18n.t(k.cim)}</label>
                </div>
                <p class="small text-body-secondary mb-0">${I18n.t(k.leiras)}</p>
            </div>`).join("");

        el.querySelector(".modal-content").innerHTML = `
            <div class="modal-header">
                <h5 class="modal-title" id="cookieModalTitle">${I18n.t("ckSettingsTitle")}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="${I18n.t("close")}"></button>
            </div>
            <div class="modal-body">
                <div class="ckCat">
                    <div class="d-flex justify-content-between align-items-center gap-2">
                        <span class="fw-semibold">${I18n.t("ckNecessary")}</span>
                        <span class="badge text-bg-secondary">${I18n.t("ckAlways")}</span>
                    </div>
                    <p class="small text-body-secondary mb-0">${I18n.t("ckNecessaryDesc")}</p>
                </div>
                ${kat}
                <p class="small mb-0 mt-3"><a href="#jogi/sutik" data-legal-modal="sutik">${I18n.t("ckMore")}</a></p>
            </div>
            <div class="modal-footer ckFooter">
                <button type="button" class="btn btn-outline-secondary" data-ck="save">${I18n.t("ckSave")}</button>
                <button type="button" class="btn btn-primary" data-ck="reject">${I18n.t("ckRejectAll")}</button>
                <button type="button" class="btn btn-primary" data-ck="accept">${I18n.t("ckAcceptAll")}</button>
            </div>`;

        const modal = bootstrap.Modal.getOrCreateInstance(el);

        const kesz = fn => () => { fn(); modal.hide(); };

        el.querySelector('[data-ck="accept"]').onclick = kesz(() => ConsentManager.acceptAll());
        el.querySelector('[data-ck="reject"]').onclick = kesz(() => ConsentManager.rejectAll());
        el.querySelector('[data-ck="save"]').onclick = kesz(() => {
            const v = {};
            el.querySelectorAll("[data-kat]").forEach(i => { v[i.dataset.kat] = i.checked; });
            ConsentManager.set(v);
        });

        modal.show();

    }

}
