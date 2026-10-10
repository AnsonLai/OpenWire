# OpenWire — Static PWA News Aggregator

A clean, lightning-fast, static Progressive Web App (PWA) news aggregator installable on iOS, Android, and desktop browsers, ready for instant deployment to GitHub Pages or any static hosting service.

It fetches top headlines from Google News RSS and custom feeds, classifies publishers against an **extensible domain strategy registry** (Free vs. Paid), applies working paywall bypass methods (`smry.ai`, removepaywall, freedium, reader view), scans `archive.is` for hard paywalls, and automatically greys out unreadable headlines if no archive snapshot is found.

---

## Key Features

1. **Smart Domain & Paywall Strategy Engine**:
   * **Free / Open Access** (e.g., BBC, NPR, AP, The Guardian, CNN): Direct link out (0ms).
   * **Standard Bypass** (e.g., NYTimes, The Atlantic, Wired): Routes automatically through `smry.ai`, removepaywall, or reader views.
   * **Hard Paywalls** (e.g., Wall Street Journal, Bloomberg, Financial Times): Performs a fast non-blocking status check on `archive.is/timemap`.
     * If an archived version exists: Links directly to the latest snapshot (`archive.is/newest/...`).
     * If no snapshot exists (404/timeout): **Greys out the headline**, marks it locked, and disables the link.
2. **In-App Strategy & Topic Management**:
   * An ongoing, customizable list of domains and strategies.
   * Add custom topics, search keywords, and RSS sources.
   * Open the **Rules** dialog in the app to view strategies, add new domain overrides, or tweak methods on the fly (saved to device `localStorage`).
3. **PWA-Ready for Mobile Installation**:
   * Includes `manifest.json`, `sw.js` (Service Worker), and responsive vector/PNG icons.
   * "Add to Home Screen" on iOS Safari, Android Chrome, or install as a desktop PWA.
4. **Instant Non-Blocking Performance**:
   * Headlines render immediately. Archive checks execute asynchronously in the background with strict timeouts so the UI never hangs.
5. **Dual Operation Modes**:
   * **Mode A (Pure Static / Client-Side)**: Runs in the browser using RSS conversion services and a CORS proxy fallback (`allorigins` -> `codetabs`).
   * **Mode B (Jamstack Pre-Generated)**: Includes `sync_news.py` to pre-generate headline feeds into `data/` and `news.json` on a schedule (e.g. GitHub Actions), providing instant loading with zero proxies needed.

---

## Project Structure

```
.
├── index.html               # Semantic HTML5 app shell & dialogs
├── manifest.json            # PWA Web App Manifest
├── sw.js                    # Service Worker caching shell assets
├── news.json                # Pre-generated headlines cache (fallback/default)
├── sync_news.py             # Scheduled pre-generator script
├── build.js                 # Zero-dependency build & path transformer
├── css/
│   └── styles.css           # Vanilla CSS with CSS variables & dark mode
├── data/                    # Pre-generated category JSON feeds
├── js/
│   ├── app.js               # Main UI orchestrator and event handling
│   ├── domainRegistry.js    # Domain rules, strategies & localStorage sync
│   ├── newsService.js       # RSS fetching, title cleaning & strategy assignment
│   ├── archiveService.js    # Fast, non-blocking archive availability checker
│   ├── fetchProxy.js        # Resilient CORS proxy waterfall
│   └── pwa.js               # Service worker registration & install prompts
├── icons/
│   ├── icon.svg             # Vector app icon
│   ├── icon-192.png         # PWA 192x192 icon
│   └── icon-512.png         # PWA 512x512 icon
├── docs/                    # Production bundle for GitHub Pages
└── tests/                   # Automated test suite
    ├── build.test.mjs       # Unit tests for build pipeline
    ├── domainRegistry.test.mjs  # Unit tests for domain matching
    └── newsService.test.mjs     # Unit tests for date formatting & feed processing
```

---

## Running Locally

To run the web app locally with any static HTTP server:

```powershell
# Using Python
python -m http.server 8080

# Or using Node
npx serve .
```

Open `http://localhost:8080` in your browser.

### Running Unit Tests

```powershell
# Run all unit tests
npm test

# Or using node directly
node --test tests/*.test.mjs
```

---

## Building for Production

Because PWAs require explicit manifest and service worker scopes, and deployments may target either a root domain or a custom subpath, this project includes a zero-dependency build script (`build.js`).

### Build Targets

