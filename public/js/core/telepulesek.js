// ============================================================
//  Városok melletti települések román ↔ magyar neve
//
//  Háznál és teleknél nem kerület van, hanem "hol van":
//  ha nem a városban, hanem mellette (pl. Uzon / Ozun).
//  A "… és környéke" városokban (pl. Sepsiszentgyörgy és környéke)
//  minden hirdetésnél ez a mező mondja meg, melyik faluban van.
//  Az adatbázisban a román név van, a kijelzés nyelvfüggő:
//  magyarul a magyar név, angolul és románul a román.
//
//  A listák városonként (régiónként) vannak: a szövegből való
//  felismerés először a hirdetés városa körüli falvakat keresi.
//
//  Ugyanezt a fájlt a szerver is használja (require).
// ============================================================

const TELEPULES_REGIOK = {

    // --- Sepsiszentgyörgy környéke (Kovászna megye, Háromszék)
    Sepsiszentgyorgy: [
        ["Chilieni", "Kilyén"], ["Coșeni", "Szotyor"], ["Sugaș-Băi", "Sugásfürdő"],
        ["Ozun", "Uzon"], ["Arcuș", "Árkos"], ["Valea Crișului", "Sepsikőröspatak"], ["Sâncraiu", "Sepsiszentkirály"],
        ["Ilieni", "Illyefalva"], ["Dobolii de Jos", "Alsódoboly"], ["Ghidfalău", "Gidófalva"], ["Angheluș", "Angyalos"],
        ["Fotoș", "Fotosmartonos"], ["Zoltan", "Étfalvazoltán"], ["Bodoc", "Sepsibodok"], ["Olteni", "Oltszem"],
        ["Zălan", "Zalán"], ["Reci", "Réty"], ["Aninoasa", "Egerpatak"], ["Bita", "Bita"], ["Comolău", "Komolló"],
        ["Saciova", "Szacsva"], ["Moacșa", "Maksa"], ["Pădureni", "Erdőfüle"], ["Vâlcele", "Előpatak"],
        ["Araci", "Árapatak"], ["Ariușd", "Erősd"], ["Hăghig", "Hídvég"], ["Chichiș", "Kökös"],
        ["Bixad", "Sepsibükszád"], ["Malnaș", "Málnás"], ["Malnaș-Băi", "Málnásfürdő"], ["Micfalău", "Mikóújfalu"],
        ["Sântionlunca", "Szentivánlaborfalva"], ["Bicfalău", "Bikfalva"], ["Lisnău", "Lisznyó"],
        ["Lisnău-Vale", "Lisznyópatak"], ["Măgheruș", "Sepsimagyarós"], ["Dalnic", "Dálnok"], ["Belin", "Bölön"],
        ["Boroșneu Mare", "Nagyborosnyó"], ["Aita Mare", "Nagyajta"], ["Aita Medie", "Középajta"],
        ["Aita Seacă", "Szárazajta"], ["Brăduț", "Bardoc"], ["Baraolt", "Barót"], ["Zagon", "Zágon"],
        ["Barcani", "Sárospatak"], ["Întorsura Buzăului", "Bodzaforduló"], ["Covasna", "Kovászna"]
    ],

    // --- Kézdivásárhely környéke
    Kezdivasarhely: [
        ["Cernat", "Csernáton"], ["Sânzieni", "Kézdiszentlélek"], ["Lemnia", "Lemhény"],
        ["Turia", "Torja"], ["Catalina", "Szentkatolna"], ["Ghelința", "Gelence"], ["Zăbala", "Zabola"],
        ["Albiș", "Kézdialbis"], ["Brateș", "Barátos"], ["Estelnic", "Esztelnek"], ["Ojdula", "Ozsdola"],
        ["Comandău", "Komandó"]
    ],

    // --- Csíkszereda környéke (Hargita megye)
    Csikszereda: [
        ["Jigodin", "Zsögöd"], ["Ciceu", "Csíkcsicsó"], ["Sâncrăieni", "Csíkszentkirály"],
        ["Leliceni", "Csíkszentlélek"], ["Păuleni-Ciuc", "Csíkpálfalva"], ["Siculeni", "Madéfalva"],
        ["Misentea", "Csíkmindszent"], ["Ciucsângeorgiu", "Csíkszentgyörgy"], ["Cârța", "Csíkkarcfalva"],
        ["Frumoasa", "Csíkszépvíz"], ["Sânsimion", "Csíkszentsimon"], ["Tușnad", "Tusnád"],
        ["Mihăileni", "Csíkszentmihály"], ["Sândominic", "Csíkszentdomokos"], ["Dănești", "Csíkdánfalva"],
        ["Racu", "Csíkrákos"], ["Sântimbru", "Csíkszentimre"], ["Tomești", "Csíkszenttamás"]
    ],

    // --- Marosvásárhely környéke
    Marosvasarhely: [
        ["Sângeorgiu de Mureș", "Marosszentgyörgy"], ["Sâncraiu de Mureș", "Marosszentkirály"],
        ["Livezeni", "Jedd"], ["Corunca", "Koronka"], ["Ernei", "Nagyernye"], ["Cristești", "Maroskeresztúr"],
        ["Sântana de Mureș", "Marosszentanna"], ["Ungheni", "Nyárádtő"], ["Gornești", "Gernyeszeg"]
    ],

    // --- Brassó környéke
    Brasso: [
        ["Sânpetru", "Szentpéter"], ["Hărman", "Szászhermány"], ["Ghimbav", "Vidombák"],
        ["Cristian", "Keresztényfalva"], ["Râșnov", "Barcarozsnyó"], ["Codlea", "Feketehalom"],
        ["Prejmer", "Prázsmár"], ["Tărlungeni", "Tatrang"], ["Săcele", "Négyfalu"], ["Bod", "Botfalu"],
        ["Feldioara", "Földvár"], ["Hălchiu", "Höltövény"]
    ]

};

