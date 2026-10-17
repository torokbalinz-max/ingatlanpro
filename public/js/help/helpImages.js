// ============================================================
//  Súgó – képernyőképek a témákhoz (img/sugo/<nyelv>/<kép>.webp)
//
//  téma id → képek. utan: a téma hányadik szakasza után álljon a kép
//  (-1: a bevezető után, a téma elején). A számok (1, 2, 3…) a képen
//  narancssárgán bekarikázott részekre utalnak.
//  A képeket újra lehet készíteni, ha az oldal változik (fejlesztői szkript).
// ============================================================

const HELP_KEPEK = {

    kezdes: [
        { utan: -1, kep: "kezdolap", f: {
            hu: "A kezdőlap. <b>1</b> Gyorskeresés: eladó vagy kiadó, város, típus. <b>2</b> A főmenü. <b>3</b> Saját hirdetés feladása.",
            ro: "Pagina principală. <b>1</b> Căutare rapidă: de vânzare sau de închiriat, oraș, tip. <b>2</b> Meniul principal. <b>3</b> Publică propriul anunț.",
            en: "The home page. <b>1</b> Quick search: for sale or rent, city, type. <b>2</b> The main menu. <b>3</b> Post your own listing." } },
        { utan: 2, kep: "mobil", mobil: true, f: {
            hu: "Telefonon: <b>1</b> a szűrők egy gombra nyílnak, <b>2</b> lent a menüsáv (Ingatlanok, Térkép, Feladás, Eladjuk, Menü).",
            ro: "Pe telefon: <b>1</b> filtrele se deschid dintr-un buton, <b>2</b> jos bara de meniu (Proprietăți, Hartă, Publică, Vindem, Meniu).",
            en: "On a phone: <b>1</b> filters open from one button, <b>2</b> the menu bar at the bottom (Properties, Map, Post, We sell, Menu)." } }
    ],

    kereses: [
        { utan: 0, kep: "kereses", f: {
            hu: "<b>1</b> A kereső: ügylet, típus, város, kerület, ár, méret, szobák, állapot. <b>2</b> Nézet: kártyák vagy táblázat. <b>3</b> Rendezés. <b>4</b> Egy hirdetés – kattints rá a részletekért.",
            ro: "<b>1</b> Căutarea: tranzacție, tip, oraș, cartier, preț, suprafață, camere, stare. <b>2</b> Vizualizare: carduri sau tabel. <b>3</b> Sortare. <b>4</b> Un anunț – clic pentru detalii.",
            en: "<b>1</b> The search panel: deal, type, city, district, price, size, rooms, condition. <b>2</b> View: cards or table. <b>3</b> Sorting. <b>4</b> A listing – click it for details." } },
        { utan: 1, kep: "kereses-tablazat", f: {
            hu: "Táblázat nézet (<b>1</b>): oszloponként rendezhető és szűrhető, a ☆ a kedvencekhez ad.",
            ro: "Vizualizare tabel (<b>1</b>): sortare și filtrare pe coloane, ☆ adaugă la favorite.",
            en: "Table view (<b>1</b>): sort and filter by column; ☆ adds to favourites." } }
    ],

    terkep: [
        { utan: -1, kep: "terkep", f: {
            hu: "A térkép: a színes pontok az állapotot jelzik (jelmagyarázat jobbra lent), a számos kör több hirdetést egy helyen. A bal oldali kereső itt is szűr.",
            ro: "Harta: punctele colorate arată starea (legenda jos în dreapta), cercurile cu numere – mai multe anunțuri într-un loc. Filtrele din stânga funcționează și aici.",
            en: "The map: coloured dots show the condition (legend bottom right); numbered circles mean several listings in one place. The search panel on the left filters here too." } }
    ],

    hirdetes: [
        { utan: 0, kep: "hirdetes", f: {
            hu: "Egy hirdetés adatlapja. <b>1</b> Ár, kedvencekhez adás, értékbecslés erre a hirdetésre. <b>2</b> Hol van meghirdetve (eredeti hirdetés). <b>3</b> Fényképek – ha nincsenek, a típus és a hely látszik.",
            ro: "Pagina unui anunț. <b>1</b> Preț, adăugare la favorite, evaluare pentru acest anunț. <b>2</b> Unde e publicat (anunțul original). <b>3</b> Fotografii – dacă lipsesc, apar tipul și locul.",
            en: "A listing's page. <b>1</b> Price, add to favourites, valuation for this listing. <b>2</b> Where it is advertised (original listing). <b>3</b> Photos – if there are none, the type and place are shown." } }
    ],

    piac: [
        { utan: -1, kep: "piac", f: {
            hu: "<b>1</b> A három nézet: jelenlegi piac, előzmények, ártrend. <b>2</b> A fő számok: darab, medián ár, átlag €/m², tipikus ársáv. <b>3</b> Bontás kerület, állapot, szobaszám és emelet szerint.",
            ro: "<b>1</b> Cele trei vizualizări: piața actuală, istoric, tendința prețurilor. <b>2</b> Cifrele principale: număr, preț median, medie €/m², interval tipic. <b>3</b> Defalcare pe cartier, stare, camere și etaj.",
            en: "<b>1</b> The three views: current market, history, price trend. <b>2</b> Key figures: count, median price, average €/m², typical range. <b>3</b> Breakdown by district, condition, rooms and floor." } },
        { utan: 2, kep: "piac-artrend", f: {
            hu: "Ártrend (<b>1</b>): válaszd ki a mutatót, a bontást és az időszakot – a grafikon a havi változást mutatja.",
            ro: "Tendința prețurilor (<b>1</b>): alege indicatorul, defalcarea și perioada – graficul arată schimbarea lunară.",
            en: "Price trend (<b>1</b>): pick the measure, breakdown and period – the chart shows the monthly change." } }
    ],

    ertekbecslo: [
        { utan: 0, kep: "ertekbecslo", f: {
            hu: "Töltsd ki az adatokat, majd <b>1</b> Becslés. <b>2</b> Az eredmény: becsült ár, tipikus ársáv, a kért ár helye a sávban, és hogyan jött ki. Alatta a felhasznált hasonló hirdetések.",
            ro: "Completează datele, apoi <b>1</b> Evaluare. <b>2</b> Rezultatul: preț estimat, interval tipic, poziția prețului cerut și cum s-a calculat. Dedesubt, anunțurile similare folosite.",
            en: "Fill in the details, then <b>1</b> Estimate. <b>2</b> The result: estimated price, typical range, where the asking price falls, and how it was calculated. Below are the similar listings used." } }
    ],

    kedvencek: [
        { utan: 0, kep: "kedvencek", f: {
            hu: "A kedvenceid egy táblázatban: rendezheted, a sorra kattintva megnyílik a hirdetés, a piros gombbal kiveszed.",
            ro: "Favoritele tale într-un tabel: le poți sorta, clic pe rând deschide anunțul, butonul roșu îl elimină.",
            en: "Your favourites in a table: sort them, click a row to open the listing, the red button removes it." } }
    ],

    feladas: [
        { utan: 1, kep: "feladas", f: {
            hu: "<b>1</b> Mit hirdetsz (eladó / kiadó, típus). <b>2</b> Ha máshol már fent van, a link beillesztésével az adatok kitöltődnek. <b>3</b> Az ingatlan helye a térképen (pontos vagy közelítő).",
            ro: "<b>1</b> Ce publici (vânzare / închiriere, tip). <b>2</b> Dacă e deja publicat în altă parte, lipind linkul datele se completează. <b>3</b> Locația pe hartă (exactă sau aproximativă).",
            en: "<b>1</b> What you are posting (sale / rent, type). <b>2</b> If it is already online elsewhere, paste the link and the details fill in. <b>3</b> The location on the map (exact or approximate)." } }
    ],

    keresek: [
        { utan: -1, kep: "keresek", f: {
            hu: "A Keresek oldal: mások keresési igényei. Eladóként és irodaként itt válaszolhatsz nekik, vevőként feladhatod a sajátodat.",
            ro: "Pagina Caut: cererile altora. Ca vânzător sau agenție le poți răspunde, ca și cumpărător îți publici propria cerere.",
            en: "The Wanted page: other people's requests. As a seller or agency you can reply; as a buyer you can post your own." } }
    ],

    fiok: [
        { utan: -1, kep: "fiok", f: {
            hu: "A Fiókom oldal fülei: profil, hirdetéseim, mentett keresések, keresési igényeim, üzenetek, csomagom és számláim, kedvencek.",
            ro: "Filele paginii Contul meu: profil, anunțurile mele, căutări salvate, cererile mele, mesaje, pachetul și facturile, favorite.",
            en: "The tabs of My account: profile, my listings, saved searches, my requests, messages, my package and invoices, favourites." } }
    ],

    iroda: [
        { utan: 0, kep: "irodak", f: {
            hu: "Az ingatlanirodák listája: csak ellenőrzött (ANAF-ban igazolt) irodák. Egy irodára kattintva látod a hirdetéseit és az elérhetőségét.",
            ro: "Lista agențiilor imobiliare: doar agenții verificate (confirmate la ANAF). Clic pe o agenție pentru anunțuri și contact.",
            en: "The list of real estate agencies: only verified ones (checked with ANAF). Click an agency to see its listings and contact details." } }
    ],

    csomagok: [
        { utan: 0, kep: "csomagok", f: {
            hu: "Csomagok és árak: fent a jelenlegi csomagod, alatta a választható csomagok és kiegészítők. Magánszemélyeknek és irodáknak külön nézet.",
            ro: "Pachete și prețuri: sus pachetul actual, dedesubt pachetele și extraopțiunile. Vizualizare separată pentru persoane fizice și agenții.",
            en: "Packages and prices: your current package at the top, available packages and add-ons below. Separate views for individuals and agencies." } }
    ],

    eladjuk: [
        { utan: 0, kep: "eladjuk", f: {
            hu: "Eladjuk helyetted: a folyamat 5 lépésben, a benne foglalt és a választható szolgáltatások, jobbra a megbízás kérése.",
            ro: "Vindem noi pentru tine: procesul în 5 pași, serviciile incluse și opționale, în dreapta cererea de mandat.",
            en: "We sell it for you: the 5-step process, included and optional services, and the request form on the right." } }
    ],

    admin: [
        { utan: -1, kep: "admin", f: {
            hu: "Az admin: <b>1</b> a modulok (Ma, Hirdetések, Értékesítés, Pénzügy, Irattár, Partnerek, Rendszer) – a Ma oldalon a teendők. <b>2</b> Gyors ugrás bármelyik részre (Ctrl+K).",
            ro: "Administrare: <b>1</b> modulele (Azi, Anunțuri, Vânzări, Finanțe, Arhivă, Parteneri, Sistem) – pe pagina Azi sunt sarcinile. <b>2</b> Salt rapid la orice secțiune (Ctrl+K).",
            en: "The admin: <b>1</b> the modules (Today, Listings, Sales, Finance, Archive, Partners, System) – Today shows your to-dos. <b>2</b> Jump to any section (Ctrl+K)." } }
    ]

};
