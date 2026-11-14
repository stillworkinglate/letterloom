/**
 * Online play — talks to the relay that holds a game two phones share, and
 * remembers on this device which online games it has a seat in.
 *
 * The relay stores one JSON state per room with a version number. A write
 * succeeds only if the version is still the one this device last saw.
 */
(function (global) {
  'use strict';

  const ROOMS_KEY = 'letterloom-online-v1';
  const STATE_FORMAT = 1;
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CODE_LENGTH = 6;
  const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
  const REQUEST_TIMEOUT_MS = 10000;
  const MAX_REMEMBERED_ROOMS = 20;

  let relayUrl = '';

  function configure(options) {
    relayUrl = options && typeof options.relayUrl === 'string' ? options.relayUrl.trim() : '';
  }

  function isConfigured() {
    return Boolean(relayUrl) && typeof global.fetch === 'function';
  }

  function normalizeCode(value) {
    const code = String(value == null ? '' : value)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    return CODE_PATTERN.test(code) ? code : null;
  }

  /** kind: 'network' (could not reach the relay) | 'server' (it answered with an error) */
  function onlineError(kind, detail) {
    const err = new Error(detail || kind);
    err.kind = kind;
    return err;
  }

  async function request(method, params, body) {
    if (!isConfigured()) throw onlineError('server', 'Online play is not set up.');
    const query = params
      ? `?${Object.keys(params)
          .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
          .join('&')}`
      : '';
    const controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
    const timer = controller ? global.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    let response;
    try {
      response = await global.fetch(relayUrl + query, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal: controller ? controller.signal : undefined,
      });
    } catch (err) {
      throw onlineError('network', err && err.message);
    } finally {
      if (timer) global.clearTimeout(timer);
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch (err) {
      payload = null;
    }
    return { status: response.status, payload: payload || {} };
  }

  /** @returns {Promise<{ code: string, v: number }>} */
  async function createRoom(state) {
    const { status, payload } = await request('POST', null, { state });
    if (status !== 201 || !payload.code) throw onlineError('server', payload.error);
    return { code: payload.code, v: payload.v };
  }

  /** @returns {Promise<{ missing: true } | { v: number, unchanged: true } | { v: number, state: object }>} */
  async function fetchRoom(code, knownVersion) {
    const { status, payload } = await request('GET', { code, v: knownVersion || 0 });
    if (status === 404) return { missing: true };
    if (status !== 200) throw onlineError('server', payload.error);
    if (payload.unchanged) return { v: payload.v, unchanged: true };
    return { v: payload.v, state: payload.state };
  }

  /** @returns {Promise<{ ok: true, v: number } | { ok: false, missing: true } | { ok: false, v: number, state: object }>} */
  async function pushRoom(code, version, state) {
    const { status, payload } = await request('PUT', { code }, { v: version, state });
    if (status === 200) return { ok: true, v: payload.v };
    if (status === 404) return { ok: false, missing: true };
    if (status === 409) return { ok: false, v: payload.v, state: payload.state };
    throw onlineError('server', payload.error);
  }

  /** What goes over the wire: the game without its dictionary, plus who has joined. */
  function buildState(game, joined) {
    const { dictionary, ...serializable } = game;
    return {
      format: STATE_FORMAT,
      joined: [Boolean(joined && joined[0]), Boolean(joined && joined[1])],
      game: JSON.parse(JSON.stringify(serializable)),
    };
  }

  /** Returns the state if this version of the game can play it, else null. */
  function readState(state) {
    if (!state || typeof state !== 'object' || state.format !== STATE_FORMAT) return null;
    const game = state.game;
    if (!game || typeof game !== 'object') return null;
    if (!Array.isArray(game.players) || game.players.length !== 2) return null;
    if (!Array.isArray(game.board) || !Array.isArray(game.bag)) return null;
    const joined = Array.isArray(state.joined) ? state.joined : [];
    return { format: STATE_FORMAT, joined: [Boolean(joined[0]), Boolean(joined[1])], game };
  }

  /** How far a game has advanced. Two states with the same progress differ only in names. */
  function progressOf(game) {
    return game && Array.isArray(game.history) ? game.history.length : 0;
  }

  /**
   * How long to wait before asking the relay again. Quick while waiting on the
   * other player, slower once they have been away a while, slowest on your own
   * turn (when only their name can change).
   */
  function pollDelay(info) {
    if (info.unsent) return 3000;
    if (!info.waiting) return 20000;
    if (info.idleMs < 5 * 60 * 1000) return 3000;
    if (info.idleMs < 30 * 60 * 1000) return 8000;
    return 20000;
  }

  function readStore() {
    try {
      const raw = global.localStorage.getItem(ROOMS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object' || !parsed.rooms || typeof parsed.rooms !== 'object') {
        return { name: '', rooms: {} };
      }
      return { name: typeof parsed.name === 'string' ? parsed.name : '', rooms: parsed.rooms };
    } catch (err) {
      return { name: '', rooms: {} };
    }
  }

  function writeStore(store) {
    try {
      global.localStorage.setItem(ROOMS_KEY, JSON.stringify(store));
    } catch (err) {
      /* private mode or full storage: the game still plays, it just is not listed later */
    }
  }

  /** The seat this device holds in a room, or null if it has never joined it. */
  function getRoom(code) {
    const room = readStore().rooms[code];
    return room && Number.isInteger(room.seat) ? Object.assign({ code }, room) : null;
  }

  function rememberRoom(code, info) {
    const store = readStore();
    store.rooms[code] = Object.assign({}, store.rooms[code], info, { updatedAt: new Date().toISOString() });
    const codes = Object.keys(store.rooms).sort(
      (a, b) => new Date(store.rooms[b].updatedAt) - new Date(store.rooms[a].updatedAt)
    );
    codes.slice(MAX_REMEMBERED_ROOMS).forEach((old) => delete store.rooms[old]);
    writeStore(store);
  }

  function forgetRoom(code) {
    const store = readStore();
    delete store.rooms[code];
    writeStore(store);
  }

  /** Newest first. */
  function listRooms() {
    const rooms = readStore().rooms;
    return Object.keys(rooms)
      .filter((code) => Number.isInteger(rooms[code].seat))
      .map((code) => Object.assign({ code }, rooms[code]))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  /** The name this player last used online, to prefill the next game. */
  function getPlayerName() {
    return readStore().name;
  }

  function setPlayerName(name) {
    const store = readStore();
    store.name = String(name || '').slice(0, 20);
    writeStore(store);
  }

  function inviteUrl(code, location) {
    const loc = location || global.location;
    return `${loc.origin}${loc.pathname}?join=${code}`;
  }

  function codeFromLocation(location) {
    const loc = location || global.location;
    const match = /[?&]join=([^&#]*)/.exec((loc && loc.search) || '');
    return match ? normalizeCode(decodeURIComponent(match[1])) : null;
  }

  global.LetterloomOnline = {
    ROOMS_KEY,
    STATE_FORMAT,
    CODE_LENGTH,
    configure,
    isConfigured,
    normalizeCode,
    createRoom,
    fetchRoom,
    pushRoom,
    buildState,
    readState,
    progressOf,
    pollDelay,
    getRoom,
    rememberRoom,
    forgetRoom,
    listRooms,
    getPlayerName,
    setPlayerName,
    inviteUrl,
    codeFromLocation,
  };
})(typeof window !== 'undefined' ? window : globalThis);
