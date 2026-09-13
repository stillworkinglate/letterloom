/**
 * Display prefs (Large print) — separate from game saves.
 * Run: node tests/prefs.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function loadScript(rel) {
  const filename = path.join(root, rel);
  vm.runInThisContext(fs.readFileSync(filename, 'utf8'), { filename });
}

const memory = new Map();
const localStorage = {
  getItem(key) {
    return memory.has(key) ? memory.get(key) : null;
  },
  setItem(key, value) {
    memory.set(key, String(value));
  },
  removeItem(key) {
    memory.delete(key);
  },
};

global.localStorage = localStorage;

loadScript('js/storage.js');

const Storage = global.LetterloomStorage;

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

test('prefs default to large print off and do not touch game save keys', () => {
  assert.strictEqual(Storage.PREFS_KEY, 'letterloom-prefs-v1');
  assert.deepStrictEqual(Storage.getPrefs(), { largePrint: false });
  assert.strictEqual(localStorage.getItem(Storage.INDEX_KEY), null);
  assert.strictEqual(Storage.SAVE_VERSION, 1);
});

test('setPrefs persists large print and ignores junk', () => {
  const next = Storage.setPrefs({ largePrint: true, extra: 'nope' });
  assert.deepStrictEqual(next, { largePrint: true });
  assert.deepStrictEqual(Storage.getPrefs(), { largePrint: true });
  const stored = JSON.parse(localStorage.getItem(Storage.PREFS_KEY));
  assert.deepStrictEqual(stored, { largePrint: true });

  Storage.setPrefs({ largePrint: 0 });
  assert.deepStrictEqual(Storage.getPrefs(), { largePrint: false });
});

test('corrupt prefs JSON falls back without throwing', () => {
  localStorage.setItem(Storage.PREFS_KEY, '{not-json');
  assert.deepStrictEqual(Storage.getPrefs(), { largePrint: false });
  localStorage.setItem(Storage.PREFS_KEY, 'null');
  assert.deepStrictEqual(Storage.getPrefs(), { largePrint: false });
});

test('toggling prefs does not change SAVE_VERSION or invalidate snapshots', () => {
  Storage.setPrefs({ largePrint: true });
  const snapshot = {
    version: Storage.SAVE_VERSION,
    id: 'save-test',
    name: 'Ada vs Bea',
    savedAt: new Date().toISOString(),
    game: {
      players: [
        { name: 'Ada', score: 0, rack: [] },
        { name: 'Bea', score: 0, rack: [] },
      ],
      board: Array.from({ length: 15 }, () => Array(15).fill(null)),
      bag: [],
    },
    ui: { pendingPlacements: [], selectedTileId: null, exchangeMode: false, exchangeTileIds: [] },
  };
  assert.ok(Storage.validateSnapshot(snapshot));
});

console.log(`\n${passed} tests passed`);
