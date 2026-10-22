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
const tisztaLink = u => String(u || "").split("#")[0].split("?")[0];

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
        // Aktív-e még: az OLX a lejárt / törölt hirdetést "removed_by_user", "outdated",
        // "disabled"... állapottal adja (vagy isActive: false)
        const allapot = typeof ad.status === "string" ? ad.status.toLowerCase() : "";
        if (ad.isActive === false || ad.active === false || (allapot && allapot !== "active")) a.aktiv = false;
        if (ad.id) a.olxId = String(ad.id);
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
    const allapot = typeof ad.status === "string" ? ad.status.toLowerCase() : "";
    const utca = a.street && a.street.name ? [a.street.name, a.street.number].filter(Boolean).join(" ") : null;
    return {
        x: szint ? Number(c.longitude) : null,
        y: szint ? Number(c.latitude) : null,
        hely: szint,
        utca,
        kerulet: (a.district && a.district.name) || (a.subdistrict && a.subdistrict.name) || null,
        // A Storia a lejárt hirdetést "inactive" / "removed" / "expired" állapottal adja
        aktiv: allapot && allapot !== "active" ? false : undefined
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
            id: it.id !== undefined && it.id !== null ? String(it.id) : null,
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

// ---------- OLX: egy hirdetés állapota az azonosítója alapján (az OLX nyilvános API-ja) ----------
//  Ha az OLX oldala letiltja a szervert (403), az API-ból még kiderülhet, hogy fent van-e.
//  -> { aktiv: true, adat } | { aktiv: false } | null (nem tudjuk)
async function olxAllapot(id) {
    if (!id) return null;
    try {
        const res = await biztonsagosFetch(`https://www.olx.ro/api/v1/offers/${encodeURIComponent(id)}/`, {
            headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "ro-RO,ro;q=0.9" },
            signal: AbortSignal.timeout(20000)
        });
        if (res.status === 404 || res.status === 410) return { aktiv: false };
        if (res.status >= 400) return null;
        const j = await res.json();
        const o = j && j.data;
        if (!o) return { aktiv: false };
        const st = String(o.status || "").toLowerCase();
        if (st && st !== "active") return { aktiv: false };
        return { aktiv: true, adat: olxAdat(o), link: tisztaLink(o.url) };
    } catch (e) {
        return null;
    }
}

// Egy hirdetés közvetlen linkje-e (OLX / Storia / Publi24 / Imobiliare... – nem közvetítő, nem keresés)
function kozvetlenHirdetes(link) {
    const l = String(link || "");
    if (!l || kozvetitoOldal(l)) return false;
    return require("./scraper").isListingUrl(l) || /lajumate\.ro\/ad\/|romimo\.ro\/.+\d{5,}/i.test(l);
}

// Valódi OLX hirdetésszám-e (az OLX hirdetései 9 jegyűek, pl. 307289072)
function olxIdJo(id) {
    return /^\d{9,}$/.test(String(id || "")) && Number(id) >= 100000000;
}

// ---------- Pontos hirdetés a forrásoldal saját (szűrt) találati listájából ----------
//  Az Imoradar24 a forrás nevét megadja (olx.ro, storia.ro, publi24.ro), a linket nem
//  (az csak belépve látszik). A forrásoldal nyilvános találati listájában – a városban,
//  ár szerint szűkítve – megkeressük ugyanazt a hirdetést: ár (±2,5 %), alapterület
//  (±1,5 m²), és ha kell, a cím szavai / emelet / szobák döntenek. Csak egyértelmű
//  egyezést fogadunk el.

const OLX_SZOBA = { one: 1, two: 2, three: 3, four: 4, five: 5, more: 5 };
const listaCache = new Map();      // url -> { ido, adat } – a FELDOLGOZOTT lista (az OLX oldala ~4 MB, azt nem tartjuk meg)

