// ============================================================
//  Szövegek (14. változat): prémium megjelenés, lábléc, új súgó
// ============================================================

(() => {

    const V14 = {
        hu: {
            ftFind: "Keresés",
            ftMarket: "Piac",
            ftSell: "Eladóknak",
            ftPost: "Hirdetés feladása",
            ftHelp: "Segítség",
            dbNewWeek: "Új az elmúlt 7 napban",
            helpPrev: "Előző",
            helpNext: "Következő",
            helpAllTopics: "Minden téma egy helyen",
            helpZoom: "Kép nagyítása"
        },
        ro: {
            ftFind: "Căutare",
            ftMarket: "Piață",
            ftSell: "Pentru vânzători",
            ftPost: "Publică un anunț",
            ftHelp: "Ajutor",
            dbNewWeek: "Noi în ultimele 7 zile",
            helpPrev: "Anterior",
            helpNext: "Următor",
            helpAllTopics: "Toate temele într-un loc",
            helpZoom: "Mărește imaginea"
        },
        en: {
            ftFind: "Search",
            ftMarket: "Market",
            ftSell: "For sellers",
            ftPost: "Post a listing",
            ftHelp: "Help",
            dbNewWeek: "New in the last 7 days",
            helpPrev: "Previous",
            helpNext: "Next",
            helpAllTopics: "All topics at a glance",
            helpZoom: "Enlarge image"
        }
    };

    Object.keys(V14).forEach(nyelv => {
        I18N_STRINGS[nyelv] = Object.assign(I18N_STRINGS[nyelv] || {}, V14[nyelv]);
    });

})();
