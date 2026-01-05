/* =================================================
   SERVICE WORKER – OFFLINE INVOICE MAKER
   Offline-first PWA (PWABuilder compatible)
================================================= */

const CACHE_NAME = "offline-invoice-cache-v1";

// Detect if running on GitHub Pages or local
const isGitHubPages = self.location.href.includes('github.io');
const BASE_PATH = isGitHubPages ? '/offline-invoice-maker' : '';

/* Files required for offline use */
const PRECACHE_ASSETS = [
  BASE_PATH + '/',
  BASE_PATH + '/index.html',
  BASE_PATH + '/manifest.json',
  BASE_PATH + '/css/style.css',
  BASE_PATH + '/js/app.js',
  BASE_PATH + '/js/storage.js',
  BASE_PATH + '/js/pdf.js',
  BASE_PATH + '/assets/logo.png',
  BASE_PATH + '/assets/icons/icon-192.png',
  BASE_PATH + '/assets/icons/icon-512.png'
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
