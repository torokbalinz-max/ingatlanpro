// ============================================================
//  Hirdetések: típusok, kötelező mezők, bemenet tisztítása
// ============================================================

const TIPUSOK = ["lakas", "haz", "telek", "kereskedelmi", "iroda"];
const UGYLETEK = ["elado", "kiado"];
const ALLAPOTOK = ["felújítandó", "részbenfel", "jó", "újszerű", "luxus"];

// Típusonként mely mezők értelmesek
const TIPUS_MEZOK = {
    lakas: { szobak: true, emelet: true, allapot: true, telek: false },
    haz: { szobak: true, emelet: false, allapot: true, telek: true },
    telek: { szobak: false, emelet: false, allapot: false, telek: false },
    kereskedelmi: { szobak: false, emelet: true, allapot: true, telek: false },
    iroda: { szobak: true, emelet: true, allapot: true, telek: false }
};

function szam(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
    return isNaN(n) ? null : n;
}

function szoveg(v, max = 20000) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s.slice(0, max) : null;
}

// A kérésből érkező adatok egységes formára hozása
function normalize(b) {

    const tipus = TIPUSOK.includes(b.tipus) ? b.tipus : "lakas";
    const ugylet = UGYLETEK.includes(b.ugylet) ? b.ugylet : "elado";
    const mezok = TIPUS_MEZOK[tipus];

    const ar = szam(b.ar);
    const nm = szam(b.nm);

    return {
        tipus,
        ugylet,
        cim: szoveg(b.cim, 200),
        leiras: szoveg(b.leiras),
        link: szoveg(b.link, 2000),
        ar,
        nm,
        arnm: ar > 0 && nm > 0 ? ar / nm : null,
        telek_nm: mezok.telek ? szam(b.telek_nm) : null,
        szobak: mezok.szobak ? szam(b.szobak) : null,
        emelet: mezok.emelet ? szoveg(b.emelet, 20) : null,
        allapot: mezok.allapot && ALLAPOTOK.includes(b.allapot) ? b.allapot : (mezok.allapot ? szoveg(b.allapot, 40) : null),
        eladva: !!b.eladva,
        x: szam(b.x),
        y: szam(b.y),
        varos: szoveg(b.varos, 100),
        kerulet: szoveg(b.kerulet, 100),
        hely_pontossag: b.hely_pontossag === "kozelito" ? "kozelito" : (szam(b.x) && szam(b.y) ? "pontos" : null),
        kulso_kepek: Array.isArray(b.kulso_kepek) ? b.kulso_kepek.filter(u => /^https?:\/\//.test(u)).slice(0, 20) : null,
        tovabbi_linkek: Array.isArray(b.tovabbi_linkek) ? b.tovabbi_linkek.filter(u => /^https?:\/\//.test(u)).slice(0, 20) : null
    };

}

// Hiányzó kötelező mezők
//  mod = "kezi"   -> közvetlenül az oldalon feltöltött hirdetés: minden kell (kép is)
//  mod = "link"   -> más oldalon lévő hirdetés linkkel: az alapadatok kellenek
//  mod = "import" -> automatikus beolvasás: csak jelöljük, mi hiányzik
function hianyzoMezok(d, opts = {}) {

    const mod = opts.mod || (d.link ? "link" : "kezi");
    const mezok = TIPUS_MEZOK[d.tipus] || TIPUS_MEZOK.lakas;
    const h = [];

    if (!(d.ar > 0)) h.push("ar");
    if (!(d.nm > 0)) h.push("nm");
    if (!d.varos) h.push("varos");
    if (!(d.x && d.y)) h.push("hely");
    if (opts.vannakKeruletek && !d.kerulet) h.push("kerulet");

    if (mezok.szobak && d.tipus !== "kereskedelmi" && !(d.szobak > 0)) h.push("szobak");

    if (mezok.emelet && (d.emelet === null || d.emelet === undefined || d.emelet === "")) h.push("emelet");

    if (mezok.telek && !(d.telek_nm > 0)) h.push("telek_nm");

    if (mezok.allapot && !d.allapot) h.push("allapot");

    if (mod === "kezi") {
        if (!d.cim) h.push("cim");
        if (!d.leiras || d.leiras.length < 20) h.push("leiras");
        if (!(opts.kepDb > 0)) h.push("kepek");
    }

    return h;

}

// Feltöltött képek (data URL) ellenőrzése, Buffer-ré alakítása
function parseKepek(lista) {

    if (!Array.isArray(lista)) return [];

    return lista.slice(0, 15).map(d => {

        const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(d || ""));

        if (!m) return null;

        const buf = Buffer.from(m[2], "base64");

        if (buf.length === 0 || buf.length > 4 * 1024 * 1024) return null;

        return { mime: m[1], adat: buf };

    }).filter(Boolean);

}

// Link egységesítése a duplikátum-kereséshez
function normLink(l) {

    const s = String(l || "").trim();

    if (!s) return "";

    try {
        const u = new URL(s);
        return (u.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "") +
            u.pathname.replace(/\/+$/, "")).toLowerCase();
    } catch (e) {
        return "";
    }

}

module.exports = { TIPUSOK, UGYLETEK, TIPUS_MEZOK, normalize, hianyzoMezok, parseKepek, normLink, szam, szoveg };
