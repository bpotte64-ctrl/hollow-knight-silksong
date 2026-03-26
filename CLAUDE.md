# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Unity WebGL build of Hollow Knight: Silksong with custom asset loading and caching system. The game assets (~2GB) are split into 100 compressed parts, downloaded on first load, extracted via JSZip, and stored in the browser Cache API for subsequent visits.

## Architecture

### Core Files
- `index.html` - Production entry point with dynamic base href (localhost vs CDN)
- `index-local.html` - Local development entry point (static base href)
- `Build/w-pt.loader.js` - Unity WebGL loader script
- `Build/w-pt.*.unityweb` - Unity build artifacts (data, framework, wasm)
- `jszip.js` - Library for extracting split asset archives
- `js/memory-patch.js` - Memory initialization patch (loaded before Unity)
- `webgl-memory-fix.js` - Legacy WebGL memory/configuration fixes
- `server.js` - Local HTTP server with COOP/COEP headers for development
- `sw.js` - Service Worker for caching and WASM patching
- `clear-cache.html` - Utility page for clearing browser cache

### Asset System
- Assets stored in `StreamingAssets/aa/WebGL.zip.part[1-100]`
- First visit: Downloads all parts → extracts via JSZip → caches individually
- Subsequent visits: Loads directly from Cache API
- Cache key: `hksilksongcache-v3-fixed` (production) or `hksilksongcache-local-v3` (local)

### Deployment
- `_headers` - Netlify configuration for CORS, COOP/COEP, and cache policies
- `_redirects` - Netlify SPA routing (all routes serve index.html)
- Production builds load from `cdn.jsdelivr.net/gh/web-ports/hollow-knight-silksong`

## Common Fixes

### Memory Allocation
`js/memory-patch.js` runs before the Unity loader and configures:
- Increased memory allocation (3GB initial, up to 3.75GB max for WASM32)
- Memory growth enabled to handle dynamic allocation
- abort() override to prevent crash on OOM errors

`webgl-memory-fix.js` provides additional runtime patches for:
- Empty selector validation (prevents querySelector errors)
- HEAP bounds checking
- IDBFS filesystem sync initialization
- dynCall error suppression for signature mismatches

### Key Patches in index.html
1. **querySelector override** - Returns canvas for empty selectors
2. **dynCall wrapper** - Catches function signature mismatch errors
3. **Runtime error handler** - Prevents WASM errors from triggering alerts

## Development

### Local Testing
Serve `index-local.html` with the built-in server (required for Service Worker, Cache API, and COOP/COEP headers):

```bash
# Recommended: Node.js server with proper headers
node server.js

# Alternative: Python
python -m http.server 8000

# Alternative: npx serve
npx serve .
```

Access at `http://localhost:8080/index-local.html` (or port 8000 for Python)

### Clearing Cache
Option 1: Use the utility page:
- Open `clear-cache.html` in browser (provides one-click cache clearing)

Option 2: DevTools:
- Open DevTools → Application → Storage → Clear Site Data

Option 3: Console:
```javascript
caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
```

## Key Considerations

- **Large asset size**: ~2GB total, split into 100 parts to work around hosting limits
- **Cache-first loading**: Production builds check Cache API before network fetch
- **Error resilience**: Multiple patches prevent common WebGL/WASM errors from crashing
- **Dual deployment**: Localhost uses local files, production uses jsdelivr CDN
