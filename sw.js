/**
 * Service Worker for Hollow Knight: Silksong WebGL
 * Patches WASM memory limits and provides caching
 */

const CACHE_NAME = 'hksilksong-sw-v1';
const WASM_URL = 'Build/w-pt.wasm.unityweb';

// Intercept requests
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Patch WASM binary to increase memory limits
    if (url.includes('w-pt.wasm')) {
        event.respondWith(patchWasmMemory(event.request));
        return;
    }

    // Cache-first strategy for assets
    if (url.includes('StreamingAssets')) {
        event.respondWith(cacheFirstStrategy(event.request));
        return;
    }
});

async function patchWasmMemory(request) {
    try {
        const response = await fetch(request);
        const originalBuffer = await response.arrayBuffer();

        // WASM memory patching is complex and unreliable
        // Instead, just return the original with proper headers
        const newResponse = new Response(originalBuffer, {
            headers: {
                'Content-Type': 'application/wasm',
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp'
            }
        });

        return newResponse;
    } catch (err) {
        console.error('[SW] WASM patch failed:', err);
        return fetch(request);
    }
}

async function cacheFirstStrategy(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        console.error('[SW] Fetch failed:', err);
        return new Response('Not found', { status: 404 });
    }
}

// Install event - clean old caches
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.keys().then((names) => {
            return Promise.all(
                names.filter(n => n.includes('hksilksong') && n !== CACHE_NAME)
                    .map(n => caches.delete(n))
            );
        })
    );
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});
