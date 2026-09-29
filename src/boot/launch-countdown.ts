"use strict";
/**
 * Boot screen: embeds the game assets, runs the 5 second launch countdown and
 * then starts the TeaVM client + EaglerForge post-init.
 *
 * `__EAGLER_ASSETS_URI__` is replaced at build time with a data: URI of
 * vendor/assets.epk (see build.mjs).
 */
declare const __EAGLER_ASSETS_URI__: string;

(function () {
	window.eaglercraftXOpts.assetsURI = __EAGLER_ASSETS_URI__;

	var launchInterval: ReturnType<typeof setInterval> | undefined = undefined;
	var launchCounter = 1;
	var launchCountdownNumberElement: HTMLElement | null = null;
	var launchCountdownProgressElement: HTMLElement | null = null;
	var launchSkipCountdown = false;

	var launchTick = function (): void {
		launchCountdownNumberElement!.innerText = "" + Math.floor(6.0 - launchCounter * 0.06);
		launchCountdownProgressElement!.style.width = "" + launchCounter + "%";
		if (++launchCounter > 100 || launchSkipCountdown) {
			clearInterval(launchInterval);
			setTimeout(function () { document.body.removeChild(document.getElementById("launch_countdown_screen")!); document.body.style.backgroundColor = "black"; main(); ModAPI.hooks._postInit(); }, 50);
		}
	};

	// The chunked web build runs this after the page has already loaded.
	(function (f: () => void) { document.readyState === "complete" ? f() : window.addEventListener("load", f); })(function () {
		launchCountdownNumberElement = document.getElementById("launchCountdownNumber");
		launchCountdownProgressElement = document.getElementById("launchCountdownProgress");
		launchInterval = setInterval(launchTick, 50);
		document.getElementById("skipCountdown")!.addEventListener("click", function () {
			launchSkipCountdown = true;
		});
		document.getElementById("bootMenu")!.addEventListener("click", function () {
			launchSkipCountdown = true;
			window.eaglercraftXOpts.showBootMenuOnLaunch = true;
		});
	});
})();
