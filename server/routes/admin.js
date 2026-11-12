// ============================================================
//  Admin: ellenőrzés, nem elérhető hirdetések, beolvasás, figyelt oldalak, duplikátumok
// ============================================================

const express = require("express");
const db = require("../db/database");
const importer = require("../services/importer");
const duplikatumok = require("../services/duplicates");
const imagehash = require("../services/imagehash");
const ai = require("../services/ai");
const autofix = require("../services/autofix");
const quality = require("../services/quality");
const { hiba, csakAdmin } = require("../lib/http");
const csapat = require("../services/csapat");
const { LISTA_MEZOK } = require("../lib/sql");

const router = express.Router();

// Ellenőrizendő hirdetések: hiányos / gyanús adatok (és a régi "függő" importok)
router.get("/api/admin/review", csapat.csakResz("ellenorzes"), async (req, res) => {

    try {
        // Városra kapott ellenőrzési jog: csak azok a városok
        const params = [];
        const hol = csapat.reszSql(await csapat.kontextus(req), "ellenorzes", params, "i.");
        const r = await db.query(`
            SELECT ${LISTA_MEZOK}, i.forras_szoveg, i.leiras
            FROM ingatlanok i
            WHERE ((i.statusz = 'aktiv' AND NOT i.ellenorzott) OR i.statusz = 'fuggo') AND ${hol}
            ORDER BY i.id DESC
        `, params);
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }

});

// Régi név megtartása
router.get("/api/admin/pending", csapat.csakResz("ellenorzes"), (req, res) => res.redirect(307, "/api/admin/review"));

// Már nem elérhető (eladott / törölt) hirdetések
router.get("/api/admin/unavailable", csapat.csakResz("ellenorzes"), async (req, res) => {

    try {
        const params = [];
        const hol = csapat.reszSql(await csapat.kontextus(req), "ellenorzes", params, "i.");
        const r = await db.query(`SELECT ${LISTA_MEZOK} FROM ingatlanok i WHERE i.statusz = 'nem_elerheto' AND ${hol} ORDER BY i.utolso_ellenorzes DESC NULLS LAST`, params);
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }

});

// A naptár számlálója: lezáratlan (elmúlt) megtekintések + várólista
async function naptarSzamlalo(req) {
    const k = await csapat.kontextus(req);
    const params = [];
    const hol = csapat.hatokorSql(k, "megtekintes", params, { varos: "m.varos", tipus: "m.tipus", megbizas: "m.id", ingatlan: "m.ingatlan_id" });
    params.push(req.user ? req.user.id : 0);
    const r = await db.query(`
        SELECT COUNT(*)::int AS n FROM megbizas_megtekintesek t JOIN megbizasok m ON m.id = t.megbizas_id
        WHERE (${hol} OR COALESCE(t.bemutato_id, m.bemutato_id) = $${params.length})
          AND m.statusz IN ('hirdetes', 'targyalas', 'adasvetel')
          AND ((t.statusz = 'egyeztetve' AND t.idopont < NOW() - INTERVAL '1 hour') OR t.statusz = 'kert')`, params);
    return r.rows[0].n;
}

