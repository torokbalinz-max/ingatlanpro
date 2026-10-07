// ============================================================
//  Súgó – a tartalom (magyar, angol, román)
//
//  Témánként: { id, icon, title, admin?, intro?, sections: [{ h, p?, ul?, steps?, tip? }] }
//   p:     bekezdés (szöveg, egyszerű HTML: <b>, <i>, <a>)
//   ul:    felsorolás
//   steps: számozott lépések
//   tip:   kiemelt tipp
//  A "jo-tudni" téma a kezdőlapról átköltözött "Jó tudni" pontokat is mutatja
//  (homeGood1..6 kulcsok), ezeket a helpPage.js teszi hozzá.
// ============================================================

const HELP_CONTENT = {

    // ================================================================== MAGYAR
    hu: [
        {
            id: "kezdes", icon: "fa-solid fa-flag", title: "Első lépések",
            intro: "Az IngatlanPro egy város összes ingatlanhirdetését gyűjti egy helyre – bármelyik hirdetési oldalon vannak fent –, és piaci elemzést, értékbecslést ad hozzájuk.",
            sections: [
                { h: "Mit tudsz itt csinálni?", ul: [
                    "<b>Keresni</b>: egy város összes eladó vagy kiadó ingatlana egy listában, szűrőkkel, térképen.",
                    "<b>Összevetni az árakat</b>: a Piaci elemzés megmutatja az átlag- és medián €/m² árakat kerület, szobaszám, állapot szerint, és hogyan változnak.",
                    "<b>Becsülni</b>: az Értékbecslő megmondja, nagyjából mennyit ér egy ingatlan, és hogy egy kért ár drága-e.",
                    "<b>Hirdetni</b>: bejelentkezve feltöltheted a saját ingatlanodat, vagy egy másik oldal linkjéből kitöltjük az adatokat.",
                    "<b>Keresést feladni</b>: a „Keresek” oldalon leírhatod, mit keresel – az eladók válaszolhatnak."
                ] },
                { h: "Alapbeállítások", ul: [
                    "<b>Város</b>: a bal oldali keresőben (Hol? → Város). Az oldal megjegyzi a választásod.",
                    "<b>Nyelv</b>: a fejlécben EN / HU / RO. Magyarul a kerületek magyar, angolul és románul a román nevükkel látszanak.",
                    "<b>Sötét mód</b>: a hold ikon a fejlécben (telefonon a fiók menüben).",
                    "<b>Belépés</b>: böngészni belépés nélkül is lehet; kedvencekhez, hirdetésfeladáshoz, üzenetekhez kell fiók (e-mail vagy Google)."
                ] },
                { h: "Menü", p: "Nagy képernyőn a fejlécben, telefonon a bal felső lenyíló menüben éred el az oldalakat: Kezdőlap, Ingatlanok, Térkép, Piaci elemzés, Értékbecslő, Kedvencek, Keresek, Súgó." }
            ]
        },
        {
            id: "kereses", icon: "fa-solid fa-magnifying-glass", title: "Ingatlanok keresése",
            sections: [
                { h: "A kereső (bal oldalt)", p: "A kereső az Ingatlanok, a Térkép és a Piaci elemzés oldalon is ugyanaz – amit itt beállítasz, az mindhárom oldalon érvényes.", ul: [
                    "<b>Mit keresel?</b> Eladó vagy kiadó, és a típus: lakás, ház, telek, üzlethelyiség, iroda.",
                    "<b>Hol?</b> Város; lakásnál kerület, háznál és teleknél a település (ha nem a városban van, hanem mellette).",
                    "<b>Hely pontossága</b>: pontos hely, közelítő hely (csak a környék ismert), vagy nincs megadva.",
                    "<b>Paraméterek</b>: ár, alapterület, szobák, emelet (0 = földszint; 1–1 = csak első emelet), állapot, teleknél belterület / külterület.",
                    "<b>Duplikált hirdetések elrejtése</b>: ha ugyanaz az ingatlan több oldalon is fent van, csak egyszer látszik.",
                    "<b>Csak fényképes hirdetések</b>.",
                    "<b>Hirdetési oldal fül</b>: kiválaszthatod, melyik oldalról származó hirdetéseket lásd."
                ] },
                { h: "Nézetek", ul: [
                    "<b>Kártyák</b>: képpel, a legfontosabb adatokkal.",
                    "<b>Táblázat</b>: bármelyik oszlop szerint rendezhető (kattints az oszlop fejlécére).",
                    "<b>Térkép</b>: ugyanazok a találatok a térképen."
                ] },
                { h: "Keresés mentése és értesítés", steps: [
                    "Állítsd be a szűrőket.",
                    "Kattints a „Keresés mentése” gombra a kereső alján, és adj neki nevet.",
                    "Ha bekapcsolod az értesítést, naponta legfeljebb egyszer e-mailt kapsz az új találatokról.",
                    "A mentett kereséseidet a Fiókom → Mentett keresések alatt találod; egy kattintással visszatöltheted őket."
                ] },
                { tip: "Telefonon a szűrők a „Szűrők” gombra nyílnak le; a Keresés gomb után maguktól becsukódnak, hogy lásd a találatokat." }
            ]
        },
        {
            id: "terkep", icon: "fa-solid fa-map-location-dot", title: "Térkép",
            sections: [
                { h: "Mit látsz a térképen?", ul: [
                    "Minden jelölő egy hirdetés; a <b>színe az állapotot</b> mutatja (a jelmagyarázat a térkép sarkában).",
                    "<b>Kör</b> jelzi a közelítő helyet: a hirdetés csak a környéket adja meg, az ingatlan a körön belül bárhol lehet.",
                    "A <b>halvány színes területek</b> a kerülethatárok (ahol az admin megrajzolta őket).",
                    "Kattints egy jelölőre: rövid adatlap, onnan megnyitható a teljes hirdetés."
                ] },
                { h: "Kerületek és a térkép", p: "Pontos helyű hirdetésnél a kerületet a megrajzolt határ dönti el – a hirdetés szövege ennél kevésbé számít. Ha két határ között kis rés maradt, a legközelebbi kerület számít (80 m-en belül). Egymásba lógó határoknál az a kerület, amelyiknek a pont mélyebben van a belsejében." }
            ]
        },
        {
            id: "hirdetes", icon: "fa-solid fa-rectangle-list", title: "Egy hirdetés adatlapja",
            sections: [
                { h: "Mi van az adatlapon?", ul: [
                    "Képek (nagyítható), ár, €/m², alapterület, szobák, emelet, állapot, építés éve.",
                    "Hely a térképen, a kerület vagy a település.",
                    "Az eredeti hirdetés linkje (és ha más oldalakon is fent van, azok is).",
                    "Ingatlanirodás hirdetésnél az iroda és az ügynök elérhetősége."
                ] },
                { h: "Mit tehetsz vele?", ul: [
                    "<b>Csillag</b>: a Kedvencek közé teszi.",
                    "<b>Üzenet</b>: kérdezhetsz a hirdetőtől (belépve).",
                    "<b>Értékbecslés</b>: az adataival megnyitja az Értékbecslőt – látod, drága-e.",
                    "<b>Bejelentés</b>: ha a hirdetés jogellenes vagy megtévesztő, jelezheted."
                ] }
            ]
        },
        {
            id: "piac", icon: "fa-solid fa-chart-line", title: "Piaci elemzés",
            intro: "Minden szám a bal oldali kereső szűrésére vonatkozik (típus, város, kerület, szobák, állapot...). Csak az ellenőrzött hirdetések számítanak – a hiányos vagy gyanús adatúak kimaradnak.",
            sections: [
                { h: "Jelenlegi piac", ul: [
                    "Darabszám, medián ár, átlag és medián €/m², tipikus ársáv (a középső 50%).",
                    "Bontások: kerület, állapot, szobaszám, emelet (háznál település) – táblázat és grafikon, a városátlagtól való eltéréssel.",
                    "A legolcsóbb négyzetméterárú hirdetések a szűrésben."
                ] },
                { h: "Előzmények (mentett piaci állapotok)", ul: [
                    "Minden hónapban <b>automatikusan</b> mentünk egy pillanatképet városonként és típusonként (az admin kézzel is menthet).",
                    "Válassz egy mentést, és megnézheted, milyen volt akkor a piac.",
                    "Az „Összevetés másik mentéssel” választóval két mentést tehetsz egymás mellé."
                ] },
                { h: "Ártrend és összevetés", p: "Megmutatja, hogyan változtak az árak hónapról hónapra (vagy negyedévenként) – nem csak a mentésekből, hanem közvetlenül a hirdetésekből.", ul: [
                    "<b>Mutató</b>: medián €/m² (a kilógó hirdetések nem húzzák el), átlag €/m², összetétellel korrigált €/m², medián ár, hirdetések száma, új hirdetések, azonos hirdetések árindexe.",
                    "<b>Bontás</b>: külön vonal szobaszám, kerület, állapot vagy emelet szerint.",
                    "<b>Szobák</b>: pl. csak a 2 szobás lakások trendje – ez felülírja a kereső szobaszám-szűrőjét.",
                    "<b>Időszak és felbontás</b>: tól–ig hónap, havi vagy negyedéves pontok."
                ] },
                { h: "Honnan jönnek az ártrend számai?", ul: [
                    "Minden hirdetésnél tudjuk, mikor került fel és mikor került le a piacról, és naplózzuk az ár minden változását.",
                    "Egy hónapban azok a hirdetések számítanak, amelyek abban a hónapban fent voltak – azon az áron, ami a hónap végén élt.",
                    "Az <b>összetétellel korrigált</b> €/m² kiszűri, ha egy hónapban például több volt a kis lakás (ami magasabb €/m²-t hozna áremelkedés nélkül is).",
                    "Az <b>azonos hirdetések árindexe</b> csak a mindkét időszakban fent lévő hirdetések saját árváltozását méri – ez a legtisztább árváltozás.",
                    "Ahol 5-nél kevesebb hirdetés van, a pont üres karikával látszik: ott óvatosan kell kezelni a számot."
                ] },
                { h: "Két időszak összevetése", steps: [
                    "Az „Ártrend és összevetés” fül alján add meg az A és a B időszakot (egy hónap, vagy tól–ig tartomány), pl. április és augusztus.",
                    "Kattints az Összevetés gombra.",
                    "Felül a fő számok változása, alatta szobaszám, kerület, állapot és emelet szerint – és hogy az azonos hirdetések ára mennyit változott."
                ] },
                { tip: "Az árnaplózás a mostani frissítéssel indult: a korábbi hónapokra a hirdetések felvételkori árát használjuk, az árváltozások innentől pontosan látszanak." }
            ]
        },
        {
            id: "ertekbecslo", icon: "fa-solid fa-calculator", title: "Értékbecslő",
            sections: [
                { h: "Használat", steps: [
                    "Válaszd ki az ügyletet (eladó / kiadó), a típust, a várost és ha tudod, a kerületet.",
                    "Add meg az alapterületet (kötelező), a szobákat, az emeletet (és ha tudod, hány emeletes az épület) és az állapotot.",
                    "Ha van kért ár, írd be – megmutatjuk, drága-e vagy olcsó.",
                    "Kattints a Becslés gombra."
                ] },
                { h: "Hogyan számol?", ul: [
                    "<b>Hasonló hirdetések</b>: a leghasonlóbb hirdetések árát átszámoljuk a te ingatlanodra (méret, állapot, kerület, emelet különbsége szerint).",
                    "<b>Árarány-modell</b>: a város összes hirdetéséből megtanuljuk, mennyivel ér többet például egy jó állapotú lakás a felújítandónál, egy földszinti a többinél, egy kerület a városátlagnál, és hogyan csökken a €/m² a mérettel. Ahol kevés az adat, józan piaci arányok felé húzunk.",
                    "A kettőt keverjük: ha sok nagyon hasonló hirdetés van, azok döntenek; ha kevés (pl. ritka szobaszám egy kis kerületben), a modell kap nagyobb súlyt.",
                    "Az eredmény alatt látod mindkét becslést, a súlyukat és a fő arányokat (pl. Állapot +14%)."
                ] },
                { h: "Megbízhatóság és ársáv", ul: [
                    "<b>Magas</b>: sok nagyon hasonló hirdetés, a kerületből is.",
                    "<b>Közepes</b>: elég adat, de kevésbé hasonlók – vagy a modell elég adatból tanult.",
                    "<b>Alacsony</b>: kevés vagy eltérő hirdetés – tájékoztató jellegű.",
                    "Az ársáv a tipikus eltérést mutatja: a hasonló ingatlanok nagyjából fele ebbe esik."
                ] },
                { tip: "A becslés hirdetési (kért) árakon alapul, nem a tényleges eladási árakon – ezek általában néhány százalékkal alacsonyabbak." }
            ]
        },
        {
            id: "kedvencek", icon: "fa-solid fa-star", title: "Kedvencek és mentett keresések",
            sections: [
                { h: "Kedvencek", ul: [
                    "A csillaggal jelölt hirdetések a Kedvencek oldalon egy táblázatban látszanak.",
                    "A kedvencek a fiókodhoz tartoznak, bármelyik eszközön látod őket."
                ] },
                { h: "Mentett keresések", ul: [
                    "A kereső alján „Keresés mentése”.",
                    "Értesítés: naponta legfeljebb egy e-mail az új találatokról (a Fiókom oldalon kikapcsolható)."
                ] }
            ]
        },
        {
            id: "feladas", icon: "fa-solid fa-circle-plus", title: "Hirdetés feladása",
            sections: [
                { h: "Két út", ul: [
                    "<b>Link beolvasása</b>: ha az ingatlanod már fent van egy másik oldalon, illeszd be a linket – kitöltjük az adatokat, a képeket és ha lehet, a helyet.",
                    "<b>Kézi kitöltés</b>: minden adatot te adsz meg, és feltöltöd a képeket."
                ] },
                { h: "Lépések", steps: [
                    "Jelentkezz be, majd „Hirdetés feladása”.",
                    "Válaszd ki az ügyletet és a típust – csak az adott típusnál értelmes mezők látszanak.",
                    "Töltsd ki a kötelező mezőket (piros jelzés mutatja, mi hiányzik).",
                    "Jelöld meg a helyet a térképen (a jelölő húzható). Pontos helynél a kerület magától kitöltődik a kerülethatárok alapján.",
                    "Tölts fel képeket (a böngésző lekicsinyíti őket, nem kell külön).",
                    "Mentés. Később a Fiókom → Hirdetéseim alatt szerkesztheted vagy törölheted."
                ] },
                { tip: "Ha az ár nagyon eltér a hasonló hirdetésekétől, a hirdetés megjelenik, de az admin ellenőrzi az adatokat." }
            ]
        },
        {
            id: "keresek", icon: "fa-solid fa-bullhorn", title: "Keresek (vevői igények)",
            sections: [
                { h: "Ha vásárolni / bérelni szeretnél", steps: [
                    "A „Keresek” oldalon adj fel egy igényt: típus, város, kerületek, ár- és méretsáv, rövid leírás.",
                    "Az eladók és az irodák látják, és üzenetben ajánlhatnak ingatlant.",
                    "A válaszokat a Fiókom → Üzenetek alatt olvashatod."
                ] },
                { h: "Ha eladó vagy", p: "Nézd át a vevők igényeit, és válaszolj annak, akinek megfelel az ingatlanod – egy hirdetésedet is csatolhatod." }
            ]
        },
        {
            id: "fiok", icon: "fa-solid fa-circle-user", title: "Fiók és üzenetek",
            sections: [
                { h: "Fiókom", ul: [
                    "<b>Profil</b>: név, telefon, e-mail értesítések, jelszó.",
                    "<b>Hirdetéseim</b>: a feladott hirdetéseid, szerkesztés, törlés.",
                    "<b>Mentett keresések</b>, <b>keresési igényeim</b>, <b>üzenetek</b>."
                ] },
                { h: "Üzenetek", p: "A fejlécben a fiók ikonon piros szám jelzi az olvasatlan üzeneteket. Az üzenetek a hirdetéshez vagy az igényhez kapcsolódnak, így mindig látszik, miről szólnak." }
            ]
        },
        {
            id: "iroda", icon: "fa-solid fa-briefcase", title: "Ingatlanirodáknak",
            sections: [
                { h: "Ingatlanirodák listája", p: "A fejlécben az <a href=\"#irodak\">Irodák</a> oldalon látható minden ellenőrzött iroda. Név és város szerint kereshetsz; egy irodára kattintva megnyílik a profilja: weboldal, elérhetőségek, ügynökök és az iroda aktív hirdetései." },
                { h: "Iroda regisztrálása (ellenőrzéssel)", steps: [
                    "Irodák oldal → Iroda regisztrálása (vagy a menüben: Irodám kezelése → Új iroda).",
                    "Add meg a cég adószámát (CUI). A rendszer lekérdezi a román adóhatóság (ANAF) nyilvános adatbázisából a hivatalos nevet, a cégjegyzékszámot és a székhelyet. Nem létező, inaktív vagy megszűnt cég nem regisztrálható.",
                    "Töltsd ki a többi adatot: megjelenő név, telefon, e-mail, weboldal, logó.",
                    "Az admin jóváhagyása után az iroda megjelenik az irodák listájában és a hirdetéseken. Addig is kezelheted a hirdetéseket, de az iroda neve csak a jóváhagyás után látszik mások számára."
                ] },
                { tip: "Ha az iroda neve vagy adószáma megváltozik, újra jóvá kell hagyni – így nem lehet egy elfogadott irodát utólag kitalált névre átírni." },
                { h: "Munkatársak és ügynökök", ul: [
                    "Munkatársat e-mail címmel hívhatsz meg; a meghívást neki kell elfogadnia (a menüben jelzi a piros szám). Elfogadás előtt nem fér hozzá az irodához.",
                    "Ügynököket fiók nélkül is felvehetsz (név, telefon, e-mail): ők a hirdetéseken kapcsolattartóként jelennek meg."
                ] },
                { h: "Hirdetések kezelése", ul: [
                    "Hirdetésfeladáskor válaszd ki, hogy az iroda nevében hirdetsz, és melyik ügynök a felelős.",
                    "Saját hivatkozási szám, mappa / címke és belső megjegyzés (ezt csak az iroda látja).",
                    "Tömeges műveletek: ügynök hozzárendelése, mappába tétel, archiválás, eladottnak jelölés."
                ] }
            ]
        },
        {
            id: "jo-tudni", icon: "fa-solid fa-lightbulb", title: "Jó tudni",
            sections: [
                { h: "Gyakori kérdések", ul: [
                    "<b>Miért hiányzik egy hirdetés?</b> Lehet, hogy duplikátumként el van rejtve, vagy még ellenőrzésre vár, vagy a forrásoldalon már nem elérhető.",
                    "<b>Mit jelent a csillag (*) az állapot után?</b> Az állapotot a hirdetés szövegéből becsültük, nem a hirdető adta meg.",
                    "<b>Miért nem számít bele egy hirdetés a statisztikába?</b> Mert hiányos vagy gyanús az adata (pl. irreális €/m²), amíg az admin nem ellenőrzi.",
                    "<b>Mennyire friss az adat?</b> A figyelt oldalakat rendszeresen átnézzük; a már nem elérhető hirdetések lekerülnek."
                ] }
            ]
        },
        {
            id: "admin", icon: "fa-solid fa-user-shield", title: "Adminnak", admin: true,
            sections: [
                { h: "Ellenőrzésre vár", p: "A hiányos vagy gyanús adatú hirdetések. Billentyűkkel gyorsan végigmehetsz rajtuk; az AI-ellenőrzés (ha be van kapcsolva) javaslatot ad a javításra." },
                { h: "Állapot beállítása", ul: [
                    "Az állapot nélküli (vagy csak becsült, *-os) hirdetések egymás után, nagy képekkel.",
                    "<b>1–9</b> billentyű = állapot (az Állapotok lista sorrendjében), és jön a következő. <b>←/→</b> a képek, <b>S</b> kihagyás, <b>Z</b> visszavonás, <b>Enter</b> = a szövegből adott javaslat elfogadása.",
                    "<b>Rács nézet</b>: sok hirdetés egyszerre; kijelölheted őket, és egy kattintással mindre ugyanazt állíthatod.",
                    "A hirdetések táblázatában is: jelöld ki a sorokat, és a felső sávban állíthatsz állapotot."
                ] },
                { h: "Beolvasás, figyelt oldalak, duplikátumok", ul: [
                    "Beolvasás: egy hirdetés vagy egy teljes találati lista linkje.",
                    "Figyelt oldalak: időzítve újra átnézzük őket, az új hirdetések maguktól bekerülnek.",
                    "<b>Meglévő hirdetések ellenőrzése</b>: csak a már bent lévő hirdetéseket nézi meg a forrásoldalon (ár, elérhetőség, hiányzó adatok) – új hirdetést nem olvas be.",
                    "Duplikátumok: ugyanaz az ingatlan több oldalon – összevonhatod, vagy jelölheted, hogy nem ugyanaz."
                ] },
                { h: "Állapotok", ul: [
                    "Admin → Állapotok: az állapotok listája kód nélkül bővíthető (pl. újépítésű, félkész).",
                    "Minden állapotnak van magyar, román és angol neve, színe, szintje (sorrend és összehasonlítás), árszorzója (az értékbecsléshez) és kulcsszavai – ezekből ismeri fel a hirdetés szövegéből.",
                    "A beépített állapotok kikapcsolhatók, a sajátok törölhetők (a hirdetéseik ilyenkor másik állapotba sorolhatók).",
                    "A <b>Felismerés kipróbálása</b> mezőben megnézheted, mit ismer fel egy szövegből; a <b>Kitöltés a leírásokból</b> pótolja az állapot nélküli hirdetések állapotát (bizonytalan, *-os jelöléssel, hogy átnézhesd)."
                ] },
                { h: "Ingatlanirodák", ul: [
                    "Admin → Ingatlanirodák: az új és a módosított irodák jóváhagyásra várnak (az Áttekintésben teendőként is megjelennek).",
                    "Látod az ANAF-adatokat (hivatalos név, székhely, fő tevékenység, aktív-e); újra le is kérdezheted.",
                    "Jóváhagyás, elutasítás (indokkal) vagy felfüggesztés – az iroda vezetője látja a döntést és az indokot."
                ] },
                { h: "Webhely adatai", ul: [
                    "Admin → Webhely adatai: az üzemeltető adatai (név / cégnév, adószám, cím, kapcsolati e-mail, telefon).",
                    "Ezek jelennek meg automatikusan az Impresszumban, a Felhasználási feltételekben, az Adatvédelmi és a Süti-tájékoztatóban.",
                    "Cégnél az adószámból az ANAF-adatok egy gombnyomással kitölthetők. Ha a kapcsolati e-mail üres, az admin e-mail címe látszik."
                ] },
                { h: "Városok, kerületek, kerülethatárok", ul: [
                    "A kerületeknek magyar és román nevük, és más oldalakon használt neveik (aliasok) vannak.",
                    "A határ megrajzolása: kattints a térképre, a pontok húzhatók; a szomszéd kerület pontjaihoz tapad.",
                    "<b>Ellenőrzés</b> gomb: listázza a pontos helyű hirdetéseket, amelyek kerülete eltér a térképtől, vagy egyik határon sincsenek belül.",
                    "<b>Újrasorolás</b>: a határok szerint igazítja a kerületeket (induláskor és mentéskor magától is lefut)."
                ] },
                { h: "Piaci mentések és értékbecslő", ul: [
                    "Havonta automatikus piaci mentés készül; kézzel az Előzmények fülön menthetsz.",
                    "Áttekintés → „Értékbecslő pontossága”: a valós adatokon méri a becslő hibáját (minden hirdetést a többi alapján becsül), a régi és az új módszerrel."
                ] }
            ]
        },
        {
            id: "jogi", icon: "fa-solid fa-scale-balanced", title: "Adatvédelem és jogi",
            sections: [
                { h: "Dokumentumok", ul: [
                    "<a href=\"#jogi/aszf\">Felhasználási feltételek</a>",
                    "<a href=\"#jogi/adatvedelem\">Adatvédelmi tájékoztató</a>",
                    "<a href=\"#jogi/sutik\">Sütik</a>",
                    "<a href=\"#jogi/impresszum\">Impresszum</a>",
                    "<a href=\"#jogi/bejelentes\">Tartalom bejelentése</a>"
                ] }
            ]
        }
    ],

    // ================================================================== ENGLISH
    en: [
        {
            id: "kezdes", icon: "fa-solid fa-flag", title: "Getting started",
            intro: "IngatlanPro collects every property listing of a city in one place – whichever site it is on – and adds market analysis and valuation.",
            sections: [
                { h: "What can you do here?", ul: [
                    "<b>Search</b>: all properties for sale or rent in a city in one list, with filters and a map.",
                    "<b>Compare prices</b>: Market analysis shows average and median €/m² by district, room count and condition, and how they change.",
                    "<b>Estimate</b>: the Valuation tool tells you roughly what a property is worth and whether an asking price is high.",
                    "<b>Post</b>: when signed in you can upload your own property, or we fill in the data from another site's link.",
                    "<b>Post a search request</b>: on the “Wanted” page describe what you are looking for – sellers can answer."
                ] },
                { h: "Basic settings", ul: [
                    "<b>City</b>: in the search panel on the left (Where? → City). Your choice is remembered.",
                    "<b>Language</b>: EN / HU / RO in the header. In English and Romanian districts show their Romanian name.",
                    "<b>Dark mode</b>: the moon icon in the header (on phones in the account menu).",
                    "<b>Sign in</b>: browsing works without an account; favourites, posting and messages need one (e-mail or Google)."
                ] },
                { h: "Menu", p: "On large screens the pages are in the header, on phones in the drop-down menu at the top left: Home, Properties, Map, Market analysis, Valuation, Favourites, Wanted, Help." }
            ]
        },
        {
            id: "kereses", icon: "fa-solid fa-magnifying-glass", title: "Searching properties",
            sections: [
                { h: "The search panel (left)", p: "The search panel is shared by the Properties, Map and Market analysis pages – what you set here applies on all three.", ul: [
                    "<b>What are you looking for?</b> For sale or for rent, and the type: apartment, house, land, commercial space, office.",
                    "<b>Where?</b> City; for apartments the district, for houses and land the locality (if it is next to the city, not in it).",
                    "<b>Location accuracy</b>: exact, approximate (only the area is known), or not given.",
                    "<b>Parameters</b>: price, floor area, rooms, floor (0 = ground floor; 1–1 = first floor only), condition, for land intra-/extra-muros.",
                    "<b>Hide duplicate listings</b>: a property posted on several sites shows only once.",
                    "<b>Only listings with photos</b>.",
                    "<b>Listing site tab</b>: choose which sites' listings you want to see."
                ] },
                { h: "Views", ul: [
                    "<b>Cards</b>: with a photo and the key data.",
                    "<b>Table</b>: sortable by any column (click the header).",
                    "<b>Map</b>: the same results on a map."
                ] },
                { h: "Saving a search and alerts", steps: [
                    "Set the filters.",
                    "Click “Save search” at the bottom of the panel and give it a name.",
                    "With alerts on you get at most one e-mail a day about new matches.",
                    "Your saved searches are under My account → Saved searches; load them back with one click."
                ] },
                { tip: "On phones the filters open with the “Filters” button and close after you press Search, so you can see the results." }
            ]
        },
        {
            id: "terkep", icon: "fa-solid fa-map-location-dot", title: "Map",
            sections: [
                { h: "What is on the map?", ul: [
                    "Each marker is a listing; its <b>colour shows the condition</b> (legend in the corner).",
                    "A <b>circle</b> means an approximate location: the listing only gives the area, the property can be anywhere inside.",
                    "The <b>light coloured areas</b> are district borders (where the admin has drawn them).",
                    "Click a marker for a short card and open the full listing from there."
                ] },
                { h: "Districts and the map", p: "For listings with an exact location the drawn border decides the district – the listing text matters less. If a small gap was left between two borders, the nearest district counts (within 80 m). Where borders overlap, the district the point is deeper inside wins." }
            ]
        },
        {
            id: "hirdetes", icon: "fa-solid fa-rectangle-list", title: "A listing's page",
            sections: [
                { h: "What is on it?", ul: [
                    "Photos (zoomable), price, €/m², floor area, rooms, floor, condition, year built.",
                    "Location on the map, district or locality.",
                    "Link to the original listing (and to other sites where it is also posted).",
                    "For agency listings the agency's and agent's contact details."
                ] },
                { h: "What can you do?", ul: [
                    "<b>Star</b>: adds it to Favourites.",
                    "<b>Message</b>: ask the advertiser (signed in).",
                    "<b>Valuation</b>: opens the Valuation tool with its data – see whether it is expensive.",
                    "<b>Report</b>: flag it if it is illegal or misleading."
                ] }
            ]
        },
        {
            id: "piac", icon: "fa-solid fa-chart-line", title: "Market analysis",
            intro: "Every number follows the search panel's filters (type, city, district, rooms, condition...). Only verified listings count – those with missing or suspicious data are left out.",
            sections: [
                { h: "Current market", ul: [
                    "Count, median price, average and median €/m², typical price range (the middle 50%).",
                    "Breakdowns: district, condition, rooms, floor (locality for houses) – table and chart, with the difference from the city average.",
                    "The listings with the lowest price per m² in the search."
                ] },
                { h: "History (saved market states)", ul: [
                    "Every month a snapshot is saved <b>automatically</b> per city and type (the admin can also save manually).",
                    "Pick a snapshot to see what the market was like then.",
                    "Use “Compare with another snapshot” to put two side by side."
                ] },
                { h: "Price trend & comparison", p: "Shows how prices changed month by month (or by quarter) – computed directly from the listings, not only from snapshots.", ul: [
                    "<b>Indicator</b>: median €/m² (outliers don't skew it), average €/m², mix-adjusted €/m², median price, number of listings, new listings, same-listing price index.",
                    "<b>Split</b>: a separate line per room count, district, condition or floor.",
                    "<b>Rooms</b>: e.g. only 2-room apartments – overrides the search panel's room filter.",
                    "<b>Period and resolution</b>: from–to month, monthly or quarterly points."
                ] },
                { h: "Where do the trend numbers come from?", ul: [
                    "For every listing we know when it went on and came off the market, and we log every price change.",
                    "A month includes the listings that were on the market in that month – at the price valid at the end of the month.",
                    "The <b>mix-adjusted</b> €/m² removes the effect of, say, more small flats in one month (which would raise €/m² without any price increase).",
                    "The <b>same-listing price index</b> only measures price changes of listings present in both periods – the cleanest price change.",
                    "Where there are fewer than 5 listings the point is drawn hollow: treat that number with care."
                ] },
                { h: "Comparing two periods", steps: [
                    "At the bottom of the “Price trend & comparison” tab set period A and B (one month or a from–to range), e.g. April and August.",
                    "Click Compare.",
                    "At the top the change of the main figures, below by rooms, district, condition and floor – and how much the same listings' prices changed."
                ] },
                { tip: "Price logging started with this update: for earlier months the price at the time of listing is used; from now on price changes are tracked exactly." }
            ]
        },
        {
            id: "ertekbecslo", icon: "fa-solid fa-calculator", title: "Valuation",
            sections: [
                { h: "How to use it", steps: [
                    "Choose sale / rent, the type, the city and, if you know it, the district.",
                    "Enter the floor area (required), rooms, floor (and if you know, how many floors the building has) and condition.",
                    "If there is an asking price, enter it – we show whether it is high or low.",
                    "Click Estimate."
                ] },
                { h: "How is it calculated?", ul: [
                    "<b>Similar listings</b>: the prices of the most similar listings are converted to your property (by the difference in size, condition, district, floor).",
                    "<b>Price-ratio model</b>: from all listings of the city we learn how much more e.g. a flat in good condition is worth than one needing renovation, a ground-floor flat versus others, a district versus the city average, and how €/m² falls with size. Where data is scarce we lean on sensible market ratios.",
                    "The two are blended: with many very similar listings they decide; with few (e.g. a rare room count in a small district) the model gets more weight.",
                    "Below the result you see both estimates, their weights and the main ratios (e.g. Condition +14%)."
                ] },
                { h: "Confidence and range", ul: [
                    "<b>High</b>: many very similar listings, also from the district.",
                    "<b>Medium</b>: enough data but less similar – or the model learned from enough data.",
                    "<b>Low</b>: few or different listings – indicative only.",
                    "The range shows the typical spread: about half of similar properties fall inside it."
                ] },
                { tip: "The estimate is based on asking prices, not actual sale prices – those are usually a few percent lower." }
            ]
        },
        {
            id: "kedvencek", icon: "fa-solid fa-star", title: "Favourites and saved searches",
            sections: [
                { h: "Favourites", ul: [
                    "Starred listings are shown in a table on the Favourites page.",
                    "Favourites belong to your account – you see them on any device."
                ] },
                { h: "Saved searches", ul: [
                    "“Save search” at the bottom of the search panel.",
                    "Alerts: at most one e-mail a day about new matches (can be turned off on My account)."
                ] }
            ]
        },
        {
            id: "feladas", icon: "fa-solid fa-circle-plus", title: "Posting a listing",
            sections: [
                { h: "Two ways", ul: [
                    "<b>Read a link</b>: if your property is already on another site, paste the link – we fill in the data, photos and, if possible, the location.",
                    "<b>Fill in by hand</b>: you enter everything and upload the photos."
                ] },
                { h: "Steps", steps: [
                    "Sign in, then “Post a listing”.",
                    "Choose the deal and the type – only the fields that make sense for it are shown.",
                    "Fill in the required fields (red marks show what is missing).",
                    "Mark the location on the map (the marker can be dragged). With an exact location the district is filled in from the district borders.",
                    "Upload photos (the browser resizes them).",
                    "Save. Later you can edit or delete it under My account → My listings."
                ] },
                { tip: "If the price differs a lot from similar listings, the listing still appears, but the admin checks the data." }
            ]
        },
        {
            id: "keresek", icon: "fa-solid fa-bullhorn", title: "Wanted (buyer requests)",
            sections: [
                { h: "If you want to buy / rent", steps: [
                    "On the “Wanted” page post a request: type, city, districts, price and size range, short description.",
                    "Sellers and agencies see it and can offer a property by message.",
                    "Read the answers under My account → Messages."
                ] },
                { h: "If you are selling", p: "Look through buyers' requests and answer the ones your property fits – you can attach one of your listings." }
            ]
        },
        {
            id: "fiok", icon: "fa-solid fa-circle-user", title: "Account and messages",
            sections: [
                { h: "My account", ul: [
                    "<b>Profile</b>: name, phone, e-mail alerts, password.",
                    "<b>My listings</b>: your listings, edit, delete.",
                    "<b>Saved searches</b>, <b>my requests</b>, <b>messages</b>."
                ] },
                { h: "Messages", p: "A red number on the account icon shows unread messages. Messages belong to a listing or a request, so it is always clear what they are about." }
            ]
        },
        {
            id: "iroda", icon: "fa-solid fa-briefcase", title: "For real estate agencies",
            sections: [
                { h: "List of agencies", p: "The <a href=\"#irodak\">Agencies</a> page in the header shows every verified agency. Search by name and city; click an agency to open its profile: website, contact details, agents and the agency's active listings." },
                { h: "Registering an agency (with verification)", steps: [
                    "Agencies page → Register your agency (or in the menu: Manage my agency → New agency).",
                    "Enter the company's tax ID (CUI). The site looks up the official name, trade register number and registered office in the public database of the Romanian tax authority (ANAF). Non-existent, inactive or dissolved companies cannot be registered.",
                    "Fill in the rest: display name, phone, e-mail, website, logo.",
                    "Once the admin approves it, the agency appears in the agency list and on its listings. Until then you can already manage listings, but the agency name is shown to others only after approval."
                ] },
                { tip: "If the agency's name or tax ID changes, it has to be approved again – so an approved agency cannot later be renamed to something made up." },
                { h: "Colleagues and agents", ul: [
                    "Invite a colleague by e-mail; they have to accept the invitation (a red number in the menu shows it). Before accepting they have no access to the agency.",
                    "Agents can be added without an account (name, phone, e-mail): they appear as contacts on the listings."
                ] },
                { h: "Managing listings", ul: [
                    "When posting, choose to post on behalf of the agency and which agent is responsible.",
                    "Own reference number, folder / tag and internal note (only the agency sees it).",
                    "Bulk actions: assign agent, move to folder, archive, mark as sold."
                ] }
            ]
        },
        {
            id: "jo-tudni", icon: "fa-solid fa-lightbulb", title: "Good to know",
            sections: [
                { h: "Frequently asked questions", ul: [
                    "<b>Why is a listing missing?</b> It may be hidden as a duplicate, waiting for review, or no longer available on the source site.",
                    "<b>What does the asterisk (*) after the condition mean?</b> The condition was estimated from the listing text, not given by the advertiser.",
                    "<b>Why doesn't a listing count in the statistics?</b> Its data is missing or suspicious (e.g. unrealistic €/m²) until the admin checks it.",
                    "<b>How fresh is the data?</b> Watched sites are checked regularly; listings no longer available are removed."
                ] }
            ]
        },
        {
            id: "admin", icon: "fa-solid fa-user-shield", title: "For the admin", admin: true,
            sections: [
                { h: "Needs review", p: "Listings with missing or suspicious data. Go through them quickly with the keyboard; the AI check (if enabled) suggests fixes." },
                { h: "Set condition", ul: [
                    "Listings without condition (or only estimated, with *) one after another, with large photos.",
                    "<b>1–9</b> keys = condition (in the order of the Conditions list), then the next one comes. <b>←/→</b> photos, <b>S</b> skip, <b>Z</b> undo, <b>Enter</b> = accept the suggestion from the text.",
                    "<b>Grid view</b>: many listings at once; select them and set the same condition for all with one click.",
                    "Also in the listings table: select rows and set the condition in the bar above."
                ] },
                { h: "Import, watched sites, duplicates", ul: [
                    "Import: the link of one listing or of a whole results page.",
                    "Watched sites: checked again on a schedule, new listings are added automatically.",
                    "<b>Check existing listings</b>: only looks at listings already in the database on their source site (price, availability, missing data) – it does not import new ones.",
                    "Duplicates: the same property on several sites – merge, or mark as different."
                ] },
                { h: "Conditions", ul: [
                    "Admin → Conditions: the list of conditions can be extended without code (e.g. new build, unfinished).",
                    "Each condition has a Hungarian, Romanian and English name, a colour, a level (order and comparison), a price multiplier (for the valuation) and keywords – these are used to recognise it in the listing text.",
                    "Built-in conditions can be switched off, your own ones deleted (their listings can be moved to another condition).",
                    "<b>Try the detection</b> shows what is recognised from a text; <b>Fill in from descriptions</b> fills in the condition of listings that have none (marked as uncertain, with *, so you can review them)."
                ] },
                { h: "Real estate agencies", ul: [
                    "Admin → Real estate agencies: new and changed agencies wait for approval (also shown as a to-do on the Overview).",
                    "You see the ANAF data (official name, registered office, main activity, active or not) and can look it up again.",
                    "Approve, reject (with a reason) or suspend – the agency manager sees the decision and the reason."
                ] },
                { h: "Website details", ul: [
                    "Admin → Website details: the operator's details (name / company name, tax ID, address, contact e-mail, phone).",
                    "They appear automatically in the Legal notice, the Terms of use, the Privacy and the Cookie policy.",
                    "For a company, the ANAF data can be filled in from the tax ID with one click. If the contact e-mail is empty, the admin's e-mail address is shown."
                ] },
                { h: "Cities, districts, district borders", ul: [
                    "Districts have a Hungarian and a Romanian name, plus names used on other sites (aliases).",
                    "Drawing a border: click on the map, points can be dragged; they snap to the neighbouring district's points.",
                    "<b>Check</b> button: lists listings with an exact location whose district differs from the map, or that are outside every border.",
                    "<b>Re-sort</b>: aligns districts to the borders (also runs automatically at start-up and when saving)."
                ] },
                { h: "Market snapshots and valuation", ul: [
                    "A market snapshot is saved automatically every month; save manually on the History tab.",
                    "Overview → “Valuation accuracy”: measures the estimator's error on the real data (each listing estimated from the others), old vs. new method."
                ] }
            ]
        },
        {
            id: "jogi", icon: "fa-solid fa-scale-balanced", title: "Privacy and legal",
            sections: [
                { h: "Documents", ul: [
                    "<a href=\"#jogi/aszf\">Terms of use</a>",
                    "<a href=\"#jogi/adatvedelem\">Privacy notice</a>",
                    "<a href=\"#jogi/sutik\">Cookies</a>",
                    "<a href=\"#jogi/impresszum\">Imprint</a>",
                    "<a href=\"#jogi/bejelentes\">Report content</a>"
                ] }
            ]
        }
    ],

    // ================================================================== ROMÂNĂ
    ro: [
        {
            id: "kezdes", icon: "fa-solid fa-flag", title: "Primii pași",
            intro: "IngatlanPro adună într-un singur loc toate anunțurile imobiliare ale unui oraș – de pe orice site – și adaugă analiza pieței și evaluare.",
            sections: [
                { h: "Ce poți face aici?", ul: [
                    "<b>Cauți</b>: toate proprietățile de vânzare sau de închiriat dintr-un oraș, într-o listă, cu filtre și hartă.",
                    "<b>Compari prețurile</b>: Analiza pieței arată €/m² mediu și median pe cartiere, număr de camere și stare, și cum se schimbă.",
                    "<b>Estimezi</b>: Evaluarea îți spune cât valorează aproximativ o proprietate și dacă un preț cerut este mare.",
                    "<b>Publici</b>: autentificat poți încărca propria proprietate, sau completăm datele din linkul altui site.",
                    "<b>Publici o cerere</b>: pe pagina „Caut” descrii ce cauți – vânzătorii îți pot răspunde."
                ] },
                { h: "Setări de bază", ul: [
                    "<b>Oraș</b>: în panoul de căutare din stânga (Unde? → Oraș). Alegerea este reținută.",
                    "<b>Limba</b>: EN / HU / RO în antet. În română și engleză cartierele apar cu numele românesc.",
                    "<b>Mod întunecat</b>: iconița lună din antet (pe telefon în meniul contului).",
                    "<b>Autentificare</b>: poți naviga fără cont; pentru favorite, anunțuri și mesaje îți trebuie cont (e-mail sau Google)."
                ] },
                { h: "Meniu", p: "Pe ecrane mari paginile sunt în antet, pe telefon în meniul din stânga sus: Acasă, Proprietăți, Hartă, Analiza pieței, Evaluare, Favorite, Caut, Ajutor." }
            ]
        },
        {
            id: "kereses", icon: "fa-solid fa-magnifying-glass", title: "Căutarea proprietăților",
            sections: [
                { h: "Panoul de căutare (stânga)", p: "Panoul este comun pentru paginile Proprietăți, Hartă și Analiza pieței – ce setezi aici se aplică pe toate trei.", ul: [
                    "<b>Ce cauți?</b> Vânzare sau închiriere și tipul: apartament, casă, teren, spațiu comercial, birou.",
                    "<b>Unde?</b> Orașul; la apartamente cartierul, la case și terenuri localitatea (dacă e lângă oraș, nu în el).",
                    "<b>Precizia locației</b>: exactă, aproximativă (se știe doar zona) sau nespecificată.",
                    "<b>Parametri</b>: preț, suprafață, camere, etaj (0 = parter; 1–1 = doar etajul 1), stare, la teren intravilan / extravilan.",
                    "<b>Ascunde anunțurile duplicate</b>: o proprietate publicată pe mai multe site-uri apare o singură dată.",
                    "<b>Doar anunțuri cu fotografii</b>.",
                    "<b>Fila site-ului de anunțuri</b>: alegi de pe ce site-uri vrei să vezi anunțurile."
                ] },
                { h: "Vizualizări", ul: [
                    "<b>Carduri</b>: cu fotografie și datele principale.",
                    "<b>Tabel</b>: sortabil după orice coloană (clic pe antet).",
                    "<b>Hartă</b>: aceleași rezultate pe hartă."
                ] },
                { h: "Salvarea căutării și alerte", steps: [
                    "Setează filtrele.",
                    "Apasă „Salvează căutarea” jos în panou și dă-i un nume.",
                    "Cu alertele pornite primești cel mult un e-mail pe zi despre rezultatele noi.",
                    "Căutările salvate sunt la Contul meu → Căutări salvate; le reîncarci cu un clic."
                ] },
                { tip: "Pe telefon filtrele se deschid cu butonul „Filtre” și se închid după Căutare, ca să vezi rezultatele." }
            ]
        },
        {
            id: "terkep", icon: "fa-solid fa-map-location-dot", title: "Hartă",
            sections: [
                { h: "Ce vezi pe hartă?", ul: [
                    "Fiecare marcaj este un anunț; <b>culoarea arată starea</b> (legenda în colț).",
                    "Un <b>cerc</b> înseamnă locație aproximativă: anunțul dă doar zona, proprietatea poate fi oriunde în cerc.",
                    "<b>Zonele colorate deschis</b> sunt limitele cartierelor (unde administratorul le-a desenat).",
                    "Clic pe un marcaj: un card scurt, de unde deschizi anunțul complet."
                ] },
                { h: "Cartierele și harta", p: "La anunțurile cu locație exactă cartierul este stabilit de limita desenată – textul anunțului contează mai puțin. Dacă între două limite a rămas un mic spațiu, contează cartierul cel mai apropiat (sub 80 m). Unde limitele se suprapun, câștigă cartierul în care punctul este mai adânc." }
            ]
        },
        {
            id: "hirdetes", icon: "fa-solid fa-rectangle-list", title: "Pagina unui anunț",
            sections: [
                { h: "Ce conține?", ul: [
                    "Fotografii (mărire), preț, €/m², suprafață, camere, etaj, stare, anul construcției.",
                    "Locația pe hartă, cartierul sau localitatea.",
                    "Linkul anunțului original (și alte site-uri unde apare).",
                    "La anunțurile de agenție, datele de contact ale agenției și agentului."
                ] },
                { h: "Ce poți face?", ul: [
                    "<b>Stea</b>: îl adaugă la Favorite.",
                    "<b>Mesaj</b>: întrebi agentul de publicitate (autentificat).",
                    "<b>Evaluare</b>: deschide Evaluarea cu datele lui – vezi dacă e scump.",
                    "<b>Raportare</b>: semnalezi dacă e ilegal sau înșelător."
                ] }
            ]
        },
        {
            id: "piac", icon: "fa-solid fa-chart-line", title: "Analiza pieței",
            intro: "Toate cifrele urmează filtrele din panoul de căutare (tip, oraș, cartier, camere, stare...). Contează doar anunțurile verificate – cele cu date lipsă sau suspecte sunt excluse.",
            sections: [
                { h: "Piața actuală", ul: [
                    "Număr, preț median, €/m² mediu și median, interval tipic de preț (cei 50% din mijloc).",
                    "Defalcări: cartier, stare, camere, etaj (la case localitate) – tabel și grafic, cu diferența față de media orașului.",
                    "Anunțurile cu cel mai mic preț pe m² din căutare."
                ] },
                { h: "Istoric (stări salvate ale pieței)", ul: [
                    "În fiecare lună se salvează <b>automat</b> o captură pe oraș și tip (administratorul poate salva și manual).",
                    "Alege o captură ca să vezi cum era piața atunci.",
                    "Cu „Compară cu altă captură” pui două una lângă alta."
                ] },
                { h: "Evoluția prețurilor și comparație", p: "Arată cum s-au schimbat prețurile lună de lună (sau trimestrial) – calculat direct din anunțuri, nu doar din capturi.", ul: [
                    "<b>Indicator</b>: €/m² median (valorile extreme nu îl distorsionează), €/m² mediu, €/m² ajustat la structură, preț median, număr de anunțuri, anunțuri noi, indicele de preț al acelorași anunțuri.",
                    "<b>Defalcare</b>: câte o linie pe număr de camere, cartier, stare sau etaj.",
                    "<b>Camere</b>: de ex. doar apartamentele cu 2 camere – înlocuiește filtrul de camere din panou.",
                    "<b>Perioadă și rezoluție</b>: de la – până la lună, puncte lunare sau trimestriale."
                ] },
                { h: "De unde vin cifrele evoluției?", ul: [
                    "Pentru fiecare anunț știm când a apărut și când a ieșit de pe piață, și înregistrăm fiecare schimbare de preț.",
                    "O lună include anunțurile care au fost pe piață în acea lună – la prețul valabil la sfârșitul lunii.",
                    "€/m² <b>ajustat la structură</b> elimină efectul, de exemplu, al mai multor garsoniere într-o lună (care ar crește €/m² fără creștere de preț).",
                    "<b>Indicele acelorași anunțuri</b> măsoară doar schimbarea de preț a anunțurilor prezente în ambele perioade – cea mai curată schimbare de preț.",
                    "Unde sunt mai puțin de 5 anunțuri, punctul apare gol: tratează cifra cu prudență."
                ] },
                { h: "Compararea a două perioade", steps: [
                    "Jos pe fila „Evoluția prețurilor și comparație” setează perioada A și B (o lună sau un interval), de ex. aprilie și august.",
                    "Apasă Compară.",
                    "Sus schimbarea cifrelor principale, dedesubt pe camere, cartier, stare și etaj – și cât s-au schimbat prețurile acelorași anunțuri."
                ] },
                { tip: "Înregistrarea prețurilor a început cu această actualizare: pentru lunile anterioare se folosește prețul de la publicare; de acum schimbările de preț se văd exact." }
            ]
        },
        {
            id: "ertekbecslo", icon: "fa-solid fa-calculator", title: "Evaluare",
            sections: [
                { h: "Utilizare", steps: [
                    "Alege vânzare / închiriere, tipul, orașul și, dacă știi, cartierul.",
                    "Introdu suprafața (obligatoriu), camerele, etajul (și dacă știi, câte etaje are clădirea) și starea.",
                    "Dacă există un preț cerut, introdu-l – arătăm dacă e mare sau mic.",
                    "Apasă Estimare."
                ] },
                { h: "Cum se calculează?", ul: [
                    "<b>Anunțuri similare</b>: prețurile celor mai asemănătoare anunțuri sunt convertite la proprietatea ta (după diferența de suprafață, stare, cartier, etaj).",
                    "<b>Modelul raporturilor de preț</b>: din toate anunțurile orașului învățăm cu cât valorează mai mult un apartament în stare bună față de unul de renovat, unul de la parter față de celelalte, un cartier față de media orașului și cum scade €/m² cu suprafața. Unde datele sunt puține, ne sprijinim pe raporturi rezonabile de piață.",
                    "Cele două se combină: cu multe anunțuri foarte similare, acestea decid; cu puține (de ex. un număr rar de camere într-un cartier mic), modelul primește o pondere mai mare.",
                    "Sub rezultat vezi ambele estimări, ponderile lor și raporturile principale (de ex. Stare +14%)."
                ] },
                { h: "Încredere și interval", ul: [
                    "<b>Ridicată</b>: multe anunțuri foarte similare, și din cartier.",
                    "<b>Medie</b>: date suficiente, dar mai puțin similare – sau modelul a învățat din suficiente date.",
                    "<b>Scăzută</b>: puține anunțuri sau diferite – doar orientativ.",
                    "Intervalul arată dispersia tipică: aproximativ jumătate din proprietățile similare se încadrează în el."
                ] },
                { tip: "Estimarea se bazează pe prețuri cerute, nu pe prețuri reale de vânzare – acestea sunt de obicei cu câteva procente mai mici." }
            ]
        },
        {
            id: "kedvencek", icon: "fa-solid fa-star", title: "Favorite și căutări salvate",
            sections: [
                { h: "Favorite", ul: [
                    "Anunțurile marcate cu stea apar într-un tabel pe pagina Favorite.",
                    "Favoritele aparțin contului tău – le vezi pe orice dispozitiv."
                ] },
                { h: "Căutări salvate", ul: [
                    "„Salvează căutarea” jos în panoul de căutare.",
                    "Alerte: cel mult un e-mail pe zi despre rezultatele noi (se pot opri din Contul meu)."
                ] }
            ]
        },
        {
            id: "feladas", icon: "fa-solid fa-circle-plus", title: "Publicarea unui anunț",
            sections: [
                { h: "Două variante", ul: [
                    "<b>Citirea unui link</b>: dacă proprietatea e deja pe alt site, lipește linkul – completăm datele, fotografiile și, dacă se poate, locația.",
                    "<b>Completare manuală</b>: introduci totul și încarci fotografiile."
                ] },
                { h: "Pași", steps: [
                    "Autentifică-te, apoi „Publică anunț”.",
                    "Alege tranzacția și tipul – apar doar câmpurile care au sens.",
                    "Completează câmpurile obligatorii (marcajul roșu arată ce lipsește).",
                    "Marchează locația pe hartă (marcajul se poate trage). La locație exactă cartierul se completează din limitele cartierelor.",
                    "Încarcă fotografii (browserul le micșorează).",
                    "Salvează. Mai târziu le editezi sau ștergi la Contul meu → Anunțurile mele."
                ] },
                { tip: "Dacă prețul diferă mult de anunțurile similare, anunțul apare, dar administratorul verifică datele." }
            ]
        },
        {
            id: "keresek", icon: "fa-solid fa-bullhorn", title: "Caut (cereri de cumpărare)",
            sections: [
                { h: "Dacă vrei să cumperi / închiriezi", steps: [
                    "Pe pagina „Caut” publică o cerere: tip, oraș, cartiere, interval de preț și suprafață, descriere scurtă.",
                    "Vânzătorii și agențiile o văd și îți pot oferi o proprietate prin mesaj.",
                    "Citești răspunsurile la Contul meu → Mesaje."
                ] },
                { h: "Dacă vinzi", p: "Parcurge cererile cumpărătorilor și răspunde celor cărora li se potrivește proprietatea ta – poți atașa unul dintre anunțurile tale." }
            ]
        },
        {
            id: "fiok", icon: "fa-solid fa-circle-user", title: "Cont și mesaje",
            sections: [
                { h: "Contul meu", ul: [
                    "<b>Profil</b>: nume, telefon, alerte pe e-mail, parolă.",
                    "<b>Anunțurile mele</b>: editare, ștergere.",
                    "<b>Căutări salvate</b>, <b>cererile mele</b>, <b>mesaje</b>."
                ] },
                { h: "Mesaje", p: "Un număr roșu pe iconița contului arată mesajele necitite. Mesajele țin de un anunț sau de o cerere, așa că se vede mereu despre ce sunt." }
            ]
        },
        {
            id: "iroda", icon: "fa-solid fa-briefcase", title: "Pentru agenții imobiliare",
            sections: [
                { h: "Lista agențiilor", p: "Pagina <a href=\"#irodak\">Agenții</a> din antet arată toate agențiile verificate. Cauți după nume și oraș; cu un clic pe o agenție se deschide profilul ei: site, date de contact, agenți și anunțurile active ale agenției." },
                { h: "Înregistrarea unei agenții (cu verificare)", steps: [
                    "Pagina Agenții → Înregistrează agenția (sau din meniu: Gestionarea agenției mele → Agenție nouă).",
                    "Introdu codul fiscal (CUI) al firmei. Site-ul preia din baza de date publică a ANAF denumirea oficială, numărul de înregistrare la Registrul Comerțului și sediul. Firmele inexistente, inactive sau radiate nu pot fi înregistrate.",
                    "Completează restul: nume afișat, telefon, e-mail, site, logo.",
                    "După aprobarea administratorului, agenția apare în lista agențiilor și pe anunțuri. Până atunci poți gestiona deja anunțurile, dar numele agenției apare pentru ceilalți doar după aprobare."
                ] },
                { tip: "Dacă se schimbă numele sau codul fiscal al agenției, trebuie aprobată din nou – astfel o agenție aprobată nu poate fi redenumită ulterior într-una inventată." },
                { h: "Colegi și agenți", ul: [
                    "Inviți un coleg prin e-mail; el trebuie să accepte invitația (un număr roșu în meniu o semnalează). Până nu acceptă, nu are acces la agenție.",
                    "Agenții pot fi adăugați și fără cont (nume, telefon, e-mail): apar ca persoane de contact pe anunțuri."
                ] },
                { h: "Gestionarea anunțurilor", ul: [
                    "La publicare alegi să publici în numele agenției și ce agent răspunde.",
                    "Număr de referință propriu, dosar / etichetă și notă internă (o vede doar agenția).",
                    "Operații în masă: atribuire agent, mutare în dosar, arhivare, marcare ca vândut."
                ] }
            ]
        },
        {
            id: "jo-tudni", icon: "fa-solid fa-lightbulb", title: "Bine de știut",
            sections: [
                { h: "Întrebări frecvente", ul: [
                    "<b>De ce lipsește un anunț?</b> Poate e ascuns ca duplicat, așteaptă verificare sau nu mai e disponibil pe site-ul sursă.",
                    "<b>Ce înseamnă asteriscul (*) după stare?</b> Starea a fost estimată din textul anunțului, nu dată de agentul de publicitate.",
                    "<b>De ce nu intră un anunț în statistică?</b> Datele lui lipsesc sau sunt suspecte (de ex. €/m² nerealist) până le verifică administratorul.",
                    "<b>Cât de proaspete sunt datele?</b> Site-urile urmărite sunt verificate regulat; anunțurile care nu mai sunt disponibile sunt scoase."
                ] }
            ]
        },
        {
            id: "admin", icon: "fa-solid fa-user-shield", title: "Pentru administrator", admin: true,
            sections: [
                { h: "De verificat", p: "Anunțurile cu date lipsă sau suspecte. Le parcurgi rapid cu tastatura; verificarea AI (dacă e activă) propune corecturi." },
                { h: "Setarea stării", ul: [
                    "Anunțurile fără stare (sau doar estimată, cu *) unul după altul, cu fotografii mari.",
                    "Tastele <b>1–9</b> = starea (în ordinea listei de stări), apoi vine următorul. <b>←/→</b> fotografiile, <b>S</b> sari peste, <b>Z</b> anulare, <b>Enter</b> = acceptă sugestia din text.",
                    "<b>Vizualizare grilă</b>: multe anunțuri odată; le selectezi și setezi aceeași stare pentru toate cu un clic.",
                    "Și în tabelul anunțurilor: selectează rândurile și setează starea din bara de sus."
                ] },
                { h: "Import, site-uri urmărite, duplicate", ul: [
                    "Import: linkul unui anunț sau al unei pagini întregi de rezultate.",
                    "Site-uri urmărite: reverificate periodic, anunțurile noi se adaugă automat.",
                    "<b>Verificarea anunțurilor existente</b>: verifică pe site-ul sursă doar anunțurile deja existente (preț, disponibilitate, date lipsă) – nu importă anunțuri noi.",
                    "Duplicate: aceeași proprietate pe mai multe site-uri – le unești sau marchezi că nu sunt la fel."
                ] },
                { h: "Stări", ul: [
                    "Admin → Stări: lista stărilor poate fi extinsă fără cod (de ex. construcție nouă, nefinalizat).",
                    "Fiecare stare are nume în maghiară, română și engleză, culoare, nivel (ordine și comparație), multiplicator de preț (pentru evaluare) și cuvinte cheie – după acestea este recunoscută în textul anunțului.",
                    "Stările predefinite pot fi dezactivate, cele proprii șterse (anunțurile lor pot fi mutate la altă stare).",
                    "<b>Testarea detectării</b> arată ce stare recunoaște dintr-un text; <b>Completare din descrieri</b> completează starea anunțurilor care nu au (marcate ca nesigure, cu *, ca să le poți verifica)."
                ] },
                { h: "Agenții imobiliare", ul: [
                    "Admin → Agenții imobiliare: agențiile noi și cele modificate așteaptă aprobarea (apar și ca sarcină în Prezentare).",
                    "Vezi datele ANAF (denumire oficială, sediu, activitate principală, activă sau nu) și le poți interoga din nou.",
                    "Aprobare, respingere (cu motiv) sau suspendare – managerul agenției vede decizia și motivul."
                ] },
                { h: "Datele site-ului", ul: [
                    "Admin → Datele site-ului: datele operatorului (nume / denumire, cod fiscal, adresă, e-mail de contact, telefon).",
                    "Apar automat în Datele de identificare, Termeni și condiții, Politica de confidențialitate și Politica de cookie-uri.",
                    "Pentru o firmă, datele ANAF se completează din codul fiscal cu un clic. Dacă e-mailul de contact este gol, apare adresa de e-mail a administratorului."
                ] },
                { h: "Orașe, cartiere, limite", ul: [
                    "Cartierele au nume maghiar și românesc, plus nume folosite pe alte site-uri (aliasuri).",
                    "Desenarea limitei: clic pe hartă, punctele se pot trage; se lipesc de punctele cartierului vecin.",
                    "Butonul <b>Verificare</b>: listează anunțurile cu locație exactă al căror cartier diferă de hartă sau care sunt în afara oricărei limite.",
                    "<b>Reîmpărțire</b>: aliniază cartierele la limite (rulează automat și la pornire și la salvare)."
                ] },
                { h: "Capturi de piață și evaluare", ul: [
                    "Lunar se salvează automat o captură a pieței; manual pe fila Istoric.",
                    "Prezentare → „Precizia evaluării”: măsoară eroarea pe datele reale (fiecare anunț estimat din celelalte), metoda veche vs. nouă."
                ] }
            ]
        },
        {
            id: "jogi", icon: "fa-solid fa-scale-balanced", title: "Confidențialitate și juridic",
            sections: [
                { h: "Documente", ul: [
                    "<a href=\"#jogi/aszf\">Termeni de utilizare</a>",
                    "<a href=\"#jogi/adatvedelem\">Politica de confidențialitate</a>",
                    "<a href=\"#jogi/sutik\">Cookie-uri</a>",
                    "<a href=\"#jogi/impresszum\">Date de identificare</a>",
                    "<a href=\"#jogi/bejelentes\">Raportare conținut</a>"
                ] }
            ]
        }
    ]

};
