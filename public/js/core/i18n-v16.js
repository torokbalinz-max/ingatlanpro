// ============================================================
//  Szövegek (16. változat): a városon belüli részek neve
//  városonként választható – kerület / negyed / városrész
//  (románul cartier / cartier / zonă). Ugyanazt jelenti,
//  csak más a neve. Lásd CityManager.reszT().
// ============================================================

(() => {

    const V16 = {
        hu: {
            resz_kerulet_label: "Kerület",
            resz_kerulet_plural: "Kerületek",
            resz_kerulet_choose: "— válassz kerületet —",
            resz_kerulet_medOld: "Kerületi medián (újépítésűek nélkül)",
            resz_kerulet_medNew: "Kerületi medián (újépítésűek)",
            resz_kerulet_m4: "A kerületed árszintje ezekhez képest",

            resz_negyed_label: "Negyed",
            resz_negyed_plural: "Negyedek",
            resz_negyed_choose: "— válassz negyedet —",
            resz_negyed_medOld: "A negyed mediánja (újépítésűek nélkül)",
            resz_negyed_medNew: "A negyed mediánja (újépítésűek)",
            resz_negyed_m4: "A negyeded árszintje ezekhez képest",

            resz_varosresz_label: "Városrész",
            resz_varosresz_plural: "Városrészek",
            resz_varosresz_choose: "— válassz városrészt —",
            resz_varosresz_medOld: "A városrész mediánja (újépítésűek nélkül)",
            resz_varosresz_medNew: "A városrész mediánja (újépítésűek)",
            resz_varosresz_m4: "A városrészed árszintje ezekhez képest",

            placesReszLabel: "Hogyan hívjuk a városon belüli részeket?",
            placesReszDefault: "Alap (Kerület / városrész)",
            placesResz_kerulet: "Kerület (románul: cartier)",
            placesResz_negyed: "Negyed (románul: cartier)",
            placesResz_varosresz: "Városrész (románul: zonă)",
            maxTavLabel: "Legfeljebb ennyire a várostól",
            maxTavHint: "(légvonalban)",
            maxTavChip: "Legfeljebb {km} km a várostól",

            placesReszHelp: "Csak a megnevezés változik, a működés ugyanaz. Ez a név látszik a keresőben, a hirdetésfeladásnál, az értékbecslőben és a táblázatban."
        },
        en: {
            resz_kerulet_label: "District",
            resz_kerulet_plural: "Districts",
            resz_kerulet_choose: "— choose a district —",
            resz_kerulet_medOld: "District median (without new builds)",
            resz_kerulet_medNew: "District median (new builds)",
            resz_kerulet_m4: "Price level of your district compared with",

            resz_negyed_label: "Neighbourhood",
            resz_negyed_plural: "Neighbourhoods",
            resz_negyed_choose: "— choose a neighbourhood —",
            resz_negyed_medOld: "Neighbourhood median (without new builds)",
            resz_negyed_medNew: "Neighbourhood median (new builds)",
            resz_negyed_m4: "Price level of your neighbourhood compared with",

            resz_varosresz_label: "Area",
            resz_varosresz_plural: "Areas",
            resz_varosresz_choose: "— choose an area —",
            resz_varosresz_medOld: "Area median (without new builds)",
            resz_varosresz_medNew: "Area median (new builds)",
            resz_varosresz_m4: "Price level of your area compared with",

            placesReszLabel: "What are the parts of the city called?",
            placesReszDefault: "Default (District / area)",
            placesResz_kerulet: "District (Romanian: cartier)",
            placesResz_negyed: "Neighbourhood (Romanian: cartier)",
            placesResz_varosresz: "Area (Romanian: zonă)",
            maxTavLabel: "At most this far from the city",
            maxTavHint: "(as the crow flies)",
            maxTavChip: "At most {km} km from the city",

            placesReszHelp: "Only the name changes, everything works the same. This name is shown in search, when posting a listing, in the valuation tool and in the table."
        },
        ro: {
            resz_kerulet_label: "Cartier",
            resz_kerulet_plural: "Cartiere",
            resz_kerulet_choose: "— alege un cartier —",
            resz_kerulet_medOld: "Mediana cartierului (fără construcțiile noi)",
            resz_kerulet_medNew: "Mediana cartierului (construcții noi)",
            resz_kerulet_m4: "Nivelul de preț al cartierului tău față de",

            resz_negyed_label: "Cartier",
            resz_negyed_plural: "Cartiere",
            resz_negyed_choose: "— alege un cartier —",
            resz_negyed_medOld: "Mediana cartierului (fără construcțiile noi)",
            resz_negyed_medNew: "Mediana cartierului (construcții noi)",
            resz_negyed_m4: "Nivelul de preț al cartierului tău față de",

            resz_varosresz_label: "Zonă",
            resz_varosresz_plural: "Zone",
            resz_varosresz_choose: "— alege o zonă —",
            resz_varosresz_medOld: "Mediana zonei (fără construcțiile noi)",
            resz_varosresz_medNew: "Mediana zonei (construcții noi)",
            resz_varosresz_m4: "Nivelul de preț al zonei tale față de",

            placesReszLabel: "Cum se numesc părțile orașului?",
            placesReszDefault: "Implicit (Cartier / zonă)",
            placesResz_kerulet: "Kerület – în maghiară (cartier)",
            placesResz_negyed: "Negyed – în maghiară (cartier)",
            placesResz_varosresz: "Városrész – în maghiară (zonă)",
            maxTavLabel: "Cel mult la această distanță de oraș",
            maxTavHint: "(în linie dreaptă)",
            maxTavChip: "Cel mult {km} km de oraș",

            placesReszHelp: "Se schimbă doar denumirea, funcționarea rămâne aceeași. Acest nume apare la căutare, la adăugarea anunțului, în evaluator și în tabel."
        }
    };

    Object.keys(V16).forEach(nyelv => {
        I18N_STRINGS[nyelv] = Object.assign(I18N_STRINGS[nyelv] || {}, V16[nyelv]);
    });

})();
