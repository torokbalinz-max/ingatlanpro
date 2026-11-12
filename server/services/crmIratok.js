// ============================================================
//  CRM – iratok (az adásvételhez szükséges dokumentumok)
//
//  Ügyfelenként egy kipipálható lista. Az iroda sablonból indítja (eladó /
//  vevő, lakás / ház / telek, jelzálog, hitel, külföldi), tételenként jelöli:
//  hiányzik → beküldve (az ügyfél feltöltötte, ellenőrizni kell) → megvan /
//  nem kell; fájlokat tölthet fel (PDF, kép – max. 8 MB / fájl).
//
//  Ügyfélportál: az ügyfél egy titkos linken (belépés nélkül) látja a saját
//  listáját és a fájlokat, és ő is feltölthet. A linket az iroda kapcsolja be
//  (és bármikor újat generálhat / kikapcsolhatja). A fájlok csak ehhez az
//  ügyfélhez tartoznak; az ügyfél törlésével együtt törlődnek.
//
//  A sablon a közjegyzői adásvételhez szokásos iratokat tartalmazza (romániai
//  gyakorlat): személyi, családi állapot, tulajdonjogot igazoló irat, kataszteri
//  dokumentáció és telekkönyvi bejegyzés (a hitelesítéshez szükséges
//  telekkönyvi kivonatot a közjegyző kéri le), adóigazolás (certificat fiscal),
//  energetikai tanúsítvány, lakásnál a lakótársulási igazolás, rezsi-befizetések,
//  jelzálognál a bank hozzájárulása, teleknél urbanisztikai bizonyítvány és
//  (külterületi mezőgazdasági teleknél) az elővásárlási jog igazolása; a
//  vevőnél a finanszírozás iratai. A pontos listát mindig a közjegyző mondja meg.
// ============================================================

const crypto = require("crypto");
const db = require("../db/database");

const STATUSZ = ["hianyzik", "bekuldve", "megvan", "nem_kell"];
const MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_FAJL = 8 * 1024 * 1024;
const MAX_UGYFEL = 80 * 1024 * 1024;

// Sablon: kulcs, kinek (elado / vevo / mindketto), mikor kell
// feltetel(o): o = { oldal, tipus, jelzalog, hitel, kulfoldi }
const SABLON = [
    { k: "szemelyi", kinek: "mindketto" },
    { k: "kulfoldi_nif", kinek: "mindketto", ha: o => o.kulfoldi },
    { k: "csaladi", kinek: "mindketto" },
    { k: "tulajdon", kinek: "elado" },
    { k: "kataszter", kinek: "elado" },
    { k: "cf_informare", kinek: "elado" },
    { k: "fiscal", kinek: "elado" },
    { k: "energetikai", kinek: "elado", ha: o => o.tipus !== "telek" },
    { k: "tarsulas", kinek: "elado", ha: o => o.tipus === "lakas" },
    { k: "rezsi", kinek: "elado", ha: o => o.tipus !== "telek" },
    { k: "bank_hozzajarulas", kinek: "elado", ha: o => o.jelzalog },
    { k: "urbanisztikai", kinek: "elado", ha: o => o.tipus === "telek" },
    { k: "elovasarlas", kinek: "elado", ha: o => o.tipus === "telek" && o.kulterulet },
    { k: "hitel_jovahagyas", kinek: "vevo", ha: o => o.hitel },
    { k: "eloszerzodes", kinek: "mindketto" },
    { k: "eloleg", kinek: "mindketto" }
];

function hibaKod(kod, status = 400) {
    const e = new Error(kod);
    e.kod = kod;
    e.status = status;
    return e;
}

const sz = (v, max = 300) => {
    if (v === undefined || v === null) return null;
    const t = String(v).trim();
    return t ? t.slice(0, max) : null;
};

// ---------- Iroda oldal (a CRM jogosultságával: crm.ugyfelJog) ----------

async function lista(ugyfelId) {
    const r = await db.query(`
        SELECT i.*, to_char(i.lejarat, 'YYYY-MM-DD') AS lejarat,
               COALESCE((SELECT json_agg(json_build_object('id', f.id, 'nev', f.nev, 'mime', f.mime, 'meret', f.meret, 'feltolto', f.feltolto, 'created_at', f.created_at) ORDER BY f.id)
                         FROM crm_irat_fajlok f WHERE f.irat_id = i.id), '[]') AS fajlok
        FROM crm_iratok i WHERE i.ugyfel_id = $1 ORDER BY i.kinek, i.sorrend, i.id`, [ugyfelId]);
    return r.rows;
}

