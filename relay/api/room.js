/**
 * Letterloom relay — Vercel function. Holds online games so two phones can
 * play the same board. See ../README.md for setup.
 *
 *   POST /api/room                 { state }      -> { code, v }
 *   GET  /api/room?code=ABC234&v=3                -> { v, state } | { v, unchanged: true }
 *   PUT  /api/room?code=ABC234     { v, state }   -> { v } | 409 { v, state }
 */
'use strict';

const { handleRoomRequest } = require('../lib/rooms');
const { createRedisStore, createUpstashRunner, upstashConfigFromEnv } = require('../lib/redis-store');

let store = null;

function getStore() {
  if (store) return store;
  const config = upstashConfigFromEnv();
  if (!config) return null;
  store = createRedisStore(createUpstashRunner(config.url, config.token));
  return store;
}

function applyHeaders(res) {
  // The game is served from another origin (GitHub Pages). The room code is
  // the only secret and no cookies are involved, so any origin may call this.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async function handler(req, res) {
  applyHeaders(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const rooms = getStore();
  if (!rooms) {
    res.status(500).json({ error: 'storage_not_configured' });
    return;
  }

  let body;
  try {
    // Vercel parses JSON bodies on first access and throws if they are malformed.
    body = req.body;
  } catch (err) {
    res.status(400).json({ error: 'bad_json' });
    return;
  }

  try {
    const result = await handleRoomRequest({ method: req.method, query: req.query, body }, rooms);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Relay error:', err);
    res.status(502).json({ error: 'storage_unavailable' });
  }
};
