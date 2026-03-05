const CACHE_NAME = 'health-tracker-v8';
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

// Stale-while-revalidate: serve cached version immediately, fetch update in background
// Next visit gets the fresh version. Offline still works from cache.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (event.request.method === 'GET' && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => {
          // Offline - return cached or fallback
          if (event.request.mode === 'navigate') {
            return cache.match('./index.html');
          }
          return cached;
        });
        // Return cached immediately if available, otherwise wait for network
        return cached || fetchPromise;
      });
    })
  );
});
