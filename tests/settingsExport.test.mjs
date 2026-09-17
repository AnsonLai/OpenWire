/**
 * tests/settingsExport.test.mjs
 * 
 * Unit tests for settingsExport module:
 * verifying comprehensive snapshot generation of topics, RSS sources, and paywall rules.
 */

import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';

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

import {
  generateSettingsBackupObject,
  exportSettingsAsJson,
} from '../js/settingsExport.js';
import { addCustomTopic } from '../js/topicRegistry.js';
import { addCustomSource } from '../js/feedRegistry.js';
import { setDomainRule, STRATEGIES } from '../js/domainRegistry.js';

beforeEach(() => {
  storageMock.clear();
});

test('generateSettingsBackupObject produces a complete, structured backup payload', () => {
  const backup = generateSettingsBackupObject();

  // Root metadata
  assert.equal(backup.version, 1);
  assert.equal(backup.appName, 'OpenWire News Aggregator');
  assert.ok(backup.exportedAt);
  assert.ok(new Date(backup.exportedAt).getTime() > 0);

  // Topics
  assert.ok(backup.topics, 'Backup must include topics object');
  assert.ok(Array.isArray(backup.topics.items), 'topics.items must be an array');
  assert.ok(backup.topics.items.length > 0, 'Must have default topics');
  assert.ok(Array.isArray(backup.topics.order), 'topics.order must be an array');
  assert.ok(backup.topics.localEdition, 'topics.localEdition must be defined');
  assert.equal(backup.topics.localEdition.city, 'Vancouver');

  // RSS Feeds & Sources
  assert.ok(backup.rssFeeds, 'Backup must include rssFeeds object');
  assert.ok(Array.isArray(backup.rssFeeds.sources), 'rssFeeds.sources must be an array');
  assert.ok(backup.rssFeeds.sources.length >= 5, 'Must contain built-in source catalog');
  assert.ok(Array.isArray(backup.rssFeeds.customFeeds), 'rssFeeds.customFeeds must be an array');

  // Paywall Rules
  assert.ok(backup.paywallRules, 'Backup must include paywallRules object');
  assert.ok(Object.keys(backup.paywallRules).length > 0, 'Must contain default paywall rules');
  assert.ok(backup.paywallRules['nytimes.com']);
  assert.ok(backup.paywallRules['medium.com']);
});

test('generateSettingsBackupObject includes user customizations across topics, sources, and paywalls', () => {
  // Add a custom topic with keywords and sources
  addCustomTopic({
    label: 'Quantum Computing',
    keywords: 'quantum computing, qubits',
    sources: ['ars_technica'],
  });

  // Add a custom source
  const customSrc = addCustomSource({
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    maxArticles: 8,
  });

  // Set a custom domain rule
  setDomainRule('mycustomnews.org', { strategy: STRATEGIES.READER });

  const backup = generateSettingsBackupObject();

  // Verify custom topic is in backup
  const foundTopic = backup.topics.items.find((t) => t.label === 'Quantum Computing');
  assert.ok(foundTopic, 'Custom topic must be present in backup');
  assert.deepEqual(foundTopic.keywords, ['quantum computing', 'qubits']);
  assert.deepEqual(foundTopic.sources, ['ars_technica']);

  // Verify custom source is in backup
  const foundSource = backup.rssFeeds.sources.find((s) => s.id === customSrc.id);
  assert.ok(foundSource, 'Custom source must be in sources catalog');
  assert.equal(foundSource.name, 'TechCrunch');

  const foundCustomFeed = backup.rssFeeds.customFeeds.find((f) => f.id === customSrc.id);
  assert.ok(foundCustomFeed, 'Custom source must be in customFeeds array');

  // Verify custom paywall rule is in backup
  assert.ok(backup.paywallRules['mycustomnews.org']);
  assert.equal(backup.paywallRules['mycustomnews.org'].strategy, STRATEGIES.READER);
  assert.equal(backup.paywallRules['mycustomnews.org'].isCustom, true);
});

test('exportSettingsAsJson returns valid formatted filename', () => {
  const filename = exportSettingsAsJson();
  const dateStr = new Date().toISOString().slice(0, 10);
  assert.equal(filename, `openwire_settings_${dateStr}.json`);
});
