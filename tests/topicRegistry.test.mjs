/**
 * tests/topicRegistry.test.mjs
 * 
 * Unit tests for topicRegistry module.
 */

import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';

// Mock localStorage for Node environment
const storageMock = new Map();
global.localStorage = {
  getItem: (key) => storageMock.get(key) || null,
  setItem: (key, val) => storageMock.set(key, String(val)),
  removeItem: (key) => storageMock.delete(key),
  clear: () => storageMock.clear(),
};

import {
  DEFAULT_TOPICS,
  DEFAULT_LOCAL_EDITION,
  getAllTopics,
  getVisibleTopics,
  getTopicById,
  addCustomTopic,
  deleteCustomTopic,
  toggleTopicVisibility,
  resetTopicsToDefault,
  buildGoogleNewsSearchUrl,
  PRESET_TOPIC_SUGGESTIONS,
  getLocalEdition,
  setLocalEdition,
  moveTopic,
  loadTopicOrder,
  saveTopicOrder,
  parseCommaKeywords,
  formatKeywordsQuery,
} from '../js/topicRegistry.js';

beforeEach(() => {
  storageMock.clear();
});

test('getAllTopics returns all default topics when storage is empty', () => {
  const all = getAllTopics();
  assert.equal(all.length, DEFAULT_TOPICS.length);
  assert.equal(all[0].id, 'TOP');
  assert.deepEqual(all.slice(3, 6).map((t) => t.id), ['CANADA', 'BC', 'VANCOUVER']);
  assert.ok(all.every((t) => t.isVisible === true));
});

test('addCustomTopic creates and persists a new topic', () => {
  const added = addCustomTopic('SpaceX', 'SpaceX OR Starship');
  assert.ok(added.id.startsWith('CUSTOM_SPACEX'));
  assert.equal(added.label, 'SpaceX');
  assert.ok(added.url.includes('SpaceX') && added.url.includes('Starship'));
  assert.equal(added.isCustom, true);
  assert.equal(added.isVisible, true);

  const all = getAllTopics();
  assert.equal(all.length, DEFAULT_TOPICS.length + 1);
  const found = getTopicById(added.id);
  assert.equal(found.label, 'SpaceX');
});

test('addCustomTopic accepts direct RSS URL', () => {
  const added = addCustomTopic('Custom Feed', 'https://example.com/rss.xml');
  assert.equal(added.url, 'https://example.com/rss.xml');
});

test('toggleTopicVisibility hides and shows topics in getVisibleTopics', () => {
  // Hide Sports
  toggleTopicVisibility('SPORTS', false);
  let visible = getVisibleTopics();
  assert.equal(visible.find((t) => t.id === 'SPORTS'), undefined);

  // Show Sports back
  toggleTopicVisibility('SPORTS', true);
  visible = getVisibleTopics();
  assert.ok(visible.find((t) => t.id === 'SPORTS'));
});

test('deleteCustomTopic removes custom topic', () => {
  const added = addCustomTopic('Gaming', 'video games');
  assert.ok(getTopicById(added.id));

  deleteCustomTopic(added.id);
  const all = getAllTopics();
  assert.equal(all.find((t) => t.id === added.id), undefined);
});

test('resetTopicsToDefault clears customizations', () => {
  addCustomTopic('Crypto', 'bitcoin');
  toggleTopicVisibility('WORLD', false);

  resetTopicsToDefault();
  const all = getAllTopics();
  assert.equal(all.length, DEFAULT_TOPICS.length);
  assert.ok(all.find((t) => t.id === 'WORLD').isVisible);
});

test('buildGoogleNewsSearchUrl constructs robust URL with locale parameters', () => {
  const url = buildGoogleNewsSearchUrl('Tesla Motors');
  assert.ok(url.includes('q=Tesla%20Motors'));
  assert.ok(url.includes('hl=en-US'));
  assert.ok(url.includes('gl=US'));
  assert.ok(url.includes('ceid=US%3Aen') || url.includes('ceid=US:en'));

  // Preserves direct URLs
  const direct = buildGoogleNewsSearchUrl('https://example.com/custom.xml');
  assert.equal(direct, 'https://example.com/custom.xml');
});

test('PRESET_TOPIC_SUGGESTIONS contains curated working categories and gaming feeds', () => {
  assert.ok(Array.isArray(PRESET_TOPIC_SUGGESTIONS));
  assert.ok(PRESET_TOPIC_SUGGESTIONS.length >= 5);
  assert.ok(PRESET_TOPIC_SUGGESTIONS.some((p) => p.label.includes('Health')));
  assert.ok(PRESET_TOPIC_SUGGESTIONS.some((p) => p.label.includes('Crypto')));
  assert.ok(PRESET_TOPIC_SUGGESTIONS.some((p) => p.label.includes('Polygon')));
  assert.ok(PRESET_TOPIC_SUGGESTIONS.some((p) => p.label.includes('Kotaku')));
  assert.ok(PRESET_TOPIC_SUGGESTIONS.some((p) => p.label.includes('Eurogamer')));
});

test('getAllTopics normalizes both isVisible and visible flags', () => {
  const all = getAllTopics();
  assert.ok(all.every((t) => t.isVisible === t.visible));
});

test('getLocalEdition defaults to Vancouver and British Columbia', () => {
  const edition = getLocalEdition();
  assert.equal(edition.city, DEFAULT_LOCAL_EDITION.city);
  assert.equal(edition.region, DEFAULT_LOCAL_EDITION.region);

  const all = getAllTopics();
  const vancouverTopic = all.find((t) => t.id === 'VANCOUVER');
  const bcTopic = all.find((t) => t.id === 'BC');
  assert.equal(vancouverTopic.label, 'Vancouver (Local)');
  assert.equal(bcTopic.label, 'British Columbia (Local)');
  assert.equal(vancouverTopic.file, './data/news_vancouver.json');
  assert.equal(bcTopic.file, './data/news_bc.json');
});

