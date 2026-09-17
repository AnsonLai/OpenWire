/**
 * tests/syntaxCheck.test.mjs
 * 
 * Verifies syntax validity of all JavaScript source files and manifest properties
 * to prevent uncaught module syntax errors in production.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('all JavaScript files pass Node syntax check', () => {
  const jsDir = path.join(projectRoot, 'js');
  const files = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(jsDir, file);
    assert.doesNotThrow(() => {
      execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
    }, `Syntax check failed on js/${file}`);
  }

  // Also verify root sw.js and build.js
  assert.doesNotThrow(() => {
    execSync(`node --check "${path.join(projectRoot, 'sw.js')}"`, { stdio: 'pipe' });
  }, 'Syntax check failed on sw.js');

  assert.doesNotThrow(() => {
    execSync(`node --check "${path.join(projectRoot, 'build.js')}"`, { stdio: 'pipe' });
  }, 'Syntax check failed on build.js');
});

test('manifest.json has explicit enctype for share_target', () => {
  const manifestRaw = fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf-8');
  const manifest = JSON.parse(manifestRaw);

  assert.ok(manifest.share_target, 'Must have share_target');
  assert.equal(
    manifest.share_target.enctype,
    'application/x-www-form-urlencoded',
    'share_target must declare enctype to prevent browser warning'
  );
});
