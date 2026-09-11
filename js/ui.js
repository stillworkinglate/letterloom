/**
 * Letterloom UI — render layer and app controller.
 */
(function (global) {
  'use strict';

  const Engine = global.LetterloomEngine;
  const Storage = global.LetterloomStorage;

  const PREMIUM_NAMES = {
    TW: 'triple word score',
    DW: 'double word score',
    TL: 'triple letter score',
    DL: 'double letter score',
  };

  const HOW_TO_PLAY = [
    'Select a rack tile, then click or activate an empty board square to place it.',
    'The first word must cover the center starting square.',
    'New words must connect to tiles already on the board and form a straight line across or down.',
    'All words formed, including cross-words, must be in the dictionary.',
    'Blank tiles let you choose any letter when placed.',
    'Exchange tiles only when at least 7 tiles remain in the bag.',
    'Playing all 7 tiles in one turn scores a 50-point bonus.',
    'You can play another person on the same screen, or play the computer on Easy, Medium, or Hard. The computer uses the same dictionary and rules.',
    'Take back undoes the turn you just made. Against the computer it also undoes the reply, and the bag is reshuffled.',
    'Coach mode (vs the computer, chosen at the start) adds Hint and a best-available note after your turns.',
    'Tap the tiles-remaining count to see unseen letters — the leftover A–Z grid. After the game ends it shows every tile still off the board.',
    'Replay and local stats read the turn history already stored in this browser. No extra recording.',
  ];

  function playerNameAt(game, index, fallbackName) {
    if (fallbackName) return fallbackName;
    if (game && game.players && game.players[index]) return game.players[index].name;
    return 'Player';
  }

  function formatHistoryLine(entry, game) {
    if (!entry) return '';
    const name = playerNameAt(game, entry.playerIndex, entry.playerName);
    const turn = entry.turnNumber != null ? `T${entry.turnNumber} · ` : '';

    if (entry.type === 'coach') {
      if (entry.action === 'exchange') {
        return `Best available: exchange ${entry.exchangeLetters || 'tiles'}`;
      }
      if (entry.action === 'pass') {
        return 'Best available: pass';
      }
      const words = (entry.words || []).join(', ') || 'a play';
      const score = entry.score != null ? ` for ${entry.score}` : '';
      return `Best available: ${words}${score}`;
    }

    if (entry.type === 'takeback') {
      return `${name} took back.`;
    }

    if (entry.type === 'exchange') {
      const letters = entry.exchangeLetters ? ` (${entry.exchangeLetters})` : '';
      return `${turn}${name} exchanged ${entry.exchange} tile(s)${letters}`;
    }

    if (entry.type === 'pass') {
      return `${turn}${name} passed.`;
    }

    if (entry.type === 'play') {
      const words = (entry.words || []).join(', ') || 'a word';
      return `${turn}${name} played ${words} for ${entry.score} pts`;
    }

    return `${turn}${name}`;
  }

  function bestPlayFromHistory(game) {
    if (Engine && Engine.summarizeHistory) {
      return Engine.summarizeHistory(game).bestPlay;
    }
    let best = null;
    for (const entry of game && game.history ? game.history : []) {
      if (entry.type !== 'play' || entry.takenBack) continue;
      if (!best || (entry.score || 0) > (best.score || 0)) best = entry;
    }
    return best;
  }

  function formatRackSnapshot(tiles) {
    if (!tiles || tiles.length === 0) return '';
    return tiles.map((tile) => (tile.isBlank ? '?' : tile.letter || '?')).join('');
  }

  function formatReplayLine(entry, game) {
    const line = formatHistoryLine(entry, game);
    if (!entry || entry.takenBack) return line;
    const bits = [];
    if (entry.type === 'play') {
      if (entry.tilesPlayed === 7) bits.push('bingo');
      if (entry.scoreAfter != null) bits.push(`now ${entry.scoreAfter}`);
    }
    if (entry.rackBefore && entry.rackBefore.length) {
      bits.push(`rack ${formatRackSnapshot(entry.rackBefore)}`);
    }
    return bits.length ? `${line} · ${bits.join(' · ')}` : line;
  }

  function unseenViewerIndex(game) {
    if (!game) return 0;
    if (game.mode === 'computer' && Number.isInteger(game.computerSeat)) {
      return game.computerSeat === 0 ? 1 : 0;
    }
    return game.currentPlayerIndex;
  }

  /**
   * @param {HTMLElement} parent
   * @param {object} unseen
   */
  function renderUnseenGrid(parent, unseen) {
    if (!unseen) return;

    const intro = unseen.revealed
      ? `${unseen.total} leftover tile${unseen.total === 1 ? '' : 's'} not on the board.`
      : `${unseen.total} unseen tile${unseen.total === 1 ? '' : 's'} — bag plus opponents' racks.`;
    parent.appendChild(createElement('p', 'unseen-intro', intro));

    if (!unseen.revealed) {
      parent.appendChild(
        createElement(
          'p',
          'unseen-meta',
          `${unseen.bagCount} in the bag · ${unseen.opponentCount} on opponents' racks`
        )
      );
    }

    const grid = createElement('div', 'unseen-grid');
    grid.setAttribute('role', 'list');
    grid.setAttribute('aria-label', unseen.revealed ? 'Leftover letter counts' : 'Unseen letter counts');

    (unseen.letters || []).forEach((entry) => {
      const cell = createElement('div', 'unseen-cell');
      cell.setAttribute('role', 'listitem');
      if (!entry.count) cell.classList.add('unseen-gone');
      cell.setAttribute('aria-label', `${entry.letter}, ${entry.count} remaining`);
      cell.appendChild(createElement('span', 'unseen-face', entry.letter));
      cell.appendChild(createElement('span', 'unseen-count', String(entry.count)));
      grid.appendChild(cell);
    });

    const blank = createElement('div', 'unseen-cell unseen-blank');
    blank.setAttribute('role', 'listitem');
    if (!unseen.blanks) blank.classList.add('unseen-gone');
    blank.setAttribute('aria-label', `Blanks, ${unseen.blanks} remaining`);
    const blankFace = createElement('span', 'unseen-face');
    blankFace.appendChild(document.createTextNode('?'));
    blank.appendChild(blankFace);
    blank.appendChild(createElement('span', 'unseen-count', String(unseen.blanks || 0)));
    grid.appendChild(blank);

    parent.appendChild(grid);
  }

  /**
   * @param {HTMLElement} parent
   * @param {object} game
   */
  function renderReplayLog(parent, game) {
    const history = game && Array.isArray(game.history) ? game.history : [];
    const stats = Engine && Engine.summarizeHistory ? Engine.summarizeHistory(game) : null;

    if (stats) {
      const bits = [
        `${stats.plays} play(s)`,
        `${stats.bingos} bingo(s)`,
        `${stats.exchanges} exchange(s)`,
        `${stats.passes} pass(es)`,
      ];
      if (stats.bestPlay) {
        const name = playerNameAt(game, stats.bestPlay.playerIndex, stats.bestPlay.playerName);
        bits.push(`best ${name} ${(stats.bestPlay.words || []).join(', ')} +${stats.bestPlay.score}`);
      }
      parent.appendChild(createElement('p', 'replay-summary', bits.join(' · ')));
    }

    if (history.length === 0) {
      parent.appendChild(createElement('p', 'replay-empty', 'No moves recorded yet.'));
      return;
    }

    const list = createElement('ol', 'replay-list');
    history.forEach((entry) => {
      const item = createElement('li', 'replay-item');
      if (entry.takenBack) item.classList.add('turn-log-taken-back');
      if (entry.type === 'coach') item.classList.add('turn-log-coach');
      if (entry.type === 'takeback') item.classList.add('turn-log-takeback');
      item.textContent = formatReplayLine(entry, game);
      list.appendChild(item);
    });
    parent.appendChild(list);
  }

  /**
   * @param {HTMLElement} parent
   * @param {object} stats
   */
  function renderLocalStats(parent, stats) {
    if (!stats || stats.finished === 0) {
      parent.appendChild(
        createElement(
          'p',
          'stats-empty',
          'Finish a game to start a local record. These numbers are read from this browser’s completed games and saves.'
        )
      );
      return;
    }

    const list = createElement('ul', 'stats-list');
    list.appendChild(
      createElement('li', null, `${stats.finished} finished game${stats.finished === 1 ? '' : 's'}`)
    );
    if (stats.computerGames > 0) {
      const record = stats.vsComputer || { wins: 0, losses: 0, ties: 0 };
      list.appendChild(
        createElement('li', null, `Vs computer: ${record.wins}–${record.losses}–${record.ties}`)
      );
    }
    if (stats.humanGames > 0) {
      list.appendChild(
        createElement(
          'li',
          null,
          `${stats.humanGames} two-player game${stats.humanGames === 1 ? '' : 's'}`
        )
      );
    }
    list.appendChild(
      createElement('li', null, `${stats.bingos} bingo${stats.bingos === 1 ? '' : 's'}`)
    );
    if (stats.bestPlay) {
      list.appendChild(
        createElement(
          'li',
          null,
          `Best play: ${stats.bestPlay.playerName} · ${(stats.bestPlay.words || []).join(', ')} +${stats.bestPlay.score}`
        )
      );
    }
    parent.appendChild(list);

    if (stats.games && stats.games.length > 0) {
      parent.appendChild(createElement('h3', 'stats-subheading', 'Recent games'));
      const recent = createElement('ol', 'stats-recent');
      stats.games.slice(0, 8).forEach((entry) => {
        const item = createElement('li', 'stats-recent-item');
        const names = (entry.names || []).join(' vs ');
        const result = entry.isTie ? 'Tie' : `${entry.winnerName || 'Someone'} won`;
        const scores = (entry.names || [])
          .map((name, index) => `${name} ${entry.scores ? entry.scores[index] : 0}`)
          .join(' · ');
        item.textContent = `${names} · ${result} · ${scores}`;
        recent.appendChild(item);
      });
      parent.appendChild(recent);
    }
  }

  function describeBoardCell(row, col, placed, pendingDisplay, premium) {
    const parts = [`Row ${row + 1}, column ${col + 1}`];
    if (row === Engine.CENTER_ROW && col === Engine.CENTER_COL) {
      parts.push('center starting square');
    }
    if (premium) parts.push(PREMIUM_NAMES[premium] || premium);
    if (placed) {
      const letter = formatTileLetter(placed) || '?';
      const blank = placed.isBlank ? ' blank' : '';
      const pts = placed.isBlank ? '' : `, ${placed.points} point${placed.points === 1 ? '' : 's'}`;
      parts.push(`occupied, letter ${letter}${blank}${pts}`);
    } else if (pendingDisplay) {
      const letter = formatTileLetter(pendingDisplay) || '?';
      parts.push(`pending placement, letter ${letter}`);
    } else {
      parts.push('empty');
    }
    return parts.join(', ');
  }

  function describeRackTile(tile, selected, exchangeMode) {
    const letter = formatTileLetter(tile);
    const parts = [letter ? `Tile ${letter}` : 'Blank tile'];
    if (!tile.isBlank && tile.points > 0) {
      parts.push(`${tile.points} point${tile.points === 1 ? '' : 's'}`);
    }
    if (selected && exchangeMode) parts.push('marked for exchange');
    else if (selected) parts.push('selected');
    return parts.join(', ');
  }

  function moveGridFocus(row, col, key) {
    const max = Engine.BOARD_SIZE - 1;
    if (key === 'ArrowUp') return { row: Math.max(0, row - 1), col };
    if (key === 'ArrowDown') return { row: Math.min(max, row + 1), col };
    if (key === 'ArrowLeft') return { row, col: Math.max(0, col - 1) };
    if (key === 'ArrowRight') return { row, col: Math.min(max, col + 1) };
    if (key === 'Home') return { row, col: 0 };
    if (key === 'End') return { row, col: max };
    if (key === 'PageUp') return { row: 0, col };
    if (key === 'PageDown') return { row: max, col };
    return null;
  }

  function appendHowToPlay(parent) {
    const list = createElement('ul', 'help-list');
    HOW_TO_PLAY.forEach((item) => {
      list.appendChild(createElement('li', null, item));
    });
    parent.appendChild(list);
  }

  function letterPoints(letter) {
    const info = Engine && Engine.TILE_DISTRIBUTION && Engine.TILE_DISTRIBUTION[letter];
    return info ? info.points : 0;
  }

  function appendDecorPoints(parent, points) {
    if (points === '' || points === null || points === undefined) return;
    parent.appendChild(createElement('i', null, String(points)));
  }

  function appendWordmark(parent) {
    const rack = createElement('div', 'setup-wordmark');
    rack.setAttribute('aria-hidden', 'true');
    const word = 'LETTERLOOM';
    for (let i = 0; i < word.length; i += 1) {
      const letter = word.charAt(i);
      const tile = createElement('span', 'setup-wordmark-tile');
      tile.appendChild(document.createTextNode(letter));
      appendDecorPoints(tile, letterPoints(letter));
      rack.appendChild(tile);
    }
    parent.appendChild(rack);
  }

  function appendSetupBoardExcerpt(parent) {
    if (!Engine || !Engine.PREMIUM_LAYOUT) return;

    const board = createElement('div', 'setup-board-excerpt');
    board.setAttribute('aria-hidden', 'true');

    const origin = Engine.CENTER_ROW - 3;
    const tiles = {
      '3,2': 'L',
      '3,3': 'O',
      '3,4': 'O',
      '3,5': 'M',
      '4,2': 'A',
      '5,2': 'T',
      '6,2': 'E',
    };

    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const cell = createElement('span', 'setup-excerpt-cell');
        const boardRow = origin + r;
        const boardCol = origin + c;
        if ((boardRow + boardCol) % 2 === 1) {
          cell.classList.add('setup-excerpt-alt');
        }

        const letter = tiles[`${r},${c}`];
        const isCenter = r === 3 && c === 3;
        const premium =
          Engine && Engine.PREMIUM_LAYOUT ? Engine.PREMIUM_LAYOUT[boardRow][boardCol] : '.';

        if (letter) {
          cell.classList.add('setup-excerpt-tile');
          cell.appendChild(document.createTextNode(letter));
          appendDecorPoints(cell, letterPoints(letter));
        } else {
          if (premium && premium !== '.') {
            cell.classList.add(`setup-excerpt-${premium.toLowerCase()}`);
            cell.appendChild(document.createTextNode(premium));
          }
          if (isCenter) {
            cell.classList.add('setup-excerpt-star');
            cell.appendChild(document.createTextNode('★'));
          }
        }

        board.appendChild(cell);
      }
    }

    parent.appendChild(board);
  }

  function createSetupFrame() {
    const card = createElement('div', 'setup-card');
    const main = createElement('div', 'setup-main');
    appendWordmark(main);
    main.appendChild(createElement('h1', 'sr-only', 'Letterloom'));
    card.appendChild(main);

    const side = createElement('aside', 'setup-side');
    appendSetupBoardExcerpt(side);
    card.appendChild(side);
    return { card, main, side };
  }

  function appendTileChoice(row, spec) {
    const wrap = createElement('label', 'setup-tile-choice');
    const radio = createElement('input', 'sr-only');
    radio.type = 'radio';
    radio.name = spec.name;
    radio.value = spec.value;
    radio.checked = Boolean(spec.checked);
    const face = createElement('span', 'setup-tile-choice-face');
    face.appendChild(document.createTextNode(spec.letter));
    appendDecorPoints(face, spec.points);
    wrap.appendChild(radio);
    wrap.appendChild(face);
    wrap.appendChild(document.createTextNode(spec.label));
    row.appendChild(wrap);
    return radio;
  }

  function setSetupActive(active) {
    if (global.document && global.document.body) {
      global.document.body.classList.toggle('setup-active', Boolean(active));
    }
  }

  /** @typedef {{ row: number, col: number, tileId: number, letter?: string }} PendingPlacement */

  function clearElement(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function createElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }

  function formatTileLetter(tile) {
    if (!tile) return '';
    if (tile.isBlank) return tile.letter && tile.letter !== ' ' ? tile.letter : '';
    return tile.letter === ' ' ? '' : tile.letter;
  }

  function getRackTile(game, tileId) {
    const player = game.players[game.currentPlayerIndex];
    return player.rack.find((t) => t.id === tileId) || null;
  }

  function pendingAt(pendingPlacements, row, col) {
    return (pendingPlacements || []).find((p) => p.row === row && p.col === col) || null;
  }

  /**
   * Infer word direction from pending tile positions and board context.
   * @returns {'horizontal'|'vertical'|null}
   */
  function inferPlacementDirection(game, pendingPlacements) {
    if (!pendingPlacements || pendingPlacements.length === 0) return null;

    if (pendingPlacements.length === 1) {
      const { row, col } = pendingPlacements[0];
      const hasLeft = col > 0 && game.board[row][col - 1];
      const hasRight = col < Engine.BOARD_SIZE - 1 && game.board[row][col + 1];
      const hasUp = row > 0 && game.board[row - 1][col];
      const hasDown = row < Engine.BOARD_SIZE - 1 && game.board[row + 1][col];

      if (hasLeft || hasRight) return 'horizontal';
      if (hasUp || hasDown) return 'vertical';
      return null;
    }

    const rows = new Set(pendingPlacements.map((p) => p.row));
    const cols = new Set(pendingPlacements.map((p) => p.col));

    if (rows.size === 1) return 'horizontal';
    if (cols.size === 1) return 'vertical';
    return null;
  }

  /**
   * Resolve direction for validation/play, trying both axes when a lone tile is ambiguous.
   * @returns {{ direction: 'horizontal'|'vertical'|null, validation?: object }}
   */
  function resolvePlacementDirection(game, pendingPlacements) {
    const inferred = inferPlacementDirection(game, pendingPlacements);
    if (inferred) {
      return { direction: inferred };
    }

    if (pendingPlacements.length === 1) {
      const horizontal = Engine.validatePlacement(game, pendingPlacements, 'horizontal');
      const vertical = Engine.validatePlacement(game, pendingPlacements, 'vertical');

      if (horizontal.ok && !vertical.ok) {
        return { direction: 'horizontal', validation: horizontal };
      }
      if (vertical.ok && !horizontal.ok) {
        return { direction: 'vertical', validation: vertical };
      }
      if (horizontal.ok && vertical.ok) {
        return { direction: 'horizontal', validation: horizontal };
      }
    }

    return { direction: null };
  }

  function renderTileFace(tile, options = {}) {
    const { pending = false, small = false, selected = false } = options;
    const face = createElement('div', 'tile-face');
    if (pending) face.classList.add('tile-pending');
    if (small) face.classList.add('tile-small');
    if (selected) face.classList.add('tile-selected');

    const letter = formatTileLetter(tile);
    const letterEl = createElement('span', 'tile-letter', letter || (tile.isBlank ? '?' : ''));
    face.appendChild(letterEl);

    if (!tile.isBlank && tile.points > 0) {
      const pointsEl = createElement('span', 'tile-points', String(tile.points));
      face.appendChild(pointsEl);
    }

    return face;
  }

  /**
   * @param {HTMLElement} container
   * @param {object} game
   * @param {PendingPlacement[]} pendingPlacements
   * @param {{ direction?: string, onCellClick?: Function, focusCell?: {row:number,col:number}, onFocusCell?: Function }} [options]
   */
  function renderBoard(container, game, pendingPlacements, options = {}) {
    clearElement(container);
    container.classList.add('letterloom-board');
    container.id = 'letterloom-board';
    container.setAttribute('role', 'grid');
    container.setAttribute('aria-label', 'Letterloom board');
    container.setAttribute('aria-rowcount', String(Engine.BOARD_SIZE));
    container.setAttribute('aria-colcount', String(Engine.BOARD_SIZE));

    const pendingMap = new Map(
      (pendingPlacements || []).map((p) => [`${p.row},${p.col}`, p])
    );

    const focusCell = options.focusCell || { row: Engine.CENTER_ROW, col: Engine.CENTER_COL };

    for (let row = 0; row < Engine.BOARD_SIZE; row += 1) {
      const rowEl = createElement('div', 'board-row');
      rowEl.setAttribute('role', 'row');
      rowEl.setAttribute('aria-rowindex', String(row + 1));

      for (let col = 0; col < Engine.BOARD_SIZE; col += 1) {
        const cell = createElement('button', 'board-cell');
        cell.type = 'button';
        if ((row + col) % 2 === 1) {
          cell.classList.add('board-cell-alt');
        }
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-colindex', String(col + 1));
        cell.tabIndex = row === focusCell.row && col === focusCell.col ? 0 : -1;

        const premium = Engine.getPremiumAt(row, col);
        if (premium) {
          cell.classList.add(`premium-${premium.toLowerCase()}`);
          const label = createElement('span', 'premium-label', premium);
          label.setAttribute('aria-hidden', 'true');
          cell.appendChild(label);
        }

        if (row === Engine.CENTER_ROW && col === Engine.CENTER_COL && !game.board[row][col]) {
          const star = createElement('span', 'center-star', '★');
          star.setAttribute('aria-hidden', 'true');
          cell.appendChild(star);
        }

        const placed = game.board[row][col];
        const pending = pendingMap.get(`${row},${col}`);
        let pendingDisplay = null;

        if (placed) {
          cell.classList.add('occupied');
          cell.appendChild(renderTileFace(placed, { small: true }));
        } else if (pending) {
          cell.classList.add('pending-cell');
          const rackTile = getRackTile(game, pending.tileId);
          if (rackTile) {
            pendingDisplay = {
              ...rackTile,
              letter: pending.letter || rackTile.letter,
            };
            cell.appendChild(renderTileFace(pendingDisplay, { pending: true, small: true }));
          }
        }

        cell.setAttribute(
          'aria-label',
          describeBoardCell(row, col, placed, pendingDisplay, premium)
        );

        if (options.onCellClick) {
          cell.addEventListener('click', () => {
            options.onCellClick(row, col);
          });
        }

        cell.addEventListener('keydown', (event) => {
          const next = moveGridFocus(row, col, event.key);
          if (!next) return;
          event.preventDefault();
          if (options.onFocusCell) options.onFocusCell(next.row, next.col);
          const nextEl = container.querySelector(
            `[data-row="${next.row}"][data-col="${next.col}"]`
          );
          if (nextEl) {
            container.querySelectorAll('.board-cell').forEach((el) => {
              el.tabIndex = -1;
            });
            nextEl.tabIndex = 0;
            nextEl.focus();
          }
        });

        rowEl.appendChild(cell);
      }

      container.appendChild(rowEl);
    }
  }

  /**
   * @param {HTMLElement} container
   * @param {object} game
   * @param {number[]} selectedTileIds
   * @param {{ exchangeMode?: boolean, onTileClick?: Function }} [options]
   */
  function renderRack(container, game, selectedTileIds, options = {}) {
    clearElement(container);
    container.classList.add('letterloom-rack');
    container.id = 'letterloom-rack';
    container.setAttribute('role', 'group');

    const player = game.players[options.playerIndex ?? game.currentPlayerIndex];
    const selected = new Set(selectedTileIds || []);
    const pendingIds = new Set(options.pendingTileIds || []);
    const labelId = 'rack-player-label';

    const slots = createElement('div', 'rack-slots');
    for (let i = 0; i < Engine.RACK_SIZE; i += 1) {
      const slot = createElement('div', 'rack-slot');
      const tile = player.rack[i];

      if (tile && !pendingIds.has(tile.id)) {
        const isSelected = selected.has(tile.id);
        const btn = createElement('button', 'rack-tile');
        btn.type = 'button';
        btn.dataset.tileId = String(tile.id);
        btn.setAttribute('aria-label', describeRackTile(tile, isSelected, options.exchangeMode));
        btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        if (isSelected) btn.classList.add('selected');
        if (options.exchangeMode) btn.classList.add('exchange-mode');

        btn.appendChild(renderTileFace(tile, { selected: isSelected }));

        if (options.onTileClick && !options.locked) {
          btn.addEventListener('click', () => options.onTileClick(tile.id));
        }
        if (options.locked) {
          btn.disabled = true;
        }

        slot.appendChild(btn);
      }

      slots.appendChild(slot);
    }

    container.appendChild(slots);

    const label = createElement(
      'div',
      'rack-player-label',
      `${player.name}'s rack`
    );
    label.id = labelId;
    container.setAttribute('aria-labelledby', labelId);
    container.appendChild(label);
  }

  /**
   * @param {HTMLElement} container
   * @param {object} game
   * @param {{ thinking?: boolean }} [options]
   */
  function renderStatus(container, game, options = {}) {
    clearElement(container);
    container.classList.add('status-panel');

    const current = game.players[game.currentPlayerIndex];
    const turnEl = createElement('div', 'status-turn');
    turnEl.appendChild(createElement('h2', 'status-heading', 'Current turn'));
    turnEl.appendChild(createElement('p', 'status-current-player', current.name));

    if (options.thinking) {
      const think = createElement('p', 'status-thinking');
      think.setAttribute('aria-live', 'polite');
      think.appendChild(createElement('span', 'status-thinking-dot', ''));
      const level = game.computerDifficulty
        ? ` (${game.computerDifficulty})`
        : '';
      think.appendChild(document.createTextNode(`${current.name} is thinking${level}…`));
      turnEl.appendChild(think);
    } else if (game.status === 'playing') {
      turnEl.appendChild(
        createElement('p', 'status-turn-number', `Turn ${game.turnNumber}`)
      );
    }

    container.appendChild(turnEl);

    const scoresEl = createElement('div', 'status-scores');
    scoresEl.appendChild(createElement('h3', 'status-subheading', 'Scores'));
    const list = createElement('ul', 'score-list');

    game.players.forEach((player, index) => {
      const item = createElement('li', 'score-item');
      const isCurrent = index === game.currentPlayerIndex && game.status === 'playing';
      if (isCurrent) {
        item.classList.add('active-player');
        item.setAttribute('aria-current', 'true');
      }
      const nameWrap = createElement('span', 'score-name');
      nameWrap.appendChild(document.createTextNode(player.name));
      if (game.mode === 'computer' && index === game.computerSeat) {
        nameWrap.appendChild(createElement('span', 'cpu-badge', 'CPU'));
      }
      if (isCurrent) {
        nameWrap.appendChild(createElement('span', 'sr-only', ' (current turn)'));
      }
      item.appendChild(nameWrap);
      item.appendChild(createElement('span', 'score-value', String(player.score)));
      list.appendChild(item);
    });

    scoresEl.appendChild(list);
    container.appendChild(scoresEl);

    const bagEl = createElement('div', 'status-bag');
    bagEl.appendChild(createElement('h3', 'status-subheading', 'Tile bag'));
    const bagCount = Engine.getRemainingBagCount(game);
    const bagBtn = createElement('button', 'bag-count-btn', `${bagCount} tiles remaining`);
    bagBtn.type = 'button';
    bagBtn.setAttribute('aria-haspopup', 'dialog');
    bagBtn.setAttribute(
      'aria-label',
      `${bagCount} tiles remaining. Show the leftover letter grid.`
    );
    if (options.onBagClick) {
      bagBtn.addEventListener('click', () => options.onBagClick());
    } else {
      bagBtn.disabled = true;
    }
    bagEl.appendChild(bagBtn);
    container.appendChild(bagEl);

    const history = Array.isArray(game.history) ? game.history : [];
    const logEl = createElement('div', 'status-turn-log');
    logEl.appendChild(createElement('h3', 'status-subheading', 'Turn log'));

    if (history.length === 0) {
      logEl.appendChild(createElement('p', 'turn-log-empty', 'No moves yet.'));
    } else {
      const list = createElement('ol', 'turn-log-list');
      const start = Math.max(0, history.length - 16);
      for (let i = history.length - 1; i >= start; i -= 1) {
        const entry = history[i];
        const item = createElement('li', 'turn-log-item');
        if (entry.takenBack) item.classList.add('turn-log-taken-back');
        if (entry.type === 'coach') item.classList.add('turn-log-coach');
        if (entry.type === 'takeback') item.classList.add('turn-log-takeback');
        item.textContent = formatHistoryLine(entry, game);
        list.appendChild(item);
      }
      logEl.appendChild(list);
      if (start > 0) {
        logEl.appendChild(
          createElement('p', 'turn-log-more', `${start} earlier turn(s) not shown.`)
        );
      }
    }

    if (options.onReplay && history.length > 0) {
      const replayBtn = createElement('button', 'btn btn-small turn-log-replay', 'Replay');
      replayBtn.type = 'button';
      replayBtn.dataset.focusId = 'replay';
      replayBtn.setAttribute('aria-haspopup', 'dialog');
      replayBtn.addEventListener('click', () => options.onReplay());
      logEl.appendChild(replayBtn);
    }

    container.appendChild(logEl);
  }

  /**
   * @param {HTMLElement} container
   * @param {object} callbacks
   * @param {{ exchangeMode?: boolean, canPlay?: boolean, canExchange?: boolean, bagCount?: number }} [state]
   */
  function renderControls(container, callbacks, state = {}) {
    clearElement(container);
    container.classList.add('controls-panel');

    const actions = createElement('div', 'control-actions');

    const locked = Boolean(state.locked);

    const playBtn = createElement('button', 'btn btn-primary', 'Play Word');
    playBtn.type = 'button';
    playBtn.dataset.focusId = 'play';
    playBtn.disabled = !state.canPlay || locked;
    if (!state.canPlay || locked) {
      playBtn.setAttribute('aria-describedby', 'play-disabled-reason');
    }
    playBtn.addEventListener('click', () => callbacks.onPlay && callbacks.onPlay());
    actions.appendChild(playBtn);

    const clearBtn = createElement('button', 'btn', 'Clear');
    clearBtn.type = 'button';
    clearBtn.dataset.focusId = 'clear';
    clearBtn.disabled = locked;
    clearBtn.addEventListener('click', () => callbacks.onClear && callbacks.onClear());
    actions.appendChild(clearBtn);

    const passBtn = createElement('button', 'btn', 'Pass');
    passBtn.type = 'button';
    passBtn.dataset.focusId = 'pass';
    passBtn.disabled = locked;
    passBtn.addEventListener('click', () => callbacks.onPass && callbacks.onPass());
    actions.appendChild(passBtn);

    const shuffleBtn = createElement('button', 'btn', 'Shuffle');
    shuffleBtn.type = 'button';
    shuffleBtn.dataset.focusId = 'shuffle';
    shuffleBtn.disabled = locked;
    shuffleBtn.setAttribute('aria-label', 'Shuffle rack');
    shuffleBtn.addEventListener('click', () => callbacks.onShuffle && callbacks.onShuffle());
    actions.appendChild(shuffleBtn);

    if (!state.exchangeMode) {
      const exchangeBtn = createElement('button', 'btn', 'Exchange');
      exchangeBtn.type = 'button';
      exchangeBtn.dataset.focusId = 'exchange';
      exchangeBtn.disabled = !state.canExchange || locked;
      if (!state.canExchange || locked) {
        exchangeBtn.setAttribute('aria-describedby', 'exchange-disabled-reason');
      }
      exchangeBtn.addEventListener('click', () => callbacks.onExchange && callbacks.onExchange());
      actions.appendChild(exchangeBtn);
    }

    if (state.canHint) {
      const hintBtn = createElement('button', 'btn btn-secondary', 'Hint');
      hintBtn.type = 'button';
      hintBtn.dataset.focusId = 'hint';
      hintBtn.disabled = locked || Boolean(state.coachBusy);
      hintBtn.title = 'Place the best available play on the board';
      hintBtn.addEventListener('click', () => callbacks.onHint && callbacks.onHint());
      actions.appendChild(hintBtn);
    }

    if (state.canTakeBack) {
      const takeBackBtn = createElement('button', 'btn', 'Take Back');
      takeBackBtn.type = 'button';
      takeBackBtn.dataset.focusId = 'take-back';
      takeBackBtn.disabled = locked || Boolean(state.coachBusy);
      takeBackBtn.setAttribute('aria-label', 'Take back the last turn');
      takeBackBtn.addEventListener('click', () => callbacks.onTakeBack && callbacks.onTakeBack());
      actions.appendChild(takeBackBtn);
    }

    container.appendChild(actions);

    if (state.exchangeMode) {
      const exchangeSection = createElement('div', 'exchange-section');
      const confirmBtn = createElement('button', 'btn btn-warning', 'Confirm Exchange');
      confirmBtn.type = 'button';
      confirmBtn.dataset.focusId = 'confirm-exchange';
      confirmBtn.addEventListener('click', () => callbacks.onConfirmExchange && callbacks.onConfirmExchange());
      exchangeSection.appendChild(confirmBtn);

      const cancelBtn = createElement('button', 'btn', 'Cancel');
      cancelBtn.type = 'button';
      cancelBtn.dataset.focusId = 'cancel-exchange';
      cancelBtn.setAttribute('aria-label', 'Cancel exchange');
      cancelBtn.addEventListener('click', () => callbacks.onCancelExchange && callbacks.onCancelExchange());
      exchangeSection.appendChild(cancelBtn);
      container.appendChild(exchangeSection);
    }

    if ((!state.canPlay || locked) && !state.exchangeMode) {
      const playHint = createElement(
        'p',
        'sr-only',
        locked
          ? 'Play Word is unavailable while the computer is taking its turn.'
          : 'Play Word is unavailable until tiles form a valid word.'
      );
      playHint.id = 'play-disabled-reason';
      container.appendChild(playHint);
    }

    if (state.canExchange === false && !state.exchangeMode && !locked) {
      const exchangeHint = createElement(
        'p',
        'control-message',
        `Need at least ${Engine.MIN_BAG_FOR_EXCHANGE} tiles in the bag to exchange.`
      );
      exchangeHint.id = 'exchange-disabled-reason';
      container.appendChild(exchangeHint);
    }

    if (state.message) {
      container.appendChild(createElement('p', 'control-message', state.message));
    }
  }

  /**
   * @param {HTMLElement} container
   * @param {'horizontal'|'vertical'|null} direction
   * @param {number} pendingCount
   */
  function renderDirectionHint(container, direction, pendingCount) {
    clearElement(container);
    container.classList.add('direction-hint');

    if (pendingCount === 0) return;

    if (direction === 'horizontal') {
      const hint = createElement('span', 'direction-hint-text', 'Across');
      hint.setAttribute('aria-label', 'Playing across');
      container.appendChild(hint);
      return;
    }

    if (direction === 'vertical') {
      const hint = createElement('span', 'direction-hint-text', 'Down');
      hint.setAttribute('aria-label', 'Playing down');
      container.appendChild(hint);
      return;
    }

    container.appendChild(
      createElement('span', 'direction-hint-text direction-hint-ambiguous', 'Place tiles in a straight line')
    );
  }

  /**
   * @param {HTMLElement} container
   * @param {object} game
   * @param {PendingPlacement[]} pendingPlacements
   * @param {'horizontal'|'vertical'} direction
   */
  function renderScorePreview(container, game, pendingPlacements, direction, cachedValidation) {
    clearElement(container);
    container.classList.add('score-preview');

    if (!pendingPlacements || pendingPlacements.length === 0) {
      container.appendChild(createElement('p', 'preview-empty', 'Place tiles to preview score.'));
      return;
    }

    if (!direction) {
      container.appendChild(
        createElement('p', 'preview-error', 'Tiles must form a straight line — across or down.')
      );
      return;
    }

    const validation =
      cachedValidation && cachedValidation.ok
        ? cachedValidation
        : Engine.validatePlacement(game, pendingPlacements, direction);

    if (!validation.ok) {
      container.appendChild(createElement('p', 'preview-error', validation.error));
      return;
    }

    const hypothetical = validation.words.map((wordEntry) => ({
      word: wordEntry.word,
      direction: wordEntry.direction,
      cells: wordEntry.cells,
      board: validation.board,
    }));

    const score = Engine.scoreTurn(
      hypothetical,
      validation.placements.map((p) => ({ row: p.row, col: p.col })),
      validation.placements
    );

    container.appendChild(createElement('h3', 'preview-heading', 'Score preview'));
    container.appendChild(
      createElement('p', 'preview-total', `+${score.total} points`)
    );

    const list = createElement('ul', 'preview-breakdown');
    score.breakdown.forEach((entry) => {
      list.appendChild(createElement('li', null, `${entry.word}: ${entry.score}`));
    });
    container.appendChild(list);

    const words = createElement('p', 'preview-words', validation.words.map((w) => w.word).join(', '));
    container.appendChild(words);
  }

  /**
   * @param {HTMLElement} container
   * @param {object} callbacks
   */
  function renderSetup(container, callbacks) {
    clearElement(container);
    container.classList.add('setup-screen');

    const { card, main, side } = createSetupFrame();

    main.appendChild(
      createElement('p', 'setup-tagline', 'Two players, one board, a hundred tiles.')
    );

    const savedGames = callbacks.savedGames || [];

    if (savedGames.length > 0) {
      const savesSection = createElement('div', 'setup-saves');
      savesSection.appendChild(createElement('h2', 'setup-saves-title', 'Saved games'));

      const list = createElement('ul', 'setup-saves-list');
      savedGames.forEach((save) => {
        const item = createElement('li', 'setup-save-item');

        const info = createElement('div', 'setup-save-info');
        info.appendChild(createElement('span', 'setup-save-name', save.name));
        info.appendChild(createElement('span', 'setup-save-status', save.status));
        const scoreText = save.scores.map((s) => `${s.name} ${s.score}`).join(' · ');
        info.appendChild(createElement('span', 'setup-save-scores', scoreText));
        info.appendChild(
          createElement(
            'span',
            'setup-save-meta',
            new Date(save.savedAt).toLocaleString()
          )
        );
        item.appendChild(info);

        const actions = createElement('div', 'setup-save-actions');
        const loadBtn = createElement('button', 'btn btn-primary btn-small', 'Load');
        loadBtn.type = 'button';
        loadBtn.setAttribute('aria-label', `Load save ${save.name}`);
        loadBtn.addEventListener('click', () => callbacks.onLoadSave && callbacks.onLoadSave(save.id));
        actions.appendChild(loadBtn);

        const deleteBtn = createElement('button', 'btn btn-small btn-danger', 'Delete');
        deleteBtn.type = 'button';
        deleteBtn.setAttribute('aria-label', `Delete save ${save.name}`);
        deleteBtn.addEventListener('click', () => {
          callbacks.onDeleteSave && callbacks.onDeleteSave(save.id, save.name);
        });
        actions.appendChild(deleteBtn);

        item.appendChild(actions);
        list.appendChild(item);
      });

      savesSection.appendChild(list);
      main.appendChild(savesSection);
      main.appendChild(createElement('hr', 'setup-divider'));
    }

    const form = createElement('form', 'setup-form');

    const modeField = createElement('fieldset', 'setup-fieldset');
    const modeLegend = createElement('legend', null, "Who's playing");
    modeField.appendChild(modeLegend);
    const modeRow = createElement('div', 'setup-choice-row');
    appendTileChoice(modeRow, {
      name: 'game-mode',
      value: 'human',
      label: 'Two players',
      letter: '2',
      points: '',
      checked: true,
    });
    appendTileChoice(modeRow, {
      name: 'game-mode',
      value: 'computer',
      label: 'Play the computer',
      letter: 'C',
      points: letterPoints('C'),
      checked: false,
    });
    modeField.appendChild(modeRow);
    form.appendChild(modeField);

    const humanFields = createElement('div', 'setup-human-fields');
    const field1 = createElement('div', 'form-field');
    const label1 = createElement('label', null, 'Player 1');
    label1.htmlFor = 'player1-name';
    field1.appendChild(label1);
    const input1 = createElement('input', 'setup-input');
    input1.type = 'text';
    input1.id = 'player1-name';
    input1.name = 'player1';
    input1.autocomplete = 'nickname';
    input1.maxLength = 20;
    field1.appendChild(input1);
    humanFields.appendChild(field1);

    const field2 = createElement('div', 'form-field');
    const label2 = createElement('label', null, 'Player 2');
    label2.htmlFor = 'player2-name';
    field2.appendChild(label2);
    const input2 = createElement('input', 'setup-input');
    input2.type = 'text';
    input2.id = 'player2-name';
    input2.name = 'player2';
    input2.autocomplete = 'nickname';
    input2.maxLength = 20;
    field2.appendChild(input2);
    humanFields.appendChild(field2);
    form.appendChild(humanFields);

    const computerFields = createElement('div', 'setup-computer-fields hidden');

    const humanNameField = createElement('div', 'form-field');
    const humanNameLabel = createElement('label', null, 'Your name');
    humanNameLabel.htmlFor = 'human-name';
    humanNameField.appendChild(humanNameLabel);
    const humanNameInput = createElement('input', 'setup-input');
    humanNameInput.type = 'text';
    humanNameInput.id = 'human-name';
    humanNameInput.name = 'human';
    humanNameInput.autocomplete = 'nickname';
    humanNameInput.maxLength = 20;
    humanNameField.appendChild(humanNameInput);
    computerFields.appendChild(humanNameField);

    const difficultyField = createElement('fieldset', 'setup-fieldset');
    difficultyField.appendChild(createElement('legend', null, 'Difficulty'));
    const difficultyRow = createElement('div', 'setup-choice-row');
    [
      { value: 'easy', label: 'Easy', letter: 'E' },
      { value: 'medium', label: 'Medium', letter: 'M' },
      { value: 'hard', label: 'Hard', letter: 'H' },
    ].forEach((choice) => {
      appendTileChoice(difficultyRow, {
        name: 'difficulty',
        value: choice.value,
        label: choice.label,
        letter: choice.letter,
        points: letterPoints(choice.letter),
        checked: choice.value === 'medium',
      });
    });
    difficultyField.appendChild(difficultyRow);
    computerFields.appendChild(difficultyField);

    const coachField = createElement('fieldset', 'setup-fieldset');
    coachField.appendChild(createElement('legend', null, 'Coach'));
    const coachRow = createElement('div', 'setup-choice-row');
    const coachWrap = createElement('label', 'setup-tile-choice');
    const coachCheck = createElement('input', 'sr-only');
    coachCheck.type = 'checkbox';
    coachCheck.id = 'coach-mode';
    coachCheck.name = 'coachMode';
    const coachFace = createElement('span', 'setup-tile-choice-face');
    coachFace.appendChild(document.createTextNode('?'));
    coachWrap.appendChild(coachCheck);
    coachWrap.appendChild(coachFace);
    coachWrap.appendChild(document.createTextNode('Coach mode'));
    coachRow.appendChild(coachWrap);
    coachField.appendChild(coachRow);
    const coachHint = createElement(
      'p',
      'setup-computer-hint',
      'Optional. Adds a Hint button and a best-available line after your turns. You cannot turn this on later.'
    );
    coachField.appendChild(coachHint);
    computerFields.appendChild(coachField);

    const seatField = createElement('div', 'form-field');
    const seatLabel = createElement('label', null, 'Computer plays as');
    seatLabel.htmlFor = 'computer-seat';
    seatField.appendChild(seatLabel);
    const seatSelect = createElement('select', 'setup-input');
    seatSelect.id = 'computer-seat';
    seatSelect.name = 'computerSeat';
    const seat2 = createElement('option', null, 'Player 2 — you are Player 1');
    seat2.value = '1';
    seat2.selected = true;
    const seat1 = createElement('option', null, 'Player 1 — you are Player 2');
    seat1.value = '0';
    seatSelect.appendChild(seat2);
    seatSelect.appendChild(seat1);
    seatField.appendChild(seatSelect);
    computerFields.appendChild(seatField);

    const computerHint = createElement(
      'p',
      'setup-computer-hint',
      'Closest tile to A still goes first. Hard favors score and rack leave; it is not an exhaustive strategy search.'
    );
    computerFields.appendChild(computerHint);
    form.appendChild(computerFields);

    function syncModeFields() {
      const mode = form.querySelector('input[name="game-mode"]:checked');
      const vsComputer = mode && mode.value === 'computer';
      computerFields.classList.toggle('hidden', !vsComputer);
      humanFields.classList.toggle('hidden', vsComputer);
      input1.disabled = vsComputer;
      input2.disabled = vsComputer;
      humanNameInput.disabled = !vsComputer;
      seatSelect.disabled = !vsComputer;
      coachCheck.disabled = !vsComputer;
    }

    form.querySelectorAll('input[name="game-mode"]').forEach((radio) => {
      radio.addEventListener('change', syncModeFields);
    });
    syncModeFields();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const mode = (form.querySelector('input[name="game-mode"]:checked') || {}).value || 'human';
      if (mode === 'computer') {
        const humanName = humanNameInput.value.trim() || 'Player 1';
        const seat = Number(seatSelect.value) === 0 ? 0 : 1;
        const difficulty =
          (form.querySelector('input[name="difficulty"]:checked') || {}).value || 'medium';
        const names = seat === 0 ? ['Computer', humanName] : [humanName, 'Computer'];
        callbacks.onStart(names, {
          mode: 'computer',
          computerSeat: seat,
          difficulty,
          coachMode: Boolean(coachCheck.checked),
        });
        return;
      }

      const p1 = input1.value.trim() || 'Player 1';
      const p2 = input2.value.trim() || 'Player 2';
      callbacks.onStart([p1, p2], { mode: 'human' });
    });

    const startBtn = createElement('button', 'btn btn-primary setup-start', 'Start game');
    startBtn.type = 'submit';
    form.appendChild(startBtn);

    main.appendChild(form);

    const links = createElement('div', 'setup-links');
    if (callbacks.onImport) {
      const importLabel = createElement('label', 'setup-import-link setup-import-btn', 'Resume a saved match');
      importLabel.htmlFor = 'import-save-file';
      const importInput = createElement('input', 'setup-import-input');
      importInput.type = 'file';
      importInput.id = 'import-save-file';
      importInput.accept = '.json,application/json';
      importInput.setAttribute('aria-describedby', 'import-save-hint');
      importInput.addEventListener('change', async () => {
        const file = importInput.files && importInput.files[0];
        importInput.value = '';
        if (!file) return;
        try {
          await callbacks.onImport(file);
        } catch (err) {
          callbacks.onImportError && callbacks.onImportError(err.message || 'Import failed.');
        }
      });
      importLabel.appendChild(importInput);
      links.appendChild(importLabel);
    } else {
      links.appendChild(createElement('span'));
    }

    const github = createElement('a', null, 'Source on GitHub');
    github.href = 'https://github.com/stillworkinglate/letterloom';
    links.appendChild(github);
    main.appendChild(links);

    if (callbacks.onImport) {
      const importHint = createElement(
        'p',
        'setup-import-hint',
        'Load a .json save from the saves/ folder or a download.'
      );
      importHint.id = 'import-save-hint';
      main.appendChild(importHint);
    }

    const helpBtn = createElement('button', 'setup-help-btn', 'How to play');
    helpBtn.type = 'button';
    helpBtn.dataset.focusId = 'setup-help';
    helpBtn.setAttribute('aria-haspopup', 'dialog');
    if (callbacks.onHelp) {
      helpBtn.addEventListener('click', () => callbacks.onHelp());
    } else {
      helpBtn.disabled = true;
    }
    side.appendChild(helpBtn);

    const statsBtn = createElement('button', 'setup-help-btn', 'Local stats');
    statsBtn.type = 'button';
    statsBtn.dataset.focusId = 'setup-stats';
    statsBtn.setAttribute('aria-haspopup', 'dialog');
    if (callbacks.onStats) {
      statsBtn.addEventListener('click', () => callbacks.onStats());
    } else {
      statsBtn.disabled = true;
    }
    side.appendChild(statsBtn);

    container.appendChild(card);

    // Avoid autofocus on touch so the OSK does not jump the viewport.
    if (
      typeof global.matchMedia === 'function' &&
      global.matchMedia('(pointer: fine)').matches
    ) {
      input1.focus();
    }
  }

  /**
   * @param {HTMLElement} container
   * @param {object} callbacks
   */
  function renderSavePanel(container, callbacks) {
    clearElement(container);
    container.classList.add('save-panel');

    container.appendChild(createElement('h3', 'status-subheading', 'Game'));

    const statusText = callbacks.saveName
      ? callbacks.lastSavedAt
        ? `"${callbacks.saveName}" — saved ${new Date(callbacks.lastSavedAt).toLocaleTimeString()}`
        : `"${callbacks.saveName}"`
      : 'Not saved yet — click Save to keep this game.';

    container.appendChild(createElement('p', 'save-status', statusText));

    const actions = createElement('div', 'save-actions');

    const saveBtn = createElement('button', 'btn btn-primary', 'Save');
    saveBtn.type = 'button';
    saveBtn.dataset.focusId = 'save';
    saveBtn.addEventListener('click', () => callbacks.onSave && callbacks.onSave());
    actions.appendChild(saveBtn);

    const newGameBtn = createElement('button', 'btn', 'New Game');
    newGameBtn.type = 'button';
    newGameBtn.dataset.focusId = 'new-game';
    newGameBtn.addEventListener('click', () => callbacks.onNewGame && callbacks.onNewGame());
    actions.appendChild(newGameBtn);

    const exportBtn = createElement('button', 'btn btn-secondary', 'Export JSON');
    exportBtn.type = 'button';
    exportBtn.dataset.focusId = 'export';
    exportBtn.addEventListener('click', () => callbacks.onExport && callbacks.onExport());
    actions.appendChild(exportBtn);

    if (callbacks.onHelp) {
      const helpBtn = createElement('button', 'btn', 'How to play');
      helpBtn.type = 'button';
      helpBtn.dataset.focusId = 'help';
      helpBtn.addEventListener('click', () => callbacks.onHelp());
      actions.appendChild(helpBtn);
    }

    if (callbacks.onStats) {
      const statsBtn = createElement('button', 'btn', 'Local stats');
      statsBtn.type = 'button';
      statsBtn.dataset.focusId = 'stats';
      statsBtn.setAttribute('aria-haspopup', 'dialog');
      statsBtn.addEventListener('click', () => callbacks.onStats());
      actions.appendChild(statsBtn);
    }

    container.appendChild(actions);
  }

  /**
   * @param {HTMLElement} container
   * @param {object} game
   * @param {{ onNewGame?: Function }} callbacks
   */
  function renderGameOver(container, game, callbacks) {
    clearElement(container);
    container.classList.add('game-over-modal');

    const card = createElement('div', 'game-over-card');
    const title = createElement('h2', 'game-over-title', 'Game Over');
    title.id = 'game-over-title';
    card.appendChild(title);

    const reasonText =
      game.endReason === 'last_tile_played'
        ? 'A player used their last tile.'
        : game.endReason === 'all_passed'
          ? 'All players passed in succession.'
          : 'The game has ended.';

    card.appendChild(createElement('p', 'game-over-reason', reasonText));

    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    const isTie = sorted.length > 1 && sorted[0].score === sorted[1].score;

    card.appendChild(
      createElement(
        'p',
        'game-over-winner',
        isTie ? "It's a tie!" : `${winner.name} wins!`
      )
    );

    const list = createElement('ol', 'final-scores');
    sorted.forEach((player, index) => {
      const item = createElement('li', 'final-score-item');
      item.appendChild(createElement('span', 'final-rank', `${index + 1}.`));
      item.appendChild(createElement('span', 'final-name', player.name));
      item.appendChild(createElement('span', 'final-points', `${player.score} pts`));
      list.appendChild(item);
    });
    card.appendChild(list);

    const bestPlay = bestPlayFromHistory(game);
    if (bestPlay) {
      const name = playerNameAt(game, bestPlay.playerIndex, bestPlay.playerName);
      card.appendChild(
        createElement(
          'p',
          'game-over-best',
          `Best play: ${name} · ${(bestPlay.words || []).join(', ')} +${bestPlay.score}`
        )
      );
    }

    if (Engine && Engine.summarizeHistory) {
      const stats = Engine.summarizeHistory(game);
      card.appendChild(
        createElement(
          'p',
          'game-over-stats-line',
          `${stats.plays} play(s) · ${stats.bingos} bingo(s) · ${stats.exchanges} exchange(s) · ${stats.passes} pass(es)`
        )
      );
    }

    if (Engine && Engine.getUnseenTiles) {
      const leftover = createElement('div', 'game-over-unseen');
      leftover.appendChild(createElement('h3', 'game-over-section-title', 'Leftover tiles'));
      renderUnseenGrid(
        leftover,
        Engine.getUnseenTiles(game, { revealRacks: true })
      );
      card.appendChild(leftover);
    }

    const actions = createElement('div', 'game-over-actions');
    if (callbacks.onReplay) {
      const replayBtn = createElement('button', 'btn', 'Replay');
      replayBtn.type = 'button';
      replayBtn.setAttribute('aria-haspopup', 'dialog');
      replayBtn.addEventListener('click', () => callbacks.onReplay());
      actions.appendChild(replayBtn);
    }
    if (callbacks.onTakeBack) {
      const takeBackBtn = createElement('button', 'btn', 'Take Back');
      takeBackBtn.type = 'button';
      takeBackBtn.addEventListener('click', () => callbacks.onTakeBack());
      actions.appendChild(takeBackBtn);
    }
    if (callbacks.onRematch) {
      const rematchBtn = createElement('button', 'btn btn-primary', 'Rematch');
      rematchBtn.type = 'button';
      rematchBtn.addEventListener('click', () => callbacks.onRematch());
      actions.appendChild(rematchBtn);
    }
    const newGameBtn = createElement('button', callbacks.onRematch ? 'btn' : 'btn btn-primary', 'New Game');
    newGameBtn.type = 'button';
    newGameBtn.addEventListener('click', () => callbacks.onNewGame && callbacks.onNewGame());
    actions.appendChild(newGameBtn);
    card.appendChild(actions);

    container.appendChild(card);
  }

  /**
   * Mount full interactive app into root element.
   * @param {HTMLElement} root
   * @param {{ dictionary?: Set<string>|null, dictionaryUrl?: string }} [options]
   */
  function mount(root, options = {}) {
    if (!Engine) {
      throw new Error('LetterloomEngine must be loaded before LetterloomUI.');
    }

    clearElement(root);
    root.classList.add('letterloom-app');

    /** @type {object|null} */
    let game = null;
    let selectedTileId = null;
    /** @type {PendingPlacement[]} */
    let pendingPlacements = [];
    let exchangeMode = false;
    /** @type {number[]} */
    let exchangeTileIds = [];
    let message = '';
    let boardFocus = { row: Engine.CENTER_ROW, col: Engine.CENTER_COL };
    /** @type {{ kind: string, row?: number, col?: number, tileId?: number, id?: string }|null} */
    let lastFocus = null;
    let lastAnnouncedTurn = '';
    let dialogOpen = false;

    const skipNav = createElement('nav', 'skip-nav');
    skipNav.setAttribute('aria-label', 'Skip links');
    const skipRack = createElement('a', 'skip-link', 'Skip to rack');
    skipRack.href = '#letterloom-rack';
    const skipControls = createElement('a', 'skip-link', 'Skip to controls');
    skipControls.href = '#letterloom-controls';
    skipNav.appendChild(skipRack);
    skipNav.appendChild(skipControls);

    const livePolite = createElement('div', 'sr-only');
    livePolite.setAttribute('aria-live', 'polite');
    livePolite.setAttribute('aria-atomic', 'true');
    const liveAssertive = createElement('div', 'sr-only');
    liveAssertive.setAttribute('role', 'alert');

    const setupEl = createElement('div', 'app-setup');
    setupEl.setAttribute('role', 'main');
    const gameEl = createElement('div', 'app-game hidden');
    gameEl.setAttribute('role', 'main');
    const overlayEl = createElement('div', 'app-overlay hidden');
    const dialogHost = createElement('div', 'app-dialog-host hidden');

    const boardScroll = createElement('div', 'board-scroll');
    const boardContainer = createElement('div', 'board-container');
    boardScroll.appendChild(boardContainer);
    const thinkBanner = createElement('div', 'computer-think-banner hidden');
    thinkBanner.setAttribute('role', 'status');
    thinkBanner.setAttribute('aria-live', 'polite');
    const directionContainer = createElement('div', 'direction-container');
    const rackContainer = createElement('div', 'rack-container');
    const statusContainer = createElement('div', 'status-container');
    const previewContainer = createElement('div', 'preview-container');
    const controlsContainer = createElement('div', 'controls-container');
    controlsContainer.id = 'letterloom-controls';
    const saveContainer = createElement('div', 'save-container');
    const messageEl = createElement('div', 'app-message hidden');
    messageEl.setAttribute('role', 'status');
    messageEl.setAttribute('aria-live', 'polite');
    messageEl.setAttribute('aria-atomic', 'true');
    let activeSaveId = null;
    let activeSaveName = null;
    let lastSavedAt = null;
    let computerThinking = false;
    let thinkRequestId = 0;
    let aiWorker = null;
    let aiWorkerReady = false;
    let aiWorkerFailed = false;
    let localAiIndex = null;
    let pendingThink = null;
    let inflightThink = null;
    let thinkStartedAt = 0;
    let takeBackSnapshot = null;
    let coachRequestId = 0;
    let coachKind = null;
    let coachThen = null;
    let coachContext = null;
    let coachBusy = false;
    let pendingCoach = null;
    let hintRestore = null;

    function coachPayloadId(id) {
      return `coach-${id}`;
    }

    function parseCoachRequestId(requestId) {
      if (typeof requestId === 'string' && requestId.indexOf('coach-') === 0) {
        return Number(requestId.slice(6));
      }
      return NaN;
    }

    const AI = global.LetterloomAI;

    const gameTitle = createElement('h1', 'sr-only', 'Letterloom');
    const mainArea = createElement('div', 'game-main');
    const boardArea = createElement('div', 'board-area');
    boardArea.appendChild(boardScroll);
    boardArea.appendChild(thinkBanner);
    boardArea.appendChild(directionContainer);
    boardArea.appendChild(rackContainer);
    mainArea.appendChild(boardArea);

    const sidebar = createElement('div', 'game-sidebar');
    sidebar.setAttribute('aria-label', 'Game controls and status');
    sidebar.appendChild(controlsContainer);
    sidebar.appendChild(previewContainer);
    sidebar.appendChild(statusContainer);
    sidebar.appendChild(saveContainer);
    mainArea.appendChild(sidebar);

    gameEl.appendChild(gameTitle);
    gameEl.appendChild(mainArea);
    gameEl.appendChild(messageEl);

    root.appendChild(skipNav);
    root.appendChild(livePolite);
    root.appendChild(liveAssertive);
    root.appendChild(setupEl);
    root.appendChild(gameEl);
    root.appendChild(overlayEl);
    root.appendChild(dialogHost);

    function announce(text, assertive = false) {
      if (!text) return;
      const region = assertive ? liveAssertive : livePolite;
      region.textContent = '';
      global.requestAnimationFrame(() => {
        region.textContent = text;
      });
    }

    function rememberFocus() {
      const el = global.document && global.document.activeElement;
      if (!el || !root.contains(el)) return;
      if (el.classList.contains('board-cell')) {
        lastFocus = { kind: 'cell', row: Number(el.dataset.row), col: Number(el.dataset.col) };
      } else if (el.classList.contains('rack-tile')) {
        lastFocus = { kind: 'rack', tileId: Number(el.dataset.tileId) };
      } else if (el.dataset.focusId) {
        lastFocus = { kind: 'id', id: el.dataset.focusId };
      }
    }

    function restoreFocus() {
      if (!lastFocus || dialogOpen) return;
      let el = null;
      if (lastFocus.kind === 'cell') {
        el = boardContainer.querySelector(
          `[data-row="${lastFocus.row}"][data-col="${lastFocus.col}"]`
        );
      } else if (lastFocus.kind === 'rack') {
        el = rackContainer.querySelector(`[data-tile-id="${lastFocus.tileId}"]`);
      } else if (lastFocus.kind === 'id') {
        el = root.querySelector(`[data-focus-id="${lastFocus.id}"]`);
      }
      if (el) el.focus();
    }

    function getFocusable(container) {
      return Array.from(
        container.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])'
        )
      );
    }

    function openModal(config) {
      return new Promise((resolve) => {
        const opener =
          global.document && global.document.activeElement && root.contains(global.document.activeElement)
            ? global.document.activeElement
            : null;
        rememberFocus();
        dialogOpen = true;
        clearElement(dialogHost);
        dialogHost.classList.remove('hidden');

        const backdrop = createElement('div', 'app-overlay');
        const dialog = createElement('div', 'app-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'letterloom-dialog-title');

        const title = createElement('h2', 'app-dialog-title', config.title);
        title.id = 'letterloom-dialog-title';
        if (config.mode === 'info') {
          title.tabIndex = -1;
        }
        dialog.appendChild(title);

        if (config.message) {
          const msg = createElement('p', 'app-dialog-message', config.message);
          msg.id = 'letterloom-dialog-desc';
          dialog.setAttribute('aria-describedby', msg.id);
          dialog.appendChild(msg);
        }

        let input = null;
        if (config.mode === 'prompt') {
          const field = createElement('div', 'form-field');
          const label = createElement('label', null, config.inputLabel || 'Name');
          label.htmlFor = 'letterloom-dialog-input';
          input = createElement('input', 'setup-input');
          input.id = 'letterloom-dialog-input';
          input.type = 'text';
          input.value = config.inputDefault || '';
          input.maxLength = config.maxLength || 40;
          field.appendChild(label);
          field.appendChild(input);
          dialog.appendChild(field);
        }

        if (config.mode === 'letters') {
          const picker = createElement('div', 'letter-picker');
          picker.setAttribute('role', 'group');
          picker.setAttribute('aria-label', 'Choose a letter');
          for (let i = 0; i < 26; i += 1) {
            const letter = String.fromCharCode(65 + i);
            const btn = createElement('button', 'btn', letter);
            btn.type = 'button';
            btn.setAttribute('aria-label', `Letter ${letter}`);
            btn.addEventListener('click', () => close(letter));
            picker.appendChild(btn);
          }
          dialog.appendChild(picker);
        }

        if (config.body) {
          if (!config.body.id) {
            config.body.id = 'letterloom-dialog-body';
          }
          if (!dialog.getAttribute('aria-describedby')) {
            dialog.setAttribute('aria-describedby', config.body.id);
          }
          dialog.appendChild(config.body);
        }

        const actions = createElement('div', 'app-dialog-actions');
        const cancelBtn = createElement('button', 'btn', config.cancelLabel || 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', () => close(config.mode === 'confirm' ? false : null));
        actions.appendChild(cancelBtn);

        if (config.mode !== 'letters' && config.mode !== 'info') {
          const confirmBtn = createElement(
            'button',
            config.danger ? 'btn btn-danger' : 'btn btn-primary',
            config.confirmLabel || 'OK'
          );
          confirmBtn.type = 'button';
          confirmBtn.addEventListener('click', () => {
            if (config.mode === 'prompt') {
              close((input && input.value.trim()) || config.inputDefault || '');
              return;
            }
            close(true);
          });
          actions.appendChild(confirmBtn);
        }

        dialog.appendChild(actions);
        backdrop.appendChild(dialog);
        dialogHost.appendChild(backdrop);

        if (config.mode === 'info') {
          backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) close(null);
          });
        }

        setupEl.inert = true;
        gameEl.inert = true;
        overlayEl.inert = true;
        skipNav.inert = true;

        function close(value) {
          global.document.removeEventListener('keydown', onKey);
          dialogHost.classList.add('hidden');
          clearElement(dialogHost);
          setupEl.inert = false;
          gameEl.inert = Boolean(game && game.status === 'ended');
          overlayEl.inert = false;
          skipNav.inert = false;
          dialogOpen = false;
          resolve(value);
          if (opener && opener.isConnected && typeof opener.focus === 'function' && !opener.disabled) {
            opener.focus();
          } else {
            restoreFocus();
          }
        }

        function onKey(event) {
          if (event.key === 'Escape') {
            event.preventDefault();
            close(config.mode === 'confirm' ? false : null);
            return;
          }
          if (event.key !== 'Tab') return;
          const focusable = getFocusable(dialog);
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = global.document.activeElement;
          if (event.shiftKey && (active === first || active === title)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
          } else if (!event.shiftKey && active === title) {
            event.preventDefault();
            first.focus();
          }
        }

        global.document.addEventListener('keydown', onKey);

        const initial =
          (config.mode === 'info' && title) ||
          input ||
          dialog.querySelector(config.mode === 'letters' ? '.letter-picker button' : '.btn-primary') ||
          cancelBtn;
        if (initial) initial.focus();
      });
    }

    function showMessage(text, isError = false) {
      message = text;
      if (text) {
        messageEl.textContent = text;
        messageEl.classList.remove('hidden');
        messageEl.classList.toggle('error', isError);
        announce(text, isError);
      } else {
        messageEl.classList.add('hidden');
        messageEl.textContent = '';
      }
    }

    function resetTurnState() {
      selectedTileId = null;
      pendingPlacements = [];
      exchangeMode = false;
      exchangeTileIds = [];
      message = '';
      messageEl.classList.add('hidden');
    }

    function promptBlankLetter() {
      return openModal({
        mode: 'letters',
        title: 'Blank tile',
        message: 'Choose the letter this blank should represent.',
        cancelLabel: 'Cancel',
      });
    }

    function isHumanLocked() {
      return Boolean(
        computerThinking || coachBusy || (game && Engine.isComputerTurn(game))
      );
    }

    function isCoachEnabled() {
      return Boolean(game && game.mode === 'computer' && game.coachMode);
    }

    function clearTakeBack() {
      takeBackSnapshot = null;
    }

    function captureTakeBackPoint() {
      const previous = takeBackSnapshot;
      if (!game) {
        takeBackSnapshot = null;
        return previous;
      }
      const { dictionary, ...serializable } = game;
      takeBackSnapshot = {
        game: JSON.parse(JSON.stringify(serializable)),
        actorIndex: game.currentPlayerIndex,
      };
      return previous;
    }

    function cancelCoach() {
      coachRequestId += 1;
      coachKind = null;
      coachThen = null;
      coachContext = null;
      coachBusy = false;
      pendingCoach = null;
      hintRestore = null;
    }

    function humanPlayerIndex() {
      if (!game || game.mode !== 'computer') return game ? game.currentPlayerIndex : 0;
      return game.computerSeat === 0 ? 1 : 0;
    }

    function cancelComputerTurn() {
      thinkRequestId += 1;
      computerThinking = false;
      pendingThink = null;
      inflightThink = null;
      thinkStartedAt = 0;
      cancelCoach();
      if (root) root.classList.remove('computer-thinking');
    }

    function ensureLocalIndex() {
      if (localAiIndex || !AI || !options.dictionary) return localAiIndex;
      localAiIndex = AI.buildIndex(options.dictionary);
      return localAiIndex;
    }

    function handleWorkerMessage(event) {
      const msg = event.data || {};
      if (msg.type === 'ready') {
        aiWorkerReady = true;
        if (pendingCoach && pendingCoach.requestId === coachPayloadId(coachRequestId) && aiWorker) {
          const queued = pendingCoach;
          pendingCoach = null;
          aiWorker.postMessage(queued);
        } else if (pendingThink && pendingThink.requestId === thinkRequestId && computerThinking && aiWorker) {
          const queued = pendingThink;
          pendingThink = null;
          inflightThink = queued;
          aiWorker.postMessage(queued);
        }
        return;
      }
      if (msg.purpose === 'coach' || parseCoachRequestId(msg.requestId) === coachRequestId) {
        const id = parseCoachRequestId(msg.requestId);
        if (id !== coachRequestId) return;
        if (msg.type === 'error') {
          finishCoachRequest(null, msg.error || 'Hint search failed.');
          return;
        }
        if (msg.type === 'result') {
          finishCoachRequest(msg.result);
        }
        return;
      }
      if (msg.requestId !== thinkRequestId) return;
      if (msg.type === 'error') {
        finishComputerTurn(null, msg.error || 'Computer search failed.');
        return;
      }
      if (msg.type === 'result') {
        finishComputerTurn(msg.result);
      }
    }

    function ensureAiWorker() {
      if (aiWorkerFailed || typeof global.Worker !== 'function') return null;
      if (aiWorker) return aiWorker;
      try {
        aiWorker = new Worker('js/ai-worker.js');
        aiWorker.addEventListener('message', handleWorkerMessage);
        aiWorker.addEventListener('error', () => {
          aiWorkerReady = false;
          aiWorkerFailed = true;
          if (aiWorker) {
            try {
              aiWorker.terminate();
            } catch (err) {
              /* ignore */
            }
          }
          aiWorker = null;
          if (coachBusy && pendingCoach && pendingCoach.requestId === coachPayloadId(coachRequestId)) {
            const queued = pendingCoach;
            pendingCoach = null;
            runCoachLocal(queued.requestId, queued.snapshot, queued.purpose);
          } else if (computerThinking && inflightThink && inflightThink.requestId === thinkRequestId) {
            const queued = inflightThink;
            pendingThink = null;
            inflightThink = null;
            runComputerTurnLocal(queued.requestId, queued.snapshot, queued.difficulty, queued.seed);
          } else if (computerThinking) {
            finishComputerTurn(null, 'Computer worker failed.');
          } else if (coachBusy) {
            finishCoachRequest(null, 'Computer worker failed.');
          }
        });
        if (options.dictionary) {
          aiWorker.postMessage({ type: 'init', words: Array.from(options.dictionary) });
        }
      } catch (err) {
        console.warn('Could not start AI worker:', err);
        aiWorker = null;
        aiWorkerReady = false;
        aiWorkerFailed = true;
      }
      return aiWorker;
    }

    function applyComputerAction(action) {
      if (!game || !action) return { ok: false, error: 'No computer action.' };

      if (action.type === 'play') {
        return Engine.applyMove(game, action.placements, action.direction);
      }
      if (action.type === 'exchange') {
        return Engine.exchangeTiles(game, action.tileIds);
      }
      return Engine.passTurn(game);
    }

    function finishComputerTurn(action, failureMessage) {
      const requestId = thinkRequestId;
      const elapsed = thinkStartedAt ? Date.now() - thinkStartedAt : 700;
      const wait = Math.max(0, 700 - elapsed);
      if (wait > 0) {
        global.setTimeout(() => {
          if (requestId !== thinkRequestId) return;
          commitComputerTurn(action, failureMessage);
        }, wait);
        return;
      }
      commitComputerTurn(action, failureMessage);
    }

    function commitComputerTurn(action, failureMessage) {
      if (!game || !Engine.isComputerTurn(game)) {
        computerThinking = false;
        root.classList.remove('computer-thinking');
        return;
      }

      computerThinking = false;
      pendingThink = null;
      inflightThink = null;
      thinkStartedAt = 0;
      root.classList.remove('computer-thinking');
      resetTurnState();

      const computer = game.players[game.computerSeat];
      let result;

      if (!action) {
        result = Engine.passTurn(game);
        showMessage(
          failureMessage
            ? `${failureMessage} ${computer.name} passes.`
            : `${computer.name} could not move and passed.`,
          Boolean(failureMessage)
        );
      } else {
        result = applyComputerAction(action);
        if (!result.ok) {
          result = Engine.passTurn(game);
          showMessage(
            `${computer.name} attempted an invalid move and passed.`,
            true
          );
        } else if (AI) {
          showMessage(AI.explainAction(action, computer.name));
        } else if (action.type === 'play') {
          showMessage(
            `${computer.name} played ${(action.words || []).join(', ')} for ${action.score} points.`
          );
        } else if (action.type === 'exchange') {
          showMessage(`${computer.name} exchanged ${(action.tileIds || []).length} tile(s).`);
        } else {
          showMessage(`${computer.name} passed.`);
        }
      }

      if (result && result.endResult && result.endResult.ended) {
        showGameOver();
      }

      refresh();
      maybeStartComputerTurn();
    }

    function runComputerTurnLocal(requestId, snapshot, difficulty, seed) {
      global.setTimeout(() => {
        if (requestId !== thinkRequestId) return;
        try {
          const index = ensureLocalIndex();
          if (!index || !AI) {
            finishComputerTurn(null, 'Computer opponent is unavailable.');
            return;
          }
          const result = AI.decideTurn(snapshot, {
            difficulty,
            seed,
            index,
            engine: Engine,
          });
          if (requestId !== thinkRequestId) return;
          finishComputerTurn(result);
        } catch (err) {
          if (requestId !== thinkRequestId) return;
          finishComputerTurn(null, err.message || 'Computer search failed.');
        }
      }, 0);
    }

    function maybeStartComputerTurn() {
      if (!game || !Engine.isComputerTurn(game) || dialogOpen || computerThinking) return;

      resetTurnState();
      computerThinking = true;
      thinkStartedAt = Date.now();
      root.classList.add('computer-thinking');
      const requestId = (thinkRequestId += 1);
      const computer = game.players[game.computerSeat];
      showMessage(`${computer.name} is thinking…`);
      refresh();

      const snapshot = AI
        ? AI.publicSnapshot(game, game.computerSeat)
        : {
            board: game.board,
            rack: game.players[game.computerSeat].rack,
            bagCount: game.bag.length,
            isFirstMove: Boolean(game.isFirstMove),
            status: game.status,
            turnNumber: game.turnNumber,
          };

      const seed = AI
        ? AI.mixSeed(game.computerSeed, game.turnNumber)
        : game.turnNumber;
      const difficulty = game.computerDifficulty || 'medium';
      const payload = {
        type: 'think',
        requestId,
        purpose: 'think',
        snapshot,
        difficulty,
        seed,
      };
      inflightThink = payload;
      const worker = ensureAiWorker();

      if (worker) {
        if (aiWorkerReady) {
          try {
            worker.postMessage(payload);
            return;
          } catch (err) {
            console.warn('AI worker postMessage failed:', err);
          }
        } else {
          pendingThink = payload;
          global.setTimeout(() => {
            if (requestId !== thinkRequestId || !computerThinking) return;
            if (!aiWorkerReady) {
              pendingThink = null;
              inflightThink = null;
              runComputerTurnLocal(requestId, snapshot, difficulty, seed);
            }
          }, 2500);
          return;
        }
      }

      runComputerTurnLocal(requestId, snapshot, difficulty, seed);
    }

    function describeExchangeTiles(tileIds, rack) {
      const tiles = (tileIds || []).map((id) => (rack || []).find((tile) => tile.id === id)).filter(Boolean);
      if (tiles.length === 0) return `${(tileIds || []).length} tile(s)`;
      return tiles.map((tile) => (tile.isBlank ? '?' : tile.letter)).join(', ');
    }

    function applyHintAction(action) {
      if (!game || !action) {
        showMessage('No hint available.', true);
        return;
      }

      if (action.type === 'play') {
        pendingPlacements = (action.placements || []).map((placement) => {
          const next = { row: placement.row, col: placement.col, tileId: placement.tileId };
          if (placement.letter) next.letter = placement.letter;
          return next;
        });
        selectedTileId = null;
        exchangeMode = false;
        exchangeTileIds = [];
        showMessage(
          `Hint: ${(action.words || []).join(', ')} for ${action.score} points. Play Word or Clear.`
        );
        return;
      }

      if (action.type === 'exchange') {
        const human = game.players[humanPlayerIndex()];
        const letters = describeExchangeTiles(action.tileIds, human && human.rack);
        if (game.bag.length >= Engine.MIN_BAG_FOR_EXCHANGE) {
          pendingPlacements = [];
          selectedTileId = null;
          exchangeMode = true;
          exchangeTileIds = (action.tileIds || []).slice();
          showMessage(`No legal play — exchange ${letters}, then confirm.`);
        } else {
          showMessage(`No legal play — exchange ${letters}.`);
        }
        return;
      }

      showMessage('No legal play or exchange.');
    }

    function recordCoachFromAction(action, context) {
      if (!game || !action || !context) return;
      if (action.type === 'exchange') {
        Engine.recordCoachNote(game, {
          turnNumber: context.turnNumber,
          playerIndex: context.playerIndex,
          action: 'exchange',
          exchangeLetters: describeExchangeTiles(
            action.tileIds,
            context.rack || []
          ),
        });
        return;
      }
      if (action.type === 'pass') {
        Engine.recordCoachNote(game, {
          turnNumber: context.turnNumber,
          playerIndex: context.playerIndex,
          action: 'pass',
        });
        return;
      }
      Engine.recordCoachNote(game, {
        turnNumber: context.turnNumber,
        playerIndex: context.playerIndex,
        action: 'play',
        words: action.words || [],
        score: action.score,
      });
    }

    function finishCoachRequest(action, failureMessage) {
      const kind = coachKind;
      const then = coachThen;
      const context = coachContext;
      coachKind = null;
      coachThen = null;
      coachContext = null;
      coachBusy = false;
      pendingCoach = null;

      if (kind === 'hint') {
        if (failureMessage) {
          restoreHintStaging();
          showMessage(failureMessage, true);
        } else {
          hintRestore = null;
          applyHintAction(action);
        }
        refresh();
        return;
      }

      if (kind === 'review' && action && !failureMessage) {
        recordCoachFromAction(action, context);
      }

      if (then === 'gameover') {
        showGameOver();
        refresh();
        return;
      }

      refresh();
      maybeStartComputerTurn();
    }

    function runCoachLocal(requestId, snapshot, kind) {
      const numericId = typeof requestId === 'string' ? parseCoachRequestId(requestId) : requestId;
      global.setTimeout(() => {
        if (numericId !== coachRequestId) return;
        try {
          const index = ensureLocalIndex();
          if (!index || !AI) {
            finishCoachRequest(null, 'Coach is unavailable.');
            return;
          }
          const result = AI.decideTurn(snapshot, {
            difficulty: 'hard',
            seed: 1,
            index,
            engine: Engine,
          });
          if (numericId !== coachRequestId) return;
          finishCoachRequest(result);
        } catch (err) {
          if (numericId !== coachRequestId) return;
          finishCoachRequest(null, err.message || 'Hint search failed.');
        }
      }, 0);
    }

    function sendCoachRequest(kind, snapshot, extras = {}) {
      coachKind = kind;
      coachThen = extras.then || null;
      coachContext = extras.context || null;

      if (!game || !AI) {
        finishCoachRequest(null, 'Coach is unavailable.');
        return;
      }

      const requestId = (coachRequestId += 1);
      coachBusy = true;

      const payload = {
        type: 'think',
        requestId: coachPayloadId(requestId),
        purpose: 'coach',
        snapshot,
        difficulty: 'hard',
        seed: 1,
      };
      pendingCoach = payload;

      if (kind === 'hint') {
        showMessage('Looking for a play…');
        refresh();
      } else {
        showMessage('Checking the best available play…');
        refresh();
      }

      const worker = ensureAiWorker();
      if (worker) {
        if (aiWorkerReady) {
          try {
            pendingCoach = null;
            worker.postMessage(payload);
            return;
          } catch (err) {
            console.warn('Coach worker postMessage failed:', err);
          }
        } else {
          global.setTimeout(() => {
            if (requestId !== coachRequestId) return;
            if (!aiWorkerReady) {
              pendingCoach = null;
              runCoachLocal(requestId, snapshot, kind);
            }
          }, 2500);
          return;
        }
      }

      pendingCoach = null;
      runCoachLocal(requestId, snapshot, kind);
    }

    function clonePublicSnapshot(seat) {
      if (!game) return null;
      const raw = AI
        ? AI.publicSnapshot(game, seat)
        : {
            board: game.board,
            rack: game.players[seat].rack,
            bagCount: game.bag.length,
            isFirstMove: Boolean(game.isFirstMove),
            status: game.status,
            turnNumber: game.turnNumber,
          };
      return JSON.parse(JSON.stringify(raw));
    }

    function beginCoachReview() {
      if (!isCoachEnabled() || !AI) return null;
      const seat = game.currentPlayerIndex;
      const snapshot = clonePublicSnapshot(seat);
      return {
        snapshot,
        context: {
          turnNumber: game.turnNumber,
          playerIndex: seat,
          rack: snapshot.rack,
        },
      };
    }

    function afterHumanCommit(result, review) {
      resetTurnState();

      if (result && result.endResult && result.endResult.ended) {
        if (review) {
          sendCoachRequest('review', review.snapshot, {
            then: 'gameover',
            context: review.context,
          });
          return;
        }
        showGameOver();
        refresh();
        return;
      }

      refresh();

      if (review) {
        sendCoachRequest('review', review.snapshot, {
          then: 'computer',
          context: review.context,
        });
        return;
      }

      maybeStartComputerTurn();
    }

    async function handleBoardClick(row, col) {
      if (!game || game.status !== 'playing' || exchangeMode || dialogOpen || isHumanLocked()) return;

      boardFocus = { row, col };
      lastFocus = { kind: 'cell', row, col };

      const existingPending = pendingAt(pendingPlacements, row, col);
      if (existingPending) {
        pendingPlacements = pendingPlacements.filter(
          (p) => !(p.row === row && p.col === col)
        );
        if (selectedTileId === null) {
          selectedTileId = existingPending.tileId;
        }
        refresh();
        return;
      }

      if (game.board[row][col]) return;

      if (selectedTileId === null) return;

      const rackTile = getRackTile(game, selectedTileId);
      if (!rackTile) return;

      if (pendingPlacements.some((p) => p.tileId === selectedTileId)) return;

      const placement = { row, col, tileId: selectedTileId };

      if (rackTile.isBlank) {
        const letter = await promptBlankLetter();
        if (!letter) return;
        placement.letter = letter;
      }

      pendingPlacements.push(placement);
      selectedTileId = null;
      showMessage('');
      refresh();
    }

    function handleRackClick(tileId) {
      if (!game || game.status !== 'playing' || isHumanLocked()) return;

      if (exchangeMode) {
        if (exchangeTileIds.includes(tileId)) {
          exchangeTileIds = exchangeTileIds.filter((id) => id !== tileId);
        } else {
          exchangeTileIds.push(tileId);
        }
        refresh();
        return;
      }

      const inPending = pendingPlacements.some((p) => p.tileId === tileId);
      if (inPending) return;

      selectedTileId = selectedTileId === tileId ? null : tileId;
      refresh();
    }

    function shuffleRack() {
      if (!game || exchangeMode || isHumanLocked()) return;
      const player = game.players[game.currentPlayerIndex];
      Engine.shuffleInPlace(player.rack);
      announce('Rack shuffled.');
      refresh();
    }

    function handlePlay() {
      if (!game || pendingPlacements.length === 0 || isHumanLocked()) return;

      const resolved = resolvePlacementDirection(game, pendingPlacements);
      if (!resolved.direction) {
        showMessage('Tiles must form a straight line — across or down.', true);
        refresh();
        return;
      }

      const previousTakeBack = captureTakeBackPoint();
      const review = beginCoachReview();
      const result = Engine.applyMove(game, pendingPlacements, resolved.direction);
      if (!result.ok) {
        takeBackSnapshot = previousTakeBack;
        showMessage(result.error, true);
        refresh();
        return;
      }

      showMessage(
        `Played for ${result.score.total} points: ${result.words.map((w) => w.word).join(', ')}`
      );
      afterHumanCommit(result, review);
    }

    function handleClear() {
      if (isHumanLocked()) return;
      pendingPlacements = [];
      selectedTileId = null;
      showMessage('');
      refresh();
    }

    function handlePass() {
      if (!game || isHumanLocked()) return;
      if (pendingPlacements.length > 0) {
        showMessage('Clear your placements before passing.', true);
        return;
      }

      const previousTakeBack = captureTakeBackPoint();
      const review = beginCoachReview();
      const result = Engine.passTurn(game);
      if (!result.ok) {
        takeBackSnapshot = previousTakeBack;
        showMessage(result.error, true);
        return;
      }

      showMessage('Turn passed.');
      afterHumanCommit(result, review);
    }

    function handleExchangeStart() {
      if (!game || isHumanLocked()) return;
      if (game.bag.length < Engine.MIN_BAG_FOR_EXCHANGE) {
        showMessage(
          `Cannot exchange — fewer than ${Engine.MIN_BAG_FOR_EXCHANGE} tiles in the bag.`,
          true
        );
        return;
      }
      exchangeMode = true;
      exchangeTileIds = [];
      pendingPlacements = [];
      selectedTileId = null;
      showMessage('Select tiles to exchange, then confirm.');
      refresh();
    }

    function handleConfirmExchange() {
      if (!game || exchangeTileIds.length === 0) {
        showMessage('Select at least one tile to exchange.', true);
        return;
      }

      const previousTakeBack = captureTakeBackPoint();
      const review = beginCoachReview();
      const result = Engine.exchangeTiles(game, exchangeTileIds);
      if (!result.ok) {
        takeBackSnapshot = previousTakeBack;
        showMessage(result.error, true);
        return;
      }

      showMessage(`Exchanged ${result.exchanged} tile(s).`);
      afterHumanCommit(result, review);
    }

    function handleCancelExchange() {
      exchangeMode = false;
      exchangeTileIds = [];
      showMessage('');
      refresh();
    }

    function restoreHintStaging() {
      if (!hintRestore) return;
      pendingPlacements = hintRestore.pendingPlacements;
      selectedTileId = hintRestore.selectedTileId;
      exchangeMode = hintRestore.exchangeMode;
      exchangeTileIds = hintRestore.exchangeTileIds;
      hintRestore = null;
    }

    function handleHint() {
      if (!game || !isCoachEnabled() || isHumanLocked() || exchangeMode || game.status !== 'playing') {
        return;
      }
      hintRestore = {
        pendingPlacements: pendingPlacements.slice(),
        selectedTileId,
        exchangeMode,
        exchangeTileIds: exchangeTileIds.slice(),
      };
      pendingPlacements = [];
      selectedTileId = null;
      const snapshot = clonePublicSnapshot(humanPlayerIndex());
      if (!snapshot) {
        restoreHintStaging();
        showMessage('Hint is unavailable.', true);
        refresh();
        return;
      }
      sendCoachRequest('hint', snapshot);
    }

    async function handleTakeBack() {
      if (!game || !takeBackSnapshot) return;
      if (game.status === 'playing' && isHumanLocked()) return;
      if (game.status !== 'playing' && game.status !== 'ended') return;

      const confirmed = await openModal({
        mode: 'confirm',
        title: 'Take back',
        message:
          game.mode === 'computer'
            ? 'Undo your last turn and the computer’s reply? The bag is reshuffled.'
            : 'Undo the last turn? The bag is reshuffled.',
        confirmLabel: 'Take Back',
        cancelLabel: 'Cancel',
      });
      if (!confirmed || !takeBackSnapshot || !game) return;

      cancelComputerTurn();
      const undone = (game.history || []).slice(
        (takeBackSnapshot.game.history || []).length
      );
      const actorIndex = takeBackSnapshot.actorIndex;
      game = JSON.parse(JSON.stringify(takeBackSnapshot.game));
      Engine.normalizeGameMeta(game);
      game.dictionary = options.dictionary || null;
      Engine.shuffleInPlace(game.bag);
      Engine.recordTakeBack(game, undone, actorIndex);
      clearTakeBack();
      resetTurnState();
      overlayEl.classList.add('hidden');
      overlayEl.removeAttribute('role');
      overlayEl.removeAttribute('aria-modal');
      overlayEl.removeAttribute('aria-labelledby');
      gameEl.inert = false;
      showMessage('Last turn taken back. The bag was reshuffled.');
      persistState();
      refresh();
    }

    function handleRematch() {
      if (!game) return;
      const names = game.players.map((player) => player.name);
      const setup = {
        mode: game.mode,
        computerSeat: game.computerSeat,
        difficulty: game.computerDifficulty,
        coachMode: Boolean(game.coachMode),
      };
      if (Number.isInteger(game.openingPlayerIndex)) {
        setup.firstPlayerIndex = (game.openingPlayerIndex + 1) % names.length;
      }
      overlayEl.classList.add('hidden');
      overlayEl.removeAttribute('role');
      overlayEl.removeAttribute('aria-modal');
      gameEl.inert = false;
      startGame(names, setup);
    }

    function getUiState() {
      return {
        pendingPlacements,
        selectedTileId,
        exchangeMode,
        exchangeTileIds,
      };
    }

    function persistState() {
      if (!game || !Storage || !activeSaveId) return;
      const result = Storage.saveGame(game, getUiState(), {
        id: activeSaveId,
        name: activeSaveName,
      });
      if (result.ok) {
        lastSavedAt = result.snapshot.savedAt;
        activeSaveName = result.snapshot.name;
      }
    }

    function restoreFromSnapshot(snapshot, saveId) {
      if (!Storage || !Storage.validateSnapshot(snapshot)) {
        showMessage('Could not restore saved game.', true);
        return false;
      }

      cancelComputerTurn();
      clearTakeBack();
      game = snapshot.game;
      Engine.normalizeGameMeta(game);
      game.dictionary = options.dictionary || null;

      const ui = snapshot.ui || {};
      if (Engine.isComputerTurn(game)) {
        pendingPlacements = [];
        selectedTileId = null;
        exchangeMode = false;
        exchangeTileIds = [];
      } else {
        pendingPlacements = ui.pendingPlacements || [];
        selectedTileId = ui.selectedTileId ?? null;
        exchangeMode = Boolean(ui.exchangeMode);
        exchangeTileIds = ui.exchangeTileIds || [];
      }

      activeSaveId = saveId || snapshot.id || null;
      activeSaveName = snapshot.name || Storage.buildDefaultName(game);
      lastSavedAt = snapshot.savedAt;

      setupEl.classList.add('hidden');
      gameEl.classList.remove('hidden');
      overlayEl.classList.add('hidden');
      gameEl.inert = game.status === 'ended';
      setSetupActive(false);
      lastAnnouncedTurn = '';

      if (game.status === 'ended') {
        showGameOver();
      } else {
        const current = game.players[game.currentPlayerIndex];
        showMessage(`Loaded "${activeSaveName}" — ${current.name}'s turn.`);
      }

      refresh();
      maybeStartComputerTurn();
      return true;
    }

    function loadSavedGame(saveId) {
      if (!Storage) return;
      const snapshot = Storage.getSave(saveId);
      if (!snapshot) {
        showMessage('Save not found.', true);
        showSetup();
        return;
      }
      restoreFromSnapshot(snapshot, saveId);
    }

    async function deleteSavedGame(saveId, saveName) {
      if (!Storage) return;
      const confirmed = await openModal({
        mode: 'confirm',
        title: 'Delete save',
        message: `Delete save "${saveName || 'this game'}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        danger: true,
      });
      if (!confirmed) return;
      Storage.deleteSave(saveId);
      if (activeSaveId === saveId) {
        activeSaveId = null;
        activeSaveName = null;
        lastSavedAt = null;
      }
      showSetup();
    }

    async function handleImportFile(file) {
      if (!Storage) throw new Error('Storage module not loaded.');
      const snapshot = await Storage.readSnapshotFile(file);
      const result = Storage.importSave(snapshot);
      if (!result.ok) throw new Error(result.error || 'Import failed.');
      restoreFromSnapshot(result.snapshot, result.id);
      showMessage(`Imported "${result.snapshot.name}".`);
    }

    async function handleSave() {
      if (!game || !Storage) return;

      let name = activeSaveName;
      if (!activeSaveId) {
        const defaultName = Storage.buildDefaultName(game);
        const input = await openModal({
          mode: 'prompt',
          title: 'Save game',
          message: 'Name this save so you can find it later.',
          inputLabel: 'Save name',
          inputDefault: defaultName,
          confirmLabel: 'Save',
          cancelLabel: 'Cancel',
        });
        if (input === null) return;
        name = String(input).trim() || defaultName;
      }

      const result = Storage.saveGame(game, getUiState(), {
        id: activeSaveId,
        name,
      });

      if (!result.ok) {
        showMessage(result.error || 'Could not save game.', true);
        return;
      }

      activeSaveId = result.id;
      activeSaveName = result.snapshot.name;
      lastSavedAt = result.snapshot.savedAt;
      showMessage(`Game saved as "${activeSaveName}".`);
      refresh();
    }

    async function handleNewGame() {
      if (game && game.status === 'playing' && !activeSaveId) {
        const confirmed = await openModal({
          mode: 'confirm',
          title: 'Start a new game',
          message: 'Start a new game without saving? The current game will be lost.',
          confirmLabel: 'New Game',
          cancelLabel: 'Cancel',
        });
        if (!confirmed) return;
      }

      cancelComputerTurn();
      clearTakeBack();
      lastFocus = null;
      game = null;
      activeSaveId = null;
      activeSaveName = null;
      lastSavedAt = null;
      resetTurnState();
      overlayEl.classList.add('hidden');
      overlayEl.removeAttribute('role');
      overlayEl.removeAttribute('aria-modal');
      gameEl.inert = false;
      gameEl.classList.add('hidden');
      showSetup();
    }

    function handleExport() {
      if (!game || !Storage) return;
      const snapshot = Storage.createSnapshot(game, getUiState(), {
        id: activeSaveId,
        name: activeSaveName || Storage.buildDefaultName(game),
      });
      if (!snapshot) return;
      Storage.downloadSnapshot(snapshot);
      showMessage('Save file downloaded.');
    }

    function showGameOver() {
      persistState();
      if (Storage && Storage.recordFinishedGame) {
        Storage.recordFinishedGame(game);
      }
      renderGameOver(overlayEl, game, {
        onNewGame: handleNewGame,
        onRematch: handleRematch,
        onTakeBack: takeBackSnapshot ? handleTakeBack : null,
        onReplay: handleReplay,
      });
      overlayEl.classList.remove('hidden');
      overlayEl.setAttribute('role', 'dialog');
      overlayEl.setAttribute('aria-modal', 'true');
      overlayEl.setAttribute('aria-labelledby', 'game-over-title');
      gameEl.inert = true;
      const winner = game.players.slice().sort((a, b) => b.score - a.score)[0];
      announce(`Game over. ${winner ? `${winner.name} wins with ${winner.score} points.` : ''}`, true);
      const btn = overlayEl.querySelector('button');
      if (btn) btn.focus();
    }

    function refresh() {
      if (!game) return;

      rememberFocus();

      const locked = isHumanLocked();
      const reviewing = Boolean(coachBusy && coachKind === 'review');
      const hinting = Boolean(coachBusy && coachKind === 'hint');
      const thinking = computerThinking || (Engine.isComputerTurn(game) && !reviewing && !hinting);
      const rackPlayer = game.mode === 'computer' ? humanPlayerIndex() : game.currentPlayerIndex;
      gameEl.setAttribute('aria-busy', locked ? 'true' : 'false');
      root.classList.toggle('computer-thinking', locked);
      thinkBanner.classList.toggle('hidden', !locked);
      thinkBanner.textContent = reviewing
        ? 'Checking the best available play…'
        : hinting
          ? 'Looking for a play…'
          : thinking
            ? `${game.players[game.currentPlayerIndex].name} is thinking…`
            : '';

      const resolved = resolvePlacementDirection(game, pendingPlacements);
      const direction = resolved.direction;

      renderBoard(boardContainer, game, pendingPlacements, {
        onCellClick: locked ? null : handleBoardClick,
        focusCell: boardFocus,
        onFocusCell: (row, col) => {
          boardFocus = { row, col };
          lastFocus = { kind: 'cell', row, col };
        },
      });

      renderRack(
        rackContainer,
        game,
        exchangeMode ? exchangeTileIds : selectedTileId !== null ? [selectedTileId] : [],
        {
          exchangeMode,
          pendingTileIds: pendingPlacements.map((p) => p.tileId),
          onTileClick: locked ? null : handleRackClick,
          playerIndex: rackPlayer,
          locked,
        }
      );

      renderStatus(statusContainer, game, {
        thinking,
        onBagClick: handleUnseenTiles,
        onReplay: handleReplay,
      });
      renderDirectionHint(directionContainer, direction, pendingPlacements.length);

      const validation =
        pendingPlacements.length > 0 && direction
          ? resolved.validation || Engine.validatePlacement(game, pendingPlacements, direction)
          : { ok: false };

      renderScorePreview(
        previewContainer,
        game,
        pendingPlacements,
        direction,
        validation.ok ? validation : null
      );

      renderControls(
        controlsContainer,
        {
          onPlay: handlePlay,
          onClear: handleClear,
          onPass: handlePass,
          onShuffle: shuffleRack,
          onExchange: handleExchangeStart,
          onConfirmExchange: handleConfirmExchange,
          onCancelExchange: handleCancelExchange,
          onHint: handleHint,
          onTakeBack: handleTakeBack,
        },
        {
          exchangeMode,
          canPlay: validation.ok === true && !locked,
          canExchange: game.bag.length >= Engine.MIN_BAG_FOR_EXCHANGE && !exchangeMode && !locked,
          canHint: isCoachEnabled() && game.status === 'playing' && !exchangeMode,
          canTakeBack:
            Boolean(takeBackSnapshot) &&
            (game.status === 'playing' || game.status === 'ended') &&
            !exchangeMode,
          coachBusy,
          bagCount: game.bag.length,
          locked,
          message: thinking
            ? `${game.players[game.currentPlayerIndex].name} is thinking…`
            : coachBusy && coachKind === 'review'
              ? 'Checking the best available play…'
              : coachBusy && coachKind === 'hint'
                ? 'Looking for a play…'
            : exchangeMode
              ? 'Exchange mode — select tiles from your rack.'
              : '',
        }
      );

      renderSavePanel(saveContainer, {
        saveName: activeSaveName,
        lastSavedAt,
        onSave: handleSave,
        onNewGame: handleNewGame,
        onExport: handleExport,
        onHelp: handleHelp,
        onStats: handleLocalStats,
      });

      persistState();

      if (game.status === 'playing') {
        const current = game.players[game.currentPlayerIndex];
        const turnKey = `${game.currentPlayerIndex}-${game.turnNumber}${thinking ? '-thinking' : ''}`;
        if (turnKey !== lastAnnouncedTurn) {
          lastAnnouncedTurn = turnKey;
          announce(
            thinking
              ? `${current.name} is thinking. Turn ${game.turnNumber}.`
              : `${current.name}'s turn. Turn ${game.turnNumber}.`
          );
        }
      }

      restoreFocus();
    }

    function handleHelp() {
      const body = createElement('div');
      body.id = 'letterloom-help-body';
      appendHowToPlay(body);
      openModal({
        mode: 'info',
        title: 'How to play',
        body,
        cancelLabel: 'Close',
      });
    }

    function handleUnseenTiles() {
      if (!game || !Engine.getUnseenTiles) return;
      const unseen = Engine.getUnseenTiles(game, {
        viewerIndex: unseenViewerIndex(game),
        revealRacks: game.status === 'ended',
      });
      const body = createElement('div', 'unseen-dialog');
      body.id = 'letterloom-unseen-body';
      renderUnseenGrid(body, unseen);
      openModal({
        mode: 'info',
        title: unseen.revealed ? 'Leftover tiles' : 'Unseen tiles',
        body,
        cancelLabel: 'Close',
      });
    }

    function handleReplay() {
      if (!game) return;
      const body = createElement('div', 'replay-dialog');
      body.id = 'letterloom-replay-body';
      renderReplayLog(body, game);
      openModal({
        mode: 'info',
        title: 'Replay',
        body,
        cancelLabel: 'Close',
      });
    }

    function handleLocalStats() {
      const stats = Storage && Storage.getLocalStats ? Storage.getLocalStats() : { finished: 0, games: [] };
      const body = createElement('div', 'stats-dialog');
      body.id = 'letterloom-stats-body';
      renderLocalStats(body, stats);
      openModal({
        mode: 'info',
        title: 'Local stats',
        body,
        cancelLabel: 'Close',
      });
    }

    function startGame(playerNames, setupOptions = {}) {
      const dictionary = options.dictionary || null;
      cancelComputerTurn();
      clearTakeBack();
      game = Engine.createGame(playerNames, {
        dictionary,
        mode: setupOptions.mode,
        computerSeat: setupOptions.computerSeat,
        computerDifficulty: setupOptions.difficulty,
        computerSeed: setupOptions.computerSeed,
        coachMode: setupOptions.coachMode,
        firstPlayerIndex: setupOptions.firstPlayerIndex,
      });
      activeSaveId = null;
      activeSaveName = null;
      lastSavedAt = null;
      resetTurnState();
      setupEl.classList.add('hidden');
      gameEl.classList.remove('hidden');
      overlayEl.classList.add('hidden');
      gameEl.inert = false;
      setSetupActive(false);
      boardFocus = { row: Engine.CENTER_ROW, col: Engine.CENTER_COL };
      lastAnnouncedTurn = '';
      const first = game.players[game.currentPlayerIndex];
      showMessage(`${first.name} goes first — the first word must cover the center starting square.`);
      refresh();
      maybeStartComputerTurn();
    }

    function buildSetupCallbacks() {
      const savedGames = Storage ? Storage.listSaves() : [];
      return {
        onStart: startGame,
        onLoadSave: loadSavedGame,
        onDeleteSave: deleteSavedGame,
        onImport: handleImportFile,
        onImportError: (msg) => {
          showSetup(msg);
        },
        onHelp: handleHelp,
        onStats: handleLocalStats,
        savedGames,
      };
    }

    async function showSetup(importError) {
      cancelComputerTurn();
      setSetupActive(true);
      setupEl.classList.remove('hidden');
      gameEl.classList.add('hidden');
      clearElement(setupEl);
      setupEl.classList.add('setup-screen');
      const loadingFrame = createSetupFrame();
      const loading = createElement('p', 'setup-loading', 'Loading dictionary…');
      loading.setAttribute('role', 'status');
      loading.setAttribute('aria-live', 'polite');
      loadingFrame.main.appendChild(loading);
      setupEl.appendChild(loadingFrame.card);

      if (options.dictionaryUrl && !options.dictionary) {
        try {
          const response = await fetch(options.dictionaryUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const text = await response.text();
          options.dictionary = new Set(
            text
              .trim()
              .split('\n')
              .map((w) => w.trim().toUpperCase())
              .filter((w) => w.length >= 2 && w.length <= 15)
          );
          if (options.dictionary.size < 1000) {
            throw new Error('Dictionary too small');
          }
        } catch (err) {
          console.warn('Could not load dictionary:', err);
          clearElement(setupEl);
          setupEl.classList.add('setup-screen');
          const errFrame = createSetupFrame();
          errFrame.main.appendChild(
            createElement(
              'p',
              'setup-error',
              'Could not load the word dictionary. Start a local server from the project folder (see README).'
            )
          );
          setupEl.appendChild(errFrame.card);
          return;
        }
      }

      if (options.dictionary) {
        ensureAiWorker();
      }

      clearElement(setupEl);
      renderSetup(setupEl, buildSetupCallbacks());

      if (importError) {
        const card = setupEl.querySelector('.setup-card');
        const main = card && card.querySelector('.setup-main');
        if (card && main) {
          const err = createElement('p', 'setup-error', importError);
          err.id = 'import-error';
          err.setAttribute('role', 'alert');
          const tagline = main.querySelector('.setup-tagline');
          main.insertBefore(err, tagline || main.children[1] || null);
          const importInput = setupEl.querySelector('#import-save-file');
          if (importInput) {
            importInput.setAttribute('aria-invalid', 'true');
            importInput.setAttribute('aria-describedby', 'import-error import-save-hint');
          }
          announce(importError, true);
        }
      }
    }

    showSetup();

    return {
      getGame: () => game,
      refresh,
    };
  }

  const LetterloomUI = {
    renderBoard,
    renderRack,
    renderStatus,
    renderControls,
    renderDirectionHint,
    inferPlacementDirection,
    renderScorePreview,
    renderSetup,
    renderSavePanel,
    renderGameOver,
    renderUnseenGrid,
    renderReplayLog,
    renderLocalStats,
    formatReplayLine,
    mount,
  };

  global.LetterloomUI = LetterloomUI;
})(typeof window !== 'undefined' ? window : globalThis);