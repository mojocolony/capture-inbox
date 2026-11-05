/* Capture Inbox app shell: only public, same-origin assets are cached.
   All Dropbox API traffic and private capture data stay outside the service worker. */
'use strict';
const CACHE_NAME = 'capture-inbox-public-shell-v0.7.3';
const PUBLIC_ASSETS = [
  './', './index.html',
  './styles.css?v=0.7.3', './app.js?v=0.7.3',
  './manifest.webmanifest?v=0.7.3',
  './favicon.svg?v=0.7.3', './favicon-32.png?v=0.7.3',
  './apple-touch-icon.png?v=0.7.3',
  './icon-192.png?v=0.7.3', './icon-512.png?v=0.7.3',
  './icon-maskable-512.png?v=0.7.3'
];
const APP_SCOPE = new URL('./', self.registration.scope);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PUBLIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('capture-inbox-public-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_SCOPE.pathname)) return;
  // Navigation may contain a Dropbox OAuth code: never persist querystring URLs.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('./index.html')) || Response.error()));
    return;
  }
  // No API responses, dynamic files, or cross-origin data are cached.
  if (!/\.(?:js|css|webmanifest|png|svg|ico)$/.test(url.pathname)) return;
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
      }
      return response;
    }))
  );
});
