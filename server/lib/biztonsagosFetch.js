// ============================================================
//  Külső oldalak biztonságos lekérése (SSRF-védelem)
//
//  A szerver csak nyilvános internetes címekre fordulhat: a belső
//  hálózat (localhost, 10.x, 192.168.x, 172.16–31.x, felhő-metaadat
//  169.254.x, IPv6 helyi címek) tiltott – közvetlenül és átirányításon
//  keresztül is. Így egy beküldött link vagy kép-URL nem használható
//  arra, hogy a szerveren keresztül belső szolgáltatásokat érjenek el.
// ============================================================

const dns = require("dns").promises;
const net = require("net");

const DNS_IDO = 10 * 60 * 1000;      // a host-ellenőrzés eredménye ennyi ideig érvényes
const dnsCache = new Map();          // host -> { ok, ido }

function privatIpv4(ip) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||        // CGNAT
        (a === 169 && b === 254) ||                  // link-local, felhő-metaadat
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 192 && b === 0) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224;                                    // multicast, foglalt
}

function privatIp(ip) {
    if (net.isIPv4(ip)) return privatIpv4(ip);
    if (net.isIPv6(ip)) {
        const s = ip.toLowerCase();
        if (s === "::" || s === "::1") return true;
        const v4 = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (v4) return privatIpv4(v4[1]);
        if (s.startsWith("::ffff:")) return true;
        return /^(fe[89ab]|fc|fd|ff)/.test(s);
    }
    return true;
}

async function hostRendben(host) {

    host = String(host || "").replace(/^\[|\]$/g, "").toLowerCase();

    if (!host || host === "localhost" || /\.(localhost|local|internal|lan|home)$/.test(host)) return false;
    if (net.isIP(host)) return !privatIp(host);

    const c = dnsCache.get(host);
    if (c && Date.now() - c.ido < DNS_IDO) return c.ok;

    let ok = false;
    try {
        const cimek = await dns.lookup(host, { all: true, verbatim: true });
        ok = cimek.length > 0 && cimek.every(x => !privatIp(x.address));
    } catch (e) {
        ok = false;
    }

    if (dnsCache.size > 2000) dnsCache.clear();
    dnsCache.set(host, { ok, ido: Date.now() });

    return ok;

}

// Lekérhető-e az URL: http(s), felhasználónév/jelszó nélkül, nyilvános host
async function urlRendben(url) {
    let u;
    try { u = new URL(url); } catch (e) { return false; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    return hostRendben(u.hostname);
}

function tiltott(url) {
    const e = new Error("blocked_url: " + String(url).slice(0, 200));
    e.code = "blocked_url";
    return e;
}

// fetch() ugyanazokkal a beállításokkal, de az átirányításokat lépésenként
// követjük, és minden lépésnél ellenőrizzük a címet. A válasz `vegsoUrl`
// mezője az utolsó (tényleges) cím.
async function biztonsagosFetch(url, opts = {}, maxLepes = 6) {

    let cel = String(url);

    for (let lepes = 0; lepes <= maxLepes; lepes++) {

        if (!(await urlRendben(cel))) throw tiltott(cel);

        const res = await fetch(cel, { ...opts, redirect: "manual" });
        const hova = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;

        if (!hova) {
            Object.defineProperty(res, "vegsoUrl", { value: cel });
            return res;
        }

        try { if (res.body) await res.body.cancel(); } catch (e) { /* nem baj */ }

        cel = new URL(hova, cel).toString();

    }

    throw new Error("too_many_redirects");

}

module.exports = { biztonsagosFetch, urlRendben, hostRendben, privatIp };
