// ============================================================
//  Jogi dokumentumok szövege – magyar, román, angol
//
//  impresszum   Impresszum és kapcsolat (365/2002 tv. 5. cikk, DSA 11–12. cikk)
//  aszf         Felhasználási feltételek (DSA 14. cikk, 16–17. cikk)
//  adatvedelem  Adatvédelmi tájékoztató (GDPR 13–14. cikk)
//  sutik        Süti-tájékoztató (2002/58/EK irányelv, román 506/2004 tv. 4. cikk)
//
//  Az üzemeltető adatai a legalConfig.js-ből jönnek (c.v(...)).
//  A szöveg HTML: <h3> fejezetek, <p>, <ul>, <table>.
// ============================================================

const LEGAL_DOCS = {

    // ================================================================== MAGYAR
    hu: {

        impresszum: c => `
<p class="legalLead">Az IngatlanPro weboldal üzemeltetőjének adatai és elérhetőségei.</p>

<h3>Üzemeltető (szolgáltató és adatkezelő)</h3>
<table class="legalTable legalKV">
<tr><th>Név</th><td>${c.v(c.op.nev, "név / cégnév")}</td></tr>
<tr><th>${c.ceg ? "Székhely" : "Cím"}</th><td>${c.v(c.op.cim, "postai cím")}</td></tr>
<tr><th>E-mail</th><td>${c.mailto(c.op.email)}</td></tr>
${c.op.telefon ? `<tr><th>Telefon</th><td>${c.e(c.op.telefon)}</td></tr>` : ""}
${c.ceg ? `<tr><th>Cégjegyzékszám</th><td>${c.v(c.op.cegjegyzekszam, "Nr. Reg. Com.")}</td></tr>
<tr><th>Adószám (CUI)</th><td>${c.v(c.op.adoszam, "CUI / CIF")}</td></tr>` : ""}
<tr><th>Weboldal</th><td>${c.e(location.origin)}</td></tr>
</table>

<h3>Tárhely és adatbázis</h3>
<p>Tárhelyszolgáltató: <b>Render Services, Inc.</b> (USA) – render.com.<br>
Adatbázis: <b>Neon</b> – neon.com, az adatok helye: ${c.e(c.db)}.</p>

<h3>Kapcsolattartási pont (EU 2022/2065 rendelet – DSA, 11. és 12. cikk)</h3>
<p>A hatóságok, az Európai Bizottság és a felhasználók közvetlenül, elektronikusan ezen a címen érhetnek el minket: ${c.mailto(c.op.email)}.
A kapcsolattartás nyelve: <b>magyar, román, angol</b>. A kapcsolattartás nem kizárólag automatizált eszközökkel történik.</p>

<h3>Jogellenes tartalom bejelentése</h3>
<p>Ha az oldalon jogellenes, megtévesztő vagy a jogaidat sértő tartalmat látsz (pl. a te fotóidat vagy adataidat), jelentsd a ${c.link("bejelentes", "Tartalom bejelentése")} űrlapon, vagy e-mailben.</p>

<h3>A szolgáltatás díja</h3>
<p>Az IngatlanPro használata jelenleg <b>ingyenes</b>. Ha ez változik, a díjakat (ÁFA-val együtt) előre, jól láthatóan közöljük.</p>

${c.ceg ? `<h3>Fogyasztóvédelem</h3>
<p>Nemzeti Fogyasztóvédelmi Hatóság (ANPC): <a href="https://anpc.ro" target="_blank" rel="noopener">anpc.ro</a> ·
Alternatív vitarendezés (SAL): <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener">anpc.ro/ce-este-sal</a></p>` : ""}

<h3>Jogi dokumentumok</h3>
<ul>
<li>${c.link("aszf", "Felhasználási feltételek")}</li>
<li>${c.link("adatvedelem", "Adatvédelmi tájékoztató")}</li>
<li>${c.link("sutik", "Süti-tájékoztató")}</li>
</ul>`,

        aszf: c => `
<p class="legalLead">Ezek a feltételek szabályozzák az IngatlanPro weboldal (a továbbiakban: „Oldal”) használatát. Kérjük, figyelmesen olvasd el. Regisztrációval, illetve az első belépéskor az elfogadással jogilag kötelező szerződés jön létre közted és az üzemeltető között.</p>

<h3>1. Az üzemeltető</h3>
<p>Az Oldalt ${c.v(c.op.nev, "név / cégnév")} (${c.v(c.op.cim, "cím")}; e-mail: ${c.mailto(c.op.email)}) üzemelteti (a továbbiakban: „Üzemeltető”, „mi”). Minden további adat az ${c.link("impresszum", "Impresszumban")} található.</p>

<h3>2. A szolgáltatás</h3>
<ul>
<li>Az IngatlanPro egy romániai ingatlanhirdetéseket összegyűjtő, kereshető és elemezhető felület: keresés, térkép, piaci elemzés, értékbecslés, saját hirdetések feladása, keresési igények, üzenetek, ingatlanirodák kezelése.</li>
<li>Az Oldalon a felhasználók által feladott hirdetések mellett <b>más, nyilvánosan elérhető hirdetési oldalakról átvett hirdetések</b> is megjelennek, a forrás megjelölésével és linkjével.</li>
<li>A szolgáltatás jelenleg <b>ingyenes</b>.</li>
<li><b>Az Üzemeltető nem ingatlanközvetítő</b>, nem képviseli egyik felet sem, és nem fél az adásvételi vagy bérleti szerződésekben. A felek közötti ügyletekért, a fizetésért és az ingatlan állapotáért nem vállalunk felelősséget.</li>
<li>A böngészéshez nem kell fiók. Hirdetésfeladáshoz, kedvencekhez, mentett kereséshez és üzenetküldéshez regisztrálni kell.</li>
</ul>

<h3>3. Regisztráció és fiók</h3>
<ul>
<li>Regisztrálni csak <b>${c.kor}. életévét betöltött</b>, cselekvőképes személy (vagy jogi személy nevében eljáró, arra jogosult képviselő) jogosult.</li>
<li>Valós adatokat kell megadnod, és azokat naprakészen kell tartanod. A jelszavadat tartsd titokban; a fiókodban történtekért te felelsz.</li>
<li>Google-fiókkal is beléphetsz; ilyenkor a Google a neved és az e-mail címed adja át nekünk.</li>
<li>A fiókodat bármikor törölheted (Fiókom → Profil). A törléssel a saját hirdetéseid, kedvenceid, mentett kereséseid, keresési igényeid és üzeneteid is törlődnek (az irodai hirdetések az irodánál maradnak).</li>
</ul>

<h3>4. Hirdetések feladása – a hirdető felelőssége</h3>
<p>Hirdetés feladásával kijelented és szavatolod, hogy:</p>
<ul>
<li>az ingatlan valóban létezik és elérhető, a hirdetés adatai (ár, méret, hely, állapot, fotók) <b>valósak, pontosak és nem megtévesztők</b>;</li>
<li>jogosult vagy a hirdetésre (tulajdonos vagy a tulajdonos megbízottja);</li>
<li>a feltöltött fotók és szövegek a tieid, vagy rendelkezel a felhasználási joggal, és nem sértik mások jogait (szerzői jog, személyiségi jog, magánszféra);</li>
<li>harmadik személy (pl. bérlő, szomszéd) személyes adatát csak jogalappal teszed közzé, és a fotókon felismerhető személyek, rendszámok nem szerepelnek hozzájárulás nélkül;</li>
<li>a jogszabály által a hirdetésben előírt adatokat (pl. ha kötelező, az energetikai tanúsítvány szerinti besorolást) feltünteted;</li>
<li>az ingatlanirodák és ügynökök betartják a tevékenységükre vonatkozó jogszabályokat, és az ügynökök adatait jogszerűen adják meg.</li>
</ul>
<p><b>Tilos</b>: hamis, nem létező vagy már nem elérhető ingatlan hirdetése; csalás vagy előleg kicsalása; megtévesztő ár vagy adat; ugyanannak az ingatlannak a többszöri feladása; hátrányos megkülönböztetést tartalmazó szöveg (pl. etnikai hovatartozás, vallás, nem, fogyatékosság, családi állapot alapján); gyűlöletkeltő, sértő, erőszakos vagy szexuális tartalom; más szolgáltatás reklámja; kéretlen üzenetek (spam); kártékony kód vagy linkek; bármely jogszabályba ütköző tartalom.</p>
<p>A hirdetésed megjelenítéséhez nem kizárólagos, ingyenes, a hirdetés fennállásáig tartó felhasználási jogot adsz nekünk (megjelenítés, átméretezés, térképen és listákban való megjelenítés). A hirdetések ár-, méret- és helyadatait <b>névtelenített, összesített piaci statisztikákban</b> a hirdetés törlése után is felhasználhatjuk.</p>

<h3>5. Más oldalakról átvett hirdetések</h3>
<p>A nyilvános hirdetési oldalakról átvett hirdetések adatai a forrásoldalon közzétett információn alapulnak. Ezeket automatikusan és kézzel is ellenőrizzük, de a helyességükért az eredeti hirdető felel; mindig ellenőrizd az eredeti hirdetést is. Ha a te hirdetésed, fotód vagy adatod jelent meg, és nem szeretnéd, hogy az Oldalon szerepeljen, jelezd a ${c.link("bejelentes", "Tartalom bejelentése")} űrlapon vagy e-mailben – haladéktalanul eltávolítjuk.</p>

<h3>6. Értékbecslő és piaci elemzés</h3>
<p>Az értékbecslő és a piaci statisztikák <b>tájékoztató jellegű, automatikus számítások</b> a hirdetési árak alapján. Nem minősülnek szakértői értékbecslésnek (pl. ANEVAR szerinti értékelésnek), nem használhatók hitelhez, hatósági vagy bírósági eljárásban, és nem befektetési tanácsok. Az ezek alapján hozott döntésekért nem vállalunk felelősséget.</p>

<h3>7. Keresési igények és üzenetek</h3>
<ul>
<li>A keresési igényed (mit, hol, milyen áron keresel) és a rövidített neved az Oldal többi felhasználója számára látható, hogy az eladók válaszolhassanak.</li>
<li>Az üzenetküldés csak ingatlannal kapcsolatos kommunikációra használható. Tilos a zaklatás, a kéretlen reklám és a felhasználók adatainak gyűjtése.</li>
<li>Az üzeneteket tároljuk. Beléjük csak visszaélés kivizsgálásakor, bejelentés alapján vagy jogszabályi kötelezettség miatt tekintünk bele.</li>
</ul>

<h3>8. Tartalommoderálás (DSA 14. cikk)</h3>
<p>A tartalmak ellenőrzéséhez a következő eszközöket használjuk:</p>
<ul>
<li><b>automatikus ellenőrzések</b>: hiányzó vagy irreális adatok (pl. irreális €/m² ár) jelzése, hely-ellenőrzés a térképen, ugyanazon ingatlan többszöri hirdetésének felismerése (fotók ujjlenyomata alapján);</li>
<li>${c.ai ? "<b>mesterséges intelligencia</b> által segített adat-ellenőrzés az átvett hirdetéseknél (javaslatot ad, a döntést ember hozza meg);" : "a jövőben mesterséges intelligencia által segített adat-ellenőrzés is (javaslatot ad, a döntést ember hozza meg);"}</li>
<li><b>emberi felülvizsgálat</b>: a bejelentéseket és a moderálási döntéseket az Üzemeltető személyesen bírálja el.</li>
</ul>
<p>Lehetséges intézkedések: a hirdetés javítása, jóváhagyásra várakoztatása, elrejtése vagy eltávolítása; üzenetküldés korlátozása; súlyos vagy ismételt jogsértésnél a fiók felfüggesztése vagy megszüntetése. Minden korlátozásról – ha elérhető vagy – <b>indoklást küldünk</b> (DSA 17. cikk): mit tettünk, milyen tények és milyen szabály alapján, és hogyan kérheted a felülvizsgálatot.</p>
<p><b>Panasz a döntés ellen</b>: válaszolj az értesítő levélre vagy írj a ${c.mailto(c.op.email)} címre; a döntést ember újra megvizsgálja, és indokolt esetben visszavonjuk. Emellett bírósághoz is fordulhatsz.</p>

<h3>9. Jogellenes tartalom bejelentése (DSA 16. cikk)</h3>
<p>Bárki – fiók nélkül is – bejelenthet jogellenesnek vagy a feltételekbe ütközőnek tartott tartalmat a ${c.link("bejelentes", "Tartalom bejelentése")} űrlapon. A bejelentésben add meg a tartalom pontos helyét (linkjét), azt, hogy miért tartod jogellenesnek, a neved és e-mail címed, valamint nyilatkozz arról, hogy a bejelentés jóhiszemű, pontos és teljes. A bejelentés beérkezését visszaigazoljuk, időben, gondosan és tárgyilagosan elbíráljuk, és a döntésről értesítünk. A nyilvánvalóan alaptalan bejelentések ismételt benyújtása esetén a további bejelentések feldolgozását felfüggeszthetjük.</p>

<h3>10. Felelősség</h3>
<ul>
<li>Az Oldalt „ahogy van” alapon nyújtjuk; törekszünk a folyamatos működésre, de a hibamentes, megszakítás nélküli elérhetőséget nem garantáljuk (karbantartás, a tárhelyszolgáltató hibája stb.).</li>
<li>A felhasználók és a más oldalak által közzétett tartalomért tárhelyszolgáltatóként csak akkor felelünk, ha tudomást szerzünk a jogellenességről, és nem lépünk haladéktalanul (EU 2022/2065 rendelet 6. cikk; román 365/2002 tv.).</li>
<li>Felelősségünket a jogszabályok által megengedett mértékig korlátozzuk. Ez nem vonatkozik a szándékosan vagy súlyos gondatlansággal okozott kárra, az életet, testi épséget, egészséget megsértő károkozásra, és nem érinti a fogyasztókat megillető, kötelező jogokat.</li>
<li>Kártérítéssel tartozol, ha a feltételek megszegésével vagy jogsértő tartalommal harmadik személynek kárt okozol, és emiatt velünk szemben igényt érvényesítenek.</li>
</ul>

<h3>11. Szellemi tulajdon</h3>
<p>Az Oldal megjelenése, programkódja, adatbázisa és saját szövegei az Üzemeltető szellemi tulajdonát képezik. A hirdetések szövegei és fotói a hirdetők (illetve a forrásoldalak hirdetőinek) tulajdonában maradnak. Az Oldalon használt nyílt forráskódú szoftverek és betűtípusok a saját licencük szerint használhatók.</p>

<h3>12. A szerződés megszűnése</h3>
<p>A szerződést bármikor, indoklás nélkül megszüntetheted a fiókod törlésével. Mi súlyos vagy ismételt szerződésszegés, jogellenes tevékenység, illetve a szolgáltatás megszüntetése esetén szüntethetjük meg vagy függeszthetjük fel a fiókot, indoklással; a szolgáltatás megszüntetéséről legalább 30 nappal előre értesítünk.</p>

<h3>13. A feltételek módosítása</h3>
<p>A feltételeket jogszabályváltozás, új funkció vagy biztonsági ok miatt módosíthatjuk. A lényeges változásokról az Oldalon és/vagy e-mailben előre értesítünk; a következő belépéskor az új változatot el kell fogadnod. Ha nem értesz egyet, a fiókodat törölheted.</p>

<h3>14. Irányadó jog, viták rendezése</h3>
<ul>
<li>A szerződésre a <b>román jog</b> az irányadó. Ha fogyasztó vagy, ez nem foszt meg a szokásos tartózkodási helyed szerinti ország kötelező fogyasztóvédelmi szabályaitól.</li>
<li>Vita esetén először írj nekünk – igyekszünk békésen rendezni. Ezt követően a hatáskörrel és illetékességgel rendelkező román bíróság jár el; fogyasztóként a lakóhelyed szerinti bírósághoz is fordulhatsz.</li>
${c.ceg ? `<li>Fogyasztói panasz esetén a Nemzeti Fogyasztóvédelmi Hatósághoz (ANPC, <a href="https://anpc.ro" target="_blank" rel="noopener">anpc.ro</a>) vagy alternatív vitarendezési fórumhoz (SAL) is fordulhatsz.</li>` : ""}
</ul>

<h3>15. Nyelv, kapcsolat</h3>
<p>A feltételek magyar, román és angol nyelven érhetők el; eltérés esetén a román nyelvű változat az irányadó. Kérdés, panasz: ${c.mailto(c.op.email)}.</p>`,

        adatvedelem: c => `
<p class="legalLead">Ez a tájékoztató elmondja, milyen személyes adatokat kezelünk, miért, milyen jogalapon, meddig, kinek adjuk át, és milyen jogaid vannak. Az EU általános adatvédelmi rendelete (GDPR, 2016/679) 13. és 14. cikke, valamint a román 190/2018. sz. törvény alapján készült.</p>

<h3>1. Az adatkezelő</h3>
<p>${c.v(c.op.nev, "név / cégnév")}, ${c.v(c.op.cim, "cím")}; e-mail: ${c.mailto(c.op.email)}${c.op.telefon ? `; telefon: ${c.e(c.op.telefon)}` : ""}. Adatvédelmi tisztviselő kinevezése a tevékenység jellege és mérete miatt nem kötelező; adatvédelmi kérdésben a fenti e-mail címen érsz el minket.</p>

<h3>2. Milyen adatokat, miért és meddig kezelünk</h3>
<div class="legalTableWrap"><table class="legalTable">
<thead><tr><th>Cél</th><th>Adatok</th><th>Jogalap (GDPR 6. cikk)</th><th>Meddig</th></tr></thead>
<tbody>
<tr><td>Az Oldal működtetése, biztonság, visszaélések kivédése</td><td>IP-cím, böngésző adatai, a kérés ideje és címe (a tárhelyszolgáltató naplói); IP-cím a belépési és bejelentési próbálkozások számlálásához</td><td>jogos érdek – (1) f)</td><td>A számláló csak a szerver memóriájában, legfeljebb 24 óráig; a tárhely naplói a szolgáltató beállításai szerint, rövid ideig. Adatbázisban IP-címet nem tárolunk.</td></tr>
<tr><td>Látogatottsági statisztika (sütik nélkül)</td><td>a megnézett oldal (hirdetésnél a száma), időpont, eszköz típusa (telefon / tablet / számítógép), nyelv, a hivatkozó oldal domainje; egy naponta változó, visszafejthetetlen azonosító, amelyet az IP-címből és a böngésző adataiból számolunk – magát az IP-címet nem tároljuk, és másnap ugyanaz a látogató már nem ismerhető fel</td><td>jogos érdek – (1) f): az oldal használatának és terhelésének megértése, fejlesztése</td><td>400 nap. A „Ne kövess” (Do Not Track) vagy Global Privacy Control beállítású böngészőket nem mérjük – így tiltakozhatsz.</td></tr>
<tr><td>Fiók, bejelentkezés</td><td>e-mail, név, jelszó (csak titkosított ujjlenyomatként – scrypt), telefonszám (ha megadod), Google-azonosító (Google-belépésnél), regisztráció és utolsó belépés ideje, a feltételek elfogadásának ideje, értesítési beállítás; bejelentkezési azonosító (sütiben; nálunk csak titkosítva)</td><td>szerződés teljesítése – (1) b)</td><td>A fiók törléséig; a bejelentkezés 60 nap után vagy kilépéskor lejár.</td></tr>
<tr><td>Hirdetések feladása és megjelenítése</td><td>a hirdetés adatai, leírása, fotói, az ingatlan helye; a hirdető neve; irodai hirdetésnél az iroda és az ügynök neve, telefonszáma, e-mail címe – <b>ezek nyilvánosak</b></td><td>szerződés – (1) b)</td><td>A hirdetés vagy a fiók törléséig. Az ár-, méret- és helyadatok névtelenített statisztikákban tovább megmaradhatnak.</td></tr>
<tr><td>Kedvencek, mentett keresések, e-mail értesítések</td><td>a kiválasztott hirdetések, a keresés szűrői, az utolsó értesítés ideje</td><td>szerződés – (1) b)</td><td>A törlésig / a fiók törléséig. Az e-mail értesítések a Fiókomban kikapcsolhatók.</td></tr>
<tr><td>Keresési igények, üzenetek</td><td>az igény tartalma és rövidített neved (nyilvános); az üzenetek szövege, feladója, címzettje, ideje</td><td>szerződés – (1) b)</td><td>Amíg törlöd, illetve amíg bármelyik fél törli a fiókját.</td></tr>
<tr><td>Ingatlanirodák</td><td>az iroda adatai; az ügynökök neve, telefonszáma, e-mail címe (az iroda adja meg, és ő felel a jogszerűségéért)</td><td>szerződés – (1) b); az ügynököknél az iroda jogos érdeke – (1) f)</td><td>Az iroda, az ügynök vagy a fiók törléséig.</td></tr>
<tr><td>Más oldalakról átvett nyilvános hirdetések (GDPR 14. cikk)</td><td>a hirdetés adatai, leírása, fotói és linkje; ha a hirdető a szövegben megadta, a neve vagy elérhetősége</td><td>jogos érdek – (1) f): a romániai ingatlanpiac átlátható, egy helyen kereshető áttekintése</td><td>Amíg a hirdetés a forrásoldalon elérhető, utána legfeljebb 12 hónapig (piaci előzmények); tiltakozásra haladéktalanul töröljük.</td></tr>
<tr><td>Tartalom-bejelentések kezelése (DSA 16–17. cikk)</td><td>a bejelentő neve, e-mail címe, a bejelentés tartalma, a döntés és indoklása</td><td>jogi kötelezettség – (1) c)</td><td>A döntéstől számított 2 évig.</td></tr>
<tr><td>A süti-választásod igazolása</td><td>véletlen azonosító, a választásod, az időpont (IP-cím és fiók nélkül)</td><td>jogi kötelezettség – (1) c), GDPR 7. cikk (1)</td><td>3 évig; a böngésződben 12 hónapig.</td></tr>
<tr><td>Kapcsolattartás, kérések intézése</td><td>név, e-mail cím, a levél tartalma</td><td>jogos érdek – (1) f); adatvédelmi kérésnél jogi kötelezettség – (1) c)</td><td>Az ügy lezárását követő 1 évig.</td></tr>
</tbody></table></div>
<p>A jogos érdeken alapuló adatkezeléseknél mérlegeltük, hogy az érdekünk nem sérti aránytalanul a jogaidat; a mérlegelésről kérésre tájékoztatást adunk. Adataidat nem adjuk el, és reklámcélra nem használjuk.</p>

