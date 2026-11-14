/**
 * Online play: the relay's room logic and the client that talks to it.
 * Run: node tests/online.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function loadScript(rel) {
  const filename = path.join(root, rel);
  vm.runInThisContext(fs.readFileSync(filename, 'utf8'), { filename });
}

const memory = new Map();
global.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};

const rooms = require('../relay/lib/rooms');
const { createRedisStore, upstashConfigFromEnv, roomKey } = require('../relay/lib/redis-store');

loadScript('js/engine.js');
loadScript('js/online.js');
const Engine = global.LetterloomEngine;
const Online = global.LetterloomOnline;

let passed = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

/** Routes the client's fetch calls into the relay logic, as the Vercel function does. */
function connectClientTo(store) {
  const calls = [];
  global.fetch = async (url, init) => {
    const parsed = new URL(url);
    calls.push(`${init.method} ${parsed.search}`);
    const result = await rooms.handleRoomRequest(
      {
        method: init.method,
        query: Object.fromEntries(parsed.searchParams),
        body: init.body ? JSON.parse(init.body) : undefined,
      },
      store
    );
    return { status: result.status, json: async () => JSON.parse(JSON.stringify(result.body)) };
  };
  Online.configure({ relayUrl: 'https://relay.example/api/room' });
  return calls;
}

function newGame() {
  return Engine.createGame(['Ana', 'Player 2'], { language: 'en', firstPlayerIndex: 0 });
}

test('room codes avoid look-alike characters and normalize what people type', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = rooms.randomCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.strictEqual(Online.normalizeCode(code.toLowerCase()), code);
  }
  assert.strictEqual(rooms.normalizeCode(' abc-234 '), 'ABC234');
  assert.strictEqual(Online.normalizeCode('abc 234'), 'ABC234');
  assert.strictEqual(rooms.normalizeCode('ABC10O'), null, '0, 1, O and I are never used');
  assert.strictEqual(Online.normalizeCode('ABC'), null);
});

test('the relay creates, reads, and updates a room', async () => {
  const store = rooms.createMemoryStore();
  const created = await rooms.handleRoomRequest({ method: 'POST', body: { state: { n: 1 } } }, store);
  assert.strictEqual(created.status, 201);
  const code = created.body.code;

  const read = await rooms.handleRoomRequest({ method: 'GET', query: { code } }, store);
  assert.deepStrictEqual(read.body, { v: 1, state: { n: 1 } });

  const same = await rooms.handleRoomRequest({ method: 'GET', query: { code, v: '1' } }, store);
  assert.deepStrictEqual(same.body, { v: 1, unchanged: true });

  const written = await rooms.handleRoomRequest({ method: 'PUT', query: { code }, body: { v: 1, state: { n: 2 } } }, store);
  assert.deepStrictEqual(written.body, { v: 2 });
});

test('the relay refuses a write based on an old version and returns the current state', async () => {
  const store = rooms.createMemoryStore();
  const { body } = await rooms.handleRoomRequest({ method: 'POST', body: { state: { n: 1 } } }, store);
  await rooms.handleRoomRequest({ method: 'PUT', query: { code: body.code }, body: { v: 1, state: { n: 2 } } }, store);
  const stale = await rooms.handleRoomRequest({ method: 'PUT', query: { code: body.code }, body: { v: 1, state: { n: 99 } } }, store);
  assert.strictEqual(stale.status, 409);
  assert.deepStrictEqual(stale.body, { error: 'conflict', v: 2, state: { n: 2 } });
});

