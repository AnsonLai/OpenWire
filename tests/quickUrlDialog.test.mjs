import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const appSource = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const imports = {};
// Run the real controller and event handlers against a small DOM double, using
// the app's actual service imports. Leave feed/PWA bootstrap to the browser.
const controllerSource = appSource.replace(/^import\s+[\s\S]*?from\s+'([^']+)';/gm, (_, specifier) => {
  imports[specifier] = null;
  return '';
}).replace(/^export\s+(?=(?:function|const)\s)/gm, '');
const services = Object.assign({}, ...await Promise.all(Object.keys(imports).map((specifier) =>
  import(new URL(`../js/${specifier.slice(2)}`, import.meta.url).href)
)));

function createStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
  };
}

function createApp({ storage = createStorage(), query = '' } = {}) {
  globalThis.localStorage = storage;
  const nodes = new Map();
  const documentListeners = new Map();
  const document = {
    title: 'OpenWire',
    activeElement: null,
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(handler);
    },
    dispatch(type, extra = {}) {
      const event = { target: { closest: () => null }, cancelable: true, defaultPrevented: false, ...extra,
        preventDefault() { this.defaultPrevented = true; } };
      for (const handler of documentListeners.get(type) || []) handler(event);
      return event;
    },
    querySelectorAll: () => [],
    getElementById(id) {
      if (!nodes.has(id)) {
        const classes = new Set();
        const listeners = new Map();
        const attributes = new Map();
        const node = {
          id, value: '', textContent: '', checked: false, disabled: false,
          style: {}, isConnected: true,
          options: [{ value: 'auto', textContent: '' }],
          classList: {
            add: (value) => classes.add(value),
            remove: (value) => classes.delete(value),
            contains: (value) => classes.has(value),
            toggle(value, enabled) { enabled ? classes.add(value) : classes.delete(value); },
          },
          setAttribute: (key, value) => attributes.set(key, String(value)),
          getAttribute: (key) => attributes.get(key),
          removeAttribute: (key) => attributes.delete(key),
          contains: (other) => other === node,
          getClientRects: () => node.style.display === 'none' ? [] : [{}],
          focus() { document.activeElement = node; },
          querySelectorAll: () => [],
          addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
          },
          dispatch(type, extra = {}) {
            const event = { target: node, defaultPrevented: false, ...extra,
              preventDefault() { this.defaultPrevented = true; } };
            for (const handler of listeners.get(type) || []) handler(event);
            return event;
          },
        };
        nodes.set(id, node);
      }
      return nodes.get(id);
    },
  };
  const initialUrl = `https://openwire.test/${query}#TOP`;
  const window = {
    location: { href: initialUrl, pathname: '/', search: query, hash: '#TOP' },
    history: {
      replaceState(_state, _title, path) {
        const clean = new URL(path, initialUrl);
        Object.assign(window.location, { href: clean.href, search: clean.search, hash: clean.hash });
      },
    },
    addEventListener() {},
  };
  const context = vm.createContext({ ...services, document, window, localStorage: storage,
    URL, URLSearchParams, console, navigator: {}, history: window.history, setTimeout, clearTimeout });
  vm.runInContext(controllerSource, context, { filename: 'app.js' });
  const get = (id) => document.getElementById(id);
  get('quickUrlModal').inert = true;
  get('quickUrlStrategySelect').value = 'auto';
  get('quickUrlModal').querySelectorAll = () => [
    'closeQuickUrlBtn', 'inputQuickUrl', 'quickUrlPasteBtn', 'quickUrlClearBtn',
    'quickUrlStrategySelect', 'quickUrlRememberCheck', 'closeQuickUrlDoneBtn', 'quickUrlOpenBtn',
  ].map(get);
  document.activeElement = get('menuToggleBtn');
  // Keep domain writes real without rerendering the unrelated news feed.
  context.changeDomainStrategy = (domain, strategy) => services.setDomainRule(domain, { strategy });
  context.setupEventListeners();
  return { context, window, document, storage, get,
    choose(value) {
      get('quickUrlStrategySelect').value = value;
      get('quickUrlStrategySelect').dispatch('change');
    },
    submit() { return get('quickUrlForm').dispatch('submit'); },
  };
}

