/**
 * app.js
 * 
 * Main application orchestrator for the News Aggregator PWA.
 * Renders top headlines immediately, resolves archive checks in the background,
 * manages filtering, and provides an ongoing domain strategy manager.
 * 
 * SOLID: Open-Closed & Dependency Inversion - coordinates services via clean interfaces.
 */

import { fetchTopHeadlines, resolveArchiveStatus, applyStrategyToArticle, verifyFeed, sortArticlesByDate, buildStrategyUrl, extractSharedUrl } from './newsService.js';
import {
  getDomainRule,
  getAllDomainRules,
  setDomainRule,
  deleteDomainRule,
  resetDomainRulesToDefault,
  STRATEGIES,
  normalizeDomain,
  isFreediumSupported
} from './domainRegistry.js';
import {
  getAllTopics,
  getVisibleTopics,
  getTopicById,
  addCustomTopic,
  deleteCustomTopic,
  toggleTopicVisibility,
  resetTopicsToDefault,
  buildGoogleNewsSearchUrl,
  parseCommaKeywords,
  formatKeywordsQuery,
  getLocalEdition,
  setLocalEdition,
  moveTopic,
  saveTopicOrder,
  loadTopicOrder
} from './topicRegistry.js';
import {
  addCustomFeed,
  deleteCustomFeedFromTopic,
  getCustomFeedsForTopic,
  resetFeedsToDefault,
  getAllSources,
  addCustomSource,
  deleteCustomSource,
  getSourceById,
  getFeedsByIds,
} from './feedRegistry.js';
import { initPWA } from './pwa.js';
import { exportSettingsAsJson } from './settingsExport.js';
import { fetchArticleImage } from './imageService.js';

const STORAGE_KEY_CURRENT_TOPIC = 'news_current_topic';
const STORAGE_KEY_SORT_ORDER = 'news_sort_order';
const STORAGE_KEY_QUICK_URL_STRATEGY = 'news_quick_url_strategy';
let quickUrlReturnFocus = null;
let headlinesRequestId = 0;
let activeRefresh = null;
let preferredSortOrder = null;
let hideLockedPreference = false;
try {
  const savedSort = localStorage.getItem(STORAGE_KEY_SORT_ORDER);
  if (['curated', 'newest', 'oldest'].includes(savedSort)) preferredSortOrder = savedSort;
  hideLockedPreference = localStorage.getItem('news_hide_locked') === 'true';
} catch { /* Use the topic default when storage is unavailable. */ }

// Application State
const state = {
  articles: [],
  rawArticles: [],
  currentTopic: 'TOP',
  displayedTopic: null,
  feedUpdatedAt: 0,
  sortOrder: preferredSortOrder || 'curated',
  hideLocked: hideLockedPreference,
  isLoading: false,
};

// Strategy Catalog Definitions for User Switcher
const STRATEGY_DEFINITIONS = [
  {
    id: STRATEGIES.REMOVEPAYWALL,
    title: 'RemovePaywall',
    icon: '🔓',
    desc: 'Multi-engine paywall cleaner (search removepaywall.com)',
    badgeClass: 'badge-bypassed',
  },
  {
    id: STRATEGIES.UNWALL,
    title: 'UnWall',
    icon: '🧱',
    desc: 'Clean reader & paywall bypass proxy (unwall.app)',
    badgeClass: 'badge-bypassed',
  },
  {
    id: STRATEGIES.FREEDIUM,
    title: 'Freedium Mirror',
    icon: '⚡',
    desc: 'Mirror reader strictly for Medium, NYT, WaPo, Bloomberg, Reuters, Economist & FT',
    badgeClass: 'badge-bypassed',
  },
  {
    id: STRATEGIES.ARCHIVE_IS,
    title: 'Archive.is',
    icon: '🏛️',
    desc: 'Web Archive search & cache (best for hard paywalls)',
    badgeClass: 'badge-bypassed',
  },
  {
    id: STRATEGIES.SMRY,
    title: 'SMRY.ai',
    icon: '✨',
    desc: 'AI text summarizer & clean reader (smry.ai)',
    badgeClass: 'badge-bypassed',
  },
  {
    id: STRATEGIES.READER,
    title: 'Reader Mode (No-JS / Bot)',
    icon: '📖',
    desc: 'Direct bypass via Browser Reader Mode, No-JS site settings, or Googlebot spoof',
    badgeClass: 'badge-bypassed',
  },
  {
    id: STRATEGIES.WAYBACK,
    title: 'Wayback Machine',
    icon: '⏳',
    desc: 'Browse older saved versions in the Internet Archive. Snapshots may be out of date or unavailable.',
    badgeClass: 'badge-bypassed',
  },
  {
    id: STRATEGIES.DIRECT,
    title: 'Direct Link',
    icon: '🌐',
    desc: 'Open original article directly (free or subscribed)',
    badgeClass: 'badge-free',
  },
];

// DOM Elements
const elements = {
  feedList: document.getElementById('feedList'),
  feedStatus: document.getElementById('feedStatus'),
  feedUpdateStatus: document.getElementById('feedUpdateStatus'),
  pullRefreshStatus: document.getElementById('pullRefreshStatus'),
  feedSortSelect: document.getElementById('feedSortSelect'),
  topicsBar: document.getElementById('topicsBar'),
  menuToggleBtn: document.getElementById('menuToggleBtn'),
  headerMenuDropdown: document.getElementById('headerMenuDropdown'),
  refreshBtn: document.getElementById('refreshBtn'),
  refreshIcon: document.getElementById('refreshIcon'),
  hideLockedCheckbox: document.getElementById('hideLockedCheckbox'),
  rulesModal: document.getElementById('rulesModal'),
  openRulesBtn: document.getElementById('openRulesBtn'),
  closeRulesBtn: document.getElementById('closeRulesBtn'),
  rulesTableBody: document.getElementById('rulesTableBody'),
  addRuleForm: document.getElementById('addRuleForm'),
  inputDomain: document.getElementById('inputDomain'),
  selectStrategy: document.getElementById('selectStrategy'),
  resetRulesBtn: document.getElementById('resetRulesBtn'),
  // Topic Settings Modal & Tabs
  openTopicsBtn: document.getElementById('openTopicsBtn'),
  topicsModal: document.getElementById('topicsModal'),
  closeTopicsBtn: document.getElementById('closeTopicsBtn'),
  saveTopicsBtn: document.getElementById('saveTopicsBtn'),
  tabBtnTopics: document.getElementById('tabBtnTopics'),
  tabBtnNewTopic: document.getElementById('tabBtnNewTopic'),
  tabBtnSources: document.getElementById('tabBtnSources'),
  tabBtnLocal: document.getElementById('tabBtnLocal'),
  tabPanelTopics: document.getElementById('tabPanelTopics'),
  tabPanelNewTopic: document.getElementById('tabPanelNewTopic'),
  tabPanelSources: document.getElementById('tabPanelSources'),
  tabPanelLocal: document.getElementById('tabPanelLocal'),
  modalTabBtns: document.querySelectorAll('.modal-tab-btn'),
  modalTabPanels: document.querySelectorAll('.modal-tab-panel'),
  // Topics Bar Tab
  topicsTableBody: document.getElementById('topicsTableBody'),
  resetTopicsBtn: document.getElementById('resetTopicsBtn'),
  // New Topic Tab
  addNewTopicForm: document.getElementById('addNewTopicForm'),
  selectTopicPreset: document.getElementById('selectTopicPreset'),
  inputNewTopicLabel: document.getElementById('inputNewTopicLabel'),
  inputNewTopicKeywords: document.getElementById('inputNewTopicKeywords'),
  btnSelectAllSources: document.getElementById('btnSelectAllSources'),
  btnClearAllSources: document.getElementById('btnClearAllSources'),
  inputTopicSourceSearch: document.getElementById('inputTopicSourceSearch'),
  topicSourcesChecklist: document.getElementById('topicSourcesChecklist'),
  newTopicFormError: document.getElementById('newTopicFormError'),
  newTopicSubmitBtn: document.getElementById('newTopicSubmitBtn'),
  newTopicBtnSpinner: document.getElementById('newTopicBtnSpinner'),
  newTopicBtnText: document.getElementById('newTopicBtnText'),
  // RSS Sources Tab
  addNewSourceForm: document.getElementById('addNewSourceForm'),
  inputNewSourceName: document.getElementById('inputNewSourceName'),
  inputNewSourceUrl: document.getElementById('inputNewSourceUrl'),
  newSourceFormError: document.getElementById('newSourceFormError'),
  newSourceSubmitBtn: document.getElementById('newSourceSubmitBtn'),
  newSourceBtnSpinner: document.getElementById('newSourceBtnSpinner'),
  newSourceBtnText: document.getElementById('newSourceBtnText'),
  sourcesCountBadge: document.getElementById('sourcesCountBadge'),
  inputSourceCatalogSearch: document.getElementById('inputSourceCatalogSearch'),
  sourcesCatalogList: document.getElementById('sourcesCatalogList'),
  // Local Edition Tab
  selectLocalPreset: document.getElementById('selectLocalPreset'),
  inputLocalCity: document.getElementById('inputLocalCity'),
  inputLocalRegion: document.getElementById('inputLocalRegion'),
  saveLocalBtn: document.getElementById('saveLocalBtn'),
  // Settings Export
  exportSettingsBtn: document.getElementById('exportSettingsBtn'),
  modalExportTopicsBtn: document.getElementById('modalExportTopicsBtn'),
  modalExportRulesBtn: document.getElementById('modalExportRulesBtn'),
  loadingState: document.getElementById('loadingState'),
  errorState: document.getElementById('errorState'),
  errorMessage: document.getElementById('errorMessage'),
  // Quick Strategy Switcher Modal
  strategySwitcherModal: document.getElementById('strategySwitcherModal'),
  closeSwitcherBtn: document.getElementById('closeSwitcherBtn'),
  closeSwitcherDoneBtn: document.getElementById('closeSwitcherDoneBtn'),
  switcherDomainName: document.getElementById('switcherDomainName'),
  switcherFavicon: document.getElementById('switcherFavicon'),
  switcherCurrentStatus: document.getElementById('switcherCurrentStatus'),
  strategyOptionsList: document.getElementById('strategyOptionsList'),
  // Quick Article URL Opener Modal
  openQuickUrlBtn: document.getElementById('openQuickUrlBtn'),
  quickUrlModal: document.getElementById('quickUrlModal'),
  closeQuickUrlBtn: document.getElementById('closeQuickUrlBtn'),
  closeQuickUrlDoneBtn: document.getElementById('closeQuickUrlDoneBtn'),
  quickUrlForm: document.getElementById('quickUrlForm'),
  inputQuickUrl: document.getElementById('inputQuickUrl'),
  quickUrlPasteBtn: document.getElementById('quickUrlPasteBtn'),
  quickUrlClearBtn: document.getElementById('quickUrlClearBtn'),
  quickUrlStrategySelect: document.getElementById('quickUrlStrategySelect'),
  quickUrlOpenBtn: document.getElementById('quickUrlOpenBtn'),
  quickUrlToolDescription: document.getElementById('quickUrlToolDescription'),
  quickUrlDomainBanner: document.getElementById('quickUrlDomainBanner'),
  quickUrlError: document.getElementById('quickUrlError'),
  quickUrlFavicon: document.getElementById('quickUrlFavicon'),
  quickUrlDomainName: document.getElementById('quickUrlDomainName'),
  quickUrlStrategyBadge: document.getElementById('quickUrlStrategyBadge'),
  quickUrlRuleSourceTag: document.getElementById('quickUrlRuleSourceTag'),
  quickUrlRememberCheck: document.getElementById('quickUrlRememberCheck'),
  quickUrlRememberDomain: document.getElementById('quickUrlRememberDomain'),
  // Floating Toast
  appToast: document.getElementById('appToast'),
  toastMessage: document.getElementById('toastMessage'),
  toastActionLink: document.getElementById('toastActionLink'),
  // Editorial Section Header
  editorialHeading: document.getElementById('editorialHeading'),
  editorialDate: document.getElementById('editorialDate'),
};

/**
 * Helper: Escapes HTML characters safely.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Safely builds a favicon URL for a domain, ensuring domain contains a dot and no spaces.
 * Returns empty string if domain is invalid, preventing 404 console errors.
 * @param {string} domain
 * @param {number} [size=32]
 * @returns {string}
 */
