// ============================================================
//  Közvetlen beolvasás a hirdetési oldalakról (Imoradar24 nélkül)
//
//  A hirdetéseket a forrásoldal saját nyilvános listájából vesszük,
//  így minden hirdetés a SAJÁT oldalán lévő pontos hirdetésre mutat
//  (nincs közvetítő, nincs "keresés a forrásoldalon"):
//
//   - OLX:    a nyilvános API (/api/v1/offers?category_id=…&city_id=…) –
//             alkategóriánként (lakás 1–4 szoba, ház, telek, üzlethelyiség…),
//             a válasz megadja az összes találat számát is (teljesség-ellenőrzés)
//   - Storia: a találati lista (__NEXT_DATA__), lapozással, a lista maga
//             adja meg az összes találatot és az oldalak számát
//
//  Az imobiliare.ro a szervert letiltja – az ő hirdetései továbbra is az
//  Imoradar24 listájából jönnek, de az imobiliare.ro-s hirdetés pontos
//  linkjével (services/scraper.js keresesiElem). A többi oldal (Publi24,
//  Homezz...) hirdetései szintén az Imoradar24-ről jönnek; azokra
//  kattintva az Imoradar24 adatlapja nyílik (ott pontosan az a hirdetés).
//
//  Élőben ellenőrizve 2026-11-12 (Sepsiszentgyörgy): OLX API 329 ingatlan-
//  hirdetés, alkategóriák: 1163/1165/1167/1169 eladó lakás 1–4+ szoba,
//  1155/1157/1159/1161 kiadó lakás, 911 eladó ház, 913 kiadó ház, 709 telek,
//  710 üzlethelyiség / iroda ("alege" = vanzare / inchiriere). Az OLX egy
//  lekérdezésben legfeljebb 1000 találatot ad – efölött a lista nem teljes,
//  ilyenkor a hiányzókat nem vesszük levettnek.
// ============================================================

const { biztonsagosFetch } = require("../lib/biztonsagosFetch");
const forrasHely = require("./forrasHely");
const { numberFrom } = require("./scraper");

// Állapot a hirdetés saját szövegéből (mint a scraperben)
function guessAllapotSzoveg(t) {
    try { const r = require("./allapotok").felismer(t); return r ? r.ertek : null; } catch (e) { return null; }
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KESLELTETES = +(process.env.KOZVETLEN_DELAY || 500);

// Melyik oldalt olvassuk közvetlenül
const FORRASOK = ["olx", "storia"];

class TiltasHiba extends Error {
    constructor(oldal, status) { super(`HTTP ${status}`); this.oldal = oldal; this.status = status; this.tiltas = true; }
}

async function getJson(url, oldal) {
    const res = await biztonsagosFetch(url, {
        headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "ro-RO,ro;q=0.9" },
        signal: AbortSignal.timeout(25000)
    });
    if (res.status === 403 || res.status === 429) throw new TiltasHiba(oldal, res.status);
    if (res.status >= 400) throw new Error("HTTP " + res.status);
    return res.json();
}

async function getHtml(url, oldal) {
    const res = await biztonsagosFetch(url, {
        headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ro-RO,ro;q=0.9" },
        signal: AbortSignal.timeout(25000)
    });
    if (res.status === 403 || res.status === 429) throw new TiltasHiba(oldal, res.status);
    if (res.status >= 400) throw new Error("HTTP " + res.status);
    return res.text();
}

// ===================== OLX =====================

//  alkategória -> { tipus, ugylet, szobak }   (ugylet null: a hirdetés "alege" paraméteréből / címéből)
const OLX_KAT = {
    1163: { tipus: "lakas", ugylet: "elado", szobak: 1 },
    1165: { tipus: "lakas", ugylet: "elado", szobak: 2 },
    1167: { tipus: "lakas", ugylet: "elado", szobak: 3 },
    1169: { tipus: "lakas", ugylet: "elado", szobak: 4 },
    1155: { tipus: "lakas", ugylet: "kiado", szobak: 1 },
    1157: { tipus: "lakas", ugylet: "kiado", szobak: 2 },
    1159: { tipus: "lakas", ugylet: "kiado", szobak: 3 },
    1161: { tipus: "lakas", ugylet: "kiado", szobak: 4 },
    911: { tipus: "haz", ugylet: "elado" },
    913: { tipus: "haz", ugylet: "kiado" },
    709: { tipus: "telek", ugylet: null },
    710: { tipus: "kereskedelmi", ugylet: null }
};

