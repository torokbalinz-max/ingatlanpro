// ============================================================
//  Csapat és jogosultságok
//
//   Admin → Csapat és jogosultságok:
//     GET    /api/admin/csapat                 a munkatársak és hozzáféréseik
//     GET    /api/admin/csapat/keres?q=        felhasználó keresése (hozzáadáshoz)
//     POST   /api/admin/csapat                 munkatárs hozzáadása
//     PUT    /api/admin/csapat/:id             szerep, aktív, hozzáférések
//     DELETE /api/admin/csapat/:id
//
//   A munkatárs (Munkaterületem, #munka):
//     GET    /api/csapat/en                    mit tudok (jogok, hatókörök)
//     GET    /api/csapat/hirdetesek            a hatókörömbe tartozó hirdetések
//     GET    /api/csapat/hirdetesek/:id/kepek  egy hirdetés fotói
//     PUT    /api/csapat/hirdetesek/:id/kepek  fotók: új, törlés, sorrend
//   (A megbízások: routes/megbizas.js – /api/ertekesites/...)
// ============================================================

const express = require("express");
const db = require("../db/database");
const csapat = require("../services/csapat");
const level = require("../services/megbizasLevel");
const { parseKepek } = require("../services/listing");
const { hiba, csakAdmin, csakBelepve } = require("../lib/http");

const router = express.Router();

// ===================== ADMIN =====================

router.get("/api/admin/csapat", csakAdmin, async (req, res) => {
    try {
        res.json({
            tagok: await csapat.lista(),
            jogok: csapat.JOGOK, hatokorok: csapat.HATOKOROK, szerepek: csapat.SZEREPEK, szerep_jogok: csapat.SZEREP_JOGOK
        });
    } catch (err) { hiba(res, err); }
});

router.get("/api/admin/csapat/keres", csakAdmin, async (req, res) => {
    try { res.json(await csapat.felhasznaloKeres(req.query.q)); } catch (err) { hiba(res, err); }
});

router.post("/api/admin/csapat", csakAdmin, async (req, res) => {
    try {
        const v = await csapat.hozzaad(req.body || {}, req.user && req.user.id);
        res.json({ siker: true, ...v });
        level.munkatarsnak(req, v.user_id, "Bekerültél az IngatlanPro csapatába / Ai fost adăugat în echipa IngatlanPro", [
            "Az admin munkatársként hozzáadott. Belépés után a menüben a „Munkaterületem” oldalon látod, mihez férsz hozzá.",
            "Administratorul te-a adăugat ca membru al echipei. După autentificare, pagina „Spațiul meu de lucru” arată la ce ai acces."
        ], "/#munka").catch(() => { });
    } catch (err) { hiba(res, err); }
});

