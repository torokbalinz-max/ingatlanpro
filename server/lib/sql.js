// ============================================================
//  A hirdetés-listákban visszaadott mezők (több útvonal használja)
// ============================================================

const LISTA_MEZOK = `
    i.id, i.link, i.ar, i.nm, i.arnm AS "arNm", i.szobak, i.emelet, i.allapot, i.eladva,
    i.x, i.y, i.varos, i.kerulet, i.tipus, i.ugylet, i.cim, i.telek_nm, i.statusz,
    i.forras_tipus, i.hely_pontossag, i.kulso_kepek, i.tovabbi_linkek, i.hianyzo,
    i.problemak, i.ellenorzott, i.jovahagyva, i.forras_kerulet, i.evszam, i.utolso_ellenorzes,
    i.created_at, i.updated_at,
    (SELECT k.id FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id ORDER BY k.sorrend, k.id LIMIT 1) AS kep_id,
    (SELECT COUNT(*) FROM ingatlan_kepek k WHERE k.ingatlan_id = i.id)::int AS kep_db
`;

module.exports = { LISTA_MEZOK };
