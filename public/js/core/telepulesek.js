// ============================================================
//  Városok melletti települések román ↔ magyar neve
//
//  Háznál és teleknél nem kerület van, hanem "hol van":
//  ha nem a városban, hanem mellette (pl. Uzon / Ozun).
//  Az adatbázisban a román név van, a kijelzés nyelvfüggő:
//  magyarul a magyar név, angolul és románul a román.
//
//  Ugyanezt a fájlt a szerver is használja (require).
// ============================================================

const TELEPULESEK = [

    // --- Sepsiszentgyörgy környéke (Kovászna megye)
    ["Chilieni", "Kilyén"], ["Coșeni", "Szotyor"], ["Ozun", "Uzon"], ["Arcuș", "Árkos"],
    ["Valea Crișului", "Sepsikőröspatak"], ["Ilieni", "Illyefalva"], ["Ghidfalău", "Gidófalva"],
    ["Zoltan", "Étfalvazoltán"], ["Bodoc", "Sepsibodok"], ["Olteni", "Oltszem"], ["Reci", "Réty"],
    ["Moacșa", "Maksa"], ["Vâlcele", "Előpatak"], ["Hăghig", "Hídvég"], ["Chichiș", "Kökös"],
    ["Bixad", "Sepsibükszád"], ["Malnaș", "Málnás"], ["Sântionlunca", "Szentivánlaborfalva"],
    ["Bicfalău", "Bikfalva"], ["Lisnău", "Lisznyó"], ["Dalnic", "Dálnok"], ["Belin", "Bölön"],
    ["Boroșneu Mare", "Nagyborosnyó"], ["Aita Mare", "Nagyajta"], ["Aita Medie", "Középajta"],
    ["Aita Seacă", "Szárazajta"], ["Baraolt", "Barót"], ["Covasna", "Kovászna"],

    // --- Kézdivásárhely környéke
    ["Cernat", "Csernáton"], ["Sânzieni", "Kézdiszentlélek"], ["Lemnia", "Lemhény"],
    ["Turia", "Torja"], ["Catalina", "Szentkatolna"], ["Ghelința", "Gelence"], ["Zăbala", "Zabola"],
    ["Albiș", "Kézdialbis"], ["Brateș", "Barátos"], ["Estelnic", "Esztelnek"], ["Ojdula", "Ozsdola"],
    ["Comandău", "Komandó"],

    // --- Csíkszereda környéke (Hargita megye)
    ["Jigodin", "Zsögöd"], ["Ciceu", "Csíkcsicsó"], ["Sâncrăieni", "Csíkszentkirály"],
    ["Leliceni", "Csíkszentlélek"], ["Păuleni-Ciuc", "Csíkpálfalva"], ["Siculeni", "Madéfalva"],
    ["Misentea", "Csíkmindszent"], ["Ciucsângeorgiu", "Csíkszentgyörgy"], ["Cârța", "Csíkkarcfalva"],
    ["Frumoasa", "Csíkszépvíz"], ["Sânsimion", "Csíkszentsimon"], ["Tușnad", "Tusnád"],
    ["Mihăileni", "Csíkszentmihály"], ["Sândominic", "Csíkszentdomokos"], ["Dănești", "Csíkdánfalva"],
    ["Racu", "Csíkrákos"], ["Sântimbru", "Csíkszentimre"], ["Tomești", "Csíkszenttamás"],

    // --- Marosvásárhely környéke
    ["Sângeorgiu de Mureș", "Marosszentgyörgy"], ["Sâncraiu de Mureș", "Marosszentkirály"],
    ["Livezeni", "Jedd"], ["Corunca", "Koronka"], ["Ernei", "Nagyernye"], ["Cristești", "Maroskeresztúr"],
    ["Sântana de Mureș", "Marosszentanna"], ["Ungheni", "Nyárádtő"], ["Gornești", "Gernyeszeg"],

    // --- Brassó környéke
    ["Sânpetru", "Szentpéter"], ["Hărman", "Szászhermány"], ["Ghimbav", "Vidombák"],
    ["Cristian", "Keresztényfalva"], ["Râșnov", "Barcarozsnyó"], ["Codlea", "Feketehalom"],
    ["Prejmer", "Prázsmár"], ["Tărlungeni", "Tatrang"], ["Săcele", "Négyfalu"], ["Bod", "Botfalu"],
    ["Feldioara", "Földvár"], ["Hălchiu", "Höltövény"]

];

const Telepulesek = {

    LISTA: TELEPULESEK.map(([ro, hu]) => ({ ro, hu })),

    kulcs(s) {
        return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
            .replace(/[-\s]+/g, " ").trim();
    },

    // Román vagy magyar név -> { ro, hu } (ha ismert)
    keres(nev) {
        const k = Telepulesek.kulcs(nev);
        if (!k) return null;
        return Telepulesek.LISTA.find(t => Telepulesek.kulcs(t.ro) === k || Telepulesek.kulcs(t.hu) === k) || null;
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
