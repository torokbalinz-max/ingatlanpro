// ============================================================
//  Eladjuk helyetted – megbízásos értékesítés: útvonalak
//
//   Nyilvános:   /api/megbizas/ajanlat, POST /api/megbizas (megbízás leadása)
//   Az eladó:    /api/megbizas/sajat/...  (Ingatlanom eladása, #eladas)
//   A vevő:      /api/megbizas/hirdetes/:ingatlanId/... (a hirdetés kártyája:
//                időpontfoglalás a naptárból, várólista, ajánlat, kérdés)
//   Az asztal:   /api/ertekesites/megbizasok/... – az admin és a megbízásokra
//                jogosult munkatárs (Admin → Értékesítés → Megbízások)
//   Naptár:      /api/ertekesites/naptar, /api/ertekesites/megtekintes/:tid/...
//                (Admin → Értékesítés → Megtekintési naptár; a bemutató is)
//   Beállítások: /api/admin/megbizas-beallitas
//
//  A munka: services/megbizas.js; levelek: services/megbizasLevel.js;
//  a szerződés szövege: services/megbizasSzerzodes.js;
//  időzített automatizmusok: services/megbizasAuto.js
// ============================================================

const express = require("express");
const mb = require("../services/megbizas");
const csapat = require("../services/csapat");
const level = require("../services/megbizasLevel");
const szerzodes = require("../services/megbizasSzerzodes");
const mail = require("../services/mail");
const db = require("../db/database");
const { hiba, csakBelepve } = require("../lib/http");

const router = express.Router();

const ip = req => req.ip || (req.socket && req.socket.remoteAddress) || "";

// Háttérben futó értesítés – a hiba nem akadályozza a választ
const hatter = (fn) => { Promise.resolve().then(fn).catch(e => console.error("Megbízás értesítés:", e.message)); };

async function megbizasSor(id) {
    return (await db.query("SELECT * FROM megbizasok WHERE id = $1", [Number(id) || 0])).rows[0];
}

async function erdeklodoSor(id) {
    return id ? (await db.query("SELECT * FROM megbizas_erdeklodok WHERE id = $1", [id])).rows[0] : null;
}

