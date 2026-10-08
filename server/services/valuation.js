// ============================================================
//  Ingatlan értékbecslő (3.1 változat)
//
//  Két lépés, mint egy ingatlanértékelőnél:
//
//  1) Árarány-modell (hedonikus): az egész város hirdetéseiből tanuljuk,
//     mennyit számít a méret (a kis lakások €/m²-e jóval magasabb), az
//     állapot, az emelet, a magas (8+ emeletes) tömbház, a kerület, az
//     építés éve, az új építés. Ahol kevés az adat, a józan piaci arányok
//     felé húzunk, a kilógó hirdetések kis súlyt kapnak (robusztus
//     illesztés). Az eredmény szorzók sora:
//        €/m² = alap × méret × állapot × emelet × kerület × ...
//
//  2) Helyi korrekció a leghasonlóbb hirdetésekből: minden hasonló
//     hirdetés árát a modell szorzóival a keresett ingatlanra számoljuk át
//     (pl. egy felújítandó 50 m²-es Csiki lakást egy jó állapotú 55 m²-es
//     központi lakásra), és ezek súlyozott átlagát vesszük. Ez lényegében
//     azt méri, mennyivel kérnek a hozzá hasonló lakásokért többet vagy
//     kevesebbet, mint amit a modell mondana.
//
//  A végső becslés a kettő keveréke: sok nagyon hasonló hirdetésnél a
//  hasonlók döntenek, kevésnél a modell.
//
//  A kerület (meglévő lakásnál) csak a modell kerület-szorzójával számít:
//  ugyanaz a lakás két kerületben pontosan a két szorzó arányában
//  különbözik, így egy olcsóbb kerület nem "ugorhat" a drágább elé
//  néhány véletlenül drága hirdetés miatt. Ha az admin megadja a
//  kerületek árszintjét (1 = legdrágább), a szorzók ezt a sorrendet is
//  betartják (amit az adatok nem tudnak eldönteni, ott egyformák lesznek).
//
//  Ami a 3. változatban új:
//   - ÚJÉPÍTÉSŰ lakások külön: az új építésű (az elmúlt ~6 évben épült,
//     "újépítésű" / "félkész" állapotú, vagy a címe szerint új projekt)
//     hirdetések egy régi lakás becslését nem húzzák fel. A modellben
//     saját arányuk van (kerületenként is), a hasonlók között pedig
//     csak akkor számítanak, ha a keresett ingatlan is új.
//   - Pontos alapterület: a tizedes m² (48,8) pontosan számít, és a
//     becslés folytonos – 1 m² eltérés csak a méret szerinti kis
//     változást okoz, nem ugrik.
//   - Egy konkrét hirdetés becslésénél a hirdetés saját ára (és a más
//     oldalon lévő ugyanilyen példánya) soha nem számít bele.
//   - A kerület / város "átlaga" helyett medián (újépítésűek nélkül), a
//     duplikált hirdetések csak egyszer számítanak.
//
//  A /api/admin/ertekbecslo-teszt a valós adatokon méri a pontosságot
//  (minden hirdetést a többi alapján becsül meg), és összeveti az előző
//  változattal (services/valuationV2.js).
// ============================================================

const db = require("../db/database");
const allapotok = require("./allapotok");

// ---------- segédek ----------

const most = () => new Date().getFullYear();

function szam(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
    return isNaN(n) ? null : n;
}

function emeletSzam(e) {
    const n = parseInt(String(e ?? "").split("/")[0], 10);
    return isNaN(n) ? null : n;
}

function emeletOssz(e) {
    const n = parseInt(String(e ?? "").split("/")[1], 10);
    return isNaN(n) ? null : n;
}

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function atlag(list) {
    return list.length ? list.reduce((s, x) => s + x, 0) / list.length : 0;
}

function median(list) {
    if (!list.length) return 0;
    return percentile([...list].sort((a, b) => a - b), 0.5);
}

