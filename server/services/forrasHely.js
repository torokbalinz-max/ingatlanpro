// ============================================================
//  Forrásoldalak pontos adatai – a valódi forrás és a pontos hely
//
//  1. Közvetítő (Imoradar24) helyett a valódi forrásoldal:
//     az Imoradar24 az OLX / Publi24 / Homezz... hirdetéseit csak
//     "link-extern" címmel adja, ami bejelentkezés nélkül nem visz
//     tovább. Az OLX-es hirdetéseket az OLX nyilvános adataiból
//     megkeressük (ár + alapterület + szobák egyezése a városban), és
//     a hirdetés az eredeti OLX linket kapja – a pontos hellyel együtt.
//     Ha nem található, a link az Imoradar24 adatlapja lesz (az legalább
//     bejelentkezés nélkül is megnyílik), és a teljes leírást onnan vesszük.
//
//  2. A forrásoldal saját térképes helye (amit a hirdető megadott):
//     - OLX: map.lat / lon / radius (km); radius 0 = pontos
//     - Storia: location.coordinates + mapDetails.radius (m)
//     A hely szintje ebből: pontos (≤ 150 m), közelítő (≤ 1,5 km –
//     csak a hirdetés körzete), a városnyi kört nem használjuk.
// ============================================================

const { biztonsagosFetch } = require("../lib/biztonsagosFetch");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const CACHE_IDO = 30 * 60 * 1000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
    const res = await biztonsagosFetch(url, {
        headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "ro-RO,ro;q=0.9" },
        signal: AbortSignal.timeout(20000)
    });
    if (res.status >= 400) throw new Error("HTTP " + res.status);
    return res.json();
}

async function getHtml(url) {
    const res = await biztonsagosFetch(url, {
        headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ro-RO,ro;q=0.9" },
        signal: AbortSignal.timeout(25000)
    });
    if (res.status >= 400) throw new Error("HTTP " + res.status);
    return res.text();
}

