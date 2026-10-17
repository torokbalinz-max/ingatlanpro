// ============================================================
//  Táblázatok (ag-Grid) feliratai magyarul / románul / angolul:
//  lapozás, szűrők, „nincs adat”. Használat: localeText: GridLocale.get()
// ============================================================

class GridLocale {

    static SZOVEG = {
        hu: {
            page: "Oldal", of: "/", to: "–", more: "több", next: "Következő", last: "Utolsó", first: "Első", previous: "Előző",
            pageSizeSelectorLabel: "Sorok oldalanként:", ariaPageSizeSelectorLabel: "Sorok oldalanként",
            noRowsToShow: "Nincs megjeleníthető sor", loadingOoo: "Betöltés…", searchOoo: "Keresés…", filterOoo: "Szűrés…",
            selectAll: "(Mind)", blanks: "(Üres)", applyFilter: "Alkalmaz", resetFilter: "Visszaállítás", clearFilter: "Törlés", cancelFilter: "Mégse",
            equals: "Egyenlő", notEqual: "Nem egyenlő", lessThan: "Kisebb, mint", greaterThan: "Nagyobb, mint",
            lessThanOrEqual: "Legfeljebb", greaterThanOrEqual: "Legalább", inRange: "Között", inRangeStart: "Ettől", inRangeEnd: "Eddig",
            contains: "Tartalmazza", notContains: "Nem tartalmazza", startsWith: "Ezzel kezdődik", endsWith: "Ezzel végződik",
            blank: "Üres", notBlank: "Nem üres", andCondition: "ÉS", orCondition: "VAGY", dateFormatOoo: "éééé-hh-nn"
        },
        ro: {
            page: "Pagina", of: "din", to: "–", more: "mai multe", next: "Următoarea", last: "Ultima", first: "Prima", previous: "Anterioara",
            pageSizeSelectorLabel: "Rânduri pe pagină:", ariaPageSizeSelectorLabel: "Rânduri pe pagină",
            noRowsToShow: "Nu există rânduri", loadingOoo: "Se încarcă…", searchOoo: "Caută…", filterOoo: "Filtrează…",
            selectAll: "(Toate)", blanks: "(Goale)", applyFilter: "Aplică", resetFilter: "Resetează", clearFilter: "Șterge", cancelFilter: "Anulează",
            equals: "Egal", notEqual: "Diferit", lessThan: "Mai mic decât", greaterThan: "Mai mare decât",
            lessThanOrEqual: "Cel mult", greaterThanOrEqual: "Cel puțin", inRange: "Între", inRangeStart: "De la", inRangeEnd: "Până la",
            contains: "Conține", notContains: "Nu conține", startsWith: "Începe cu", endsWith: "Se termină cu",
            blank: "Gol", notBlank: "Completat", andCondition: "ȘI", orCondition: "SAU", dateFormatOoo: "aaaa-ll-zz"
        }
    };

    // Angolul az ag-Grid alapja – ott nem kell semmi
    static get() {
        return GridLocale.SZOVEG[typeof I18n !== "undefined" ? I18n.current : "en"] || {};
    }

}
