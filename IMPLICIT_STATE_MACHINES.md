# Implicit State Machines in OpenWire News Aggregator

This document catalogs the implicit state machines distributed across `js/`, `sw.js`, `index.html`, and the Python Jamstack pre-generators (`sync_news.py`, `article_metadata.py`, `preview_text.py`). For each state machine, it lists the state variables, compares the mathematically possible combinations against valid semantic states, and documents transitions that lead to impossible states, dead ends, or unguarded race conditions.

---

## 1. Feed Loading, Topic Selection & View Container State Machine

**Locations:**
- `js/app.js`: `state` (L75–84), `loadHeadlines` (L1674–1801), `updateStatusCounter` (L1556–1568), `refreshCurrentTopic` (L1804–1816), `changeLibrarySources` (L2189–2203)

### State Variables
- **In-Memory (`state` & module globals):**
  - `state.isLoading` $\in \{\text{true}, \text{false}\}$ (2)
  - `state.currentTopic === state.displayedTopic` $\in \{\text{true}, \text{false}\}$ (2, whether the selected topic matches the rendered topic, including `displayedTopic === null`)
  - `state.articles` / `shown` state $\in \{\text{Empty (0)}, \text{HasVisible (>0)}, \text{AllHidden (>0, shown=0)}\}$ (3)
  - `activeRefresh` $\in \{\text{null}, \text{object}\}$ (2)
  - `headlinesRequestId` $\in \mathbb{N}$ (monotonic request counter)
- **DOM View Flags:**
  - `elements.loadingState.style.display` $\in \{\text{'block'}, \text{'none'}\}$ (2)
  - `elements.errorState.style.display` $\in \{\text{'block'}, \text{'none'}\}$ (2)
  - `elements.feedList.style.display` $\in \{\text{'flex'}, \text{'none'}\}$ (2)
  - `elements.filteredEmptyState.hidden` $\in \{\text{true}, \text{false}\}$ (2)
  - `elements.feedStatus.hidden` $\in \{\text{true}, \text{false}\}$ (2)
  - `elements.refreshIcon.classList.contains('spin')` $\in \{\text{true}, \text{false}\}$ (2)
  - `elements.retrySourcesBtn.disabled` $\in \{\text{true}, \text{false}\}$ (2)

### Mathematical Combinations vs. Valid States
- **Mathematically Possible Combinations:**
  $$2 (\text{isLoading}) \times 2 (\text{topicMatch}) \times 3 (\text{articleSet}) \times 2 (\text{activeRefresh}) \times 2^7 (\text{DOM flags}) = \mathbf{3,072}$$
- **Valid Semantic States (7):**
  1. **Initial Cold Load:** `isLoading=true`, `topicMatch=false`, `articles=Empty`, `loadingState='block'`, `errorState='none'`, `feedList='none'`, `filteredEmptyState.hidden=true`, `spin=true`.
  2. **Topic Switch Loading:** `isLoading=true`, `topicMatch=false`, `articles=HasVisible|AllHidden` (from previous topic), `loadingState='block'`, `errorState='none'`, `feedList='none'`, `filteredEmptyState.hidden=true`, `spin=true`.
  3. **In-Place Refresh (`keepVisible=true`):** `isLoading=true`, `topicMatch=true`, `articles=HasVisible|AllHidden`, `loadingState='none'`, `errorState='none'`, `feedList='flex'|'none'`, `spin=true`, `activeRefresh!=null`.
  4. **Loaded (Normal Feed):** `isLoading=false`, `topicMatch=true`, `articles=HasVisible`, `loadingState='none'`, `errorState='none'`, `feedList='flex'`, `filteredEmptyState.hidden=true`, `feedStatus.hidden=false`, `spin=false`.
  5. **Loaded (All Filtered Out):** `isLoading=false`, `topicMatch=true`, `articles=AllHidden`, `loadingState='none'`, `errorState='none'`, `feedList='none'`, `filteredEmptyState.hidden=false`, `feedStatus.hidden=false`, `spin=false`.
  6. **Loaded (Zero Headlines / All Sources Disabled):** `isLoading=false`, `topicMatch=true`, `articles=Empty`, `loadingState='none'`, `errorState='none'`, `feedList='flex'` (contains inline `"No headlines available"` div), `filteredEmptyState.hidden=true`, `feedStatus.hidden=true`, `spin=false`.
  7. **Terminal Load Error (Cold):** `isLoading=false`, `topicMatch=false`, `articles=Empty`, `loadingState='none'`, `errorState='block'`, `feedList='none'`, `spin=false`.

