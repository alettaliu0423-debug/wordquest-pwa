import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve('dist');
async function walk(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const lists = await Promise.all(entries.map(async entry => {
    const full = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(full) : [path.relative(root, full).split(path.sep).join('/')];
  }));
  return lists.flat();
}
const files = (await walk(root)).filter(file => file !== 'sw.js').sort();
const hash = createHash('sha256');
for (const file of files) { hash.update(file); hash.update(await readFile(path.join(root, file))); }
const version = hash.digest('hex').slice(0, 20);
const script = `'use strict';
const VERSION = ${JSON.stringify(version)};
const SCOPE = self.registration.scope;
const CACHE = 'wordquest-official-shell:' + new URL(SCOPE).pathname + ':' + VERSION;
const ASSETS = ${JSON.stringify(['./', ...files])};
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(file => new Request(new URL(file, SCOPE), { cache: 'reload' })));
  })());
});
// No activate cleanup and no clients.claim: preserve all old resources and IndexedDB.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== new URL(SCOPE).origin || !url.pathname.startsWith(new URL(SCOPE).pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = event.request.mode === 'navigate' ? new URL('index.html', SCOPE).href : event.request;
    return (await cache.match(key)) || fetch(event.request);
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'INFO' && event.ports[0]) {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const found = await Promise.all(ASSETS.map(file => cache.match(new URL(file, SCOPE))));
      event.ports[0].postMessage({ version: VERSION, complete: found.every(Boolean) });
    })());
  }
});
`;
await writeFile(path.join(root, 'sw.js'), script);
console.log(`Offline shell ${version}: ${files.length} files plus project entry; old caches retained.`);