test('incoming shares show a populated confirmation without navigating or saving a rule', () => {
  const app = createApp({ query: '?url=https%3A%2F%2Fwww.nytimes.com%2Fstory' });
  app.context.checkIncomingShare();
  assert.equal(app.get('inputQuickUrl').value, 'https://www.nytimes.com/story');
  assert.equal(app.get('quickUrlStrategySelect').value, 'auto');
  assert.equal(app.get('quickUrlStrategyBadge').textContent, 'SMRY.ai');
  assert.equal(app.get('quickUrlOpenBtn').textContent, 'Open with SMRY.ai');
  assert.equal(app.get('quickUrlOpenBtn').disabled, false);
  assert.equal(app.get('quickUrlModal').inert, false);
  assert.equal(app.document.activeElement, app.get('quickUrlOpenBtn'));
  assert.equal(app.window.location.href, 'https://openwire.test/#TOP');
  assert.equal(app.storage.getItem('news_quick_url_strategy'), null);
  assert.equal(services.getDomainRule('nytimes.com').isCustom, false);
});

test('tool changes preview only; confirmation persists the choice across app loads', () => {
  const app = createApp();
  app.context.openQuickUrlModal('https://nytimes.com/story');
  const before = app.window.location.href;
  app.choose('wayback');
  assert.equal(app.window.location.href, before);
  assert.equal(app.storage.getItem('news_quick_url_strategy'), null);
  assert.match(app.get('quickUrlToolDescription').textContent, /older saved versions/);
  assert.equal(app.get('quickUrlStrategyBadge').textContent, 'Wayback Machine');
  assert.equal(app.submit().defaultPrevented, true);
  assert.equal(app.window.location.href, 'https://web.archive.org/web/*/https://nytimes.com/story');
  assert.equal(app.storage.getItem('news_quick_url_strategy'), 'wayback');
  assert.equal(services.getDomainRule('nytimes.com').isCustom, false);
  const reopened = createApp({ storage: app.storage });
  reopened.context.openQuickUrlModal('https://bbc.com/story');
  assert.equal(reopened.get('quickUrlStrategySelect').value, 'wayback');
  reopened.choose('direct');
  reopened.get('closeQuickUrlDoneBtn').dispatch('click');
  reopened.context.openQuickUrlModal('https://bbc.com/story');
  assert.equal(reopened.get('quickUrlStrategySelect').value, 'wayback');
  assert.equal(reopened.get('quickUrlRememberCheck').checked, false);
});

test('first use of Auto respects an existing saved domain rule', () => {
  const app = createApp();
  services.setDomainRule('nytimes.com', { strategy: 'archive_is' });
  app.context.openQuickUrlModal('https://nytimes.com/story');
  assert.equal(app.get('quickUrlStrategySelect').value, 'auto');
  assert.equal(app.get('quickUrlStrategyBadge').textContent, 'Archive.is');
  assert.equal(app.get('quickUrlRuleSourceTag').textContent, 'Saved for this site');
  app.submit();
  assert.equal(app.window.location.href, 'https://archive.is/newest/https://nytimes.com/story');
  assert.equal(app.storage.getItem('news_quick_url_strategy'), 'auto');
});

test('domain defaults change only when explicitly checked and confirmed', () => {
  const app = createApp();
  app.context.openQuickUrlModal('https://nytimes.com/story');
  app.choose('unwall');
  app.get('quickUrlRememberCheck').checked = true;
  assert.equal(services.getDomainRule('nytimes.com').strategy, 'smry');
  app.submit();
  assert.equal(services.getDomainRule('nytimes.com').strategy, 'unwall');
  assert.equal(services.getDomainRule('nytimes.com').isCustom, true);
});

test('unsupported Freedium stays selected with an actionable error and cannot be submitted', () => {
  const storage = createStorage({ news_quick_url_strategy: 'freedium' });
  const app = createApp({ storage });
  app.context.openQuickUrlModal('https://bbc.com/story');
  const before = app.window.location.href;
  assert.equal(app.get('quickUrlStrategySelect').value, 'freedium');
  assert.equal(app.get('quickUrlOpenBtn').disabled, true);
  assert.match(app.get('quickUrlError').textContent, /Choose another tool/);
  app.submit();
  assert.equal(app.window.location.href, before);
  assert.equal(storage.getItem('news_quick_url_strategy'), 'freedium');
  app.choose('direct');
  assert.equal(app.get('quickUrlOpenBtn').disabled, false);
  assert.equal(app.get('quickUrlError').style.display, 'none');
});

