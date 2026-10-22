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

    // ---------- Közvetítő (Imoradar24) helyett a valódi forrás ----------
    //  Az Imoradar24 adatlapja belépés nélkül semmit sem mutat, ezért oda sosem
    //  küldünk senkit: ha az eredeti hirdetést (OLX / Storia…) nem találtuk meg,
    //  a forrásoldal szűrt keresésére (forras_kereso), különben a saját adatlapra.

    static FORRAS_HOST = {
        olx: "olx.ro", storia: "storia.ro", publi24: "publi24.ro", homezz: "homezz.ro",
        anuntul: "anuntul.ro", lajumate: "lajumate.ro", romimo: "romimo.ro", imobiliare: "imobiliare.ro"
    };

    static kozvetito(link) {
        return /imoradar24\.ro\//i.test(String(link || ""));
    }

    // A hirdetés valódi forrásának kulcsa ("olx.ro", "storia.ro", "local"…)
    static kulcs(i) {
        if (!i) return "local";
        if (Sources.kozvetito(i.link)) {
            if (Sources.FORRAS_HOST[i.forras_nev]) return Sources.FORRAS_HOST[i.forras_nev];
            if (i.forras_kereso) return Sources.fromLink(i.forras_kereso);
            return "imoradar24.ro";
        }
        return Sources.fromLink(i.link);
    }

    // Hova vigyen a kattintás: az eredeti hirdetés, vagy (ha azt nem találtuk)
    // a forrásoldal szűrt keresése; null = nincs hova (a saját adatlap nyílik)
    static url(i) {
        if (!i || !i.link) return null;
        if (Sources.kozvetito(i.link)) return i.forras_kereso || null;
        return i.link;
    }

    // Csak a forrásoldal keresésére tudunk vinni (az eredeti hirdetést nem találtuk)
    static keresesre(i) {
        return !!i && Sources.kozvetito(i.link) && !!i.forras_kereso;
    }

    // Egy ingatlan összes forrása (fő link + ugyanez más oldalakon) – közvetítő nélkül
    static allOf(i) {
        const lista = [Sources.kulcs(i)];
        (i.tovabbi_linkek || []).filter(l => !Sources.kozvetito(l)).forEach(l => lista.push(Sources.fromLink(l)));
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
