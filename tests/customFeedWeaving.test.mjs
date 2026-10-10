/**
 * tests/customFeedWeaving.test.mjs
 * 
 * Unit tests for assigning multiple custom RSS feeds to topics,
 * enforcing fair-share quotas (7-10), and multi-feed topic weaving.
 */

import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import {
  DEFAULT_FEEDS,
  addCustomFeed,
  deleteCustomFeed,
  deleteCustomFeedFromTopic,
  getCustomFeeds,
  getCustomFeedsForTopic,
  getFeedsForTopic,
  resetFeedsToDefault,
  getAllSources,
  addCustomSource,
  deleteCustomSource,
  getSourceById,
  getFeedsByIds,
} from '../js/feedRegistry.js';
import { weaveFeeds } from '../js/feedWeaver.js';

// Polyfill minimal localStorage for Node environment
const storageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

globalThis.localStorage = storageMock;

beforeEach(() => {
  storageMock.clear();
});

test('DEFAULT_FEEDS enforces fair-share quotas between 7 and 10 articles', () => {
  assert.ok(DEFAULT_FEEDS.length > 0, 'Must have default feeds configured');
  for (const feed of DEFAULT_FEEDS) {
    assert.ok(
      feed.maxArticles >= 7 && feed.maxArticles <= 10,
      `Feed ${feed.name} quota ${feed.maxArticles} must be between 7 and 10`
    );
  }
});

test('adding RSS sources reports failed storage instead of falsely claiming they were saved', (t) => {
  t.mock.method(storageMock, 'setItem', () => { throw new Error('Storage quota exceeded'); });
  assert.throws(() => addCustomSource({ name: 'RSS source', url: 'https://example.com/rss' }), /could not save your RSS source/);
  assert.throws(() => addCustomFeed({ name: 'RSS source', url: 'https://example.com/rss', topics: ['TOP'] }), /could not save your RSS source/);
  assert.deepEqual(getCustomFeeds(), []);
});

test('RSS URL validation rejects unsupported URLs and distinct case-sensitive paths remain separate', () => {
  assert.throws(() => addCustomSource({ name: 'Invalid feed', url: 'file:///rss.xml' }), /starting with http/);
  assert.throws(() => addCustomFeed({ name: 'Invalid feed', url: 'not a URL', topics: ['TOP'] }), /starting with http/);
  addCustomSource({ name: 'Upper feed', url: 'https://example.com/News.xml' });
  addCustomSource({ name: 'Lower feed', url: 'https://example.com/news.xml' });
  assert.equal(getCustomFeeds().length, 2);
  assert.equal(getAllSources().filter(source => source.url.startsWith('https://example.com/')).length, 2);
});

test('addCustomFeed creates and persists a feed assigned to a topic', () => {
  const feed = addCustomFeed({
    name: 'Polygon',
    url: 'https://www.polygon.com/rss/index.xml',
    topics: ['TECHNOLOGY'],
    maxArticles: 8,
  });

  assert.equal(feed.name, 'Polygon');
  assert.equal(feed.domain, 'polygon.com');
  assert.deepEqual(feed.topics, ['TECHNOLOGY']);
  assert.equal(feed.maxArticles, 8);
  assert.equal(feed.isCustom, true);

  const customList = getCustomFeeds();
  assert.equal(customList.length, 1);
  assert.equal(customList[0].name, 'Polygon');
});

test('addCustomFeed clamps quota to 7-10 range', () => {
  const lowFeed = addCustomFeed({
    name: 'Low Quota Feed',
    url: 'https://low.example.com/rss',
    topics: ['TOP'],
    maxArticles: 2, // below min
  });
  assert.equal(lowFeed.maxArticles, 7, 'Should clamp minimum to 7');

  const highFeed = addCustomFeed({
    name: 'High Quota Feed',
    url: 'https://high.example.com/rss',
    topics: ['TOP'],
    maxArticles: 25, // above max
  });
  assert.equal(highFeed.maxArticles, 10, 'Should clamp maximum to 10');
});

test('addCustomFeed allows assigning one feed to multiple topics', () => {
  const feed = addCustomFeed({
    name: 'Eurogamer',
    url: 'https://www.eurogamer.net/feed',
    topics: ['TECHNOLOGY', 'ENTERTAINMENT', 'CUSTOM_GAMING'],
    maxArticles: 9,
  });

  assert.equal(feed.topics.length, 3);
  assert.ok(feed.topics.includes('TECHNOLOGY'));
  assert.ok(feed.topics.includes('ENTERTAINMENT'));
  assert.ok(feed.topics.includes('CUSTOM_GAMING'));

  const techCustom = getCustomFeedsForTopic('TECHNOLOGY');
  assert.equal(techCustom.length, 1);
  assert.equal(techCustom[0].name, 'Eurogamer');

  const gamingCustom = getCustomFeedsForTopic('CUSTOM_GAMING');
  assert.equal(gamingCustom.length, 1);
  assert.equal(gamingCustom[0].name, 'Eurogamer');
});

test('getFeedsForTopic returns both default and custom feeds for that topic', () => {
  const initialTechFeeds = getFeedsForTopic('TECHNOLOGY');
  const initialCount = initialTechFeeds.length;

  addCustomFeed({
    name: 'Polygon',
    url: 'https://www.polygon.com/rss/index.xml',
    topics: ['TECHNOLOGY'],
    maxArticles: 8,
  });

  addCustomFeed({
    name: 'Kotaku',
    url: 'https://kotaku.com/rss',
    topics: ['TECHNOLOGY'],
    maxArticles: 8,
  });

  const combinedTechFeeds = getFeedsForTopic('TECHNOLOGY');
  assert.equal(combinedTechFeeds.length, initialCount + 2);
  assert.ok(combinedTechFeeds.some((f) => f.name === 'Polygon'));
  assert.ok(combinedTechFeeds.some((f) => f.name === 'Kotaku'));
});

