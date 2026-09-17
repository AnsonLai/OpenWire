/**
 * newsService.js
 * 
 * Sourcing headlines from Google News RSS, parsing XML, and matching
 * against the domain strategy registry.
 * 
 * SOLID: Single Responsibility Principle - news sourcing and article metadata transformation.
 */

import { fetchWithProxy } from './fetchProxy.js';
import { getDomainRule, normalizeDomain, STRATEGIES } from './domainRegistry.js';
import { checkArchiveIs, checkWayback } from './archiveService.js';
import { getTopicById } from './topicRegistry.js';
import { getFeedsForTopic, getCustomFeedsForTopic, getFeedsByIds } from './feedRegistry.js';
import { weaveFeeds } from './feedWeaver.js';
import { isNotLogoOrFavicon } from './imageService.js';

// Supported Google News topic feeds
export const TOPICS = {
  TOP: { id: 'TOP', label: 'Top Stories', file: './data/news_top.json', url: 'https://news.google.com/rss' },
  LATEST: { id: 'LATEST', label: 'Latest News', file: './data/news_latest.json', url: 'https://news.google.com/rss' },
  AI: { id: 'AI', label: 'Artificial Intelligence', file: './data/news_ai.json', url: 'https://news.google.com/rss/search?q=%22Artificial+Intelligence%22+OR+AI+when%3A3d' },
  CANADA: { id: 'CANADA', label: 'Canada', file: './data/news_canada.json', url: 'https://news.google.com/rss?hl=en-CA&gl=CA&ceid=CA:en' },
  VANCOUVER: { id: 'VANCOUVER', label: 'Vancouver (Local)', file: './data/news_vancouver.json', url: 'https://news.google.com/rss/search?q=Vancouver&hl=en-CA&gl=CA&ceid=CA:en' },
  BC: { id: 'BC', label: 'British Columbia (Local)', file: './data/news_bc.json', url: 'https://news.google.com/rss/search?q=%22British+Columbia%22&hl=en-CA&gl=CA&ceid=CA:en' },
  BUSINESS: { id: 'BUSINESS', label: 'Business & Markets', file: './data/news_business.json', url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS' },
  TECHNOLOGY: { id: 'TECHNOLOGY', label: 'Technology', file: './data/news_technology.json', url: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY' },
  WORLD: { id: 'WORLD', label: 'World', file: './data/news_world.json', url: 'https://news.google.com/rss/headlines/section/topic/WORLD' },
  SCIENCE: { id: 'SCIENCE', label: 'Science', file: './data/news_science.json', url: 'https://news.google.com/rss/headlines/section/topic/SCIENCE' },
  ENTERTAINMENT: { id: 'ENTERTAINMENT', label: 'Entertainment', file: './data/news_entertainment.json', url: 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT' },
  SPORTS: { id: 'SPORTS', label: 'Sports', file: './data/news_sports.json', url: 'https://news.google.com/rss/headlines/section/topic/SPORTS' },
};

const DEFAULT_RSS_URL = TOPICS.TOP.url;

/**
 * Normalizes title string by stripping trailing publisher suffixes
 * (e.g. "Headline Text - The Globe and Mail" -> "Headline Text")
 * and stripping extra whitespace.
 */
function normalizeTitleForComparison(title) {
  if (!title) return '';
  let clean = title.trim();
  const lastDash = clean.lastIndexOf(' - ');
  if (lastDash > 0) {
    clean = clean.slice(0, lastDash).trim();
  }
  return clean.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Calculates Dice coefficient similarity score between two headline strings (0.0 to 1.0).
 */
export function calculateTitleSimilarity(titleA, titleB) {
  const normA = normalizeTitleForComparison(titleA);
  const normB = normalizeTitleForComparison(titleB);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const wordsA = new Set(normA.split(' ').filter((w) => w.length > 2));
  const wordsB = new Set(normB.split(' ').filter((w) => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  return (2 * intersection) / (wordsA.size + wordsB.size);
}

/**
 * Determines if two article objects represent duplicate stories
 * using canonical URL match or high headline similarity (> 0.68).
 */
export function isDuplicateArticle(articleA, articleB) {
  if (!articleA || !articleB) return false;

  // Direct normalized URL match
  if (articleA.url && articleB.url) {
    const urlA = articleA.url.split('?')[0].replace(/\/$/, '').toLowerCase();
    const urlB = articleB.url.split('?')[0].replace(/\/$/, '').toLowerCase();
    if (urlA === urlB) return true;
  }

  // High title similarity match
  const similarity = calculateTitleSimilarity(articleA.title, articleB.title);
  return similarity >= 0.68;
}

/**
 * Sorts articles chronologically by publication date.
 * 
 * @param {Array<object>} articles
 * @param {'newest' | 'oldest'} [direction='newest']
 * @returns {Array<object>}
 */
export function sortArticlesByDate(articles, direction = 'newest') {
  if (!Array.isArray(articles)) return [];
  return [...articles].sort((a, b) => {
    const timeA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const timeB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return direction === 'oldest' ? timeA - timeB : timeB - timeA;
  });
}

/**
 * Formats a Date object or date string into a clean relative time string.
 * Example: '15m ago', '2h ago', 'yesterday'
 */
export function formatRelativeTime(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffSeconds = Math.floor((now - date) / 1000);

  if (diffSeconds < 60) return 'Just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Cleans a Google News headline. Google News RSS titles usually format
 * as: "Headline Text - Publisher Name". We separate the two cleanly.
 */
function parseTitle(rawTitle, fallbackSource) {
  if (!rawTitle) return { title: 'Untitled', source: fallbackSource || 'News' };

  const lastDashIndex = rawTitle.lastIndexOf(' - ');
  if (lastDashIndex > 0) {
    const title = rawTitle.slice(0, lastDashIndex).trim();
    const source = rawTitle.slice(lastDashIndex + 3).trim();
    return { title, source: source || fallbackSource };
  }

  return { title: rawTitle.trim(), source: fallbackSource || 'News' };
}

export const LIVE_CACHE_PREFIX = 'openwire_live_cache_';

/**
 * Persists live fetched articles for a topic in localStorage so reloads never revert to old static files.
 * 
 * @param {string} topicId 
 * @param {Array<object>} articles 
 */
export function saveLiveCache(topicId, articles) {
  if (typeof localStorage === 'undefined' || !topicId || !Array.isArray(articles) || articles.length === 0) return;
  try {
    const key = `${LIVE_CACHE_PREFIX}${topicId.toUpperCase()}`;
    localStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      articles: articles.slice(0, 70),
    }));
  } catch {
    // ignore storage quota / private browsing errors
  }
}

/**
 * Retrieves persisted live articles for a topic from localStorage.
 * 
 * @param {string} topicId 
 * @returns {{ timestamp: number, articles: Array<object> } | null}
 */
export function getLiveCache(topicId) {
  if (typeof localStorage === 'undefined' || !topicId) return null;
  try {
    const key = `${LIVE_CACHE_PREFIX}${topicId.toUpperCase()}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.timestamp === 'number' && Array.isArray(parsed.articles) && parsed.articles.length > 0) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Fetches headlines for a given topic.
 * Checks fresh client-side live cache first, then live RSS feeds,
 * falling back to pre-rendered Jamstack data when offline.
 * 
 * @param {string} [topicId='TOP']
 * @param {object} [options={}]
 * @param {boolean} [options.forceLive=false] - Force bypass cache to fetch live RSS
 * @param {number} [options.maxStaleMinutes=30] - Staleness threshold before pulling live news
 * @returns {Promise<Array<object>>} List of article objects
 */
export async function fetchTopHeadlines(topicId = 'TOP', options = {}) {
  const { forceLive = false, maxStaleMinutes = 30 } = options;
  const topicConfig = getTopicById(topicId) || TOPICS[topicId] || TOPICS.TOP;
  const isLatest = (topicId || '').toUpperCase() === 'LATEST' || (topicId || '').toUpperCase() === 'BREAKING';

  // Helper to fetch live primary RSS feed and weave in configured secondary feeds
  const fetchLiveStream = async (cachedArticles = []) => {
    const feedUrl = topicConfig.url;

    // Determine secondary feeds to weave in:
    let secondaryConfigs = [];
    if (Array.isArray(topicConfig.sources) && topicConfig.sources.length > 0) {
      secondaryConfigs = getFeedsByIds(topicConfig.sources);
    } else {
      secondaryConfigs = getFeedsForTopic(topicId);
    }

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Case 1: Topic has a primary search/feed URL
    if (feedUrl) {
      const primaryArticles = await fetchLiveFeedItems(feedUrl, topicId);

      // Borrow high-res images from cached articles if primary article lacks one
      if (Array.isArray(cachedArticles) && cachedArticles.length > 0) {
        for (let i = 0; i < primaryArticles.length; i++) {
          if (!primaryArticles[i].imageUrl) {
            const match = cachedArticles.find((c) => c.imageUrl && isDuplicateArticle(primaryArticles[i], c));
            if (match) {
              primaryArticles[i].imageUrl = match.imageUrl;
              if ((!primaryArticles[i].originalUrl || primaryArticles[i].originalUrl.includes('news.google.com')) && match.originalUrl) {
                primaryArticles[i].originalUrl = match.originalUrl;
                primaryArticles[i].targetUrl = match.targetUrl || match.originalUrl;
              }
            }
          }
        }
      }

      if (secondaryConfigs && secondaryConfigs.length > 0) {
        try {
          const settled = await Promise.allSettled(
            secondaryConfigs.map(async (cfg, idx) => {
              if (idx > 0) await delay(idx * 120);
              const items = await fetchLiveFeedItems(cfg.url, topicId, 4500);
              return { feedConfig: cfg, articles: items };
            })
          );

          const secondaryGroups = settled
            .filter((r) => r.status === 'fulfilled' && r.value.articles && r.value.articles.length > 0)
            .map((r) => r.value);

          if (secondaryGroups.length > 0) {
            const woven = weaveFeeds(primaryArticles, secondaryGroups, {
              leadAnchorCount: isLatest ? 0 : 2,
              maxConsecutivePerDomain: 2,
              cadenceInterval: 2,
              maxTotalArticles: 60,
            });

            // Re-check image enrichment from cache after weaving
            if (Array.isArray(cachedArticles) && cachedArticles.length > 0) {
              for (let i = 0; i < woven.length; i++) {
                if (!woven[i].imageUrl) {
                  const match = cachedArticles.find((c) => c.imageUrl && isDuplicateArticle(woven[i], c));
                  if (match) {
                    woven[i].imageUrl = match.imageUrl;
                  }
                }
              }
            }

            const sortedWoven = isLatest ? sortArticlesByDate(woven, 'newest') : woven;
            saveLiveCache(topicId, sortedWoven);
            return sortedWoven;
          }
        } catch {
          // Fallback to primary articles if secondary fetch fails
        }
      }

      const sortedPrimary = isLatest ? sortArticlesByDate(primaryArticles, 'newest') : primaryArticles;
      saveLiveCache(topicId, sortedPrimary);
      return sortedPrimary;
    }

    // Case 2: Source-only topic (no search URL, only selected sources)
    if (secondaryConfigs && secondaryConfigs.length > 0) {
      const settled = await Promise.allSettled(
        secondaryConfigs.map(async (cfg, idx) => {
          if (idx > 0) await delay(idx * 120);
          const items = await fetchLiveFeedItems(cfg.url, topicId, 4500);
          return { feedConfig: cfg, articles: items };
        })
      );

      const secondaryGroups = settled
        .filter((r) => r.status === 'fulfilled' && r.value.articles && r.value.articles.length > 0)
        .map((r) => r.value);

      if (secondaryGroups.length > 0) {
        const primaryAnchor = secondaryGroups[0].articles;
        const restGroups = secondaryGroups.slice(1);
        const woven = weaveFeeds(primaryAnchor, restGroups, {
          leadAnchorCount: 1,
          maxConsecutivePerDomain: 2,
          cadenceInterval: 2,
          maxTotalArticles: 60,
        });
        const sortedWoven = sortArticlesByDate(woven, 'newest');
        saveLiveCache(topicId, sortedWoven);
        return sortedWoven;
      }
    }

    throw new Error(`No feed URL or sources configured for topic "${topicId}".`);
  };

  // Check client-side persistent live cache from previous live fetches
  const existingClientCache = getLiveCache(topicId);
  const clientArticles = existingClientCache?.articles || [];

  // 1. If explicit live refresh requested, attempt live stream immediately
  if (forceLive) {
    try {
      return await fetchLiveStream(clientArticles);
    } catch (liveErr) {
      console.warn({ error: liveErr?.message, topicId }, 'Force-live fetch failed, attempting cached fallback');
      if (clientArticles.length > 0) {
        return clientArticles.map((art) => ({
          ...art,
          timeAgo: formatRelativeTime(art.pubDate),
        }));
      }
    }
  }

  // 2. If client-side live cache exists and is fresh (< maxStaleMinutes old), use it!
  if (existingClientCache && clientArticles.length > 0) {
    const ageMs = Date.now() - (existingClientCache.timestamp || 0);
    const maxAgeMs = maxStaleMinutes * 60 * 1000;
    const isClientStale = ageMs > maxAgeMs;

    if (!isClientStale) {
      // Return fresh client-side live cache without ever touching old static files!
      return clientArticles.map((art) => ({
        ...art,
        timeAgo: formatRelativeTime(art.pubDate),
      }));
    }

    // Client cache is stale: attempt fresh live stream, falling back to client cache if network fails
    try {
      return await fetchLiveStream(clientArticles);
    } catch (liveErr) {
      console.warn({ error: liveErr?.message, topicId }, 'Live RSS fetch for stale client cache failed, using stored client cache');
      return clientArticles.map((art) => ({
        ...art,
        timeAgo: formatRelativeTime(art.pubDate),
      }));
    }
  }

  // 3. Try loading pre-rendered topic data first (first-time visitor or storage empty)
  const candidateFiles = [
    topicConfig.file,
    `./data/news_${topicId.toLowerCase()}.json`,
  ];
  if (topicId === 'TOP') {
    candidateFiles.unshift('./news.json');
  }

  for (const filePath of candidateFiles) {
    if (!filePath) continue;
    try {
      const localRes = await fetch(filePath, { cache: 'no-cache' });
      if (localRes.ok) {
        const localData = await localRes.json();
        if (Array.isArray(localData) && localData.length > 0) {
          // Check if static cache is stale (> maxStaleMinutes old)
          const maxAgeMs = maxStaleMinutes * 60 * 1000;
          const newestTime = localData.reduce((max, art) => {
            const t = art.pubDate ? new Date(art.pubDate).getTime() : 0;
            return !isNaN(t) && t > max ? t : max;
          }, 0);
          const isStale = newestTime > 0 && (Date.now() - newestTime > maxAgeMs);

          // If static data is stale and topic has a live feed URL or sources, attempt live RSS first!
          if (isStale && !forceLive && (topicConfig.url || (Array.isArray(topicConfig.sources) && topicConfig.sources.length > 0))) {
            try {
              return await fetchLiveStream(localData);
            } catch (liveErr) {
              console.warn({ error: liveErr?.message, topicId }, 'Live RSS fetch for stale cache failed, falling back to static file');
            }
          }

          const formattedList = localData.map((art) => {
            const formatted = {
              ...art,
              timeAgo: formatRelativeTime(art.pubDate),
              imageUrl: art.imageUrl || '',
            };
            return applyStrategyToArticle(formatted);
          });

          // If user has assigned custom feeds to this topic, weave them into the pre-rendered pool
          let listToReturn = formattedList;
          const customConfigs = getCustomFeedsForTopic(topicId);
          if (customConfigs && customConfigs.length > 0) {
            try {
              const settled = await Promise.allSettled(
                customConfigs.map(async (cfg) => {
                  const items = await fetchLiveFeedItems(cfg.url, topicId, 4500);
                  return { feedConfig: cfg, articles: items };
                })
              );
              const customGroups = settled
                .filter((r) => r.status === 'fulfilled' && r.value.articles && r.value.articles.length > 0)
                .map((r) => r.value);

              if (customGroups.length > 0) {
                listToReturn = weaveFeeds(formattedList, customGroups, {
                  leadAnchorCount: isLatest ? 0 : 2,
                  maxConsecutivePerDomain: 2,
                  cadenceInterval: 2,
                  maxTotalArticles: 60,
                });
              }
            } catch {
              // fallback to static list
            }
          }

          return isLatest ? sortArticlesByDate(listToReturn, 'newest') : listToReturn;
        }
      }
    } catch {
      // try next file path
    }
  }

  // 4. Fallback: Fetch live primary feed via multi-provider RSS waterfall if not already attempted
  return await fetchLiveStream(clientArticles);
}

/**
 * Normalizes an RSS item across multiple provider formats (feed2json, rss2json).
 */
export function normalizeFeedItem(item, topicId, index) {
  const link = item.url || item.link || '';
  const rawTitle = item.title || '';
  const pubDate = item.date_published || item.pubDate || new Date().toISOString();
  const authorName = (typeof item.author === 'string' ? item.author : item.author?.name) || '';
  const { title, source } = parseTitle(rawTitle, authorName);

  let domain = '';
  if (source && source.includes('.') && !source.includes(' ')) {
    domain = normalizeDomain(source);
  } else if (link && !link.includes('news.google.com')) {
    domain = normalizeDomain(link);
  } else {
    const resolvedFromSource = normalizeDomain(source);
    if (resolvedFromSource) {
      domain = resolvedFromSource;
    } else if (link && !link.includes('news.google.com')) {
      domain = normalizeDomain(link);
    } else {
      domain = '';
    }
  }

  // Safety check: a valid domain must contain a dot, no spaces, and not be news.google.com
  if (!domain || !domain.includes('.') || domain.includes(' ') || domain === 'news.google.com') {
    domain = '';
  }

  // Extract real image from converter response (enclosure, thumbnail, image, attachments, or embedded HTML)
  let imageUrl = item.image || item.banner_image || item.thumbnail || (item.enclosure && (item.enclosure.link || item.enclosure.url)) || (item.attachments && item.attachments[0] && item.attachments[0].url) || '';

  if (!imageUrl) {
    const htmlSnippet = item.content || item.description || item.content_html || item.summary || '';
    if (htmlSnippet && typeof htmlSnippet === 'string') {
      const match = htmlSnippet.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i);
      if (match && match[1]) {
        imageUrl = match[1];
      }
    }
  }

  if (imageUrl && !isNotLogoOrFavicon(imageUrl)) {
    imageUrl = '';
  }

  const baseArticle = {
    id: `art-${topicId}-${index}-${Date.now()}`,
    title,
    source: source || domain || 'News',
    domain,
    originalUrl: link,
    pubDate,
    timeAgo: formatRelativeTime(pubDate),
    needsArchiveCheck: false,
    imageUrl,
  };

  return applyStrategyToArticle(baseArticle);
}

/**
 * Fetches RSS feed items through an automated converter waterfall:
 * 1. api.rss2json.com (reliable CORS-enabled public API)
 * 2. feed2json.org (secondary fallback)
 * 
 * @param {string} feedUrl 
 * @param {string} [topicId='CUSTOM']
 * @param {number} [timeoutMs=6000]
 * @returns {Promise<Array<object>>}
 */
export async function fetchLiveFeedItems(feedUrl, topicId = 'CUSTOM', timeoutMs = 6000) {
  // Provider 1: api.rss2json.com
  try {
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
        return data.items.map((item, idx) => normalizeFeedItem(item, topicId, idx));
      }
    }
  } catch (error) {
    console.warn({ error: error?.message, feedUrl }, 'rss2json attempt failed, falling back to feed2json');
  }

  // Provider 2: feed2json.org
  try {
    const res = await fetch(`https://feed2json.org/convert?url=${encodeURIComponent(feedUrl)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        return data.items.map((item, idx) => normalizeFeedItem(item, topicId, idx));
      }
    }
  } catch (error) {
    console.warn({ error: error?.message, feedUrl }, 'feed2json attempt failed');
  }

  throw new Error('Unable to find any headlines for this topic feed. Please verify the keywords or try another search.');
}

/**
 * Verifies if an RSS feed URL yields at least 1 valid article.
 * Used for live validation to reject invalid topics before adding them.
 * 
 * @param {string} feedUrl 
 * @returns {Promise<{ ok: boolean, count: number, error?: string }>}
 */
export async function verifyFeed(feedUrl) {
  if (!feedUrl) {
    return { ok: false, count: 0, error: 'Feed URL is missing.' };
  }

  try {
    let feedTitle = '';

    // If direct RSS/Atom feed URL, attempt rss2json first with full CORS support
    try {
      const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
          feedTitle = (data.feed?.title || '').trim();
          return { ok: true, count: data.items.length, title: feedTitle || data.items[0]?.author || '' };
        }
      }
    } catch {
      // fallback to multi-provider waterfall
    }

    const items = await fetchLiveFeedItems(feedUrl, 'VERIFY', 5000);
    if (items && items.length > 0) {
      return { ok: true, count: items.length, title: feedTitle || items[0]?.source || '' };
    }
    return { ok: false, count: 0, error: 'No articles were returned for this query or feed.' };
  } catch (err) {
    return { ok: false, count: 0, error: err.message || 'Unable to retrieve headlines.' };
  }
}