router.put("/api/admin/csapat/:id", csakAdmin, async (req, res) => {
    try { await csapat.ment(req.params.id, req.body || {}); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/csapat/:id", csakAdmin, async (req, res) => {
    try { await csapat.torol(req.params.id); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// ===================== A MUNKATÁRS =====================

router.get("/api/csapat/en", csakBelepve, async (req, res) => {
    try {
        const o = await csapat.osszegzes(req);
        if (!o) return res.json({ tag: false, admin: req.szerep === "admin" });
        res.json({ tag: true, ...o });
    } catch (err) { hiba(res, err); }
});

// A hatókörömbe tartozó hirdetések (fotók / szerkesztés)
router.get("/api/csapat/hirdetesek", csakBelepve, async (req, res) => {
    try {
        const k = await csapat.kontextus(req);
        if (!k.admin && !csapat.vanJoga(k, "kepek")) return res.status(403).json({ error: "forbidden" });
        const params = [];
        const hol = [csapat.hatokorSql(k, "kepek", params, { varos: "i.varos", tipus: "i.tipus", megbizas: "i.megbizas_id", ingatlan: "i.id" })];
        hol.push("COALESCE(i.statusz, '') <> 'tiltott'");
        const q = String(req.query.q || "").trim();
        if (q) {
            params.push("%" + q.replace(/[%_]/g, "") + "%");
            const n = Number(q.replace("#", ""));
            hol.push(`(i.cim ILIKE $${params.length} OR i.leiras ILIKE $${params.length}${n ? ` OR i.id = ${Math.floor(n)}` : ""})`);
        }
        if (req.query.varos) { params.push(String(req.query.varos)); hol.push(`i.varos = $${params.length}`); }
        if (req.query.tipus) { params.push(String(req.query.tipus)); hol.push(`i.tipus = $${params.length}`); }
        if (req.query.foto === "nincs") hol.push("NOT EXISTS (SELECT 1 FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id)");
        if (req.query.megbizas === "1") hol.push("i.megbizas_id IS NOT NULL");
        const r = await db.query(`
            SELECT i.id, i.cim, i.varos, i.kerulet, i.telepules, i.tipus, i.ugylet, i.ar, i.nm, i.szobak, i.statusz, i.megbizas_id,
                   i.owner_id, i.updated_at, i.link,
                   (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id)::int AS kep_db,
                   (SELECT k.id FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id ORDER BY k.sorrend, k.id LIMIT 1) AS elso_kep,
                   jsonb_array_length(COALESCE(i.kulso_kepek, '[]'::jsonb)) AS kulso_db
            FROM ingatlanok i
            WHERE ${hol.join(" AND ")}
            ORDER BY (i.megbizas_id IS NOT NULL) DESC, i.updated_at DESC NULLS LAST, i.id DESC
            LIMIT 300`, params);
        res.json(r.rows.map(i => ({
            ...i,
            jog: {
                kepek: csapat.szabad(k, "kepek", { varos: i.varos, tipus: i.tipus, ingatlan_id: i.id, megbizas_id: i.megbizas_id }),
                hirdetes: csapat.szabad(k, "hirdetes", { varos: i.varos, tipus: i.tipus, ingatlan_id: i.id, megbizas_id: i.megbizas_id })
            }
        })));
    } catch (err) { hiba(res, err); }
});

router.get("/api/csapat/hirdetesek/:id/kepek", csakBelepve, async (req, res) => {
    try {
        const id = Number(req.params.id) || 0;
        if (!(await csapat.hirdetesJog(req, id, "kepek"))) return res.status(403).json({ error: "forbidden" });
        const i = (await db.query("SELECT id, cim, varos, tipus, kulso_kepek FROM ingatlanok WHERE id = $1", [id])).rows[0];
        if (!i) return res.status(404).json({ error: "not_found" });
        const k = await db.query("SELECT id FROM ingatlan_kepek WHERE ingatlan_id = $1 ORDER BY sorrend, id", [id]);
        res.json({ ...i, kepek: k.rows.map(x => x.id), jog: { kepek: true, hirdetes: await csapat.hirdetesJog(req, id, "hirdetes") } });
    } catch (err) { hiba(res, err); }
});

// Fotók: { uj: [data URL], torol: [kép id], sorrend: [kép id, ...] }
router.put("/api/csapat/hirdetesek/:id/kepek", csakBelepve, async (req, res) => {
    let client;
    try {
        const id = Number(req.params.id) || 0;
        if (!(await csapat.hirdetesJog(req, id, "kepek"))) return res.status(403).json({ error: "forbidden" });
        const b = req.body || {};
        const uj = parseKepek(b.uj);
        const torol = Array.isArray(b.torol) ? b.torol.map(Number).filter(Boolean) : [];
        const sorrend = Array.isArray(b.sorrend) ? b.sorrend.map(Number).filter(Boolean) : [];

        const most = await db.query("SELECT COUNT(*)::int AS n FROM ingatlan_kepek WHERE ingatlan_id = $1 AND NOT (id = ANY($2::int[]))", [id, torol]);
        if (most.rows[0].n + uj.length > 60) return res.status(400).json({ error: "too_many_photos" });

        client = await db.connect();
        await client.query("BEGIN");
        if (torol.length) await client.query("DELETE FROM ingatlan_kepek WHERE ingatlan_id = $1 AND id = ANY($2::int[])", [id, torol]);
        // A megadott sorrend (a többi utánuk, a régi sorrendben)
        if (sorrend.length) {
            for (let n = 0; n < sorrend.length; n++) {
                await client.query("UPDATE ingatlan_kepek SET sorrend = $3 WHERE id = $1 AND ingatlan_id = $2", [sorrend[n], id, n]);
            }
            await client.query(`UPDATE ingatlan_kepek SET sorrend = sorrend + 1000 WHERE ingatlan_id = $1 AND NOT (id = ANY($2::int[]))`, [id, sorrend]);
        }
        const max = await client.query("SELECT COALESCE(MAX(sorrend), -1) AS m FROM ingatlan_kepek WHERE ingatlan_id = $1", [id]);
        let s = Number(max.rows[0].m) + 1;
        for (const k of uj) {
            await client.query("INSERT INTO ingatlan_kepek (ingatlan_id, sorrend, mime, adat) VALUES ($1,$2,$3,$4)", [id, s++, k.mime, k.adat]);
        }
        const db2 = await client.query("SELECT COUNT(*)::int AS n FROM ingatlan_kepek WHERE ingatlan_id = $1", [id]);
        // Ha már van fotó, a „hiányzó: képek” jelzés lekerül
        if (db2.rows[0].n > 0) await client.query("UPDATE ingatlanok SET hianyzo = COALESCE(hianyzo, '[]'::jsonb) - 'kepek', updated_at = NOW() WHERE id = $1", [id]);
        else await client.query("UPDATE ingatlanok SET updated_at = NOW() WHERE id = $1", [id]);
        const mb = await client.query("SELECT megbizas_id FROM ingatlanok WHERE id = $1", [id]);
        if (mb.rows[0] && mb.rows[0].megbizas_id && (uj.length || torol.length)) {
            await client.query(`INSERT INTO megbizas_naplo (megbizas_id, tipus, szoveg, lathato_eladonak, created_by) VALUES ($1, 'jegyzet', $2, false, $3)`,
                [mb.rows[0].megbizas_id, `Fotók: +${uj.length} új, −${torol.length} törölve (összesen ${db2.rows[0].n})`, req.user.id]);
        }
        await client.query("COMMIT");
        const k = await db.query("SELECT id FROM ingatlan_kepek WHERE ingatlan_id = $1 ORDER BY sorrend, id", [id]);
        res.json({ siker: true, kepek: k.rows.map(x => x.id), elutasitva: (Array.isArray(b.uj) ? b.uj.length : 0) - uj.length });
    } catch (err) {
        if (client) await client.query("ROLLBACK").catch(() => { });
        hiba(res, err);
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
