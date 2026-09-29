// ============================================================
//  Ártrend és időszak-összevetés – a hirdetésekből számolva
//
//  Honnan jönnek a számok?
//   - Minden hirdetésnél tudjuk, mikor került fel (created_at) és mikor
//     került le a piacról (piacrol_le), valamint az ár minden változását
//     (ar_elozmenyek – adatbázis-trigger naplózza).
//   - Egy hónapban (negyedévben) azok a hirdetések számítanak, amelyek abban
//     az időszakban fent voltak, és azon az áron, ami az időszak végén élt.
//   - Így bármelyik két hónap összevethető (pl. április és augusztus),
//     kézi mentés nélkül is.
//
//  Mutatók:
//   - medián €/m² (a kilógó hirdetések nem húzzák el), átlag €/m², medián ár
//   - összetétel-korrigált €/m²: ha egy hónapban több a kis lakás, az nem
//     látszik áremelkedésnek (szobaszám szerinti súlyozás a teljes időszakra)
//   - azonos hirdetések árváltozása: csak a mindkét időszakban fent lévő
//     hirdetések saját áremelése / -csökkentése (a „tiszta” árváltozás)
// ============================================================

const db = require("../db/database");

// ---------- Segédek ----------

function median(list) {
    if (!list.length) return null;
    const s = [...list].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function kvantilis(list, p) {
    if (!list.length) return null;
    const s = [...list].sort((a, b) => a - b);
    const pos = (s.length - 1) * p;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function atlag(list) {
    return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

// Átlag a szélső 5-5% nélkül (10 hirdetéstől) – egy elírt ár ne rontsa el
function vagottAtlag(list) {
    if (list.length < 10) return atlag(list);
    const s = [...list].sort((a, b) => a - b);
    const k = Math.floor(s.length * 0.05);
    return atlag(s.slice(k, s.length - k));
}

function normAllapot(a) {
    const v = String(a || "").toLowerCase().replace(/\*/g, "").trim();
    if (!v) return "";
    if (v === "új" || v === "uj" || v.startsWith("újsz") || v.startsWith("ujsz")) return "újszerű";
    if (v.startsWith("részben") || v.startsWith("reszben")) return "részbenfel";
    if (v.startsWith("felúj") || v.startsWith("feluj")) return "felújítandó";
    if (v.startsWith("közep") || v.startsWith("kozep") || v === "átlagos" || v === "lakható") return "közepes";
    if (v === "jó" || v === "jo") return "jó";
    if (v.startsWith("lux")) return "luxus";
    return v;
}

function emeletSzam(e) {
    const n = parseInt(String(e || "").split("/")[0], 10);
    return isNaN(n) ? null : n;
}

// Csoport-kulcsok a bontásokhoz (a kliens fordítja le a címkéket)
const BONTAS = {
    szobak: i => { const n = Number(i.szobak) || 0; return n <= 0 ? "?" : String(Math.min(n, 4)); },
    allapot: i => normAllapot(i.allapot) || "?",
    kerulet: i => (i.kerulet || "").trim() || "?",
    emelet: i => { const n = emeletSzam(i.emelet); return n === null ? "?" : String(Math.min(Math.max(n, 0), 4)); },
    telepules: i => i.telepules || "_varos"
};

// ---------- Időszakok ----------

function honapKezdet(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

// "2026-04" -> Date (UTC hónap eleje); hibás -> null
function honapbol(s) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(s || ""));
    if (!m) return null;
    const ev = Number(m[1]), ho = Number(m[2]);
    if (ho < 1 || ho > 12 || ev < 2000 || ev > 2100) return null;
    return new Date(Date.UTC(ev, ho - 1, 1));
}

function honapKulcs(d) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function kovetkezo(d, lepes) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + lepes, 1));
}

// Időszakok listája: [{ kulcs, kezd, veg }] – havi vagy negyedéves
function idoszakok(tol, ig, felbontas) {
    const lepes = felbontas === "negyedev" ? 3 : 1;
    let k = honapKezdet(tol);
    if (lepes === 3) k = new Date(Date.UTC(k.getUTCFullYear(), Math.floor(k.getUTCMonth() / 3) * 3, 1));
    const lista = [];
    while (k <= ig && lista.length < 120) {
        const veg = kovetkezo(k, lepes);
        lista.push({
            kulcs: lepes === 3 ? `${k.getUTCFullYear()}-Q${Math.floor(k.getUTCMonth() / 3) + 1}` : honapKulcs(k),
            kezd: k,
            veg
        });
        k = veg;
    }
    return lista;
}