export function getFaviconUrl(domain, size = 32) {
  if (!domain || typeof domain !== 'string') return '';
  const clean = normalizeDomain(domain);
  if (!clean || !clean.includes('.') || clean.includes(' ') || clean.includes('/')) return '';
  return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${encodeURIComponent(clean)}&size=${size}`;
}

/**
 * Generates fallback media HTML when an article image is absent or fails to load.
 * @param {string} domain
 * @param {string} title
 * @returns {string}
 */
function renderFallbackMedia(domain, title) {
  const favUrl = getFaviconUrl(domain, 64);
  if (favUrl) {
    return `
      <div class="news-card-fallback-media">
        <img class="fallback-favicon" src="${favUrl}" alt="" loading="lazy" onerror="this.style.display='none'">
      </div>
    `;
  }
  const initial = escapeHtml((domain || title || 'N').charAt(0).toUpperCase());
  return `
    <div class="news-card-fallback-media">
      <div class="fallback-favicon-placeholder">${initial}</div>
    </div>
  `;
}

/**
 * Helper: Creates an interactive strategy switcher badge button for a card.
 */
function createStrategyBadge(article, isHero = false) {
  const badgeBtn = document.createElement('button');
  badgeBtn.type = 'button';
  badgeBtn.className = `badge badge-${article.status} badge-action ${isHero ? 'badge-hero' : ''}`;
  badgeBtn.setAttribute('data-badge-for', article.id);
  badgeBtn.setAttribute('title', `Change bypass rule for ${article.domain} (auto-saves)`);
  badgeBtn.setAttribute('aria-label', `Change bypass rule for ${article.domain}`);

  const badgeText = document.createElement('span');
  badgeText.className = 'badge-text';
  badgeText.textContent = article.badge;

  const caretSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  caretSvg.setAttribute('class', 'badge-caret');
  caretSvg.setAttribute('viewBox', '0 0 24 24');
  caretSvg.setAttribute('width', '10');
  caretSvg.setAttribute('height', '10');
  caretSvg.setAttribute('fill', 'none');
  caretSvg.setAttribute('stroke', 'currentColor');
  caretSvg.setAttribute('stroke-width', '2.5');
  caretSvg.innerHTML = '<path d="m6 9 6 6 6-6"></path>';

  badgeBtn.appendChild(badgeText);
  badgeBtn.appendChild(caretSvg);

  badgeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openStrategySwitcher(article);
  });

  return badgeBtn;
}

// Bounded queue for image resolution tasks (max 2 concurrent, 200ms spacing)
const imageResolutionQueue = [];
let activeImageResolutions = 0;
const MAX_CONCURRENT_RESOLUTIONS = 2;

function enqueueImageResolution(task) {
  imageResolutionQueue.push(task);
  processImageResolutionQueue();
}

function processImageResolutionQueue() {
  while (activeImageResolutions < MAX_CONCURRENT_RESOLUTIONS && imageResolutionQueue.length > 0) {
    const nextTask = imageResolutionQueue.shift();
    activeImageResolutions++;
    nextTask().finally(() => {
      activeImageResolutions--;
      setTimeout(processImageResolutionQueue, 200);
    });
  }
}

// Viewport observer: only triggers resolution when card is near the viewport
const cardImageObserver = (typeof window !== 'undefined' && 'IntersectionObserver' in window)
  ? new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const target = entry.target;
          observer.unobserve(target);
          if (target._resolveImageTask) {
            enqueueImageResolution(target._resolveImageTask);
            delete target._resolveImageTask;
          }
        }
      }
    }, { rootMargin: '300px 0px' })
  : null;

/**
 * Asynchronously attempts to resolve a missing or failed editorial image for a card
 * without blocking UI rendering. Fades in the resolved image when found.
 * 
 * @param {object} article - The article record
 * @param {HTMLElement} container - The media container or card element
 * @param {string} imgClassName - Class name to apply to the resolved <img>
 * @param {object} [options]
 * @param {boolean} [options.isHero=false]
 * @param {boolean} [options.isBanner=false]
 */
function resolveCardImage(article, container, imgClassName, options = {}) {
  const targetUrl = article.originalUrl || article.targetUrl;
  if (!targetUrl || targetUrl.includes('news.google.com') || targetUrl.includes('youtube.com')) {
    return;
  }

  const task = async () => {
    try {
      const resolvedUrl = await fetchArticleImage(targetUrl);
      if (!resolvedUrl || !container || !container.isConnected) {
        return;
      }

      // Update article record
      article.imageUrl = resolvedUrl;

      // Preload image before DOM insertion
      const preloader = new Image();
      preloader.onload = () => {
        if (!container || !container.isConnected) return;

        if (options.isHero || options.isBanner) {
          const mediaClass = options.isHero ? 'flip-hero-media' : 'flip-banner-media';
          let media = container.querySelector(`.${mediaClass}`);
          if (!media) {
            media = document.createElement('div');
            media.className = mediaClass;
            const overlay = container.querySelector(options.isHero ? '.flip-hero-overlay' : '.flip-banner-overlay');
            if (overlay) {
              container.insertBefore(media, overlay);
            } else {
              container.insertBefore(media, container.firstChild);
            }
          }
          media.style.display = '';
          media.innerHTML = '';
          const img = document.createElement('img');
          img.className = imgClassName;
          img.src = resolvedUrl;
          img.alt = article.title;
          img.style.opacity = '0';
          img.style.transition = 'opacity 0.4s ease-in-out';
          media.appendChild(img);
          requestAnimationFrame(() => { img.style.opacity = '1'; });
        } else {
          container.innerHTML = '';
          const img = document.createElement('img');
          img.className = imgClassName;
          img.src = resolvedUrl;
          img.alt = article.title;
          img.loading = 'lazy';
          img.decoding = 'async';
          img.style.opacity = '0';
          img.style.transition = 'opacity 0.4s ease-in-out';
          container.appendChild(img);
          requestAnimationFrame(() => { img.style.opacity = '1'; });
        }
      };
      preloader.src = resolvedUrl;
    } catch {
      // Gracefully ignore failures; fallback favicon remains visible
    }
  };

  // If hero card, resolve with high priority immediately via queue
  if (options.isHero) {
    enqueueImageResolution(task);
    return;
  }

  // If IntersectionObserver is available, wait until card is within 300px of viewport
  if (cardImageObserver && container) {
    container._resolveImageTask = task;
    cardImageObserver.observe(container);
  } else {
    enqueueImageResolution(task);
  }
}

/**
 * Creates the signature Flipboard Hero Cover Story card.
 */
function createFlipHeroCard(article, topicLabel) {
  const card = document.createElement('article');
  card.id = article.id;
  card.className = `flip-hero news-card--${article.status}`;
  if (article.status === 'locked' && state.hideLocked) {
    card.classList.add('news-card--hidden');
  }

  // Cover Image Media
  if (article.imageUrl) {
    const media = document.createElement('div');
    media.className = 'flip-hero-media';
    const img = document.createElement('img');
    img.className = 'flip-hero-img';
    img.src = article.imageUrl;
    img.alt = article.title;
    img.loading = 'eager';
    img.decoding = 'async';
    img.onerror = () => {
      media.style.display = 'none';
      resolveCardImage(article, card, 'flip-hero-img', { isHero: true });
    };
    media.appendChild(img);
    card.appendChild(media);
  } else {
    resolveCardImage(article, card, 'flip-hero-img', { isHero: true });
  }

  // Vignette gradient overlay
  const overlay = document.createElement('div');
  overlay.className = 'flip-hero-overlay';
  card.appendChild(overlay);

  // Content overlaid on bottom
  const content = document.createElement('div');
  content.className = 'flip-hero-content';

  // Pastel Green Tag Pill
  const tag = document.createElement('span');
  tag.className = 'flip-tag';
  tag.textContent = `#${(topicLabel || 'TOP STORIES').toUpperCase()}`;
  content.appendChild(tag);

  // Title Link
  const titleLink = document.createElement('a');
  titleLink.className = 'flip-hero-title';
  titleLink.textContent = article.title;
  titleLink.setAttribute('data-link-for', article.id);
  const destinationUrl = article.targetUrl || article.originalUrl;
  if (destinationUrl) {
    titleLink.href = destinationUrl;
    titleLink.target = '_self';
    titleLink.rel = 'noopener noreferrer';
  }
  content.appendChild(titleLink);

  // Meta row
  const metaRow = document.createElement('div');
  metaRow.className = 'flip-hero-meta';

  const sourceGroup = document.createElement('div');
  sourceGroup.className = 'flip-hero-source-group';

  const faviconImg = document.createElement('img');
  faviconImg.className = 'source-favicon';
  const favUrl = getFaviconUrl(article.domain, 32);
  if (favUrl) {
    faviconImg.src = favUrl;
    faviconImg.onerror = () => { faviconImg.style.display = 'none'; };
  } else {
    faviconImg.style.display = 'none';
  }
  faviconImg.alt = '';
  faviconImg.loading = 'lazy';
  faviconImg.width = 16;
  faviconImg.height = 16;

  const sourceSpan = document.createElement('span');
  sourceSpan.className = 'news-card-source';
  sourceSpan.textContent = article.source || article.domain;

  const timeSpan = document.createElement('span');
  timeSpan.className = 'flip-hero-time';
  timeSpan.textContent = article.timeAgo ? `• ${article.timeAgo}` : '';

  sourceGroup.appendChild(faviconImg);
  sourceGroup.appendChild(sourceSpan);
  sourceGroup.appendChild(timeSpan);

  const badgeBtn = createStrategyBadge(article, true);

  metaRow.appendChild(sourceGroup);
  metaRow.appendChild(badgeBtn);
  content.appendChild(metaRow);

  card.appendChild(content);

  // Clicking anywhere on card navigates in same tab (unless clicking buttons/badges)
  card.addEventListener('click', (e) => {
    if (e.target.closest('button, .badge-action, a')) return;
    const dest = article.targetUrl || article.originalUrl;
    if (dest) window.location.href = dest;
  });

  return card;
}

/**
 * Creates a Flipboard 2-column feature tile card.
 */
function createFlipTileCard(article) {
  const card = document.createElement('article');
  card.id = article.id;
  card.className = `flip-tile news-card--${article.status}`;
  if (article.status === 'locked' && state.hideLocked) {
    card.classList.add('news-card--hidden');
  }

  // Top Media
  const media = document.createElement('div');
  media.className = 'flip-tile-media';
  if (article.imageUrl) {
    const img = document.createElement('img');
    img.className = 'flip-tile-img';
    img.src = article.imageUrl;
    img.alt = article.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => {
      media.innerHTML = renderFallbackMedia(article.domain, article.title);
      resolveCardImage(article, media, 'flip-tile-img');
    };
    media.appendChild(img);
  } else {
    media.innerHTML = renderFallbackMedia(article.domain, article.title);
    resolveCardImage(article, media, 'flip-tile-img');
  }
  card.appendChild(media);

  // Body below
  const body = document.createElement('div');
  body.className = 'flip-tile-body';

  const titleLink = document.createElement('a');
  titleLink.className = 'flip-tile-title';
  titleLink.textContent = article.title;
  titleLink.setAttribute('data-link-for', article.id);
  const destinationUrl = article.targetUrl || article.originalUrl;
  if (destinationUrl) {
    titleLink.href = destinationUrl;
    titleLink.target = '_self';
    titleLink.rel = 'noopener noreferrer';
  }
  body.appendChild(titleLink);

  const metaRow = document.createElement('div');
  metaRow.className = 'flip-tile-meta';

  const sourceGroup = document.createElement('div');
  sourceGroup.className = 'news-card-source-group';

  const faviconImg = document.createElement('img');
  faviconImg.className = 'source-favicon';
  const tileFavUrl = getFaviconUrl(article.domain, 32);
  if (tileFavUrl) {
    faviconImg.src = tileFavUrl;
    faviconImg.onerror = () => { faviconImg.style.display = 'none'; };
  } else {
    faviconImg.style.display = 'none';
  }
  faviconImg.alt = '';
  faviconImg.loading = 'lazy';
  faviconImg.width = 14;
  faviconImg.height = 14;

  const sourceSpan = document.createElement('span');
  sourceSpan.className = 'news-card-source';
  sourceSpan.textContent = article.source || article.domain;

  sourceGroup.appendChild(faviconImg);
  sourceGroup.appendChild(sourceSpan);

  const badgeBtn = createStrategyBadge(article, false);

  metaRow.appendChild(sourceGroup);
  metaRow.appendChild(badgeBtn);
  body.appendChild(metaRow);

  card.appendChild(body);

  // Clicking anywhere on card navigates in same tab (unless clicking buttons/badges)
  card.addEventListener('click', (e) => {
    if (e.target.closest('button, .badge-action, a')) return;
    const dest = article.targetUrl || article.originalUrl;
    if (dest) window.location.href = dest;
  });

  return card;
}

/**
 * Creates a Flipboard Magazine Row card.
 */
