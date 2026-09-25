// ============================================================
//  AI-ellenőrzés (nem kötelező): ha van ANTHROPIC_API_KEY,
//  a forrásoldal szövegét és a kiolvasott adatokat összeveti,
//  és javaslatot ad a javításra. Hirdetésenként kb. 0,1–0,3 cent.
// ============================================================

const MODEL = process.env.AI_MODEL || "claude-haiku-4-5";

function elerheto() {
    return !!process.env.ANTHROPIC_API_KEY;
}

async function ellenoriz(i) {

    if (!elerheto()) throw new Error("no_api_key");

    const adatok = {
        tipus: i.tipus, ugylet: i.ugylet, ar_eur: i.ar, alapterulet_m2: i.nm, szobak: i.szobak,
        emelet: i.emelet, allapot: i.allapot, kerulet: i.kerulet, telek_m2: i.telek_nm, epites_eve: i.evszam
    };

    const prompt = `Egy ingatlanhirdetés adatait kell ellenőrizned. Összevetni a forrásoldal szövegével, és megtalálni a hibás vagy hiányzó értékeket.

A FORRÁSOLDAL SZÖVEGE (román nyelvű hirdetés):
"""
${String(i.forras_szoveg || i.leiras || "").slice(0, 5000)}
"""

A MI ADATBÁZISUNKBAN LÉVŐ ADATOK:
${JSON.stringify(adatok, null, 2)}

Szabályok:
- tipus: lakas | haz | telek | kereskedelmi | iroda ; ugylet: elado | kiado
- allapot: felújítandó | részbenfel | jó | újszerű | luxus
- emelet formátum: "emelet/összes", pl. "4/4", földszint = "0"
- Az "alapterulet_m2" a hasznos (utilă) terület.
- Csak akkor javasolj módosítást, ha a szöveg egyértelműen mást mond, vagy az érték hiányzik és a szövegben szerepel.

Válaszolj KIZÁRÓLAG egy JSON objektummal, magyarázó szöveg nélkül:
{"rendben": true/false, "javaslatok": [{"mezo": "...", "ertek": ..., "indok": "rövid magyar indoklás"}], "megjegyzes": "egy mondat magyarul"}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: 800,
            messages: [{ role: "user", content: prompt }]
        }),
        signal: AbortSignal.timeout(45000)
    });

    const v = await res.json();

    if (!res.ok) throw new Error(v.error ? v.error.message : "HTTP " + res.status);

    const szoveg = (v.content || []).map(c => c.text || "").join("");
    const m = szoveg.match(/\{[\s\S]*\}/);

    if (!m) throw new Error("bad_ai_response");

    const eredmeny = JSON.parse(m[0]);

    // Mezőnevek a mi adatbázisunk nevére
    const map = { ar_eur: "ar", alapterulet_m2: "nm", telek_m2: "telek_nm", epites_eve: "evszam" };

    eredmeny.javaslatok = (eredmeny.javaslatok || []).map(j => ({ ...j, mezo: map[j.mezo] || j.mezo }));

    return eredmeny;

}

module.exports = { elerheto, ellenoriz };
