// ============================================================
//  Hirdetések: lista, adatlap, feladás, módosítás, törlés + link beolvasása
// ============================================================

const express = require("express");
const db = require("../db/database");
const { normalize, hianyzoMezok, parseKepek } = require("../services/listing");
const { scrape } = require("../services/scraper");
const autofix = require("../services/autofix");
const quality = require("../services/quality");
const { hiba, csakAdmin } = require("../lib/http");
const { LISTA_MEZOK } = require("../lib/sql");

const router = express.Router();

router.get("/api/ingatlanok", async (req, res) => {

    try {

        const city = req.query.city;

        const result = city
            ? await db.query(`SELECT ${LISTA_MEZOK} FROM ingatlanok i WHERE i.varos = $1 AND i.statusz = 'aktiv' ORDER BY i.id`, [city])
            : await db.query(`SELECT ${LISTA_MEZOK} FROM ingatlanok i WHERE i.statusz = 'aktiv' ORDER BY i.id`);

        res.json(result.rows);

    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/ingatlanok/:id", async (req, res) => {

    try {

        const r = await db.query(`SELECT ${LISTA_MEZOK}, i.leiras, i.forras_szoveg FROM ingatlanok i WHERE i.id = $1`, [req.params.id]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const kepek = await db.query(
            "SELECT id FROM ingatlan_kepek WHERE ingatlan_id = $1 ORDER BY sorrend, id",
            [req.params.id]
        );

        res.json({ ...r.rows[0], kepek: kepek.rows.map(k => k.id) });

    } catch (err) {
        hiba(res, err);
    }

});

async function vannakKeruletek(varos) {
    if (!varos) return false;
    const r = await db.query("SELECT 1 FROM keruletek WHERE varos = $1 LIMIT 1", [varos]);
    return r.rowCount > 0;
}

async function kepeketMent(client, ingatlanId, kepek, kezdoSorrend = 0) {

    let sorrend = kezdoSorrend;

    for (const k of kepek) {
        await client.query(
            "INSERT INTO ingatlan_kepek (ingatlan_id, sorrend, mime, adat) VALUES ($1,$2,$3,$4)",
            [ingatlanId, sorrend++, k.mime, k.adat]
        );
    }

}

// Új hirdetés – bárki (bejelentkezve). Minden kötelező adatot ki kell tölteni.
router.post("/api/ingatlanok", async (req, res) => {

    let client;

    try {

        client = await db.connect();

        const d = normalize(req.body);
        const kepek = parseKepek(req.body.kepek);

        const hianyzo = hianyzoMezok(d, {
            mod: d.link ? "link" : "kezi",
            kepDb: kepek.length,
            vannakKeruletek: await vannakKeruletek(d.varos)
        });

        if (hianyzo.length) {
            return res.status(400).json({ error: "missing_fields", hianyzo });
        }

        // Gyanús adatok (pl. irreális €/m²) – a hirdetés megjelenik, de az admin ellenőrzi
        const q = await quality.ertekel(d, { mod: d.link ? "link" : "kezi", kepDb: kepek.length });

        await client.query("BEGIN");

        const r = await client.query(`
            INSERT INTO ingatlanok
            (link, ar, nm, arnm, szobak, emelet, allapot, eladva, x, y, varos, kerulet,
             tipus, ugylet, cim, leiras, telek_nm, statusz, forras_tipus, hely_pontossag,
             kulso_kepek, hianyzo, problemak, ellenorzott, forras_szoveg, telepules)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'aktiv','kezi',$18,$19::jsonb,'[]'::jsonb,$20::jsonb,$21,$22,$23)
            RETURNING id
        `, [
            d.link, d.ar, d.nm, d.arnm, d.szobak, d.emelet, d.allapot, d.eladva, d.x, d.y,
            d.varos, d.kerulet, d.tipus, d.ugylet, d.cim, d.leiras, d.telek_nm, d.hely_pontossag,
            JSON.stringify(d.kulso_kepek || []), JSON.stringify(q.problemak), q.ellenorzott,
            req.body.forras_szoveg ? String(req.body.forras_szoveg).slice(0, 5000) : null,
            d.telepules
        ]);

        const id = r.rows[0].id;

        await kepeketMent(client, id, kepek);

        await client.query("COMMIT");

        res.json({ siker: true, id });

    } catch (err) {

        if (client) await client.query("ROLLBACK").catch(() => { });
        hiba(res, err);

    } finally {

        if (client) client.release();

    }

});

// Hirdetés módosítása – egyelőre csak admin (a 2. verzióban a tulajdonos is)
//  body.jovahagy = true   -> függő (importált) hirdetés élesítése
//  body.torlendoKepek     -> törlendő képek azonosítói
//  body.kepek             -> új képek (data URL)
router.put("/api/ingatlanok/:id", csakAdmin, async (req, res) => {

    let client;

    try {

        client = await db.connect();

        const id = Number(req.params.id);

        const regi = await client.query("SELECT statusz, forras_tipus, jovahagyva, forras_kerulet, kerulet FROM ingatlanok WHERE id = $1", [id]);

        if (!regi.rowCount) return res.status(404).json({ error: "not_found" });

        const elozo = regi.rows[0];

        const d = normalize(req.body);
        const ujKepek = parseKepek(req.body.kepek);
        const torlendo = Array.isArray(req.body.torlendoKepek) ? req.body.torlendoKepek.map(Number).filter(Boolean) : [];

        const maradoKep = await client.query(
            "SELECT COUNT(*)::int AS n FROM ingatlan_kepek WHERE ingatlan_id = $1 AND NOT (id = ANY($2::int[]))",
            [id, torlendo]
        );

        const kepDb = maradoKep.rows[0].n + ujKepek.length;
        const importalt = elozo.forras_tipus === "import";

        let statusz = elozo.statusz;
        let jovahagyva = !!elozo.jovahagyva;

        // Jóváhagyás: az alapadatok mindenképp kellenek
        if (req.body.jovahagy) {

            const alap = hianyzoMezok(d, { mod: "import" }).filter(m => ["ar", "nm", "varos"].includes(m));

            if (alap.length) {
                return res.status(400).json({ error: "missing_fields", hianyzo: alap });
            }

            statusz = "aktiv";
            jovahagyva = true;

        }

        d.forras_kerulet = elozo.forras_kerulet;

        const q = await quality.ertekel(d, {
            mod: importalt ? "import" : (d.link ? "link" : "kezi"),
            kepDb,
            jovahagyva
        });

        const hianyzo = q.hianyzo;

        // Ha az admin kerületet rendelt egy ismeretlen forrás-környékhez,
        // megjegyezzük, hogy legközelebb magától menjen
        if (d.kerulet && elozo.forras_kerulet && d.kerulet !== elozo.kerulet) {
            await quality.aliasHozzaad(d.varos, d.kerulet, elozo.forras_kerulet);
        }

        await client.query("BEGIN");

        await client.query(`
            UPDATE ingatlanok SET
                link=$1, ar=$2, nm=$3, arnm=$4, szobak=$5, emelet=$6, allapot=$7, eladva=$8,
                x=$9, y=$10, varos=$11, kerulet=$12, tipus=$13, ugylet=$14, cim=$15, leiras=$16,
                telek_nm=$17, hely_pontossag=$18, kulso_kepek=$19::jsonb, statusz=$20,
                hianyzo=$21::jsonb, tovabbi_linkek=COALESCE($22::jsonb, tovabbi_linkek),
                problemak=$23::jsonb, ellenorzott=$24, jovahagyva=$25, telepules=$27, updated_at=NOW()
            WHERE id=$26
        `, [
            d.link, d.ar, d.nm, d.arnm, d.szobak, d.emelet, d.allapot, d.eladva,
            d.x, d.y, d.varos, d.kerulet, d.tipus, d.ugylet, d.cim, d.leiras,
            d.telek_nm, d.hely_pontossag, JSON.stringify(d.kulso_kepek || []), statusz,
            JSON.stringify(hianyzo), d.tovabbi_linkek ? JSON.stringify(d.tovabbi_linkek) : null,
            JSON.stringify(q.problemak), q.ellenorzott, jovahagyva, id, d.telepules
        ]);

        if (torlendo.length) {
            await client.query("DELETE FROM ingatlan_kepek WHERE ingatlan_id = $1 AND id = ANY($2::int[])", [id, torlendo]);
        }

        const max = await client.query("SELECT COALESCE(MAX(sorrend), -1) AS m FROM ingatlan_kepek WHERE ingatlan_id = $1", [id]);

        await kepeketMent(client, id, ujKepek, max.rows[0].m + 1);

        await client.query("COMMIT");

        res.json({ siker: true, hianyzo, problemak: q.problemak, ellenorzott: q.ellenorzott, statusz });

    } catch (err) {

        if (client) await client.query("ROLLBACK").catch(() => { });
        hiba(res, err);

    } finally {

        if (client) client.release();

    }

});

router.delete("/api/ingatlanok/:id", csakAdmin, async (req, res) => {

    try {

        await db.query("DELETE FROM favorites WHERE property_id = $1", [req.params.id]);
        await db.query("DELETE FROM ingatlanok WHERE id = $1", [req.params.id]);

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// Tömeges kerület-beállítás
router.patch("/api/ingatlanok/bulk-kerulet", csakAdmin, async (req, res) => {

    try {

        const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(n => !isNaN(n)) : [];
        const kerulet = (req.body.kerulet || "").trim();

        if (ids.length === 0) return res.status(400).json({ error: "Hiányzó ingatlan azonosítók" });
        if (!kerulet) return res.status(400).json({ error: "Hiányzó kerület" });

        await db.query("UPDATE ingatlanok SET kerulet=$1, updated_at=NOW() WHERE id = ANY($2::int[])", [kerulet, ids]);

        res.json({ siker: true, updated: ids.length });

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== LINK BEOLVASÁSA =====================
// Bárki használhatja az "Új ingatlan" űrlapon az adatok előtöltésére.

router.post("/api/scrape", async (req, res) => {

    try {

        const url = String(req.body.url || "").trim();

        if (!/^https?:\/\//i.test(url)) {
            return res.status(400).json({ error: "bad_url" });
        }

        const d = await scrape(url);

        // A hiányzó adatok a hirdetés szövegéből: telek mérete, szobák,
        // kerület (magyar / román név), település, közelítő hely
        const v = await autofix.javaslat({
            tipus: d.tipus || req.body.tipus || "lakas",
            varos: req.body.varos || null,
            cim: d.cim, leiras: d.leiras, forras_szoveg: d.forrasSzoveg,
            nm: d.nm, telek_nm: d.telek_nm, szobak: d.szobak, emelet: d.emelet, evszam: d.evszam,
            forras_kerulet: d.kerulet, x: d.x, y: d.y
        }, { utca: d.utca, varosForras: d.varosForras });

        ["nm", "telek_nm", "szobak", "emelet", "evszam", "telepules", "x", "y", "hely_pontossag"].forEach(k => {
            if (v[k] !== undefined) d[k] = v[k];
        });

        if (v.kerulet) d.keruletNev = v.kerulet;

        res.json(d);

    } catch (err) {

        console.error("Scrape hiba:", err.message);
        res.status(502).json({ error: "scrape_failed", message: err.message });

    }

});

module.exports = router;