function ekezetNelkul(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ---------- újépítésű? ----------

// A cím szerint új építésű projekt ("Apartament nou", "proiect rezidențial", "NZEB", "+TVA"...).
// "nou amenajat / renovat / mobilat" = felújított, az nem új építés.
const UJ_SZOVEG = /\b(?:bloc(?:ul)?|imobil(?:ul)?|cladire(?:a)?)\s+nou\b|\bconstructi[ea]\s+noua\b|\b(?:apartament(?:ul|e)?|garsonier[ae]|studio(?:uri)?)\s+no(?:u|ua|i)\b(?![\s-]*(?:renovat|amenajat|mobilat|zugravit|modernizat|utilat))|\b(?:proiect|ansamblu|complex)(?:ul)?\s+rezidential\b|\bdezvoltator\w*|\bnzeb\b|\bpredare\s+(?:in\s+|estimata\s+)?(?:\w+\s+)?20[2-3]\d\b|(?:\+|\bplus)\s*tva\b|\btva\s+inclus\w*|\buj ?epitesu\w*|\buj epites\w*|\bnew[- ]build\w*/;

//  Új építésű-e a hirdetés (külön piac: egy régi lakás becslését ne húzza fel)
//   - az építés éve az elmúlt 6 évben (vagy még épül)
//   - "újépítésű" / "félkész" állapot (ha nem régi az épület)
//   - a címe szerint új projekt
function ujEpitesu(i) {
    const ev = Number(i.evszam) || null;
    if (ev && ev >= most() - 6) return true;
    if (ev && ev < most() - 12) return false;
    const k = allapotok.norm(i.allapot);
    if (k === "újépítésű" || k === "félkész") return true;
    return UJ_SZOVEG.test(ekezetNelkul(i.cim));
}

// ---------- adatok ----------

async function adatok(varos, tipus, ugylet) {
    const r = await db.query(`
        SELECT id, link, ar, nm, szobak, emelet, allapot, kerulet, eladva, telepules, telek_jelleg, telek_nm, evszam,
               cim, x, y, hely_pontossag, hely_forras
        FROM ingatlanok
        WHERE varos = $1 AND ar > 0 AND nm > 0
          AND statusz = 'aktiv' AND ellenorzott
          AND COALESCE(tipus, 'lakas') = $2
          AND COALESCE(ugylet, 'elado') = $3
    `, [varos, tipus || "lakas", ugylet || "elado"]);
    return r.rows;
}

// A kerületek admin által megadott árszintje (1 = legdrágább ... 5 = legolcsóbb)
// -> Map(kerület neve -> szint), vagy null, ha egyik sincs megadva
async function keruletSzintek(varos) {
    try {
        const r = await db.query("SELECT nev, arszint FROM keruletek WHERE varos = $1 AND arszint IS NOT NULL", [varos]);
        const m = new Map();
        r.rows.forEach(k => {
            const s = Number(k.arszint);
            if (k.nev && s >= 1 && s <= 5) m.set(k.nev, s);
        });
        return m.size ? m : null;
    } catch (e) {
        return null;    // pl. még nincs ilyen oszlop
    }
}

// A becslés "környezete": a típus, az ügylet, és hogy kerület vagy település szerint
// számít-e a hely (háznál, teleknél és a "<város> és környéke" városban a falu)
async function kornyezet(varos, tipus, ugylet) {
    let kornyekVaros = false;
    try { kornyekVaros = await require("./kornyek").isKornyek(varos); } catch (e) { kornyekVaros = false; }
    const telepulesSzerint = kornyekVaros || ["haz", "telek"].includes(tipus || "lakas");
    return {
        tipus: tipus || "lakas",
        ugylet: ugylet || "elado",
        kornyekVaros,
        telepulesSzerint,
        // A kerületek árszintje (csak ha kerület szerint számít a hely)
        szintek: telepulesSzerint ? null : await keruletSzintek(varos)
    };
}

function helyKulcs(i, ctx) {
    return (ctx.telepulesSzerint ? i.telepules : i.kerulet) || null;
}

function elokeszit(i, ctx) {
    const e = emeletSzam(i.emelet);
    const o = emeletOssz(i.emelet);
    const k = allapotok.norm(i.allapot);
    const ervenyes = !!k && allapotok.ervenyes(k);
    const ar = Number(i.ar), nm = Number(i.nm);
    return {
        ...i,
        ar, nm,
        arNm: ar > 0 && nm > 0 ? ar / nm : null,
        _allapot: ervenyes ? k : null,
        _szint: ervenyes ? allapotok.rang(k) : null,
        _emelet: e,
        _ossz: o,
        _legfelso: e !== null && o !== null && o >= 3 && e >= o,
        _uj: i._uj !== undefined ? !!i._uj : ujEpitesu(i),
        _ev: Number(i.evszam) || null,
        _hely: helyKulcs(i, ctx)
    };
}

// Ugyanaz a lakás többször (más oldalon, más linkkel): méret, szobák, emelet,
// hely és ár szerint ugyanaz
function ikerKulcs(i) {
    return [Math.round(Number(i.nm) * 2) / 2, i.szobak || "", String(i.emelet || ""), i._hely || "", Math.round(Number(i.ar) / 750)].join("|");
}

function ikrek(a, b) {
    return Math.abs(Number(a.nm) - Number(b.nm)) <= 0.6 &&
        (a.szobak || 0) === (b.szobak || 0) &&
        String(a.emelet || "") === String(b.emelet || "") &&
        (a._hely || "") === (b._hely || "") &&
        Math.abs(Number(a.ar) / Number(b.ar) - 1) <= 0.03;
}

const tisztaLink = l => String(l || "").split("?")[0].trim();

//  A becslés hirdetései:
//   - duplikált hirdetések (ugyanaz a link, vagy ugyanaz a lakás más oldalon) csak egyszer
//   - a becsült hirdetés saját maga és az ikrei kimaradnak (kihagy = azonosító)
//   - a nagyon kilógó €/m² (valószínűleg hibás adat) kimarad
//  -> { pool, kihagyva: { sajat, ikrek, kilogo, duplikalt } }
function tisztitPool(rows, kihagy, ctx) {

    const lista = rows.map(r => elokeszit(r, ctx)).filter(i => i.arNm > 0);
    const info = { sajat: 0, ikrek: 0, kilogo: 0, duplikalt: 0 };

    // A becsült hirdetés és az ikrei
    const sajat = kihagy ? lista.find(i => i.id === kihagy) : null;
    const sajatLink = sajat ? tisztaLink(sajat.link) : "";

    const latottLink = new Set();
    const latottIker = new Set();
    const pool = [];

    for (const i of lista) {

        if (kihagy && i.id === kihagy) { info.sajat++; continue; }

        const link = tisztaLink(i.link);
        if (sajat && ((sajatLink && link === sajatLink) || ikrek(i, sajat))) { info.ikrek++; continue; }

        if (link) {
            if (latottLink.has(link)) { info.duplikalt++; continue; }
            latottLink.add(link);
        }

        const ik = ikerKulcs(i);
        if (latottIker.has(ik)) { info.duplikalt++; continue; }
        latottIker.add(ik);

        pool.push(i);

    }

    // A nagyon kilógó €/m² (szegmensenként: új / meglévő): robusztus z > 3,5
    const tiszta = [];
    for (const uj of [false, true]) {
        const resz = pool.filter(i => i._uj === uj);
        if (resz.length < 10) { tiszta.push(...resz); continue; }
        const l = resz.map(i => Math.log(i.arNm));
        const m = median(l);
        const mad = median(l.map(v => Math.abs(v - m))) * 1.4826 || 0.1;
        resz.forEach((i, n) => {
            if (Math.abs(l[n] - m) / mad > 3.5) info.kilogo++;
            else tiszta.push(i);
        });
    }

    return { pool: tiszta, kihagyva: info };

}

// ============================================================
//  Árarány-modell (súlyozott, robusztus, előzetes arányok felé húzott
//  log-lineáris regresszió):  log(€/m²) = alap + Σ tényező
// ============================================================

// A méret "törései" típusonként (alatta / fölötte meredekebb a €/m² változása)
const MERET_TORES = {
    lakas: [38, 85], kereskedelmi: [30, 160], iroda: [30, 160], haz: [80, 220], telek: [400, 3000]
};

// Józan piaci arányok (ha kevés az adat, ezek felé húzunk)
const ELOZETES = {
    meret: { elado: -0.15, kiado: -0.4 },
    meretTipus: { haz: -0.25, telek: -0.35 },
    kicsi: 0.2,
    foldszint: 0.95,
    legfelso: 0.96,
    magasHaz: 0.93,
    ujabbEpulet: 1.04,
    ujEpitesu: 1.1,
    kulterulet: 0.45,
    falu: 0.8
};

// Mennyire ragaszkodunk az előzetes arányhoz – nagyjából "ennyi hirdetésnyi"
// bizonyíték kell, hogy elmozduljon tőle
const ERO = { meret: 15, kicsi: 6, nagy: 8, szoba: 8, allapot: 4, emelet: 6, ev: 6, uj: 3, hely: 3, ujhely: 4, jelleg: 4, telek: 15 };

// A jellemzők (oszlopok). fn: a hirdetés értéke, null = ismeretlen (a modell a
// tipikus értéket veszi helyette)
function jellemzok(pool, ctx) {

    const { tipus, ugylet } = ctx;
    const cols = [];
    const add = (nev, csoport, fn, elozetes, ero) => cols.push({ nev, csoport, fn, elozetes: elozetes || 0, ero });
    const [kicsiT, nagyT] = MERET_TORES[tipus] || MERET_TORES.lakas;
    const kozep = Math.sqrt(kicsiT * nagyT);

    // Méret (log), a kicsi és a nagy ingatlanoknál külön meredekséggel
    add("meret", "meret", i => Math.log(i.nm / kozep), ELOZETES.meretTipus[tipus] ?? (ELOZETES.meret[ugylet] ?? -0.15), ERO.meret);
    add("kicsi", "meret", i => Math.max(0, Math.log(kicsiT / i.nm)), ELOZETES.kicsi, ERO.kicsi);
    add("nagy", "meret", i => Math.max(0, Math.log(i.nm / nagyT)), 0, ERO.nagy);

    // Szobaszám a mérethez képest (sok kis szoba vs. kevés nagy)
    if (["lakas", "haz", "iroda"].includes(tipus)) {
        add("szoba_suruseg", "szoba", i => i.szobak > 0 ? Math.log((i.szobak * 25) / i.nm) : null, 0, ERO.szoba);
    }

    // Állapot ("jó" a viszonyítás; az admin által megadott kiinduló arányokkal)
    if (tipus !== "telek") {
        allapotok.osszes().filter(a => a.kulcs !== "jó").forEach(a => {
            add("allapot_" + a.kulcs, "allapot", i => i._allapot === null ? null : (i._allapot === a.kulcs ? 1 : 0),
                Math.log(a.szorzo > 0 ? a.szorzo : 1), ERO.allapot);
        });
    }

    // Emelet (lakás, üzlet, iroda)
    if (["lakas", "kereskedelmi", "iroda"].includes(tipus)) {
        add("foldszint", "emelet", i => i._emelet === null ? null : (i._emelet === 0 ? 1 : 0), Math.log(ELOZETES.foldszint), ERO.emelet);
        add("legfelso", "emelet", i => i._emelet === null ? null : (i._legfelso ? 1 : 0), Math.log(ELOZETES.legfelso), ERO.emelet);
    }

    // A magas (8+ emeletes) tömbház lakásai olcsóbbak (régi, sok lakásos panelház)
    if (["lakas", "iroda"].includes(tipus) && T.magasHaz) {
        add("magas_haz", "emelet", i => i._ossz === null ? null : (i._ossz >= 8 ? 1 : 0), Math.log(ELOZETES.magasHaz), ERO.emelet);
    }

    if (tipus !== "telek") {
        // Az 1990 után épült (de nem új) épület enyhén drágább a panelnél
        add("ev_ujabb", "ev", i => i._ev === null ? null : (i._ev >= 1990 && !i._uj ? 1 : 0), Math.log(ELOZETES.ujabbEpulet), ERO.ev);
        // Újépítésű: külön piac
        add("uj", "uj", i => i._uj ? 1 : 0, Math.log(ELOZETES.ujEpitesu), ERO.uj);
    }

    // Hely: kerület (vagy háznál, teleknél, a környék-városban a település).
    // Az árszinttel megadott, de még hirdetés nélküli kerület is kap oszlopot
    // (így rá is vonatkozik a kerületek sorrendje).
    const helyek = [...new Set([...pool.map(i => i._hely), ...(ctx.szintek ? ctx.szintek.keys() : [])].filter(Boolean))];
    const helyElozetes = ctx.telepulesSzerint && !ctx.kornyekVaros ? Math.log(ELOZETES.falu) : 0;
    helyek.forEach(h => add("hely:" + h, "kerulet", i => i._hely === null ? null : (i._hely === h ? 1 : 0), helyElozetes, ERO.hely));

    // Az újépítésűek felára kerületenként más (egy olcsó negyedben is lehet drága új projekt)
    if (tipus !== "telek") {
        helyek.forEach(h => add("ujhely:" + h, "uj", i => i._hely === null ? null : (i._uj && i._hely === h ? 1 : 0), 0, ERO.ujhely));
    }

    // Telek: külterület olcsóbb
    if (tipus === "telek") {
        add("kulterulet", "jelleg", i => !i.telek_jelleg ? null : (i.telek_jelleg === "kulterulet" ? 1 : 0), Math.log(ELOZETES.kulterulet), ERO.jelleg);
    }

    // Ház: a telek mérete a házhoz képest
    if (tipus === "haz") {
        add("telek_arany", "telek", i => i.telek_nm > 0 ? Math.log(Math.min(Math.max(i.telek_nm / i.nm, 0.5), 30) / 4) : null, 0.05, ERO.telek);
    }

    return cols;

}

// Lineáris egyenletrendszer (Gauss-elimináció részleges főelem-kiválasztással)
function megold(A, b) {
    const n = b.length;
    const M = A.map((sor, i) => [...sor, b[i]]);
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        if (Math.abs(M[p][c]) < 1e-12) continue;
        [M[c], M[p]] = [M[p], M[c]];
        for (let r = 0; r < n; r++) {
            if (r === c) continue;
            const f = M[r][c] / M[c][c];
            if (!f) continue;
            for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
        }
    }
    return M.map((sor, i) => Math.abs(sor[i]) < 1e-12 ? 0 : sor[n] / sor[i]);
}