### Transitions to Impossible States, Dead Ends & Race Conditions
1. **Stuck Loading State (`isLoading = true` & Infinite Spinner) on Source Toggle (`changeLibrarySources`):**
   - In `changeLibrarySources` (`js/app.js` L2189–2203), `headlinesRequestId++` is incremented immediately to invalidate any in-flight `loadHeadlines` call, and a new `loadHeadlines` is scheduled 250ms later via `setTimeout`.
   - Because the in-flight `loadHeadlines` checks `if (requestId === headlinesRequestId)` inside its `finally` block (`js/app.js` L1795–1800), the aborted request **skips** resetting `state.isLoading = false`, `retrySourcesBtn.disabled = false`, and `refreshIcon.classList.remove('spin')`.
   - Simultaneously, `changeLibrarySources` sets `state.rawArticles = []`, `state.articles = []`, `state.displayedTopic = null`, and calls `applySortAndRender()`. During the 250ms window, the UI enters an **impossible hybrid state**: `isLoading = true` and `refreshIcon` is spinning, `loadingState` is hidden (`display: none`), and `feedList` is hidden (`display: none` from the aborted topic load) with `"No headlines available"` rendered inside a hidden container.
2. **Simultaneous `errorState` and Empty Feed State on Source Toggle:**
   - If the app is in **State 7 (Terminal Load Error)** (`errorState.style.display = 'block'`) and the user opens the RSS Sources modal and toggles a source, `changeLibrarySources` calls `applySortAndRender()` without hiding `errorState`. For 250ms, `errorState` remains visible while the empty feed state is rendered.
3. **Deduplication Bypass in `refreshCurrentTopic`:**
   - `refreshCurrentTopic` (`js/app.js` L1804–1816) checks `if (activeRefresh?.topic === topic && activeRefresh.requestId === headlinesRequestId)`. If a non-refresh `loadHeadlines` call is already in flight for `topic`, `activeRefresh` is `null`, so `refreshCurrentTopic()` starts a concurrent request. Conversely, if `refreshCurrentTopic()` is running and the user toggles a source (`headlinesRequestId++`), `activeRefresh` remains non-null until the superseded promise settles.

---

## 2. Article Paywall & Archive Resolution Lifecycle State Machine

**Locations:**
- `js/newsService.js`: `applyStrategyToArticle` (L648–731), `resolveArchiveStatus` (L740–768)
- `js/app.js`: `loadHeadlines` (L1775–1783), `updateCardElement` (L1023–1064), `renderRulesTable` (L2411–2424)
- `sync_news.py`: `build_article_record` (L499–541)

### State Variables
Per article object in `state.articles` and `state.rawArticles`, plus its corresponding DOM `<article>` element:
- `article.status` $\in \{\text{'free'}, \text{'bypassed'}, \text{'locked'}\}$ (3)
- `article.needsArchiveCheck` $\in \{\text{true}, \text{false}\}$ (2)
- `article.badge` $\in \{\text{'Free'}, \text{'Open source'}, \text{'SMRY'}, \text{'RemovePaywall'}, \text{'UnWall'}, \text{'Freedium'}, \text{'Reader'}, \text{'Archive.is'}, \text{'Wayback'}, \text{'Archive'}, \text{'Locked (No Archive)'}\}$ (11)
- `article.archiveUrl` $\in \{\text{''}, \text{non-empty URL}\}$ (2)
- `isGoogleNewsUrl(article.originalUrl)` $\in \{\text{true}, \text{false}\}$ (2)
- **DOM Card Classes:** `card.classList` containing `news-card--free`, `news-card--bypassed`, `news-card--locked`, `news-card--hidden` ($2^4 = 16$)

