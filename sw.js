const CACHE_NAME = 'health-tracker-v1';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/utils.js',
  './js/db.js',
  './js/entries.js',
  './js/timeline.js',
  './js/export.js',
  './js/app.js',
  './manifest.json'
];

// Dexie from CDN - cache it too
const CDN_ASSETS = [
  'https://unpkg.com/dexie@3.2.7/dist/dexie.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all([
        cache.addAll(ASSETS),
        ...CDN_ASSETS.map(url =>
          fetch(url).then(resp => cache.put(url, resp)).catch(() => {})
        )
      ]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // Cache successful GET requests
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
