/**
 * Letterloom relay — the room logic, independent of where rooms are stored.
 *
 * A room is one online game: a version number and the game state as an opaque
 * JSON string. Phones read it, and write it back only if nobody else wrote in
 * between (compare-and-swap on the version).
 *
 * A store implements:
 *   create(code, state, ttl)            -> true | false (code already taken)
 *   read(code, knownVersion)            -> null | { v, state? }  (state omitted when v === knownVersion)
 *   write(code, expectedVersion, state, ttl) -> null | { ok: true, v } | { ok: false, v, state }
 */
'use strict';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
const MAX_STATE_BYTES = 200 * 1024;
const ROOM_TTL_SECONDS = 30 * 24 * 60 * 60;
const CREATE_ATTEMPTS = 5;

function randomCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

function normalizeCode(value) {
  const code = String(value == null ? '' : value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}

function reply(status, body) {
  return { status, body };
}

/** Accepts the state as an object, returns it as a JSON string or null. */
function encodeState(state) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return null;
  const text = JSON.stringify(state);
  if (Buffer.byteLength(text, 'utf8') > MAX_STATE_BYTES) return null;
  return text;
}

/**
 * @param {{ method: string, query: object, body: any }} request
 * @param {object} store
 * @param {{ random?: () => number }} [options]
 * @returns {Promise<{ status: number, body: object }>}
 */
async function handleRoomRequest(request, store, options = {}) {
  const method = String(request.method || 'GET').toUpperCase();
  const query = request.query || {};
  const body = request.body && typeof request.body === 'object' ? request.body : {};

  if (method === 'POST') {
    const state = encodeState(body.state);
    if (!state) return reply(400, { error: 'bad_state' });
    for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
      const code = randomCode(options.random);
      if (await store.create(code, state, ROOM_TTL_SECONDS)) {
        return reply(201, { code, v: 1 });
      }
    }
    return reply(503, { error: 'no_code_available' });
  }

  const code = normalizeCode(query.code);
  if (!code) return reply(400, { error: 'bad_code' });

  if (method === 'GET') {
    const known = Number(query.v);
    const room = await store.read(code, Number.isInteger(known) ? known : 0);
    if (!room) return reply(404, { error: 'not_found' });
    if (room.state === undefined) return reply(200, { v: room.v, unchanged: true });
    return reply(200, { v: room.v, state: JSON.parse(room.state) });
  }

  if (method === 'PUT') {
    const expected = Number(body.v);
    if (!Number.isInteger(expected) || expected < 1) return reply(400, { error: 'bad_version' });
    const state = encodeState(body.state);
    if (!state) return reply(400, { error: 'bad_state' });
    const result = await store.write(code, expected, state, ROOM_TTL_SECONDS);
    if (!result) return reply(404, { error: 'not_found' });
    if (result.ok) return reply(200, { v: result.v });
    return reply(409, { error: 'conflict', v: result.v, state: JSON.parse(result.state) });
  }

  return reply(405, { error: 'method_not_allowed' });
}

/** In-memory store for tests and the local dev server. */
function createMemoryStore() {
  const rooms = new Map();
  return {
    async create(code, state) {
      if (rooms.has(code)) return false;
      rooms.set(code, { v: 1, state });
      return true;
    },
    async read(code, knownVersion) {
      const room = rooms.get(code);
      if (!room) return null;
      return room.v === knownVersion ? { v: room.v } : { v: room.v, state: room.state };
    },
    async write(code, expectedVersion, state) {
      const room = rooms.get(code);
      if (!room) return null;
      if (room.v !== expectedVersion) return { ok: false, v: room.v, state: room.state };
      room.v += 1;
      room.state = state;
      return { ok: true, v: room.v };
    },
  };
}

module.exports = {
  CODE_ALPHABET,
  CODE_LENGTH,
  MAX_STATE_BYTES,
  ROOM_TTL_SECONDS,
  randomCode,
  normalizeCode,
  handleRoomRequest,
  createMemoryStore,
};