router.get("/api/admin/counts", csapat.csakPanel, async (req, res) => {

    try {
        // A városra kapott ellenőrzési jognál a számlálók is csak azokra a városokra
        const kk = await csapat.kontextus(req);
        const hp = [];
        let hol = csapat.reszSql(kk, "ellenorzes", hp);
        if (hol === "FALSE") hol = "TRUE";
        const r = await db.query(`
            SELECT
                COUNT(*) FILTER (WHERE (statusz = 'aktiv' AND NOT ellenorzott) OR statusz = 'fuggo')::int AS review,
                COUNT(*) FILTER (WHERE statusz = 'nem_elerheto')::int AS unavailable,
                COUNT(*) FILTER (WHERE statusz = 'aktiv')::int AS aktiv,
                COUNT(*) FILTER (WHERE statusz = 'aktiv' AND ellenorzott)::int AS ellenorzott,
                COUNT(*) FILTER (WHERE statusz = 'aktiv' AND forras_tipus = 'kezi')::int AS kezi,
                COUNT(*) FILTER (WHERE statusz = 'aktiv' AND (jsonb_array_length(COALESCE(kulso_kepek, '[]'::jsonb)) > 0
                    OR EXISTS (SELECT 1 FROM ingatlan_kepek k WHERE k.ingatlan_id = ingatlanok.id)))::int AS fotos,
                COUNT(DISTINCT varos) FILTER (WHERE statusz = 'aktiv')::int AS varosok,
                COUNT(*) FILTER (WHERE statusz IN ('aktiv', 'fuggo') AND tipus IN ('lakas', 'haz', 'kereskedelmi', 'iroda')
                    AND COALESCE(TRIM(allapot), '') = '')::int AS allapot_hianyzo,
                COUNT(*) FILTER (WHERE statusz IN ('aktiv', 'fuggo') AND NOT COALESCE(hely_kezi, false)
                    AND (x IS NULL OR y IS NULL OR COALESCE(hely_pontossag, 'nincs') IN ('kozelito', 'nincs'))
                    AND NOT (hely_eredeti IS NOT NULL AND hely_eredeti->>'ok' IS NOT NULL
                             AND COALESCE((hely_eredeti->>'elfogadva')::boolean, false) = false))::int AS hely_pontatlan,
                COUNT(*) FILTER (WHERE statusz IN ('aktiv', 'fuggo') AND NOT COALESCE(hely_kezi, false)
                    AND (x IS NULL OR y IS NULL OR COALESCE(hely_pontossag, 'nincs') = 'nincs')
                    AND NOT (hely_eredeti IS NOT NULL AND hely_eredeti->>'ok' IS NOT NULL
                             AND COALESCE((hely_eredeti->>'elfogadva')::boolean, false) = false))::int AS hely_nincs,
                MAX(utolso_ellenorzes) AS utolso_ellenorzes
            FROM ingatlanok
            WHERE ${hol}
        `, hp);

        const w = await db.query("SELECT COUNT(*)::int AS figyelt, MAX(utolso_futas) AS utolso_futas FROM figyelt_oldalak");
        const ir = await db.query("SELECT COUNT(*) FILTER (WHERE statusz = 'fuggo')::int AS iroda_fuggo, COUNT(*)::int AS iroda_osszes FROM irodak");

        // Város és környéke: ennyi bizonytalan hirdetésről kell dönteni
        const kornyek = await require("../services/kornyek").javaslatDb().catch(() => 0);

        // Új tartalom-bejelentések, a hely-ellenőrzés áthelyezései, reklámok
        const egyeb = await db.query(`
            SELECT
                (SELECT COUNT(*) FROM bejelentesek b WHERE b.statusz = 'uj'
                    AND (${hol === "TRUE" ? "TRUE" : `EXISTS (SELECT 1 FROM ingatlanok WHERE ingatlanok.id = b.ingatlan_id AND ${hol})`}))::int AS bejelentes_uj,
                (SELECT COUNT(*) FROM ingatlanok WHERE hely_eredeti IS NOT NULL AND hely_eredeti->>'ok' IS NOT NULL
                    AND COALESCE((hely_eredeti->>'elfogadva')::boolean, false) = false AND NOT COALESCE(hely_kezi, false)
                    AND statusz IN ('aktiv', 'fuggo') AND ${hol})::int AS hely_athelyezett
        `, hp).catch(() => ({ rows: [{}] }));
        // A hely-ellenőrzés teendője: áthelyezett + egyáltalán nincs a térképen
        egyeb.rows[0].hely_teendo = (egyeb.rows[0].hely_athelyezett || 0) + (r.rows[0].hely_nincs || 0);

        const reklam = require("../services/reklam");
        const reklamFut = (await reklam.aktivak().catch(() => [])).length;
        const reklamLejaro = (await reklam.lejarok(7).catch(() => [])).length;
        const reklamKeres = await require("../services/reklamKeres").ujDb().catch(() => 0);

        // Pénzügyek: lejárt díjbekérők, esedékes előfizetések
        const penzugy = await require("../services/penzugy").szamlalok();

        // Eladjuk helyetted: új megbízások, új ajánlatok, kért megtekintések
        const megbizasUj = await require("../services/megbizas").szamlalo(req);
        // A megtekintési naptár: lezárandó megtekintések és várólista (a hatókörben)
        const naptarDb = await naptarSzamlalo(req).catch(() => 0);
        // Irattár: lejáró (30 napon belül) és lejárt szerződések
        const irat = await require("../services/irattar").teendok();
        // e-Factura: elküldendő számlák (5 munkanap), sürgősek, elutasítottak
        const ef = await require("../services/efacturaSpv").szamlalok().catch(() => ({}));

        res.json({
            ...r.rows[0], ...w.rows[0], ...ir.rows[0], ...egyeb.rows[0], ...penzugy,
            kornyek_javaslat: kornyek, megbizas_uj: megbizasUj, naptar_teendo: naptarDb, reklam_fut: reklamFut, reklam_lejaro: reklamLejaro, reklam_keres_uj: reklamKeres, ai: ai.elerheto(),
            szerzodes_lejaro: irat.lejaro, szerzodes_lejart: irat.lejart, szerzodes_teendo: (irat.lejaro || 0) + (irat.lejart || 0),
            efactura_kuldendo: ef.kuldendo || 0, efactura_surgos: ef.surgos || 0, efactura_elutasitva: ef.elutasitva || 0,
            efactura_teendo: (ef.surgos || 0) + (ef.elutasitva || 0)
        });
    } catch (err) {
        hiba(res, err);
    }

});

