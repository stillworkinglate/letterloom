/**
 * Letterloom game UI — vanilla JS render layer and app controller.
 * Attach to window for plain script tag usage.
 */
(function (global) {
  'use strict';

  const Engine = global.LetterloomEngine;
  const Storage = global.LetterloomStorage;

  const PREMIUM_LABELS = {
    TW: 'TW',
    DW: 'DW',
    TL: 'TL',
    DL: 'DL',
  };

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
   * @param {{ direction?: string, onCellClick?: Function }} [options]
   */
  function renderBoard(container, game, pendingPlacements, options = {}) {
    clearElement(container);
    container.classList.add('letterloom-board');
    container.setAttribute('role', 'grid');
    container.setAttribute('aria-label', 'Letterloom board');

    const pendingMap = new Map(
      (pendingPlacements || []).map((p) => [`${p.row},${p.col}`, p])
    );

    for (let row = 0; row < Engine.BOARD_SIZE; row += 1) {
      for (let col = 0; col < Engine.BOARD_SIZE; col += 1) {
        const cell = createElement('button', 'board-cell');
        cell.type = 'button';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.setAttribute('aria-label', `Row ${row + 1}, column ${col + 1}`);

        const premium = Engine.getPremiumAt(row, col);
        if (premium) {
          cell.classList.add(`premium-${premium.toLowerCase()}`);
          const label = createElement('span', 'premium-label', PREMIUM_LABELS[premium]);
          cell.appendChild(label);
        }

        if (row === Engine.CENTER_ROW && col === Engine.CENTER_COL && !game.board[row][col]) {
          const star = createElement('span', 'center-star', '★');
          cell.appendChild(star);
        }

        const placed = game.board[row][col];
        const pending = pendingMap.get(`${row},${col}`);

        if (placed) {
          cell.classList.add('occupied');
          cell.appendChild(renderTileFace(placed, { small: true }));
        } else if (pending) {
          cell.classList.add('pending-cell');
          const rackTile = getRackTile(game, pending.tileId);
          if (rackTile) {
            const displayTile = {
              ...rackTile,
              letter: pending.letter || rackTile.letter,
            };
            cell.appendChild(renderTileFace(displayTile, { pending: true, small: true }));
          }
        }

        if (options.onCellClick) {
          cell.addEventListener('click', () => {
            options.onCellClick(row, col);
          });
        }

        container.appendChild(cell);
      }
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

    const player = game.players[game.currentPlayerIndex];
    const selected = new Set(selectedTileIds || []);
    const pendingIds = new Set(options.pendingTileIds || []);

    const slots = createElement('div', 'rack-slots');
    for (let i = 0; i < Engine.RACK_SIZE; i += 1) {
      const slot = createElement('div', 'rack-slot');
      const tile = player.rack[i];

      if (tile && !pendingIds.has(tile.id)) {
        const btn = createElement('button', 'rack-tile');
        btn.type = 'button';
        btn.dataset.tileId = String(tile.id);
        btn.setAttribute('aria-label', `Tile ${formatTileLetter(tile) || 'blank'}`);
        if (selected.has(tile.id)) btn.classList.add('selected');
        if (options.exchangeMode) btn.classList.add('exchange-mode');

        btn.appendChild(renderTileFace(tile, { selected: selected.has(tile.id) }));

        if (options.onTileClick) {
          btn.addEventListener('click', () => options.onTileClick(tile.id));
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
    container.appendChild(label);
  }

  /**
   * @param {HTMLElement} container
   * @param {object} game
   */
  function renderStatus(container, game) {
    clearElement(container);
    container.classList.add('status-panel');

    const current = game.players[game.currentPlayerIndex];
    const turnEl = createElement('div', 'status-turn');
    turnEl.appendChild(createElement('h2', 'status-heading', 'Current Turn'));
    turnEl.appendChild(createElement('p', 'status-current-player', current.name));

    if (game.status === 'playing') {
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
      if (index === game.currentPlayerIndex && game.status === 'playing') {
        item.classList.add('active-player');
      }
      item.appendChild(createElement('span', 'score-name', player.name));
      item.appendChild(createElement('span', 'score-value', String(player.score)));
      list.appendChild(item);
    });

    scoresEl.appendChild(list);
    container.appendChild(scoresEl);

    const bagEl = createElement('div', 'status-bag');
    bagEl.appendChild(createElement('h3', 'status-subheading', 'Tile Bag'));
    bagEl.appendChild(
      createElement('p', 'bag-count', `${Engine.getRemainingBagCount(game)} tiles remaining`)
    );
    container.appendChild(bagEl);

    if (game.lastMove) {
      const lastEl = createElement('div', 'status-last-move');
      lastEl.appendChild(createElement('h3', 'status-subheading', 'Last Move'));
      const lm = game.lastMove;
      const mover = game.players[lm.playerIndex];

      if (lm.pass) {
        lastEl.appendChild(createElement('p', null, `${mover.name} passed.`));
      } else if (lm.exchange) {
        lastEl.appendChild(
          createElement('p', null, `${mover.name} exchanged ${lm.exchange} tile(s).`)
        );
      } else if (lm.words) {
        const detail = createElement('p', 'last-move-detail');
        detail.textContent = `${mover.name} played ${lm.words.join(', ')} for ${lm.score} pts`;
        lastEl.appendChild(detail);
        if (lm.breakdown && lm.breakdown.length > 1) {
          const breakdown = createElement('ul', 'score-breakdown');
          lm.breakdown.forEach((entry) => {
            breakdown.appendChild(
              createElement('li', null, `${entry.word}: ${entry.score}`)
            );
          });
          lastEl.appendChild(breakdown);
        }
      }

      container.appendChild(lastEl);
    }
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

    const playBtn = createElement('button', 'btn btn-primary', 'Play Word');
    playBtn.type = 'button';
    playBtn.disabled = !state.canPlay;
    playBtn.addEventListener('click', () => callbacks.onPlay && callbacks.onPlay());
    actions.appendChild(playBtn);

    const clearBtn = createElement('button', 'btn', 'Clear');
    clearBtn.type = 'button';
    clearBtn.addEventListener('click', () => callbacks.onClear && callbacks.onClear());
    actions.appendChild(clearBtn);

    const passBtn = createElement('button', 'btn', 'Pass');
    passBtn.type = 'button';
    passBtn.addEventListener('click', () => callbacks.onPass && callbacks.onPass());
    actions.appendChild(passBtn);

    const shuffleBtn = createElement('button', 'btn', 'Shuffle Rack');
    shuffleBtn.type = 'button';
    shuffleBtn.addEventListener('click', () => callbacks.onShuffle && callbacks.onShuffle());
    actions.appendChild(shuffleBtn);

    container.appendChild(actions);

    const exchangeSection = createElement('div', 'exchange-section');
    if (state.exchangeMode) {
      const confirmBtn = createElement('button', 'btn btn-warning', 'Confirm Exchange');
      confirmBtn.type = 'button';
      confirmBtn.addEventListener('click', () => callbacks.onConfirmExchange && callbacks.onConfirmExchange());
      exchangeSection.appendChild(confirmBtn);

      const cancelBtn = createElement('button', 'btn', 'Cancel Exchange');
      cancelBtn.type = 'button';
      cancelBtn.addEventListener('click', () => callbacks.onCancelExchange && callbacks.onCancelExchange());
      exchangeSection.appendChild(cancelBtn);
    } else {
      const exchangeBtn = createElement('button', 'btn', 'Exchange');
      exchangeBtn.type = 'button';
      exchangeBtn.disabled = !state.canExchange;
      exchangeBtn.title =
        state.bagCount < Engine.MIN_BAG_FOR_EXCHANGE
          ? `Need at least ${Engine.MIN_BAG_FOR_EXCHANGE} tiles in the bag`
          : '';
      exchangeBtn.addEventListener('click', () => callbacks.onExchange && callbacks.onExchange());
      exchangeSection.appendChild(exchangeBtn);
    }

    container.appendChild(exchangeSection);

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
      container.appendChild(createElement('span', 'direction-hint-text', '↔ Across'));
      return;
    }

    if (direction === 'vertical') {
      container.appendChild(createElement('span', 'direction-hint-text', '↕ Down'));
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

    container.appendChild(createElement('h3', 'preview-heading', 'Score Preview'));
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

    const card = createElement('div', 'setup-card');
    card.appendChild(createElement('h1', 'setup-title', 'Letterloom'));
    card.appendChild(createElement('p', 'setup-tagline', 'Weave words from your letter tiles.'));

    const savedGames = callbacks.savedGames || [];

    if (savedGames.length > 0) {
      const savesSection = createElement('div', 'setup-saves');
      savesSection.appendChild(createElement('h2', 'setup-saves-title', 'Saved Games'));

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
        loadBtn.addEventListener('click', () => callbacks.onLoadSave && callbacks.onLoadSave(save.id));
        actions.appendChild(loadBtn);

        const deleteBtn = createElement('button', 'btn btn-small btn-danger', 'Delete');
        deleteBtn.type = 'button';
        deleteBtn.addEventListener('click', () => {
          if (global.confirm(`Delete save "${save.name}"?`)) {
            callbacks.onDeleteSave && callbacks.onDeleteSave(save.id);
          }
        });
        actions.appendChild(deleteBtn);

        item.appendChild(actions);
        list.appendChild(item);
      });

      savesSection.appendChild(list);
      card.appendChild(savesSection);
      card.appendChild(createElement('hr', 'setup-divider'));
    }

    card.appendChild(createElement('p', 'setup-subtitle', 'Or start a new game:'));

    const form = createElement('form', 'setup-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const p1 = form.querySelector('#player1-name').value.trim() || 'Player 1';
      const p2 = form.querySelector('#player2-name').value.trim() || 'Player 2';
      callbacks.onStart([p1, p2]);
    });

    const field1 = createElement('div', 'form-field');
    field1.appendChild(createElement('label', null, 'Player 1'));
    const input1 = createElement('input', 'setup-input');
    input1.type = 'text';
    input1.id = 'player1-name';
    input1.placeholder = 'Player 1';
    input1.maxLength = 20;
    input1.required = true;
    field1.appendChild(input1);
    form.appendChild(field1);

    const field2 = createElement('div', 'form-field');
    field2.appendChild(createElement('label', null, 'Player 2'));
    const input2 = createElement('input', 'setup-input');
    input2.type = 'text';
    input2.id = 'player2-name';
    input2.placeholder = 'Player 2';
    input2.maxLength = 20;
    input2.required = true;
    field2.appendChild(input2);
    form.appendChild(field2);

    const startBtn = createElement('button', 'btn btn-primary setup-start', 'Start Game');
    startBtn.type = 'submit';
    form.appendChild(startBtn);

    card.appendChild(form);

    if (callbacks.onImport) {
      const importSection = createElement('div', 'setup-import');
      const importLabel = createElement('label', 'btn btn-secondary setup-import-btn', 'Import Save File');
      const importInput = createElement('input', 'setup-import-input');
      importInput.type = 'file';
      importInput.accept = '.json,application/json';
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
      importSection.appendChild(importLabel);
      importSection.appendChild(
        createElement('p', 'setup-import-hint', 'Load a .json save from the saves/ folder or a download.')
      );
      card.appendChild(importSection);
    }

    container.appendChild(card);

    // Skip autofocus on coarse-pointer / touch devices so the on-screen
    // keyboard does not open and jump the viewport on phones.
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
    saveBtn.addEventListener('click', () => callbacks.onSave && callbacks.onSave());
    actions.appendChild(saveBtn);

    const newGameBtn = createElement('button', 'btn', 'New Game');
    newGameBtn.type = 'button';
    newGameBtn.addEventListener('click', () => callbacks.onNewGame && callbacks.onNewGame());
    actions.appendChild(newGameBtn);

    const exportBtn = createElement('button', 'btn btn-secondary', 'Export JSON');
    exportBtn.type = 'button';
    exportBtn.addEventListener('click', () => callbacks.onExport && callbacks.onExport());
    actions.appendChild(exportBtn);

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
    card.appendChild(createElement('h2', 'game-over-title', 'Game Over'));

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

    const actions = createElement('div', 'game-over-actions');
    const newGameBtn = createElement('button', 'btn btn-primary', 'New Game');
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

    const setupEl = createElement('div', 'app-setup');
    const gameEl = createElement('div', 'app-game hidden');
    const overlayEl = createElement('div', 'app-overlay hidden');

    // board-scroll wraps the grid so mobile CSS can overflow-scroll the board
    // without fighting renderBoard (which clears/reuses boardContainer).
    const boardScroll = createElement('div', 'board-scroll');
    const boardContainer = createElement('div', 'board-container');
    boardScroll.appendChild(boardContainer);
    const directionContainer = createElement('div', 'direction-container');
    const rackContainer = createElement('div', 'rack-container');
    const statusContainer = createElement('div', 'status-container');
    const previewContainer = createElement('div', 'preview-container');
    const controlsContainer = createElement('div', 'controls-container');
    const saveContainer = createElement('div', 'save-container');
    const messageEl = createElement('div', 'app-message hidden');
    let activeSaveId = null;
    let activeSaveName = null;
    let lastSavedAt = null;

    const mainArea = createElement('div', 'game-main');
    const boardArea = createElement('div', 'board-area');
    boardArea.appendChild(boardScroll);
    boardArea.appendChild(directionContainer);
    boardArea.appendChild(rackContainer);
    mainArea.appendChild(boardArea);

    const sidebar = createElement('div', 'game-sidebar');
    sidebar.appendChild(statusContainer);
    sidebar.appendChild(previewContainer);
    sidebar.appendChild(controlsContainer);
    sidebar.appendChild(saveContainer);
    mainArea.appendChild(sidebar);

    gameEl.appendChild(mainArea);
    gameEl.appendChild(messageEl);

    root.appendChild(setupEl);
    root.appendChild(gameEl);
    root.appendChild(overlayEl);

    function showMessage(text, isError = false) {
      message = text;
      if (text) {
        messageEl.textContent = text;
        messageEl.classList.remove('hidden');
        messageEl.classList.toggle('error', isError);
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
      let letter = '';
      while (!letter) {
        const input = global.prompt('Blank tile — enter a letter (A–Z):', 'A');
        if (input === null) return null;
        const upper = input.trim().toUpperCase();
        if (upper.length === 1 && upper >= 'A' && upper <= 'Z') {
          letter = upper;
        }
      }
      return letter;
    }

    function handleBoardClick(row, col) {
      if (!game || game.status !== 'playing' || exchangeMode) return;

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
        const letter = promptBlankLetter();
        if (!letter) return;
        placement.letter = letter;
      }

      pendingPlacements.push(placement);
      selectedTileId = null;
      showMessage('');
      refresh();
    }

    function handleRackClick(tileId) {
      if (!game || game.status !== 'playing') return;

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
      if (!game || exchangeMode) return;
      const player = game.players[game.currentPlayerIndex];
      Engine.shuffleInPlace(player.rack);
      refresh();
    }

    function handlePlay() {
      if (!game || pendingPlacements.length === 0) return;

      const resolved = resolvePlacementDirection(game, pendingPlacements);
      if (!resolved.direction) {
        showMessage('Tiles must form a straight line — across or down.', true);
        refresh();
        return;
      }

      const result = Engine.applyMove(game, pendingPlacements, resolved.direction);
      if (!result.ok) {
        showMessage(result.error, true);
        refresh();
        return;
      }

      showMessage(
        `Played for ${result.score.total} points: ${result.words.map((w) => w.word).join(', ')}`
      );
      resetTurnState();

      if (result.endResult && result.endResult.ended) {
        showGameOver();
      }

      refresh();
    }

    function handleClear() {
      pendingPlacements = [];
      selectedTileId = null;
      showMessage('');
      refresh();
    }

    function handlePass() {
      if (!game) return;
      if (pendingPlacements.length > 0) {
        showMessage('Clear your placements before passing.', true);
        return;
      }

      const result = Engine.passTurn(game);
      if (!result.ok) {
        showMessage(result.error, true);
        return;
      }

      resetTurnState();
      showMessage('Turn passed.');

      if (result.endResult && result.endResult.ended) {
        showGameOver();
      }

      refresh();
    }

    function handleExchangeStart() {
      if (!game) return;
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

      const result = Engine.exchangeTiles(game, exchangeTileIds);
      if (!result.ok) {
        showMessage(result.error, true);
        return;
      }

      resetTurnState();
      showMessage(`Exchanged ${result.exchanged} tile(s).`);
      refresh();
    }

    function handleCancelExchange() {
      exchangeMode = false;
      exchangeTileIds = [];
      showMessage('');
      refresh();
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

      game = snapshot.game;
      game.dictionary = options.dictionary || null;

      const ui = snapshot.ui || {};
      pendingPlacements = ui.pendingPlacements || [];
      selectedTileId = ui.selectedTileId ?? null;
      exchangeMode = Boolean(ui.exchangeMode);
      exchangeTileIds = ui.exchangeTileIds || [];

      activeSaveId = saveId || snapshot.id || null;
      activeSaveName = snapshot.name || Storage.buildDefaultName(game);
      lastSavedAt = snapshot.savedAt;

      setupEl.classList.add('hidden');
      gameEl.classList.remove('hidden');
      overlayEl.classList.add('hidden');

      if (game.status === 'ended') {
        showGameOver();
      } else {
        const current = game.players[game.currentPlayerIndex];
        showMessage(`Loaded "${activeSaveName}" — ${current.name}'s turn.`);
      }

      refresh();
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

    function deleteSavedGame(saveId) {
      if (!Storage) return;
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

    function handleSave() {
      if (!game || !Storage) return;

      let name = activeSaveName;
      if (!activeSaveId) {
        const defaultName = Storage.buildDefaultName(game);
        const input = global.prompt('Name this save:', defaultName);
        if (input === null) return;
        name = input.trim() || defaultName;
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

    function handleNewGame() {
      if (
        game &&
        game.status === 'playing' &&
        !activeSaveId &&
        !global.confirm('Start a new game without saving?')
      ) {
        return;
      }

      game = null;
      activeSaveId = null;
      activeSaveName = null;
      lastSavedAt = null;
      resetTurnState();
      overlayEl.classList.add('hidden');
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
      renderGameOver(overlayEl, game, {
        onNewGame: handleNewGame,
      });
      overlayEl.classList.remove('hidden');
    }

    function refresh() {
      if (!game) return;

      const resolved = resolvePlacementDirection(game, pendingPlacements);
      const direction = resolved.direction;

      renderBoard(boardContainer, game, pendingPlacements, {
        onCellClick: handleBoardClick,
      });

      renderRack(
        rackContainer,
        game,
        exchangeMode ? exchangeTileIds : selectedTileId !== null ? [selectedTileId] : [],
        {
          exchangeMode,
          pendingTileIds: pendingPlacements.map((p) => p.tileId),
          onTileClick: handleRackClick,
        }
      );

      renderStatus(statusContainer, game);
      renderDirectionHint(directionContainer, direction, pendingPlacements.length);

      const validation =
        pendingPlacements.length > 0 && direction
          ? resolved.validation || Engine.validatePlacement(game, pendingPlacements, direction)
          : { ok: false };

      renderScorePreview(previewContainer, game, pendingPlacements, direction, validation);

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
        },
        {
          exchangeMode,
          canPlay: validation.ok === true,
          canExchange: game.bag.length >= Engine.MIN_BAG_FOR_EXCHANGE && !exchangeMode,
          bagCount: game.bag.length,
          message: exchangeMode ? 'Exchange mode — select tiles from your rack.' : '',
        }
      );

      renderSavePanel(saveContainer, {
        saveName: activeSaveName,
        lastSavedAt,
        onSave: handleSave,
        onNewGame: handleNewGame,
        onExport: handleExport,
      });

      persistState();
    }

    function startGame(playerNames) {
      const dictionary = options.dictionary || null;
      game = Engine.createGame(playerNames, { dictionary });
      activeSaveId = null;
      activeSaveName = null;
      lastSavedAt = null;
      resetTurnState();
      setupEl.classList.add('hidden');
      gameEl.classList.remove('hidden');
      overlayEl.classList.add('hidden');
      const first = game.players[game.currentPlayerIndex];
      showMessage(`${first.name} goes first — the first word must cover the center ★.`);
      refresh();
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
        savedGames,
      };
    }

    async function showSetup(importError) {
      setupEl.classList.remove('hidden');
      gameEl.classList.add('hidden');
      clearElement(setupEl);
      setupEl.appendChild(createElement('p', 'setup-loading', 'Loading dictionary…'));

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
          const errCard = createElement('div', 'setup-card');
          errCard.appendChild(createElement('h1', 'setup-title', 'Letterloom'));
          errCard.appendChild(
            createElement(
              'p',
              'setup-error',
              'Could not load the word dictionary. Start a local server from the project folder (see README).'
            )
          );
          setupEl.appendChild(errCard);
          return;
        }
      }

      clearElement(setupEl);
      renderSetup(setupEl, buildSetupCallbacks());

      if (importError) {
        const card = setupEl.querySelector('.setup-card');
        if (card) {
          const err = createElement('p', 'setup-error', importError);
          card.insertBefore(err, card.children[1] || null);
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
    mount,
  };

  global.LetterloomUI = LetterloomUI;
})(typeof window !== 'undefined' ? window : globalThis);