// A hirdetés jellemző-vektora (ismeretlen értéknél a piaci átlag)
function vektor(m, i) {
    return m.cols.map((c, k) => {
        const v = c.fn(i);
        return v === null || v === undefined || isNaN(v) ? m.atlagok[k] : v;
    });
}

const pontszor = (beta, x) => x.reduce((s, v, k) => s + v * beta[k + 1], 0);

// A modell illesztése -> { beta, cols, sigma, n, atlagok, maradek } vagy null
function modellIllesztes(pool, ctx) {

    if (pool.length < 5) return null;

    const cols = jellemzok(pool, ctx);
    const p = cols.length + 1;

    // Az ismert értékek átlaga (ismeretlennél ezt vesszük)
    const atlagok = cols.map(c => {
        const v = pool.map(c.fn).filter(x => x !== null && x !== undefined && !isNaN(x));
        return v.length ? atlag(v) : 0;
    });

    const m0 = { cols, atlagok };
    const X = pool.map(i => [1, ...vektor(m0, i)]);
    const y = pool.map(i => Math.log(i.arNm));

    const prior = [median(y), ...cols.map(c => c.elozetes)];
    const ero = [1e-6, ...cols.map(c => c.ero)];

    let w = pool.map(() => 1);
    let beta = prior.slice();

    // Robusztus illesztés (Huber): a nagyon kilógó hirdetések kisebb súlyt kapnak
    for (let kor = 0; kor < 4; kor++) {

        const A = Array.from({ length: p }, () => new Array(p).fill(0));
        const b = new Array(p).fill(0);

        for (let n = 0; n < X.length; n++) {
            const xn = X[n], wn = w[n];
            for (let r = 0; r < p; r++) {
                if (!xn[r]) continue;
                b[r] += wn * xn[r] * y[n];
                for (let c = 0; c < p; c++) if (xn[c]) A[r][c] += wn * xn[r] * xn[c];
            }
        }

        for (let r = 0; r < p; r++) {
            A[r][r] += ero[r];
            b[r] += ero[r] * prior[r];
        }

        beta = megold(A, b);

        const maradek = X.map((xn, n) => y[n] - xn.reduce((s, v, k) => s + v * beta[k], 0));
        const mad = median(maradek.map(Math.abs)) * 1.4826 || 0.1;
        const c = 1.345 * mad;
        w = maradek.map(r => Math.abs(r) <= c ? 1 : c / Math.abs(r));

    }

    // Kötött sorrendek. Ha az illesztés szerint sérülnének, a sorrendet megtartó
    // legközelebbi arányokat vesszük, és a többi tényezőt ezekhez igazítva újraszámoljuk:
    //  - jobb állapot nem lehet olcsóbb (a címkék zajosak – pl. a forrásoldal
    //    "újszerű"-nek ír egy régi, felújított lakást)
    //  - az admin által megadott árszint szerint drágább kerület nem lehet olcsóbb
    const allapotK = T.monotonModell ? allapotSorrend(cols, beta, X, w) : null;
    const keruletK = keruletSorrend(cols, beta, X, w, ctx.szintek);
    let kotott = null;
    if (allapotK || keruletK) {
        // A nem igazított csoport is a mostani értékén marad (az újraszámolás ne
        // vigye rossz sorrendbe)
        kotott = new Map();
        const rogzit = (map, kell) => {
            if (map) map.forEach((v, r) => kotott.set(r, v));
            else cols.forEach((c, k) => { if (kell(c)) kotott.set(k + 1, beta[k + 1]); });
        };
        if (T.monotonModell) rogzit(allapotK, c => c.csoport === "allapot");
        if (ctx.szintek) rogzit(keruletK, c => c.nev.startsWith("hely:") && ctx.szintek.has(c.nev.slice(5)));
    }
    if (kotott) {
        const A = Array.from({ length: p }, () => new Array(p).fill(0));
        const b = new Array(p).fill(0);
        for (let n = 0; n < X.length; n++) {
            const xn = X[n], wn = w[n];
            for (let r = 0; r < p; r++) {
                if (!xn[r]) continue;
                b[r] += wn * xn[r] * y[n];
                for (let c = 0; c < p; c++) if (xn[c]) A[r][c] += wn * xn[r] * xn[c];
            }
        }
        for (let r = 0; r < p; r++) {
            const fix = kotott.has(r);
            const e = fix ? 1e8 : ero[r];
            A[r][r] += e;
            b[r] += e * (fix ? kotott.get(r) : prior[r]);
        }
        beta = megold(A, b);
        kotott.forEach((v, r) => { beta[r] = v; });
    }

    const maradek = X.map((xn, n) => y[n] - xn.reduce((s, v, k) => s + v * beta[k], 0));
    const sigma = Math.max(0.05, median(maradek.map(Math.abs)) * 1.4826);

    return { beta, cols, sigma, n: pool.length, atlagok, ctx, keruletIgazitva: !!keruletK };

}

