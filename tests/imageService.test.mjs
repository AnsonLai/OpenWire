/**
 * tests/imageService.test.mjs
 * 
 * Unit tests for image validation heuristics, logo/favicon rejection,
 * resolution and aspect ratio checks, and HTML image extraction.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isNotLogoOrFavicon,
  extractImageFromHtml,
  validateImageDimensions,
  fetchArticleImage,
  extractImageCandidatesFromHtml,
} from '../js/imageService.js';

function mockGlobal(t, key, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { value, configurable: true });
  t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
}

test('isNotLogoOrFavicon rejects URLs containing logo and favicon keywords', () => {
  assert.equal(isNotLogoOrFavicon('https://example.com/assets/favicon.ico'), false);
  assert.equal(isNotLogoOrFavicon('https://example.com/images/site-logo.png'), false);
  assert.equal(isNotLogoOrFavicon('https://example.com/brand/header-logo.jpg'), false);
  assert.equal(isNotLogoOrFavicon('https://example.com/authors/avatar-john.jpg'), false);
  assert.equal(isNotLogoOrFavicon('https://example.com/icons/badge-icon.png'), false);
  assert.equal(isNotLogoOrFavicon('https://example.com/assets/placeholder.jpg'), false);
  assert.equal(isNotLogoOrFavicon('https://example.com/1x1-spacer.gif'), false);
  assert.equal(isNotLogoOrFavicon('https://example.com/tracking/pixel.png'), false);
});

test('isNotLogoOrFavicon rejects SVG formats and inline data-URIs', () => {
  assert.equal(isNotLogoOrFavicon('https://example.com/images/graphic.svg'), false);
  assert.equal(isNotLogoOrFavicon('data:image/svg+xml;base64,PHN2Z...'), false);
  assert.equal(isNotLogoOrFavicon('data:image/png;base64,iVBORw0KGgo...'), false);
});

test('isNotLogoOrFavicon allows legitimate editorial photo URLs', () => {
  assert.equal(isNotLogoOrFavicon('https://ichef.bbci.co.uk/news/1024/branded_news/story.jpg'), true);
  assert.equal(isNotLogoOrFavicon('https://i.cbc.ca/1.745678.1720000000/image.jpg'), true);
  assert.equal(isNotLogoOrFavicon('https://static01.nyt.com/images/2026/09/16/world/article-lead.webp'), true);
});

test('isNotLogoOrFavicon enforces minimum resolution (280x160)', () => {
  // Too small
  assert.equal(isNotLogoOrFavicon('https://example.com/photo.jpg', 200, 150), false);
  assert.equal(isNotLogoOrFavicon('https://example.com/photo.jpg', 250, 250), false);
  assert.equal(isNotLogoOrFavicon('https://example.com/photo.jpg', 600, 120), false); // Too thin

  // Adequate size
  assert.equal(isNotLogoOrFavicon('https://example.com/photo.jpg', 800, 500), true);
  assert.equal(isNotLogoOrFavicon('https://example.com/photo.jpg', 1200, 675), true); // 16:9
});

test('isNotLogoOrFavicon rejects square logos/crests under 450px and extreme aspect ratios', () => {
  // Square icons/logos under 450px
  assert.equal(isNotLogoOrFavicon('https://example.com/photo.jpg', 300, 300), false);
  assert.equal(isNotLogoOrFavicon('https://example.com/photo.jpg', 400, 420), false); // ~0.95 ratio

  // Large square photos (e.g. Instagram-style editorial portrait) over 450px are allowed
  assert.equal(isNotLogoOrFavicon('https://example.com/photo.jpg', 600, 600), true);

  // Extreme aspect ratios (ads or thin banners)
  assert.equal(isNotLogoOrFavicon('https://example.com/photo.jpg', 160, 600), false); // 0.26 ratio (skyscraper)
  assert.equal(isNotLogoOrFavicon('https://example.com/photo.jpg', 1200, 200), false); // 6.0 ratio (thin banner)
});

test('extractImageFromHtml extracts og:image and resolves relative URLs', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta property="og:image" content="/images/breaking-news-hero.jpg" />
      </head>
      <body></body>
    </html>
  `;
  const result = extractImageFromHtml(html, 'https://example.com/news/article-1');
  assert.equal(result, 'https://example.com/images/breaking-news-hero.jpg');
});

test('extractImageFromHtml skips logos in og:image and falls back to twitter:image or article figure', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta property="og:image" content="https://example.com/assets/site-logo.png" />
        <meta name="twitter:image" content="https://example.com/assets/story-lead-photo.jpg" />
      </head>
      <body></body>
    </html>
  `;
  const result = extractImageFromHtml(html, 'https://example.com/news/article-1');
  assert.equal(result, 'https://example.com/assets/story-lead-photo.jpg');
});

test('extractImageFromHtml extracts from Schema.org JSON-LD Article', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          "headline": "City opens new transit line",
          "image": {
            "@type": "ImageObject",
            "url": "https://example.com/photos/transit-opening.jpg",
            "width": 1200,
            "height": 675
          }
        }
        </script>
      </head>
      <body></body>
    </html>
  `;
  const result = extractImageFromHtml(html, 'https://example.com/news/transit');
  assert.equal(result, 'https://example.com/photos/transit-opening.jpg');
});

test('extractImageFromHtml extracts in-article figure image with srcset', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <article>
          <figure class="article-lead">
            <img src="/small.jpg" srcset="/medium.jpg 600w, /large-photo.jpg 1200w" alt="Ceremony" />
          </figure>
        </article>
      </body>
    </html>
  `;
  const result = extractImageFromHtml(html, 'https://example.com/news/event');
  assert.equal(result, 'https://example.com/large-photo.jpg');
});

test('validateImageDimensions works in test environment', async () => {
  const valid = await validateImageDimensions('https://example.com/photos/good-editorial-photo.jpg');
  assert.equal(valid, true);

  const invalid = await validateImageDimensions('https://example.com/static/brand-logo.svg');
  assert.equal(invalid, false);
});

test('preview candidates decode URL entities and include JSON-LD graph images', () => {
  const html = `<meta property="og:image" content="https://example.com/photo.jpg?w=900&amp;quality=80">
    <script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","image":{"url":"/second.jpg"}}]}</script>`;
  assert.deepEqual(extractImageCandidatesFromHtml(html, 'https://example.com/news'), [
    'https://example.com/photo.jpg?w=900&quality=80', 'https://example.com/second.jpg',
  ]);
});

test('articles with the same URL prefix do not share an image cache entry', async (t) => {
  const session = new Map();
  mockGlobal(t, 'sessionStorage', {
    getItem: key => session.get(key) || null,
    setItem: (key, value) => session.set(key, value),
  });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async input => {
    calls++;
    return new Response(`<meta property="og:image" content="https://photos.example/${String(input).endsWith('/a') ? 'alpha' : 'beta'}.jpg">`);
  });
  const base = 'https://example.com/articles/long-common-prefix/';
  assert.equal(await fetchArticleImage(base + 'a'), 'https://photos.example/alpha.jpg');
  assert.equal(await fetchArticleImage(base + 'b'), 'https://photos.example/beta.jpg');
  assert.equal(await fetchArticleImage(base + 'a'), 'https://photos.example/alpha.jpg');
  assert.equal(calls, 2);
  assert.equal(session.size, 2);
});

test('concurrent image requests share their normal-page metadata fetch', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response('<meta property="og:image" content="https://photos.example/concurrent.jpg">');
  });
  const images = await Promise.all([fetchArticleImage('https://example.com/concurrent-image'), fetchArticleImage('https://example.com/concurrent-image')]);
  assert.deepEqual(images, ['https://photos.example/concurrent.jpg', 'https://photos.example/concurrent.jpg']);
  assert.equal(calls, 1);
});

test('a failed preview lookup can recover after a short cooldown', async (t) => {
  let now = Date.now();
  let healthy = false;
  let calls = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return healthy ? new Response('<meta property="og:image" content="https://photos.example/recovered.jpg">')
      : new Response('<html>No photo yet</html>');
  });
  const url = 'https://example.com/retry-image';
  assert.equal(await fetchArticleImage(url), null);
  const failedCalls = calls;
  assert.equal(await fetchArticleImage(url), null);
  assert.equal(calls, failedCalls);
  healthy = true;
  now += 61000;
  assert.equal(await fetchArticleImage(url), 'https://photos.example/recovered.jpg');
});

test('a broken first preview image does not prevent a healthy second candidate', async (t) => {
  class TestImage {
    naturalWidth = 1000;
    naturalHeight = 600;
    set src(url) { queueMicrotask(() => url.includes('broken') ? this.onerror?.() : this.onload?.()); }
  }
  mockGlobal(t, 'Image', TestImage);
  t.mock.method(globalThis, 'fetch', async () => new Response(`<meta property="og:image" content="https://photos.example/broken.jpg">
    <meta name="twitter:image" content="https://photos.example/working.jpg">`));
  assert.equal(await fetchArticleImage('https://example.com/fallback-image'), 'https://photos.example/working.jpg');
  assert.equal(await fetchArticleImage('https://example.com/failed-image-cache', { excludeUrl: 'https://photos.example/broken.jpg' }), 'https://photos.example/working.jpg');
});
