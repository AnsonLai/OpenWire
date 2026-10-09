import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { fetchTopHeadlines, fetchLiveFeedItems, verifyFeed, saveLiveCache, getLiveCache } from '../js/newsService.js';
import { addCustomFeed } from '../js/feedRegistry.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) || null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
const story = { title: 'A newly discovered satellite', link: 'https://bbc.com/satellite', pubDate: new Date().toISOString() };
beforeEach((t) => t.mock.method(console, 'debug', () => {}));

test('a failed primary feed does not prevent working publisher sources from loading', async (t) => {
  store.clear();
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    if (url.includes('rss2json.com') && new URL(url).searchParams.get('rss_url').includes('bbci.co.uk')) {
      return json({ status: 'ok', feed: { title: 'BBC News' }, items: [story] });
    }
    return json({ message: 'Provider unavailable' }, 503);
  });
  let status;
  const articles = await fetchTopHeadlines('TOP', { forceLive: true, onStatus: (value) => status = value });
  assert.equal(articles[0].title, story.title);
  assert.equal(articles[0].source, 'BBC News');
  assert.equal(status.source, 'live');
  assert.ok(status.failedFeeds.some((feed) => feed.name === 'Primary feed'));
});

test('the JSON fallback unwraps a proxy response and works for feed verification too', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('rss2json.com')) return json({ status: 'error', message: 'Rate limit reached' }, 429);
    if (url.includes('allorigins.win')) return json({ contents: JSON.stringify({ title: 'Example Atom Feed', items: [story] }) });
    throw new Error('Unexpected provider');
  });
  const result = await verifyFeed('https://example.com/atom.xml');
  assert.deepEqual(result, { ok: true, count: 1, title: 'Example Atom Feed' });
  assert.ok(urls.some((url) => url.includes('allorigins.win') && decodeURIComponent(url).includes('feed2json.org')));
  assert.equal(urls.filter((url) => url.includes('rss2json.com')).length, 1, 'Verification must not retry the same failed converter twice');
});

test('concurrent requests share a fetch but keep separate article IDs per topic', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return json({ status: 'ok', items: [story] });
  });
  const [first, second] = await Promise.all([
    fetchLiveFeedItems('https://example.com/shared.xml', 'FIRST'),
    fetchLiveFeedItems('https://example.com/shared.xml', 'SECOND'),
  ]);
  assert.equal(requests, 1);
  assert.match(first[0].id, /FIRST/);
  assert.match(second[0].id, /SECOND/);
});

test('failed refresh reports saved data and keeps its original refresh timestamp', async (t) => {
  store.clear();
  saveLiveCache('TOP', [{ title: 'Saved headline', originalUrl: story.link, pubDate: story.pubDate }]);
  const timestamp = getLiveCache('TOP').timestamp;
  t.mock.method(globalThis, 'fetch', async () => json({ message: 'Unavailable' }, 503));
  let status;
  const articles = await fetchTopHeadlines('TOP', { forceLive: true, onStatus: (value) => status = value });
  assert.equal(articles[0].title, 'Saved headline');
  assert.equal(status.source, 'saved');
  assert.equal(status.refreshFailed, true);
  assert.equal(status.updatedAt, timestamp);
  assert.equal(getLiveCache('TOP').timestamp, timestamp);
});

test('snapshot freshness uses fetch time instead of the age of its stories', async (t) => {
  store.clear();
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    urls.push(String(input));
    return json([{ ...story, originalUrl: story.link, pubDate: '2020-01-01', fetchedAt: new Date().toISOString() }]);
  });
  const articles = await fetchTopHeadlines('TOP');
  assert.equal(articles.length, 1);
  assert.deepEqual(urls, ['./news.json']);
});

test('changing sources invalidates the topic cache immediately', async (t) => {
  store.clear();
  saveLiveCache('TOP', [{ title: 'Old configuration', originalUrl: story.link, pubDate: story.pubDate }]);
  addCustomFeed({ name: 'New source', url: 'https://example.com/new-source.xml', topics: ['TOP'] });
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith('./')) return json([{ ...story, originalUrl: story.link, fetchedAt: new Date().toISOString() }]);
    return json({ status: 'ok', items: [story] });
  });
  const articles = await fetchTopHeadlines('TOP');
  assert.notEqual(articles[0].title, 'Old configuration');
  assert.ok(urls.some((url) => decodeURIComponent(url).includes('example.com/new-source.xml')));
});

test('a fresh Pages snapshot replaces stale device data without calling RSS providers', async (t) => {
  store.clear();
  saveLiveCache('TOP', [{ title: 'Old device story', originalUrl: story.link, pubDate: story.pubDate }]);
  const stored = JSON.parse(store.get('openwire_live_cache_TOP'));
  stored.timestamp = Date.now() - 7200000;
  store.set('openwire_live_cache_TOP', JSON.stringify(stored));
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    urls.push(String(input));
    if (String(input) === './news.json') return json([{ ...story, fetchedAt: new Date().toISOString() }]);
    throw new Error('Public providers unavailable');
  });
  const articles = await fetchTopHeadlines('TOP');
  assert.equal(articles[0].title, story.title);
  assert.deepEqual(urls, ['./news.json']);
});

test('provider errors stay actionable instead of being reported as bad search keywords', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json({ status: 'error', message: 'Feed is not reachable' }));
  const result = await verifyFeed('https://example.com/unavailable.xml');
  assert.equal(result.ok, false);
  assert.match(result.error, /Feed is not reachable/);
  assert.doesNotMatch(result.error, /keywords/);
});

test('malformed entries are rejected without returning an empty success', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json({ status: 'ok', items: [{ title: 'Broken link', link: 'not-a-url' }] }));
  const result = await verifyFeed('https://example.com/invalid.xml');
  assert.equal(result.ok, false);
  assert.match(result.error, /valid links/);
});

test('slow providers have a total timeout instead of hanging on each fallback', async (t) => {
  t.mock.method(globalThis, 'fetch', (_input, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Request timed out')), { once: true });
  }));
  const started = Date.now();
  await assert.rejects(fetchLiveFeedItems('https://example.com/slow.xml', 'SLOW', 60), /Could not load/);
  assert.ok(Date.now() - started < 500);
});
