// sw.js
const CACHE_NAME = 'smart-pos-v17'; // ভার্সন আপডেট করুন
const ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/dashboard.html',
  
  // CSS Files
  '/css/global.css',
  '/css/navbar.css',
  '/css/login.css',
  '/css/dashboard.css',
  '/css/admin.css',
  
  // JS Files
  '/js/firebase-config.js',
  '/js/navbar.js',
  '/js/auth.js',
  '/js/toast.js',
  '/js/dashboard.js',
  '/js/admin.js',
  '/js/pwa-handler.js',
  '/js/shop-helper.js',
  
  // Expense Module
  '/expense/expense.html',
  '/expense/expense.css',
  '/expense/expense.js',
  
  // Inventory Module
  '/inventory/inventory.html',
  '/inventory/inventory.css',
  '/inventory/inventory.js',
  '/inventory/inventory-extras.js',
  '/inventory/print-report.js',
  
  // Billing Module
  '/billing/billing.html',
  '/billing/billing.css',
  '/billing/billing.js',
  '/billing/print.html',
  '/billing/print.css',
  '/billing/print.js',
  '/billing/mobile-scanner.html',
  
  // Add Product Module
  '/add-product/add-product.html',
  '/add-product/add-product.css',
  '/add-product/add-product.js',
  '/add-product/print.css',
  '/add-product/print-handler.js',
  
  // Purchase Record Module
  '/purchase-record/purchase-record.html',
  '/purchase-record/purchase-record.css',
  '/purchase-record/purchase-record.js',
  '/purchase-record/purchase-dashboard.html',
  '/purchase-record/purchase-dashboard.css',
  '/purchase-record/purchase-dashboard.js',
  
  // Sales Report Module
  '/sales-report/report.html',
  '/sales-report/report.css',
  '/sales-report/report.js',
  '/sales-report/profit-loss.html',
  '/sales-report/profit-loss.css',
  '/sales-report/profit-loss.js',
  
  // Advance Booking Module
  '/advance-booking/index.html',
  '/advance-booking/booking.css',
  '/advance-booking/booking.js',
  '/advance-booking/booking-print.html',
  '/advance-booking/booking-print.js',
  
  // Shop Details Module
  '/shop-details/shop-details.html',
  '/shop-details/shop-details.css',
  '/shop-details/shop-details.js',
  
  // Cancelled Bills Module
  '/cancelled-bills/index.html',
  '/cancelled-bills/style.css',
  '/cancelled-bills/script.js',
  
  // Label Printer Module
  '/label-printer/index.html',
  '/label-printer/style.css',
  '/label-printer/script.js',
  
  // Staff Management Module
  '/staff-management/index.html',
  '/staff-management/staff.js',
  
  // Print Barcode
  '/print-barcode.html',
  '/print-barcode.css',
  '/print-barcode.js',
  
  // Manifest
  '/manifest.json'
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
            // In some browsers/workloads clone() may fail if stream got locked.
            try {
              const responseForCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseForCache).catch(() => {});
              });
            } catch (e) {
              // Skip cache update for this response and still return network response.
            }
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