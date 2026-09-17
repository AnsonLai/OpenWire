#!/usr/bin/env node
/**
 * build.js
 * 
 * Multi-target compiler for Headlines News Aggregator.
 * Compiles production distributions for:
 *  1. Root domain hosting ('/' base path, e.g. https://example.com/ or Azure $web)
 *  2. Subfolder hosting ('/news_aggregator/' base path, e.g. https://example.com/news_aggregator/)
 *  3. Custom base path via CLI flags (--base=/custom/ --out=dist/custom)
 * 
 * SOLID Principles: Single Responsibility per compilation step (HTML, Manifest, SW, JS, Assets).
 * DRY: Shared transformation logic across all target configurations.
 * KISS: Zero external npm dependencies — uses native Node.js standard library.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard preset target configurations
export const TARGETS = {
  root: {
    name: 'root',
    description: 'Root domain deployment (https://example.com/ or Azure $web)',
    base: '/',
    outDir: path.join(__dirname, 'dist', 'root'),
    cacheKey: 'root',
  },
  news_aggregator: {
    name: 'news_aggregator',
    description: 'Subfolder deployment (https://example.com/news_aggregator/)',
    base: '/news_aggregator/',
    outDir: path.join(__dirname, 'dist', 'news_aggregator'),
    cacheKey: 'news_aggregator',
  },
  docs: {
    name: 'docs',
    description: 'GitHub Pages docs deployment (root base path to docs/ folder)',
    base: '/',
    outDir: path.join(__dirname, 'docs'),
    cacheKey: 'docs',
  },
};

/**
 * Ensures a directory exists, creating parent directories if necessary.
 * @param {string} dirPath 
 */
function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Normalizes a base path ensuring it starts and ends with a forward slash.
 * @param {string} rawBase 
 * @returns {string} Normalized base path, e.g. '/news_aggregator/'
 */
export function normalizeBasePath(rawBase) {
  if (!rawBase || rawBase === '.' || rawBase === './') return '/';
  let clean = rawBase.trim();
  if (!clean.startsWith('/')) clean = '/' + clean;
  if (!clean.endsWith('/')) clean = clean + '/';
  return clean;
}

/**
 * Transforms index.html for a given base path:
 * - Injects <base href="..."> in <head>
 * - Replaces relative asset links with base-prefixed paths
 * 
 * @param {string} sourceHtml 
 * @param {string} base 
 * @returns {string} Transformed HTML
 */
export function transformHtml(sourceHtml, base) {
  let html = sourceHtml;

  // 1. Inject <base href="..."> right after <head> or meta charset
  const baseTag = `\n  <base href="${base}">`;
  if (!html.includes('<base href=')) {
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${baseTag}`);
    } else {
      html = `${baseTag}\n${html}`;
    }
  } else {
    html = html.replace(/<base href="[^"]*">/, `<base href="${base}">`);
  }

  // 2. Prefix specific asset paths so they resolve consistently even without trailing slash
  html = html.replace(/href="\.\/manifest\.json"/g, `href="${base}manifest.json"`);
  html = html.replace(/href="\.\/icons\/icon\.svg"/g, `href="${base}icons/icon.svg"`);
  html = html.replace(/href="\.\/icons\/icon-192\.png"/g, `href="${base}icons/icon-192.png"`);
  html = html.replace(/href="\.\/icons\/icon-96\.png"/g, `href="${base}icons/icon-96.png"`);
  html = html.replace(/href="\.\/icons\/icon-32\.png"/g, `href="${base}icons/icon-32.png"`);
  html = html.replace(/href="\.\/favicon\.ico"/g, `href="${base}favicon.ico"`);
  html = html.replace(/content="\.\/icons\/icon-512\.png"/g, `content="${base}icons/icon-512.png"`);
  html = html.replace(/href="\.\/css\/styles\.css"/g, `href="${base}css/styles.css"`);
  html = html.replace(/src="\.\/js\/app\.js"/g, `src="${base}js/app.js"`);

  return html;
}

/**
 * Transforms manifest.json for a given base path:
 * - Updates start_url and scope
 * - Updates icon src paths
 * 
 * @param {string} sourceJson 
 * @param {string} base 
 * @returns {string} Transformed JSON string
 */
export function transformManifest(sourceJson, base) {
  const manifest = JSON.parse(sourceJson);

  manifest.id = base;
  manifest.start_url = base;
  manifest.scope = base;

  if (manifest.share_target && manifest.share_target.action) {
    manifest.share_target.action = base;
  }

  if (Array.isArray(manifest.icons)) {
    manifest.icons = manifest.icons.map((icon) => {
      const cleanSrc = icon.src.replace(/^\.\//, '').replace(/^\//, '');
      return {
        ...icon,
        src: `${base}${cleanSrc}`,
      };
    });
  }

  return JSON.stringify(manifest, null, 2) + '\n';
}

/**
 * Transforms sw.js for a given base path:
 * - Scopes CACHE_NAME with target identifier to prevent collisions
 * - Rewrites STATIC_ASSETS array items to use base path
 * 
 * @param {string} sourceSw 
 * @param {string} base 
 * @param {string} cacheKey 
 * @returns {string} Transformed sw.js code
 */
export function transformServiceWorker(sourceSw, base, cacheKey) {
  let sw = sourceSw;

  // 1. Update CACHE_NAME
  const scopedCacheName = `headlines-pwa-${cacheKey}-v8`;
  sw = sw.replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = '${scopedCacheName}';`);

  // 2. Rewrite STATIC_ASSETS array
  const assetReplacements = [
    ["'./'", `'${base}'`],
    ["'./index.html'", `'${base}index.html'`],
    ["'./css/styles.css'", `'${base}css/styles.css'`],
    ["'./js/app.js'", `'${base}js/app.js'`],
    ["'./js/newsService.js'", `'${base}js/newsService.js'`],
    ["'./js/imageService.js'", `'${base}js/imageService.js'`],
    ["'./js/topicRegistry.js'", `'${base}js/topicRegistry.js'`],
    ["'./js/domainRegistry.js'", `'${base}js/domainRegistry.js'`],
    ["'./js/feedRegistry.js'", `'${base}js/feedRegistry.js'`],
    ["'./js/feedWeaver.js'", `'${base}js/feedWeaver.js'`],
    ["'./js/archiveService.js'", `'${base}js/archiveService.js'`],
    ["'./js/fetchProxy.js'", `'${base}js/fetchProxy.js'`],
    ["'./js/pwa.js'", `'${base}js/pwa.js'`],
    ["'./manifest.json'", `'${base}manifest.json'`],
    ["'./favicon.ico'", `'${base}favicon.ico'`],
    ["'./icons/icon.svg'", `'${base}icons/icon.svg'`],
    ["'./icons/icon-32.png'", `'${base}icons/icon-32.png'`],
    ["'./icons/icon-96.png'", `'${base}icons/icon-96.png'`],
    ["'./icons/icon-192.png'", `'${base}icons/icon-192.png'`],
    ["'./icons/icon-512.png'", `'${base}icons/icon-512.png'`],
    ["'./icons/icon-maskable-192.png'", `'${base}icons/icon-maskable-192.png'`],
    ["'./icons/icon-maskable-512.png'", `'${base}icons/icon-maskable-512.png'`],
  ];

  for (const [target, replacement] of assetReplacements) {
    sw = sw.replace(target, replacement);
  }

  return sw;
}