// ---------- Adatok ----------

// A szűrésnek megfelelő hirdetések a teljes ár-előzményükkel
async function hirdetesek(f) {

    const felt = [
        "i.varos = $1", "i.tipus = $2", "i.ugylet = $3",
        "i.statusz NOT IN ('fuggo', 'tiltott')",
        "COALESCE(i.ellenorzott, true)",
        "COALESCE(i.ar, 0) > 0", "COALESCE(i.nm, 0) > 0"
    ];

    const r = await db.query(`
        SELECT i.id, i.ar, i.nm, i.szobak, i.emelet, i.allapot, i.kerulet, i.telepules, i.telek_jelleg,
               COALESCE(i.created_at, NOW()) AS created_at, i.piacrol_le
        FROM ingatlanok i
        WHERE ${felt.join(" AND ")}
    `, [f.varos, f.tipus || "lakas", f.ugylet || "elado"]);

    let lista = r.rows.filter(i => szuroEgyezik(i, f));

    if (!lista.length) return [];

    const e = await db.query(
        "SELECT ingatlan_id, ar, nm, datum FROM ar_elozmenyek WHERE ingatlan_id = ANY($1::int[]) ORDER BY ingatlan_id, datum",
        [lista.map(i => i.id)]
    ).catch(() => ({ rows: [] }));

    const hist = new Map();
    e.rows.forEach(h => {
        if (!hist.has(h.ingatlan_id)) hist.set(h.ingatlan_id, []);
        hist.get(h.ingatlan_id).push({ ar: Number(h.ar), nm: Number(h.nm) || null, datum: new Date(h.datum) });
    });

    lista.forEach(i => {
        i.created_at = new Date(i.created_at);
        i.piacrol_le = i.piacrol_le ? new Date(i.piacrol_le) : null;
        i.hist = hist.get(i.id) || [];
    });

    return lista;

}

function szam(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
}

function szuroEgyezik(i, f) {
    if (f.kerulet && (i.kerulet || "") !== f.kerulet) return false;
    if (f.telepules === "_varos" && i.telepules) return false;
    if (f.telepules && f.telepules !== "_varos" && (i.telepules || "") !== f.telepules) return false;
    if (f.allapot && normAllapot(i.allapot) !== f.allapot) return false;
    if (f.jelleg && i.telek_jelleg !== f.jelleg) return false;
    if (f.minSzoba !== null && (i.szobak || 0) < f.minSzoba) return false;
    if (f.maxSzoba !== null && (i.szobak || 0) > f.maxSzoba) return false;
    if (f.minNm !== null && i.nm < f.minNm) return false;
    if (f.maxNm !== null && i.nm > f.maxNm) return false;
    if (f.minEmelet !== null || f.maxEmelet !== null) {
        const e = emeletSzam(i.emelet);
        if (e === null) return false;
        if (f.minEmelet !== null && e < f.minEmelet) return false;
        if (f.maxEmelet !== null && e > f.maxEmelet) return false;
    }
    return true;
}

// A kérés szűrői egységesen
function szurok(q) {
    return {
        varos: String(q.varos || "").trim(),
        tipus: String(q.tipus || "lakas"),
        ugylet: String(q.ugylet || "elado"),
        kerulet: String(q.kerulet || ""),
        telepules: String(q.telepules || ""),
        allapot: String(q.allapot || ""),
        jelleg: String(q.jelleg || ""),
        minSzoba: szam(q.minSzoba), maxSzoba: szam(q.maxSzoba),
        minNm: szam(q.minNm), maxNm: szam(q.maxNm),
        minEmelet: szam(q.minEmelet), maxEmelet: szam(q.maxEmelet)
    };
}

// Fent volt-e a hirdetés az időszakban, és ha igen, mennyiért (az időszak végén)
function allapotIdoszakban(i, p) {
    if (i.created_at >= p.veg) return null;
    if (i.piacrol_le && i.piacrol_le < p.kezd) return null;
    let ar = null, nm = null;
    for (const h of i.hist) {
        if (h.datum < p.veg) { ar = h.ar; nm = h.nm; } else break;
    }
    // Az első naplózott ár előtti időre (régi adatoknál) az első ismert ár
    if (ar === null) {
        const elso = i.hist[0];
        ar = elso ? elso.ar : Number(i.ar);
        nm = elso ? elso.nm : null;
    }
    nm = nm || Number(i.nm);
    if (!(ar > 0 && nm > 0)) return null;
    return { ar, nm, arnm: ar / nm };
}

