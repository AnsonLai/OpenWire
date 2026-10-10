/**
 * imageService.js
 * 
 * Generic editorial image extraction and validation service for the News Aggregator.
 * Extracts high-resolution editorial photos from article pages while strictly
 * filtering out publisher logos, favicons, site icons, author avatars, tracking pixels,
 * and square or low-resolution promotional graphics.
 * 
 * SOLID Principles:
 * - Single Responsibility: Media extraction, dimension heuristics, and image validation only.
 * - Open-Closed: Pluggable extraction tiers (OG, Twitter, JSON-LD, Article Figure, Microlink).
 * 
 * Heuristics:
 * - Substring rejection: favicon, logo, icon, avatar, badge, placeholder, spacer, pixel, etc.
 * - Format rejection: SVG (.svg) is strictly rejected as non-editorial.
 * - Resolution threshold: Width >= 280px and Height >= 160px required.
 * - Aspect ratio threshold: Landscape orientation (1.15 to 3.2). Square or near-square images
 *   (0.85 to 1.15) with width <= 450px are rejected as publisher crests/logos.
 */

import { fetchWithProxy } from './fetchProxy.js';

// Patterns indicating non-editorial images (logos, icons, placeholders, avatars)
const REJECT_PATTERNS = [
  /\.svg(?:\?|#|$)/i,
  /\.ico(?:\?|#|$)/i,
  /^data:image/i,
  /(?:^|[_\-/.])(?:fav)?icon(?:s)?(?:[_\-/.]|\d|$)/i,
  /(?:^|[_\-/.])logo(?:s)?(?:[_\-/.]|\d|$)/i,
  /(?:^|[_\-/.])avatar(?:s)?(?:[_\-/.]|\d|$)/i,
  /(?:^|[_\-/.])badge(?:s)?(?:[_\-/.]|\d|$)/i,
  /(?:^|[_\-/.])(placeholder|spacer|pixel|tracking|spinner|sprite|1x1|clear\.gif|blank\.gif)/i,
  /akamai-logo/i,
  /apple-touch-icon/i,
  /masthead/i,
];

// Memory cache for article images (key: full article URL -> expiring cache entry)
const memoryImageCache = new Map();
const pendingImages = new Map();
const SESSION_CACHE_KEY_PREFIX = 'news_img_v2_';
const IMAGE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const IMAGE_FAILURE_TTL = 60 * 1000;

/**
 * Checks if an image URL or dimension set represents a logo, favicon, or placeholder.
 * 
 * @param {string} url - Candidate image URL
 * @param {number} [width] - Image width if known
 * @param {number} [height] - Image height if known
 * @returns {boolean} True if the image qualifies as a valid editorial photo; false if it's a logo/favicon/invalid.
 */
export function isNotLogoOrFavicon(url, width, height) {
  if (!url || typeof url !== 'string') return false;
  const cleanUrl = url.trim();

  // Must be an HTTP(S) URL
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    return false;
  }

  const lower = cleanUrl.toLowerCase();

  // Check rejection patterns against URL
  for (const pattern of REJECT_PATTERNS) {
    if (pattern.test(cleanUrl)) {
      return false;
    }
  }

  // Dimension heuristics if width and height are provided
  if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
    // Minimum resolution: Editorial news photos must be at least 280x160
    if (width < 280 || height < 160) {
      return false;
    }

    const aspectRatio = width / height;

    // Aspect ratio check:
    // Square or near-square images (0.85 to 1.15) under 450px wide are almost always
    // publisher logos, publisher crests, or author avatars.
    if (aspectRatio >= 0.85 && aspectRatio <= 1.15 && width <= 450) {
      return false;
    }

    // Reject extreme aspect ratios:
    // < 0.6: extremely tall/thin skyscraper banners or ads
    // > 3.2: extremely wide/thin header strips or dividing lines
    if (aspectRatio < 0.6 || aspectRatio > 3.2) {
      return false;
    }
  }

  return true;
}

/**
 * Parses srcset string and returns candidate URLs in descending order of size.
 * @param {string} srcset 
 * @returns {string[]}
 */
