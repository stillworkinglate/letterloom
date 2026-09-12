/**
 * Spanish language pack: bag, Ñ, blanks, leftover grid.
 * Run: node tests/language.test.js
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

loadScript('js/engine.js');
loadScript('js/ai.js');
loadScript('js/i18n.js');

const Engine = global.LetterloomEngine;
const AI = global.LetterloomAI;
const I18n = global.LetterloomI18n;

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function tile(id, letter, extra = {}) {
  const isBlank = extra.isBlank || letter === ' ';
  const dist = Engine.getTileDistribution(extra.language || 'es');
  const points =
    extra.points != null ? extra.points : isBlank ? 0 : (dist[letter] && dist[letter].points) || 1;
  return { id, letter: isBlank ? ' ' : letter, points, isBlank };
}

test('Spanish alphabet is 25 letters with Ñ after N and no K/W', () => {
  const alphabet = Engine.getAlphabet('es');
  assert.strictEqual(alphabet.length, 25);
  assert.ok(alphabet.includes('Ñ'));
  assert.ok(!alphabet.includes('K'));
  assert.ok(!alphabet.includes('W'));
  assert.ok(alphabet.indexOf('Ñ') === alphabet.indexOf('N') + 1);
  assert.strictEqual(Engine.getAlphabet('en').length, 26);
});

test('Spanish bag is 100 tiles and includes Ñ', () => {
  const bag = Engine.createTileBag('es');
  assert.strictEqual(bag.length, 100);
  assert.ok(bag.some((item) => item.letter === 'Ñ' && item.points === 8));
  assert.ok(!bag.some((item) => item.letter === 'K' || item.letter === 'W'));
  const blanks = bag.filter((item) => item.isBlank);
  assert.strictEqual(blanks.length, 2);
});

test('createGame stores language and Spanish leftover grid includes Ñ', () => {
  const game = Engine.createGame(['Ada', 'Bea'], { language: 'es', firstPlayerIndex: 0 });
  assert.strictEqual(game.language, 'es');
  const unseen = Engine.getUnseenTiles(game, { viewerIndex: 0 });
  assert.strictEqual(unseen.letters.length, 25);
  assert.strictEqual(unseen.letters.find((entry) => entry.letter === 'Ñ').letter, 'Ñ');
  assert.ok(!unseen.letters.some((entry) => entry.letter === 'K'));
  const totalTiles = Object.values(Engine.getTileDistribution('es')).reduce(
    (sum, info) => sum + info.count,
    0
  );
  assert.strictEqual(unseen.total + game.players[0].rack.length, totalTiles);
});

test('Spanish blanks may be Ñ and may not be K', () => {
  const words = new Set(['NIÑO', 'CASA']);
  const game = Engine.createGame(['Ada', 'Bea'], {
    language: 'es',
    firstPlayerIndex: 0,
    dictionary: words,
  });
  game.players[0].rack = [
    tile(1, ' ', { isBlank: true }),
    tile(2, 'I'),
    tile(3, 'N'),
    tile(4, 'O'),
  ];
  const ok = Engine.validatePlacement(
    game,
    [
      { row: 7, col: 6, tileId: 3 },
      { row: 7, col: 7, tileId: 2 },
      { row: 7, col: 8, tileId: 1, letter: 'Ñ' },
      { row: 7, col: 9, tileId: 4 },
    ],
    'horizontal'
  );
  assert.ok(ok.ok, ok.error);

  const bad = Engine.validatePlacement(
    game,
    [{ row: 7, col: 7, tileId: 1, letter: 'K' }],
    'horizontal'
  );
  assert.ok(!bad.ok);
  assert.match(bad.error, /alphabet/i);
});

test('English leftover grid stays 26 letters A–Z', () => {
  const game = Engine.createGame(['Ada', 'Bea'], { firstPlayerIndex: 0 });
  assert.strictEqual(game.language, 'en');
  const unseen = Engine.getUnseenTiles(game, { viewerIndex: 0 });
  assert.strictEqual(unseen.letters.length, 26);
  assert.strictEqual(unseen.letters[0].letter, 'A');
  assert.strictEqual(unseen.letters[25].letter, 'Z');
});

test('AI can play a Spanish Ñ word', () => {
  const words = new Set(['NIÑO', 'CASA', 'AS', 'SA']);
  const index = AI.buildIndex(words);
  const board = Array.from({ length: 15 }, () => Array(15).fill(null));
  const snap = {
    board,
    rack: [tile(1, 'N'), tile(2, 'I'), tile(3, 'Ñ'), tile(4, 'O')],
    bagCount: 80,
    isFirstMove: true,
    status: 'playing',
    turnNumber: 1,
    language: 'es',
  };
  const moves = AI.generateMoves(Engine, index, snap);
  assert.ok(
    moves.some((move) => (move.words || []).includes('NIÑO')),
    `expected NIÑO among ${JSON.stringify(moves.map((m) => m.words))}`
  );
});

test('i18n switches setup and error strings', () => {
  I18n.setLanguage('es');
  assert.strictEqual(I18n.t('playWord'), 'Jugar palabra');
  assert.strictEqual(
    I18n.translateEngineError('Blank tiles must be assigned a letter from the alphabet.'),
    'Las blancas deben ser una letra del alfabeto.'
  );
  I18n.setLanguage('en');
  assert.strictEqual(I18n.t('playWord'), 'Play Word');
});

test('English and Spanish catalogs share the same keys', () => {
  const src = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8');
  const enBlock = src.slice(src.indexOf('const EN ='), src.indexOf('const ES ='));
  const esBlock = src.slice(src.indexOf('const ES ='), src.indexOf('const CATALOGS'));
  const keys = (block) =>
    [...block.matchAll(/^\s{4}([A-Za-z0-9]+):/gm)].map((match) => match[1]);
  const en = new Set(keys(enBlock));
  const es = new Set(keys(esBlock));
  assert.deepStrictEqual([...en].filter((key) => !es.has(key)), []);
  assert.deepStrictEqual([...es].filter((key) => !en.has(key)), []);
});

test('Spanish lexicon keeps Ñ words and common playables', () => {
  const text = fs.readFileSync(path.join(root, 'data/words.es.txt'), 'utf8');
  const words = new Set(text.split(/\n/));
  assert.ok(words.has('NIÑO'));
  assert.ok(words.has('CASA'));
  assert.ok(!words.has('NINO'));
  assert.ok(!text.split(/\n/).some((word) => /[KW]/.test(word)));
});

console.log(`\n${passed} tests passed`);
