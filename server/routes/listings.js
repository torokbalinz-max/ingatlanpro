// ============================================================
//  Hirdetések: lista, adatlap, feladás, módosítás, törlés + link beolvasása
// ============================================================

const express = require("express");
const db = require("../db/database");
const { normalize, hianyzoMezok, parseKepek, TIPUS_MEZOK } = require("../services/listing");
const { scrape } = require("../services/scraper");
const autofix = require("../services/autofix");
const quality = require("../services/quality");
const location = require("../services/location");
const districts = require("../services/districts");
const { hiba, csakAdmin, csakBelepve } = require("../lib/http");
const { LISTA_MEZOK } = require("../lib/sql");
const irodak = require("./irodak");

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

        const r = await db.query(`
            SELECT ${LISTA_MEZOK}, i.leiras, i.forras_szoveg,
                   (SELECT COALESCE(u.nev, u.felhasznalonev) FROM users u WHERE u.id = i.owner_id) AS hirdeto_nev
            FROM ingatlanok i WHERE i.id = $1`, [req.params.id]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const kepek = await db.query(
            "SELECT id FROM ingatlan_kepek WHERE ingatlan_id = $1 ORDER BY sorrend, id",
            [req.params.id]
        );

        const i = r.rows[0];

        // Ingatlanirodás hirdetés: az iroda és az ügynök elérhetősége
        let iroda = null, ugynok = null, belso = {};

        if (i.iroda_id) {

            const ir = await db.query("SELECT id, nev, telefon, email, weboldal, cim, ellenorzott FROM irodak WHERE id = $1", [i.iroda_id]);
            iroda = ir.rows[0] || null;

            if (i.ugynok_id) {
                const u = await db.query("SELECT id, nev, telefon, email, user_id IS NOT NULL AS van_fiok FROM iroda_ugynokok WHERE id = $1 AND aktiv", [i.ugynok_id]);
                ugynok = u.rows[0] || null;
            }

            // A belső adatok csak az iroda tagjainak
            if ((await irodak.jog(req, i.iroda_id)).tag) {
                const b = await db.query("SELECT iroda_mappa, iroda_megjegyzes FROM ingatlanok WHERE id = $1", [i.id]);
                belso = b.rows[0] || {};
            }

        }

        res.json({ ...i, ...belso, iroda, ugynok, kepek: kepek.rows.map(k => k.id) });

    } catch (err) {
        hiba(res, err);
    }

});

async function vannakKeruletek(varos) {
    if (!varos) return false;
    const r = await db.query("SELECT 1 FROM keruletek WHERE varos = $1 LIMIT 1", [varos]);
    return r.rowCount > 0;
}

// Szerkesztheti / törölheti-e: az admin mindent, a felhasználó a sajátját,
// az ingatlaniroda tagja az iroda hirdetéseit
async function sajatVagyAdmin(req, id) {
    const r = await db.query("SELECT id, owner_id, iroda_id FROM ingatlanok WHERE id = $1", [id]);
    if (!r.rowCount) return { nincs: true };
    if (req.szerep === "admin") return { ok: true, admin: true };
    if (req.user && r.rows[0].owner_id === req.user.id) return { ok: true, admin: false };
    if (r.rows[0].iroda_id && (await irodak.jog(req, r.rows[0].iroda_id)).tag) return { ok: true, admin: false, iroda: true };
    return { ok: false, admin: false };
}

// Az űrlap iroda-mezői (ki hirdeti: magánszemély vagy egy iroda, melyik ügynök)
//  -> null (a kérés nem küldött ilyet), vagy { iroda_id, ugynok_id, iroda_ref, iroda_mappa, iroda_megjegyzes }
async function irodaMezok(req, b) {

    if (!("iroda_id" in (b || {}))) return null;

    const irodaId = b.iroda_id ? Number(b.iroda_id) : null;
    const sz = (v, max) => (v === null || v === undefined || String(v).trim() === "") ? null : String(v).trim().slice(0, max);

    if (!irodaId) return { iroda_id: null, ugynok_id: null, iroda_ref: null, iroda_mappa: null, iroda_megjegyzes: null };

    if (!(await irodak.jog(req, irodaId)).tag) {
        const e = new Error("not_member");
        e.kod = "not_member";
        throw e;
    }

    let ugynokId = b.ugynok_id ? Number(b.ugynok_id) : null;

    if (ugynokId) {
        const u = await db.query("SELECT 1 FROM iroda_ugynokok WHERE id = $1 AND iroda_id = $2", [ugynokId, irodaId]);
        if (!u.rowCount) ugynokId = null;
    }

    // A kérésből hiányzó mező = marad a régi (undefined)
    const ha = (k, max) => (k in b ? sz(b[k], max) : undefined);

    return {
        iroda_id: irodaId,
        ugynok_id: "ugynok_id" in b ? ugynokId : undefined,
        iroda_ref: ha("iroda_ref", 40),
        iroda_mappa: ha("iroda_mappa", 60),
        iroda_megjegyzes: ha("iroda_megjegyzes", 2000)
    };

}

