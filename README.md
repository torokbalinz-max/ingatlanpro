# IngatlanPro

Romániai ingatlanhirdetések egy helyen: keresés, térkép, piaci elemzés, értékbecslés, és egy saját hirdetési oldal.

Élő oldal: https://ingatlanpro.onrender.com

## Mappák

```
ingatlanpro/
├── public/                  A weboldal – ezt kapja a böngésző
│   ├── index.html           Az egyetlen HTML oldal (minden „oldal” ebben van)
│   ├── css/                 Megjelenés (style.css az alap, v4…v14.css az újabb részek – a v14 a prémium megjelenés)
│   ├── img/sugo/            A Súgó képernyőképei (hu / ro / en)
│   └── js/
│       ├── core/            Alap: nyelvek, segédek, típusok, belépés, oldalváltás, indítás
│       ├── listings/        Ingatlanok: adatok, kereső, kártyák, táblázat, térkép, hirdetés oldal
│       ├── new-listing/     Hirdetésfeladás / szerkesztés
│       ├── favorites/       Kedvencek
│       ├── market/          Piaci elemzés (statistics/ alatt a fülek)
│       ├── valuation/       Értékbecslő
│       ├── help/            Súgó (szövegek, képek: helpImages.js)
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

## Biztonság

- **Admin jog**: regisztrációval soha nem jár. Az `ADMIN_EMAILS` címe csak igazolt e-mail címmel lesz admin: Google-belépéskor, vagy e-mailes jelszó-visszaállítás után (`users.email_igazolva`). Ha egy nem igazolt, jelszavas fiókot valaki a Google-lel kapcsol össze, a régi jelszó és a munkamenetek törlődnek (a fiók a cím valódi tulajdonosáé).
- **Helyi fejlesztés jelszó nélkül** (nincs `ADMIN_PASSWORD`/`APP_PASSWORD`): csak a gépről, `localhost`-on érkező kérés kap admin jogot – proxyn / alagúton (pl. Cloudflare Tunnel) át soha, a Renderen pedig egyáltalán nem.
- **Belépés**: hibás jelszó IP-címenként 15 percen belül 10, fiókonként 20 után szünet; jelszócsere után a többi eszközön kilép.
- **Kéréskorlát** (`server/middleware/vedelem.js`): IP-címenként / fiókonként percenként 600 olvasás és 120 írás (képek külön 1500), üzenet / ajánlat / foglalás / hirdetésfeladás óránként 40. Az admin nincs korlátozva. Ha az oldal elé Cloudflare kerül, a valódi IP-címhez a `trust proxy` beállítást igazítani kell.
- **Fejlécek**: Content-Security-Policy (honnan tölthető szkript, stílus, kép), HSTS, Permissions-Policy, X-Frame-Options, nosniff. A CDN-ek vagy a Google-belépés címe ott módosítható, ha változik.
- **Feltöltések**: csak JPEG / PNG / WebP (a fájl eleje is ellenőrizve), vendégtől legfeljebb 1 MB-os kérés. A nem nyilvános hirdetések (előnézet, eltávolított) fotói csak a jogosultaknak látszanak.
- **Képtovábbító** (`/api/img`): csak hirdetéshez tartozó külső kép, vagy bejelentkezve (hirdetésfeladás linkről); belső hálózati cím soha (`lib/biztonsagosFetch.js`).
- **Hibaüzenetek**: a szerverhiba részletei csak az adminnak látszanak.
- Csomagok: `npm audit` – 0 ismert sérülékenység (2026-10-17). Node 20.9 vagy újabb kell (a `sharp` miatt).

## Új részek

- **Keresek** (`#igenyek`): a vevők leírják, mit keresnek; az eladók üzenetben válaszolnak, és ajánlhatják a hirdetésüket.
- **Fiókom** (`#fiok`): profil, hirdetéseim, mentett keresések, keresési igényeim, üzenetek.
- **Admin → Hirdetések → Hely-ellenőrzés** (`public/js/admin/locationCheck.js`): „Pontos hely nélkül” gyors munkasor (`GET /api/admin/hely-pontatlan`, `POST …/:id/marad`, mentés: `POST /api/admin/hely-athelyezett/:id/kezi`) – kiemelt helynevek a leírásban, címkereső, műholdkép, Ctrl+Enter; és az „Áthelyezett” rész.
- **Hely-ellenőrzés** (`server/services/location.js`): a városon / falun kívülre tett, vagy a leírt utcával nem egyező jelölőket kijavítja. A hasonló nevű falvakat csak a város körül keresi.
- **Duplikátumok fotókkal** (`server/services/imagehash.js`): a képek ujjlenyomatából ismeri fel ugyanazt az ingatlant más oldalakon. Kell hozzá a `sharp` csomag (`npm install`).
- **E-mail** (`server/services/mail.js`): Brevo vagy Resend API-val, ha be van állítva (lásd `.env.example`).
- **Ártrend és összevetés** (`server/services/piactrend.js`): a trend a hirdetésekből számol (mikor volt fent, milyen áron). Az árváltozásokat és a piacról lekerülést egy adatbázis-trigger naplózza (`ar_elozmenyek` tábla, `piacrol_le` oszlop – a `schema.js` magától létrehozza). Havonta automatikus piaci mentés is készül.
- **Állapot gyors beállítása** (Admin → Állapot beállítása, `server/routes/allapot.js`): képek alapján, 1–9 billentyűvel (az Állapotok lista sorrendjében) vagy rácsban tömegesen.
- **Kerülethatárok** (`server/services/districts.js`): átfedésnél / résnél is a helyes kerület; induláskor a kerületek a határokhoz igazodnak; Ellenőrzés gomb a határ-szerkesztőben.
- **Értékbecslő** (`server/services/valuation.js`, 3.1 változat): árarány-modell (méret, állapot, emelet, magas tömbház, kerület, új építés szorzói) + a leghasonlóbb hirdetések ebből a modellből átszámított árai mint helyi korrekció, a kettő keverve. Meglévő lakásnál a kerület egyetlen szorzóval számít (ugyanaz a lakás két kerületben pontosan a két szorzó arányában különbözik); az admin a kerületek árszintjét is megadhatja (Admin → Városok, kerületek → Árszint, `keruletek.arszint`), a becslő ezt a sorrendet betartja, és a kerületek mellett látszik a becslő kerület-szorzója. Az újépítésű lakások külön piac (nem húzzák fel a régi lakások becslését egy olcsóbb negyedben), a tizedes alapterület pontosan számít és a becslés folytonos, egy hirdetés saját ára (és a más oldalon lévő ikre) soha nem számít bele, jobb állapotra nem jöhet ki kisebb becslés, a városi / kerületi szám medián. Pontosság mérése: Admin → Áttekintés → Értékbecslő pontossága (az első, az előző és a mostani módszer egymás mellett).
- **Város és környéke** (`server/services/kornyek.js`, Admin → Város és környéke): a város falvaiban lévő hirdetések (telek, ház, bármi) a „<város> és környéke” városba kerülnek – mentéskor, beolvasáskor és induláskor magától (ismert falu a település mezőben / a címben, vagy a pontos hely a városon kívül). A bizonytalan esetekről az admin dönt; a kézi döntést az automatika nem írja felül (`varos_kezi`). A városok táblában `anyavaros` = melyik város környéke.
- **Több kerület egyszerre** a keresőben (`public/js/core/multiSelect.js`): kerületek és települések többes választóval, darabszámmal; a mentett keresések, az értesítések és az ártrend is kezelik (`keruletek`, `telepulesek`).
- **Térkép**: az egy ponton álló hirdetések (ugyanaz az épület / az iroda címe) egy számozott jelölőbe kerülnek, listával – korábban egymásra rajzolódtak, és csak a legfelső látszott. A kikapcsolt közelítő helyekről és a hely nélküli hirdetésekről a térkép fölött szól.
- **Reklámfelületek** (`public/js/core/ads.js`, `server/services/reklam.js`): „Bérelhető reklámfelület” helyőrzők a szokásos helyeken (kezdőlap, a kereső alatt, a találatok között egyszer, a hirdetés oldalán, az értékbecslőben, a piaci elemzés alján) – a funkciókat nem takarják. Admin → Webhely adatai → Reklámfelületek: ki-be kapcsolás, az érdeklődők e-mail címe.
- **Súgó** (`#sugo`, `public/js/help/`): részletes, témákra bontott útmutató három nyelven.
- **Állapotok** (Admin → Állapotok, `server/services/allapotok.js`, `allapotok` tábla): az állapotlista kód nélkül bővíthető (név HU/RO/EN, szín, szint, árszorzó, kulcsszavak). A hirdetés szövegéből a kulcsszavak és beépített szabályok alapján ismeri fel az állapotot (`allapot_forras`: kezi / forras / szoveg / ev – a becsültek *-gal látszanak).
- **Webhely adatai** (Admin → Webhely adatai, `server/services/oldalAdatok.js`): az üzemeltető adatai (név / cégnév, adószám, cím, e-mail, telefon) – az Impresszum, a Felhasználási feltételek, az Adatvédelmi és a Süti-tájékoztató és a lábléc innen veszi. Üres e-mailnél az `ADMIN_EMAILS` első címe (vagy az admin fiók e-mailje) látszik.
- **ANAF-lekérdezés** (`server/services/anaf.js`): a román adóhatóság ingyenes, nyilvános API-ja (kulcs nem kell), gyorstárral és másodpercenkénti korláttal.
- **Biztonság**: a szerver külső oldalt / képet csak nyilvános internetes címről kér le (a belső hálózat tiltott – `server/lib/biztonsagosFetch.js`), a hirdetések linkje csak http(s) lehet, alap biztonsági fejlécek (nosniff, beágyazás tiltása).
- **Eladjuk helyetted – a teljes folyamat** (`server/services/megbizas.js`, `server/routes/megbizas.js`): 7 szakasz (Igénylés → Egyeztetés → Szerződés → Előkészítés → Hirdetés → Ajánlatok → Adásvétel), a megbízás magától lép tovább, ha a feltétel teljesül (pl. az eladó jóváhagyta a csomagot, aláírta a szerződést, jóváhagyta a hirdetést). Minden megbízásnál látszik a **következő lépés** és hogy kire várunk.
  - **Az eladó** (`#eladas` – Ingatlanom eladása, a fejlécben kiemelve): csomag és hirdetés jóváhagyása egy kattintással, a megbízási szerződés online aláírása e-mailben kapott 6 jegyű kóddal (idő, IP, böngésző és a szöveg SHA-256 ujjlenyomata rögzítve; `megbizasSzerzodes.js`) vagy személyesen, iratok feltöltése, megtekintések, ajánlatok (a vevő neve nélkül), üzenetek. A hirdetés az eladó jóváhagyásáig csak előnézet (`statusz = 'elonezet'`).
  - **A vevő** a hirdetésen: naptárból foglal időpontot (egyszerre egy élő foglalás; várólista; .ics; emlékeztető 24 és 2 órával előtte), ajánlatot csak a megtekintés után tehet (beállítható), kötelező finanszírozással (készpénz / hitel / vegyes, hitel-állapot, igazolás feltöltése), foglalóval, határidőkkel, érvényességgel.
  - **A csapat** (Admin → Értékesítés): Megbízások (Ma teendő, szakaszonkénti tábla, részletek 5 fülön), Megtekintési naptár (heti nézet, lezárás, áthelyezés, várólista), Fotók és hirdetések, Beállítások (díjak, ajánlatok, alap naptár, automatizmusok: auto-ellenjegyzés, díjbekérő eladáskor).
  - Fájlok: `megbizas_fajlok` tábla (PDF / kép, max. 8 MB). Automatizmusok: `megbizasAuto.js`, 15 percenként.
