// sw.js
const CACHE_NAME = 'smart-pos-v1.2'; // আপডেট করলে এখানে v1.2, v1.3 এভাবে বাড়িয়ে দেবেন
const ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/css/global.css',
  '/css/navbar.css',
  '/css/login.css',
  '/js/firebase-config.js',
  '/js/navbar.js',
  '/js/auth.js'
];

// ১. ইন্সটল হওয়ার সময় নতুন ফাইল ক্যাশ করা
self.addEventListener('install', (event) => {
  self.skipWaiting(); // নতুন সার্ভিস ওয়ার্কারকে সাথে সাথে একটিভ হতে বাধ্য করবে
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// ২. একটিভেট হওয়ার সময় পুরনো ক্যাশ ডিলিট করা (এটিই আপনার সমস্যার মেইন সমাধান)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
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