test('setLocalEdition updates city and region and adapts topic labels/urls', () => {
  setLocalEdition('Toronto', 'Ontario');
  const edition = getLocalEdition();
  assert.equal(edition.city, 'Toronto');
  assert.equal(edition.region, 'Ontario');

  const all = getAllTopics();
  const localCityTopic = all.find((t) => t.id === 'VANCOUVER');
  const localRegionTopic = all.find((t) => t.id === 'BC');

  assert.equal(localCityTopic.label, 'Toronto (Local)');
  assert.equal(localRegionTopic.label, 'Ontario (Local)');
  assert.equal(localCityTopic.file, null); // uses live RSS instead of static vancouver json
  assert.ok(localCityTopic.url.includes('q=Toronto'));
  assert.ok(localRegionTopic.url.includes('q=%22Ontario%22'));
});

test('a region containing the default province name still uses its own local query', () => {
  setLocalEdition('Prince George', 'Northern British Columbia');
  const region = getTopicById('BC');
  assert.equal(region.file, null);
  assert.equal(new URL(region.url).searchParams.get('q'), '"Northern British Columbia"');
});

test('default city names keep their published feed when capitalization changes', () => {
  setLocalEdition('vancouver', 'British Columbia');
  assert.equal(getTopicById('VANCOUVER').url, DEFAULT_TOPICS.find(topic => topic.id === 'VANCOUVER').url);
});

test('moveTopic reorders topics correctly and boundary checks work', () => {
  const initial = getAllTopics();
  const firstId = initial[0].id; // 'TOP'
  const secondId = initial[1].id; // 'LATEST'

  // Moving first topic up should be a no-op
  moveTopic(firstId, 'up');
  let current = getAllTopics();
  assert.equal(current[0].id, firstId);

  // Moving second topic up should swap with first
  moveTopic(secondId, 'up');
  current = getAllTopics();
  assert.equal(current[0].id, secondId);
  assert.equal(current[1].id, firstId);

  // Moving top topic down should swap back
  moveTopic(secondId, 'down');
  current = getAllTopics();
  assert.equal(current[0].id, firstId);
  assert.equal(current[1].id, secondId);

  // Moving last topic down should be a no-op
  const lastId = current[current.length - 1].id;
  moveTopic(lastId, 'down');
  current = getAllTopics();
  assert.equal(current[current.length - 1].id, lastId);
});

test('saveTopicOrder and loadTopicOrder persist topic sequencing', () => {
  const customOrder = ['CANADA', 'TOP', 'AI', 'BUSINESS'];
  saveTopicOrder(customOrder);
  const loaded = loadTopicOrder();
  assert.deepEqual(loaded, customOrder);

  const all = getAllTopics();
  assert.equal(all[0].id, 'CANADA');
  assert.equal(all[1].id, 'TOP');
  assert.equal(all[2].id, 'AI');
  assert.equal(all[3].id, 'BUSINESS');
});

test('parseCommaKeywords trims, filters, and splits phrases properly', () => {
  assert.deepEqual(parseCommaKeywords('apple, banana, cherry'), ['apple', 'banana', 'cherry']);
  assert.deepEqual(parseCommaKeywords('  artificial intelligence ,  OpenAI , , robotics  '), ['artificial intelligence', 'OpenAI', 'robotics']);
  assert.deepEqual(parseCommaKeywords(['machine learning', 'deep learning']), ['machine learning', 'deep learning']);
  assert.deepEqual(parseCommaKeywords(''), []);
  assert.deepEqual(parseCommaKeywords(null), []);
});

test('formatKeywordsQuery quotes multi-word phrases and joins with OR', () => {
  const formatted = formatKeywordsQuery(['artificial intelligence', 'OpenAI', 'robotics']);
  assert.equal(formatted, '"artificial intelligence" OR OpenAI OR robotics');

  // Single word
  assert.equal(formatKeywordsQuery(['Tesla']), 'Tesla');
  // Empty
  assert.equal(formatKeywordsQuery([]), '');
});

test('addCustomTopic supports object config with label, comma-separated keywords, and sources', () => {
  const added = addCustomTopic({
    label: 'AI & Robotics',
    keywords: 'artificial intelligence, OpenAI, robotics',
    sources: ['src_the_verge', 'src_ars_technica'],
  });

  assert.equal(added.label, 'AI & Robotics');
  assert.deepEqual(added.keywords, ['artificial intelligence', 'OpenAI', 'robotics']);
  assert.deepEqual(added.sources, ['src_the_verge', 'src_ars_technica']);
  assert.ok(added.url.includes('q=%22artificial%20intelligence%22%20OR%20OpenAI%20OR%20robotics'));

  const retrieved = getTopicById(added.id);
  assert.ok(retrieved);
  assert.equal(retrieved.label, 'AI & Robotics');
  assert.deepEqual(retrieved.sources, ['src_the_verge', 'src_ars_technica']);
});

test('addCustomTopic supports source-only topic without keywords', () => {
  const added = addCustomTopic({
    label: 'Tech Publications',
    keywords: '',
    sources: ['src_polygon', 'src_kotaku'],
  });

  assert.equal(added.label, 'Tech Publications');
  assert.equal(added.url, '');
  assert.deepEqual(added.sources, ['src_polygon', 'src_kotaku']);
  assert.deepEqual(added.keywords, []);
});


