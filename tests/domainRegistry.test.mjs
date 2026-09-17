/**
 * tests/domainRegistry.test.mjs
 * 
 * Unit tests for domain normalization and strategy lookup.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDomain, getDomainRule, STRATEGIES, isFreediumSupported, resolvePublisherDomain } from '../js/domainRegistry.js';

// Mock localStorage for Node environment
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; }
};

test('normalizeDomain extracts root clean domains', () => {
  assert.equal(normalizeDomain('https://www.wsj.com/articles/xyz'), 'wsj.com');
  assert.equal(normalizeDomain('http://edition.cnn.com'), 'edition.cnn.com');
  assert.equal(normalizeDomain('www.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(normalizeDomain('theguardian.com:8080'), 'theguardian.com');
  assert.equal(normalizeDomain(''), '');
});

test('resolvePublisherDomain and normalizeDomain resolve known publisher names to domains', () => {
  assert.equal(resolvePublisherDomain('The Guardian'), 'theguardian.com');
  assert.equal(resolvePublisherDomain('Gates Notes'), 'gatesnotes.com');
  assert.equal(resolvePublisherDomain('The New York Times'), 'nytimes.com');
  assert.equal(resolvePublisherDomain('Financial Times'), 'ft.com');
  assert.equal(resolvePublisherDomain('BBC'), 'bbc.com');
  assert.equal(resolvePublisherDomain('non existent publisher'), '');

  // normalizeDomain uses publisher resolution
  assert.equal(normalizeDomain('The Guardian'), 'theguardian.com');
  assert.equal(normalizeDomain('Gates Notes'), 'gatesnotes.com');
  assert.equal(normalizeDomain('BBC'), 'bbc.com');
  assert.equal(normalizeDomain('The New York Times'), 'nytimes.com');
  assert.equal(normalizeDomain('Unknown Non Domain Phrase'), '');

  // getDomainRule correctly resolves rules when given publisher names
  const nytRule = getDomainRule('The New York Times');
  assert.equal(nytRule.strategy, STRATEGIES.SMRY);
  assert.equal(nytRule.domain, 'nytimes.com');
});

test('getDomainRule matches free open-access domains', () => {
  const ruleBbc = getDomainRule('bbc.com');
  assert.equal(ruleBbc.strategy, STRATEGIES.DIRECT);

  const ruleNpr = getDomainRule('npr.org');
  assert.equal(ruleNpr.strategy, STRATEGIES.DIRECT);

  const ruleGuardian = getDomainRule('theguardian.com');
  assert.equal(ruleGuardian.strategy, STRATEGIES.DIRECT);
});

test('getDomainRule matches standard bypass domains', () => {
  const ruleNyt = getDomainRule('nytimes.com');
  assert.equal(ruleNyt.strategy, STRATEGIES.SMRY);

  const ruleAtlantic = getDomainRule('theatlantic.com');
  assert.equal(ruleAtlantic.strategy, STRATEGIES.SMRY);

  const ruleBI = getDomainRule('businessinsider.com');
  assert.equal(ruleBI.strategy, STRATEGIES.REMOVEPAYWALL);
});

test('getDomainRule matches hard paywalls requiring archive', () => {
  const ruleWsj = getDomainRule('wsj.com');
  assert.equal(ruleWsj.strategy, STRATEGIES.ARCHIVE_IS);

  const ruleBloomberg = getDomainRule('bloomberg.com');
  assert.equal(ruleBloomberg.strategy, STRATEGIES.ARCHIVE_IS);

  // Subdomain matching
  const ruleFtSubdomain = getDomainRule('markets.ft.com');
  assert.equal(ruleFtSubdomain.strategy, STRATEGIES.ARCHIVE_IS);
});

test('getDomainRule falls back to direct for unknown domains', () => {
  const unknown = getDomainRule('somerandomblog.io');
  assert.equal(unknown.strategy, STRATEGIES.DIRECT);
  assert.equal(unknown.isDefault, true);
});

test('STRATEGIES contains UNWALL, FREEDIUM, and READER without 12ft', () => {
  assert.equal(STRATEGIES.UNWALL, 'unwall');
  assert.equal(STRATEGIES.FREEDIUM, 'freedium');
  assert.equal(STRATEGIES.READER, 'reader');
  assert.equal(STRATEGIES.TWELVE_FT, undefined);
});

test('medium.com defaults to FREEDIUM', () => {
  const ruleMedium = getDomainRule('medium.com');
  assert.equal(ruleMedium.strategy, STRATEGIES.FREEDIUM);
});

test('isFreediumSupported validates strict list of publications', () => {
  assert.equal(isFreediumSupported('medium.com'), true);
  assert.equal(isFreediumSupported('nytimes.com'), true);
  assert.equal(isFreediumSupported('washingtonpost.com'), true);
  assert.equal(isFreediumSupported('bloomberg.com'), true);
  assert.equal(isFreediumSupported('reuters.com'), true);
  assert.equal(isFreediumSupported('economist.com'), true);
  assert.equal(isFreediumSupported('ft.com'), true);
  assert.equal(isFreediumSupported('markets.ft.com'), true);

  assert.equal(isFreediumSupported('cnn.com'), false);
  assert.equal(isFreediumSupported('wsj.com'), false);
  assert.equal(isFreediumSupported('bbc.com'), false);
});

test('getDomainRule automatically migrates legacy 12ft overrides to reader', () => {
  // Simulate legacy rule in localStorage
  global.localStorage.setItem('news_aggregator_domain_rules_v1', JSON.stringify({
    'legacy-news.com': { strategy: '12ft', paywall: 'custom' }
  }));

  const rule = getDomainRule('legacy-news.com');
  assert.equal(rule.strategy, STRATEGIES.READER);

  // Clear mock storage
  global.localStorage.removeItem('news_aggregator_domain_rules_v1');
});

