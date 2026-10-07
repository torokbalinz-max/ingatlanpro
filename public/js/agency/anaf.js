// ============================================================
//  Cégadatok az ANAF nyilvános adatbázisából (adószám / CUI alapján)
//  – az irodaregisztrációhoz és az admin Webhely adatai oldalához
// ============================================================

class AgencyAnaf {

    // Fő tevékenységek (CAEN), amelyeket felismerünk
    static CAEN = {
        "6831": "caen6831",
        "6832": "caen6832",
        "6810": "caen6810",
        "6820": "caen6820",
        "4110": "caen4110",
        "4120": "caen4120"
    };

    static lekerdez(cui) {
        return fetch("/api/anaf/" + encodeURIComponent(String(cui || "").trim()))
            .then(r => r.json().then(v => {
                if (!r.ok) {
                    const e = new Error(v.error || "hiba");
                    e.kod = v.error;
                    throw e;
                }
                return v;
            }));
    }

    static hibaSzoveg(err) {
        const k = "anafErr_" + (err && err.kod);
        return I18n.t(k) !== k ? I18n.t(k) : I18n.t("anafErr_anaf_unavailable");
    }

    static caenNev(caen) {
        const k = AgencyAnaf.CAEN[String(caen || "")];
        return k ? I18n.t(k) : "";
    }

    // Az ANAF válaszának megjelenítése (zöld: aktív cég, sárga: figyelmeztetés)
    static html(v) {

        const esc = Utils.escape;

        if (!v || !v.talalt) {
            return `<div class="anafBox bad"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i> ${I18n.t("anafNotFound")}</div>`;
        }

        const a = v.adat || {};
        const allapot = a.torolve ? ["bad", "anafDeleted"] : a.inaktiv ? ["bad", "anafInactive"] : ["ok", "anafActive"];
        const caen = a.caen ? `${esc(a.caen)}${AgencyAnaf.caenNev(a.caen) ? " – " + esc(AgencyAnaf.caenNev(a.caen)) : ""}` : "–";

        return `
            <div class="anafBox ${allapot[0]}">
                <div class="anafHead">
                    <i class="fa-solid ${allapot[0] === "ok" ? "fa-circle-check" : "fa-triangle-exclamation"}" aria-hidden="true"></i>
                    <b>${esc(a.nev || "")}</b>
                    <span class="badge ${allapot[0] === "ok" ? "text-bg-success" : "text-bg-danger"}">${I18n.t(allapot[1])}</span>
                </div>
                <dl class="anafList">
                    <dt>${I18n.t("anafCui")}</dt><dd>${a.tva ? "RO" : ""}${esc(a.cui || "")}</dd>
                    ${a.regCom ? `<dt>${I18n.t("anafRegCom")}</dt><dd>${esc(a.regCom)}</dd>` : ""}
                    ${a.cim ? `<dt>${I18n.t("anafAddress")}</dt><dd>${esc(a.cim)}</dd>` : ""}
                    <dt>${I18n.t("anafCaen")}</dt><dd>${caen}</dd>
                    ${a.bejegyezve ? `<dt>${I18n.t("anafRegistered")}</dt><dd>${esc(a.bejegyezve)}</dd>` : ""}
                </dl>
                ${a.caen && !a.ingatlanos && allapot[0] === "ok" ? `<div class="small anafNote"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${I18n.t("anafNotRealEstate")}</div>` : ""}
            </div>`;

    }

}
