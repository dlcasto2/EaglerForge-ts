// Extracts vendor/classes.js and vendor/assets.epk from an original single-file
// client (e.g. horrible-cemetery's "processed (1).html").
//   node tools/extract-vendor.mjs "path/to/processed (1).html"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2];
if (!src) {
    console.error("usage: node tools/extract-vendor.mjs <original.html>");
    process.exit(1);
}
const html = readFileSync(src, "utf8");

function indexOrDie(needle, from = 0) {
    const i = html.indexOf(needle, from);
    if (i < 0) throw new Error("marker not found: " + JSON.stringify(needle.slice(0, 60)));
    return i;
}

// classes.js is the second <script type="text/javascript"> (after the launch
// options) and ends with its source map comment. It contains "<script>" string
// literals, so it is located by these markers rather than by parsing tags.
const OPEN = '<script type="text/javascript">';
const first = indexOrDie(OPEN);
const classesStart = indexOrDie(OPEN, first + OPEN.length) + OPEN.length;
const mapAt = indexOrDie("//# sourceMappingURL=../classes.js.map", classesStart);
const classesEnd = indexOrDie("</script>", mapAt);
const classes = html.slice(classesStart, classesEnd);

// The asset pack is the base64 data URI in the launch countdown script.
const PREFIX = 'window.eaglercraftXOpts.assetsURI = "data:application/octet-stream;base64,';
const assetsStart = indexOrDie(PREFIX, classesEnd) + PREFIX.length;
const assetsEnd = indexOrDie('"', assetsStart);
const assets = Buffer.from(html.slice(assetsStart, assetsEnd), "base64");
if (assets.subarray(0, 8).toString("latin1") !== "EAGPKG$$") throw new Error("assets are not an EPK file");

mkdirSync(join(root, "vendor"), { recursive: true });
writeFileSync(join(root, "vendor/classes.js"), classes);
writeFileSync(join(root, "vendor/assets.epk"), assets);
console.log(`vendor/classes.js (${(classes.length / 1048576).toFixed(1)} MB), vendor/assets.epk (${(assets.length / 1048576).toFixed(1)} MB)`);
