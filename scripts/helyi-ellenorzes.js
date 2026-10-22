// ============================================================
//  Forrásoldal-ellenőrzés és beolvasás A SAJÁT GÉPEDRŐL
//
//  Az OLX, a Storia és az imobiliare.ro a Render szerverét (adatközponti IP)
//  letiltja, a te otthoni internetedet nem. Ez a program ugyanazt csinálja,
//  mint az Admin → Karbantartás / Beolvasás, csak a gépedről fut, és közvetlenül
//  az éles (Neon) adatbázisba ír – az eredmény azonnal látszik az oldalon.
//
//  Git Bash-ből (a projekt mappájában):
//    npm run ellenorzes -- --varos Sepsiszentgyorgy      egy város minden hirdetése
//    npm run ellenorzes -- --mind                        minden város (lassú)
//    npm run beolvasas -- <link> [<link>...] --varos Marosvasarhely [--tipus lakas] [--ugylet elado]
//
//  A .env-ben a DATABASE_URL az éles (Neon) adatbázis legyen – ugyanaz, mint a Renderen.
// ============================================================

require("dotenv").config({ quiet: true });

const args = process.argv.slice(2);
const ertek = nev => { const i = args.indexOf("--" + nev); return i >= 0 ? args[i + 1] : null; };
const van = nev => args.includes("--" + nev);

function hiba(uzenet) {
    console.error("\n❌ " + uzenet + "\n");
    process.exit(1);
}

// Melyik adatbázis? (jelszó nélkül írjuk ki)
let host = "";
try { host = new URL(process.env.DATABASE_URL || "").hostname; } catch (e) { host = ""; }
if (!host) hiba("Nincs DATABASE_URL a .env fájlban. Másold be a Render → Environment oldalról (a Neon adatbázis címe).");
if (/^(localhost|127\.0\.0\.1)$/.test(host) && !van("helyi-db")) {
    hiba(`A .env DATABASE_URL-je a gépeden lévő adatbázisra mutat (${host}), nem az élesre. Írd be a Neon címét (Render → Environment → DATABASE_URL).`);
}

const ido = ms => {
    const s = Math.round(ms / 1000);
    return s < 60 ? `${s} mp` : `${Math.floor(s / 60)} perc ${s % 60} mp`;
};

async function main() {

    const db = require("../server/db/database");
    await db.ready;
    const importer = require("../server/services/importer");

    console.log(`\nAdatbázis: ${host}`);

    // A város neve ékezet nélkül is jó (Sepsiszentgyorgy = Sepsiszentgyörgy)
    const ekezetNelkul = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    async function varosNev(beirt) {
        const r = await db.query("SELECT nev FROM varosok ORDER BY nev");
        const talalt = r.rows.find(v => ekezetNelkul(v.nev) === ekezetNelkul(beirt));
        if (!talalt) hiba(`Nincs ilyen város: "${beirt}". A városok: ${r.rows.map(v => v.nev).join(", ")}`);
        return talalt.nev;
    }

    let job;
    const kezdes = Date.now();

    if (van("beolvas") || args.some(a => /^https?:\/\//i.test(a))) {

        const urls = args.filter(a => /^https?:\/\//i.test(a));
        if (!urls.length) hiba("Adj meg legalább egy linket (hirdetés vagy találati lista).");
        const v = ertek("varos");
        if (!v) hiba("Add meg a várost: --varos Marosvasarhely");
        const varos = await varosNev(v);
        console.log(`Beolvasás: ${urls.length} link → ${varos}\n`);
        job = importer.indit(urls, { varos, tipus: ertek("tipus") || "lakas", ugylet: ertek("ugylet") || "elado", kerulet: ertek("kerulet") || null });

    } else {

        let varosok = null;
        if (!van("mind")) {
            const v = ertek("varos");
            if (!v) hiba("Add meg a várost (--varos Sepsiszentgyorgy), vagy --mind az összeshez.");
            varosok = await importer.varosCsoport(await varosNev(v));
        } else {
            varosok = (await db.query("SELECT nev FROM varosok ORDER BY nev")).rows.map(v => v.nev);
        }
        console.log(`Ellenőrzés a gépedről: ${varosok.join(", ")}\n(ár, elérhetőség, eredeti linkek; a levett hirdetések "nem elérhető"-k lesznek)\n`);
        job = importer.figyelesIndit({ varosok, helyi: true });

    }

    // Folyamat kiírása
    let utolsoNaplo = 0;
    const SZOVEG = { uj: "ÚJ", ar_frissitve: "ár", frissitve: "frissítve", nem_elerheto: "LEVÉVE", ujra_elerheto: "újra fent", hiba: "HIBA", letiltva: "letiltva", lista: "lista", lista_szinkron: "Imoradar24 lista", forraslinkek: "eredeti linkek keresése" };
    const kiir = () => {
        const j = importer.allapot(job.id) || job;
        const uj = j.naplo.slice(utolsoNaplo);
        utolsoNaplo = j.naplo.length;
        uj.filter(n => n.eredmeny !== "rendben" && n.eredmeny !== "lista").forEach(n => {
            const mi = SZOVEG[n.eredmeny] || n.eredmeny;
            const link = n.url ? String(n.url).replace(/^https?:\/\/(www\.)?/, "").slice(0, 90) : "";
            console.log(`  ${mi.padEnd(12)} ${n.id ? "#" + n.id + " " : ""}${link}${n.uzenet ? " – " + n.uzenet : ""}${n.regi ? ` (${n.regi} → ${n.uj} €)` : ""}`);
        });
        process.stdout.write(`\r  ${j.kesz}/${j.osszes || "?"} kész · ${j.nemElerheto || 0} levéve · ${j.frissitett || 0} frissítve · ${j.uj || 0} új · ${j.hibak || 0} hiba · ${ido(Date.now() - kezdes)}   `);
    };

    const t = setInterval(kiir, 2000);
    await job.promise;
    clearInterval(t);
    kiir();

    console.log(`\n\n✅ Kész (${ido(Date.now() - kezdes)}): ${job.nemElerheto || 0} levéve, ${job.frissitett || 0} frissítve, ${job.uj || 0} új, ${job.kihagyott || 0} rendben, ${job.letiltva || 0} letiltva, ${job.hibak || 0} hiba.`);
    if (job.forraslinkek && !job.forraslinkek.hiba) {
        console.log(`   Eredeti linkek: ${job.forraslinkek.javitott || 0} megtalálva; még ${job.forrasNelkul === null || job.forrasNelkul === undefined ? "?" : job.forrasNelkul} hirdetésnek nincs meg.`);
    }
    if (job.letiltva) console.log("   A letiltottakat később futtasd újra (a forrásoldal rövid időre korlátoz, ha túl sok a kérés).");

    await db.end().catch(() => null);
    process.exit(0);

}

main().catch(e => hiba(e.stack || e.message));
