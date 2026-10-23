// ============================================================
//  AI asszisztens – csevegőablak a jobb alsó sarokban
//  (a szerver oldala: server/routes/chat.js, server/services/chatbot.js)
//
//  - Csak akkor látszik, ha a szerveren van AI-kulcs, és az admin nem
//    kapcsolta ki (Admin → Webhely adatai → Funkciók).
//  - A beszélgetés csak ebben a böngészőlapban marad meg (sessionStorage);
//    a szerver nem tárolja.
//  - A talált hirdetések kis kártyákként jelennek meg a válasz alatt,
//    kattintásra ugyanúgy nyílnak, mint a listában.
// ============================================================

class ChatWidget {

    static uzenetek = [];          // [{ role, content, hirdetesek?, kereses? }]
    static nyitva = false;
    static fut = false;
    static TAROLO = "ipChat";

    static be() {
        const c = AuthManager.config || {};
        const f = c.funkciok || {};
        return !!c.chatbot && f.chatbot !== false;
    }

    static indit() {
        if (!ChatWidget.be()) { ChatWidget.eltuntet(); return; }
        if (document.getElementById("ipChatFab")) return;
        try { ChatWidget.uzenetek = JSON.parse(sessionStorage.getItem(ChatWidget.TAROLO) || "[]") || []; } catch (e) { ChatWidget.uzenetek = []; }
        ChatWidget.epit();
        I18n.onChange(() => ChatWidget.szovegek());
    }

    static eltuntet() {
        ["ipChatFab", "ipChat"].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
    }

    static ment() {
        try {
            // a kártyák adatai közül csak az azonosítók (kevés hely)
            sessionStorage.setItem(ChatWidget.TAROLO, JSON.stringify(ChatWidget.uzenetek.slice(-20)));
        } catch (e) { /* privát mód: nem baj */ }
    }