- **Csapat és jogosultságok** (Admin → Csapat): a munkatárs a saját fiókjával ugyanazt az admin felületet látja, de csak azokat a részeket, amelyekre jogot kapott – és ott ugyanazt tudja, mint az admin. A hirdetések ellenőrzése városra is kiadható (a városi sorban „Ellenőrzés ebben a városban”: ellenőrzésre vár, hely-ellenőrzés, állapot, nem elérhetők, bejelentések – a szerver a listákat és a műveleteket a városokra szűri: `csapat.reszSql`, `csapat.csakHirdetesen`; a duplikátumok és a tömeges műveletek csak az egész oldalra: `csapat.csakGlobalis`). Admin részek (mindenre): hirdetések ellenőrzése, beolvasás, városok, irodák, reklámok, pénzügyek, statisztika, beállítások. Értékesítés (mindenre, vagy csak egy városra / megbízásra / hirdetésre): megbízások kezelése / megtekintése, megtekintési naptár, hirdetések szerkesztése, fotók. A Csapat menüpont csak az adminé. (`server/services/csapat.js`: `csakResz(...)`, `csakPanel`.) A régi `#munka` linkek az admin felületre visznek.
- **Rendrakás (11. változat)** – minden funkció egyetlen helyen.
  - **Admin** (`public/js/admin/menu.js`): a bal oldali menü helyett felül a modulok (Ma · Hirdetések · Értékesítés · Pénzügy · Partnerek · Rendszer, a sürgős dolgok számával), alattuk a modul oldalai, a tartalom a teljes képernyő szélességében; **Ctrl+K** (vagy `/`): Ugrás… – bármelyik rész kereséssel. A Ma oldal: a teendők sürgősség szerint (ügyfelek várnak / napi rutin / ha van időd) + röviden az oldal állapota.
  - **Fejléc** (`css/v12.css`): mindig elöl az Ingatlanok, az Eladjuk helyetted és a Hirdetés feladása. 1280 px-től külön a Térkép és az Értékbecslő; a ritkábbak a „Több ▾” alatt, témák szerint: Vevőknek (Keresek), Piac (Piaci elemzés), Hirdetőknek (Csomagok és árak, Ingatlanirodák), Súgó; laptopon / iPaden fekve a Térkép és az Értékbecslő is a „Több” alá kerül; telefonon és iPaden állva alul menüsáv (Ingatlanok · Térkép · Feladás · Eladjuk · Menü), a Menü lapon a többi, a nyelv és a sötét mód. A saját dolgok (Érdeklődéseim, Kedvencek, Mentett keresések, Hirdetéseim, Ingatlanom eladása, Üzenetek...) csak a fiók menüben; a fiók ikon jelvénye mutatja, mennyi vár (üzenet, vevő, eladó).
