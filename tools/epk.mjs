// Minimal reader/writer for Eaglercraft EPK v2 asset packs (the format of vendor/assets.epk).
//
// Layout:
//   "EAGPKG$$" | u8 len + "ver2.0" | u8 len + file name | u16 len + comment
//   | i64 timestamp | i32 block count | u8 compression ('G' = gzip)
//   | gzip( blocks... "END$" ) | ":::YEE:>"
// Blocks:
//   "HEAD" u8 len + key | i32 len + value | ">"
//   "FILE" u8 len + name | i32 (4 + data + 1) | u32 crc32(data) | data | ":" | ">"
import { gzipSync, gunzipSync, crc32 } from "node:zlib";

const MAGIC = Buffer.from("EAGPKG$$", "latin1");
const TAIL = Buffer.from(":::YEE:>", "latin1");

/** @returns {{ header: Buffer, heads: [string, Buffer][], files: Map<string, Buffer> }} */
export function readEPK(buf) {
    if (!buf.subarray(0, 8).equals(MAGIC)) throw new Error("not an EPK file");
    let p = 8;
    p += 1 + buf[p];                 // version
    p += 1 + buf[p];                 // file name
    p += 2 + buf.readUInt16BE(p);    // comment
    p += 8;                          // timestamp
    const headerEnd = p;             // block count + compression follow
    p += 4;
    if (buf[p] !== 0x47 /* G */) throw new Error("only gzip EPKs are supported");
    p += 1;
    if (!buf.subarray(buf.length - 8).equals(TAIL)) throw new Error("bad EPK tail");
    const b = gunzipSync(buf.subarray(p, buf.length - 8));

    const heads = [];
    const files = new Map();
    let q = 0;
    for (;;) {
        const type = b.toString("latin1", q, q + 4); q += 4;
        if (type === "END$") break;
        if (type === "HEAD") {
            const kl = b[q]; const key = b.toString("utf8", q + 1, q + 1 + kl); q += 1 + kl;
            const vl = b.readInt32BE(q); const val = b.subarray(q + 4, q + 4 + vl); q += 4 + vl;
            if (b[q] !== 0x3e) throw new Error("bad HEAD block"); q += 1;
            heads.push([key, Buffer.from(val)]);
        } else if (type === "FILE") {
            const nl = b[q]; const name = b.toString("utf8", q + 1, q + 1 + nl); q += 1 + nl;
            const len = b.readInt32BE(q); const crc = b.readUInt32BE(q + 4); q += 8;
            const data = Buffer.from(b.subarray(q, q + len - 5)); q += len - 5;
            if (crc32(data) !== crc) throw new Error("CRC mismatch: " + name);
            if (b[q] !== 0x3a || b[q + 1] !== 0x3e) throw new Error("bad FILE block: " + name); q += 2;
            files.set(name, data);
        } else {
            throw new Error("unknown EPK block " + JSON.stringify(type));
        }
    }
    return { header: Buffer.from(buf.subarray(0, headerEnd)), heads, files };
}

export function writeEPK({ header, heads, files }) {
    const parts = [];
    for (const [key, val] of heads) {
        const k = Buffer.from(key, "utf8");
        const n = Buffer.alloc(4); n.writeInt32BE(val.length);
        parts.push(Buffer.from("HEAD", "latin1"), Buffer.from([k.length]), k, n, val, Buffer.from(">", "latin1"));
    }
    for (const [name, data] of files) {
        const nm = Buffer.from(name, "utf8");
        if (nm.length > 255) throw new Error("EPK file name too long: " + name);
        const meta = Buffer.alloc(8); meta.writeInt32BE(data.length + 5, 0); meta.writeUInt32BE(crc32(data), 4);
        parts.push(Buffer.from("FILE", "latin1"), Buffer.from([nm.length]), nm, meta, data, Buffer.from(":>", "latin1"));
    }
    parts.push(Buffer.from("END$", "latin1"));
    const count = Buffer.alloc(5); count.writeInt32BE(heads.length + files.size, 0); count[4] = 0x47;
    return Buffer.concat([header, count, gzipSync(Buffer.concat(parts), { level: 9 }), TAIL]);
}
