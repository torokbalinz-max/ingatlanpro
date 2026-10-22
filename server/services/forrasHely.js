// ============================================================
//  Forrásoldalak pontos adatai – a valódi forrás és a pontos hely
//
//  1. Közvetítő (Imoradar24) helyett a valódi forrásoldal:
//     az Imoradar24 az OLX / Storia / Publi24 / Homezz... hirdetéseit csak
//     "link-extern" címmel adja, ami bejelentkezés nélkül nem visz
//     tovább (és az Imoradar24 adatlapja is csak belépve mutat bármit).
//     Az OLX-es és a Storiás hirdetéseket a forrásoldal nyilvános
//     listájából megkeressük (ár + alapterület + szobák + emelet egyezése
//     a városban), és a hirdetés az eredeti linket kapja – OLX-nél a
//     pontos hellyel együtt.
//     Ha nem található: a forrásoldal szűrt keresése (forras_kereso – ár és
//     alapterület szerint, ez rendszerint épp azt az egy hirdetést adja),
//     a látogatót SOSEM küldjük az Imoradar24-re. A leírást az Imoradar24
//     adatlapjáról vesszük. A már bent lévő közvetített hirdetéseket a
//     javitMind() fokozatosan kicseréli (indulás után és a napi futásnál).
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

    // Csak egyértelmű egyezést fogadunk el; több jelöltnél a cím dönthet
    if (jeloltek.length === 1) return jeloltek[0];
    return cimSzerint(jeloltek, d.cim);

}

// Több egyező jelöltből az, amelyiknek a címe (szinte) ugyanaz – különben senki
function cimSzerint(jeloltek, cim) {
    const n = x => slug(x).replace(/-/g, " ");
    const c = n(cim);
    if (!c) return null;
    const egyezo = jeloltek.filter(o => o.cim && n(o.cim) === c);
    return egyezo.length === 1 ? egyezo[0] : null;
}

