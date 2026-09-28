'use strict';

// This preview inlines the UI CSS and app entrypoint. Local vision modules,
// selection modules and model/WASM assets intentionally stay external.
// Serve prototype.html over localhost with the rest of this project folder.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
let html = read('index.html');
let cssCount = 0;
let jsCount = 0;
html = html.replace(/<link\b[^>]*\bhref\s*=\s*(["'])\.?\/?style\.css\1[^>]*>/gi, () => {
  cssCount++;
  return `<style>\n${read('style.css')}\n</style>`;
});
html = html.replace(/<script\b([^>]*?)\bsrc\s*=\s*(["'])\.?\/?app\.js\2([^>]*)>\s*<\/script>/gi, (_, before, quote, after) => {
  jsCount++;
  // Escape an HTML script closing sequence if it occurs in a JS string/comment.
  const code = read('app.js').replace(/<\/script/gi, '<\\/script');
  return `<script${before}${after}>\n${code}\n</script>`;
});
if (cssCount !== 1 || jsCount !== 1) throw new Error('Expected one style.css link and one app.js script in index.html.');
html = html.replace('<head>', '<head>\n<!-- StarTrace UI preview. Requires localhost and the adjacent modules/assets; not a standalone offline HTML file. -->');
fs.writeFileSync(path.join(root, 'prototype.html'), html, 'utf8');
console.log('Built prototype.html. Serve over localhost together with vision.js and assets/.');
