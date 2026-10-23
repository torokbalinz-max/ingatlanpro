// ============================================================
//  AI asszisztens a látogatóknak (a jobb alsó sarokban lévő csevegő)
//
//  - Az Anthropic API-t használja (ugyanaz az ANTHROPIC_API_KEY, mint az
//    admin AI-ellenőrzése). Kulcs nélkül, vagy ha az admin kikapcsolja
//    (Admin → Webhely adatai → Funkciók), a csevegő nem látszik.
//  - A saját adatainkból válaszol, eszközökkel: hirdetések keresése, piaci
//    átlagok városrészenként, értékbecslés (az csak bejelentkezve, mint az
//    Értékbecslő oldalon). Kitalált hirdetést, árat nem mondhat.
//  - A beszélgetést NEM tároljuk: csak a kérések számát (a költség és a
//    visszaélés ellen). Az üzenetek az Anthropic-hoz mennek a válaszhoz.
//  - Költség: Haiku modell, a rendszerszöveg gyorsítótárazva; egy válasz
//    jellemzően 0,1–0,5 cent. Korlát: IP-címenként 10 percenként 20, naponta
//    80 üzenet, és az egész oldalon naponta AI_CHAT_NAPI (alap: 400).
// ============================================================

const db = require("../db/database");
const allapotok = require("./allapotok");
const { becsles } = require("./valuation");

const MODELL = process.env.AI_CHAT_MODEL || process.env.AI_MODEL || "claude-haiku-4-5";
const TARTALEK_MODELL = "claude-haiku-5-5";
const NAPI_KERET = Math.max(10, Number(process.env.AI_CHAT_NAPI) || 400);

const TIPUSOK = ["lakas", "haz", "telek", "kereskedelmi", "iroda"];

function elerheto() {
    return !!process.env.ANTHROPIC_API_KEY && !/^(0|false|nem|no)$/i.test(String(process.env.AI_CHAT || ""));
}

// ---------- korlátok (memóriában – újraindításkor nullázódik, ez elég) ----------
const keresek = new Map();       // ip -> [időbélyegek]
let nap = "", napiDb = 0;

function korlat(ip) {
    const most = Date.now();
    const ma = new Date().toISOString().slice(0, 10);
    if (ma !== nap) { nap = ma; napiDb = 0; keresek.clear(); }
    if (napiDb >= NAPI_KERET) return "napi_keret";
    const l = (keresek.get(ip) || []).filter(t => most - t < 86400000);
    if (l.filter(t => most - t < 10 * 60000).length >= 20) return "tul_sok";
    if (l.length >= 80) return "tul_sok";
    l.push(most);
    keresek.set(ip, l);
    napiDb++;
    return null;
}

// ---------- a városok és városrészeik (a rendszerszövegbe) ----------
let varosCache = null;
async function varosok() {
    if (varosCache && Date.now() - varosCache.ido < 10 * 60000) return varosCache.adat;
    const v = await db.query(`
        SELECT v.nev, v.nev_ro, v.anyavaros,
               (SELECT COUNT(*)::int FROM ingatlanok i WHERE i.varos = v.nev AND i.statusz = 'aktiv') AS db
        FROM varosok v ORDER BY v.nev`);
    const k = await db.query("SELECT varos, nev, nev_ro FROM keruletek ORDER BY varos, nev");
    const adat = v.rows.filter(x => x.db > 0).map(x => ({
        nev: x.nev, nev_ro: x.nev_ro || null, db: x.db,
        anyavaros: x.anyavaros || null,
        reszek: k.rows.filter(r => r.varos === x.nev).map(r => r.nev_ro && r.nev_ro !== r.nev ? `${r.nev} (${r.nev_ro})` : r.nev)
    }));
    varosCache = { ido: Date.now(), adat };
    return adat;
}

// A modell által írt városnév a mi nevünkre (ékezet és kis-nagybetű nélkül,
// a román név is jó: "Sfântu Gheorghe" -> Sepsiszentgyorgy)
const sima = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
async function varosNev(beirt) {
    if (!beirt) return null;
    const l = await varosok();
    const b = sima(beirt);
    const t = l.find(v => sima(v.nev) === b || sima(v.nev_ro) === b)
        || l.find(v => sima(v.nev).startsWith(b) || sima(v.nev_ro).startsWith(b));
    return t ? t.nev : null;
}
async function keruletNev(varos, beirt) {
    if (!beirt || !varos) return null;
    const r = await db.query("SELECT nev, nev_ro, aliasok FROM keruletek WHERE varos = $1", [varos]);
    const b = sima(beirt);
    const t = r.rows.find(k => [k.nev, k.nev_ro, ...String(k.aliasok || "").split(",")].some(x => x && sima(x) === b));
    return t ? t.nev : null;
}

