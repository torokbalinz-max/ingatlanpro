// ============================================================
//  Szövegek (19. változat): lapozható képek a kártyán, "Megnyitás
//  térképen" gomb, hirdetésenként: kattintásra a forrásoldal vagy
//  a saját adatlap nyíljon meg
// ============================================================

(() => {

    const V19 = {
        hu: {
            cardShowOnMap: "Megnyitás térképen",
            cardExtTitle: "Az eredeti hirdetés nyílik meg új lapon ({s})",
            cardAdminPage: "Belső adatlap (csak admin)",
            cardPhotoPrev: "Előző kép",
            cardPhotoNext: "Következő kép",
            openOnSource: "Megnyitás itt: {s}",

            openModeLabel: "Kattintásra mi nyíljon meg?",
            openMode_auto: "Automatikus",
            openMode_autoNow: "Automatikus (most: {m})",
            openMode_lap: "Saját adatlap az oldalon",
            openMode_forras: "Egyből a forrásoldal",
            openMode_forrasNev: "Egyből a forrásoldal ({s})",
            openModeHelp: "Automatikus: a más oldalról átvett hirdetés a forrásoldalra visz, a nálunk feltöltött saját adatlapot kap. A kártyán a képek és a fő adatok mindkét esetben látszanak.",
            openModeSaved: "Beállítva.",
            openModeAdminNote: "A látogatóknak ez a hirdetés kattintásra egyből az eredeti oldalra visz ({s}) – ezt az adatlapot csak te látod.",

            bulkOpenLabel: "Kattintásra:",
            bulkOpenChoose: "— válassz —",
            bulkOpenBtn: "Alkalmazás",
            bulkOpenNoChoice: "Válaszd ki, mi nyíljon meg kattintásra.",
            bulkOpenConfirm: "{n} hirdetésnél ez lesz beállítva: {m}. Mehet?",

            extTitle: "Ez a hirdetés itt található: {s}",
            extHelp: "A teljes leírást, a hirdető elérhetőségét és az összes képet az eredeti hirdetésben találod.",
            extOpen: "Eredeti hirdetés megnyitása ({s})"
        },
        ro: {
            cardShowOnMap: "Vezi pe hartă",
            cardExtTitle: "Anunțul original se deschide într-o filă nouă ({s})",
            cardAdminPage: "Fișa internă (doar admin)",
            cardPhotoPrev: "Poza anterioară",
            cardPhotoNext: "Poza următoare",
            openOnSource: "Deschide pe {s}",

            openModeLabel: "Ce se deschide la clic?",
            openMode_auto: "Automat",
            openMode_autoNow: "Automat (acum: {m})",
            openMode_lap: "Fișa proprie pe site",
            openMode_forras: "Direct site-ul sursă",
            openMode_forrasNev: "Direct site-ul sursă ({s})",
            openModeHelp: "Automat: anunțul preluat de pe alt site duce la sursă, cel încărcat la noi are fișă proprie. Pe card, pozele și datele principale apar în ambele cazuri.",
            openModeSaved: "Salvat.",
            openModeAdminNote: "Pentru vizitatori, acest anunț duce la clic direct pe site-ul original ({s}) – această fișă o vezi doar tu.",

            bulkOpenLabel: "La clic:",
            bulkOpenChoose: "— alege —",
            bulkOpenBtn: "Aplică",
            bulkOpenNoChoice: "Alege ce se deschide la clic.",
            bulkOpenConfirm: "Pentru {n} anunțuri se setează: {m}. Continui?",

            extTitle: "Acest anunț se află aici: {s}",
            extHelp: "Descrierea completă, datele de contact și toate pozele le găsești în anunțul original.",
            extOpen: "Deschide anunțul original ({s})"
        },
        en: {
            cardShowOnMap: "Show on map",
            cardExtTitle: "Opens the original listing in a new tab ({s})",
            cardAdminPage: "Internal page (admin only)",
            cardPhotoPrev: "Previous photo",
            cardPhotoNext: "Next photo",
            openOnSource: "Open on {s}",

            openModeLabel: "What opens on click?",
            openMode_auto: "Automatic",
            openMode_autoNow: "Automatic (now: {m})",
            openMode_lap: "Own page on this site",
            openMode_forras: "Straight to the source site",
            openMode_forrasNev: "Straight to the source site ({s})",
            openModeHelp: "Automatic: listings taken from other sites open the source, listings uploaded here get their own page. The card shows the photos and main details either way.",
            openModeSaved: "Saved.",
            openModeAdminNote: "For visitors this listing opens the original site directly ({s}) – only you see this page.",

            bulkOpenLabel: "On click:",
            bulkOpenChoose: "— choose —",
            bulkOpenBtn: "Apply",
            bulkOpenNoChoice: "Choose what should open on click.",
            bulkOpenConfirm: "Set for {n} listings: {m}. Continue?",

            extTitle: "This listing is on {s}",
            extHelp: "The full description, the advertiser's contact details and all photos are in the original listing.",
            extOpen: "Open the original listing ({s})"
        }
    };

    Object.keys(V19).forEach(nyelv => {
        I18N_STRINGS[nyelv] = Object.assign(I18N_STRINGS[nyelv] || {}, V19[nyelv]);
    });

})();
