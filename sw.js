const CACHE_NAME = "offline-invoice-cache-v1";

/* Files needed for the app to work offline */
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/app.js",
  "/js/db.js",
  "/js/pdf.js",
  "/manifest.json",
  "/assets/logo.png",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png"
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
});

/* =========================
   ACTIVATE → TAKE CONTROL
========================= */
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

/* =========================
   FETCH → CACHE FIRST
========================= */
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // If file exists in cache → use it
      if (response) {
        return response;
      }

      // Otherwise → go to network
      return fetch(event.request);
    })
  );
});












/* 
const CACHE_NAME = 'invoice-maker-v1';

// List all files you want to cache for offline use
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './js/pdf.js',
  './manifest.json',
  './icon-192.png',
  // We cache the external PDF library so offline generation works
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// 1. Install Event: Cache files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// 2. Fetch Event: Serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request because fetch consumes it
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response because it's a stream
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
  );
});

// 3. Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
}); */