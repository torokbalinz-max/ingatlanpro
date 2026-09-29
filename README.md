# IngatlanPro

Romániai ingatlanhirdetések egy helyen: keresés, térkép, piaci elemzés, értékbecslés, és egy saját hirdetési oldal.

Élő oldal: https://ingatlanpro.onrender.com

## Mappák

```
ingatlanpro/
├── public/                  A weboldal – ezt kapja a böngésző
│   ├── index.html           Az egyetlen HTML oldal (minden „oldal” ebben van)
│   ├── css/style.css        Minden megjelenés
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
- **Ingatlanirodák** (`#iroda`): bármelyik felhasználó létrehozhat egy irodát (Fiókom → Ingatlaniroda). Az iroda hirdetései egy helyen kezelhetők: ügynökök, belső hivatkozási szám, mappák, archiválás, tömeges műveletek. A hirdetésen látszik az iroda és az ügynök elérhetősége.
- **Kerülethatárok** (Admin → Városok, kerületek → Határok rajzolása): a kerületek határa a térképen. Pontos helyű hirdetésnél ebből dől el a kerület; a csak kerülettel ismert hirdetések a kerület közepére kerülnek.
- `MEGHIVO_KOD`: ha be van állítva, csak ezzel a kóddal lehet regisztrálni.

## Új részek

- **Keresek** (`#igenyek`): a vevők leírják, mit keresnek; az eladók üzenetben válaszolnak, és ajánlhatják a hirdetésüket.
- **Fiókom** (`#fiok`): profil, hirdetéseim, mentett keresések, keresési igényeim, üzenetek.
- **Hely-ellenőrzés** (`server/services/location.js`): a városon / falun kívülre tett, vagy a leírt utcával nem egyező jelölőket kijavítja. A hasonló nevű falvakat csak a város körül keresi.
- **Duplikátumok fotókkal** (`server/services/imagehash.js`): a képek ujjlenyomatából ismeri fel ugyanazt az ingatlant más oldalakon. Kell hozzá a `sharp` csomag (`npm install`).
- **E-mail** (`server/services/mail.js`): Brevo vagy Resend API-val, ha be van állítva (lásd `.env.example`).
- **Ártrend és összevetés** (`server/services/piactrend.js`): a trend a hirdetésekből számol (mikor volt fent, milyen áron). Az árváltozásokat és a piacról lekerülést egy adatbázis-trigger naplózza (`ar_elozmenyek` tábla, `piacrol_le` oszlop – a `schema.js` magától létrehozza). Havonta automatikus piaci mentés is készül.
- **Állapot gyors beállítása** (Admin → Állapot beállítása, `server/routes/allapot.js`): képek alapján, 1–6 billentyűvel vagy rácsban tömegesen.
- **Kerülethatárok** (`server/services/districts.js`): átfedésnél / résnél is a helyes kerület; induláskor a kerületek a határokhoz igazodnak; Ellenőrzés gomb a határ-szerkesztőben.
- **Értékbecslő** (`server/services/valuation.js`): hasonló hirdetések + árarány-modell keverve. Pontosság mérése: Admin → Áttekintés → Értékbecslő pontossága.
- **Súgó** (`#sugo`, `public/js/help/`): részletes, témákra bontott útmutató három nyelven.