const ekezetNelkul = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = s => ekezetNelkul(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- Közvetítő linkek ----------

// Az Imoradar24 "link-extern" címe (bejelentkezés nélkül nem visz tovább)
function kozvetitoLink(link) {
    return /imoradar24\.ro\/link-extern\//i.test(String(link || ""));
}

// Közvetítő oldal (nem a hirdetés valódi forrása)
function kozvetitoOldal(link) {
    return /imoradar24\.ro\//i.test(String(link || ""));
}

// ---------- Hely szintje a forrás köréből ----------

//  sugarM: a forrásoldal köre méterben (0 = pontos)
//  -> { hely_pontossag, hely_sugar } vagy null (túl pontatlan – nem használjuk)
function helySzint(sugarM) {
    const r = Number(sugarM);
    if (!(r >= 0)) return null;
    if (r <= 150) return { hely_pontossag: "pontos", hely_sugar: null };
    if (r <= 1500) return { hely_pontossag: "kozelito", hely_sugar: Math.max(300, Math.round(r)) };
    return null;
}

// ---------- OLX ----------

const olxVarosCache = new Map();      // városnév (ro) -> { id, ido }
const olxListaCache = new Map();      // city_id -> { lista, ido }

async function olxVarosId(varosRo) {
    const k = slug(varosRo);
    if (!k) return null;
    const c = olxVarosCache.get(k);
    if (c && Date.now() - c.ido < 24 * 3600 * 1000) return c.id;
    let id = null;
    try {
        const j = await getJson(`https://www.olx.ro/api/v1/friendly-links/query-params/${encodeURIComponent(k)}`);
        id = j && j.data && j.data.city_id ? Number(j.data.city_id) : null;
    } catch (e) {
        id = null;
    }
    olxVarosCache.set(k, { id, ido: Date.now() });
    return id;
}

// Egy OLX ajánlat paraméterei egyszerű formában
function olxParam(o, kulcs) {
    const p = (o.params || []).find(x => x.key === kulcs);
    if (!p || !p.value) return null;
    const v = p.value;
    return v.value !== undefined ? v.value : (v.key !== undefined ? v.key : v.label);
}

const OLX_SZOBA_KAT = { 1163: 1, 1165: 2, 1167: 3, 1169: 4 };

function olxEmelet(v) {
    const s = String(v || "");
    if (!s) return null;
    if (/parter/i.test(s)) return "0";
    if (/demisol|subsol/i.test(s)) return "-1";
    const m = s.match(/(\d{1,2})/);
    return m ? m[1] : null;
}

// Egy OLX ajánlat -> a beolvasás adatai
function olxAdat(o) {

    const arObj = ((o.params || []).find(x => x.key === "price") || {}).value || {};
    let ar = Number(arObj.value) || null;
    if (ar && arObj.currency && /ron|lei/i.test(arObj.currency)) {
        ar = arObj.converted_currency === "EUR" && arObj.converted_value ? Number(arObj.converted_value) : Math.round(ar / 5);
    }

    const map = o.map || {};
    const sugarM = map.show_detailed ? 0 : (Number(map.radius) >= 0 ? Number(map.radius) * 1000 : null);
    const szint = map.lat && map.lon ? helySzint(sugarM) : null;

    const kepek = (o.photos || [])
        .map(p => String(p.link || "").replace("{width}", "1200").replace("{height}", "900"))
        .filter(u => /^https?:\/\//.test(u))
        .slice(0, 20);

    const szobak = Number(olxParam(o, "rooms")) || OLX_SZOBA_KAT[o.category && o.category.id] || null;

    return {
        link: String(o.url || "").split("#")[0].split("?")[0],
        ar,
        nm: Number(String(olxParam(o, "m") || "").replace(",", ".")) || null,
        szobak,
        emelet: olxEmelet(olxParam(o, "floor")),
        leiras: o.description ? String(o.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000) : null,
        cim: o.title || null,
        x: szint ? Number(map.lon) : null,
        y: szint ? Number(map.lat) : null,
        hely: szint,
        kerulet: o.location && o.location.district ? o.location.district.name : null,
        kulso_kepek: kepek
    };

}

// Egy város összes OLX-es ingatlanhirdetése (Imobiliare kategória), gyorstárral
async function olxVarosAjanlatai(cityId) {

    const c = olxListaCache.get(cityId);
    if (c && Date.now() - c.ido < CACHE_IDO) return c.lista;

    const lista = [];
    const latott = new Set();

    for (let offset = 0; offset < 1000; offset += 50) {
        let j;
        try {
            j = await getJson(`https://www.olx.ro/api/v1/offers/?offset=${offset}&limit=50&category_id=3&city_id=${cityId}`);
        } catch (e) {
            break;
        }
        const d = (j && j.data) || [];
        let uj = 0;
        d.forEach(o => { if (o && o.id && !latott.has(o.id)) { latott.add(o.id); lista.push(o); uj++; } });
        if (!uj || !(j.links && j.links.next)) break;
        await sleep(400);
    }

    olxListaCache.set(cityId, { lista, ido: Date.now() });
    return lista;

}

// Az Imoradar24 adataival egyező OLX hirdetés (ár ±1%, alapterület ±1,5 m²,
// és ha mindkettőnél ismert: szobák, emelet). Csak egyértelmű egyezést fogadunk el.
async function olxKeres(d, varosRo) {

    if (!(d.ar > 0)) return null;

    const cityId = await olxVarosId(varosRo);
    if (!cityId) return null;

    const lista = await olxVarosAjanlatai(cityId);
    if (!lista.length) return null;

    const jeloltek = lista.map(olxAdat).filter(o => {
        if (!(o.ar > 0) || Math.abs(o.ar - d.ar) > d.ar * 0.01) return false;
        if (d.nm > 0 && o.nm > 0 && Math.abs(o.nm - d.nm) > 1.5) return false;
        if (d.szobak > 0 && o.szobak > 0 && o.szobak !== d.szobak && !(o.szobak === 4 && d.szobak > 4)) return false;
        if (d.emelet && o.emelet !== null && String(d.emelet).split("/")[0] !== o.emelet) return false;
        return true;
    });

    // Ha az alapterület az egyik oldalon hiányzik, csak egyetlen ilyen árú hirdetést fogadunk el
    return jeloltek.length === 1 ? jeloltek[0] : null;

}

// Egy OLX hirdetés oldala: window.__PRERENDERED_STATE__ (benne a hirdetés minden adata)
function olxOldalbol(html) {
    const m = html.match(/window\.__PRERENDERED_STATE__\s*=\s*("(?:[^"\\]|\\.)*")/);
    if (!m) return null;
    try {
        const st = JSON.parse(JSON.parse(m[1]));
        const ad = st && st.ad && st.ad.ad;
        if (!ad) return null;
        // Az oldal formája kicsit más, mint az API-é: az alakítás után ugyanaz
        const o = {
            url: ad.url,
            title: ad.title,
            description: ad.description,
            map: ad.map,
            location: { district: ad.location && ad.location.districtName ? { name: ad.location.districtName } : null },
            photos: (ad.photos || []).map(p => ({ link: typeof p === "string" ? p : p.link })),
            params: (ad.params || []).map(p => ({ key: p.key, value: { value: p.normalizedValue !== undefined ? p.normalizedValue : p.value, key: p.normalizedValue, label: p.value } })),
            category: ad.category
        };
        const a = olxAdat(o);
        // Ár: a kiírt euró érték (a "regularPrice" lejben is jöhet, pl. 43 500 € = 232 245 lei)
        if (ad.price) {
            const kiirt = String(ad.price.displayValue || "");
            const rp = ad.price.regularPrice || {};
            if (/€|eur/i.test(kiirt)) a.ar = Number(kiirt.replace(/[^\d]/g, "")) || null;
            else if (rp.value) a.ar = /ron|lei/i.test(rp.currencyCode || "") ? Math.round(Number(rp.value) / 5) : Number(rp.value);
        }
        return a;
    } catch (e) {
        return null;
    }
}

// ---------- Storia ----------

function nextData(html) {
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
}

// Storia hirdetés oldala: pontos koordináta + a kör sugara + utca
function storiaOldalbol(html) {
    const nd = nextData(html);
    const ad = nd && nd.props && nd.props.pageProps && nd.props.pageProps.ad;
    if (!ad || !ad.location) return null;
    const loc = ad.location;
    const c = loc.coordinates || {};
    const sugar = loc.mapDetails && loc.mapDetails.radius !== undefined ? Number(loc.mapDetails.radius) : null;
    const szint = c.latitude && c.longitude ? helySzint(sugar === null ? 0 : sugar) : null;
    const a = loc.address || {};
    const utca = a.street && a.street.name ? [a.street.name, a.street.number].filter(Boolean).join(" ") : null;
    return {
        x: szint ? Number(c.longitude) : null,
        y: szint ? Number(c.latitude) : null,
        hely: szint,
        utca,
        kerulet: (a.district && a.district.name) || (a.subdistrict && a.subdistrict.name) || null
    };
}

// Storia találati lista: minden hirdetés fő adata (az utcával és a kör sugarával –
// a pontos koordináta csak a hirdetés oldalán van, azt külön kérjük le)
function storiaListabol(html) {
    const nd = nextData(html);
    const items = nd && nd.props && nd.props.pageProps && nd.props.pageProps.data && nd.props.pageProps.data.searchAds && nd.props.pageProps.data.searchAds.items;
    if (!Array.isArray(items)) return [];
    return items.filter(it => it && it.slug).map(it => {
        const a = (it.location && it.location.address) || {};
        const utca = a.street && a.street.name ? [a.street.name, a.street.number].filter(Boolean).join(" ") : null;
        const ar = it.totalPrice ? (/ron|lei/i.test(it.totalPrice.currency || "") ? Math.round(it.totalPrice.value / 5) : it.totalPrice.value) : null;
        const em = String(it.floorNumber || "").match(/(\d+)|ground|parter/i);
        return {
            link: `https://www.storia.ro/ro/oferta/${it.slug}`,
            cim: it.title || null,
            ar: Number(ar) || null,
            penznem: "EUR",
            nm: Number(it.areaInSquareMeters) || null,
            telek_nm: Number(it.terrainAreaInSquareMeters) || null,
            szobak: { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10 }[String(it.roomsNumber || "").toUpperCase()] || Number(it.roomsNumber) || null,
            emelet: em ? (em[1] || "0") : null,
            leiras: it.shortDescription || null,
            utca,
            kerulet: null,
            x: null, y: null,
            kulso_kepek: (it.images || []).map(i => i.large || i.medium).filter(Boolean).slice(0, 20),
            elerheto: true,
            forrasok: { osszes: "kereses" },
            storiaReszlet: true
        };
    });
}

// ---------- Imoradar24 adatlap (a teljes leírás a közvetített hirdetéseknél) ----------

async function imoradarLeiras(url) {
    try {
        const html = await getHtml(url);
        const cheerio = require("cheerio");
        const $ = cheerio.load(html);
        $("script, style, noscript, svg").remove();
        const text = $("body").text().replace(/\s+/g, " ");
        const m = text.match(/Descriere(?: anun[tț])?\s+(.{40,5000}?)(?:Cite[sș]te mai (?:mult|pu[tț]in)|Caracteristici|Detalii|Localizare|$)/i);
        return m ? m[1].trim() : null;
    } catch (e) {
        return null;
    }
}

// ---------- A beolvasott adat kiegészítése ----------

//  d:      a forrásból (lista / oldal) kiolvasott adat – helyben módosítjuk
//  varosRo: a város román neve (az OLX kereséshez)
//  -> d (a valódi linkkel, pontos hellyel, ha sikerült)
async function gazdagit(d, varosRo) {

    // 1) Közvetítő link (Imoradar24 link-extern): a valódi forrás keresése
    if (kozvetitoLink(d.link)) {

        const forras = String(d.forrasNev || "").toLowerCase();
        let talalt = null;

        if (/olx/.test(forras) && varosRo) {
            talalt = await olxKeres(d, varosRo).catch(() => null);
        }

        if (talalt) {
            d.kozvetitoLink = d.link;
            d.link = talalt.link;
            if (talalt.leiras && (!d.leiras || d.leiras.length < talalt.leiras.length)) d.leiras = talalt.leiras;
            if (talalt.hely) { d.x = talalt.x; d.y = talalt.y; d.forrasHely = talalt.hely; }
            if (!d.kulso_kepek || !d.kulso_kepek.length) d.kulso_kepek = talalt.kulso_kepek;
            if (!d.emelet && talalt.emelet) d.emelet = talalt.emelet;
            d.valodiForras = "olx";
        } else {
            // Nem találtuk meg: az Imoradar24 adatlapja (bejelentkezés nélkül is megnyílik)
            d.kozvetitoLink = d.link;
            if (d.reszletUrl) {
                d.link = d.reszletUrl;
                const leiras = await imoradarLeiras(d.reszletUrl);
                if (leiras && (!d.leiras || d.leiras.length < leiras.length)) d.leiras = leiras;
            }
            d.kozvetito = "imoradar24";
        }

        return d;
    }

    // 2) Storia lista eleme: a pontos hely a hirdetés oldaláról
    if (d.storiaReszlet && /storia\.ro\//i.test(d.link)) {
        try {
            const s = storiaOldalbol(await getHtml(d.link));
            if (s) {
                if (s.hely) { d.x = s.x; d.y = s.y; d.forrasHely = s.hely; }
                if (s.utca && !d.utca) d.utca = s.utca;
                if (s.kerulet && !d.kerulet) d.kerulet = s.kerulet;
            }
        } catch (e) { /* letiltva / nem elérhető – marad az utca és a kerület */ }
        await sleep(500);
    }

    return d;

}

module.exports = {
    gazdagit, kozvetitoLink, kozvetitoOldal, helySzint,
    olxOldalbol, storiaOldalbol, storiaListabol, olxKeres, olxVarosId, olxVarosAjanlatai, olxAdat, slug
};
