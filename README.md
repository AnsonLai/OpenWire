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
   * **Mode A (Pure Static / Client-Side)**: Runs 100% in the browser using a multi-proxy CORS waterfall (`corsproxy.io` -> `allorigins`).
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
1. Build the production bundle into the `docs/` folder:
   ```powershell
   npm run build:docs
   ```
2. In your GitHub repository settings, navigate to **Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`.
4. Select your default branch (e.g. `main`) and set the folder to `/docs`.
5. Save. Your PWA will be live at `https://<username>.github.io/<repo>/` (or custom domain).

### Other Static Hosts (Cloudflare Pages, Netlify, Vercel, Nginx)
1. Run `npm run build:root` (or deploy root repository files directly).
2. Point your static hosting provider's publish directory to `dist/root/` (or repository root).

---

## Optional: Automated Jamstack Sync (GitHub Actions)

If you'd like your deployment to always have the freshest pre-computed `news.json` and category feeds ready:

1. Run `python sync_news.py` locally or set up a simple GitHub Action on a 30-minute cron.
2. The script checks Google News and configured feeds, resolves canonical URLs, runs archive checks, and outputs JSON files to `data/` and `news.json`.
3. When the PWA opens, it automatically detects fresh JSON data and loads it in <50ms without hitting CORS proxies.

---

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPLv3) — see the [LICENSE](LICENSE) file for details.