// Gyors jóváhagyás (az adatok rendben vannak)
router.post("/api/admin/review/:id/approve", csapat.csakResz("ellenorzes"), csapat.csakHirdetesen("ellenorzes"), async (req, res) => {

    try {

        const r = await db.query(
            `UPDATE ingatlanok SET jovahagyva = true, ellenorzott = true, statusz = 'aktiv', updated_at = NOW()
             WHERE id = $1 AND ar > 0 AND nm > 0
             RETURNING id`,
            [req.params.id]
        );

        if (!r.rowCount) return res.status(400).json({ error: "missing_fields", hianyzo: ["ar", "nm"] });

        res.json({ siker: true });

    } catch (err) {
        hiba(res, err);
    }

});

// Nem elérhető hirdetés visszaállítása (ha tévedés volt)
router.post("/api/admin/unavailable/:id/restore", csapat.csakResz("ellenorzes"), csapat.csakHirdetesen("ellenorzes"), async (req, res) => {

    try {
        await db.query("UPDATE ingatlanok SET statusz = 'aktiv', updated_at = NOW() WHERE id = $1", [req.params.id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }

});

// Egy hirdetés azonnali újraolvasása a forrásoldalról
// A beolvasás joga az egész oldalra szól; a városra kapott ellenőrzés csak a saját városaiban
async function frissitesJog(req, res, next) {
    try {
        if (req.szerep === "admin" || csapat.globalis(await csapat.kontextus(req), "beolvasas")) return next();
        return csapat.csakHirdetesen("ellenorzes")(req, res, next);
    } catch (err) { next(err); }
}

router.post("/api/admin/listing/:id/refresh", csapat.csakResz("ellenorzes", "beolvasas"), frissitesJog, async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM ingatlanok WHERE id = $1", [req.params.id]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        if (!r.rows[0].link) return res.status(400).json({ error: "no_link" });

        const job = importer.ujJob("egy");
        await importer.frissitForrasbol(r.rows[0], job);

        res.json({ siker: true, naplo: job.naplo });

    } catch (err) {
        hiba(res, err);
    }

});

// Meglévő hirdetések ellenőrzése a forrásoldalon (háttérben)
//  varos: csak ennek a városnak (és a "<város> és környéke" városnak) a hirdetései – mind,
//  a város Imoradar24-listája a végéig, utána a még hiányzó eredeti linkek keresése
//  Városra kapott ellenőrzési / beolvasási joggal a saját városára is indítható
router.post("/api/admin/recheck", csapat.csakVarosra("ellenorzes", "beolvasas"), async (req, res) => {

    try {

        const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : null;
        const varosok = req.body.varos ? await importer.varosCsoport(req.body.varos) : null;
        const limit = varosok ? null : Math.min(Number(req.body.limit) || 100, 2000);

        const job = importer.figyelesIndit({ ids, limit, varosok });

        res.json({ jobId: job.id, varosok });

    } catch (err) {
        hiba(res, err);
    }

});