// Lista indítása sablonból (a már meglévő kulcsok kimaradnak)
async function sablonbol(ugyfelId, o) {
    const opt = {
        oldal: ["elado", "vevo", "mindketto"].includes(o.oldal) ? o.oldal : "elado",
        tipus: ["lakas", "haz", "telek"].includes(o.tipus) ? o.tipus : "lakas",
        jelzalog: !!o.jelzalog, hitel: !!o.hitel, kulfoldi: !!o.kulfoldi, kulterulet: !!o.kulterulet
    };
    const megvan = new Set((await db.query("SELECT kulcs FROM crm_iratok WHERE ugyfel_id = $1 AND kulcs IS NOT NULL", [ugyfelId])).rows.map(x => x.kulcs));
    const ingatlanId = Number(o.ingatlan_id) || null;
    let n = 0;
    for (const [idx, s] of SABLON.entries()) {
        if (s.ha && !s.ha(opt)) continue;
        if (opt.oldal !== "mindketto" && s.kinek !== "mindketto" && s.kinek !== opt.oldal) continue;
        if (megvan.has(s.k)) continue;
        await db.query(`INSERT INTO crm_iratok (ugyfel_id, ingatlan_id, kulcs, nev, kinek, sorrend) VALUES ($1,$2,$3,$4,$5,$6)`,
            [ugyfelId, ingatlanId, s.k, s.k, s.kinek === "mindketto" ? "mindketto" : s.kinek, idx]);
        n++;
    }
    return { letrehozva: n };
}

async function hozzaad(ugyfelId, b) {
    const nev = sz(b.nev, 200);
    if (!nev) throw hibaKod("name_required");
    const r = await db.query(`INSERT INTO crm_iratok (ugyfel_id, nev, kinek, sorrend, megjegyzes) VALUES ($1,$2,$3,999,$4) RETURNING id`,
        [ugyfelId, nev, ["elado", "vevo", "mindketto"].includes(b.kinek) ? b.kinek : "mindketto", sz(b.megjegyzes, 500)]);
    return { id: r.rows[0].id };
}

async function iratJog(ugyfelId, id) {
    const r = await db.query("SELECT * FROM crm_iratok WHERE id = $1 AND ugyfel_id = $2", [Number(id) || 0, ugyfelId]);
    if (!r.rowCount) throw hibaKod("not_found", 404);
    return r.rows[0];
}

async function modosit(ugyfelId, id, b) {
    const i = await iratJog(ugyfelId, id);
    const statusz = STATUSZ.includes(b.statusz) ? b.statusz : i.statusz;
    const lejarat = b.lejarat === "" || b.lejarat === null ? null : (/^\d{4}-\d{2}-\d{2}$/.test(String(b.lejarat || "")) ? b.lejarat : undefined);
    await db.query(`UPDATE crm_iratok SET statusz = $2, megjegyzes = COALESCE($3, megjegyzes), lejarat = CASE WHEN $4::boolean THEN $5::date ELSE lejarat END,
                           nev = COALESCE($6, nev), updated_at = NOW() WHERE id = $1`,
        [i.id, statusz, b.megjegyzes !== undefined ? (sz(b.megjegyzes, 500) || "") : null, lejarat !== undefined, lejarat || null,
         i.kulcs ? null : sz(b.nev, 200)]);
    return { ok: true };
}

async function torol(ugyfelId, id) {
    const i = await iratJog(ugyfelId, id);
    await db.query("DELETE FROM crm_iratok WHERE id = $1", [i.id]);
    return { torolve: true };
}