/**
 * Constructs the target/bypass URL for a given strategy and original article URL.
 * 
 * @param {string} strategy
 * @param {string} originalUrl
 * @returns {string} Target URL
 */
export function buildStrategyUrl(strategy, originalUrl) {
  if (!originalUrl) return '';
  switch (strategy) {
    case STRATEGIES.DIRECT:
      return originalUrl;

    case STRATEGIES.SMRY:
      return `https://smry.ai/${originalUrl}`;

    case STRATEGIES.REMOVEPAYWALL:
      return `https://www.removepaywall.com/search?url=${encodeURIComponent(originalUrl)}`;

    case STRATEGIES.UNWALL:
      return `https://unwall.app/${originalUrl}`;

    case STRATEGIES.FREEDIUM:
      return `https://freedium-mirror.cfd/${originalUrl}`;

    case STRATEGIES.READER:
      return originalUrl;

    case STRATEGIES.ARCHIVE_IS:
      return `https://archive.is/newest/${originalUrl}`;

    case STRATEGIES.WAYBACK:
      return `https://web.archive.org/web/*/${originalUrl}`;

    default:
      return originalUrl;
  }
}

/**
 * Applies the active bypass strategy to an article object.
 * Recomputes status, badge, targetUrl, and archiveUrl according to current domain rule.
 * 
 * @param {object} article
 * @param {object|null} [customRule=null]
 * @returns {object} Updated article
 */
