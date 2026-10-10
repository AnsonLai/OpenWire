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

export const DEFAULT_FEEDS = [
  // --- TOP STORIES & BREAKING NEWS ---
  {
    id: 'cbc_top',
    name: 'CBC News',
    domain: 'cbc.ca',
    url: 'https://www.cbc.ca/cmlink/rss-topstories',
    topics: ['TOP', 'LATEST'],
    maxArticles: 10,
    enabled: true,
  },
  {
    id: 'global_top',
    name: 'Global News',
    domain: 'globalnews.ca',
    url: 'https://globalnews.ca/feed/',
    topics: ['TOP', 'LATEST'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'nyt_top',
    name: 'New York Times',
    domain: 'nytimes.com',
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    topics: ['TOP', 'LATEST'],
    maxArticles: 10,
    enabled: true,
  },
  {
    id: 'bbc_top',
    name: 'BBC News',
    domain: 'bbc.co.uk',
    url: 'https://feeds.bbci.co.uk/news/rss.xml',
    topics: ['TOP', 'LATEST'],
    maxArticles: 10,
    enabled: true,
  },
  {
    id: 'cnbc_top',
    name: 'CNBC',
    domain: 'cnbc.com',
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    topics: ['TOP', 'LATEST'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'fox_top',
    name: 'Fox News',
    domain: 'foxnews.com',
    url: 'http://feeds.foxnews.com/foxnews/latest',
    topics: ['TOP', 'LATEST'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'politico_playbook',
    name: 'Politico',
    domain: 'politico.com',
    url: 'https://rss.politico.com/playbook.xml',
    topics: ['TOP'],
    maxArticles: 7,
    enabled: true,
  },
  {
    id: 'abc_top',
    name: 'ABC News',
    domain: 'abcnews.go.com',
    url: 'https://abcnews.go.com/abcnews/topstories',
    topics: ['TOP', 'LATEST'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'aljazeera_top',
    name: 'Al Jazeera',
    domain: 'aljazeera.com',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    topics: ['TOP', 'LATEST', 'WORLD'],
    maxArticles: 8,
    enabled: true,
  },
  // --- ASIA & INTERNATIONAL PERSPECTIVES ---
  {
    id: 'japan_times_top',
    name: 'The Japan Times',
    domain: 'japantimes.co.jp',
    url: 'https://www.japantimes.co.jp/feed/',
    topics: ['TOP', 'LATEST'],
    maxArticles: 7,
    enabled: true,
  },
  {
    id: 'scmp_asia',
    name: 'South China Morning Post (Asia)',
    domain: 'scmp.com',
    url: 'https://www.scmp.com/rss/3/feed',
    topics: ['TOP', 'LATEST', 'WORLD'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'cna_top',
    name: 'CNA',
    domain: 'channelnewsasia.com',
    url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
    topics: ['TOP', 'LATEST'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'dw_top',
    name: 'Deutsche Welle',
    domain: 'dw.com',
    url: 'https://rss.dw.com/xml/rss-en-all',
    topics: ['TOP', 'LATEST', 'WORLD'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'france24_top',
    name: 'France 24',
    domain: 'france24.com',
    url: 'https://www.france24.com/en/rss',
    topics: ['TOP', 'LATEST', 'WORLD'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'lemonde_world',
    name: 'Le Monde (International)',
    domain: 'lemonde.fr',
    url: 'https://www.lemonde.fr/en/international/rss_full.xml',
    topics: ['WORLD'],
    maxArticles: 7,
    enabled: true,
  },
  {
    id: 'lemonde_europe',
    name: 'Le Monde (Europe)',
    domain: 'lemonde.fr',
    url: 'https://www.lemonde.fr/en/europe/rss_full.xml',
    topics: ['WORLD'],
    maxArticles: 7,
    enabled: true,
  },

  // --- CANADA ---
  {
    id: 'cbc_canada',
    name: 'CBC Canada',
    domain: 'cbc.ca',
    url: 'https://www.cbc.ca/cmlink/rss-canada',
    topics: ['CANADA'],
    maxArticles: 10,
    enabled: true,
  },
  {
    id: 'global_canada',
    name: 'Global News Canada',
    domain: 'globalnews.ca',
    url: 'https://globalnews.ca/feed/',
    topics: ['CANADA'],
    maxArticles: 8,
    enabled: true,
  },

  // --- LOCAL: VANCOUVER & BRITISH COLUMBIA ---
  {
    id: 'cbc_bc',
    name: 'CBC British Columbia',
    domain: 'cbc.ca',
    url: 'https://www.cbc.ca/cmlink/rss-canada-britishcolumbia',
    topics: ['VANCOUVER', 'BC'],
    maxArticles: 10,
    enabled: true,
  },
  {
    id: 'global_bc',
    name: 'Global News BC',
    domain: 'globalnews.ca',
    url: 'https://globalnews.ca/bc/feed/',
    topics: ['VANCOUVER', 'BC'],
    maxArticles: 9,
    enabled: true,
  },

  // --- WORLD ---
  {
    id: 'bbc_world',
    name: 'BBC World',
    domain: 'bbc.co.uk',
    url: 'http://feeds.bbci.co.uk/news/world/rss.xml',
    topics: ['WORLD'],
    maxArticles: 10,
    enabled: true,
  },
  {
    id: 'guardian_world',
    name: 'The Guardian World',
    domain: 'theguardian.com',
    url: 'https://www.theguardian.com/world/rss',
    topics: ['WORLD'],
    maxArticles: 9,
    enabled: true,
  },
  {
    id: 'nyt_world',
    name: 'New York Times World',
    domain: 'nytimes.com',
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    topics: ['WORLD'],
    maxArticles: 9,
    enabled: true,
  },
  {
    id: 'cnn_world',
    name: 'CNN World',
    domain: 'cnn.com',
    url: 'http://rss.cnn.com/rss/edition_world.rss',
    topics: ['WORLD'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'cnbc_world',
    name: 'CNBC International',
    domain: 'cnbc.com',
    url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html',
    topics: ['WORLD'],
    maxArticles: 7,
    enabled: true,
  },
  {
    id: 'cbc_world',
    name: 'CBC World',
    domain: 'cbc.ca',
    url: 'https://www.cbc.ca/cmlink/rss-world',
    topics: ['WORLD'],
    maxArticles: 7,
    enabled: true,
  },
  {
    id: 'abc_world',
    name: 'ABC World News',
    domain: 'abcnews.go.com',
    url: 'https://abcnews.go.com/abcnews/internationalheadlines',
    topics: ['WORLD'],
    maxArticles: 7,
    enabled: true,
  },

  // --- BUSINESS & MARKETS ---
  {
    id: 'investing_all',
    name: 'Investing.com',
    domain: 'investing.com',
    url: 'https://www.investing.com/rss/news.rss',
    topics: ['BUSINESS'],
    maxArticles: 9,
    enabled: true,
  },
  {
    id: 'bloomberg_quicktake',
    name: 'Bloomberg Quicktake',
    domain: 'youtube.com',
    url: 'https://www.youtube.com/feeds/videos.xml?user=Bloomberg',
    topics: ['BUSINESS'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'cnbc_business',
    name: 'CNBC',
    domain: 'cnbc.com',
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    topics: ['BUSINESS'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'bbc_business',
    name: 'BBC Business',
    domain: 'bbc.co.uk',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    topics: ['BUSINESS'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'cbc_business',
    name: 'CBC Business',
    domain: 'cbc.ca',
    url: 'https://www.cbc.ca/cmlink/rss-business',
    topics: ['BUSINESS'],
    maxArticles: 8,
    enabled: true,
  },

  // --- TECHNOLOGY ---
  {
    id: 'ars_technica',
    name: 'Ars Technica',
    domain: 'arstechnica.com',
    url: 'http://feeds.arstechnica.com/arstechnica/index',
    topics: ['TECHNOLOGY'],
    maxArticles: 9,
    enabled: true,
  },
  {
    id: 'the_verge',
    name: 'The Verge',
    domain: 'youtube.com',
    url: 'https://www.youtube.com/feeds/videos.xml?user=TheVerge',
    topics: ['TECHNOLOGY'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'gizmodo',
    name: 'Gizmodo',
    domain: 'gizmodo.com',
    url: 'https://gizmodo.com/rss',
    topics: ['TECHNOLOGY'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'hacker_news',
    name: 'Hacker News',
    domain: 'ycombinator.com',
    url: 'https://news.ycombinator.com/rss',
    topics: ['TECHNOLOGY'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'slashdot',
    name: 'Slashdot',
    domain: 'slashdot.org',
    url: 'http://rss.slashdot.org/Slashdot/slashdotMain',
    topics: ['TECHNOLOGY'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'bbc_tech',
    name: 'BBC Technology',
    domain: 'bbc.co.uk',
    url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
    topics: ['TECHNOLOGY'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'cbc_tech',
    name: 'CBC Tech',
    domain: 'cbc.ca',
    url: 'https://www.cbc.ca/cmlink/rss-technology',
    topics: ['TECHNOLOGY'],
    maxArticles: 7,
    enabled: true,
  },

  // --- SCIENCE ---
  {
    id: 'bbc_science',
    name: 'BBC Science',
    domain: 'bbc.co.uk',
    url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
    topics: ['SCIENCE'],
    maxArticles: 9,
    enabled: true,
  },
  {
    id: 'ars_science',
    name: 'Ars Technica Science',
    domain: 'arstechnica.com',
    url: 'http://feeds.arstechnica.com/arstechnica/index',
    topics: ['SCIENCE'],
    maxArticles: 8,
    enabled: true,
  },

  // --- ENTERTAINMENT ---
  {
    id: 'bbc_entertainment',
    name: 'BBC Entertainment',
    domain: 'bbc.co.uk',
    url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
    topics: ['ENTERTAINMENT'],
    maxArticles: 8,
    enabled: true,
  },
  {
    id: 'abc_entertainment',
    name: 'ABC Entertainment',
    domain: 'abcnews.go.com',
    url: 'https://abcnews.go.com/abcnews/entertainmentheadlines',
    topics: ['ENTERTAINMENT'],
    maxArticles: 8,
    enabled: true,
  },

  // --- SPORTS ---
  {
    id: 'cbc_sports',
    name: 'CBC Sports',
    domain: 'cbc.ca',
    url: 'https://www.cbc.ca/cmlink/rss-sports',
    topics: ['SPORTS'],
    maxArticles: 9,
    enabled: true,
  },
  {
    id: 'abc_sports',
    name: 'ABC Sports',
    domain: 'abcnews.go.com',
    url: 'https://abcnews.go.com/abcnews/sportsheadlines',
    topics: ['SPORTS'],
    maxArticles: 8,
    enabled: true,
  },
];

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
  return loadCustomFeeds().filter((feed) => feed.enabled && feed.topics?.some((t) => t.toUpperCase() === upper));
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
  const defaults = DEFAULT_FEEDS.filter((feed) => feed.enabled && feed.topics.includes(upper));
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
  return feedIds.map((id) => sourceMap.get(id)).filter(Boolean);
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
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_CUSTOM_FEEDS);
  }
}