// Típus / ügylet -> mely alkategóriákat kell lekérni
function olxKategoriak(tipus, ugylet) {
    return Object.entries(OLX_KAT)
        .filter(([, k]) => (!tipus || k.tipus === tipus || (tipus === "iroda" && k.tipus === "kereskedelmi")) && (!ugylet || !k.ugylet || k.ugylet === ugylet))
        .map(([id]) => Number(id));
}

function olxParamKulcs(o, kulcs) {
    const p = (o.params || []).find(x => x.key === kulcs);
    if (!p || !p.value) return null;
    return p.value.key !== undefined ? p.value.key : p.value.value;
}

function ugyletSzovegbol(t) {
    const s = String(t || "").toLowerCase();
    if (/inchiri|închiri|de inchiriat|chirie|kiad[oó]/.test(s)) return "kiado";
    if (/vanzare|vânzare|vand\b|vând\b|elad[oó]/.test(s)) return "elado";
    return null;
}

// Egy OLX ajánlat (API) -> a beolvasás adatai (a scraper.keresesiElem formájában)
function olxElem(o) {

    if (!o || !o.id || !o.url) return null;
    const kat = OLX_KAT[o.category && o.category.id];
    if (!kat) return null;

    const st = String(o.status || "active").toLowerCase();
    // "limited": korlátozott kiemelésű, de nyilvánosan látható hirdetés
    if (st && !["active", "limited"].includes(st)) return null;

    const a = forrasHely.olxAdat(o);

    // Ár: euró (ha lejben adták: az OLX saját átváltása, különben ~5 lej / euró)
    const arP = ((o.params || []).find(x => x.key === "price") || {}).value || {};
    let ar = Number(arP.value) || null;
    if (ar && arP.currency && /ron|lei/i.test(arP.currency)) {
        ar = arP.converted_currency === "EUR" && arP.converted_value ? Math.round(Number(arP.converted_value)) : Math.round(ar / 5);
    }

    const alege = String(olxParamKulcs(o, "alege") || "").toLowerCase();
    const ugylet = kat.ugylet || (alege === "inchiriere" ? "kiado" : alege === "vanzare" ? "elado" : null) || ugyletSzovegbol(o.title) || "elado";
    let tipus = kat.tipus;
    if (tipus === "kereskedelmi" && /\bbirou|birouri|office/i.test(o.title || "")) tipus = "iroda";

    const roomsKulcs = String(olxParamKulcs(o, "rooms") || "").toLowerCase();
    const szobak = { one: 1, two: 2, three: 3, four: 4 }[roomsKulcs] || kat.szobak || a.szobak || null;

    const nm = numberFrom(olxParamKulcs(o, "m") || olxParamKulcs(o, "usablearea"));
    const telek = numberFrom(olxParamKulcs(o, "suprafata_teren"));
    const emeletK = String(olxParamKulcs(o, "floor") || "");
    const emelet = /ground|parter|fl_0\b/i.test(emeletK) ? "0" : /basement|demisol|subsol/i.test(emeletK) ? "-1" : ((emeletK.match(/(\d{1,2})/) || [])[1] || null);
    const link = String(o.url).split("#")[0].split("?")[0];
    const leiras = a.leiras || null;

    const d = {
        link,
        tovabbi_linkek: [],
        forrasLista: [{ forras: "olx", forrasNev: "OLX.ro", id: String(o.id), url: link, kozvetito: null, ar }],
        olxId: String(o.id),
        forrasNev: "olx",
        forrasKulcs: "olx",
        reszletUrl: null,
        elerheto: true,
        cim: String(o.title || "").trim().slice(0, 200) || null,
        leiras,
        ar,
        penznem: "EUR",
        nm: nm && nm >= 8 && nm <= 100000 ? nm : null,
        telek_nm: telek || (tipus === "telek" ? nm : null) || null,
        szobak: szobak && szobak >= 1 && szobak <= 30 ? szobak : null,
        emelet,
        osszEmelet: null,
        evszam: null,
        allapot: guessAllapotSzoveg([o.title, leiras].filter(Boolean).join(" \n ")),
        tipus,
        ugylet,
        x: a.x, y: a.y,
        forrasHely: a.hely || null,
        kerulet: a.kerulet || null,
        utca: null,
        varosForras: o.location && o.location.city ? o.location.city.name : null,
        cimSzoveg: a.kerulet || null,
        kulso_kepek: a.kulso_kepek || [],
        forrasok: { osszes: "kereses" },
        kozvetlenForras: "olx"
    };
    if (tipus === "telek") { d.nm = null; d.szobak = null; d.emelet = null; }
    d.forrasSzoveg = [d.cim, [ar ? ar + " €" : null, d.nm ? d.nm + " m²" : null, d.szobak ? d.szobak + " cam." : null, emelet ? "etaj " + emelet : null].filter(Boolean).join(" · "), leiras ? leiras.slice(0, 1500) : null].filter(Boolean).join("\n\n").slice(0, 4000);
    return d;

}