function osszegez(elemek, p) {
    const arnm = elemek.map(e => e.arnm);
    const ar = elemek.map(e => e.ar);
    return {
        n: elemek.length,
        uj: p ? elemek.filter(e => e.i.created_at >= p.kezd).length : undefined,
        median_nm: median(arnm),
        atlag_nm: vagottAtlag(arnm),
        p25_nm: kvantilis(arnm, 0.25),
        p75_nm: kvantilis(arnm, 0.75),
        median_ar: median(ar),
        median_terulet: median(elemek.map(e => e.nm))
    };
}

// Azonos hirdetések árváltozása két időszak között (medián %, és hány hirdetés)
function azonosValtozas(lista, pA, pB) {
    const valt = [];
    const logok = [];
    lista.forEach(i => {
        const a = allapotIdoszakban(i, pA);
        const b = allapotIdoszakban(i, pB);
        if (a && b) {
            valt.push((b.ar / a.ar - 1) * 100);
            logok.push(Math.log(b.ar / a.ar));
        }
    });
    return {
        n: valt.length,
        median: valt.length ? median(valt) : null,
        // Átlagos (mértani) árváltozás %-ban – ez mutatja a tiszta árváltozást
        atlag: logok.length ? (Math.exp(atlag(logok)) - 1) * 100 : null,
        csokkent: valt.filter(v => v < -0.5).length,
        emelt: valt.filter(v => v > 0.5).length
    };
}