<h3>3. Honnan származnak az adatok</h3>
<p>Az adatok nagy részét te adod meg. A Google-belépésnél a Google adja át a neved, e-mail címed és Google-azonosítódat. Az átvett hirdetések adatai nyilvánosan elérhető romániai hirdetési oldalakról származnak (pl. Imobiliare.ro, Storia, OLX, Publi24, Homezz, Anuntul.ro, LaJumate, Romimo, Imoradar24) – a forrást minden hirdetésnél feltüntetjük.</p>

<h3>4. Kinek adjuk át (adatfeldolgozók, címzettek)</h3>
<ul>
<li><b>Render Services, Inc.</b> (USA) – a weboldal tárhelye.</li>
<li><b>Neon</b> – adatbázis; az adatok helye: ${c.e(c.db)}.</li>
${c.mail === "brevo" ? "<li><b>Brevo (Sendinblue SAS)</b> (Franciaország, EU) – e-mail értesítések küldése.</li>" : ""}
${c.mail === "resend" ? "<li><b>Resend, Inc.</b> (USA) – e-mail értesítések küldése.</li>" : ""}
${c.google ? "<li><b>Google Ireland Ltd.</b> / Google LLC – Google-belépés (csak ha használod, és a Google-gombhoz hozzájárultál).</li>" : ""}
${c.ai ? "<li><b>Anthropic PBC</b> (USA) – az átvett hirdetések szövegének mesterséges intelligenciával segített ellenőrzése (felhasználói fiókadatot nem kap).</li>" : ""}
<li><b>OpenStreetMap Foundation</b> (Egyesült Királyság) – térképcsempék és címek helymeghatározása (a térkép betöltésekor az IP-címedet látja; hirdetéseknél a címet kapja meg).</li>
<li><b>jsDelivr</b> és <b>cdnjs (Cloudflare)</b> – a weboldal programkönyvtárainak kiszolgálása (IP-cím); <b>Unsplash</b> – a kezdőlap illusztrációs fotói (IP-cím).</li>
<li>Hatóságok – csak jogszabályi kötelezettség alapján.</li>
</ul>
<p>A betűtípust a saját szerverünkről töltjük, így a Google Fonts nem kap adatot.</p>

