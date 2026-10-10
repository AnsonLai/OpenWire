/**
 * feedRegistry.js
 * 
 * Declarative registry for specific, high-quality direct RSS and Atom feeds
 * (e.g. BBC News, CBC News, Global News, NYT, CNN, CNBC, Bloomberg, Ars Technica, 
 * The Verge, Gizmodo, Hacker News, Slashdot, Politico, Fox News, Investing.com).
 * 
 * Maps feeds to topics with per-feed fair-share quotas to augment
 * Google News lists without overwhelming the reader.
 * 
 * SOLID: Single Responsibility Principle - feed definitions and topic mappings only.
 */

import { FEED_CATALOG } from './feedCatalog.js';

export const DEFAULT_FEEDS = FEED_CATALOG;

export const GOOGLE_NEWS_SOURCE = {
  id: 'google_news', name: 'Google News', domain: 'news.google.com', url: 'https://news.google.com/rss',
  category: 'News', kind: 'aggregator', topics: [], isPrimary: true, isCustom: false,
};
const SOURCE_PREFERENCES_KEY = 'openwire_disabled_sources_v1';
let sessionDisabledSources = null;
const sessionEnabledSources = new Set();

function sourceKey(source) {
  const value = typeof source === 'string' ? source : source?.isPrimary ? 'google_news' : source?.url;
  if (value === 'google_news') return value;
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'news.google.com' ? 'google_news' : parsed.href;
  } catch { return ''; }
}

export function getDisabledSourceKeys() {
  if (sessionDisabledSources) return [...sessionDisabledSources];
  try {
    const parsed = JSON.parse(localStorage.getItem(SOURCE_PREFERENCES_KEY) || '[]');
    return Array.isArray(parsed) ? [...new Set(parsed.filter(value => typeof value === 'string').map(sourceKey).filter(Boolean))] : [];
  } catch { return []; }
}

export function isSourceEnabled(source) {
  const key = sourceKey(source);
  return (source?.enabled !== false || sessionEnabledSources.has(key)) && !getDisabledSourceKeys().includes(key);
}

// URL keys apply to every use of a feed, even when it has several topic IDs.
export function setSourcesEnabled(sources, enabled) {
  const disabled = new Set(getDisabledSourceKeys());
  const keys = new Set(sources.map(sourceKey).filter(Boolean));
  const custom = loadCustomFeeds();
  const changedCustom = custom.some(feed => keys.has(sourceKey(feed)) && feed.enabled !== enabled);
  let customSaved = true;
  if (changedCustom) customSaved = saveCustomFeeds(custom.map(feed => keys.has(sourceKey(feed)) ? { ...feed, enabled } : feed));
  for (const source of sources) {
    const key = sourceKey(source);
    if (!key) continue;
    if (enabled) { disabled.delete(key); sessionEnabledSources.add(key); }
    else { disabled.add(key); sessionEnabledSources.delete(key); }
  }
  try {
    localStorage.setItem(SOURCE_PREFERENCES_KEY, JSON.stringify([...disabled]));
    sessionDisabledSources = null;
    return customSaved;
  } catch {
    sessionDisabledSources = disabled;
    return false;
  }
}

export function getSourceLibrary() {
  return [GOOGLE_NEWS_SOURCE, ...getAllSources()].map(source => ({ ...source, enabled: isSourceEnabled(source) }));
}

const STORAGE_KEY_CUSTOM_FEEDS = 'news_user_custom_feeds';

/**
 * Loads custom user feeds from localStorage.
 * 
 * @returns {Array<object>} List of custom feed configs
 */
export function loadCustomFeeds() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_CUSTOM_FEEDS) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed.flatMap((feed) => {
      if (!feed || typeof feed.id !== 'string' || !feed.id.trim()
        || typeof feed.name !== 'string' || !feed.name.trim() || typeof feed.url !== 'string') return [];
      try {
        if (!['http:', 'https:'].includes(new URL(feed.url).protocol)) return [];
      } catch { return []; }
      if (seen.has(feed.id)) return [];
      seen.add(feed.id);
      return [{ ...feed, topics: Array.isArray(feed.topics) ? feed.topics.filter((topic) => typeof topic === 'string') : [],
        maxArticles: Math.max(7, Math.min(10, Number(feed.maxArticles) || 8)), enabled: feed.enabled !== false }];
    });
  } catch {
    return [];
  }
}

/**
 * Saves custom user feeds to localStorage.
 * 
 * @param {Array<object>} feeds 
 */
export function saveCustomFeeds(feeds) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_CUSTOM_FEEDS, JSON.stringify(feeds || []));
      return true;
    }
  } catch { /* Callers that add a source must report that it wasn't saved. */ }
  return false;
}

