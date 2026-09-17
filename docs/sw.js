/**
 * sw.js
 * 
 * Progressive Web App Service Worker.
 * Uses Network-First strategy so code updates are received immediately,
 * falling back to offline cache when disconnected.
 */

const CACHE_NAME = 'headlines-pwa-docs-v8';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/newsService.js',
  '/js/imageService.js',
  '/js/topicRegistry.js',
  '/js/domainRegistry.js',
  '/js/feedRegistry.js',
  '/js/feedWeaver.js',
  './js/settingsExport.js',
  '/js/archiveService.js',
  '/js/fetchProxy.js',
  '/js/pwa.js',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon.svg',
  '/icons/icon-32.png',
  '/icons/icon-96.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png'
];

// Install: pre-cache application shell and skip waiting immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: delete all older caches and take control of all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First for local assets, Network-only for external APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // External APIs or proxies are handled by network
  if (url.origin !== location.origin) {
    return;
  }

  // Network-first: try network to get the freshest code, fallback to cache if offline
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
