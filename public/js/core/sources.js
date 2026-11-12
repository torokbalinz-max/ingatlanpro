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
    //  Ha az eredeti hirdetés (OLX / Storia / Imobiliare / Publi24…) linkje megvan,
    //  egyből oda visz. Ha nincs meg, az Imoradar24 ADATLAPJA nyílik (/oferta/… –
    //  belépés nélkül is pontosan azt az egy hirdetést mutatja, élőben ellenőrizve
    //  2026-11-12) – a forrásoldal keresésére (találati lista) a kattintás már nem visz.
    //  Csak a régi "link-extern" címnél (az belépés nélkül nem visz tovább) marad a
    //  forrásoldal szűrt keresése tartaléknak.

    static FORRAS_HOST = {
        olx: "olx.ro", storia: "storia.ro", publi24: "publi24.ro", homezz: "homezz.ro",
        anuntul: "anuntul.ro", lajumate: "lajumate.ro", romimo: "romimo.ro", imobiliare: "imobiliare.ro"
    };

    static kozvetito(link) {
        return /imoradar24\.ro\//i.test(String(link || ""));
    }

    // Az Imoradar24 adatlapja (egy konkrét hirdetés – nem a link-extern, nem keresés)
    static imoradarAdatlap(link) {
        return /imoradar24\.ro\/oferta\/[a-z0-9-]+-\d{5,}/i.test(String(link || ""));
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
            // a kattintás az Imoradar24 adatlapjára visz – a jelvény is ezt mutatja
            if (Sources.imoradarAdatlap(i.link)) return "imoradar24.ro";
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
        // Az eredeti hirdetés; amíg az nincs meg: az Imoradar24 adatlapja (pontosan ez a
        // hirdetés); csak a régi link-extern címnél a forrásoldal szűrt keresése –
        // átvett hirdetésnél a kattintás SOSEM a saját adatlapra visz
        if (Sources.kozvetito(i.link)) return Sources.eredeti(i) || (Sources.imoradarAdatlap(i.link) ? i.link : null) || i.forras_kereso || null;
        return i.link;
    }

    // A forrásoldal szűrt keresése (csak tartalék link az adatlapon)
    static kereso(i) {
        return !!i && Sources.kozvetito(i.link) && !Sources.eredeti(i) && !Sources.imoradarAdatlap(i.link) ? (i.forras_kereso || null) : null;
    }

    // A kattintás a forrásoldal keresésére visz-e (csak a régi link-extern címnél)
    static keresesre(i) {
        return !!Sources.kereso(i);
    }

    // Forrásoldalanként a hirdetés linkje: { "olx.ro": url, "storia.ro": url, ... }
    // (a fő link + a további linkek; a közvetítő nélkül)
    static linkek(i) {
        const m = {};
        if (!i) return m;
        const fo = Sources.url(i);
        if (fo) m[Sources.kulcs(i)] = fo;
        (i.tovabbi_linkek || []).filter(l => l && !Sources.kozvetito(l)).forEach(l => {
            const k = Sources.fromLink(l);
            if (k !== "other" && k !== "local" && !m[k]) m[k] = l;
        });
        return m;
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