function persistAddedFeed(feeds) {
  if (!saveCustomFeeds(feeds)) throw new Error('This browser could not save your RSS source. Allow site storage and try again.');
}

function validateFeedUrl(url) {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].includes(parsed.protocol)) return;
  } catch { /* Show the same useful message for malformed and unsupported URLs. */ }
  throw new Error('Please enter an RSS or Atom feed URL starting with http:// or https://.');
}

/**
 * Extracts domain name from a URL or hostname safely.
 */
function extractFeedDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Adds or updates a custom direct RSS/Atom feed assigned to one or more topics.
 * 
 * @param {object} params
 * @param {string} params.name - Display name of the publication/feed
 * @param {string} params.url - Direct RSS/Atom feed URL
 * @param {Array<string>|string} params.topics - Topic ID(s) to assign to (e.g. ['TECHNOLOGY', 'TOP'])
 * @param {number} [params.maxArticles=8] - Fair-share quota (clamped between 7 and 10)
 * @returns {object} The created or updated custom feed object
 */
export function addCustomFeed({ name, url, topics = [], maxArticles = 8 }) {
  const cleanName = (name || '').trim();
  const cleanUrl = (url || '').trim();
  if (!cleanName || !cleanUrl) {
    throw new Error('Feed name and URL are required.');
  }
  validateFeedUrl(cleanUrl);

  const topicList = Array.isArray(topics) ? topics : [topics];
  const upperTopics = topicList
    .map((t) => (t || '').toString().trim().toUpperCase())
    .filter(Boolean);

  if (upperTopics.length === 0) {
    throw new Error('At least one topic must be selected to assign this feed.');
  }

  // Enforce fair-share quota between 7 and 10
  const quota = Math.max(7, Math.min(10, Number(maxArticles) || 8));
  const domain = extractFeedDomain(cleanUrl);

  const customFeeds = loadCustomFeeds();
  const existingIndex = customFeeds.findIndex((f) => f.url === cleanUrl);

  if (existingIndex >= 0) {
    // Merge topics into existing feed
    const existing = customFeeds[existingIndex];
    const mergedTopics = Array.from(new Set([...(existing.topics || []), ...upperTopics]));
    const updated = {
      ...existing,
      name: cleanName || existing.name,
      domain: domain || existing.domain,
      topics: mergedTopics,
      maxArticles: quota,
      enabled: true,
      isCustom: true,
    };
    customFeeds[existingIndex] = updated;
    persistAddedFeed(customFeeds);
    return updated;
  }

  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 16);
  const id = `feed_custom_${slug}_${Date.now().toString(36)}`;

  const newFeed = {
    id,
    name: cleanName,
    domain,
    url: cleanUrl,
    topics: upperTopics,
    maxArticles: quota,
    enabled: true,
    isCustom: true,
  };

  customFeeds.push(newFeed);
  persistAddedFeed(customFeeds);
  return newFeed;
}

/**
 * Deletes a custom feed entirely across all topics.
 * 
 * @param {string} feedId 
 */
export function deleteCustomFeed(feedId) {
  if (!feedId) return;
  const filtered = loadCustomFeeds().filter((f) => f.id !== feedId);
  saveCustomFeeds(filtered);
}

/**
 * Unassigns a custom feed from a specific topic.
 * If the feed has no remaining topics, it is deleted completely.
 * 
 * @param {string} feedId 
 * @param {string} topicId 
 */
export function deleteCustomFeedFromTopic(feedId, topicId) {
  if (!feedId || !topicId) return;
  const targetUpper = topicId.toUpperCase();
  const customFeeds = loadCustomFeeds();

  const updated = customFeeds
    .map((feed) => {
      if (feed.id !== feedId) return feed;
      const remaining = (feed.topics || []).filter((t) => t.toUpperCase() !== targetUpper);
      return { ...feed, topics: remaining };
    })
    .filter((feed) => (feed.topics && feed.topics.length > 0));

  saveCustomFeeds(updated);
}

/**
 * Returns all custom user feeds.
 * 
 * @returns {Array<object>}
 */
export function getCustomFeeds() {
  return loadCustomFeeds();
}

/**
 * Returns only custom user feeds assigned to a specific topic ID.
 * 
 * @param {string} topicId 
 * @returns {Array<object>}
 */
export function getCustomFeedsForTopic(topicId) {
  if (!topicId) return [];
  const upper = topicId.toUpperCase();
  return loadCustomFeeds().filter((feed) => isSourceEnabled(feed) && feed.topics?.some((t) => t.toUpperCase() === upper));
}

