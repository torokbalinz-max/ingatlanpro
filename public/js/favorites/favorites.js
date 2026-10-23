// ============================================================
//  Kedvencek – ugyanazok a hirdetés-kártyák, mint az Ingatlanok oldalon
//  (képsáv, adatok, forrás, térkép, értékbecslés), rendezéssel.
//  A már nem elérhető (levett) hirdetés is látszik, halványan, jelölve.
//  A csillagra kattintva a kártya eltűnik – a felugró sávon visszavonható.
// ============================================================

class FavoritesManager {

    static lastData = [];
    static sort = "added";
    static utolsoTorolt = null;

    static load() {

        const box = document.getElementById("favoritesCards");
        if (box && !FavoritesManager.lastData.length) box.innerHTML = FavoritesManager.vazlat();

        fetch("/api/favorites")
            .then(r => r.json())
            .then(lista => {
                (Array.isArray(lista) ? lista : []).forEach((i, n) => {
                    i.forras = Sources.kulcs(i);
                    i.forrasok = Sources.allOf(i);
                    i._sorrend = n;           // a szerver a legutóbb hozzáadottat adja elöl
                });
                FavoritesManager.render(Array.isArray(lista) ? lista : []);
            })
            .catch(err => {
                console.error("Kedvencek betöltése sikertelen:", err);
                if (box && !FavoritesManager.lastData.length) box.innerHTML = "";
            });

    }

    // Betöltés közben: a kártyák helyén halvány váz (nem ugrál az oldal)
    static vazlat() {
        return Array.from({ length: 3 }, () => `
            <div class="${FavoritesManager.oszlop()}">
                <div class="ipSkeleton" aria-hidden="true"><span></span><i></i><i></i><i class="rov"></i></div>
            </div>`).join("");
    }

    static oszlop() {
        const n = typeof CardsView !== "undefined" ? CardsView.hatasos() : 3;
        return CardsView.COLS[n] || CardsView.COLS[3];
    }

    static nemElerheto(i) {
        return i.statusz && i.statusz !== "aktiv";
    }

    static rendezett(lista) {
        const l = [...lista];
        const cmp = {
            added: (a, b) => a._sorrend - b._sorrend,
            priceAsc: (a, b) => (a.ar || Infinity) - (b.ar || Infinity),
            priceDesc: (a, b) => (b.ar || 0) - (a.ar || 0),
            nmAsc: (a, b) => (Utils.arNm(a) || Infinity) - (Utils.arNm(b) || Infinity),
            areaDesc: (a, b) => (b.nm || 0) - (a.nm || 0)
        }[FavoritesManager.sort] || (() => 0);
        // a levett hirdetések a lista végén
        return l.sort((a, b) => (FavoritesManager.nemElerheto(a) - FavoritesManager.nemElerheto(b)) || cmp(a, b));
    }

    static render(lista) {

        FavoritesManager.lastData = lista;

        const box = document.getElementById("favoritesCards");
        if (!box) return;

        const bar = document.getElementById("favBar");
        const ures = document.getElementById("favEmpty");
        const t = I18n.t.bind(I18n);

        const aktiv = lista.filter(i => !FavoritesManager.nemElerheto(i));
        const levett = lista.length - aktiv.length;

        if (bar) bar.hidden = !lista.length;
        if (ures) ures.hidden = !!lista.length;

        const db = document.getElementById("favCount");
        if (db) {
            db.innerHTML = `<b>${Utils.num(lista.length)}</b> ${Utils.escape(t("favCountLabel"))}` +
                (levett ? ` <span class="favGone">${Utils.escape(I18n.f("favGoneCount", { n: levett }))}</span>` : "");
        }

        const atl = document.getElementById("favAvg");
        if (atl) {
            const arak = aktiv.filter(i => i.ar > 0 && i.nm > 0);
            atl.textContent = arak.length
                ? I18n.f("favAvgLabel", { v: Utils.eurNm(arak.reduce((s, i) => s + i.ar / i.nm, 0) / arak.length) })
                : "";
        }

        const terkepBtn = document.getElementById("favMapBtn");
        if (terkepBtn) terkepBtn.hidden = !aktiv.some(i => typeof MapManager !== "undefined" && MapManager.pontos(i));

        const col = FavoritesManager.oszlop();
        const n = CardsView.hatasos();
        box.dataset.cols = n;

        box.innerHTML = FavoritesManager.rendezett(lista).map(i => {
            const html = CardsView.cardHtml(i, { col, wide: n === 1 });
            if (!FavoritesManager.nemElerheto(i)) return html;
            // Levett hirdetés: jelölve, halványan (a csillaggal törölhető)
            return html.replace('class="listingCard ipCard', 'class="listingCard ipCard isGone')
                .replace('<div class="ipChips">', `<div class="ipChips"><span class="ipChip isGoneChip"><i class="fa-solid fa-ban" aria-hidden="true"></i> ${Utils.escape(t("favGoneChip"))}</span>`);
        }).join("");

        CardsView.bindCards(box);

        if (typeof IpMotion !== "undefined") IpMotion.scan(box);

    }

