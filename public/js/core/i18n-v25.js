// ============================================================
//  Szövegek (25. változat): közvetlen beolvasás (OLX, Storia), fő forrásoldal,
//  admin városválasztó, átláthatóbb csapat-jogosultságok
// ============================================================

(() => {

    const V25 = {
        hu: {
            fsTab: "Források",
            fsTabDesc: "Melyik oldalról olvassuk a hirdetéseket, és ha egy ingatlan több oldalon is fent van, melyik nyíljon meg kattintásra",
            fsOther: "Egyéb oldal",
            fsOwn: "Saját feltöltés",
            fsLastAlways: "mindig utolsó – csak ha máshol nincs meg",
            fsUp: "Feljebb",
            fsDown: "Lejjebb",
            fsDirectTitle: "Közvetlen beolvasás",
            fsDirectHelp: "Ezeknek az oldalaknak a hirdetéseit a saját listájukból olvassuk, nem az Imoradar24-ről – így kattintásra egyből a pontos hirdetés nyílik meg, és ha ott levették, nálunk is lekerül.",
            fsDirect_olx: "a nyilvános OLX lista (alkategóriánként: lakás 1–4 szoba, ház, telek, üzlethelyiség)",
            fsDirect_storia: "a Storia találati listája (lakás, ház, telek, üzlethelyiség, iroda)",
            fsViaImoradar: "Az imobiliare.ro a szerverünket letiltja, ezért az ő hirdetései (és a Publi24, Homezz… hirdetései) továbbra is az Imoradar24 listájából jönnek – az imobiliare.ro-s hirdetés a pontos imobiliare linkkel, a többi kattintásra az Imoradar24 adatlapjára visz (ott pontosan az a hirdetés látszik, nem keresés). Ha egy város OLX / Storia listáját nem sikerül közvetlenül olvasni, ott is az Imoradar24 marad.",
            fsMainTitle: "Fő oldal (ha több helyen is fent van)",
            fsMainHelp: "Ugyanaz az ingatlan nálunk csak egyszer jelenik meg. Kattintásra a lista elején lévő oldal nyílik meg, ahol fent van; a többi oldal a hirdetésnél „Hol van még meghirdetve” alatt látszik. Ha a fő oldalon leveszik, de máshol még fent van, a következő oldal lesz a fő.",
            fsSave: "Mentés és alkalmazás",
            fsSaved: "Elmentve – {n} hirdetés fő linkje igazodott az új sorrendhez.",
            fsOnlyAdmin: "A sorrendet és a közvetlen oldalakat csak az admin (vagy aki az egész oldalra kapott beolvasási jogot) módosíthatja.",
            fsCitiesTitle: "Városonként",
            fsRun: "Beolvasás most",
            fsCheckOnly: "Csak ellenőrzés",
            fsCitiesHelp: "A „Beolvasás most” a kiválasztott város OLX és Storia listáját olvassa végig: új hirdetések, a meglévők frissítése, és ami már nincs fent, az lekerül. A „Csak ellenőrzés” új hirdetést nem vesz fel. Naponta magától is lefut a figyelt oldalak városaiban.",
            fsMulti: "több oldalon",
            fsLastDirect: "{f}: utolsó",
            fsImoradarNote: "Imoradar24 oszlop: amelyik hirdetés eredeti oldalát még nem találtuk meg – kattintásra az Imoradar24 adatlapjára visz. A közvetlen beolvasás ezeket is a pontos OLX / Storia hirdetésre cseréli, ha egyértelműen megtalálja.",
            fsNoListings: "Még nincs aktív hirdetés.",

            importResDirect: "közvetlenül bent",
            importResOtherSite: "másik oldal lett a fő",
            importResSideLinkGone: "egy mellék-link lekerült",
            importResOneByOne: "egyenként",
            importResOneByOneDone: "egyenként kész",
            importResIncomplete: "nem teljes lista",
            importResDirectOff: "közvetlen kikapcsolva",

            admCityLabel: "Város",
            admCityHelp: "A Hirdetések modul (és a Ma oldal) listái, számlálói csak ezt a várost mutatják",
            admCityAll: "Minden város",
            admCityMine: "Minden városom",

            tmModFinArchive: "Pénzügy és irattár",
            tmEverywhere: "Mindenhol",
            tmSeesTitle: "Mit lát az adminban",
            tmDetails: "Részletek",
            tmCityPack: "Városi hirdetéskezelő",
            tmCityPackHelp: "egy kattintással: ellenőrzés + a város beolvasása + szerkesztés + fotók ebben a városban",
            tmPreviewTitle: "Előnézet: ezt fogja látni",
            tmPreviewHelp: "Modulonként, hogy hol (mindenhol vagy melyik városban) és mit kezelhet. A Csapat és jogosultságok rész mindig csak a tiéd.",
            cs3_resz_beolvasas: "Beolvasás ebben a városban",
            cs3_reszSugo_beolvasas: "a város beolvasása a forrásoldalakról (Források), forrásoldal-ellenőrzés és automatikus javítás – csak ebben a városban",
            cs2_reszSugo_beolvasas: "linkről beolvasás, figyelt oldalak, források sorrendje, karbantartás – az egész oldalra (egy városra: lent)"
        },
        ro: {
            fsTab: "Surse",
            fsTabDesc: "De pe ce site citim anunțurile și, dacă o proprietate apare pe mai multe site-uri, care se deschide la clic",
            fsOther: "Alt site",
            fsOwn: "Încărcare proprie",
            fsLastAlways: "mereu ultimul – doar dacă nu e găsit în altă parte",
            fsUp: "Mai sus",
            fsDown: "Mai jos",
            fsDirectTitle: "Citire directă",
            fsDirectHelp: "Anunțurile acestor site-uri le citim din propria lor listă, nu de pe Imoradar24 – la clic se deschide direct anunțul exact, iar dacă acolo a fost scos, dispare și la noi.",
            fsDirect_olx: "lista publică OLX (pe subcategorii: apartament 1–4 camere, casă, teren, spațiu comercial)",
            fsDirect_storia: "lista de rezultate Storia (apartament, casă, teren, spațiu comercial, birou)",
            fsViaImoradar: "imobiliare.ro blochează serverul nostru, de aceea anunțurile lor (și cele Publi24, Homezz…) vin în continuare din lista Imoradar24 – cele imobiliare.ro cu linkul exact imobiliare, celelalte duc la clic la fișa Imoradar24 (acolo se vede exact acel anunț, nu o căutare). Dacă lista OLX / Storia a unui oraș nu poate fi citită direct, acolo rămâne Imoradar24.",
            fsMainTitle: "Site principal (dacă apare în mai multe locuri)",
            fsMainHelp: "Aceeași proprietate apare la noi o singură dată. La clic se deschide primul site din listă pe care apare; celelalte se văd la anunț, la „Unde mai este publicat”. Dacă pe site-ul principal este scos, dar în altă parte e încă activ, următorul devine principal.",
            fsSave: "Salvează și aplică",
            fsSaved: "Salvat – linkul principal a {n} anunțuri a fost aliniat la noua ordine.",
            fsOnlyAdmin: "Ordinea și site-urile directe le poate modifica doar adminul (sau cine are drept de import pe tot site-ul).",
            fsCitiesTitle: "Pe orașe",
            fsRun: "Citește acum",
            fsCheckOnly: "Doar verificare",
            fsCitiesHelp: "„Citește acum” parcurge lista OLX și Storia a orașului ales: anunțuri noi, actualizarea celor existente, iar ce nu mai este activ dispare. „Doar verificare” nu adaugă anunțuri noi. Rulează zilnic și automat în orașele paginilor urmărite.",
            fsMulti: "pe mai multe site-uri",
            fsLastDirect: "{f}: ultima",
            fsImoradarNote: "Coloana Imoradar24: anunțuri al căror site original nu l-am găsit încă – la clic duc la fișa Imoradar24. Citirea directă le înlocuiește cu anunțul exact OLX / Storia, dacă îl găsește fără echivoc.",
            fsNoListings: "Încă nu există anunțuri active.",

            importResDirect: "deja direct",
            importResOtherSite: "alt site a devenit principal",
            importResSideLinkGone: "un link secundar a fost scos",
            importResOneByOne: "unul câte unul",
            importResOneByOneDone: "verificare individuală gata",
            importResIncomplete: "listă incompletă",
            importResDirectOff: "citire directă oprită",

            admCityLabel: "Oraș",
            admCityHelp: "Listele și contoarele modulului Anunțuri (și ale paginii Azi) arată doar acest oraș",
            admCityAll: "Toate orașele",
            admCityMine: "Toate orașele mele",

            tmModFinArchive: "Finanțe și arhivă",
            tmEverywhere: "Peste tot",
            tmSeesTitle: "Ce vede în admin",
            tmDetails: "Detalii",
            tmCityPack: "Administrator anunțuri pe oraș",
            tmCityPackHelp: "dintr-un clic: verificare + importul orașului + editare + fotografii în acest oraș",
            tmPreviewTitle: "Previzualizare: asta va vedea",
            tmPreviewHelp: "Pe module, unde (peste tot sau în ce oraș) și ce poate gestiona. Secțiunea Echipă și permisiuni rămâne mereu doar a ta.",
            cs3_resz_beolvasas: "Import în acest oraș",
            cs3_reszSugo_beolvasas: "importul orașului de pe site-urile sursă (Surse), verificarea pe site-ul sursă și corectarea automată – doar în acest oraș",
            cs2_reszSugo_beolvasas: "import din link, pagini urmărite, ordinea surselor, întreținere – pentru tot site-ul (pentru un oraș: mai jos)"
        },
        en: {
            fsTab: "Sources",
            fsTabDesc: "Which sites we read listings from and, if a property is on several sites, which one opens on click",
            fsOther: "Other site",
            fsOwn: "Own upload",
            fsLastAlways: "always last – only if not found elsewhere",
            fsUp: "Up",
            fsDown: "Down",
            fsDirectTitle: "Direct import",
            fsDirectHelp: "These sites' listings are read from their own list, not from Imoradar24 – a click opens the exact listing, and if it is taken down there, it disappears here too.",
            fsDirect_olx: "the public OLX list (per subcategory: flat 1–4 rooms, house, plot, commercial)",
            fsDirect_storia: "the Storia results list (flat, house, plot, commercial, office)",
            fsViaImoradar: "imobiliare.ro blocks our server, so their listings (and Publi24, Homezz… listings) still come from the Imoradar24 list – imobiliare.ro ones with the exact imobiliare link, the others open the Imoradar24 listing page on click (it shows exactly that listing, not a search). If a city's OLX / Storia list cannot be read directly, Imoradar24 stays there too.",
            fsMainTitle: "Main site (if listed in several places)",
            fsMainHelp: "The same property appears here only once. A click opens the first site in this list where it is listed; the others show on the listing under “Also listed on”. If it is taken down on the main site but still listed elsewhere, the next one becomes main.",
            fsSave: "Save and apply",
            fsSaved: "Saved – {n} listings' main link now follows the new order.",
            fsOnlyAdmin: "Only the admin (or someone with site-wide import rights) can change the order and the direct sites.",
            fsCitiesTitle: "By city",
            fsRun: "Import now",
            fsCheckOnly: "Check only",
            fsCitiesHelp: "“Import now” reads the chosen city's OLX and Storia list to the end: new listings, updates to existing ones, and whatever is no longer listed is taken down. “Check only” adds no new listings. It also runs daily on its own in the watched pages' cities.",
            fsMulti: "on several sites",
            fsLastDirect: "{f}: last",
            fsImoradarNote: "Imoradar24 column: listings whose original site we haven't found yet – a click opens the Imoradar24 listing page. Direct import replaces them with the exact OLX / Storia listing when it finds an unambiguous match.",
            fsNoListings: "No active listings yet.",

            importResDirect: "already direct",
            importResOtherSite: "another site became main",
            importResSideLinkGone: "a side link was removed",
            importResOneByOne: "one by one",
            importResOneByOneDone: "one-by-one done",
            importResIncomplete: "incomplete list",
            importResDirectOff: "direct import off",

            admCityLabel: "City",
            admCityHelp: "The Listings module (and Today page) lists and counters show only this city",
            admCityAll: "All cities",
            admCityMine: "All my cities",

            tmModFinArchive: "Finance and archive",
            tmEverywhere: "Everywhere",
            tmSeesTitle: "What they see in admin",
            tmDetails: "Details",
            tmCityPack: "City listings manager",
            tmCityPackHelp: "one click: review + the city's import + editing + photos in this city",
            tmPreviewTitle: "Preview: this is what they will see",
            tmPreviewHelp: "Per module, where (everywhere or which city) and what they can manage. The Team and permissions section is always yours only.",
            cs3_resz_beolvasas: "Import in this city",
            cs3_reszSugo_beolvasas: "the city's import from source sites (Sources), source-site check and auto-fix – only in this city",
            cs2_reszSugo_beolvasas: "import from link, watched pages, source order, maintenance – whole site (one city: below)"
        }
    };

    Object.keys(V25).forEach(nyelv => {
        I18N_STRINGS[nyelv] = Object.assign(I18N_STRINGS[nyelv] || {}, V25[nyelv]);
    });

    const V25B = {
        "hu": {
                "fsTabDesc2": "A kiválasztott város hirdetéseinek forrásai típusonként: honnan olvassuk be őket, futtatás egy gombbal, és ha egy link megváltozott, itt látszik és javítható",
                "fsOwnLink": "Saját link",
                "fsForSale": "eladó",
                "fsForRent": "kiadó",
                "fsPickCity": "Válassz várost",
                "fsPickCityHelp": "A források mindig egy városé. Fent a városválasztóban is váltható.",
                "fsRunAllCities": "Minden város futtatása",
                "fsRunAllConfirm": "Minden város minden forrását lefuttatod? Ez hosszabb ideig tart (a háttérben fut).",
                "fsDirectShort": "közvetlenül",
                "fsOldLink": "régi link",
                "fsSt_ok": "rendben",
                "fsSt_letiltva": "letiltva – Imoradar24-ről",
                "fsSt_link_hiba": "a link megváltozott",
                "fsSt_hiba": "hiba",
                "fsSt_kikapcsolva": "kikapcsolva",
                "fsRunRow": "Futtatás",
                "fsEditLink": "Link javítása",
                "fsResetLink": "Vissza az alap linkre",
                "fsTurnOn": "Bekapcsolás",
                "fsTurnOff": "Kikapcsolás",
                "fsBrokenN": "{n} hibás link",
                "fsBrokenAll": "{n} link megváltozott, és az újat nem sikerült magától megtalálni – a piros sorokban a ceruzával írd be az újat (nyisd meg az oldalt, keresd meg a várost, és másold be a címet).",
                "fsRunGroup": "Futtatás",
                "fsAddLink": "Saját link",
                "fsLinkLabel": "Lista linkje",
                "fsDistrictOpt": "Kerület (nem kötelező)",
                "fsAdd": "Hozzáadás",
                "fsAddHelp": "Pl. egy kerület Imoradar24-es vagy Publi24-es listája – az onnan jövő hirdetések ebbe a kerületbe kerülnek, ha megadod.",
                "fsCityHelp": "Egy gomb: minden forrás lefut (előbb az OLX és a Storia közvetlenül, utána az Imoradar24 és a saját linkek). Naponta magától is lefut.",
                "fsRunCity": "Minden futtatása – {v}",
                "fsOneOffTitle": "Egy hirdetés vagy lista linkjének egyszeri beolvasása",
                "fsOneOffHelp": "Bármelyik oldal hirdetésének vagy találati listájának linkje (többet soronként). Nem kerül a figyelt források közé.",
                "fsDeal": "Ügylet",
                "fsOneOffRun": "Beolvasás",
                "fsSettingsTitle": "Beállítások: közvetlen oldalak és a fő oldal sorrendje",
                "fsEditPrompt": "Az új link (nyisd meg a forrásoldalt, keresd meg a várost és ezt a kategóriát, és másold be a címet):",
                "fsBadUrl": "Ez nem érvényes link (https://… kell).",
                "fsResetConfirm": "Visszaállítod a város nevéből képzett alap linkre?",
                "fsDeleteConfirm": "Törlöd ezt a saját linket?",
                "fsViaImoradar2": "Az imobiliare.ro és a Storia a szerverünket letiltja, ezért az ő hirdetéseik (és a Publi24, Homezz… hirdetései) az Imoradar24 listájából jönnek – az imobiliare.ro-s hirdetés a pontos imobiliare linkkel, a többi kattintásra az Imoradar24 adatlapjára visz (ott pontosan az a hirdetés látszik).",
                "admSecCity": "Város",
                "admSecGeneral": "Általános",
                "adminModAds": "Reklámfelületek",
                "adminModAgencies": "Ingatlanirodák",
                "adminModSettings": "Beállítások",
                "mtDescCity": "A kiválasztott város karbantartása: automatikus javítás, a forrásoldalak ellenőrzése (a levettek lekerülnek), az értékbecslő pontossága",
                "mtForCity": "Ezek az eszközök most erre a városra futnak: <b>{v}</b>",
                "mtForAll": "Ezek az eszközök most minden városra futnak.",
                "mtCitySwitchHint": "Más városhoz fent, a városválasztóban válts.",
                "adsFCities": "Melyik városban jelenjen meg",
                "adsFCitiesHelp": "Ha egyet sem jelölsz be, minden városban megjelenik. A lista a fent kiválasztott város reklámjait mutatja (és a mindenhol futókat).",
                "importResLinkSwap": "link kicserélve"
        },
        "ro": {
                "fsTabDesc2": "Sursele anunțurilor orașului ales pe tipuri: de unde le citim, rulare dintr-un clic, iar dacă un link s-a schimbat, apare aici și se poate corecta",
                "fsOwnLink": "Link propriu",
                "fsForSale": "vânzare",
                "fsForRent": "închiriere",
                "fsPickCity": "Alege orașul",
                "fsPickCityHelp": "Sursele aparțin mereu unui oraș. Poți schimba și din selectorul de sus.",
                "fsRunAllCities": "Rulează toate orașele",
                "fsRunAllConfirm": "Rulezi toate sursele tuturor orașelor? Durează mai mult (rulează în fundal).",
                "fsDirectShort": "direct",
                "fsOldLink": "link vechi",
                "fsSt_ok": "în regulă",
                "fsSt_letiltva": "blocat – de pe Imoradar24",
                "fsSt_link_hiba": "linkul s-a schimbat",
                "fsSt_hiba": "eroare",
                "fsSt_kikapcsolva": "oprit",
                "fsRunRow": "Rulează",
                "fsEditLink": "Corectează linkul",
                "fsResetLink": "Înapoi la linkul implicit",
                "fsTurnOn": "Pornește",
                "fsTurnOff": "Oprește",
                "fsBrokenN": "{n} linkuri greșite",
                "fsBrokenAll": "{n} linkuri s-au schimbat și cel nou nu a fost găsit automat – în rândurile roșii scrie-l cu creionul (deschide site-ul, caută orașul și copiază adresa).",
                "fsRunGroup": "Rulează",
                "fsAddLink": "Link propriu",
                "fsLinkLabel": "Linkul listei",
                "fsDistrictOpt": "Cartier (opțional)",
                "fsAdd": "Adaugă",
                "fsAddHelp": "De ex. lista Imoradar24 sau Publi24 a unui cartier – anunțurile de acolo ajung în acest cartier, dacă îl alegi.",
                "fsCityHelp": "Un buton: rulează toate sursele (întâi OLX și Storia direct, apoi Imoradar24 și linkurile proprii). Rulează și zilnic, automat.",
                "fsRunCity": "Rulează tot – {v}",
                "fsOneOffTitle": "Citirea o singură dată a unui anunț sau a unei liste",
                "fsOneOffHelp": "Linkul unui anunț sau al unei liste de pe orice site (mai multe, câte unul pe rând). Nu intră între sursele urmărite.",
                "fsDeal": "Tranzacție",
                "fsOneOffRun": "Citește",
                "fsSettingsTitle": "Setări: site-uri directe și ordinea site-ului principal",
                "fsEditPrompt": "Linkul nou (deschide site-ul sursă, caută orașul și categoria și copiază adresa):",
                "fsBadUrl": "Nu este un link valid (trebuie https://…).",
                "fsResetConfirm": "Revii la linkul implicit, creat din numele orașului?",
                "fsDeleteConfirm": "Ștergi acest link propriu?",
                "fsViaImoradar2": "imobiliare.ro și Storia blochează serverul nostru, de aceea anunțurile lor (și cele Publi24, Homezz…) vin din lista Imoradar24 – cele imobiliare.ro cu linkul exact, celelalte duc la clic la fișa Imoradar24 (acolo se vede exact acel anunț).",
                "admSecCity": "Oraș",
                "admSecGeneral": "General",
                "adminModAds": "Spații publicitare",
                "adminModAgencies": "Agenții imobiliare",
                "adminModSettings": "Setări",
                "mtDescCity": "Întreținerea orașului ales: corectare automată, verificarea site-urilor sursă (cele scoase dispar), precizia evaluatorului",
                "mtForCity": "Aceste instrumente rulează acum pentru orașul: <b>{v}</b>",
                "mtForAll": "Aceste instrumente rulează acum pentru toate orașele.",
                "mtCitySwitchHint": "Pentru alt oraș schimbă din selectorul de sus.",
                "adsFCities": "În ce oraș să apară",
                "adsFCitiesHelp": "Dacă nu bifezi niciunul, apare în toate orașele. Lista arată reclamele orașului ales sus (și pe cele generale).",
                "importResLinkSwap": "link înlocuit"
        },
        "en": {
                "fsTabDesc2": "The chosen city's listing sources by type: where we read them from, one-click runs, and if a link changed it shows here and can be fixed",
                "fsOwnLink": "Own link",
                "fsForSale": "for sale",
                "fsForRent": "for rent",
                "fsPickCity": "Choose a city",
                "fsPickCityHelp": "Sources always belong to one city. You can also switch with the selector at the top.",
                "fsRunAllCities": "Run all cities",
                "fsRunAllConfirm": "Run every source of every city? It takes a while (runs in the background).",
                "fsDirectShort": "direct",
                "fsOldLink": "old link",
                "fsSt_ok": "OK",
                "fsSt_letiltva": "blocked – via Imoradar24",
                "fsSt_link_hiba": "link changed",
                "fsSt_hiba": "error",
                "fsSt_kikapcsolva": "off",
                "fsRunRow": "Run",
                "fsEditLink": "Fix link",
                "fsResetLink": "Back to default link",
                "fsTurnOn": "Turn on",
                "fsTurnOff": "Turn off",
                "fsBrokenN": "{n} broken links",
                "fsBrokenAll": "{n} links changed and the new one wasn't found automatically – in the red rows enter it with the pencil (open the site, find the city and copy the address).",
                "fsRunGroup": "Run",
                "fsAddLink": "Own link",
                "fsLinkLabel": "List link",
                "fsDistrictOpt": "District (optional)",
                "fsAdd": "Add",
                "fsAddHelp": "E.g. a district's Imoradar24 or Publi24 list – its listings go into this district if you set it.",
                "fsCityHelp": "One button: every source runs (first OLX and Storia directly, then Imoradar24 and own links). It also runs daily on its own.",
                "fsRunCity": "Run all – {v}",
                "fsOneOffTitle": "One-off import of a listing or list link",
                "fsOneOffHelp": "A listing or results-list link from any site (several, one per line). It is not added to the watched sources.",
                "fsDeal": "Deal",
                "fsOneOffRun": "Import",
                "fsSettingsTitle": "Settings: direct sites and main-site order",
                "fsEditPrompt": "The new link (open the source site, find the city and this category, and copy the address):",
                "fsBadUrl": "Not a valid link (needs https://…).",
                "fsResetConfirm": "Reset to the default link built from the city name?",
                "fsDeleteConfirm": "Delete this own link?",
                "fsViaImoradar2": "imobiliare.ro and Storia block our server, so their listings (and Publi24, Homezz…) come from the Imoradar24 list – imobiliare.ro ones with the exact link, the others open the Imoradar24 listing page (it shows exactly that listing).",
                "admSecCity": "City",
                "admSecGeneral": "General",
                "adminModAds": "Ad spaces",
                "adminModAgencies": "Agencies",
                "adminModSettings": "Settings",
                "mtDescCity": "Maintenance for the chosen city: auto-fix, source-site check (taken-down listings are removed), valuation accuracy",
                "mtForCity": "These tools now run for: <b>{v}</b>",
                "mtForAll": "These tools now run for all cities.",
                "mtCitySwitchHint": "For another city switch with the selector at the top.",
                "adsFCities": "Which city to show it in",
                "adsFCitiesHelp": "If none is ticked, it shows in every city. The list shows the ads of the city chosen at the top (and the ones running everywhere).",
                "importResLinkSwap": "link replaced"
        }
};

    Object.keys(V25B).forEach(nyelv => {
        I18N_STRINGS[nyelv] = Object.assign(I18N_STRINGS[nyelv] || {}, V25B[nyelv]);
    });

})();

