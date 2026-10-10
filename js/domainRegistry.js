/**
 * domainRegistry.js
 * 
 * Manages the ongoing mapping of publisher domains to their bypass strategies.
 * Supports persistent local overrides (localStorage) so users can adjust or add
 * strategies directly from their browser without redeploying.
 * 
 * SOLID: Single Responsibility Principle - only manages domain strategy data and persistence.
 */

// Storage key for user-defined domain overrides
const STORAGE_KEY = 'news_aggregator_domain_rules_v1';

/**
 * Strategy definitions and target URL resolvers.
 */
export const STRATEGIES = {
  DIRECT: 'direct',               // Free public access, link directly
  SMRY: 'smry',                   // Route through smry.ai reader / summary
  REMOVEPAYWALL: 'removepaywall', // Route through removepaywall.com search
  UNWALL: 'unwall',               // Route through unwall.app reader & bypass proxy
  FREEDIUM: 'freedium',           // Route through freedium-mirror.cfd (Medium, NYT, WaPo, Bloomberg, Reuters, Economist, FT)
  READER: 'reader',               // Direct browser bypass via Reader Mode, No-JS, or Googlebot spoof
  ARCHIVE_IS: 'archive_is',       // Check archive.is availability, link if exists, else lock
  WAYBACK: 'wayback',             // Check Wayback Machine availability, else lock
};

/**
 * Publisher domains officially supported by Freedium Mirror.
 */
export const FREEDIUM_SUPPORTED_DOMAINS = [
  'medium.com',
  'nytimes.com',
  'washingtonpost.com',
  'bloomberg.com',
  'reuters.com',
  'economist.com',
  'ft.com',
];

/**
 * Checks if a domain is supported by Freedium Mirror.
 * @param {string} domainInput
 * @returns {boolean}
 */
export function isFreediumSupported(domainInput) {
  const domain = normalizeDomain(domainInput);
  if (!domain) return false;
  return FREEDIUM_SUPPORTED_DOMAINS.some(
    (d) => domain === d || domain.endsWith('.' + d)
  );
}

/**
 * Default curated registry of publisher domains and their proven strategies.
 */
