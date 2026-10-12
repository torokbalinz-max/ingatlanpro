// ============================================================
//  Eladjuk helyetted – megbízásos értékesítés: útvonalak
//
//   Nyilvános:   /api/megbizas/ajanlat, POST /api/megbizas (megbízás leadása)
//   Az eladó:    /api/megbizas/sajat/...  (Fiókom → Megbízásaim)
//   A vevő:      /api/megbizas/hirdetes/:ingatlanId/... (a hirdetés kártyája)
//   Az asztal:   /api/ertekesites/megbizasok/... – az admin és a jogosult
//                munkatárs (Admin → Megbízások, Munkaterületem)
//   Bemutató:    /api/csapat/megtekintesek
//   Beállítások: /api/admin/megbizas-beallitas
//
//  A munka: services/megbizas.js; levelek: services/megbizasLevel.js;
//  időzített automatizmusok: services/megbizasAuto.js
// ============================================================

const express = require("express");
const mb = require("../services/megbizas");
const csapat = require("../services/csapat");
const level = require("../services/megbizasLevel");
const pu = require("../services/penzugy");
const oldalAdatok = require("../services/oldalAdatok");
const db = require("../db/database");
const { hiba, csakAdmin, csakBelepve } = require("../lib/http");

const router = express.Router();

const STATUSZ_NEV = {
    uj: "Új megbízás / Mandat nou", egyeztetes: "Egyeztetés / Discuții", szerzodes: "Szerződés aláírva / Contract semnat",
    fotozas: "Fotózás / Fotografiere", hirdetes: "Hirdetés kint van / Anunț publicat", targyalas: "Tárgyalás / Negociere",
    eladva: "Eladva / Vândut", lezarva: "Lezárva / Închis", elutasitva: "Nem vállaltuk / Respins"
};

const ip = req => req.ip || (req.socket && req.socket.remoteAddress) || "";

// Háttérben futó értesítés – a hiba nem akadályozza a választ
const hatter = (fn) => { Promise.resolve().then(fn).catch(e => console.error("Megbízás értesítés:", e.message)); };

async function megbizasSor(id) {
    return (await db.query("SELECT * FROM megbizasok WHERE id = $1", [Number(id) || 0])).rows[0];
}

// ===================== NYILVÁNOS =====================

router.get("/api/megbizas/ajanlat", async (req, res) => {
    try { res.json(await mb.ajanlat()); } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas", csakBelepve, async (req, res) => {
    try {
        const v = await mb.letrehoz(req.user, req.body || {});
        res.json({ siker: true, ...v });
        const b = req.body || {};
        hatter(async () => {
            const m = await megbizasSor(v.id);
            const be = await mb.beallitas();
            await level.csapatnak(req, m, `Új megbízás: ${v.szam}`, [
                `${b.nev || "–"} (${b.telefon || ""} ${b.email || ""}) megbízott minket: ${b.ugylet === "kiado" ? "kiadás" : "eladás"}, ${b.tipus || ""}, ${b.varos || ""} ${b.cim || ""}`,
                b.kert_ar ? `Elképzelt ár: ${b.kert_ar}` : "",
                b.elerhetoseg ? `Mikor hívható: ${b.elerhetoseg}` : "",
                "Vedd fel vele a kapcsolatot az egyeztetéshez."
            ]);
            if (be.auto_visszaigazolas) {
                await level.eladonak(req, m, `Megkaptuk a megbízásod / Am primit mandatul tău (${v.szam})`, [
                    "Köszönjük! Hamarosan (legkésőbb 1 munkanapon belül) felhívunk, és megbeszéljük a részleteket.",
                    "A megbízás állapotát, a szerződést és az üzeneteinket a fiókodban, a Megbízásaim részen látod.",
                    "Mulțumim! Te sunăm în curând (cel târziu într-o zi lucrătoare). Starea mandatului, contractul și mesajele le găsești în cont, la Mandatele mele."
                ]);
            }
        });
    } catch (err) { hiba(res, err); }
});

// ===================== AZ ELADÓ =====================