test('the relay rejects bad codes, unknown rooms, and oversized or malformed states', async () => {
  const store = rooms.createMemoryStore();
  const call = (request) => rooms.handleRoomRequest(request, store);
  assert.strictEqual((await call({ method: 'GET', query: { code: 'nope' } })).status, 400);
  assert.strictEqual((await call({ method: 'GET', query: { code: 'ABC234' } })).status, 404);
  assert.strictEqual((await call({ method: 'PUT', query: { code: 'ABC234' }, body: { v: 1, state: {} } })).status, 404);
  assert.strictEqual((await call({ method: 'POST', body: { state: 'text' } })).status, 400);
  assert.strictEqual((await call({ method: 'POST', body: {} })).status, 400);
  const huge = { blob: 'x'.repeat(rooms.MAX_STATE_BYTES) };
  assert.strictEqual((await call({ method: 'POST', body: { state: huge } })).status, 400);
  assert.strictEqual((await call({ method: 'DELETE', query: { code: 'ABC234' } })).status, 405);
});

test('the relay picks another code when one is taken', async () => {
  const store = rooms.createMemoryStore();
  // Always 0 gives AAAAAA; the second create must not overwrite the first.
  const first = await rooms.handleRoomRequest({ method: 'POST', body: { state: { n: 1 } } }, store, { random: () => 0 });
  assert.strictEqual(first.body.code, 'AAAAAA');
  const blocked = await rooms.handleRoomRequest({ method: 'POST', body: { state: { n: 2 } } }, store, { random: () => 0 });
  assert.strictEqual(blocked.status, 503);
  const kept = await rooms.handleRoomRequest({ method: 'GET', query: { code: 'AAAAAA' } }, store);
  assert.deepStrictEqual(kept.body.state, { n: 1 });
});

test('the Redis store sends one atomic script per operation and decodes the replies', async () => {
  const sent = [];
  const replies = [1, [3, '{"n":1}'], [3], [], [1, 4], [0, 5, '{"n":9}'], []];
  const store = createRedisStore(async (command) => {
    sent.push(command);
    return replies.shift();
  });
  assert.strictEqual(await store.create('ABC234', '{"n":1}', 60), true);
  assert.deepStrictEqual(await store.read('ABC234', 0), { v: 3, state: '{"n":1}' });
  assert.deepStrictEqual(await store.read('ABC234', 3), { v: 3 });
  assert.strictEqual(await store.read('ABC234', 0), null);
  assert.deepStrictEqual(await store.write('ABC234', 3, '{"n":2}', 60), { ok: true, v: 4 });
  assert.deepStrictEqual(await store.write('ABC234', 3, '{"n":2}', 60), { ok: false, v: 5, state: '{"n":9}' });
  assert.strictEqual(await store.write('ABC234', 3, '{"n":2}', 60), null);
  for (const command of sent) {
    assert.strictEqual(command[0], 'EVAL');
    assert.strictEqual(command[2], 1);
    assert.strictEqual(command[3], roomKey('ABC234'));
  }
});

test('the relay finds the storage settings under either name Vercel may use', () => {
  assert.deepStrictEqual(upstashConfigFromEnv({ KV_REST_API_URL: 'u', KV_REST_API_TOKEN: 't' }), { url: 'u', token: 't' });
  assert.deepStrictEqual(
    upstashConfigFromEnv({ UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't' }),
    { url: 'u', token: 't' }
  );
  assert.deepStrictEqual(
    upstashConfigFromEnv({ GAMES_KV_REST_API_URL: 'u', GAMES_KV_REST_API_TOKEN: 't', GAMES_KV_REST_API_READ_ONLY_TOKEN: 'r' }),
    { url: 'u', token: 't' },
    'a prefix chosen when connecting the database still works, and the read-only token is not used'
  );
  assert.strictEqual(upstashConfigFromEnv({}), null);
  assert.strictEqual(upstashConfigFromEnv({ KV_REST_API_URL: 'u' }), null);
});

