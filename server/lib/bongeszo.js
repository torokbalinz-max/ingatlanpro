// ============================================================
//  A forrásoldalak lekéréséhez: egy valódi böngésző fejlécei
//
//  Sok hirdetési oldal (pl. OLX, Storia) bot-védelme letiltja (HTTP 403)
//  a régi böngészőverziót vagy a hiányos fejléceket küldő kéréseket. Ezért
//  egy friss Chrome fejléceit küldjük – a verziószám a dátumból számolódik
//  (a Chrome kb. 4 hetente lép egyet), így nem „öregszik el”.
// ============================================================

function chromeVerzio() {
    // Chrome 126: 2024. június 11.; utána kb. 28 naponként egy új verzió
    const het4 = Math.floor((Date.now() - Date.UTC(2024, 5, 11)) / (28 * 24 * 3600 * 1000));
    return Math.max(126, 126 + het4 - 1);
}

function userAgent() {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVerzio()}.0.0.0 Safari/537.36`;
}

// Egy weboldal megnyitása (mintha a címsorba írták volna)
function oldalFejlecek(extra = {}) {
    const v = chromeVerzio();
    return {
        "User-Agent": userAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "ro-RO,ro;q=0.9,hu;q=0.8,en-US;q=0.7,en;q=0.6",
        "Sec-CH-UA": `"Chromium";v="${v}", "Google Chrome";v="${v}", "Not.A/Brand";v="99"`,
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": "\"Windows\"",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        ...extra
    };
}

// Egy kép lekérése (mintha egy oldalon jelenne meg)
function kepFejlecek(referer, extra = {}) {
    const v = chromeVerzio();
    return {
        "User-Agent": userAgent(),
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.7",
        "Sec-CH-UA": `"Chromium";v="${v}", "Google Chrome";v="${v}", "Not.A/Brand";v="99"`,
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": "\"Windows\"",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
        ...(referer ? { "Referer": referer } : {}),
        ...extra
    };
}

module.exports = { chromeVerzio, userAgent, oldalFejlecek, kepFejlecek };
