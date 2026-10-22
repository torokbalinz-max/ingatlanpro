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
    //  küldünk senkit. Ha az eredeti hirdetés (OLX / Storia / Publi24…) linkje már
    //  megvan (a további linkek között), egyből oda visz; ha még nincs, a hirdetés
    //  SAJÁT adatlapja nyílik (ott pontosan ez a hirdetés látszik) – a forrásoldal
    //  keresése csak tartalék link az adatlapon, a kattintás nem oda visz.

    static FORRAS_HOST = {
        olx: "olx.ro", storia: "storia.ro", publi24: "publi24.ro", homezz: "homezz.ro",
        anuntul: "anuntul.ro", lajumate: "lajumate.ro", romimo: "romimo.ro", imobiliare: "imobiliare.ro"
    };

    static kozvetito(link) {
        return /imoradar24\.ro\//i.test(String(link || ""));
    }

    // Egy konkrét hirdetés linkje-e (nem keresés, nem közvetítő)
    static HIRDETES_MINTAK = [
        /imobiliare\.ro\/(?:[a-z]{2}\/)?oferta\/[a-z0-9-]+-\d{5,}/i,
        /storia\.ro\/[a-z]{2}\/oferta\/[a-z0-9-]+/i,
        /olx\.ro\/d\/(?:[a-z]{2}\/)?oferta\/[a-z0-9-]+/i,
        /publi24\.ro\/anunturi\/.+\/anunt\//i,
        /homezz\.ro\/.+-\d+\.html/i,
        /lajumate\.ro\/(?:ad\/|.+-id\d+)/i,
        /anuntul\.ro\/anunt-/i,
        /romimo\.ro\/.+\d{5,}/i
    ];

    static hirdetesLink(link) {
        const l = String(link || "");
        return !!l && !Sources.kozvetito(l) && Sources.HIRDETES_MINTAK.some(re => re.test(l));
    }

    // Közvetítőre mutató hirdetésnél: az eredeti hirdetés linkje a további linkek közül
    static eredeti(i) {
        if (!i) return null;
        return (i.tovabbi_linkek || []).find(l => Sources.hirdetesLink(l)) || null;
    }

    // A hirdetés valódi forrásának kulcsa ("olx.ro", "storia.ro", "local"…)
    static kulcs(i) {
        if (!i) return "local";
        if (Sources.kozvetito(i.link)) {
            const e = Sources.eredeti(i);
            if (e) return Sources.fromLink(e);
            if (Sources.FORRAS_HOST[i.forras_nev]) return Sources.FORRAS_HOST[i.forras_nev];
            if (i.forras_kereso) return Sources.fromLink(i.forras_kereso);
            return "imoradar24.ro";
        }
        return Sources.fromLink(i.link);
    }

    // Hova vigyen a kattintás: az eredeti hirdetés; null = a saját adatlap nyílik
    // (közvetített hirdetésnél, amíg az eredeti linkje nincs meg)
    static url(i) {
        if (!i || !i.link) return null;
        if (Sources.kozvetito(i.link)) return Sources.eredeti(i);
        return i.link;
    }

    // A forrásoldal szűrt keresése (csak tartalék link az adatlapon)
    static kereso(i) {
        return !!i && Sources.kozvetito(i.link) && !Sources.eredeti(i) ? (i.forras_kereso || null) : null;
    }

    // Régi hívóknak: a kattintás már sosem a keresésre visz
    static keresesre() {
        return false;
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
