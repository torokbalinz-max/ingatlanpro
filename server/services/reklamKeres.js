// ============================================================
//  Reklámfelület-bérlési kérések
//
//  A weboldal "Érdeklődöm" gombja egy űrlapot nyit (ki, melyik hely,
//  mettől, hány hónapra, weboldal, üzenet). A kérés ide kerül:
//   - az adminnak e-mail megy róla, a kérőnek visszaigazolás
//   - Admin → Reklámfelületek → Bérlési kérések: állapot, jegyzet
//   - "Hirdetés létrehozása": ügyfél (Pénzügy → Ügyfelek) + hirdetés
//     (kikapcsolva, a kért helyekkel és időszakkal) → a szerkesztőben
//     ár + "Szerződés + díjbekérő küldése" (services/reklamSzamla.js),
//     befizetés után a számla magától elkészül és e-mailben megy
//   - az állapot a hirdetésből magától követi: elküldve → ajánlat,
//     kifizetve → elfogadva
//   - "Ajánlat küldése" egy kattintással: ügyfél (adószámnál az ANAF-ból
//     kiegészítve: hivatalos név, cím, település, megye) + hirdetés (az
//     árlista szerinti havi díjjal) + díjbekérő és fizetési link e-mailben.
//     Bekapcsolható, hogy az új kérésekre ez magától menjen (ha minden adat
//     megvan és a helyek szabadok) – Admin → Reklámfelületek → Beállítások.
// ============================================================

const db = require("../db/database");
const mail = require("./mail");
const reklam = require("./reklam");