// Szakaszváltás után: az eladó (és a lezárt ügyek vevői) értesítése
function lepesUtan(req, megbizasId, lepes) {
    if (!lepes || (!(lepes.lepesek || []).length && !lepes.lezart)) return;
    hatter(async () => level.lepesErtesit(req, await megbizasSor(megbizasId), lepes));
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
                "Következő lépés: hívd fel 24 órán belül, és jelöld az asztalon: „Első hívás megvolt”."
            ], "csomag");
            if (m.felelos_id) level.munkatarsnak(req, m.felelos_id, `Új megbízás rád bízva: ${v.szam}`, [
                `${level.hely(m)} – ${m.nev || ""} ${m.telefon || ""}`, "Hívd fel 24 órán belül."
            ], `/#admin/megbizasok/${m.id}`);
            if (be.auto_visszaigazolas) {
                await level.eladonak(req, m, `Megkaptuk a megbízásod / Am primit mandatul tău (${v.szam})`, [
                    "Köszönjük! Hamarosan (legkésőbb 1 munkanapon belül) felhívunk, és megbeszéljük a részleteket.",
                    "A megbízásodat a menü „Ingatlanom eladása” pontjában követheted: ott hagyod jóvá a csomagot, ott írod alá a szerződést, és ott látod a megtekintéseket és az ajánlatokat.",
                    "Mulțumim! Te sunăm în curând (cel târziu într-o zi lucrătoare). Mandatul îl urmărești în meniu, la „Vânzarea proprietății mele”."
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
        lepesUtan(req, v.megbizas.id, v.lepes);
        hatter(async () => {
            const m = v.megbizas;
            const a = v.ajanlat;
            await level.csapatnak(req, m, `Az eladó válaszolt az ajánlatra (${m.szerzodes_szam})`, [
                `Ajánlat: ${level.penz(a.osszeg, a.penznem)} → ${v.statusz}${v.ellen ? ` (ellenajánlat: ${level.penz(v.ellen, a.penznem)})` : ""}`,
                v.uzenet ? `„${v.uzenet}”` : "",
                v.statusz === "ellenajanlat" && !v.ellenVevonek ? "Az ellenajánlat jóváhagyásra vár – a megbízás Vevők és ajánlatok fülén továbbíthatod a vevőnek." : "",
                v.statusz === "elfogadva" ? "A megbízás az Adásvétel szakaszba lépett: előszerződés, iratok, közjegyző." : ""
            ], "vevok");
            const e = await erdeklodoSor(a.erdeklodo_id);
            if (v.statusz === "elfogadva") {
                level.vevonek(req, m, e, "Elfogadták az ajánlatodat! / Oferta ta a fost acceptată!", [
                    `Az eladó elfogadta a ${level.penz(a.osszeg, a.penznem)} összegű ajánlatodat. Hamarosan keresünk a következő lépésekkel (előszerződés, foglaló, közjegyző).`,
                    `Vânzătorul a acceptat oferta ta de ${level.penz(a.osszeg, a.penznem)}. Te contactăm în curând cu pașii următori (antecontract, arvună, notar).`
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

router.post("/api/megbizas/sajat/:id/csomag-jovahagy", csakBelepve, async (req, res) => {
    try {
        const v = await mb.csomagJovahagy(req.user, req.params.id);
        res.json({ siker: true });
        lepesUtan(req, v.megbizas.id, v.lepes);
        hatter(() => level.csapatnak(req, v.megbizas, `Az eladó jóváhagyta a csomagot (${v.megbizas.szerzodes_szam})`, [
            `${v.megbizas.nev || "Az eladó"} jóváhagyta a végleges csomagot és az árat. A szerződés kiment aláírásra.`
        ], "szerzodes"));
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/sajat/:id/hirdetes-jovahagy", csakBelepve, async (req, res) => {
    try {
        const v = await mb.hirdetesJovahagy(req.user, req.params.id);
        res.json({ siker: true });
        lepesUtan(req, v.megbizas.id, v.lepes);
        hatter(() => level.csapatnak(req, v.megbizas, `Az eladó jóváhagyta a hirdetést (${v.megbizas.szerzodes_szam})`, [
            `${v.megbizas.nev || "Az eladó"} jóváhagyta a hirdetést.`,
            (v.lepes.lepesek || []).includes("hirdetes") ? "A hirdetés nyilvános, a megtekintési naptár bekapcsolva." : "Ha minden előkészítő feladat kész, a hirdetés magától nyilvános lesz."
        ], "csomag"));
    } catch (err) { hiba(res, err); }
});

// Online aláírás: kód kérése (e-mailben); ha nincs e-mail küldés, kód nélkül írható alá
router.post("/api/megbizas/sajat/:id/szerzodes-kod", csakBelepve, async (req, res) => {
    try {
        if (!mail.elerheto()) return res.json({ siker: true, kell: false });
        const v = await mb.szerzodesKod(req.user, req.params.id);
        const t = mail.sablon({
            cim: `Aláírási kód / Cod de semnare: ${v.kod}`,
            sorok: [
                `A ${v.megbizas.szerzodes_szam} számú megbízási szerződés aláírásához ezt a kódot írd be: ${v.kod}`,
                "A kód 15 percig érvényes. Ha nem te kérted, ne add meg senkinek, és írj nekünk.",
                `Pentru semnarea contractului de intermediere nr. ${v.megbizas.szerzodes_szam} introdu codul: ${v.kod}. Codul este valabil 15 minute.`
            ]
        });
        await mail.kuld({ to: v.email, subject: `Aláírási kód / Cod de semnare: ${v.kod}`, html: t.html, text: t.text });
        const e = String(v.email || "");
        res.json({ siker: true, kell: true, email: e.replace(/^(.).*?(@.*)$/, "$1•••$2") });
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/sajat/:id/szerzodes-elfogad", csakBelepve, async (req, res) => {
    try {
        const v = await mb.szerzodesElfogad(req.user, req.params.id, req.body || {}, {
            ip: ip(req), ua: req.headers["user-agent"], kodKell: mail.elerheto()
        });
        res.json({ siker: true });
        lepesUtan(req, v.megbizas.id, v.lepes);
        hatter(async () => {
            const m = await megbizasSor(v.megbizas.id);
            await level.csapatnak(req, m, `Az eladó online aláírta a szerződést (${m.szerzodes_szam})`, [
                `${m.nev || "Az eladó"} online aláírta a megbízási szerződést${v.kodOk ? " (e-mailben kapott kóddal)" : ""}.`,
                m.szerzodes_allapot === "alairva" ? "A szerződést automatikusan ellenjegyeztük – hatályos." : "Következő lépés: ellenjegyzés egy kattintással (Szerződés és iratok)."
            ], "szerzodes");
        });
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/sajat/:id/szerzodes-szemelyes", csakBelepve, async (req, res) => {
    try {
        const v = await mb.szerzodesSzemelyes(req.user, req.params.id, req.body || {});
        res.json({ siker: true });
        hatter(() => level.csapatnak(req, v.megbizas, `Személyes aláírást kér (${v.megbizas.szerzodes_szam})`, [
            `${v.megbizas.nev || "Az eladó"} személyesen szeretné aláírni a szerződést.`,
            v.javaslat ? `Javasolt időpont / hely: ${v.javaslat}` : "",
            "Nyomtasd ki, írjátok alá, és töltsd fel a szkennelt példányt (Szerződés és iratok)."
        ], "szerzodes"));
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/sajat/:id/irat", csakBelepve, async (req, res) => {
    try {
        const v = await mb.sajatIrat(req.user, req.params.id, req.body || {});
        res.json({ siker: true, fajl: v.fajl });
        hatter(() => level.csapatnak(req, v.megbizas, `Új irat az eladótól (${v.megbizas.szerzodes_szam})`, [
            `${v.megbizas.nev || "Az eladó"} feltöltött egy iratot: ${v.fajl.nev}. Nézd át, és jelöld ellenőrzöttnek.`
        ], "szerzodes"));
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

// A szerződés – az eladó a sajátját, az admin és a jogosult munkatárs
router.get("/api/megbizas/:id/szerzodes", csakBelepve, async (req, res) => {
    try {
        let m = await mb.sajatMegbizas(req.user, req.params.id);
        if (!m && await csapat.megbizasJog(req, req.params.id, "megbizas_lat")) m = await megbizasSor(req.params.id);
        if (!m) return res.status(404).send("Nincs ilyen megbízás / Mandat inexistent");
        const be = await mb.beallitas();
        const dij = await mb.dijSzamol(m);
        const ellenjegyzo = m.ellenjegyezte ? (await db.query("SELECT COALESCE(nev, felhasznalonev) AS n FROM users WHERE id = $1", [m.ellenjegyezte])).rows[0] : null;
        res.set("Content-Type", "text/html; charset=utf-8");
        res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:");
        res.send(await szerzodes.html(m, be, dij, { ellenjegyzo: ellenjegyzo && ellenjegyzo.n }));
    } catch (err) { hiba(res, err); }
});

// Egy fájl letöltése (irat, aláírt szerződés, hitel-igazolás)
router.get("/api/megbizas/fajl/:fid", csakBelepve, async (req, res) => {
    try {
        const f = await mb.fajlLetolt(req, req.params.fid);
        if (!f) return res.status(404).json({ error: "not_found" });
        const nev = f.nev + (f.mime === "application/pdf" && !/\.pdf$/i.test(f.nev) ? ".pdf" : "");
        res.set("Content-Type", f.mime);
        res.set("Content-Disposition", `${req.query.letolt ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nev)}`);
        res.set("Cache-Control", "private, no-store");
        res.send(f.adat);
    } catch (err) { hiba(res, err); }
});

// ===================== A VEVŐ (megbízásos hirdetés) =====================

// Érdeklődéseim: minden ingatlan, ahol a felhasználó vevőként érdeklődik
router.get("/api/megbizas/vevo", csakBelepve, async (req, res) => {
    try { res.json(await mb.vevoLista(req.user)); } catch (err) { hiba(res, err); }
});

router.get("/api/megbizas/hirdetes/:id", async (req, res) => {
    try { res.json(await mb.vevoAllapot(req.user, req.params.id)); } catch (err) { hiba(res, err); }
});

router.get("/api/megbizas/hirdetes/:id/idopontok", async (req, res) => {
    try { res.json(await mb.vevoIdopontok(req.params.id)); } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/hirdetes/:id/foglal", csakBelepve, async (req, res) => {
    try {
        const v = await mb.vevoFoglal(req.user, req.params.id, req.body || {});
        res.json({ siker: true, megtekintes_id: v.megtekintes_id, idopont: v.idopont });
        hatter(async () => {
            const m = v.megbizas;
            const be = await mb.beallitas();
            const ido = level.idoSzoveg(v.idopont);
            const e = v.erdeklodo;
            await level.csapatnak(req, m, `${v.regi ? "Áthelyezett" : "Új"} megtekintés: ${ido} (${m.szerzodes_szam})`, [
                `${e.nev || ""} (${e.telefon || ""}${e.email ? ", " + e.email : ""}) – ${level.hely(m)}`,
                v.kerdes ? `Kérdés: „${String(v.kerdes).slice(0, 500)}”` : ""
            ], "megtekintesek");
            if (m.bemutato_id) level.munkatarsnak(req, m.bemutato_id, `Bemutatás: ${ido} – ${level.hely(m)}`, [
                `Megtekintés: ${ido}`, `Cím: ${level.hely(m)}`, `Vevő: ${e.nev || "–"} ${e.telefon || ""}`
            ], "/#admin/naptar");
            if (be.auto_visszaigazolas) level.vevonek(req, m, e, `Megtekintés foglalva: ${ido} / Vizionare programată`, [
                `Várunk: ${level.hely(m)} – ${ido}.`,
                "Előtte nap és két órával előtte emlékeztetőt küldünk. Ha mégsem érsz rá, a hirdetés oldalán lemondhatod vagy áthelyezheted.",
                "A megtekintés után a hirdetés oldalán tehetsz vételi ajánlatot.",
                `Te așteptăm: ${level.hely(m)} – ${ido}. Îți trimitem o reamintire cu o zi și cu două ore înainte. Poți anula sau muta vizionarea pe pagina anunțului.`
            ]);
            level.eladonak(req, m, `Megtekintés: ${ido} / Vizionare: ${ido}`, [
                `Egy érdeklődő időpontot foglalt: ${ido}.`, `Un cumpărător interesat a programat o vizionare: ${ido}.`
            ]);
            // Áthelyezés: a régi időpont felszabadult
            if (v.regi) varolistaErtesit(req, m);
        });
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/hirdetes/:id/varolista", csakBelepve, async (req, res) => {
    try {
        const v = await mb.vevoVarolista(req.user, req.params.id, req.body || {});
        res.json({ siker: true });
        hatter(() => level.csapatnak(req, v.megbizas, `Várólista: ${v.erdeklodo.nev || "vevő"} (${v.megbizas.szerzodes_szam})`, [
            `${v.erdeklodo.nev || ""} (${v.erdeklodo.telefon || ""}) egyik időpontot sem tudta vállalni.`,
            v.javasolt ? `Mikor érne rá: ${v.javasolt}` : "",
            "Adj neki időpontot a Megtekintési naptárban (vagy nyiss új idősávot)."
        ], "megtekintesek"));
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/hirdetes/:id/ajanlat", csakBelepve, async (req, res) => {
    try {
        const v = await mb.vevoAjanlatTesz(req.user, req.params.id, req.body || {});
        res.json({ siker: true, ajanlat_id: v.ajanlat_id, tovabbitva: v.tovabbitva, ervenyes_ig: v.ervenyes_ig });
        lepesUtan(req, v.megbizas.id, v.lepes);
        hatter(async () => {
            const m = v.megbizas;
            const be = await mb.beallitas();
            const e = v.erdeklodo;
            await level.csapatnak(req, m, `Új vételi ajánlat: ${level.penz(v.osszeg, v.penznem)} (${m.szerzodes_szam})`, [
                `${e.nev || ""} (${e.telefon || ""}) – ${level.hely(m)}`,
                `Finanszírozás: ${v.finanszirozas}`,
                v.tovabbitva ? "Automatikusan továbbítva az eladónak." : "Jóváhagyásra vár – a Vevők és ajánlatok fülön továbbíthatod az eladónak."
            ], "vevok");
            if (be.auto_visszaigazolas) level.vevonek(req, m, e, "Megkaptuk az ajánlatodat / Am primit oferta ta", [
                `Ajánlat: ${level.penz(v.osszeg, v.penznem)}, érvényes: ${level.idoSzoveg(v.ervenyes_ig)}.`,
                "Az ajánlatodat továbbítjuk az eladónak; a válaszát a hirdetés oldalán és e-mailben is megkapod.",
                "Ne feledd: ez szándéknyilatkozat – kötelező vállalás az előszerződéssel és a foglalóval jön létre.",
                "Transmitem oferta vânzătorului; răspunsul îl vei vedea pe pagina anunțului și pe e-mail."
            ]);
            if (v.tovabbitva) await level.eladonak(req, m, `Vételi ajánlat érkezett / Ai primit o ofertă (${m.szerzodes_szam})`, [
                `Ajánlat: ${level.penz(v.osszeg, v.penznem)} – válaszolj ${level.idoSzoveg(v.ervenyes_ig)}-ig.`,
                "Az „Ingatlanom eladása” oldalon elfogadhatod, elutasíthatod, vagy ellenajánlatot tehetsz. / Poți accepta, refuza sau face o contraofertă."
            ]);
        });
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/hirdetes/:id/uzenet", csakBelepve, async (req, res) => {
    try {
        const v = await mb.vevoUzenet(req.user, req.params.id, req.body || {});
        res.json({ siker: true });
        hatter(() => level.csapatnak(req, v.megbizas, `Üzenet egy vevőtől (${v.megbizas.szerzodes_szam})`, [
            `${v.erdeklodo.nev || "Vevő"}: „${String((req.body || {}).szoveg || (req.body || {}).uzenet || "").slice(0, 1500)}”`
        ], "uzenetek"));
    } catch (err) { hiba(res, err); }
});

// Régi kliensek (a korábbi kártya): kérdés → üzenet, megtekintés → várólista; ajánlat → frissíteni kell
router.post("/api/megbizas/hirdetes/:id/keres", csakBelepve, async (req, res) => {
    const b = req.body || {};
    try {
        if (b.tipus === "ajanlat") return res.status(400).json({ error: "reload_page" });
        if (b.tipus === "megtekintes") {
            const v = await mb.vevoVarolista(req.user, req.params.id, b);
            return res.json({ siker: true, megbizas_id: v.megbizas.id, tipus: "megtekintes" });
        }
        const v = await mb.vevoUzenet(req.user, req.params.id, { ...b, szoveg: b.uzenet });
        res.json({ siker: true, megbizas_id: v.megbizas.id, tipus: "kerdes" });
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/hirdetes/:id/ajanlat/:aid/elfogad", csakBelepve, async (req, res) => {
    try {
        const v = await mb.vevoEllenElfogad(req.user, req.params.id, req.params.aid);
        res.json({ siker: true });
        lepesUtan(req, v.megbizas.id, v.lepes);
        hatter(async () => {
            const a = v.ajanlat;
            await level.csapatnak(req, v.megbizas, `A vevő elfogadta az ellenajánlatot (${v.megbizas.szerzodes_szam})`, [
                `Megállapodás: ${level.penz(a.ellenajanlat, a.penznem)}. Következő lépés: előszerződés, foglaló, közjegyző.`
            ], "szerzodes");
        });
    } catch (err) { hiba(res, err); }
});

router.post("/api/megbizas/hirdetes/:id/ajanlat/:aid/visszavon", csakBelepve, async (req, res) => {
    try {
        const v = await mb.vevoAjanlatVisszavon(req.user, req.params.id, req.params.aid);
        res.json({ siker: true });
        hatter(async () => {
            await level.csapatnak(req, v.megbizas, `Visszavont ajánlat (${v.megbizas.szerzodes_szam})`, [`${level.penz(v.ajanlat.osszeg, v.ajanlat.penznem)}`], "vevok");
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
            if (t.idopont && t.statusz === "egyeztetve") await level.eladonak(req, v.megbizas, `Elmarad a megtekintés: ${ido} / Vizionare anulată`, [`A ${ido} időpontra foglalt megtekintés elmarad. / Vizionarea de la ${ido} a fost anulată.`]);
            const bem = t.bemutato_id || v.megbizas.bemutato_id;
            if (bem && t.idopont) level.munkatarsnak(req, bem, `Elmarad: ${ido} – ${level.hely(v.megbizas)}`, ["A vevő lemondta a megtekintést."], "/#admin/naptar");
            if (t.statusz === "egyeztetve") varolistaErtesit(req, v.megbizas, v.varolista);
        });
    } catch (err) { hiba(res, err); }
});

// Naptárfájl a megtekintéshez (a vevőnek a sajátja, a csapatnak)
router.get("/api/megbizas/megtekintes/:tid/ics", csakBelepve, async (req, res) => {
    try {
        const r = await db.query(`SELECT t.*, e.user_id AS vevo_id, e.nev AS vevo_nev, e.telefon AS vevo_tel FROM megbizas_megtekintesek t
                                  LEFT JOIN megbizas_erdeklodok e ON e.id = t.erdeklodo_id WHERE t.id = $1`, [Number(req.params.tid) || 0]);
        const t = r.rows[0];
        if (!t || !t.idopont) return res.status(404).json({ error: "not_found" });
        const csapatJog = !!(await mb.megtekintesJog(req, t.id));
        if (!csapatJog && t.vevo_id !== req.user.id) return res.status(404).json({ error: "not_found" });
        const m = await megbizasSor(t.megbizas_id);
        const n = mb.naptarAdat(m, await mb.beallitas());
        res.set("Content-Type", "text/calendar; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="megtekintes-${t.id}.ics"`);
        res.send(level.ics({
            uid: "mt" + t.id, kezd: t.idopont, perc: n.hossz,
            cim: `Megtekintés / Vizionare – ${level.hely(m)}`, hely: level.hely(m),
            leiras: csapatJog ? `Vevő: ${t.vevo_nev || "–"} ${t.vevo_tel || ""}` : `IngatlanPro ${m.szerzodes_szam}`
        }));
    } catch (err) { hiba(res, err); }
});

// Felszabadult időpont: a várólistán lévők értesítése
async function varolistaErtesit(req, m, lista) {
    const kik = lista || await mb.varolistasok(m.id);
    kik.forEach(e => level.vevonek(req, m, e, "Felszabadult egy időpont / S-a eliberat o oră de vizionare", [
        `Felszabadult egy megtekintési időpont: ${level.hely(m)}. Ha még érdekel, a hirdetés oldalán lefoglalhatod.`,
        "S-a eliberat o oră de vizionare. Dacă te interesează încă, o poți rezerva pe pagina anunțului."
    ]));
}

// ===================== AZ ÉRTÉKESÍTÉSI ASZTAL (admin + munkatárs) =====================

// Jogosultság egy megbízáson: megbizas_lat (olvasás) | megbizas (kezelés – mint az admin) | megtekintes
function asztal(jog) {
    return async (req, res, next) => {
        try {
            if (!req.user) return res.status(401).json({ error: "login_required" });
            const ok = req.params.id
                ? await csapat.megbizasJog(req, req.params.id, jog)
                : csapat.vanJoga(await csapat.kontextus(req), jog);
            if (!ok) return res.status(403).json({ error: "forbidden" });
            req.mbJog = { admin: req.szerep === "admin" || (req.params.id ? await csapat.megbizasJog(req, req.params.id, "megbizas") : false) };
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
            // Szakaszváltás: az eladó; lezárt ajánlatok / megtekintések: a vevők
            const lepesek = v.lepesek.length ? v.lepesek : (v.ujStatusz ? [v.ujStatusz] : []);
            await level.lepesErtesit(req, m, { lepesek, lezart: v.lezart });
            if (lepesek.includes("eladva") && (await mb.beallitas()).auto_dijbekero && !m.dijbekero_id) {
                await mb.dijbekeroKeszit(m.id, req.user.id).catch(e => console.error("Díjbekérő:", e.message));
            }
            // Hozzárendelés: a munkatárs értesítése
            for (const h of v.hozzarendelve) {
                const mint = { felelos_id: "felelős (értékesítő)", fotos_id: "fotós", bemutato_id: "bemutató" }[h.szerep];
                level.munkatarsnak(req, h.user_id, `Új feladat: ${m.szerzodes_szam} – ${mint}`, [
                    `Hozzád rendeltük ${mint}ként: ${level.hely(m)}.`,
                    h.szerep === "bemutato_id" ? "A megtekintéseket az admin felületen, a Megtekintési naptárban látod." : "A részleteket az admin felületen látod."
                ], h.szerep === "bemutato_id" ? "/#admin/naptar" : `/#admin/megbizasok/${m.id}`);
            }
            // Fotózás időpontja: az eladó és a fotós
            const valtozott = (k) => k in (req.body || {}) && m[k] && new Date(m[k]).getTime() !== (v.elozo[k] ? new Date(v.elozo[k]).getTime() : 0);
            if (valtozott("fotozas_idopont")) {
                const ido = level.idoSzoveg(m.fotozas_idopont);
                level.eladonak(req, m, `Fotózás: ${ido} / Fotografiere: ${ido}`, [`A fotózás időpontja: ${ido}. Kérjük, készítsd elő a lakást (világítás, rend).`, `Ora fotografierii: ${ido}.`]);
                if (m.fotos_id) level.munkatarsnak(req, m.fotos_id, `Fotózás: ${ido} – ${level.hely(m)}`, [`Cím: ${level.hely(m)}`, `Eladó: ${m.nev || ""} ${m.telefon || ""}`], `/#admin/megbizasok/${m.id}/csomag`);
            }
            // Közjegyző: az eladó és a vevő
            if (valtozott("kozjegyzo_idopont")) {
                const ido = level.idoSzoveg(m.kozjegyzo_idopont);
                const sorok = [`Közjegyzői adásvétel: ${ido}${m.kozjegyzo ? " – " + m.kozjegyzo : ""}.`, "Hozd magaddal a személyi igazolványodat; a szükséges iratok listáját az oldaladon látod.", `Semnare la notar: ${ido}.`];
                level.eladonak(req, m, `Közjegyző: ${ido} / Notar: ${ido}`, sorok);
                if (m.adasvetel_ajanlat_id) {
                    const a = (await db.query("SELECT erdeklodo_id FROM megbizas_ajanlatok WHERE id = $1", [m.adasvetel_ajanlat_id])).rows[0];
                    level.vevonek(req, m, await erdeklodoSor(a && a.erdeklodo_id), `Közjegyző: ${ido} / Notar: ${ido}`, sorok);
                }
            }
        });
    } catch (err) { hiba(res, err); }
});

// A következő lépés egy kattintással
router.post(ASZTAL + "/:id/lepes/:mit", asztal("megbizas"), async (req, res) => {
    try {
        const v = await mb.lepes(req.params.id, req.params.mit, req.user.id);
        res.json({ siker: true });
        lepesUtan(req, v.megbizas.id, v.lepes);
        hatter(async () => {
            const m = await megbizasSor(v.megbizas.id);
            if (v.ertesit === "csomag") {
                level.eladonak(req, m, `Jóváhagyásra vár: a csomagod / Pachetul tău așteaptă aprobarea (${m.szerzodes_szam})`, [
                    "Összeállítottuk a végleges csomagot: a szolgáltatásokat, a díjat és az induló árat. Nézd át az „Ingatlanom eladása” oldalon, és egy kattintással hagyd jóvá – utána jön a szerződés.",
                    "Am pregătit pachetul final: serviciile, comisionul și prețul de pornire. Verifică-l și aprobă-l cu un clic – apoi urmează contractul."
                ]);
            } else if (v.ertesit === "hirdetes") {
                level.eladonak(req, m, `Kész a hirdetésed – jóváhagyásra vár / Anunțul tău așteaptă aprobarea (${m.szerzodes_szam})`, [
                    "Elkészült a hirdetés (fotók, leírás). Nézd meg az előnézetet, és ha rendben van, hagyd jóvá – utána nyilvános lesz, és a vevők időpontot foglalhatnak.",
                    "Anunțul este gata. Vezi previzualizarea și aprobă-l – apoi devine public, iar cumpărătorii pot programa vizionări."
                ]);
            }
            if (v.ertesit === "eladva" && (await mb.beallitas()).auto_dijbekero && !m.dijbekero_id) {
                await mb.dijbekeroKeszit(m.id, req.user.id).catch(e => console.error("Díjbekérő:", e.message));
            }
        });
    } catch (err) { hiba(res, err); }
});

// Előkészítés: egy feladat kész / nincs kész (a megbízás kezelője, vagy a hozzárendelt fotós)
router.post(ASZTAL + "/:id/feladat", async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: "login_required" });
        const id = Number(req.params.id) || 0;
        const m = await megbizasSor(id);
        if (!m) return res.status(404).json({ error: "not_found" });
        const ok = await csapat.megbizasJog(req, id, "megbizas") || (m.fotos_id === req.user.id && await csapat.megbizasJog(req, id, "kepek"));
        if (!ok) return res.status(403).json({ error: "forbidden" });
        const b = req.body || {};
        const lepes = await mb.feladat(id, String(b.kod || ""), !!b.kesz, req.user.id);
        res.json({ siker: true });
        lepesUtan(req, id, lepes);
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
            else await level.eladonak(req, m, `Üzenet a megbízásodhoz (${m.szerzodes_szam}) / Mesaj nou`, [szoveg, "Válaszolni az „Ingatlanom eladása” oldalon tudsz. / Poți răspunde pe pagina „Vânzarea proprietății mele”."]);
        });
    } catch (err) { hiba(res, err); }
});

router.post(ASZTAL + "/:id/olvasva", asztal("megbizas_lat"), async (req, res) => {
    try {
        await mb.olvasott(Number(req.params.id), Number((req.body || {}).erdeklodo_id) || null, "csapat");
        res.json({ siker: true });
    } catch (err) { hiba(res, err); }
});

router.post(ASZTAL + "/:id/szerzodes-kuld", asztal("megbizas"), async (req, res) => {
    try {
        const m = await mb.szerzodesKuld(Number(req.params.id), req.user.id);
        res.json({ siker: true });
        lepesUtan(req, m.id, m.lepes);
        if (!(m.lepes.lepesek || []).includes("szerzodes")) {
            hatter(() => level.eladonak(req, m, `A megbízási szerződésed / Contractul tău de intermediere (${m.szerzodes_szam})`, [
                "Elkészült a megbízási szerződés. Az „Ingatlanom eladása” oldalon elolvashatod, kinyomtathatod, és online aláírhatod – vagy kérhetsz személyes aláírást.",
                "Contractul de intermediere este gata. Pe pagina „Vânzarea proprietății mele” îl poți citi, tipări și semna online – sau poți cere semnarea în persoană."
            ]));
        }
    } catch (err) { hiba(res, err); }
});

// A megtekintési naptár (idősávok) egy megbízáshoz
router.put(ASZTAL + "/:id/naptar", asztal("megtekintes"), async (req, res) => {
    try { res.json({ siker: true, naptar: await mb.naptarMent(Number(req.params.id), req.body || {}, req.user.id) }); } catch (err) { hiba(res, err); }
});

// A szabad időpontok (áthelyezéshez, kézi foglaláshoz)
router.get(ASZTAL + "/:id/idopontok", asztal("megtekintes"), async (req, res) => {
    try {
        const m = await megbizasSor(req.params.id);
        res.json(await mb.szabadIdopontok(m, await mb.beallitas(), { tol: req.query.tol || null, napok: Number(req.query.napok) || null }));
    } catch (err) { hiba(res, err); }
});

// Fájl feltöltése (irat, aláírt szerződés szkennelve, egyéb)
router.post(ASZTAL + "/:id/fajl", asztal("megbizas"), async (req, res) => {
    try {
        const v = await mb.csapatFajl(Number(req.params.id), req.body || {}, req.user.id);
        res.json({ siker: true, fajl: v.fajl });
        lepesUtan(req, Number(req.params.id), v.lepes);
    } catch (err) { hiba(res, err); }
});

router.delete(ASZTAL + "/:id/fajl/:fid", asztal("megbizas"), async (req, res) => {
    try { await mb.fajlTorol(req.params.id, req.params.fid); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// Ajánlat: tovabbit (az eladónak) | elutasit | ellen_tovabbit (a vevőnek)
router.post(ASZTAL + "/:id/ajanlatok/:aid/:muvelet", asztal("megbizas"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const muvelet = req.params.muvelet;
        const a = await mb.ajanlatMuvelet(id, req.params.aid, muvelet, req.user.id);
        res.json({ siker: true });
        lepesUtan(req, id, a.lepes);
        hatter(async () => {
            const m = await megbizasSor(id);
            const e = await erdeklodoSor(a.erdeklodo_id);
            if (muvelet === "tovabbit") {
                await level.eladonak(req, m, `Vételi ajánlat érkezett / Ai primit o ofertă (${m.szerzodes_szam})`, [
                    `Ajánlat: ${level.penz(a.osszeg, a.penznem)}${a.feltetelek ? ` – ${a.feltetelek}` : ""}${a.ervenyes_ig ? ` – válaszolj ${level.idoSzoveg(a.ervenyes_ig)}-ig` : ""}`,
                    "Az „Ingatlanom eladása” oldalon elfogadhatod, elutasíthatod, vagy ellenajánlatot tehetsz. / Poți accepta, refuza sau face o contraofertă."
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

// Díjbekérő a sikerdíjról (és a fizetős opciókról) – a Pénzügyekbe kerül
router.post(ASZTAL + "/:id/dijbekero", asztal("megbizas"), async (req, res) => {
    try { res.json({ siker: true, szamla_id: await mb.dijbekeroKeszit(req.params.id, req.user.id, req.body || {}) }); } catch (err) { hiba(res, err); }
});

const ALRESZ = { erdeklodok: mb.erdeklodoMent, megtekintesek: mb.megtekintesMent, ajanlatok: mb.ajanlatMent };

router.post(ASZTAL + "/:id/:resz", asztal("megbizas"), async (req, res, next) => {
    const fn = ALRESZ[req.params.resz];
    if (!fn) return next();
    try {
        const id = await fn(Number(req.params.id), null, req.body || {});
        res.json({ siker: true, id });
        const lepes = await mb.elorelep(Number(req.params.id), req.user.id);
        lepesUtan(req, Number(req.params.id), lepes);
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
        const lepes = await mb.elorelep(Number(req.params.id), req.user.id);
        lepesUtan(req, Number(req.params.id), lepes);
        hatter(() => utanaErtesit(req, req.params.resz, Number(req.params.id), id, elozo));
    } catch (err) { hiba(res, err); }
});

router.delete(ASZTAL + "/:id/:resz/:rid", asztal("megbizas"), async (req, res) => {
    try { await mb.torol(req.params.resz, req.params.id, req.params.rid); res.json({ siker: true }); } catch (err) { hiba(res, err); }
});

// Értesítések: továbbított ajánlat (az eladónak), egyeztetett megtekintés (mindenkinek), megtörtént megtekintés (a vevőnek)
async function utanaErtesit(req, resz, megbizasId, id, elozo) {
    const m = await megbizasSor(megbizasId);
    if (!m) return;
    if (resz === "ajanlatok") {
        const a = (await db.query("SELECT * FROM megbizas_ajanlatok WHERE id = $1", [id])).rows[0];
        if (a && a.statusz === "tovabbitva" && (!elozo || elozo.statusz !== "tovabbitva")) {
            await mb.naploIr(m.id, "ajanlat", `Vételi ajánlat érkezett: ${a.osszeg} ${a.penznem}`, true, req.user && req.user.id);
            await level.eladonak(req, m, `Vételi ajánlat érkezett / Ai primit o ofertă (${m.szerzodes_szam})`, [
                `Ajánlat: ${level.penz(a.osszeg, a.penznem)}${a.feltetelek ? ` – ${a.feltetelek}` : ""}`,
                "Az „Ingatlanom eladása” oldalon elfogadhatod, elutasíthatod, vagy ellenajánlatot tehetsz. / Poți accepta, refuza sau face o contraofertă."
            ]);
        }
    }
    if (resz === "megtekintesek") {
        const t = (await db.query("SELECT * FROM megbizas_megtekintesek WHERE id = $1", [id])).rows[0];
        if (t && t.statusz === "megtortent" && (!elozo || elozo.statusz !== "megtortent")) await megtortentUtan(req, m, t);
        const ujIdopont = t && t.idopont && (!elozo || String(elozo.idopont) !== String(t.idopont) || elozo.statusz !== "egyeztetve");
        if (t && t.statusz === "egyeztetve" && ujIdopont) await idopontErtesit(req, m, t);
    }
}

// Egyeztetett (új vagy áthelyezett) időpont: vevő, eladó, bemutató
async function idopontErtesit(req, m, t) {
    const ido = level.idoSzoveg(t.idopont);
    await mb.naploIr(m.id, "megtekintes", `Megtekintés egyeztetve: ${ido}`, true, req.user && req.user.id);
    await level.eladonak(req, m, `Megtekintés: ${ido} / Vizionare: ${ido}`, [
        `Egy érdeklődő megnézi az ingatlant: ${ido}.`,
        `Un cumpărător interesat vine la vizionare: ${ido}.`
    ]);
    const e = await erdeklodoSor(t.erdeklodo_id);
    level.vevonek(req, m, e, `Megtekintés időpontja: ${ido} / Ora vizionării`, [
        `Várunk: ${level.hely(m)} – ${ido}.`,
        "Ha mégsem érsz rá, a hirdetés oldalán lemondhatod.",
        `Te așteptăm: ${level.hely(m)} – ${ido}. Dacă nu poți ajunge, anulează pe pagina anunțului.`
    ]);
    const bem = t.bemutato_id || m.bemutato_id;
    if (bem) level.munkatarsnak(req, bem, `Bemutatás: ${ido} – ${level.hely(m)}`, [
        `Megtekintés: ${ido}`, `Cím: ${level.hely(m)}`, e ? `Vevő: ${e.nev || "–"} ${e.telefon || ""}` : ""
    ], "/#admin/naptar");
}

// Megtörtént: „hogy tetszett? – ha tetszett, tegyél ajánlatot” (egyszer)
async function megtortentUtan(req, m, t) {
    const be = await mb.beallitas();
    if (!be.auto_visszajelzes || t.visszajelzes_kerve) return;
    await db.query("UPDATE megbizas_megtekintesek SET visszajelzes_kerve = NOW() WHERE id = $1", [t.id]);
    const e = await erdeklodoSor(t.erdeklodo_id);
    level.vevonek(req, m, e, "Hogy tetszett az ingatlan? / Cum ți s-a părut proprietatea?", [
        `Köszönjük, hogy megnézted: ${level.hely(m)}.`,
        "Ha tetszett, a hirdetés oldalán most már vételi ajánlatot is tehetsz (az ár mellett a finanszírozást is meg kell adnod). Ha kérdésed van, ugyanott írhatsz nekünk.",
        "Mulțumim că ai venit la vizionare. Dacă ți-a plăcut, acum poți face o ofertă de cumpărare pe pagina anunțului."
    ]);
}

// ===================== MEGTEKINTÉSI NAPTÁR (admin, bemutató) =====================

router.get("/api/ertekesites/naptar", csakBelepve, async (req, res) => {
    try {
        const k = await csapat.kontextus(req);
        const bemutato = (await db.query("SELECT 1 FROM megbizasok WHERE bemutato_id = $1 LIMIT 1", [req.user.id])).rowCount;
        if (!k.admin && !csapat.vanJoga(k, "megtekintes") && !(k.tag && bemutato)) return res.status(403).json({ error: "forbidden" });
        res.json(await mb.naptarNezet(req, req.query || {}));
    } catch (err) { hiba(res, err); }
});

// Lezárás: megtörtént / elmaradt (+ jegyzet) – a bemutató is
async function lezarRoute(req, res) {
    try {
        const mid = await mb.megtekintesJog(req, req.params.tid);
        if (!mid) return res.status(403).json({ error: "forbidden" });
        const t = await mb.megtekintesLezar(mid, req.params.tid, req.body || {}, req.user.id);
        res.json({ siker: true });
        if (t.statusz === "megtortent") hatter(async () => megtortentUtan(req, await megbizasSor(mid), t));
    } catch (err) { hiba(res, err); }
}

router.put("/api/ertekesites/megtekintes/:tid/lezar", csakBelepve, lezarRoute);
router.put("/api/csapat/megtekintesek/:tid", csakBelepve, lezarRoute);

router.put("/api/ertekesites/megtekintes/:tid/athelyez", csakBelepve, async (req, res) => {
    try {
        const mid = await mb.megtekintesJog(req, req.params.tid);
        if (!mid) return res.status(403).json({ error: "forbidden" });
        const t = await mb.megtekintesAthelyez(mid, req.params.tid, (req.body || {}).idopont, req.user.id);
        res.json({ siker: true });
        hatter(async () => {
            const m = await megbizasSor(mid);
            const ido = level.idoSzoveg(t.idopont);
            const e = await erdeklodoSor(t.erdeklodo_id);
            level.vevonek(req, m, e, `Új időpont: ${ido} / Oră nouă de vizionare`, [
                `A megtekintés új időpontja: ${ido} – ${level.hely(m)}.`, "Ha nem jó, a hirdetés oldalán lemondhatod, vagy írj nekünk.",
                `Noua oră a vizionării: ${ido}.`
            ]);
            level.eladonak(req, m, `Megtekintés: ${ido} / Vizionare: ${ido}`, [`Egy megtekintés új időpontja: ${ido}.`, `Noua oră a unei vizionări: ${ido}.`]);
            const bem = t.bemutato_id || m.bemutato_id;
            if (bem && bem !== req.user.id) level.munkatarsnak(req, bem, `Bemutatás: ${ido} – ${level.hely(m)}`, [`Áthelyezve: ${ido}`], "/#admin/naptar");
        });
    } catch (err) { hiba(res, err); }
});

router.post("/api/ertekesites/megtekintes/:tid/lemond", csakBelepve, async (req, res) => {
    try {
        const mid = await mb.megtekintesJog(req, req.params.tid);
        if (!mid) return res.status(403).json({ error: "forbidden" });
        const v = await mb.megtekintesLemond(mid, req.params.tid, req.user.id);
        res.json({ siker: true });
        hatter(async () => {
            const m = await megbizasSor(mid);
            const t = v.megtekintes;
            const e = await erdeklodoSor(t.erdeklodo_id);
            const ido = t.idopont ? level.idoSzoveg(t.idopont) : "";
            if ((req.body || {}).ertesit !== false) level.vevonek(req, m, e, "Elmarad a megtekintés / Vizionare anulată", [
                `Sajnos a megtekintés${ido ? " (" + ido + ")" : ""} elmarad. A hirdetés oldalán új időpontot foglalhatsz.`,
                "Din păcate vizionarea se anulează. Poți programa o altă oră pe pagina anunțului."
            ]);
            if (t.statusz === "egyeztetve") varolistaErtesit(req, m, v.varolista.filter(x => !e || x.id !== e.id));
        });
    } catch (err) { hiba(res, err); }
});

// Régi útvonal (a korábbi Munkaterület): a bemutató megtekintései
router.get("/api/csapat/megtekintesek", csakBelepve, async (req, res) => {
    try {
        const n = await mb.naptarNezet(req, { tol: mb.helyiNap(new Date(Date.now() - 14 * 86400000)), napok: 31 });
        res.json(n.foglalasok);
    } catch (err) { hiba(res, err); }
});

// ===================== BEÁLLÍTÁSOK =====================

router.get("/api/admin/megbizas-beallitas", csapat.csakResz("beallitasok"), async (req, res) => {
    try { res.json(await mb.beallitas()); } catch (err) { hiba(res, err); }
});

router.put("/api/admin/megbizas-beallitas", csapat.csakResz("beallitasok"), async (req, res) => {
    try { res.json({ siker: true, beallitas: await mb.beallitasMent(req.body || {}) }); } catch (err) { hiba(res, err); }
});

module.exports = router;