```powershell
# Build standard root distribution into dist/root/
npm run build:root

# Build directly into docs/ for GitHub Pages hosting
npm run build:docs

# Compile for any custom subpath
node build.js --base=/my-subpath/ --out=dist/my-subpath
```

---

## Deployment

### GitHub Pages

The included `.github/workflows/pages.yml` refreshes RSS on GitHub's runner and publishes the complete site on pushes to `master`, manual runs, and a schedule at 17 and 47 minutes past each hour. Scheduled runs may be delayed by GitHub.

1. Push the code and workflow to the repository's default branch.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
3. In **Actions**, open **Refresh news and publish Pages** and select **Run workflow** for the first refresh.

The workflow uses the configured Pages base path, tests the app, fetches RSS without browser CORS restrictions, builds `docs/`, and deploys it directly. Photos come from RSS media and descriptions first, then the normal publisher page's public OpenGraph, Twitter, or article metadata. The runner resolves Google News links to publisher URLs and limits new lookups per run to 320 URL resolutions and 400 page-image requests. Successful metadata is reused for seven days; failures can retry after 15 minutes. The cache retains at most 1,000 entries across scheduled runs. Photo failures never block publishing headlines. It retains snapshots from the last successful run for any topics that temporarily fail. A complete feed outage fails the run and leaves the deployed site in place.

For a manual deployment bundle, use `npm run build:docs`. Building does not publish the site.

### Feed loading and app updates

Built-in topics load fresh published snapshots or recent device data first. The menu **Refresh** action and pulling down at the top of the page both request live RSS, keeping the current topic and chosen sort order. Sort choices also survive page reloads. Overlapping refreshes share one request; if live RSS fails, older saved results cannot replace headlines already on screen. The status above the headlines shows the update time, unavailable sources, or when a failed refresh is showing saved news. A failing primary feed does not block the remaining publishers.

Custom feeds and topics are saved on the device and fetched using public RSS conversion services. Their availability still depends on those providers; the scheduled server-side snapshots cover the built-in feeds in `sync_news.py`.

Expand **Sources** below the update time to see which publishers loaded, which are unavailable, and which are using saved headlines. **Retry sources** uses the same refresh path as the menu and pull gesture, preserving topic and sort. Scheduled snapshots include their source results too. When only some sources fail, their last successful device results can be included for up to 24 hours; their original update times are retained. A complete outage keeps the previous topic feed and does not claim a successful update. The source cache is bounded to 40 feeds with up to 60 headlines each, and storage failures do not block reading. Adding a source reports a storage error if it cannot be saved.

Reading and refreshing still work when browser storage is blocked. Sort and filter choices can then be kept only for the current session. Invalid saved headline records are skipped, and a browser cache failure falls back to the network.

Every production build fingerprints its app files to create a new service-worker revision automatically. The worker keeps each app shell together, uses network-first news requests with an offline fallback, and picks up new app code on the next navigation without forcing a reload during a shared-link dialog or settings edit.

### Other Static Hosts (Cloudflare Pages, Netlify, Vercel, Nginx)
1. Run `npm run build:root` (or deploy root repository files directly).
2. Point your static hosting provider's publish directory to `dist/root/` (or repository root).

---

## Manual news refresh

Google News links are resolved to publisher article URLs before applying reading or archive tools. The scheduled runner publishes successful resolutions in `data/publisher_urls.json`, which live RSS, saved feeds, and shared-link confirmation reuse across Google’s RSS, articles, and read URL variants. Older embedded links can also decode locally. Unknown or failed resolutions open Google News with an “Open source” label; shared links explain how to copy the publisher URL. Unresolved wrappers are never sent to Archive.is, Wayback, or other article tools. Brand-new or custom-topic links may need a publisher URL until the runner has resolved them.

Run `python -m pip install -r requirements.txt`, then `python sync_news.py` to regenerate the built-in topic snapshots locally and `npm run build:docs` to include them in a deployment bundle. Use `--skip-page-images` for feed-only photos and no publisher-page lookups. Snapshot writes are atomic, unsuccessful topics keep their previous data, and a complete outage exits with an error. Articles without photos use compact text layouts. Browser photo lookups share concurrent requests, keep article URLs distinct, and retry failures after a one-minute cooldown.

Run the generator regression tests with:

```powershell
python -m unittest discover -s tests -p 'test_*.py'
```

---

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPLv3) — see the [LICENSE](LICENSE) file for details.
