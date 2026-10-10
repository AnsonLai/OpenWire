import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  getDisabledSourceKeys,
  getFeedsByIds,
  getFeedsForTopic,
  getSourceLibrary,
  isSourceEnabled,
  resetFeedsToDefault,
  setSourcesEnabled,
  addCustomFeed,
} from '../js/feedRegistry.js';
import { fetchTopHeadlines } from '../js/newsService.js';
import { groupSources } from '../js/sourceGroups.js';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.has(String(key)) ? storage.get(String(key)) : null,
  setItem: (key, value) => storage.set(String(key), String(value)),
  removeItem: key => storage.delete(String(key)),
  clear: () => storage.clear(),
};

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

beforeEach(() => {
  storage.clear();
  resetFeedsToDefault();
});

test('source disable preferences persist and apply to a feed shared across topics', () => {
  const feed = addCustomFeed({
    name: 'Shared science publisher',
    url: 'https://feeds.example.org/shared.xml',
    topics: ['TOP', 'SCIENCE'],
  });

  assert.ok(getFeedsForTopic('TOP').some(source => source.id === feed.id));
  assert.ok(getFeedsForTopic('SCIENCE').some(source => source.id === feed.id));
  assert.equal(setSourcesEnabled([{ url: feed.url }, feed.url], false), true);

  assert.equal(isSourceEnabled(feed), false);
  assert.ok(getDisabledSourceKeys().includes(new URL(feed.url).href));
  assert.equal(getSourceLibrary().find(source => source.url === feed.url).enabled, false);
  assert.equal(getFeedsForTopic('TOP').some(source => source.id === feed.id), false);
  assert.equal(getFeedsForTopic('SCIENCE').some(source => source.id === feed.id), false);
  assert.deepEqual(getFeedsByIds([feed.id]), []);

  setSourcesEnabled([feed.url], true);
  assert.equal(isSourceEnabled(feed), true);
  assert.ok(getFeedsByIds([feed.id]).some(source => source.id === feed.id));
});

test('Google News can be disabled while direct publisher feeds still load', async t => {
  setSourcesEnabled(['google_news'], false);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const url = String(input);
    calls.push(url);
    if (url.includes('rss2json.com')) {
      const feedUrl = new URL(url).searchParams.get('rss_url');
      if (feedUrl === 'https://news.google.com/rss') return json({ status: 'ok', items: [] });
      return json({ status: 'ok', feed: { title: 'Direct Publisher' }, items: [{
        title: 'A direct publisher headline', link: 'https://publisher.example/story',
        pubDate: new Date().toISOString(),
      }] });
    }
    return json({}, 404);
  });

  const articles = await fetchTopHeadlines('TOP', { forceLive: true });
  assert.ok(articles.length > 0);
  assert.ok(articles.every(article => article.feedUrl && article.feedUrl !== 'https://news.google.com/rss'));
  assert.ok(calls.some(url => url.includes('rss2json.com') && !decodeURIComponent(url).includes('news.google.com')));
  assert.ok(!calls.some(url => decodeURIComponent(url).includes('rss_url=https://news.google.com/rss')));
});

test('all disabled sources return an empty disabled result without making requests', async t => {
  setSourcesEnabled(getSourceLibrary(), false);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async input => {
    calls.push(String(input));
    return json({}, 404);
  });
  let status;

  const articles = await fetchTopHeadlines('TOP', { forceLive: true, onStatus: value => status = value });
  assert.deepEqual(articles, []);
  assert.equal(status.source, 'disabled');
  assert.deepEqual(calls, []);
});

