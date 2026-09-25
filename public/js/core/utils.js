// ============================================================
//  Közös segédfüggvények (formázás, statisztika, állapotok)
// ============================================================

class Utils {

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
        return Utils.num(Math.round(value)) + " €/m²";
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
            .replace(/"/g, "&quot;");
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

    // Az adatokban előforduló változatokat (pl. "jó*", "új") egységesíti
    static normAllapot(a) {
        const v = String(a || "").toLowerCase().replace(/\*/g, "").trim();
        if (!v) return "";
        if (v === "új" || v === "uj" || v.startsWith("újsz") || v.startsWith("ujsz")) return "újszerű";
        if (v.startsWith("részben") || v.startsWith("reszben")) return "részbenfel";
        if (v.startsWith("felúj") || v.startsWith("feluj")) return "felújítandó";
        if (v === "jó" || v === "jo") return "jó";
        if (v.startsWith("lux")) return "luxus";
        return v;
    }

    static allapotLabel(a) {
        const key = {
            "felújítandó": "allapotFelujitando",
            "részbenfel": "allapotReszben",
            "jó": "allapotJo",
            "újszerű": "allapotUjszeru",
            "luxus": "allapotLuxus"
        }[Utils.normAllapot(a)];
        return key ? I18n.t(key) : (a ? String(a) : I18n.t("unknownLabel"));
    }

    // Sorrend a táblázatokban / grafikonokon
    static allapotRank(a) {
        const r = { "felújítandó": 0, "részbenfel": 1, "jó": 2, "újszerű": 3, "luxus": 4 }[Utils.normAllapot(a)];
        return r === undefined ? 9 : r;
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
