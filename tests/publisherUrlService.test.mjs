import assert from 'node:assert/strict';
import { test } from 'node:test';

const service = name => import(`../js/publisherUrlService.js?case=${name}`);
const wrapper = id => `https://news.google.com/rss/articles/${id}?hl=en-CA`;
const json = data => new Response(JSON.stringify(data));

function embeddedLink(url) {
  const bytes = Buffer.from(url);
  const length = [];
  let remaining = bytes.length;
  while (remaining > 127) { length.push((remaining & 127) | 128); remaining >>>= 7; }
  length.push(remaining);
  return wrapper(Buffer.concat([Buffer.from([8, 19, 34, ...length]), bytes, Buffer.from([210, 1, 0])]).toString('base64url'));
}

test('older Google wrappers decode the complete publisher URL including long URLs', async () => {
  const { decodeEmbeddedGoogleUrl } = await service('embedded');
  for (const url of ['https://example.com/story?a=1&b=2', 'https://example.com/news/' + 'a'.repeat(180)]) {
    assert.equal(decodeEmbeddedGoogleUrl(embeddedLink(url)), url);
  }
  assert.equal(decodeEmbeddedGoogleUrl(wrapper('opaque-token')), '');
  assert.equal(decodeEmbeddedGoogleUrl(embeddedLink('https://news.google.com/story')), '');
});

test('published URLs resolve RSS, articles, and read variants in one concurrent lookup', async t => {
  const { resolvePublisherUrl, googleNewsArticleId } = await service('published');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async input => {
    calls++;
    assert.ok(String(input).endsWith('/data/publisher_urls.json'));
    return json({ token: 'https://www.wsj.com/article?x=1&y=2' });
  });
  const variants = [wrapper('token'), 'https://news.google.com/articles/token?hl=en-US', 'https://news.google.com/read/token?gl=CA'];
  assert.deepEqual(variants.map(googleNewsArticleId), ['token', 'token', 'token']);
  assert.deepEqual(await Promise.all(variants.map(resolvePublisherUrl)), variants.map(() => 'https://www.wsj.com/article?x=1&y=2'));
  assert.equal(calls, 1);
  assert.equal(await resolvePublisherUrl('https://example.com/story'), 'https://example.com/story');
  assert.equal(await resolvePublisherUrl('https://news.google.com/rss'), '');
});

test('unresolved and invalid published targets stay unresolved rather than being guessed', async t => {
  const { resolvePublisherUrl } = await service('invalid');
  t.mock.method(globalThis, 'fetch', async () => json({
    wrong: 'https://news.google.com/read/another', unsafe: 'javascript:alert(1)', challenge: 'https://www.google.com/sorry/',
  }));
  for (const id of ['missing', 'wrong', 'unsafe', 'challenge']) assert.equal(await resolvePublisherUrl(wrapper(id)), '');
});

test('publisher mappings survive an outage and can retry after a short cooldown', async t => {
  const { resolvePublisherUrl } = await service('retry');
  let now = Date.now();
  let healthy = true;
  let calls = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (!healthy) throw Error('Offline');
    return json({ old: 'https://example.com/old', ...(calls > 1 ? { recent: 'https://example.com/recent' } : {}) });
  });
  assert.equal(await resolvePublisherUrl(wrapper('old')), 'https://example.com/old');
  now += 61000;
  healthy = false;
  assert.equal(await resolvePublisherUrl(wrapper('old')), 'https://example.com/old');
  assert.equal(await resolvePublisherUrl(wrapper('recent')), '');
  assert.equal(calls, 2);
  now += 16000;
  healthy = true;
  assert.equal(await resolvePublisherUrl(wrapper('recent')), 'https://example.com/recent');
  assert.equal(calls, 3);
});
