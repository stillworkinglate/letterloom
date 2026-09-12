/**
 * Letterloom computer opponent — legal-move search and difficulty selection.
 * Reuses LetterloomEngine for validation and scoring. No opponent-rack or bag-order access.
 */
(function (global) {
  'use strict';

  const SIZE = 15;
  const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

  /**
   * Static leave weights for leftover rack tiles after a play.
   * S and blanks are kept; Q/J/Z/X and clunky duplicates are dumped.
   * This is a heuristic, not a learned equity table.
   */
  const LEAVE_WEIGHT = {
    A: 1,
    B: -2,
    C: 0.5,
    D: 0,
    E: 1.2,
    F: -2,
    G: -1.5,
    H: -1,
    I: 0.8,
    J: -4,
    K: -2,
    L: 0.5,
    M: -0.5,
    N: 0.5,
    O: 0.8,
    P: -0.5,
    Q: -6,
    R: 0.8,
    S: 8,
    T: 0.5,
    U: -0.5,
    V: -3.5,
    W: -3,
    X: -3.5,
    Y: -2,
    Z: -4,
  };

  const LEAVE_WEIGHT_ES = {
    A: 1.2,
    B: -2,
    C: 0.5,
    D: 0,
    E: 1.2,
    F: -3,
    G: -1.5,
    H: -2,
    I: 0.8,
    J: -4,
    L: 0.8,
    M: -0.5,
    N: 0.5,
    Ñ: -2,
    O: 1,
    P: -0.5,
    Q: -5,
    R: 0.8,
    S: 7,
    T: 0.5,
    U: 0,
    V: -4,
    X: -4,
    Y: -2,
    Z: -4,
  };

  function defaultAlphabet() {
    const letters = [];
    for (let i = 0; i < 26; i += 1) {
      letters.push(String.fromCharCode(65 + i));
    }
    return letters;
  }

  function alphabetFor(engine, language) {
    if (engine && typeof engine.getAlphabet === 'function') {
      return engine.getAlphabet(language);
    }
    return defaultAlphabet();
  }

  function leaveWeightsFor(language) {
    return String(language || '').toLowerCase() === 'es' ? LEAVE_WEIGHT_ES : LEAVE_WEIGHT;
  }

  const HARD_LEAVE_WEIGHT = 0.85;
  const MEDIUM_LEAVE_WEIGHT = 0.35;

  const HARD_HEURISTIC_DOCS =
    'Hard picks the legal move with the highest score + 0.85 × leaveValue. ' +
    'leaveValue is a static estimate (S and blanks rewarded; Q/J/Z/X, duplicates, and ' +
    'one-sided vowel/consonant remains penalized). It does not search future draws, ' +
    'opponent replies, or endgame tables, and is not an optimal strategy.';

  function inBounds(row, col) {
    return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
  }

  function boardIsEmpty(board) {
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        if (board[row][col]) return false;
      }
    }
    return true;
  }

  function createRng(seed) {
    let state = seed >>> 0;
    if (state === 0) state = 0x9e3779b9;
    return function next() {
      state += 0x6d2b79f5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mixSeed(base, turnNumber) {
    const turn = Number(turnNumber) || 1;
    return (Math.imul((Number(base) || 1) ^ Math.imul(turn, 0x9e3779b9), 0x85ebca6b) >>> 0);
  }

  function normalizeDifficulty(value) {
    const v = String(value || '').toLowerCase();
    if (v === 'easy' || v === 'medium' || v === 'hard') return v;
    return 'medium';
  }

  function buildIndex(words) {
    const wordSet = words instanceof Set ? words : new Set(words);
    const root = { c: Object.create(null), t: false };

    wordSet.forEach((raw) => {
      const word = String(raw).toUpperCase();
      if (word.length < 2 || word.length > SIZE) return;
      let node = root;
      for (let i = 0; i < word.length; i += 1) {
        const ch = word[i];
        if (!node.c[ch]) node.c[ch] = { c: Object.create(null), t: false };
        node = node.c[ch];
      }
      node.t = true;
    });

    return { words: wordSet, trie: root };
  }

  function lettersAlong(board, row, col, drow, dcol) {
    const letters = [];
    let r = row + drow;
    let c = col + dcol;
    while (inBounds(r, c) && board[r][c]) {
      letters.push(board[r][c].letter);
      r += drow;
      c += dcol;
    }
    return letters;
  }

  function computeCrossChecks(board, wordSet, playDirection, alphabet) {
    const vertical = playDirection === 'horizontal';
    const checks = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        if (board[row][col]) continue;

        const before = vertical
          ? lettersAlong(board, row, col, -1, 0).reverse()
          : lettersAlong(board, row, col, 0, -1).reverse();
        const after = vertical
          ? lettersAlong(board, row, col, 1, 0)
          : lettersAlong(board, row, col, 0, 1);

        if (before.length === 0 && after.length === 0) {
          checks[row][col] = null;
          continue;
        }

        const prefix = before.join('');
        const suffix = after.join('');
        const allowed = new Set();
        const letters = alphabet || defaultAlphabet();
        for (let i = 0; i < letters.length; i += 1) {
          const letter = letters[i];
          if (wordSet.has(prefix + letter + suffix)) allowed.add(letter);
        }
        checks[row][col] = allowed;
      }
    }

    return checks;
  }

  function lineCanConnect(board, isRow, index, emptyBoard) {
    if (emptyBoard) return index === 7;
    for (let i = 0; i < SIZE; i += 1) {
      const row = isRow ? index : i;
      const col = isRow ? i : index;
      if (board[row][col]) return true;
      if (isRow) {
        if ((row > 0 && board[row - 1][col]) || (row < SIZE - 1 && board[row + 1][col])) {
          return true;
        }
      } else if ((col > 0 && board[row][col - 1]) || (col < SIZE - 1 && board[row][col + 1])) {
        return true;
      }
    }
    return false;
  }

  function placementSignature(placements, direction) {
    return `${direction}:${placements
      .map((p) => `${p.row},${p.col},${p.letter},${p.isBlank ? 1 : 0}`)
      .sort()
      .join(';')}`;
  }

  function generateLinePlacements(board, isRow, index, rackTiles, trie, crossChecks, emit) {
    const lineLetters = [];
    for (let i = 0; i < SIZE; i += 1) {
      const row = isRow ? index : i;
      const col = isRow ? i : index;
      lineLetters.push(board[row][col] ? board[row][col].letter : null);
    }

    const direction = isRow ? 'horizontal' : 'vertical';

    function search(pos, node, placements, available) {
      const tryEnd = () => {
        if (placements.length === 0 || !node.t) return;
        emit(placements, direction);
      };

      if (pos >= SIZE) {
        tryEnd();
        return;
      }

      const existing = lineLetters[pos];
      if (existing) {
        const next = node.c[existing];
        if (!next) return;
        search(pos + 1, next, placements, available);
        return;
      }

      if (placements.length > 0) tryEnd();

      const row = isRow ? index : pos;
      const col = isRow ? pos : index;
      const allowed = crossChecks[row][col];

      for (let i = 0; i < available.length; i += 1) {
        const tile = available[i];
        const letters = tile.isBlank
          ? Object.keys(node.c)
          : node.c[tile.letter]
            ? [tile.letter]
            : [];

        for (let li = 0; li < letters.length; li += 1) {
          const letter = letters[li];
          if (allowed && !allowed.has(letter)) continue;
          const child = node.c[letter];
          if (!child) continue;

          const nextAvailable = available.slice();
          nextAvailable.splice(i, 1);
          const placement = {
            row,
            col,
            tileId: tile.id,
            letter,
            isBlank: Boolean(tile.isBlank),
          };
          placements.push(placement);
          search(pos + 1, child, placements, nextAvailable);
          placements.pop();
        }
      }
    }

    for (let start = 0; start < SIZE; start += 1) {
      if (start > 0 && lineLetters[start - 1]) continue;
      search(start, trie, [], rackTiles);
    }
  }

  function toEnginePlacements(placements) {
    return placements.map((p) => {
      const entry = { row: p.row, col: p.col, tileId: p.tileId };
      if (p.isBlank) entry.letter = p.letter;
      return entry;
    });
  }

  function leftoverRack(rack, placements) {
    const used = new Set(placements.map((p) => p.tileId));
    return rack.filter((tile) => !used.has(tile.id));
  }

  function evaluateLeave(tiles, language) {
    if (!tiles || tiles.length === 0) return 0;

    const leaveWeights = leaveWeightsFor(language);
    let value = 0;
    let vowels = 0;
    let consonants = 0;
    const counts = Object.create(null);
    let hasQ = false;
    let hasU = false;
    let blanks = 0;

    for (const tile of tiles) {
      if (tile.isBlank) {
        blanks += 1;
        value += 15;
        continue;
      }
      const letter = tile.letter;
      value += leaveWeights[letter] != null ? leaveWeights[letter] : 0;
      counts[letter] = (counts[letter] || 0) + 1;
      if (VOWELS.has(letter)) vowels += 1;
      else consonants += 1;
      if (letter === 'Q') hasQ = true;
      if (letter === 'U') hasU = true;
    }

    value += blanks * 0;
    Object.keys(counts).forEach((letter) => {
      if (counts[letter] >= 2) value -= 2.5 * (counts[letter] - 1);
    });

    const leftover = tiles.length;
    if (leftover >= 2) {
      if (vowels === 0 || consonants === 0) value -= 4;
      else if (vowels >= leftover - 1 && leftover >= 3) value -= 3;
      else if (consonants >= leftover - 1 && leftover >= 3) value -= 2;
    }
    if (hasQ && !hasU) value -= 4;

    return value;
  }

  function createSearchGame(snapshot, wordSet) {
    return {
      board: snapshot.board,
      players: [{ name: 'Computer', rack: snapshot.rack.slice(), score: 0 }],
      currentPlayerIndex: 0,
      status: snapshot.status || 'playing',
      dictionary: wordSet,
      language: snapshot.language || 'en',
      isFirstMove: snapshot.isFirstMove,
      bag: [],
      consecutivePasses: 0,
      turnNumber: snapshot.turnNumber || 1,
    };
  }

  function generateMoves(engine, index, snapshot) {
    if (!engine || !index || !snapshot || !snapshot.board || !snapshot.rack) {
      return [];
    }

    const board = snapshot.board;
    const rack = snapshot.rack;
    const emptyBoard = snapshot.isFirstMove !== undefined ? snapshot.isFirstMove : boardIsEmpty(board);
    const candidates = [];
    const seen = new Set();

    const emit = (placements, direction) => {
      if (!placements.length) return;
      const signature = placementSignature(placements, direction);
      if (seen.has(signature)) return;
      seen.add(signature);
      candidates.push({
        placements: placements.map((p) => ({ ...p })),
        direction,
      });
    };

    const alphabet = alphabetFor(engine, snapshot.language);
    const horizontalCross = computeCrossChecks(board, index.words, 'horizontal', alphabet);
    const verticalCross = computeCrossChecks(board, index.words, 'vertical', alphabet);

    for (let i = 0; i < SIZE; i += 1) {
      if (lineCanConnect(board, true, i, emptyBoard)) {
        generateLinePlacements(board, true, i, rack, index.trie, horizontalCross, emit);
      }
      if (lineCanConnect(board, false, i, emptyBoard)) {
        generateLinePlacements(board, false, i, rack, index.trie, verticalCross, emit);
      }
    }

    const searchGame = createSearchGame(snapshot, index.words);
    const moves = [];

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      const enginePlacements = toEnginePlacements(candidate.placements);
      const validation = engine.validatePlacement(
        searchGame,
        enginePlacements,
        candidate.direction
      );
      if (!validation.ok) continue;

      const wordsForScoring = validation.words.map((wordEntry) => ({
        word: wordEntry.word,
        direction: wordEntry.direction,
        cells: wordEntry.cells,
        board: validation.board,
      }));
      const score = engine.scoreTurn(
        wordsForScoring,
        validation.placements.map((p) => ({ row: p.row, col: p.col })),
        validation.placements
      );
      const leaveTiles = leftoverRack(rack, validation.placements);
      const leave = evaluateLeave(leaveTiles, snapshot.language);

      moves.push({
        type: 'play',
        placements: enginePlacements,
        direction: validation.direction,
        score: score.total,
        breakdown: score.breakdown,
        words: validation.words.map((w) => w.word),
        leave,
        tilesPlayed: validation.placements.length,
      });
    }

    return moves;
  }

  function pickIndex(rng, count) {
    if (count <= 1) return 0;
    return Math.floor(rng() * count);
  }

  function compareMoves(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    if (b.tilesPlayed !== a.tilesPlayed) return b.tilesPlayed - a.tilesPlayed;
    const aw = (a.words || []).join(',');
    const bw = (b.words || []).join(',');
    if (aw < bw) return -1;
    if (aw > bw) return 1;
    return placementSignature(a.placements, a.direction).localeCompare(
      placementSignature(b.placements, b.direction)
    );
  }

  function choosePlay(moves, difficulty, rng) {
    const ranked = moves.slice().sort(compareMoves);
    if (ranked.length === 0) return null;

    if (difficulty === 'easy') {
      const scores = ranked.map((m) => m.score).sort((a, b) => a - b);
      const floor = scores[Math.floor((scores.length - 1) * 0.15)];
      const reasonable = ranked.filter((m) => m.score >= floor && m.words && m.words.length > 0);
      const pool = (reasonable.length > 0 ? reasonable : ranked).slice().sort((a, b) => a.score - b.score);
      const bandStart = Math.floor(pool.length * 0.1);
      const bandEnd = Math.max(bandStart + 1, Math.ceil(pool.length * 0.45));
      const band = pool.slice(bandStart, bandEnd);
      return band[pickIndex(rng, band.length)];
    }

    if (difficulty === 'medium') {
      ranked.sort((a, b) => {
        const ah = a.score + MEDIUM_LEAVE_WEIGHT * a.leave;
        const bh = b.score + MEDIUM_LEAVE_WEIGHT * b.leave;
        if (bh !== ah) return bh - ah;
        return compareMoves(a, b);
      });
      const top = ranked.slice(0, Math.min(5, ranked.length));
      const weights = top.map((m) => Math.max(0.5, m.score + MEDIUM_LEAVE_WEIGHT * m.leave));
      const total = weights.reduce((sum, w) => sum + w, 0);
      let dart = rng() * total;
      for (let i = 0; i < top.length; i += 1) {
        dart -= weights[i];
        if (dart <= 0) return top[i];
      }
      return top[0];
    }

    ranked.sort((a, b) => {
      const ah = a.score + HARD_LEAVE_WEIGHT * a.leave;
      const bh = b.score + HARD_LEAVE_WEIGHT * b.leave;
      if (bh !== ah) return bh - ah;
      return compareMoves(a, b);
    });
    return ranked[0];
  }

  function chooseExchange(rack, bagCount, engine, language) {
    const minBag = engine && engine.MIN_BAG_FOR_EXCHANGE != null ? engine.MIN_BAG_FOR_EXCHANGE : 7;
    if (!rack || rack.length === 0 || bagCount < minBag) return null;

    const n = rack.length;
    let bestIds = null;
    let bestLeave = -Infinity;
    let bestCount = Infinity;

    for (let mask = 1; mask < 1 << n; mask += 1) {
      const tileIds = [];
      const keep = [];
      for (let i = 0; i < n; i += 1) {
        if (mask & (1 << i)) tileIds.push(rack[i].id);
        else keep.push(rack[i]);
      }
      const leave = evaluateLeave(keep, language);
      if (leave > bestLeave || (leave === bestLeave && tileIds.length < bestCount)) {
        bestLeave = leave;
        bestCount = tileIds.length;
        bestIds = tileIds;
      }
    }

    return {
      type: 'exchange',
      tileIds: bestIds || rack.map((tile) => tile.id),
      leave: bestLeave,
    };
  }

  function heuristicFor(move, difficulty) {
    if (!move || move.type !== 'play') return 0;
    if (difficulty === 'easy') return move.score;
    if (difficulty === 'medium') return move.score + MEDIUM_LEAVE_WEIGHT * move.leave;
    return move.score + HARD_LEAVE_WEIGHT * move.leave;
  }

  function decideTurn(snapshot, options) {
    const engine = options.engine || global.LetterloomEngine;
    const index = options.index;
    if (!engine || !index) {
      throw new Error('LetterloomAI.decideTurn requires engine and dictionary index.');
    }
    if (!snapshot || snapshot.status === 'ended') {
      return { type: 'pass' };
    }

    const difficulty = normalizeDifficulty(options.difficulty);
    const rng = createRng(options.seed != null ? options.seed : Date.now());
    const moves = generateMoves(engine, index, snapshot);
    const play = choosePlay(moves, difficulty, rng);
    if (play) {
      return {
        type: 'play',
        placements: play.placements,
        direction: play.direction,
        score: play.score,
        breakdown: play.breakdown,
        words: play.words,
        leave: play.leave,
        heuristic: heuristicFor(play, difficulty),
        moveCount: moves.length,
      };
    }

    const exchange = chooseExchange(snapshot.rack, snapshot.bagCount, engine, snapshot.language);
    if (exchange) return { ...exchange, moveCount: 0 };
    return { type: 'pass', moveCount: 0 };
  }

  /**
   * Public information the computer is allowed to use.
   * Omits the opponent rack and the bag's tile order.
   */
  function publicSnapshot(game, computerSeat) {
    if (!game || !game.players) return null;
    const seat = computerSeat != null ? computerSeat : game.computerSeat;
    const computer = game.players[seat];
    if (!computer) return null;

    return {
      board: game.board,
      rack: computer.rack,
      bagCount: game.bag ? game.bag.length : 0,
      isFirstMove: boardIsEmpty(game.board),
      status: game.status,
      turnNumber: game.turnNumber,
      currentPlayerIndex: game.currentPlayerIndex,
      consecutivePasses: game.consecutivePasses,
      scores: game.players.map((player) => player.score),
      playerCount: game.players.length,
      language: game.language || 'en',
    };
  }

  function explainAction(action, playerName) {
    const name = playerName || 'Computer';
    if (!action) return `${name} did not move.`;
    if (action.type === 'play') {
      const words = (action.words || []).join(', ');
      return `${name} played ${words} for ${action.score} points.`;
    }
    if (action.type === 'exchange') {
      return `${name} exchanged ${(action.tileIds || []).length} tile(s).`;
    }
    return `${name} passed.`;
  }

  const LetterloomAI = {
    HARD_HEURISTIC_DOCS,
    HARD_LEAVE_WEIGHT,
    MEDIUM_LEAVE_WEIGHT,
    LEAVE_WEIGHT,
    LEAVE_WEIGHT_ES,
    buildIndex,
    createRng,
    mixSeed,
    normalizeDifficulty,
    evaluateLeave,
    generateMoves,
    choosePlay,
    chooseExchange,
    decideTurn,
    publicSnapshot,
    explainAction,
    boardIsEmpty,
  };

  global.LetterloomAI = LetterloomAI;
})(typeof window !== 'undefined' ? window : globalThis);