//  A kerületek árszintje (az admin adja meg: 1 = legdrágább ... 5 = legolcsóbb): a jobb
//  szintű kerület aránya nem lehet kisebb egy rosszabb szintűénél. Ha az adatok szerint
//  mégis az lenne, a kettőt (a hirdetéseik számával súlyozva) egyformának vesszük – ahogy
//  az állapotoknál. Az azonos szintű és a szint nélküli kerületek között az adatok döntenek.
//  -> Map(oszlop indexe a béta-ban -> új érték), vagy null, ha nem kellett igazítani
function keruletSorrend(cols, beta, X, w, szintek) {

    if (!szintek || !szintek.size) return null;

    const elemek = [];
    cols.forEach((c, k) => {
        if (!c.nev.startsWith("hely:")) return;
        const szint = szintek.get(c.nev.slice(5));
        if (!szint) return;
        let db0 = 0;
        for (let n = 0; n < X.length; n++) if (X[n][k + 1] === 1) db0 += w[n];
        elemek.push({ r: k + 1, szint, v: beta[k + 1], s: db0 + c.ero });
    });

    if (elemek.length < 2) return null;

    // A rossz sorrendű csoportok összevonása (mindig a legnagyobb sértéssel kezdve),
    // amíg van olyan pár, ahol a jobb szintű kerület aránya kisebb
    let blokkok = elemek.map(e => ({ tagok: [e], v: e.v, s: e.s, legjobb: e.szint, legrosszabb: e.szint }));
    for (;;) {
        let max = 1e-9, par = null;
        for (const a of blokkok) {
            for (const b of blokkok) {
                if (a !== b && a.legjobb < b.legrosszabb && b.v - a.v > max) { max = b.v - a.v; par = [a, b]; }
            }
        }
        if (!par) break;
        const [a, b] = par;
        const s = a.s + b.s;
        blokkok = blokkok.filter(x => x !== a && x !== b);
        blokkok.push({
            tagok: [...a.tagok, ...b.tagok], v: (a.v * a.s + b.v * b.s) / s, s,
            legjobb: Math.min(a.legjobb, b.legjobb), legrosszabb: Math.max(a.legrosszabb, b.legrosszabb)
        });
    }

    let valtozott = false;
    const ki = new Map();
    blokkok.forEach(b => b.tagok.forEach(t => {
        if (Math.abs(t.v - b.v) > 1e-9) valtozott = true;
        ki.set(t.r, b.v);
    }));
    return valtozott ? ki : null;

}

//  Az állapot-arányok sorrendje (súlyozott izotonikus regresszió, a "jó" = 1 rögzítve).
//  -> Map(oszlop indexe a béta-ban -> új érték), vagy null, ha nem kellett igazítani
function allapotSorrend(cols, beta, X, w) {

    const rend = allapotok.osszes()
        .filter(a => a.szint !== null && a.szint !== undefined)
        .sort((a, b) => a.szint - b.szint || (a.szorzo || 1) - (b.szorzo || 1));

    const elemek = [];
    for (const a of rend) {
        if (a.kulcs === "jó") { elemek.push({ jo: true, v: 0, s: 1e9 }); continue; }
        const k = cols.findIndex(c => c.nev === "allapot_" + a.kulcs);
        if (k < 0) continue;
        // súly: a hirdetések száma ezzel az állapottal + az előzetes ereje
        let db0 = 0;
        for (let n = 0; n < X.length; n++) if (X[n][k + 1] === 1) db0 += w[n];
        elemek.push({ r: k + 1, v: beta[k + 1], s: db0 + cols[k].ero });
    }

    // Pool-adjacent-violators: az egymás után következő, rossz sorrendű csoportok összevonása
    const blokk = [];
    for (const e of elemek) {
        blokk.push({ v: e.v, s: e.s, tagok: [e] });
        while (blokk.length > 1 && blokk[blokk.length - 2].v > blokk[blokk.length - 1].v + 1e-9) {
            const b2 = blokk.pop(), b1 = blokk.pop();
            const s = b1.s + b2.s;
            blokk.push({ v: (b1.v * b1.s + b2.v * b2.s) / s, s, tagok: [...b1.tagok, ...b2.tagok] });
        }
    }

    // Ha bármi változott, az összes állapot-arányt rögzítjük (a többi tényező újraszámolásakor
    // a nem változottak se mozduljanak el rossz sorrendbe)
    let valtozott = false;
    const ki = new Map();
    for (const b of blokk) {
        for (const t of b.tagok) {
            if (t.jo) continue;
            if (Math.abs(t.v - b.v) > 1e-9) valtozott = true;
            ki.set(t.r, b.v);
        }
    }
    return valtozott ? ki : null;

}

// A jellemzők hatása csoportonként (méret, állapot, kerület...)
function csoportok(m, x) {
    const g = {};
    m.cols.forEach((c, k) => { g[c.csoport] = (g[c.csoport] || 0) + m.beta[k + 1] * x[k]; });
    return g;
}

// A becslés arányai a város tipikus hirdetéséhez képest -> [{ csoport, szorzo }]
function tenyezok(m, xCel) {
    const atl = csoportok(m, m.atlagok);
    const cel = csoportok(m, xCel);
    return Object.keys(cel)
        .map(cs => ({ csoport: cs, szorzo: Math.round(Math.exp(cel[cs] - (atl[cs] || 0)) * 1000) / 1000 }))
        .filter(t => Math.abs(t.szorzo - 1) >= 0.005);
}

// ============================================================
//  Az összehasonlító rész
// ============================================================

// A hangolható értékek (a /api/admin/ertekbecslo-teszt ezekkel mér; a valós
// adatokon, minden hirdetést a többiből becsülve mérve):
//  atszamitas: mennyit veszünk át a modell szerinti különbségből, amikor egy
//    hasonló hirdetés árát a keresett ingatlanra számoljuk át (1 = teljesen –
//    a részleges átszámítás miatt egy kerület néhány véletlenül drága
//    hirdetése elhúzta a becslést, és kijöhetett drágábbnak a Központnál)
//  modellSuly: ennyi nagyon hasonló hirdetéssel ér fel a modell (újépítésűnél kevesebb)
//  h: a hasonlóság "sugara" (a távolság mértékében)
//  ujTav: mennyivel "távolabbi" egy új építésű lakás egy meglévőtől
//  magasHaz: a 8+ emeletes tömbház külön tényező
//  keruletTav: mennyivel kevésbé hasonló egy másik kerületbeli hirdetés.
//    Meglévő lakásnál 0: a kerületet a modell szorzója már tartalmazza, és így
//    ugyanaz a lakás két kerületben pontosan a két szorzó arányában különbözik.
//    Újépítésűnél számít (ott a projekt, a konkrét épület az ár nagy része).
//  telepulesTav: ugyanez a településekre (háznál, teleknél, a környék-városban) –
//    ott egy faluból kevés a hirdetés, a helyi hasonlók többet mondanak
//  keruletTavKijelzes: csak a táblázat sorrendjéhez (az azonos kerületbeliek elöl)
//  allapotTav: meglévő lakásnál 0 (az állapot különbségét a modell átszámolja);
//    újépítésűnél számít
//  ismeretlenAllapotTav: az ismeretlen állapotú hirdetés kevésbé hasonló
//  monoton: a végső becslések utólagos állapot-sorrendje (kikapcsolva: kis
//    adatnál torzított; a sorrendet a modell állapot-arányai biztosítják)
//  monotonModell: a modell állapot-arányai kötött sorrendben
const T = {
    atszamitas: 1,
    atszamitasCsoport: { kerulet: 1, uj: 1 },
    modellSuly: 2,
    modellSulyUj: 1,
    h: 0.5,
    ujTav: 1,
    magasHaz: true,
    keruletTav: 0,
    keruletTavUj: 0.6,
    telepulesTav: 0.6,
    keruletTavKijelzes: 0.6,
    allapotTav: 0,
    allapotTavUj: 0.6,
    ismeretlenAllapotTav: 0.5,
    monoton: false,
    monotonModell: true
};

