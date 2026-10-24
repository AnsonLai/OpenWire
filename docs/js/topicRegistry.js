/**
 * topicRegistry.js
 * 
 * Manages built-in and user-customized news topics, custom ordering/rearranging,
 * and user-configurable Local Edition settings (defaulting to Vancouver / British Columbia).
 * 
 * SOLID Principles:
 * - Single Responsibility: Topic definition, order, visibility, and local edition persistence.
 * - Open-Closed: Allows topic ordering and custom city/region overrides without breaking contracts.
 */

const STORAGE_KEY_CUSTOM = 'news_user_custom_topics';
const STORAGE_KEY_HIDDEN = 'news_user_hidden_topics';
const STORAGE_KEY_ORDER = 'news_user_topic_order';
const STORAGE_KEY_LOCAL = 'news_user_local_edition';

export const DEFAULT_LOCAL_EDITION = {
  city: 'Vancouver',
  region: 'British Columbia',
};

export const DEFAULT_TOPICS = [
  { id: 'TOP', label: 'Top Stories', file: '/OpenWire/data/news_top.json', url: 'https://news.google.com/rss', isVisible: true, isCustom: false },
  { id: 'LATEST', label: 'Latest', file: '/OpenWire/data/news_latest.json', url: 'https://news.google.com/rss', isVisible: true, isCustom: false },
  { id: 'AI', label: 'AI', file: '/OpenWire/data/news_ai.json', url: 'https://news.google.com/rss/search?q=%22Artificial+Intelligence%22+OR+OpenAI+OR+%22machine+learning%22+OR+AI+when%3A3d',
    keywords: ['artificial intelligence', 'OpenAI', 'AI', 'machine learning', 'ChatGPT'], isVisible: true, isCustom: false },
  { id: 'CANADA', label: 'Canada', file: '/OpenWire/data/news_canada.json', url: 'https://news.google.com/rss?hl=en-CA&gl=CA&ceid=CA:en', isVisible: true, isCustom: false },
  { id: 'VANCOUVER', label: 'Vancouver (Local)', file: '/OpenWire/data/news_vancouver.json', url: 'https://news.google.com/rss/search?q=Vancouver&hl=en-CA&gl=CA&ceid=CA:en', isVisible: true, isCustom: false },
  { id: 'BC', label: 'British Columbia (Local)', file: '/OpenWire/data/news_bc.json', url: 'https://news.google.com/rss/search?q=%22British+Columbia%22&hl=en-CA&gl=CA&ceid=CA:en', isVisible: true, isCustom: false },
  { id: 'BUSINESS', label: 'Business', file: '/OpenWire/data/news_business.json', url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS', isVisible: true, isCustom: false },
  { id: 'POLITICS', label: 'Politics', file: '/OpenWire/data/news_politics.json', url: 'https://news.google.com/rss/search?q=politics+OR+government&hl=en-US&gl=US&ceid=US:en', isVisible: true, isCustom: false },
  { id: 'FINANCE', label: 'Finance', file: '/OpenWire/data/news_finance.json', url: 'https://news.google.com/rss/search?q=financial+markets+OR+investing+OR+banking&hl=en-US&gl=US&ceid=US:en', isVisible: true, isCustom: false },
  { id: 'LIFESTYLE', label: 'Lifestyle', file: '/OpenWire/data/news_lifestyle.json', url: 'https://news.google.com/rss/search?q=lifestyle+OR+fashion+OR+design&hl=en-US&gl=US&ceid=US:en', isVisible: true, isCustom: false },
  { id: 'TECHNOLOGY', label: 'Tech', file: '/OpenWire/data/news_technology.json', url: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY', isVisible: true, isCustom: false },
  { id: 'WORLD', label: 'World', file: '/OpenWire/data/news_world.json', url: 'https://news.google.com/rss/headlines/section/topic/WORLD', isVisible: true, isCustom: false },
  { id: 'SCIENCE', label: 'Science', file: '/OpenWire/data/news_science.json', url: 'https://news.google.com/rss/headlines/section/topic/SCIENCE', isVisible: true, isCustom: false },
  { id: 'ENTERTAINMENT', label: 'Entertainment', file: '/OpenWire/data/news_entertainment.json', url: 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT', isVisible: true, isCustom: false },
  { id: 'SPORTS', label: 'Sports', file: '/OpenWire/data/news_sports.json', url: 'https://news.google.com/rss/headlines/section/topic/SPORTS', isVisible: true, isCustom: false },
];

/**
 * Loads custom topics array from localStorage safely.
 */
function loadCustomTopics() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_CUSTOM) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const seen = new Set(DEFAULT_TOPICS.map((topic) => topic.id));
    return parsed.flatMap((topic) => {
      if (!topic || typeof topic.id !== 'string' || !topic.id.trim()
        || typeof topic.label !== 'string' || !topic.label.trim()) return [];
      const id = topic.id.toUpperCase();
      if (seen.has(id)) return [];
      seen.add(id);
      return [{ ...topic, id, query: typeof topic.query === 'string' ? topic.query : '',
        keywords: Array.isArray(topic.keywords) ? topic.keywords.filter((word) => typeof word === 'string') : parseCommaKeywords(typeof topic.query === 'string' ? topic.query : ''),
        sources: Array.isArray(topic.sources) ? topic.sources.filter((source) => typeof source === 'string') : [],
        url: typeof topic.url === 'string' ? topic.url : '' }];
    });
  } catch {
    return [];
  }
}

