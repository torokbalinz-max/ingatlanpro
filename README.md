# IngatlanPro

Romániai ingatlanhirdetések egy helyen: keresés, térkép, piaci elemzés, értékbecslés, és egy saját hirdetési oldal.

Élő oldal: https://ingatlanpro.onrender.com

## Mappák

```
ingatlanpro/
├── public/                  A weboldal – ezt kapja a böngésző
│   ├── index.html           Az egyetlen HTML oldal (minden „oldal” ebben van)
│   ├── css/                 Megjelenés (style.css az alap, v4.css / v5.css az újabb részek)
│   └── js/
│       ├── core/            Alap: nyelvek, segédek, típusok, belépés, oldalváltás, indítás
│       ├── listings/        Ingatlanok: adatok, kereső, kártyák, táblázat, térkép, hirdetés oldal
│       ├── new-listing/     Hirdetésfeladás / szerkesztés
│       ├── favorites/       Kedvencek
│       ├── market/          Piaci elemzés (statistics/ alatt a fülek)
│       ├── valuation/       Értékbecslő
│       └── admin/           Admin felület – fülenként külön fájl
│
├── server/                  A szerver (Node.js + Express)
│   ├── server.js            Belépési pont – csak összerakja a részeket
│   ├── routes/              Az API útvonalai témánként (listings, admin, places, ...)
│   ├── services/            A „munka”: beolvasás, minőség-ellenőrzés, becslés, helymeghatározás, AI
│   ├── db/                  Adatbázis-kapcsolat (database.js) és táblák (schema.js)
│   ├── middleware/          Belépés, jogosultság (admin / felhasználó)
│   └── lib/                 Közös apróságok
│
├── scripts/                 Egyszer futtatandó parancsok
│   ├── import-backup.js     Mentés visszatöltése (data/ingatlanok-backup.json)
│   ├── migrate.js           Költöztetés egyik adatbázisból a másikba
│   └── takaritas.js         A régi, áthelyezett fájlok törlése
│
├── data/                    Helyi mentések (NEM kerül GitHubra)
├── .env                     Jelszavak, kulcsok (NEM kerül GitHubra) – minta: .env.example
└── package.json
```

## Parancsok