### Mathematical Combinations vs. Valid States
- **Mathematically Possible Combinations:**
  $$3 \times 2 \times 11 \times 2 \times 2 \times 16 = \mathbf{4,224} \text{ combinations per article card}$$
- **Intended Valid States (5):**
  1. **Unresolved Google Wrapper:** `isGoogleNewsUrl=true`, `status='free'`, `badge='Open source'`, `needsArchiveCheck=false`, `archiveUrl=''`, DOM class `news-card--free`.
  2. **Direct Free Article:** `isGoogleNewsUrl=false`, `status='free'`, `badge='Free'`, `needsArchiveCheck=false`, DOM class `news-card--free`.
  3. **Proxy/Reader Bypassed Article:** `isGoogleNewsUrl=false`, `status='bypassed'`, `badge` $\in \{\text{'SMRY'}, \text{'RemovePaywall'}, \text{'UnWall'}, \text{'Freedium'}, \text{'Reader'}, \text{'Archive.is'}, \text{'Wayback'}\}$, `needsArchiveCheck=false`, DOM class `news-card--bypassed`.
  4. **Archive Verified:** `isGoogleNewsUrl=false`, `status='bypassed'`, `badge='Archive'`, `needsArchiveCheck=false`, DOM class `news-card--bypassed`.
  5. **Archive Missing (Locked):** `isGoogleNewsUrl=false`, `status='locked'`, `badge='Locked (No Archive)'`, `needsArchiveCheck=false`, DOM class `news-card--locked` (+ `news-card--hidden` iff `state.hideLocked`).

### Transitions to Impossible States, Dead Ends & Race Conditions
1. **Unreachable Dead Code / Dead State (`needsArchiveCheck` is NEVER set to `true`):**
   - Across `normalizeFeedItem` (`js/newsService.js` L508), `applyStrategyToArticle` (`js/newsService.js` L677–730), and `build_article_record` (`sync_news.py` L507–541), **nothing in the codebase ever sets `needsArchiveCheck = true`**.
   - When `rule.strategy` is `STRATEGIES.ARCHIVE_IS` or `STRATEGIES.WAYBACK`, `applyStrategyToArticle` immediately sets `updated.status = 'bypassed'` and `updated.badge = 'Archive.is'` (or `'Wayback'`), leaving `needsArchiveCheck` as `false` (or `undefined`).
   - Consequently, `resolveArchiveStatus` (`js/newsService.js` L740–768), the background check loop in `loadHeadlines` (`js/app.js` L1775–1783), and `archiveService.js` are never invoked in production runtime, and the `'locked'` article status is unreachable from normal feeds.
2. **DOM Class Pollution in `updateCardElement`:**
   - When a card is created (`createFlipHeroCard`, `createFlipTileCard`, `createFlipRowCard`, `createFlipBannerCard`), its class is set to `news-card--${article.status}` (e.g., `news-card--free` or `news-card--bypassed`).
   - When `updateCardElement` (`js/app.js` L1023–1037) updates the card after a strategy change, it only adds/removes `news-card--locked` and `news-card--hidden`—it **never updates `news-card--free` or `news-card--bypassed`**. Switching a domain from `direct` (`free`) to `smry` (`bypassed`) leaves the DOM element with `news-card--free` while its badge has `badge-bypassed`.
3. **Desynchronization Between `state.rawArticles` and `state.articles` on Single Rule Reset:**
   - In `renderRulesTable` (`js/app.js` L2411–2424), clicking the `✕` reset button on a custom domain rule updates `state.articles = state.articles.map(...)`, **but forgets to update `state.rawArticles`** (unlike `changeDomainStrategy` at L1494 and `resetRulesBtn` at L2678).
   - If the user subsequently changes the sort order dropdown (`feedSortSelect`), `applySortAndRender()` rebuilds `state.articles` from `state.rawArticles`, **resurrecting the deleted custom rule** on all cards for that domain.
