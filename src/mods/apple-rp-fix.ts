/*
 * Apple Resource Pack Upload Fix  v2.0.0
 * For Eaglercraft 1.8.8 (EaglercraftX u53) + EaglerForge Injector (EFI)
 * on macOS Safari and iPhone / iPad (iOS / iPadOS 26)
 *
 * WHY UPLOADS FAIL ON APPLE DEVICES
 *   1. Eaglercraft opens the file picker from its game loop, not directly
 *      inside your tap. WebKit (Safari, and every browser on iOS) blocks that
 *      without any message.
 *   2. The picker only accepts files tagged as "application/zip". The iOS
 *      Files app often doesn't tag .zip files that way, so they appear greyed out.
 *
 * WHAT THIS MOD DOES
 *   - Hooks the game's own displayFileChooser method through EFI's ModAPI,
 *     and also catches any file input the page creates, however it is opened.
 *   - Removes the zip-only filter.
 *   - Shows a "Tap to choose resource pack" button. Your tap counts as a real
 *     gesture, so the picker opens and the file goes back to the game as usual.
 *   - When it starts, it briefly shows "Resource pack fix loaded" so you can
 *     tell it's running.
 *
 * BUILT IN
 *   This copy is compiled into the client (see build.mjs), so it no longer has
 *   to be installed from the Mods menu. It runs on every page load.
 */