function createFlipRowCard(article) {
  const card = document.createElement('article');
  card.id = article.id;
  card.className = `flip-row news-card--${article.status}`;
  if (article.status === 'locked' && state.hideLocked) {
    card.classList.add('news-card--hidden');
  }

  // Left column body
  const body = document.createElement('div');
  body.className = 'flip-row-body';

  const titleLink = document.createElement('a');
  titleLink.className = 'flip-row-title';
  titleLink.textContent = article.title;
  titleLink.setAttribute('data-link-for', article.id);
  const destinationUrl = article.targetUrl || article.originalUrl;
  if (destinationUrl) {
    titleLink.href = destinationUrl;
    titleLink.target = '_self';
    titleLink.rel = 'noopener noreferrer';
  }
  body.appendChild(titleLink);

  const metaRow = document.createElement('div');
  metaRow.className = 'flip-row-meta';

  const sourceGroup = document.createElement('div');
  sourceGroup.className = 'news-card-source-group';

  const faviconImg = document.createElement('img');
  faviconImg.className = 'source-favicon';
  const rowFavUrl = getFaviconUrl(article.domain, 32);
  if (rowFavUrl) {
    faviconImg.src = rowFavUrl;
    faviconImg.onerror = () => { faviconImg.style.display = 'none'; };
  } else {
    faviconImg.style.display = 'none';
  }
  faviconImg.alt = '';
  faviconImg.loading = 'lazy';
  faviconImg.width = 16;
  faviconImg.height = 16;

  const sourceSpan = document.createElement('span');
  sourceSpan.className = 'news-card-source';
  sourceSpan.textContent = article.source || article.domain;

  const timeSpan = document.createElement('span');
  timeSpan.className = 'news-card-time';
  timeSpan.textContent = article.timeAgo ? `• ${article.timeAgo}` : '';

  sourceGroup.appendChild(faviconImg);
  sourceGroup.appendChild(sourceSpan);
  sourceGroup.appendChild(timeSpan);

  const badgeBtn = createStrategyBadge(article, false);

  metaRow.appendChild(sourceGroup);
  metaRow.appendChild(badgeBtn);
  body.appendChild(metaRow);

  card.appendChild(body);

  // Right column thumbnail
  const media = document.createElement('div');
  media.className = 'flip-row-media';

  if (article.imageUrl) {
    const img = document.createElement('img');
    img.className = 'flip-row-img';
    img.src = article.imageUrl;
    img.alt = article.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => {
      media.innerHTML = renderFallbackMedia(article.domain, article.title);
      resolveCardImage(article, media, 'flip-row-img');
    };
    media.appendChild(img);
  } else {
    media.innerHTML = renderFallbackMedia(article.domain, article.title);
    resolveCardImage(article, media, 'flip-row-img');
  }
  card.appendChild(media);

  // Direct card click opens in same tab
  card.addEventListener('click', (e) => {
    if (e.target.closest('button, .badge-action, a')) return;
    const dest = article.targetUrl || article.originalUrl;
    if (dest) window.location.href = dest;
  });

  return card;
}

/**
 * Creates a Full-Sized Mid-Feed Banner Card.
 */
function createFlipBannerCard(article, topicLabel) {
  const card = document.createElement('article');
  card.id = article.id;
  card.className = `flip-banner news-card--${article.status}`;
  if (article.status === 'locked' && state.hideLocked) {
    card.classList.add('news-card--hidden');
  }

  // Cover Image Media
  if (article.imageUrl) {
    const media = document.createElement('div');
    media.className = 'flip-banner-media';
    const img = document.createElement('img');
    img.className = 'flip-banner-img';
    img.src = article.imageUrl;
    img.alt = article.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => {
      media.style.display = 'none';
      resolveCardImage(article, card, 'flip-banner-img', { isBanner: true });
    };
    media.appendChild(img);
    card.appendChild(media);
  } else {
    resolveCardImage(article, card, 'flip-banner-img', { isBanner: true });
  }

  // Vignette gradient overlay
  const overlay = document.createElement('div');
  overlay.className = 'flip-banner-overlay';
  card.appendChild(overlay);

  // Content overlaid on bottom
  const content = document.createElement('div');
  content.className = 'flip-banner-content';

  // Pastel Green Tag Pill
  const tag = document.createElement('span');
  tag.className = 'flip-tag';
  tag.textContent = `#${(topicLabel || 'FEATURED').toUpperCase()}`;
  content.appendChild(tag);

  // Title Link
  const titleLink = document.createElement('a');
  titleLink.className = 'flip-banner-title';
  titleLink.textContent = article.title;
  titleLink.setAttribute('data-link-for', article.id);
  const destinationUrl = article.targetUrl || article.originalUrl;
  if (destinationUrl) {
    titleLink.href = destinationUrl;
    titleLink.target = '_self';
    titleLink.rel = 'noopener noreferrer';
  }
  content.appendChild(titleLink);

  // Meta row
  const metaRow = document.createElement('div');
  metaRow.className = 'flip-banner-meta';

  const sourceGroup = document.createElement('div');
  sourceGroup.className = 'flip-hero-source-group';

  const faviconImg = document.createElement('img');
  faviconImg.className = 'source-favicon';
  const bannerFavUrl = getFaviconUrl(article.domain, 32);
  if (bannerFavUrl) {
    faviconImg.src = bannerFavUrl;
    faviconImg.onerror = () => { faviconImg.style.display = 'none'; };
  } else {
    faviconImg.style.display = 'none';
  }
  faviconImg.alt = '';
  faviconImg.loading = 'lazy';
  faviconImg.width = 16;
  faviconImg.height = 16;

  const sourceSpan = document.createElement('span');
  sourceSpan.className = 'news-card-source';
  sourceSpan.textContent = article.source || article.domain;

  const timeSpan = document.createElement('span');
  timeSpan.className = 'flip-hero-time';
  timeSpan.textContent = article.timeAgo ? `• ${article.timeAgo}` : '';

  sourceGroup.appendChild(faviconImg);
  sourceGroup.appendChild(sourceSpan);
  sourceGroup.appendChild(timeSpan);

  const badgeBtn = createStrategyBadge(article, true);

  metaRow.appendChild(sourceGroup);
  metaRow.appendChild(badgeBtn);
  content.appendChild(metaRow);

  card.appendChild(content);

  // Direct card click opens in same tab
  card.addEventListener('click', (e) => {
    if (e.target.closest('button, .badge-action, a')) return;
    const dest = article.targetUrl || article.originalUrl;
    if (dest) window.location.href = dest;
  });

  return card;
}

/**
 * Renders the headline feed into the DOM as an authentic Flipboard Magazine spread.
 * Creates rhythmic layout variety with:
 * - Lead Cover Story Hero at top
 * - Dynamic Split Grid (2-in-a-row side-by-side)
 * - Magazine Story Rows
 * - Periodic Full Sized Mid-Feed Banners
 * Intelligently guided by headline length, photo presence, and balanced pairing.
 */
function renderFeed() {
  elements.feedList.innerHTML = '';

  if (state.articles.length === 0) {
    if (elements.feedStatus) elements.feedStatus.textContent = 'No headlines available';
    elements.feedList.innerHTML = '<div class="state-desc" style="text-align: center; padding: 40px 16px;">No headlines available for this topic.</div>';
    return;
  }

  // Update Flipboard magazine section header
  const topicConfig = getTopicById(state.currentTopic);
  const topicLabel = topicConfig ? topicConfig.label : 'Top Stories';
  if (elements.editorialHeading) {
    elements.editorialHeading.textContent = topicLabel.toUpperCase();
  }

  updateStatusCounter();

  // 1. Featured Lead Cover Story (Item 0)
  const heroArticle = state.articles[0];
  const heroCard = createFlipHeroCard(heroArticle, topicLabel);
  elements.feedList.appendChild(heroCard);

  // 2. Dynamic rhythmic magazine flow
  let i = 1;
  let articlesSinceBanner = 0;
  let rowsBuffer = [];

  const flushRowsBuffer = () => {
    if (rowsBuffer.length > 0) {
      const rowsContainer = document.createElement('div');
      rowsContainer.className = 'flip-rows-container';
      rowsBuffer.forEach((art) => {
        const rowCard = createFlipRowCard(art);
        rowsContainer.appendChild(rowCard);
      });
      elements.feedList.appendChild(rowsContainer);
      rowsBuffer = [];
    }
  };

  while (i < state.articles.length) {
    const current = state.articles[i];
    const next = state.articles[i + 1];

    // Banner Qualification:
    // When an article has a photo, substantial headline (>= 45 chars),
    // and at least 5 articles have elapsed since the previous banner.
    const isBannerCandidate = Boolean(
      current.imageUrl &&
      current.title.length >= 45 &&
      articlesSinceBanner >= 5
    );

    if (isBannerCandidate) {
      flushRowsBuffer();
      const bannerCard = createFlipBannerCard(current, topicLabel);
      elements.feedList.appendChild(bannerCard);
      articlesSinceBanner = 0;
      i += 1;
      continue;
    }

    // Split Row Qualification (2 articles in a single row):
    // Pair two articles side-by-side if lengths are balanced or both have photos,
    // immediately after hero (i===1), immediately after a banner, or when buffer has 2+ rows.
    const canPair = Boolean(
      next &&
      current.title.length <= 110 &&
      next.title.length <= 110 &&
      (Math.abs(current.title.length - next.title.length) < 45 || (current.imageUrl && next.imageUrl))
    );

    const shouldPairNow = Boolean(
      canPair &&
      (i === 1 || articlesSinceBanner === 0 || rowsBuffer.length >= 2 || (current.imageUrl && next.imageUrl && rowsBuffer.length >= 1))
    );

    if (shouldPairNow) {
      flushRowsBuffer();
      const gridContainer = document.createElement('div');
      gridContainer.className = 'flip-grid';
      gridContainer.appendChild(createFlipTileCard(current));
      gridContainer.appendChild(createFlipTileCard(next));
      elements.feedList.appendChild(gridContainer);
      articlesSinceBanner += 2;
      i += 2;
      continue;
    }

    // Otherwise, collect into standard magazine story rows
    rowsBuffer.push(current);
    articlesSinceBanner += 1;
    i += 1;

    // Flush rows if buffer reaches 3 to maintain layout cadence
    if (rowsBuffer.length >= 3) {
      flushRowsBuffer();
    }
  }

  // Flush any remaining story rows
  flushRowsBuffer();
}

/**
 * Smoothly updates a single card's DOM when an async archive check finishes
 * or when a user switches domain strategy.
 */
function updateCardElement(article) {
  const card = document.getElementById(article.id);
  if (!card) return;

  // Toggle locked state
  if (article.status === 'locked') {
    card.classList.add('news-card--locked');
    if (state.hideLocked) {
      card.classList.add('news-card--hidden');
    } else {
      card.classList.remove('news-card--hidden');
    }
  } else {
    card.classList.remove('news-card--locked', 'news-card--hidden');
  }

  // Update badge
  const badge = card.querySelector(`[data-badge-for="${article.id}"]`);
  if (badge) {
    const isHero = card.classList.contains('flip-hero') || card.classList.contains('flip-banner');
    badge.className = `badge badge-${article.status} badge-action ${isHero ? 'badge-hero' : ''}`;
    const badgeText = badge.querySelector('.badge-text');
    if (badgeText) {
      badgeText.textContent = article.badge;
    } else {
      badge.textContent = article.badge;
    }
  }

  // Update title link
  const titleLink = card.querySelector(`[data-link-for="${article.id}"]`);
  if (titleLink) {
    const destinationUrl = article.targetUrl || article.originalUrl;
    if (destinationUrl) {
      titleLink.href = destinationUrl;
      titleLink.target = '_self';
      titleLink.rel = 'noopener noreferrer';
    }
  }

  updateStatusCounter();
}

/**
 * Opens the Strategy Switcher Modal for a specific article's domain.
 */
function openStrategySwitcher(article) {
  if (!elements.strategySwitcherModal) return;

  const domain = normalizeDomain(article.domain);
  const currentRule = article.rule || { strategy: STRATEGIES.DIRECT };

  elements.switcherDomainName.textContent = domain || article.source || 'Publisher';
  const switcherFav = getFaviconUrl(domain, 32);
  if (switcherFav) {
    elements.switcherFavicon.src = switcherFav;
    elements.switcherFavicon.onerror = () => { elements.switcherFavicon.style.display = 'none'; };
    elements.switcherFavicon.style.display = 'inline-block';
  } else {
    elements.switcherFavicon.style.display = 'none';
  }

  elements.strategyOptionsList.innerHTML = '';

  STRATEGY_DEFINITIONS.forEach((strategy) => {
    const isSelected = currentRule.strategy === strategy.id;
    const isFreedium = strategy.id === STRATEGIES.FREEDIUM;
    const isFreediumRestricted = isFreedium && !isFreediumSupported(domain);

    const optionBtn = document.createElement('button');
    optionBtn.type = 'button';
    optionBtn.className = `strategy-option ${isSelected ? 'strategy-option--active' : ''} ${isFreediumRestricted ? 'strategy-option--restricted' : ''}`;
    
    if (isFreediumRestricted) {
      optionBtn.disabled = true;
      optionBtn.setAttribute('title', 'Freedium Mirror is only supported on Medium, NYT, WaPo, Bloomberg, Reuters, Economist, and Financial Times.');
    }

    const descText = isFreediumRestricted
      ? 'Supported only for: Medium, NYT, WaPo, Bloomberg, Reuters, Economist, and FT.'
      : strategy.desc;

    optionBtn.innerHTML = `
      <div class="strategy-option-icon">${strategy.icon}</div>
      <div class="strategy-option-text">
        <div class="strategy-option-title">
          <span>${strategy.title}</span>
          ${isSelected ? '<span class="strategy-active-tag">Current</span>' : ''}
          ${isFreediumRestricted ? '<span class="strategy-scope-badge">Supported Sites Only</span>' : ''}
        </div>
        <div class="strategy-option-desc">${descText}</div>
      </div>
      <div class="strategy-option-indicator">
        ${isSelected ? '<span class="check-icon">✓</span>' : ''}
      </div>
    `;

    if (!isFreediumRestricted) {
      optionBtn.addEventListener('click', () => {
        changeDomainStrategy(domain, strategy.id, article);
        closeStrategySwitcher();
      });
    }

    elements.strategyOptionsList.appendChild(optionBtn);
  });

  elements.strategySwitcherModal.classList.add('open');
}