// ---------- Ártrend ----------
//  q: szűrők + tol=YYYY-MM, ig=YYYY-MM, felbontas=honap|negyedev, bontas=szobak|allapot|kerulet|emelet|telepules
async function trend(q) {

    const f = szurok(q);
    if (!f.varos) return { idoszakok: [], sorozatok: [] };

    const lista = await hirdetesek(f);

    const most = honapKezdet(new Date());
    const legkorabbi = lista.length ? honapKezdet(new Date(Math.min(...lista.map(i => i.created_at.getTime())))) : most;

    let tol = honapbol(q.tol) || legkorabbi;
    let ig = honapbol(q.ig) || most;
    if (tol > ig) [tol, ig] = [ig, tol];
    if (ig > most) ig = most;

    // Legfeljebb 5 év
    const minTol = kovetkezo(ig, -60);
    if (tol < minTol) tol = minTol;

    const felbontas = q.felbontas === "negyedev" ? "negyedev" : "honap";
    const ids = idoszakok(tol, ig, felbontas);

    // Minden hirdetés állapota minden időszakban (egyszer számoljuk)
    const allapotok = ids.map(p => {
        const elemek = [];
        lista.forEach(i => {
            const a = allapotIdoszakban(i, p);
            if (a) elemek.push({ ...a, i });
        });
        return elemek;
    });

    // Összetétel-korrigált €/m²: szobaszám (lakás, ház) szerinti rétegek,
    // a súly a réteg aránya a teljes időszakban
    const retegKulcs = ["lakas", "haz"].includes(f.tipus) ? BONTAS.szobak : null;
    let sulyok = null;
    if (retegKulcs) {
        const db = new Map();
        let ossz = 0;
        allapotok.forEach(el => el.forEach(e => {
            const k = retegKulcs(e.i);
            db.set(k, (db.get(k) || 0) + 1);
            ossz++;
        }));
        sulyok = new Map([...db.entries()].map(([k, v]) => [k, v / (ossz || 1)]));
    }

    const korrigalt = elemek => {
        if (!sulyok || !elemek.length) return median(elemek.map(e => e.arnm));
        const retegek = new Map();
        elemek.forEach(e => {
            const k = retegKulcs(e.i);
            if (!retegek.has(k)) retegek.set(k, []);
            retegek.get(k).push(e.arnm);
        });
        let s = 0, w = 0;
        retegek.forEach((v, k) => {
            const suly = sulyok.get(k) || 0;
            s += suly * median(v);
            w += suly;
        });
        return w ? s / w : null;
    };

    // Azonos hirdetések láncolt árindexe (első időszak = 100): két egymás
    // utáni időszakban is fent lévő hirdetések árának mértani átlagos változása.
    // (A medián itt többnyire 0 lenne, mert a legtöbb ár havonta nem változik.)
    let index = 100;
    const indexek = ids.map((p, n) => {
        if (n > 0) {
            const arany = [];
            lista.forEach(i => {
                const a = allapotIdoszakban(i, ids[n - 1]);
                const b = allapotIdoszakban(i, p);
                if (a && b) arany.push(Math.log(b.ar / a.ar));
            });
            if (arany.length >= 3) index *= Math.exp(atlag(arany));
        }
        return index;
    });

    const sor = (nev, szuro) => ({
        kulcs: nev,
        pontok: ids.map((p, n) => {
            const el = szuro ? allapotok[n].filter(szuro) : allapotok[n];
            const o = osszegez(el, p);
            if (!szuro) {
                o.korrigalt_nm = korrigalt(el);
                o.index = el.length ? indexek[n] : null;
            }
            return o;
        })
    });

    const sorozatok = [sor("_osszes", null)];

    const bontas = BONTAS[q.bontas] ? q.bontas : null;
    if (bontas) {
        const db = new Map();
        allapotok.forEach(el => el.forEach(e => {
            const k = BONTAS[bontas](e.i);
            db.set(k, (db.get(k) || 0) + 1);
        }));
        [...db.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .forEach(([k]) => sorozatok.push(sor(k, e => BONTAS[bontas](e.i) === k)));
    }

    // Mióta naplózzuk az árváltozásokat (előtte az árak a felvételkori árak)
    const naplo = await db.query("SELECT ertek FROM beallitasok WHERE kulcs = 'arnaplo_kezdet'").catch(() => ({ rows: [] }));

    return {
        tol: honapKulcs(tol),
        ig: honapKulcs(ig),
        felbontas,
        bontas,
        idoszakok: ids.map(p => p.kulcs),
        idoszakKezd: ids.map(p => p.kezd.toISOString()),
        sorozatok,
        hirdetesDb: lista.length,
        naploKezdet: naplo.rows[0] ? naplo.rows[0].ertek : null
    };

}

// ---------- Két időszak összevetése ----------
//  q: szűrők + a=YYYY-MM, b=YYYY-MM (vagy aTol/aIg, bTol/bIg hónaptartomány)
async function osszevet(q) {

    const f = szurok(q);
    if (!f.varos) return null;

    const ertelmez = (tolS, igS) => {
        const tol = honapbol(tolS);
        if (!tol) return null;
        const ig = honapbol(igS) || tol;
        const [k, v] = tol <= ig ? [tol, ig] : [ig, tol];
        return { kulcs: honapKulcs(k) + (k.getTime() !== v.getTime() ? " – " + honapKulcs(v) : ""), kezd: k, veg: kovetkezo(v, 1) };
    };

    const pA = ertelmez(q.aTol || q.a, q.aIg);
    const pB = ertelmez(q.bTol || q.b, q.bIg);
    if (!pA || !pB) return null;

    const lista = await hirdetesek(f);

    const elemek = p => {
        const el = [];
        lista.forEach(i => { const a = allapotIdoszakban(i, p); if (a) el.push({ ...a, i }); });
        return el;
    };

    const elA = elemek(pA);
    const elB = elemek(pB);

    const kategoriak = f.tipus === "telek" ? ["telepules"]
        : f.tipus === "haz" ? ["telepules", "allapot", "szobak"]
        : f.tipus === "kereskedelmi" || f.tipus === "iroda" ? ["kerulet", "allapot", "emelet"]
        : ["szobak", "kerulet", "allapot", "emelet"];

    const bontasok = {};

    kategoriak.forEach(cat => {
        const kulcsok = new Set([...elA, ...elB].map(e => BONTAS[cat](e.i)));
        bontasok[cat] = [...kulcsok].map(k => {
            const a = elA.filter(e => BONTAS[cat](e.i) === k);
            const b = elB.filter(e => BONTAS[cat](e.i) === k);
            const ids = new Set(a.map(e => e.i.id));
            const reszLista = lista.filter(i => ids.has(i.id) && BONTAS[cat](i) === k);
            return {
                kulcs: k,
                a: osszegez(a),
                b: osszegez(b),
                azonos: azonosValtozas(reszLista, pA, pB)
            };
        });
    });

    return {
        a: { kulcs: pA.kulcs, ...osszegez(elA) },
        b: { kulcs: pB.kulcs, ...osszegez(elB) },
        azonos: azonosValtozas(lista, pA, pB),
        bontasok
    };

}

module.exports = { trend, osszevet, _belso: { median, kvantilis, idoszakok, allapotIdoszakban, normAllapot } };
