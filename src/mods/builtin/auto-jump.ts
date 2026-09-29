/*
 * Auto Jump for EaglercraftX 1.8.8 u53 (EaglerForge mod)
 *
 * Works like the auto-jump from newer Minecraft versions: when you walk into a
 * 1-block step, you hop up it by yourself. It won't jump at walls that are 2 or
 * more blocks tall, or when there's no headroom. It also stays off while you're
 * sneaking, flying, swimming, on a ladder or riding something.
 *
 * Toggle: press J in game, or type .autojump in chat.
 * Settings: type .autojump settings in chat, or use the Config button in the Mod Manager.
 *
 * Built in: this copy is compiled into the client and loaded by the mod loader on
 * every launch (see build.mjs / modloader.ts), so it doesn't need to be uploaded.
 */
(function AutoJumpMod() {
    // If an uploaded copy of this mod is also installed, only run once.
    if ((globalThis as { __autoJumpLoaded?: boolean }).__autoJumpLoaded) return;
    if (window.isAddonDisabled && window.isAddonDisabled("autojump")) {
        console.log("[Auto Jump] disabled by URL");
        return;
    }
    (globalThis as { __autoJumpLoaded?: boolean }).__autoJumpLoaded = true;

    /** Fields/methods of the (corrective-proxied) EntityPlayerSP this mod reads. */
    interface PlayerLike {
        onGround: boolean;
        isCollidedHorizontally: boolean;
        posX: number;
        posY: number;
        posZ: number;
        rotationYaw: number;
        moveForward: number;
        moveStrafing: number;
        ridingEntity: unknown;
        capabilities?: { isFlying: boolean };
        isSneaking?: () => boolean;
        isInWater?: () => boolean;
        isInLava?: () => boolean;
        isOnLadder?: () => boolean;
    }
    interface ChatEvent { message?: string; preventDefault: boolean; }
    interface AutoJumpSettings {
        enabled: boolean;
        toggleKey: string;
        lookAhead: number;
        jumpCooldown: number;
        showMessages: boolean;
    }
    type BlockPosCtor = (x: number, y: number, z: number) => unknown;

    ModAPI.meta.title("Auto Jump");
    ModAPI.meta.version("1.2");
    ModAPI.meta.credits("Made for Allen with Claude");
    ModAPI.meta.description("Automatically jumps up 1-block steps like modern Minecraft. Press J or type .autojump to toggle.");

    ModAPI.require("player");
    ModAPI.require("world");

    // ---------------- settings ---------------- //
    const STORAGE_KEY = "autojump_mod_settings";
    const DEFAULTS: AutoJumpSettings = {
        enabled: true,
        toggleKey: "KeyJ",    // keyboard key code used to toggle
        lookAhead: 0.35,      // how far in front of your hitbox to look for a step (blocks)
        jumpCooldown: 4,      // minimum ticks between jumps
        showMessages: true    // print "Auto Jump: ON/OFF" in chat
    };
    let settings: AutoJumpSettings = Object.assign({}, DEFAULTS);
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        settings = Object.assign(settings, saved);
    } catch (e) { }
    function save(): void {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { }
    }

    function chat(msg: string): void {
        try { ModAPI.displayToChat(msg); } catch (e) { }
    }

    function setEnabled(on: boolean): void {
        settings.enabled = on;
        save();
        if (settings.showMessages) {
            chat("§b[Auto Jump] " + (on ? "§aON" : "§cOFF"));
        }
    }

    // ---------------- world helpers ---------------- //
    let blockPosCtor: BlockPosCtor | null = null;
    let worldCheckBroken = false; // if block lookups keep failing, fall back to collision-only mode
    let worldErrors = 0;

    function getBlockPosCtor(): BlockPosCtor {
        if (!blockPosCtor) {
            const cls = ModAPI.reflect.getClassById("net.minecraft.util.BlockPos");
            blockPosCtor = (cls.constructors as BlockPosCtor[]).find((c) => c.length === 3) ?? null;
        }
        return blockPosCtor!;
    }

    // true if the block at x,y,z would stop the player (stone, dirt, planks, glass...)
    // NOTE: never call this from inside the "update" event. That event runs in the middle of
    // the game's own tick, and world lookups there can stall or corrupt the game thread
    // (this is what broke v1.0). All checks run from a normal JS timer instead, the same way
    // EaglerForge's example Anti-AFK mod calls jump().
    function isSolid(x: number, y: number, z: number): boolean {
        const pos = getBlockPosCtor()(Math.floor(x), Math.floor(y), Math.floor(z));
        const state = ModAPI.world.getBlockState(pos);
        if (!state) return false;
        const block = state.getBlock();
        if (!block) return false;
        return !!block.getMaterial().blocksMovement();
    }



    // ---------------- auto jump logic ---------------- //
    let cooldown = 0;
    let pendingJumpY: number | null = null;   // y level we jumped from, used to detect "jumped but didn't climb"
    let failedJumps = 0;
    let lastPosX = 0, lastPosZ = 0;
    let wasOnGround = true;

    function shouldSkip(p: PlayerLike): boolean {
        try {
            if (!p.onGround) return true;
            if (p.isSneaking && p.isSneaking()) return true;
            if (p.capabilities && p.capabilities.isFlying) return true;
            if (p.isInWater && p.isInWater()) return true;
            if (p.isInLava && p.isInLava()) return true;
            if (p.isOnLadder && p.isOnLadder()) return true;
            if (p.ridingEntity) return true;
        } catch (e) { }
        return false;
    }

    // The update event only counts ticks (no game calls in there). The real work happens
    // in a timer that runs once for every new game tick.
    let tickCounter = 0;
    let lastHandledTick = 0;
    ModAPI.addEventListener("update", () => { tickCounter++; });
    setInterval(() => {
        if (tickCounter === lastHandledTick) return;
        lastHandledTick = tickCounter;
        try { autoJumpTick(); } catch (e) { console.warn("[Auto Jump]", e); }
    }, 15);

    // one chat line the first time you're in a world, so you can tell the mod is installed
    let announced = false;
    function announce(): void {
        if (announced || !ModAPI.player) return;
        announced = true;
        chat("\u00a7b[Auto Jump] \u00a77v1.2 loaded - " + (settings.enabled ? "\u00a7aON" : "\u00a7cOFF") +
            "\u00a77 (press " + settings.toggleKey.replace("Key", "") + " or type .autojump to toggle)");
    }

    function autoJumpTick(): void {
        announce();
        if (!settings.enabled || !ModAPI.player) return;
        let p: PlayerLike;
        try { p = ModAPI.player.getCorrective(); } catch (e) { p = ModAPI.player; }
        if (!p) return;

        if (cooldown > 0) cooldown--;

        // detect landing after a jump that didn't get us any higher (e.g. a fence or a wall we misread)
        const onGround = !!p.onGround;
        if (onGround && !wasOnGround && pendingJumpY !== null) {
            if (p.posY < pendingJumpY + 0.5 && p.isCollidedHorizontally) {
                failedJumps++;
                cooldown = Math.max(cooldown, failedJumps >= 2 ? 40 : 12);
            } else {
                failedJumps = 0;
            }
            pendingJumpY = null;
        }
        wasOnGround = onGround;

        // walking away resets the "failed" memory
        const moved = Math.hypot(p.posX - lastPosX, p.posZ - lastPosZ);
        if (moved > 0.08) failedJumps = 0;
        lastPosX = p.posX;
        lastPosZ = p.posZ;

        if (cooldown > 0 || shouldSkip(p)) return;

        // which way is the player trying to walk (from their keys, not their velocity,
        // because velocity is zero once they're pressed against a block)
        const forward = p.moveForward || 0;
        const strafe = p.moveStrafing || 0;
        if (Math.abs(forward) < 0.01 && Math.abs(strafe) < 0.01) return;
        const yaw = p.rotationYaw * Math.PI / 180;
        let dx = strafe * Math.cos(yaw) - forward * Math.sin(yaw);
        let dz = forward * Math.cos(yaw) + strafe * Math.sin(yaw);
        const len = Math.hypot(dx, dz);
        if (len < 0.001) return;
        dx /= len;
        dz /= len;

        const feetY = p.posY + 0.01;
        let jump = false;

        if (!worldCheckBroken) {
            try {
                // look just past the edge of the player's 0.6 wide hitbox
                const reach = 0.3 + settings.lookAhead;
                const ax = p.posX + dx * reach;
                const az = p.posZ + dz * reach;
                const px = p.posX, pz = p.posZ;
                // only jump for a real 1-block step we can actually stand on
                jump = isSolid(ax, feetY, az) && !isSolid(ax, feetY + 1, az) &&
                    !isSolid(ax, feetY + 2, az) && !isSolid(px, feetY + 2, pz);
            } catch (e) {
                worldErrors++;
                if (worldErrors >= 20) worldCheckBroken = true;
                console.warn("[Auto Jump] block check failed, using collision check this tick", e);
                jump = !!p.isCollidedHorizontally && failedJumps < 2;
            }
        }

        if (worldCheckBroken) {
            // fallback: jump whenever we're pushing into a block (failed-jump memory stops wall spam)
            jump = !!p.isCollidedHorizontally && failedJumps < 2;
        }

        if (jump) {
            try {
                ModAPI.player.jump();
                pendingJumpY = p.posY;
                cooldown = settings.jumpCooldown;
            } catch (e) { }
        }
    }

    // ---------------- toggles ---------------- //
    window.addEventListener("keydown", (e) => {
        // only while actually playing (mouse captured = no menu or chat open)
        if (!document.pointerLockElement) return;
        if (e.code === settings.toggleKey && !e.repeat) {
            setEnabled(!settings.enabled);
        }
    });

    ModAPI.addEventListener("sendchatmessage", (e: ChatEvent) => {
        const msg = (e.message || "").trim().toLowerCase();
        if (!msg.startsWith(".autojump")) return;
        e.preventDefault = true;
        const arg = msg.split(/\s+/)[1];
        if (arg === "on") setEnabled(true);
        else if (arg === "off") setEnabled(false);
        else if (arg === "settings") openSettings();
        else setEnabled(!settings.enabled);
    });

    function openSettings(): void {
        const look = prompt("Auto Jump: look-ahead distance in blocks (0.1 - 1.0, default 0.35)", String(settings.lookAhead));
        if (look !== null && !isNaN(parseFloat(look))) settings.lookAhead = Math.min(1, Math.max(0.1, parseFloat(look)));
        const key = prompt("Auto Jump: toggle key (letter A-Z, default J)", settings.toggleKey.replace("Key", ""));
        if (key && /^[a-zA-Z]$/.test(key.trim())) settings.toggleKey = "Key" + key.trim().toUpperCase();
        settings.showMessages = confirm("Auto Jump: show ON/OFF messages in chat?\n(OK = yes, Cancel = no)");
        save();
        chat("§b[Auto Jump] §7settings saved (look-ahead " + settings.lookAhead + ", key " + settings.toggleKey.replace("Key", "") + ")");
    }
    try { ModAPI.meta.config(openSettings); } catch (e) { }
})();