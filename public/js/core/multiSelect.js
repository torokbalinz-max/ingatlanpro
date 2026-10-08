// ============================================================
//  Többes választó (pl. több kerület egyszerre a keresőben)
//
//  Úgy néz ki, mint egy legördülő lista; kattintásra jelölőnégyzetes
//  lista nyílik (darabszámmal), egyszerre több is bejelölhető.
//
//  const ms = new MultiSelect("keresoKeruletMS", {
//      id: "keresoKerulet",                      // a gomb azonosítója (a <label for> miatt)
//      empty: () => I18n.t("allapotMindegy"),    // ha semmi nincs kiválasztva
//      onChange: values => ...
//  });
//  ms.setOptions([{ value: "Lenin", label: "Lenin", count: 34 }, ...]);
//  ms.values = ["Lenin", "Központ"];  /  ms.values  ->  ["Lenin", "Központ"]
// ============================================================

class MultiSelect {

    constructor(el, opts = {}) {

        this.el = typeof el === "string" ? document.getElementById(el) : el;
        this.opts = opts;
        this.options = [];
        this.selected = new Set();
        this.szuro = "";

        if (!this.el) return;

        this.el.classList.add("dropdown", "msSelect");
        this.el.innerHTML = `
            <button type="button" class="form-select msToggle" ${opts.id ? `id="${opts.id}"` : ""}
                    data-bs-toggle="dropdown" data-bs-auto-close="outside" data-bs-display="static" aria-expanded="false">
                <span class="msSummary"></span>
            </button>
            <div class="dropdown-menu msMenu">
                <div class="msSearchBox" hidden>
                    <input type="search" class="form-control form-control-sm msSearch" autocomplete="off">
                </div>
                <div class="msList" role="group"></div>
                <div class="msFoot">
                    <button type="button" class="btn btn-link btn-sm px-0 msClear"></button>
                    <button type="button" class="btn btn-primary btn-sm msDone"></button>
                </div>
            </div>`;

        this.toggle = this.el.querySelector(".msToggle");
        this.list = this.el.querySelector(".msList");
        this.search = this.el.querySelector(".msSearch");

        this.el.querySelector(".msClear").onclick = () => this.clear();
        this.el.querySelector(".msDone").onclick = () => this.close();

        this.search.addEventListener("input", () => {
            this.szuro = Utils.ekezetNelkul(this.search.value);
            this.renderList();
        });

        // Megnyitáskor a keresőmező kap fókuszt (ha van) – érintőképernyőn nem,
        // hogy ne ugorjon fel a billentyűzet
        this.el.addEventListener("shown.bs.dropdown", () => {
            const erinto = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
            if (!erinto && !this.el.querySelector(".msSearchBox").hidden) this.search.focus();
        });

        this.list.addEventListener("change", e => {
            const cb = e.target.closest("input[type=checkbox]");
            if (!cb) return;
            if (cb.checked) this.selected.add(cb.value); else this.selected.delete(cb.value);
            this.renderSummary();
            this.fire();
        });

        this.renderTexts();

    }

    // A kiválasztott értékek (a lista sorrendjében)
    get values() {
        const sorrend = this.options.map(o => o.value);
        return [...this.selected].sort((a, b) => {
            const ia = sorrend.indexOf(a), ib = sorrend.indexOf(b);
            return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
        });
    }

    set values(v) {
        this.selected = new Set((Array.isArray(v) ? v : (v ? [v] : [])).map(String).filter(Boolean));
        this.ensureSelectedVisible();
        this.renderList();
        this.renderSummary();
    }

    // [{ value, label, count, hint }]
    setOptions(lista) {
        this.options = (lista || []).map(o => ({ ...o, value: String(o.value) }));
        this.ensureSelectedVisible();
        this.el.querySelector(".msSearchBox").hidden = this.options.length < 9;
        this.renderList();
        this.renderSummary();
    }

    // A kiválasztott, de (pl. típusváltás után) már nem szereplő érték is látsszon
    ensureSelectedVisible() {
        this.selected.forEach(v => {
            if (!this.options.some(o => o.value === v)) {
                const label = this.opts.label ? this.opts.label(v) : v;
                this.options.push({ value: v, label, count: 0 });
            }
        });
    }

    clear(csendben) {
        if (!this.selected.size) return;
        this.selected.clear();
        this.renderList();
        this.renderSummary();
        if (!csendben) this.fire();
    }

    close() {
        if (window.bootstrap && this.toggle) bootstrap.Dropdown.getOrCreateInstance(this.toggle).hide();
    }

    fire() {
        if (typeof this.opts.onChange === "function") this.opts.onChange(this.values);
    }

    // Nyelvváltáskor
    renderTexts() {
        if (!this.el) return;
        this.el.querySelector(".msClear").textContent = I18n.t("msClear");
        this.el.querySelector(".msDone").textContent = I18n.t("msDone");
        this.search.placeholder = I18n.t("msSearchPh");
        this.renderList();
        this.renderSummary();
    }

    renderSummary() {

        if (!this.el) return;

        const ki = this.values;
        const cimke = v => (this.options.find(o => o.value === v) || {}).label || v;
        const box = this.el.querySelector(".msSummary");
        const ures = this.opts.empty ? this.opts.empty() : I18n.t("allapotMindegy");

        let szoveg = ures;
        if (ki.length === 1) szoveg = cimke(ki[0]);
        else if (ki.length > 1 && ki.length <= 3) szoveg = ki.map(cimke).join(", ");
        else if (ki.length > 3) szoveg = I18n.f("msNSelected", { n: ki.length });

        box.textContent = szoveg;
        this.toggle.classList.toggle("msHasValue", ki.length > 0);
        this.toggle.title = ki.length ? ki.map(cimke).join(", ") : "";

    }

    renderList() {

        if (!this.el) return;

        const lathato = this.options.filter(o => !this.szuro || Utils.ekezetNelkul(o.label).includes(this.szuro) || this.selected.has(o.value));

        if (!lathato.length) {
            this.list.innerHTML = `<div class="msEmpty">${Utils.escape(this.options.length ? I18n.t("msNoMatch") : (this.opts.noOptions ? this.opts.noOptions() : I18n.t("msNoOptions")))}</div>`;
            return;
        }

        this.list.innerHTML = lathato.map(o => `
            <label class="msItem ${o.count === 0 ? "msZero" : ""}">
                <input type="checkbox" class="form-check-input" value="${Utils.escape(o.value)}" ${this.selected.has(o.value) ? "checked" : ""}>
                <span class="msLabel">${Utils.escape(o.label)}${o.hint ? ` <small>${Utils.escape(o.hint)}</small>` : ""}</span>
                ${o.count !== undefined && o.count !== null ? `<span class="msCount">${Utils.num(o.count)}</span>` : ""}
            </label>`).join("");

    }

}
