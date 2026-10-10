/** Resolve Google News wrappers before passing links to article tools. */
const publisherMapUrl = new URL('../data/publisher_urls.json', import.meta.url).href;
let publishedUrls = new Map();
let refreshAfter = 0;
let pendingMap = null;

export function isGoogleNewsUrl(value) {
  try { return new URL(value).hostname === 'news.google.com'; } catch { return false; }
}

export function googleNewsArticleId(value) {
  try {
    const url = new URL(value);
    if (url.hostname !== 'news.google.com') return '';
    return url.pathname.match(/^\/(?:rss\/)?(?:articles|read)\/([^/]+)\/?$/)?.[1] || '';
  } catch { return ''; }
}

function publisherUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && url.hostname !== 'google.com' && !url.hostname.endsWith('.google.com') ? url.href : '';
  } catch { return ''; }
}

// Older wrappers embed a length-prefixed publisher URL. New opaque IDs need
// the mapping generated on the runner; treating their base64 as a URL is wrong.
export function decodeEmbeddedGoogleUrl(value) {
  const id = googleNewsArticleId(value);
  if (!id) return '';
  try {
    const bytes = Uint8Array.from(atob(id.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
    if (bytes[0] !== 8 || bytes[1] !== 19 || bytes[2] !== 34) return '';
    let length = 0;
    let offset = 3;
    let shift = 0;
    while (offset < bytes.length && shift <= 21) {
      const byte = bytes[offset++];
      length += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) {
        if (!length || offset + length > bytes.length) return '';
        return publisherUrl(new TextDecoder().decode(bytes.slice(offset, offset + length)));
      }
      shift += 7;
    }
  } catch { /* Not an embedded publisher URL. */ }
  return '';
}

async function loadPublishedUrls() {
  if (pendingMap) return pendingMap;
  if (Date.now() < refreshAfter) return;
  pendingMap = (async () => {
    try {
      const response = await fetch(publisherMapUrl, { cache: 'no-cache', signal: AbortSignal.timeout(2500) });
      if (!response.ok) throw new Error('Publisher URLs unavailable');
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid publisher URLs');
      publishedUrls = new Map(Object.entries(data).flatMap(([id, value]) => {
        const url = publisherUrl(value);
        return url ? [[id, url]] : [];
      }));
      refreshAfter = Date.now() + 60 * 1000;
    } catch {
      // Retain usable previous mappings through an outage, retry shortly.
      refreshAfter = Date.now() + 15 * 1000;
    }
  })().finally(() => { pendingMap = null; });
  return pendingMap;
}

export async function resolvePublisherUrl(value) {
  if (!isGoogleNewsUrl(value)) return value || '';
  const embedded = decodeEmbeddedGoogleUrl(value);
  if (embedded) return embedded;
  const id = googleNewsArticleId(value);
  if (!id) return '';
  await loadPublishedUrls();
  return publishedUrls.get(id) || '';
}
