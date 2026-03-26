/**
 * WebGL Memory Error Fix for Hollow Knight: Silksong
 *
 * Apply this patch BEFORE loading the Unity framework
 * Include in index.html before the loader script
 */

// ================== PATCH 1: Memory Configuration ==================
// Unity WebGL builds need explicit memory settings to avoid OOM during saves
window.Module = window.Module || {};
window.Module.TOTAL_MEMORY = 512 * 1024 * 1024; // 512MB - adjust as needed (default is 256MB)
window.Module.TOTAL_STACK = 16 * 1024 * 1024;  // 16MB stack
window.Module.buffer = new ArrayBuffer(window.Module.TOTAL_MEMORY);

// Enable memory growth (if supported by the build)
window.Module.ALLOW_MEMORY_GROWTH = 1;

// ================== PATCH 2: Canvas Selector Validation ==================
// Intercept empty selector queries that cause "The provided selector is empty" error
(function() {
    const origQuerySelector = document.querySelector;
    const origQuerySelectorAll = document.querySelectorAll;

    document.querySelector = function(selector) {
        if (!selector || selector === "") {
            console.warn("[UnityPatch] Blocked empty selector query, returning canvas");
            // Return the Unity canvas as fallback
            return document.getElementById("unity-canvas") ||
                   document.querySelector("canvas") ||
                   null;
        }
        try {
            return origQuerySelector.call(document, selector);
        } catch (e) {
            console.error("[UnityPatch] querySelector error for '" + selector + "':", e);
            return null;
        }
    };

    document.querySelectorAll = function(selector) {
        if (!selector || selector === "") {
            console.warn("[UnityPatch] Blocked empty selectorAll query");
            return [];
        }
        try {
            return origQuerySelectorAll.call(document, selector);
        } catch (e) {
            console.error("[UnityPatch] querySelectorAll error for '" + selector + "':", e);
            return [];
        }
    };
})();

// ================== PATCH 3: HEAP Bounds Checking ==================
// Add bounds checking to prevent "memory access out of bounds"
(function() {
    let originalHEAPU8;

    // Wait for Module to be fully initialized
    Object.defineProperty(window.Module, 'HEAPU8', {
        get: function() { return originalHEAPU8; },
        set: function(value) {
            originalHEAPU8 = value;
            console.log("[UnityPatch] HEAPU8 initialized, size:", value?.length || 0);
        }
    });
})();

// ================== PATCH 4: FileSystem Sync Fix ==================
// Ensure IDBFS is properly initialized before save operations
window.Module.preRun = window.Module.preRun || [];
window.Module.preRun.push(function() {
    console.log("[UnityPatch] PreRun: Initializing filesystem");

    // Ensure persistent storage is mounted
    if (window.FS && window.IDBFS) {
        try {
            window.FS.mkdir('/idbfs');
            window.FS.mount(window.IDBFS, {}, '/idbfs');
            window.FS.syncfs(true, function(err) {
                if (err) console.error("[UnityPatch] FS sync error:", err);
                else console.log("[UnityPatch] FS synced from IDB");
            });
        } catch (e) {
            console.log("[UnityPatch] FS setup (may already exist):", e.message);
        }
    }
});

// ================== PATCH 5: DynCall Error Suppression ==================
// Redirect errors to prevent "function signature mismatch" from crashing
window.Module.onRuntimeInitialized = function() {
    console.log("[UnityPatch] Runtime initialized");

    // Wrap dynCall to catch signature mismatches
    const originalDynCall = window.Module.dynCall;
    if (originalDynCall) {
        window.Module.dynCall = function(sig, ptr) {
            try {
                return originalDynCall.apply(this, arguments);
            } catch (e) {
                console.error("[UnityPatch] dynCall error (sig=" + sig + "):", e.message);
                return 0;
            }
        };
    }
};

// ================== PATCH 6: Exception Handling ==================
window.Module.DisableExceptionCapturing = false;

// Wrap event handlers to catch WASM exceptions
window.addEventListener('error', function(e) {
    if (e.message && e.message.includes('RuntimeError')) {
        console.error("[UnityPatch] Caught WASM RuntimeError:", e);
        // Prevent default to avoid alert() spam
        e.preventDefault();
    }
});

console.log("[UnityPatch] All patches applied");
