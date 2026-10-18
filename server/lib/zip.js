// ============================================================
//  ZIP olvasás és írás külső csomag nélkül (Node zlib)
//
//  - kibont(buf)   az ANAF válasz-ZIP-je (a számla XML + az ANAF aláírása)
//  - keszit(lista) a havi csomag a könyvelőnek: [{ nev, adat }] → Buffer
//
//  Csak az egyszerű ZIP-et kezeli (tárolt / deflate, ZIP64 nélkül) – az
//  ANAF válaszai és a saját csomagjaink ilyenek.
// ============================================================

const zlib = require("zlib");

const CRC_TABLA = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLA[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

// DOS dátum / idő a ZIP fejlécbe
function dosIdo(d = new Date()) {
    const ido = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const nap = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { ido, nap };
}

// [{ nev, adat (Buffer | string) }] → ZIP Buffer
function keszit(lista) {
    const helyi = [];
    const kozponti = [];
    let eltolas = 0;
    const { ido, nap } = dosIdo();
    const nevek = new Set();

    for (const f of lista) {
        let nev = String(f.nev || "fajl").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\.\//g, "");
        // ugyanaz a név kétszer: sorszám a végére
        if (nevek.has(nev)) {
            const m = nev.match(/^(.*?)(\.[^./]+)?$/);
            let i = 2;
            while (nevek.has(`${m[1]} (${i})${m[2] || ""}`)) i++;
            nev = `${m[1]} (${i})${m[2] || ""}`;
        }
        nevek.add(nev);
        const nevBuf = Buffer.from(nev, "utf8");
        const adat = Buffer.isBuffer(f.adat) ? f.adat : Buffer.from(String(f.adat ?? ""), "utf8");
        const tomor = zlib.deflateRawSync(adat, { level: 9 });
        const tarolt = tomor.length < adat.length;
        const kiirt = tarolt ? tomor : adat;
        const crc = crc32(adat);
        const modszer = tarolt ? 8 : 0;

        const fej = Buffer.alloc(30);
        fej.writeUInt32LE(0x04034b50, 0);
        fej.writeUInt16LE(20, 4);
        fej.writeUInt16LE(0x0800, 6);           // UTF-8 nevek
        fej.writeUInt16LE(modszer, 8);
        fej.writeUInt16LE(ido, 10);
        fej.writeUInt16LE(nap, 12);
        fej.writeUInt32LE(crc, 14);
        fej.writeUInt32LE(kiirt.length, 18);
        fej.writeUInt32LE(adat.length, 22);
        fej.writeUInt16LE(nevBuf.length, 26);
        fej.writeUInt16LE(0, 28);
        helyi.push(fej, nevBuf, kiirt);

        const k = Buffer.alloc(46);
        k.writeUInt32LE(0x02014b50, 0);
        k.writeUInt16LE(20, 4);
        k.writeUInt16LE(20, 6);
        k.writeUInt16LE(0x0800, 8);
        k.writeUInt16LE(modszer, 10);
        k.writeUInt16LE(ido, 12);
        k.writeUInt16LE(nap, 14);
        k.writeUInt32LE(crc, 16);
        k.writeUInt32LE(kiirt.length, 20);
        k.writeUInt32LE(adat.length, 24);
        k.writeUInt16LE(nevBuf.length, 28);
        k.writeUInt32LE(eltolas, 42);
        kozponti.push(k, nevBuf);

        eltolas += fej.length + nevBuf.length + kiirt.length;
    }

    const kozpontiBuf = Buffer.concat(kozponti);
    const veg = Buffer.alloc(22);
    veg.writeUInt32LE(0x06054b50, 0);
    veg.writeUInt16LE(lista.length, 8);
    veg.writeUInt16LE(lista.length, 10);
    veg.writeUInt32LE(kozpontiBuf.length, 12);
    veg.writeUInt32LE(eltolas, 16);
    return Buffer.concat([...helyi, kozpontiBuf, veg]);
}

// ZIP Buffer → [{ nev, adat }]
function kibont(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 22) return [];
    // a központi könyvtár vége (hátulról keresve)
    let v = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { v = i; break; }
    }
    if (v < 0) return [];
    const db = buf.readUInt16LE(v + 10);
    let p = buf.readUInt32LE(v + 16);
    const ki = [];
    for (let n = 0; n < db && p + 46 <= buf.length; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) break;
        const modszer = buf.readUInt16LE(p + 10);
        const tomor = buf.readUInt32LE(p + 20);
        const nevHossz = buf.readUInt16LE(p + 28);
        const extraHossz = buf.readUInt16LE(p + 30);
        const megjHossz = buf.readUInt16LE(p + 32);
        const helyiEl = buf.readUInt32LE(p + 42);
        const nev = buf.toString("utf8", p + 46, p + 46 + nevHossz);
        p += 46 + nevHossz + extraHossz + megjHossz;
        if (nev.endsWith("/")) continue;
        const lh = helyiEl;
        if (buf.readUInt32LE(lh) !== 0x04034b50) continue;
        const kezd = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
        const nyers = buf.subarray(kezd, kezd + tomor);
        let adat;
        try {
            adat = modszer === 8 ? zlib.inflateRawSync(nyers) : modszer === 0 ? Buffer.from(nyers) : null;
        } catch (e) { adat = null; }
        if (adat) ki.push({ nev, adat });
    }
    return ki;
}

module.exports = { keszit, kibont, crc32 };