const PONTOS_HELY = ["pontos", "utca"];

// A más kerületbeli (településbeli) hirdetés ennyivel "távolabbi"
const helyTav = (cel, ctx) => ctx.telepulesSzerint ? T.telepulesTav : (cel._uj ? T.keruletTavUj : T.keruletTav);

// Két ingatlan "távolsága": minél kisebb, annál hasonlóbb (folytonos: egy kis
// méretváltozás csak kicsit változtat rajta)
function tavolsag(cel, i, ctx) {

    let d = Math.abs(Math.log(cel.nm / i.nm)) * 2.2;

    if (cel.szobak) d += (i.szobak > 0 ? Math.abs(cel.szobak - i.szobak) : 1.5) * 0.5;

    if (cel._hely) d += i._hely === cel._hely ? 0 : helyTav(cel, ctx);

    // Az ismeretlen állapotú hirdetés kevésbé hasonló (a modell ott csak átlagot tud venni)
    const allapotTav = cel._uj ? T.allapotTavUj : T.allapotTav;
    if (cel._szint !== null && cel._szint !== undefined) d += i._szint === null ? T.ismeretlenAllapotTav : Math.abs(cel._szint - i._szint) * allapotTav;

    if (cel._emelet !== null && cel._emelet !== undefined) d += i._emelet === null ? 0.2 : Math.min(Math.abs(cel._emelet - i._emelet), 3) * 0.1;

    // Új építésű és meglévő lakás nem igazán hasonló egymáshoz
    if (!!cel._uj !== !!i._uj) d += T.ujTav;

    if (ctx.tipus === "telek" && cel.telek_jelleg && i.telek_jelleg && cel.telek_jelleg !== i.telek_jelleg) d += 0.8;

    if (ctx.tipus === "haz" && cel.telek_nm > 0 && i.telek_nm > 0) d += Math.min(Math.abs(Math.log(cel.telek_nm / i.telek_nm)), 2) * 0.4;

    // Ha mindkettőnek pontos helye van: a közelebbi hasonlóbb
    if (cel._pontos && i._pontos) {
        const km = Math.hypot((cel.x - i.x) * 111.32 * Math.cos(cel.y * Math.PI / 180), (cel.y - i.y) * 110.57);
        d += Math.min(km, 2) * 0.5;
    }

    return d;

}

// Folytonos súly (sosem pontosan nulla, a távoli hirdetések elhanyagolhatók)
const suly = (d, h = T.h) => 1 / Math.pow(1 + Math.pow(d / h, 2), 2);

// A keresett ingatlan adatai
function celAdat(params, ctx) {
    const e = szam(params.emelet);
    const ossz = szam(params.emeletOssz);
    const x = szam(params.x), y = szam(params.y);
    const evszam = szam(params.evszam);
    const allapot = params.allapot || null;
    const c = elokeszit({
        ar: 1, nm: szam(params.nm),
        szobak: szam(params.szobak) || null,
        kerulet: String(params.kerulet || "").trim() || null,
        telepules: params.telepules !== undefined && params.telepules !== null ? String(params.telepules || "").trim() || null : null,
        allapot,
        emelet: e !== null ? `${e}${ossz ? "/" + ossz : ""}` : null,
        evszam: evszam && evszam > 1800 ? evszam : null,
        telek_nm: szam(params.telek_nm) || null,
        telek_jelleg: params.jelleg || null,
        cim: "",
        _uj: params.uj !== undefined && params.uj !== null && params.uj !== "" ? ["1", "true", "igen", true, 1].includes(params.uj) : undefined
    }, ctx);
    c.x = x; c.y = y;
    c._pontos = !!(x && y && PONTOS_HELY.includes(params.hely_pontossag || ""));
    return c;
}

// Az egy ponton álló sok hirdetés (pl. egy iroda címe) helye nem igazi hely
function pontosHelyek(pool) {
    const db0 = new Map();
    pool.forEach(i => {
        if (!(i.x && i.y)) return;
        const k = Number(i.x).toFixed(4) + "," + Number(i.y).toFixed(4);
        db0.set(k, (db0.get(k) || 0) + 1);
    });
    pool.forEach(i => {
        const k = i.x && i.y ? Number(i.x).toFixed(4) + "," + Number(i.y).toFixed(4) : null;
        i._pontos = !!(k && PONTOS_HELY.includes(i.hely_pontossag || "pontos") && !["kerulet", "telepules"].includes(i.hely_forras) && db0.get(k) < 3);
        if (i._pontos) { i.x = Number(i.x); i.y = Number(i.y); }
    });
}

// A hirdetések modell szerinti tényezői (egyszer számoljuk, minden becslés ezt használja)
function modellTenyezok(pool, m) {
    return m ? pool.map(i => csoportok(m, vektor(m, i))) : null;
}

// A becsült log(€/m²) egy keresett ingatlanra – a két módszer és a keverésük
function becslesLog(cel, pool, elo, m, ctx, opts = {}) {

    const nm = cel.nm;
    const kitevo = ctx.ugylet === "kiado" ? -0.4 : (ELOZETES.meretTipus[ctx.tipus] ?? -0.15);

    const xCel = m ? vektor(m, cel) : null;
    const gCel = m ? csoportok(m, xCel) : null;
    const modellLog = m ? m.beta[0] + pontszor(m.beta, xCel) : null;
    const csoportNevek = gCel ? Object.keys(gCel) : [];

    // ---- 1) Összehasonlító: minden hirdetés ára a keresett ingatlanra átszámítva
    const jeloltek = pool.map((i, n) => {
        const d = tavolsag(cel, i, ctx);
        const lnr = Math.log(nm / i.nm);
        let adj = Math.log(i.arNm) + kitevo * lnr;
        if (m) {
            const gi = elo[n];
            for (const cs of csoportNevek) {
                const kul = gCel[cs] - (gi[cs] || 0);
                const phi = T.atszamitasCsoport[cs] !== undefined ? T.atszamitasCsoport[cs] : T.atszamitas;
                adj += cs === "meret" ? phi * (kul - kitevo * lnr) : phi * kul;
            }
        }
        return { i, d, w: suly(d), adj };
    });

    const sulyozott = lista => {
        const s = lista.reduce((t, x) => t + x.w, 0);
        return s ? lista.reduce((t, x) => t + x.w * x.adj, 0) / s : 0;
    };

    let hasonloLog = sulyozott(jeloltek);
    let vegso = jeloltek;

    // A kilógó (pl. hibás adatú) hasonlók kisebb súllyal
    for (let kor = 0; kor < 2; kor++) {
        vegso = jeloltek.map(x => {
            const e = (Math.exp(x.adj - hasonloLog) - 1) / 0.25;
            return { ...x, w: x.w / (1 + e * e) };
        });
        hasonloLog = sulyozott(vegso);
    }

    // ---- 2) Keverés a modellel: a közeli hasonlók "száma" vs. a modell ereje
    const kozeliSzam = jeloltek.reduce((s, x) => s + x.w, 0);
    const modellSuly = m ? (opts.modellSuly !== undefined ? opts.modellSuly : (cel._uj ? T.modellSulyUj : T.modellSuly)) : 0;
    const hasonloArany = kozeliSzam / (kozeliSzam + modellSuly);

    const becsultLog = m ? hasonloArany * hasonloLog + (1 - hasonloArany) * modellLog : hasonloLog;

    return { becsultLog, hasonloLog, modellLog, jeloltek, vegso, kozeliSzam, hasonloArany, xCel };

}