test('invalid links cannot navigate or erase a choice; schemeless links can be confirmed', () => {
  const app = createApp();
  app.context.openQuickUrlModal();
  app.choose('direct');
  const before = app.window.location.href;
  for (const value of ['', 'not a url', 'https://', 'ftp://bbc.com/story', 'javascript:alert(1)', 'https://user:pass@bbc.com']) {
    app.get('inputQuickUrl').value = value;
    app.get('inputQuickUrl').dispatch('input');
    assert.equal(app.get('quickUrlOpenBtn').disabled, true, value);
    app.submit();
    assert.equal(app.window.location.href, before);
    assert.equal(app.get('quickUrlStrategySelect').value, 'direct');
    assert.equal(app.storage.getItem('news_quick_url_strategy'), null);
  }
  app.get('inputQuickUrl').value = 'bbc.com:8080/story';
  app.get('inputQuickUrl').dispatch('input');
  assert.equal(app.get('quickUrlOpenBtn').disabled, false);
  app.submit();
  assert.equal(app.window.location.href, 'https://bbc.com:8080/story');
});

test('unknown preferences fall back to Auto, and blocked storage does not block opening', () => {
  const app = createApp({ storage: createStorage({ news_quick_url_strategy: 'removed-tool' }) });
  app.context.openQuickUrlModal('https://bbc.com/story');
  assert.equal(app.get('quickUrlStrategySelect').value, 'auto');
  app.storage.setItem = () => { throw new Error('Storage unavailable'); };
  app.submit();
  assert.equal(app.window.location.href, 'https://bbc.com/story');
});

