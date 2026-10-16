// ============================================================
//  Súgó – 8. változat: menü, Csomagok és árak, Eladjuk helyetted,
//  admin: Rendelések, Megbízások, duplikátum (saját feltöltés)
//  A helpContent.js után töltődik, és kiegészíti a HELP_CONTENT-et.
// ============================================================

(() => {

    const UJ = {
        hu: {
            menu: "A fejlécben három csoport van: <b>Keresés</b> (Ingatlanok, Térkép, Kedvencek, Keresek), <b>Piac</b> (Piaci elemzés, Értékbecslő) és <b>Szolgáltatások</b> (Eladjuk helyetted, Csomagok és árak, Ingatlanirodák). A csoport mellett látszik, melyik oldalon vagy. A kezdőlapra az IngatlanPro logó visz. Telefonon és tableten ugyanez egy lenyíló menüben van.",
            temak: [
                { id: "csomagok", icon: "fa-solid fa-tags", title: "Csomagok és árak", sections: [
                    { h: "Mit kapok ingyen?", p: "Keresés, térkép, piaci elemzés, értékbecslő, üzenetek – és néhány aktív hirdetés. A csomagok extrát adnak: több hirdetést, kiemelést, reklámmentes oldalt, részletes statisztikát, irodáknak irodacsomagot." },
                    { h: "Rendelés", steps: [
                        "Szolgáltatások → Csomagok és árak: válaszd a Magánszemélyeknek vagy az Ingatlanirodáknak nézetet.",
                        "Megrendelem → add meg a számlázási adataidat (cégnél az adószámmal az ANAF-ból kitölthető).",
                        "Díjbekérőt kapsz (e-mailben és a Fiókom → Csomagom és számláim részen) az átutalási adatokkal.",
                        "A befizetés beérkezésekor a csomag magától bekapcsol."
                    ] },
                    { h: "Lemondás", p: "A Fiókom → Csomagom és számláim részen bármikor lemondhatod: a kifizetett időszak végéig él, új díjbekérő nem készül. A még nem fizetett rendelést vissza is vonhatod." },
                    { h: "Irodáknak", p: "Irodacsomagot az iroda vezetője rendelhet, az iroda nevére (a számlán az iroda adataival)." }
                ] },
                { id: "eladjuk", icon: "fa-solid fa-key", title: "Eladjuk helyetted", sections: [
                    { h: "Mi ez?", p: "Ha nincs időd eladni (vagy kiadni) az ingatlanodat, megbízhatsz minket: lefotózzuk, meghirdetjük, kezeljük az érdeklődőket, megtekintéseket, ajánlatokat, és végigvisszük a közjegyzőig. Csak sikerdíjat fizetsz, az eladáskor." },
                    { h: "Hogyan indul?", steps: [
                        "Szolgáltatások → Eladjuk helyetted: válaszd ki a szolgáltatásokat, add meg az alapadatokat és az elérhetőséged.",
                        "Felhívunk, megbeszéljük az árat és a részleteket; a csomag-ajánlatot e-mailben kapod, és egy kattintással jóváhagyod.",
                        "A megbízási szerződést online írod alá (e-mailben kapott kóddal), vagy személyesen.",
                        "Fotózunk, elkészítjük a hirdetést; az előnézetet te hagyod jóvá, utána nyilvános.",
                        "Az Ingatlanom eladása oldalon (a fejlécben) mindent látsz: mi vár rád, a megtekintéseket, a neked továbbított ajánlatokat (elfogadhatod, elutasíthatod, ellenajánlatot tehetsz), az iratokat és az üzeneteket."
                    ] },
                    { h: "Vevőként", p: "Egy megbízásos hirdetésen a naptárból magad foglalsz időpontot a megtekintésre (ha egyik sem jó, várólistára jelentkezhetsz). A megtekintés után vételi ajánlatot tehetsz – a finanszírozással (készpénz / hitel), foglalóval és határidőkkel együtt; mi továbbítjuk az eladónak." }
                ] }
            ],
            admin: [
                { h: "Pénzügyek → Rendelések", p: "A Csomagok és árak oldalról érkező rendelések: ki, mit, mennyiért; csomagonként hányan vették meg (magánszemély / iroda), mennyi folyt be, ki fizetett. A „Fizetve” gomb kifizetettnek jelöli a díjbekérőt – a csomag ekkor bekapcsol, a vevő e-mailt kap. A csomagok szövegeit, célcsoportját, „Legnépszerűbb” jelölését a Díjcsomagok, árak részen állítod." },
                { h: "Értékesítés → Megbízások", p: "Fent a „Ma teendő” lista, alatta a megbízások 7 szakaszban (Igénylés → Adásvétel). A megbízás magától lép tovább, ha a feltétel teljesül; mindegyiknél látszik a következő lépés és egy gomb hozzá. Egy megbízás fülei: Vevők és ajánlatok, Megtekintések, Szerződés és iratok, Csomag és hirdetés, Üzenetek. A díjakat, az ajánlatok szabályait, az alap naptárt és az automatizmusokat a Megbízás beállításai részen állítod." },
                { h: "Értékesítés → Megtekintési naptár", p: "Heti nézet az összes ingatlan megtekintéseiről: szabad, foglalt, lezárandó, lezárt. Egy elemre kattintva lezárhatod (megtörtént / elmaradt), áthelyezheted, lemondhatod; a várólistásoknak időpontot adhatsz." },
                { h: "Csapat és jogosultságok", p: "A munkatárs ugyanazt az admin felületet látja, de csak azokat a menüpontokat, amelyekre jogot adtál – és ott ugyanazt tudja, mint te. Az értékesítési jogok egy városra, megbízásra vagy hirdetésre is szűkíthetők." },
                { h: "Duplikátumok – saját feltöltés", p: "Ha egy felhasználó feltölt egy ingatlant, ami más oldalon is fent van, ugyanúgy összevonhatod: az ő hirdetése marad (adatai, elérhetősége, üzenetei), a másik oldal linkje „Hol van meghirdetve?” alatt jelenik meg. Két különböző felhasználó hirdetése nem vonható össze." }
            ]
        },
        en: {
            menu: "The header has three groups: <b>Search</b> (Properties, Map, Favourites, Wanted), <b>Market</b> (Market analysis, Valuation) and <b>Services</b> (We sell it for you, Packages and prices, Agencies). The current page is shown next to its group. The IngatlanPro logo takes you home. On phones and tablets the same is in one drop-down menu.",
            temak: [
                { id: "csomagok", icon: "fa-solid fa-tags", title: "Packages and prices", sections: [
                    { h: "What's free?", p: "Search, map, market analysis, valuation, messages – and a few active listings. Packages add extras: more listings, featuring, ad-free browsing, detailed statistics, agency packages." },
                    { h: "Ordering", steps: [
                        "Services → Packages and prices: choose For private sellers or For agencies.",
                        "Order → give your billing details (companies: filled from ANAF by tax ID).",
                        "You get a proforma (by e-mail and in My account → My plan & invoices) with the bank details.",
                        "When the payment arrives, the package switches on automatically."
                    ] },
                    { h: "Cancelling", p: "In My account → My plan & invoices you can cancel any time: it stays active until the end of the paid period. Unpaid orders can be withdrawn." },
                    { h: "For agencies", p: "Agency packages are ordered by the agency's manager, in the agency's name." }
                ] },
                { id: "eladjuk", icon: "fa-solid fa-key", title: "We sell it for you", sections: [
                    { h: "What is it?", p: "If you have no time to sell (or rent out) your property, give us the mandate: we take photos, publish it, handle buyers, viewings and offers up to the notary. You only pay a success fee when it sells." },
                    { h: "How does it start?", steps: [
                        "Services → We sell it for you: choose the services, give the basics and your contact.",
                        "We call you, agree on the price and details, and sign a mandate contract.",
                        "We take photos and publish the listing (marked \"Sold by IngatlanPro\").",
                        "You approve the package by email, sign the mandate online (with an emailed code) or in person, and approve the listing preview before it goes live.",
                        "On the Selling my property page (in the header) you see everything: what's waiting for you, viewings, offers, documents and messages."
                    ] },
                    { h: "As a buyer", p: "On a mandate listing you book a viewing time yourself from the calendar (or join the waiting list). After the viewing you can make an offer – with financing, deposit and deadlines – and we pass it to the seller." }
                ] }
            ],
            admin: [
                { h: "Finance → Orders", p: "Orders from the Packages page: who bought what, sales per package (private / agency), revenue, who paid. \"Paid\" marks the proforma as paid – the package switches on and the customer gets an e-mail." },
                { h: "Sales → Mandates", p: "\"We sell it for you\" requests in status columns, each with its own sales workspace: property, services, listing, interested buyers, viewings, offers (send to seller), timeline, contract draft and a proforma for the fee." },
                { h: "Duplicates – own uploads", p: "If a user uploads a property that's also on another site, merging keeps the user's listing (data, contact, messages) and adds the other site as a link." }
            ]
        },
        ro: {
            menu: "Antetul are trei grupuri: <b>Căutare</b> (Imobile, Hartă, Favorite, Caut), <b>Piață</b> (Analiză de piață, Evaluare) și <b>Servicii</b> (Vindem noi pentru tine, Pachete și prețuri, Agenții). Pagina curentă apare lângă grup. Logo-ul IngatlanPro duce la pagina principală. Pe telefon și tabletă totul este într-un meniu derulant.",
            temak: [
                { id: "csomagok", icon: "fa-solid fa-tags", title: "Pachete și prețuri", sections: [
                    { h: "Ce e gratuit?", p: "Căutare, hartă, analiză de piață, evaluare, mesaje – și câteva anunțuri active. Pachetele oferă extra: mai multe anunțuri, promovare, fără reclame, statistici detaliate, pachete pentru agenții." },
                    { h: "Comanda", steps: [
                        "Servicii → Pachete și prețuri: alege Pentru persoane fizice sau Pentru agenții.",
                        "Comandă → introdu datele de facturare (firmele: completare din ANAF după CUI).",
                        "Primești o proformă (pe e-mail și în Contul meu → Pachetul și facturile mele) cu datele bancare.",
                        "La primirea plății pachetul se activează automat."
                    ] },
                    { h: "Anulare", p: "În Contul meu → Pachetul și facturile mele poți anula oricând: rămâne activ până la sfârșitul perioadei plătite." }
                ] },
                { id: "eladjuk", icon: "fa-solid fa-key", title: "Vindem noi pentru tine", sections: [
                    { h: "Ce este?", p: "Dacă nu ai timp să vinzi (sau să închiriezi), ne dai mandatul: fotografiem, publicăm, gestionăm cumpărătorii, vizionările și ofertele până la notar. Plătești doar comision de succes la vânzare." },
                    { h: "Cum începe?", steps: [
                        "Servicii → Vindem noi pentru tine: alegi serviciile și dai datele de bază.",
                        "Te sunăm, stabilim prețul și semnăm contractul de intermediere.",
                        "Fotografiem și publicăm anunțul („Vândut prin IngatlanPro”).",
                        "Aprobi pachetul pe e-mail, semnezi contractul online (cu cod primit pe e-mail) sau în persoană și aprobi previzualizarea anunțului.",
                        "Pe pagina Vânzarea proprietății mele (în antet) vezi tot: ce te așteaptă, vizionări, oferte, acte și mesaje."
                    ] }
                ] }
            ],
            admin: [
                { h: "Finanțe → Comenzi", p: "Comenzile de pe pagina Pachete: cine ce a cumpărat, vânzări pe pachet, încasări. „Achitat” activează pachetul." },
                { h: "Vânzări → Mandate", p: "Cererile „Vindem noi pentru tine” pe stări, fiecare cu zona proprie de vânzare: proprietate, anunț, interesați, vizionări, oferte, istoric, contract, proformă." }
            ]
        }
    };

    if (typeof HELP_CONTENT === "undefined") return;

    Object.entries(UJ).forEach(([ny, u]) => {
        const lista = HELP_CONTENT[ny];
        if (!Array.isArray(lista)) return;
        // A „Menü” bekezdés az első lépésekben
        const kezd = lista.find(t => t.id === "kezdes");
        if (kezd) {
            const menu = (kezd.sections || []).find(s => /menü|menu|meniu/i.test(s.h || ""));
            if (menu) menu.p = u.menu;
        }
        // Új témák a „Jó tudni” elé
        const hely = lista.findIndex(t => t.id === "jo-tudni");
        u.temak.forEach((t, i) => {
            if (lista.some(x => x.id === t.id)) return;
            lista.splice(hely >= 0 ? hely + i : lista.length, 0, t);
        });
        const admin = lista.find(t => t.id === "admin");
        if (admin) admin.sections = [...(admin.sections || []), ...u.admin];
    });

})();
