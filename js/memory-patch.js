/**
 * Memory Patch for Hollow Knight: Silksong WebGL
 * MUST be loaded BEFORE the Unity loader script
 *
 * This patch:
 * 1. Overrides abort to prevent crashes
 * 2. Increases memory allocation
 * 3. Catches OOM errors gracefully
 */

(function() {
    console.log('[MemoryPatch] Initializing...');

    // Store original abort if it exists
    const originalAbort = window.Module?.abort;

    // Override abort BEFORE Unity initializes
    window.Module = window.Module || {};

    window.Module.abort = function(what, ...args) {
        console.error('[MemoryPatch] Abort called:', what);

        // Don't show alerts for memory errors
        if (what && typeof what === 'string') {
            if (what.includes('OOM') ||
                what.includes('memory') ||
                what.includes('Cannot enlarge') ||
                what.includes('abortOnCannotGrowMemory')) {
                console.warn('[MemoryPatch] Memory error caught - game may be unstable');
                // Throw instead of alert
                throw new Error('[MemoryPatch] ' + what);
            }
        }

        // Call original if it exists
        if (originalAbort) {
            return originalAbort.call(this, what, ...args);
        }

        // Default: throw error instead of alert
        throw new Error('[UnityAbort] ' + what);
    };

    // Set memory configuration
    window.Module.TOTAL_MEMORY = 3072 * 1024 * 1024;  // 3GB
    window.Module.TOTAL_STACK = 128 * 1024 * 1024;     // 128MB
    window.Module.INITIAL_MEMORY = 3072 * 1024 * 1024;
    window.Module.MAXIMUM_MEMORY = 3840 * 1024 * 1024; // 3.75GB max usable
    window.Module.ALLOW_MEMORY_GROWTH = 1;

    // Pre-run: log memory state
    window.Module.preRun = window.Module.preRun || [];
    window.Module.preRun.push(function() {
        console.log('[MemoryPatch] Unity preRun - memory configured for',
                    window.Module.TOTAL_MEMORY / (1024*1024) + 'MB');
    });

    // Post-run: check actual memory
    window.Module.postRun = window.Module.postRun || [];
    window.Module.postRun.push(function() {
        console.log('[MemoryPatch] Unity postRun - game initialized');
        if (Module.HEAPU8) {
            console.log('[MemoryPatch] Actual heap size:', Module.HEAPU8.length / (1024*1024) + 'MB');
        }
    });

    // Runtime initialized hook
    window.Module.onRuntimeInitialized = function() {
        console.log('[MemoryPatch] WASM runtime initialized');
    };

    // Catch quit
    window.Module.quit = function(exitCode) {
        console.log('[MemoryPatch] Unity quit:', exitCode);
    };

    // Global error handler for OOM
    window.addEventListener('error', function(e) {
        if (e.message && (
            e.message.includes('OOM') ||
            e.message.includes('abortOnCannotGrowMemory') ||
            e.message.includes('out of memory') ||
            e.message.includes('Cannot enlarge')
        )) {
            console.error('[MemoryPatch] OOM detected:', e);
            e.preventDefault();

            // Clear caches
            caches.keys().then(names => {
                names.forEach(n => {
                    if (n.includes('hksilksong')) caches.delete(n);
                });
            });

            return false;
        }
    });

    console.log('[MemoryPatch] Initialization complete');
})();