- **Érdeklődéseim** (`#erdeklodes`, `public/js/services/buyerPage.js`, `GET /api/megbizas/vevo`): a vevő egy helyen látja, hova foglalt időpontot, hova tett ajánlatot, mi a válasz; az ellenajánlatot itt elfogadhatja / új ajánlatot tehet / visszavonhatja, lemondhatja a megtekintést, és üzenhet az ügyintézőnek. A teendők száma jelvényként a Vásárlás menün és a fiók ikonján (`/api/me` → `vevo`).
- **Online fizetés bankkártyával** (`server/services/fizetes.js`, `server/routes/fizetes.js`, Stripe Checkout): a díjbekérő (csomag, kiemelés, előfizetés, megbízás) mellett „Fizetés kártyával” gomb – a rendelés után, és a Fiókom → Csomagom és számláim oldalon. A kártyaadatot a Stripe kéri be a saját oldalán (3-D Secure, Apple / Google Pay), hozzánk nem jut el. Az összeget mindig a szerver adja, csak a saját díjbekérő fizethető ki, a sikert a Stripe **aláírt** értesítése (webhook, `/api/fizetes/stripe/webhook` – a belépés és a JSON-olvasó előtt bekötve) vagy a Stripe-tól közvetlen lekérdezés igazolja; utána a díjbekérő kifizetett, a csomag / kiemelés azonnal aktív. Összeg-eltérésnél nem jelöl kifizetettnek. Napló: `online_fizetesek` tábla, Admin → Pénzügy → Online fizetés. Beállítás: legegyszerűbb az adminban (Pénzügy → Online fizetés → 4 lépés: Stripe fiók, titkos kulcs – a Stripe-nál ellenőrizve, külön `stripe_kulcs` beállításban, a böngészőbe nem kerül vissza –, a webhook egy kattintással létrejön a Stripe-ban). A szerver környezeti változói (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) erősebbek. Helyi próbához Stripe nélkül `FIZETES_DEMO=1`, vagy ál-Stripe szerverrel `STRIPE_API_BASE=http://localhost:4099`.
- **Hivatalos számla** (`server/services/szamlazo.js`): `SZAMLAZO=smartbill` vagy `oblio` esetén a kifizetett díjbekérőből magától elkészül a hivatalos számla a számlázóban (az küldi az e-Facturába); a számla száma a `kulso_szam` mezőbe, a vevő letöltheti (Csomagom és számláim → Számla). Hibánál az Admin → Online fizetés oldalon újrapróbálható. Kikapcsolható: Pénzügy → Beállítások → Hivatalos számla automatikusan.
- **Saját számla** (`server/services/szamlazo.js`, `sajat`): ha nincs bekötve külső számlázó, a kifizetett díjbekérőből (kártya, vagy amikor az admin kifizetettnek jelöli – `penzugy.fizetveFigyelo`) az app maga állítja ki a számlát (`tipus = 'szamla'`, `IP-<év>-<sorszám>`, `dijbekero_id` = melyik díjbekérőből), e-mailben elküldi a vevőnek, a vevő a Csomagom és számláim oldalon letölti. Kikapcsolható: Pénzügy → Számlázás → Saját számla.
- **e-Factura XML** (`server/services/efactura.js`): a saját számla UBL 2.1 (RO_CIUS 1.0.1) XML-ként letölthető (Irattár → Kimenő számlák → XML, `GET /api/admin/penzugy/szamlak/:id/efactura.xml`) és az ANAF SPV-ben feltölthető. Kell hozzá: Webhely adatai (név, adószám, cím) + Pénzügy → Számlázás (település, megye). Feltöltés előtt az ANAF ellenőrzőjével (és könyvelővel) ellenőrizendő; automatikus beküldés (ANAF API, tanúsítvány) még nincs.
- **Irattár** (Admin → Irattár, `server/services/irattar.js`, `irattar` tábla, `public/js/admin/archive.js`): két rész – *Számlák és pénzügyi iratok* (kimenő számlák és díjbekérők – az app adja; bejövő számlák, a Kiadásokhoz egy kattintással csatolhatók; nyugták, bankkivonatok, adó / ANAF, egyéb) és *Szerződések* (megbízási – az app adja; ügyfél, partner, szolgáltató, bérleti, munkatársi, cégiratok, egyéb – kezdet, lejárat, felmondási idő). Feltöltés gombbal vagy ráhúzással (PDF, kép, Word, Excel, XML, max. 15 MB, a fájl az adatbázisban; azonos fájlra figyelmeztet), keresés, év, kategória, CSV-export a könyvelőnek. A 30 napon belül lejáró és a lejárt szerződések a Ma oldalon is.
- **Kiemelt hirdetések** (`server/services/kiemeles.js`, `ingatlan_kiemelesek` tábla): a kiemelt hirdetés a találati lista elején áll „Kiemelt” jelöléssel, és a kezdőlapon is („Kiemelt hirdetések”). Honnan: megvett kiemelés (Csomagok és árak, kategória: kiemelés, a hossza a csomag „Egy kiemelés hossza” joga, alapból 7 nap; hirdetés nélkül vásárolva kredit marad), az előfizetés havi kerete (jog: kiemelés / hó), vagy az admin kézzel (Admin → Pénzügy → Kiemelések). A hirdető a Hirdetéseim kártyán / a hirdetés oldalán a „Kiemelés” gombbal látja, meddig kiemelt, felhasználja a kreditjét / keretét, vagy vesz egyet (kártyával azonnal él). Ha már kiemelt, az új idő a végéhez adódik.

