/**
 * feedWeaver.js
 * 
 * Intelligent deduplication, fair-share allocation, and cadence-paced interleaving
 * engine to weave direct RSS feeds with Google News.
 * 
 * SOLID Principles:
 * - Single Responsibility: Deduplication, source quota capping, and feed interleaving only.
 * - Open-Closed: Configurable weaving options without modifying core algorithm.
 */

import { normalizeDomain } from './domainRegistry.js';

/**
 * Strips tracking parameters, hash anchors, and trailing slashes to produce
 * a clean canonical comparison URL.
 * 
 * @param {string} rawUrl 
 * @returns {string} Normalized URL
 */
export function normalizeArticleUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    // Remove standard tracking parameters
    const paramsToDrop = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'ref', 'source', 'cmpid', 'mc_cid', 'mc_eid', 'fbclid', 'gclid'
    ];
    paramsToDrop.forEach((param) => parsed.searchParams.delete(param));
    
    // Normalize protocol and host
    const cleanHost = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let cleanPath = parsed.pathname.replace(/\/+$/, ''); // Remove trailing slash
    const cleanSearch = parsed.searchParams.toString();

    return `https://${cleanHost}${cleanPath}${cleanSearch ? '?' + cleanSearch : ''}`;
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Cleans a title for similarity comparison by stripping publisher suffixes,
 * punctuation, and excessive whitespace.
 * 
 * @param {string} rawTitle 
 * @returns {string} Normalized title string
 */
export function normalizeTitleForComparison(rawTitle) {
  if (!rawTitle) return '';
  let title = rawTitle.toLowerCase();

  // Strip common publisher suffixes: " - BBC News", " | CBC News", " - Reuters", etc.
  title = title.replace(/\s+[-–—|]\s+[a-z0-9\s.]+$/i, '');

  // Strip punctuation and special characters
  title = title.replace(/[^\w\s]/g, ' ');

  // Collapse multiple whitespaces
  return title.replace(/\s+/g, ' ').trim();
}

/**
 * Calculates token-based Jaccard similarity between two strings.
 * Returns a value between 0.0 (no overlap) and 1.0 (identical tokens).
 * 
 * @param {string} strA 
 * @param {string} strB 
 * @returns {number}
 */
export function calculateTitleSimilarity(strA, strB) {
  const normA = normalizeTitleForComparison(strA);
  const normB = normalizeTitleForComparison(strB);

  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0.0;

  const tokensA = new Set(normA.split(' ').filter((w) => w.length > 2));
  const tokensB = new Set(normB.split(' ').filter((w) => w.length > 2));

  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersectionCount = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersectionCount++;
    }
  }

  const unionCount = new Set([...tokensA, ...tokensB]).size;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * Determines whether two articles represent the same story based on
 * URL match or high headline similarity.
 * 
 * @param {object} artA 
 * @param {object} artB 
 * @returns {boolean}
 */
export function isDuplicateArticle(artA, artB) {
  if (!artA || !artB) return false;

  // 1. Exact or normalized URL match
  const urlA = normalizeArticleUrl(artA.originalUrl || artA.targetUrl);
  const urlB = normalizeArticleUrl(artB.originalUrl || artB.targetUrl);
  if (urlA && urlB && urlA === urlB) {
    return true;
  }

  // 2. High headline similarity match
  const similarity = calculateTitleSimilarity(artA.title, artB.title);
  if (similarity >= 0.75) {
    return true;
  }

  // 3. Same-domain match: If both articles are from the same publisher/domain,
  // Google News and direct RSS often phrase the same news story slightly differently.
  const domainA = normalizeDomain(artA.domain || artA.source);
  const domainB = normalizeDomain(artB.domain || artB.source);
  if (domainA && domainB && domainA === domainB) {
    if (similarity >= 0.25) {
      return true;
    }
    const normA = normalizeTitleForComparison(artA.title);
    const normB = normalizeTitleForComparison(artB.title);
    const wordsA = new Set(normA.split(' ').filter((w) => w.length >= 4));
    const wordsB = new Set(normB.split(' ').filter((w) => w.length >= 4));
    let shared = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) shared++;
    }
    if (shared >= 2) {
      return true;
    }
  }

  return false;
}

