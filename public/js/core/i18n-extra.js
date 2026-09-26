// ============================================================
//  Új szövegek (kerületek HU/RO, település, hely pontossága,
//  automatikus javítás, kezdőlap, súgó). Az i18n.js után töltődik,
//  és hozzáadja a kulcsokat a meglévő szótárakhoz.
// ============================================================

(() => {

    const EXTRA = {

        // ======================================================== ENGLISH
        en: {
            skipToContent: "Skip to content",

            // Hely pontossága
            hely_pontos: "Exact location",
            hely_utca: "Street-level location",
            hely_kozelito: "Approximate location",
            hely_nincs: "No exact location given",
            filterHely: "Location accuracy",
            noLocationHelp: "The listing does not say exactly where the property is.",

            // Település (ház, telek)
            telepulesLabel: "Where is it?",
            telepulesVarosban: "In the city",
            telepulesPh: "Leave empty if it is in the city",
            telepulesHelp: "If it is not in the city but next to it, the name of the village.",
            nearCity: "{hely}, near {varos}",
            field_telepules: "village / locality",
            field_evszam: "year built",
            field_telek_nm: "plot size",

            // Kerületek
            placesNameHu: "Hungarian name",
            placesNameRo: "Romanian name",
            placesAliases: "Names used on other sites (comma separated)",
            placesEdit: "Edit district",
            placesSave: "Save",
            placesDelete: "Delete district",
            placesDeleteConfirm: "Delete the district \"{nev}\"? Listings in it will have no district.",
            placesDuplicate: "A district with this name already exists in this city.",
            placesNoRo: "no Romanian name",
            placesLangHelp: "Each district has a Hungarian and a Romanian name. The Hungarian name is shown in Hungarian, the Romanian name in English and Romanian. Listings are matched by either name and by the names used on other sites.",
            placesUnmatchedTitle: "Unknown neighbourhoods from listing sites",
            placesUnmatchedHelp: "Pick the district each name belongs to. Every listing with that name gets it, and next time it happens automatically.",
            placesAssignTo: "Assign to district",
            placesAssign: "Assign",
            placesNewFromName: "New district from this name",
            placesNewFromNamePrompt: "Hungarian name of the new district (Romanian name: {nev}):",
            placesWithout: "{n} listings without district",

            // Automatikus javítás
            autofixTitle: "Automatic fix",
            autofixDesc: "Fills in missing data from the listing text: plot size, rooms, floor, district, village, approximate location.",
            autofixBtn: "Run",
            autofixRunning: "{kesz} / {osszes} listings",
            autofixSlow: "Finding locations on the map takes about a second per listing, so this can take a few minutes. You can leave this page.",
            autofixDone: "{javitott} listings completed. Waiting for review: {elotte} → {utana}.",

            // Menü
            menuHome: "Home",
            menuHomeDesc: "What can you do here?",
            menuHirdetes: "Listing",

            // Kezdőlap
            homeTitle: "Romanian property listings in one place, in order.",
            homeSub: "Search listings gathered from several sites, see real market prices and estimate what a property is worth.",
            homeCtaBrowse: "Browse properties",
            homeCtaPost: "Post a listing",
            homeStatListings: "active listings",
            homeStatCity: "city",
            homeStatAvg: "average price per m²",
            homeStatPhotos: "with photos",
            homeFeaturesTitle: "What you can do here",
            homeOpen: "Open",
            homeFeatPropsTitle: "Properties",
            homeFeatPropsText: "Every listing of a city in one list, whichever site it comes from. Duplicates are hidden.",
            homeFeatPropsB1: "Filter by type, price, size, rooms, district",
            homeFeatPropsB2: "Cards, sortable table or map",
            homeFeatPropsB3: "Star the ones you like",
            homeFeatMarketTitle: "Market analysis",
            homeFeatMarketText: "Average prices and €/m² by district, room count and condition, with trends over time.",
            homeFeatValTitle: "Valuation",
            homeFeatValText: "Enter a property's data and get a price range based on similar listings.",
            homeFeatFavTitle: "Favorites",
            homeFeatFavText: "Your starred properties in one table.",
            homeFeatNewTitle: "Post a listing",
            homeFeatNewText: "Upload your own property with photos, or paste a link from another site and we fill in the data.",
            homeFeatMapTitle: "Map",
            homeFeatMapText: "See where the properties are. Colours show the condition.",
            homeGoodTitle: "Good to know",
            homeGood1Title: "Where the listings come from",
            homeGood1Text: "Most listings are read from sites like imobiliare.ro, and are checked every day. Sold ones disappear.",
            homeGood2Title: "Unverified",
            homeGood2Text: "Some data could not be read with certainty. The listing is shown, but it is left out of the statistics.",
            homeGood3Title: "Approximate location",
            homeGood3Text: "Estimated from the street, district or village in the description. The real place can differ.",
            homeGood4Title: "No exact location given",
            homeGood4Text: "Nothing in the listing tells where the property is. Common with plots.",
            homeGood5Title: "Districts and villages",
            homeGood5Text: "Flats are grouped by district. Houses and plots show whether they are in the city or in a village next to it.",
            homeGood6Title: "Languages",
            homeGood6Text: "Switch between English, Hungarian and Romanian at the top. Place names follow the language.",

            // Oldal-súgók
            helpBtn: "How it works",
            propsTitle: "Properties",
            propsSubtitle: "Use the filters on the left. Click a card to open the listing.",
            help_properties: [
                "Choose sale or rent and the property type at the top of the filters.",
                "Pick a district for flats, or a village for houses and plots.",
                "Switch between cards and table. In the table you can sort by any column.",
                "The map at the bottom shows the same results."
            ],
            help_market: [
                "The numbers always follow the filters on the left.",
                "Current market: averages by district, rooms, floor and condition.",
                "History and trend: how prices changed between saved snapshots.",
                "Only verified listings are counted."
            ],
            help_valuation: [
                "Fill in at least the city and the floor area.",
                "The estimate is based on the most similar verified listings.",
                "Enter the asking price to see whether it is cheap or expensive."
            ],
            help_favorites: [
                "Star a property on its card, in the table or on the listing page.",
                "Click a row to open the listing."
            ],
            help_new: [
                "Paste a link from another site and press Load data to fill in the form.",
                "Fields marked with * are required. Photos are required if the listing only appears here.",
                "Click on the map where the property is. For plots this is optional."
            ]
        },

        // ======================================================== MAGYAR
        hu: {
            skipToContent: "Ugrás a tartalomra",
            hely_pontos: "Pontos hely",
            hely_utca: "Utca szerinti hely",
            hely_kozelito: "Közelítő hely",
            hely_nincs: "Nincs megadva pontos hely",
            filterHely: "Hely pontossága",
            noLocationHelp: "A hirdetésből nem derül ki, pontosan hol van az ingatlan.",

            telepulesLabel: "Hol van?",
            telepulesVarosban: "A városban",
            telepulesPh: "Üresen hagyva: a városban",
            telepulesHelp: "Ha nem a városban, hanem mellette van: a település neve.",
            nearCity: "{hely}, {varos} mellett",
            field_telepules: "település",
            field_evszam: "építés éve",
            field_telek_nm: "telek mérete",

            placesNameHu: "Magyar név",
            placesNameRo: "Román név",
            placesAliases: "Más oldalakon használt nevek (vesszővel)",
            placesEdit: "Kerület szerkesztése",
            placesSave: "Mentés",
            placesDelete: "Kerület törlése",
            placesDeleteConfirm: "Törlöd a(z) „{nev}” kerületet? A benne lévő hirdetéseknek nem lesz kerülete.",
            placesDuplicate: "Ilyen nevű kerület már van ebben a városban.",
            placesNoRo: "nincs román név",
            placesLangHelp: "Minden kerületnek van magyar és román neve. Magyarul a magyar név látszik, angolul és románul a román. A hirdetéseket bármelyik névre, és a más oldalakon használt nevekre is párosítjuk.",
            placesUnmatchedTitle: "Ismeretlen környékek a hirdetési oldalakról",
            placesUnmatchedHelp: "Válaszd ki, melyik kerülethez tartozik a név. Minden ilyen hirdetés megkapja, és legközelebb magától megy.",
            placesAssignTo: "Melyik kerület?",
            placesAssign: "Hozzárendel",
            placesNewFromName: "Új kerület ebből a névből",
            placesNewFromNamePrompt: "Az új kerület magyar neve (román név: {nev}):",
            placesWithout: "{n} hirdetésnek nincs kerülete",

            autofixTitle: "Automatikus javítás",
            autofixDesc: "A hirdetés szövegéből kitölti, ami hiányzik: telek mérete, szobák, emelet, kerület, település, közelítő hely.",
            autofixBtn: "Futtatás",
            autofixRunning: "{kesz} / {osszes} hirdetés",
            autofixSlow: "A helyek megkeresése a térképen hirdetésenként kb. egy másodperc, ezért pár percig is eltarthat. Nyugodtan elhagyhatod az oldalt.",
            autofixDone: "{javitott} hirdetés kiegészítve. Ellenőrzésre vár: {elotte} → {utana}.",

            menuHome: "Kezdőlap",
            menuHomeDesc: "Mit tudsz itt csinálni?",
            menuHirdetes: "Hirdetés",

            homeTitle: "Romániai ingatlanhirdetések egy helyen, rendben.",
            homeSub: "Keress több hirdetési oldal ingatlanjai között, nézd meg a valós piaci árakat, és becsüld meg, mennyit ér egy ingatlan.",
            homeCtaBrowse: "Ingatlanok böngészése",
            homeCtaPost: "Hirdetés feladása",
            homeStatListings: "aktív hirdetés",
            homeStatCity: "város",
            homeStatAvg: "átlagos négyzetméterár",
            homeStatPhotos: "fényképes",
            homeFeaturesTitle: "Mit tudsz itt csinálni",
            homeOpen: "Megnyitás",
            homeFeatPropsTitle: "Ingatlanok",
            homeFeatPropsText: "Egy város összes hirdetése egy listában, bármelyik oldalon van fent. A duplikátumokat elrejtjük.",
            homeFeatPropsB1: "Szűrés típus, ár, méret, szobák, kerület szerint",
            homeFeatPropsB2: "Kártyák, rendezhető táblázat vagy térkép",
            homeFeatPropsB3: "Csillaggal elmentheted, ami tetszik",
            homeFeatMarketTitle: "Piaci elemzés",
            homeFeatMarketText: "Átlagárak és €/m² kerület, szobaszám és állapot szerint, és hogyan változnak az idővel.",
            homeFeatValTitle: "Értékbecslő",
            homeFeatValText: "Add meg az ingatlan adatait, és a hasonló hirdetések alapján kapsz egy ársávot.",
            homeFeatFavTitle: "Kedvencek",
            homeFeatFavText: "A csillagozott ingatlanjaid egy táblázatban.",
            homeFeatNewTitle: "Hirdetésfeladás",
            homeFeatNewText: "Töltsd fel a saját ingatlanodat fényképekkel, vagy illessz be egy linket egy másik oldalról, és kitöltjük az adatokat.",
            homeFeatMapTitle: "Térkép",
            homeFeatMapText: "Lásd, hol vannak az ingatlanok. A színek az állapotot mutatják.",
            homeGoodTitle: "Jó tudni",
            homeGood1Title: "Honnan jönnek a hirdetések",
            homeGood1Text: "A legtöbbet olyan oldalakról olvassuk be, mint az imobiliare.ro, és naponta ellenőrizzük őket. Az eladottak eltűnnek.",
            homeGood2Title: "Ellenőrizetlen",
            homeGood2Text: "Néhány adat nem olvasható ki biztosan. A hirdetés látszik, de a statisztikába nem számít bele.",
            homeGood3Title: "Közelítő hely",
            homeGood3Text: "A leírásban szereplő utcából, kerületből vagy településből becsüljük. A valódi hely eltérhet.",
            homeGood4Title: "Nincs megadva pontos hely",
            homeGood4Text: "A hirdetésből semmi nem utal arra, hol van az ingatlan. Telkeknél gyakori.",
            homeGood5Title: "Kerületek és települések",
            homeGood5Text: "A lakásokat kerület szerint csoportosítjuk. Háznál és teleknél azt látod, hogy a városban vagy egy szomszéd településen van.",
            homeGood6Title: "Nyelvek",
            homeGood6Text: "Fent válthatsz angol, magyar és román nyelv között. A helynevek is a nyelvet követik.",

            helpBtn: "Hogyan működik?",
            propsTitle: "Ingatlanok",
            propsSubtitle: "Szűrj a bal oldalon. Egy kártyára kattintva megnyílik a hirdetés.",
            help_properties: [
                "A szűrők tetején válaszd ki: eladó vagy kiadó, és milyen típusú ingatlan.",
                "Lakásnál kerületet, háznál és teleknél települést választhatsz.",
                "Válthatsz kártyák és táblázat között. A táblázat bármelyik oszlop szerint rendezhető.",
                "Lent a térkép ugyanezeket a találatokat mutatja."
            ],
            help_market: [
                "A számok mindig a bal oldali szűrést követik.",
                "Jelenlegi piac: átlagok kerület, szobák, emelet és állapot szerint.",
                "Előzmények és ártrend: hogyan változtak az árak a mentett állapotok között.",
                "Csak az ellenőrzött hirdetések számítanak bele."
            ],
            help_valuation: [
                "Legalább a várost és az alapterületet add meg.",
                "A becslés a leginkább hasonló, ellenőrzött hirdetéseken alapul.",
                "Ha megadod a kért árat, megmutatjuk, olcsó-e vagy drága."
            ],
            help_favorites: [
                "Csillagozz meg egy ingatlant a kártyán, a táblázatban vagy a hirdetés oldalán.",
                "Egy sorra kattintva megnyílik a hirdetés."
            ],
            help_new: [
                "Illessz be egy linket egy másik oldalról, és az Adatok betöltése kitölti az űrlapot.",
                "A *-gal jelölt mezők kötelezők. Fénykép akkor kell, ha a hirdetés csak itt jelenik meg.",
                "Kattints a térképen az ingatlan helyére. Teleknél ez nem kötelező."
            ]
        },

        // ======================================================== ROMÂNĂ
        ro: {
            skipToContent: "Sari la conținut",
            hely_pontos: "Locație exactă",
            hely_utca: "Locație după stradă",
            hely_kozelito: "Locație aproximativă",
            hely_nincs: "Locația exactă nu este precizată",
            filterHely: "Precizia locației",
            noLocationHelp: "Din anunț nu reiese exact unde se află proprietatea.",

            telepulesLabel: "Unde se află?",
            telepulesVarosban: "În oraș",
            telepulesPh: "Gol dacă este în oraș",
            telepulesHelp: "Dacă nu este în oraș, ci lângă el: numele localității.",
            nearCity: "{hely}, lângă {varos}",
            field_telepules: "localitate",
            field_evszam: "anul construcției",
            field_telek_nm: "suprafața terenului",

            placesNameHu: "Nume maghiar",
            placesNameRo: "Nume românesc",
            placesAliases: "Nume folosite pe alte site-uri (separate prin virgulă)",
            placesEdit: "Editează cartierul",
            placesSave: "Salvează",
            placesDelete: "Șterge cartierul",
            placesDeleteConfirm: "Ștergi cartierul „{nev}”? Anunțurile din el nu vor mai avea cartier.",
            placesDuplicate: "Există deja un cartier cu acest nume în oraș.",
            placesNoRo: "fără nume românesc",
            placesLangHelp: "Fiecare cartier are un nume maghiar și unul românesc. În maghiară apare numele maghiar, în engleză și română cel românesc. Anunțurile sunt potrivite după oricare nume și după numele folosite pe alte site-uri.",
            placesUnmatchedTitle: "Zone necunoscute de pe site-urile de anunțuri",
            placesUnmatchedHelp: "Alege cartierul căruia îi aparține fiecare nume. Toate anunțurile cu acel nume îl primesc, iar data viitoare se face automat.",
            placesAssignTo: "Care cartier?",
            placesAssign: "Atribuie",
            placesNewFromName: "Cartier nou din acest nume",
            placesNewFromNamePrompt: "Numele maghiar al cartierului nou (nume românesc: {nev}):",
            placesWithout: "{n} anunțuri fără cartier",

            autofixTitle: "Corectare automată",
            autofixDesc: "Completează din textul anunțului ce lipsește: suprafața terenului, camere, etaj, cartier, localitate, locație aproximativă.",
            autofixBtn: "Pornește",
            autofixRunning: "{kesz} / {osszes} anunțuri",
            autofixSlow: "Găsirea locațiilor pe hartă durează cam o secundă pe anunț, deci poate dura câteva minute. Poți părăsi pagina.",
            autofixDone: "{javitott} anunțuri completate. De verificat: {elotte} → {utana}.",

            menuHome: "Acasă",
            menuHomeDesc: "Ce poți face aici?",
            menuHirdetes: "Anunț",

            homeTitle: "Anunțuri imobiliare din România, într-un singur loc, ordonate.",
            homeSub: "Caută printre anunțurile de pe mai multe site-uri, vezi prețurile reale ale pieței și estimează cât valorează o proprietate.",
            homeCtaBrowse: "Vezi proprietățile",
            homeCtaPost: "Publică un anunț",
            homeStatListings: "anunțuri active",
            homeStatCity: "oraș",
            homeStatAvg: "preț mediu pe m²",
            homeStatPhotos: "cu fotografii",
            homeFeaturesTitle: "Ce poți face aici",
            homeOpen: "Deschide",
            homeFeatPropsTitle: "Proprietăți",
            homeFeatPropsText: "Toate anunțurile unui oraș într-o singură listă, de pe orice site. Duplicatele sunt ascunse.",
            homeFeatPropsB1: "Filtrare după tip, preț, suprafață, camere, cartier",
            homeFeatPropsB2: "Carduri, tabel sortabil sau hartă",
            homeFeatPropsB3: "Marchează cu stea ce îți place",
            homeFeatMarketTitle: "Analiza pieței",
            homeFeatMarketText: "Prețuri medii și €/m² pe cartiere, număr de camere și stare, plus evoluția în timp.",
            homeFeatValTitle: "Evaluare",
            homeFeatValText: "Introdu datele proprietății și primești un interval de preț pe baza anunțurilor similare.",
            homeFeatFavTitle: "Favorite",
            homeFeatFavText: "Proprietățile marcate cu stea, într-un tabel.",
            homeFeatNewTitle: "Publică un anunț",
            homeFeatNewText: "Încarcă propria proprietate cu fotografii sau lipește un link de pe alt site și completăm noi datele.",
            homeFeatMapTitle: "Hartă",
            homeFeatMapText: "Vezi unde sunt proprietățile. Culorile arată starea.",
            homeGoodTitle: "Bine de știut",
            homeGood1Title: "De unde vin anunțurile",
            homeGood1Text: "Majoritatea sunt preluate de pe site-uri precum imobiliare.ro și verificate zilnic. Cele vândute dispar.",
            homeGood2Title: "Neverificat",
            homeGood2Text: "Unele date nu au putut fi citite sigur. Anunțul apare, dar nu intră în statistici.",
            homeGood3Title: "Locație aproximativă",
            homeGood3Text: "Estimată din strada, cartierul sau localitatea din descriere. Locul real poate diferi.",
            homeGood4Title: "Locația exactă nu este precizată",
            homeGood4Text: "Nimic din anunț nu arată unde se află proprietatea. Frecvent la terenuri.",
            homeGood5Title: "Cartiere și localități",
            homeGood5Text: "Apartamentele sunt grupate pe cartiere. La case și terenuri vezi dacă sunt în oraș sau într-o localitate vecină.",
            homeGood6Title: "Limbi",
            homeGood6Text: "Sus poți alege engleza, maghiara sau româna. Și numele locurilor urmează limba.",

            helpBtn: "Cum funcționează?",
            propsTitle: "Proprietăți",
            propsSubtitle: "Folosește filtrele din stânga. Un click pe card deschide anunțul.",
            help_properties: [
                "Sus în filtre alege vânzare sau închiriere și tipul proprietății.",
                "La apartamente alegi cartierul, la case și terenuri localitatea.",
                "Poți comuta între carduri și tabel. Tabelul se sortează după orice coloană.",
                "Harta de jos arată aceleași rezultate."
            ],
            help_market: [
                "Cifrele urmează mereu filtrele din stânga.",
                "Piața actuală: medii pe cartier, camere, etaj și stare.",
                "Istoric și trend: cum s-au schimbat prețurile între stările salvate.",
                "Sunt luate în calcul doar anunțurile verificate."
            ],
            help_valuation: [
                "Completează cel puțin orașul și suprafața.",
                "Estimarea se bazează pe cele mai asemănătoare anunțuri verificate.",
                "Dacă introduci prețul cerut, îți arătăm dacă e ieftin sau scump."
            ],
            help_favorites: [
                "Marchează cu stea o proprietate pe card, în tabel sau pe pagina anunțului.",
                "Un click pe rând deschide anunțul."
            ],
            help_new: [
                "Lipește un link de pe alt site și apasă Încarcă datele pentru a completa formularul.",
                "Câmpurile cu * sunt obligatorii. Fotografiile sunt obligatorii dacă anunțul apare doar aici.",
                "Dă click pe hartă unde se află proprietatea. La terenuri este opțional."
            ]
        }

    };

    Object.keys(EXTRA).forEach(nyelv => {
        I18N_STRINGS[nyelv] = Object.assign(I18N_STRINGS[nyelv] || {}, EXTRA[nyelv]);
    });

})();
