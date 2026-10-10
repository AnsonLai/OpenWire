import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { fetchTopHeadlines, fetchLiveFeedItems, verifyFeed, saveLiveCache, getLiveCache } from '../js/newsService.js';
import { addCustomFeed, addCustomSource } from '../js/feedRegistry.js';
import { addCustomTopic } from '../js/topicRegistry.js';

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

test('live RSS and older Pages snapshots reuse published Google-to-publisher mappings', async t => {
  store.clear();
  const feed = addCustomSource({ name: 'Wall Street Journal', url: 'https://example.com/resolved-rss.xml' });
  const topic = addCustomTopic({ label: 'Resolved RSS', sources: [feed.id] }).id;
  t.mock.method(globalThis, 'fetch', async input => {
    const url = String(input);
    if (url.endsWith('/data/publisher_urls.json')) return json({
      'mapped-live': 'https://www.wsj.com/news/live-publisher', 'mapped-snapshot': 'https://www.wsj.com/news/snapshot-publisher',
    });
    if (url.includes('rss2json')) return json({ status: 'ok', feed: { title: 'Wall Street Journal' }, items: [{
      ...story, link: 'https://news.google.com/rss/articles/mapped-live?hl=en-CA',
    }] });
    if (url.includes('news.json')) return json([{ title: 'Snapshot headline',
      originalUrl: 'https://news.google.com/read/mapped-snapshot?hl=en-US', domain: 'wsj.com', fetchedAt: new Date().toISOString() }]);
    return json({}, 404);
  });
  const live = await fetchTopHeadlines(topic, { forceLive: true });
  assert.equal(live[0].originalUrl, 'https://www.wsj.com/news/live-publisher');
  assert.equal(live[0].targetUrl, 'https://archive.is/newest/https://www.wsj.com/news/live-publisher');
  const saved = await fetchTopHeadlines('TOP');
  assert.equal(saved[0].originalUrl, 'https://www.wsj.com/news/snapshot-publisher');
  assert.equal(saved[0].targetUrl, 'https://archive.is/newest/https://www.wsj.com/news/snapshot-publisher');
});

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
  assert.ok(status.failedFeeds.some((feed) => feed.name === 'Google News'));
});

test('a live refresh retains photos and resolved publisher links from the displayed snapshot', async (t) => {
  store.clear();
  const feed = addCustomSource({ name: 'BBC News', url: 'https://example.com/photo-refresh.xml' });
  const topic = addCustomTopic({ label: 'Photo refresh', sources: [feed.id] }).id;
  const wrapper = 'https://news.google.com/rss/articles/photo-refresh';
  t.mock.method(globalThis, 'fetch', async () => json({ status: 'ok', feed: { title: 'BBC News' }, items: [{ ...story, link: wrapper }] }));
  const articles = await fetchTopHeadlines(topic, { forceLive: true, previousArticles: [{
    ...story, originalUrl: story.link, domain: 'bbc.com', imageUrl: 'https://photos.example/satellite.jpg',
  }] });
  assert.equal(articles.length, 1);
  assert.equal(articles[0].imageUrl, 'https://photos.example/satellite.jpg');
  assert.equal(articles[0].originalUrl, story.link);
  assert.equal(articles[0].domain, 'bbc.com');
  assert.equal(getLiveCache(topic).articles[0].imageUrl, articles[0].imageUrl);
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

test('a damaged device cache keeps usable headlines and rejects broken records', async (t) => {
  store.clear();
  saveLiveCache('TOP', [{ title: 'Usable cached headline', originalUrl: story.link, pubDate: story.pubDate }]);
  const cached = JSON.parse(store.get('openwire_live_cache_TOP'));
  cached.articles.unshift(null, { title: 42 }, { title: 'Broken URL', originalUrl: 'not a URL' });
  store.set('openwire_live_cache_TOP', JSON.stringify(cached));
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('No network needed'); });
  const articles = await fetchTopHeadlines('TOP');
  assert.deepEqual(articles.map(article => article.title), ['Usable cached headline']);
});

test('invalid cache metadata falls through to a healthy published snapshot', async (t) => {
  store.clear();
  saveLiveCache('TOP', [{ title: 'Invalid timestamp cache', originalUrl: story.link }]);
  const cached = JSON.parse(store.get('openwire_live_cache_TOP'));
  cached.timestamp = -1;
  store.set('openwire_live_cache_TOP', JSON.stringify(cached));
  assert.equal(getLiveCache('TOP'), null);
  t.mock.method(globalThis, 'fetch', async () => json([
    null, { title: 'Broken snapshot record', originalUrl: 'invalid' },
    { ...story, originalUrl: story.link, fetchedAt: new Date().toISOString() },
  ]));
  const articles = await fetchTopHeadlines('TOP');
  assert.deepEqual(articles.map(article => article.title), [story.title]);
});

test('an entirely damaged cache cannot suppress a healthy live feed', async (t) => {
  store.clear();
  saveLiveCache('TOP', [{ title: 'Will be damaged', originalUrl: story.link }]);
  const cached = JSON.parse(store.get('openwire_live_cache_TOP'));
  cached.articles = [null, {}];
  store.set('openwire_live_cache_TOP', JSON.stringify(cached));
  t.mock.method(globalThis, 'fetch', async input => String(input).startsWith('./')
    ? json([], 404) : json({ status: 'ok', items: [story] }));
  const articles = await fetchTopHeadlines('TOP');
  assert.equal(articles[0].title, story.title);
});

