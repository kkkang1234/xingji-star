'use strict';

// Local static serving only. User-selected videos remain browser File/Blob objects.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = fs.realpathSync(__dirname);
const portText = process.env.STARTRACE_PORT || '4173';
if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
  console.error('STARTRACE_PORT must be an integer between 1 and 65535.');
  process.exit(1);
}
const port = Number(portText);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
};

function insideRoot(filePath) {
  const relative = path.relative(root, filePath);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function reply(req, res, status, message) {
  const body = Buffer.from(message + '\n');
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(status === 405 ? { Allow: 'GET, HEAD' } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(req, res, 405, 'Method not allowed');
  // Reject unexpected Host headers so another website cannot use DNS rebinding
  // to read these local project files.
  if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes((req.headers.host || '').toLowerCase())) {
    return reply(req, res, 403, 'Forbidden host');
  }
  let pathname;
  try {
    pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    return reply(req, res, 400, 'Malformed path');
  }
  // Validate the raw decoded path before any normalization; on Windows both
  // slash styles, drive names and NTFS alternate data streams need checking.
  if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\\\0:\x01-\x1f]/.test(pathname) || pathname.split('/').some(part => part === '..' || part.startsWith('.'))) {
    return reply(req, res, 403, 'Forbidden path');
  }
  let target = path.resolve(root, '.' + pathname);
  if (!insideRoot(target)) return reply(req, res, 403, 'Forbidden path');
  try {
    let stat = await fs.promises.stat(target);
    if (stat.isDirectory()) {
      target = path.join(target, 'index.html');
      stat = await fs.promises.stat(target);
    }
    // Follow links before checking, so a symlink cannot expose outside files.
    target = await fs.promises.realpath(target);
    if (!insideRoot(target)) return reply(req, res, 403, 'Forbidden path');
    if (!stat.isFile()) return reply(req, res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(target);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    reply(req, res, ['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code) ? 404 : 500, 'Not found');
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is already in use. Close the previous StarTrace window or set STARTRACE_PORT to a different port.`
    : `Cannot start StarTrace: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`StarTrace is ready: ${url}`);
  console.log('Keep this window open while using the app. Press Ctrl+C to stop.');
  // The launcher explicitly opts in; tests and `npm start` never open a browser.
  if (process.argv.includes('--open')) {
    const launch = process.platform === 'win32'
      ? ['cmd.exe', ['/d', '/s', '/c', 'start', '""', url]]
      : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    const child = spawn(launch[0], launch[1], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => console.log(`Open this URL in your browser: ${url}`));
    child.unref();
  }
});

