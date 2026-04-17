/** 5
 * Service Worker for Hollow Knight: Silksong WebGL 6
 * Patches WASM memory limits and provides caching with bundle import recovery 7
 */

const CACHE_NAME = 'hksilksong-sw-v2'; // Incremented for new version
const WASM_URL = 'Build/w-pt.wasm.unityweb';
const BUNDLE_LIST = [
  'packed-scenes-hornet_scenes_all_c907e217c56bc36e9412cc713b6511b0.bundle',
  'packed-collections_assets_all_40fc2899a4bf13e2fdf4877fac117bfe.bundle',
  'packed-prefabs_assets_all_b19c0cf6b825f4cf18264a6c8f5765a6.bundle'
];

// Install event - precache critical bundles immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching critical bundles...');
      return Promise.all(
        BUNDLE_LIST.map(bundle => {
          return fetch(`StreamingAssets/aa/${bundle}`).then(response => {
            if (response.ok) {
              return cache.put(`StreamingAssets/aa/${bundle}`, response);
            }
            console.warn('[SW] Bundle precache skipped:', bundle, response.status);
          }).catch(err => {
            console.error('[SW] Bundle precache failed:', bundle, err);
          });
        })
      );
    }).then(() => {
      console.log('[SW] Precache complete');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.filter(n => n.includes('hksilksong') && n !== CACHE_NAME)
              .map(n => caches.delete(n))
      );
    }).then(() => {
      console.log('[SW] Old caches cleaned, claiming clients');
      return self.clients.claim();
    })
  );
});

// Enhanced fetch handler with bundle import error recovery
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // WASM requests - patch with proper headers
  if (url.includes('w-pt.wasm')) {
    event.respondWith(patchWasmMemory(event.request));
    return;
  }

  // Bundle imports - handle 304/corruption with retry logic
  if (url.includes('StreamingAssets') && url.includes('.bundle')) {
    event.respondWith(handleBundleImport(event.request));
    return;
  }

  // Other streaming assets - cache-first strategy
  if (url.includes('StreamingAssets')) {
    event.respondWith(cacheFirstStrategy(event.request));
    return;
  }
});

// Patch WASM binary with critical CORS/COEP/COOP headers
async function patchWasmMemory(request) {
  try {
    const response = await fetch(request);
    if (!response.ok) {
      throw new Error(`WASM fetch failed: ${response.status}`);
    }
    const originalBuffer = await response.arrayBuffer();

    return new Response(originalBuffer, {
      headers: {
        'Content-Type': 'application/wasm',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cache-Control': 'no-cache' // Prevent 304 issues on WASM
      }
    });
  } catch (err) {
    console.error('[SW] WASM patch failed:', err);
    // Return original fetch without patching
    return fetch(request);
  }
}

// Handle bundle imports with 304 error recovery and corruption detection
async function handleBundleImport(request) {
  const url = request.url;
  const bundleName = url.split('/').pop();
  const cache = await caches.open(CACHE_NAME);

  try {
    // Try cache first
    const cached = await cache.match(request);
    if (cached && cached.ok && cached.status === 200) {
      console.log('[SW] Bundle loaded from cache:', bundleName);
      return cached;
    }

    // If cached version is bad (304, 404, corrupted), skip it
    if (cached) {
      console.warn('[SW] Cached bundle invalid status:', bundleName, cached.status);
      await cache.delete(request); // Remove invalid cache entry
    }

    // Fetch from network with timeout
    console.log('[SW] Fetching bundle from network:', bundleName);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(request, {
      signal: controller.signal,
      cache: 'no-cache' // Force fresh download
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Bundle fetch failed: ${response.status} ${bundleName}`);
    }

    // Verify response has content
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new Error(`Bundle is empty: ${bundleName}`);
    }

    console.log('[SW] Bundle loaded successfully:', bundleName, `${(buffer.byteLength / 1048576).toFixed(2)}MB`);

    // Cache the valid response
    const cacheResponse = new Response(buffer, {
      headers: response.headers
    });
    cache.put(request, cacheResponse.clone());

    return cacheResponse;

  } catch (err) {
    console.error('[SW] Bundle import failed:', bundleName, err);

    // As last resort, try with network-first and no cache headers
    console.warn('[SW] Attempting emergency network fetch for:', bundleName);
    try {
      const emergencyResponse = await fetch(url, {
        cache: 'reload', // Bypass all caches
        mode: 'cors'
      });

      if (emergencyResponse.ok) {
        console.warn('[SW] Emergency fetch succeeded:', bundleName);
        return emergencyResponse;
      }
    } catch (emergencyErr) {
      console.error('[SW] Emergency fetch also failed:', emergencyErr);
    }

    // Return error response to trigger game's retry logic
    return new Response(`Bundle import failed: ${bundleName}`, { status: 503 });
  }
}

// Cache-first strategy for general assets
async function cacheFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached && cached.ok) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.error('[SW] Cache-first fetch failed:', err);
    return new Response('Not found', { status: 404 });
  }
}

console.log('[SW] Service Worker loaded successfully');

// 230 bytes added for bundle import recovery
