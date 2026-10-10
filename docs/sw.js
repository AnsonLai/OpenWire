/**
 * sw.js
 * 
 * Progressive Web App Service Worker.
 * Keeps each installed app shell together. News data uses network-first fetches
 * with a bounded wait and an offline fallback.
 */

const CACHE_PREFIX = 'openwire-pwa-docs-';
const CACHE_NAME = 'openwire-pwa-docs-7001f7b1bce9ac76';
const DATA_CACHE_NAME = CACHE_PREFIX + 'news';
const STATIC_ASSETS = [
  '/OpenWire/',
  '/OpenWire/index.html',
  '/OpenWire/css/styles.css',
  '/OpenWire/js/app.js',
  '/OpenWire/js/newsService.js',
  '/OpenWire/js/imageService.js',
  '/OpenWire/js/previewService.js',
  '/OpenWire/js/topicRegistry.js',
  '/OpenWire/js/domainRegistry.js',
  '/OpenWire/js/feedRegistry.js',
  './js/feedCatalog.js',
  './js/sourceGroups.js',
  '/OpenWire/js/feedWeaver.js',
  '/OpenWire/js/settingsExport.js',
  '/OpenWire/js/archiveService.js',
  '/OpenWire/js/publisherUrlService.js',
  '/OpenWire/js/fetchProxy.js',
  '/OpenWire/js/pwa.js',
  '/OpenWire/manifest.json',
  '/OpenWire/favicon.ico',
  '/OpenWire/icons/icon.svg',
  '/OpenWire/icons/icon-32.png',
  '/OpenWire/icons/icon-96.png',
  '/OpenWire/icons/icon-192.png',
  '/OpenWire/icons/icon-512.png',
  '/OpenWire/icons/icon-maskable-192.png',
  '/OpenWire/icons/icon-maskable-512.png'
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
