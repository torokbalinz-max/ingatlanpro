// ============================================================
//  IngatlanPro – iratok szinkronja a gépre
//
//  Óránként (a Windows Feladatütemezőből – szinkron-telepites.bat) lekéri
//  az app Irattárát, és ami új vagy változott, letölti ide:
//      Dokumentumok\IngatlanPro iratok\
//  (évenként, hónaponként: Facturi_emise, Facturi_primite, ... ugyanúgy,
//  mint a „Könyvelőnek” csomag). Helyben SEMMIT nem töröl.
//
//  Beállítás (egyszer): node iratok-szinkron.js --beallit
//      az oldal címe (pl. https://ingatlanpro.onrender.com) és a kulcs
//      (Admin → Irattár → Szinkron a gépre → Új kulcs)
//  A beállítás a mappában van: .szinkron.json (nem a kódban, nem megy GitHubra).
//
//  Csak Node.js kell hozzá (18+), más nem.
// ============================================================

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const MAPPA = process.env.IRATOK_MAPPA || path.join(os.homedir(), "Documents", "IngatlanPro iratok");
const BEALLITAS = path.join(MAPPA, ".szinkron.json");
const ALLAPOT = path.join(MAPPA, ".szinkron-allapot.json");
const NAPLO = path.join(MAPPA, ".szinkron-naplo.txt");

function naplo(sor) {
    const s = `${new Date().toLocaleString("hu-HU")}  ${sor}`;
    console.log(s);
    try {
        fs.mkdirSync(MAPPA, { recursive: true });
        // a napló ne nőjön a végtelenségig (utolsó ~2000 sor)
        let regi = "";
        try { regi = fs.readFileSync(NAPLO, "utf8"); } catch (e) { /* nincs még */ }
        const sorok = (regi + s + "\r\n").split("\r\n").slice(-2000);
        fs.writeFileSync(NAPLO, sorok.join("\r\n"));
    } catch (e) { /* nem kritikus */ }
}

function olvasJson(f, alap) {
    try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return alap; }
}

function kerdez(kerdes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(ok => rl.question(kerdes, v => { rl.close(); ok(String(v || "").trim()); }));
}

async function beallit() {
    console.log("\nIngatlanPro iratok szinkron – beállítás\n");
    const regi = olvasJson(BEALLITAS, {});
    let cim = await kerdez(`Az oldal címe [${regi.cim || "https://ingatlanpro.onrender.com"}]: `);
    cim = (cim || regi.cim || "https://ingatlanpro.onrender.com").replace(/\/+$/, "");
    const kulcs = await kerdez("A kulcs (Admin → Irattár → Szinkron a gépre → Új kulcs): ");
    if (!/^ips_[A-Za-z0-9_-]{20,}$/.test(kulcs)) {
        console.log("\nEz nem jó kulcs (ips_ kezdetű). Próbáld újra.");
        process.exit(1);
    }
    fs.mkdirSync(MAPPA, { recursive: true });
    fs.writeFileSync(BEALLITAS, JSON.stringify({ cim, kulcs }, null, 2));
    console.log(`\nMentve: ${BEALLITAS}\nMost egy próba-letöltés jön...\n`);
}

async function keres(b, ut, valasz = "json") {
    // a Render ingyenes szervere alszik – az első kérés lassú lehet (max. ~1 perc)
    for (let i = 0; i < 3; i++) {
        try {
            const r = await fetch(b.cim + ut, { headers: { Authorization: "Bearer " + b.kulcs }, signal: AbortSignal.timeout(90000) });
            if (r.status === 401) throw Object.assign(new Error("A kulcs nem érvényes – kérj újat az adminban, és futtasd: iratok-szinkron.js --beallit"), { vegso: true });
            if (r.status === 404) return null;
            if (!r.ok) throw new Error("HTTP " + r.status);
            return valasz === "json" ? r.json() : Buffer.from(await r.arrayBuffer());
        } catch (e) {
            if (e.vegso || i === 2) throw e;
            await new Promise(ok => setTimeout(ok, 15000));
        }
    }
}

// Biztonság: csak a mappán belülre írunk
function cel(ut) {
    const teljes = path.resolve(MAPPA, ...String(ut).split("/").filter(x => x && x !== ".." && x !== "."));
    if (!teljes.startsWith(path.resolve(MAPPA) + path.sep)) throw new Error("rossz útvonal: " + ut);
    return teljes;
}

async function szinkron() {
    const b = olvasJson(BEALLITAS, null);
    if (!b || !b.cim || !b.kulcs) {
        naplo("Nincs beállítva – futtasd: szinkron-telepites.bat (vagy node iratok-szinkron.js --beallit)");
        process.exit(1);
    }
    const allapot = olvasJson(ALLAPOT, {});
    const v = await keres(b, "/szinkron/lista");
    const lista = (v && v.fajlok) || [];
    let uj = 0, frissult = 0, hiba = 0;
    for (const f of lista) {
        const regi = allapot[f.kulcs];
        if (regi && regi.ver === f.ver && fs.existsSync(cel(regi.ut))) continue;
        try {
            const adat = await keres(b, "/szinkron/fajl?kulcs=" + encodeURIComponent(f.kulcs), "buffer");
            if (!adat) continue; // pl. hiányos számla – még nincs XML
            const hova = cel(f.ut);
            fs.mkdirSync(path.dirname(hova), { recursive: true });
            fs.writeFileSync(hova, adat);
            allapot[f.kulcs] = { ver: f.ver, ut: f.ut };
            if (regi) frissult++; else uj++;
            naplo(`${regi ? "frissítve" : "új"}: ${f.ut}`);
        } catch (e) {
            hiba++;
            naplo(`HIBA ${f.ut}: ${e.message}`);
        }
    }
    fs.writeFileSync(ALLAPOT, JSON.stringify(allapot));
    naplo(`Kész: ${uj} új, ${frissult} frissítve, ${hiba} hiba (${lista.length} irat a listán).`);
}

(async () => {
    try {
        if (process.argv.includes("--beallit")) await beallit();
        await szinkron();
    } catch (e) {
        naplo("HIBA: " + e.message);
        process.exitCode = 1;
    }
})();
