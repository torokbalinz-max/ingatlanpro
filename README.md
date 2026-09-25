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

## Szerepek

- **Admin** (`ADMIN_USER` / `ADMIN_PASSWORD`): mindent lát és módosíthat, övé az Admin felület.
- **Felhasználó** (`APP_USER` / `APP_PASSWORD`): böngészhet, hirdetést adhat fel.
- Az admin gombok és oldalak a felhasználóknak nem látszanak, és a szerver is elutasítja a kéréseiket.
