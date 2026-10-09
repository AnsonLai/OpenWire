import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { DEFAULT_TOPICS, DEFAULT_LOCAL_EDITION, getAllTopics, getVisibleTopics, getLocalEdition } from '../js/topicRegistry.js';
import { DEFAULT_FEEDS, getAllSources, getCustomFeeds, getFeedsForTopic } from '../js/feedRegistry.js';

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
};
beforeEach(() => store.clear());
const save = (key, value) => store.set(key, JSON.stringify(value));

test('wrong-shaped saved settings do not break default topics or publishers', () => {
  save('news_user_custom_topics', { obsolete: true });
  save('news_user_custom_feeds', { obsolete: true });
  save('news_user_hidden_topics', 'TOP');
  save('news_user_topic_order', { TOP: 1 });
  save('news_user_local_edition', { city: 123, region: ['BC'] });
  assert.equal(getAllTopics().length, DEFAULT_TOPICS.length);
  assert.equal(getVisibleTopics().length, DEFAULT_TOPICS.length);
  assert.deepEqual(getLocalEdition(), DEFAULT_LOCAL_EDITION);
  assert.equal(getAllSources().length, new Set(DEFAULT_FEEDS.map(feed => feed.url.toLowerCase())).size);
  assert.ok(getFeedsForTopic('TOP').length > 0);
});

test('a damaged topic list retains usable customization without duplicate built-in IDs', () => {
  save('news_user_custom_topics', [null, {}, { id: 'TOP', label: 'Duplicate default' },
    { id: 'CUSTOM_SPACE', label: 'Space', query: 'astronomy', sources: 42 },
    { id: 'CUSTOM_SPACE', label: 'Duplicate custom' }]);
  const topics = getAllTopics();
  assert.equal(topics.filter(topic => topic.id === 'TOP').length, 1);
  const custom = topics.filter(topic => topic.isCustom);
  assert.equal(custom.length, 1);
  assert.equal(custom[0].label, 'Space');
  assert.deepEqual(custom[0].sources, []);
  assert.deepEqual(custom[0].keywords, ['astronomy']);
});

test('a damaged source list keeps valid RSS subscriptions usable', () => {
  save('news_user_custom_feeds', [null, {},
    { id: 'bad', name: 'Broken feed', url: 'not-a-url' },
    { id: 'custom', name: 'My publication', url: 'https://example.com/rss', topics: ['TOP', null], maxArticles: 100 },
    { id: 'custom', name: 'Duplicate', url: 'https://example.com/duplicate' },
    { id: 'standalone', name: 'Standalone', url: 'https://example.com/atom', topics: 'TOP' }]);
  const custom = getCustomFeeds();
  assert.equal(custom.length, 2);
  assert.equal(getFeedsForTopic('TOP').filter(feed => feed.id === 'custom').length, 1);
  assert.equal(custom[0].maxArticles, 10);
  assert.deepEqual(custom[1].topics, []);
  assert.ok(getAllSources().some(feed => feed.id === 'standalone'));
});

test('an invalid all-hidden preference still leaves a navigable topic', () => {
  save('news_user_hidden_topics', DEFAULT_TOPICS.map(topic => topic.id));
  const visible = getVisibleTopics();
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'TOP');
});
