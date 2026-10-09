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

function getTopicFeeds(topicId, topicConfig = getTopicById(topicId) || TOPICS[topicId] || TOPICS.TOP) {
  return Array.isArray(topicConfig.sources) && topicConfig.sources.length
    ? getFeedsByIds(topicConfig.sources) : getFeedsForTopic(topicId);
}

function getFeedSignature(topicId) {
  const topic = getTopicById(topicId) || TOPICS[topicId] || TOPICS.TOP;
  return JSON.stringify({ url: topic.url, feeds: getTopicFeeds(topicId, topic).map((feed) => [feed.url, feed.maxArticles]) });
}

/**
 * Persists live fetched articles for a topic in localStorage so reloads never revert to old static files.
 * 
 * @param {string} topicId 
 * @param {Array<object>} articles 
 */
export function saveLiveCache(topicId, articles, failedFeeds = []) {
  if (typeof localStorage === 'undefined' || !topicId || !Array.isArray(articles) || articles.length === 0) return;
  try {
    const key = `${LIVE_CACHE_PREFIX}${topicId.toUpperCase()}`;
    localStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      signature: getFeedSignature(topicId),
      failedFeeds,
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
  const { forceLive = false, maxStaleMinutes = 30, onStatus = () => {} } = options;
  const topicConfig = getTopicById(topicId) || TOPICS[topicId] || TOPICS.TOP;
  const isLatest = ['LATEST', 'BREAKING'].includes(topicId.toUpperCase());
  const maxAgeMs = maxStaleMinutes * 60 * 1000;
  const configuredFeeds = getTopicFeeds(topicId, topicConfig);
  const signature = getFeedSignature(topicId);
  const existingCache = getLiveCache(topicId);
  const clientCache = existingCache?.signature === signature ? existingCache : null;
  const clientArticles = clientCache?.articles || [];
  let liveAttempted = false;
  let liveError = null;

  const formatArticles = (articles) => articles.map((article) => applyStrategyToArticle({
    ...article, timeAgo: formatRelativeTime(article.pubDate), imageUrl: article.imageUrl || '',
  }));
  const report = (source, updatedAt, failedFeeds = [], refreshFailed = false) => {
    onStatus({ source, updatedAt, failedFeeds, refreshFailed });
  };

  // Every source gets a chance even when the primary feed is unavailable.
  const fetchLiveStream = async (cachedArticles = []) => {
    liveAttempted = true;
    const configs = [
      ...(topicConfig.url ? [{ name: 'Primary feed', url: topicConfig.url, primary: true }] : []),
      ...configuredFeeds,
    ].filter((cfg, index, all) => all.findIndex((other) => other.url === cfg.url) === index);
    if (!configs.length) throw new Error(`No feed URL or sources configured for topic "${topicId}".`);
    const settled = new Array(configs.length);
    let next = 0;
    // Limit bursts against public providers while fetching independent sources.
    await Promise.all(Array.from({ length: Math.min(4, configs.length) }, async () => {
      while (next < configs.length) {
        const index = next++;
        const config = configs[index];
        try {
          const articles = await fetchLiveFeedItems(config.url, topicId, 4500);
          settled[index] = { config, articles };
        } catch (error) {
          settled[index] = { config, error: error.message };
        }
      }
    }));
    const available = settled.filter((result) => result.articles?.length);
    const failed = settled.filter((result) => result.error).map((result) => ({
      name: result.config.name, error: result.error,
    }));
    if (!available.length) {
      throw new Error('RSS sources are unavailable right now. Please retry shortly. ' + (failed[0]?.error || ''));
    }
    const primary = available.find((result) => result.config.primary);
    const groups = available.filter((result) => !result.config.primary).map((result) => ({
      feedConfig: result.config, articles: result.articles,
    }));
    let articles = weaveFeeds(primary?.articles || [], groups, {
      leadAnchorCount: isLatest ? 0 : 2, maxConsecutivePerDomain: 2,
      cadenceInterval: 2, maxTotalArticles: 60,
    });
    for (const article of articles) {
      const match = cachedArticles.find((saved) => isDuplicateArticle(article, saved));
      if (match) {
        if (!article.imageUrl) article.imageUrl = match.imageUrl || '';
        if (article.originalUrl?.includes('news.google.com') && match.originalUrl && !match.originalUrl.includes('news.google.com')) {
          article.originalUrl = match.originalUrl;
          Object.assign(article, applyStrategyToArticle(article));
        }
      }
    }
    articles = formatArticles(isLatest ? sortArticlesByDate(articles, 'newest') : articles);
    if (getFeedSignature(topicId) === signature) saveLiveCache(topicId, articles, failed);
    report('live', Date.now(), failed);
    return articles;
  };

  const tryLive = async (saved = []) => {
    try { return await fetchLiveStream(saved); }
    catch (error) { liveError = error; return null; }
  };

  let fallback = clientArticles.length ? { articles: clientArticles, updatedAt: clientCache.timestamp, failedFeeds: clientCache.failedFeeds } : null;
  if (forceLive) {
    const live = await tryLive(clientArticles);
    if (live) return live;
  } else if (clientArticles.length && Date.now() - clientCache.timestamp <= maxAgeMs) {
    report('saved', clientCache.timestamp, clientCache.failedFeeds);
    return formatArticles(clientArticles);
  }

  // Pages snapshots can be newer than a device's stored feed, including when
  // the public RSS services are unavailable. Try them before refreshing live.
  const candidateFiles = [topicConfig.file, `./data/news_${topicId.toLowerCase()}.json`];
  if (topicId === 'TOP') candidateFiles.unshift('./news.json');
  const changedPrimary = TOPICS[topicId] && topicConfig.url !== TOPICS[topicId].url;
  const customized = getCustomFeedsForTopic(topicId).length > 0
    || Array.isArray(topicConfig.sources) && topicConfig.sources.length > 0;
  for (const filePath of new Set(candidateFiles.filter(Boolean))) {
    if (topicConfig.isCustom || changedPrimary) break;
    try {
      const response = await fetch(filePath, { cache: 'no-cache', signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const data = await response.json();
      if (!Array.isArray(data) || !data.length) continue;
      const updatedAt = data.reduce((latest, article) =>
        Math.max(latest, Date.parse(article.fetchedAt || article.pubDate) || 0), 0);
      if (!fallback || updatedAt > fallback.updatedAt) fallback = { articles: data, updatedAt, failedFeeds: [] };
      if (!forceLive && !customized && updatedAt && Date.now() - updatedAt <= maxAgeMs) {
        report('saved', fallback.updatedAt);
        const articles = formatArticles(fallback.articles);
        return isLatest ? sortArticlesByDate(articles, 'newest') : articles;
      }
      // Topic snapshots and news.json are alternate copies of the same feed.
      // Once a usable snapshot is found, avoid downloading it a second time.
      break;
    } catch {
      // Continue to the next snapshot when a file is missing or unreadable.
    }
  }
  if (!liveAttempted) {
    const live = await tryLive(fallback?.articles || []);
    if (live) return live;
  }
  if (fallback) {
    report('saved', fallback.updatedAt, fallback.failedFeeds, !!liveError);
    const articles = formatArticles(fallback.articles);
    return isLatest ? sortArticlesByDate(articles, 'newest') : articles;
  }
  throw liveError || new Error('No headlines are available. Please retry shortly.');
}

/**
 * Normalizes an RSS item across multiple provider formats (feed2json, rss2json).
 */
export function normalizeFeedItem(item, topicId, index, feedTitle = '') {
  const link = item.url || item.link || '';
  const rawTitle = item.title || '';
  const rawDate = item.date_published || item.pubDate || '';
  const pubDate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawDate)
    ? rawDate.replace(' ', 'T') + 'Z' : rawDate;
  const authorName = (typeof item.author === 'string' ? item.author : item.author?.name) || '';
  const { title, source } = parseTitle(rawTitle, feedTitle || authorName);

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

const pendingFeeds = new Map();

async function fetchFeedPayload(feedUrl, timeoutMs) {
  let parsed;
  try { parsed = new URL(feedUrl); } catch { throw new Error('Please enter a valid RSS or Atom feed URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Feed URLs must use HTTP or HTTPS.');
  const deadline = Date.now() + timeoutMs;
  let failure = '';
  try {
    const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`, {
      signal: AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs * 0.7))),
    });
    if (!response.ok) throw new Error(`RSS provider returned HTTP ${response.status}.`);
    const data = await response.json();
    if (data.status !== 'ok') throw new Error(data.message || 'RSS provider could not read this feed.');
    if (Array.isArray(data.items) && data.items.length) return { items: data.items, title: data.feed?.title || '' };
    failure = 'This feed returned no articles.';
  } catch (error) { failure = error.message; }

  // This converter does not allow browser CORS requests itself. Fetch its JSON
  // through the same proxy utility used elsewhere, within the remaining budget.
  const remaining = deadline - Date.now();
  if (remaining > 0) {
    const fallback = await fetchWithProxy(`https://feed2json.org/convert?url=${encodeURIComponent(feedUrl)}`, {
      responseType: 'json', timeoutMs: Math.max(1, Math.floor(remaining / 2)),
      totalTimeoutMs: remaining, directFirst: false,
    });
    if (fallback.ok && Array.isArray(fallback.data?.items) && fallback.data.items.length) {
      return { items: fallback.data.items, title: fallback.data.title || '' };
    }
  }
  throw new Error(`Could not load this RSS feed. ${failure || 'The feed or provider may be unavailable.'}`);
}

/** Fetch feed content once per concurrent URL; normalize for each requesting topic. */
export async function fetchLiveFeedItems(feedUrl, topicId = 'CUSTOM', timeoutMs = 6000) {
  if (!pendingFeeds.has(feedUrl)) {
    const pending = fetchFeedPayload(feedUrl, timeoutMs).finally(() => {
      if (pendingFeeds.get(feedUrl) === pending) pendingFeeds.delete(feedUrl);
    });
    pendingFeeds.set(feedUrl, pending);
  }
  const payload = await pendingFeeds.get(feedUrl);
  const valid = payload.items.filter((item) => {
    try {
      const url = new URL(item.url || item.link || '');
      return ['http:', 'https:'].includes(url.protocol) && typeof item.title === 'string' && item.title.trim();
    } catch { return false; }
  });
  if (!valid.length) throw new Error('This feed has no articles with valid links.');
  const articles = valid.map((item, index) => normalizeFeedItem(item, topicId, index, payload.title));
  Object.defineProperty(articles, 'feedTitle', { value: payload.title });
  return articles;
}

/** Use the same feed-loading path for source validation and actual reading. */
export async function verifyFeed(feedUrl) {
  if (!feedUrl) return { ok: false, count: 0, error: 'Feed URL is missing.' };
  try {
    const articles = await fetchLiveFeedItems(feedUrl, 'VERIFY', 5000);
    return { ok: true, count: articles.length, title: articles.feedTitle || articles[0]?.source || '' };
  } catch (error) {
    return { ok: false, count: 0, error: error.message || 'Unable to retrieve headlines.' };
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

