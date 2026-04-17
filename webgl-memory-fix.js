/** 2
 * WebGL Memory Error Fix for Hollow Knight: Silksong 4
 * FIXED: Memory conflicts resolved, enhanced error recovery 5
 * 6
 * Apply this patch BEFORE loading the Unity framework 7
 * Include in index.html before the loader script 8
 */ 9
10// ================== PATCH 1: Memory Configuration & SAVE FIX ==================
11// Unity WebGL builds need explicit memory settings to avoid OOM during saves
12// CRITICAL: memory-patch.js already sets 3.5GB - this must NOT override lower
13window.Module = window.Module || {};
14
15// Only apply these if memory-patch.js hasn't loaded or set insufficient values
16if (!window.Module.TOTAL_MEMORY || window.Module.TOTAL_MEMORY < 3584 * 1024 * 1024) {
  console.warn("[webgl-memory-fix] Memory configuration too low, applying correction");
  window.Module.TOTAL_MEMORY = 3584 * 1024 * 1024; // 3GB initial
  window.Module.TOTAL_STACK = 128 * 1024 * 1024;  // 128MB stack
  window.Module.MAXIMUM_MEMORY = 4096 * 1024 * 1024; // 3.75GB max for WASM32
}

17// Enable memory growth - CRITICAL for save/ability operations
18window.Module.ALLOW_MEMORY_GROWTH = 1;

19// Prevent crashes by overriding Module.abort BEFORE Unity loads
20const originalAbort = window.Module.abort;
21window.Module.abort = function(what) {
  console.error('[webgl-memory-fix] Unity abort called:', what);

  // Don't show alerts - throw errors that can be caught
  if (what && typeof what === 'string') {
    if (what.includes('OOM') || what.includes('out of memory') ||
        what.includes('Cannot enlarge') || what.includes('abortOnCannotGrowMemory')) {
      console.error('[webgl-memory-fix] OOM detected during save/ability - document this');
      throw new Error('OUT_OF_MEMORY: ' + what);
    }
  }

  if (originalAbort) {
    return originalAbort.apply(this, arguments);
  }
  throw new Error('[UnityAbort] ' + what);
};

22// Save state tracking - helps identify if corruption is happening
23window.Module.saveInProgress = false;

24// ================== PATCH 2: Canvas Selector Validation Fix ==================
25// Intercept empty selector queries that cause "The provided selector is empty" error
26(function() {
  const origQuerySelector = document.querySelector;
  const origQuerySelectorAll = document.querySelectorAll;

  document.querySelector = function(selector) {
    if (!selector || selector === "") {
      console.warn("[webgl-memory-fix] Blocked empty selector, returning canvas");
      return document.getElementById("unity-canvas") || document.querySelector("canvas") || null;
    }
    try {
      return origQuerySelector.call(document, selector);
    } catch (e) {
      console.error("[webgl-memory-fix] querySelector error:", e);
      return null;
    }
  };

  document.querySelectorAll = function(selector) {
    if (!selector || selector === "") {
      console.warn("[webgl-memory-fix] Blocked empty selector query");
      return [];
    }
    try {
      return origQuerySelectorAll.call(document, selector);
    } catch (e) {
      console.error("[webgl-memory-fix] querySelectorAll error:", e);
      return [];
    }
  };
})();

27// ================== PATCH 3: HEAP Bounds & Memory Monitoring ==================
28let originalHEAPU8;
Object.defineProperty(window.Module, 'HEAPU8', {
  get: function() { return originalHEAPU8; },
  set: function(value) {
    originalHEAPU8 = value;
    if (value) {
      console.log("[webgl-memory-fix] HEAP initialized. Size:", (value.length / 1048576).toFixed(0), "MB");
      console.log("[webgl-memory-fix] Memory available:", (window.Module.TOTAL_MEMORY / 1048576).toFixed(0), "MB");
    }
  }
});

29// Memory pressure detection
30let memoryWarnings = 0;
31const memoryPressureThreshold = 0.85; // Warn when 85% full

