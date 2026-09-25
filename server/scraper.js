// ============================================================
//  Hirdetés beolvasása linkről
//
//  Az oldalak felépítése eltér, ezért több forrásból próbálunk
//  adatot kinyerni, erősségi sorrendben:
//    1. JSON-LD (schema.org) – a legtöbb nagy oldal megadja
//    2. OpenGraph / meta tagek
//    3. A látható szöveg (román kifejezésekre írt mintákkal)
//  Ami nem található, az "hiányzó" marad – azt az admin pótolja.
// ============================================================

const cheerio = require("cheerio");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Egy hirdetés linkjének mintái oldalanként
const LISTING_PATTERNS = [
    /imobiliare\.ro\/oferta\//i,
    /imoradar24\.ro\/oferta\//i,
    /storia\.ro\/[a-z]{2}\/oferta\//i,
    /olx\.ro\/d\/oferta\//i,
    /publi24\.ro\/anunturi\/.+\/anunt\//i,
    /homezz\.ro\/.+-\d+\.html/i,
    /lajumate\.ro\/.+-id\d+/i,
    /anuntul\.ro\/anunt-/i
];

function isListingUrl(url) {
    return LISTING_PATTERNS.some(re => re.test(url));
}

async function fetchHtml(url) {

    const res = await fetch(url, {
        headers: {
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ro-RO,ro;q=0.9,hu;q=0.8,en;q=0.7"
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20000)
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    return await res.text();

}

// ---------- segédek ----------

function numberFrom(text) {

    if (text === null || text === undefined) return null;

    let s = String(text).replace(/[^\d.,]/g, "");

    if (!s) return null;

    // "125.000" / "125,000" / "125 000" ezres elválasztók; "65,5" tizedes
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

    return out;

}

function firstVal(v) {
    if (Array.isArray(v)) return v[0];
    if (v && typeof v === "object" && "value" in v) return v.value;
    return v;
}

// ---------- típus / ügylet / állapot a szövegből ----------

function guessTipus(text) {
    const t = text.toLowerCase();
    if (/\bteren\b|terenuri|lot de teren/.test(t)) return "telek";
    if (/\bcas[aă]\b|\bvil[aă]\b|case-vile|casa-/.test(t)) return "haz";
    if (/spa[tț]iu[- ]comercial|spatii-comerciale|\bmagazin\b/.test(t)) return "kereskedelmi";
    if (/\bbirou\b|birouri/.test(t)) return "iroda";
    if (/apartament|garsonier/.test(t)) return "lakas";
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
    if (/necesit[aă] renovare|de renovat|stare de renovare/.test(t)) return "felújítandó";
    if (/renovat par[tț]ial|par[tț]ial renovat/.test(t)) return "részbenfel";
    if (/\blux\b|finisaje de lux|premium/.test(t)) return "luxus";
    if (/bloc nou|construc[tț]ie nou[aă]|imobil nou|finalizat 20[2-3]\d/.test(t)) return "újszerű";
    if (/renovat|stare foarte bun[aă]|stare bun[aă]/.test(t)) return "jó";
    return null;
}

// ---------- fő kinyerő ----------

function extract(html, url) {

    const $ = cheerio.load(html);

    const d = {
        link: url,
        cim: null,
        leiras: null,
        ar: null,
        penznem: null,
        nm: null,
        telek_nm: null,
        szobak: null,
        emelet: null,
        allapot: null,
        tipus: null,
        ugylet: null,
        x: null,
        y: null,
        cimSzoveg: null,       // cím / környék szövegesen (helymeghatározáshoz)
        kulso_kepek: [],
        forrasok: {}           // melyik adat honnan jött (pontosság jelzéséhez)
    };

    const set = (key, value, src) => {
        if (value === null || value === undefined || value === "" || (typeof value === "number" && isNaN(value))) return;
        if (d[key] === null || d[key] === undefined) {
            d[key] = value;
            d.forrasok[key] = src;
        }
    };

    // ===== 1) JSON-LD =====
    $('script[type="application/ld+json"]').each((_, el) => {

        let data;

        try { data = JSON.parse($(el).contents().text()); } catch (e) { return; }

        flattenJsonLd(data).forEach(o => {

            const offers = firstVal(o.offers) || (o.price !== undefined || o.lowPrice !== undefined ? o : null);

            if (offers) {
                set("ar", numberFrom(firstVal(offers.price) ?? offers.lowPrice), "jsonld");
                set("penznem", offers.priceCurrency, "jsonld");
            }

            if (o.floorSize) set("nm", numberFrom(firstVal(o.floorSize)), "jsonld");
            if (o.numberOfRooms) set("szobak", numberFrom(firstVal(o.numberOfRooms)), "jsonld");

            if (o.geo) {
                set("y", Number(o.geo.latitude), "jsonld");
                set("x", Number(o.geo.longitude), "jsonld");
            }

            if (o.address) {
                const a = o.address;
                const txt = typeof a === "string"
                    ? a
                    : [a.streetAddress, a.addressLocality, a.addressRegion].filter(Boolean).join(", ");
                set("cimSzoveg", txt, "jsonld");
            }

            if (o.name && /offer|product|apartment|house|residence|singlefamily|accommodation|realestate|place/i.test(String(o["@type"] || ""))) {
                set("cim", String(o.name).trim(), "jsonld");
            }

            if (o.description && String(o.description).length > 40) {
                set("leiras", String(o.description).trim(), "jsonld");
            }

            const imgs = [].concat(o.image || []).map(i => typeof i === "string" ? i : (i && (i.url || i.contentUrl)));
            imgs.filter(Boolean).forEach(i => d.kulso_kepek.push(absUrl(i, url)));

        });

    });

    // ===== 2) Meta tagek =====
    const meta = name => $(`meta[property="${name}"]`).attr("content") || $(`meta[name="${name}"]`).attr("content") || null;

    set("cim", meta("og:title"), "meta");
    set("leiras", meta("og:description") || meta("description"), "meta");
    set("ar", numberFrom(meta("product:price:amount") || meta("og:price:amount")), "meta");
    set("penznem", meta("product:price:currency") || meta("og:price:currency"), "meta");
    set("y", Number(meta("place:location:latitude") || meta("og:latitude")) || null, "meta");
    set("x", Number(meta("place:location:longitude") || meta("og:longitude")) || null, "meta");

    $('meta[property="og:image"], meta[name="og:image"]').each((_, el) => {
        d.kulso_kepek.push(absUrl($(el).attr("content"), url));
    });

    // Koordináta attribútumokban vagy scriptben
    if (!d.x || !d.y) {

        const latAttr = $("[data-lat]").first().attr("data-lat") || $("[data-latitude]").first().attr("data-latitude");
        const lngAttr = $("[data-lng]").first().attr("data-lng") || $("[data-lon]").first().attr("data-lon") || $("[data-longitude]").first().attr("data-longitude");

        if (latAttr && lngAttr) {
            set("y", Number(latAttr), "attr");
            set("x", Number(lngAttr), "attr");
        } else {
            const m = html.match(/"lat(?:itude)?"\s*:\s*"?(4[3-8]\.\d{3,})"?\s*,\s*"(?:lng|lon|long|longitude)"\s*:\s*"?(2[0-9]\.\d{3,})"?/);
            if (m) {
                set("y", Number(m[1]), "script");
                set("x", Number(m[2]), "script");
            }
        }

    }

    // ===== 3) Látható szöveg =====
    $("script, style, noscript").remove();

    const text = $("body").text().replace(/\s+/g, " ");
    const cimEsLink = `${d.cim || ""} ${url}`;

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

    if (!d.nm) {
        const m = text.match(/suprafa[tț][aă]\s*util[aă][^0-9]{0,20}(\d{2,4}(?:[.,]\d{1,2})?)/i)
            || text.match(/(\d{2,4}(?:[.,]\d{1,2})?)\s*(?:mp|m²|m2|metri p[aă]tra[tț]i)\b/i);
        if (m) set("nm", numberFrom(m[1]), "text");
    }

    if (!d.szobak) {
        const m = text.match(/(?:nr\.?\s*camere|num[aă]r\s*camere)[^0-9]{0,10}(\d{1,2})/i)
            || cimEsLink.match(/(\d{1,2})[- ]camer/i)
            || text.match(/(\d{1,2})\s*camer/i);
        if (m) set("szobak", Number(m[1]), "text");
        else if (/garsonier/i.test(cimEsLink)) set("szobak", 1, "text");
    }

    {
        const m = text.match(/etaj(?:ul)?\s*[:\-]?\s*(parter|p|demisol|\d{1,2})\s*(?:\/|din)\s*(\d{1,2})/i);
        if (m) {
            const e = /^(p|parter)$/i.test(m[1]) ? "0" : /demisol/i.test(m[1]) ? "-1" : m[1];
            set("emelet", `${e}/${m[2]}`, "text");
        } else {
            const m2 = text.match(/etaj(?:ul)?\s*[:\-]?\s*(parter|\d{1,2})\b/i);
            if (m2) set("emelet", /parter/i.test(m2[1]) ? "0" : m2[1], "text");
        }
    }

    if (!d.telek_nm) {
        const m = text.match(/(?:suprafa[tț][aă]\s*teren|teren)[^0-9]{0,20}(\d{2,6}(?:[.,]\d{1,2})?)\s*(?:mp|m²|m2)/i);
        if (m) set("telek_nm", numberFrom(m[1]), "text");
    }

    set("tipus", guessTipus(cimEsLink) || guessTipus(text.slice(0, 3000)), "text");
    set("ugylet", guessUgylet(cimEsLink) || guessUgylet(text.slice(0, 3000)), "text");
    set("allapot", guessAllapot(`${d.leiras || ""} ${text.slice(0, 20000)}`), "text");

    // ===== Képek =====
    if (d.kulso_kepek.length < 3) {
        $("img").each((_, el) => {
            const src = $(el).attr("data-src") || $(el).attr("src") || "";
            if (/\.(jpe?g|webp|png)(\?|$)/i.test(src) && !/logo|icon|avatar|sprite|placeholder/i.test(src)) {
                d.kulso_kepek.push(absUrl(src, url));
            }
        });
    }

    d.kulso_kepek = [...new Set(d.kulso_kepek.filter(Boolean))].slice(0, 15);

    // ===== Tisztítás, józan ész ellenőrzés =====
    if (d.penznem && !/eur/i.test(d.penznem)) {
        // RON-ban megadott ár – átváltás közelítően (1 EUR ≈ 5 RON)
        if (/ron|lei/i.test(d.penznem) && d.ar) {
            d.ar = Math.round(d.ar / 5);
            d.forrasok.ar = "ron-atvaltva";
        }
    }

    if (d.nm && (d.nm < 8 || d.nm > 100000)) d.nm = null;
    if (d.szobak && (d.szobak < 1 || d.szobak > 30)) d.szobak = null;
    if (d.x && (d.x < 20 || d.x > 30)) { d.x = null; d.y = null; }
    if (d.y && (d.y < 43 || d.y > 49)) { d.x = null; d.y = null; }

    if (d.cim) d.cim = d.cim.replace(/\s*[|–-]\s*(imobiliare\.ro|storia|olx|imoradar24|publi24).*$/i, "").trim().slice(0, 200);
    if (d.leiras) d.leiras = d.leiras.slice(0, 5000);

    return d;

}

// Találati lista oldalról a hirdetések linkjei
function extractListingLinks(html, baseUrl) {

    const $ = cheerio.load(html);
    const links = new Set();

    $("a[href]").each((_, el) => {
        const u = absUrl($(el).attr("href"), baseUrl);
        if (u && isListingUrl(u)) {
            links.add(u.split("#")[0]);
        }
    });

    return [...links];

}

async function scrape(url) {
    const html = await fetchHtml(url);
    return extract(html, url);
}

module.exports = { scrape, extract, extractListingLinks, fetchHtml, isListingUrl, numberFrom };
