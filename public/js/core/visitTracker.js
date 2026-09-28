// ============================================================
//  Látogatottság mérése – saját, sütik nélkül
//
//  Minden oldalváltáskor egy apró jelzés megy a szervernek (melyik oldal,
//  nyelv, honnan jött). Sütit és helyi tárolót nem használ. A „Ne kövess”
//  (Do Not Track) és a Global Privacy Control beállítást tiszteletben tartja.
//  Részletek: server/routes/sitestats.js és az Adatvédelmi tájékoztató.
// ============================================================

class VisitTracker {

    static utolso = "";
    static utolsoIdo = 0;
    static elso = true;

    static tiltva() {
        return navigator.globalPrivacyControl === true
            || navigator.doNotTrack === "1" || window.doNotTrack === "1";
    }

    static pv(oldal, param) {

        try {

            if (VisitTracker.tiltva()) return;

            const kulcs = oldal + "/" + (param || "");
            const most = Date.now();

            // Ugyanaz az oldal pár másodpercen belül (pl. újrarajzolás) nem számít
            if (kulcs === VisitTracker.utolso && most - VisitTracker.utolsoIdo < 3000) return;

            VisitTracker.utolso = kulcs;
            VisitTracker.utolsoIdo = most;

            const adat = {
                oldal,
                id: oldal === "listing" ? Number(param) || null : null,
                nyelv: typeof I18n !== "undefined" ? I18n.current : null,
                ref: VisitTracker.elso ? document.referrer || null : null
            };

            VisitTracker.elso = false;

            fetch("/api/stat/pv", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(adat),
                keepalive: true
            }).catch(() => { });

        } catch (e) { /* a mérés soha ne zavarja az oldalt */ }

    }

}
