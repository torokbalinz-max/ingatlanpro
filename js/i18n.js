// ============================================================
//  Többnyelvűség: angol (alap), magyar, román
//  Szöveg a HTML-ben:  data-i18n="kulcs"
//  Szöveg JS-ben:      I18n.t("kulcs")  vagy  I18n.f("kulcs", { x: 1 })
// ============================================================

const I18N_STRINGS = {

    // ======================================================== ENGLISH
    en: {

        // Navbar + menu
        darkModeOn: "Dark mode",
        darkModeOff: "Light mode",
        darkModeToggle: "Dark / light mode",
        menuIngatlanok: "Properties",
        menuIngatlanokDesc: "Search, table, map",
        menuUj: "New property",
        menuUjDesc: "Upload a listing",
        menuStatisztika: "Market analysis",
        menuStatisztikaDesc: "Averages, breakdowns, trends",
        menuKedvencek: "Favorites",
        menuKedvencekDesc: "Saved properties",
        menuErtekbecslo: "Valuation",
        menuErtekbecsloDesc: "What is a flat worth?",
        menuFelhasznalo: "User",
        menuFelhasznaloDesc: "Sign in, profile",

        // Search
        searchTitle: "Search",
        searchVaros: "City",
        searchTabParams: "Parameters",
        searchTabSources: "Listing site",
        searchAr: "Price (€)",
        searchNm: "Floor area (m²)",
        phMin: "min",
        phMax: "max",
        minSzoba: "Min. rooms",
        minEmelet: "Min. floor",
        allapot: "Condition",
        allapotMindegy: "Any",
        allapotFelujitando: "needs renovation",
        allapotReszben: "partly renovated",
        allapotJo: "good",
        allapotUjszeru: "like new",
        allapotLuxus: "luxury",
        kerulet: "District",
        sourcesHelp: "Choose which listing sites the properties should come from.",
        sourcesAll: "All",
        sourcesNone: "None",
        sourcesEmpty: "No properties in this city yet.",
        sourceLocal: "Only on IngatlanPro",
        sourceOther: "Other / invalid link",
        keresesBtn: "Search",
        resetFiltersBtn: "Clear filters",

        // KPI cards
        dbOsszes: "Results",
        dbAtlagAr: "Average price",
        dbAtlagNm: "Average €/m²",
        dbEladva: "Sold",

        // Table
        tableTitle: "Properties",
        colAr: "Price",
        colNm: "m²",
        colArNm: "€/m²",
        colSzoba: "Rooms",
        colEmelet: "Floor",
        colKerulet: "District",
        colAllapot: "Condition",
        colForras: "Listed on",

        // Detail panel
        detailPanelTitle: "Property details",
        detailNincsKivalasztva: "Nothing selected",
        detailAr: "Price",
        detailArNm: "Price / m²",
        detailNm: "Floor area",
        detailSzoba: "Rooms",
        detailEmelet: "Floor",
        detailAllapot: "Condition",
        detailVaros: "City",
        detailHely: "City, district",
        detailKerulet: "District",
        detailLink: "Open listing",
        detailValuate: "Valuate this property",
        detailEdit: "Edit",
        detailDelete: "Delete",
        favAdd: "☆ Add to favorites",
        favRemove: "⭐ In favorites",

        // Map
        mapTitle: "Map",
        popupProperty: "Property #",
        popupLink: "Open listing",

        // New property
        newTitle: "Add new property",
        editTitle: "Edit property",
        newSubtitle: "Fill in the details and mark the location on the map.",
        newLink: "Listing link",
        newLinkHelp: "Leave it empty if the property is listed only on IngatlanPro.",
        newAr: "Price (€)",
        newNm: "Floor area (m²)",
        newSzobak: "Rooms",
        newEmelet: "Floor",
        newOsszEmelet: "Total floors",
        newVaros: "City",
        newAddVaros: "Add new city",
        newKerulet: "District / area",
        newAddKerulet: "Add new district",
        newKeruletNincs: "— not specified —",
        newAllapot: "Condition",
        newHely: "Location",
        newHelyHelp: "Click on the map where the property is.",
        newCancelBtn: "Cancel",
        newSaveBtn: "Save property",

        // Favorites
        favTitle: "Favorites",
        favSubtitle: "Click a row to open the property.",
        favDeleteConfirm: "Remove from favorites?",
        favDeleteTitle: "Remove from favorites",
        favEmpty: "No favorites yet – click the ☆ in the table.",

        // Market analysis
        statsTitle: "Market analysis",
        statsSubtitle: "All figures refer to the filter set in the Search panel.",
        statsCurrent: "Current market",
        statsHistory: "History",
        statsCompare: "Comparison",
        statsTrend: "Price trend",
        statsBasedOn: "Calculated for:",
        statsChangeFilter: "Change filter",
        currentNoResults: "No properties match the current filter.",
        statsKeyFigures: "Key figures",
        dashLabelCount: "Properties",
        dashLabelAvgPrice: "Average price",
        dashLabelAvgPriceNm: "Average €/m²",
        dashLabelAvgNm: "Average floor area",
        kpiNoteCount: "of which {sold} marked as sold",
        kpiNoteMedian: "Median: {median} – the middle price, less distorted by extreme listings",
        kpiNoteMedianNm: "Median: {median}",
        kpiNoteNm: "Average size of the flats in the filter",
        kpiTypicalRange: "Typical price range",
        kpiNoteTypicalRange: "The middle half of the properties falls into this range",
        kpiNmRange: "€/m² range",
        kpiNoteNmRange: "Cheapest and most expensive price per square metre",
        statsInsightsTitle: "Summary & notes",
        insightAvg: "One square metre costs <b>{nm}</b> on average, so a typical 60 m² flat is about <b>{price60}</b>.",
        insightDistrict: "Cheapest district: <b>{cheap}</b> ({cheapNm}); most expensive: <b>{exp}</b> ({expNm}). Districts with at least 3 properties are compared.",
        insightNoDistrict: "For {pct}% of the properties no district is set – use the bulk edit in the table to assign districts for better analysis.",
        insightCondition: "Flats in good condition are <b>{pct}%</b> more expensive per m² than those needing renovation ({diff} difference).",
        insightRooms: "{small} flats: <b>{smallNm}</b>, {big} flats: <b>{bigNm}</b> on average.",
        insightSource: "Most listings come from <b>{source}</b> ({pct}%).",
        insightVsCityUp: "The filtered properties are <b>{pct}% more expensive</b> per m² than the city average ({city}).",
        insightVsCityDown: "The filtered properties are <b>{pct}% cheaper</b> per m² than the city average ({city}).",
        insightMissing: "{db} properties have no price or floor area and are left out of the calculations.",
        statsDistTitle: "Price per m² distribution",
        noteDist: "How many properties fall into each €/m² band. A wide spread means the prices vary a lot.",
        chartLegendProperties: "Properties",
        pcsWord: "pcs",
        statsByAllapot: "By condition",
        statsByRooms: "By number of rooms",
        statsByFloor: "By floor",
        statsByKerulet: "By district",
        statsBySource: "By listing site",
        noteAllapot: "How the condition affects the price per square metre.",
        noteRooms: "Smaller flats are usually more expensive per m².",
        noteFloor: "Ground floor and top floors are often cheaper.",
        noteKerulet: "Price level of the districts. Few properties = less reliable average.",
        noteSource: "Which listing sites the properties come from and their price level.",
        statsColCategory: "Category",
        statsColCount: "Count",
        statsColShare: "Share",
        statsColAvgPrice: "Avg. price",
        statsColAvgPriceNm: "Avg. €/m²",
        statsColVsAvg: "vs. average",
        statsOneGroup: "Only one category in the current filter.",
        unknownLabel: "Unknown",
        groundFloorLabel: "Ground floor",
        floorWord: "floor",
        floorPlusLabel: "4th floor +",
        roomWord: "rooms",
        roomsLabel: "{n}-room",
        roomsPlusLabel: "4+ rooms",
        keruletNincsMegadva: "Not specified",
        allCities: "All cities",

        // History
        historySaveTitle: "Save market state",
        historySaveNote: "A snapshot stores today's averages. Save one regularly (e.g. monthly) and you can follow how prices change.",
        historySaveBtn: "Save {city} now",
        historyEmpty: "No saved market states yet.",
        historyDelete: "Delete snapshot",

        // Compare
        compareNeedTwo: "At least two saved market states are needed for a comparison.",
        compareNote: "Compare two saved market states: how prices changed between the two dates.",
        compareFrom: "Earlier state",
        compareTo: "Later state",
        compareBtn: "Compare",
        compareDifferentCity: "The two snapshots belong to different cities – the comparison may be misleading.",
        compareAvgPrice: "Average price",
        compareAvgPriceNm: "Average €/m²",
        compareByAllapot: "Change by condition",
        compareByRooms: "Change by number of rooms",
        compareByFloor: "Change by floor",
        compareByKerulet: "Change by district",
        compareOldNm: "Before €/m²",
        compareNewNm: "After €/m²",
        compareChange: "Change",

        // Trend
        trendNote: "The trend is built from the saved market states (History tab).",
        trendIndicator: "Indicator",
        trendOptAvgPriceNm: "Average €/m²",
        trendOptAvgPrice: "Average price",
        trendOptCount: "Number of properties",
        trendFrom: "From",
        trendTo: "To",
        trendNeedMore: "At least two saved market states are needed for a trend.",
        trendPoints: "data points",

        // Valuation
        valTitle: "Property valuation",
        valSubtitle: "Enter the details of the flat and we estimate its price from similar properties.",
        valAskingPrice: "Asking price (optional)",
        valAskingPriceHelp: "If you enter it, we show whether it is cheap or expensive compared to the estimate.",
        valBtn: "Estimate",
        valHowTitle: "How does it work?",
        valHow1: "We take every property in the chosen city from our database.",
        valHow2: "We look for the most similar ones: size, rooms, district, condition and floor.",
        valHow3: "From their price per m² we compute a weighted average – the more similar, the bigger the weight.",
        valHow4: "The price range shows where the middle half of the similar properties is.",
        valDisclaimer: "This is an estimate based on listing prices, not an official valuation.",
        valAlertNm: "Please enter the floor area!",
        valNotEnough: "Not enough properties in this city for an estimate (at least 3 needed).",
        valConfHigh: "High confidence",
        valConfMedium: "Medium confidence",
        valConfLow: "Low confidence",
        valAskFair: "The asking price is in the typical range.",
        valAskHigh: "The asking price is above the typical range – expensive.",
        valAskLow: "The asking price is below the typical range – cheap (check why!).",
        valCityAvg: "City average",
        valDistrictAvg: "District average",
        valPool: "Properties in the city",
        valEstimate: "Estimated price",
        valRange: "Typical range",
        valContext: "Market context",
        valMethod: "Based on the {n} most similar properties, weighted by similarity. The cheapest and most expensive ones are left out.",
        valComparables: "Similar properties used",
        valSimilarity: "Similarity",

        // User
        userTitle: "User",
        userLoginTitle: "Sign in",
        userComingSoon: "User accounts are coming soon.",
        userGoogleBtn: "Sign in with Google",
        userEmailBtn: "Sign in with e-mail",
        userSoonBadge: "Coming soon",
        userWhatTitle: "What can you do when signed in?",
        userFeat1: "Upload your own property listings.",
        userFeat2: "Only you can edit and delete your own listings.",
        userFeat3: "Your own favorites list, on any device.",
        userFeat4: "Saved searches and market analyses.",
        userCurrentAccess: "Until then the site is protected by a shared password.",

        // Alerts
        alertNincsKivalasztva: "No property selected!",
        alertConfirmDelete: "Are you sure you want to delete this property?",
        alertDeleted: "Property deleted!",
        alertNoVaros: "Please choose a city!",
        alertNoPriceNm: "Please enter the price and the floor area!",
        alertSaveSuccess: "Saved successfully!",
        alertSaveError: "Something went wrong while saving!",
        alertLoadError: "Could not load the data from the server.",
        alertNewCityPrompt: "New city name:",
        alertNewCityError: "Something went wrong while adding the city.",
        alertNewDistrictPrompt: "New district / area name:",
        alertNewDistrictError: "Something went wrong while adding the district.",
        alertChooseCityFirst: "Please choose a city first!",
        alertConfirmDeleteSnapshot: "Are you sure you want to delete this snapshot?",
        alertConfirmSaveStats: "Save the current market state?",
        alertStatsSaved: "Market state saved!",
        alertStatsSaveError: "Something went wrong while saving.",

        // Bulk edit
        bulkSelectedSuffix: "properties selected",
        bulkKeruletLabel: "District:",
        bulkKeruletChoose: "— choose a district —",
        bulkApplyBtn: "Apply district",
        bulkCancelBtn: "Clear selection",
        bulkAlertConfirm: "Set the district for the selected properties?",
        bulkAlertNoKerulet: "Please choose a district first!",
        bulkAlertSuccess: "District updated for the selected properties!",
        bulkAlertError: "Something went wrong while updating."

    },

    // ======================================================== MAGYAR
    hu: {

        darkModeOn: "Sötét mód",
        darkModeOff: "Világos mód",
        darkModeToggle: "Sötét / világos mód",
        menuIngatlanok: "Ingatlanok",
        menuIngatlanokDesc: "Keresés, táblázat, térkép",
        menuUj: "Új ingatlan",
        menuUjDesc: "Hirdetés feltöltése",
        menuStatisztika: "Piaci elemzés",
        menuStatisztikaDesc: "Átlagok, bontások, trendek",
        menuKedvencek: "Kedvencek",
        menuKedvencekDesc: "Elmentett ingatlanok",
        menuErtekbecslo: "Értékbecslő",
        menuErtekbecsloDesc: "Mennyit ér egy lakás?",
        menuFelhasznalo: "Felhasználó",
        menuFelhasznaloDesc: "Bejelentkezés, profil",

        searchTitle: "Keresés",
        searchVaros: "Város",
        searchTabParams: "Paraméterek",
        searchTabSources: "Hirdetési oldal",
        searchAr: "Ár (€)",
        searchNm: "Alapterület (m²)",
        phMin: "min",
        phMax: "max",
        minSzoba: "Min. szobák",
        minEmelet: "Min. emelet",
        allapot: "Állapot",
        allapotMindegy: "Mindegy",
        allapotFelujitando: "felújítandó",
        allapotReszben: "részben felújított",
        allapotJo: "jó",
        allapotUjszeru: "újszerű",
        allapotLuxus: "luxus",
        kerulet: "Kerület",
        sourcesHelp: "Válaszd ki, melyik hirdetési oldalon fent lévő ingatlanokat szeretnéd látni.",
        sourcesAll: "Mind",
        sourcesNone: "Egyik sem",
        sourcesEmpty: "Ebben a városban még nincs ingatlan.",
        sourceLocal: "Csak az IngatlanPro-n",
        sourceOther: "Egyéb / hibás link",
        keresesBtn: "Keresés",
        resetFiltersBtn: "Szűrők törlése",

        dbOsszes: "Találatok",
        dbAtlagAr: "Átlag ár",
        dbAtlagNm: "Átlag €/m²",
        dbEladva: "Eladva",

        tableTitle: "Ingatlanok",
        colAr: "Ár",
        colNm: "m²",
        colArNm: "€/m²",
        colSzoba: "Szobák",
        colEmelet: "Emelet",
        colKerulet: "Kerület",
        colAllapot: "Állapot",
        colForras: "Hirdetési oldal",

        detailPanelTitle: "Ingatlan adatai",
        detailNincsKivalasztva: "Nincs kiválasztva",
        detailAr: "Ár",
        detailArNm: "Ár / m²",
        detailNm: "Alapterület",
        detailSzoba: "Szobák",
        detailEmelet: "Emelet",
        detailAllapot: "Állapot",
        detailVaros: "Város",
        detailHely: "Város, kerület",
        detailKerulet: "Kerület",
        detailLink: "Hirdetés megnyitása",
        detailValuate: "Értékbecslés erre",
        detailEdit: "Szerkesztés",
        detailDelete: "Törlés",
        favAdd: "☆ Kedvencekhez",
        favRemove: "⭐ Kedvenc",

        mapTitle: "Térkép",
        popupProperty: "Ingatlan #",
        popupLink: "Hirdetés megnyitása",

        newTitle: "Új ingatlan felvétele",
        editTitle: "Ingatlan szerkesztése",
        newSubtitle: "Töltsd ki az adatokat, és jelöld meg a helyét a térképen.",
        newLink: "Hirdetés linkje",
        newLinkHelp: "Ha üresen hagyod, az ingatlan csak az IngatlanPro-n jelenik meg.",
        newAr: "Ár (€)",
        newNm: "Alapterület (m²)",
        newSzobak: "Szobák",
        newEmelet: "Emelet",
        newOsszEmelet: "Összes emelet",
        newVaros: "Város",
        newAddVaros: "Új város hozzáadása",
        newKerulet: "Kerület / városrész",
        newAddKerulet: "Új kerület hozzáadása",
        newKeruletNincs: "— nincs megadva —",
        newAllapot: "Állapot",
        newHely: "Elhelyezkedés",
        newHelyHelp: "Kattints a térképre az ingatlan helyén.",
        newCancelBtn: "Mégse",
        newSaveBtn: "Ingatlan mentése",

        favTitle: "Kedvencek",
        favSubtitle: "Kattints egy sorra, és megnyílik az ingatlan adatlapja.",
        favDeleteConfirm: "Eltávolítod a kedvencek közül?",
        favDeleteTitle: "Eltávolítás a kedvencek közül",
        favEmpty: "Még nincs kedvenc – kattints a ☆ jelre a táblázatban.",

        statsTitle: "Piaci elemzés",
        statsSubtitle: "Minden szám a Keresésben beállított szűrésre vonatkozik.",
        statsCurrent: "Jelenlegi piac",
        statsHistory: "Előzmények",
        statsCompare: "Összehasonlítás",
        statsTrend: "Ártrend",
        statsBasedOn: "Ezekre számolunk:",
        statsChangeFilter: "Szűrés módosítása",
        currentNoResults: "A jelenlegi szűrésnek egy ingatlan sem felel meg.",
        statsKeyFigures: "Fő számok",
        dashLabelCount: "Ingatlanok",
        dashLabelAvgPrice: "Átlagár",
        dashLabelAvgPriceNm: "Átlag €/m²",
        dashLabelAvgNm: "Átlagos alapterület",
        kpiNoteCount: "ebből {sold} eladottként jelölve",
        kpiNoteMedian: "Medián: {median} – a középső ár, ezt kevésbé torzítják a kiugró hirdetések",
        kpiNoteMedianNm: "Medián: {median}",
        kpiNoteNm: "A szűrt lakások átlagos mérete",
        kpiTypicalRange: "Tipikus ársáv",
        kpiNoteTypicalRange: "Az ingatlanok középső fele ebbe a sávba esik",
        kpiNmRange: "€/m² sáv",
        kpiNoteNmRange: "A legolcsóbb és a legdrágább négyzetméterár",
        statsInsightsTitle: "Összefoglaló és megjegyzések",
        insightAvg: "Egy négyzetméter átlagosan <b>{nm}</b>, így egy átlagos 60 m²-es lakás kb. <b>{price60}</b>.",
        insightDistrict: "Legolcsóbb kerület: <b>{cheap}</b> ({cheapNm}), legdrágább: <b>{exp}</b> ({expNm}). Csak a legalább 3 ingatlanos kerületeket hasonlítjuk.",
        insightNoDistrict: "Az ingatlanok {pct}%-ánál nincs megadva kerület – a táblázatban a tömeges szerkesztéssel pótolhatod, így pontosabb lesz az elemzés.",
        insightCondition: "A jó állapotú lakások négyzetmétere átlagosan <b>{pct}%-kal</b> drágább, mint a felújítandóké ({diff} különbség).",
        insightRooms: "{small}: átlagosan <b>{smallNm}</b>, {big}: <b>{bigNm}</b>.",
        insightSource: "A legtöbb hirdetés innen van: <b>{source}</b> ({pct}%).",
        insightVsCityUp: "A szűrt ingatlanok négyzetméterára <b>{pct}%-kal magasabb</b> a városi átlagnál ({city}).",
        insightVsCityDown: "A szűrt ingatlanok négyzetméterára <b>{pct}%-kal alacsonyabb</b> a városi átlagnál ({city}).",
        insightMissing: "{db} ingatlannál hiányzik az ár vagy az alapterület, ezek kimaradnak a számításból.",
        statsDistTitle: "Négyzetméterárak eloszlása",
        noteDist: "Hány ingatlan esik az egyes €/m² sávokba. Ha szétszórt, nagyon eltérőek az árak.",
        chartLegendProperties: "Ingatlanok",
        pcsWord: "db",
        statsByAllapot: "Állapot szerint",
        statsByRooms: "Szobaszám szerint",
        statsByFloor: "Emelet szerint",
        statsByKerulet: "Kerület szerint",
        statsBySource: "Hirdetési oldal szerint",
        noteAllapot: "Hogyan befolyásolja az állapot a négyzetméterárat.",
        noteRooms: "A kisebb lakások négyzetmétere általában drágább.",
        noteFloor: "A földszinti és a legfelső emeleti lakások gyakran olcsóbbak.",
        noteKerulet: "A kerületek árszintje. Kevés ingatlan = kevésbé megbízható átlag.",
        noteSource: "Melyik hirdetési oldalról származnak az ingatlanok, és milyen árszinten.",
        statsColCategory: "Kategória",
        statsColCount: "Darab",
        statsColShare: "Arány",
        statsColAvgPrice: "Átlagár",
        statsColAvgPriceNm: "Átlag €/m²",
        statsColVsAvg: "Átlaghoz képest",
        statsOneGroup: "A jelenlegi szűrésben csak egy kategória van.",
        unknownLabel: "Ismeretlen",
        groundFloorLabel: "Földszint",
        floorWord: "emelet",
        floorPlusLabel: "4. emelet +",
        roomWord: "szobás",
        roomsLabel: "{n} szobás",
        roomsPlusLabel: "4+ szobás",
        keruletNincsMegadva: "Nincs megadva",
        allCities: "Összes város",

        historySaveTitle: "Piaci állapot mentése",
        historySaveNote: "A mentés eltárolja a mai átlagokat. Ha rendszeresen (pl. havonta) mentesz, követheted, hogyan változnak az árak.",
        historySaveBtn: "{city} mentése most",
        historyEmpty: "Még nincs mentett piaci állapot.",
        historyDelete: "Mentés törlése",

        compareNeedTwo: "Az összehasonlításhoz legalább két mentett piaci állapot kell.",
        compareNote: "Két mentett piaci állapot összevetése: hogyan változtak az árak a két időpont között.",
        compareFrom: "Korábbi állapot",
        compareTo: "Későbbi állapot",
        compareBtn: "Összehasonlítás",
        compareDifferentCity: "A két mentés különböző városhoz tartozik – az összehasonlítás félrevezető lehet.",
        compareAvgPrice: "Átlagár",
        compareAvgPriceNm: "Átlag €/m²",
        compareByAllapot: "Változás állapot szerint",
        compareByRooms: "Változás szobaszám szerint",
        compareByFloor: "Változás emelet szerint",
        compareByKerulet: "Változás kerület szerint",
        compareOldNm: "Előtte €/m²",
        compareNewNm: "Utána €/m²",
        compareChange: "Változás",

        trendNote: "Az ártrend a mentett piaci állapotokból (Előzmények fül) készül.",
        trendIndicator: "Mutató",
        trendOptAvgPriceNm: "Átlag €/m²",
        trendOptAvgPrice: "Átlagár",
        trendOptCount: "Ingatlanok száma",
        trendFrom: "Ettől",
        trendTo: "Eddig",
        trendNeedMore: "A trendhez legalább két mentett piaci állapot kell.",
        trendPoints: "adatpont",

        valTitle: "Ingatlan értékbecslő",
        valSubtitle: "Add meg a lakás adatait, és a hasonló ingatlanok alapján megbecsüljük az árát.",
        valAskingPrice: "Kért ár (nem kötelező)",
        valAskingPriceHelp: "Ha megadod, megmutatjuk, drága-e vagy olcsó a becsléshez képest.",
        valBtn: "Becslés",
        valHowTitle: "Hogyan működik?",
        valHow1: "A kiválasztott város összes ingatlanát vesszük az adatbázisból.",
        valHow2: "Megkeressük a leghasonlóbbakat: méret, szobaszám, kerület, állapot és emelet alapján.",
        valHow3: "Ezek négyzetméteráraiból súlyozott átlagot számolunk – minél hasonlóbb, annál többet számít.",
        valHow4: "Az ársáv azt mutatja, hol van a hasonló ingatlanok középső fele.",
        valDisclaimer: "Ez hirdetési árakon alapuló becslés, nem hivatalos értékbecslés.",
        valAlertNm: "Add meg az alapterületet!",
        valNotEnough: "Ebben a városban nincs elég ingatlan a becsléshez (legalább 3 kell).",
        valConfHigh: "Megbízható",
        valConfMedium: "Közepesen megbízható",
        valConfLow: "Kevésbé megbízható",
        valAskFair: "A kért ár a tipikus sávon belül van.",
        valAskHigh: "A kért ár a tipikus sáv felett van – drága.",
        valAskLow: "A kért ár a tipikus sáv alatt van – olcsó (érdemes utánanézni, miért!).",
        valCityAvg: "Városi átlag",
        valDistrictAvg: "Kerületi átlag",
        valPool: "Ingatlanok a városban",
        valEstimate: "Becsült ár",
        valRange: "Tipikus sáv",
        valContext: "Piaci háttér",
        valMethod: "A {n} leghasonlóbb ingatlan alapján, hasonlóság szerint súlyozva. A legolcsóbb és a legdrágább kimarad.",
        valComparables: "A becsléshez használt hasonló ingatlanok",
        valSimilarity: "Hasonlóság",

        userTitle: "Felhasználó",
        userLoginTitle: "Bejelentkezés",
        userComingSoon: "A felhasználói fiókok hamarosan érkeznek.",
        userGoogleBtn: "Belépés Google fiókkal",
        userEmailBtn: "Belépés e-mail címmel",
        userSoonBadge: "Hamarosan",
        userWhatTitle: "Mit tudsz majd bejelentkezve?",
        userFeat1: "Saját ingatlanhirdetéseket tölthetsz fel.",
        userFeat2: "A saját hirdetéseidet csak te szerkesztheted és törölheted.",
        userFeat3: "Saját kedvenclistád lesz, bármelyik eszközről eléred.",
        userFeat4: "Mentett keresések és piaci elemzések.",
        userCurrentAccess: "Addig az oldal egy közös jelszóval védett.",

        alertNincsKivalasztva: "Nincs kiválasztott ingatlan!",
        alertConfirmDelete: "Biztosan törlöd ezt az ingatlant?",
        alertDeleted: "Ingatlan törölve!",
        alertNoVaros: "Válassz várost!",
        alertNoPriceNm: "Add meg az árat és az alapterületet!",
        alertSaveSuccess: "Sikeres mentés!",
        alertSaveError: "Hiba történt a mentés közben!",
        alertLoadError: "Nem sikerült betölteni az adatokat a szerverről.",
        alertNewCityPrompt: "Új város neve:",
        alertNewCityError: "Hiba történt a város hozzáadásakor.",
        alertNewDistrictPrompt: "Új kerület / városrész neve:",
        alertNewDistrictError: "Hiba történt a kerület hozzáadásakor.",
        alertChooseCityFirst: "Előbb válassz várost!",
        alertConfirmDeleteSnapshot: "Biztosan törlöd ezt a mentést?",
        alertConfirmSaveStats: "Elmented a jelenlegi piaci állapotot?",
        alertStatsSaved: "Piaci állapot elmentve!",
        alertStatsSaveError: "Hiba történt a mentés közben.",

        bulkSelectedSuffix: "ingatlan kiválasztva",
        bulkKeruletLabel: "Kerület:",
        bulkKeruletChoose: "— válassz kerületet —",
        bulkApplyBtn: "Kerület alkalmazása",
        bulkCancelBtn: "Kijelölés törlése",
        bulkAlertConfirm: "Beállítod a kerületet a kiválasztott ingatlanokra?",
        bulkAlertNoKerulet: "Előbb válassz kerületet!",
        bulkAlertSuccess: "A kerület frissítve a kiválasztott ingatlanoknál!",
        bulkAlertError: "Hiba történt a frissítés közben."

    },

    // ======================================================== ROMÂNĂ
    ro: {

        darkModeOn: "Mod întunecat",
        darkModeOff: "Mod luminos",
        darkModeToggle: "Mod întunecat / luminos",
        menuIngatlanok: "Proprietăți",
        menuIngatlanokDesc: "Căutare, tabel, hartă",
        menuUj: "Proprietate nouă",
        menuUjDesc: "Încarcă un anunț",
        menuStatisztika: "Analiza pieței",
        menuStatisztikaDesc: "Medii, defalcări, tendințe",
        menuKedvencek: "Favorite",
        menuKedvencekDesc: "Proprietăți salvate",
        menuErtekbecslo: "Evaluare",
        menuErtekbecsloDesc: "Cât valorează un apartament?",
        menuFelhasznalo: "Utilizator",
        menuFelhasznaloDesc: "Autentificare, profil",

        searchTitle: "Căutare",
        searchVaros: "Oraș",
        searchTabParams: "Parametri",
        searchTabSources: "Site de anunțuri",
        searchAr: "Preț (€)",
        searchNm: "Suprafață (m²)",
        phMin: "min",
        phMax: "max",
        minSzoba: "Min. camere",
        minEmelet: "Etaj min.",
        allapot: "Stare",
        allapotMindegy: "Oricare",
        allapotFelujitando: "necesită renovare",
        allapotReszben: "parțial renovat",
        allapotJo: "bună",
        allapotUjszeru: "ca nou",
        allapotLuxus: "lux",
        kerulet: "Cartier",
        sourcesHelp: "Alege de pe ce site-uri de anunțuri să provină proprietățile.",
        sourcesAll: "Toate",
        sourcesNone: "Niciunul",
        sourcesEmpty: "Încă nu există proprietăți în acest oraș.",
        sourceLocal: "Doar pe IngatlanPro",
        sourceOther: "Altul / link invalid",
        keresesBtn: "Caută",
        resetFiltersBtn: "Șterge filtrele",

        dbOsszes: "Rezultate",
        dbAtlagAr: "Preț mediu",
        dbAtlagNm: "Medie €/m²",
        dbEladva: "Vândute",

        tableTitle: "Proprietăți",
        colAr: "Preț",
        colNm: "m²",
        colArNm: "€/m²",
        colSzoba: "Camere",
        colEmelet: "Etaj",
        colKerulet: "Cartier",
        colAllapot: "Stare",
        colForras: "Site anunț",

        detailPanelTitle: "Detalii proprietate",
        detailNincsKivalasztva: "Nimic selectat",
        detailAr: "Preț",
        detailArNm: "Preț / m²",
        detailNm: "Suprafață",
        detailSzoba: "Camere",
        detailEmelet: "Etaj",
        detailAllapot: "Stare",
        detailVaros: "Oraș",
        detailHely: "Oraș, cartier",
        detailKerulet: "Cartier",
        detailLink: "Deschide anunțul",
        detailValuate: "Evaluează proprietatea",
        detailEdit: "Editează",
        detailDelete: "Șterge",
        favAdd: "☆ La favorite",
        favRemove: "⭐ Favorit",

        mapTitle: "Hartă",
        popupProperty: "Proprietatea #",
        popupLink: "Deschide anunțul",

        newTitle: "Adaugă proprietate nouă",
        editTitle: "Editează proprietatea",
        newSubtitle: "Completează datele și marchează locația pe hartă.",
        newLink: "Link anunț",
        newLinkHelp: "Lasă gol dacă proprietatea este listată doar pe IngatlanPro.",
        newAr: "Preț (€)",
        newNm: "Suprafață (m²)",
        newSzobak: "Camere",
        newEmelet: "Etaj",
        newOsszEmelet: "Total etaje",
        newVaros: "Oraș",
        newAddVaros: "Adaugă oraș nou",
        newKerulet: "Cartier / zonă",
        newAddKerulet: "Adaugă cartier nou",
        newKeruletNincs: "— nespecificat —",
        newAllapot: "Stare",
        newHely: "Locație",
        newHelyHelp: "Dă click pe hartă unde se află proprietatea.",
        newCancelBtn: "Anulează",
        newSaveBtn: "Salvează proprietatea",

        favTitle: "Favorite",
        favSubtitle: "Dă click pe un rând pentru a deschide proprietatea.",
        favDeleteConfirm: "Elimini de la favorite?",
        favDeleteTitle: "Elimină de la favorite",
        favEmpty: "Încă nu ai favorite – apasă pe ☆ în tabel.",

        statsTitle: "Analiza pieței",
        statsSubtitle: "Toate cifrele se referă la filtrul setat în panoul de căutare.",
        statsCurrent: "Piața actuală",
        statsHistory: "Istoric",
        statsCompare: "Comparație",
        statsTrend: "Tendința prețurilor",
        statsBasedOn: "Calculat pentru:",
        statsChangeFilter: "Modifică filtrul",
        currentNoResults: "Nicio proprietate nu corespunde filtrului actual.",
        statsKeyFigures: "Cifre cheie",
        dashLabelCount: "Proprietăți",
        dashLabelAvgPrice: "Preț mediu",
        dashLabelAvgPriceNm: "Medie €/m²",
        dashLabelAvgNm: "Suprafață medie",
        kpiNoteCount: "din care {sold} marcate ca vândute",
        kpiNoteMedian: "Mediana: {median} – prețul din mijloc, mai puțin influențat de anunțurile extreme",
        kpiNoteMedianNm: "Mediana: {median}",
        kpiNoteNm: "Mărimea medie a apartamentelor din filtru",
        kpiTypicalRange: "Interval tipic de preț",
        kpiNoteTypicalRange: "Jumătatea din mijloc a proprietăților se încadrează aici",
        kpiNmRange: "Interval €/m²",
        kpiNoteNmRange: "Cel mai mic și cel mai mare preț pe metru pătrat",
        statsInsightsTitle: "Rezumat și observații",
        insightAvg: "Un metru pătrat costă în medie <b>{nm}</b>, deci un apartament tipic de 60 m² este cam <b>{price60}</b>.",
        insightDistrict: "Cel mai ieftin cartier: <b>{cheap}</b> ({cheapNm}); cel mai scump: <b>{exp}</b> ({expNm}). Se compară doar cartierele cu cel puțin 3 proprietăți.",
        insightNoDistrict: "La {pct}% dintre proprietăți nu este setat cartierul – folosește editarea în masă din tabel pentru o analiză mai precisă.",
        insightCondition: "Apartamentele în stare bună sunt cu <b>{pct}%</b> mai scumpe pe m² decât cele care necesită renovare (diferență de {diff}).",
        insightRooms: "Apartamente cu {small}: <b>{smallNm}</b>, cu {big}: <b>{bigNm}</b> în medie.",
        insightSource: "Cele mai multe anunțuri provin de pe <b>{source}</b> ({pct}%).",
        insightVsCityUp: "Proprietățile filtrate sunt cu <b>{pct}% mai scumpe</b> pe m² decât media orașului ({city}).",
        insightVsCityDown: "Proprietățile filtrate sunt cu <b>{pct}% mai ieftine</b> pe m² decât media orașului ({city}).",
        insightMissing: "La {db} proprietăți lipsește prețul sau suprafața, acestea sunt excluse din calcule.",
        statsDistTitle: "Distribuția prețului pe m²",
        noteDist: "Câte proprietăți se încadrează în fiecare interval €/m². O împrăștiere mare înseamnă prețuri foarte diferite.",
        chartLegendProperties: "Proprietăți",
        pcsWord: "buc",
        statsByAllapot: "După stare",
        statsByRooms: "După numărul de camere",
        statsByFloor: "După etaj",
        statsByKerulet: "După cartier",
        statsBySource: "După site-ul de anunțuri",
        noteAllapot: "Cum influențează starea prețul pe metru pătrat.",
        noteRooms: "Apartamentele mai mici sunt de obicei mai scumpe pe m².",
        noteFloor: "Parterul și ultimele etaje sunt adesea mai ieftine.",
        noteKerulet: "Nivelul prețurilor pe cartiere. Puține proprietăți = medie mai puțin sigură.",
        noteSource: "De pe ce site-uri provin proprietățile și la ce nivel de preț.",
        statsColCategory: "Categorie",
        statsColCount: "Număr",
        statsColShare: "Pondere",
        statsColAvgPrice: "Preț mediu",
        statsColAvgPriceNm: "Medie €/m²",
        statsColVsAvg: "Față de medie",
        statsOneGroup: "Doar o categorie în filtrul actual.",
        unknownLabel: "Necunoscut",
        groundFloorLabel: "Parter",
        floorWord: "etaj",
        floorPlusLabel: "Etaj 4 +",
        roomWord: "camere",
        roomsLabel: "{n} camere",
        roomsPlusLabel: "4+ camere",
        keruletNincsMegadva: "Nespecificat",
        allCities: "Toate orașele",

        historySaveTitle: "Salvează starea pieței",
        historySaveNote: "Salvarea păstrează mediile de azi. Dacă salvezi regulat (de ex. lunar), poți urmări cum se schimbă prețurile.",
        historySaveBtn: "Salvează {city} acum",
        historyEmpty: "Încă nu există stări de piață salvate.",
        historyDelete: "Șterge salvarea",

        compareNeedTwo: "Pentru comparație sunt necesare cel puțin două stări de piață salvate.",
        compareNote: "Compară două stări de piață salvate: cum s-au schimbat prețurile între cele două date.",
        compareFrom: "Starea anterioară",
        compareTo: "Starea ulterioară",
        compareBtn: "Compară",
        compareDifferentCity: "Cele două salvări aparțin unor orașe diferite – comparația poate fi înșelătoare.",
        compareAvgPrice: "Preț mediu",
        compareAvgPriceNm: "Medie €/m²",
        compareByAllapot: "Schimbare după stare",
        compareByRooms: "Schimbare după numărul de camere",
        compareByFloor: "Schimbare după etaj",
        compareByKerulet: "Schimbare după cartier",
        compareOldNm: "Înainte €/m²",
        compareNewNm: "După €/m²",
        compareChange: "Schimbare",

        trendNote: "Tendința se construiește din stările de piață salvate (fila Istoric).",
        trendIndicator: "Indicator",
        trendOptAvgPriceNm: "Medie €/m²",
        trendOptAvgPrice: "Preț mediu",
        trendOptCount: "Număr de proprietăți",
        trendFrom: "De la",
        trendTo: "Până la",
        trendNeedMore: "Pentru o tendință sunt necesare cel puțin două stări de piață salvate.",
        trendPoints: "puncte",

        valTitle: "Evaluarea proprietății",
        valSubtitle: "Introdu datele apartamentului și estimăm prețul pe baza proprietăților similare.",
        valAskingPrice: "Preț cerut (opțional)",
        valAskingPriceHelp: "Dacă îl introduci, îți arătăm dacă este ieftin sau scump față de estimare.",
        valBtn: "Estimează",
        valHowTitle: "Cum funcționează?",
        valHow1: "Luăm toate proprietățile din orașul ales din baza noastră de date.",
        valHow2: "Căutăm cele mai asemănătoare: suprafață, camere, cartier, stare și etaj.",
        valHow3: "Din prețul lor pe m² calculăm o medie ponderată – cu cât mai asemănătoare, cu atât contează mai mult.",
        valHow4: "Intervalul arată unde se află jumătatea din mijloc a proprietăților similare.",
        valDisclaimer: "Aceasta este o estimare pe baza prețurilor din anunțuri, nu o evaluare oficială.",
        valAlertNm: "Introdu suprafața!",
        valNotEnough: "Nu sunt destule proprietăți în acest oraș pentru o estimare (minim 3).",
        valConfHigh: "Încredere ridicată",
        valConfMedium: "Încredere medie",
        valConfLow: "Încredere scăzută",
        valAskFair: "Prețul cerut este în intervalul tipic.",
        valAskHigh: "Prețul cerut este peste intervalul tipic – scump.",
        valAskLow: "Prețul cerut este sub intervalul tipic – ieftin (verifică de ce!).",
        valCityAvg: "Media orașului",
        valDistrictAvg: "Media cartierului",
        valPool: "Proprietăți în oraș",
        valEstimate: "Preț estimat",
        valRange: "Interval tipic",
        valContext: "Contextul pieței",
        valMethod: "Pe baza celor mai asemănătoare {n} proprietăți, ponderate după asemănare. Cea mai ieftină și cea mai scumpă sunt excluse.",
        valComparables: "Proprietăți similare folosite",
        valSimilarity: "Asemănare",

        userTitle: "Utilizator",
        userLoginTitle: "Autentificare",
        userComingSoon: "Conturile de utilizator vin în curând.",
        userGoogleBtn: "Autentificare cu Google",
        userEmailBtn: "Autentificare cu e-mail",
        userSoonBadge: "În curând",
        userWhatTitle: "Ce vei putea face autentificat?",
        userFeat1: "Încarci propriile anunțuri imobiliare.",
        userFeat2: "Doar tu îți poți edita și șterge anunțurile.",
        userFeat3: "Lista ta de favorite, pe orice dispozitiv.",
        userFeat4: "Căutări și analize de piață salvate.",
        userCurrentAccess: "Până atunci site-ul este protejat cu o parolă comună.",

        alertNincsKivalasztva: "Nicio proprietate selectată!",
        alertConfirmDelete: "Sigur vrei să ștergi această proprietate?",
        alertDeleted: "Proprietate ștearsă!",
        alertNoVaros: "Alege un oraș!",
        alertNoPriceNm: "Introdu prețul și suprafața!",
        alertSaveSuccess: "Salvat cu succes!",
        alertSaveError: "A apărut o eroare la salvare!",
        alertLoadError: "Nu s-au putut încărca datele de pe server.",
        alertNewCityPrompt: "Numele noului oraș:",
        alertNewCityError: "A apărut o eroare la adăugarea orașului.",
        alertNewDistrictPrompt: "Numele noului cartier / zone:",
        alertNewDistrictError: "A apărut o eroare la adăugarea cartierului.",
        alertChooseCityFirst: "Alege mai întâi un oraș!",
        alertConfirmDeleteSnapshot: "Sigur vrei să ștergi această salvare?",
        alertConfirmSaveStats: "Salvezi starea actuală a pieței?",
        alertStatsSaved: "Starea pieței a fost salvată!",
        alertStatsSaveError: "A apărut o eroare la salvare.",

        bulkSelectedSuffix: "proprietăți selectate",
        bulkKeruletLabel: "Cartier:",
        bulkKeruletChoose: "— alege un cartier —",
        bulkApplyBtn: "Aplică cartierul",
        bulkCancelBtn: "Șterge selecția",
        bulkAlertConfirm: "Setezi cartierul pentru proprietățile selectate?",
        bulkAlertNoKerulet: "Alege mai întâi un cartier!",
        bulkAlertSuccess: "Cartierul a fost actualizat pentru proprietățile selectate!",
        bulkAlertError: "A apărut o eroare la actualizare."

    }

};