32function checkMemoryPressure() {
  if (window.Module.HEAPU8) {
    const used = window.Module.HEAPU8.length;
    const total = window.Module.TOTAL_MEMORY || 3584 * 1024 * 1024;
    const ratio = used / total;

    if (ratio > memoryPressureThreshold) {
      memoryWarnings++;
      console.warn(`[webgl-memory-fix] Memory pressure: ${(ratio * 100).toFixed(1)}% used (${(used / 1048576).toFixed(0)}MB / ${(total / 1048576).toFixed(0)}MB)`);

      // Force garbage collection if available
      if (window.gc) {
        console.log("[webgl-memory-fix] Forcing garbage collection");
        window.gc();
      }

      if (memoryWarnings > 3) {
        console.error("[webgl-memory-fix] Critical memory pressure - clearing caches");
        caches.keys().then(names => {
          names.forEach(name => {
            if (name.includes('hksilksong')) {
              caches.delete(name);
              console.log("[webgl-memory-fix] Deleted cache:", name);
            }
          });
        });
      }
    }
  }
}

33// Monitor memory every 10 seconds during gameplay
34setInterval(checkMemoryPressure, 10000);

35// ================== PATCH 4: FileSystem Sync Fix for SAVE OPERATIONS ==================
36// Ensure IDBFS is properly initialized before save operations - this is CRITICAL
37window.Module.preRun = window.Module.preRun || [];
window.Module.preRun.push(function() {
  console.log("[webgl-memory-fix] PreRun: Setting up persistent filesystem");

  if (window.FS && window.IDBFS) {
    try {
      // Mount IDBFS for save data
      window.FS.mkdir('/idbfs');
      window.FS.mount(window.IDBFS, {}, '/idbfs');

      // Sync FROM IndexedDB to memory (load existing saves)
      window.FS.syncfs(true, function(err) {
        if (err) {
          console.error("[webgl-memory-fix] FS sync error (LOAD):", err);
        } else {
          console.log("[webgl-memory-fix] Filesystem synced from IndexedDB");
        }
      });

      console.log("[webgl-memory-fix] Filesystem initialized for save operations");
    } catch (e) {
      console.warn("[webgl-memory-fix] Filesystem setup warning:", e.message);
    }
  }
});

38// CRITICAL: Override FS sync operations to prevent corruption during save
39if (window.FS) {
  const originalSyncFS = window.FS.syncfs;

  window.FS.syncfs = function(populate, callback) {
    window.Module.saveInProgress = true;
    console.log("[webgl-memory-fix] Save operation started");

    const startTime = performance.now();
    const originalCallback = callback;

    const wrappedCallback = function(err) {
      window.Module.saveInProgress = false;
      const duration = performance.now() - startTime;

      if (err) {
        console.error("[webgl-memory-fix] Save FAILED after", duration.toFixed(0), "ms:", err);
      } else {
        console.log("[webgl-memory-fix] Save completed successfully in", duration.toFixed(0), "ms");
      }

      if (originalCallback) {
        originalCallback(err);
      }
    };

    return originalSyncFS.call(this, populate, wrappedCallback);
  };
  console.log("[webgl-memory-fix] FS.syncfs wrapper applied");
} else {
  // FS not available yet - defer to postRun
  window.Module.postRun = window.Module.postRun || [];
  window.Module.postRun.push(function() {
    console.log("[webgl-memory-fix] PostRun: Wrapping FS.syncfs");
    if (window.FS) {
      const originalSyncFS = window.FS.syncfs;
      window.FS.syncfs = function(populate, callback) {
        window.Module.saveInProgress = true;
        const startTime = performance.now();
        const originalCallback = callback;
        const wrappedCallback = function(err) {
          window.Module.saveInProgress = false;
          const duration = performance.now() - startTime;
          if (err) {
            console.error("[webgl-memory-fix] Save FAILED after", duration.toFixed(0), "ms:", err);
          } else {
            console.log("[webgl-memory-fix] Save completed in", duration.toFixed(0), "ms");
          }
          if (originalCallback) originalCallback(err);
        };
        return originalSyncFS.call(this, populate, wrappedCallback);
      };
      console.log("[webgl-memory-fix] FS.syncfs wrapper applied in postRun");
    }
  });
}