// ---------- eszközök ----------
const ESZKOZOK = [
    {
        name: "hirdetes_kereses",
        description: "Aktív hirdetések keresése az IngatlanPro adatbázisában. Mindig ezt használd, ha a látogató hirdetéseket, konkrét ingatlant, árat keres. A válasz a találatok számát és legfeljebb 6 hirdetést ad; a hirdetések kártyaként automatikusan megjelennek a látogatónak a válaszod alatt, ezért ne sorold fel őket részletesen, csak foglald össze.",
        input_schema: {
            type: "object",
            properties: {
                varos: { type: "string", description: "A város neve (magyarul vagy románul), a rendszerszöveg listájából" },
                tipus: { type: "string", enum: TIPUSOK, description: "lakas = lakás/garzon, haz = ház, telek = telek, kereskedelmi = üzlethelyiség, iroda = iroda" },
                ugylet: { type: "string", enum: ["elado", "kiado"] },
                min_ar: { type: "number", description: "EUR (kiadónál havi EUR)" },
                max_ar: { type: "number" },
                min_nm: { type: "number" },
                max_nm: { type: "number" },
                min_szoba: { type: "integer" },
                max_szoba: { type: "integer" },
                kerulet: { type: "string", description: "Városrész neve, ha a látogató megadta" },
                rendezes: { type: "string", enum: ["legolcsobb", "legdragabb", "legolcsobb_nm", "legujabb", "legnagyobb"] }
            },
            required: ["varos"]
        }
    },
    {
        name: "piaci_adatok",
        description: "Egy város piaci átlagai az IngatlanPro aktív, ellenőrzött hirdetéseiből: átlagos és medián €/m², városrészenként is, darabszámmal. Árakról, drága/olcsó városrészekről szóló kérdésekhez.",
        input_schema: {
            type: "object",
            properties: {
                varos: { type: "string" },
                tipus: { type: "string", enum: TIPUSOK },
                ugylet: { type: "string", enum: ["elado", "kiado"] }
            },
            required: ["varos"]
        }
    },
    {
        name: "ertekbecsles",
        description: "Egy ingatlan becsült piaci ára a hasonló hirdetésekből (ugyanaz, mint az oldal Értékbecslője). Csak bejelentkezett látogatónak működik; ha nincs belépve, mondd el, hogy belépés után az Értékbecslő oldalon megkapja.",
        input_schema: {
            type: "object",
            properties: {
                varos: { type: "string" },
                tipus: { type: "string", enum: TIPUSOK },
                ugylet: { type: "string", enum: ["elado", "kiado"] },
                nm: { type: "number", description: "Hasznos alapterület m²-ben (kötelező)" },
                szobak: { type: "integer" },
                kerulet: { type: "string" },
                allapot: { type: "string", description: "Állapot a rendszerszöveg listájából" },
                emelet: { type: "string", description: "pl. \"2/4\" vagy \"0\" (földszint)" },
                evszam: { type: "integer", description: "Építés éve" }
            },
            required: ["varos", "nm"]
        }
    }
];

const RENDEZES = {
    legolcsobb: "i.ar ASC",
    legdragabb: "i.ar DESC",
    legolcsobb_nm: "(i.ar / NULLIF(i.nm, 0)) ASC",
    legujabb: "i.created_at DESC NULLS LAST, i.id DESC",
    legnagyobb: "i.nm DESC NULLS LAST"
};