// ============================================================
//  Nyelv: a vendég (nincs bejelentkezve) mindig románul kezd – ha a látogatás
//  alatt nyelvet vált, az a böngésző bezárásáig megmarad (sessionStorage).
//  A bejelentkezett felhasználó a saját (utoljára választott) nyelvével.
//  A bejelentkezés tényét az AuthManager jegyzi fel (ip_belepve – pageManager.js),
//  hogy már az első rajzolás a jó nyelven történjen.
// ============================================================
(() => {
    try {
        if (localStorage.getItem("ip_belepve") !== "1") {
            const s = sessionStorage.getItem("ip_lang");
            I18n.current = s && I18N_STRINGS[s] ? s : "ro";
            document.documentElement.lang = I18n.current;
        }
    } catch (e) { /* tárhely nélkül marad a régi */ }
    const eredeti = I18n.setLanguage;
    I18n.setLanguage = function (lang) {
        try { if (I18N_STRINGS[lang]) sessionStorage.setItem("ip_lang", lang); } catch (e) { /* nem baj */ }
        return eredeti.call(I18n, lang);
    };
})();

(() => {
    const V25C = {
        "hu": {
                "navPros": "Szakembereknek",
                "navProsHead": "Irodáknak, ingatlanosoknak",
                "proAgencyAccount": "Irodai fiók",
                "proAgencyAccountDesc": "Iroda regisztrálása, ügynökök, az iroda hirdetései",
                "proAdminDesc": "Hirdetések kezelése, források, pénzügy, beállítások"
        },
        "ro": {
                "navPros": "Pentru profesioniști",
                "navProsHead": "Pentru agenții și agenți imobiliari",
                "proAgencyAccount": "Cont de agenție",
                "proAgencyAccountDesc": "Înregistrarea agenției, agenți, anunțurile agenției",
                "proAdminDesc": "Gestionarea anunțurilor, surse, finanțe, setări"
        },
        "en": {
                "navPros": "For professionals",
                "navProsHead": "For agencies and realtors",
                "proAgencyAccount": "Agency account",
                "proAgencyAccountDesc": "Register an agency, agents, the agency's listings",
                "proAdminDesc": "Listings management, sources, finance, settings"
        }
};
    Object.keys(V25C).forEach(nyelv => { I18N_STRINGS[nyelv] = Object.assign(I18N_STRINGS[nyelv] || {}, V25C[nyelv]); });
})();