function parseSrcsetUrls(srcset) {
  if (!srcset) return [];
  const entries = srcset.split(',').map(s => s.trim()).filter(Boolean);
  const candidates = [];

  for (const entry of entries) {
    const parts = entry.split(/\s+/);
    if (parts.length > 0 && parts[0]) {
      const url = parts[0];
      let width = 0;
      if (parts[1] && parts[1].endsWith('w')) {
        width = parseInt(parts[1].slice(0, -1), 10) || 0;
      }
      candidates.push({ url, width });
    }
  }

  // Sort by width descending so largest candidate is tested first
  candidates.sort((a, b) => b.width - a.width);
  return candidates.map(c => c.url);
}

/**
 * Extracts candidate editorial images from raw HTML content.
 * Follows priority: OpenGraph -> Twitter -> JSON-LD Article -> Microdata -> Article Figure
 * 
 * @param {string} html - Raw HTML of article page
 * @param {string} baseUrl - Base URL for resolving relative links
 * @returns {string[]} Ordered, distinct preview image URLs
 */
export function extractImageCandidatesFromHtml(html, baseUrl) {
  if (!html || typeof html !== 'string') return [];
  const candidates = [];

  // Helper to safely resolve and test candidate
  const testCandidate = (candidateUrl, width, height) => {
    if (typeof candidateUrl !== 'string' || !candidateUrl.trim()) return null;
    let resolved = candidateUrl.trim().replace(/&amp;/gi, '&').replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code) => {
      const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : '';
    });
    if (resolved.startsWith('//')) {
      resolved = 'https:' + resolved;
    } else if (resolved.startsWith('/') || !resolved.startsWith('http')) {
      try {
        resolved = new URL(resolved, baseUrl).href;
      } catch {
        return null;
      }
    }
    return isNotLogoOrFavicon(resolved, width, height) ? resolved : null;
  };

  // 1. OpenGraph Meta Tags (og:image, og:image:url, og:image:secure_url)
  const ogMatches = html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|og:image:secure_url)["'][^>]+content=["']([^"']+)["']/gi);
  for (const m of ogMatches) {
    const candidate = testCandidate(m[1]);
    if (candidate) candidates.push(candidate);
  }

  // Reversed attribute order: content="..." property="og:image"
  const ogMatchesRev = html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|og:image:url|og:image:secure_url)["']/gi);
  for (const m of ogMatchesRev) {
    const candidate = testCandidate(m[1]);
    if (candidate) candidates.push(candidate);
  }

  // 2. Twitter Card Meta Tags (twitter:image, twitter:image:src)
  const twMatches = html.matchAll(/<meta[^>]+(?:name|property)=["'](?:twitter:image|twitter:image:src)["'][^>]+content=["']([^"']+)["']/gi);
  for (const m of twMatches) {
    const candidate = testCandidate(m[1]);
    if (candidate) candidates.push(candidate);
  }

  const twMatchesRev = html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:twitter:image|twitter:image:src)["']/gi);
  for (const m of twMatchesRev) {
    const candidate = testCandidate(m[1]);
    if (candidate) candidates.push(candidate);
  }

  // 3. Schema.org JSON-LD Article Image
  const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const scriptMatch of jsonLdMatches) {
    try {
      const data = JSON.parse(scriptMatch[1]);
      const items = (Array.isArray(data) ? data : [data]).flatMap(item => [item, ...(item?.['@graph'] || [])]);
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;

        // Check if item is an Article, NewsArticle, Report, or WebPage
        const type = (item['@type'] || '').toString().toLowerCase();
        const isArticleType = type.includes('article') || type.includes('news') || type.includes('report') || type.includes('webpage');

        if (isArticleType && item.image) {
          if (typeof item.image === 'string') {
            const candidate = testCandidate(item.image);
            if (candidate) candidates.push(candidate);
          } else if (Array.isArray(item.image)) {
            for (const imgItem of item.image) {
              const url = typeof imgItem === 'string' ? imgItem : imgItem?.url;
              const w = typeof imgItem === 'object' ? imgItem?.width : undefined;
              const h = typeof imgItem === 'object' ? imgItem?.height : undefined;
              const candidate = testCandidate(url, w, h);
              if (candidate) candidates.push(candidate);
            }
          } else if (typeof item.image === 'object' && item.image.url) {
            const candidate = testCandidate(item.image.url, item.image.width, item.image.height);
            if (candidate) candidates.push(candidate);
          }
        }

        // Secondary: thumbnailUrl
        if (item.thumbnailUrl && typeof item.thumbnailUrl === 'string') {
          const candidate = testCandidate(item.thumbnailUrl);
          if (candidate) candidates.push(candidate);
        }
      }
    } catch {
      // Ignore JSON-LD parse errors
    }
  }

  // 4. link rel="image_src" or meta itemprop="image"
  const linkMatches = html.matchAll(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/gi);
  for (const m of linkMatches) {
    const candidate = testCandidate(m[1]);
    if (candidate) candidates.push(candidate);
  }

  const itempropMatches = html.matchAll(/<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/gi);
  for (const m of itempropMatches) {
    const candidate = testCandidate(m[1]);
    if (candidate) candidates.push(candidate);
  }

  // 5. In-article <figure> <img> or <article> <img> tags
  const articleBlocks = html.match(/<(?:article|figure|main)[^>]*>([\s\S]*?)<\/(?:article|figure|main)>/gi) || [];
  for (const block of articleBlocks) {
    const imgTags = block.matchAll(/<img[^>]+(?:src|data-src|srcset)=["']([^"']+)["'][^>]*>/gi);
    for (const imgTag of imgTags) {
      const fullTag = imgTag[0];
      const srcMatch = fullTag.match(/\ssrc=["']([^"']+)["']/i);
      const dataSrcMatch = fullTag.match(/\sdata-src=["']([^"']+)["']/i);
      const srcsetMatch = fullTag.match(/\ssrcset=["']([^"']+)["']/i);

      let width = parseInt((fullTag.match(/\swidth=["'](\d+)["']/i) || [])[1], 10) || undefined;
      let height = parseInt((fullTag.match(/\sheight=["'](\d+)["']/i) || [])[1], 10) || undefined;

      // Try srcset candidates first (highest res)
      if (srcsetMatch) {
        for (const url of parseSrcsetUrls(srcsetMatch[1])) {
          const candidate = testCandidate(url, width, height);
          if (candidate) candidates.push(candidate);
        }
      }

      // Try data-src or src
      const targetSrc = (dataSrcMatch && dataSrcMatch[1]) || (srcMatch && srcMatch[1]);
      if (targetSrc) {
        const candidate = testCandidate(targetSrc, width, height);
        if (candidate) candidates.push(candidate);
      }
    }
  }

  return [...new Set(candidates)];
}

export function extractImageFromHtml(html, baseUrl) {
  return extractImageCandidatesFromHtml(html, baseUrl)[0] || null;
}

/**
 * Validates image dimensions and aspect ratio asynchronously using browser Image API.
 * 
 * @param {string} imageUrl 
 * @param {number} [timeoutMs=3500] 
 * @returns {Promise<boolean>}
 */
export function validateImageDimensions(imageUrl, timeoutMs = 3500) {
  return new Promise((resolve) => {
    // If not in a browser environment (e.g. Node tests), run URL heuristics
    if (typeof Image === 'undefined') {
      resolve(isNotLogoOrFavicon(imageUrl));
      return;
    }

    if (!isNotLogoOrFavicon(imageUrl)) {
      resolve(false);
      return;
    }

    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    let isResolved = false;

    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        img.onload = null;
        img.onerror = null;
        resolve(false);
      }
    }, timeoutMs);

    img.onload = () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        const w = img.naturalWidth || 0;
        const h = img.naturalHeight || 0;
        const valid = isNotLogoOrFavicon(imageUrl, w, h);
        resolve(valid);
      }
    };

    img.onerror = () => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        resolve(false);
      }
    };

    img.src = imageUrl;
  });
}

/**
 * Retrieves cached image URL from memory or sessionStorage.
 * @param {string} articleUrl 
 * @returns {string|null|undefined} Returns string URL if cached, null if cached as empty, undefined if not cached.
 */
function getCachedImage(articleUrl) {
  let cached = memoryImageCache.get(articleUrl);
  try {
    if (!cached) cached = JSON.parse(sessionStorage.getItem(SESSION_CACHE_KEY_PREFIX + articleUrl) || 'null');
  } catch {
    // Ignore sessionStorage errors
  }
  if (cached && cached.expiresAt > Date.now() && (cached.url === null || isNotLogoOrFavicon(cached.url))) {
    memoryImageCache.set(articleUrl, cached);
    return cached.url;
  }
  memoryImageCache.delete(articleUrl);
  return undefined;
}

/**
 * Persists image URL or negative cache indicator to memory and sessionStorage.
 * @param {string} articleUrl 
 * @param {string|null} imageUrl 
 */
function setCachedImage(articleUrl, imageUrl) {
  const cached = { url: imageUrl, expiresAt: Date.now() + (imageUrl ? IMAGE_CACHE_TTL : IMAGE_FAILURE_TTL) };
  memoryImageCache.set(articleUrl, cached);
  if (memoryImageCache.size > 200) memoryImageCache.delete(memoryImageCache.keys().next().value);
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY_PREFIX + articleUrl, JSON.stringify(cached));
  } catch {
    // Ignore quota errors
  }
}