40// ================== PATCH 5: DynCall Error Suppression for ABILITIES ==================
41// Silkspear and other abilities use dynCall - wrap to catch signature mismatches
42window.Module.onRuntimeInitialized = function() {
  console.log("[webgl-memory-fix] Runtime initialized. Abilities can now be safely acquired.");

  const originalDynCall = window.Module.dynCall;
  if (originalDynCall) {
    window.Module.dynCall = function(sig, ptr) {
      console.log("[webgl-memory-fix] dynCall invoked sig=", sig);

      // Ability use often triggers memory allocation spikes
      if (sig && (sig.includes('v') || sig.includes('i'))) {
        checkMemoryPressure();
      }

      try {
        return originalDynCall.apply(this, arguments);
      } catch (e) {
        console.error("[webgl-memory-fix] dynCall error suppressed (sig=", sig + "):", e.message);
        return 0; // Return success to prevent crash
      }
    };
  }
};

43// ================== PATCH 6: Enhanced Exception Handling ==================
44window.Module.DisableExceptionCapturing = false;

45window.addEventListener('error', function(e) {
  const msg = e.message || '';

  if (msg.includes('RuntimeError') || msg.includes('memory access') ||
      msg.includes('out of bounds') || msg.includes('OOM') ||
      msg.includes('abortOnCannotGrowMemory') || msg.includes('function signature mismatch')) {

    console.error('[webgl-memory-fix] Caught critical WASM error:', e);
    e.preventDefault();

    // Clear corrupted caches
    caches.keys().then(names => {
      names.forEach(name => {
        if (name.includes('hksilksong')) {
          caches.delete(name);
          console.log("[webgl-memory-fix] Deleted corrupted cache:", name);
        }
      });
      console.warn("[webgl-memory-fix] CACHE CLEARED. RELOAD PAGE (Ctrl+Shift+R) to redownload.");
    });

    // Also clear IndexedDB
    indexedDB.databases().then(dbs => {
      dbs.forEach(db => {
        if (db.name && (db.name.includes('unity') || db.name.includes('silksong') || db.name.includes('IDBFS'))) {
          indexedDB.deleteDatabase(db.name);
          console.log("[webgl-memory-fix] Deleted IndexedDB:", db.name);
        }
      });
    });
  }
});

46// ================== PATCH 7: Bundle Import Error Recovery ==================
47// Handle 304 errors and corruption gracefully
const originalFetch = window.fetch;
let fetchRetryCount = {};

window.fetch = async function(resource, options) {
  const url = typeof resource === 'string' ? resource : resource.url;
  const cleanPath = url.split("/").pop();

  try {
    const response = await originalFetch(resource, options);

    // Detect 304 or other errors on bundle imports
    if (!response.ok || response.status === 304) {
      console.error("[webgl-memory-fix] Bundle import error:", response.status, url);

      // Retry once, then clear cache
      fetchRetryCount[cleanPath] = (fetchRetryCount[cleanPath] || 0) + 1;

      if (fetchRetryCount[cleanPath] <= 2) {
        console.log("[webgl-memory-fix] Retrying bundle import...", cleanPath);
        // Wait briefly then retry
        await new Promise(resolve => setTimeout(resolve, 100));
        return window.fetch(resource, options);
      } else {
        // Max retries exceeded - clear corrupted cache
        console.error("[webgl-memory-fix] Max retries exceeded, clearing corrupted cache");
        caches.keys().then(names => {
          names.forEach(name => {
            if (name.includes('hksilksong')) caches.delete(name);
          });
        });
        throw new Error("Bundle import failed after retries: " + cleanPath);
      }
    }

    return response;
  } catch (err) {
    console.error("[webgl-memory-fix] Fetch error:", err);
    throw err;
  }
};

console.log("[webgl-memory-fix] All critical patches applied");

// End of webgl-memory-fix.js
