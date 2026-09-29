/**
 * Ambient declarations for the globals shared between the EaglercraftX (TeaVM)
 * runtime, the EaglerForge ModAPI and the custom scripts in this project.
 *
 * Every script in src/ is compiled as a classic (non-module) script and inlined
 * into the final HTML in the same order as the original file, so they all share
 * one global scope, exactly like the original <script> tags did.
 */

// ---------------------------------------------------------------------------
// Launch options (window.eaglercraftXOpts)
// ---------------------------------------------------------------------------

interface EaglerRelay {
    addr: string;
    comment: string;
    primary: boolean;
}

interface EaglercraftXOpts {
    container: string;
    worldsDB: string;
    finishOnSwap?: boolean;
    relays?: EaglerRelay[];
    assetsURI?: string;
    showBootMenuOnLaunch?: boolean;
    /** EaglerForge: extra mod URLs to load on startup. */
    Mods?: string[];
    [option: string]: unknown;
}

// ---------------------------------------------------------------------------
// EaglerForge ModAPI
// ---------------------------------------------------------------------------

/** A method ripped from the TeaVM runtime. Signatures vary per method. */
type TeaVMMethod = (...args: any[]) => any;

interface ModAPIHooks {
    freezeCallstack: boolean;
    methods: Record<string, TeaVMMethod>;
    _teavm: Record<string, any>;
    _rippedData: any[];
    _rippedInterfaceMap: Record<string, any>;
    _rippedConstructors: Record<string, any>;
    _rippedInternalConstructors: Record<string, any>;
    _rippedMethodTypeMap: Record<string, any>;
    _rippedStaticProperties: Record<string, any>;
    _rippedStaticIndexer: Record<string, any>;
    _postInit: () => void;
    [key: string]: any;
}

/**
 * The ModAPI surface is built dynamically at runtime from reflection data, so
 * only the parts this project relies on are typed; everything else is `any`.
 */
interface ModAPIRoot {
    hooks: ModAPIHooks;
    version: string;
    flavour: string;
    [key: string]: any;
}

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

declare var ModAPI: ModAPIRoot;
declare var eaglercraftXOpts: EaglercraftXOpts;

/** TeaVM entry point exported by the client runtime (vendor/classes.js). */
declare function main(): void;

// Defined in src/modapi/patchesreg-events.ts
declare var modapi_specialevents: string[];
// Generated at build time from src/modapi/postinit.ts
declare var modapi_postinit: string;

// Defined in src/modapi/modloader.ts
declare var promisifyIDBRequest: <T>(request: IDBRequest<T>) => Promise<T>;
declare var getDatabase: () => Promise<IDBDatabase>;
declare var getMods: () => Promise<string[]>;
declare var getMod: (mod: string) => Promise<string>;
declare var saveMods: (mods: string[]) => Promise<void>;
declare var addMod: (mod: string) => Promise<void>;
declare var addFileMod: (mod: string, textContents: string) => Promise<void>;
declare var removeMod: (index: number) => Promise<void>;
declare var resetMods: () => Promise<void>;
declare var modLoader: (modsArr?: string[]) => Promise<void>;

interface Window {
    eaglercraftXOpts: EaglercraftXOpts;
    eaglercraftXClientScriptElement?: HTMLOrSVGScriptElement | null;

    // mod loader state
    eaglerMLoaderMainRun?: boolean;
    noLoadMods?: boolean;
    ModGracePeriod?: boolean;
    returnTotalLoadedMods?: () => number;

    // mod manager GUI (src/modapi/guikit.ts)
    modapi_displayModGui?: (cb?: () => void) => Promise<void>;
    modapi_clearmods?: () => Promise<void>;
    modapi_addmod?: () => Promise<void>;
    modapi_uploadmod?: () => Promise<void>;
    modapi_guikit?: string;
}

// Defined in src/modapi/postinit.ts
/** Legacy alias of ModAPI kept for old PluginAPI mods. */
declare var PluginAPI: ModAPIRoot;
/** The raw TeaVM Minecraft instance, set once the game starts. */
declare var Minecraft: any;
// Defined in src/modapi/guikit.ts (also reachable as window.modapi_displayModGui)
declare var modapi_displayModGui: (cb?: () => void) => Promise<void>;

// Defined in src/mods/apple-rp-fix.ts
interface AppleRPFixApi {
    version: string;
    /** Console helper: opens a file picker through the fix. */
    test: () => void;
}
interface Window {
    __appleRPFix?: AppleRPFixApi;
    appleRPFix?: AppleRPFixApi;
}

// Generated at build time from src/mods/builtin/*.ts (see build.mjs)
interface BuiltinMod { name: string; code: string; }
declare var modapi_builtinMods: BuiltinMod[] | undefined;

// Defined in src/boot/launch-options.ts
interface Window {
    /** True when ?disable=<name> (comma-separated, or "all") is in the page URL. */
    isAddonDisabled: (name: string) => boolean;
    /** True on Safari and on every iOS/iPadOS browser. */
    isAppleWebKit: () => boolean;
}