<h3>5. Adattovábbítás az EU-n kívülre</h3>
<p>Az Amerikai Egyesült Államokba történő továbbítás az Európai Bizottság EU–USA adatvédelmi keretrendszerről szóló megfelelőségi határozata alapján (ha a szolgáltató tanúsított), egyébként a Bizottság által elfogadott általános adatvédelmi kikötések (SCC) alapján történik. Az Egyesült Királyságra megfelelőségi határozat vonatkozik.</p>

<h3>6. Automatizált döntéshozatal</h3>
<p>Rólad automatizált, joghatással járó döntést (profilalkotást) nem hozunk. Az automatikus ellenőrzések a hirdetések adataira vonatkoznak; a moderálási döntéseket ember hozza meg. Az értékbecslő az ingatlanokról ad becslést, nem rólad.</p>

<h3>7. Sütik</h3>
<p>Csak a működéshez szükséges sütiket használunk; a Google-belépés sütijeit csak a hozzájárulásoddal töltjük be. Részletek: ${c.link("sutik", "Süti-tájékoztató")}.</p>

<h3>8. Adatbiztonság</h3>
<p>Titkosított (HTTPS) kapcsolatot használunk; a jelszavakat és a bejelentkezési azonosítókat csak visszafejthetetlen ujjlenyomatként tároljuk; a belépési próbálkozásokat korlátozzuk; az adatbázishoz csak az Üzemeltető fér hozzá. Adatvédelmi incidens esetén a jogszabály szerint értesítjük a hatóságot és – magas kockázat esetén – téged is.</p>

<h3>9. A jogaid</h3>
<ul>
<li><b>Hozzáférés</b> (15. cikk) és <b>adathordozhatóság</b> (20. cikk): bejelentkezve ezen az oldalon egy kattintással letöltheted az összes adatodat.</li>
<li><b>Helyesbítés</b> (16. cikk): a Fiókomban javíthatod, vagy írj nekünk.</li>
<li><b>Törlés</b> (17. cikk): a fiókodat bármikor törölheted (Fiókom → Profil), vagy kérheted e-mailben.</li>
<li><b>Korlátozás</b> (18. cikk) és <b>tiltakozás</b> (21. cikk) – különösen a jogos érdeken alapuló kezelés (pl. átvett hirdetés) ellen.</li>
<li><b>Hozzájárulás visszavonása</b> (7. cikk (3)): a süti-beállításokat bármikor megváltoztathatod; ez nem érinti a korábbi kezelés jogszerűségét.</li>
</ul>
<p>Kérésedre legkésőbb <b>egy hónapon belül</b> válaszolunk (indokolt esetben ez további két hónappal meghosszabbítható). A kérés díjtalan. Azonosításod érdekében a fiókodhoz tartozó e-mail címről írj.</p>
<p><b>Panasz</b>: a romániai adatvédelmi hatóságnál – Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP), B-dul G-ral. Gheorghe Magheru 28-30, 1. kerület, 010336 București, <a href="https://www.dataprotection.ro" target="_blank" rel="noopener">dataprotection.ro</a>, anspdcp@dataprotection.ro –, vagy a lakóhelyed / munkahelyed szerinti uniós adatvédelmi hatóságnál (Magyarországon: NAIH, naih.hu). Bírósághoz is fordulhatsz.</p>

<h3>10. Kiskorúak</h3>
<p>Az Oldal ${c.kor} év felettieknek szól; ennél fiatalabb személyek adatait tudatosan nem kezeljük. Ha ilyenről tudomást szerzünk, töröljük.</p>

<h3>11. Módosítás</h3>
<p>A tájékoztatót a jogszabályok vagy a szolgáltatás változásakor frissítjük. A lényeges változásokról előre értesítünk.</p>`,

        sutik: c => `
<p class="legalLead">A süti (cookie) egy kis adat, amelyet a weboldal a böngésződben tárol. Hasonlóan működik a böngésző helyi tárolója (localStorage) is. Az EU e-adatvédelmi irányelve (2002/58/EK) és a román 506/2004. sz. törvény 4. cikke szerint a működéshez feltétlenül szükséges sütikhez nem kell hozzájárulás, minden máshoz igen.</p>

<h3>Összefoglalva</h3>
<ul>
<li>Az IngatlanPro <b>nem használ</b> statisztikai (analitikai), reklám- vagy követő sütiket.</li>
<li>Csak a működéshez szükséges sütiket és tárolót használjuk.</li>
<li>A látogatottságot <b>sütik nélkül</b>, a böngésződben semmit nem tárolva mérjük (részletek az ${c.link("adatvedelem", "Adatvédelmi tájékoztatóban")}).</li>
<li>A Google-belépés gomb a Google saját sütijeit használja – ezt <b>csak a hozzájárulásoddal</b> töltjük be.</li>
</ul>

<h3>Feltétlenül szükséges (mindig aktív)</h3>
<div class="legalTableWrap"><table class="legalTable">
<thead><tr><th>Név</th><th>Típus</th><th>Cél</th><th>Időtartam</th></tr></thead>
<tbody>
<tr><td><code>ipsid</code></td><td>süti (HttpOnly, saját)</td><td>bejelentkezés megtartása</td><td>60 nap, vagy kilépésig</td></tr>
<tr><td><code>ipnezet</code></td><td>süti (saját)</td><td>csak adminoknak: a felhasználói nézet kipróbálása</td><td>1 nap</td></tr>
<tr><td><code>lang</code></td><td>helyi tároló</td><td>a választott nyelv</td><td>amíg törlöd</td></tr>
<tr><td><code>theme</code></td><td>helyi tároló</td><td>világos / sötét mód</td><td>amíg törlöd</td></tr>
<tr><td><code>ipConsent</code></td><td>helyi tároló</td><td>a süti-választásod megjegyzése</td><td>12 hónap</td></tr>
</tbody></table></div>

<h3>Hozzájárulással: Google-belépés</h3>
<div class="legalTableWrap"><table class="legalTable">
<thead><tr><th>Szolgáltató</th><th>Cél</th><th>Részletek</th></tr></thead>
<tbody>
<tr><td>Google (accounts.google.com)</td><td>„Folytatás Google-fiókkal” gomb és bejelentkezés</td><td>A sütiket a Google helyezi el, saját szabályai szerint: <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noopener">policies.google.com/technologies/cookies</a></td></tr>
</tbody></table></div>
<p>Hozzájárulás nélkül is beléphetsz e-mail címmel és jelszóval.</p>

