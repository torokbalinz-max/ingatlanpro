// ============================================================
//  Tesztfiók-sáv (Admin → Tesztelés)
//
//  Ha egy tesztfiókkal vagy bent, alul egy sáv mutatja, ki vagy (pl. „Alfa
//  Ügynök Anna – ügynök az Alfa irodában”). Ha az admin lépett be a fiókba,
//  egy kattintással válthat másik tesztfiókra, vagy vissza az adminba.
// ============================================================

class TesztSav {

    static adat = null;

    static mutat(t) {
        TesztSav.adat = t || null;
        let el = document.getElementById("tdBar");
        if (!t) {
            if (el) el.remove();
            document.body.classList.remove("tdBarOn");
            return;
        }
        if (!el) {
            el = document.createElement("div");
            el.id = "tdBar";
            el.className = "tdBar";
            el.setAttribute("role", "region");
            el.setAttribute("aria-label", I18n.t("tdBarAria"));
            document.body.appendChild(el);
        }
        document.body.classList.add("tdBarOn");
        const esc = Utils.escape;
        const u = AuthManager.user || {};
        el.innerHTML = `
            <span class="tdBarBadge"><i class="fa-solid fa-flask" aria-hidden="true"></i> ${esc(I18n.t("tdBarLabel"))}</span>
            <span class="tdBarWho"><b>${esc(u.nev || "")}</b>${t.leiras ? `<span class="tdBarRole"> · ${esc(I18n.t(t.leiras))}</span>` : ""}</span>
            ${t.valthat ? `
                <div class="dropup">
                    <button class="btn btn-sm btn-light" type="button" data-bs-toggle="dropdown" aria-expanded="false" id="tdBarSwitch">
                        <i class="fa-solid fa-people-arrows" aria-hidden="true"></i> ${esc(I18n.t("tdSwitch"))}
                    </button>
                    <div class="dropdown-menu dropdown-menu-end tdBarMenu" aria-labelledby="tdBarSwitch"><div class="px-3 py-2 small text-body-secondary">…</div></div>
                </div>
                <button class="btn btn-sm btn-warning" type="button" id="tdBarBack"><i class="fa-solid fa-user-shield" aria-hidden="true"></i> ${esc(I18n.t("tdBack"))}</button>` : ""}`;

        const back = el.querySelector("#tdBarBack");
        if (back) back.onclick = () => TesztSav.vissza(back);
        const sw = el.querySelector("#tdBarSwitch");
        if (sw) sw.addEventListener("show.bs.dropdown", () => TesztSav.menu(el.querySelector(".tdBarMenu")), { once: true });
    }

    static menu(box) {
        Svc.api("/api/teszt/fiokok").then(d => {
            const esc = Utils.escape;
            const me = AuthManager.user && AuthManager.user.id;
            const csop = ["iroda", "elado", "vevo", "csapat", "egyeb"];
            box.innerHTML = csop.map(c => {
                const f = (d.fiokok || []).filter(x => x.csop === c);
                if (!f.length) return "";
                return `<h6 class="dropdown-header">${esc(I18n.t("tdGroup_" + c))}</h6>` + f.map(x => `
                    <button class="dropdown-item ${x.id === me ? "active" : ""}" type="button" data-td="${x.id}" ${x.id === me ? 'aria-current="true"' : ""}>
                        <span class="d-block">${esc(x.nev)}</span>
                        ${x.leiras ? `<small class="text-body-secondary">${esc(I18n.t(x.leiras))}</small>` : ""}
                    </button>`).join("");
            }).join("");
            box.querySelectorAll("[data-td]").forEach(b => { b.onclick = () => TesztSav.belep(Number(b.dataset.td)); });
        }).catch(e => { box.innerHTML = `<div class="px-3 py-2 small text-danger">${Utils.escape(Svc.hiba(e))}</div>`; });
    }

    static belep(id) {
        return Svc.api("/api/teszt/belep/" + id, { method: "POST" }).then(() => {
            // Új szemmel: a teljes oldal újratöltődik (menü, jogok, értesítések)
            const h = location.hash;
            location.hash = /^#admin/.test(h) ? "#home" : h;
            location.reload();
        }).catch(e => alert(Svc.hiba(e)));
    }

    static vissza(btn) {
        if (btn) btn.disabled = true;
        Svc.api("/api/teszt/vissza", { method: "POST" }).then(v => {
            location.hash = v.admin ? "#admin/teszt" : "#home";
            location.reload();
        }).catch(e => { if (btn) btn.disabled = false; alert(Svc.hiba(e)); });
    }

}