/**
 * Closes the Strategy Switcher Modal.
 */
function closeStrategySwitcher() {
  if (elements.strategySwitcherModal) {
    elements.strategySwitcherModal.classList.remove('open');
  }
}

/**
 * Parses an article link, including links pasted without a scheme.
 */
function parseQuickUrl(raw) {
  const value = (raw || '').trim();
  if (!value || /\s/.test(value)) return null;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const domain = normalizeDomain(parsed.hostname);
    if (!domain.includes('.') || parsed.username || parsed.password) return null;
    return { url: parsed.href, domain };
  } catch {
    return null;
  }
}

function getLastQuickUrlStrategy() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_QUICK_URL_STRATEGY);
    if (saved === 'auto' || STRATEGY_DEFINITIONS.some((s) => s.id === saved)) return saved;
  } catch {
    // The dialog still works when browser storage is unavailable.
  }
  return 'auto';
}

/** Opens the article only after the user submits the confirmation form. */
function executeOpenQuickUrl() {
  const raw = (elements.inputQuickUrl ? elements.inputQuickUrl.value : '').trim();
  const parsed = parseQuickUrl(raw);
  if (!parsed) {
    if (elements.quickUrlError) {
      elements.quickUrlError.style.display = 'block';
      elements.quickUrlError.textContent = raw
        ? 'Please enter a valid website or article URL.'
        : 'Please enter or paste an article URL first.';
    }
    if (elements.inputQuickUrl) elements.inputQuickUrl.focus();
    return;
  }

  const { url: candidate, domain } = parsed;
  const stratVal = elements.quickUrlStrategySelect?.value || 'auto';
  const effectiveStrat = stratVal === 'auto' ? (getDomainRule(domain).strategy || STRATEGIES.DIRECT) : stratVal;

  if (effectiveStrat === STRATEGIES.FREEDIUM && !isFreediumSupported(domain)) {
    if (elements.quickUrlError) {
      elements.quickUrlError.style.display = 'block';
      elements.quickUrlError.textContent = 'Freedium Mirror is only supported for Medium, NYT, WaPo, Bloomberg, Reuters, Economist, and Financial Times. Please select another tool.';
    }
    if (elements.quickUrlStrategySelect) elements.quickUrlStrategySelect.focus();
    return;
  }

  // Auto follows the existing rule; it should not create a redundant override.
  if (elements.quickUrlRememberCheck?.checked && stratVal !== 'auto') {
    changeDomainStrategy(domain, effectiveStrat);
  }

  try {
    localStorage.setItem(STORAGE_KEY_QUICK_URL_STRATEGY, stratVal);
  } catch {
    // Storage restrictions must not prevent opening an article.
  }

  const bypassUrl = buildStrategyUrl(effectiveStrat, candidate);
  closeQuickUrlModal();

  // Navigate directly inside this window (do not create a new tab)
  window.location.href = bypassUrl;
}

/**
 * Opens the Quick Article URL modal, optionally pre-populating with a URL.
 * @param {string} [initialUrl='']
 */
function openQuickUrlModal(initialUrl = '') {
  if (!elements.quickUrlModal) return;
  if (!elements.quickUrlModal.classList.contains('open')) {
    quickUrlReturnFocus = document.activeElement;
  }

  if (elements.quickUrlError) {
    elements.quickUrlError.style.display = 'none';
    elements.quickUrlError.textContent = '';
  }

  if (elements.quickUrlStrategySelect) {
    elements.quickUrlStrategySelect.value = getLastQuickUrlStrategy();
  }
  if (elements.quickUrlRememberCheck) elements.quickUrlRememberCheck.checked = false;

  elements.quickUrlModal.inert = false;
  elements.quickUrlModal.setAttribute('aria-hidden', 'false');
  elements.quickUrlModal.classList.add('open');

  if (initialUrl && elements.inputQuickUrl) {
    elements.inputQuickUrl.value = initialUrl;
  }
  analyzeQuickUrl(elements.inputQuickUrl?.value || '');
  const focusTarget = initialUrl && !elements.quickUrlOpenBtn?.disabled
    ? elements.quickUrlOpenBtn : elements.inputQuickUrl;
  if (focusTarget) focusTarget.focus();
}

/**
 * Closes the Quick Article URL modal.
 */
