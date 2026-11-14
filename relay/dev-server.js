/**
 * Local stand-in for the Vercel relay, for trying online play on one machine.
 * Rooms live in memory and vanish when it stops.
 *
 *   node relay/dev-server.js          # http://localhost:8787/api/room
 */
'use strict';

const http = require('http');
const { handleRoomRequest, createMemoryStore, MAX_STATE_BYTES } = require('./lib/rooms');

const PORT = Number(process.env.PORT) || 8787;
const store = createMemoryStore();

function readBody(req) {
  return new Promise((resolve) => {
    let text = '';
    req.on('data', (chunk) => {
      text += chunk;
      if (text.length > MAX_STATE_BYTES * 2) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      res.end();
      return;
    }
    if (url.pathname !== '/api/room') {
      res.writeHead(404, headers);
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    const result = await handleRoomRequest(
      { method: req.method, query: Object.fromEntries(url.searchParams), body: await readBody(req) },
      store
    );
    res.writeHead(result.status, headers);
    res.end(JSON.stringify(result.body));
  })
  .listen(PORT, () => {
    console.log(`Letterloom dev relay on http://localhost:${PORT}/api/room`);
  });