    // A csillag: a kártya eltűnik, a sávon "Visszavonás"
    static onToggle(id, mostKedvenc) {

        if (PageManager.current !== "favorites") return;

        if (mostKedvenc) {
            FavoritesManager.load();
            return;
        }

        const i = FavoritesManager.lastData.find(x => x.id === id);
        FavoritesManager.utolsoTorolt = i || null;

        const card = document.querySelector(`#favoritesCards .listingCard[data-id="${id}"]`);
        const cella = card ? card.parentElement : null;

        const vege = () => FavoritesManager.render(FavoritesManager.lastData.filter(x => x.id !== id));

        if (cella && !(typeof IpMotion !== "undefined" && IpMotion.csendes)) {
            cella.classList.add("favLeaving");
            setTimeout(vege, 320);
        } else {
            vege();
        }

        FavoritesManager.visszavonSav(id);

    }

    static visszavonSav(id) {

        let sav = document.getElementById("favUndo");
        if (!sav) {
            sav = document.createElement("div");
            sav.id = "favUndo";
            sav.className = "favUndo";
            sav.setAttribute("role", "status");
            document.body.appendChild(sav);
        }

        sav.innerHTML = `<span><i class="fa-regular fa-star" aria-hidden="true"></i> ${Utils.escape(I18n.t("favRemoved"))}</span>
            <button type="button" class="btn btn-sm" id="favUndoBtn">${Utils.escape(I18n.t("favUndo"))}</button>`;
        sav.classList.add("isOn");

        clearTimeout(FavoritesManager.savIdo);
        FavoritesManager.savIdo = setTimeout(() => sav.classList.remove("isOn"), 6000);

        document.getElementById("favUndoBtn").onclick = () => {
            sav.classList.remove("isOn");
            DataManager.toggleFavorite(id);
        };

    }

    static init() {

        const sel = document.getElementById("favSort");
        if (sel) sel.addEventListener("change", () => {
            FavoritesManager.sort = sel.value;
            FavoritesManager.render(FavoritesManager.lastData);
        });

        const terkep = document.getElementById("favMapBtn");
        if (terkep) terkep.addEventListener("click", () => {
            const pontok = FavoritesManager.lastData.filter(i => !FavoritesManager.nemElerheto(i) && MapManager.pontos(i));
            if (!pontok.length) return;
            PageManager.show("map");
            setTimeout(() => MapManager.load(pontok), 350);
        });

        // Elforgatáskor / ablakméret-váltáskor a rács igazodik
        let ido = null;
        window.addEventListener("resize", () => {
            clearTimeout(ido);
            ido = setTimeout(() => {
                const box = document.getElementById("favoritesCards");
                if (PageManager.current === "favorites" && box && Number(box.dataset.cols) !== CardsView.hatasos()) {
                    FavoritesManager.render(FavoritesManager.lastData);
                }
            }, 200);
        });

    }

    // (régi hívók: nyelv- és témaváltás)
    static refreshColumns() {
        if (PageManager.current === "favorites") FavoritesManager.render(FavoritesManager.lastData);
    }

    static refreshTheme() { }

}

document.addEventListener("DOMContentLoaded", () => FavoritesManager.init());
