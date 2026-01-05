/* =================================================
   SERVICE WORKER – OFFLINE INVOICE MAKER
   Offline-first PWA (PWABuilder compatible)
================================================= */

const CACHE_NAME = "offline-invoice-cache-v2";

/* Files required for offline use - use relative paths */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './js/pdf.js',
  './assets/logo.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];


/* =========================
   INSTALL → PRE-CACHE FILES
========================= */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );

  // Activate immediately
  self.skipWaiting();
});

/* =========================
   ACTIVATE → CLEAN OLD CACHE
========================= */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );

  self.clients.claim();
});

/* =========================
   FETCH → CACHE FIRST
========================= */
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Never cache Google Play / billing requests
  if (
    url.origin.includes("google.com") ||
    url.origin.includes("gstatic.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});


/* =========================
   MESSAGE → SKIP WAITING
========================= */
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
