// Builds dist/index.html: compiles src/**/*.ts with tsc, then inlines the
// compiled scripts, the vendored TeaVM client and the asset pack into
// index.template.html, reproducing the original single-file client.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readEPK, writeEPK } from "./tools/epk.mjs";
import { gzipSync } from "node:zlib";
import { rmSync } from "node:fs";

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

// 1) Type-check and compile TypeScript -> build/
console.log("[build] tsc");
execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", root], { stdio: "inherit" });

// 2) Build-time values
const MODAPI_VERSION = "v2.7.97";

// Resource packs baked into the built-in assets (later packs win). Each pack's
// assets/** files replace or add to vendor/assets.epk. Build with NO_PACKS=1 to
// get the stock assets.
const BUILTIN_PACKS = ["packs/tidewake-shaders"];

function listFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]);
}

function buildAssets() {
    const base = readFileSync(join(root, "vendor/assets.epk"));
    if (process.env.NO_PACKS === "1") return base;
    const epk = readEPK(base);
    for (const pack of BUILTIN_PACKS) {
        const packRoot = join(root, pack);
        let replaced = 0, added = 0;
        for (const file of listFiles(join(packRoot, "assets"))) {
            const name = relative(packRoot, file).split(sep).join("/");
            epk.files.has(name) ? replaced++ : added++;
            epk.files.set(name, readFileSync(file));
        }
        console.log(`[build] pack ${pack}: ${replaced} replaced, ${added} added`);
    }
    return writeEPK(epk);
}
const assetsEPK = buildAssets();
const assetsURI = "data:application/octet-stream;base64," + assetsEPK.toString("base64");

// EaglerForge also injects the post-init code into the dedicated (singleplayer)
// server worker, as a template-literal string. That is why postinit.ts must not
// contain backticks or backslashes.
function postinitData() {
    const code = readCompiled("build/modapi/postinit.js");
    if (code.includes("`") || code.includes("\\")) {
        throw new Error("postinit.js must not contain backticks or backslashes");
    }
    const templated = code.replace(`ModAPI.version = "${MODAPI_VERSION}";`, `ModAPI.version = "__modapi_version_code__";`);
    return "globalThis.modapi_postinit = `" + templated + "`;";
}

// Mods compiled into the client. The mod loader (src/modapi/modloader.ts) runs
// these like uploaded mods, so ModAPI.meta / events / require all work.
function builtinMods() {
    const dir = join(root, "build/mods/builtin");
    const mods = readdirSync(dir).filter((f) => f.endsWith(".js")).sort().map((f) => ({
        name: f.replace(/\.js$/, ""),
        code: readCompiled("build/mods/builtin/" + f),
    }));
    for (const m of mods) console.log("[build] built-in mod " + m.name);
    // "<" is escaped so the JSON can never close the <script> tag early
    return "globalThis.modapi_builtinMods = " + JSON.stringify(mods).replace(/</g, "\\u003c") + ";";
}

const special = {
    "@builtin-mods": builtinMods,
    "@postinit-data": postinitData,
    "@libserverside": () => '{"._|_libserverside_|_."}',
};

// tsc (strict) prepends "use strict" to every file. The original scripts were
// mostly sloppy-mode, so strip it again unless the .ts source asks for it.
function readCompiled(ref) {
    let code = read(ref);
    if (ref.startsWith("build/")) {
        const src = read(ref.replace(/^build\//, "src/").replace(/\.js$/, ".ts"));
        if (!src.trimStart().startsWith('"use strict"')) {
            code = code.replace(/^"use strict";\n/, "");
        }
    }
    return code;
}

function load(ref) {
    if (special[ref]) return special[ref]();
    let code = readCompiled(ref);
    if (ref === "build/boot/launch-countdown.js") {
        code = code.replace("__EAGLER_ASSETS_URI__", () => JSON.stringify(assetsURI));
    }
    if (/<\/script/i.test(code)) throw new Error(ref + " contains </script");
    return code;
}

// 3) Inline everything into the template
let html = read("index.template.html");
html = html.replace(/<!-- @inline (\S+) -->/g, (_, ref) => {
    console.log("[build] inline " + ref);
    return load(ref);
});

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/index.html"), html);
console.log(`[build] dist/index.html (${(html.length / 1048576).toFixed(1)} MB)`);

// 4) Chunked web build for the site (dist/web/): the same page, but the game code
//    and assets are served as small Build/*.partNN files that the loader in
//    web/loader.html downloads, joins and starts. Keeps every file under 3 MB.
const PART_SIZE = 3000000;
function writeParts(dir, name, buf) {
    const parts = Math.ceil(buf.length / PART_SIZE);
    for (let i = 0; i < parts; i++) {
        writeFileSync(join(dir, `${name}.part${String(i).padStart(2, "0")}`), buf.subarray(i * PART_SIZE, (i + 1) * PART_SIZE));
    }
    return { parts, size: buf.length };
}

const webDir = join(root, "dist/web");
rmSync(webDir, { recursive: true, force: true });
mkdirSync(join(webDir, "Build"), { recursive: true });
const classesInfo = writeParts(join(webDir, "Build"), "classes.js.gz", gzipSync(readFileSync(join(root, "vendor/classes.js")), { level: 9 }));
const assetsInfo = writeParts(join(webDir, "Build"), "assets.epk", assetsEPK);

let webHtml = read("index.template.html");
let scriptIndex = 0;
webHtml = webHtml.replace(/<script([^>]*)><!-- @inline (\S+) --><\/script>/g, (_, attrs, ref) => {
    scriptIndex++;
    if (ref === "vendor/classes.js") return '<script type="text/x-devon-classes"></script>';
    let code = special[ref] ? special[ref]() : readCompiled(ref);
    if (ref === "build/boot/launch-countdown.js") code = code.replace("__EAGLER_ASSETS_URI__", "window.__devonAssetsURL");
    // launch options run immediately; everything else waits for the game code
    if (ref === "build/boot/launch-options.js") return `<script${attrs}>${code}</script>`;
    const id = (attrs.match(/ id="[^"]*"/) || [""])[0];
    return `<script type="text/x-devon-deferred"${id}>${code}</script>`;
});
const loader = read("web/loader.html").replace(/^<!--.*?-->\n/, "")
    .replace("__DEVON_CLASSES__", JSON.stringify(classesInfo))
    .replace("__DEVON_ASSETS__", JSON.stringify(assetsInfo));
webHtml = webHtml.replace("</body>", "\n" + loader + "</body>");
writeFileSync(join(webDir, "index.html"), webHtml);
console.log(`[build] dist/web/ (classes ${classesInfo.parts} parts, assets ${assetsInfo.parts} parts)`);