test('published snapshots exclude disabled feed origins even when publisher domains match', async t => {
  const disabledUrl = 'https://feeds.example.org/disabled.xml';
  const enabledUrl = 'https://feeds.example.org/enabled.xml';
  setSourcesEnabled([disabledUrl], false);
  const now = new Date().toISOString();
  t.mock.method(globalThis, 'fetch', async input => {
    assert.equal(String(input), './news.json');
    return json([
      { title: 'Disabled-origin story', originalUrl: 'https://same-publisher.example/disabled',
        domain: 'same-publisher.example', feedUrl: disabledUrl, fetchedAt: now },
      { title: 'Enabled-origin story', originalUrl: 'https://same-publisher.example/enabled',
        domain: 'same-publisher.example', feedUrl: enabledUrl, fetchedAt: now },
    ]);
  });

  const articles = await fetchTopHeadlines('TOP');
  assert.deepEqual(articles.map(article => article.title), ['Enabled-origin story']);
  assert.equal(articles[0].feedUrl, enabledUrl);
});

test('unlabelled legacy snapshots cannot restore headlines after a source is disabled', async t => {
  setSourcesEnabled(['google_news'], false);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith('./')) return json([{
      title: 'Legacy unlabelled headline', originalUrl: 'https://publisher.example/legacy',
      fetchedAt: new Date().toISOString(),
    }]);
    return json({ message: 'No live sources available' }, 503);
  });

  await assert.rejects(fetchTopHeadlines('TOP'), /RSS sources are unavailable|No headlines are available/);
  assert.ok(calls.some(url => url === './news.json'));
  assert.ok(calls.every(url => !decodeURIComponent(url).includes('rss_url=https://news.google.com/rss')));
});

test('corrupted disabled-source storage falls back to an empty preference list', () => {
  storage.set('openwire_disabled_sources_v1', '{not valid json');
  assert.deepEqual(getDisabledSourceKeys(), []);
  assert.equal(isSourceEnabled('https://feeds.example.org/corruption-check.xml'), true);

  setSourcesEnabled(['https://feeds.example.org/corruption-check.xml'], false);
  assert.equal(isSourceEnabled('https://feeds.example.org/corruption-check.xml'), false);
});

test('source groups sort by category, separate aggregators from publishers, and search visible metadata', () => {
  const sources = [
    { id: 'pub-tech', name: 'The Verge', domain: 'theverge.com', url: 'https://theverge.com/feed', category: 'Technology', kind: 'publisher' },
    { id: 'agg-tech', name: 'Google News', domain: 'news.google.com', url: 'https://news.google.com/rss', category: 'Technology', kind: 'aggregator' },
    { id: 'science', name: 'Nature', domain: 'nature.com', url: 'https://nature.com/feed', category: 'Science', kind: 'publisher' },
  ];

  const groups = groupSources(sources);
  assert.deepEqual(groups.map(group => group.category), ['Science', 'Technology']);
  assert.deepEqual(groups[1].aggregator.map(source => source.id), ['agg-tech']);
  assert.deepEqual(groups[1].publisher.map(source => source.id), ['pub-tech']);
  assert.deepEqual(groupSources(sources, 'news aggregators').flatMap(group => group.aggregator.map(source => source.id)), ['agg-tech']);
  assert.deepEqual(groupSources(sources, 'nature.com').flatMap(group => group.publisher.map(source => source.id)), ['science']);
  assert.deepEqual(groupSources(sources, 'no match'), []);
});

test('source library can reenable a custom feed saved by an older version as disabled', () => {
  storage.set('news_user_custom_feeds', JSON.stringify([{ id: 'legacy_disabled', name: 'Legacy source', url: 'https://example.com/legacy.xml', topics: ['SCIENCE'], enabled: false }]));
  const source = getSourceLibrary().find(feed => feed.id === 'legacy_disabled');
  assert.equal(source.enabled, false);
  assert.equal(setSourcesEnabled([source], true), true);
  assert.equal(getSourceLibrary().find(feed => feed.id === source.id).enabled, true);
  assert.ok(getFeedsForTopic('SCIENCE').some(feed => feed.id === source.id));
  assert.equal(JSON.parse(storage.get('news_user_custom_feeds'))[0].enabled, true);
});
