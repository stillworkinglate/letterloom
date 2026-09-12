/**
 * Letterloom UI — render layer and app controller.
 */
(function (global) {
  'use strict';

  const Engine = global.LetterloomEngine;
  const Storage = global.LetterloomStorage;
  const I18n = global.LetterloomI18n;

  function t(key, vars) {
    return I18n && I18n.t ? I18n.t(key, vars) : key;
  }

  function te(message) {
    return I18n && I18n.translateEngineError ? I18n.translateEngineError(message) : message;
  }

  function currentLanguage() {
    return I18n && I18n.getLanguage ? I18n.getLanguage() : 'en';
  }

  function premiumName(code) {
    if (code === 'TW') return t('premiumTW');
    if (code === 'DW') return t('premiumDW');
    if (code === 'TL') return t('premiumTL');
    if (code === 'DL') return t('premiumDL');
    return code;
  }

  function howToPlayItems() {
    return [
      t('help1'),
      t('help2'),
      t('help3'),
      t('help4'),
      t('help5'),
      t('help6'),
      t('help7'),
      t('help8'),
      t('help9'),
      t('help10'),
      t('help11'),
      t('help12'),
    ];
  }

  function playerNameAt(game, index, fallbackName) {
    if (fallbackName) return fallbackName;
    if (game && game.players && game.players[index]) return game.players[index].name;
    return t('player');
  }

  function formatHistoryLine(entry, game) {
    if (!entry) return '';
    const name = playerNameAt(game, entry.playerIndex, entry.playerName);
    const turn = entry.turnNumber != null ? `T${entry.turnNumber} · ` : '';

    if (entry.type === 'coach') {
      if (entry.action === 'exchange') {
        return t('bestAvailableExchange', { letters: entry.exchangeLetters || t('tiles') });
      }
      if (entry.action === 'pass') {
        return t('bestAvailablePass');
      }
      const words = (entry.words || []).join(', ') || t('aPlay');
      const score = entry.score != null ? t('forScore', { score: entry.score }) : '';
      return t('bestAvailablePlay', { words, score });
    }

    if (entry.type === 'takeback') {
      return t('tookBack', { name });
    }

    if (entry.type === 'exchange') {
      const letters = entry.exchangeLetters ? ` (${entry.exchangeLetters})` : '';
      return t('exchanged', { turn, name, n: entry.exchange, letters });
    }

    if (entry.type === 'pass') {
      return t('passed', { turn, name });
    }

    if (entry.type === 'play') {
      const words = (entry.words || []).join(', ') || t('aWord');
      return t('played', { turn, name, words, score: entry.score });
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
      if (entry.tilesPlayed === 7) bits.push(t('bingo'));
      if (entry.scoreAfter != null) bits.push(t('nowScore', { n: entry.scoreAfter }));
    }
    if (entry.rackBefore && entry.rackBefore.length) {
      bits.push(t('rack', { letters: formatRackSnapshot(entry.rackBefore) }));
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
      ? t('leftoverIntro', { n: unseen.total })
      : t('unseenIntro', { n: unseen.total });
    parent.appendChild(createElement('p', 'unseen-intro', intro));

    if (!unseen.revealed) {
      parent.appendChild(
        createElement(
          'p',
          'unseen-meta',
          t('unseenMeta', { bag: unseen.bagCount, opp: unseen.opponentCount })
        )
      );
    }

    const grid = createElement('div', 'unseen-grid');
    grid.setAttribute('role', 'list');
    grid.setAttribute(
      'aria-label',
      unseen.revealed ? t('leftoverLetterCounts') : t('unseenLetterCounts')
    );

    (unseen.letters || []).forEach((entry) => {
      const cell = createElement('div', 'unseen-cell');
      cell.setAttribute('role', 'listitem');
      if (!entry.count) cell.classList.add('unseen-gone');
      cell.setAttribute('aria-label', t('remaining', { letter: entry.letter, n: entry.count }));
      cell.appendChild(createElement('span', 'unseen-face', entry.letter));
      cell.appendChild(createElement('span', 'unseen-count', String(entry.count)));
      grid.appendChild(cell);
    });

    const blank = createElement('div', 'unseen-cell unseen-blank');
    blank.setAttribute('role', 'listitem');
    if (!unseen.blanks) blank.classList.add('unseen-gone');
    blank.setAttribute('aria-label', t('blanksRemaining', { n: unseen.blanks }));
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
      parent.appendChild(
        createElement(
          'p',
          'replay-summary',
          t('replayStats', {
            plays: stats.plays,
            bingos: stats.bingos,
            exchanges: stats.exchanges,
            passes: stats.passes,
          })
        )
      );
    }

    if (history.length === 0) {
      parent.appendChild(createElement('p', 'replay-empty', t('noReplay')));
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
          t('statsEmpty')
        )
      );
      return;
    }

    const list = createElement('ul', 'stats-list');
    list.appendChild(createElement('li', null, t('finishedGames', { n: stats.finished })));
    if (stats.computerGames > 0) {
      const record = stats.vsComputer || { wins: 0, losses: 0, ties: 0 };
      list.appendChild(
        createElement('li', null, t('vsComputer', { w: record.wins, l: record.losses, t: record.ties }))
      );
    }
    if (stats.humanGames > 0) {
      list.appendChild(createElement('li', null, t('twoPlayerGames', { n: stats.humanGames })));
    }
    list.appendChild(createElement('li', null, t('bingoCount', { n: stats.bingos })));
    if (stats.bestPlay) {
      list.appendChild(
        createElement(
          'li',
          null,
          t('bestPlay', {
            name: stats.bestPlay.playerName,
            words: (stats.bestPlay.words || []).join(', '),
            score: stats.bestPlay.score,
          })
        )
      );
    }
    parent.appendChild(list);

    if (stats.games && stats.games.length > 0) {
      parent.appendChild(createElement('h3', 'stats-subheading', t('recentGames')));
      const recent = createElement('ol', 'stats-recent');
      stats.games.slice(0, 8).forEach((entry) => {
        const item = createElement('li', 'stats-recent-item');
        const names = (entry.names || []).join(' vs ');
        const result = entry.isTie
          ? t('tie')
          : t('someoneWon', { name: entry.winnerName || t('someone') });
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
    const parts = [t('rowCol', { row: row + 1, col: col + 1 })];
    if (row === Engine.CENTER_ROW && col === Engine.CENTER_COL) {
      parts.push(t('centerSquare'));
    }
    if (premium) parts.push(premiumName(premium) || premium);
    if (placed) {
      const letter = formatTileLetter(placed) || '?';
      const blank = placed.isBlank ? t('blank') : '';
      const pts = placed.isBlank
        ? ''
        : `, ${placed.points} ${placed.points === 1 ? t('point') : t('points')}`;
      parts.push(t('occupiedLetter', { letter, blank, pts }));
    } else if (pendingDisplay) {
      const letter = formatTileLetter(pendingDisplay) || '?';
      parts.push(t('occupiedLetter', { letter, blank: '', pts: '' }));
    } else {
      parts.push(t('empty'));
    }
    return parts.join(', ');
  }

  function describeRackTile(tile, selected, exchangeMode) {
    const letter = formatTileLetter(tile);
    const parts = [letter ? t('tileLetter', { letter }) : t('blankTile')];
    if (!tile.isBlank && tile.points > 0) {
      parts.push(`${tile.points} ${tile.points === 1 ? t('point') : t('points')}`);
    }
    if (selected && exchangeMode) parts.push(t('markedExchange'));
    else if (selected) parts.push(t('selected'));
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

  function formatSaveStatus(save) {
    if (!save) return '';
    if (save.gameStatus === 'ended' || save.status === 'Game over') return t('gameOverStatus');
    if (save.currentName) return t('saveTurn', { name: save.currentName, n: save.turnNumber });
    return save.status || '';
  }

  function appendHowToPlay(parent) {
    const list = createElement('ul', 'help-list');
    howToPlayItems().forEach((item) => {
      list.appendChild(createElement('li', null, item));
    });
    parent.appendChild(list);
  }

  function letterPoints(letter, language) {
    const dist =
      Engine && Engine.getTileDistribution
        ? Engine.getTileDistribution(language || currentLanguage())
        : Engine && Engine.TILE_DISTRIBUTION;
    const info = dist && dist[letter];
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
    container.setAttribute('aria-label', t('boardLabel'));
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
      t('rackOf', { name: player.name })
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
    container.setAttribute('aria-label', t('gameStatus'));

    const current = game.players[game.currentPlayerIndex];

    const scoresEl = createElement('div', 'status-scores');
    scoresEl.appendChild(createElement('h3', 'status-subheading sr-only', t('scores')));
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
        nameWrap.appendChild(createElement('span', 'sr-only', t('currentTurn')));
      }
      item.appendChild(nameWrap);
      item.appendChild(createElement('span', 'score-value', String(player.score)));
      list.appendChild(item);
    });

    scoresEl.appendChild(list);
    container.appendChild(scoresEl);

    if (options.thinking) {
      const think = createElement('p', 'status-thinking');
      think.setAttribute('aria-live', 'polite');
      think.appendChild(createElement('span', 'status-thinking-dot', ''));
      const level = game.computerDifficulty
        ? ` (${game.computerDifficulty})`
        : '';
      think.appendChild(document.createTextNode(t('thinking', { name: current.name, level })));
      container.appendChild(think);
    }

    const bagCount = Engine.getRemainingBagCount(game);
    const bagBtn = createElement('button', 'bag-count-btn', t('inBag', { n: bagCount }));
    bagBtn.type = 'button';
    bagBtn.setAttribute('aria-haspopup', 'dialog');
    bagBtn.setAttribute(
      'aria-label',
      t('bagAria', { n: bagCount })
    );
    if (options.onBagClick) {
      bagBtn.addEventListener('click', () => options.onBagClick());
    } else {
      bagBtn.disabled = true;
    }

    if (game.status === 'playing' && !options.thinking) {
      const meta = createElement('p', 'status-meta');
      meta.appendChild(
        document.createTextNode(t('toPlay', { name: current.name, n: game.turnNumber }))
      );
      meta.appendChild(bagBtn);
      container.appendChild(meta);
    } else {
      const bagEl = createElement('p', 'status-meta');
      bagEl.appendChild(bagBtn);
      container.appendChild(bagEl);
    }

    const history = Array.isArray(game.history) ? game.history : [];
    const logEl = createElement('div', 'status-turn-log');
    logEl.appendChild(createElement('h3', 'status-subheading', t('turnLog')));

    if (history.length === 0) {
      logEl.appendChild(createElement('p', 'turn-log-empty', t('noMovesYet')));
    } else {
      const list = createElement('ol', 'turn-log-list');
      const start = Math.max(0, history.length - 40);
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
          createElement('p', 'turn-log-more', t('earlierTurns', { n: start }))
        );
      }
    }

    if (options.onReplay && history.length > 0) {
      const replayBtn = createElement('button', 'btn btn-small turn-log-replay', t('replay'));
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

    const playBtn = createElement('button', 'btn btn-primary', t('playWord'));
    playBtn.type = 'button';
    playBtn.dataset.focusId = 'play';
    playBtn.disabled = !state.canPlay || locked;
    if (!state.canPlay || locked) {
      playBtn.setAttribute('aria-describedby', 'play-disabled-reason');
    }
    playBtn.addEventListener('click', () => callbacks.onPlay && callbacks.onPlay());
    actions.appendChild(playBtn);

    const clearBtn = createElement('button', 'btn', t('clear'));
    clearBtn.type = 'button';
    clearBtn.dataset.focusId = 'clear';
    clearBtn.disabled = locked;
    clearBtn.addEventListener('click', () => callbacks.onClear && callbacks.onClear());
    actions.appendChild(clearBtn);

    const passBtn = createElement('button', 'btn', t('pass'));
    passBtn.type = 'button';
    passBtn.dataset.focusId = 'pass';
    passBtn.disabled = locked;
    passBtn.addEventListener('click', () => callbacks.onPass && callbacks.onPass());
    actions.appendChild(passBtn);

    const shuffleBtn = createElement('button', 'btn', t('shuffle'));
    shuffleBtn.type = 'button';
    shuffleBtn.dataset.focusId = 'shuffle';
    shuffleBtn.disabled = locked;
    shuffleBtn.setAttribute('aria-label', t('shuffleRack'));
    shuffleBtn.addEventListener('click', () => callbacks.onShuffle && callbacks.onShuffle());
    actions.appendChild(shuffleBtn);

    if (!state.exchangeMode) {
      const exchangeBtn = createElement('button', 'btn', t('exchange'));
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
      const hintBtn = createElement('button', 'btn btn-secondary', t('hint'));
      hintBtn.type = 'button';
      hintBtn.dataset.focusId = 'hint';
      hintBtn.disabled = locked || Boolean(state.coachBusy);
      hintBtn.title = t('hintTitle');
      hintBtn.addEventListener('click', () => callbacks.onHint && callbacks.onHint());
      actions.appendChild(hintBtn);
    }

    if (state.canTakeBack) {
      const takeBackBtn = createElement('button', 'btn', t('takeBack'));
      takeBackBtn.type = 'button';
      takeBackBtn.dataset.focusId = 'take-back';
      takeBackBtn.disabled = locked || Boolean(state.coachBusy);
      takeBackBtn.setAttribute('aria-label', t('takeBack'));
      takeBackBtn.addEventListener('click', () => callbacks.onTakeBack && callbacks.onTakeBack());
      actions.appendChild(takeBackBtn);
    }

    container.appendChild(actions);

    if (state.exchangeMode) {
      const exchangeSection = createElement('div', 'exchange-section');
      const confirmBtn = createElement('button', 'btn btn-warning', t('confirmExchange'));
      confirmBtn.type = 'button';
      confirmBtn.dataset.focusId = 'confirm-exchange';
      confirmBtn.addEventListener('click', () => callbacks.onConfirmExchange && callbacks.onConfirmExchange());
      exchangeSection.appendChild(confirmBtn);

      const cancelBtn = createElement('button', 'btn', t('cancel'));
      cancelBtn.type = 'button';
      cancelBtn.dataset.focusId = 'cancel-exchange';
      cancelBtn.setAttribute('aria-label', t('cancelExchange'));
      cancelBtn.addEventListener('click', () => callbacks.onCancelExchange && callbacks.onCancelExchange());
      exchangeSection.appendChild(cancelBtn);
      container.appendChild(exchangeSection);
    }

    if ((!state.canPlay || locked) && !state.exchangeMode) {
      const playHint = createElement(
        'p',
        'sr-only',
        locked
          ? t('playLockedCpu')
          : t('playLockedInvalid')
      );
      playHint.id = 'play-disabled-reason';
      container.appendChild(playHint);
    }

    if (state.canExchange === false && !state.exchangeMode && !locked) {
      const exchangeHint = createElement(
        'p',
        'control-message',
        t('needBagToExchange', { n: Engine.MIN_BAG_FOR_EXCHANGE })
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
      const hint = createElement('span', 'direction-hint-text', t('across'));
      hint.setAttribute('aria-label', t('playingAcross'));
      container.appendChild(hint);
      return;
    }

    if (direction === 'vertical') {
      const hint = createElement('span', 'direction-hint-text', t('down'));
      hint.setAttribute('aria-label', t('playingDown'));
      container.appendChild(hint);
      return;
    }

    container.appendChild(
      createElement('span', 'direction-hint-text direction-hint-ambiguous', t('placeStraight'))
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
    container.setAttribute('aria-label', t('scorePreview'));

    if (!pendingPlacements || pendingPlacements.length === 0) {
      container.appendChild(createElement('p', 'preview-empty', t('previewEmpty')));
      return;
    }

    if (!direction) {
      container.appendChild(createElement('p', 'preview-error', t('previewCrooked')));
      return;
    }

    const validation =
      cachedValidation && cachedValidation.ok
        ? cachedValidation
        : Engine.validatePlacement(game, pendingPlacements, direction);

    if (!validation.ok) {
      container.appendChild(createElement('p', 'preview-error', te(validation.error)));
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

    container.appendChild(
      createElement('p', 'preview-total', t('previewTotal', { n: score.total }))
    );

    const list = createElement('ul', 'preview-breakdown');
    score.breakdown.forEach((entry) => {
      list.appendChild(createElement('li', null, `${entry.word}: ${entry.score}`));
    });
    container.appendChild(list);
  }

  /**
   * @param {HTMLElement} container
   * @param {object} callbacks
   */
  function renderSetup(container, callbacks) {
    clearElement(container);
    container.classList.add('setup-screen');

    const { card, main, side } = createSetupFrame();

    main.appendChild(createElement('p', 'setup-tagline', t('tagline')));

    const savedGames = callbacks.savedGames || [];

    if (savedGames.length > 0) {
      const savesSection = createElement('div', 'setup-saves');
      savesSection.appendChild(createElement('h2', 'setup-saves-title', t('savedGames')));

      const list = createElement('ul', 'setup-saves-list');
      savedGames.forEach((save) => {
        const item = createElement('li', 'setup-save-item');

        const info = createElement('div', 'setup-save-info');
        info.appendChild(createElement('span', 'setup-save-name', save.name));
        info.appendChild(
          createElement(
            'span',
            'setup-save-status',
            formatSaveStatus(save)
          )
        );
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
        const loadBtn = createElement('button', 'btn btn-primary btn-small', t('load'));
        loadBtn.type = 'button';
        loadBtn.setAttribute('aria-label', t('loadSave', { name: save.name }));
        loadBtn.addEventListener('click', () => callbacks.onLoadSave && callbacks.onLoadSave(save.id));
        actions.appendChild(loadBtn);

        const deleteBtn = createElement('button', 'btn btn-small btn-danger', t('delete'));
        deleteBtn.type = 'button';
        deleteBtn.setAttribute('aria-label', t('deleteSave', { name: save.name }));
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

    const langField = createElement('fieldset', 'setup-fieldset');
    langField.appendChild(createElement('legend', null, t('language')));
    const langRow = createElement('div', 'setup-choice-row');
    const selectedLang = currentLanguage();
    appendTileChoice(langRow, {
      name: 'language',
      value: 'en',
      label: t('english'),
      letter: 'E',
      points: letterPoints('E', 'en'),
      checked: selectedLang === 'en',
    });
    appendTileChoice(langRow, {
      name: 'language',
      value: 'es',
      label: t('spanish'),
      letter: 'Ñ',
      points: letterPoints('Ñ', 'es'),
      checked: selectedLang === 'es',
    });
    langField.appendChild(langRow);
    form.appendChild(langField);
    form.querySelectorAll('input[name="language"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (callbacks.onLanguageChange) callbacks.onLanguageChange(radio.value);
      });
    });

    const modeField = createElement('fieldset', 'setup-fieldset');
    const modeLegend = createElement('legend', null, t('whosPlaying'));
    modeField.appendChild(modeLegend);
    const modeRow = createElement('div', 'setup-choice-row');
    appendTileChoice(modeRow, {
      name: 'game-mode',
      value: 'human',
      label: t('twoPlayers'),
      letter: '2',
      points: '',
      checked: true,
    });
    appendTileChoice(modeRow, {
      name: 'game-mode',
      value: 'computer',
      label: t('playComputer'),
      letter: 'C',
      points: letterPoints('C'),
      checked: false,
    });
    modeField.appendChild(modeRow);
    form.appendChild(modeField);

    const humanFields = createElement('div', 'setup-human-fields');
    const field1 = createElement('div', 'form-field');
    const label1 = createElement('label', null, t('playerN', { n: 1 }));
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
    const label2 = createElement('label', null, t('playerN', { n: 2 }));
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
    const humanNameLabel = createElement('label', null, t('yourName'));
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
    difficultyField.appendChild(createElement('legend', null, t('difficulty')));
    const difficultyRow = createElement('div', 'setup-choice-row');
    [
      { value: 'easy', label: t('easy'), letter: selectedLang === 'es' ? 'F' : 'E' },
      { value: 'medium', label: t('medium'), letter: 'M' },
      { value: 'hard', label: t('hard'), letter: selectedLang === 'es' ? 'D' : 'H' },
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
    coachField.appendChild(createElement('legend', null, t('coach')));
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
    coachWrap.appendChild(document.createTextNode(t('coachMode')));
    coachRow.appendChild(coachWrap);
    coachField.appendChild(coachRow);
    const coachHint = createElement(
      'p',
      'setup-computer-hint',
      t('coachHint')
    );
    coachField.appendChild(coachHint);
    computerFields.appendChild(coachField);

    const seatField = createElement('div', 'form-field');
    const seatLabel = createElement('label', null, t('computerPlaysAs'));
    seatLabel.htmlFor = 'computer-seat';
    seatField.appendChild(seatLabel);
    const seatSelect = createElement('select', 'setup-input');
    seatSelect.id = 'computer-seat';
    seatSelect.name = 'computerSeat';
    const seat2 = createElement('option', null, t('seatYouP1'));
    seat2.value = '1';
    seat2.selected = true;
    const seat1 = createElement('option', null, t('seatYouP2'));
    seat1.value = '0';
    seatSelect.appendChild(seat2);
    seatSelect.appendChild(seat1);
    seatField.appendChild(seatSelect);
    computerFields.appendChild(seatField);

    const computerHint = createElement(
      'p',
      'setup-computer-hint',
      t('computerHint')
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
        const humanName = humanNameInput.value.trim() || t('playerN', { n: 1 });
        const seat = Number(seatSelect.value) === 0 ? 0 : 1;
        const difficulty =
          (form.querySelector('input[name="difficulty"]:checked') || {}).value || 'medium';
        const cpuName = t('computerName');
        const names = seat === 0 ? [cpuName, humanName] : [humanName, cpuName];
        callbacks.onStart(names, {
          mode: 'computer',
          computerSeat: seat,
          difficulty,
          coachMode: Boolean(coachCheck.checked),
          language: currentLanguage(),
        });
        return;
      }

      const p1 = input1.value.trim() || t('playerN', { n: 1 });
      const p2 = input2.value.trim() || t('playerN', { n: 2 });
      callbacks.onStart([p1, p2], { mode: 'human', language: currentLanguage() });
    });

    const startBtn = createElement('button', 'btn btn-primary setup-start', t('startGame'));
    startBtn.type = 'submit';
    form.appendChild(startBtn);

    main.appendChild(form);

    const links = createElement('div', 'setup-links');
    if (callbacks.onImport) {
      const importLabel = createElement('label', 'setup-import-link setup-import-btn', t('resumeSaved'));
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
          callbacks.onImportError && callbacks.onImportError(err.message || t('importFailed'));
        }
      });
      importLabel.appendChild(importInput);
      links.appendChild(importLabel);
    } else {
      links.appendChild(createElement('span'));
    }

    const github = createElement('a', null, t('sourceGithub'));
    github.href = 'https://github.com/stillworkinglate/letterloom';
    links.appendChild(github);
    main.appendChild(links);

    if (callbacks.onImport) {
      const importHint = createElement(
        'p',
        'setup-import-hint',
        t('importHint')
      );
      importHint.id = 'import-save-hint';
      main.appendChild(importHint);
    }

    const helpBtn = createElement('button', 'setup-help-btn', t('howToPlay'));
    helpBtn.type = 'button';
    helpBtn.dataset.focusId = 'setup-help';
    helpBtn.setAttribute('aria-haspopup', 'dialog');
    if (callbacks.onHelp) {
      helpBtn.addEventListener('click', () => callbacks.onHelp());
    } else {
      helpBtn.disabled = true;
    }
    side.appendChild(helpBtn);

    const statsBtn = createElement('button', 'setup-help-btn', t('localStats'));
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

    container.setAttribute('aria-label', t('saveActions'));

    const statusText = callbacks.saveName
      ? callbacks.lastSavedAt
        ? t('savedAs', {
            name: callbacks.saveName,
            time: new Date(callbacks.lastSavedAt).toLocaleTimeString(),
          })
        : t('savedNamed', { name: callbacks.saveName })
      : t('notSavedYet');

    container.appendChild(createElement('p', 'save-status', statusText));

    const actions = createElement('div', 'save-actions');

    const saveBtn = createElement('button', 'btn btn-primary', t('save'));
    saveBtn.type = 'button';
    saveBtn.dataset.focusId = 'save';
    saveBtn.addEventListener('click', () => callbacks.onSave && callbacks.onSave());
    actions.appendChild(saveBtn);

    const newGameBtn = createElement('button', 'btn', t('new'));
    newGameBtn.type = 'button';
    newGameBtn.dataset.focusId = 'new-game';
    newGameBtn.setAttribute('aria-label', t('newGame'));
    newGameBtn.addEventListener('click', () => callbacks.onNewGame && callbacks.onNewGame());
    actions.appendChild(newGameBtn);

    const exportBtn = createElement('button', 'btn btn-secondary', t('export'));
    exportBtn.type = 'button';
    exportBtn.dataset.focusId = 'export';
    exportBtn.setAttribute('aria-label', t('export'));
    exportBtn.addEventListener('click', () => callbacks.onExport && callbacks.onExport());
    actions.appendChild(exportBtn);

    if (callbacks.onHelp) {
      const helpBtn = createElement('button', 'btn', t('help'));
      helpBtn.type = 'button';
      helpBtn.dataset.focusId = 'help';
      helpBtn.setAttribute('aria-label', t('howToPlay'));
      helpBtn.addEventListener('click', () => callbacks.onHelp());
      actions.appendChild(helpBtn);
    }

    if (callbacks.onStats) {
      const statsBtn = createElement('button', 'btn', t('localStats'));
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
    const title = createElement('h2', 'game-over-title', t('gameOver'));
    title.id = 'game-over-title';
    card.appendChild(title);

    const reasonText =
      game.endReason === 'last_tile_played'
        ? t('lastTilePlayed')
        : game.endReason === 'all_passed'
          ? t('allPassed')
          : t('gameEnded');

    card.appendChild(createElement('p', 'game-over-reason', reasonText));

    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    const isTie = sorted.length > 1 && sorted[0].score === sorted[1].score;

    card.appendChild(
      createElement(
        'p',
        'game-over-winner',
        isTie ? t('itsATie') : t('wins', { name: winner.name })
      )
    );

    const list = createElement('ol', 'final-scores');
    sorted.forEach((player, index) => {
      const item = createElement('li', 'final-score-item');
      item.appendChild(createElement('span', 'final-rank', `${index + 1}.`));
      item.appendChild(createElement('span', 'final-name', player.name));
      item.appendChild(createElement('span', 'final-points', t('pts', { n: player.score })));
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
          t('bestPlay', { name, words: (bestPlay.words || []).join(', '), score: bestPlay.score })
        )
      );
    }

    if (Engine && Engine.summarizeHistory) {
      const stats = Engine.summarizeHistory(game);
      card.appendChild(
        createElement(
          'p',
          'game-over-stats-line',
          t('replayStats', {
            plays: stats.plays,
            bingos: stats.bingos,
            exchanges: stats.exchanges,
            passes: stats.passes,
          })
        )
      );
    }

    if (Engine && Engine.getUnseenTiles) {
      const leftover = createElement('div', 'game-over-unseen');
      leftover.appendChild(createElement('h3', 'game-over-section-title', t('leftoverTiles')));
      renderUnseenGrid(
        leftover,
        Engine.getUnseenTiles(game, { revealRacks: true })
      );
      card.appendChild(leftover);
    }

    const actions = createElement('div', 'game-over-actions');
    if (callbacks.onReplay) {
      const replayBtn = createElement('button', 'btn', t('replay'));
      replayBtn.type = 'button';
      replayBtn.setAttribute('aria-haspopup', 'dialog');
      replayBtn.addEventListener('click', () => callbacks.onReplay());
      actions.appendChild(replayBtn);
    }
    if (callbacks.onTakeBack) {
      const takeBackBtn = createElement('button', 'btn', t('takeBack'));
      takeBackBtn.type = 'button';
      takeBackBtn.addEventListener('click', () => callbacks.onTakeBack());
      actions.appendChild(takeBackBtn);
    }
    if (callbacks.onRematch) {
      const rematchBtn = createElement('button', 'btn btn-primary', t('rematch'));
      rematchBtn.type = 'button';
      rematchBtn.addEventListener('click', () => callbacks.onRematch());
      actions.appendChild(rematchBtn);
    }
    const newGameBtn = createElement('button', callbacks.onRematch ? 'btn' : 'btn btn-primary', t('newGame'));
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
    const dictionaryCache = Object.create(null);
    const dictionaryUrls = Object.assign(
      { en: 'data/words.txt', es: 'data/words.es.txt' },
      options.dictionaryUrls || {}
    );
    if (options.dictionaryUrl) dictionaryUrls.en = options.dictionaryUrl;

    function parseWordList(text) {
      return new Set(
        String(text)
          .trim()
          .split('\n')
          .map((w) => w.trim().toUpperCase())
          .filter((w) => w.length >= 2 && w.length <= 15)
      );
    }

    async function loadDictionary(language) {
      const lang = Engine.normalizeLanguage ? Engine.normalizeLanguage(language) : language === 'es' ? 'es' : 'en';
      if (dictionaryCache[lang]) return dictionaryCache[lang];
      const url = dictionaryUrls[lang] || dictionaryUrls.en;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const set = parseWordList(await response.text());
      if (set.size < 1000) throw new Error('Dictionary too small');
      dictionaryCache[lang] = set;
      return set;
    }

    function activateDictionary(set) {
      options.dictionary = set || null;
      localAiIndex = null;
      if (aiWorker && set) {
        aiWorker.postMessage({ type: 'init', words: Array.from(set) });
        aiWorkerReady = false;
      }
    }

    const skipNav = createElement('nav', 'skip-nav');
    skipNav.setAttribute('aria-label', t('skipLinks'));
    const skipRack = createElement('a', 'skip-link', t('skipRack'));
    skipRack.href = '#letterloom-rack';
    const skipControls = createElement('a', 'skip-link', t('skipControls'));
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
    sidebar.setAttribute('aria-label', t('sidebarAria'));
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
          const label = createElement('label', null, config.inputLabel || t('name'));
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
          picker.setAttribute('aria-label', t('chooseLetter'));
          const letters =
            config.letters ||
            (Engine && Engine.getAlphabet ? Engine.getAlphabet(currentLanguage()) : null) ||
            Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
          for (let i = 0; i < letters.length; i += 1) {
            const letter = letters[i];
            const btn = createElement('button', 'btn', letter);
            btn.type = 'button';
            btn.setAttribute('aria-label', t('letterN', { letter }));
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
        const cancelBtn = createElement('button', 'btn', config.cancelLabel || t('cancel'));
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', () => close(config.mode === 'confirm' ? false : null));
        actions.appendChild(cancelBtn);

        if (config.mode !== 'letters' && config.mode !== 'info') {
          const confirmBtn = createElement(
            'button',
            config.danger ? 'btn btn-danger' : 'btn btn-primary',
            config.confirmLabel || t('ok')
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
        title: t('blankTile'),
        message: t('chooseBlank'),
        cancelLabel: t('cancel'),
        letters: Engine.getAlphabet ? Engine.getAlphabet(game && game.language) : null,
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
          finishCoachRequest(null, msg.error || t('hintFailed'));
          return;
        }
        if (msg.type === 'result') {
          finishCoachRequest(msg.result);
        }
        return;
      }
      if (msg.requestId !== thinkRequestId) return;
      if (msg.type === 'error') {
        finishComputerTurn(null, msg.error || t('computerSearchFailed'));
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
            finishComputerTurn(null, t('computerWorkerFailed'));
          } else if (coachBusy) {
            finishCoachRequest(null, t('computerWorkerFailed'));
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
            ? `${failureMessage} ${t('computerPasses', { name: computer.name })}`
            : t('computerCouldNot', { name: computer.name }),
          Boolean(failureMessage)
        );
      } else {
        result = applyComputerAction(action);
        if (!result.ok) {
          result = Engine.passTurn(game);
          showMessage(t('computerInvalid', { name: computer.name }), true);
        } else if (action.type === 'play') {
          showMessage(
            t('computerPlayed', {
              name: computer.name,
              words: (action.words || []).join(', '),
              n: action.score,
            })
          );
        } else if (action.type === 'exchange') {
          showMessage(
            t('computerExchanged', {
              name: computer.name,
              n: (action.tileIds || []).length,
            })
          );
        } else {
          showMessage(t('computerPassed', { name: computer.name }));
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
            finishComputerTurn(null, t('computerUnavailable'));
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
          finishComputerTurn(null, err.message || t('computerSearchFailed'));
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
      showMessage(t('computerThinking', { name: computer.name }));
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
            language: game.language || 'en',
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
        showMessage(t('noHint'), true);
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
          t('hintPlay', { words: (action.words || []).join(', '), n: action.score })
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
          showMessage(t('hintExchangeConfirm', { letters }));
        } else {
          showMessage(t('hintExchange', { letters }));
        }
        return;
      }

      showMessage(t('noLegalPlay'));
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
            finishCoachRequest(null, t('coachUnavailable'));
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
          finishCoachRequest(null, err.message || t('hintFailed'));
        }
      }, 0);
    }

    function sendCoachRequest(kind, snapshot, extras = {}) {
      coachKind = kind;
      coachThen = extras.then || null;
      coachContext = extras.context || null;

      if (!game || !AI) {
        finishCoachRequest(null, t('coachUnavailable'));
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
        showMessage(t('lookingForPlay'));
        refresh();
      } else {
        showMessage(t('checkingBest'));
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
            language: game.language || 'en',
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
      announce(t('rackShuffled'));
      refresh();
    }

    function handlePlay() {
      if (!game || pendingPlacements.length === 0 || isHumanLocked()) return;

      const resolved = resolvePlacementDirection(game, pendingPlacements);
      if (!resolved.direction) {
        showMessage(t('previewCrooked'), true);
        refresh();
        return;
      }

      const previousTakeBack = captureTakeBackPoint();
      const review = beginCoachReview();
      const result = Engine.applyMove(game, pendingPlacements, resolved.direction);
      if (!result.ok) {
        takeBackSnapshot = previousTakeBack;
        showMessage(te(result.error), true);
        refresh();
        return;
      }

      showMessage(
        t('playedFor', {
          n: result.score.total,
          words: result.words.map((w) => w.word).join(', '),
        })
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
        showMessage(t('clearBeforePass'), true);
        return;
      }

      const previousTakeBack = captureTakeBackPoint();
      const review = beginCoachReview();
      const result = Engine.passTurn(game);
      if (!result.ok) {
        takeBackSnapshot = previousTakeBack;
        showMessage(te(result.error), true);
        return;
      }

      showMessage(t('turnPassed'));
      afterHumanCommit(result, review);
    }

    function handleExchangeStart() {
      if (!game || isHumanLocked()) return;
      if (game.bag.length < Engine.MIN_BAG_FOR_EXCHANGE) {
        showMessage(
          t('cannotExchangeBag', { n: Engine.MIN_BAG_FOR_EXCHANGE }),
          true
        );
        return;
      }
      exchangeMode = true;
      exchangeTileIds = [];
      pendingPlacements = [];
      selectedTileId = null;
      showMessage(t('selectExchange'));
      refresh();
    }

    function handleConfirmExchange() {
      if (!game || exchangeTileIds.length === 0) {
        showMessage(t('selectOneExchange'), true);
        return;
      }

      const previousTakeBack = captureTakeBackPoint();
      const review = beginCoachReview();
      const result = Engine.exchangeTiles(game, exchangeTileIds);
      if (!result.ok) {
        takeBackSnapshot = previousTakeBack;
        showMessage(te(result.error), true);
        return;
      }

      showMessage(t('exchangedN', { n: result.exchanged }));
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
        showMessage(t('hintUnavailable'), true);
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
        title: t('takeBackTitle'),
        message: game.mode === 'computer' ? t('takeBackCpu') : t('takeBackHuman'),
        confirmLabel: t('takeBack'),
        cancelLabel: t('cancel'),
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
      showMessage(t('takenBack'));
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
        language: game.language || currentLanguage(),
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
        showMessage(t('couldNotRestore'), true);
        return false;
      }

      cancelComputerTurn();
      clearTakeBack();
      game = snapshot.game;
      Engine.normalizeGameMeta(game);
      if (I18n) I18n.setLanguage(game.language);
      if (dictionaryCache[game.language]) {
        activateDictionary(dictionaryCache[game.language]);
      }
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
        showMessage(t('loadedTurn', { name: activeSaveName, player: current.name }));
      }

      refresh();
      maybeStartComputerTurn();
      return true;
    }

    function loadSavedGame(saveId) {
      if (!Storage) return;
      const snapshot = Storage.getSave(saveId);
      if (!snapshot) {
        showMessage(t('saveNotFound'), true);
        showSetup();
        return;
      }
      const lang =
        snapshot.game && snapshot.game.language
          ? snapshot.game.language
          : 'en';
      loadDictionary(lang)
        .then((set) => {
          activateDictionary(set);
          restoreFromSnapshot(snapshot, saveId);
        })
        .catch((err) => {
          console.warn('Could not load dictionary:', err);
          showSetup(t('dictError'));
        });
    }

    async function deleteSavedGame(saveId, saveName) {
      if (!Storage) return;
      const confirmed = await openModal({
        mode: 'confirm',
        title: t('deleteSaveTitle'),
        message: t('deleteSaveConfirm', { name: saveName || t('thisGame') }),
        confirmLabel: t('delete'),
        cancelLabel: t('cancel'),
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
      if (!result.ok) throw new Error(result.error || t('importFailed'));
      const lang =
        result.snapshot.game && result.snapshot.game.language
          ? result.snapshot.game.language
          : 'en';
      activateDictionary(await loadDictionary(lang));
      restoreFromSnapshot(result.snapshot, result.id);
      showMessage(t('imported', { name: result.snapshot.name }));
    }

    async function handleSave() {
      if (!game || !Storage) return;

      let name = activeSaveName;
      if (!activeSaveId) {
        const defaultName = Storage.buildDefaultName(game);
        const input = await openModal({
          mode: 'prompt',
          title: t('saveGame'),
          message: t('saveNamePrompt'),
          inputLabel: t('saveName'),
          inputDefault: defaultName,
          confirmLabel: t('save'),
          cancelLabel: t('cancel'),
        });
        if (input === null) return;
        name = String(input).trim() || defaultName;
      }

      const result = Storage.saveGame(game, getUiState(), {
        id: activeSaveId,
        name,
      });

      if (!result.ok) {
        showMessage(result.error || t('couldNotSave'), true);
        return;
      }

      activeSaveId = result.id;
      activeSaveName = result.snapshot.name;
      lastSavedAt = result.snapshot.savedAt;
      showMessage(t('gameSaved', { name: activeSaveName }));
      refresh();
    }

    async function handleNewGame() {
      if (game && game.status === 'playing' && !activeSaveId) {
        const confirmed = await openModal({
          mode: 'confirm',
          title: t('startNewTitle'),
          message: t('startNewConfirm'),
          confirmLabel: t('newGame'),
          cancelLabel: t('cancel'),
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
      showMessage(t('saveDownloaded'));
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
      announce(
        winner ? t('announceGameOver', { name: winner.name, n: winner.score }) : t('gameOver'),
        true
      );
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
        ? t('checkingBest')
        : hinting
          ? t('lookingForPlay')
          : thinking
            ? t('computerThinking', { name: game.players[game.currentPlayerIndex].name })
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
            ? t('computerThinking', { name: game.players[game.currentPlayerIndex].name })
            : coachBusy && coachKind === 'review'
              ? t('checkingBest')
              : coachBusy && coachKind === 'hint'
                ? t('lookingForPlay')
            : exchangeMode
              ? t('exchangeMode')
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
              ? t('announceThinking', { name: current.name, n: game.turnNumber })
              : t('announceTurn', { name: current.name, n: game.turnNumber })
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
        title: t('howToPlay'),
        body,
        cancelLabel: t('close'),
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
        title: unseen.revealed ? t('leftoverTiles') : t('unseenTiles'),
        body,
        cancelLabel: t('close'),
      });
    }

    function handleReplay() {
      if (!game) return;
      const body = createElement('div', 'replay-dialog');
      body.id = 'letterloom-replay-body';
      renderReplayLog(body, game);
      openModal({
        mode: 'info',
        title: t('replay'),
        body,
        cancelLabel: t('close'),
      });
    }

    function handleLocalStats() {
      const stats = Storage && Storage.getLocalStats ? Storage.getLocalStats() : { finished: 0, games: [] };
      const body = createElement('div', 'stats-dialog');
      body.id = 'letterloom-stats-body';
      renderLocalStats(body, stats);
      openModal({
        mode: 'info',
        title: t('localStats'),
        body,
        cancelLabel: t('close'),
      });
    }

    function startGame(playerNames, setupOptions = {}) {
      const language = setupOptions.language || currentLanguage();
      if (I18n) I18n.setLanguage(language);
      const begin = (dictionary) => {
      cancelComputerTurn();
      clearTakeBack();
      game = Engine.createGame(playerNames, {
        dictionary,
        language,
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
      showMessage(t('firstGoes', { name: first.name }));
      refresh();
      maybeStartComputerTurn();
      };

      loadDictionary(language)
        .then((set) => {
          activateDictionary(set);
          begin(set);
        })
        .catch((err) => {
          console.warn('Could not load dictionary:', err);
          showSetup(t('dictError'));
        });
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
        onLanguageChange: (lang) => {
          if (I18n) I18n.setLanguage(lang);
          showSetup();
        },
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
      const loading = createElement('p', 'setup-loading', t('loadingDict'));
      loading.setAttribute('role', 'status');
      loading.setAttribute('aria-live', 'polite');
      loadingFrame.main.appendChild(loading);
      setupEl.appendChild(loadingFrame.card);

      const preferred = currentLanguage();
      try {
        const set = await loadDictionary(preferred);
        activateDictionary(set);
        const other = preferred === 'es' ? 'en' : 'es';
        loadDictionary(other).catch(() => {});
      } catch (err) {
        console.warn('Could not load dictionary:', err);
        clearElement(setupEl);
        setupEl.classList.add('setup-screen');
        const errFrame = createSetupFrame();
        errFrame.main.appendChild(createElement('p', 'setup-error', t('dictError')));
        setupEl.appendChild(errFrame.card);
        return;
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