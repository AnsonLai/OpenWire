import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { transformServiceWorker } from '../build.js';

const source = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
function createWorker({ saved, response = new Response('new'), error, keys = [], installError, cacheError, matchError } = {}) {
  const handlers = new Map();
  const deleted = [];
  const writes = [];
  const requests = [];
  const waits = [];
  const opened = [];
  let installed = false;
  const cache = {
    match: async (key) => {
      if (matchError) throw matchError;
      return typeof saved === 'function' ? saved(key) : saved;
    },
    put: async (key, value) => { writes.push({ key, value }); },
    addAll: async () => { if (installError) throw installError; },
  };
  const context = vm.createContext({
    URL, Response, AbortController, setTimeout, clearTimeout,
    location: { origin: 'https://example.com' },
    self: {
      registration: { scope: 'https://example.com/OpenWire/' },
      addEventListener: (type, handler) => handlers.set(type, handler),
      skipWaiting: async () => { installed = true; },
      clients: { claim: async () => {} },
    },
    caches: {
      open: async (name) => { opened.push(name); if (cacheError) throw cacheError; return cache; },
      keys: async () => keys,
      delete: async (key) => deleted.push(key),
    },
    fetch: async (request) => { requests.push(request); if (error) throw error; return response; },
  });
  vm.runInContext(transformServiceWorker(source, '/OpenWire/', 'docs', 'test-version'), context);
  return {
    deleted, writes, requests, opened,
    get installed() { return installed; },
    async dispatch(type, request = {}) {
      let result;
      handlers.get(type)({ request,
        respondWith(promise) { result = promise; },
        waitUntil(promise) { waits.push(promise); },
      });
      const value = await result;
      await Promise.all(waits);
      return value;
    },
  };
}

test('shared-link navigation uses the installed shell even if the network is unavailable', async () => {
  const worker = createWorker({ saved: (key) => {
    assert.equal(key, 'https://example.com/OpenWire/index.html');
    return new Response('installed shell');
  }, error: new Error('Offline') });
  const result = await worker.dispatch('fetch', {
    url: 'https://example.com/OpenWire/?url=https%3A%2F%2Fbbc.com', method: 'GET', mode: 'navigate',
  });
  assert.equal(await result.text(), 'installed shell');
  assert.equal(worker.requests.length, 0);
});

test('a news server error falls back to the saved snapshot', async () => {
  const worker = createWorker({ saved: new Response('saved news'), response: new Response('temporary failure', { status: 503 }) });
  const result = await worker.dispatch('fetch', { url: 'https://example.com/OpenWire/data/news_top.json', method: 'GET' });
  assert.equal(await result.text(), 'saved news');
  assert.equal(worker.writes.length, 0);
});

test('unavailable cache storage cannot block online navigation or news', async () => {
  for (const url of ['https://example.com/OpenWire/', 'https://example.com/OpenWire/news.json']) {
    const worker = createWorker({ cacheError: new Error('Cache storage unavailable') });
    const result = await worker.dispatch('fetch', { url, method: 'GET', mode: url.endsWith('/') ? 'navigate' : 'cors' });
    assert.equal(await result.text(), 'new');
    assert.equal(worker.requests.length, 1);
    assert.equal(worker.writes.length, 0);
  }
});

test('a damaged cache index does not block a working news response', async () => {
  const worker = createWorker({ matchError: new Error('Cache index unreadable') });
  const result = await worker.dispatch('fetch', { url: 'https://example.com/OpenWire/news.json', method: 'GET' });
  assert.equal(await result.text(), 'new');
  assert.equal(worker.requests.length, 1);
});

test('successful news responses are cached within the worker lifetime', async () => {
  const worker = createWorker();
  const result = await worker.dispatch('fetch', { url: 'https://example.com/OpenWire/news.json', method: 'GET' });
  assert.equal(await result.text(), 'new');
  assert.equal(worker.writes.length, 1);
  assert.deepEqual(worker.opened, ['openwire-pwa-docs-news'], 'News snapshots must survive a change of shell revision');
});

test('activation keeps other applications and deployments caches', async () => {
  const worker = createWorker({ keys: ['unrelated-app', 'openwire-pwa-root-old', 'openwire-pwa-docs-old', 'openwire-pwa-docs-test-version', 'openwire-pwa-docs-news'] });
  await worker.dispatch('activate');
  assert.deepEqual(worker.deleted, ['openwire-pwa-docs-old']);
});

test('non-GET, external and out-of-scope requests are untouched', async () => {
  const worker = createWorker();
  for (const request of [
    { url: 'https://example.com/OpenWire/api', method: 'POST' },
    { url: 'https://rss.example.com/feed', method: 'GET' },
    { url: 'https://example.com/other-app/', method: 'GET' },
  ]) assert.equal(await worker.dispatch('fetch', request), undefined);
  assert.equal(worker.requests.length, 0);
});

test('failed shell installation does not activate a partially downloaded update', async () => {
  const worker = createWorker({ installError: new Error('Missing required module') });
  await assert.rejects(worker.dispatch('install'), /Missing required module/);
  assert.equal(worker.installed, false);
});

test('PWA registration never automatically reloads an open app', async () => {
  const pwaSource = fs.readFileSync(new URL('../js/pwa.js', import.meta.url), 'utf8').replace(/^export /gm, '');
  const events = new Map();
  let updates = 0;
  let reloads = 0;
  const context = vm.createContext({ console: { info() {}, warn() {} }, document: { getElementById: () => null },
    window: { addEventListener: (event, handler) => events.set(event, handler), location: { reload: () => reloads++ } },
    navigator: { serviceWorker: {
      addEventListener: (event, handler) => events.set(event, handler),
      register: async () => ({ scope: '/', update: async () => updates++ }),
    } },
  });
  vm.runInContext(pwaSource, context);
  context.initPWA();
  await events.get('load')();
  if (events.has('controllerchange')) events.get('controllerchange')();
  assert.equal(updates, 1);
  assert.equal(reloads, 0);
});