- **Hivatalos számla és szerződés román nyelven** (`server/services/bizonylat.js`, `server/services/dokumentum.js`, `server/services/megbizasSzerzodes.js`): a számla, díjbekérő és a megbízási szerződés hivatalos szövege román, kérésre magyar / angol fordítással (`?ford=hu|en`); felül „Vissza” gomb (telefonon is), nyomtatás. Kiállított számla zárolt – javítás sztornó számlával. e-Factura: ANAF-ellenőrzés és ANAF PDF gomb.
- **Prémium megjelenés (14. változat)** (`public/css/v14.css`): a nyilvános oldalak finomított színei, tipográfiája, kártyái, fénykép nélküli hirdetések típus szerinti háttere, diszkrét üres reklámhelyek, bővebb lábléc. Az admin nem változott (a szabályok a `body:not([data-page="admin"])` alatt).
- **Súgó képekkel** (`public/js/help/helpImages.js`, `public/img/sugo/`): minden témához bejelölt képernyőképek három nyelven, nagyítással, témarács, előző / következő téma.

## Később (ötletek – még nincs kész)

- **Reklámfelületek – valódi hirdetések**: a helyek már megvannak (lásd fent); hátravan a Google Ads, és a cégeknek kiadott saját hirdetések kezelése az admin felületről (mettől meddig, kinek a hirdetése, kép / link).
- **AI-asszisztens a weboldalon**: egy chat, ami válaszol a látogatók kérdéseire (keresés, piaci adatok, hogyan működik az oldal).
