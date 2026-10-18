// ============================================================
//  Szövegek (18. változat): kiemelt hirdetés az irodaprofilon
//  (csomag joga), e-mail csak a befizetés után, logó, türelmi idő
// ============================================================

(() => {

    const V18 = {
        hu: {
            prAfterPay: "Amíg nem fizetsz, nem küldünk semmit. Amikor a befizetés beérkezik, a csomag magától bekapcsol, és e-mailben megkapod a számlát.",

            finRightProfileFeat: "{n} kiemelt hirdetés az irodaprofilon",
            finRightProfileFeatLabel: "Kiemelt hirdetés a profilon (db)",
            finRightProfileFeatHint: "Az iroda ennyi hirdetését teheti ki nagyon feltűnően az irodaprofilja tetejére – azt, hogy melyiket, ő választja ki (Irodám → Hirdetések). Csak irodáknak szóló csomagnál van értelme.",

            agFeatTitle: "Kiemelt hirdetés a profilon",
            agFeatSub: "A csomagod szerint {n} hirdetést tehetsz az irodaprofil tetejére, nagy, feltűnő kártyán.",
            agFeatPick: "Kiemelt hirdetés kiválasztása",
            agFeatChange: "Módosítás",
            agFeatPreview: "Megnézem a profilon",
            agFeatNone: "Még nem választottál – válaszd ki, melyik hirdetés legyen kiemelve.",
            agFeatNoneMember: "Még nincs kiválasztva (az iroda vezetője választja ki).",
            agFeatExpired: "A csomagod már nem ad kiemelést a profilon – a választásod megmaradt, újra előfizetve magától visszajön.",
            agFeatPickTitle: "Melyik hirdetés legyen kiemelve?",
            agFeatPickHelp: "Legfeljebb {n} aktív hirdetést választhatsz. Az irodaprofilod tetején jelenik meg, nagy képpel – bármikor átállíthatod.",
            agFeatCount: "{n} / {keret} kiválasztva",
            agFeatClear: "Kiemelés levétele",
            agFeatSaved: "A kiemelt hirdetés beállítva.",
            agFeatCleared: "A kiemelés levéve.",
            agFeatNoActive: "Nincs aktív hirdetésetek.",
            agFeatBadge: "Kiemelt ajánlat",
            agFeatHead: "Kiemelt ajánlatunk",
            agFeatHeadMany: "Kiemelt ajánlataink",
            agFeatOpen: "Megnézem",

            agErr_no_profile_feature: "A csomagod nem ad kiemelést a profilon.",
            agErr_too_many_selected: "Több hirdetést jelöltél ki, mint amennyit a csomagod enged.",
            agErr_listing_not_found: "A hirdetés nem található, vagy nem aktív.",
            agErr_forbidden: "Ezt csak az iroda vezetője állíthatja.",
            prPayInfo: "A megrendelés után kifizeted (kártyával azonnal). A csomag a befizetéskor bekapcsol, a számlát PDF-ben e-mailben küldjük.",

            wsLogoTitle: "Logó",
            wsLogoHelp: "A számlák fejlécében (PDF és nyomtatható) és a számlát kísérő e-mailben jelenik meg. PNG, JPG vagy WebP, legfeljebb 4 MB – átlátszó hátterű PNG a legszebb.",
            wsLogoNone: "Nincs logó – a cég neve áll a helyén.",
            wsLogoUpload: "Logó feltöltése",
            wsLogoDelete: "Törlés",
            wsLogoDeleteConfirm: "Törlöd a logót? A számlákon a cég neve áll majd a helyén.",
            wsLogoSaved: "A logó elmentve.",
            wsLogoTooBig: "A kép túl nagy (legfeljebb 4 MB).",
            wsLogoBad: "Ezt a képet nem sikerült beolvasni (PNG, JPG vagy WebP kell).",

            abGraceTitle: "A csomagod lejárt – a hirdetéseid még fent vannak",
            abGraceText: "{vege}-ig mind a(z) {db} hirdetésed fent marad, de újat nem tölthetsz fel. Ha addig nem újítod meg, utána csak a {keret} legújabb marad fent, a többi archívumba kerül (újra előfizetve visszajönnek).",
            abGraceRenew: "Megújítás",

            finExpiryGrace: "Türelmi idő lejárt csomag után (nap)",
            finExpiryWarn: "Emlékeztető a vége előtt (nap)",
            finExpiryHelp: "Ha valakinek lejár a csomagja, a hirdetései ennyi napig fent maradnak (új hirdetést nem tölthet fel), és e-mailt kap. A vége előtt emlékeztetőt kap, utána a csomag nélküli keret feletti hirdetései archiválódnak (a legújabbak maradnak; újra előfizetve maguktól visszajönnek). 0 = azonnal archivál. Csak bekapcsolt korlátoknál működik.",

            ordGraceTitle: "Lejárt csomag – türelmi idő",
            ordGraceNote: "Akiknek lejárt a csomagja, és több hirdetésük van fent, mint a csomag nélküli keret. A türelmi idő végén a keret feletti hirdetések archiválódnak (Pénzügy → Beállítások → Korlátok).",
            ordGraceListings: "Hirdetés / keret",
            ordGracePeriod: "Türelmi idő",
            ordGraceOpen: "Folyamatban",
            ordGraceWarned: "Emlékeztető elküldve",
            ordGrace_rendezve: "Rendezve",
            ordGrace_archivalva: "Archiválva"
        },
        ro: {
            prAfterPay: "Până nu plătești, nu îți trimitem nimic. Când plata ajunge, pachetul se activează automat și primești factura pe e-mail.",

            finRightProfileFeat: "{n} anunț(uri) promovat(e) pe profilul agenției",
            finRightProfileFeatLabel: "Anunț promovat pe profil (buc.)",
            finRightProfileFeatHint: "Agenția poate afișa atâtea anunțuri, foarte vizibil, în partea de sus a profilului – alege singură care (Agenția mea → Anunțuri). Are sens doar la pachetele pentru agenții.",

            agFeatTitle: "Anunț promovat pe profil",
            agFeatSub: "Pachetul tău îți permite {n} anunț(uri) în partea de sus a profilului agenției, pe un card mare.",
            agFeatPick: "Alege anunțul promovat",
            agFeatChange: "Modifică",
            agFeatPreview: "Vezi pe profil",
            agFeatNone: "Încă nu ai ales – alege ce anunț să fie promovat.",
            agFeatNoneMember: "Încă nu e ales (îl alege managerul agenției).",
            agFeatExpired: "Pachetul tău nu mai include promovarea pe profil – alegerea rămâne salvată și revine la reabonare.",
            agFeatPickTitle: "Ce anunț să fie promovat?",
            agFeatPickHelp: "Poți alege cel mult {n} anunț(uri) active. Apare în partea de sus a profilului, cu imagine mare – îl poți schimba oricând.",
            agFeatCount: "{n} / {keret} selectate",
            agFeatClear: "Scoate promovarea",
            agFeatSaved: "Anunțul promovat a fost setat.",
            agFeatCleared: "Promovarea a fost scoasă.",
            agFeatNoActive: "Nu aveți anunțuri active.",
            agFeatBadge: "Ofertă recomandată",
            agFeatHead: "Oferta noastră recomandată",
            agFeatHeadMany: "Ofertele noastre recomandate",
            agFeatOpen: "Vezi",

            agErr_no_profile_feature: "Pachetul tău nu include promovarea pe profil.",
            agErr_too_many_selected: "Ai selectat mai multe anunțuri decât permite pachetul.",
            agErr_listing_not_found: "Anunțul nu există sau nu este activ.",
            agErr_forbidden: "Doar managerul agenției poate modifica acest lucru.",
            prPayInfo: "După comandă plătești (cu cardul, imediat). Pachetul se activează la plată, iar factura îți este trimisă pe e-mail în format PDF.",

            wsLogoTitle: "Logo",
            wsLogoHelp: "Apare în antetul facturilor (PDF și tipărite) și în e-mailul care însoțește factura. PNG, JPG sau WebP, max. 4 MB.",
            wsLogoNone: "Fără logo – apare numele firmei.",
            wsLogoUpload: "Încarcă logo",
            wsLogoDelete: "Șterge",
            wsLogoDeleteConfirm: "Ștergi logo-ul?",
            wsLogoSaved: "Logo salvat.",
            wsLogoTooBig: "Imaginea este prea mare (max. 4 MB).",
            wsLogoBad: "Imaginea nu a putut fi citită (PNG, JPG sau WebP).",

            abGraceTitle: "Pachetul a expirat – anunțurile sunt încă online",
            abGraceText: "Până la {vege} toate cele {db} anunțuri rămân online, dar nu poți adăuga anunțuri noi. Dacă nu reînnoiești, rămân online doar cele mai noi {keret}, restul se arhivează (revin la reabonare).",
            abGraceRenew: "Reînnoiește",

            finExpiryGrace: "Perioadă de grație după expirare (zile)",
            finExpiryWarn: "Reamintire înainte de final (zile)",
            finExpiryHelp: "Când un pachet expiră, anunțurile rămân online atâtea zile (fără anunțuri noi). La final, anunțurile peste limita gratuită se arhivează (revin la reabonare). 0 = arhivare imediată.",

            ordGraceTitle: "Pachete expirate – perioadă de grație",
            ordGraceNote: "Utilizatori cu pachet expirat și mai multe anunțuri decât limita gratuită.",
            ordGraceListings: "Anunțuri / limită",
            ordGracePeriod: "Perioadă de grație",
            ordGraceOpen: "În curs",
            ordGraceWarned: "Reamintire trimisă",
            ordGrace_rendezve: "Rezolvat",
            ordGrace_archivalva: "Arhivat"
        },
        en: {
            prAfterPay: "Until you pay, we send nothing. When the payment arrives, the package switches on automatically and you get the invoice by e-mail.",

            finRightProfileFeat: "{n} featured listing(s) on the agency profile",
            finRightProfileFeatLabel: "Featured on profile (count)",
            finRightProfileFeatHint: "The agency can show this many listings very prominently at the top of its profile – it chooses which ones itself (My agency → Listings). Only makes sense for agency packages.",

            agFeatTitle: "Featured listing on your profile",
            agFeatSub: "Your package lets you put {n} listing(s) at the top of your agency profile, on a large card.",
            agFeatPick: "Choose featured listing",
            agFeatChange: "Change",
            agFeatPreview: "View on profile",
            agFeatNone: "Nothing chosen yet – pick which listing to feature.",
            agFeatNoneMember: "Not chosen yet (the agency manager chooses it).",
            agFeatExpired: "Your package no longer includes profile featuring – your choice is kept and comes back when you subscribe again.",
            agFeatPickTitle: "Which listing should be featured?",
            agFeatPickHelp: "You can choose up to {n} active listing(s). It appears at the top of your agency profile with a large photo – change it any time.",
            agFeatCount: "{n} / {keret} selected",
            agFeatClear: "Remove featuring",
            agFeatSaved: "Featured listing set.",
            agFeatCleared: "Featuring removed.",
            agFeatNoActive: "You have no active listings.",
            agFeatBadge: "Featured offer",
            agFeatHead: "Our featured offer",
            agFeatHeadMany: "Our featured offers",
            agFeatOpen: "View",

            agErr_no_profile_feature: "Your package does not include profile featuring.",
            agErr_too_many_selected: "You selected more listings than your package allows.",
            agErr_listing_not_found: "The listing was not found or is not active.",
            agErr_forbidden: "Only the agency manager can change this.",
            prPayInfo: "After ordering you pay (by card, instantly). The package switches on when paid and the invoice is e-mailed to you as a PDF.",

            wsLogoTitle: "Logo",
            wsLogoHelp: "Shown in the header of invoices (PDF and printable) and in the e-mail sent with the invoice. PNG, JPG or WebP, max 4 MB.",
            wsLogoNone: "No logo – the company name is shown instead.",
            wsLogoUpload: "Upload logo",
            wsLogoDelete: "Delete",
            wsLogoDeleteConfirm: "Delete the logo?",
            wsLogoSaved: "Logo saved.",
            wsLogoTooBig: "The image is too large (max 4 MB).",
            wsLogoBad: "Could not read the image (PNG, JPG or WebP needed).",

            abGraceTitle: "Your package expired – your listings are still online",
            abGraceText: "Until {vege} all {db} listings stay online, but you cannot add new ones. If you don't renew, only the newest {keret} stay online and the rest are archived (they come back when you subscribe again).",
            abGraceRenew: "Renew",

            finExpiryGrace: "Grace period after expiry (days)",
            finExpiryWarn: "Reminder before the end (days)",
            finExpiryHelp: "When a package expires, listings stay online this many days (no new uploads). At the end, listings above the free limit are archived (they return on resubscribing). 0 = archive immediately. Works only with limits switched on.",

            ordGraceTitle: "Expired packages – grace period",
            ordGraceNote: "Users whose package expired and who have more listings than the free limit.",
            ordGraceListings: "Listings / limit",
            ordGracePeriod: "Grace period",
            ordGraceOpen: "In progress",
            ordGraceWarned: "Reminder sent",
            ordGrace_rendezve: "Resolved",
            ordGrace_archivalva: "Archived"
        }
    };

    Object.keys(V18).forEach(nyelv => {
        I18N_STRINGS[nyelv] = Object.assign(I18N_STRINGS[nyelv] || {}, V18[nyelv]);
    });

})();