async function irodaMent(client, id, m) {
    if (!m) return;
    const mezok = Object.keys(m).filter(k => m[k] !== undefined);
    await client.query(
        `UPDATE ingatlanok SET ${mezok.map((k, n) => `${k} = $${n + 2}`).join(", ")} WHERE id = $1`,
        [id, ...mezok.map(k => m[k])]
    );
}

// A saját hirdetéseim (Fiókom oldal)
router.get("/api/sajat-hirdetesek", csakBelepve, async (req, res) => {
    try {
        const r = await db.query(`SELECT ${LISTA_MEZOK} FROM ingatlanok i WHERE i.owner_id = $1 ORDER BY i.id DESC`, [req.user.id]);
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }
});

// Kerület a helyből (csak ahol van kerület):
//  - pontos helynél a megrajzolt kerülethatár mindig nyer
//  - különben csak akkor töltjük ki, ha üres
async function keruletPotlas(d) {
    if (!d.varos || !(d.x && d.y)) return;
    if (!(TIPUS_MEZOK[d.tipus] || TIPUS_MEZOK.lakas).kerulet) return;
    if (["pontos", "utca"].includes(d.hely_pontossag)) {
        try {
            const k = await districts.keruletPontbol(d.varos, d.x, d.y);
            if (k) { d.kerulet = k; return; }
        } catch (e) { /* nem kritikus */ }
    }
    if (d.kerulet) return;
    try {
        d.kerulet = await quality.keruletHelybol(d.varos, d.x, d.y);
    } catch (e) { /* nem kritikus */ }
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
router.post("/api/ingatlanok", csakBelepve, async (req, res) => {

    let client;

    try {

        client = await db.connect();

        const d = normalize(req.body);
        const kepek = parseKepek(req.body.kepek);
        const iroda = await irodaMezok(req, req.body);

        await keruletPotlas(d);

        const hianyzo = hianyzoMezok(d, {
            mod: d.link ? "link" : "kezi",
            kepDb: kepek.length,
            vannakKeruletek: await vannakKeruletek(d.varos)
        });

        if (hianyzo.length) {
            return res.status(400).json({ error: "missing_fields", hianyzo });
        }

        // A térképen megjelölt hely a városban / mellette van-e
        const helyGond = await location.helyTavol(d);

        // Gyanús adatok (pl. irreális €/m²) – a hirdetés megjelenik, de az admin ellenőrzi
        const q = await quality.ertekel(d, { mod: d.link ? "link" : "kezi", kepDb: kepek.length, helyTavol: helyGond });

        await client.query("BEGIN");

        const r = await client.query(`
            INSERT INTO ingatlanok
            (link, ar, nm, arnm, szobak, emelet, allapot, eladva, x, y, varos, kerulet,
             tipus, ugylet, cim, leiras, telek_nm, statusz, forras_tipus, hely_pontossag,
             kulso_kepek, hianyzo, problemak, ellenorzott, forras_szoveg, telepules, telek_jelleg, hely_sugar,
             owner_id, hely_forras, hely_kezi)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'aktiv','kezi',$18,$19::jsonb,'[]'::jsonb,$20::jsonb,$21,$22,$23,$24,$25,
                    $26,$27,$28)
            RETURNING id
        `, [
            d.link, d.ar, d.nm, d.arnm, d.szobak, d.emelet, d.allapot, d.eladva, d.x, d.y,
            d.varos, d.kerulet, d.tipus, d.ugylet, d.cim, d.leiras, d.telek_nm, d.hely_pontossag,
            JSON.stringify(d.kulso_kepek || []), JSON.stringify(q.problemak), q.ellenorzott,
            req.body.forras_szoveg ? String(req.body.forras_szoveg).slice(0, 5000) : null,
            d.telepules, d.telek_jelleg, d.hely_sugar,
            req.user.id, d.x && d.y ? "kezi" : null, !!(d.x && d.y)
        ]);

        const id = r.rows[0].id;

        await kepeketMent(client, id, kepek);
        await irodaMent(client, id, iroda);

        await client.query("COMMIT");

        res.json({ siker: true, id });

    } catch (err) {

        if (client) await client.query("ROLLBACK").catch(() => { });
        hiba(res, err);

    } finally {

        if (client) client.release();

    }

});

// Hirdetés módosítása – az admin bármelyiket, a felhasználó a sajátját
//  body.jovahagy = true   -> függő (importált) hirdetés élesítése (csak admin)
//  body.torlendoKepek     -> törlendő képek azonosítói
//  body.kepek             -> új képek (data URL)
router.put("/api/ingatlanok/:id", csakBelepve, async (req, res) => {

    let client;

    try {

        const id = Number(req.params.id);

        const jog = await sajatVagyAdmin(req, id);
        if (jog.nincs) return res.status(404).json({ error: "not_found" });
        if (!jog.ok) return res.status(403).json({ error: "not_owner" });
        if (!jog.admin) delete req.body.jovahagy;

        client = await db.connect();

        const regi = await client.query("SELECT statusz, forras_tipus, jovahagyva, forras_kerulet, kerulet, x, y, hely_kezi, hely_forras FROM ingatlanok WHERE id = $1", [id]);

        if (!regi.rowCount) return res.status(404).json({ error: "not_found" });

        const elozo = regi.rows[0];

        const d = normalize(req.body);
        await keruletPotlas(d);
        const iroda = await irodaMezok(req, req.body);
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

        // Ha a helyet kézzel áthelyezték a térképen, az automatika többé nem mozgatja
        const helyValtozott = !!(d.x && d.y) && (Math.abs((elozo.x || 0) - d.x) > 1e-6 || Math.abs((elozo.y || 0) - d.y) > 1e-6);
        const helyKezi = helyValtozott ? true : (d.x && d.y ? !!elozo.hely_kezi : false);
        const helyForras = helyValtozott ? "kezi" : (d.x && d.y ? elozo.hely_forras : null);

        const helyGond = helyKezi || !importalt ? await location.helyTavol(d) : false;

        const q = await quality.ertekel(d, {
            mod: importalt ? "import" : (d.link ? "link" : "kezi"),
            kepDb,
            jovahagyva,
            helyTavol: helyGond && !jovahagyva
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
                problemak=$23::jsonb, ellenorzott=$24, jovahagyva=$25, telepules=$27,
                telek_jelleg=$28, hely_sugar=$29, hely_kezi=$30, hely_forras=$31, updated_at=NOW()
            WHERE id=$26
        `, [
            d.link, d.ar, d.nm, d.arnm, d.szobak, d.emelet, d.allapot, d.eladva,
            d.x, d.y, d.varos, d.kerulet, d.tipus, d.ugylet, d.cim, d.leiras,
            d.telek_nm, d.hely_pontossag, JSON.stringify(d.kulso_kepek || []), statusz,
            JSON.stringify(hianyzo), d.tovabbi_linkek ? JSON.stringify(d.tovabbi_linkek) : null,
            JSON.stringify(q.problemak), q.ellenorzott, jovahagyva, id, d.telepules, d.telek_jelleg, d.hely_sugar,
            helyKezi, helyForras
        ]);

        if (torlendo.length) {
            await client.query("DELETE FROM ingatlan_kepek WHERE ingatlan_id = $1 AND id = ANY($2::int[])", [id, torlendo]);
        }

        const max = await client.query("SELECT COALESCE(MAX(sorrend), -1) AS m FROM ingatlan_kepek WHERE ingatlan_id = $1", [id]);

        await kepeketMent(client, id, ujKepek, max.rows[0].m + 1);

        await irodaMent(client, id, iroda);

        await client.query("COMMIT");

        res.json({ siker: true, hianyzo, problemak: q.problemak, ellenorzott: q.ellenorzott, statusz });

    } catch (err) {

        if (client) await client.query("ROLLBACK").catch(() => { });
        hiba(res, err);

    } finally {

        if (client) client.release();

    }

});

router.delete("/api/ingatlanok/:id", csakBelepve, async (req, res) => {

    try {

        const jog = await sajatVagyAdmin(req, Number(req.params.id));
        if (jog.nincs) return res.json({ siker: true });
        if (!jog.ok) return res.status(403).json({ error: "not_owner" });

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

// Kerület-javaslat egy térképi pontra (az űrlapok hívják, amikor a jelölőt mozgatják)
router.get("/api/kerulet-helybol", async (req, res) => {
    try {
        const x = Number(req.query.x), y = Number(req.query.y);
        res.json({ kerulet: await quality.keruletHelybol(String(req.query.varos || ""), x, y) });
    } catch (err) {
        hiba(res, err);
    }
});

// ===================== LINK BEOLVASÁSA =====================
// Bárki használhatja az "Új ingatlan" űrlapon az adatok előtöltésére.

router.post("/api/scrape", csakBelepve, async (req, res) => {

    try {

        const url = String(req.body.url || "").trim();

        if (!/^https?:\/\//i.test(url)) {
            return res.status(400).json({ error: "bad_url" });
        }

        const d = await scrape(url);

        // A hiányzó adatok a hirdetés szövegéből: telek mérete, szobák,
        // kerület (magyar / román név), település, közelítő hely
        const v = await autofix.javaslat({
            tipus: d.tipus || req.body.tipus || "lakas", ugylet: d.ugylet || req.body.ugylet || "elado", ar: d.ar,
            varos: req.body.varos || null,
            cim: d.cim, leiras: d.leiras, forras_szoveg: d.forrasSzoveg,
            nm: d.nm, telek_nm: d.telek_nm, szobak: d.szobak, emelet: d.emelet, evszam: d.evszam,
            forras_kerulet: d.kerulet, x: d.x, y: d.y
        }, { utca: d.utca, varosForras: d.varosForras });

        ["ar", "nm", "telek_nm", "szobak", "emelet", "evszam", "telepules", "telek_jelleg", "x", "y", "hely_pontossag", "hely_sugar"].forEach(k => {
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