const DEFAULT_RULES = {
  // Free / Open Access Publishers (Direct)
  'bbc.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'BBC News' },
  'bbc.co.uk': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'BBC News' },
  'npr.org': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'NPR' },
  'apnews.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'Associated Press' },
  'reuters.com': { strategy: STRATEGIES.DIRECT, paywall: 'metered', label: 'Reuters' },
  'theguardian.com': { strategy: STRATEGIES.DIRECT, paywall: 'banner', label: 'The Guardian' },
  'cnn.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'CNN' },
  'arstechnica.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'Ars Technica' },
  'theverge.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'The Verge' },
  'techcrunch.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'TechCrunch' },
  'aljazeera.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'Al Jazeera' },
  'cbsnews.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'CBS News' },
  'nbcnews.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'NBC News' },
  'abcnews.go.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'ABC News' },
  'usatoday.com': { strategy: STRATEGIES.DIRECT, paywall: 'metered', label: 'USA Today' },
  'politico.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'Politico' },
  'globalnews.ca': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'Global News' },
  'cbc.ca': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'CBC News' },
  'ctvnews.ca': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'CTV News' },
  'citynews.ca': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'CityNews' },
  'thestar.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'Toronto Star' },
  'cnbc.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'CNBC' },
  'investing.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'Investing.com' },
  'foxnews.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'Fox News' },
  'slashdot.org': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'Slashdot' },
  'ycombinator.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'Hacker News' },
  'youtube.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'YouTube' },
  'gizmodo.com': { strategy: STRATEGIES.DIRECT, paywall: 'none', label: 'Gizmodo' },
  'japantimes.co.jp': { strategy: STRATEGIES.DIRECT, paywall: 'unknown', label: 'The Japan Times' },
  'scmp.com': { strategy: STRATEGIES.DIRECT, paywall: 'unknown', label: 'South China Morning Post' },
  'channelnewsasia.com': { strategy: STRATEGIES.DIRECT, paywall: 'unknown', label: 'CNA' },
  'dw.com': { strategy: STRATEGIES.DIRECT, paywall: 'unknown', label: 'Deutsche Welle' },
  'france24.com': { strategy: STRATEGIES.DIRECT, paywall: 'unknown', label: 'France 24' },
  'lemonde.fr': { strategy: STRATEGIES.DIRECT, paywall: 'metered', label: 'Le Monde' },

  // Metered / Soft Paywalls with standard bypass
  'vancouversun.com': { strategy: STRATEGIES.SMRY, paywall: 'metered', label: 'Vancouver Sun' },
  'theprovince.com': { strategy: STRATEGIES.SMRY, paywall: 'metered', label: 'The Province' },
  'timescolonist.com': { strategy: STRATEGIES.SMRY, paywall: 'metered', label: 'Times Colonist' },
  'nytimes.com': { strategy: STRATEGIES.SMRY, paywall: 'metered', label: 'New York Times' },
  'theatlantic.com': { strategy: STRATEGIES.SMRY, paywall: 'metered', label: 'The Atlantic' },
  'washingtonpost.com': { strategy: STRATEGIES.SMRY, paywall: 'metered', label: 'Washington Post' },
  'medium.com': { strategy: STRATEGIES.FREEDIUM, paywall: 'metered', label: 'Medium' },
  'newyorker.com': { strategy: STRATEGIES.SMRY, paywall: 'metered', label: 'The New Yorker' },
  'businessinsider.com': { strategy: STRATEGIES.REMOVEPAYWALL, paywall: 'soft', label: 'Business Insider' },
  'wired.com': { strategy: STRATEGIES.REMOVEPAYWALL, paywall: 'metered', label: 'Wired' },

  // Hard Paywalls requiring archive verification
  'wsj.com': { strategy: STRATEGIES.ARCHIVE_IS, paywall: 'hard', label: 'Wall Street Journal' },
  'bloomberg.com': { strategy: STRATEGIES.ARCHIVE_IS, paywall: 'hard', label: 'Bloomberg' },
  'ft.com': { strategy: STRATEGIES.ARCHIVE_IS, paywall: 'hard', label: 'Financial Times' },
  'economist.com': { strategy: STRATEGIES.ARCHIVE_IS, paywall: 'hard', label: 'The Economist' },
  'barrons.com': { strategy: STRATEGIES.ARCHIVE_IS, paywall: 'hard', label: "Barron's" },
  'theinformation.com': { strategy: STRATEGIES.ARCHIVE_IS, paywall: 'hard', label: 'The Information' },
  'telegraph.co.uk': { strategy: STRATEGIES.ARCHIVE_IS, paywall: 'hard', label: 'The Telegraph' },
};

/**
 * Known news publishers mapped directly to their official domains.
 * Used when feeds or search engines supply publisher names instead of full URLs.
 */