4. **Stale `archiveUrl` Property Across Strategy Transitions:**
   - In `applyStrategyToArticle` (`js/newsService.js` L681–728), `updated.archiveUrl` is set when `rule.strategy` is `ARCHIVE_IS` or `WAYBACK` (and initialized to `https://archive.is/newest/...` for all articles in `sync_news.py` L517), but switching to `DIRECT`, `SMRY`, `UNWALL`, etc. never clears `updated.archiveUrl`.

---

## 3. Card Image Resolution & Lazy-Load Queue State Machine

**Locations:**
- `js/app.js`: `enqueueImageResolution`, `processImageResolutionQueue`, `cardImageObserver`, `resolveCardImage` (L330–471)
- `js/imageService.js`: `memoryImageCache`, `pendingImages`, `microlinkCooldownUntil`, `fetchArticleImage` (L39–44, L368, L455–462)

### State Variables
- **Per-Card State:**
  - `article.imageUrl` $\in \{\text{''}, \text{URL}\}$ (2)
  - `card.classList.contains('news-card--no-photo')` $\in \{\text{true}, \text{false}\}$ (2)
  - `observed._resolveImageTask` $\in \{\text{undefined}, \text{Function}\}$ (2)
  - `media` container DOM state $\in \{\text{absent}, \text{empty}, \text{display:none}, \text{img(opacity:0)}, \text{img(opacity:1)}\}$ (5)
- **Queue & Service State:**
  - `activeImageResolutions` $\in \{0, 1, 2\}$ (3)
  - `imageResolutionQueue.length` $\in \mathbb{N}$
  - `pendingImages.has(key)` $\in \{\text{true}, \text{false}\}$ (2)
  - `memoryImageCache` / `sessionStorage` entry $\in \{\text{undefined}, \text{valid URL}, \text{null (negative cache)}, \text{expired}\}$ (4)
  - `microlinkCooldownUntil > Date.now()` $\in \{\text{true}, \text{false}\}$ (2)

### Mathematical Combinations vs. Valid States
- **Mathematically Possible Combinations (Per Card):**
  $$2 (\text{imageUrl}) \times 2 (\text{no-photo class}) \times 2 (\text{\_resolveImageTask}) \times 5 (\text{media DOM}) = \mathbf{40}$$
- **Valid Card States (6):**
  1. **Initial With Feed Image:** `imageUrl != ''`, `no-photo=false`, `_resolveImageTask=undefined`, `media=img(opacity:1)`.
  2. **Queued in IntersectionObserver:** `imageUrl == ''`, `no-photo=true`, `_resolveImageTask=fn`, `media=absent|empty|display:none`.
  3. **Queued/Running in Resolution Queue:** `imageUrl == ''`, `no-photo=true`, `_resolveImageTask=undefined`, `media=absent|empty|display:none`.
  4. **Resolved & Fading In:** `imageUrl != ''`, `no-photo=false`, `_resolveImageTask=undefined`, `media=img(opacity:0 -> 1)`.
  5. **Fallback Failed (Terminal Text Card):** `imageUrl == ''`, `no-photo=true`, `_resolveImageTask=undefined`, `media=absent|empty|display:none`.
  6. **Disconnected (Rerendered):** `!container.isConnected`.

### Transitions to Impossible States, Dead Ends & Race Conditions
1. **Hero/Banner Secondary Image `onerror` Leaves Visible Broken Image Container:**
   - When a Hero or Banner card's initial image fails (`img.onerror` at `js/app.js` L496–502 and L811–817), `media.style.display = 'none'` is set.
   - If `resolveCardImage` finds a fallback `resolvedUrl` that passes preloading, it sets `media.style.display = ''` and inserts the new `<img>` (`js/app.js` L425–436).
   - If that new `<img>` subsequently fires `onerror` (`onImageFailure` at `js/app.js` L406–410), `onImageFailure` adds `news-card--no-photo` to `card` **but does not hide `media` (`media.style.display = 'none'`) or clear `media.innerHTML`**, leaving a broken image icon inside `.flip-hero-media` / `.flip-banner-media`.
