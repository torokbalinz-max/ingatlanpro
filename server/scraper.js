// ============================================================
//  Hirdetés beolvasása linkről
//
//  1. Oldal-specifikus olvasó (Imobiliare.ro, Imoradar24 – ugyanaz
//     a rendszer, a képek az i.roamcdn.net-ről jönnek)
//  2. Általános olvasó: JSON-LD (schema.org), meta tagek, szöveg
//  Ami nem található, "hiányzó" marad – azt az admin pótolja.
// ============================================================

const cheerio = require("cheerio");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Egy hirdetés linkjének mintái oldalanként
const LISTING_PATTERNS = [
    /imobiliare\.ro\/oferta\/[a-z0-9-]+-\d{5,}/i,
    /imoradar24\.ro\/oferta\/[a-z0-9-]+-\d{5,}/i,
    /storia\.ro\/[a-z]{2}\/oferta\/[a-z0-9-]+/i,
    /olx\.ro\/d\/oferta\/[a-z0-9-]+/i,
    /publi24\.ro\/anunturi\/.+\/anunt\//i,
    /homezz\.ro\/.+-\d+\.html/i,
    /lajumate\.ro\/.+-id\d+/i,
    /anuntul\.ro\/anunt-/i
];

function isListingUrl(url) {
    return LISTING_PATTERNS.some(re => re.test(url));
}

function isRoam(url) {
    return /(?:imobiliare|imoradar24)\.ro/i.test(url);
}

async function fetchPage(url) {

    const res = await fetch(url, {
        headers: {
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ro-RO,ro;q=0.9,hu;q=0.8,en;q=0.7"
        },
        redirect: "follow",
        signal: AbortSignal.timeout(25000)
    });

    const html = await res.text();

    return { status: res.status, finalUrl: res.url || url, html };

}

async function fetchHtml(url) {
    const p = await fetchPage(url);
    if (p.status >= 400) throw new Error(`HTTP ${p.status}`);
    return p.html;
}

// ---------- segédek ----------

function numberFrom(text) {

    if (text === null || text === undefined) return null;

    let s = String(text).replace(/[^\d.,]/g, "");

    if (!s) return null;

    // "125.000" / "125,000" ezres elválasztók; "65,5" tizedes
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
        s = s.replace(/[.,]/g, "");
    } else {
        s = s.replace(",", ".");
    }

    const n = Number(s);
    return isNaN(n) ? null : n;

}

function absUrl(u, base) {
    try { return new URL(u, base).toString(); } catch (e) { return null; }
}

function decodeEntities(s) {
    return String(s || "")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&acirc;/g, "â")
        .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
        .replace(/&amp;/g, "&");
}

function flattenJsonLd(obj, out = []) {

    if (!obj || typeof obj !== "object") return out;

    if (Array.isArray(obj)) {
        obj.forEach(o => flattenJsonLd(o, out));
        return out;
    }

    out.push(obj);

    if (obj["@graph"]) flattenJsonLd(obj["@graph"], out);
    if (obj.mainEntity) flattenJsonLd(obj.mainEntity, out);
    if (obj.itemOffered) flattenJsonLd(obj.itemOffered, out);
    if (obj.offers) flattenJsonLd(obj.offers, out);

    return out;

}

function firstVal(v) {
    if (Array.isArray(v)) return v[0];
    if (v && typeof v === "object" && "value" in v) return v.value;
    return v;
}

// A "szemét" képek (logók, ikonok, ügynökség-képek, miniatűrök) kiszűrése
function joKep(u) {
    return !!u &&
        /^https?:\/\//.test(u) &&
        !/\/assets\/|logo|icon|favicon|mstile|avatar|sprite|placeholder|agency|user-thumb|gallery-thumb|listing-thumb|thumb-\d+w|default-card|banner|badge|\.svg(\?|$)|\.gif(\?|$)/i.test(u);
}

// ---------- típus / ügylet / állapot a szövegből ----------