class I18n {

    static current = (() => {
        try { return localStorage.getItem("lang") || "en"; } catch (e) { return "en"; }
    })();

    static listeners = [];

    static t(key) {

        const dict = I18N_STRINGS[I18n.current] || I18N_STRINGS.en;

        if (dict[key] !== undefined) return dict[key];

        if (I18N_STRINGS.en[key] !== undefined) return I18N_STRINGS.en[key];

        return key;

    }

    // Szöveg behelyettesítéssel: I18n.f("kpiNoteCount", { sold: 3 })
    static f(key, params = {}) {

        return I18n.t(key).replace(/\{(\w+)\}/g, (m, name) =>
            params[name] !== undefined ? params[name] : m
        );

    }

    static onChange(fn) {
        I18n.listeners.push(fn);
    }

    static setLanguage(lang) {

        if (!I18N_STRINGS[lang]) return;

        I18n.current = lang;

        try { localStorage.setItem("lang", lang); } catch (e) { /* nem kritikus */ }

        document.documentElement.lang = lang;

        I18n.applyStatic();
        I18n.updateButtons();

        I18n.listeners.forEach(fn => {
            try {
                fn();
            } catch (err) {
                console.error("I18n listener hiba:", err);
            }
        });

    }

    static updateButtons() {
        document.querySelectorAll(".langBtn").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.lang === I18n.current);
        });
    }

    static applyStatic() {

        document.querySelectorAll("[data-i18n]").forEach(el => {
            el.innerText = I18n.t(el.getAttribute("data-i18n"));
        });

        document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
            el.placeholder = I18n.t(el.getAttribute("data-i18n-placeholder"));
        });

        document.querySelectorAll("[data-i18n-title]").forEach(el => {
            el.title = I18n.t(el.getAttribute("data-i18n-title"));
        });

    }

    // Mentett statisztikák nyers (magyar) értékeinek fordítása
    static translateStatValue(value) {

        if (value === null || value === undefined || value === "") {
            return I18n.t("unknownLabel");
        }

        const v = String(value).trim();

        if (typeof Utils !== "undefined" && Utils.normAllapot(v) && ["felújítandó", "részbenfel", "jó", "újszerű", "luxus"].includes(Utils.normAllapot(v))) {
            return Utils.allapotLabel(v);
        }

        if (v === "Földszint") return I18n.t("groundFloorLabel");
        if (v === "4+ emelet" || v === "4+") return I18n.t("floorPlusLabel");

        const m = v.match(/^(\d+)\.?\s*emelet$/);
        if (m) return `${m[1]}. ${I18n.t("floorWord")}`;

        if (v === "Ismeretlen") return I18n.t("unknownLabel");
        if (v === "Nincs megadva") return I18n.t("keruletNincsMegadva");

        return v;

    }

    static init() {

        document.documentElement.lang = I18n.current;

        document.querySelectorAll(".langBtn").forEach(btn => {
            btn.onclick = () => I18n.setLanguage(btn.dataset.lang);
        });

        I18n.updateButtons();
        I18n.applyStatic();

    }

}

// Az I18n.init a többi modul előtt fut (ez a fájl töltődik be elsőként)
document.addEventListener("DOMContentLoaded", () => {
    I18n.init();
});