async function hirdetesKereses(be) {
    const varos = await varosNev(be.varos);
    if (!varos) return { hiba: "ismeretlen_varos", varosok: (await varosok()).map(v => v.nev) };
    const tipus = TIPUSOK.includes(be.tipus) ? be.tipus : "lakas";
    const ugylet = be.ugylet === "kiado" ? "kiado" : "elado";

    const felt = ["i.statusz = 'aktiv'", "i.ar > 0", "COALESCE(i.tipus, 'lakas') = $2", "COALESCE(i.ugylet, 'elado') = $3"];
    const p = [varos, tipus, ugylet];
    // a város "és környéke" részét is (a falvak)
    felt.push("(i.varos = $1 OR i.varos IN (SELECT nev FROM varosok WHERE anyavaros = $1))");
    const szam = (k, op, oszlop) => { const v = Number(be[k]); if (Number.isFinite(v) && v > 0) { p.push(v); felt.push(`${oszlop} ${op} $${p.length}`); } };
    szam("min_ar", ">=", "i.ar"); szam("max_ar", "<=", "i.ar");
    szam("min_nm", ">=", "i.nm"); szam("max_nm", "<=", "i.nm");
    szam("min_szoba", ">=", "i.szobak"); szam("max_szoba", "<=", "i.szobak");
    let kerulet = null;
    if (be.kerulet) {
        kerulet = await keruletNev(varos, be.kerulet);
        if (kerulet) { p.push(kerulet); felt.push(`i.kerulet = $${p.length}`); }
    }

    const where = felt.join(" AND ");
    const db1 = await db.query(`SELECT COUNT(*)::int AS n, ROUND(AVG(i.ar / NULLIF(i.nm, 0)))::int AS arnm FROM ingatlanok i WHERE ${where}`, p);
    const r = await db.query(`
        SELECT i.id, i.tipus, i.ugylet, i.ar, i.nm, i.szobak, i.emelet, i.kerulet, i.telepules, i.allapot, i.evszam, i.telek_nm
        FROM ingatlanok i WHERE ${where}
        ORDER BY ${RENDEZES[be.rendezes] || RENDEZES.legujabb}
        LIMIT 6`, p);

    return {
        varos, tipus, ugylet, kerulet: kerulet || (be.kerulet ? `nem talált városrész: ${be.kerulet}` : null),
        talalatok_szama: db1.rows[0].n,
        atlag_eur_nm: db1.rows[0].arnm,
        hirdetesek: r.rows.map(i => ({
            id: i.id, ar_eur: Math.round(i.ar), nm: i.nm, szobak: i.szobak, emelet: i.emelet,
            hely: i.kerulet || i.telepules || null, allapot: i.allapot, epult: i.evszam,
            eur_nm: i.nm ? Math.round(i.ar / i.nm) : null, telek_nm: i.telek_nm
        }))
    };
}

async function piaciAdatok(be) {
    const varos = await varosNev(be.varos);
    if (!varos) return { hiba: "ismeretlen_varos", varosok: (await varosok()).map(v => v.nev) };
    const tipus = TIPUSOK.includes(be.tipus) ? be.tipus : "lakas";
    const ugylet = be.ugylet === "kiado" ? "kiado" : "elado";
    const p = [varos, tipus, ugylet];
    const alap = `FROM ingatlanok WHERE varos = $1 AND statusz = 'aktiv' AND ellenorzott IS NOT FALSE
        AND ar > 0 AND nm > 0 AND COALESCE(tipus, 'lakas') = $2 AND COALESCE(ugylet, 'elado') = $3`;
    const o = await db.query(`SELECT COUNT(*)::int AS db, ROUND(AVG(ar / nm))::int AS atlag,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ar / nm))::int AS median,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ar))::int AS median_ar ${alap}`, p);
    const k = await db.query(`SELECT kerulet, COUNT(*)::int AS db, ROUND(AVG(ar / nm))::int AS atlag
        ${alap} AND kerulet IS NOT NULL GROUP BY kerulet HAVING COUNT(*) >= 2 ORDER BY atlag DESC`, p);
    return {
        varos, tipus, ugylet,
        hirdetesek: o.rows[0].db, atlag_eur_nm: o.rows[0].atlag, median_eur_nm: o.rows[0].median, median_ar_eur: o.rows[0].median_ar,
        varosreszek: k.rows,
        megjegyzes: "Kért (hirdetési) árak, nem eladási árak."
    };
}

async function ertekbecsles(be, belepve) {
    if (!belepve) return { hiba: "belepes_kell", teendo: "Belépés után az Értékbecslő oldalon (#valuation) kapható meg." };
    const varos = await varosNev(be.varos);
    if (!varos) return { hiba: "ismeretlen_varos" };
    const params = {
        varos, tipus: TIPUSOK.includes(be.tipus) ? be.tipus : "lakas", ugylet: be.ugylet === "kiado" ? "kiado" : "elado",
        nm: be.nm, szobak: be.szobak || "", allapot: allapotok.kulcsok().includes(be.allapot) ? be.allapot : "",
        emelet: be.emelet || "", evszam: be.evszam || ""
    };
    if (be.kerulet) params.kerulet = (await keruletNev(varos, be.kerulet)) || "";
    const e = await becsles(params);
    if (e.error) return { hiba: e.error };
    return {
        becsult_ar_eur: e.estimate, also_eur: e.low, felso_eur: e.high, eur_nm: e.arNm,
        megbizhatosag: e.confidence, osszevetett_hirdetesek: e.poolCount, varosi_atlag_eur_nm: e.cityAvgArNm,
        megjegyzes: "Hirdetési árakból számolt becslés, nem hivatalos értékbecslés."
    };
}

