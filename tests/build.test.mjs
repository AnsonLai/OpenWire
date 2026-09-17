/**
 * tests/build.test.mjs
 * 
 * Unit tests for multi-target compilation script (build.js).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  normalizeBasePath,
  transformHtml,
  transformManifest,
  transformServiceWorker,
  transformPwaJs,
  transformNewsServiceJs,
  compileTarget,
  TARGETS,
} from '../build.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('normalizeBasePath formats forward slashes correctly', () => {
  assert.equal(normalizeBasePath(''), '/');
  assert.equal(normalizeBasePath('.'), '/');
  assert.equal(normalizeBasePath('./'), '/');
  assert.equal(normalizeBasePath('/'), '/');
  assert.equal(normalizeBasePath('news_aggregator'), '/news_aggregator/');
  assert.equal(normalizeBasePath('/news_aggregator'), '/news_aggregator/');
  assert.equal(normalizeBasePath('/news_aggregator/'), '/news_aggregator/');
});

test('transformHtml injects base tag and rewrites asset links', () => {
  const sampleHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Headlines</title>
  <link rel="manifest" href="./manifest.json">
  <link rel="icon" type="image/svg+xml" href="./icons/icon.svg">
  <link rel="apple-touch-icon" href="./icons/icon-192.png">
  <link rel="stylesheet" href="./css/styles.css">
</head>
<body>
  <script type="module" src="./js/app.js"></script>
</body>
</html>`;

  // Root base
  const rootResult = transformHtml(sampleHtml, '/');
  assert.ok(rootResult.includes('<base href="/">'));
  assert.ok(rootResult.includes('href="/manifest.json"'));
  assert.ok(rootResult.includes('href="/css/styles.css"'));
  assert.ok(rootResult.includes('src="/js/app.js"'));

  // Subfolder base
  const subfolderResult = transformHtml(sampleHtml, '/news_aggregator/');
  assert.ok(subfolderResult.includes('<base href="/news_aggregator/">'));
  assert.ok(subfolderResult.includes('href="/news_aggregator/manifest.json"'));
  assert.ok(subfolderResult.includes('href="/news_aggregator/icons/icon.svg"'));
  assert.ok(subfolderResult.includes('href="/news_aggregator/icons/icon-192.png"'));
  assert.ok(subfolderResult.includes('href="/news_aggregator/css/styles.css"'));
  assert.ok(subfolderResult.includes('src="/news_aggregator/js/app.js"'));
});

test('transformManifest updates start_url, scope, icons, and share_target', () => {
  const sampleManifest = JSON.stringify({
    name: 'Headlines',
    start_url: './index.html',
    scope: './',
    share_target: {
      action: './',
      method: 'GET',
      params: { url: 'url' },
    },
    icons: [
      { src: './icons/icon.svg', sizes: 'any' },
      { src: './icons/icon-192.png', sizes: '192x192' },
    ],
  });

  const parsedRoot = JSON.parse(transformManifest(sampleManifest, '/'));
  assert.equal(parsedRoot.start_url, '/');
  assert.equal(parsedRoot.scope, '/');
  assert.equal(parsedRoot.share_target.action, '/');
  assert.equal(parsedRoot.icons[0].src, '/icons/icon.svg');

  const parsedSubfolder = JSON.parse(transformManifest(sampleManifest, '/news_aggregator/'));
  assert.equal(parsedSubfolder.start_url, '/news_aggregator/');
  assert.equal(parsedSubfolder.scope, '/news_aggregator/');
  assert.equal(parsedSubfolder.share_target.action, '/news_aggregator/');
  assert.equal(parsedSubfolder.icons[0].src, '/news_aggregator/icons/icon.svg');
  assert.equal(parsedSubfolder.icons[1].src, '/news_aggregator/icons/icon-192.png');
});

test('transformServiceWorker scopes cache name and static assets array', () => {
  const sampleSw = `const CACHE_NAME = 'headlines-pwa-v8';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg'
];`;

  const transformed = transformServiceWorker(sampleSw, '/news_aggregator/', 'news_aggregator');
  assert.ok(transformed.includes("const CACHE_NAME = 'headlines-pwa-news_aggregator-v8';"));
  assert.ok(transformed.includes("'/news_aggregator/'"));
  assert.ok(transformed.includes("'/news_aggregator/index.html'"));
  assert.ok(transformed.includes("'/news_aggregator/css/styles.css'"));
  assert.ok(transformed.includes("'/news_aggregator/manifest.json'"));
  assert.ok(!transformed.includes("'./'"));
});

test('transformPwaJs specifies registration scope', () => {
  const samplePwaJs = `const registration = await navigator.serviceWorker.register('./sw.js');`;
  const transformed = transformPwaJs(samplePwaJs, '/news_aggregator/');
  assert.equal(
    transformed.trim(),
    `const registration = await navigator.serviceWorker.register('/news_aggregator/sw.js', { scope: '/news_aggregator/' });`
  );
});

test('transformNewsServiceJs updates candidate and topic paths', () => {
  const sampleNewsService = `
export const TOPICS = {
  TOP: { id: 'TOP', label: 'Top Stories', file: './data/news_top.json', url: 'https://news.google.com/rss' },
};
const candidateFiles = [
  topicConfig.file,
  \`./data/news_\${topicId.toLowerCase()}.json\`,
];
if (topicId === 'TOP') {
  candidateFiles.unshift('./news.json');
}
`;

  const transformed = transformNewsServiceJs(sampleNewsService, '/news_aggregator/');
  assert.ok(transformed.includes("file: '/news_aggregator/data/news_top.json'"));
  assert.ok(transformed.includes("`/news_aggregator/data/news_${topicId.toLowerCase()}.json`"));
  assert.ok(transformed.includes("candidateFiles.unshift('/news_aggregator/news.json');"));
});

test('compileTarget generates complete root and subfolder distributions', () => {
  const tempTestDir = path.join(projectRoot, 'dist', 'test_build');

  // Test compilation of subfolder
  compileTarget({
    name: 'test_subfolder',
    base: '/news_aggregator/',
    outDir: tempTestDir,
    cacheKey: 'test_subfolder',
  });

  // Verify all essential files exist
  assert.ok(fs.existsSync(path.join(tempTestDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(tempTestDir, 'manifest.json')));
  assert.ok(fs.existsSync(path.join(tempTestDir, 'sw.js')));
  assert.ok(fs.existsSync(path.join(tempTestDir, 'robots.txt')));
  assert.ok(fs.existsSync(path.join(tempTestDir, 'llms.txt')));
  assert.ok(fs.existsSync(path.join(tempTestDir, 'css', 'styles.css')));
  assert.ok(fs.existsSync(path.join(tempTestDir, 'icons', 'icon.svg')));
  assert.ok(fs.existsSync(path.join(tempTestDir, 'js', 'app.js')));
  assert.ok(fs.existsSync(path.join(tempTestDir, 'js', 'pwa.js')));
  assert.ok(fs.existsSync(path.join(tempTestDir, 'js', 'newsService.js')));
  assert.ok(fs.existsSync(path.join(tempTestDir, 'js', 'feedRegistry.js')));
  assert.ok(fs.existsSync(path.join(tempTestDir, 'js', 'feedWeaver.js')));
  assert.ok(fs.existsSync(path.join(tempTestDir, 'data', 'news_top.json')));

  // Verify transformed content
  const indexHtml = fs.readFileSync(path.join(tempTestDir, 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes('<base href="/news_aggregator/">'));

  const manifest = JSON.parse(fs.readFileSync(path.join(tempTestDir, 'manifest.json'), 'utf-8'));
  assert.equal(manifest.start_url, '/news_aggregator/');

  const robots = fs.readFileSync(path.join(tempTestDir, 'robots.txt'), 'utf-8');
  assert.ok(robots.includes('Sitemap: https://openwire.news/news_aggregator/sitemap.xml'));
  assert.ok(robots.includes('https://openwire.news/news_aggregator/llms.txt'));

  const llms = fs.readFileSync(path.join(tempTestDir, 'llms.txt'), 'utf-8');
  assert.ok(llms.includes('https://openwire.news/news_aggregator/data/news_top.json'));

  // Cleanup test output
  fs.rmSync(tempTestDir, { recursive: true, force: true });
});

test('compileTarget generates valid docs distribution with .nojekyll', () => {
  const tempDocsDir = path.join(projectRoot, 'dist', 'test_docs');

  compileTarget({
    name: 'docs',
    base: '/OpenWire/',
    outDir: tempDocsDir,
    cacheKey: 'docs',
  });

  assert.ok(fs.existsSync(path.join(tempDocsDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(tempDocsDir, 'manifest.json')));
  assert.ok(fs.existsSync(path.join(tempDocsDir, 'sw.js')));
  assert.ok(fs.existsSync(path.join(tempDocsDir, '.nojekyll')));
  assert.ok(fs.existsSync(path.join(tempDocsDir, 'robots.txt')));
  assert.ok(fs.existsSync(path.join(tempDocsDir, 'llms.txt')));
  assert.ok(fs.existsSync(path.join(tempDocsDir, 'css', 'styles.css')));
  assert.ok(fs.existsSync(path.join(tempDocsDir, 'js', 'app.js')));

  const indexHtml = fs.readFileSync(path.join(tempDocsDir, 'index.html'), 'utf-8');
  assert.ok(indexHtml.includes('<base href="/OpenWire/">'));

  const manifest = JSON.parse(fs.readFileSync(path.join(tempDocsDir, 'manifest.json'), 'utf-8'));
  assert.equal(manifest.start_url, '/OpenWire/');

  // Verify TARGETS configuration has docs
  assert.ok(TARGETS.docs);
  assert.equal(TARGETS.docs.base, '/OpenWire/');
  assert.equal(TARGETS.docs.name, 'docs');

  // Cleanup test output
  fs.rmSync(tempDocsDir, { recursive: true, force: true });
});