router.get("/api/megbizas/sajat", csakBelepve, async (req, res) => {
    try { res.json(await mb.sajatLista(req.user)); } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/sajat/:id/ajanlat/:aid/valasz", csakBelepve, async (req, res) => {
    try {
        const v = await mb.eladoValasz(req.user, req.params.id, req.params.aid, req.body || {});
        res.json({ siker: true, statusz: v.statusz });
        hatter(async () => {
            const m = v.megbizas;
            const a = v.ajanlat;
            await level.csapatnak(req, m, `Az eladó válaszolt az ajánlatra (${m.szerzodes_szam})`, [
                `Ajánlat: ${level.penz(a.osszeg, a.penznem)} → ${v.statusz}${v.ellen ? ` (ellenajánlat: ${level.penz(v.ellen, a.penznem)})` : ""}`,
                v.uzenet ? `„${v.uzenet}”` : "",
                v.statusz === "ellenajanlat" && !v.ellenVevonek ? "Az ellenajánlat jóváhagyásra vár – a megbízás Ajánlatok fülén továbbíthatod a vevőnek." : ""
            ], "ajanlatok");
            const e = a.erdeklodo_id ? (await db.query("SELECT nev, email FROM megbizas_erdeklodok WHERE id = $1", [a.erdeklodo_id])).rows[0] : null;
            if (v.statusz === "elfogadva") {
                level.vevonek(req, m, e, "Elfogadták az ajánlatodat! / Oferta ta a fost acceptată!", [
                    `Az eladó elfogadta a ${level.penz(a.osszeg, a.penznem)} összegű ajánlatodat. Hamarosan keresünk a következő lépésekkel (előszerződés, közjegyző).`,
                    `Vânzătorul a acceptat oferta ta de ${level.penz(a.osszeg, a.penznem)}. Te contactăm în curând cu pașii următori (antecontract, notar).`
                ]);
            } else if (v.statusz === "elutasitva") {
                level.vevonek(req, m, e, "Válasz az ajánlatodra / Răspuns la oferta ta", [
                    `Az eladó most nem fogadta el a ${level.penz(a.osszeg, a.penznem)} összegű ajánlatot. Új ajánlatot a hirdetés oldalán tehetsz.`,
                    `Vânzătorul nu a acceptat oferta de ${level.penz(a.osszeg, a.penznem)}. Poți face o ofertă nouă pe pagina anunțului.`
                ]);
            } else if (v.statusz === "ellenajanlat" && v.ellenVevonek) {
                level.vevonek(req, m, e, "Ellenajánlatot kaptál / Ai primit o contraofertă", [
                    `Az eladó ellenajánlata: ${level.penz(v.ellen, a.penznem)}. A hirdetés oldalán elfogadhatod, vagy új ajánlatot tehetsz.`,
                    `Contraoferta vânzătorului: ${level.penz(v.ellen, a.penznem)}. O poți accepta pe pagina anunțului sau poți face o ofertă nouă.`
                ]);
            }
        });
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/sajat/:id/visszavon", csakBelepve, async (req, res) => {
    try {
        const m = await mb.sajatVisszavon(req.user, req.params.id);
        res.json({ siker: true });
        hatter(() => level.csapatnak(req, m, `Visszavont megbízás: ${m.szerzodes_szam}`, [`${m.nev || ""} visszavonta a megbízást.`]));
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/sajat/:id/uzenet", csakBelepve, async (req, res) => {
    try {
        const m = await mb.sajatUzenet(req.user, req.params.id, (req.body || {}).szoveg);
        res.json({ siker: true });
        hatter(() => level.csapatnak(req, m, `Üzenet az eladótól (${m.szerzodes_szam})`, [
            `${m.nev || "Az eladó"}: „${String((req.body || {}).szoveg || "").slice(0, 1500)}”`
        ], "uzenetek"));
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/sajat/:id/olvasva", csakBelepve, async (req, res) => {
    try { await mb.sajatOlvasott(req.user, req.params.id); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/sajat/:id/szerzodes-elfogad", csakBelepve, async (req, res) => {
    try {
        if (!(req.body && req.body.elfogad)) return res.status(400).json({ error: "must_accept" });
        const m = await mb.szerzodesElfogad(req.user, req.params.id, ip(req));
        res.json({ siker: true });
        hatter(() => level.csapatnak(req, m, `Az eladó elfogadta a szerződést (${m.szerzodes_szam})`, [
            `${m.nev || "Az eladó"} online elfogadta a megbízási szerződést.`,
            "Következő lépés: a papír aláírása (ha kell), a fotózás és a hirdetés."
        ], "szerzodes"));
    } catch (err) { hiba(res, err); }
});

// A szerződés (tervezet) – az eladó a sajátját, az admin és a jogosult munkatárs
router.get("/api/megbizas/:id/szerzodes", csakBelepve, async (req, res) => {
    try {
        let m = await mb.sajatMegbizas(req.user, req.params.id);
        if (!m && await csapat.megbizasJog(req, req.params.id, "megbizas_lat")) m = await megbizasSor(req.params.id);
        if (!m) return res.status(404).send("Nincs ilyen megbízás / Mandat inexistent");
        res.set("Content-Type", "text/html; charset=utf-8");
        res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:");
        res.send(await szerzodesHtml(m));
    } catch (err) { hiba(res, err); }
});

// ===================== A VEVŐ (megbízásos hirdetés) =====================

router.get("/api/megbizas/hirdetes/:id", async (req, res) => {
    try { res.json(await mb.vevoAllapot(req.user, req.params.id)); } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/hirdetes/:id/keres", csakBelepve, async (req, res) => {
    try {
        const v = await mb.vevoKeres(req.user, req.params.id, req.body || {});
        res.json({ siker: true, megbizas_id: v.megbizas_id, erdeklodo_id: v.erdeklodo_id, tipus: v.tipus, tovabbitva: v.tovabbitva });
        const b = req.body || {};
        hatter(async () => {
            const m = v.megbizas;
            const be = await mb.beallitas();
            const e = v.erdeklodo;
            await level.csapatnak(req, m,
                v.tipus === "ajanlat" ? `Új vételi ajánlat (${m.szerzodes_szam})` : v.tipus === "megtekintes" ? `Megtekintési kérés (${m.szerzodes_szam})` : `Kérdés egy megbízásos hirdetésről (${m.szerzodes_szam})`, [
                    `${e.nev || ""} (${e.telefon || ""} ${e.email || ""}) – ${level.hely(m)}`,
                    v.tipus === "ajanlat" ? `Ajánlat: ${level.penz(v.osszeg, b.penznem === "RON" ? "RON" : "EUR")}${v.tovabbitva ? " – automatikusan továbbítva az eladónak" : " – jóváhagyásra vár"}` : "",
                    b.javasolt ? `Javasolt időpont: ${b.javasolt}` : "",
                    b.uzenet ? `„${String(b.uzenet).slice(0, 500)}”` : ""
                ], v.tipus === "ajanlat" ? "ajanlatok" : v.tipus === "megtekintes" ? "megtekintesek" : "uzenetek");
            if (be.auto_visszaigazolas) {
                level.vevonek(req, m, e,
                    v.tipus === "ajanlat" ? "Megkaptuk az ajánlatodat / Am primit oferta ta" : v.tipus === "megtekintes" ? "Megkaptuk a megtekintési kérésed / Am primit cererea de vizionare" : "Megkaptuk a kérdésed / Am primit întrebarea ta", [
                        v.tipus === "ajanlat" ? "Az ajánlatodat továbbítjuk az eladónak; a válaszát a hirdetés oldalán és e-mailben is megkapod."
                            : v.tipus === "megtekintes" ? "Hamarosan jelentkezünk egy időponttal. Az egyeztetett időpontot a hirdetés oldalán is látod."
                                : "Hamarosan válaszolunk – a választ a hirdetés oldalán, az üzeneteknél látod.",
                        v.tipus === "ajanlat" ? "Transmitem oferta vânzătorului; răspunsul îl vei vedea pe pagina anunțului și pe e-mail."
                            : v.tipus === "megtekintes" ? "Revenim în curând cu o oră. Ora stabilită o vezi și pe pagina anunțului."
                                : "Îți răspundem în curând – răspunsul îl găsești pe pagina anunțului, la mesaje."
                    ]);
            }
            if (v.tipus === "ajanlat" && v.tovabbitva) {
                await level.eladonak(req, m, `Vételi ajánlat érkezett / Ai primit o ofertă (${m.szerzodes_szam})`, [
                    `Ajánlat: ${level.penz(v.osszeg, b.penznem === "RON" ? "RON" : "EUR")}${b.feltetelek ? ` – ${b.feltetelek}` : ""}`,
                    "A fiókodban elfogadhatod, elutasíthatod, vagy ellenajánlatot tehetsz. / Poți accepta, refuza sau face o contraofertă în cont."
                ]);
            }
            if (v.tipus === "megtekintes" && m.bemutato_id) {
                level.munkatarsnak(req, m.bemutato_id, `Megtekintési kérés: ${level.hely(m)}`, [
                    `${e.nev || "Egy vevő"} megtekintést kér${b.javasolt ? ` (${b.javasolt})` : ""}.`,
                    "Az időpontot a megbízás felelőse / az admin egyezteti."
                ], "/#munka/megtekintesek");
            }
        });
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/hirdetes/:id/uzenet", csakBelepve, async (req, res) => {
    try {
        const v = await mb.vevoUzenet(req.user, req.params.id, req.body || {});
        res.json({ siker: true });
        hatter(() => level.csapatnak(req, v.megbizas, `Üzenet egy vevőtől (${v.megbizas.szerzodes_szam})`, [
            `${v.erdeklodo.nev || "Vevő"}: „${String((req.body || {}).szoveg || "").slice(0, 1500)}”`
        ], "uzenetek"));
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/hirdetes/:id/ajanlat/:aid/elfogad", csakBelepve, async (req, res) => {
    try {
        const v = await mb.vevoEllenElfogad(req.user, req.params.id, req.params.aid);
        res.json({ siker: true });
        hatter(async () => {
            const a = v.ajanlat;
            await level.csapatnak(req, v.megbizas, `A vevő elfogadta az ellenajánlatot (${v.megbizas.szerzodes_szam})`, [
                `Megállapodás: ${level.penz(a.ellenajanlat, a.penznem)}. Következő lépés: előszerződés, közjegyző.`
            ], "ajanlatok");
            await level.eladonak(req, v.megbizas, `Megállapodás: ${level.penz(a.ellenajanlat, a.penznem)} / Acord`, [
                `A vevő elfogadta az ellenajánlatodat (${level.penz(a.ellenajanlat, a.penznem)}). Hamarosan keresünk a következő lépésekkel.`,
                `Cumpărătorul a acceptat contraoferta ta (${level.penz(a.ellenajanlat, a.penznem)}). Te contactăm în curând.`
            ]);
        });
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/hirdetes/:id/ajanlat/:aid/visszavon", csakBelepve, async (req, res) => {
    try {
        const v = await mb.vevoAjanlatVisszavon(req.user, req.params.id, req.params.aid);
        res.json({ siker: true });
        hatter(async () => {
            await level.csapatnak(req, v.megbizas, `Visszavont ajánlat (${v.megbizas.szerzodes_szam})`, [`${level.penz(v.ajanlat.osszeg, v.ajanlat.penznem)}`], "ajanlatok");
            if (v.ajanlat.tovabbitva_at) await level.eladonak(req, v.megbizas, "A vevő visszavonta az ajánlatát / Oferta a fost retrasă", [
                `${level.penz(v.ajanlat.osszeg, v.ajanlat.penznem)} – a vevő visszavonta. / retrasă de cumpărător.`
            ]);
        });
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/hirdetes/:id/megtekintes/:tid/lemond", csakBelepve, async (req, res) => {
    try {
        const v = await mb.vevoMegtekintesLemond(req.user, req.params.id, req.params.tid);
        res.json({ siker: true });
        hatter(async () => {
            const t = v.megtekintes;
            const ido = t.idopont ? level.idoSzoveg(t.idopont) : "";
            await level.csapatnak(req, v.megbizas, `Lemondott megtekintés (${v.megbizas.szerzodes_szam})`, [`A vevő lemondta a megtekintést${ido ? ": " + ido : ""}.`], "megtekintesek");
            if (t.idopont) await level.eladonak(req, v.megbizas, `Elmarad a megtekintés: ${ido} / Vizionare anulată`, [`A ${ido} időpontra egyeztetett megtekintés elmarad. / Vizionarea de la ${ido} a fost anulată.`]);
            const bem = t.bemutato_id || v.megbizas.bemutato_id;
            if (bem && t.idopont) level.munkatarsnak(req, bem, `Elmarad: ${ido} – ${level.hely(v.megbizas)}`, ["A vevő lemondta a megtekintést."], "/#munka/megtekintesek");
        });
    } catch (err) { hiba(res, err); }
});

// ===================== AZ ÉRTÉKESÍTÉSI ASZTAL (admin + munkatárs) =====================

// Jogosultság: jog = megbizas_lat (olvasás) | megbizas (kezelés) | admin
function asztal(jog) {
    return async (req, res, next) => {
        try {
            if (!req.user) return res.status(401).json({ error: "login_required" });
            if (jog === "admin") {
                if (req.szerep !== "admin") return res.status(403).json({ error: "admin_only" });
            } else {
                const ok = req.params.id
                    ? await csapat.megbizasJog(req, req.params.id, jog)
                    : csapat.vanJoga(await csapat.kontextus(req), jog);
                if (!ok) return res.status(403).json({ error: "forbidden" });
            }
            req.mbJog = { admin: req.szerep === "admin" };
            next();
        } catch (err) { hiba(res, err); }
    };
}

const ASZTAL = "/api/ertekesites/megbizasok";

router.get(ASZTAL, asztal("megbizas_lat"), async (req, res) => {
    try { res.json(await mb.lista(req)); } catch (err) { hiba(res, err); }
});

router.get(ASZTAL + "/:id", asztal("megbizas_lat"), async (req, res) => {
    try {
        const m = await mb.reszlet(req, req.params.id);
        if (!m) return res.status(404).json({ error: "not_found" });
        res.json(m);
    } catch (err) { hiba(res, err); }
});

router.put(ASZTAL + "/:id", asztal("megbizas"), async (req, res) => {
    try {
        const v = await mb.ment(req.params.id, req.body || {}, req.user.id, req.mbJog);
        res.json({ siker: true, ujStatusz: v.ujStatusz });
        hatter(async () => {
            const m = await megbizasSor(v.id);
            if (v.ujStatusz && v.ujStatusz !== "uj") {
                await level.eladonak(req, m, `Megbízásod állapota: ${STATUSZ_NEV[v.ujStatusz] || v.ujStatusz}`, [
                    `${m.szerzodes_szam}: ${STATUSZ_NEV[v.ujStatusz] || v.ujStatusz}`,
                    v.ujStatusz === "hirdetes" && m.ingatlan_id ? "A hirdetésed elkészült és kint van – a fiókodban megnézheted. / Anunțul tău este publicat." : "",
                    v.ujStatusz === "eladva" ? "Gratulálunk! Köszönjük a bizalmat. / Felicitări! Mulțumim pentru încredere." : "",
                    "A részleteket a fiókodban látod. / Detaliile le găsești în contul tău."
                ]);
            }
            // Eladás: a többi vevő értesítése
            if (v.lezart) {
                v.lezart.ajanlatok.forEach(x => level.vevonek(req, m, x, "Az ingatlan elkelt / Proprietatea a fost vândută", [
                    "Köszönjük az ajánlatodat – az ingatlan időközben elkelt. Ha hasonlót keresel, nézd meg a többi hirdetést, vagy add fel a keresésed („Keresek”).",
                    "Mulțumim pentru ofertă – proprietatea a fost vândută între timp."
                ]));
                v.lezart.megtekintesek.forEach(x => level.vevonek(req, m, x, "Elmarad a megtekintés – az ingatlan elkelt / Vizionare anulată", [
                    "Sajnos a megtekintés elmarad: az ingatlan időközben elkelt.",
                    "Din păcate vizionarea se anulează: proprietatea a fost vândută."
                ]));
            }
            // Hozzárendelés: a munkatárs értesítése
            for (const h of v.hozzarendelve) {
                const mint = { felelos_id: "felelős (értékesítő)", fotos_id: "fotós", bemutato_id: "bemutató" }[h.szerep];
                level.munkatarsnak(req, h.user_id, `Új feladat: ${m.szerzodes_szam} – ${mint}`, [
                    `Hozzád rendeltük ${mint}ként: ${level.hely(m)}.`,
                    "A részleteket a Munkaterületeden látod."
                ], h.szerep === "felelos_id" ? `/#munka/megbizasok/${m.id}` : h.szerep === "bemutato_id" ? "/#munka/megtekintesek" : "/#munka/hirdetesek");
            }
        });
    } catch (err) { hiba(res, err); }
});

router.post(ASZTAL + "/:id/naplo", asztal("megbizas"), async (req, res) => {
    try {
        await mb.naploHozzaad(req.params.id, req.body || {}, req.user.id);
        res.json({ siker: true });
        if (req.body && req.body.lathato_eladonak) {
            hatter(async () => {
                const m = await megbizasSor(req.params.id);
                if (m) await level.eladonak(req, m, `Új bejegyzés a megbízásodhoz (${m.szerzodes_szam})`, [String(req.body.szoveg || "").slice(0, 2000)]);
            });
        }
    } catch (err) { hiba(res, err); }
});

// Üzenet az eladónak (erdeklodo_id nélkül) vagy egy vevőnek
router.post(ASZTAL + "/:id/uzenet", asztal("megbizas"), async (req, res) => {
    try {
        const b = req.body || {};
        const id = Number(req.params.id);
        const eid = Number(b.erdeklodo_id) || null;
        let erd = null;
        if (eid) {
            erd = (await db.query("SELECT * FROM megbizas_erdeklodok WHERE id = $1 AND megbizas_id = $2", [eid, id])).rows[0];
            if (!erd) return res.status(404).json({ error: "not_found" });
        }
        await mb.uzenetIr(id, eid, "ki", req.user.id, b.szoveg);
        await mb.olvasott(id, eid, "csapat");
        res.json({ siker: true });
        hatter(async () => {
            const m = await megbizasSor(id);
            const szoveg = String(b.szoveg || "").slice(0, 2000);
            if (erd) level.vevonek(req, m, erd, "Üzenet az IngatlanPro-tól / Mesaj de la IngatlanPro", [szoveg, "Válaszolni a hirdetés oldalán tudsz. / Poți răspunde pe pagina anunțului."]);
            else await level.eladonak(req, m, `Üzenet a megbízásodhoz (${m.szerzodes_szam}) / Mesaj nou`, [szoveg, "Válaszolni a fiókodban, a Megbízásaim részen tudsz. / Poți răspunde în cont, la Mandatele mele."]);
        });
    } catch (err) { hiba(res, err); }
});

router.post(ASZTAL + "/:id/olvasva", asztal("megbizas_lat"), async (req, res) => {
    try {
        await mb.olvasott(Number(req.params.id), Number((req.body || {}).erdeklodo_id) || null, "csapat");
        res.json({ siker: true });
    } catch (err) { hiba(res, err); }
});

router.post(ASZTAL + "/:id/szerzodes-kuld", asztal("admin"), async (req, res) => {
    try {
        const m = await mb.szerzodesKuld(Number(req.params.id), req.user.id);
        res.json({ siker: true });
        hatter(() => level.eladonak(req, m, `A megbízási szerződésed / Contractul tău de intermediere (${m.szerzodes_szam})`, [
            "Elkészült a megbízási szerződés. A fiókodban (Megbízásaim) elolvashatod, kinyomtathatod, és egy kattintással elfogadhatod.",
            "Contractul de intermediere este gata. În cont (Mandatele mele) îl poți citi, tipări și accepta cu un clic."
        ]));
    } catch (err) { hiba(res, err); }
});

// Ajánlat: tovabbit (az eladónak) | elutasit | ellen_tovabbit (a vevőnek)
router.post(ASZTAL + "/:id/ajanlatok/:aid/:muvelet", asztal("megbizas"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const muvelet = req.params.muvelet;
        const a = await mb.ajanlatMuvelet(id, req.params.aid, muvelet, req.user.id);
        res.json({ siker: true });
        hatter(async () => {
            const m = await megbizasSor(id);
            const e = a.erdeklodo_id ? (await db.query("SELECT nev, email FROM megbizas_erdeklodok WHERE id = $1", [a.erdeklodo_id])).rows[0] : null;
            if (muvelet === "tovabbit") {
                await level.eladonak(req, m, `Vételi ajánlat érkezett / Ai primit o ofertă (${m.szerzodes_szam})`, [
                    `Ajánlat: ${level.penz(a.osszeg, a.penznem)}${a.feltetelek ? ` – ${a.feltetelek}` : ""}`,
                    "A fiókodban elfogadhatod, elutasíthatod, vagy ellenajánlatot tehetsz. / Poți accepta, refuza sau face o contraofertă în cont."
                ]);
            } else if (muvelet === "ellen_tovabbit") {
                level.vevonek(req, m, e, "Ellenajánlatot kaptál / Ai primit o contraofertă", [
                    `Az eladó ellenajánlata: ${level.penz(a.ellenajanlat, a.penznem)}. A hirdetés oldalán elfogadhatod, vagy új ajánlatot tehetsz.`,
                    `Contraoferta vânzătorului: ${level.penz(a.ellenajanlat, a.penznem)}. O poți accepta pe pagina anunțului sau poți face o ofertă nouă.`
                ]);
            } else if (muvelet === "elutasit" && (req.body || {}).ertesit) {
                level.vevonek(req, m, e, "Válasz az ajánlatodra / Răspuns la oferta ta", [
                    `A ${level.penz(a.osszeg, a.penznem)} összegű ajánlatot most nem tudjuk elfogadni. Új ajánlatot a hirdetés oldalán tehetsz.`,
                    `Oferta de ${level.penz(a.osszeg, a.penznem)} nu poate fi acceptată acum. Poți face o ofertă nouă pe pagina anunțului.`
                ]);
            }
        });
    } catch (err) { hiba(res, err); }
});

const ALRESZ = { erdeklodok: mb.erdeklodoMent, megtekintesek: mb.megtekintesMent, ajanlatok: mb.ajanlatMent };

router.post(ASZTAL + "/:id/:resz", asztal("megbizas"), async (req, res, next) => {
    const fn = ALRESZ[req.params.resz];
    if (!fn) return next();
    try {
        const id = await fn(Number(req.params.id), null, req.body || {});
        res.json({ siker: true, id });
        hatter(() => utanaErtesit(req, req.params.resz, Number(req.params.id), id, null));
    } catch (err) { hiba(res, err); }
});

router.put(ASZTAL + "/:id/:resz/:rid", asztal("megbizas"), async (req, res, next) => {
    const fn = ALRESZ[req.params.resz];
    if (!fn) return next();
    try {
        const elozo = req.params.resz === "ajanlatok"
            ? (await db.query("SELECT statusz FROM megbizas_ajanlatok WHERE id = $1", [Number(req.params.rid)])).rows[0]
            : req.params.resz === "megtekintesek"
                ? (await db.query("SELECT statusz, idopont FROM megbizas_megtekintesek WHERE id = $1", [Number(req.params.rid)])).rows[0]
                : null;
        const id = await fn(Number(req.params.id), Number(req.params.rid), req.body || {});
        res.json({ siker: true, id });
        hatter(() => utanaErtesit(req, req.params.resz, Number(req.params.id), id, elozo));
    } catch (err) { hiba(res, err); }
});

router.delete(ASZTAL + "/:id/:resz/:rid", asztal("admin"), async (req, res) => {
    try { await mb.torol(req.params.resz, req.params.id, req.params.rid); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// Értesítések: továbbított ajánlat (az eladónak), egyeztetett megtekintés (mindenkinek)
async function utanaErtesit(req, resz, megbizasId, id, elozo) {
    const m = await megbizasSor(megbizasId);
    if (!m) return;
    if (resz === "ajanlatok") {
        const a = (await db.query("SELECT * FROM megbizas_ajanlatok WHERE id = $1", [id])).rows[0];
        if (a && a.statusz === "tovabbitva" && (!elozo || elozo.statusz !== "tovabbitva")) {
            await mb.naploIr(m.id, "ajanlat", `Vételi ajánlat érkezett: ${a.osszeg} ${a.penznem}`, true, req.user && req.user.id);
            await level.eladonak(req, m, `Vételi ajánlat érkezett / Ai primit o ofertă (${m.szerzodes_szam})`, [
                `Ajánlat: ${level.penz(a.osszeg, a.penznem)}${a.feltetelek ? ` – ${a.feltetelek}` : ""}`,
                "A fiókodban elfogadhatod, elutasíthatod, vagy ellenajánlatot tehetsz. / Poți accepta, refuza sau face o contraofertă în cont."
            ]);
        }
    }
    if (resz === "megtekintesek") {
        const t = (await db.query("SELECT * FROM megbizas_megtekintesek WHERE id = $1", [id])).rows[0];
        const ujIdopont = t && t.idopont && (!elozo || String(elozo.idopont) !== String(t.idopont) || elozo.statusz !== "egyeztetve");
        if (t && t.statusz === "egyeztetve" && ujIdopont) {
            const ido = level.idoSzoveg(t.idopont);
            await mb.naploIr(m.id, "megtekintes", `Megtekintés egyeztetve: ${ido}`, true, req.user && req.user.id);
            await level.eladonak(req, m, `Megtekintés: ${ido} / Vizionare: ${ido}`, [
                `Egy érdeklődő megnézi az ingatlant: ${ido}.`,
                `Un cumpărător interesat vine la vizionare: ${ido}.`
            ]);
            const e = t.erdeklodo_id ? (await db.query("SELECT nev, email FROM megbizas_erdeklodok WHERE id = $1", [t.erdeklodo_id])).rows[0] : null;
            level.vevonek(req, m, e, `Megtekintés időpontja: ${ido} / Ora vizionării`, [
                `Várunk: ${level.hely(m)} – ${ido}.`,
                "Ha mégsem érsz rá, a hirdetés oldalán lemondhatod.",
                `Te așteptăm: ${level.hely(m)} – ${ido}. Dacă nu poți ajunge, anulează pe pagina anunțului.`
            ]);
            const bem = t.bemutato_id || m.bemutato_id;
            if (bem) level.munkatarsnak(req, bem, `Bemutatás: ${ido} – ${level.hely(m)}`, [
                `Megtekintés: ${ido}`, `Cím: ${level.hely(m)}`, e ? `Vevő: ${e.nev || "–"}` : ""
            ], "/#munka/megtekintesek");
        }
    }
}

// ===================== BEMUTATÓ (munkatárs): megtekintések =====================

router.get("/api/csapat/megtekintesek", csakBelepve, async (req, res) => {
    try { res.json(await mb.sajatMegtekintesek(req)); } catch (err) { hiba(res, err); }
});

router.put("/api/csapat/megtekintesek/:tid", csakBelepve, async (req, res) => {
    try {
        const mid = await mb.megtekintesJog(req, req.params.tid);
        if (!mid) return res.status(403).json({ error: "forbidden" });
        await mb.megtekintesLezar(mid, req.params.tid, req.body || {});
        await mb.naploIr(mid, "megtekintes", `Megtekintés: ${(req.body || {}).statusz}${(req.body || {}).visszajelzes ? ` – „${String(req.body.visszajelzes).slice(0, 300)}”` : ""}`, false, req.user.id);
        res.json({ siker: true });
    } catch (err) { hiba(res, err); }
});

// ===================== BEÁLLÍTÁSOK, DÍJBEKÉRŐ (admin) =====================

router.get("/api/admin/megbizas-beallitas", csakAdmin, async (req, res) => {
    try { res.json(await mb.beallitas()); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/megbizas-beallitas", csakAdmin, async (req, res) => {
    try { res.json({ siker: true, beallitas: await mb.beallitasMent(req.body || {}) }); } catch (err) { hiba(res, err); }
});

// Díjbekérő a sikerdíjról (és a fizetős opciókról) – a Pénzügyekbe kerül
router.post(ASZTAL + "/:id/dijbekero", asztal("admin"), async (req, res) => {
    try {
        const m = await megbizasSor(req.params.id);
        if (!m) return res.status(404).json({ error: "not_found" });
        const dij = await mb.dijSzamol(m);
        const b = req.body || {};
        const tetelek = [];
        if (b.siker !== false && dij.siker) {
            tetelek.push({ megnevezes: `Közvetítési sikerdíj / Comision intermediere – ${m.szerzodes_szam}${m.eladasi_ar ? ` (${m.eladasi_ar} ${dij.penznem} × ${dij.jutalek}%)` : ""}`, kategoria: "kozvetites", mennyiseg: 1, egysegar: dij.siker });
        }
        if (dij.fix) tetelek.push({ megnevezes: `Megbízási díj / Taxă mandat – ${m.szerzodes_szam}`, kategoria: "kozvetites", mennyiseg: 1, egysegar: dij.fix });
        if (b.opciok !== false) {
            dij.opciok.forEach(o => tetelek.push({ megnevezes: `${o.nev.hu} / ${o.nev.ro} – ${m.szerzodes_szam}`, kategoria: "kozvetites", mennyiseg: 1, egysegar: o.ar, penznem: o.penznem }));
        }
        if (!tetelek.length) return res.status(400).json({ error: "missing_items" });

        // Egy díjbekérőn egy pénznem: ami eltér, átváltjuk a beállított árfolyammal
        const be = await pu.beallitas();
        const penznem = dij.penznem;
        tetelek.forEach(t => {
            if (t.penznem && t.penznem !== penznem) {
                t.egysegar = penznem === "EUR" ? Math.round(t.egysegar / (be.eur_arfolyam || 5) * 100) / 100 : Math.round(t.egysegar * (be.eur_arfolyam || 5) * 100) / 100;
            }
            delete t.penznem;
        });

        // Ügyfél: az eladó (a fiókjához kötve)
        let ugyfelId = null;
        const u = await db.query("SELECT id FROM penzugy_ugyfelek WHERE user_id = $1 AND iroda_id IS NULL ORDER BY id LIMIT 1", [m.user_id || 0]);
        if (u.rowCount) ugyfelId = u.rows[0].id;
        else {
            ugyfelId = await pu.ugyfelMent(null, {
                tipus: "maganszemely", nev: m.nev || "Eladó", cim: [m.cim, m.telepules, m.varos].filter(Boolean).join(", ") || null,
                email: m.email, telefon: m.telefon, user_id: m.user_id, jegyzet: `Megbízás: ${m.szerzodes_szam}`
            });
        }
        const szamlaId = await pu.szamlaMent(null, {
            tipus: "dijbekero", ugyfel_id: ugyfelId, penznem, tetelek,
            megjegyzes: `Megbízás / Mandat: ${m.szerzodes_szam}`
        });
        await db.query("UPDATE megbizasok SET dijbekero_id = $2, updated_at = NOW() WHERE id = $1", [m.id, szamlaId]);
        await mb.naploIr(m.id, "jegyzet", `Díjbekérő készült (#${szamlaId})`, false, req.user.id);
        res.json({ siker: true, szamla_id: szamlaId });
    } catch (err) { hiba(res, err); }
});

// ===================== A SZERZŐDÉS (tervezet, HU / RO) =====================

function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const TIPUS_NEV = { lakas: "lakás / apartament", haz: "ház / casă", telek: "telek / teren", kereskedelmi: "üzlethelyiség / spațiu comercial", iroda: "iroda / birou" };

function nap(d) {
    if (!d) return "____________";
    return mb.pgDatum(d).replace(/-/g, ".") + ".";
}

async function szerzodesHtml(m) {
    const u = await oldalAdatok.nyilvanos();
    const be = await mb.beallitas();
    const dij = await mb.dijSzamol(m);
    const opciok = (Array.isArray(m.opciok) ? m.opciok : []).map(k => be.opciok.find(o => o.kod === k)).filter(Boolean);
    const kiado = m.ugylet === "kiado";
    const jut = dij.jutalek;
    const ido = m.idotartam_honap || be.idotartam_honap || 6;
    const p = (hu, ro) => `<p>${hu}</p><p class="ro">${ro}</p>`;

    return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Megbízási szerződés / Contract de intermediere ${esc(m.szerzodes_szam)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1c2321; margin: 0; background: #f3f4f2; line-height: 1.5; }
  .lap { max-width: 820px; margin: 24px auto; background: #fff; padding: 40px 48px; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,.08); font-size: 14px; }
  .tervezet { font-family: Arial, sans-serif; background: #fff4e5; border: 1px solid #f0c27a; color: #7a4a00; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; margin-bottom: 22px; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 4px; }
  .alcim { text-align: center; color: #5b6660; margin-bottom: 22px; font-size: 13px; }
  h2 { font-size: 14.5px; margin: 22px 0 6px; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: .03em; color: #1f6f5c; }
  p { margin: 0 0 6px; }
  .ro { color: #4b5651; font-style: italic; margin-bottom: 10px; }
  .felek { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-family: Arial, sans-serif; font-size: 13px; }
  .fel { background: #f7f8f6; border-radius: 8px; padding: 12px 14px; }
  .fel h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #5b6660; }
  ul { margin: 4px 0 10px 18px; padding: 0; }
  .alair { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; font-family: Arial, sans-serif; font-size: 13px; }
  .alair div { border-top: 1px solid #1c2321; padding-top: 6px; text-align: center; }
  .elfogadva { margin-top: 28px; font-family: Arial, sans-serif; font-size: 12.5px; background: #e8f4ef; border: 1px solid #9fd0bd; color: #14523f; border-radius: 8px; padding: 8px 12px; }
  .eszkoz { text-align: center; margin: 16px 0 32px; font-family: Arial, sans-serif; }
  .eszkoz button { font-size: 15px; padding: 9px 18px; border-radius: 8px; border: 0; background: #1f6f5c; color: #fff; cursor: pointer; }
  @media print { body { background: #fff; } .lap { box-shadow: none; margin: 0; max-width: none; padding: 0; } .eszkoz { display: none; } }
  @media (max-width: 640px) { .lap { padding: 20px 16px; margin: 0; border-radius: 0; } .felek, .alair { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="lap">
  <div class="tervezet"><b>TERVEZET / PROIECT.</b> Ezt a szerződést aláírás előtt romániai ügyvéddel ellenőriztesd (közvetítői tevékenység, fogyasztóvédelem, GDPR). ·
  Acest contract trebuie verificat de un avocat înainte de semnare.</div>

  <h1>Megbízási (közvetítési) szerződés</h1>
  <div class="alcim">Contract de intermediere imobiliară · Nr. <b>${esc(m.szerzodes_szam)}</b> · ${nap(m.szerzodes_datum || m.alairva)}</div>

  <div class="felek">
    <div class="fel">
      <h3>Megbízott / Intermediar</h3>
      <b>${esc(u.nev || "IngatlanPro")}</b><br>
      ${u.adoszam ? `CUI: ${esc(u.adoszam)}<br>` : ""}
      ${u.cegjegyzekszam ? `Reg. Com.: ${esc(u.cegjegyzekszam)}<br>` : ""}
      ${u.cim ? `${esc(u.cim)}<br>` : ""}
      ${u.email ? `E-mail: ${esc(u.email)}<br>` : ""}
      ${u.telefon ? `Tel.: ${esc(u.telefon)}` : ""}
    </div>
    <div class="fel">
      <h3>Megbízó / Client (proprietar)</h3>
      <b>${esc(m.nev || "____________________")}</b><br>
      Szem. ig. / CI: ____________ · CNP: ________________<br>
      Lakcím / Domiciliu: ______________________________<br>
      ${m.telefon ? `Tel.: ${esc(m.telefon)}<br>` : ""}
      ${m.email ? `E-mail: ${esc(m.email)}` : ""}
    </div>
  </div>

  <h2>1. A szerződés tárgya / Obiectul contractului</h2>
  ${p(`A Megbízó megbízza a Megbízottat, hogy az alábbi ingatlan <b>${kiado ? "bérbeadásához" : "eladásához"}</b> vevőt (bérlőt) keressen, és az ügylet létrejöttét elősegítse.`,
      `Clientul îl împuternicește pe Intermediar să caute un ${kiado ? "chiriaș" : "cumpărător"} pentru imobilul de mai jos și să faciliteze încheierea tranzacției.`)}
  <ul>
    <li>${esc(TIPUS_NEV[m.tipus] || m.tipus || "–")}${m.nm ? `, ${esc(m.nm)} m²` : ""}${m.szobak ? `, ${esc(m.szobak)} szoba / camere` : ""}</li>
    <li>Cím / Adresa: ${esc([m.cim, m.telepules, m.varos].filter(Boolean).join(", ") || "______________________________")}</li>
    <li>Telekkönyv / Carte funciară nr.: ______________ · Helyrajzi szám / Nr. cadastral: ______________</li>
    <li>Kért ár / Preț solicitat: ${m.kert_ar ? `<b>${esc(Number(m.kert_ar).toLocaleString("hu-HU"))} ${esc(dij.penznem)}</b>` : "______________"} (tárgyalható / negociabil)</li>
  </ul>

  <h2>2. A Megbízott szolgáltatásai / Serviciile intermediarului</h2>
  <ul>
    ${opciok.map(o => `<li><b>${esc(o.nev.hu)}</b> / ${esc(o.nev.ro)}${o.ar > 0 ? ` – ${esc(o.ar)} ${esc(o.penznem)}` : ""}</li>`).join("")}
  </ul>
  ${p("A Megbízott az érdeklődőket előszűri, a megtekintéseket egyezteti, a vételi ajánlatokat írásban továbbítja a Megbízónak. Az ajánlat elfogadásáról mindig a Megbízó dönt.",
      "Intermediarul filtrează persoanele interesate, programează vizionările și transmite în scris ofertele către Client. Decizia de acceptare a unei oferte aparține întotdeauna Clientului.")}

  <h2>3. Díjazás / Remunerația</h2>
  ${p(`A Megbízottat az ügylet létrejötte esetén <b>sikerdíj</b> illeti meg: a végleges ${kiado ? "éves bérleti díj" : "vételár"} <b>${esc(jut)}%-a</b>${be.minimum_dij ? `, de legalább <b>${esc(be.minimum_dij)} ${esc(dij.penznem)}</b>` : ""}${dij.fix ? `, valamint <b>${esc(dij.fix)} ${esc(dij.penznem)}</b> megbízási díj` : ""}. A sikerdíj az adásvételi (bérleti) szerződés aláírásakor esedékes.${opciok.some(o => o.ar > 0) ? " A külön díjas szolgáltatások díja a teljesítéskor esedékes, akkor is, ha az ügylet nem jön létre." : ""}`,
      `Intermediarul are dreptul la un <b>comision de succes</b> de <b>${esc(jut)}%</b> din ${kiado ? "chiria anuală" : "prețul final de vânzare"}${be.minimum_dij ? `, dar nu mai puțin de <b>${esc(be.minimum_dij)} ${esc(dij.penznem)}</b>` : ""}${dij.fix ? `, plus o taxă de mandat de <b>${esc(dij.fix)} ${esc(dij.penznem)}</b>` : ""}. Comisionul este exigibil la semnarea contractului de vânzare-cumpărare (închiriere).${opciok.some(o => o.ar > 0) ? " Serviciile cu tarif separat se plătesc la prestare, chiar dacă tranzacția nu se încheie." : ""}`)}
  ${p("A sikerdíj akkor is jár, ha a Megbízó a Megbízott által bemutatott vevővel a szerződés megszűnésétől számított 6 hónapon belül köt szerződést.",
      "Comisionul se datorează și dacă Clientul încheie tranzacția cu un cumpărător prezentat de Intermediar în termen de 6 luni de la încetarea contractului.")}

  <h2>4. Időtartam${m.kizarolagos ? ", kizárólagosság" : ""} / Durata${m.kizarolagos ? ", exclusivitate" : ""}</h2>
  ${p(`A szerződés <b>${esc(ido)} hónapra</b> szól, és bármelyik fél 15 napos írásbeli felmondással megszüntetheti.${m.kizarolagos ? " A szerződés idején a Megbízó más közvetítőt nem bíz meg; ha mégis más közvetítő révén ad el, a sikerdíj a Megbízottat illeti." : " A megbízás nem kizárólagos: a Megbízó maga is, illetve más közvetítő útján is értékesíthet."}`,
      `Contractul se încheie pe <b>${esc(ido)} luni</b> și poate fi denunțat de oricare parte cu o notificare scrisă de 15 zile.${m.kizarolagos ? " Pe durata contractului, Clientul nu va mandata alt intermediar; în caz contrar, comisionul se datorează Intermediarului." : " Mandatul nu este exclusiv: Clientul poate vinde și singur sau prin alt intermediar."}`)}

  <h2>5. A Megbízó kötelezettségei / Obligațiile Clientului</h2>
  ${p("A Megbízó szavatolja, hogy jogosult az ingatlan feletti rendelkezésre, átadja a szükséges iratokat (telekkönyv-kivonat, energetikai tanúsítvány stb.), lehetővé teszi a fotózást és a megtekintéseket, és tájékoztatja a Megbízottat, ha az ingatlant más módon eladta.",
      "Clientul garantează că are dreptul de a dispune de imobil, pune la dispoziție documentele necesare (extras CF, certificat energetic etc.), permite fotografierea și vizionările și informează Intermediarul dacă a vândut imobilul pe altă cale.")}

  <h2>6. Adatvédelem / Protecția datelor</h2>
  ${p("A felek személyes adatait a Megbízott kizárólag a szerződés teljesítéséhez kezeli, az IngatlanPro adatvédelmi tájékoztatója és a GDPR szerint.",
      "Intermediarul prelucrează datele personale ale părților exclusiv pentru executarea contractului, conform politicii de confidențialitate IngatlanPro și GDPR.")}

  <h2>7. Egyéb / Dispoziții finale</h2>
  ${p("A szerződésre a román jog, különösen a Polgári Törvénykönyv közvetítési szerződésre vonatkozó rendelkezései irányadók. A szerződés két eredeti példányban készült.",
      "Contractul este guvernat de legea română, în special de dispozițiile Codului civil privind contractul de intermediere. Contractul s-a încheiat în două exemplare originale.")}
  ${be.szerzodes_megjegyzes ? `<p style="white-space:pre-line">${esc(be.szerzodes_megjegyzes)}</p>` : ""}

  ${m.szerzodes_elfogadva ? `<div class="elfogadva">Elektronikusan elfogadva / Acceptat electronic: <b>${esc(new Date(m.szerzodes_elfogadva).toLocaleString("hu-HU", { timeZone: "Europe/Bucharest" }))}</b>${m.szerzodes_elfogadva_ip ? ` · IP: ${esc(m.szerzodes_elfogadva_ip)}` : ""}</div>` : ""}

  <div class="alair">
    <div>Megbízott / Intermediar<br><br>${esc(u.nev || "IngatlanPro")}</div>
    <div>Megbízó / Client<br><br>${esc(m.nev || "")}</div>
  </div>
</div>
<div class="eszkoz"><button type="button" onclick="window.print()">Nyomtatás / PDF</button></div>
</body>
</html>`;
}

module.exports = router;
