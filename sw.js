// Service Worker for GeoMSTView PWA
const CACHE_VERSION = 'v1';
const CACHE_NAME = `geomstview-${CACHE_VERSION}`;

// Core app shell files that should be cached immediately
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/favicon.png',
  '/manifest.json',
  '/settings.json',
  '/app/main.js',
  '/app/init.js',
  '/app/render.js',
  '/app/animation.js',
  '/app/worker.js',
  '/app/shared.js',
  '/app/utils.js',
  '/app/worker-comm.js',
  '/app/state.js',
  '/app/api.js',
  '/app/ui.js'
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => {
        console.log('[SW] App shell cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache app shell:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests (like external CDNs, tile servers, APIs)
  if (url.origin !== self.location.origin) {
    // For external resources, use network-first strategy
    event.respondWith(
      fetch(request)
        .catch(() => {
          // If network fails, try cache
          return caches.match(request);
        })
    );
    return;
  }

  // For same-origin requests, use cache-first strategy with network fallback
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version and update cache in background
          event.waitUntil(
            fetch(request)
              .then((networkResponse) => {
                if (networkResponse && networkResponse.ok) {
                  return caches.open(CACHE_NAME)
                    .then((cache) => cache.put(request, networkResponse.clone()));
                }
              })
              .catch(() => {
                // Network update failed, but we already returned cached version
              })
          );
          return cachedResponse;
        }

        // Not in cache, fetch from network and cache it
        return fetch(request)
          .then((networkResponse) => {
            // Only cache successful responses
            if (!networkResponse || !networkResponse.ok) {
              return networkResponse;
            }

            // Cache the new response
            return caches.open(CACHE_NAME)
              .then((cache) => {
                // Only cache GET requests
                if (request.method === 'GET') {
                  cache.put(request, networkResponse.clone());
                }
                return networkResponse;
              });
          })
          .catch((error) => {
            console.error('[SW] Fetch failed:', error);
            // Could return a custom offline page here
            throw error;
          });
      })
  );
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