function closeQuickUrlModal() {
  if (elements.quickUrlModal) {
    elements.quickUrlModal.classList.remove('open');
    if (quickUrlReturnFocus?.isConnected) quickUrlReturnFocus.focus();
    elements.quickUrlModal.inert = true;
    elements.quickUrlModal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Real-time analyzer for the Quick Article URL input.
 * Extracts domain, resolves active strategy, and renders live status.
 * @param {string} inputVal
 */
function analyzeQuickUrl(inputVal) {
  const raw = (inputVal || '').trim();
  const parsed = parseQuickUrl(raw);
  if (elements.quickUrlOpenBtn) {
    elements.quickUrlOpenBtn.disabled = !parsed;
    elements.quickUrlOpenBtn.textContent = 'Open article';
  }
  if (elements.quickUrlRememberCheck) {
    elements.quickUrlRememberCheck.disabled = !parsed || elements.quickUrlStrategySelect?.value === 'auto';
    if (elements.quickUrlRememberCheck.disabled) elements.quickUrlRememberCheck.checked = false;
  }
  if (elements.quickUrlRememberDomain) elements.quickUrlRememberDomain.textContent = parsed?.domain || 'this site';
  if (elements.quickUrlToolDescription) {
    const definition = STRATEGY_DEFINITIONS.find((s) => s.id === elements.quickUrlStrategySelect?.value);
    elements.quickUrlToolDescription.textContent = definition?.desc || 'Uses the saved or default tool for this site.';
  }

  // Toggle clear button
  if (elements.quickUrlClearBtn) {
    elements.quickUrlClearBtn.style.display = raw ? 'flex' : 'none';
  }

  if (elements.quickUrlError) {
    elements.quickUrlError.style.display = 'none';
    elements.quickUrlError.textContent = '';
  }

  if (!parsed) {
    if (elements.quickUrlDomainBanner) elements.quickUrlDomainBanner.style.display = 'none';
    if (elements.quickUrlStrategySelect) {
      const autoOption = Array.from(elements.quickUrlStrategySelect.options).find((o) => o.value === 'auto');
      if (autoOption) {
        autoOption.textContent = "Auto (Use this site's default)";
      }
    }
    if (raw && elements.quickUrlError) {
      elements.quickUrlError.style.display = 'block';
      elements.quickUrlError.textContent = 'Please enter a valid website or article URL.';
    }
    return;
  }

  const { domain } = parsed;
  // Domain detected! Look up rule and strategy
  const rule = getDomainRule(domain);
  const recommendedStrategy = rule.strategy || STRATEGIES.DIRECT;
  const recommendedDef = STRATEGY_DEFINITIONS.find((s) => s.id === recommendedStrategy) || { title: recommendedStrategy };
  const isAuto = elements.quickUrlStrategySelect?.value === 'auto';
  const selectedStrategy = isAuto ? recommendedStrategy : elements.quickUrlStrategySelect?.value;
  const selectedDef = STRATEGY_DEFINITIONS.find((s) => s.id === selectedStrategy) || recommendedDef;

  if (elements.quickUrlToolDescription) {
    elements.quickUrlToolDescription.textContent = isAuto
      ? `This site's ${rule.isCustom ? 'saved' : 'default'} tool is ${selectedDef.title}. ${selectedDef.desc || ''}`
      : selectedDef.desc;
  }
  const unsupported = selectedStrategy === STRATEGIES.FREEDIUM && !isFreediumSupported(domain);
  if (elements.quickUrlOpenBtn) {
    elements.quickUrlOpenBtn.disabled = unsupported;
    elements.quickUrlOpenBtn.textContent = selectedStrategy === STRATEGIES.DIRECT
      ? 'Open original article' : `Open with ${selectedDef.title}`;
  }
  if (unsupported && elements.quickUrlError) {
    elements.quickUrlError.style.display = 'block';
    elements.quickUrlError.textContent = 'Freedium does not support this site. Choose another tool to continue.';
  }

  // Update Auto option in dropdown (clean text without emoji)
  if (elements.quickUrlStrategySelect) {
    const autoOption = Array.from(elements.quickUrlStrategySelect.options).find((o) => o.value === 'auto');
    if (autoOption) {
      autoOption.textContent = `Auto (${recommendedDef.title} for ${domain})`;
    }
  }

  // Populate Domain Banner
  if (elements.quickUrlDomainName) {
    elements.quickUrlDomainName.textContent = domain;
  }

  if (elements.quickUrlRememberDomain) {
    elements.quickUrlRememberDomain.textContent = domain;
  }

  if (elements.quickUrlFavicon) {
    const quickFav = getFaviconUrl(domain, 32);
    if (quickFav) {
      elements.quickUrlFavicon.src = quickFav;
      elements.quickUrlFavicon.onerror = () => { elements.quickUrlFavicon.style.display = 'none'; };
      elements.quickUrlFavicon.style.display = 'inline-block';
    } else {
      elements.quickUrlFavicon.style.display = 'none';
    }
  }

  if (elements.quickUrlStrategyBadge) {
    elements.quickUrlStrategyBadge.textContent = selectedDef.title;
    elements.quickUrlStrategyBadge.className = `badge ${selectedStrategy === STRATEGIES.DIRECT ? 'badge-free' : 'badge-bypassed'}`;
  }

  if (elements.quickUrlRuleSourceTag) {
    elements.quickUrlRuleSourceTag.textContent = isAuto ? (rule.isCustom ? 'Saved for this site' : 'Site default') : 'Selected tool';
  }

  if (elements.quickUrlDomainBanner) {
    elements.quickUrlDomainBanner.style.display = 'flex';
  }
}

/**
 * Checks for incoming Web Share Target parameters on app startup, foreground restore,
 * or launchQueue delivery.
 * @param {string|URL|URLSearchParams} [customInput=null]
 */
function checkIncomingShare(customInput = null) {
  if (typeof window === 'undefined') return;
  try {
    let targetUrl = '';

    if (customInput) {
      targetUrl = extractSharedUrl(customInput);
    }

    if (!targetUrl && window.location.search) {
      targetUrl = extractSharedUrl(window.location.search);
    }

    if (!targetUrl && window.location.hash && window.location.hash.includes('?')) {
      const hashQuery = window.location.hash.slice(window.location.hash.indexOf('?'));
      targetUrl = extractSharedUrl(hashQuery);
    }

    if (!targetUrl && window.location.href && (window.location.href.includes('url=') || window.location.href.includes('text='))) {
      targetUrl = extractSharedUrl(window.location.href);
    }

    if (targetUrl) {
      // Clean query parameters from URL so refreshes don't re-trigger modal
      const cleanHash = (window.location.hash || '').split('?')[0];
      const cleanUrl = window.location.pathname + cleanHash;
      window.history.replaceState({}, document.title, cleanUrl);

      // Close open menus/modals before revealing quick URL opener
      if (elements.headerMenuDropdown) {
        elements.headerMenuDropdown.classList.remove('open');
        elements.headerMenuDropdown.setAttribute('aria-hidden', 'true');
      }
      if (elements.rulesModal) elements.rulesModal.classList.remove('open');
      if (elements.topicsModal) elements.topicsModal.classList.remove('open');
      if (elements.strategySwitcherModal) elements.strategySwitcherModal.classList.remove('open');

      openQuickUrlModal(targetUrl);
    }
  } catch (error) {
    console.warn({ error: error?.message }, 'Failed to parse incoming share parameters');
  }
}

// Register W3C Launch Handler consumer for Android / desktop PWAs already running
if (typeof window !== 'undefined' && 'launchQueue' in window && typeof window.launchQueue.setConsumer === 'function') {
  window.launchQueue.setConsumer((launchParams) => {
    if (launchParams && launchParams.targetURL) {
      checkIncomingShare(launchParams.targetURL);
    }
  });
}


/**
 * Changes a domain's strategy, auto-saves to rules, and updates all matching articles.
 */
function changeDomainStrategy(domainInput, newStrategy, triggerArticle = null) {
  const domain = normalizeDomain(domainInput);
  if (!domain) return;

  // 1. Auto-save custom rule to localStorage
  setDomainRule(domain, {
    strategy: newStrategy,
    paywall: (newStrategy === STRATEGIES.ARCHIVE_IS || newStrategy === STRATEGIES.WAYBACK) ? 'hard' : 'custom',
  });

  // 2. Re-apply strategy to all articles with this domain in current feed
  let updatedTrigger = null;
  state.rawArticles = (state.rawArticles || []).map((art) => {
    if (normalizeDomain(art.domain) === domain) {
      return applyStrategyToArticle(art);
    }
    return art;
  });

  state.articles = state.articles.map((art) => {
    if (normalizeDomain(art.domain) === domain) {
      const updated = applyStrategyToArticle(art);
      updateCardElement(updated);
      if (triggerArticle && art.id === triggerArticle.id) {
        updatedTrigger = updated;
      }
      return updated;
    }
    return art;
  });

  // If rules table is open, refresh it too
  if (elements.rulesModal && elements.rulesModal.classList.contains('open')) {
    renderRulesTable();
  }

  // 3. Show confirmation toast
  const strategyDef = STRATEGY_DEFINITIONS.find((s) => s.id === newStrategy) || { title: newStrategy };
  let toastHtml = `✓ Saved rule: <strong>${domain}</strong> now uses <strong>${strategyDef.title}</strong>`;
  if (newStrategy === STRATEGIES.READER) {
    toastHtml += `<br><span class="toast-subtext">💡 Tip: Use your browser's Reader Mode (F9) or block JS to bypass overlay paywalls.</span>`;
  }
  const testUrl = updatedTrigger ? (updatedTrigger.targetUrl || updatedTrigger.originalUrl) : null;
  showToast(toastHtml, testUrl, 'Test Article ↗');
}

/**
 * Displays a transient floating toast notification.
 */
let toastTimeout = null;
function showToast(htmlMessage, actionUrl = null, actionLabel = 'Open ↗') {
  if (!elements.appToast) return;
  clearTimeout(toastTimeout);

  elements.toastMessage.innerHTML = htmlMessage;

  if (actionUrl) {
    elements.toastActionLink.href = actionUrl;
    elements.toastActionLink.textContent = actionLabel;
    elements.toastActionLink.style.display = 'inline-flex';
  } else {
    elements.toastActionLink.style.display = 'none';
  }

  elements.appToast.classList.add('show');
  toastTimeout = setTimeout(() => {
    elements.appToast.classList.remove('show');
  }, 4000);
}

/**
 * Updates the summary status counter above the headlines.
 */
function updateStatusCounter() {
  if (!elements.feedStatus) return;
  const total = state.articles.length;
  const locked = state.articles.filter((a) => a.status === 'locked').length;
  const readable = total - locked;
  elements.feedStatus.textContent = `${total} Headlines (${readable} accessible, ${locked} locked)`;
}

/**
 * Resolves the initial active news topic, checking URL hash first, then localStorage,
 * falling back to TOP.
 */
function getInitialTopic() {
  const visible = getVisibleTopics();
  const isVisible = (id) => visible.some((topic) => topic.id === id);
  if (typeof window !== 'undefined' && window.location.hash) {
    const hashTopicId = window.location.hash.replace(/^#/, '').split('?')[0].toUpperCase();
    if (hashTopicId && isVisible(hashTopicId)) {
      return hashTopicId;
    }
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY_CURRENT_TOPIC);
    if (saved && isVisible(saved)) {
      return saved;
    }
  } catch {
    // fallback
  }

  return visible[0]?.id || 'TOP';
}

/**
 * Synchronizes user's configured Local Edition (city/region) with hamburger menu
 * labels and settings input controls.
 */
function updateLocalMenuLabels() {
  const edition = getLocalEdition();
  if (elements.inputLocalCity) {
    elements.inputLocalCity.value = edition.city;
  }
  if (elements.inputLocalRegion) {
    elements.inputLocalRegion.value = edition.region;
  }
  if (elements.selectLocalPreset) {
    const pair = `${edition.city}|${edition.region}`;
    const hasPreset = Array.from(elements.selectLocalPreset.options).some((o) => o.value === pair);
    elements.selectLocalPreset.value = hasPreset ? pair : 'CUSTOM';
  }
}

/**
 * Applies active sort order to rawArticles and renders feed into DOM.
 */
function applySortAndRender() {
  if (state.sortOrder === 'newest') {
    state.articles = sortArticlesByDate(state.rawArticles, 'newest');
  } else if (state.sortOrder === 'oldest') {
    state.articles = sortArticlesByDate(state.rawArticles, 'oldest');
  } else {
    state.articles = [...state.rawArticles];
  }
  renderFeed();
}

/**
 * Loads headlines from Google News RSS or woven curated feeds.
 * Renders instantly (0ms), then processes any needed archive checks in background.
 */
async function loadHeadlines(topicId = state.currentTopic, options = {}) {
  const requestId = ++headlinesRequestId;
  const sameTopic = topicId === state.displayedTopic;
  const keepVisible = sameTopic && state.rawArticles.length > 0;
  // Resolve defaults before fetching; never overwrite a choice made while waiting.
  const isLatest = topicId === 'LATEST' || topicId === 'BREAKING';
  state.sortOrder = preferredSortOrder || (isLatest ? 'newest' : 'curated');
  if (elements.feedSortSelect) elements.feedSortSelect.value = state.sortOrder;
  state.isLoading = true;
  state.currentTopic = topicId;

  // Persist current category for browser refresh retention
  try {
    localStorage.setItem(STORAGE_KEY_CURRENT_TOPIC, topicId);
  } catch {
    // ignore storage error
  }

  // Sync URL hash for refresh retention and back/forward navigation, preserving any query parameters
  const targetHash = '#' + topicId.toLowerCase();
  if (typeof window !== 'undefined' && window.location.hash !== targetHash) {
    const currentSearch = window.location.search || '';
    history.replaceState(null, '', currentSearch + targetHash);
  }

  // Update dynamic document title for SEO, browser history & tabs
  const topicDef = getTopicById(topicId);
  const topicLabel = topicDef?.label || (topicId === 'TOP' ? 'Top Stories' : topicId);
  if (typeof document !== 'undefined') {
    document.title = `${topicLabel} | OpenWire News`;
  }

  // Sync topics bar active pill
  if (elements.topicsBar) {
    elements.topicsBar.querySelectorAll('.topic-pill').forEach((p) => {
      if (p.getAttribute('data-topic') === topicId) {
        p.classList.add('active');
        if (!sameTopic) p.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      } else {
        p.classList.remove('active');
      }
    });
  }

  elements.refreshIcon.classList.add('spin');
  elements.loadingState.style.display = keepVisible ? 'none' : 'block';
  elements.errorState.style.display = 'none';
  elements.feedList.style.display = keepVisible ? 'flex' : 'none';
  if (elements.feedUpdateStatus) {
    elements.feedUpdateStatus.hidden = false;
    elements.feedUpdateStatus.textContent = options.forceLive ? 'Checking for newer headlines…' : 'Loading headlines…';
    elements.feedUpdateStatus.removeAttribute('title');
  }

  try {
    let feedStatus = null;
    const rawArticles = await fetchTopHeadlines(topicId, { ...options, onStatus(status) {
      feedStatus = status;
    } });
    if (requestId !== headlinesRequestId) return;
    const updatedAt = Number(feedStatus?.updatedAt) || 0;
    // A failed live refresh must not roll back an already displayed feed.
    const retainCurrent = keepVisible && options.forceLive && feedStatus?.source === 'saved'
      && (!updatedAt || updatedAt <= state.feedUpdatedAt);
    if (!retainCurrent) {
      state.rawArticles = rawArticles;
      state.displayedTopic = topicId;
      state.feedUpdatedAt = updatedAt;
    }
    if (elements.feedUpdateStatus && feedStatus) {
      const updated = (retainCurrent ? state.feedUpdatedAt : updatedAt);
      const time = updated ? new Date(updated).toLocaleString() : 'unknown time';
      const failed = feedStatus.failedFeeds || [];
      elements.feedUpdateStatus.textContent = retainCurrent
        ? 'Refresh unavailable. Keeping your current headlines.'
        : feedStatus.refreshFailed
          ? `Refresh unavailable. Showing saved headlines from ${time}.`
          : `${feedStatus.source === 'live' ? 'Updated' : 'Saved headlines from'} ${time}${failed.length ? ` · ${failed.length} source${failed.length === 1 ? '' : 's'} unavailable` : ''}`;
      elements.feedUpdateStatus.title = failed.map((feed) => `${feed.name}: ${feed.error}`).join('\n');
    }

    elements.loadingState.style.display = 'none';
    elements.feedList.style.display = 'flex';

    // 1. Instant First Paint: Render all items immediately with active sort
    if (!retainCurrent) applySortAndRender();

    // 2. Background Quick Checks: Process any articles needing archive checks
    const pendingChecks = state.articles.filter((a) => a.needsArchiveCheck);
    if (pendingChecks.length > 0) {
      // Run checks concurrently with small delay stagger
      pendingChecks.forEach(async (article) => {
        const resolved = await resolveArchiveStatus(article);
        if (requestId === headlinesRequestId) updateCardElement(resolved);
      });
    }
  } catch (error) {
    if (requestId !== headlinesRequestId) return;
    console.error({ error: error?.message }, 'Failed to load news headlines');
    elements.loadingState.style.display = 'none';
    elements.errorState.style.display = keepVisible ? 'none' : 'block';
    elements.errorMessage.textContent = error?.message || 'Unable to fetch news headlines.';
    if (elements.feedUpdateStatus) elements.feedUpdateStatus.textContent = keepVisible
      ? 'Refresh unavailable. Keeping your current headlines.'
      : 'Refresh failed. Please retry shortly.';
  } finally {
    if (requestId === headlinesRequestId) {
      state.isLoading = false;
      elements.refreshIcon.classList.remove('spin');
    }
  }
}

// Menu, pull gesture and browser reload all request the same live refresh.
function refreshCurrentTopic() {
  const topic = state.currentTopic;
  if (activeRefresh?.topic === topic && activeRefresh.requestId === headlinesRequestId) {
    return activeRefresh.promise;
  }
  const promise = loadHeadlines(topic, { forceLive: true });
  const refresh = { topic, requestId: headlinesRequestId, promise };
  activeRefresh = refresh;
  promise.finally(() => {
    if (activeRefresh === refresh) activeRefresh = null;
  });
  return promise;
}

function setupPullToRefresh() {
  const threshold = 72;
  let gesture = null;
  const scrollTop = () => window.scrollY || document.scrollingElement?.scrollTop || 0;
  const blocked = () => elements.headerMenuDropdown?.classList.contains('open')
    || [elements.rulesModal, elements.topicsModal, elements.strategySwitcherModal, elements.quickUrlModal]
      .some((modal) => modal?.classList.contains('open'));
  const reset = () => {
    gesture = null;
    if (elements.pullRefreshStatus) elements.pullRefreshStatus.hidden = true;
  };
  document.addEventListener('touchstart', (event) => {
    reset();
    if (event.touches.length !== 1 || scrollTop() > 0 || blocked()
      || event.target.closest('input, textarea, select, button, .topics-bar, .modal-overlay')) return;
    const touch = event.touches[0];
    gesture = { x: touch.clientX, y: touch.clientY, distance: 0 };
  }, { passive: true });
  document.addEventListener('touchmove', (event) => {
    if (!gesture) return;
    if (event.touches.length !== 1 || scrollTop() > 0 || blocked()) { reset(); return; }
    const touch = event.touches[0];
    const dy = touch.clientY - gesture.y;
    const dx = Math.abs(touch.clientX - gesture.x);
    if (dy < 0 || (dx > 10 && dx > dy)) { reset(); return; }
    gesture.distance = dy;
    if (dy < 10) return;
    if (event.cancelable) event.preventDefault();
    if (elements.pullRefreshStatus) {
      elements.pullRefreshStatus.hidden = false;
      elements.pullRefreshStatus.textContent = dy >= threshold ? 'Release to refresh' : 'Pull to refresh';
    }
  }, { passive: false });
  document.addEventListener('touchend', () => {
    const shouldRefresh = gesture?.distance >= threshold && scrollTop() === 0 && !blocked();
    reset();
    if (shouldRefresh) refreshCurrentTopic();
  }, { passive: true });
  document.addEventListener('touchcancel', reset, { passive: true });
}

/**
 * Dynamically renders the horizontal topics navigation bar
 * based on user's visible topic selections in topicRegistry.
 */
function renderTopicsBar() {
  if (!elements.topicsBar) return;
  const visible = getVisibleTopics();

  // If current topic is no longer visible, fallback to the first visible topic
  if (visible.length > 0 && !visible.some((t) => t.id === state.currentTopic)) {
    state.currentTopic = visible[0].id;
  }

  elements.topicsBar.innerHTML = '';
  visible.forEach((topic) => {
    const pill = document.createElement('button');
    pill.className = `topic-pill ${topic.id === state.currentTopic ? 'active' : ''}`;
    pill.setAttribute('data-topic', topic.id);
    pill.textContent = topic.label.toUpperCase();
    elements.topicsBar.appendChild(pill);
  });
}

/**
 * Renders the topics management modal list with toggles, reordering, and delete buttons.
 */
function renderTopicsModalTable() {
  if (!elements.topicsTableBody) return;
  const topics = getAllTopics();
  elements.topicsTableBody.innerHTML = '';

  topics.forEach((topic, index) => {
    const isVisible = topic.isVisible !== false && topic.visible !== false;
    const row = document.createElement('div');
    row.className = `topic-row ${isVisible ? '' : 'topic-row--hidden'}`;
    row.setAttribute('data-topic-id', topic.id);
    row.draggable = true;

    // Drag-and-drop reorder handlers
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', topic.id);
      row.classList.add('dragging');
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      elements.topicsTableBody.querySelectorAll('.topic-row').forEach((r) => r.classList.remove('drag-over'));
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const sourceId = e.dataTransfer.getData('text/plain');
      if (!sourceId || sourceId === topic.id) return;

      const currentTopics = getAllTopics();
      const sourceIdx = currentTopics.findIndex((t) => t.id === sourceId);
      const targetIdx = currentTopics.findIndex((t) => t.id === topic.id);
      if (sourceIdx === -1 || targetIdx === -1) return;

      const ids = currentTopics.map((t) => t.id);
      const [movedId] = ids.splice(sourceIdx, 1);
      ids.splice(targetIdx, 0, movedId);

      saveTopicOrder(ids);
      renderTopicsModalTable();
      renderTopicsBar();
    });

    const infoDiv = document.createElement('div');
    infoDiv.className = 'topic-info';

    // Drag Handle Icon
    const dragHandle = document.createElement('span');
    dragHandle.className = 'topic-drag-handle';
    dragHandle.innerHTML = '&#8942;&#8942;';
    dragHandle.title = 'Drag to reorder topic';
    infoDiv.appendChild(dragHandle);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'topic-name';
    nameSpan.textContent = topic.label;
    if (topic.isCustom && topic.query) {
      nameSpan.title = `Search query: ${topic.query}`;
    }
    infoDiv.appendChild(nameSpan);

    if (topic.isCustom) {
      const customBadge = document.createElement('span');
      customBadge.className = 'topic-custom-pill';
      customBadge.textContent = 'Custom';
      infoDiv.appendChild(customBadge);
    }

    // Render keywords tags if defined
    if (topic.keywords && topic.keywords.length > 0) {
      const kwWrap = document.createElement('div');
      kwWrap.className = 'topic-keywords-wrap';
      const kwTag = document.createElement('span');
      kwTag.className = 'topic-keywords-tag';
      kwTag.textContent = `🔑 ${topic.keywords.join(', ')}`;
      kwTag.title = `Keywords: ${topic.keywords.join(', ')}`;
      kwWrap.appendChild(kwTag);
      infoDiv.appendChild(kwWrap);
    }

    // Render assigned sources if defined
    if (topic.sources && topic.sources.length > 0) {
      const srcWrap = document.createElement('div');
      srcWrap.className = 'topic-sources-chips-wrap';
      const countChip = document.createElement('span');
      countChip.className = 'topic-sources-count-chip';
      const sourceNames = topic.sources.map((id) => {
        const s = getSourceById(id);
        return s ? s.name : id;
      });
      countChip.textContent = `📡 ${topic.sources.length} source${topic.sources.length > 1 ? 's' : ''}: ${sourceNames.slice(0, 3).join(', ')}${sourceNames.length > 3 ? '...' : ''}`;
      countChip.title = `Assigned RSS Sources:\n${sourceNames.join('\n')}`;
      srcWrap.appendChild(countChip);
      infoDiv.appendChild(srcWrap);
    }

    // Render custom feeds assigned to this topic (legacy compatibility)
    const assignedCustomFeeds = getCustomFeedsForTopic(topic.id);
    if (assignedCustomFeeds && assignedCustomFeeds.length > 0) {
      const feedsWrap = document.createElement('div');
      feedsWrap.className = 'topic-custom-feeds-list';
      assignedCustomFeeds.forEach((feed) => {
        const chip = document.createElement('span');
        chip.className = 'topic-feed-chip';
        chip.title = `${feed.name} (${feed.url}) - Fair-share quota: ${feed.maxArticles || 8}`;

        const chipText = document.createElement('span');
        chipText.textContent = `📡 ${feed.name}`;
        chip.appendChild(chipText);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'topic-feed-remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = `Remove "${feed.name}" from ${topic.label}`;
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteCustomFeedFromTopic(feed.id, topic.id);
          renderTopicsModalTable();
          if (state.currentTopic === topic.id) {
            loadHeadlines(topic.id);
          }
          showToast(`Removed feed "<strong>${escapeHtml(feed.name)}</strong>" from ${topic.label}`);
        });

        chip.appendChild(removeBtn);
        feedsWrap.appendChild(chip);
      });
      infoDiv.appendChild(feedsWrap);
    }

    const actionDiv = document.createElement('div');
    actionDiv.className = 'topic-actions';

    // Status tag badge
    const statusTag = document.createElement('span');
    statusTag.className = `topic-status-tag ${isVisible ? 'topic-status-tag--visible' : 'topic-status-tag--hidden'}`;
    statusTag.textContent = isVisible ? 'Visible' : 'Hidden';
    actionDiv.appendChild(statusTag);

    // Reorder Buttons (Move Up / Move Down)
    const reorderGroup = document.createElement('div');
    reorderGroup.className = 'topic-reorder-group';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'topic-reorder-btn';
    upBtn.innerHTML = '&uarr;';
    upBtn.title = `Move "${topic.label}" up`;
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => {
      moveTopic(topic.id, 'up');
      renderTopicsModalTable();
      renderTopicsBar();
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'topic-reorder-btn';
    downBtn.innerHTML = '&darr;';
    downBtn.title = `Move "${topic.label}" down`;
    downBtn.disabled = index === topics.length - 1;
    downBtn.addEventListener('click', () => {
      moveTopic(topic.id, 'down');
      renderTopicsModalTable();
      renderTopicsBar();
    });

    reorderGroup.appendChild(upBtn);
    reorderGroup.appendChild(downBtn);
    actionDiv.appendChild(reorderGroup);

    // Toggle visibility checkbox
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'topic-toggle-label';
    toggleLabel.title = `Show/hide ${topic.label} on topics bar`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'topic-toggle-checkbox';
    checkbox.checked = isVisible;

    checkbox.addEventListener('change', () => {
      const isChecked = checkbox.checked;
      const success = toggleTopicVisibility(topic.id, isChecked);
      if (!success) {
        checkbox.checked = true;
        showToast('At least one topic must remain visible');
        return;
      }

      // Visual row update
      row.classList.toggle('topic-row--hidden', !isChecked);
      statusTag.className = `topic-status-tag ${isChecked ? 'topic-status-tag--visible' : 'topic-status-tag--hidden'}`;
      statusTag.textContent = isChecked ? 'Visible' : 'Hidden';

      renderTopicsBar();
    });

    const toggleText = document.createElement('span');
    toggleText.textContent = 'Show';

    toggleLabel.appendChild(checkbox);
    toggleLabel.appendChild(toggleText);
    actionDiv.appendChild(toggleLabel);

    // If custom topic, provide delete button
    if (topic.isCustom) {
      const delBtn = document.createElement('button');
      delBtn.className = 'topic-delete-btn';
      delBtn.textContent = 'Delete';
      delBtn.title = `Delete topic "${topic.label}"`;

      delBtn.addEventListener('click', () => {
        deleteCustomTopic(topic.id);
        renderTopicsModalTable();
        renderTopicsBar();

        if (state.currentTopic === topic.id) {
          const visible = getVisibleTopics();
          const nextTopicId = visible[0] ? visible[0].id : 'TOP';
          loadHeadlines(nextTopicId);
        }
        showToast(`Removed topic "<strong>${topic.label}</strong>"`);
      });

      actionDiv.appendChild(delBtn);
    }

    row.appendChild(infoDiv);
    row.appendChild(actionDiv);
    elements.topicsTableBody.appendChild(row);
  });
}