// ---------- rendszerszöveg ----------
const NYELV = { hu: "magyarul", ro: "românește (románul)", en: "in English (angolul)" };

async function rendszer(lang, belepve, varos) {
    const v = await varosok();
    const lista = v.map(x => `- ${x.nev}${x.nev_ro ? ` (${x.nev_ro})` : ""}: ${x.db} hirdetés${x.anyavaros ? `, a(z) ${x.anyavaros} környékbeli falvai` : ""}${x.reszek.length ? `; városrészek: ${x.reszek.join(", ")}` : ""}`).join("\n");
    const allando = `Te az IngatlanPro asszisztense vagy. Az IngatlanPro egy romániai (erdélyi) ingatlanoldal: egy város összes ingatlanhirdetését gyűjti egy helyre (a saját feltöltések mellett más oldalakról – imobiliare.ro, OLX, Storia, Publi24 – átvett hirdetéseket is), piaci elemzést és értékbecslést ad.

FELADATOD: a látogatónak segíteni ingatlant találni, árakat megérteni, és eligazodni az oldalon. Barátságos, rövid és pontos vagy.

SZABÁLYOK
- Hirdetésekről, árakról CSAK az eszközök eredménye alapján beszélj. Soha ne találj ki hirdetést, árat, címet, telefonszámot, hirdetőt.
- Ha a látogató ingatlant keres, használd a hirdetes_kereses eszközt (ha nem mondta a várost, kérdezz rá, vagy használd az éppen kiválasztottat). Ha keveset ad meg, keress azzal, és utána kérdezz pontosítást (pl. ár, szobák, városrész).
- A talált hirdetések kártyaként a válaszod alatt megjelennek: ne másold ki az adataikat soronként, csak 1-2 mondatban foglald össze (pl. hány találat, ársáv, mi a legolcsóbb), és ajánlj szűkítést.
- Árak: euró; a hirdetési (kért) árakat ne nevezd eladási árnak. Ne adj befektetési, jogi vagy pénzügyi tanácsot – mondd, hogy ehhez szakember kell.
- Személyes adatot (telefonszám, e-mail, cím) ne kérj el és ne adj ki. A hirdetővel a hirdetés oldalán lehet kapcsolatba lépni.
- Ha a kérdés nem ingatlanokról vagy az oldalról szól, udvariasan térj vissza a témához.
- Formázás: rövid bekezdések, legfeljebb néhány pont "- " jellel, kiemelés **így**. Az oldal részeire hivatkozhatsz linkkel, PONTOSAN így: [Térkép](#map). Csak az alábbi címeket használd.
- A válasz legyen rövid: általában 2-5 mondat.

AZ OLDAL RÉSZEI (link → mire jó)
- [Ingatlanok](#properties): keresés szűrőkkel (ár, alapterület, szobák, emelet, állapot, városrész), kártyák vagy táblázat
- [Térkép](#map): a hirdetések térképen; a csak városrész-szinten ismert helyűek körrel
- [Kedvencek](#favorites): a csillaggal megjelölt hirdetések (belépve)
- [Értékbecslő](#valuation): mennyit ér egy ingatlan a hasonló hirdetések alapján, és drága-e egy kért ár (belépve)
- [Piaci elemzés](#market): átlag- és medián €/m² városrész, állapot, szobaszám, emelet szerint, ártrendek
- [Hirdetés feladása](#new): saját hirdetés feltöltése pár perc alatt (belépve)
- [Keresek](#igenyek): add fel, mit keresel, és az eladók ajánlanak
- [Ingatlanirodák](#irodak): ellenőrzött irodák és hirdetéseik
- [Csomagok és árak](#csomagok): ingyenes és fizetős csomagok magánszemélyeknek, irodáknak
- [Eladjuk helyetted](#eladjuk): megbízás, mi intézzük az eladást (fotózás, hirdetés, vevők), sikerdíjért
- [Súgó](#sugo): részletes útmutató; [Fiókom](#fiok/profil): profil, üzenetek, értesítések, mentett keresések
- Más oldalról átvett hirdetésre kattintva az eredeti hirdetés nyílik meg (ott van a leírás és a hirdető elérhetősége).

VÁROSOK ÉS VÁROSRÉSZEK (csak ezekben vannak hirdetések)
${lista}

Állapot-értékek (az eszközökhöz): ${allapotok.kulcsok().join(", ")}.`;

    const valtozo = `A látogató ${belepve ? "be van jelentkezve" : "nincs bejelentkezve (a kedvencekhez, értékbecsléshez, hirdetésfeladáshoz be kell lépni)"}. Az oldalon kiválasztott város: ${varos || "nincs"}. A mai dátum: ${new Date().toISOString().slice(0, 10)}.
Válaszolj ${NYELV[lang] || NYELV.hu}, a látogató nyelvén (ha más nyelven ír, azon).`;

    return [
        { type: "text", text: allando, cache_control: { type: "ephemeral" } },
        { type: "text", text: valtozo }
    ];
}

