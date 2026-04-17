// Save Loader - Loads saves from IndexedDB into Unity memory when needed
// This ensures saved games are available in Unity's virtual filesystem

(function() {
  console.log('[SaveLoader] Initializing...');

  async function loadAllSavesIntoFS() {
    if (!window.SaveBridge || !window.FS) {
      console.warn('[SaveLoader] Not ready yet (SaveBridge or FS missing)');
      return;
    }

    // Ensure /idbfs directory exists
    try {
      if (!window.FS.analyzePath('/idbfs').exists) {
        window.FS.mkdir('/idbfs');
        if (window.IDBFS) {
          window.FS.mount(window.IDBFS, {}, '/idbfs');
        }
      }
    } catch (e) {
      console.warn('[SaveLoader] Could not create /idbfs:', e);
    }

    try {
      const slots = await window.SaveBridge.listSlots();
      console.log('[SaveLoader] Found', slots.length, 'save slots');

      let loadedCount = 0;
      for (const slot of slots) {
        try {
          const data = await window.SaveBridge.load(slot.name);
          if (data) {
            // Write to Unity's virtual filesystem
            const path = '/idbfs/' + slot.name;
            window.FS.writeFile(path, data);
            loadedCount++;
            console.log('[SaveLoader] Loaded save:', slot.name, '(' + data.length + ' bytes)');
          }
        } catch (e) {
          console.warn('[SaveLoader] Failed to load slot', slot.name, ':', e);
        }
      }

      if (loadedCount > 0) {
        console.log('[SaveLoader] Successfully loaded', loadedCount, 'saves into filesystem');
      } else {
        console.log('[SaveLoader] No saves found or loaded');
      }
    } catch (e) {
      console.error('[SaveLoader] Error loading saves:', e);
    }
  }

  async function loadSpecificSaveIntoFS(slotName) {
    if (!window.SaveBridge || !window.FS) {
      console.warn('[SaveLoader] Not ready for specific load');
      return null;
    }

    try {
      const data = await window.SaveBridge.load(slotName);
      if (data) {
        const path = '/idbfs/' + slotName;
        window.FS.writeFile(path, data);
        console.log('[SaveLoader] Loaded specific save:', slotName);
        return data;
      }
      return null;
    } catch (e) {
      console.error('[SaveLoader] Failed to load', slotName, ':', e);
      return null;
    }
  }

  // Expose for manual loading
  window.SaveLoader = {
    loadAll: loadAllSavesIntoFS,
    loadSpecific: loadSpecificSaveIntoFS
  };

  // Load saves after Unity's filesystem is ready
  if (window.Module) {
    window.Module.postRun = window.Module.postRun || [];
    window.Module.postRun.push(function() {
      console.log('[SaveLoader] postRun - scheduling save load');
      // Give FS a moment to fully initialize
      setTimeout(loadAllSavesIntoFS, 1000);
    });
  } else {
    console.warn('[SaveLoader] Module not found, will try to load on window.load');
    window.addEventListener('load', function() {
      setTimeout(loadAllSavesIntoFS, 2000);
    });
  }
})();