/**
 * Loads hidden topic IDs set from localStorage safely.
 */
function loadHiddenTopicIds() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_HIDDEN) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Loads user configured topic ordering from localStorage.
 */
export function loadTopicOrder() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ORDER) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : null;
  } catch {
    return null;
  }
}

/**
 * Saves topic ID ordering to localStorage.
 * 
 * @param {Array<string>} orderArray - Array of topic IDs in desired display order
 */
export function saveTopicOrder(orderArray) {
  if (Array.isArray(orderArray) && typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(orderArray));
  }
}

/**
 * Moves a topic up or down in the ordering sequence.
 * 
 * @param {string} topicId - Topic ID to move
 * @param {'up' | 'down'} direction - 'up' or 'down'
 * @returns {Array<object>} Updated topics list
 */
export function moveTopic(topicId, direction) {
  if (!topicId || !direction) return getAllTopics();
  const all = getAllTopics();
  const idx = all.findIndex((t) => t.id === topicId);
  if (idx === -1) return all;

  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= all.length) return all;

  const currentIds = all.map((t) => t.id);
  const temp = currentIds[idx];
  currentIds[idx] = currentIds[targetIdx];
  currentIds[targetIdx] = temp;

  saveTopicOrder(currentIds);
  return getAllTopics();
}

/**
 * Gets active Local Edition settings (defaulting to Vancouver / British Columbia).
 * 
 * @returns {{ city: string, region: string }}
 */
export function getLocalEdition() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_LOCAL) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.city === 'string' && parsed.city.trim()
        && typeof parsed.region === 'string' && parsed.region.trim()) {
        return { city: parsed.city.trim(), region: parsed.region.trim() };
      }
    }
  } catch {
    // fallback
  }
  return { ...DEFAULT_LOCAL_EDITION };
}

/**
 * Sets user's Local Edition city and region preferences.
 * 
 * @param {string} city - e.g. "Vancouver", "Toronto", "Calgary", "Seattle"
 * @param {string} region - e.g. "British Columbia", "Ontario", "Alberta", "Washington"
 * @returns {{ city: string, region: string }}
 */
export function setLocalEdition(city, region) {
  const cleanCity = (city || '').trim();
  const cleanRegion = (region || '').trim();
  if (!cleanCity || !cleanRegion) {
    throw new Error('City and Region/Province are both required.');
  }

  const edition = { city: cleanCity, region: cleanRegion };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_LOCAL, JSON.stringify(edition));
  }
  return edition;
}

export const PRESET_TOPIC_SUGGESTIONS = [
  { label: 'Health & Medicine', query: 'health OR medicine OR healthcare' },
  { label: 'Politics & Government', query: 'politics OR congress OR white house' },
  { label: 'Crypto & Web3', query: 'cryptocurrency OR bitcoin OR ethereum' },
  { label: 'Space & Astronomy', query: 'SpaceX OR NASA OR astronomy OR space' },
  { label: 'Gaming & Esports', query: 'video games OR gaming OR esports' },
  { label: 'Climate & Energy', query: 'climate change OR clean energy OR solar' },
  { label: 'Electric Vehicles', query: 'electric vehicles OR EV OR Tesla' },
  { label: 'Economy & Markets', query: 'economy OR stock market OR inflation' },
  { label: 'AI & Robotics', query: '"artificial intelligence" OR "machine learning" OR robotics' },
  // Direct Editorial & Gaming Feeds
  { label: 'Polygon', query: 'https://www.polygon.com/rss/index.xml', isRss: true },
  { label: 'Kotaku', query: 'https://kotaku.com/rss', isRss: true },
  { label: 'Eurogamer', query: 'https://www.eurogamer.net/feed', isRss: true },
  { label: 'PC Gamer', query: 'https://www.pcgamer.com/rss/', isRss: true },
  { label: 'Rock Paper Shotgun', query: 'https://www.rockpapershotgun.com/feed', isRss: true },
  { label: 'GamesIndustry.biz', query: 'https://gamesindustry.biz/feed', isRss: true },
  { label: 'Game Developer', query: 'https://www.gamedeveloper.com/rss.xml', isRss: true },
];

