/* Performance tweaks (added for Allen)
 * 1) Render scale cap: on high-DPI screens the game normally renders at 1.5-3x the pixels
 *    (canvas size = window size x devicePixelRatio). This caps it at 1x, which is often the
 *    single biggest FPS boost on laptops/phones. Override with ?renderScale=1.5 (or 2, etc.) in the URL.
 * 2) Fast video settings: applied every launch until you save any option yourself, after that
 *    your own choices always win. To reapply, run localStorage.removeItem("perfTweaks.saved") and reload.
 * 3) Safari / iOS: VSync is always kept ON. With VSync off, WebKit runs the game loop ahead of
 *    keyboard events and WASD stops working. Add ?vsync=off to the URL to skip this.
 * Turn all of this off with ?disable=perftweaks in the URL.
 */
(function () {
    "use strict";
    if (window.isAddonDisabled("perftweaks")) {
        console.log("[PerfTweaks] disabled by URL");
        return;
    }

    /** The subset of TeaVM's net.minecraft.client.settings.GameSettings fields touched here. */
    interface TeaVMGameSettings {
        $enableVsync: number;
        $limitFramerate: number;
        $fancyGraphics: number;
        $ambientOcclusion: number;
        $renderDistanceChunks: number;
        $clouds: number;
        $particleSetting: number;
        $mipmapLevels: number;
        $shaders: number;
        $fxaa: number;
        $enableDynamicLights: number;
        $connectedTexturesOF: number;
        $customSkyOF: number;
        $customItemsOF: number;
        $betterGrassOF: number;
        $smartLeavesOF: number;
    }

    var H = ModAPI.hooks.methods;
    var q = new URLSearchParams(location.search);
    var scale = parseFloat(q.get("renderScale") ?? "");
    if (!(scale > 0)) scale = 1;

    var dprName = "nlevi_PlatformInput_getDevicePixelRatio$js_body$_30";
    var origDpr = H[dprName];
    if (typeof origDpr === "function") {
        H[dprName] = function (this: unknown, ...args: [win: Window, ...rest: unknown[]]): number {
            var r: number = origDpr.apply(this, args);
            return r > scale ? scale : r;
        };
    }

    var forceVsync = window.isAppleWebKit() && q.get("vsync") !== "off";

    var FLAG = "perfTweaks.saved";
    function saved(): boolean { try { return localStorage.getItem(FLAG) === "1"; } catch (e) { return true; } }

    var loadName = "nmcs_GameSettings_loadOptions";
    var origLoad = H[loadName];
    if (typeof origLoad === "function") {
        H[loadName] = function (this: unknown, ...args: [$this: TeaVMGameSettings | null, ...rest: unknown[]]) {
            var $this = args[0];
            var ret = origLoad.apply(this, args);
            var t = ModAPI.hooks._teavm;
            if (t && t.$rt_suspending && t.$rt_suspending()) return ret;
            if (forceVsync && $this) {
                // also fixes settings saved earlier with VSync off
                $this.$enableVsync = 1;
                console.log("[PerfTweaks] Safari/WebKit: VSync kept on so movement keys work");
            }
            if (!saved() && $this) {
                try {
                    $this.$enableVsync = forceVsync ? 1 : 0; // VSync off (uncapped FPS), except on WebKit
                    if (!forceVsync) $this.$limitFramerate = 260; // "Unlimited"
                    $this.$fancyGraphics = 0;        // Fast graphics
                    $this.$ambientOcclusion = 0;     // Smooth lighting off
                    $this.$renderDistanceChunks = Math.min($this.$renderDistanceChunks || 4, 4);
                    $this.$clouds = 0;               // Clouds off
                    $this.$particleSetting = 1;      // Particles: decreased
                    $this.$mipmapLevels = 0;         // Mipmaps off
                    $this.$shaders = 0;              // PBR shaders off
                    $this.$fxaa = 2;                 // FXAA off
                    $this.$enableDynamicLights = 0;  // Dynamic lights off
                    $this.$connectedTexturesOF = 0;  // Connected textures off (faster chunk loading)
                    $this.$customSkyOF = 0;
                    $this.$customItemsOF = 0;
                    $this.$betterGrassOF = 0;
                    $this.$smartLeavesOF = 0;
                    console.log("[PerfTweaks] fast video settings applied");
                } catch (e) { console.warn("[PerfTweaks]", e); }
            }
            return ret;
        };
    }

    var saveName = "nmcs_GameSettings_saveOptions";
    var origSave = H[saveName];
    if (typeof origSave === "function") {
        H[saveName] = function (this: unknown, ...args: unknown[]) {
            var ret = origSave.apply(this, args);
            try { localStorage.setItem(FLAG, "1"); } catch (e) { }
            return ret;
        };
    }
    console.log("[PerfTweaks] loaded, render scale cap " + scale + "x");
})();