export const KNOWN_PUBLISHER_DOMAINS = {
  'the guardian': 'theguardian.com',
  'guardian': 'theguardian.com',
  'bbc': 'bbc.com',
  'bbc news': 'bbc.com',
  'the new york times': 'nytimes.com',
  'new york times': 'nytimes.com',
  'nytimes': 'nytimes.com',
  'the washington post': 'washingtonpost.com',
  'washington post': 'washingtonpost.com',
  'wapo': 'washingtonpost.com',
  'the wall street journal': 'wsj.com',
  'wall street journal': 'wsj.com',
  'wsj': 'wsj.com',
  'bloomberg': 'bloomberg.com',
  'bloomberg news': 'bloomberg.com',
  'financial times': 'ft.com',
  'ft': 'ft.com',
  'the economist': 'economist.com',
  'economist': 'economist.com',
  'reuters': 'reuters.com',
  'associated press': 'apnews.com',
  'ap news': 'apnews.com',
  'ap': 'apnews.com',
  'cnn': 'cnn.com',
  'arstechnica': 'arstechnica.com',
  'ars technica': 'arstechnica.com',
  'the verge': 'theverge.com',
  'techcrunch': 'techcrunch.com',
  'wired': 'wired.com',
  'business insider': 'businessinsider.com',
  'insider': 'businessinsider.com',
  'forbes': 'forbes.com',
  'fortune': 'fortune.com',
  'cnbc': 'cnbc.com',
  'cbs news': 'cbsnews.com',
  'cbs': 'cbsnews.com',
  'nbc news': 'nbcnews.com',
  'nbc': 'nbcnews.com',
  'abc news': 'abcnews.go.com',
  'fox news': 'foxnews.com',
  'fox': 'foxnews.com',
  'politico': 'politico.com',
  'al jazeera': 'aljazeera.com',
  'the japan times': 'japantimes.co.jp',
  'japan times': 'japantimes.co.jp',
  'south china morning post': 'scmp.com',
  'scmp': 'scmp.com',
  'cna': 'channelnewsasia.com',
  'channel news asia': 'channelnewsasia.com',
  'deutsche welle': 'dw.com',
  'dw': 'dw.com',
  'france 24': 'france24.com',
  'le monde': 'lemonde.fr',
  'usa today': 'usatoday.com',
  'los angeles times': 'latimes.com',
  'la times': 'latimes.com',
  'chicago tribune': 'chicagotribune.com',
  'the atlantic': 'theatlantic.com',
  'the new yorker': 'newyorker.com',
  'new yorker': 'newyorker.com',
  'time': 'time.com',
  'vox': 'vox.com',
  'slate': 'slate.com',
  'npr': 'npr.org',
  'cbc': 'cbc.ca',
  'cbc news': 'cbc.ca',
  'ctv news': 'ctvnews.ca',
  'ctv': 'ctvnews.ca',
  'global news': 'globalnews.ca',
  'the globe and mail': 'theglobeandmail.com',
  'globe and mail': 'theglobeandmail.com',
  'toronto star': 'thestar.com',
  'the star': 'thestar.com',
  'vancouver sun': 'vancouversun.com',
  'the province': 'theprovince.com',
  'times colonist': 'timescolonist.com',
  'gates notes': 'gatesnotes.com',
  'gatesnotes': 'gatesnotes.com',
  'mckinsey & company': 'mckinsey.com',
  'mckinsey': 'mckinsey.com',
  'ukauthority': 'ukauthority.com',
  'nature': 'nature.com',
  'science': 'science.org',
  'mit technology review': 'technologyreview.com',
  'zdnet': 'zdnet.com',
  'venturebeat': 'venturebeat.com',
  'engadget': 'engadget.com',
  'gizmodo': 'gizmodo.com',
  'slashdot': 'slashdot.org',
  'hacker news': 'news.ycombinator.com',
  'github': 'github.com',
  'medium': 'medium.com',
  'substack': 'substack.com',
  'the register': 'theregister.com',
  'bleepingcomputer': 'bleepingcomputer.com',
  'bleeping computer': 'bleepingcomputer.com',
  "tom's hardware": 'tomshardware.com',
  'pc gamer': 'pcgamer.com',
  'ign': 'ign.com',
  'eurogamer': 'eurogamer.net',
  '9to5mac': '9to5mac.com',
  '9to5google': '9to5google.com',
  'macrumors': 'macrumors.com',
  'android central': 'androidcentral.com',
  'android police': 'androidpolice.com',
  'techradar': 'techradar.com',
  'digital trends': 'digitaltrends.com',
  'quartz': 'qz.com',
  "barron's": 'barrons.com',
  'marketwatch': 'marketwatch.com',
  'the information': 'theinformation.com',
  'the telegraph': 'telegraph.co.uk',
  'daily mail': 'dailymail.co.uk',
  'the independent': 'independent.co.uk',
  'evening standard': 'standard.co.uk',
  'sky news': 'news.sky.com',
  'axios': 'axios.com',
  'semafor': 'semafor.com',
  'puck': 'puck.news',
  'the hill': 'thehill.com',
  'rolling stone': 'rollingstone.com',
  'billboard': 'billboard.com',
  'variety': 'variety.com',
  'deadline': 'deadline.com',
  'the hollywood reporter': 'hollywoodreporter.com',
};

/**
 * Resolves a publisher title or name to an official domain string.
 * @param {string} input
 * @returns {string} Fully-qualified domain or empty string if unresolvable
 */
export function resolvePublisherDomain(input) {
  if (!input || typeof input !== 'string') return '';
  const clean = input.trim().toLowerCase();
  if (KNOWN_PUBLISHER_DOMAINS[clean]) {
    return KNOWN_PUBLISHER_DOMAINS[clean];
  }
  const stripped = clean.replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  if (KNOWN_PUBLISHER_DOMAINS[stripped]) {
    return KNOWN_PUBLISHER_DOMAINS[stripped];
  }
  // If clean is already a valid domain without spaces and has at least one dot
  if (clean.includes('.') && !clean.includes(' ') && !clean.includes('/')) {
    return clean;
  }
  return '';
}

/**
 * Normalizes a URL or hostname down to its primary domain for matching.
 * Example: 'https://edition.cnn.com/world' -> 'cnn.com'
 * Example: 'www.wsj.com' -> 'wsj.com'
 * Example: 'The Guardian' -> 'theguardian.com'
 */