2. **Disconnected Preloader Timeout Invalidates Shared Cache Entry:**
   - In `resolveCardImage` (`js/app.js` L395–402), if `renderFeed()` disconnects the old card while `preloader` is waiting (up to 3,500ms) and `preloader` fails or times out (`!loaded`), line 401 calls `invalidateArticleImage(targetUrl)` *before* checking `if (!container.isConnected) return;` on line 402.

---

## 4. Quick Article URL Modal & Google News Resolver State Machine

**Locations:**
- `js/app.js`: `openQuickUrlModal`, `closeQuickUrlModal`, `analyzeQuickUrl`, `executeOpenQuickUrl` (L1145–1418)

### State Variables
- **In-Memory:**
  - `quickUrlResolutionId` $\in \mathbb{N}$
  - `quickUrlReturnFocus` $\in \{\text{null}, \text{HTMLElement}\}$
- **DOM State:**
  - Modal visibility: `quickUrlModal.classList.contains('open')` (2), `quickUrlModal.inert` (2), `quickUrlModal.getAttribute('aria-hidden')` (2)
  - Input category (`inputQuickUrl.value`): $\in \{\text{Empty}, \text{Invalid}, \text{GoogleNewsWrapper}, \text{ValidPublisherDomain}\}$ (4)
  - Strategy selection (`quickUrlStrategySelect.value`): $\in \{\text{'auto'}, \text{'freedium'}, \text{'direct'}, \text{other strategy}\}$ (4)
  - `quickUrlOpenBtn.disabled` $\in \{\text{true}, \text{false}\}$ (2)
  - `quickUrlOpenBtn.textContent` $\in \{\text{'Open article'}, \text{'Finding article…'}, \text{'Open Google News'}, \text{'Open original article'}, \text{'Open with <Tool>'}\}$ (5)
  - `quickUrlDomainBanner.style.display` $\in \{\text{'none'}, \text{'flex'}\}$ (2)
  - `quickUrlError.style.display` $\in \{\text{'none'}, \text{'block'}\}$ (2)
  - `quickUrlClearBtn.style.display` $\in \{\text{'none'}, \text{'flex'}\}$ (2)
  - `quickUrlRememberCheck.disabled` (2) & `quickUrlRememberCheck.checked` (2)

### Mathematical Combinations vs. Valid States
- **Mathematically Possible Combinations:**
  $$2^3 (\text{modal flags}) \times 4 (\text{input}) \times 4 (\text{strategy}) \times 2 (\text{btnDisabled}) \times 5 (\text{btnText}) \times 2^3 (\text{banner/error/clear}) \times 2^2 (\text{remember}) = \mathbf{40,960}$$
- **Valid Semantic States (7):**
  1. **Modal Closed:** `open=false`, `inert=true`, `aria-hidden='true'`.
  2. **Open — Empty Input:** `open=true`, `inert=false`, `aria-hidden='false'`, `btn.disabled=true`, `btn.text='Open article'`, `banner='none'`, `error='none'`, `clearBtn='none'`, `remember.disabled=true, checked=false`.
  3. **Open — Invalid URL:** Same as Empty, except `clearBtn='flex'` and `error='block'`.
  4. **Open — Resolving Google News URL:** `btn.disabled=true`, `btn.text='Finding article…'`, `banner='none'`, `error='none'`, `remember.disabled=true, checked=false`.
  5. **Open — Google News Resolution Failed:** `btn.disabled=false`, `btn.text='Open Google News'`, `banner='none'`, `error='block'`, `remember.disabled=true, checked=false`.
  6. **Open — Valid Domain + Supported Strategy:** `btn.disabled=false`, `btn.text='Open original article' | 'Open with <Tool>'`, `banner='flex'`, `error='none'`, `remember.disabled=(strategy==='auto')`.
  7. **Open — Valid Domain + Unsupported Freedium:** `btn.disabled=true`, `btn.text='Open with Freedium Mirror'`, `banner='flex'`, `error='block'`.