export function applyStrategyToArticle(article, customRule = null) {
  let domain = article.domain ? normalizeDomain(article.domain) : '';
  if (!domain) {
    const fallbackUrl = article.originalUrl || article.targetUrl || '';
    if (fallbackUrl && !fallbackUrl.includes('news.google.com')) {
      domain = normalizeDomain(fallbackUrl);
    }
  }
  if (domain === 'news.google.com') {
    domain = '';
  }

  const rule = customRule || getDomainRule(domain);
  const originalUrl = article.originalUrl || article.targetUrl;

  const updated = {
    ...article,
    domain,
    originalUrl,
    rule,
  };

  const targetUrl = buildStrategyUrl(rule.strategy, originalUrl);
  updated.targetUrl = targetUrl;

  switch (rule.strategy) {
    case STRATEGIES.DIRECT:
      updated.status = 'free';
      updated.badge = 'Free';
      break;

    case STRATEGIES.SMRY:
      updated.status = 'bypassed';
      updated.badge = 'SMRY';
      break;

    case STRATEGIES.REMOVEPAYWALL:
      updated.status = 'bypassed';
      updated.badge = 'RemovePaywall';
      break;

    case STRATEGIES.UNWALL:
      updated.status = 'bypassed';
      updated.badge = 'UnWall';
      break;

    case STRATEGIES.FREEDIUM:
      updated.status = 'bypassed';
      updated.badge = 'Freedium';
      break;

    case STRATEGIES.READER:
      updated.status = 'bypassed';
      updated.badge = 'Reader';
      break;

    case STRATEGIES.ARCHIVE_IS:
      updated.status = 'bypassed';
      updated.badge = 'Archive.is';
      updated.archiveUrl = targetUrl;
      break;

    case STRATEGIES.WAYBACK:
      updated.status = 'bypassed';
      updated.badge = 'Wayback';
      updated.archiveUrl = targetUrl;
      break;

    default:
      updated.status = 'free';
      updated.badge = 'Free';
      break;
  }

  return updated;
}

