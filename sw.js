/**
 * Letterloom service worker — keeps the whole game (code, fonts, both
 * dictionaries) on the device so it plays with no network.
 *
 * Bump CACHE_VERSION whenever a file in PRECACHE changes; tests/offline.test.js
 * checks that every shipped file is listed here.
 */
/* eslint-disable no-restricted-globals */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `letterloom-${CACHE_VERSION}`;

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/fonts.css',
  'css/style.css',
  'css/mobile.css',
  'css/large-print.css',
  'js/engine.js',
  'js/storage.js',
  'js/ai.js',
  'js/ai-worker.js',
  'js/i18n.js',
  'js/ui.js',
  'js/offline.js',
  'data/words.txt',
  'data/words.es.txt',
  'fonts/archivo-latin.woff2',
  'fonts/archivo-latin-ext.woff2',
  'fonts/newsreader-latin.woff2',
  'fonts/newsreader-latin-ext.woff2',
  'fonts/newsreader-italic-latin.woff2',
  'fonts/newsreader-italic-latin-ext.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // `reload` skips the HTTP cache so a new version never pins stale files.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith('letterloom-') && key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'status') {
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.match(url))))
      .then((hits) => {
        const ready = hits.every(Boolean);
        if (event.source) event.source.postMessage({ type: 'offline-status', ready, version: CACHE_VERSION });
      });
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Cache first: the precache is a complete, consistent copy of one version.
  // A new version arrives through a new service worker, not piecemeal.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        if (request.mode === 'navigate') {
          return fetch(request).catch(() => cache.match('index.html'));
        }
        return fetch(request);
      })
    )
  );
});
