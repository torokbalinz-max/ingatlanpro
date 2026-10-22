// ============================================================
//  Szövegek (22. változat):
//   - Karbantartás városonként (automatikus javítás, forrásoldal-ellenőrzés)
//   - Közvetített (Imoradar24) hirdetés: az eredeti hirdetésre, vagy ha az még
//     nincs meg, a saját adatlapra visz (a forrásoldal keresése csak tartalék)
// ============================================================

(() => {

    const V22 = {
        hu: {
            cardValuateShort: "Értékbecslés",
            mtCityLabel: "Város",
            mtCityAll: "Minden város",
            mtCityNote: "Az alábbi eszközök csak a kiválasztott város (és a hozzá tartozó „és környéke”) hirdetéseire futnak – így gyorsabb, és nem kell mindig mindent lefuttatni. „Minden város”: az összesre.",
            recheckNote: "Megnyitja a hirdetések eredeti oldalát (OLX, Storia, Publi24…): ha eladták vagy levették, eltűnik a nyilvános oldalról és a „Nem elérhető” listába kerül; közben frissíti az árakat, pótolja a hiányzó adatokat és képeket. Az Imoradar24-ről átvett hirdetéseknél a város teljes Imoradar24-listáját is végignézi: megkeresi az eredeti hirdetés linkjét, és ami már nincs a listában, azt levettnek veszi. Egy városra indítva a város összes hirdetését nézi; „Minden város”-nál a legrégebben ellenőrzött 1000-et.",
            importResSrcLinks: "Eredeti linkek keresése",
            mtSrcLinksDone: "Eredeti hirdetés-linkek: {javitott} hirdetésnél megtalálva; {maradt} hirdetésnek még nincs meg az eredeti linkje (ezek a saját adatlapjukra visznek, a következő futás újra keresi).",
            srcLinkPending: "Az eredeti hirdetés linkjét még keressük – addig itt látod a hirdetés adatait és képeit.",
            extHelpSearch: "Az eredeti hirdetés linkjét még keressük."
        },
        ro: {
            cardValuateShort: "Evaluare",
            mtCityLabel: "Oraș",
            mtCityAll: "Toate orașele",
            mtCityNote: "Instrumentele de mai jos rulează doar pentru anunțurile orașului ales (și ale zonei „și împrejurimi”) – mai rapid, nu trebuie rulat totul de fiecare dată. „Toate orașele”: pentru toate.",
            recheckNote: "Deschide pagina originală a anunțurilor (OLX, Storia, Publi24…): dacă au fost vândute sau șterse, dispar de pe site și ajung în lista „Indisponibile”; actualizează prețurile și completează datele și pozele lipsă. Pentru anunțurile preluate de pe Imoradar24 parcurge și lista completă a orașului: caută linkul anunțului original, iar ce nu mai apare în listă este considerat retras. Pentru un oraș verifică toate anunțurile lui; la „Toate orașele” cele mai vechi 1000 verificate.",
            importResSrcLinks: "Căutarea linkurilor originale",
            mtSrcLinksDone: "Linkuri originale: găsite la {javitott} anunțuri; {maradt} anunțuri încă nu au linkul original (acestea deschid pagina proprie, următoarea rulare caută din nou).",
            srcLinkPending: "Încă căutăm linkul anunțului original – până atunci vedeți aici datele și pozele anunțului.",
            extHelpSearch: "Încă căutăm linkul anunțului original."
        },
        en: {
            cardValuateShort: "Valuation",
            mtCityLabel: "City",
            mtCityAll: "All cities",
            mtCityNote: "The tools below run only on the chosen city's listings (and its \"and surroundings\" area) – faster, and you don't have to run everything every time. \"All cities\": all of them.",
            recheckNote: "Opens each listing's original page (OLX, Storia, Publi24…): if it was sold or removed it disappears from the public site and moves to the \"Unavailable\" list; it also updates prices and fills missing data and photos. For listings taken from Imoradar24 it also reads the city's full Imoradar24 list: it finds the original listing's link, and anything no longer in the list is treated as removed. For one city it checks all of its listings; for \"All cities\" the 1000 checked longest ago.",
            importResSrcLinks: "Looking up original links",
            mtSrcLinksDone: "Original listing links: found for {javitott} listings; {maradt} listings still have no original link (these open their own page; the next run looks again).",
            srcLinkPending: "We're still looking up the original listing's link – until then you see the listing's data and photos here.",
            extHelpSearch: "We're still looking up the original listing's link."
        }
    };

    Object.keys(V22).forEach(nyelv => {
        I18N_STRINGS[nyelv] = Object.assign(I18N_STRINGS[nyelv] || {}, V22[nyelv]);
    });

})();