<h3>Külső tartalmak sütik nélkül</h3>
<p>A térkép (OpenStreetMap), a programkönyvtárak (jsDelivr, cdnjs) és a kezdőlap fotói (Unsplash) külső szerverről töltődnek be; ezek a szolgáltatók a betöltéshez látják az IP-címedet, de mi nem helyezünk el általuk sütit. Lásd: ${c.link("adatvedelem", "Adatvédelmi tájékoztató")}.</p>

<h3>A választásod módosítása</h3>
<p>A választásodat bármikor megváltoztathatod vagy visszavonhatod: <button type="button" class="btn btn-sm btn-outline-primary" data-consent-open>Süti-beállítások</button>. A böngésződben is törölheted a sütiket és a helyi tárolót; a már elhelyezett Google-sütiket a Google-fiókodban vagy a böngésződben törölheted.</p>`

    },

    // ================================================================== ROMÂNĂ
    ro: {

        impresszum: c => `
<p class="legalLead">Datele de identificare și de contact ale operatorului site-ului IngatlanPro.</p>

<h3>Operator (furnizor de servicii și operator de date)</h3>
<table class="legalTable legalKV">
<tr><th>Nume / denumire</th><td>${c.v(c.op.nev, "nume / denumire")}</td></tr>
<tr><th>${c.ceg ? "Sediu" : "Adresă"}</th><td>${c.v(c.op.cim, "adresă poștală")}</td></tr>
<tr><th>E-mail</th><td>${c.mailto(c.op.email)}</td></tr>
${c.op.telefon ? `<tr><th>Telefon</th><td>${c.e(c.op.telefon)}</td></tr>` : ""}
${c.ceg ? `<tr><th>Nr. Reg. Com.</th><td>${c.v(c.op.cegjegyzekszam, "Nr. Reg. Com.")}</td></tr>
<tr><th>CUI / CIF</th><td>${c.v(c.op.adoszam, "CUI / CIF")}</td></tr>` : ""}
<tr><th>Site</th><td>${c.e(location.origin)}</td></tr>
</table>

<h3>Găzduire și bază de date</h3>
<p>Furnizor de găzduire: <b>Render Services, Inc.</b> (SUA) – render.com.<br>
Bază de date: <b>Neon</b> – neon.com, locația datelor: ${c.e(c.db)}.</p>

<h3>Punct de contact (Regulamentul (UE) 2022/2065 – DSA, art. 11 și 12)</h3>
<p>Autoritățile, Comisia Europeană și utilizatorii ne pot contacta direct, pe cale electronică, la: ${c.mailto(c.op.email)}.
Limbi de comunicare: <b>română, maghiară, engleză</b>. Comunicarea nu se bazează exclusiv pe instrumente automatizate.</p>

<h3>Semnalarea conținutului ilegal</h3>
<p>Dacă observați pe site conținut ilegal, înșelător sau care vă încalcă drepturile (de ex. fotografiile sau datele dvs.), semnalați-l prin formularul ${c.link("bejelentes", "Semnalează conținut")} sau prin e-mail.</p>

<h3>Tarife</h3>
<p>Utilizarea IngatlanPro este în prezent <b>gratuită</b>. Dacă acest lucru se schimbă, tarifele (inclusiv TVA) vor fi comunicate în prealabil, în mod vizibil.</p>

${c.ceg ? `<h3>Protecția consumatorilor</h3>
<p>Autoritatea Națională pentru Protecția Consumatorilor (ANPC): <a href="https://anpc.ro" target="_blank" rel="noopener">anpc.ro</a> ·
Soluționarea alternativă a litigiilor (SAL): <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener">anpc.ro/ce-este-sal</a></p>` : ""}

<h3>Documente juridice</h3>
<ul>
<li>${c.link("aszf", "Termeni și condiții")}</li>
<li>${c.link("adatvedelem", "Politica de confidențialitate")}</li>
<li>${c.link("sutik", "Politica de cookie-uri")}</li>
</ul>`,

        aszf: c => `
<p class="legalLead">Acești termeni reglementează utilizarea site-ului IngatlanPro („Site-ul”). Vă rugăm să îi citiți cu atenție. Prin înregistrare, respectiv prin acceptare la prima autentificare, se încheie un contract obligatoriu între dvs. și operator.</p>

<h3>1. Operatorul</h3>
<p>Site-ul este operat de ${c.v(c.op.nev, "nume / denumire")} (${c.v(c.op.cim, "adresă")}; e-mail: ${c.mailto(c.op.email)}) („Operatorul”, „noi”). Celelalte date se găsesc în pagina ${c.link("impresszum", "Date de identificare")}.</p>

<h3>2. Serviciul</h3>
<ul>
<li>IngatlanPro este o platformă care reunește, face căutabile și analizează anunțuri imobiliare din România: căutare, hartă, analiză de piață, estimare de preț, publicarea propriilor anunțuri, cereri de căutare, mesaje, gestionarea agențiilor imobiliare.</li>
<li>Pe lângă anunțurile publicate de utilizatori, pe Site apar și <b>anunțuri preluate de pe alte site-uri de anunțuri accesibile public</b>, cu indicarea sursei și link către anunțul original.</li>
<li>Serviciul este în prezent <b>gratuit</b>.</li>
<li><b>Operatorul nu este agent imobiliar</b>, nu reprezintă niciuna dintre părți și nu este parte în contractele de vânzare-cumpărare sau de închiriere. Nu răspundem pentru tranzacțiile dintre părți, plăți sau starea imobilelor.</li>
<li>Pentru navigare nu este nevoie de cont. Pentru publicarea anunțurilor, favorite, căutări salvate și mesaje este necesară înregistrarea.</li>
</ul>

<h3>3. Înregistrare și cont</h3>
<ul>
<li>Se pot înregistra doar persoanele care au împlinit <b>${c.kor} ani</b> și au capacitate de exercițiu deplină (sau reprezentanții autorizați ai unei persoane juridice).</li>
<li>Trebuie să furnizați date reale și să le mențineți actualizate. Păstrați parola secretă; răspundeți pentru activitatea din contul dvs.</li>
<li>Vă puteți autentifica și cu un cont Google; în acest caz Google ne transmite numele și adresa de e-mail.</li>
<li>Vă puteți șterge contul oricând (Contul meu → Profil). La ștergere se șterg și anunțurile, favoritele, căutările salvate, cererile și mesajele dvs. (anunțurile agenției rămân la agenție).</li>
</ul>

<h3>4. Publicarea anunțurilor – răspunderea celui care publică</h3>
<p>Prin publicarea unui anunț declarați și garantați că:</p>
<ul>
<li>imobilul există și este disponibil, iar datele anunțului (preț, suprafață, locație, stare, fotografii) sunt <b>reale, corecte și nu induc în eroare</b>;</li>
<li>aveți dreptul să publicați anunțul (proprietar sau mandatar al proprietarului);</li>
<li>fotografiile și textele vă aparțin sau aveți dreptul de utilizare și nu încalcă drepturile altora (drept de autor, drepturi ale personalității, viață privată);</li>
<li>publicați date personale ale unor terți (de ex. chiriași, vecini) doar cu temei legal, iar în fotografii nu apar, fără acord, persoane identificabile sau numere de înmatriculare;</li>
<li>indicați informațiile impuse de lege în anunț (de ex., acolo unde este obligatoriu, clasa energetică din certificatul de performanță energetică);</li>
<li>agențiile și agenții imobiliari respectă legislația aplicabilă activității lor și furnizează în mod legal datele agenților.</li>
</ul>
<p><b>Este interzis</b>: publicarea unor imobile false, inexistente sau indisponibile; frauda sau obținerea de avansuri prin înșelăciune; prețuri sau date înșelătoare; publicarea repetată a aceluiași imobil; texte discriminatorii (de ex. pe criterii de etnie, religie, sex, dizabilitate, stare civilă); conținut care incită la ură, jignitor, violent sau sexual; reclama altor servicii; mesaje nesolicitate (spam); cod sau linkuri malițioase; orice conținut contrar legii.</p>
<p>Ne acordați un drept de utilizare neexclusiv, gratuit, pe durata existenței anunțului, pentru afișarea acestuia (afișare, redimensionare, afișare pe hartă și în liste). Datele de preț, suprafață și locație pot fi folosite, și după ștergerea anunțului, în <b>statistici de piață anonimizate și agregate</b>.</p>

<h3>5. Anunțuri preluate de pe alte site-uri</h3>
<p>Datele anunțurilor preluate de pe site-uri publice de anunțuri se bazează pe informațiile publicate pe site-ul sursă. Le verificăm automat și manual, dar corectitudinea lor este responsabilitatea celui care a publicat anunțul original; verificați întotdeauna și anunțul original. Dacă anunțul, fotografia sau datele dvs. apar pe Site și nu doriți acest lucru, semnalați-ne prin formularul ${c.link("bejelentes", "Semnalează conținut")} sau prin e-mail – le vom elimina fără întârziere.</p>

<h3>6. Estimarea de preț și analiza de piață</h3>
<p>Estimatorul și statisticile de piață sunt <b>calcule automate, cu caracter informativ</b>, pe baza prețurilor din anunțuri. Nu constituie evaluare realizată de un evaluator autorizat (de ex. ANEVAR), nu pot fi folosite pentru credite, proceduri administrative sau judiciare și nu reprezintă consultanță de investiții. Nu răspundem pentru deciziile luate pe baza lor.</p>

<h3>7. Cereri de căutare și mesaje</h3>
<ul>
<li>Cererea dvs. de căutare (ce, unde și la ce preț căutați) și numele dvs. prescurtat sunt vizibile celorlalți utilizatori, pentru ca vânzătorii să vă poată răspunde.</li>
<li>Mesajele pot fi folosite doar pentru comunicări legate de imobile. Sunt interzise hărțuirea, reclama nesolicitată și colectarea datelor utilizatorilor.</li>
<li>Mesajele sunt stocate. Le accesăm doar pentru investigarea abuzurilor, în urma unei sesizări sau în baza unei obligații legale.</li>
</ul>