// State tracking selected RSS sources when creating a topic
const selectedTopicSourceIds = new Set();

/**
 * Renders the interactive source checklist in the New Topic tab.
 * @param {string} [filterText]
 */
function renderTopicSourcesChecklist(filterText = '') {
  if (!elements.topicSourcesChecklist) return;
  const sources = getAllSources();
  elements.topicSourcesChecklist.innerHTML = '';

  const query = (filterText || '').toLowerCase().trim();
  const filtered = sources.filter((s) => {
    if (!query) return true;
    return (s.name && s.name.toLowerCase().includes(query)) ||
           (s.url && s.url.toLowerCase().includes(query)) ||
           (s.id && s.id.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'source-check-empty';
    empty.textContent = query ? `No sources match "${filterText}"` : 'No RSS sources available.';
    elements.topicSourcesChecklist.appendChild(empty);
    return;
  }

  filtered.forEach((source) => {
    const isChecked = selectedTopicSourceIds.has(source.id);

    const label = document.createElement('label');
    label.className = `source-check-item ${isChecked ? 'checked' : ''}`;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'source-checkbox';
    cb.value = source.id;
    cb.checked = isChecked;

    cb.addEventListener('change', () => {
      if (cb.checked) {
        selectedTopicSourceIds.add(source.id);
        label.classList.add('checked');
      } else {
        selectedTopicSourceIds.delete(source.id);
        label.classList.remove('checked');
      }
    });

    const infoDiv = document.createElement('div');
    infoDiv.className = 'source-check-details';

    const titleRow = document.createElement('div');
    titleRow.className = 'source-check-title-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'source-check-name';
    nameSpan.textContent = source.name;
    titleRow.appendChild(nameSpan);

    if (source.isCustom) {
      const customTag = document.createElement('span');
      customTag.className = 'source-catalog-badge badge-custom';
      customTag.textContent = 'Custom';
      titleRow.appendChild(customTag);
    }

    infoDiv.appendChild(titleRow);

    const metaSpan = document.createElement('span');
    metaSpan.className = 'source-check-meta';
    try {
      metaSpan.textContent = new URL(source.url).hostname;
    } catch {
      metaSpan.textContent = source.url;
    }
    infoDiv.appendChild(metaSpan);

    label.appendChild(cb);
    label.appendChild(infoDiv);
    elements.topicSourcesChecklist.appendChild(label);
  });
}

/**
 * Renders the RSS sources catalog in the RSS Sources tab.
 * @param {string} [filterText]
 */
function renderSourcesCatalog(filterText = '') {
  if (!elements.sourcesCatalogList) return;
  const sources = getAllSources();

  if (elements.sourcesCountBadge) {
    elements.sourcesCountBadge.textContent = `${sources.length} sources`;
  }

  elements.sourcesCatalogList.innerHTML = '';
  const query = (filterText || '').toLowerCase().trim();
  const filtered = sources.filter((s) => {
    if (!query) return true;
    return (s.name && s.name.toLowerCase().includes(query)) ||
           (s.url && s.url.toLowerCase().includes(query)) ||
           (s.id && s.id.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sources-catalog-empty';
    empty.textContent = query ? `No sources match "${filterText}"` : 'No RSS sources available.';
    elements.sourcesCatalogList.appendChild(empty);
    return;
  }

  filtered.forEach((source) => {
    const row = document.createElement('div');
    row.className = 'source-catalog-row';
    row.setAttribute('data-source-id', source.id);

    const info = document.createElement('div');
    info.className = 'source-catalog-info';

    const headerLine = document.createElement('div');
    headerLine.className = 'source-catalog-header-line';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'source-catalog-name';
    nameSpan.textContent = source.name;
    headerLine.appendChild(nameSpan);

    const badge = document.createElement('span');
    badge.className = `source-catalog-badge ${source.isCustom ? 'badge-custom' : 'badge-builtin'}`;
    badge.textContent = source.isCustom ? 'Custom' : 'Built-in';
    headerLine.appendChild(badge);

    info.appendChild(headerLine);

    const urlSpan = document.createElement('div');
    urlSpan.className = 'source-catalog-url';
    urlSpan.textContent = source.url;
    info.appendChild(urlSpan);

    row.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'source-catalog-actions';

    if (source.isCustom) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'source-delete-btn';
      delBtn.textContent = 'Delete';
      delBtn.title = `Delete custom source "${source.name}"`;
      delBtn.addEventListener('click', () => {
        deleteCustomSource(source.id);
        selectedTopicSourceIds.delete(source.id);
        renderSourcesCatalog(elements.inputSourceCatalogSearch ? elements.inputSourceCatalogSearch.value.trim() : '');
        renderTopicSourcesChecklist(elements.inputTopicSourceSearch ? elements.inputTopicSourceSearch.value.trim() : '');
        renderTopicsModalTable();
        // If current topic is using this source, refresh
        loadHeadlines(state.currentTopic);
        showToast(`Removed source "<strong>${escapeHtml(source.name)}</strong>"`);
      });
      actions.appendChild(delBtn);
    }

    row.appendChild(actions);
    elements.sourcesCatalogList.appendChild(row);
  });
}

/**
 * Switches the active tab inside the topics customization modal.
 * @param {'topics' | 'new_topic' | 'sources' | 'local'} tabName
 */
function switchTopicsModalTab(tabName) {
  const tabs = [
    { name: 'topics', btn: elements.tabBtnTopics, panel: elements.tabPanelTopics },
    { name: 'new_topic', btn: elements.tabBtnNewTopic, panel: elements.tabPanelNewTopic },
    { name: 'sources', btn: elements.tabBtnSources, panel: elements.tabPanelSources },
    { name: 'local', btn: elements.tabBtnLocal, panel: elements.tabPanelLocal },
  ];

  tabs.forEach((t) => {
    const isActive = t.name === tabName;
    if (t.btn) {
      t.btn.classList.toggle('active', isActive);
      t.btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
    if (t.panel) {
      t.panel.classList.toggle('active', isActive);
      t.panel.style.display = isActive ? 'flex' : 'none';
    }
  });

  if (tabName === 'new_topic') {
    renderTopicSourcesChecklist(elements.inputTopicSourceSearch ? elements.inputTopicSourceSearch.value.trim() : '');
  } else if (tabName === 'sources') {
    renderSourcesCatalog(elements.inputSourceCatalogSearch ? elements.inputSourceCatalogSearch.value.trim() : '');
  } else if (tabName === 'topics') {
    renderTopicsModalTable();
  }

  if (elements.saveTopicsBtn) {
    elements.saveTopicsBtn.style.display = tabName === 'topics' ? '' : 'none';
  }
}

/**
 * Renders the rules manager modal table with interactive strategy dropdowns.
 */
function renderRulesTable() {
  const rules = getAllDomainRules();
  elements.rulesTableBody.innerHTML = '';

  const sortedDomains = Object.keys(rules).sort();

  sortedDomains.forEach((domain) => {
    const rule = rules[domain];
    const row = document.createElement('div');
    row.className = 'rule-row';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'rule-info';

    const domainSpan = document.createElement('span');
    domainSpan.className = 'rule-domain';
    domainSpan.textContent = domain;
    infoDiv.appendChild(domainSpan);

    if (rule.isCustom) {
      const customBadge = document.createElement('span');
      customBadge.className = 'rule-custom-pill';
      customBadge.textContent = 'Custom';
      infoDiv.appendChild(customBadge);
    }

    const actionDiv = document.createElement('div');
    actionDiv.className = 'rule-actions';

    // Interactive strategy select dropdown
    const select = document.createElement('select');
    select.className = 'form-select rule-strategy-select';
    select.setAttribute('aria-label', `Strategy for ${domain}`);

    STRATEGY_DEFINITIONS.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.icon} ${s.title}`;
      if (rule.strategy === s.id) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
      changeDomainStrategy(domain, e.target.value);
    });

    actionDiv.appendChild(select);

    // If it's a custom override, provide a reset button to restore default
    if (rule.isCustom) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-icon rule-reset-btn';
      deleteBtn.title = 'Reset to factory default';
      deleteBtn.textContent = '✕';
      deleteBtn.addEventListener('click', () => {
        deleteDomainRule(domain);
        const defaultRule = getAllDomainRules()[domain];
        state.articles = state.articles.map((art) => {
          if (normalizeDomain(art.domain) === domain) {
            const updated = applyStrategyToArticle(art, defaultRule);
            updateCardElement(updated);
            return updated;
          }
          return art;
        });
        renderRulesTable();
        showToast(`✓ Reverted <strong>${domain}</strong> to default`);
      });
      actionDiv.appendChild(deleteBtn);
    }

    row.appendChild(infoDiv);
    row.appendChild(actionDiv);
    elements.rulesTableBody.appendChild(row);
  });
}

/**
 * Initializes DOM event handlers.
 */
function setupEventListeners() {
  // Helper to toggle hamburger menu dropdown (accessible to all handlers)
  const toggleMenu = (shouldOpen) => {
    if (!elements.headerMenuDropdown || !elements.menuToggleBtn) return;
    const isOpen = shouldOpen !== undefined ? shouldOpen : !elements.headerMenuDropdown.classList.contains('open');
    if (!isOpen) {
      if (elements.headerMenuDropdown.contains(document.activeElement)) {
        if (elements.menuToggleBtn) {
          elements.menuToggleBtn.focus();
        } else if (document.activeElement && document.activeElement.blur) {
          document.activeElement.blur();
        }
      }
    }
    elements.headerMenuDropdown.classList.toggle('open', isOpen);
    elements.headerMenuDropdown.setAttribute('aria-hidden', !isOpen);
    elements.menuToggleBtn.classList.toggle('active', isOpen);
    elements.menuToggleBtn.setAttribute('aria-expanded', isOpen);
  };

  // Topic Pill selection
  if (elements.topicsBar) {
    elements.topicsBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.topic-pill');
      if (!btn) return;
      const topic = btn.getAttribute('data-topic');
      if (!topic || topic === state.currentTopic) return;

      elements.topicsBar.querySelectorAll('.topic-pill').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');

      loadHeadlines(topic);
    });
  }

  // Feed Sort Order change listener
  if (elements.feedSortSelect) {
    elements.feedSortSelect.addEventListener('change', (e) => {
      if (!['curated', 'newest', 'oldest'].includes(e.target.value)) return;
      state.sortOrder = e.target.value;
      preferredSortOrder = state.sortOrder;
      try { localStorage.setItem(STORAGE_KEY_SORT_ORDER, state.sortOrder); } catch { /* Keep it for this session. */ }
      if (state.displayedTopic === state.currentTopic) applySortAndRender();
    });
  }

  // Hamburger Menu toggle & interactions
  if (elements.menuToggleBtn && elements.headerMenuDropdown) {
    elements.menuToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.header-menu-container')) {
        toggleMenu(false);
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elements.headerMenuDropdown.classList.contains('open')) {
        toggleMenu(false);
      }
    });

    // Close dropdown on action clicks
    elements.refreshBtn.addEventListener('click', () => toggleMenu(false));
    elements.openRulesBtn.addEventListener('click', () => toggleMenu(false));
    if (elements.openTopicsBtn) {
      elements.openTopicsBtn.addEventListener('click', () => toggleMenu(false));
    }

    // Close dropdown when clicking external links (e.g. Buy Me a Coffee)
    elements.headerMenuDropdown.addEventListener('click', (e) => {
      if (e.target.closest('a')) {
        toggleMenu(false);
      }
    });
  }

  // Refresh button - bypasses static cache to pull fresh live RSS
  elements.refreshBtn.addEventListener('click', () => {
    refreshCurrentTopic();
  });
  setupPullToRefresh();

  // Hide Locked Filter toggle
  elements.hideLockedCheckbox.checked = state.hideLocked;
  elements.hideLockedCheckbox.addEventListener('change', (e) => {
    state.hideLocked = e.target.checked;
    try { localStorage.setItem('news_hide_locked', state.hideLocked); } catch { /* Apply the filter for this session. */ }

    // Toggle card visibility
    const lockedCards = document.querySelectorAll('.news-card--locked');
    lockedCards.forEach((card) => {
      if (state.hideLocked) {
        card.classList.add('news-card--hidden');
      } else {
        card.classList.remove('news-card--hidden');
      }
    });
  });

  // Open / Close Rules Modal
  elements.openRulesBtn.addEventListener('click', () => {
    renderRulesTable();
    elements.rulesModal.classList.add('open');
  });

  elements.closeRulesBtn.addEventListener('click', () => {
    elements.rulesModal.classList.remove('open');
  });

  elements.rulesModal.addEventListener('click', (e) => {
    if (e.target === elements.rulesModal) {
      elements.rulesModal.classList.remove('open');
    }
  });

  // Quick Strategy Switcher Modal close events
  if (elements.closeSwitcherBtn) {
    elements.closeSwitcherBtn.addEventListener('click', closeStrategySwitcher);
  }
  if (elements.closeSwitcherDoneBtn) {
    elements.closeSwitcherDoneBtn.addEventListener('click', closeStrategySwitcher);
  }
  if (elements.strategySwitcherModal) {
    elements.strategySwitcherModal.addEventListener('click', (e) => {
      if (e.target === elements.strategySwitcherModal) {
        closeStrategySwitcher();
      }
    });
  }

  // Quick Article URL Opener Modal
  if (elements.openQuickUrlBtn) {
    elements.openQuickUrlBtn.addEventListener('click', () => {
      toggleMenu(false);
      openQuickUrlModal();
    });
  }
  if (elements.closeQuickUrlBtn) {
    elements.closeQuickUrlBtn.addEventListener('click', closeQuickUrlModal);
  }
  if (elements.closeQuickUrlDoneBtn) {
    elements.closeQuickUrlDoneBtn.addEventListener('click', closeQuickUrlModal);
  }
  if (elements.quickUrlModal) {
    elements.quickUrlModal.addEventListener('click', (e) => {
      if (e.target === elements.quickUrlModal) {
        closeQuickUrlModal();
      }
    });
    elements.quickUrlModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeQuickUrlModal();
      } else if (e.key === 'Tab') {
        const controls = Array.from(elements.quickUrlModal.querySelectorAll('button, input, select'))
          .filter((control) => !control.disabled && control.getClientRects().length);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    });
  }
  if (elements.inputQuickUrl) {
    elements.inputQuickUrl.addEventListener('input', (e) => {
      analyzeQuickUrl(e.target.value);
    });
    elements.inputQuickUrl.addEventListener('paste', (e) => {
      setTimeout(() => {
        analyzeQuickUrl(e.target.value);
      }, 0);
    });
  }
  if (elements.quickUrlClearBtn) {
    elements.quickUrlClearBtn.addEventListener('click', () => {
      if (elements.inputQuickUrl) {
        elements.inputQuickUrl.value = '';
        analyzeQuickUrl('');
        elements.inputQuickUrl.focus();
      }
    });
  }
  if (elements.quickUrlPasteBtn) {
    elements.quickUrlPasteBtn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (text && elements.inputQuickUrl) {
            elements.inputQuickUrl.value = text.trim();
            analyzeQuickUrl(text.trim());
            return;
          }
        }
      } catch (err) {
        console.warn({ error: err?.message }, 'Clipboard paste unavailable, focusing input instead');
      }
      if (elements.inputQuickUrl) {
        elements.inputQuickUrl.focus();
      }
    });
  }

  // Changing a tool updates the preview; only form submission opens the link.
  if (elements.quickUrlStrategySelect) {
    elements.quickUrlStrategySelect.addEventListener('change', () => {
      analyzeQuickUrl(elements.inputQuickUrl?.value || '');
    });
  }

  // Quick URL Form submission (e.g. Enter key in URL input field)
  if (elements.quickUrlForm) {
    elements.quickUrlForm.addEventListener('submit', (e) => {
      e.preventDefault();
      executeOpenQuickUrl();
    });
  }

  // Add / Edit Rule Form
  elements.addRuleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const domain = normalizeDomain(elements.inputDomain.value);
    const strategy = elements.selectStrategy.value;

    if (!domain) return;

    changeDomainStrategy(domain, strategy);
    elements.inputDomain.value = '';
    renderRulesTable();
  });

  // Reset All Rules button
  elements.resetRulesBtn.addEventListener('click', () => {
    if (confirm('Reset all domain rules and bypass strategies back to factory defaults?')) {
      resetDomainRulesToDefault();
      // Re-evaluate all articles in current feed with default rules
      state.rawArticles = (state.rawArticles || []).map((art) => {
        return applyStrategyToArticle(art);
      });
      state.articles = state.articles.map((art) => {
        const updated = applyStrategyToArticle(art);
        updateCardElement(updated);
        return updated;
      });
      renderRulesTable();
      showToast('✓ Reset all domain rules to factory defaults');
    }
  });

  // Export Settings (Topics, RSS Sources, and Paywall Rules as a single JSON file)
  const handleExportSettings = () => {
    try {
      const filename = exportSettingsAsJson();
      if (elements.headerMenuDropdown && elements.headerMenuDropdown.classList.contains('open')) {
        toggleMenu(false);
      }
      showToast(`✓ Settings exported to <strong>${escapeHtml(filename)}</strong>`);
    } catch (err) {
      showToast(`⚠️ Failed to export settings: ${escapeHtml(err.message || 'Unknown error')}`);
    }
  };

  if (elements.exportSettingsBtn) {
    elements.exportSettingsBtn.addEventListener('click', handleExportSettings);
  }
  if (elements.modalExportTopicsBtn) {
    elements.modalExportTopicsBtn.addEventListener('click', handleExportSettings);
  }
  if (elements.modalExportRulesBtn) {
    elements.modalExportRulesBtn.addEventListener('click', handleExportSettings);
  }

  // Topic Modal Tabs Switching
  if (elements.modalTabBtns) {
    elements.modalTabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-modal-tab');
        if (tab) switchTopicsModalTab(tab);
      });
    });
  }

  // Open / Close Topics Modal
  if (elements.openTopicsBtn && elements.topicsModal) {
    elements.openTopicsBtn.addEventListener('click', () => {
      if (elements.newTopicFormError) {
        elements.newTopicFormError.style.display = 'none';
        elements.newTopicFormError.textContent = '';
      }
      if (elements.newSourceFormError) {
        elements.newSourceFormError.style.display = 'none';
        elements.newSourceFormError.textContent = '';
      }
      switchTopicsModalTab('topics');
      updateLocalMenuLabels();
      renderTopicsModalTable();
      elements.topicsModal.classList.add('open');
    });
  }

  if (elements.closeTopicsBtn && elements.topicsModal) {
    elements.closeTopicsBtn.addEventListener('click', () => {
      elements.topicsModal.classList.remove('open');
    });
  }

  // Preset Local Edition Dropdown Selection
  if (elements.selectLocalPreset) {
    elements.selectLocalPreset.addEventListener('change', (e) => {
      const val = e.target.value;
      if (!val || val === 'CUSTOM') {
        if (elements.inputLocalCity) elements.inputLocalCity.focus();
        return;
      }
      const [city, region] = val.split('|');
      if (elements.inputLocalCity) elements.inputLocalCity.value = city;
      if (elements.inputLocalRegion) elements.inputLocalRegion.value = region;
    });
  }

  // Save Local Edition Button
  if (elements.saveLocalBtn) {
    elements.saveLocalBtn.addEventListener('click', () => {
      const city = elements.inputLocalCity ? elements.inputLocalCity.value.trim() : '';
      const region = elements.inputLocalRegion ? elements.inputLocalRegion.value.trim() : '';

      if (!city || !region) {
        showToast('⚠️ Please provide both a city and province/region.');
        return;
      }

      setLocalEdition(city, region);
      updateLocalMenuLabels();
      renderTopicsBar();
      renderTopicsModalTable();

      // If user is currently looking at local city or local region, reload it
      if (state.currentTopic === 'VANCOUVER' || state.currentTopic === 'BC') {
        loadHeadlines(state.currentTopic);
      }
      showToast(`✓ Local edition updated to <strong>${city}, ${region}</strong>`);
    });
  }

  // Save & Apply Button (Topics Bar tab)
  if (elements.saveTopicsBtn && elements.topicsModal) {
    elements.saveTopicsBtn.addEventListener('click', () => {
      renderTopicsBar();

      // If current topic is no longer visible, fallback to first visible topic
      const visible = getVisibleTopics();
      if (!visible.some((t) => t.id === state.currentTopic)) {
        loadHeadlines(visible[0] ? visible[0].id : 'TOP');
      }

      elements.topicsModal.classList.remove('open');
      showToast('✓ Topic preferences saved');
    });
  }

  if (elements.topicsModal) {
    elements.topicsModal.addEventListener('click', (e) => {
      if (e.target === elements.topicsModal) {
        elements.topicsModal.classList.remove('open');
      }
    });
  }

  // Preset Dropdown Selection in New Topic Tab
  if (elements.selectTopicPreset) {
    elements.selectTopicPreset.addEventListener('change', (e) => {
      const val = e.target.value;
      if (elements.newTopicFormError) {
        elements.newTopicFormError.style.display = 'none';
        elements.newTopicFormError.textContent = '';
      }
      if (!val) return;
      const parts = val.split('|');
      const presetLabel = parts[0] || '';
      const presetKeywords = parts[1] || '';

      if (elements.inputNewTopicLabel) elements.inputNewTopicLabel.value = presetLabel;
      if (elements.inputNewTopicKeywords) elements.inputNewTopicKeywords.value = presetKeywords;
    });
  }

  // Source checklist filtering & quick selection in New Topic Tab
  if (elements.inputTopicSourceSearch) {
    elements.inputTopicSourceSearch.addEventListener('input', (e) => {
      renderTopicSourcesChecklist(e.target.value.trim());
    });
  }

  if (elements.btnSelectAllSources) {
    elements.btnSelectAllSources.addEventListener('click', () => {
      getAllSources().forEach((s) => selectedTopicSourceIds.add(s.id));
      renderTopicSourcesChecklist(elements.inputTopicSourceSearch ? elements.inputTopicSourceSearch.value.trim() : '');
    });
  }

  if (elements.btnClearAllSources) {
    elements.btnClearAllSources.addEventListener('click', () => {
      selectedTopicSourceIds.clear();
      renderTopicSourcesChecklist(elements.inputTopicSourceSearch ? elements.inputTopicSourceSearch.value.trim() : '');
    });
  }

  // Add New Topic Form Submit
  if (elements.addNewTopicForm) {
    elements.addNewTopicForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const label = elements.inputNewTopicLabel ? elements.inputNewTopicLabel.value.trim() : '';
      const keywordsRaw = elements.inputNewTopicKeywords ? elements.inputNewTopicKeywords.value.trim() : '';
      const selectedSources = Array.from(selectedTopicSourceIds);

      if (!label) {
        if (elements.newTopicFormError) {
          elements.newTopicFormError.style.display = 'block';
          elements.newTopicFormError.textContent = 'Please provide a topic label.';
        }
        return;
      }

      if (!keywordsRaw && selectedSources.length === 0) {
        if (elements.newTopicFormError) {
          elements.newTopicFormError.style.display = 'block';
          elements.newTopicFormError.textContent = 'Please enter at least one keyword/phrase or select at least one RSS source.';
        }
        return;
      }

      if (elements.newTopicFormError) {
        elements.newTopicFormError.style.display = 'none';
        elements.newTopicFormError.textContent = '';
      }

      const submitBtn = elements.newTopicSubmitBtn;
      const btnText = elements.newTopicBtnText;
      const btnSpinner = elements.newTopicBtnSpinner;

      if (submitBtn) submitBtn.disabled = true;
      if (btnSpinner) btnSpinner.style.display = 'inline-block';
      if (btnText) btnText.textContent = 'Verifying topic feed...';

      try {
        // If keywords are specified, verify Google News RSS feed
        if (keywordsRaw) {
          const parsedKeywords = parseCommaKeywords(keywordsRaw);
          const formattedQuery = formatKeywordsQuery(parsedKeywords);
          const feedUrl = buildGoogleNewsSearchUrl(formattedQuery);

          const verification = await verifyFeed(feedUrl);
          if (!verification.ok || verification.count === 0) {
            // If no sources are selected and Google News returns 0 articles, warn user
            if (selectedSources.length === 0) {
              if (elements.newTopicFormError) {
                elements.newTopicFormError.style.display = 'block';
                elements.newTopicFormError.textContent = verification.error || 'No news was returned for these keywords. Try another search or select an RSS source.';
              }
              return;
            }
          }
        }

        const newTopic = addCustomTopic({
          label,
          keywords: keywordsRaw,
          sources: selectedSources,
        });

        if (elements.inputNewTopicLabel) elements.inputNewTopicLabel.value = '';
        if (elements.inputNewTopicKeywords) elements.inputNewTopicKeywords.value = '';
        if (elements.selectTopicPreset) elements.selectTopicPreset.value = '';
        selectedTopicSourceIds.clear();
        renderTopicSourcesChecklist();

        renderTopicsModalTable();
        renderTopicsBar();
        elements.topicsModal.classList.remove('open');

        loadHeadlines(newTopic.id);
        const sourceInfo = selectedSources.length > 0 ? ` with ${selectedSources.length} RSS source(s)` : '';
        showToast(`✓ Added topic "<strong>${escapeHtml(newTopic.label)}</strong>"${sourceInfo}`);
      } catch (err) {
        if (elements.newTopicFormError) {
          elements.newTopicFormError.style.display = 'block';
          elements.newTopicFormError.textContent = `Error creating topic: ${err.message || 'Unknown error'}`;
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (btnSpinner) btnSpinner.style.display = 'none';
        if (btnText) btnText.textContent = 'Add Topic';
      }
    });
  }

  // RSS Sources Catalog Search
  if (elements.inputSourceCatalogSearch) {
    elements.inputSourceCatalogSearch.addEventListener('input', (e) => {
      renderSourcesCatalog(e.target.value.trim());
    });
  }

  // Add RSS Source Form Submit
  if (elements.addNewSourceForm) {
    elements.addNewSourceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = elements.inputNewSourceName ? elements.inputNewSourceName.value.trim() : '';
      const url = elements.inputNewSourceUrl ? elements.inputNewSourceUrl.value.trim() : '';

      if (!url || !/^https?:\/\//i.test(url)) {
        if (elements.newSourceFormError) {
          elements.newSourceFormError.style.display = 'block';
          elements.newSourceFormError.textContent = 'Please provide a valid direct RSS/Atom feed URL (starting with http:// or https://).';
        }
        return;
      }

      if (elements.newSourceFormError) {
        elements.newSourceFormError.style.display = 'none';
        elements.newSourceFormError.textContent = '';
      }

      const submitBtn = elements.newSourceSubmitBtn;
      const btnText = elements.newSourceBtnText;
      const btnSpinner = elements.newSourceBtnSpinner;

      if (submitBtn) submitBtn.disabled = true;
      if (btnSpinner) btnSpinner.style.display = 'inline-block';
      if (btnText) btnText.textContent = 'Verifying feed...';

      try {
        const verification = await verifyFeed(url);
        if (!verification.ok || verification.count === 0) {
          if (elements.newSourceFormError) {
            elements.newSourceFormError.style.display = 'block';
            elements.newSourceFormError.textContent = verification.error || 'This feed is currently unavailable. Check the URL or try again shortly.';
          }
          return;
        }

        const sourceTitle = name || verification.title || 'Direct RSS Feed';
        const newSource = addCustomSource({
          name: sourceTitle,
          url,
          maxArticles: 8,
        });

        if (elements.inputNewSourceName) elements.inputNewSourceName.value = '';
        if (elements.inputNewSourceUrl) elements.inputNewSourceUrl.value = '';

        renderSourcesCatalog(elements.inputSourceCatalogSearch ? elements.inputSourceCatalogSearch.value.trim() : '');
        renderTopicSourcesChecklist(elements.inputTopicSourceSearch ? elements.inputTopicSourceSearch.value.trim() : '');
        showToast(`✓ Added RSS source "<strong>${escapeHtml(newSource.name)}</strong>" (${verification.count} stories available)`);
      } catch (err) {
        if (elements.newSourceFormError) {
          elements.newSourceFormError.style.display = 'block';
          elements.newSourceFormError.textContent = `Error verifying feed: ${err.message || 'Network error'}`;
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (btnSpinner) btnSpinner.style.display = 'none';
        if (btnText) btnText.textContent = 'Add Source';
      }
    });
  }

  // Reset Topics to Defaults
  if (elements.resetTopicsBtn) {
    elements.resetTopicsBtn.addEventListener('click', () => {
      if (confirm('Reset all topics, order, and local edition back to factory defaults?')) {
        resetTopicsToDefault();
        resetFeedsToDefault();
        updateLocalMenuLabels();
        renderTopicsModalTable();
        renderTopicsBar();

        const visible = getVisibleTopics();
        if (!visible.some((t) => t.id === state.currentTopic)) {
          loadHeadlines(visible[0] ? visible[0].id : 'TOP');
        } else if (state.currentTopic === 'VANCOUVER' || state.currentTopic === 'BC') {
          loadHeadlines(state.currentTopic);
        }
        showToast('✓ Reset topics and edition to factory defaults');
      }
    });
  }

  // Handle browser back / forward navigation via hashchange
  window.addEventListener('hashchange', () => {
    const hashTopicId = window.location.hash.replace(/^#/, '').toUpperCase();
    if (hashTopicId && hashTopicId !== state.currentTopic && getTopicById(hashTopicId)) {
      loadHeadlines(hashTopicId);
    }
  });
}

// App Bootstrap
document.addEventListener('DOMContentLoaded', () => {
  initPWA();
  updateLocalMenuLabels();
  state.currentTopic = getInitialTopic();
  renderTopicsBar();
  setupEventListeners();

  // Check if opened via Web Share Target or external link parameter FIRST
  checkIncomingShare();
  window.addEventListener('pageshow', () => checkIncomingShare());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkIncomingShare();
    }
  });
  window.addEventListener('focus', () => checkIncomingShare());

  // Native reloads (including browsers' pull-to-refresh) retain the same selection.
  const isReload = window.performance?.getEntriesByType('navigation')[0]?.type === 'reload';
  if (isReload) refreshCurrentTopic();
  else loadHeadlines(state.currentTopic);
});