    static epit() {
        const t = I18n.t.bind(I18n);

        const fab = document.createElement("button");
        fab.type = "button";
        fab.id = "ipChatFab";
        fab.className = "ipChatFab";
        fab.setAttribute("aria-controls", "ipChat");
        fab.setAttribute("aria-expanded", "false");
        fab.innerHTML = `<span class="ipChatFabIcon"><i class="fa-solid fa-comments" aria-hidden="true"></i></span><span class="ipChatFabText" data-chat-t="chatFab">${t("chatFab")}</span>`;
        fab.addEventListener("click", () => ChatWidget.nyitva ? ChatWidget.zar() : ChatWidget.nyit());
        document.body.appendChild(fab);

        const p = document.createElement("section");
        p.id = "ipChat";
        p.className = "ipChat";
        p.hidden = true;
        p.setAttribute("role", "dialog");
        p.setAttribute("aria-labelledby", "ipChatTitle");
        p.innerHTML = `
            <header class="ipChatHead">
                <span class="ipChatAvatar" aria-hidden="true"><i class="fa-solid fa-house-chimney-window"></i></span>
                <div class="ipChatHeadText">
                    <h2 id="ipChatTitle" data-chat-t="chatTitle">${t("chatTitle")}</h2>
                    <small data-chat-t="chatSubtitle">${t("chatSubtitle")}</small>
                </div>
                <button type="button" class="ipChatIconBtn" id="ipChatNew" data-chat-title="chatNew" title="${Utils.escape(t("chatNew"))}" aria-label="${Utils.escape(t("chatNew"))}"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>
                <button type="button" class="ipChatIconBtn" id="ipChatClose" data-chat-title="chatClose" title="${Utils.escape(t("chatClose"))}" aria-label="${Utils.escape(t("chatClose"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </header>
            <div class="ipChatBody" id="ipChatBody" aria-live="polite"></div>
            <form class="ipChatForm" id="ipChatForm">
                <label class="visually-hidden" for="ipChatInput" data-chat-t="chatPlaceholder">${t("chatPlaceholder")}</label>
                <textarea id="ipChatInput" rows="1" maxlength="1500" autocomplete="off" data-chat-ph="chatPlaceholder" placeholder="${Utils.escape(t("chatPlaceholder"))}"></textarea>
                <button type="submit" class="ipChatSend" id="ipChatSend" data-chat-title="chatSend" aria-label="${Utils.escape(t("chatSend"))}" title="${Utils.escape(t("chatSend"))}"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
            </form>
            <p class="ipChatNote"><span data-chat-t="chatNote">${t("chatNote")}</span> <a href="#jogi/adatvedelem" data-chat-t="chatPrivacy">${t("chatPrivacy")}</a></p>`;
        document.body.appendChild(p);

        const inp = p.querySelector("#ipChatInput");
        p.querySelector("#ipChatClose").addEventListener("click", () => ChatWidget.zar());
        p.querySelector("#ipChatNew").addEventListener("click", () => ChatWidget.uj());
        p.querySelector("#ipChatForm").addEventListener("submit", e => { e.preventDefault(); ChatWidget.kuld(inp.value); });
        inp.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ChatWidget.kuld(inp.value); }
        });
        inp.addEventListener("input", () => ChatWidget.magassag());
        p.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); ChatWidget.zar(); } });
        p.addEventListener("click", e => {
            const a = e.target.closest("a[href^='#']");
            if (a && window.matchMedia("(max-width: 575.98px)").matches) ChatWidget.zar();
        });

        // Az admin felületen és a hirdetésfeladáson (ott alul a mentés-sáv) nem kell
        const lathato = () => {
            const oldal = document.body.dataset.page;
            fab.hidden = oldal === "admin" || oldal === "new";
            if (fab.hidden && ChatWidget.nyitva) ChatWidget.zar();
        };
        new MutationObserver(lathato).observe(document.body, { attributes: true, attributeFilter: ["data-page"] });
        lathato();

        ChatWidget.rajzol();
    }

    static szovegek() {
        const t = I18n.t.bind(I18n);
        document.querySelectorAll("[data-chat-t]").forEach(el => { el.textContent = t(el.dataset.chatT); });
        document.querySelectorAll("[data-chat-title]").forEach(el => { el.title = t(el.dataset.chatTitle); el.setAttribute("aria-label", t(el.dataset.chatTitle)); });
        document.querySelectorAll("[data-chat-ph]").forEach(el => { el.placeholder = t(el.dataset.chatPh); });
        if (!ChatWidget.uzenetek.length) ChatWidget.rajzol();
    }

    static nyit(kerdes) {
        const p = document.getElementById("ipChat");
        const fab = document.getElementById("ipChatFab");
        if (!p) return;
        ChatWidget.nyitva = true;
        p.hidden = false;
        requestAnimationFrame(() => p.classList.add("isOn"));
        fab.setAttribute("aria-expanded", "true");
        fab.classList.add("isOpen");
        document.body.classList.add("ipChatOpen");
        ChatWidget.rajzol();
        setTimeout(() => document.getElementById("ipChatInput").focus(), 60);
        if (kerdes) ChatWidget.kuld(kerdes);
    }

    static zar() {
        const p = document.getElementById("ipChat");
        const fab = document.getElementById("ipChatFab");
        if (!p || !ChatWidget.nyitva) return;
        ChatWidget.nyitva = false;
        p.classList.remove("isOn");
        fab.setAttribute("aria-expanded", "false");
        fab.classList.remove("isOpen");
        document.body.classList.remove("ipChatOpen");
        setTimeout(() => { if (!ChatWidget.nyitva) p.hidden = true; }, 220);
        fab.focus();
    }

    static uj() {
        ChatWidget.uzenetek = [];
        ChatWidget.ment();
        ChatWidget.rajzol();
        document.getElementById("ipChatInput").focus();
    }

    static magassag() {
        const inp = document.getElementById("ipChatInput");
        inp.style.height = "auto";
        inp.style.height = Math.min(140, inp.scrollHeight) + "px";
    }

    // Javasolt kérdések (az épp kiválasztott várossal)
    static javaslatok() {
        const v = CityManager.displayName(DataManager.currentCity);
        return ["chatSug1", "chatSug2", "chatSug3", "chatSug4"].map(k => I18n.f(k, { v }));
    }

    // Biztonságos, egyszerű formázás: **félkövér**, [szöveg](#oldal), "- " pontok, bekezdések
    static formaz(szoveg) {
        const esc = Utils.escape(String(szoveg || ""));
        const sor = s => s
            .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
            .replace(/\[([^\]]{1,80})\]\((#[a-z0-9/_-]{1,60})\)/gi, '<a href="$2">$1</a>');
        const blokkok = esc.split(/\n{2,}/);
        return blokkok.map(b => {
            const sorok = b.split("\n");
            if (sorok.every(s => /^\s*[-•*]\s+/.test(s))) {
                return `<ul>${sorok.map(s => `<li>${sor(s.replace(/^\s*[-•*]\s+/, ""))}</li>`).join("")}</ul>`;
            }
            return `<p>${sorok.map(sor).join("<br>")}</p>`;
        }).join("");
    }

    static kartyak(lista, kereses) {
        if (!lista || !lista.length) return "";
        DataManager.prepare(lista);
        lista.forEach(i => CardsView.objektumok.set(i.id, i));
        const t = I18n.t.bind(I18n);
        const kartya = i => {
            const kep = Utils.photoUrl(i);
            const hely = CityManager.helyReszLabel(i) || CityManager.displayName(i.varos);
            const adat = [i.nm ? Utils.nm(i.nm) : "", i.szobak ? I18n.f("chatRooms", { n: i.szobak }) : ""].filter(Boolean).join(" · ");
            return `<button type="button" class="ipChatCard" data-chat-open="${i.id}">
                <span class="ipChatCardImg${kep ? "" : " noImg"}">${kep ? `<img src="${Utils.escape(kep)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('noImg');this.remove()">` : ""}<i class="${Types.get(i.tipus).icon}" aria-hidden="true"></i></span>
                <span class="ipChatCardText">
                    <b>${Utils.price(i)}</b>
                    <span>${Utils.escape(Types.label(i.tipus))} · ${Utils.escape(hely)}</span>
                    ${adat ? `<small>${Utils.escape(adat)}</small>` : ""}
                </span>
            </button>`;
        };
        const tobb = kereses && kereses.db > lista.length
            ? `<button type="button" class="ipChatAll" data-chat-all='${Utils.escape(JSON.stringify({ varos: kereses.varos, tipus: kereses.tipus, ugylet: kereses.ugylet }))}'>${Utils.escape(I18n.f("chatSeeAll", { n: Utils.num(kereses.db) }))} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>`
            : "";
        return `<div class="ipChatCards" role="list" aria-label="${Utils.escape(t("chatCardsAria"))}">${lista.map(kartya).join("")}</div>${tobb}`;
    }

    static rajzol() {
        const body = document.getElementById("ipChatBody");
        if (!body) return;
        const t = I18n.t.bind(I18n);

        let html = `<div class="ipChatMsg isBot"><div class="ipChatBubble">${ChatWidget.formaz(t("chatWelcome"))}</div></div>`;

        if (!ChatWidget.uzenetek.length) {
            html += `<div class="ipChatSugs">${ChatWidget.javaslatok().map(s => `<button type="button" class="ipChatSug" data-chat-sug="${Utils.escape(s)}">${Utils.escape(s)}</button>`).join("")}</div>`;
        }

        ChatWidget.uzenetek.forEach(m => {
            if (m.role === "user") {
                html += `<div class="ipChatMsg isUser"><div class="ipChatBubble">${Utils.escape(m.content).replace(/\n/g, "<br>")}</div></div>`;
            } else {
                html += `<div class="ipChatMsg isBot${m.hiba ? " isError" : ""}"><div class="ipChatBubble">${ChatWidget.formaz(m.content)}</div>${ChatWidget.kartyak(m.hirdetesek, m.kereses)}</div>`;
            }
        });

        if (ChatWidget.fut) html += `<div class="ipChatMsg isBot"><div class="ipChatBubble ipChatTyping" aria-label="${Utils.escape(t("chatThinking"))}"><span></span><span></span><span></span></div></div>`;

        body.innerHTML = html;

        body.querySelectorAll("[data-chat-sug]").forEach(b => b.addEventListener("click", () => ChatWidget.kuld(b.dataset.chatSug)));
        body.querySelectorAll("[data-chat-open]").forEach(b => b.addEventListener("click", () => {
            const id = Number(b.dataset.chatOpen);
            if (window.matchMedia("(max-width: 575.98px)").matches) ChatWidget.zar();
            ListingPage.open(id, CardsView.objektumok.get(id));
        }));
        body.querySelectorAll("[data-chat-all]").forEach(b => b.addEventListener("click", () => {
            let k = {};
            try { k = JSON.parse(b.dataset.chatAll); } catch (e) { /* */ }
            if (window.matchMedia("(max-width: 575.98px)").matches) ChatWidget.zar();
            HomePage.go({ varos: k.varos, tipus: k.tipus, ugylet: k.ugylet });
        }));

        body.scrollTop = body.scrollHeight;
    }

    static kuld(szoveg) {
        szoveg = String(szoveg || "").trim();
        if (!szoveg || ChatWidget.fut) return;

        const inp = document.getElementById("ipChatInput");
        inp.value = "";
        ChatWidget.magassag();

        ChatWidget.uzenetek.push({ role: "user", content: szoveg.slice(0, 1500) });
        ChatWidget.fut = true;
        document.getElementById("ipChatSend").disabled = true;
        ChatWidget.rajzol();

        // A szervernek csak a szöveg megy (a kártyák nem)
        const kuldendo = ChatWidget.uzenetek.filter(m => !m.hiba).slice(-12).map(m => ({ role: m.role, content: m.content }));

        fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uzenetek: kuldendo, lang: I18n.current, varos: DataManager.currentCity })
        })
            .then(r => r.json().then(v => ({ ok: r.ok, status: r.status, v })).catch(() => ({ ok: false, status: r.status, v: {} })))
            .then(({ ok, status, v }) => {
                if (!ok) {
                    const kod = v && v.error;
                    const kulcs = kod === "tul_sok" ? "chatErrTooMany" : kod === "napi_keret" ? "chatErrDaily" : kod === "ai_busy" ? "chatErrBusy" : kod === "chat_off" ? "chatErrOff" : "chatErrGeneric";
                    ChatWidget.uzenetek.push({ role: "assistant", content: I18n.t(kulcs), hiba: true });
                    if (status === 503) setTimeout(() => ChatWidget.eltuntet(), 4000);
                    return;
                }
                ChatWidget.uzenetek.push({
                    role: "assistant",
                    content: v.valasz || I18n.t("chatErrGeneric"),
                    hirdetesek: Array.isArray(v.hirdetesek) ? v.hirdetesek : [],
                    kereses: v.kereses || null
                });
            })
            .catch(() => ChatWidget.uzenetek.push({ role: "assistant", content: I18n.t("chatErrNetwork"), hiba: true }))
            .finally(() => {
                ChatWidget.fut = false;
                document.getElementById("ipChatSend").disabled = false;
                ChatWidget.ment();
                ChatWidget.rajzol();
                if (ChatWidget.nyitva) inp.focus();
            });
    }

}