/**
 * Parses comma-separated keywords and phrases into clean individual items.
 * Example: "artificial intelligence, OpenAI, machine learning"
 * -> ["artificial intelligence", "OpenAI", "machine learning"]
 * 
 * @param {string|Array<string>} input 
 * @returns {Array<string>} Array of trimmed keywords
 */
export function parseCommaKeywords(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((k) => String(k || '').trim()).filter(Boolean);
  }
  return String(input)
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * Combines an array or comma-separated string of keywords into a Google News query.
 * Multi-word phrases are quoted. Terms are joined with " OR ".
 * Example: ["Vancouver Canucks", "NHL", "hockey"] -> '"Vancouver Canucks" OR NHL OR hockey'
 * 
 * @param {string|Array<string>} keywords
 * @returns {string} Formatted search query
 */
export function formatKeywordsQuery(keywords) {
  const list = parseCommaKeywords(keywords);
  if (list.length === 0) return '';
  return list
    .map((term) => {
      if (/^["'].*["']$/.test(term)) return term;
      if (/\b(OR|AND|NOT)\b/.test(term)) return `(${term})`;
      if (/\s+/.test(term)) return `"${term}"`;
      return term;
    })
    .join(' OR ');
}

/**
 * Constructs a robust Google News RSS search URL with locale parameters
 * to prevent consent redirections and automated converter blocks.
 * 
 * @param {string} query 
 * @returns {string} RSS URL
 */
export function buildGoogleNewsSearchUrl(query) {
  const clean = (query || '').trim();
  if (!clean) return 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean;
  }
  return `https://news.google.com/rss/search?q=${encodeURIComponent(clean)}&hl=en-US&gl=US&ceid=US:en`;
}

/**
 * Returns all topics (defaults + custom), with active visibility flags,
 * custom Local Edition labels/queries, and custom user ordering applied.
 */
export function getAllTopics() {
  const customList = loadCustomTopics();
  const hiddenSet = loadHiddenTopicIds();
  const localEdition = getLocalEdition();

  const isDefaultCity = localEdition.city.toLowerCase() === 'vancouver';
  const isDefaultRegion = ['british columbia', 'bc'].includes(localEdition.region.toLowerCase());

  const defaults = DEFAULT_TOPICS.map((topic) => {
    let label = topic.label;
    let url = topic.url;
    let file = topic.file;

    // Dynamically apply user's Local Edition city and region
    if (topic.id === 'VANCOUVER') {
      label = `${localEdition.city} (Local)`;
      url = isDefaultCity ? topic.url : `https://news.google.com/rss/search?q=${encodeURIComponent(localEdition.city)}&hl=en-CA&gl=CA&ceid=CA:en`;
      file = isDefaultCity ? '/OpenWire/data/news_vancouver.json' : null;
    } else if (topic.id === 'BC') {
      label = `${localEdition.region} (Local)`;
      // Keep the published feed's canonical URL for the default location and
      // aliases. Re-encoding its spaces as %20 instead of + makes newsService
      // mistake it for a custom location and skip the available snapshot.
      url = isDefaultRegion ? topic.url : `https://news.google.com/rss/search?q=${encodeURIComponent('"' + localEdition.region + '"')}&hl=en-CA&gl=CA&ceid=CA:en`;
      file = isDefaultRegion ? '/OpenWire/data/news_bc.json' : null;
    }

    const isVis = !hiddenSet.has(topic.id);
    return {
      ...topic,
      label,
      url,
      file,
      keywords: topic.keywords || [],
      sources: topic.sources || [],
      isVisible: isVis,
      visible: isVis,
      isCustom: false,
    };
  });

  const custom = customList.map((topic) => {
    const isVis = !hiddenSet.has(topic.id);
    return {
      ...topic,
      keywords: topic.keywords || parseCommaKeywords(topic.query),
      sources: topic.sources || [],
      isVisible: isVis,
      visible: isVis,
      isCustom: true,
    };
  });

  const unsorted = [...defaults, ...custom];
  const savedOrder = loadTopicOrder();

  // Apply custom ordering if saved
  if (Array.isArray(savedOrder) && savedOrder.length > 0) {
    const orderMap = new Map();
    savedOrder.forEach((id, index) => orderMap.set(id, index));

    unsorted.sort((a, b) => {
      const indexA = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
      const indexB = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
      return indexA - indexB;
    });
  }

  // A damaged visibility preference must not leave the app without a topic.
  if (unsorted.length && !unsorted.some((topic) => topic.isVisible)) {
    unsorted[0].isVisible = unsorted[0].visible = true;
  }
  return unsorted;
}

/**
 * Returns only topics marked as visible (for rendering topic tabs).
 */
export function getVisibleTopics() {
  return getAllTopics().filter((t) => t.isVisible);
}

/**
 * Finds a topic definition by ID.
 */
export function getTopicById(id) {
  if (!id) return DEFAULT_TOPICS[0];
  const all = getAllTopics();
  return all.find((t) => t.id === id) || all.find((t) => t.id.toUpperCase() === id.toUpperCase()) || DEFAULT_TOPICS[0];
}

/**
 * Adds a new custom topic, saved to localStorage.
 * Supports both legacy signature: addCustomTopic(name, queryOrUrl)
 * and object signature: addCustomTopic({ label, keywords, sources, url })
 * 
 * @param {string|object} nameOrOptions - Topic label or config object
 * @param {string} [queryOrUrl] - Optional keyword query or custom RSS URL (legacy)
 * @returns {object} The created topic
 */
export function addCustomTopic(nameOrOptions, queryOrUrl = '') {
  let label = '';
  let rawKeywords = '';
  let sources = [];
  let explicitUrl = '';

  if (typeof nameOrOptions === 'object' && nameOrOptions !== null) {
    label = (nameOrOptions.label || nameOrOptions.name || '').trim();
    rawKeywords = nameOrOptions.keywords || nameOrOptions.query || '';
    sources = Array.isArray(nameOrOptions.sources)
      ? nameOrOptions.sources
      : (Array.isArray(nameOrOptions.sourceIds) ? nameOrOptions.sourceIds : []);
    explicitUrl = (nameOrOptions.url || '').trim();
  } else {
    label = String(nameOrOptions || '').trim();
    rawKeywords = (queryOrUrl || '').trim();
  }

  if (!label) {
    throw new Error('Topic name is required.');
  }

  const keywordsList = parseCommaKeywords(rawKeywords);
  let computedQuery = '';
  let feedUrl = '';

  if (explicitUrl) {
    feedUrl = explicitUrl;
    computedQuery = '';
  } else if (keywordsList.length > 0) {
    // If multiple keywords separated by commas, format them cleanly
    computedQuery = formatKeywordsQuery(keywordsList);
    feedUrl = buildGoogleNewsSearchUrl(computedQuery);
  } else if (sources.length > 0) {
    // Source-only topic (no keywords, will fetch and weave selected sources directly)
    computedQuery = '';
    feedUrl = '';
  } else {
    // Fallback: use topic label as search query
    computedQuery = label;
    feedUrl = buildGoogleNewsSearchUrl(label);
  }

  const slug = label
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .slice(0, 16);
  const id = `CUSTOM_${slug}_${Date.now().toString().slice(-4)}`;

  const newTopic = {
    id,
    label,
    keywords: keywordsList,
    sources,
    query: computedQuery,
    url: feedUrl,
    file: null,
    isCustom: true,
    isVisible: true,
    visible: true,
  };

  const customList = loadCustomTopics();
  customList.push(newTopic);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(customList));
    // Also append to order array if order exists
    const order = loadTopicOrder();
    if (Array.isArray(order)) {
      order.push(id);
      saveTopicOrder(order);
    }
  }

  return newTopic;
}

