/**
 * Letterloom game engine — crossword tile word game rules.
 * Attach to window for plain script tag usage.
 */
(function (global) {
  'use strict';

  const BOARD_SIZE = 15;
  const CENTER_ROW = 7;
  const CENTER_COL = 7;
  const RACK_SIZE = 7;
  const BINGO_BONUS = 50;
  const MIN_BAG_FOR_EXCHANGE = 7;

  /** @type {Record<string, { count: number, points: number }>} */
  const ENGLISH_TILES = {
    A: { count: 9, points: 1 },
    B: { count: 2, points: 3 },
    C: { count: 2, points: 3 },
    D: { count: 4, points: 2 },
    E: { count: 12, points: 1 },
    F: { count: 2, points: 4 },
    G: { count: 3, points: 2 },
    H: { count: 2, points: 4 },
    I: { count: 9, points: 1 },
    J: { count: 1, points: 8 },
    K: { count: 1, points: 5 },
    L: { count: 4, points: 1 },
    M: { count: 2, points: 3 },
    N: { count: 6, points: 1 },
    O: { count: 8, points: 1 },
    P: { count: 2, points: 3 },
    Q: { count: 1, points: 10 },
    R: { count: 6, points: 1 },
    S: { count: 4, points: 1 },
    T: { count: 6, points: 1 },
    U: { count: 4, points: 1 },
    V: { count: 2, points: 4 },
    W: { count: 2, points: 4 },
    X: { count: 1, points: 8 },
    Y: { count: 2, points: 4 },
    Z: { count: 1, points: 10 },
    ' ': { count: 2, points: 0 },
  };

  /**
   * Spanish house bag: Ñ is a letter; CH/LL/RR are two tiles.
   * Extra C/L/R replace the old digraph tiles so the bag stays at 100.
   * No K or W.
   */
  const SPANISH_TILES = {
    A: { count: 12, points: 1 },
    B: { count: 2, points: 3 },
    C: { count: 5, points: 3 },
    D: { count: 5, points: 2 },
    E: { count: 12, points: 1 },
    F: { count: 1, points: 4 },
    G: { count: 2, points: 2 },
    H: { count: 2, points: 4 },
    I: { count: 6, points: 1 },
    J: { count: 1, points: 8 },
    L: { count: 5, points: 1 },
    M: { count: 2, points: 3 },
    N: { count: 5, points: 1 },
    Ñ: { count: 1, points: 8 },
    O: { count: 9, points: 1 },
    P: { count: 2, points: 3 },
    Q: { count: 1, points: 5 },
    R: { count: 6, points: 1 },
    S: { count: 6, points: 1 },
    T: { count: 4, points: 1 },
    U: { count: 5, points: 1 },
    V: { count: 1, points: 4 },
    X: { count: 1, points: 8 },
    Y: { count: 1, points: 4 },
    Z: { count: 1, points: 10 },
    ' ': { count: 2, points: 0 },
  };

  function alphabetFromTiles(tiles) {
    return Object.keys(tiles)
      .filter((letter) => letter !== ' ')
      .sort((a, b) => letterSortKey(a) - letterSortKey(b));
  }

  function letterSortKey(letter) {
    if (letter === 'Ñ') return 'N'.charCodeAt(0) + 0.5;
    return String(letter).charCodeAt(0);
  }

  const LANGUAGE_PACKS = {
    en: { tiles: ENGLISH_TILES, alphabet: alphabetFromTiles(ENGLISH_TILES) },
    es: { tiles: SPANISH_TILES, alphabet: alphabetFromTiles(SPANISH_TILES) },
  };

  const TILE_DISTRIBUTION = ENGLISH_TILES;

  function normalizeLanguage(value) {
    return String(value || '').toLowerCase() === 'es' ? 'es' : 'en';
  }

  function getLanguagePack(language) {
    return LANGUAGE_PACKS[normalizeLanguage(language)];
  }

  function getAlphabet(language) {
    return getLanguagePack(language).alphabet;
  }

  function getTileDistribution(language) {
    return getLanguagePack(language).tiles;
  }

  function isPlayableLetter(letter, language) {
    const tiles = getTileDistribution(language);
    return Boolean(letter) && letter !== ' ' && Object.prototype.hasOwnProperty.call(tiles, letter);
  }

  /**
   * Premium square layout. '.' = none, TW/DW/TL/DL as labeled.
   * Center [7,7] is the opening double-word square (star).
   */
  const PREMIUM_LAYOUT = [
    ['TW', '.', '.', 'DL', '.', '.', '.', 'TW', '.', '.', '.', 'DL', '.', '.', 'TW'],
    ['.', 'DW', '.', '.', '.', 'DL', '.', '.', '.', 'DL', '.', '.', '.', 'DW', '.'],
    ['.', '.', 'DW', '.', '.', '.', '.', 'DL', '.', '.', '.', '.', 'DW', '.', '.'],
    ['DL', '.', '.', 'DL', '.', '.', '.', '.', '.', '.', '.', 'DL', '.', '.', 'DL'],
    ['.', '.', '.', '.', 'DW', '.', '.', '.', '.', '.', 'DW', '.', '.', '.', '.'],
    ['.', '.', '.', '.', '.', 'DW', '.', '.', '.', 'DW', '.', '.', '.', '.', '.'],
    ['.', 'DL', '.', '.', '.', '.', 'TL', '.', 'TL', '.', '.', '.', 'DL', '.', '.'],
    ['TW', '.', '.', 'DL', '.', '.', '.', 'DW', '.', '.', '.', 'DL', '.', '.', 'TW'],
    ['.', 'DL', '.', '.', '.', '.', 'TL', '.', 'TL', '.', '.', '.', 'DL', '.', '.'],
    ['.', '.', '.', '.', '.', 'DW', '.', '.', '.', 'DW', '.', '.', '.', '.', '.'],
    ['.', '.', '.', '.', 'DW', '.', '.', '.', '.', '.', 'DW', '.', '.', '.', '.'],
    ['DL', '.', '.', 'DL', '.', '.', '.', '.', '.', '.', '.', 'DL', '.', '.', 'DL'],
    ['.', '.', 'DW', '.', '.', '.', '.', 'DL', '.', '.', '.', '.', 'DW', '.', '.'],
    ['.', 'DW', '.', '.', '.', 'DL', '.', '.', '.', 'DL', '.', '.', '.', 'DW', '.'],
    ['TW', '.', '.', 'DL', '.', '.', '.', 'TW', '.', '.', '.', 'DL', '.', '.', 'TW'],
  ];

  let nextTileId = 1;

  function createEmptyBoard() {
    return Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => null)
    );
  }

  function isInBounds(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  function getPremiumAt(row, col) {
    if (!isInBounds(row, col)) return null;
    const premium = PREMIUM_LAYOUT[row][col];
    return premium === '.' ? null : premium;
  }

  function shuffleInPlace(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }

  function createTileBag(language) {
    const bag = [];
    const distribution = getTileDistribution(language);
    for (const [letter, info] of Object.entries(distribution)) {
      for (let i = 0; i < info.count; i += 1) {
        bag.push({
          id: nextTileId++,
          letter,
          points: info.points,
          isBlank: letter === ' ',
        });
      }
    }
    return shuffleInPlace(bag);
  }

  function drawTilesFromBag(bag, count) {
    const drawn = [];
    const n = Math.min(count, bag.length);
    for (let i = 0; i < n; i += 1) {
      drawn.push(bag.pop());
    }
    return drawn;
  }

  function refillRack(player, bag) {
    const needed = RACK_SIZE - player.rack.length;
    if (needed <= 0) return;
    const drawn = drawTilesFromBag(bag, needed);
    player.rack.push(...drawn);
  }

  /**
   * Blank precedes A; otherwise closest letter to A wins.
   * Lower sort value = closer to start of alphabet.
   */
  function openingTileRank(tile, language) {
    if (tile.isBlank) return -1;
    const index = getAlphabet(language).indexOf(tile.letter);
    return index === -1 ? 999 : index;
  }

  function determineFirstPlayer(players, bag, language) {
    while (true) {
      const drawn = players.map((player) => {
        const tiles = drawTilesFromBag(bag, 1);
        return { player, tile: tiles[0] || null };
      });

      if (drawn.some((entry) => !entry.tile)) {
        return 0;
      }

      let bestIndex = 0;
      let bestRank = openingTileRank(drawn[0].tile, language);

      for (let i = 1; i < drawn.length; i += 1) {
        const rank = openingTileRank(drawn[i].tile, language);
        if (rank < bestRank) {
          bestRank = rank;
          bestIndex = i;
        }
      }

      const winners = drawn.filter((entry) => openingTileRank(entry.tile, language) === bestRank);
      if (winners.length === 1) {
        for (const entry of drawn) {
          bag.push(entry.tile);
        }
        shuffleInPlace(bag);
        return bestIndex;
      }

      for (const entry of drawn) {
        bag.push(entry.tile);
      }
      shuffleInPlace(bag);
    }
  }

  function getPlayer(game) {
    return game.players[game.currentPlayerIndex];
  }

  function snapshotRack(player) {
    return (player && player.rack ? player.rack : []).map((tile) => ({
      letter: tile.letter,
      points: tile.points,
      isBlank: Boolean(tile.isBlank),
    }));
  }

  function ensureHistory(game) {
    if (!game) return [];
    if (!Array.isArray(game.history)) game.history = [];
    return game.history;
  }

  function formatHistoryLetters(tiles) {
    return (tiles || []).map((tile) => (tile.isBlank ? '?' : tile.letter || '?')).join(', ');
  }

  function recordTakeBack(game, undoneEntries, playerIndex) {
    if (!game) return null;
    const history = ensureHistory(game);
    const marked = (undoneEntries || []).map((entry) => Object.assign({}, entry, { takenBack: true }));
    history.push(...marked);
    const seat =
      Number.isInteger(playerIndex) && playerIndex >= 0 && playerIndex < game.players.length
        ? playerIndex
        : game.currentPlayerIndex;
    const entry = {
      type: 'takeback',
      turnNumber: game.turnNumber,
      playerIndex: seat,
      playerName: game.players[seat] ? game.players[seat].name : '',
      undoneCount: marked.length,
    };
    history.push(entry);
    game.lastMove = {
      playerIndex: seat,
      takeback: true,
      undoneCount: marked.length,
    };
    return entry;
  }

  function recordCoachNote(game, note) {
    if (!game || !note) return null;
    const history = ensureHistory(game);
    const entry = {
      type: 'coach',
      turnNumber: note.turnNumber != null ? note.turnNumber : game.turnNumber,
      playerIndex: note.playerIndex != null ? note.playerIndex : game.currentPlayerIndex,
      action: note.action || 'play',
      words: note.words || [],
      score: note.score != null ? note.score : null,
      exchangeLetters: note.exchangeLetters || '',
    };
    history.push(entry);
    return entry;
  }

  function findRackTile(player, tileId) {
    return player.rack.find((tile) => tile.id === tileId) || null;
  }

  function removeRackTiles(player, tileIds) {
    const idSet = new Set(tileIds);
    player.rack = player.rack.filter((tile) => !idSet.has(tile.id));
  }

  function boardIsEmpty(board) {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (board[row][col]) return false;
      }
    }
    return true;
  }

  function normalizeDirection(direction) {
    const value = String(direction || '').toLowerCase();
    if (value === 'horizontal' || value === 'h' || value === 'across') return 'horizontal';
    if (value === 'vertical' || value === 'v' || value === 'down') return 'vertical';
    return null;
  }

  function comparePlacement(a, b, direction) {
    if (direction === 'horizontal') {
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    }
    if (a.col !== b.col) return a.col - b.col;
    return a.row - b.row;
  }

  function getBoardLetter(board, row, col) {
    const cell = board[row][col];
    return cell ? cell.letter : null;
  }

  function placementKey(row, col) {
    return `${row},${col}`;
  }

  function resolvePlacementTiles(game, placements) {
    const player = getPlayer(game);
    const resolved = [];
    const seenCells = new Set();
    const seenTileIds = new Set();

    for (const placement of placements) {
      const row = placement.row;
      const col = placement.col;
      const tileId = placement.tileId;

      if (!isInBounds(row, col)) {
        return { ok: false, error: 'Placement out of bounds.' };
      }

      const key = placementKey(row, col);
      if (seenCells.has(key)) {
        return { ok: false, error: 'Duplicate placement on the same square.' };
      }
      seenCells.add(key);

      if (game.board[row][col]) {
        return { ok: false, error: 'Square is already occupied.' };
      }

      if (seenTileIds.has(tileId)) {
        return { ok: false, error: 'Duplicate tile used in placement.' };
      }
      seenTileIds.add(tileId);

      const rackTile = findRackTile(player, tileId);
      if (!rackTile) {
        return { ok: false, error: `Tile id ${tileId} is not on the current player's rack.` };
      }

      let letter = rackTile.letter;
      if (rackTile.isBlank) {
        const assigned = (placement.letter || '').toUpperCase();
        if (!assigned || assigned.length !== 1 || !isPlayableLetter(assigned, game.language)) {
          return { ok: false, error: 'Blank tiles must be assigned a letter from the alphabet.' };
        }
        letter = assigned;
      } else if (placement.letter && placement.letter.toUpperCase() !== rackTile.letter) {
        return { ok: false, error: 'Cannot change the letter on a non-blank tile.' };
      }

      resolved.push({
        row,
        col,
        tileId: rackTile.id,
        letter,
        points: rackTile.points,
        isBlank: rackTile.isBlank,
      });
    }

    return { ok: true, placements: resolved };
  }

  function validatePlacementAlignment(resolved, direction) {
    if (resolved.length === 0) {
      return { ok: false, error: 'At least one tile must be placed.' };
    }

    const rows = new Set(resolved.map((p) => p.row));
    const cols = new Set(resolved.map((p) => p.col));

    if (direction === 'horizontal') {
      if (rows.size !== 1) {
        return { ok: false, error: 'Horizontal placements must share the same row.' };
      }
    } else if (cols.size !== 1) {
      return { ok: false, error: 'Vertical placements must share the same column.' };
    }

    const sorted = [...resolved].sort((a, b) => comparePlacement(a, b, direction));
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const gap =
        direction === 'horizontal' ? curr.col - prev.col : curr.row - prev.row;
      if (gap <= 0) {
        return { ok: false, error: 'Placements must not overlap.' };
      }
    }

    return { ok: true, sorted };
  }

  function buildHypotheticalBoard(game, resolvedPlacements) {
    const board = game.board.map((row) => row.slice());
    const placementMap = new Map(
      resolvedPlacements.map((p) => [placementKey(p.row, p.col), p])
    );

    for (const placement of resolvedPlacements) {
      board[placement.row][placement.col] = {
        letter: placement.letter,
        points: placement.points,
        isBlank: placement.isBlank,
        tileId: placement.tileId,
      };
    }

    return { board, placementMap };
  }

  function collectLine(board, row, col, direction) {
    const cells = [];

    if (direction === 'horizontal') {
      let c = col;
      while (c > 0 && board[row][c - 1]) c -= 1;
      while (c < BOARD_SIZE && board[row][c]) {
        cells.push({ row, col: c });
        c += 1;
      }
    } else {
      let r = row;
      while (r > 0 && board[r - 1][col]) r -= 1;
      while (r < BOARD_SIZE && board[r][col]) {
        cells.push({ row: r, col });
        r += 1;
      }
    }

    const letters = cells.map((cell) => board[cell.row][cell.col].letter);
    return {
      word: letters.join(''),
      cells,
      direction,
    };
  }

  function validateConnectivity(game, resolved, direction) {
    const { board, placementMap } = buildHypotheticalBoard(game, resolved);
    const sortedResolved = [...resolved].sort((a, b) => comparePlacement(a, b, direction));

    for (let i = 1; i < sortedResolved.length; i += 1) {
      const prev = sortedResolved[i - 1];
      const curr = sortedResolved[i];
      const gap =
        direction === 'horizontal' ? curr.col - prev.col : curr.row - prev.row;

      for (let step = 1; step < gap; step += 1) {
        const row = direction === 'horizontal' ? prev.row : prev.row + step;
        const col = direction === 'horizontal' ? prev.col + step : prev.col;
        if (!board[row][col]) {
          return { ok: false, error: 'Placements must form a contiguous word without gaps.' };
        }
      }
    }

    const anchor = sortedResolved[0];
    const mainLine = collectLine(board, anchor.row, anchor.col, direction);

    if (boardIsEmpty(game.board)) {
      const coversCenter = resolved.some(
        (p) => p.row === CENTER_ROW && p.col === CENTER_COL
      );
      if (!coversCenter) {
        return { ok: false, error: 'The first word must cover the center square.' };
      }
    } else {
      const touchesExisting = resolved.some((p) => {
        const neighbors = [
          [p.row - 1, p.col],
          [p.row + 1, p.col],
          [p.row, p.col - 1],
          [p.row, p.col + 1],
        ];
        return neighbors.some(([r, c]) => isInBounds(r, c) && game.board[r][c]);
      });

      if (!touchesExisting) {
        return { ok: false, error: 'New tiles must connect to existing words.' };
      }
    }

    for (const placement of resolved) {
      const onMainLine = mainLine.cells.some(
        (cell) => cell.row === placement.row && cell.col === placement.col
      );
      if (!onMainLine) {
        return { ok: false, error: 'Placements must form a contiguous word without gaps.' };
      }
    }

    if (mainLine.word.length < 2) {
      return { ok: false, error: 'Words must be at least two letters long.' };
    }

    return { ok: true, board, placementMap, mainLine };
  }

  function extractWords(game, placements, direction) {
    const dir = normalizeDirection(direction);
    if (!dir) {
      return { ok: false, error: 'Direction must be horizontal or vertical.' };
    }

    const resolvedResult = resolvePlacementTiles(game, placements);
    if (!resolvedResult.ok) return resolvedResult;

    const alignment = validatePlacementAlignment(resolvedResult.placements, dir);
    if (!alignment.ok) return alignment;

    const connectivity = validateConnectivity(game, resolvedResult.placements, dir);
    if (!connectivity.ok) return connectivity;

    const { board, placementMap, mainLine: mainWord } = connectivity;
    const crossDirection = dir === 'horizontal' ? 'vertical' : 'horizontal';
    const newCellKeys = new Set(
      resolvedResult.placements.map((p) => placementKey(p.row, p.col))
    );

    const words = [
      {
        word: mainWord.word,
        cells: mainWord.cells,
        direction: dir,
        isMain: true,
      },
    ];

    for (const placement of resolvedResult.placements) {
      const cross = collectLine(board, placement.row, placement.col, crossDirection);
      if (cross.word.length >= 2) {
        const alreadyAdded = words.some(
          (entry) =>
            entry.direction === crossDirection &&
            entry.cells.length === cross.cells.length &&
            entry.cells[0].row === cross.cells[0].row &&
            entry.cells[0].col === cross.cells[0].col
        );
        if (!alreadyAdded) {
          words.push({
            word: cross.word,
            cells: cross.cells,
            direction: crossDirection,
            isMain: false,
          });
        }
      }
    }

    return {
      ok: true,
      words,
      placements: resolvedResult.placements,
      direction: dir,
      newCellKeys,
      board,
      placementMap,
    };
  }

  function isValidWord(game, word) {
    if (!word || word.length < 2) return false;
    if (!game.dictionary) return true;
    return game.dictionary.has(word.toUpperCase());
  }

  function validatePlacement(game, placements, direction) {
    if (!game || game.status === 'ended') {
      return { ok: false, error: 'Game is not active.' };
    }

    const extracted = extractWords(game, placements, direction);
    if (!extracted.ok) return extracted;

    const invalidWords = extracted.words
      .map((entry) => entry.word)
      .filter((word) => !isValidWord(game, word));

    if (invalidWords.length > 0) {
      return {
        ok: false,
        error: `Invalid word(s): ${invalidWords.join(', ')}`,
        words: extracted.words,
      };
    }

    return {
      ok: true,
      words: extracted.words,
      placements: extracted.placements,
      direction: extracted.direction,
      newCellKeys: extracted.newCellKeys,
      board: extracted.board,
      placementMap: extracted.placementMap,
    };
  }

  function scoreWord(wordEntry, newCellKeys) {
    let wordMultiplier = 1;
    let wordScore = 0;

    for (const cell of wordEntry.cells) {
      const key = placementKey(cell.row, cell.col);
      const isNew = newCellKeys.has(key);
      const boardCell = cell.boardCell;
      let letterScore = boardCell.isBlank ? 0 : boardCell.points;

      if (isNew) {
        const premium = getPremiumAt(cell.row, cell.col);
        if (premium === 'DL') letterScore *= 2;
        if (premium === 'TL') letterScore *= 3;
        if (premium === 'DW') wordMultiplier *= 2;
        if (premium === 'TW') wordMultiplier *= 3;
      }

      wordScore += letterScore;
    }

    return wordScore * wordMultiplier;
  }

  function scoreTurn(wordsFormed, newCells, placements) {
    const newCellKeys = new Set(
      (newCells || placements || []).map((item) => {
        if (item.row !== undefined) return placementKey(item.row, item.col);
        return null;
      }).filter(Boolean)
    );

    if (newCellKeys.size === 0 && placements) {
      for (const p of placements) {
        newCellKeys.add(placementKey(p.row, p.col));
      }
    }

    const words = wordsFormed || [];
    let total = 0;
    const breakdown = [];

    for (const wordEntry of words) {
      const cellsWithBoard = wordEntry.cells.map((cell) => ({
        row: cell.row,
        col: cell.col,
        boardCell: wordEntry.board
          ? wordEntry.board[cell.row][cell.col]
          : {
              letter: cell.letter,
              points: cell.points,
              isBlank: cell.isBlank,
            },
      }));

      const wordScore = scoreWord(
        {
          cells: cellsWithBoard,
          direction: wordEntry.direction,
        },
        newCellKeys
      );

      breakdown.push({ word: wordEntry.word, score: wordScore });
      total += wordScore;
    }

    const tilesPlayed = placements ? placements.length : newCellKeys.size;
    if (tilesPlayed === RACK_SIZE) {
      total += BINGO_BONUS;
      breakdown.push({ word: '(bingo bonus)', score: BINGO_BONUS });
    }

    return { total, breakdown };
  }

  function applyMove(game, placements, direction) {
    const validation = validatePlacement(game, placements, direction);
    if (!validation.ok) return validation;

    const player = getPlayer(game);
    const rackBefore = snapshotRack(player);
    const tileIds = validation.placements.map((p) => p.tileId);

    const hypothetical = buildHypotheticalBoard(game, validation.placements);
    const wordsForScoring = validation.words.map((wordEntry) => ({
      word: wordEntry.word,
      direction: wordEntry.direction,
      cells: wordEntry.cells,
      board: hypothetical.board,
    }));

    const newCells = validation.placements.map((p) => ({ row: p.row, col: p.col }));
    const score = scoreTurn(wordsForScoring, newCells, validation.placements);

    for (const placement of validation.placements) {
      game.board[placement.row][placement.col] = {
        letter: placement.letter,
        points: placement.points,
        isBlank: placement.isBlank,
        tileId: placement.tileId,
      };
    }

    removeRackTiles(player, tileIds);
    player.score += score.total;
    refillRack(player, game.bag);

    game.isFirstMove = false;
    game.consecutivePasses = 0;
    game.lastMove = {
      playerIndex: game.currentPlayerIndex,
      placements: validation.placements,
      words: validation.words.map((w) => w.word),
      score: score.total,
      breakdown: score.breakdown,
    };

    ensureHistory(game).push({
      type: 'play',
      turnNumber: game.turnNumber,
      playerIndex: game.currentPlayerIndex,
      playerName: player.name,
      rackBefore,
      words: validation.words.map((w) => w.word),
      score: score.total,
      breakdown: score.breakdown,
      scoreAfter: player.score,
      tilesPlayed: validation.placements.length,
    });

    const ended = checkGameEnd(game, { rackEmptied: player.rack.length === 0 });
    if (!ended.ended) {
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
      game.turnNumber += 1;
    }

    return {
      ok: true,
      score,
      words: validation.words,
      placements: validation.placements,
      game,
      endResult: ended,
    };
  }

  function exchangeTiles(game, tileIds) {
    if (!game || game.status === 'ended') {
      return { ok: false, error: 'Game is not active.' };
    }

    if (!Array.isArray(tileIds) || tileIds.length === 0) {
      return { ok: false, error: 'Select at least one tile to exchange.' };
    }

    if (game.bag.length < MIN_BAG_FOR_EXCHANGE) {
      return {
        ok: false,
        error: `Cannot exchange when fewer than ${MIN_BAG_FOR_EXCHANGE} tiles remain in the bag.`,
      };
    }

    const player = getPlayer(game);
    const rackBefore = snapshotRack(player);
    const uniqueIds = [...new Set(tileIds)];

    if (uniqueIds.length !== tileIds.length) {
      return { ok: false, error: 'Duplicate tile ids in exchange request.' };
    }

    const tilesToExchange = [];
    for (const tileId of uniqueIds) {
      const tile = findRackTile(player, tileId);
      if (!tile) {
        return { ok: false, error: `Tile id ${tileId} is not on the current player's rack.` };
      }
      tilesToExchange.push(tile);
    }

    removeRackTiles(player, uniqueIds);
    game.bag.push(...tilesToExchange);
    shuffleInPlace(game.bag);
    refillRack(player, game.bag);

    game.consecutivePasses = 0;
    game.lastMove = {
      playerIndex: game.currentPlayerIndex,
      exchange: uniqueIds.length,
    };

    ensureHistory(game).push({
      type: 'exchange',
      turnNumber: game.turnNumber,
      playerIndex: game.currentPlayerIndex,
      playerName: player.name,
      rackBefore,
      exchange: uniqueIds.length,
      exchangeLetters: formatHistoryLetters(tilesToExchange),
    });

    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    game.turnNumber += 1;

    return { ok: true, exchanged: uniqueIds.length, game };
  }

  function passTurn(game) {
    if (!game || game.status === 'ended') {
      return { ok: false, error: 'Game is not active.' };
    }

    const player = getPlayer(game);
    const rackBefore = snapshotRack(player);

    game.consecutivePasses += 1;
    game.lastMove = {
      playerIndex: game.currentPlayerIndex,
      pass: true,
    };

    ensureHistory(game).push({
      type: 'pass',
      turnNumber: game.turnNumber,
      playerIndex: game.currentPlayerIndex,
      playerName: player ? player.name : '',
      rackBefore,
    });

    const ended = checkGameEnd(game);
    if (!ended.ended) {
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
      game.turnNumber += 1;
    }

    return { ok: true, game, endResult: ended };
  }

  function finalizeEndGameScoring(game, outgoingPlayerIndex) {
    if (game.endScoringApplied) return;

    const outgoing = game.players[outgoingPlayerIndex];
    let unplayedTotal = 0;

    for (let i = 0; i < game.players.length; i += 1) {
      if (i === outgoingPlayerIndex) continue;
      const rackValue = game.players[i].rack.reduce((sum, tile) => sum + (tile.isBlank ? 0 : tile.points), 0);
      game.players[i].score -= rackValue;
      unplayedTotal += rackValue;
    }

    outgoing.score += unplayedTotal;
    game.endScoringApplied = true;
  }

  function checkGameEnd(game, options = {}) {
    if (game.status === 'ended') {
      return { ended: true, reason: game.endReason, game };
    }

    const { rackEmptied = false } = options;
    const bagEmpty = game.bag.length === 0;
    const allPassed = game.consecutivePasses >= game.players.length;

    if (rackEmptied && bagEmpty) {
      finalizeEndGameScoring(game, game.currentPlayerIndex);
      game.status = 'ended';
      game.endReason = 'last_tile_played';
      return { ended: true, reason: game.endReason, game };
    }

    if (allPassed) {
      if (!game.endScoringApplied) {
        for (const player of game.players) {
          const rackValue = player.rack.reduce(
            (sum, tile) => sum + (tile.isBlank ? 0 : tile.points),
            0
          );
          player.score -= rackValue;
        }
        game.endScoringApplied = true;
      }
      game.status = 'ended';
      game.endReason = 'all_passed';
      return { ended: true, reason: game.endReason, game };
    }

    return { ended: false, game };
  }

  function getRemainingBagCount(game) {
    return game && game.bag ? game.bag.length : 0;
  }

  function emptyLetterCounts(language) {
    const counts = {};
    for (const letter of Object.keys(getTileDistribution(language))) {
      counts[letter] = 0;
    }
    return counts;
  }

  function tileLetterKey(tile, language) {
    if (!tile) return null;
    if (tile.isBlank) return ' ';
    const letter = String(tile.letter || '').toUpperCase();
    return isPlayableLetter(letter, language) ? letter : null;
  }

  function addTileToCounts(counts, tile, language) {
    const key = tileLetterKey(tile, language);
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  }

  function collectBoardTiles(board) {
    const tiles = [];
    if (!board) return tiles;
    for (let row = 0; row < board.length; row += 1) {
      const line = board[row] || [];
      for (let col = 0; col < line.length; col += 1) {
        if (line[col]) tiles.push(line[col]);
      }
    }
    return tiles;
  }

  function subtractLetterCounts(base, used, language) {
    const next = emptyLetterCounts(language);
    for (const letter of Object.keys(getTileDistribution(language))) {
      next[letter] = Math.max(0, (base[letter] || 0) - (used[letter] || 0));
    }
    return next;
  }

  function sumLetterCounts(counts, language) {
    let total = 0;
    for (const letter of Object.keys(getTileDistribution(language))) {
      total += counts[letter] || 0;
    }
    return total;
  }

  /**
   * Letters still unseen by a viewer: the full set minus the board and that
   * player's rack (bag + opponents). After the game ends, racks are public,
   * so the leftover grid is everything not on the board.
   * @param {object} game
   * @param {{ viewerIndex?: number, revealRacks?: boolean }} [options]
   */
  function getUnseenTiles(game, options = {}) {
    const language = game && game.language;
    const pack = getTileDistribution(language);
    const distribution = emptyLetterCounts(language);
    for (const [letter, info] of Object.entries(pack)) {
      distribution[letter] = info.count;
    }

    const seen = emptyLetterCounts(language);
    for (const tile of collectBoardTiles(game && game.board)) {
      addTileToCounts(seen, tile, language);
    }

    const ended = Boolean(game && game.status === 'ended');
    const revealRacks = options.revealRacks != null ? Boolean(options.revealRacks) : ended;
    const viewerIndex = Number.isInteger(options.viewerIndex)
      ? options.viewerIndex
      : game && Number.isInteger(game.currentPlayerIndex)
        ? game.currentPlayerIndex
        : 0;

    if (!revealRacks && game && game.players && game.players[viewerIndex]) {
      for (const tile of game.players[viewerIndex].rack || []) {
        addTileToCounts(seen, tile, language);
      }
    }

    const counts = subtractLetterCounts(distribution, seen, language);
    const letters = getAlphabet(language).map((letter) => ({
      letter,
      count: counts[letter] || 0,
      points: pack[letter].points,
    }));

    const bagCount = getRemainingBagCount(game);
    const total = sumLetterCounts(counts, language);

    return {
      counts,
      letters,
      blanks: counts[' '] || 0,
      total,
      bagCount,
      opponentCount: Math.max(0, total - bagCount),
      revealed: revealRacks,
      viewerIndex,
    };
  }

  function isCountableHistory(entry) {
    return Boolean(entry) && !entry.takenBack && entry.type !== 'takeback' && entry.type !== 'coach';
  }

  function pickBetterPlay(current, entry) {
    if (!entry || entry.type !== 'play') return current;
    if (!current || (entry.score || 0) > (current.score || 0)) return entry;
    return current;
  }

  /**
   * Local per-game stats derived from the existing turn history.
   * @param {object} game
   */
  function summarizeHistory(game) {
    const players = (game && game.players ? game.players : []).map((player, index) => ({
      index,
      name: player.name,
      score: player.score,
      plays: 0,
      points: 0,
      bingos: 0,
      exchanges: 0,
      tilesExchanged: 0,
      passes: 0,
      bestPlay: null,
    }));

    const history = game && Array.isArray(game.history) ? game.history : [];
    let bestPlay = null;
    let plays = 0;
    let bingos = 0;
    let exchanges = 0;
    let passes = 0;

    for (const entry of history) {
      if (!isCountableHistory(entry)) continue;
      const seat = players[entry.playerIndex];
      if (entry.type === 'play') {
        plays += 1;
        if (seat) {
          seat.plays += 1;
          seat.points += entry.score || 0;
          if (entry.tilesPlayed === RACK_SIZE) {
            seat.bingos += 1;
            bingos += 1;
          }
          seat.bestPlay = pickBetterPlay(seat.bestPlay, entry);
        } else if (entry.tilesPlayed === RACK_SIZE) {
          bingos += 1;
        }
        bestPlay = pickBetterPlay(bestPlay, entry);
      } else if (entry.type === 'exchange') {
        exchanges += 1;
        if (seat) {
          seat.exchanges += 1;
          seat.tilesExchanged += entry.exchange || 0;
        }
      } else if (entry.type === 'pass') {
        passes += 1;
        if (seat) seat.passes += 1;
      }
    }

    const sorted = [...players].sort((a, b) => b.score - a.score);
    const winner = sorted[0] || null;
    const isTie = Boolean(winner && sorted[1] && sorted[0].score === sorted[1].score);

    return {
      players,
      plays,
      bingos,
      exchanges,
      passes,
      bestPlay,
      winnerIndex: winner && !isTie ? winner.index : null,
      winnerName: winner && !isTie ? winner.name : null,
      isTie,
      endReason: game && game.endReason ? game.endReason : null,
      status: game && game.status ? game.status : null,
      mode: game && game.mode ? game.mode : 'human',
      computerSeat: game && Number.isInteger(game.computerSeat) ? game.computerSeat : null,
      computerDifficulty: game && game.computerDifficulty ? game.computerDifficulty : null,
    };
  }

  function historyFingerprint(game) {
    if (!game) return '';
    const names = (game.players || []).map((player) => `${player.name}:${player.score}`).join('/');
    const history = (game.history || [])
      .map((entry) => {
        const words = (entry.words || []).join(',');
        return `${entry.type}:${entry.turnNumber}:${entry.playerIndex}:${entry.score || 0}:${entry.exchange || 0}:${words}:${entry.takenBack ? 1 : 0}`;
      })
      .join('|');
    return `${names}#${game.endReason || ''}#${history}`;
  }

  function normalizeDifficulty(value) {
    const v = String(value || '').toLowerCase();
    if (v === 'easy' || v === 'medium' || v === 'hard') return v;
    return 'medium';
  }

  function normalizeComputerSeat(seat, playerCount) {
    const n = Number(seat);
    if (Number.isInteger(n) && n >= 0 && n < playerCount) return n;
    return Math.max(0, playerCount - 1);
  }

  function normalizeGameMeta(game) {
    if (!game) return game;
    game.language = normalizeLanguage(game.language);
    if (!Array.isArray(game.history)) game.history = [];
    if (game.openingPlayerIndex != null && !Number.isInteger(game.openingPlayerIndex)) {
      game.openingPlayerIndex = null;
    }
    if (game.mode === 'computer') {
      game.computerSeat = normalizeComputerSeat(game.computerSeat, game.players.length);
      game.computerDifficulty = normalizeDifficulty(game.computerDifficulty);
      if (game.computerSeed == null) game.computerSeed = Date.now();
      game.coachMode = Boolean(game.coachMode);
    } else {
      game.mode = 'human';
      if (game.computerSeat === undefined) game.computerSeat = null;
      if (game.computerDifficulty === undefined) game.computerDifficulty = null;
      if (game.computerSeed === undefined) game.computerSeed = null;
      game.coachMode = false;
    }
    return game;
  }

  function isComputerTurn(game) {
    return Boolean(
      game &&
        game.mode === 'computer' &&
        game.status === 'playing' &&
        game.computerSeat === game.currentPlayerIndex
    );
  }

  function createGame(playerNames, options = {}) {
    if (!Array.isArray(playerNames) || playerNames.length < 2 || playerNames.length > 4) {
      throw new Error('Letterloom requires 2 to 4 players.');
    }

    nextTileId = 1;
    const language = normalizeLanguage(options.language);
    const bag = createTileBag(language);
    const players = playerNames.map((name) => ({
      name: String(name),
      rack: [],
      score: 0,
    }));

    for (const player of players) {
      player.rack = drawTilesFromBag(bag, RACK_SIZE);
    }

    const requestedFirst = Number(options.firstPlayerIndex);
    const firstPlayerIndex =
      Number.isInteger(requestedFirst) && requestedFirst >= 0 && requestedFirst < players.length
        ? requestedFirst
        : determineFirstPlayer(players, bag, language);

    for (const player of players) {
      refillRack(player, bag);
    }

    const game = {
      board: createEmptyBoard(),
      players,
      bag,
      currentPlayerIndex: firstPlayerIndex,
      openingPlayerIndex: firstPlayerIndex,
      turnNumber: 1,
      status: 'playing',
      endReason: null,
      endScoringApplied: false,
      consecutivePasses: 0,
      isFirstMove: true,
      language,
      dictionary: options.dictionary || null,
      lastMove: null,
      history: [],
      mode: options.mode === 'computer' ? 'computer' : 'human',
      computerSeat: null,
      computerDifficulty: null,
      computerSeed: null,
      coachMode: false,
    };

    if (game.mode === 'computer') {
      game.computerSeat = normalizeComputerSeat(options.computerSeat, players.length);
      game.computerDifficulty = normalizeDifficulty(options.computerDifficulty);
      game.computerSeed = options.computerSeed != null ? Number(options.computerSeed) : Date.now();
      game.coachMode = Boolean(options.coachMode);
    }

    return game;
  }

  const LetterloomEngine = {
    BOARD_SIZE,
    CENTER_ROW,
    CENTER_COL,
    RACK_SIZE,
    BINGO_BONUS,
    MIN_BAG_FOR_EXCHANGE,
    TILE_DISTRIBUTION,
    LANGUAGE_PACKS,
    PREMIUM_LAYOUT,
    normalizeLanguage,
    getAlphabet,
    getTileDistribution,
    isPlayableLetter,

    createGame,
    validatePlacement,
    extractWords,
    scoreTurn,
    applyMove,
    exchangeTiles,
    passTurn,
    checkGameEnd,
    getRemainingBagCount,
    getUnseenTiles,
    summarizeHistory,
    historyFingerprint,
    normalizeDifficulty,
    normalizeComputerSeat,
    normalizeGameMeta,
    isComputerTurn,
    snapshotRack,
    recordTakeBack,
    recordCoachNote,

    // Useful helpers for UI / tests
    getPremiumAt,
    createTileBag,
    shuffleInPlace,
    drawTilesFromBag,
    isValidWord,
  };

  global.LetterloomEngine = LetterloomEngine;
})(typeof window !== 'undefined' ? window : globalThis);