async function gyorsLista(url, feldolgoz) {
    const c = listaCache.get(url);
    if (c && Date.now() - c.ido < CACHE_IDO) return c.adat;
    const adat = feldolgoz(await getHtml(url));
    if (listaCache.size > 200) listaCache.clear();
    listaCache.set(url, { ido: Date.now(), adat });
    return adat;
}

// OLX találati lista: window.__PRERENDERED_STATE__ -> listing.listing.ads
function olxListabol(html) {
    const m = String(html || "").match(/window\.__PRERENDERED_STATE__\s*=\s*("(?:[^"\\]|\\.)*")/);
    if (!m) return { ads: [], oldalak: 0 };
    let st;
    try { st = JSON.parse(JSON.parse(m[1])); } catch (e) { return { ads: [], oldalak: 0 }; }
    const L = st && st.listing && st.listing.listing;
    if (!L || !Array.isArray(L.ads)) return { ads: [], oldalak: 0 };
    const ads = L.ads.filter(a => a && a.url && a.isActive !== false).map(a => {
        const p = k => ((a.params || []).find(x => x.key === k) || {}).normalizedValue;
        const rp = (a.price && a.price.regularPrice) || {};
        let ar = Number(rp.value) || null;
        if (ar && /ron|lei/i.test(rp.currencyCode || "")) ar = Math.round(ar / 5);
        const em = String(p("floor") || "");
        const map = a.map || {};
        const sugarM = map.show_detailed ? 0 : (Number(map.radius) >= 0 ? Number(map.radius) * 1000 : null);
        const szint = map.lat && map.lon ? helySzint(sugarM) : null;
        return {
            olxId: a.id ? String(a.id) : null,
            link: tisztaLink(a.url),
            cim: a.title || null,
            ar,
            nm: Number(String(p("m") || "").replace(",", ".")) || null,
            szobak: OLX_SZOBA[String(p("rooms") || "").toLowerCase()] || null,
            emelet: /parter/i.test(em) ? "0" : /demisol|subsol/i.test(em) ? "-1" : ((em.match(/(\d{1,2})/) || [])[1] || null),
            leiras: a.description ? String(a.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000) : null,
            x: szint ? Number(map.lon) : null,
            y: szint ? Number(map.lat) : null,
            hely: szint,
            kulso_kepek: (a.photos || []).map(f => String((f && f.link) || f || "").replace("{width}", "1200").replace("{height}", "900")).filter(u => /^https?:\/\//.test(u)).slice(0, 20)
        };
    });
    return { ads, oldalak: Number(L.totalPages) || 1 };
}

// Publi24 találati lista: a JSON-LD ItemList (név, ár, leírás, link)
function publi24Listabol(html) {
    const ki = [];
    for (const m of String(html || "").matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        if (!/ItemList/.test(m[1])) continue;
        let j;
        try { j = JSON.parse(m[1].replace(/[\u0000-\u001f]+/g, " ")); } catch (e) { continue; }
        (j.itemListElement || []).forEach(e => {
            if (!e || !e.url) return;
            const o = e.offers || {};
            let ar = Number(o.price) || null;
            if (ar && /ron|lei/i.test(o.priceCurrency || "")) ar = Math.round(ar / 5);
            const szoveg = `${e.name || ""} ${(o.itemOffered && o.itemOffered.description) || e.description || ""}`;
            const nm = (szoveg.match(/(?:suprafa[tț][aă]\s*util[aă][^0-9]{0,25})?(\d{2,4}(?:[.,]\d{1,2})?)\s*(?:mp|m2|m²|metri)/i) || [])[1];
            ki.push({
                link: new URL(String(e.url), "https://www.publi24.ro/").toString().split("?")[0],
                cim: e.name || null,
                ar,
                nm: nm ? Number(nm.replace(",", ".")) : null,
                szobak: Number((szoveg.match(/(\d)\s*camere/i) || [])[1]) || (/garsonier/i.test(szoveg) ? 1 : null),
                elerheto: !o.availability || /InStock/i.test(o.availability)
            });
        });
    }
    return ki;
}

const szavak = s => new Set(slug(s).split("-").filter(w => w.length > 2 && !/^(de|cu|in|la|si|pe|din|vanzare|vand|apartament|camere|camera|zona)$/.test(w)));

function cimHasonlo(a, b) {
    const x = szavak(a), y = szavak(b);
    if (!x.size || !y.size) return 0;
    let k = 0;
    x.forEach(w => { if (y.has(w)) k++; });
    return k / Math.min(x.size, y.size);
}

// A jelöltek közül az egyetlen egyező hirdetés (vagy null)
function legjobbJelolt(d, lista) {
    const ar = Number(d.ar) || 0;
    if (!(ar > 0)) return null;
    const nm = Number(d.nm) || 0;
    const jo = lista.filter(o => {
        if (!(o.ar > 0) || Math.abs(o.ar - ar) > ar * 0.025) return false;
        if (nm > 0 && o.nm > 0 && Math.abs(o.nm - nm) > 1.5) return false;
        if (d.szobak > 0 && o.szobak > 0 && Math.abs(o.szobak - d.szobak) > 1) return false;
        return true;
    });
    if (jo.length <= 1) return jo[0] && ((nm > 0 && jo[0].nm > 0) || cimHasonlo(d.cim, jo[0].cim) >= 0.5 || Math.abs(jo[0].ar - ar) <= ar * 0.006) ? jo[0] : null;
    // Több jelölt: pontszám (alapterület, emelet, ár, a cím szavai) – csak ha egy egyértelműen kiemelkedik
    const pont = o => (nm > 0 && o.nm > 0 ? (Math.abs(o.nm - nm) <= 0.5 ? 3 : 1) : 0)
        + (d.emelet && o.emelet !== null && o.emelet !== undefined && String(d.emelet).split("/")[0] === String(o.emelet) ? 2 : 0)
        + (Math.abs(o.ar - ar) <= ar * 0.006 ? 2 : 0)
        + cimHasonlo(d.cim, o.cim) * 3;
    const r = jo.map(o => ({ o, p: pont(o) })).sort((a, b) => b.p - a.p);
    return r[0].p >= 3 && r[0].p - r[1].p >= 1.5 ? r[0].o : null;
}

const PUBLI24_TIPUS = { lakas: "apartamente", haz: "case", telek: "terenuri", kereskedelmi: "spatii-comerciale", iroda: "birouri" };

async function olxKeresesbol(d, hely) {
    if (!(d.ar > 0) || !hely || !hely.varosRo) return null;
    const q = new URLSearchParams();
    q.set("search[filter_float_price:from]", String(Math.floor(d.ar * 0.975)));
    q.set("search[filter_float_price:to]", String(Math.ceil(d.ar * 1.025)));
    q.set("currency", "EUR");
    const alap = `https://www.olx.ro/imobiliare/${slug(hely.varosRo)}/?${q}`;
    const ads = [];
    let oldalak = 1;
    for (let p = 1; p <= Math.min(oldalak, 4); p++) {
        const l = await gyorsLista(p === 1 ? alap : `${alap}&page=${p}`, olxListabol);
        ads.push(...l.ads);
        oldalak = l.oldalak || 1;
        if (p < Math.min(oldalak, 4)) await sleep(500);
    }
    const t = legjobbJelolt(d, ads);
    return t ? { link: t.link, forras: "olx", adat: t } : null;
}

async function publi24Keresesbol(d, hely) {
    if (!(d.ar > 0) || !hely || !hely.varosRo || !hely.megye) return null;
    const kat = PUBLI24_TIPUS[d.tipus || hely.tipus || "lakas"] || "apartamente";
    const alap = `https://www.publi24.ro/anunturi/imobiliare/${(d.ugylet || hely.ugylet) === "kiado" ? "de-inchiriat" : "de-vanzare"}/${kat}/${slug(hely.megye)}/${slug(hely.varosRo)}/`;
    const lista = [];
    for (let p = 1; p <= 15; p++) {
        let elemek;
        try { elemek = await gyorsLista(p === 1 ? alap : `${alap}?pag=${p}`, publi24Listabol); } catch (e) { break; }
        if (!elemek.length) break;
        const uj = elemek.filter(e => !lista.some(x => x.link === e.link));
        if (!uj.length) break;
        lista.push(...uj);
        // az ár szerint rendezett lista nem garantált – végigmegyünk (kicsi lista)
        await sleep(400);
    }
    const t = legjobbJelolt(d, lista.filter(e => e.elerheto !== false));
    return t ? { link: t.link, forras: "publi24", adat: t } : null;
}

//  forrasok: a hirdetés forrásai az Imoradar24 szerint [{ forras: "olx"|"storia"|"publi24"..., ar }]
//  (forrásonként a saját árával) – ha nem ismert, mindhárom oldalon keresünk
//  -> [{ link, forras, adat }] (a megtaláltak)
async function keresesbolPontos(d, hely, forrasok) {
    // Sorrend: Storia, Publi24, OLX – az OLX letiltja a szervert, a Storia (ugyanaz a cég)
    // és a Publi24 nem; ha a hirdetés a Storián is fent van, oda visz
    const SOR = { storia: 0, publi24: 1, olx: 2 };
    const lista = (forrasok && forrasok.length ? forrasok : [{ forras: "storia" }, { forras: "publi24" }, { forras: "olx" }])
        .filter((f, n, a) => f && f.forras && a.findIndex(x => x.forras === f.forras) === n)
        .sort((a, b) => (SOR[a.forras] ?? 9) - (SOR[b.forras] ?? 9));
    const ki = [];
    for (const f of lista) {
        const dd = { ...d, ar: Number(f.ar) > 0 ? Number(f.ar) : d.ar };
        let t = null;
        try {
            if (f.forras === "olx") t = await olxKeresesbol(dd, hely);
            else if (f.forras === "publi24") t = await publi24Keresesbol(dd, hely);
            else if (f.forras === "storia") { const st = await storiaKeres(dd, { ...hely, tipus: dd.tipus || hely.tipus, ugylet: dd.ugylet || hely.ugylet }); t = st ? { link: st.link, forras: "storia", adat: st } : null; }
        } catch (e) { t = null; }
        if (t && !ki.some(x => x.link === t.link)) ki.push(t);
    }
    return ki;
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

// ---------- Pontos egyezés a forrás azonosítója alapján ----------
//  Az Imoradar24 link-extern címében: source=OLX.ro&source_listing_id=287654321
//  -> az eredeti hirdetés linkje (OLX: az OLX nyilvános API-ja az azonosítóval,
//  vagy a város listájában ugyanaz az azonosító; Storia: a város listájában)

const diag = { probalt: 0, olxApi: 0, olxLista: 0, storia: 0, sikertelen: [] };

async function azonositoSzerint(f, hely) {
    if (!f) return null;
    diag.probalt++;
    const r = await azonositoSzerint0(f, hely);
    if (r) { if (f.forras === "storia") diag.storia++; }
    else if (f.id && diag.sikertelen.length < 15) diag.sikertelen.push(`${f.forras}:${f.id}`);
    return r;
}

async function azonositoSzerint0(f, hely) {
    // FONTOS: az Imoradar24 "source_listing_id"-je az Imoradar24 SAJÁT azonosítója
    // (pl. 6394942), nem az OLX / Storia hirdetésszáma – ezzel az OLX API-ban vagy a
    // Storia-listában keresni rossz (más, régi hirdetést is találhatna). Csak a
    // közvetlen linket fogadjuk el; a többit az adatok alapján keressük (keresesbolPontos).
    if (f.url) return { link: tisztaLink(f.url), forras: f.forras || forrasKulcs(null, f.url), adat: null };
    return null;
}

// Egy hirdetés összes forrása pontos linkkel: [{ link, forras, adat }] (a sorrend a forráslistáé)
async function forrasokFeloldasa(lista, hely) {
    const ki = [];
    for (const f of (Array.isArray(lista) ? lista : []).slice(0, 5)) {
        const t = await azonositoSzerint(f, hely).catch(() => null);
        if (t && t.link && !ki.some(x => x.link === t.link)) ki.push(t);
    }
    return ki;
}

// A valódi forrás keresése a hirdetés adataiból (OLX vagy Storia; ha a forrás
// nem ismert, mindkettő) -> { link, forras, adat } | null
async function valodiForrasKeres(d, hely, forras) {
    // a forrásoldal nyilvános (ár szerint szűrt) találati listája – ez a megbízhatóbb
    const t = await keresesbolPontos(d, hely, null).catch(() => []);
    if (t.length) return t[0];
    if (forras !== "storia" && forras !== "publi24" && hely && hely.varosRo) {
        const o = await olxKeres(d, hely.varosRo).catch(() => null);
        if (o) return { link: o.link, forras: "olx", adat: o };
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

        const forras = forrasKulcs(d.forrasNev) || (d.forrasLista && d.forrasLista[0] && d.forrasLista[0].forras) || null;
        d.forrasKulcs = forras;
        const h2 = { ...hely, tipus: d.tipus, ugylet: d.ugylet };
        // 1/a) pontosan: a forrás azonosítója alapján (minden forrás – ha több oldalon is fent van)
        const pontos = await forrasokFeloldasa(d.forrasLista, h2);
        let t = pontos[0] || null;
        if (pontos.length > 1) d.tovabbi_linkek = [...new Set([...(d.tovabbi_linkek || []).filter(l => !kozvetitoOldal(l)), ...pontos.slice(1).map(x => x.link)])];
        // 1/b) a forrásoldal nyilvános találati listájából, az adatok (ár, alapterület,
        //      szobák, emelet, cím) alapján – forrásonként a saját árával
        if (!t) {
            const fl = (d.forrasLista || []).filter(f => f && f.forras && !f.url).map(f => ({ forras: f.forras, ar: f.ar }));
            const talaltak = await keresesbolPontos(d, h2, fl.length ? fl : (forras ? [{ forras }] : null)).catch(() => []);
            if (talaltak.length) {
                t = talaltak[0];
                d.tovabbi_linkek = [...new Set([...(d.tovabbi_linkek || []).filter(l => !kozvetitoOldal(l)), ...pontos.map(x => x.link), ...talaltak.slice(1).map(x => x.link)])];
            }
        }
        const talalt = t ? (t.adat || {}) : null;

        if (talalt) {
            d.kozvetitoLink = d.link;
            d.link = t.link;
            if (talalt.leiras && (!d.leiras || d.leiras.length < talalt.leiras.length)) d.leiras = talalt.leiras;
            if (talalt.hely) { d.x = talalt.x; d.y = talalt.y; d.forrasHely = talalt.hely; }
            if (!d.kulso_kepek || !d.kulso_kepek.length) d.kulso_kepek = talalt.kulso_kepek;
            if (!d.emelet && talalt.emelet) d.emelet = talalt.emelet;
            if (talalt.olxId) d.olxId = talalt.olxId;
            d.valodiForras = t.forras || forras;
            d.forrasKulcs = t.forras || forras;
            // Storia: a pontos hely a hirdetés oldaláról (lent, a 2. lépésben)
            if (t.forras === "storia" && !(talalt.x && talalt.y)) d.storiaReszlet = true;
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

// A már ismert közvetlen link előre: ha egy Imoradar24-re mutató hirdetés további linkjei
// között ott van az eredeti hirdetés (OLX / Storia / Publi24 / Imobiliare...), az lesz a fő
// link – a látogató így egyből a hirdetésre megy (nem a forrásoldal keresésére).
//  varosok: csak ezekben a városokban (null = mind)  -> az átírt hirdetések száma
async function ismertLinkElore(varosok) {
    const db = require("../db/database");
    const params = [];
    let szuro = "";
    if (varosok && varosok.length) { params.push(varosok); szuro = `AND (varos = ANY($1::text[]) OR varos_eredeti = ANY($1::text[]))`; }
    const r = await db.query(`
        SELECT id, link, tovabbi_linkek, kulso_azon FROM ingatlanok
        WHERE link ~* 'imoradar24\\.ro/' AND jsonb_typeof(tovabbi_linkek) = 'array' AND jsonb_array_length(tovabbi_linkek) > 0 ${szuro}`, params);
    const { linkKulcsok } = require("./importer")._teszt;
    let n = 0;
    for (const i of r.rows) {
        const tov = (i.tovabbi_linkek || []).filter(Boolean);
        const uj = tov.find(kozvetlenHirdetes);
        if (!uj) continue;
        const azon = new Set(Array.isArray(i.kulso_azon) ? i.kulso_azon : []);
        linkKulcsok(i.link).forEach(k => azon.add(k));
        const maradek = tov.filter(l => l !== uj && !kozvetitoOldal(l));
        await db.query(
            `UPDATE ingatlanok SET link = $2, tovabbi_linkek = $3::jsonb, kulso_azon = $4::jsonb, forras_nev = COALESCE($5, forras_nev),
                    kozvetito = NULL, forras_kereso = NULL, forras_javitva = NOW(), updated_at = NOW() WHERE id = $1`,
            [i.id, uj, JSON.stringify(maradek), JSON.stringify([...azon]), forrasKulcs(null, uj)]
        ).catch(err => console.error("Ismert link előre:", err.message));
        n++;
    }
    if (n) console.log(`Forráslinkek: ${n} hirdetésnél az ismert eredeti link lett a fő link.`);
    return n;
}

//  opts.limit:    legfeljebb ennyi hirdetés
//  opts.varosok:  csak ezekben a városokban (a környék-várossal együtt) – null = mind
//  opts.csakAdat: a város listájának újraolvasása kimarad (a hívó már megcsinálta)
async function javitMind({ limit = 80, varosok = null, csakAdat = false, mind = false } = {}) {
    if (javitFut) return javitFut;
    javitFut = (async () => {
        const db = require("../db/database");
        const e = { nezett: 0, javitott: 0, kereso: 0 };

        // 0) amit már tudunk (a további linkek között ott az eredeti hirdetés)
        e.javitott += await ismertLinkElore(varosok).catch(x => { console.error("Forráslinkek (ismert):", x.message); return 0; });

        const params = [limit];
        let szuro = "";
        if (varosok && varosok.length) { params.push(varosok); szuro = "AND (i.varos = ANY($2::text[]) OR i.varos_eredeti = ANY($2::text[]))"; }
        const valaszt = async () => (await db.query(`
            SELECT i.id, i.link, i.ar, i.nm, i.szobak, i.emelet, i.cim, i.varos, i.tipus, i.ugylet, i.forras_nev,
                   i.kulso_azon, i.leiras, i.x, i.y, i.hely_kezi, i.hely_forras, i.kulso_kepek, i.forras_kereso,
                   v.nev_ro, v.megye
            FROM ingatlanok i LEFT JOIN varosok v ON v.nev = i.varos
            WHERE i.link ~* 'imoradar24\\.ro/' AND i.statusz IN ('aktiv', 'fuggo') ${szuro}
              -- ami még nincs meg: fél naponta újra (városra indítva mindig)
              ${(varosok && varosok.length) || mind ? "" : "AND (i.forras_javitva IS NULL OR i.forras_javitva < NOW() - INTERVAL '12 hours')"}
            ORDER BY i.forras_javitva NULLS FIRST, i.id DESC LIMIT $1`, params)).rows;

        let lista = await valaszt();
        if (!lista.length) return e;
        e.nezett = lista.length;

        // 1) Pontosan: a város Imoradar24 listájának újraolvasása (a végéig) – benne minden
        //    hirdetés forrása és azonosítója (source / source_listing_id), ebből az
        //    eredeti link (importer.figyelesIndit -> frissitAdatbol -> gazdagit)
        if (!csakAdat) {
            const elotte = new Map(lista.map(i => [i.id, i.link]));
            try {
                const job = require("./importer").figyelesIndit({ ids: lista.map(i => i.id), limit: lista.length, forraslinkNelkul: true });
                await job.promise;
            } catch (x) { console.error("Forráslinkek (lista):", x.message); }

            const most = (await db.query("SELECT id, link FROM ingatlanok WHERE id = ANY($1::int[])", [lista.map(i => i.id)])).rows;
            const megvan = new Set(most.filter(i => !kozvetitoOldal(i.link) && i.link !== elotte.get(i.id)).map(i => i.id));
            e.javitott += megvan.size;
            if (megvan.size) await db.query("UPDATE ingatlanok SET forras_javitva = NOW(), forras_kereso = NULL WHERE id = ANY($1::int[])", [[...megvan]]);
            lista = lista.filter(i => !megvan.has(i.id));
            // ami közben "nem elérhető" lett, azzal már nincs dolgunk
            const aktiv = new Set((await db.query("SELECT id FROM ingatlanok WHERE id = ANY($1::int[]) AND statusz IN ('aktiv','fuggo') AND link ~* 'imoradar24\\.ro/'", [lista.map(i => i.id)])).rows.map(x => x.id));
            lista = lista.filter(i => aktiv.has(i.id));
        }

        // 2) Ami így sem lett meg: az adatok (ár, alapterület, szobák, emelet) alapján
        for (const i of lista) {
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
                // A forrásoldal szűrt keresése csak tartalék (a hirdetés oldalán "keresés a
                // forrásoldalon" linkként) – a kattintás a hirdetés saját adatlapjára visz
                const kereso = i.forras_kereso || forrasKereso(forras || "olx", d, hely);
                await db.query("UPDATE ingatlanok SET forras_kereso = $2, forras_javitva = NOW() WHERE id = $1", [i.id, kereso]);
                if (kereso) e.kereso++;
            }
            await sleep(300);
        }
        console.log(`Forráslinkek: ${e.nezett} közvetített hirdetés, ${e.javitott} az eredeti linkre cserélve, ${e.kereso} még nincs meg (a saját adatlapra visz).`);
        console.log(`Forráslinkek – azonosító szerint: ${diag.probalt} próba, OLX API ${diag.olxApi}, OLX lista ${diag.olxLista}, Storia ${diag.storia}; nem sikerült pl.: ${diag.sikertelen.join(", ") || "–"}`);
        e.diag = { ...diag, sikertelen: [...diag.sikertelen] };
        return e;
    })().finally(() => { javitFut = null; });
    return javitFut;
}

module.exports = {
    gazdagit, kozvetitoLink, kozvetitoOldal, helySzint,
    olxOldalbol, storiaOldalbol, storiaListabol, olxKeres, olxVarosId, olxVarosAjanlatai, olxAdat, slug,
    storiaKeres, storiaListaUrl, forrasKereso, forrasKulcs, valodiForrasKeres, javitMind, azonositoSzerint, forrasokFeloldasa,
    olxAllapot, kozvetlenHirdetes, ismertLinkElore, olxIdJo, olxListabol, publi24Listabol, legjobbJelolt, keresesbolPontos
};
