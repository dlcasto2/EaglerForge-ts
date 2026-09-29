(() => {
    globalThis.promisifyIDBRequest = function promisifyIDBRequest<T>(request: IDBRequest<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    globalThis.getDatabase = async function getDatabase(): Promise<IDBDatabase> {
        const dbRequest = indexedDB.open("EF_MODS");
        const db = await promisifyIDBRequest(dbRequest);

        if (!db.objectStoreNames.contains("filesystem")) {
            db.close();
            const version = db.version + 1;
            const upgradeRequest = indexedDB.open("EF_MODS", version);
            upgradeRequest.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                const upgradedDb = (event.target as IDBOpenDBRequest).result;
                upgradedDb.createObjectStore("filesystem");
            };
            return promisifyIDBRequest(upgradeRequest);
        }

        return db;
    }

    globalThis.getMods = async function getMods(): Promise<string[]> {
        const db = await getDatabase();
        const transaction = db.transaction(["filesystem"], "readonly");
        const objectStore = transaction.objectStore("filesystem");
        const object = await promisifyIDBRequest(objectStore.get("mods.txt"));
        var out: string[] = object ? (await (object as Blob).text()).split("|").toSorted() : [];
        db.close();
        return out;
    }

    globalThis.getMod = async function getMod(mod: string): Promise<string> {
        const db = await getDatabase();
        const transaction = db.transaction(["filesystem"], "readonly");
        const objectStore = transaction.objectStore("filesystem");
        const object = await promisifyIDBRequest(objectStore.get("mods/" + mod));
        var out =  object ? (await (object as Blob).text()) : "";
        db.close();
        return out;
    }

    globalThis.saveMods = async function saveMods(mods: string[]): Promise<void> {
        const db = await getDatabase();
        const transaction = db.transaction(["filesystem"], "readwrite");
        const objectStore = transaction.objectStore("filesystem");
        const encoder = new TextEncoder();
        const modsData = encoder.encode(mods.toSorted().join("|"));
        const modsBlob = new Blob([modsData], { type: "text/plain" });
        await promisifyIDBRequest(objectStore.put(modsBlob, "mods.txt"));
        db.close();
    }

    globalThis.addMod = async function addMod(mod: string): Promise<void> {
        const mods = await getMods();
        mods.push("web@" + mod);
        await saveMods(mods);
    }

    globalThis.addFileMod = async function addFileMod(mod: string, textContents: string): Promise<void> {
        const mods = await getMods();
        if (mods.includes(mod)) {
            await removeMod(mods.indexOf(mod));
        } else {
            mods.push(mod);
        }
        await saveMods(mods);

        const db = await getDatabase();
        const transaction = db.transaction(["filesystem"], "readwrite");
        const objectStore = transaction.objectStore("filesystem");
        const encoder = new TextEncoder();
        const modsData = encoder.encode(textContents);
        const modsBlob = new Blob([modsData], { type: "text/plain" });
        await promisifyIDBRequest(objectStore.put(modsBlob, "mods/" + mod));
        db.close();
    }

    globalThis.removeMod = async function removeMod(index: number): Promise<void> {
        const mods = await getMods();
        if (index >= 0 && index < mods.length) {
            var deleted = mods.splice(index, 1)[0];
            await saveMods(mods);
            if (!deleted.startsWith("web@")) {
                const db = await getDatabase();
                const transaction = db.transaction(["filesystem"], "readwrite");
                const objectStore = transaction.objectStore("filesystem");
                await promisifyIDBRequest(objectStore.delete("mods/" + deleted));
                db.close();
            }
        }
    }

    globalThis.resetMods = async function resetMods(): Promise<void> {
        console.log("Resetting mods...");
        const db = await getDatabase();
        const transaction = db.transaction(["filesystem"], "readwrite");
        const objectStore = transaction.objectStore("filesystem");
        await promisifyIDBRequest(objectStore.clear());
        console.log("Mods reset");
        db.close();
    }

    globalThis.modLoader = async function modLoader(modsArr: string[] = []): Promise<void> {
        if (!window.eaglerMLoaderMainRun) {
            var searchParams = new URLSearchParams(location.search);
            searchParams.getAll("mod").forEach((modToAdd) => {
                console.log(
                    "[EaglerML] Adding mod to loadlist from search params: " + modToAdd
                );
                modsArr.push("web@" + modToAdd);
            });
            searchParams.getAll("plugin").forEach((modToAdd) => {
                console.log(
                    "[EaglerML] Adding mod to loadlist from search params: " + modToAdd
                );
                modsArr.push("web@" + modToAdd);
            });
            if (
                !!eaglercraftXOpts &&
                !!eaglercraftXOpts.Mods &&
                Array.isArray(eaglercraftXOpts.Mods)
            ) {
                eaglercraftXOpts.Mods.forEach((modToAdd: string) => {
                    console.log(
                        "[EaglerML] Adding mod to loadlist from eaglercraftXOpts: " +
                        modToAdd
                    );
                    modsArr.push("web@" + modToAdd);
                });
            }

            // Mods compiled into the client (src/mods/builtin, see build.mjs)
            (globalThis.modapi_builtinMods || []).forEach((mod) => {
                console.log("[EaglerML] Adding built-in mod to loadlist: " + mod.name);
                modsArr.push("builtin@" + mod.name);
            });

            console.log("[EaglerML] Searching in iDB");
            try {
                var idbMods = await getMods();
                modsArr = modsArr.concat(idbMods
                    .filter(x => { return x && x.length > 0 })
                );
            } catch (error) {
                console.error(error);
            }

            window.eaglerMLoaderMainRun = true;
        }
        if (window.noLoadMods === true) {
            modsArr.splice(0, modsArr.length);
        }
        function checkModsLoaded(totalLoaded: number, identifier: ReturnType<typeof setInterval> | null) {
            console.log(
                "[EaglerML] Checking if mods are finished :: " +
                totalLoaded +
                "/" +
                modsArr.length
            );
            if (totalLoaded >= modsArr.length) {
                clearInterval(identifier ?? undefined);
                window.ModGracePeriod = false;
                if (
                    window.eaglerMLoaderMainRun &&
                    ModAPI &&
                    ModAPI.events &&
                    ModAPI.events.callEvent
                ) {
                    ModAPI.events.callEvent("load", {});
                }
                console.log(
                    "[EaglerML] Checking if mods are finished :: All mods loaded! Grace period off."
                );
            }
        }
        function methodB(currentMod: string) {
            try {
                console.log("[EaglerML] Loading " + currentMod + " via method B.");
                var script = document.createElement("script");
                script.setAttribute("data-hash", ModAPI.util.hashCode("web@" + currentMod));
                script.src = currentMod;
                script.setAttribute("data-isMod", "true");
                script.onerror = () => {
                    console.log(
                        "[EaglerML] Failed to load " + currentMod + " via method B!"
                    );
                    script.remove();
                    totalLoaded++;
                };
                script.onload = () => {
                    console.log(
                        "[EaglerML] Successfully loaded " + currentMod + " via method B."
                    );
                    totalLoaded++;
                };
                document.body.appendChild(script);
            } catch (error) {
                console.log(
                    "[EaglerML] Oh no! The mod " + currentMod + " failed to load!"
                );
                totalLoaded++;
            }
        }
        window.ModGracePeriod = true;
        var totalLoaded = 0;
        var loaderCheckInterval: ReturnType<typeof setInterval> | null = null;
        modsArr.sort();
        for (let i = 0; i < modsArr.length; i++) {
            let currentMod = modsArr[i];
            var builtinMod = currentMod.startsWith("builtin@")
                ? (globalThis.modapi_builtinMods || []).find((m) => "builtin@" + m.name === currentMod)
                : undefined;
            var isIDBMod = !builtinMod && !currentMod.startsWith("web@");
            if (!isIDBMod && !builtinMod) {
                currentMod = currentMod.replace("web@", "");
            }
            console.log("[EaglerML] Starting " + currentMod);
            try {
                var responseText = builtinMod ? builtinMod.code : isIDBMod ? await getMod(currentMod) : await (await fetch(currentMod)).text();
                console.log("[EaglerML] Loading " + currentMod + " via method A.");
                var script = document.createElement("script");
                script.setAttribute("data-hash", ModAPI.util.hashCode((isIDBMod || builtinMod ? "" : "web@") + currentMod));
                try {
                    script.src =
                        "data:text/javascript," + encodeURIComponent(responseText);
                } catch (error) {
                    methodB(currentMod);
                    return;
                }
                script.setAttribute("data-isMod", "true");
                script.onerror = () => {
                    console.log(
                        "[EaglerML] Failed to load " + currentMod + " via method A!"
                    );
                    script.remove();
                    totalLoaded++;
                };
                script.onload = () => {
                    console.log(
                        "[EaglerML] Successfully loaded " + currentMod + " via method A."
                    );
                    totalLoaded++;
                };
                document.body.appendChild(script);
            } catch (error) {
                methodB(currentMod);
            }
        }
        loaderCheckInterval = setInterval(() => {
            checkModsLoaded(totalLoaded, loaderCheckInterval);
        }, 500);
        console.log(
            "[EaglerML] Starting to load " + modsArr.length + " mods..."
        );
        window.returnTotalLoadedMods = function returnTotalLoadedMods(): number {
            return totalLoaded;
        };
    };
})();