const CACHE_NAME = 'smart-pos-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/css/global.css',
  '/css/navbar.css',
  '/js/firebase-config.js',
  '/js/navbar.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