/**
 * Returns all active secondary feeds mapped to a specific topic ID,
 * combining built-in curated feeds and user-assigned custom feeds.
 * 
 * @param {string} topicId - Uppercase topic ID (e.g. 'TOP', 'CANADA', 'CUSTOM_GAMING')
 * @returns {Array<object>} Matching enabled feed configurations
 */
export function getFeedsForTopic(topicId) {
  if (!topicId) return [];
  const upper = topicId.toUpperCase();
  const defaults = DEFAULT_FEEDS.filter((feed) => isSourceEnabled(feed) && feed.topics.includes(upper));
  const custom = getCustomFeedsForTopic(topicId);
  return [...defaults, ...custom];
}

/**
 * Returns all configured built-in and custom feeds.
 */
export function getAllFeeds() {
  return [...DEFAULT_FEEDS, ...loadCustomFeeds()];
}

/**
 * Returns a deduplicated catalog of all available sources (built-in and custom),
 * ideal for displaying in the RSS Sources catalog and topic source checklists.
 * 
 * @returns {Array<object>}
 */
export function getAllSources() {
  const custom = loadCustomFeeds().map((f) => ({ ...f, isCustom: true }));
  const seenUrls = new Set();
  const sources = [];

  // Custom feeds first so user overrides take precedence
  for (const feed of custom) {
    const key = feed.url || '';
    if (key && !seenUrls.has(key)) {
      seenUrls.add(key);
      sources.push(feed);
    }
  }

  // Built-in feeds
  for (const feed of DEFAULT_FEEDS) {
    const key = feed.url || '';
    if (key && !seenUrls.has(key)) {
      seenUrls.add(key);
      sources.push({ ...feed, isCustom: false });
    }
  }

  return sources;
}

/**
 * Finds a single source by its unique ID across built-in and custom feeds.
 * 
 * @param {string} id 
 * @returns {object|null}
 */
export function getSourceById(id) {
  if (!id) return null;
  const all = getAllSources();
  return all.find((s) => s.id === id) || null;
}

/**
 * Retrieves an array of feed configuration objects given an array of feed IDs.
 * 
 * @param {Array<string>} feedIds 
 * @returns {Array<object>}
 */
export function getFeedsByIds(feedIds) {
  if (!Array.isArray(feedIds) || feedIds.length === 0) return [];
  const all = getAllSources();
  const sourceMap = new Map(all.map((s) => [s.id, s]));
  return feedIds.map((id) => sourceMap.get(id)).filter(feed => feed && isSourceEnabled(feed));
}

/**
 * Adds a new standalone custom source to the sources catalog.
 * 
 * @param {object} params
 * @param {string} params.name - Source name (e.g. "Ars Technica", "Polygon")
 * @param {string} params.url - Direct RSS/Atom feed URL
 * @param {number} [params.maxArticles=8] - Fair-share quota (clamped between 7 and 10)
 * @returns {object} The created or updated source object
 */
export function addCustomSource({ name, url, maxArticles = 8 }) {
  const cleanName = (name || '').trim();
  const cleanUrl = (url || '').trim();
  if (!cleanName || !cleanUrl) {
    throw new Error('Source name and URL are required.');
  }
  validateFeedUrl(cleanUrl);

  const quota = Math.max(7, Math.min(10, Number(maxArticles) || 8));
  const domain = extractFeedDomain(cleanUrl);

  const customFeeds = loadCustomFeeds();
  const existingIndex = customFeeds.findIndex((f) => f.url === cleanUrl);

  if (existingIndex >= 0) {
    const existing = customFeeds[existingIndex];
    const updated = {
      ...existing,
      name: cleanName || existing.name,
      domain: domain || existing.domain,
      maxArticles: quota,
      enabled: true,
      isCustom: true,
    };
    customFeeds[existingIndex] = updated;
    persistAddedFeed(customFeeds);
    return updated;
  }

  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 16);
  const id = `src_custom_${slug}_${Date.now().toString(36)}`;

  const newSource = {
    id,
    name: cleanName,
    domain,
    url: cleanUrl,
    topics: [],
    maxArticles: quota,
    enabled: true,
    isCustom: true,
  };

  customFeeds.push(newSource);
  persistAddedFeed(customFeeds);
  return newSource;
}

/**
 * Deletes a custom source from the sources catalog.
 * 
 * @param {string} sourceId 
 */
export function deleteCustomSource(sourceId) {
  if (!sourceId) return;
  const filtered = loadCustomFeeds().filter((f) => f.id !== sourceId);
  saveCustomFeeds(filtered);
}

/**
 * Resets custom user feeds back to factory defaults.
 */
export function resetFeedsToDefault() {
  sessionDisabledSources = null;
  sessionEnabledSources.clear();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_CUSTOM_FEEDS);
    localStorage.removeItem(SOURCE_PREFERENCES_KEY);
  }
}