test('deleteCustomFeedFromTopic removes assignment from topic or deletes feed if empty', () => {
  const feed = addCustomFeed({
    name: 'Rock Paper Shotgun',
    url: 'https://www.rockpapershotgun.com/feed',
    topics: ['TECHNOLOGY', 'TOP'],
    maxArticles: 8,
  });

  // Remove from TECHNOLOGY only
  deleteCustomFeedFromTopic(feed.id, 'TECHNOLOGY');

  const techFeeds = getCustomFeedsForTopic('TECHNOLOGY');
  assert.equal(techFeeds.length, 0, 'Should no longer be assigned to TECHNOLOGY');

  const topFeeds = getCustomFeedsForTopic('TOP');
  assert.equal(topFeeds.length, 1, 'Should still be assigned to TOP');

  // Remove from TOP (last topic)
  deleteCustomFeedFromTopic(feed.id, 'TOP');
  const allCustom = getCustomFeeds();
  assert.equal(allCustom.length, 0, 'Should be completely deleted when no topics remain');
});

test('resetFeedsToDefault removes all custom feeds', () => {
  addCustomFeed({
    name: 'Feed 1',
    url: 'https://f1.example.com/rss',
    topics: ['TOP'],
  });
  addCustomFeed({
    name: 'Feed 2',
    url: 'https://f2.example.com/rss',
    topics: ['WORLD'],
  });

  assert.equal(getCustomFeeds().length, 2);
  resetFeedsToDefault();
  assert.equal(getCustomFeeds().length, 0);
});

test('weaves multiple custom secondary feeds into a topic stream', () => {
  const primary = [
    { id: 'p1', title: 'Tech Lead 1', domain: 'google.com' },
    { id: 'p2', title: 'Tech Lead 2', domain: 'google.com' },
    { id: 'p3', title: 'Tech Story 3', domain: 'theverge.com' },
    { id: 'p4', title: 'Tech Story 4', domain: 'engadget.com' },
    { id: 'p5', title: 'Tech Story 5', domain: 'cnet.com' },
    { id: 'p6', title: 'Tech Story 6', domain: 'wired.com' },
  ];

  const secondaryGroups = [
    {
      feedConfig: { name: 'Polygon', domain: 'polygon.com', maxArticles: 8 },
      articles: [
        { id: 'poly1', title: 'Polygon Review 1', domain: 'polygon.com' },
        { id: 'poly2', title: 'Polygon Review 2', domain: 'polygon.com' },
        { id: 'poly3', title: 'Polygon Feature 3', domain: 'polygon.com' },
      ],
    },
    {
      feedConfig: { name: 'Eurogamer', domain: 'eurogamer.net', maxArticles: 8 },
      articles: [
        { id: 'euro1', title: 'Eurogamer Headline 1', domain: 'eurogamer.net' },
        { id: 'euro2', title: 'Eurogamer Headline 2', domain: 'eurogamer.net' },
      ],
    },
  ];

  const woven = weaveFeeds(primary, secondaryGroups, {
    leadAnchorCount: 2,
    maxConsecutivePerDomain: 2,
    cadenceInterval: 2,
    maxTotalArticles: 60,
  });

  // Positions 0 and 1 are primary anchors
  assert.equal(woven[0].id, 'p1');
  assert.equal(woven[1].id, 'p2');

  // Both secondary feeds are present in the final woven stream
  assert.ok(woven.some((a) => a.id === 'poly1'), 'Must include Polygon story');
  assert.ok(woven.some((a) => a.id === 'euro1'), 'Must include Eurogamer story');

  // Quota respected
  const polyCount = woven.filter((a) => a.domain === 'polygon.com').length;
  assert.equal(polyCount, 3, 'All 3 polygon stories fit within 8 quota');
});

test('getAllSources returns default sources catalog', () => {
  const sources = getAllSources();
  assert.ok(sources.length >= 5, 'Must contain default source catalog');
  assert.ok(sources.some((s) => s.id === 'the_verge'));
  assert.ok(sources.some((s) => s.id === 'ars_technica'));
  assert.ok(sources.some((s) => s.id === 'cbc_top'));
});

test('addCustomSource persists custom source and updates catalog', () => {
  const added = addCustomSource({
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    maxArticles: 8,
  });

  assert.ok(added.id.startsWith('src_custom_'));
  assert.equal(added.name, 'TechCrunch');
  assert.equal(added.isCustom, true);

  const found = getSourceById(added.id);
  assert.ok(found);
  assert.equal(found.name, 'TechCrunch');

  const all = getAllSources();
  assert.ok(all.some((s) => s.id === added.id));

  // Delete custom source
  deleteCustomSource(added.id);
  assert.equal(getSourceById(added.id), null);
});

test('getFeedsByIds resolves sources to executable feeds with fair-share quotas', () => {
  const custom = addCustomSource({
    name: 'Wired',
    url: 'https://www.wired.com/feed/rss',
    maxArticles: 9,
  });

  const feeds = getFeedsByIds(['the_verge', custom.id]);
  assert.equal(feeds.length, 2);
  assert.equal(feeds[0].name, 'The Verge');
  assert.equal(feeds[1].name, 'Wired');
  assert.equal(feeds[1].domain, 'wired.com');
  assert.equal(feeds[1].maxArticles, 9);
});
