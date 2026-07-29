const I18N_STRINGS = {

    en: {

        // Navbar
        darkModeOn: "🌙 Dark mode",
        darkModeOff: "☀️ Light mode",

        // Sidebar menu
        menuTitle: "Menu",
        menuIngatlanok: "Properties",
        menuUj: "New property",
        menuStatisztika: "Market statistics",
        menuKedvencek: "Favorites",

        // Search
        searchTitle: "🔍 Search",
        minAr: "Minimum price",
        maxAr: "Maximum price",
        minNm: "Minimum m²",
        maxNm: "Maximum m²",
        minSzoba: "Minimum rooms",
        minEmelet: "Minimum floor",
        allapot: "Condition",
        allapotMindegy: "Any",
        allapotFelujitando: "needs renovation",
        allapotJo: "good",
        allapotUjszeru: "like new",
        allapotLuxus: "luxury",
        kerulet: "District",
        keresesBtn: "🔍 Search",

        // Dashboard cards
        dbOsszes: "🏠 Total properties",
        dbAtlagAr: "💰 Average price",
        dbAtlagNm: "📐 Average €/m²",
        dbEladva: "✅ Sold",

        // Table
        tableTitle: "Properties",
        colAr: "💶 Price",
        colNm: "📐 m²",
        colArNm: "💰 €/m²",
        colSzoba: "🛏",
        colEmelet: "🏢",
        colKerulet: "📍 District",
        colAllapot: "🔧 Condition",
        colDelete: "🗑️",

        // Detail panel
        detailNincsKivalasztva: "Nothing selected",
        detailPanelTitle: "Property details",
        liveBadge: "Live",
        detailAr: "💰 Price",
        detailNm: "📐 Area",
        detailSzoba: "🛏 Rooms",
        detailEmelet: "🏢 Floor",
        detailVaros: "🏙 City",
        detailKerulet: "📍 District",
        detailAllapot: "🔧 Condition",
        detailLink: "🌐 Open listing",
        detailEdit: "✏️ Edit property",
        detailDelete: "🗑️ Delete property",
        detailSaveStats: "💾 Save market snapshot",
        favAdd: "☆ Add to favorites",
        favRemove: "⭐ Remove from favorites",

        // Map
        mapTitle: "Map",
        popupProperty: "🏠 Property #",
        popupAr: "💶 Price:",
        popupNm: "📐 Area:",
        popupArNm: "💰 €/m²:",
        popupAllapot: "🔧 Condition:",
        popupLink: "🌐 Open listing",

        // New property page
        newTitle: "➕ Add new property",
        newLink: "Link",
        newAr: "Price (€)",
        newNm: "m²",
        newSzobak: "Rooms",
        newEmelet: "Floor",
        newOsszEmelet: "Total floors",
        newVaros: "City",
        newAddVaros: "Add new city",
        newKerulet: "District / area",
        newAddKerulet: "Add new district",
        newKeruletNincs: "— not specified —",
        newAllapot: "Condition",
        newHely: "📍 Choose location",
        newSaveBtn: "💾 Save property",

        // Favorites page
        favTitle: "⭐ Favorites",
        favDeleteConfirm: "Remove from favorites?",
        favDeleteTitle: "Remove from favorites",

        // Statistics
        statsTitle: "Market statistics",
        statsCurrent: "Current market",
        statsHistory: "Market history",
        statsCompare: "Market comparison",
        statsTrend: "Price trend",
        statsSnapshotLabel: "Market snapshot:",
        statsLoadBtn: "Load",
        statsPropertyCount: "🏠 Properties",
        statsAvgPrice: "💶 Average price",
        statsAvgPriceNm: "💰 Average €/m²",
        statsByAllapot: "🔧 Breakdown by condition",
        statsByRooms: "🛏 Breakdown by room count",
        statsByFloor: "🏢 Breakdown by floor",
        statsColAllapot: "Condition",
        statsColSzobak: "Rooms",
        statsColEmelet: "Floor",
        statsColCount: "Count",
        statsColAvgPrice: "Average price",
        statsColAvgPriceNm: "Average €/m²",
        compareTitle: "📊 Market comparison",
        compareFrom: "First snapshot",
        compareTo: "Second snapshot",
        compareBtn: "Compare",
        compareAvgPrice: "Average price",
        compareAvgPriceNm: "Average €/m²",
        compareByAllapot: "🔧 Change by condition",
        compareByRooms: "🛏 Change by room count",
        compareByFloor: "🏢 Change by floor",
        compareOldNm: "Old €/m²",
        compareNewNm: "New €/m²",
        compareChange: "Change",

        // Alerts / confirms
        alertNincsKivalasztva: "No property selected!",
        alertConfirmDelete: "Are you sure you want to delete this property?",
        alertDeleted: "Property deleted!",
        alertConfirmSaveStats: "Are you sure you want to save a market snapshot?",
        alertStatsSaved: "Market snapshot saved successfully!",
        alertStatsSaveError: "Something went wrong while saving.",
        alertNoVaros: "Please choose a city!",
        alertSaveSuccess: "Saved successfully!",
        alertSaveError: "Something went wrong while saving!",
        alertNewCityPrompt: "New city name:",
        alertNewCityError: "Something went wrong while adding the city.",
        alertNewDistrictPrompt: "New district / area name:",
        alertNewDistrictError: "Something went wrong while adding the district.",
        alertChooseCityFirst: "Please choose a city first!",
        alertConfirmDeleteSnapshot: "Are you sure you want to delete this snapshot?",
        alertSnapshotDeleted: "Snapshot deleted.",

        // Statistics sub-pages (current / charts / trend)
        currentNoResults: "No results for the current filter.",
        currentMarketTitle: "📈 Current market",
        chartsTitle: "Market charts",
        chartAllapotTitle: "Distribution by condition",
        chartRoomsTitle: "Distribution by room count",
        chartFloorsTitle: "Distribution by floor",
        chartKeruletTitle: "Distribution by district",
        detailedAnalysisTitle: "Detailed analysis",
        chartLegendProperties: "Properties",

        dashOverviewTitle: "📈 Current market overview",
        dashLabelCount: "Properties",
        dashLabelAvgPrice: "Average price",
        dashLabelAvgNm: "Average m²",
        dashLabelAvgPriceNm: "Average €/m²",
        dashLabelMinPriceNm: "Minimum €/m²",
        dashLabelMaxPriceNm: "Maximum €/m²",

        statsByKerulet: "📍 Breakdown by district",
        compareByKerulet: "📍 Change by district",

        unknownLabel: "Unknown",
        groundFloorLabel: "Ground floor",
        floorWord: "floor",
        floorPlusLabel: "4+ floors",
        roomWord: "rooms",
        roomsPlusLabel: "4+ rooms",
        keruletNincsMegadva: "Not specified",

        trendTitle: "📈 Price trend",
        trendFrom: "From date",
        trendTo: "To date",
        trendIndicator: "Indicator",
        trendOptAvgPriceNm: "Average €/m²",
        trendOptAvgPrice: "Average price",
        trendOptCount: "Number of properties",

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

    hu: {

        darkModeOn: "🌙 Sötét mód",
        darkModeOff: "☀️ Világos mód",

        menuTitle: "Menü",
        menuIngatlanok: "Ingatlanok",
        menuUj: "Új ingatlan",
        menuStatisztika: "Piaci statisztikák",
        menuKedvencek: "Kedvencek",

        searchTitle: "🔍 Keresés",
        minAr: "Minimum ár",
        maxAr: "Maximum ár",
        minNm: "Minimum nm",
        maxNm: "Maximum nm",
        minSzoba: "Minimum szobák",
        minEmelet: "Minimum emelet",
        allapot: "Állapot",
        allapotMindegy: "Mindegy",
        allapotFelujitando: "felújítandó",
        allapotJo: "jó",
        allapotUjszeru: "újszerű",
        allapotLuxus: "luxus",
        kerulet: "Kerület",
        keresesBtn: "🔍 Keresés",

        dbOsszes: "🏠 Összes ingatlan",
        dbAtlagAr: "💰 Átlag ár",
        dbAtlagNm: "📐 Átlag €/m²",
        dbEladva: "✅ Eladva",

        tableTitle: "Ingatlanok",
        colAr: "💶 Ár",
        colNm: "📐 m²",
        colArNm: "💰 €/m²",
        colSzoba: "🛏",
        colEmelet: "🏢",
        colKerulet: "📍 Kerület",
        colAllapot: "🔧 Állapot",
        colDelete: "🗑️",

        detailNincsKivalasztva: "Nincs kiválasztva",
        detailPanelTitle: "Ingatlan adatai",
        liveBadge: "Élő",
        detailAr: "💰 Ár",
        detailNm: "📐 Alapterület",
        detailSzoba: "🛏 Szobák",
        detailEmelet: "🏢 Emelet",
        detailVaros: "🏙 Város",
        detailKerulet: "📍 Kerület",
        detailAllapot: "🔧 Állapot",
        detailLink: "🌐 Hirdetés megnyitása",
        detailEdit: "✏️ Ingatlan szerkesztése",
        detailDelete: "🗑️ Ingatlan törlése",
        detailSaveStats: "💾 Piaci állapot mentése",
        favAdd: "☆ Kedvencekhez adás",
        favRemove: "⭐ Kedvenc eltávolítása",

        mapTitle: "Térkép",
        popupProperty: "🏠 Ingatlan #",
        popupAr: "💶 Ár:",
        popupNm: "📐 Alapterület:",
        popupArNm: "💰 €/m²:",
        popupAllapot: "🔧 Állapot:",
        popupLink: "🌐 Hirdetés megnyitása",

        newTitle: "➕ Új ingatlan felvétele",
        newLink: "Link",
        newAr: "Ár (€)",
        newNm: "Nm",
        newSzobak: "Szobák",
        newEmelet: "Emelet",
        newOsszEmelet: "Összes emelet",
        newVaros: "Város",
        newAddVaros: "Új város hozzáadása",
        newKerulet: "Kerület / városrész",
        newAddKerulet: "Új kerület hozzáadása",
        newKeruletNincs: "— nincs megadva —",
        newAllapot: "Állapot",
        newHely: "📍 Hely kiválasztása",
        newSaveBtn: "💾 Ingatlan mentése",

        favTitle: "⭐ Kedvencek",
        favDeleteConfirm: "Törlöd a kedvencek közül?",
        favDeleteTitle: "Törlés a kedvencek közül",

        statsTitle: "Piaci statisztikák",
        statsCurrent: "Jelenlegi piac",
        statsHistory: "Piaci előzmények",
        statsCompare: "Piaci összehasonlítás",
        statsTrend: "Ártrend",
        statsSnapshotLabel: "Piaci mentés:",
        statsLoadBtn: "Betöltés",
        statsPropertyCount: "🏠 Ingatlanok",
        statsAvgPrice: "💶 Átlag ár",
        statsAvgPriceNm: "💰 Átlag €/m²",
        statsByAllapot: "🔧 Állapot szerinti elemzés",
        statsByRooms: "🛏 Szobaszám szerinti elemzés",
        statsByFloor: "🏢 Emelet szerinti elemzés",
        statsColAllapot: "Állapot",
        statsColSzobak: "Szobák",
        statsColEmelet: "Emelet",
        statsColCount: "Darab",
        statsColAvgPrice: "Átlag ár",
        statsColAvgPriceNm: "Átlag €/m²",
        compareTitle: "📊 Piaci összehasonlítás",
        compareFrom: "Első mentés",
        compareTo: "Második mentés",
        compareBtn: "Összehasonlítás",
        compareAvgPrice: "Átlag ár",
        compareAvgPriceNm: "Átlag €/m²",
        compareByAllapot: "🔧 Állapot szerinti változás",
        compareByRooms: "🛏 Szobaszám szerinti változás",
        compareByFloor: "🏢 Emelet szerinti változás",
        compareOldNm: "Régi €/m²",
        compareNewNm: "Új €/m²",
        compareChange: "Változás",

        alertNincsKivalasztva: "Nincs kiválasztott ingatlan!",
        alertConfirmDelete: "Biztosan törölni szeretnéd ezt az ingatlant?",
        alertDeleted: "Ingatlan törölve!",
        alertConfirmSaveStats: "Biztosan szeretnél egy piaci pillanatképet menteni?",
        alertStatsSaved: "Piaci pillanatkép sikeresen elmentve!",
        alertStatsSaveError: "Hiba történt a mentés során.",
        alertNoVaros: "Kérlek válassz várost!",
        alertSaveSuccess: "Mentés sikeres!",
        alertSaveError: "Hiba történt a mentés során!",
        alertNewCityPrompt: "Új város neve:",
        alertNewCityError: "Hiba történt a város hozzáadása közben.",
        alertNewDistrictPrompt: "Új kerület / városrész neve:",
        alertNewDistrictError: "Hiba történt a kerület hozzáadása közben.",
        alertChooseCityFirst: "Először válassz várost!",
        alertConfirmDeleteSnapshot: "Biztosan törölni szeretnéd ezt a mentést?",
        alertSnapshotDeleted: "Mentés törölve.",

        currentNoResults: "Nincs találat a jelenlegi szűrésre.",
        currentMarketTitle: "📈 Jelenlegi piac",
        chartsTitle: "Piaci diagramok",
        chartAllapotTitle: "Állapot szerinti eloszlás",
        chartRoomsTitle: "Szobaszám szerinti eloszlás",
        chartFloorsTitle: "Emeletek megoszlása",
        chartKeruletTitle: "Kerület szerinti eloszlás",
        detailedAnalysisTitle: "Részletes elemzések",
        chartLegendProperties: "Ingatlanok",

        dashOverviewTitle: "📈 Jelenlegi piaci áttekintés",
        dashLabelCount: "Ingatlanok",
        dashLabelAvgPrice: "Átlag ár",
        dashLabelAvgNm: "Átlag m²",
        dashLabelAvgPriceNm: "Átlag €/m²",
        dashLabelMinPriceNm: "Minimum €/m²",
        dashLabelMaxPriceNm: "Maximum €/m²",

        statsByKerulet: "📍 Kerület szerinti elemzés",
        compareByKerulet: "📍 Kerület szerinti változás",

        unknownLabel: "Ismeretlen",
        groundFloorLabel: "Földszint",
        floorWord: "emelet",
        floorPlusLabel: "4+ emelet",
        roomWord: "szoba",
        roomsPlusLabel: "4+ szoba",
        keruletNincsMegadva: "Nincs megadva",

        trendTitle: "📈 Piaci ártrend",
        trendFrom: "Dátumtól",
        trendTo: "Dátumig",
        trendIndicator: "Mutató",
        trendOptAvgPriceNm: "Átlag €/m²",
        trendOptAvgPrice: "Átlag ár",
        trendOptCount: "Ingatlanok száma",

        bulkSelectedSuffix: "ingatlan kiválasztva",
        bulkKeruletLabel: "Kerület:",
        bulkKeruletChoose: "— válassz kerületet —",
        bulkApplyBtn: "Kerület alkalmazása",
        bulkCancelBtn: "Kijelölés törlése",
        bulkAlertConfirm: "Beállítod a kerületet a kijelölt ingatlanoknál?",
        bulkAlertNoKerulet: "Kérlek válassz kerületet!",
        bulkAlertSuccess: "A kijelölt ingatlanok kerülete frissítve!",
        bulkAlertError: "Hiba történt a frissítés során."

    },

    ro: {

        darkModeOn: "🌙 Mod întunecat",
        darkModeOff: "☀️ Mod luminos",

        menuTitle: "Meniu",
        menuIngatlanok: "Proprietăți",
        menuUj: "Proprietate nouă",
        menuStatisztika: "Statistici de piață",
        menuKedvencek: "Favorite",

        searchTitle: "🔍 Căutare",
        minAr: "Preț minim",
        maxAr: "Preț maxim",
        minNm: "Minim m²",
        maxNm: "Maxim m²",
        minSzoba: "Camere minime",
        minEmelet: "Etaj minim",
        allapot: "Stare",
        allapotMindegy: "Oricare",
        allapotFelujitando: "de renovat",
        allapotJo: "bună",
        allapotUjszeru: "ca nouă",
        allapotLuxus: "lux",
        kerulet: "Cartier",
        keresesBtn: "🔍 Căutare",

        dbOsszes: "🏠 Total proprietăți",
        dbAtlagAr: "💰 Preț mediu",
        dbAtlagNm: "📐 Medie €/m²",
        dbEladva: "✅ Vândute",

        tableTitle: "Proprietăți",
        colAr: "💶 Preț",
        colNm: "📐 m²",
        colArNm: "💰 €/m²",
        colSzoba: "🛏",
        colEmelet: "🏢",
        colKerulet: "📍 Cartier",
        colAllapot: "🔧 Stare",
        colDelete: "🗑️",

        detailNincsKivalasztva: "Nimic selectat",
        detailPanelTitle: "Detalii proprietate",
        liveBadge: "Live",
        detailAr: "💰 Preț",
        detailNm: "📐 Suprafață",
        detailSzoba: "🛏 Camere",
        detailEmelet: "🏢 Etaj",
        detailVaros: "🏙 Oraș",
        detailKerulet: "📍 Cartier",
        detailAllapot: "🔧 Stare",
        detailLink: "🌐 Deschide anunțul",
        detailEdit: "✏️ Editează proprietatea",
        detailDelete: "🗑️ Șterge proprietatea",
        detailSaveStats: "💾 Salvează starea pieței",
        favAdd: "☆ Adaugă la favorite",
        favRemove: "⭐ Elimină din favorite",

        mapTitle: "Hartă",
        popupProperty: "🏠 Proprietate #",
        popupAr: "💶 Preț:",
        popupNm: "📐 Suprafață:",
        popupArNm: "💰 €/m²:",
        popupAllapot: "🔧 Stare:",
        popupLink: "🌐 Deschide anunțul",

        newTitle: "➕ Adaugă proprietate nouă",
        newLink: "Link",
        newAr: "Preț (€)",
        newNm: "m²",
        newSzobak: "Camere",
        newEmelet: "Etaj",
        newOsszEmelet: "Total etaje",
        newVaros: "Oraș",
        newAddVaros: "Adaugă oraș nou",
        newKerulet: "Cartier / zonă",
        newAddKerulet: "Adaugă cartier nou",
        newKeruletNincs: "— nespecificat —",
        newAllapot: "Stare",
        newHely: "📍 Alege locația",
        newSaveBtn: "💾 Salvează proprietatea",

        favTitle: "⭐ Favorite",
        favDeleteConfirm: "Elimini din favorite?",
        favDeleteTitle: "Elimină din favorite",

        statsTitle: "Statistici de piață",
        statsCurrent: "Piața curentă",
        statsHistory: "Istoric de piață",
        statsCompare: "Comparație de piață",
        statsTrend: "Tendința prețurilor",
        statsSnapshotLabel: "Instantaneu de piață:",
        statsLoadBtn: "Încarcă",
        statsPropertyCount: "🏠 Proprietăți",
        statsAvgPrice: "💶 Preț mediu",
        statsAvgPriceNm: "💰 Medie €/m²",
        statsByAllapot: "🔧 Analiză după stare",
        statsByRooms: "🛏 Analiză după număr de camere",
        statsByFloor: "🏢 Analiză după etaj",
        statsColAllapot: "Stare",
        statsColSzobak: "Camere",
        statsColEmelet: "Etaj",
        statsColCount: "Număr",
        statsColAvgPrice: "Preț mediu",
        statsColAvgPriceNm: "Medie €/m²",
        compareTitle: "📊 Comparație de piață",
        compareFrom: "Primul instantaneu",
        compareTo: "Al doilea instantaneu",
        compareBtn: "Compară",
        compareAvgPrice: "Preț mediu",
        compareAvgPriceNm: "Medie €/m²",
        compareByAllapot: "🔧 Schimbare după stare",
        compareByRooms: "🛏 Schimbare după număr de camere",
        compareByFloor: "🏢 Schimbare după etaj",
        compareOldNm: "€/m² vechi",
        compareNewNm: "€/m² nou",
        compareChange: "Schimbare",

        alertNincsKivalasztva: "Nicio proprietate selectată!",
        alertConfirmDelete: "Sigur vrei să ștergi această proprietate?",
        alertDeleted: "Proprietate ștearsă!",
        alertConfirmSaveStats: "Sigur vrei să salvezi un instantaneu de piață?",
        alertStatsSaved: "Instantaneul de piață a fost salvat cu succes!",
        alertStatsSaveError: "A apărut o eroare la salvare.",
        alertNoVaros: "Te rugăm alege un oraș!",
        alertSaveSuccess: "Salvat cu succes!",
        alertSaveError: "A apărut o eroare la salvare!",
        alertNewCityPrompt: "Numele noului oraș:",
        alertNewCityError: "A apărut o eroare la adăugarea orașului.",
        alertNewDistrictPrompt: "Numele noului cartier / zonă:",
        alertNewDistrictError: "A apărut o eroare la adăugarea cartierului.",
        alertChooseCityFirst: "Mai întâi alege un oraș!",
        alertConfirmDeleteSnapshot: "Sigur vrei să ștergi acest instantaneu?",
        alertSnapshotDeleted: "Instantaneu șters.",

        currentNoResults: "Niciun rezultat pentru filtrul curent.",
        currentMarketTitle: "📈 Piața curentă",
        chartsTitle: "Grafice de piață",
        chartAllapotTitle: "Distribuție după stare",
        chartRoomsTitle: "Distribuție după număr de camere",
        chartFloorsTitle: "Distribuție după etaj",
        chartKeruletTitle: "Distribuție după cartier",
        detailedAnalysisTitle: "Analize detaliate",
        chartLegendProperties: "Proprietăți",

        dashOverviewTitle: "📈 Prezentare generală a pieței curente",
        dashLabelCount: "Proprietăți",
        dashLabelAvgPrice: "Preț mediu",
        dashLabelAvgNm: "Suprafață medie m²",
        dashLabelAvgPriceNm: "Medie €/m²",
        dashLabelMinPriceNm: "Minim €/m²",
        dashLabelMaxPriceNm: "Maxim €/m²",

        statsByKerulet: "📍 Analiză după cartier",
        compareByKerulet: "📍 Schimbare după cartier",

        unknownLabel: "Necunoscut",
        groundFloorLabel: "Parter",
        floorWord: "etaj",
        floorPlusLabel: "4+ etaje",
        roomWord: "camere",
        roomsPlusLabel: "4+ camere",
        keruletNincsMegadva: "Nespecificat",

        trendTitle: "📈 Tendința prețurilor",
        trendFrom: "De la data",
        trendTo: "Până la data",
        trendIndicator: "Indicator",
        trendOptAvgPriceNm: "Medie €/m²",
        trendOptAvgPrice: "Preț mediu",
        trendOptCount: "Număr de proprietăți",

        bulkSelectedSuffix: "proprietăți selectate",
        bulkKeruletLabel: "Cartier:",
        bulkKeruletChoose: "— alege un cartier —",
        bulkApplyBtn: "Aplică cartierul",
        bulkCancelBtn: "Șterge selecția",
        bulkAlertConfirm: "Setezi cartierul pentru proprietățile selectate?",
        bulkAlertNoKerulet: "Te rugăm alege mai întâi un cartier!",
        bulkAlertSuccess: "Cartierul a fost actualizat pentru proprietățile selectate!",
        bulkAlertError: "A apărut o eroare la actualizare."

    }

};

class I18n {

    static current = localStorage.getItem("lang") || "en";
    static listeners = [];

    static t(key) {

        const dict = I18N_STRINGS[I18n.current] || I18N_STRINGS.en;

        if (dict[key] !== undefined) return dict[key];

        if (I18N_STRINGS.en[key] !== undefined) return I18N_STRINGS.en[key];

        return key;

    }

    static onChange(fn) {

        I18n.listeners.push(fn);

    }

    static setLanguage(lang) {

        if (!I18N_STRINGS[lang]) return;

        I18n.current = lang;

        localStorage.setItem("lang", lang);

        document.documentElement.lang = lang;

        I18n.applyStatic();

        document.querySelectorAll(".langBtn").forEach(btn => {

            btn.classList.toggle("active", btn.dataset.lang === lang);

        });

        I18n.listeners.forEach(fn => {

            try {
                fn();
            } catch (err) {
                console.error("I18n listener hiba:", err);
            }

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

    static translateStatValue(value) {

        if (value === null || value === undefined || value === "") {
            return I18n.t("unknownLabel");
        }

        const v = String(value).trim();

        const allapotMap = {
            "jó": "allapotJo",
            "újszerű": "allapotUjszeru",
            "felújítandó": "allapotFelujitando",
            "luxus": "allapotLuxus"
        };

        if (allapotMap[v]) return I18n.t(allapotMap[v]);

        if (v === "Földszint") return I18n.t("groundFloorLabel");
        if (v === "4+ emelet" || v === "4+") return I18n.t("floorPlusLabel");

        let m = v.match(/^(\d+)\.?\s*emelet$/);
        if (m) return `${m[1]}. ${I18n.t("floorWord")}`;

        if (v === "4+ szoba") return I18n.t("roomsPlusLabel");

        m = v.match(/^(\d+)\s*szoba$/);
        if (m) return `${m[1]} ${I18n.t("roomWord")}`;

        if (v === "Ismeretlen") return I18n.t("unknownLabel");
        if (v === "Nincs megadva") return I18n.t("keruletNincsMegadva");

        return v;

    }

    static init() {

        document.documentElement.lang = I18n.current;

        document.querySelectorAll(".langBtn").forEach(btn => {

            btn.classList.toggle("active", btn.dataset.lang === I18n.current);

            btn.onclick = () => I18n.setLanguage(btn.dataset.lang);

        });

        I18n.applyStatic();

    }

}

document.addEventListener("DOMContentLoaded", () => {

    I18n.init();

});