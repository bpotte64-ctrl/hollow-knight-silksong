// Save Interceptor - Hooks into Unity FS layer
// This intercepts save operations BEFORE they trigger full FS sync

(function() {
  console.log('[SaveIntercept] Initializing...');

  // Wait for FS and SaveBridge to be available
  function waitForFS() {
    let attempts = 0;
    const check = setInterval(() => {
      if (window.FS && window.SaveBridge) {
        clearInterval(check);
        setupIntercept();
      } else if (attempts++ > 100) {
        clearInterval(check);
        console.error('[SaveIntercept] FS or SaveBridge not available after waiting');
      }
    }, 100);
  }

  function setupIntercept() {
    console.log('[SaveIntercept] FS and SaveBridge ready, hooking saves...');

    // Intercept FS.write - capture save data before it hits IDBFS
    const originalWrite = window.FS.write;
    if (originalWrite) {
      window.FS.write = function(stream, buffer, offset, length, position) {
        // Check if this is a save file write
        const path = stream.node?.name;
        if (path && isSavePath(path)) {
          try {
            // Extract the data being written
            const data = new TextDecoder().decode(buffer.slice(offset, offset + length));
            console.log('[SaveIntercept] Detected save write to:', path, 'size:', data.length);

            // Store directly in IndexedDB (async, don't block)
            window.SaveBridge.save(path, data).catch(err => {
              console.error('[SaveIntercept] Background save failed:', err);
            });
          } catch (e) {
            console.warn('[SaveIntercept] Could not intercept write:', e);
          }
        }
        return originalWrite.apply(this, arguments);
      };
      console.log('[SaveIntercept] FS.write hooked');
    }

    // Intercept FS.syncfs - prevent full filesystem serialization
    const originalSyncFS = window.FS.syncfs;
    if (originalSyncFS) {
      window.FS.syncfs = function(populate, callback) {
        if (!populate) {
          // This is a SAVE operation (memory -> disk)
          console.log('[SaveIntercept] Save sync intercepted - using direct IndexedDB');

          // Don't call original syncfs - it causes the OOM!
          // Our FS.write interceptor already saved the data

          // Call callback with success
          if (callback) {
            setTimeout(() => callback(null), 0);
          }
          return;
        }

        // LOAD operations (disk -> memory) still use original syncfs
        console.log('[SaveIntercept] Load sync - using original syncfs');
        originalSyncFS.call(this, populate, callback);
      };
      console.log('[SaveIntercept] FS.syncfs hooked');
    }

    // Intercept FS.writeFile - Unity often uses this for atomic saves
    const originalWriteFile = window.FS.writeFile;
    if (originalWriteFile) {
      window.FS.writeFile = function(path, data, opts) {
        if (path && isSavePath(path)) {
          console.log('[SaveIntercept] Detected writeFile:', path);
          const content = typeof data === 'string' ? data : new TextDecoder().decode(data);
          window.SaveBridge.save(path, content).catch(err => {
            console.error('[SaveIntercept] Background save failed:', err);
          });
        }
        return originalWriteFile.apply(this, arguments);
      };
      console.log('[SaveIntercept] FS.writeFile hooked');
    }

    // Intercept FS.mkdir for save directories
    const originalMkdir = window.FS.mkdir;
    if (originalMkdir) {
      window.FS.mkdir = function(path, mode, parent) {
        if (path && path.includes('save')) {
          console.log('[SaveIntercept] Detected save directory creation:', path);
        }
        return originalMkdir.apply(this, arguments);
      };
      console.log('[SaveIntercept] FS.mkdir hooked');
    }

    console.log('[SaveIntercept] Interception active');
  }

  // Check if a path is likely a save file
  function isSavePath(path) {
    const lowerPath = path.toLowerCase();
    return lowerPath.includes('save') ||
           lowerPath.includes('.dat') ||
           lowerPath.includes('.json') ||
           lowerPath.includes('slot') ||
           lowerPath.includes('profile') ||
           lowerPath.includes('userdata');
  }

  // Start waiting for FS
  waitForFS();
})();