// ---------- az API hívása ----------
async function hiv(body, modell) {
    const res = await fetch((process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") + "/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        },
        body: JSON.stringify({ ...body, model: modell }),
        signal: AbortSignal.timeout(40000)
    });
    const v = await res.json().catch(() => ({}));
    if (!res.ok) {
        const e = new Error((v.error && v.error.message) || "HTTP " + res.status);
        e.status = res.status;
        e.tipus = v.error && v.error.type;
        throw e;
    }
    return v;
}

let aktivModell = MODELL;
async function kerdez(body) {
    try {
        return await hiv(body, aktivModell);
    } catch (e) {
        // A beállított modell már nem érhető el: az újabbal próbáljuk
        if ((e.status === 404 || e.tipus === "not_found_error") && aktivModell !== TARTALEK_MODELL) {
            aktivModell = TARTALEK_MODELL;
            return hiv(body, aktivModell);
        }
        throw e;
    }
}

// A látogató üzenetei: csak szöveg, legfeljebb 12, egyenként legfeljebb 1500 karakter
function tisztit(uzenetek) {
    const l = (Array.isArray(uzenetek) ? uzenetek : [])
        .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
        .slice(-12)
        .map(m => ({ role: m.role, content: m.content.trim().slice(0, 1500) }));
    while (l.length && l[0].role !== "user") l.shift();
    // egymás utáni azonos szerepek összevonása (az API váltakozást kér)
    const out = [];
    l.forEach(m => {
        const elozo = out[out.length - 1];
        if (elozo && elozo.role === m.role) elozo.content += "\n\n" + m.content;
        else out.push({ ...m });
    });
    return out.length && out[out.length - 1].role === "user" ? out : null;
}

async function valasz({ uzenetek, lang, varos, belepve }) {

    const messages = tisztit(uzenetek);
    if (!messages) return { hiba: "ures" };

    const system = await rendszer(["hu", "ro", "en"].includes(lang) ? lang : "hu", belepve, varos);
    const tools = ESZKOZOK.map((t, n) => n === ESZKOZOK.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t);

    let hirdetesIdk = [];
    let kereses = null;

    for (let kor = 0; kor < 4; kor++) {

        const v = await kerdez({ max_tokens: 700, system, tools, messages });

        const eszkozok = (v.content || []).filter(c => c.type === "tool_use");
        if (v.stop_reason !== "tool_use" || !eszkozok.length) {
            const szoveg = (v.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").trim();
            return { valasz: szoveg, hirdetesek: [...new Set(hirdetesIdk)].slice(0, 6), kereses };
        }

        messages.push({ role: "assistant", content: v.content });

        const eredmenyek = [];
        for (const t of eszkozok) {
            let ered;
            try {
                if (t.name === "hirdetes_kereses") {
                    ered = await hirdetesKereses(t.input || {});
                    if (ered.hirdetesek) {
                        hirdetesIdk = ered.hirdetesek.map(h => h.id);    // az utolsó keresés találatai
                        kereses = { varos: ered.varos, tipus: ered.tipus, ugylet: ered.ugylet, db: ered.talalatok_szama };
                    }
                } else if (t.name === "piaci_adatok") ered = await piaciAdatok(t.input || {});
                else if (t.name === "ertekbecsles") ered = await ertekbecsles(t.input || {}, belepve);
                else ered = { hiba: "ismeretlen_eszkoz" };
            } catch (e) {
                console.error("AI asszisztens eszköz hiba:", t.name, e.message);
                ered = { hiba: "belso_hiba" };
            }
            eredmenyek.push({ type: "tool_result", tool_use_id: t.id, content: JSON.stringify(ered).slice(0, 6000) });
        }
        messages.push({ role: "user", content: eredmenyek });

    }

    return { valasz: "", hirdetesek: [...new Set(hirdetesIdk)].slice(0, 6), kereses };

}

module.exports = { elerheto, korlat, valasz, _belso: { hirdetesKereses, piaciAdatok, ertekbecsles, tisztit, rendszer } };
