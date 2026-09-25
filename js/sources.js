// ============================================================
//  Hirdetési oldalak (forrás) felismerése a link alapján
// ============================================================

class Sources {

    // Ismert oldalak szép neve
    static KNOWN = {
        "imobiliare.ro": "Imobiliare.ro",
        "imoradar24.ro": "Imoradar24",
        "storia.ro": "Storia",
        "olx.ro": "OLX",
        "publi24.ro": "Publi24",
        "homezz.ro": "Homezz",
        "anuntul.ro": "Anuntul.ro",
        "lajumate.ro": "LaJumate",
        "romimo.ro": "Romimo"
    };

    // "local" = nincs link, csak az IngatlanPro-n van fent
    // "other" = van valami a link mezőben, de nem értelmes URL
    static fromLink(link) {

        const l = String(link || "").trim();

        if (!l) return "local";

        try {
            const host = new URL(l).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
            return host || "other";
        } catch (e) {
            return "other";
        }

    }

    static label(key) {
        if (key === "local") return I18n.t("sourceLocal");
        if (key === "other") return I18n.t("sourceOther");
        return Sources.KNOWN[key] || key;
    }

    static icon(key) {
        if (key === "local") return "fa-solid fa-house-flag";
        if (key === "other") return "fa-solid fa-circle-question";
        return "fa-solid fa-globe";
    }

    static badge(key) {
        return `<span class="sourceBadge src-${key === "local" ? "local" : key === "other" ? "other" : "web"}">
                    <i class="${Sources.icon(key)}"></i> ${Utils.escape(Sources.label(key))}
                </span>`;
    }

    // Egy ingatlan összes forrása (fő link + ugyanez más oldalakon)
    static allOf(i) {
        const lista = [Sources.fromLink(i.link)];
        (i.tovabbi_linkek || []).forEach(l => lista.push(Sources.fromLink(l)));
        return [...new Set(lista)];
    }

    // Egy listában előforduló források darabszámmal, nagyság szerint
    static count(lista) {
        const m = {};
        lista.forEach(i => {
            (i.forrasok || Sources.allOf(i)).forEach(k => {
                m[k] = (m[k] || 0) + 1;
            });
        });
        return Object.entries(m)
            .sort((a, b) => b[1] - a[1])
            .map(([key, db]) => ({ key, db }));
    }

}
