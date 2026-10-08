// ============================================================
//  A hirdetés-listákban visszaadott mezők (több útvonal használja)
// ============================================================

// Az iroda neve csak a jóváhagyott irodáknál látszik (a jóváhagyásra váró
// iroda hirdetése addig magánhirdetésként jelenik meg)
const LISTA_MEZOK = `
    i.id, i.link, i.ar, i.nm, i.arnm AS "arNm", i.szobak, i.emelet, i.allapot, i.allapot_forras, i.eladva,
    i.x, i.y, i.varos, i.kerulet, i.tipus, i.ugylet, i.cim, i.telek_nm, i.statusz,
    i.forras_tipus, i.hely_pontossag, i.kulso_kepek, i.tovabbi_linkek, i.hianyzo,
    i.problemak, i.ellenorzott, i.jovahagyva, i.forras_kerulet, i.evszam, i.telepules, i.telek_jelleg, i.hely_sugar, i.utolso_ellenorzes,
    i.created_at, i.updated_at, i.owner_id, i.hely_forras, i.hely_kezi, i.hely_eredeti,
    i.varos_ok, i.varos_eredeti, i.varos_kezi,
    i.iroda_id, i.ugynok_id, i.iroda_ref,
    (SELECT ir.nev FROM irodak ir WHERE ir.id = i.iroda_id AND ir.statusz = 'jovahagyva') AS iroda_nev,
    (SELECT k.id FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id ORDER BY k.sorrend, k.id LIMIT 1) AS kep_id,
    (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id)::int AS kep_db
`;

module.exports = { LISTA_MEZOK };