/**
 * Merges metadata from two matching articles, preserving the richest fields
 * (e.g. direct publisher links and high-res lead images).
 * 
 * @param {object} primaryArt 
 * @param {object} secondaryArt 
 * @returns {object} Merged article
 */
export function mergeArticleMetadata(primaryArt, secondaryArt) {
  const merged = { ...primaryArt };

  // Prefer direct lead image if primary lacks one
  if (!merged.imageUrl && secondaryArt.imageUrl) {
    merged.imageUrl = secondaryArt.imageUrl;
  }

  // Prefer canonical publisher URL if primary is a Google News wrapper
  if ((!merged.originalUrl || merged.originalUrl.includes('news.google.com')) && secondaryArt.originalUrl) {
    merged.originalUrl = secondaryArt.originalUrl;
    merged.targetUrl = secondaryArt.targetUrl || secondaryArt.originalUrl;
  }

  return merged;
}

/**
 * Weaves primary Google News articles with secondary direct feed articles.
 * 
 * Principles:
 * 1. Preserves top curated lead stories at positions 1-2 for the Hero Cover card.
 * 2. Applies fair-share quotas to each secondary feed (e.g. max 4-6 articles).
 * 3. Deduplicates incoming secondary items against primary stories.
 * 4. Interleaves secondary feeds in a balanced rhythm (2 primary -> 1 secondary).
 * 5. Enforces an anti-clustering constraint (max 2 consecutive stories from the same domain).
 * 
 * @param {Array<object>} primaryArticles - Articles from Google News
 * @param {Array<{ feedConfig: object, articles: Array<object> }>} secondaryFeedGroups - Direct feed groups
 * @param {object} [options={}]
 * @param {number} [options.leadAnchorCount=2] - Number of primary stories to preserve at top
 * @param {number} [options.maxConsecutivePerDomain=2] - Max consecutive stories from same source
 * @param {number} [options.cadenceInterval=2] - Insert 1 secondary story every N primary stories
 * @param {number} [options.maxTotalArticles=50] - Maximum overall feed capacity
 * @returns {Array<object>} Final woven article list
 */
