/**
 * tests/newsService.test.mjs
 * 
 * Unit tests for relative time formatting and logic in newsService.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatRelativeTime, TOPICS, applyStrategyToArticle, normalizeFeedItem, verifyFeed, sortArticlesByDate, buildStrategyUrl, extractSharedUrl, fetchTopHeadlines, saveLiveCache, getLiveCache } from '../js/newsService.js';
import { STRATEGIES } from '../js/domainRegistry.js';

test('unresolved Google wrappers never get wrapped in an archive or another reading tool', () => {
  const url = 'https://news.google.com/rss/articles/opaque-unresolved?hl=en-CA';
  for (const strategy of Object.values(STRATEGIES)) assert.equal(buildStrategyUrl(strategy, url), url);
  const article = applyStrategyToArticle({ originalUrl: url, domain: 'wsj.com', needsArchiveCheck: true }, { strategy: STRATEGIES.ARCHIVE_IS });
  assert.equal(article.targetUrl, url);
  assert.equal(article.badge, 'Open source');
  assert.equal(article.archiveUrl, '');
  assert.equal(article.needsArchiveCheck, false);
});

// Polyfill minimal localStorage for Node environment if not present
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(String(k)) || null,
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: (k) => store.delete(String(k)),
    clear: () => store.clear(),
  };
}

test('formatRelativeTime formats recent intervals correctly', () => {
  const now = new Date();
  
  // Just now (< 1 min)
  assert.equal(formatRelativeTime(new Date(now.getTime() - 20 * 1000)), 'Just now');

  // Minutes ago (5 mins)
  assert.equal(formatRelativeTime(new Date(now.getTime() - 5 * 60 * 1000)), '5m ago');

  // Hours ago (3 hours)
  assert.equal(formatRelativeTime(new Date(now.getTime() - 3 * 3600 * 1000)), '3h ago');

  // Yesterday
  assert.equal(formatRelativeTime(new Date(now.getTime() - 25 * 3600 * 1000)), 'Yesterday');

  // Days ago (3 days)
  assert.equal(formatRelativeTime(new Date(now.getTime() - 3 * 86400 * 1000)), '3d ago');

  // Invalid date fallback
  assert.equal(formatRelativeTime('invalid-date'), '');
  assert.equal(formatRelativeTime(null), '');
});

test('TOPICS registry contains Latest, Canada, AI, Vancouver, and BC with proper file paths and URLs', () => {
  assert.ok(TOPICS.LATEST, 'LATEST topic should be registered');
  assert.equal(TOPICS.LATEST.id, 'LATEST');
  assert.equal(TOPICS.LATEST.file, './data/news_latest.json');

  assert.ok(TOPICS.AI, 'AI topic should be registered');
  assert.equal(TOPICS.AI.id, 'AI');
  assert.equal(TOPICS.AI.file, './data/news_ai.json');
  assert.ok(TOPICS.AI.url.includes('Artificial+Intelligence'));

  assert.ok(TOPICS.CANADA, 'CANADA topic should be registered');
  assert.equal(TOPICS.CANADA.id, 'CANADA');
  assert.equal(TOPICS.CANADA.file, './data/news_canada.json');
  assert.ok(TOPICS.CANADA.url.includes('CA'));

  assert.ok(TOPICS.VANCOUVER, 'VANCOUVER topic should be registered');
  assert.equal(TOPICS.VANCOUVER.id, 'VANCOUVER');
  assert.equal(TOPICS.VANCOUVER.file, './data/news_vancouver.json');
  assert.ok(TOPICS.VANCOUVER.url.includes('Vancouver'));

  assert.ok(TOPICS.BC, 'BC topic should be registered');
  assert.equal(TOPICS.BC.id, 'BC');
  assert.equal(TOPICS.BC.file, './data/news_bc.json');
  assert.ok(TOPICS.BC.url.includes('British+Columbia'));
});

test('sortArticlesByDate correctly sorts newest-first and oldest-first', () => {
  const articles = [
    { id: '1', title: 'Earlier', pubDate: '2026-09-14T10:00:00Z' },
    { id: '2', title: 'Latest', pubDate: '2026-09-14T14:00:00Z' },
    { id: '3', title: 'Middle', pubDate: '2026-09-14T12:00:00Z' },
  ];

  const newestFirst = sortArticlesByDate(articles, 'newest');
  assert.equal(newestFirst[0].id, '2');
  assert.equal(newestFirst[1].id, '3');
  assert.equal(newestFirst[2].id, '1');

  const oldestFirst = sortArticlesByDate(articles, 'oldest');
  assert.equal(oldestFirst[0].id, '1');
  assert.equal(oldestFirst[1].id, '3');
  assert.equal(oldestFirst[2].id, '2');
});

test('applyStrategyToArticle recomputes targetUrl and status for domain strategies', () => {
  const sampleArticle = {
    title: 'Test Article',
    domain: 'washingtonpost.com',
    originalUrl: 'https://www.washingtonpost.com/politics/2026/09/13/test',
  };

  // 1. By default, Washington Post uses SMRY
  const smryArticle = applyStrategyToArticle(sampleArticle);
  assert.equal(smryArticle.status, 'bypassed');
  assert.equal(smryArticle.badge, 'SMRY');
  assert.ok(smryArticle.targetUrl.startsWith('https://smry.ai/'));

  // 2. Overriding with RemovePaywall
  const rpArticle = applyStrategyToArticle(sampleArticle, { strategy: STRATEGIES.REMOVEPAYWALL });
  assert.equal(rpArticle.status, 'bypassed');
  assert.equal(rpArticle.badge, 'RemovePaywall');
  assert.ok(rpArticle.targetUrl.includes('removepaywall.com/search?url='));

  // 3. Overriding with Archive.is
  const archiveArticle = applyStrategyToArticle(sampleArticle, { strategy: STRATEGIES.ARCHIVE_IS });
  assert.equal(archiveArticle.status, 'bypassed');
  assert.equal(archiveArticle.badge, 'Archive.is');
  assert.equal(archiveArticle.targetUrl, `https://archive.is/newest/${sampleArticle.originalUrl}`);
  assert.ok(archiveArticle.archiveUrl.includes('archive.is/newest/'));

  // 4. Overriding with UnWall
  const unwallArticle = applyStrategyToArticle(sampleArticle, { strategy: STRATEGIES.UNWALL });
  assert.equal(unwallArticle.status, 'bypassed');
  assert.equal(unwallArticle.badge, 'UnWall');
  assert.equal(unwallArticle.targetUrl, `https://unwall.app/${sampleArticle.originalUrl}`);

  // 5. Overriding with Freedium
  const freediumArticle = applyStrategyToArticle(sampleArticle, { strategy: STRATEGIES.FREEDIUM });
  assert.equal(freediumArticle.status, 'bypassed');
  assert.equal(freediumArticle.badge, 'Freedium');
  assert.equal(freediumArticle.targetUrl, `https://freedium-mirror.cfd/${sampleArticle.originalUrl}`);

  // 6. Overriding with Reader Mode (No-JS / Bot)
  const readerArticle = applyStrategyToArticle(sampleArticle, { strategy: STRATEGIES.READER });
  assert.equal(readerArticle.status, 'bypassed');
  assert.equal(readerArticle.badge, 'Reader');
  assert.equal(readerArticle.targetUrl, sampleArticle.originalUrl);

  // 7. Overriding with Direct
  const directArticle = applyStrategyToArticle(sampleArticle, { strategy: STRATEGIES.DIRECT });
  assert.equal(directArticle.status, 'free');
  assert.equal(directArticle.badge, 'Free');
  assert.equal(directArticle.targetUrl, sampleArticle.originalUrl);
});

test('normalizeFeedItem handles feed2json item format correctly', () => {
  const sampleFeed2JsonItem = {
    title: 'SpaceX Starship Completes Flight Test - TechCrunch',
    url: 'https://techcrunch.com/2026/09/14/spacex-starship-flight',
    date_published: '2026-09-14T12:00:00.000Z',
    author: { name: 'TechCrunch' },
  };

  const normalized = normalizeFeedItem(sampleFeed2JsonItem, 'SPACEX', 0);
  assert.equal(normalized.title, 'SpaceX Starship Completes Flight Test');
  assert.equal(normalized.source, 'TechCrunch');
  assert.equal(normalized.domain, 'techcrunch.com');
  assert.equal(normalized.originalUrl, 'https://techcrunch.com/2026/09/14/spacex-starship-flight');
  assert.ok(normalized.id.startsWith('art-SPACEX-0'));
});

test('normalizeFeedItem resolves publisher names from Google News RSS to valid domains', () => {
  const googleNewsItem = {
    title: 'Breaking Tech Development - The Guardian',
    link: 'https://news.google.com/rss/articles/CBMiXYZ',
    pubDate: '2026-09-16 02:00:00',
  };

  const normalized = normalizeFeedItem(googleNewsItem, 'TECH', 0);
  assert.equal(normalized.title, 'Breaking Tech Development');
  assert.equal(normalized.source, 'The Guardian');
  assert.equal(normalized.domain, 'theguardian.com');

  // Unknown publisher without a dot must not generate an invalid domain (avoids 404 favicons)
  const unknownSourceItem = {
    title: 'Random Story - Unknown Channel Without Dot',
    link: 'https://news.google.com/rss/articles/CBMiABC',
    pubDate: '2026-09-16 02:00:00',
  };

  const normalizedUnknown = normalizeFeedItem(unknownSourceItem, 'GENERAL', 1);
  assert.equal(normalizedUnknown.source, 'Unknown Channel Without Dot');
  assert.equal(normalizedUnknown.domain, '');
});

test('feed image extraction tries usable alternatives and embedded photos instead of accepting a logo', () => {
  const item = { title: 'Publisher headline', link: 'https://example.com/story', image: 'https://example.com/site-logo.png',
    thumbnail: { url: 'https://example.com/lead-photo.jpg' } };
  assert.equal(normalizeFeedItem(item, 'TOP', 0).imageUrl, 'https://example.com/lead-photo.jpg');
  delete item.thumbnail;
  item.description = '<img src="/site-logo.png"><img srcset="/small.jpg 300w, /large.jpg 1200w">';
  assert.equal(normalizeFeedItem(item, 'TOP', 1).imageUrl, 'https://example.com/large.jpg');
});

test('verifyFeed returns false for empty or non-existent URLs', async () => {
  const emptyRes = await verifyFeed('');
  assert.equal(emptyRes.ok, false);
});

test('buildStrategyUrl resolves correct URLs for all bypass tools', () => {
  const url = 'https://www.wsj.com/articles/sample-article';

  assert.equal(buildStrategyUrl(STRATEGIES.DIRECT, url), url);
  assert.equal(buildStrategyUrl(STRATEGIES.READER, url), url);
  assert.equal(buildStrategyUrl(STRATEGIES.SMRY, url), `https://smry.ai/${url}`);
  assert.equal(buildStrategyUrl(STRATEGIES.REMOVEPAYWALL, url), `https://www.removepaywall.com/search?url=${encodeURIComponent(url)}`);
  assert.equal(buildStrategyUrl(STRATEGIES.UNWALL, url), `https://unwall.app/${url}`);
  assert.equal(buildStrategyUrl(STRATEGIES.FREEDIUM, url), `https://freedium-mirror.cfd/${url}`);
  assert.equal(buildStrategyUrl(STRATEGIES.ARCHIVE_IS, url), `https://archive.is/newest/${url}`);
  assert.equal(buildStrategyUrl(STRATEGIES.WAYBACK, url), `https://web.archive.org/web/*/${url}`);
  assert.equal(buildStrategyUrl(null, ''), '');
});

test('extractSharedUrl parses explicit URLs, embedded text URLs, and raw domains', () => {
  // Explicit url param
  assert.equal(extractSharedUrl(new URLSearchParams('url=https%3A%2F%2Fwww.nytimes.com%2Farticle')), 'https://www.nytimes.com/article');

  // Alternative link and share_url keys
  assert.equal(extractSharedUrl(new URLSearchParams('link=https%3A%2F%2Fwsj.com%2Fstory')), 'https://wsj.com/story');
  assert.equal(extractSharedUrl(new URLSearchParams('share_url=https%3A%2F%2Fbloomberg.com%2Fnews')), 'https://bloomberg.com/news');

  // Embedded URL inside text (e.g. from Twitter, Reddit, or YouTube share)
  assert.equal(extractSharedUrl(new URLSearchParams('text=Check+this+out%3A+https%3A%2F%2Feconomist.com%2Farticle')), 'https://economist.com/article');

  // URL with trailing punctuation from sharing apps (e.g. parentheses or trailing period)
  assert.equal(extractSharedUrl(new URLSearchParams('text=Read+here+(https%3A%2F%2Fft.com%2Fstory).')), 'https://ft.com/story');

  // Raw domain without protocol
  assert.equal(extractSharedUrl(new URLSearchParams('url=reuters.com%2Fworld')), 'https://reuters.com/world');

  // Plain object input
  assert.equal(extractSharedUrl({ url: 'https://theverge.com/tech' }), 'https://theverge.com/tech');

  // Full URL string input (e.g. from launchQueue targetURL or window.location.href)
  assert.equal(extractSharedUrl('https://openwire.app/?url=https%3A%2F%2Fwww.nytimes.com%2Farticle'), 'https://www.nytimes.com/article');
  assert.equal(extractSharedUrl('https://openwire.app/?text=Read+this+https%3A%2F%2Fwsj.com%2Fnews'), 'https://wsj.com/news');

  // Hash query input (e.g. /#top?url=...)
  assert.equal(extractSharedUrl('https://openwire.app/#top?url=https%3A%2F%2Fbloomberg.com%2Fstory'), 'https://bloomberg.com/story');

  // Direct article URL string
  assert.equal(extractSharedUrl('https://theverge.com/tech/2026/gadgets'), 'https://theverge.com/tech/2026/gadgets');

  // Enclosed in quotes or angle brackets
  assert.equal(extractSharedUrl('<https://theverge.com/tech>'), 'https://theverge.com/tech');
  assert.equal(extractSharedUrl('"https://theverge.com/tech"'), 'https://theverge.com/tech');

  // Bare domain in text with path
  assert.equal(extractSharedUrl(new URLSearchParams('text=Interesting+wsj.com%2Farticles%2F123+check+it')), 'https://wsj.com/articles/123');

  // URL instance input
  assert.equal(extractSharedUrl(new URL('https://openwire.app/?url=https%3A%2F%2Fft.com%2Fcontent')), 'https://ft.com/content');

  // Empty / null inputs
  assert.equal(extractSharedUrl(null), '');
  assert.equal(extractSharedUrl(''), '');
  assert.equal(extractSharedUrl(new URLSearchParams('')), '');
  assert.equal(extractSharedUrl(new URLSearchParams('text=no+url+here')), '');
});

test('fetchTopHeadlines respects forceLive: true by bypassing candidate static files', async () => {
  const originalFetch = globalThis.fetch;
  const fetchedUrls = [];
  globalThis.fetch = async (url) => {
    fetchedUrls.push(String(url));
    if (String(url).includes('rss2json.com') || String(url).includes('feed2json.org')) {
      return {
        ok: true,
        json: async () => ({
          status: 'ok',
          title: 'Live News',
          items: [
            {
              title: 'Breaking Live Story - Test Source',
              url: 'https://test.com/live-story',
              date_published: new Date().toISOString(),
            },
          ],
        }),
      };
    }
    return { ok: false, status: 404 };
  };

  try {
    const articles = await fetchTopHeadlines('TOP', { forceLive: true });
    assert.ok(Array.isArray(articles));
    assert.equal(articles.length, 1);
    assert.equal(articles[0].title, 'Breaking Live Story');
    assert.ok(!fetchedUrls.some((u) => u.includes('news.json')), 'forceLive must not fetch static news.json');
    assert.ok(fetchedUrls.some((u) => u.includes('rss2json.com') || u.includes('feed2json.org')), 'forceLive must fetch live stream');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchTopHeadlines automatically detects stale static cache and fetches live RSS', async () => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
  const originalFetch = globalThis.fetch;
  const fetchedUrls = [];
  globalThis.fetch = async (url) => {
    fetchedUrls.push(String(url));
    if (String(url).includes('news.json')) {
      return {
        ok: true,
        json: async () => [
          {
            title: 'Stale Story - Test Source',
            pubDate: new Date(Date.now() - 17 * 3600 * 1000).toISOString(), // 17 hours ago
            originalUrl: 'https://test.com/stale',
          },
        ],
      };
    }
    if (String(url).includes('rss2json.com') || String(url).includes('feed2json.org')) {
      return {
        ok: true,
        json: async () => ({
          status: 'ok',
          title: 'Live Fresh News',
          items: [
            {
              title: 'Fresh Live Story - Test Source',
              url: 'https://test.com/fresh-story',
              date_published: new Date().toISOString(),
            },
          ],
        }),
      };
    }
    return { ok: false, status: 404 };
  };

  try {
    const articles = await fetchTopHeadlines('TOP', { maxStaleMinutes: 60 });
    assert.ok(Array.isArray(articles));
    assert.equal(articles.length, 1);
    assert.equal(articles[0].title, 'Fresh Live Story', 'Should return live story because cache was 17h old');
    assert.ok(fetchedUrls.some((u) => u.includes('rss2json.com') || u.includes('feed2json.org')), 'Must trigger live fetch when cache is stale');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('saveLiveCache and getLiveCache persist and retrieve articles with timestamps', () => {
  const sampleArticles = [
    { title: 'Article A', url: 'https://example.com/a', pubDate: new Date().toISOString() },
  ];
  saveLiveCache('TEST_CACHE', sampleArticles);

  const cached = getLiveCache('TEST_CACHE');
  assert.ok(cached, 'Cache should exist');
  assert.ok(cached.timestamp > 0, 'Timestamp should be recorded');
  assert.equal(cached.articles.length, 1);
  assert.equal(cached.articles[0].title, 'Article A');
});

test('fetchTopHeadlines uses fresh client live cache instead of reading older static files', async () => {
  const originalFetch = globalThis.fetch;
  let staticFileFetched = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes('news.json')) {
      staticFileFetched = true;
      return {
        ok: true,
        json: async () => [
          { title: 'Old 8-Hour Article', pubDate: new Date(Date.now() - 8 * 3600 * 1000).toISOString() },
        ],
      };
    }
    return { ok: false, status: 404 };
  };

  try {
    // Save fresh live articles in client cache (1 minute ago)
    saveLiveCache('TOP', [
      { id: 'live-1', title: 'Fresh 1-Minute Live News', originalUrl: 'https://example.com/fresh', pubDate: new Date().toISOString() },
    ]);

    // When loading without forceLive, it should serve the fresh client live cache
    const articles = await fetchTopHeadlines('TOP', { forceLive: false, maxStaleMinutes: 30 });
    assert.ok(Array.isArray(articles));
    assert.equal(articles.length, 1);
    assert.equal(articles[0].title, 'Fresh 1-Minute Live News');
    assert.equal(staticFileFetched, false, 'Should not fetch static news.json when fresh client live cache exists');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