function guessTipus(text) {
    const t = text.toLowerCase();
    if (/\bteren\b|terenuri|lot de teren/.test(t)) return "telek";
    if (/\bcas[aă]\b|\bvil[aă]\b|case-vile|case-de|casa-de/.test(t)) return "haz";
    if (/spa[tț]iu[- ]comercial|spatii-comerciale|\bmagazin\b/.test(t)) return "kereskedelmi";
    if (/\bbirou\b|birouri/.test(t)) return "iroda";
    if (/apartament|garsonier|penthouse/.test(t)) return "lakas";
    return null;
}

function guessUgylet(text) {
    const t = text.toLowerCase();
    if (/de[- ]inchiriat|inchiriere|închiriere|de închiriat/.test(t)) return "kiado";
    if (/de[- ]vanzare|de vânzare|vanzare|vânzare/.test(t)) return "elado";
    return null;
}

function guessAllapot(text) {
    const t = text.toLowerCase();
    if (/necesit[aă] renovare|de renovat|stare de renovare|necesită renovare/.test(t)) return "felújítandó";
    if (/renovat par[tț]ial|par[tț]ial renovat/.test(t)) return "részbenfel";
    if (/\blux\b|finisaje de lux|premium/.test(t)) return "luxus";
    if (/bloc nou|construc[tț]ie nou[aă]|imobil nou|\bnou\b.{0,20}\(foarte bun|finalizat 202[3-9]/.test(t)) return "újszerű";
    if (/renovat|foarte bun|bine între[tț]inut|\(bun[aă]\)|stare bun[aă]/.test(t)) return "jó";
    return null;
}

// "Nem elérhető" jelzések a szövegben
const INAKTIV_RE = /anun[tț]ul (?:nu mai este|a fost) (?:disponibil|dezactivat|șters|sters)|anun[tț] inactiv|acest anun[tț] nu mai este|proprietate v[aâ]ndut[aă]|\bV[AÂ]NDUT\b|oferta a expirat|anun[tț] expirat/i;

// ---------- fő kinyerő ----------

function extract(html, url, finalUrl) {

    const $ = cheerio.load(html);

    const d = {
        link: url,
        elerheto: true,
        cim: null,
        leiras: null,
        ar: null,
        penznem: null,
        nm: null,
        telek_nm: null,
        szobak: null,
        emelet: null,
        osszEmelet: null,
        evszam: null,
        allapot: null,
        tipus: null,
        ugylet: null,
        x: null,
        y: null,
        kerulet: null,         // a forrásoldal szerinti környék (pl. "Ciucului")
        utca: null,
        cimSzoveg: null,       // cím szövegesen (helymeghatározáshoz)
        kulso_kepek: [],
        forrasSzoveg: null,    // a lényeges szövegrész az ellenőrzéshez
        forrasok: {}
    };

    const set = (key, value, src) => {
        if (value === null || value === undefined || value === "" || (typeof value === "number" && isNaN(value))) return;
        if (d[key] === null || d[key] === undefined) {
            d[key] = value;
            d.forrasok[key] = src;
        }
    };

    // ===== Elérhetőség: átirányítás a hirdetésről máshová =====
    if (finalUrl && isListingUrl(url) && !isListingUrl(finalUrl)) {
        d.elerheto = false;
    }

    // ===== 1) JSON-LD =====
    const ldObjects = [];

    $('script[type="application/ld+json"]').each((_, el) => {
        try { flattenJsonLd(JSON.parse($(el).contents().text()), ldObjects); } catch (e) { /* hibás JSON */ }
    });

    // Az oldal saját szervezetének, ügynökségének adatai nem kellenek
    const hirdetesLd = ldObjects.filter(o => !/Organization|Person|WebSite|WebPage|BreadcrumbList|ImageObject|RealEstateAgent|ContactPoint|SiteNavigation/i.test(String(o["@type"] || "")));

    hirdetesLd.forEach(o => {

        const tipus = String(o["@type"] || "");

        if (/Offer/i.test(tipus) || o.price !== undefined || o.priceSpecification) {
            const ps = o.priceSpecification || {};
            set("ar", numberFrom(firstVal(o.price ?? ps.price ?? o.lowPrice)), "jsonld");
            set("penznem", o.priceCurrency || ps.priceCurrency, "jsonld");
            if (o.availability && !/InStock|LimitedAvailability|PreOrder/i.test(o.availability)) {
                d.elerheto = false;
            }
        }

        if (o.floorSize) set("nm", numberFrom(firstVal(o.floorSize)), "jsonld");
        if (o.numberOfRooms) set("szobak", numberFrom(firstVal(o.numberOfRooms)), "jsonld");
        if (o.floorLevel !== undefined) set("emeletSzam", String(o.floorLevel), "jsonld");

        if (o.geo && o.geo.latitude) {
            set("y", Number(o.geo.latitude), "jsonld");
            set("x", Number(o.geo.longitude), "jsonld");
        }

        if (/PostalAddress/i.test(tipus) && !/agency/i.test(String(o["@id"] || ""))) {
            set("utca", decodeEntities(o.streetAddress || "").trim() || null, "jsonld");
            set("kerulet", decodeEntities(o.addressLocality || "").trim() || null, "jsonld");
        }

        if (o.description && String(o.description).length > 40) {
            set("leiras", decodeEntities(o.description).trim(), "jsonld");
        }

        [].concat(o.image || []).map(i => typeof i === "string" ? i : (i && (i.url || i.contentUrl)))
            .filter(Boolean)
            .forEach(i => d.kulso_kepek.push(absUrl(i, url)));

    });

    // numberOfBedrooms csak végső esetben (az imobiliare a szobaszámot így adja)
    const acc = hirdetesLd.find(o => o.numberOfBedrooms !== undefined);

    // ===== 2) Meta tagek =====
    const meta = name => $(`meta[property="${name}"]`).attr("content") || $(`meta[name="${name}"]`).attr("content") || null;

    set("cim", decodeEntities(meta("og:title")), "meta");
    set("ar", numberFrom(meta("product:price:amount") || meta("og:price:amount")), "meta");
    set("penznem", meta("product:price:currency") || meta("og:price:currency"), "meta");
    set("y", Number(meta("place:location:latitude")) || null, "meta");
    set("x", Number(meta("place:location:longitude")) || null, "meta");

    const ogKep = absUrl(meta("og:image"), url);

    // ===== Képek =====
    if (isRoam(url)) {

        // Csak a hirdetés galériája (a nagy, 1200 pixeles változat), fájlnév szerint egyedi
        const dec = decodeEntities(html).replace(/\\\//g, "/");
        const galeria = new Map();

        for (const m of dec.matchAll(/https:\/\/i\.roamcdn\.net\/prop\/[a-z]+\/(gallery-full-1200w[a-z-]*|gallery-main-900w[a-z-]*)\/[^"'\s\\)<>]+?\/([0-9a-f-]{36}\.(?:jpe?g|png|webp))/gi)) {
            const [teljes, valtozat, fajl] = m;
            const volt = galeria.get(fajl);
            if (!volt || (/1200w/.test(valtozat) && !/1200w/.test(volt))) {
                galeria.set(fajl, teljes);
            }
        }

        d.kulso_kepek = [...galeria.values()];

        if (!d.kulso_kepek.length && ogKep) d.kulso_kepek.push(ogKep);

    } else {

        if (ogKep) d.kulso_kepek.push(ogKep);

        $("img").each((_, el) => {
            const src = $(el).attr("data-src") || $(el).attr("data-lazy") || $(el).attr("src") || "";
            if (/\.(jpe?g|webp|png)(\?|$)/i.test(src)) d.kulso_kepek.push(absUrl(src, url));
        });

    }

    d.kulso_kepek = [...new Set(d.kulso_kepek.filter(joKep))].slice(0, 20);

    // ===== 3) Látható szöveg =====
    $("script, style, noscript, svg").remove();

    const text = decodeEntities($("body").text()).replace(/\s+/g, " ");
    const cimEsLink = `${d.cim || ""} ${url} ${finalUrl || ""}`;

    if (INAKTIV_RE.test(text.slice(0, 6000))) d.elerheto = false;

    // Leírás (Imobiliare/Imoradar: "Descriere apartament ... Citește mai mult")
    {
        const m = text.match(/Descriere (?:apartament|garsonier[aă]|cas[aă]|teren|spa[tț]iu|birou|proprietate)?\s*(?:Raporteaz[aă] anun[tț].*?Trimite sesizarea\s*)?(.{40,4000}?)(?:Cite[sș]te mai mult|Detalii (?:apartament|cas[aă]|teren|proprietate)|Caracteristici|$)/i);
        if (m && (!d.leiras || d.leiras.length < m[1].length)) {
            d.leiras = m[1].trim();
            d.forrasok.leiras = "text";
        }
    }

    if (!d.leiras) set("leiras", decodeEntities(meta("og:description") || meta("description") || ""), "meta");

    if (!d.ar) {
        const m = text.match(/(\d{1,3}(?:[.\s ]\d{3})+|\d{4,7})\s*(?:€|eur\b|euro)/i);
        if (m) {
            set("ar", numberFrom(m[1]), "text");
        } else {
            const r = text.match(/(\d{1,3}(?:[.\s ]\d{3})+|\d{4,8})\s*(?:lei|ron)\b/i);
            if (r) {
                set("ar", numberFrom(r[1]), "text");
                set("penznem", "RON", "text");
            }
        }
    }

    // Szobaszám: "Nr. camere: 5" / "Nr. cam.: 2" / cím: "3 camere"
    {
        const m = text.match(/Nr\.?\s*cam(?:ere)?\.?\s*:\s*(\d{1,2})/i)
            || cimEsLink.match(/(\d{1,2})[- ]camer/i)
            || text.match(/(\d{1,2})\s*camere\b/i);
        if (m) set("szobak", Number(m[1]), "text");
        else if (/garsonier/i.test(cimEsLink)) set("szobak", 1, "text");
        else if (acc) set("szobak", Number(acc.numberOfBedrooms), "jsonld-bedrooms");
    }

    // Alapterület: "Suprafață utilă: 97,5 mp" / "Sup. utilă: 41,4 mp"
    {
        const m = text.match(/Sup(?:rafa[tț][aă])?\.?\s*util[aă](?:\s*total[aă])?\s*:?\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:mp|m²|m2)/i);
        if (m) {
            d.nm = numberFrom(m[1]);
            d.forrasok.nm = "text";
        } else if (!d.nm) {
            const m2 = text.match(/(\d{2,4}(?:[.,]\d{1,2})?)\s*(?:mp|m²|m2)\b/i);
            if (m2) set("nm", numberFrom(m2[1]), "text");
        }
    }

    // Emelet: "Etaj: 4 / 4" / "Etaj parter/4"
    {
        const m = text.match(/Etaj(?:ul)?\s*:?\s*(parter|p|demisol|mansard[aă]|\d{1,2})\s*(?:\/|din)\s*(\d{1,2})/i);
        if (m) {
            const e = /^(p|parter)$/i.test(m[1]) ? "0" : /demisol/i.test(m[1]) ? "-1" : /mansard/i.test(m[1]) ? m[2] : m[1];
            d.emelet = `${e}/${m[2]}`;
            d.osszEmelet = Number(m[2]);
            d.forrasok.emelet = "text";
        } else if (d.emeletSzam !== undefined && d.emeletSzam !== null) {
            set("emelet", String(d.emeletSzam), "jsonld");
        } else {
            const m2 = text.match(/Etaj(?:ul)?\s*:?\s*(parter|\d{1,2})\b/i);
            if (m2) set("emelet", /parter/i.test(m2[1]) ? "0" : m2[1], "text");
        }
        if (!d.osszEmelet) {
            const n = text.match(/Nr\.?\s*niveluri\s*:?\s*(\d{1,2})/i);
            if (n) d.osszEmelet = Number(n[1]);
        }
    }

    {
        const m = text.match(/An constr(?:uc[tț]ie|\.)?\s*:?\s*(1[89]\d{2}|20[0-3]\d)/i);
        if (m) d.evszam = Number(m[1]);
    }

    if (!d.telek_nm) {
        const m = text.match(/(?:suprafa[tț][aă]\s*teren|teren)\s*:?[^0-9]{0,15}(\d{2,6}(?:[.,]\d{1,2})?)\s*(?:mp|m²|m2)/i);
        if (m) set("telek_nm", numberFrom(m[1]), "text");
    }

    set("tipus", guessTipus(cimEsLink) || guessTipus(text.slice(0, 3000)), "text");
    set("ugylet", guessUgylet(cimEsLink) || guessUgylet(text.slice(0, 3000)), "text");
    set("allapot", guessAllapot(`${d.leiras || ""} ${text.slice(0, 30000)}`), "text");

    // Környék a címből, ha a JSON-LD nem adta: "... în zona Lenin, Sfântu Gheorghe"
    if (!d.kerulet) {
        const m = `${d.cim || ""}`.match(/zona\s+([A-ZĂÂÎȘȚ][\wăâîșțĂÂÎȘȚ .-]{2,30}?)(?:,|$)/);
        if (m) set("kerulet", m[1].trim(), "text");
    }

    d.cimSzoveg = [d.utca, d.kerulet].filter(Boolean).join(", ") || null;

    // A lényeg egy helyen, az admin ellenőrzéséhez
    {
        const jellemzok = (text.match(/Nr\.?\s*cam(?:ere)?\.?\s*:.{0,220}/i) || [""])[0];
        const reszletek = (text.match(/Suprafa[tț][aă] util[aă] total[aă].{0,600}/i) || [""])[0]
            .split(/Similar|Anun[tț]uri similare|Alte anun[tț]uri|Recomand/i)[0];
        d.forrasSzoveg = [
            d.cim,
            jellemzok,
            reszletek,
            d.leiras ? d.leiras.slice(0, 1500) : null
        ].filter(Boolean).join("\n\n").slice(0, 4000) || null;
    }

    // ===== Tisztítás, józan ész ellenőrzés =====
    if (d.penznem && /ron|lei/i.test(d.penznem) && d.ar) {
        d.ar = Math.round(d.ar / 5);          // közelítő átváltás (1 EUR ≈ 5 RON)
        d.forrasok.ar = "ron-atvaltva";
    }

    if (d.nm && (d.nm < 8 || d.nm > 100000)) d.nm = null;
    if (d.szobak && (d.szobak < 1 || d.szobak > 30)) d.szobak = null;
    if (d.x && (d.x < 20 || d.x > 30)) { d.x = null; d.y = null; }
    if (d.y && (d.y < 43 || d.y > 49)) { d.x = null; d.y = null; }

    if (d.cim) d.cim = d.cim.replace(/\s*[|–-]\s*(imobiliare\.ro|storia|olx|imoradar24|publi24).*$/i, "").trim().slice(0, 200);
    if (d.leiras) d.leiras = d.leiras.slice(0, 5000);

    delete d.emeletSzam;

    return d;

}

// ---------- Találati listák ----------

// A hirdetés-linkek a HTML-ben (a beágyazott adatcsomagokban is) keresve
function extractListingLinks(html, baseUrl) {

    const links = new Set();
    const host = (() => { try { return new URL(baseUrl).origin; } catch (e) { return ""; } })();

    const dec = decodeEntities(html).replace(/\\\//g, "/");

    for (const m of dec.matchAll(/(?:https?:\/\/[a-z0-9.-]+)?\/(?:ro\/|d\/)?oferta\/[a-z0-9-]+(?:-\d{5,}|\.html)?/gi)) {
        const u = absUrl(m[0], host || baseUrl);
        if (u && isListingUrl(u)) links.add(u.split("#")[0].split("?")[0]);
    }

    // Általános: minden <a>, ami hirdetésnek látszik
    const $ = cheerio.load(html);

    $("a[href]").each((_, el) => {
        const u = absUrl($(el).attr("href"), baseUrl);
        if (u && isListingUrl(u)) links.add(u.split("#")[0].split("?")[0]);
    });

    return [...links];

}

// A találati lista következő oldala (Imobiliare / Imoradar24: ?page=N)
function pageUrl(url, n) {
    try {
        const u = new URL(url);
        u.searchParams.set("page", String(n));
        return u.toString();
    } catch (e) {
        return null;
    }
}

async function scrape(url) {
    const p = await fetchPage(url);
    if (p.status === 404 || p.status === 410) {
        return { link: url, elerheto: false, kulso_kepek: [], forrasok: {} };
    }
    if (p.status >= 400) throw new Error(`HTTP ${p.status}`);
    return extract(p.html, url, p.finalUrl);
}

module.exports = { scrape, extract, extractListingLinks, fetchHtml, fetchPage, pageUrl, isListingUrl, isRoam, numberFrom };