/**
 * Transforms js/pwa.js for a given base path:
 * - Updates service worker registration to register('${base}sw.js', { scope: '${base}' })
 * 
 * @param {string} sourcePwaJs 
 * @param {string} base 
 * @returns {string} Transformed js/pwa.js code
 */
export function transformPwaJs(sourcePwaJs, base) {
  let js = sourcePwaJs;
  js = js.replace(
    /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/g,
    `navigator.serviceWorker.register('${base}sw.js', { scope: '${base}' })`
  );
  return js;
}

/**
 * Transforms js/newsService.js for a given base path:
 * - Updates candidate files and TOPICS paths to use base prefix
 * 
 * @param {string} sourceNewsServiceJs 
 * @param {string} base 
 * @returns {string} Transformed js/newsService.js code
 */
export function transformNewsServiceJs(sourceNewsServiceJs, base) {
  let js = sourceNewsServiceJs;

  // Replace topic file paths: './data/ -> '${base}data/
  js = js.replace(/file:\s*'\.\/data\//g, `file: '${base}data/`);

  // Replace fallback candidate files in fetchTopHeadlines
  js = js.replace(/`\.\/data\/news_\${topicId\.toLowerCase\(\)}\.json`/g, `\`${base}data/news_\${topicId.toLowerCase()}.json\``);
  js = js.replace(/candidateFiles\.unshift\('\.\/news\.json'\);/g, `candidateFiles.unshift('${base}news.json');`);

  return js;
}

/**
 * Compiles a single distribution target.
 * @param {object} config - Configuration object
 * @param {string} config.name - Target name
 * @param {string} config.base - Base URL path
 * @param {string} config.outDir - Output directory path
 * @param {string} config.cacheKey - Cache key suffix
 */
