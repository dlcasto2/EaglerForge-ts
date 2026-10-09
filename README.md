# EaglercraftX 1.8 + EaglerForge client (TypeScript)

TypeScript source for the single-file `processed (1).html` client (EFI v2.7.97 on 1.8).
`npm run build` produces `dist/index.html`, a drop-in replacement for the original file.

```
npm install
npm run build      # -> dist/index.html
npm run typecheck  # type-check only
```

## Layout

| Path | What it is |
| --- | --- |
| `src/boot/launch-options.ts` | `window.eaglercraftXOpts` (relays, worlds DB, etc.) |
| `src/boot/launch-countdown.ts` | Boot countdown screen; starts the game. Assets are injected at build time. |
| `src/perf-tweaks.ts` | Render-scale cap + fast video settings |
| `src/modapi/postinit.ts` | EaglerForge ModAPI post-init (**no backticks or backslashes**; it is also injected into the singleplayer server worker as a string) |
| `src/modapi/modloader.ts` | EaglerML mod loader (IndexedDB mod storage) |
| `src/modapi/guikit.ts` | Mod manager GUI |
| `src/modapi/patchesreg-events.ts`, `injector-flag.ts` | Small EaglerForge stubs |
| `src/mods/apple-rp-fix.ts` | Apple Resource Pack Upload Fix v2.0.0 (built in, runs at page load; only active on iPhone/iPad/Mac) |
| `src/mods/builtin/*.ts` | Built-in EaglerForge mods (currently Auto Jump 1.2). The mod loader runs them like uploaded mods. |
| `packs/tidewake-shaders/` | Tidewake Shaders, baked into the built-in assets at build time (edit the `.fsh` files to tweak) |
| `tools/epk.mjs` | Reader/writer for the game's EPK asset format |
| `src/types/globals.d.ts` | Shared global types (`ModAPI`, `eaglercraftXOpts`, mod loader functions, `Window` additions) |
| `vendor/classes.js` | TeaVM-compiled game (68 MB, generated from Java) - kept as JavaScript |
| `vendor/assets.epk` | Game asset pack (was base64 in the HTML) |
| `tools/extract-vendor.mjs` | Re-extracts both vendor files from an original single-file client: `npm run vendor -- "path/to/processed (1).html"` |
| `index.template.html` | HTML shell; `<!-- @inline ... -->` markers are filled by `build.mjs` |

## Notes

- All scripts are classic (non-module) scripts sharing one global scope, same as the original `<script>` tags.
- `tsc` runs in `strict` mode. The `"use strict"` directive it adds is stripped again for files that were not strict originally.
- `vendor/classes.js` is machine-generated TeaVM output; to change game code, rebuild it from the Java source
  (https://gitlab.com/lax1dude/eaglercraftx-1.8/) and re-run the EaglerForge injector, then replace the file.

## Built-in content

- **Tidewake Shaders** replace the stock "High Performance PBR" shader files and the sun, moon and water
  textures in `assets.epk`. Turn them on in Options > Video Settings > Shaders. `NO_PACKS=1 npm run build`
  builds with stock assets. Add more packs to `BUILTIN_PACKS` in `build.mjs` (later packs win).
- **Auto Jump**: press J or type `.autojump` (`.autojump settings` for options). If you had uploaded
  Auto Jump before, delete it in the Mod Manager so only the built-in copy runs.
- **Apple Resource Pack Fix**: shows a "Tap to choose resource pack" button on Safari/iOS. `appleRPFix.test()`
  in the console opens it for testing.
- To add another mod, drop a `.ts` file in `src/mods/builtin/` and rebuild.