// Az állapotok sorrendje (a leggyengébbtől a legjobbig)
function allapotRend() {
    return allapotok.osszes()
        .filter(a => a.aktiv !== false && a.szint !== null && a.szint !== undefined)
        .sort((a, b) => a.szint - b.szint || (a.szorzo || 1) - (b.szorzo || 1))
        .map(a => a.kulcs);
}

// Izotonikus (nem csökkenő) illesztés egyenlő súlyokkal
function izoton(ertekek) {
    const blokk = [];
    for (const v of ertekek) {
        blokk.push({ v, n: 1 });
        while (blokk.length > 1 && blokk[blokk.length - 2].v > blokk[blokk.length - 1].v) {
            const b2 = blokk.pop(), b1 = blokk.pop();
            blokk.push({ v: (b1.v * b1.n + b2.v * b2.n) / (b1.n + b2.n), n: b1.n + b2.n });
        }
    }
    const ki = [];
    blokk.forEach(b => { for (let k = 0; k < b.n; k++) ki.push(b.v); });
    return ki;
}

//  Jobb állapotra ne jöjjön ki kisebb becslés (a hasonlók összetétele az állapottal
//  változik, és egy kerületben pl. a "jó" lakások véletlenül drágábbak lehetnek az
//  "újszerű"-eknél). Ugyanarra az ingatlanra minden állapottal becslünk, a sort
//  nem csökkenővé igazítjuk, és a keresett állapot értékét vesszük.
//  -> a log(€/m²) igazítása (0 = nem kellett)
function allapotIgazitas(params, cel, pool, elo, m, ctx, sajatLog, opts) {
    const rend = allapotRend();
    const j = rend.indexOf(cel._allapot);
    if (j < 0 || rend.length < 2) return 0;
    const uj = cel._uj ? "1" : "0";
    const ertekek = rend.map((k, n) => n === j ? sajatLog
        : becslesLog(celAdat({ ...params, allapot: k, uj }, ctx), pool, elo, m, ctx, opts).becsultLog);
    return izoton(ertekek)[j] - sajatLog;
}

// ============================================================
//  A becslés
// ============================================================

function szamol(pool, params, ctx, opts = {}) {

    const cel = celAdat(params, ctx);
    const nm = cel.nm;

    if (pool.length < 3) return { error: "not_enough_data", count: pool.length };

    const m = opts.modell !== undefined ? opts.modell : modellIllesztes(pool, ctx);
    if (!opts.pontokKeszek) pontosHelyek(pool);
    const elo = opts.elo || modellTenyezok(pool, m);

    const r = becslesLog(cel, pool, elo, m, ctx, opts);

    const monoton = opts.monoton !== undefined ? opts.monoton : T.monoton;
    const igazitas = monoton && cel._allapot ? allapotIgazitas(params, cel, pool, elo, m, ctx, r.becsultLog, opts) : 0;

    const becsultArNm = Math.exp(r.becsultLog + igazitas);

    if (opts.csakSzam) return becsultArNm * nm;

    const { hasonloLog, modellLog, vegso, kozeliSzam, hasonloArany, xCel } = r;

    // ---- Ár-sáv: a hasonlók szórása és a modell bizonytalansága együtt
    const hasonlo = Math.exp(hasonloLog);
    const sulyozottPercentilis = (lista, p) => {
        const rendezett = [...lista].sort((a, b) => a.adj - b.adj);
        const ossz = rendezett.reduce((t, x) => t + x.w, 0);
        if (!ossz) return hasonlo;
        let kum = 0;
        const pontok = rendezett.map(x => { const k = (kum + x.w / 2) / ossz; kum += x.w; return [k, Math.exp(x.adj)]; });
        if (p <= pontok[0][0]) return pontok[0][1];
        for (let j = 1; j < pontok.length; j++) {
            if (p <= pontok[j][0]) {
                const [k0, v0] = pontok[j - 1], [k1, v1] = pontok[j];
                return v0 + (v1 - v0) * (p - k0) / (k1 - k0);
            }
        }
        return pontok[pontok.length - 1][1];
    };

    const hAlso = sulyozottPercentilis(vegso, 0.25) / hasonlo;
    const hFelso = sulyozottPercentilis(vegso, 0.75) / hasonlo;
    const mAlso = m ? Math.exp(-0.674 * m.sigma) : hAlso;
    const mFelso = m ? Math.exp(0.674 * m.sigma) : hFelso;
    const alsoArany = Math.min(hasonloArany * hAlso + (1 - hasonloArany) * mAlso, 0.995);
    const felsoArany = Math.max(hasonloArany * hFelso + (1 - hasonloArany) * mFelso, 1.005);

    // A 12 leghasonlóbb (a táblázatban). A becslésben bármelyik kerület hasonló
    // hirdetése egyformán számít (a kerület árszintjét a modell szorzója adja, az
    // átszámított árban már benne van), a táblázatban viszont az azonos kerületbeliek
    // vannak elöl, és a hasonlóság is ezzel együtt látszik.
    const kerTav = helyTav(cel, ctx);
    const kijTav = x => x.d + (cel._hely && x.i._hely !== cel._hely ? Math.max(0, T.keruletTavKijelzes - kerTav) : 0);
    const hasonlok = vegso
        .map(x => {
            const dk = kijTav(x);
            return { ...x, dk, wk: x.w * suly(dk) / Math.max(suly(x.d), 1e-12) };
        })
        .sort((a, b) => b.wk - a.wk || a.dk - b.dk)
        .slice(0, 12);
    const helyEgyezes = cel._hely ? hasonlok.filter(x => x.i._hely === cel._hely).length : null;

    // Megbízhatóság: sok szinte ugyanilyen hirdetés (ugyanabban a kerületben, ugyanolyan
    // állapotban, hasonló méretben) + nem túl széles sáv; a modell kevés hasonlónál is
    // közepessé teheti, ha elég adatból tanult
    const bizTav = x => x.d
        + (cel._hely && x.i._hely !== cel._hely ? Math.max(0, 1 - kerTav) : 0)
        + (cel._szint !== null && cel._szint !== undefined && x.i._szint !== null
            ? Math.abs(cel._szint - x.i._szint) * Math.max(0, 0.6 - (cel._uj ? T.allapotTavUj : T.allapotTav)) : 0);
    const nagyonHasonlo = r.jeloltek.reduce((s, x) => s + suly(bizTav(x)), 0);
    let megbizhatosag = "low";
    if (kozeliSzam >= 1.5) megbizhatosag = "medium";
    if (nagyonHasonlo >= 4 && felsoArany / alsoArany <= 1.25 && (helyEgyezes === null || helyEgyezes >= 3)) megbizhatosag = "high";
    if (megbizhatosag === "low" && m && m.n >= 25 && m.sigma < 0.22) megbizhatosag = "medium";

    const lepes = x => x < 2000 ? 5 : (x < 20000 ? 50 : 100);
    const kerekit = x => Math.round(x / lepes(x)) * lepes(x);
    const arNmKerek = x => x < 50 ? Math.round(x * 10) / 10 : Math.round(x);

    const becsles = kerekit(becsultArNm * nm);

    // ---- A piaci háttér: mediánok (a keresett ingatlan szegmensében: új vagy meglévő)
    const szegmens = pool.filter(i => i._uj === !!cel._uj);
    const helyben = cel._hely ? pool.filter(i => i._hely === cel._hely) : [];
    const helybenSzegmens = helyben.filter(i => i._uj === !!cel._uj);
    const helybenUj = helyben.filter(i => i._uj);
    const helybenMasik = helyben.filter(i => i._uj !== !!cel._uj);

    const medianArNm = l => l.length ? arNmKerek(median(l.map(i => i.arNm))) : null;

    return {
        version: 3,
        estimate: becsles,
        // A kerekített becslésből (így a felhasználó osztása is ugyanezt adja)
        arNm: arNmKerek(becsles / nm),
        nm,
        low: kerekit(becsultArNm * alsoArany * nm),
        high: kerekit(becsultArNm * felsoArany * nm),
        lowArNm: arNmKerek(becsultArNm * alsoArany),
        highArNm: arNmKerek(becsultArNm * felsoArany),
        confidence: megbizhatosag,
        poolCount: pool.length,
        segment: cel._uj ? "uj" : "meglevo",
        segmentCount: szegmens.length,
        // A korábbi mezőnevek (átlag helyett már medián)
        cityAvgArNm: medianArNm(szegmens.length >= 5 ? szegmens : pool),
        cityMedianArNm: medianArNm(szegmens.length >= 5 ? szegmens : pool),
        districtAvgArNm: medianArNm(helybenSzegmens.length ? helybenSzegmens : helyben),
        districtMedianArNm: medianArNm(helybenSzegmens.length ? helybenSzegmens : helyben),
        districtCount: helybenSzegmens.length || helyben.length,
        districtMatches: helyEgyezes,
        // A kerület másik szegmense (régi lakásnál: az újépítésűek, amiket külön kezeltünk)
        districtOtherCount: helybenMasik.length,
        districtOtherMedianArNm: medianArNm(helybenMasik),
        districtNewCount: helybenUj.length,
        helySzerint: ctx.telepulesSzerint ? "telepules" : "kerulet",
        method: {
            comparableEstimate: kerekit(hasonlo * nm),
            modelEstimate: m ? kerekit(Math.exp(modellLog) * nm) : null,
            comparableWeight: Math.round(hasonloArany * 100),
            modelWeight: m ? Math.round((1 - hasonloArany) * 100) : 0,
            closeCount: Math.round(kozeliSzam * 10) / 10,
            baseArNm: m ? arNmKerek(Math.exp(m.beta[0] + pontszor(m.beta, m.atlagok))) : null,
            // Az állapot-sorrend miatti igazítás %-ban (0 = nem kellett)
            conditionAdjustment: Math.round((Math.exp(igazitas) - 1) * 1000) / 10,
            // A kerület admin által megadott árszintje (1 = legdrágább), ha van
            districtTier: ctx.szintek && cel._hely ? ctx.szintek.get(cel._hely) || null : null,
            factors: m ? tenyezok(m, xCel) : []
        },
        comparables: hasonlok.map(x => ({
            id: x.i.id,
            link: x.i.link,
            ar: x.i.ar,
            nm: x.i.nm,
            arNm: arNmKerek(x.i.arNm),
            szobak: x.i.szobak,
            emelet: x.i.emelet,
            allapot: x.i.allapot,
            kerulet: x.i.kerulet,
            telepules: x.i.telepules,
            eladva: x.i.eladva,
            uj: !!x.i._uj,
            adjusted: kerekit(Math.exp(x.adj) * nm),
            similarity: Math.round(100 * suly(x.dk, 0.9))
        }))
    };

}

