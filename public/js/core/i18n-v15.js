// ============================================================
//  Szövegek (15. változat): hely-ellenőrzés gyors munkasor,
//  Fotók munkahely, városra adható ellenőrzési jog
// ============================================================

(() => {

    const V15 = {
        hu: {
            // Menü
            adminTabPhotos: "Fotók",
            adminDescPhotos: "A csapat helyszíni munkája: a hirdetések fotói (saját és a forrásoldalról átvett képek), feltöltés, sorrend, szerkesztés – a kiadott városokban.",
            adminDescLocCheck2: "A hirdetések helye a térképen: a pontos hely nélküliek gyors megadása (kereső, a leírás helynevei, műholdkép), és amit az automatika áthelyezett.",
            ovTodoNoLocation: "<b>{n}</b> hirdetés nincs a térképen – add meg a helyüket.",

            // Váltó
            lpModeTitle: "Pontos hely nélkül",
            lpModeSub: "Nincs a térképen, vagy csak közelítő",
            lpModeMoved: "Áthelyezett",
            lpModeMovedSub: "Amit az automatika máshová tett",

            // Munkasor
            lpFilter_mind: "Mind",
            lpFilter_nincs: "Nincs a térképen",
            lpFilter_kozelito: "Csak közelítő",
            lpQueue: "Sorban",
            lpTagNone: "Nincs a térképen",
            lpTagApprox: "Közelítő · {m}",
            lpPos: "{n} / {ossz}",
            lpRooms: "{n} szoba",
            lpSource: "Forrás",
            lpSourceArea: "A forrásoldal szerint",
            lpDesc: "Leírás",
            lpDescHint: "– kattints egy kiemelt helynévre",
            lpNoDesc: "Nincs leírás.",
            lpSaveNext: "Mentés és következő",
            lpSkip: "Kihagyás",
            lpKeep: "Így marad",
            lpKeepHelp: "A közelítő hely rendben van, pontosabban nem tudható – kikerül a sorból.",
            lpNone: "Nem található",
            lpNoneHelp: "A helyét nem lehet megállapítani – kikerül a sorból, a térképen nem jelenik meg.",
            lpKeys: "<kbd>Ctrl</kbd>+<kbd>Enter</kbd> mentés · <kbd>Ctrl</kbd>+<kbd>→</kbd> következő",
            lpDoneN: "{n} kész",
            lpKeepAll: "Mind így marad ({n})",
            lpKeepAllHelp: "A szűrt közelítő helyek mind rendben vannak – kikerülnek a sorból.",
            lpKeepAllConfirm: "{n} hirdetés közelítő helye így marad, és kikerül a sorból. Mehet?",
            lpEmpty: "Minden hirdetésnek megvan a helye",
            lpEmptyHint: "Ebben a szűrésben nincs pontos hely nélküli hirdetés.",
            lpSatellite: "Műhold",

            // Fotók munkahely
            wsPhotosIntro: "A hirdetések fotói egy helyen – a saját feltöltött és a forrásoldalról átvett képekkel. Szűrj azokra, ahol még saját fotó kell.",
            wsPhotoFilter: "Fotók",
            wsPhotoAll: "Minden hirdetés",
            wsOnlyNoPhoto: "Saját fotó nélkül",
            wsPhotoOnlyExternal: "Csak átvett képekkel",
            wsPhotoNone: "Egyáltalán nincs képe",
            wsExternalTag: "átvett",

            // Csapat
            cs3_ertekesites: "Városra, megbízásra, hirdetésre szóló hozzáférések",
            cs3_ertekesitesSugo: "Megbízások, naptár, fotók, hirdetések – és városra a hirdetések ellenőrzése is. Egy sor = egy város (vagy megbízás, hirdetés); több városhoz adj több sort.",
            cs3_resz_ellenorzes: "Ellenőrzés ebben a városban",
            cs3_reszSugo_ellenorzes: "ellenőrzésre vár, hely-ellenőrzés, állapot, nem elérhetők, bejelentések – csak ennek a városnak a hirdetései",
            cs2_reszSugo_ellenorzes: "jóváhagyás, hely, állapot, duplikátumok – az egész oldalra (egy városra: lent)",
            cs2_reszSugo_helyek: "városok, kerületek, környék, hely-ellenőrzés"
        },
        ro: {
            adminTabPhotos: "Fotografii",
            adminDescPhotos: "Munca echipei pe teren: fotografiile anunțurilor (proprii și preluate de pe site-ul sursă), încărcare, ordine, editare – în orașele permise.",
            adminDescLocCheck2: "Locul anunțurilor pe hartă: completarea rapidă a celor fără loc exact (căutare, numele de locuri din descriere, satelit) și ce a mutat automatizarea.",
            ovTodoNoLocation: "<b>{n}</b> anunțuri nu sunt pe hartă – stabilește-le locul.",

            lpModeTitle: "Fără loc exact",
            lpModeSub: "Nu sunt pe hartă sau doar aproximativ",
            lpModeMoved: "Mutate",
            lpModeMovedSub: "Ce a mutat automatizarea",

            lpFilter_mind: "Toate",
            lpFilter_nincs: "Nu sunt pe hartă",
            lpFilter_kozelito: "Doar aproximativ",
            lpQueue: "În coadă",
            lpTagNone: "Nu e pe hartă",
            lpTagApprox: "Aproximativ · {m}",
            lpPos: "{n} / {ossz}",
            lpRooms: "{n} camere",
            lpSource: "Sursa",
            lpSourceArea: "După site-ul sursă",
            lpDesc: "Descriere",
            lpDescHint: "– dă clic pe un nume de loc evidențiat",
            lpNoDesc: "Fără descriere.",
            lpSaveNext: "Salvează și următorul",
            lpSkip: "Sari peste",
            lpKeep: "Rămâne așa",
            lpKeepHelp: "Locul aproximativ e bun, mai exact nu se poate ști – iese din coadă.",
            lpNone: "Nu se găsește",
            lpNoneHelp: "Locul nu poate fi stabilit – iese din coadă și nu apare pe hartă.",
            lpKeys: "<kbd>Ctrl</kbd>+<kbd>Enter</kbd> salvare · <kbd>Ctrl</kbd>+<kbd>→</kbd> următorul",
            lpDoneN: "{n} gata",
            lpKeepAll: "Toate rămân așa ({n})",
            lpKeepAllHelp: "Locurile aproximative filtrate sunt toate bune – ies din coadă.",
            lpKeepAllConfirm: "Locul aproximativ al {n} anunțuri rămâne așa și ies din coadă. Continui?",
            lpEmpty: "Toate anunțurile au loc",
            lpEmptyHint: "În această filtrare nu există anunțuri fără loc exact.",
            lpSatellite: "Satelit",

            wsPhotosIntro: "Fotografiile anunțurilor într-un loc – cu cele încărcate de voi și cele preluate de pe site-ul sursă. Filtrează unde mai e nevoie de fotografii proprii.",
            wsPhotoFilter: "Fotografii",
            wsPhotoAll: "Toate anunțurile",
            wsOnlyNoPhoto: "Fără fotografii proprii",
            wsPhotoOnlyExternal: "Doar cu imagini preluate",
            wsPhotoNone: "Fără nicio imagine",
            wsExternalTag: "preluat",

            cs3_ertekesites: "Accese pe oraș, mandat sau anunț",
            cs3_ertekesitesSugo: "Mandate, calendar, fotografii, anunțuri – și pe oraș verificarea anunțurilor. Un rând = un oraș (sau mandat, anunț); pentru mai multe orașe adaugă mai multe rânduri.",
            cs3_resz_ellenorzes: "Verificare în acest oraș",
            cs3_reszSugo_ellenorzes: "de verificat, verificare locație, stare, indisponibile, sesizări – doar anunțurile acestui oraș",
            cs2_reszSugo_ellenorzes: "aprobare, loc, stare, duplicate – pentru tot site-ul (pentru un oraș: mai jos)",
            cs2_reszSugo_helyek: "orașe, cartiere, împrejurimi, verificare locație"
        },
        en: {
            adminTabPhotos: "Photos",
            adminDescPhotos: "The team's field work: listing photos (own and taken over from the source site), upload, order, editing – in the permitted cities.",
            adminDescLocCheck2: "Where listings sit on the map: quickly set the ones without an exact place (search, place names from the description, satellite), and what the automation moved.",
            ovTodoNoLocation: "<b>{n}</b> listings are not on the map – set their location.",

            lpModeTitle: "No exact location",
            lpModeSub: "Not on the map, or only approximate",
            lpModeMoved: "Moved",
            lpModeMovedSub: "What the automation relocated",

            lpFilter_mind: "All",
            lpFilter_nincs: "Not on the map",
            lpFilter_kozelito: "Approximate only",
            lpQueue: "In queue",
            lpTagNone: "Not on the map",
            lpTagApprox: "Approximate · {m}",
            lpPos: "{n} / {ossz}",
            lpRooms: "{n} rooms",
            lpSource: "Source",
            lpSourceArea: "According to the source site",
            lpDesc: "Description",
            lpDescHint: "– click a highlighted place name",
            lpNoDesc: "No description.",
            lpSaveNext: "Save and next",
            lpSkip: "Skip",
            lpKeep: "Keep as is",
            lpKeepHelp: "The approximate place is fine, it can't be known more exactly – it leaves the queue.",
            lpNone: "Can't be found",
            lpNoneHelp: "The location can't be determined – it leaves the queue and won't show on the map.",
            lpKeys: "<kbd>Ctrl</kbd>+<kbd>Enter</kbd> save · <kbd>Ctrl</kbd>+<kbd>→</kbd> next",
            lpDoneN: "{n} done",
            lpKeepAll: "Keep all as is ({n})",
            lpKeepAllHelp: "All filtered approximate places are fine – they leave the queue.",
            lpKeepAllConfirm: "The approximate place of {n} listings stays as is and they leave the queue. Continue?",
            lpEmpty: "Every listing has a location",
            lpEmptyHint: "There are no listings without an exact location in this filter.",
            lpSatellite: "Satellite",

            wsPhotosIntro: "Listing photos in one place – with your own uploads and the images taken over from the source site. Filter for the ones that still need your own photos.",
            wsPhotoFilter: "Photos",
            wsPhotoAll: "All listings",
            wsOnlyNoPhoto: "Without own photos",
            wsPhotoOnlyExternal: "Only taken-over images",
            wsPhotoNone: "No image at all",
            wsExternalTag: "source",

            cs3_ertekesites: "Access for a city, mandate or listing",
            cs3_ertekesitesSugo: "Mandates, calendar, photos, listings – and, per city, listing review too. One row = one city (or mandate, listing); add more rows for more cities.",
            cs3_resz_ellenorzes: "Review in this city",
            cs3_reszSugo_ellenorzes: "to review, location check, condition, unavailable, reports – only this city's listings",
            cs2_reszSugo_ellenorzes: "approval, location, condition, duplicates – whole site (one city: below)",
            cs2_reszSugo_helyek: "cities, districts, surroundings, location check"
        }
    };

    Object.keys(V15).forEach(nyelv => {
        I18N_STRINGS[nyelv] = Object.assign(I18N_STRINGS[nyelv] || {}, V15[nyelv]);
    });

})();
