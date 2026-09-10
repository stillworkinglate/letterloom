/**
 * Turn log, rematch seating, coach flag, and smarter exchange.
 * Run: node tests/history-coach.test.js
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
loadScript('js/storage.js');
loadScript('js/ai.js');

const Engine = global.LetterloomEngine;
const Storage = global.LetterloomStorage;
const AI = global.LetterloomAI;

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

test('new games start with an empty history and recorded opener', () => {
  const game = Engine.createGame(['Ada', 'Bea'], { firstPlayerIndex: 1 });
  assert.deepStrictEqual(game.history, []);
  assert.strictEqual(game.openingPlayerIndex, 1);
  assert.strictEqual(game.currentPlayerIndex, 1);
  assert.strictEqual(game.coachMode, false);
});

test('firstPlayerIndex skips the opening draw', () => {
  const game = Engine.createGame(['Ada', 'Bea'], { firstPlayerIndex: 0 });
  assert.strictEqual(game.currentPlayerIndex, 0);
  assert.strictEqual(game.players[0].rack.length, 7);
  assert.strictEqual(game.players[1].rack.length, 7);
});

test('coachMode is stored only for computer games', () => {
  const vsComputer = Engine.createGame(['Ada', 'Computer'], {
    mode: 'computer',
    computerSeat: 1,
    computerDifficulty: 'medium',
    coachMode: true,
  });
  assert.strictEqual(vsComputer.coachMode, true);

  const humans = Engine.createGame(['Ada', 'Bea'], { coachMode: true });
  assert.strictEqual(humans.coachMode, false);

  Engine.normalizeGameMeta(humans);
  assert.strictEqual(humans.coachMode, false);
});

test('play, exchange, and pass append history with rackBefore', () => {
  const words = new Set(['AT', 'TA']);
  const game = Engine.createGame(['Ada', 'Bea'], {
    firstPlayerIndex: 0,
    dictionary: words,
  });
  game.players[0].rack = [tile(1, 'A'), tile(2, 'T'), tile(3, 'Q'), tile(4, 'J')];
  game.players[1].rack = [tile(5, 'A'), tile(6, 'T'), tile(7, 'E')];

  const play = Engine.applyMove(
    game,
    [
      { row: 7, col: 7, tileId: 1 },
      { row: 7, col: 8, tileId: 2 },
    ],
    'horizontal'
  );
  assert.ok(play.ok, play.error);
  assert.strictEqual(game.history.length, 1);
  assert.strictEqual(game.history[0].type, 'play');
  assert.deepStrictEqual(game.history[0].words, ['AT']);
  assert.ok(game.history[0].score > 0);
  assert.strictEqual(game.history[0].rackBefore.length, 4);
  assert.strictEqual(game.history[0].playerIndex, 0);

  game.bag.push(tile(80, 'B'), tile(81, 'C'), tile(82, 'D'), tile(83, 'E'), tile(84, 'F'), tile(85, 'G'), tile(86, 'H'));
  const exchange = Engine.exchangeTiles(game, [game.players[1].rack[0].id]);
  assert.ok(exchange.ok, exchange.error);
  assert.strictEqual(game.history[1].type, 'exchange');
  assert.strictEqual(game.history[1].exchange, 1);
  assert.ok(game.history[1].exchangeLetters);
  assert.ok(game.history[1].rackBefore.length >= 1);

  const passedTurn = Engine.passTurn(game);
  assert.ok(passedTurn.ok);
  assert.strictEqual(game.history[2].type, 'pass');
  assert.ok(Array.isArray(game.history[2].rackBefore));
});

test('take-back rewrites undone turns into the log', () => {
  const words = new Set(['AT']);
  const game = Engine.createGame(['Ada', 'Bea'], {
    firstPlayerIndex: 0,
    dictionary: words,
  });
  game.players[0].rack = [tile(1, 'A'), tile(2, 'T')];
  const before = {
    history: game.history.slice(),
    currentPlayerIndex: game.currentPlayerIndex,
  };
  const play = Engine.applyMove(
    game,
    [
      { row: 7, col: 7, tileId: 1 },
      { row: 7, col: 8, tileId: 2 },
    ],
    'horizontal'
  );
  assert.ok(play.ok, play.error);
  const undone = game.history.slice(before.history.length);
  game.history = before.history.slice();
  game.currentPlayerIndex = before.currentPlayerIndex;
  const entry = Engine.recordTakeBack(game, undone, 0);
  assert.strictEqual(entry.type, 'takeback');
  assert.strictEqual(game.history.length, 2);
  assert.strictEqual(game.history[0].type, 'play');
  assert.strictEqual(game.history[0].takenBack, true);
  assert.strictEqual(game.history[1].type, 'takeback');
  assert.strictEqual(game.lastMove.takeback, true);
});

test('coach notes append without changing the turn', () => {
  const game = Engine.createGame(['Ada', 'Computer'], {
    mode: 'computer',
    computerSeat: 1,
    firstPlayerIndex: 0,
    coachMode: true,
  });
  const turn = game.turnNumber;
  const seat = game.currentPlayerIndex;
  Engine.recordCoachNote(game, {
    turnNumber: 3,
    playerIndex: 0,
    action: 'play',
    words: ['FOXED'],
    score: 46,
  });
  assert.strictEqual(game.turnNumber, turn);
  assert.strictEqual(game.currentPlayerIndex, seat);
  assert.strictEqual(game.history[0].type, 'coach');
  assert.deepStrictEqual(game.history[0].words, ['FOXED']);
  assert.strictEqual(game.history[0].score, 46);
});

test('old snapshots without history or coachMode still load', () => {
  const board = Array.from({ length: 15 }, () => Array(15).fill(null));
  const snapshot = {
    version: 1,
    id: 'save-legacy-history',
    name: 'Ada vs Bea · Turn 1',
    savedAt: '2024-01-01T00:00:00.000Z',
    game: {
      board,
      players: [
        { name: 'Ada', rack: [tile(1, 'A')], score: 0 },
        { name: 'Bea', rack: [tile(2, 'B')], score: 0 },
      ],
      bag: [tile(3, 'C')],
      currentPlayerIndex: 0,
      turnNumber: 1,
      status: 'playing',
    },
    ui: { pendingPlacements: [], selectedTileId: null, exchangeMode: false, exchangeTileIds: [] },
  };
  assert.ok(Storage.validateSnapshot(snapshot));
  Engine.normalizeGameMeta(snapshot.game);
  assert.deepStrictEqual(snapshot.game.history, []);
  assert.strictEqual(snapshot.game.coachMode, false);
});

test('computer snapshots persist coachMode and history', () => {
  const game = Engine.createGame(['Ada', 'Computer'], {
    mode: 'computer',
    computerSeat: 1,
    computerDifficulty: 'easy',
    coachMode: true,
    firstPlayerIndex: 0,
  });
  Engine.recordCoachNote(game, {
    turnNumber: 1,
    playerIndex: 0,
    action: 'pass',
  });
  const snapshot = Storage.createSnapshot(game, {}, { name: 'Ada vs Computer' });
  assert.ok(Storage.validateSnapshot(snapshot));
  assert.strictEqual(snapshot.game.coachMode, true);
  assert.strictEqual(snapshot.game.history.length, 1);
  assert.ok(!('dictionary' in snapshot.game));
});

test('exchange keeps S and blanks instead of dumping the rack', () => {
  const rack = [
    tile(1, 'Q'),
    tile(2, 'J'),
    tile(3, 'V'),
    tile(4, 'S'),
    tile(5, ' ', { isBlank: true }),
    tile(6, 'Z'),
    tile(7, 'W'),
  ];
  const action = AI.chooseExchange(rack, 20, Engine);
  assert.ok(action);
  assert.strictEqual(action.type, 'exchange');
  const kept = rack.filter((item) => !action.tileIds.includes(item.id));
  assert.ok(kept.some((item) => item.isBlank), 'should keep the blank');
  assert.ok(kept.some((item) => item.letter === 'S'), 'should keep S');
  assert.ok(action.tileIds.includes(1), 'should dump Q');
});

test('take-back log still writes after the game has ended', () => {
  const words = new Set(['AT']);
  const game = Engine.createGame(['Ada', 'Bea'], {
    firstPlayerIndex: 0,
    dictionary: words,
  });
  game.players[0].rack = [tile(1, 'A'), tile(2, 'T')];
  const historyBefore = game.history.slice();
  const play = Engine.applyMove(
    game,
    [
      { row: 7, col: 7, tileId: 1 },
      { row: 7, col: 8, tileId: 2 },
    ],
    'horizontal'
  );
  assert.ok(play.ok, play.error);
  game.status = 'ended';
  game.endReason = 'last_tile_played';
  const undone = game.history.slice(historyBefore.length);
  game.history = historyBefore.slice();
  const entry = Engine.recordTakeBack(game, undone, 0);
  assert.strictEqual(entry.type, 'takeback');
  assert.strictEqual(game.history[game.history.length - 1].type, 'takeback');
});

test('ugly-only racks still exchange every tile', () => {
  const rack = [tile(1, 'Z'), tile(2, 'Q'), tile(3, 'J')];
  const action = AI.chooseExchange(rack, 20, Engine);
  assert.deepStrictEqual(action.tileIds.slice().sort(), [1, 2, 3]);
});

console.log(`\n${passed} tests passed`);
