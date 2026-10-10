import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkArchiveIs, checkWayback } from '../js/archiveService.js';

test('both archive services use the publisher URL and never query unresolved Google wrappers', async t => {
  const requested = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const url = String(input);
    requested.push(url);
    if (url.endsWith('/data/publisher_urls.json')) return new Response(JSON.stringify({
      archive: 'https://www.wsj.com/news/resolved-article', wayback: 'https://www.ft.com/content/resolved-article',
    }));
    if (url.startsWith('https://archive.is/timemap/')) return new Response('<https://archive.is/saved>; rel="memento"');
    if (url.startsWith('https://archive.org/wayback/available?')) return new Response(JSON.stringify({
      archived_snapshots: { closest: { available: true, url: 'http://web.archive.org/web/20260101/https://www.ft.com/content/resolved-article' } },
    }));
    throw Error('Unexpected request');
  });
  const archive = await checkArchiveIs('https://news.google.com/rss/articles/archive?hl=en-CA');
  assert.equal(archive.archiveUrl, 'https://archive.is/newest/https://www.wsj.com/news/resolved-article');
  const wayback = await checkWayback('https://news.google.com/read/wayback');
  assert.equal(wayback.available, true);
  assert.ok(requested.includes('https://archive.is/timemap/https://www.wsj.com/news/resolved-article'));
  assert.ok(requested.includes('https://archive.org/wayback/available?url=https%3A%2F%2Fwww.ft.com%2Fcontent%2Fresolved-article'));
  const before = requested.length;
  assert.equal((await checkArchiveIs('https://news.google.com/rss/articles/unknown')).available, false);
  assert.equal((await checkWayback('https://news.google.com/rss/articles/unknown')).available, false);
  assert.equal(requested.length, before, 'An unresolved wrapper must never be passed to an archive');
});