/**
 * Deletes a user-added custom topic.
 */
export function deleteCustomTopic(id) {
  if (!id) return;
  const customList = loadCustomTopics().filter((t) => t.id !== id);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(customList));
    // Also remove from hidden list if present
    const hiddenSet = loadHiddenTopicIds();
    if (hiddenSet.has(id)) {
      hiddenSet.delete(id);
      localStorage.setItem(STORAGE_KEY_HIDDEN, JSON.stringify([...hiddenSet]));
    }
    // Remove from order list if present
    const order = loadTopicOrder();
    if (Array.isArray(order)) {
      saveTopicOrder(order.filter((topicId) => topicId !== id));
    }
  }
}

/**
 * Toggles a topic's visibility in the navigation bar.
 */
export function toggleTopicVisibility(id, isVisible) {
  if (!id) return false;
  const hiddenSet = loadHiddenTopicIds();

  if (isVisible) {
    hiddenSet.delete(id);
  } else {
    // Prevent hiding all topics
    const all = getAllTopics();
    const visibleCount = all.filter((t) => t.isVisible).length;
    if (visibleCount <= 1) {
      return false; // At least one topic must remain visible
    }
    hiddenSet.add(id);
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_HIDDEN, JSON.stringify([...hiddenSet]));
  }
  return true;
}

/**
 * Resets all topics, ordering, and local edition to factory defaults.
 */
export function resetTopicsToDefault() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_CUSTOM);
    localStorage.removeItem(STORAGE_KEY_HIDDEN);
    localStorage.removeItem(STORAGE_KEY_ORDER);
    localStorage.removeItem(STORAGE_KEY_LOCAL);
  }
}
