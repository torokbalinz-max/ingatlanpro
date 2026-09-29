// ============================================================
//  Kerülethatárok a böngészőben
//
//  A határokat az admin rajzolja meg (Admin → Városok, kerületek).
//  A CityManager.keruletek listában minden kerületnél ott a "hatar":
//  [[hosszúság, szélesség], ...].
//
//  Districts.find(varos, x, y)   melyik kerületben van a pont (vagy null)
//  Districts.layer(varos, opts)  a határok Leaflet rétegként
// ============================================================

class Districts {

    // Kerületenként más-más halvány szín (a név alapján mindig ugyanaz)
    static PALETTA = ["#2563eb", "#0d9488", "#c2410c", "#7c3aed", "#ca8a04", "#db2777", "#15803d", "#0891b2", "#9333ea", "#b45309", "#4f46e5", "#be123c"];

    static list(varos) {
        return (CityManager.keruletek || []).filter(k => k.varos === varos && Array.isArray(k.hatar) && k.hatar.length >= 3);
    }

    static any(varos) {
        return Districts.list(varos).length > 0;
    }

    static color(k) {
        const s = String(k.nev || "");
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return Districts.PALETTA[h % Districts.PALETTA.length];
    }

    static inside(x, y, hatar) {
        let benn = false;
        for (let i = 0, j = hatar.length - 1; i < hatar.length; j = i++) {
            const [xi, yi] = hatar[i];
            const [xj, yj] = hatar[j];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) benn = !benn;
        }
        return benn;
    }

    static area(h) {
        return Math.abs(h.reduce((s, p, i) => {
            const q = h[(i + 1) % h.length];
            return s + p[0] * q[1] - q[0] * p[1];
        }, 0));
    }

    // A pont távolsága a sokszög szélétől, méterben
    static edgeDist(x, y, hatar) {
        const kx = 111320 * Math.cos(y * Math.PI / 180), ky = 110570;
        let min = Infinity;
        for (let i = 0, j = hatar.length - 1; i < hatar.length; j = i++) {
            const ax = (hatar[j][0] - x) * kx, ay = (hatar[j][1] - y) * ky;
            const bx = (hatar[i][0] - x) * kx, by = (hatar[i][1] - y) * ky;
            const dx = bx - ax, dy = by - ay;
            const l = dx * dx + dy * dy;
            const t = Math.max(0, Math.min(1, l ? -(ax * dx + ay * dy) / l : 0));
            min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
        }
        return min;
    }

    // A kerület (az objektum), amiben a pont van. Ugyanaz a szabály, mint a
    // szerveren (server/services/districts.js):
    //  - átfedésnél: beágyazott kerületnél a kisebbik, különben ahol a pont
    //    mélyebben van (távolabb a széltől)
    //  - két határ közötti résben (80 m-en belül): a legközelebbi
    static findObj(varos, x, y) {
        x = Number(x); y = Number(y);
        if (!varos || !x || !y) return null;
        const lista = Districts.list(varos);
        const talalt = lista.filter(k => Districts.inside(x, y, k.hatar));
        if (talalt.length === 1) return talalt[0];
        if (talalt.length > 1) {
            const rend = [...talalt].sort((a, b) => Districts.area(a.hatar) - Districts.area(b.hatar));
            const kicsi = rend[0];
            const beagyazott = (a, b) => a.filter(p => Districts.inside(p[0], p[1], b)).length >= a.length * 0.9;
            if (rend.slice(1).every(k => beagyazott(kicsi.hatar, k.hatar))) return kicsi;
            return rend.map(k => ({ k, d: Districts.edgeDist(x, y, k.hatar) })).sort((a, b) => b.d - a.d)[0].k;
        }
        let legjobb = null;
        lista.forEach(k => {
            const d = Districts.edgeDist(x, y, k.hatar);
            if (d <= 80 && (!legjobb || d < legjobb.d)) legjobb = { k, d };
        });
        return legjobb ? legjobb.k : null;
    }

    static find(varos, x, y) {
        const k = Districts.findObj(varos, x, y);
        return k ? k.nev : null;
    }

    // Egy hirdetés kerülete: a megadott, vagy (pontos helynél) a határ szerinti
    static ofListing(i) {
        if (!i) return null;
        const pontos = i.x && i.y && ["pontos", "utca", null, undefined, ""].includes(i.hely_pontossag);
        if (pontos) {
            const k = Districts.find(i.varos, i.x, i.y);
            if (k) return k;
        }
        return i.kerulet || null;
    }

    static latlngs(hatar) {
        return hatar.map(p => [p[1], p[0]]);
    }

    // A határok rétege: halvány kitöltés, névvel (tooltip a közepén)
    //  opts.labels: állandó felirat a kerület közepén
    //  opts.interactive: kattintható-e (alapból nem, hogy a jelölőket ne takarja)
    static layer(varos, opts = {}) {

        const g = L.layerGroup();

        Districts.list(varos).forEach(k => {

            const szin = Districts.color(k);

            const poly = L.polygon(Districts.latlngs(k.hatar), {
                color: szin,
                weight: opts.weight || 1.5,
                opacity: 0.7,
                fillColor: szin,
                fillOpacity: opts.fillOpacity !== undefined ? opts.fillOpacity : 0.06,
                dashArray: opts.dash || null,
                interactive: !!opts.interactive
            });

            if (opts.labels) {
                poly.bindTooltip(Utils.escape(CityManager.keruletLabelOf(k)), {
                    permanent: true, direction: "center", offset: [0, -22], className: "districtLabel", interactive: false
                });
            }

            poly.addTo(g);

        });

        return g;

    }

}
