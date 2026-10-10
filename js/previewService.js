import { normalizeArticleUrl } from './feedWeaver.js';

// Retain just the public excerpt. Feed markup must not contribute scripts,
// menus, related-headline lists, URLs, image alt text, or hidden tracking text.
export function cleanPreviewText(markup) {
  if (typeof markup !== 'string') return '';
  const filtered = markup.replace(/<(script|style|nav|aside|footer|header|form|noscript|ul|ol)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ');
  let decoded = filtered;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const element = document.createElement('textarea');
    // Escape brackets so decoding entities cannot turn text back into markup.
    element.innerHTML = filtered.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    decoded = element.value;
  } else {
    decoded = filtered.replace(/&#(x[\da-f]+|\d+);/gi, (match, value) => {
      const code = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }).replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, name) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[name]);
  }
  return decoded.replace(/\s+/g, ' ').trim().slice(0, 800);
}

function normalize(text) {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

export function literalKeywords(keywords) {
  if (!Array.isArray(keywords)) return [];
  return keywords.filter(term => typeof term === 'string').flatMap(term => {
    // Advanced Google search expressions keep their Google semantics. Local
    // excerpt matching supports ordinary comma-separated words/phrases and OR.
    if (/\b(?:AND|NOT)\b|\w+:|^-/.test(term)) return [];
    return term.split(/\s+OR\s+/).map(part => part.trim().replace(/^["“]|["”]$/g, '').trim());
  }).filter(Boolean);
}

export function matchArticleKeywords(article, keywords) {
  const fields = ['title', 'summary'].map(field => ` ${normalize(typeof article?.[field] === 'string' ? article[field] : '')} `);
  for (const keyword of literalKeywords(keywords)) {
    const term = normalize(keyword);
    if (!term) continue;
    const field = fields.findIndex(text => text.includes(` ${term} `));
    if (field !== -1) return { keyword, field: field === 0 ? 'title' : 'summary' };
  }
  return null;
}

// The shared preview file is a metadata lookup only. It can fill in a public
// excerpt for a URL already supplied by the topic's feeds, never add a story.
export function enrichArticlePreviews(articles, previews) {
  const byUrl = new Map();
  for (const preview of previews) {
    if (!preview || typeof preview.summary !== 'string' || !preview.summary) continue;
    for (const url of [preview.originalUrl, preview.googleNewsUrl]) {
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) byUrl.set(normalizeArticleUrl(url), preview.summary);
    }
  }
  return articles.map(article => {
    const summary = article.summary || [article.originalUrl, article.googleNewsUrl]
      .filter(url => typeof url === 'string').map(url => byUrl.get(normalizeArticleUrl(url))).find(Boolean) || '';
    return { ...article, summary };
  });
}

export function filterKeywordArticles(articles, keywords) {
  if (!literalKeywords(keywords).length) return articles;
  return articles.flatMap(article => {
    const match = matchArticleKeywords(article, keywords);
    return match ? [{ ...article, keywordMatch: match }] : [];
  });
}

let savedIndex = [];
let checkedAt = 0;
let pendingIndex = null;
export async function fetchPreviewArticles({ force = false } = {}) {
  if (pendingIndex) return pendingIndex;
  if (!force && checkedAt && Date.now() - checkedAt < (savedIndex.length ? 300000 : 30000)) return savedIndex;
  pendingIndex = (async () => {
    try {
      const response = await fetch('./data/preview_articles.json', { cache: 'no-cache', signal: AbortSignal.timeout(2500) });
      if (!response.ok) return savedIndex;
      const data = await response.json();
      if (Array.isArray(data)) savedIndex = data.slice(0, 600);
    } catch {
      // Preview discovery is optional; a missing index must not break RSS.
    } finally {
      checkedAt = Date.now();
    }
    return savedIndex;
  })().finally(() => { pendingIndex = null; });
  return pendingIndex;
}
