// ============================================================
//  Közös segédfüggvények (formázás, statisztika, állapotok)
// ============================================================

class Utils {

    // A téma kiemelő színe (a térképi jelölőkhöz)
    static accent() {
        try {
            return getComputedStyle(document.documentElement).getPropertyValue("--ip-accent").trim() || "#1f6f5c";
        } catch (e) {
            return "#1f6f5c";
        }
    }

    // A hely pontossága: pontos / utca / közelítő / nincs megadva
    static helySzint(i) {
        return i.hely_pontossag || (i.x && i.y ? "pontos" : "nincs");
    }

    static helyBadge(i) {
        const s = Utils.helySzint(i);
        if (s === "pontos") return "";
        const ikon = s === "nincs" ? "fa-location-crosshairs" : "fa-location-dot";
        return `<span class="helyBadge hely-${s}"><i class="fa-solid ${ikon}" aria-hidden="true"></i> ${I18n.t("hely_" + s)}</span>`;
    }

    // ----- Formázás -----

    static locale() {
        return { en: "en-GB", hu: "hu-HU", ro: "ro-RO" }[I18n.current] || "en-GB";
    }

    static num(value, digits = 0) {
        if (value === null || value === undefined || isNaN(value)) return "-";
        return Number(value).toLocaleString(Utils.locale(), {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits
        });
    }

    static eur(value) {
        if (value === null || value === undefined || isNaN(value)) return "-";
        return Utils.num(Math.round(value)) + " €";
    }

    static eurNm(value) {
        if (value === null || value === undefined || isNaN(value)) return "-";
        // Bérleti díjnál (pl. 7,4 €/m²) egy tizedes, egyébként egész szám
        return Math.abs(value) < 20
            ? Utils.num(Math.round(value * 10) / 10, 1) + " €/m²"
            : Utils.num(Math.round(value)) + " €/m²";
    }

    // Ár a hirdetés ügylete szerint (kiadónál havidíj)
    static price(i) {
        const v = Utils.eur(i.ar);
        return i.ugylet === "kiado" && v !== "-" ? v + I18n.t("perMonth") : v;
    }

    // Más oldal képe a saját szerverünkön keresztül (így nem tiltható le)
    static imgUrl(u) {
        if (!u) return null;
        return /^https?:\/\//i.test(u) ? "/api/img?u=" + encodeURIComponent(u) : u;
    }

    // Az ingatlan fő képe: saját feltöltött, vagy más oldalról beolvasott
    static photoUrl(i) {
        if (i.kep_id) return "/api/kepek/" + i.kep_id;
        if (Array.isArray(i.kulso_kepek) && i.kulso_kepek.length) return Utils.imgUrl(i.kulso_kepek[0]);
        return null;
    }

    // Beleszámít-e a statisztikába / becslésbe (az admin ellenőrizte, vagy hibátlan)
    static verified(i) {
        return i.ellenorzott !== false;
    }

    static hasPhoto(i) {
        return !!Utils.photoUrl(i);
    }

