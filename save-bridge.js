// Save Bridge - Direct IndexedDB storage for Unity saves
// Bypasses FS.syncfs to avoid memory spikes during save operations

const SAVE_DB_NAME = 'SilksongSaves';
const SAVE_STORE_NAME = 'saves';
const SAVE_DB_VERSION = 1;

class SaveBridge {
  constructor() {
    this.db = null;
    this.pendingSaves = new Map(); // Queue saves to prevent corruption
    this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(SAVE_DB_NAME, SAVE_DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(SAVE_STORE_NAME)) {
          db.createObjectStore(SAVE_STORE_NAME, { keyPath: 'slotName' });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        console.log('[SaveBridge] Ready');
        resolve();
      };
      request.onerror = (e) => reject(e);
      request.onblocked = () => {
        console.error('[SaveBridge] Database blocked by another connection');
        reject(new Error('Database blocked'));
      };
    });
  }

  async save(slotName, data) {
    if (!this.db) await this.init();

    // Queue to prevent rapid-fire corruption
    if (this.pendingSaves.has(slotName)) {
      console.warn('[SaveBridge] Save queued, waiting...');
      await this.pendingSaves.get(slotName);
    }

    let resolveQueue;
    this.pendingSaves.set(slotName, new Promise(r => resolveQueue = r));

    try {
      await this._writeToDB(slotName, data);
    } finally {
      this.pendingSaves.delete(slotName);
      resolveQueue();
    }
  }

  _writeToDB(slotName, data) {
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(SAVE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(SAVE_STORE_NAME);
        store.put({
          slotName,
          data,
          timestamp: Date.now(),
          size: data.length
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async load(slotName) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(SAVE_STORE_NAME, 'readonly');
        const store = tx.objectStore(SAVE_STORE_NAME);
        const req = store.get(slotName);
        req.onsuccess = () => resolve(req.result?.data || null);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async listSlots() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(SAVE_STORE_NAME, 'readonly');
        const store = tx.objectStore(SAVE_STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result.map(r => ({
          name: r.slotName,
          timestamp: r.timestamp,
          size: r.size
        })));
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async delete(slotName) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(SAVE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(SAVE_STORE_NAME);
        const req = store.delete(slotName);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  async clearAll() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(SAVE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(SAVE_STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }
}

window.SaveBridge = new SaveBridge();