const ALLAPOTOK = ["uj", "folyamatban", "ajanlat", "elfogadva", "elutasitva"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function kodHiba(kod) {
    const e = new Error(kod);
    e.kod = kod;
    return e;
}

const sz = (v, max) => (v === null || v === undefined || String(v).trim() === "") ? null : String(v).trim().slice(0, max);

function tisztit(b) {

    const d = {
        nev: sz(b.nev, 120),
        ceg: sz(b.ceg, 160),
        cui: (sz(b.cui, 20) || "").toUpperCase().replace(/^RO/, "").replace(/\s/g, "") || null,
        email: (sz(b.email, 160) || "").toLowerCase() || null,
        telefon: sz(b.telefon, 40),
        cim: sz(b.cim, 400),
        varos: sz(b.varos, 80),
        megye: /^RO-[A-Z]{1,2}$/.test(String(b.megye || "")) ? String(b.megye) : null,
        helyek: Array.isArray(b.helyek) ? [...new Set(b.helyek.filter(h => reklam.HELYEK[h]))].slice(0, 20) : [],
        kezdet: /^\d{4}-\d{2}$/.test(String(b.kezdet || "")) ? String(b.kezdet) : null,
        honap: Math.max(1, Math.min(24, parseInt(b.honap, 10) || 1)),
        weboldal: sz(b.weboldal, 300),
        uzenet: sz(b.uzenet, 3000),
        nyelv: ["hu", "ro", "en"].includes(b.nyelv) ? b.nyelv : "ro"
    };

    if (!d.nev) throw kodHiba("name_required");
    if (!d.email || !EMAIL_RE.test(d.email)) throw kodHiba("bad_email");
    if (d.weboldal && !/^https?:\/\//i.test(d.weboldal)) d.weboldal = "https://" + d.weboldal;
    if (d.weboldal) {
        try { d.weboldal = new URL(d.weboldal).toString(); } catch (e) { throw kodHiba("bad_url"); }
    }
    return d;

}

// A kért időszak napokra: az első hónap 1-je → az utolsó hónap utolsó napja
function idoszak(kezdet, honap) {
    let y, m;
    if (kezdet) [y, m] = kezdet.split("-").map(Number);
    else { const ma = new Date(); y = ma.getFullYear(); m = ma.getMonth() + 2; if (m > 12) { m = 1; y++; } }
    const ket = n => String(n).padStart(2, "0");
    const veg = new Date(Date.UTC(y, m - 1 + honap, 0));
    return { kezdet: `${y}-${ket(m)}-01`, vege: `${veg.getUTCFullYear()}-${ket(veg.getUTCMonth() + 1)}-${ket(veg.getUTCDate())}` };
}

const HELY_NEV = {
    hu: { home_top: "Kezdőlap – fent", home: "Kezdőlap – lent", list_top: "Ingatlanok – a találatok fölött", feed: "Ingatlanok – a kártyák között", feed_wide: "Ingatlanok – széles sáv", sidebar: "Ingatlanok – oldalsáv", map: "Térkép", listing_side: "Hirdetés oldala – jobb oldalt", listing: "Hirdetés oldala – lent", valuation_side: "Értékbecslő – oldalt", valuation: "Értékbecslő – lent", market_top: "Piaci elemzés – fent", market: "Piaci elemzés – lent", agencies: "Ingatlanirodák", requests: "Keresek" },
    ro: { home_top: "Prima pagină – sus", home: "Prima pagină – jos", list_top: "Proprietăți – deasupra rezultatelor", feed: "Proprietăți – între carduri", feed_wide: "Proprietăți – bandă lată", sidebar: "Proprietăți – lateral", map: "Hartă", listing_side: "Pagina anunțului – dreapta", listing: "Pagina anunțului – jos", valuation_side: "Evaluare – lateral", valuation: "Evaluare – jos", market_top: "Analiza pieței – sus", market: "Analiza pieței – jos", agencies: "Agenții", requests: "Cereri" },
    en: { home_top: "Home – top", home: "Home – bottom", list_top: "Properties – above results", feed: "Properties – between cards", feed_wide: "Properties – wide strip", sidebar: "Properties – sidebar", map: "Map", listing_side: "Listing page – right", listing: "Listing page – bottom", valuation_side: "Valuation – side", valuation: "Valuation – bottom", market_top: "Market – top", market: "Market – bottom", agencies: "Agencies", requests: "Requests" }
};
// Az ANAF-tól jövő megyenév ("COVASNA", "MUNICIPIUL BUCUREŞTI") → "RO-CV"
const MEGYEK = [["AB", "Alba"], ["AR", "Arad"], ["AG", "Arges"], ["BC", "Bacau"], ["BH", "Bihor"], ["BN", "Bistrita-Nasaud"], ["BT", "Botosani"],
    ["BV", "Brasov"], ["BR", "Braila"], ["BZ", "Buzau"], ["CS", "Caras-Severin"], ["CL", "Calarasi"], ["CJ", "Cluj"], ["CT", "Constanta"],
    ["CV", "Covasna"], ["DB", "Dambovita"], ["DJ", "Dolj"], ["GL", "Galati"], ["GR", "Giurgiu"], ["GJ", "Gorj"], ["HR", "Harghita"], ["HD", "Hunedoara"],
    ["IL", "Ialomita"], ["IS", "Iasi"], ["IF", "Ilfov"], ["MM", "Maramures"], ["MH", "Mehedinti"], ["MS", "Mures"], ["NT", "Neamt"], ["OT", "Olt"],
    ["PH", "Prahova"], ["SM", "Satu Mare"], ["SJ", "Salaj"], ["SB", "Sibiu"], ["SV", "Suceava"], ["TR", "Teleorman"], ["TM", "Timis"], ["TL", "Tulcea"],
    ["VS", "Vaslui"], ["VL", "Valcea"], ["VN", "Vrancea"], ["B", "Bucuresti"]];
function megyeKod(nev) {
    const n = String(nev || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!n) return null;
    const t = MEGYEK.find(([, m]) => n.includes(m.toLowerCase())) || (n.includes("bucuresti") ? ["B"] : null);
    return t ? "RO-" + t[0] : null;
}
const telepulesNev = t => t ? String(t).replace(/^(mun\.|ors\.|oraș|oras|municipiul|com\.|sat)\s*/i, "").trim() : null;

// Cégadatok az ANAF-ból (hivatalos név, utca, település, megye, cégjegyzékszám); hiba esetén null
async function anafAdat(cui) {
    if (!cui) return null;
    try {
        const anaf = require("./anaf");
        if (!anaf.cuiErvenyes(cui)) return null;
        const v = await anaf.lekerdez(cui);
        if (!v || !v.talalt || !v.adat) return null;
        const a = v.adat;
        return { nev: a.nev, cim: a.utca || a.cim, varos: telepulesNev(a.telepules), megye: megyeKod(a.megye), reg_com: a.regCom, afa_alany: !!a.tva, aktiv: a.aktiv !== false };
    } catch (e) { return null; }
}

const helyNevek = (helyek, ny) => helyek.map(h => (HELY_NEV[ny] || HELY_NEV.hu)[h] || h).join(", ");

async function cimzett() {
    const b = await reklam.olvas().catch(() => ({}));
    if (b && b.email && EMAIL_RE.test(b.email)) return b.email;
    return require("./oldalAdatok").adminEmail();
}

// Új kérés a weboldalról
async function uj(b, { ip, alapCim } = {}) {

    const d = tisztit(b || {});

    // ugyanaz a cím 10 percen belül ugyanazzal: nem kétszer
    const dupla = await db.query(`SELECT id FROM reklam_keresek WHERE email = $1 AND created_at > NOW() - INTERVAL '10 minutes' AND COALESCE(uzenet,'') = COALESCE($2,'')`, [d.email, d.uzenet]);
    if (dupla.rows[0]) return { id: dupla.rows[0].id, dupla: true };

    const r = await db.query(`
        INSERT INTO reklam_keresek (nev, ceg, cui, email, telefon, cim, varos, helyek, kezdet, honap, weboldal, uzenet, nyelv, ip, megye)
        VALUES ($1,$2,$3,$4,$5,$13,$14,$6::jsonb,$7,$8,$9,$10,$11,$12,$15) RETURNING id`,
        [d.nev, d.ceg, d.cui, d.email, d.telefon, JSON.stringify(d.helyek), d.kezdet, d.honap, d.weboldal, d.uzenet, d.nyelv, ip || null, d.cim, d.varos, d.megye]);
    const id = r.rows[0].id;

    if (mail.elerheto()) {
        const cim = (alapCim || mail.oldalCim()).replace(/\/+$/, "");
        const ido = d.kezdet ? `${d.kezdet} · ${d.honap} hó` : `${d.honap} hó`;
        // az adminnak (magyarul)
        try {
            const to = await cimzett();
            if (to) {
                const t = mail.sablon({
                    cim: `Új reklámfelület-bérlési kérés: ${d.ceg || d.nev}`,
                    sorok: [
                        `${d.nev}${d.ceg ? " – " + d.ceg : ""}${d.cui ? " (CUI " + d.cui + ")" : ""}`,
                        `${d.email}${d.telefon ? " · " + d.telefon : ""}`,
                        d.cim || d.varos ? `Számlázási cím: ${[d.cim, d.varos].filter(Boolean).join(", ")}` : "",
                        `Helyek: ${d.helyek.length ? helyNevek(d.helyek, "hu") : "nincs megadva"}`,
                        `Időszak: ${ido}`,
                        d.weboldal ? `Weboldal: ${d.weboldal}` : "",
                        d.uzenet ? `Üzenet:\n${d.uzenet}` : ""
                    ].filter(Boolean),
                    gomb: "Megnyitás az adminban",
                    link: `${cim}/#admin/reklam`,
                    lablec: "Admin értesítés – válaszolj erre a levélre, és a kérőnek megy."
                });
                await mail.kuld({ to, subject: `Reklám bérlési kérés – ${d.ceg || d.nev}`, html: t.html, text: t.text, replyTo: d.email });
            }
        } catch (e) { /* a levél nem akadályozza a kérést */ }
        // a kérőnek: visszaigazolás a nyelvén
        try {
            const sz2 = {
                hu: { s: "Megkaptuk a reklámfelület-bérlési kérésedet", c: "Köszönjük az érdeklődést!", k: "Hamarosan jelentkezünk az árral és a részletekkel. Ha elfogadod, e-mailben kapsz egy szerződést és egy fizetési linket; a befizetés után a reklámod elindul, a számlát pedig e-mailben küldjük.", h: "Kért helyek" },
                ro: { s: "Am primit cererea dvs. pentru spațiu publicitar", c: "Vă mulțumim pentru interes!", k: "Revenim în curând cu prețul și detaliile. Dacă acceptați, primiți pe e-mail un contract și un link de plată; după plată reclama pornește, iar factura o trimitem pe e-mail.", h: "Spații cerute" },
                en: { s: "We received your ad space request", c: "Thank you for your interest!", k: "We'll get back to you shortly with the price and details. If you accept, you'll get a contract and a payment link by email; once paid, your ad goes live and the invoice is emailed to you.", h: "Requested placements" }
            }[d.nyelv];
            const t = mail.sablon({
                cim: sz2.c,
                sorok: [sz2.k, d.helyek.length ? `${sz2.h}: ${helyNevek(d.helyek, d.nyelv)}` : ""].filter(Boolean),
                lablec: "IngatlanPro"
            });
            const valasz = await cimzett().catch(() => "");
            await mail.kuld({ to: d.email, subject: sz2.s, html: t.html, text: t.text, replyTo: valasz || undefined });
        } catch (e) { /* semmi */ }
    }

    // Magától ajánlat (ha be van kapcsolva): a háttérben, a kérő nem vár rá
    const be = await reklam.olvas().catch(() => ({}));
    if (be && be.auto_ajanlat) {
        setImmediate(() => ajanlat(id, alapCim, { auto: true })
            .then(v => { if (v.kuldve) console.log(`Reklám bérlési kérés #${id}: ajánlat magától elküldve (${v.dijbekero && v.dijbekero.sorszam}).`); })
            .catch(e => console.error("Reklám automatikus ajánlat:", e.message)));
    }

    return { id };

}

// Az állapot kövesse a hozzá létrehozott hirdetést
async function szinkron() {
    await db.query(`
        UPDATE reklam_keresek k SET statusz = 'elfogadva', updated_at = NOW()
        WHERE k.reklam_id IS NOT NULL AND k.statusz IN ('uj', 'folyamatban', 'ajanlat')
          AND EXISTS (SELECT 1 FROM penzugy_szamlak s WHERE s.reklam_id = k.reklam_id AND s.statusz = 'fizetve')`);
    await db.query(`
        UPDATE reklam_keresek k SET statusz = 'ajanlat', updated_at = NOW()
        FROM reklamok r
        WHERE r.id = k.reklam_id AND k.statusz IN ('uj', 'folyamatban') AND r.szerzodes_kuldve IS NOT NULL`);
}

async function lista() {
    await szinkron().catch(() => { });
    const r = await db.query(`
        SELECT k.id, k.nev, k.ceg, k.cui, k.email, k.telefon, k.cim, k.varos, k.megye, k.helyek, k.kezdet, k.honap, k.weboldal, k.uzenet, k.nyelv,
               k.statusz, k.admin_megjegyzes, k.reklam_id, k.ugyfel_id, k.created_at, k.updated_at,
               r.nev AS reklam_nev, r.szerzodes_kuldve, r.szerzodes_elfogadva,
               EXISTS (SELECT 1 FROM penzugy_szamlak s WHERE s.reklam_id = k.reklam_id AND s.statusz = 'fizetve') AS fizetve
        FROM reklam_keresek k
        LEFT JOIN reklamok r ON r.id = k.reklam_id
        ORDER BY (k.statusz = 'uj') DESC, k.created_at DESC
        LIMIT 300`);
    return r.rows;
}

async function ujDb() {
    const r = await db.query("SELECT COUNT(*)::int AS n FROM reklam_keresek WHERE statusz = 'uj'");
    return r.rows[0].n;
}

async function modosit(id, b) {
    const sets = [], ert = [];
    if (b.statusz !== undefined) {
        if (!ALLAPOTOK.includes(b.statusz)) throw kodHiba("bad_status");
        ert.push(b.statusz); sets.push(`statusz = $${ert.length}`);
    }
    if (b.admin_megjegyzes !== undefined) { ert.push(sz(b.admin_megjegyzes, 2000)); sets.push(`admin_megjegyzes = $${ert.length}`); }
    if (!sets.length) return null;
    ert.push(id);
    const r = await db.query(`UPDATE reklam_keresek SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${ert.length} RETURNING id`, ert);
    return r.rowCount ? r.rows[0] : null;
}

async function torol(id) {
    await db.query("DELETE FROM reklam_keresek WHERE id = $1", [id]);
}

// Ügyfél + hirdetés a kérésből. A hirdetés kikapcsolva, fizetés után indul.
async function hirdetesbol(id) {

    const r = await db.query("SELECT * FROM reklam_keresek WHERE id = $1", [id]);
    const k = r.rows[0];
    if (!k) throw kodHiba("not_found");
    if (k.reklam_id) {
        const van = await db.query("SELECT id FROM reklamok WHERE id = $1", [k.reklam_id]);
        if (van.rows[0]) return { reklam_id: k.reklam_id, ugyfel_id: k.ugyfel_id, meglevo: true };
    }

    // ügyfél: a meglévő (adószám vagy e-mail szerint), különben új
    let ugyfelId = k.ugyfel_id || null;
    if (!ugyfelId) {
        const m = await db.query(`
            SELECT id FROM penzugy_ugyfelek
            WHERE ($1::text IS NOT NULL AND cui = $1) OR (LOWER(email) = $2)
            ORDER BY (cui = $1) DESC NULLS LAST, id LIMIT 1`, [k.cui, k.email]);
        ugyfelId = m.rows[0] ? m.rows[0].id : null;
        // a meglévő ügyfél hiányzó számlázási adatai az ANAF-ból
        if (ugyfelId && k.cui) {
            const u = (await db.query("SELECT * FROM penzugy_ugyfelek WHERE id = $1", [ugyfelId])).rows[0];
            if (u && (!u.cim || !u.varos || !u.megye)) {
                const a = await anafAdat(u.cui || k.cui);
                if (a) await require("./penzugy").ugyfelMent(u.id, { ...u, cim: u.cim || a.cim, varos: u.varos || a.varos, megye: u.megye || a.megye, reg_com: u.reg_com || a.reg_com, orszag: u.orszag || "RO" }).catch(() => { });
            }
        }
    }
    if (!ugyfelId) {
        // adószámnál: a hivatalos adatok az ANAF-ból (a számlához kell a település és a megye)
        const a = await anafAdat(k.cui);
        ugyfelId = await require("./penzugy").ugyfelMent(null, {
            tipus: k.cui ? (a && /PFA|INTREPRINDERE|ÎNTREPRINDERE/i.test(a.nev || "") ? "pfa" : "ceg") : "maganszemely",
            nev: (a && a.nev) || k.ceg || k.nev,
            cui: k.cui,
            reg_com: a ? a.reg_com : null,
            email: k.email,
            telefon: k.telefon,
            cim: (a && a.cim) || k.cim,
            varos: (a && a.varos) || k.varos,
            megye: (a && a.megye) || k.megye || null,
            orszag: "RO",
            afa_alany: a ? a.afa_alany : false,
            jegyzet: `Reklám bérlési kérésből (#${k.id}) – kapcsolattartó: ${k.nev}${a ? " · adatok: ANAF" : ""}`
        });
    }

    const ido = idoszak(k.kezdet, k.honap || 1);
    const helyek = Array.isArray(k.helyek) ? k.helyek : [];
    let cel = k.weboldal || null;
    try { if (cel) new URL(cel); } catch (e) { cel = null; }

    const b = await reklam.olvas().catch(() => ({}));
    const h = await reklam.letrehoz({
        nev: `${k.ceg || k.nev} – ${ido.kezdet.slice(0, 7)}`,
        // az árlista szerint (a választott helyek havi díjának összege) – a szerkesztőben átírható
        ar: await reklam.arlistaAr(helyek),
        penznem: b && b.penznem ? b.penznem : "RON",
        hirdeto: k.ceg || k.nev,
        kapcsolat: [k.nev, k.email, k.telefon].filter(Boolean).join(" · "),
        cel_url: cel,
        helyek,
        kezdet: ido.kezdet,
        vege: ido.vege,
        aktiv: true,
        fizetes_utan: true,
        szerzodes_kell: true,
        ugyfel_id: ugyfelId,
        megjegyzes: [`Bérlési kérés #${k.id}`, k.uzenet].filter(Boolean).join("\n")
    });

    await db.query(`UPDATE reklam_keresek SET reklam_id = $1, ugyfel_id = $2, statusz = CASE WHEN statusz = 'uj' THEN 'folyamatban' ELSE statusz END, updated_at = NOW() WHERE id = $3`,
        [h.id, ugyfelId, k.id]);

    return { reklam_id: h.id, ugyfel_id: ugyfelId, hirdetes: h };

}

// Egy kattintással (vagy magától, az új kérésre): ügyfél + hirdetés + díjbekérő és
// fizetési link e-mailben. Ha valami hiányzik (pl. a számlázási cím), nem küld
// semmit, és megmondja, mi kell – a hirdetés ilyenkor a szerkesztőben folytatható.
async function ajanlat(id, alapCim, { auto = false } = {}) {
    const k = (await db.query("SELECT * FROM reklam_keresek WHERE id = $1", [id])).rows[0];
    if (!k) throw kodHiba("not_found");
    const helyek = Array.isArray(k.helyek) ? k.helyek : [];
    if (!helyek.length) return { kuldve: false, hianyzik: ["helyek"], reklam_id: k.reklam_id || null };
    // foglalt hely: nem küldünk ajánlatot (az admin dönt)
    const ido = idoszak(k.kezdet, k.honap || 1);
    const f = await reklam.foglaltsag(ido.kezdet, ido.vege, k.reklam_id || 0);
    const foglalt = helyek.filter(h => f[h] && !f[h].szabad);
    if (foglalt.length) return { kuldve: false, foglalt, hianyzik: [], reklam_id: k.reklam_id || null };
    const v = await hirdetesbol(id);
    const rsz = require("./reklamSzamla");
    const a = await rsz.allapot(v.reklam_id);
    if (a.hianyzik.length) return { kuldve: false, hianyzik: a.hianyzik, reklam_id: v.reklam_id };
    if (auto && (!a.ugyfel || !a.ugyfel.email)) return { kuldve: false, hianyzik: ["ugyfel_email"], reklam_id: v.reklam_id };
    const kuld = await rsz.kuld(v.reklam_id, alapCim);
    await db.query("UPDATE reklam_keresek SET statusz = 'ajanlat', updated_at = NOW() WHERE id = $1 AND statusz IN ('uj', 'folyamatban')", [id]);
    return { kuldve: true, reklam_id: v.reklam_id, ...kuld };
}

module.exports = { ALLAPOTOK, uj, lista, ujDb, modosit, torol, hirdetesbol, idoszak, ajanlat, anafAdat, megyeKod, telepulesNev };