### Transitions to Impossible States, Dead Ends & Race Conditions
1. **Strategy Change During Google News Resolution Restarts Resolution & Resets UI:**
   - In `analyzeQuickUrl` (`js/app.js` L1317–1351), if a Google News URL has already failed resolution (**State 5**: `btn.disabled=false`, `btn.text='Open Google News'`, error shown) and the user changes the `quickUrlStrategySelect` dropdown (`js/app.js` L2646–2649), `analyzeQuickUrl(elements.inputQuickUrl.value)` is called again with the unresolved Google News URL, re-entering **State 4** (`Finding article…`) even though resolution already completed.
2. **Focus Trap Escape When Focused Control Becomes Disabled:**
   - In the `quickUrlModal` keydown handler (`js/app.js` L2591–2603), `Tab` wrapping only triggers when `document.activeElement === first` or `document.activeElement === last`. If the currently focused control (`quickUrlOpenBtn` or `quickUrlRememberCheck`) becomes `disabled = true`, `document.activeElement` resets to `document.body`, allowing `Tab` to leave the modal.

---

## 5. Multi-Overlay & Navigation Chrome State Machine

**Locations:**
- `js/app.js`: `toggleMenu` (L2439–2455), `checkIncomingShare` (L1453–1462), modal handlers (L2537–2803)
- `index.html`: L264–618

### State Variables
- **Hamburger Dropdown:**
  - `headerMenuDropdown.classList.contains('open')` (2)
  - `headerMenuDropdown.getAttribute('aria-hidden')` $\in \{\text{'true'}, \text{'false'}\}$ (2)
  - `menuToggleBtn.classList.contains('active')` (2)
  - `menuToggleBtn.getAttribute('aria-expanded')` $\in \{\text{'true'}, \text{'false'}\}$ (2)
- **4 Modals:**
  - `rulesModal.classList.contains('open')` (2)
  - `topicsModal.classList.contains('open')` (2)
  - `strategySwitcherModal.classList.contains('open')` (2)
  - `quickUrlModal.classList.contains('open')` (2), `quickUrlModal.inert` (2), `quickUrlModal.getAttribute('aria-hidden')` (2)
- **Topics Modal Sub-Tabs (4 tabs $\times$ 3 DOM properties each + `saveTopicsBtn` visibility):**
  - For each tab $\in \{\text{topics}, \text{new\_topic}, \text{sources}, \text{local}\}$: `btn.classList.contains('active')` (2), `btn.getAttribute('aria-selected')` (2), `panel.style.display` $\in \{\text{'flex'}, \text{'none'}\}$ (2)
  - `saveTopicsBtn.style.display` $\in \{\text{''}, \text{'none'}\}$ (2)

### Mathematical Combinations vs. Valid States
- **Mathematically Possible Combinations:**
  - Overlay level: $2^4 (\text{menu}) \times 2^3 (\text{3 modals}) \times 2^3 (\text{quickUrlModal}) = \mathbf{1,024}$
  - Topics Modal sub-tabs: $(2^3)^4 \times 2 = \mathbf{8,192}$
- **Valid States:**
  - **Overlay Level (6 mutually exclusive states):** All closed (1), Hamburger Menu open (1), or exactly one of the 4 modals open (4).
  - **Topics Modal Sub-Tabs (4 states):** Exactly 1 of the 4 tabs active, and `saveTopicsBtn` visible iff active tab is `'topics'`.

### Transitions to Impossible States, Dead Ends & Race Conditions
1. **Hamburger Button State Desynchronization in `checkIncomingShare`:**
   - In `checkIncomingShare` (`js/app.js` L1454–1457), when a share URL arrives, the code removes `'open'` and sets `aria-hidden="true"` on `headerMenuDropdown` directly without calling `toggleMenu(false)`, leaving `menuToggleBtn` with class `'active'` and `aria-expanded="true"` if the menu was open.
2. **Missing Escape Key Handlers on 3 of 4 Modals:**
   - `rulesModal`, `topicsModal`, and `strategySwitcherModal` do not close on `Escape` and do not close each other if opened while `strategySwitcherModal` is open.

---

## 6. Pull-to-Refresh Touch Gesture State Machine

**Locations:**
- `js/app.js`: `setupPullToRefresh` (L1818–1857)

