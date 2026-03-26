/**
 * Local server for Hollow Knight: Silksong WebGL
 * Includes COOP/COEP headers for SharedArrayBuffer (>2GB memory) support
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.data': 'application/octet-stream',
    '.bundle': 'application/octet-stream',
    '.unityweb': 'application/octet-stream',
};

const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index-local.html' : req.url);

    // Handle query strings
    filePath = filePath.split('?')[0];

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // COOP/COEP headers for SharedArrayBuffer support (required for >2GB memory)
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

    // Cache control for build files
    if (ext === '.html') {
        res.setHeader('Cache-Control', 'no-cache');
    } else if (ext === '.unityweb' || ext === '.bundle' || ext === '.wasm') {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // SPA fallback - serve index.html
                fs.readFile(path.join(__dirname, 'index-local.html'), (err2, content2) => {
                    if (err2) {
                        res.writeHead(500);
                        res.end('Error loading index.html');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(content2);
                    }
                });
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n=== Hollow Knight: Silksong Local Server ===`);
    console.log(`Server running at: http://localhost:${PORT}`);
    console.log(`COOP/COEP headers enabled for >2GB memory support`);
    console.log(`\nOpen http://localhost:${PORT} in your browser`);
    console.log(`Press Ctrl+C to stop the server\n`);
});
