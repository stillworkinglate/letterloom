/**
 * Multi-slot game persistence — localStorage library + JSON export/import.
 */
(function (global) {
  'use strict';

  const INDEX_KEY = 'scrabble-saves-index-v2';
  const GAME_KEY_PREFIX = 'scrabble-game-';
  const LEGACY_KEY = 'scrabble-save-v1';
  const SAVE_VERSION = 1;
  const INDEX_VERSION = 2;

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
      return validateSnapshot(snapshot) ? snapshot : null;
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
          resolve(snapshot);
        } catch (err) {
          reject(new Error('Could not parse JSON save file.'));
        }
      };
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsText(file);
    });
  }

  function importSave(snapshot, name) {
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

  const LetterloomStorage = {
    INDEX_KEY,
    GAME_KEY_PREFIX,
    SAVE_VERSION,
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
  };

  global.LetterloomStorage = LetterloomStorage;
})(typeof window !== 'undefined' ? window : globalThis);