// ============================================================
//  A legelső módszer (csak az összevetéshez, a tesztben)
// ============================================================

function szamolRegi(pool, params) {

    const nm = szam(params.nm);
    if (pool.length < 3) return null;

    const rang = a => allapotok.rang(a);
    const cel = { nm, szobak: szam(params.szobak), kerulet: params.kerulet || null, r: params.allapot ? rang(params.allapot) : null, e: szam(params.emelet) };

    const tav = i => {
        let d = Math.abs(cel.nm - i.nm) / cel.nm * 2;
        if (cel.szobak) d += Math.abs(cel.szobak - (i.szobak || 0)) * 0.5;
        if (cel.kerulet) d += (i.kerulet || "") === cel.kerulet ? 0 : 1;
        if (cel.r !== null) { const r = rang(i.allapot); d += r === null ? 0.5 : Math.abs(cel.r - r) * 0.6; }
        if (cel.e !== null) { const e = emeletSzam(i.emelet); d += e === null ? 0.2 : Math.min(Math.abs(cel.e - e), 3) * 0.1; }
        return d;
    };

    const rendezett = pool.map(i => ({ ...i, d: tav(i) })).sort((a, b) => a.d - b.d);
    const K = 16;
    const hatar = rendezett[Math.min(K, rendezett.length) - 1].d + 0.25;
    const kitevo = (params.ugylet || "elado") === "kiado" ? 0.6 : 0.85;

    const jeloltek = rendezett.filter(i => i.d < hatar).map(i => ({
        ...i,
        igazitott: i.ar * Math.pow(nm / i.nm, kitevo),
        w: (1 / (1 + Math.pow(i.d / 0.4, 2))) * (1 - i.d / hatar)
    }));

    const sa = lista => {
        const s = lista.reduce((t, i) => t + i.w, 0);
        return s ? lista.reduce((t, i) => t + i.w * i.igazitott, 0) / s : 0;
    };

    let becsult = sa(jeloltek);
    for (let kor = 0; kor < 2; kor++) {
        const ujra = jeloltek.map(i => {
            const e = (i.igazitott / becsult - 1) / 0.25;
            return { ...i, w: i.w / (1 + e * e) };
        });
        becsult = sa(ujra);
    }

    return becsult;

}

// ============================================================
//  Nyilvános függvények
// ============================================================

async function becsles(params) {

    await allapotok.kesz();

    const varos = String(params.varos || "").trim();
    const nm = szam(params.nm);

    if (!varos || !(nm > 0)) {
        return { error: "missing_params" };
    }

    const ctx = await kornyezet(varos, params.tipus, params.ugylet);
    const rows = await adatok(varos, ctx.tipus, ctx.ugylet);
    const kihagy = Number(params.exclude) || null;
    const { pool, kihagyva } = tisztitPool(rows, kihagy, ctx);

    // Egy konkrét hirdetés becslése: ha nincs megadva, új építésű-e, a hirdetés
    // címéből is kiderülhet ("Apartament nou", "proiect rezidențial"...)
    if (kihagy && (params.uj === undefined || params.uj === "")) {
        const sajat = rows.find(r => r.id === kihagy);
        if (sajat) {
            const mostani = { ...sajat, allapot: params.allapot || sajat.allapot, evszam: szam(params.evszam) || sajat.evszam };
            params = { ...params, uj: ujEpitesu(mostani) ? "1" : "0" };
        }
    }

    if (pool.length < 3) {
        return { error: "not_enough_data", count: pool.length };
    }

    const e = szamol(pool, { ...params, nm }, ctx);
    if (e.error) return e;

    return { ...e, excluded: kihagy ? { id: kihagy, sajat: kihagyva.sajat > 0, ikrek: kihagyva.ikrek } : null, cleaned: kihagyva };

}