test('the Vercel function answers preflights, sets CORS, and reports missing storage or bad JSON', async () => {
  const saved = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  const handler = require('../relay/api/room');
  const call = async (req) => {
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.code = code; return this; },
      json(payload) { this.payload = payload; return this; },
      end() { return this; },
    };
    await handler(req, res);
    return res;
  };
  const preflight = await call({ method: 'OPTIONS' });
  assert.strictEqual(preflight.code, 204);
  assert.strictEqual(preflight.headers['Access-Control-Allow-Origin'], '*');
  assert.match(preflight.headers['Access-Control-Allow-Methods'], /PUT/);

  const unset = await call({ method: 'GET', query: { code: 'ABC234' } });
  assert.strictEqual(unset.code, 500);
  assert.deepStrictEqual(unset.payload, { error: 'storage_not_configured' });
  assert.strictEqual(unset.headers['Cache-Control'], 'no-store');

  process.env.KV_REST_API_URL = 'https://redis.invalid';
  process.env.KV_REST_API_TOKEN = 'token';
  const badJson = await call({
    method: 'POST',
    query: {},
    get body() {
      throw new Error('Invalid JSON');
    },
  });
  assert.strictEqual(badJson.code, 400);
  if (saved.url) process.env.KV_REST_API_URL = saved.url; else delete process.env.KV_REST_API_URL;
  if (saved.token) process.env.KV_REST_API_TOKEN = saved.token; else delete process.env.KV_REST_API_TOKEN;
});

test('the wire state carries the game without its dictionary and survives the round trip', () => {
  const game = newGame();
  game.dictionary = new Set(['WORD']);
  const state = Online.buildState(game, [true, false]);
  assert.strictEqual(state.game.dictionary, undefined);
  assert.deepStrictEqual(state.joined, [true, false]);
  const back = Online.readState(JSON.parse(JSON.stringify(state)));
  assert.strictEqual(back.game.players[0].rack.length, Engine.RACK_SIZE);
  assert.strictEqual(back.game.bag.length, game.bag.length);
  assert(Buffer.byteLength(JSON.stringify(state)) < rooms.MAX_STATE_BYTES / 4, 'a new game is well under the size limit');
});

test('a state from a newer format, or a damaged one, is refused', () => {
  const state = Online.buildState(newGame(), [true, true]);
  assert.strictEqual(Online.readState(Object.assign({}, state, { format: 2 })), null);
  assert.strictEqual(Online.readState({ format: 1, game: { players: [] } }), null);
  assert.strictEqual(Online.readState(null), null);
});

test('two devices play a turn each through the relay', async () => {
  connectClientTo(rooms.createMemoryStore());
  const host = newGame();
  const { code, v } = await Online.createRoom(Online.buildState(host, [true, false]));
  assert.strictEqual(v, 1);

  // The guest opens the code, takes the second seat, and writes their name.
  const opened = await Online.fetchRoom(code, 0);
  const guestState = Online.readState(opened.state);
  guestState.game.players[1].name = 'Ben';
  guestState.joined[1] = true;
  const joined = await Online.pushRoom(code, opened.v, guestState);
  assert.deepStrictEqual(joined, { ok: true, v: 2 });

  // The host, still on version 1, passes. The relay says the state moved on.
  assert.strictEqual(Engine.passTurn(host).ok, true);
  const refused = await Online.pushRoom(code, 1, Online.buildState(host, [true, false]));
  assert.strictEqual(refused.ok, false);
  assert.strictEqual(refused.v, 2);
  const remote = Online.readState(refused.state);
  assert.strictEqual(Online.progressOf(remote.game), 0, 'only the name changed, so the host keeps its move');
  host.players[1].name = remote.game.players[1].name;
  const sent = await Online.pushRoom(code, refused.v, Online.buildState(host, [true, true]));
  assert.deepStrictEqual(sent, { ok: true, v: 3 });

  // The guest polls, sees the pass, and it is now their turn with their name kept.
  const polled = await Online.fetchRoom(code, 2);
  const guestGame = Online.readState(polled.state).game;
  assert.strictEqual(guestGame.currentPlayerIndex, 1);
  assert.strictEqual(guestGame.players[1].name, 'Ben');
  assert.strictEqual(Online.progressOf(guestGame), 1);
  assert.deepStrictEqual(await Online.fetchRoom(code, polled.v), { v: 3, unchanged: true });
});