// Fájl: { nev, mime, adat (base64) }
async function fajlFeltolt(ugyfelId, iratId, b, feltolto, userId) {
    const i = await iratJog(ugyfelId, iratId);
    const mime = String(b.mime || "").toLowerCase();
    if (!MIME.includes(mime)) throw hibaKod("bad_file_type");
    const buf = Buffer.from(String(b.adat || "").replace(/^data:[^,]*,/, ""), "base64");
    if (!buf.length) throw hibaKod("empty_file");
    if (buf.length > MAX_FAJL) throw hibaKod("file_too_large");
    // tartalom szerinti ellenőrzés (ne lehessen pl. HTML-t PDF-nek álcázni)
    const fej = buf.subarray(0, 12);
    const ok = (mime === "application/pdf" && fej.subarray(0, 4).toString() === "%PDF")
        || (mime === "image/jpeg" && fej[0] === 0xff && fej[1] === 0xd8)
        || (mime === "image/png" && fej[0] === 0x89 && fej.subarray(1, 4).toString() === "PNG")
        || (mime === "image/webp" && fej.subarray(8, 12).toString() === "WEBP")
        || (mime.startsWith("image/hei") && fej.subarray(4, 8).toString() === "ftyp");
    if (!ok) throw hibaKod("bad_file_type");
    const ossz = await db.query(`SELECT COALESCE(SUM(f.meret), 0)::bigint AS n FROM crm_irat_fajlok f JOIN crm_iratok i ON i.id = f.irat_id WHERE i.ugyfel_id = $1`, [ugyfelId]);
    if (Number(ossz.rows[0].n) + buf.length > MAX_UGYFEL) throw hibaKod("storage_full");
    const nev = (sz(b.nev, 160) || "irat").replace(/[\\/:*?"<>|\r\n]+/g, "_");
    const r = await db.query(`INSERT INTO crm_irat_fajlok (irat_id, nev, mime, meret, adat, feltolto, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [i.id, nev, mime, buf.length, buf, feltolto, userId || null]);
    // az ügyfél feltöltése → „beküldve” (ellenőrizni kell); az irodáé → „megvan”
    const uj = feltolto === "ugyfel" ? (i.statusz === "megvan" ? "megvan" : "bekuldve") : "megvan";
    await db.query("UPDATE crm_iratok SET statusz = $2, updated_at = NOW() WHERE id = $1", [i.id, uj]);
    return { id: r.rows[0].id, statusz: uj, irat_nev: i.nev, kulcs: i.kulcs };
}

async function fajl(ugyfelId, fajlId) {
    const r = await db.query(`
        SELECT f.nev, f.mime, f.adat FROM crm_irat_fajlok f JOIN crm_iratok i ON i.id = f.irat_id
        WHERE f.id = $1 AND i.ugyfel_id = $2`, [Number(fajlId) || 0, ugyfelId]);
    if (!r.rowCount) throw hibaKod("not_found", 404);
    return r.rows[0];
}

async function fajlTorol(ugyfelId, fajlId, csakUgyfele = false) {
    const r = await db.query(`
        DELETE FROM crm_irat_fajlok f USING crm_iratok i
        WHERE f.irat_id = i.id AND f.id = $1 AND i.ugyfel_id = $2 ${csakUgyfele ? "AND f.feltolto = 'ugyfel'" : ""} RETURNING f.irat_id`, [Number(fajlId) || 0, ugyfelId]);
    if (!r.rowCount) throw hibaKod("not_found", 404);
    // ha nem maradt fájl és csak „beküldve” volt, visszaáll „hiányzik”-ra
    await db.query(`UPDATE crm_iratok SET statusz = 'hianyzik' WHERE id = $1 AND statusz = 'bekuldve'
                    AND NOT EXISTS (SELECT 1 FROM crm_irat_fajlok WHERE irat_id = $1)`, [r.rows[0].irat_id]);
    return { torolve: true };
}

// ---------- Portál ----------

async function portalAllit(ugyfelId, mit) {
    if (mit === "ki") {
        await db.query("UPDATE crm_ugyfelek SET portal_token = NULL WHERE id = $1", [ugyfelId]);
        return { token: null };
    }
    const token = crypto.randomBytes(32).toString("hex");
    await db.query("UPDATE crm_ugyfelek SET portal_token = $2 WHERE id = $1", [ugyfelId, token]);
    return { token };
}

async function portalUgyfel(token) {
    if (!/^[a-f0-9]{64}$/.test(String(token || ""))) throw hibaKod("not_found", 404);
    const r = await db.query(`
        SELECT u.id, u.nev, u.iroda_id, ir.nev AS iroda_nev, ir.telefon AS iroda_telefon, ir.email AS iroda_email, (ir.logo IS NOT NULL) AS van_logo,
               COALESCE(us.nev, us.felhasznalonev) AS felelos_nev, us.telefon AS felelos_telefon, us.email AS felelos_email
        FROM crm_ugyfelek u LEFT JOIN irodak ir ON ir.id = u.iroda_id LEFT JOIN users us ON us.id = u.felelos_id
        WHERE u.portal_token = $1`, [token]);
    if (!r.rowCount) throw hibaKod("not_found", 404);
    return r.rows[0];
}

async function portal(token) {
    const u = await portalUgyfel(token);
    const iratok = (await lista(u.id)).filter(i => i.statusz !== "nem_kell")
        .map(({ megjegyzes, ...i }) => ({ ...i, megjegyzes }));
    return {
        ugyfel: { nev: u.nev },
        iroda: u.iroda_id ? { id: u.iroda_id, nev: u.iroda_nev, telefon: u.iroda_telefon, email: u.iroda_email, van_logo: u.van_logo } : null,
        felelos: u.felelos_nev ? { nev: u.felelos_nev, telefon: u.felelos_telefon, email: u.felelos_email } : null,
        iratok
    };
}

async function portalFeltolt(token, iratId, b) {
    const u = await portalUgyfel(token);
    const v = await fajlFeltolt(u.id, iratId, b, "ugyfel", null);
    await db.query("INSERT INTO crm_tevekenysegek (ugyfel_id, tipus, szoveg) VALUES ($1, 'rendszer', $2)", [u.id, `irat_feltoltve:${v.kulcs || ""}:${v.irat_nev}`]);
    await db.query("UPDATE crm_ugyfelek SET updated_at = NOW() WHERE id = $1", [u.id]);
    return { ok: true, statusz: v.statusz };
}

module.exports = {
    SABLON, STATUSZ, MIME, MAX_FAJL, lista, sablonbol, hozzaad, modosit, torol, fajlFeltolt, fajl, fajlTorol,
    portalAllit, portalUgyfel, portal, portalFeltolt
};