// Egy város (OLX city_id) egy alkategóriája – az összes oldal.
//  -> { elemek, teljes, ossz }
async function olxKategoria(cityId, katId) {
    const elemek = new Map();
    let ossz = null;
    const LIMIT = 40;
    for (let offset = 0; offset < 1000; offset += LIMIT) {
        const j = await getJson(`https://www.olx.ro/api/v1/offers/?offset=${offset}&limit=${LIMIT}&category_id=${katId}&city_id=${cityId}`, "olx.ro");
        const meta = j && j.metadata;
        if (meta && Number.isFinite(Number(meta.total_elements))) ossz = Number(meta.total_elements);
        const d = (j && j.data) || [];
        let uj = 0;
        d.forEach(o => { if (o && o.id && !elemek.has(o.id)) { elemek.set(o.id, o); uj++; } });
        if (!d.length || !uj || !(j.links && j.links.next) || (ossz !== null && offset + LIMIT >= ossz)) break;
        await sleep(KESLELTETES);
    }
    // Teljes, ha az OLX szerinti összes találatot megkaptuk (1000 fölött az OLX nem ad többet)
    const kapott = elemek.size;
    const teljes = ossz !== null && ossz < 1000 && kapott >= Math.floor(ossz * 0.97);
    return { nyers: [...elemek.values()], teljes, ossz, kapott };
}

//  hely: { varosRo }  tipus / ugylet: null = mind
//  -> { elemek: [...], csoportok: [{ tipus, ugylet, teljes }], hiba? }
// Az OLX város-azonosítója (a letiltást nem nyeljük el: azt jelezni kell)
async function olxVarosAzon(varosRo) {
    const k = forrasHely.slug(varosRo);
    if (!k) return null;
    const j = await getJson(`https://www.olx.ro/api/v1/friendly-links/query-params/${encodeURIComponent(k)}`, "olx.ro");
    return j && j.data && j.data.city_id ? Number(j.data.city_id) : null;
}

async function olxVaros(hely, tipus = null, ugylet = null) {
    const cityId = await olxVarosAzon(hely.varosRo);
    if (!cityId) return { elemek: [], csoportok: [], hiba: "olx_city_not_found" };
    const elemek = [];
    const csoport = new Map();      // "tipus|ugylet" -> teljes
    for (const katId of olxKategoriak(tipus, ugylet)) {
        const k = await olxKategoria(cityId, katId);
        const kat = OLX_KAT[katId];
        k.nyers.map(olxElem).filter(Boolean).forEach(e => elemek.push(e));
        // a csoport (típus + ügylet) teljessége: minden alkategóriája teljes
        const ugyletek = kat.ugylet ? [kat.ugylet] : ["elado", "kiado"];
        const tipusok = kat.tipus === "kereskedelmi" ? ["kereskedelmi", "iroda"] : [kat.tipus];
        tipusok.forEach(t => ugyletek.forEach(u => {
            const kulcs = `${t}|${u}`;
            csoport.set(kulcs, (csoport.has(kulcs) ? csoport.get(kulcs) : true) && k.teljes);
        }));
        await sleep(KESLELTETES);
    }
    // ugyanaz a hirdetés két alkategóriában nem lehet, de a kiemeltek ismétlődhetnek
    const egyedi = [...new Map(elemek.map(e => [e.olxId, e])).values()]
        .filter(e => (!tipus || e.tipus === tipus) && (!ugylet || e.ugylet === ugylet));
    return {
        elemek: egyedi,
        csoportok: [...csoport.entries()].map(([k, teljes]) => { const [t, u] = k.split("|"); return { tipus: t, ugylet: u, teljes }; })
            .filter(c => (!tipus || c.tipus === tipus) && (!ugylet || c.ugylet === ugylet))
    };
}

// ===================== STORIA =====================

const STORIA_TIPUSOK = { lakas: "apartament", haz: "casa", telek: "teren", kereskedelmi: "spatiu-comercial", iroda: "birou" };

function storiaLapbol(html) {
    const nd = (() => {
        const m = String(html || "").match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (!m) return null;
        try { return JSON.parse(m[1]); } catch (e) { return null; }
    })();
    const sa = nd && nd.props && nd.props.pageProps && nd.props.pageProps.data && nd.props.pageProps.data.searchAds;
    if (!sa) return null;
    return { pag: sa.pagination || {}, elemek: forrasHely.storiaListabol(html) };
}