/**
 * Resolves the archive status for an article that requires an archive check.
 * Updates status to 'bypassed' (with archive link) or 'locked' (greyed out).
 * 
 * @param {object} article
 * @returns {Promise<object>} The updated article object
 */
export async function resolveArchiveStatus(article) {
  if (!article.needsArchiveCheck) {
    return article;
  }

  const targetUrl = article.originalUrl;
  let archiveResult = null;

  if (article.rule.strategy === STRATEGIES.WAYBACK) {
    archiveResult = await checkWayback(targetUrl);
  } else {
    // Default hard paywall checker: archive.is
    archiveResult = await checkArchiveIs(targetUrl);
  }

  if (archiveResult.available && archiveResult.archiveUrl) {
    article.status = 'bypassed';
    article.badge = 'Archive';
    article.targetUrl = archiveResult.archiveUrl;
  } else {
    // No snapshot found or timed out: mark as locked to grey out, but preserve original link for subscribers
    article.status = 'locked';
    article.badge = 'Locked (No Archive)';
    article.targetUrl = article.originalUrl;
  }

  article.needsArchiveCheck = false;
  return article;
}

/**
 * Extracts a valid HTTP/HTTPS web URL from incoming Web Share Target parameters.
 * Handles explicit url params, text containing URLs, title with URLs, and raw domains.
 * Strips surrounding whitespace and trailing punctuation.
 * 
/**
 * Extracts a target article URL from Web Share Target parameters or raw URLs.
 * Handles explicit url params, embedded URLs in share text/title (Twitter, Reddit, YouTube),
 * full URL strings, URLSearchParams instances, and plain objects.
 * 
 * @param {URLSearchParams|Record<string, string>|string|URL} input
 * @returns {string} Extracted valid article URL or empty string
 */