test('keyboard focus stays in the dialog, and Escape cancels without saving', () => {
  const app = createApp();
  app.context.openQuickUrlModal('https://bbc.com/story');
  app.get('quickUrlOpenBtn').focus();
  assert.equal(app.get('quickUrlModal').dispatch('keydown', { key: 'Tab' }).defaultPrevented, true);
  assert.equal(app.document.activeElement, app.get('closeQuickUrlBtn'));
  app.get('quickUrlModal').dispatch('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(app.document.activeElement, app.get('quickUrlOpenBtn'));
  app.get('quickUrlModal').dispatch('keydown', { key: 'Escape' });
  assert.equal(app.get('quickUrlModal').classList.contains('open'), false);
  assert.equal(app.get('quickUrlModal').inert, true);
  assert.equal(app.get('quickUrlModal').getAttribute('aria-hidden'), 'true');
  assert.equal(app.document.activeElement, app.get('menuToggleBtn'));
  assert.equal(app.storage.getItem('news_quick_url_strategy'), null);
});

test('switching topics while a request is pending does not render the previous topic late', async () => {
  const app = createApp();
  let finishFirst;
  const rendered = [];
  app.context.applySortAndRender = () => {
    vm.runInContext('state.articles = [...state.rawArticles]', app.context);
    rendered.push(vm.runInContext('state.articles[0].title', app.context));
  };
  app.context.fetchTopHeadlines = (topic, options) => {
    if (topic === 'TOP') return new Promise((resolve) => { finishFirst = resolve; });
    options.onStatus({ source: 'live', updatedAt: Date.now() });
    return Promise.resolve([{ title: 'Business story' }]);
  };
  const first = app.context.loadHeadlines('TOP');
  await app.context.loadHeadlines('BUSINESS');
  finishFirst([{ title: 'Top story arriving late' }]);
  await first;
  assert.deepEqual(rendered, ['Business story']);
  assert.equal(vm.runInContext('state.currentTopic', app.context), 'BUSINESS');
  assert.match(app.get('feedUpdateStatus').textContent, /^Updated/);
});

test('a refresh keeps existing headlines visible and reports a saved fallback', async () => {
  const app = createApp();
  vm.runInContext('state.rawArticles = [{ title: "Saved story" }]; state.displayedTopic = "TOP";', app.context);
  app.context.applySortAndRender = () => vm.runInContext('state.articles = [...state.rawArticles]', app.context);
  let complete;
  app.context.fetchTopHeadlines = (_topic, options) => new Promise((resolve) => {
    complete = () => {
      options.onStatus({ source: 'saved', updatedAt: Date.now() - 3600000, refreshFailed: true });
      resolve([{ title: 'Saved story' }]);
    };
  });
  const refresh = app.context.loadHeadlines('TOP', { forceLive: true });
  assert.equal(app.get('feedList').style.display, 'flex');
  complete();
  await refresh;
  assert.match(app.get('feedUpdateStatus').textContent, /Refresh unavailable. Showing saved headlines/);
});

function stubFeedRendering(app) {
  const rendered = [];
  app.context.renderFeed = () => {
    rendered.push(Array.from(vm.runInContext('state.articles.map(a => a.title)', app.context)));
  };
  return rendered;
}

function swipe(app, { dx = 0, dy = 100, cancel = false, target } = {}) {
  app.document.dispatch('touchstart', { touches: [{ clientX: 40, clientY: 100 }], ...(target ? { target } : {}) });
  const move = app.document.dispatch('touchmove', { touches: [{ clientX: 40 + dx, clientY: 100 + dy }] });
  app.document.dispatch(cancel ? 'touchcancel' : 'touchend', { touches: [] });
  return move;
}

const sampleHeadlines = [
  { title: 'Older curated lead', pubDate: '2026-10-08T12:00:00Z' },
  { title: 'New story', pubDate: '2026-10-09T12:00:00Z' },
];

test('menu and pull refresh use the same live path, keep topic/sort, and share a pending request', async () => {
  const app = createApp({ storage: createStorage({ news_sort_order: 'newest' }) });
  const rendered = stubFeedRendering(app);
  const calls = [];
  let finish;
  app.context.fetchTopHeadlines = (topic, options) => {
    calls.push({ topic, forceLive: options.forceLive });
    return new Promise((resolve) => { finish = () => {
      options.onStatus({ source: 'live', updatedAt: Date.now() });
      resolve(sampleHeadlines);
    }; });
  };
  vm.runInContext('state.currentTopic = "BUSINESS";', app.context);
  app.get('refreshBtn').dispatch('click');
  const pending = app.context.refreshCurrentTopic();
  assert.equal(swipe(app).defaultPrevented, true);
  assert.deepEqual(calls, [{ topic: 'BUSINESS', forceLive: true }]);
  finish();
  await pending;
  assert.deepEqual(rendered, [['New story', 'Older curated lead']]);
  assert.equal(app.window.location.hash, '#business');
  assert.equal(app.get('feedSortSelect').value, 'newest');
  assert.equal(app.get('pullRefreshStatus').hidden, true);

  swipe(app);
  const pullPending = app.context.refreshCurrentTopic();
  assert.deepEqual(calls, [
    { topic: 'BUSINESS', forceLive: true }, { topic: 'BUSINESS', forceLive: true },
  ]);
  finish();
  await pullPending;
  assert.equal(app.get('feedSortSelect').value, 'newest');
});

test('sort changes during refresh survive completion and a subsequent app load', async () => {
  const app = createApp();
  stubFeedRendering(app);
  let finish;
  app.context.fetchTopHeadlines = (_topic, options) => new Promise((resolve) => { finish = () => {
    options.onStatus({ source: 'live', updatedAt: Date.now() });
    resolve(sampleHeadlines);
  }; });
  const pending = app.context.loadHeadlines('LATEST');
  assert.equal(app.get('feedSortSelect').value, 'newest');
  app.get('feedSortSelect').value = 'oldest';
  app.get('feedSortSelect').dispatch('change');
  finish();
  await pending;
  assert.equal(app.get('feedSortSelect').value, 'oldest');
  assert.deepEqual(Array.from(vm.runInContext('state.articles.map(a => a.title)', app.context)),
    ['Older curated lead', 'New story']);
  assert.equal(app.storage.getItem('news_sort_order'), 'oldest');

  const reopened = createApp({ storage: app.storage });
  stubFeedRendering(reopened);
  reopened.context.fetchTopHeadlines = async () => sampleHeadlines;
  await reopened.context.loadHeadlines('TOP');
  assert.equal(reopened.get('feedSortSelect').value, 'oldest');
  await reopened.context.loadHeadlines('LATEST');
  assert.equal(reopened.get('feedSortSelect').value, 'oldest');
});

test('failed live refresh retains current headlines instead of an older cache, without rerendering', async () => {
  const app = createApp();
  const rendered = stubFeedRendering(app);
  let status = { source: 'live', updatedAt: 2000 };
  let headlines = sampleHeadlines;
  app.context.fetchTopHeadlines = async (_topic, options) => {
    options.onStatus(status);
    return headlines;
  };
  await app.context.loadHeadlines('BUSINESS');
  status = { source: 'saved', updatedAt: 1000, refreshFailed: true };
  headlines = [{ title: 'Stale cached story' }];
  await app.context.refreshCurrentTopic();
  assert.equal(rendered.length, 1);
  assert.equal(vm.runInContext('state.rawArticles[0].title', app.context), 'Older curated lead');
  assert.equal(vm.runInContext('state.currentTopic', app.context), 'BUSINESS');
  assert.match(app.get('feedUpdateStatus').textContent, /Keeping your current headlines/);
  assert.equal(app.get('errorState').style.display, 'none');
  assert.equal(app.get('loadingState').style.display, 'none');

  // A newer published snapshot remains a useful fallback when live RSS fails.
  status.updatedAt = 3000;
  await app.context.refreshCurrentTopic();
  assert.equal(rendered.length, 2);
  assert.equal(vm.runInContext('state.feedUpdatedAt', app.context), 3000);
  assert.match(app.get('feedUpdateStatus').textContent, /Showing saved headlines/);
});

test('pull gestures ignore horizontal motion, short pulls, cancellation, scrolling, controls and dialogs', () => {
  const app = createApp();
  let refreshes = 0;
  app.context.refreshCurrentTopic = () => { refreshes++; };
  assert.equal(swipe(app, { dx: 150, dy: 30 }).defaultPrevented, false);
  swipe(app, { dy: 50 });
  swipe(app, { cancel: true });
  app.window.scrollY = 20;
  swipe(app);
  app.window.scrollY = 0;
  swipe(app, { target: { closest: () => ({ tagName: 'SELECT' }) } });
  app.get('quickUrlModal').classList.add('open');
  swipe(app);
  app.get('quickUrlModal').classList.remove('open');
  app.document.dispatch('touchstart', { touches: [{ clientX: 40, clientY: 100 }] });
  app.document.dispatch('touchmove', { touches: [{ clientX: 40, clientY: 200 }, { clientX: 60, clientY: 220 }] });
  app.document.dispatch('touchend');
  assert.equal(refreshes, 0);
  swipe(app);
  assert.equal(refreshes, 1);
});

test('refreshing a newly selected pending topic never shows the previous topic or allows late results', async () => {
  const app = createApp();
  const rendered = stubFeedRendering(app);
  const jobs = [];
  app.context.fetchTopHeadlines = (topic, options) => new Promise((resolve) => {
    jobs.push({ topic, complete() {
      options.onStatus({ source: 'live', updatedAt: Date.now() });
      resolve([{ title: topic }]);
    } });
  });
  const initial = app.context.loadHeadlines('TOP');
  jobs[0].complete();
  await initial;
  const topicLoad = app.context.loadHeadlines('BUSINESS');
  const topicRefresh = app.context.refreshCurrentTopic();
  assert.equal(app.get('feedList').style.display, 'none');
  const latestTopic = app.context.loadHeadlines('WORLD');
  jobs[3].complete();
  await latestTopic;
  jobs[2].complete();
  await topicRefresh;
  jobs[1].complete();
  await topicLoad;
  assert.deepEqual(rendered, [['TOP'], ['WORLD']]);
  assert.equal(vm.runInContext('state.displayedTopic', app.context), 'WORLD');
  assert.equal(app.window.location.hash, '#world');
});

test('browser reload requests live RSS after restoring topic and sort; a normal opening uses snapshots', () => {
  for (const navigation of ['reload', 'navigate']) {
    const app = createApp({ storage: createStorage({ news_current_topic: 'BUSINESS', news_sort_order: 'newest' }) });
    const calls = [];
    app.window.location.hash = '';
    app.window.performance = { getEntriesByType: () => [{ type: navigation }] };
    app.context.initPWA = () => {};
    app.context.updateLocalMenuLabels = () => {};
    app.context.setupEventListeners = () => {};
    app.context.renderTopicsBar = () => {
      assert.equal(vm.runInContext('state.currentTopic', app.context), 'BUSINESS');
    };
    app.context.loadHeadlines = async (topic, options = {}) => {
      calls.push({ topic, forceLive: !!options.forceLive });
    };
    app.document.dispatch('DOMContentLoaded');
    assert.deepEqual(calls, [{ topic: 'BUSINESS', forceLive: navigation === 'reload' }]);
    assert.equal(vm.runInContext('state.sortOrder', app.context), 'newest');
  }
});

test('a refresh with no usable fallback keeps the current feed and clears loading', async () => {
  const app = createApp();
  const rendered = stubFeedRendering(app);
  app.context.fetchTopHeadlines = async (_topic, options) => {
    options.onStatus({ source: 'live', updatedAt: Date.now() });
    return sampleHeadlines;
  };
  await app.context.loadHeadlines('TOP');
  app.context.console = { ...console, error() {} };
  app.context.fetchTopHeadlines = async () => { throw new Error('Offline'); };
  await app.context.refreshCurrentTopic();
  assert.equal(rendered.length, 1);
  assert.equal(app.get('feedList').style.display, 'flex');
  assert.equal(app.get('errorState').style.display, 'none');
  assert.equal(vm.runInContext('state.isLoading', app.context), false);
  assert.equal(app.get('refreshIcon').classList.contains('spin'), false);
  assert.match(app.get('feedUpdateStatus').textContent, /Keeping your current headlines/);
});
