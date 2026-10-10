import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enrichArticlePreviews, filterKeywordArticles, cleanPreviewText, matchArticleKeywords, literalKeywords } from '../js/previewService.js';
import { addCustomTopic } from '../js/topicRegistry.js';
import { addCustomSource } from '../js/feedRegistry.js';
import { fetchTopHeadlines, normalizeFeedItem } from '../js/newsService.js';

const now = Date.now();
const candidate = (title, summary, path = title) => ({ title, summary,
  originalUrl: `https://example.com/${encodeURIComponent(path)}`, domain: 'example.com',
  pubDate: new Date(now - 3600000).toISOString(), fetchedAt: new Date(now).toISOString() });

test('topic terms match public excerpts even when absent from headlines', () => {
  assert.deepEqual(matchArticleKeywords(candidate('A new partnership', 'OpenAI will supply the software.'), ['openai']),
    { keyword: 'openai', field: 'summary' });
  assert.equal(matchArticleKeywords(candidate('A new partnership', 'Machine-learning tools process the data.'), ['machine learning']).field, 'summary');
  assert.equal(matchArticleKeywords(candidate('AI breakthrough', ''), ['AI']).field, 'title');
  assert.equal(matchArticleKeywords(candidate('A chair in the air', 'Officials said it rained.'), ['AI']), null);
  assert.equal(matchArticleKeywords(candidate('A firm', 'OpenAI-backed labs.'), ['AI']), null);
});

test('literal phrases and OR presets work without reinterpreting advanced Google queries', () => {
  assert.deepEqual(literalKeywords(['"artificial intelligence" OR "machine learning"', 'robotics']),
    ['artificial intelligence', 'machine learning', 'robotics']);
  assert.deepEqual(literalKeywords(['AI AND chips', 'site:example.com', '-football']), []);
});

test('RSS excerpts ignore script, navigation, related headline lists, and image alt text', () => {
  const text = cleanPreviewText('<script>OpenAI</script><nav>AI</nav><ol><li>ChatGPT news</li></ol><p>A publisher &amp; a lab&#8217;s announcement.</p><img alt="machine learning" src="x">');
  assert.equal(text, 'A publisher & a lab’s announcement.');
  assert.equal(matchArticleKeywords({ summary: text }, ['AI', 'OpenAI', 'ChatGPT', 'machine learning']), null);
  assert.equal(cleanPreviewText('a'.repeat(2000)).length, 800);
  const article = normalizeFeedItem({ title: 'An announcement', link: 'https://example.com/story',
    content_html: '<p>OpenAI announced a partnership.</p>' }, 'TOP', 0);
  assert.equal(article.summary, 'OpenAI announced a partnership.');
});

test('preview lookup enriches only URLs already supplied by assigned feeds', () => {
  const assigned = candidate('A featured announcement', '', 'one');
  const matchingPreview = { ...assigned, summary: 'OpenAI signed the deal.' };
  const outside = candidate('A completely different AI development', 'OpenAI supplied software.', 'outside');
  const lookalike = { ...outside, title: assigned.title };
  const result = enrichArticlePreviews([assigned], [matchingPreview, outside, lookalike]);
  assert.equal(result.length, 1);
  assert.equal(result[0].originalUrl, assigned.originalUrl);
  assert.equal(result[0].summary, matchingPreview.summary);
  assert.equal(assigned.summary, '', 'Inputs must not be mutated');
  assert.deepEqual(enrichArticlePreviews([], [outside]), []);
  assert.equal(enrichArticlePreviews([assigned], [lookalike])[0].summary, '', 'Similar headlines must not substitute for exact article URLs');
  const filtered = filterKeywordArticles([...result, candidate('Officials said it rained', 'A chair in the air')], ['AI', 'OpenAI']);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].keywordMatch.field, 'summary');
});

test('assigned RSS previews match during Google outages without importing other feeds', async () => {
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const feed = addCustomSource({ name: 'Assigned source', url: 'https://assigned.example/rss' });
  const topic = addCustomTopic({ label: 'Preview test', keywords: ['OpenAI', 'machine learning'], sources: [feed.id] });
  const originalFetch = globalThis.fetch;
  const assigned = candidate('Companies announce partnership', 'OpenAI is involved.', 'new');
  const outside = candidate('External OpenAI story', 'AI is involved.', 'external');
  try {
    globalThis.fetch = async url => {
      if (url === './data/preview_articles.json') return new Response(JSON.stringify([assigned, outside]));
      if (String(url).includes('rss2json') && new URL(url).searchParams.get('rss_url') === feed.url) {
        return new Response(JSON.stringify({ status: 'ok', feed: { title: 'Assigned source' }, items: [
          { title: assigned.title, link: assigned.originalUrl, pubDate: assigned.pubDate },
          { title: 'Labs announce a new collaboration', link: 'https://second.example/labs', description: '<p>Machine learning supports the agreement.</p>', pubDate: assigned.pubDate },
          { title: 'Officials said it rained', link: 'https://third.example/rain', description: 'A chair in the air.', pubDate: assigned.pubDate },
        ] }));
      }
      return new Response('Unavailable', { status: 503 });
    };
    const statuses = [];
    const result = await fetchTopHeadlines(topic.id, { forceLive: true, onStatus: status => statuses.push(status) });
    assert.equal(result.length, 2);
    assert.ok(result.some(article => article.title === assigned.title && article.keywordMatch.field === 'summary'));
    assert.ok(!result.some(article => article.title === outside.title));
    assert.equal(statuses.at(-1).source, 'live');
    assert.equal(statuses.at(-1).sources.find(source => source.name === feed.name).count, 2);
    globalThis.fetch = async () => { throw new Error('Offline'); };
    const offline = await fetchTopHeadlines(topic.id, { forceLive: true });
    assert.equal(offline.length, 2);
    assert.ok(!offline.some(article => article.title === outside.title));
    // No assigned feed available means no topic: the index alone cannot import
    // another feed's story or resurrect the earlier broader matching cache.
    const key = `openwire_live_cache_${topic.id}`;
    const oldCache = JSON.parse(storage.get(key));
    oldCache.signature = oldCache.signature.replace('"previewVersion":2', '"previewVersion":1');
    oldCache.articles = [outside];
    storage.set(key, JSON.stringify(oldCache));
    await assert.rejects(fetchTopHeadlines(topic.id, { forceLive: true }), /RSS sources are unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.localStorage;
  }
});