### State Variables
- `gesture` $\in \{\text{null}, \{x, y, distance\}\}$ with `distance` ranges: $0$, $(0, 10)$, $[10, 72)$, $[72, \infty)$ (5)
- `elements.pullRefreshStatus.hidden` $\in \{\text{true}, \text{false}\}$ (2)
- `elements.pullRefreshStatus.textContent` $\in \{\text{''}, \text{'Pull to refresh'}, \text{'Release to refresh'}\}$ (3)

### Mathematical Combinations vs. Valid States
- **Mathematically Possible Combinations:** $5 \times 2 \times 3 = \mathbf{30}$
- **Valid States (4):**
  1. **Idle:** `gesture = null`, `hidden = true`.
  2. **Touch Started / Deadzone ($0 \le \text{distance} < 10$):** `gesture != null`, `hidden = true`.
  3. **Pulling ($10 \le \text{distance} < 72$):** `gesture != null`, `hidden = false`, `textContent = 'Pull to refresh'`.
  4. **Armed ($\text{distance} \ge 72$):** `gesture != null`, `hidden = false`, `textContent = 'Release to refresh'`.

### Transitions to Impossible States, Dead Ends & Race Conditions
1. **Stuck Pull-to-Refresh Status When Sliding Back Into Deadzone $[0, 10)$:**
   - In `setupPullToRefresh` (`js/app.js` L1836–1850), once the user pulls past `dy >= 10` (`pullRefreshStatus.hidden = false`), if they move their finger back up to $0 \le \text{dy} < 10$, `if (dy < 10) return;` exits early **without setting `pullRefreshStatus.hidden = true`**, leaving `"Pull to refresh"` visible inside the deadzone.

---

## 7. Async Form Submission & Source Health Verification State Machines

**Locations:**
- `js/app.js`: `checkEnabledSources` (L2268–2313), `addNewTopicForm` submit (L2850–2934), `addNewSourceForm` submit (L2951–3011)

### State Variables
- **Source Health Checker:**
  - `checkingSources` $\in \{\text{true}, \text{false}\}$ (2)
  - `checkSourcesBtn.disabled` $\in \{\text{true}, \text{false}\}$ (2)
  - Per-source `sourceHealth.get(url)` $\in \{\text{undefined}, \text{checking}, \text{ok-fresh}, \text{ok-stale}, \text{failed}\}$ (5)
- **New Topic & New Source Forms (each):**
  - `submitBtn.disabled` (2) $\times$ `btnSpinner.style.display` (2) $\times$ `btnText.textContent` (2) $\times$ `formError.style.display` (2) = **16 combinations** (Valid: 3 — `Idle`, `Verifying`, `IdleWithError`).

### Transitions to Impossible States, Dead Ends & Race Conditions
1. **Permanent Button Label Drift After First Submission:**
   - `newTopicBtnText` starts as `"Create Topic"` in `index.html` (L406), changes to `"Verifying topic feed..."`, and resets in `finally` (`js/app.js` L2932) to `"Add Topic"`.
   - `newSourceBtnText` starts as `"+ Add Source to Library"` in `index.html` (L437), changes to `"Verifying feed..."`, and resets in `finally` (`js/app.js` L3009) to `"Add Source"`.
2. **Un-cancelled Async Verification Across Modal Reset/Close:**
   - If the user clicks `"Reset Defaults"` while `verifyFeed()` is awaiting network I/O in `addNewTopicForm` or `addNewSourceForm`, the form handler still commits the new topic/source when `verifyFeed()` resolves.

---

## 8. Source Preference & Persistence Fallback State Machine

**Locations:**
- `js/feedRegistry.js`: `sessionDisabledSources`, `sessionEnabledSources`, `getDisabledSourceKeys`, `isSourceEnabled`, `setSourcesEnabled` (L22–70)

### State Variables & Combinations
- Per source key $k$: `sessionDisabledSources` mode (`null` vs. `Set`) (2) $\times$ $k \in \text{sessionDisabledSources}$ (2) $\times$ $k \in \text{sessionEnabledSources}$ (2) $\times$ $k \in \text{localStorage[SOURCE\_PREFERENCES\_KEY]}$ (2) $\times$ `source.enabled` (2) = **32 combinations** (Valid: 2 effective states — Enabled or Disabled).