<h3>8. Moderarea conținutului (DSA, art. 14)</h3>
<p>Pentru verificarea conținutului folosim următoarele instrumente:</p>
<ul>
<li><b>verificări automate</b>: semnalarea datelor lipsă sau nerealiste (de ex. preț/m² nerealist), verificarea locației pe hartă, recunoașterea anunțurilor duplicate (pe baza amprentei fotografiilor);</li>
<li>${c.ai ? "verificarea datelor anunțurilor preluate cu ajutorul <b>inteligenței artificiale</b> (oferă sugestii, decizia o ia un om);" : "în viitor, verificarea datelor cu ajutorul inteligenței artificiale (oferă sugestii, decizia o ia un om);"}</li>
<li><b>verificare umană</b>: sesizările și deciziile de moderare sunt analizate personal de Operator.</li>
</ul>
<p>Măsuri posibile: corectarea anunțului, trecerea lui în așteptarea aprobării, ascunderea sau eliminarea lui; restricționarea mesajelor; în cazul încălcărilor grave sau repetate, suspendarea sau închiderea contului. Pentru orice restricție vă trimitem – dacă avem datele de contact – o <b>motivare</b> (DSA, art. 17): ce am făcut, pe baza căror fapte și reguli și cum puteți cere reanalizarea.</p>
<p><b>Contestarea deciziei</b>: răspundeți la e-mailul de notificare sau scrieți la ${c.mailto(c.op.email)}; decizia este reanalizată de un om și, dacă este cazul, revocată. Vă puteți adresa și instanței.</p>

<h3>9. Semnalarea conținutului ilegal (DSA, art. 16)</h3>
<p>Oricine – și fără cont – poate semnala conținut pe care îl consideră ilegal sau contrar termenilor prin formularul ${c.link("bejelentes", "Semnalează conținut")}. Indicați locația exactă (linkul) conținutului, motivul pentru care îl considerați ilegal, numele și adresa de e-mail și declarați că sesizarea este făcută cu bună-credință și că informațiile sunt corecte și complete. Confirmăm primirea sesizării, o analizăm în timp util, cu diligență și obiectivitate, și vă informăm despre decizie. În cazul trimiterii repetate de sesizări vădit nefondate, putem suspenda procesarea acestora.</p>

<h3>10. Răspundere</h3>
<ul>
<li>Site-ul este oferit „ca atare”; ne străduim să funcționeze continuu, dar nu garantăm disponibilitatea fără erori sau întreruperi (mentenanță, defecțiuni ale furnizorului de găzduire etc.).</li>
<li>Pentru conținutul publicat de utilizatori și de alte site-uri răspundem, în calitate de furnizor de găzduire, doar dacă luăm cunoștință de caracterul ilegal și nu acționăm prompt (Regulamentul (UE) 2022/2065, art. 6; Legea nr. 365/2002).</li>
<li>Răspunderea noastră este limitată în măsura permisă de lege. Limitarea nu se aplică prejudiciilor cauzate cu intenție sau din culpă gravă, vătămării vieții, integrității corporale sau sănătății și nu afectează drepturile imperative ale consumatorilor.</li>
<li>Răspundeți pentru prejudiciile cauzate terților prin încălcarea termenilor sau prin conținut ilegal, dacă aceștia formulează pretenții împotriva noastră.</li>
</ul>

<h3>11. Proprietate intelectuală</h3>
<p>Aspectul, codul, baza de date și textele proprii ale Site-ului aparțin Operatorului. Textele și fotografiile anunțurilor rămân ale celor care le-au publicat (respectiv ale autorilor anunțurilor de pe site-urile sursă). Programele și fonturile open-source folosite pot fi utilizate conform licențelor lor.</p>

<h3>12. Încetarea contractului</h3>
<p>Puteți înceta contractul oricând, fără motiv, prin ștergerea contului. Noi putem închide sau suspenda contul, motivat, în caz de încălcări grave sau repetate, activitate ilegală sau încetarea serviciului; despre încetarea serviciului vă anunțăm cu cel puțin 30 de zile înainte.</p>

<h3>13. Modificarea termenilor</h3>
<p>Putem modifica termenii ca urmare a schimbărilor legislative, a unor funcții noi sau din motive de securitate. Despre modificările esențiale vă informăm în prealabil pe Site și/sau prin e-mail; la următoarea autentificare trebuie să acceptați noua versiune. Dacă nu sunteți de acord, vă puteți șterge contul.</p>

<h3>14. Legea aplicabilă, soluționarea litigiilor</h3>
<ul>
<li>Contractul este guvernat de <b>legea română</b>. Dacă sunteți consumator, nu sunteți lipsit de protecția normelor imperative din țara reședinței dvs. obișnuite.</li>
<li>În caz de litigiu, scrieți-ne mai întâi – încercăm soluționarea amiabilă. Ulterior, este competentă instanța română; în calitate de consumator vă puteți adresa și instanței de la domiciliul dvs.</li>
${c.ceg ? `<li>Pentru reclamații ale consumatorilor vă puteți adresa ANPC (<a href="https://anpc.ro" target="_blank" rel="noopener">anpc.ro</a>) sau unei entități de soluționare alternativă a litigiilor (SAL).</li>` : ""}
</ul>

<h3>15. Limbă, contact</h3>
<p>Termenii sunt disponibili în limbile română, maghiară și engleză; în caz de neconcordanță, prevalează versiunea în limba română. Întrebări, reclamații: ${c.mailto(c.op.email)}.</p>`,

        adatvedelem: c => `
<p class="legalLead">Această politică explică ce date personale prelucrăm, de ce, în ce temei, cât timp, cui le transmitem și ce drepturi aveți. A fost întocmită în baza art. 13 și 14 din Regulamentul general privind protecția datelor (GDPR, (UE) 2016/679) și a Legii nr. 190/2018.</p>

<h3>1. Operatorul de date</h3>
<p>${c.v(c.op.nev, "nume / denumire")}, ${c.v(c.op.cim, "adresă")}; e-mail: ${c.mailto(c.op.email)}${c.op.telefon ? `; telefon: ${c.e(c.op.telefon)}` : ""}. Desemnarea unui responsabil cu protecția datelor nu este obligatorie, dată fiind natura și dimensiunea activității; pentru întrebări privind datele personale ne găsiți la adresa de e-mail de mai sus.</p>

<h3>2. Ce date prelucrăm, de ce și cât timp</h3>
<div class="legalTableWrap"><table class="legalTable">
<thead><tr><th>Scop</th><th>Date</th><th>Temei (GDPR art. 6)</th><th>Durată</th></tr></thead>
<tbody>
<tr><td>Funcționarea Site-ului, securitate, prevenirea abuzurilor</td><td>adresa IP, date despre browser, ora și adresa cererii (jurnalele furnizorului de găzduire); adresa IP pentru numărarea încercărilor de autentificare și de sesizare</td><td>interes legitim – alin. (1) lit. f)</td><td>Contorul doar în memoria serverului, maximum 24 de ore; jurnalele de găzduire conform setărilor furnizorului, pe termen scurt. Nu stocăm adrese IP în baza de date.</td></tr>
<tr><td>Statistici de vizitare (fără cookie-uri)</td><td>pagina vizitată (la anunțuri, numărul acestuia), ora, tipul dispozitivului (telefon / tabletă / calculator), limba, domeniul site-ului de proveniență; un identificator ireversibil, care se schimbă zilnic, calculat din adresa IP și datele browserului – adresa IP în sine nu este stocată, iar a doua zi același vizitator nu mai poate fi recunoscut</td><td>interes legitim – lit. f): înțelegerea și îmbunătățirea utilizării și a încărcării site-ului</td><td>400 de zile. Browserele cu „Do Not Track” sau Global Privacy Control nu sunt măsurate – astfel vă puteți opune.</td></tr>
<tr><td>Cont, autentificare</td><td>e-mail, nume, parolă (doar ca amprentă criptată – scrypt), telefon (dacă îl furnizați), identificator Google (la autentificarea cu Google), data înregistrării și a ultimei autentificări, data acceptării termenilor, setarea notificărilor; identificatorul de sesiune (în cookie; la noi doar criptat)</td><td>executarea contractului – lit. b)</td><td>Până la ștergerea contului; sesiunea expiră după 60 de zile sau la deconectare.</td></tr>
<tr><td>Publicarea și afișarea anunțurilor</td><td>datele, descrierea și fotografiile anunțului, locația imobilului; numele celui care publică; la anunțurile agențiilor, numele, telefonul și e-mailul agenției și al agentului – <b>acestea sunt publice</b></td><td>contract – lit. b)</td><td>Până la ștergerea anunțului sau a contului. Prețul, suprafața și locația pot rămâne în statistici anonimizate.</td></tr>
<tr><td>Favorite, căutări salvate, notificări prin e-mail</td><td>anunțurile alese, filtrele căutării, data ultimei notificări</td><td>contract – lit. b)</td><td>Până la ștergere / ștergerea contului. Notificările pot fi dezactivate în Contul meu.</td></tr>
<tr><td>Cereri de căutare, mesaje</td><td>conținutul cererii și numele prescurtat (public); textul, expeditorul, destinatarul și data mesajelor</td><td>contract – lit. b)</td><td>Până la ștergere, respectiv până când oricare dintre părți își șterge contul.</td></tr>
<tr><td>Agenții imobiliare</td><td>datele agenției; numele, telefonul și e-mailul agenților (furnizate de agenție, care răspunde de legalitate)</td><td>contract – lit. b); pentru agenți, interesul legitim al agenției – lit. f)</td><td>Până la ștergerea agenției, a agentului sau a contului.</td></tr>
<tr><td>Anunțuri publice preluate de pe alte site-uri (GDPR art. 14)</td><td>datele, descrierea, fotografiile și linkul anunțului; numele sau datele de contact ale celui care a publicat, dacă apar în text</td><td>interes legitim – lit. f): o imagine transparentă, căutabilă într-un singur loc, a pieței imobiliare din România</td><td>Cât timp anunțul este disponibil pe site-ul sursă, apoi maximum 12 luni (istoric de piață); la opoziție, ștergem fără întârziere.</td></tr>
<tr><td>Gestionarea sesizărilor (DSA art. 16–17)</td><td>numele și e-mailul celui care sesizează, conținutul sesizării, decizia și motivarea</td><td>obligație legală – lit. c)</td><td>2 ani de la decizie.</td></tr>
<tr><td>Dovada alegerii privind cookie-urile</td><td>identificator aleatoriu, alegerea dvs., data (fără IP și fără cont)</td><td>obligație legală – lit. c), GDPR art. 7 alin. (1)</td><td>3 ani; în browser 12 luni.</td></tr>
<tr><td>Corespondență, soluționarea cererilor</td><td>nume, e-mail, conținutul mesajului</td><td>interes legitim – lit. f); pentru cereri GDPR, obligație legală – lit. c)</td><td>1 an de la închiderea cazului.</td></tr>
</tbody></table></div>
<p>Pentru prelucrările bazate pe interes legitim am evaluat că interesul nostru nu vă afectează în mod disproporționat drepturile; la cerere, vă informăm despre această evaluare. Nu vindem datele dvs. și nu le folosim în scop publicitar.</p>

