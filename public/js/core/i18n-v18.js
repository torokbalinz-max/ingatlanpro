// ============================================================
//  Szövegek (18. változat): kiemelt hirdetés az irodaprofilon
//  (csomag joga), e-mail csak a befizetés után
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
            agErr_forbidden: "Ezt csak az iroda vezetője állíthatja."
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
            agErr_forbidden: "Doar managerul agenției poate modifica acest lucru."
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
            agErr_forbidden: "Only the agency manager can change this."
        }
    };

    Object.keys(V18).forEach(nyelv => {
        I18N_STRINGS[nyelv] = Object.assign(I18N_STRINGS[nyelv] || {}, V18[nyelv]);
    });

})();