// Cooldown timestamp for Microlink if HTTP 429 is encountered
let microlinkCooldownUntil = 0;

/**
 * Fetches an article page via CORS proxy, extracts candidate images,
 * and validates their dimensions and aspect ratio.
 * 
 * @param {string} articleUrl 
 * @returns {Promise<string|null>}
 */
export function invalidateArticleImage(articleUrl) {
  memoryImageCache.delete(articleUrl);
  try { sessionStorage.removeItem(SESSION_CACHE_KEY_PREFIX + articleUrl); } catch { /* Optional cache. */ }
}

async function resolveArticleImage(articleUrl, { excludeUrl = '' } = {}) {
  if (!articleUrl || typeof articleUrl !== 'string') return null;
  const cleanUrl = articleUrl.trim();

  // Google News redirect URLs cannot be fetched directly via client-side proxy
  if (cleanUrl.includes('news.google.com')) return null;

  // Check memory & session cache
  const cached = getCachedImage(cleanUrl);
  if (cached !== undefined) {
    if (cached !== excludeUrl || !excludeUrl) return cached;
    invalidateArticleImage(cleanUrl);
  }

  try {
    // Tier 1: Fetch article HTML via CORS proxy waterfall
    const result = await fetchWithProxy(cleanUrl, {
      responseType: 'text',
      timeoutMs: 2500, totalTimeoutMs: 5000
    });

    let htmlContent = '';
    if (result.ok && result.data) {
      htmlContent = typeof result.data === 'string' ? result.data : '';
    }

    if (htmlContent) {
      for (const candidate of extractImageCandidatesFromHtml(htmlContent, cleanUrl).filter(url => url !== excludeUrl).slice(0, 3)) {
        const isValid = await validateImageDimensions(candidate);
        if (isValid) {
          setCachedImage(cleanUrl, candidate);
          return candidate;
        }
      }
    }

    // Tier 2: Microlink API fallback for protected/SPA sites (if not in 429 cooldown)
    if (Date.now() > microlinkCooldownUntil) {
      const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(cleanUrl)}`;
      const mlResp = await fetch(microlinkUrl, { signal: AbortSignal.timeout(3500) }).catch(() => null);
      if (mlResp) {
        if (mlResp.status === 429) {
          // Back off for 5 minutes to respect provider limits
          microlinkCooldownUntil = Date.now() + 5 * 60 * 1000;
        } else if (mlResp.ok) {
          const mlJson = await mlResp.json().catch(() => null);
          if (mlJson && mlJson.status === 'success' && mlJson.data && mlJson.data.image) {
            const imgData = mlJson.data.image;
            const imgUrl = imgData.url;
            const w = imgData.width;
            const h = imgData.height;

            if (imgUrl !== excludeUrl && isNotLogoOrFavicon(imgUrl, w, h)) {
              const isValid = await validateImageDimensions(imgUrl);
              if (isValid) {
                setCachedImage(cleanUrl, imgUrl);
                return imgUrl;
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.debug({ articleUrl: cleanUrl, error: err?.message }, 'Article image resolution skipped');
  }

  // Cache failure so we don't repeat network calls
  setCachedImage(cleanUrl, null);
  return null;
}

// Cards and repeated renders share one lookup for the same normal article URL.
export async function fetchArticleImage(articleUrl, options = {}) {
  const key = `${articleUrl}\n${options.excludeUrl || ''}`;
  if (!pendingImages.has(key)) {
    const pending = resolveArticleImage(articleUrl, options).finally(() => pendingImages.delete(key));
    pendingImages.set(key, pending);
  }
  return pendingImages.get(key);
}
