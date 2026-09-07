/**
 * Letterloom computer-opponent tests. Run: node tests/ai.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const assert = require('assert');

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

const WORDS = [
  'AT', 'ATE', 'TEA', 'EAT', 'ETA', 'TA',
  'CAT', 'CATS', 'SAT', 'TAS', 'AS',
  'STAR', 'RATS', 'ARTS', 'TSAR',
  'QI', 'QAT', 'ZA',
  'HELLO', 'WORLD',
  'BLANK', 'LANE', 'PLAN',
  'TRAIN', 'RAIN', 'AIN',
  'SQUIRE', 'QUIRES', 'RETAINS', 'NASTIER', 'RETSINA',
  'AE', 'BE', 'IT', 'TO', 'OR', 'NO', 'ON', 'IN', 'AN', 'NA',
];

function emptyBoard() {
  return Array.from({ length: 15 }, () => Array(15).fill(null));
}

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

function placed(letter, extra = {}) {
  return {
    letter,
    points: extra.points != null ? extra.points : Engine.TILE_DISTRIBUTION[letter].points,
    isBlank: Boolean(extra.isBlank),
    tileId: extra.tileId || 900 + letter.charCodeAt(0),
  };
}

function snapshotFrom(board, rack, extras = {}) {
  return {
    board,
    rack,
    bagCount: extras.bagCount != null ? extras.bagCount : 80,
    isFirstMove: extras.isFirstMove != null ? extras.isFirstMove : AI.boardIsEmpty(board),
    status: extras.status || 'playing',
    turnNumber: extras.turnNumber || 1,
    currentPlayerIndex: extras.currentPlayerIndex || 0,
    consecutivePasses: extras.consecutivePasses || 0,
    scores: extras.scores || [0, 0],
    playerCount: 2,
  };
}

function allMovesValid(index, snap) {
  const moves = AI.generateMoves(Engine, index, snap);
  const searchGame = {
    board: snap.board,
    players: [{ name: 'Computer', rack: snap.rack, score: 0 }],
    currentPlayerIndex: 0,
    status: 'playing',
    dictionary: index.words,
    isFirstMove: snap.isFirstMove,
    bag: [],
  };
  for (const move of moves) {
    const validation = Engine.validatePlacement(searchGame, move.placements, move.direction);
    assert.ok(validation.ok, `generated illegal move: ${validation.error} ${JSON.stringify(move)}`);
    for (const placement of move.placements) {
      const rackTile = snap.rack.find((t) => t.id === placement.tileId);
      assert.ok(rackTile, 'placement uses a rack tile');
      if (rackTile.isBlank) {
        assert.ok(placement.letter && placement.letter >= 'A' && placement.letter <= 'Z');
      }
    }
  }
  return moves;
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

const index = AI.buildIndex(WORDS);

test('createGame still defaults to human vs human', () => {
  const game = Engine.createGame(['Ada', 'Bea']);
  assert.strictEqual(game.mode, 'human');
  assert.strictEqual(game.computerSeat, null);
  assert.strictEqual(game.players.length, 2);
});

test('createGame stores computer mode, seat, and difficulty', () => {
  const game = Engine.createGame(['Ada', 'Computer'], {
    mode: 'computer',
    computerSeat: 1,
    computerDifficulty: 'hard',
    computerSeed: 42,
  });
  assert.strictEqual(game.mode, 'computer');
  assert.strictEqual(game.computerSeat, 1);
  assert.strictEqual(game.computerDifficulty, 'hard');
  assert.strictEqual(game.computerSeed, 42);
  assert.ok(Engine.isComputerTurn(game) === (game.currentPlayerIndex === 1));
});

test('opening moves cover the center and are engine-legal', () => {
  const rack = [
    tile(1, 'C'),
    tile(2, 'A'),
    tile(3, 'T'),
    tile(4, 'S'),
    tile(5, 'E'),
    tile(6, 'R'),
    tile(7, 'N'),
  ];
  const snap = snapshotFrom(emptyBoard(), rack, { isFirstMove: true });
  const moves = allMovesValid(index, snap);
  assert.ok(moves.length > 0, 'expected opening moves');
  for (const move of moves) {
    const covers = move.placements.some((p) => p.row === 7 && p.col === 7);
    assert.ok(covers, 'opening move must cover center');
    assert.ok(move.score > 0);
  }
});

test('connected midgame play includes crosswords', () => {
  const board = emptyBoard();
  board[7][6] = placed('C');
  board[7][7] = placed('A');
  board[7][8] = placed('T');
  const rack = [tile(1, 'S'), tile(2, 'A'), tile(3, 'T'), tile(4, 'E')];
  const snap = snapshotFrom(board, rack, { isFirstMove: false });
  const moves = allMovesValid(index, snap);
  assert.ok(moves.length > 0);
  const withCross = moves.filter((m) => m.words.length > 1);
  assert.ok(withCross.length > 0, 'expected at least one crossword');
});

test('blank keeps its assigned letter and scores zero', () => {
  const board = emptyBoard();
  board[7][7] = placed('A');
  board[7][8] = placed('T');
  const rack = [tile(1, ' ', { isBlank: true })];
  const snap = snapshotFrom(board, rack, { isFirstMove: false });
  const moves = allMovesValid(index, snap);
  const blankMoves = moves.filter((m) => m.placements.some((p) => {
    const t = rack.find((tileOnRack) => tileOnRack.id === p.tileId);
    return t && t.isBlank;
  }));
  assert.ok(blankMoves.length > 0, 'blank should be playable');
  for (const move of blankMoves) {
    const blankPlacement = move.placements.find((p) => p.tileId === 1);
    assert.ok(blankPlacement.letter && blankPlacement.letter !== ' ');
    const searchGame = {
      board,
      players: [{ name: 'Computer', rack, score: 0 }],
      currentPlayerIndex: 0,
      status: 'playing',
      dictionary: index.words,
    };
    const validation = Engine.validatePlacement(searchGame, move.placements, move.direction);
    assert.ok(validation.ok);
    const blankCell = validation.placements.find((p) => p.tileId === 1);
    assert.strictEqual(blankCell.isBlank, true);
    assert.strictEqual(blankCell.points, 0);
    assert.ok(blankCell.letter >= 'A' && blankCell.letter <= 'Z');
  }
});

test('seven-tile play includes the bingo bonus', () => {
  const rack = [
    tile(1, 'T'),
    tile(2, 'R'),
    tile(3, 'A'),
    tile(4, 'I'),
    tile(5, 'N'),
    tile(6, 'S'),
    tile(7, 'E'),
  ];
  const board = emptyBoard();
  const snap = snapshotFrom(board, rack, { isFirstMove: true });
  const moves = allMovesValid(index, snap);
  const bingos = moves.filter((m) => m.tilesPlayed === 7);
  if (bingos.length > 0) {
    for (const move of bingos) {
      assert.ok(
        move.breakdown.some((entry) => entry.word === '(bingo bonus)' && entry.score === 50),
        'bingo must include +50 from the engine'
      );
      assert.ok(move.score >= 50);
    }
  }
});

test('premium squares are scored by the engine, not a second ruleset', () => {
  const board = emptyBoard();
  const rack = [tile(1, 'A'), tile(2, 'T')];
  const snap = snapshotFrom(board, rack, { isFirstMove: true });
  const moves = allMovesValid(index, snap);
  const throughCenter = moves.find(
    (m) => m.words.includes('AT') && m.placements.length === 2
  );
  assert.ok(throughCenter, 'AT through center should exist');
  // Center is DW; A=1 T=1 → (1+1)*2 = 4
  assert.strictEqual(throughCenter.score, 4);
});

test('same seed reproduces the same Easy/Medium choice', () => {
  const rack = [
    tile(1, 'C'),
    tile(2, 'A'),
    tile(3, 'T'),
    tile(4, 'S'),
    tile(5, 'E'),
    tile(6, 'R'),
    tile(7, 'N'),
  ];
  const snap = snapshotFrom(emptyBoard(), rack, { isFirstMove: true, turnNumber: 3 });
  const a = AI.decideTurn(snap, { engine: Engine, index, difficulty: 'easy', seed: 12345 });
  const b = AI.decideTurn(snap, { engine: Engine, index, difficulty: 'easy', seed: 12345 });
  assert.strictEqual(a.type, 'play');
  assert.deepStrictEqual(a.placements, b.placements);
  assert.strictEqual(a.direction, b.direction);
  const c = AI.decideTurn(snap, { engine: Engine, index, difficulty: 'medium', seed: 99 });
  const d = AI.decideTurn(snap, { engine: Engine, index, difficulty: 'medium', seed: 99 });
  assert.deepStrictEqual(c.placements, d.placements);
});

test('Hard uses the documented score + leave heuristic and is not claimed optimal', () => {
  assert.ok(AI.HARD_HEURISTIC_DOCS.includes('not an optimal'));
  const rack = [
    tile(1, 'C'),
    tile(2, 'A'),
    tile(3, 'T'),
    tile(4, 'S'),
    tile(5, 'E'),
    tile(6, 'R'),
    tile(7, 'N'),
  ];
  const snap = snapshotFrom(emptyBoard(), rack, { isFirstMove: true });
  const moves = AI.generateMoves(Engine, index, snap);
  const hard = AI.decideTurn(snap, { engine: Engine, index, difficulty: 'hard', seed: 1 });
  assert.strictEqual(hard.type, 'play');
  const best = moves.reduce((winner, move) => {
    const h = move.score + AI.HARD_LEAVE_WEIGHT * move.leave;
    const wh = winner.score + AI.HARD_LEAVE_WEIGHT * winner.leave;
    return h > wh ? move : winner;
  });
  assert.strictEqual(hard.score + AI.HARD_LEAVE_WEIGHT * hard.leave, best.score + AI.HARD_LEAVE_WEIGHT * best.leave);
});

test('Easy chooses a lower-scoring band than Hard on a rich opening rack', () => {
  const rack = [
    tile(1, 'C'),
    tile(2, 'A'),
    tile(3, 'T'),
    tile(4, 'S'),
    tile(5, 'E'),
    tile(6, 'R'),
    tile(7, 'N'),
  ];
  const snap = snapshotFrom(emptyBoard(), rack, { isFirstMove: true });
  const easy = AI.decideTurn(snap, { engine: Engine, index, difficulty: 'easy', seed: 7 });
  const hard = AI.decideTurn(snap, { engine: Engine, index, difficulty: 'hard', seed: 7 });
  assert.strictEqual(easy.type, 'play');
  assert.strictEqual(hard.type, 'play');
  assert.ok(easy.score <= hard.score, `easy ${easy.score} should be <= hard ${hard.score}`);
});

test('no legal placement exchanges when the bag allows it, otherwise passes', () => {
  const stuckIndex = AI.buildIndex(['HELLO', 'WORLD']);
  const board = emptyBoard();
  board[7][6] = placed('H');
  board[7][7] = placed('E');
  board[7][8] = placed('L');
  board[7][9] = placed('L');
  board[7][10] = placed('O');
  const rack = [tile(1, 'Z'), tile(2, 'Q'), tile(3, 'J')];
  const exchangeSnap = snapshotFrom(board, rack, { isFirstMove: false, bagCount: 20 });
  const generated = AI.generateMoves(Engine, stuckIndex, exchangeSnap);
  assert.strictEqual(generated.length, 0);
  const exchange = AI.decideTurn(exchangeSnap, {
    engine: Engine,
    index: stuckIndex,
    difficulty: 'hard',
    seed: 1,
  });
  assert.strictEqual(exchange.type, 'exchange');
  assert.deepStrictEqual(exchange.tileIds.slice().sort(), [1, 2, 3]);

  const passSnap = snapshotFrom(board, rack, { isFirstMove: false, bagCount: 3 });
  const pass = AI.decideTurn(passSnap, {
    engine: Engine,
    index: stuckIndex,
    difficulty: 'hard',
    seed: 1,
  });
  assert.strictEqual(pass.type, 'pass');
});

test('public snapshot omits opponent racks and bag order', () => {
  const game = Engine.createGame(['Ada', 'Computer'], {
    mode: 'computer',
    computerSeat: 1,
    computerDifficulty: 'medium',
    dictionary: index.words,
  });
  const snap = AI.publicSnapshot(game, 1);
  assert.ok(snap);
  assert.strictEqual(snap.rack, game.players[1].rack);
  assert.strictEqual(snap.bagCount, game.bag.length);
  assert.ok(!('bag' in snap));
  assert.ok(!snap.opponentRack);
  const encoded = JSON.stringify(snap);
  for (const tileOnRack of game.players[0].rack) {
    assert.ok(!encoded.includes(`"id":${tileOnRack.id}`), 'must not leak human tile ids');
  }
});

test('old human-vs-human JSON snapshots still validate', () => {
  const board = emptyBoard();
  const snapshot = {
    version: 1,
    id: 'save-legacy',
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
  assert.strictEqual(snapshot.game.mode, 'human');
  assert.strictEqual(snapshot.game.computerSeat, null);
});

test('new computer games persist mode, seat, and difficulty in JSON', () => {
  const game = Engine.createGame(['Ada', 'Computer'], {
    mode: 'computer',
    computerSeat: 1,
    computerDifficulty: 'easy',
    computerSeed: 77,
  });
  const snapshot = Storage.createSnapshot(game, {}, { name: 'Ada vs Computer' });
  assert.ok(Storage.validateSnapshot(snapshot));
  assert.strictEqual(snapshot.game.mode, 'computer');
  assert.strictEqual(snapshot.game.computerSeat, 1);
  assert.strictEqual(snapshot.game.computerDifficulty, 'easy');
  assert.strictEqual(snapshot.game.computerSeed, 77);
  assert.ok(!('dictionary' in snapshot.game));
});

test('loading a computer-to-move snapshot does not apply a move', () => {
  const game = Engine.createGame(['Ada', 'Computer'], {
    mode: 'computer',
    computerSeat: 1,
    computerDifficulty: 'medium',
    computerSeed: 5,
    dictionary: index.words,
  });
  game.currentPlayerIndex = 1;
  const beforeTurn = game.turnNumber;
  const beforeBag = game.bag.length;
  const snap = AI.publicSnapshot(game, 1);
  assert.strictEqual(game.currentPlayerIndex, 1);
  assert.strictEqual(game.turnNumber, beforeTurn);
  assert.strictEqual(game.bag.length, beforeBag);
  assert.strictEqual(snap.turnNumber, beforeTurn);
  const roundTripped = JSON.parse(JSON.stringify(Storage.createSnapshot(game)));
  assert.ok(Storage.validateSnapshot(roundTripped));
  assert.strictEqual(roundTripped.game.currentPlayerIndex, 1);
  assert.strictEqual(roundTripped.game.turnNumber, beforeTurn);
  assert.strictEqual(roundTripped.game.mode, 'computer');
});

test('computer commit uses the same applyMove transition', () => {
  const game = Engine.createGame(['Ada', 'Computer'], {
    mode: 'computer',
    computerSeat: 1,
    computerDifficulty: 'hard',
    computerSeed: 11,
    dictionary: index.words,
  });
  game.currentPlayerIndex = 1;
  game.players[1].rack = [
    tile(101, 'C'),
    tile(102, 'A'),
    tile(103, 'T'),
    tile(104, 'S'),
    tile(105, 'E'),
    tile(106, 'R'),
    tile(107, 'N'),
  ];
  const action = AI.decideTurn(AI.publicSnapshot(game, 1), {
    engine: Engine,
    index,
    difficulty: 'hard',
    seed: AI.mixSeed(11, game.turnNumber),
  });
  assert.strictEqual(action.type, 'play');
  const result = Engine.applyMove(game, action.placements, action.direction);
  assert.ok(result.ok, result.error);
  assert.strictEqual(game.lastMove.score, action.score);
  assert.deepStrictEqual(game.lastMove.words, action.words);
  assert.ok(game.currentPlayerIndex === 0 || game.status === 'ended');
});

test('mixSeed is stable and createRng is deterministic', () => {
  assert.strictEqual(AI.mixSeed(100, 3), AI.mixSeed(100, 3));
  assert.notStrictEqual(AI.mixSeed(100, 3), AI.mixSeed(100, 4));
  const a = AI.createRng(42);
  const b = AI.createRng(42);
  assert.strictEqual(a(), b());
  assert.strictEqual(a(), b());
});

const wordList = fs
  .readFileSync(path.join(root, 'data/words.txt'), 'utf8')
  .trim()
  .split('\n')
  .map((w) => w.trim().toUpperCase())
  .filter((w) => w.length >= 2 && w.length <= 15);

test('full lexicon opening search returns only engine-legal moves', () => {
  const fullIndex = AI.buildIndex(wordList);
  const rack = [
    tile(1, 'A'),
    tile(2, 'R'),
    tile(3, 'E'),
    tile(4, 'S'),
    tile(5, 'T'),
    tile(6, 'I'),
    tile(7, 'N'),
  ];
  const snap = snapshotFrom(emptyBoard(), rack, { isFirstMove: true });
  const started = Date.now();
  const moves = allMovesValid(fullIndex, snap);
  const elapsed = Date.now() - started;
  assert.ok(moves.length > 50, `expected many opening moves, got ${moves.length}`);
  const decision = AI.decideTurn(snap, {
    engine: Engine,
    index: fullIndex,
    difficulty: 'hard',
    seed: 1,
  });
  assert.strictEqual(decision.type, 'play');
  assert.ok(decision.score >= 10);
  assert.ok(elapsed < 15000, `opening search took too long: ${elapsed}ms`);
});

console.log(`\n${passed} tests passed`);