export function weaveFeeds(primaryArticles = [], secondaryFeedGroups = [], options = {}) {
  const {
    leadAnchorCount = 2,
    maxConsecutivePerDomain = 2,
    cadenceInterval = 2,
    maxTotalArticles = 60,
  } = options;

  if (!secondaryFeedGroups || secondaryFeedGroups.length === 0) {
    return (primaryArticles || []).slice(0, maxTotalArticles);
  }

  // Step 1: Prepare deduplicated pool of primary articles
  const primaryPool = [];
  const seenUrls = new Set();

  for (const art of primaryArticles) {
    const normUrl = normalizeArticleUrl(art.originalUrl || art.targetUrl);
    if (!normUrl || !seenUrls.has(normUrl)) {
      if (normUrl) seenUrls.add(normUrl);
      primaryPool.push(art);
    }
  }

  // Step 2: Extract lead anchor stories (Hero + primary lead)
  const result = [];
  const leadAnchors = primaryPool.splice(0, leadAnchorCount);
  leadAnchors.forEach((art) => result.push(art));

  // Step 3: Prepare fair-share capped secondary queues
  // Each feed gets its own queue capped at its configured quota (7-10 articles)
  const feedQueues = [];
  for (const group of secondaryFeedGroups) {
    const feedLimit = group.feedConfig?.maxArticles || 8;
    const cappedItems = [];

    for (const art of group.articles || []) {
      if (cappedItems.length >= feedLimit) break;

      // Check for duplicate against lead stories and already accepted items
      let isDupe = false;
      for (let i = 0; i < result.length; i++) {
        if (isDuplicateArticle(result[i], art)) {
          // Enrich lead/accepted story with direct feed metadata (image, canonical URL)
          result[i] = mergeArticleMetadata(result[i], art);
          isDupe = true;
          break;
        }
      }

      if (!isDupe) {
        for (let i = 0; i < primaryPool.length; i++) {
          if (isDuplicateArticle(primaryPool[i], art)) {
            // Enrich primary pool item with direct feed image if missing
            primaryPool[i] = mergeArticleMetadata(primaryPool[i], art);
            isDupe = true;
            break;
          }
        }
      }

      if (!isDupe) {
        const normUrl = normalizeArticleUrl(art.originalUrl || art.targetUrl);
        if (!normUrl || !seenUrls.has(normUrl)) {
          if (normUrl) seenUrls.add(normUrl);
          cappedItems.push(art);
        }
      }
    }

    if (cappedItems.length > 0) {
      feedQueues.push({ name: group.feedConfig?.name, items: cappedItems });
    }
  }

  // Helper: check if adding an article violates the anti-clustering constraint
  const wouldExceedDomainLimit = (candidateArt) => {
    if (result.length < maxConsecutivePerDomain) return false;
    const candidateDomain = normalizeDomain(candidateArt.domain || candidateArt.source);
    if (!candidateDomain) return false;

    // Check last N articles in result
    for (let i = 1; i <= maxConsecutivePerDomain; i++) {
      const prevArt = result[result.length - i];
      const prevDomain = normalizeDomain(prevArt.domain || prevArt.source);
      if (prevDomain !== candidateDomain) {
        return false;
      }
    }
    return true; // All previous N articles are from the exact same domain
  };

  // Step 4: Interleave secondary stories into primary stream with cadence pacing
  let queueIndex = 0;
  let primaryCountSinceSecondary = 0;

  while ((primaryPool.length > 0 || feedQueues.some((q) => q.items.length > 0)) && result.length < maxTotalArticles) {
    const hasSecondary = feedQueues.some((q) => q.items.length > 0);
    const shouldInsertSecondary = hasSecondary && (primaryCountSinceSecondary >= cadenceInterval || primaryPool.length === 0);

    if (shouldInsertSecondary) {
      // Find the next available secondary item in round-robin order that doesn't violate domain limit
      let pickedArticle = null;
      const initialQueueIndex = queueIndex;
      let searchedQueues = 0;

      while (searchedQueues < feedQueues.length) {
        const currentQueue = feedQueues[queueIndex];
        queueIndex = (queueIndex + 1) % feedQueues.length;
        searchedQueues++;

        if (currentQueue && currentQueue.items.length > 0) {
          const candidate = currentQueue.items[0];
          if (!wouldExceedDomainLimit(candidate)) {
            pickedArticle = currentQueue.items.shift();
            break;
          }
        }
      }

      // If all secondary candidates violated domain clustering, fallback to pulling first available if primary is empty
      if (!pickedArticle && primaryPool.length === 0) {
        for (const q of feedQueues) {
          if (q.items.length > 0) {
            pickedArticle = q.items.shift();
            break;
          }
        }
      }

      if (pickedArticle) {
        result.push(pickedArticle);
        primaryCountSinceSecondary = 0;
        continue;
      }
    }

    // Otherwise, insert next primary article
    if (primaryPool.length > 0) {
      // Find first primary article that doesn't violate domain clustering
      let foundIdx = -1;
      for (let i = 0; i < primaryPool.length; i++) {
        if (!wouldExceedDomainLimit(primaryPool[i])) {
          foundIdx = i;
          break;
        }
      }

      const primaryArt = foundIdx !== -1 ? primaryPool.splice(foundIdx, 1)[0] : primaryPool.shift();
      result.push(primaryArt);
      primaryCountSinceSecondary++;
    } else if (!hasSecondary) {
      break;
    }
  }

  return result.slice(0, maxTotalArticles);
}