export function extractSharedUrl(input) {
  if (!input) return '';

  let params = null;
  let directString = '';

  if (typeof input === 'string') {
    const trimmedInput = input.trim();
    if (!trimmedInput) return '';

    // If input is a URL or query string with parameters
    if (trimmedInput.includes('?') || trimmedInput.includes('=')) {
      try {
        const parsed = new URL(trimmedInput, 'https://dummy.local');
        params = parsed.searchParams;

        // Also check hash query (e.g. /#top?text=...)
        if (!params.get('url') && !params.get('text') && parsed.hash && parsed.hash.includes('?')) {
          const hashQuery = parsed.hash.slice(parsed.hash.indexOf('?'));
          params = new URLSearchParams(hashQuery);
        }
      } catch {
        params = new URLSearchParams(trimmedInput.startsWith('?') ? trimmedInput : `?${trimmedInput}`);
      }
    } else {
      directString = trimmedInput;
    }
  } else if (input instanceof URL) {
    params = input.searchParams;
  } else {
    params = input;
  }

  const getParam = (key) => {
    if (!params) return '';
    if (typeof params.get === 'function') {
      return params.get(key) || '';
    }
    return params[key] || '';
  };

  const rawUrl = getParam('url') || getParam('link') || getParam('share_url') || directString;
  const rawText = getParam('text');
  const rawTitle = getParam('title');

  let target = '';

  const cleanCandidate = (candidate) => {
    if (!candidate) return '';
    let c = candidate.trim();
    // Decode if fully URL-encoded (e.g. https%3A%2F%2F...)
    if (/^https?%3A%2F%2F/i.test(c)) {
      try {
        c = decodeURIComponent(c);
      } catch {
        // ignore decode error
      }
    }
    // Strip wrapping quotes, brackets, and markdown links
    c = c.replace(/^[<"'(]+|[>"',;:!?)]+$/g, '');
    return c;
  };

  if (rawUrl) {
    const cleaned = cleanCandidate(rawUrl);
    if (/^https?:\/\//i.test(cleaned)) {
      target = cleaned;
    } else if (cleaned.includes('.') && !cleaned.includes(' ')) {
      target = 'https://' + cleaned;
    }
  }

  if (!target && rawText) {
    // 1. Look for explicit http/https URL in text
    const httpMatch = rawText.match(/https?:\/\/[^\s<>"')]+/i);
    if (httpMatch) {
      target = cleanCandidate(httpMatch[0]);
    } else {
      // 2. Look for bare domain link in text (e.g. "Check out wsj.com/articles/xyz")
      const domainMatch = rawText.match(/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s<>"')]*)?/i);
      if (domainMatch && domainMatch[0].includes('/')) {
        target = 'https://' + cleanCandidate(domainMatch[0]);
      }
    }
  }

  if (!target && rawTitle) {
    const httpMatch = rawTitle.match(/https?:\/\/[^\s<>"')]+/i);
    if (httpMatch) {
      target = cleanCandidate(httpMatch[0]);
    }
  }

  if (target) {
    target = cleanCandidate(target);
    // Sanity check: must be valid http(s) URL with dot in hostname
    try {
      const parsed = new URL(target);
      if (!parsed.hostname || !parsed.hostname.includes('.')) {
        target = '';
      }
    } catch {
      target = '';
    }
  }

  return target;
}