| Parancs | Mit csinál |
|---|---|
| `npm start` | Elindítja a szervert (helyben: http://localhost:3000) |
| `npm run import-backup` | Visszatölti a helyi mentést az adatbázisba |
| `npm run migrate` | Átmásolja az adatokat egyik adatbázisból a másikba |
| `npm run takaritas` | Törli a régi helyükről áthelyezett fájlokat (egyszer kell) |

## Frissítés az élő oldalon

```
git add -A
git commit -m "leírás"
git push
```

A Render a push után magától újraindul az új kóddal (pár perc).

## Szerepek és fiókok

- **Admin** (`ADMIN_USER` / `ADMIN_PASSWORD`, vagy az `ADMIN_EMAILS`-ben felsorolt e-mail címek): mindent lát és módosíthat, övé az Admin felület.
- **Felhasználó**: saját fiók (e-mail + jelszó, vagy Google). Hirdetést adhat fel, a sajátját szerkesztheti / törölheti, saját kedvencei, mentett keresései, keresési igényei és üzenetei vannak.
- A belépés a weboldal belépő ablakában történik (süti, 60 napig bent marad). A régi `ADMIN_USER` / `APP_USER` belépés ugyanott működik.
- Az oldal alapból **nyilvános**: belépés nélkül is lehet böngészni. `NYILVANOS=0`: csak belépve látszik.
- **Felhasználói nézet**: az admin a fejléc menüjében átválthat, és úgy látja az oldalt, mint egy sima felhasználó (az admin felület ilyenkor rejtve van). Ugyanott lehet visszaváltani.
- **Ingatlanirodák** (`#irodak` a nyilvános lista és az irodák profiljai, `#iroda` a saját iroda kezelése): bármelyik felhasználó regisztrálhat irodát, de csak valódi céggel – az adószámot (CUI) a szerver az ANAF nyilvános adatbázisában ellenőrzi (nem létező / inaktív / megszűnt cég nem regisztrálható), és az irodát az admin hagyja jóvá (Admin → Ingatlanirodák). Jóváhagyás előtt az iroda neve nem látszik másoknak; név- vagy adószám-változás után újra jóvá kell hagyni. Munkatárs csak elfogadott meghívással kerül be. Az iroda hirdetései egy helyen kezelhetők: ügynökök, belső hivatkozási szám, mappák, archiválás, tömeges műveletek.
- **Kerülethatárok** (Admin → Városok, kerületek → Határok rajzolása): a kerületek határa a térképen. Pontos helyű hirdetésnél ebből dől el a kerület; a csak kerülettel ismert hirdetések a kerület közepére kerülnek.
- `MEGHIVO_KOD`: ha be van állítva, csak ezzel a kóddal lehet regisztrálni.

## Új részek

- **Keresek** (`#igenyek`): a vevők leírják, mit keresnek; az eladók üzenetben válaszolnak, és ajánlhatják a hirdetésüket.
- **Fiókom** (`#fiok`): profil, hirdetéseim, mentett keresések, keresési igényeim, üzenetek.
- **Hely-ellenőrzés** (`server/services/location.js`): a városon / falun kívülre tett, vagy a leírt utcával nem egyező jelölőket kijavítja. A hasonló nevű falvakat csak a város körül keresi.
- **Duplikátumok fotókkal** (`server/services/imagehash.js`): a képek ujjlenyomatából ismeri fel ugyanazt az ingatlant más oldalakon. Kell hozzá a `sharp` csomag (`npm install`).
- **E-mail** (`server/services/mail.js`): Brevo vagy Resend API-val, ha be van állítva (lásd `.env.example`).
- **Ártrend és összevetés** (`server/services/piactrend.js`): a trend a hirdetésekből számol (mikor volt fent, milyen áron). Az árváltozásokat és a piacról lekerülést egy adatbázis-trigger naplózza (`ar_elozmenyek` tábla, `piacrol_le` oszlop – a `schema.js` magától létrehozza). Havonta automatikus piaci mentés is készül.
- **Állapot gyors beállítása** (Admin → Állapot beállítása, `server/routes/allapot.js`): képek alapján, 1–9 billentyűvel (az Állapotok lista sorrendjében) vagy rácsban tömegesen.
- **Kerülethatárok** (`server/services/districts.js`): átfedésnél / résnél is a helyes kerület; induláskor a kerületek a határokhoz igazodnak; Ellenőrzés gomb a határ-szerkesztőben.
- **Értékbecslő** (`server/services/valuation.js`, 3. változat): hasonló hirdetések + árarány-modell keverve. Az újépítésű lakások külön piac (nem húzzák fel a régi lakások becslését egy olcsóbb negyedben), a tizedes alapterület pontosan számít és a becslés folytonos, egy hirdetés saját ára (és a más oldalon lévő ikre) soha nem számít bele, jobb állapotra nem jöhet ki kisebb becslés, a városi / kerületi szám medián. Pontosság mérése: Admin → Áttekintés → Értékbecslő pontossága (az első, az előző – `valuationV2.js` – és a mostani módszer egymás mellett).
- **Város és környéke** (`server/services/kornyek.js`, Admin → Város és környéke): a város falvaiban lévő hirdetések (telek, ház, bármi) a „<város> és környéke” városba kerülnek – mentéskor, beolvasáskor és induláskor magától (ismert falu a település mezőben / a címben, vagy a pontos hely a városon kívül). A bizonytalan esetekről az admin dönt; a kézi döntést az automatika nem írja felül (`varos_kezi`). A városok táblában `anyavaros` = melyik város környéke.
- **Több kerület egyszerre** a keresőben (`public/js/core/multiSelect.js`): kerületek és települések többes választóval, darabszámmal; a mentett keresések, az értesítések és az ártrend is kezelik (`keruletek`, `telepulesek`).
- **Térkép**: az egy ponton álló hirdetések (ugyanaz az épület / az iroda címe) egy számozott jelölőbe kerülnek, listával – korábban egymásra rajzolódtak, és csak a legfelső látszott. A kikapcsolt közelítő helyekről és a hely nélküli hirdetésekről a térkép fölött szól.
- **Reklámfelületek** (`public/js/core/ads.js`, `server/services/reklam.js`): „Bérelhető reklámfelület” helyőrzők a szokásos helyeken (kezdőlap, a kereső alatt, a találatok között egyszer, a hirdetés oldalán, az értékbecslőben, a piaci elemzés alján) – a funkciókat nem takarják. Admin → Webhely adatai → Reklámfelületek: ki-be kapcsolás, az érdeklődők e-mail címe.
- **Súgó** (`#sugo`, `public/js/help/`): részletes, témákra bontott útmutató három nyelven.
- **Állapotok** (Admin → Állapotok, `server/services/allapotok.js`, `allapotok` tábla): az állapotlista kód nélkül bővíthető (név HU/RO/EN, szín, szint, árszorzó, kulcsszavak). A hirdetés szövegéből a kulcsszavak és beépített szabályok alapján ismeri fel az állapotot (`allapot_forras`: kezi / forras / szoveg / ev – a becsültek *-gal látszanak).
- **Webhely adatai** (Admin → Webhely adatai, `server/services/oldalAdatok.js`): az üzemeltető adatai (név / cégnév, adószám, cím, e-mail, telefon) – az Impresszum, a Felhasználási feltételek, az Adatvédelmi és a Süti-tájékoztató és a lábléc innen veszi. Üres e-mailnél az `ADMIN_EMAILS` első címe (vagy az admin fiók e-mailje) látszik.
- **ANAF-lekérdezés** (`server/services/anaf.js`): a román adóhatóság ingyenes, nyilvános API-ja (kulcs nem kell), gyorstárral és másodpercenkénti korláttal.
- **Biztonság**: a szerver külső oldalt / képet csak nyilvános internetes címről kér le (a belső hálózat tiltott – `server/lib/biztonsagosFetch.js`), a hirdetések linkje csak http(s) lehet, alap biztonsági fejlécek (nosniff, beágyazás tiltása).

## Később (ötletek – még nincs kész)

- **Reklámfelületek – valódi hirdetések**: a helyek már megvannak (lásd fent); hátravan a Google Ads, és a cégeknek kiadott saját hirdetések kezelése az admin felületről (mettől meddig, kinek a hirdetése, kép / link).
- **AI-asszisztens a weboldalon**: egy chat, ami válaszol a látogatók kérdéseire (keresés, piaci adatok, hogyan működik az oldal).
