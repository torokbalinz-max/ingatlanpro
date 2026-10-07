// ============================================================
//  Az ingatlanok állapotának kezdő listája
//
//  Az állapotokat az admin felületen lehet bővíteni, átnevezni,
//  átrendezni, kikapcsolni (Admin → Állapotok). Ez a lista csak a
//  kiinduló állapot: induláskor a hiányzó beépített állapotok
//  bekerülnek az adatbázisba, a már meglévőkhöz nem nyúlunk.
//
//   kulcs   ami az ingatlanok.allapot oszlopba kerül (nem változik,
//           ha az admin átnevezi az állapotot)
//   szint   minőségi szint 0–4 (a hasonló hirdetések kereséséhez:
//           mennyire "messze" van két állapot egymástól)
//   szorzo  az értékbecslő kiinduló aránya a "jó" állapothoz képest
//           (a sok hirdetésből tanult arány felülírja)
//   szin    a térképi jelölő színe
// ============================================================

const ALAP_ALLAPOTOK = [
    { kulcs: "félkész",     nev_hu: "félkész (szerkezetkész)", nev_ro: "nefinisat (la roșu / la gri)", nev_en: "unfinished (shell)", szin: "#92400e", szint: 0,   szorzo: 0.70, sorrend: 5 },
    { kulcs: "felújítandó", nev_hu: "felújítandó",             nev_ro: "necesită renovare",            nev_en: "needs renovation",   szin: "#b91c1c", szint: 0,   szorzo: 0.80, sorrend: 10 },
    { kulcs: "közepes",     nev_hu: "közepes",                 nev_ro: "medie",                        nev_en: "average",            szin: "#ea580c", szint: 0.5, szorzo: 0.89, sorrend: 20 },
    { kulcs: "részbenfel",  nev_hu: "részben felújított",      nev_ro: "parțial renovat",              nev_en: "partly renovated",   szin: "#ca8a04", szint: 1,   szorzo: 0.94, sorrend: 30 },
    { kulcs: "jó",          nev_hu: "jó",                      nev_ro: "bună",                         nev_en: "good",               szin: "#15803d", szint: 2,   szorzo: 1.00, sorrend: 40 },
    { kulcs: "újszerű",     nev_hu: "újszerű",                 nev_ro: "ca nou",                       nev_en: "like new",           szin: "#2563eb", szint: 3,   szorzo: 1.10, sorrend: 50 },
    { kulcs: "újépítésű",   nev_hu: "újépítésű",               nev_ro: "construcție nouă",             nev_en: "new build",          szin: "#0891b2", szint: 3.5, szorzo: 1.12, sorrend: 60 },
    { kulcs: "luxus",       nev_hu: "luxus",                   nev_ro: "lux",                          nev_en: "luxury",             szin: "#7c3aed", szint: 4,   szorzo: 1.22, sorrend: 70 }
];

module.exports = { ALAP_ALLAPOTOK };