// AI-ellenőrzés (ha be van állítva az ANTHROPIC_API_KEY)
router.post("/api/admin/ai-check/:id", csapat.csakResz("ellenorzes"), csapat.csakHirdetesen("ellenorzes"), async (req, res) => {

    try {

        if (!ai.elerheto()) return res.status(400).json({ error: "no_api_key" });

        const r = await db.query("SELECT * FROM ingatlanok WHERE id = $1", [req.params.id]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        res.json(await ai.ellenoriz(r.rows[0]));

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== AUTOMATIKUS JAVÍTÁS =====================
// A hirdetések szövegéből kitölti a hiányzó adatokat (telek mérete, szobák,
// kerület, település, közelítő hely...), és újraértékeli, mit kell még
// kézzel ellenőrizni.

router.post("/api/admin/autofix", csapat.csakVarosra("beolvasas"), async (req, res) => {
    try {
        const varosok = req.body.varos ? await importer.varosCsoport(req.body.varos) : null;
        const j = autofix.indit({ mind: req.body.mind !== false, varosok });
        res.json(autofix.allapot() || { allapot: j.allapot });
    } catch (err) {
        hiba(res, err);
    }
});

router.get("/api/admin/autofix", csapat.csakResz("beolvasas"), async (req, res) => {
    try {
        res.json({ ...(autofix.allapot() || {}), utolso: await autofix.beallitas("autofix_v" + autofix.VERZIO) });
    } catch (err) {
        hiba(res, err);
    }
});

// ===================== KERÜLET-PÁROSÍTÁS =====================
// A forrásoldalak környék-nevei, amelyekhez még nem tartozik kerület
// (lakás, üzlet, iroda). Egy kattintással hozzárendelhetők – ilyenkor
// az összes ilyen nevű hirdetés megkapja a kerületet, és a név
// megjegyződik (legközelebb magától megy).

router.get("/api/admin/unmatched-areas", csapat.csakResz("helyek"), async (req, res) => {

    try {
        const r = await db.query(`
            SELECT varos, forras_kerulet AS nev, COUNT(*)::int AS db
            FROM ingatlanok
            WHERE statusz IN ('aktiv', 'fuggo') AND (kerulet IS NULL OR kerulet = '')
              AND forras_kerulet IS NOT NULL AND forras_kerulet <> ''
              AND COALESCE(tipus, 'lakas') IN ('lakas', 'kereskedelmi', 'iroda')
            GROUP BY varos, forras_kerulet
            ORDER BY varos, db DESC, forras_kerulet
        `);
        const n = await db.query(`
            SELECT varos, COUNT(*)::int AS db FROM ingatlanok
            WHERE statusz IN ('aktiv', 'fuggo') AND (kerulet IS NULL OR kerulet = '')
              AND COALESCE(tipus, 'lakas') IN ('lakas', 'kereskedelmi', 'iroda')
            GROUP BY varos
        `);
        res.json({ nevek: r.rows, keruletNelkul: n.rows });
    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/admin/unmatched-areas/assign", csapat.csakResz("helyek"), async (req, res) => {

    try {

        const varos = String(req.body.varos || "").trim();
        const forras = String(req.body.nev || "").trim();
        let kerulet = String(req.body.kerulet || "").trim();

        if (!varos || !forras) return res.status(400).json({ error: "bad_request" });

        // Új kerület a forrás nevéből (román név), ha kérik
        if (!kerulet && req.body.uj) {
            const nevHu = String(req.body.ujNev || "").trim() || forras;
            await db.query(
                `INSERT INTO keruletek (varos, nev, nev_ro) VALUES ($1,$2,$3) ON CONFLICT (varos, nev) DO NOTHING`,
                [varos, nevHu, forras]
            );
            kerulet = nevHu;
        }

        if (!kerulet) return res.status(400).json({ error: "bad_request" });

        await quality.aliasHozzaad(varos, kerulet, forras);

        const r = await db.query(`
            UPDATE ingatlanok SET kerulet = $1, updated_at = NOW()
            WHERE varos = $2 AND forras_kerulet = $3 AND (kerulet IS NULL OR kerulet = '')
              AND COALESCE(tipus, 'lakas') IN ('lakas', 'kereskedelmi', 'iroda')
            RETURNING id`,
            [kerulet, varos, forras]
        );

        res.json({ frissitett: r.rowCount });

    } catch (err) {
        hiba(res, err);
    }

});

// Az Imoradar24-re mutató hirdetések: az eredeti link megkeresése most (és mi lett az eredmény)
router.post("/api/admin/forraslinkek", csapat.csakVarosra("ellenorzes", "beolvasas"), async (req, res) => {
    try {
        const varosok = req.body && req.body.varos ? await importer.varosCsoport(req.body.varos) : null;
        res.json(await require("../services/forrasHely").javitMind({ limit: varosok ? 5000 : 1000, varosok }));
    } catch (err) { hiba(res, err); }
});

// Duplikátumok
router.get("/api/admin/duplicates", csapat.csakGlobalis("ellenorzes"), async (req, res) => {

    try {
        const v = await duplikatumok.keres();
        // a felül kiválasztott város (Admin → Város): csak az ottani csoportok
        const mv = (await csapat.kontextus(req)).munkaVaros;
        if (!mv) return res.json(v);
        const nevek = new Set([mv, ...(await db.query("SELECT nev FROM varosok WHERE anyavaros = $1", [mv])).rows.map(x => x.nev)]);
        res.json({ ...v, valoszinu: (v.valoszinu || []).filter(g => (g.tagok || []).some(t => nevek.has(t.varos))) });
    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/admin/duplicates/clean", csapat.csakGlobalis("ellenorzes"), async (req, res) => {

    try {
        res.json(await duplikatumok.biztosTorlese());
    } catch (err) {
        hiba(res, err);
    }

});

// Több csoport összevonása egyszerre: { csoportok: [{ megtart, torlendo: [...] }] }
router.post("/api/admin/duplicates/merge-bulk", csapat.csakGlobalis("ellenorzes"), async (req, res) => {
    try {
        const cs = Array.isArray(req.body.csoportok) ? req.body.csoportok.slice(0, 500) : [];
        if (!cs.length) return res.status(400).json({ error: "bad_request" });
        res.json(await duplikatumok.tomegesOsszevon(cs));
    } catch (err) {
        hiba(res, err);
    }
});

// "Nem ugyanaz" – a csoport tagjai között (vagy egy tag kivétele a csoportból)
router.post("/api/admin/duplicates/ignore", csapat.csakGlobalis("ellenorzes"), async (req, res) => {
    try {
        const ids = (req.body.ids || []).map(Number).filter(Boolean);
        if (ids.length < 2) return res.status(400).json({ error: "bad_request" });
        if (req.body.kivesz) return res.json(await duplikatumok.kivesz(Number(req.body.kivesz), ids));
        res.json(await duplikatumok.kizar(ids));
    } catch (err) {
        hiba(res, err);
    }
});

// A képek ujjlenyomatának elkészítése (háttérben)
router.post("/api/admin/duplicates/images", csapat.csakGlobalis("ellenorzes"), (req, res) => {
    const j = imagehash.indit(Math.min(Number(req.body.limit) || 400, 2000));
    if (!j) return res.status(400).json({ error: "sharp_missing" });
    res.json(imagehash.allapot());
});

router.get("/api/admin/duplicates/images", csapat.csakGlobalis("ellenorzes"), async (req, res) => {
    try {
        res.json({ ...(imagehash.allapot() || {}), hianyzik: await imagehash.hianyzoSzam(), elerheto: imagehash.elerheto() });
    } catch (err) {
        hiba(res, err);
    }
});

// Hibás alapadatú hirdetések törlése (a kijelölt azonosítók)
router.post("/api/admin/invalid/delete", csapat.csakGlobalis("ellenorzes"), async (req, res) => {

    try {

        const ids = (req.body.ids || []).map(Number).filter(Boolean);

        if (!ids.length) return res.status(400).json({ error: "bad_request" });

        await db.query("DELETE FROM favorites WHERE property_id = ANY($1::int[])", [ids]);
        const r = await db.query("DELETE FROM ingatlanok WHERE id = ANY($1::int[])", [ids]);

        res.json({ torolt: r.rowCount });

    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/admin/duplicates/merge", csapat.csakGlobalis("ellenorzes"), async (req, res) => {

    try {

        const megtart = Number(req.body.megtart);
        const torlendo = (req.body.torlendo || []).map(Number).filter(n => n && n !== megtart);

        if (!megtart || !torlendo.length) return res.status(400).json({ error: "bad_request" });

        res.json(await duplikatumok.osszevon(megtart, torlendo));

    } catch (err) {
        hiba(res, err);
    }

});

// ===================== FORRÁSOK: közvetlen beolvasás, fő oldal =====================
//  Melyik oldalakat olvassuk közvetlenül (OLX, Storia), a fő oldal sorrendje (ha egy
//  ingatlan több oldalon is fent van, kattintásra melyik nyíljon meg), és városonként
//  az aktív hirdetések forrásai + a legutóbbi sikeres közvetlen beolvasás ideje.

router.get("/api/admin/forrasok", csapat.csakResz("beolvasas"), async (req, res) => {
    try {
        const forrasSorrend = require("../services/forrasSorrend");
        const csak = await csapat.varosai(req, "beolvasas");
        const params = [];
        let szuro = "";
        if (csak) { params.push(csak); szuro = "AND (i.varos = ANY($1::text[]) OR i.varos_eredeti = ANY($1::text[]) OR i.varos IN (SELECT nev FROM varosok WHERE anyavaros = ANY($1::text[])))"; }
        const r = await db.query(`
            SELECT COALESCE(v.anyavaros, i.varos) AS varos,
                   CASE WHEN i.link ~* 'imoradar24\\.ro/' THEN 'imoradar24'
                        WHEN i.link ~* 'olx\\.ro/' THEN 'olx'
                        WHEN i.link ~* 'storia\\.ro/' THEN 'storia'
                        WHEN i.link ~* 'imobiliare\\.ro/' THEN 'imobiliare'
                        WHEN i.link ~* 'publi24\\.ro/' THEN 'publi24'
                        WHEN i.forras_tipus = 'import' THEN 'egyeb'
                        ELSE 'sajat' END AS forras,
                   COUNT(*)::int AS db,
                   COUNT(*) FILTER (WHERE jsonb_typeof(i.tovabbi_linkek) = 'array' AND jsonb_array_length(i.tovabbi_linkek) > 0)::int AS tobb_oldalon
            FROM ingatlanok i LEFT JOIN varosok v ON v.nev = i.varos
            WHERE i.statusz = 'aktiv' ${szuro}
            GROUP BY 1, 2 ORDER BY 1, 2`, params);
        res.json({
            beallitas: await forrasSorrend.olvas(),
            oldalak: forrasSorrend.OLDALAK,
            kozvetlenLehet: forrasSorrend.KOZVETLEN_LEHET,
            kesz: await forrasSorrend.keszIdok(),
            frissOra: forrasSorrend.FRISS_ORA,
            varosonkent: r.rows,
            csakVarosok: csak,
            modosithat: req.szerep === "admin" || csapat.globalis(await csapat.kontextus(req), "beolvasas")
        });
    } catch (err) {
        hiba(res, err);
    }
});

router.put("/api/admin/forrasok", csapat.csakGlobalis("beolvasas"), async (req, res) => {
    try {
        const forrasSorrend = require("../services/forrasSorrend");
        const adat = await forrasSorrend.ment(req.body || {});
        // az új sorrend a meglévő (több oldalon is fent lévő) hirdetéseken is
        const atirt = req.body && req.body.alkalmaz === false ? 0 : await forrasSorrend.alkalmaz();
        res.json({ siker: true, adat, atirt });
    } catch (err) {
        hiba(res, err);
    }
});

// ===================== A VÁROS FORRÁSAI (figyelt oldalak) =====================
//  services/forrasLista.js – típusonként az OLX, Storia, Imoradar24 (+ saját) linkek,
//  futtatás soronként / városra / mindenre, link-ellenőrzés és -javítás

const forrasLista = require("../services/forrasLista");

// A sor városára van-e joga (városra kapott beolvasási joggal csak a sajátjain)
async function sorJog(req, res, next) {
    try {
        const r = await db.query("SELECT varos FROM figyelt_oldalak WHERE id = $1", [Number(req.params.id) || 0]);
        if (!r.rowCount) return res.status(404).json({ error: "not_found" });
        if (await csapat.varosJog(req, "beolvasas", r.rows[0].varos)) return next();
        res.status(403).json({ error: "not_in_scope" });
    } catch (err) { next(err); }
}

router.get("/api/admin/forraslista", csapat.csakVarosra("beolvasas"), async (req, res) => {
    try {
        const varos = String(req.query.varos || "").trim();
        if (!varos) return res.status(400).json({ error: "no_city" });
        const forrasSorrend = require("../services/forrasSorrend");
        const idok = await forrasSorrend.keszIdok();
        res.json({
            varos,
            sorok: await forrasLista.lista(varos),
            csoportok: forrasLista.CSOPORTOK,
            futo: forrasLista.futoJob(),
            beallitas: await forrasSorrend.olvas(),
            utolsoKozvetlen: { olx: forrasSorrend.utolsoIdo(idok, "olx", varos), storia: forrasSorrend.utolsoIdo(idok, "storia", varos) },
            modosithat: req.szerep === "admin" || csapat.globalis(await csapat.kontextus(req), "beolvasas")
        });
    } catch (err) { hiba(res, err); }
});

router.post("/api/admin/forraslista", csapat.csakVarosra("beolvasas"), async (req, res) => {
    try { res.json(await forrasLista.hozzaad(req.body || {})); }
    catch (err) { if (err.kod) return res.status(400).json({ error: err.kod }); hiba(res, err); }
});

router.put("/api/admin/forraslista/:id", csapat.csakResz("beolvasas"), sorJog, async (req, res) => {
    try { res.json(await forrasLista.modosit(req.params.id, req.body || {})); }
    catch (err) { if (err.kod) return res.status(400).json({ error: err.kod }); hiba(res, err); }
});

router.post("/api/admin/forraslista/:id/alap", csapat.csakResz("beolvasas"), sorJog, async (req, res) => {
    try { res.json(await forrasLista.alapra(req.params.id)); } catch (err) { hiba(res, err); }
});

router.delete("/api/admin/forraslista/:id", csapat.csakResz("beolvasas"), sorJog, async (req, res) => {
    try { await forrasLista.torol(req.params.id); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// Futtatás: { ids } egy-egy sor, { varos[, tipus, ugylet] } egy város (csoport), { mind: true } minden város
router.post("/api/admin/forraslista/futtat", csapat.csakResz("beolvasas"), async (req, res) => {
    try {
        const b = req.body || {};
        const k = await csapat.kontextus(req);
        const globalis = req.szerep === "admin" || csapat.globalis(k, "beolvasas");
        if (b.mind && !globalis) return res.status(403).json({ error: "admin_only" });
        if (b.varos && !(await csapat.varosJog(req, "beolvasas", b.varos))) return res.status(403).json({ error: "not_in_scope" });
        const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(Boolean) : null;
        if (ids && !globalis) {
            const r = await db.query("SELECT DISTINCT varos FROM figyelt_oldalak WHERE id = ANY($1::int[])", [ids]);
            for (const x of r.rows) if (!(await csapat.varosJog(req, "beolvasas", x.varos))) return res.status(403).json({ error: "not_in_scope" });
        }
        if (!ids && !b.varos && !b.mind) return res.status(400).json({ error: "bad_request" });
        const job = forrasLista.futtat({ ids, varos: b.varos || null, tipus: b.tipus || null, ugylet: b.ugylet || null, mind: !!b.mind });
        res.json({ jobId: job.id });
    } catch (err) { hiba(res, err); }
});

// Egy (vagy több) város közvetlen beolvasása most: OLX + Storia (háttérben, a napló az
// /api/admin/import/:id-n). csakMeglevo: csak a meglévők frissítése / levétele.
router.post("/api/admin/kozvetlen", csapat.csakVarosra("beolvasas"), async (req, res) => {
    try {
        const varos = String(req.body.varos || "").trim();
        if (!varos) return res.status(400).json({ error: "no_city" });
        const anya = (await require("../services/kornyek").anyaVarosa(varos).catch(() => null)) || varos;
        const job = importer.kozvetlenIndit([anya], { csakMeglevo: !!req.body.csakMeglevo });
        res.json({ jobId: job.id, varos: anya });
    } catch (err) {
        hiba(res, err);
    }
});

// Tömeges beolvasás linkekről
router.post("/api/admin/import", csapat.csakVarosra("beolvasas"), async (req, res) => {

    try {

        const urls = String(req.body.urls || "")
            .split(/\s+/)
            .map(u => u.trim())
            .filter(u => /^https?:\/\//i.test(u))
            .slice(0, 100);

        if (!urls.length) return res.status(400).json({ error: "no_urls" });

        const varos = String(req.body.varos || "").trim();

        if (!varos) return res.status(400).json({ error: "no_city" });

        const job = importer.indit(urls, {
            varos,
            tipus: req.body.tipus || "lakas",
            ugylet: req.body.ugylet || "elado",
            // Kerület szintű beolvasás: minden hirdetés ebbe a kerületbe kerül
            kerulet: String(req.body.kerulet || "").trim().slice(0, 100) || null
        });

        res.json({ jobId: job.id });

    } catch (err) {
        hiba(res, err);
    }

});

router.get("/api/admin/import/:id", csapat.csakResz("beolvasas", "ellenorzes"), (req, res) => {

    const j = importer.allapot(req.params.id);

    if (!j) return res.status(404).json({ error: "not_found" });

    res.json(j);

});

// Figyelt oldalak
router.get("/api/admin/watch", csapat.csakGlobalis("beolvasas"), async (req, res) => {

    try {
        const r = await db.query("SELECT * FROM figyelt_oldalak ORDER BY id");
        res.json(r.rows);
    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/admin/watch", csapat.csakGlobalis("beolvasas"), async (req, res) => {

    try {

        const url = String(req.body.url || "").trim();
        const varos = String(req.body.varos || "").trim();

        if (!/^https?:\/\//i.test(url) || !varos) return res.status(400).json({ error: "bad_request" });

        const r = await db.query(
            `INSERT INTO figyelt_oldalak (url, nev, varos, tipus, ugylet) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [url, String(req.body.nev || "").trim() || null, varos, req.body.tipus || "lakas", req.body.ugylet || "elado"]
        );

        res.json(r.rows[0]);

    } catch (err) {
        hiba(res, err);
    }

});

router.delete("/api/admin/watch/:id", csapat.csakGlobalis("beolvasas"), async (req, res) => {

    try {
        await db.query("DELETE FROM figyelt_oldalak WHERE id = $1", [req.params.id]);
        res.json({ siker: true });
    } catch (err) {
        hiba(res, err);
    }

});

router.post("/api/admin/watch/:id/run", csapat.csakGlobalis("beolvasas"), async (req, res) => {

    try {

        const r = await db.query("SELECT * FROM figyelt_oldalak WHERE id = $1", [req.params.id]);

        if (!r.rowCount) return res.status(404).json({ error: "not_found" });

        const f = r.rows[0];

        const job = importer.indit([f.url], { varos: f.varos, tipus: f.tipus, ugylet: f.ugylet });

        // A végén az eredményt elmentjük a figyelt oldalhoz
        job.promise.then(j => db.query(
            "UPDATE figyelt_oldalak SET utolso_futas = NOW(), utolso_eredmeny = $1 WHERE id = $2",
            [`${j.uj} új, ${j.frissitett} árváltozás, ${j.kihagyott} már megvolt, ${j.hibak} hiba`, f.id]
        )).catch(err => console.error(err));

        res.json({ jobId: job.id });

    } catch (err) {
        hiba(res, err);
    }

});

module.exports = router;