// A forrás neve egységesen ("OLX.ro" -> "olx", "storia.ro" -> "storia")
function forrasKulcs(nev, link) {
    const s = String(nev || "").toLowerCase() + " " + String(link || "").toLowerCase();
    for (const k of ["olx", "storia", "publi24", "homezz", "anuntul", "lajumate", "romimo", "imobiliare"]) if (s.includes(k)) return k;
    return null;
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

// Storia: a város találati listájának címe (a forrás szűrt kereséséhez is)
const STORIA_TIPUS = { lakas: "apartament", haz: "casa", telek: "teren", kereskedelmi: "spatiu-comercial", iroda: "birou" };

function storiaListaUrl({ megye, varosRo, tipus, ugylet }, szuro = {}) {
    if (!megye || !varosRo) return null;
    const t = STORIA_TIPUS[tipus || "lakas"] || "apartament";
    const q = new URLSearchParams();
    if (szuro.arTol) q.set("priceMin", String(Math.floor(szuro.arTol)));
    if (szuro.arIg) q.set("priceMax", String(Math.ceil(szuro.arIg)));
    if (szuro.nmTol) q.set("areaMin", String(Math.floor(szuro.nmTol)));
    if (szuro.nmIg) q.set("areaMax", String(Math.ceil(szuro.nmIg)));
    if (szuro.limit) q.set("limit", String(szuro.limit));
    if (szuro.page) q.set("page", String(szuro.page));
    const qs = q.toString();
    return `https://www.storia.ro/ro/rezultate/${ugylet === "kiado" ? "inchiriere" : "vanzare"}/${t}/${slug(megye)}/${slug(varosRo)}${qs ? "?" + qs : ""}`;
}

const storiaListaCache = new Map();

async function storiaVarosAjanlatai(hely) {
    const kulcs = JSON.stringify(hely);
    const c = storiaListaCache.get(kulcs);
    if (c && Date.now() - c.ido < CACHE_IDO) return c.lista;
    const lista = [];
    const latott = new Set();
    for (let page = 1; page <= 12; page++) {
        const url = storiaListaUrl(hely, { limit: 72, page });
        if (!url) break;
        let elemek;
        try { elemek = storiaListabol(await getHtml(url)); } catch (e) { break; }
        let uj = 0;
        elemek.forEach(o => { if (!latott.has(o.link)) { latott.add(o.link); lista.push(o); uj++; } });
        if (!uj || elemek.length < 72) break;
        await sleep(600);
    }
    storiaListaCache.set(kulcs, { lista, ido: Date.now() });
    return lista;
}

// Az Imoradar24 adataival egyező Storia hirdetés (ugyanazok a szabályok, mint az OLX-nél)
async function storiaKeres(d, hely) {
    if (!(d.ar > 0) || !hely || !hely.megye) return null;
    const lista = await storiaVarosAjanlatai(hely);
    const jeloltek = lista.filter(o => {
        if (!(o.ar > 0) || Math.abs(o.ar - d.ar) > d.ar * 0.01) return false;
        if (d.nm > 0 && o.nm > 0 && Math.abs(o.nm - d.nm) > 1.5) return false;
        if (d.szobak > 0 && o.szobak > 0 && o.szobak !== d.szobak) return false;
        if (d.emelet && o.emelet !== null && o.emelet !== undefined && String(d.emelet).split("/")[0] !== String(o.emelet)) return false;
        return true;
    });
    if (jeloltek.length === 1) return jeloltek[0];
    return cimSzerint(jeloltek, d.cim);
}

// Ha az eredeti hirdetést nem találjuk: a forrásoldal szűrt keresése
// (ár ±2 %, alapterület ±2 m²) – rendszerint épp azt az egy hirdetést adja
function forrasKereso(forras, d, hely) {
    const ar = Number(d.ar) || 0, nm = Number(d.nm) || 0;
    if (forras === "storia" && hely && hely.megye) {
        return storiaListaUrl(hely, { arTol: ar ? ar * 0.98 : null, arIg: ar ? ar * 1.02 : null, nmTol: nm ? nm - 2 : null, nmIg: nm ? nm + 2 : null });
    }
    if (forras === "olx") {
        const szavak = slug(d.cim || "").split("-").filter(Boolean).slice(0, 8).join("-");
        const varos = hely && hely.varosRo ? slug(hely.varosRo) : "";
        const q = new URLSearchParams();
        if (ar) { q.set("search[filter_float_price:from]", String(Math.floor(ar * 0.98))); q.set("search[filter_float_price:to]", String(Math.ceil(ar * 1.02))); q.set("currency", "EUR"); }
        if (szavak) return `https://www.olx.ro/imobiliare/${varos ? varos + "/" : ""}q-${szavak}/${q.toString() ? "?" + q : ""}`;
        return `https://www.olx.ro/imobiliare/${varos ? varos + "/" : ""}${q.toString() ? "?" + q : ""}`;
    }
    if (forras === "publi24" && d.cim) return `https://www.publi24.ro/anunturi/imobiliare/?q=${encodeURIComponent(String(d.cim).slice(0, 80))}`;
    return null;
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

// A valódi forrás keresése a hirdetés adataiból (OLX vagy Storia; ha a forrás
// nem ismert, mindkettő) -> { link, forras, adat } | null
async function valodiForrasKeres(d, hely, forras) {
    if (forras !== "storia" && hely && hely.varosRo) {
        const o = await olxKeres(d, hely.varosRo).catch(() => null);
        if (o) return { link: o.link, forras: "olx", adat: o };
        if (forras === "olx") return null;
    }
    if (forras !== "olx" && hely && hely.megye) {
        const st = await storiaKeres(d, { ...hely, tipus: d.tipus || hely.tipus, ugylet: d.ugylet || hely.ugylet }).catch(() => null);
        if (st) return { link: st.link, forras: "storia", adat: st };
    }
    return null;
}

//  d:     a forrásból (lista / oldal) kiolvasott adat – helyben módosítjuk
//  hely:  { varosRo, megye, tipus, ugylet } (régi hívóknál csak a város román neve)
//  -> d (a valódi linkkel, pontos hellyel, ha sikerült)
async function gazdagit(d, hely) {

    if (typeof hely === "string" || !hely) hely = { varosRo: hely || null };

    // 1) Közvetítő link (Imoradar24 link-extern): a valódi forrás keresése
    if (kozvetitoLink(d.link)) {

        const forras = forrasKulcs(d.forrasNev);
        d.forrasKulcs = forras;
        const t = (forras === "olx" || forras === "storia") ? await valodiForrasKeres(d, { ...hely, tipus: d.tipus, ugylet: d.ugylet }, forras) : null;
        const talalt = t ? t.adat : null;

        if (talalt) {
            d.kozvetitoLink = d.link;
            d.link = t.link;
            if (talalt.leiras && (!d.leiras || d.leiras.length < talalt.leiras.length)) d.leiras = talalt.leiras;
            if (talalt.hely) { d.x = talalt.x; d.y = talalt.y; d.forrasHely = talalt.hely; }
            if (!d.kulso_kepek || !d.kulso_kepek.length) d.kulso_kepek = talalt.kulso_kepek;
            if (!d.emelet && talalt.emelet) d.emelet = talalt.emelet;
            d.valodiForras = t.forras;
            d.forrasKulcs = t.forras;
            // Storia: a pontos hely a hirdetés oldaláról (lent, a 2. lépésben)
            if (t.forras === "storia") d.storiaReszlet = true;
        } else {
            // Nem találtuk meg: a link az Imoradar24 adatlapja marad (a leírásért),
            // de a látogató a forrásoldal szűrt keresésére megy (forras_kereso)
            d.kozvetitoLink = d.link;
            if (d.reszletUrl) {
                d.link = d.reszletUrl;
                const leiras = await imoradarLeiras(d.reszletUrl);
                if (leiras && (!d.leiras || d.leiras.length < leiras.length)) d.leiras = leiras;
            }
            d.kozvetito = "imoradar24";
            d.forrasKereso = forrasKereso(forras, d, hely);
            return d;
        }
        if (!d.storiaReszlet) return d;
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

// ---------- A már bent lévő közvetített hirdetések javítása ----------
//  Az Imoradar24-re mutató hirdetéseknél újra megkeressük a valódi forrást
//  (a mentett adatokból); ha megvan, a link arra cserélődik (a régi a
//  kulso_azon-ba kerül, hogy a következő beolvasás is felismerje), ha nincs,
//  legalább a forrásoldal szűrt keresése (forras_kereso) elkészül.

let javitFut = null;

async function javitMind({ limit = 80 } = {}) {
    if (javitFut) return javitFut;
    javitFut = (async () => {
        const db = require("../db/database");
        const e = { nezett: 0, javitott: 0, kereso: 0 };
        const r = await db.query(`
            SELECT i.id, i.link, i.ar, i.nm, i.szobak, i.emelet, i.cim, i.varos, i.tipus, i.ugylet, i.forras_nev,
                   i.kulso_azon, i.leiras, i.x, i.y, i.hely_kezi, i.hely_forras, i.kulso_kepek,
                   v.nev_ro, v.megye
            FROM ingatlanok i LEFT JOIN varosok v ON v.nev = i.varos
            WHERE i.link ~* 'imoradar24\.ro/' AND i.statusz IN ('aktiv', 'fuggo')
              AND (i.forras_javitva IS NULL OR i.forras_javitva < NOW() - INTERVAL '3 days')
            ORDER BY i.forras_javitva NULLS FIRST, i.id DESC LIMIT $1`, [limit]);
        for (const i of r.rows) {
            e.nezett++;
            const hely = { varosRo: i.nev_ro || require("./geocode").VAROS_RO[i.varos] || i.varos, megye: i.megye, tipus: i.tipus, ugylet: i.ugylet };
            const forras = i.forras_nev || null;
            const d = { ar: Number(i.ar), nm: Number(i.nm), szobak: i.szobak, emelet: i.emelet, cim: i.cim, tipus: i.tipus, ugylet: i.ugylet };
            let t = null;
            try { t = await valodiForrasKeres(d, hely, forras); } catch (x) { t = null; }
            if (t) {
                const azon = new Set(Array.isArray(i.kulso_azon) ? i.kulso_azon : []);
                const { linkKulcsok } = require("./importer")._teszt;
                linkKulcsok(i.link).forEach(k => azon.add(k));
                const sets = ["link = $2", "forras_nev = $3", "kozvetito = NULL", "forras_kereso = NULL", "kulso_azon = $4::jsonb", "forras_javitva = NOW()", "updated_at = NOW()"];
                const ert = [i.id, t.link, t.forras, JSON.stringify([...azon])];
                const a = t.adat || {};
                if (a.leiras && (!i.leiras || i.leiras.length < a.leiras.length)) { ert.push(a.leiras); sets.push(`leiras = $${ert.length}`); }
                if (a.hely && a.x && a.y && !i.hely_kezi && i.hely_forras !== "kezi") {
                    ert.push(a.x, a.y, a.hely.hely_pontossag, a.hely.hely_sugar);
                    sets.push(`x = $${ert.length - 3}`, `y = $${ert.length - 2}`, `hely_pontossag = $${ert.length - 1}`, `hely_sugar = $${ert.length}`, "hely_forras = 'forras'");
                }
                if ((!Array.isArray(i.kulso_kepek) || !i.kulso_kepek.length) && Array.isArray(a.kulso_kepek) && a.kulso_kepek.length) {
                    ert.push(JSON.stringify(a.kulso_kepek)); sets.push(`kulso_kepek = $${ert.length}::jsonb`);
                }
                await db.query(`UPDATE ingatlanok SET ${sets.join(", ")} WHERE id = $1`, ert).catch(err => console.error("Forrás javítás:", err.message));
                e.javitott++;
            } else {
                // a forrás nem ismert (régi hirdetés): OLX-szel próbálkozunk, ott a cím alapján is lehet keresni
                const kereso = forrasKereso(forras || "olx", d, hely);
                await db.query("UPDATE ingatlanok SET forras_kereso = $2, forras_javitva = NOW() WHERE id = $1", [i.id, kereso]);
                if (kereso) e.kereso++;
            }
            await sleep(300);
        }
        if (e.nezett) console.log(`Forráslinkek: ${e.nezett} közvetített hirdetés, ${e.javitott} az eredeti linkre cserélve, ${e.kereso} a forrás keresésére.`);
        return e;
    })().finally(() => { javitFut = null; });
    return javitFut;
}

module.exports = {
    gazdagit, kozvetitoLink, kozvetitoOldal, helySzint,
    olxOldalbol, storiaOldalbol, storiaListabol, olxKeres, olxVarosId, olxVarosAjanlatai, olxAdat, slug,
    storiaKeres, storiaListaUrl, forrasKereso, forrasKulcs, valodiForrasKeres, javitMind
};