<h3>3. Sursa datelor</h3>
<p>Majoritatea datelor ni le furnizați dvs. La autentificarea cu Google, Google ne transmite numele, adresa de e-mail și identificatorul Google. Datele anunțurilor preluate provin de pe site-uri de anunțuri din România accesibile public (de ex. Imobiliare.ro, Storia, OLX, Publi24, Homezz, Anuntul.ro, LaJumate, Romimo, Imoradar24) – sursa este indicată la fiecare anunț.</p>

<h3>4. Destinatari (persoane împuternicite)</h3>
<ul>
<li><b>Render Services, Inc.</b> (SUA) – găzduirea site-ului.</li>
<li><b>Neon</b> – baza de date; locația datelor: ${c.e(c.db)}.</li>
${c.mail === "brevo" ? "<li><b>Brevo (Sendinblue SAS)</b> (Franța, UE) – trimiterea notificărilor prin e-mail.</li>" : ""}
${c.mail === "resend" ? "<li><b>Resend, Inc.</b> (SUA) – trimiterea notificărilor prin e-mail.</li>" : ""}
${c.google ? "<li><b>Google Ireland Ltd.</b> / Google LLC – autentificarea cu Google (doar dacă o folosiți și ați consimțit la butonul Google).</li>" : ""}
${c.ai ? "<li><b>Anthropic PBC</b> (SUA) – verificarea textului anunțurilor preluate cu ajutorul inteligenței artificiale (nu primește date din conturile utilizatorilor).</li>" : ""}
<li><b>OpenStreetMap Foundation</b> (Regatul Unit) – hărți și geocodarea adreselor (la încărcarea hărții vede adresa IP; pentru anunțuri primește adresa).</li>
<li><b>jsDelivr</b> și <b>cdnjs (Cloudflare)</b> – livrarea bibliotecilor site-ului (adresa IP); <b>Unsplash</b> – fotografiile ilustrative de pe pagina principală (adresa IP).</li>
<li>Autorități – doar în baza unei obligații legale.</li>
</ul>
<p>Fontul este încărcat de pe serverul nostru, astfel Google Fonts nu primește date.</p>

<h3>5. Transferuri în afara UE</h3>
<p>Transferurile către Statele Unite au loc în baza deciziei de adecvare a Comisiei Europene privind Cadrul UE–SUA de protecție a datelor (dacă furnizorul este certificat), altfel în baza clauzelor contractuale standard (SCC) adoptate de Comisie. Pentru Regatul Unit există o decizie de adecvare.</p>

<h3>6. Decizii automatizate</h3>
<p>Nu luăm decizii automatizate cu efecte juridice asupra dvs. (profilare). Verificările automate privesc datele anunțurilor; deciziile de moderare sunt luate de un om. Estimatorul oferă estimări despre imobile, nu despre dvs.</p>

<h3>7. Cookie-uri</h3>
<p>Folosim doar cookie-urile necesare funcționării; cookie-urile pentru autentificarea cu Google sunt încărcate doar cu consimțământul dvs. Detalii: ${c.link("sutik", "Politica de cookie-uri")}.</p>

<h3>8. Securitatea datelor</h3>
<p>Folosim conexiune criptată (HTTPS); parolele și identificatorii de sesiune sunt stocați doar ca amprente ireversibile; limităm încercările de autentificare; la baza de date are acces doar Operatorul. În caz de încălcare a securității datelor, notificăm autoritatea conform legii și – dacă riscul este ridicat – și pe dvs.</p>

<h3>9. Drepturile dvs.</h3>
<ul>
<li><b>Acces</b> (art. 15) și <b>portabilitate</b> (art. 20): autentificat, puteți descărca din această pagină, cu un clic, toate datele dvs.</li>
<li><b>Rectificare</b> (art. 16): în Contul meu sau scriindu-ne.</li>
<li><b>Ștergere</b> (art. 17): vă puteți șterge contul oricând (Contul meu → Profil) sau puteți cere ștergerea prin e-mail.</li>
<li><b>Restricționare</b> (art. 18) și <b>opoziție</b> (art. 21) – în special față de prelucrarea bazată pe interes legitim (de ex. anunțuri preluate).</li>
<li><b>Retragerea consimțământului</b> (art. 7 alin. (3)): puteți modifica oricând setările cookie-urilor; aceasta nu afectează legalitatea prelucrării anterioare.</li>
</ul>
<p>Răspundem în cel mult <b>o lună</b> (termen ce poate fi prelungit cu încă două luni, motivat). Cererea este gratuită. Pentru identificare, scrieți-ne de pe adresa de e-mail asociată contului.</p>
<p><b>Plângere</b>: la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP), B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, 010336 București, <a href="https://www.dataprotection.ro" target="_blank" rel="noopener">dataprotection.ro</a>, anspdcp@dataprotection.ro, sau la autoritatea de protecție a datelor din statul UE în care locuiți ori lucrați. Vă puteți adresa și instanței.</p>

<h3>10. Minori</h3>
<p>Site-ul se adresează persoanelor de peste ${c.kor} ani; nu prelucrăm cu bună știință datele persoanelor mai tinere. Dacă aflăm de astfel de date, le ștergem.</p>

<h3>11. Modificări</h3>
<p>Actualizăm politica atunci când se schimbă legislația sau serviciul. Despre modificările esențiale vă informăm în prealabil.</p>`,

        sutik: c => `
<p class="legalLead">Un cookie este o mică informație pe care site-ul o stochează în browserul dvs. Stocarea locală a browserului (localStorage) funcționează similar. Conform Directivei 2002/58/CE și art. 4 din Legea nr. 506/2004, pentru cookie-urile strict necesare funcționării nu este nevoie de consimțământ, pentru toate celelalte da.</p>

<h3>Pe scurt</h3>
<ul>
<li>IngatlanPro <b>nu folosește</b> cookie-uri de statistică (analiză), publicitate sau urmărire.</li>
<li>Folosim doar cookie-uri și stocare strict necesare funcționării.</li>
<li>Numărul vizitelor îl măsurăm <b>fără cookie-uri</b>, fără a stoca nimic în browserul dvs. (detalii în ${c.link("adatvedelem", "Politica de confidențialitate")}).</li>
<li>Butonul de autentificare Google folosește cookie-urile proprii ale Google – îl încărcăm <b>doar cu consimțământul dvs.</b></li>
</ul>

<h3>Strict necesare (mereu active)</h3>
<div class="legalTableWrap"><table class="legalTable">
<thead><tr><th>Nume</th><th>Tip</th><th>Scop</th><th>Durată</th></tr></thead>
<tbody>
<tr><td><code>ipsid</code></td><td>cookie (HttpOnly, propriu)</td><td>menținerea autentificării</td><td>60 de zile sau până la deconectare</td></tr>
<tr><td><code>ipnezet</code></td><td>cookie (propriu)</td><td>doar pentru administratori: testarea vizualizării de utilizator</td><td>1 zi</td></tr>
<tr><td><code>lang</code></td><td>stocare locală</td><td>limba aleasă</td><td>până la ștergere</td></tr>
<tr><td><code>theme</code></td><td>stocare locală</td><td>mod luminos / întunecat</td><td>până la ștergere</td></tr>
<tr><td><code>ipConsent</code></td><td>stocare locală</td><td>memorarea alegerii privind cookie-urile</td><td>12 luni</td></tr>
</tbody></table></div>

<h3>Cu consimțământ: autentificare Google</h3>
<div class="legalTableWrap"><table class="legalTable">
<thead><tr><th>Furnizor</th><th>Scop</th><th>Detalii</th></tr></thead>
<tbody>
<tr><td>Google (accounts.google.com)</td><td>butonul „Continuă cu Google” și autentificarea</td><td>Cookie-urile sunt plasate de Google, conform propriilor reguli: <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noopener">policies.google.com/technologies/cookies</a></td></tr>
</tbody></table></div>
<p>Fără consimțământ vă puteți autentifica cu e-mail și parolă.</p>

<h3>Conținut extern fără cookie-uri</h3>
<p>Harta (OpenStreetMap), bibliotecile de programe (jsDelivr, cdnjs) și fotografiile de pe pagina principală (Unsplash) se încarcă de pe servere externe; acești furnizori văd adresa dvs. IP la încărcare, dar noi nu plasăm cookie-uri prin intermediul lor. Vezi: ${c.link("adatvedelem", "Politica de confidențialitate")}.</p>

<h3>Modificarea alegerii</h3>
<p>Vă puteți modifica sau retrage oricând alegerea: <button type="button" class="btn btn-sm btn-outline-primary" data-consent-open>Setări cookie-uri</button>. Puteți șterge cookie-urile și stocarea locală și din browser; cookie-urile Google deja plasate le puteți șterge din contul Google sau din browser.</p>`

    },

    // ================================================================== ENGLISH
    en: {

        impresszum: c => `
<p class="legalLead">Identification and contact details of the operator of the IngatlanPro website.</p>

<h3>Operator (service provider and data controller)</h3>
<table class="legalTable legalKV">
<tr><th>Name</th><td>${c.v(c.op.nev, "name / company name")}</td></tr>
<tr><th>${c.ceg ? "Registered office" : "Address"}</th><td>${c.v(c.op.cim, "postal address")}</td></tr>
<tr><th>E-mail</th><td>${c.mailto(c.op.email)}</td></tr>
${c.op.telefon ? `<tr><th>Phone</th><td>${c.e(c.op.telefon)}</td></tr>` : ""}
${c.ceg ? `<tr><th>Trade register no.</th><td>${c.v(c.op.cegjegyzekszam, "Nr. Reg. Com.")}</td></tr>
<tr><th>Tax ID (CUI)</th><td>${c.v(c.op.adoszam, "CUI / CIF")}</td></tr>` : ""}
<tr><th>Website</th><td>${c.e(location.origin)}</td></tr>
</table>

