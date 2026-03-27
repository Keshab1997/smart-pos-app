// sw.js
const CACHE_NAME = 'smart-pos-v5'; // ভার্সন আপডেট করুন
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

// ১. ইন্সটল এবং ক্যাশ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching assets...');
      return cache.addAll(ASSETS);
    })
  );
});

// ২. অ্যাক্টিভেট এবং পুরনো ক্যাশ ডিলিট
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Removing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // নতুন সার্ভিস ওয়ার্কারকে সাথে সাথে কন্ট্রোল নিতে বাধ্য করা
  return self.clients.claim();
});

// ৩. স্মার্ট ফেচ স্ট্রাটেজি (Stale-While-Revalidate)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // নতুন রেসপন্স ক্যাশে আপডেট করা (শুধু আমাদের স্ট্যাটিক ফাইলের জন্য)
        // NOTE: cache.put() consumes the response body; only do this for GET requests.
        if (
          event.request.method === 'GET' &&
          event.request.url.startsWith(self.location.origin) &&
          networkResponse &&
          networkResponse.ok
        ) {
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
            });
        }
        return networkResponse;
      }).catch(() => {
          // অফলাইন থাকলে ক্যাশ থেকে দেবে
          return cachedResponse;
      });
      return cachedResponse || fetchPromise;
    })
  );
});

// ৪. আপডেট মেসেজ রিসিভ করা
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});