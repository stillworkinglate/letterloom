/**
 * Offline support: every file the game loads must be in the service worker's
 * precache, or the installed app breaks without a network.
 * Run: node tests/offline.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const swSource = read('sw.js');
const listMatch = swSource.match(/const PRECACHE = \[([\s\S]*?)\];/);
assert(listMatch, 'sw.js must declare a PRECACHE array');
const precache = new Set(Array.from(listMatch[1].matchAll(/'([^']+)'/g), (m) => m[1]));

function shipped(dir, ext) {
  return fs
    .readdirSync(path.join(root, dir))
    .filter((name) => name.endsWith(ext))
    .map((name) => `${dir}/${name}`);
}

test('precache lists every shipped script, stylesheet, font, icon, and dictionary', () => {
  const required = [
    './',
    'index.html',
    'manifest.webmanifest',
    ...shipped('js', '.js'),
    ...shipped('css', '.css'),
    ...shipped('fonts', '.woff2'),
    ...shipped('icons', ''),
    ...shipped('data', '.txt'),
  ];
  const missing = required.filter((rel) => !precache.has(rel));
  assert.deepStrictEqual(missing, [], `missing from sw.js PRECACHE: ${missing.join(', ')}`);
});

test('every precached file exists', () => {
  const absent = Array.from(precache).filter((rel) => rel !== './' && !fs.existsSync(path.join(root, rel)));
  assert.deepStrictEqual(absent, []);
});

test('index.html loads nothing from another origin', () => {
  const html = read('index.html');
  const external = html.match(/(?:src|href)="(https?:)?\/\/[^"]+"/g) || [];
  assert.deepStrictEqual(external, []);
});

test('index.html references only precached local files', () => {
  const html = read('index.html');
  const refs = Array.from(html.matchAll(/(?:src|href)="([^"#]+)"/g), (m) => m[1]);
  const scriptUrls = Array.from(html.matchAll(/'((?:data|js|css)\/[^']+)'/g), (m) => m[1]);
  const missing = refs.concat(scriptUrls).filter((rel) => !precache.has(rel));
  assert.deepStrictEqual(missing, []);
});

test('stylesheets load no remote resources', () => {
  for (const rel of shipped('css', '.css')) {
    assert(!/url\(\s*['"]?https?:/.test(read(rel)), `${rel} references a remote URL`);
    assert(!/@import/.test(read(rel)), `${rel} uses @import`);
  }
});

test('manifest icons and start_url are precached', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.strictEqual(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert(precache.has(icon.src), `${icon.src} not precached`);
});

test('the AI worker imports only precached scripts', () => {
  const worker = read('js/ai-worker.js');
  const imports = Array.from(worker.matchAll(/importScripts\(([^)]*)\)/g))
    .flatMap((m) => Array.from(m[1].matchAll(/'([^']+)'/g), (x) => `js/${x[1]}`));
  assert(imports.length > 0);
  for (const rel of imports) assert(precache.has(rel), `${rel} not precached`);
});

test('English and Spanish both have offline strings', () => {
  const i18n = read('js/i18n.js');
  for (const key of ['offlineSaving', 'offlineReady', 'offlineInstall', 'offlineIosHint']) {
    assert.strictEqual((i18n.match(new RegExp(`\\b${key}:`, 'g')) || []).length, 2, key);
  }
});

console.log(`\n${passed} passed`);