//  -> { elemek, teljes, ossz }
async function storiaCsoport(hely, tipus, ugylet) {
    const elemek = new Map();
    let ossz = null, oldalak = 1;
    for (let page = 1; page <= Math.min(oldalak, 40); page++) {
        const url = forrasHely.storiaListaUrl({ megye: hely.megye, varosRo: hely.varosRo, tipus, ugylet }, { limit: 72, page });
        if (!url) break;
        const l = storiaLapbol(await getHtml(url, "storia.ro"));
        if (!l) break;
        if (Number.isFinite(Number(l.pag.totalItems))) ossz = Number(l.pag.totalItems);
        oldalak = Number(l.pag.totalPages) || 1;
        let uj = 0;
        l.elemek.forEach(e => { if (!elemek.has(e.link)) { elemek.set(e.link, e); uj++; } });
        if (!uj) break;
        await sleep(KESLELTETES);
    }
    const lista = [...elemek.values()].map(e => ({
        ...e,
        tipus,
        ugylet,
        forrasNev: "storia",
        forrasKulcs: "storia",
        forrasLista: [{ forras: "storia", forrasNev: "Storia.ro", id: e.id, url: e.link, kozvetito: null, ar: e.ar }],
        storiaId: e.id,
        tovabbi_linkek: [],
        allapot: guessAllapotSzoveg([e.cim, e.leiras].filter(Boolean).join(" \n ")),
        forrasSzoveg: [e.cim, [e.ar ? e.ar + " €" : null, e.nm ? e.nm + " m²" : null, e.szobak ? e.szobak + " cam." : null, e.utca].filter(Boolean).join(" · "), e.leiras].filter(Boolean).join("\n\n").slice(0, 4000),
        kozvetlenForras: "storia"
    }));
    const teljes = ossz !== null && lista.length >= Math.floor(ossz * 0.97);
    return { elemek: lista, teljes, ossz, kapott: lista.length };
}

async function storiaVaros(hely, tipus = null, ugylet = null) {
    if (!hely.megye || !hely.varosRo) return { elemek: [], csoportok: [], hiba: "storia_no_county" };
    const elemek = [];
    const csoportok = [];
    for (const t of Object.keys(STORIA_TIPUSOK)) {
        if (tipus && t !== tipus) continue;
        for (const u of ["elado", "kiado"]) {
            if (ugylet && u !== ugylet) continue;
            // telket nem adnak ki – a Storia kiadó telek listája üres, nem kérjük le
            if (t === "telek" && u === "kiado") continue;
            const c = await storiaCsoport(hely, t, u);
            elemek.push(...c.elemek);
            csoportok.push({ tipus: t, ugylet: u, teljes: c.teljes, ossz: c.ossz, kapott: c.kapott });
            await sleep(KESLELTETES);
        }
    }
    return { elemek, csoportok };
}

// ===================== MINDEN FORRÁS =====================

//  hely: { varosRo, megye }   opts: { forrasok: ["olx","storia"], tipus, ugylet }
//  -> { olx: {...}, storia: {...} } – forrásonként { elemek, csoportok, hiba?, tiltva? }
async function varos(hely, opts = {}) {
    const ki = {};
    for (const f of (opts.forrasok || FORRASOK)) {
        try {
            if (f === "olx") ki.olx = await olxVaros(hely, opts.tipus, opts.ugylet);
            else if (f === "storia") ki.storia = await storiaVaros(hely, opts.tipus, opts.ugylet);
        } catch (e) {
            ki[f] = { elemek: [], csoportok: [], hiba: e.message, tiltva: !!e.tiltas };
        }
    }
    return ki;
}

// Egy hirdetés (OLX / Storia link) még fent van-e a saját oldalán: true | false | null (nem tudjuk)
async function fentVan(link) {
    const l = String(link || "");
    if (!/(olx|storia)\.ro\//i.test(l)) return null;
    try {
        const res = await biztonsagosFetch(l, {
            headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ro-RO,ro;q=0.9" },
            signal: AbortSignal.timeout(20000)
        }, 6);
        if (res.status === 404 || res.status === 410) return false;
        if (res.status >= 400) return null;
        const vegso = res.vegsoUrl || l;
        // a hirdetésről máshová (keresésre, főoldalra) irányított át: levették
        if (!/\/oferta\//i.test(vegso)) return false;
        const html = await res.text();
        const s = /olx\.ro/i.test(vegso) ? forrasHely.olxOldalbol(html) : forrasHely.storiaOldalbol(html);
        if (s && s.aktiv === false) return false;
        return true;
    } catch (e) {
        return null;
    }
}

module.exports = { varos, olxVaros, storiaVaros, olxElem, olxKategoriak, fentVan, FORRASOK, OLX_KAT, _teszt: { storiaLapbol } };