// Ezek a nevek köznapi szavak / keresztnevek is ("frumoasă" = szép, "reci" = hideg,
// Zoltán, Cristian...), vagy a megye neve is (Covasna): a szövegből csak akkor
// fogadjuk el, ha egyértelműen helynévként szerepel ("în Reci", "comuna Bodoc", "Uzonban").
const KOZNEVEK = ["frumoasa", "reci", "zoltan", "cristian", "catalina", "bod", "racu", "turia", "lemnia",
    "sanzieni", "bita", "olteni", "covasna", "kovaszna", "aninoasa", "padureni", "arcus", "codlea", "ungheni"];

const Telepulesek = {

    LISTA: Object.entries(TELEPULES_REGIOK).flatMap(([regio, lista]) => lista.map(([ro, hu]) => ({ ro, hu, regio }))),

    REGIOK: TELEPULES_REGIOK,

    kulcs(s) {
        return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
            .replace(/[-\s]+/g, " ").trim();
    },

    // Köznapi szó / megyenév is (lásd fent)
    koznev(nev) {
        return KOZNEVEK.includes(Telepulesek.kulcs(nev));
    },

    // Román vagy magyar név -> { ro, hu, regio } (ha ismert)
    keres(nev) {
        const k = Telepulesek.kulcs(nev);
        if (!k) return null;
        return Telepulesek.LISTA.find(t => Telepulesek.kulcs(t.ro) === k || Telepulesek.kulcs(t.hu) === k) || null;
    },

    // Egy város (a mi kulcsunk, pl. "Sepsiszentgyorgy") környékének falvai
    regio(varos) {
        return Telepulesek.LISTA.filter(t => t.regio === varos);
    },

    // Kijelzés: magyarul a magyar név, máshol a román
    nev(nev, nyelv) {
        const t = Telepulesek.keres(nev);
        if (!t) return nev || "";
        return nyelv === "hu" ? t.hu : t.ro;
    }

};

if (typeof module !== "undefined" && module.exports) {
    module.exports = Telepulesek;
}