    // Link egységesítése (duplikátum-szűréshez)
    static normLink(l) {
        const s = String(l || "").trim();
        if (!s) return "";
        try {
            const u = new URL(s);
            return (u.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "") + u.pathname.replace(/\/+$/, "")).toLowerCase();
        } catch (e) {
            return "";
        }
    }

    static ago(date) {
        if (!date) return "";
        const d = new Date(date);
        return d.toLocaleDateString(Utils.locale(), { year: "numeric", month: "short", day: "numeric" });
    }

    static pct(value, digits = 1) {
        if (value === null || value === undefined || isNaN(value)) return "-";
        const sign = value > 0 ? "+" : "";
        return sign + Utils.num(value, digits) + " %";
    }

    static escape(text) {
        return String(text === null || text === undefined ? "" : text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // ----- Statisztika -----

    static avg(list) {
        return list.length ? list.reduce((s, x) => s + x, 0) / list.length : null;
    }

    static median(list) {
        if (!list.length) return null;
        const s = [...list].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }

    // Ár/nm – ha hiányzik, kiszámoljuk
    static arNm(i) {
        const v = Number(i.arNm);
        if (v > 0) return v;
        return i.ar > 0 && i.nm > 0 ? i.ar / i.nm : 0;
    }

    // Csak az értelmes (ár és alapterület > 0) ingatlanok
    static valid(lista) {
        return lista.filter(i => Number(i.ar) > 0 && Number(i.nm) > 0);
    }

    // ----- Állapot -----
    //
    // Az állapotok listáját az admin kezeli (Admin → Állapotok); a weboldal
    // induláskor a /api/config-ból kapja meg (AuthManager.load). Amíg nem
    // érkezett meg, ez a beépített lista érvényes.

    static ALAP_ALLAPOTOK = [
        { kulcs: "félkész", nev_hu: "félkész (szerkezetkész)", nev_ro: "nefinisat (la roșu / la gri)", nev_en: "unfinished (shell)", szin: "#92400e", sorrend: 5 },
        { kulcs: "felújítandó", nev_hu: "felújítandó", nev_ro: "necesită renovare", nev_en: "needs renovation", szin: "#b91c1c", sorrend: 10 },
        { kulcs: "közepes", nev_hu: "közepes", nev_ro: "medie", nev_en: "average", szin: "#ea580c", sorrend: 20 },
        { kulcs: "részbenfel", nev_hu: "részben felújított", nev_ro: "parțial renovat", nev_en: "partly renovated", szin: "#ca8a04", sorrend: 30 },
        { kulcs: "jó", nev_hu: "jó", nev_ro: "bună", nev_en: "good", szin: "#15803d", sorrend: 40 },
        { kulcs: "újszerű", nev_hu: "újszerű", nev_ro: "ca nou", nev_en: "like new", szin: "#2563eb", sorrend: 50 },
        { kulcs: "újépítésű", nev_hu: "újépítésű", nev_ro: "construcție nouă", nev_en: "new build", szin: "#0891b2", sorrend: 60 },
        { kulcs: "luxus", nev_hu: "luxus", nev_ro: "lux", nev_en: "luxury", szin: "#7c3aed", sorrend: 70 }
    ];

    static allapotLista = Utils.ALAP_ALLAPOTOK.map(a => ({ ...a, aktiv: true }));

    // A szerver listája (a kikapcsoltak is benne vannak, hogy a régi hirdetések címkéje megjelenjen)
    static setAllapotok(lista) {
        if (!Array.isArray(lista) || !lista.length) return;
        Utils.allapotLista = lista.slice().sort((a, b) => (a.sorrend || 0) - (b.sorrend || 0));
        Utils.fillAllapotSelects();
    }

    static ekezetNelkul(s) {
        return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    }

    // Az adatokban előforduló változatokat (pl. "jó*", "új", "Lux") a kulcsra egységesíti
    static normAllapot(a) {
        const v = String(a || "").replace(/\*/g, "").trim().toLowerCase();
        if (!v) return "";
        const L = Utils.allapotLista;
        const pontos = L.find(x => x.kulcs === v);
        if (pontos) return pontos.kulcs;
        const e = Utils.ekezetNelkul(v);
        const nevrol = L.find(x => [x.kulcs, x.nev_hu, x.nev_ro, x.nev_en].some(n => n && Utils.ekezetNelkul(n) === e));
        if (nevrol) return nevrol.kulcs;
        if (e === "uj" || e.startsWith("ujsz")) return "újszerű";
        if (e.startsWith("ujep") || e.startsWith("uj ep") || e === "new build") return "újépítésű";
        if (e.startsWith("reszben")) return "részbenfel";
        if (e.startsWith("feluj")) return "felújítandó";
        if (e.startsWith("felkesz") || e.startsWith("szerkezetkesz")) return "félkész";
        if (e.startsWith("kozep") || e === "atlagos" || e === "lakhato") return "közepes";
        if (e === "jo") return "jó";
        if (e.startsWith("lux")) return "luxus";
        return v;
    }

    static allapotAdat(a) {
        const k = Utils.normAllapot(a);
        return Utils.allapotLista.find(x => x.kulcs === k) || null;
    }

    // A választható (bekapcsolt) állapotok kulcsai, a legrosszabbtól a legjobbig
    static get ALLAPOTOK() {
        return Utils.allapotLista.filter(a => a.aktiv !== false).map(a => a.kulcs);
    }

    // <option> elemek az állapot-választókhoz
    static allapotOptions(selected, ures) {
        const sel = Utils.normAllapot(selected);
        const lista = Utils.ALLAPOTOK.slice();
        // A kikapcsolt, de a hirdetésen még meglévő állapot is választható maradjon
        if (sel && !lista.includes(sel) && Utils.allapotAdat(sel)) lista.push(sel);
        return (ures ? `<option value="">${I18n.t(ures)}</option>` : "") +
            lista.map(a => `<option value="${Utils.escape(a)}" ${sel === a ? "selected" : ""}>${Utils.escape(Utils.allapotLabel(a))}</option>`).join("");
    }

    // A [data-allapot-select] választók feltöltése (a data érték: az üres sor szövege)
    static fillAllapotSelects() {
        document.querySelectorAll("select[data-allapot-select]").forEach(sel => {
            const keep = sel.value;
            sel.innerHTML = Utils.allapotOptions(keep, sel.dataset.allapotSelect || null);
            if (keep && ![...sel.options].some(o => o.value === keep)) sel.value = "";
        });
    }

    static allapotLabel(a) {
        const x = Utils.allapotAdat(a);
        if (x) return x["nev_" + I18n.current] || x.nev_hu || x.kulcs;
        return a ? String(a).replace(/\*/g, "") : I18n.t("unknownLabel");
    }

    static allapotSzin(a) {
        const x = Utils.allapotAdat(a);
        return x && x.szin ? x.szin : "#6b7280";
    }

    // Automatikusan (a hirdetés szövegéből / az építés évéből) kitöltött állapot
    static allapotBecsult(i) {
        return !!(i && i.allapot && (String(i.allapot).includes("*") || i.allapot_forras === "szoveg" || i.allapot_forras === "ev"));
    }

    // Sorrend a táblázatokban / grafikonokon
    static allapotRank(a) {
        const k = Utils.normAllapot(a);
        const n = Utils.allapotLista.findIndex(x => x.kulcs === k);
        return n === -1 ? 99 : n;
    }

    // ----- Emelet -----

    static emeletSzam(e) {
        const n = parseInt(String(e || "").split("/")[0], 10);
        return isNaN(n) ? null : n;
    }

    static emeletLabel(e) {
        const n = Utils.emeletSzam(e);
        if (n === null) return I18n.t("unknownLabel");
        if (n <= 0) return I18n.t("groundFloorLabel");
        if (n >= 4) return I18n.t("floorPlusLabel");
        return `${n}. ${I18n.t("floorWord")}`;
    }

    static emeletRank(e) {
        const n = Utils.emeletSzam(e);
        return n === null ? 99 : Math.min(Math.max(n, 0), 4);
    }

}
