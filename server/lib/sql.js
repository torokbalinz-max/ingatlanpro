// ============================================================
//  A hirdetés-listákban visszaadott mezők (több útvonal használja)
// ============================================================

// Az iroda neve csak a jóváhagyott irodáknál látszik (a jóváhagyásra váró
// iroda hirdetése addig magánhirdetésként jelenik meg). A kiemelt_ig: ha a
// hirdetés éppen kiemelt (promóció), meddig – services/kiemeles.js
const LISTA_MEZOK = `
    i.id, i.link, i.ar, i.nm, i.arnm AS "arNm", i.szobak, i.emelet, i.allapot, i.allapot_forras, i.eladva,
    i.x, i.y, i.varos, i.kerulet, i.tipus, i.ugylet, i.cim, i.telek_nm, i.statusz,
    i.forras_tipus, i.hely_pontossag, i.kulso_kepek, i.tovabbi_linkek, i.hianyzo,
    i.problemak, i.ellenorzott, i.jovahagyva, i.forras_kerulet, i.evszam, i.telepules, i.telek_jelleg, i.hely_sugar, i.utolso_ellenorzes,
    i.created_at, i.updated_at, i.owner_id, i.hely_forras, i.hely_kezi, i.hely_eredeti,
    i.varos_ok, i.varos_eredeti, i.varos_kezi,
    i.iroda_id, i.ugynok_id, i.iroda_ref, i.megnyitas, i.kozvetito, i.forras_nev, i.forras_kereso,
    -- A hirdető itt, fiókkal töltötte fel (iroda, megbízás, nem admin felhasználó):
    -- ennek automatikusan saját adatlapja van, a többi a forrásoldalra visz
    (i.iroda_id IS NOT NULL OR i.megbizas_id IS NOT NULL OR EXISTS (
        SELECT 1 FROM users u WHERE u.id = i.owner_id AND COALESCE(u.szerep, 'user') <> 'admin')) AS sajat_feltoltes,
    (SELECT ir.nev FROM irodak ir WHERE ir.id = i.iroda_id AND ir.statusz = 'jovahagyva') AS iroda_nev,
    (SELECT k.id FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id ORDER BY k.sorrend, k.id LIMIT 1) AS kep_id,
    (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id)::int AS kep_db,
    (SELECT array_agg(k.id ORDER BY k.sorrend, k.id) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id) AS kep_idk,
    (SELECT COUNT(*) FROM ingatlan_panorama p WHERE p.ingatlan_id = i.id)::int AS pano_db,
    (SELECT MAX(kk.vege) FROM ingatlan_kiemelesek kk WHERE kk.ingatlan_id = i.id AND kk.statusz = 'aktiv'
        AND kk.kezdet <= NOW() AND kk.vege > NOW()) AS kiemelt_ig
`;

module.exports = { LISTA_MEZOK };
