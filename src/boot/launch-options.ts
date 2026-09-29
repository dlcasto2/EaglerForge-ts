"use strict";
var relayId: number = Math.floor(Math.random() * 3);

// %%%%%%%%% launch options %%%%%%%%%%%%

window.eaglercraftXOpts = {
	container: "game_frame",
	worldsDB: "worlds",
	finishOnSwap: false, // perf: skip the gl.finish() stall every frame
	relays: [
		{ addr: "wss://relay.deev.is/", comment: "lax1dude relay #1", primary: relayId == 0 },
		{ addr: "wss://relay.lax1dude.net/", comment: "lax1dude relay #2", primary: relayId == 1 },
		{ addr: "wss://relay.shhnowisnottheti.me/", comment: "ayunami relay #1", primary: relayId == 2 }
	]
};

// %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

// %%%%%%%%% built-in add-on switches %%%%%%%%%
// Turn off built-in add-ons for troubleshooting with a URL parameter, e.g.
//   ?disable=autojump            or   ?disable=perftweaks,rpfix,autojump
// Names: perftweaks, rpfix, autojump
window.isAddonDisabled = function (name: string): boolean {
	var list = (new URLSearchParams(location.search).get("disable") || "").toLowerCase().split(",");
	return list.indexOf(name.toLowerCase()) !== -1 || list.indexOf("all") !== -1;
};

// Safari and every iOS/iPadOS browser use WebKit. WebKit runs the game's
// no-VSync frame loop (MessageChannel "immediate continue") ahead of keyboard
// events, which starves input, so some tweaks behave differently there.
window.isAppleWebKit = function (): boolean {
	var ua = navigator.userAgent || "";
	var isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
	return isIOS || (/AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua));
};
