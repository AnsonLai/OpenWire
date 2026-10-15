/**
 * sw.js
 * 
 * Progressive Web App Service Worker.
 * Keeps each installed app shell together. News data uses network-first fetches
 * with a bounded wait and an offline fallback.
 */

const CACHE_PREFIX = 'openwire-pwa-root-';
const CACHE_NAME = 'openwire-pwa-root-v33';
const DATA_CACHE_NAME = CACHE_PREFIX + 'news';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/newsService.js',
  './js/imageService.js',
  './js/previewService.js',
  './js/topicRegistry.js',
  './js/domainRegistry.js',
  './js/feedRegistry.js',
  './js/feedCatalog.js',
  './js/sourceGroups.js',
  './js/feedWeaver.js',
  './js/settingsExport.js',
  './js/archiveService.js',
  './js/publisherUrlService.js',
  './js/fetchProxy.js',
  './js/pwa.js',
  './manifest.json',
  './favicon.ico',
  './icons/icon.svg',
  './icons/icon-32.png',
  './icons/icon-96.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];
const SHELL_URLS = new Set(STATIC_ASSETS.map((asset) => new URL(asset, self.registration.scope).href));

// Install: pre-cache application shell and skip waiting immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Only clean this deployment's caches; other apps on the origin keep theirs.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && key !== DATA_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // External APIs or proxies are handled by network
  if (event.request.method !== 'GET' || url.origin !== location.origin || !url.href.startsWith(self.registration.scope)) {
    return;
  }

  const cleanUrl = new URL(url);
  cleanUrl.search = '';
  const isShell = SHELL_URLS.has(cleanUrl.href);
  const cacheKey = event.request.mode === 'navigate' && isShell
    ? new URL('index.html', self.registration.scope).href : event.request;
  event.respondWith((async () => {
    let cache;
    let saved;
    try {
      cache = await caches.open(isShell ? CACHE_NAME : DATA_CACHE_NAME);
      saved = await cache.match(cacheKey, { ignoreSearch: true });
    } catch {
      // Cache storage may be unavailable or damaged; the network still works.
    }
    if (isShell && saved) return saved;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(event.request, { signal: controller.signal });
      if (response.ok && cache) {
        event.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
      } else if (saved) {
        return saved;
      }
      return response;
    } catch {
      return saved || Response.error();
    } finally {
      clearTimeout(timeout);
    }
  })());
});