export function compileTarget({ name, base, outDir, cacheKey }) {
  console.info({ target: name, base, outDir }, `Starting compilation for "${name}"`);

  // 1. Prepare clean output directory
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  ensureDirSync(outDir);

  // 2. Copy static asset directories
  const copyDirs = ['css', 'icons', 'data'];
  for (const dir of copyDirs) {
    const src = path.join(__dirname, dir);
    const dest = path.join(outDir, dir);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true });
    }
  }

  // 3. Copy root JSON cache if present
  const newsJsonSrc = path.join(__dirname, 'news.json');
  if (fs.existsSync(newsJsonSrc)) {
    fs.copyFileSync(newsJsonSrc, path.join(outDir, 'news.json'));
  }

  // 3b. Copy and transform root static files (favicon.ico, robots.txt, sitemap.xml, llms.txt)
  const faviconSrc = path.join(__dirname, 'favicon.ico');
  if (fs.existsSync(faviconSrc)) {
    fs.copyFileSync(faviconSrc, path.join(outDir, 'favicon.ico'));
  }

  const robotsSrc = path.join(__dirname, 'robots.txt');
  if (fs.existsSync(robotsSrc)) {
    let robots = fs.readFileSync(robotsSrc, 'utf-8');
    if (base !== '/') {
      robots = robots.replace('Sitemap: https://openwire.news/sitemap.xml', `Sitemap: https://openwire.news${base}sitemap.xml`);
      robots = robots.replace('Sitemap: ./sitemap.xml', `Sitemap: ${base}sitemap.xml`);
      robots = robots.replace('https://openwire.news/llms.txt', `https://openwire.news${base}llms.txt`);
    }
    fs.writeFileSync(path.join(outDir, 'robots.txt'), robots, 'utf-8');
  }

  const sitemapSrc = path.join(__dirname, 'sitemap.xml');
  if (fs.existsSync(sitemapSrc)) {
    let sitemap = fs.readFileSync(sitemapSrc, 'utf-8');
    if (base !== '/') {
      sitemap = sitemap.replace('<loc>https://openwire.news/</loc>', `<loc>https://openwire.news${base}</loc>`);
    }
    fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap, 'utf-8');
  }

  const llmsSrc = path.join(__dirname, 'llms.txt');
  if (fs.existsSync(llmsSrc)) {
    let llms = fs.readFileSync(llmsSrc, 'utf-8');
    if (base !== '/') {
      llms = llms.replaceAll('https://openwire.news/', `https://openwire.news${base}`);
    }
    fs.writeFileSync(path.join(outDir, 'llms.txt'), llms, 'utf-8');
  }

  // 3c. GitHub Pages .nojekyll flag (disables Jekyll processing for static asset hosting)
  if (name === 'docs' || path.basename(outDir).toLowerCase() === 'docs') {
    fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf-8');
  }

  // 4. Transform and write index.html
  const indexHtmlSrc = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
  fs.writeFileSync(path.join(outDir, 'index.html'), transformHtml(indexHtmlSrc, base), 'utf-8');

  // 5. Transform and write manifest.json
  const manifestSrc = fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8');
  fs.writeFileSync(path.join(outDir, 'manifest.json'), transformManifest(manifestSrc, base), 'utf-8');

  // 6. Transform and write sw.js
  const swSrc = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf-8');
  fs.writeFileSync(path.join(outDir, 'sw.js'), transformServiceWorker(swSrc, base, cacheKey), 'utf-8');

  // 7. Copy and transform JavaScript modules into js/
  const jsOutDir = path.join(outDir, 'js');
  ensureDirSync(jsOutDir);

  // Copy unaffected JS files dynamically (including feedRegistry.js, feedWeaver.js, domainRegistry.js, etc.)
  const specialJsFiles = new Set(['pwa.js', 'newsService.js']);
  const jsSrcDir = path.join(__dirname, 'js');
  if (fs.existsSync(jsSrcDir)) {
    const allJsFiles = fs.readdirSync(jsSrcDir);
    for (const file of allJsFiles) {
      if (file.endsWith('.js') && !specialJsFiles.has(file)) {
        fs.copyFileSync(path.join(jsSrcDir, file), path.join(jsOutDir, file));
      }
    }
  }

  // Transform pwa.js
  const pwaJsSrc = fs.readFileSync(path.join(__dirname, 'js', 'pwa.js'), 'utf-8');
  fs.writeFileSync(path.join(jsOutDir, 'pwa.js'), transformPwaJs(pwaJsSrc, base), 'utf-8');

  // Transform newsService.js
  const newsServiceJsSrc = fs.readFileSync(path.join(__dirname, 'js', 'newsService.js'), 'utf-8');
  fs.writeFileSync(path.join(jsOutDir, 'newsService.js'), transformNewsServiceJs(newsServiceJsSrc, base), 'utf-8');

  console.info({ target: name }, `Successfully compiled "${name}" to ${outDir}`);
}

/**
 * Parses CLI arguments and executes builds.
 */
export function main() {
  const args = process.argv.slice(2);
  const flags = {};

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split('=');
      flags[k] = v === undefined ? true : v;
    }
  }

  // Custom base and output path
  if (flags.base && flags.out) {
    const base = normalizeBasePath(flags.base);
    const outDir = path.resolve(process.cwd(), flags.out);
    const targetKey = flags.base.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'custom';
    compileTarget({
      name: 'custom',
      base,
      outDir,
      cacheKey: targetKey,
    });
    return;
  }

  // Specific target by name
  if (flags.target) {
    const targetName = flags.target.toLowerCase();
    const target = TARGETS[targetName];
    if (!target) {
      console.error(`Unknown target "${flags.target}". Available targets: ${Object.keys(TARGETS).join(', ')}`);
      process.exit(1);
    }
    compileTarget(target);
    return;
  }

  // Default: compile all targets
  console.info('No target specified. Compiling all configured distributions: [root, news_aggregator, docs]');
  compileTarget(TARGETS.root);
  compileTarget(TARGETS.news_aggregator);
  compileTarget(TARGETS.docs);
  console.info('All distributions compiled successfully into ./dist/ and ./docs/');
}

// Execute main if invoked directly via CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