<h3>Hosting and database</h3>
<p>Hosting provider: <b>Render Services, Inc.</b> (USA) – render.com.<br>
Database: <b>Neon</b> – neon.com, data location: ${c.e(c.db)}.</p>

<h3>Point of contact (Regulation (EU) 2022/2065 – DSA, Articles 11 and 12)</h3>
<p>Authorities, the European Commission and users can reach us directly and electronically at: ${c.mailto(c.op.email)}.
Languages: <b>English, Romanian, Hungarian</b>. Communication does not rely solely on automated tools.</p>

<h3>Reporting illegal content</h3>
<p>If you see content on the site that is illegal, misleading or infringes your rights (e.g. your photos or personal data), report it using the ${c.link("bejelentes", "Report content")} form or by e-mail.</p>

<h3>Prices</h3>
<p>Using IngatlanPro is currently <b>free of charge</b>. If this changes, prices (including VAT) will be shown clearly in advance.</p>

${c.ceg ? `<h3>Consumer protection</h3>
<p>Romanian National Authority for Consumer Protection (ANPC): <a href="https://anpc.ro" target="_blank" rel="noopener">anpc.ro</a> ·
Alternative dispute resolution (SAL): <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener">anpc.ro/ce-este-sal</a></p>` : ""}

<h3>Legal documents</h3>
<ul>
<li>${c.link("aszf", "Terms of use")}</li>
<li>${c.link("adatvedelem", "Privacy policy")}</li>
<li>${c.link("sutik", "Cookie policy")}</li>
</ul>`,

        aszf: c => `
<p class="legalLead">These terms govern the use of the IngatlanPro website (the “Site”). Please read them carefully. By registering, or by accepting them at your first login, a binding contract is formed between you and the operator.</p>

<h3>1. The operator</h3>
<p>The Site is operated by ${c.v(c.op.nev, "name / company name")} (${c.v(c.op.cim, "address")}; e-mail: ${c.mailto(c.op.email)}) (the “Operator”, “we”). Further details are in the ${c.link("impresszum", "Legal notice")}.</p>

<h3>2. The service</h3>
<ul>
<li>IngatlanPro is a platform that collects, makes searchable and analyses real estate listings in Romania: search, map, market analysis, price estimates, publishing your own listings, search requests, messages and real estate agency management.</li>
<li>Besides listings published by users, the Site also shows <b>listings taken from other publicly available listing websites</b>, with the source indicated and a link to the original.</li>
<li>The service is currently <b>free of charge</b>.</li>
<li><b>The Operator is not a real estate agent</b>, does not represent either party and is not a party to any sale or rental agreement. We are not responsible for transactions between parties, payments or the condition of properties.</li>
<li>No account is needed for browsing. Publishing listings, favourites, saved searches and messages require registration.</li>
</ul>

<h3>3. Registration and account</h3>
<ul>
<li>Only persons aged <b>${c.kor} or over</b> with full legal capacity (or authorised representatives of a legal entity) may register.</li>
<li>You must provide true data and keep it up to date. Keep your password secret; you are responsible for activity in your account.</li>
<li>You can also sign in with Google; in that case Google shares your name and e-mail address with us.</li>
<li>You can delete your account at any time (My account → Profile). Deleting it also deletes your listings, favourites, saved searches, search requests and messages (agency listings stay with the agency).</li>
</ul>

<h3>4. Publishing listings – the advertiser's responsibility</h3>
<p>By publishing a listing you declare and warrant that:</p>
<ul>
<li>the property exists and is available, and the listing data (price, size, location, condition, photos) are <b>true, accurate and not misleading</b>;</li>
<li>you are entitled to advertise it (owner or authorised by the owner);</li>
<li>the photos and texts are yours or you have the right to use them, and they do not infringe the rights of others (copyright, personality rights, privacy);</li>
<li>you only publish personal data of third parties (e.g. tenants, neighbours) with a legal basis, and photos do not show identifiable people or number plates without consent;</li>
<li>you include the information required by law in the listing (e.g. where mandatory, the energy performance class);</li>
<li>real estate agencies and agents comply with the laws applicable to their activity and provide agents' data lawfully.</li>
</ul>
<p><b>Prohibited</b>: fake, non-existent or no longer available properties; fraud or obtaining deposits by deception; misleading prices or data; publishing the same property repeatedly; discriminatory content (e.g. based on ethnicity, religion, sex, disability, marital status); hateful, offensive, violent or sexual content; advertising other services; unsolicited messages (spam); malicious code or links; any content that breaks the law.</p>
<p>You grant us a non-exclusive, free licence, for as long as the listing exists, to display it (display, resizing, showing on maps and in lists). Price, size and location data may be used in <b>anonymised, aggregated market statistics</b> even after the listing is deleted.</p>

<h3>5. Listings taken from other websites</h3>
<p>Data of listings taken from public listing websites is based on what was published on the source website. We check them automatically and manually, but their accuracy is the responsibility of the original advertiser; always check the original listing as well. If your listing, photo or data appears on the Site and you do not want it to, tell us using the ${c.link("bejelentes", "Report content")} form or by e-mail – we will remove it without delay.</p>

<h3>6. Price estimator and market analysis</h3>
<p>The estimator and market statistics are <b>automatic calculations for information only</b>, based on asking prices. They are not a professional valuation (e.g. by an ANEVAR valuer), cannot be used for loans or official or court proceedings, and are not investment advice. We are not liable for decisions made on their basis.</p>

<h3>7. Search requests and messages</h3>
<ul>
<li>Your search request (what, where and at what price you are looking for) and your shortened name are visible to other users so that sellers can respond.</li>
<li>Messaging may only be used for communication about properties. Harassment, unsolicited advertising and harvesting users' data are prohibited.</li>
<li>Messages are stored. We only look at them to investigate abuse, following a report, or under a legal obligation.</li>
</ul>

<h3>8. Content moderation (DSA Article 14)</h3>
<p>We use the following tools to check content:</p>
<ul>
<li><b>automated checks</b>: flagging missing or unrealistic data (e.g. unrealistic price per m²), checking locations on the map, detecting the same property listed several times (based on photo fingerprints);</li>
<li>${c.ai ? "<b>AI-assisted</b> data checks for imported listings (it makes suggestions, a human decides);" : "in the future, AI-assisted data checks (it makes suggestions, a human decides);"}</li>
<li><b>human review</b>: reports and moderation decisions are assessed personally by the Operator.</li>
</ul>
<p>Possible measures: correcting a listing, holding it for approval, hiding or removing it; restricting messaging; for serious or repeated violations, suspending or closing the account. For every restriction we send you – if we have your contact details – a <b>statement of reasons</b> (DSA Article 17): what we did, based on which facts and rules, and how to ask for a review.</p>
<p><b>Appealing a decision</b>: reply to the notification e-mail or write to ${c.mailto(c.op.email)}; a human will review the decision and reverse it where justified. You may also go to court.</p>

<h3>9. Reporting illegal content (DSA Article 16)</h3>
<p>Anyone – even without an account – can report content they consider illegal or contrary to these terms using the ${c.link("bejelentes", "Report content")} form. Give the exact location (link) of the content, why you consider it illegal, your name and e-mail address, and confirm that the report is made in good faith and is accurate and complete. We confirm receipt, assess reports in a timely, diligent and objective manner, and tell you our decision. If manifestly unfounded reports are submitted repeatedly, we may suspend processing them.</p>

<h3>10. Liability</h3>
<ul>
<li>The Site is provided “as is”; we strive for continuous operation but do not guarantee error-free, uninterrupted availability (maintenance, hosting provider failures, etc.).</li>
<li>As a hosting provider, we are only liable for content published by users and other websites if we become aware of its illegality and fail to act expeditiously (Regulation (EU) 2022/2065, Article 6; Romanian Law 365/2002).</li>
<li>Our liability is limited to the extent permitted by law. This does not apply to damage caused intentionally or by gross negligence, to injury to life, body or health, and does not affect mandatory consumer rights.</li>
<li>You are liable for damage caused to third parties by breaching these terms or by illegal content, if they bring claims against us.</li>
</ul>

<h3>11. Intellectual property</h3>
<p>The Site's design, code, database and own texts belong to the Operator. Listing texts and photos remain the property of their advertisers (or of the advertisers on the source websites). Open-source software and fonts used may be used under their own licences.</p>

<h3>12. Termination</h3>
<p>You may terminate the contract at any time, without giving reasons, by deleting your account. We may close or suspend an account, with reasons, for serious or repeated breaches, illegal activity, or if the service is discontinued; we will give at least 30 days' notice of discontinuation.</p>

<h3>13. Changes to the terms</h3>
<p>We may change these terms because of changes in the law, new features or security reasons. We will notify you of material changes in advance on the Site and/or by e-mail; you will need to accept the new version at your next login. If you disagree, you may delete your account.</p>

<h3>14. Governing law, disputes</h3>
<ul>
<li>The contract is governed by <b>Romanian law</b>. If you are a consumer, you keep the protection of the mandatory rules of your country of habitual residence.</li>
<li>In case of a dispute, please write to us first – we will try to settle it amicably. After that, the competent Romanian court has jurisdiction; as a consumer you may also go to the court of your domicile.</li>
${c.ceg ? `<li>For consumer complaints you may also contact ANPC (<a href="https://anpc.ro" target="_blank" rel="noopener">anpc.ro</a>) or an alternative dispute resolution (SAL) body.</li>` : ""}
</ul>

<h3>15. Language, contact</h3>
<p>These terms are available in Romanian, Hungarian and English; in case of discrepancy, the Romanian version prevails. Questions, complaints: ${c.mailto(c.op.email)}.</p>`,

        adatvedelem: c => `
<p class="legalLead">This policy explains what personal data we process, why, on what legal basis, for how long, who we share it with and what your rights are. It is based on Articles 13 and 14 of the General Data Protection Regulation (GDPR, (EU) 2016/679) and Romanian Law 190/2018.</p>

<h3>1. Data controller</h3>
<p>${c.v(c.op.nev, "name / company name")}, ${c.v(c.op.cim, "address")}; e-mail: ${c.mailto(c.op.email)}${c.op.telefon ? `; phone: ${c.e(c.op.telefon)}` : ""}. Appointing a data protection officer is not mandatory given the nature and size of the activity; for data protection questions contact us at the e-mail above.</p>