test('a broken first converter falls back and malformed entries cannot discard valid articles', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => String(input).includes('rss2json')
    ? json({ status: 'ok', items: [null, { title: 'Invalid', link: '/relative' }] })
    : json({ contents: JSON.stringify({ title: 'Healthy fallback', items: [null, {}, story] }) }));
  const result = await verifyFeed('https://example.com/partial-payload.xml');
  assert.deepEqual(result, { ok: true, count: 1, title: 'Healthy fallback' });
});

function sourcePair() {
  store.clear();
  const a = addCustomSource({ name: 'Publisher A', url: 'https://example.com/a.xml' });
  const b = addCustomSource({ name: 'Publisher B', url: 'https://example.com/b.xml' });
  return addCustomTopic({ label: 'My publishers', sources: [a.id, b.id] }).id;
}

test('partial outages keep the failed publisher, preserve its age, and recover on retry', async (t) => {
  const topic = sourcePair();
  let outage = false;
  let status;
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = decodeURIComponent(String(input));
    if (outage && url.includes('a.xml')) return json({}, 503);
    return json({ status: 'ok', feed: { title: url.includes('/a.xml') ? 'Publisher A' : 'Publisher B' }, items: [{
      title: url.includes('/a.xml') ? 'Explorers navigate polar waters' : 'Astronomers photograph distant galaxies',
      link: url.includes('/a.xml') ? 'https://a.example/polar' : 'https://b.example/galaxies',
      pubDate: story.pubDate,
    }] });
  });
  await fetchTopHeadlines(topic, { forceLive: true });
  const entries = JSON.parse(store.get('openwire_source_cache_v1'));
  const a = entries.find(entry => entry.url.endsWith('/a.xml'));
  a.updatedAt -= 60000;
  store.set('openwire_source_cache_v1', JSON.stringify(entries));
  outage = true;
  const articles = await fetchTopHeadlines(topic, { forceLive: true, onStatus: value => status = value });
  assert.equal(articles.length, 2);
  assert.equal(new Set(articles.map(article => article.id)).size, 2);
  assert.equal(status.source, 'live');
  assert.equal(status.sources.find(source => source.name === 'Publisher A').status, 'saved');
  assert.equal(status.sources.find(source => source.name === 'Publisher A').updatedAt, a.updatedAt);
  assert.equal(JSON.parse(store.get('openwire_source_cache_v1')).find(entry => entry.url.endsWith('/a.xml')).updatedAt, a.updatedAt);
  outage = false;
  await fetchTopHeadlines(topic, { forceLive: true, onStatus: value => status = value });
  assert.equal(status.failedFeeds.length, 0);
  assert.ok(status.sources.every(source => source.status === 'live'));
});

test('a complete outage does not stamp recovered source data as a fresh update', async (t) => {
  const topic = sourcePair();
  let outage = false;
  t.mock.method(globalThis, 'fetch', async () => outage ? json({}, 503) : json({ status: 'ok', items: [story] }));
  await fetchTopHeadlines(topic, { forceLive: true });
  const timestamp = getLiveCache(topic).timestamp;
  outage = true;
  let status;
  const articles = await fetchTopHeadlines(topic, { forceLive: true, onStatus: value => status = value });
  assert.equal(articles.length, 1);
  assert.equal(status.source, 'saved');
  assert.equal(status.refreshFailed, true);
  assert.equal(status.updatedAt, timestamp);
  assert.equal(getLiveCache(topic).timestamp, timestamp);
  assert.equal(status.sources.length, 2);
  assert.ok(status.sources.every(source => source.status === 'saved' && source.error));
});

test('expired or corrupt source saves cannot be used to populate a partial refresh', async (t) => {
  const topic = sourcePair();
  store.set('openwire_source_cache_v1', JSON.stringify([null, {
    url: 'https://example.com/a.xml', updatedAt: Date.now() - 86400001,
    articles: [{ title: 'Expired polar expedition', originalUrl: 'https://a.example/old' }],
  }]));
  t.mock.method(globalThis, 'fetch', async (input) => decodeURIComponent(String(input)).includes('/b.xml')
    ? json({ status: 'ok', items: [story] }) : json({}, 503));
  let status;
  const articles = await fetchTopHeadlines(topic, { forceLive: true, onStatus: value => status = value });
  assert.deepEqual(articles.map(article => article.title), [story.title]);
  assert.equal(status.sources.find(source => source.name === 'Publisher A').status, 'unavailable');
});

test('published snapshots report individual source failures without using browser converters', async (t) => {
  store.clear();
  const sources = [{ name: 'Google News', status: 'published', count: 1, updatedAt: Date.now() },
    { name: 'BBC', status: 'unavailable', count: 0, error: 'Temporarily unavailable' }];
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    calls.push(String(input));
    return json([{ ...story, fetchedAt: new Date().toISOString(), feedStatus: { sources } }]);
  });
  let status;
  await fetchTopHeadlines('TOP', { onStatus: value => status = value });
  assert.deepEqual(calls, ['./news.json']);
  assert.deepEqual(status.sources, sources);
  assert.equal(status.failedFeeds[0].name, 'BBC');
});