test('the client reports a missing room and an unreachable relay differently', async () => {
  connectClientTo(rooms.createMemoryStore());
  assert.deepStrictEqual(await Online.fetchRoom('ABC234', 0), { missing: true });
  assert.deepStrictEqual(await Online.pushRoom('ABC234', 1, { format: 1 }), { ok: false, missing: true });
  global.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(Online.fetchRoom('ABC234', 0), (err) => err.kind === 'network');
  global.fetch = async () => ({ status: 500, json: async () => ({ error: 'storage_not_configured' }) });
  await assert.rejects(Online.fetchRoom('ABC234', 0), (err) => err.kind === 'server');
});

test('online play is off until a relay address is set', () => {
  Online.configure({ relayUrl: '' });
  assert.strictEqual(Online.isConfigured(), false);
  Online.configure({ relayUrl: 'https://relay.example/api/room' });
  assert.strictEqual(Online.isConfigured(), true);
});

test('the device remembers its seat in each game and the name last used', () => {
  memory.clear();
  assert.strictEqual(Online.getRoom('ABC234'), null);
  Online.rememberRoom('ABC234', { seat: 1, names: ['Ana', 'Ben'], myTurn: true, ended: false });
  Online.rememberRoom('ABC234', { myTurn: false });
  const room = Online.getRoom('ABC234');
  assert.strictEqual(room.seat, 1);
  assert.strictEqual(room.myTurn, false);
  assert.deepStrictEqual(room.names, ['Ana', 'Ben']);
  assert.deepStrictEqual(Online.listRooms().map((r) => r.code), ['ABC234']);
  Online.setPlayerName('Ben');
  assert.strictEqual(Online.getPlayerName(), 'Ben');
  Online.forgetRoom('ABC234');
  assert.deepStrictEqual(Online.listRooms(), []);
  assert.strictEqual(Online.getPlayerName(), 'Ben');
});

test('invite links carry the code and are read back from the address', () => {
  const location = { origin: 'https://example.github.io', pathname: '/letterloom/' };
  const url = Online.inviteUrl('ABC234', location);
  assert.strictEqual(url, 'https://example.github.io/letterloom/?join=ABC234');
  assert.strictEqual(Online.codeFromLocation({ search: '?join=abc234' }), 'ABC234');
  assert.strictEqual(Online.codeFromLocation({ search: '?x=1&join=ABC234' }), 'ABC234');
  assert.strictEqual(Online.codeFromLocation({ search: '' }), null);
  assert.strictEqual(Online.codeFromLocation({ search: '?join=bad' }), null);
});

test('it asks the relay often while waiting, and rarely otherwise', () => {
  const minute = 60 * 1000;
  assert.strictEqual(Online.pollDelay({ waiting: true, idleMs: 0 }), 3000);
  assert(Online.pollDelay({ waiting: true, idleMs: 10 * minute }) > 3000);
  assert(Online.pollDelay({ waiting: true, idleMs: 60 * minute }) >= 20000);
  assert(Online.pollDelay({ waiting: false, idleMs: 0 }) >= 20000);
  assert.strictEqual(Online.pollDelay({ unsent: true, waiting: false, idleMs: 0 }), 3000);
});

test('English and Spanish both have every online string the UI uses', () => {
  const i18n = fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
  const keys = new Set(Array.from(ui.matchAll(/'(online[A-Z][A-Za-z]*)'/g), (m) => m[1]));
  keys.delete('onlineName'); // a form field name, not a string
  keys.add('playOnline');
  keys.add('you');
  assert(keys.size > 20);
  for (const key of keys) {
    assert.strictEqual((i18n.match(new RegExp(`^    ${key}:`, 'gm')) || []).length, 2, key);
  }
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    passed += 1;
    console.log(`ok - ${name}`);
  }
  console.log(`\n${passed} passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
