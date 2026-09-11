/**
 * Unseen leftover counts and history-derived local stats.
 * Run: node tests/unseen-stats.test.js
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

loadScript('js/engine.js');
loadScript('js/storage.js');

const Engine = global.LetterloomEngine;
const Storage = global.LetterloomStorage;

function tile(id, letter, extra = {}) {
  const isBlank = extra.isBlank || letter === ' ';
  const points =
    extra.points != null
      ? extra.points
      : isBlank
        ? 0
        : (Engine.TILE_DISTRIBUTION[letter] && Engine.TILE_DISTRIBUTION[letter].points) || 1;
  return { id, letter: isBlank ? ' ' : letter, points, isBlank };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function fullSetCount() {
  return Object.values(Engine.TILE_DISTRIBUTION).reduce((sum, info) => sum + info.count, 0);
}

test('new game unseen grid is 26 letters plus blanks, excluding the viewer rack', () => {
  const game = Engine.createGame(['Ada', 'Bea'], { firstPlayerIndex: 0 });
  const unseen = Engine.getUnseenTiles(game, { viewerIndex: 0 });
  assert.strictEqual(unseen.letters.length, 26);
  assert.strictEqual(unseen.letters[0].letter, 'A');
  assert.strictEqual(unseen.letters[25].letter, 'Z');
  assert.strictEqual(unseen.total + game.players[0].rack.length, fullSetCount());
  assert.strictEqual(unseen.bagCount, game.bag.length);
  assert.strictEqual(unseen.opponentCount, game.players[1].rack.length);
  assert.strictEqual(unseen.revealed, false);
  assert.strictEqual(unseen.letters.reduce((sum, entry) => sum + entry.count, 0) + unseen.blanks, unseen.total);
});

test('played tiles leave the leftover grid and blanks stay on the blank count', () => {
  const words = new Set(['AT', 'TA']);
  const game = Engine.createGame(['Ada', 'Bea'], {
    firstPlayerIndex: 0,
    dictionary: words,
  });
  game.players[0].rack = [tile(1, 'A'), tile(2, 'T'), tile(3, 'Q')];
  game.players[1].rack = [tile(4, 'A'), tile(5, 'T')];
  game.bag = [tile(6, 'E'), tile(7, ' ', { isBlank: true })];

  const before = Engine.getUnseenTiles(game, { viewerIndex: 0 });
  Engine.applyMove(
    game,
    [
      { row: 7, col: 7, tileId: 1 },
      { row: 7, col: 8, tileId: 2 },
    ],
    'horizontal'
  );

  const after = Engine.getUnseenTiles(game, { viewerIndex: 0 });
  assert.strictEqual(after.letters.find((entry) => entry.letter === 'A').count, before.letters.find((entry) => entry.letter === 'A').count);
  assert.strictEqual(after.letters.find((entry) => entry.letter === 'T').count, before.letters.find((entry) => entry.letter === 'T').count);
  assert.ok(after.total < before.total);

  game.board[0][0] = { letter: 'Z', points: 0, isBlank: true, tileId: 99 };
  const withBlank = Engine.getUnseenTiles(game, { viewerIndex: 0 });
  assert.strictEqual(withBlank.blanks, Math.max(0, after.blanks - 1));
});

test('ended games reveal leftover tiles from both racks', () => {
  const game = Engine.createGame(['Ada', 'Bea'], { firstPlayerIndex: 0 });
  game.status = 'ended';
  game.endReason = 'all_passed';
  const leftover = Engine.getUnseenTiles(game);
  assert.strictEqual(leftover.revealed, true);
  assert.strictEqual(leftover.total, game.bag.length + game.players[0].rack.length + game.players[1].rack.length);
});

test('history summary skips take-backs and coach notes', () => {
  const words = new Set(['AT']);
  const game = Engine.createGame(['Ada', 'Bea'], {
    firstPlayerIndex: 0,
    dictionary: words,
  });
  game.players[0].rack = [
    tile(1, 'A'),
    tile(2, 'T'),
    tile(3, 'Q'),
    tile(4, 'J'),
    tile(5, 'X'),
    tile(6, 'V'),
    tile(7, 'W'),
  ];
  const play = Engine.applyMove(
    game,
    [
      { row: 7, col: 7, tileId: 1 },
      { row: 7, col: 8, tileId: 2 },
    ],
    'horizontal'
  );
  assert.ok(play.ok, play.error);

  game.bag.push(tile(80, 'B'), tile(81, 'C'), tile(82, 'D'), tile(83, 'E'), tile(84, 'F'), tile(85, 'G'), tile(86, 'H'));
  Engine.exchangeTiles(game, [game.players[1].rack[0].id]);
  const beforePass = game.history.slice();
  Engine.passTurn(game);
  const undone = game.history.slice(beforePass.length);
  game.history = beforePass;
  Engine.recordCoachNote(game, { action: 'play', words: ['QUIZ'], score: 80, playerIndex: 0 });
  Engine.recordTakeBack(game, undone, 0);

  const stats = Engine.summarizeHistory(game);
  assert.strictEqual(stats.plays, 1);
  assert.strictEqual(stats.exchanges, 1);
  assert.strictEqual(stats.passes, 0);
  assert.strictEqual(stats.bingos, 0);
  assert.strictEqual(stats.bestPlay.words[0], 'AT');
  assert.strictEqual(stats.players[0].plays, 1);
  assert.strictEqual(stats.players[1].exchanges, 1);
});

test('bingo plays increment the bingo count', () => {
  const stats = Engine.summarizeHistory({
    players: [
      { name: 'Ada', score: 80 },
      { name: 'Bea', score: 10 },
    ],
    history: [
      { type: 'play', playerIndex: 0, playerName: 'Ada', words: ['QUARTZY'], score: 80, tilesPlayed: 7 },
    ],
    status: 'ended',
    mode: 'human',
  });
  assert.strictEqual(stats.bingos, 1);
  assert.strictEqual(stats.players[0].bingos, 1);
  assert.strictEqual(stats.winnerName, 'Ada');
  assert.strictEqual(stats.isTie, false);
});

test('local stats read finished history and do not double-count', () => {
  memory.clear();
  const game = Engine.createGame(['Ada', 'Computer'], {
    mode: 'computer',
    computerSeat: 1,
    firstPlayerIndex: 0,
    computerDifficulty: 'easy',
  });
  game.status = 'ended';
  game.endReason = 'all_passed';
  game.players[0].score = 120;
  game.players[1].score = 90;
  game.history = [
    { type: 'play', playerIndex: 0, playerName: 'Ada', words: ['ZOOM'], score: 44, tilesPlayed: 4 },
    { type: 'play', playerIndex: 1, playerName: 'Computer', words: ['IT'], score: 4, tilesPlayed: 2 },
  ];

  const first = Storage.recordFinishedGame(game);
  const second = Storage.recordFinishedGame(game);
  assert.ok(first.ok);
  assert.ok(second.ok);
  assert.strictEqual(second.duplicate, true);

  Storage.saveGame(game, {}, { name: 'Ada vs Computer (finished)' });
  const local = Storage.getLocalStats();
  assert.strictEqual(local.finished, 1);
  assert.strictEqual(local.computerGames, 1);
  assert.strictEqual(local.vsComputer.wins, 1);
  assert.strictEqual(local.vsComputer.losses, 0);
  assert.strictEqual(local.bestPlay.words[0], 'ZOOM');
  assert.strictEqual(local.bestPlay.score, 44);
});

console.log(`\n${passed} tests passed`);
