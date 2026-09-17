/**
 * tests/feedWeaver.test.mjs
 * 
 * Unit tests for feed deduplication, fair-share quotas, and anti-clustering weaving.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeArticleUrl,
  calculateTitleSimilarity,
  isDuplicateArticle,
  weaveFeeds,
} from '../js/feedWeaver.js';

test('normalizeArticleUrl strips tracking parameters and trailing slashes', () => {
  const dirtyUrl = 'https://www.cbc.ca/news/world/story-123/?utm_source=rss&utm_medium=feed&ref=google';
  const cleanUrl = normalizeArticleUrl(dirtyUrl);
  assert.equal(cleanUrl, 'https://cbc.ca/news/world/story-123');
});

test('calculateTitleSimilarity detects identical and rephrased titles with publisher suffixes removed', () => {
  const titleA = 'Bank of Canada cuts interest rates by 25 basis points - CBC News';
  const titleB = 'Bank of Canada Cuts Interest Rates by 25 Basis Points | Financial Post';
  const similarity = calculateTitleSimilarity(titleA, titleB);
  assert.ok(similarity >= 0.8, `Similarity should be high: got ${similarity}`);

  const diffA = 'Trudeau announces new funding for housing in Vancouver';
  const diffB = 'NASA unveils stunning new deep space galaxy image';
  const diffSim = calculateTitleSimilarity(diffA, diffB);
  assert.ok(diffSim < 0.2, `Similarity should be near zero: got ${diffSim}`);
});

test('isDuplicateArticle identifies duplicates via URL or headline content', () => {
  const art1 = {
    originalUrl: 'https://www.bbc.com/news/world-12345?utm_source=rss',
    title: 'Earthquake strikes off coast of Japan',
  };
  const art2 = {
    originalUrl: 'https://bbc.com/news/world-12345',
    title: 'Earthquake strikes off the coast of Japan - BBC News',
  };
  assert.equal(isDuplicateArticle(art1, art2), true);
});

test('weaveFeeds preserves top lead stories at positions 0 and 1', () => {
  const primary = [
    { id: 'p1', title: 'Top Breaking Story 1', domain: 'google.com' },
    { id: 'p2', title: 'Top Breaking Story 2', domain: 'google.com' },
    { id: 'p3', title: 'Primary Story 3', domain: 'reuters.com' },
    { id: 'p4', title: 'Primary Story 4', domain: 'apnews.com' },
  ];
  const secondary = [
    {
      feedConfig: { name: 'BBC News', maxArticles: 2 },
      articles: [
        { id: 's1', title: 'BBC Story 1', domain: 'bbc.co.uk' },
        { id: 's2', title: 'BBC Story 2', domain: 'bbc.co.uk' },
      ],
    },
  ];

  const woven = weaveFeeds(primary, secondary, { leadAnchorCount: 2 });
  assert.equal(woven[0].id, 'p1', 'Position 0 must be lead primary');
  assert.equal(woven[1].id, 'p2', 'Position 1 must be lead primary');
  assert.ok(woven.some((a) => a.id === 's1'), 'Must include secondary story');
});

test('weaveFeeds enforces fair-share cap on secondary feeds', () => {
  const primary = [
    { id: 'p1', title: 'Lead 1', domain: 'news1.com' },
    { id: 'p2', title: 'Lead 2', domain: 'news2.com' },
    { id: 'p3', title: 'Lead 3', domain: 'news3.com' },
    { id: 'p4', title: 'Lead 4', domain: 'news4.com' },
    { id: 'p5', title: 'Lead 5', domain: 'news5.com' },
  ];
  const secondary = [
    {
      feedConfig: { name: 'BBC', maxArticles: 2 },
      articles: [
        { id: 'b1', title: 'BBC 1', domain: 'bbc.co.uk' },
        { id: 'b2', title: 'BBC 2', domain: 'bbc.co.uk' },
        { id: 'b3', title: 'BBC 3', domain: 'bbc.co.uk' },
        { id: 'b4', title: 'BBC 4', domain: 'bbc.co.uk' },
      ],
    },
  ];

  const woven = weaveFeeds(primary, secondary, { leadAnchorCount: 1 });
  const bbcCount = woven.filter((a) => a.domain === 'bbc.co.uk').length;
  assert.equal(bbcCount, 2, 'Should not exceed maxArticles quota of 2');
});

test('weaveFeeds enforces anti-clustering rule (max 2 consecutive from same domain)', () => {
  const primary = [
    { id: 'p1', title: 'CBC Story 1', domain: 'cbc.ca' },
    { id: 'p2', title: 'CBC Story 2', domain: 'cbc.ca' },
    { id: 'p3', title: 'CBC Story 3', domain: 'cbc.ca' },
    { id: 'p4', title: 'CBC Story 4', domain: 'cbc.ca' },
  ];
  const secondary = [
    {
      feedConfig: { name: 'BBC', maxArticles: 5 },
      articles: [
        { id: 'b1', title: 'BBC Story 1', domain: 'bbc.co.uk' },
        { id: 'b2', title: 'BBC Story 2', domain: 'bbc.co.uk' },
      ],
    },
  ];

  const woven = weaveFeeds(primary, secondary, {
    leadAnchorCount: 0,
    maxConsecutivePerDomain: 2,
  });

  // Verify that no domain appears 3 times consecutively
  for (let i = 2; i < woven.length; i++) {
    const d0 = woven[i - 2].domain;
    const d1 = woven[i - 1].domain;
    const d2 = woven[i].domain;
    const allSame = d0 === d1 && d1 === d2;
    assert.equal(allSame, false, `Found 3 consecutive items from domain ${d0} at indices ${i - 2}..${i}`);
  }
});

test('isDuplicateArticle detects same-domain rephrased titles and weaveFeeds enriches lead anchor images', () => {
  const googleItem = {
    id: 'hero1',
    title: 'Three dead in Los Angeles helicopter crash - BBC',
    domain: 'bbc.co.uk',
    originalUrl: 'https://news.google.com/rss/articles/CBMi12345',
    imageUrl: '',
  };
  const bbcDirectItem = {
    id: 'bbc1',
    title: 'Three killed after LA news helicopter crashes while covering deadly bus collision',
    domain: 'bbc.co.uk',
    originalUrl: 'https://www.bbc.co.uk/news/articles/cqx2zpj4y525o',
    imageUrl: 'https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/2cc2/live/2332d760.jpg',
  };

  assert.equal(isDuplicateArticle(googleItem, bbcDirectItem), true, 'Must recognize same publisher rephrased headline as duplicate');

  const woven = weaveFeeds([googleItem], [
    {
      feedConfig: { name: 'BBC News', maxArticles: 5 },
      articles: [bbcDirectItem],
    }
  ], { leadAnchorCount: 1 });

  assert.equal(woven[0].id, 'hero1');
  assert.equal(woven[0].imageUrl, 'https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/2cc2/live/2332d760.jpg', 'Hero card must inherit direct high-res image');
  assert.equal(woven[0].originalUrl, 'https://www.bbc.co.uk/news/articles/cqx2zpj4y525o', 'Hero card must inherit canonical direct URL');
});