### Transitions to Impossible States, Dead Ends & Race Conditions
1. **Partial Storage Failure Split-Brain:**
   - In `setSourcesEnabled` (`js/feedRegistry.js` L49–70), custom feeds are saved to `STORAGE_KEY_CUSTOM_FEEDS` before disabled source keys are saved to `SOURCE_PREFERENCES_KEY`. If the second write throws, `sessionDisabledSources` is activated while `STORAGE_KEY_CUSTOM_FEEDS` may or may not have persisted.

---

## 9. Singleton Fetch & Cache Coalescing State Machines

**Locations:**
- `js/previewService.js` (L74–94): `savedIndex`, `checkedAt`, `pendingIndex` ($16 \to 5$ states)
- `js/publisherUrlService.js` (L3–71): `publishedUrls`, `refreshAfter`, `pendingMap` ($8 \to 4$ states)
- `js/newsService.js` (L517, L563–579): `pendingFeeds`
- `article_metadata.py` (L7–58): `ArticleMetadataCache` ($24 \to 6$ states per key)

### Transitions to Impossible States, Dead Ends & Race Conditions
1. **`fetchPreviewArticles({ force: true })` Joins Non-Forced `pendingIndex`:**
   - In `js/previewService.js` (L77–79), `if (pendingIndex) return pendingIndex;` runs before checking `force`.
2. **Clock Skew Sensitivity:**
   - `article_metadata.py` (L33) and `readSourceCache` (`js/newsService.js` L164) require `0 <= now - timestamp`, treating entries with slightly future timestamps as invalid/expired.

---

## 10. PWA Installation & Service Worker Lifecycle State Machine

**Locations:**
- `js/pwa.js` (L10–57), `sw.js` (L44–106)

### State Variables & Combinations
- `deferredInstallPrompt` $\in \{\text{null}, \text{Event}\}$ (2) $\times$ `installBtn.style.display` $\in \{\text{'none'}, \text{'inline-flex'}\}$ (2) $\times$ listener count $\in \mathbb{N}$ = $\infty$ (Valid: 2 states, 1 listener).

### Transitions to Impossible States, Dead Ends & Race Conditions
1. **Duplicate `click` Listener Accumulation on `installAppBtn`:**
   - In `js/pwa.js` (L31–48), `installBtn.addEventListener('click', ...)` is registered inside the `window.addEventListener('beforeinstallprompt', ...)` callback.
   - Each time `beforeinstallprompt` fires, another `click` listener is added to `installBtn`. When clicked, multiple listeners invoke `deferredInstallPrompt.prompt()` before `await deferredInstallPrompt.userChoice` resolves and clears `deferredInstallPrompt = null`, causing a `DOMException` on the second call.

---

## 11. HTML `PreviewParser` Stack State Machine

**Locations:**
- `preview_text.py`: `PreviewParser` (L15–93)

### State Variables & Combinations
- `self.fragment` (2) $\times$ `in_blocked` (2) $\times$ `in_article` (2) $\times$ `self.current is not None` (2) $\times$ `self.schema_text is not None` (2) $\times$ `len(self.paragraphs)` (4) = **128 combinations**.

### Transitions to Impossible States, Dead Ends & Race Conditions
1. **Unclosed `<p>` Inside `<article>` Leaks Outside Text Into `self.paragraphs`:**
   - In `PreviewParser.handle_endtag` (`preview_text.py` L45–60), `self.current` is only flushed and reset to `None` when `tag == 'p'`.
   - If an HTML document has `<article><p>Lead text...</article>` without an explicit `</p>`, closing `</article>` pops `<article>` and `<p>` from `self.stack` (`del self.stack[index:]`), **leaving `self.current` as a list while `in_article` is now `False`**.
   - Any subsequent non-blocked text outside `<article>` is appended to `self.current` until a later `</p>` anywhere on the page flushes the corrupted buffer into `self.paragraphs`.
   - Similarly, if `<script type="application/ld+json">` is popped by an ancestor end tag without `tag == 'script'`, `self.schema_text` remains non-`None`.