(function() {
    "use strict";

    /** A file input we have already handled (so our own hooks let it through). */
    type RPInput = HTMLInputElement & { __rpfixShown?: boolean };
    type AnyFn = (...args: any[]) => any;

    // ---------- Settings ----------
    var FORCE_ON_ALL_PLATFORMS = false; // true = also run on Windows, Android, etc.
    var SHOW_LOADED_TOAST = true; // brief on-screen "loaded" message
    var DEBUG = /[?&]rpfixdebug\b/.test(location.search); // add ?rpfixdebug to the URL for logs on screen

    var TAG = "[AppleRPFix]";
    var g: Window = (typeof window !== "undefined" ? window : globalThis as unknown) as Window;
    if (g.__appleRPFix) return;
    if (g.isAddonDisabled && g.isAddonDisabled("rpfix")) {
        console.log(TAG, "disabled by URL");
        return;
    }

    // ---------- Platform detection ----------
    var ua = navigator.userAgent || "";
    var isIOS =
        /iPhone|iPad|iPod/.test(ua) ||
        (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); // iPadOS "desktop" mode
    var isMac = /Macintosh|Mac OS X/.test(ua) && !isIOS;
    var isWebKit =
        /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua);
    var strict = isIOS || isWebKit; // every iOS browser is WebKit, and so is Safari
    var enabled = isIOS || isMac || FORCE_ON_ALL_PLATFORMS;

    // ---------- Logging ----------
    var logBox: HTMLDivElement | null = null;

    function log(...parts: unknown[]): void {
        var msg = parts.join(" ");
        try {
            console.log(TAG, msg);
        } catch (e) {}
        if (!DEBUG) return;
        try {
            if (!logBox) {
                logBox = document.createElement("div");
                logBox.style.cssText =
                    "position:fixed;left:4px;bottom:4px;max-width:90vw;max-height:35vh;overflow:auto;" +
                    "z-index:2147483646;background:rgba(0,0,0,.75);color:#0f0;font:11px monospace;" +
                    "padding:4px;pointer-events:none;white-space:pre-wrap;";
                (document.body || document.documentElement).appendChild(logBox);
            }
            logBox!.textContent += msg + "\n";
            logBox!.scrollTop = logBox!.scrollHeight;
        } catch (e) {}
    }

    function toast(text: string): void {
        try {
            var t = document.createElement("div");
            t.textContent = text;
            t.style.cssText =
                "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
                "background:#3c8527;color:#fff;padding:8px 14px;border-radius:8px;" +
                "font:600 14px -apple-system,Helvetica,Arial,sans-serif;pointer-events:none;" +
                "box-shadow:0 4px 14px rgba(0,0,0,.4);transition:opacity .4s;";
            var add = function() {
                (document.body || document.documentElement).appendChild(t);
                setTimeout(function() {
                    t.style.opacity = "0";
                }, 3000);
                setTimeout(function() {
                    t.remove();
                }, 3500);
            };
            if (document.body) add();
            else document.addEventListener("DOMContentLoaded", add);
        } catch (e) {}
    }

    log("UA:", ua);
    log("iOS:", isIOS, "Mac:", isMac, "WebKit:", isWebKit, "enabled:", enabled);
    if (!enabled) return;

    // Native click lives on HTMLElement.prototype; save it before anything patches it
    var nativeClick = HTMLElement.prototype.click;
    var nativeShowPicker = HTMLInputElement.prototype.showPicker;

    function isFileInput(el: unknown): el is RPInput {
        try {
            return el instanceof HTMLInputElement && String(el.type).toLowerCase() === "file";
        } catch (e) {
            return false;
        }
    }

    function hasUserActivation(): boolean {
        try {
            return !!(navigator.userActivation && navigator.userActivation.isActive);
        } catch (e) {
            return false;
        }
    }

    // Should we show our button instead of opening directly?
    function needButton(): boolean {
        if (strict) return true; // WebKit needs a live tap; userActivation can't be trusted there
        return !hasUserActivation();
    }

    // ---------- Prepare the game's input ----------
    function prepareInput(input: RPInput): void {
        try {
            input.removeAttribute("accept");
        } catch (e) {}
        if (!input.isConnected && document.body) {
            input.style.cssText =
                "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;";
            input.setAttribute("data-apple-rp-fix", "1");
            document.body.appendChild(input);
            var cleanup = function() {
                setTimeout(function() {
                    if (input.parentNode && input.getAttribute("data-apple-rp-fix") === "1") input.remove();
                }, 1500);
            };
            input.addEventListener("change", cleanup, {
                once: true
            });
            input.addEventListener("cancel", cleanup, {
                once: true
            });
        }
    }

    // ---------- The button overlay ----------
    var overlay: HTMLDivElement | null = null;

    function closeOverlay(): void {
        if (overlay) overlay.remove();
        overlay = null;
    }

    function showOverlay(input: RPInput): void {
        if (input.__rpfixShown) return;
        input.__rpfixShown = true;
        prepareInput(input);
        log("Showing picker button");
        closeOverlay();
        try {
            if (document.pointerLockElement) document.exitPointerLock();
        } catch (e) {}

        var box = document.createElement("div");
        overlay = box;
        overlay.setAttribute("data-apple-rp-fix-overlay", "1");
        overlay.style.cssText =
            "position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;display:flex;" +
            "align-items:center;justify-content:center;background:rgba(0,0,0,.6);" +
            "touch-action:manipulation;-webkit-user-select:none;user-select:none;" +
            "font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;";
        overlay.innerHTML =
            '<div style="background:#1e1e1e;border:2px solid #555;border-radius:12px;padding:20px;' +
            'max-width:320px;width:calc(100% - 32px);text-align:center;color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.5)">' +
            '<div style="font-size:18px;font-weight:600;margin-bottom:8px">Add a resource pack</div>' +
            '<div style="font-size:14px;color:#bbb;margin-bottom:16px">Choose a .zip resource pack from Files or Finder.</div>' +
            '<button type="button" data-act="pick" style="display:block;width:100%;padding:14px;font-size:16px;' +
            'font-weight:600;border:none;border-radius:8px;background:#3c8527;color:#fff;margin-bottom:10px;' +
            '-webkit-appearance:none;cursor:pointer">Tap to choose resource pack</button>' +
            '<button type="button" data-act="cancel" style="display:block;width:100%;padding:12px;font-size:15px;' +
            'border:none;border-radius:8px;background:#444;color:#fff;-webkit-appearance:none;cursor:pointer">Cancel</button>' +
            "</div>";

        ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchmove",
            "wheel", "contextmenu", "keydown", "keyup"
        ].forEach(function(type) {
            box.addEventListener(type, function(e) {
                e.stopPropagation();
            });
        });

        var done = false;

        function act(e: Event): void {
            var target = e.target as Element | null;
            var btn = target && target.closest ? target.closest("button[data-act]") : null;
            if (!btn) return;
            e.stopPropagation();
            if (e.cancelable) e.preventDefault();
            if (done) return;
            done = true;
            closeOverlay();
            if (btn.getAttribute("data-act") === "pick") {
                log("Opening native picker inside tap");
                nativeClick.call(input); // inside a real gesture, so WebKit allows it
            } else {
                input.__rpfixShown = false;
                try {
                    input.dispatchEvent(new Event("cancel"));
                } catch (err) {}
            }
        }
        box.addEventListener("touchend", act);
        box.addEventListener("click", act);

        (document.body || document.documentElement).appendChild(box);
    }

    // Called whenever something tries to open a file picker
    function handleOpen<T>(input: RPInput, how: string, fallback: () => T): T | undefined {
        log("File picker requested via", how, "accept=", input.getAttribute("accept"));
        if (needButton()) {
            showOverlay(input);
        } else {
            prepareInput(input);
            input.__rpfixShown = true;
            return fallback();
        }
    }

    // ---------- Hook 1: element.click() ----------
    HTMLElement.prototype.click = function(this: HTMLElement): void {
        if (isFileInput(this) && !this.__rpfixShown) {
            var self = this;
            handleOpen(this, "click()", function() {
                return nativeClick.call(self);
            });
            return;
        }
        return nativeClick.call(this);
    };
    // Some engines put click on HTMLInputElement too
    try {
        Object.defineProperty(HTMLInputElement.prototype, "click", {
            configurable: true,
            writable: true,
            value: HTMLElement.prototype.click
        });
    } catch (e) {}

    // ---------- Hook 2: input.showPicker() ----------
    if (nativeShowPicker) {
        HTMLInputElement.prototype.showPicker = function(this: HTMLInputElement): void {
            if (isFileInput(this) && !this.__rpfixShown) {
                var self = this;
                handleOpen(this, "showPicker()", function() {
                    return nativeShowPicker.call(self);
                });
                return;
            }
            return nativeShowPicker.call(this);
        };
    }

    // ---------- Hook 3: dispatchEvent(new MouseEvent("click")) ----------
    var nativeDispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function(this: EventTarget, evt: Event): boolean {
        if (evt && evt.type === "click" && isFileInput(this) && !this.__rpfixShown) {
            var self = this;
            return handleOpen(this, "dispatchEvent", function() {
                return nativeDispatch.call(self, evt);
            }) !== false;
        }
        return nativeDispatch.call(this, evt);
    };

    // ---------- Hook 4: remember file inputs the game creates ----------
    var lastFileInput: { el: RPInput; t: number } | null = null;
    var nativeCreate = Document.prototype.createElement as (this: Document, tag: string, options?: ElementCreationOptions) => HTMLElement;
    (Document.prototype as { createElement: AnyFn }).createElement = function(this: Document, tag: string, options?: ElementCreationOptions): HTMLElement {
        var el = nativeCreate.call(this, tag, options);
        if (typeof tag === "string" && tag.toLowerCase() === "input") {
            // type is set right after creation, so check a moment later
            Promise.resolve().then(function() {
                if (isFileInput(el)) lastFileInput = {
                    el: el,
                    t: Date.now()
                };
            });
            try {
                el.addEventListener("change", function() {}, {
                    once: true,
                    passive: true
                });
            } catch (e) {}
        }
        return el;
    };

    // ---------- Hook 5: the game's own displayFileChooser (via EFI ModAPI) ----------
    function hookGameMethod(): boolean {
        try {
            if (typeof ModAPI === "undefined" || !ModAPI.hooks || !ModAPI.hooks.methods) return false;
            var methods = ModAPI.hooks.methods;
            var keys: string[] = [];
            try {
                var k = ModAPI.util.getMethodFromPackage(
                    "net.lax1dude.eaglercraft.v1_8.internal.PlatformApplication", "displayFileChooser");
                if (k && methods[k]) keys.push(k);
            } catch (e) {}
            if (!keys.length) {
                Object.keys(methods).forEach(function(name) {
                    if (/PlatformApplication_displayFileChooser/.test(name)) keys.push(name);
                });
            }
            if (!keys.length) {
                log("displayFileChooser not found in ModAPI");
                return false;
            }

            keys.forEach(function(key) {
                var original = methods[key];
                if ((original as { __rpfix?: boolean }).__rpfix) return;
                var wrapped: AnyFn & { __rpfix?: boolean } = function(this: unknown, ...args: unknown[]) {
                    log("Game called", key);
                    var before = Date.now();
                    var result = original.apply(this, args);
                    // If the click hooks didn't catch it, grab the input the game just made
                    Promise.resolve().then(function() {
                        var li = lastFileInput;
                        if (li && li.t >= before - 50 && !li.el.__rpfixShown && needButton()) {
                            log("Click hooks missed it; using the input from createElement");
                            showOverlay(li.el);
                        }
                    });
                    return result;
                };
                wrapped.__rpfix = true;
                methods[key] = wrapped;
                log("Hooked", key);
            });
            return true;
        } catch (e) {
            log("ModAPI hook failed:", e instanceof Error ? e.message : e);
            return false;
        }
    }
    if (!hookGameMethod()) {
        // ModAPI may not be ready yet; retry for a few seconds
        var tries = 0;
        var iv: ReturnType<typeof setInterval> = setInterval(function() {
            if (hookGameMethod() || ++tries > 20) clearInterval(iv);
        }, 500);
    }

    // ---------- EFI metadata (only when loaded through the mod loader) ----------
    try {
        var cs = document.currentScript;
        if (typeof ModAPI !== "undefined" && ModAPI.meta && cs && cs.getAttribute("data-isMod") === "true") {
            ModAPI.meta.title("Apple Resource Pack Fix");
            ModAPI.meta.version("v2.0.0");
            ModAPI.meta.description("Lets you add resource packs on macOS Safari and iPhone/iPad.");
            ModAPI.meta.credits("Made for Allen");
        }
    } catch (e) {}

    g.__appleRPFix = {
        version: "2.0.0",
        // For testing from the console: appleRPFix.test()
        test: function() {
            var i = document.createElement("input");
            i.type = "file";
            i.addEventListener("change", function() {
                log("Test picked:", i.files && i.files[0] && i.files[0].name);
            });
            i.click();
        }
    };
    g.appleRPFix = g.__appleRPFix;

    log("Loaded v2.0.0");
    if (SHOW_LOADED_TOAST) toast("Resource pack fix loaded");
})();