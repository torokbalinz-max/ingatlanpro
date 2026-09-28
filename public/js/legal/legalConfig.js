// ============================================================
//  JOGI ADATOK – EZT KELL KITÖLTENED (egyszer)
//
//  Ezek jelennek meg az Impresszumban, az ÁSZF-ben és az
//  Adatvédelmi tájékoztatóban. A román e-kereskedelmi törvény
//  (365/2002, 5. cikk) szerint az üzemeltető nevének, címének és
//  elérhetőségének az oldalon mindig láthatónak kell lennie.
//
//  Amíg egy mező üres, a jogi oldalakon egy sárga „kitöltendő”
//  jelzés látszik a helyén.
// ============================================================

const LEGAL_CONFIG = {

    // Az üzemeltető (az adatkezelő)
    uzemelteto: {
        // "maganszemely" | "pfa" (PFA / II / IF) | "ceg" (SRL, SA...)
        tipus: "maganszemely",

        // Teljes név, vagy cégnév (pl. "Kovács Péter" / "Kovács Péter PFA" / "IngatlanPro SRL")
        nev: "",

        // Postai cím (lakcím vagy székhely): utca, szám, település, megye, irányítószám, ország
        cim: "",

        // Hivatalos kapcsolattartó e-mail – ide jönnek az adatvédelmi kérések és a bejelentések
        email: "",

        // Telefonszám (nem kötelező, de ajánlott)
        telefon: "",

        // Csak PFA-nál / cégnél: cégjegyzékszám (Nr. Reg. Com., pl. J14/123/2026) és adószám (CUI / CIF)
        cegjegyzekszam: "",
        adoszam: ""
    },

    // A jogi dokumentumok hatályba lépésének napja.
    // Lényeges módosításnál ezt ÉS a server/lib/jogi.js ASZF_VERZIO értékét is írd át.
    hatalyos: "2026-09-28",

    // Hol van az adatbázis (a Neon projekt régiója – a Neon felületén látod)
    adatbazisHelye: "EU – Frankfurt (AWS eu-central-1)",

    // A felhasználók ennyi idős kortól regisztrálhatnak
    minimumKor: 18

};
