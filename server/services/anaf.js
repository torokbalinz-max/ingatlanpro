// ============================================================
//  Cégadatok az ANAF nyilvános adatbázisából (adószám / CUI alapján)
//
//  Ingyenes, regisztráció és kulcs nélkül használható szolgáltatás:
//  megmondja egy román cégről, hogy létezik-e, aktív-e (nincs-e
//  inaktívvá nyilvánítva vagy törölve), mi a hivatalos neve, címe,
//  cégjegyzékszáma és fő tevékenysége (CAEN). Ezzel szűrjük ki a kitalált
//  ingatlanirodákat, és ezzel tölthető ki az üzemeltető cégadatai is.
//
//  Szabályok (ANAF): legfeljebb 1 kérés másodpercenként, kérésenként
//  legfeljebb 100 adószám. Ezért sorba állítjuk a kéréseket, és egy napig
//  megjegyezzük a választ.
//  Dokumentáció: https://static.anaf.ro/static/10/Anaf/Informatii_R/Servicii_web/doc_WS_V9.txt
// ============================================================

const ANAF_URL = process.env.ANAF_URL || "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva";

const cache = new Map();            // cui -> { ido, eredmeny }
const CACHE_MS = 24 * 3600 * 1000;
let sor = Promise.resolve();
let utolsoKeres = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// "RO 14399840", "ro14399840", "14 399 840" -> "14399840" (vagy null)
function cuiTisztit(s) {
    const t = String(s || "").toUpperCase().replace(/^\s*RO/, "").replace(/[\s.\-]/g, "");
    return /^\d{2,10}$/.test(t) ? t : null;
}

// A román adószám ellenőrző számjegye (a kitalált számok többsége ezen elbukik)
function cuiErvenyes(s) {

    const cui = cuiTisztit(s);
    if (!cui) return false;

    const kulcs = "753217532";
    const torzs = cui.slice(0, -1).padStart(9, "0");
    const ellenorzo = Number(cui.slice(-1));

    let osszeg = 0;
    for (let n = 0; n < 9; n++) osszeg += Number(torzs[n]) * Number(kulcs[n]);

    let v = (osszeg * 10) % 11;
    if (v === 10) v = 0;

    return v === ellenorzo;

}

const ma = () => new Date().toISOString().slice(0, 10);

function cim(a) {
    if (!a) return null;
    const r = [
        [a.sdenumire_Strada, a.snumar_Strada].filter(Boolean).join(" "),
        a.sdetalii_Adresa,
        a.sdenumire_Localitate,
        a.sdenumire_Judet,
        a.scod_Postal
    ].map(x => String(x || "").trim()).filter(Boolean);
    return r.length ? r.join(", ") : null;
}

// Az ANAF válaszából a nekünk fontos adatok
function feldolgoz(f) {

    const dg = f.date_generale || {};
    const inaktiv = f.stare_inactiv || {};
    const sediu = f.adresa_sediu_social || null;
    const caen = String(dg.cod_CAEN || "").trim() || null;
    const torolve = !!String(inaktiv.dataRadiere || "").trim() || /radiat|radiere/i.test(String(dg.stare_inregistrare || ""));

    return {
        cui: String(dg.cui || "").trim() || null,
        nev: String(dg.denumire || "").trim() || null,
        cim: String(dg.adresa || "").trim() || cim(sediu),
        regCom: String(dg.nrRegCom || "").trim() || null,
        telefon: String(dg.telefon || "").trim() || null,
        caen,
        // Ingatlanos tevékenység: 68xx (6831 = ingatlanügynökség)
        ingatlanos: !!caen && caen.startsWith("68"),
        ugynokseg: caen === "6831",
        bejegyezve: String(dg.data_inregistrare || "").trim() || null,
        allapotSzoveg: String(dg.stare_inregistrare || "").trim() || null,
        forma: String(dg.forma_juridica || dg.forma_organizare || "").trim() || null,
        megye: sediu ? (sediu.sdenumire_Judet || null) : null,
        telepules: sediu ? (sediu.sdenumire_Localitate || null) : null,
        inaktiv: !!inaktiv.statusInactivi,
        torolve,
        aktiv: !inaktiv.statusInactivi && !torolve,
        tva: !!(f.inregistrare_scop_Tva && f.inregistrare_scop_Tva.scpTVA)
    };

}

// Egy adószám lekérdezése.
//  -> { talalt: true, adat: {...} } | { talalt: false }
//  Hálózati / ANAF hiba esetén kivételt dob (a hívó "később újra" jelzést mutat).
async function lekerdez(s) {

    const cui = cuiTisztit(s);
    if (!cui) throw Object.assign(new Error("bad_cui"), { kod: "bad_cui" });

    const volt = cache.get(cui);
    if (volt && Date.now() - volt.ido < CACHE_MS) return volt.eredmeny;

    // Sorba állítjuk: két kérés között legalább 1,1 másodperc
    const futtat = async () => {

        const varj = 1100 - (Date.now() - utolsoKeres);
        if (varj > 0) await sleep(varj);
        utolsoKeres = Date.now();

        const res = await fetch(ANAF_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify([{ cui: Number(cui), data: ma() }]),
            signal: AbortSignal.timeout(15000)
        });

        const szoveg = await res.text();

        if (!res.ok) throw new Error(`ANAF HTTP ${res.status}`);

        let v;
        try { v = JSON.parse(szoveg); } catch (e) { throw new Error("ANAF: nem JSON válasz"); }

        const talalat = Array.isArray(v.found) ? v.found[0] : null;

        const eredmeny = talalat ? { talalt: true, adat: feldolgoz(talalat) } : { talalt: false };

        cache.set(cui, { ido: Date.now(), eredmeny });
        if (cache.size > 2000) cache.delete(cache.keys().next().value);

        return eredmeny;

    };

    const p = sor.then(futtat, futtat);
    sor = p.catch(() => { });
    return p;

}

module.exports = { cuiTisztit, cuiErvenyes, lekerdez, _feldolgoz: feldolgoz };