//  Pontosság-mérés a valós adatokon: minden hirdetést a többi alapján becslünk
//  meg (a saját maga és az ikrei kimaradnak), és összevetjük a hirdetési árral.
//  -> hiba-mutatók az első, az előző (2.) és az új (3.) módszerre, csoportonként,
//     és a "stabilitás": mennyit változik a becsült €/m², ha az alapterület 1 m²-rel nő
async function teszt(varos, tipus = "lakas", ugylet = "elado") {

    await allapotok.kesz();

    const V2 = require("./valuationV2");
    const ctx = await kornyezet(varos, tipus, ugylet);
    const rows = await adatok(varos, ctx.tipus, ctx.ugylet);
    const { pool: osszes } = tisztitPool(rows, null, ctx);

    if (osszes.length < 8) return { error: "not_enough_data", count: osszes.length };

    pontosHelyek(osszes);

    const hibak = { regi: [], elozo: [], uj: [] };
    const csop = {};
    const stab = { elozo: [], uj: [] };
    const csopAdd = (nev, kulcs, e) => { if (!csop[nev]) csop[nev] = { regi: [], elozo: [], uj: [] }; csop[nev][kulcs].push(e); };

    for (const i of osszes) {

        const pool = osszes.filter(x => x.id !== i.id && !ikrek(x, i) && tisztaLink(x.link) !== tisztaLink(i.link));
        if (pool.length < 5) continue;

        const params = {
            tipus: ctx.tipus, ugylet: ctx.ugylet, nm: i.nm, szobak: i.szobak, kerulet: i.kerulet, allapot: i.allapot,
            emelet: emeletSzam(i.emelet), emeletOssz: emeletOssz(i.emelet), telepules: i.telepules || "",
            telek_nm: i.telek_nm, jelleg: i.telek_jelleg, evszam: i.evszam, uj: i._uj ? "1" : "0",
            x: i._pontos ? i.x : null, y: i._pontos ? i.y : null, hely_pontossag: i._pontos ? i.hely_pontossag : null
        };

        const e = x => Math.abs(x / i.ar - 1) * 100;

        const regi = szamolRegi(pool, params);
        if (!regi) continue;

        // Az előző módszer (2.) – a saját adatformájával
        const pool2 = V2.tisztitPool(pool.map(x => ({ ...x })), null);
        const m2 = V2.modellIllesztes(pool2, ctx.tipus, ctx.ugylet);
        const elozo = V2.szamol(pool2, params, { modell: m2, csakSzam: true });

        const m3 = modellIllesztes(pool, ctx);
        const elo3 = modellTenyezok(pool, m3);
        const uj = szamol(pool, params, ctx, { modell: m3, elo: elo3, csakSzam: true, pontokKeszek: true });

        hibak.regi.push(e(regi));
        hibak.elozo.push(e(elozo));
        hibak.uj.push(e(uj));

        const hasonloDb = pool.filter(x => x._hely === i._hely && x.szobak === i.szobak).length;
        for (const nev of [hasonloDb < 4 ? "ritka" : "gyakori", i._uj ? "ujepitesu" : "meglevo"]) {
            csopAdd(nev, "regi", e(regi));
            csopAdd(nev, "elozo", e(elozo));
            csopAdd(nev, "uj", e(uj));
        }

        // Stabilitás: +1 m² (a hirdetés saját hiánya mellett, ugyanazzal a modellel)
        const p1 = { ...params, nm: i.nm + 1 };
        const e2b = V2.szamol(pool2, p1, { modell: m2, csakSzam: true });
        const e3b = szamol(pool, p1, ctx, { modell: m3, elo: elo3, csakSzam: true, pontokKeszek: true });
        stab.elozo.push(Math.abs((e2b / (i.nm + 1)) / (elozo / i.nm) - 1) * 100);
        stab.uj.push(Math.abs((e3b / (i.nm + 1)) / (uj / i.nm) - 1) * 100);

    }

    const osszegez = l => ({
        n: l.length,
        medianHiba: Math.round(median(l) * 10) / 10,
        atlagHiba: Math.round(atlag(l) * 10) / 10,
        tizSzazalekonBelul: Math.round(l.filter(x => x <= 10).length / (l.length || 1) * 100)
    });

    const eredmeny = {};
    Object.entries(hibak).forEach(([k, l]) => { eredmeny[k] = osszegez(l); });
    // A régi admin felület kulcsa
    eredmeny["uj_" + T.modellSuly] = eredmeny.uj;

    const csoportokOut = {};
    Object.entries(csop).forEach(([k, v]) => {
        csoportokOut[k] = { regi: osszegez(v.regi), elozo: osszegez(v.elozo), uj: osszegez(v.uj) };
    });

    const stabil = l => ({ atlag: Math.round(atlag(l) * 100) / 100, max: Math.round(Math.max(0, ...l) * 100) / 100 });

    return {
        varos, tipus: ctx.tipus, ugylet: ctx.ugylet, hirdetesek: osszes.length, verzio: 3,
        modellSuly: T.modellSuly, atszamitas: T.atszamitas,
        eredmeny, csoportok: csoportokOut,
        stabilitas: { elozo: stabil(stab.elozo), uj: stabil(stab.uj) }
    };

}

//  A kerületek (háznál, teleknél a települések) szorzója a modell szerint: ugyanaz
//  az ingatlan itt mennyivel drágább / olcsóbb, mint a város tipikus hirdetése.
//  Az admin "Városok, kerületek" oldalán látszik – ebből látszik, mit "gondol"
//  az értékbecslő a kerületekről (és az árszint után mi lett belőle).
async function helySzorzok(varos, tipus = "lakas", ugylet = "elado") {

    await allapotok.kesz();

    const ctx = await kornyezet(varos, tipus, ugylet);
    const rows = await adatok(varos, ctx.tipus, ctx.ugylet);
    const { pool } = tisztitPool(rows, null, ctx);
    const m = modellIllesztes(pool, ctx);

    const alap = { varos, tipus: ctx.tipus, ugylet: ctx.ugylet, helySzerint: ctx.telepulesSzerint ? "telepules" : "kerulet", hirdetesek: pool.length };
    if (!m) return { ...alap, helyek: [] };

    // A hely-csoport értéke a tipikus hirdetésnél (a viszonyítás)
    let atl = 0;
    m.cols.forEach((c, k) => { if (c.csoport === "kerulet") atl += m.beta[k + 1] * m.atlagok[k]; });

    const helyek = m.cols
        .map((c, k) => {
            if (!c.nev.startsWith("hely:")) return null;
            const nev = c.nev.slice(5);
            return {
                nev,
                szorzo: Math.round(Math.exp(m.beta[k + 1] - atl) * 1000) / 1000,
                db: pool.filter(i => i._hely === nev && !i._uj).length,
                dbUj: pool.filter(i => i._hely === nev && i._uj).length,
                szint: ctx.szintek ? ctx.szintek.get(nev) || null : null
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.szorzo - a.szorzo);

    return { ...alap, sorrendIgazitva: !!m.keruletIgazitva, helyek };

}

module.exports = {
    becsles, teszt, ujEpitesu, helySzorzok,
    _belso: { szamol, szamolRegi, modellIllesztes, modellTenyezok, tisztitPool, adatok, kornyezet, celAdat, pontosHelyek, ikrek, tisztaLink, T, ELOZETES, ERO }
};