export function normalizeDomain(input) {
  if (!input || typeof input !== 'string') return '';
  let host = input.toLowerCase().trim();

  // Strip protocol and path if present
  try {
    if (host.startsWith('http://') || host.startsWith('https://')) {
      host = new URL(host).hostname;
    }
  } catch {
    // If URL parsing fails, continue with raw host string
  }

  // Strip port if present
  host = host.split(':')[0];

  // Strip leading 'www.'
  if (host.startsWith('www.')) {
    host = host.slice(4);
  }

  // If host contains spaces or has no dot, check if it's a known publisher name
  if (host.includes(' ') || !host.includes('.')) {
    const resolved = resolvePublisherDomain(host);
    if (resolved) return resolved;
    // If it cannot be resolved and contains no dot, it cannot be a valid domain
    if (!host.includes('.')) return '';
  }

  return host;
}

/**
 * Loads custom domain overrides from localStorage.
 */
function loadCustomOverrides() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    let migrated = false;
    for (const [domain, rule] of Object.entries(parsed)) {
      if (rule && rule.strategy === '12ft') {
        rule.strategy = STRATEGIES.READER;
        migrated = true;
      }
    }
    if (migrated) {
      saveCustomOverrides(parsed);
    }
    return parsed;
  } catch (error) {
    console.error({ error }, 'Failed to load custom domain rules from localStorage');
    return {};
  }
}

/**
 * Saves custom domain overrides to localStorage.
 */
function saveCustomOverrides(overrides) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (error) {
    console.error({ error }, 'Failed to save custom domain rules to localStorage');
  }
}

/**
 * Retrieves the matching rule for a domain, checking:
 * 1. Exact match in custom rules
 * 2. Exact match in default rules
 * 3. Suffix match (e.g. news.wsj.com -> wsj.com)
 * 4. Fallback rule (direct for unknown domains)
 */
export function getDomainRule(domainInput) {
  const domain = normalizeDomain(domainInput);
  if (!domain) {
    return { domain: 'unknown', strategy: STRATEGIES.DIRECT, paywall: 'unknown', label: 'Unknown' };
  }

  const customRules = loadCustomOverrides();
  const allMerged = { ...DEFAULT_RULES, ...customRules };

  // 1. Direct match
  if (allMerged[domain]) {
    return { domain, ...allMerged[domain], isCustom: Boolean(customRules[domain]) };
  }

  // 2. Subdomain check (e.g., 'markets.ft.com' -> match 'ft.com')
  for (const [knownDomain, rule] of Object.entries(allMerged)) {
    if (domain.endsWith('.' + knownDomain)) {
      return { domain, ...rule, matchedDomain: knownDomain, isCustom: Boolean(customRules[knownDomain]) };
    }
  }

  // 3. Default fallback: treat unknown sources as direct open web
  return {
    domain,
    strategy: STRATEGIES.DIRECT,
    paywall: 'unknown',
    label: domain,
    isDefault: true,
  };
}

/**
 * Returns all rules (defaults + custom overrides) for management UI.
 */
export function getAllDomainRules() {
  const custom = loadCustomOverrides();
  const merged = { ...DEFAULT_RULES };
  for (const [domain, rule] of Object.entries(custom)) {
    merged[domain] = { ...rule, isCustom: true };
  }
  return merged;
}

/**
 * Adds or updates a domain rule and persists it.
 */
export function setDomainRule(domainInput, { strategy, paywall = 'custom', label = '' }) {
  const domain = normalizeDomain(domainInput);
  if (!domain) return false;

  const custom = loadCustomOverrides();
  custom[domain] = {
    strategy,
    paywall,
    label: label || domain,
    updatedAt: new Date().toISOString(),
  };
  saveCustomOverrides(custom);
  return true;
}

/**
 * Deletes a custom override for a domain (reverting to default if exists).
 */
export function deleteDomainRule(domainInput) {
  const domain = normalizeDomain(domainInput);
  const custom = loadCustomOverrides();
  if (custom[domain]) {
    delete custom[domain];
    saveCustomOverrides(custom);
    return true;
  }
  return false;
}

/**
 * Resets all user customizations back to factory defaults.
 */
export function resetDomainRulesToDefault() {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error({ error }, 'Failed to reset domain rules');
    return false;
  }
}
