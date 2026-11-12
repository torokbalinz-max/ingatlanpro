// ============================================================
//  Részletes statisztika és PDF-export
//
//  Amíg az admin nem kapcsolja be, hogy a részletes statisztika csak
//  csomaggal jár (Admin → Pénzügy → Beállítások → Fizetős funkciók),
//  mindenki mindent lát. Bekapcsolva:
//    - alap (mindenkinek): a jelenlegi piac fő számai
//    - részletes (csomaggal): bontások, legjobb ár/m², előzmények,
//      ártrend és összevetés, PDF-export; a hirdetések részletes
//      látogatottsága
//  A szerver is ellenőriz (/api/statistics/jog, 402 pro_required).
//
//  PDF: a kiválasztott rész nyomtatható változata (fejléccel, a
//  szűréssel, dátummal) – a böngésző nyomtatási ablakában
//  „Mentés PDF-ként”. A grafikonok képként kerülnek bele.
// ============================================================

class StatPro {

    static jog = { fizetos: false, pro: true };
    static betoltve = 0;

    // A jogosultság (30 mp-ig gyorsítótárazva; belépéskor / kilépéskor újra)
    static betolt(friss = false) {
        if (!friss && Date.now() - StatPro.betoltve < 30000) return Promise.resolve(StatPro.jog);
        return fetch("/api/statistics/jog")
            .then(r => r.ok ? r.json() : StatPro.jog)
            .then(j => { StatPro.jog = { fizetos: !!j.fizetos, pro: j.pro !== false }; StatPro.betoltve = Date.now(); return StatPro.jog; })
            .catch(() => StatPro.jog);
    }

    static pro() {
        return StatPro.jog.pro !== false;
    }

    // A zárolt rész helyén: mi van benne, és hogyan érhető el
    static zar(cimKulcs, szovegKulcs) {
        const belepve = typeof AuthManager !== "undefined" && AuthManager.loggedIn();
        return `
            <div class="statLock">
                <span class="statLockIcon" aria-hidden="true"><i class="fa-solid fa-lock"></i></span>
                <div class="flex-fill">
                    <b>${I18n.t(cimKulcs || "spLockTitle")}</b>
                    <p class="small mb-2">${I18n.t(szovegKulcs || "spLockText")}</p>
                    <ul class="small mb-0 statLockList">
                        <li>${I18n.t("spLockItem1")}</li>
                        <li>${I18n.t("spLockItem2")}</li>
                        <li>${I18n.t("spLockItem3")}</li>
                        <li>${I18n.t("spLockItem4")}</li>
                    </ul>
                </div>
                <div class="d-flex flex-column gap-2">
                    <a class="btn btn-primary btn-sm" href="#csomagok">${I18n.t("spLockBtn")} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
                    ${belepve ? "" : `<button type="button" class="btn btn-outline-secondary btn-sm" data-sp-login>${I18n.t("spLockLogin")}</button>`}
                </div>
            </div>`;
    }

    static zarKot(root) {
        (root || document).querySelectorAll("[data-sp-login]").forEach(b => {
            b.onclick = () => AuthManager.open("login");
        });
    }

    // PDF gomb (zárolt állapotban lakat, a Csomagokra visz)
    static gomb(id, kulcs = "spPdf") {
        if (!StatPro.pro()) {
            return `<a class="btn btn-sm btn-outline-secondary" href="#csomagok" title="${Utils.escape(I18n.t("spPdfLocked"))}"><i class="fa-solid fa-lock" aria-hidden="true"></i> ${I18n.t(kulcs)}</a>`;
        }
        return `<button type="button" class="btn btn-sm btn-outline-primary" id="${id}" title="${Utils.escape(I18n.t("spPdfHint"))}"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> ${I18n.t(kulcs)}</button>`;
    }

    // ---------- PDF (nyomtatható nézet) ----------
    // opts: { cim, alcim, el: a kinyomtatandó elem, megjegyzes }
    static pdf(opts) {

        const forras = opts.el;
        if (!forras) return;
        const esc = Utils.escape;

        const masolat = forras.cloneNode(true);

        // A grafikonok (canvas) képként – a klónban üres lenne
        const eredeti = forras.querySelectorAll("canvas");
        masolat.querySelectorAll("canvas").forEach((c, n) => {
            const o = eredeti[n];
            if (!o) return;
            try {
                const img = document.createElement("img");
                img.src = o.toDataURL("image/png");
                img.alt = o.getAttribute("aria-label") || "";
                img.className = "spChartImg";
                c.replaceWith(img);
            } catch (e) { c.remove(); }
        });

        // Ami nyomtatásban felesleges: gombok, űrlapok, reklám, lakatos dobozok
        masolat.querySelectorAll("button, .btn, select, input, textarea, .adMount, .statLock, [data-noprint]").forEach(x => x.remove());

        let box = document.getElementById("spPrint");
        if (box) box.remove();
        box = document.createElement("div");
        box.id = "spPrint";
        const ido = new Date().toLocaleString(I18n.current === "hu" ? "hu-HU" : I18n.current === "en" ? "en-GB" : "ro-RO");
        box.innerHTML = `
            <header class="spPrintHead">
                <div>
                    <div class="spPrintBrand">IngatlanPro</div>
                    <h1>${esc(opts.cim || I18n.t("statsTitle"))}</h1>
                    ${opts.alcim ? `<p>${esc(opts.alcim)}</p>` : ""}
                </div>
                <div class="spPrintMeta">${esc(ido)}<br>${esc(location.host)}</div>
            </header>
            <div class="spPrintBody"></div>
            <footer class="spPrintFoot">${esc(opts.megjegyzes || I18n.t("spPdfFooter"))}</footer>`;
        box.querySelector(".spPrintBody").appendChild(masolat);
        document.body.appendChild(box);
        document.body.classList.add("spPrinting");

        const vege = () => {
            document.body.classList.remove("spPrinting");
            const b = document.getElementById("spPrint");
            if (b) b.remove();
            window.removeEventListener("afterprint", vege);
        };
        window.addEventListener("afterprint", vege);

        // a képek betöltése után
        setTimeout(() => {
            try { window.print(); } catch (e) { vege(); }
        }, 150);

    }

    // A szűrés szövegesen (a PDF alcíméhez)
    static szuresSzoveg() {
        try {
            const tmp = document.createElement("div");
            tmp.innerHTML = FilterManager.describe().join(" · ");
            return tmp.textContent;
        } catch (e) { return ""; }
    }

}
