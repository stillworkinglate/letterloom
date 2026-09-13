/**
 * Multi-slot game persistence — localStorage library + JSON export/import.
 */
(function (global) {
  'use strict';

  const INDEX_KEY = 'scrabble-saves-index-v2';
  const GAME_KEY_PREFIX = 'scrabble-game-';
  const LEGACY_KEY = 'scrabble-save-v1';
  const STATS_KEY = 'letterloom-stats-v1';
  const PREFS_KEY = 'letterloom-prefs-v1';
  const SAVE_VERSION = 1;
  const INDEX_VERSION = 2;
  const STATS_VERSION = 1;
  const MAX_ARCHIVED_GAMES = 200;

  function isObject(value) {
    return value !== null && typeof value === 'object';
  }

  function generateId() {
    return `save-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function readIndex() {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      if (!raw) return { version: INDEX_VERSION, saves: [] };
      const index = JSON.parse(raw);
      if (!isObject(index) || !Array.isArray(index.saves)) {
        return { version: INDEX_VERSION, saves: [] };
      }
      return index;
    } catch (err) {
      console.warn('Failed to read save index:', err);
      return { version: INDEX_VERSION, saves: [] };
    }
  }

  function writeIndex(index) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  }

  function gameKey(id) {
    return `${GAME_KEY_PREFIX}${id}`;
  }

  function validateSnapshot(snapshot) {
    if (!isObject(snapshot) || snapshot.version !== SAVE_VERSION) return false;
    if (!isObject(snapshot.game)) return false;
    if (!Array.isArray(snapshot.game.players) || snapshot.game.players.length < 2) return false;
    if (!Array.isArray(snapshot.game.board) || snapshot.game.board.length !== 15) return false;
    if (!Array.isArray(snapshot.game.bag)) return false;
    // mode / computerSeat / computerDifficulty are optional so older
    // human-vs-human JSON exports keep loading.
    if (snapshot.game.mode != null && snapshot.game.mode !== 'human' && snapshot.game.mode !== 'computer') {
      return false;
    }
    return true;
  }

  function buildSummary(snapshot) {
    if (!validateSnapshot(snapshot)) return null;

    const game = snapshot.game;
    const current = game.players[game.currentPlayerIndex];

    return {
      id: snapshot.id,
      name: snapshot.name || buildDefaultName(game),
      savedAt: snapshot.savedAt,
      names: game.players.map((p) => p.name).join(' vs '),
      status:
        game.status === 'ended'
          ? 'Game over'
          : `${current.name}'s turn · Turn ${game.turnNumber}`,
      scores: game.players.map((p) => ({ name: p.name, score: p.score })),
      turnNumber: game.turnNumber,
      gameStatus: game.status,
      currentName: current ? current.name : '',
      language: game.language || 'en',
    };
  }

  function buildDefaultName(game) {
    if (!game || !game.players) return 'Letterloom Game';
    const names = game.players.map((p) => p.name).join(' vs ');
    if (game.status === 'ended') return `${names} (finished)`;
    return `${names} · Turn ${game.turnNumber}`;
  }

  function createSnapshot(game, uiState = {}, meta = {}) {
    if (!game) return null;

    if (global.LetterloomEngine && global.LetterloomEngine.normalizeGameMeta) {
      global.LetterloomEngine.normalizeGameMeta(game);
    }

    const { dictionary, ...serializableGame } = game;

    return {
      version: SAVE_VERSION,
      id: meta.id || generateId(),
      name: meta.name || buildDefaultName(game),
      savedAt: new Date().toISOString(),
      game: JSON.parse(JSON.stringify(serializableGame)),
      ui: {
        pendingPlacements: uiState.pendingPlacements || [],
        selectedTileId: uiState.selectedTileId ?? null,
        exchangeMode: Boolean(uiState.exchangeMode),
        exchangeTileIds: uiState.exchangeTileIds || [],
      },
    };
  }

  function migrateLegacySave() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return null;

      const legacy = JSON.parse(raw);
      if (!validateSnapshot(legacy)) {
        localStorage.removeItem(LEGACY_KEY);
        return null;
      }

      const id = generateId();
      const snapshot = {
        ...legacy,
        id,
        name: buildDefaultName(legacy.game),
      };

      localStorage.setItem(gameKey(id), JSON.stringify(snapshot));
      const index = readIndex();
      index.saves.unshift({
        id,
        name: snapshot.name,
        savedAt: snapshot.savedAt,
        playerNames: legacy.game.players.map((p) => p.name),
        turnNumber: legacy.game.turnNumber,
        status: legacy.game.status,
      });
      writeIndex(index);
      localStorage.removeItem(LEGACY_KEY);
      return id;
    } catch (err) {
      console.warn('Legacy save migration failed:', err);
      return null;
    }
  }

  function listSaves() {
    migrateLegacySave();
    const index = readIndex();
    const saves = [];

    for (const entry of index.saves) {
      try {
        const raw = localStorage.getItem(gameKey(entry.id));
        if (!raw) continue;
        const snapshot = JSON.parse(raw);
        const summary = buildSummary(snapshot);
        if (summary) saves.push(summary);
      } catch (err) {
        console.warn('Skipping corrupt save:', entry.id, err);
      }
    }

    saves.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    return saves;
  }

  function getSave(id) {
    if (!id) return null;
    try {
      const raw = localStorage.getItem(gameKey(id));
      if (!raw) return null;
      const snapshot = JSON.parse(raw);
      if (!validateSnapshot(snapshot)) return null;
      if (global.LetterloomEngine && global.LetterloomEngine.normalizeGameMeta) {
        global.LetterloomEngine.normalizeGameMeta(snapshot.game);
      }
      return snapshot;
    } catch (err) {
      console.warn('Failed to load save:', id, err);
      return null;
    }
  }

  function upsertIndexEntry(snapshot) {
    const index = readIndex();
    const meta = {
      id: snapshot.id,
      name: snapshot.name,
      savedAt: snapshot.savedAt,
      playerNames: snapshot.game.players.map((p) => p.name),
      turnNumber: snapshot.game.turnNumber,
      status: snapshot.game.status,
    };

    const existing = index.saves.findIndex((s) => s.id === snapshot.id);
    if (existing >= 0) {
      index.saves[existing] = meta;
    } else {
      index.saves.unshift(meta);
    }

    writeIndex(index);
  }

  function saveGame(game, uiState, options = {}) {
    const snapshot = createSnapshot(game, uiState, {
      id: options.id || null,
      name: options.name || null,
    });

    if (!snapshot) return { ok: false, error: 'Nothing to save.' };

    if (options.id) {
      const existing = getSave(options.id);
      if (existing) {
        snapshot.id = options.id;
        snapshot.name = options.name || existing.name || snapshot.name;
      }
    }

    try {
      localStorage.setItem(gameKey(snapshot.id), JSON.stringify(snapshot));
      upsertIndexEntry(snapshot);
      return { ok: true, id: snapshot.id, snapshot };
    } catch (err) {
      return { ok: false, error: err.message || 'Could not save game.' };
    }
  }

  function deleteSave(id) {
    if (!id) return { ok: false, error: 'No save id.' };

    try {
      localStorage.removeItem(gameKey(id));
      const index = readIndex();
      index.saves = index.saves.filter((s) => s.id !== id);
      writeIndex(index);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || 'Could not delete save.' };
    }
  }

  function downloadSnapshot(snapshot, filename) {
    if (!validateSnapshot(snapshot)) {
      return { ok: false, error: 'Invalid snapshot.' };
    }

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = (snapshot.savedAt || new Date().toISOString()).slice(0, 10);
    const safeName = (snapshot.name || 'letterloom-save')
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/-+/g, '-')
      .slice(0, 40);
    anchor.href = url;
    anchor.download = filename || `${safeName}-${stamp}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  }

  function readSnapshotFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file selected.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const snapshot = JSON.parse(String(reader.result));
          if (!validateSnapshot(snapshot)) {
            reject(new Error('File is not a valid Letterloom save.'));
            return;
          }
          if (global.LetterloomEngine && global.LetterloomEngine.normalizeGameMeta) {
            global.LetterloomEngine.normalizeGameMeta(snapshot.game);
          }
          resolve(snapshot);
        } catch (err) {
          reject(new Error('Could not parse JSON save file.'));
        }
      };
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsText(file);
    });
  }

  function readStatsStore() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return { version: STATS_VERSION, games: [] };
      const store = JSON.parse(raw);
      if (!isObject(store) || !Array.isArray(store.games)) {
        return { version: STATS_VERSION, games: [] };
      }
      return store;
    } catch (err) {
      console.warn('Failed to read local stats:', err);
      return { version: STATS_VERSION, games: [] };
    }
  }

  function writeStatsStore(store) {
    localStorage.setItem(STATS_KEY, JSON.stringify(store));
  }

  function buildFinishedSummary(game, extra = {}) {
    if (!game) return null;
    const Engine = global.LetterloomEngine;
    if (!Engine || !Engine.summarizeHistory) return null;

    const stats = Engine.summarizeHistory(game);
    const fingerprint = Engine.historyFingerprint(game);
    const best = stats.bestPlay;

    return {
      fingerprint,
      endedAt: extra.endedAt || new Date().toISOString(),
      saveId: extra.saveId || null,
      mode: stats.mode,
      computerSeat: stats.computerSeat,
      computerDifficulty: stats.computerDifficulty,
      names: (game.players || []).map((player) => player.name),
      scores: (game.players || []).map((player) => player.score),
      winnerIndex: stats.winnerIndex,
      winnerName: stats.winnerName,
      isTie: stats.isTie,
      endReason: stats.endReason,
      plays: stats.plays,
      bingos: stats.bingos,
      exchanges: stats.exchanges,
      passes: stats.passes,
      bestPlay: best
        ? {
            playerIndex: best.playerIndex,
            playerName: best.playerName || (game.players[best.playerIndex] && game.players[best.playerIndex].name) || '',
            words: best.words || [],
            score: best.score || 0,
          }
        : null,
    };
  }

  function recordFinishedGame(game, extra = {}) {
    if (!game || game.status !== 'ended') {
      return { ok: false, error: 'Game is not finished.' };
    }

    const summary = buildFinishedSummary(game, extra);
    if (!summary) return { ok: false, error: 'Could not summarize game.' };

    const store = readStatsStore();
    if (store.games.some((entry) => entry.fingerprint === summary.fingerprint)) {
      return { ok: true, duplicate: true, summary };
    }

    store.version = STATS_VERSION;
    store.games.unshift(summary);
    store.games = store.games.slice(0, MAX_ARCHIVED_GAMES);

    try {
      writeStatsStore(store);
      return { ok: true, summary };
    } catch (err) {
      return { ok: false, error: err.message || 'Could not record stats.' };
    }
  }

  function collectFinishedSummaries() {
    const byFingerprint = new Map();

    for (const save of listSaves()) {
      if (save.gameStatus !== 'ended') continue;
      const snapshot = getSave(save.id);
      if (!snapshot || !snapshot.game) continue;
      const summary = buildFinishedSummary(snapshot.game, {
        endedAt: snapshot.savedAt,
        saveId: snapshot.id,
      });
      if (summary && !byFingerprint.has(summary.fingerprint)) {
        byFingerprint.set(summary.fingerprint, summary);
      }
    }

    for (const archived of readStatsStore().games) {
      if (archived && archived.fingerprint && !byFingerprint.has(archived.fingerprint)) {
        byFingerprint.set(archived.fingerprint, archived);
      }
    }

    return Array.from(byFingerprint.values()).sort(
      (a, b) => new Date(b.endedAt) - new Date(a.endedAt)
    );
  }

  function getLocalStats() {
    const games = collectFinishedSummaries();
    const vsComputer = { wins: 0, losses: 0, ties: 0 };
    let humanGames = 0;
    let computerGames = 0;
    let bingos = 0;
    let plays = 0;
    let bestPlay = null;

    for (const game of games) {
      bingos += game.bingos || 0;
      plays += game.plays || 0;
      if (game.bestPlay && (!bestPlay || game.bestPlay.score > bestPlay.score)) {
        bestPlay = game.bestPlay;
      }

      if (game.mode === 'computer') {
        computerGames += 1;
        if (game.isTie) {
          vsComputer.ties += 1;
        } else if (Number.isInteger(game.winnerIndex) && game.winnerIndex !== game.computerSeat) {
          vsComputer.wins += 1;
        } else if (Number.isInteger(game.winnerIndex) && game.winnerIndex === game.computerSeat) {
          vsComputer.losses += 1;
        }
      } else {
        humanGames += 1;
      }
    }

    return {
      games,
      finished: games.length,
      humanGames,
      computerGames,
      vsComputer,
      bingos,
      plays,
      bestPlay,
    };
  }

  function importSave(snapshot, name) {
    if (snapshot && snapshot.game && global.LetterloomEngine && global.LetterloomEngine.normalizeGameMeta) {
      global.LetterloomEngine.normalizeGameMeta(snapshot.game);
    }
    const imported = {
      ...snapshot,
      id: generateId(),
      name: name || snapshot.name || buildDefaultName(snapshot.game),
      savedAt: snapshot.savedAt || new Date().toISOString(),
    };

    try {
      localStorage.setItem(gameKey(imported.id), JSON.stringify(imported));
      upsertIndexEntry(imported);
      return { ok: true, id: imported.id, snapshot: imported };
    } catch (err) {
      return { ok: false, error: err.message || 'Could not import save.' };
    }
  }

  function defaultPrefs() {
    return { largePrint: false };
  }

  function getPrefs() {
    try {
      if (typeof localStorage === 'undefined') return defaultPrefs();
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return defaultPrefs();
      const parsed = JSON.parse(raw);
      if (!isObject(parsed)) return defaultPrefs();
      return { largePrint: Boolean(parsed.largePrint) };
    } catch (err) {
      return defaultPrefs();
    }
  }

  function setPrefs(partial) {
    const current = getPrefs();
    const next = {
      largePrint: Boolean(
        isObject(partial) && Object.prototype.hasOwnProperty.call(partial, 'largePrint')
          ? partial.largePrint
          : current.largePrint
      ),
    };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      }
    } catch (err) {
      /* ignore quota / private mode */
    }
    return next;
  }

  const LetterloomStorage = {
    INDEX_KEY,
    GAME_KEY_PREFIX,
    STATS_KEY,
    PREFS_KEY,
    SAVE_VERSION,
    STATS_VERSION,
    generateId,
    createSnapshot,
    validateSnapshot,
    buildDefaultName,
    buildSummary,
    listSaves,
    getSave,
    saveGame,
    deleteSave,
    downloadSnapshot,
    readSnapshotFile,
    importSave,
    migrateLegacySave,
    buildFinishedSummary,
    recordFinishedGame,
    collectFinishedSummaries,
    getLocalStats,
    getPrefs,
    setPrefs,
  };

  global.LetterloomStorage = LetterloomStorage;
})(typeof window !== 'undefined' ? window : globalThis);