<h3>2. What data we process, why and for how long</h3>
<div class="legalTableWrap"><table class="legalTable">
<thead><tr><th>Purpose</th><th>Data</th><th>Legal basis (GDPR Art. 6)</th><th>Retention</th></tr></thead>
<tbody>
<tr><td>Running the Site, security, preventing abuse</td><td>IP address, browser data, time and address of the request (hosting provider logs); IP address for counting login and report attempts</td><td>legitimate interest – (1)(f)</td><td>The counter only in server memory, at most 24 hours; hosting logs per the provider's settings, briefly. We do not store IP addresses in the database.</td></tr>
<tr><td>Visit statistics (without cookies)</td><td>page visited (for listings, its number), time, device type (phone / tablet / computer), language, referring site's domain; an irreversible identifier that changes daily, computed from the IP address and browser data – the IP address itself is not stored, and the next day the same visitor can no longer be recognised</td><td>legitimate interest – (1)(f): understanding and improving the use and load of the Site</td><td>400 days. Browsers with “Do Not Track” or Global Privacy Control are not measured – this is how you can object.</td></tr>
<tr><td>Account, login</td><td>e-mail, name, password (only as an encrypted hash – scrypt), phone (if provided), Google ID (Google sign-in), registration and last login time, time of accepting the terms, notification setting; session identifier (in a cookie; stored by us only hashed)</td><td>performance of contract – (1)(b)</td><td>Until the account is deleted; the session expires after 60 days or at logout.</td></tr>
<tr><td>Publishing and displaying listings</td><td>listing data, description, photos, property location; the advertiser's name; for agency listings, the agency's and agent's name, phone and e-mail – <b>these are public</b></td><td>contract – (1)(b)</td><td>Until the listing or account is deleted. Price, size and location may remain in anonymised statistics.</td></tr>
<tr><td>Favourites, saved searches, e-mail alerts</td><td>chosen listings, search filters, time of last alert</td><td>contract – (1)(b)</td><td>Until deleted / the account is deleted. E-mail alerts can be switched off in My account.</td></tr>
<tr><td>Search requests, messages</td><td>request content and your shortened name (public); message text, sender, recipient and time</td><td>contract – (1)(b)</td><td>Until you delete them, or until either party deletes their account.</td></tr>
<tr><td>Real estate agencies</td><td>agency data; agents' name, phone, e-mail (provided by the agency, which is responsible for lawfulness)</td><td>contract – (1)(b); for agents, the agency's legitimate interest – (1)(f)</td><td>Until the agency, agent or account is deleted.</td></tr>
<tr><td>Public listings taken from other websites (GDPR Art. 14)</td><td>listing data, description, photos and link; the advertiser's name or contact details if they appear in the text</td><td>legitimate interest – (1)(f): a transparent, searchable overview of the Romanian real estate market in one place</td><td>While the listing is available on the source website, then at most 12 months (market history); on objection we delete without delay.</td></tr>
<tr><td>Handling content reports (DSA Art. 16–17)</td><td>reporter's name, e-mail, report content, decision and reasons</td><td>legal obligation – (1)(c)</td><td>2 years from the decision.</td></tr>
<tr><td>Proof of your cookie choice</td><td>random identifier, your choice, time (no IP address, no account)</td><td>legal obligation – (1)(c), GDPR Art. 7(1)</td><td>3 years; in your browser 12 months.</td></tr>
<tr><td>Correspondence, handling requests</td><td>name, e-mail, message content</td><td>legitimate interest – (1)(f); for GDPR requests, legal obligation – (1)(c)</td><td>1 year after the case is closed.</td></tr>
</tbody></table></div>
<p>For processing based on legitimate interest we have assessed that our interest does not disproportionately affect your rights; we will inform you of this assessment on request. We do not sell your data or use it for advertising.</p>

<h3>3. Where the data comes from</h3>
<p>Most data is provided by you. With Google sign-in, Google provides your name, e-mail address and Google ID. Data of imported listings comes from publicly available Romanian listing websites (e.g. Imobiliare.ro, Storia, OLX, Publi24, Homezz, Anuntul.ro, LaJumate, Romimo, Imoradar24) – the source is shown on each listing.</p>

<h3>4. Recipients (processors)</h3>
<ul>
<li><b>Render Services, Inc.</b> (USA) – website hosting.</li>
<li><b>Neon</b> – database; data location: ${c.e(c.db)}.</li>
${c.mail === "brevo" ? "<li><b>Brevo (Sendinblue SAS)</b> (France, EU) – sending e-mail notifications.</li>" : ""}
${c.mail === "resend" ? "<li><b>Resend, Inc.</b> (USA) – sending e-mail notifications.</li>" : ""}
${c.google ? "<li><b>Google Ireland Ltd.</b> / Google LLC – Google sign-in (only if you use it and consented to the Google button).</li>" : ""}
${c.ai ? "<li><b>Anthropic PBC</b> (USA) – AI-assisted checking of the text of imported listings (receives no user account data).</li>" : ""}
<li><b>OpenStreetMap Foundation</b> (United Kingdom) – map tiles and address geocoding (sees your IP address when the map loads; receives listing addresses).</li>
<li><b>jsDelivr</b> and <b>cdnjs (Cloudflare)</b> – delivering the site's libraries (IP address); <b>Unsplash</b> – illustrative photos on the home page (IP address).</li>
<li>Authorities – only under a legal obligation.</li>
</ul>
<p>The font is loaded from our own server, so Google Fonts receives no data.</p>

<h3>5. Transfers outside the EU</h3>
<p>Transfers to the United States are based on the European Commission's adequacy decision on the EU–US Data Privacy Framework (where the provider is certified), otherwise on the Standard Contractual Clauses (SCC) adopted by the Commission. The United Kingdom is covered by an adequacy decision.</p>

<h3>6. Automated decision-making</h3>
<p>We do not make automated decisions with legal effects about you (profiling). Automated checks concern listing data; moderation decisions are made by a human. The estimator estimates properties, not you.</p>

<h3>7. Cookies</h3>
<p>We only use cookies necessary for the site to work; Google sign-in cookies are loaded only with your consent. Details: ${c.link("sutik", "Cookie policy")}.</p>

<h3>8. Security</h3>
<p>We use encrypted connections (HTTPS); passwords and session identifiers are stored only as irreversible hashes; login attempts are rate-limited; only the Operator has access to the database. In the event of a personal data breach we will notify the authority as required by law and – if the risk is high – you as well.</p>

<h3>9. Your rights</h3>
<ul>
<li><b>Access</b> (Art. 15) and <b>portability</b> (Art. 20): when logged in, you can download all your data on this page with one click.</li>
<li><b>Rectification</b> (Art. 16): in My account, or write to us.</li>
<li><b>Erasure</b> (Art. 17): you can delete your account at any time (My account → Profile) or request it by e-mail.</li>
<li><b>Restriction</b> (Art. 18) and <b>objection</b> (Art. 21) – especially to processing based on legitimate interest (e.g. imported listings).</li>
<li><b>Withdrawing consent</b> (Art. 7(3)): you can change your cookie settings at any time; this does not affect the lawfulness of earlier processing.</li>
</ul>
<p>We reply within <b>one month</b> (extendable by two further months where justified). Requests are free. To identify you, please write from the e-mail address linked to your account.</p>
<p><b>Complaints</b>: to the Romanian supervisory authority – Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP), B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, 010336 Bucharest, <a href="https://www.dataprotection.ro" target="_blank" rel="noopener">dataprotection.ro</a>, anspdcp@dataprotection.ro – or to the data protection authority of the EU country where you live or work. You may also go to court.</p>

<h3>10. Minors</h3>
<p>The Site is intended for persons over ${c.kor}; we do not knowingly process data of younger persons. If we become aware of such data, we delete it.</p>

<h3>11. Changes</h3>
<p>We update this policy when the law or the service changes. We will inform you of material changes in advance.</p>`,

        sutik: c => `
<p class="legalLead">A cookie is a small piece of data a website stores in your browser. The browser's local storage (localStorage) works similarly. Under Directive 2002/58/EC and Article 4 of Romanian Law 506/2004, cookies strictly necessary for the site to work need no consent; all others do.</p>

<h3>In short</h3>
<ul>
<li>IngatlanPro <b>does not use</b> statistics (analytics), advertising or tracking cookies.</li>
<li>We only use cookies and storage strictly necessary for the site to work.</li>
<li>We measure visits <b>without cookies</b> and without storing anything in your browser (details in the ${c.link("adatvedelem", "Privacy policy")}).</li>
<li>The Google sign-in button uses Google's own cookies – we load it <b>only with your consent</b>.</li>
</ul>

<h3>Strictly necessary (always active)</h3>
<div class="legalTableWrap"><table class="legalTable">
<thead><tr><th>Name</th><th>Type</th><th>Purpose</th><th>Duration</th></tr></thead>
<tbody>
<tr><td><code>ipsid</code></td><td>cookie (HttpOnly, first-party)</td><td>keeping you logged in</td><td>60 days or until logout</td></tr>
<tr><td><code>ipnezet</code></td><td>cookie (first-party)</td><td>admins only: trying the user view</td><td>1 day</td></tr>
<tr><td><code>lang</code></td><td>local storage</td><td>chosen language</td><td>until you delete it</td></tr>
<tr><td><code>theme</code></td><td>local storage</td><td>light / dark mode</td><td>until you delete it</td></tr>
<tr><td><code>ipConsent</code></td><td>local storage</td><td>remembering your cookie choice</td><td>12 months</td></tr>
</tbody></table></div>

<h3>With consent: Google sign-in</h3>
<div class="legalTableWrap"><table class="legalTable">
<thead><tr><th>Provider</th><th>Purpose</th><th>Details</th></tr></thead>
<tbody>
<tr><td>Google (accounts.google.com)</td><td>“Continue with Google” button and sign-in</td><td>Cookies are set by Google under its own rules: <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noopener">policies.google.com/technologies/cookies</a></td></tr>
</tbody></table></div>
<p>Without consent you can still log in with e-mail and password.</p>

<h3>External content without cookies</h3>
<p>The map (OpenStreetMap), program libraries (jsDelivr, cdnjs) and home page photos (Unsplash) load from external servers; these providers see your IP address when loading, but we do not set cookies through them. See the ${c.link("adatvedelem", "Privacy policy")}.</p>

<h3>Changing your choice</h3>
<p>You can change or withdraw your choice at any time: <button type="button" class="btn btn-sm btn-outline-primary" data-consent-open>Cookie settings</button>. You can also delete cookies and local storage in your browser; Google cookies already set can be deleted in your Google account or browser.</p>`

    }

};
